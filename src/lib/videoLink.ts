// The coach's video call link (a reusable Google Meet room, Zoom, …). It ends up in emails
// and on buttons, so only a plain https address is ever accepted.

/** "" (no link), the cleaned https address, or null when what was typed isn't a usable link. */
export function cleanVideoLink(input: string): string | null {
  const raw = input.trim();
  if (!raw) return '';
  if (/\s/.test(raw)) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(raw) ? `https://${raw}` : null;
  if (!withScheme) return null;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    u.protocol = 'https:';
    return u.toString().length <= 300 ? u.toString() : null;
  } catch {
    return null;
  }
}
