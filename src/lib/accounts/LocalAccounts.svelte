<script lang="ts">
  import { tick, untrack } from "svelte";

  import { Button } from "../components/ui/button";
  import AccountDialog from "./AccountDialog.svelte";
  import AccountsPanel from "./AccountsPanel.svelte";
  import type { LocalAction, LocalStore, ManagementTarget } from "./local";
  import type { AccountState } from "./model";
  import type { DetailTarget } from "./navigation";
  import type { Selection } from "./views";
  let {
    state: accountState,
    store,
    onstate,
    collapsedProviders = $bindable([]),
    onoverview,
    ondetails,
  }: {
    state: AccountState;
    store: LocalStore;
    onstate: (state: AccountState) => void;
    collapsedProviders?: string[];
    onoverview: (selection: Selection, id: string) => void;
    ondetails: (target: DetailTarget, id: string) => void;
  } = $props();
  let target = $state<ManagementTarget | null>(null);
  let opener = "local-add-account";
  let fallbacks: string[] = [];
  let notice = $state(untrack(() => store.notice));
  let blocked = $state(untrack(() => store.blocked));
  function open(next: ManagementTarget, id: string) {
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
  function save(action: LocalAction): string | null {
    const result = store.apply(action);
    if (!result.ok) return result.error;
    onstate(result.state);
    notice = result.notice;
    blocked = store.blocked;
    if (action.kind === "add-account")
      collapsedProviders = collapsedProviders.filter((p) => p !== action.providerId);
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
  }
</script>

<div class="view-heading">
  <div>
    <h1 id="local-accounts-title" tabindex="-1">Accounts</h1>
    <p>Local accounts · no provider is signed in</p>
  </div>
</div>
<Button
  id="local-add-account"
  variant="outline"
  disabled={blocked}
  onclick={() => open({ kind: "add-account" }, "local-add-account")}>Add local account</Button
>
<p
  class="account-screen-note local-storage-notice"
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
  nowMs={Date.now()}
  synthetic={false}
  showHeading={false}
  bind:collapsedProviders
  {onoverview}
  {ondetails}
  onmanage={blocked ? undefined : open}
/>
{#if target}<AccountDialog
    {target}
    state={accountState}
    onsave={save}
    ondone={() => void done()}
  />{/if}
