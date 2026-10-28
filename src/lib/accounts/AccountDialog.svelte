<script lang="ts">
  import { onMount, untrack } from "svelte";

  import { Button } from "../components/ui/button";
  import { CODEX_DIRECT_CONNECTION_AVAILABLE, type DirectKind } from "./direct";
  import { aliasError, type LocalAction, type ManagementTarget } from "./local";
  import { PROVIDERS, type AccountState, type Mechanism, type WorkspaceId } from "./model";
  import { contextLabel } from "./navigation";

  let {
    target: requestedTarget,
    state: accountState,
    onsave,
    ondone,
  }: {
    target: ManagementTarget;
    state: AccountState;
    onsave: (action: LocalAction) => Promise<string | null>;
    ondone: () => void;
  } = $props();
  const target = untrack(() => requestedTarget);
  const initialState = untrack(() => accountState);
  const connection =
    "id" in target ? initialState.metadata.connections.find((c) => c.id === target.id) : undefined;
  const account = initialState.metadata.accounts.find(
    (a) =>
      a.id ===
      ("accountId" in target
        ? target.accountId
        : (connection?.accountId ?? ("id" in target ? target.id : ""))),
  );
  const original =
    target.kind === "rename-connection" || target.kind === "remove-connection"
      ? (connection?.alias ?? "")
      : (account?.alias ?? "");
  let alias = $state(original);
  const addingAccount = target.kind === "add-account";
  const defaultName = () => (codexKind === "managed" ? "Another Codex account" : "Existing Codex");
  let providerId = $state(
    target.kind === "add-account"
      ? (target.providerId ?? "codex")
      : (account?.providerId ?? "codex"),
  );
  let mechanism = $state<Mechanism>(
    account?.providerId === "openrouter" ? "api-key" : "cli-session",
  );
  let codexKind = $state<DirectKind>("system");
  let saving = $state(false);
  let workspace = $state("");
  let workspaceAlias = $state("");
  let error = $state("");
  let aliasIssue = $state(false);
  let workspaceIssue = $state(false);
  let dialog: HTMLDialogElement;
  let input = $state<HTMLInputElement>();
  const removing = target.kind.startsWith("remove") || target.kind === "reset";
  const title =
    target.kind === "add-account"
      ? "Add account"
      : target.kind === "add-connection"
        ? "Add connection label"
        : target.kind === "rename-account"
          ? "Rename account"
          : target.kind === "rename-connection"
            ? connection?.mechanism === "api-key"
              ? "Rename key label"
              : "Rename connection"
            : target.kind === "remove-account"
              ? "Remove account"
              : target.kind === "remove-connection"
                ? "Remove connection"
                : "Reset local metadata";
  const ownerLabel = account
    ? contextLabel(initialState, {
        kind: "account",
        providerId: account.providerId,
        accountId: account.id,
      })
    : "";
  onMount(() => {
    dialog.showModal();
    if (addingAccount) {
      document.getElementById("local-provider")?.focus();
    } else if (!removing) {
      input?.focus();
      input?.select();
    }
  });
  function modalKeys(event: KeyboardEvent) {
    if (event.key !== "Tab") return;
    const controls = [...dialog.querySelectorAll<HTMLElement>("input, select, button")].filter(
      (element) => !element.hasAttribute("disabled") && element.getClientRects().length > 0,
    );
    const edge = event.shiftKey ? controls[0] : controls.at(-1);
    if (document.activeElement === edge) {
      event.preventDefault();
      (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
    }
  }
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (saving) return;
    const savedAlias = addingAccount && !alias.trim() ? defaultName() : alias;
    aliasIssue = !removing && aliasError(savedAlias) !== null;
    workspaceIssue =
      target.kind === "add-connection" &&
      workspace === "new" &&
      aliasError(workspaceAlias) !== null;
    error = aliasIssue
      ? aliasError(savedAlias)!
      : workspaceIssue
        ? `Workspace: ${aliasError(workspaceAlias)}`
        : "";
    if (error) {
      (workspaceIssue ? document.getElementById("local-workspace-alias") : input)?.focus();
      return;
    }
    let action: LocalAction;
    switch (target.kind) {
      case "add-account":
        action = {
          kind: target.kind,
          providerId,
          alias: savedAlias,
          ...(CODEX_DIRECT_CONNECTION_AVAILABLE && providerId === "codex" ? { codexKind } : {}),
        };
        break;
      case "add-connection":
        action = {
          kind: target.kind,
          accountId: target.accountId,
          alias,
          mechanism,
          workspaceId: workspace && workspace !== "new" ? (workspace as WorkspaceId) : null,
          ...(workspace === "new" ? { workspaceAlias } : {}),
        };
        break;
      case "rename-account":
      case "rename-connection":
        action = { ...target, alias };
        break;
      default:
        action = target;
    }
    saving = true;
    const failure = await onsave(action);
    saving = false;
    if (failure) {
      error = failure;
      return;
    }
    dialog.close();
  }
</script>

<dialog
  bind:this={dialog}
  class="local-dialog"
  aria-labelledby="local-dialog-title"
  aria-describedby="local-dialog-description"
  onclose={ondone}
  onkeydown={modalKeys}
  oncancel={(event) => {
    event.preventDefault();
    if (!saving) dialog.close();
  }}
>
  <form onsubmit={save}>
    <h2 id="local-dialog-title">{title}</h2>
    {#if ownerLabel}<p class="local-owner-context">{ownerLabel}</p>{/if}
    <p id="local-dialog-description">
      {target.kind === "reset"
        ? "This replaces all saved local account, workspace and connection labels, including unreadable metadata. This cannot be undone. No provider account or appearance preference is changed."
        : removing
          ? "Monitoring must stop before removal. Your provider account and sign-in will be kept."
          : addingAccount
            ? "Choose how to connect. You’ll review monitoring permission before quota is read."
            : "Choose a name you recognize. Do not enter passwords or other secrets."}
    </p>
    {#if removing && target.kind !== "reset"}
      <p class="local-removal-name">{original}</p>
      {#if target.kind === "remove-account"}<p>
          Also removes {initialState.metadata.connections.filter((c) => c.accountId === target.id)
            .length} connections and {initialState.metadata.workspaces.filter(
            (w) => w.accountId === target.id,
          ).length} workspace labels from Quotafern.
        </p>{/if}
    {:else if !removing}
      {#if target.kind === "add-account"}
        <label for="local-provider">Provider</label>
        <select id="local-provider" bind:value={providerId}
          >{#each PROVIDERS as provider}<option
              value={provider.id}
              disabled={provider.id !== "codex" || !CODEX_DIRECT_CONNECTION_AVAILABLE}
              >{provider.displayName} · {provider.id === "codex" &&
              CODEX_DIRECT_CONNECTION_AVAILABLE
                ? "Available"
                : provider.adapter === "gated"
                  ? "Live disabled"
                  : "Coming Soon"}</option
            >{/each}</select
        >
      {/if}
      {#if target.kind === "add-account" && providerId === "codex" && CODEX_DIRECT_CONNECTION_AVAILABLE}
        <label for="codex-account-kind">Codex account</label>
        <select id="codex-account-kind" bind:value={codexKind}>
          <option value="system">Use existing Codex login</option>
          <option value="managed">Sign in with another account</option>
        </select>
        <p>
          {codexKind === "managed"
            ? "Codex will open browser sign-in after you approve monitoring. Your existing Codex login stays unchanged."
            : "Use the account already signed in to Codex on this computer."}
        </p>
      {/if}
      <label for="local-alias"
        >{target.kind.includes("account")
          ? addingAccount
            ? "Account name (optional)"
            : "Account name"
          : "Connection name"}</label
      >
      <input
        id="local-alias"
        bind:this={input}
        bind:value={alias}
        placeholder={addingAccount ? defaultName() : undefined}
        onkeydown={(event) => {
          if (event.key === "Enter" && event.isComposing) event.preventDefault();
        }}
        aria-invalid={aliasIssue}
        aria-describedby={`local-alias-help${aliasIssue ? " local-save-error" : ""}`}
        autocomplete="off"
        spellcheck="false"
      />
      <p id="local-alias-help">
        {addingAccount
          ? "Leave blank to use the suggested name."
          : "Only the name in Quotafern changes."} Up to 80 characters.
      </p>
      {#if target.kind === "add-connection"}
        <label for="local-mechanism">Connection type</label>
        <select id="local-mechanism" bind:value={mechanism}>
          <option value="cli-session">Existing Codex login label</option><option value="api-key"
            >API key label (Coming Soon)</option
          ><option value="oauth-grant">OAuth label (Coming Soon)</option>
        </select>
        <p>
          This only adds a connection label. It does not sign in or allow monitoring. Do not enter
          credentials.
        </p>
        <label for="local-workspace">Workspace context</label>
        <select id="local-workspace" bind:value={workspace}
          ><option value="">No workspace</option
          >{#each initialState.metadata.workspaces.filter((w) => w.accountId === account?.id) as item}<option
              value={item.id}>{item.alias}</option
            >{/each}<option value="new">New workspace label</option></select
        >
        {#if workspace === "new"}<label for="local-workspace-alias">Workspace alias</label><input
            id="local-workspace-alias"
            bind:value={workspaceAlias}
            onkeydown={(event) => {
              if (event.key === "Enter" && event.isComposing) event.preventDefault();
            }}
            aria-invalid={workspaceIssue}
            aria-describedby={workspaceIssue ? "local-save-error" : undefined}
            autocomplete="off"
          />
          <p>Optional local grouping only; provider workspace support is unverified.</p>{/if}
      {/if}
    {/if}
    <p
      id="local-save-error"
      class="local-error"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {error}
    </p>
    <div class="local-dialog-actions">
      <Button type="button" variant="outline" disabled={saving} onclick={() => dialog.close()}
        >Cancel</Button
      ><Button
        type="submit"
        disabled={saving ||
          (addingAccount && (providerId !== "codex" || !CODEX_DIRECT_CONNECTION_AVAILABLE))}
        >{target.kind === "reset"
          ? "Reset local metadata"
          : removing
            ? "Remove"
            : addingAccount
              ? "Continue"
              : target.kind.startsWith("add")
                ? "Add"
                : "Save"}</Button
      >
    </div>
  </form>
</dialog>
