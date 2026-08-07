import type { DailyMetrics, Workout, Insight, TimelineEvent } from "./types";

// Small deterministic PRNG so the mock dataset is stable across server renders.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)] as T;

const NOTES = [
  "Skipped breakfast, rushed out the door",
  "Felt heavy through the whole session",
  "Good energy, slept well the night before",
  "Stressful day at work, mind wasn't in it",
  "Legs felt fresh, first time in a week",
  "Forgot to log dinner",
  "Traveling, thrown off my usual routine",
  "Low motivation but pushed through",
  "Felt strong, best session in weeks",
  null,
  null,
];

const DAYS = 30;

function buildDailyMetrics(): DailyMetrics[] {
  const days: DailyMetrics[] = [];
  let baseline = 62;

  for (let i = DAYS - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    // Simulate ~10% missing-data days, common with real wearables.
    const missing = rand() < 0.1;
    const drift = (rand() - 0.5) * 10;
    baseline = Math.max(35, Math.min(90, baseline + drift * 0.3));

    const sleepHours = missing ? null : Math.round((5.5 + rand() * 3) * 10) / 10;
    const sleepQuality: DailyMetrics["sleepQuality"] =
      missing || sleepHours === null
        ? null
        : sleepHours < 6.2
        ? "poor"
        : sleepHours < 7.3
        ? "fair"
        : "good";

    days.push({
      dateIndex: i,
      date,
      recoveryScore: missing ? null : Math.round(baseline),
      restingHR: missing ? null : Math.round(48 + rand() * 10),
      hrv: missing ? null : Math.round(38 + rand() * 30),
      sleepHours,
      sleepQuality,
      trainingLoad: Math.round(rand() * 100),
      note: rand() < 0.4 ? pick(NOTES) : null,
      effort: rand() < 0.5 ? Math.round(3 + rand() * 6) : null,
    });
  }
  return days;
}

export const dailyMetrics = buildDailyMetrics();

function buildWorkouts(): Workout[] {
  const types: Workout["type"][] = ["Run", "Ride", "Strength", "Swim", "Mobility"];
  const workouts: Workout[] = [];
  let idCounter = 1;

  for (let i = DAYS - 1; i >= 0; i--) {
    if (rand() < 0.55) continue; // rest days
    const date = new Date();
    date.setDate(date.getDate() - i);
    const type = pick(types);
    const isCardio = type === "Run" || type === "Ride" || type === "Swim";

    workouts.push({
      id: `w-${idCounter++}`,
      dateIndex: i,
      date,
      type,
      title:
        type === "Run"
          ? pick(["Easy Run", "Tempo Run", "Long Run", "Recovery Jog"])
          : type === "Ride"
          ? pick(["Endurance Ride", "Interval Session", "Recovery Spin"])
          : type === "Strength"
          ? pick(["Lower Body", "Upper Body", "Full Body"])
          : type === "Swim"
          ? "Pool Session"
          : "Mobility & Stretch",
      distanceKm: isCardio ? Math.round((3 + rand() * 15) * 10) / 10 : null,
      durationMin: Math.round(20 + rand() * 70),
      avgPace: type === "Run" ? `${4 + Math.floor(rand() * 2)}:${String(Math.floor(rand() * 60)).padStart(2, "0")}/km` : null,
      avgHR: isCardio ? Math.round(128 + rand() * 40) : null,
      perceivedEffort: Math.round(3 + rand() * 6),
      reflection: rand() < 0.6 ? pick(NOTES) : null,
      baselineDeltaPct: Math.round((rand() - 0.55) * 24),
    });
  }
  return workouts.sort((a, b) => a.dateIndex - b.dateIndex);
}

export const workouts = buildWorkouts();

export const insights: Insight[] = [
  {
    id: "ins-1",
    title: "Cycling volume appears related to next-day run pace",
    observation:
      "On the four days following a ride longer than 45 minutes, your next-day easy run pace was slower than your rolling baseline.",
    evidence: [
      "3 of 4 post-ride runs were 6–11% slower than your 30-day pace baseline",
      "Perceived effort on those runs was rated 2 points higher on average",
      "Resting heart rate was mildly elevated the following morning in 3 of 4 cases",
    ],
    confidence: "moderate",
    alternatives: [
      "Could reflect general accumulated fatigue rather than cycling specifically",
      "Small sample size — only 4 instances in the last 30 days",
    ],
    relatedMetric: "Pace vs. Training Load",
    status: "info",
  },
  {
    id: "ins-2",
    title: "Sleep under 6.5 hours is a possible contributor to lower recovery",
    observation:
      "Recovery score is meaningfully lower the morning after nights with less than 6.5 hours of sleep, more consistently than any other single factor tracked.",
    evidence: [
      "Average recovery score was 14 points lower after short-sleep nights",
      "The pattern held across both training and rest days",
    ],
    confidence: "high",
    alternatives: ["Stress or late meals on those same nights could be a shared underlying cause"],
    relatedMetric: "Sleep Duration vs. Recovery",
    status: "attention",
  },
  {
    id: "ins-3",
    title: "Heat tolerance on runs has improved over the last 4 months",
    observation:
      "At similar effort levels, your pace-to-heart-rate ratio in warm conditions has trended upward, suggesting improving heat adaptation.",
    evidence: [
      "Cardiac drift during warm-weather runs has declined roughly 18% since your first logged sessions",
      "Perceived effort at matched paces has dropped slightly across the same window",
    ],
    confidence: "moderate",
    alternatives: ["General fitness gains could also explain part of this trend"],
    relatedMetric: "Heat Adaptation",
    status: "positive",
  },
];

function buildTimeline(): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  let id = 1;
  for (const w of workouts) {
    events.push({
      id: `t-${id++}`,
      dateIndex: w.dateIndex,
      date: w.date,
      category: "workout",
      title: `${w.type} — ${w.title}`,
      detail: w.reflection ?? `${w.durationMin} min session logged`,
      status: w.baselineDeltaPct !== null && w.baselineDeltaPct < -8 ? "attention" : "info",
    });
  }
  for (const d of dailyMetrics) {
    if (d.note) {
      events.push({
        id: `t-${id++}`,
        dateIndex: d.dateIndex,
        date: d.date,
        category: "reflection",
        title: "Reflection logged",
        detail: d.note,
        status: "info",
      });
    }
    if (d.sleepQuality === "poor") {
      events.push({
        id: `t-${id++}`,
        dateIndex: d.dateIndex,
        date: d.date,
        category: "sleep",
        title: "Short sleep night",
        detail: `${d.sleepHours}h logged — below your usual range`,
        status: "attention",
      });
    }
  }
  events.push({
    id: `t-${id++}`,
    dateIndex: 21,
    date: (() => {
      const d = new Date();
      d.setDate(d.getDate() - 21);
      return d;
    })(),
    category: "milestone",
    title: "Longest run in 3 months",
    detail: "Completed a 17.2km long run, extending your endurance baseline",
    status: "positive",
  });

  return events.sort((a, b) => a.dateIndex - b.dateIndex);
}

export const timelineEvents = buildTimeline();

export function getWorkoutById(id: string): Workout | undefined {
  return workouts.find((w) => w.id === id);
}

export const today = dailyMetrics[dailyMetrics.length - 1] as DailyMetrics;
export const yesterday = dailyMetrics[dailyMetrics.length - 2] as DailyMetrics;
