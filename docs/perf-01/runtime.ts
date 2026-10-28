// Synthetic renderer measurements only; requires production preview 4278 and baseline preview 4279.
const session = "quotafern-perf01-runtime";
async function cli(args: string[]) {
  const child = Bun.spawn(
    [Bun.argv[0], "x", "--bun", "@playwright/cli", `-s=${session}`, ...args],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code || out.includes("### Error")) throw Error(out + err);
  return out;
}
const fixture = await Bun.file("qa/browser/ux-03/fixture.js").text();
const expression = String.raw`async (page) => {
  /* FIXTURE */
  const browser = page.context().browser();
  const rows = [], external = [], errors = [];
  const settled = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const paint = p => p.evaluate(() => ({ fcpMs: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null, domContentLoadedMs: performance.getEntriesByType("navigation")[0]?.domContentLoadedEventEnd ?? null }));
  for (const variant of ["baseline", "optimized", "optimized", "baseline", "baseline", "optimized"]) {
    const startedAt = new Date().toISOString();
    const base = "http://127.0.0.1:" + (variant === "baseline" ? "4279" : "4278");
    const context = await browser.newContext({ viewport: { width: 420, height: 740 }, colorScheme: "light" });
    try {
      await context.route("**/*", route => { const u = new URL(route.request().url()); if (u.hostname === "127.0.0.1") return route.continue(); external.push(u.origin); return route.abort(); });
      const p = await context.newPage(); p.on("pageerror", e => errors.push(e.message));
      await installUx03Fixture(p, 3, "light");
      await p.addInitScript(() => { const clock = Date.now; Date.now = () => clock() + (window.__ux03?.timeOffset ?? 0); });
      const cdp = await context.newCDPSession(p); await cdp.send("Performance.enable");
      await p.goto(base); await p.getByRole("heading", { name: "Usage overview" }).waitFor(); await settled(p);
      const startup = await paint(p);
      const mark = Date.now(); await p.getByRole("tab", { name: "Accounts", exact: true }).click(); await p.getByRole("tabpanel", { name: "Accounts", exact: true }).waitFor(); await settled(p);
      const accountsNavigationWallMs = Date.now() - mark;
      const before = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(m => [m.name, m.value]));
      const refreshBefore = await p.evaluate(() => window.__ux03.calls.filter(c => c.command === "codex_direct_refresh").length);
      const idleStart = Date.now(); await p.waitForTimeout(5000);
      const idleMs = Date.now() - idleStart;
      const after = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(m => [m.name, m.value]));
      const refreshAfter = await p.evaluate(() => window.__ux03.calls.filter(c => c.command === "codex_direct_refresh").length);
      await p.getByRole("tab", { name: "Overview", exact: true }).click(); await settled(p);
      await p.evaluate(() => window.__ux03.timeOffset = 31000);
      await p.getByRole("button", { name: "Refresh all connected Codex accounts", exact: true }).click();
      await p.waitForFunction(() => window.__ux03.calls.filter(c => c.command === "codex_direct_refresh").length === 3);
      const consent = await context.newPage(); await installUx03Fixture(consent, 3, "light");
      await consent.goto(base + "/consent.html"); await consent.locator("#cancel-consent").waitFor(); await settled(consent);
      const consentStartup = await paint(consent); await consent.keyboard.press("Escape");
      const consentCalls = await consent.evaluate(() => window.__ux03.calls.map(c => c.command));
      rows.push({ variant, startedAt, startup, accountsNavigationWallMs, idleMs, idleTaskDurationMs: (after.TaskDuration - before.TaskDuration) * 1000, heapUsedBeforeBytes: before.JSHeapUsedSize, heapUsedAfterBytes: after.JSHeapUsedSize, automaticRefreshCallsDuringIdle: refreshAfter - refreshBefore, refreshAllCalls: 3, consentStartup, consentCalls });
    } finally { await context.close(); }
  }
  if (external.length || errors.length) throw Error(JSON.stringify({ external, errors }));
  if (rows.some(r => r.automaticRefreshCallsDuringIdle || r.consentCalls.some(c => !c.startsWith("codex_consent_")))) throw Error("Unexpected fixture lifecycle activity");
  return { method: "Synthetic IPC only; six interleaved fresh Chromium contexts, three accounts, local production assets, five-second settled Accounts idle samples, navigation wall times include Playwright overhead. No native processes/credentials. Heap samples are not retained-memory/leak measurements. Startup is renderer-only, not native cold launch. No concurrent builds should run.", rows, externalRequests: external.length, pageErrors: errors.length };
}`.replace("/* FIXTURE */", fixture);
await Bun.write(".tmp/perf-01/runtime-profile.js", expression);
try {
  await cli(["open", "http://127.0.0.1:4278"]);
  const out = await cli(["run-code", "--filename=.tmp/perf-01/runtime-profile.js"]);
  await Bun.write(".tmp/perf-01/runtime-profile.log", out);
  const lines = out.split(/\r?\n/);
  const at = lines.indexOf("### Result");
  if (at < 0) throw Error("Missing browser result");
  const result = JSON.parse(lines[at + 1]!);
  await Bun.write(
    "docs/perf-01/evidence/renderer-runtime.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  await cli(["close"]).catch(() => {});
}
