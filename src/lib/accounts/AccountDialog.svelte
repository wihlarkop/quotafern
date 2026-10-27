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
      ? "Add local account"
      : target.kind === "add-connection"
        ? "Add local connection descriptor"
        : target.kind === "rename-account"
          ? "Rename account"
          : target.kind === "rename-connection"
            ? connection?.mechanism === "api-key"
              ? "Rename key label"
              : "Rename connection"
            : target.kind === "remove-account"
              ? "Remove local account"
              : target.kind === "remove-connection"
                ? "Remove local connection descriptor"
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
    if (!removing) {
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
    aliasIssue = !removing && aliasError(alias) !== null;
    workspaceIssue =
      target.kind === "add-connection" &&
      workspace === "new" &&
      aliasError(workspaceAlias) !== null;
    error = aliasIssue
      ? aliasError(alias)!
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
          alias,
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
          ? "Only the named local metadata is removed. No provider account, sign-in or credentials are changed."
          : "Local labels only; do not enter secrets. Adding or renaming a record does not authenticate, change a provider account or enable monitoring."}
    </p>
    {#if removing && target.kind !== "reset"}
      <p class="local-removal-name">{original}</p>
      {#if target.kind === "remove-account"}<p>
          Also removes {initialState.metadata.connections.filter((c) => c.accountId === target.id)
            .length} owned connection descriptors and {initialState.metadata.workspaces.filter(
            (w) => w.accountId === target.id,
          ).length} owned workspaces.
        </p>{/if}
    {:else if !removing}
      {#if target.kind === "add-account"}
        <label for="local-provider">Provider</label>
        <select id="local-provider" bind:value={providerId}
          >{#each PROVIDERS as provider}<option value={provider.id}
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
          <option value="system">Use existing Codex account</option>
          <option value="managed">Sign in to a separate account</option>
        </select>
        <p>Adding a label does not connect. You will confirm read-only monitoring separately.</p>
      {/if}
      <label for="local-alias"
        >{target.kind.includes("account") ? "Account alias" : "Connection label"}</label
      >
      <input
        id="local-alias"
        bind:this={input}
        bind:value={alias}
        onkeydown={(event) => {
          if (event.key === "Enter" && event.isComposing) event.preventDefault();
        }}
        aria-invalid={aliasIssue}
        aria-describedby={`local-alias-help${aliasIssue ? " local-save-error" : ""}`}
        autocomplete="off"
        spellcheck="false"
      />
      <p id="local-alias-help">
        {Array.from(alias.normalize("NFC").trim()).length} / 80 Unicode code points. Duplicate labels
        are allowed.
      </p>
      {#if target.kind === "add-connection"}
        <label for="local-mechanism">Provisional mechanism descriptor</label>
        <select id="local-mechanism" bind:value={mechanism}>
          <option value="cli-session">CLI session label</option><option value="api-key"
            >API key label</option
          ><option value="oauth-grant">OAuth grant label</option>
        </select>
        <p>
          Planning descriptors only. No key, token, grant, credential path or actual session is
          accepted. All provider connections remain unavailable.
        </p>
        <label for="local-workspace">Workspace context</label>
        <select id="local-workspace" bind:value={workspace}
          ><option value="">No workspace</option
          >{#each initialState.metadata.workspaces.filter((w) => w.accountId === account?.id) as item}<option
              value={item.id}>{item.alias}</option
            >{/each}<option value="new">New local workspace label</option></select
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
      ><Button type="submit" disabled={saving}
        >{target.kind === "reset"
          ? "Reset local metadata"
          : removing
            ? "Remove"
            : target.kind.startsWith("add")
              ? "Add"
              : "Save"}</Button
      >
    </div>
  </form>
</dialog>
