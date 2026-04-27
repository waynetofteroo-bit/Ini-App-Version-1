-- One-off backfill: migrate existing 21 essay questions into the new
-- extended schema added by migration 014.
--
-- Run in Supabase dashboard SQL Editor.
-- Safe to re-run: ON CONFLICT DO NOTHING guards the level inserts,
-- and UPDATE is idempotent.
--
-- Reports counts via RAISE NOTICE — check the "Messages" tab in the editor.

DO $$
DECLARE
  q             RECORD;
  band          TEXT;
  bands         TEXT[] := ARRAY['Full', 'Good', 'Partial', 'Minimal'];
  band_data     JSONB;
  full_marks    INT;
  band_order    INT;
  derived_range TEXT;
  q_backfilled  INT  := 0;
  levels_ins    INT  := 0;
  failures      TEXT[] := '{}';
BEGIN
  FOR q IN
    SELECT id, marking_prompt
    FROM   questions
    WHERE  bloom_level >= 4
      AND  marking_prompt IS NOT NULL
  LOOP
    BEGIN

      -- Extract max marks from the Full band (used as denominator in mark_range)
      full_marks := (q.marking_prompt -> 'rubric_bands' -> 'Full' ->> 'marks')::int;

      -- Backfill the two new question columns
      UPDATE questions
      SET
        mark_scheme_points = q.marking_prompt -> 'markscheme_points',
        indicative_content = q.marking_prompt ->> 'indicative_content',
        question_version   = 'v1'
      WHERE id = q.id;

      -- Insert one essay_mark_scheme_levels row per rubric band
      FOREACH band IN ARRAY bands LOOP

        band_order := CASE band
          WHEN 'Full'    THEN 1
          WHEN 'Good'    THEN 2
          WHEN 'Partial' THEN 3
          WHEN 'Minimal' THEN 4
        END;

        band_data := q.marking_prompt -> 'rubric_bands' -> band;

        IF band_data IS NULL THEN
          CONTINUE;
        END IF;

        -- Derive mark_range:
        --   integer marks  →  '{n}/{full_marks}'  e.g. '4/6'
        --   range string   →  replace hyphen with en-dash  e.g. '4–5'
        IF (band_data ->> 'marks') ~ '^[0-9]+$' THEN
          derived_range := (band_data ->> 'marks') || '/' || full_marks::text;
        ELSE
          derived_range := replace(band_data ->> 'marks', '-', '–');
        END IF;

        INSERT INTO essay_mark_scheme_levels (
          question_id,
          level_label,
          mark_range,
          must_include,
          distinguishes_this_level,
          level_order
        )
        VALUES (
          q.id,
          band,
          derived_range,
          band_data ->> 'descriptor',
          '',
          band_order
        )
        ON CONFLICT (question_id, level_order) DO NOTHING;

        levels_ins := levels_ins + 1;

      END LOOP;

      q_backfilled := q_backfilled + 1;

    EXCEPTION WHEN OTHERS THEN
      failures := array_append(failures, q.id::text || ': ' || SQLERRM);
    END;
  END LOOP;

  RAISE NOTICE '-------------------------------------------';
  RAISE NOTICE 'Questions backfilled          : %', q_backfilled;
  RAISE NOTICE 'essay_mark_scheme_levels rows : %', levels_ins;
  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE NOTICE 'FAILURES (%): %',
      array_length(failures, 1),
      array_to_string(failures, E'\n');
  ELSE
    RAISE NOTICE 'Failures                      : 0';
  END IF;
  RAISE NOTICE '-------------------------------------------';
END $$;
