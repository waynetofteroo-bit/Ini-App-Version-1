import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { LADDER_CONFIG } from '@/lib/ladder/config';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const unitId   = searchParams.get('unit_id');
  const rung     = parseInt(searchParams.get('rung') ?? '', 10);
  const courseId = searchParams.get('course');

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user)           return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!unitId)         return NextResponse.json({ error: 'unit_id required' }, { status: 400 });
  if (isNaN(rung))     return NextResponse.json({ error: 'rung required' }, { status: 400 });
  if (!courseId)       return NextResponse.json({ error: 'course required' }, { status: 400 });

  // Concepts for this unit
  const { data: nodes } = await supabase
    .from('knowledge_graph_nodes')
    .select('id, label')
    .eq('unit_id', unitId);

  const conceptIds = (nodes ?? []).map((n: any) => n.id as string);
  if (!conceptIds.length) return NextResponse.json([]);

  // All questions at this rung for this unit
  const { data: questions } = await supabase
    .from('questions')
    .select('id, concept_id, stem, options, correct_idx, bloom_level, marks, command_word, model_answer')
    .in('concept_id', conceptIds)
    .eq('bloom_level', rung);

  if (!questions?.length) return NextResponse.json([]);

  const questionIds = questions.map((q: any) => q.id as string);

  // Recently attempted in ladder mode — excluded from this session
  const exclusionCutoff = new Date(
    Date.now() - LADDER_CONFIG.recentAttemptExclusionHours * 3_600_000
  ).toISOString();

  const { data: recentAttempts } = await supabase
    .from('answer_log')
    .select('question_id')
    .eq('user_id', user.id)
    .eq('session_mode', 'ladder')
    .in('question_id', questionIds)
    .gte('created_at', exclusionCutoff);

  const recentlyAttempted = new Set((recentAttempts ?? []).map((a: any) => a.question_id as string));

  // All-time ladder attempts for priority ordering (most recent result per question)
  const { data: allAttempts } = await supabase
    .from('answer_log')
    .select('question_id, correct')
    .eq('user_id', user.id)
    .eq('session_mode', 'ladder')
    .in('question_id', questionIds)
    .order('created_at', { ascending: false });

  const lastResult: Record<string, boolean> = {};
  const attemptedEver = new Set<string>();
  for (const a of (allAttempts ?? [])) {
    if (!(a.question_id in lastResult)) {
      lastResult[a.question_id] = a.correct;
    }
    attemptedEver.add(a.question_id);
  }

  const nodeLabel = Object.fromEntries((nodes ?? []).map((n: any) => [n.id, n.label as string]));

  // Filter recent, sort by priority band, random tiebreaker within band
  const available = questions
    .filter((q: any) => !recentlyAttempted.has(q.id))
    .map((q: any) => {
      let priority: number;
      if (!attemptedEver.has(q.id))      priority = 0; // never attempted
      else if (!lastResult[q.id])        priority = 1; // last attempt incorrect
      else                               priority = 2; // last attempt correct
      return { ...q, topicLabel: nodeLabel[q.concept_id] ?? '', _priority: priority };
    })
    .sort((a: any, b: any) =>
      a._priority !== b._priority
        ? a._priority - b._priority
        : Math.random() - 0.5
    )
    .map(({ _priority, ...q }: any) => q);

  return NextResponse.json(available);
}
