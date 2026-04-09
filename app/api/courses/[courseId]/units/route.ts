import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(
  _request: Request,
  { params }: { params: { courseId: string } }
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('units')
    .select('id, unit_code, unit_name, unit_order')
    .eq('course_id', params.courseId)
    .order('unit_order');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
