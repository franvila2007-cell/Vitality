// Single source of truth for the onboarding assessment: the public form at
// /assessment renders from this, /api/assessment validates against it, and
// /coach/assessments uses it to print answers back in question order. Add,
// remove or reword a question here and all three follow.

export type QuestionType =
  | 'text' | 'email' | 'tel' | 'date' | 'number' | 'time' | 'textarea'
  | 'yesno' | 'choice' | 'multi' | 'scale' | 'note';

export type Question = {
  id: string;
  type: QuestionType;
  label: string;
  required?: boolean;
  options?: string[];
  // Only shown (and only validated/stored) when another answer matches.
  // For a multi-select answer this means "includes".
  when?: { id: string; is: string };
  hint?: string;
  placeholder?: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  scaleLabels?: [string, string];
  autoComplete?: string;
  // Sits side-by-side with the next `half` question on wider screens.
  half?: boolean;
  highlight?: boolean;
};

export type Section = {
  id: string;
  title: string;
  intro?: string;
  questions: Question[];
};

export type Answers = Record<string, string | string[]>;

const FREQ = ['Rarely', 'Sometimes', 'Often'];

export const SECTIONS: Section[] = [
  {
    id: 'about',
    title: 'About you',
    questions: [
      { id: 'full_name', type: 'text', label: 'Full name', required: true, autoComplete: 'name' },
      { id: 'email', type: 'email', label: 'Email', required: true, autoComplete: 'email' },
      { id: 'phone', type: 'tel', label: 'Phone number', required: true, autoComplete: 'tel', placeholder: '+356' },
      { id: 'dob', type: 'date', label: 'Date of birth', required: true, autoComplete: 'bday', half: true },
      { id: 'sex', type: 'choice', label: 'Sex', required: true, options: ['Female', 'Male'], half: true },
      { id: 'height', type: 'number', label: 'Height', required: true, unit: 'cm', min: 100, max: 250, half: true },
      { id: 'weight', type: 'number', label: 'Current weight', required: true, unit: 'kg', min: 30, max: 350, step: 0.1, half: true },
      { id: 'occupation', type: 'text', label: 'Occupation', required: true, autoComplete: 'organization-title' },
      { id: 'working_hours', type: 'text', label: 'Typical working hours', placeholder: 'e.g. Mon–Fri, 8:30–17:30' },
      { id: 'weekday', type: 'textarea', label: 'Give us a quick idea of what a normal weekday looks like for you.', placeholder: 'Wake up, commute, work, gym, family time…' },
    ],
  },
  {
    id: 'goals',
    title: 'Your goals',
    questions: [
      { id: 'main_result', type: 'textarea', label: 'What is the main result you want to achieve through Vitality?', required: true },
      {
        id: 'goals', type: 'multi', label: 'What are your main goals?', hint: 'Select all that apply.', required: true,
        options: ['Fat loss', 'Muscle gain', 'Body recomposition', 'Better energy', 'Better general health', 'Better relationship with food', 'Better digestion', 'Improved performance', 'Other'],
      },
      { id: 'goals_other', type: 'text', label: 'Tell us more about your other goal', when: { id: 'goals', is: 'Other' } },
      { id: 'goal_weight', type: 'number', label: 'If body weight is part of your goal, where would you ideally like to get to?', unit: 'kg', min: 30, max: 350, step: 0.1 },
      {
        id: 'timeframe', type: 'text', label: 'Do you have a timeframe in mind?', placeholder: 'e.g. by next summer, within 6 months',
        hint: "Don't worry about whether the timeframe is perfect. Your coach will discuss what's realistic with you during onboarding.",
      },
      { id: 'why_important', type: 'textarea', label: 'Why is achieving this important to you?', required: true },
      { id: 'why_now', type: 'textarea', label: 'Why now?' },
      { id: 'worth_it', type: 'textarea', label: 'What would need to happen for you to look back at your time with Vitality and say it was completely worth it?' },
      { id: 'goal_importance', type: 'scale', label: 'How important is achieving this goal to you?', required: true, scaleLabels: ['Nice to have', 'Extremely important'] },
    ],
  },
  {
    id: 'nutrition',
    title: 'Your nutrition',
    questions: [
      { id: 'meals_per_day', type: 'choice', label: 'How many meals do you normally eat per day?', required: true, options: ['1', '2', '3', '4', '5', '6+'] },
      { id: 'typical_day', type: 'textarea', label: 'Walk us through what you would normally eat on a typical day.', required: true, placeholder: 'Breakfast, lunch, dinner, snacks, drinks…' },
      { id: 'weekends_different', type: 'yesno', label: 'Are your weekends different from your weekdays?', required: true },
      { id: 'weekends_how', type: 'textarea', label: 'How?', when: { id: 'weekends_different', is: 'Yes' } },
      { id: 'tracks_now', type: 'yesno', label: 'Do you currently track calories or macros?', required: true },
      { id: 'current_targets', type: 'text', label: 'What are your current calorie/macronutrient targets?', placeholder: 'e.g. 2,000 kcal · 150g protein', when: { id: 'tracks_now', is: 'Yes' } },
      { id: 'tracked_before', type: 'yesno', label: 'Have you tracked calories before?', when: { id: 'tracks_now', is: 'No' } },
      { id: 'foods_enjoy', type: 'textarea', label: 'Are there any foods you particularly enjoy?' },
      { id: 'foods_dislike', type: 'textarea', label: "Are there any foods you dislike or won't eat?" },
      { id: 'allergies', type: 'text', label: 'Do you have any food allergies or intolerances?', required: true, placeholder: 'Write "None" if not' },
      { id: 'dietary_approach', type: 'text', label: 'Do you follow any particular dietary approach?', placeholder: 'e.g. none, vegetarian, vegan, halal, low-carb' },
      { id: 'eat_out', type: 'choice', label: 'How often do you normally eat out or order food?', options: ['Rarely', '1–2× a week', '3–4× a week', '5+ times a week'] },
      { id: 'meal_prep', type: 'choice', label: 'Who normally prepares your meals?', options: ['Me', 'Partner / family', 'A mix', 'Mostly eat out or order'] },
      { id: 'cooking_confidence', type: 'scale', label: 'How confident are you cooking?', scaleLabels: ['Not at all', 'Very confident'] },
      { id: 'water', type: 'choice', label: 'How much water do you normally drink?', options: ['Under 1L', '1–2L', '2–3L', '3L+'] },
      { id: 'caffeine', type: 'text', label: 'How much caffeine do you normally consume and at what times?', placeholder: 'e.g. 2 coffees, 8am and 1pm' },
      { id: 'alcohol', type: 'choice', label: 'How often do you drink alcohol?', required: true, options: ['Never', 'Occasionally', '1–2× a week', '3+ times a week'] },
      { id: 'supplements', type: 'yesno', label: 'Are you currently taking any supplements?' },
      { id: 'supplements_list', type: 'textarea', label: 'Which supplements?', when: { id: 'supplements', is: 'Yes' } },
      { id: 'nutrition_struggle', type: 'textarea', label: 'What would you say is your biggest struggle with nutrition?' },
    ],
  },
  {
    id: 'training',
    title: 'Training & activity',
    questions: [
      { id: 'trains', type: 'yesno', label: 'Do you currently train?', required: true },
      {
        id: 'training_type', type: 'multi', label: 'What type of training?', when: { id: 'trains', is: 'Yes' },
        options: ['Weights / resistance', 'Running / cardio', 'Classes', 'HIIT / CrossFit', 'Sport', 'Yoga / Pilates', 'Other'],
      },
      { id: 'training_days', type: 'choice', label: 'How many days per week?', when: { id: 'trains', is: 'Yes' }, options: ['1', '2', '3', '4', '5', '6', '7'] },
      { id: 'session_length', type: 'choice', label: 'How long are your sessions?', when: { id: 'trains', is: 'Yes' }, options: ['Under 30 min', '30–45 min', '45–60 min', '60–90 min', '90+ min'] },
      { id: 'training_experience', type: 'choice', label: 'How long have you been training?', when: { id: 'trains', is: 'Yes' }, options: ['Under 6 months', '6–12 months', '1–3 years', '3+ years'] },
      { id: 'training_routine', type: 'textarea', label: 'Briefly describe your current training routine.', when: { id: 'trains', is: 'Yes' } },
      { id: 'knows_steps', type: 'yesno', label: 'Do you know your approximate average daily steps?' },
      { id: 'steps', type: 'number', label: 'Average daily steps', unit: 'steps', min: 0, max: 60000, when: { id: 'knows_steps', is: 'Yes' } },
      { id: 'other_activity', type: 'text', label: 'Do you regularly do any other physical activity?', placeholder: 'e.g. walking the dog, swimming, padel' },
      { id: 'injuries_limitations', type: 'textarea', label: 'Do you currently have any injuries or physical limitations we should know about?' },
      { id: 'training_enjoy', type: 'textarea', label: 'What do you enjoy most about training?', when: { id: 'trains', is: 'Yes' } },
      { id: 'training_struggle', type: 'textarea', label: 'What do you struggle with most when it comes to training?' },
    ],
  },
  {
    id: 'sleep',
    title: 'Sleep & lifestyle',
    questions: [
      { id: 'bedtime', type: 'time', label: 'What time do you normally go to sleep?', required: true, half: true },
      { id: 'wake_time', type: 'time', label: 'What time do you normally wake up?', required: true, half: true },
      { id: 'sleep_hours', type: 'number', label: 'How many hours do you usually sleep?', required: true, unit: 'hours', min: 2, max: 14, step: 0.5 },
      { id: 'sleep_quality', type: 'scale', label: 'How would you rate your sleep quality?', required: true, scaleLabels: ['Very poor', 'Excellent'] },
      { id: 'wakes_night', type: 'yesno', label: 'Do you regularly wake during the night?', required: true },
      { id: 'feels_rested', type: 'yesno', label: 'Do you normally feel rested when you wake up?', required: true },
      { id: 'stress', type: 'scale', label: 'How would you rate your current stress?', required: true, scaleLabels: ['Very calm', 'Very stressed'] },
      { id: 'stress_sources', type: 'textarea', label: 'What are the biggest sources of stress in your life right now?' },
      { id: 'routine_predictability', type: 'scale', label: 'How predictable is your weekly routine?', scaleLabels: ['Unpredictable', 'Like clockwork'] },
      { id: 'travel', type: 'choice', label: 'How often do you travel?', options: ['Rarely', 'A few times a year', 'Monthly', 'Weekly'] },
      { id: 'schedule_barriers', type: 'textarea', label: 'Is there anything about your work, social life or schedule that regularly makes eating well or training difficult?' },
    ],
  },
  {
    id: 'health',
    title: 'Health',
    intro: 'These questions help your coach understand whether anything needs additional consideration when building your plan. Vitality coaching does not replace medical diagnosis or treatment.',
    questions: [
      { id: 'conditions', type: 'yesno', label: 'Do you have any diagnosed medical conditions that may be relevant to your nutrition, training or health?', required: true },
      { id: 'conditions_detail', type: 'textarea', label: 'Please explain.', required: true, when: { id: 'conditions', is: 'Yes' } },
      { id: 'medications', type: 'yesno', label: 'Are you currently taking any medications?', required: true },
      { id: 'medications_detail', type: 'textarea', label: 'Please list them.', required: true, when: { id: 'medications', is: 'Yes' } },
      { id: 'digestive', type: 'yesno', label: 'Do you experience any regular digestive issues?', required: true },
      { id: 'digestive_detail', type: 'textarea', label: 'Please explain.', required: true, when: { id: 'digestive', is: 'Yes' } },
      { id: 'injuries', type: 'yesno', label: 'Do you currently have any injuries?', required: true },
      { id: 'injuries_detail', type: 'textarea', label: 'Please explain.', required: true, when: { id: 'injuries', is: 'Yes' } },
      { id: 'professional', type: 'yesno', label: 'Are you currently working with a doctor, dietitian, psychologist or other healthcare professional on anything relevant to your coaching?', required: true },
      { id: 'professional_detail', type: 'textarea', label: 'Please explain.', required: true, when: { id: 'professional', is: 'Yes' } },
      { id: 'health_other', type: 'textarea', label: 'Is there anything else regarding your health that you believe your coach should know?' },
    ],
  },
  {
    id: 'history',
    title: 'Your history',
    questions: [
      { id: 'tried_before', type: 'yesno', label: 'Have you tried to lose or gain weight before?', required: true },
      { id: 'approaches', type: 'textarea', label: 'What approaches have you tried?', when: { id: 'tried_before', is: 'Yes' } },
      { id: 'worked', type: 'textarea', label: 'What worked well for you?', when: { id: 'tried_before', is: 'Yes' } },
      { id: 'didnt_work', type: 'textarea', label: "What didn't work?", when: { id: 'tried_before', is: 'Yes' } },
      { id: 'coached_before', type: 'yesno', label: 'Have you ever worked with a coach before?', required: true },
      { id: 'coach_liked', type: 'textarea', label: 'What did you like about the experience?', when: { id: 'coached_before', is: 'Yes' } },
      { id: 'coach_disliked', type: 'textarea', label: "What didn't you like?", when: { id: 'coached_before', is: 'Yes' } },
      { id: 'fall_off', type: 'textarea', label: 'What usually causes you to fall off track?' },
      { id: 'longest_consistent', type: 'text', label: "What's the longest you've successfully stayed consistent with your nutrition or training?", placeholder: 'e.g. about 3 months' },
      { id: 'what_changed', type: 'textarea', label: 'What changed when you stopped?' },
    ],
  },
  {
    id: 'habits',
    title: 'Habits & behaviour',
    intro: "There are no right or wrong answers here. This simply helps your coach understand what support will be most useful to you.",
    questions: [
      { id: 'emotional_eating', type: 'choice', label: 'Do you find yourself eating because of stress, boredom or emotions?', required: true, options: FREQ },
      { id: 'out_of_control', type: 'choice', label: 'Do you ever feel out of control around food?', required: true, options: FREQ },
      { id: 'compensating', type: 'choice', label: 'Do you sometimes skip meals or significantly reduce food because you ate more than planned earlier?', required: true, options: FREQ },
      { id: 'harder', type: 'choice', label: 'Which tends to be harder for you?', required: true, options: ['Knowing what to do', 'Actually doing it consistently', 'Both'] },
      { id: 'hardest_situations', type: 'textarea', label: 'What situations make staying consistent hardest for you?' },
      { id: 'food_relationship', type: 'textarea', label: 'How would you describe your current relationship with food?' },
    ],
  },
  {
    id: 'starting_point',
    title: 'Your starting point',
    questions: [
      // Same answer as "Current weight" in About you — shown again here so
      // the client can confirm it alongside their other measurements.
      { id: 'weight', type: 'number', label: 'Current body weight', required: true, unit: 'kg', min: 30, max: 350, step: 0.1, half: true },
      { id: 'waist', type: 'number', label: 'Waist measurement', hint: 'Optional', unit: 'cm', min: 40, max: 250, step: 0.5, half: true },
      { id: 'other_measurements', type: 'textarea', label: "Are there any other measurements or starting-point information you'd like your coach to know?", hint: 'Optional' },
      { id: 'blood_tests', type: 'yesno', label: 'Have you had any recent blood tests that you believe may be relevant?' },
      { id: 'blood_tests_note', type: 'note', label: 'Great — you can discuss these with your coach during onboarding.', when: { id: 'blood_tests', is: 'Yes' } },
    ],
  },
  {
    id: 'commitment',
    title: "Let's make this work",
    questions: [
      { id: 'biggest_obstacle', type: 'textarea', label: 'What do you think is the biggest thing currently standing between you and your goal?', required: true },
      { id: 'plan_difficulty', type: 'textarea', label: 'What could realistically make it difficult for you to follow your plan?' },
      { id: 'bad_day', type: 'textarea', label: 'When you have a bad day or week, what normally happens?' },
      {
        id: 'accountability', type: 'multi', label: 'What type of accountability helps you most?', hint: 'Select all that apply.',
        options: ['Weekly check-ins', 'Regular messages', 'Tracking & data', 'Clear targets', 'Encouragement', 'Being challenged'],
      },
      { id: 'expect_from_coach', type: 'textarea', label: 'What do you expect from your Vitality coach?' },
      { id: 'coach_can_expect', type: 'textarea', label: 'What should your Vitality coach be able to expect from you?' },
      { id: 'readiness', type: 'scale', label: "How confident are you that you're ready to commit to this process?", required: true, scaleLabels: ['Not sure yet', 'Fully ready'] },
      { id: 'nervous', type: 'textarea', label: "Is there anything you're nervous or uncertain about before starting?" },
      {
        id: 'one_year', type: 'textarea', required: true, highlight: true,
        label: 'One year from now, if everything has gone well, what do you want your health, body, nutrition and lifestyle to look and feel like?',
        placeholder: 'Take your time with this one…',
      },
    ],
  },
];

export const MAX_TEXT = 300;
export const MAX_TEXTAREA = 4000;

export function isVisible(q: Question, answers: Answers): boolean {
  if (!q.when) return true;
  const v = answers[q.when.id];
  return Array.isArray(v) ? v.includes(q.when.is) : v === q.when.is;
}

function isEmpty(v: Answers[string] | undefined) {
  return v === undefined || (Array.isArray(v) ? v.length === 0 : v.trim() === '');
}

// Returns an error message, or null if the answer is fine. Used both in the
// browser (per section, before Continue) and on the server (whole form).
export function validateQuestion(q: Question, answers: Answers): string | null {
  if (q.type === 'note' || !isVisible(q, answers)) return null;
  const v = answers[q.id];
  if (isEmpty(v)) return q.required ? 'This one is required.' : null;

  if (q.type === 'multi') {
    if (!Array.isArray(v) || !v.every((x) => q.options!.includes(x))) return 'Please choose from the options.';
    return null;
  }
  if (typeof v !== 'string') return 'Invalid answer.';
  const s = v.trim();

  switch (q.type) {
    case 'text': case 'tel':
      if (s.length > MAX_TEXT) return `Please keep this under ${MAX_TEXT} characters.`;
      if (q.type === 'tel' && !/^[+()\d\s-]{6,20}$/.test(s)) return 'Please enter a valid phone number.';
      return null;
    case 'textarea':
      return s.length > MAX_TEXTAREA ? `Please keep this under ${MAX_TEXTAREA} characters.` : null;
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254 ? null : 'Please enter a valid email address.';
    case 'date': {
      const d = new Date(s + 'T00:00:00Z');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(d.getTime())) return 'Please enter a valid date.';
      const age = (Date.now() - d.getTime()) / (365.25 * 864e5);
      return age < 12 || age > 110 ? 'Please check this date.' : null;
    }
    case 'time':
      return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? null : 'Please enter a valid time.';
    case 'number': {
      const n = Number(s);
      if (!Number.isFinite(n)) return 'Please enter a number.';
      if ((q.min !== undefined && n < q.min) || (q.max !== undefined && n > q.max)) return `Please enter a value between ${q.min} and ${q.max}.`;
      return null;
    }
    case 'scale': {
      const n = Number(s);
      return Number.isInteger(n) && n >= 1 && n <= 10 ? null : 'Please pick a number from 1 to 10.';
    }
    case 'yesno':
      return s === 'Yes' || s === 'No' ? null : 'Please choose Yes or No.';
    case 'choice':
      return q.options!.includes(s) ? null : 'Please choose one of the options.';
  }
  return null;
}

export function validateSection(section: Section, answers: Answers): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const q of section.questions) {
    const err = validateQuestion(q, answers);
    if (err) errors[q.id] = err;
  }
  return errors;
}

// Server-side pass over a whole submission: validates every visible
// question and keeps only known, visible, non-empty answers (so stale
// answers to questions hidden by a later "No" aren't stored), trimmed.
// Shared by every public form's submit route.
export function cleanSubmission(sections: Section[], answers: Answers): {
  clean: Answers; errors: Record<string, string>; firstErrorSection: number;
} {
  const errors: Record<string, string> = {};
  let firstErrorSection = -1;
  const clean: Answers = {};
  sections.forEach((section, i) => {
    for (const q of section.questions) {
      if (q.type === 'note' || !isVisible(q, answers)) continue;
      const err = validateQuestion(q, answers);
      if (err) {
        errors[q.id] = err;
        if (firstErrorSection === -1) firstErrorSection = i;
        continue;
      }
      const v = answers[q.id];
      if (Array.isArray(v)) { if (v.length) clean[q.id] = v; }
      else if (typeof v === 'string' && v.trim() !== '') clean[q.id] = v.trim();
    }
  });
  return { clean, errors, firstErrorSection };
}
