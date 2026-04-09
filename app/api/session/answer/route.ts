import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { calcNextInterval, blendIntervalDrivers, calcBlendedScore } from '@/lib/sm2';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { question_id, answer_idx, correct, response_ms, user_course_id } = body as {
    question_id: string;
    answer_idx: number;
    correct: boolean;
    response_ms: number;
    user_course_id: string;
  };

  // 1. Write answer_log
  const { error: logErr } = await supabase.from('answer_log').insert({
    user_id: user.id,
    question_id,
    user_course_id,
    correct,
    response_ms,
    bloom_demonstrated: null,
    gaps: [],
  });
  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 });

  // 2. Fetch question's concept_id
  const { data: question } = await supabase
    .from('questions')
    .select('concept_id')
    .eq('id', question_id)
    .single();

  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

  // 3. Fetch SM-2 state
  const { data: sm2Row } = await supabase
    .from('sm2_queue')
    .select('id, easiness, interval_days, repetitions')
    .eq('user_id', user.id)
    .eq('concept_id', question.concept_id)
    .eq('user_course_id', user_course_id)
    .single();

  if (!sm2Row) return NextResponse.json({ ok: true });

  // 4. Run SM-2
  const quality = correct ? 2 : 0;
  const next = calcNextInterval(
    { easiness: sm2Row.easiness, interval: sm2Row.interval_days, repetitions: sm2Row.repetitions },
    quality
  );

  // 5. Blend with exam urgency
  const { data: uc } = await supabase
    .from('user_courses')
    .select('exam_date')
    .eq('id', user_course_id)
    .single();

  const examDate = uc ? new Date(uc.exam_date) : new Date(Date.now() + 90 * 86400000);
  const examDaysLeft = Math.max(1, (examDate.getTime() - Date.now()) / 86400000);
  const urgencyInterval = Math.max(1, Math.round(examDaysLeft / 10));
  const blendedInterval = blendIntervalDrivers(next.interval, urgencyInterval, examDaysLeft);

  const nextReviewAt = new Date(Date.now() + blendedInterval * 86400000);
  const blendedScore = calcBlendedScore(nextReviewAt, examDate);

  // 6. Update SM-2 queue
  await supabase
    .from('sm2_queue')
    .update({
      easiness: next.easiness,
      interval_days: blendedInterval,
      repetitions: next.repetitions,
      next_review_at: nextReviewAt.toISOString(),
      blended_score: blendedScore,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sm2Row.id);

  return NextResponse.json({ next_review_at: nextReviewAt.toISOString(), blended_score: blendedScore });
}
