<script lang="ts">
  import CircleHelp from "@lucide/svelte/icons/circle-help";
  import Clock3 from "@lucide/svelte/icons/clock-3";
  import Command from "@lucide/svelte/icons/command";
  import Leaf from "@lucide/svelte/icons/leaf";
  import Monitor from "@lucide/svelte/icons/monitor";
  import Moon from "@lucide/svelte/icons/moon";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Settings2 from "@lucide/svelte/icons/settings-2";
  import Sun from "@lucide/svelte/icons/sun";
  import UsersRound from "@lucide/svelte/icons/users-round";
  import X from "@lucide/svelte/icons/x";
  import { invoke, isTauri } from "@tauri-apps/api/core";
  import { Tabs } from "bits-ui";
  import { onMount, tick } from "svelte";

  import AccountOverview from "./lib/accounts/AccountOverview.svelte";
  import AccountsPanel from "./lib/accounts/AccountsPanel.svelte";
  import {
    ACCOUNT_DEMO_SCENARIOS,
    createAccountDemo,
    type AccountDemoScenario,
  } from "./lib/accounts/demo";
  import {
    CODEX_DIRECT_CONNECTION_AVAILABLE,
    createDirectController,
    type DirectPresentation,
  } from "./lib/accounts/direct";
  import { createLocalStore } from "./lib/accounts/local";
  import LocalAccounts from "./lib/accounts/LocalAccounts.svelte";
  import type { ConnectionId } from "./lib/accounts/model";
  import {
    initialNavigation,
    reconcileNavigation,
    type AccountNavigation,
    type DetailTarget,
    type ReturnTarget,
  } from "./lib/accounts/navigation";
  import type { Selection } from "./lib/accounts/views";
  import {
    ageCodexSnapshot,
    CODEX_CONNECTION_AVAILABLE,
    codexMessage,
    disconnectedCodexSnapshot,
    type LiveCodexSnapshot,
  } from "./lib/codex";
  import CodexDetails from "./lib/components/CodexDetails.svelte";
  import { Button } from "./lib/components/ui/button";
  import { classifyRemainingPercent, formatRemainingPercent } from "./lib/quota";

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
  const localStore = createLocalStore(() => window.localStorage);
  let localAccountState = $state.raw(localStore.state);
  let directConnectedCount = $derived(
    localAccountState.connections.filter((c) => c.lifecycle === "connected").length,
  );
  let directPresentations = $state.raw<Partial<Record<ConnectionId, DirectPresentation>>>({});
  const directController = createDirectController(localStore.state, (state, presentations) => {
    liveNowMs = Date.now();
    localAccountState = state;
    directPresentations = presentations;
  });
  let accountNavigation = $state<AccountNavigation>(initialNavigation());
  $effect(() => {
    const next = reconcileNavigation(visibleAccountState, accountNavigation);
    if (next !== accountNavigation) accountNavigation = next;
  });
  let collapsedProviders = $state<string[]>([]);
  const tabScroll: Record<string, number> = { overview: 0, accounts: 0, settings: 0 };
  let navigationVersion = 0;
  function returnPoint(controlId: string): ReturnTarget {
    return {
      tab: activeTab === "accounts" ? "accounts" : "overview",
      controlId,
      scrollTop:
        document.querySelector<HTMLElement>('[role="tabpanel"][data-state="active"]')?.scrollTop ??
        0,
    };
  }
  async function revealAccountContext() {
    const version = ++navigationVersion;
    tabScroll.overview = 0;
    activeTab = "overview";
    await tick();
    if (version !== navigationVersion || activeTab !== "overview") return;
    document
      .querySelector<HTMLElement>('[role="tabpanel"][data-state="active"]')
      ?.scrollTo({ top: 0, behavior: "instant" });
    document.getElementById("owned-details-title")?.focus({ preventScroll: true });
  }
  function selectAccountContext(selection: Selection) {
    accountNavigation = {
      ...accountNavigation,
      notice: "",
      selection,
      detail: null,
      detailReturn: null,
    };
    navigationVersion++;
    tabScroll.overview = 0;
    document
      .querySelector<HTMLElement>('[role="tabpanel"][data-state="active"]')
      ?.scrollTo({ top: 0, behavior: "instant" });
  }
  function openAccountOverview(selection: Selection, controlId: string) {
    accountNavigation = {
      selection,
      notice: "",
      detail: null,
      detailReturn: null,
      overviewReturn: returnPoint(controlId),
    };
    void revealAccountContext();
  }
  function openAccountDetails(detail: DetailTarget, controlId: string) {
    const origin = returnPoint(controlId);
    accountNavigation = {
      ...accountNavigation,
      notice: "",
      detail,
      detailReturn: origin,
      ...(origin.tab === "accounts" ? { selection: detail.selection, overviewReturn: null } : {}),
    };
    void revealAccountContext();
  }
  async function backAccountContext() {
    const target = accountNavigation.detail
      ? accountNavigation.detailReturn
      : accountNavigation.overviewReturn;
    accountNavigation = {
      ...accountNavigation,
      detail: null,
      detailReturn: null,
      overviewReturn: target?.tab === "accounts" ? null : accountNavigation.overviewReturn,
    };
    const version = ++navigationVersion;
    activeTab = target?.tab ?? "overview";
    tabScroll[activeTab] = target?.scrollTop ?? 0;
    await tick();
    if (version !== navigationVersion || activeTab !== (target?.tab ?? "overview")) return;
    const panel = document.querySelector<HTMLElement>('[role="tabpanel"][data-state="active"]');
    const opener = target ? document.getElementById(target.controlId) : null;
    const visibleOpener =
      opener?.isConnected && opener.getClientRects().length > 0 && !opener.hasAttribute("disabled")
        ? opener
        : null;
    const disclosure = opener
      ?.closest(".account-provider")
      ?.querySelector<HTMLElement>(".provider-disclosure");
    (
      visibleOpener ??
      disclosure ??
      (activeTab === "overview"
        ? document.getElementById("account-context")
        : panel?.querySelector<HTMLElement>("h1"))
    )?.focus({ preventScroll: true });
    if (panel) panel.scrollTop = target?.scrollTop ?? 0;
  }
  // Tabs unmount their panels; keep only transient reading positions in the app shell.
  $effect(() => {
    const tab = activeTab;
    void tick().then(() => {
      if (activeTab !== tab) return;
      const panel = document.querySelector<HTMLElement>('[role="tabpanel"][data-state="active"]');
      if (panel) panel.scrollTop = tabScroll[tab] ?? 0;
    });
  });
  let scenario = $state<AccountDemoScenario>("multi");
  let snapshotNow = $state(Date.now());
  let demoAccountState = $derived(createAccountDemo(scenario, snapshotNow));
  let demoPreview = $state(false);
  let visibleAccountState = $derived(demoPreview ? demoAccountState : localAccountState);
  let showCodexDetails = $state(false);
  let codexSnapshot = $state<LiveCodexSnapshot>(disconnectedCodexSnapshot());
  let liveNowMs = $state(Date.now());
  let agedCodexSnapshot = $derived(ageCodexSnapshot(codexSnapshot, liveNowMs));
  let preferences = $state<Preferences>(readPreferences());
  let systemPrefersDark = $state(false);
  let resolvedTheme = $derived(
    preferences.theme === "system" ? (systemPrefersDark ? "dark" : "light") : preferences.theme,
  );
  let codexBusy = $state(false);
  let codexPolling = false;
  let codexRequestVersion = 0;
  let lastCodexStatusCheckMs = 0;
  let refreshCooldownUntilMs = $state(0);
  let codexNotice = $state("");
  let connectConsent = $state(false);
  let closeMessage = $state("");
  let preferenceMessage = $state("Theme choices are saved on this device.");
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
    if (enabled && !(await directController.disconnectAll())) {
      codexNotice =
        "Could not confirm monitoring stopped. Disconnect each Codex account before opening Demo.";
      return;
    }
    codexNotice = "";
    if (enabled && codexSnapshot.connectionStatus !== "disconnected") {
      const stopped = await disconnectCodex();
      if (!stopped) return;
    }
    if (enabled) {
      snapshotNow = Date.now();
      scenario = "multi";
    }
    accountNavigation = initialNavigation();
    collapsedProviders = [];
    navigationVersion++;
    demoPreview = enabled;
    showCodexDetails = false;
    connectConsent = false;
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
    if (!demoPreview) void directController.reconnectRemembered();
    let mediaQuery: MediaQueryList | null = null;
    const clock = window.setInterval(() => {
      liveNowMs = Date.now();
      if (!demoPreview) directController.refreshDue(liveNowMs);
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

  function chooseScenario(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (ACCOUNT_DEMO_SCENARIOS.some(([key]) => key === value)) {
      scenario = value as AccountDemoScenario;
      snapshotNow = Date.now();
    }
  }

  async function openCodexDetails() {
    showCodexDetails = true;
    await tick();
    document.getElementById("codex-details-title")?.focus();
  }

  async function closeCodexDetails() {
    showCodexDetails = false;
    await tick();
    document.querySelector<HTMLButtonElement>('[data-testid="open-codex-details"]')?.focus();
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
          class:connected={directConnectedCount > 0 ||
            agedCodexSnapshot.connectionStatus === "connected"}
          class:failed={agedCodexSnapshot.connectionStatus === "error" ||
            agedCodexSnapshot.connectionStatus === "unavailable" ||
            agedCodexSnapshot.connectionStatus === "incompatible" ||
            agedCodexSnapshot.connectionStatus === "unsupported"}
        >
          <span aria-hidden="true"></span>
          {directConnectedCount > 0
            ? `Codex live · ${directConnectedCount}`
            : agedCodexSnapshot.connectionStatus === "connected"
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

  <Tabs.Content
    class="view-content"
    value="overview"
    onscroll={(event) => {
      tabScroll.overview = event.currentTarget.scrollTop;
    }}
  >
    {#if demoPreview || CODEX_DIRECT_CONNECTION_AVAILABLE || !CODEX_CONNECTION_AVAILABLE}
      <AccountOverview
        state={visibleAccountState}
        synthetic={demoPreview}
        nowMs={demoPreview ? snapshotNow : liveNowMs}
        navigation={accountNavigation}
        oncontext={selectAccountContext}
        ondetails={openAccountDetails}
        onback={backAccountContext}
        onrefresh={!demoPreview && CODEX_DIRECT_CONNECTION_AVAILABLE && directConnectedCount > 0
          ? () => void directController.refreshAll()
          : undefined}
        refreshing={Object.values(directPresentations).some((p) => p?.busy)}
      />
    {:else if showCodexDetails}
      <div class="view-heading">
        <div>
          <h1 id="codex-details-title" tabindex="-1">Codex Details</h1>
          <p>Disconnected · no selected account</p>
        </div>
        <Button variant="outline" size="sm" onclick={closeCodexDetails}>Back</Button>
      </div>
      <CodexDetails
        source="live"
        monitoring={agedCodexSnapshot.monitoring}
        windows={agedCodexSnapshot.windows}
        dataStatus={agedCodexSnapshot.dataStatus}
        fetchedAtMs={agedCodexSnapshot.fetchedAtMs}
        connectionStatus={agedCodexSnapshot.connectionStatus}
        nowMs={liveNowMs}
      />
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
          <span class="empty-icon" aria-hidden="true"><Command size={20} strokeWidth={1.8} /></span>
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

      <Button
        variant="outline"
        class="codex-details-link"
        onclick={openCodexDetails}
        data-testid="open-codex-details"
      >
        Codex Details · Activity <span aria-hidden="true">→</span>
      </Button>
    {/if}
  </Tabs.Content>

  <Tabs.Content
    class="view-content"
    value="accounts"
    onscroll={(event) => {
      tabScroll.accounts = event.currentTarget.scrollTop;
    }}
  >
    {#if demoPreview}
      <AccountsPanel
        state={demoAccountState}
        nowMs={snapshotNow}
        bind:collapsedProviders
        onoverview={openAccountOverview}
        ondetails={openAccountDetails}
      />
    {:else}
      <LocalAccounts
        state={localAccountState}
        nowMs={liveNowMs}
        store={localStore}
        onstate={(state) => directController.updateMetadata(state)}
        direct={directController}
        presentations={directPresentations}
        bind:collapsedProviders
        onoverview={openAccountOverview}
        ondetails={openAccountDetails}
      />
      {#if CODEX_CONNECTION_AVAILABLE}
        <div class="view-heading">
          <div>
            <h1>Accounts</h1>
            <p>
              {CODEX_CONNECTION_AVAILABLE
                ? "Connect a local Codex session"
                : "No accounts configured · live connection unavailable"}
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
              class:connected={directConnectedCount > 0 ||
                agedCodexSnapshot.connectionStatus === "connected"}
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
                subscription limits through your existing Codex session. Codex may refresh or save
                its own credentials and applies its normal sign-in and workspace policies.
              </p>
              <p>
                Quotafern would not send agent turns or remember this connection. Disconnect would
                stop Quotafern monitoring without signing out of Codex CLI. A native system dialog
                would ask for confirmation before any Codex process starts.
              </p>
            </div>
            <label class="codex-consent-check">
              <input
                type="checkbox"
                bind:checked={connectConsent}
                disabled={codexBusy || !CODEX_CONNECTION_AVAILABLE}
              />
              <span>I understand and want to continue to native confirmation.</span>
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
            Validated quota windows, optional credit/spending/reset metadata and daily token
            activity returned by Codex. No inference, purchasing or reset redemption. Only
            appearance preferences and non-sensitive local labels are saved in browser storage.
          </p>
          <Button variant="link" class="text-action" onclick={() => (activeTab = "overview")}
            >View usage <span aria-hidden="true">→</span></Button
          >
        </section>
      {/if}
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
          {#each ACCOUNT_DEMO_SCENARIOS as item (item[0])}
            <option value={item[0]}>{item[1]}</option>
          {/each}
        </select>
        <p>
          Development-only fixture selection. Release Demo uses the multiple-account example.
          Nothing is saved.
        </p>
      </section>
    {/if}

    <section class="settings-group">
      <h2>Account preferences</h2>
      <p>
        Manage local account and connection labels in Accounts with Demo off. Labels persist on this
        device; sessions, authorization and usage do not.
      </p>
    </section>

    <section class="privacy-note">
      <span class="privacy-icon" aria-hidden="true"><Leaf size={15} strokeWidth={1.9} /></span>
      <p>
        Quotafern saves appearance preferences and non-sensitive local account metadata. Do not put
        secrets in labels. No credentials, authorization or usage history are stored.
      </p>
    </section>
  </Tabs.Content>

  <footer class="popup-footer">
    <span>
      <span
        class="footer-dot"
        class:preview={demoPreview}
        class:connected={directConnectedCount > 0 ||
          agedCodexSnapshot.connectionStatus === "connected"}
        class:failed={agedCodexSnapshot.connectionStatus !== "connected" &&
          agedCodexSnapshot.connectionStatus !== "disconnected"}
        aria-hidden="true"
      ></span>
      {demoPreview
        ? "Demo preview · synthetic data"
        : directConnectedCount > 0 || agedCodexSnapshot.connectionStatus === "connected"
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
