import type { AccountState, SourceId } from "./model";
import { contextualAlias } from "./presentation";
import { accountsView, resolveSelection, type Selection } from "./views";

export type DetailSelection = Exclude<Selection, { kind: "all" } | { kind: "provider" }>;
export type DetailTarget = { selection: DetailSelection; sourceId: SourceId };
export type ReturnTarget = { tab: "overview" | "accounts"; controlId: string; scrollTop: number };
export type AccountNavigation = {
  selection: Selection;
  notice: string;
  detail: DetailTarget | null;
  detailReturn: ReturnTarget | null;
  overviewReturn: ReturnTarget | null;
};

export const initialNavigation = (): AccountNavigation => ({
  selection: { kind: "all" },
  notice: "",
  detail: null,
  detailReturn: null,
  overviewReturn: null,
});

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
