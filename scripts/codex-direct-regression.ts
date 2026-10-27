import {
  codexDirectPlatformSupported,
  createDirectController,
  directKind,
  directMessage,
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
  for (const diagnostic of [
    "directRpcStartupFailed",
    "directRpcRemoteControlUnsafe",
    "directRpcNetworkAuditFailed",
    "directRpcCleanupFailed",
    "directRpcEndpointUnsafe",
    "directRpcPeerUnsafe",
    "directRpcVersionUnsupported",
    "directRpcProtocolRejected",
    "directRpcProviderFailed",
    "directRpcIdentityUnavailable",
  ]) {
    const message = directMessage(snapshot(a.id, { connectionStatus: "error", diagnostic }));
    assert(
      !message.includes("auth.json") &&
        !message.includes("access token") &&
        !message.includes("Use a separate"),
      "RPC errors retain safe actionable categories without credential advice",
    );
    assert(
      !/Disconnect, then try/.test(message),
      "RPC failures do not collapse into generic catch advice",
    );
  }
  const launcherMessage = directMessage(
    snapshot(a.id, {
      connectionStatus: "unavailable",
      diagnostic: "directUnsupportedLauncher",
    }),
  );
  assert(
    /codex\.exe.*PATH/.test(launcherMessage) && /Install.*restart/.test(launcherMessage),
    "unsupported Windows launcher gives native CLI install and restart guidance",
  );
  assert(
    codexDirectPlatformSupported("Win32") && codexDirectPlatformSupported("Win64"),
    "accepted Windows UI is available",
  );
  for (const platform of ["Linux x86_64", "MacIntel", "", "Windows-untrusted"])
    assert(!codexDirectPlatformSupported(platform), "unaccepted platform UI remains unavailable");
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
  const beforeDuplicateConnect = calls.length;
  assert(await controller.action(b.id, "connect"), "connected Connect is idempotent");
  assert(
    calls.length === beforeDuplicateConnect && current.sources.length === 3,
    "duplicate Connect neither disconnects nor requests native access nor erases quota",
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
  clock += 30_001;
  const beforeAll = calls.length;
  await controller.refreshAll();
  assert(
    calls.length === beforeAll + 3,
    "manual refresh all independently refreshes every consented account",
  );
  assert(current.sources.length === 3, "refresh all retains distinct sources");
  const callsBefore = calls.length;
  clock += 180_000 - 1;
  controller.refreshDue(clock);
  assert(calls.length === callsBefore, "automatic refresh waits until three-minute boundary");
  clock++;
  controller.refreshDue(clock);
  assert(
    calls.length === callsBefore + 3,
    "three-minute boundary refreshes each consented account",
  );
  await Promise.resolve();
  controller.refreshDue(clock);
  assert(
    calls.length === callsBefore + 3,
    "automatic refresh schedules the next interval without duplicate reads",
  );
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
  const afterDisconnect = calls.length;
  clock += 180_000;
  controller.refreshDue(clock);
  assert(calls.length === afterDisconnect, "three-minute polling stops after disconnect");

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
    async (command, args) => {
      autoReads++;
      return command === "codex_direct_disconnect"
        ? snapshot(args.connectionId as `connection_${string}`, {
            connectionStatus: "disconnected",
            dataStatus: "unknown",
            windows: [],
            fetchedAtMs: null,
          })
        : snapshot(a.id);
    },
    true,
    () => autoClock,
  );
  await automatic.action(a.id, "connect");
  autoClock += 180_001;
  automatic.refreshDue(autoClock);
  await Promise.resolve();
  await Promise.resolve();
  assert(autoReads === 2, "three minute refresh applies only to consented connected source");
  await automatic.disconnectAll();
  const readsAfterStop = autoReads;
  assert(readsAfterStop === 5, "stop all revokes every saved connection reference");
  autoClock += 180_001;
  automatic.refreshDue(autoClock);
  assert(autoReads === readsAfterStop, "disconnected source performs no further refresh");
  for (const action of ["connect", "login"] as const) {
    let cooldownState: AccountState = initial;
    let cooldownMessage = "";
    const cooling = createDirectController(
      initial,
      (next, presentation) => {
        cooldownState = next;
        cooldownMessage = presentation[b.id]?.message ?? "";
      },
      async () => {
        throw "directRefreshCooldown";
      },
      true,
    );
    assert(!(await cooling.action(b.id, action)), "native cooldown refuses " + action);
    assert(
      cooldownState.connections.find((r) => r.connectionId === b.id)?.lifecycle ===
        "disconnected" &&
        cooldownState.sources.length === 0 &&
        /recently/.test(cooldownMessage) &&
        !/could not read|Waiting for confirmation/.test(cooldownMessage),
      "cooldown is a wait state, never a stuck or generic-error connection",
    );
    const priorMessage = cooldownMessage;
    assert(!(await cooling.action(b.id, "refresh")), "disconnected account cannot refresh");
    assert(
      cooldownMessage === priorMessage && !/Usage was checked/.test(cooldownMessage),
      "disconnected refresh preserves Connect advice instead of reporting recently checked usage",
    );
  }
  // Existing-suite synthetic startup/permission regression; no provider or real auth.
  const references = [a, b, c].map((x) => ({
    accountId: x.accountId,
    connectionId: x.id,
    kind: directKind(x.mechanism),
    allowed: true,
  }));
  for (const records of [[], references]) {
    const startupCalls: string[] = [];
    let restoredState: AccountState = initial;
    const restored = createDirectController(
      initial,
      (next) => {
        restoredState = next;
      },
      async (command, args) => {
        startupCalls.push(command);
        if (command === "codex_direct_remembered") return records;
        return snapshot(args.connectionId as ConnectionId);
      },
      true,
    );
    assert(
      startupCalls.length === 0,
      "restore constructor never reads provider or permission files",
    );
    await Promise.all([restored.reconnectRemembered(), restored.reconnectRemembered()]);
    assert(
      startupCalls.filter((x) => x === "codex_direct_remembered").length === 1,
      "concurrent startup reads grants once",
    );
    assert(
      startupCalls.filter((x) => x === "codex_direct_resume").length === records.length,
      "only explicitly remembered references resume",
    );
    assert(
      !startupCalls.some((x) => /connect$|login$/.test(x)),
      "startup never invokes manual Connect or login",
    );
    assert(
      restoredState.sources.length === records.length,
      "remembered accounts restore independent sources",
    );
  }
  {
    const startupCalls: string[] = [];
    const unsafeRefs = [
      { ...references[0], allowed: false },
      { ...references[1], accountId: a.accountId },
      { ...references[2], kind: "system" },
    ];
    const stopped = createDirectController(
      initial,
      () => {},
      async (command, args) => {
        startupCalls.push(command);
        if (command === "codex_direct_remembered") return unsafeRefs;
        return snapshot(args.connectionId as ConnectionId);
      },
      true,
    );
    await stopped.reconnectRemembered();
    assert(
      startupCalls.join() === "codex_direct_remembered",
      "policy mismatch or wrong account/kind cannot trigger provider access",
    );
  }
  {
    let resolveReferences!: (value: unknown) => void;
    const commands: string[] = [];
    const pendingRestore = createDirectController(
      initial,
      () => {},
      async (command, args) => {
        commands.push(command);
        if (command === "codex_direct_remembered")
          return new Promise((resolve) => {
            resolveReferences = resolve;
          });
        return snapshot(args.connectionId as ConnectionId, {
          connectionStatus: "disconnected",
          dataStatus: "unknown",
          windows: [],
          fetchedAtMs: null,
        });
      },
      true,
    );
    const pending = pendingRestore.reconnectRemembered();
    await pendingRestore.action(a.id, "disconnect");
    resolveReferences([references[0]]);
    await pending;
    assert(
      !commands.includes("codex_direct_resume"),
      "Disconnect invalidates pending startup grant list",
    );
    assert(
      commands.includes("codex_direct_disconnect"),
      "inactive remembered accounts still receive native revocation",
    );
  }
  {
    let resolveReferences!: (value: unknown) => void;
    const commands: string[] = [];
    const stopAll = createDirectController(
      initial,
      () => {},
      async (command, args) => {
        commands.push(command);
        if (command === "codex_direct_remembered")
          return new Promise((resolve) => {
            resolveReferences = resolve;
          });
        return snapshot(args.connectionId as ConnectionId, {
          connectionStatus: "disconnected",
          dataStatus: "unknown",
          windows: [],
          fetchedAtMs: null,
        });
      },
      true,
    );
    const restoring = stopAll.reconnectRemembered();
    await stopAll.disconnectAll();
    resolveReferences(references);
    await restoring;
    assert(
      !commands.includes("codex_direct_resume"),
      "stop all/demo cancels pending startup before permission list arrives",
    );
  }
  for (const diagnostic of [
    "directNetworkFailed",
    "directAuthenticationRequired",
    "directRpcVersionUnsupported",
    "directRpcProviderFailed",
  ]) {
    let time = Date.now();
    let resumes = 0;
    let latest: AccountState = initial;
    const retrying = createDirectController(
      initial,
      (next) => {
        latest = next;
      },
      async (command, args) => {
        if (command === "codex_direct_remembered") return [references[0]];
        if (command === "codex_direct_disconnect")
          return snapshot(a.id, {
            connectionStatus: "disconnected",
            dataStatus: "unknown",
            windows: [],
            fetchedAtMs: null,
          });
        assert(command === "codex_direct_resume", "automatic retry uses guarded resume only");
        resumes++;
        return snapshot(args.connectionId as ConnectionId, {
          connectionStatus: "error",
          dataStatus: "error",
          windows: [],
          fetchedAtMs: null,
          diagnostic,
        });
      },
      true,
      () => time,
    );
    await retrying.reconnectRemembered();
    assert(resumes === 1, "one initial remembered attempt");
    for (const delay of [60_000, 120_000, 240_000, 600_000, 600_000]) {
      time += delay;
      retrying.refreshDue(time);
      await Promise.resolve();
      await Promise.resolve();
    }
    assert(
      resumes === (diagnostic === "directNetworkFailed" ? 4 : 1),
      "retry is finite for network and absent for auth/version/generic RPC errors",
    );
    assert(latest.sources.length === 0, "failed startup never fabricates fresh quota");
    await retrying.action(a.id, "disconnect");
    time += 1_000_000;
    retrying.refreshDue(time);
    await Promise.resolve();
    assert(
      resumes === (diagnostic === "directNetworkFailed" ? 4 : 1),
      "Disconnect stops scheduled automatic retry",
    );
  }
  console.log(`PASS CODEX-LIVE-01 account isolation and lifecycle: ${count} assertions`);
  return count;
}
