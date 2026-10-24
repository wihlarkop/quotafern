fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "hide_popup",
            "codex_connect",
            "codex_refresh",
            "codex_disconnect",
            "codex_status",
        ]),
    ))
    .expect("failed to build Tauri application manifest");
}
