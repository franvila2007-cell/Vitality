// Vitto's food-understanding engine (pure functions, no I/O).
//
// A message is normalised, split into per-food segments, each segment is
// matched against the food database with word-boundary + plural-aware
// matching, and the words around the food are read for quantity, size, unit
// and fraction ("2 large slices of", "half a dozen", "8oz", "a bowl of").
//
// Anything the engine is not confident about (unexplained words, compound
// dishes like "tomato soup", unknown foods) is FLAGGED rather than guessed —
// the API route hands flagged parts to the LLM, which understands them and
// grounds known foods back onto the database numbers.
import type { FoodEntry, UnitFields } from './foodDb';
import { UNIT_OVERRIDES, SIZE_OVERRIDES, NATURAL_SCALE_FOODS, CAFE_SIZES, type SizeKey } from './foodDbExtra';

// ── Types ───────────────────────────────────────────────────────────────

export type VittoFoods = {
  /** foods_global rows merged with built-ins and this client's custom_foods */
  db: Record<string, FoodEntry>;
  /** phrase -> canonical db key */
  synonyms: Record<string, string>;
};

export type FlatFood = {
  type: 'per100g' | 'perUnit' | 'dish';
  cal: number; prot: number; carb: number; fat: number;
  defaultGrams?: number; avgGrams?: number; label?: string;
  cookState?: 'raw' | 'cooked';
} & UnitFields;

export type ParsedFoodPart = {
  label: string;
  matchedFood: string;
  amount: number;
  unit: string;
  estimated: boolean;
  confidence: number;
  cal: number; prot: number; carb: number; fat: number;
  /** a short plain-English assumption worth telling the client about */
  note?: string;
};

export type SegmentResult = {
  text: string;
  status: 'ok' | 'flagged' | 'unmatched' | 'empty';
  items: ParsedFoodPart[];
  reasons: string[];
};

export type ParseResult = {
  matched: ParsedFoodPart[];
  unmatched: string[];
  /** true when at least one segment should be re-read by the LLM */
  needsLLM: boolean;
  /** original text of every segment the LLM should re-read */
  llmTexts: string[];
  /** items from segments the local parser is fully confident about */
  confident: ParsedFoodPart[];
  segments: SegmentResult[];
};

// ── Text normalisation ──────────────────────────────────────────────────

function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/ħ/g, 'h').replace(/Ħ/g, 'h');
}

const isAlnum = (c: string) => /[\p{L}\p{N}]/u.test(c);

export function normalizeText(text: string): string {
  let t = fold(text.toLowerCase());
  t = t.replace(/[’‘`´]/g, "'");
  t = t.replace(/½/g, ' 1/2 ').replace(/¼/g, ' 1/4 ').replace(/¾/g, ' 3/4 ').replace(/⅓/g, ' 1/3 ').replace(/⅔/g, ' 2/3 ');
  t = t.replace(/\bw\/\s*/g, 'with ');
  t = t.replace(/\bn\b/g, 'and');
  // "one and a half" / "2 and a half" would be split in two by the "and" splitter — fold into one number first
  const NW: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  t = t.replace(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+and\s+(?:a\s+)?half\b/g, (_m, n: string) => String((NW[n] ?? parseInt(n, 10)) + 0.5));
  // "2 x 150g" -> "300g"
  t = t.replace(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(g|kg|ml|l|oz|lb)\b/g, (_m, a, b, u) => `${Math.round(parseFloat(a) * parseFloat(b) * 100) / 100}${u}`);
  // "2x chicken" / "x2 chicken" -> "2 chicken"
  t = t.replace(/(\d)\s*[x×]\s+(?=[a-z])/g, '$1 ').replace(/\b[x×](\d+)\b/g, '$1');
  // "a slice of (any flavour) pizza" -> "a pizza slice" so it hits the per-slice entry, not the whole pizza
  t = t.replace(/\b(?:slices?|pieces?|wedges?)\s+of\s+(?:(?!and\b|with\b|then\b|on\b)[a-z]+\s+){0,3}?pizza\b/g, ' pizza slice ');
  // British "chips" are fries unless it's clearly a packet of crisps
  t = t.replace(/\b(bag|packet|pack|share bag|snack)\s+(?:of\s+)?chips\b/g, '$1 of crisps');
  t = t.replace(/\b(salt and vinegar|cheese and onion|ready salted|prawn cocktail)\s+chips\b/g, '$1 crisps');
  return t.replace(/\s+/g, ' ').trim();
}

// ── Vocabulary ──────────────────────────────────────────────────────────

const NUM_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
};
const NUM_WORD_RE = Object.keys(NUM_WORDS).join('|');

type Unit = 'slice' | 'piece' | 'handful' | 'bowl' | 'plate' | 'cup' | 'glass' | 'mug' | 'can' | 'bottle' | 'pint' | 'shot'
  | 'scoop' | 'serving' | 'bar' | 'pack' | 'tub' | 'tbsp' | 'tsp' | 'splash' | 'drizzle' | 'dash' | 'pinch' | 'knob' | 'dollop' | 'square';

const UNIT_WORDS: Record<string, Unit> = {
  slice: 'slice', slices: 'slice', rasher: 'slice', rashers: 'slice', strip: 'slice', strips: 'slice', wedge: 'slice', wedges: 'slice',
  piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece', chunk: 'piece', chunks: 'piece', bite: 'piece', bites: 'piece', stick: 'piece', sticks: 'piece',
  square: 'square', squares: 'square', handful: 'handful', handfuls: 'handful',
  bowl: 'bowl', bowls: 'bowl', bowlful: 'bowl', plate: 'plate', plates: 'plate', plateful: 'plate',
  cup: 'cup', cups: 'cup', glass: 'glass', glasses: 'glass', glassful: 'glass', mug: 'mug', mugs: 'mug',
  can: 'can', cans: 'can', tin: 'can', tins: 'can', bottle: 'bottle', bottles: 'bottle', pint: 'pint', pints: 'pint',
  shot: 'shot', shots: 'shot', scoop: 'scoop', scoops: 'scoop', scoopful: 'scoop',
  serving: 'serving', servings: 'serving', portion: 'serving', portions: 'serving', helping: 'serving', helpings: 'serving',
  bar: 'bar', bars: 'bar', packet: 'pack', packets: 'pack', pack: 'pack', packs: 'pack', bag: 'pack', bags: 'pack', pouch: 'pack',
  tub: 'tub', tubs: 'tub', pot: 'tub', pots: 'tub',
  tbsp: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', spoon: 'tbsp', spoons: 'tbsp', spoonful: 'tbsp', spoonfuls: 'tbsp',
  tsp: 'tsp', tsps: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  splash: 'splash', drizzle: 'drizzle', dash: 'dash', pinch: 'pinch', knob: 'knob', dollop: 'dollop', glug: 'splash',
};

const UNIT_LABEL: Record<Unit, [string, string]> = {
  slice: ['slice', 'slices'], piece: ['piece', 'pieces'], handful: ['handful', 'handfuls'], bowl: ['bowl', 'bowls'], plate: ['plate', 'plates'],
  cup: ['cup', 'cups'], glass: ['glass', 'glasses'], mug: ['mug', 'mugs'], can: ['can', 'cans'], bottle: ['bottle', 'bottles'], pint: ['pint', 'pints'],
  shot: ['shot', 'shots'], scoop: ['scoop', 'scoops'], serving: ['serving', 'servings'], bar: ['bar', 'bars'], pack: ['pack', 'packs'], tub: ['tub', 'tubs'],
  tbsp: ['tbsp', 'tbsp'], tsp: ['tsp', 'tsp'], splash: ['splash', 'splashes'], drizzle: ['drizzle', 'drizzles'], dash: ['dash', 'dashes'],
  pinch: ['pinch', 'pinches'], knob: ['knob', 'knobs'], dollop: ['dollop', 'dollops'], square: ['square', 'squares'],
};

// Units whose size can be scaled ("a large bowl", "a big handful") vs fixed measures.
const SIZE_APPLIES: Set<Unit> = new Set(['slice', 'piece', 'handful', 'bowl', 'plate', 'cup', 'glass', 'mug', 'scoop', 'serving', 'bar', 'pack', 'tub']);
// Units where we're assuming a weight the client didn't give.
const ESTIMATED_UNITS: Set<Unit> = new Set(['bowl', 'plate', 'handful', 'piece', 'splash', 'drizzle', 'dash', 'pinch', 'knob', 'dollop', 'scoop', 'square']);

type Size = SizeKey;
const SIZE_PATTERNS: [RegExp, Size][] = [
  [/\bextra[- ]?extra[- ]?large\b|\bxxl\b/, 'xxl'],
  [/\bextra[- ]?large\b|\bx[- ]?large\b|\bxl\b|\bking[- ]?size[d]?\b|\bfamily[- ]?size[d]?\b/, 'xl'],
  [/\bextra[- ]?small\b|\bx[- ]?small\b|\bxs\b|\btiny\b|\bteeny\b|\bwee\b/, 'tiny'],
  [/\bmini\b|\bminiature\b|\bbaby\b/, 'mini'],
  [/\bpersonal\b|\bindividual\b/, 'personal'],
  [/\bsnack[- ]?size[d]?\b|\bfun[- ]?size[d]?\b|\bbite[- ]?size[d]?\b/, 'snack'],
  [/\bsmall\b|\bsmal\b|\bsmll\b|\bsml\b|\bsmaller\b|\bpetite\b|\bsm\b/, 'small'],
  [/\bmedium\b|\bmed\b|\bregular\b|\bnormal\b|\bstandard\b|\baverage\b|\bmid[- ]?size[d]?\b/, 'medium'],
  [/\bhuge\b|\bgiant\b|\bjumbo\b|\bmassive\b|\benormous\b|\bgigantic\b/, 'huge'],
  [/\blarge\b|\blarg\b|\blrg\b|\blge\b|\blage\b|\bbig\b|\bbigger\b|\blarger\b/, 'large'],
  [/\bheaped\b|\bheaping\b|\bgenerous\b|\bhearty\b/, 'heaped'],
];

const PORTION_SCALE: Record<Size, number> = { tiny: 0.4, mini: 0.4, personal: 0.7, snack: 0.6, small: 0.7, medium: 1, large: 1.4, xl: 1.8, huge: 2, xxl: 2.2, heaped: 1.3 };
const NATURAL_SCALE: Record<Size, number> = { tiny: 0.5, mini: 0.5, personal: 0.8, snack: 0.7, small: 0.8, medium: 1, large: 1.25, xl: 1.5, huge: 1.7, xxl: 1.9, heaped: 1.2 };

// Words that carry no food information. Anything NOT in here and NOT a known
// food/quantity/size/unit marks a segment as "has something I don't understand".
const IGNORE = new Set(`i me my mine we our you your it its it's is are was were be been being am a an the of for to at on in out up down off over
with without and or but so then than that this these those there here some any each every just also still only even about around roughly approx
approximately like really very quite pretty bit little more less most much many lot lots plenty extra another other one ones had have has having ate
eat eating eaten drank drink drinking drunk got get getting grabbed grab made make making finished consumed snacked snacking cooked cook cooking
today yesterday tonight morning afternoon evening night noon lunch dinner breakfast brunch supper snack meal meals food dessert starter main side
time earlier later before after during while when since ago please thanks thank ok okay yeah yes no nope hi hello hey hiya vitto log add logged adding
put plus raw uncooked grilled roasted roast baked fried boiled steamed bbq barbecued barbecue seared poached toasted toasty fresh organic homemade
plain natural whole lean boneless skinless free low light lite diet sugar-free sugarfree unsweetened sweetened salted unsalted hot cold warm iced
chilled frozen thawed leftover leftovers tasty delicious yummy nice good great lovely amazing healthy clean small medium large big huge giant tiny
mini regular normal standard average heaped heaping generous hearty double triple single piece pieces slice slices ml g kg l oz lb`.split(/\s+/));

const COOK_RE = /\b(cooked|grilled|roasted|baked|fried|pan[- ]?fried|boiled|steamed|bbq|barbecu?ed?|seared|poached)\b/;

// ── Food index ──────────────────────────────────────────────────────────

type PhraseEntry = { variant: string; phrase: string; key: string; words: number };
const INDEX_CACHE = new WeakMap<VittoFoods, PhraseEntry[]>();
const VARIANT_BLACKLIST = new Set(['chip', 'chic', 'pea', 'oat', 'date']);

function variantsOf(phrase: string): string[] {
  const p = fold(phrase.toLowerCase());
  const out = new Set<string>([p]);
  const words = p.split(' ');
  const last = words[words.length - 1];
  const head = words.slice(0, -1).join(' ');
  const add = (w: string) => out.add(head ? head + ' ' + w : w);
  if (last.length > 3) {
    if (/ies$/.test(last)) add(last.slice(0, -3) + 'y');
    else if (/(oes|ches|shes|sses|xes)$/.test(last)) add(last.slice(0, -2));
    else if (/[^us]s$/.test(last)) add(last.slice(0, -1));
  }
  if (/[^aeiou]y$/.test(last)) add(last.slice(0, -1) + 'ies');
  else if (/o$/.test(last)) { add(last + 's'); add(last + 'es'); }
  else if (/(ch|sh|s|x|z)$/.test(last)) add(last + 'es');
  else add(last + 's');
  return [...out].filter((v) => !VARIANT_BLACKLIST.has(v));
}

export function getIndex(foods: VittoFoods): PhraseEntry[] {
  const cached = INDEX_CACHE.get(foods);
  if (cached) return cached;
  const entries: PhraseEntry[] = [];
  const seen = new Map<string, number>();
  const push = (phrase: string, key: string) => {
    for (const v of variantsOf(phrase)) {
      if (seen.has(v)) continue;
      seen.set(v, 1);
      entries.push({ variant: v, phrase, key, words: v.split(' ').length });
    }
  };
  for (const key of Object.keys(foods.db)) push(key, key);
  for (const [phrase, canonical] of Object.entries(foods.synonyms)) if (foods.db[canonical]) push(phrase, canonical);
  entries.sort((a, b) => b.words - a.words || b.variant.length - a.variant.length);
  INDEX_CACHE.set(foods, entries);
  return entries;
}

type Span = { start: number; end: number; key: string; phrase: string; fuzzy?: number };

function findSpans(lower: string, index: PhraseEntry[]): Span[] {
  const taken: Span[] = [];
  for (const e of index) {
    let from = 0;
    for (;;) {
      const i = lower.indexOf(e.variant, from);
      if (i < 0) break;
      const end = i + e.variant.length;
      const before = i === 0 ? ' ' : lower[i - 1];
      const after = end >= lower.length ? ' ' : lower[end];
      if (!isAlnum(before) && !isAlnum(after) && !taken.some((t) => i < t.end && end > t.start)) {
        taken.push({ start: i, end, key: e.key, phrase: e.phrase });
      }
      from = i + 1;
    }
  }
  return taken.sort((a, b) => a.start - b.start);
}

// ── Fuzzy matching (typos) ──────────────────────────────────────────────

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

// Ordinary sentence words are often within a couple of edits of some short
// food name by coincidence ("had"~"ham", "raw"~"prawn"), so common words and
// anything under 5 letters never go through fuzzy matching.
const FUZZY_STOPWORDS = new Set([
  'the', 'and', 'had', 'has', 'have', 'was', 'were', 'ate', 'eat', 'eating', 'add', 'added', 'raw', 'not', 'for', 'some', 'with', 'this', 'that',
  'then', 'than', 'just', 'also', 'about', 'around', 'only', 'left', 'more', 'less', 'most', 'half', 'none', 'much', 'many', 'very', 'still', 'yes',
  'did', 'does', 'you', 'your', 'again', 'today', 'now', 'later', 'before', 'after', 'same', 'last', 'next', 'new', 'old', 'day', 'one', 'two', 'all',
  'any', 'out', 'into', 'from', 'over', 'under', 'cooked', 'grilled', 'roasted', 'baked', 'fried', 'boiled', 'steamed', 'uncooked', 'minced',
  'small', 'smaller', 'large', 'larger', 'medium', 'handful', 'slices', 'pieces', 'bowl', 'plate', 'glass', 'scoop', 'serving', 'portion',
  'little', 'double', 'triple', 'couple', 'dozen', 'three', 'four', 'five', 'eight', 'twelve', 'quarter', 'third', 'packet', 'bottle', 'spoon',
  'spoonful', 'tablespoon', 'teaspoon', 'cups', 'lunch', 'dinner', 'breakfast', 'snack', 'morning', 'evening', 'night', 'drink', 'drank', 'meal',
]);

function fuzzyFind(lower: string, index: PhraseEntry[]): { span: Span; confidence: number } | null {
  const tokensRe = /[a-z0-9']+/g;
  const toks: { w: string; s: number; e: number }[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = tokensRe.exec(lower))) toks.push({ w: mm[0], s: mm.index, e: mm.index + mm[0].length });
  let best: { span: Span; confidence: number; dist: number } | null = null;
  const cands = toks.filter((t) => t.w.length >= 5 && !FUZZY_STOPWORDS.has(t.w) && !/\d/.test(t.w) && !UNIT_WORDS[t.w] && !IGNORE.has(t.w));
  if (cands.length === 0) return null;
  const single = index.filter((e) => e.words === 1 && e.variant.length >= 5);
  for (const c of cands) {
    for (const e of single) {
      if (Math.abs(c.w.length - e.variant.length) > 3) continue;
      const dist = levenshtein(c.w, e.variant);
      const budget = e.variant.length <= 6 ? 1 : e.variant.length <= 9 ? 2 : 3;
      if (dist <= budget && (!best || dist < best.dist)) {
        best = { span: { start: c.s, end: c.e, key: e.key, phrase: e.phrase, fuzzy: Math.max(0.5, 1 - dist / e.variant.length) }, confidence: Math.max(0.5, 1 - dist / e.variant.length), dist };
      }
    }
  }
  return best ? { span: best.span, confidence: best.confidence } : null;
}

// ── Modifier parsing (quantity / size / unit around a food) ─────────────

type Modifiers = {
  grams?: number; gramsKind?: 'g' | 'ml';
  count?: number; digitCount?: boolean; fraction?: number; few?: boolean; weak?: boolean; approx?: number;
  unit?: Unit; size?: Size; cafe?: number;
  leftover: string[];
};

const MEASURE_RE = /(?<![a-z0-9.])(\d+(?:\.\d+)?)\s*(kilograms?|kilos?|kgs?|kg|grams?|grammes?|gr|g|fl\.?\s?oz|ounces?|oz|pounds?|lbs?|lb|millilit(?:re|er)s?|mls?|ml|centilit(?:re|er)s?|cl|decilit(?:re|er)s?|dl|lit(?:re|er)s?|ltrs?|l)(?![a-z])/;

function hasInfo(m: Modifiers): boolean {
  return m.grams !== undefined || m.count !== undefined || m.fraction !== undefined || m.unit !== undefined || m.size !== undefined || m.few === true || m.approx !== undefined || m.cafe !== undefined;
}

export function parseModifiers(raw: string): Modifiers {
  let t = ' ' + fold(raw.toLowerCase()).replace(/[^a-z0-9./\s'-]/g, ' ') + ' ';
  const m: Modifiers = { leftover: [] };

  // "a pound / half a pound / a kilo / a litre" -> numeric forms
  t = t.replace(/\b(?:a|one)\s+(pound|lb|kilo|kilogram|litre|liter)\b/g, ' 1 $1 ');
  t = t.replace(/\bhalf\s+(?:a\s+)?(pound|lb|kilo|kilogram|litre|liter)\b/g, ' 0.5 $1 ');
  t = t.replace(/\b(?:a\s+)?quarter\s+(?:of\s+a\s+|a\s+)?(pound|lb|kilo|kilogram)\b/g, ' 0.25 $1 ');

  // explicit weight / volume
  const mm = t.match(MEASURE_RE);
  if (mm) {
    const v = parseFloat(mm[1]);
    const u = mm[2].replace(/\s+/g, '');
    if (/^kg|^kilo/.test(u)) { m.grams = v * 1000; m.gramsKind = 'g'; }
    else if (/^(g|gr|gram)/.test(u)) { m.grams = v; m.gramsKind = 'g'; }
    else if (/^fl/.test(u)) { m.grams = v * 29.57; m.gramsKind = 'ml'; }
    else if (/^(oz|ounce)/.test(u)) { m.grams = v * 28.35; m.gramsKind = 'g'; }
    else if (/^(lb|pound)/.test(u)) { m.grams = v * 453.6; m.gramsKind = 'g'; }
    else if (/^(ml|millil)/.test(u)) { m.grams = v; m.gramsKind = 'ml'; }
    else if (/^(cl|centil)/.test(u)) { m.grams = v * 10; m.gramsKind = 'ml'; }
    else if (/^(dl|decil)/.test(u)) { m.grams = v * 100; m.gramsKind = 'ml'; }
    else { m.grams = v * 1000; m.gramsKind = 'ml'; }
    t = t.replace(MEASURE_RE, ' ');
  }
  t = t.replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2');

  // approximate-quantity phrases
  const approxRules: [RegExp, number][] = [
    [/\ba\s+(?:little|bit|tiny bit|touch|smidge|small amount)(?:\s+of)?\b/, 0.25],
    [/\b(?:lots of|loads of|a lot of|plenty of|a ton of|tons of)\b/, 1.5],
    [/\bmost(?:\s+of)?\b/, 0.75],
    [/\bsome\b/, 1],
  ];
  for (const [re, v] of approxRules) {
    if (re.test(t)) { m.approx = v; t = t.replace(re, ' '); break; }
  }

  // cafe sizes (short / tall / grande / venti)
  for (const [name, factor] of Object.entries(CAFE_SIZES)) {
    const re = new RegExp(`\\b${name}\\b`);
    if (re.test(t)) { m.cafe = factor; t = t.replace(re, ' '); break; }
  }

  // size words
  for (const [re, size] of SIZE_PATTERNS) {
    if (re.test(t)) { m.size = size; t = t.replace(new RegExp(re.source, 'g'), ' '); break; }
  }

  // numbers: words, fractions, mixed numbers
  const nums: { v: number; frac: boolean; digits: boolean }[] = [];
  const grab = (v: number, frac = false, digits = false) => { nums.push({ v, frac, digits }); return ' '; };
  t = t.replace(/\bhalf\s+an?\s+dozen\b/g, () => grab(6));
  t = t.replace(/\b(?:a\s+)?dozen\b/g, () => grab(12));
  t = t.replace(new RegExp(`\\b(\\d+(?:\\.\\d+)?|${NUM_WORD_RE})\\s+and\\s+(?:a\\s+)?half\\b`, 'g'), (_a, n: string) => grab((NUM_WORDS[n] ?? parseFloat(n)) + 0.5, false, /\d/.test(n)));
  t = t.replace(/\b(\d+)\s+(\d+)\/(\d+)\b/g, (_a, w: string, n: string, dn: string) => grab(parseInt(w, 10) + parseInt(n, 10) / parseInt(dn, 10), false, true));
  t = t.replace(/\b(\d+)\/(\d+)\b/g, (_a, n: string, dn: string) => grab(parseInt(n, 10) / parseInt(dn, 10), true, true));
  t = t.replace(/\bthree[- ]quarters?(?:\s+of)?(?:\s+an?|\s+the)?\b/g, () => grab(0.75, true));
  t = t.replace(/\btwo[- ]thirds?(?:\s+of)?(?:\s+an?|\s+the)?\b/g, () => grab(0.667, true));
  t = t.replace(/\b(?:a\s+)?quarter(?:\s+of)?(?:\s+an?|\s+the)?\b/g, () => grab(0.25, true));
  t = t.replace(/\b(?:a\s+)?third(?:\s+of)?(?:\s+an?|\s+the)?\b/g, () => grab(0.333, true));
  t = t.replace(/\bhalf(?:\s+of)?(?:\s+an?|\s+the)?\b/g, () => grab(0.5, true));
  t = t.replace(/\b(?:a\s+)?(?:couple(?:\s+of)?|pair\s+of)\b/g, () => grab(2));
  t = t.replace(/\bseveral\b/g, () => grab(4));
  t = t.replace(/\b(?:a\s+)?few\b/g, () => { m.few = true; return ' '; });
  t = t.replace(/\bdouble\b/g, () => grab(2));
  t = t.replace(/\btriple\b/g, () => grab(3));
  t = t.replace(new RegExp(`\\b(${NUM_WORD_RE})\\b`, 'g'), (_a, w: string) => grab(NUM_WORDS[w]));
  t = t.replace(/\b\d+(?:\.\d+)?\b/g, (s) => grab(parseFloat(s), false, true));

  const whole = nums.find((n) => !n.frac);
  const frac = nums.find((n) => n.frac);
  if (whole) { m.count = whole.v; m.digitCount = whole.digits; }
  if (frac) m.fraction = frac.v;
  if (m.count === undefined && /\b(a|an)\b/.test(t)) { m.weak = true; }

  // units + leftovers
  const words = t.split(/\s+/).filter(Boolean);
  for (const w of words) {
    if (UNIT_WORDS[w] && !m.unit) { m.unit = UNIT_WORDS[w]; continue; }
    if (UNIT_WORDS[w]) continue;
    const clean = w.replace(/'s$/, '').replace(/^'+|'+$/g, '');
    if (clean.length < 3 || IGNORE.has(clean) || /^\d/.test(clean)) continue;
    m.leftover.push(clean);
  }
  return m;
}

// ── Cook state / flat foods ─────────────────────────────────────────────

function detectCookState(lower: string): 'raw' | 'cooked' | null {
  if (/\b(raw|uncooked)\b/.test(lower)) return 'raw';
  if (COOK_RE.test(lower)) return 'cooked';
  return null;
}

function resolveStatefulFood(food: FoodEntry, key: string, lower: string): FlatFood {
  const extra = UNIT_OVERRIDES[key] || {};
  if ('raw' in food && 'cooked' in food) {
    const state = detectCookState(lower) || 'cooked';
    const v = state === 'raw' ? food.raw : food.cooked;
    return { ...extra, ...(food as UnitFields), type: food.type, cal: v.cal, prot: v.prot, carb: v.carb, fat: v.fat, defaultGrams: food.defaultGrams, cookState: state };
  }
  return { ...extra, ...(food as FlatFood) };
}

const defaultServing = (f: FlatFood) => (f.type === 'per100g' ? f.defaultGrams || 100 : f.avgGrams || 100);

// Normalises any food (per100g / perUnit / dish) to per-100g so an explicit
// weight can scale ANY food: "150g banana", "300g chicken caesar salad".
function getPer100g(f: FlatFood) {
  if (f.type === 'per100g') return { cal: f.cal, prot: f.prot, carb: f.carb, fat: f.fat };
  const g = f.avgGrams || 100;
  return { cal: (f.cal / g) * 100, prot: (f.prot / g) * 100, carb: (f.carb / g) * 100, fat: (f.fat / g) * 100 };
}

function sizeFactor(key: string, size: Size | undefined): number {
  if (!size) return 1;
  const o = SIZE_OVERRIDES[key]?.[size];
  if (o !== undefined) return o;
  if (size === 'medium') return 1;
  return (NATURAL_SCALE_FOODS.has(key) ? NATURAL_SCALE : PORTION_SCALE)[size];
}

function unitGrams(unit: Unit, f: FlatFood): number {
  const dg = defaultServing(f);
  const liquid = !!f.liquid;
  switch (unit) {
    case 'cup': return f.cupGrams ?? 240;
    case 'tbsp': return f.tbspGrams ?? 15;
    case 'tsp': return f.tspGrams ?? 5;
    case 'slice': return f.sliceGrams ?? (dg >= 80 ? dg : 30);
    case 'piece': return f.pieceGrams ?? f.sliceGrams ?? Math.min(80, dg / 2);
    case 'handful': return f.handfulGrams ?? 30;
    case 'serving': return dg;
    case 'bowl': return liquid ? 350 : Math.round(dg * 1.5);
    case 'plate': return Math.round(dg * 2);
    case 'glass': return f.glassGrams ?? (liquid ? 250 : 240);
    case 'mug': return 250;
    case 'can': return f.canGrams ?? (liquid ? 330 : 400);
    case 'bottle': return f.bottleGrams ?? 500;
    case 'pint': return 568;
    case 'shot': return f.shotGrams ?? 30;
    case 'scoop': return f.scoopGrams ?? 60;
    case 'bar': return f.barGrams ?? (f.type === 'perUnit' ? f.avgGrams || dg : dg);
    case 'pack': return f.packGrams ?? dg;
    case 'tub': return dg * 2;
    case 'splash': return 15;
    case 'drizzle': return 7;
    case 'dash': return 2;
    case 'pinch': return 0.5;
    case 'knob': return 10;
    case 'dollop': return 30;
    case 'square': return f.pieceGrams ?? 5;
  }
}

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
const qtyWord = (n: number) => {
  if (n >= 1) return fmtNum(n);
  const near = (x: number) => Math.abs(n - x) < 0.01;
  if (near(0.5)) return 'half a';
  if (near(0.25)) return 'a quarter of a';
  if (near(0.75)) return 'three quarters of a';
  if (near(1 / 3)) return 'a third of a';
  if (near(2 / 3)) return 'two thirds of a';
  return `${fmtNum(n)} of a`;
};
const pluralizeKey = (key: string, n: number) => (n <= 1 ? key : pluralize(key, n));
const r1 = (n: number) => Math.round(n * 10) / 10;

const IRREGULAR_PLURALS: Record<string, string> = {
  pastizz: 'pastizzi', weetabix: 'weetabix', qassata: 'qassatat', gbejna: 'gbejniet', sushi: 'sushi', dumpling: 'dumplings', taco: 'tacos',
  kiwi: 'kiwis', tomato: 'tomatoes', potato: 'potatoes', mango: 'mangoes', 'baked potato': 'baked potatoes', 'cannoli': 'cannoli',
};

// "slice of pizza" -> "slices of pizza"; "taco" -> "tacos"; "pastizz" -> "pastizzi"
function pluralize(label: string, n: number): string {
  if (n <= 1) return label;
  const ofIdx = label.indexOf(' of ');
  if (ofIdx > 0) return pluralize(label.slice(0, ofIdx), n) + label.slice(ofIdx);
  const lower = label.toLowerCase();
  const words = lower.split(' ');
  const lastWord = words[words.length - 1];
  const irregular = IRREGULAR_PLURALS[lower] ?? IRREGULAR_PLURALS[lastWord];
  if (irregular) return IRREGULAR_PLURALS[lower] ? irregular : label.slice(0, label.length - lastWord.length) + irregular;
  if (/s$/.test(label)) return label;
  if (/[^aeiou]y$/.test(label)) return label.slice(0, -1) + 'ies';
  return label + (/(?:[sxz]|ch|sh)$/.test(label) ? 'es' : 's');
}

// Resolves one matched food + its surrounding modifiers into a logged item.
function resolveItem(key: string, raw: FoodEntry, mods: Modifiers, lowerSeg: string, confidence: number): ParsedFoodPart {
  const fuzzyTag = confidence < 1 ? ' (assumed)' : '';
  let useKey = key;
  let useRaw = raw;
  let remapNote: string | undefined;
  let remapCount: number | undefined;

  // A bare "pizza" almost never means a whole 14" pizza — assume a few slices
  // (and say so), but "a pizza" / "large pizza" / "half a pizza" stay literal.
  if (key === 'pizza' && !hasInfo(mods) && !mods.weak && !mods.count) {
    useKey = 'pizza slice';
    remapCount = 3;
    remapNote = 'I assumed 3 slices of pizza';
    useRaw = { type: 'perUnit', cal: 285, prot: 12, carb: 36, fat: 10, label: 'slice of pizza', avgGrams: 107 };
  }

  const food = resolveStatefulFood(useRaw, useKey, lowerSeg);
  const stateTag = food.cookState && mods.unit !== 'can' ? ' (' + food.cookState + ')' : '';
  const liquid = !!food.liquid;
  const gUnit = liquid ? 'ml' : 'g';
  const per100 = getPer100g(food);
  const dg = defaultServing(food);
  const sf = sizeFactor(useKey, mods.size);
  const cafe = mods.cafe;
  const hasSize = !!mods.size && (mods.size !== 'medium' || SIZE_OVERRIDES[useKey]?.medium !== undefined);
  const sizeWord = hasSize ? mods.size + ' ' : '';
  const out = (grams: number, label: string, amount: number, unit: string, estimated: boolean, note?: string): ParsedFoodPart => {
    const f = grams / 100;
    return { label: label + fuzzyTag, matchedFood: useKey, amount, unit, estimated, confidence, cal: Math.round(per100.cal * f), prot: r1(per100.prot * f), carb: r1(per100.carb * f), fat: r1(per100.fat * f), note: note || remapNote };
  };
  const exact = (n: number, scaled: number, label: string, unit: string, estimated: boolean, note?: string): ParsedFoodPart => ({
    label: label + fuzzyTag, matchedFood: useKey, amount: n, unit, estimated, confidence,
    cal: Math.round(food.cal * scaled), prot: r1(food.prot * scaled), carb: r1(food.carb * scaled), fat: r1(food.fat * scaled), note: note || remapNote,
  });

  // 1. explicit weight / volume always wins
  if (mods.grams !== undefined) {
    const g = Math.round(mods.grams);
    return out(g, `${g}${mods.gramsKind === 'ml' && !liquid ? 'ml' : liquid ? 'ml' : mods.gramsKind || 'g'} ${useKey}${stateTag}`, g, mods.gramsKind || gUnit, false);
  }

  const count = remapCount ?? mods.count ?? (mods.weak ? 1 : undefined);
  const qty = count ?? mods.fraction;

  // 2. dish / perUnit foods: a count of whole items (unit words like
  //    "slice" / "bowl" / "plate" just mean "one of the thing")
  const countUnits: Unit[] = ['slice', 'piece', 'serving', 'bowl', 'plate', 'bar', 'pack', 'scoop', 'tub', 'square'];
  if ((food.type === 'dish' || food.type === 'perUnit') && (!mods.unit || countUnits.includes(mods.unit))) {
    let n = qty ?? mods.approx ?? (mods.few ? 3 : 1);
    const specified = qty !== undefined || mods.few === true;
    let scaled = n;
    let sizePart = '';
    if (cafe !== undefined) { scaled = n * cafe; sizePart = ''; }
    else if (hasSize) { scaled = n * sf; sizePart = sizeWord; }
    if (mods.few && qty === undefined) { n = 3; scaled = n * (cafe ?? sf); }
    const noteParts: string[] = [];
    if (!specified && !mods.approx) noteParts.push(`I assumed one ${food.type === 'perUnit' ? (food.label || useKey) : useKey}`);
    if (food.type === 'dish') {
      const label = (n < 1 ? qtyWord(n) + ' ' : n !== 1 ? fmtNum(n) + 'x ' : '') + sizePart + useKey + stateTag;
      return exact(n, scaled, label, 'serving', !specified, noteParts[0]);
    }
    const lab = food.label || useKey;
    return exact(n, scaled, n < 1 ? `${qtyWord(n)} ${sizePart}${lab}` : `${fmtNum(n)} ${sizePart}${pluralize(lab, n)}`, lab, !specified, noteParts[0]);
  }

  // 3. measured units (cup, tbsp, glass, can, handful, bowl…) on any food
  if (mods.unit) {
    const unit = mods.unit;
    const u = unitGrams(unit, food);
    const q = qty ?? mods.approx ?? (mods.few ? 3 : 1);
    const applies = SIZE_APPLIES.has(unit);
    const mult = cafe !== undefined && applies ? cafe : applies ? sf : 1;
    const grams = Math.round(q * u * mult * 10) / 10;
    const [one, many] = UNIT_LABEL[unit];
    const sizeStr = applies ? sizeWord : '';
    const label = `${qtyWord(q)} ${sizeStr}${q > 1 ? many : one} of ${useKey}${stateTag} (${Math.round(grams)}${gUnit})`;
    const note = ['bowl', 'plate', 'handful', 'piece'].includes(unit)
      ? `I counted ${q === 1 ? 'a' : qtyWord(q)} ${sizeStr}${q > 1 ? many : one} of ${useKey} as ~${Math.round(u * mult)}${gUnit} each` : undefined;
    return out(grams, label, Math.round(grams), gUnit, ESTIMATED_UNITS.has(unit), note);
  }

  // 4. per100g food with just a count / fraction / size / nothing
  const pg = food.pieceGrams;
  const sizeMult = cafe ?? sf;
  const bareGrams = mods.digitCount && mods.count !== undefined && mods.count > 12 && (!pg || pg >= 20); // "200 chicken" = grams
  if (count !== undefined) {
    const grams = bareGrams ? count : count * (pg ?? dg) * sizeMult;
    const g = Math.round(grams);
    const label = bareGrams || (count === 1 && !sizeWord && !pg)
      ? `${g}${gUnit} ${useKey}${stateTag}`
      : `${qtyWord(count)} ${sizeWord}${pluralizeKey(useKey, count)}${stateTag} (${g}${gUnit})`;
    return out(grams, label, g, gUnit, false);
  }
  if (mods.fraction !== undefined) {
    const grams = dg * mods.fraction * sizeMult;
    return out(grams, `${Math.round(grams)}${gUnit} ${useKey}${stateTag}`, Math.round(grams), gUnit, true,
      `I took ${mods.fraction === 0.5 ? 'half' : fmtNum(mods.fraction)} of a typical ${Math.round(dg)}${gUnit} serving`);
  }
  if (mods.few) {
    const grams = pg ? (pg < 10 ? 6 : 3) * pg : dg * 0.5;
    return out(grams, `${Math.round(grams)}${gUnit} ${useKey}${stateTag}`, Math.round(grams), gUnit, true, `I took "a few" as ~${Math.round(grams)}${gUnit}`);
  }
  if (mods.approx !== undefined) {
    const grams = dg * mods.approx * sizeMult;
    return out(grams, `${Math.round(grams)}${gUnit} ${useKey}${stateTag}`, Math.round(grams), gUnit, true);
  }
  const grams = dg * sizeMult;
  const g = Math.round(grams);
  return out(grams, sizeWord ? `1 ${sizeWord}${useKey}${stateTag} (${g}${gUnit})` : `${g}${gUnit} ${useKey}${stateTag}`, g, gUnit, true,
    `I assumed a typical ${g}${gUnit} serving`);
}

// ── Segmenting ──────────────────────────────────────────────────────────

const HEAD_CONTAINERS = new Set([
  'soup', 'sandwich', 'burger', 'cheeseburger', 'chicken burger', 'pizza', 'pizza slice', 'salad', 'side salad', 'pie', 'cake', 'curry', 'stew',
  'smoothie', 'protein shake', 'milk', 'omelette', 'pancakes', 'waffle', 'muffin', 'donut', 'cookie', 'kebab', 'burrito', 'taco', 'ice cream',
  'yogurt', 'greek yogurt', 'cereal', 'quiche', 'hot dog', 'stir fry', 'ramen', 'noodles', 'brownie',
]);
const TOAST_LIKE = new Set(['bread', 'toast', 'bagel', 'sourdough', 'crackers', 'pitta', 'naan', 'tortilla', 'wholemeal bread', 'baguette', 'ciabatta', 'rice cake', 'rye bread']);

// Protect known phrases that contain connector words so they survive splitting.
function protectPhrases(norm: string, index: PhraseEntry[]): string {
  let t = norm;
  for (const e of index) {
    if (!/ (and|with|on|in) |&/.test(e.variant)) continue;
    if (!t.includes(e.variant)) continue;
    const re = new RegExp(`(^|[^a-z0-9])${e.variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'g');
    t = t.replace(re, (_m, pre: string) => pre + e.variant.replace(/ /g, '_'));
  }
  return t;
}

const SPLIT_RE = /\s*(,|;|&|\+|\band\b|\bwith\b|\bplus\b|\bthen\b|\balso\b|\bon top of\b|\bon\b|\bin\b|\bfollowed by\b)\s*/;

function splitSegments(norm: string, index: PhraseEntry[]): { text: string; connector: string }[] {
  const protectedText = protectPhrases(norm, index);
  const pieces = protectedText.split(SPLIT_RE);
  const out: { text: string; connector: string }[] = [];
  let connector = '';
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i].trim();
    if (i % 2 === 1) { connector = p; continue; }
    if (p) out.push({ text: p.replace(/_/g, ' '), connector });
    connector = '';
  }
  return out;
}

const MILK_KEYS = new Set(['milk', 'whole milk', 'semi skimmed milk', 'skimmed milk', 'oat milk', 'soy milk', 'almond milk']);
const BLACK_DRINKS = new Set(['coffee', 'tea', 'green tea', 'americano', 'espresso', 'double espresso', 'iced coffee', 'cold brew']);
const MILKY_DRINKS = new Set(['latte', 'cappuccino', 'flat white', 'mocha', 'hot chocolate', 'chai latte', 'matcha latte', 'cortado', 'macchiato', 'caramel macchiato', 'frappuccino', 'milkshake']);

function contentTokens(lower: string): string[] {
  const m = parseModifiers(lower);
  return m.leftover;
}

function parseSegment(text: string, foods: VittoFoods, index: PhraseEntry[]): SegmentResult {
  const lower = text;
  let spans = findSpans(lower, index);
  let fuzzyConf = 1;
  if (spans.length === 0) {
    const f = fuzzyFind(lower, index);
    if (f) { spans = [f.span]; fuzzyConf = f.confidence; }
  }
  if (spans.length === 0) {
    const left = contentTokens(lower);
    const hasQuant = hasInfo(parseModifiers(lower));
    if (left.length === 0 && !hasQuant) return { text, status: 'empty', items: [], reasons: [] };
    if (left.length === 0) return { text, status: 'empty', items: [], reasons: [] };
    return { text, status: 'unmatched', items: [], reasons: ['unmatched:' + left.join(' ')] };
  }

  // merge repeated spans of the same food that touch ("egg ... eggs") — rare; keep distinct
  const reasons: string[] = [];
  const keys = [...new Set(spans.map((s) => s.key))];
  if (keys.length > 1) reasons.push('compound:' + keys.join('+'));

  // Local fallback for compounds: "tomato soup" -> the head noun only,
  // but "avocado toast" / "peanut butter and toast" keeps both.
  let use = spans;
  if (keys.length > 1) {
    const last = spans[spans.length - 1];
    const lastIsHead = HEAD_CONTAINERS.has(last.key);
    const earlierAreToppings = spans.slice(0, -1).some((s) => TOAST_LIKE.has(s.key)) || TOAST_LIKE.has(last.key);
    if (lastIsHead && !earlierAreToppings) use = [last];
  }

  const leftover = new Set<string>();
  const items: ParsedFoodPart[] = [];
  const cook = detectCookState(lower);
  void cook;
  let gapConsumed = false;
  for (let i = 0; i < use.length; i++) {
    const s = use[i];
    const prevEnd = i === 0 ? 0 : use[i - 1].end;
    const nextStart = i === use.length - 1 ? lower.length : use[i + 1].start;
    // "chicken 200g rice 150g": a measure right after a food belongs to it, so
    // text a previous food already claimed can't also count for this one.
    const pre = gapConsumed ? '' : lower.slice(prevEnd, s.start);
    const post = lower.slice(s.end, nextStart);
    gapConsumed = false;
    const preMods = parseModifiers(pre);
    const postMods = parseModifiers(post);
    let mods = preMods;
    if (!hasInfo(preMods) && hasInfo(postMods)) { mods = postMods; gapConsumed = i < use.length - 1; }
    // if pre has a size/unit but the number lives in post ("large slice 2"), fold them
    else if (hasInfo(preMods) && hasInfo(postMods) && i === use.length - 1) {
      if (mods.count === undefined && postMods.count !== undefined && preMods.unit === undefined) mods.count = postMods.count;
      if (mods.grams === undefined && postMods.grams !== undefined) { mods.grams = postMods.grams; mods.gramsKind = postMods.gramsKind; }
    }
    preMods.leftover.forEach((w) => leftover.add(w));
    postMods.leftover.forEach((w) => leftover.add(w));
    const entry = foods.db[s.key];
    if (!entry) continue;
    items.push(resolveItem(s.key, entry, mods, lower, s.fuzzy ?? fuzzyConf));
  }
  if (items.length === 0) return { text, status: 'unmatched', items: [], reasons: ['no-entry'] };
  if (leftover.size > 0) reasons.push('suspect:' + [...leftover].join(' '));
  if (fuzzyConf < 0.7) reasons.push('fuzzy');
  return { text, status: reasons.length ? 'flagged' : 'ok', items, reasons };
}

export function parseFoodText(text: string, foods: VittoFoods): ParseResult {
  const index = getIndex(foods);
  const norm = normalizeText(text);
  const raw = splitSegments(norm, index);
  const segments: SegmentResult[] = [];
  const connectors: string[] = [];
  for (const seg of raw) {
    const r = parseSegment(seg.text, foods, index);
    if (r.status === 'empty') continue;
    segments.push(r);
    connectors.push(seg.connector);
  }

  // "coffee with milk": the milk is a splash (or already inside a latte), not a 250ml glass
  for (let i = 1; i < segments.length; i++) {
    const cur = segments[i], prev = segments[i - 1];
    if (cur.items.length !== 1 || !MILK_KEYS.has(cur.items[0].matchedFood) || !cur.items[0].estimated) continue;
    if (!/^(with|and|,|&|\+|plus)$/.test(connectors[i])) continue;
    const prevKeys = prev.items.map((it) => it.matchedFood);
    if (prevKeys.some((k) => MILKY_DRINKS.has(k))) { cur.items = []; cur.status = 'empty'; continue; }
    if (prevKeys.some((k) => BLACK_DRINKS.has(k))) {
      const it = cur.items[0];
      const f = 30 / (it.amount || 250);
      cur.items = [{ ...it, label: `30ml ${it.matchedFood} (splash)`, amount: 30, unit: 'ml', cal: Math.round(it.cal * f), prot: r1(it.prot * f), carb: r1(it.carb * f), fat: r1(it.fat * f), note: undefined }];
    }
  }
  const live = segments.filter((s) => s.status !== 'empty');

  const matched = live.flatMap((s) => s.items);
  const confident = live.filter((s) => s.status === 'ok').flatMap((s) => s.items);
  const unmatched = live.filter((s) => s.status === 'unmatched').map((s) => s.text);
  const flagged = live.filter((s) => s.status === 'flagged' || s.status === 'unmatched');
  return { matched, unmatched, needsLLM: flagged.length > 0, llmTexts: flagged.map((s) => s.text), confident, segments: live };
}

// Single-segment convenience used by callers that already split their input.
export function parseFoodPart(part: string, foods: VittoFoods): ParsedFoodPart | null {
  const r = parseFoodText(part, foods);
  return r.matched[0] ?? null;
}

// ── User-supplied label numbers ("minced beef 147cal per 100g, ate 400g") ──

export function tryParseCustomPer100g(text: string, foods: VittoFoods) {
  const lower = text.toLowerCase();
  const per100Match = lower.match(/(\d+(?:\.\d+)?)\s*(?:kcal|cal|calories)?\s*(?:per|\/)\s*100\s*(?:g|grams?|ml|millilit(?:re|er)s?)\b/);
  if (!per100Match) return null;
  const statedCal = parseFloat(per100Match[1]);
  const per100Start = per100Match.index!, per100End = per100Start + per100Match[0].length;
  const isMl = /ml|millilit/.test(per100Match[0]);
  const amountMatches = [...lower.matchAll(/(\d+(?:\.\d+)?)\s*(?:g|grams?|ml|millilit(?:re|er)s?)\b/g)];
  let weightGrams: number | null = null;
  for (const gm of amountMatches) {
    const gmStart = gm.index!, gmEnd = gmStart + gm[0].length;
    if (gmStart >= per100Start && gmEnd <= per100End) continue;
    weightGrams = parseFloat(gm[1]);
    break;
  }
  if (weightGrams === null) return null;

  const spans = findSpans(normalizeText(text), getIndex(foods));
  const matchedKey = spans.length ? spans[0].key : null;
  const factor = weightGrams / 100;
  const totalCal = Math.round(statedCal * factor);
  let prot: number, carb: number, fat: number;
  if (matchedKey && foods.db[matchedKey]) {
    const per100 = getPer100g(resolveStatefulFood(foods.db[matchedKey], matchedKey, lower));
    const scale = per100.cal ? statedCal / per100.cal : 1;
    prot = r1(per100.prot * scale * factor);
    carb = r1(per100.carb * scale * factor);
    fat = r1(per100.fat * scale * factor);
  } else {
    prot = r1(((totalCal * 0.15) / 4));
    carb = r1(((totalCal * 0.5) / 4));
    fat = r1(((totalCal * 0.35) / 9));
  }
  const unit = isMl ? 'ml' : 'g';
  return { label: Math.round(weightGrams) + unit + ' ' + (matchedKey || 'food') + ' (at ' + statedCal + ' kcal/100' + unit + ')', cal: totalCal, prot, carb, fat, estimatedMacros: !matchedKey };
}

// ── LLM output -> logged item (database-grounded when possible) ─────────

export type LLMFoodItem = {
  label: string; db: string | null; grams: number | null;
  cal: number; protein_g: number; carbs_g: number; fat_g: number;
  confidence?: number; note?: string | null;
};

export function llmItemToPart(item: LLMFoodItem, foods: VittoFoods): ParsedFoodPart | null {
  const label = String(item.label || '').trim();
  if (!label) return null;
  const confidence = Math.max(0.4, Math.min(1, Number(item.confidence) || 0.8));
  const grams = Number(item.grams);
  const dbKey = item.db ? (foods.db[item.db] ? item.db : foods.synonyms[item.db]) : undefined;
  if (dbKey && foods.db[dbKey] && grams > 0 && grams <= 3000) {
    const food = resolveStatefulFood(foods.db[dbKey], dbKey, label.toLowerCase());
    const per100 = getPer100g(food);
    const f = grams / 100;
    return {
      label, matchedFood: dbKey, amount: Math.round(grams), unit: food.liquid ? 'ml' : 'g', estimated: false, confidence,
      cal: Math.round(per100.cal * f), prot: r1(per100.prot * f), carb: r1(per100.carb * f), fat: r1(per100.fat * f),
      note: item.note || undefined,
    };
  }
  const cal = Number(item.cal), prot = Number(item.protein_g), carb = Number(item.carbs_g), fat = Number(item.fat_g);
  if (![cal, prot, carb, fat].every((n) => Number.isFinite(n) && n >= 0)) return null;
  if (cal > 3500 || (cal === 0 && prot + carb + fat > 5)) return null;
  return {
    label, matchedFood: '', amount: grams > 0 ? Math.round(grams) : 1, unit: grams > 0 ? 'g' : 'serving', estimated: true,
    confidence: Math.min(0.8, confidence), cal: Math.round(cal), prot: r1(prot), carb: r1(carb), fat: r1(fat), note: item.note || undefined,
  };
}
