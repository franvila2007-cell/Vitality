type FoodItem = { name: string; tone: 'green' | 'orange' };

// Green = go-to pick, orange = fine in moderation / watch portions. Ties
// into the same status color tokens used for progress-quality elsewhere in
// the app rather than inventing a second green/orange palette.
const PROTEIN: FoodItem[] = [
  { name: 'Chicken (breast, thigh)', tone: 'green' },
  { name: 'Fish (salmon, tuna, cod, tilapia)', tone: 'green' },
  { name: 'Beef (lean cuts — sirloin, tenderloin, 90/10 ground)', tone: 'green' },
  { name: 'Greek yogurt', tone: 'green' },
  { name: 'Milk', tone: 'green' },
  { name: 'Pork (chops, tenderloin, bacon)', tone: 'orange' },
  { name: 'Plant-based (tofu, lentils, chickpeas, tempeh, edamame)', tone: 'orange' },
];

const CARBS: FoodItem[] = [
  { name: 'Potatoes', tone: 'green' },
  { name: 'Sweet potatoes', tone: 'green' },
  { name: 'White rice', tone: 'green' },
  { name: 'Dairy (milk, yogurt)', tone: 'green' },
  { name: 'Fruit (berries, frozen berries, bananas, apples)', tone: 'green' },
  { name: 'Honey', tone: 'orange' },
  { name: 'Bread', tone: 'orange' },
  { name: 'Pasta', tone: 'orange' },
];

const FATS: FoodItem[] = [
  { name: 'Salmon', tone: 'green' },
  { name: 'Olive oil', tone: 'green' },
  { name: 'Nuts (almonds, walnuts, cashews)', tone: 'green' },
  { name: 'Butter', tone: 'green' },
  { name: 'Beef', tone: 'green' },
  { name: 'Dairy (cheese, whole milk)', tone: 'green' },
];

const VEGETABLES: FoodItem[] = [
  { name: 'Seasonal veg (peppers, zucchini, carrots, tomatoes)', tone: 'green' },
  { name: 'Tubers (beets, turnips, parsnips)', tone: 'green' },
  { name: 'Broccoli & cauliflower', tone: 'orange' },
  { name: 'Spinach & arugula', tone: 'orange' },
  { name: 'Kale & other dark leafy greens', tone: 'orange' },
];

const CONDIMENTS: FoodItem[] = [
  { name: 'Mustard', tone: 'orange' },
  { name: 'Hot sauce', tone: 'orange' },
  { name: 'Vinegar', tone: 'orange' },
  { name: 'Soy sauce', tone: 'orange' },
  { name: 'Ketchup', tone: 'orange' },
];

function Chip({ item }: { item: FoodItem }) {
  const toneClass = item.tone === 'green'
    ? 'bg-status-good-bg text-status-good-text border-status-good'
    : 'bg-status-warn-bg text-status-warn-text border-status-warn';
  return (
    <span className={`text-2xs font-medium rounded-full px-2.5 py-1 border ${toneClass}`}>
      {item.name}
    </span>
  );
}

function Section({ icon, title, items }: { icon: string; title: string; items: FoodItem[] }) {
  return (
    <div>
      <p className="text-xs font-medium text-neutral-500 mb-1.5 flex items-center gap-1.5">
        <span>{icon}</span>{title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => <Chip key={item.name} item={item} />)}
      </div>
    </div>
  );
}

export default function FoodGuide() {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <p className="text-sm font-medium mb-1">Food guide</p>
      <p className="text-xs text-neutral-400 mb-3">A quick reference for what to reach for. Green is your best pick, orange is fine — just keep an eye on portions.</p>
      <div className="flex flex-col gap-3.5">
        <Section icon="🍗" title="Protein" items={PROTEIN} />
        <Section icon="🍞" title="Carbohydrates" items={CARBS} />
        <Section icon="🥑" title="Fats" items={FATS} />
        <Section icon="🥦" title="Vegetables" items={VEGETABLES} />
        <Section icon="🧂" title="Condiments" items={CONDIMENTS} />
      </div>
    </div>
  );
}
