# ini — Architecture

## User flow overview

```
/ (landing)
  └── /auth/signup | /auth/login
        └── [middleware checks user_courses count]
              ├── 0 courses → /onboarding (5-step wizard)
              └── 1+ courses → /courses (course selector)
                    └── /dashboard?course=[id]
                          ├── /session/[id]  (SM-2 queue or filtered)
                          ├── /progress?course=[id]
                          │     └── /progress/topic/[topicId]
                          │           └── /session/[id]  (topic-filtered)
                          └── /curriculum
```

---

## Middleware — `middleware.ts`

Runs on every request to protected routes.

**Protected prefixes:** `/dashboard`, `/session`, `/progress`, `/courses`, `/onboarding/add`, `/curriculum`, `/api/session`, `/api/progress`, `/api/mark`, `/api/graph`, `/api/courses`

**Logic:**
1. Verify Supabase session. No session → redirect `/auth/login`
2. For authenticated requests to `/dashboard`, `/session`, `/progress`, `/curriculum`: check `count(user_courses) where user_id = auth.uid() and active = true`
   - Count = 0 → redirect `/onboarding`
   - Count ≥ 1 → allow through
3. Public: `/`, `/auth/*`

---

## Page specifications

### `/` — Landing
Marketing page. CTAs: "Sign up free" → `/auth/signup`, "Log in" → `/auth/login`. No auth required.

---

### `/auth/signup` and `/auth/login`
Standard Supabase Auth forms. On success → middleware handles redirect.
`/auth/callback/route.ts` handles the OAuth exchange and sets session cookie.

---

### `/onboarding` — 5-step wizard (new users only)

All step state held in React `useState`. Zero DB writes until Step 5 confirm.

| Step | Content | Data source |
|---|---|---|
| 1 | Exam Board radio: WJEC (default) · AQA · Edexcel | Static |
| 2 | Level radio: GCSE · A-Level | Static |
| 3 | Course card grid | `GET /api/courses?board=&level=` |
| 4 | Unit checkbox list (all checked by default) + optional exam date per unit | `GET /api/courses/[id]/units` |
| 5 | Summary confirm → "Start learning →" | `POST /api/onboarding/enrol` |

On submit: writes `user_courses` + `user_units` + seeds `sm2_queue` for selected units only. Redirects to `/courses`.

Back navigation between steps: prev button in wizard UI (in-page state, not URL-based).

---

### `/onboarding/add` — add another course (existing users)

Same 5-step wizard. Skips Step 1 if user already has a course on the same board.
Appends new `user_courses` + `user_units` rows. Does not affect existing course data.
On submit → redirect `/courses`.

---

### `/courses` — course selector (returning users)

Fetch `GET /api/courses/mine`. Renders:
- One `CourseCard` per active `user_courses` row
- Dashed `EnrolAnotherCard` → `/onboarding/add`

**Auto-redirect:** if `user_courses.count === 1`, skip this page and redirect straight to `/dashboard?course=[user_course_id]`.

**`CourseCard` shows:** course name, level badge (GCSE/A-Level), exam board, exam date, progress ring (`course_pct`), units count. "Continue →" → `/dashboard?course=[user_course_id]`.

---

### `/dashboard?course=[id]`

All queries scoped to `?course` param (`user_course_id`).

**Course Context Bar** (top of page):
- Active course name + level badge
- If 2+ courses enrolled: dropdown switcher → updates `?course=` URL param

**Six widgets:**

| Widget | Data | CTA |
|---|---|---|
| Today's Queue | `sm2_queue` where `next_review_at <= now()` and `user_course_id = ?course` | "Practice Now →" `/session/new?course=[id]&back=/dashboard?course=[id]` |
| Knowledge Graph Preview | Cytoscape.js mini-graph, nodes coloured by `mastery_level` | "View full graph →" `/curriculum?course=[id]` |
| Course Progress Summary | `course_pct` from `progress_rollup` | "View full progress →" `/progress?course=[id]&back=/dashboard?course=[id]` |
| Unit Progress Bars | `unit_avg_mastery` per unit, RAG-banded | "Focus here →" `/session/new?unit_id=[id]&back=/dashboard?course=[id]` |
| Weakest Unit Callout | MIN(`unit_avg_mastery`) unit | Same as above |
| Bloom's Depth Profile | Distribution of `bloom_demonstrated` L1–5 from `answer_log` | — |

**RAG bands:** red < 40% · amber 40–70% · green > 70%

---

### `/session/[id]`

**Entry modes (set via query params):**
- `?course=[id]` — SM-2 queue for full course
- `?unit_id=[id]` — filtered to unit
- `?topic_id=[id]` — filtered to topic

**Back button:** reads `?back=` param.
- SM-2 queue entry (`?back=/dashboard?course=[id]`) → back to dashboard
- Progress drill-down entry (`?back=/progress/topic/[topicId]...`) → back to topic page

**Session loop:**
1. Fetch queue from `GET /api/session/queue`
2. Render `QuestionCard` (stem, 4 options, Bloom badge, topic label)
3. Student selects → client shows result + explanation
4. `POST /api/session/answer` → SM-2 update + `answer_log` write (happens before any back navigation)
5. Track answered `question_id[]` in component state + `sessionStorage` as backup
6. On return to session: resume from first unanswered question

**Session badge:** shows mode context e.g. "Unit 1 · Targeted" or "Today's Review"

---

### `/session/summary`

Post-session results. Shows score, gaps identified, next review dates, XP earned.
Back → `/dashboard?course=[id]`

---

### `/progress?course=[id]`

Fetches `GET /api/progress/[userId]?course=[id]`.

**Three-tier layout:**

**Tier 1 — Course:**
- `CourseProgressRing` — circular `course_pct`, exam countdown in centre
- `BloomDepthBar` — stacked L1–L5 bar
- Stat strip: topics mastered/total · questions answered · avg accuracy · streak

**Tier 2 — Unit (UnitAccordion):**
- One row per enrolled unit: name, `unit_avg_mastery` bar, RAG band
- Lowest-scoring unit gets "Focus area" banner
- Per-unit mini Bloom bar inside row
- Expandable to Tier 3

**Tier 3 — Topic (revealed on unit expand):**
- Grid of topic pills: grey=unseen · amber=learning · green=mastered
- Tap pill → `/progress/topic/[topicId]?back=/progress?course=[id]`

---

### `/progress/topic/[topicId]`

**This is a full page, not a drawer.** It must have its own URL so the back chain works.

Back button → reads `?back=` param → returns to `/progress?course=[id]`

**Shows:**
- Topic name, unit name, Bloom ceiling badge
- Bloom breakdown: L1–5 demonstrated vs ceiling
- Last reviewed, next review date
- `gap_flags[]` as "Areas to strengthen"
- Prerequisites from `knowledge_graph_edges` where `relation='prerequisite'`
- Question list for topic (by `concept_id`)

**"Revise this topic →":**
```
/session/new?topic_id=[topicId]&back=/progress/topic/[topicId]?back=${encodeURIComponent(currentBack)}
```

---

### `/curriculum?course=[id]`

Cytoscape.js full knowledge graph for the course.
Nodes coloured by `mastery_level`. Click node → topic detail panel (inline, not navigated).
Fetch `GET /api/graph/[board]` enriched with user mastery via `progress_rollup`.

---

## Back navigation — `components/BackButton.tsx`

```tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';

export function BackButton({ fallback = '/dashboard' }: { fallback?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const handleBack = () => {
    const back = params.get('back');
    router.push(back ? decodeURIComponent(back) : fallback);
  };
  return <button onClick={handleBack}>← Back</button>;
}
```

**Rule:** Every `<Link>` or `router.push()` that navigates forward MUST append `?back=${encodeURIComponent(currentPath)}`. Never rely solely on `router.back()` — it breaks on refresh and direct links.

**Back chains:**

Path A (SM-2 queue):
```
/session/[id] → /dashboard
```

Path B (progress drill-down):
```
/session/[id] → /progress/topic/[topicId] → /progress?course=[id] → /dashboard?course=[id] → /courses
```

---

## API routes

| Route | Method | Description |
|---|---|---|
| `/api/onboarding/enrol` | POST | Write user_courses + user_units + seed SM-2 |
| `/api/courses` | GET | All courses, filtered by `?board=&level=` |
| `/api/courses/mine` | GET | Enrolled courses with progress_pct |
| `/api/courses/[id]/units` | GET | Units for a specific course |
| `/api/session/queue` | GET | SM-2 queue, supports `?unit_id=` and `?topic_id=` filters |
| `/api/session/answer` | POST | Submit answer, run SM-2 update |
| `/api/mark/extended` | POST | Claude marking agent — single-pass L4, dual-pass with conservative arbitration L5; writes answer_log + marking_audit_log |
| `/api/mark/remark`   | POST | Flag an answer_log row for human review (`marking_status = 'under_review'`) |
| `/api/graph/[board]` | GET | Knowledge graph nodes + edges |
| `/api/graph/update` | POST | Async graph state update after session |
| `/api/progress/[userId]` | GET | Full rollup, requires `?course=` param |
| `/api/ingest` | POST | Admin: trigger four-agent pipeline |

---

## File structure

```
app/
  layout.tsx
  page.tsx
  middleware.ts
  auth/signup/page.tsx
  auth/login/page.tsx
  auth/callback/route.ts
  onboarding/page.tsx
  onboarding/add/page.tsx
  courses/page.tsx
  dashboard/page.tsx
  progress/page.tsx
  progress/topic/[topicId]/page.tsx
  session/[id]/page.tsx
  session/summary/page.tsx
  curriculum/page.tsx
  api/onboarding/enrol/route.ts
  api/courses/route.ts
  api/courses/mine/route.ts
  api/courses/[id]/units/route.ts
  api/session/queue/route.ts
  api/session/answer/route.ts
  api/mark/extended/route.ts
  api/graph/[board]/route.ts
  api/graph/update/route.ts
  api/progress/[userId]/route.ts
  api/ingest/route.ts

lib/
  sm2.ts
  claude.ts
  supabase/client.ts
  supabase/server.ts
  supabase/middleware.ts

components/
  BackButton.tsx
  QuestionCard.tsx
  UnitAccordion.tsx
  CourseCard.tsx
  BloomDepthBar.tsx
  CourseProgressRing.tsx

docs/
  ARCHITECTURE.md   ← this file
  SCHEMA.md
  SECURITY.md
  CONVENTIONS.md
  CONTENT-PIPELINE.md
```
