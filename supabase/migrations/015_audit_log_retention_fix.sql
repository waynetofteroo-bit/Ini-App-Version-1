BEGIN;

-- Fix marking_audit_log FK: CASCADE → SET NULL for 7-year DPIA retention.
-- Audit rows must survive answer_log deletion (GDPR right-to-erasure).
-- NULL answer_log_id means the associated attempt was erased; the audit
-- entry is kept.

-- Drop CASCADE FK and make column nullable in one statement
ALTER TABLE marking_audit_log
  DROP CONSTRAINT marking_audit_log_answer_log_id_fkey,
  ALTER COLUMN answer_log_id DROP NOT NULL;

-- Re-add FK with SET NULL on parent delete
ALTER TABLE marking_audit_log
  ADD CONSTRAINT marking_audit_log_answer_log_id_fkey
  FOREIGN KEY (answer_log_id)
  REFERENCES answer_log(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN marking_audit_log.answer_log_id IS
  'FK to answer_log. SET NULL on parent delete: audit rows are retained for 7 years per DPIA even when the associated attempt is erased (GDPR right-to-erasure). NULL means the attempt was deleted; the audit entry remains.';

COMMIT;
