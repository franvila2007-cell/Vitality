// Vitto — the natural-language food-logging parser.
//
// This is a faithful port of the original single-file app's chat logic
// (vitality-dashboard-template_2.html:1057-2013), adapted from a stateful
// single-browser script (module-level globals, direct DOM/localStorage
// writes) into a pure function usable from a stateless API route:
//
//   processVittoMessage(text, context) -> { reply, actions, ... }
//
// The caller (the /api/vitto/message route) is responsible for loading
// `context` from Supabase before calling this, and applying `actions`
// (insert/delete/update food_log_entries, upsert chat_pending_state)
// afterwards. Nothing in this file talks to a database directly, which
// keeps the parsing/matching logic — the part worth testing in isolation —
// free of I/O.

import type { FoodEntry } from './foodDb';

// ── Types ───────────────────────────────────────────────────────────────

export type FlatFood = {
  type: 'per100g' | 'perUnit' | 'dish';
  cal: number; prot: number; carb: number; fat: number;
  defaultGrams?: number; cupGrams?: number; sliceGrams?: number; tbspGrams?: number; tspGrams?: number;
  label?: string; avgGrams?: number;
  cookState?: 'raw' | 'cooked';
};

export type MealEntry = {
  id: string;
  name: string;
  cal: number; prot: number; carb: number; fat: number;
  originalText?: string | null;
  matchedFood?: string | null;
  amount?: number | null;
  unit?: string | null;
  estimated?: boolean;
  confidence?: number;
};

export type NewMealEntry = Omit<MealEntry, 'id'>;

export type MealTemplate = {
  id: string;
  name: string;
  cal: number; prot: number; carb: number; fat: number;
  mealtime?: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null;
};

export type PendingState =
  | { type: 'unknown_food'; text: string }
  | { type: 'mealtime_options'; templateIds: string[] };

export type VittoAction =
  | { kind: 'add_meal'; entry: NewMealEntry }
  | { kind: 'remove_meal'; id: string }
  | { kind: 'clear_meals' }
  | { kind: 'set_pending'; pending: PendingState }
  | { kind: 'clear_pending' };

export type VittoFoods = {
  /** foods_global rows merged with this client's custom_foods, custom taking priority on name collisions */
  db: Record<string, FoodEntry>;
  /** food_synonyms, phrase -> canonical db key */
  synonyms: Record<string, string>;
};

export type VittoContext = {
  foods: VittoFoods;
  todayMeals: MealEntry[];
  targets: { cal: number; prot: number; carb: number; fat: number };
  mealTemplates: MealTemplate[];
  streakDays: number;
  pending: PendingState | null;
  clientFirstName: string | null;
};

export type VittoResult = { reply: string; actions: VittoAction[] };

// ── Quantity words ──────────────────────────────────────────────────────

// WORD_NUMBERS covers exact counts (a/two/few) AND rough portion words
// ("most", "a little") mapped to a fraction of a standard serving — these
// are intentionally approximate, matching how a person actually talks.
const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  couple: 2, few: 3, half: 0.5,
  most: 0.75, 'a little': 0.25, 'a bit': 0.25, 'a splash': 0.15, 'a small amount': 0.2,
  'most of': 0.75, 'a little of': 0.25, 'a bit of': 0.25,
};
// Longer/more specific phrases must be checked before short ones, or "a" would
// win over "a little of" every time since both appear in the same text.
const WORD_NUMBER_ORDER = Object.keys(WORD_NUMBERS).sort((a, b) => b.length - a.length);

function wordToQty(lower: string): number | null {
  for (const w of WORD_NUMBER_ORDER) {
    if (new RegExp('\\b' + w.replace(/ /g, '\\s+') + '\\b').test(lower)) return WORD_NUMBERS[w];
  }
  return null;
}

// Approximate portion words ("most", "a splash") only — used specifically to
// scale a food's default serving when no explicit unit/weight is given.
// Kept separate from wordToQty because plain counting words ("a", "one")
// must NOT be read as a fraction of a serving — "a chicken" means a normal
// serving, not 100% of one multiplied by 1; this only fires for words that
// are inherently approximate.
const FRACTION_WORDS = ['most of', 'a little of', 'a bit of', 'most', 'a little', 'a bit', 'a splash', 'a small amount', 'half'];
function wordToFraction(lower: string): number | null {
  for (const w of FRACTION_WORDS) {
    if (new RegExp('\\b' + w.replace(/ /g, '\\s+') + '\\b').test(lower)) return WORD_NUMBERS[w.replace(' of', '')];
  }
  return null;
}

// ── Food lookup / fuzzy matching ────────────────────────────────────────

// Sorted longest-first so multi-word dishes ("chicken caesar salad") win
// over single words ("chicken") when both are present in what someone typed.
function getFoodLookupPhrases(foods: VittoFoods): string[] {
  return Object.keys(foods.db).concat(Object.keys(foods.synonyms)).sort((a, b) => b.length - a.length);
}

// Standard edit-distance algorithm — used only as a fallback when nothing
// matched exactly, so a typo like "chikn" or "banan" still resolves.
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]);
    }
  }
  return d[m][n];
}

// Tries every word/word-pair in the message against every known food name.
// Only accepts a match within a tight, length-scaled edit-distance budget —
// tight enough that "chikn"→"chicken" matches but unrelated short words
// don't accidentally match something. Returns {phrase, distance, confidence}
// or null.
//
// IMPORTANT: short words (3-4 letters) are excluded from fuzzy matching
// entirely, and common English words are hard-blocked via FUZZY_STOPWORDS.
// A real bug proved why: "had" is 1 edit from "ham", "raw" is 2 edits from
// "prawn" — ordinary sentence words are frequently within edit-distance 1-2
// of some short food name purely by coincidence. Fuzzy matching is only
// safe on longer words, where a couple of edits is a real spelling mistake,
// not a coincidence.
const FUZZY_STOPWORDS = new Set([
  'the', 'and', 'had', 'has', 'have', 'was', 'were', 'ate', 'eat', 'eating', 'add', 'added',
  'raw', 'not', 'for', 'some', 'with', 'this', 'that', 'then', 'than', 'just', 'also',
  'about', 'around', 'only', 'left', 'more', 'less', 'most', 'half', 'none', 'much',
  'many', 'very', 'still', 'yes', 'no', 'did', 'does', 'you', 'your', 'again',
  'today', 'now', 'later', 'before', 'after', 'same', 'last', 'next', 'new', 'old',
  'day', 'one', 'two', 'all', 'any', 'out', 'into', 'from', 'over', 'under', 'cooked',
  'grilled', 'roasted', 'baked', 'fried', 'boiled', 'steamed', 'uncooked', 'minced',
]);

function fuzzyMatchFood(lower: string, foods: VittoFoods): { phrase: string; distance: number; confidence: number } | null {
  const tokens = lower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 5 && !FUZZY_STOPWORDS.has(w));
  const candidates: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    candidates.push(tokens[i]);
    if (i < tokens.length - 1 && !FUZZY_STOPWORDS.has(tokens[i + 1])) candidates.push(tokens[i] + ' ' + tokens[i + 1]);
  }
  const phrases = getFoodLookupPhrases(foods).filter((p) => p.length >= 5);
  let best: { phrase: string; distance: number; confidence: number } | null = null;
  for (const cand of candidates) {
    for (const phrase of phrases) {
      // skip trivial/huge length mismatches — not worth computing distance
      if (Math.abs(cand.length - phrase.length) > 3) continue;
      const dist = levenshtein(cand, phrase.toLowerCase());
      const budget = phrase.length <= 6 ? 1 : phrase.length <= 9 ? 2 : 3;
      if (dist <= budget && (!best || dist < best.distance)) {
        best = { phrase, distance: dist, confidence: Math.max(0.5, 1 - dist / phrase.length) };
      }
    }
  }
  return best;
}

function getFoodEntry(key: string, foods: VittoFoods): FoodEntry | undefined {
  return foods.db[key];
}

function resolveFoodKey(phrase: string, foods: VittoFoods): string | undefined {
  return foods.db[phrase] ? phrase : foods.synonyms[phrase];
}

// Meat/fish that has a raw vs cooked profile stores {raw:{...},cooked:{...}}
// instead of flat cal/prot/carb/fat. This picks the right one from words in
// the message, defaulting to cooked — "I had chicken" almost always means
// cooked, ready-to-eat chicken, not the raw weight before it went in the pan.
function detectCookState(lower: string): 'raw' | 'cooked' | null {
  if (/\b(raw|uncooked)\b/.test(lower)) return 'raw';
  if (/\b(cooked|grilled|roasted|baked|fried|pan[- ]?fried|boiled|steamed|bbq|barbecu?ed?|seared|poached)\b/.test(lower)) return 'cooked';
  return null;
}

// Resolves a food entry to a flat {cal,prot,carb,fat,...} shape regardless of
// whether it's a simple entry or a raw/cooked pair — everything downstream
// (grams scaling, defaultGrams, etc.) can then treat every food the same way.
function resolveStatefulFood(food: FoodEntry, lower: string): FlatFood {
  if ('raw' in food && 'cooked' in food) {
    const state = detectCookState(lower) || 'cooked';
    const stateVals = state === 'raw' ? food.raw : food.cooked;
    return { type: food.type, cal: stateVals.cal, prot: stateVals.prot, carb: stateVals.carb, fat: stateVals.fat, defaultGrams: food.defaultGrams, cupGrams: food.cupGrams, sliceGrams: food.sliceGrams, tbspGrams: food.tbspGrams, tspGrams: food.tspGrams, cookState: state };
  }
  return food as FlatFood;
}

// Normalises any food entry (whatever its default type) to a per-100g basis,
// so an explicit gram amount can scale ANY food correctly — e.g. "150g banana"
// or "300g chicken caesar salad" — not just the foods stored per-100g already.
function getPer100gMacros(food: FlatFood) {
  if (food.type === 'per100g') return { cal: food.cal, prot: food.prot, carb: food.carb, fat: food.fat };
  const g = food.avgGrams || 100;
  return { cal: (food.cal / g) * 100, prot: (food.prot / g) * 100, carb: (food.carb / g) * 100, fat: (food.fat / g) * 100 };
}

export type ParsedFoodPart = {
  label: string;
  matchedFood: string;
  amount: number;
  unit: string;
  estimated: boolean;
  confidence: number;
  cal: number; prot: number; carb: number; fat: number;
};

export function parseFoodPart(part: string, foods: VittoFoods): ParsedFoodPart | null {
  const lower = part.toLowerCase();
  let matchedPhrase: string | null = null;
  let confidence = 1.0;
  // Compared lowercased (the coach-taught foods DB is lowercase, but a
  // client-saved recipe name can be typed in any case) — matchedPhrase itself
  // keeps its original casing so it still round-trips through foods.db[phrase].
  for (const phrase of getFoodLookupPhrases(foods)) {
    if (lower.includes(phrase.toLowerCase())) { matchedPhrase = phrase; break; }
  }
  if (!matchedPhrase) {
    // exact match failed — try fuzzy, so typos like "chikn" or "banan" still resolve
    const fuzzy = fuzzyMatchFood(lower, foods);
    if (fuzzy) { matchedPhrase = fuzzy.phrase; confidence = fuzzy.confidence; }
  }
  if (!matchedPhrase) return null;
  const matchedKey = resolveFoodKey(matchedPhrase, foods);
  if (!matchedKey) return null;
  const rawEntry = getFoodEntry(matchedKey, foods);
  if (!rawEntry) return null;
  const food = resolveStatefulFood(rawEntry, lower);
  const stateTag = food.cookState ? ' (' + food.cookState + ')' : '';
  const fuzzyTag = confidence < 1 ? ' (assumed)' : '';

  // Only look for a quantity NEAR the matched food, not anywhere in the whole
  // segment. Without this, a segment containing two foods and two numbers
  // (e.g. delimiter-splitting missed a connector word) can pair the wrong
  // number with the wrong food — exactly what happened with "250g ribeye
  // steak cooked in 5g butter" logging as 250g of butter.
  const approxIdx = lower.indexOf(matchedPhrase.split(' ')[0]);
  const winStart = approxIdx < 0 ? 0 : Math.max(0, approxIdx - 25);
  const winEnd = approxIdx < 0 ? lower.length : Math.min(lower.length, approxIdx + matchedPhrase.length + 15);
  const win = lower.slice(winStart, winEnd);

  // An explicit weight or liquid volume always wins, regardless of the
  // food's default type. mL is treated as equivalent to grams (accurate
  // enough for milk, kefir, juice, shakes — anything close to water density).
  const kgMatch = win.match(/(\d+(?:\.\d+)?)\s*kg\b/);
  const litreMatch = win.match(/(\d+(?:\.\d+)?)\s*(?:l|litres?|liters?)\b/);
  const mlMatch = win.match(/(\d+(?:\.\d+)?)\s*(?:ml|millilit(?:re|er)s?)\b/);
  const gMatch = win.match(/(\d+(?:\.\d+)?)\s*(?:g|grams?)\b/);
  if (kgMatch || litreMatch || mlMatch || gMatch) {
    let amount: number, unit: string;
    if (kgMatch) { amount = parseFloat(kgMatch[1]) * 1000; unit = 'g'; }
    else if (litreMatch) { amount = parseFloat(litreMatch[1]) * 1000; unit = 'ml'; }
    else if (mlMatch) { amount = parseFloat(mlMatch[1]); unit = 'ml'; }
    else { amount = parseFloat(gMatch![1]); unit = 'g'; }
    const per100 = getPer100gMacros(food);
    const factor = amount / 100;
    return { label: Math.round(amount) + unit + ' ' + matchedKey + stateTag + fuzzyTag, matchedFood: matchedKey, amount: Math.round(amount), unit, estimated: false, confidence, cal: Math.round(per100.cal * factor), prot: Math.round(per100.prot * factor * 10) / 10, carb: Math.round(per100.carb * factor * 10) / 10, fat: Math.round(per100.fat * factor * 10) / 10 };
  }

  const numMatch = win.match(/(\d+(?:\.\d+)?)/);
  const numQty = numMatch ? parseFloat(numMatch[1]) : null; // digit-based only — safe to use as a weight
  const qty = numQty !== null ? numQty : wordToQty(win); // digit OR word — safe to use as a count

  if (food.type === 'dish') {
    const count = qty || 1;
    const wasSpecified = numQty !== null || wordToQty(win) !== null;
    const label = (count !== 1 ? count + 'x ' : '') + matchedKey + fuzzyTag;
    return { label, matchedFood: matchedKey, amount: count, unit: 'serving', estimated: !wasSpecified, confidence, cal: Math.round(food.cal * count), prot: Math.round(food.prot * count * 10) / 10, carb: Math.round(food.carb * count * 10) / 10, fat: Math.round(food.fat * count * 10) / 10 };
  }
  if (food.type === 'perUnit') {
    const count = qty || 1;
    const wasSpecified = numQty !== null || wordToQty(win) !== null;
    const plural = count > 1 ? (/(?:[oxsz]|ch|sh)$/.test(food.label || '') ? 'es' : 's') : '';
    return { label: count + ' ' + food.label + plural + fuzzyTag, matchedFood: matchedKey, amount: count, unit: food.label || matchedKey, estimated: !wasSpecified, confidence, cal: Math.round(food.cal * count), prot: Math.round(food.prot * count * 10) / 10, carb: Math.round(food.carb * count * 10) / 10, fat: Math.round(food.fat * count * 10) / 10 };
  }
  // per100g: "a"/"some"/"a few" describe a serving, NOT a gram count — only an
  // actual digit (with no unit attached, e.g. "200 chicken") should be read as grams.
  // Standard culinary conversions used whenever a food doesn't have its own
  // precise override — this is what makes "a tablespoon of X" work for ANY
  // food, including ones taught later, not just the handful with tbspGrams set.
  let grams: number, wasEstimated = false;
  const fraction = wordToFraction(win);
  const defaultGrams = food.defaultGrams || 100;
  if (/\bcups?\b/.test(win)) grams = (qty || 1) * (food.cupGrams || 240);
  else if (/\bslices?\b/.test(win)) grams = (qty || 1) * (food.sliceGrams || 30);
  else if (/\btbsp\b|\btablespoons?\b/.test(win)) grams = (qty || 1) * (food.tbspGrams || 15);
  else if (/\btsp\b|\bteaspoons?\b/.test(win)) grams = (qty || 1) * (food.tspGrams || 5);
  else if (/\bhandfuls?\b/.test(win)) grams = (qty || 1) * 30;
  else if (/\bpieces?\b/.test(win)) grams = (qty || 1) * (defaultGrams / 2 || 60);
  else if (/\bportions?\b|\bservings?\b/.test(win)) grams = (qty || 1) * defaultGrams;
  else if (fraction !== null) { grams = defaultGrams * fraction; wasEstimated = true; }
  else if (numQty) grams = numQty;
  else { grams = defaultGrams; wasEstimated = true; }
  const factor = grams / 100;
  return { label: Math.round(grams) + 'g ' + matchedKey + stateTag + fuzzyTag, matchedFood: matchedKey, amount: Math.round(grams), unit: 'g', estimated: wasEstimated, confidence, cal: Math.round(food.cal * factor), prot: Math.round(food.prot * factor * 10) / 10, carb: Math.round(food.carb * factor * 10) / 10, fat: Math.round(food.fat * factor * 10) / 10 };
}

// Lets someone give their own real per-100g figure from a food label instead
// of relying on the built-in database — e.g. "minced beef that was 147cal
// per 100g and I ate about 400g". Checked on the whole message (not per
// comma-segment) since the calorie clause and the weight clause are usually
// joined by "and" rather than listing separate foods.
export function tryParseCustomPer100g(text: string, foods: VittoFoods) {
  const lower = text.toLowerCase();
  const per100Match = lower.match(/(\d+(?:\.\d+)?)\s*(?:kcal|cal|calories)?\s*(?:per|\/)\s*100\s*(?:g|grams?|ml|millilit(?:re|er)s?)\b/);
  if (!per100Match) return null;
  const statedCal = parseFloat(per100Match[1]);
  const per100Start = per100Match.index!, per100End = per100Start + per100Match[0].length;
  const isMl = /ml|millilit/.test(per100Match[0]);

  // find the actual amount consumed — the first g/ml mention that ISN'T
  // the "100g"/"100ml" inside the per-100 phrase itself
  const amountMatches = [...lower.matchAll(/(\d+(?:\.\d+)?)\s*(?:g|grams?|ml|millilit(?:re|er)s?)\b/g)];
  let weightGrams: number | null = null;
  for (const gm of amountMatches) {
    const gmStart = gm.index!, gmEnd = gmStart + gm[0].length;
    if (gmStart >= per100Start && gmEnd <= per100End) continue;
    weightGrams = parseFloat(gm[1]);
    break;
  }
  if (weightGrams === null) return null;

  let matchedKey: string | null = null;
  for (const phrase of getFoodLookupPhrases(foods)) {
    if (lower.includes(phrase.toLowerCase())) { matchedKey = resolveFoodKey(phrase, foods) || null; break; }
  }

  const factor = weightGrams / 100;
  const totalCal = Math.round(statedCal * factor);
  let prot: number, carb: number, fat: number;
  if (matchedKey) {
    const entry = getFoodEntry(matchedKey, foods)!;
    const per100 = getPer100gMacros(resolveStatefulFood(entry, lower));
    const scale = per100.cal ? statedCal / per100.cal : 1;
    prot = Math.round(per100.prot * scale * factor * 10) / 10;
    carb = Math.round(per100.carb * scale * factor * 10) / 10;
    fat = Math.round(per100.fat * scale * factor * 10) / 10;
  } else {
    prot = Math.round(((totalCal * 0.15) / 4) * 10) / 10;
    carb = Math.round(((totalCal * 0.5) / 4) * 10) / 10;
    fat = Math.round(((totalCal * 0.35) / 9) * 10) / 10;
  }
  const unit = isMl ? 'ml' : 'g';
  return { label: Math.round(weightGrams) + unit + ' ' + (matchedKey || 'food') + ' (at ' + statedCal + ' kcal/100' + unit + ')', cal: totalCal, prot, carb, fat, estimatedMacros: !matchedKey };
}

export function parseFoodText(text: string, foods: VittoFoods) {
  // "chicken n potatoes" -> "chicken and potatoes" — \bn\b only matches a
  // standalone "n", so this never touches words that merely contain an n.
  const normalized = text.replace(/\bn\b/gi, 'and');
  const parts = normalized.split(/,|\band\b|&|\+|\bwith\b|\bon\b|\bin\b/i).map((s) => s.trim()).filter(Boolean);
  const matched: ParsedFoodPart[] = [], unmatched: string[] = [];
  parts.forEach((p) => {
    const r = parseFoodPart(p, foods);
    if (r) matched.push(r); else if (p) unmatched.push(p);
  });
  return { matched, unmatched };
}

// ── Small talk / commands ───────────────────────────────────────────────

// A modest set of common nickname pairings so Vitto can sound natural rather
// than always using someone's full first name — e.g. Francesco -> Fran.
// Falls back to the plain first name for anyone not in this list.
const COMMON_NICKNAMES: Record<string, string> = {
  francesco: 'Fran', christopher: 'Chris', michael: 'Mike', alexander: 'Alex', robert: 'Rob',
  william: 'Will', elizabeth: 'Liz', katherine: 'Kate', daniel: 'Dan', nicholas: 'Nick',
  benjamin: 'Ben', jonathan: 'Jon', matthew: 'Matt', andrew: 'Andy', anthony: 'Tony',
  joseph: 'Joe', thomas: 'Tom', richard: 'Rich', samuel: 'Sam', nathaniel: 'Nate',
  jennifer: 'Jen', jessica: 'Jess', rebecca: 'Becca', stephanie: 'Steph', patricia: 'Pat',
  gabriella: 'Gabby', isabella: 'Bella', alexandra: 'Alex', victoria: 'Vicky',
  giuseppe: 'Beppe', giovanni: 'Gianni', salvatore: 'Salvo', antonio: 'Toni',
  emmanuel: 'Manny', theodore: 'Theo', sebastian: 'Seb', oliver: 'Ollie', charlotte: 'Charlie',
};

function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? { text: 'Good morning', icon: '☀️' } : h < 17 ? { text: 'Good afternoon', icon: '🌤️' } : { text: 'Good evening', icon: '🌙' };
}

function getDisplayName(firstName: string | null): string | null {
  if (!firstName) return null;
  const first = firstName.trim().split(/\s+/)[0];
  const nickname = COMMON_NICKNAMES[first.toLowerCase()];
  // vary between nickname and full first name so it doesn't sound scripted
  return nickname && Math.random() < 0.5 ? nickname : first;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Checked BEFORE food parsing so "hey good morning" is never mistaken for a
// mystery meal — the old flow assumed anything unmatched must be food.
function trySmallTalk(lower: string, clientFirstName: string | null): string | null {
  const g = getGreeting();
  const dn = getDisplayName(clientFirstName);
  const name = dn ? ', ' + dn : '';

  if (/^(hi|hello|hey|hiya|yo|sup|howdy|morning|evening|afternoon)\b/.test(lower) || /\b(good morning|good afternoon|good evening|good night)\b/.test(lower)) {
    return pick([
      g.icon + ' ' + g.text + name + '! How can I help — logging something, or just checking in?',
      'Hey' + name + '! ' + g.text.toLowerCase() + ' to you too. What can I do for you?',
      'Hiya' + name + '! Ready when you are — tell me what you ate or ask me anything.',
    ]);
  }
  if (/\b(thanks|thank you|thx|ty|cheers|appreciate it)\b/.test(lower)) {
    return pick(["You're welcome! 🙌", 'Anytime!', "Of course — that's what I'm here for.", 'No problem at all!']);
  }
  if (/how('s| is| are)?\s*(you|it going|things|your day)/.test(lower)) {
    return "I'm doing great, thanks for asking! More importantly, how's your day going? Anything to log?";
  }
  if (/^(bye|goodbye|see ya|see you|later|cya|night night|gn)\b/.test(lower)) {
    return pick(['See you later! Keep it up 💪', "Bye for now — I'll be here when you need me.", 'Catch you later!']);
  }
  if (/\b(love (you|this|vitto)|you'?re (the best|great|awesome|amazing)|good (bot|job)|well done)\b/.test(lower)) {
    return "Aw, thank you! 🥹 Now let's keep that streak going.";
  }
  if (/^(ok|okay|k|kk|cool|nice|great|awesome|sweet|good|alright|sure|yep|yeah|no worries|fine)\.?!?$/.test(lower.trim())) {
    return '👍 Let me know whenever you want to log something or check your numbers.';
  }
  if (/^(who are you|what are you|what is vitto|what's vitto)\b/.test(lower)) {
    return "I'm Vitto, your Vitality food-logging assistant! Tell me what you ate and I'll estimate the macros and log it — I can also answer questions about your targets, streak, and today's progress.";
  }
  return null;
}

function getMacroTotals(meals: MealEntry[]) {
  return meals.reduce((a, m) => ({ cal: a.cal + m.cal, prot: a.prot + m.prot, carb: a.carb + m.carb, fat: a.fat + m.fat }), { cal: 0, prot: 0, carb: 0, fat: 0 });
}

function undoLastMeal(todayMeals: MealEntry[]): VittoResult {
  if (todayMeals.length === 0) return { reply: "There's nothing logged today to undo.", actions: [] };
  const removed = todayMeals[todayMeals.length - 1];
  return { reply: 'Removed "' + removed.name + '" (' + removed.cal + ' kcal) from today\'s log.', actions: [{ kind: 'remove_meal', id: removed.id }] };
}

// Finds a logged meal by name (not just "the last one") — searches most
// recent first, since that's usually what someone means by "remove the eggs"
// when there might be an earlier, unrelated match.
function removeMealByName(todayMeals: MealEntry[], query: string): VittoResult {
  const q = query.trim().toLowerCase();
  if (!q) return { reply: "I'm not sure what to remove — try naming the food.", actions: [] };
  if (todayMeals.length === 0) return { reply: "There's nothing logged today to remove.", actions: [] };
  for (let i = todayMeals.length - 1; i >= 0; i--) {
    if (todayMeals[i].name.toLowerCase().includes(q)) {
      const removed = todayMeals[i];
      return { reply: 'Removed "' + removed.name + '" (' + removed.cal + ' kcal) from today\'s log.', actions: [{ kind: 'remove_meal', id: removed.id }] };
    }
  }
  const loggedNames = todayMeals.map((m) => m.name).join(', ');
  return { reply: "I couldn't find anything logged today matching \"" + query + '".' + (loggedNames ? ' Today so far: ' + loggedNames + '.' : ''), actions: [] };
}

function clearTodayLog(todayMeals: MealEntry[]): VittoResult {
  if (todayMeals.length === 0) return { reply: "There's nothing logged today to clear.", actions: [] };
  return { reply: 'Cleared all ' + todayMeals.length + ' meal' + (todayMeals.length > 1 ? 's' : '') + " from today's log.", actions: [{ kind: 'clear_meals' }] };
}

// Handles "log my lunch", "log breakfast", etc. — looks at the meal-slot tag
// set on each saved template rather than trying to guess which specific
// meal "lunch" means.
function logMealtimeSlot(slot: string, mealTemplates: MealTemplate[]): VittoResult {
  const matches = mealTemplates.filter((t) => t.mealtime === slot);
  if (matches.length === 0) {
    return { reply: "You don't have a " + slot + ' saved yet — add one in "Your everyday meals" on the Nutrition tab and tag it as ' + slot + ', or just tell me what you had.', actions: [] };
  }
  if (matches.length === 1) {
    const t = matches[0];
    return { reply: 'Logged your ' + slot + ': ' + t.name + ' (' + t.cal + ' kcal, ' + t.prot + 'g P, ' + t.carb + 'g C, ' + t.fat + 'g F). Added to today\'s log ✅', actions: [{ kind: 'add_meal', entry: { name: t.name, cal: t.cal, prot: t.prot, carb: t.carb, fat: t.fat } }] };
  }
  const options = matches.map((t) => t.name + ' (' + t.cal + ' kcal)').join(', ');
  return { reply: "You've got a few saved for " + slot + ' — which one? ' + options + '. Just type the name.', actions: [{ kind: 'set_pending', pending: { type: 'mealtime_options', templateIds: matches.map((t) => t.id) } }] };
}

function tryAnswerQuestion(lower: string, ctx: VittoContext): VittoResult | null {
  const t = getMacroTotals(ctx.todayMeals);
  const tg = ctx.targets;
  if (/undo|remove last|delete last|oops|scratch that/.test(lower)) return undoLastMeal(ctx.todayMeals);
  if (/^new day\b|start (a )?new day|^reset (today|day)\b/.test(lower)) return clearTodayLog(ctx.todayMeals);
  if (/clear (everything|all|my log|today('s)? log)|remove all|delete everything/.test(lower)) return clearTodayLog(ctx.todayMeals);
  const removeMatch = lower.match(/^(?:remove|delete)\s+(?:the\s+|my\s+)?(.+)/);
  if (removeMatch) return removeMealByName(ctx.todayMeals, removeMatch[1]);
  const mealtimeMatch = lower.match(/\b(?:log|add|had|have|eating|eat)?\s*(?:my\s+)?(breakfast|lunch|dinner|snack)\b/);
  if ((mealtimeMatch && /\b(log|add)\b/.test(lower)) || /^(breakfast|lunch|dinner|snack)$/.test(lower.trim())) {
    const slot = (mealtimeMatch && mealtimeMatch[1]) || lower.trim();
    return logMealtimeSlot(slot, ctx.mealTemplates);
  }
  if (/\b(what are my|show( me)?|see) (my )?(today'?s? )?(totals?|numbers)\b/.test(lower) || /\btotals?\s*(today|so far)?\??$/.test(lower.trim())) {
    return { reply: 'Today so far: ' + Math.round(t.cal) + ' kcal, ' + Math.round(t.prot) + 'g protein, ' + Math.round(t.carb) + 'g carbs, ' + Math.round(t.fat) + 'g fat.', actions: [] };
  }
  if (/\b(show|what'?s|list)\s*(my |today'?s? )?meals\b/.test(lower)) {
    if (ctx.todayMeals.length === 0) return { reply: 'Nothing logged yet today.', actions: [] };
    return { reply: "Today's meals: " + ctx.todayMeals.map((m) => m.name + ' (' + m.cal + ' kcal)').join(', ') + '.', actions: [] };
  }
  if (/calor(ie|y)/.test(lower) && /(left|remaining|how many|how much)/.test(lower)) {
    return { reply: "You've logged " + Math.round(t.cal) + ' kcal so far today, target is ' + tg.cal + ' — that leaves you ' + Math.max(0, Math.round(tg.cal - t.cal)) + ' kcal.', actions: [] };
  }
  if (/protein/.test(lower) && /(left|remaining|how much|target|how many)/.test(lower)) {
    return { reply: "You're at " + Math.round(t.prot) + 'g protein out of your ' + tg.prot + 'g target — ' + Math.max(0, Math.round(tg.prot - t.prot)) + 'g to go.', actions: [] };
  }
  if (/carb/.test(lower) && /(left|remaining|how much|target|how many)/.test(lower)) {
    return { reply: "You're at " + Math.round(t.carb) + 'g carbs out of your ' + tg.carb + 'g target — ' + Math.max(0, Math.round(tg.carb - t.carb)) + 'g to go.', actions: [] };
  }
  if (/fat/.test(lower) && /(left|remaining|how much|target|how many)/.test(lower)) {
    return { reply: "You're at " + Math.round(t.fat) + 'g fat out of your ' + tg.fat + 'g target — ' + Math.max(0, Math.round(tg.fat - t.fat)) + 'g to go.', actions: [] };
  }
  if (/streak/.test(lower)) {
    return { reply: ctx.streakDays > 0 ? "You're on a " + ctx.streakDays + '-day streak — keep it going! 🔥' : 'No active streak yet — log a meal and tick a habit today to start one.', actions: [] };
  }
  if (/how.*(doing|going)|today.*summary|summar(y|ise)/.test(lower)) {
    return { reply: 'Today so far: ' + Math.round(t.cal) + '/' + tg.cal + ' kcal, ' + Math.round(t.prot) + '/' + tg.prot + 'g protein, ' + Math.round(t.carb) + '/' + tg.carb + 'g carbs, ' + Math.round(t.fat) + '/' + tg.fat + 'g fat.', actions: [] };
  }
  if (/what.*(can|do) you (know|log|eat)|what foods/.test(lower)) {
    const sample = Object.keys(ctx.foods.db).slice(0, 12).join(', ');
    return { reply: 'I know quite a lot now! Things like ' + sample + " and more — just type what you had, in grams or ml if you've got it. If I don't recognise something, I'll ask roughly how many calories it was and log it anyway.", actions: [] };
  }
  return null;
}

// Handles "no I had raw" / "actually it was cooked" corrections that ONLY
// change whether the last entry was raw or cooked — same food, same amount,
// just the wrong state. Must be checked BEFORE general food parsing: "raw"
// on its own is not a food and should never be sent through the food matcher.
function tryCorrectCookState(text: string, ctx: VittoContext): VittoResult | null {
  const lower = text.toLowerCase().trim();
  const stateMatch = lower.match(/^(?:no,?\s*)?(?:actually,?\s*)?(?:i (?:had|meant|ate)|it was|i mean)?\s*(raw|uncooked|cooked|grilled|roasted|baked|fried|boiled|steamed)\.?!?$/);
  if (!stateMatch) return null;
  const newState: 'raw' | 'cooked' = /raw|uncooked/.test(stateMatch[1]) ? 'raw' : 'cooked';
  const arr = ctx.todayMeals;
  if (arr.length === 0) return null;
  const last = arr[arr.length - 1];
  if (!last.matchedFood) return null;
  const food = getFoodEntry(last.matchedFood, ctx.foods);
  if (!food || !('raw' in food && 'cooked' in food)) return null; // this food has no raw/cooked distinction to correct
  const grams = last.amount || 100;
  const per100 = newState === 'raw' ? food.raw : food.cooked;
  const factor = grams / 100;
  const updated: NewMealEntry = {
    name: grams + 'g ' + last.matchedFood + ' (' + newState + ')',
    cal: Math.round(per100.cal * factor),
    prot: Math.round(per100.prot * factor * 10) / 10,
    carb: Math.round(per100.carb * factor * 10) / 10,
    fat: Math.round(per100.fat * factor * 10) / 10,
    matchedFood: last.matchedFood,
    amount: last.amount,
    unit: last.unit,
  };
  return { reply: 'Got it — updated to ' + newState + ': ' + updated.name + ' (' + updated.cal + ' kcal, ' + updated.prot + 'g P, ' + updated.carb + 'g C, ' + updated.fat + 'g F).', actions: [{ kind: 'remove_meal', id: last.id }, { kind: 'add_meal', entry: updated }] };
}

function tryEditLastEntry(text: string, ctx: VittoContext): VittoResult | null {
  const lower = text.toLowerCase().trim();
  const triggerMatch = lower.match(/^(actually,?\s*(it was|i meant|i had)?|wait,?\s*(it was|i meant)?|correction,?|sorry,?\s*i meant|i meant to say)\s*/);
  if (!triggerMatch) return null;
  const stripped = text.slice(triggerMatch[0].length).trim();
  if (!stripped) return null;
  const { matched } = parseFoodText(stripped, ctx.foods);
  if (matched.length === 0) return null;
  const arr = ctx.todayMeals;
  if (arr.length === 0) return null;
  const old = arr[arr.length - 1];
  const actions: VittoAction[] = [{ kind: 'remove_meal', id: old.id }];
  matched.forEach((m) => {
    actions.push({ kind: 'add_meal', entry: { name: m.label, cal: m.cal, prot: m.prot, carb: m.carb, fat: m.fat, originalText: text, matchedFood: m.matchedFood, amount: m.amount, unit: m.unit, estimated: m.estimated, confidence: m.confidence } });
  });
  const newTotal = matched.reduce((a, m) => a + m.cal, 0);
  return { reply: 'Got it — corrected "' + old.name + '" to ' + matched.map((m) => m.label).join(' and ') + ' (' + Math.round(newTotal) + ' kcal). Updated in today\'s log ✅', actions };
}

function tryParseCalorieReply(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(kcal|cal|calories)?/i);
  if (!m) return null;
  // require it to actually look like a calorie answer, not a stray number in a sentence
  if (!/^[^\d]{0,20}\d/.test(text)) return null;
  return Math.round(parseFloat(m[1]));
}

// ── Main entry point ────────────────────────────────────────────────────

export function processVittoMessage(text: string, ctx: VittoContext): VittoResult {
  const trimmed = text.trim();
  if (!trimmed) return { reply: '', actions: [] };

  // someone gave their own real per-100g figure + a weight — respect that over the built-in DB
  const customEntry = tryParseCustomPer100g(trimmed, ctx.foods);
  if (customEntry) {
    let reply = pick(['Got it — using your numbers:', 'Nice, using the real figures:', 'Perfect, exact numbers logged:', 'Love a precise label — logged:']) + ' ' + customEntry.label + ' = ' + customEntry.cal + ' kcal, ' + customEntry.prot + 'g P, ' + customEntry.carb + 'g C, ' + customEntry.fat + 'g F. Added to today\'s log ✅';
    if (customEntry.estimatedMacros) reply += " (I didn't recognise the food itself, so protein/carbs/fat are a rough estimate — the calories are exact from what you gave me.)";
    return { reply, actions: [{ kind: 'clear_pending' }, { kind: 'add_meal', entry: { name: customEntry.label, cal: customEntry.cal, prot: customEntry.prot, carb: customEntry.carb, fat: customEntry.fat } }] };
  }

  // if we just asked "which one — X or Y?" for a meal slot, check if this answers it
  if (ctx.pending?.type === 'mealtime_options') {
    const norm = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^\w\s]/g, '').trim();
    const normText = norm(trimmed);
    const candidates = ctx.mealTemplates.filter((t) => ctx.pending!.type === 'mealtime_options' && (ctx.pending as { templateIds: string[] }).templateIds.includes(t.id));
    const pick_ = candidates.find((t) => { const nt = norm(t.name); return normText.includes(nt) || nt.includes(normText); });
    if (pick_) {
      return { reply: 'Perfect — logged ' + pick_.name + ' (' + pick_.cal + ' kcal, ' + pick_.prot + 'g P, ' + pick_.carb + 'g C, ' + pick_.fat + 'g F). Added to today\'s log ✅', actions: [{ kind: 'clear_pending' }, { kind: 'add_meal', entry: { name: pick_.name, cal: pick_.cal, prot: pick_.prot, carb: pick_.carb, fat: pick_.fat } }] };
    }
    // they moved on to something else — pending gets cleared below by falling through with clear_pending prepended once we know the final actions
  }

  // if we just asked "roughly how many calories was that?", check if this message answers it
  if (ctx.pending?.type === 'unknown_food') {
    const cal = tryParseCalorieReply(trimmed);
    if (cal !== null) {
      const prot = Math.round((cal * 0.15) / 4), carb = Math.round((cal * 0.5) / 4), fat = Math.round((cal * 0.35) / 9);
      const pendingText = ctx.pending.text;
      const reply = pick(['Got it —', 'Perfect, noted —', 'All set —', 'Nice, that works —']) + ' logged "' + pendingText + '" as ~' + cal + ' kcal (estimated split: ' + prot + 'g P, ' + carb + 'g C, ' + fat + 'g F). Added to today\'s log ✅';
      return { reply, actions: [{ kind: 'clear_pending' }, { kind: 'add_meal', entry: { name: pendingText, cal, prot, carb, fat } }] };
    }
    // they moved on to something else — drop it, continue processing this message normally
  }

  const clearStalePending: VittoAction[] = ctx.pending ? [{ kind: 'clear_pending' }] : [];

  const cookStateReply = tryCorrectCookState(trimmed, ctx);
  if (cookStateReply) return { reply: cookStateReply.reply, actions: [...clearStalePending, ...cookStateReply.actions] };

  const editReply = tryEditLastEntry(trimmed, ctx);
  if (editReply) return { reply: editReply.reply, actions: [...clearStalePending, ...editReply.actions] };

  // Commands (undo/remove/clear/totals/etc.) always take priority — but
  // greetings/thanks/chat must NOT: a message can be both a greeting and a
  // food log ("hey I had 3 eggs"), and the food must still get logged.
  // Strip a leading greeting before checking commands — several command
  // patterns are anchored to the start of the message ("^remove ..."), so
  // "hey remove the eggs" would otherwise fail the same way food did.
  const greetingStrippedLower = trimmed.toLowerCase().replace(/^(hi|hello|hey|hiya|yo|sup|howdy|good morning|good afternoon|good evening|good night|morning|evening|afternoon)[,!.]?\s*/, '').trim();
  const commandResult = tryAnswerQuestion(greetingStrippedLower || trimmed.toLowerCase(), ctx);
  if (commandResult) return { reply: commandResult.reply, actions: [...clearStalePending, ...commandResult.actions] };

  const { matched, unmatched } = parseFoodText(trimmed, ctx.foods);
  if (matched.length === 0) {
    // No food found — NOW it's safe to treat this as pure conversation.
    const smallTalkReply = trySmallTalk(trimmed.toLowerCase(), ctx.clientFirstName);
    if (smallTalkReply) return { reply: smallTalkReply, actions: clearStalePending };
    // Don't assume everything unrecognised is food — only chase a calorie
    // estimate if this actually looks like a food/drink mention.
    const looksFoodLike = /\d/.test(trimmed) || /\b(ate|eat|eating|had|have|drank|drink|breakfast|lunch|dinner|snack|meal|food|calorie|protein|carbs?|fat|grams?|ml|kcal)\b/i.test(trimmed);
    if (looksFoodLike) {
      return { reply: 'I don\'t recognise "' + trimmed + '" yet — no worries though, roughly how many calories was that? Just give me a number (like "450" or "about 500 cal") and I\'ll log it for you.', actions: [{ kind: 'set_pending', pending: { type: 'unknown_food', text: trimmed } }] };
    }
    return { reply: "I'm not quite sure what you mean by that 🤔 You can tell me what you ate or drank, ask how many calories/protein/carbs/fat you have left, say \"undo\" to remove your last entry, or just say hi anytime!", actions: clearStalePending };
  }

  const isFirstLogToday = ctx.todayMeals.length === 0;
  const totals = matched.reduce((a, m) => ({ cal: a.cal + m.cal, prot: a.prot + m.prot, carb: a.carb + m.carb, fat: a.fat + m.fat }), { cal: 0, prot: 0, carb: 0, fat: 0 });
  const roundedProt = Math.round(totals.prot), roundedCarb = Math.round(totals.carb), roundedFat = Math.round(totals.fat);

  // Each food gets its OWN log entry (not merged into one row) — this is
  // what makes "remove the banana" remove only the banana even when it was
  // logged in the same message as eggs, rather than deleting both.
  const addActions: VittoAction[] = matched.map((m) => ({ kind: 'add_meal', entry: { name: m.label, cal: m.cal, prot: m.prot, carb: m.carb, fat: m.fat, originalText: trimmed, matchedFood: m.matchedFood, amount: m.amount, unit: m.unit, estimated: m.estimated, confidence: m.confidence } }));

  let opener: string;
  const openedWithGreeting = /^(hi|hello|hey|hiya|yo|sup|howdy)\b/i.test(trimmed) || /^(good morning|good afternoon|good evening|morning|evening|afternoon)\b/i.test(trimmed);
  if (openedWithGreeting) {
    const fdn = getDisplayName(ctx.clientFirstName); const fname = fdn ? ' ' + fdn : '';
    opener = pick(['Hey' + fname + '! Got it —', 'Hi' + fname + '! Logged that —', 'Hey there! Noted —']);
  } else if (isFirstLogToday) {
    const fdn = getDisplayName(ctx.clientFirstName); const fname = fdn ? ', ' + fdn : '';
    opener = pick(['Okay, great' + fname + '! That\'s a good start to the day 🌅', 'Nice one' + fname + ' — great way to kick off the day!', 'Love it' + fname + ', first log of the day — let\'s keep this going 💪', 'That\'s a solid start to the day' + fname + ', logged:']);
  } else {
    opener = pick(['Got it!', 'Nice one, logged that:', 'Perfect, added:', 'On it!', 'All set —', 'Boom, logged:', 'Nice — added:', "Sweet, that's in:", 'Easy, done:', 'Solid choice —', 'Noted!', "Great, that's in the log:"]);
  }
  const foodList = matched.map((m) => m.label).join(' and ');
  let reply = opener + ' ' + foodList + '. Around ' + Math.round(totals.cal) + ' kcal, ' + roundedProt + 'g protein, ' + roundedCarb + 'g carbs and ' + roundedFat + 'g fat.';
  const estimatedOnes = matched.filter((m) => m.estimated && m.amount && m.unit === 'g');
  if (estimatedOnes.length === 1) {
    reply += ' (I logged "' + estimatedOnes[0].matchedFood + '" as ' + estimatedOnes[0].amount + 'g since no amount was given — let me know the real amount if you have it.)';
  } else if (estimatedOnes.length > 1) {
    reply += ' (No exact amounts given for ' + estimatedOnes.map((m) => m.matchedFood).join(', ') + ', so I used typical serving sizes — correct me if you know the real amounts.)';
  }

  let pendingAction: VittoAction[] = [];
  if (unmatched.length) {
    const pendingText = unmatched.join(', ');
    reply += ' I didn\'t recognise "' + pendingText + '" though — roughly how many calories was that part? Tell me a number and I\'ll add it too.';
    pendingAction = [{ kind: 'set_pending', pending: { type: 'unknown_food', text: pendingText } }];
  }

  return { reply, actions: [...clearStalePending, ...addActions, ...pendingAction] };
}
