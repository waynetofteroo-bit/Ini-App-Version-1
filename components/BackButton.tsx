'use client';
import { useRouter, useSearchParams } from 'next/navigation';

export function BackButton({ fallback = '/dashboard' }: { fallback?: string }) {
  const router = useRouter();
  const params = useSearchParams();

  const handleBack = () => {
    const back = params.get('back');
    router.push(back ? decodeURIComponent(back) : fallback);
  };

  return (
    <button
      onClick={handleBack}
      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
    >
      ← Back
    </button>
  );
}
