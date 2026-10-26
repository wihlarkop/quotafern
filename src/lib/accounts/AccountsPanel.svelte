<script lang="ts">
  import ArrowUpRight from "@lucide/svelte/icons/arrow-up-right";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Command from "@lucide/svelte/icons/command";
  import Layers from "@lucide/svelte/icons/layers";

  import { Button } from "../components/ui/button";
  import AccountActions from "./AccountActions.svelte";
  import {
    CODEX_DIRECT_CONNECTION_AVAILABLE,
    directKind,
    type DirectPresentation,
    type DirectTarget,
  } from "./direct";
  import { localRemovalAllowed, type ManagementTarget } from "./local";
  import type { ConnectionId } from "./model";
  import type { AccountState } from "./model";
  import type { DetailTarget } from "./navigation";
  import { contextualAlias, sampleTime } from "./presentation";
  import type { Selection } from "./views";
  import { accountsView, overviewView } from "./views";

  let {
    state,
    nowMs,
    synthetic = true,
    showHeading = true,
    collapsedProviders = $bindable([]),
    onoverview,
    ondetails,
    onmanage,
    presentations = {},
  }: {
    state: AccountState;
    nowMs: number;
    synthetic?: boolean;
    showHeading?: boolean;
    collapsedProviders?: string[];
    onoverview?: (selection: Selection, controlId: string) => void;
    ondetails?: (target: DetailTarget, controlId: string) => void;
    onmanage?: (target: ManagementTarget | DirectTarget, opener: string) => void;
    presentations?: Partial<Record<ConnectionId, DirectPresentation>>;
  } = $props();
  let providers = $derived(
    accountsView(state).sort(
      (a, b) => Number(b.accounts.length > 0) - Number(a.accounts.length > 0),
    ),
  );
  let sources = $derived(
    overviewView(state, { kind: "all" }, nowMs, synthetic ? "synthetic" : "live").sources,
  );
</script>

{#if showHeading}<div class="view-heading">
    <div>
      <h1 tabindex="-1">Accounts</h1>
      <p>
        {synthetic
          ? "Local names, independent connections"
          : state.metadata.accounts.length
            ? "Local accounts and connections"
            : "No accounts configured"}
      </p>
    </div>
  </div>{/if}
{#if synthetic}
  <div class="account-demo-notice" role="note">
    <strong>SYNTHETIC DEMO</strong><span
      >Illustrative accounts and connections. Nothing is signed in.</span
    >
  </div>
{:else}
  <p class="account-screen-note">
    {CODEX_DIRECT_CONNECTION_AVAILABLE
      ? "Connect Codex accounts individually. Monitoring needs your confirmation; other providers are Coming Soon."
      : "Local metadata only. Live Codex remains disabled until native acceptance is complete; other providers are Coming Soon."}
  </p>
{/if}
<div class="account-provider-list">
  {#if synthetic && state.metadata.accounts.length === 0}<section class="owned-empty">
      <h2>No accounts configured</h2>
      <p>This synthetic fixture has no accounts or connections.</p>
    </section>{/if}
  {#each providers as provider (provider.providerId)}
    <section class="account-provider" aria-label={`${provider.displayName} accounts`}>
      <div class="account-provider-heading">
        <span class="provider-icon" aria-hidden="true"
          >{#if provider.providerId === "codex"}<Command size={16} />{:else}<Layers
              size={16}
            />{/if}</span
        >
        <h2 id={`provider-heading-${provider.providerId}`} tabindex="-1">
          {#if provider.accounts.length > 0}<button
              type="button"
              class="provider-disclosure"
              aria-expanded={!collapsedProviders.includes(provider.providerId)}
              aria-controls={`provider-accounts-${provider.providerId}`}
              aria-label={`${provider.displayName} · ${provider.accounts.length} accounts`}
              onclick={() => {
                collapsedProviders = collapsedProviders.includes(provider.providerId)
                  ? collapsedProviders.filter((id) => id !== provider.providerId)
                  : [...collapsedProviders, provider.providerId];
              }}
            >
              {provider.displayName}<ChevronDown size={14} aria-hidden="true" />
            </button>{:else}{provider.displayName}{/if}
        </h2>
        <span class="system-chip"
          >{provider.providerId === "codex" && CODEX_DIRECT_CONNECTION_AVAILABLE
            ? "Available"
            : provider.availability === "gated"
              ? "Live disabled"
              : "Coming Soon"}</span
        >
      </div>
      {#if provider.accounts.length === 0}
        <p class="account-catalog-note">
          {provider.availability === "gated"
            ? "No account configured. Connection unavailable in this build."
            : "Supported read-only monitoring is not implemented."}
        </p>
      {:else}
        <ul
          class="owned-account-list"
          id={`provider-accounts-${provider.providerId}`}
          hidden={collapsedProviders.includes(provider.providerId)}
        >
          {#each provider.accounts as account, accountIndex (account.accountId)}
            <li class="owned-account" data-account-id={account.accountId}>
              <div class="owned-account-heading">
                <h3>
                  {#if onoverview}<button
                      type="button"
                      class="account-navigation-link"
                      id={`account-overview-${account.accountId}`}
                      aria-label={`Open ${provider.displayName} ${contextualAlias(provider.accounts, accountIndex, "account")} overview`}
                      onclick={() =>
                        onoverview?.(
                          {
                            kind: "account",
                            providerId: provider.providerId,
                            accountId: account.accountId,
                          },
                          `account-overview-${account.accountId}`,
                        )}
                    >
                      <span>{contextualAlias(provider.accounts, accountIndex, "account")}</span
                      ><ArrowUpRight size={13} aria-hidden="true" />
                    </button>{:else}{contextualAlias(
                      provider.accounts,
                      accountIndex,
                      "account",
                    )}{/if}
                </h3>
                <span class="account-kind">Local alias</span>
                {#if onmanage && !synthetic}<AccountActions
                    id={`account-actions-${account.accountId}`}
                    label={`Actions for ${provider.displayName} ${contextualAlias(provider.accounts, accountIndex, "account")}`}
                    onaction={onmanage}
                    actions={[
                      {
                        label: "Add local connection descriptor",
                        target: { kind: "add-connection", accountId: account.accountId },
                        disabled: !localRemovalAllowed(state, account.accountId),
                      },
                      {
                        label: "Rename account",
                        target: { kind: "rename-account", id: account.accountId },
                        disabled: account.state === "removing",
                      },
                      {
                        label: "Remove local account…",
                        target: { kind: "remove-account", id: account.accountId },
                        disabled:
                          !(provider.providerId === "codex" && CODEX_DIRECT_CONNECTION_AVAILABLE) &&
                          !localRemovalAllowed(state, account.accountId),
                      },
                    ]}
                  />{/if}
              </div>
              {#if account.state === "removing"}<p class="account-pending" role="status">
                  Removal pending · monitoring cleanup could not be confirmed.
                </p>{/if}
              {#if !synthetic}<p class="account-screen-note">
                  {CODEX_DIRECT_CONNECTION_AVAILABLE && provider.providerId === "codex"
                    ? "Connect each account separately · aliases are local labels"
                    : "Disconnected · Identity not verified"}
                </p>
                {#if !CODEX_DIRECT_CONNECTION_AVAILABLE && !localRemovalAllowed(state, account.accountId)}<p
                    class="account-pending"
                  >
                    Native cleanup confirmation is unavailable. Removal and new descriptors are
                    blocked.
                  </p>{/if}
              {/if}
              {#if onoverview && account.workspaces.length > 0}<div
                  class="workspace-navigation"
                  aria-label="Workspace contexts"
                >
                  {#each account.workspaces as workspace (workspace.workspaceId)}<button
                      type="button"
                      class="account-navigation-link"
                      id={`workspace-overview-${workspace.workspaceId}`}
                      aria-label={`Open ${provider.displayName} ${contextualAlias(provider.accounts, accountIndex, "account")} ${workspace.alias} workspace overview`}
                      onclick={() =>
                        onoverview?.(
                          {
                            kind: "account",
                            providerId: provider.providerId,
                            accountId: account.accountId,
                            workspaceId: workspace.workspaceId,
                          },
                          `workspace-overview-${workspace.workspaceId}`,
                        )}
                    >
                      <span>{workspace.alias} workspace</span><ArrowUpRight
                        size={12}
                        aria-hidden="true"
                      /></button
                    >{/each}
                </div>{/if}
              <ul
                class="owned-connection-list"
                aria-label={`${provider.displayName} ${contextualAlias(provider.accounts, accountIndex, "account")} connections`}
              >
                {#each account.connections as connection, connectionIndex (connection.connectionId)}
                  {@const connectionSources = sources.filter((s) =>
                    s.association.connectionIds.includes(connection.connectionId),
                  )}
                  <li class="owned-connection" data-connection-id={connection.connectionId}>
                    <div class="connection-title">
                      <strong
                        >{contextualAlias(
                          account.connections,
                          connectionIndex,
                          "connection",
                        )}</strong
                      ><span
                        class="connection-state-text"
                        class:connection-unavailable={connection.runtime.lifecycle !== "connected"}
                        class:connection-problem={connection.runtime.lifecycle === "error" ||
                          connection.runtime.lifecycle === "auth-required"}
                        >{account.state === "removing"
                          ? "Cleanup pending"
                          : connection.runtime.lifecycle === "connected"
                            ? synthetic
                              ? "Connected · demo"
                              : "Connected"
                            : connection.runtime.lifecycle === "auth-required"
                              ? synthetic
                                ? "Sign-in needed · demo"
                                : "Sign-in needed"
                              : connection.runtime.lifecycle === "error"
                                ? synthetic
                                  ? "Error · demo"
                                  : "Error"
                                : connection.runtime.lifecycle}</span
                      >
                      {#if onmanage && !synthetic}<AccountActions
                          id={`connection-actions-${connection.connectionId}`}
                          label={`Actions for ${provider.displayName} ${contextualAlias(provider.accounts, accountIndex, "account")} ${contextualAlias(account.connections, connectionIndex, "connection")}`}
                          onaction={onmanage}
                          actions={[
                            ...(CODEX_DIRECT_CONNECTION_AVAILABLE &&
                            provider.providerId === "codex" &&
                            directKind(connection.mechanism)
                              ? [
                                  {
                                    label: "Connect",
                                    target: {
                                      kind: "direct" as const,
                                      id: connection.connectionId,
                                      action: "connect" as const,
                                    },
                                    disabled:
                                      presentations[connection.connectionId]?.busy ||
                                      connection.runtime.lifecycle === "connected",
                                  },
                                  ...(directKind(connection.mechanism) === "managed"
                                    ? [
                                        {
                                          label: "Sign in / sign in again",
                                          target: {
                                            kind: "direct" as const,
                                            id: connection.connectionId,
                                            action: "login" as const,
                                          },
                                          disabled: presentations[connection.connectionId]?.busy,
                                        },
                                      ]
                                    : []),
                                  {
                                    label: "Refresh usage",
                                    target: {
                                      kind: "direct" as const,
                                      id: connection.connectionId,
                                      action: "refresh" as const,
                                    },
                                    disabled:
                                      presentations[connection.connectionId]?.busy ||
                                      connection.runtime.lifecycle !== "connected",
                                  },
                                  {
                                    label: "Disconnect",
                                    target: {
                                      kind: "direct" as const,
                                      id: connection.connectionId,
                                      action: "disconnect" as const,
                                    },
                                    disabled:
                                      connection.runtime.lifecycle === "disconnected" &&
                                      !presentations[connection.connectionId]?.cleanupPending &&
                                      !presentations[connection.connectionId]?.busy,
                                  },
                                ]
                              : []),
                            {
                              label:
                                connection.mechanism === "api-key"
                                  ? "Rename key label"
                                  : "Rename connection",
                              target: { kind: "rename-connection", id: connection.connectionId },
                              disabled: account.state === "removing",
                            },
                            {
                              label: "Remove local connection descriptor…",
                              target: { kind: "remove-connection", id: connection.connectionId },
                              disabled:
                                !(
                                  provider.providerId === "codex" &&
                                  CODEX_DIRECT_CONNECTION_AVAILABLE
                                ) &&
                                !localRemovalAllowed(
                                  state,
                                  account.accountId,
                                  connection.connectionId,
                                ),
                            },
                          ]}
                        />{/if}
                    </div>
                    <p>
                      {connection.mechanism === "codex-managed"
                        ? "Separate Codex account"
                        : connection.mechanism === "api-key"
                          ? "API key label"
                          : connection.mechanism === "oauth-grant"
                            ? "OAuth grant label"
                            : "CLI session label"}{#if !synthetic && connection.runtime.lifecycle === "disconnected" && connectionSources.length === 0}
                        · Descriptor only{/if}{#if connection.workspaceId}
                        · {account.workspaces.find((w) => w.workspaceId === connection.workspaceId)
                          ?.alias}{/if}
                    </p>
                    <p>
                      {connection.verifiedIdentity
                        ? `Verified identity · ${connection.verifiedIdentity}${synthetic ? " (synthetic)" : ""}`
                        : "Identity not verified"}
                    </p>
                    {#each connectionSources as source (source.id)}{#if source.origin === "synthetic" || source.freshness !== "unknown" || source.fetchedAtMs !== null}<p
                          class="connection-freshness"
                        >
                          {source.freshness === "stale"
                            ? "Stale"
                            : source.freshness === "current"
                              ? "Current"
                              : "Unknown"}
                          {source.origin === "synthetic"
                            ? "sample"
                            : "reading"}{#if source.origin === "synthetic" || source.fetchedAtMs !== null}
                            · {sampleTime(source.fetchedAtMs)}{/if}
                        </p>{/if}{/each}
                    {#if connectionSources.length === 0}<p>
                        {synthetic ? "No quota source · Unknown" : "No quota source"}
                      </p>{/if}
                    {#if CODEX_DIRECT_CONNECTION_AVAILABLE && presentations[connection.connectionId]?.message}<p
                        class="connection-freshness"
                        role="status"
                        aria-live="polite"
                      >
                        {presentations[connection.connectionId]?.message}
                      </p>{/if}
                    {#if connection.runtime.diagnostic && !presentations[connection.connectionId]?.message}<p
                        class="connection-problem"
                      >
                        {connection.runtime.diagnostic === "authentication-expired"
                          ? synthetic
                            ? "Sample authorization expired; this connection has no values."
                            : "Authorization expired. Sign in to Codex again, then reconnect."
                          : connection.runtime.diagnostic === "cleanup-failed"
                            ? "Cleanup confirmation pending."
                            : synthetic
                              ? "Sample read failed; this connection has no values."
                              : "Usage could not be read. Try connecting again."}
                      </p>{/if}
                    {#if ondetails}{#each connectionSources as source (source.id)}<Button
                          variant="ghost"
                          size="sm"
                          class="connection-details-link"
                          id={`connection-details-${connection.connectionId}-${source.id}`}
                          aria-label={`View ${provider.displayName} ${contextualAlias(provider.accounts, accountIndex, "account")} ${contextualAlias(account.connections, connectionIndex, "connection")} source ${connectionSources.indexOf(source) + 1} details`}
                          onclick={() =>
                            ondetails?.(
                              {
                                selection: {
                                  kind: "connection",
                                  providerId: provider.providerId,
                                  accountId: account.accountId,
                                  connectionId: connection.connectionId,
                                },
                                sourceId: source.id,
                              },
                              `connection-details-${connection.connectionId}-${source.id}`,
                            )}
                        >
                          {connectionSources.length > 1
                            ? `Source ${connectionSources.indexOf(source) + 1} details`
                            : "View details"}<ArrowUpRight size={12} aria-hidden="true" />
                        </Button>{/each}{/if}
                  </li>
                {/each}
              </ul>
              {#if account.connections.length === 0}<p class="account-catalog-note">
                  No connection descriptors. Add a local label from account actions.
                </p>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/each}
</div>
<p class="account-screen-note">
  {synthetic
    ? "Synthetic fixtures stay separate from saved local accounts. Turn Demo off to manage your labels."
    : CODEX_DIRECT_CONNECTION_AVAILABLE
      ? "Only local labels are saved. Connect reads usage after native confirmation. Disconnect stops monitoring and keeps your sign-in. Codex may refresh its own authentication state. No inference or purchases are performed."
      : "Only non-sensitive local metadata is saved. Connection, authentication and monitoring are unavailable. No quota values are inferred."}
</p>
