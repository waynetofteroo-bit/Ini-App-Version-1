import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

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
