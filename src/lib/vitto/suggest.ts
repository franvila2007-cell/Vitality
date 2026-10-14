// As-you-type food suggestions for Vitto's message box. Pure functions so the
// matching can be tested without a browser.

export type Suggestion = { label: string; /** index in the input where the typed fragment starts */ from: number };

// Words that are never the start of a food name.
const SKIP = new Set(['a', 'an', 'the', 'of', 'some', 'my', 'half', 'couple', 'few', 'small', 'medium', 'large', 'big', 'handful', 'bowl', 'plate', 'glass', 'cup',
  'cups', 'slice', 'slices', 'piece', 'pieces', 'tbsp', 'tsp', 'can', 'bottle', 'pint', 'scoop', 'scoops', 'bar', 'pack', 'x', 'i', 'had', 'ate', 'and', 'with', 'for', 'at']);

export function suggestFoods(names: string[], input: string, priority: string[] = [], limit = 5): Suggestion[] {
  if (!input || /\s$/.test(input)) return [];
  const sep = /[,;&+]|\b(?:and|with|plus|then|on)\b/gi;
  let tailStart = 0;
  for (let m = sep.exec(input); m; m = sep.exec(input)) tailStart = m.index + m[0].length;
  const tail = input.slice(tailStart);
  const lastMatch = /(\S+)$/.exec(tail);
  if (!lastMatch) return [];
  const last = lastMatch[1].toLowerCase();
  if (last.length < 2 || /\d/.test(last) || SKIP.has(last)) return [];

  const lastFrom = tailStart + (lastMatch.index ?? 0);
  const twoMatch = /(\S+)\s+(\S+)$/.exec(tail);
  const firstOfTwo = twoMatch?.[1].toLowerCase();
  const two = twoMatch && firstOfTwo && !SKIP.has(firstOfTwo) && !/\d/.test(firstOfTwo) ? `${firstOfTwo} ${last}` : null;
  const twoFrom = twoMatch ? tailStart + (twoMatch.index ?? 0) : lastFrom;

  const prioIdx = new Map(priority.map((n, i) => [n.toLowerCase(), i]));
  const scored: { label: string; from: number; score: number; prio: number; len: number }[] = [];
  const seen = new Set<string>();
  for (const name of [...priority, ...names]) {
    const lower = name.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    let score = -1, from = lastFrom;
    if (two && lower.startsWith(two) && lower !== two) { score = 0; from = twoFrom; }
    else if (lower.startsWith(last) && lower !== last) score = 1;
    else if (lower.split(' ').some((w) => w.startsWith(last) && lower !== last)) score = 2;
    if (score < 0) continue;
    // foods the client already logs often (recents / saved recipes) jump the queue
    const prio = prioIdx.get(lower) ?? 999;
    scored.push({ label: name, from, score: prio < 999 ? Math.min(score, 1) - 0.1 : score, prio, len: name.length });
  }
  scored.sort((a, b) => a.score - b.score || a.prio - b.prio || a.label.localeCompare(b.label));
  return scored.slice(0, limit).map(({ label, from }) => ({ label, from }));
}

/** Replaces the typed fragment with the chosen suggestion (plus a trailing space to keep typing). */
export function applySuggestion(input: string, s: Suggestion): string {
  return input.slice(0, s.from) + s.label + ' ';
}
