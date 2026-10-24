import { file } from "bun";

import {
  ageCodexSnapshot,
  CODEX_CONNECTION_AVAILABLE,
  CODEX_FRESHNESS_MS,
  codexMessage,
  disconnectedCodexSnapshot,
  type LiveCodexSnapshot,
} from "../src/lib/codex";
import {
  classifyRemainingPercent,
  createDemoSnapshot,
  DEMO_SCENARIOS,
  formatRemainingPercent,
  type DemoScenario,
} from "../src/lib/quota";
import { runAccountsRegression } from "./accounts-regression";
import { runActivityRegression } from "./activity-regression";

type JsonObject = Record<string, unknown>;

const nativePermissions = [
  "allow-hide-popup",
  "allow-codex-connect",
  "allow-codex-refresh",
  "allow-codex-disconnect",
  "allow-codex-status",
];

let assertionCount = 0;
let passedGroups = 0;
let failedGroups = 0;

function assert(condition: unknown, label: string): void {
  assertionCount += 1;
  if (!condition) throw new Error(label);
}

function equal(actual: unknown, expected: unknown, label: string): void {
  assert(
    Object.is(actual, expected),
    `${label}: expected ${String(expected)}, got ${String(actual)}`,
  );
}

function sequence(actual: readonly unknown[], expected: readonly unknown[], label: string): void {
  equal(JSON.stringify(actual), JSON.stringify(expected), label);
}

function exactKeys(value: JsonObject, expected: readonly string[], label: string): void {
  sequence(Object.keys(value).sort(), [...expected].sort(), `${label} keys`);
}

function cspSourceTokens(value: unknown, label: string): string[] {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return [...new Set(value.trim().split(/\s+/).filter(Boolean))].sort();
}

function assertCspSourceSet(csp: JsonObject, directive: string, expected: readonly string[]): void {
  sequence(
    cspSourceTokens(csp[directive], `release ${directive}`),
    [...new Set(expected)].sort(),
    `release ${directive} source tokens`,
  );
}

function record(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function list(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

async function check(label: string, run: () => void | Promise<void>): Promise<void> {
  try {
    await run();
    passedGroups += 1;
    console.log(`PASS ${label}`);
  } catch (error) {
    failedGroups += 1;
    console.error(`FAIL ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateCapability(value: unknown): void {
  const capability = record(value, "capability");
  if (capability.identifier !== "main-capability")
    throw new Error("unexpected capability identifier");
  if (
    !Array.isArray(capability.windows) ||
    capability.windows.length !== 1 ||
    capability.windows[0] !== "main"
  ) {
    throw new Error("capability must be limited to the main window");
  }
  if (
    !Array.isArray(capability.permissions) ||
    JSON.stringify([...capability.permissions].sort()) !==
      JSON.stringify([...nativePermissions].sort())
  ) {
    throw new Error("capability must grant only the reviewed native commands");
  }
}

async function readJson(path: string): Promise<unknown> {
  return file(new URL(`../${path}`, import.meta.url)).json();
}

const scenarios: readonly DemoScenario[] = [
  "healthy",
  "low",
  "critical",
  "unknown",
  "stale",
  "auth",
  "error",
  "empty",
];
const providerIds = ["codex", "claude-code", "gemini-cli"] as const;
const providerNames = ["Codex", "Claude Code", "Gemini CLI"] as const;
const windowNames = {
  codex: ["Session", "Weekly"],
  "claude-code": ["Session", "Weekly"],
  "gemini-cli": ["Daily", "Monthly"],
} as const;
const accountIds = [
  "demo-codex-profile",
  "demo-claude-code-profile",
  "demo-gemini-cli-profile",
] as const;
const expectedStatuses: Record<DemoScenario, readonly [string, string]> = {
  healthy: ["not-connected", "current"],
  low: ["not-connected", "current"],
  critical: ["not-connected", "current"],
  unknown: ["not-connected", "unknown"],
  stale: ["not-connected", "stale"],
  auth: ["auth-required", "unknown"],
  error: ["not-connected", "error"],
  empty: ["not-connected", "current"],
};
const fixedNowMs = Date.parse("2026-10-24T00:00:00.000Z");

await check("remaining percentage classification and formatting", () => {
  for (const [value, expected] of [
    [null, "unknown"],
    [Number.NaN, "unknown"],
    [Number.POSITIVE_INFINITY, "unknown"],
    [Number.NEGATIVE_INFINITY, "unknown"],
    [-0.01, "unknown"],
    [100.01, "unknown"],
    [0, "critical"],
    [9.99, "critical"],
    [10, "low"],
    [25, "low"],
    [25.01, "normal"],
    [100, "normal"],
  ] as const) {
    equal(classifyRemainingPercent(value), expected, `classify ${String(value)}`);
  }

  for (const [value, expected] of [
    [null, "Not available"],
    [Number.NaN, "Not available"],
    [Number.POSITIVE_INFINITY, "Not available"],
    [Number.NEGATIVE_INFINITY, "Not available"],
    [-1, "Not available"],
    [101, "Not available"],
    [0, "0%"],
    [10, "10%"],
    [12.34, "12.3%"],
    [25.5, "25.5%"],
    [100, "100%"],
  ] as const) {
    equal(formatRemainingPercent(value), expected, `format ${String(value)}`);
  }
});

await check("scenario registry is the exact eight-fixture set", () => {
  sequence(DEMO_SCENARIOS.map(({ value }) => value).sort(), [...scenarios].sort(), "scenario set");
  equal(new Set(DEMO_SCENARIOS.map(({ value }) => value)).size, 8, "scenario uniqueness");
});

await check("all fixtures keep the safe snapshot schema and expected states", () => {
  for (const scenario of scenarios) {
    const snapshot = record(createDemoSnapshot(scenario, fixedNowMs), `${scenario} snapshot`);
    equal(
      JSON.stringify(snapshot),
      JSON.stringify(createDemoSnapshot(scenario, fixedNowMs)),
      `${scenario} fixed-time output must be identical`,
    );
    exactKeys(snapshot, ["scenario", "source", "providers"], `${scenario} snapshot`);
    equal(snapshot.scenario, scenario, `${scenario} fixture identity`);
    equal(snapshot.source, "synthetic", `${scenario} source identity`);

    const providers = list(snapshot.providers, `${scenario} providers`);
    const expectedProviderCount = scenario === "empty" ? 0 : 3;
    equal(providers.length, expectedProviderCount, `${scenario} provider count`);

    for (const [index, providerValue] of providers.entries()) {
      const provider = record(providerValue, `${scenario} provider ${index}`);
      exactKeys(
        provider,
        [
          "id",
          "name",
          "tool",
          "accountId",
          "connectionStatus",
          "dataStatus",
          "fetchedAt",
          "windows",
        ],
        `${scenario} provider ${index}`,
      );
      equal(provider.id, providerIds[index], `${scenario} provider ${index} id`);
      equal(provider.name, providerNames[index], `${scenario} provider ${index} name`);
      equal(provider.tool, "CLI", `${scenario} provider ${index} tool`);
      equal(provider.accountId, accountIds[index], `${scenario} provider ${index} demo account id`);
      assert(
        typeof provider.accountId === "string" && provider.accountId.startsWith("demo-"),
        `${scenario} account identifiers must be visibly synthetic`,
      );

      const [connectionStatus, dataStatus] = expectedStatuses[scenario];
      equal(provider.connectionStatus, connectionStatus, `${scenario} connection status`);
      equal(provider.dataStatus, dataStatus, `${scenario} data status`);

      const fetchedAt = provider.fetchedAt;
      assert(isIsoTimestamp(fetchedAt), `${scenario} fetchedAt must be a valid ISO timestamp`);
      const expectedFetchMs = fixedNowMs - (scenario === "stale" ? 45 * 60_000 : 0);
      equal(Date.parse(fetchedAt as string), expectedFetchMs, `${scenario} injected fetchedAt`);

      const windows = list(provider.windows, `${scenario} provider ${index} windows`);
      equal(windows.length, 2, `${scenario} provider ${index} window count`);
      const providerId = providerIds[index];
      for (const [windowIndex, windowValue] of windows.entries()) {
        const window = record(windowValue, `${scenario} window ${windowIndex}`);
        exactKeys(
          window,
          ["id", "name", "remainingPercent", "resetAt"],
          `${scenario} window ${windowIndex}`,
        );
        equal(window.id, `${providerId}-${windowIndex}`, `${scenario} window id`);
        equal(window.name, windowNames[providerId][windowIndex], `${scenario} window name`);
        assert(
          window.remainingPercent === null ||
            (typeof window.remainingPercent === "number" &&
              Number.isFinite(window.remainingPercent) &&
              window.remainingPercent >= 0 &&
              window.remainingPercent <= 100),
          `${scenario} remainingPercent must be within 0..100 or unknown`,
        );

        if (scenario === "unknown" || scenario === "auth" || scenario === "error") {
          equal(window.remainingPercent, null, `${scenario} unknown remaining percent`);
          equal(window.resetAt, null, `${scenario} unknown reset`);
        } else {
          assert(
            isIsoTimestamp(window.resetAt),
            `${scenario} resetAt must be a valid ISO timestamp`,
          );
          assert(
            Date.parse(window.resetAt as string) > fixedNowMs,
            `${scenario} reset must be in the future`,
          );
        }
      }
    }
  }
});

await check("scenario fixtures use their named remaining bands", () => {
  const healthy = createDemoSnapshot("healthy", fixedNowMs);
  const healthyWindows = healthy.providers.flatMap(({ windows }) => windows);
  const healthyFirstRemaining = healthy.providers[0].windows[0].remainingPercent;
  equal(healthyFirstRemaining, 82, "healthy sample is 82% remaining");
  equal(
    formatRemainingPercent(healthyFirstRemaining),
    "82%",
    "healthy sample formats as remaining",
  );
  assert(
    healthyWindows.every(
      ({ remainingPercent }) => classifyRemainingPercent(remainingPercent) === "normal",
    ),
    "healthy fixture values must all be normal bands",
  );

  const lowBands = createDemoSnapshot("low", fixedNowMs)
    .providers.flatMap(({ windows }) => windows)
    .map(({ remainingPercent }) => classifyRemainingPercent(remainingPercent));
  assert(lowBands.includes("low"), "low fixture must contain a low remaining band");

  const criticalBands = createDemoSnapshot("critical", fixedNowMs)
    .providers.flatMap(({ windows }) => windows)
    .map(({ remainingPercent }) => classifyRemainingPercent(remainingPercent));
  assert(
    criticalBands.every((band) => band === "critical"),
    "critical fixture must be all critical bands",
  );
});

await check("clock seam is deterministic and defaults to Date.now", () => {
  const before = Date.now();
  const defaultSnapshot = createDemoSnapshot("healthy");
  const after = Date.now();
  for (const provider of defaultSnapshot.providers) {
    assert(isIsoTimestamp(provider.fetchedAt), "default fetchedAt must be valid ISO");
    const timestamp = Date.parse(provider.fetchedAt as string);
    assert(timestamp >= before && timestamp <= after, "default fetchedAt must use current time");
  }

  const injected = createDemoSnapshot("healthy", fixedNowMs);
  equal(
    Date.parse(injected.providers[0].fetchedAt as string),
    fixedNowMs,
    "injected clock timestamp",
  );
});

// This is a static checked-in configuration guard, not an audit of runtime/native behavior.
await check(
  "static Tauri configuration keeps one main window, narrow permission, and release CSP",
  async () => {
    const config = record(await readJson("src-tauri/tauri.conf.json"), "Tauri config");
    const app = record(config.app, "Tauri app config");
    const windows = list(app.windows, "Tauri windows");
    equal(windows.length, 1, "single native window count");
    equal(record(windows[0], "main window").label, "main", "single native window label");

    const security = record(app.security, "Tauri security config");
    sequence(
      list(security.capabilities, "configured capabilities"),
      ["main-capability"],
      "configured capability",
    );

    const capability = record(
      await readJson("src-tauri/capabilities/main.json"),
      "main capability",
    );
    exactKeys(
      capability,
      ["$schema", "identifier", "description", "windows", "permissions"],
      "main capability",
    );
    equal(capability.identifier, "main-capability", "capability identifier");
    sequence(list(capability.windows, "capability windows"), ["main"], "capability window scope");
    sequence(
      list(capability.permissions, "capability permissions"),
      nativePermissions,
      "capability permission allowlist",
    );
    validateCapability(capability);
    for (const forbiddenKey of ["remote", "webviews", "scope"]) {
      assert(
        !Object.hasOwn(capability, forbiddenKey),
        `capability must not define ${forbiddenKey}`,
      );
    }

    const csp = record(security.csp, "release CSP");
    exactKeys(
      csp,
      [
        "default-src",
        "script-src",
        "style-src",
        "img-src",
        "font-src",
        "connect-src",
        "object-src",
        "base-uri",
        "frame-src",
      ],
      "release CSP",
    );
    assertCspSourceSet(csp, "default-src", ["'self'"]);
    assertCspSourceSet(csp, "script-src", ["'self'"]);
    assertCspSourceSet(csp, "style-src", ["'self'", "'unsafe-inline'"]);
    assertCspSourceSet(csp, "img-src", ["'self'", "asset:", "http://asset.localhost", "data:"]);
    assertCspSourceSet(csp, "font-src", ["'self'", "data:"]);
    assertCspSourceSet(csp, "connect-src", ["ipc:", "http://ipc.localhost"]);
    assertCspSourceSet(csp, "object-src", ["'none'"]);
    assertCspSourceSet(csp, "base-uri", ["'self'"]);
    assertCspSourceSet(csp, "frame-src", ["'none'"]);
    const releasePolicy = JSON.stringify(csp);
    assert(
      !/127\.0\.0\.1|ws:|:1420|unsafe-eval/i.test(releasePolicy),
      "release CSP must exclude Vite, HMR, and unsafe eval",
    );
    assert(
      !/unsafe-inline|unsafe-eval/i.test(String(csp["script-src"])),
      "release script-src must not allow unsafe scripts",
    );
    assert(!/\*/.test(releasePolicy), "release CSP must not contain a wildcard source");
  },
);

await check(
  "capability negative control rejects added shell permission and restores fixture",
  async () => {
    const capability = record(
      await readJson("src-tauri/capabilities/main.json"),
      "main capability fixture",
    );
    const originalPermissions = list(capability.permissions, "original permissions");
    capability.permissions = [...originalPermissions, "shell:allow-execute"];

    let rejected = false;
    try {
      validateCapability(capability);
    } catch {
      rejected = true;
    }
    assert(rejected, "adding shell:allow-execute must be rejected");

    capability.permissions = originalPermissions;
    validateCapability(capability);
    sequence(
      list(capability.permissions, "restored permissions"),
      nativePermissions,
      "restored fixture permission",
    );
  },
);

await check("live source starts disconnected and never creates demo fallback", () => {
  equal(CODEX_CONNECTION_AVAILABLE, false, "production live gate stays closed");
  const snapshot = disconnectedCodexSnapshot();
  exactKeys(
    snapshot as unknown as JsonObject,
    [
      "source",
      "providerId",
      "displayLabel",
      "connectionStatus",
      "dataStatus",
      "windows",
      "fetchedAtMs",
      "diagnostic",
      "monitoring",
    ],
    "live snapshot",
  );
  equal(snapshot.source, "live", "live identity");
  equal(snapshot.providerId, "codex", "single real provider");
  equal(snapshot.connectionStatus, "disconnected", "initial consent state");
  equal(snapshot.windows.length, 0, "no fabricated quota");
  equal(snapshot.fetchedAtMs, null, "no fabricated fetch");
  equal(
    snapshot.monitoring.activity.state,
    "unavailable",
    "activity unavailable without connection",
  );
  equal(snapshot.monitoring.activity.dailyBuckets, null, "no fabricated activity");
  equal(snapshot.monitoring.buckets.length, 0, "no fabricated credit balances");
  equal(snapshot.monitoring.earnedResets, null, "no fabricated earned resets");
  for (const state of [
    "error",
    "auth-required",
    "unsupported",
    "incompatible",
    "unavailable",
  ] as const) {
    const failure = { ...snapshot, connectionStatus: state };
    equal(ageCodexSnapshot(failure, fixedNowMs).source, "live", `${state} source stays live`);
    equal(ageCodexSnapshot(failure, fixedNowMs).windows.length, 0, `${state} no synthetic windows`);
    assert(codexMessage(failure).length > 20, `${state} actionable message`);
  }
});

await check("Codex permissions grant only their named argument-free operations", async () => {
  for (const command of ["codex_connect", "codex_refresh", "codex_status", "codex_disconnect"]) {
    const permission = record(
      Bun.TOML.parse(
        await file(
          new URL(`../src-tauri/permissions/autogenerated/${command}.toml`, import.meta.url),
        ).text(),
      ),
      command,
    );
    const entries = list(permission.permission, `${command} permissions`).map((entry) =>
      record(entry, command),
    );
    const grant = entries.find(
      (entry) => entry.identifier === `allow-${command.replaceAll("_", "-")}`,
    );
    assert(grant, `${command} explicit grant exists`);
    sequence(
      list(record(grant?.commands, command).allow, command),
      [command],
      `${command} single operation`,
    );
    assert(!Object.hasOwn(grant ?? {}, "scope"), `${command} no generic scope`);
  }
});

await check("live freshness ages with no requests and failed data stays stale", () => {
  const current: LiveCodexSnapshot = {
    ...disconnectedCodexSnapshot(),
    connectionStatus: "connected",
    dataStatus: "current",
    fetchedAtMs: fixedNowMs,
    windows: [
      {
        id: "bucket-0-primary",
        name: "Codex · primary",
        remainingPercent: 0,
        resetAtMs: null,
        windowDurationMins: 15,
      },
    ],
  };
  equal(
    ageCodexSnapshot(current, fixedNowMs + CODEX_FRESHNESS_MS - 1).dataStatus,
    "current",
    "fresh before deadline",
  );
  const stale = ageCodexSnapshot(current, fixedNowMs + CODEX_FRESHNESS_MS);
  equal(stale.dataStatus, "stale", "stale at deadline");
  equal(stale.windows[0].remainingPercent, 0, "zero preserved as last known");
  equal(stale.windows[0].resetAtMs, null, "unknown reset preserved");
  equal(current.dataStatus, "current", "aging does not mutate native result");
  equal(
    ageCodexSnapshot(stale, fixedNowMs).dataStatus,
    "stale",
    "clock reversal cannot revive stale data",
  );
  for (const timestamp of [null, Number.NaN, fixedNowMs + 1]) {
    equal(
      ageCodexSnapshot({ ...current, fetchedAtMs: timestamp }, fixedNowMs).dataStatus,
      "stale",
      "invalid/future fetch cannot look fresh",
    );
  }
  assert(codexMessage(stale).includes("stale"), "stale message visible");
  const activityOnly: LiveCodexSnapshot = {
    ...current,
    dataStatus: "unknown",
    monitoring: {
      ...current.monitoring,
      activity: { ...current.monitoring.activity, state: "current", fetchedAtMs: fixedNowMs },
    },
  };
  equal(
    ageCodexSnapshot(activityOnly, fixedNowMs + CODEX_FRESHNESS_MS).monitoring.activity.state,
    "stale",
    "activity ages independently of unknown quota",
  );
});

await check("Codex activity calendar and summary regression", () => {
  assertionCount += runActivityRegression();
});

await check("ACC-01 account architecture, metadata, ownership and selection", () => {
  assertionCount += runAccountsRegression();
});

console.log(
  `Regression summary: ${passedGroups} passed, ${failedGroups} failed; ${assertionCount} assertions.`,
);
if (failedGroups > 0) throw new Error("Quotafern regression checks failed");
