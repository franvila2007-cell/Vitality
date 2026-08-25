import RecipesManager from '@/components/RecipesManager';

// Auth/role guard and <AppNav/> now live in (client)/layout.tsx.
export default function NutritionPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-5 page-fade-in">
      <RecipesManager />
    </div>
  );
}
