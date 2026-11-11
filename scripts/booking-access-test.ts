// Who may book calls: 1-1 coaching clients by default, coach override wins.   npx tsx scripts/booking-access-test.ts
import { createClient } from '@supabase/supabase-js';
import { bookingAccess } from '../src/lib/bookingAccess';
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const mails = ['zz-acc-none', 'zz-acc-6m', 'zz-acc-12m', 'zz-acc-3m', 'zz-acc-chal', 'zz-acc-meal'].map((n) => `${n}@vitality.local`);
(async () => {
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 200 });
  for (const e of mails) { const u = users!.users.find((x) => x.email === e); if (u) { await sb.from('crm_contacts').delete().eq('client_id', u.id); await sb.auth.admin.deleteUser(u.id); } }
  const mk = async (email: string, pkg: string | null) => {
    const id = (await sb.auth.admin.createUser({ email, password: 'Tmp-' + Math.random().toString(36).slice(2) + 'Aa1!', email_confirm: true, user_metadata: { role: 'client', full_name: 'ZZ ' + email.split('@')[0] } })).data.user!.id;
    if (pkg !== null) await sb.from('crm_contacts').upsert({ full_name: 'ZZ ' + email, email: 'c-' + email, client_id: id, stage: 'won', package: pkg, source: 'other' }, { onConflict: 'email' });
    return id;
  };
  const none = await mk(mails[0], null), m6 = await mk(mails[1], '6_months'), m12 = await mk(mails[2], '12_months'), m3 = await mk(mails[3], '3_months'), chal = await mk(mails[4], '8_week_challenge'), meal = await mk(mails[5], 'meal_plan');
  const al = async (id: string) => { const r = await bookingAccess(sb, id); return [r.allowed, r.source]; };
  eq('no package → not allowed', await al(none), [false, 'none']);
  eq('6 months 1-1 → allowed', await al(m6), [true, 'package']);
  eq('1 year 1-1 → allowed', await al(m12), [true, 'package']);
  eq('3 months 1-1 → allowed', await al(m3), [true, 'package']);
  eq('8-Week Challenge → not allowed', await al(chal), [false, 'none']);
  eq('meal plan → not allowed', await al(meal), [false, 'none']);
  await sb.from('client_booking_access').upsert({ client_id: chal, allowed: true });
  eq('coach switches a challenge client ON → allowed', await al(chal), [true, 'coach']);
  await sb.from('client_booking_access').upsert({ client_id: m6, allowed: false });
  eq('coach switches a 1-1 client OFF → not allowed', await al(m6), [false, 'coach']);
  await sb.from('client_booking_access').delete().eq('client_id', m6);
  eq('back to automatic → allowed again', await al(m6), [true, 'package']);
  // a client can never change this for themselves
  const anon = createClient(process.env.SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  await anon.auth.signInWithPassword({ email: mails[0], password: 'wrong' }); // not signed in as anyone useful
  const sneak = await anon.from('client_booking_access').insert({ client_id: none, allowed: true });
  eq('signed-out/clients cannot write the table', sneak.error ? 'blocked' : 'OPEN', 'blocked');
  for (const e of mails) { const u = (await sb.auth.admin.listUsers({ perPage: 200 })).data.users.find((x) => x.email === e); if (u) { await sb.from('crm_contacts').delete().eq('client_id', u.id); await sb.auth.admin.deleteUser(u.id); } }
  console.log(fail ? `\n${fail} FAILED` : '\nall passed'); process.exit(fail ? 1 : 0);
})();
