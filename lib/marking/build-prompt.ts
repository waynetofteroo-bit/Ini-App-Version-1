// lib/marking/build-prompt.ts
// Constructs a structured marking prompt from a question row, its
// essay_mark_scheme_levels rows, and an optional linked technique.
//
// Progressive enrichment: every optional field is included only when
// non-null. All essay questions are expected to have marks and
// mark_scheme_points populated (via migration 016 backfill).

export const MARKING_PROMPT_VERSION = 'v2-progressive-enrichment-2026-04-27';

// ── Types matching the DB shape returned by the route's joined query ─────────

export interface MarkingQuestion {
  id: string;
  stem: string;
  bloom_level: number;
  marks: number | null;
  command_word: string | null;
  ao: string | null;
  wjec_tier: string | null;
  mark_scheme_points: string[] | null;
  indicative_content: string | null;
  model_answer: string | null;
  examiner_notes: string | null;
  question_version: string | null;
  marking_prompt: Record<string, unknown> | null; // retained in DB — not read here
}

export interface MarkingLevel {
  level_label: string;
  mark_range: string;
  must_include: string;
  distinguishes_this_level: string;
  feedback_trigger: string | null;
  ai_confidence_flag: string | null;
  level_order: number;
}

export interface MarkingTechnique {
  technique_name: string;
  scaffold_level: string;
  how_it_works: string;
  what_it_forces: string;
}

export interface MarkingPromptResult {
  systemPrompt: string;
  userMessage: string;
  version: string;
  maxMarks: number;
}

// ── Field accessors — throw explicitly on missing data ───────────────────────

export function resolveMaxMarks(question: MarkingQuestion): number {
  if (question.marks == null) {
    throw new Error(
      `Essay question ${question.id} has no marks value. Run migration 016 to backfill.`
    );
  }
  return question.marks;
}

function resolveMarkPoints(question: MarkingQuestion): string[] {
  if (!Array.isArray(question.mark_scheme_points) || question.mark_scheme_points.length === 0) {
    throw new Error(
      `Essay question ${question.id} has no mark_scheme_points. Run the backfill script.`
    );
  }
  return question.mark_scheme_points as string[];
}

// ── JSON response schema (embedded in system prompt) ─────────────────────────

const RESPONSE_SCHEMA = `{
  "band": "string — one of the level_label values from the rubric (e.g. Full, Good, Partial, Minimal)",
  "score": "integer — marks awarded",
  "bloom_demonstrated": "integer 1–5 — cognitive level the response actually achieved",
  "mark_points_awarded": ["string — atomic mark points the response earned"],
  "mark_points_missed": ["string — atomic mark points not earned"],
  "feedback": "string — 2–3 sentences of specific, actionable feedback for the student",
  "gaps": ["string — knowledge or skill gap demonstrated by the response"]
}`;

// ── Main export ──────────────────────────────────────────────────────────────

export function buildMarkingPrompt(
  question: MarkingQuestion,
  levels: MarkingLevel[],
  studentResponse: string,
  technique?: MarkingTechnique | null
): MarkingPromptResult {
  const maxMarks     = resolveMaxMarks(question);
  const markPoints   = resolveMarkPoints(question);
  const sortedLevels = [...levels].sort((a, b) => a.level_order - b.level_order);

  // ── System prompt — static, developer-controlled ───────────────────────────
  const systemPrompt = [
    `You are an experienced WJEC examiner marking a ${maxMarks}-mark extended-response physics question.`,
    'You will assess a student response against a structured mark scheme and return a JSON object with',
    'the marks awarded, the level achieved, the cognitive level demonstrated, and specific feedback.',
    '',
    'Be rigorous but fair. Award marks where the student demonstrates the required understanding,',
    'even if expressed differently from a model answer.',
    'Do not award marks for vague or unsupported assertions.',
    '',
    'Return ONLY valid JSON matching this schema:',
    RESPONSE_SCHEMA,
  ].join('\n');

  // ── User message — built progressively, student response appended last ──────
  const sections: string[] = [];

  // Question block
  const qLines = ['## Question', question.stem, `Marks available: ${maxMarks}`];
  if (question.command_word) qLines.push(`Command word: ${question.command_word}`);
  if (question.ao)           qLines.push(`Assessment objective: ${question.ao}`);
  if (question.wjec_tier)    qLines.push(`WJEC tier: ${question.wjec_tier}`);
  sections.push(qLines.join('\n'));

  // Technique — only when linked and fields populated
  if (technique) {
    sections.push([
      '## Question scaffolding',
      `This question uses the "${technique.technique_name}" technique (${technique.scaffold_level} scaffold).`,
      `How it works: ${technique.how_it_works}`,
      `What it forces the student to do: ${technique.what_it_forces}`,
    ].join('\n'));
  }

  // Mark scheme atomic points
  sections.push([
    '## Mark scheme — atomic points',
    ...markPoints.map((p, i) => `${i + 1}. ${p}`),
  ].join('\n'));

  // Indicative content
  if (question.indicative_content) {
    sections.push(`## Indicative content\n${question.indicative_content}`);
  }

  // Levels-based rubric
  if (sortedLevels.length > 0) {
    const rubricLines = ['## Levels-based rubric'];
    for (const level of sortedLevels) {
      rubricLines.push(
        `Level ${level.level_order}: ${level.level_label} (${level.mark_range}) — must include: ${level.must_include}`
      );
      if (level.distinguishes_this_level) {
        rubricLines.push(`  What distinguishes this level: ${level.distinguishes_this_level}`);
      }
      if (level.feedback_trigger) {
        rubricLines.push(`  If level not reached: ${level.feedback_trigger}`);
      }
      if (level.ai_confidence_flag) {
        rubricLines.push(`  AI confidence: ${level.ai_confidence_flag}`);
      }
    }
    sections.push(rubricLines.join('\n'));
  }

  // Model answer
  if (question.model_answer) {
    sections.push([
      '## Model answer reference',
      question.model_answer,
      '(Use this as a reference for what a top-band response looks like, not as a required template.)',
    ].join('\n'));
  }

  // Examiner notes
  if (question.examiner_notes) {
    sections.push([
      '## Examiner notes',
      question.examiner_notes,
      '(Watch specifically for these common errors and award/withhold marks accordingly.)',
    ].join('\n'));
  }

  // Student response — student content stays in user message, never in system
  sections.push(`## Student response\n${studentResponse}`);

  // Task instruction
  sections.push([
    '## Your task',
    `Mark the student response above. Return JSON only — no preamble, no markdown fences.`,
    `Fields required:`,
    `- band: one of the level_label strings from the rubric`,
    `- score: integer marks awarded out of ${maxMarks}`,
    `- bloom_demonstrated: integer 1–5 — cognitive level the response actually achieved`,
    `- mark_points_awarded: array of strings — atomic mark points the response earned`,
    `- mark_points_missed: array of strings — atomic mark points not earned`,
    `- feedback: 2–3 sentences of specific, actionable feedback for the student`,
    `- gaps: array of short strings naming knowledge or skill gaps`,
  ].join('\n'));

  return {
    systemPrompt,
    userMessage: sections.join('\n\n'),
    version: MARKING_PROMPT_VERSION,
    maxMarks,
  };
}
