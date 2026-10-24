import type { CodexActivity, CodexMonitoring } from "./codex";

export const ACTIVITY_RANGE_DAYS = 84;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DATE_MS = 8.64e15;

export type ActivityIntensity = 0 | 1 | 2 | 3 | 4 | null;

export interface ActivityCell {
  /** Null marks alignment padding outside the requested 84-day range. */
  date: string | null;
  tokens: number | null;
  intensity: ActivityIntensity;
  isPadding: boolean;
}

export interface ActivitySummary {
  lifetimeTokens: number | null;
  peakDailyTokens: number | null;
  currentStreakDays: number | null;
  longestStreakDays: number | null;
  longestRunningTurnSec: number | null;
}

export interface ActivityGrid {
  state: "unavailable" | "current" | "stale" | "error";
  weeks: ActivityCell[][];
  summary: ActivitySummary;
  startDate: string | null;
  endDate: string | null;
  fetchedAtMs: number | null;
  hasBuckets: boolean;
}

export function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isValidTimestamp(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    Math.abs(value) <= MAX_DATE_MS &&
    Number.isFinite(new Date(value).getTime())
  );
}

/** Accept only a real YYYY-MM-DD UTC calendar date; never parse through local time. */
export function parseUtcCalendarDate(value: unknown): { iso: string; dayIndex: number } | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const millis = Date.parse(value + "T00:00:00.000Z");
  if (!isValidTimestamp(millis)) return null;
  const date = new Date(millis);
  if (date.toISOString().slice(0, 10) !== value) return null;
  return { iso: value, dayIndex: Math.floor(millis / DAY_MS) };
}

function isoForDay(dayIndex: number): string | null {
  const millis = dayIndex * DAY_MS;
  if (!isValidTimestamp(millis)) return null;
  return new Date(millis).toISOString().slice(0, 10);
}

function weekdayIndex(dayIndex: number): number {
  return (((dayIndex + 4) % 7) + 7) % 7;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanSummary(value: unknown): ActivitySummary {
  const summary = record(value);
  const metric = (key: keyof ActivitySummary) => {
    const candidate = summary?.[key];
    return isNonnegativeSafeInteger(candidate) ? candidate : null;
  };
  const cleaned = {
    lifetimeTokens: metric("lifetimeTokens"),
    peakDailyTokens: metric("peakDailyTokens"),
    currentStreakDays: metric("currentStreakDays"),
    longestStreakDays: metric("longestStreakDays"),
    longestRunningTurnSec: metric("longestRunningTurnSec"),
  };
  if (
    cleaned.currentStreakDays !== null &&
    cleaned.longestStreakDays !== null &&
    cleaned.currentStreakDays > cleaned.longestStreakDays
  ) {
    cleaned.currentStreakDays = null;
    cleaned.longestStreakDays = null;
  }
  return cleaned;
}

function cleanActivityState(value: unknown): ActivityGrid["state"] {
  return value === "current" || value === "stale" || value === "error" ? value : "unavailable";
}

function emptyWeeks(): ActivityCell[][] {
  return [];
}

/**
 * Normalize sparse provider daily buckets into calendar-aligned UTC weeks.
 * Missing, null, malformed, unsafe, or conflicting values remain unknown.
 */
export function buildActivityGrid(input: CodexActivity, nowMs: number = Date.now()): ActivityGrid {
  const activity = record(input) ?? {};
  const summary = cleanSummary(activity.summary);
  const fetchedAtMs = isValidTimestamp(activity.fetchedAtMs) ? activity.fetchedAtMs : null;
  const rawBuckets = activity.dailyBuckets;
  const state = cleanActivityState(activity.state);

  if (!isValidTimestamp(nowMs)) {
    return {
      state: "unavailable",
      weeks: emptyWeeks(),
      summary,
      startDate: null,
      endDate: null,
      fetchedAtMs,
      hasBuckets: false,
    };
  }

  const todayIndex = Math.floor(nowMs / DAY_MS);
  const startIndex = todayIndex - (ACTIVITY_RANGE_DAYS - 1);
  const gridStartIndex = startIndex - weekdayIndex(startIndex);
  const gridEndIndex = todayIndex + (6 - weekdayIndex(todayIndex));
  const startDate = isoForDay(startIndex);
  const endDate = isoForDay(todayIndex);
  if (!startDate || !endDate) {
    return {
      state: "unavailable",
      weeks: emptyWeeks(),
      summary,
      startDate: null,
      endDate: null,
      fetchedAtMs,
      hasBuckets: false,
    };
  }

  if (!Array.isArray(rawBuckets)) {
    return {
      state: state === "error" ? "error" : "unavailable",
      weeks: emptyWeeks(),
      summary,
      startDate,
      endDate,
      fetchedAtMs,
      hasBuckets: false,
    };
  }

  const bucketValues = new Map<number, { tokens: number | null; conflict: boolean }>();
  for (const rawBucket of rawBuckets) {
    const bucket = record(rawBucket);
    const parsedDate = parseUtcCalendarDate(bucket?.date);
    if (
      !bucket ||
      !parsedDate ||
      parsedDate.dayIndex < startIndex ||
      parsedDate.dayIndex > todayIndex
    )
      continue;

    const tokens = isNonnegativeSafeInteger(bucket.tokens) ? bucket.tokens : null;
    const previous = bucketValues.get(parsedDate.dayIndex);
    if (!previous) {
      bucketValues.set(parsedDate.dayIndex, { tokens, conflict: false });
    } else if (previous.tokens !== tokens) {
      bucketValues.set(parsedDate.dayIndex, { tokens: null, conflict: true });
    }
  }

  const positiveValues = [
    ...new Set(
      [...bucketValues.values()]
        .filter((bucket) => !bucket.conflict && bucket.tokens !== null && bucket.tokens > 0)
        .map((bucket) => bucket.tokens as number),
    ),
  ].sort((left, right) => left - right);
  const intensityByTokens = new Map<number, Exclude<ActivityIntensity, null>>();
  positiveValues.forEach((tokens, index) => {
    const intensity =
      positiveValues.length === 1
        ? 4
        : ((1 + Math.floor((index * 3) / (positiveValues.length - 1))) as Exclude<
            ActivityIntensity,
            null
          >);
    intensityByTokens.set(tokens, intensity);
  });

  const weeks: ActivityCell[][] = [];
  let week: ActivityCell[] = [];
  for (let dayIndex = gridStartIndex; dayIndex <= gridEndIndex; dayIndex += 1) {
    const inRange = dayIndex >= startIndex && dayIndex <= todayIndex;
    const date = inRange ? isoForDay(dayIndex) : null;
    const bucket = inRange ? bucketValues.get(dayIndex) : undefined;
    const tokens = bucket && !bucket.conflict ? bucket.tokens : null;
    const intensity: ActivityIntensity =
      !inRange || tokens === null
        ? null
        : tokens === 0
          ? 0
          : (intensityByTokens.get(tokens) ?? null);
    week.push({ date, tokens, intensity, isPadding: !inRange });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) weeks.push(week);

  return {
    state: state === "unavailable" ? "unavailable" : state,
    weeks,
    summary,
    startDate,
    endDate,
    fetchedAtMs,
    hasBuckets: rawBuckets.length > 0,
  };
}

function dateAtOffset(nowMs: number, offsetDays: number): string {
  const dayIndex = Math.floor(nowMs / DAY_MS) + offsetDays;
  return isoForDay(dayIndex) ?? "1970-01-01";
}

/** Explicit synthetic fixture used only by the Settings demo preview. */
export function createDemoMonitoring(nowMs: number = Date.now()): CodexMonitoring {
  const timestamp = isValidTimestamp(nowMs) ? nowMs : Date.now();
  const samples: (number | null)[] = [0, 24, 0, null, 450, 1200, 0, 90, 0, 250, 500, 75, 0, 140];
  const dailyBuckets = samples.flatMap((tokens, index) =>
    tokens === null
      ? []
      : [{ date: dateAtOffset(timestamp, index - (samples.length - 1)), tokens }],
  );

  return {
    buckets: [
      {
        label: "Session",
        credits: { hasCredits: true, unlimited: false, balance: "42", unit: "credits" },
        spending: {
          limit: "100",
          used: "31.5",
          remainingPercent: 68.5,
          resetAtMs: timestamp + 4 * 60 * 60 * 1000,
          unit: null,
        },
      },
      { label: "Weekly", credits: null, spending: null },
    ],
    earnedResets: {
      availableCount: 2,
      details: [
        {
          status: "available",
          grantedAtMs: timestamp - 2 * 60 * 60 * 1000,
          expiresAtMs: timestamp + 7 * 24 * 60 * 60 * 1000,
        },
        {
          status: "unknown",
          grantedAtMs: null,
          expiresAtMs: null,
        },
      ],
    },
    activity: {
      state: "current",
      summary: {
        lifetimeTokens: 31_500,
        peakDailyTokens: 1200,
        currentStreakDays: 1,
        longestStreakDays: 5,
        longestRunningTurnSec: 185,
      },
      dailyBuckets,
      fetchedAtMs: timestamp,
      diagnostic: null,
    },
  };
}
