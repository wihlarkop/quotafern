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
  };
}

/** Age presentation without making provider requests or changing consent. */
export function ageCodexSnapshot(
  snapshot: LiveCodexSnapshot,
  nowMs: number = Date.now(),
): LiveCodexSnapshot {
  if (
    snapshot.dataStatus === "current" &&
    (snapshot.fetchedAtMs === null ||
      !Number.isFinite(snapshot.fetchedAtMs) ||
      snapshot.fetchedAtMs > nowMs ||
      nowMs - snapshot.fetchedAtMs >= CODEX_FRESHNESS_MS)
  ) {
    return { ...snapshot, dataStatus: "stale" };
  }
  return snapshot;
}

export function codexMessage(snapshot: LiveCodexSnapshot): string {
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
