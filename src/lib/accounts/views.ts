import {
  PROVIDERS,
  type AccountId,
  type AccountState,
  type ConnectionId,
  type Provider,
  type QuotaSource,
  type WorkspaceId,
} from "./model";

export type Selection =
  | { kind: "all" }
  | { kind: "provider"; providerId: string }
  | { kind: "account"; providerId: string; accountId: AccountId; workspaceId?: WorkspaceId }
  | { kind: "connection"; providerId: string; accountId: AccountId; connectionId: ConnectionId };

// Never reduce several connection identities into one account identity by comparing text.
function contextIdentity(state: AccountState, ids: ConnectionId[]): string | null {
  return ids.length === 1
    ? (state.identities.find((i) => i.connectionId === ids[0])?.label ?? null)
    : null;
}

/** Invalid/stale selections return to All; they never select an unrelated account by position/name. */
export function resolveSelection(
  state: AccountState,
  selection: Selection,
  catalog: readonly Provider[] = PROVIDERS,
): Selection {
  if (selection.kind === "all") return selection;
  if (
    !catalog.some((p) => p.id === selection.providerId) &&
    !state.metadata.accounts.some((a) => a.providerId === selection.providerId)
  )
    return { kind: "all" };
  if (selection.kind === "provider") return selection;
  const account = state.metadata.accounts.find(
    (a) => a.id === selection.accountId && a.providerId === selection.providerId,
  );
  if (!account) return { kind: "all" };
  if (selection.kind === "account") {
    if (
      selection.workspaceId &&
      !state.metadata.workspaces.some(
        (w) => w.id === selection.workspaceId && w.accountId === account.id,
      )
    )
      return { kind: "all" };
    return selection;
  }
  return state.metadata.connections.some(
    (c) => c.id === selection.connectionId && c.accountId === account.id,
  )
    ? selection
    : { kind: "all" };
}

export function accountsView(state: AccountState, catalog: readonly Provider[] = PROVIDERS) {
  const providerIds = [
    ...new Set([...catalog.map((p) => p.id), ...state.metadata.accounts.map((a) => a.providerId)]),
  ];
  return providerIds.map((id) => {
    const provider = catalog.find((p) => p.id === id);
    return {
      providerId: id,
      displayName: provider?.displayName ?? id,
      availability: provider?.adapter ?? "coming-soon",
      // These are future UX affordances, not current native permissions.
      actions: { addAccount: false, addConnection: false },
      accounts: state.metadata.accounts
        .filter((a) => a.providerId === id)
        .map((a) => ({
          accountId: a.id,
          alias: a.alias,
          state: state.removingAccountIds.includes(a.id)
            ? ("removing" as const)
            : ("configured" as const),
          verifiedIdentity: contextIdentity(
            state,
            state.metadata.connections.filter((c) => c.accountId === a.id).map((c) => c.id),
          ),
          actions: {
            rename: !state.removingAccountIds.includes(a.id),
            remove: !state.removingAccountIds.includes(a.id),
          },
          workspaces: state.metadata.workspaces
            .filter((w) => w.accountId === a.id)
            .map((w) => ({ workspaceId: w.id, alias: w.alias })),
          connections: state.metadata.connections
            .filter((c) => c.accountId === a.id)
            .map((c) => ({
              connectionId: c.id,
              accountId: a.id,
              workspaceId: c.workspaceId,
              alias: c.alias,
              verifiedIdentity: contextIdentity(state, [c.id]),
              mechanism: c.mechanism,
              runtime: { ...state.connections.find((r) => r.connectionId === c.id)! },
              actions: {
                rename: !state.removingAccountIds.includes(a.id),
                disconnect:
                  !state.removingAccountIds.includes(a.id) &&
                  state.connections.some(
                    (r) => r.connectionId === c.id && r.lifecycle !== "disconnected",
                  ),
                remove: !state.removingAccountIds.includes(a.id),
              },
            })),
        })),
    };
  });
}

export function sourceAt(source: QuotaSource, nowMs: number): QuotaSource {
  const copy = structuredClone(source);
  if (
    copy.freshness === "current" &&
    (copy.fetchedAtMs === null ||
      !Number.isFinite(nowMs) ||
      copy.fetchedAtMs > nowMs ||
      nowMs - copy.fetchedAtMs >= copy.staleAfterMs)
  )
    copy.freshness = "stale";
  return copy;
}

function selectedSources(
  state: AccountState,
  selection: Selection,
  nowMs: number,
  origin: "live" | "synthetic",
) {
  return state.sources
    .filter((s) => {
      if (s.origin !== origin || state.removingAccountIds.includes(s.accountId)) return false;
      if (selection.kind === "all") return true;
      if (s.providerId !== selection.providerId) return false;
      if (selection.kind === "provider") return true;
      if (s.accountId !== selection.accountId) return false;
      if (selection.kind === "account")
        return !selection.workspaceId || s.workspaceId === selection.workspaceId;
      return s.association.connectionIds.includes(selection.connectionId);
    })
    .map((s) => sourceAt(s, nowMs));
}

export function overviewView(
  state: AccountState,
  requested: Selection,
  nowMs: number,
  origin: "live" | "synthetic" = "live",
) {
  const selection = resolveSelection(state, requested);
  const sources = selectedSources(state, selection, nowMs, origin);
  return {
    selection,
    origin,
    label: origin === "synthetic" ? "Synthetic demo" : "Monitoring",
    // One row per authoritative local source. Connections never become summed copies.
    sources,
    billingRelationship: sources.some((s) => s.association.kind === "unknown")
      ? ("unknown" as const)
      : ("verified-sources" as const),
    totals: null,
    totalsReason:
      "Measures remain per source; unknown relationships, percentages, currencies and credits are never added.",
    empty: sources.length === 0,
  };
}

/** Unlike Overview's invalid-filter fallback, Details fail closed on any ownership mismatch. */
export function detailsView(
  state: AccountState,
  selection: Exclude<Selection, { kind: "all" } | { kind: "provider" }>,
  nowMs: number,
  origin: "live" | "synthetic" = "live",
) {
  if (
    resolveSelection(state, selection).kind === "all" ||
    state.removingAccountIds.includes(selection.accountId)
  )
    return null;
  const account = state.metadata.accounts.find((a) => a.id === selection.accountId)!;
  return {
    providerId: selection.providerId,
    accountId: account.id,
    alias: account.alias,
    origin,
    label: origin === "synthetic" ? "Synthetic demo" : "Monitoring",
    verifiedIdentity: contextIdentity(
      state,
      state.metadata.connections
        .filter(
          (c) =>
            c.accountId === account.id &&
            (selection.kind !== "connection" || c.id === selection.connectionId) &&
            (selection.kind !== "account" ||
              !selection.workspaceId ||
              c.workspaceId === selection.workspaceId),
        )
        .map((c) => c.id),
    ),
    connectionId: selection.kind === "connection" ? selection.connectionId : null,
    connections: state.metadata.connections
      .filter(
        (c) =>
          c.accountId === account.id &&
          (selection.kind !== "connection" || c.id === selection.connectionId) &&
          (selection.kind !== "account" ||
            !selection.workspaceId ||
            c.workspaceId === selection.workspaceId),
      )
      .map((c) => ({
        connectionId: c.id,
        alias: c.alias,
        verifiedIdentity: contextIdentity(state, [c.id]),
        runtime: { ...state.connections.find((r) => r.connectionId === c.id)! },
      })),
    sources: selectedSources(state, selection, nowMs, origin),
  };
}
