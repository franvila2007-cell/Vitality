import { challengeOgImage, OG_SIZE } from '@/lib/challenge/ogImage';

export const alt = 'Vitality 8-Week Challenge: get started';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return challengeOgImage("You're in. Let's get started", 'About 5 minutes to build your 8 weeks around you');
}
