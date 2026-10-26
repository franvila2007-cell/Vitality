import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { EMAIL_RE } from '@/lib/challenge/checkin';
import { crmNameFor, findMember, firstName, weekFor } from '@/lib/challenge/member';

// Public: the check-in's first screen. Recognises a member by email (then
// phone) and says what the form still needs to ask. Only ever returns a
// first name, goal and week number — nothing else about the member.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: unknown; phone?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const phone = typeof body?.phone === 'string' ? body.phone.trim().slice(0, 40) : '';
  if (!EMAIL_RE.test(email) || email.length > 254) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });

  const admin = createAdminClient();
  const member = await findMember(admin, email, phone || null);
  if (member?.goal) {
    return NextResponse.json({ status: 'ok', firstName: firstName(member.fullName), goal: member.goal, week: weekFor(member), known: !!member.intakeId });
  }
  if (!member && !phone) return NextResponse.json({ status: 'need_phone' });
  // Not found even by phone (or found without a goal): ask the goal once.
  const name = member?.fullName ?? (await crmNameFor(admin, email, phone));
  return NextResponse.json({ status: 'need_goal', firstName: firstName(name), needName: !name, week: weekFor(member) });
}
