export interface CodexActivity {
  state: "unavailable" | "current" | "stale" | "error";
  summary: {
    lifetimeTokens: number | null;
    peakDailyTokens: number | null;
    currentStreakDays: number | null;
    longestStreakDays: number | null;
    longestRunningTurnSec: number | null;
  };
  dailyBuckets: { date: string; tokens: number | null }[] | null;
  fetchedAtMs: number | null;
  diagnostic: string | null;
}

export interface CodexMonitoring {
  buckets: {
    label: string;
    credits: {
      hasCredits: boolean | null;
      unlimited: boolean | null;
      balance: string | null;
      unit: "credits";
    } | null;
    spending: {
      limit: string | null;
      used: string | null;
      remainingPercent: number | null;
      resetAtMs: number | null;
      unit: null;
    } | null;
  }[];
  earnedResets: {
    availableCount: number | null;
    details:
      | {
          status: "available" | "redeeming" | "redeemed" | "unknown";
          grantedAtMs: number | null;
          expiresAtMs: number | null;
        }[]
      | null;
  } | null;
  activity: CodexActivity;
}

export function unavailableCodexMonitoring(): CodexMonitoring {
  return {
    buckets: [],
    earnedResets: null,
    activity: {
      state: "unavailable",
      summary: {
        lifetimeTokens: null,
        peakDailyTokens: null,
        currentStreakDays: null,
        longestStreakDays: null,
        longestRunningTurnSec: null,
      },
      dailyBuckets: null,
      fetchedAtMs: null,
      diagnostic: null,
    },
  };
}

/** Sanitized native presentation contract. No account identity or raw protocol fields. */
export interface LiveCodexSnapshot {
  source: "live";
  providerId: "codex";
  displayLabel: "Codex";
  connectionStatus:
    | "disconnected"
    | "connected"
    | "unavailable"
    | "auth-required"
    | "unsupported"
    | "incompatible"
    | "error";
  dataStatus: "current" | "stale" | "unknown" | "error";
  windows: {
    id: string;
    name: string;
    remainingPercent: number | null;
    resetAtMs: number | null;
    windowDurationMins: number | null;
  }[];
  fetchedAtMs: number | null;
  diagnostic: string | null;
  monitoring: CodexMonitoring;
}

export const CODEX_FRESHNESS_MS = 5 * 60_000;
// A source change and fresh security review are required to lift this gate.
// No runtime setting, persisted consent, or environment variable enables it.
export const CODEX_CONNECTION_AVAILABLE = false;

export function disconnectedCodexSnapshot(): LiveCodexSnapshot {
  return {
    source: "live",
    providerId: "codex",
    displayLabel: "Codex",
    connectionStatus: "disconnected",
    dataStatus: "unknown",
    windows: [],
    fetchedAtMs: null,
    diagnostic: null,
    monitoring: unavailableCodexMonitoring(),
  };
}

/** Age presentation without making provider requests or changing consent. */
export function ageCodexSnapshot(
  snapshot: LiveCodexSnapshot,
  nowMs: number = Date.now(),
): LiveCodexSnapshot {
  const expired = (at: number | null) =>
    at === null || !Number.isFinite(at) || at > nowMs || nowMs - at >= CODEX_FRESHNESS_MS;
  const quotaStale = snapshot.dataStatus === "current" && expired(snapshot.fetchedAtMs);
  const activity = snapshot.monitoring.activity;
  const activityStale = activity.state === "current" && expired(activity.fetchedAtMs);
  if (!quotaStale && !activityStale) return snapshot;
  return {
    ...snapshot,
    dataStatus: quotaStale ? "stale" : snapshot.dataStatus,
    monitoring: activityStale
      ? { ...snapshot.monitoring, activity: { ...activity, state: "stale" } }
      : snapshot.monitoring,
  };
}

export function codexMessage(snapshot: LiveCodexSnapshot): string {
  if (snapshot.diagnostic === "nativeConsentPending")
    return "A native confirmation is already open or monitoring is active. Finish that interaction or disconnect before connecting again.";
  if (snapshot.diagnostic === "nativeConsentCancelled")
    return "Native confirmation was cancelled or invalidated. No new monitoring session was authorized.";
  if (snapshot.diagnostic === "startupPolicyUnverified")
    return "Live connection is disabled: Codex app-server may enable saved Remote Control. A documented startup policy is required before connection can be enabled.";
  switch (snapshot.connectionStatus) {
    case "disconnected":
      return "Connect an existing Codex session in Accounts to read subscription limits.";
    case "unavailable":
      return "A native Codex executable is required on PATH. Shell-only installations are unsupported; install the native CLI and restart Quotafern.";
    case "auth-required":
      return "Sign in to Codex CLI independently, then connect again. Quotafern does not sign you in.";
    case "unsupported":
      return "This Codex authentication mode does not provide a ChatGPT subscription allowance. API-key usage is separate.";
    case "incompatible":
      return "This Codex app-server is incompatible. Install a supported native CLI version and reconnect.";
    case "error":
      return "Codex monitoring stopped after a connection failure. Reconnect in Accounts when ready.";
    case "connected":
      if (snapshot.dataStatus === "stale")
        return "Last known quota is stale. Refresh manually to check for updated limits.";
      if (snapshot.dataStatus === "unknown")
        return "Codex did not report valid quota for every window. Unknown values are not estimated.";
      if (snapshot.dataStatus === "error")
        return "Quota could not be refreshed. Try again after the refresh cooldown.";
      return "Subscription limits reported by Codex. Refresh is manual; values age after five minutes.";
  }
}
