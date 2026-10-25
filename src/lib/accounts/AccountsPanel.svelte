<script lang="ts">
  import ArrowUpRight from "@lucide/svelte/icons/arrow-up-right";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Command from "@lucide/svelte/icons/command";
  import Layers from "@lucide/svelte/icons/layers";

  import { Button } from "../components/ui/button";
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
  }: {
    state: AccountState;
    nowMs: number;
    synthetic?: boolean;
    showHeading?: boolean;
    collapsedProviders?: string[];
    onoverview?: (selection: Selection, controlId: string) => void;
    ondetails?: (target: DetailTarget, controlId: string) => void;
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
      <p>{synthetic ? "Local names, independent connections" : "No accounts configured"}</p>
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
    Account setup is planned. Live Codex is gated; other adapters are Coming Soon.
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
        <h2>
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
          >{provider.availability === "gated" ? "Live disabled" : "Coming Soon"}</span
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
              </div>
              {#if account.state === "removing"}<p class="account-pending" role="status">
                  Removal pending · monitoring cleanup could not be confirmed.
                </p>{/if}
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
                            ? "Connected · demo"
                            : connection.runtime.lifecycle === "auth-required"
                              ? "Sign-in needed · demo"
                              : connection.runtime.lifecycle === "error"
                                ? "Error · demo"
                                : connection.runtime.lifecycle}</span
                      >
                    </div>
                    <p>
                      {connection.mechanism === "api-key"
                        ? "API key label"
                        : "CLI session"}{#if connection.workspaceId}
                        · {account.workspaces.find((w) => w.workspaceId === connection.workspaceId)
                          ?.alias}{/if}
                    </p>
                    <p>
                      {connection.verifiedIdentity
                        ? `Verified identity · ${connection.verifiedIdentity} (synthetic)`
                        : "Identity not verified"}
                    </p>
                    {#each connectionSources as source (source.id)}<p class="connection-freshness">
                        {source.freshness === "stale"
                          ? "Stale"
                          : source.freshness === "current"
                            ? "Current"
                            : "Unknown"} sample · {sampleTime(source.fetchedAtMs)}
                      </p>{/each}
                    {#if connectionSources.length === 0}<p>No quota source · Unknown</p>{/if}
                    {#if connection.runtime.diagnostic}<p class="connection-problem">
                        {connection.runtime.diagnostic === "authentication-expired"
                          ? "Sample authorization expired; this connection has no values."
                          : connection.runtime.diagnostic === "cleanup-failed"
                            ? "Cleanup confirmation pending."
                            : "Sample read failed; this connection has no values."}
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
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/each}
</div>
<p class="account-screen-note">
  Add, rename, disconnect and remove are planned for account management. No account names or
  connections are saved.
</p>
