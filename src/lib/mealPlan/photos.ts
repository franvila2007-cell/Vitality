// Stock photos for meal-plan recipes. For each recipe: search the stock
// libraries (Pexels when a key is set, then Pixabay), have Claude look at
// the candidates and pick one that genuinely shows the dish — or none — and
// copy the chosen photo into Supabase Storage so the link in the Gamma never
// expires. A recipe with no good match is left without a photo and flagged;
// a misleading photo is never used, and AI images never are.
// Both libraries' licences allow free commercial use without attribution.
// Server-only.
import * as z from 'zod/v4';
import type { createAdminClient } from '@/lib/supabase/admin';
import { askClaude, type ClaudeUsage } from './claude';
import type { FoodRules } from './intake';
import { recipeIngredientsLine } from './gammaContent';
import type { Recipe } from './recipes';
import { INGREDIENT_BY_ID } from './nutrition';

type Admin = ReturnType<typeof createAdminClient>;

export const PHOTO_BUCKET = 'meal-plan-photos';

export type ChosenPhoto = {
  /** Permanent copy in Supabase Storage — what goes into the Gamma */
  url: string;
  source: 'pexels' | 'pixabay';
  sourceId: string;
  pageUrl: string;
  photographer: string | null;
};

type Candidate = { source: ChosenPhoto['source']; id: string; preview: string; full: string; pageUrl: string; photographer: string | null; description: string };

const CANDIDATES_PER_SEARCH = 10;

async function searchPexels(query: string): Promise<Candidate[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  const res = await fetch(`https://api.pexels.com/v1/search?per_page=${CANDIDATES_PER_SEARCH}&query=${encodeURIComponent(query)}`, { headers: { Authorization: key }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Pexels search failed (${res.status})`);
  const body = (await res.json()) as { photos?: { id: number; url: string; alt?: string; photographer?: string; src: { medium: string; large2x: string } }[] };
  return (body.photos ?? []).map((p) => ({ source: 'pexels', id: String(p.id), preview: p.src.medium, full: p.src.large2x, pageUrl: p.url, photographer: p.photographer ?? null, description: p.alt ?? '' }));
}

async function searchPixabay(query: string): Promise<Candidate[]> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];
  const url = `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query.slice(0, 100))}&image_type=photo&category=food&safesearch=true&per_page=${CANDIDATES_PER_SEARCH}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Pixabay search failed (${res.status})`);
  const body = (await res.json()) as { hits?: { id: number; pageURL: string; tags: string; webformatURL: string; largeImageURL: string; user?: string }[] };
  return (body.hits ?? []).map((h) => ({ source: 'pixabay', id: String(h.id), preview: h.webformatURL, full: h.largeImageURL, pageUrl: h.pageURL, photographer: h.user ?? null, description: h.tags }));
}

/**
 * Search terms from most to least specific: the model's description, the
 * dish name, then just the main protein and carbohydrate ("salmon rice"),
 * which stock libraries match far more often.
 */
function queriesFor(r: Recipe): string[] {
  const name = r.name.replace(/\b(with|and|on|in)\b/gi, ' ').replace(/[^a-z\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  const word = (id: string | null) => (id ? (INGREDIENT_BY_ID.get(id)?.aliases[0] ?? '') : '');
  const basic = `${word(r.mainProteinId)} ${word(r.mainCarbId)}`.trim();
  return Array.from(new Set([r.photoQuery, name, basic].map((q) => q.trim()).filter(Boolean)));
}

const PickSchema = z.object({ best_index: z.number(), reason: z.string() });

const SYSTEM = `You check stock photos for recipes in a client's meal plan. Pick the one photo that a client would agree shows this dish: the same main protein, the same main carbohydrate (or none), and a similar finished plate. Small differences in garnish or vegetables are fine.

Reject a photo if it shows any food the client can't eat (it would mislead them), if it is mainly raw ingredients rather than the cooked dish, if it shows a different dish (e.g. a burger in a bun for a bunless patty, pasta for rice), or if it has text, logos or watermarks. If no photo qualifies, answer -1. A missing photo is much better than a misleading one.`;

type ImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

/** Downloads a small preview to show Claude (stock sites block Claude fetching URLs itself). */
async function previewData(c: Candidate): Promise<{ media_type: ImageType; data: string } | null> {
  try {
    const res = await fetch(c.preview, { signal: AbortSignal.timeout(10_000) });
    const type = (res.headers.get('content-type') ?? '').split(';')[0] as ImageType;
    if (!res.ok || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type)) return null;
    return { media_type: type, data: Buffer.from(await res.arrayBuffer()).toString('base64') };
  } catch {
    return null;
  }
}

async function pickPhoto(r: Recipe, all: Candidate[], rules: FoodRules): Promise<{ index: number; usage: ClaudeUsage | null; candidates: Candidate[] }> {
  const avoid = [...rules.excludedTags, ...rules.excludedTerms].join(', ') || 'nothing';
  const loaded = await Promise.all(all.map(previewData));
  const candidates = all.filter((_, i) => loaded[i]);
  const images = loaded.filter((x): x is NonNullable<typeof x> => !!x);
  if (!candidates.length) return { index: -1, usage: null, candidates };
  const content = [
    ...images.flatMap((img, i) => [
      { type: 'text' as const, text: `Photo ${i}:` },
      { type: 'image' as const, source: { type: 'base64' as const, ...img } },
    ]),
    { type: 'text' as const, text: `Recipe: ${r.name}\nIngredients and method: ${recipeIngredientsLine(r)}. ${r.method}\nThe client can't eat: ${avoid}\n\nWhich photo (0–${candidates.length - 1}) shows this dish? Answer -1 if none do.` },
  ];
  const { data, usage } = await askClaude({ system: SYSTEM, prompt: content, schema: PickSchema, effort: 'low', maxTokens: 4000 });
  const index = Number.isInteger(data.best_index) && data.best_index >= 0 && data.best_index < candidates.length ? data.best_index : -1;
  return { index, usage, candidates };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

async function storePhoto(admin: Admin, planId: string, r: Recipe, c: Candidate): Promise<string> {
  const res = await fetch(c.full, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Couldn't download photo ${c.source} ${c.id} (${res.status})`);
  const type = res.headers.get('content-type') ?? 'image/jpeg';
  if (!type.startsWith('image/')) throw new Error(`Photo ${c.source} ${c.id} is not an image`);
  const path = `${planId}/${slug(r.name)}-${c.source}-${c.id}.${type.includes('png') ? 'png' : 'jpg'}`;
  const { error } = await admin.storage.from(PHOTO_BUCKET).upload(path, await res.arrayBuffer(), { contentType: type, upsert: true });
  if (error) throw error;
  return admin.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Finds, checks and stores a photo for one recipe; null when nothing suitable exists. */
export async function findPhoto(admin: Admin, planId: string, r: Recipe, rules: FoodRules, usage: ClaudeUsage[]): Promise<ChosenPhoto | null> {
  const seen = new Set<string>();
  for (const q of queriesFor(r)) {
    const found = [...(await searchPexels(q).catch(() => [])), ...(await searchPixabay(q))];
    const candidates = found.filter((c) => !seen.has(`${c.source}${c.id}`)).slice(0, 8);
    candidates.forEach((c) => seen.add(`${c.source}${c.id}`));
    if (!candidates.length) continue;
    const pick = await pickPhoto(r, candidates, rules);
    if (pick.usage) usage.push(pick.usage);
    if (pick.index < 0) continue;
    const c = pick.candidates[pick.index];
    return { url: await storePhoto(admin, planId, r, c), source: c.source, sourceId: c.id, pageUrl: c.pageUrl, photographer: c.photographer };
  }
  return null;
}
