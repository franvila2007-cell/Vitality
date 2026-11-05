// Every form / page the coach sends to people, with what it's for. This is the
// single list behind /coach/links — add a form here and it shows up there.

// Public address the links are built from (so they're right even when the
// coach opens the app on a preview or localhost).
export const APP_URL = 'https://vitality-one-zeta.vercel.app';

export type ShareVariant = { label: string; query: string; tag: string };

export type ShareLink = {
  id: string;
  emoji: string;
  title: string;
  /** short tag on the card, e.g. "Form" / "Sales page" */
  kind: string;
  /** who you send it to, and when */
  forWho: string;
  /** what happens when they open / submit it */
  what: string;
  url: string;
  /** same form, different tracking tag — e.g. /join?src=instagram */
  variants?: ShareVariant[];
  /** where the answers land in the coach app */
  lands?: { label: string; href: string };
  /** a ready-to-paste message; {link} is replaced with the URL */
  message: string;
  note?: string;
};

export type ShareGroup = { id: string; title: string; blurb: string; links: ShareLink[] };

export const SHARE_GROUPS: ShareGroup[] = [
  {
    id: 'new',
    title: 'Bringing new people in',
    blurb: 'For people who are curious but haven’t joined yet.',
    links: [
      {
        id: 'join', emoji: '👋', title: 'Start with Vitality', kind: 'Lead form',
        forWho: 'Anyone new — Instagram or TikTok followers, friends of clients, walk-ins.',
        what: 'A short form about their goals. They land in your CRM as a new lead. Pick where you’re posting it so the CRM knows which channel works.',
        url: `${APP_URL}/join`,
        variants: [
          { label: 'General', query: '', tag: 'Join form' },
          { label: 'Instagram', query: 'instagram', tag: 'Instagram' },
          { label: 'TikTok', query: 'tiktok', tag: 'TikTok' },
          { label: 'Facebook', query: 'facebook', tag: 'Facebook' },
          { label: 'Referral', query: 'referral', tag: 'Referral' },
          { label: 'Website', query: 'website', tag: 'Website' },
        ],
        lands: { label: 'CRM → Contacts', href: '/coach/crm/contacts' },
        message: 'Hey! If you want to get started with Vitality, fill this in and I’ll be in touch 👇\n{link}',
      },
      {
        id: 'sales', emoji: '🎯', title: '1-1 coaching sales page', kind: 'Sales page',
        forWho: 'People you’re about to speak to (or just spoke to) about 1-1 coaching.',
        what: 'The page you walk through on a sales call: what 1-1 coaching is and what’s included. Nothing to fill in.',
        url: 'https://vitality-coaching-page.vercel.app',
        message: 'Here’s everything about Vitality 1-1 coaching, take a look 👇\n{link}',
        note: 'coaching.vitalitymalta.com will replace this link once its DNS is set up.',
      },
    ],
  },
  {
    id: 'challenge',
    title: '8-Week Challenge',
    blurb: 'The two links challenge members use.',
    links: [
      {
        id: 'challenge-intake', emoji: '🏁', title: 'Challenge sign-up details', kind: 'Form',
        forWho: 'Everyone who joins the challenge. Stripe sends people here automatically after they pay — send it yourself only if someone paid but didn’t fill it in.',
        what: 'Their details, goals and health questions (with a safety check). They appear as a challenge sign-up in your CRM and the challenge dashboard.',
        url: `${APP_URL}/challenge/intake`,
        lands: { label: 'Challenge dashboard', href: '/coach/challenge' },
        message: 'Welcome to the Vitality 8-Week Challenge! 🏁 Please fill this in so we can build your 8 weeks around you 👇\n{link}',
      },
      {
        id: 'challenge-checkin', emoji: '✅', title: 'Weekly challenge check-in', kind: 'Form',
        forWho: 'All challenge members, every week. It’s one shared link — the form recognises each person by their email.',
        what: 'Weight, how they felt, their biggest win and what they need from you. Check-ins show up on the challenge dashboard.',
        url: `${APP_URL}/challenge/check-in`,
        lands: { label: 'Challenge check-ins', href: '/coach/challenge/check-ins' },
        message: 'Time for your weekly Vitality 8-Week Challenge check-in 💪 It takes a couple of minutes 👇\n{link}',
      },
    ],
  },
  {
    id: 'clients',
    title: 'New 1-1 clients',
    blurb: 'Once someone has said yes to coaching.',
    links: [
      {
        id: 'assessment', emoji: '📋', title: 'Onboarding assessment', kind: 'Form',
        forWho: 'New 1-1 coaching clients, before you build their plan.',
        what: 'The full onboarding questionnaire (“Let’s build your roadmap”). No account needed.',
        url: `${APP_URL}/assessment`,
        lands: { label: 'Assessments inbox', href: '/coach/assessments' },
        message: 'Welcome to Vitality! 🙌 Please fill in your onboarding assessment so I can build your roadmap 👇\n{link}',
      },
      {
        id: 'app', emoji: '📱', title: 'Vitality app login', kind: 'App',
        forWho: 'Clients who already have an account. New clients get their invite by email when you add them — this is just the sign-in page.',
        what: 'Sign in to the Vitality app: Today, Habits, Nutrition, Progress and Milestones.',
        url: `${APP_URL}/login`,
        lands: { label: 'Add a client', href: '/coach/clients/new' },
        message: 'Here’s the link to log in to your Vitality app 📱 Tip: open it on your phone and add it to your home screen.\n{link}',
      },
    ],
  },
  {
    id: 'meal-plans',
    title: 'Meal plans',
    blurb: 'Personalised meal plans, built automatically from the form.',
    links: [
      {
        id: 'vitality-meal-plan', emoji: '🥗', title: 'Vitality meal plan', kind: 'Form',
        forWho: 'Vitality clients and anyone buying a Vitality meal plan.',
        what: 'Their stats, goal and food preferences. The plan is built from it and you review it before it goes out.',
        url: `${APP_URL}/vitality-meal-plan`,
        lands: { label: 'V Plans inbox', href: '/coach/v-plans' },
        message: 'Fill this in and I’ll put together your personalised Vitality meal plan 🥗\n{link}',
        note: 'The older link /v-plan still works and sends people to this form.',
      },
      {
        id: 'ibf-meal-plan', emoji: '🛡️', title: 'IronBodyFit meal plan', kind: 'Form',
        forWho: 'IronBodyFit members (Sliema or Mriehel).',
        what: 'The same plan builder, branded “IronBodyFit Meal Plans · Powered by Vitality”. They choose their gym location. Each plan is logged as a €10 meal plan in your CRM.',
        url: `${APP_URL}/ironbodyfit-meal-plans`,
        lands: { label: 'IronBodyFit meal plans inbox', href: '/coach/meal-plans' },
        message: 'Here’s your IronBodyFit meal plan form — fill it in and your personalised plan will be put together for you 🛡️\n{link}',
      },
    ],
  },
];

export function variantUrl(link: ShareLink, v?: ShareVariant): string {
  return v && v.query ? `${link.url}?src=${v.query}` : link.url;
}
