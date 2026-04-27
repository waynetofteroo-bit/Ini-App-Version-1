# DEMO_STATUS.md

Last updated: 2026-04-27 (session 4 — marker upgrade)

---

## What works in the live demo today

**WJEC GCSE Physics Double Award (course code: WJEC-GCSE-PHY-DA)**

- Auth: sign-up, login, session via Supabase Auth
- Onboarding: 5-step wizard (exam board → level → course → unit selection → confirm)
- SM-2 spaced repetition queue: active, course-scoped, blended retention + urgency scoring
- Question bank: 282 questions across 34 topics, 6 units
  - L1–L3 MCQ: 261 questions (recall, understand, apply)
  - L4–L5 extended response: 21 questions (analyse, evaluate)
- Essay marking via `/api/mark/extended`: working — synchronous, single-pass for L4, dual-pass with arbitration for L5
  - Model: claude-sonnet-4-6, temperature 0, max_tokens 1500
  - Rate limiting: 50 essay marks/day per user (enforced via `marking_rate_limits`)
  - Full audit trail written on every call (`marking_audit_log`: raw request, raw response, latency, cost estimate)
  - Progressive enrichment prompt: uses model_answer, examiner_notes, command_word, technique, levels-based rubric when available; backfilled questions (sparse fields) tolerated on same code path
  - Structured response returned: band, score, bloom_demonstrated, gaps, mark_points_awarded, mark_points_missed, feedback
- Progress dashboard: course progress ring, unit mastery bars (RAG-banded), Bloom depth profile, exam countdown
- Topic drill-down: per-topic Bloom breakdown, gap flags, prerequisite links
- Knowledge graph: Cytoscape.js visualisation, nodes coloured by mastery
- Back navigation: full `?back=` chain across session → topic → progress → dashboard → courses

---

## Schema state (as of migration 015)

- **Migration 001–013**: core schema (profiles, courses, units, knowledge graph, questions, user tables, SM-2 queue, answer log, progress rollup view, trigger, seed data)
- **Migration 014**: essay question infrastructure — `question_techniques` table, `essay_mark_scheme_levels` table, `marking_audit_log` table (RLS, service-role only, 7-year retention comment), `marking_rate_limits` table; extended `questions` with 13 new columns (`topic_node`, `sub_concept`, `marks`, `command_word`, `technique_id`, `technique_rationale`, `model_answer`, `mark_scheme_points`, `indicative_content`, `examiner_notes`, `ao`, `wjec_tier`, `question_version`); extended `answer_log` with 10 new columns (`response_text`, `marking_status`, `marking_model`, `marking_prompt_version`, `question_version`, `marked_at`, `human_reviewed`, `human_review_score`, `human_review_notes`, `human_reviewed_at`); CHECK constraints on `bloom_level` and `correct_idx`; partial index on `answer_log.marking_status`
- **Migration 015**: `marking_audit_log.answer_log_id` FK changed from ON DELETE CASCADE to ON DELETE SET NULL; column made nullable — audit rows survive answer_log erasure per DPIA
- **Backfill complete**: 21 existing L4/L5 essay questions populated into new schema — `mark_scheme_points` and `indicative_content` extracted from `marking_prompt` JSONB; 84 `essay_mark_scheme_levels` rows generated (4 bands × 21 questions); `question_version` set to `v1` on all

---

## What's not yet wired up

- Session UI (`app/session/new/page.tsx`) only handles MCQ — no essay submission flow yet; `/api/mark/extended` is ready but has no client caller
- `distinguishes_this_level` empty on all 84 backfilled rows — legacy JSONB had no equivalent field; populated via xlsx import or manual edit
- `ao` and `wjec_tier` null on all 21 backfilled questions — same cause; populated via xlsx import only
- Motion xlsx awaiting A-Level course infrastructure
- Topic-node mapping system stub created (`data/topic-node-mappings.json`); WJEC-GCSE-PHY-DA section present but unpopulated — values to be filled in by hand against `data/wjec-gcse-physics-concepts.txt`
- `concept_id` will be null on xlsx-imported questions until topic-node mapping is populated and a re-import is run

---

## Planned next

- Session 5: manual calibration of marker on existing 21 essay questions
- Session 6: author additional GCSE L4/L5 essay content for thin topics
- Future: A-Level Physics infrastructure (course, units, knowledge graph nodes), Motion xlsx import as seed content

---

## Current issues to address

- `distinguishes_this_level` empty on all backfilled `essay_mark_scheme_levels` rows — legacy JSONB lacked the field; prompt skips it gracefully via progressive enrichment
- 21 backfilled questions have `ao` and `wjec_tier` as NULL — same cause; prompt skips gracefully
- `marking_audit_log` FK is SET NULL on parent delete (correct for DPIA); no permissive RLS policy — writes use service_role client
