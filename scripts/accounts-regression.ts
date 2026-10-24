import { readMetadata, validMetadata, writeMetadata } from "../src/lib/accounts/metadata";
import {
  createLocalId,
  emptyMetadata,
  PROVIDERS,
  validateAlias,
  type AccountMetadata,
  type AccountState,
  type ConnectionId,
  type LocalId,
  type LocalKind,
  type QuotaSource,
} from "../src/lib/accounts/model";
import {
  beginAuthorizedSession,
  disconnect,
  failConnection,
  finishAccountRemoval,
  prepareAccountRemoval,
  publishSource,
  removeConnection,
  rename,
  restoreState,
  setVerifiedIdentity,
} from "../src/lib/accounts/state";
import {
  accountsView,
  detailsView,
  overviewView,
  resolveSelection,
  sourceAt,
  type Selection,
} from "../src/lib/accounts/views";

let count = 0;
function assert(value: unknown, message: string): asserts value {
  count++;
  if (!value) throw new Error(message);
}
function equal(actual: unknown, expected: unknown, message: string) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}
function rejects(fn: () => unknown, message: string) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, message);
}
const id = <K extends LocalKind>(kind: K, n: number): LocalId<K> =>
  `${kind}_00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const a = id("account", 1),
  b = id("account", 2),
  api = id("account", 3);
const ca = id("connection", 1),
  cb = id("connection", 2),
  key1 = id("connection", 3),
  key2 = id("connection", 4);
const workspace = id("workspace", 1);
const at = 1_800_000_000_000;

function fixture(): AccountMetadata {
  return {
    version: 1,
    accounts: [
      { id: a, providerId: "codex", alias: "Personal" },
      { id: b, providerId: "codex", alias: "Personal" },
      { id: api, providerId: "openrouter", alias: "開発 👩‍💻" },
    ],
    workspaces: [{ id: workspace, accountId: api, alias: "Project B" }],
    connections: [
      { id: ca, accountId: a, workspaceId: null, alias: "Session", mechanism: "cli-session" },
      { id: cb, accountId: b, workspaceId: null, alias: "Session", mechanism: "cli-session" },
      { id: key1, accountId: api, workspaceId: workspace, alias: "Key", mechanism: "api-key" },
      { id: key2, accountId: api, workspaceId: workspace, alias: "Key", mechanism: "api-key" },
    ],
  };
}
function connected(): AccountState {
  let s = restoreState(fixture());
  for (const c of [ca, cb, key1, key2]) s = beginAuthorizedSession(s, c);
  return s;
}
function source(state: AccountState, connectionId: ConnectionId, n: number): QuotaSource {
  const c = state.metadata.connections.find((x) => x.id === connectionId)!;
  const owner = state.metadata.accounts.find((x) => x.id === c.accountId)!;
  return {
    id: id("source", n),
    providerId: owner.providerId,
    accountId: owner.id,
    workspaceId: c.workspaceId,
    association: { kind: "verified", connectionIds: [connectionId] },
    connectionGenerations: {
      [connectionId]: state.connections.find((r) => r.connectionId === connectionId)!.generation,
    },
    origin: "synthetic",
    authority: "synthetic-fixture",
    freshness: "current",
    fetchedAtMs: at,
    staleAfterMs: 300_000,
    data: {
      subscription: [
        {
          id: id("window", n),
          label: "Primary",
          remainingPercent: null,
          resetAtMs: null,
          durationMins: null,
        },
      ],
      apiMetering: null,
      spending: null,
      credits: null,
      entitlements: null,
      activity: null,
    },
  };
}
function publish(s: AccountState, c: ConnectionId, value: QuotaSource) {
  return publishSource(s, c, s.connections.find((r) => r.connectionId === c)!.generation, value);
}

export function runAccountsRegression(): number {
  count = 0;
  const metadata = fixture();
  assert(validMetadata(metadata), "two Codex accounts and two API keys have valid metadata");
  assert(
    createLocalId("account") !== createLocalId("account"),
    "random opaque local IDs are independently allocated",
  );
  const fresh = restoreState(metadata);
  assert(
    fresh.connections.every(
      (c) =>
        c.lifecycle === "disconnected" &&
        c.consent === "not-requested" &&
        c.authorization === "not-requested",
    ),
    "metadata never restores consent or connections",
  );
  equal(fresh.sources, [], "restore never restores source data");
  equal(accountsView(fresh)[0].accounts.length, 2, "same provider accounts group independently");
  equal(
    accountsView(fresh).find((p) => p.providerId === "openrouter")?.accounts[0].connections.length,
    2,
    "two named API keys under one account",
  );
  assert(
    PROVIDERS.every(
      (p) => !p.capabilities.monitoring && p.capabilities.multipleAccounts === "unverified",
    ),
    "catalog is no authorization claim",
  );
  assert(
    accountsView(fresh).some(
      (p) => p.providerId === "claude-code" && p.availability === "coming-soon",
    ),
    "unsupported provider Coming Soon",
  );
  assert(
    overviewView(restoreState(emptyMetadata()), { kind: "all" }, at).empty,
    "empty accounts show no synthetic live fallback",
  );

  for (const alias of ["Same", "👩‍💻 開発", "x".repeat(80), "é", "<literal text>"])
    assert(validateAlias(alias) === alias, "accept Unicode, long bounded and text-only aliases");
  equal(validateAlias("  e\u0301  "), "é", "normalize and trim aliases");
  for (const alias of [
    "",
    " ",
    "\u200d",
    "x".repeat(81),
    "bad\nname",
    "a\u202ename",
    "a\u200bname",
    "\u0000",
  ])
    equal(validateAlias(alias), null, "reject empty, overlong or deceptive controls");
  let s = connected();
  const before = JSON.stringify(s.connections);
  s = rename(s, "account", a, "Work");
  s = rename(s, "connection", ca, "Work key");
  equal(s.metadata.accounts.find((x) => x.id === a)?.alias, "Work", "account rename");
  equal(s.metadata.connections.find((x) => x.id === ca)?.alias, "Work key", "connection rename");
  equal(JSON.stringify(s.connections), before, "rename never alters authorization or lifecycle");
  equal(
    s.metadata.accounts.find((x) => x.id === b)?.alias,
    "Personal",
    "rename does not mutate another duplicate alias",
  );
  rejects(() => rename(s, "account", a, " "), "invalid rename rejected");
  rejects(
    () => rename(s, "connection", id("connection", 99), "Name"),
    "unknown rename target rejected",
  );

  const sa = source(s, ca, 1),
    sb = source(s, cb, 2),
    wallet = source(s, key1, 3);
  sa.data.subscription[0].remainingPercent = 0;
  sb.data.subscription[0].remainingPercent = 91;
  sb.fetchedAtMs = at - 300_000;
  wallet.association = { kind: "verified", connectionIds: [key1, key2] };
  wallet.connectionGenerations[key2] = s.connections.find(
    (r) => r.connectionId === key2,
  )!.generation;
  wallet.data.credits = { balance: "20.50", unit: "provider-credits", unlimited: false };
  wallet.data.apiMetering = { value: 700, unit: "tokens" };
  wallet.data.spending = { used: "2.50", limit: null, currency: null };
  wallet.data.activity = [
    { date: "2024-02-29", tokens: 0 },
    { date: "2024-03-01", tokens: null },
  ];
  s = publish(s, ca, sa);
  s = publish(s, cb, sb);
  s = publish(s, key1, wallet);
  sa.data.subscription[0].remainingPercent = 99;
  equal(
    s.sources[0].data.subscription[0].remainingPercent,
    0,
    "published data cannot be mutated through input",
  );
  const all = overviewView(s, { kind: "all" }, at, "synthetic");
  equal(all.sources.length, 3, "shared billing source counted once across keys");
  equal(all.totals, null, "no sums of quota credits money or usage");
  equal(all.sources.find((x) => x.id === sb.id)?.freshness, "stale", "only account B data ages");
  equal(all.sources.find((x) => x.id === sa.id)?.freshness, "current", "account A stays fresh");
  equal(all.label, "Synthetic demo", "synthetic projection visibly labeled");
  equal(
    overviewView(s, { kind: "all" }, at).sources,
    [],
    "live projection never includes fixtures",
  );
  equal(s.sources[1].freshness, "current", "aging never mutates stored data");
  equal(
    sourceAt(s.sources[0], at - 1).freshness,
    "stale",
    "future timestamps cannot appear current",
  );
  equal(
    sourceAt(s.sources[0], Number.NaN).freshness,
    "stale",
    "invalid clock cannot appear current",
  );
  all.sources[0].data.subscription[0].remainingPercent = 80;
  equal(s.sources[0].data.subscription[0].remainingPercent, 0, "view cannot mutate source state");

  const selection: Selection = {
    kind: "connection",
    providerId: "codex",
    accountId: a,
    connectionId: ca,
  };
  equal(
    overviewView(s, selection, at, "synthetic").sources.map((x) => x.id),
    [sa.id],
    "connection filter ownership",
  );
  equal(
    overviewView(s, { kind: "provider", providerId: "codex" }, at, "synthetic").sources.length,
    2,
    "provider filter",
  );
  equal(
    detailsView(
      s,
      { kind: "account", providerId: "codex", accountId: b },
      at,
      "synthetic",
    )?.sources.map((x) => x.id),
    [sb.id],
    "account switch never shows prior account data",
  );
  equal(
    detailsView(s, { kind: "connection", providerId: "codex", accountId: b, connectionId: ca }, at),
    null,
    "mismatched connection details fail closed",
  );
  equal(
    detailsView(s, { kind: "account", providerId: "openrouter", accountId: a }, at),
    null,
    "cross-provider details fail closed",
  );
  equal(
    resolveSelection(s, {
      kind: "account",
      providerId: "codex",
      accountId: a,
      workspaceId: workspace,
    }),
    { kind: "all" },
    "cross-account workspace filter invalid",
  );
  equal(
    overviewView(
      s,
      { kind: "account", providerId: "openrouter", accountId: api, workspaceId: workspace },
      at,
      "synthetic",
    ).sources.length,
    1,
    "workspace selection includes correct wallet",
  );
  equal(
    overviewView(
      s,
      { kind: "connection", providerId: "openrouter", accountId: api, connectionId: key2 },
      at,
      "synthetic",
    ).sources.length,
    1,
    "shared wallet visible from second authorized key",
  );

  const unknown1 = source(s, key1, 4),
    unknown2 = source(s, key2, 5);
  unknown1.association = { kind: "unknown", connectionIds: [key1] };
  unknown2.association = { kind: "unknown", connectionIds: [key2] };
  let unresolved = publish(publish(s, key1, unknown1), key2, unknown2);
  equal(
    overviewView(unresolved, { kind: "all" }, at, "synthetic").billingRelationship,
    "unknown",
    "unknown billing is explicit",
  );
  equal(
    overviewView(unresolved, { kind: "all" }, at, "synthetic").sources.length,
    5,
    "unknown relationships never assumed shared or separate for totals",
  );
  equal(
    overviewView(unresolved, { kind: "all" }, at, "synthetic").totals,
    null,
    "unknown billing has no total",
  );
  unresolved = failConnection(
    unresolved,
    ca,
    unresolved.connections.find((r) => r.connectionId === ca)!.generation,
    "authentication-expired",
  );
  equal(
    unresolved.connections.find((x) => x.connectionId === ca)?.authorization,
    "expired",
    "one connection expired",
  );
  equal(
    unresolved.connections.find((x) => x.connectionId === cb),
    s.connections.find((x) => x.connectionId === cb),
    "account A auth error cannot corrupt B",
  );
  equal(
    detailsView(unresolved, { kind: "account", providerId: "codex", accountId: a }, at, "synthetic")
      ?.sources,
    [],
    "auth expiry clears target values",
  );
  equal(
    detailsView(unresolved, { kind: "account", providerId: "codex", accountId: b }, at, "synthetic")
      ?.sources.length,
    1,
    "B retains its values",
  );

  let disconnected = disconnect(s, key1);
  equal(
    disconnected.sources.find((x) => x.id === wallet.id)?.association.connectionIds,
    [key2],
    "disconnect revokes only one wallet link",
  );
  equal(
    disconnected.connections.find((x) => x.connectionId === key2),
    s.connections.find((x) => x.connectionId === key2),
    "disconnect never logs out another key",
  );
  rejects(() => removeConnection(s, key1, 1), "cannot remove an active connection");
  rejects(
    () => removeConnection(disconnected, key1, 0),
    "cannot use stale cleanup acknowledgement",
  );
  disconnected = removeConnection(
    disconnected,
    key1,
    disconnected.connections.find((x) => x.connectionId === key1)!.generation,
  );
  equal(disconnected.metadata.connections.length, 3, "remove one connection only");
  equal(disconnected.metadata.accounts.length, 3, "connection removal keeps accounts");
  equal(
    publishSource(disconnected, key1, 1, wallet),
    disconnected,
    "late removed connection result rejected",
  );
  equal(
    publishSource(disconnect(s, ca), ca, 1, s.sources[0]),
    disconnect(s, ca),
    "late disconnected result rejected",
  );
  const reconnected = beginAuthorizedSession(disconnect(s, ca), ca);
  equal(
    publishSource(reconnected, ca, 1, s.sources[0]),
    reconnected,
    "late old generation rejected after reconnect",
  );

  const removal = prepareAccountRemoval(s, a);
  rejects(
    () => finishAccountRemoval(removal.state, a, []),
    "account remains pending until native cleanup",
  );
  rejects(() => beginAuthorizedSession(removal.state, ca), "removal blocks new monitoring");
  rejects(() => rename(removal.state, "account", a, "New"), "removal blocks account edits");
  equal(
    detailsView(removal.state, { kind: "account", providerId: "codex", accountId: a }, at),
    null,
    "pending removal hides details",
  );
  const removed = finishAccountRemoval(removal.state, a, removal.cleanup);
  equal(
    removed.metadata.accounts.map((x) => x.id),
    [b, api],
    "removal preserves other accounts",
  );
  equal(resolveSelection(removed, selection), { kind: "all" }, "removed selection returns All");
  equal(
    detailsView(removed, { kind: "account", providerId: "codex", accountId: a }, at),
    null,
    "removed details never become another account",
  );
  const apiRemoval = prepareAccountRemoval(s, api);
  equal(
    finishAccountRemoval(apiRemoval.state, api, apiRemoval.cleanup).metadata.workspaces,
    [],
    "account removal clears owned workspaces",
  );

  const identity = { accountId: a, connectionId: ca, label: "Verified personal workspace" };
  rejects(
    () => setVerifiedIdentity(fresh, identity, 0),
    "alias is not verified identity or consent",
  );
  const identified = setVerifiedIdentity(s, identity, 1);
  equal(
    accountsView(identified)[0].accounts[0].verifiedIdentity,
    identity.label,
    "authorized sanitized identity separate from alias",
  );
  equal(
    disconnect(identified, ca).identities,
    [],
    "identity cleared when authorizing connection disconnects",
  );
  equal(
    readMetadata(writeMetadata(identified.metadata), createLocalId).metadata,
    identified.metadata,
    "only non-sensitive metadata round trips",
  );
  assert(
    !writeMetadata(identified.metadata).includes("Verified personal"),
    "verified identity never persists",
  );
  let keysIdentified = setVerifiedIdentity(
    s,
    { accountId: api, connectionId: key1, label: "Identity A" },
    1,
  );
  keysIdentified = setVerifiedIdentity(
    keysIdentified,
    { accountId: api, connectionId: key2, label: "Identity B" },
    1,
  );
  equal(keysIdentified.identities.length, 2, "multiple connection identities are independent");
  equal(
    detailsView(
      keysIdentified,
      { kind: "connection", providerId: "openrouter", accountId: api, connectionId: key1 },
      at,
    )?.verifiedIdentity,
    "Identity A",
    "key1 details identity scoped correctly",
  );
  equal(
    detailsView(
      keysIdentified,
      { kind: "connection", providerId: "openrouter", accountId: api, connectionId: key2 },
      at,
    )?.verifiedIdentity,
    "Identity B",
    "key2 details identity scoped correctly",
  );
  equal(
    accountsView(keysIdentified).find((p) => p.providerId === "openrouter")?.accounts[0]
      .verifiedIdentity,
    null,
    "multi-connection account has no implied common identity",
  );
  equal(
    disconnect(keysIdentified, key1).identities.map((i) => i.label),
    ["Identity B"],
    "disconnect one key retains other identity",
  );
  const newSession = beginAuthorizedSession(disconnect(keysIdentified, key1), key1);
  equal(
    setVerifiedIdentity(
      newSession,
      { accountId: api, connectionId: key1, label: "Old identity" },
      1,
    ),
    newSession,
    "late identity cannot enter reconnected session",
  );
  equal(
    failConnection(newSession, key1, 1, "refresh-failed"),
    newSession,
    "late failure cannot stop reconnected session",
  );
  const sharedNewSession = beginAuthorizedSession(disconnect(s, key2), key2);
  equal(
    publish(sharedNewSession, key1, wallet),
    sharedNewSession,
    "shared response cannot reattach a reconnected key using stale evidence",
  );
  const currentEvidence = structuredClone(wallet);
  currentEvidence.connectionGenerations[key2] = sharedNewSession.connections.find(
    (r) => r.connectionId === key2,
  )!.generation;
  equal(
    publish(sharedNewSession, key1, currentEvidence).sources.find((x) => x.id === wallet.id)
      ?.association.connectionIds,
    [key1, key2],
    "fresh generation-bound shared evidence accepted",
  );

  for (const mutate of [
    (m: AccountMetadata) => {
      m.accounts[2].id = a;
    },
    (m: AccountMetadata) => {
      m.connections[3].id = ca;
    },
    (m: AccountMetadata) => {
      m.connections[0].workspaceId = workspace;
    },
    (m: AccountMetadata) => {
      m.connections[0].accountId = id("account", 99);
    },
    (m: AccountMetadata) => {
      m.accounts[0].alias = "x".repeat(81);
    },
    (m: AccountMetadata) => {
      Object.assign(m.accounts[0], { alias: null });
    },
    (m: AccountMetadata) => {
      Object.assign(m.workspaces[0], { alias: null });
    },
    (m: AccountMetadata) => {
      Object.assign(m.connections[0], { alias: null });
    },
    (m: AccountMetadata) => {
      Object.assign(m.connections[0], { mechanism: ["api-key"] });
    },
    (m: AccountMetadata) => {
      Object.assign(m.connections[0], { apiKey: "synthetic-forbidden-field" });
    },
  ]) {
    const m = fixture();
    mutate(m);
    assert(
      !validMetadata(m),
      "duplicate IDs, provider collisions, orphan parents, secret fields rejected",
    );
    equal(
      readMetadata(JSON.stringify(m), createLocalId).status,
      "invalid",
      "malformed graph fails closed",
    );
    rejects(() => writeMetadata(m), "invalid metadata never serialized");
  }
  for (const text of [
    "{",
    "null",
    "[]",
    '{"version":99}',
    JSON.stringify({ ...fixture(), consent: true }),
    "x".repeat(65_537),
    JSON.stringify({ version: 0, accountAlias: "Name", connectionAlias: " ", token: "fake" }),
  ]) {
    const result = readMetadata(text, createLocalId);
    equal(result.status, "invalid", "invalid persisted record refused");
    equal(result.metadata, emptyMetadata(), "invalid records restore empty disconnected state");
  }
  equal(
    readMetadata(null, createLocalId).status,
    "empty",
    "legacy F3 no account metadata remains empty",
  );
  equal(readMetadata("", createLocalId).status, "empty", "empty metadata");
  equal(
    readMetadata(writeMetadata(emptyMetadata()), createLocalId).status,
    "restored",
    "explicit empty v1 is valid",
  );
  const migrated = readMetadata(
    JSON.stringify({ version: 0, accountAlias: " Personal ", connectionAlias: " CLI " }),
    (kind) => id(kind, 77),
  );
  equal(migrated.status, "migrated", "explicit legacy alias envelope migration");
  equal(migrated.metadata.accounts[0].alias, "Personal", "legacy alias validated");
  equal(
    restoreState(migrated.metadata).connections[0].consent,
    "not-requested",
    "legacy migration never revives auth",
  );
  equal(
    readMetadata(writeMetadata(migrated.metadata), createLocalId).metadata,
    migrated.metadata,
    "second load preserves migrated IDs",
  );
  equal(
    readMetadata(JSON.stringify({ codexSnapshot: { source: "live" } }), createLocalId).status,
    "invalid",
    "never infer metadata or auth from legacy runtime snapshot",
  );

  for (const mutate of [
    (x: QuotaSource) => {
      x.providerId = "openrouter";
    },
    (x: QuotaSource) => {
      x.accountId = b;
    },
    (x: QuotaSource) => {
      x.workspaceId = workspace;
    },
    (x: QuotaSource) => {
      x.association = { kind: "verified", connectionIds: [ca, cb] };
    },
    (x: QuotaSource) => {
      x.data.subscription[0].remainingPercent = Number.NaN;
    },
    (x: QuotaSource) => {
      x.data.subscription[0].remainingPercent = 101;
    },
    (x: QuotaSource) => {
      x.authority = "authorized-provider-read";
    },
    (x: QuotaSource) => {
      x.data.spending = { used: "NaN", limit: null, currency: "USD" };
    },
    (x: QuotaSource) => {
      x.data.activity = [{ date: "2024-02-30", tokens: 3 }];
    },
  ]) {
    const invalid = source(s, ca, 90);
    mutate(invalid);
    rejects(() => publish(s, ca, invalid), "source ownership and invalid measures refused");
  }
  const collision = source(s, cb, 1);
  rejects(() => publish(s, cb, collision), "source ID collision across accounts refused");
  const crossProviderCollision = source(s, key1, 1);
  rejects(
    () => publish(s, key1, crossProviderCollision),
    "source ID collision across providers refused",
  );
  const older = structuredClone(s.sources[0]);
  older.fetchedAtMs = at - 1;
  equal(publish(s, ca, older), s, "out-of-order refresh cannot replace newer observation");
  const missing = source(s, ca, 10);
  missing.freshness = "unknown";
  missing.fetchedAtMs = null;
  const unknown = publish(s, ca, missing).sources.find((x) => x.id === missing.id)!;
  equal(unknown.data.subscription[0].remainingPercent, null, "missing quota is unknown never zero");
  equal(unknown.data.subscription[0].resetAtMs, null, "missing reset stays unknown");
  console.log(`PASS ACC-01 multi-account synthetic regression: ${count} assertions`);
  return count;
}
