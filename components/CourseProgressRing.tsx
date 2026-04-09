interface CourseProgressRingProps {
  pct: number;
  size?: number;
  examLabel?: string;
}

export function CourseProgressRing({
  pct,
  size = 80,
  examLabel,
}: CourseProgressRingProps) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={6} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#6366f1"
          strokeWidth={6}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute text-center">
        <span className="text-xs font-bold text-gray-800">{Math.round(pct)}%</span>
        {examLabel && (
          <p className="text-[10px] text-gray-400 leading-tight">{examLabel}</p>
        )}
      </div>
    </div>
  );
}
