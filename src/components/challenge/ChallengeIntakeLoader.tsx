'use client';

import dynamic from 'next/dynamic';

// Saved progress lives in localStorage, which only exists in the browser —
// skip server rendering rather than flash an empty form.
const ChallengeIntakeForm = dynamic(() => import('./ChallengeIntakeForm'), {
  ssr: false,
  loading: () => <div className="min-h-dvh w-full bg-[#D6F5EE]" />,
});

export default ChallengeIntakeForm;
