/**
 * Bloom's Ladder — per-unit content coverage report
 * Run: npx tsx scripts/ladder-coverage.ts
 * Output: docs/reports/ladder-coverage-2026-04.md
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SUPABASE_URL             = 'https://jsxdttvioxodkiydowod.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OUT = 'docs/reports/ladder-coverage-2026-04.md';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Types ────────────────────────────────────────────────────────────────────

interface Unit { id: string; unit_name: string; unit_order: number }
interface Row  { unit_id: string; bloom_level: number; count: number }

// ── Query helpers ─────────────────────────────────────────────────────────────

async function getUnits(): Promise<Unit[]> {
  const { data, error } = await supabase
    .from('units')
    .select('id, unit_name, unit_order')
    .order('unit_order');
  if (error) throw error;
  return data as Unit[];
}

async function getCoverage(): Promise<Row[]> {
  // Raw SQL via Supabase RPC would be cleanest, but RPC requires a stored
  // function. Instead we pull all questions joined through nodes and aggregate
  // in JS — small dataset so performance is fine.
  const { data: nodes, error: nErr } = await supabase
    .from('knowledge_graph_nodes')
    .select('id, unit_id');
  if (nErr) throw nErr;

  const { data: questions, error: qErr } = await supabase
    .from('questions')
    .select('concept_id, bloom_level');
  if (qErr) throw qErr;

  // Build concept → unit_id map
  const conceptUnit: Record<string, string> = {};
  for (const n of (nodes ?? [])) conceptUnit[n.id] = n.unit_id;

  // Aggregate counts
  const counts: Record<string, number> = {};
  for (const q of (questions ?? [])) {
    const unitId = conceptUnit[q.concept_id];
    if (!unitId) continue;
    const key = `${unitId}::${q.bloom_level}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return Object.entries(counts).map(([key, count]) => {
    const [unit_id, bloom_str] = key.split('::');
    return { unit_id, bloom_level: Number(bloom_str), count };
  });
}

// ── Render ───────────────────────────────────────────────────────────────────

function renderTable(units: Unit[], coverage: Row[]): string {
  const LEVELS = [1, 2, 3, 4, 5];
  const LABELS: Record<number, string> = {
    1: 'Recall', 2: 'Understand', 3: 'Apply', 4: 'Analyse', 5: 'Evaluate',
  };

  // Index coverage by unit
  const idx: Record<string, Record<number, number>> = {};
  for (const r of coverage) {
    if (!idx[r.unit_id]) idx[r.unit_id] = {};
    idx[r.unit_id][r.bloom_level] = r.count;
  }

  const header = ['Unit', ...LEVELS.map(l => `L${l} — ${LABELS[l]}`)].join(' | ');
  const sep    = ['---', ...LEVELS.map(() => '---')].join(' | ');

  const rows = units.map(u => {
    const cells = LEVELS.map(l => {
      const n = idx[u.id]?.[l] ?? 0;
      return n > 0 ? String(n) : '—';
    });
    return [u.unit_name, ...cells].join(' | ');
  });

  // Summary row — totals per level
  const totals = LEVELS.map(l => {
    const n = units.reduce((sum, u) => sum + (idx[u.id]?.[l] ?? 0), 0);
    return n > 0 ? String(n) : '—';
  });
  const totalRow = ['**Total**', ...totals].join(' | ');

  // Per-unit ladder preview (which rungs are available)
  const ladderPreviews = units.map(u => {
    const rungs = LEVELS.filter(l => (idx[u.id]?.[l] ?? 0) > 0);
    const label = rungs.length > 0
      ? `L${rungs.join(', L')} — ${rungs.length}-rung ladder`
      : 'No questions — ladder card hidden';
    const contiguous = rungs.every((r, i) => i === 0 || r === rungs[i - 1] + 1);
    const note = rungs.length > 1 && !contiguous ? ' ⚠ non-contiguous' : '';
    return `- **${u.unit_name}**: ${label}${note}`;
  });

  const totalQuestions = coverage.reduce((s, r) => s + r.count, 0);

  return [
    '# Bloom\'s Ladder — Content Coverage Report',
    '',
    `Generated: ${new Date().toISOString().split('T')[0]}  `,
    `Course: WJEC GCSE Physics Double Award  `,
    `Total questions: ${totalQuestions}`,
    '',
    '## Questions per unit per Bloom\'s level',
    '',
    `| ${header} |`,
    `| ${sep} |`,
    ...rows.map(r => `| ${r} |`),
    `| ${totalRow} |`,
    '',
    '## Ladder preview per unit',
    '',
    '> What each unit\'s ladder will look like. ⚠ = non-contiguous rungs (gap',
    '> explanation shown on transition screens).',
    '',
    ...ladderPreviews,
    '',
    '## Content authoring priorities',
    '',
    '> Units where thin rung coverage will exhaust questions before threshold',
    '> can be reached (fewer than ~8 questions at a rung = exhaustion risk at',
    '> 4-hour exclusion window with a student making 5+ attempts).',
    '',
    ...units.map(u => {
      const thinRungs = LEVELS.filter(l => {
        const n = idx[u.id]?.[l] ?? 0;
        return n > 0 && n < 8;
      });
      if (thinRungs.length === 0) return `- **${u.unit_name}**: all populated rungs adequate`;
      return `- **${u.unit_name}**: thin at ${thinRungs.map(l => `L${l} (${idx[u.id][l]}q)`).join(', ')}`;
    }),
  ].join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching coverage data…');
  const [units, coverage] = await Promise.all([getUnits(), getCoverage()]);

  if (units.length === 0) {
    console.error('No units found — check DB connection and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const report = renderTable(units, coverage);
  writeFileSync(OUT, report, 'utf8');
  console.log(`Report written to ${OUT}`);
  console.log(`Units: ${units.length} | Total questions: ${coverage.reduce((s, r) => s + r.count, 0)}`);
}

main().catch(err => { console.error(err); process.exit(1); });
