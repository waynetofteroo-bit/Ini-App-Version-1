import Link from 'next/link';
import { BLOOM_LABELS } from '@/lib/ladder/config';

interface LadderEntryCardProps {
  unitId:             string;
  courseId:           string;
  availableRungs:     number[];
  hasEntered:         boolean; // true if ladder_state row exists (student has entered before)
  currentRung:        number;
  highestRungPassed:  number;
  reachedTop:         boolean;
  attemptCount:       number;
  correctCount:       number;
  backPath:           string;
}

export function LadderEntryCard({
  unitId,
  courseId,
  availableRungs,
  hasEntered,
  currentRung,
  highestRungPassed,
  reachedTop,
  attemptCount,
  correctCount,
  backPath,
}: LadderEntryCardProps) {
  if (availableRungs.length === 0) return null;

  const topRung    = availableRungs[availableRungs.length - 1];
  const startRung  = availableRungs[0];
  // "not started" = student has never clicked into the ladder session for this unit
  const notStarted = !hasEntered;

  const href = `/session/ladder/${unitId}?course=${courseId}&back=${encodeURIComponent(backPath)}`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">Bloom&apos;s ladder</p>
          <p className="text-xs text-gray-500 mt-0.5">Climb cognitive levels in this unit</p>
        </div>
        <span className="text-lg leading-none">🪜</span>
      </div>

      {reachedTop ? (
        <p className="text-xs text-indigo-700 font-medium">
          You&apos;ve reached the top of this unit&apos;s ladder
        </p>
      ) : notStarted ? (
        <p className="text-xs text-gray-600">
          Begin at L{startRung} — {BLOOM_LABELS[startRung] ?? `Level ${startRung}`}
        </p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs text-gray-600">
            Currently on rung: L{currentRung} — {BLOOM_LABELS[currentRung] ?? `Level ${currentRung}`}
          </p>
          {attemptCount > 0 && (
            <div className="flex items-center gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${i < attemptCount
                    ? (i < correctCount ? 'bg-indigo-500' : 'bg-red-300')
                    : 'bg-gray-200'
                  }`}
                />
              ))}
              <span className="text-xs text-gray-400 shrink-0 ml-0.5">
                {correctCount}/{attemptCount}
              </span>
            </div>
          )}
          <p className="text-xs text-gray-400">
            Ladder reaches L{topRung} — {BLOOM_LABELS[topRung] ?? `Level ${topRung}`} in this unit
          </p>
        </div>
      )}

      <Link
        href={href}
        className="block text-center text-xs font-semibold py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
      >
        {reachedTop
          ? 'Review the ladder'
          : notStarted
            ? `Begin at L${startRung} →`
            : 'Continue climbing →'}
      </Link>
    </div>
  );
}
