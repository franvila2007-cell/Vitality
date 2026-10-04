import { createClient } from '@/lib/supabase/server';
import FoodGuide from '@/components/FoodGuide';

// Read-only mirror of the client's Nutrition tab: the shared Food Guide plus
// the recipes they've saved (the "add a recipe" form is theirs alone).
export default async function ClientNutritionPreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from('custom_foods').select('*').eq('user_id', id).order('name');
  const recipes = data || [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4 page-fade-in">
      <FoodGuide />

      <div className="bg-surface border border-border rounded-2xl p-4">
        <p className="text-sm font-medium mb-3">Their recipes · {recipes.length}</p>
        {recipes.length === 0 && <p className="text-sm text-neutral-400">No recipes saved yet.</p>}
        <div className="flex flex-col gap-1.5">
          {recipes.map((r) => (
            <div key={r.id} className="bg-neutral-50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="flex-1 min-w-0 text-sm font-medium truncate">{r.name}</span>
                <span className="flex-shrink-0 text-2xs text-neutral-400 whitespace-nowrap">{Math.round(r.calories)} kcal · {Math.round(r.protein_g)}p {Math.round(r.carbs_g)}c {Math.round(r.fat_g)}f</span>
              </div>
              {r.ingredients_text && <p className="text-2xs text-neutral-400 mt-1 whitespace-pre-line">{r.ingredients_text}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
