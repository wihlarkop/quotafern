// Isolated browser-only IPC fiction. Never imported by the application or native build.
async function installUx03Fixture(page, count = 3, theme = "light") {
  await page.addInitScript(
    ({ count, theme }) => {
      const id = (kind, n) => `${kind}_d0030000-0000-4000-8000-${String(n).padStart(12, "0")}`;
      const metadata = {
        version: 1,
        accounts: ["Existing Codex", "Managed Plus", "Managed Free"]
          .slice(0, count)
          .map((alias, i) => ({ id: id("account", i + 1), providerId: "codex", alias })),
        connections: ["cli-session", "codex-managed", "codex-managed"]
          .slice(0, count)
          .map((mechanism, i) => ({
            id: id("connection", i + 1),
            accountId: id("account", i + 1),
            workspaceId: null,
            alias: i ? "Separate Codex account" : "Existing Codex account",
            mechanism,
          })),
        workspaces: [],
      };
      localStorage.clear();
      localStorage.setItem("quotafern.account-presentation.v1", JSON.stringify(metadata));
      localStorage.setItem("quotafern.appearance.mode.v1", theme);
      window.__ux03 = {
        calls: [],
        modes: {},
        remembered: true,
        cancel: false,
        overlappingDialog: false,
      };
      Object.defineProperty(navigator, "platform", { get: () => "Win32" });
      window.isTauri = true;
      window.__TAURI_INTERNALS__ = {
        invoke: async (command, args = {}) => {
          const fixture = window.__ux03;
          fixture.calls.push({ command, args });
          if (
            ["codex_direct_connect", "codex_direct_login"].includes(command) &&
            document.querySelector("dialog[open]")
          )
            fixture.overlappingDialog = true;
          if (command === "codex_consent_prompt")
            return {
              challenge: "a".repeat(64),
              source: "Existing Codex account",
              summary:
                "Uses Quotafern's reviewed private Codex helper. Codex may renew its sign-in, fetch cloud configuration and refresh its model catalogue. Remote Control stays disabled.",
              detail:
                "Synthetic disclosure fixture. Starts a supervised local App Server. Codex owns authentication and may update its own sign-in state. No inference or purchases.",
            };
          if (command === "codex_consent_confirm" || command === "codex_consent_cancel") return;
          if (command === "codex_direct_remembered")
            return fixture.remembered
              ? metadata.connections.map((c, i) => ({
                  accountId: c.accountId,
                  connectionId: c.id,
                  kind: i ? "managed" : "system",
                  allowed: true,
                }))
              : [];
          if (!command.startsWith("codex_direct_"))
            throw Error("Unexpected fixture command: " + command);
          const index = metadata.connections.findIndex((c) => c.id === args.connectionId);
          const mode = fixture.modes[args.connectionId] || "connected";
          const disconnected = command === "codex_direct_disconnect" || fixture.cancel;
          if (command === "codex_direct_disconnect" && mode === "cleanup-failed")
            throw "directCleanupFailed";
          const status = disconnected
            ? "disconnected"
            : mode === "auth-required"
              ? "auth-required"
              : mode === "error"
                ? "error"
                : "connected";
          return {
            accountId: args.accountId,
            connectionId: args.connectionId,
            generation: 1,
            connectionStatus: status,
            dataStatus:
              status === "connected"
                ? mode === "stale" || index === 2
                  ? "stale"
                  : "current"
                : "unknown",
            windows:
              status === "connected"
                ? [
                    {
                      id: "five-hour",
                      name: "5-hour",
                      remainingPercent: index === 2 ? 0 : 72,
                      resetAtMs: Date.now() + 7200000,
                      windowDurationMins: 300,
                    },
                  ]
                : [],
            plan: status !== "connected" || index === 0 ? null : index === 2 ? "Free" : "Plus",
            credits: null,
            fetchedAtMs:
              status === "connected"
                ? Date.now() - (index === 2 || mode === "stale" ? 1200000 : 0)
                : null,
            diagnostic: fixture.cancel
              ? "nativeConsentCancelled"
              : status === "auth-required"
                ? "directAuthenticationRequired"
                : status === "error"
                  ? "directNetworkFailed"
                  : null,
          };
        },
      };
    },
    { count, theme },
  );
}
