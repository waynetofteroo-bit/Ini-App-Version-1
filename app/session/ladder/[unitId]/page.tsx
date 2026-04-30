'use client';
import { Suspense } from 'react';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { QuestionCard } from '@/components/QuestionCard';
import { EssayCard } from '@/components/EssayCard';
import { LadderProgress } from '@/components/LadderProgress';
import { BackButton } from '@/components/BackButton';
import { BLOOM_LABELS } from '@/lib/ladder/config';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Question {
  id: string;
  concept_id: string;
  stem: string;
  options: { text: string; idx: number }[];
  correct_idx: number;
  bloom_level: number;
  topicLabel: string;
  marks: number | null;
  command_word: string | null;
  model_answer: string | null;
}

interface LadderStateData {
  availableRungs: number[];
  currentRung: number;
  highestRungPassed: number;
  reachedTop: boolean;
  threshold: {
    attempts: number;
    correctCount: number;
    passed: boolean;
    isStalled: boolean;
  } | null;
}

interface LadderResult {
  rung_advanced: boolean;
  new_rung: number | null;
  reached_top: boolean;
  is_stalled: boolean;
  attempts: number;
  correct_count: number;
}

type Screen =
  | 'intro'
  | 'loading'
  | 'question'
  | 'transition'
  | 'exhausted'
  | 'stalled'
  | 'top'
  | 'error';

const INTRO_KEY = 'ini_ladder_intro_seen';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildLastFive(attempts: number, correctCount: number): boolean[] {
  // Reconstruct last-five display from aggregate counts.
  // We know the total and correct count from the most recent window.
  const result: boolean[] = [];
  for (let i = 0; i < attempts; i++) {
    result.push(i < correctCount);
  }
  return result;
}

function skippedRungs(from: number, to: number, availableRungs: number[]): number[] {
  const allBetween: number[] = [];
  for (let r = from + 1; r < to; r++) {
    if (!availableRungs.includes(r)) allBetween.push(r);
  }
  return allBetween;
}

// ── Main content ──────────────────────────────────────────────────────────────

function LadderContent() {
  const params      = useParams();
  const searchParams = useSearchParams();
  const router      = useRouter();

  const unitId   = params.unitId as string;
  const courseId = searchParams.get('course') ?? '';
  const backParam = searchParams.get('back') ?? `/unit/${unitId}?course=${courseId}`;

  const [screen, setScreen]             = useState<Screen>('loading');
  const [ladderState, setLadderState]   = useState<LadderStateData | null>(null);
  const [questions, setQuestions]       = useState<Question[]>([]);
  const [qIndex, setQIndex]             = useState(0);
  const [selected, setSelected]         = useState<number | null>(null);
  const [revealed, setRevealed]         = useState(false);
  const [startMs, setStartMs]           = useState(Date.now());
  const [unitName, setUnitName]         = useState('');

  // Transition screen state
  const [passedRung, setPassedRung]     = useState<number | null>(null);
  const [nextRung, setNextRung]         = useState<number | null>(null);

  // Pending ladder result from essay answer — read in handleNext
  const pendingLadderResult = useRef<LadderResult | null>(null);

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!courseId || !unitId) return;

    // Check intro flag
    const introSeen = localStorage.getItem(INTRO_KEY) === 'true';

    // Fetch unit name
    fetch(`/api/ladder/state?unit_id=${unitId}&course=${courseId}`)
      .then(r => r.json())
      .then((data: LadderStateData) => {
        setLadderState(data);
        if (data.availableRungs.length === 0) {
          setScreen('error');
          return;
        }
        loadQueue(data.currentRung, data.availableRungs, !introSeen);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, courseId]);

  function loadQueue(rung: number, availableRungs: number[], showIntro: boolean) {
    fetch(`/api/ladder/queue?unit_id=${unitId}&rung=${rung}&course=${courseId}`)
      .then(r => r.json())
      .then((qs: Question[]) => {
        setQuestions(qs);
        setQIndex(0);
        setSelected(null);
        setRevealed(false);
        setStartMs(Date.now());
        if (qs.length === 0) {
          setScreen('exhausted');
        } else if (showIntro) {
          setScreen('intro');
        } else {
          setScreen('question');
        }
      });
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  function dismissIntro() {
    localStorage.setItem(INTRO_KEY, 'true');
    setScreen('question');
  }

  const handleSelect = useCallback((idx: number) => setSelected(idx), []);

  async function handleConfirm() {
    if (selected === null || !ladderState) return;
    const q = questions[qIndex];
    const correct = selected === q.correct_idx;
    const responseMs = Date.now() - startMs;

    setRevealed(true);

    const res = await fetch('/api/session/answer', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        question_id:    q.id,
        answer_idx:     selected,
        correct,
        response_ms:    responseMs,
        user_course_id: courseId,
        session_mode:   'ladder',
        unit_id:        unitId,
      }),
    });

    const data = await res.json();
    if (data.ladder) {
      pendingLadderResult.current = data.ladder as LadderResult;
      // Refresh local state counts for threshold bar
      setLadderState(prev => prev ? {
        ...prev,
        threshold: {
          attempts:     data.ladder.attempts,
          correctCount: data.ladder.correct_count,
          passed:       data.ladder.rung_advanced,
          isStalled:    data.ladder.is_stalled,
        },
      } : prev);
    }
  }

  function handleLadderResultFromEssay(result: LadderResult) {
    pendingLadderResult.current = result;
    setLadderState(prev => prev ? {
      ...prev,
      threshold: {
        attempts:     result.attempts,
        correctCount: result.correct_count,
        passed:       result.rung_advanced,
        isStalled:    result.is_stalled,
      },
    } : prev);
  }

  function handleNext() {
    const ladderRes = pendingLadderResult.current;
    pendingLadderResult.current = null;

    if (ladderRes?.reached_top) {
      setPassedRung(ladderState?.currentRung ?? null);
      setNextRung(null);
      setLadderState(prev => prev ? { ...prev, reachedTop: true } : prev);
      setScreen('top');
      return;
    }

    if (ladderRes?.rung_advanced && ladderRes.new_rung !== null) {
      setPassedRung(ladderState?.currentRung ?? null);
      setNextRung(ladderRes.new_rung);
      setLadderState(prev => prev ? {
        ...prev,
        highestRungPassed: ladderState?.currentRung ?? prev.highestRungPassed,
        currentRung: ladderRes.new_rung!,
      } : prev);
      setScreen('transition');
      return;
    }

    if (ladderRes?.is_stalled) {
      setScreen('stalled');
      return;
    }

    advanceQuestion();
  }

  function advanceQuestion() {
    const next = qIndex + 1;
    if (next >= questions.length) {
      setScreen('exhausted');
    } else {
      setQIndex(next);
      setSelected(null);
      setRevealed(false);
      setStartMs(Date.now());
    }
  }

  function handleContinueAfterTransition() {
    if (!ladderState || nextRung === null) return;
    loadQueue(nextRung, ladderState.availableRungs, false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (screen === 'loading') {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading ladder…</p>
      </main>
    );
  }

  if (screen === 'error') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-gray-600 font-medium">No questions available for this unit&apos;s ladder.</p>
        <BackButton fallback={backParam} />
      </main>
    );
  }

  const ls = ladderState!;
  const lastFive = ls.threshold
    ? buildLastFive(
        Math.min(ls.threshold.attempts, 5),
        Math.min(ls.threshold.correctCount, 5)
      )
    : [];

  // ── Intro screen ───────────────────────────────────────────────────────────

  if (screen === 'intro') {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="max-w-lg mx-auto space-y-6">
          <BackButton fallback={backParam} />
          <div>
            <p className="text-xs text-indigo-600 font-semibold uppercase">Bloom&apos;s ladder</p>
            <h1 className="text-xl font-bold text-gray-900 mt-0.5">How the ladder works</h1>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 text-sm text-gray-700">
            <p>
              The ladder climbs through Bloom&apos;s cognitive levels for this unit — from recalling facts
              at the bottom to evaluating and synthesising ideas at the top. Each rung is unlocked by
              passing the one below.
            </p>
            <p>
              Your progress is saved per unit. You can stop and come back at any time — the ladder
              remembers where you are.
            </p>
            <p>
              The ladder tracks your progress within ladder mode separately from your spaced review
              and focus sessions. To pass a rung, answer 60% of the last 5 questions correctly.
            </p>
          </div>
          <button
            onClick={dismissIntro}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition-colors"
          >
            Got it — start climbing →
          </button>
        </div>
      </main>
    );
  }

  // ── Transition screen (rung passed) ───────────────────────────────────────

  if (screen === 'transition' && passedRung !== null && nextRung !== null) {
    const skipped = skippedRungs(passedRung, nextRung, ls.availableRungs);
    const hasGap  = skipped.length > 0;

    return (
      <main className="min-h-screen px-4 py-8">
        <div className="max-w-lg mx-auto space-y-6">
          <div className="text-xs text-indigo-600 font-semibold uppercase">Bloom&apos;s ladder</div>

          <LadderProgress
            availableRungs={ls.availableRungs}
            currentRung={nextRung}
            highestRungPassed={passedRung}
            lastFiveAttempts={[]}
          />

          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <p className="text-sm font-semibold text-indigo-700">
              ✓ You passed L{passedRung} — {BLOOM_LABELS[passedRung] ?? `Level ${passedRung}`}
            </p>

            <div>
              <p className="text-base font-bold text-gray-900">
                Now climbing L{nextRung} — {BLOOM_LABELS[nextRung] ?? `Level ${nextRung}`}
              </p>
              {hasGap && (
                <p className="text-xs text-gray-500 mt-1">
                  This unit&apos;s ladder skips L{skipped.join(', L')} — the curriculum moves directly
                  from {BLOOM_LABELS[passedRung] ?? `Level ${passedRung}`} to{' '}
                  {BLOOM_LABELS[nextRung] ?? `Level ${nextRung}`}.
                </p>
              )}
            </div>

            <p className="text-sm text-gray-600">
              {nextRung === 1 && 'At L1, you\'ll recall key facts, definitions, and relationships.'}
              {nextRung === 2 && 'At L2, you\'ll explain concepts and show you understand what they mean.'}
              {nextRung === 3 && 'At L3, you\'ll apply knowledge to solve problems and interpret data.'}
              {nextRung === 4 && 'At L4, you\'ll break down problems, identify relationships, and reason through unfamiliar scenarios.'}
              {nextRung === 5 && 'At L5, you\'ll judge, justify, and synthesise — the highest cognitive demand in the curriculum.'}
            </p>
          </div>

          <button
            onClick={handleContinueAfterTransition}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition-colors"
          >
            Continue to L{nextRung} →
          </button>
        </div>
      </main>
    );
  }

  // ── Exhausted screen ───────────────────────────────────────────────────────

  if (screen === 'exhausted') {
    const focusHref = `/session/new?course=${courseId}&unit_id=${unitId}&force=true&back=${encodeURIComponent(backParam)}`;
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="max-w-lg mx-auto space-y-6">
          <div className="text-xs text-indigo-600 font-semibold uppercase">Bloom&apos;s ladder</div>

          <LadderProgress
            availableRungs={ls.availableRungs}
            currentRung={ls.currentRung}
            highestRungPassed={ls.highestRungPassed}
            lastFiveAttempts={lastFive}
          />

          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3 text-sm text-gray-700">
            <p>
              You&apos;ve answered every L{ls.currentRung} question available in this unit recently.
            </p>
            <p className="text-gray-500">
              Come back later for fresh questions, or switch to a focus session to revisit the material.
            </p>
          </div>

          <div className="flex gap-3">
            <BackButton fallback={backParam} />
            <a
              href={focusHref}
              className="flex-1 text-center py-3 rounded-xl border border-indigo-300 text-indigo-700 font-semibold text-sm hover:bg-indigo-50 transition-colors"
            >
              Switch to focus session →
            </a>
          </div>
        </div>
      </main>
    );
  }

  // ── Stalled screen ────────────────────────────────────────────────────────

  if (screen === 'stalled') {
    const focusHref = `/session/new?course=${courseId}&unit_id=${unitId}&force=true&back=${encodeURIComponent(backParam)}`;
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="max-w-lg mx-auto space-y-6">
          <div className="text-xs text-indigo-600 font-semibold uppercase">Bloom&apos;s ladder</div>

          <LadderProgress
            availableRungs={ls.availableRungs}
            currentRung={ls.currentRung}
            highestRungPassed={ls.highestRungPassed}
            lastFiveAttempts={lastFive}
          />

          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3 text-sm text-gray-700">
            <p className="font-medium">This rung is challenging — that&apos;s okay.</p>
            <ul className="space-y-1.5 text-gray-600 list-none">
              <li>• Keep going — your average will improve as you answer more correctly</li>
              <li>• Switch to a focus session to revisit the fundamentals before climbing further</li>
              <li>• Take a break and come back tomorrow</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              onClick={advanceQuestion}
              className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors"
            >
              Continue
            </button>
            <a
              href={focusHref}
              className="flex-1 text-center py-3 rounded-xl border border-indigo-300 text-indigo-700 font-semibold text-sm hover:bg-indigo-50 transition-colors"
            >
              Switch to focus →
            </a>
            <BackButton fallback={backParam} />
          </div>
        </div>
      </main>
    );
  }

  // ── Top of ladder screen ──────────────────────────────────────────────────

  if (screen === 'top') {
    const topRung  = ls.availableRungs[ls.availableRungs.length - 1];
    const nextUnit = `/unit/${unitId}?course=${courseId}&back=${encodeURIComponent(backParam)}`;
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="max-w-lg mx-auto space-y-6">
          <div className="text-xs text-indigo-600 font-semibold uppercase">Bloom&apos;s ladder</div>

          <LadderProgress
            availableRungs={ls.availableRungs}
            currentRung={topRung}
            highestRungPassed={topRung}
            lastFiveAttempts={[]}
          />

          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3 text-sm text-gray-700">
            <p className="font-semibold text-gray-900">You&apos;ve reached the top of this unit&apos;s ladder.</p>
            <p>
              This unit&apos;s curriculum extends to L{topRung} —{' '}
              {BLOOM_LABELS[topRung] ?? `Level ${topRung}`}. You&apos;ve demonstrated consistent
              competence across {ls.availableRungs.length === 1 ? 'this cognitive level' : 'all cognitive levels'}.
            </p>
          </div>

          <div className="flex gap-3">
            <BackButton fallback={backParam} />
            <a
              href={`/progress?course=${courseId}&back=${encodeURIComponent(backParam)}`}
              className="flex-1 text-center py-3 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition-colors"
            >
              View progress →
            </a>
          </div>
        </div>
      </main>
    );
  }

  // ── Question screen ───────────────────────────────────────────────────────

  if (questions.length === 0 || screen !== 'question') {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading…</p>
      </main>
    );
  }

  const q = questions[qIndex];
  const isEssay = q.bloom_level >= 4;

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <BackButton fallback={backParam} />
          <span className="text-xs text-indigo-600 font-semibold uppercase">Bloom&apos;s ladder</span>
        </div>

        <LadderProgress
          availableRungs={ls.availableRungs}
          currentRung={ls.currentRung}
          highestRungPassed={ls.highestRungPassed}
          lastFiveAttempts={lastFive}
        />

        <div className="w-full bg-gray-200 rounded-full h-1">
          <div
            className="bg-indigo-500 h-1 rounded-full transition-all"
            style={{ width: `${((qIndex + 1) / questions.length) * 100}%` }}
          />
        </div>

        {isEssay ? (
          <EssayCard
            question={q}
            courseId={courseId}
            onNext={handleNext}
            onAttempted={() => {}}
            sessionMode="ladder"
            unitId={unitId}
            onLadderResult={handleLadderResultFromEssay}
          />
        ) : (
          <>
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
                Next →
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default function LadderPage() {
  return (
    <Suspense>
      <LadderContent />
    </Suspense>
  );
}
