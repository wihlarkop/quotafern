import { readMetadata, validMetadata, writeMetadata, type IdAllocator } from "./metadata";
import {
  createLocalId,
  emptyMetadata,
  PROVIDERS,
  FORBIDDEN_ALIAS_CHARACTERS,
  validateAlias,
  type AccountId,
  type AccountState,
  type ConnectionId,
  type Mechanism,
  type WorkspaceId,
} from "./model";
import { rename, restoreState } from "./state";

export const ACCOUNT_METADATA_KEY = "quotafern.account-presentation.v1";
export type LocalAction =
  | { kind: "add-account"; providerId: string; alias: string }
  | {
      kind: "add-connection";
      accountId: AccountId;
      alias: string;
      mechanism: Mechanism;
      workspaceId: WorkspaceId | null;
      workspaceAlias?: string;
    }
  | { kind: "rename-account"; id: AccountId; alias: string }
  | { kind: "rename-connection"; id: ConnectionId; alias: string }
  | { kind: "remove-account"; id: AccountId }
  | { kind: "remove-connection"; id: ConnectionId }
  | { kind: "reset" };
export type ManagementTarget =
  | { kind: "add-account"; providerId?: string }
  | { kind: "add-connection"; accountId: AccountId }
  | { kind: "rename-account"; id: AccountId }
  | { kind: "remove-account"; id: AccountId }
  | { kind: "rename-connection"; id: ConnectionId }
  | { kind: "remove-connection"; id: ConnectionId }
  | { kind: "reset" };

export function aliasError(value: string): string | null {
  if (validateAlias(value) !== null) return null;
  if (FORBIDDEN_ALIAS_CHARACTERS.test(value))
    return "Remove control, bidirectional or invisible characters.";
  if (Array.from(value.normalize("NFC").trim()).length > 80)
    return "Use 80 Unicode code points or fewer. Your label has not been shortened.";
  return "Enter a nonempty local label with visible text or emoji.";
}

/** Only for this isolated, never-native local controller; not a cleanup receipt. */
export function localRemovalAllowed(
  state: AccountState,
  accountId: AccountId,
  id?: ConnectionId,
): boolean {
  if (
    !state.metadata.accounts.some((a) => a.id === accountId) ||
    state.removingAccountIds.includes(accountId)
  )
    return false;
  const owned = state.metadata.connections.filter(
    (c) => c.accountId === accountId && (!id || c.id === id),
  );
  if (id && owned.length !== 1) return false;
  const ids = owned.map((c) => c.id);
  if (
    state.sources.some((s) => s.accountId === accountId) ||
    state.identities.some((i) => i.accountId === accountId)
  )
    return false;
  return (
    ids.every((connectionId) => {
      const runtime = state.connections.filter((c) => c.connectionId === connectionId);
      return (
        runtime.length === 1 &&
        runtime.every(
          (r) =>
            r.generation === 0 &&
            r.lifecycle === "disconnected" &&
            r.consent === "not-requested" &&
            r.authorization === "not-requested" &&
            r.lastSuccessAtMs === null &&
            r.diagnostic === null,
        )
      );
    }) &&
    !state.connections.some((r) => !state.metadata.connections.some((c) => c.id === r.connectionId))
  );
}

type StoragePort = Pick<Storage, "getItem" | "setItem">;
export type LocalStore = ReturnType<typeof createLocalStore>;
/** No runtime ingestion API: this store must never be handed to a native adapter. */
export function createLocalStore(
  getStorage: () => StoragePort,
  allocate: IdAllocator = createLocalId,
) {
  let current = restoreState(emptyMetadata());
  let expected: string | null = null;
  let blocked = false;
  let notice = "Local labels only. Nothing is signed in.";
  let readable = false;
  try {
    const storage = getStorage();
    expected = storage.getItem(ACCOUNT_METADATA_KEY);
    readable = true;
    const loaded = readMetadata(expected, allocate);
    if (loaded.status === "invalid") {
      blocked = true;
      notice =
        "Saved account metadata could not be read safely. It has been preserved. Reload after repairing storage, or explicitly reset local metadata.";
    } else {
      if (loaded.status === "migrated") {
        const encoded = writeMetadata(loaded.metadata);
        storage.setItem(ACCOUNT_METADATA_KEY, encoded);
        expected = encoded;
      }
      current = restoreState(loaded.metadata);
      if (loaded.status !== "empty")
        notice =
          "Local labels restored. All connections are disconnected; no identity or usage was restored.";
    }
  } catch {
    blocked = true;
    notice =
      "Account storage is unavailable or migration could not be saved. Existing data has been preserved. Reload to try again.";
  }
  return {
    get state() {
      return structuredClone(current);
    },
    get blocked() {
      return blocked;
    },
    get notice() {
      return notice;
    },
    get canReset() {
      return readable;
    },
    apply(
      action: LocalAction,
    ): { ok: true; state: AccountState; notice: string } | { ok: false; error: string } {
      if ((blocked && action.kind !== "reset") || (action.kind === "reset" && !readable))
        return { ok: false, error: notice };
      try {
        let next = structuredClone(current);
        const label = (value: string) => {
          const alias = validateAlias(value);
          if (alias === null) throw new Error("alias");
          return alias;
        };
        switch (action.kind) {
          case "reset":
            next = restoreState(emptyMetadata());
            break;
          case "add-account":
            if (!PROVIDERS.some((p) => p.id === action.providerId)) throw new Error("target");
            next.metadata.accounts.push({
              id: allocate("account"),
              providerId: action.providerId,
              alias: label(action.alias),
            });
            break;
          case "add-connection": {
            if (!localRemovalAllowed(next, action.accountId)) throw new Error("cleanup");
            let workspaceId = action.workspaceId;
            if (action.workspaceAlias !== undefined) {
              workspaceId = allocate("workspace");
              next.metadata.workspaces.push({
                id: workspaceId,
                accountId: action.accountId,
                alias: label(action.workspaceAlias),
              });
            }
            next.metadata.connections.push({
              id: allocate("connection"),
              accountId: action.accountId,
              workspaceId,
              alias: label(action.alias),
              mechanism: action.mechanism,
            });
            // This controller contains local metadata only: recreate disconnected runtime.
            next = restoreState(next.metadata);
            break;
          }
          case "rename-account":
            next = rename(next, "account", action.id, action.alias);
            break;
          case "rename-connection":
            next = rename(next, "connection", action.id, action.alias);
            break;
          case "remove-account": {
            if (!localRemovalAllowed(next, action.id)) throw new Error("cleanup");
            next.metadata.accounts = next.metadata.accounts.filter((a) => a.id !== action.id);
            next.metadata.workspaces = next.metadata.workspaces.filter(
              (w) => w.accountId !== action.id,
            );
            next.metadata.connections = next.metadata.connections.filter(
              (c) => c.accountId !== action.id,
            );
            next = restoreState(next.metadata);
            break;
          }
          case "remove-connection": {
            const owner = next.metadata.connections.find((c) => c.id === action.id)?.accountId;
            if (!owner || !localRemovalAllowed(next, owner, action.id)) throw new Error("cleanup");
            next.metadata.connections = next.metadata.connections.filter((c) => c.id !== action.id);
            next = restoreState(next.metadata);
            break;
          }
        }
        if (!validMetadata(next.metadata)) throw new Error("metadata");
        const encoded = writeMetadata(next.metadata);
        const storage = getStorage();
        if (storage.getItem(ACCOUNT_METADATA_KEY) !== expected)
          return {
            ok: false,
            error:
              "Saved metadata changed elsewhere. Nothing was saved. Reload before editing again.",
          };
        storage.setItem(ACCOUNT_METADATA_KEY, encoded);
        expected = encoded;
        current = next;
        blocked = false;
        notice =
          action.kind === "reset"
            ? "Local metadata reset. Appearance preferences are unchanged."
            : action.kind.startsWith("remove")
              ? "Local metadata removed. No provider account or credentials were changed."
              : "Local labels saved. Nothing is signed in.";
        return { ok: true, state: structuredClone(current), notice };
      } catch {
        return {
          ok: false,
          error:
            "Could not save local metadata. Nothing changed. Check storage availability and the 200-record / 64 KiB limits, then try again.",
        };
      }
    },
  };
}
