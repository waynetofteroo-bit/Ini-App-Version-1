import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { BackButton } from '@/components/BackButton';
import Link from 'next/link';

interface Props {
  params: { topicId: string };
  searchParams: { back?: string };
}

export default async function TopicDetailPage({ params, searchParams }: Props) {
  const { topicId } = params;
  const backParam = searchParams.back ?? '/progress';

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: node } = await supabase
    .from('knowledge_graph_nodes')
    .select(`id, label, bloom_ceiling, topic_tier, gap_flags, unit_id, units (unit_name, course_id)`)
    .eq('id', topicId)
    .single();

  if (!node) redirect('/progress');

  // Prerequisite edges
  const { data: prereqEdges } = await supabase
    .from('knowledge_graph_edges')
    .select(`from_node, knowledge_graph_nodes!knowledge_graph_edges_from_node_fkey (id, label)`)
    .eq('to_node', topicId)
    .eq('relation', 'prerequisite');

  // SM-2 state for this topic
  const { data: sm2 } = await supabase
    .from('sm2_queue')
    .select('next_review_at, updated_at')
    .eq('concept_id', topicId)
    .eq('user_id', user.id)
    .maybeSingle();

  // Questions for this topic
  const { data: questions } = await supabase
    .from('questions')
    .select('id, stem, bloom_level')
    .eq('concept_id', topicId)
    .order('bloom_level');

  // Progress rollup for bloom breakdown
  const { data: rollup } = await supabase
    .from('progress_rollup')
    .select('bloom_level, bloom_demonstrated, bloom_ceiling_reached')
    .eq('topic_id', topicId)
    .eq('user_id', user.id);

  const bloomDemonstrated: Record<number, number> = {};
  for (const r of rollup ?? []) {
    if (r.bloom_demonstrated) {
      bloomDemonstrated[r.bloom_demonstrated] = (bloomDemonstrated[r.bloom_demonstrated] ?? 0) + 1;
    }
  }

  const reviseHref = `/session/new?topic_id=${topicId}&back=${encodeURIComponent(`/progress/topic/${topicId}?back=${encodeURIComponent(backParam)}`)}`;
  const unit = node.units as any;

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <BackButton fallback={backParam} />

        <div>
          <p className="text-xs text-gray-500">{unit?.unit_name}</p>
          <h1 className="text-2xl font-bold text-gray-900">{node.label}</h1>
          <div className="flex gap-2 mt-1">
            <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">
              Bloom ceiling L{node.bloom_ceiling}
            </span>
            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
              {node.topic_tier}
            </span>
          </div>
        </div>

        {/* Bloom breakdown */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
          <h3 className="text-sm font-semibold">Bloom&apos;s progress</h3>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((l) => {
              const reached = (bloomDemonstrated[l] ?? 0) > 0;
              const withinCeiling = l <= node.bloom_ceiling;
              return (
                <div
                  key={l}
                  className={`flex-1 h-6 rounded text-xs flex items-center justify-center font-medium ${
                    reached ? 'bg-indigo-500 text-white' : withinCeiling ? 'bg-gray-200 text-gray-400' : 'bg-gray-100 text-gray-300'
                  }`}
                >
                  L{l}
                </div>
              );
            })}
          </div>
        </div>

        {/* SM-2 dates */}
        {sm2 && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm space-y-1">
            <p className="text-gray-500">
              Last reviewed:{' '}
              <span className="text-gray-800">
                {sm2.updated_at ? new Date(sm2.updated_at).toLocaleDateString() : 'Never'}
              </span>
            </p>
            <p className="text-gray-500">
              Next review:{' '}
              <span className="text-gray-800">
                {new Date(sm2.next_review_at).toLocaleDateString()}
              </span>
            </p>
          </div>
        )}

        {/* Gap flags */}
        {(node.gap_flags?.length ?? 0) > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-amber-800">Areas to strengthen</h3>
            <ul className="list-disc ml-4 space-y-0.5 text-sm text-amber-700">
              {node.gap_flags.map((flag: string) => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Prerequisite topics */}
        {(prereqEdges?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">Prerequisite topics</h3>
            <div className="flex flex-wrap gap-2">
              {prereqEdges?.map((e: any) => (
                <Link
                  key={e.from_node}
                  href={`/progress/topic/${e.from_node}?back=${encodeURIComponent(`/progress/topic/${topicId}?back=${encodeURIComponent(backParam)}`)}`}
                  className="text-xs px-3 py-1 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  {e.knowledge_graph_nodes?.label}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Question list */}
        {(questions?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">Questions ({questions!.length})</h3>
            <div className="space-y-1">
              {questions!.map((q) => (
                <div key={q.id} className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2 flex justify-between">
                  <span className="truncate pr-2">{q.stem}</span>
                  <span className="shrink-0 text-indigo-500">L{q.bloom_level}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Link
          href={reviseHref}
          className="block text-center rounded-xl bg-indigo-600 text-white font-semibold py-3 hover:bg-indigo-700 transition-colors"
        >
          Revise this topic →
        </Link>
      </div>
    </main>
  );
}
