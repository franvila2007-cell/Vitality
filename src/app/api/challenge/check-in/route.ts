import { NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanSubmission, type Answers } from '@/lib/assessment/questions';
import { recordFunnelEvent } from '@/lib/crm/ingest';
import { sendCoachEmail } from '@/lib/mealPlan/notify';
import { checkinSections, CHECKIN_GOALS, COLUMN_ANSWERS, EMAIL_RE, maltaToday, PHOTO_SLOTS, type CheckinGoal } from '@/lib/challenge/checkin';
import { findMember } from '@/lib/challenge/member';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COACH_EMAIL = 'francescovila@vitalitymalta.com';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// Public (no login): 8-Week Challenge weekly check-in from the one shared
// link. The member is re-identified here (never trusted from the browser),
// answers are re-validated against their goal's questions, and the row is
// saved with the service-role key (challenge_checkins has no public
// policies). Then, after the response: a CRM timeline entry and an email
// summary to the coach — neither can fail the check-in.
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 100_000) return NextResponse.json({ error: 'Submission too large.' }, { status: 413 });
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }

  // Honeypot: bots get a fake success.
  if (typeof body.company === 'string' && body.company.trim() !== '') return NextResponse.json({ ok: true });

  const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const submissionId = str(body.submissionId).toLowerCase();
  const email = str(body.email).toLowerCase();
  const phone = str(body.phone, 40);
  const week = Number(body.week);
  if (!UUID_RE.test(submissionId) || !EMAIL_RE.test(email) || !Number.isInteger(week) || week < 1 || week > 8) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const member = await findMember(admin, email, phone || null);
  const givenGoal = (CHECKIN_GOALS as readonly string[]).includes(str(body.goal)) ? (str(body.goal) as CheckinGoal) : null;
  const goal = member?.goal ?? givenGoal;
  if (!goal) return NextResponse.json({ error: "Please tell us your main goal for the 8 weeks." }, { status: 422 });

  const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? (body.answers as Answers) : {};
  const { clean, errors, firstErrorSection } = cleanSubmission(checkinSections(goal), answers);
  if (firstErrorSection !== -1) return NextResponse.json({ error: 'Some answers need a quick look.', errors, section: firstErrorSection }, { status: 422 });

  const photoRe = new RegExp(`^${submissionId}/(${PHOTO_SLOTS.join('|')})\\.(jpg|png|webp|heic|heif)$`);
  const photoPaths = Array.isArray(body.photoPaths) ? body.photoPaths.filter((p): p is string => typeof p === 'string' && photoRe.test(p)).slice(0, 3) : [];

  // Remember the goal for members with no intake (or matched by phone), so
  // the form never asks again. An existing row is left as it is.
  if (!member?.hasSavedGoal && (!member?.intakeId || member.email !== email)) {
    const startWeight = Number(str(body.startWeight, 10).replace(',', '.'));
    await admin.from('challenge_member_goals').upsert({
      email,
      goal,
      start_weight_kg: member?.startWeight ?? (startWeight >= 35 && startWeight <= 300 ? Math.round(startWeight * 10) / 10 : null),
      start_date: member?.startDate ?? maltaToday(),
      full_name: member?.fullName ?? (str(body.fullName, 120) || null),
      phone: member?.phone ?? (phone || null),
      intake_id: member?.intakeId ?? null,
    }, { onConflict: 'email', ignoreDuplicates: true });
  }

  const fullName = member?.fullName ?? (str(body.fullName, 120) || null);
  const needsReview = !member?.intakeId;
  const num = (v: unknown) => (typeof v === 'string' && v !== '' ? Number(v) : null);
  const goalAnswers = Object.fromEntries(Object.entries(clean).filter(([k]) => !COLUMN_ANSWERS.includes(k)));
  const row = {
    submission_id: submissionId,
    intake_id: member?.intakeId ?? null,
    crm_contact_id: member?.crmContactId ?? null,
    email,
    phone: member?.phone ?? (phone || null),
    full_name: fullName,
    goal,
    week_number: week,
    weight_kg: num(clean.weight),
    waist_cm: num(clean.waist),
    feeling: num(clean.feeling),
    answers: goalAnswers,
    biggest_win: clean.biggest_win as string,
    hardest: (clean.hardest as string) ?? null,
    need_from_us: (clean.need_from_us as string) ?? null,
    photo_paths: photoPaths,
    needs_review: needsReview,
  };
  const { error } = await admin.from('challenge_checkins').upsert(row, { onConflict: 'submission_id', ignoreDuplicates: true });
  if (error) {
    console.error('challenge check-in insert failed', error);
    return NextResponse.json({ error: "We couldn't save your check-in. Please try again in a moment, your answers are still here." }, { status: 500 });
  }

  after(async () => {
    const contactId = await recordFunnelEvent(admin, {
      fullName: fullName ?? email, email: member?.email ?? email, phone: row.phone,
      source: 'challenge', brand: 'vitality', form: 'challenge_checkin', submissionId,
      matchPhone: true, addTags: ['8-week-challenge'],
      summary: `Week ${week} check-in submitted${needsReview ? ' (no intake found, needs review)' : ''}`,
    });
    if (contactId && contactId !== row.crm_contact_id) {
      await admin.from('challenge_checkins').update({ crm_contact_id: contactId }).eq('submission_id', submissionId);
    }
    try {
      const { subject, html, text } = summaryEmail(row, clean, checkinSections(goal));
      const from = 'Vitality Challenge <onboarding@resend.dev>';
      try {
        await sendCoachEmail(subject, html, text, { to: COACH_EMAIL, from });
      } catch (err) {
        // Resend's shared sender (free plan) only delivers to the account's own
        // address (NOTIFY_EMAIL) — fall back to it so the summary still arrives.
        if (!process.env.NOTIFY_EMAIL || process.env.NOTIFY_EMAIL.toLowerCase() === COACH_EMAIL) throw err;
        console.warn('challenge check-in email to coach address failed, using NOTIFY_EMAIL', err instanceof Error ? err.message : err);
        await sendCoachEmail(subject, html, text, { from });
      }
    } catch (err) {
      console.error('challenge check-in email failed', err instanceof Error ? err.message : err);
    }
  });
  return NextResponse.json({ ok: true });
}

function summaryEmail(
  row: { full_name: string | null; email: string; phone: string | null; goal: string; week_number: number; photo_paths: string[]; needs_review: boolean },
  clean: Answers,
  sections: ReturnType<typeof checkinSections>,
) {
  const name = row.full_name ?? row.email;
  const lines: [string, string][] = [];
  for (const s of sections) {
    for (const q of s.questions) {
      const v = clean[q.id];
      if (v === undefined) continue;
      const val = `${Array.isArray(v) ? v.join(', ') : v}${q.type === 'scale' ? '/10' : q.unit === '%' ? '%' : q.unit ? ` ${q.unit}` : ''}`;
      lines.push([q.label, val]);
    }
  }
  lines.push(['Photos', row.photo_paths.length ? `${row.photo_paths.length} uploaded (${row.photo_paths.map((p) => p.split('/')[1].split('.')[0]).join(', ')})` : 'None']);
  const head = [`${row.goal} · ${row.email}${row.phone ? ` · ${row.phone}` : ''}`, row.needs_review ? 'No intake found for this member: needs review.' : ''].filter(Boolean);
  return {
    subject: `Week ${row.week_number} check-in: ${name}${row.needs_review ? ' (needs review)' : ''}`,
    text: `${name}\n${head.join('\n')}\n\n${lines.map(([k, v]) => `${k}: ${v}`).join('\n')}`,
    html: `<h2 style="margin:0 0 4px">${esc(name)} · Week ${row.week_number}</h2>${head.map((h) => `<p style="margin:0 0 4px">${esc(h)}</p>`).join('')}<table style="margin-top:16px;border-collapse:collapse">${lines
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">${esc(k)}</td><td style="padding:4px 0;white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}</table>`,
  };
}
