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
  let snapshot = $derived(createDemoSnapshot(scenario));
  let preferences = $state<Preferences>(readPreferences());
  let systemPrefersDark = $state(false);
  let resolvedTheme = $derived(
    preferences.theme === "system" ? (systemPrefersDark ? "dark" : "light") : preferences.theme,
  );
  let isRefreshing = $state(false);
  let refreshMessage = $state("");
  let closeMessage = $state("");
  let preferenceMessage = $state("Theme choices are saved on this device.");
  let localRefreshLabel = $state("");

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
    try {
      mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      systemPrefersDark = mediaQuery.matches;
      mediaQuery.addEventListener("change", handleSystemTheme);
    } catch {
      // The explicit light theme remains the safe fallback when matchMedia is unavailable.
    }
    window.addEventListener("storage", handleStorage);
    return () => {
      mediaQuery?.removeEventListener("change", handleSystemTheme);
      window.removeEventListener("storage", handleStorage);
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
        closeMessage = "Couldn’t hide this popup. Try opening it again from the tray.";
      }
      return;
    }
    closeMessage = "This browser preview can’t hide its window. Use the browser’s close control.";
  }
</script>

<svelte:head>
  <title>Quotafern · Demo</title>
  <meta name="description" content="A local, synthetic preview of CLI quota status." />
</svelte:head>

<Tabs.Root class="popup" bind:value={activeTab} orientation="horizontal">
  <header class="topbar">
    <div class="brand-lockup">
      <span class="brand-mark" aria-hidden="true"><Leaf size={17} strokeWidth={2.1} /></span>
      <div class="brand-copy">
        <span class="brand-name">Quotafern</span>
        <span class="brand-caption">Local usage preview</span>
      </div>
    </div>
    <div class="topbar-actions">
      <span class="demo-badge"><span class="demo-dot" aria-hidden="true"></span>Demo</span>
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
    <div class="view-heading">
      <div>
        <h1>Usage overview</h1>
        <p>Three synthetic CLI profiles</p>
      </div>
      <Button
        class="refresh-button"
        variant="outline"
        size="sm"
        onclick={refreshDemo}
        disabled={isRefreshing}
        aria-label="Refresh local demo sample"
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
        <span>Offline / stale sample · captured {formatFetchedAt(snapshot.providers[0])}</span>
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
            <div class="window-grid" aria-label={`${provider.name} quota windows`}>
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
        <span class="empty-icon" aria-hidden="true"><UsersRound size={20} strokeWidth={1.8} /></span
        >
        <h2 id="empty-title">No demo accounts yet</h2>
        <p>
          This scenario has no sample profiles. Choose another fixture in Settings to preview usage
          states.
        </p>
        <Button variant="link" class="text-action" onclick={() => (activeTab = "settings")}
          >Open demo settings <span aria-hidden="true">→</span></Button
        >
      </section>
    {/if}

    <div class="source-note">
      <span class="note-dot" aria-hidden="true"></span><span
        >Illustrative data only · no provider is connected</span
      >
    </div>
    {#if localRefreshLabel}
      <p class="refresh-caption">Last preview refresh: {localRefreshLabel}</p>
    {/if}
  </Tabs.Content>

  <Tabs.Content class="view-content" value="accounts">
    <div class="view-heading">
      <div>
        <h1>Accounts</h1>
        <p>Sample profiles for CLI tools</p>
      </div>
    </div>

    <div class="account-list" aria-label="Synthetic demo profiles">
      {#each snapshot.providers as provider (provider.id)}
        <div class="account-row">
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
  </Tabs.Content>

  <Tabs.Content class="view-content settings-content" value="settings">
    <div class="view-heading">
      <div>
        <h1>Settings</h1>
        <p>Choose how this preview looks</p>
      </div>
    </div>

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
      <div class="palette-options" aria-label="Color palette">
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

    {#if isDevelopment}
      <section class="settings-group scenario-group">
        <label for="demo-scenario">Demo scenario</label>
        <select id="demo-scenario" value={scenario} onchange={chooseScenario}>
          {#each DEMO_SCENARIOS as item (item.value)}
            <option value={item.value}>{item.label}</option>
          {/each}
        </select>
        <p>Development preview only. Production remains on synthetic healthy data.</p>
      </section>
    {/if}

    <section class="privacy-note">
      <span class="privacy-icon" aria-hidden="true"><Leaf size={15} strokeWidth={1.9} /></span>
      <p>No credentials or provider tokens are stored. Only theme preferences are saved locally.</p>
    </section>
  </Tabs.Content>

  <footer class="popup-footer">
    <span><span class="footer-dot" aria-hidden="true"></span>Demo data · local preview</span>
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
