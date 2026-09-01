---
title: Numa
emoji: 🏃
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# Numa

An AI-powered personal health and performance context platform. Built as a
monorepo: a Next.js 16 frontend, an Express 5 + BullMQ backend, a Supabase
database, and an optional Groq LLM narration layer.

The system is structured around five progressive layers:

1. **Raw workouts** — uploaded from CSV / GPX / manual entry
2. **Baselines** — rolling per-(user, activity, metric, window) stats
3. **Per-workout comparison** — derived at read time, never stored
4. **Long-window progress trend** — month-over-month per metric
5. **Verified correlation patterns + LLM narration** — the differentiator

LLM narration is *narrow and well-scoped*: it only ever narrates pre-computed
facts from layers 2-4, never invents statistics itself.

---

## Repository layout

```
numa/
├── backend/                # Express 5 + BullMQ + Supabase + Groq
│   ├── src/
│   │   ├── config/         # env validation, Redis, Supabase clients
│   │   ├── jobs/           # BullMQ queues + workers
│   │   ├── routes/         # Express routers (uploads, workouts, users, auth, chat)
│   │   ├── server/         # WSS layer for live upload progress
│   │   ├── utils/          # metrics, stats, baselines, correlation, progress, llm
│   │   └── middleware/     # requireAuth
│   └── supabase/migrations/
├── frontend/               # Next.js 16 (App Router)
│   ├── app/(app)/          # authenticated shell: dashboard, today, activity, insights, reports, chat, timeline, upload, profile
│   ├── components/         # charts, dashboard widgets, chat, ui primitives
│   │   └── chat/           # chat-history-sidebar, chat-sources, chat-thread, chat-page-shell, chat-route-shell, chat-header-bar, chat-input-bar, context-drawer
│   ├── lib/                # api-client, types, supabase, units, mock-data, use-chat-sessions, use-theme
│   └── hooks/              # (if any)
├── data-gen/               # standalone Supabase seeder + sample CSV/GPX exporter
└── sample-data/            # generated sample files for upload testing
```

---

## Setup

### Prerequisites

- Node 20+
- pnpm 11.x
- A Supabase project (URL + secret key)
- (optional) A Groq API key for the narration layer

### Install

```bash
pnpm install
```

### Backend

```bash
cd backend
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_JWT_SECRET
# (Optional) fill in GROQ_API_KEY
pnpm run dev
```

The backend listens on `:4000` by default. It connects to Redis at
`127.0.0.1:6379` (see `docker-compose.yml`) for BullMQ.

### Database migrations

Apply each migration in `backend/supabase/migrations/` to your Supabase
project, in order:

- `001_initial_schema.sql` — users, workouts, reflections, baselines stub, raw_uploads
- `002_create_storage_bucket.sql` — `raw-uploads` private bucket with per-user folder RLS
- `003_user_profiles.sql` — user_profiles (display_name, units)
- **`004_phase2_intelligence.sql`** — multi-window baselines uniqueness, `discovered_patterns`, `daily_metrics`
- **`005_chat_sessions.sql`** — `chat_sessions` + `chat_messages` for persistent chat history with history rail (Claude/ChatGPT-style sidebar), auto-derived titles, message counts, and narration JSON persistence

### Frontend

```bash
cd frontend
cp .env.local.example .env.local   # if you have one; otherwise the defaults are fine
pnpm run dev
```

Open http://localhost:3000.

### Seed demo data (optional, recommended for the judging account)

```bash
cd data-gen
npm install
cp .env.example .env   # fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm run seed           # populates 4 personas (3 demo + 1 judging)
```

See `data-gen/README.md` for the demo account credentials and the underlying
state model.

---

## Phase 2 — stats pipeline architecture

### Layer 1: Raw workouts

The `workouts` table stores one row per session. Metric payloads live in a
JSONB column (`metrics`) so the schema doesn't need to evolve every time a
new metric appears in an export.

The CSV / GPX parsers normalize everything into a small set of canonical
metric names:

- `distance_km`
- `duration_seconds` (also a top-level column)
- `avg_hr`
- `avg_pace_min_km` (lower = faster)
- `avg_speed_kmh`
- `calories`

See `backend/src/utils/metrics.ts` for the canonical definitions — every
other layer reads through these.

### Layer 2: Baselines (per-(user, activity, metric, window))

`backend/src/jobs/workers/baselineWorker.ts` consumes `baselineQueue` jobs.
A job is enqueued whenever a workout lands (manual insert or upload worker).

For each `(user, activity_type)`:

- **Short window (14 days)** — what "normal for you right now" looks like
- **Long window (90 days)** — what your overall trend looks like

For each window, for every applicable metric, the worker computes:

- `rolling_mean` — sample mean of the metric across the window's workouts
- `rolling_stddev` — sample stddev (Bessel-corrected, n-1 denominator)
- `sample_count` — number of workouts that contributed

When `sample_count < 5` (the `MIN_SAMPLES` gate), the row is *not* written.
The comparison layer reads the absence as `insufficient_data` and the UI
shows "Numa needs more sessions" rather than fabricating a number.

The baselines table also has a `window_days` column — the unique key is
`(user_id, metric_name, activity_type, window_days)` so each window is a
separate row.

### Layer 3: Per-workout comparison (derived live)

When a workout is loaded, `GET /api/workouts` and `GET /api/workouts/:id/comparison`
return:

```json
{
  "workout": {...},
  "comparison": {
    "avg_hr": {
      "value": 165,
      "baseline_mean": 148,
      "baseline_stddev": 8,
      "deviation_pct": 11.5,
      "z_score": 2.13,
      "label": "notably_above"
    }
  },
  "baseline_window_days": 14
}
```

The label buckets follow the spec:

- `|z| < 0.5` → `typical`
- `0.5 ≤ |z| < 1.5` → `somewhat_above` / `somewhat_below`
- `|z| ≥ 1.5` → `notably_above` / `notably_below`

This is the first "real, non-AI demo" — a workout card showing
"HR 165 bpm — notably above your normal (baseline 148 ± 8)" ships from the
stats layer alone.

### Layer 4: Progress trend (month-over-month)

`GET /api/users/me/progress` returns one entry per
`(activity_type, metric)`:

```json
{
  "metric_name": "avg_pace_min_km",
  "metric_label": "Avg Pace",
  "metric_unit": "min/km",
  "activity_type": "running",
  "earliest_month_mean": 5.8,
  "latest_month_mean": 5.32,
  "pct_change": -8.3,
  "direction": "improving",
  "sample_count": 12,
  "confidence": "high",
  "earliest_month": "2026-06",
  "latest_month": "2026-08"
}
```

The direction label accounts for `betterWhen` ("lower is better" metrics
like pace are labelled "improving" when the value went *down*). Confidence
is a 3-bucket label based on the smaller month's sample count. This is
deliberately a simple month-vs-month comparison rather than a regression —
simpler is both easier to defend and easier to explain to the user.

### Layer 5: Correlation engine + LLM narration

`backend/src/jobs/workers/correlationWorker.ts` runs three pre-defined
hypothesis tests per user, per activity:

| `check_name` | x | y |
|---|---|---|
| `sleep_vs_performance` | prior-night sleep hours | next-day pace |
| `effort_rating_vs_avg_hr` | reflection.effort_rating | avg_hr |
| `training_load_vs_avg_hr` | recent training load | avg_hr |

For each check that produces ≥ 8 paired samples AND `|r| ≥ 0.4`, a row is
written to `discovered_patterns` with:

- `pearson_r`, `sample_count`, `direction` (positive/negative)
- `template_summary` — a templated sentence filled in with the real
  numbers; this is the *only* human-readable string the LLM downstream
  will narrate.

The `template_summary` is filled in by fixed templates in
`backend/src/utils/correlation.ts` — there is exactly one template per
check, and the model never invents statistics.

`POST /api/chat/narrate` is the LLM endpoint. The prompt only contains:

- the user's question
- the relevant baseline/comparison numbers
- any fired `discovered_patterns` rows
- recent reflection notes

The model is required to respond in JSON matching
`{observation, possible_contributors, evidence_count, confidence, alternatives}`
and is explicitly forbidden from citing numbers it wasn't given. If
`GROQ_API_KEY` is unset, the route returns `503` and the frontend falls
back to a templated message — the rest of the system runs without an LLM.

---

## Chat system (Phase 2.5)

The `/chat` route has been rewritten as a persistent, Claude/ChatGPT-style
conversation interface:

- **History rail** — left sidebar lists all past sessions ordered by most recent activity (`updated_at`). Each session shows an auto-derived title (first 60 chars of the first user message) and message count.
- **Session persistence** — conversations survive reloads. Sessions are created lazily on the first narrate call or explicitly via the "New chat" button.
- **Full transcript hydration** — clicking a session loads its complete message history from `chat_messages`.
- **Narration sources panel** — assistant messages surface their evidence: the exact `template_summary` from `discovered_patterns`, the baseline/comparison numbers used, the reflection notes cited, and the intent classification (load / trend / pattern / deviation / general).
- **Follow-up questions** — the LLM response includes `questions_for_you` (2-3 suggested follow-ups grounded in the data just discussed).
- **Intent classification** — the narrate route classifies the question before building context:
  - `load` — "am I training too much right now?" → pulls `training_load_vs_avg_hr` pattern + last 7 reflection effort/energy/notes
  - `trend` — "how is my progress going?" → pulls month-over-month progress data
  - `pattern` — "does sleep affect my pace?" → pulls relevant `discovered_patterns`
  - `deviation` — "why was my HR high today?" → pulls full per-metric comparison for the focus workout
  - `general` — falls back to available context
- **Conversation history** — the last 6 turns are passed to the LLM so it can reference its own prior replies when the user follows up with subjective experience the data doesn't corroborate.
- **Takeaway field** — assistant responses include a `takeaway` (1-2 sentence grounded interpretation) used as the condensed representation in conversation history.

All chat data is RLS-scoped to the authenticated user via `chat_sessions` and `chat_messages` tables (migration 005).

---

## Endpoints (Phase 2 additions in **bold**, Chat additions in ***bold italics***)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` (handled by Supabase client) | issue JWT |
| GET | `/api/users/me` | profile |
| PATCH | `/api/users/me` | update profile |
| GET | `/api/users/me/baselines` | raw baseline rows |
| **GET** | **`/api/users/me/progress`** | **month-over-month trend** |
| **GET** | **`/api/users/me/patterns`** | **discovered_patterns rows** |
| **GET** | **`/api/users/me/insights`** | **patterns + baselines + summary** |
| GET | `/api/workouts?limit=50` | workouts (now enriched with `comparison`) |
| GET | `/api/workouts/:id` | workout detail |
| **GET** | **`/api/workouts/:id/comparison`** | **standalone comparison payload** |
| POST | `/api/workouts` | create manual workout → enqueues baseline + correlation |
| POST | `/api/workouts/:id/reflection` | upsert reflection → enqueues correlation |
| **POST** | **`/api/workouts/:id/recompute`** | **manual recompute trigger** |
| POST | `/api/uploads/sign` | signed upload URL |
| POST | `/api/uploads/:id/complete` | enqueue processing |
| **POST** | **`/api/chat/narrate`** | **Groq narration (now with session_id, history, intent classification, sources, follow-ups)** |
| ***GET*** | ***`/api/chat/sessions`*** | ***list user's chat sessions (ordered by updated_at desc, with message_count)*** |
| ***POST*** | ***`/api/chat/sessions`*** | ***create new chat session*** |
| ***GET*** | ***`/api/chat/sessions/:id/messages`*** | ***load full transcript for a session*** |
| ***PATCH*** | ***`/api/chat/sessions/:id`*** | ***rename session (title)*** |
| ***DELETE*** | ***`/api/chat/sessions/:id`*** | ***delete session (cascades to messages)*** |
| WS | `/ws/uploads?token=...&uploadId=...` | live upload progress |

---

## Deployment: Hugging Face Spaces (Docker)

The backend includes a `Dockerfile` and GitHub Actions workflow
(`.github/workflows/deploy-backend.yaml`) for deploying to Hugging Face
Spaces as a Docker Space.

Key configuration:

- **Port**: The app listens on `7860` (HF Spaces requirement) — set via `PORT` env var
- **WebSocket proxy**: The `ws` package proxies `/ws/uploads` to the internal WebSocket server
- **Redis**: Connects to `127.0.0.1:6379` with `family: 4` (IPv4) to avoid IPv6 issues in container environments
- **Timeouts**: Increased HTTP/WS timeouts for large file uploads

To deploy:

1. Push to a Hugging Face Space (Docker SDK)
2. Set Space secrets: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`, `GROQ_API_KEY` (optional), `REDIS_URL` (if using managed Redis)
3. The workflow builds and pushes on merge to `main`

---

## Design tokens / system

The frontend uses the same "Data-Driven Editorial" design system described
in earlier docs — warm off-white surfaces, muted emerald + slate accents,
near-flat cards, single typeface (Public Sans). All colours route through
semantic tokens in `frontend/app/globals.css`; re-theming the app is a
one-file edit.

**Theme system** — The app now has a complete theme toggle with three modes: `light`, `dark`, `system`. The `use-theme.ts` hook initializes to `system` and syncs with the actual resolved theme (via `window.matchMedia`). The `theme-nav-controls` and `theme-toggle` components provide the UI in the top header.

Epistemic humility is a first-class UI pattern: confidence badges, structured
Observation / Supporting Evidence / Confidence / Alternative Explanations
layouts, missing-data dashes (`—`) rather than fabricated numbers.

---

## Why this is a deliberately narrow AI surface

The Phase 2 design is built around the principle that the LLM is a
narrator, not an analyst. Concretely:

- Every number the LLM sees was computed by a pure function in `utils/`.
- Every claim the LLM makes about a relationship is anchored to a row in
  `discovered_patterns` that passed a Pearson test.
- The `template_summary` is filled in from a fixed template per check —
  the same one a human analyst would write by hand.
- The prompt explicitly forbids the model from inventing numbers and
  uses `response_format: json_object` to constrain the output.

This makes the system much easier to defend in a Feasibility & Safety
review: the model can mis-narrate a verified fact, but it can't *invent*
a relationship that isn't there.