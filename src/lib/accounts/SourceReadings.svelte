<script lang="ts">
  import { classifyRemainingPercent, formatRemainingPercent } from "../quota";
  import type { QuotaSource } from "./model";
  import { sampleTime } from "./presentation";
  let { source, detailed = false }: { source: QuotaSource; detailed?: boolean } = $props();
</script>

{#if source.data.subscription.length > 0}
  <div class="window-grid" role="group" aria-label="Subscription quota windows">
    {#each source.data.subscription as window (window.id)}
      {@const band = classifyRemainingPercent(window.remainingPercent)}
      <section class="quota-window" aria-label={`${window.label} quota window`}>
        <div class="window-heading">
          <span>{window.label}</span><span class={`status-pill ${band}`}
            >{band === "normal"
              ? "Normal"
              : band === "low"
                ? "Low"
                : band === "critical"
                  ? "Critical"
                  : "Unknown"}</span
          >
        </div>
        <div class="window-value-row">
          <strong class="remaining-value" class:unknown-value={window.remainingPercent === null}
            >{window.remainingPercent === null
              ? "Unknown"
              : formatRemainingPercent(window.remainingPercent)}</strong
          ><span class="window-reset">remaining</span>
        </div>
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
        <p class="owned-reset">Reset · {sampleTime(window.resetAtMs)}</p>
        {#if detailed}<p class="owned-reset">
            Window · {window.durationMins === null ? "Unknown" : `${window.durationMins} min`}
          </p>{/if}
      </section>
    {/each}
  </div>
{:else if source.data.apiMetering === null}
  <p class="account-screen-note">Quota windows · Unknown. No values estimated.</p>
{/if}
{#if detailed || source.data.subscription.length === 0}
  <dl class="owned-measures">
    {#if source.data.apiMetering}<div>
        <dt>API metering</dt>
        <dd>
          {source.data.apiMetering.value === null
            ? "Unknown"
            : new Intl.NumberFormat().format(source.data.apiMetering.value)}
          {source.data.apiMetering.unit}
        </dd>
      </div>{/if}
    <div>
      <dt>Credits</dt>
      <dd>
        {source.data.credits?.unlimited === true
          ? "Unlimited"
          : (source.data.credits?.balance ?? "Unknown")} <span>provider credits</span>
      </dd>
    </div>
    <div>
      <dt>Spending</dt>
      <dd>
        {source.data.spending?.used ?? "Unknown"}
        <span>{source.data.spending?.currency ?? "unit unknown"}</span>
      </dd>
    </div>
    {#if detailed}<div>
        <dt>Spending limit</dt>
        <dd>
          {source.data.spending?.limit ?? "Unknown"}
          <span>{source.data.spending?.currency ?? "unit unknown"}</span>
        </dd>
      </div>
      <div>
        <dt>Earned resets</dt>
        <dd>{source.data.entitlements?.earnedResets ?? "Unknown"}</dd>
      </div>{/if}
  </dl>
{/if}
