// scripts/import-essay-questions.ts
// Ingests teacher-reviewed xlsx workbooks in the canonical 3-sheet format.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/import-essay-questions.ts <path-to-xlsx>
//   npx tsx --env-file=.env.local scripts/import-essay-questions.ts <path-to-xlsx> --dry-run
//   npx tsx --env-file=.env.local scripts/import-essay-questions.ts <path-to-xlsx> --replace "Motion — Newton's Laws"
//
// Sheet names expected (exact, including en-dash in first sheet):
//   "L4–L5 Q&A Bank"    row 1 = title, row 2 = headers, row 3+ = data
//   "Technique Guide"   row 1 = title, row 2 = headers, row 3+ = data
//   "Mark Scheme Detail" row 1 = title, row 2 = headers, row 3+ = data

import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// ── Arg parsing ─────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const replaceIdx = argv.indexOf('--replace');
const REPLACE_TOPIC: string | null = replaceIdx !== -1 ? (argv[replaceIdx + 1] ?? null) : null;
const XLSX_PATH = argv.find(a => !a.startsWith('--') && a !== REPLACE_TOPIC) ?? null;

if (!XLSX_PATH) {
  console.error(
    'Usage: npx tsx --env-file=.env.local scripts/import-essay-questions.ts <path-to-xlsx> [--dry-run] [--replace <topic_node>]'
  );
  process.exit(1);
}

// ── Types ───────────────────────────────────────────────────────────────────

interface TechniqueRow {
  technique_name: string;
  scaffold_level: string;
  how_it_works: string;
  what_it_forces: string;
  why_it_works_at_l4_l5: string;
  when_to_use: string | null;
}

interface ParsedQuestion {
  q_num: string;
  stem: string;
  bloom_level: number;
  marks: number | null;
  topic_node: string;
  sub_concept: string | null;
  command_word: string | null;
  technique_name: string | null;
  technique_rationale: string | null;
  model_answer: string | null;
  mark_scheme_points: string[];
  indicative_content: string | null;
  examiner_notes: string | null;
  ao: string | null;
  wjec_tier: string | null;
}

interface ParsedMarkSchemeLevel {
  q_num: string;
  level_label: string;
  mark_range: string;
  must_include: string;
  distinguishes_this_level: string;
  feedback_trigger: string | null;
  ai_confidence_flag: string | null;
}

// ── Sheet helpers ────────────────────────────────────────────────────────────

function parseSheetToObjects(wb: XLSX.WorkBook, sheetName: string): Record<string, unknown>[] {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet not found: "${sheetName}". Available: ${wb.SheetNames.join(', ')}`);

  // Row 0 = workbook title (skip), row 1 = column headers, row 2+ = data
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null }) as unknown[][];
  if (raw.length < 2) throw new Error(`Sheet "${sheetName}" has fewer than 2 rows`);

  const headers = (raw[1] as unknown[]).map(h => (h != null ? String(h).trim() : ''));
  const dataRows = raw.slice(2);

  return dataRows
    .filter(row => (row as unknown[]).some(cell => cell !== null && cell !== ''))
    .map((row, i) => {
      const obj: Record<string, unknown> = { _rowNum: i + 3 };
      headers.forEach((h, j) => {
        if (h) obj[h] = (row as unknown[])[j] ?? null;
      });
      return obj;
    });
}

function str(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).trim();
  return s || null;
}

function requiredStr(val: unknown, field: string, rowNum: unknown): string {
  const s = str(val);
  if (!s) throw new Error(`Row ${rowNum}: missing required field "${field}"`);
  return s;
}

function parseBloomLevel(val: unknown, rowNum: unknown): number {
  const s = String(val ?? '').trim();
  const match = s.match(/L?([1-5])/i);
  if (!match) throw new Error(`Row ${rowNum}: cannot parse Bloom level from "${s}"`);
  return parseInt(match[1], 10);
}

function parseMarks(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

function parseMSPoints(val: unknown): string[] {
  if (!val) return [];
  return String(val)
    .split(/\r\n|\n|\r/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  const resolvedPath = path.resolve(XLSX_PATH!);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  console.log(`\nOpening: ${resolvedPath}`);
  if (DRY_RUN) console.log('DRY RUN — no changes will be written to the database');
  if (REPLACE_TOPIC) console.log(`--replace: will delete existing questions for topic_node="${REPLACE_TOPIC}"`);

  const wb = XLSX.readFile(resolvedPath);

  // ── Parse Technique Guide ─────────────────────────────────────────────────
  const techniqueRows = parseSheetToObjects(wb, 'Technique Guide');
  const techniques: TechniqueRow[] = techniqueRows.map(row => ({
    technique_name:        requiredStr(row['Technique'], 'Technique', row._rowNum),
    scaffold_level:        requiredStr(row['Scaffold Level'], 'Scaffold Level', row._rowNum),
    how_it_works:          requiredStr(row['How It Works'], 'How It Works', row._rowNum),
    what_it_forces:        requiredStr(row['What It Forces the Student To Do'], 'What It Forces the Student To Do', row._rowNum),
    why_it_works_at_l4_l5: requiredStr(row['Why It Works at L4/L5'], 'Why It Works at L4/L5', row._rowNum),
    when_to_use:           str(row['When to Use in ini']),
  }));

  // ── Parse L4–L5 Q&A Bank ─────────────────────────────────────────────────
  const qaBankRows = parseSheetToObjects(wb, 'L4–L5 Q&A Bank');
  const questions: ParsedQuestion[] = qaBankRows.map(row => ({
    q_num:               requiredStr(row['Q#'], 'Q#', row._rowNum),
    stem:                requiredStr(row['Question Text'], 'Question Text', row._rowNum),
    bloom_level:         parseBloomLevel(row["Bloom's Level"], row._rowNum),
    marks:               parseMarks(row['Marks']),
    topic_node:          requiredStr(row['Topic Node'], 'Topic Node', row._rowNum),
    sub_concept:         str(row['Sub-concept']),
    command_word:        str(row['Command Word']),
    technique_name:      str(row['Question Technique']),
    technique_rationale: str(row['Technique Rationale']),
    model_answer:        str(row['Model Answer']),
    mark_scheme_points:  parseMSPoints(row['Mark Scheme — Key Points']),
    indicative_content:  str(row['Indicative Content / Equations']),
    examiner_notes:      str(row['Examiner Notes']),
    ao:                  str(row['AO']),
    wjec_tier:           str(row['WJEC Tier']),
  }));

  // ── Parse Mark Scheme Detail ──────────────────────────────────────────────
  const msRows = parseSheetToObjects(wb, 'Mark Scheme Detail');
  const markSchemeLevels: ParsedMarkSchemeLevel[] = msRows.map(row => ({
    q_num:                    requiredStr(row['Q#'], 'Q#', row._rowNum),
    level_label:              requiredStr(row['Level'], 'Level', row._rowNum),
    mark_range:               requiredStr(row['Mark Range'], 'Mark Range', row._rowNum),
    must_include:             requiredStr(row['Must Include to Achieve This Level'], 'Must Include to Achieve This Level', row._rowNum),
    distinguishes_this_level: str(row['What Distinguishes This Level']) ?? '',
    feedback_trigger:         str(row['Feedback Trigger Phrase (if level not reached)']),
    ai_confidence_flag:       str(row['AI Confidence Flag']),
  }));

  // Group mark scheme levels by Q# and assign level_order by row position
  const msByQNum = new Map<string, ParsedMarkSchemeLevel[]>();
  for (const ms of markSchemeLevels) {
    if (!msByQNum.has(ms.q_num)) msByQNum.set(ms.q_num, []);
    msByQNum.get(ms.q_num)!.push(ms);
  }

  // Validate all Q# in Mark Scheme Detail exist in Q&A Bank
  const qNums = new Set(questions.map(q => q.q_num));
  for (const qNum of msByQNum.keys()) {
    if (!qNums.has(qNum)) {
      throw new Error(`Mark Scheme Detail references Q# "${qNum}" which does not exist in Q&A Bank sheet`);
    }
  }

  console.log('\nParsed from xlsx:');
  console.log(`  Techniques:           ${techniques.length}`);
  console.log(`  Questions:            ${questions.length}`);
  console.log(`  Mark scheme levels:   ${markSchemeLevels.length}`);

  if (DRY_RUN) {
    console.log('\n✓ Dry run complete — no changes written.');
    return;
  }

  // ── Connect (service role — bypasses RLS for admin import) ────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      'Missing env vars. Run with: npx tsx --env-file=.env.local scripts/import-essay-questions.ts ...'
    );
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Track inserted IDs for compensating rollback
  const insertedQuestionIds: string[] = [];
  const insertedLevelIds: string[] = [];

  try {
    // ── --replace: remove existing questions for this topic_node ─────────────
    if (REPLACE_TOPIC) {
      process.stdout.write(`\nDeleting existing questions for topic_node="${REPLACE_TOPIC}"... `);
      const { error } = await supabase
        .from('questions')
        .delete()
        .eq('topic_node', REPLACE_TOPIC);
      if (error) throw new Error(`Delete failed: ${error.message}`);
      console.log('done.');
    }

    // ── Upsert techniques ─────────────────────────────────────────────────────
    process.stdout.write('\nUpserting techniques... ');
    const { error: techErr } = await supabase
      .from('question_techniques')
      .upsert(techniques, { onConflict: 'technique_name' });
    if (techErr) throw new Error(`Technique upsert failed: ${techErr.message}`);
    console.log(`${techniques.length} upserted.`);

    // Build technique name → id lookup
    const { data: techData, error: techFetchErr } = await supabase
      .from('question_techniques')
      .select('id, technique_name');
    if (techFetchErr) throw new Error(`Technique fetch failed: ${techFetchErr.message}`);
    const techniqueIdMap = new Map<string, string>(
      (techData ?? []).map(t => [t.technique_name as string, t.id as string])
    );

    // ── Insert questions ──────────────────────────────────────────────────────
    console.log('\nInserting questions...');
    const qNumToId = new Map<string, string>();

    for (const q of questions) {
      const techniqueId = q.technique_name ? (techniqueIdMap.get(q.technique_name) ?? null) : null;
      if (q.technique_name && !techniqueId) {
        console.warn(`  Warning Q# ${q.q_num}: technique "${q.technique_name}" not found — technique_id will be null`);
      }

      const { data, error } = await supabase
        .from('questions')
        .insert({
          stem:                q.stem,
          bloom_level:         q.bloom_level,
          marks:               q.marks,
          topic_node:          q.topic_node,
          sub_concept:         q.sub_concept,
          command_word:        q.command_word,
          technique_id:        techniqueId,
          technique_rationale: q.technique_rationale,
          model_answer:        q.model_answer,
          mark_scheme_points:  q.mark_scheme_points.length > 0 ? q.mark_scheme_points : null,
          indicative_content:  q.indicative_content,
          examiner_notes:      q.examiner_notes,
          ao:                  q.ao,
          wjec_tier:           q.wjec_tier,
          exam_board:          'WJEC',
          options:             [],
          correct_idx:         0,
          concept_id:          null,
          question_version:    'v1',
        })
        .select('id')
        .single();

      if (error || !data) throw new Error(`Insert failed for Q# ${q.q_num}: ${error?.message}`);
      qNumToId.set(q.q_num, data.id as string);
      insertedQuestionIds.push(data.id as string);
      process.stdout.write('.');
    }
    console.log(` ${insertedQuestionIds.length} inserted.`);

    // ── Insert mark scheme levels ─────────────────────────────────────────────
    console.log('\nInserting mark scheme levels...');

    for (const [qNum, levels] of msByQNum) {
      const questionId = qNumToId.get(qNum);
      if (!questionId) throw new Error(`No inserted question ID for Q# "${qNum}"`);

      for (let i = 0; i < levels.length; i++) {
        const ms = levels[i];
        const { data, error } = await supabase
          .from('essay_mark_scheme_levels')
          .insert({
            question_id:              questionId,
            level_label:              ms.level_label,
            mark_range:               ms.mark_range,
            must_include:             ms.must_include,
            distinguishes_this_level: ms.distinguishes_this_level,
            feedback_trigger:         ms.feedback_trigger,
            ai_confidence_flag:       ms.ai_confidence_flag,
            level_order:              i + 1,
          })
          .select('id')
          .single();

        if (error || !data) throw new Error(`Level insert failed for Q# ${qNum} level ${i + 1}: ${error?.message}`);
        insertedLevelIds.push(data.id as string);
      }
      process.stdout.write('.');
    }
    console.log(` ${insertedLevelIds.length} inserted.`);

  } catch (err) {
    // Compensating rollback: delete everything inserted in this run
    console.error(`\n\nError: ${(err as Error).message}`);
    console.log('Rolling back inserted rows...');

    if (insertedLevelIds.length > 0) {
      const { error } = await supabase
        .from('essay_mark_scheme_levels')
        .delete()
        .in('id', insertedLevelIds);
      if (error) console.error(`  Level rollback error: ${error.message}`);
      else console.log(`  Deleted ${insertedLevelIds.length} mark scheme level(s).`);
    }
    if (insertedQuestionIds.length > 0) {
      const { error } = await supabase
        .from('questions')
        .delete()
        .in('id', insertedQuestionIds);
      if (error) console.error(`  Question rollback error: ${error.message}`);
      else console.log(`  Deleted ${insertedQuestionIds.length} question(s).`);
    }

    console.log('Rollback complete. No partial data remains.');
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n─────────────────────────────────────────');
  console.log('Import complete');
  console.log(`  Techniques upserted:      ${techniques.length}`);
  console.log(`  Questions inserted:       ${insertedQuestionIds.length}`);
  console.log(`  Mark scheme levels:       ${insertedLevelIds.length}`);
  console.log(`  Time taken:               ${elapsed}s`);
  console.log('─────────────────────────────────────────');
}

main().catch(err => {
  console.error('Fatal:', (err as Error).message);
  process.exit(1);
});
