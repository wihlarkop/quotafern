async (page) => {
  /* FIXTURE */
  const results = [];
  const failures = [];
  const errors = [];
  const assert = (ok, label) => {
    results.push({ label, passed: !!ok });
    if (!ok) failures.push(label);
  };
  const browser = page.context().browser();
  const contexts = [];
  const screenshots = [];
  const externalRequests = [];
  const base = "QA_BASE_URL";
  const capture = async (p, name) => {
    const canonical = [
      "accounts-light",
      "accounts-dark",
      "add-account",
      "consent-light",
      "consent-dark",
    ].includes(name);
    const path = `${canonical ? "docs/evidence/ux-03" : ".tmp/qa/screenshots/ux-03"}/QA_MODE-${name}.png`;
    screenshots.push({ name, path });
    await p.screenshot({ path, scale: "css" });
  };
  const fresh = async (count, theme = "light", width = 420, height = 740, configure) => {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
    contexts.push(context);
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "127.0.0.1") return route.continue();
      externalRequests.push(url.origin);
      return route.abort();
    });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await installUx03Fixture(p, count, theme);
    if (configure) await p.addInitScript(configure);
    await p.goto(base);
    await p.getByRole("tab", { name: "Accounts", exact: true }).click();
    await p.getByRole("tabpanel", { name: "Accounts", exact: true }).waitFor();
    return p;
  };
  const panel = (p) => p.getByRole("tabpanel", { name: "Accounts", exact: true });
  const row = (p, n) =>
    panel(p).locator(
      `[data-account-id="account_d0030000-0000-4000-8000-${String(n).padStart(12, "0")}"]`,
    );
  const menu = async (p, n, action) => {
    await row(p, n)
      .getByRole("button", { name: /^Actions for/ })
      .click();
    await p.getByRole("menuitem", { name: action, exact: true }).click();
  };
  const audit = async (p, label) => {
    const m = await p.evaluate(() => {
      const active = document.querySelector('[role="tabpanel"][data-state="active"]');
      return {
        doc: document.documentElement.scrollWidth <= innerWidth + 1,
        panel: active.scrollWidth <= active.clientWidth + 1,
        theme: document.documentElement.dataset.theme,
      };
    });
    assert(m.doc && m.panel, `${label}: no horizontal overflow`);
    return m;
  };
  try {
    for (const theme of ["light", "dark"]) {
      const p = await fresh(3, theme);
      await row(p, 3).getByText("Stale quota", { exact: false }).waitFor();
      assert(
        await row(p, 1).getByText("Current quota", { exact: false }).isVisible(),
        `${theme}: current reading remains current`,
      );
      assert(
        (await row(p, 1).locator(".account-summary-meta").innerText()) === "Codex",
        `${theme}: missing plan is omitted`,
      );
      assert(
        (await row(p, 2).locator(".account-summary-meta").innerText()) === "Codex · Plus",
        `${theme}: reported Plus plan`,
      );
      assert(
        (await row(p, 3).locator(".account-summary-meta").innerText()) === "Codex · Free",
        `${theme}: reported Free plan`,
      );
      assert(
        (await panel(p).locator(".local-action-trigger:visible").count()) === 3,
        `${theme}: one menu per ordinary account`,
      );
      const text = await panel(p).innerText();
      assert(
        !/Local alias|CLI session label|Connect each account separately|Identity not verified|Descriptor only|No quota source|Shared by 1/.test(
          text,
        ),
        `${theme}: redundant copy absent`,
      );
      const metrics = await audit(p, theme);
      assert(metrics.theme === theme, `${theme}: appearance preserved`);
      await capture(p, `accounts-${theme}`);
      if (theme === "light") {
        await p.getByRole("button", { name: "Add account", exact: true }).click();
        const dialog = p.getByRole("dialog");
        assert(
          await p.locator("#local-provider").evaluate((e) => e === document.activeElement),
          "Add starts at provider selection",
        );
        assert(
          (await dialog.locator("option:not(:disabled)").count()) === 3,
          "only Codex provider and two login choices are selectable",
        );
        await capture(p, "add-account");
        const before = await p.evaluate(() => window.__ux03.calls.length);
        await p.keyboard.press("Escape");
        assert(
          await p.locator("#local-add-account").evaluate((e) => e === document.activeElement),
          "Add cancellation restores focus",
        );
        assert(
          await p.evaluate((n) => window.__ux03.calls.length === n, before),
          "Add cancellation makes no native request",
        );
        await menu(p, 2, "Rename account");
        await p
          .getByRole("textbox", { name: "Account name", exact: true })
          .fill("制作チーム🌿".repeat(10));
        await p.getByRole("button", { name: "Save", exact: true }).click();
        await p.getByRole("dialog").waitFor({ state: "detached" });
        assert(
          await row(p, 2)
            .getByRole("button", { name: /^Actions for/ })
            .evaluate((e) => e === document.activeElement),
          "Rename restores account menu focus",
        );
        await p.setViewportSize({ width: 320, height: 620 });
        await audit(p, "long aliases 320px");
        await capture(p, "long-alias-narrow");
        await p.setViewportSize({ width: 420, height: 740 });
        await menu(p, 1, "Disconnect");
        await row(p, 1).getByText("Disconnected", { exact: true }).waitFor();
        assert(
          await row(p, 2).getByText("Connected", { exact: true }).isVisible(),
          "Disconnect preserves another account",
        );
        await p.evaluate(
          () =>
            (window.__ux03.modes["connection_d0030000-0000-4000-8000-000000000001"] =
              "auth-required"),
        );
        await menu(p, 1, "Connect");
        await row(p, 1).getByText("Sign-in needed", { exact: true }).waitFor();
        await p.evaluate(
          () =>
            (window.__ux03.modes["connection_d0030000-0000-4000-8000-000000000002"] =
              "cleanup-failed"),
        );
        await menu(p, 2, "Remove…");
        await p.getByRole("button", { name: "Remove", exact: true }).click();
        await p
          .getByText(
            "Could not confirm monitoring stopped. Try Disconnect before removing this account.",
            { exact: true },
          )
          .waitFor();
        assert((await row(p, 2).count()) === 1, "Failed cleanup retains account");
        await p.keyboard.press("Escape");
        await p.evaluate(
          () =>
            (window.__ux03.modes["connection_d0030000-0000-4000-8000-000000000002"] = "connected"),
        );
        await menu(p, 2, "Remove…");
        await p.getByRole("button", { name: "Remove", exact: true }).click();
        await p.getByRole("dialog").waitFor({ state: "detached" });
        assert(
          (await row(p, 2).count()) === 0 && (await row(p, 3).count()) === 1,
          "Successful remove preserves other accounts",
        );
        const calls = await p.evaluate(() => window.__ux03.calls);
        assert(
          calls.some(
            (c) => c.command === "codex_direct_disconnect" && c.args.accountId.endsWith("000002"),
          ),
          "Remove targets native cleanup by account ID",
        );
        await capture(p, "connection-states");
        await p.getByRole("tab", { name: "Overview", exact: true }).click();
        const overview = p.getByRole("tabpanel", { name: "Overview", exact: true });
        assert(
          await overview.getByText("Sign-in needed", { exact: false }).isVisible(),
          "Overview exposes failed connection alongside quota",
        );
        assert(
          await overview.getByText("0%", { exact: true }).isVisible(),
          "Confirmed zero remains zero",
        );
        assert(
          (await overview.locator("[data-source-id]").count()) === 1,
          "No duplicate or disconnected source",
        );
        await capture(p, "overview");
        await overview.getByRole("button", { name: /^View .* details$/ }).click();
        await overview.getByRole("heading", { name: "Codex Details" }).waitFor();
        assert(
          await overview.getByText("5 hours window", { exact: true }).isVisible(),
          "Human readable quota duration",
        );
        await capture(p, "details");
        await p.getByRole("button", { name: "Back", exact: true }).click();
        assert(
          await overview
            .getByRole("button", { name: /^View .* details$/ })
            .evaluate((e) => e === document.activeElement),
          "Details Back restores opener",
        );
      }
      await p.close();
    }
    for (const count of [0, 1]) {
      const p = await fresh(count);
      if (count === 0)
        assert(
          await p.getByRole("heading", { name: "No accounts yet" }).isVisible(),
          "Zero accounts has useful empty state",
        );
      else await row(p, 1).getByText("Current quota", { exact: false }).waitFor();
      await capture(p, count ? "one-account" : "zero-accounts");
      if (count === 0) {
        for (const kind of ["system", "managed"]) {
          await p.getByRole("button", { name: "Add account", exact: true }).click();
          await p.getByRole("combobox", { name: "Codex account", exact: true }).selectOption(kind);
          await p.getByRole("button", { name: "Continue", exact: true }).click();
          await p.getByRole("dialog").waitFor({ state: "detached" });
          await p.waitForFunction(
            (kind) =>
              window.__ux03.calls.some(
                (c) => c.command === `codex_direct_${kind === "managed" ? "login" : "connect"}`,
              ),
            kind,
          );
          const fixture = await p.evaluate(() => ({
            calls: window.__ux03.calls,
            overlap: window.__ux03.overlappingDialog,
            metadata: JSON.parse(localStorage.getItem("quotafern.account-presentation.v1")),
          }));
          assert(
            !fixture.overlap,
            `${kind}: native consent requested only after local dialog closes`,
          );
          assert(
            fixture.metadata.accounts.at(-1).alias ===
              (kind === "managed" ? "Another Codex account" : "Existing Codex"),
            `${kind}: optional name has sensible default`,
          );
          const c = fixture.calls.findLast(
            (c) => c.command === `codex_direct_${kind === "managed" ? "login" : "connect"}`,
          );
          assert(
            c.args.connectionId === fixture.metadata.connections.at(-1).id,
            `${kind}: Add targets new connection ID`,
          );
        }
      }
      await p.close();
    }
    const multiConnection = await fresh(1, "light", 420, 740, () => {
      const originalClock = Date.now;
      Date.now = () => originalClock() + (window.__ux03.timeOffset ?? 0);
      const key = "quotafern.account-presentation.v1";
      const data = JSON.parse(localStorage.getItem(key));
      const workspaceId = "workspace_d0030000-0000-4000-8000-000000000004";
      data.workspaces.push({ id: workspaceId, accountId: data.accounts[0].id, alias: "Research" });
      data.connections.push({
        id: "connection_d0030000-0000-4000-8000-000000000004",
        accountId: data.accounts[0].id,
        workspaceId,
        alias: "Research connection",
        mechanism: "codex-managed",
      });
      localStorage.setItem(key, JSON.stringify(data));
    });
    await panel(multiConnection).getByText("2 connections", { exact: true }).click();
    const research = panel(multiConnection).locator(
      '[data-connection-id="connection_d0030000-0000-4000-8000-000000000004"]',
    );
    // Preserve the native controller's existing one-active-connection-per-account guard.
    const existingConnection = panel(multiConnection).locator(
      '[data-connection-id="connection_d0030000-0000-4000-8000-000000000001"]',
    );
    await existingConnection.getByText("Connected", { exact: true }).waitFor();
    await existingConnection.getByRole("button", { name: /^Actions for/ }).click();
    await multiConnection.getByRole("menuitem", { name: "Disconnect", exact: true }).click();
    await existingConnection.getByText("Disconnected", { exact: true }).waitFor();
    await research.getByRole("button", { name: /^Actions for/ }).click();
    await multiConnection.getByRole("menuitem", { name: "Connect", exact: true }).click();
    await research.getByText("Connected", { exact: true }).waitFor();
    assert(
      await multiConnection.evaluate(() =>
        window.__ux03.calls.some(
          (c) => c.command === "codex_direct_connect" && c.args.connectionId.endsWith("000004"),
        ),
      ),
      "Expanded connection action targets its own connection",
    );
    await research.getByRole("button", { name: /^Actions for/ }).click();
    await multiConnection.getByRole("menuitem", { name: "Disconnect", exact: true }).click();
    await multiConnection.evaluate(
      () => (window.__ux03.modes["connection_d0030000-0000-4000-8000-000000000004"] = "error"),
    );
    await research.getByRole("button", { name: /^Actions for/ }).click();
    await multiConnection.getByRole("menuitem", { name: "Connect", exact: true }).click();
    await research.getByText("Reconnect required", { exact: true }).waitFor();
    await panel(multiConnection).getByText("2 connections", { exact: true }).click();
    assert(
      await panel(multiConnection)
        .getByText("Research connection · Reconnect required", { exact: true })
        .isVisible(),
      "Collapsed connections retain meaningful failure warning",
    );
    await capture(multiConnection, "reconnect-required");
    await panel(multiConnection).getByText("2 connections", { exact: true }).click();
    await multiConnection.evaluate(
      () =>
        (window.__ux03.modes["connection_d0030000-0000-4000-8000-000000000004"] = "auth-required"),
    );
    await research.getByRole("button", { name: /^Actions for/ }).click();
    await multiConnection.getByRole("menuitem", { name: "Reconnect", exact: true }).click();
    await research.getByText("Sign-in needed", { exact: true }).waitFor();
    await multiConnection.evaluate(
      () => (window.__ux03.modes["connection_d0030000-0000-4000-8000-000000000004"] = "connected"),
    );
    await research.getByRole("button", { name: /^Actions for/ }).click();
    await multiConnection.getByRole("menuitem", { name: "Sign in again", exact: true }).click();
    await research.getByText("Connected", { exact: true }).waitFor();
    assert(
      await multiConnection.evaluate(() =>
        window.__ux03.calls.some(
          (c) => c.command === "codex_direct_login" && c.args.connectionId.endsWith("000004"),
        ),
      ),
      "Managed Sign in again targets correct native connection",
    );
    // Move only the fixture clock past the real controller's cooldown; no waiting or native access.
    await multiConnection.evaluate(() => {
      window.__ux03.timeOffset = 31000;
    });
    await research.getByRole("button", { name: /^Actions for/ }).click();
    await multiConnection.getByRole("menuitem", { name: "Refresh", exact: true }).click();
    await multiConnection.waitForFunction(() =>
      window.__ux03.calls.some((c) => c.command === "codex_direct_refresh"),
    );
    assert(
      await multiConnection.evaluate(() =>
        window.__ux03.calls
          .filter((c) => c.command === "codex_direct_refresh")
          .every((c) => c.args.connectionId.endsWith("000004")),
      ),
      "Per-connection Refresh preserves action target and cooldown",
    );
    await panel(multiConnection)
      .getByRole("button", { name: /Research workspace overview/ })
      .click();
    const workspaceView = multiConnection.getByRole("tabpanel", { name: "Overview", exact: true });
    await workspaceView.getByRole("heading", { name: "Usage overview" }).waitFor();
    assert(
      (await workspaceView.locator("[data-source-id]").count()) === 1,
      "Workspace selection shows only its own source",
    );
    await capture(multiConnection, "workspace-overview");
    await multiConnection.close();
    // Existing demo scenarios exercise many-to-one sources without native access.
    const demo = await fresh(0);
    await demo.getByRole("tab", { name: "Settings", exact: true }).click();
    await demo.getByRole("checkbox", { name: "Show synthetic quota examples" }).check();
    const scenario = demo.getByRole("combobox", { name: /scenario/i });
    if ("QA_MODE" === "source") await scenario.selectOption("shared");
    await demo.getByRole("tab", { name: "Overview", exact: true }).click();
    if ("QA_MODE" === "source") {
      assert(
        (await demo
          .getByRole("tabpanel", { name: "Overview", exact: true })
          .locator("[data-source-id]")
          .count()) === 1,
        "Shared quota rendered once",
      );
      assert(
        await demo.getByText("Shared quota · 2 connections", { exact: true }).isVisible(),
        "Meaningful shared association remains visible",
      );
    }
    await demo.getByRole("tab", { name: "Accounts", exact: true }).click();
    await panel(demo).getByText("2 connections", { exact: true }).click();
    assert(
      (await panel(demo).locator(".owned-connection-list [data-connection-id]:visible").count()) ===
        2,
      "Multiple connections available through disclosure",
    );
    await capture(demo, "shared-connections");
    await demo.close();
    for (const theme of ["light", "dark"]) {
      const p = await fresh(0, theme, theme === "dark" ? 360 : 460, theme === "dark" ? 420 : 580);
      await p.goto(base + "/consent.html");
      await p.getByRole("button", { name: "Allow connection", exact: true }).waitFor();
      assert(
        await p.locator("#cancel-consent").evaluate((e) => e === document.activeElement),
        `${theme}: consent begins on Cancel`,
      );
      assert(
        await p
          .locator(".consent-source")
          .getByText(/supervised local App Server/)
          .isVisible(),
        `${theme}: helper disclosure remains visible`,
      );
      const fits = await p.evaluate(() => {
        const b = document.querySelector("footer").getBoundingClientRect();
        return (
          b.bottom <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1
        );
      });
      assert(fits, `${theme}: consent actions fit short window`);
      await capture(p, `consent-${theme}`);
      if (theme === "light") {
        await p.keyboard.press("Escape");
        await p.waitForFunction(() =>
          window.__ux03.calls.some((c) => c.command === "codex_consent_cancel"),
        );
        assert(
          await p.evaluate(
            () =>
              window.__ux03.calls.filter((c) => c.command === "codex_consent_cancel").length === 1,
          ),
          "Consent Escape sends one cancellation",
        );
      } else {
        await p.getByRole("button", { name: "Allow connection", exact: true }).click();
        assert(
          await p.evaluate(
            () =>
              window.__ux03.calls.filter(
                (c) =>
                  c.command === "codex_consent_confirm" && /^[a-f0-9]{64}$/.test(c.args.challenge),
              ).length === 1,
          ),
          "Consent sends one native-owned challenge",
        );
      }
      assert(
        await p.evaluate(() =>
          window.__ux03.calls.every((c) => c.command.startsWith("codex_consent_")),
        ),
        `${theme}: consent entry never mounts provider operations`,
      );
      await p.close();
    }
    assert(errors.length === 0, `No browser runtime errors: ${errors.join("; ")}`);
    assert(
      externalRequests.length === 0,
      "No external HTTP requests; IPC and credentials are synthetic",
    );
    return { mode: "QA_MODE", checks: results.length, failures, results, screenshots };
  } catch (error) {
    failures.push(String(error));
    const diagnostics = [];
    for (const c of contexts)
      for (const p of c.pages()) {
        if (!p.isClosed())
          diagnostics.push(
            await p
              .evaluate(() => ({ text: document.body.innerText, calls: window.__ux03?.calls }))
              .catch(() => null),
          );
      }
    return { mode: "QA_MODE", checks: results.length, failures, results, screenshots, diagnostics };
  } finally {
    for (const c of contexts) await c.close();
  }
};
