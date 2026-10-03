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

import { parseFoodText, parseFoodPart, tryParseCustomPer100g, parseModifiers, normalizeText, llmItemToPart, type VittoFoods, type ParsedFoodPart, type LLMFoodItem, type ParseResult } from './foodParser';

export { parseFoodText, parseFoodPart, tryParseCustomPer100g };
export type { VittoFoods, ParsedFoodPart, LLMFoodItem, ParseResult };

// ── Types ───────────────────────────────────────────────────────────────

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

export type VittoContext = {
  foods: VittoFoods;
  todayMeals: MealEntry[];
  targets: { cal: number; prot: number; carb: number; fat: number };
  mealTemplates: MealTemplate[];
  streakDays: number;
  pending: PendingState | null;
  clientFirstName: string | null;
};

// `unhandled: true` marks a genuine open question the local parser has no
// pattern for (not food, not small talk, not an app command) — the route
// handler uses this to decide whether to hand the message to the LLM for a
// real nutrition-knowledge answer instead of leaving the client stuck.
//
// `needsLLM` marks a food log the local engine is only partly sure about
// (compound dishes, unexplained words, unknown foods). The route re-reads
// `llmTexts` with the LLM and calls finishWithLLM() to merge the result with
// the `confident` local items; if the LLM is unavailable the local best-effort
// `reply`/`actions` stand as they are.
export type VittoResult = {
  reply: string;
  actions: VittoAction[];
  unhandled?: boolean;
  needsLLM?: boolean;
  llmTexts?: string[];
  confident?: ParsedFoodPart[];
};

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
  if (/\b(undo|oops|scratch that|(remove|delete) (the )?last( one| entry| meal)?)\b/.test(lower)) return undoLastMeal(ctx.todayMeals);
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
  const food = ctx.foods.db[last.matchedFood];
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
  // "actually 2 apples" / "no, it was 2 bananas" / "I meant a latte" — replace the last entry with a different food/amount.
  // Verbs that only make sense as a correction work alone; "i had/i ate" needs a leading "no/actually/oops".
  const triggerMatch = lower.match(/^(?:(?:no|nope|actually|wait|oops|sorry|oh)[,.]?\s+)*(?:it was|that was|it'?s|its|i meant(?: to say)?|i mean|make (?:that|it)|change (?:that|it) to|it should be|should be|correction[:,]?)\s+/)
    || lower.match(/^(?:actually|wait|correction|sorry)[,:]?\s+(?:i (?:had|ate)\s+)?/)
    || lower.match(/^(?:no|nope|oops|sorry)[,.]?\s+(?:i (?:had|ate)\s+)/);
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

// "make that large", "actually 3", "it was 200g", "double that", "half of that" —
// changes ONLY the amount/size of the last entry, keeping the same food. Runs
// after tryEditLastEntry, which handles corrections that name a new food.
function tryAdjustLast(text: string, ctx: VittoContext): VittoResult | null {
  const arr = ctx.todayMeals;
  if (arr.length === 0) return null;
  const last = arr[arr.length - 1];
  const lower = normalizeText(text).replace(/[.!?]+$/, '');

  // pure multipliers work on any entry, including LLM-estimated ones
  const mult = lower.match(/^(?:(?:no|actually|wait|oops|sorry)[, ]+)*(?:make (?:that|it|this) |it was |that was )?(double|twice|triple|half)(?: of)?(?: that| it| this)?$/);
  if (mult) {
    const f = mult[1] === 'half' ? 0.5 : mult[1] === 'triple' ? 3 : 2;
    const updated: NewMealEntry = {
      name: last.name + (f === 0.5 ? ' (half)' : ' (×' + f + ')'), cal: Math.round(last.cal * f), prot: Math.round(last.prot * f * 10) / 10,
      carb: Math.round(last.carb * f * 10) / 10, fat: Math.round(last.fat * f * 10) / 10, originalText: text,
      matchedFood: last.matchedFood ?? null, amount: last.amount != null ? Math.round(last.amount * f) : null, unit: last.unit ?? null, estimated: last.estimated,
    };
    return { reply: 'Done — ' + (f === 0.5 ? 'halved' : 'doubled'.replace('doubled', f === 2 ? 'doubled' : 'tripled')) + ': ' + updated.name + ' (' + updated.cal + ' kcal).', actions: [{ kind: 'remove_meal', id: last.id }, { kind: 'add_meal', entry: updated }] };
  }

  const m = lower.match(/^(?:(?:no|nope|actually|wait|oops|sorry|oh)[, ]+)*(?:make (?:that|it|this)|change (?:that|it|this)(?: to)?|it was|that was|that should be|it should be|should be|i meant|i mean|more like|it'?s|its)?\s*(?:a |an |the )?(.+)$/);
  if (!m || !m[1]) return null;
  const rest = m[1].trim();
  const mods = parseModifiers(rest);
  const hasAmount = mods.grams !== undefined || mods.count !== undefined || mods.fraction !== undefined || mods.size !== undefined || mods.cafe !== undefined || mods.unit !== undefined;
  // must be ONLY an amount/size — any leftover word means it's something else
  if (!hasAmount || mods.leftover.length > 0) return null;
  // and the message must really be a correction, not a fresh log of a bare amount
  const isCorrection = /^(?:no|nope|actually|wait|oops|sorry|oh|make|change|it was|that was|that should|it should|should be|i meant|i mean|more like|it'?s|its)\b/.test(lower) || mods.size !== undefined && lower.split(' ').length <= 2;
  if (!isCorrection) return null;
  if (!last.matchedFood || !ctx.foods.db[last.matchedFood]) return null;

  const cook = /\((raw|cooked)\)/.exec(last.name)?.[1] || '';
  const { matched } = parseFoodText(rest + ' ' + last.matchedFood + (cook ? ' ' + cook : ''), ctx.foods);
  if (matched.length !== 1) return null;
  const n = matched[0];
  const entry: NewMealEntry = { name: n.label, cal: n.cal, prot: n.prot, carb: n.carb, fat: n.fat, originalText: text, matchedFood: n.matchedFood, amount: n.amount, unit: n.unit, estimated: n.estimated, confidence: n.confidence };
  return { reply: 'Got it — changed "' + last.name + '" to ' + n.label + ' (' + n.cal + ' kcal, ' + n.prot + 'g P, ' + n.carb + 'g C, ' + n.fat + 'g F). Updated ✅', actions: [{ kind: 'remove_meal', id: last.id }, { kind: 'add_meal', entry }] };
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

  const adjustReply = tryAdjustLast(trimmed, ctx);
  if (adjustReply) return { reply: adjustReply.reply, actions: [...clearStalePending, ...adjustReply.actions] };

  // Commands (undo/remove/clear/totals/etc.) always take priority — but
  // greetings/thanks/chat must NOT: a message can be both a greeting and a
  // food log ("hey I had 3 eggs"), and the food must still get logged.
  // Strip a leading greeting before checking commands — several command
  // patterns are anchored to the start of the message ("^remove ..."), so
  // "hey remove the eggs" would otherwise fail the same way food did.
  const greetingStrippedLower = trimmed.toLowerCase().replace(/^(hi|hello|hey|hiya|yo|sup|howdy|good morning|good afternoon|good evening|good night|morning|evening|afternoon)[,!.]?\s*/, '').trim();
  const commandResult = tryAnswerQuestion(greetingStrippedLower || trimmed.toLowerCase(), ctx);
  if (commandResult) return { reply: commandResult.reply, actions: [...clearStalePending, ...commandResult.actions] };

  // A message phrased as a question ("is peanut butter good for weight
  // loss?") must never fall into food parsing just because it happens to
  // NAME a food the database recognizes — without this, parseFoodText below
  // would match "peanut butter" and silently log 16g of it instead of
  // answering the actual question. A trailing "?" with no quantity/unit is
  // a strong, simple signal this is a question, not a food statement.
  const isQuestionShaped = /\?\s*$/.test(trimmed) && !/\d+\s*(g|grams?|kg|ml|l|oz|cal|kcal)\b/i.test(trimmed);
  if (isQuestionShaped) {
    const smallTalkReply = trySmallTalk(trimmed.toLowerCase(), ctx.clientFirstName);
    if (smallTalkReply) return { reply: smallTalkReply, actions: clearStalePending };
    // Placeholder reply — the route handler replaces this with a real
    // answer when the LLM call succeeds; this text only ever reaches the
    // client if that call fails or no API key is configured.
    return { reply: "Good question — I don't have a solid answer for that right now. Try asking again in a moment, or bring it to your coach.", actions: clearStalePending, unhandled: true };
  }

  // Statements about food that ISN'T being logged: future plans, hypotheticals
  // and "I didn't eat" — logging a food from those would be plain wrong.
  const futureOrHypothetical = /\b(going to|gonna|want to|wanna|planning (to|on)|about to|thinking (of|about)|craving|should i|can i|could i|may i|what if|shall i|would it be (ok|okay|fine)|is it (ok|okay|fine) (to|if)|tomorrow|next (week|time)|later (today|tonight)|for tomorrow|i('| wi)ll (eat|have|get|make|cook)|i might|maybe i)\b/i.test(trimmed) && !/\b(i )?(just|already) (ate|had)\b/i.test(trimmed);
  const negativeIntake = /\b(didn'?t|did not|haven'?t|have not|hasn'?t|skipped|skipping|missed|forgot to (eat|have|log)|not (eaten|had) (anything|much))\b.*\b(eat|ate|eaten|have|had|lunch|dinner|breakfast|meal|food|anything)\b/i.test(trimmed) || /^(nothing|no food|haven'?t eaten)\b/i.test(trimmed);
  if (negativeIntake) {
    return { reply: pick(["No worries — nothing logged for that. Just tell me what you do end up having 👍", "Got it, I won't log anything for that. Let me know when you eat and I'll track it!", "All good — nothing added. Try to fit a proper meal in when you can 💪"]), actions: clearStalePending };
  }
  if (futureOrHypothetical) {
    return { reply: "That sounds like a plan rather than something you've eaten yet, so I haven't logged it. Tell me once you've had it and I'll add it — or ask me anything about it!", actions: clearStalePending, unhandled: true };
  }

  const parsed = parseFoodText(trimmed, ctx.foods);
  const { matched, unmatched } = parsed;
  if (matched.length === 0) {
    // No food found — NOW it's safe to treat this as pure conversation.
    const smallTalkReply = trySmallTalk(trimmed.toLowerCase(), ctx.clientFirstName);
    if (smallTalkReply) return { reply: smallTalkReply, actions: clearStalePending };
    // Don't assume everything unrecognised is food — only chase a calorie
    // estimate if this actually looks like a food/drink mention.
    const looksFoodLike = /\d/.test(trimmed) || /\b(ate|eat|eating|had|have|drank|drink|breakfast|lunch|dinner|snack|meal|food|calorie|protein|carbs?|fat|grams?|ml|kcal)\b/i.test(trimmed);
    if (looksFoodLike) {
      return {
        reply: 'I don\'t recognise "' + trimmed + '" yet — no worries though, roughly how many calories was that? Just give me a number (like "450" or "about 500 cal") and I\'ll log it for you.',
        actions: [{ kind: 'set_pending', pending: { type: 'unknown_food', text: trimmed } }],
        needsLLM: true, llmTexts: [trimmed], confident: [],
      };
    }
    return { reply: "I'm not quite sure what you mean by that 🤔 You can tell me what you ate or drank, ask how many calories/protein/carbs/fat you have left, say \"undo\" to remove your last entry, or just say hi anytime!", actions: clearStalePending, unhandled: true };
  }

  const composed = composeLogReply(ctx, trimmed, matched, unmatched);
  return {
    reply: composed.reply,
    actions: [...clearStalePending, ...composed.actions],
    needsLLM: parsed.needsLLM,
    llmTexts: parsed.llmTexts,
    confident: parsed.confident,
  };
}

// Turns a list of resolved foods into the log actions + the friendly reply.
// Shared by the local path and by finishWithLLM so both sound identical.
export function composeLogReply(ctx: VittoContext, text: string, items: ParsedFoodPart[], unmatched: string[] = []): { reply: string; actions: VittoAction[] } {
  const isFirstLogToday = ctx.todayMeals.length === 0;
  const totals = items.reduce((a, m) => ({ cal: a.cal + m.cal, prot: a.prot + m.prot, carb: a.carb + m.carb, fat: a.fat + m.fat }), { cal: 0, prot: 0, carb: 0, fat: 0 });
  const roundedProt = Math.round(totals.prot), roundedCarb = Math.round(totals.carb), roundedFat = Math.round(totals.fat);

  // Each food gets its OWN log entry (not merged into one row) — this is
  // what makes "remove the banana" remove only the banana even when it was
  // logged in the same message as eggs, rather than deleting both.
  const addActions: VittoAction[] = items.map((m) => ({ kind: 'add_meal', entry: { name: m.label, cal: m.cal, prot: m.prot, carb: m.carb, fat: m.fat, originalText: text, matchedFood: m.matchedFood || null, amount: m.amount, unit: m.unit, estimated: m.estimated, confidence: m.confidence } }));

  let opener: string;
  const openedWithGreeting = /^(hi|hello|hey|hiya|yo|sup|howdy)\b/i.test(text) || /^(good morning|good afternoon|good evening|morning|evening|afternoon)\b/i.test(text);
  if (openedWithGreeting) {
    const fdn = getDisplayName(ctx.clientFirstName); const fname = fdn ? ' ' + fdn : '';
    opener = pick(['Hey' + fname + '! Got it —', 'Hi' + fname + '! Logged that —', 'Hey there! Noted —']);
  } else if (isFirstLogToday) {
    const fdn = getDisplayName(ctx.clientFirstName); const fname = fdn ? ', ' + fdn : '';
    opener = pick(['Okay, great' + fname + '! That\'s a good start to the day 🌅', 'Nice one' + fname + ' — great way to kick off the day!', 'Love it' + fname + ', first log of the day — let\'s keep this going 💪', 'That\'s a solid start to the day' + fname + ', logged:']);
  } else {
    opener = pick(['Got it!', 'Nice one, logged that:', 'Perfect, added:', 'On it!', 'All set —', 'Boom, logged:', 'Nice — added:', "Sweet, that's in:", 'Easy, done:', 'Solid choice —', 'Noted!', "Great, that's in the log:", 'Excellent choice! Logged:', 'Love that pick — logged:', 'Nutritious and delicious — logged:', "That'll do nicely — logged:", 'Nice pick! Locked in:']);
  }
  const foodList = items.map((m) => m.label).join(' and ');
  let reply = opener + ' ' + foodList + '. Around ' + Math.round(totals.cal) + ' kcal, ' + roundedProt + 'g protein, ' + roundedCarb + 'g carbs and ' + roundedFat + 'g fat.';

  // Be upfront about every assumption, and make correcting it one short message.
  const notes = [...new Set(items.map((m) => m.note).filter((n): n is string => !!n))];
  if (notes.length > 0) {
    reply += ' (' + notes.join('; ') + ' — if that\'s off, just tell me the real amount (like "actually 2" or "it was large") and I\'ll fix it.)';
  } else if (items.some((m) => m.estimated && m.matchedFood === '')) {
    reply += ' (That one is my best estimate, so treat it as approximate.)';
  }

  let pendingAction: VittoAction[] = [];
  if (unmatched.length) {
    const pendingText = unmatched.join(', ');
    reply += ' I didn\'t recognise "' + pendingText + '" though — roughly how many calories was that part? Tell me a number and I\'ll add it too.';
    pendingAction = [{ kind: 'set_pending', pending: { type: 'unknown_food', text: pendingText } }];
  }
  return { reply, actions: [...addActions, ...pendingAction] };
}

// Merges the local parser's confident items with what the LLM worked out for
// the parts it was unsure about, and rebuilds the reply/actions.
export function finishWithLLM(base: VittoResult, llmItems: LLMFoodItem[], ctx: VittoContext, text: string): VittoResult | null {
  const llmParts = llmItems.map((it) => llmItemToPart(it, ctx.foods)).filter((p): p is ParsedFoodPart => p !== null);
  if (llmParts.length === 0) return null;
  const items = [...(base.confident ?? []), ...llmParts];
  const clearStale: VittoAction[] = ctx.pending ? [{ kind: 'clear_pending' }] : [];
  const composed = composeLogReply(ctx, text, items);
  return { reply: composed.reply, actions: [...clearStale, ...composed.actions] };
}
