# Architecture

Quotafern keeps the desktop lifecycle in the Tauri host and the quota presentation in the Svelte frontend. F2 improves native tray behavior; provider integration remains out of scope.

## Responsibilities

| Area                    | Responsibility                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Svelte 5 and TypeScript | Render the popup, handle presentation state, and expose the UI-only quota snapshot seam in `src/lib/quota.ts`.                   |
| Rust and Tauri 2        | Own the native window, single-instance behavior, and tray lifecycle. The `main` window is the only window with app capabilities. |
| Local UI preferences    | Store only the appearance mode and palette in `localStorage`.                                                                    |

The TypeScript quota snapshot shape is a frontend contract, not a second Rust domain model or native source of quota truth. F1 has no snapshot IPC, provider client, account synchronization, or telemetry path.

## Window and tray lifecycle

The app configures one visible, centered `main` popup at 380 × 660. Startup places it near the tray if usable native geometry is available, otherwise clamps the configured position. It is resizable from 320 to 420 logical pixels wide, with a configured minimum height of 480 logical pixels. Constraints temporarily shrink to fit smaller work areas and restore when space permits. Close hides it; a second launch restores the existing process/window. The tray menu preserves Show Quotafern, Hide Quotafern, and Quit.

On Windows and macOS, primary tray clicks open a hidden popup, focus an unfocused popup, and toggle a focused popup. Secondary click opens the native menu. A consumed, 250ms focus-loss allowance applies only while the pointer remains over the tray icon and the popup was focused there; leaving the icon clears it. This handles native blur/click ordering but rapid keyboard focus switching while hovering the icon still needs OS acceptance. Linux preserves the context-menu path because tray click events vary by desktop environment. No privileged desktop hooks or global shortcuts are installed.

Losing focus leaves the popup open deliberately: native menus, account inspection, and Settings must remain predictable. Escape dismisses through the existing restricted `hide_popup` command, unless an inner control consumed it or a dialog/select owns it. Browser preview explains that native dismissal is unavailable. Explicit close/Hide and the tray restore path remain available.

Rust owns positioning. Native tray-event geometry selects the anchor monitor and popup side where supported. Physical coordinates account for HiDPI and negative monitor origins; placement is clamped to the monitor work area and rechecked on startup, restoration, movement, resize, and scale events. Native frame dimensions are subtracted before resizing the client area. Minimized and zero-sized geometry is ignored. Without an OS event, a display reconfiguration is reconciled on the next restore rather than continuously polled. When geometry is unavailable, restoration clamps the current position to the nearest connected monitor. Exact icon anchoring is not promised on Linux. Actual platform acceptance is recorded separately in `docs/f2-validation.md`.

The renderer may invoke only the minimal `hide_popup` command, granted to `main`. Native tray and lifecycle handling remains in the Rust host.

## Data and state

All snapshots are synthetic and visibly marked as demo, including in production builds. The root `source: "synthetic"` discriminant is mandatory even for an empty snapshot. Development can switch demo scenarios; release uses the healthy sample. `fetchedAt` and `dataStatus` describe sample freshness independently of connection state. Null quota/reset values mean unavailable; zero remains valid. Future live data requires a separately reviewed source contract with normalized fields and must never call the demo factory on failure. Appearance mode (`system`, `light`, or `dark`) and palette (Graphite & Jade or Zinc & Signal) remain independent, non-sensitive local preferences.

Unit suites are deferred from this foundation slice. Feature work should add the behavior-specific regression, integration, and security checks needed at its boundaries.

## Future provider boundary (design only)

These are boundaries for later design work, not F1 capabilities:

1. Any later discovery of external CLI auth state requires separate authorization and design; keep it read-only to the external CLI state and distinct from app-owned keychain storage and provider token refresh.
2. Any later Quotafern keychain integration is limited to entries written by Quotafern; it must not enumerate arbitrary keychain entries or treat another app's records as Quotafern credentials.
3. Provider token refresh belongs to an explicitly authorized app-owned provider flow, not automatic credential discovery.
4. Only sanitized quota snapshots should cross into the renderer. Raw credentials and provider secrets never belong in frontend state or logs.

F1 does not read, store, refresh, or transmit credentials.
