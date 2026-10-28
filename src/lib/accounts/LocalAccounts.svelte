<script lang="ts">
  import { tick, untrack } from "svelte";

  import { Button } from "../components/ui/button";
  import AccountDialog from "./AccountDialog.svelte";
  import AccountsPanel from "./AccountsPanel.svelte";
  import {
    CODEX_DIRECT_CONNECTION_AVAILABLE,
    type DirectController,
    type DirectPresentation,
    type DirectTarget,
  } from "./direct";
  import type { LocalAction, LocalStore, ManagementTarget } from "./local";
  import type { ConnectionId } from "./model";
  import type { AccountState } from "./model";
  import type { DetailTarget } from "./navigation";
  import type { Selection } from "./views";
  let {
    state: accountState,
    store,
    onstate,
    direct,
    presentations,
    nowMs,
    collapsedProviders = $bindable([]),
    onoverview,
    ondetails,
  }: {
    state: AccountState;
    store: LocalStore;
    direct: DirectController;
    presentations: Partial<Record<ConnectionId, DirectPresentation>>;
    nowMs: number;
    onstate: (state: AccountState) => void;
    collapsedProviders?: string[];
    onoverview: (selection: Selection, id: string) => void;
    ondetails: (target: DetailTarget, id: string) => void;
  } = $props();
  let target = $state<ManagementTarget | null>(null);
  let pendingConnection: DirectTarget | null = null;
  let opener = "local-add-account";
  let fallbacks: string[] = [];
  let notice = $state(untrack(() => (store.blocked ? store.notice : "")));
  let blocked = $state(untrack(() => store.blocked));
  function open(next: ManagementTarget | DirectTarget, id: string) {
    if (next.kind === "direct") {
      void direct.action(next.id, next.action);
      return;
    }
    opener = id;
    const connection =
      "id" in next ? accountState.metadata.connections.find((c) => c.id === next.id) : null;
    const owner = accountState.metadata.accounts.find(
      (a) =>
        a.id ===
        (connection?.accountId ??
          ("accountId" in next ? next.accountId : "id" in next ? next.id : "")),
    );
    const siblings = accountState.metadata.accounts.filter(
      (a) => a.providerId === owner?.providerId && a.id !== owner?.id,
    );
    const ownerIndex = accountState.metadata.accounts.findIndex((a) => a.id === owner?.id);
    const ordered = [
      ...siblings.filter((a) => accountState.metadata.accounts.indexOf(a) > ownerIndex),
      ...siblings.filter((a) => accountState.metadata.accounts.indexOf(a) < ownerIndex),
    ];
    fallbacks = [
      ...(connection && owner ? [`account-actions-${owner.id}`] : []),
      ...ordered.map((a) => `account-actions-${a.id}`),
      ...(owner ? [`provider-heading-${owner.providerId}`] : []),
      "local-accounts-title",
    ];
    target = next;
  }
  async function save(action: LocalAction): Promise<string | null> {
    if (action.kind === "remove-account" && !(await direct.beforeRemoval(action.id)))
      return "Could not confirm monitoring stopped. Try Disconnect before removing this account.";
    if (action.kind === "remove-connection") {
      const owner = accountState.metadata.connections.find((c) => c.id === action.id)?.accountId;
      if (!owner || !(await direct.beforeRemoval(owner, action.id)))
        return "Could not confirm monitoring stopped. Try Disconnect before removing this connection.";
    }
    if (action.kind === "reset" && !(await direct.disconnectAll()))
      return "Could not confirm monitoring stopped. Disconnect before resetting local metadata.";
    const result = store.apply(action);
    if (!result.ok) return result.error;
    const added =
      action.kind === "add-account"
        ? result.state.metadata.connections.find(
            (c) => !accountState.metadata.connections.some((previous) => previous.id === c.id),
          )
        : undefined;
    onstate(result.state);
    notice = action.kind.startsWith("remove")
      ? "Removed from Quotafern. Your provider sign-in is unchanged."
      : action.kind.startsWith("rename")
        ? "Name saved."
        : action.kind === "add-account"
          ? "Account added. Review monitoring permission to connect."
          : "Saved.";
    blocked = store.blocked;
    if (action.kind === "add-account") {
      collapsedProviders = collapsedProviders.filter((p) => p !== action.providerId);
      if (added && action.codexKind)
        pendingConnection = {
          kind: "direct",
          id: added.id,
          action: action.codexKind === "managed" ? "login" : "connect",
        };
    }
    return null;
  }
  async function done() {
    target = null;
    await tick();
    const candidates = [
      opener,
      ...(accountState.metadata.accounts.length ? fallbacks : ["local-accounts-title"]),
    ];
    candidates
      .map((id) => document.getElementById(id))
      .find(
        (element) =>
          element && !element.hasAttribute("disabled") && element.getClientRects().length,
      )
      ?.focus({ preventScroll: true });
    // Let the management dialog close and restore main focus before native consent opens.
    const next = pendingConnection;
    pendingConnection = null;
    if (next) void direct.action(next.id, next.action);
  }
</script>

<div class="view-heading">
  <div>
    <h1 id="local-accounts-title" tabindex="-1">Accounts</h1>
    <p>Manage your quota connections.</p>
  </div>
</div>
<Button
  id="local-add-account"
  disabled={blocked || !CODEX_DIRECT_CONNECTION_AVAILABLE}
  onclick={() => open({ kind: "add-account" }, "local-add-account")}>Add account</Button
>
<p
  class="account-screen-note local-storage-notice"
  class:sr-only={!blocked}
  role="status"
  aria-live="polite"
  aria-atomic="true"
>
  {notice}
</p>
{#if blocked && store.canReset}<Button
    variant="outline"
    id="local-reset"
    onclick={() => open({ kind: "reset" }, "local-reset")}>Reset local metadata…</Button
  >{/if}
<AccountsPanel
  state={accountState}
  {nowMs}
  synthetic={false}
  showHeading={false}
  bind:collapsedProviders
  {onoverview}
  {ondetails}
  onmanage={blocked ? undefined : open}
  {presentations}
/>
{#if target}<AccountDialog
    {target}
    state={accountState}
    onsave={save}
    ondone={() => void done()}
  />{/if}
