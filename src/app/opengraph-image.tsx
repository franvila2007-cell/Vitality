import { logoOgImage, OG_SIZE } from '@/lib/challenge/ogImage';

// Default link preview for every page: the Vitality logo on white. Pages with
// their own opengraph-image (the 8-Week Challenge links) override it.
export const alt = 'Vitality';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return logoOgImage();
}
