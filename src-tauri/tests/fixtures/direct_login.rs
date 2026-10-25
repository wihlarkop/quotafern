//! Credential-free fake native login. Never contacts a provider or opens a browser.
fn main() {
    let args: Vec<_> = std::env::args().skip(1).collect();
    assert_eq!(args.last().map(String::as_str), Some("login"));
    assert!(args.iter().any(|arg| arg == "cli_auth_credentials_store=\"file\""));
    assert!(std::env::var_os("OPENAI_API_KEY").is_none());
    assert!(std::env::var_os("CODEX_API_KEY").is_none());
    let home = std::path::PathBuf::from(std::env::var_os("CODEX_HOME").unwrap());
    assert_eq!(std::env::current_dir().unwrap().canonicalize().unwrap(), home.canonicalize().unwrap());
    std::fs::write(home.join("fixture_started"), "isolated-file-login").unwrap();
    if home.join("fixture_hang").exists() {
        loop { std::thread::sleep(std::time::Duration::from_secs(1)); }
    }
}
