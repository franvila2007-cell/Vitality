import Image from 'next/image';
import type { Tier } from '@/lib/ranking';

// Vitto's daily badge for the "This week" row. The artwork is generated art (one
// image per tier): Flat is the sleepy Vitto hugging an empty battery, Spark is
// a bit sad with one tiny spark, Charged is powering up, Vital is the caped
// golden Vitto with the Vitality V on his chest (only earned on a Vital day).

const SRC: Record<Tier, string> = {
  flat: '/vitto/flat.webp',
  spark: '/vitto/day-spark.webp',
  charged: '/vitto/day-charged.webp',
  vital: '/vitto/day-vital.webp',
};

const ALT: Record<Tier, string> = {
  flat: 'Flat day: Vitto asleep on an empty battery',
  spark: 'Spark day: Vitto a little sad, with one spark',
  charged: 'Charged day: Vitto powering up',
  vital: 'Vital day: Vitto in his cape with the Vitality V',
};

export default function VittoBadge({ tier, size = 44, className }: { tier: Tier; size?: number; className?: string }) {
  return <Image src={SRC[tier]} alt={ALT[tier]} width={size * 2} height={size * 2} sizes={`${size}px`} className={`object-contain ${className ?? ''}`} />;
}
