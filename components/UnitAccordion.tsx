'use client';
import { useState } from 'react';
import Link from 'next/link';

interface Topic {
  id: string;
  label: string;
  mastery: number; // 0-1
}

interface UnitRow {
  unitId: string;
  unitName: string;
  unitMastery: number; // 0-1
  topics: Topic[];
}

interface UnitAccordionProps {
  units: UnitRow[];
  courseId: string;
  currentPath: string;
}

function ragClass(mastery: number) {
  if (mastery >= 0.7) return 'bg-green-500';
  if (mastery >= 0.4) return 'bg-amber-400';
  return 'bg-red-400';
}

function topicPillClass(mastery: number) {
  if (mastery >= 0.7) return 'bg-green-100 text-green-800 border-green-200';
  if (mastery > 0) return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-gray-100 text-gray-500 border-gray-200';
}

export function UnitAccordion({ units, courseId, currentPath }: UnitAccordionProps) {
  const [open, setOpen] = useState<string | null>(null);
  const weakest = [...units].sort((a, b) => a.unitMastery - b.unitMastery)[0];

  return (
    <div className="space-y-2">
      {units.map((unit) => (
        <div key={unit.unitId} className="rounded-xl border border-gray-200 overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
            onClick={() => setOpen(open === unit.unitId ? null : unit.unitId)}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-900">{unit.unitName}</span>
              {unit.unitId === weakest?.unitId && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  Focus area
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="w-24 h-2 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className={`h-full rounded-full ${ragClass(unit.unitMastery)}`}
                  style={{ width: `${unit.unitMastery * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 w-8 text-right">
                {Math.round(unit.unitMastery * 100)}%
              </span>
              <span className="text-gray-400">{open === unit.unitId ? '▲' : '▼'}</span>
            </div>
          </button>
          {open === unit.unitId && (
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
              <div className="flex flex-wrap gap-2">
                {unit.topics.map((topic) => {
                  const dest = `/progress/topic/${topic.id}?back=${encodeURIComponent(currentPath)}`;
                  return (
                    <Link
                      key={topic.id}
                      href={dest}
                      className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors hover:opacity-80 ${topicPillClass(topic.mastery)}`}
                    >
                      {topic.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
