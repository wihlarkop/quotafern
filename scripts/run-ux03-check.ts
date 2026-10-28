import { mkdir } from "node:fs/promises";

const mode = Bun.argv[2];
if (mode !== "source" && mode !== "production") throw Error("Use source or production");
const session = `quotafern-ux03b-${mode}`;
const url = `http://127.0.0.1:${mode === "source" ? 4177 : 4178}`;
await mkdir(".tmp/qa/ux-03b", { recursive: true });
await mkdir(".tmp/qa/screenshots/ux-03b", { recursive: true });
async function cli(args: string[]) {
  const process = Bun.spawn(
    [Bun.argv[0], "x", "--bun", "@playwright/cli", `-s=${session}`, ...args],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [out, err, code] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (code !== 0 || out.includes("### Error")) throw Error(out + err);
  return out;
}
const fixture = await Bun.file("qa/browser/ux-03/fixture.js").text();
const check = await Bun.file("qa/browser/ux-03/browser-check.js").text();
const file = `.tmp/qa/ux-03b/${mode}-check.js`;
await Bun.write(
  file,
  check
    .trim()
    .replace(/;$/, "")
    .replace("/* FIXTURE */", fixture)
    .replaceAll("QA_BASE_URL", url)
    .replaceAll("QA_MODE", mode),
);
try {
  await cli(["open", url]);
  const out = await cli(["run-code", `--filename=${file}`]);
  await Bun.write(`.tmp/qa/ux-03b/${mode}.log`, out);
  const resultLine = out.split(/\r?\n/).findIndex((l) => l === "### Result");
  const result = JSON.parse(out.split(/\r?\n/)[resultLine + 1]) as {
    checks: number;
    failures: string[];
  };
  await Bun.write(
    `docs/evidence/ux-03b/${mode}-results.json`,
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(`${mode}: ${result.checks} checks; ${result.failures.length} failures`);
  if (result.failures.length) throw Error(result.failures.join("\n"));
} finally {
  await cli(["close"]).catch(() => {});
}
