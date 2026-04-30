import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getOrInitState, evaluateThreshold, advanceRung } from '@/lib/ladder/state-engine';
import { LADDER_CONFIG } from '@/lib/ladder/config';

// ── Mock builder ──────────────────────────────────────────────────────────────
//
// Creates a minimal Supabase-shaped client where each table maps to a fixed
// return value. The chain is thenable so `await supabase.from().select()...`
// resolves correctly. insert() and update() are tracked via vi.fn().

interface InsertCall { table: string; values: unknown }
interface UpdateCall { table: string; values: unknown }

function mockDb(tableData: Record<string, { data: unknown }>) {
  const insertCalls: InsertCall[] = [];
  const updateCalls: UpdateCall[] = [];

  function makeChain(table: string): any {
    const result = tableData[table] ?? { data: null };
    const chain: any = {
      then: (r: any, j: any) => Promise.resolve(result).then(r, j),
      catch: (j: any)       => Promise.resolve(result).catch(j),
      select:      () => chain,
      eq:          () => chain,
      in:          () => chain,
      order:       () => chain,
      limit:       () => chain,
      maybeSingle: () => Promise.resolve(result),
      single:      () => Promise.resolve(result),
      insert: vi.fn((vals: unknown) => {
        insertCalls.push({ table, values: vals });
        return Promise.resolve({ error: null });
      }),
      update: vi.fn((vals: unknown) => {
        updateCalls.push({ table, values: vals });
        return chain;
      }),
    };
    return chain;
  }

  const client = {
    from: vi.fn((table: string) => makeChain(table)),
    _insertCalls: insertCalls,
    _updateCalls: updateCalls,
  };
  return client as any;
}

// ── getOrInitState ────────────────────────────────────────────────────────────

describe('getOrInitState', () => {
  it('returns empty state when availableRungs is empty', async () => {
    const db = mockDb({});
    const result = await getOrInitState('u1', 'unit1', [], db);
    expect(result).toMatchObject({ currentRung: 1, highestRungPassed: 0, reachedTop: false });
  });

  it('creates a new row for a brand-new student at the lowest available rung', async () => {
    const db = mockDb({ ladder_state: { data: null } });
    const result = await getOrInitState('u1', 'unit1', [1, 2, 3], db);
    expect(result.currentRung).toBe(1);
    expect(result.highestRungPassed).toBe(0);
    expect(db._insertCalls).toHaveLength(1);
    expect((db._insertCalls[0].values as any).current_rung).toBe(1);
  });

  it('starts at L2 when unit has no L1 content', async () => {
    const db = mockDb({ ladder_state: { data: null } });
    const result = await getOrInitState('u1', 'unit1', [2, 3, 4], db);
    expect(result.currentRung).toBe(2);
    expect((db._insertCalls[0].values as any).current_rung).toBe(2);
  });

  it('returns existing state unchanged when current_rung is in availableRungs', async () => {
    const db = mockDb({
      ladder_state: {
        data: { current_rung: 3, highest_rung_passed: 2, last_attempt_at: null },
      },
    });
    const result = await getOrInitState('u1', 'unit1', [1, 2, 3, 4], db);
    expect(result.currentRung).toBe(3);
    expect(result.highestRungPassed).toBe(2);
    expect(db._updateCalls).toHaveLength(0);
  });

  it('marks reachedTop when highest_rung_passed >= topRung', async () => {
    const db = mockDb({
      ladder_state: {
        data: { current_rung: 3, highest_rung_passed: 3, last_attempt_at: null },
      },
    });
    const result = await getOrInitState('u1', 'unit1', [1, 2, 3], db);
    expect(result.reachedTop).toBe(true);
  });

  describe('self-healing: current_rung not in availableRungs', () => {
    it('advances to the next populated rung above the orphaned rung', async () => {
      // current_rung=3 but L3 content was removed; L5 is next populated above L3
      const db = mockDb({
        ladder_state: {
          data: { current_rung: 3, highest_rung_passed: 1, last_attempt_at: null },
        },
      });
      const result = await getOrInitState('u1', 'unit1', [1, 5], db);
      expect(result.currentRung).toBe(5);
      expect(db._updateCalls).toHaveLength(1);
      expect((db._updateCalls[0].values as any).current_rung).toBe(5);
    });

    it('falls back to max available rung when no rung exists above the orphaned rung', async () => {
      // current_rung=4 but only L1, L2 remain (content above L2 removed)
      const db = mockDb({
        ladder_state: {
          data: { current_rung: 4, highest_rung_passed: 2, last_attempt_at: null },
        },
      });
      const result = await getOrInitState('u1', 'unit1', [1, 2], db);
      expect(result.currentRung).toBe(2);
      expect(db._updateCalls).toHaveLength(1);
    });
  });
});

// ── evaluateThreshold ─────────────────────────────────────────────────────────

describe('evaluateThreshold', () => {
  const concepts = [{ id: 'c1' }];
  const questions = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }, { id: 'q4' }, { id: 'q5' }];

  function dbWithAttempts(attempts: Array<{ correct: boolean }>) {
    return mockDb({
      knowledge_graph_nodes: { data: concepts },
      questions:             { data: questions },
      answer_log:            { data: attempts },
    });
  }

  it('returns no-pass when fewer than minimumAttemptsForEval attempts', async () => {
    // 2 correct out of 2 (100%) — not evaluated because < 3 attempts
    const db = dbWithAttempts([{ correct: true }, { correct: true }]);
    const result = await evaluateThreshold('u1', 'unit1', 'course1', 1, db);
    expect(result.passed).toBe(false);
    expect(result.isStalled).toBe(false);
    expect(result.attempts).toBe(2);
  });

  it('passes at exactly minimumAttemptsForEval with ≥ passThreshold correct', async () => {
    // 3 attempts: 2 correct = 67% ≥ 60%
    const db = dbWithAttempts([{ correct: true }, { correct: true }, { correct: false }]);
    const result = await evaluateThreshold('u1', 'unit1', 'course1', 1, db);
    expect(result.passed).toBe(true);
    expect(result.correctCount).toBe(2);
  });

  it('does not pass when 3 attempts but below passThreshold', async () => {
    // 3 attempts: 1 correct = 33% < 60%
    const db = dbWithAttempts([{ correct: true }, { correct: false }, { correct: false }]);
    const result = await evaluateThreshold('u1', 'unit1', 'course1', 1, db);
    expect(result.passed).toBe(false);
    expect(result.isStalled).toBe(false); // stall only kicks in at evaluationWindow (5)
  });

  it('passes at full evaluationWindow with ≥ passThreshold correct', async () => {
    // 5 attempts: 3 correct = 60% = passThreshold exactly
    const db = dbWithAttempts([
      { correct: true }, { correct: true }, { correct: true },
      { correct: false }, { correct: false },
    ]);
    const result = await evaluateThreshold('u1', 'unit1', 'course1', 1, db);
    expect(result.passed).toBe(true);
  });

  it('detects stall: evaluationWindow attempts with < passThreshold correct', async () => {
    // 5 attempts: 2 correct = 40% < 60%
    const db = dbWithAttempts([
      { correct: true }, { correct: false }, { correct: true },
      { correct: false }, { correct: false },
    ]);
    const result = await evaluateThreshold('u1', 'unit1', 'course1', 1, db);
    expect(result.isStalled).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.attempts).toBe(5);
    expect(result.correctCount).toBe(2);
  });

  it('returns zero counts when unit has no concepts', async () => {
    const db = mockDb({
      knowledge_graph_nodes: { data: [] },
      questions:             { data: [] },
      answer_log:            { data: [] },
    });
    const result = await evaluateThreshold('u1', 'unit1', 'course1', 1, db);
    expect(result.attempts).toBe(0);
    expect(result.passed).toBe(false);
  });
});

// ── advanceRung ───────────────────────────────────────────────────────────────

describe('advanceRung', () => {
  it('advances to the next populated rung in a contiguous ladder', async () => {
    const db = mockDb({ ladder_state: { data: {} } });
    const result = await advanceRung('u1', 'unit1', 2, [1, 2, 3, 4], db);
    expect(result.newRung).toBe(3);
    expect(result.reachedTop).toBe(false);
  });

  it('skips unpopulated rungs and advances to next populated rung', async () => {
    // L1, L3, L5 — passing L1 skips L2 and advances to L3
    const db = mockDb({ ladder_state: { data: {} } });
    const result = await advanceRung('u1', 'unit1', 1, [1, 3, 5], db);
    expect(result.newRung).toBe(3);
    expect(result.reachedTop).toBe(false);
  });

  it('skips again on second non-contiguous gap (L3 → L5)', async () => {
    const db = mockDb({ ladder_state: { data: {} } });
    const result = await advanceRung('u1', 'unit1', 3, [1, 3, 5], db);
    expect(result.newRung).toBe(5);
    expect(result.reachedTop).toBe(false);
  });

  it('returns reachedTop when passing the highest rung', async () => {
    const db = mockDb({ ladder_state: { data: {} } });
    const result = await advanceRung('u1', 'unit1', 4, [1, 2, 3, 4], db);
    expect(result.newRung).toBeNull();
    expect(result.reachedTop).toBe(true);
  });

  it('returns reachedTop for a single-rung ladder after passing L1', async () => {
    const db = mockDb({ ladder_state: { data: {} } });
    const result = await advanceRung('u1', 'unit1', 1, [1], db);
    expect(result.newRung).toBeNull();
    expect(result.reachedTop).toBe(true);
  });

  it('writes highest_rung_passed = currentRung in the update', async () => {
    const db = mockDb({ ladder_state: { data: {} } });
    await advanceRung('u1', 'unit1', 3, [1, 3, 5], db);
    expect(db._updateCalls).toHaveLength(1);
    expect((db._updateCalls[0].values as any).highest_rung_passed).toBe(3);
    expect((db._updateCalls[0].values as any).current_rung).toBe(5);
  });
});

// ── Config-driven behaviour ───────────────────────────────────────────────────

describe('threshold config is respected', () => {
  it('pass threshold matches LADDER_CONFIG.passThreshold', () => {
    expect(LADDER_CONFIG.passThreshold).toBe(0.60);
  });

  it('evaluation window matches LADDER_CONFIG.evaluationWindow', () => {
    expect(LADDER_CONFIG.evaluationWindow).toBe(5);
  });

  it('minimum attempts matches LADDER_CONFIG.minimumAttemptsForEval', () => {
    expect(LADDER_CONFIG.minimumAttemptsForEval).toBe(3);
  });
});
