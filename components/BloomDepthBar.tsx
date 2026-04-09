interface BloomDepthBarProps {
  distribution: Record<number, number>; // bloomLevel -> count
}

const BLOOM_COLOURS: Record<number, string> = {
  1: 'bg-blue-200',
  2: 'bg-blue-400',
  3: 'bg-indigo-400',
  4: 'bg-indigo-600',
  5: 'bg-purple-600',
};

const BLOOM_LABELS: Record<number, string> = {
  1: 'Remember',
  2: 'Understand',
  3: 'Apply',
  4: 'Analyse',
  5: 'Evaluate',
};

export function BloomDepthBar({ distribution }: BloomDepthBarProps) {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="space-y-1">
      <div className="flex h-4 rounded-full overflow-hidden">
        {[1, 2, 3, 4, 5].map((level) => {
          const count = distribution[level] ?? 0;
          const pct = (count / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={level}
              className={`${BLOOM_COLOURS[level]} transition-all`}
              style={{ width: `${pct}%` }}
              title={`${BLOOM_LABELS[level]}: ${count}`}
            />
          );
        })}
      </div>
      <div className="flex gap-3 flex-wrap">
        {[1, 2, 3, 4, 5].map((level) => (
          <span key={level} className="flex items-center gap-1 text-xs text-gray-500">
            <span className={`inline-block w-2 h-2 rounded-full ${BLOOM_COLOURS[level]}`} />
            {BLOOM_LABELS[level]}
          </span>
        ))}
      </div>
    </div>
  );
}
