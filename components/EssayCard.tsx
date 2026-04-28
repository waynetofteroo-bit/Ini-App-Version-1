'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

interface EssayQuestion {
  id: string;
  stem: string;
  bloom_level: number;
  topicLabel: string;
  marks: number | null;
  command_word: string | null;
  model_answer: string | null;
}

interface MarkingResponse {
  band: string;
  score: number;
  bloom_demonstrated: number;
  gaps: string[];
  mark_points_awarded: string[];
  mark_points_missed: string[];
  feedback: string;
  answer_log_id: string | null;
}

interface EssayCardProps {
  question: EssayQuestion;
  courseId: string;
  onNext: () => void;
  onAttempted: (questionId: string) => void;
}

type EssayState =
  | 'idle'
  | 'confirming'
  | 'submitting'
  | 'feedback'
  | 'remark_form'
  | 'remark_sent'
  | 'rate_limited'
  | 'failed';

// ── Constants ────────────────────────────────────────────────────────────────

const BLOOM_LABELS: Record<number, string> = {
  1: 'Remember', 2: 'Understand', 3: 'Apply', 4: 'Analyse', 5: 'Evaluate',
};

const MARKING_MESSAGES = [
  'Reading your response…',
  'Comparing against mark scheme…',
  'Generating feedback…',
];

const BAND_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  Full:    { bg: 'bg-green-50',  text: 'text-green-800',  border: 'border-green-200', dot: 'bg-green-500'  },
  Good:    { bg: 'bg-blue-50',   text: 'text-blue-800',   border: 'border-blue-200',  dot: 'bg-blue-500'   },
  Partial: { bg: 'bg-amber-50',  text: 'text-amber-800',  border: 'border-amber-200', dot: 'bg-amber-500'  },
  Minimal: { bg: 'bg-red-50',    text: 'text-red-800',    border: 'border-red-200',   dot: 'bg-red-500'    },
};

const LOW_BANDS = new Set(['Partial', 'Minimal']);

// ── Helpers ──────────────────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

// ── Component ────────────────────────────────────────────────────────────────

export function EssayCard({ question, courseId, onNext, onAttempted }: EssayCardProps) {
  const [state, setState]         = useState<EssayState>('idle');
  const [response, setResponse]   = useState('');
  const [result, setResult]       = useState<MarkingResponse | null>(null);
  const [errorMsg, setErrorMsg]   = useState('');
  const [remarkNote, setRemarkNote] = useState('');
  const [msgIdx, setMsgIdx]       = useState(0);
  const [showSlow, setShowSlow]   = useState(false);

  // Feedback panel collapse states — both closed by default
  const [showQuestion, setShowQuestion]     = useState(false);
  const [showResponse, setShowResponse]     = useState(false);
  const [showModelAnswer, setShowModelAnswer] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const wordCount  = countWords(response);
  const targetWords = question.marks ? question.marks * 30 : 180;
  const maxMarks   = question.marks ?? 6;

  // ── Textarea auto-grow ──────────────────────────────────────────────────

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = 24;
    const isMobile  = window.innerWidth < 768;
    const maxRows   = isMobile ? 10 : 20;
    const minPx     = 6 * lineHeight;
    const maxPx     = maxRows * lineHeight;
    el.style.height = `${Math.min(Math.max(el.scrollHeight, minPx), maxPx)}px`;
  }, []);

  useEffect(() => { adjustHeight(); }, [response, adjustHeight]);

  // ── Marking progress messages ───────────────────────────────────────────

  useEffect(() => {
    if (state !== 'submitting') {
      setMsgIdx(0);
      setShowSlow(false);
      return;
    }
    const msgTimer  = setInterval(() => setMsgIdx(i => (i + 1) % MARKING_MESSAGES.length), 2500);
    const slowTimer = setTimeout(() => setShowSlow(true), 10000);
    return () => { clearInterval(msgTimer); clearTimeout(slowTimer); };
  }, [state]);

  // ── Handlers ────────────────────────────────────────────────────────────

  function handleSubmitClick() {
    if (!response.trim()) return;
    setState('confirming');
  }

  function handleCancelConfirm() {
    setState(response.trim() ? 'idle' : 'idle');
  }

  async function handleConfirmSubmit() {
    setState('submitting');
    // Record attempt at submission time (matches MCQ handleConfirm timing)
    onAttempted(question.id);

    try {
      const res = await fetch('/api/mark/extended', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          question_id:      question.id,
          user_course_id:   courseId,
          student_response: response,
          bloom_target:     question.bloom_level,
        }),
      });

      if (res.status === 429) {
        setState('rate_limited');
        return;
      }

      const data = await res.json() as MarkingResponse & { error?: string };

      if (!res.ok) {
        setErrorMsg(data.error ?? 'An unexpected error occurred.');
        setState('failed');
        return;
      }

      setResult(data);
      setState('feedback');
    } catch {
      setErrorMsg('Network error — please check your connection.');
      setState('failed');
    }
  }

  async function handleRemarkSubmit() {
    if (!result?.answer_log_id) return;
    await fetch('/api/mark/remark', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ answer_log_id: result.answer_log_id, note: remarkNote }),
    });
    setState('remark_sent');
  }

  function handleRetry() {
    setResponse('');
    setResult(null);
    setRemarkNote('');
    setShowQuestion(false);
    setShowResponse(false);
    setShowModelAnswer(false);
    setState('idle');
  }

  // ── Render helpers ───────────────────────────────────────────────────────

  const bandStyle = result ? (BAND_STYLES[result.band] ?? BAND_STYLES['Minimal']) : null;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">

      {/* ── Bloom badge + topic label (matches QuestionCard) ── */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
          {BLOOM_LABELS[question.bloom_level] ?? `L${question.bloom_level}`}
        </span>
        <span>{question.topicLabel}</span>
      </div>

      {/* ────────────────────────────────── IDLE / CONFIRMING ── */}
      {(state === 'idle' || state === 'confirming') && (
        <>
          <p className="text-base font-medium text-gray-900">{question.stem}</p>

          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="font-medium text-gray-700">{maxMarks} marks</span>
            {question.command_word && (
              <span>Command word: <span className="font-medium text-gray-700">{question.command_word}</span></span>
            )}
          </div>

          <textarea
            ref={textareaRef}
            value={response}
            onChange={e => setResponse(e.target.value)}
            placeholder="Write your response here…"
            className="w-full rounded-lg border border-gray-300 text-sm text-gray-900 p-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder:text-gray-400"
            style={{ minHeight: '144px', overflowY: 'auto' }}
            disabled={state === 'confirming'}
          />

          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>
              {wordCount} word{wordCount !== 1 ? 's' : ''} · aim for ~{targetWords}
            </span>
          </div>

          <button
            onClick={handleSubmitClick}
            disabled={!response.trim()}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            Submit for marking →
          </button>

          {/* Confirmation modal */}
          {state === 'confirming' && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
              <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl space-y-4">
                <h3 className="text-base font-semibold text-gray-900">Submit for marking?</h3>
                <p className="text-sm text-gray-500">You can't edit your response after submitting.</p>
                <div className="flex gap-3">
                  <button
                    onClick={handleCancelConfirm}
                    className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmSubmit}
                    className="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
                  >
                    Submit
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ────────────────────────────────── SUBMITTING ── */}
      {state === 'submitting' && (
        <div className="py-6 space-y-6">
          {/* Submitted response preview */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">Your response</p>
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-700 line-clamp-4">
              {response}
            </div>
          </div>

          {/* Animated dots */}
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex gap-2">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            <p className="text-sm text-gray-600 font-medium">Marking your response</p>
            <p className="text-xs text-gray-400 transition-all">{MARKING_MESSAGES[msgIdx]}</p>
            {showSlow && (
              <p className="text-xs text-gray-400 italic">Still working — almost there…</p>
            )}
          </div>
        </div>
      )}

      {/* ────────────────────────────────── RATE LIMITED ── */}
      {state === 'rate_limited' && (
        <div className="py-4 space-y-4">
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
            <p className="text-sm font-medium text-amber-800">Daily marking limit reached</p>
            <p className="text-xs text-amber-700 mt-1">You've used all 50 essay marks for today. Your limit resets at midnight.</p>
          </div>
          <button
            onClick={onNext}
            className="w-full py-3 rounded-xl bg-gray-900 text-white font-semibold text-sm hover:bg-gray-800 transition-colors"
          >
            Next question →
          </button>
        </div>
      )}

      {/* ────────────────────────────────── FAILED ── */}
      {state === 'failed' && (
        <div className="py-4 space-y-4">
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm font-medium text-red-800">Marking failed</p>
            <p className="text-xs text-red-700 mt-1">{errorMsg}</p>
            <p className="text-xs text-red-600 mt-1">Your response has been saved. You can try again.</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleConfirmSubmit}
              className="flex-1 py-3 rounded-xl border border-indigo-300 text-indigo-700 font-semibold text-sm hover:bg-indigo-50 transition-colors"
            >
              Try again
            </button>
            <button
              onClick={onNext}
              className="flex-1 py-3 rounded-xl bg-gray-900 text-white font-semibold text-sm hover:bg-gray-800 transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* ────────────────────────────────── FEEDBACK ── */}
      {(state === 'feedback' || state === 'remark_form' || state === 'remark_sent') && result && bandStyle && (
        <div className="space-y-4">

          {/* Score banner */}
          <div className={`rounded-lg border px-4 py-3 ${bandStyle.bg} ${bandStyle.border}`}>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${bandStyle.dot}`} />
              <span className={`text-lg font-bold ${bandStyle.text}`}>
                {result.score} / {maxMarks}
              </span>
              <span className={`text-sm font-medium ${bandStyle.text}`}>
                — {result.band}
              </span>
            </div>
          </div>

          {/* Collapsible: The question */}
          <Collapsible label="The question" open={showQuestion} onToggle={() => setShowQuestion(v => !v)}>
            <p className="text-sm text-gray-700">{question.stem}</p>
          </Collapsible>

          {/* Collapsible: Your response */}
          <Collapsible label="Your response" open={showResponse} onToggle={() => setShowResponse(v => !v)}>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{response}</p>
          </Collapsible>

          {/* Mark points awarded */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Mark points awarded ({result.mark_points_awarded.length})
            </p>
            {result.mark_points_awarded.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No mark points awarded — see what was needed below.</p>
            ) : (
              <ul className="space-y-1">
                {result.mark_points_awarded.map((pt, i) => (
                  <li key={i} className="flex gap-2 text-sm text-green-700">
                    <span className="mt-0.5 flex-shrink-0">✓</span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Mark points missed */}
          {result.mark_points_missed.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Mark points missed ({result.mark_points_missed.length})
              </p>
              <ul className="space-y-1">
                {result.mark_points_missed.map((pt, i) => (
                  <li key={i} className="flex gap-2 text-sm text-red-700">
                    <span className="mt-0.5 flex-shrink-0">✗</span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Feedback paragraph */}
          {result.feedback && (
            <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-3">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1.5">Feedback</p>
              <p className="text-sm text-indigo-900">{result.feedback}</p>
            </div>
          )}

          {/* Gaps */}
          {result.gaps.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Areas to revisit</p>
              <ul className="space-y-1">
                {result.gaps.map((gap, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-600">
                    <span className="text-gray-400 mt-0.5 flex-shrink-0">·</span>
                    <span>{gap}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Model answer — only on Partial/Minimal AND when non-null */}
          {LOW_BANDS.has(result.band) && question.model_answer && (
            <Collapsible
              label="See an example strong response"
              open={showModelAnswer}
              onToggle={() => setShowModelAnswer(v => !v)}
            >
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{question.model_answer}</p>
            </Collapsible>
          )}

          <div className="pt-1 border-t border-gray-100" />

          {/* Re-mark section */}
          {state === 'feedback' && (
            <div className="space-y-3">
              <div className="flex gap-3">
                <button
                  onClick={handleRetry}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Try again
                </button>
                <button
                  onClick={() => setState('remark_form')}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Request re-mark
                </button>
              </div>
              <p className="text-center text-xs text-gray-400">Retries don't affect your spaced repetition schedule.</p>
              <button
                onClick={onNext}
                className="w-full py-3 rounded-xl bg-gray-900 text-white font-semibold text-sm hover:bg-gray-800 transition-colors"
              >
                Next question →
              </button>
            </div>
          )}

          {/* Re-mark form */}
          {state === 'remark_form' && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Why are you requesting a re-mark?</p>
              <textarea
                value={remarkNote}
                onChange={e => setRemarkNote(e.target.value)}
                placeholder="Why are you requesting a re-mark? (optional)"
                className="w-full rounded-lg border border-gray-300 text-sm p-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                rows={3}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setState('feedback')}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRemarkSubmit}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
                >
                  Submit request
                </button>
              </div>
            </div>
          )}

          {/* Re-mark sent */}
          {state === 'remark_sent' && (
            <div className="space-y-3">
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3">
                <p className="text-sm font-medium text-green-800">Re-mark request logged</p>
                <p className="text-xs text-green-700 mt-1">We'll review it within 48 hours.</p>
              </div>
              <button
                onClick={onNext}
                className="w-full py-3 rounded-xl bg-gray-900 text-white font-semibold text-sm hover:bg-gray-800 transition-colors"
              >
                Next question →
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

// ── Collapsible helper ───────────────────────────────────────────────────────

function Collapsible({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</span>
        <span className="text-gray-400 text-sm">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 bg-gray-50 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  );
}
