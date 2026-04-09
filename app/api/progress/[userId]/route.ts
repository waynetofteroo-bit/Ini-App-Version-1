import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: { userId: string } }
) {
  const { searchParams } = new URL(request.url);
  const courseId = searchParams.get('course');

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== params.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!courseId) return NextResponse.json({ error: 'course param required' }, { status: 400 });

  const { data, error } = await supabase
    .from('progress_rollup')
    .select('*')
    .eq('user_id', user.id)
    .eq('user_course_id', courseId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
