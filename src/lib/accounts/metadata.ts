import {
  emptyMetadata,
  isLocalId,
  isProviderId,
  validateAlias,
  type AccountMetadata,
  type LocalId,
  type LocalKind,
} from "./model";

const MAX_BYTES = 65_536;
const MAX_RECORDS = 200;
const record = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const keys = (x: Record<string, unknown>, expected: string[]) =>
  Object.keys(x).sort().join(",") === expected.sort().join(",");
const list = (x: unknown): x is unknown[] => Array.isArray(x) && x.length <= MAX_RECORDS;

export function validMetadata(value: unknown): value is AccountMetadata {
  if (
    !record(value) ||
    !keys(value, ["version", "accounts", "workspaces", "connections"]) ||
    value.version !== 1 ||
    !list(value.accounts) ||
    !list(value.workspaces) ||
    !list(value.connections)
  )
    return false;
  const accounts = new Map<string, string>();
  const workspaces = new Map<string, string>();
  const ids = new Set<string>();
  const unique = (id: string) => {
    if (ids.has(id)) return false;
    ids.add(id);
    return true;
  };
  for (const a of value.accounts) {
    if (
      !record(a) ||
      !keys(a, ["id", "providerId", "alias"]) ||
      !isLocalId(a.id, "account") ||
      !isProviderId(a.providerId) ||
      typeof a.alias !== "string" ||
      validateAlias(a.alias) !== a.alias ||
      !unique(a.id)
    )
      return false;
    accounts.set(a.id, a.providerId);
  }
  for (const w of value.workspaces) {
    if (
      !record(w) ||
      !keys(w, ["id", "accountId", "alias"]) ||
      !isLocalId(w.id, "workspace") ||
      typeof w.accountId !== "string" ||
      !accounts.has(w.accountId) ||
      typeof w.alias !== "string" ||
      validateAlias(w.alias) !== w.alias ||
      !unique(w.id)
    )
      return false;
    workspaces.set(w.id, w.accountId);
  }
  for (const c of value.connections) {
    if (
      !record(c) ||
      !keys(c, ["id", "accountId", "workspaceId", "alias", "mechanism"]) ||
      !isLocalId(c.id, "connection") ||
      typeof c.accountId !== "string" ||
      !accounts.has(c.accountId) ||
      typeof c.alias !== "string" ||
      validateAlias(c.alias) !== c.alias ||
      !unique(c.id) ||
      !(
        c.workspaceId === null ||
        (typeof c.workspaceId === "string" && workspaces.get(c.workspaceId) === c.accountId)
      ) ||
      typeof c.mechanism !== "string" ||
      !["cli-session", "codex-managed", "oauth-grant", "api-key"].includes(c.mechanism) ||
      (c.mechanism === "codex-managed" && accounts.get(c.accountId) !== "codex")
    )
      return false;
  }
  return true;
}

export type MetadataResult = {
  status: "empty" | "restored" | "migrated" | "invalid";
  metadata: AccountMetadata;
};
/** The allocator is explicit so migration is deterministic in synthetic regressions. */
export type IdAllocator = <K extends LocalKind>(kind: K) => LocalId<K>;
export function readMetadata(text: string | null, allocate: IdAllocator): MetadataResult {
  const invalid = (): MetadataResult => ({ status: "invalid", metadata: emptyMetadata() });
  if (text === null || text === "") return { status: "empty", metadata: emptyMetadata() };
  if (text.length > MAX_BYTES || new TextEncoder().encode(text).length > MAX_BYTES)
    return invalid();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return invalid();
  }
  if (validMetadata(value)) return { status: "restored", metadata: value };
  // Only this hypothetical pre-ACC alias envelope migrates. F3 persisted no account records.
  if (
    record(value) &&
    keys(value, ["version", "accountAlias", "connectionAlias"]) &&
    value.version === 0
  ) {
    const accountAlias = validateAlias(value.accountAlias);
    const connectionAlias = validateAlias(value.connectionAlias);
    if (accountAlias === null || connectionAlias === null) return invalid();
    const accountId = allocate("account");
    const migrated: AccountMetadata = {
      version: 1,
      accounts: [{ id: accountId, providerId: "codex", alias: accountAlias }],
      workspaces: [],
      connections: [
        {
          id: allocate("connection"),
          accountId,
          workspaceId: null,
          alias: connectionAlias,
          mechanism: "cli-session",
        },
      ],
    };
    return validMetadata(migrated) ? { status: "migrated", metadata: migrated } : invalid();
  }
  return invalid();
}

/** No storage side effect. Reject extra fields instead of serializing auth/runtime data. */
export function writeMetadata(metadata: AccountMetadata): string {
  if (!validMetadata(metadata)) throw new Error("Invalid account metadata");
  const text = JSON.stringify(metadata);
  if (new TextEncoder().encode(text).length > MAX_BYTES)
    throw new Error("Account metadata too large");
  return text;
}
