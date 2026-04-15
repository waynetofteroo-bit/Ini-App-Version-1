'use client';
import { Suspense } from 'react';
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { QuestionCard } from '@/components/QuestionCard';
import { BackButton } from '@/components/BackButton';

interface Question {
  id: string;
  concept_id: string;
  stem: string;
  options: { text: string; idx: number }[];
  correct_idx: number;
  bloom_level: number;
  topicLabel: string;
}

const SESSION_KEY = 'ini_session_answered';

function SessionContent() {
  const params = useSearchParams();
  const router = useRouter();

  const courseId = params.get('course');
  const unitId = params.get('unit_id');
  const topicId = params.get('topic_id');
  const force = params.get('force');
  const backParam = params.get('back') ?? '/dashboard';

  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [startMs, setStartMs] = useState(Date.now());

  useEffect(() => {
    const qs = new URLSearchParams();
    if (courseId) qs.set('course', courseId);
    if (unitId) qs.set('unit_id', unitId);
    if (topicId) qs.set('topic_id', topicId);
    if (force) qs.set('force', force);

    fetch(`/api/session/queue?${qs}`)
      .then((r) => r.json())
      .then((data: Question[]) => {
        // Resume from sessionStorage
        const answered: string[] = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '[]');
        const remaining = data.filter((q) => !answered.includes(q.id));
        setQuestions(remaining);
        setLoading(false);
        setStartMs(Date.now());
      });
  }, [courseId, unitId, topicId]);

  const handleSelect = useCallback((idx: number) => {
    setSelected(idx);
  }, []);

  async function handleConfirm() {
    if (selected === null) return;
    const q = questions[index];
    const correct = selected === q.correct_idx;
    const responseMs = Date.now() - startMs;

    setRevealed(true);

    // Save to sessionStorage
    const answered: string[] = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '[]');
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...answered, q.id]));

    // Submit answer
    await fetch('/api/session/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question_id: q.id,
        answer_idx: selected,
        correct,
        response_ms: responseMs,
        user_course_id: courseId,
      }),
    });
  }

  function handleNext() {
    if (index + 1 >= questions.length) {
      sessionStorage.removeItem(SESSION_KEY);
      router.push(`/session/summary?back=${encodeURIComponent(backParam)}`);
    } else {
      setIndex((i) => i + 1);
      setSelected(null);
      setRevealed(false);
      setStartMs(Date.now());
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading questions…</p>
      </main>
    );
  }

  if (questions.length === 0) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-gray-600 font-medium">No cards due right now.</p>
        <BackButton fallback={backParam} />
      </main>
    );
  }

  const q = questions[index];

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <BackButton fallback={backParam} />
          <span className="text-xs text-gray-400">
            {index + 1} / {questions.length}
          </span>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-1">
          <div
            className="bg-indigo-500 h-1 rounded-full transition-all"
            style={{ width: `${((index + 1) / questions.length) * 100}%` }}
          />
        </div>

        <QuestionCard
          stem={q.stem}
          options={q.options}
          bloomLevel={q.bloom_level}
          topicLabel={q.topicLabel}
          selectedIdx={selected}
          correctIdx={q.correct_idx}
          revealed={revealed}
          onSelect={handleSelect}
        />

        {!revealed ? (
          <button
            onClick={handleConfirm}
            disabled={selected === null}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            Check answer
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="w-full py-3 rounded-xl bg-gray-900 text-white font-semibold text-sm hover:bg-gray-800 transition-colors"
          >
            {index + 1 >= questions.length ? 'Finish session' : 'Next →'}
          </button>
        )}
      </div>
    </main>
  );
}

export default function SessionPage() {
  return (
    <Suspense>
      <SessionContent />
    </Suspense>
  );
}
