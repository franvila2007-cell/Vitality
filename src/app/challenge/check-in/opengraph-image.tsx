import { challengeOgImage, OG_SIZE } from '@/lib/challenge/ogImage';

export const alt = 'Vitality 8-Week Challenge weekly check-in';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return challengeOgImage('Weekly check-in', 'Takes about 3 minutes');
}
