import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { BackButton } from '@/components/BackButton';
import { LadderEntryCard } from '@/components/LadderEntryCard';
import { getAvailableRungs } from '@/lib/ladder/availability';
import { readLadderState, evaluateThreshold } from '@/lib/ladder/state-engine';

interface Props {
  params: { unitId: string };
  searchParams: { course?: string; back?: string };
}

export default async function UnitHubPage({ params, searchParams }: Props) {
  const { unitId } = params;
  const courseId   = searchParams.course;
  const backParam  = searchParams.back ?? '/progress';

  if (!courseId) redirect('/courses');

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  // Unit + course details
  const { data: unit } = await supabase
    .from('units')
    .select('id, unit_name, unit_order, courses (course_name, exam_board, level)')
    .eq('id', unitId)
    .single();

  if (!unit) redirect(backParam);

  // Verify the user is enrolled in this course+unit
  const { data: userUnit } = await supabase
    .from('user_units')
    .select('id')
    .eq('unit_id', unitId)
    .eq('user_course_id', courseId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!userUnit) redirect(backParam);

  // SM-2 due count for this unit
  const { data: queue } = await supabase
    .from('sm2_queue')
    .select('concept_id, knowledge_graph_nodes!inner(unit_id)')
    .eq('user_id', user.id)
    .eq('user_course_id', courseId)
    .lte('next_review_at', new Date().toISOString());

  const dueCount = (queue ?? []).filter(
    (q: any) => q.knowledge_graph_nodes?.unit_id === unitId
  ).length;

  // Ladder state — read-only; row is created only when the student enters the
  // ladder session itself, so null here means "never started."
  const availableRungs = await getAvailableRungs(unitId, supabase);
  const ladderState    = availableRungs.length > 0
    ? await readLadderState(user.id, unitId, availableRungs, supabase)
    : null;

  const threshold = ladderState && !ladderState.reachedTop
    ? await evaluateThreshold(user.id, unitId, courseId, ladderState.currentRung, supabase)
    : null;

  const currentPath = `/unit/${unitId}?course=${courseId}&back=${encodeURIComponent(backParam)}`;
  const c = unit.courses as any;

  const reviewHref = `/session/new?course=${courseId}&unit_id=${unitId}&back=${encodeURIComponent(currentPath)}`;
  const focusHref  = `/session/new?course=${courseId}&unit_id=${unitId}&force=true&back=${encodeURIComponent(currentPath)}`;

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-lg mx-auto space-y-6">
        <BackButton fallback={backParam} />

        <div>
          <p className="text-xs text-indigo-600 font-semibold uppercase">
            {c?.exam_board} · {c?.level} · {c?.course_name}
          </p>
          <h1 className="text-2xl font-bold text-gray-900 mt-0.5">{unit.unit_name}</h1>
        </div>

        <p className="text-sm font-medium text-gray-500">Choose how to study:</p>

        {/* Review due cards */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-900">Review due cards</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {dueCount > 0
                  ? `${dueCount} card${dueCount === 1 ? '' : 's'} ready for spaced review`
                  : 'No cards due right now'}
              </p>
            </div>
            <span className="text-lg leading-none">📚</span>
          </div>
          {dueCount > 0 ? (
            <Link
              href={reviewHref}
              className="block text-center text-xs font-semibold py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              Start review →
            </Link>
          ) : (
            <p className="text-xs text-gray-400">Come back later, or try a focus session.</p>
          )}
        </div>

        {/* Focus session */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-900">Focus session</p>
              <p className="text-xs text-gray-500 mt-0.5">Mixed difficulty across this unit</p>
            </div>
            <span className="text-lg leading-none">🎯</span>
          </div>
          <Link
            href={focusHref}
            className="block text-center text-xs font-semibold py-2 rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-50 transition-colors"
          >
            Start focus session →
          </Link>
        </div>

        {/* Bloom's ladder */}
        {availableRungs.length > 0 && (
          <LadderEntryCard
            unitId={unitId}
            courseId={courseId}
            availableRungs={availableRungs}
            hasEntered={ladderState !== null}
            currentRung={ladderState?.currentRung ?? availableRungs[0]}
            highestRungPassed={ladderState?.highestRungPassed ?? 0}
            reachedTop={ladderState?.reachedTop ?? false}
            attemptCount={threshold?.attempts ?? 0}
            correctCount={threshold?.correctCount ?? 0}
            backPath={currentPath}
          />
        )}
      </div>
    </main>
  );
}
