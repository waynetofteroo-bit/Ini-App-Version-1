import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16 bg-gradient-to-br from-indigo-50 to-white">
      <div className="max-w-2xl w-full text-center space-y-6">
        <h1 className="text-5xl font-extrabold text-indigo-700 tracking-tight">ini</h1>
        <p className="text-xl text-gray-600">
          AI-powered revision for GCSE &amp; A-Level students in Wales.
          <br />
          Adaptive quizzes. Smart scheduling. Real exam focus.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link
            href="/auth/signup"
            className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-semibold text-base hover:bg-indigo-700 transition-colors shadow"
          >
            Get started free
          </Link>
          <Link
            href="/auth/login"
            className="px-6 py-3 rounded-xl border border-indigo-200 text-indigo-700 font-semibold text-base hover:bg-indigo-50 transition-colors"
          >
            Log in
          </Link>
        </div>
        <p className="text-sm text-gray-400 mt-4">
          Starting with WJEC GCSE Physics Double Award. More courses coming soon.
        </p>
      </div>
    </main>
  );
}
