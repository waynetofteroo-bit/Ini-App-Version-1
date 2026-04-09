import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CurriculumGraph } from './CurriculumGraph';
import { BackButton } from '@/components/BackButton';

interface Props {
  searchParams: { course?: string; board?: string };
}

export default async function CurriculumPage({ searchParams }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const board = searchParams.board ?? 'WJEC';
  const courseId = searchParams.course;

  const [{ data: nodes }, { data: edges }] = await Promise.all([
    supabase
      .from('knowledge_graph_nodes')
      .select('id, concept_uri, label, bloom_ceiling, topic_tier, unit_id')
      .eq('exam_board', board),
    supabase
      .from('knowledge_graph_edges')
      .select('id, from_node, to_node, relation')
      .eq('exam_board', board),
  ]);

  // Mastery data if course supplied
  let masteryMap: Record<string, number> = {};
  if (courseId) {
    const { data: rollup } = await supabase
      .from('progress_rollup')
      .select('topic_id, topic_mastery')
      .eq('user_course_id', courseId)
      .eq('user_id', user.id);
    for (const r of rollup ?? []) {
      masteryMap[r.topic_id] = r.topic_mastery ?? 0;
    }
  }

  const backParam = courseId ? `/dashboard?course=${courseId}` : '/courses';

  return (
    <main className="min-h-screen flex flex-col px-4 py-6">
      <div className="max-w-6xl mx-auto w-full space-y-4 flex-1 flex flex-col">
        <div className="flex items-center justify-between">
          <BackButton fallback={backParam} />
          <h1 className="text-lg font-semibold text-gray-800">Knowledge Graph — {board}</h1>
          <div />
        </div>
        <div className="flex-1 rounded-xl border border-gray-200 bg-white overflow-hidden" style={{ minHeight: 500 }}>
          <CurriculumGraph
            nodes={nodes ?? []}
            edges={edges ?? []}
            masteryMap={masteryMap}
          />
        </div>
        <p className="text-xs text-gray-400 text-center">
          Nodes coloured by mastery. Green = mastered, amber = learning, grey = unseen.
          Arrows show prerequisite relationships.
        </p>
      </div>
    </main>
  );
}
