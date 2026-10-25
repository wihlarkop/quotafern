import {
  ACCOUNT_METADATA_KEY,
  aliasError,
  createLocalStore,
  localRemovalAllowed,
  type LocalAction,
} from "../src/lib/accounts/local";
import { readMetadata, writeMetadata } from "../src/lib/accounts/metadata";
import {
  createLocalId,
  emptyMetadata,
  validateAlias,
  type AccountState,
  type ConnectionRuntime,
} from "../src/lib/accounts/model";
import { initialNavigation, reconcileNavigation } from "../src/lib/accounts/navigation";
import {
  beginAuthorizedSession,
  disconnect,
  prepareAccountRemoval,
  restoreState,
} from "../src/lib/accounts/state";
import { overviewView } from "../src/lib/accounts/views";

export function runLocalAccountsRegression() {
  let count = 0;
  function assert(ok: unknown, message: string): asserts ok {
    count++;
    if (!ok) throw new Error(message);
  }
  const equal = (a: unknown, b: unknown, message: string) =>
    assert(JSON.stringify(a) === JSON.stringify(b), message);
  const memory = (initial: string | null = null) => {
    let text = initial;
    let fail = false;
    return {
      getItem(key: string) {
        assert(key === ACCOUNT_METADATA_KEY, "only approved namespace read");
        return text;
      },
      setItem(key: string, value: string) {
        assert(key === ACCOUNT_METADATA_KEY, "only approved namespace written");
        if (fail) throw new Error("synthetic failure");
        text = value;
      },
      get text() {
        return text;
      },
      set text(value) {
        text = value;
      },
      set fail(value: boolean) {
        fail = value;
      },
    };
  };
  const storage = memory();
  const store = createLocalStore(() => storage);
  const apply = (action: LocalAction) => {
    const result = store.apply(action);
    assert(result.ok, `save ${action.kind}`);
    return result.state;
  };
  equal(storage.text, null, "empty startup does not write");
  equal(store.state, restoreState(emptyMetadata()), "no invented F3 account");
  apply({ kind: "add-account", providerId: "codex", alias: "  Personal  " });
  apply({ kind: "add-account", providerId: "codex", alias: "Work" });
  apply({ kind: "add-account", providerId: "openrouter", alias: "Personal" });
  const [personal, work, router] = store.state.metadata.accounts;
  assert(personal.id !== work.id, "independent account IDs");
  equal(personal.alias, "Personal", "trimmed alias");
  apply({
    kind: "add-connection",
    accountId: personal.id,
    alias: "Desktop session",
    mechanism: "cli-session",
    workspaceId: null,
  });
  apply({
    kind: "add-connection",
    accountId: work.id,
    alias: "Work session",
    mechanism: "cli-session",
    workspaceId: null,
  });
  for (const alias of ["Personal Key", "Project B Key"])
    apply({
      kind: "add-connection",
      accountId: router.id,
      alias,
      mechanism: "api-key",
      workspaceId: null,
    });
  const [desktop, workSession, keyA, keyB] = store.state.metadata.connections;
  assert(
    keyA.id !== keyB.id && String(personal.id) !== String(desktop.id),
    "connection and account identities independent",
  );
  apply({ kind: "rename-account", id: personal.id, alias: "Work" });
  equal(
    store.state.metadata.accounts.slice(0, 2).map((a) => a.alias),
    ["Work", "Work"],
    "duplicate names preserve both records",
  );
  apply({ kind: "rename-connection", id: keyA.id, alias: "開発 👩‍💻" });
  equal(
    store.state.metadata.connections.find((c) => c.id === keyB.id)?.alias,
    "Project B Key",
    "key rename independent",
  );
  const beforeUnicode = store.state.metadata.accounts[0].id;
  apply({ kind: "rename-account", id: personal.id, alias: " e\u0301 🌿 " });
  equal(
    store.state.metadata.accounts[0],
    { ...personal, alias: "é 🌿" },
    "NFC and Unicode keep ID/provider",
  );
  equal(beforeUnicode, personal.id, "stable rename identity");
  for (const alias of [
    "",
    "   ",
    "a\u0000",
    "x\u202e",
    "x\u200b",
    "x\ufeff",
    "x\u2060",
    "x\u034f",
    "x\u061c",
    "x\u3164",
    "x\u17b4",
    "🌿".repeat(81),
  ]) {
    const before = store.state;
    const bytes = storage.text;
    assert(aliasError(alias), "precise invalid label feedback");
    assert(
      !store.apply({ kind: "rename-account", id: personal.id, alias }).ok,
      "invalid label rejected",
    );
    equal(store.state, before, "invalid label state unchanged");
    equal(storage.text, bytes, "invalid label storage unchanged");
  }
  assert(validateAlias("🌿".repeat(80)) !== null, "80 astral code points accepted");
  apply({
    kind: "add-connection",
    accountId: router.id,
    alias: "Workspace key",
    mechanism: "api-key",
    workspaceId: null,
    workspaceAlias: "Team 🧑‍💻",
  });
  const workspace = store.state.metadata.workspaces[0];
  assert(workspace.accountId === router.id, "workspace belongs to owner");
  const beforeCrossOwner = store.state;
  assert(
    !store.apply({
      kind: "add-connection",
      accountId: personal.id,
      alias: "wrong",
      mechanism: "api-key",
      workspaceId: workspace.id,
    }).ok,
    "cross-owner workspace rejected",
  );
  equal(store.state, beforeCrossOwner, "cross-owner failure atomic");
  const snapshot = store.state;
  snapshot.metadata.accounts.length = 0;
  assert(store.state.metadata.accounts.length === 3, "snapshot cannot mutate store");
  storage.fail = true;
  const beforeWrite = store.state;
  const beforeBytes = storage.text;
  assert(
    !store.apply({ kind: "rename-account", id: personal.id, alias: "Unsaved" }).ok,
    "write failure returned",
  );
  equal(store.state, beforeWrite, "failed write not visible");
  equal(storage.text, beforeBytes, "failed write prior bytes preserved");
  storage.fail = false;
  const restored = createLocalStore(() => storage);
  equal(restored.state.metadata, store.state.metadata, "stable IDs across restart");
  assert(
    restored.state.connections.every(
      (c) =>
        c.lifecycle === "disconnected" &&
        c.generation === 0 &&
        c.consent === "not-requested" &&
        c.authorization === "not-requested",
    ),
    "every restored connection disconnected without consent",
  );
  equal(
    [restored.state.sources, restored.state.identities],
    [[], []],
    "no quotas/identities restored",
  );
  equal(
    overviewView(
      restored.state,
      { kind: "account", providerId: "codex", accountId: personal.id },
      Date.now(),
    ).sources,
    [],
    "local descriptors invent no readings",
  );
  const navigation = {
    ...initialNavigation(),
    selection: { kind: "account" as const, providerId: "codex", accountId: personal.id },
  };
  apply({ kind: "remove-account", id: personal.id });
  equal(
    reconcileNavigation(store.state, navigation).selection,
    { kind: "all" },
    "removed Overview selection invalidates",
  );
  assert(
    store.state.metadata.accounts.some((a) => a.id === work.id),
    "other account retained",
  );
  assert(
    store.state.metadata.connections.some((c) => c.id === workSession.id),
    "other account connection retained",
  );
  apply({ kind: "remove-connection", id: keyA.id });
  assert(
    store.state.metadata.connections.some((c) => c.id === keyB.id),
    "other key retained",
  );
  const pendingBase = restored.state;
  assert(localRemovalAllowed(pendingBase, personal.id), "pristine local record removable");
  const active = beginAuthorizedSession(pendingBase, desktop.id);
  assert(!localRemovalAllowed(active, personal.id), "native session cannot be removed");
  assert(
    !localRemovalAllowed(disconnect(active, desktop.id), personal.id),
    "disconnected prior native work cannot be removed",
  );
  assert(
    !localRemovalAllowed(prepareAccountRemoval(pendingBase, personal.id).state, personal.id),
    "pending cleanup cannot be removed",
  );
  for (const patch of [
    { generation: 1 },
    { lifecycle: "connected" },
    { consent: "granted" },
    { authorization: "granted" },
    { diagnostic: "cleanup-failed" },
    { lastSuccessAtMs: 1 },
  ] as Partial<ConnectionRuntime>[]) {
    const changed = structuredClone(pendingBase);
    Object.assign(
      changed.connections.find((c) => c.connectionId === desktop.id)!,
      patch,
    );
    assert(
      !localRemovalAllowed(changed, personal.id),
      "every native runtime indicator blocks removal",
    );
  }
  const missingRuntime = structuredClone(pendingBase);
  missingRuntime.connections = [];
  assert(!localRemovalAllowed(missingRuntime, personal.id), "missing runtime fails closed");
  const identity: AccountState = structuredClone(pendingBase);
  identity.identities.push({
    accountId: personal.id,
    connectionId: desktop.id,
    label: "synthetic",
  });
  assert(!localRemovalAllowed(identity, personal.id), "identity blocks removal");
  for (const text of [
    "{",
    "x".repeat(65_537),
    JSON.stringify({ version: 99 }),
    JSON.stringify({ ...emptyMetadata(), token: "synthetic-rejected" }),
  ]) {
    const corrupt = memory(text);
    const locked = createLocalStore(() => corrupt);
    assert(
      locked.blocked && locked.canReset,
      "invalid storage locks management with explicit recovery",
    );
    equal(locked.state.metadata, emptyMetadata(), "invalid envelope not partially loaded");
    assert(
      !locked.apply({ kind: "add-account", providerId: "codex", alias: "no" }).ok,
      "cannot overwrite corrupt data through add",
    );
    equal(corrupt.text, text, "rejected bytes preserved");
    corrupt.fail = true;
    assert(!locked.apply({ kind: "reset" }).ok, "reset write failure visible");
    equal(corrupt.text, text, "failed reset preserves bytes");
    corrupt.fail = false;
    assert(locked.apply({ kind: "reset" }).ok, "explicit reset succeeds");
    equal(JSON.parse(corrupt.text!), emptyMetadata(), "reset only v1 envelope");
  }
  const unavailable = createLocalStore(() => {
    throw new Error("unavailable");
  });
  assert(
    unavailable.blocked && !unavailable.canReset,
    "read unavailable cannot reset unobserved storage",
  );
  const legacy = JSON.stringify({ version: 0, accountAlias: "Old", connectionAlias: "CLI" });
  const migrating = memory(legacy);
  migrating.fail = true;
  const failedMigration = createLocalStore(() => migrating);
  assert(failedMigration.blocked, "migration save failure blocks activation");
  equal(failedMigration.state.metadata, emptyMetadata(), "undurable migration IDs never displayed");
  equal(migrating.text, legacy, "migration failure preserves v0");
  migrating.fail = false;
  const migrated = createLocalStore(() => migrating);
  assert(
    !migrated.blocked && JSON.parse(migrating.text!).version === 1,
    "defined migration saved as v1",
  );
  equal(
    createLocalStore(() => migrating).state.metadata,
    migrated.state.metadata,
    "migrated IDs durable",
  );
  const changedElsewhere = memory();
  const conflicting = createLocalStore(() => changedElsewhere);
  changedElsewhere.text = "{external}";
  assert(
    !conflicting.apply({ kind: "add-account", providerId: "codex", alias: "new" }).ok,
    "intervening external write blocks overwrite",
  );
  equal(changedElsewhere.text, "{external}", "external bytes preserved");
  const limitMeta = emptyMetadata();
  for (let n = 0; n < 200; n++)
    limitMeta.accounts.push({
      id: createLocalId("account"),
      providerId: "codex",
      alias: "🌿".repeat(80),
    });
  assert(
    readMetadata(JSON.stringify(limitMeta), createLocalId).status === "invalid",
    "UTF8 envelope over 64KiB rejected",
  );
  const limitStorage = memory(
    writeMetadata({
      ...limitMeta,
      accounts: limitMeta.accounts.map((a) => ({ ...a, alias: "A" })),
    }),
  );
  const limited = createLocalStore(() => limitStorage);
  assert(
    !limited.apply({ kind: "add-account", providerId: "codex", alias: "201" }).ok,
    "201st account refused",
  );
  assert(limited.state.metadata.accounts.length === 200, "collection failure unchanged");
  console.log(`PASS ACC-04 local metadata persistence and removal: ${count} assertions`);
  return count;
}
