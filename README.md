# Vitality

Multi-client coaching platform: a private client app (macro tracking, the "Vitto" AI food-logging chat, weight progress, habits/streaks) and a coach dashboard to see every client's targets and daily intake, today and historically.

Architecture and data model decisions are documented in [`/Users/francesco/.claude/plans/binary-painting-clover.md`](file:///Users/francesco/.claude/plans/binary-painting-clover.md).

## Stack

- **Next.js** (App Router, TypeScript) — one codebase, role-gated routes for clients vs. the coach
- **Supabase** — Postgres, Auth, and Row Level Security (the real security boundary — see `supabase/migrations/0001_init.sql`)
- **Anthropic API** (Claude Haiku) — optional fallback for Vitto's food parser when the local rule/fuzzy matcher can't confidently resolve a message

## Local development

```bash
npm install
cp .env.local.example .env.local   # fill in your Supabase project's URL + keys
npm run dev
```

Requires a Supabase project with the schema applied (`supabase/migrations/0001_init.sql`, run via the SQL Editor or `supabase db push`) and the food database seeded:

```bash
npx tsx scripts/seed-foods.ts
```

The very first account (yours, as coach) has to be created directly since there's no public sign-up:

```bash
npx tsx scripts/create-coach.ts you@example.com "Your Name"
```

Every other account is created from the coach dashboard (`/coach/clients/new`), which sends an invite email.

## Project structure

- `src/app/` — client pages (`/`, `/nutrition`, `/progress`, `/milestones`) and coach pages (`/coach/*`)
- `src/lib/vitto/` — the food parser (`parser.ts`, ported from the original app), food database (`foodDb.ts`), and LLM fallback (`llmFallback.ts`)
- `src/lib/supabase/` — browser/server/admin Supabase clients
- `src/proxy.ts` — session refresh + role-based route guarding (Next.js 16's renamed `middleware`)
- `supabase/migrations/` — schema + RLS policies
