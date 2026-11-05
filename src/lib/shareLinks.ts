// The forms / pages the coach sends to people, for /coach/links. Add one here
// and it shows up there.

// Public address the links are built from (so they're right even when the
// coach opens the app on a preview or localhost).
export const APP_URL = 'https://vitality-one-zeta.vercel.app';

export type ShareLink = { id: string; emoji: string; title: string; /** what it's used for, a few words */ use: string; url: string };

export const SHARE_LINKS: ShareLink[] = [
  { id: 'join', emoji: '👋', title: 'Start with Vitality', use: 'New leads', url: `${APP_URL}/join` },
  { id: 'sales', emoji: '🎯', title: '1-1 coaching sales page', use: 'Sales calls', url: 'https://vitality-coaching-page.vercel.app' },
  { id: 'challenge-intake', emoji: '🏁', title: '8-Week Challenge sign-up', use: 'After they pay for the challenge', url: `${APP_URL}/challenge/intake` },
  { id: 'challenge-checkin', emoji: '✅', title: '8-Week Challenge check-in', use: 'Challenge members, weekly', url: `${APP_URL}/challenge/check-in` },
  { id: 'assessment', emoji: '📋', title: 'Onboarding assessment', use: 'New 1-1 clients', url: `${APP_URL}/assessment` },
  { id: 'vitality-meal-plan', emoji: '🥗', title: 'Vitality meal plan', use: 'Vitality meal plans', url: `${APP_URL}/vitality-meal-plan` },
  { id: 'ibf-meal-plan', emoji: '🛡️', title: 'IronBodyFit meal plan', use: 'IronBodyFit members', url: `${APP_URL}/ironbodyfit-meal-plans` },
  { id: 'app', emoji: '📱', title: 'App login', use: 'Client sign-in', url: `${APP_URL}/login` },
];
