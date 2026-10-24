import {
  buildActivityGrid,
  createDemoMonitoring,
  parseUtcCalendarDate,
  type ActivityGrid,
} from "../src/lib/activity";
import { unavailableCodexMonitoring, type CodexActivity } from "../src/lib/codex";

const anchor = Date.parse("2024-03-01T23:59:59.000Z");
let assertionCount = 0;

function assert(condition: unknown, message: string): asserts condition {
  assertionCount += 1;
  if (!condition) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  assert(
    Object.is(actual, expected),
    message + ": expected " + String(expected) + ", got " + String(actual),
  );
}

function activity(
  dailyBuckets: CodexActivity["dailyBuckets"],
  overrides: Partial<CodexActivity> = {},
): CodexActivity {
  return {
    state: "current",
    summary: {
      lifetimeTokens: null,
      peakDailyTokens: null,
      currentStreakDays: null,
      longestStreakDays: null,
      longestRunningTurnSec: null,
    },
    dailyBuckets,
    fetchedAtMs: anchor,
    diagnostic: null,
    ...overrides,
  };
}

function findCell(grid: ActivityGrid, date: string) {
  return grid.weeks.flat().find((cell) => cell.date === date) ?? null;
}

function checkActivityRegression(): void {
  assertionCount = 0;

  const empty = buildActivityGrid(activity([]), anchor);
  equal(empty.state, "current", "empty provider bucket list stays current");
  equal(empty.hasBuckets, false, "empty list is distinguishable from returned buckets");
  equal(
    empty.weeks.flat().filter((cell) => cell.date !== null).length,
    84,
    "empty range still has 84 unknown dates",
  );
  assert(
    empty.weeks
      .flat()
      .filter((cell) => cell.date !== null)
      .every((cell) => cell.tokens === null),
    "absent days are unknown rather than fabricated zeroes",
  );

  const unavailable = buildActivityGrid(unavailableCodexMonitoring().activity, anchor);
  equal(unavailable.state, "unavailable", "null bucket set is explicitly unavailable");
  equal(unavailable.weeks.length, 0, "unavailable data does not make an empty heatmap");

  const sparse = buildActivityGrid(
    activity([
      { date: "2024-02-29", tokens: 0 },
      { date: "2024-03-01", tokens: 15 },
    ]),
    anchor,
  );
  equal(findCell(sparse, "2024-02-29")?.tokens, 0, "reported zero is preserved");
  equal(findCell(sparse, "2024-02-29")?.intensity, 0, "reported zero has its own green level");
  equal(findCell(sparse, "2024-02-28")?.tokens, null, "a sparse missing day remains unknown");
  equal(findCell(sparse, "2024-02-28")?.intensity, null, "unknown differs from zero intensity");
  equal(findCell(sparse, "2024-03-01")?.tokens, 15, "latest UTC calendar day stays in range");
  equal(sparse.endDate, "2024-03-01", "UTC day boundary does not roll into the local next day");
  equal(
    sparse.weeks.flat().filter((cell) => cell.date !== null).length,
    84,
    "range includes exactly 84 dates",
  );
  assert(
    sparse.weeks.every((week) => week.length === 7),
    "weeks align to seven weekday rows",
  );

  const intensity = buildActivityGrid(
    activity([
      { date: "2024-02-26", tokens: 0 },
      { date: "2024-02-27", tokens: 1 },
      { date: "2024-02-28", tokens: 10 },
      { date: "2024-02-29", tokens: 100 },
      { date: "2024-03-01", tokens: 1000 },
    ]),
    anchor,
  );
  equal(
    findCell(intensity, "2024-02-26")?.intensity,
    0,
    "zero uses the first known-activity shade",
  );
  equal(
    findCell(intensity, "2024-02-27")?.intensity,
    1,
    "relative minimum positive uses level one",
  );
  equal(findCell(intensity, "2024-02-28")?.intensity, 2, "relative mid values use a middle shade");
  equal(findCell(intensity, "2024-02-29")?.intensity, 3, "relative high values use a higher shade");
  equal(findCell(intensity, "2024-03-01")?.intensity, 4, "relative maximum uses level four");

  const duplicates = buildActivityGrid(
    activity([
      { date: "2024-02-27", tokens: 9 },
      { date: "2024-02-27", tokens: 9 },
      { date: "2024-02-28", tokens: 10 },
      { date: "2024-02-28", tokens: 20 },
    ]),
    anchor,
  );
  equal(findCell(duplicates, "2024-02-27")?.tokens, 9, "identical duplicate is not summed");
  equal(findCell(duplicates, "2024-02-28")?.tokens, null, "conflicting duplicate becomes unknown");

  const unsafe = buildActivityGrid(
    activity([
      { date: "2024-02-26", tokens: Number.MAX_SAFE_INTEGER },
      { date: "2024-02-27", tokens: Number.MAX_SAFE_INTEGER + 1 },
      { date: "2024-02-28", tokens: -1 },
      { date: "2024-02-29", tokens: Number.NaN },
      { date: "2024-03-01", tokens: null },
    ]),
    anchor,
  );
  equal(
    findCell(unsafe, "2024-02-26")?.tokens,
    Number.MAX_SAFE_INTEGER,
    "largest safe integer remains exact",
  );
  equal(findCell(unsafe, "2024-02-27")?.tokens, null, "unsafe integer becomes unknown");
  equal(findCell(unsafe, "2024-02-28")?.tokens, null, "negative count becomes unknown");
  equal(findCell(unsafe, "2024-02-29")?.tokens, null, "non-finite count becomes unknown");
  equal(findCell(unsafe, "2024-03-01")?.tokens, null, "provider null stays unknown");

  const invalidDates = buildActivityGrid(
    activity([
      { date: "2024-02-30", tokens: 99 },
      { date: "2024-03-01T00:00:00Z", tokens: 88 },
      { date: "not-a-date", tokens: 77 },
    ]),
    anchor,
  );
  assert(
    invalidDates.weeks.flat().every((cell) => cell.date === null || cell.tokens === null),
    "invalid dates never shift usage into a neighboring day",
  );
  equal(parseUtcCalendarDate("2024-02-29")?.iso, "2024-02-29", "leap-day date parses exactly");
  equal(parseUtcCalendarDate("2023-02-29"), null, "non-leap February 29 is rejected");
  equal(
    parseUtcCalendarDate("2024-03-01T00:00:00Z"),
    null,
    "timestamp strings are not calendar dates",
  );

  const metrics = buildActivityGrid(
    activity([{ date: "2024-03-01", tokens: 2 }], {
      summary: {
        lifetimeTokens: null,
        peakDailyTokens: 2,
        currentStreakDays: 6,
        longestStreakDays: 12,
        longestRunningTurnSec: 90,
      },
    }),
    anchor,
  );
  equal(metrics.summary.peakDailyTokens, 2, "provider peak summary is preserved");
  equal(metrics.summary.currentStreakDays, 6, "current streak comes from provider summary");
  equal(metrics.summary.longestStreakDays, 12, "longest streak comes from provider summary");
  equal(metrics.summary.lifetimeTokens, null, "lifetime total is never derived from daily buckets");
  equal(metrics.summary.longestRunningTurnSec, 90, "provider turn duration is preserved");

  const inconsistentStreak = buildActivityGrid(
    activity([], {
      summary: {
        lifetimeTokens: null,
        peakDailyTokens: null,
        currentStreakDays: 4,
        longestStreakDays: 3,
        longestRunningTurnSec: null,
      },
    }),
    anchor,
  );
  equal(
    inconsistentStreak.summary.currentStreakDays,
    null,
    "inconsistent current streak is not repaired",
  );
  equal(
    inconsistentStreak.summary.longestStreakDays,
    null,
    "inconsistent longest streak is not repaired",
  );

  const invalidRange = buildActivityGrid(activity([]), Number.NaN);
  equal(invalidRange.state, "unavailable", "invalid anchor timestamp is unavailable");
  equal(invalidRange.weeks.length, 0, "invalid anchor does not build shifted calendar dates");

  const demoA = createDemoMonitoring(anchor);
  const demoB = createDemoMonitoring(anchor);
  equal(
    JSON.stringify(demoA),
    JSON.stringify(demoB),
    "demo fixture is deterministic for a supplied clock",
  );
  assert(
    demoA.activity.dailyBuckets?.some((bucket) => bucket.tokens === 0),
    "synthetic preview explicitly includes known zero activity",
  );

  console.log("PASS Codex activity normalization: " + assertionCount + " assertions");
}

export function runActivityRegression(): number {
  checkActivityRegression();
  return assertionCount;
}

if (import.meta.main) runActivityRegression();
