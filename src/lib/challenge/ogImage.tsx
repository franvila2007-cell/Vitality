import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

// Link preview (WhatsApp / Instagram / iMessage) for the 8-Week Challenge
// pages: the mint page, the Vitality logo and a navy headline. Without one,
// WhatsApp showed a black box.
export const OG_SIZE = { width: 1200, height: 630 };

export async function challengeOgImage(title: string, subtitle: string) {
  const logo = await readFile(join(process.cwd(), 'public/vitality-logo.png'), 'base64');
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#D6F5EE', padding: 80 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/png;base64,${logo}`} width={156} height={124} alt="" />
        <div style={{ marginTop: 36, fontSize: 30, fontWeight: 600, letterSpacing: 6, color: '#26A88A' }}>8-WEEK CHALLENGE</div>
        <div style={{ marginTop: 16, fontSize: 76, fontWeight: 700, color: '#333F6E', textAlign: 'center', lineHeight: 1.1 }}>{title}</div>
        <div style={{ marginTop: 22, fontSize: 34, color: '#333F6E', opacity: 0.75, textAlign: 'center' }}>{subtitle}</div>
      </div>
    ),
    OG_SIZE,
  );
}
