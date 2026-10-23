fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["hide_popup"])),
    )
    .expect("failed to build Tauri application manifest");
}
