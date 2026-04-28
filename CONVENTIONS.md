# ini — Code Conventions

Read before writing any component, utility, or API route.

---

## SM-2 scheduler — `lib/sm2.ts`

Use these functions exactly as written. Do not reimplement inline.

```typescript
export interface SM2State {
  easiness: number;     // default 2.5, floor 1.3
  interval: number;     // days until next review
  repetitions: number;  // number of successful reviews in a row
}

// quality: 0 = incorrect, 1 = hard correct, 2 = good correct, 3 = easy correct
// For MCQ: map correct=false → 0, correct=true → 2
export function calcNextInterval(state: SM2State, quality: number): SM2State {
  const q = quality;
  let { easiness, interval, repetitions } = state;

  if (q < 2) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easiness);
    repetitions += 1;
  }

  easiness = Math.max(1.3, easiness + 0.1 - (3 - q) * (0.08 + (3 - q) * 0.02));
  return { easiness, interval, repetitions };
}

// Blends retention interval with urgency interval based on exam proximity
// examDaysLeft < 90 → urgency weight increases linearly to 1.0
export function blendIntervalDrivers(
  retentionInterval: number,
  urgencyInterval: number,
  examDaysLeft: number
): number {
  const urgencyWeight = Math.min(1, Math.max(0, 1 - examDaysLeft / 90));
  return Math.round(
    (1 - urgencyWeight) * retentionInterval + urgencyWeight * urgencyInterval
  );
}

// Compute blended_score for queue ordering
// Higher score = more urgent to review
export function calcBlendedScore(nextReviewAt: Date, examDate: Date): number {
  const now = Date.now();
  const daysOverdue = Math.max(0, (now - nextReviewAt.getTime()) / 86400000);
  const examDaysLeft = Math.max(1, (examDate.getTime() - now) / 86400000);
  const urgency = 1 - Math.min(1, examDaysLeft / 90);
  return daysOverdue * 0.6 + urgency * 0.4;
}
```

---

## Claude API — `lib/claude.ts`

Always use these wrappers. Never call `new Anthropic()` inline in route files.

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env automatically

export async function callClaude(
  systemPrompt: string,    // static, developer-controlled only
  userMessage: string,     // user/student content — passed as messages[], never in system
  maxTokens = 1000
): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });
  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type');
  return block.text;
}

// Use when you need structured JSON back from Claude
export async function callClaudeJSON<T>(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 1000
): Promise<T> {
  const raw = await callClaude(
    systemPrompt + '\n\nRespond ONLY with valid JSON. No markdown fences, no preamble.',
    userMessage,
    maxTokens
  );
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Claude returned invalid JSON: ${raw.slice(0, 200)}`);
  }
}
```

---

## Bloom's taxonomy levels

| Level | Label | Question types |
|---|---|---|
| L1 | Remember | MCQ recall, definitions |
| L2 | Understand | MCQ explain, describe |
| L3 | Apply | MCQ calculation, use formula |
| L4 | Analyse | Extended response — evaluate, compare |
| L5 | Evaluate / Create | Extended response — synoptic, design, justify |

**MCQ:** bloom_level 1–3 only.
**Extended response:** bloom_level 4–5. Requires `marking_prompt` JSONB on question.
**Dual-marking:** bloom_level 5 only. Two independent Claude calls are made with the same prompt. If both passes agree on the band, that band is used as-is. If they disagree, the **lower band wins** (conservative arbitration); gaps and missed mark points from both passes are merged as a deduplicated union. Both calls are written to `marking_audit_log` (so L5 attempts always produce two audit rows). bloom_level 4 uses a single pass.

**Marking bands (L4–L5):** `Full` · `Good` · `Partial` · `Minimal`

---

## Extended response marking — `app/api/mark/extended/route.ts`

```typescript
// POST body: { question_id, student_response, bloom_target, user_course_id }
// bloom_target should equal the question's bloom_level (4 or 5).

// Prompt is built by lib/marking/build-prompt.ts → buildMarkingPrompt().
// Progressive enrichment: includes command_word, ao, wjec_tier, technique,
// mark scheme points, indicative content, levels-based rubric, model answer,
// and examiner notes only when non-null. Prompt version: MARKING_PROMPT_VERSION.

// bloom_target === 4: single Claude call (claude-sonnet-4-6, temperature 0)
// bloom_target === 5: two independent Claude calls; arbitrate if bands differ
//   Arbitration: lower band wins; gaps + missed points merged (deduped union)
//   Both calls written to marking_audit_log → L5 always produces 2 audit rows.

// Response: { band, score, bloom_demonstrated, gaps,
//             mark_points_awarded, mark_points_missed, feedback, answer_log_id }

// Re-mark request: POST /api/mark/remark { answer_log_id, note }
//   Sets answer_log.marking_status = 'under_review', saves note.
```

---

## Supabase client patterns

```typescript
// lib/supabase/server.ts — use in Server Components and API routes
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } }
  );
}

// lib/supabase/client.ts — use in Client Components
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

---

## API route pattern

```typescript
// Standard pattern for all API routes
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = createClient();

  // Always derive user_id server-side
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  // Parse and validate query params
  const { searchParams } = new URL(request.url);
  const courseId = searchParams.get('course');
  if (!courseId) return NextResponse.json({ error: 'Missing course param' }, { status: 400 });

  // Query — always scope to user_id
  const { data, error } = await supabase
    .from('sm2_queue')
    .select('*')
    .eq('user_id', user.id)
    .eq('user_course_id', courseId)
    .lte('next_review_at', new Date().toISOString())
    .order('blended_score', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
```

---

## Back navigation — always encode `?back=`

```typescript
// When navigating forward, always pass back destination
import { usePathname } from 'next/navigation';

const pathname = usePathname();
const href = `/progress?course=${courseId}&back=${encodeURIComponent(pathname)}`;
```

```tsx
// BackButton reads and uses it
'use client';
import { useRouter, useSearchParams } from 'next/navigation';

export function BackButton({ fallback = '/dashboard' }: { fallback?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const handleBack = () => {
    const back = params.get('back');
    router.push(back ? decodeURIComponent(back) : fallback);
  };
  return <button onClick={handleBack} aria-label="Go back">← Back</button>;
}
```

---

## Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Component files | PascalCase | `CourseCard.tsx` |
| Route files | lowercase | `route.ts`, `page.tsx` |
| DB columns | snake_case | `user_course_id` |
| TypeScript types | PascalCase | `SM2State`, `CourseCard` |
| Env vars | SCREAMING_SNAKE | `ANTHROPIC_API_KEY` |
| concept_uri | `board:subject:unit:topic` | `wjec:physics:electricity:ohms-law` |

---

## TypeScript types — define in `types/index.ts`

```typescript
export type BloomLevel = 1 | 2 | 3 | 4 | 5;
export type MasteryState = 'unseen' | 'learning' | 'mastered';
export type MarkingBand = 'Full' | 'Good' | 'Partial' | 'Minimal';
export type ExamBoard = 'WJEC' | 'AQA' | 'Edexcel';
export type QualificationLevel = 'GCSE' | 'A-Level';

export interface UserCourse {
  id: string;
  course_id: string;
  exam_date: string;
  active: boolean;
  course: Course;
}

export interface MarkingResult {
  band: MarkingBand;
  score: number;
  bloom_demonstrated: BloomLevel;
  gaps: string[];
  feedback: string;
}
```

---

## Do not

- Do not use `any` type in TypeScript
- Do not write inline SQL strings in components — queries belong in API routes
- Do not call `supabase.from(...)` in Client Components — always go through API routes
- Do not hardcode UUIDs — always look them up by code (e.g. `course_code = 'WJEC-GCSE-PHY-DA'`)
- Do not seed questions by hand — use the `/api/ingest` pipeline
- Do not use `router.back()` as the primary back mechanism — always use `?back=` param
