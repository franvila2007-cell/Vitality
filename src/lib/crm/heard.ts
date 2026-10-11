import type { Answers, Question } from '@/lib/assessment/questions';
import { HEARD_TO_SOURCE } from '@/lib/crm/joinQuestions';

// "Where did you hear about us?" — asked on the Vitality onboarding
// assessment and the Vitality meal-plan form so every lead in the pipeline
// carries its channel. Same options as the /join form, so the answers line up
// in the CRM's source breakdown.
export const HEARD_OPTIONS = ['Instagram', 'TikTok', 'Facebook', 'A friend', 'Google', 'IronBodyFit', 'Other'];

export const HEARD_QUESTIONS: Question[] = [
  { id: 'heard', type: 'choice', label: 'Where did you hear about us?', required: true, options: HEARD_OPTIONS },
  { id: 'heard_friend', type: 'text', label: 'Who told you about us?', hint: "So we can say thank you.", placeholder: 'Their name', when: { id: 'heard', is: 'A friend' } },
  { id: 'heard_other', type: 'text', label: 'Where did you hear about us?', placeholder: 'e.g. a gym, an event, a podcast', when: { id: 'heard', is: 'Other' } },
];

// What a submission's answer means for the CRM: the contact's source channel
// (when it maps to one), a short phrase for the timeline, and the raw answers
// to keep on the activity.
export function heardInfo(answers: Answers): { source?: string; phrase: string | null; extra: Record<string, string> } {
  const heard = typeof answers.heard === 'string' ? answers.heard : '';
  if (!heard) return { phrase: null, extra: {} };
  const friend = typeof answers.heard_friend === 'string' ? answers.heard_friend.trim() : '';
  const other = typeof answers.heard_other === 'string' ? answers.heard_other.trim() : '';
  const detail = heard === 'A friend' ? friend : heard === 'Other' ? other : '';
  const phrase = heard === 'A friend'
    ? `heard about us from a friend${friend ? ` (${friend})` : ''}`
    : heard === 'Other'
      ? `heard about us: ${other || 'other'}`
      : `heard about us via ${heard}`;
  return { source: HEARD_TO_SOURCE[heard], phrase, extra: { heard, ...(detail ? { heard_detail: detail } : {}) } };
}
