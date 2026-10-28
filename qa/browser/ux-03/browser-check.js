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
      "add-380-light",
      "add-320-dark",
      "settings-light",
      "settings-dark",
      "selector-three",
      "view-quota",
    ].includes(name);
    const path = `${canonical ? "docs/evidence/ux-03b" : ".tmp/qa/screenshots/ux-03b"}/QA_MODE-${name}.png`;
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
          await p.locator("#codex-kind-system").evaluate((e) => e === document.activeElement),
          "Add starts on the existing-login radio",
        );
        assert(
          (await dialog.getByRole("radio").count()) === 2 &&
            (await dialog.getByRole("combobox").count()) === 0,
          "Fixed Codex provider and two clear login choices",
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
          await p
            .getByRole("radio", {
              name: kind === "system" ? "Use existing Codex login" : "Sign in with another account",
              exact: true,
            })
            .check();
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
    // UX-03B compact Add, Appearance-first Settings, selector and Overview navigation.
    for (const [width, theme] of [
      [380, "light"],
      [320, "dark"],
    ]) {
      const p = await fresh(3, theme, width, 660);
      await row(p, 3).getByText("Stale quota", { exact: false }).waitFor();
      await p.getByRole("button", { name: "Add account", exact: true }).click();
      const dialog = p.getByRole("dialog");
      const before = await p.evaluate(() => ({
        metadata: localStorage.getItem("quotafern.account-presentation.v1"),
        calls: window.__ux03.calls.length,
      }));
      assert(
        (await dialog.getByRole("combobox").count()) === 0,
        `${width}: sole provider is a fixed label`,
      );
      assert(
        await dialog
          .getByRole("radio", { name: "Use existing Codex login", exact: true })
          .isChecked(),
        `${width}: existing login is a clear default`,
      );
      assert(
        !(await dialog.innerText()).includes("80 characters"),
        `${width}: no routine character-limit paragraph`,
      );
      const fits = await dialog.evaluate((el) => {
        const b = el.getBoundingClientRect();
        const button = el.querySelector('button[type="submit"]').getBoundingClientRect();
        return (
          b.left >= 0 && b.right <= innerWidth && button.top >= 0 && button.bottom <= innerHeight
        );
      });
      assert(fits, `${width}: Continue visible in compact window`);
      if (theme === "light") await capture(p, "add-380-light");
      await dialog
        .getByRole("radio", { name: "Sign in with another account", exact: true })
        .check();
      assert(
        (await dialog
          .getByRole("textbox", { name: "Account name (optional)", exact: true })
          .getAttribute("placeholder")) === "Another Codex account",
        `${width}: managed choice has sensible optional name`,
      );
      if (theme === "dark") await capture(p, "add-320-dark");
      await p.keyboard.press("Escape");
      assert(
        await p.evaluate(
          (before) =>
            localStorage.getItem("quotafern.account-presentation.v1") === before.metadata &&
            window.__ux03.calls.length === before.calls,
          before,
        ),
        `${width}: choice and cancellation create no account or authorization`,
      );
      await p.getByRole("tab", { name: "Settings", exact: true }).click();
      const settings = p.getByRole("tabpanel", { name: "Settings", exact: true });
      assert(
        await settings
          .getByRole("radio", { name: theme === "light" ? "Light" : "Dark", exact: true })
          .isVisible(),
        `${theme}: Appearance is the first usable setting`,
      );
      assert(
        !(await settings
          .getByRole("checkbox", { name: "Show synthetic quota examples" })
          .isVisible()),
        `${theme}: Demo is secondary by default`,
      );
      const compact = await settings.evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
      assert(compact, `${theme}: default Settings fits compact window`);
      await capture(p, `settings-${theme}`);
      await settings
        .locator("label.theme-option")
        .filter({ hasText: theme === "light" ? "Dark" : "Light" })
        .click();
      assert(
        await p.evaluate(
          (theme) => localStorage.getItem("quotafern.appearance.mode.v1") !== theme,
          theme,
        ),
        `${theme}: color mode still persists`,
      );
      await settings.getByRole("button", { name: /Zinc & Signal/ }).click();
      assert(
        await p.evaluate(
          () => localStorage.getItem("quotafern.appearance.palette.v1") === "zinc-signal",
        ),
        `${theme}: palette still persists`,
      );
      const status = settings.locator('.preference-message[aria-atomic="true"]');
      assert(
        await status.evaluate(
          (el) =>
            el.getBoundingClientRect().height <= 1 && el.textContent.includes("Color palette"),
        ),
        `${theme}: success feedback remains accessible without a persistent paragraph`,
      );
      await settings.getByText("More settings", { exact: true }).click();
      const warning = settings.locator("#demo-effect-warning");
      assert(
        (await warning.isVisible()) &&
          (await warning.innerText()).includes("remembered monitoring"),
        `${theme}: Demo consequence is disclosed before toggle`,
      );
      await capture(p, `demo-warning-${theme}`);
      const toggle = settings.getByRole("checkbox", { name: "Show synthetic quota examples" });
      await toggle.check();
      await p.waitForFunction(() => document.title.includes("Demo preview"));
      assert(
        await p.evaluate(
          () =>
            window.__ux03.calls.filter((c) => c.command === "codex_direct_disconnect").length === 3,
        ),
        `${theme}: enabling Demo uses existing disconnect flow for each account`,
      );
      const count = await p.evaluate(() => window.__ux03.calls.length);
      await toggle.uncheck();
      await p.waitForFunction(() => !document.title.includes("Demo preview"));
      assert(
        await p.evaluate((count) => window.__ux03.calls.length === count, count),
        `${theme}: leaving Demo never reconnects or grants access`,
      );
      await settings.getByRole("button", { name: "Manage accounts", exact: true }).click();
      assert(
        await p.locator("#local-accounts-title").evaluate((el) => el === document.activeElement),
        `${theme}: Manage accounts navigates and focuses the destination`,
      );
      await p.close();
    }
    const quotaPage = await fresh(3, "light", 380, 660);
    await row(quotaPage, 3).getByText("Stale quota", { exact: false }).waitFor();
    assert(
      (await panel(quotaPage).locator("h3 button").count()) === 0,
      "Account names do not duplicate View quota navigation",
    );
    const quotaButton = row(quotaPage, 3).getByRole("button", {
      name: "View quota for Codex Managed Free",
      exact: true,
    });
    await quotaButton.scrollIntoViewIfNeeded();
    const scrollBefore = await panel(quotaPage).evaluate((el) => el.scrollTop);
    await quotaButton.click();
    const quotaOverview = quotaPage.getByRole("tabpanel", { name: "Overview", exact: true });
    await quotaOverview.getByRole("heading", { name: "Usage overview", exact: true }).waitFor();
    assert(
      (await quotaOverview.locator("#account-context").inputValue()) ===
        "account_d0030000-0000-4000-8000-000000000003",
      "View quota selects intended account in Overview",
    );
    assert(
      (await quotaOverview.locator("[data-source-id]").count()) === 1 &&
        (await quotaOverview
          .locator('[data-account-id="account_d0030000-0000-4000-8000-000000000003"]')
          .count()) === 1,
      "View quota preserves source ownership without another quota renderer",
    );
    await capture(quotaPage, "view-quota");
    await quotaOverview.getByRole("button", { name: "Back", exact: true }).click();
    assert(
      await quotaPage
        .locator("#account-overview-account_d0030000-0000-4000-8000-000000000003")
        .evaluate((el) => el === document.activeElement),
      "Overview Back restores View quota focus",
    );
    assert(
      Math.abs((await panel(quotaPage).evaluate((el) => el.scrollTop)) - scrollBefore) <= 1,
      "Overview Back restores Accounts scroll position",
    );
    await menu(quotaPage, 1, "Disconnect");
    await row(quotaPage, 1)
      .getByRole("button", { name: "View quota for Codex Existing Codex", exact: true })
      .click();
    assert(
      (await quotaOverview
        .getByRole("heading", { name: "No quota available", exact: true })
        .isVisible()) &&
        (await quotaOverview
          .getByRole("button", { name: "Manage accounts", exact: true })
          .isVisible()),
      "Disconnected View quota offers useful account recovery without synthetic values",
    );
    await quotaPage.close();
    for (const size of [1, 3, 24]) {
      const p = await fresh(
        Math.min(size, 3),
        "light",
        320,
        660,
        size === 24
          ? () => {
              const key = "quotafern.account-presentation.v1";
              const data = JSON.parse(localStorage.getItem(key));
              for (let n = 4; n <= 24; n++) {
                const suffix = String(n).padStart(12, "0");
                const id = `account_d0030000-0000-4000-8000-${suffix}`;
                data.accounts.push({
                  id,
                  providerId: "codex",
                  alias:
                    n < 6
                      ? "Duplicate"
                      : n === 6
                        ? "All accounts"
                        : `Account ${n} · ${"研究チーム".repeat(8)}`,
                });
                data.connections.push({
                  id: `connection_d0030000-0000-4000-8000-${suffix}`,
                  accountId: id,
                  workspaceId: null,
                  alias: `Connection ${n}`,
                  mechanism: "cli-session",
                });
              }
              localStorage.setItem(key, JSON.stringify(data));
            }
          : undefined,
      );
      await p.getByRole("tab", { name: "Overview", exact: true }).click();
      const overview = p.getByRole("tabpanel", { name: "Overview", exact: true });
      const select = overview.locator("#account-context");
      const labels = await select.locator("option").allTextContents();
      assert(
        labels.length === size + 1,
        `${size}: primary selector contains All accounts plus individual accounts only`,
      );
      assert(
        new Set(labels).size === labels.length,
        `${size}: account choices are distinguishable, including duplicate/reserved aliases`,
      );
      assert(
        (await select.locator("optgroup").getAttribute("label")) === "Codex",
        `${size}: accounts grouped by provider`,
      );
      await select.focus();
      await p.keyboard.press("End");
      await p.keyboard.press("Enter");
      assert(
        (await select.inputValue()) ===
          `account_d0030000-0000-4000-8000-${String(size).padStart(12, "0")}`,
        `${size}: keyboard reaches last account by opaque ID`,
      );
      await audit(p, `${size} accounts at 320px`);
      if (size === 3) await capture(p, "selector-three");
      else await capture(p, `selector-${size}`);
      await p.close();
    }
    const deniedDemo = await fresh(1, "light", 380, 660, () => {
      window.__ux03.modes["connection_d0030000-0000-4000-8000-000000000001"] = "cleanup-failed";
    });
    await row(deniedDemo, 1).getByText("Connected", { exact: true }).waitFor();
    await deniedDemo.getByRole("tab", { name: "Settings", exact: true }).click();
    await deniedDemo.getByText("More settings", { exact: true }).click();
    const deniedToggle = deniedDemo.getByRole("checkbox", {
      name: "Show synthetic quota examples",
    });
    await deniedToggle.click();
    await deniedDemo
      .getByText(
        "Could not confirm monitoring stopped. Disconnect each Codex account before opening Demo.",
        { exact: true },
      )
      .waitFor();
    assert(
      !(await deniedToggle.isChecked()) &&
        !(await deniedDemo.title().then((t) => t.includes("Demo preview"))),
      "Failed cleanup refuses Demo and resets its checkbox",
    );
    await deniedDemo.close();
    const storageFailure = await fresh(0, "light", 380, 660);
    await storageFailure.getByRole("tab", { name: "Settings", exact: true }).click();
    await storageFailure.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw Error("Synthetic storage unavailable");
      };
    });
    await storageFailure.locator("label.theme-option").filter({ hasText: "Dark" }).click();
    assert(
      await storageFailure
        .getByText(
          "Browser storage is unavailable. These choices will last until this popup closes.",
          { exact: true },
        )
        .isVisible(),
      "Storage failure remains visible while successful appearance feedback is nonvisual",
    );
    await storageFailure.close();
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
    const mainContext = workspaceView.locator("#account-context");
    const advancedContext = workspaceView.locator("#advanced-context");
    assert(
      (await mainContext.inputValue()) === "workspace_d0030000-0000-4000-8000-000000000004",
      "Active workspace remains explicit in the primary caption",
    );
    await workspaceView.locator(".advanced-contexts summary").click();
    assert(
      (await advancedContext.inputValue()) === "workspace_d0030000-0000-4000-8000-000000000004",
      "Collapsing advanced filters preserves workspace selection",
    );
    await mainContext.selectOption("account_d0030000-0000-4000-8000-000000000001");
    assert(
      (await mainContext.inputValue()) === "account_d0030000-0000-4000-8000-000000000001",
      "Selecting owning account clears the workspace filter in one action",
    );
    await workspaceView.locator(".advanced-contexts summary").click();
    await advancedContext.selectOption("provider:codex");
    assert(
      (await mainContext.inputValue()) === "provider:codex",
      "Provider filter is accessible and explicit without polluting default account options",
    );
    await advancedContext.selectOption("connection_d0030000-0000-4000-8000-000000000004");
    assert(
      (await mainContext.inputValue()) === "connection_d0030000-0000-4000-8000-000000000004" &&
        (await workspaceView.locator("[data-source-id]").count()) === 1,
      "Advanced connection context retains exact owner and source",
    );
    await mainContext.focus();
    await mainContext.selectOption("account_d0030000-0000-4000-8000-000000000001");
    assert(
      await mainContext.evaluate((el) => el === document.activeElement),
      "Changing primary context preserves selector focus",
    );
    await capture(multiConnection, "workspace-overview");
    await multiConnection.close();
    // Existing demo scenarios exercise many-to-one sources without native access.
    const demo = await fresh(0);
    await demo.getByRole("tab", { name: "Settings", exact: true }).click();
    await demo.getByText("More settings", { exact: true }).click();
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
