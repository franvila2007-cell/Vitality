'use client';

import { useState } from 'react';
import Link, { type LinkProps } from 'next/link';

// Prefetches only once the user shows real intent to click — a finger
// touching down (mobile) or a mouse entering the link (desktop) — instead
// of either extreme: default prefetch fires for every link the instant it's
// in the viewport (wasteful for a long list, see coach/page.tsx), while
// prefetch={false} recovers nothing at all, so every tap pays the full
// server round trip with no head start. This gives the one link actually
// being tapped a head start without prefetching the whole list.
export default function PrefetchOnIntentLink({
  children, className, ...props
}: LinkProps & { children: React.ReactNode; className?: string }) {
  const [active, setActive] = useState(false);
  return (
    <Link
      {...props}
      prefetch={active ? null : false}
      onMouseEnter={() => setActive(true)}
      onTouchStart={() => setActive(true)}
      className={className}
    >
      {children}
    </Link>
  );
}
