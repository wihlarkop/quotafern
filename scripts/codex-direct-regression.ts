import {
  CODEX_DIRECT_CONNECTION_AVAILABLE,
  createDirectController,
  directKind,
  directSource,
  validDirectSnapshot,
  type DirectSnapshot,
} from "../src/lib/accounts/direct";
import { createLocalStore } from "../src/lib/accounts/local";
import { validMetadata, writeMetadata } from "../src/lib/accounts/metadata";
import { createLocalId, type AccountState, type ConnectionId } from "../src/lib/accounts/model";
import { beginAuthorizedSession, restoreState } from "../src/lib/accounts/state";
import { overviewView } from "../src/lib/accounts/views";

export async function runCodexDirectRegression(): Promise<number> {
  let count = 0;
  const assert = (ok: unknown, label: string) => {
    count++;
    if (!ok) throw new Error(label);
  };
  let stored: string | null = null;
  const store = createLocalStore(() => ({
    getItem: () => stored,
    setItem: (_, text) => {
      stored = text;
    },
  }));
  for (let i = 0; i < 3; i++) {
    const added = store.apply({ kind: "add-account", providerId: "codex", alias: "Personal" });
    assert(added.ok, "add duplicate alias");
    const account = store.state.metadata.accounts[i];
    assert(
      store.apply({
        kind: "add-connection",
        accountId: account.id,
        alias: "Codex",
        mechanism: i === 0 ? "cli-session" : "codex-managed",
        workspaceId: null,
      }).ok,
      "add explicit isolated mechanism",
    );
  }
  const initial = store.state;
  const [a, b, c] = initial.metadata.connections;
  const snapshot = (id: ConnectionId, changes: Partial<DirectSnapshot> = {}): DirectSnapshot => ({
    accountId: initial.metadata.connections.find((x) => x.id === id)!.accountId,
    connectionId: id,
    generation: 1,
    connectionStatus: "connected",
    dataStatus: "current",
    windows: [
      {
        id: "primary",
        name: "Session",
        remainingPercent: 0,
        resetAtMs: null,
        windowDurationMins: 300,
      },
    ],
    plan: "Plus",
    credits: null,
    fetchedAtMs: Date.now(),
    diagnostic: null,
    ...changes,
  });
  assert(!CODEX_DIRECT_CONNECTION_AVAILABLE, "production renderer gate remains closed");
  assert(
    new Set(initial.metadata.accounts.map((x) => x.id)).size === 3,
    "duplicate names have distinct account IDs",
  );
  assert(validMetadata(initial.metadata), "managed selection codec accepts Codex mechanism");
  const wrongProvider = structuredClone(initial.metadata);
  wrongProvider.accounts[1].providerId = "openrouter";
  assert(!validMetadata(wrongProvider), "managed mechanism rejected for other provider");
  assert(
    directKind("cli-session") === "system" &&
      directKind("codex-managed") === "managed" &&
      directKind("api-key") === null,
    "no accidental API key/OAuth integration",
  );
  for (const plan of ["Free", "Go", "Plus", "Pro"] as const)
    assert(
      validDirectSnapshot(snapshot(a.id, { plan }), a.accountId, a.id),
      `valid ${plan} presentation`,
    );
  for (const changes of [
    { accountId: b.accountId },
    { connectionId: b.id },
    { generation: -1 },
    { generation: 1.5 },
    { plan: "Business" },
    {
      windows: [
        { id: "x", name: "Bad", remainingPercent: 101, resetAtMs: null, windowDurationMins: null },
      ],
    },
  ]) {
    assert(
      !validDirectSnapshot({ ...snapshot(a.id), ...changes }, a.accountId, a.id),
      "reject mismatched/malformed native DTO",
    );
  }
  const missing = snapshot(a.id, {
    plan: null,
    credits: null,
    windows: [],
    fetchedAtMs: null,
    dataStatus: "unknown",
  });
  assert(
    validDirectSnapshot(missing, a.accountId, a.id),
    "missing provider fields remain valid unavailable data",
  );
  const begun = beginAuthorizedSession(initial, a.id);
  const source = directSource(missing, begun, a.id, begun.connections[0].generation);
  assert(
    source.data.subscription.length === 0 &&
      source.data.credits === null &&
      !Object.hasOwn(source.data, "plan"),
    "no substitutes for absent fields",
  );
  assert(
    directSource(snapshot(a.id), begun, a.id, begun.connections[0].generation).data.subscription[0]
      .remainingPercent === 0,
    "valid zero survives projection",
  );
  let current: AccountState = initial;
  const calls: { command: string; args: Record<string, unknown> }[] = [];
  let clock = Date.now();
  const controller = createDirectController(
    initial,
    (state) => {
      current = state;
    },
    async (command, args) => {
      calls.push({ command, args });
      const id = args.connectionId as ConnectionId;
      return snapshot(
        id,
        command.endsWith("disconnect")
          ? {
              connectionStatus: "disconnected",
              windows: [],
              fetchedAtMs: null,
              dataStatus: "unknown",
            }
          : {},
      );
    },
    true,
    () => clock,
  );
  assert(
    calls.length === 0,
    "construction and restored metadata perform no native/provider access",
  );
  assert(await controller.action(a.id, "connect"), "system connection publishes native source");
  assert(await controller.action(b.id, "login"), "managed connection uses ordinary login command");
  assert(await controller.action(c.id, "login"), "second managed account remains independent");
  assert(
    calls[0].args.kind === "system" &&
      calls[1].args.kind === "managed" &&
      calls[2].args.kind === "managed",
    "each selected profile kind bound to own opaque ID",
  );
  assert(
    current.sources.length === 3 && new Set(current.sources.map((s) => s.accountId)).size === 3,
    "three independent quota owners",
  );
  const bSource = structuredClone(current.sources.find((s) => s.accountId === b.accountId));
  assert(!(await controller.action(a.id, "refresh")), "renderer cooldown blocks repeated request");
  assert(current.sources.length === 3, "cooldown does not erase readings");
  clock += 30_001;
  assert(await controller.action(a.id, "refresh"), "independent refresh");
  assert(
    JSON.stringify(current.sources.find((s) => s.accountId === b.accountId)) ===
      JSON.stringify(bSource),
    "A refresh never changes B",
  );
  assert(
    overviewView(current, { kind: "all" }, Date.now(), "synthetic").sources.length === 0,
    "live sources never appear as demo",
  );
  const encoded = writeMetadata(current.metadata);
  assert(
    !/fetchedAt|remainingPercent|generation|consent|access_token|auth.json/.test(encoded),
    "only ACC metadata persists",
  );
  const cold = restoreState(current.metadata);
  assert(
    cold.sources.length === 0 && cold.connections.every((x) => x.lifecycle === "disconnected"),
    "restart never restores consent/usage",
  );
  const callsBefore = calls.length;
  controller.refreshDue(Date.now());
  assert(calls.length === callsBefore, "automatic refresh waits five minutes");
  assert(await controller.beforeRemoval(a.accountId), "native cleanup precedes metadata deletion");
  assert(
    current.sources.every((s) => s.accountId !== a.accountId) &&
      current.sources.some((s) => s.accountId === b.accountId),
    "remove A revokes own values only",
  );
  assert(await controller.disconnectAll(), "all sessions cleanly disconnected");
  assert(
    current.sources.length === 0 && current.connections.every((x) => x.consent === "not-requested"),
    "demo switch/stop revokes all live values",
  );

  let resolveLate!: (value: unknown) => void;
  let raced: AccountState = initial;
  const race = createDirectController(
    initial,
    (s) => {
      raced = s;
    },
    (command) =>
      command.endsWith("disconnect")
        ? Promise.resolve(
            snapshot(a.id, {
              connectionStatus: "disconnected",
              windows: [],
              fetchedAtMs: null,
              dataStatus: "unknown",
            }),
          )
        : new Promise((resolve) => {
            resolveLate = resolve;
          }),
    true,
  );
  const pending = race.action(a.id, "connect");
  assert(await race.action(a.id, "disconnect"), "disconnect permitted during in-flight connect");
  resolveLate(snapshot(a.id));
  assert(
    !(await pending) && raced.sources.length === 0,
    "late response discarded after disconnect",
  );

  let badState: AccountState = initial;
  const bad = createDirectController(
    initial,
    (s) => {
      badState = s;
    },
    async () => snapshot(b.id),
    true,
  );
  assert(
    !(await bad.action(a.id, "connect")) && badState.sources.length === 0,
    "response for B cannot publish under A",
  );
  let attempts = 0;
  let generationClock = Date.now();
  const generation = createDirectController(
    initial,
    (s) => {
      badState = s;
    },
    async () => snapshot(a.id, { generation: ++attempts }),
    true,
    () => generationClock,
  );
  assert(await generation.action(a.id, "connect"), "generation fixture connects");
  generationClock += 30_001;
  assert(
    !(await generation.action(a.id, "refresh")) && badState.sources.length === 0,
    "refresh with unexpected native generation revoked",
  );
  const blocked = createDirectController(
    initial,
    () => {},
    async (command) => {
      if (command.endsWith("disconnect")) throw new Error("synthetic cleanup failure");
      return snapshot(a.id);
    },
    true,
  );
  assert(await blocked.action(a.id, "connect"), "cleanup failure fixture connects");
  assert(!(await blocked.beforeRemoval(a.accountId)), "cleanup failure blocks local deletion");
  let forbidden = 0;
  const gated = createDirectController(
    initial,
    () => {},
    async () => {
      forbidden++;
      return snapshot(a.id);
    },
    false,
  );
  assert(
    !(await gated.action(a.id, "connect")) && forbidden === 0,
    "closed gate performs no native call",
  );
  assert(!(await controller.action(a.id, "login")), "system source never launches managed relogin");
  assert(
    !validDirectSnapshot(
      snapshot(a.id, { connectionId: createLocalId("connection") }),
      a.accountId,
      a.id,
    ),
    "opaque descriptor replacement cannot inherit results",
  );
  for (const diagnostic of [
    "directNetworkFailed",
    "directRequestTimedOut",
    "directRateLimited",
    "directServiceUnavailable",
  ]) {
    let errorClock = Date.now();
    let reading: AccountState = initial;
    let reads = 0;
    const retry = createDirectController(
      initial,
      (s) => {
        reading = s;
      },
      async () =>
        ++reads === 1
          ? snapshot(a.id)
          : snapshot(a.id, { connectionStatus: "error", dataStatus: "stale", diagnostic }),
      true,
      () => errorClock,
    );
    assert(await retry.action(a.id, "connect"), diagnostic + " initial success");
    const successAt = reading.sources[0].fetchedAtMs;
    errorClock += 30_001;
    assert(!(await retry.action(a.id, "refresh")), diagnostic + " failure not success");
    assert(
      reading.sources[0].freshness === "stale" && reading.sources[0].fetchedAtMs === successAt,
      diagnostic + " retains stale last success",
    );
    assert(reading.connections[0].lifecycle === "connected", diagnostic + " allows later retry");
  }
  let authClock = Date.now();
  let authState: AccountState = initial;
  let authReads = 0;
  const expired = createDirectController(
    initial,
    (s) => {
      authState = s;
    },
    async () =>
      ++authReads === 1
        ? snapshot(a.id)
        : snapshot(a.id, {
            connectionStatus: "auth-required",
            dataStatus: "error",
            windows: [],
            fetchedAtMs: null,
            diagnostic: "directAuthenticationRequired",
          }),
    true,
    () => authClock,
  );
  await expired.action(a.id, "connect");
  authClock += 30_001;
  await expired.action(a.id, "refresh");
  assert(
    authState.sources.length === 0 && authState.connections[0].lifecycle === "auth-required",
    "auth expiry clears values and requires sign-in again",
  );
  let autoClock = Date.now();
  let autoReads = 0;
  const automatic = createDirectController(
    initial,
    () => {},
    async () => {
      autoReads++;
      return snapshot(a.id);
    },
    true,
    () => autoClock,
  );
  await automatic.action(a.id, "connect");
  autoClock += 300_001;
  automatic.refreshDue(autoClock);
  await Promise.resolve();
  await Promise.resolve();
  assert(autoReads === 2, "five minute refresh applies only to consented connected source");
  await automatic.disconnectAll();
  autoClock += 300_001;
  automatic.refreshDue(autoClock);
  assert(autoReads === 3, "disconnected source performs only cleanup and no further refresh");
  console.log(`PASS CODEX-LIVE-01 account isolation and lifecycle: ${count} assertions`);
  return count;
}
