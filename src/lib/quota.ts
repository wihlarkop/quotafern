export type ProviderId = "codex" | "claude-code" | "gemini-cli";

export type QuotaBand = "normal" | "low" | "critical" | "unknown";

export type ConnectionStatus = "not-connected" | "auth-required";
export type DataStatus = "current" | "stale" | "unknown" | "error";

export type DemoScenario =
  | "healthy"
  | "low"
  | "critical"
  | "unknown"
  | "stale"
  | "auth"
  | "error"
  | "empty";

export interface QuotaWindowSnapshot {
  id: string;
  name: string;
  remainingPercent: number | null;
  resetAt: string | null;
}

export interface ProviderSnapshot {
  id: ProviderId;
  name: string;
  tool: string;
  accountId: string;
  connectionStatus: ConnectionStatus;
  dataStatus: DataStatus;
  fetchedAt: string | null;
  windows: QuotaWindowSnapshot[];
}

/** Frontend-only presentation shape. It is not a native snapshot or a live provider contract. */
export interface QuotaSnapshot {
  scenario: DemoScenario;
  providers: ProviderSnapshot[];
}

export const DEMO_SCENARIOS: readonly { value: DemoScenario; label: string }[] = [
  { value: "healthy", label: "Healthy usage" },
  { value: "low", label: "Low usage" },
  { value: "critical", label: "Critical usage" },
  { value: "unknown", label: "Unknown usage" },
  { value: "stale", label: "Stale sample" },
  { value: "auth", label: "Sign-in required" },
  { value: "error", label: "Refresh error" },
  { value: "empty", label: "No accounts" },
];

const PROVIDERS: readonly Omit<
  ProviderSnapshot,
  "connectionStatus" | "dataStatus" | "fetchedAt" | "windows"
>[] = [
  { id: "codex", name: "Codex", tool: "CLI", accountId: "demo-codex-profile" },
  { id: "claude-code", name: "Claude Code", tool: "CLI", accountId: "demo-claude-code-profile" },
  { id: "gemini-cli", name: "Gemini CLI", tool: "CLI", accountId: "demo-gemini-cli-profile" },
];

const SAMPLE_VALUES: Record<DemoScenario, readonly (readonly (number | null)[])[]> = {
  healthy: [
    [82, 71],
    [57, 64],
    [39, 44],
  ],
  low: [
    [22, 18],
    [17, 14],
    [14, 9],
  ],
  critical: [
    [8, 3],
    [4, 7],
    [2.5, 1],
  ],
  unknown: [
    [null, null],
    [null, null],
    [null, null],
  ],
  stale: [
    [64, 51],
    [31, 27],
    [12.5, 11],
  ],
  auth: [
    [null, null],
    [null, null],
    [null, null],
  ],
  error: [
    [null, null],
    [null, null],
    [null, null],
  ],
  empty: [],
};

const WINDOW_NAMES: Record<ProviderId, readonly string[]> = {
  codex: ["Session", "Weekly"],
  "claude-code": ["Session", "Weekly"],
  "gemini-cli": ["Daily", "Monthly"],
};

const RESET_OFFSETS_MINUTES: Record<ProviderId, readonly number[]> = {
  codex: [200, 2 * 24 * 60 + 80],
  "claude-code": [245, 3 * 24 * 60 + 30],
  "gemini-cli": [24 * 60 + 35, 10 * 24 * 60],
};

export function classifyRemainingPercent(value: number | null): QuotaBand {
  if (value === null || !Number.isFinite(value) || value < 0 || value > 100) return "unknown";
  if (value < 10) return "critical";
  if (value <= 25) return "low";
  return "normal";
}

export function formatRemainingPercent(value: number | null): string {
  if (value === null || classifyRemainingPercent(value) === "unknown") return "Not available";
  const precision = Number.isInteger(value) ? 0 : 1;
  return `${value.toFixed(precision)}%`;
}

export function createDemoSnapshot(scenario: DemoScenario): QuotaSnapshot {
  const values = SAMPLE_VALUES[scenario];
  const fetchedAt = new Date(Date.now() - (scenario === "stale" ? 45 * 60_000 : 0)).toISOString();
  const connectionStatus: ConnectionStatus =
    scenario === "auth" ? "auth-required" : "not-connected";
  const dataStatus: DataStatus =
    scenario === "stale"
      ? "stale"
      : scenario === "unknown" || scenario === "auth"
        ? "unknown"
        : scenario === "error"
          ? "error"
          : "current";

  return {
    scenario,
    providers: PROVIDERS.slice(0, values.length).map((provider, index) => ({
      ...provider,
      connectionStatus,
      dataStatus,
      fetchedAt,
      windows: values[index].map((remainingPercent, windowIndex) => ({
        id: `${provider.id}-${windowIndex}`,
        name: WINDOW_NAMES[provider.id][windowIndex],
        remainingPercent,
        resetAt:
          remainingPercent === null
            ? null
            : new Date(
                Date.now() + RESET_OFFSETS_MINUTES[provider.id][windowIndex] * 60_000,
              ).toISOString(),
      })),
    })),
  };
}
