import { mkdir, readdir, stat } from "node:fs/promises";
import { cpus, freemem, platform, release, totalmem } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

import { build, type Plugin } from "vite";

import config from "../../vite.config";

const root = ".tmp/perf-01";
const baseline = "1f3ce659a6aff771ba88868c6cf5694f94a3bb12";
const consent = "src/lib/accounts/ConsentDialog.svelte";
const button = "src/lib/components/ui/button/button.svelte";
const environment = () => ({
  bun: Bun.version,
  os: platform(),
  release: release(),
  cpu: cpus()[0]?.model,
  logicalCpus: cpus().length,
  totalMemory: totalmem(),
  freeMemoryAtEnd: freemem(),
});
async function json(path: string, value: unknown) {
  await Bun.write(path, JSON.stringify(value, null, 2) + "\n");
}
async function run(args: string[]) {
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const child = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { startedAt, wallMs: performance.now() - start, code, stdout, stderr };
}
const hashText = (text: string) =>
  new Bun.CryptoHasher("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");
async function provenance() {
  const head = await run(["git", "rev-parse", "HEAD"]);
  const diff = await run([
    "git",
    "diff",
    "--no-ext-diff",
    "HEAD",
    "--",
    "src",
    "index.html",
    "consent.html",
    "vite.config.ts",
    "svelte.config.js",
    "bun.lock",
    "package.json",
  ]);
  if (head.code || diff.code) throw Error("Cannot capture source provenance");
  const sources: Record<string, string> = {};
  for (const path of [consent, button, "src/app.css", "vite.config.ts", "bun.lock", "package.json"])
    sources[path] = hashText(await Bun.file(path).text());
  return {
    head: head.stdout.trim(),
    trackedFrontendDiffSha256: hashText(diff.stdout),
    sources,
    textHashMethod:
      "SHA-256 of UTF-8 text with CRLF normalized to LF; tracked frontend diff relative to measured HEAD",
  };
}
async function assets(dir: string) {
  const rows = [];
  for await (const path of new Bun.Glob("**/*").scan({ cwd: dir, onlyFiles: true })) {
    const bytes = new Uint8Array(await Bun.file(`${dir}/${path}`).arrayBuffer());
    rows.push({
      path: path.replaceAll("\\", "/"),
      rawBytes: bytes.length,
      gzipBytes: gzipSync(bytes, { level: 9 }).length,
      brotliBytes: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })
        .length,
      sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
    });
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}
async function sizes(path: string): Promise<{ files: number; bytes: number }> {
  let files = 0,
    bytes = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const p = join(path, entry.name);
    if (entry.isDirectory()) {
      const child = await sizes(p);
      files += child.files;
      bytes += child.bytes;
    } else if (entry.isFile()) {
      files++;
      bytes += (await stat(p)).size;
    }
  }
  return { files, bytes };
}
async function sample(variant: string, key: string) {
  if (!["baseline", "icons", "optimized"].includes(variant) || !/^[a-z0-9-]+$/.test(key))
    throw Error("Invalid sample");
  const originals: Record<string, string> = {};
  for (const path of [consent, button]) {
    const result = await run(["git", "show", `${baseline}:${path}`]);
    if (result.code) throw Error(result.stderr);
    originals[path] = result.stdout;
  }
  let transformed = 0,
    svelteTransforms = 0;
  const chunks: unknown[] = [];
  const plugin: Plugin = {
    name: "perf-01-profile",
    enforce: "pre",
    load(id) {
      const relative = id
        .replaceAll("\\", "/")
        .replace(process.cwd().replaceAll("\\", "/") + "/", "");
      if (variant === "baseline" && relative === consent) return originals[consent];
      if (variant !== "optimized" && relative === button) return originals[button];
    },
    transform(_code, id) {
      transformed++;
      if (id.endsWith(".svelte")) svelteTransforms++;
    },
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle))
        if (item.type === "chunk")
          chunks.push({
            fileName: item.fileName,
            isEntry: item.isEntry,
            imports: item.imports,
            modules: Object.entries(item.modules).map(([id, info]) => ({
              id: id.replaceAll(process.cwd().replaceAll("\\", "/"), "."),
              renderedLength: info.renderedLength,
            })),
          });
    },
  };
  const inputs: Record<string, string> = {};
  for (const path of [consent, button])
    inputs[path] = hashText(
      variant === "baseline" || (variant === "icons" && path === button)
        ? originals[path]!
        : await Bun.file(path).text(),
    );
  const startedAt = new Date().toISOString();
  const outDir = `${root}/paired/${key}`;
  const start = performance.now();
  await build({
    ...config,
    configFile: false,
    build: { ...config.build, outDir: `${outDir}/dist` },
    plugins: [plugin, ...config.plugins!],
  });
  const viteMs = performance.now() - start;
  await json(`${outDir}/sample.json`, {
    variant,
    baseline,
    startedAt,
    completedAt: new Date().toISOString(),
    inputs,
    viteMs,
    transformed,
    svelteTransforms,
    chunks,
  });
}

await mkdir(root, { recursive: true });
const [mode, label = "snapshot", countText = "3"] = Bun.argv.slice(2);
if (mode === "--sample") {
  await sample(label, countText);
} else if (mode === "paired") {
  const measuredSource = await provenance();
  const rows = [];
  const order = [
    "baseline",
    "icons",
    "optimized",
    "optimized",
    "icons",
    "baseline",
    "icons",
    "baseline",
    "optimized",
  ];
  for (const [n, variant] of ["baseline", "icons", "optimized", ...order].entries()) {
    const warmup = n < 3;
    const key = `${warmup ? "warmup" : "run"}-${n}-${variant}`;
    const result = await run([Bun.argv[0], "run", import.meta.path, "--sample", variant, key]);
    await Bun.write(`${root}/paired/${key}.log`, result.stdout + result.stderr);
    if (result.code) throw Error(`Sample failed: ${key}`);
    const metrics = await Bun.file(`${root}/paired/${key}/sample.json`).json();
    const row = {
      key,
      warmup,
      variant,
      startedAt: metrics.startedAt,
      completedAt: metrics.completedAt,
      inputSha256: metrics.inputs,
      wallMs: result.wallMs,
      viteMs: metrics.viteMs,
      transformed: metrics.transformed,
      svelteTransforms: metrics.svelteTransforms,
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  const output: Record<string, unknown> = {};
  for (const variant of ["baseline", "icons", "optimized"]) {
    const row = rows.findLast((r) => r.variant === variant)!;
    output[variant] = await assets(`${root}/paired/${row.key}/dist`);
  }
  if (JSON.stringify(measuredSource) !== JSON.stringify(await provenance()))
    throw Error("Sources changed during measurement");
  await json(`${root}/paired-results.json`, {
    baseline,
    measuredSource,
    environment: environment(),
    method:
      "Warm OS/file caches shared across separate Bun processes, one warmup per variant then nine interleaved samples, instrumented Vite-only builds; no concurrent local builds. Only baseline consent/button source is substituted in memory; source files are never rewritten. Module renderedLength values precede minification; do not sum as shipped bytes.",
    rows,
    assets: output,
  });
} else if (mode === "frontend") {
  const count = Number(countText);
  if (!/^[a-z0-9-]{1,40}$/.test(label) || !Number.isInteger(count) || count < 1 || count > 10)
    throw Error("Use frontend LABEL COUNT (1..10)");
  const dir = `${root}/${label}`;
  await mkdir(dir, { recursive: true });
  const rows = [];
  for (const task of ["check", "build"])
    for (let repetition = 1; repetition <= count; repetition++) {
      const startedAt = new Date().toISOString();
      const result = await run([Bun.argv[0], "run", task]);
      await Bun.write(`${dir}/${task}-${repetition}.log`, result.stdout + result.stderr);
      const row = { task, repetition, startedAt, wallMs: result.wallMs, code: result.code };
      rows.push(row);
      await json(`${dir}/timings.json`, rows);
      console.log(JSON.stringify(row));
      if (result.code) throw Error(`${task} failed`);
    }
  await json(`${dir}/assets.json`, await assets("dist"));
  await json(`${dir}/environment.json`, environment());
} else if (mode === "qa") {
  if (!["source", "production"].includes(label)) throw Error("Use qa source or production");
  await mkdir("docs/perf-01/evidence/browser", { recursive: true });
  const runnerPath = root + "/run-browser.ts";
  let runner = await Bun.file("scripts/run-ux03-check.ts").text();
  runner = runner
    .replaceAll("quotafern-ux03-", "quotafern-perf01-")
    .replaceAll("docs/evidence/ux-03", "docs/perf-01/evidence/browser")
    .replaceAll("4177", "4277")
    .replaceAll("4178", "4278");
  runner = runner.replace(
    'const check = await Bun.file("qa/browser/ux-03/browser-check.js").text();',
    'const check = (await Bun.file("qa/browser/ux-03/browser-check.js").text()).replaceAll("docs/evidence/ux-03", "docs/perf-01/evidence/browser");',
  );
  await Bun.write(runnerPath, runner);
  const result = await run([Bun.argv[0], "run", runnerPath, label]);
  console.log(result.stdout);
  if (result.code) throw Error(result.stderr || "Browser QA failed");
} else if (mode === "dependencies") {
  const names = [
    "@lucide/svelte",
    "@tauri-apps/api",
    "bits-ui",
    "clsx",
    "svelte",
    "tailwind-merge",
    "tailwind-variants",
    "vite",
    "typescript",
    "svelte-check",
    "tailwindcss",
  ];
  const rows = [];
  for (const name of names) rows.push({ name, ...(await sizes(`node_modules/${name}`)) });
  await json(`${root}/dependency-files.json`, {
    method:
      "Logical package file bytes, excluding transitive dependencies; not disk allocation or shipped bundle size",
    rows,
  });
  console.log(JSON.stringify(rows));
} else {
  console.log(
    "bun run perf:measure frontend LABEL [COUNT]\nbun run perf:measure paired\nbun run perf:measure dependencies\nbun run perf:measure qa source|production (servers 4277/4278)\nOutputs: .tmp/perf-01. Run sequentially, with no concurrent builds. Never launches native apps or accesses credentials. Paired mode requires the pinned UX-03 baseline commit in local Git.",
  );
}
