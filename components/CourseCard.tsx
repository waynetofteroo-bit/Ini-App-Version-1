import Link from 'next/link';
import { CourseProgressRing } from './CourseProgressRing';

interface CourseCardProps {
  userCourseId: string;
  courseName: string;
  examBoard: string;
  level: string;
  examDate: string;
  progressPct: number;
  unitsEnrolled: number;
  currentPath: string;
}

export function CourseCard({
  userCourseId,
  courseName,
  examBoard,
  level,
  examDate,
  progressPct,
  unitsEnrolled,
  currentPath,
}: CourseCardProps) {
  const dest = `/dashboard?course=${userCourseId}&back=${encodeURIComponent(currentPath)}`;
  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000)
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
            {examBoard} · {level}
          </span>
          <h3 className="mt-1 text-base font-semibold text-gray-900">{courseName}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {unitsEnrolled} units · {daysLeft}d until exam
          </p>
        </div>
        <CourseProgressRing pct={progressPct} size={52} />
      </div>
      <Link
        href={dest}
        className="mt-auto block text-center rounded-lg bg-indigo-600 text-white text-sm font-medium py-2 hover:bg-indigo-700 transition-colors"
      >
        Continue →
      </Link>
    </div>
  );
}
