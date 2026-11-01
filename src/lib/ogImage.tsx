import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 };

// Link preview (WhatsApp / Instagram / iMessage) for every page in the app:
// just the Vitality logo on white. Without one, WhatsApp showed a black box.
export async function logoOgImage() {
  const logo = await readFile(join(process.cwd(), 'public/vitality-logo.png'), 'base64');
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/png;base64,${logo}`} width={389} height={309} alt="" />
      </div>
    ),
    OG_SIZE,
  );
}
