<script lang="ts">
  import Command from "@lucide/svelte/icons/command";
  import Layers from "@lucide/svelte/icons/layers";

  import type { AccountState } from "./model";
  import { contextualAlias, sampleTime } from "./presentation";
  import { accountsView, overviewView } from "./views";

  let {
    state,
    nowMs,
    synthetic = true,
    showHeading = true,
  }: { state: AccountState; nowMs: number; synthetic?: boolean; showHeading?: boolean } = $props();
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
      <h1>Accounts</h1>
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
        <h2>{provider.displayName}</h2>
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
        <ul class="owned-account-list">
          {#each provider.accounts as account, accountIndex (account.accountId)}
            <li class="owned-account" data-account-id={account.accountId}>
              <div class="owned-account-heading">
                <h3>{contextualAlias(provider.accounts, accountIndex, "account")}</h3>
                <span class="account-kind">Local alias</span>
              </div>
              {#if account.state === "removing"}<p class="account-pending" role="status">
                  Removal pending · monitoring cleanup could not be confirmed.
                </p>{/if}
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
