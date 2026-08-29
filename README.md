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
│   └── lib/                # api-client, types, supabase, units, mock-data
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

## Endpoints (Phase 2 additions in **bold**)

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
| **POST** | **`/api/chat/narrate`** | **Groq narration** |
| WS | `/ws/uploads?token=...&uploadId=...` | live upload progress |

---

## Design tokens / system

The frontend uses the same "Data-Driven Editorial" design system described
in earlier docs — warm off-white surfaces, muted emerald + slate accents,
near-flat cards, single typeface (Public Sans). All colours route through
semantic tokens in `frontend/app/globals.css`; re-theming the app is a
one-file edit.

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