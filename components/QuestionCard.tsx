'use client';

interface Option {
  text: string;
  idx: number;
}

interface QuestionCardProps {
  stem: string;
  options: Option[];
  bloomLevel: number;
  topicLabel: string;
  selectedIdx: number | null;
  correctIdx: number;
  revealed: boolean;
  onSelect: (idx: number) => void;
}

const BLOOM_LABELS: Record<number, string> = {
  1: 'Remember',
  2: 'Understand',
  3: 'Apply',
  4: 'Analyse',
  5: 'Evaluate',
};

export function QuestionCard({
  stem,
  options,
  bloomLevel,
  topicLabel,
  selectedIdx,
  correctIdx,
  revealed,
  onSelect,
}: QuestionCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
          {BLOOM_LABELS[bloomLevel] ?? `L${bloomLevel}`}
        </span>
        <span>{topicLabel}</span>
      </div>
      <p className="text-base font-medium text-gray-900">{stem}</p>
      <div className="space-y-2">
        {options.map((opt) => {
          let cls =
            'w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ';
          if (!revealed) {
            cls +=
              selectedIdx === opt.idx
                ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50';
          } else {
            if (opt.idx === correctIdx) {
              cls += 'border-green-500 bg-green-50 text-green-900';
            } else if (opt.idx === selectedIdx) {
              cls += 'border-red-400 bg-red-50 text-red-900';
            } else {
              cls += 'border-gray-200 text-gray-400';
            }
          }
          return (
            <button
              key={opt.idx}
              className={cls}
              onClick={() => !revealed && onSelect(opt.idx)}
              disabled={revealed}
            >
              {opt.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
