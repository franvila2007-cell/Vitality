// The Google Drive copy of a meal plan, for the coach's "IronBodyFit Meal
// Plan Library" folder. Built here as HTML (Drive turns it into a Google Doc)
// so the library holds the full plan — targets, every recipe with its photo,
// grams, method and macros — plus the Gamma link and the coach's checks.
// The Gamma link isn't known when this is built: GAMMA_URL_PLACEHOLDER is
// swapped in by the database when the hourly task fetches the document
// (list_meal_plans_for_library, migration 0024, which also names the Doc).
import type { Recipe } from './recipes';
import type { Targets } from './targets';
import type { Issue } from './validate';
import { recipeIngredientsLine } from './gammaContent';

export const GAMMA_URL_PLACEHOLDER = '{{GAMMA_URL}}';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function buildLibraryHtml(p: {
  fullName: string;
  location: string | null;
  createdAt: Date;
  targets: Targets;
  exclusionNote: string;
  recipes: Recipe[];
  photos: Record<string, { url: string } | null> | undefined;
  issues: Issue[];
}): string {
  const t = p.targets;
  const day = p.createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Malta' });
  const review = p.issues.filter((i) => i.level === 'review').map((i) => i.message);

  const meals = t.meals.map((m) => {
    const cards = p.recipes.filter((r) => r.slot === m.slot).map((r) => {
      const d = r.fit.nutrition.display;
      const photo = p.photos?.[r.name]?.url;
      return [
        `<h3>${esc(r.name)}</h3>`,
        photo ? `<p><img src="${esc(photo)}" alt="${esc(r.name)}" width="320"></p>` : '',
        `<p>${esc(recipeIngredientsLine(r))}.</p>`,
        `<p>${esc(r.method)}</p>`,
        `<p><b>${d.kcal} kcal · P: ${d.protein}g · C: ${d.carbs}g · F: ${d.fat}g</b></p>`,
      ].join('');
    }).join('');
    return `<h2>${esc(m.label)} — about ${m.kcal} kcal</h2>${cards}`;
  }).join('');

  return `<html><head><meta charset="utf-8"><title>${esc(p.fullName)} – IronBodyFit Meal Plan</title></head><body>
<h1>${esc(p.fullName)} – Vitality × IronBody Fit Meal Plan</h1>
<p><b>IronBodyFit:</b> ${esc(p.location ?? 'not asked on their form')}<br><b>Plan made:</b> ${esc(day)}<br><b>Gamma:</b> <a href="${GAMMA_URL_PLACEHOLDER}">${GAMMA_URL_PLACEHOLDER}</a></p>
<h2>Targets</h2>
<p><b>Goal:</b> ${esc(t.goalLabel)}<br><b>Maintenance:</b> ${t.maintenanceKcal} kcal<br><b>Daily target:</b> ${t.targetKcal} kcal${t.deficitApplied ? ' (300 kcal below maintenance)' : ' (no deficit — see checks)'}<br><b>Protein / Carbs / Fat:</b> ${t.protein} g / ${t.carbs} g / ${t.fat} g<br><b>Meals:</b> ${t.meals.map((m) => `${esc(m.label)} ~${m.kcal} kcal`).join(' · ')}</p>
${p.exclusionNote ? `<p>${esc(p.exclusionNote)}</p>` : ''}
${meals}
<h2>Checks for the coach</h2>
${review.length ? `<ul>${review.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '<p>All checks passed.</p>'}
</body></html>`;
}
