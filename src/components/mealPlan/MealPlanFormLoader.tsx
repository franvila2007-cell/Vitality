'use client';

import dynamic from 'next/dynamic';

// The form restores saved progress from localStorage, which only exists in
// the browser — skip server rendering rather than flash an empty form.
const MealPlanForm = dynamic(() => import('./MealPlanForm'), {
  ssr: false,
  loading: () => <div className="min-h-screen w-full bg-[#fbfdfd]" />,
});

export default MealPlanForm;
