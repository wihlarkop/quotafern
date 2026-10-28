import { unavailableCodexMonitoring, type CodexMonitoring } from "../codex";
import type { DirectPresentation, DirectTarget } from "./direct";
import type { ManagementTarget } from "./local";
import { PROVIDERS, type QuotaSource } from "./model";
import type { accountsView } from "./views";

export type ProviderView = ReturnType<typeof accountsView>[number];
export type AccountView = ProviderView["accounts"][number];
export type ConnectionView = AccountView["connections"][number];
export type AccountAction = {
  label: string;
  target: ManagementTarget | DirectTarget;
  disabled?: boolean;
};
export const providerName = (id: string) => PROVIDERS.find((p) => p.id === id)?.displayName ?? id;

export function connectionStatus(
  connection: ConnectionView,
  presentation?: DirectPresentation,
): string {
  // A paused refresh does not necessarily end the monitoring session.
  if (connection.runtime.lifecycle === "connected") return "Connected";
  if (
    presentation?.cleanupPending &&
    !presentation.busy &&
    connection.runtime.lifecycle === "disconnected"
  )
    return "Cleanup pending";
  if (connection.runtime.lifecycle === "auth-required") return "Sign-in needed";
  if (presentation?.status) return presentation.status;
  return {
    connected: "Connected",
    disconnected: "Disconnected",
    connecting: "Connecting",
    "auth-required": "Sign-in needed",
    error: "Reconnect required",
  }[connection.runtime.lifecycle];
}

/** Presentation only; the native controller independently enforces permission. */
export function connectionActions(
  connection: ConnectionView,
  presentation?: DirectPresentation,
): AccountAction[] {
  const connected = connection.runtime.lifecycle === "connected";
  const managed = connection.mechanism === "codex-managed";
  const reconnect =
    presentation?.status === "Reconnect required" || connection.runtime.lifecycle === "error";
  const direct = (
    label: string,
    action: DirectTarget["action"],
    disabled = false,
  ): AccountAction => ({
    label,
    target: { kind: "direct", id: connection.connectionId, action },
    disabled,
  });
  return [
    ...(!connected
      ? [
          direct(
            managed && connection.runtime.lifecycle === "auth-required"
              ? "Sign in again"
              : reconnect
                ? "Reconnect"
                : "Connect",
            managed && connection.runtime.lifecycle === "auth-required" ? "login" : "connect",
            presentation?.busy,
          ),
        ]
      : []),
    ...(connected ? [direct("Refresh", "refresh", presentation?.busy)] : []),
    ...(managed && connection.runtime.lifecycle !== "auth-required"
      ? [direct("Sign in again", "login", presentation?.busy)]
      : []),
    ...(connected || presentation?.cleanupPending || presentation?.busy
      ? [direct("Disconnect", "disconnect")]
      : []),
  ];
}

export function quotaDuration(minutes: number): string {
  if (minutes === 0) return "0 minutes";
  if (minutes % 1440 === 0) return `${minutes / 1440} ${minutes === 1440 ? "day" : "days"}`;
  if (minutes % 60 === 0) return `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}`;
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/** Duplicate aliases are disambiguated for display only. Routing always uses opaque IDs. */
export function contextualAlias<T extends { alias: string }>(
  items: readonly T[],
  index: number,
  kind: "account" | "connection",
): string {
  const item = items[index];
  return items.filter((a) => a.alias === item.alias).length > 1
    ? `${item.alias} · ${kind} ${index + 1}`
    : item.alias;
}

export function sampleTime(at: number | null): string {
  return at === null
    ? "Unknown"
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(at);
}

/** Only this source's daily buckets reach the incumbent activity renderer. No inferred summaries. */
export function activityMonitoring(source: QuotaSource): CodexMonitoring {
  const monitoring = unavailableCodexMonitoring();
  if (source.data.activity === null) return monitoring;
  monitoring.activity = {
    ...monitoring.activity,
    state:
      source.freshness === "current" ? "current" : source.freshness === "stale" ? "stale" : "error",
    fetchedAtMs: source.fetchedAtMs,
    dailyBuckets: structuredClone(source.data.activity),
  };
  return monitoring;
}
