import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { callClaudeForMarking } from '@/lib/claude';
import {
  buildMarkingPrompt,
  resolveMaxMarks,
  type MarkingQuestion,
  type MarkingLevel,
  type MarkingTechnique,
} from '@/lib/marking/build-prompt';

const DAILY_MARKING_LIMIT = 50;

// ── Response types ───────────────────────────────────────────────────────────

interface MarkingResult {
  band: string;
  score: number;
  bloom_demonstrated: number;
  mark_points_awarded: string[];
  mark_points_missed: string[];
  feedback: string;
  gaps: string[];
}

interface AuditEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costEstimateUsd: number;
  rawRequest: Record<string, unknown>;
  rawResponse: string;
}

// ── JSON parse helper ────────────────────────────────────────────────────────

function parseMarkingResult(text: string): MarkingResult {
  // Strip markdown fences Claude occasionally emits despite instructions
  const cleaned = text
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```$/im, '')
    .trim();

  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  return {
    band:                String(parsed.band ?? ''),
    score:               Number(parsed.score ?? 0),
    bloom_demonstrated:  Number(parsed.bloom_demonstrated ?? 1),
    mark_points_awarded: Array.isArray(parsed.mark_points_awarded) ? parsed.mark_points_awarded as string[] : [],
    mark_points_missed:  Array.isArray(parsed.mark_points_missed)  ? parsed.mark_points_missed  as string[] : [],
    feedback:            String(parsed.feedback ?? ''),
    gaps:                Array.isArray(parsed.gaps) ? parsed.gaps as string[] : [],
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase        = createClient();
  const serviceSupabase = createServiceClient(); // service_role — needed for marking_audit_log

  // 1. Auth
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 2. Parse body
  const body = await request.json() as Record<string, unknown>;
  const { question_id, student_response, bloom_target, user_course_id } = body as {
    question_id: string;
    student_response: string;
    bloom_target: number;
    user_course_id: string;
  };

  if (!question_id || !student_response || !user_course_id) {
    return NextResponse.json({ error: 'Missing required fields: question_id, student_response, user_course_id' }, { status: 400 });
  }

  // 3. Rate limiting — check before any expensive work
  const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD' UTC
  const { data: rateRow } = await supabase
    .from('marking_rate_limits')
    .select('request_count')
    .eq('user_id', user.id)
    .eq('date', today)
    .maybeSingle();

  if ((rateRow?.request_count ?? 0) >= DAILY_MARKING_LIMIT) {
    return NextResponse.json(
      { error: `Daily essay marking limit reached (${DAILY_MARKING_LIMIT}/day). Try again tomorrow.` },
      { status: 429 }
    );
  }

  // 4. Fetch question + mark scheme levels + technique in one query
  const { data: questionRaw, error: qErr } = await supabase
    .from('questions')
    .select(`
      *,
      essay_mark_scheme_levels ( * ),
      question_techniques ( * )
    `)
    .eq('id', question_id)
    .single();

  if (qErr || !questionRaw) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  }

  const question  = questionRaw as MarkingQuestion & {
    essay_mark_scheme_levels: MarkingLevel[];
    question_techniques: MarkingTechnique | null;
  };
  const levels    = (question.essay_mark_scheme_levels ?? []).sort(
    (a, b) => a.level_order - b.level_order
  );
  const technique = question.question_techniques ?? null;

  // Must have at least a legacy marking_prompt OR new-schema levels
  const hasMarkScheme = levels.length > 0 || question.marking_prompt != null;
  if (!hasMarkScheme) {
    return NextResponse.json({ error: 'No marking scheme available for this question' }, { status: 400 });
  }

  // 5. Build prompt
  const { systemPrompt, userMessage, version: promptVersion, maxMarks } = buildMarkingPrompt(
    question,
    levels,
    student_response,
    technique
  );

  const rawRequest: Record<string, unknown> = {
    model:      'claude-sonnet-4-6',
    max_tokens: 1500,
    temperature: 0,
    system:     systemPrompt,
    // user_message logged in full for DPIA audit trail
    user_message: userMessage,
  };

  // 6. Call Claude — dual-pass for bloom_target 5, single-pass otherwise
  let markingResult: MarkingResult | null = null;
  let markingFailed    = false;
  let markingError     = '';
  const auditEntries: AuditEntry[] = [];

  try {
    const call1 = await callClaudeForMarking(systemPrompt, userMessage);
    auditEntries.push({
      model:           call1.model,
      inputTokens:     call1.inputTokens,
      outputTokens:    call1.outputTokens,
      latencyMs:       call1.latencyMs,
      costEstimateUsd: call1.costEstimateUsd,
      rawRequest,
      rawResponse:     call1.text,
    });
    markingResult = parseMarkingResult(call1.text);

    // Dual-pass for L5: call again and arbitrate if bands differ
    if (bloom_target === 5) {
      const call2 = await callClaudeForMarking(systemPrompt, userMessage);
      auditEntries.push({
        model:           call2.model,
        inputTokens:     call2.inputTokens,
        outputTokens:    call2.outputTokens,
        latencyMs:       call2.latencyMs,
        costEstimateUsd: call2.costEstimateUsd,
        rawRequest,
        rawResponse:     call2.text,
      });
      const result2 = parseMarkingResult(call2.text);

      if (markingResult.band !== result2.band) {
        // Conservative arbitration: take the lower band
        const bands = ['Full', 'Good', 'Partial', 'Minimal'];
        const idx1  = bands.indexOf(markingResult.band);
        const idx2  = bands.indexOf(result2.band);
        markingResult.band               = bands[Math.max(idx1, idx2)];
        markingResult.gaps               = Array.from(new Set([...markingResult.gaps,               ...result2.gaps]));
        markingResult.mark_points_missed = Array.from(new Set([...markingResult.mark_points_missed, ...result2.mark_points_missed]));
      }
    }
  } catch (err) {
    markingFailed = true;
    markingError  = (err as Error).message;
  }

  // 7. Write answer_log (always — even on failure, to record the attempt)
  const correct = !markingFailed && markingResult != null
    ? markingResult.score >= Math.ceil(maxMarks / 2)
    : false;

  const { data: answerLogRow } = await supabase
    .from('answer_log')
    .insert({
      user_id:                user.id,
      question_id,
      user_course_id,
      correct,
      response_text:          student_response,
      marking_status:         markingFailed ? 'failed' : 'marked',
      marking_model:          auditEntries[0]?.model ?? 'claude-sonnet-4-6',
      marking_prompt_version: promptVersion,
      question_version:       question.question_version ?? 'v1',
      marked_at:              new Date().toISOString(),
      bloom_demonstrated:     markingResult?.bloom_demonstrated ?? null,
      gaps:                   markingResult?.gaps ?? [],
    })
    .select('id')
    .single();

  // 8. Write marking_audit_log — one row per Claude call (service_role bypasses RLS)
  for (const entry of auditEntries) {
    await serviceSupabase
      .from('marking_audit_log')
      .insert({
        answer_log_id:          answerLogRow?.id ?? null,
        marking_model:          entry.model,
        marking_prompt_version: promptVersion,
        raw_request:            entry.rawRequest,
        raw_response:           { text: entry.rawResponse },
        latency_ms:             entry.latencyMs,
        cost_estimate_usd:      entry.costEstimateUsd,
      })
      .then(({ error }) => {
        // Best-effort — log failure but don't surface it to the student
        if (error) console.error('[marking_audit_log] write failed:', error.message);
      });
  }

  // 9. Increment rate limit counter
  await supabase
    .from('marking_rate_limits')
    .upsert(
      {
        user_id:         user.id,
        date:            today,
        request_count:   (rateRow?.request_count ?? 0) + 1,
        last_request_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,date' }
    );

  // 10. Return
  if (markingFailed) {
    return NextResponse.json(
      { error: `Marking failed: ${markingError}. Your attempt has been recorded.` },
      { status: 502 }
    );
  }

  // Backwards-compatible response: original fields + new fields
  return NextResponse.json({
    band:                markingResult!.band,
    score:               markingResult!.score,
    bloom_demonstrated:  markingResult!.bloom_demonstrated,
    gaps:                markingResult!.gaps,
    // New fields — existing clients that ignore these won't break
    mark_points_awarded: markingResult!.mark_points_awarded,
    mark_points_missed:  markingResult!.mark_points_missed,
    feedback:            markingResult!.feedback,
  });
}
