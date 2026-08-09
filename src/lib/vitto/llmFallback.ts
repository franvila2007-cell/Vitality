// LLM fallback for Vitto — only invoked when the local rule/fuzzy parser
// (parser.ts) can't confidently resolve some part of a message. Its job is
// narrow on purpose: turn messy/typo'd/slang text into clean, plain-English
// food phrases with quantities. It does NOT invent calorie/macro numbers —
// the cleaned text is re-run through the exact same local FOOD_DB lookup,
// so logged macros always come from the coach's real food database, never
// from the model. This keeps the common case free (most messages resolve
// locally) and keeps numbers trustworthy even when the model is used.
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You normalize messy natural-language food-log messages into clean, plain English food phrases with quantities, for a downstream keyword matcher.

Rules:
- Fix typos, slang, and abbreviations (e.g. "chikn" -> "chicken", "sm" -> "small", "n" -> "and").
- Preserve every quantity, weight (g/kg/ml/l), and count exactly as given or as the clear intended value — never invent or guess a specific number that wasn't implied.
- Preserve every distinct food item mentioned.
- Output ONLY the rewritten phrase, nothing else — no explanation, no punctuation commentary, no quotes around it.
- If the text doesn't seem to describe food/drink at all, output exactly: NONE`;

export async function llmAssistParse(text: string, apiKey: string): Promise<string | null> {
  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
    });
    const block = msg.content[0];
    if (!block || block.type !== 'text') return null;
    const cleaned = block.text.trim();
    if (!cleaned || cleaned.toUpperCase() === 'NONE') return null;
    return cleaned;
  } catch (err) {
    console.error('llmAssistParse failed', err);
    return null; // graceful degradation — caller falls back to the local "ask for calories" flow
  }
}
