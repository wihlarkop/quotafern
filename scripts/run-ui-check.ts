import { mkdir } from "node:fs/promises";

// Playwright CLI evaluates a single function in a VM without module imports.
// Inline the same helper that Bun regression tests exercise; no duplicated wait logic.
const mode = Bun.argv[2];
if (mode !== "browser" && mode !== "production") throw new Error("Use browser or production");
const session = Bun.argv[3] ?? "quotafern-ux02b-fix";
const milestone = Bun.argv[4] ?? "ux-02b";
if (!["ux-02b", "ux-02c"].includes(milestone)) throw new Error("Unknown UI milestone");
const checkPath = `docs/${milestone}/${mode === "browser" ? "browser" : "production"}-check.js`;
const helper = new Bun.Transpiler({ loader: "ts" })
  .transformSync(await Bun.file("scripts/tab-capture.ts").text())
  .replace(/^export /gm, "");
const check = await Bun.file(checkPath).text();
const start = check.indexOf("{") + 1;
await mkdir(".tmp", { recursive: true });
const bundledPath = `.tmp/${milestone}-${mode}-check-with-tab-capture.js`;
const interactions =
  milestone === "ux-02c" ? await Bun.file("docs/ux-02c/interaction-check.js").text() : "";
await Bun.write(
  bundledPath,
  check.slice(0, start) + "\n" + helper + "\n" + interactions + check.slice(start),
);

async function cli(args: string[]): Promise<string> {
  const command = Bun.spawn(
    [process.execPath, "x", "--bun", "@playwright/cli", `-s=${session}`, ...args],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [output, errors, exit] = await Promise.all([
    new Response(command.stdout).text(),
    new Response(command.stderr).text(),
    command.exited,
  ]);
  if (exit !== 0 || output.includes("### Error")) throw new Error(output + errors);
  return output;
}
await cli(["goto", `http://127.0.0.1:${mode === "browser" ? 4175 : 4176}/`]);
const output = await cli(["run-code", `--filename=${bundledPath}`]);
await Bun.write(`.tmp/${mode}-tab-capture.log`, output);
const lines = output.split(/\r?\n/);
const index = lines.indexOf("### Result");
if (index < 0) throw new Error("Browser check returned no result");
const result = JSON.parse(lines[index + 1]) as { checks: number; failures: string[] };
if (result.failures.length > 0) throw new Error(JSON.stringify(result));
await Bun.write(
  `docs/${milestone}/${mode === "browser" ? "browser" : "production"}-results.json`,
  JSON.stringify(result, null, 2) + "\n",
);
console.log(`${mode}: ${result.checks} checks passed; ${result.failures.length} failures`);
