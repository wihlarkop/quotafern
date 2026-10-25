async function checkLocalAccounts(page) {
  const results = [];
  const assert = (ok, label) => {
    results.push({ label, passed: Boolean(ok) });
    if (!ok) throw new Error(label);
  };
  const development = new URL(page.url()).port === "4175";
  const prefix = development ? "source" : "production";
  const key = "quotafern.account-presentation.v1";
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  const { tab, ready } = await createTabCapture(page, assert);
  const storage = () => page.evaluate((key) => localStorage.getItem(key), key);
  const metadata = async () => JSON.parse(await storage());
  const focused = async (id) => {
    try {
      await page.waitForFunction((id) => document.activeElement?.id === id, id, { timeout: 1500 });
      return true;
    } catch {
      return false;
    }
  };
  const dialog = () => page.getByRole("dialog");
  const alias = () => page.getByRole("textbox", { name: "Account alias", exact: true });
  const capture = async (name) => {
    await page.screenshot({
      path: `.tmp/qa/screenshots/acc-04/${prefix}-${name}.png`,
      scale: "css",
    });
  };
  const menu = async (id, name) => {
    await page.locator(`[id="${id}"]`).click();
    await page.getByRole("menuitem", { name, exact: true }).click();
  };
  const addAccount = async (provider, name) => {
    await page.getByRole("button", { name: "Add local account", exact: true }).click();
    await page.getByRole("combobox", { name: "Provider", exact: true }).selectOption(provider);
    await alias().fill(name);
    await alias().press("Enter");
    await dialog().waitFor({ state: "detached" });
  };
  const addConnection = async (accountId, name, mechanism, workspace = false) => {
    await menu(`account-actions-${accountId}`, "Add local connection descriptor");
    assert(await dialog().isVisible(), "descriptor dialog opens");
    await page.getByRole("textbox", { name: "Connection label", exact: true }).fill(name);
    await page
      .getByRole("combobox", { name: "Provisional mechanism descriptor" })
      .selectOption(mechanism);
    if (workspace) {
      await page.getByRole("combobox", { name: "Workspace context" }).selectOption("new");
      await page.getByRole("textbox", { name: "Workspace alias" }).fill("Team 🧑‍💻");
    }
    await dialog().getByRole("button", { name: "Add", exact: true }).click();
    await dialog().waitFor({ state: "detached" });
  };
  await page.setViewportSize({ width: 380, height: 660 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await tab("Accounts");
  assert((await storage()) === null, "opening Accounts does not persist a fabricated account");
  await addAccount("codex", "  Personal  ");
  await addAccount("codex", "Work");
  await addAccount("openrouter", "Personal");
  let records = await metadata();
  const [personal, work, router] = records.accounts;
  assert(
    personal.id !== work.id && personal.alias === "Personal",
    "two Codex accounts use distinct IDs and canonical aliases",
  );
  await addConnection(personal.id, "Desktop session", "cli-session");
  await addConnection(work.id, "Work session", "cli-session");
  await addConnection(router.id, "Personal Key", "api-key");
  await addConnection(router.id, "Project B Key", "api-key", true);
  records = await metadata();
  const keyA = records.connections.find((c) => c.alias === "Personal Key");
  assert(
    records.connections.length === 4 && new Set(records.connections.map((c) => c.id)).size === 4,
    "multiple independent descriptor IDs",
  );
  assert(
    records.workspaces.length === 1 && records.workspaces[0].accountId === router.id,
    "optional workspace has correct owner",
  );
  await menu(`account-actions-${personal.id}`, "Rename account");
  assert(
    (await alias().inputValue()) === "Personal" && (await focused("local-alias")),
    "rename shows complete current alias and focuses input",
  );
  await alias().fill("Work");
  await alias().press("Enter");
  await dialog().waitFor({ state: "detached" });
  records = await metadata();
  assert(
    records.accounts[0].id === personal.id &&
      records.accounts[1].id === work.id &&
      records.accounts[0].alias === "Work" &&
      records.accounts[1].alias === "Work",
    "duplicate aliases preserve independent identity",
  );
  assert(await focused(`account-actions-${personal.id}`), "rename restores initiating action");
  await menu(`account-actions-${personal.id}`, "Rename account");
  for (const [invalid, message] of [
    ["", "nonempty"],
    ["🌿".repeat(81), "80 Unicode"],
    ["bad\u202e", "Remove control"],
  ]) {
    await alias().fill(invalid);
    await alias().press("Enter");
    assert(
      (await page.locator("#local-save-error").innerText()).includes(message) &&
        (await alias().getAttribute("aria-invalid")) === "true",
      `precise rejection ${message}`,
    );
    assert((await metadata()).accounts[0].alias === "Work", "invalid input never persisted");
  }
  await alias().fill(" e\u0301 🌿 ");
  const composition = await alias().evaluate((input) => {
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      isComposing: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert(composition && (await dialog().isVisible()), "IME Enter does not submit");
  await alias().press("Enter");
  await dialog().waitFor({ state: "detached" });
  assert((await metadata()).accounts[0].alias === "é 🌿", "NFC Unicode/emoji saved intact");
  await menu(`connection-actions-${keyA.id}`, "Rename key label");
  await page.getByRole("textbox", { name: "Connection label", exact: true }).fill("開発 👩‍💻");
  await dialog().getByRole("button", { name: "Save", exact: true }).click();
  await dialog().waitFor({ state: "detached" });
  assert(
    (await metadata()).connections.find((c) => c.id === keyA.id).alias === "開発 👩‍💻" &&
      (await metadata()).accounts[2].alias === "Personal",
    "key rename independent from account",
  );
  await menu(`account-actions-${work.id}`, "Rename account");
  await alias().fill("Cancelled");
  await page.keyboard.press("Shift+Tab");
  assert(
    await dialog().evaluate((d) => d.contains(document.activeElement)),
    "native modal traps reverse Tab",
  );
  await page.keyboard.press("Escape");
  await dialog().waitFor({ state: "detached" });
  assert(
    (await metadata()).accounts[1].alias === "Work" &&
      (await focused(`account-actions-${work.id}`)),
    "Escape cancels and restores focus without popup hide",
  );
  await menu(`account-actions-${work.id}`, "Rename account");
  await alias().fill("Unsaved");
  const savedBeforeFailure = await storage();
  await page.evaluate(() => {
    window.__originalAccountSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "quotafern.account-presentation.v1")
        throw new DOMException("synthetic", "QuotaExceededError");
      return window.__originalAccountSet.call(this, key, value);
    };
  });
  await dialog().getByRole("button", { name: "Save", exact: true }).click();
  assert(
    (await page.locator("#local-save-error").innerText()).includes("Could not save") &&
      (await alias().inputValue()) === "Unsaved",
    "write failure keeps dialog/input with error",
  );
  assert(
    (await storage()) === savedBeforeFailure &&
      (await page.locator(`[data-account-id="${work.id}"] h3`).innerText()) === "Work",
    "write failure leaves visible and saved alias unchanged",
  );
  await capture("write-failure-380");
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__originalAccountSet;
    delete window.__originalAccountSet;
  });
  await dialog().getByRole("button", { name: "Cancel", exact: true }).click();
  const savedBeforeReload = await storage();
  await page.reload();
  await tab("Accounts");
  assert(
    (await storage()) === savedBeforeReload &&
      (await page.locator(".connection-state-text").allTextContents()).every(
        (text) => text.trim() === "disconnected",
      ),
    "reload retains stable IDs and restores every descriptor disconnected",
  );
  assert(
    (await page.locator(".usage-meter, .owned-source, [role=gridcell]").count()) === 0,
    "local descriptors show no invented quota or activity",
  );
  await page.locator(`#account-overview-${work.id}`).click();
  assert(
    (await page.getByRole("combobox", { name: "Account context" }).inputValue()) === work.id &&
      (await page.locator(".owned-source").count()) === 0,
    "local Accounts navigation uses stable IDs and unknown values",
  );
  await tab("Accounts");
  await menu(`account-actions-${work.id}`, "Rename account");
  await alias().fill("Work renamed");
  await alias().press("Enter");
  await dialog().waitFor({ state: "detached" });
  await tab("Overview");
  assert(
    (await page.getByRole("combobox", { name: "Account context" }).inputValue()) === work.id &&
      (await page.locator("#account-context-status").innerText()).includes("Work renamed"),
    "rename updates context label without changing selection",
  );
  await tab("Accounts");
  for (const palette of ["Graphite & Jade", "Zinc & Signal"])
    for (const theme of ["Light", "Dark"]) {
      await tab("Settings");
      await page.getByRole("button", { name: new RegExp(palette) }).click();
      await page.getByRole("radio", { name: theme, exact: true }).press("Space");
      await tab("Accounts");
      await capture(
        `accounts-${palette.startsWith("Graphite") ? "jade" : "zinc"}-${theme.toLowerCase()}-380`,
      );
    }
  await addAccount("codex", "🌿".repeat(80));
  const longAccount = (await metadata()).accounts.at(-1);
  await menu(`account-actions-${longAccount.id}`, "Rename account");
  assert(
    (await alias().inputValue()) === "🌿".repeat(80),
    "complete long alias displayed without truncation in rename",
  );
  await page.keyboard.press("Escape");
  for (const width of [320, 380, 420])
    for (const height of [480, 660]) {
      await page.setViewportSize({ width, height });
      const accountOverflow = await page.evaluate(() =>
        [...document.querySelectorAll('[role="tabpanel"][data-state="active"] *')].some(
          (element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && (rect.right > innerWidth + 1 || rect.left < -1);
          },
        ),
      );
      assert(!accountOverflow, `account aliases and actions fit at ${width}/${height}`);
      await page.getByRole("button", { name: "Add local account", exact: true }).click();
      await alias().fill("🌿".repeat(80));
      assert(
        (await alias().inputValue()) === "🌿".repeat(80),
        `full 80-codepoint value retained at ${width}/${height}`,
      );
      const overflow = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth > innerWidth,
        modal:
          document.querySelector("dialog").scrollWidth >
          document.querySelector("dialog").clientWidth + 1,
      }));
      assert(
        !overflow.doc && !overflow.modal,
        `no document/modal horizontal overflow at ${width}/${height}`,
      );
      await capture(`dialog-${width}-${height}`);
      await page.keyboard.press("Escape");
    }
  await page.setViewportSize({ width: 380, height: 660 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await tab("Overview");
  await tab("Accounts");
  assert(
    await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
    "reduced motion runtime active",
  );
  await menu(`connection-actions-${keyA.id}`, "Remove local connection descriptor…");
  assert(
    (await dialog().innerText()).includes("開発 👩‍💻") &&
      (await dialog().innerText()).includes("OpenRouter"),
    "connection removal names exact alias and owner",
  );
  await dialog().getByRole("button", { name: "Remove", exact: true }).click();
  await dialog().waitFor({ state: "detached" });
  assert(
    !(await metadata()).connections.some((c) => c.id === keyA.id) &&
      (await metadata()).connections.some((c) => c.alias === "Project B Key"),
    "remove only targeted descriptor",
  );
  assert(
    await focused(`account-actions-${router.id}`),
    "deleted connection focus returns to owner action",
  );
  await menu(`account-actions-${work.id}`, "Remove local account…");
  assert(
    (await dialog().innerText()).includes("Work renamed") &&
      (await dialog().innerText()).includes("1 owned connection"),
    "account deletion lists exact local target and cascade",
  );
  await dialog().getByRole("button", { name: "Cancel", exact: true }).click();
  assert(
    (await metadata()).accounts.some((a) => a.id === work.id),
    "deletion Cancel preserves target",
  );
  await menu(`account-actions-${work.id}`, "Remove local account…");
  await dialog().getByRole("button", { name: "Remove", exact: true }).click();
  await dialog().waitFor({ state: "detached" });
  assert(
    await focused(`account-actions-${longAccount.id}`),
    "deleted account focus returns to next surviving account action",
  );
  await tab("Overview");
  assert(
    (await page.getByRole("combobox", { name: "Account context" }).inputValue()) === "all" &&
      (await page.locator("#account-context-status").innerText()).includes("Selection removed"),
    "removal invalidates selected Overview safely",
  );
  const localBeforeDemo = await storage();
  await checkNavigation(page, { tab }, assert, development);
  assert(
    (await storage()) === localBeforeDemo,
    "full demo navigation and fixture changes never persist demo accounts",
  );
  // Corrupt input is test-injected only in this dedicated browser origin.
  const preferencesBeforeRecovery = await page.evaluate(() => [
    localStorage.getItem("quotafern.appearance.mode.v1"),
    localStorage.getItem("quotafern.appearance.palette.v1"),
  ]);
  for (const [name, text] of [
    ["corrupt", "{"],
    ["oversized", "x".repeat(65537)],
    ["unknown-version", JSON.stringify({ version: 42 })],
  ]) {
    await page.evaluate(([key, text]) => localStorage.setItem(key, text), [key, text]);
    await page.reload();
    await tab("Accounts");
    assert(
      (await page.getByRole("button", { name: "Add local account", exact: true }).isDisabled()) &&
        (await storage()) === text,
      `${name} preserved and editing locked`,
    );
    await capture(`recovery-${name}-380`);
    await page.getByRole("button", { name: "Reset local metadata…", exact: true }).click();
    await dialog().getByRole("button", { name: "Cancel", exact: true }).click();
    assert((await storage()) === text, `${name} reset cancellation preserves recoverable data`);
    await page.getByRole("button", { name: "Reset local metadata…", exact: true }).click();
    await dialog().getByRole("button", { name: "Reset local metadata", exact: true }).click();
    await dialog().waitFor({ state: "detached" });
    assert(
      (await metadata()).accounts.length === 0 && (await focused("local-accounts-title")),
      `${name} explicit recovery succeeds and focuses heading`,
    );
  }
  assert(
    JSON.stringify(
      await page.evaluate(() => [
        localStorage.getItem("quotafern.appearance.mode.v1"),
        localStorage.getItem("quotafern.appearance.palette.v1"),
      ]),
    ) === JSON.stringify(preferencesBeforeRecovery),
    "recovery preserves appearance/palette",
  );
  await page.addInitScript(() => {
    if (window.name !== "acc04-deny-storage-read") return;
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (key === "quotafern.account-presentation.v1")
        throw new DOMException("synthetic", "SecurityError");
      return get.call(this, key);
    };
  });
  const beforeReadFailure = await storage();
  await page.evaluate(() => (window.name = "acc04-deny-storage-read"));
  await page.reload();
  await tab("Accounts");
  assert(
    (await page.getByRole("button", { name: "Add local account", exact: true }).isDisabled()) &&
      (await page.getByRole("button", { name: "Reset local metadata…", exact: true }).count()) ===
        0,
    "unavailable storage read locks edits and forbids destructive reset",
  );
  await capture("read-failure-380");
  await page.evaluate(() => (window.name = ""));
  await page.reload();
  await tab("Accounts");
  assert(
    (await storage()) === beforeReadFailure &&
      (await page.getByRole("button", { name: "Add local account", exact: true }).isEnabled()),
    "reload after storage recovery preserves prior bytes",
  );
  await addAccount("codex", "Only account");
  const only = (await metadata()).accounts[0];
  await menu(`account-actions-${only.id}`, "Remove local account…");
  await dialog().getByRole("button", { name: "Remove", exact: true }).click();
  await dialog().waitFor({ state: "detached" });
  assert(await focused("local-accounts-title"), "last account removal focuses Accounts heading");
  await page.evaluate(([key, text]) => localStorage.setItem(key, text), [key, localBeforeDemo]);
  await page.reload();
  await tab("Accounts");
  await ready("Accounts");
  await capture("accounts-380");
  assert(
    requests.every((url) => new URL(url).hostname === "127.0.0.1"),
    "all observed source/production browser requests stay localhost-only",
  );
  assert(
    (await page.evaluate(() => Object.keys(localStorage))).every((key) =>
      [
        "quotafern.account-presentation.v1",
        "quotafern.appearance.mode.v1",
        "quotafern.appearance.palette.v1",
      ].includes(key),
    ),
    "only three allowlisted storage namespaces",
  );
  return {
    checks: results.length,
    failures: results.filter((r) => !r.passed),
    results,
    requests: [...new Set(requests)],
  };
}
