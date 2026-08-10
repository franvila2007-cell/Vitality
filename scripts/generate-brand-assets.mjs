// Dev-only: builds every icon/logo asset used by the app from the two
// brand source images:
//   - assets/brand/vitality-logo-source.jpeg   the Vitality "FV" wordmark
//   - assets/brand/vitto-mascot-source.png     Vitto's mascot (Vivi the Vial)
// Run with `node scripts/generate-brand-assets.mjs` after replacing either
// source file. Outputs are committed; this script isn't part of the runtime.
import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const LOGO_SRC = join(ROOT, 'assets/brand/vitality-logo-source.jpeg');
const VIVI_SRC = join(ROOT, 'assets/brand/vitto-mascot-source.png');
const PUBLIC = join(ROOT, 'public');

// Keys a near-uniform background color out to transparent (with a soft
// ramp at the edges for anti-aliasing) — both source images were exported
// on flat backgrounds, so a simple distance-from-key matte works cleanly.
async function keyToTransparent(input, keyRgb, { near = 12, far = 40 } = {}) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const [kr, kg, kb] = keyRgb;
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - kr, dg = data[i + 1] - kg, db = data[i + 2] - kb;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    let alpha;
    if (dist <= near) alpha = 0;
    else if (dist >= far) alpha = 255;
    else alpha = Math.round(((dist - near) / (far - near)) * 255);
    data[i + 3] = alpha;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
}

async function trimmed(sharpInstance) {
  return sharpInstance.png().trim({ threshold: 5 });
}

async function main() {
  // Transparent wordmark for on-page use (nav bars, login) at a tall,
  // crisp resolution — CSS controls the display size.
  const logoTransparent = await trimmed(await keyToTransparent(LOGO_SRC, [255, 255, 255]));
  const logoBuf = await logoTransparent.toBuffer();
  writeFileSync(join(PUBLIC, 'vitality-logo.png'), logoBuf);
  console.log('wrote vitality-logo.png');

  // App/favicon icons: logo centered on a plain white square (matches the
  // artwork's own design — it was drawn on white) so iOS/Android, which
  // both require opaque icons, render it the way it was designed.
  const logoMeta = await sharp(logoBuf).metadata();
  async function iconSquare(size, safeZoneFraction, filename) {
    const targetW = Math.round(size * safeZoneFraction);
    const targetH = Math.round((targetW * logoMeta.height) / logoMeta.width);
    const resizedLogo = await sharp(logoBuf).resize(targetW, targetH, { fit: 'inside' }).toBuffer();
    const canvas = sharp({
      create: { width: size, height: size, channels: 4, background: '#ffffff' },
    });
    const out = await canvas
      .composite([{ input: resizedLogo, gravity: 'center' }])
      .png()
      .toBuffer();
    writeFileSync(join(PUBLIC, filename), out);
    console.log('wrote', filename);
  }

  await iconSquare(192, 0.7, 'icon-192.png');
  await iconSquare(512, 0.7, 'icon-512.png');
  await iconSquare(512, 0.5, 'icon-512-maskable.png'); // tighter safe zone for OS masking
  await iconSquare(180, 0.7, 'apple-touch-icon.png');
  await iconSquare(48, 0.75, 'icon-48.png');

  // Vitto's mascot, keyed transparent for chat-avatar use on any background.
  const viviTransparent = await trimmed(await keyToTransparent(VIVI_SRC, [248, 249, 244], { near: 10, far: 35 }));
  const viviBuf = await viviTransparent.resize(256, 256, { fit: 'inside' }).png().toBuffer();
  writeFileSync(join(PUBLIC, 'vitto-avatar.png'), viviBuf);
  console.log('wrote vitto-avatar.png');
}

main();
