// Dev-only: generates the static PWA icon PNGs into /public. Run with
// `npx tsx scripts/generate-pwa-icons.tsx` whenever the mark/brand colors
// change — outputs are committed, this script isn't part of the runtime.
import { ImageResponse } from 'next/og';
import { writeFileSync } from 'fs';
import { join } from 'path';

const BRAND = '#0fa8a6';
const BRAND_DARK = '#0b5f5e';

function mark(size: number, glyphScale: number) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(135deg, ${BRAND} 0%, ${BRAND_DARK} 100%)`,
      }}
    >
      <div
        style={{
          fontSize: size * glyphScale,
          fontWeight: 700,
          color: 'white',
          fontFamily: 'sans-serif',
          display: 'flex',
        }}
      >
        V
      </div>
    </div>
  );
}

async function render(size: number, glyphScale: number, filename: string) {
  const res = new ImageResponse(mark(size, glyphScale), { width: size, height: size });
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(process.cwd(), 'public', filename), buf);
  console.log('wrote', filename);
}

async function main() {
  await render(192, 0.55, 'icon-192.png');
  await render(512, 0.55, 'icon-512.png');
  // Maskable: Android crops to a circle/rounded-square, so keep the glyph
  // inside the ~80% safe zone instead of filling edge-to-edge.
  await render(512, 0.4, 'icon-512-maskable.png');
  await render(180, 0.55, 'apple-touch-icon.png');
  await render(48, 0.55, 'icon-48.png');
}

main();
