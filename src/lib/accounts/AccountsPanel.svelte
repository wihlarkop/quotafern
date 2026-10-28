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
  import type { AccountState, ConnectionId } from "./model";
  import type { DetailTarget } from "./navigation";
  import {
    contextualAlias,
    sampleTime,
    connectionActions,
    connectionStatus,
    type AccountAction,
    type AccountView,
    type ConnectionView,
  } from "./presentation";
  import { accountsView, overviewView, type Selection } from "./views";

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
  let providers = $derived(accountsView(state));
  let activeProviders = $derived(providers.filter((p) => p.accounts.length > 0));
  let comingSoon = $derived(
    providers.filter(
      (p) =>
        p.accounts.length === 0 && !(p.providerId === "codex" && CODEX_DIRECT_CONNECTION_AVAILABLE),
    ),
  );
  let sources = $derived(
    overviewView(state, { kind: "all" }, nowMs, synthetic ? "synthetic" : "live").sources,
  );
  function actions(
    account: AccountView,
    providerId: string,
    connection?: ConnectionView,
  ): AccountAction[] {
    const native = providerId === "codex" && CODEX_DIRECT_CONNECTION_AVAILABLE;
    const single =
      !connection && account.connections.length === 1 ? account.connections[0] : connection;
    return [
      ...(native && single && directKind(single.mechanism) && account.state !== "removing"
        ? connectionActions(single, presentations[single.connectionId])
        : []),
      {
        label: connection ? "Rename connection" : "Rename account",
        target: connection
          ? { kind: "rename-connection", id: connection.connectionId }
          : { kind: "rename-account", id: account.accountId },
        disabled: account.state === "removing",
      },
      ...(!connection
        ? [
            {
              label: "Add connection label",
              target: { kind: "add-connection" as const, accountId: account.accountId },
              disabled: !localRemovalAllowed(state, account.accountId),
            },
          ]
        : []),
      {
        label: "Remove…",
        target: connection
          ? { kind: "remove-connection", id: connection.connectionId }
          : { kind: "remove-account", id: account.accountId },
        disabled:
          account.state === "removing" ||
          (!native && !localRemovalAllowed(state, account.accountId, connection?.connectionId)),
      },
    ];
  }
</script>

{#snippet status(connection: ConnectionView)}
  <span
    class="connection-state-text"
    class:connection-unavailable={connection.runtime.lifecycle !== "connected"}
    class:connection-problem={connection.runtime.lifecycle === "error" ||
      connection.runtime.lifecycle === "auth-required" ||
      (presentations[connection.connectionId]?.cleanupPending &&
        connection.runtime.lifecycle === "disconnected")}
  >
    {connectionStatus(connection, presentations[connection.connectionId])}{synthetic
      ? " · demo"
      : ""}
  </span>
{/snippet}

{#snippet connectionInfo(
  connection: ConnectionView,
  account: AccountView,
  providerId: string,
  accountLabel: string,
)}
  {@const connectionSources = sources.filter((s) =>
    s.association.connectionIds.includes(connection.connectionId),
  )}
  {@const presentation = presentations[connection.connectionId]}
  {#each connectionSources as source (source.id)}
    {#if source.freshness === "current" || source.freshness === "stale"}
      <p class="connection-freshness" class:source-stale={source.freshness === "stale"}>
        {source.freshness === "stale" ? "Stale quota" : "Current quota"}{source.fetchedAtMs !== null
          ? ` · Updated ${sampleTime(source.fetchedAtMs)}`
          : ""}
      </p>
    {/if}
  {/each}
  {#if presentation?.message && (presentation.busy || presentation.status || (presentation.cleanupPending && connection.runtime.lifecycle !== "connected") || connection.runtime.lifecycle !== "connected" || connectionSources.some((s) => s.freshness !== "current"))}
    <p class="connection-feedback" role="status">{presentation.message}</p>
  {/if}
  {#if connection.runtime.diagnostic && !presentation?.message}
    <p class="connection-problem">
      {connection.runtime.diagnostic === "authentication-expired"
        ? "Sign in to Codex again, then reconnect."
        : connection.runtime.diagnostic === "cleanup-failed"
          ? "Monitoring cleanup needs confirmation before removal."
          : "Quota could not be read. Reconnect to try again."}
    </p>
  {/if}
  <div class="account-reading-actions">
    {#if connection.verifiedIdentity || presentation?.message || connection.workspaceId || account.connections.length === 1}
      <details class="connection-disclosure">
        <summary>Connection details</summary>
        <p>
          {connection.alias}{connection.workspaceId
            ? ` · ${account.workspaces.find((w) => w.workspaceId === connection.workspaceId)?.alias ?? "Workspace unavailable"}`
            : ""}
        </p>
        {#if connection.verifiedIdentity}<p>
            Verified identity · {connection.verifiedIdentity}{synthetic ? " (synthetic)" : ""}
          </p>{/if}
        {#if presentation?.message}<p>{presentation.message}</p>{/if}
        {#if !synthetic && onmanage && account.connections.length === 1}<button
            type="button"
            class="account-navigation-link"
            id={`rename-connection-${connection.connectionId}`}
            onclick={() =>
              onmanage?.(
                { kind: "rename-connection", id: connection.connectionId },
                `rename-connection-${connection.connectionId}`,
              )}>Rename connection</button
          >{/if}
      </details>
    {/if}
    {#if ondetails}{#each connectionSources as source (source.id)}
        <Button
          variant="ghost"
          size="sm"
          class="connection-details-link"
          id={`connection-details-${connection.connectionId}-${source.id}`}
          aria-label={`View ${providerId} ${accountLabel} ${connection.alias} source ${connectionSources.indexOf(source) + 1} details`}
          onclick={() =>
            ondetails?.(
              {
                selection: {
                  kind: "connection",
                  providerId,
                  accountId: account.accountId,
                  connectionId: connection.connectionId,
                },
                sourceId: source.id,
              },
              `connection-details-${connection.connectionId}-${source.id}`,
            )}
        >
          {connectionSources.length > 1
            ? `Quota ${connectionSources.indexOf(source) + 1} details`
            : "View quota"}<ArrowUpRight size={12} aria-hidden="true" />
        </Button>
      {/each}{/if}
  </div>
{/snippet}

{#if showHeading}<div class="view-heading">
    <div>
      <h1 tabindex="-1">Accounts</h1>
      <p>Manage your quota connections.</p>
    </div>
  </div>{/if}
{#if synthetic}<div class="account-demo-notice" role="note">
    <strong>SYNTHETIC DEMO</strong><span>Illustrative accounts. Nothing is signed in.</span>
  </div>{/if}
{#if state.metadata.accounts.length === 0}
  <section class="owned-empty">
    <h2>No accounts yet</h2>
    <p>
      {synthetic
        ? "This demo has no accounts."
        : CODEX_DIRECT_CONNECTION_AVAILABLE
          ? "Add a Codex account to see its quota here."
          : "Live monitoring is unavailable in this build."}
    </p>
  </section>
{/if}
<div class="account-provider-list">
  {#each activeProviders as provider (provider.providerId)}
    <section class="account-provider" aria-label={`${provider.displayName} accounts`}>
      <div class="account-provider-heading">
        <span class="provider-icon" aria-hidden="true"
          >{#if provider.providerId === "codex"}<Command size={16} />{:else}<Layers
              size={16}
            />{/if}</span
        >
        <h2 id={`provider-heading-${provider.providerId}`} tabindex="-1">
          <button
            type="button"
            class="provider-disclosure"
            aria-expanded={!collapsedProviders.includes(provider.providerId)}
            aria-controls={`provider-accounts-${provider.providerId}`}
            aria-label={`${provider.displayName} · ${provider.accounts.length} accounts`}
            onclick={() => {
              collapsedProviders = collapsedProviders.includes(provider.providerId)
                ? collapsedProviders.filter((id) => id !== provider.providerId)
                : [...collapsedProviders, provider.providerId];
            }}>{provider.displayName}<ChevronDown size={14} aria-hidden="true" /></button
          >
        </h2>
        {#if provider.providerId !== "codex" || !CODEX_DIRECT_CONNECTION_AVAILABLE}<span
            class="system-chip"
            >{provider.availability === "gated" ? "Unavailable in this build" : "Coming Soon"}</span
          >{/if}
      </div>
      <ul
        class="owned-account-list"
        id={`provider-accounts-${provider.providerId}`}
        hidden={collapsedProviders.includes(provider.providerId)}
      >
        {#each provider.accounts as account, accountIndex (account.accountId)}
          {@const label = contextualAlias(provider.accounts, accountIndex, "account")}
          {@const single = account.connections.length === 1 ? account.connections[0] : null}
          {@const plans = [
            ...new Set(
              sources
                .filter((s) => s.accountId === account.accountId)
                .flatMap((s) => (s.data.plan ? [s.data.plan] : [])),
            ),
          ]}
          <li class="owned-account" data-account-id={account.accountId}>
            <div class="owned-account-heading">
              <div class="account-summary-copy">
                <h3>
                  {#if onoverview}<button
                      type="button"
                      class="account-navigation-link"
                      id={`account-overview-${account.accountId}`}
                      aria-label={`Open ${provider.displayName} ${label} overview`}
                      onclick={() =>
                        onoverview?.(
                          {
                            kind: "account",
                            providerId: provider.providerId,
                            accountId: account.accountId,
                          },
                          `account-overview-${account.accountId}`,
                        )}><span>{label}</span><ArrowUpRight size={13} aria-hidden="true" /></button
                    >{:else}{label}{/if}
                </h3>
                <p class="account-summary-meta">
                  {provider.displayName}{plans.length === 1 ? ` · ${plans[0]}` : ""}
                </p>
              </div>
              {#if account.state === "removing"}<span class="account-pending">Cleanup pending</span
                >{:else if single}{@render status(
                  single,
                )}{:else if account.connections.length === 0}<span
                  class="connection-state-text connection-unavailable">Disconnected</span
                >{/if}
              {#if onmanage && !synthetic}<AccountActions
                  id={`account-actions-${account.accountId}`}
                  label={`Actions for ${provider.displayName} ${label}`}
                  onaction={onmanage}
                  actions={actions(account, provider.providerId)}
                />{/if}
            </div>
            {#if account.state === "removing"}<p class="account-pending" role="status">
                Removal pending. Monitoring cleanup could not be confirmed.
              </p>{/if}
            {#if single}<div
                class="account-connection-summary"
                data-connection-id={single.connectionId}
              >
                {@render connectionInfo(single, account, provider.providerId, label)}
              </div>{/if}
            {#if account.connections.length > 1 || account.workspaces.length > 0}
              <details class="account-contexts">
                <summary
                  >{account.connections.length > 1
                    ? `${account.connections.length} connections`
                    : "Workspace contexts"}</summary
                >
                {#if account.workspaces.length > 0 && onoverview}<div
                    class="workspace-navigation"
                    aria-label="Workspace contexts"
                  >
                    {#each account.workspaces as workspace (workspace.workspaceId)}<button
                        type="button"
                        class="account-navigation-link"
                        id={`workspace-overview-${workspace.workspaceId}`}
                        aria-label={`Open ${provider.displayName} ${label} ${workspace.alias} workspace overview`}
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
                        ><span>{workspace.alias} workspace</span><ArrowUpRight
                          size={12}
                          aria-hidden="true"
                        /></button
                      >{/each}
                  </div>{/if}
                {#if !single}<ul
                    class="owned-connection-list"
                    aria-label={`${provider.displayName} ${label} connections`}
                  >
                    {#each account.connections as connection, index (connection.connectionId)}<li
                        class="owned-connection"
                        data-connection-id={connection.connectionId}
                      >
                        <div class="connection-title">
                          <strong
                            >{contextualAlias(account.connections, index, "connection")}</strong
                          >{@render status(connection)}{#if onmanage && !synthetic}<AccountActions
                              id={`connection-actions-${connection.connectionId}`}
                              label={`Actions for ${provider.displayName} ${label} ${contextualAlias(account.connections, index, "connection")}`}
                              onaction={onmanage}
                              actions={actions(account, provider.providerId, connection)}
                            />{/if}
                        </div>
                        {@render connectionInfo(connection, account, provider.providerId, label)}
                      </li>{/each}
                  </ul>{/if}
              </details>
              {#if account.connections.length > 1}{#each account.connections.filter((c) => c.runtime.lifecycle === "error" || c.runtime.lifecycle === "auth-required" || presentations[c.connectionId]?.status || (presentations[c.connectionId]?.cleanupPending && c.runtime.lifecycle === "disconnected")) as connection (connection.connectionId)}<p
                    class="connection-problem"
                  >
                    {connection.alias} · {connectionStatus(
                      connection,
                      presentations[connection.connectionId],
                    )}
                  </p>{/each}{/if}
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>
{#if comingSoon.length > 0}<details class="coming-soon-providers">
    <summary>Coming Soon · {comingSoon.length} providers</summary>
    <p>{comingSoon.map((p) => p.displayName).join(" · ")}</p>
  </details>{/if}
{#if !synthetic}<details class="account-monitoring-details">
    <summary>About account connections</summary>
    <p>
      Connect asks for permission to read quota and reconnect automatically. Disconnect revokes
      monitoring permission and keeps your Codex sign-in. Codex manages authentication and may
      update its own sign-in state. No inference or purchases are performed.
    </p>
  </details>{/if}
