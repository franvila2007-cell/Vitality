'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RestoreClientButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [restoring, setRestoring] = useState(false);

  async function restore() {
    setRestoring(true);
    try {
      const res = await fetch(`/api/coach/clients/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: false }),
      });
      if (res.ok) router.refresh();
    } finally {
      setRestoring(false);
    }
  }

  return (
    <button
      onClick={restore}
      disabled={restoring}
      className="flex-shrink-0 rounded-lg border border-border text-neutral-600 px-3 py-1.5 text-xs font-medium hover:border-brand hover:text-brand-dark transition-colors disabled:opacity-50"
    >
      {restoring ? 'Adding back…' : '+ Add back'}
    </button>
  );
}
