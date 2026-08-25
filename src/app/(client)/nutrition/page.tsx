import RecipesManager from '@/components/RecipesManager';
import GoldStreakMeter from '@/components/GoldStreakMeter';

// Auth/role guard and <AppNav/> now live in (client)/layout.tsx.
export default function NutritionPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4 page-fade-in">
      <GoldStreakMeter />
      <RecipesManager />
    </div>
  );
}
