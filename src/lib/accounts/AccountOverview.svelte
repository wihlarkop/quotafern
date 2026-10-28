<script lang="ts">
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import ArrowUpRight from "@lucide/svelte/icons/arrow-up-right";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";

  import CodexDetails from "../components/CodexDetails.svelte";
  import { Button } from "../components/ui/button";
  import type { AccountState } from "./model";
  import {
    contextLabel,
    contextOptions,
    selectionInvalid,
    selectionKey,
    selectorSelection,
    type AccountNavigation,
    type DetailTarget,
  } from "./navigation";
  import {
    activityMonitoring,
    contextualAlias,
    providerName,
    sampleTime,
    connectionStatus,
  } from "./presentation";
  import SourceReadings from "./SourceReadings.svelte";
  import { accountsView, detailsView, overviewView, type Selection } from "./views";

  let {
    state: accountState,
    nowMs,
    navigation,
    oncontext,
    ondetails,
    onback,
    onrefresh,
    refreshing = false,
    synthetic = true,
  }: {
    state: AccountState;
    nowMs: number;
    navigation: AccountNavigation;
    oncontext: (selection: Selection) => void;
    ondetails: (target: DetailTarget, controlId: string) => void;
    onback: () => void;
    onrefresh?: () => void;
    refreshing?: boolean;
    synthetic?: boolean;
  } = $props();
  let selectedDetail = $derived(navigation.detail);
  let projected = $derived(
    overviewView(accountState, navigation.selection, nowMs, synthetic ? "synthetic" : "live"),
  );
  let providers = $derived(accountsView(accountState));
  let attention = $derived(
    providers.flatMap((p) =>
      p.accounts.flatMap((a) =>
        a.connections
          .filter((c) => {
            const selection = projected.selection;
            return (
              c.runtime.lifecycle !== "connected" &&
              (selection.kind === "all" ||
                (selection.providerId === p.providerId &&
                  (selection.kind === "provider" ||
                    (selection.accountId === a.accountId &&
                      (selection.kind === "connection"
                        ? selection.connectionId === c.connectionId
                        : !selection.workspaceId || selection.workspaceId === c.workspaceId)))))
            );
          })
          .map((c) => ({ account: a.alias, provider: p.displayName, connection: c })),
      ),
    ),
  );
  let detail = $derived(
    selectedDetail
      ? detailsView(accountState, selectedDetail.selection, nowMs, synthetic ? "synthetic" : "live")
      : null,
  );
  let detailSource = $derived(detail?.sources.find((s) => s.id === selectedDetail?.sourceId));
  let detailOwnership = $derived(
    detail && detailSource
      ? `Source ${detail.sources.findIndex((s) => s.id === detailSource.id) + 1} of ${detail.sources.length} · ${detailSource.association.connectionIds.map((connectionId) => contextLabel(accountState, { kind: "connection", providerId: detail!.providerId, accountId: detail!.accountId, connectionId })).join("; ")}`
      : `${contextLabel(accountState, selectedDetail?.selection ?? navigation.selection)} · Selection unavailable`,
  );
  let options = $derived(contextOptions(accountState));
  let displayedSelection = $derived(selectorSelection(accountState, navigation));
  let selectedKey = $derived(selectionKey(displayedSelection));
  let invalid = $derived(selectionInvalid(accountState, navigation.selection));
  function changeContext(event: Event) {
    oncontext(
      options.find((o) => o.key === (event.currentTarget as HTMLSelectElement).value)
        ?.selection ?? { kind: "all" },
    );
  }
  function aliasFor(providerId: string, accountId: string) {
    const accounts = providers.find((p) => p.providerId === providerId)?.accounts ?? [];
    const index = accounts.findIndex((a) => a.accountId === accountId);
    return index < 0 ? "Unavailable account" : contextualAlias(accounts, index, "account");
  }
</script>

<div class="view-heading">
  <div>
    <h1 id="owned-details-title" tabindex="-1" aria-describedby="account-context-status">
      {selectedDetail
        ? `${detail ? providerName(detail.providerId) : "Account"} Details`
        : "Usage overview"}
    </h1>
    <p>
      {selectedDetail
        ? synthetic
          ? "Quota, credits and activity"
          : "Reported Codex usage"
        : "Remaining quota and reset times"}
    </p>
  </div>
  {#if onrefresh && !synthetic}<Button
      class="refresh-button"
      variant="outline"
      size="sm"
      onclick={onrefresh}
      disabled={refreshing}
      aria-busy={refreshing}
      aria-label="Refresh all connected Codex accounts"
      ><RefreshCw size={13} aria-hidden="true" class={refreshing ? "spin" : ""} />{refreshing
        ? "Refreshing"
        : "Refresh all"}</Button
    >{/if}
  {#if selectedDetail || navigation.overviewReturn}<Button
      variant="outline"
      size="sm"
      onclick={onback}><ArrowLeft size={13} aria-hidden="true" />Back</Button
    >{/if}
</div>
{#if synthetic}<div class="account-demo-notice" role="note">
    <strong>SYNTHETIC DEMO</strong><span>Illustrative values. No live account is connected.</span>
  </div>{/if}
<div class="account-context-control">
  <label for="account-context">Account context</label><select
    id="account-context"
    value={selectedKey}
    title={contextLabel(accountState, displayedSelection)}
    aria-describedby="account-context-status"
    onchange={changeContext}
    >{#if !options.some((option) => option.key === selectedKey)}<option value={selectedKey} disabled
        >Selection unavailable</option
      >{/if}{#each options as option (option.key)}<option value={option.key}>{option.label}</option
      >{/each}</select
  >
</div>
<p
  id="account-context-status"
  class="context-announcement"
  role="status"
  aria-live="polite"
  aria-atomic="true"
>
  {selectedDetail
    ? ""
    : navigation.notice || (invalid ? "Selection removed; showing All accounts." : "")}
  {selectedDetail
    ? detailOwnership
    : contextLabel(accountState, projected.selection)}{selectedDetail ? " · details" : ""}
</p>

{#if selectedDetail}
  {#if detail && detailSource}
    {#key `${detail.accountId}:${detail.connectionId ?? "account"}:${detailSource.id}`}
      <section
        class="owned-detail-context"
        aria-label="Selected account ownership"
        data-account-id={detail.accountId}
        data-source-id={detailSource.id}
      >
        <h2>{aliasFor(detail.providerId, detail.accountId)}</h2>
        <p>{providerName(detail.providerId)}</p>
        <details class="connection-disclosure">
          <summary>Connection details</summary>
          {#each detail.connections.filter( (c) => detailSource.association.connectionIds.includes(c.connectionId) ) as connection (connection.connectionId)}<p
              class="owned-detail-connection"
            >
              {contextLabel(accountState, {
                kind: "connection",
                providerId: detail.providerId,
                accountId: detail.accountId,
                connectionId: connection.connectionId,
              })}{connection.verifiedIdentity
                ? ` · Verified identity · ${connection.verifiedIdentity}${synthetic ? " (synthetic)" : ""}`
                : ""}
            </p>{/each}
        </details>
        {#if detailSource.origin === "synthetic" || detailSource.freshness !== "unknown" || detailSource.fetchedAtMs !== null}<p
            class="source-freshness"
          >
            {detailSource.freshness}
            {detailSource.origin === "synthetic"
              ? "sample"
              : "reading"}{#if detailSource.origin === "synthetic" || detailSource.fetchedAtMs !== null}
              · {sampleTime(detailSource.fetchedAtMs)}{/if}
          </p>{/if}
      </section>
      <article class="owned-detail-readings">
        <h2>
          {detailSource.providerId === "codex" || detailSource.data.subscription.length > 0
            ? "Subscription quota"
            : "API usage & billing"}
        </h2>
        <SourceReadings source={detailSource} detailed />
        {#if detailSource.association.kind === "unknown" || detailSource.association.connectionIds.length > 1}<p
            class="source-relationship"
          >
            {detailSource.association.kind === "verified"
              ? `Shared quota · ${detailSource.association.connectionIds.length} connections`
              : "Billing relationship unknown; do not add these balances."}
          </p>{/if}
      </article>
      {#if synthetic && detail.providerId === "codex"}<CodexDetails
          source="synthetic"
          monitoring={activityMonitoring(detailSource)}
          {nowMs}
          activityOnly
        />{:else if synthetic}<p class="account-screen-note">
          Activity unavailable · no daily token report in this fixture.
        </p>{/if}
    {/key}
  {:else}<section class="owned-empty" role="status">
      <h2>Selection unavailable</h2>
      <p>
        This source is missing or its account is pending removal. Use Back to return to the current
        overview.
      </p>
    </section>{/if}
{:else}
  <div class="owned-source-list">
    {#each projected.sources as source (source.id)}
      {@const account = providers
        .find((p) => p.providerId === source.providerId)
        ?.accounts.find((a) => a.accountId === source.accountId)}
      {@const connections =
        account?.connections.filter((c) =>
          source.association.connectionIds.includes(c.connectionId),
        ) ?? []}
      {@const connectionLabel = connections
        .map((c) =>
          contextualAlias(
            account!.connections,
            account!.connections.findIndex((a) => a.connectionId === c.connectionId),
            "connection",
          ),
        )
        .join(" · ")}
      <article class="owned-source" data-account-id={source.accountId} data-source-id={source.id}>
        <div class="owned-source-heading">
          <div>
            <h2>{aliasFor(source.providerId, source.accountId)}</h2>
            <p>
              {providerName(source.providerId)} · {source.providerId === "codex" ||
              source.data.subscription.length > 0
                ? "Subscription"
                : "API metering"}
            </p>
          </div>
          {#if source.origin === "synthetic" || source.freshness !== "unknown"}<span
              class="source-freshness"
              class:source-stale={source.freshness === "stale"}>{source.freshness}</span
            >{/if}
        </div>
        {#if connections.length > 1}<p class="owned-source-connection">
            {connections
              .map((c) => {
                const index = account!.connections.findIndex(
                  (a) => a.connectionId === c.connectionId,
                );
                return contextualAlias(account!.connections, index, "connection");
              })
              .join(" · ")}
          </p>{/if}
        <SourceReadings {source} />
        <div class="source-meta">
          {#if source.fetchedAtMs !== null}<span
              >{synthetic ? "Sample" : "Updated"} · {sampleTime(source.fetchedAtMs)}</span
            >{/if}{#if synthetic}<span>Synthetic source</span>{/if}
        </div>
        {#if source.association.kind === "unknown" || source.association.connectionIds.length > 1}<p
            class="source-relationship"
          >
            {source.association.kind === "verified"
              ? `Shared quota · ${source.association.connectionIds.length} connections`
              : "Billing relationship unknown; do not add these balances."}
          </p>{/if}
        <Button
          variant="ghost"
          size="sm"
          class="owned-details-button"
          id={`source-details-${source.id}`}
          aria-label={`View ${providerName(source.providerId)} ${aliasFor(source.providerId, source.accountId)} ${connectionLabel} details`}
          onclick={() =>
            ondetails(
              {
                selection:
                  projected.selection.kind === "connection" ||
                  projected.selection.kind === "account"
                    ? projected.selection
                    : {
                        kind: "account",
                        providerId: source.providerId,
                        accountId: source.accountId,
                      },
                sourceId: source.id,
              },
              `source-details-${source.id}`,
            )}>View details <ArrowUpRight size={14} aria-hidden="true" /></Button
        >
      </article>
    {/each}
  </div>
  {#each attention as item (item.connection.connectionId)}<p class="overview-connection-notice">
      <strong>{item.account}</strong> · {item.provider} · {connectionStatus(item.connection)}{item
        .connection.runtime.diagnostic
        ? " · Check this connection in Accounts."
        : ""}
    </p>{/each}
  {#if projected.empty}<section class="owned-empty" role="status">
      <h2>
        {accountState.metadata.accounts.length === 0 ? "No accounts yet" : "No quota available"}
      </h2>
      <p>
        {accountState.metadata.accounts.length === 0
          ? "Add an account in Accounts to see its quota."
          : "Connect an account to read its quota. Missing readings are unknown, not zero."}
      </p>
    </section>{/if}
{/if}
