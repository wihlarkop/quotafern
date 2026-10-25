import { unavailableCodexMonitoring, type CodexMonitoring } from "../codex";
import { PROVIDERS, type QuotaSource } from "./model";
import type { accountsView } from "./views";

export type ProviderView = ReturnType<typeof accountsView>[number];
export const providerName = (id: string) => PROVIDERS.find((p) => p.id === id)?.displayName ?? id;

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
