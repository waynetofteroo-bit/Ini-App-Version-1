import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const courseId = searchParams.get('course');
  const unitId = searchParams.get('unit_id');
  const topicId = searchParams.get('topic_id');
  const force = searchParams.get('force') === 'true';

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!courseId) return NextResponse.json({ error: 'course param required' }, { status: 400 });

  // Build SM-2 queue query
  let queueQuery = supabase
    .from('sm2_queue')
    .select(`
      id,
      concept_id,
      easiness,
      interval_days,
      repetitions,
      next_review_at,
      blended_score,
      knowledge_graph_nodes (id, label, unit_id, bloom_ceiling)
    `)
    .eq('user_id', user.id)
    .eq('user_course_id', courseId)
    .order('blended_score', { ascending: false })
    .limit(20);

  if (!force) {
    queueQuery = queueQuery.lte('next_review_at', new Date().toISOString());
  }

  const { data: queue, error } = await queueQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Filter by unit or topic if specified
  let filtered = queue ?? [];
  if (unitId) {
    filtered = filtered.filter((q: any) => q.knowledge_graph_nodes?.unit_id === unitId);
  }
  if (topicId) {
    filtered = filtered.filter((q: any) => q.concept_id === topicId);
  }

  // Fetch one question per concept
  const conceptIds = filtered.map((q: any) => q.concept_id);
  if (conceptIds.length === 0) return NextResponse.json([]);

  const { data: questions } = await supabase
    .from('questions')
    .select('id, concept_id, stem, options, correct_idx, bloom_level, marking_prompt, exam_board, marks, command_word, model_answer')
    .in('concept_id', conceptIds)
    .order('bloom_level');

  // Deduplicate — one question per concept
  const seen = new Set<string>();
  const deduped = (questions ?? []).filter((q: any) => {
    if (seen.has(q.concept_id)) return false;
    seen.add(q.concept_id);
    return true;
  });

  // Attach topic label
  const nodeMap = Object.fromEntries(
    filtered.map((q: any) => [q.concept_id, q.knowledge_graph_nodes])
  );

  const result = deduped.map((q: any) => ({
    ...q,
    topicLabel: nodeMap[q.concept_id]?.label ?? '',
  }));

  return NextResponse.json(result);
}
