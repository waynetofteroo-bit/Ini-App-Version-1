import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(
  _request: Request,
  { params }: { params: { board: string } }
) {
  const supabase = createClient();

  const [{ data: nodes }, { data: edges }] = await Promise.all([
    supabase
      .from('knowledge_graph_nodes')
      .select('id, concept_uri, label, bloom_ceiling, topic_tier, unit_id')
      .eq('exam_board', params.board),
    supabase
      .from('knowledge_graph_edges')
      .select('id, from_node, to_node, relation')
      .eq('exam_board', params.board),
  ]);

  return NextResponse.json({ nodes: nodes ?? [], edges: edges ?? [] });
}
