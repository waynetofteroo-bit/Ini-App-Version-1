export interface SM2State {
  easiness: number;
  interval: number;
  repetitions: number;
}

export function calcNextInterval(state: SM2State, quality: number): SM2State {
  const q = quality;
  let { easiness, interval, repetitions } = state;

  if (q < 2) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easiness);
    repetitions += 1;
  }

  easiness = Math.max(1.3, easiness + 0.1 - (3 - q) * (0.08 + (3 - q) * 0.02));

  return { easiness, interval, repetitions };
}

export function blendIntervalDrivers(
  retentionInterval: number,
  urgencyInterval: number,
  examDaysLeft: number
): number {
  const urgencyWeight = Math.min(1, Math.max(0, 1 - examDaysLeft / 90));
  return Math.round(
    (1 - urgencyWeight) * retentionInterval + urgencyWeight * urgencyInterval
  );
}

export function calcBlendedScore(nextReviewAt: Date, examDate: Date): number {
  const now = Date.now();
  const daysOverdue = Math.max(0, (now - nextReviewAt.getTime()) / 86400000);
  const examDaysLeft = Math.max(1, (examDate.getTime() - now) / 86400000);
  const urgency = 1 - Math.min(1, examDaysLeft / 90);
  return daysOverdue * 0.6 + urgency * 0.4;
}
