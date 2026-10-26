'use client';

import dynamic from 'next/dynamic';

// The remembered email and draft live in localStorage, which only exists in
// the browser — skip server rendering rather than flash an empty form.
const CheckinForm = dynamic(() => import('./CheckinForm'), {
  ssr: false,
  loading: () => <div className="min-h-dvh w-full bg-[#D6F5EE]" />,
});

export default CheckinForm;
