import {
  emptyMetadata,
  type AccountState,
  type LocalId,
  type LocalKind,
  type QuotaSource,
} from "./model";
import { restoreState } from "./state";

export const ACCOUNT_DEMO_SCENARIOS = [
  ["multi", "Multiple accounts & keys"],
  ["single", "One account"],
  ["two-accounts", "Two Codex accounts"],
  ["two-keys", "Two keys · relationship unknown"],
  ["shared", "Two keys · verified shared source"],
  ["disconnected", "One disconnected · another current"],
  ["mixed", "Independent errors & freshness"],
  ["unicode", "Long Unicode names"],
  ["duplicates", "Duplicate names · distinct IDs"],
  ["removing", "Removal pending"],
  ["empty", "No accounts"],
] as const;
export type AccountDemoScenario = (typeof ACCOUNT_DEMO_SCENARIOS)[number][0];

// Fixed opaque UUIDv4-shaped identifiers: never derived from aliases or credentials.
function id<K extends LocalKind>(kind: K, n: number): LocalId<K> {
  return `${kind}_d02b0000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

/** Explicit in-memory fiction. Does not authorize a session or invoke a provider. */
export function createAccountDemo(scenario: AccountDemoScenario, nowMs: number): AccountState {
  if (scenario === "empty") return restoreState(emptyMetadata());
  const accounts = [
    { id: id("account", 1), providerId: "codex", alias: "Personal" },
    { id: id("account", 2), providerId: "codex", alias: "Work" },
    { id: id("account", 3), providerId: "openrouter", alias: "Personal" },
  ].filter((_, i) =>
    scenario === "single"
      ? i === 0
      : scenario === "two-accounts"
        ? i < 2
        : scenario === "two-keys" || scenario === "shared"
          ? i === 2
          : true,
  );
  if (scenario === "unicode")
    accounts.forEach((a, i) => (a.alias = `${i + 1} · ${"制作チーム・研究と開発🌿".repeat(5)}`));
  if (scenario === "duplicates") accounts.forEach((a) => (a.alias = "Personal"));
  const connections = [
    {
      id: id("connection", 1),
      accountId: id("account", 1),
      workspaceId: null,
      alias: "Desktop session",
      mechanism: "cli-session" as const,
    },
    {
      id: id("connection", 2),
      accountId: id("account", 2),
      workspaceId: id("workspace", 1),
      alias: "Work session",
      mechanism: "cli-session" as const,
    },
    {
      id: id("connection", 3),
      accountId: id("account", 3),
      workspaceId: null,
      alias: "Personal Key",
      mechanism: "api-key" as const,
    },
    {
      id: id("connection", 4),
      accountId: id("account", 3),
      workspaceId: null,
      alias: "Project B Key",
      mechanism: "api-key" as const,
    },
  ].filter((c) => accounts.some((a) => a.id === c.accountId));
  if (scenario === "duplicates") connections.forEach((c) => (c.alias = "Connection"));
  if (scenario === "unicode")
    connections.forEach((c) => (c.alias = "デスクトップ・接続とプロジェクト🌿".repeat(4)));
  const state = restoreState({
    version: 1,
    accounts,
    connections,
    workspaces: accounts.some((a) => a.id === id("account", 2))
      ? [{ id: id("workspace", 1), accountId: id("account", 2), alias: "Studio" }]
      : [],
  });
  // Lifecycle/identity values describe ONLY this synthetic fixture.
  state.connections.forEach((c) =>
    Object.assign(c, {
      lifecycle: "connected",
      generation: 1,
      consent: "granted",
      authorization: "granted",
      lastSuccessAtMs: nowMs,
    }),
  );
  connections.forEach((c, i) => {
    const account = accounts.find((a) => a.id === c.accountId)!;
    const codex = account.providerId === "codex";
    const personal = c.id === id("connection", 1);
    const stale = c.id === id("connection", 2);
    const fetchedAtMs = stale ? nowMs - 45 * 60_000 : nowMs;
    const source: QuotaSource = {
      id: id("source", Number(c.id.slice(-1))),
      providerId: account.providerId,
      accountId: c.accountId,
      workspaceId: c.workspaceId,
      association: { kind: "unknown", connectionIds: [c.id] },
      connectionGenerations: { [c.id]: 1 },
      origin: "synthetic",
      authority: "synthetic-fixture",
      freshness: stale ? "stale" : "current",
      fetchedAtMs,
      staleAfterMs: 5 * 60_000,
      data: {
        subscription: codex
          ? [
              {
                id: id("window", personal ? 1 : 3),
                label: "Session",
                remainingPercent: personal ? 72 : 18,
                resetAtMs: nowMs + (personal ? 142 : 56) * 60_000,
                durationMins: 300,
              },
              {
                id: id("window", personal ? 2 : 4),
                label: "Weekly",
                remainingPercent: personal ? 46 : null,
                resetAtMs: personal ? nowMs + 3 * 86_400_000 : null,
                durationMins: 10_080,
              },
            ]
          : [],
        apiMetering: codex ? null : { value: i % 2 === 0 ? 12_400 : null, unit: "tokens" },
        credits: {
          balance: personal ? "42" : codex ? "0" : "120.5",
          unit: "provider-credits",
          unlimited: false,
        },
        spending: {
          used: personal ? "31.5" : codex ? null : "7.25",
          limit: personal ? "100" : null,
          currency: codex ? null : "USD",
        },
        entitlements: codex ? { earnedResets: personal ? 2 : 0 } : null,
        activity: codex
          ? Array.from({ length: 84 }, (_, day) => ({
              date: new Date(Math.floor(nowMs / 86_400_000) * 86_400_000 - (83 - day) * 86_400_000)
                .toISOString()
                .slice(0, 10),
              tokens:
                day % 9 === 0 ? null : day % 6 === 0 ? 0 : (personal ? 137 : 251) * ((day % 8) + 1),
            }))
          : null,
      },
    };
    state.sources.push(source);
    if (personal)
      state.identities.push({
        accountId: c.accountId,
        connectionId: c.id,
        label: "Sample personal identity",
      });
    state.connections.find((r) => r.connectionId === c.id)!.lastSuccessAtMs = fetchedAtMs;
  });
  if (scenario === "shared") {
    state.sources = state.sources.slice(0, 1);
    state.sources[0].association = {
      kind: "verified",
      connectionIds: connections.map((c) => c.id),
    };
    state.sources[0].connectionGenerations = Object.fromEntries(connections.map((c) => [c.id, 1]));
  }
  if (scenario === "disconnected") {
    const target = connections[0].id;
    Object.assign(
      state.connections.find((c) => c.connectionId === target)!,
      {
        lifecycle: "disconnected",
        consent: "not-requested",
        authorization: "not-requested",
        lastSuccessAtMs: null,
      },
    );
    state.sources = state.sources.filter((s) => !s.association.connectionIds.includes(target));
    state.identities = state.identities.filter((i) => i.connectionId !== target);
  }
  if (scenario === "mixed") {
    const failed = state.connections.find((c) => c.connectionId === id("connection", 4))!;
    Object.assign(failed, {
      lifecycle: "auth-required",
      consent: "not-requested",
      authorization: "expired",
      lastSuccessAtMs: null,
      diagnostic: "authentication-expired",
    });
    state.sources = state.sources.filter(
      (s) => !s.association.connectionIds.includes(failed.connectionId),
    );
    const disconnected = state.connections.find((c) => c.connectionId === id("connection", 3))!;
    Object.assign(disconnected, {
      lifecycle: "error",
      consent: "not-requested",
      authorization: "not-requested",
      lastSuccessAtMs: null,
      diagnostic: "refresh-failed",
    });
    state.sources = state.sources.filter(
      (s) => !s.association.connectionIds.includes(disconnected.connectionId),
    );
  }
  if (scenario === "removing") {
    const target = id("account", 2);
    state.removingAccountIds.push(target);
    state.sources = state.sources.filter((s) => s.accountId !== target);
    state.connections
      .filter((c) => connections.find((m) => m.id === c.connectionId)?.accountId === target)
      .forEach((c) =>
        Object.assign(c, {
          lifecycle: "disconnected",
          consent: "not-requested",
          authorization: "not-requested",
          diagnostic: "cleanup-failed",
          lastSuccessAtMs: null,
        }),
      );
  }
  return state;
}
