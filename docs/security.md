# Security boundaries

## F1 runtime

F1 has no provider integration. The app does not read credentials from environment variables, local CLI configuration, credential files, OS keychains, or other apps' credential stores. It does not otherwise access credentials, make provider HTTP requests, perform OAuth or token refresh, synchronize account data, or send telemetry.

F1 snapshots are synthetic and visibly labeled as demo in development and release builds alike. Development can switch demo scenarios; release uses the healthy sample. No provider integration exists, so mock values are not a fallback from missing or unavailable live data. Appearance mode and palette are the only F1 values persisted in `localStorage`.

## Tauri boundary

- Grant the `hide_popup` command permission only to the `main` window (`allow-hide-popup`). Keep capabilities scoped to that window.
- Keep the release Content Security Policy limited to bundled content and Tauri IPC. Development may additionally allow the Vite server at `127.0.0.1:1420` and its HMR WebSocket; do not carry those development allowances into release policy.
- Keep the native host responsible for window and tray lifecycle. Do not expose a generic shell, filesystem, or network command to the renderer.
- Keep secrets out of frontend state, local storage, logs, and error messages.

## Future provider boundary (design only)

Any future credential or provider work requires a separate design and implementation scope. The intended boundaries are:

- Discovery of external CLI auth state requires separate authorization and design. Keep it read-only to the external CLI state and distinct from Quotafern-owned keychain storage and provider token refresh.
- OS keychain support may handle only Quotafern-owned entries created through an explicit app flow; it must not enumerate arbitrary keychain entries or treat another app's records as Quotafern credentials.
- Token refresh applies only to an explicitly authorized, app-owned provider session.
- Provider responses must be reduced to sanitized quota snapshots before entering the renderer; never forward raw tokens, headers, or secret-bearing provider payloads.

These are design constraints only. F1 implements none of these flows and does not access credentials.
