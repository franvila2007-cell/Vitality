import type { Answers } from './questions';

export type ClientSetup = {
  fullName: string; email: string;
  startWeight: number; goalWeight: number; goalType: 'lose' | 'gain';
  calories: number; proteinG: number; carbsG: number; fatG: number;
};

// Turns a submitted assessment into the values the "Add client" flow needs,
// so the coach can create the account in one click. Targets are a starting
// estimate only (Mifflin-St Jeor × activity, ±goal adjustment) — the coach
// reviews them before creating and can edit them any time afterwards.
export function clientSetupFromAssessment(a: Answers): ClientSetup {
  const str = (id: string) => (typeof a[id] === 'string' ? (a[id] as string) : '');
  const num = (id: string) => Number(str(id)) || 0;
  const goals = Array.isArray(a.goals) ? a.goals : [];

  const weight = num('weight');
  const goalWeight = num('goal_weight') || weight;
  const goalType: 'lose' | 'gain' =
    goalWeight !== weight ? (goalWeight < weight ? 'lose' : 'gain') : goals.includes('Muscle gain') && !goals.includes('Fat loss') ? 'gain' : 'lose';

  const dob = new Date(str('dob'));
  const age = isNaN(dob.getTime()) ? 30 : Math.floor((Date.now() - dob.getTime()) / (365.25 * 864e5));
  const height = num('height') || 170;
  const bmr = 10 * weight + 6.25 * height - 5 * age + (str('sex') === 'Male' ? 5 : -161);

  const days = str('trains') === 'Yes' ? parseInt(str('training_days')) || 0 : 0;
  const activity = days >= 5 ? 1.65 : days >= 3 ? 1.55 : days >= 1 ? 1.45 : 1.3;
  const adjust = goalType === 'lose' ? 0.8 : 1.1;
  const calories = Math.round((bmr * activity * adjust) / 50) * 50;

  const proteinG = Math.round(weight * 1.8);
  const fatG = Math.round(weight * 0.8);
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));

  return { fullName: str('full_name'), email: str('email'), startWeight: weight, goalWeight, goalType, calories, proteinG, carbsG, fatG };
}
