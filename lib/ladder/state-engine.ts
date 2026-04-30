import { SupabaseClient } from '@supabase/supabase-js';
import { LADDER_CONFIG } from './config';

export interface LadderState {
  currentRung: number;
  highestRungPassed: number;
  lastAttemptAt: string | null;
  reachedTop: boolean;
}

export interface ThresholdResult {
  attempts: number;
  correctCount: number;
  passed: boolean;
  isStalled: boolean;
}

export interface AdvanceResult {
  newRung: number | null;
  reachedTop: boolean;
}

// Read-only: returns current state without creating a row. Returns null if the
// student has never entered this unit's ladder. Self-heals current_rung if
// content has been removed (same logic as getOrInitState).
// Used by the unit hub to distinguish "never started" (null) from "in progress".
export async function readLadderState(
  userId: string,
  unitId: string,
  availableRungs: number[],
  supabase: SupabaseClient
): Promise<LadderState | null> {
  if (availableRungs.length === 0) return null;

  const { data: row } = await supabase
    .from('ladder_state')
    .select('current_rung, highest_rung_passed, last_attempt_at')
    .eq('user_id', userId)
    .eq('unit_id', unitId)
    .maybeSingle();

  if (!row) return null;

  let currentRung = row.current_rung;
  if (!availableRungs.includes(currentRung)) {
    const nextRung =
      availableRungs.find(r => r > currentRung) ??
      availableRungs[availableRungs.length - 1];
    currentRung = nextRung;
    await supabase
      .from('ladder_state')
      .update({ current_rung: currentRung, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('unit_id', unitId);
  }

  const topRung = availableRungs[availableRungs.length - 1];
  return {
    currentRung,
    highestRungPassed: row.highest_rung_passed,
    lastAttemptAt: row.last_attempt_at,
    reachedTop: row.highest_rung_passed >= topRung,
  };
}

// Returns current state, creating a row if none exists. Called only from the
// ladder session routes — never from the unit hub — so that row creation
// signals "student has entered the ladder" rather than "student viewed the hub."
export async function getOrInitState(
  userId: string,
  unitId: string,
  availableRungs: number[],
  supabase: SupabaseClient
): Promise<LadderState> {
  if (availableRungs.length === 0) {
    return { currentRung: 1, highestRungPassed: 0, lastAttemptAt: null, reachedTop: false };
  }

  const existing = await readLadderState(userId, unitId, availableRungs, supabase);
  if (existing) return existing;

  const startRung = availableRungs[0];
  await supabase.from('ladder_state').insert({
    user_id: userId,
    unit_id: unitId,
    current_rung: startRung,
    highest_rung_passed: 0,
  });
  return { currentRung: startRung, highestRungPassed: 0, lastAttemptAt: null, reachedTop: false };
}

// Evaluates pass/stall status using the last N ladder-mode attempts at the
// given rung across the unit. WHERE session_mode = 'ladder' — NULL rows
// excluded by SQL equality semantics (NULL = 'ladder' → UNKNOWN → false).
// For essays (bloom_level 4-5), answer_log.correct was set at write time
// using LADDER_CONFIG.essayPassThreshold in /api/mark/extended.
export async function evaluateThreshold(
  userId: string,
  unitId: string,
  courseId: string,
  rung: number,
  supabase: SupabaseClient
): Promise<ThresholdResult> {
  const { data: nodes } = await supabase
    .from('knowledge_graph_nodes')
    .select('id')
    .eq('unit_id', unitId);

  const conceptIds = (nodes ?? []).map((n: any) => n.id as string);
  if (!conceptIds.length) return { attempts: 0, correctCount: 0, passed: false, isStalled: false };

  const { data: questions } = await supabase
    .from('questions')
    .select('id')
    .in('concept_id', conceptIds)
    .eq('bloom_level', rung);

  const questionIds = (questions ?? []).map((q: any) => q.id as string);
  if (!questionIds.length) return { attempts: 0, correctCount: 0, passed: false, isStalled: false };

  const { data: attempts } = await supabase
    .from('answer_log')
    .select('correct')
    .eq('user_id', userId)
    .eq('user_course_id', courseId)
    .eq('session_mode', 'ladder')
    .in('question_id', questionIds)
    .order('created_at', { ascending: false })
    .limit(LADDER_CONFIG.evaluationWindow);

  const attemptCount = (attempts ?? []).length;
  const correctCount = (attempts ?? []).filter((a: any) => a.correct).length;
  const passRate = attemptCount > 0 ? correctCount / attemptCount : 0;

  const passed =
    attemptCount >= LADDER_CONFIG.minimumAttemptsForEval &&
    passRate >= LADDER_CONFIG.passThreshold;

  const isStalled =
    attemptCount >= LADDER_CONFIG.evaluationWindow &&
    passRate < LADDER_CONFIG.passThreshold;

  return { attempts: attemptCount, correctCount, passed, isStalled };
}

// Advances current_rung to the next populated rung above currentRung.
// Returns null for newRung when the student has passed the top.
export async function advanceRung(
  userId: string,
  unitId: string,
  currentRung: number,
  availableRungs: number[],
  supabase: SupabaseClient
): Promise<AdvanceResult> {
  const nextRung = availableRungs.find(r => r > currentRung) ?? null;

  await supabase
    .from('ladder_state')
    .update({
      current_rung: nextRung ?? currentRung,
      highest_rung_passed: currentRung,
      last_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('unit_id', unitId);

  return { newRung: nextRung, reachedTop: nextRung === null };
}
