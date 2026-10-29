> Frozen initial UX-03 dataset at `1f3ce65`. See [the current published UX-03B integration report](README.md) for the final branch results. Values below are retained without reassigning them to the newer UI.

# PERF-01: measured build and bundle optimization

Local measurements and acceptance are recorded below. The interleaved Vite median fell from 6.380s to 3.075s; shipped JavaScript fell by 29,462 raw bytes. Runtime speedup is not established. Exact-commit hosted status is recorded in the Draft PR description/checks; see the independent review disposition alongside this report.

## Scope and provenance

Baseline: UX-03 `1f3ce659a6aff771ba88868c6cf5694f94a3bb12`. The owner authorized proceeding with isolated low-risk implementation before UX-03 merges. The primary UX-03 checkout and PR #20 are untouched. The PERF-01 Draft initially targets the UX-03 branch to keep its diff separate; retarget it to `main` after UX-03 merges. Never merge/tag/release from this task.

Only CI build scheduling and existing frontend library entry points are candidates. Provider/native implementation, permissions, security policy, design and polling behavior are not optimization targets in this patch.

## Measurement method and environment

Windows `10.0.26200`, Intel i7-9750H (12 logical processors), approximately 16 GiB physical RAM, Bun 1.4.4, Rust/Cargo 1.99.1. Approximately 2.8 GiB RAM was available at the end of initial frontend samples; this shared owner machine is not a dedicated benchmark host. Raw timings fluctuate; do not compare a cold first sample to a warm optimized sample as an improvement.

Three sequential `bun run check` runs followed by three `bun run build` runs in a fresh isolated worktree. Dependencies were locked and installed once; global package and OS caches were warm. The first frontend build had no `dist`. Subsequent builds regenerated it. No concurrent local build was run during these samples. The standard `build` includes Svelte diagnostics. Raw [timings](evidence/baseline-frontend-timings.json), [environment](evidence/environment.json), [assets/hashes](evidence/baseline-assets.json), and [composition](evidence/baseline-composition.json) are retained.

Compression is measured per file using gzip level 9 and Brotli quality 11. These are comparison metrics, not actual local Tauri WebView transfer. Module `renderedLength` values come from Vite/Rolldown before minification and cannot be added or compared directly to minified shipped bytes. Public favicon files are accounted for separately.

Native builds use a new `CARGO_TARGET_DIR=src-tauri/target/perf-01-baseline`, `CARGO_BUILD_JOBS=2`, `bun run build:desktop --no-bundle [--debug] -- --locked --offline --timings`. Dependencies are already downloaded; each profile starts with no compiled target artifacts. A repeated build uses the same target/profile. This is an empty target, not a cold disk/registry/OS cache. No `cargo clean` and no primary target modifications. Default Tauri frontend hooks remain part of the measured total.

## Frontend baseline

| Measurement                           |  First | Second |  Third |
| ------------------------------------- | -----: | -----: | -----: |
| Svelte check, seconds                 | 19.855 |  9.429 |  9.157 |
| Checked frontend build, seconds       | 38.953 | 27.802 | 19.765 |
| Vite portion reported by CLI, seconds | 28.340 |  7.900 |  7.980 |

Each baseline build processed 4,779 modules, including 2,140 Svelte compile/preprocess transforms. Consent imports `Leaf` and `ShieldCheck` through the entire Lucide barrel; main and account components already use individual icon entries. Final output contains only the icons actually used. This is a graph-processing cost, not thousands of shipped icons.

| Asset          | Raw bytes | gzip bytes | Brotli bytes |
| -------------- | --------: | ---------: | -----------: |
| Main JS        |   230,977 |     68,364 |       58,666 |
| Shared app JS  |   123,224 |     41,777 |       31,799 |
| Consent JS     |     4,513 |      2,145 |        1,823 |
| Shared app CSS |    48,230 |     10,094 |        8,873 |
| Consent CSS    |     1,844 |        636 |          507 |

The main window loads main JS plus shared app JS/CSS. Consent loads consent JS/CSS plus shared app JS/CSS; the shared chunk is therefore material to both entries. Do not treat consent as eagerly loaded by main. HTML and public icon totals are available in the asset evidence.

## Prioritized bottlenecks

1. **Repeated CI frontend work:** eight Svelte diagnostics runs and seven Vite builds per baseline workflow. Frontend explicitly checks and then checks again inside build. Each desktop job builds assets before Clippy and Tauri repeats that checked build. Generate required assets once per job, keep diagnostics in frontend quality, and bypass only the second desktop frontend hook through an explicit CI-only config.
2. **Consent barrel import:** 2,140 Svelte transformations for a small icon set. Use supported individual Lucide entries and compare interleaved builds.
3. **Two class-merging engines:** the full `tailwind-variants` entry inlines a merge implementation, while the local Button also uses the separate `tailwind-merge` dependency. Evaluate the existing `tailwind-variants/lite` entry for custom variant tokens, retaining the final existing `twMerge` for caller utilities.
4. **Native dependency compilation:** first-target debug compilation includes an aws-lc-sys build-script unit of 174.44s and Windows bindings of 91.12s. These overlap; do not sum unit wall times. They support the reviewed TLS/platform surface and remain intact. [Top Cargo units](evidence/baseline-debug-cargo-units.json).

## Dependency audit and decisions

| Dependency                              | Actual production use / evidence                                                                      | Decision and risk                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Svelte 5                                | Runtime and compiled UI; 168,730 pre-minification module bytes                                        | Retain framework and current diagnostics.                                                     |
| Bits UI                                 | Tabs and accessible account action menus; 141,005 module bytes including menu behavior                | Retain keyboard/focus semantics; a custom replacement would be a UX/accessibility change.     |
| Tailwind CSS 4                          | Build-time CSS generation; shared app CSS is 48,230 shipped bytes                                     | Retain established styles; consent shares the stylesheet.                                     |
| Lucide                                  | 23 included modules / 16,520 module bytes; barrel processes far more                                  | Prefer individual icon entry imports; preserve icons.                                         |
| clsx                                    | Button class composition; 513 module bytes                                                            | Retain; no meaningful removal win.                                                            |
| tailwind-merge                          | Final Button caller-utility merge; 57,486 module bytes                                                | Retain current conflict behavior.                                                             |
| tailwind-variants                       | Local shadcn Button; 90,439 module bytes in full entry                                                | Evaluate maintained lite entry; no dependency replacement.                                    |
| Tauri API                               | Main IPC and isolated consent IPC; 4,781 module bytes                                                 | Retain entry separation and fixed native commands.                                            |
| Vite/Rolldown, TypeScript, svelte-check | Build/diagnostic tooling                                                                              | Composition contains no tool runtime imports; keep locked toolchain.                          |
| Tauri / single-instance                 | Native window/tray/runtime and single-instance behavior                                               | Retain features; PNG decoding is used by embedded tray icons.                                 |
| reqwest / rustls                        | Fixed managed usage endpoint and reviewed TLS verification; default reqwest features already disabled | Retain TLS/backend. Switching cryptography to improve compile time is outside low-risk scope. |
| Tokio                                   | Timeouts, asynchronous native operations and cancellation select                                      | Retain time/macros; transitive feature unification is not an unused-dependency finding.       |
| windows-sys                             | Integrity, ACL, process/job, pipe, listener and platform guards                                       | Retain all reviewed security features.                                                        |
| serde / serde_json / toml               | Protocol/metadata/config parsing                                                                      | Retain strict parsers.                                                                        |
| sha2 / zeroize / getrandom              | Integrity/identity digest, secret erasure and consent randomness                                      | Retain security primitives.                                                                   |

Windows Cargo duplicate output includes different getrandom, hashbrown, indexmap, miniz_oxide and syn versions. Repeated same-version entries can be separate host/target or feature contexts, not distinct versions. Many lockfile packages are other-platform-only. Do not force semver-incompatible unification. Expanded cross-platform tree lookup hit uncached-crate DNS failure; Windows offline tree succeeded. Final patch must leave lockfiles/dependency versions unchanged unless separately justified.

Demo modules are intentionally shipped for the explicit synthetic preview; removing them changes functionality. Development-only fixture selection is gated by production compilation, and browser fixture files are outside the application graph. Keep that distinction when reporting development code.

## CI baseline

[Baseline workflow run 40765953312](https://github.com/wihlarkop/quotafern/actions/runs/40765953312) passed all four jobs. GitHub checked the PR merge ref `512b4a4a0f41930c7d490d772cbaed078cc6e872`, associated with UX-03 head `1f3ce659a6aff771ba88868c6cf5694f94a3bb12`; do not label it a direct head checkout.

| Job             | Observed active log span, seconds |
| --------------- | --------------------------------: |
| Frontend        |                            23.694 |
| Linux desktop   |                           565.898 |
| Windows desktop |                           746.911 |
| macOS desktop   |                           568.743 |

macOS started later than the other jobs. The observed earliest-to-latest job log span includes that scheduling delay. [CI evidence](evidence/baseline-ci.json) stores command boundaries and success summaries. Command-to-next-command spans include shell/wrapper overhead and are not exact step execution durations. Bun tool setup had cache hits; no Cargo compilation cache is configured. Clippy, check and regression already share their job target directory, while release compilation has distinct artifacts. All these gates remain required.

## Native and runtime baseline

Debug first-target build passed in 495.859s; repeated same-profile build passed in 113.162s. Both emitted a 22,322,176-byte executable. The second still rebuilt frontend files and recompiled the app crate (Cargo reported 40.69s); it is not a pure Cargo no-op. First Cargo compile reported 7m48s. Release first-target build passed in 780.679s; the repeated same-profile build passed in 151.708s, both with a 14,083,072-byte executable. [Native baseline samples](evidence/baseline-native-timings.json). The optimized default release passed in 116.573s and emitted 14,078,976 bytes; the Windows debug build with the CI-only override passed in 44.336s without executing the frontend hook. [Optimized native samples](evidence/optimized-native.json). Native timing samples are descriptive, not a controlled Rust compiler speedup: prior tests warmed additional artifacts, idle preview servers were present, and changed/rewritten assets cause the application crate to recompile. The causal timing comparison is the interleaved Vite experiment.

Do not launch an owner-profile app to profile startup: remembered grants can resume authenticated monitoring automatically. No real credentials or authenticated live traffic are authorized for developer profiling. Synthetic browser startup, navigation and idle/UI measurements can characterize the renderer only; native cold startup, actual monitoring resource usage, hidden/reopened tray behavior and native consent focus/cleanup remain owner acceptance unless safely exercised in an isolated native environment.

Source inspection finds the existing one-second clock updates freshness/countdowns and schedules only consented due sessions through the direct controller. Native cooldown, three-minute refresh, bounded retries, cancellation and cleanup stay unchanged. No measured runtime bottleneck currently justifies altering these policies or introducing lazy loading.

## Implemented changes and controlled comparison

- `build:assets` invokes Vite only. Normal `build` still runs diagnostics first; normal Tauri `beforeBuildCommand` is unchanged.
- Frontend CI retains its explicit Svelte check and uses the asset-only build. Each desktop job builds required assets once before Clippy, check and native regression, then uses `.github/tauri-ci.json` only for its final compilation. The schema-valid null override removes only the duplicate frontend hook. Rust quality/compile gates, matrix, permissions and default release config are unchanged. This follows Tauri's [config merge CLI](https://v2.tauri.app/reference/cli/) and [optional hook schema](https://v2.tauri.app/reference/config/#buildconfig), and was exercised by the local Windows build.
- Consent uses individual Lucide entries. Its icon-only variant is byte-for-byte identical across every emitted file, while processing 736 modules instead of 4,779.
- Button uses `tailwind-variants/lite` for custom variant tokens. The existing final `twMerge` and clsx remain. All 120 exact class-string comparisons across defaults, variants, sizes and conflicting caller utilities passed. [Evidence](evidence/button-class-equivalence.json). No dependencies, versions, lockfiles or native features were removed/changed.

The final experiment uses three variants, one warmup each and nine interleaved samples in separate Bun processes, with no concurrent local builds. The baseline substitutes the two exact original Svelte files in memory; icons-only substitutes the original Button; optimized uses current source. Everything else is shared. Thus it isolates the two source changes under a warm OS/file cache; it is not a cold-machine benchmark. Source hashes, original content hashes per sample, revision/diff digest, timestamps, environment and all samples are in [paired results](evidence/paired-results.json). Vite API time is primary; subprocess time also includes Bun startup and Git reads. The later lint-scope/QA helper additions do not change either measured Svelte file or build semantics.

| Controlled Vite-only metric              | Baseline | Icons only | Optimized |
| ---------------------------------------- | -------: | ---------: | --------: |
| Median of three measured builds, seconds |    6.380 |      3.004 |     3.075 |
| Processed modules                        |    4,779 |        736 |       736 |
| Svelte transforms                        |    2,140 |        254 |       254 |
| Emitted JavaScript, raw bytes            |  358,714 |    358,714 |   329,252 |
| Emitted JavaScript, gzip bytes           |  112,286 |    112,286 |   103,585 |
| Emitted JavaScript, Brotli bytes         |   92,288 |     92,288 |    89,909 |
| Entire frontend directory, raw bytes     |  431,057 |    431,057 |   401,595 |

The icons-only and optimized timing ranges overlap; do not attribute an extra build speedup to the lite entry. Its demonstrated benefit is size. [Summary](evidence/summary.json), [optimized composition](evidence/optimized-composition.json), [production assets/hashes](evidence/optimized-assets.json).

| Normal package script, seconds | Optimized first | Second |  Third |
| ------------------------------ | --------------: | -----: | -----: |
| Svelte check                   |           6.983 |  6.880 |  6.500 |
| Checked frontend build         |          10.564 | 10.215 | 10.193 |

These later ordinary samples have a warmer host than the first baseline sequence; use the interleaved Vite table to assess the source optimization. [All ordinary samples](evidence/optimized-frontend-timings.json).

| Production artifact                       | Baseline raw bytes | Optimized raw bytes |
| ----------------------------------------- | -----------------: | ------------------: |
| Main entry JS                             |            230,977 |             230,977 |
| Shared JS, loaded by main and consent     |            123,224 |              93,762 |
| Consent entry JS                          |              4,513 |               4,513 |
| Shared CSS                                |             48,230 |              48,230 |
| Consent CSS                               |              1,844 |               1,844 |
| Main initial JS including shared chunk    |            354,201 |             324,739 |
| Consent initial JS including shared chunk |            127,737 |              98,275 |
| Windows release executable                |         14,083,072 |          14,078,976 |
| Windows debug executable                  |         22,322,176 |          22,318,080 |

The optimized debug artifact used the CI hook override; the release artifact used the ordinary hook. Both keep native features unchanged. No matching signed/unsigned installer comparison was built; no installer size reduction is claimed. CSS and public images remain byte-identical. HTML/import chunk names change as expected. Installed logical package sizes are recorded [separately](evidence/dependency-files.json): for example Lucide has 7,936,738 source-file bytes and TypeScript 24,346,827 tooling bytes. Those are neither disk allocation nor shipped contribution.

### Renderer-only runtime observations

Six fresh Chromium contexts, interleaved baseline/optimized, used three synthetic accounts and local production assets, with no builds running. [Raw results](evidence/renderer-runtime.json) retain all samples, including a missing first-baseline FCP. No FCP or native cold-start improvement is inferred. DOM-ready medians were 322.9/299.9ms; Accounts navigation medians 80/82ms; five-second idle main-thread task-time medians 25.382/23.684ms. Ranges overlap and samples are small. Heap values fluctuate with GC and do not establish retained memory or leak behavior. Browser binary version was not captured in this exploratory run, further limiting cross-machine reproduction.

All six runs had zero automatic refresh calls during the short idle interval, exactly three calls after explicit Refresh all, consent prompt/cancel IPC only, zero page errors and zero external HTTP requests. This is fixture behavior, not authenticated/native monitoring acceptance. The existing three-minute schedule, native cooldown, cleanup, identity binding and consent implementation were not changed. There is no demonstrated runtime bottleneck warranting clock/projection/lifecycle restructuring in this patch.

### Acceptance and independent review

- `bun run check`, `lint`, `fmt:check`, `regression`, `build`, `check:rust`, `lint:rust`, `fmt:rust` and `regression:rust` passed locally. Frontend regression: 20 groups / 2,129 assertions. Native: 94 passed / 0 failed / 4 ignored fixture entry points that are invoked by containment/consent tests. [Native/remaining quality command records](evidence/quality-results.json); frontend check/build samples and lint are recorded above.
- Existing UX-03 source QA: [58 checks, zero failures](evidence/browser/source-results.json). Bundled production QA: [56 checks, zero failures](evidence/browser/production-results.json). The checks include no external HTTP/runtime errors, correct ID-based actions, multiple connections/workspaces, fresh/stale presentation, focus/keyboard and consent-only IPC. Only evidence paths, dedicated browser sessions and ports change in the PERF-01 runner; original QA sources and UX-03 evidence remain untouched.
- Canonical fixture captures: [Accounts light](evidence/browser/production-accounts-light.png), [dark](evidence/browser/production-accounts-dark.png), [Add account](evidence/browser/production-add-account.png), [consent light](evidence/browser/production-consent-light.png), [short dark consent](evidence/browser/production-consent-dark.png). The displayed live/identity chrome is simulated; these screenshots do not establish native authentication. Other exploratory captures referenced by JSON remain temporary under `.tmp` and are reproducible.
- Independent GPT-6 Luna High final disposition: [review.md](review.md). Initial P2 candidates were implemented; a profiler provenance gap was corrected before the final comparison. Final review outcome is recorded there after review.
- Hosted baseline exact job durations are 25s frontend, 568s Linux, 749s Windows and 571s macOS. Full workflow was 880s including scheduling. [Exact job/step metadata](evidence/baseline-ci-exact.json), [workflow metadata](evidence/baseline-ci-run.json). Baseline head and tested merge ref share tree `cd8d90205da4ac9c44fa42f11f152ae4752f4978`.
- PERF-01 exact-head Linux/Windows/macOS status and observed before/after job/step durations are recorded in the Draft PR description and linked Checks, after the final evidence commit. [Branch CI runs](https://github.com/wihlarkop/quotafern/actions?query=branch%3Acodex%2Fperf-01). Hosted runners are different physical machines; compare observed costs without treating total CI percentages as controlled hardware measurements.

| Baseline CI step, seconds                      | Linux | Windows | macOS |
| ---------------------------------------------- | ----: | ------: | ----: |
| Initial checked frontend assets                |    13 |      18 |    13 |
| Clippy                                         |   106 |     189 |   188 |
| Cargo check                                    |     5 |       8 |    10 |
| Native regression                              |   134 |     151 |   114 |
| Final desktop compile including duplicate hook |   276 |     327 |   231 |

The optimized workflow schedules one Svelte check and four Vite builds in total, versus eight and seven. No quality gate is removed: diagnostics remain in Frontend quality, and every native gate remains in all three desktop jobs. The final hosted logs must confirm the skipped hook on every OS.

## Reproduction

Use Bun 1.4.4 and the locked toolchain/dependencies, with the pinned baseline Git object available locally. Keep the benchmark machine/profile/cache conditions comparable and run measurements sequentially. Never run these timing commands during another build.

```text
bun install --frozen-lockfile
bun run perf:measure frontend LABEL 3
bun run perf:measure paired
bun run perf:measure dependencies
bun run dev --port 4277 --strictPort
bun run preview --port 4278 --strictPort
bun run perf:measure qa source
bun run perf:measure qa production
```

The last two servers run in separate terminals. Runtime exploration also needs the preserved baseline assets: generate the paired samples, serve the last baseline sample directory on 4279 (with `bun run preview --outDir PATH --port 4279 --strictPort`), and run `bun run docs/perf-01/runtime.ts` with production on 4278. This is synthetic Chromium exploration, not native acceptance. Native baseline commands/environment are documented above; keep profile-specific target directories isolated. Reports and logs are under `.tmp/perf-01`; curate relevant evidence without overwriting UX-03 captures.

## Explicit limits

Real/native cold and subsequent startup, monitoring idle CPU/RSS, hidden/reopened tray behavior, native consent focus/cleanup, signed installers/updater and macOS/Linux live behavior were not exercised. The owner-profile application was never launched and real credentials were never accessed. Source equality of native/security files plus passing synthetic regressions supports change-risk assessment, not a new authenticated acceptance claim. No inference, purchases, reset consumption, Claude integration, merge, tag or release was performed.

## Remaining opportunities

Evaluate a separately verified Cargo dependency cache after collecting repeat hosted cache-hit evidence; do not add cache restore overhead or new action trust on assumption alone. Evaluate release profiles and crate artifact types only with clean/repeat build, executable and installer comparisons on every OS. No installers are built/signed by the unbundled CI, so executable bytes cannot establish installer size. More intrusive projection/clock/lazy-loading changes require real traces and dedicated acceptance.
