# ini — Claude Code Project Context

## What is ini?

ini (ini-edu) is an AI-powered revision and assessment platform for GCSE and A-Level students in Wales. The initial beachhead is WJEC GCSE Physics Double Award.

**Core value proposition:** Personalised spaced repetition (SM-2) mapped to Bloom's taxonomy levels L1–5, scoped to official WJEC curriculum units and topics, with AI-marked extended response questions at L4–5.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, App Router, TypeScript |
| Auth + DB | Supabase (Auth, Postgres, RLS, Storage) |
| Hosting | Vercel |
| AI | Anthropic Claude API — `claude-sonnet-4-20250514` |
| Visualisation | Cytoscape.js (knowledge graph) |
| Scheduling | SM-2 algorithm with dual-driver blending |

**Supabase project ID:** `jsxdttvioxodkiydowod`

---

## Supporting docs — read these before working on each area

| File | When to read |
|---|---|
| `ARCHITECTURE.md` | Before touching any route, page, or API file |
| `SCHEMA.md` | Before any DB query, migration, or Supabase call |
| `SECURITY.md` | Before every file — non-negotiable |
| `CONVENTIONS.md` | Before writing any component or utility |
| `CONTENT-PIPELINE.md` | Before working on ingestion or seeding |

---

## Absolute rules — enforced on every file

1. **No prompt injection.** User input is NEVER interpolated into Claude API system prompts. Always pass it as a separate `messages[{role:'user'}]` entry via the structured API.
2. **RLS on every user table.** Every table that stores user data has Row Level Security enabled with `auth.uid()` policies. Content tables (courses, units, questions, knowledge_graph_nodes, knowledge_graph_edges) are public read, no RLS.
3. **No secrets in client bundles.** `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are server-only. Only `NEXT_PUBLIC_*` vars go to the client.
4. **Back navigation via `?back=` param.** Every forward navigation appends `?back=${encodeURIComponent(currentPath)}`. The `BackButton` component reads this. Never rely solely on `router.back()`.
5. **SM-2 queue is always course-scoped.** Every `sm2_queue` query filters by `user_course_id`. Never return cross-course cards.
6. **Progress rollup is always course-scoped.** `progress_rollup` view queries always include `WHERE uc.id = $user_course_id`.

---

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
ADMIN_SECRET=
```

---

## Build order

When building from scratch, follow this sequence to avoid import errors:

1. Schema migrations (see `SCHEMA.md`, all 12 objects in order)
2. `lib/supabase/client.ts` + `lib/supabase/server.ts`
3. `lib/sm2.ts`
4. `lib/claude.ts`
5. `components/BackButton.tsx`
6. `middleware.ts`
7. `app/auth/*`
8. `app/onboarding/page.tsx` + `app/api/onboarding/enrol/route.ts`
9. `app/courses/page.tsx` + `app/api/courses/*`
10. `app/dashboard/page.tsx`
11. `app/session/[id]/page.tsx` + `app/api/session/*`
12. `app/progress/page.tsx` + `app/progress/topic/[topicId]/page.tsx` + `app/api/progress/*`
13. `app/api/mark/extended/route.ts`
14. `app/api/ingest/route.ts`
15. `app/curriculum/page.tsx`
16. Seed data (courses + units, then run `/api/ingest` per unit for questions)
