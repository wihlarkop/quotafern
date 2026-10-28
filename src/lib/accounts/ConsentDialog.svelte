<script lang="ts">
  import { Leaf, ShieldCheck } from "@lucide/svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";

  import { Button } from "../components/ui/button";

  type Prompt = { challenge: string; source: string; summary: string; detail: string };
  let prompt = $state<Prompt | null>(null);
  let busy = $state(false);
  let error = $state("");
  onMount(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    document.documentElement.dataset.palette = "graphite-jade";
    document.documentElement.dataset.theme = media.matches ? "dark" : "light";
    void invoke<Prompt>("codex_consent_prompt")
      .then((value) => {
        if (
          !value ||
          !/^[a-f0-9]{64}$/.test(value.challenge) ||
          !["Existing Codex account", "Separate Codex account"].includes(value.source) ||
          typeof value.summary !== "string" ||
          typeof value.detail !== "string"
        )
          throw Error("invalid prompt");
        prompt = value;
        requestAnimationFrame(() => document.getElementById("cancel-consent")?.focus());
      })
      .catch(() => {
        error = "This confirmation has expired. Close this window, then choose Connect again.";
      });
  });
  async function decide(approve: boolean) {
    if (!prompt || busy) return;
    busy = true;
    try {
      await invoke(approve ? "codex_consent_confirm" : "codex_consent_cancel", {
        challenge: prompt.challenge,
      });
    } catch {
      error = "This confirmation has expired. Close this window, then choose Connect again.";
      busy = false;
    }
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      void decide(false);
    }
    if (event.key === "Tab") {
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>("summary, button:not(:disabled)"),
      );
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }
</script>

<svelte:window onkeydown={keydown} />
<div
  class="consent-page"
  role="dialog"
  aria-modal="true"
  aria-labelledby="consent-title"
  aria-describedby="consent-lead"
  tabindex="-1"
>
  <div class="consent-brand"><Leaf size={18} aria-hidden="true" /><span>Quotafern</span></div>
  <header class="consent-heading">
    <h1 id="consent-title">Connect to Codex</h1>
    <p class="consent-lead" id="consent-lead">
      Read this account’s quota and remember permission to reconnect when Quotafern opens.
    </p>
  </header>
  <div class="consent-content">
    {#if prompt}
      <section class="consent-source" aria-label="Selected connection" aria-live="polite">
        <h2><ShieldCheck size={17} aria-hidden="true" />{prompt.source}</h2>
        <p>
          {prompt.source === "Existing Codex account"
            ? "Uses your existing Codex login. This may start a supervised local App Server."
            : "Uses a separate Codex login for this account. Your existing Codex login stays unchanged."}
        </p>
      </section>
      <p class="consent-lifecycle">
        <strong>Disconnect</strong> stops monitoring and revokes this permission. Quitting keeps it for
        the next launch.
      </p>
      <details>
        <summary>Connection and authentication details</summary>
        <p>{prompt.summary}</p>
        <p>{prompt.detail}</p>
        <p>
          Quota refreshes every three minutes while connected. Codex manages authentication and may
          update its own sign-in state.
        </p>
      </details>
    {:else if !error}
      <p role="status">Preparing secure confirmation…</p>
    {/if}
    <p class="consent-error" role="alert">{error}</p>
  </div>
  <footer>
    <Button
      id="cancel-consent"
      variant="outline"
      disabled={!prompt || busy}
      onclick={() => decide(false)}>Cancel</Button
    >
    <Button disabled={!prompt || busy || !!error} onclick={() => decide(true)}
      >{busy ? "Closing…" : "Allow connection"}</Button
    >
  </footer>
</div>

<style>
  :global(html),
  :global(body),
  :global(#consent) {
    margin: 0;
    min-width: 0;
    width: 100%;
    height: 100%;
  }
  .consent-page {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    color: var(--text);
  }
  .consent-brand {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 20px 24px 0;
    color: var(--accent);
    font-weight: 650;
  }
  .consent-heading {
    padding: 20px 24px 0;
    flex-shrink: 0;
  }
  .consent-content {
    min-height: 0;
    padding: 20px 24px;
    flex: 1;
    overflow-y: auto;
  }
  h1 {
    margin: 0 0 12px;
    font-size: 22px;
    font-weight: 650;
    line-height: 1.25;
  }
  p {
    margin: 0;
    line-height: 1.6;
  }
  .consent-lead {
    font-size: 14px;
  }
  .consent-source {
    margin-top: 0;
    padding: 14px;
    border-radius: var(--radius-control);
    background: var(--surface-inset);
  }
  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 650;
  }
  .consent-source p,
  .consent-lifecycle,
  details {
    color: var(--muted);
  }
  .consent-lifecycle {
    margin-top: 16px;
  }
  strong {
    color: var(--text);
    font-weight: 600;
  }
  details {
    margin-top: 16px;
    font-size: 12px;
  }
  summary {
    cursor: pointer;
    text-underline-offset: 3px;
  }
  summary:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 3px;
    border-radius: 3px;
  }
  details p {
    margin-top: 10px;
    overflow-wrap: anywhere;
  }
  .consent-error {
    color: var(--critical-ink);
    margin-top: 12px;
  }
  .consent-error:empty {
    display: none;
  }
  footer {
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 16px 24px;
    border-top: 1px solid var(--border);
    background: var(--surface-raised);
  }
  @media (max-width: 380px) {
    .consent-heading {
      padding-inline: 20px;
    }
    .consent-content {
      padding: 20px;
    }
    footer {
      padding: 16px 20px;
    }
  }
</style>
