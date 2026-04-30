# DEMO_STATUS.md

Last updated: 2026-04-30 (session 6 — Bloom's ladder, iteration 1 complete)

---

## What works in the live demo today

**WJEC GCSE Physics Double Award (course code: WJEC-GCSE-PHY-DA)**

Three study modes are now live on each unit:

- **SM-2 spaced repetition review** — course-scoped queue, blended retention + urgency scoring
- **Focus session** — unit-filtered, force-load (bypasses due-date gate)
- **Bloom's ladder** — iteration 1 complete per design proposal §1

Ladder specifics:
- Unit study hub at `/unit/[unitId]?course=[courseId]` — mode selection card for all three modes; accessible from unit accordion on the progress page via "Study this unit →"
- Ladder session at `/session/ladder/[unitId]?course=[courseId]`
- Variable-height ladder per unit — rungs are the Bloom's levels that have at least one question; derived at render time, not stored
- Non-contiguous levels (e.g. L1, L3, L5) rendered as adjacent rungs; skip explanation shown only on the rung-passed transition screen
- Persistent state in `ladder_state` (migration 017); self-heals if content is removed mid-climb
- Pass threshold: 60% over last 5 ladder-mode attempts, minimum 3 before threshold fires
- MCQ and essay answers both feed the threshold via `answer_log.session_mode = 'ladder'`
- Rung advancement evaluated and written server-side in the answer handler — no client PATCH
- Six screens: intro (one-time per browser, localStorage flag), question, rung-passed transition, rung-exhausted, stalled, reached-top
- `ladder_state` row is created on first entry to the ladder session, not on unit hub view — so "not started" on the entry card means the student has never clicked into the session

Content coverage report (per-unit Bloom's coverage, ladder shapes, authoring priorities): `docs/reports/ladder-coverage-2026-04.md`

**Tunables in `lib/ladder/config.ts`** (change requires redeploy — see Known Limitations):

| Key | Default | Effect |
|---|---|---|
| `passThreshold` | 0.60 | MCQ pass rate required to advance a rung |
| `evaluationWindow` | 5 | Last N attempts evaluated for threshold |
| `minimumAttemptsForEval` | 3 | Minimum attempts before threshold fires |
| `recentAttemptExclusionHours` | 4 | Hours before a question recurs in a session |
| `essayPassThreshold` | 0.60 | Essay score fraction (of max marks) that sets `answer_log.correct = true` for ladder essays; applied at write time in `/api/mark/extended` |

**Other features**

- Auth: sign-up, login, session via Supabase Auth
- Onboarding: 5-step wizard (exam board → level → course → unit selection → confirm)
- Question bank: 282 questions across 34 topics, 6 units (L1–L3 MCQ: 261; L4–L5 extended response: 21)
- Essay marking via `/api/mark/extended`: L4 single-pass (~$0.006–0.007), L5 dual-pass conservative arbitration (~$0.013–0.015); rate-limited at 50/day; full audit trail in `marking_audit_log`
- Progress dashboard: course progress ring, unit mastery bars (RAG-banded), Bloom depth profile, exam countdown
- Topic drill-down: per-topic Bloom breakdown, gap flags, prerequisite links
- Knowledge graph: Cytoscape.js visualisation, nodes coloured by mastery
- Back navigation: full `?back=` chain across session → topic → progress → dashboard → courses

---

## Schema state (as of migration 017)

- **001–013**: core schema (profiles, courses, units, knowledge graph, questions, user tables, SM-2 queue, answer log, progress rollup, trigger, seed data)
- **014**: essay infrastructure — `question_techniques`, `essay_mark_scheme_levels`, `marking_audit_log`, `marking_rate_limits`; 13 new columns on `questions`; 10 new columns on `answer_log`
- **015**: `marking_audit_log.answer_log_id` FK → SET NULL on delete (DPIA)
- **016**: backfilled `questions.marks` from `essay_mark_scheme_levels.level_order=1` mark_range
- **017**: `ladder_state` table (PK `user_id, unit_id`; RLS); `session_mode text CHECK (IN ('review','focus','ladder'))` added to `answer_log` (nullable; NULL = pre-ladder attempts)

---

## Not in iteration 1 (Bloom's ladder)

From design proposal §7 — these were explicitly deferred:

- Three-component mastery score (retention, depth, coverage) — iteration 2; ladder attempts are already tagged `session_mode = 'ladder'` so depth data is accumulating
- Mode suggestion logic ("app recommends best mode") — future iteration
- Re-attempting passed rungs — forward-moving only; add if student feedback requests it
- Celebrations, badges, animations beyond the transition screen
- Leaderboard or social comparison
- Essay-feeds-SM-2 fix — parked pending calibration
- A-Level content — iteration 3
- Admin threshold UI — config file + redeploy is the current procedure (see Known Limitations)
- Course-level ladder overview ("your progress across all units") — future

---

## What's not yet wired up

- Re-mark requests written to `answer_log.marking_status = 'under_review'` — no admin reviewer UI; review via Supabase dashboard
- `model_answer` null on all 21 backfilled essay questions — conditional reveal in `EssayCard` is wired but will only fire after xlsx import populates the field
- `distinguishes_this_level` empty on all 84 `essay_mark_scheme_levels` rows — prompt skips gracefully
- `ao` and `wjec_tier` null on all 21 backfilled questions — same; prompt skips gracefully
- Motion xlsx awaiting A-Level course infrastructure
- `concept_id` null on xlsx-imported questions until topic-node mapping is populated

---

## Planned next

- Manual calibration of marker on existing 21 essay questions
- Author additional L3–L5 content for thin rungs (see coverage report — Waves L3 and The Universe L3 have 1 question each; threshold unreachable before exhaustion)
- A-Level Physics infrastructure (course, units, knowledge graph nodes), Motion xlsx import
- Iteration 2: three-component mastery score — ladder `session_mode = 'ladder'` data feeds the depth component

---

## Behaviour notes

- **Ladder: `ladder_state` row is created on first entry to the ladder session, not on unit hub view.** Visiting the unit hub (which shows the ladder entry card) does not register the student as having started the ladder. "Not started" on the entry card means the student has never clicked into a ladder session for that unit. This was the root cause of the FC-6 persistence failure during verification: the old code called `getOrInitState` from the hub page, which created the row before the student had entered the session, making the entry card unable to distinguish "never started" from "zero progress." Fixed by splitting into `readLadderState` (hub, read-only) and `getOrInitState` (session, creates row).

- **Ladder: new higher content added while student has already passed the top rung.** If L4 questions are added to a unit the student completed as a 3-rung L1–L3 ladder, `reachedTop` re-evaluates to false and the student resumes at L3 (must re-pass to unlock L4). Conservative but undesigned — revisit if student feedback shows confusion.

---

## Known limitations

- **Ladder pass threshold requires a code redeploy to change.** Values live in `lib/ladder/config.ts` (TypeScript constant). Design proposal §1 specified "tunable without code release" — this is a gap. Moving config to a `ladder_config` DB table is deferred to iteration 2 when operational data warrants it. Vercel redeploy takes ~2 minutes.

---

## Current issues to address

- **Ladder content too thin to reach threshold on several rungs.** Waves L3 (1q), The Universe L3 (1q), Electricity L4 (1q), and all L5 rungs (1–2q each): a student will hit Screen D (exhausted) before accumulating the 3 attempts needed to evaluate the threshold. See `docs/reports/ladder-coverage-2026-04.md` for the full picture. Authoring priority before enabling the ladder for students.
- `distinguishes_this_level` empty on all backfilled `essay_mark_scheme_levels` rows — legacy JSONB lacked the field; prompt skips gracefully
- `marking_audit_log` FK is SET NULL on parent delete (correct for DPIA); writes use service_role client
- Rate limit upsert has a theoretical race condition on two simultaneous first-ever requests from the same user — not a practical issue at current scale; parked
- Essay attempts do not update the SM-2 queue — essay questions remain due after an attempt; dedicated essay SM-2 strategy deferred
- `marking_prompt` JSONB column retained in DB and type definitions but no longer read — drop in a future migration once data is confirmed fully migrated
