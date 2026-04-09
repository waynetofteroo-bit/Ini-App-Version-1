import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('user_courses')
    .select(`
      id,
      exam_date,
      active,
      courses (id, course_code, course_name, exam_board, level, subject),
      user_units (id)
    `)
    .eq('user_id', user.id)
    .eq('active', true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Compute progress_pct from progress_rollup
  const enriched = await Promise.all(
    (data ?? []).map(async (uc: any) => {
      const { data: rollup } = await supabase
        .from('progress_rollup')
        .select('topic_mastery')
        .eq('user_course_id', uc.id)
        .eq('user_id', user.id);

      const topics = rollup ?? [];
      const avgMastery =
        topics.length > 0
          ? topics.reduce((sum: number, r: any) => sum + (r.topic_mastery ?? 0), 0) /
            topics.length
          : 0;

      return {
        userCourseId: uc.id,
        courseName: uc.courses?.course_name,
        examBoard: uc.courses?.exam_board,
        level: uc.courses?.level,
        examDate: uc.exam_date,
        progressPct: Math.round(avgMastery * 100),
        unitsEnrolled: uc.user_units?.length ?? 0,
      };
    })
  );

  return NextResponse.json(enriched);
}
