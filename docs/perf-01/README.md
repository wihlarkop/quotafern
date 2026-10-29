# PERF-01 — build pipeline and bundle performance

Measured branch base: published UX-03B `e2307da2dee61a79031aaea49da9d8a788048724`. Work is isolated on `codex/perf-01`; PR #20 and the owner's dirty primary checkout are untouched. The owner explicitly authorized proceeding before UX-03 merges. The Draft PR targets the UX-03 branch while it is open and should be rebased/retargeted to `main` after that merge, with integration acceptance repeated for intervening UI changes.

Upstream subsequently published focused quota UI at `ce439d57b1da86b1d90232a0c9135a136e431c88`. It changes none of PERF-01's five production/pipeline files or native/security code. This benchmark remains pinned to UX-03B rather than chasing ongoing acceptance work. Draft PR CI tests GitHub's merge with its then-current upstream; the PR records that tested merge/base separately from these measurements. Browser QA here is explicitly the measured UX-03B tree. Its adapter deliberately refuses unknown future capture layouts rather than overwriting upstream evidence.

The original request named UX-03 `1f3ce659a6aff771ba88868c6cf5694f94a3bb12`. Profiling began there; [its frozen report](initial-report.md) and raw evidence are preserved. When UX-03B was published during this task, PERF-01 was rebased and the controlled frontend comparison, current regression and current browser QA were repeated. Do not mix the two datasets or attribute UX-03B's own UI changes to PERF-01.

## Results on published UX-03B

| Controlled metric                    |     Before |      After |
| ------------------------------------ | ---------: | ---------: |
| Median Vite build, seconds           |      6.977 |      3.284 |
| Modules processed                    |      4,779 |        736 |
| Svelte transforms                    |      2,140 |        254 |
| Main entry JS, raw bytes             |    234,320 |    234,320 |
| Shared JS, raw bytes                 |    124,132 |     94,665 |
| Consent entry JS, raw bytes          |      4,513 |      4,513 |
| Total emitted JS, raw bytes          |    362,965 |    333,498 |
| Total emitted JS, gzip bytes         |    113,404 |    104,694 |
| Total emitted JS, Brotli bytes       |     93,424 |     91,096 |
| Shared CSS, raw bytes                |     49,709 |     49,709 |
| Consent CSS, raw bytes               |      1,844 |      1,844 |
| Entire frontend directory, raw bytes |    436,787 |    407,320 |
| Windows release executable, bytes    | 13,947,392 | 13,947,392 |
| CI Svelte checks per full workflow   |          8 |          1 |
| CI Vite builds per full workflow     |          7 |          4 |

The shared JS is loaded by both entry points: main initial JS is 358,452 → 328,985 bytes; consent initial JS is 128,645 → 99,178 bytes. Consent is not eagerly loaded by the main window. The frontend saves **29,467 raw bytes**; no Windows executable/installer reduction or runtime speedup is claimed on this integration base.

[All controlled samples, hashes, environment and composition provenance](evidence/integration-paired-results.json), [native size comparison](evidence/integration-native.json). Native size builds use identical native source, release flags, two-job warmed target and null frontend hook, changing only the prebuilt baseline/optimized frontend directory. Browser correctness QA may run concurrently; their elapsed times are not a native compiler speed comparison. No matching installer pair was produced.

## Implemented optimizations

1. **Remove repeated frontend work in CI.** `build:assets` invokes Vite only. Normal `build` retains `check` before asset generation; the default Tauri `beforeBuildCommand` remains unchanged. Frontend CI retains its explicit Svelte check, lint, formatting and regression. Every desktop job generates assets before Clippy, Cargo check and native regression, then uses `.github/tauri-ci.json` only for final unbundled compilation. Its schema-valid null hook avoids rebuilding those assets. All native gates remain on Linux, Windows and macOS. Tauri supports [merged config overrides](https://v2.tauri.app/reference/cli/) and an [optional frontend hook](https://v2.tauri.app/reference/config/#buildconfig). Windows compilation explicitly verified the hook was skipped; final hosted logs validate every OS.
2. **Use individual consent icon entries.** The two icons already use the same supported import style as main. The icon-only variant emits byte-identical files while processing far fewer modules. Unused icons were already tree-shaken from production; this fixes graph traversal/compilation cost.
3. **Avoid a second class-merging engine.** The full `tailwind-variants` entry inlines a merge engine while the local Button already applies `twMerge` to its final classes. Its maintained `lite` entry handles the custom Quotafern variant tokens; existing final utility conflict handling and clsx remain. [120 exact class comparisons](evidence/button-class-equivalence.json) passed, including default/variant/size combinations and conflicting caller utilities. These two source files are unchanged between the original UX-03 and published UX-03B baselines, so the class compatibility evidence still applies. Current UX-03B browser checks passed as well.

No dependencies, versions, lockfiles, native features, framework, package manager, component library, CSS or visual design are changed by PERF-01. The same class-variant API remains local to the existing shadcn Button.

## Method and environment

Windows `10.0.26200`, i7-9750H, 12 logical CPUs, approximately 16 GiB RAM, Bun 1.4.4, Rust/Cargo 1.99.1. This is a shared owner machine, not a dedicated benchmark host; only about 0.9 GiB RAM was available at the end of the repeat frontend experiment. All raw samples and warmups are retained. No concurrent local builds ran during the controlled Vite samples.

The interleaved experiment uses separate Bun processes, one warmup each for baseline/icons-only/optimized, then nine balanced samples. Only the two exact original Svelte files are substituted in memory for baseline; icons-only substitutes the original Button; optimized uses current source. The rest of the published UX-03B tree and profiling context are shared. Git revision/diff digest, input source hashes, sample timestamps and end-of-run environment are recorded. Vite API time is primary; subprocess time also includes startup and Git reads. OS/file caches are shared and warm: this is not a cold-machine benchmark. The baseline warmup took 33.855s and is retained, excluded from the predefined measured-sample median.

Icons-only median is 3.389s and optimized median 3.284s; these ranges overlap, so no extra build speedup is attributed to the lite entry. Its demonstrated benefit is shipped size. Module `renderedLength` in composition evidence precedes minification and must not be summed as shipped bytes. gzip level 9 and Brotli quality 11 are comparison metrics, not measured Tauri WebView transfer. Public images and CSS remain byte-identical between variants.

Original cold-target/debug/release and incremental behavior, installed package file sizes, complete dependency audit and initial CI step timing are in the [frozen initial report](initial-report.md). No `cargo clean` was run. All native profiling used an isolated target directory; owner caches and other worktrees were preserved.

## Dependency audit and remaining opportunities

Svelte, Bits UI, Tauri IPC, Tailwind, Lucide, clsx and the final Tailwind merge are used in the compiled UI. The full variants merge engine was a measured redundant inclusion; the lite entry removes it without replacing a dependency. [Installed logical source-file sizes](evidence/dependency-files.json) are distinct from emitted bytes: Lucide's source files total 7,936,738 bytes, but production includes only used icon code.

Rust uses Tauri/window/tray/single-instance features, PNG tray decoding, reqwest with default features already disabled, rustls, Tokio time/macros, Windows process/filesystem/ACL/listener guards, serde/JSON/TOML parsing, SHA-256 identity/integrity hashing, zeroization and random consent challenges. None is unused. The initial empty-target Cargo timing identified expensive aws-lc-sys/Windows binding units; replacing cryptography or deleting platform guards is not an acceptable build shortcut. [Initial Cargo units](evidence/baseline-debug-cargo-units.json). Windows offline dependency trees succeeded; an expanded cross-target tree required uncached crates and hit DNS failure. Same-version Cargo duplicates can represent host/target/feature contexts; incompatible versions were not forcibly unified.

Cargo caching/profile changes are deferred until cache-hit overhead, trust, portability and native artifact effects are measured. Clippy/check/regression already share a job target; release compilation has distinct artifacts. No new third-party cache action or unmeasured profile change is introduced. Demo remains an explicit shipped preview; removing it would change functionality. Development fixture selection is compiled out, and browser fixture files stay outside the application graph.

## Acceptance and security boundaries

- Current `bun run check`, `lint`, `fmt:check`, `regression` and `build` passed. Current frontend regression: **20 groups / 2,308 assertions**.
- Current existing UX-03B source QA: [119 checks, zero failures](evidence/integration-browser/source-results.json). Bundled production QA: [117 checks, zero failures](evidence/integration-browser/production-results.json). Test logic is unchanged; only ports, browser session names and PERF-01 evidence destinations are adapted. The checks cover selection/ownership, many accounts, context/focus return, settings/storage, Demo revocation/failure, Add/consent ordering, stale/failed readings and isolated consent IPC. They assert zero runtime errors/external HTTP. Initial QA evidence remains separately preserved.
- Native `check:rust`, `lint:rust`, `fmt:rust`, `regression:rust` passed: **94 tests passed / zero failed / four ignored fixture entry points** invoked by containment/consent tests. [Command records](evidence/quality-results.json). Native source/config/permissions and lockfiles are byte-unchanged between both UI bases and PERF-01. Repeating these source-only native checks was unnecessary after the UI-only rebase; current baseline and optimized release embedding both compiled. Final hosted CI reruns every gate on the final tree.
- Canonical current fixture captures: [Add light](evidence/integration-browser/production-add-380-light.png), [Add narrow/dark](evidence/integration-browser/production-add-320-dark.png), [Settings light](evidence/integration-browser/production-settings-light.png), [Settings dark](evidence/integration-browser/production-settings-dark.png), [account selector](evidence/integration-browser/production-selector-three.png), [View quota](evidence/integration-browser/production-view-quota.png). Live/identity chrome is synthetic IPC fiction, not authenticated acceptance. Exploratory captures referenced by results remain in ignored scratch.
- The default checked release build and the CI-only Windows debug override compiled on the original UI; the override log proved no frontend hook executed. Both baseline and optimized published UX-03B release assets subsequently compiled with the same temporary hook bypass for the size comparison.
- Security/native behavior remains unchanged: Windows-only production live gate; retired gates false; private pinned helper and supervised transport; managed account isolation; exact identity binding; native remembered grants/challenges; Remote Control prevention; TLS; cancellation/owned-job cleanup; native cooldown and three-minute refresh. No credentials were accessed and no owner-profile application was launched.

The [six-context synthetic renderer exploration](evidence/renderer-runtime.json) used the original frozen UI. Its overlapping startup/navigation/short-idle samples, missing first FCP and uncontrolled GC do not establish a runtime gain or leak result. It is not treated as current native acceptance. No measured evidence justified changing clocks, projections, eager loading, polling or cleanup in PERF-01. Actual native cold/subsequent startup, monitoring idle CPU/RSS, hidden/reopened tray behavior, native consent focus, signed installers/updater and macOS/Linux live behavior remain unexercised. Compilation and synthetic tests do not establish those outcomes.

## Review and hosted CI

[Independent GPT-6 Luna High disposition](review.md) records reviewed revisions, the corrected provenance finding and the follow-up after the published UX-03B rebase. All actionable P0–P2 findings must be resolved before handoff.

The original `1f3ce65` baseline [run 40765953312](https://github.com/wihlarkop/quotafern/actions/runs/40765953312) passed four jobs. The published UX-03B [run 40771469885](https://github.com/wihlarkop/quotafern/actions/runs/40771469885) passed frontend, Linux and Windows; macOS was cancelled with no step data. That cancelled baseline does not establish a macOS failure in source or a completed macOS timing. No upstream run or PR was modified by this task.

PERF-01 final exact-commit Linux/Windows/macOS status, tested merge/base provenance and observed before/after job/step durations are recorded in the Draft PR description and linked Checks after the final evidence commit. [Branch CI runs](https://github.com/wihlarkop/quotafern/actions?query=branch%3Acodex%2Fperf-01). Hosted runners are different physical machines; observed CI durations are not controlled speedup percentages. Final logs must confirm one Svelte check and four Vite builds across the workflow, with the final native compilation skipping the frontend hook on every OS.

## Reproduction

Use locked dependencies, Bun 1.4.4 and the baseline Git object available locally. Run timing commands sequentially with no concurrent builds. The current profiler pins published UX-03B; the initial report/evidence retain the earlier dataset.

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

The two servers need separate terminals and browser-reachable loopback access; the restricted Windows sandbox required host-side servers/browser cache access. No app code was changed to work around that environment boundary. Outputs are under `.tmp/perf-01`; current canonical QA evidence uses `docs/perf-01/evidence/integration-browser` and never overwrites UX-03/UX-03B captures.

For native size reproduction, build the paired baseline/optimized output directories with the same release target/compiler, two Cargo jobs and identical hook bypass, varying only `build.frontendDist`. Do not launch the built application. The original cold/repeat commands and cache distinctions are in the initial report. The optional `runtime.ts` helper is exploratory fixture profiling, requiring production preview on 4278 and baseline assets on 4279; never treat it as authenticated native acceptance.

No merge, tag, release, credential use, Claude integration, native gate change or alteration of PR #20/other worktrees is authorized or performed.
