import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getAvailableRungs } from '@/lib/ladder/availability';
import { getOrInitState, evaluateThreshold } from '@/lib/ladder/state-engine';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const unitId   = searchParams.get('unit_id');
  const courseId = searchParams.get('course');

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user)   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!unitId) return NextResponse.json({ error: 'unit_id required' }, { status: 400 });
  if (!courseId) return NextResponse.json({ error: 'course required' }, { status: 400 });

  const availableRungs = await getAvailableRungs(unitId, supabase);

  // getOrInitState self-heals if current_rung is no longer in availableRungs
  const state = await getOrInitState(user.id, unitId, availableRungs, supabase);

  const threshold =
    availableRungs.length > 0 && !state.reachedTop
      ? await evaluateThreshold(user.id, unitId, courseId, state.currentRung, supabase)
      : null;

  return NextResponse.json({
    availableRungs,
    currentRung:        state.currentRung,
    highestRungPassed:  state.highestRungPassed,
    reachedTop:         state.reachedTop,
    threshold,
  });
}
