import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { BloomDepthBar } from '@/components/BloomDepthBar';
import { CourseProgressRing } from '@/components/CourseProgressRing';
import { Suspense } from 'react';

interface Props {
  searchParams: { course?: string };
}

export default async function DashboardPage({ searchParams }: Props) {
  const courseId = searchParams.course;
  if (!courseId) redirect('/courses');

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  // Load course context
  const { data: userCourse } = await supabase
    .from('user_courses')
    .select(`id, exam_date, courses (course_name, level, exam_board)`)
    .eq('id', courseId)
    .eq('user_id', user.id)
    .single();

  if (!userCourse) redirect('/courses');

  // All enrolled courses for switcher
  const { data: allCourses } = await supabase
    .from('user_courses')
    .select(`id, courses (course_name)`)
    .eq('user_id', user.id)
    .eq('active', true);

  // Today's queue count
  const { count: queueCount } = await supabase
    .from('sm2_queue')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('user_course_id', courseId)
    .lte('next_review_at', new Date().toISOString());

  // Unit progress
  const { data: userUnits } = await supabase
    .from('user_units')
    .select(`id, unit_id, units (unit_name)`)
    .eq('user_course_id', courseId)
    .eq('user_id', user.id);

  const { data: rollup } = await supabase
    .from('progress_rollup')
    .select('unit_id, unit_name, unit_avg_mastery, bloom_level, bloom_demonstrated')
    .eq('user_course_id', courseId)
    .eq('user_id', user.id);

  // Compute per-unit mastery
  const unitMastery: Record<string, { name: string; mastery: number }> = {};
  for (const r of rollup ?? []) {
    if (!unitMastery[r.unit_id]) {
      unitMastery[r.unit_id] = { name: r.unit_name, mastery: r.unit_avg_mastery ?? 0 };
    }
  }

  // Bloom distribution
  const bloomDist: Record<number, number> = {};
  for (const r of rollup ?? []) {
    if (r.bloom_demonstrated) {
      bloomDist[r.bloom_demonstrated] = (bloomDist[r.bloom_demonstrated] ?? 0) + 1;
    }
  }

  // Course overall mastery
  const masteryVals = Object.values(unitMastery).map((u) => u.mastery);
  const coursePct =
    masteryVals.length > 0
      ? Math.round((masteryVals.reduce((a, b) => a + b, 0) / masteryVals.length) * 100)
      : 0;

  // Weakest unit
  const weakest = (userUnits ?? []).reduce(
    (worst: any, uu: any) => {
      const m = unitMastery[uu.unit_id]?.mastery ?? 0;
      return !worst || m < worst.mastery ? { unitId: uu.unit_id, name: uu.units?.unit_name, mastery: m } : worst;
    },
    null
  );

  const c = userCourse.courses as any;
  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(userCourse.exam_date).getTime() - Date.now()) / 86400000)
  );
  const backParam = encodeURIComponent(`/dashboard?course=${courseId}`);

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Course context bar */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
              {c?.exam_board} · {c?.level}
            </span>
            <h1 className="text-xl font-bold text-gray-900">{c?.course_name}</h1>
          </div>
          <div className="flex items-center gap-3">
          <Link
            href="/onboarding/add"
            className="text-xs px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors"
          >
            + Add course
          </Link>
          {(allCourses?.length ?? 0) > 1 && (
            <select
              defaultValue={courseId}
              onChange={(e) => { window.location.href = `/dashboard?course=${e.target.value}`; }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5"
            >
              {allCourses?.map((ac: any) => (
                <option key={ac.id} value={ac.id}>{ac.courses?.course_name}</option>
              ))}
            </select>
          )}
          </div>
        </div>

        {/* 6-widget grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* 1. Today's Queue */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Today&apos;s Queue</h3>
            <p className="text-3xl font-bold text-indigo-600">{queueCount ?? 0}</p>
            <p className="text-xs text-gray-500">cards due today</p>
            <Link
              href={`/session/new?course=${courseId}&back=${backParam}`}
              className="block text-center rounded-lg bg-indigo-600 text-white text-sm font-medium py-2 hover:bg-indigo-700"
            >
              Practice Now →
            </Link>
          </div>

          {/* 2. Course Progress */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3 flex flex-col items-center">
            <h3 className="text-sm font-semibold text-gray-700 self-start">Course Progress</h3>
            <CourseProgressRing pct={coursePct} size={88} examLabel={`${daysLeft}d left`} />
            <Link
              href={`/progress?course=${courseId}&back=${backParam}`}
              className="text-xs text-indigo-600 hover:underline"
            >
              View full progress →
            </Link>
          </div>

          {/* 3. Weakest Unit */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Focus Area</h3>
            {weakest ? (
              <>
                <p className="text-base font-medium text-gray-900">{weakest.name}</p>
                <p className="text-xs text-gray-500">{Math.round(weakest.mastery * 100)}% mastery</p>
                <Link
                  href={`/session/new?unit_id=${weakest.unitId}&course=${courseId}&force=true&back=${backParam}`}
                  className="block text-center rounded-lg border border-indigo-500 text-indigo-600 text-sm font-medium py-2 hover:bg-indigo-50"
                >
                  Focus here →
                </Link>
              </>
            ) : (
              <p className="text-xs text-gray-400">No data yet — start practising!</p>
            )}
          </div>

          {/* 4. Unit Progress Bars */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3 sm:col-span-2">
            <h3 className="text-sm font-semibold text-gray-700">Unit Progress</h3>
            <div className="space-y-2">
              {(userUnits ?? []).map((uu: any) => {
                const m = unitMastery[uu.unit_id]?.mastery ?? 0;
                const pct = Math.round(m * 100);
                const bar = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400';
                return (
                  <div key={uu.unit_id} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-36 truncate">{uu.units?.unit_name}</span>
                    <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
                      <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 5. Bloom's Depth */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Bloom&apos;s Depth</h3>
            <BloomDepthBar distribution={bloomDist} />
          </div>
        </div>
      </div>
    </main>
  );
}
