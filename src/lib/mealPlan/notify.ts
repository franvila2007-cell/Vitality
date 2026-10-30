// Emails the coach about automated meal plans, through Resend:
//   generated    → "<Name>" + the Gamma link, ready to adjust and send
//   needs_review → the plan couldn't be finished automatically, and why
//   failed       → the build kept erroring
// Each plan is emailed once (meal_plans.notified_at). Sent to NOTIFY_EMAIL
// from Resend's shared sender, which on the free plan can only deliver to
// the Resend account's own address. Server-only.
import type { createAdminClient } from '@/lib/supabase/admin';
import type { PlanState } from './pipeline';
import type { Issue } from './validate';
import { ibfLocation } from './questions';
import type { Answers } from '@/lib/assessment/questions';

type Admin = ReturnType<typeof createAdminClient>;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export async function sendCoachEmail(subject: string, html: string, text: string, opts: { to?: string; from?: string } = {}): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const to = opts.to ?? process.env.NOTIFY_EMAIL;
  if (!key || !to) throw new Error('RESEND_API_KEY or NOTIFY_EMAIL is not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: opts.from ?? 'Vitality Meal Plans <onboarding@resend.dev>', to: [to], subject, html, text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend rejected the email (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

function summary(state: PlanState): string {
  const t = state.targets;
  if (!t) return '';
  return `${t.meals.length} meals a day · ${t.targetKcal} kcal (maintenance ${t.maintenanceKcal}) · Protein ${t.protein} g · Carbs ${t.carbs} g · Fat ${t.fat} g`;
}

function emailFor(row: { status: string; gamma_url: string | null; issues: unknown; state: unknown; last_error: string | null; request_id: string }, name: string, appUrl: string) {
  const state = row.state as PlanState;
  const issues = (row.issues ?? []) as Issue[];
  const review = issues.filter((i) => i.level === 'review').map((i) => i.message);
  const blockers = issues.filter((i) => i.level === 'blocker').map((i) => i.message);
  const note = state.intake?.rules.exclusionNote;
  const testPage = `${appUrl}/coach/meal-plans/test/${row.request_id}`;

  if (row.status === 'generated' && row.gamma_url) {
    const lines = [summary(state), note ?? '', ...(review.length ? ['', 'Please check before sending:', ...review.map((r) => `- ${r}`)] : ['', 'All checks passed.'])].filter((l, i) => l || i > 0);
    return {
      subject: `New IronBody Fit meal plan: ${name}`,
      text: `${name}\n${row.gamma_url}\n\n${lines.join('\n')}\n\nAdjust anything you like in Gamma, then send it to them.`,
      html: `<h2 style="margin:0 0 4px">${esc(name)}</h2><p style="margin:0 0 16px"><a href="${esc(row.gamma_url)}">${esc(row.gamma_url)}</a></p><p>${esc(summary(state))}${note ? `<br>${esc(note)}` : ''}</p>${review.length ? `<p><b>Please check before sending:</b></p><ul>${review.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '<p>All checks passed.</p>'}<p>Adjust anything you like in Gamma, then send it to them.</p>`,
    };
  }
  const reasons = row.status === 'failed' ? [row.last_error ?? 'The build kept failing.'] : blockers.length ? blockers : review;
  return {
    subject: `Meal plan needs your attention: ${name}`,
    text: `${name}\nThe plan couldn't be made automatically, so nothing was sent to Gamma:\n${reasons.map((r) => `- ${r}`).join('\n')}\n\nSee the plan: ${testPage}`,
    html: `<h2 style="margin:0 0 4px">${esc(name)}</h2><p>The plan couldn't be made automatically, so nothing was sent to Gamma:</p><ul>${reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul><p><a href="${esc(testPage)}">See the plan</a></p>`,
  };
}

/** Emails every plan that has reached an end state and hasn't been emailed yet. */
export async function notifyPlans(admin: Admin, appUrl: string): Promise<number> {
  const { data: rows } = await admin.from('meal_plans')
    .select('id, request_id, status, gamma_url, issues, state, last_error')
    .is('notified_at', null).in('status', ['generated', 'needs_review', 'failed'])
    .order('updated_at').limit(10);
  let sent = 0;
  for (const row of rows ?? []) {
    const { data: request } = await admin.from('meal_plan_requests').select('full_name, answers').eq('id', row.request_id).single();
    // "Maria Borg (Sliema)" — which IronBodyFit they train at, when the form asked.
    const location = ibfLocation(request?.answers as Answers | undefined);
    const name = `${request?.full_name ?? 'A client'}${location ? ` (${location})` : ''}`;
    const { subject, html, text } = emailFor(row, name, appUrl);
    try {
      // Claim first so two workers never send the same email twice.
      const { data: claimed } = await admin.from('meal_plans').update({ notified_at: new Date().toISOString() }).eq('id', row.id).is('notified_at', null).select('id').maybeSingle();
      if (!claimed) continue;
      await sendCoachEmail(subject, html, text);
      sent++;
    } catch (err) {
      console.error('meal plan email failed', { planId: row.id, message: err instanceof Error ? err.message : String(err) });
      await admin.from('meal_plans').update({ notified_at: null }).eq('id', row.id);
    }
  }
  return sent;
}

const GAMMA_WAIT_HOURS = 2;

/**
 * One warning email when plans have been ready for more than a couple of
 * hours but still have no Gamma — usually the Gamma connection to Claude has
 * expired and the hourly task can't log in. Each plan is warned about once.
 */
export async function alertWaitingForGamma(admin: Admin): Promise<number> {
  const before = new Date(Date.now() - GAMMA_WAIT_HOURS * 3600_000).toISOString();
  const { data: rows } = await admin.from('meal_plans')
    .select('id, request_id, last_error')
    .in('status', ['ready', 'generating']).is('gamma_url', null).is('gamma_wait_alerted_at', null)
    .lt('created_at', before).limit(20);
  if (!rows?.length) return 0;
  const { data: claimed } = await admin.from('meal_plans').update({ gamma_wait_alerted_at: new Date().toISOString() })
    .in('id', rows.map((r) => r.id)).is('gamma_wait_alerted_at', null).select('id, request_id, last_error');
  if (!claimed?.length) return 0;
  const { data: requests } = await admin.from('meal_plan_requests').select('id, full_name').in('id', claimed.map((r) => r.request_id));
  const names = claimed.map((r) => requests?.find((q) => q.id === r.request_id)?.full_name ?? 'A client');
  const reason = claimed.find((r) => r.last_error)?.last_error;
  const fix = 'Reconnect Gamma at https://claude.ai/customize/connectors — the plans are built and will go to Gamma at the next hourly run.';
  try {
    await sendCoachEmail(
      `${claimed.length} meal ${claimed.length === 1 ? 'plan is' : 'plans are'} waiting for Gamma`,
      `<p>These plans have been ready for over ${GAMMA_WAIT_HOURS} hours but haven't been made in Gamma yet:</p><ul>${names.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>${reason ? `<p>Last problem: ${esc(reason)}</p>` : ''}<p>${esc(fix)}</p>`,
      `These plans have been ready for over ${GAMMA_WAIT_HOURS} hours but haven't been made in Gamma yet:\n${names.map((n) => `- ${n}`).join('\n')}\n${reason ? `\nLast problem: ${reason}\n` : ''}\n${fix}`,
    );
    return claimed.length;
  } catch (err) {
    console.error('Gamma wait alert failed', { message: err instanceof Error ? err.message : String(err) });
    await admin.from('meal_plans').update({ gamma_wait_alerted_at: null }).in('id', claimed.map((r) => r.id));
    return 0;
  }
}
