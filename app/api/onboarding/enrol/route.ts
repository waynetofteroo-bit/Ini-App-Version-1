import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { course_id, exam_date, unit_ids, unit_exam_dates } = body as {
    course_id: string;
    exam_date: string;
    unit_ids: string[];
    unit_exam_dates: Record<string, string>;
  };

  if (!course_id || !exam_date || !unit_ids?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // 1. Insert user_courses
  const { data: userCourse, error: ucErr } = await supabase
    .from('user_courses')
    .insert({ user_id: user.id, course_id, exam_date })
    .select('id')
    .single();

  if (ucErr) return NextResponse.json({ error: ucErr.message }, { status: 500 });

  // 2. Insert user_units
  const userUnits = unit_ids.map((uid) => ({
    user_id: user.id,
    user_course_id: userCourse.id,
    unit_id: uid,
    exam_date: unit_exam_dates?.[uid] ?? null,
  }));

  const { error: uuErr } = await supabase.from('user_units').insert(userUnits);
  if (uuErr) return NextResponse.json({ error: uuErr.message }, { status: 500 });

  // 3. Seed sm2_queue: one row per knowledge_graph_node in selected units
  const { data: nodes, error: nodeErr } = await supabase
    .from('knowledge_graph_nodes')
    .select('id')
    .in('unit_id', unit_ids);

  if (nodeErr) return NextResponse.json({ error: nodeErr.message }, { status: 500 });

  if (nodes && nodes.length > 0) {
    const queueRows = nodes.map((n: { id: string }) => ({
      user_id: user.id,
      concept_id: n.id,
      user_course_id: userCourse.id,
      easiness: 2.5,
      interval_days: 1,
      repetitions: 0,
      next_review_at: new Date().toISOString(),
      blended_score: 0,
    }));

    const { error: qErr } = await supabase.from('sm2_queue').insert(queueRows);
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  return NextResponse.json({ userCourseId: userCourse.id });
}
