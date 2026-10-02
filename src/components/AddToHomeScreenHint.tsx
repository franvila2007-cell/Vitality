'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const DISMISSED_KEY = 'vitality-a2hs-dismissed';

export default function AddToHomeScreenHint() {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    const dismissed = localStorage.getItem(DISMISSED_KEY) === '1';
    setVisible(isIOS && !isStandalone && !dismissed);
  }, []);

  // The public onboarding form isn't the installable app.
  if (!visible || pathname.startsWith('/assessment')) return null;

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm rounded-xl border border-border bg-surface px-4 py-3 shadow-lg flex items-start gap-3">
      <div className="flex-1 text-xs text-neutral-600">
        <p className="font-medium text-neutral-800 mb-0.5">Add Vitality to your Home Screen</p>
        <p>Tap the Share icon, then &quot;Add to Home Screen&quot; to install it like an app.</p>
      </div>
      <button onClick={dismiss} className="text-neutral-400 hover:text-neutral-600 text-sm leading-none px-1">
        ✕
      </button>
    </div>
  );
}
