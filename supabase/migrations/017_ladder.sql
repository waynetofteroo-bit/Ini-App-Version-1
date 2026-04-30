-- Bloom's Ladder: persistent per-student per-unit climb state
-- and session_mode column on answer_log for isolated threshold evaluation.

CREATE TABLE ladder_state (
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  unit_id             uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  current_rung        int2 NOT NULL CHECK (current_rung BETWEEN 1 AND 5),
  highest_rung_passed int2 NOT NULL DEFAULT 0,
  last_attempt_at     timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, unit_id)
);

ALTER TABLE ladder_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own ladder state"
  ON ladder_state FOR ALL USING (auth.uid() = user_id);

-- NULL = pre-ladder attempts (treated as review); 'ladder' rows are isolated
-- for threshold evaluation via WHERE session_mode = 'ladder'.
ALTER TABLE answer_log
  ADD COLUMN session_mode text CHECK (session_mode IN ('review', 'focus', 'ladder'));
