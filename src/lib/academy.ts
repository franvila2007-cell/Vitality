import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { PACKAGES } from '@/lib/crm/constants';

// Vitality Academy — the course PDFs from the coach's "Vitality Academy" Drive
// folder, stored in the private `academy` bucket as course-NN.pdf. All are open
// at once, grouped 4 per milestone so they line up with the Milestones tab.
// Adding a course: upload course-25.pdf to the bucket and add it here.

export const ACADEMY_MILESTONES: { title: string; courses: { n: number; title: string }[] }[] = [
  { title: 'Foundations', courses: [
    { n: 1, title: 'Calories & Energy Balance' },
    { n: 2, title: 'Protein, Carbs & Fat — What Your Food Actually Does' },
    { n: 3, title: 'How Your Body Actually Builds Muscle & Loses Fat' },
    { n: 4, title: 'Sleep, Light & Your Body Clock' },
  ] },
  { title: 'Building the habits', courses: [
    { n: 5, title: 'Food Quality — Why Calories Aren’t the Whole Story' },
    { n: 6, title: 'Training 101 — Sets, Reps, Failure & Progression' },
    { n: 7, title: 'Stress, Recovery & Your Nervous System' },
    { n: 8, title: 'What Does Healthy Actually Mean' },
  ] },
  { title: 'Going deeper', courses: [
    { n: 9, title: 'Micronutrients — The Nutrients Calories Can’t Show You' },
    { n: 10, title: 'Exercise Selection — What Actually Makes an Exercise Good' },
    { n: 11, title: 'Blood Sugar, Insulin & Metabolism' },
    { n: 12, title: 'Digestion, Absorption & Anti-Nutrients' },
  ] },
  { title: 'Hormones & performance', courses: [
    { n: 13, title: 'Hormones 101 — Your Body’s Communication Network' },
    { n: 14, title: 'Thyroid & Metabolic Health' },
    { n: 15, title: 'The Science of Hypertrophy' },
    { n: 16, title: 'Circadian Biology — Beyond Just Sleep' },
  ] },
  { title: 'Thinking for yourself', courses: [
    { n: 17, title: 'Diet Wars — Vegan vs Carnivore vs Keto vs Mediterranean vs Animal-Based' },
    { n: 18, title: 'The People Who Changed How We Think About Nutrition' },
    { n: 19, title: 'Nature, Evolution & The Modern Human' },
    { n: 20, title: 'How to Read Health Science Without Being Fooled' },
  ] },
  { title: 'The Vitality way', courses: [
    { n: 21, title: 'Red Meat, Eggs & Animal Foods — What Does the Evidence Actually Say' },
    { n: 22, title: 'Carbohydrates, Fruit, Honey & Tubers' },
    { n: 23, title: 'Building the Vitality Philosophy' },
    { n: 24, title: 'The Vitality Blueprint' },
  ] },
];

export const ACADEMY_COURSE_COUNT = ACADEMY_MILESTONES.reduce((s, m) => s + m.courses.length, 0);
export const academyPath = (n: number) => `course-${String(n).padStart(2, '0')}.pdf`;
export const isAcademyCourse = (n: number) => ACADEMY_MILESTONES.some((m) => m.courses.some((c) => c.n === n));

// 1-1 coaching clients (3 months / 6 months / 1 year package in the CRM) get the
// Academy automatically — same packages as the Calls tab.
const ONE_TO_ONE: string[] = PACKAGES.filter((p) => p.kind === 'coaching').map((p) => p.key);

export async function hasAcademyAccess(db: SupabaseClient<Database>, clientId: string): Promise<boolean> {
  const { data } = await db.from('crm_contacts').select('package').eq('client_id', clientId).maybeSingle();
  return !!data?.package && ONE_TO_ONE.includes(data.package);
}
