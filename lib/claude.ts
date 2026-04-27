import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

// Pricing constants for claude-sonnet-4-6 (USD per million tokens)
const SONNET_4_6_INPUT_USD_PER_M  = 3;
const SONNET_4_6_OUTPUT_USD_PER_M = 15;

export interface MarkingCallResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costEstimateUsd: number;
}

// Used by the marking endpoint — returns full metadata for audit logging.
// Pins model to claude-sonnet-4-6, temperature 0, max_tokens 1500.
// Student response must be embedded in userMessage by the caller (never in systemPrompt).
export async function callClaudeForMarking(
  systemPrompt: string,
  userMessage: string
): Promise<MarkingCallResult> {
  const t0 = Date.now();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const latencyMs = Date.now() - t0;
  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected non-text response from Claude');

  const inputTokens  = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costEstimateUsd =
    (inputTokens * SONNET_4_6_INPUT_USD_PER_M + outputTokens * SONNET_4_6_OUTPUT_USD_PER_M) /
    1_000_000;

  return {
    text: block.text,
    model: response.model,
    inputTokens,
    outputTokens,
    latencyMs,
    costEstimateUsd,
  };
}

export async function callClaude(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 1000
): Promise<string> {
  // NEVER interpolate userMessage directly into systemPrompt
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type');
  return block.text;
}

export async function callClaudeJSON<T>(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 1000
): Promise<T> {
  const raw = await callClaude(
    systemPrompt + '\n\nRespond ONLY with valid JSON. No markdown fences, no preamble.',
    userMessage,
    maxTokens
  );
  return JSON.parse(raw) as T;
}
