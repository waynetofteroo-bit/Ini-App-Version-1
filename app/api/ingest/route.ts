import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { callClaudeJSON } from '@/lib/claude';

export async function POST(request: Request) {
  // Admin-only: check ADMIN_SECRET header
  const secret = request.headers.get('x-admin-secret');
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { spec_content, unit_id, exam_board } = body as {
    spec_content: string;
    unit_id: string;
    exam_board: string;
  };

  if (!spec_content || !unit_id || !exam_board) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Agent 1 — Extractor
  const extracted = await callClaudeJSON<{ topics: { title: string; outcomes: string[] }[] }>(
    `You are a curriculum analyst. Extract all topics and their learning outcomes from the specification content provided.
Return a JSON object with a "topics" array. Each topic has a "title" (string) and "outcomes" (string array).`,
    spec_content,
    2000
  );

  // Agent 2 — Classifier
  const classified = await callClaudeJSON<{
    topics: {
      title: string;
      concept_uri: string;
      bloom_ceiling: number;
      topic_tier: string;
      outcomes: { text: string; bloom_level: number }[];
    }[];
  }>(
    `You are a Bloom's Taxonomy expert. For each topic and its outcomes, classify:
- concept_uri: OWL-style URI e.g. "${exam_board.toLowerCase()}:physics:electricity:ohms-law"
- bloom_ceiling: highest Bloom's level (1-5) achievable for this topic
- topic_tier: "core" or "higher"
- For each outcome, assign bloom_level (1-5)

Return the same topics array with these additions.`,
    JSON.stringify(extracted),
    3000
  );

  // Agent 3 — Auditor (validates quality — produces question suggestions)
  const audited = await callClaudeJSON<{
    topics: typeof classified.topics;
    questions: {
      concept_uri: string;
      stem: string;
      options: { text: string; idx: number }[];
      correct_idx: number;
      bloom_level: number;
    }[];
  }>(
    `You are an exam question writer for ${exam_board} GCSE/A-Level.
For each topic, write 4 high-quality multiple-choice questions at varying Bloom levels (1-4).
Each question must have exactly 4 options with plausible distractors.
Return JSON with the original topics array plus a "questions" array.
Each question: { concept_uri, stem, options: [{text, idx}], correct_idx (0-3), bloom_level }`,
    JSON.stringify(classified),
    4000
  );

  // Agent 4 — Graph Builder
  const graph = await callClaudeJSON<{
    edges: { from_uri: string; to_uri: string; relation: string }[];
  }>(
    `You are a knowledge graph architect. Given these topics, identify prerequisite and bridge relationships.
Return JSON with an "edges" array: { from_uri, to_uri, relation: "prerequisite"|"bridge" }
Only include relationships where one topic is clearly required before another.`,
    JSON.stringify(classified.topics.map((t) => ({ uri: t.concept_uri, title: t.title }))),
    2000
  );

  // Write to Supabase
  const supabase = createServiceClient();

  // Insert nodes
  const nodeInserts = classified.topics.map((t) => ({
    unit_id,
    concept_uri: t.concept_uri,
    label: t.title,
    bloom_ceiling: t.bloom_ceiling,
    topic_tier: t.topic_tier,
    exam_board,
    gap_flags: [],
  }));

  const { data: nodes, error: nodeErr } = await supabase
    .from('knowledge_graph_nodes')
    .upsert(nodeInserts, { onConflict: 'concept_uri' })
    .select('id, concept_uri');

  if (nodeErr) return NextResponse.json({ error: nodeErr.message }, { status: 500 });

  const nodeMap = Object.fromEntries((nodes ?? []).map((n: any) => [n.concept_uri, n.id]));

  // Insert edges
  const edgeInserts = (graph.edges ?? [])
    .filter((e) => nodeMap[e.from_uri] && nodeMap[e.to_uri])
    .map((e) => ({
      from_node: nodeMap[e.from_uri],
      to_node: nodeMap[e.to_uri],
      relation: e.relation,
      exam_board,
    }));

  if (edgeInserts.length > 0) {
    await supabase.from('knowledge_graph_edges').insert(edgeInserts);
  }

  // Insert questions
  const questionInserts = (audited.questions ?? [])
    .filter((q) => nodeMap[q.concept_uri])
    .map((q) => ({
      concept_id: nodeMap[q.concept_uri],
      stem: q.stem,
      options: q.options,
      correct_idx: q.correct_idx,
      bloom_level: q.bloom_level,
      exam_board,
    }));

  if (questionInserts.length > 0) {
    await supabase.from('questions').insert(questionInserts);
  }

  return NextResponse.json({
    nodesCreated: nodeInserts.length,
    edgesCreated: edgeInserts.length,
    questionsCreated: questionInserts.length,
  });
}
