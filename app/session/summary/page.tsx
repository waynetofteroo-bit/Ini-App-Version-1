'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { BackButton } from '@/components/BackButton';

function SummaryContent() {
  const params = useSearchParams();
  const backParam = params.get('back') ?? '/dashboard';

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 gap-6">
      <div className="text-center space-y-2">
        <div className="text-5xl">🎉</div>
        <h2 className="text-2xl font-bold text-gray-900">Session complete!</h2>
        <p className="text-gray-500 text-sm">
          Your answers have been recorded and your schedule updated.
        </p>
      </div>
      <BackButton fallback={backParam} />
    </main>
  );
}

export default function SessionSummaryPage() {
  return (
    <Suspense>
      <SummaryContent />
    </Suspense>
  );
}
