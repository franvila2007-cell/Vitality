// LLM fallback for Vitto — only invoked when the local rule/fuzzy parser
// (parser.ts) can't confidently resolve some part of a message. Its job is
// narrow on purpose: turn messy/typo'd/slang text into clean, plain-English
// food phrases with quantities. It does NOT invent calorie/macro numbers —
// the cleaned text is re-run through the exact same local FOOD_DB lookup,
// so logged macros always come from the coach's real food database, never
// from the model. This keeps the common case free (most messages resolve
// locally) and keeps numbers trustworthy even when the model is used.
import Anthropic from '@anthropic-ai/sdk';

// Claude sometimes wraps a "JSON only" response in a markdown code fence
// anyway — strip that before parsing rather than let it silently fail.
function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

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

// Last-resort fallback: reached only when a food is genuinely not in the
// local database (or any typo/slang variant of something that is) — a
// restaurant item, a home-cooked dish, a branded product. Rather than
// refusing and asking the client for a manual calorie estimate, this asks
// Claude to estimate macros directly from its own nutrition knowledge, the
// same way a knowledgeable coach would ballpark an unfamiliar meal. Every
// entry logged this way is marked `estimated: true` with a capped
// confidence so it's visibly distinct from the coach's verified database —
// never silently presented as exact.
export type EstimatedFoodItem = { label: string; cal: number; protein_g: number; carbs_g: number; fat_g: number };

const ESTIMATE_SYSTEM_PROMPT = `You are a nutrition estimation assistant inside a food-logging app. The user's message describes food/drink that a local nutrition database did NOT recognize — it may be a restaurant or chain menu item, a home-cooked dish, a branded product, or something described in enough detail to estimate.

For each distinct food/drink item in the message:
- Identify a sensible label (include the brand/restaurant name if given).
- Infer a reasonable portion from context, or assume one typical serving if no amount is given.
- Estimate calories, protein (g), carbs (g), and fat (g) for that portion using your best available nutrition knowledge. Reasonable, honest estimates are expected — this is not a request for a precise lab measurement.

Respond with ONLY a JSON object, no other text, in this exact shape:
{"items": [{"label": "string", "cal": number, "protein_g": number, "carbs_g": number, "fat_g": number}]}

If nothing in the message is actually food or drink, respond with {"items": []}.`;

export async function llmEstimateFoods(text: string, apiKey: string): Promise<EstimatedFoodItem[] | null> {
  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      temperature: 0,
      system: ESTIMATE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
    });
    const block = msg.content[0];
    if (!block || block.type !== 'text') return null;
    const parsed = parseJsonLoose(block.text) as { items?: unknown };
    if (!Array.isArray(parsed.items)) return null;
    const items = parsed.items.filter(
      (it): it is EstimatedFoodItem =>
        !!it && typeof it === 'object' &&
        typeof (it as EstimatedFoodItem).label === 'string' &&
        typeof (it as EstimatedFoodItem).cal === 'number' &&
        typeof (it as EstimatedFoodItem).protein_g === 'number' &&
        typeof (it as EstimatedFoodItem).carbs_g === 'number' &&
        typeof (it as EstimatedFoodItem).fat_g === 'number'
    );
    return items.length > 0 ? items : null;
  } catch (err) {
    console.error('llmEstimateFoods failed', err);
    return null; // graceful degradation — caller falls back to the local "ask for calories" flow
  }
}

// Rates food quality (whole/minimally processed vs. junk/ultra-processed)
// for the daily gold/silver/bronze rank — run once per message on every
// logged item, whether it matched the local database or was LLM-estimated,
// so the rank's quality component always has a real signal. Judged from the
// name alone (not calories/portion), since the rubric is about the kind of
// food, not how much of it was eaten.
const QUALITY_SYSTEM_PROMPT = `You rate the nutritional quality of food/drink items for a fitness coaching app, on a 0-100 scale:
- 85-100: whole, minimally processed foods (plain meat/fish/eggs, vegetables, fruit, whole grains, plain dairy)
- 60-84: balanced/lightly processed (home-cooked mixed meals, whole-grain bread, plain pasta, nuts)
- 35-59: moderately processed (fast food, fried food, sugary cereal, white bread, sweetened drinks)
- 0-34: ultra-processed/junk (candy, chips, soda, pastries, deep-fried fast food, alcohol)

Judge each item on its own, based on the typical preparation implied by its name — not on portion size or calorie count.

Respond with ONLY a JSON object, no other text, in this exact shape:
{"scores": [number, ...]}
One integer 0-100 per input item, in the same order given.`;

export async function llmRateFoodQuality(foodNames: string[], apiKey: string): Promise<number[] | null> {
  if (foodNames.length === 0) return null;
  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      temperature: 0,
      system: QUALITY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: foodNames.map((name, i) => `${i + 1}. ${name}`).join('\n') }],
    });
    const block = msg.content[0];
    if (!block || block.type !== 'text') return null;
    const parsed = parseJsonLoose(block.text) as { scores?: unknown };
    if (!Array.isArray(parsed.scores) || parsed.scores.length !== foodNames.length) return null;
    const scores = parsed.scores.map((s) => Math.max(0, Math.min(100, Math.round(Number(s)))));
    if (scores.some((s) => Number.isNaN(s))) return null;
    return scores;
  } catch (err) {
    console.error('llmRateFoodQuality failed', err);
    return null; // graceful degradation — quality_score stays null, excluded from the rank average
  }
}
