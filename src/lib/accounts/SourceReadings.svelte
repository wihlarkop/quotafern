<script lang="ts">
  import { classifyRemainingPercent, formatRemainingPercent } from "../quota";
  import type { QuotaSource } from "./model";
  import { sampleTime, quotaDuration } from "./presentation";
  let { source, detailed = false }: { source: QuotaSource; detailed?: boolean } = $props();
</script>

{#if source.data.subscription.length > 0}
  <div class="window-grid" role="group" aria-label="Subscription quota windows">
    {#each source.data.subscription as window (window.id)}
      {@const band = classifyRemainingPercent(window.remainingPercent)}
      <section class="quota-window" aria-label={`${window.label} quota window`}>
        <div class="window-heading">
          <span>{window.label}</span
          >{#if source.origin === "synthetic" || window.remainingPercent !== null}<span
              class={`status-pill ${band}`}
              >{band === "normal"
                ? "Normal"
                : band === "low"
                  ? "Low"
                  : band === "critical"
                    ? "Critical"
                    : "Unknown"}</span
            >{/if}
        </div>
        {#if source.origin === "synthetic" || window.remainingPercent !== null}<div
            class="window-value-row"
          >
            <strong class="remaining-value" class:unknown-value={window.remainingPercent === null}
              >{window.remainingPercent === null
                ? "Unknown"
                : formatRemainingPercent(window.remainingPercent)}</strong
            ><span class="window-reset">remaining</span>
          </div>{/if}
        {#if window.remainingPercent !== null}<div
            class={`usage-meter meter-${band}`}
            role="meter"
            aria-label={`${window.label} remaining quota`}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={window.remainingPercent}
            aria-valuetext={`${window.remainingPercent}% remaining`}
          >
            <span style={`--meter-value: ${window.remainingPercent}%`}></span>
          </div>{/if}
        {#if source.origin === "synthetic" || window.resetAtMs !== null}<p class="owned-reset">
            Resets {sampleTime(window.resetAtMs)}
          </p>{/if}
        {#if detailed && (source.origin === "synthetic" || window.durationMins !== null)}<p
            class="owned-reset"
          >
            {window.durationMins === null
              ? "Duration unknown"
              : `${quotaDuration(window.durationMins)} window`}
          </p>{/if}
      </section>
    {/each}
  </div>
{:else if source.data.apiMetering === null && source.origin === "synthetic"}
  <p class="account-screen-note">Quota windows · Unknown. No values estimated.</p>
{/if}
{#if source.data.plan}<p class="source-freshness">{source.data.plan} plan</p>{/if}
{#if detailed || source.data.subscription.length === 0 || (source.origin === "live" && source.data.credits)}
  <dl class="owned-measures">
    {#if source.data.apiMetering && (source.origin === "synthetic" || source.data.apiMetering.value !== null)}<div
      >
        <dt>API metering</dt>
        <dd>
          {source.data.apiMetering.value === null
            ? "Unknown"
            : new Intl.NumberFormat().format(source.data.apiMetering.value)}
          {source.data.apiMetering.unit}
        </dd>
      </div>{/if}
    {#if source.origin === "synthetic" || (source.data.credits && (source.data.credits.unlimited === true || source.data.credits.balance !== null))}<div
      >
        <dt>Credits</dt>
        <dd>
          {source.data.credits?.unlimited === true
            ? "Unlimited"
            : (source.data.credits?.balance ?? "Unknown")} <span>provider credits</span>
        </dd>
      </div>{/if}
    {#if source.origin === "synthetic" || (source.data.spending && source.data.spending.used !== null)}<div
      >
        <dt>Spending</dt>
        <dd>
          {source.data.spending?.used ?? "Unknown"}
          {#if source.origin === "synthetic" || source.data.spending?.currency}<span
              >{source.data.spending?.currency ?? "unit unknown"}</span
            >{/if}
        </dd>
      </div>{/if}
    {#if detailed && (source.origin === "synthetic" || (source.data.spending && source.data.spending.limit !== null))}<div
      >
        <dt>Spending limit</dt>
        <dd>
          {source.data.spending?.limit ?? "Unknown"}
          {#if source.origin === "synthetic" || source.data.spending?.currency}<span
              >{source.data.spending?.currency ?? "unit unknown"}</span
            >{/if}
        </dd>
      </div>
    {/if}
    {#if detailed && (source.origin === "synthetic" || (source.data.entitlements && source.data.entitlements.earnedResets !== null))}<div
      >
        <dt>Earned resets</dt>
        <dd>{source.data.entitlements?.earnedResets ?? "Unknown"}</dd>
      </div>{/if}
  </dl>
{/if}
