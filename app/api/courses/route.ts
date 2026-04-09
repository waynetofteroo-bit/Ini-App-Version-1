import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const board = searchParams.get('board');
  const level = searchParams.get('level');

  const supabase = createClient();
  let query = supabase.from('courses').select('*');
  if (board) query = query.eq('exam_board', board);
  if (level) query = query.eq('level', level);

  const { data, error } = await query.order('course_name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
