// The one place the meal-plan pipeline talks to Claude. Every call asks for
// structured JSON validated against a Zod schema, so the rest of the
// pipeline only ever handles typed data. Server-only.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type * as z from 'zod/v4';

export const MEAL_PLAN_MODEL = 'claude-opus-5-5';

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  client ??= new Anthropic();
  return client;
}

export type ClaudeUsage = { model: string; inputTokens: number; outputTokens: number };

/**
 * Sends one request and returns the parsed, schema-valid result. Rate limits,
 * overloads and network errors are retried by the SDK (maxRetries); a refusal
 * falls back server-side to another model ("default" fallbacks).
 */
export async function askClaude<T extends z.ZodType>(opts: {
  system: string;
  /** Plain text, or content blocks (e.g. images followed by text) */
  prompt: string | Anthropic.Beta.BetaContentBlockParam[];
  schema: T;
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
}): Promise<{ data: z.infer<T>; usage: ClaudeUsage }> {
  const format = betaZodOutputFormat(opts.schema);
  // Streamed: the SDK refuses non-streaming requests whose max_tokens could
  // take longer than its 10-minute limit, which recipe writing can.
  const stream = anthropic().beta.messages.stream(
    {
      model: MEAL_PLAN_MODEL,
      max_tokens: opts.maxTokens ?? 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: opts.effort ?? 'medium', format: { type: 'json_schema', schema: format.schema } },
      system: opts.system,
      messages: [{ role: 'user', content: opts.prompt }],
    },
    { maxRetries: 3 },
  );
  const response = await stream.finalMessage();
  if (response.stop_reason === 'refusal') throw new Error('Claude declined the request');
  if (response.stop_reason === 'max_tokens') throw new Error('Claude ran out of output tokens');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Claude returned output that was not JSON');
  }
  const parsed = opts.schema.safeParse(json);
  if (!parsed.success) throw new Error('Claude returned output that did not match the schema');
  return {
    data: parsed.data as z.infer<T>,
    usage: { model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
}
