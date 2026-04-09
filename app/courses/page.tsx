import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CourseCard } from '@/components/CourseCard';
import Link from 'next/link';

interface EnrolledCourse {
  userCourseId: string;
  courseName: string;
  examBoard: string;
  level: string;
  examDate: string;
  progressPct: number;
  unitsEnrolled: number;
}

async function getEnrolledCourses(): Promise<EnrolledCourse[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('supabase.co', 'supabase.co')}/`,
    { cache: 'no-store' }
  );

  // Directly query via supabase for SSR
  const { data: userCourses } = await supabase
    .from('user_courses')
    .select(`
      id,
      exam_date,
      courses (id, course_name, exam_board, level)
    `)
    .eq('user_id', user.id)
    .eq('active', true);

  if (!userCourses) return [];

  const enriched = await Promise.all(
    userCourses.map(async (uc: any) => {
      const { data: unitCount } = await supabase
        .from('user_units')
        .select('id', { count: 'exact', head: true })
        .eq('user_course_id', uc.id);

      return {
        userCourseId: uc.id,
        courseName: uc.courses?.course_name ?? '',
        examBoard: uc.courses?.exam_board ?? '',
        level: uc.courses?.level ?? '',
        examDate: uc.exam_date,
        progressPct: 0,
        unitsEnrolled: (unitCount as any) ?? 0,
      };
    })
  );

  return enriched;
}

export default async function CoursesPage() {
  const courses = await getEnrolledCourses();

  if (courses.length === 1) {
    redirect(`/dashboard?course=${courses[0].userCourseId}`);
  }

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Your courses</h1>
        <div className="grid gap-4 sm:grid-cols-2">
          {courses.map((c) => (
            <CourseCard key={c.userCourseId} {...c} currentPath="/courses" />
          ))}
          <Link
            href="/onboarding/add"
            className="rounded-xl border-2 border-dashed border-gray-300 p-6 flex items-center justify-center text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors text-sm font-medium"
          >
            + Enrol in another course
          </Link>
        </div>
      </div>
    </main>
  );
}
