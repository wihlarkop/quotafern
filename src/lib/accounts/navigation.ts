import type { AccountId, AccountState, SourceId } from "./model";
import { contextualAlias } from "./presentation";
import { accountsView, detailsView, resolveSelection, type Selection } from "./views";

export type DetailSelection = Exclude<Selection, { kind: "all" } | { kind: "provider" }>;
export type DetailTarget = { selection: DetailSelection; sourceId: SourceId };
export type ReturnTarget = { tab: "overview" | "accounts"; controlId: string; scrollTop: number };
export type FocusedQuotaTarget = {
  selection: { kind: "account"; providerId: string; accountId: AccountId };
  alias: string;
  sourceId: SourceId | null;
  returnTo: ReturnTarget;
};
export type AccountNavigation = {
  selection: Selection;
  notice: string;
  detail: DetailTarget | null;
  detailReturn: ReturnTarget | null;
  overviewReturn: ReturnTarget | null;
  focusedQuota: FocusedQuotaTarget | null;
};

export const initialNavigation = (): AccountNavigation => ({
  selection: { kind: "all" },
  notice: "",
  detail: null,
  detailReturn: null,
  overviewReturn: null,
  focusedQuota: null,
});

/** Focused routes never use Overview's invalid-selection fallback to All. */
export function focusedQuotaView(
  state: AccountState,
  target: FocusedQuotaTarget,
  nowMs: number,
  origin: "live" | "synthetic",
) {
  const account =
    state.metadata.accounts.find(
      (a) => a.id === target.selection.accountId && a.providerId === target.selection.providerId,
    ) ?? null;
  const detail = detailsView(state, target.selection, nowMs, origin);
  const sources = (detail?.sources ?? []).filter(
    (source) =>
      source.association.connectionIds.length > 0 &&
      source.association.connectionIds.every(
        (id) =>
          state.metadata.connections.some(
            (c) => c.id === id && c.accountId === target.selection.accountId,
          ) &&
          state.connections.some(
            (c) => c.connectionId === id && c.generation === source.connectionGenerations[id],
          ),
      ) &&
      source.association.connectionIds.some((id) =>
        state.connections.some((c) => c.connectionId === id && c.lifecycle === "connected"),
      ),
  );
  const source = target.sourceId ? (sources.find((s) => s.id === target.sourceId) ?? null) : null;
  const kind: "source" | "choose" | "empty" | "unavailable" =
    !account || !detail
      ? "unavailable"
      : target.sourceId
        ? source
          ? "source"
          : "unavailable"
        : sources.length
          ? "choose"
          : "empty";
  return { account, detail, sources, source, kind };
}

export function openFocusedQuota(
  state: AccountState,
  selection: FocusedQuotaTarget["selection"],
  returnTo: ReturnTarget,
  nowMs: number,
  origin: "live" | "synthetic",
): FocusedQuotaTarget {
  const target: FocusedQuotaTarget = {
    selection,
    alias:
      state.metadata.accounts.find(
        (a) => a.id === selection.accountId && a.providerId === selection.providerId,
      )?.alias ?? "Unavailable account",
    sourceId: null,
    returnTo,
  };
  const view = focusedQuotaView(state, target, nowMs, origin);
  return view.sources.length === 1 ? { ...target, sourceId: view.sources[0].id } : target;
}

export function chooseFocusedQuota(
  state: AccountState,
  target: FocusedQuotaTarget,
  id: SourceId,
  nowMs: number,
  origin: "live" | "synthetic",
): FocusedQuotaTarget {
  if (target.sourceId !== null) return target;
  return focusedQuotaView(state, target, nowMs, origin).sources.some((s) => s.id === id)
    ? { ...target, sourceId: id }
    : target;
}

/** Details owns the visible context; selection remains the separate Overview return filter. */
export function selectorSelection(state: AccountState, navigation: AccountNavigation): Selection {
  return navigation.detail?.selection ?? resolveSelection(state, navigation.selection);
}

export function selectionKey(selection: Selection): string {
  switch (selection.kind) {
    case "all":
      return "all";
    case "provider":
      return `provider:${selection.providerId}`;
    case "account":
      return selection.workspaceId ?? selection.accountId;
    case "connection":
      return selection.connectionId;
  }
}

/** Full owning lists determine ordinals even when Details narrows to a single connection. */
export function contextOptions(state: AccountState) {
  return [
    { key: "all", label: "All accounts", selection: { kind: "all" } as Selection },
    ...accountsView(state)
      .filter((p) => p.accounts.length > 0)
      .flatMap((p) => [
        {
          key: `provider:${p.providerId}`,
          label: `${p.displayName} · all accounts`,
          selection: { kind: "provider", providerId: p.providerId } as Selection,
        },
        ...p.accounts.flatMap((a, i) => {
          const parent = `${p.displayName} · ${contextualAlias(p.accounts, i, "account")}`;
          return [
            {
              key: a.accountId,
              label: parent,
              selection: {
                kind: "account",
                providerId: p.providerId,
                accountId: a.accountId,
              } as Selection,
            },
            ...a.workspaces.map((w) => ({
              key: w.workspaceId,
              label: `${parent} / ${w.alias} workspace`,
              selection: {
                kind: "account",
                providerId: p.providerId,
                accountId: a.accountId,
                workspaceId: w.workspaceId,
              } as Selection,
            })),
            ...a.connections.map((c, j) => ({
              key: c.connectionId,
              label: `${parent}${c.workspaceId ? ` / ${a.workspaces.find((w) => w.workspaceId === c.workspaceId)?.alias} workspace` : ""} / ${contextualAlias(a.connections, j, "connection")}`,
              selection: {
                kind: "connection",
                providerId: p.providerId,
                accountId: a.accountId,
                connectionId: c.connectionId,
              } as Selection,
            })),
          ];
        }),
      ]),
  ];
}

export function contextLabel(state: AccountState, selection: Selection): string {
  return (
    contextOptions(state).find((o) => o.key === selectionKey(selection))?.label ??
    "Unavailable context"
  );
}

/** Only display labels are disambiguated. Routing and ownership always use opaque IDs. */
function uniqueLabels(
  items: readonly { alias: string }[],
  kind: "account" | "connection" | "workspace",
) {
  let labels = items.map((item, index) =>
    kind === "account" && item.alias === "All accounts"
      ? `${item.alias} · account ${index + 1}`
      : item.alias,
  );
  while (new Set(labels).size !== labels.length) {
    const previous = labels;
    labels = previous.map((label, index) =>
      previous.filter((other) => other === label).length > 1
        ? `${label} · ${kind} ${index + 1}`
        : label,
    );
  }
  return labels;
}

type SelectorOption = { key: string; label: string; selection: Selection };
type SelectorGroup = { key: string; label: string; options: SelectorOption[] };

export function contextSelectorGroups(state: AccountState): {
  primary: SelectorGroup[];
  advanced: SelectorGroup[];
} {
  const providers = accountsView(state).filter((p) => p.accounts.length > 0);
  const primary = providers.map((p) => {
    const labels = uniqueLabels(p.accounts, "account");
    return {
      key: p.providerId,
      label: p.displayName,
      options: p.accounts.map((a, i) => ({
        key: a.accountId,
        label: labels[i],
        selection: {
          kind: "account",
          providerId: p.providerId,
          accountId: a.accountId,
        } as Selection,
      })),
    };
  });
  const advanced: SelectorGroup[] = [
    {
      key: "providers",
      label: "Providers",
      options: providers.map((p) => ({
        key: `provider:${p.providerId}`,
        label: `${p.displayName} accounts`,
        selection: { kind: "provider", providerId: p.providerId },
      })),
    },
  ];
  for (const provider of providers) {
    const accounts = uniqueLabels(provider.accounts, "account");
    provider.accounts.forEach((account, i) => {
      const workspaces = uniqueLabels(account.workspaces, "workspace");
      const connections = uniqueLabels(account.connections, "connection");
      // Include the context kind so a workspace and a connection with the same name stay distinct.
      advanced.push({
        key: account.accountId,
        label: `${provider.displayName} · ${accounts[i]}`,
        options: [
          {
            key: account.accountId,
            label: "All connections",
            selection: {
              kind: "account",
              providerId: provider.providerId,
              accountId: account.accountId,
            },
          },
          ...account.workspaces.map((w, j) => ({
            key: w.workspaceId,
            label: `Workspace · ${workspaces[j]}`,
            selection: {
              kind: "account" as const,
              providerId: provider.providerId,
              accountId: account.accountId,
              workspaceId: w.workspaceId,
            },
          })),
          ...account.connections.map((c, j) => ({
            key: c.connectionId,
            label: `Connection · ${connections[j]}`,
            selection: {
              kind: "connection" as const,
              providerId: provider.providerId,
              accountId: account.accountId,
              connectionId: c.connectionId,
            },
          })),
        ],
      });
    });
  }
  return { primary, advanced };
}

export function primaryContextKey(selection: Selection): string {
  return selection.kind === "account" || selection.kind === "connection"
    ? selection.accountId
    : selectionKey(selection);
}

export function selectionInvalid(state: AccountState, selection: Selection): boolean {
  return selection.kind !== "all" && resolveSelection(state, selection).kind === "all";
}

/** Repair only Overview: a retained Details target must continue to fail closed. */
export function reconcileNavigation(
  state: AccountState,
  navigation: AccountNavigation,
): AccountNavigation {
  return selectionInvalid(state, navigation.selection)
    ? {
        ...navigation,
        selection: { kind: "all" },
        notice: "Selection removed; showing All accounts.",
      }
    : navigation;
}
