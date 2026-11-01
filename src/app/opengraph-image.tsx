import { logoOgImage, OG_SIZE } from '@/lib/ogImage';

// Link preview for every page: the Vitality logo on white.
export const alt = 'Vitality';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return logoOgImage();
}
