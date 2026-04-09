import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { BackButton } from '@/components/BackButton';
import { CourseProgressRing } from '@/components/CourseProgressRing';
import { BloomDepthBar } from '@/components/BloomDepthBar';
import { UnitAccordion } from '@/components/UnitAccordion';

interface Props {
  searchParams: { course?: string };
}

export default async function ProgressPage({ searchParams }: Props) {
  const courseId = searchParams.course;
  if (!courseId) redirect('/courses');

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: userCourse } = await supabase
    .from('user_courses')
    .select(`id, exam_date, courses (course_name, level, exam_board)`)
    .eq('id', courseId)
    .eq('user_id', user.id)
    .single();

  if (!userCourse) redirect('/courses');

  const { data: rollup } = await supabase
    .from('progress_rollup')
    .select('*')
    .eq('user_id', user.id)
    .eq('user_course_id', courseId);

  const { data: userUnits } = await supabase
    .from('user_units')
    .select(`id, unit_id, units (unit_name)`)
    .eq('user_course_id', courseId)
    .eq('user_id', user.id);

  // Compute per-topic mastery
  const topicMap: Record<string, { label: string; mastery: number; unitId: string }> = {};
  const unitMastery: Record<string, number[]> = {};
  for (const r of rollup ?? []) {
    topicMap[r.topic_id] = {
      label: r.topic_label,
      mastery: r.topic_mastery ?? 0,
      unitId: r.unit_id,
    };
    if (!unitMastery[r.unit_id]) unitMastery[r.unit_id] = [];
    unitMastery[r.unit_id].push(r.unit_avg_mastery ?? 0);
  }

  // Bloom distribution
  const bloomDist: Record<number, number> = {};
  for (const r of rollup ?? []) {
    if (r.bloom_demonstrated) {
      bloomDist[r.bloom_demonstrated] = (bloomDist[r.bloom_demonstrated] ?? 0) + 1;
    }
  }

  const masteryVals = Object.values(topicMap).map((t) => t.mastery);
  const coursePct =
    masteryVals.length > 0
      ? Math.round((masteryVals.reduce((a, b) => a + b, 0) / masteryVals.length) * 100)
      : 0;

  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(userCourse.exam_date).getTime() - Date.now()) / 86400000)
  );

  const currentPath = `/progress?course=${courseId}`;

  const unitRows = (userUnits ?? []).map((uu: any) => {
    const uMastery = unitMastery[uu.unit_id];
    const avg = uMastery?.length
      ? uMastery.reduce((a: number, b: number) => a + b, 0) / uMastery.length
      : 0;
    const topics = Object.entries(topicMap)
      .filter(([, t]) => t.unitId === uu.unit_id)
      .map(([id, t]) => ({ id, label: t.label, mastery: t.mastery }));
    return {
      unitId: uu.unit_id,
      unitName: uu.units?.unit_name ?? '',
      unitMastery: avg,
      topics,
    };
  });

  const totalAnswered = (rollup ?? []).length;
  const topicsMastered = Object.values(topicMap).filter((t) => t.mastery >= 0.7).length;

  const c = userCourse.courses as any;

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <BackButton fallback={`/dashboard?course=${courseId}`} />
          <div>
            <p className="text-xs text-indigo-600 font-semibold uppercase">{c?.exam_board} · {c?.level}</p>
            <h1 className="text-xl font-bold">{c?.course_name}</h1>
          </div>
        </div>

        {/* Tier 1 — Course level */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col sm:flex-row gap-6 items-center">
          <CourseProgressRing pct={coursePct} size={100} examLabel={`${daysLeft}d`} />
          <div className="flex-1 space-y-3">
            <BloomDepthBar distribution={bloomDist} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div>
                <p className="text-lg font-bold text-indigo-600">{topicsMastered}</p>
                <p className="text-xs text-gray-500">topics mastered</p>
              </div>
              <div>
                <p className="text-lg font-bold text-indigo-600">{Object.keys(topicMap).length}</p>
                <p className="text-xs text-gray-500">total topics</p>
              </div>
              <div>
                <p className="text-lg font-bold text-indigo-600">{totalAnswered}</p>
                <p className="text-xs text-gray-500">answers logged</p>
              </div>
              <div>
                <p className="text-lg font-bold text-indigo-600">{coursePct}%</p>
                <p className="text-xs text-gray-500">avg accuracy</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tier 2 & 3 — Unit accordion with topic pills */}
        <UnitAccordion units={unitRows} courseId={courseId} currentPath={currentPath} />
      </div>
    </main>
  );
}
