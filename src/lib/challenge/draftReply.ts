import Anthropic from '@anthropic-ai/sdk';
import type { ChallengeCheckinRow } from '@/lib/supabase/database.types';
import { describeCheckin } from './describe';
import type { ChallengeMember } from './members';

// Server-only: Claude drafts the coach's WhatsApp reply to one check-in, in
// Fran's voice. Used by /api/coach/challenge/draft-reply; nothing is sent.

const SYSTEM = `You write WhatsApp replies to 8-Week Challenge members' weekly check-ins, as Fran, their Vitality coach in Malta.

Fran's voice: casual, direct and warm, like a coach who knows them. British spelling. Short sentences. At most one emoji, and only if it fits.

Every reply:
- Maximum 5 lines, including the sign-off.
- Names one specific win from this week, using their own details (a number, a habit, something they wrote).
- Gives one clear, practical focus for next week, tied to what they found hard or asked for.
- Ends with a new line saying just "Fran".
- Never uses em dashes or en dashes. Use commas or full stops instead.
- Never shames, lectures or sounds clinical. No medical advice; if something sounds medical, suggest they check with their doctor.
- If weight went the "wrong" way, don't dwell on it; focus on behaviours.

Write only the message text, ready to paste into WhatsApp.`;

export async function draftReply(member: Pick<ChallengeMember, 'name' | 'goal' | 'startWeight' | 'checkins'>, checkin: ChallengeCheckinRow): Promise<{ text: string } | { error: string }> {
  const earlier = member.checkins.filter((c) => c.week_number < checkin.week_number);
  const prev = earlier.at(-1);
  const facts = [
    `Member: ${member.name.split(/\s+/)[0]} (goal: ${member.goal ?? 'not set'})`,
    `Week ${checkin.week_number} of 8. Check-ins done so far: ${new Set(member.checkins.map((c) => c.week_number)).size}.`,
    member.startWeight != null ? `Starting weight: ${member.startWeight} kg.` : '',
    prev ? `Last check-in (week ${prev.week_number}): ${[prev.weight_kg != null ? `${prev.weight_kg} kg` : '', prev.waist_cm != null ? `waist ${prev.waist_cm} cm` : '', prev.feeling != null ? `feeling ${prev.feeling}/10` : ''].filter(Boolean).join(', ') || 'no measurements'}.` : 'This is their first check-in.',
    '',
    'This week:',
    ...describeCheckin(checkin).flatMap((s) => s.items.map(([k, v]) => `- ${k}: ${v}`)),
    checkin.photo_paths.length ? `- Sent ${checkin.photo_paths.length} progress photo(s).` : '',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');

  const client = new Anthropic();
  const response = await client.beta.messages.create(
    {
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: SYSTEM,
      messages: [{ role: 'user', content: `Draft Fran's reply to this check-in.\n\n${facts}` }],
    },
    { timeout: 50_000 },
  );
  if (response.stop_reason === 'refusal') return { error: "Claude couldn't draft this one. Write it yourself this time." };
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
    // Belt and braces: Fran never uses dashes as punctuation.
    .replace(/\s*[—–]\s*/g, ', ');
  return text ? { text } : { error: 'The draft came back empty. Try again.' };
}
