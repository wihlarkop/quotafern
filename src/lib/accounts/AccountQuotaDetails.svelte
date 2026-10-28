<script lang="ts">
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";

  import CodexDetails from "../components/CodexDetails.svelte";
  import { Button } from "../components/ui/button";
  import type { DirectPresentation } from "./direct";
  import type { AccountState, ConnectionId, SourceId, QuotaSource } from "./model";
  import { focusedQuotaView, type FocusedQuotaTarget } from "./navigation";
  import { activityMonitoring, connectionStatus, providerName, sampleTime } from "./presentation";
  import SourceReadings from "./SourceReadings.svelte";
  import { accountsView } from "./views";

  let {
    state,
    target,
    nowMs,
    synthetic = false,
    presentations = {},
    onchoose,
    onback,
  }: {
    state: AccountState;
    target: FocusedQuotaTarget;
    nowMs: number;
    synthetic?: boolean;
    presentations?: Partial<Record<ConnectionId, DirectPresentation>>;
    onchoose: (id: SourceId) => void;
    onback: () => void;
  } = $props();
  let view = $derived(focusedQuotaView(state, target, nowMs, synthetic ? "synthetic" : "live"));
  let account = $derived(
    accountsView(state)
      .find((p) => p.providerId === target.selection.providerId)
      ?.accounts.find((a) => a.accountId === target.selection.accountId),
  );
  let connections = $derived(
    (account?.connections ?? []).filter(
      (c) => !view.source || view.source.association.connectionIds.includes(c.connectionId),
    ),
  );
  function sourceConnections(source: QuotaSource): string {
    return (account?.connections ?? [])
      .filter((c) => source.association.connectionIds.includes(c.connectionId))
      .map((c) => c.alias)
      .join(" · ");
  }
  function feedback(message = ""): string {
    return message.replace(/\s+\[[^\]\r\n]*\]$/, "");
  }
</script>

<div class="view-heading">
  <div>
    <h1 id="owned-details-title" tabindex="-1">{view.account?.alias ?? target.alias}</h1>
    <p>{providerName(target.selection.providerId)}</p>
  </div>
  <Button variant="outline" size="sm" onclick={onback}
    ><ArrowLeft size={13} aria-hidden="true" />Back</Button
  >
</div>
{#if synthetic}<div class="account-demo-notice" role="note">
    <strong>SYNTHETIC DEMO</strong><span>Illustrative values. No live account is connected.</span>
  </div>{/if}
<section
  class="focused-quota"
  aria-label="Account quota details"
  data-account-id={target.selection.accountId}
>
  <div class="focused-connection-status" aria-label="Connection status">
    {#each connections as connection (connection.connectionId)}<span
        class="connection-state-text"
        class:connection-unavailable={connection.runtime.lifecycle !== "connected"}
        class:connection-problem={connection.runtime.lifecycle === "error" ||
          connection.runtime.lifecycle === "auth-required"}
      >
        {connections.length > 1 ? `${connection.alias} · ` : ""}{connectionStatus(
          connection,
          presentations[connection.connectionId],
        )}
      </span>{/each}
  </div>
  {#each connections as connection (connection.connectionId)}
    {#if presentations[connection.connectionId]?.message && (presentations[connection.connectionId]?.busy || presentations[connection.connectionId]?.status || connection.runtime.lifecycle !== "connected" || view.source?.freshness !== "current")}
      <p class="overview-connection-notice" role="status">
        {feedback(presentations[connection.connectionId]?.message)}
      </p>
    {:else if connection.runtime.diagnostic}
      <p class="connection-problem">
        {connection.runtime.lifecycle === "auth-required"
          ? "Sign in again from Accounts to read quota."
          : "Quota could not be refreshed. Review this connection in Accounts."}
      </p>
    {/if}
  {/each}
  {#if view.kind === "source" && view.source}
    {@const source = view.source}
    <p class="source-freshness" class:source-stale={source.freshness === "stale"}>
      {source.freshness === "current"
        ? "Current quota"
        : source.freshness === "stale"
          ? "Stale quota"
          : source.freshness === "error"
            ? "Quota read failed"
            : source.freshness === "unavailable"
              ? "Quota unavailable"
              : "Quota freshness unknown"}{source.fetchedAtMs !== null
        ? ` · Updated ${sampleTime(source.fetchedAtMs)}`
        : ""}
    </p>
    <article class="owned-detail-readings" data-source-id={source.id}>
      <h2>
        {source.data.subscription.length || source.providerId === "codex"
          ? "Subscription quota"
          : "Usage & billing"}
      </h2>
      <SourceReadings {source} detailed />
      {#if source.data.subscription.length === 0 && source.data.apiMetering === null}<p
          class="account-screen-note"
        >
          No quota windows were reported. Missing values are unknown, not zero.
        </p>{/if}
      {#if source.association.kind === "unknown" || source.association.connectionIds.length > 1}<p
          class="source-relationship"
        >
          {source.association.kind === "unknown"
            ? "Billing relationship unknown; do not add these balances."
            : `Shared quota · ${source.association.connectionIds.length} connections · shown once`}
        </p>{/if}
    </article>

    {#if synthetic && source.providerId === "codex" && source.data.activity}<details
        class="connection-disclosure"
      >
        <summary>Activity</summary><CodexDetails
          source="synthetic"
          monitoring={activityMonitoring(source)}
          {nowMs}
          activityOnly
        />
      </details>{/if}
  {:else if view.kind === "choose"}
    <section class="owned-empty">
      <h2>Choose a quota source</h2>
      <p>This account has separate quota sources. Choose one to see its details.</p>
    </section>
    <ul class="focused-source-choices" aria-label="Quota sources for this account">
      {#each view.sources as source, index (source.id)}<li>
          <Button
            variant="outline"
            class="focused-source-choice"
            id={`focused-source-${source.id}`}
            onclick={() => onchoose(source.id)}
            aria-label={`Open quota source ${index + 1} for ${view.account?.alias ?? target.alias}: ${sourceConnections(source)}`}
            ><span>Source {index + 1}{source.data.plan ? ` · ${source.data.plan}` : ""}</span><small
              >{sourceConnections(source)}</small
            ></Button
          >
        </li>{/each}
    </ul>
  {:else}
    <section class="owned-empty" role="status">
      <h2>{view.kind === "unavailable" ? "Quota unavailable" : "No quota available"}</h2>
      <p>
        {view.kind === "unavailable"
          ? "This quota source or account is no longer available. Return to Accounts to review the connection."
          : "No quota is available for this account. Review its connection in Accounts."}
      </p>
      <Button variant="outline" size="sm" onclick={onback}>Manage accounts</Button>
    </section>
  {/if}
  {#if connections.length > 0}
    <details class="connection-disclosure">
      <summary>Connection details</summary>
      {#each connections as connection (connection.connectionId)}<p>
          {connection.alias}{connection.verifiedIdentity
            ? ` · Verified identity · ${connection.verifiedIdentity}${synthetic ? " (synthetic)" : ""}`
            : ""}
        </p>
        {#if presentations[connection.connectionId]?.message}<p>
            {presentations[connection.connectionId]?.message}
          </p>{/if}
      {/each}
    </details>
  {/if}
</section>
