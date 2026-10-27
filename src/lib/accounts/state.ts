import { validMetadata } from "./metadata";
import {
  validateAlias,
  isLocalId,
  type AccountMetadata,
  type AccountState,
  type AccountId,
  type ConnectionId,
  type ConnectionRuntime,
  type Diagnostic,
  type QuotaSource,
  type VerifiedIdentity,
} from "./model";

export function restoreState(metadata: AccountMetadata): AccountState {
  if (!validMetadata(metadata)) throw new Error("Invalid account metadata");
  return {
    metadata: structuredClone(metadata),
    sources: [],
    identities: [],
    removingAccountIds: [],
    connections: metadata.connections.map((c) => ({
      connectionId: c.id,
      generation: 0,
      lifecycle: "disconnected",
      consent: "not-requested",
      authorization: "not-requested",
      lastSuccessAtMs: null,
      diagnostic: null,
    })),
  };
}

export function rename(
  state: AccountState,
  kind: "account" | "connection",
  id: AccountId | ConnectionId,
  value: string,
): AccountState {
  const alias = validateAlias(value);
  if (alias === null) throw new Error("Invalid alias");
  const items = kind === "account" ? state.metadata.accounts : state.metadata.connections;
  const item = items.find((x) => x.id === id);
  if (!item) throw new Error("Unknown alias target");
  const accountId =
    kind === "account" ? id : state.metadata.connections.find((c) => c.id === id)!.accountId;
  if (state.removingAccountIds.includes(accountId as AccountId))
    throw new Error("Account removal pending");
  return {
    ...state,
    metadata: {
      ...state.metadata,
      [kind === "account" ? "accounts" : "connections"]: items.map((x) =>
        x.id === id ? { ...x, alias } : x,
      ),
    },
  };
}

function updateConnection(
  state: AccountState,
  id: ConnectionId,
  update: (c: ConnectionRuntime) => ConnectionRuntime,
): AccountState {
  if (!state.connections.some((c) => c.connectionId === id)) throw new Error("Unknown connection");
  return {
    ...state,
    connections: state.connections.map((c) => (c.connectionId === id ? update(c) : c)),
  };
}

/** Contract-only transition: caller must be a future native-authorized adapter. Never authorizes IPC. */
export function beginAuthorizedSession(state: AccountState, id: ConnectionId): AccountState {
  const connection = state.metadata.connections.find((c) => c.id === id);
  if (!connection || state.removingAccountIds.includes(connection.accountId))
    throw new Error("Connection unavailable");
  const cleared = disconnect(state, id);
  return updateConnection(cleared, id, (c) => ({
    ...c,
    lifecycle: "connecting",
    consent: "granted",
    authorization: "granted",
  }));
}

function withoutConnectionData(state: AccountState, id: ConnectionId): AccountState {
  return {
    ...state,
    sources: state.sources.flatMap((s) => {
      const remaining = s.association.connectionIds.filter((c) => c !== id);
      if (remaining.length === s.association.connectionIds.length) return [s];
      if (!remaining.length || s.association.kind === "unknown") return [];
      return [
        {
          ...s,
          association: { kind: "verified" as const, connectionIds: remaining },
          connectionGenerations: Object.fromEntries(
            remaining.map((link) => [link, s.connectionGenerations[link]]),
          ),
        },
      ];
    }),
    identities: state.identities.filter((i) => i.connectionId !== id),
  };
}

/** Invalidates late results immediately. Native process cleanup is separately mandatory. */
export function disconnect(state: AccountState, id: ConnectionId): AccountState {
  return updateConnection(withoutConnectionData(state, id), id, (c) => ({
    ...c,
    generation: c.generation + 1,
    lifecycle: "disconnected",
    consent: "not-requested",
    authorization: "not-requested",
    lastSuccessAtMs: null,
    diagnostic: null,
  }));
}

export function failConnection(
  state: AccountState,
  id: ConnectionId,
  generation: number,
  diagnostic: Diagnostic,
): AccountState {
  if (state.connections.find((c) => c.connectionId === id)?.generation !== generation) return state;
  const cleared = disconnect(state, id);
  return updateConnection(cleared, id, (c) => ({
    ...c,
    lifecycle: diagnostic === "authentication-expired" ? "auth-required" : "error",
    authorization: diagnostic === "authentication-expired" ? "expired" : "not-requested",
    diagnostic,
  }));
}

const finiteOrNull = (n: number | null) => n === null || (Number.isFinite(n) && n >= 0);
const decimalOrNull = (n: string | null) =>
  n === null || /^(0|[1-9][0-9]{0,29})(\.[0-9]{1,12})?$/.test(n);
function validCalendarDate(date: string): boolean {
  const timestamp = Date.parse(date);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === date
  );
}
function validSource(source: QuotaSource): boolean {
  const d = source.data;
  return (
    isLocalId(source.id, "source") &&
    (d.plan === undefined || ["Free", "Go", "Plus", "Pro"].includes(d.plan)) &&
    ((source.origin === "synthetic" && source.authority === "synthetic-fixture") ||
      (source.origin === "live" && source.authority === "authorized-provider-read")) &&
    finiteOrNull(source.fetchedAtMs) &&
    Number.isFinite(source.staleAfterMs) &&
    source.staleAfterMs > 0 &&
    ["current", "stale", "unknown", "unavailable", "error"].includes(source.freshness) &&
    (source.freshness !== "current" || source.fetchedAtMs !== null) &&
    new Set(d.subscription.map((w) => w.id)).size === d.subscription.length &&
    d.subscription.every(
      (w) =>
        isLocalId(w.id, "window") &&
        validateAlias(w.label) === w.label &&
        finiteOrNull(w.remainingPercent) &&
        (w.remainingPercent === null || w.remainingPercent <= 100) &&
        finiteOrNull(w.resetAtMs) &&
        finiteOrNull(w.durationMins),
    ) &&
    (d.apiMetering === null ||
      (finiteOrNull(d.apiMetering.value) && ["tokens", "requests"].includes(d.apiMetering.unit))) &&
    (d.spending === null ||
      (decimalOrNull(d.spending.used) &&
        decimalOrNull(d.spending.limit) &&
        (d.spending.currency === null || /^[A-Z]{3}$/.test(d.spending.currency)))) &&
    (d.credits === null ||
      (decimalOrNull(d.credits.balance) &&
        d.credits.unit === "provider-credits" &&
        (d.credits.unlimited === null || typeof d.credits.unlimited === "boolean"))) &&
    (d.entitlements === null ||
      d.entitlements.earnedResets === null ||
      (Number.isSafeInteger(d.entitlements.earnedResets) && d.entitlements.earnedResets >= 0)) &&
    (d.activity === null ||
      (new Set(d.activity.map((b) => b.date)).size === d.activity.length &&
        d.activity.every(
          (b) =>
            validCalendarDate(b.date) &&
            (b.tokens === null || (Number.isSafeInteger(b.tokens) && b.tokens >= 0)),
        )))
  );
}

/** Reject stale generation and all cross-provider/account/workspace reassignment. */
export function publishSource(
  state: AccountState,
  id: ConnectionId,
  generation: number,
  source: QuotaSource,
): AccountState {
  const c = state.connections.find((x) => x.connectionId === id);
  if (
    !c ||
    c.generation !== generation ||
    c.consent !== "granted" ||
    c.authorization !== "granted" ||
    !["connecting", "connected"].includes(c.lifecycle)
  )
    return state;
  const connection = state.metadata.connections.find((x) => x.id === id)!;
  const owner = state.metadata.accounts.find((x) => x.id === connection.accountId)!;
  if (
    state.removingAccountIds.includes(owner.id) ||
    source.providerId !== owner.providerId ||
    source.accountId !== owner.id ||
    source.workspaceId !== connection.workspaceId ||
    !source.association.connectionIds.includes(id) ||
    !source.association.connectionIds.length ||
    (source.association.kind !== "verified" && source.association.kind !== "unknown") ||
    (source.association.kind === "unknown" && source.association.connectionIds.length !== 1) ||
    new Set(source.association.connectionIds).size !== source.association.connectionIds.length ||
    Object.keys(source.connectionGenerations).sort().join(",") !==
      [...source.association.connectionIds].sort().join(",") ||
    !source.association.connectionIds.every((link) => {
      const m = state.metadata.connections.find((x) => x.id === link);
      const r = state.connections.find((x) => x.connectionId === link);
      return (
        m?.accountId === owner.id &&
        m.workspaceId === source.workspaceId &&
        r?.consent === "granted" &&
        r.authorization === "granted" &&
        ["connecting", "connected"].includes(r.lifecycle)
      );
    }) ||
    !validSource(source)
  )
    throw new Error("Invalid source ownership or data");
  // A result cannot restore an association from an earlier session of another key.
  if (
    source.association.connectionIds.some(
      (link) =>
        source.connectionGenerations[link] !==
        state.connections.find((r) => r.connectionId === link)?.generation,
    )
  )
    return state;
  const previous = state.sources.find((s) => s.id === source.id);
  // A local source ID is immutable ownership, including its demo/live origin.
  if (
    previous &&
    (previous.accountId !== source.accountId ||
      previous.providerId !== source.providerId ||
      previous.workspaceId !== source.workspaceId ||
      previous.origin !== source.origin ||
      previous.authority !== source.authority ||
      previous.association.kind !== source.association.kind ||
      previous.association.connectionIds.some(
        (link) => !source.association.connectionIds.includes(link),
      ))
  )
    throw new Error("Source identity collision");
  if (
    previous?.fetchedAtMs !== null &&
    previous?.fetchedAtMs !== undefined &&
    source.fetchedAtMs !== null &&
    source.fetchedAtMs < previous.fetchedAtMs
  )
    return state;
  return {
    ...updateConnection(state, id, (runtime) => ({
      ...runtime,
      lifecycle: "connected",
      lastSuccessAtMs: source.fetchedAtMs,
      diagnostic: null,
    })),
    sources: [...state.sources.filter((s) => s.id !== source.id), structuredClone(source)],
  };
}

export function setVerifiedIdentity(
  state: AccountState,
  identity: VerifiedIdentity,
  generation: number,
): AccountState {
  const c = state.metadata.connections.find((x) => x.id === identity.connectionId);
  const r = state.connections.find((x) => x.connectionId === identity.connectionId);
  if (!r || r.generation !== generation) return state;
  if (
    !c ||
    c.accountId !== identity.accountId ||
    r?.authorization !== "granted" ||
    r.consent !== "granted" ||
    state.removingAccountIds.includes(c.accountId) ||
    validateAlias(identity.label) !== identity.label
  )
    throw new Error("Unverified identity");
  return {
    ...state,
    identities: [
      ...state.identities.filter((i) => i.connectionId !== identity.connectionId),
      { ...identity },
    ],
  };
}

export interface RemovalPlan {
  state: AccountState;
  cleanup: { connectionId: ConnectionId; generation: number }[];
}
/** Phase 1 revokes consent and hides all values before asking a future native coordinator to stop sessions. */
export function prepareAccountRemoval(state: AccountState, accountId: AccountId): RemovalPlan {
  if (!state.metadata.accounts.some((a) => a.id === accountId)) throw new Error("Unknown account");
  const ids = state.metadata.connections.filter((c) => c.accountId === accountId).map((c) => c.id);
  let next = state;
  for (const id of ids) next = disconnect(next, id);
  next = { ...next, removingAccountIds: [...new Set([...next.removingAccountIds, accountId])] };
  return {
    state: next,
    cleanup: next.connections
      .filter((c) => ids.includes(c.connectionId))
      .map((c) => ({ connectionId: c.connectionId, generation: c.generation })),
  };
}

/** Acks must match the current revoked generation. This is a contract, not a trusted native receipt. */
export function finishAccountRemoval(
  state: AccountState,
  accountId: AccountId,
  stopped: { connectionId: ConnectionId; generation: number }[],
): AccountState {
  const ids = state.metadata.connections.filter((c) => c.accountId === accountId).map((c) => c.id);
  if (
    !state.removingAccountIds.includes(accountId) ||
    !ids.every((id) =>
      stopped.some(
        (s) =>
          s.connectionId === id &&
          s.generation === state.connections.find((c) => c.connectionId === id)?.generation,
      ),
    )
  )
    throw new Error("Native cleanup pending");
  return {
    metadata: {
      ...state.metadata,
      accounts: state.metadata.accounts.filter((a) => a.id !== accountId),
      workspaces: state.metadata.workspaces.filter((w) => w.accountId !== accountId),
      connections: state.metadata.connections.filter((c) => c.accountId !== accountId),
    },
    connections: state.connections.filter((c) => !ids.includes(c.connectionId)),
    sources: state.sources.filter((s) => s.accountId !== accountId),
    identities: state.identities.filter((i) => i.accountId !== accountId),
    removingAccountIds: state.removingAccountIds.filter((a) => a !== accountId),
  };
}

/** Remove a single already-stopped connection; never logs out or deletes another connection. */
export function removeConnection(
  state: AccountState,
  id: ConnectionId,
  stoppedGeneration: number,
): AccountState {
  const r = state.connections.find((c) => c.connectionId === id);
  if (
    !r ||
    r.lifecycle !== "disconnected" ||
    r.consent !== "not-requested" ||
    r.generation !== stoppedGeneration
  )
    throw new Error("Native cleanup pending");
  const cleared = withoutConnectionData(state, id);
  return {
    ...cleared,
    metadata: {
      ...cleared.metadata,
      connections: cleared.metadata.connections.filter((c) => c.id !== id),
    },
    connections: cleared.connections.filter((c) => c.connectionId !== id),
  };
}
