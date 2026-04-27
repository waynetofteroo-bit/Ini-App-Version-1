-- Backfill questions.marks from essay_mark_scheme_levels for all essay
-- questions where marks is still null. Reads the level_order=1 row's
-- mark_range ("N/M") and sets marks = M.
--
-- Idempotent: skips rows where marks is already non-null.
-- Reports counts and any skipped questions via RAISE NOTICE (Messages tab).
-- Note: no BEGIN/COMMIT wrapper — DO blocks are implicitly transactional.

DO $$
DECLARE
  q         RECORD;
  top_level RECORD;
  parsed_m  INT;
  updated   INT    := 0;
  skipped   TEXT[] := '{}';
BEGIN
  FOR q IN
    SELECT id
    FROM   questions
    WHERE  bloom_level >= 4
      AND  marks IS NULL
  LOOP
    -- Find the top band row
    SELECT mark_range
    INTO   top_level
    FROM   essay_mark_scheme_levels
    WHERE  question_id = q.id
      AND  level_order = 1;

    IF NOT FOUND THEN
      skipped := array_append(skipped, q.id::text || ': no level_order=1 row in essay_mark_scheme_levels');
      CONTINUE;
    END IF;

    -- Expect clean "N/M" format; skip anything else
    IF top_level.mark_range ~ '^[0-9]+/[0-9]+$' THEN
      parsed_m := split_part(top_level.mark_range, '/', 2)::int;
    ELSE
      skipped := array_append(
        skipped,
        q.id::text || ': unparseable mark_range "' || top_level.mark_range || '"'
      );
      CONTINUE;
    END IF;

    UPDATE questions SET marks = parsed_m WHERE id = q.id;
    updated := updated + 1;
  END LOOP;

  RAISE NOTICE '-------------------------------------------';
  RAISE NOTICE 'questions.marks backfilled : %', updated;
  IF array_length(skipped, 1) IS NOT NULL THEN
    RAISE NOTICE 'Skipped (% rows): %', array_length(skipped, 1), array_to_string(skipped, ', ');
  ELSE
    RAISE NOTICE 'Skipped                    : 0';
  END IF;
  RAISE NOTICE '-------------------------------------------';
END $$;
