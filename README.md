# Numa — Frontend Prototype

An AI-powered personal health and performance context platform. This is a working Next.js
prototype implementing the "Data-Driven Editorial" design system: warm off-white surfaces,
muted emerald/slate accents, near-flat cards, and a single typeface (Public Sans) carrying the
entire hierarchy through weight and line-height rather than mixed font families.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000. The `/` route is the marketing landing page; everything else lives
behind the persistent app shell at `/dashboard`, `/today`, `/activity`, `/insights`, `/timeline`,
`/reports`, and `/chat`.

To verify a production build:

```bash
npm run build
npm start
```

All data is local, deterministic mock data (`lib/mock-data.ts`) — there is no backend, auth, or
real API integration in this phase, per spec.

## Architecture

- **Next.js 16, App Router, strict TypeScript.**
- **Route groups:** `app/(app)/` holds the seven authenticated routes and shares one layout
  (`app/(app)/layout.tsx`) that renders the sidebar, mobile bottom nav, and content frame. The
  marketing page at `app/page.tsx` sits outside that group and has no app chrome.
- **Server Components by default.** Only five files carry `"use client"`, each the smallest
  possible island: `Sidebar` / `MobileNav` (active-route highlighting), `ReflectionForm`,
  `WorkoutChatInput`, and `ChatInterface` (all local `useState`, no external state library —
  nothing here needed one).
- **Charts are hand-rolled server-rendered SVG** (`components/charts/sparkline.tsx`) rather than
  a client charting library, since the sparklines are static per render and don't need
  client-side interactivity or bundle weight.
- **Design tokens live in `app/globals.css`** as CSS custom properties and are mapped into
  Tailwind's `theme.extend.colors` in `tailwind.config.ts`. Nothing in `components/` or `app/`
  uses a raw Tailwind color utility (`bg-blue-500` etc.) — everything routes through the
  semantic tokens (`bg-surface-raised`, `text-status-attention`, `border-accent-emerald`, etc.),
  so re-theming the whole app is a one-file edit.

## Design system notes

- **Color:** surfaces (`base` / `raised` / `sunken`), text (`primary` / `secondary` / `muted`),
  two brand accents (muted emerald primary, slate blue secondary), and four status colors
  (forest green / amber / rust red / slate gray) — each with a paired "soft" background tint for
  chips and callouts.
- **Radius:** capped at 4px (`rounded-card`) — no pill buttons, no heavy rounding, in line with
  the financial-publication reference.
- **Numbers use `tabular-nums`** everywhere (`.tabular` utility class) so metrics don't jitter
  as digits change width.
- **Epistemic humility is a first-class UI pattern**, not just copy: `ConfidenceBadge` (3-bar
  indicator + label) appears next to every AI-generated claim, and the Insights / Chat responses
  are structured into Observation → Supporting Evidence → Confidence → Alternative Explanations
  rather than a single paragraph of prose.
- **Messy data is visible, not hidden.** `lib/mock-data.ts` seeds ~10% missing wearable days,
  intermittent subjective notes ("skipped breakfast," "felt heavy"), and inconsistent sleep —
  and the UI renders `—` rather than fabricating a number when data is absent.

## What's implemented

| Route | Notes |
|---|---|
| `/` | Hero, raw-vs-context problem statement, 4-month adaptation timeline, CTA |
| `/dashboard` | Today's State card (score + trend + confidence), What Changed, one AI Insight |
| `/today` | Full metric grid, reflection form (client island), 7-day table |
| `/activity` | Workout list with baseline delta |
| `/activity/[id]` | Objective + subjective metrics, Numa's Interpretation panel, scoped chat input |
| `/insights` | Full structured reasoning cards for all detected patterns |
| `/timeline` | Grouped chronological ledger across workouts, reflections, sleep, milestones |
| `/reports` | Week-over-week comparison, 30-day trend, monthly summary |
| `/chat` | Context Drawer + structured assistant responses (scripted, no live model call) |

## Extending this prototype

- Swap `lib/mock-data.ts` for real data fetching (Server Components can `fetch` directly; add
  `loading.tsx` per route as needed — one is already provided for the `(app)` group).
- The `/chat` route's `mockAssistantResponse()` in `components/chat/chat-interface.tsx` is the
  seam to replace with a real model call.
- Dark mode is not implemented per the brief (explicitly out of scope), but the token structure
  in `globals.css` would support a `.dark` variable block if that changes later.
