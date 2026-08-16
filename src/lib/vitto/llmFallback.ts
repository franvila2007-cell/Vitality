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
// AND estimates a full micronutrient panel — run once per message on every
// logged item, whether it matched the local database or was LLM-estimated,
// so both the rank's quality component and micronutrient totals always have
// a real signal, in a single call rather than two. There's no nutrition
// label to read here, just a name and portion, so the micronutrient numbers
// are honest estimates, not lab-measured values — that caveat is surfaced
// in the UI, not enforced here.
const MICRO_KEYS = [
  'fiber_g', 'sugar_g', 'sodium_mg', 'calcium_mg', 'iron_mg', 'potassium_mg', 'magnesium_mg', 'zinc_mg',
  'vitamin_a_mcg', 'vitamin_c_mg', 'vitamin_d_mcg', 'vitamin_e_mg', 'vitamin_k_mcg',
  'vitamin_b6_mg', 'vitamin_b12_mcg', 'folate_mcg',
] as const;
type MicroKey = (typeof MICRO_KEYS)[number];
export type FoodInsight = { quality_score: number } & Record<MicroKey, number>;

const INSIGHTS_SYSTEM_PROMPT = `You analyze food/drink log entries for a fitness coaching app. For each item, given its name and calorie count, provide:

1. quality_score (0-100 integer): nutritional quality based on the type of food, not portion size —
   85-100 whole/minimally processed (plain meat/fish/eggs, vegetables, fruit, whole grains, plain dairy)
   60-84 balanced/lightly processed (home-cooked mixed meals, whole-grain bread, nuts)
   35-59 moderately processed (fast food, fried food, sugary cereal, sweetened drinks)
   0-34 ultra-processed/junk (candy, chips, soda, pastries, alcohol)

2. A full micronutrient estimate for that specific portion, using your best nutrition knowledge (reasonable honest estimates, not a lab measurement): fiber_g, sugar_g, sodium_mg, calcium_mg, iron_mg, potassium_mg, magnesium_mg, zinc_mg, vitamin_a_mcg, vitamin_c_mg, vitamin_d_mcg, vitamin_e_mg, vitamin_k_mcg, vitamin_b6_mg, vitamin_b12_mcg, folate_mcg. Use 0 for anything genuinely negligible in that food (e.g. vitamin_c_mg: 0 for plain chicken breast) — never omit a field.

Respond with ONLY a JSON object, no other text, in this exact shape:
{"items": [{"quality_score": number, "fiber_g": number, "sugar_g": number, "sodium_mg": number, "calcium_mg": number, "iron_mg": number, "potassium_mg": number, "magnesium_mg": number, "zinc_mg": number, "vitamin_a_mcg": number, "vitamin_c_mg": number, "vitamin_d_mcg": number, "vitamin_e_mg": number, "vitamin_k_mcg": number, "vitamin_b6_mg": number, "vitamin_b12_mcg": number, "folate_mcg": number}, ...]}
One object per input item, in the same order given.`;

export { MICRO_KEYS };

export async function llmEstimateFoodInsights(items: { name: string; calories: number }[], apiKey: string): Promise<FoodInsight[] | null> {
  if (items.length === 0) return null;
  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: Math.min(4000, 300 + items.length * 250),
      temperature: 0,
      system: INSIGHTS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: items.map((it, i) => `${i + 1}. ${it.name} — ${Math.round(it.calories)} kcal`).join('\n') }],
    });
    const block = msg.content[0];
    if (!block || block.type !== 'text') return null;
    const parsed = parseJsonLoose(block.text) as { items?: unknown };
    if (!Array.isArray(parsed.items) || parsed.items.length !== items.length) return null;

    const clean = (v: unknown) => Math.max(0, Number(v) || 0);
    const results: FoodInsight[] = parsed.items.map((raw) => {
      const r = raw as Record<string, unknown>;
      const insight = { quality_score: Math.max(0, Math.min(100, Math.round(Number(r.quality_score) || 0))) } as FoodInsight;
      for (const key of MICRO_KEYS) insight[key] = clean(r[key]);
      return insight;
    });
    return results;
  } catch (err) {
    console.error('llmEstimateFoodInsights failed', err);
    return null; // graceful degradation — quality_score/micronutrients stay null, excluded from the rank average
  }
}

// Photo-based logging: a client photographs their plate instead of typing
// it out. One vision call identifies every distinct item AND estimates its
// full profile (macros + quality + micronutrients) in one pass, rather than
// chaining into the text-based estimator — a photo has no name to hand that
// function anyway, and this way it's a single request, not two.
export type PhotoFoodItem = { label: string; cal: number; protein_g: number; carbs_g: number; fat_g: number; quality_score: number } & Record<MicroKey, number>;

const PHOTO_SYSTEM_PROMPT = `You are a nutrition estimation assistant inside a food-logging app. You are shown a photo of a meal or food item. Identify every distinct food/drink item visible and, for each one:

1. A sensible label (e.g. "grilled chicken breast", "steamed rice", "side salad").
2. Estimate the portion size from what's visible in the photo (plate size, typical servings) and give calories, protein (g), carbs (g), fat (g) for that portion. Reasonable, honest visual estimates are expected — this is not a request for lab-precision.
3. quality_score (0-100 integer): nutritional quality based on the type of food —
   85-100 whole/minimally processed (plain meat/fish/eggs, vegetables, fruit, whole grains, plain dairy)
   60-84 balanced/lightly processed (home-cooked mixed meals, whole-grain bread, nuts)
   35-59 moderately processed (fast food, fried food, sugary cereal, sweetened drinks)
   0-34 ultra-processed/junk (candy, chips, soda, pastries, alcohol)
4. A full micronutrient estimate for that portion: fiber_g, sugar_g, sodium_mg, calcium_mg, iron_mg, potassium_mg, magnesium_mg, zinc_mg, vitamin_a_mcg, vitamin_c_mg, vitamin_d_mcg, vitamin_e_mg, vitamin_k_mcg, vitamin_b6_mg, vitamin_b12_mcg, folate_mcg. Use 0 for anything negligible — never omit a field.

Respond with ONLY a JSON object, no other text, in this exact shape:
{"items": [{"label": "string", "cal": number, "protein_g": number, "carbs_g": number, "fat_g": number, "quality_score": number, "fiber_g": number, "sugar_g": number, "sodium_mg": number, "calcium_mg": number, "iron_mg": number, "potassium_mg": number, "magnesium_mg": number, "zinc_mg": number, "vitamin_a_mcg": number, "vitamin_c_mg": number, "vitamin_d_mcg": number, "vitamin_e_mg": number, "vitamin_k_mcg": number, "vitamin_b6_mg": number, "vitamin_b12_mcg": number, "folate_mcg": number}, ...]}

If the photo doesn't show any food or drink, respond with {"items": []}.`;

export async function llmAnalyzeMealPhoto(
  base64Data: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
  apiKey: string
): Promise<PhotoFoodItem[] | null> {
  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      temperature: 0,
      system: PHOTO_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: 'What food/drink is in this photo?' },
        ],
      }],
    });
    const block = msg.content[0];
    if (!block || block.type !== 'text') return null;
    const parsed = parseJsonLoose(block.text) as { items?: unknown };
    if (!Array.isArray(parsed.items)) return null;

    const clean = (v: unknown) => Math.max(0, Number(v) || 0);
    const items = parsed.items
      .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object' && typeof (it as Record<string, unknown>).label === 'string')
      .map((r) => {
        const item = {
          label: String(r.label), cal: clean(r.cal), protein_g: clean(r.protein_g), carbs_g: clean(r.carbs_g), fat_g: clean(r.fat_g),
          quality_score: Math.max(0, Math.min(100, Math.round(Number(r.quality_score) || 0))),
        } as PhotoFoodItem;
        for (const key of MICRO_KEYS) item[key] = clean(r[key]);
        return item;
      });
    return items.length > 0 ? items : null;
  } catch (err) {
    console.error('llmAnalyzeMealPhoto failed', err);
    return null;
  }
}
