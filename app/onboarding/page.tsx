'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Step = 1 | 2 | 3 | 4 | 5;

interface Course {
  id: string;
  course_code: string;
  course_name: string;
  exam_board: string;
  level: string;
}

interface Unit {
  id: string;
  unit_code: string;
  unit_name: string;
  unit_order: number;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [board, setBoard] = useState('WJEC');
  const [level, setLevel] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [unitExamDates, setUnitExamDates] = useState<Record<string, string>>({});
  const [examDate, setExamDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (level) {
      fetch(`/api/courses?board=${board}&level=${level}`)
        .then((r) => r.json())
        .then(setCourses);
    }
  }, [board, level]);

  useEffect(() => {
    if (selectedCourse) {
      fetch(`/api/courses/${selectedCourse.id}/units`)
        .then((r) => r.json())
        .then((data: Unit[]) => {
          setUnits(data);
          setSelectedUnitIds(data.map((u) => u.id));
        });
    }
  }, [selectedCourse]);

  async function handleEnrol() {
    setSubmitting(true);
    setError('');
    const res = await fetch('/api/onboarding/enrol', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course_id: selectedCourse!.id,
        exam_date: examDate,
        unit_ids: selectedUnitIds,
        unit_exam_dates: unitExamDates,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? 'Enrolment failed');
    } else {
      router.push('/courses');
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full space-y-6">
        {/* Progress dots */}
        <div className="flex gap-2 justify-center">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={`w-2.5 h-2.5 rounded-full ${s <= step ? 'bg-indigo-600' : 'bg-gray-200'}`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-center">Choose your exam board</h2>
            <div className="grid grid-cols-3 gap-3">
              {['WJEC', 'AQA', 'Edexcel'].map((b) => (
                <button
                  key={b}
                  onClick={() => setBoard(b)}
                  className={`rounded-xl border-2 py-4 font-semibold text-sm transition-colors ${
                    board === b
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  {b}
                  {b === 'WJEC' && (
                    <span className="block text-xs font-normal text-indigo-400 mt-0.5">
                      Recommended for Wales
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep(2)}
              className="w-full py-2 rounded-lg bg-indigo-600 text-white font-semibold text-sm"
            >
              Next
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-center">Choose your level</h2>
            <div className="grid grid-cols-2 gap-3">
              {['GCSE', 'A-Level'].map((l) => (
                <button
                  key={l}
                  onClick={() => setLevel(l)}
                  className={`rounded-xl border-2 py-6 font-semibold text-sm transition-colors ${
                    level === l
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm">
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!level}
                className="flex-1 py-2 rounded-lg bg-indigo-600 text-white font-semibold text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-center">Choose your course</h2>
            {courses.length === 0 ? (
              <p className="text-center text-gray-400 text-sm">Loading courses…</p>
            ) : (
              <div className="space-y-2">
                {courses.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCourse(c)}
                    className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-colors ${
                      selectedCourse?.id === c.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-indigo-300'
                    }`}
                  >
                    <p className="font-medium text-sm">{c.course_name}</p>
                    <p className="text-xs text-gray-500">{c.course_code}</p>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm">
                Back
              </button>
              <button
                onClick={() => setStep(4)}
                disabled={!selectedCourse}
                className="flex-1 py-2 rounded-lg bg-indigo-600 text-white font-semibold text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-center">Select your units</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Overall exam date</label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {units.map((u) => (
                <label key={u.id} className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedUnitIds.includes(u.id)}
                    onChange={(e) => {
                      setSelectedUnitIds((prev) =>
                        e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id)
                      );
                    }}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{u.unit_name}</p>
                    <input
                      type="date"
                      placeholder="Unit exam date (optional)"
                      value={unitExamDates[u.id] ?? ''}
                      onChange={(e) =>
                        setUnitExamDates((prev) => ({ ...prev, [u.id]: e.target.value }))
                      }
                      className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-xs"
                    />
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(3)} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm">
                Back
              </button>
              <button
                onClick={() => setStep(5)}
                disabled={selectedUnitIds.length === 0 || !examDate}
                className="flex-1 py-2 rounded-lg bg-indigo-600 text-white font-semibold text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-center">Confirm your enrolment</h2>
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2 text-sm">
              <p><span className="font-medium">Board:</span> {board}</p>
              <p><span className="font-medium">Level:</span> {level}</p>
              <p><span className="font-medium">Course:</span> {selectedCourse?.course_name}</p>
              <p><span className="font-medium">Exam date:</span> {examDate}</p>
              <p><span className="font-medium">Units:</span></p>
              <ul className="ml-4 list-disc space-y-0.5 text-gray-600">
                {units
                  .filter((u) => selectedUnitIds.includes(u.id))
                  .map((u) => (
                    <li key={u.id}>{u.unit_name}</li>
                  ))}
              </ul>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setStep(4)} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm">
                Back
              </button>
              <button
                onClick={handleEnrol}
                disabled={submitting}
                className="flex-1 py-2 rounded-lg bg-indigo-600 text-white font-semibold text-sm disabled:opacity-60"
              >
                {submitting ? 'Setting up…' : 'Start learning →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
