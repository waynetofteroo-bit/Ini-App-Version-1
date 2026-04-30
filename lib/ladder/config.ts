export const LADDER_CONFIG = {
  passThreshold: 0.60,
  evaluationWindow: 5,
  minimumAttemptsForEval: 3,
  recentAttemptExclusionHours: 4,
  // Essay attempts are marked correct in answer_log when
  // score >= round(maxMarks * essayPassThreshold). Applied at write time
  // in /api/mark/extended for ladder-mode essays; non-ladder essays use 50%.
  essayPassThreshold: 0.60,
} as const;

export const BLOOM_LABELS: Record<number, string> = {
  1: 'Recall',
  2: 'Understand',
  3: 'Apply',
  4: 'Analyse',
  5: 'Evaluate',
};
