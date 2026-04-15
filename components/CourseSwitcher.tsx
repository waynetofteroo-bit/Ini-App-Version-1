'use client';

interface Course {
  id: string;
  name: string;
}

export function CourseSwitcher({ courses, currentId }: { courses: Course[]; currentId: string }) {
  return (
    <select
      defaultValue={currentId}
      onChange={(e) => { window.location.href = `/dashboard?course=${e.target.value}`; }}
      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5"
    >
      {courses.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  );
}
