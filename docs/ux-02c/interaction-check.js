async function checkNavigation(page, { tab }, assert, development) {
  const select = () => page.getByRole("combobox", { name: "Account context" });
  const back = () => page.getByRole("button", { name: "Back", exact: true });
  const focused = (locator) => locator.evaluate((e) => e === document.activeElement);
  const panel = () => page.locator('[role="tabpanel"][data-state="active"]');
  const capture = async (name, heading = "Usage overview") => {
    // Application links can change the active tab without clicking its trigger.
    const { ready } = await createTabCapture(page, assert);
    await ready(heading);
    await page.screenshot({
      path: `docs/ux-02c/screenshots/${development ? "source" : "production"}-${name}.png`,
      scale: "css",
    });
  };
  await page.setViewportSize({ width: 380, height: 660 });
  await tab("Settings");
  await page.getByRole("checkbox", { name: "Show synthetic quota examples" }).check();
  if (development)
    await page.getByRole("combobox", { name: "Demo scenario" }).selectOption("multi");
  await tab("Overview");
  if (await back().isVisible()) await back().click();
  await select().selectOption("all");
  await tab("Accounts");
  const disclosure = page.getByRole("button", { name: "Codex · 2 accounts", exact: true });
  assert(
    (await disclosure.getAttribute("aria-expanded")) === "true",
    "Configured provider starts expanded",
  );
  await disclosure.focus();
  await page.keyboard.press("Space");
  assert(
    (await disclosure.getAttribute("aria-expanded")) === "false" &&
      !(await page
        .getByRole("button", { name: "Open Codex Work overview", exact: true })
        .isVisible()),
    "Space collapses provider and hides descendants",
  );
  await tab("Settings");
  await tab("Accounts");
  assert(
    (await disclosure.getAttribute("aria-expanded")) === "false",
    "Disclosure survives tab round trip",
  );
  await disclosure.focus();
  await page.keyboard.press("Enter");
  const work = page.getByRole("button", { name: "Open Codex Work overview", exact: true });
  await work.scrollIntoViewIfNeeded();
  const accountScroll = await panel().evaluate((e) => e.scrollTop);
  await work.focus();
  await page.keyboard.press("Enter");
  assert(
    await focused(page.locator("#owned-details-title")),
    "Account navigation focuses Overview heading",
  );
  assert(
    (await select().inputValue()).startsWith("account_"),
    "Account navigation uses account ID",
  );
  assert(
    (await page.locator(".owned-source").count()) === 1 &&
      !(await page.locator(".owned-source").innerText()).includes("72%"),
    "Accounts opens only Work sources",
  );
  assert((await panel().evaluate((e) => e.scrollTop)) === 0, "New account context starts at top");
  await capture("work-overview-380");
  await tab("Settings");
  await tab("Overview");
  assert(
    (await select().inputValue()).endsWith("000000000002"),
    "Account context survives Settings round trip",
  );
  await back().click();
  assert(await focused(work), "Overview Back restores Accounts opener focus");
  assert(
    Math.abs((await panel().evaluate((e) => e.scrollTop)) - accountScroll) <= 1,
    "Overview Back restores Accounts scroll",
  );
  await tab("Accounts");
  const workspace = page.getByRole("button", {
    name: "Open Codex Work Studio workspace overview",
    exact: true,
  });
  await workspace.click();
  assert(
    (await select().inputValue()).startsWith("workspace_"),
    "Workspace link uses workspace ID",
  );
  await back().click();
  await tab("Accounts");
  const direct = page.getByRole("button", {
    name: "View Codex Work Work session source 1 details",
    exact: true,
  });
  await direct.scrollIntoViewIfNeeded();
  const detailScroll = await panel().evaluate((e) => e.scrollTop);
  await direct.focus();
  await page.keyboard.press("Enter");
  assert(
    (await page.getByRole("gridcell").count()) === 84,
    "Accounts connection opens 84-day source-owned Details",
  );
  assert(
    (await page.locator(".owned-detail-context").innerText()).includes("Studio workspace") &&
      !(await page.locator(".owned-detail-context").innerText()).includes(
        "Sample personal identity",
      ),
    "Connection Details names workspace and excludes other identity",
  );
  await capture("connection-details-380", "Codex Details");
  await tab("Accounts");
  await tab("Overview");
  assert(
    (await page.getByRole("gridcell").count()) === 84,
    "Details target survives tab round trip",
  );
  await back().click();
  assert(await focused(direct), "Direct Details Back restores connection opener focus");
  assert(
    Math.abs((await panel().evaluate((e) => e.scrollTop)) - detailScroll) <= 1,
    "Direct Details Back restores Accounts scroll",
  );
  await tab("Accounts");
  await page.getByRole("button", { name: "Open Codex Personal overview", exact: true }).click();
  await page
    .getByRole("button", { name: "View Codex Personal Desktop session details", exact: true })
    .click();
  await back().click();
  assert(
    await focused(
      page.getByRole("button", {
        name: "View Codex Personal Desktop session details",
        exact: true,
      }),
    ),
    "Nested Details Back restores Overview source opener",
  );
  await back().click();
  assert(
    await focused(page.getByRole("button", { name: "Open Codex Personal overview", exact: true })),
    "Second Back restores Accounts origin",
  );
  await tab("Overview");
  await select().selectOption("all");
  await select().focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  assert(await focused(select()), "Native selector retains keyboard focus on context change");
  await select().press("Escape");
  assert(
    (await page
      .getByText("This browser preview can’t hide its window.", { exact: false })
      .count()) === 0,
    "Owned select Escape does not hide popup",
  );
  await select().selectOption("all");
  await select().focus();
  await page.keyboard.press("Tab");
  assert(
    await focused(page.locator(".owned-details-button").first()),
    "Tab reaches first source action from selector",
  );
  await page.keyboard.press("Enter");
  assert((await page.getByRole("gridcell").count()) === 84, "Keyboard source action opens Details");
  await back().click();
  await page.getByRole("tab", { name: "Overview", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  assert(
    (await page
      .getByRole("tab", { name: "Accounts", exact: true })
      .getAttribute("aria-selected")) === "true",
    "ArrowRight moves tab selection to Accounts",
  );
  await tab("Overview");
  assert((await select().inputValue()) === "all", "Keyboard tab round trip retains selection");
  // A retained Details origin can be hidden while visiting Accounts.
  await tab("Accounts");
  await page
    .getByRole("button", { name: "View Codex Work Work session source 1 details", exact: true })
    .click();
  await tab("Accounts");
  await disclosure.click();
  await tab("Overview");
  await back().click();
  assert(
    await focused(disclosure),
    "Back from Details restores collapsed provider disclosure instead of hidden opener",
  );
  await disclosure.click();
  await tab("Overview");
  await select().selectOption({ label: "OpenRouter · Personal" });
  await page
    .getByRole("button", { name: "View OpenRouter Personal Personal Key details", exact: true })
    .click();
  const firstAnnouncement = await page.locator(".context-announcement").innerText();
  await back().click();
  await page
    .getByRole("button", { name: "View OpenRouter Personal Project B Key details", exact: true })
    .click();
  const nextAnnouncement = await page.locator(".context-announcement").innerText();
  assert(
    firstAnnouncement !== nextAnnouncement &&
      nextAnnouncement.includes("Project B Key") &&
      nextAnnouncement.includes("Source 2 of 2"),
    "Changing source within account announces the specific source and connection before readings",
  );
  await back().click();
  await select().selectOption("all");
  await page.locator("#owned-details-title").focus();
  await page.keyboard.press("Escape");
  assert(
    (await page
      .getByText("This browser preview can’t hide its window.", { exact: false })
      .count()) === 1,
    "Unconsumed Escape reaches popup hide path (browser disclosure)",
  );

  if (development) {
    await tab("Settings");
    const scenario = page.getByRole("combobox", { name: "Demo scenario" });
    await scenario.selectOption("multi");
    await tab("Overview");
    await select().selectOption({ label: "Codex · Work" });
    await tab("Settings");
    await scenario.selectOption("single");
    await tab("Overview");
    assert(
      (await select().inputValue()) === "all" &&
        (await page.locator(".context-announcement").innerText()).includes("Selection removed"),
      "Removed selection announces fallback to All",
    );
    await tab("Settings");
    await scenario.selectOption("multi");
    await tab("Overview");
    assert(
      (await select().inputValue()) === "all",
      "Returning fixture cannot restore invalid selection",
    );
    await page
      .getByRole("button", { name: "View Codex Personal Desktop session details", exact: true })
      .click();
    await tab("Settings");
    await scenario.selectOption("disconnected");
    await tab("Overview");
    assert(
      (await page.getByRole("gridcell").count()) === 0 &&
        (await page
          .getByRole("heading", { name: "Selection unavailable", exact: true })
          .count()) === 1 &&
        (await page.locator(".owned-detail-readings").count()) === 0,
      "Disconnected Details clears quota and activity without choosing another source",
    );
    await capture("unavailable-details-380", "Codex Details");
    await back().click();
    assert(await focused(select()), "Missing source opener falls back to selector");
    await tab("Settings");
    await scenario.selectOption("duplicates");
    await tab("Accounts");
    await page
      .getByRole("button", {
        name: "View OpenRouter Personal Connection · connection 2 source 1 details",
        exact: true,
      })
      .click();
    assert(
      (await page.locator(".owned-detail-connection").innerText()).includes("connection 2"),
      "Narrowed duplicate Details retains connection ordinal",
    );
    await back().click();
    await tab("Settings");
    await scenario.selectOption("multi");
    await tab("Accounts");
    await page.getByRole("button", { name: "Open Codex Work overview", exact: true }).click();
    await page
      .getByRole("button", { name: "View Codex Work Work session details", exact: true })
      .click();
    await tab("Settings");
    await scenario.selectOption("empty");
    await tab("Overview");
    assert(
      (await page.getByRole("heading", { name: "Selection unavailable", exact: true }).count()) ===
        1,
      "Removed Details owner stays unavailable",
    );
    await back().click();
    assert(await focused(select()), "Removed Details source falls back to selector");
    await back().click();
    assert(
      await focused(page.getByRole("heading", { name: "Accounts", exact: true })),
      "Removed account origin falls back to Accounts heading",
    );
  }
  await tab("Settings");
  await page.getByRole("checkbox", { name: "Show synthetic quota examples" }).uncheck();
  await page.getByRole("checkbox", { name: "Show synthetic quota examples" }).check();
  await tab("Overview");
  assert(
    (await select().inputValue()) === "all" && (await page.getByRole("gridcell").count()) === 0,
    "Demo cycle discards selection and Details",
  );
  await page.reload();
  await tab("Settings");
  assert(
    !(await page.getByRole("checkbox", { name: "Show synthetic quota examples" }).isChecked()),
    "Reload starts disconnected without remembered demo or context",
  );
}
