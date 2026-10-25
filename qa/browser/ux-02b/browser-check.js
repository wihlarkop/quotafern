async function checkAccountUi(page) {
  const results = [];
  const failures = [];
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  const assert = (ok, label) => {
    results.push({ label, passed: Boolean(ok) });
    if (!ok) failures.push(label);
  };
  // The Bun run-ui-check runner injects the shared capture helper into the CLI VM.
  const { tab, ready } = await createTabCapture(page, assert);
  const back = async () => {
    if (await page.getByRole("button", { name: "Back", exact: true }).isVisible())
      await page.getByRole("button", { name: "Back", exact: true }).click();
  };
  const audit = async (label) => {
    const measured = await page.evaluate(() => {
      const panel = [...document.querySelectorAll('[role="tabpanel"]')].find(
        (p) => p.getBoundingClientRect().height > 0,
      );
      const overflowing = [...panel.querySelectorAll("*")]
        .filter(
          (e) =>
            e.getBoundingClientRect().width > 0 &&
            e.scrollWidth > e.clientWidth + 2 &&
            !["SELECT", "OPTION", "svg"].includes(e.tagName),
        )
        .map((e) => e.className)
        .slice(0, 5);
      return {
        docOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        panelOverflow: panel.scrollWidth > panel.clientWidth + 1,
        overflowing,
        headings: panel.querySelectorAll("h1").length,
        height: panel.clientHeight,
        scrollHeight: panel.scrollHeight,
      };
    });
    assert(
      !measured.docOverflow && !measured.panelOverflow && measured.overflowing.length === 0,
      `${label}: no horizontal overflow ${JSON.stringify(measured)}`,
    );
    assert(
      measured.headings === 1 && measured.height > 100,
      `${label}: one screen heading and usable scroll area`,
    );
  };
  const capture = async (name, full = false) => {
    const heading =
      name.includes("details") || name.includes("activity")
        ? "Codex Details"
        : name.includes("accounts")
          ? "Accounts"
          : name.includes("settings")
            ? "Settings"
            : "Usage overview";
    await ready(heading);
    await page.evaluate(() =>
      document.querySelectorAll('[role="tabpanel"]').forEach((p) => (p.scrollTop = 0)),
    );
    const target = full ? page.locator(".popup") : page;
    await target.screenshot({ path: `docs/ux-02b/screenshots/${name}.png`, scale: "css" });
  };
  await tab("Settings");
  await page.getByRole("checkbox", { name: "Show synthetic quota examples" }).check();
  await page.getByRole("combobox", { name: "Demo scenario" }).selectOption("multi");
  for (const palette of ["Graphite & Jade", "Zinc & Signal"]) {
    for (const mode of ["Light", "Dark"]) {
      await tab("Settings");
      await page.getByRole("button", { name: new RegExp(palette.replace("&", "&")) }).click();
      await page.getByRole("radio", { name: mode, exact: true }).press("Space");
      for (const width of [320, 380, 420]) {
        for (const height of [480, 660]) {
          await page.setViewportSize({ width, height });
          const label = `${palette}/${mode}/${width}x${height}`;
          await tab("Settings");
          await audit(`${label}/Settings`);
          await tab("Accounts");
          await audit(`${label}/Accounts`);
          if (height === 660 && width === 380)
            await capture(
              `after-accounts-${palette.startsWith("Graphite") ? "jade" : "signal"}-${mode.toLowerCase()}-380`,
            );
          await tab("Overview");
          await back();
          await audit(`${label}/Overview`);
          if (height === 660 && width === 380)
            await capture(
              `after-overview-${palette.startsWith("Graphite") ? "jade" : "signal"}-${mode.toLowerCase()}-380`,
            );
          await page
            .getByRole("button", {
              name: "View Codex Personal Desktop session details",
              exact: true,
            })
            .click();
          await audit(`${label}/Details`);
          assert(
            await page
              .locator("#owned-details-title")
              .evaluate((e) => e === document.activeElement),
            `${label}: Details heading focused`,
          );
          assert((await page.getByRole("gridcell").count()) === 84, `${label}: 84 activity dates`);
          if (height === 660 && width === 380)
            await capture(
              `after-details-${palette.startsWith("Graphite") ? "jade" : "signal"}-${mode.toLowerCase()}-380`,
            );
          await page.getByRole("button", { name: "Back", exact: true }).click();
          assert(
            await page
              .getByRole("button", {
                name: "View Codex Personal Desktop session details",
                exact: true,
              })
              .evaluate((e) => e === document.activeElement),
            `${label}: Back restores opener focus`,
          );
        }
      }
    }
  }
  await page.setViewportSize({ width: 320, height: 480 });
  for (const scenario of [
    "single",
    "two-accounts",
    "two-keys",
    "shared",
    "mixed",
    "unicode",
    "duplicates",
    "removing",
    "empty",
  ]) {
    await tab("Settings");
    await page.getByRole("combobox", { name: "Demo scenario" }).selectOption(scenario);
    await tab("Accounts");
    await audit(`${scenario}/Accounts/320x480`);
    if (["mixed", "unicode", "duplicates", "removing"].includes(scenario))
      await capture(`${scenario}-accounts-320-short`);
    await tab("Overview");
    await back();
    await audit(`${scenario}/Overview/320x480`);
    if (scenario === "shared") {
      assert((await page.locator(".owned-source").count()) === 1, "Shared source appears once");
      const keyOptions = await page
        .locator("#account-context option")
        .evaluateAll((items) =>
          items.filter((o) => o.value.startsWith("connection_")).map((o) => o.value),
        );
      const sourceId = await page.locator(".owned-source").getAttribute("data-source-id");
      for (const key of keyOptions) {
        await page.getByRole("combobox", { name: "Account context" }).selectOption(key);
        assert(
          (await page.locator(".owned-source").count()) === 1 &&
            (await page.locator(".owned-source").getAttribute("data-source-id")) === sourceId,
          "Shared key filters retain one source ID",
        );
      }
      await capture("shared-source-320-short");
    }
    if (scenario === "duplicates") {
      const names = await page
        .locator(".owned-details-button")
        .evaluateAll((items) => items.map((e) => e.getAttribute("aria-label")));
      assert(
        new Set(names).size === names.length,
        "Duplicate aliases have unique accessible Details names",
      );
    }
    if (scenario === "empty")
      assert(
        (await page.getByRole("heading", { name: "No accounts configured" }).count()) === 1,
        "Empty state has no synthetic accounts",
      );
  }
  await tab("Settings");
  await page.getByRole("combobox", { name: "Demo scenario" }).selectOption("multi");
  await tab("Overview");
  await back();
  await page
    .getByRole("combobox", { name: "Account context" })
    .selectOption({ label: "Codex · all accounts" });
  assert(
    (await page.locator(".owned-source").count()) === 2,
    "Provider scope selects both Codex accounts",
  );
  await page
    .getByRole("combobox", { name: "Account context" })
    .selectOption({ label: "Codex · Work / Studio workspace" });
  assert(
    (await page.locator(".owned-source").count()) === 1 &&
      (await page.locator(".owned-source").innerText()).includes("Work session"),
    "Workspace scope retains owner and source",
  );
  await page.getByRole("combobox", { name: "Account context" }).selectOption("all");
  // Context switch clears Personal Details and its focused activity cell before Work appears.
  await tab("Settings");
  await page.getByRole("combobox", { name: "Demo scenario" }).selectOption("multi");
  await tab("Overview");
  await back();
  await page
    .getByRole("button", { name: "View Codex Personal Desktop session details", exact: true })
    .click();
  const firstCell = page.locator('[role="gridcell"][tabindex="0"]');
  await firstCell.focus();
  const firstDate = await firstCell.getAttribute("data-activity-cell");
  await page.keyboard.press("ArrowRight");
  assert(
    (await page.locator('[role="gridcell"]:focus').getAttribute("data-activity-cell")) !==
      firstDate,
    "Heatmap arrow navigation changes date",
  );
  assert(
    (await page.locator(".activity-focus-detail").innerText()).includes("tokens") ||
      (await page.locator(".activity-focus-detail").innerText()).includes("no activity"),
    "Exact date/token details announced",
  );
  await page
    .getByRole("combobox", { name: "Account context" })
    .selectOption({ label: "Codex · Work" });
  assert(
    (await page.locator(".owned-detail-context").count()) === 0 &&
      (await page.getByRole("gridcell").count()) === 0,
    "Switch synchronously clears old Details and activity",
  );
  assert(
    (await page.locator(".owned-source").count()) === 1 &&
      !(await page.locator(".owned-source").innerText()).includes("72%"),
    "Work overview contains only Work values",
  );
  await page
    .getByRole("button", { name: "View Codex Work Work session details", exact: true })
    .click();
  assert(
    (await page.locator(".owned-detail-context").innerText()).includes("Work session") &&
      !(await page.locator(".owned-detail-context").innerText()).includes(
        "Sample personal identity",
      ),
    "Work Details clears Personal identity",
  );
  assert(
    (await page.locator(".activity-focus-detail").innerText()).includes("Focus a date"),
    "New account clears focused activity detail",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  const motion = await page.locator(".codex-details").evaluate((e) => ({
    animation: getComputedStyle(e).animationName,
    transition: getComputedStyle(e).transitionDuration,
  }));
  assert(
    motion.animation === "none" && motion.transition.split(",").every((s) => parseFloat(s) === 0),
    "Reduced motion suppresses content animation and transitions",
  );
  await capture("work-details-320-reduced-motion");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 380, height: 1500 });
  await tab("Settings");
  await page.getByRole("radio", { name: "Light", exact: true }).press("Space");
  await page.getByRole("button", { name: /Graphite & Jade/ }).click();
  const expanded = await page.addStyleTag({
    content:
      ".popup { height: auto !important; max-height: none !important; } .view-content { overflow: visible !important; flex: none !important; }",
  });
  await tab("Accounts");
  await capture("after-accounts-full-380", true);
  await tab("Overview");
  await back();
  await page.getByRole("combobox", { name: "Account context" }).selectOption("all");
  await capture("after-overview-full-380", true);
  await page
    .getByRole("button", { name: "View Codex Personal Desktop session details", exact: true })
    .click();
  await capture("after-details-full-380", true);
  await expanded.evaluate((e) => e.remove());
  // System mode responds without changing the selected account context.
  await tab("Settings");
  await page.getByRole("radio", { name: "System", exact: true }).press("Space");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  assert(
    (await page.locator("html").getAttribute("data-theme")) === "dark",
    "System dark updates live",
  );
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
  assert(
    (await page.locator("html").getAttribute("data-theme")) === "light",
    "System light updates live",
  );
  await page.getByRole("checkbox", { name: "Show synthetic quota examples" }).uncheck();
  await page.setViewportSize({ width: 380, height: 660 });
  await tab("Accounts");
  await audit("Demo OFF Accounts");
  await capture("after-disconnected-accounts-380");
  assert(
    (await page.locator(".owned-account").count()) === 0 &&
      (await page.locator(".account-demo-notice").count()) === 0,
    "Demo OFF has no synthetic accounts",
  );
  await tab("Overview");
  await audit("Demo OFF Overview");
  await capture("after-disconnected-380");
  assert((await page.locator(".owned-source").count()) === 0, "Demo OFF has no synthetic quota");
  const storage = await page.evaluate(() => Object.keys(localStorage));
  assert(
    storage.every((k) =>
      ["quotafern.appearance.mode.v1", "quotafern.appearance.palette.v1"].includes(k),
    ),
    "Only appearance preferences persist",
  );
  assert(
    requests.every((url) => url.startsWith("http://127.0.0.1:4175/")),
    "Browser interactions issue no external provider requests",
  );

  if (failures.length) throw new Error(JSON.stringify({ checks: results.length, failures }));
  return { checks: results.length, failures, results };
}
