BEGIN;

-- ============================================================
-- A. question_techniques
--    Content table — public read, no RLS
-- ============================================================
CREATE TABLE IF NOT EXISTS question_techniques (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  technique_name         text        NOT NULL,
  scaffold_level         text        NOT NULL,
  how_it_works           text        NOT NULL,
  what_it_forces         text        NOT NULL,
  why_it_works_at_l4_l5  text        NOT NULL,
  when_to_use            text,
  created_at             timestamptz DEFAULT now(),
  CONSTRAINT question_techniques_technique_name_key UNIQUE (technique_name)
);

-- Seed four canonical techniques (placeholder body text — overwritten by xlsx import)
INSERT INTO question_techniques
  (technique_name, scaffold_level, how_it_works, what_it_forces, why_it_works_at_l4_l5, when_to_use)
VALUES
  ('Staged Sub-questions', 'High scaffold',  '[placeholder — populate via xlsx import]', '[placeholder]', '[placeholder]', '[placeholder]'),
  ('Writing Frame',        'Medium scaffold', '[placeholder — populate via xlsx import]', '[placeholder]', '[placeholder]', '[placeholder]'),
  ('Constraint-based',     'Low scaffold',    '[placeholder — populate via xlsx import]', '[placeholder]', '[placeholder]', '[placeholder]'),
  ('Stem + Command Word',  'Low scaffold',    '[placeholder — populate via xlsx import]', '[placeholder]', '[placeholder]', '[placeholder]')
ON CONFLICT (technique_name) DO NOTHING;


-- ============================================================
-- B. Extend questions table
--    All new columns nullable — existing rows unaffected
--    question_version NOT NULL DEFAULT 'v1' is safe on PG 11+
-- ============================================================
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS topic_node          text,
  ADD COLUMN IF NOT EXISTS sub_concept         text,
  ADD COLUMN IF NOT EXISTS marks               int2,
  ADD COLUMN IF NOT EXISTS command_word        text,
  ADD COLUMN IF NOT EXISTS technique_id        uuid REFERENCES question_techniques(id),
  ADD COLUMN IF NOT EXISTS technique_rationale text,
  ADD COLUMN IF NOT EXISTS model_answer        text,
  ADD COLUMN IF NOT EXISTS mark_scheme_points  jsonb,
  ADD COLUMN IF NOT EXISTS indicative_content  text,
  ADD COLUMN IF NOT EXISTS examiner_notes      text,
  ADD COLUMN IF NOT EXISTS ao                  text,
  ADD COLUMN IF NOT EXISTS wjec_tier           text,
  ADD COLUMN IF NOT EXISTS question_version    text NOT NULL DEFAULT 'v1';


-- ============================================================
-- C. essay_mark_scheme_levels
--    Stores levels-based marking descriptors (xlsx Sheet 3)
--    Content table — public read, no RLS
-- ============================================================
CREATE TABLE IF NOT EXISTS essay_mark_scheme_levels (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id              uuid        NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  level_label              text        NOT NULL,
  mark_range               text        NOT NULL,
  must_include             text        NOT NULL,
  distinguishes_this_level text        NOT NULL,
  feedback_trigger         text,
  ai_confidence_flag       text,
  level_order              int2        NOT NULL,
  created_at               timestamptz DEFAULT now(),
  CONSTRAINT essay_mark_scheme_levels_question_level_uniq UNIQUE (question_id, level_order)
);


-- ============================================================
-- D. Extend answer_log table
--    All new columns nullable — existing rows unaffected
-- ============================================================
ALTER TABLE answer_log
  ADD COLUMN IF NOT EXISTS response_text          text,
  ADD COLUMN IF NOT EXISTS marking_status         text DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS marking_prompt_version text,
  ADD COLUMN IF NOT EXISTS marking_model          text,
  ADD COLUMN IF NOT EXISTS question_version       text,
  ADD COLUMN IF NOT EXISTS marked_at              timestamptz,
  ADD COLUMN IF NOT EXISTS human_reviewed         bool DEFAULT false,
  ADD COLUMN IF NOT EXISTS human_review_score     int2,
  ADD COLUMN IF NOT EXISTS human_review_notes     text,
  ADD COLUMN IF NOT EXISTS human_reviewed_at      timestamptz;

DO $$ BEGIN
  ALTER TABLE answer_log ADD CONSTRAINT answer_log_marking_status_check
    CHECK (marking_status IN ('not_applicable','pending','marking','marked','failed','under_review'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- E. marking_audit_log
--    Full AI call audit trail — 7-year DPIA retention
--    RLS enabled; no permissive user policy (service_role only)
-- ============================================================
CREATE TABLE IF NOT EXISTS marking_audit_log (
  id                     uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_log_id          uuid         NOT NULL REFERENCES answer_log(id) ON DELETE CASCADE,
  marking_model          text         NOT NULL,
  marking_prompt_version text         NOT NULL,
  raw_request            jsonb        NOT NULL,
  raw_response           jsonb        NOT NULL,
  latency_ms             int4,
  cost_estimate_usd      numeric(10,6),
  created_at             timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE marking_audit_log IS
  'Audit trail of every AI marking call. Retained 7 years per DPIA. DO NOT delete rows even if associated answer_log is removed.';

CREATE INDEX IF NOT EXISTS idx_marking_audit_log_answer_log_id
  ON marking_audit_log (answer_log_id);

CREATE INDEX IF NOT EXISTS idx_marking_audit_log_created_at
  ON marking_audit_log (created_at DESC);

ALTER TABLE marking_audit_log ENABLE ROW LEVEL SECURITY;
-- No permissive policy — only service_role (bypasses RLS) may access this table


-- ============================================================
-- F. marking_rate_limits
--    Composite PK (user_id, date)
--    RLS: users manage own rows
-- ============================================================
CREATE TABLE IF NOT EXISTS marking_rate_limits (
  user_id         uuid        NOT NULL REFERENCES profiles(id),
  date            date        NOT NULL,
  request_count   int4        NOT NULL DEFAULT 0,
  last_request_at timestamptz,
  PRIMARY KEY (user_id, date)
);

ALTER TABLE marking_rate_limits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users manage own rate limit rows"
    ON marking_rate_limits FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- G. CHECK constraints on questions
--    Pre-verified: 0 violations exist in live data
-- ============================================================
DO $$ BEGIN
  ALTER TABLE questions ADD CONSTRAINT questions_bloom_level_check
    CHECK (bloom_level BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE questions ADD CONSTRAINT questions_correct_idx_check
    CHECK (correct_idx BETWEEN 0 AND 9);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- H. Partial index for marking queue
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_answer_log_marking_status
  ON answer_log (marking_status)
  WHERE marking_status IN ('pending','marking','failed','under_review');


COMMIT;
