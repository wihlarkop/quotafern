import { invoke, isTauri } from "@tauri-apps/api/core";

import { CODEX_FRESHNESS_MS } from "../codex";
import {
  createLocalId,
  isLocalId,
  validateAlias,
  type AccountState,
  type ConnectionId,
  type QuotaSource,
} from "./model";
import { beginAuthorizedSession, disconnect, failConnection, publishSource } from "./state";

// Presentation only. Rust independently blocks provider access outside accepted Windows builds.
export function codexDirectPlatformSupported(platform: string): boolean {
  return platform === "Win32" || platform === "Win64";
}
export const CODEX_DIRECT_CONNECTION_AVAILABLE =
  typeof navigator !== "undefined" && codexDirectPlatformSupported(navigator.platform);
const CODEX_DIRECT_REFRESH_MS = 3 * 60_000;
export type DirectKind = "system" | "managed";
export type DirectTarget = { kind: "direct"; id: ConnectionId; action: DirectAction };
export type DirectAction = "connect" | "login" | "refresh" | "disconnect" | "resume";
export interface DirectSnapshot {
  accountId: string;
  connectionId: string;
  generation: number;
  connectionStatus:
    | "disconnected"
    | "connected"
    | "auth-required"
    | "error"
    | "unavailable"
    | "unsupported"
    | "incompatible";
  dataStatus: "current" | "stale" | "unknown" | "error";
  windows: {
    id: string;
    name: string;
    remainingPercent: number | null;
    resetAtMs: number | null;
    windowDurationMins: number | null;
  }[];
  plan: "Free" | "Go" | "Plus" | "Pro" | null;
  credits: { balance: string | null; unlimited: boolean | null } | null;
  fetchedAtMs: number | null;
  diagnostic: string | null;
}
export interface DirectPresentation {
  busy: boolean;
  message: string;
  cleanupPending: boolean;
  status?: "Connecting" | "Reconnect required";
}
export const directKind = (mechanism: string): DirectKind | null =>
  mechanism === "cli-session" ? "system" : mechanism === "codex-managed" ? "managed" : null;
const nullableNumber = (value: unknown) =>
  value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
const decimal = (value: unknown) =>
  value === null ||
  (typeof value === "string" && /^(0|[1-9][0-9]{0,29})(\.[0-9]{1,12})?$/.test(value));
/** Validate IPC as untrusted presentation input, including exact opaque ownership. */
export function validDirectSnapshot(
  value: unknown,
  accountId: string,
  connectionId: string,
): value is DirectSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as DirectSnapshot;
  return (
    v.accountId === accountId &&
    v.connectionId === connectionId &&
    isLocalId(v.accountId, "account") &&
    isLocalId(v.connectionId, "connection") &&
    Number.isSafeInteger(v.generation) &&
    v.generation >= 0 &&
    [
      "disconnected",
      "connected",
      "auth-required",
      "error",
      "unavailable",
      "unsupported",
      "incompatible",
    ].includes(v.connectionStatus) &&
    ["current", "stale", "unknown", "error"].includes(v.dataStatus) &&
    nullableNumber(v.fetchedAtMs) &&
    (v.dataStatus !== "current" || v.fetchedAtMs !== null) &&
    [null, "Free", "Go", "Plus", "Pro"].includes(v.plan) &&
    (v.credits === null ||
      (typeof v.credits === "object" &&
        decimal(v.credits.balance) &&
        (v.credits.unlimited === null || typeof v.credits.unlimited === "boolean"))) &&
    (v.diagnostic === null || (typeof v.diagnostic === "string" && v.diagnostic.length <= 160)) &&
    Array.isArray(v.windows) &&
    v.windows.length <= 16 &&
    new Set(v.windows.map((w) => w?.id)).size === v.windows.length &&
    v.windows.every(
      (w) =>
        w &&
        typeof w.id === "string" &&
        w.id.length > 0 &&
        w.id.length <= 80 &&
        validateAlias(w.name) === w.name &&
        nullableNumber(w.remainingPercent) &&
        (w.remainingPercent === null || w.remainingPercent <= 100) &&
        nullableNumber(w.resetAtMs) &&
        nullableNumber(w.windowDurationMins),
    )
  );
}
/** Native verified association is scoped to this connection, never inferred from aliases. */
export function directSource(
  snapshot: DirectSnapshot,
  state: AccountState,
  id: ConnectionId,
  generation: number,
): QuotaSource {
  const connection = state.metadata.connections.find((c) => c.id === id);
  if (
    !connection ||
    !state.metadata.accounts.some(
      (a) => a.id === connection.accountId && a.providerId === "codex",
    ) ||
    !directKind(connection.mechanism) ||
    !validDirectSnapshot(snapshot, connection.accountId, id)
  )
    throw new Error("Invalid direct source ownership");
  return {
    id: `source_${id.slice("connection_".length)}`,
    providerId: "codex",
    accountId: connection.accountId,
    workspaceId: connection.workspaceId,
    association: { kind: "verified", connectionIds: [id] },
    connectionGenerations: { [id]: generation },
    origin: "live",
    authority: "authorized-provider-read",
    freshness: snapshot.dataStatus,
    fetchedAtMs: snapshot.fetchedAtMs,
    staleAfterMs: CODEX_FRESHNESS_MS,
    data: {
      subscription: snapshot.windows
        .filter(
          (w) =>
            w.remainingPercent !== null || w.resetAtMs !== null || w.windowDurationMins !== null,
        )
        .map((w) => ({
          id: createLocalId("window"),
          label: w.name,
          remainingPercent: w.remainingPercent,
          resetAtMs: w.resetAtMs,
          durationMins: w.windowDurationMins,
        })),
      ...(snapshot.plan === null ? {} : { plan: snapshot.plan }),
      credits:
        snapshot.credits &&
        (snapshot.credits.balance !== null || snapshot.credits.unlimited === true)
          ? { ...snapshot.credits, unit: "provider-credits" }
          : null,
      apiMetering: null,
      spending: null,
      entitlements: null,
      activity: null,
    },
  };
}
// Diagnostic labels are source-defined only; never render arbitrary native exceptions.
const directDiagnostics = new Set([
  "directAccountAlreadyConnected",
  "directAuthenticationRequired",
  "directAuthorizationStorageUnsafe",
  "directRememberedConsentRequired",
  "directAuthInvalid",
  "directAuthPathUnsafe",
  "directManagedProfileUnsafe",
  "directManagedRootUnsafe",
  "directManagedHomesUnsafe",
  "directManagedAccountHomeUnsafe",
  "directCredentialDirectoryUnsafe",
  "directCredentialFileUnsafe",
  "directConfigFileUnsafe",
  "directRpcStartupFailed",
  "directRpcRemoteControlUnsafe",
  "directRpcNetworkAuditFailed",
  "directRpcCleanupFailed",
  "directRpcEndpointUnsafe",
  "directRpcPeerUnsafe",
  "directRpcVersionUnsupported",
  "directRpcProtocolRejected",
  "directRpcProviderFailed",
  "directRpcIdentityUnavailable",
  "directAuthReadFailed",
  "directAuthUnsupported",
  "directBridgeShuttingDown",
  "directBridgeUnavailable",
  "directCleanupFailed",
  "directConnectionBindingMismatch",
  "directConnectionLimit",
  "directConsentUnavailable",
  "directCooldownLimit",
  "directGenerationExhausted",
  "directIdentityChanged",
  "directInvalidLocalId",
  "directInvalidQuotaValue",
  "directLoginFailed",
  "directLoginManagedOnly",
  "directLoginUnavailable",
  "directMainWindowOnly",
  "directNativeConsentRequired",
  "directNetworkFailed",
  "directNotConnected",
  "directOperationCancelled",
  "directOperationInProgress",
  "directOwnerAcceptancePending",
  "directQuotaUnavailable",
  "directRateLimited",
  "directRedirectRefused",
  "directRefreshCooldown",
  "directRequestTimedOut",
  "directResponseTooLarge",
  "directSchemaIncompatible",
  "directServiceUnavailable",
  "directSystemAlreadyConnected",
  "directUnsupportedLauncher",
  "nativeConsentCancelled",
]);
function safeDirectDiagnostic(value: unknown): string {
  return typeof value === "string" && directDiagnostics.has(value) ? value : "unknown";
}
function diagnosticSuffix(value: unknown): string {
  const category = safeDirectDiagnostic(value);
  return category === "unknown" ? "" : ` [${category}]`;
}
export function directMessage(snapshot: DirectSnapshot): string {
  if (snapshot.diagnostic === "directOwnerAcceptancePending")
    return "Live Codex monitoring is available on Windows. Native acceptance for this platform is pending.";
  if (snapshot.diagnostic === "directConsentUnavailable")
    return "Connection confirmation could not be completed safely. Close any confirmation window, then choose Connect again.";
  if (snapshot.diagnostic === "directRememberedConsentRequired")
    return "Reconnect required. Connect again to review permission.";
  if (snapshot.diagnostic === "directAuthorizationStorageUnsafe")
    return "Reconnect required. Saved monitoring permission could not be verified.";
  if (
    [
      "directRpcStartupFailed",
      "directRpcRemoteControlUnsafe",
      "directRpcNetworkAuditFailed",
      "directRpcCleanupFailed",
    ].includes(snapshot.diagnostic ?? "")
  )
    return "Codex startup safety checks did not pass. Quota access was blocked. Report the diagnostic category for review.";
  if (snapshot.diagnostic === "directRpcVersionUnsupported")
    return "This Codex program does not match the reviewed monitoring version. Quota access was blocked; your Codex sign-in is unchanged.";
  if (["directRpcEndpointUnsafe", "directRpcPeerUnsafe"].includes(snapshot.diagnostic ?? ""))
    return "The existing Codex local service could not be verified. Monitoring was blocked; system sign-in and permissions are unchanged.";
  if (
    ["directRpcProtocolRejected", "directRpcIdentityUnavailable"].includes(
      snapshot.diagnostic ?? "",
    )
  )
    return "The existing Codex local service returned an unsupported response. Monitoring was blocked.";
  if (snapshot.diagnostic === "directRpcProviderFailed")
    return "Codex could not fetch server quota. Try again later.";
  if (
    [
      "directAuthPathUnsafe",
      "directCredentialDirectoryUnsafe",
      "directCredentialFileUnsafe",
      "directConfigFileUnsafe",
      "directManagedProfileUnsafe",
      "directManagedRootUnsafe",
      "directManagedHomesUnsafe",
      "directManagedAccountHomeUnsafe",
    ].includes(snapshot.diagnostic ?? "")
  )
    return "Selected Codex storage did not pass privacy checks. Monitoring was blocked; permissions and system sign-in are unchanged.";
  if (snapshot.diagnostic === "directUnsupportedLauncher")
    return "A native codex.exe is required on PATH. Shell launchers (.cmd, .bat, .ps1) are unsupported. Install the native Codex CLI and restart Quotafern.";
  switch (snapshot.connectionStatus) {
    case "connected":
      return snapshot.dataStatus === "error"
        ? "Usage could not be refreshed. Try again later."
        : snapshot.dataStatus === "stale"
          ? "Showing the last reported usage."
          : snapshot.dataStatus === "unknown"
            ? "Connected. Codex has not reported usage limits."
            : "Connected. Usage refreshes every three minutes.";
    case "auth-required":
      return "Sign-in is needed. Reconnect your existing Codex account, or sign in to a separate account.";
    case "unavailable":
      return "Codex is unavailable on this device.";
    case "unsupported":
      return "This account does not provide supported subscription usage.";
    case "incompatible":
      return "This Codex version is not supported.";
    case "disconnected":
      return snapshot.diagnostic === "nativeConsentCancelled"
        ? "Connection cancelled. No session was authorized."
        : "Disconnected. Your Codex sign-in is unchanged.";
    case "error":
      return "Codex could not read usage. Disconnect, then try connecting again.";
  }
}
type NativePort = (command: string, args: Record<string, unknown>) => Promise<unknown>;
/** Ephemeral adapter projection; the local store remains the only metadata writer. */
export function createDirectController(
  initial: AccountState,
  changed: (
    state: AccountState,
    presentation: Partial<Record<ConnectionId, DirectPresentation>>,
  ) => void,
  native: NativePort = invoke,
  available = CODEX_DIRECT_CONNECTION_AVAILABLE && isTauri(),
  now: () => number = Date.now,
) {
  let state = structuredClone(initial);
  const versions = new Map<ConnectionId, number>();
  const nativeGenerations = new Map<ConnectionId, number>();
  const nextRefresh = new Map<ConnectionId, number>();
  const refreshAllowedAt = new Map<ConnectionId, number>();
  const cleanup = new Set<ConnectionId>();
  const presentations: Partial<Record<ConnectionId, DirectPresentation>> = {};
  const stopped = new Set<ConnectionId>();
  const retryAttempts = new Map<ConnectionId, number>();
  const resumeRetry = new Map<ConnectionId, number>();
  const retryDelays = [60_000, 120_000, 240_000];
  let restoring = false;
  const transient = (diagnostic: string | null) =>
    [
      "directNetworkFailed",
      "directRequestTimedOut",
      "directRateLimited",
      "directServiceUnavailable",
    ].includes(diagnostic ?? "");
  const notify = () => changed(structuredClone(state), structuredClone(presentations));
  const version = (id: ConnectionId) => {
    const n = (versions.get(id) ?? 0) + 1;
    versions.set(id, n);
    return n;
  };
  const setPresentation = (
    id: ConnectionId,
    busy: boolean,
    message: string,
    status?: DirectPresentation["status"],
  ) => {
    presentations[id] = {
      busy,
      message,
      cleanupPending: cleanup.has(id),
      ...(status ? { status } : {}),
    };
    notify();
  };
  const owns = (id: ConnectionId) => {
    const c = state.metadata.connections.find((c) => c.id === id);
    return c &&
      state.metadata.accounts.some((a) => a.id === c.accountId && a.providerId === "codex") &&
      directKind(c.mechanism)
      ? c
      : null;
  };
  async function stop(id: ConnectionId): Promise<boolean> {
    const c = owns(id);
    if (!c) return true;
    stopped.add(id);
    resumeRetry.delete(id);
    retryAttempts.delete(id);
    const request = version(id);
    state = disconnect(state, id);
    nativeGenerations.delete(id);
    nextRefresh.delete(id);
    if (!available) {
      setPresentation(id, false, "Disconnected. Your Codex sign-in is unchanged.");
      return true;
    }
    setPresentation(id, true, "Disconnecting…");
    try {
      const result = await native("codex_direct_disconnect", {
        accountId: c.accountId,
        connectionId: id,
      });
      if (versions.get(id) !== request) return false;
      if (
        !validDirectSnapshot(result, c.accountId, id) ||
        result.connectionStatus !== "disconnected"
      )
        throw new Error("cleanup");
      cleanup.delete(id);
      setPresentation(id, false, "Disconnected. Your Codex sign-in is unchanged.");
      return true;
    } catch {
      if (versions.get(id) === request)
        setPresentation(
          id,
          false,
          "Could not confirm monitoring stopped. Try Disconnect again before removing this account.",
        );
      return false;
    }
  }
  return {
    updateMetadata(next: AccountState) {
      const ids = new Set(next.metadata.connections.map((c) => c.id));
      state = {
        ...state,
        metadata: structuredClone(next.metadata),
        connections: next.connections.map(
          (c) => state.connections.find((r) => r.connectionId === c.connectionId) ?? c,
        ),
        sources: state.sources.filter((s) =>
          s.association.connectionIds.every((id) => ids.has(id)),
        ),
        identities: [],
        removingAccountIds: [],
      };
      for (const id of versions.keys())
        if (!ids.has(id)) {
          version(id);
          delete presentations[id];
          nextRefresh.delete(id);
          nativeGenerations.delete(id);
        }
      notify();
    },
    async action(id: ConnectionId, action: DirectAction, automatic = false): Promise<boolean> {
      if (action === "disconnect") return stop(id);
      if (!available) return false;
      if (automatic && stopped.has(id)) return false;
      if (!automatic) {
        stopped.delete(id);
        retryAttempts.delete(id);
        resumeRetry.delete(id);
      }
      const c = owns(id);
      if (!c || (action === "login" && directKind(c.mechanism) !== "managed")) return false;
      if (
        state.metadata.connections.some(
          (other) => other.accountId === c.accountId && presentations[other.id]?.busy,
        )
      )
        return false;
      if (
        action === "connect" &&
        state.connections.some(
          (runtime) =>
            runtime.connectionId === id &&
            runtime.lifecycle === "connected" &&
            runtime.consent === "granted" &&
            presentations[id]?.status !== "Reconnect required",
        )
      )
        return true;
      if (action !== "refresh" && action !== "resume" && cleanup.has(id) && !(await stop(id)))
        return false;
      if (
        action === "refresh" &&
        (state.connections.find((r) => r.connectionId === id)?.consent !== "granted" ||
          state.connections.find((r) => r.connectionId === id)?.lifecycle !== "connected")
      )
        return false;
      if (action === "refresh" && now() < (refreshAllowedAt.get(id) ?? 0)) {
        setPresentation(id, false, "Usage was checked recently. Try refreshing again shortly.");
        return false;
      }
      if (
        action !== "refresh" &&
        state.metadata.connections.some(
          (other) => other.accountId === c.accountId && other.id !== id && cleanup.has(other.id),
        )
      )
        return false;
      if (!automatic) stopped.delete(id);
      const request = version(id);
      if (action !== "refresh") state = beginAuthorizedSession(state, id);
      const generation = state.connections.find((r) => r.connectionId === id)!.generation;
      cleanup.add(id);
      nextRefresh.set(id, now() + CODEX_DIRECT_REFRESH_MS);
      if (action === "refresh") refreshAllowedAt.set(id, now() + 30_000);
      const previousSource = state.sources.find((s) => s.association.connectionIds.includes(id));
      const preserveStale = () => {
        if (!previousSource) return false;
        state = publishSource(state, id, generation, { ...previousSource, freshness: "stale" });
        return true;
      };
      setPresentation(
        id,
        true,
        action === "refresh"
          ? "Refreshing usage…"
          : action === "resume"
            ? "Reconnecting…"
            : "Waiting for confirmation…",
        action === "resume" ? "Connecting" : undefined,
      );
      let stage = "native-invoke";
      try {
        const result = await native(`codex_direct_${action}`, {
          accountId: c.accountId,
          connectionId: id,
          ...(action === "refresh" || action === "resume" ? {} : { kind: directKind(c.mechanism) }),
        });
        if (
          versions.get(id) !== request ||
          !owns(id) ||
          state.connections.find((r) => r.connectionId === id)?.generation !== generation
        )
          return false;
        stage = "snapshot-validation";
        if (
          !validDirectSnapshot(result, c.accountId, id) ||
          (action === "refresh" && result.generation !== nativeGenerations.get(id))
        )
          throw new Error("invalid response");
        refreshAllowedAt.set(id, now() + 30_000);
        nextRefresh.set(id, now() + CODEX_DIRECT_REFRESH_MS);
        if (
          action === "resume" &&
          result.connectionStatus !== "connected" &&
          transient(result.diagnostic)
        ) {
          state = failConnection(state, id, generation, "unavailable");
          const attempt = retryAttempts.get(id) ?? 0;
          if (attempt < retryDelays.length && !stopped.has(id)) {
            retryAttempts.set(id, attempt + 1);
            resumeRetry.set(id, now() + retryDelays[attempt]);
            setPresentation(id, false, "Connection unavailable. Retrying shortly.", "Connecting");
          } else {
            resumeRetry.delete(id);
            setPresentation(
              id,
              false,
              "Reconnect required. Automatic retries stopped.",
              "Reconnect required",
            );
          }
          return false;
        }
        if (
          action === "refresh" &&
          result.connectionStatus === "error" &&
          [
            "directNetworkFailed",
            "directRequestTimedOut",
            "directRateLimited",
            "directServiceUnavailable",
          ].includes(result.diagnostic ?? "") &&
          preserveStale()
        ) {
          const attempt = retryAttempts.get(id) ?? 0;
          if (attempt >= retryDelays.length) {
            nextRefresh.delete(id);
            setPresentation(
              id,
              false,
              "Automatic refresh paused. Showing the last reading; reconnect or refresh manually.",
              "Reconnect required",
            );
          } else {
            retryAttempts.set(id, attempt + 1);
            nextRefresh.set(id, now() + retryDelays[attempt]);
            setPresentation(
              id,
              false,
              "Usage could not be refreshed. Showing the last reported reading; retrying shortly.",
            );
          }
          return false;
        }
        if (result.connectionStatus === "connected") {
          retryAttempts.delete(id);
          resumeRetry.delete(id);
          nativeGenerations.set(id, result.generation);
          stage = "source-projection";
          const source = directSource(result, state, id, generation);
          stage = "source-publication";
          state = publishSource(state, id, generation, source);
        } else {
          state =
            result.connectionStatus === "disconnected"
              ? disconnect(state, id)
              : failConnection(
                  state,
                  id,
                  generation,
                  result.connectionStatus === "auth-required"
                    ? "authentication-expired"
                    : "unavailable",
                );
          if (result.connectionStatus === "disconnected") cleanup.delete(id);
          nextRefresh.delete(id);
        }
        stage = "presentation";
        setPresentation(
          id,
          false,
          directMessage(result) + diagnosticSuffix(result.diagnostic),
          result.connectionStatus !== "connected" && result.connectionStatus !== "disconnected"
            ? "Reconnect required"
            : undefined,
        );
        return result.connectionStatus === "connected";
      } catch (error) {
        if (versions.get(id) === request) {
          if (action === "resume") {
            resumeRetry.delete(id);
            nextRefresh.delete(id);
            state = failConnection(state, id, generation, "unavailable");
            setPresentation(
              id,
              false,
              `Reconnect required.${diagnosticSuffix(error)}`,
              "Reconnect required",
            );
            return false;
          }
          nextRefresh.set(id, now() + CODEX_DIRECT_REFRESH_MS);
          if (error === "directRefreshCooldown") {
            if (action !== "refresh") {
              state = disconnect(state, id);
              nextRefresh.delete(id);
            }
            setPresentation(
              id,
              false,
              action === "refresh"
                ? "Usage was checked recently. Try refreshing again shortly."
                : "A connection was attempted recently. Wait briefly, then choose Connect again.",
            );
            return false;
          }
          if (
            action === "refresh" &&
            transient(typeof error === "string" ? error : null) &&
            preserveStale()
          ) {
            setPresentation(
              id,
              false,
              "Usage could not be refreshed. Showing the last reported reading; try again later.",
            );
            return false;
          }
          nextRefresh.delete(id);
          state = failConnection(state, id, generation, "refresh-failed");
          setPresentation(
            id,
            false,
            (stage === "snapshot-validation"
              ? "The quota response could not be verified. Reconnect to try again."
              : "Reconnect required.") + diagnosticSuffix(error),
            "Reconnect required",
          );
        }
        return false;
      }
    },
    async reconnectRemembered(): Promise<void> {
      if (!available || restoring) return;
      restoring = true;
      try {
        const records = await native("codex_direct_remembered", {});
        if (!Array.isArray(records) || records.length > 32)
          throw new Error("invalid remembered references");
        const seen = new Set<string>();
        for (const row of records) {
          if (
            !row ||
            typeof row !== "object" ||
            typeof row.allowed !== "boolean" ||
            typeof row.connectionId !== "string" ||
            typeof row.accountId !== "string" ||
            !["system", "managed"].includes(row.kind) ||
            seen.has(row.connectionId)
          )
            throw new Error("invalid remembered references");
          seen.add(row.connectionId);
        }
        await Promise.all(
          records.map(async (row) => {
            const c = owns(row.connectionId as ConnectionId);
            if (
              !c ||
              c.accountId !== row.accountId ||
              directKind(c.mechanism) !== row.kind ||
              stopped.has(c.id) ||
              presentations[c.id]?.busy ||
              state.connections.some(
                (runtime) => runtime.connectionId === c.id && runtime.lifecycle === "connected",
              )
            )
              return;
            if (!row.allowed) {
              setPresentation(
                c.id,
                false,
                "Reconnect required. Review updated monitoring permission.",
                "Reconnect required",
              );
              return;
            }
            await this.action(c.id, "resume", true);
          }),
        );
      } catch {
        // Unknown or unsafe authorization metadata never becomes a connection.
        for (const c of state.metadata.connections)
          if (owns(c.id) && !stopped.has(c.id))
            setPresentation(
              c.id,
              false,
              "Reconnect required. Saved monitoring permission could not be verified.",
              "Reconnect required",
            );
      }
    },
    async disconnectAll(): Promise<boolean> {
      const ids = state.metadata.connections.filter((c) => owns(c.id)).map((c) => c.id);
      const results = await Promise.all(ids.map(stop));
      return results.every(Boolean);
    },
    async beforeRemoval(accountId: string, connectionId?: ConnectionId): Promise<boolean> {
      const ids = state.metadata.connections
        .filter((c) => c.accountId === accountId && (!connectionId || c.id === connectionId))
        .map((c) => c.id);
      return (await Promise.all(ids.map(stop))).every(Boolean);
    },
    async refreshAll(): Promise<void> {
      const ids = state.connections
        .filter((c) => c.lifecycle === "connected" && c.consent === "granted")
        .map((c) => c.connectionId);
      await Promise.all(ids.map((id) => this.action(id, "refresh")));
    },
    refreshDue(nowMs: number) {
      for (const [id, next] of resumeRetry)
        if (next <= nowMs && !presentations[id]?.busy && !stopped.has(id)) {
          resumeRetry.delete(id);
          void this.action(id, "resume", true);
        }
      for (const c of state.connections)
        if (
          c.lifecycle === "connected" &&
          c.consent === "granted" &&
          !presentations[c.connectionId]?.busy &&
          (nextRefresh.get(c.connectionId) ?? Infinity) <= nowMs
        )
          void this.action(c.connectionId, "refresh", true);
    },
  };
}
export type DirectController = ReturnType<typeof createDirectController>;
