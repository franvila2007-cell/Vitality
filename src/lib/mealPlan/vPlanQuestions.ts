import type { Section } from '@/lib/assessment/questions';

// Single source of truth for the V Plans form — meal-plan requests from
// Vitality's own clients. The public form at /v-plan renders from this,
// /api/v-plan validates against it, and /coach/v-plans prints answers back
// in question order. Same question shape and validators as the assessment.
export const V_PLAN_SECTIONS: Section[] = [
  {
    id: 'about',
    title: 'About you',
    questions: [
      { id: 'full_name', type: 'text', label: 'Name and surname', required: true, autoComplete: 'name' },
      { id: 'email', type: 'email', label: 'Email', required: true, autoComplete: 'email', hint: 'Use the same email as your Vitality account.', half: true },
      { id: 'phone', type: 'tel', label: 'Phone number', required: true, autoComplete: 'tel', placeholder: '+356', half: true },
      { id: 'age', type: 'number', label: 'Age', required: true, unit: 'years', min: 14, max: 100, half: true },
      { id: 'sex', type: 'choice', label: 'Sex', required: true, options: ['Female', 'Male'], half: true },
      { id: 'height', type: 'number', label: 'Height', required: true, unit: 'cm', min: 100, max: 250, half: true },
      { id: 'weight', type: 'number', label: 'Current weight', required: true, unit: 'kg', min: 30, max: 350, step: 0.1, half: true },
      {
        id: 'goal', type: 'choice', label: 'What is the main goal of this meal plan?', required: true,
        options: ['Lose fat', 'Build muscle', 'Lose fat & build muscle', 'Improve performance', 'Better health & energy'],
      },
    ],
  },
  {
    id: 'training',
    title: 'Training & routine',
    questions: [
      { id: 'training_days', type: 'choice', label: 'How many days per week do you train?', required: true, options: ['0', '1', '2', '3', '4', '5', '6', '7'] },
      {
        id: 'training_type', type: 'multi', label: 'What type of training do you do?', hint: 'Select all that apply.',
        options: ['Weights', 'Running / cardio', 'Classes', 'HIIT / CrossFit', 'Sport', 'Yoga / Pilates', 'Walking', 'Other'],
      },
      { id: 'training_time', type: 'choice', label: 'When do you usually train?', options: ['Early morning', 'Morning', 'Midday', 'Afternoon', 'Evening', 'It varies'] },
      { id: 'wake_time', type: 'time', label: 'What time do you usually wake up?', required: true, half: true },
      { id: 'bedtime', type: 'time', label: 'What time do you usually go to sleep?', required: true, half: true },
      { id: 'work_pattern', type: 'choice', label: 'What does your work day look like?', options: ['Desk / office', 'On my feet', 'Physical / manual', 'Shift work', 'Not working / student'] },
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
      { id: 'typical_day', type: 'textarea', label: 'What do you eat on a typical day right now?', required: true, placeholder: 'Breakfast, lunch, dinner, snacks, drinks…' },
      { id: 'meals_you_make', type: 'textarea', label: 'Which meals do you already know how to make and enjoy?', hint: "We'll build your plan around these where we can.", placeholder: 'e.g. chicken stir-fry, overnight oats, salmon & potatoes' },
    ],
  },
  {
    id: 'allergies',
    title: 'Allergies & health',
    intro: 'This helps us build a plan that is safe and right for you. Your meal plan does not replace medical diagnosis or treatment.',
    questions: [
      { id: 'allergies', type: 'yesno', label: 'Do you have any food allergies?', required: true },
      { id: 'allergies_detail', type: 'textarea', label: 'Which foods are you allergic to?', required: true, when: { id: 'allergies', is: 'Yes' } },
      { id: 'intolerances', type: 'yesno', label: 'Do you have any intolerances or digestive issues?', hint: 'e.g. lactose intolerance, bloating, IBS', required: true },
      { id: 'intolerances_detail', type: 'textarea', label: 'Please tell us more.', required: true, when: { id: 'intolerances', is: 'Yes' } },
      { id: 'conditions', type: 'yesno', label: 'Do you have any medical conditions that may affect your diet?', required: true },
      { id: 'conditions_detail', type: 'textarea', label: 'Please explain.', required: true, when: { id: 'conditions', is: 'Yes' } },
      { id: 'medications', type: 'yesno', label: 'Are you currently taking any medications?', required: true },
      { id: 'medications_detail', type: 'textarea', label: 'Please list them.', required: true, when: { id: 'medications', is: 'Yes' } },
      { id: 'supplements', type: 'yesno', label: 'Are you taking any supplements?', hint: 'e.g. protein powder, creatine, vitamins', required: true },
      { id: 'supplements_detail', type: 'textarea', label: 'Which ones?', required: true, when: { id: 'supplements', is: 'Yes' } },
    ],
  },
  {
    id: 'meals',
    title: 'Your meals',
    questions: [
      { id: 'meals_per_day', type: 'choice', label: 'How many meals do you PREFER per day?', required: true, options: ['1', '2', '3', '4', '5'] },
      {
        id: 'meals_wanted', type: 'multi', label: 'Which meals should your plan include?', hint: 'Select all that apply.', required: true,
        options: ['Breakfast', 'Mid-morning snack', 'Lunch', 'Afternoon snack', 'Dinner', 'Pre-workout', 'Post-workout', 'Evening snack', 'Dessert'],
      },
      { id: 'meal_style', type: 'choice', label: 'Do you prefer:', required: true, options: ['Simple meals I can repeat', 'Lots of variety', 'A mix of both'] },
      { id: 'hungriest', type: 'choice', label: 'When are you most hungry during the day?', options: ['Morning', 'Midday', 'Afternoon', 'Evening', 'Late night'] },
      { id: 'eat_out', type: 'choice', label: 'How often do you eat out or order food?', required: true, options: ['Rarely', '1–2× a week', '3–4× a week', '5+ times a week'] },
      { id: 'water', type: 'choice', label: 'How much water do you drink per day?', options: ['Under 1L', '1–2L', '2–3L', '3L+'] },
      { id: 'alcohol', type: 'choice', label: 'How often do you drink alcohol?', required: true, options: ['Never', 'Occasionally', '1–2× a week', '3+ times a week'] },
    ],
  },
  {
    id: 'cooking',
    title: 'Cooking & shopping',
    questions: [
      { id: 'cooking_time', type: 'choice', label: 'How much time can you spend cooking daily?', required: true, options: ['Under 15 min', '15–30 min', '30–60 min', '1 hour+'] },
      { id: 'cooking_confidence', type: 'scale', label: 'How confident are you in the kitchen?', required: true, scaleLabels: ['Beginner', 'Very confident'] },
      { id: 'meal_prep', type: 'choice', label: 'Would you batch-cook / meal prep?', required: true, options: ['Yes, happy to', 'Sometimes', 'No, I cook fresh each time'] },
      { id: 'cooking_for', type: 'choice', label: 'Who are you cooking for?', required: true, options: ['Just me', 'Me + partner', 'My family', 'Someone else cooks for me'] },
      { id: 'budget', type: 'choice', label: 'What weekly food budget suits you?', options: ['Budget-friendly', 'Moderate', 'Not a concern'] },
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
      { id: 'app_logging', type: 'choice', label: 'Are you happy logging your meals in the Vitality app?', required: true, options: ['Yes, every day', 'Most days', 'I find it hard'] },
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
        placeholder: 'Schedule, events coming up, foods you miss…',
      },
    ],
  },
];
