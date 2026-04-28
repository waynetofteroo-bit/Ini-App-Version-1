import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as Record<string, unknown>;
  const { answer_log_id, note } = body as { answer_log_id: string; note: string };

  if (!answer_log_id) {
    return NextResponse.json({ error: 'Missing answer_log_id' }, { status: 400 });
  }

  // RLS ensures the user can only update their own answer_log rows
  const { error } = await supabase
    .from('answer_log')
    .update({
      marking_status:    'under_review',
      human_review_notes: note?.trim() || null,
    })
    .eq('id', answer_log_id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
