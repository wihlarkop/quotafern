async function checkProductionUi(page) {
  const results = [];
  const assert = (ok, label) => {
    results.push({ label, passed: Boolean(ok) });
    if (!ok) throw new Error(label);
  };
  // The Bun run-ui-check runner injects the shared capture helper into the CLI VM.
  const { tab, ready } = await createTabCapture(page, assert);
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
    const target = full ? page.locator(".popup") : page;
    await target.screenshot({ path: `.tmp/qa/screenshots/ux-02c/${name}.png`, scale: "css" });
  };
  await page.setViewportSize({ width: 380, height: 660 });
  assert((await page.locator(".owned-source").count()) === 0, "Production starts disconnected");
  await capture("after-disconnected-380");
  await tab("Accounts");
  await capture("after-disconnected-accounts-380");
  await tab("Settings");
  await page.getByRole("checkbox", { name: "Show synthetic quota examples" }).check();
  assert(
    (await page.getByRole("combobox", { name: "Demo scenario" }).count()) === 0,
    "Development fixture control excluded from production",
  );
  for (const palette of ["Graphite & Jade", "Zinc & Signal"]) {
    for (const mode of ["Light", "Dark"]) {
      await tab("Settings");
      await page.getByRole("button", { name: new RegExp(palette) }).click();
      await page.getByRole("radio", { name: mode, exact: true }).press("Space");
      const ratios = await page.evaluate(() => {
        const rgb = (token, property) => {
          const e = document.createElement("span");
          e.style[property] = `var(${token})`;
          document.body.append(e);
          const value = getComputedStyle(e)[property];
          e.remove();
          return value
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number);
        };
        const luminance = (values) =>
          values
            .map((v) => {
              const c = v / 255;
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            })
            .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
        const contrast = (ink, bg) => {
          const a = luminance(rgb(ink, "color")),
            b = luminance(rgb(bg, "backgroundColor"));
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        };
        const pairs = [];
        for (const ink of ["--text", "--muted"])
          for (const bg of ["--surface", "--surface-raised", "--surface-inset"])
            pairs.push({ ink, bg, ratio: contrast(ink, bg) });
        for (const kind of ["normal", "low", "critical", "unknown"])
          pairs.push({
            ink: `--${kind}-ink`,
            bg: `--${kind}-wash`,
            ratio: contrast(`--${kind}-ink`, `--${kind}-wash`),
          });
        pairs.push({
          ink: "--accent",
          bg: "--accent-soft",
          ratio: contrast("--accent", "--accent-soft"),
        });
        return pairs;
      });
      for (const pair of ratios)
        assert(
          pair.ratio >= 4.5,
          `${palette}/${mode}: ${pair.ink} on ${pair.bg} contrast ${pair.ratio.toFixed(2)}`,
        );
    }
  }
  await tab("Settings");
  await page.getByRole("button", { name: /Graphite & Jade/ }).click();
  await page.getByRole("radio", { name: "Light", exact: true }).press("Space");
  await capture("after-settings-380");
  await tab("Accounts");
  assert(
    (await page.locator(".owned-account").count()) === 3 &&
      (await page.locator(".owned-connection").count()) === 4,
    "Production Demo has independent accounts and connections",
  );
  await capture("after-accounts-380");
  await tab("Overview");
  assert(
    (await page.locator(".owned-source").count()) === 4,
    "Production Demo has four independent sources",
  );
  await capture("after-overview-380");
  await page
    .getByRole("button", { name: "View Codex Personal Desktop session details", exact: true })
    .click();
  await capture("after-details-380");
  assert(
    (await page.getByRole("gridcell").count()) === 84,
    "Production Details has 84 activity dates",
  );
  await page.getByRole("grid").scrollIntoViewIfNeeded();
  await capture("after-activity-380");
  const expanded = await page.addStyleTag({
    content:
      ".popup{height:auto!important;max-height:none!important}.view-content{overflow:visible!important;flex:none!important}",
  });
  for (const screen of ["Accounts", "Overview"]) {
    await tab(screen);
    if (screen === "Overview")
      await page.getByRole("button", { name: "Back", exact: true }).click();
    await capture(`after-${screen.toLowerCase()}-full-380`, true);
  }
  await page
    .getByRole("button", { name: "View Codex Personal Desktop session details", exact: true })
    .click();
  await capture("after-details-full-380", true);
  await expanded.evaluate((e) => e.remove());
  await tab("Settings");
  await page.getByRole("checkbox", { name: "Show synthetic quota examples" }).uncheck();
  await page.reload();
  await tab("Accounts");
  assert(
    (await page.locator(".owned-account").count()) === 0,
    "Production reload does not restore synthetic accounts or consent",
  );
  for (const reducedMotion of ["reduce", "no-preference"]) {
    await page.emulateMedia({ reducedMotion });
    await tab("Overview");
    const transitionDurations = await page
      .locator('[role="tab"]')
      .evaluateAll((tabs) =>
        tabs.flatMap((item) =>
          getComputedStyle(item).transitionDuration.split(",").map(parseFloat),
        ),
      );
    assert(
      reducedMotion === "reduce"
        ? transitionDurations.every((duration) => duration === 0)
        : transitionDurations.some((duration) => duration > 0),
      `Original tab transitions respect reduced motion: ${reducedMotion}`,
    );
    await tab("Accounts");
  }
  await checkNavigation(page, { tab, ready }, assert, false);
  return { checks: results.length, failures: [], results };
}
