import type { Section } from '@/lib/assessment/questions';

// The public /join lead form — short on purpose: enough to follow up, nothing
// more. Submissions go straight into the CRM (no separate inbox).
export const JOIN_SECTIONS: Section[] = [
  {
    id: 'join',
    title: 'Get started',
    questions: [
      { id: 'full_name', type: 'text', label: 'Name and surname', required: true, autoComplete: 'name' },
      { id: 'email', type: 'email', label: 'Email', required: true, autoComplete: 'email', half: true },
      { id: 'phone', type: 'tel', label: 'Phone / WhatsApp', required: true, autoComplete: 'tel', placeholder: '+356', half: true },
      {
        id: 'goal', type: 'choice', label: 'What would you like help with?', required: true,
        options: ['Lose fat', 'Build muscle', 'Lose fat & build muscle', 'Eat healthier', 'More energy', 'Something else'],
      },
      {
        id: 'interest', type: 'choice', label: "What are you interested in?", required: true,
        options: ['1-1 coaching', 'A meal plan', 'Not sure yet'],
      },
      { id: 'heard', type: 'choice', label: 'How did you hear about Vitality?', options: ['Instagram', 'TikTok', 'Facebook', 'A friend', 'Google', 'IronBodyFit', 'Other'] },
      { id: 'message', type: 'textarea', label: 'Anything you’d like us to know?', placeholder: 'Your goals, your schedule, questions…' },
    ],
  },
];

// "How did you hear" answer → CRM source, used when the link had no ?src=.
export const HEARD_TO_SOURCE: Record<string, string> = {
  Instagram: 'instagram', TikTok: 'tiktok', Facebook: 'facebook', 'A friend': 'referral',
  Google: 'website', IronBodyFit: 'ironbodyfit',
};
