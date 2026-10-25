fn main() {
    #[cfg(all(windows, feature = "native-regression"))]
    {
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'");
    }
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "hide_popup",
            "codex_connect",
            "codex_refresh",
            "codex_disconnect",
            "codex_status",
            "codex_direct_connect",
            "codex_direct_login",
            "codex_direct_refresh",
            "codex_direct_disconnect",
            "codex_direct_status",
        ]),
    ))
    .expect("failed to build Tauri application manifest");
}
