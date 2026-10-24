<script lang="ts">
  import CircleHelp from "@lucide/svelte/icons/circle-help";
  import Clock3 from "@lucide/svelte/icons/clock-3";
  import Code2 from "@lucide/svelte/icons/code-2";
  import Command from "@lucide/svelte/icons/command";
  import Leaf from "@lucide/svelte/icons/leaf";
  import Monitor from "@lucide/svelte/icons/monitor";
  import Moon from "@lucide/svelte/icons/moon";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Settings2 from "@lucide/svelte/icons/settings-2";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import Sun from "@lucide/svelte/icons/sun";
  import UsersRound from "@lucide/svelte/icons/users-round";
  import X from "@lucide/svelte/icons/x";
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import { Tabs } from "bits-ui";
  import { onMount } from "svelte";

  import { createDemoMonitoring } from "./lib/activity";
  import {
    ageCodexSnapshot,
    CODEX_CONNECTION_AVAILABLE,
    codexMessage,
    disconnectedCodexSnapshot,
    unavailableCodexMonitoring,
    type CodexMonitoring,
    type LiveCodexSnapshot,
  } from "./lib/codex";
  import CodexDetails from "./lib/components/CodexDetails.svelte";
  import { Button } from "./lib/components/ui/button";
  import {
    classifyRemainingPercent,
    createDemoSnapshot,
    DEMO_SCENARIOS,
    formatRemainingPercent,
    type DemoScenario,
    type ProviderSnapshot,
    type QuotaWindowSnapshot,
  } from "./lib/quota";

  type Palette = "graphite-jade" | "zinc-signal";
  type ThemeMode = "system" | "light" | "dark";
  type Preferences = { palette: Palette; theme: ThemeMode };

  const THEME_KEY = "quotafern.appearance.mode.v1";
  const PALETTE_KEY = "quotafern.appearance.palette.v1";
  const DEFAULT_PREFERENCES: Preferences = { palette: "graphite-jade", theme: "system" };
  const isDevelopment = import.meta.env.DEV;

  function validPreferences(value: unknown): value is Preferences {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Record<string, unknown>;
    return (
      (candidate.palette === "graphite-jade" || candidate.palette === "zinc-signal") &&
      (candidate.theme === "system" || candidate.theme === "light" || candidate.theme === "dark")
    );
  }

  function readPreferences(): Preferences {
    try {
      const theme = window.localStorage.getItem(THEME_KEY);
      const palette = window.localStorage.getItem(PALETTE_KEY);
      const candidate = {
        theme: theme ?? DEFAULT_PREFERENCES.theme,
        palette: palette ?? DEFAULT_PREFERENCES.palette,
      };
      return validPreferences(candidate) ? candidate : { ...DEFAULT_PREFERENCES };
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  }

  function storePreferences(value: Preferences): boolean {
    try {
      window.localStorage.setItem(THEME_KEY, value.theme);
      window.localStorage.setItem(PALETTE_KEY, value.palette);
      return true;
    } catch {
      return false;
    }
  }

  let activeTab = $state("overview");
  let scenario = $state<DemoScenario>("healthy");
  let snapshotNow = $state(Date.now());
  let snapshot = $derived(createDemoSnapshot(scenario, snapshotNow));
  let demoPreview = $state(false);
  let demoMonitoring = $state<CodexMonitoring | null>(null);
  let showCodexDetails = $state(false);
  let codexSnapshot = $state<LiveCodexSnapshot>(disconnectedCodexSnapshot());
  let liveNowMs = $state(Date.now());
  let agedCodexSnapshot = $derived(ageCodexSnapshot(codexSnapshot, liveNowMs));
  let demoCodexProvider = $derived(snapshot.providers.find((provider) => provider.id === "codex"));
  let demoDetailWindows = $derived(
    (demoCodexProvider?.windows ?? []).map((window) => {
      const resetAtMs = window.resetAt === null ? null : Date.parse(window.resetAt);
      return {
        id: window.id,
        name: window.name,
        remainingPercent: window.remainingPercent,
        resetAtMs: resetAtMs !== null && Number.isFinite(resetAtMs) ? resetAtMs : null,
        windowDurationMins: null,
      };
    }),
  );
  let demoQuotaDataStatus = $derived(demoCodexProvider?.dataStatus ?? "unknown");
  let demoQuotaFetchedAtMs = $derived(
    demoCodexProvider?.fetchedAt ? Date.parse(demoCodexProvider.fetchedAt) : null,
  );
  let preferences = $state<Preferences>(readPreferences());
  let systemPrefersDark = $state(false);
  let resolvedTheme = $derived(
    preferences.theme === "system" ? (systemPrefersDark ? "dark" : "light") : preferences.theme,
  );
  let isRefreshing = $state(false);
  let refreshMessage = $state("");
  let codexBusy = $state(false);
  let codexPolling = false;
  let codexRequestVersion = 0;
  let lastCodexStatusCheckMs = 0;
  let refreshCooldownUntilMs = $state(0);
  let codexNotice = $state("");
  let connectConsent = $state(false);
  let closeMessage = $state("");
  let preferenceMessage = $state("Theme choices are saved on this device.");
  let localRefreshLabel = $state("");
  let refreshCooldownSeconds = $derived(
    Math.max(0, Math.ceil((refreshCooldownUntilMs - liveNowMs) / 1000)),
  );

  function setCodexSnapshot(value: LiveCodexSnapshot) {
    codexSnapshot = value;
    liveNowMs = Date.now();
  }

  function markCodexSnapshotStaleAfterFailedRequest() {
    const activity = codexSnapshot.monitoring.activity;
    codexSnapshot = {
      ...codexSnapshot,
      dataStatus: codexSnapshot.dataStatus === "current" ? "stale" : "error",
      diagnostic: "nativeRequestFailed",
      monitoring: {
        ...codexSnapshot.monitoring,
        activity: activity.state === "current" ? { ...activity, state: "stale" } : activity,
      },
    };
  }

  async function connectCodex() {
    if (codexBusy || !connectConsent || !isTauri() || !CODEX_CONNECTION_AVAILABLE) return;
    codexBusy = true;
    connectConsent = false;
    codexNotice = "Starting a Codex quota connection…";
    const requestVersion = ++codexRequestVersion;
    try {
      const result = await invoke<LiveCodexSnapshot>("codex_connect");
      if (requestVersion !== codexRequestVersion) return;
      setCodexSnapshot(result);
      lastCodexStatusCheckMs = Date.now();
      codexNotice =
        result.connectionStatus === "connected"
          ? "Connected. Quotafern reads usage limits only and does not send agent turns."
          : codexMessage(result);
    } catch {
      if (requestVersion === codexRequestVersion) {
        codexNotice =
          "Quotafern couldn’t connect to the Codex session. Check the desktop app and try again.";
      }
    } finally {
      codexBusy = false;
    }
  }

  async function refreshCodex() {
    if (
      codexBusy ||
      !isTauri() ||
      !CODEX_CONNECTION_AVAILABLE ||
      codexSnapshot.connectionStatus !== "connected" ||
      refreshCooldownSeconds > 0
    )
      return;
    codexBusy = true;
    codexNotice = "Reading Codex usage limits…";
    const requestVersion = ++codexRequestVersion;
    try {
      const result = await invoke<LiveCodexSnapshot>("codex_refresh");
      if (requestVersion !== codexRequestVersion) return;
      setCodexSnapshot(result);
      lastCodexStatusCheckMs = Date.now();
      refreshCooldownUntilMs = Date.now() + 30_000;
      codexNotice =
        result.dataStatus === "current" ? "Codex usage limits refreshed." : codexMessage(result);
    } catch {
      if (requestVersion === codexRequestVersion) {
        refreshCooldownUntilMs = Date.now() + 30_000;
        markCodexSnapshotStaleAfterFailedRequest();
        codexNotice = "Codex couldn’t refresh usage limits. Try again after the short cooldown.";
      }
    } finally {
      codexBusy = false;
    }
  }

  async function disconnectCodex(): Promise<boolean> {
    if (codexBusy || !isTauri()) return false;
    codexBusy = true;
    codexNotice = "Stopping Quotafern monitoring…";
    const requestVersion = ++codexRequestVersion;
    try {
      const result = await invoke<LiveCodexSnapshot>("codex_disconnect");
      if (requestVersion !== codexRequestVersion) return false;
      setCodexSnapshot(result);
      lastCodexStatusCheckMs = 0;
      codexNotice = "Monitoring stopped. Your Codex CLI session remains signed in.";
      return true;
    } catch {
      if (requestVersion === codexRequestVersion) {
        markCodexSnapshotStaleAfterFailedRequest();
        codexNotice = "Quotafern couldn’t stop monitoring. Try Disconnect again.";
      }
      return false;
    } finally {
      codexBusy = false;
    }
  }

  async function pollCodexStatus() {
    if (
      codexBusy ||
      codexPolling ||
      demoPreview ||
      !isTauri() ||
      !CODEX_CONNECTION_AVAILABLE ||
      codexSnapshot.connectionStatus !== "connected" ||
      Date.now() - lastCodexStatusCheckMs < 30_000
    )
      return;
    codexPolling = true;
    const requestVersion = codexRequestVersion;
    lastCodexStatusCheckMs = Date.now();
    try {
      const result = await invoke<LiveCodexSnapshot>("codex_status");
      if (requestVersion === codexRequestVersion && !demoPreview) {
        setCodexSnapshot(result);
        const agedResult = ageCodexSnapshot(result, Date.now());
        codexNotice =
          agedResult.connectionStatus === "connected" && agedResult.dataStatus === "current"
            ? ""
            : codexMessage(agedResult);
      }
    } catch {
      // A failed IPC check cannot establish freshness. Keep only stale last-known values.
      if (requestVersion === codexRequestVersion && !demoPreview) {
        markCodexSnapshotStaleAfterFailedRequest();
      }
    } finally {
      codexPolling = false;
    }
  }

  async function changeDemoPreview(enabled: boolean) {
    if (codexBusy) return;
    codexNotice = "";
    if (enabled && codexSnapshot.connectionStatus !== "disconnected") {
      const stopped = await disconnectCodex();
      if (!stopped) return;
    }
    if (enabled) {
      snapshotNow = Date.now();
      demoMonitoring = createDemoMonitoring(snapshotNow);
    } else {
      demoMonitoring = null;
    }
    demoPreview = enabled;
    showCodexDetails = false;
    connectConsent = false;
    refreshMessage = "";
    localRefreshLabel = "";
    if (!enabled) {
      codexNotice = CODEX_CONNECTION_AVAILABLE
        ? "Demo preview closed. Connect to Codex again from Accounts when you’re ready."
        : "Demo preview closed. Live Codex connection remains unavailable in this build.";
    }
  }

  function updatePreferences(patch: Partial<Preferences>) {
    preferences = { ...preferences, ...patch };
    const saved = storePreferences(preferences);
    preferenceMessage = saved
      ? "Preferences saved on this device."
      : "Browser storage is unavailable. These choices will last until this popup closes.";
  }

  function handleStorage(event: StorageEvent) {
    if (event.key !== THEME_KEY && event.key !== PALETTE_KEY && event.key !== null) return;
    if (event.key === null) {
      preferences = { ...DEFAULT_PREFERENCES };
    } else if (event.key === THEME_KEY) {
      const theme = event.newValue ?? DEFAULT_PREFERENCES.theme;
      if (theme === "system" || theme === "light" || theme === "dark")
        preferences = { ...preferences, theme };
    } else {
      const palette = event.newValue ?? DEFAULT_PREFERENCES.palette;
      if (palette === "graphite-jade" || palette === "zinc-signal")
        preferences = { ...preferences, palette };
    }
    preferenceMessage = "Theme updated from another Quotafern window.";
  }

  function handleSystemTheme(event: MediaQueryListEvent) {
    systemPrefersDark = event.matches;
  }

  onMount(() => {
    let mediaQuery: MediaQueryList | null = null;
    const clock = window.setInterval(() => {
      liveNowMs = Date.now();
      void pollCodexStatus();
    }, 1000);
    try {
      mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      systemPrefersDark = mediaQuery.matches;
      mediaQuery.addEventListener("change", handleSystemTheme);
    } catch {
      // The explicit light theme remains the safe fallback when matchMedia is unavailable.
    }
    window.addEventListener("storage", handleStorage);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.clearInterval(clock);
      mediaQuery?.removeEventListener("change", handleSystemTheme);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("keydown", handleEscape);
    };
  });

  $effect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.palette = preferences.palette;
    document.documentElement.dataset.theme = resolvedTheme;
  });

  function bandLabel(provider: ProviderSnapshot, window: QuotaWindowSnapshot): string {
    if (provider.connectionStatus === "auth-required") return "Sign-in needed";
    if (provider.dataStatus === "error") return "Unavailable";
    if (provider.dataStatus === "unknown") return "Unknown";
    const band = classifyRemainingPercent(window.remainingPercent);
    return band === "normal"
      ? "Normal"
      : band === "low"
        ? "Low"
        : band === "critical"
          ? "Critical"
          : "Unknown";
  }

  function bandClass(provider: ProviderSnapshot, window: QuotaWindowSnapshot): string {
    if (
      provider.connectionStatus === "auth-required" ||
      provider.dataStatus === "error" ||
      provider.dataStatus === "unknown"
    )
      return "unknown";
    return classifyRemainingPercent(window.remainingPercent);
  }

  function codexBandClass(window: LiveCodexSnapshot["windows"][number]): string {
    if (
      agedCodexSnapshot.connectionStatus !== "connected" ||
      agedCodexSnapshot.dataStatus === "error" ||
      agedCodexSnapshot.dataStatus === "unknown"
    )
      return "unknown";
    return classifyRemainingPercent(window.remainingPercent);
  }

  function codexBandLabel(window: LiveCodexSnapshot["windows"][number]): string {
    if (agedCodexSnapshot.connectionStatus === "auth-required") return "Sign-in needed";
    if (agedCodexSnapshot.connectionStatus !== "connected") return "Unavailable";
    if (agedCodexSnapshot.dataStatus === "error") return "Unavailable";
    if (agedCodexSnapshot.dataStatus === "unknown") return "Unknown";
    const band = classifyRemainingPercent(window.remainingPercent);
    return band === "normal"
      ? "Normal"
      : band === "low"
        ? "Low"
        : band === "critical"
          ? "Critical"
          : "Unknown";
  }

  function codexRemainingLabel(window: LiveCodexSnapshot["windows"][number]): string {
    return codexBandClass(window) === "unknown"
      ? "Not available"
      : formatRemainingPercent(window.remainingPercent);
  }

  function formatResetAtMs(resetAtMs: number | null): string {
    if (resetAtMs === null || !Number.isFinite(resetAtMs)) return "Not reported";
    const minutes = Math.max(0, Math.ceil((resetAtMs - liveNowMs) / 60_000));
    if (minutes === 0) return "now";
    if (minutes < 60) return `in ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (hours < 24) return remainder ? `in ${hours}h ${remainder}m` : `in ${hours}h`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours ? `in ${days}d ${remainingHours}h` : `in ${days}d`;
  }

  function formatWindowDuration(durationMins: number | null): string {
    if (durationMins === null || !Number.isFinite(durationMins)) return "Duration not reported";
    if (durationMins < 60) return `${durationMins} min window`;
    const hours = durationMins / 60;
    if (hours < 24) return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr window`;
    const days = hours / 24;
    return `${Number.isInteger(days) ? days : days.toFixed(1)} day window`;
  }

  function formatLiveReadAt(timestampMs: number | null): string {
    if (timestampMs === null || !Number.isFinite(timestampMs)) return "No successful read yet";
    const ageMs = Math.max(0, liveNowMs - timestampMs);
    const ageMinutes = Math.floor(ageMs / 60_000);
    const relative =
      ageMs < 60_000
        ? "just now"
        : ageMinutes < 60
          ? `${ageMinutes} min ago`
          : ageMinutes < 24 * 60
            ? `${Math.floor(ageMinutes / 60)} hr ago`
            : `${Math.floor(ageMinutes / (24 * 60))} days ago`;
    const absolute = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(timestampMs));
    return `${absolute} · ${relative}`;
  }

  function formatResetAt(resetAt: string | null): string {
    if (!resetAt) return "Not reported";
    const timestamp = Date.parse(resetAt);
    if (!Number.isFinite(timestamp)) return "Not reported";
    const minutes = Math.max(0, Math.ceil((timestamp - Date.now()) / 60_000));
    if (minutes === 0) return "now";
    if (minutes < 60) return `in ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (hours < 24) return remainder ? `in ${hours}h ${remainder}m` : `in ${hours}h`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours ? `in ${days}d ${remainingHours}h` : `in ${days}d`;
  }

  function formatFetchedAt(provider: ProviderSnapshot | undefined): string {
    if (!provider?.fetchedAt || provider.dataStatus !== "stale") return "sample only";
    const timestamp = Date.parse(provider.fetchedAt);
    if (!Number.isFinite(timestamp)) return "time not reported";
    const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60_000));
    return `${minutes} min ago`;
  }

  async function refreshDemo() {
    if (isRefreshing) return;
    isRefreshing = true;
    refreshMessage = "Refreshing the local sample…";
    await new Promise((resolve) => window.setTimeout(resolve, 560));
    snapshotNow = Date.now();
    localRefreshLabel = "just now · locally";
    if (scenario === "auth") {
      refreshMessage = "This fixture simulates sign-in needed. No sign-in was attempted.";
    } else if (scenario === "error") {
      refreshMessage = "This is a simulated refresh error. No provider request was sent.";
    } else if (scenario === "stale") {
      refreshMessage =
        "The stale label belongs to this fixture. Local refresh cannot update provider data.";
    } else if (scenario === "empty") {
      refreshMessage = "There are no sample accounts in this scenario to refresh.";
    } else {
      refreshMessage = "Sample reloaded locally. No provider was contacted.";
    }
    isRefreshing = false;
  }

  function chooseScenario(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value as DemoScenario;
    scenario = value;
    refreshMessage = "";
    localRefreshLabel = "";
  }

  async function closePopup() {
    closeMessage = "";
    if (isTauri()) {
      try {
        await invoke("hide_popup");
      } catch {
        closeMessage = "The tray command couldn’t hide this popup. Use the tray menu to hide it.";
      }
      return;
    }
    closeMessage =
      "This browser preview can’t hide its window. Close the browser tab to dismiss it.";
  }

  function handleEscape(event: KeyboardEvent) {
    const activeElement = document.activeElement;
    const hasOpenDialog = document.querySelector('dialog[open], [role="dialog"]');

    if (
      event.key !== "Escape" ||
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      hasOpenDialog ||
      activeElement instanceof HTMLSelectElement ||
      activeElement instanceof HTMLTextAreaElement ||
      (activeElement instanceof HTMLInputElement &&
        !["radio", "checkbox"].includes(activeElement.type)) ||
      (activeElement instanceof HTMLElement && activeElement.isContentEditable)
    )
      return;

    event.preventDefault();
    void closePopup();
  }
</script>

<svelte:head>
  <title>{demoPreview ? "Quotafern · Demo preview" : "Quotafern · Codex"}</title>
  <meta
    name="description"
    content={demoPreview
      ? "A local, synthetic preview of CLI quota status."
      : "A local view of Codex subscription usage limits."}
  />
</svelte:head>

<Tabs.Root class="popup" bind:value={activeTab} orientation="horizontal">
  <header class="topbar">
    <div class="brand-lockup">
      <span class="brand-mark" aria-hidden="true"><Leaf size={17} strokeWidth={2.1} /></span>
      <div class="brand-copy">
        <span class="brand-name">Quotafern</span>
        <span class="brand-caption"
          >{demoPreview ? "Synthetic preview" : "Local quota monitor"}</span
        >
      </div>
    </div>
    <div class="topbar-actions">
      {#if demoPreview}
        <span class="demo-badge"><span class="demo-dot" aria-hidden="true"></span>Demo</span>
      {:else}
        <span
          class="connection-badge"
          class:connected={agedCodexSnapshot.connectionStatus === "connected"}
          class:failed={agedCodexSnapshot.connectionStatus === "error" ||
            agedCodexSnapshot.connectionStatus === "unavailable" ||
            agedCodexSnapshot.connectionStatus === "incompatible" ||
            agedCodexSnapshot.connectionStatus === "unsupported"}
        >
          <span aria-hidden="true"></span>
          {agedCodexSnapshot.connectionStatus === "connected"
            ? "Codex live"
            : agedCodexSnapshot.connectionStatus === "disconnected"
              ? "Codex disconnected"
              : agedCodexSnapshot.connectionStatus === "auth-required"
                ? "Sign-in needed"
                : agedCodexSnapshot.connectionStatus}
        </span>
      {/if}
      <Button
        class="icon-button close-button"
        variant="ghost"
        size="icon"
        aria-label="Close popup"
        onclick={closePopup}
      >
        <X size={16} strokeWidth={2} aria-hidden="true" />
      </Button>
    </div>
  </header>

  {#if closeMessage}
    <div class="inline-notice close-notice" role="status">{closeMessage}</div>
  {/if}

  <Tabs.List class="tab-list" aria-label="Quotafern sections">
    <Tabs.Trigger class="tab-trigger" value="overview">
      <Monitor size={15} strokeWidth={1.9} aria-hidden="true" /><span>Overview</span>
    </Tabs.Trigger>
    <Tabs.Trigger class="tab-trigger" value="accounts">
      <UsersRound size={15} strokeWidth={1.9} aria-hidden="true" /><span>Accounts</span>
    </Tabs.Trigger>
    <Tabs.Trigger class="tab-trigger" value="settings">
      <Settings2 size={15} strokeWidth={1.9} aria-hidden="true" /><span>Settings</span>
    </Tabs.Trigger>
  </Tabs.List>

  <Tabs.Content class="view-content" value="overview">
    {#if showCodexDetails}
      <div class="view-heading">
        <div>
          <h1>Codex Details</h1>
          <p>Quota, credits and Activity</p>
        </div>
        <Button variant="outline" size="sm" onclick={() => (showCodexDetails = false)}>Back</Button>
      </div>
      <CodexDetails
        source={demoPreview ? "synthetic" : "live"}
        monitoring={demoPreview
          ? (demoMonitoring ?? unavailableCodexMonitoring())
          : agedCodexSnapshot.monitoring}
        windows={demoPreview ? demoDetailWindows : agedCodexSnapshot.windows}
        dataStatus={demoPreview ? demoQuotaDataStatus : agedCodexSnapshot.dataStatus}
        fetchedAtMs={demoPreview ? demoQuotaFetchedAtMs : agedCodexSnapshot.fetchedAtMs}
        connectionStatus={demoPreview ? "disconnected" : agedCodexSnapshot.connectionStatus}
        nowMs={liveNowMs}
      />
    {:else}
      {#if demoPreview}
        <div class="view-heading">
          <div>
            <h1>Usage overview</h1>
            <p>
              {snapshot.providers.length === 0
                ? "No synthetic CLI profiles"
                : "Three synthetic CLI profiles"}
            </p>
          </div>
          <Button
            class="refresh-button"
            variant="outline"
            size="sm"
            onclick={refreshDemo}
            disabled={isRefreshing}
            aria-label={isRefreshing ? "Refreshing demo sample" : "Refresh local demo sample"}
            aria-busy={isRefreshing}
          >
            <RefreshCw
              size={14}
              strokeWidth={2}
              class={isRefreshing ? "spin" : ""}
              aria-hidden="true"
            />
            <span>{isRefreshing ? "Refreshing" : "Refresh"}</span>
          </Button>
        </div>

        {#if snapshot.providers.some((provider) => provider.dataStatus === "stale")}
          <div class="state-banner stale-banner" role="status">
            <Clock3 size={15} strokeWidth={2} aria-hidden="true" />
            <span>Stale demo sample · captured {formatFetchedAt(snapshot.providers[0])}</span>
          </div>
        {:else if scenario === "auth"}
          <div class="state-banner auth-banner" role="status">
            <CircleHelp size={15} strokeWidth={2} aria-hidden="true" />
            <span>Sign-in required in this synthetic scenario</span>
          </div>
        {:else if scenario === "error"}
          <div class="state-banner error-banner" role="status">
            <CircleHelp size={15} strokeWidth={2} aria-hidden="true" />
            <span>Sample unavailable · simulated error</span>
          </div>
        {/if}

        {#if refreshMessage}
          <div class="inline-notice refresh-notice" role="status" aria-live="polite">
            {refreshMessage}
          </div>
        {/if}

        {#if snapshot.providers.length > 0}
          <section class="provider-list" aria-label="Synthetic provider usage">
            {#each snapshot.providers as provider (provider.id)}
              <article class="provider-row">
                <div class="provider-topline">
                  <div class="provider-identity">
                    <span class="provider-icon" aria-hidden="true">
                      {#if provider.id === "codex"}
                        <Command size={16} strokeWidth={1.8} />
                      {:else if provider.id === "claude-code"}
                        <Code2 size={16} strokeWidth={1.8} />
                      {:else}
                        <Sparkles size={16} strokeWidth={1.8} />
                      {/if}
                    </span>
                    <div class="provider-name-wrap">
                      <h2>{provider.name}</h2>
                      <span>{provider.tool} · {provider.accountId}</span>
                    </div>
                  </div>
                  <span class="demo-profile-label">Demo only</span>
                </div>
                <div class="window-grid" role="group" aria-label={`${provider.name} quota windows`}>
                  {#each provider.windows as window (window.id)}
                    {@const band = bandClass(provider, window)}
                    <section class="quota-window" aria-label={`${window.name} quota window`}>
                      <div class="window-heading">
                        <span>{window.name}</span><span
                          class="status-pill"
                          class:normal={band === "normal"}
                          class:low={band === "low"}
                          class:critical={band === "critical"}
                          class:unknown={band === "unknown"}>{bandLabel(provider, window)}</span
                        >
                      </div>
                      <div class="window-value-row">
                        <strong class="remaining-value" class:unknown-value={band === "unknown"}
                          >{formatRemainingPercent(window.remainingPercent)}</strong
                        ><span class="window-reset">Reset {formatResetAt(window.resetAt)}</span>
                      </div>
                      {#if window.remainingPercent !== null && band !== "unknown" && (provider.dataStatus === "current" || provider.dataStatus === "stale")}
                        <div
                          class="usage-meter"
                          role="meter"
                          aria-label={`${provider.name} ${window.name} remaining quota`}
                          aria-valuemin="0"
                          aria-valuemax="100"
                          aria-valuenow={window.remainingPercent}
                          aria-valuetext={`${formatRemainingPercent(window.remainingPercent)} remaining`}
                          class:meter-normal={band === "normal"}
                          class:meter-low={band === "low"}
                          class:meter-critical={band === "critical"}
                        >
                          <span style={`--meter-value: ${window.remainingPercent}%`}></span>
                        </div>
                      {/if}
                    </section>
                  {/each}
                </div>
              </article>
            {/each}
          </section>
        {:else}
          <section class="empty-state" aria-labelledby="empty-title">
            <span class="empty-icon" aria-hidden="true"
              ><UsersRound size={20} strokeWidth={1.8} /></span
            >
            <h2 id="empty-title">No demo accounts yet</h2>
            <p>
              This scenario has no sample profiles. Choose another fixture in Settings to preview
              usage states.
            </p>
            <Button variant="link" class="text-action" onclick={() => (activeTab = "settings")}
              >Open demo settings <span aria-hidden="true">→</span></Button
            >
          </section>
        {/if}

        <div class="source-note">
          <span class="note-dot" aria-hidden="true"></span><span
            >Demo sample only · no provider connected</span
          >
        </div>
        {#if localRefreshLabel}
          <p class="refresh-caption">Last preview refresh: {localRefreshLabel}</p>
        {/if}
      {:else}
        <div class="view-heading">
          <div>
            <h1>Usage overview</h1>
            <p>Codex subscription limits</p>
          </div>
          {#if agedCodexSnapshot.connectionStatus === "connected" && isTauri()}
            <Button
              class="refresh-button"
              variant="outline"
              size="sm"
              onclick={refreshCodex}
              disabled={codexBusy || refreshCooldownSeconds > 0}
              aria-label={codexBusy
                ? "Refreshing Codex usage limits"
                : refreshCooldownSeconds > 0
                  ? `Refresh Codex usage limits in ${refreshCooldownSeconds} seconds`
                  : "Refresh Codex usage limits"}
              aria-busy={codexBusy}
              data-testid="refresh-codex"
            >
              <RefreshCw
                size={14}
                strokeWidth={2}
                class={codexBusy ? "spin" : ""}
                aria-hidden="true"
              />
              <span>
                {codexBusy
                  ? "Refreshing"
                  : refreshCooldownSeconds > 0
                    ? `Refresh in ${refreshCooldownSeconds}s`
                    : "Refresh"}
              </span>
            </Button>
          {/if}
        </div>

        {#if codexNotice}
          <div class="inline-notice codex-notice" role="status" aria-live="polite">
            {codexNotice}
          </div>
        {/if}

        {#if agedCodexSnapshot.connectionStatus === "disconnected"}
          <section class="codex-empty-state" aria-labelledby="codex-empty-title">
            <span class="empty-icon" aria-hidden="true"
              ><Command size={20} strokeWidth={1.8} /></span
            >
            <h2 id="codex-empty-title">
              {CODEX_CONNECTION_AVAILABLE
                ? "No Codex session connected"
                : "Live Codex connection unavailable"}
            </h2>
            <p>
              {CODEX_CONNECTION_AVAILABLE
                ? "Connect from Accounts to read subscription limits from your existing Codex session. Quotafern never sends agent turns."
                : "Live connection is disabled in this build. Review Accounts for the reason, or turn on Demo preview in Settings."}
            </p>
            <Button
              variant="link"
              class="text-action"
              onclick={() => (activeTab = "accounts")}
              data-testid="open-codex-account"
            >
              Review connection details <span aria-hidden="true">→</span>
            </Button>
          </section>
        {:else if agedCodexSnapshot.connectionStatus !== "connected"}
          <div class="state-banner codex-state-banner" role="status">
            <CircleHelp size={15} strokeWidth={2} aria-hidden="true" />
            <span>{codexMessage(agedCodexSnapshot)}</span>
          </div>
          <p class="codex-next-step">
            Review the Codex connection in Accounts. Quotafern does not fall back to demo data.
          </p>
        {:else}
          {#if agedCodexSnapshot.dataStatus === "stale"}
            <div class="state-banner stale-banner" role="status">
              <Clock3 size={15} strokeWidth={2} aria-hidden="true" />
              <span>Showing the last successful read · refresh to check current limits.</span>
            </div>
          {:else if agedCodexSnapshot.dataStatus === "error"}
            <div class="state-banner error-banner" role="status">
              <CircleHelp size={15} strokeWidth={2} aria-hidden="true" />
              <span>{codexMessage(agedCodexSnapshot)}</span>
            </div>
          {:else if agedCodexSnapshot.dataStatus === "unknown"}
            <div class="state-banner codex-state-banner" role="status">
              <CircleHelp size={15} strokeWidth={2} aria-hidden="true" />
              <span>Codex did not report current usage limits. No percentages are inferred.</span>
            </div>
          {/if}

          <section class="provider-list codex-live-list" aria-label="Codex subscription usage">
            <article class="provider-row">
              <div class="provider-topline">
                <div class="provider-identity">
                  <span class="provider-icon" aria-hidden="true">
                    <Command size={16} strokeWidth={1.8} />
                  </span>
                  <div class="provider-name-wrap">
                    <h2>Codex</h2>
                    <span>Live subscription limits · local Codex session</span>
                  </div>
                </div>
                <span
                  class="demo-profile-label codex-data-label"
                  class:stale={agedCodexSnapshot.dataStatus === "stale"}
                >
                  {agedCodexSnapshot.dataStatus === "current"
                    ? "Current"
                    : agedCodexSnapshot.dataStatus === "stale"
                      ? "Stale"
                      : agedCodexSnapshot.dataStatus === "error"
                        ? "Unavailable"
                        : "Unknown"}
                </span>
              </div>
              <p class="codex-last-read">
                Last successful read · {formatLiveReadAt(agedCodexSnapshot.fetchedAtMs)}
              </p>
              {#if agedCodexSnapshot.windows.length > 0}
                <div class="window-grid" role="group" aria-label="Codex quota windows">
                  {#each agedCodexSnapshot.windows as window (window.id)}
                    {@const band = codexBandClass(window)}
                    <section class="quota-window" aria-label={`${window.name} quota window`}>
                      <div class="window-heading">
                        <span>{window.name}</span>
                        <span
                          class="status-pill"
                          class:normal={band === "normal"}
                          class:low={band === "low"}
                          class:critical={band === "critical"}
                          class:unknown={band === "unknown"}
                        >
                          {codexBandLabel(window)}
                        </span>
                      </div>
                      <div class="window-value-row">
                        <strong class="remaining-value" class:unknown-value={band === "unknown"}>
                          {codexRemainingLabel(window)}
                        </strong>
                        <span class="window-reset">Reset {formatResetAtMs(window.resetAtMs)}</span>
                      </div>
                      <div class="codex-window-meta">
                        {formatWindowDuration(window.windowDurationMins)}
                      </div>
                      {#if window.remainingPercent !== null && band !== "unknown" && (agedCodexSnapshot.dataStatus === "current" || agedCodexSnapshot.dataStatus === "stale")}
                        <div
                          class="usage-meter"
                          role="meter"
                          aria-label={`Codex ${window.name} remaining quota`}
                          aria-valuemin="0"
                          aria-valuemax="100"
                          aria-valuenow={window.remainingPercent}
                          aria-valuetext={`${formatRemainingPercent(window.remainingPercent)} remaining`}
                          class:meter-normal={band === "normal"}
                          class:meter-low={band === "low"}
                          class:meter-critical={band === "critical"}
                        >
                          <span style={`--meter-value: ${window.remainingPercent}%`}></span>
                        </div>
                      {/if}
                    </section>
                  {/each}
                </div>
              {:else}
                <p class="codex-no-windows">No quota windows were reported in the last read.</p>
              {/if}
            </article>
          </section>

          <div class="source-note live-source-note">
            <span class="note-dot" aria-hidden="true"></span>
            <span>Live Codex data · no credentials stored by Quotafern</span>
          </div>
        {/if}
      {/if}
      <Button
        variant="outline"
        class="codex-details-link"
        onclick={() => (showCodexDetails = true)}
        data-testid="open-codex-details"
      >
        Codex Details · Activity <span aria-hidden="true">→</span>
      </Button>
    {/if}
  </Tabs.Content>

  <Tabs.Content class="view-content" value="accounts">
    {#if demoPreview}
      <div class="view-heading">
        <div>
          <h1>Accounts</h1>
          <p>Sample profiles for CLI tools</p>
        </div>
      </div>

      <div class="account-list" role="list" aria-label="Synthetic demo profiles">
        {#each snapshot.providers as provider (provider.id)}
          <div class="account-row" role="listitem">
            <span class="provider-icon" aria-hidden="true">
              {#if provider.id === "codex"}<Command size={16} strokeWidth={1.8} />
              {:else if provider.id === "claude-code"}<Code2 size={16} strokeWidth={1.8} />
              {:else}<Sparkles size={16} strokeWidth={1.8} />{/if}
            </span>
            <div class="account-copy">
              <strong>{provider.name}</strong><span>Demo ID · {provider.accountId}</span>
            </div>
            <span class="account-state">Not connected</span>
          </div>
        {/each}
        {#if snapshot.providers.length === 0}
          <div class="account-empty">No sample profiles are included in this fixture.</div>
        {/if}
      </div>

      <section class="account-explainer">
        <h2>Demo only</h2>
        <p>
          These rows are local examples. Quotafern is not signed in to Codex, Claude Code, or Gemini
          CLI.
        </p>
        <Button variant="link" class="text-action" onclick={() => (activeTab = "overview")}
          >View usage <span aria-hidden="true">→</span></Button
        >
      </section>
    {:else}
      <div class="view-heading">
        <div>
          <h1>Accounts</h1>
          <p>
            {CODEX_CONNECTION_AVAILABLE
              ? "Connect a local Codex session"
              : "Live connection unavailable in this build"}
          </p>
        </div>
      </div>

      <section class="codex-account-panel" aria-labelledby="codex-account-title">
        <div class="codex-account-heading">
          <span class="provider-icon" aria-hidden="true">
            <Command size={16} strokeWidth={1.8} />
          </span>
          <div class="account-copy">
            <strong id="codex-account-title">Codex</strong>
            <span>Codex quota connection</span>
          </div>
          <span
            class="account-state codex-connection-state"
            class:connected={agedCodexSnapshot.connectionStatus === "connected"}
            class:failed={agedCodexSnapshot.connectionStatus === "error" ||
              agedCodexSnapshot.connectionStatus === "unavailable" ||
              agedCodexSnapshot.connectionStatus === "incompatible" ||
              agedCodexSnapshot.connectionStatus === "unsupported"}
          >
            {agedCodexSnapshot.connectionStatus === "connected"
              ? "Connected"
              : agedCodexSnapshot.connectionStatus === "disconnected"
                ? "Not connected"
                : agedCodexSnapshot.connectionStatus === "auth-required"
                  ? "Sign-in needed"
                  : agedCodexSnapshot.connectionStatus}
          </span>
        </div>

        {#if codexNotice}
          <div class="inline-notice codex-notice" role="status" aria-live="polite">
            {codexNotice}
          </div>
        {/if}

        {#if !CODEX_CONNECTION_AVAILABLE}
          <div class="codex-disabled-note" role="status">
            <strong>Live connection unavailable in this build.</strong>
            <p>
              Starting the Codex app-server may enable saved Remote Control. Quotafern requires a
              documented way to disable it before connecting.
            </p>
          </div>
        {/if}

        {#if !isTauri()}
          <div class="native-only-note" role="note">
            <CircleHelp size={15} strokeWidth={2} aria-hidden="true" />
            <p>
              This browser preview never checks for a Codex CLI or credentials. Connect flows run
              only in the native app when supported.
            </p>
          </div>
        {:else if agedCodexSnapshot.connectionStatus !== "connected"}
          <p class="codex-connection-help">
            {agedCodexSnapshot.connectionStatus === "disconnected"
              ? "Connect to read subscription limits from your existing Codex session on this device."
              : codexMessage(agedCodexSnapshot)}
          </p>
          <div class="codex-consent-copy">
            <p>
              In a supported build, Quotafern would start the installed Codex app-server and read
              subscription limits through your existing Codex session. Codex may refresh or save its
              own credentials and applies its normal sign-in and workspace policies.
            </p>
            <p>
              Quotafern would not send agent turns or remember this connection. Disconnect would
              stop Quotafern monitoring without signing out of Codex CLI.
            </p>
          </div>
          <label class="codex-consent-check">
            <input
              type="checkbox"
              bind:checked={connectConsent}
              disabled={codexBusy || !CODEX_CONNECTION_AVAILABLE}
            />
            <span>I understand and want to connect this Codex session.</span>
          </label>
          <Button
            class="codex-connect-button"
            variant="default"
            onclick={connectCodex}
            disabled={codexBusy || !connectConsent || !CODEX_CONNECTION_AVAILABLE}
            aria-busy={codexBusy}
            data-testid="connect-codex"
          >
            {#if codexBusy}<RefreshCw size={14} class="spin" aria-hidden="true" />{/if}
            <span>
              {codexBusy
                ? "Connecting"
                : CODEX_CONNECTION_AVAILABLE
                  ? "Connect Codex session"
                  : "Live connection unavailable"}
            </span>
          </Button>
          {#if agedCodexSnapshot.connectionStatus !== "disconnected"}
            <Button
              class="codex-disconnect-button"
              variant="outline"
              onclick={disconnectCodex}
              disabled={codexBusy}
              aria-busy={codexBusy}
              data-testid="disconnect-codex"
            >
              {codexBusy ? "Stopping monitoring" : "Disconnect"}
            </Button>
          {/if}
        {:else}
          <div class="codex-connected-details">
            <p>Last successful read · {formatLiveReadAt(agedCodexSnapshot.fetchedAtMs)}</p>
            {#if agedCodexSnapshot.dataStatus !== "current"}
              <p class="codex-connection-help">{codexMessage(agedCodexSnapshot)}</p>
            {/if}
            <p>
              Disconnect stops Quotafern monitoring. It leaves your Codex CLI session signed in.
            </p>
          </div>
          <Button
            class="codex-disconnect-button"
            variant="outline"
            onclick={disconnectCodex}
            disabled={codexBusy}
            aria-busy={codexBusy}
            data-testid="disconnect-codex"
          >
            {codexBusy ? "Stopping monitoring" : "Disconnect"}
          </Button>
        {/if}
      </section>

      <section class="account-explainer codex-limits-explainer">
        <h2>What Quotafern reads</h2>
        <p>
          Validated quota windows, optional credit/spending/reset metadata and daily token activity
          returned by Codex. No inference, purchasing or reset redemption. Only appearance
          preferences are saved in browser storage.
        </p>
        <Button variant="link" class="text-action" onclick={() => (activeTab = "overview")}
          >View usage <span aria-hidden="true">→</span></Button
        >
      </section>
      <section class="provider-catalog" aria-label="Planned providers">
        <h2>Provider catalog</h2>
        <div class="account-row">
          <span class="provider-icon" aria-hidden="true"><Code2 size={16} /></span>
          <div class="account-copy">
            <strong>Claude Code</strong><span>Adapter not implemented</span>
          </div>
          <span class="system-chip">Coming Soon</span>
        </div>
        <div class="account-row">
          <span class="provider-icon" aria-hidden="true"><Sparkles size={16} /></span>
          <div class="account-copy">
            <strong>Gemini CLI</strong><span>Adapter not implemented</span>
          </div>
          <span class="system-chip">Coming Soon</span>
        </div>
      </section>
    {/if}
  </Tabs.Content>

  <Tabs.Content class="view-content settings-content" value="settings">
    <div class="view-heading">
      <div>
        <h1>Settings</h1>
        <p>Appearance and demo preview</p>
      </div>
    </div>

    <section class="settings-group source-mode-group">
      <div class="setting-heading">
        <h2>Demo preview</h2>
        <span class="system-chip">Synthetic</span>
      </div>
      <label class="demo-toggle-row">
        <span class="demo-toggle-copy">
          <strong>Show synthetic quota examples</strong>
          <small>
            Turning this on stops Codex monitoring first. Turning it off does not reconnect Codex.
          </small>
        </span>
        <input
          type="checkbox"
          checked={demoPreview}
          disabled={codexBusy}
          onchange={(event) =>
            void changeDemoPreview((event.currentTarget as HTMLInputElement).checked)}
          aria-label="Show synthetic quota examples"
          data-testid="demo-preview-toggle"
        />
      </label>
      {#if codexNotice}
        <p class="preference-message" role="status" aria-live="polite">{codexNotice}</p>
      {/if}
    </section>

    <fieldset class="settings-group appearance-group">
      <legend>Appearance</legend>
      <div class="theme-options" role="radiogroup" aria-label="Color mode">
        <label class="theme-option">
          <input
            type="radio"
            name="theme-mode"
            value="system"
            checked={preferences.theme === "system"}
            onchange={() => updatePreferences({ theme: "system" })}
          />
          <span><Monitor size={14} aria-hidden="true" />System</span>
        </label>
        <label class="theme-option">
          <input
            type="radio"
            name="theme-mode"
            value="light"
            checked={preferences.theme === "light"}
            onchange={() => updatePreferences({ theme: "light" })}
          />
          <span><Sun size={14} aria-hidden="true" />Light</span>
        </label>
        <label class="theme-option">
          <input
            type="radio"
            name="theme-mode"
            value="dark"
            checked={preferences.theme === "dark"}
            onchange={() => updatePreferences({ theme: "dark" })}
          />
          <span><Moon size={14} aria-hidden="true" />Dark</span>
        </label>
      </div>
      <div class="palette-options" role="group" aria-label="Color palette">
        <button
          class="palette-option"
          type="button"
          aria-pressed={preferences.palette === "graphite-jade"}
          onclick={() => updatePreferences({ palette: "graphite-jade" })}
        >
          <span class="palette-swatches graphite-swatches" aria-hidden="true"
            ><i></i><i></i><i></i></span
          >
          <span class="palette-copy"
            ><strong>Graphite &amp; Jade</strong><small>Grounded · botanical</small></span
          >
          {#if preferences.palette === "graphite-jade"}<span
              class="selected-mark"
              aria-label="Selected">✓</span
            >{/if}
        </button>
        <button
          class="palette-option"
          type="button"
          aria-pressed={preferences.palette === "zinc-signal"}
          onclick={() => updatePreferences({ palette: "zinc-signal" })}
        >
          <span class="palette-swatches zinc-swatches" aria-hidden="true"
            ><i></i><i></i><i></i></span
          >
          <span class="palette-copy"
            ><strong>Zinc &amp; Signal</strong><small>Quiet · electric</small></span
          >
          {#if preferences.palette === "zinc-signal"}<span
              class="selected-mark"
              aria-label="Selected">✓</span
            >{/if}
        </button>
      </div>
      <p class="preference-message" role="status" aria-live="polite">{preferenceMessage}</p>
    </fieldset>

    <section class="settings-group motion-group">
      <div class="setting-heading">
        <h2>Motion</h2>
        <span class="system-chip">System</span>
      </div>
      <p>Respects your device’s reduced-motion setting.</p>
    </section>

    {#if isDevelopment && demoPreview}
      <section class="settings-group scenario-group">
        <label for="demo-scenario">Demo scenario</label>
        <select id="demo-scenario" value={scenario} onchange={chooseScenario}>
          {#each DEMO_SCENARIOS as item (item.value)}
            <option value={item.value}>{item.label}</option>
          {/each}
        </select>
        <p>
          Development preview only. Release builds keep this sample on the synthetic healthy
          scenario.
        </p>
      </section>
    {/if}

    <section class="privacy-note">
      <span class="privacy-icon" aria-hidden="true"><Leaf size={15} strokeWidth={1.9} /></span>
      <p>
        Quotafern stores no credentials or tokens. Only appearance preferences are saved locally.
      </p>
    </section>
  </Tabs.Content>

  <footer class="popup-footer">
    <span>
      <span
        class="footer-dot"
        class:preview={demoPreview}
        class:connected={agedCodexSnapshot.connectionStatus === "connected"}
        class:failed={agedCodexSnapshot.connectionStatus !== "connected" &&
          agedCodexSnapshot.connectionStatus !== "disconnected"}
        aria-hidden="true"
      ></span>
      {demoPreview
        ? "Demo preview · synthetic data"
        : agedCodexSnapshot.connectionStatus === "connected"
          ? "Codex · live subscription limits"
          : "Codex · not connected"}
    </span>
    {#if activeTab !== "settings"}
      <Button
        variant="ghost"
        size="sm"
        class="footer-settings"
        onclick={() => (activeTab = "settings")}
        aria-label="Open settings">Settings <span aria-hidden="true">→</span></Button
      >
    {:else}
      <span class="footer-mode"
        >{resolvedTheme === "dark" ? "Dark" : "Light"} · {preferences.palette === "graphite-jade"
          ? "Jade"
          : "Signal"}</span
      >
    {/if}
  </footer>
</Tabs.Root>
