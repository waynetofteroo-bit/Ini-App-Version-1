import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { callClaudeJSON } from '@/lib/claude';

interface MarkingResult {
  band: 'Full' | 'Good' | 'Partial' | 'Minimal';
  score: number;
  bloom_demonstrated: number;
  gaps: string[];
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { question_id, student_response, bloom_target } = body as {
    question_id: string;
    student_response: string;
    bloom_target: number;
  };

  // Fetch question + marking_prompt
  const { data: question } = await supabase
    .from('questions')
    .select('stem, marking_prompt, bloom_level')
    .eq('id', question_id)
    .single();

  if (!question?.marking_prompt) {
    return NextResponse.json({ error: 'No marking scheme available' }, { status: 400 });
  }

  const mp = question.marking_prompt as any;
  const systemPrompt = `You are an expert GCSE/A-Level examiner. Mark the following student response.

Question: ${question.stem}

Mark scheme points:
${JSON.stringify(mp.markscheme_points ?? [])}

Rubric bands:
${JSON.stringify(mp.rubric_bands ?? {})}

Return JSON with fields:
- band: one of "Full", "Good", "Partial", "Minimal"
- score: numeric score (0-${mp.max_marks ?? 4})
- bloom_demonstrated: Bloom level demonstrated (1-5)
- gaps: array of strings describing what was missing`;

  // NEVER interpolate student_response into systemPrompt
  const result = await callClaudeJSON<MarkingResult>(
    systemPrompt,
    student_response,
    800
  );

  // For bloom_target 5: call twice and arbitrate
  if (bloom_target === 5) {
    const result2 = await callClaudeJSON<MarkingResult>(
      systemPrompt,
      student_response,
      800
    );

    if (result.band !== result2.band) {
      // Arbitrate: take the lower band
      const bands = ['Full', 'Good', 'Partial', 'Minimal'];
      const idx1 = bands.indexOf(result.band);
      const idx2 = bands.indexOf(result2.band);
      result.band = bands[Math.max(idx1, idx2)] as MarkingResult['band'];
      result.gaps = Array.from(new Set(result.gaps.concat(result2.gaps)));
    }
  }

  return NextResponse.json(result);
}
