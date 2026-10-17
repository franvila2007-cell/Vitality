import type { Answers, Section } from '@/lib/assessment/questions';

// Vitality 8-Week Challenge intake (/challenge/intake) — temporary, for the
// October 2026 cohort. The form renders from this, /api/challenge/intake
// re-validates against it, and /coach/challenge prints answers back from it.

export const CHALLENGE_COHORT = 'oct-2026';

const AGREE = ['I agree'];

export const CHALLENGE_SECTIONS: Section[] = [
  {
    id: 'about',
    title: 'About you',
    questions: [
      { id: 'full_name', type: 'text', label: 'Full name', required: true, autoComplete: 'name' },
      { id: 'age', type: 'number', label: 'Age', required: true, unit: 'years', min: 16, max: 90 },
      { id: 'phone', type: 'tel', label: 'WhatsApp number', required: true, autoComplete: 'tel', placeholder: '+356 7900 0000' },
      { id: 'email', type: 'email', label: 'Email', required: true, autoComplete: 'email' },
      { id: 'instagram', type: 'text', label: 'Instagram handle', placeholder: '@yourname' },
    ],
  },
  {
    id: 'goals',
    title: "Where you're at",
    questions: [
      { id: 'height', type: 'number', label: 'Height', required: true, unit: 'cm', min: 120, max: 230, half: true },
      { id: 'weight', type: 'number', label: 'Current weight', required: true, unit: 'kg', min: 35, max: 300, step: 0.1, half: true },
      {
        id: 'main_goal', type: 'choice', label: 'Main goal', required: true,
        options: ['Lose fat', 'Build muscle', 'Both', 'Feel healthier and more energised', 'Other'],
      },
      { id: 'main_goal_other', type: 'text', label: 'Tell us your goal', required: true, when: { id: 'main_goal', is: 'Other' } },
      { id: 'win', type: 'textarea', label: 'What would make these 8 weeks a win for you?', required: true },
      { id: 'stopped_before', type: 'textarea', label: "What's stopped you getting there before?", required: true },
    ],
  },
  {
    id: 'lifestyle',
    title: 'Your lifestyle',
    questions: [
      { id: 'schedule', type: 'textarea', label: 'Your job and daily schedule', required: true, placeholder: 'e.g. Office job 9–5, gym after work, kids at home in the evening' },
      { id: 'training_days', type: 'choice', label: 'Training days per week', required: true, options: ['1-2', '3', '4', '5+'] },
      { id: 'train_where', type: 'choice', label: 'Where do you train?', required: true, options: ['Gym', 'Home', 'Both', 'Not training yet'] },
      { id: 'sleep', type: 'choice', label: 'Average sleep per night', required: true, options: ['<6h', '6-7h', '7-8h', '8h+'] },
      { id: 'stress', type: 'scale', label: 'Stress level', required: true, scaleLabels: ['Very calm', 'Very stressed'] },
      { id: 'alcohol', type: 'choice', label: 'Alcoholic drinks per week', required: true, options: ['None', '1-3', '4-7', '8+'] },
    ],
  },
  {
    id: 'food',
    title: 'Food',
    questions: [
      { id: 'meals_per_day', type: 'choice', label: 'Meals per day', required: true, options: ['1', '2', '3', '4', '5+'] },
      { id: 'cook_or_out', type: 'choice', label: 'Do you cook or mostly eat out?', required: true, options: ['Mostly cook', 'A mix of both', 'Mostly eat out'] },
      { id: 'foods_love', type: 'textarea', label: 'Foods you love' },
      { id: 'foods_wont', type: 'textarea', label: "Foods you won't eat" },
      { id: 'dietary', type: 'text', label: 'Dietary choices', placeholder: 'e.g. vegetarian, halal' },
      { id: 'allergies', type: 'text', label: 'Food allergies or intolerances' },
    ],
  },
  {
    id: 'health',
    title: 'Health',
    intro: 'This helps us coach you safely. Vitality provides coaching and education, not medical advice.',
    questions: [
      { id: 'conditions', type: 'yesno', label: 'Do you have any medical conditions?', required: true },
      { id: 'conditions_detail', type: 'textarea', label: 'Please tell us more', required: true, when: { id: 'conditions', is: 'Yes' } },
      { id: 'medication', type: 'yesno', label: 'Are you taking any medication?', required: true },
      { id: 'medication_detail', type: 'textarea', label: 'Which medication?', required: true, when: { id: 'medication', is: 'Yes' } },
      { id: 'injuries', type: 'yesno', label: 'Any injuries or pain that affect your training?', required: true },
      { id: 'injuries_detail', type: 'textarea', label: 'Please tell us more', required: true, when: { id: 'injuries', is: 'Yes' } },
      { id: 'doctor_avoid', type: 'yesno', label: 'Has a doctor told you to avoid exercise or any diet?', required: true },
      { id: 'doctor_avoid_detail', type: 'textarea', label: 'Please tell us more', when: { id: 'doctor_avoid', is: 'Yes' } },
      { id: 'pregnant', type: 'choice', label: 'Are you pregnant or breastfeeding?', required: true, options: ['Yes', 'No', 'Prefer not to say'] },
    ],
  },
  {
    id: 'agreement',
    title: 'Agreement',
    intro: 'Please read and tick each one.',
    questions: [
      { id: 'agree_medical', type: 'choice', options: AGREE, required: true, label: "I understand Vitality provides coaching and education, not medical advice. If I answered yes to any health question, I'll check with my doctor before starting." },
      { id: 'agree_guarantee', type: 'choice', options: AGREE, required: true, label: 'Guarantee: to qualify for 4 extra weeks free, I need to log in the app on at least 80% of days, submit all 8 weekly check-ins, and attend or watch at least 6 of the 8 webinars.' },
      { id: 'agree_health_data', type: 'choice', options: AGREE, required: true, label: 'I consent to Vitality storing my health information to coach me during the challenge.' },
      { id: 'agree_photos', type: 'choice', options: AGREE, required: true, label: 'My photos and results stay private and are only shared (e.g. in the final vote) if I give separate permission.' },
    ],
  },
];

export const AGREEMENT_IDS = CHALLENGE_SECTIONS[CHALLENGE_SECTIONS.length - 1].questions.map((q) => q.id);

// The questions behind the red health badge in the coach app.
export const HEALTH_FLAG_IDS = ['conditions', 'medication', 'injuries', 'doctor_avoid', 'pregnant'];

export function hasHealthFlag(answers: Answers): boolean {
  return HEALTH_FLAG_IDS.some((id) => answers[id] === 'Yes');
}

// Strip "@" and any instagram.com/ prefix so the coach app can link it.
export function instagramHandle(raw: string | undefined): string | null {
  const h = (raw ?? '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/.*$/, '');
  return h ? h : null;
}
