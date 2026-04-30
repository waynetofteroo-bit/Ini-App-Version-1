import { SupabaseClient } from '@supabase/supabase-js';

export async function getAvailableRungs(unitId: string, supabase: SupabaseClient): Promise<number[]> {
  const { data: nodes } = await supabase
    .from('knowledge_graph_nodes')
    .select('id')
    .eq('unit_id', unitId);

  if (!nodes?.length) return [];

  const conceptIds = nodes.map((n: any) => n.id as string);

  const { data: questions } = await supabase
    .from('questions')
    .select('bloom_level')
    .in('concept_id', conceptIds);

  if (!questions?.length) return [];

  const levels = [...new Set(questions.map((q: any) => q.bloom_level as number))];
  return levels.sort((a, b) => a - b);
}
