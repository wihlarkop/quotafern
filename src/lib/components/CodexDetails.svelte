<script lang="ts">
  import CircleHelp from "@lucide/svelte/icons/circle-help";
  import Clock3 from "@lucide/svelte/icons/clock-3";
  import { tick } from "svelte";

  import {
    ACTIVITY_RANGE_DAYS,
    buildActivityGrid,
    isNonnegativeSafeInteger,
    isValidTimestamp,
    type ActivityCell,
  } from "../activity";
  import type { CodexMonitoring, LiveCodexSnapshot } from "../codex";

  type QuotaWindow = LiveCodexSnapshot["windows"][number];
  type Position = { row: number; column: number };
  type Props = {
    source: "live" | "synthetic";
    activityOnly?: boolean;
    monitoring: CodexMonitoring;
    windows?: readonly QuotaWindow[];
    dataStatus?: LiveCodexSnapshot["dataStatus"];
    fetchedAtMs?: number | null;
    connectionStatus?: LiveCodexSnapshot["connectionStatus"];
    nowMs?: number;
  };

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

  let {
    source,
    activityOnly = false,
    monitoring,
    windows = [],
    dataStatus = "unknown",
    fetchedAtMs = null,
    connectionStatus = "disconnected",
    nowMs = Date.now(),
  }: Props = $props();
  let activityGrid = $derived(buildActivityGrid(monitoring.activity, nowMs));
  let activityRows = $derived(
    Array.from({ length: 7 }, (_, row) => activityGrid.weeks.map((week) => week[row] ?? null)),
  );
  let focusedPosition = $state<Position | null>(null);
  let firstPosition = $derived(findFirstPosition(activityRows));
  let activePosition = $derived(focusedPosition ?? firstPosition);
  let focusedCell = $derived(
    activePosition ? (activityRows[activePosition.row]?.[activePosition.column] ?? null) : null,
  );
  let lowestWindows = $derived(findLowestWindows(windows));
  let nextResetAtMs = $derived(findNextReset(windows, nowMs));
  let activitySummary = $derived(activityGrid.summary);

  function findFirstPosition(rows: (ActivityCell | null)[][]): Position | null {
    for (let row = 0; row < rows.length; row += 1) {
      const column = rows[row].findIndex((cell) => cell !== null && !cell.isPadding);
      if (column >= 0) return { row, column };
    }
    return null;
  }

  function isValidPercent(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
  }

  function findLowestWindows(items: readonly QuotaWindow[]): QuotaWindow[] {
    const valid = items.filter((window) => isValidPercent(window.remainingPercent));
    if (valid.length === 0) return [];
    const lowest = Math.min(...valid.map((window) => window.remainingPercent as number));
    return valid.filter((window) => window.remainingPercent === lowest);
  }

  function findNextReset(items: readonly QuotaWindow[], timeNow: number): number | null {
    if (!isValidTimestamp(timeNow)) return null;
    const futureResets = items
      .map((window) => window.resetAtMs)
      .filter((value): value is number => isValidTimestamp(value) && value > timeNow);
    return futureResets.length > 0 ? Math.min(...futureResets) : null;
  }

  function formatCount(value: number | null): string {
    return isNonnegativeSafeInteger(value) ? new Intl.NumberFormat().format(value) : "Not reported";
  }

  function formatPercent(value: unknown): string {
    if (!isValidPercent(value)) return "Not reported";
    return (Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)) + "%";
  }

  function formatTurnDuration(seconds: number | null): string {
    if (!isNonnegativeSafeInteger(seconds)) return "Not reported";
    if (seconds < 60) return seconds + " sec";
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    if (minutes < 60) return remainder ? minutes + " min " + remainder + " sec" : minutes + " min";
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? hours + " hr " + remainingMinutes + " min" : hours + " hr";
  }

  function formatAbsoluteTime(value: number | null): string {
    if (!isValidTimestamp(value)) return "Not reported";
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(value));
  }

  function formatElapsed(value: number | null): string {
    if (!isValidTimestamp(value) || !isValidTimestamp(nowMs)) return "Not reported";
    const ageMs = Math.max(0, nowMs - value);
    if (ageMs < 60_000) return "just now";
    const minutes = Math.floor(ageMs / 60_000);
    if (minutes < 60) return minutes + " min ago";
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + " hr ago";
    return Math.floor(hours / 24) + " days ago";
  }

  function formatReadAt(value: number | null): string {
    if (!isValidTimestamp(value)) return "No successful quota read reported";
    return formatAbsoluteTime(value) + " · " + formatElapsed(value);
  }

  function safeDecimal(value: unknown, signed = false): string | null {
    if (
      typeof value !== "string" ||
      value.length > 64 ||
      !(signed ? /^-?\d+(?:\.\d+)?$/ : /^\d+(?:\.\d+)?$/).test(value)
    )
      return null;
    return value;
  }

  function creditsSummary(value: CodexMonitoring["buckets"][number]["credits"]): string {
    if (value === null) return "Credit balance not reported";
    if (value.unlimited === true) return "Unlimited credits";
    if (value.unit !== "credits") return "Credit unit not reported";
    const balance = safeDecimal(value.balance, true);
    if (balance !== null) return balance + " provider credits";
    return value.hasCredits === false ? "No available credits reported" : "Balance not reported";
  }

  function spendingAmount(value: string | null): string {
    const amount = safeDecimal(value);
    return amount === null ? "Not reported" : amount;
  }

  function cellDescription(cell: ActivityCell | null): string {
    if (cell === null || cell.date === null) return "";
    if (cell.tokens === null) return cell.date + ": no activity data available.";
    return cell.date + ": " + new Intl.NumberFormat().format(cell.tokens) + " tokens.";
  }

  function hasActivitySummary(summary: typeof activitySummary): boolean {
    return Object.values(summary).some((value) => value !== null);
  }

  async function moveActivityFocus(event: KeyboardEvent, row: number, column: number) {
    const direction =
      event.key === "ArrowRight"
        ? { row: 0, column: 1 }
        : event.key === "ArrowLeft"
          ? { row: 0, column: -1 }
          : event.key === "ArrowDown"
            ? { row: 1, column: 0 }
            : event.key === "ArrowUp"
              ? { row: -1, column: 0 }
              : null;
    if (direction === null) return;

    let nextRow = row + direction.row;
    let nextColumn = column + direction.column;
    while (
      nextRow >= 0 &&
      nextRow < activityRows.length &&
      nextColumn >= 0 &&
      nextColumn < activityGrid.weeks.length
    ) {
      const cell = activityRows[nextRow]?.[nextColumn];
      if (cell !== null && cell !== undefined && !cell.isPadding && cell.date !== null) {
        event.preventDefault();
        focusedPosition = { row: nextRow, column: nextColumn };
        await tick();
        document
          .querySelector<HTMLButtonElement>('[data-activity-cell="' + cell.date + '"]')
          ?.focus();
        return;
      }
      nextRow += direction.row;
      nextColumn += direction.column;
    }
    event.preventDefault();
  }
</script>

<div class="codex-details" data-testid="codex-details">
  {#if !activityOnly}
    <div class="codex-details-source" class:synthetic={source === "synthetic"}>
      <strong>
        {source === "synthetic" ? "Demo preview · synthetic values" : "Codex subscription details"}
      </strong>
      <span>
        {#if source === "synthetic"}
          These examples are illustrative and do not represent a live Codex account.
        {:else if connectionStatus !== "connected"}
          Live details are unavailable. No connected Codex account is being monitored.
        {:else if dataStatus === "stale"}
          Showing the last reported quota details; the latest refresh is stale.
        {:else if dataStatus === "error"}
          The latest quota refresh failed; retained values are marked as last reported.
        {:else if dataStatus === "unknown"}
          Codex has not reported quota details in this session.
        {:else}
          Values are presented as reported by Codex.
        {/if}
      </span>
    </div>

    <section class="codex-detail-section" aria-labelledby="quota-windows-title">
      <div class="codex-detail-heading">
        <h2 id="quota-windows-title">Quota windows</h2>
        <span class="detail-status" class:stale={dataStatus === "stale"}>
          {source === "synthetic" ? "Demo" : dataStatus}
        </span>
      </div>
      {#if fetchedAtMs !== null}
        <p class="codex-detail-caption">
          {source === "synthetic" ? "Sample time" : "Last successful quota read"} ·
          {formatReadAt(fetchedAtMs)}
        </p>
      {/if}

      {#if windows.length > 0}
        <div class="codex-detail-list">
          {#each windows as window (window.id)}
            <article class="codex-detail-row">
              <div class="codex-detail-row-heading">
                <strong>{window.name}</strong>
                <span>{formatPercent(window.remainingPercent)} remaining</span>
              </div>
              <p>
                Duration · {window.windowDurationMins === null ||
                !Number.isFinite(window.windowDurationMins)
                  ? "Not reported"
                  : window.windowDurationMins + " min"}
                <span aria-hidden="true"> · </span>
                Reset · {formatAbsoluteTime(window.resetAtMs)}
              </p>
            </article>
          {/each}
        </div>
        <div class="codex-insight-list">
          <p>
            <strong>Lowest reported remaining</strong>
            {#if lowestWindows.length > 0}
              {#each lowestWindows as window, index (window.id)}
                {#if index > 0}<span aria-hidden="true">, </span>{/if}
                <span>{window.name} ({formatPercent(window.remainingPercent)})</span>
              {/each}
            {:else}
              Not reported
            {/if}
          </p>
          <p><strong>Reported next reset</strong> {formatAbsoluteTime(nextResetAtMs)}</p>
        </div>
        {#if dataStatus === "stale" || dataStatus === "error"}
          <p class="codex-detail-caption">
            These values may have changed since the last successful read.
          </p>
        {/if}
      {:else}
        <p class="codex-detail-empty">
          {source === "synthetic"
            ? "No quota windows are included in this preview."
            : "Quota windows are unavailable; no values are estimated."}
        </p>
      {/if}
    </section>

    <section class="codex-detail-section" aria-labelledby="funding-title">
      <div class="codex-detail-heading">
        <h2 id="funding-title">Credits and spending controls</h2>
        {#if dataStatus === "stale" || dataStatus === "error"}<span class="detail-status stale"
            >Stale · last reported</span
          >{/if}
      </div>
      {#if monitoring.buckets.length > 0}
        <div class="codex-detail-list">
          {#each monitoring.buckets as bucket, index ("bucket-" + index)}
            <article class="codex-detail-row">
              <strong>{bucket.label || "Quota bucket"}</strong>
              <div class="codex-funding-grid">
                <div>
                  <span class="codex-detail-label">Credit balance</span>
                  <span class="codex-detail-value">{creditsSummary(bucket.credits)}</span>
                </div>
                <div>
                  <span class="codex-detail-label">Spending control</span>
                  {#if bucket.spending === null}
                    <span class="codex-detail-value">Not reported</span>
                  {:else}
                    <span class="codex-detail-value">
                      Limit {spendingAmount(bucket.spending.limit)} · Used
                      {spendingAmount(bucket.spending.used)}
                    </span>
                    <span class="codex-detail-caption">
                      {bucket.spending.unit === null
                        ? "Unit/currency not reported · no currency inferred"
                        : "Unit not recognized · no currency inferred"}
                      · remaining {formatPercent(bucket.spending.remainingPercent)}
                    </span>
                    <span class="codex-detail-caption">
                      Reset · {formatAbsoluteTime(bucket.spending.resetAtMs)}
                    </span>
                  {/if}
                </div>
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <p class="codex-detail-empty">
          {source === "synthetic"
            ? "No credit or spending examples are included in this preview."
            : "Credits and spending controls are unavailable until Codex reports them."}
        </p>
      {/if}
    </section>

    <section class="codex-detail-section" aria-labelledby="earned-resets-title">
      <div class="codex-detail-heading">
        <h2 id="earned-resets-title">Earned reset credits</h2>
        {#if dataStatus === "stale" || dataStatus === "error"}<span class="detail-status stale"
            >Stale · last reported</span
          >{/if}
      </div>
      {#if monitoring.earnedResets === null}
        <p class="codex-detail-empty">Reset credit availability and expiry are not reported.</p>
      {:else}
        <p class="codex-reset-count">
          <strong>Available</strong>
          {formatCount(monitoring.earnedResets.availableCount)}
        </p>
        {#if monitoring.earnedResets.details === null || monitoring.earnedResets.details.length === 0}
          <p class="codex-detail-empty">No per-credit expiry details were reported.</p>
        {:else}
          <div class="codex-detail-list">
            {#each monitoring.earnedResets.details as detail, index ("reset-" + index)}
              <article class="codex-detail-row">
                <div class="codex-detail-row-heading">
                  <strong>Reset credit {index + 1}</strong>
                  <span class="reset-status">{detail.status}</span>
                </div>
                <p>Granted · {formatAbsoluteTime(detail.grantedAtMs)}</p>
                <p>Expires · {formatAbsoluteTime(detail.expiresAtMs)}</p>
              </article>
            {/each}
          </div>
        {/if}
        <p class="codex-detail-caption">
          Status and expiry only. Quotafern cannot redeem reset credits.
        </p>
      {/if}
    </section>
  {/if}
  <section class="codex-detail-section activity-section" aria-labelledby="activity-title">
    <div class="codex-detail-heading">
      <h2 id="activity-title">Activity</h2>
      <span class="detail-status" class:stale={activityGrid.state === "stale"}>
        {activityGrid.state}
      </span>
    </div>
    <p class="codex-detail-caption">
      {source === "synthetic"
        ? "Synthetic 84-day activity preview"
        : "Provider-reported daily token usage"}
    </p>

    {#if activityGrid.state === "unavailable"}
      <div class="codex-activity-unavailable" role="status">
        <strong>Activity unavailable</strong>
        <p>
          {source === "synthetic"
            ? "This preview contains no activity fixture."
            : "Codex did not provide daily activity buckets. Quota monitoring remains separate."}
        </p>
      </div>
    {:else}
      {#if activityGrid.state === "stale"}
        <div class="state-banner stale-banner activity-state-banner" role="status">
          <Clock3 size={14} aria-hidden="true" />
          <span
            >Showing the last activity report from {formatReadAt(activityGrid.fetchedAtMs)}.</span
          >
        </div>
      {:else if activityGrid.state === "error"}
        <div class="state-banner error-banner activity-state-banner" role="status">
          <CircleHelp size={14} aria-hidden="true" />
          <span
            >Activity could not be refreshed. Any displayed days are from the returned report.</span
          >
        </div>
      {/if}

      {#if !activityGrid.hasBuckets}
        <p class="codex-detail-empty">
          No daily usage buckets were returned; dates remain unknown.
        </p>
      {/if}
      {#if activityGrid.weeks.length > 0}
        <p class="codex-detail-caption activity-range">
          {activityGrid.startDate} – {activityGrid.endDate} · UTC calendar days
        </p>
        <div class="activity-heatmap-scroll" role="region" aria-label="Scrollable activity heatmap">
          <div
            class="activity-heatmap-grid"
            role="grid"
            aria-label={"Daily Codex token usage for the last " +
              ACTIVITY_RANGE_DAYS +
              " days. Use arrow keys to inspect dates."}
            aria-rowcount="7"
            aria-colcount={activityGrid.weeks.length + 1}
            style={"--activity-week-count: " + activityGrid.weeks.length}
            data-testid="codex-activity-heatmap"
          >
            {#each activityRows as row, rowIndex (rowIndex)}
              <div class="activity-heatmap-row" role="row" aria-rowindex={rowIndex + 1}>
                <span class="activity-weekday" role="rowheader" aria-colindex="1"
                  >{DAY_LABELS[rowIndex]}</span
                >
                {#each row as cell, columnIndex (rowIndex + "-" + columnIndex)}
                  {#if cell === null || cell.isPadding || cell.date === null}
                    <span class="activity-cell activity-cell-padding" role="presentation"></span>
                  {:else}
                    {@const description = cellDescription(cell)}
                    <button
                      class={"activity-cell " +
                        (cell.intensity === null ? "unknown" : "level-" + cell.intensity)}
                      type="button"
                      role="gridcell"
                      aria-rowindex={rowIndex + 1}
                      aria-colindex={columnIndex + 2}
                      aria-label={description}
                      title={description}
                      tabindex={activePosition?.row === rowIndex &&
                      activePosition?.column === columnIndex
                        ? 0
                        : -1}
                      data-activity-cell={cell.date}
                      onfocus={() => (focusedPosition = { row: rowIndex, column: columnIndex })}
                      onkeydown={(event) => void moveActivityFocus(event, rowIndex, columnIndex)}
                    ></button>
                  {/if}
                {/each}
              </div>
            {/each}
          </div>
        </div>
        <div class="activity-legend" aria-label="Activity intensity legend">
          <span>No data</span>
          <span class="activity-cell unknown" aria-hidden="true"></span>
          <span>0</span>
          <span class="activity-cell level-0" aria-hidden="true"></span>
          <span class="activity-cell level-1" aria-hidden="true"></span>
          <span class="activity-cell level-2" aria-hidden="true"></span>
          <span class="activity-cell level-3" aria-hidden="true"></span>
          <span class="activity-cell level-4" aria-hidden="true"></span>
          <span>More</span>
        </div>
        {#if focusedPosition && focusedCell}
          <p class="activity-focus-detail" aria-live="polite">{cellDescription(focusedCell)}</p>
        {:else}
          <p class="activity-focus-detail">Focus a date to read its exact token count.</p>
        {/if}
      {:else if activityGrid.hasBuckets}
        <p class="codex-detail-empty">A valid activity date range is unavailable.</p>
      {/if}
      {#if activityGrid.fetchedAtMs !== null}
        <p class="codex-detail-caption">
          Last successful activity read · {formatReadAt(activityGrid.fetchedAtMs)}
        </p>
      {/if}
    {/if}

    {#if hasActivitySummary(activitySummary)}
      <h3 class="activity-summary-heading">Reported activity summary</h3>
      <dl class="activity-summary-grid">
        {#if activitySummary.lifetimeTokens !== null}
          <div>
            <dt>Lifetime tokens</dt>
            <dd>{formatCount(activitySummary.lifetimeTokens)}</dd>
          </div>
        {/if}
        {#if activitySummary.peakDailyTokens !== null}
          <div>
            <dt>Peak daily tokens</dt>
            <dd>{formatCount(activitySummary.peakDailyTokens)}</dd>
          </div>
        {/if}
        {#if activitySummary.currentStreakDays !== null}
          <div>
            <dt>Current streak</dt>
            <dd>{formatCount(activitySummary.currentStreakDays)} days</dd>
          </div>
        {/if}
        {#if activitySummary.longestStreakDays !== null}
          <div>
            <dt>Longest streak</dt>
            <dd>{formatCount(activitySummary.longestStreakDays)} days</dd>
          </div>
        {/if}
        {#if activitySummary.longestRunningTurnSec !== null}
          <div>
            <dt>Longest running turn</dt>
            <dd>{formatTurnDuration(activitySummary.longestRunningTurnSec)}</dd>
          </div>
        {/if}
      </dl>
      <p class="codex-detail-caption">
        Metrics are displayed as reported and are not derived from sparse daily buckets.
      </p>
    {:else}
      <p class="codex-detail-empty">Activity summary metrics are not reported.</p>
    {/if}
  </section>
</div>
