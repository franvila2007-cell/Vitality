// Checks the micronutrient/quality rater: awkward answers and the background backfill. No real AI (fake client).   npx tsx scripts/vitto-insights-test.ts
import { createClient } from '@supabase/supabase-js';
import { llmEstimateFoodInsights, tidyFoodName, MICRO_KEYS, type InsightsClient } from '../src/lib/vitto/llmFallback';
import { runMicroBackfill } from '../src/lib/microBackfill';

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };

const obj = (q: number, v = 1) => ({ quality_score: q, ...Object.fromEntries(MICRO_KEYS.map((k) => [k, v])) });
type Reply = string | Error;
// A fake AI: replies in order, and records what it was asked.
function fake(replies: Reply[]): { client: InsightsClient; asked: string[] } {
  const asked: string[] = []; let i = 0;
  const client = { messages: { create: async (args: { messages: { content: unknown }[] }) => {
    asked.push(String(args.messages[0].content));
    const r = replies[Math.min(i++, replies.length - 1)];
    if (r instanceof Error) throw r;
    return { content: [{ type: 'text', text: r }] };
  } } } as unknown as InsightsClient;
  return { client, asked };
}
const items = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `food ${i + 1}`, calories: 100 }));
const json = (arr: unknown[]) => JSON.stringify({ items: arr });

(async () => {
  eq('tidy: zero-width + line breaks + length', [tidyFoodName('​50g milk\n\n  ​with  eggs'), tidyFoodName('x'.repeat(500)).length, tidyFoodName('  ​ ')], ['50g milk with eggs', 300, 'food']);

  const ok = fake([json([obj(80), obj(60), obj(40)])]);
  const a = await llmEstimateFoodInsights(items(3), 'k', ok.client);
  eq('well-behaved batch: one call, results in order', [ok.asked.length, a!.map((x) => x!.quality_score)], [1, [80, 60, 40]]);

  // AI splits one entry into two objects → 4 results for 3 entries → rate each on its own
  const split = fake([json([obj(80), obj(60), obj(40), obj(20)]), json([obj(91)]), json([obj(70, 2), obj(50, 4)]), json([obj(30)])]);
  const b = await llmEstimateFoodInsights(items(3), 'k', split.client);
  eq('mismatched count → falls back to one-by-one (1 batch + 3 singles)', split.asked.length, 4);
  eq('…each entry gets its own rating; a split entry is combined (mean quality, summed micros)', [b!.map((x) => x!.quality_score), b![1]!.iron_mg], [[91, 60, 30], 6]);

  const bad = fake(['not json at all', json([obj(55)]), 'still not json', json([obj(33)])]);
  const c = await llmEstimateFoodInsights(items(3), 'k', bad.client);
  eq('unparseable batch → singles; the one that stays unusable is left blank, the rest filled', [c!.map((x) => x?.quality_score ?? null)], [[55, null, 33]]);

  const down = fake([new Error('overloaded')]);
  eq('AI service down → null, no pointless retries', [await llmEstimateFoodInsights(items(3), 'k', down.client), down.asked.length], [null, 1]);

  const one = fake([json([obj(80, 1), obj(60, 3), obj(40, 2)])]);
  const d = await llmEstimateFoodInsights([{ name: 'milk, eggs and muesli', calories: 500 }], 'k', one.client);
  eq('a single entry listing several foods: combined, not dropped', [d!.length, d![0]!.quality_score, d![0]!.calcium_mg], [1, 60, 6]);

  const fenced = fake(['```json\n' + json([obj(77)]) + '\n```']);
  eq('fenced JSON still parses', (await llmEstimateFoodInsights(items(1), 'k', fenced.client))![0]!.quality_score, 77);

  // ── background backfill against the real DB, restricted to a throwaway user ──
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const E = 'zz-backfill@vitality.local';
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 200 });
  const old = users!.users.find((x) => x.email === E); if (old) { await sb.from('food_log_entries').delete().eq('user_id', old.id); await sb.auth.admin.deleteUser(old.id); }
  const uid = (await sb.auth.admin.createUser({ email: E, password: 'Tmp-' + Math.random().toString(36).slice(2) + 'Aa1!', email_confirm: true, user_metadata: { role: 'client', full_name: 'ZZ Backfill' } })).data.user!.id;
  const mk = async (name: string, minsAgo: number, rated = false) => (await sb.from('food_log_entries').insert({ user_id: uid, date: new Date().toISOString().slice(0, 10), name, calories: 200, protein_g: 10, carbs_g: 20, fat_g: 5, source: 'manual', logged_at: new Date(Date.now() - minsAgo * 60000).toISOString(), ...(rated ? { quality_score: 99 } : {}) }).select('id').single()).data!.id as string;
  const A = await mk('long pasted line milk eggs', 30), B = await mk('toast', 20), C = await mk('just logged', 0), D = await mk('already rated', 60, true);
  const get = async (id: string) => (await sb.from('food_log_entries').select('quality_score, iron_mg').eq('id', id).single()).data!;
  const prev = (await sb.from('coach_settings').select('micro_backfill_last_run_at').eq('id', 1).single()).data!.micro_backfill_last_run_at;

  const f1 = fake([json([obj(70), obj(80)])]);
  const r1 = await runMicroBackfill({ admin: sb, apiKey: 'k', client: f1.client, onlyUser: uid, throttleMs: 0 });
  eq('backfill fills the blank entries that are old enough (not the one logged seconds ago, not the rated one)', [r1.checked, r1.filled, (await get(A)).quality_score !== null, (await get(B)).quality_score !== null, (await get(C)).quality_score, (await get(D)).quality_score], [2, 2, true, true, null, 99]);
  eq('the micronutrients are filled too', (await get(A)).iron_mg !== null, true);
  const r2 = await runMicroBackfill({ admin: sb, apiKey: 'k', client: fake([json([obj(1)])]).client, onlyUser: uid, throttleMs: 0 });
  eq('a second run finds nothing left to do', [r2.checked, r2.filled], [0, 0]);
  const r3 = await runMicroBackfill({ admin: sb, apiKey: 'k', client: fake([json([obj(1)])]).client, onlyUser: uid, throttleMs: 60 * 60000 });
  eq('throttled: a call right after another does nothing', r3.skipped, 'recent');

  await sb.from('food_log_entries').delete().eq('user_id', uid); await sb.auth.admin.deleteUser(uid);
  await sb.from('coach_settings').update({ micro_backfill_last_run_at: prev }).eq('id', 1);
  console.log(fail ? `\n${fail} FAILED` : '\nall passed'); process.exit(fail ? 1 : 0);
})();
