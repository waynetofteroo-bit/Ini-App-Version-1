import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { concept_id, gaps } = body as { concept_id: string; gaps: string[] };

  if (!concept_id) return NextResponse.json({ error: 'concept_id required' }, { status: 400 });

  const { error } = await supabase
    .from('knowledge_graph_nodes')
    .update({ gap_flags: gaps ?? [] })
    .eq('id', concept_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
