'use client';
import { BLOOM_LABELS } from '@/lib/ladder/config';

interface LadderProgressProps {
  availableRungs: number[];    // e.g. [1,3,5] — rendered as n adjacent rungs
  currentRung: number;
  highestRungPassed: number;
  lastFiveAttempts: boolean[]; // up to 5 items; true = correct
}

export function LadderProgress({
  availableRungs,
  currentRung,
  highestRungPassed,
  lastFiveAttempts,
}: LadderProgressProps) {
  return (
    <div className="space-y-2">
      {/* Rung row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {availableRungs.map((rung) => {
          const passed  = rung <= highestRungPassed;
          const current = rung === currentRung && !passed;
          const locked  = rung > currentRung;

          return (
            <div
              key={rung}
              title={`L${rung} — ${BLOOM_LABELS[rung] ?? ''}`}
              className={`
                flex items-center justify-center rounded px-2 py-1 text-xs font-semibold select-none
                ${passed  ? 'bg-indigo-500 text-white' : ''}
                ${current ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-400' : ''}
                ${locked  ? 'bg-gray-100 text-gray-400' : ''}
              `}
            >
              {passed  && <span>L{rung} ✓</span>}
              {current && <span>L{rung} ●</span>}
              {locked  && <span>L{rung} 🔒</span>}
            </div>
          );
        })}
      </div>

      {/* Threshold bar — 5 discrete segments */}
      {lastFiveAttempts.length > 0 && (
        <div className="flex items-center gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => {
            const filled = i < lastFiveAttempts.length && lastFiveAttempts[i];
            const empty  = i < lastFiveAttempts.length && !lastFiveAttempts[i];
            return (
              <div
                key={i}
                className={`h-2 flex-1 rounded-full ${
                  filled ? 'bg-indigo-500'
                  : empty ? 'bg-red-300'
                  : 'bg-gray-200'
                }`}
              />
            );
          })}
          <span className="text-xs text-gray-500 ml-1 shrink-0">
            {lastFiveAttempts.filter(Boolean).length}/{lastFiveAttempts.length} correct at L{currentRung}
          </span>
        </div>
      )}
    </div>
  );
}
