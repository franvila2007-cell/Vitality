import type { Section } from '@/lib/assessment/questions';

// Single source of truth for the IronBodyFit meal-plan request form: the
// public form at /ironbodyfit-meal-plans renders from this, /api/meal-plan validates
// against it, and /coach/meal-plans prints answers back in question order.
// Same question shape and validators as the onboarding assessment.
export const MEAL_PLAN_SECTIONS: Section[] = [
  {
    id: 'about',
    title: 'About you',
    questions: [
      { id: 'full_name', type: 'text', label: 'Name and surname', required: true, autoComplete: 'name' },
      { id: 'email', type: 'email', label: 'Email', required: true, autoComplete: 'email', hint: "We'll send your meal plan here.", half: true },
      { id: 'phone', type: 'tel', label: 'Phone number', required: true, autoComplete: 'tel', placeholder: '+356', half: true },
      { id: 'age', type: 'number', label: 'Age', required: true, unit: 'years', min: 14, max: 100, half: true },
      { id: 'sex', type: 'choice', label: 'Sex', required: true, options: ['Female', 'Male'], half: true },
      { id: 'height', type: 'number', label: 'Height', required: true, unit: 'cm', min: 100, max: 250, half: true },
      { id: 'weight', type: 'number', label: 'Current weight', required: true, unit: 'kg', min: 30, max: 350, step: 0.1, half: true },
      {
        id: 'goal', type: 'choice', label: 'What is your main goal?', required: true,
        options: ['Lose fat', 'Build muscle', 'Lose fat & build muscle', 'Better health & energy'],
      },
      { id: 'ems_sessions', type: 'choice', label: 'How many EMS sessions do you do per week?', required: true, options: ['Just starting', '1', '2', '3+'] },
    ],
  },
  {
    id: 'food',
    title: 'Your food',
    questions: [
      {
        id: 'diet', type: 'multi', label: 'Dietary preferences', hint: 'Select all that apply.', required: true,
        options: ['No preference', 'High protein', 'Vegetarian', 'Vegan', 'Pescatarian', 'Halal', 'Gluten-free', 'Dairy-free', 'Low carb', 'Other'],
      },
      { id: 'diet_other', type: 'text', label: 'Other dietary preference', required: true, when: { id: 'diet', is: 'Other' } },
      { id: 'foods_enjoy', type: 'textarea', label: 'List foods you ENJOY eating', hint: 'Be specific, e.g. chicken thighs, basmati rice, Greek yoghurt, berries.' },
      { id: 'foods_dislike', type: 'textarea', label: 'List foods you DISLIKE or REFUSE to eat', required: true, placeholder: 'Write "None" if there aren\'t any' },
      { id: 'foods_frequent', type: 'textarea', label: 'Are there any foods you eat very frequently already?', required: true, placeholder: 'e.g. eggs every morning, pasta most evenings' },
    ],
  },
  {
    id: 'allergies',
    title: 'Allergies & intolerances',
    questions: [
      { id: 'allergies', type: 'yesno', label: 'Do you have any food allergies?', required: true },
      { id: 'allergies_detail', type: 'textarea', label: 'Which foods are you allergic to?', required: true, when: { id: 'allergies', is: 'Yes' } },
      { id: 'intolerances', type: 'yesno', label: 'Do you have any intolerances or digestive issues?', hint: 'e.g. lactose intolerance, bloating, IBS', required: true },
      { id: 'intolerances_detail', type: 'textarea', label: 'Please tell us more.', required: true, when: { id: 'intolerances', is: 'Yes' } },
    ],
  },
  {
    id: 'health',
    title: 'Health information',
    intro: 'This helps us build a plan that is safe and right for you. Your meal plan does not replace medical diagnosis or treatment.',
    questions: [
      { id: 'conditions', type: 'yesno', label: 'Do you have any medical conditions that may affect your diet?', required: true },
      { id: 'conditions_detail', type: 'textarea', label: 'Please explain.', required: true, when: { id: 'conditions', is: 'Yes' } },
      { id: 'medications', type: 'yesno', label: 'Are you currently taking any medications?', required: true },
      { id: 'medications_detail', type: 'textarea', label: 'Please list them.', required: true, when: { id: 'medications', is: 'Yes' } },
      { id: 'gut_energy', type: 'yesno', label: 'Do you experience any gut issues or suffer from low energy?', required: true },
      { id: 'gut_energy_detail', type: 'textarea', label: 'Please tell us more.', required: true, when: { id: 'gut_energy', is: 'Yes' } },
    ],
  },
  {
    id: 'habits',
    title: 'Eating habits & lifestyle',
    questions: [
      { id: 'meals_per_day', type: 'choice', label: 'How many meals do you PREFER per day?', required: true, options: ['1', '2', '3'] },
      { id: 'meal_style', type: 'choice', label: 'Do you prefer:', required: true, options: ['Simple meals I can repeat', 'Lots of variety', 'A mix of both'] },
      { id: 'snacks', type: 'choice', label: 'Do you snack often?', required: true, options: ['Rarely', 'Sometimes', 'Often'] },
      { id: 'hungriest', type: 'choice', label: 'When are you most hungry during the day?', options: ['Morning', 'Midday', 'Afternoon', 'Evening', 'Late night'] },
    ],
  },
  {
    id: 'commitment',
    title: 'Commitment & expectations',
    questions: [
      {
        id: 'strictness', type: 'choice', label: 'How strict can you realistically be with your diet?', required: true,
        options: ['Very strict, I’ll follow it exactly', 'Strict on weekdays, relaxed on weekends', 'Fairly flexible', 'I need small changes at a time'],
      },
      {
        id: 'plan_type', type: 'choice', label: 'What type of meal plan do you prefer?', required: true,
        options: ['Fixed meals, tell me exactly what to eat', 'Meal options I can choose from', 'Calorie & macro targets', 'Not sure, guide me'],
      },
      { id: 'cooking_time', type: 'choice', label: 'How much time can you spend cooking daily?', required: true, options: ['Under 15 min', '15–30 min', '30–60 min', '1 hour+'] },
      { id: 'fall_off', type: 'textarea', label: 'What usually causes you to fall off track?', placeholder: 'e.g. late work days, weekends, eating out, cravings' },
    ],
  },
  {
    id: 'final',
    title: 'Final notes',
    questions: [
      {
        id: 'final_notes', type: 'textarea', highlight: true,
        label: 'Is there anything else we should know to make your plan work better for you?',
        placeholder: 'Schedule, budget, family meals, events coming up…',
      },
    ],
  },
];
