# Architecture

Quotafern keeps the desktop lifecycle in the Tauri host and the quota presentation in the Svelte frontend. F1 deliberately stops before provider integration.

## Responsibilities

| Area                    | Responsibility                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Svelte 5 and TypeScript | Render the popup, handle presentation state, and expose the UI-only quota snapshot seam in `src/lib/quota.ts`.                   |
| Rust and Tauri 2        | Own the native window, single-instance behavior, and tray lifecycle. The `main` window is the only window with app capabilities. |
| Local UI preferences    | Store only the appearance mode and palette in `localStorage`.                                                                    |

The TypeScript quota snapshot shape is a frontend contract, not a second Rust domain model or native source of quota truth. F1 has no snapshot IPC, provider client, account synchronization, or telemetry path.

## Window and tray lifecycle

The app opens one centered `main` popup at 380 × 660 so it is visible on first launch. It is resizable from 320 to 420 pixels wide, with a minimum height of 480 pixels. A window close request hides that window. The tray menu offers Show, Hide, and Quit; a second launch routes to the existing process/window. Show reuses the window's native position and does not anchor the popup to the tray icon. Linux users access the tray actions through its context menu because left-click tray events are unsupported there.

The renderer may invoke only the minimal `hide_popup` command, granted to `main`. Native tray and lifecycle handling remains in the Rust host.

## Data and state

All F1 quota snapshots are synthetic and visibly marked as demo, including in production builds. Development can switch demo scenarios; release uses the healthy sample. No provider integration exists, so mock data are not a fallback from unavailable live data. The selected appearance mode (`system`, `light`, or `dark`) and palette (Graphite & Jade or Zinc & Signal) are independent, non-sensitive local preferences.

Unit suites are deferred from this foundation slice. Feature work should add the behavior-specific regression, integration, and security checks needed at its boundaries.

## Future provider boundary (design only)

These are boundaries for later design work, not F1 capabilities:

1. Any later discovery of external CLI auth state requires separate authorization and design; keep it read-only to the external CLI state and distinct from app-owned keychain storage and provider token refresh.
2. Any later Quotafern keychain integration is limited to entries written by Quotafern; it must not enumerate arbitrary keychain entries or treat another app's records as Quotafern credentials.
3. Provider token refresh belongs to an explicitly authorized app-owned provider flow, not automatic credential discovery.
4. Only sanitized quota snapshots should cross into the renderer. Raw credentials and provider secrets never belong in frontend state or logs.

F1 does not read, store, refresh, or transmit credentials.
