use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
#[cfg(windows)]
mod windows_security;
use crate::codex::process::{InputMode, OutputMode, SupervisedChild};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{Manager, Runtime, State, WebviewWindow};
#[cfg(not(test))]
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use zeroize::{Zeroize, Zeroizing};

// Separate from app-server. Enabling requires reviewed native/account acceptance.
const DIRECT_CONNECTION_ENABLED: bool = false;
const USAGE_URL: &str = "https://chatgpt.com/backend-api/wham/usage";
const MAX_BODY: usize = 256 * 1024;
const MAX_AUTH: usize = 128 * 1024;
const MAX_CONNECTIONS: usize = 32;
const COOLDOWN: Duration = Duration::from_secs(30);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(12);
const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum DirectKind {
    System,
    Managed,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DirectSnapshot {
    account_id: String,
    connection_id: String,
    generation: u64,
    connection_status: &'static str,
    data_status: &'static str,
    windows: Vec<DirectWindow>,
    plan: Option<&'static str>,
    credits: Option<DirectCredits>,
    fetched_at_ms: Option<u64>,
    diagnostic: Option<&'static str>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DirectWindow {
    id: String,
    name: String,
    remaining_percent: Option<f64>,
    reset_at_ms: Option<u64>,
    window_duration_mins: Option<f64>,
}
#[derive(Clone, Serialize)]
struct DirectCredits {
    balance: Option<String>,
    unlimited: Option<bool>,
}
impl DirectSnapshot {
    fn empty(account: &str, connection: &str, generation: u64) -> Self {
        Self {
            account_id: account.into(),
            connection_id: connection.into(),
            generation,
            connection_status: "disconnected",
            data_status: "unknown",
            windows: vec![],
            plan: None,
            credits: None,
            fetched_at_ms: None,
            diagnostic: None,
        }
    }
    fn fail(mut self, failure: Failure) -> Self {
        self.connection_status = failure.status();
        if matches!(
            failure,
            Failure::AuthRequired | Failure::IdentityChanged | Failure::UnsupportedAuth
        ) {
            self.windows.clear();
            self.plan = None;
            self.credits = None;
            self.fetched_at_ms = None;
        }
        self.data_status = if self.fetched_at_ms.is_some() {
            "stale"
        } else {
            "error"
        };
        self.diagnostic = Some(failure.diagnostic());
        self
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Failure {
    AuthRequired,
    UnsupportedAuth,
    UnsafePath,
    ReadFailed,
    InvalidAuth,
    IdentityChanged,
    Network,
    Timeout,
    RateLimited,
    Server,
    Redirect,
    ResponseTooLarge,
    Schema,
    Cancelled,
    LoginFailed,
}
impl Failure {
    fn diagnostic(self) -> &'static str {
        match self {
            Self::AuthRequired => "directAuthenticationRequired",
            Self::UnsupportedAuth => "directAuthUnsupported",
            Self::UnsafePath => "directAuthPathUnsafe",
            Self::ReadFailed => "directAuthReadFailed",
            Self::InvalidAuth => "directAuthInvalid",
            Self::IdentityChanged => "directIdentityChanged",
            Self::Network => "directNetworkFailed",
            Self::Timeout => "directRequestTimedOut",
            Self::RateLimited => "directRateLimited",
            Self::Server => "directServiceUnavailable",
            Self::Redirect => "directRedirectRefused",
            Self::ResponseTooLarge => "directResponseTooLarge",
            Self::Schema => "directSchemaIncompatible",
            Self::Cancelled => "directOperationCancelled",
            Self::LoginFailed => "directLoginFailed",
        }
    }
    fn status(self) -> &'static str {
        match self {
            Self::AuthRequired | Self::IdentityChanged => "auth-required",
            Self::UnsupportedAuth => "unsupported",
            Self::Schema => "incompatible",
            _ => "error",
        }
    }
}
struct Session {
    snapshot: DirectSnapshot,
    kind: DirectKind,
    home: Option<PathBuf>,
    identity: Option<Zeroizing<String>>,
    cancelled: Arc<AtomicBool>,
    busy: bool,
    login: Option<Arc<Mutex<SupervisedChild>>>,
}
#[derive(Default)]
struct Inner {
    shutting_down: bool,
    sessions: HashMap<String, Session>,
    generations: u64,
    cooldowns: HashMap<String, (Instant, u32)>,
}
#[derive(Clone, Default)]
pub(crate) struct DirectBridge(Arc<Mutex<Inner>>);
struct Operation {
    account: String,
    connection: String,
    generation: u64,
    kind: DirectKind,
    home: PathBuf,
    cancelled: Arc<AtomicBool>,
    previous_identity: Option<Zeroizing<String>>,
}
impl DirectBridge {
    fn attempt_current(&self, connection: &str, generation: u64) -> bool {
        self.0.lock().ok().is_some_and(|inner| {
            inner.sessions.get(connection).is_some_and(|session| {
                session.snapshot.generation == generation
                    && !session.cancelled.load(Ordering::SeqCst)
            })
        })
    }
    fn cancel_attempt(&self, account: &str, connection: &str, generation: u64) -> DirectSnapshot {
        let mut inner = self.0.lock().unwrap_or_else(|p| p.into_inner());
        if inner.sessions.get(connection).is_some_and(|session| {
            session.snapshot.generation == generation && session.snapshot.account_id == account
        }) {
            if let Some(session) = inner.sessions.remove(connection) {
                session.cancelled.store(true, Ordering::SeqCst);
            }
        }
        DirectSnapshot::empty(account, connection, generation)
    }
    fn reserve(&self, account: &str, connection: &str, kind: DirectKind) -> Result<u64, String> {
        valid_ids(account, connection)?;
        let mut inner = self.0.lock().map_err(|_| "directBridgeUnavailable")?;
        if inner.shutting_down {
            return Err("directBridgeShuttingDown".into());
        }
        if inner
            .sessions
            .get(connection)
            .is_some_and(|s| s.snapshot.account_id != account || s.kind != kind)
        {
            return Err("directConnectionBindingMismatch".into());
        }
        if kind == DirectKind::System
            && inner
                .sessions
                .iter()
                .any(|(id, session)| id != connection && session.kind == DirectKind::System)
        {
            return Err("directSystemAlreadyConnected".into());
        }
        if inner
            .sessions
            .iter()
            .any(|(id, session)| id != connection && session.snapshot.account_id == account)
        {
            return Err("directAccountAlreadyConnected".into());
        }
        if inner.cooldowns.len() >= 128 && !inner.cooldowns.contains_key(account) {
            return Err("directCooldownLimit".into());
        }
        if inner.sessions.get(connection).is_some_and(|s| s.busy) {
            return Err("directOperationInProgress".into());
        }
        if inner
            .cooldowns
            .get(account)
            .is_some_and(|(next, _)| Instant::now() < *next)
        {
            return Err("directRefreshCooldown".into());
        }
        if inner.sessions.len() >= MAX_CONNECTIONS && !inner.sessions.contains_key(connection) {
            return Err("directConnectionLimit".into());
        }
        if let Some(old) = inner.sessions.remove(connection) {
            old.cancelled.store(true, Ordering::SeqCst);
        }
        inner.generations = inner
            .generations
            .checked_add(1)
            .ok_or("directGenerationExhausted")?;
        let generation = inner.generations;
        inner.sessions.insert(
            connection.into(),
            Session {
                snapshot: DirectSnapshot::empty(account, connection, generation),
                kind,
                home: None,
                identity: None,
                cancelled: Arc::new(AtomicBool::new(false)),
                busy: true,
                login: None,
            },
        );
        Ok(generation)
    }
    fn authorize(
        &self,
        account: &str,
        connection: &str,
        generation: u64,
        home: PathBuf,
    ) -> Option<Operation> {
        let mut inner = self.0.lock().ok()?;
        let session = inner.sessions.get_mut(connection)?;
        if session.snapshot.account_id != account
            || session.snapshot.generation != generation
            || session.cancelled.load(Ordering::SeqCst)
        {
            return None;
        }
        session.home = Some(home.clone());
        Some(Operation {
            account: account.into(),
            connection: connection.into(),
            generation,
            kind: session.kind,
            home,
            cancelled: session.cancelled.clone(),
            previous_identity: session.identity.clone(),
        })
    }
    fn refresh_operation(&self, account: &str, connection: &str) -> Result<Operation, String> {
        valid_ids(account, connection)?;
        let mut inner = self.0.lock().map_err(|_| "directBridgeUnavailable")?;
        if inner.shutting_down {
            return Err("directBridgeShuttingDown".into());
        }
        if inner
            .cooldowns
            .get(account)
            .is_some_and(|(next, _)| Instant::now() < *next)
        {
            return Err("directRefreshCooldown".into());
        }
        let session = inner
            .sessions
            .get_mut(connection)
            .ok_or("directNotConnected")?;
        if session.snapshot.account_id != account {
            return Err("directConnectionBindingMismatch".into());
        }
        if session.busy {
            return Err("directOperationInProgress".into());
        }
        let home = session.home.clone().ok_or("directNativeConsentRequired")?;
        if session.cancelled.load(Ordering::SeqCst) {
            return Err("directNotConnected".into());
        }
        session.busy = true;
        let operation = Operation {
            account: account.into(),
            connection: connection.into(),
            generation: session.snapshot.generation,
            kind: session.kind,
            home,
            cancelled: session.cancelled.clone(),
            previous_identity: session.identity.clone(),
        };
        // Preserve failure history when reserving a refresh.
        let failures = inner.cooldowns.get(account).map_or(0, |(_, n)| *n);
        inner
            .cooldowns
            .insert(account.into(), (Instant::now() + COOLDOWN, failures));
        Ok(operation)
    }
    fn finish(
        &self,
        operation: &Operation,
        result: Result<(Value, Zeroizing<String>), Failure>,
    ) -> DirectSnapshot {
        let mut inner = self.0.lock().unwrap_or_else(|p| p.into_inner());
        let valid = inner.sessions.get(&operation.connection).is_some_and(|s| {
            s.snapshot.generation == operation.generation
                && s.snapshot.account_id == operation.account
                && !s.cancelled.load(Ordering::SeqCst)
        });
        if !valid {
            return DirectSnapshot::empty(
                &operation.account,
                &operation.connection,
                operation.generation,
            )
            .fail(Failure::Cancelled);
        }
        let session = inner
            .sessions
            .get_mut(&operation.connection)
            .expect("validated session");
        session.busy = false;
        session.login = None;
        let outcome = match result {
            Ok((value, identity)) => normalize(&value, session.snapshot.clone()).inspect(|_| {
                session.identity = Some(identity);
            }),
            Err(failure) => Err(failure),
        };
        let failure = outcome.as_ref().err().copied();
        session.snapshot = match outcome {
            Ok(snapshot) => snapshot,
            Err(failure) => session.snapshot.clone().fail(failure),
        };
        if matches!(
            failure,
            Some(Failure::IdentityChanged | Failure::AuthRequired)
        ) {
            session.home = None;
            session.identity = None;
            session.cancelled.store(true, Ordering::SeqCst);
        }
        let snapshot = session.snapshot.clone();
        let previous = inner
            .cooldowns
            .get(&operation.account)
            .map_or(0, |(_, n)| *n);
        let failures = if failure.is_some() {
            previous.saturating_add(1).min(4)
        } else {
            0
        };
        let delay = COOLDOWN
            .saturating_mul(1u32 << failures)
            .min(Duration::from_secs(300));
        inner.cooldowns.insert(
            operation.account.clone(),
            (Instant::now() + delay, failures),
        );
        snapshot
    }
    fn snapshot(&self, account: &str, connection: &str) -> Result<DirectSnapshot, String> {
        valid_ids(account, connection)?;
        let inner = self.0.lock().map_err(|_| "directBridgeUnavailable")?;
        if let Some(session) = inner.sessions.get(connection) {
            if session.snapshot.account_id != account {
                return Err("directConnectionBindingMismatch".into());
            }
            Ok(session.snapshot.clone())
        } else {
            Ok(DirectSnapshot::empty(
                account,
                connection,
                inner.generations,
            ))
        }
    }
    fn disconnect(&self, account: &str, connection: &str) -> Result<DirectSnapshot, String> {
        valid_ids(account, connection)?;
        let mut inner = self.0.lock().map_err(|_| "directBridgeUnavailable")?;
        if inner
            .sessions
            .get(connection)
            .is_some_and(|s| s.snapshot.account_id != account)
        {
            return Err("directConnectionBindingMismatch".into());
        }
        if let Some(session) = inner.sessions.get_mut(connection) {
            session.cancelled.store(true, Ordering::SeqCst);
            if let Some(child) = &session.login {
                child
                    .lock()
                    .map_err(|_| "directCleanupFailed")?
                    .terminate()
                    .map_err(|_| "directCleanupFailed")?;
            }
        }
        let old = inner.sessions.remove(connection);
        inner.generations = inner
            .generations
            .checked_add(1)
            .ok_or("directGenerationExhausted")?;
        let snapshot = DirectSnapshot::empty(account, connection, inner.generations);
        if let Some(session) = old {
            session.cancelled.store(true, Ordering::SeqCst);
        }
        // Deliberately retain the CLI-owned home and credentials. This is not logout.
        Ok(snapshot)
    }
    pub(crate) fn shutdown(&self) {
        let mut inner = self.0.lock().unwrap_or_else(|p| p.into_inner());
        inner.shutting_down = true;
        for (_, session) in inner.sessions.drain() {
            session.cancelled.store(true, Ordering::SeqCst);
            if let Some(child) = session.login {
                if let Ok(mut child) = child.lock() {
                    let _ = child.terminate();
                }
            }
        }
    }
}
fn valid_ids(account: &str, connection: &str) -> Result<(), String> {
    fn valid(value: &str, prefix: &str) -> bool {
        let Some(uuid) = value.strip_prefix(prefix) else {
            return false;
        };
        uuid.len() == 36
            && uuid.bytes().enumerate().all(|(i, b)| match i {
                8 | 13 | 18 | 23 => b == b'-',
                14 => b == b'4',
                19 => matches!(b, b'8' | b'9' | b'a' | b'b'),
                _ => b.is_ascii_digit() || (b'a'..=b'f').contains(&b),
            })
    }
    if valid(account, "account_") && valid(connection, "connection_") {
        Ok(())
    } else {
        Err("directInvalidLocalId".into())
    }
}
fn check_cancel(cancelled: &AtomicBool) -> Result<(), Failure> {
    if cancelled.load(Ordering::SeqCst) {
        Err(Failure::Cancelled)
    } else {
        Ok(())
    }
}
fn now_ms() -> Option<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|d| u64::try_from(d.as_millis()).ok())
}
#[derive(Deserialize)]
struct AuthFile {
    auth_mode: Option<String>,
    #[serde(rename = "OPENAI_API_KEY")]
    api_key: Option<String>,
    tokens: Option<AuthTokens>,
    agent_identity: Option<serde::de::IgnoredAny>,
    personal_access_token: Option<serde::de::IgnoredAny>,
    bedrock: Option<serde::de::IgnoredAny>,
    bedrock_api_key: Option<serde::de::IgnoredAny>,
    bedrock_access_keys: Option<serde::de::IgnoredAny>,
}
impl Drop for AuthFile {
    fn drop(&mut self) {
        self.api_key.zeroize();
        self.auth_mode.zeroize();
    }
}
#[derive(Deserialize)]
struct AuthTokens {
    access_token: String,
    account_id: String,
}
impl Drop for AuthTokens {
    fn drop(&mut self) {
        self.access_token.zeroize();
        self.account_id.zeroize();
    }
}
struct Credentials {
    token: Zeroizing<String>,
    identity: Zeroizing<String>,
}
fn parse_credentials(bytes: &[u8]) -> Result<Credentials, Failure> {
    let auth: AuthFile = serde_json::from_slice(bytes).map_err(|_| Failure::InvalidAuth)?;
    if auth.api_key.as_ref().is_some_and(|key| !key.is_empty())
        || auth
            .auth_mode
            .as_deref()
            .is_some_and(|mode| mode != "chatgpt")
        || auth.agent_identity.is_some()
        || auth.personal_access_token.is_some()
        || auth.bedrock.is_some()
        || auth.bedrock_api_key.is_some()
        || auth.bedrock_access_keys.is_some()
    {
        return Err(Failure::UnsupportedAuth);
    }
    let tokens = auth.tokens.as_ref().ok_or(Failure::AuthRequired)?;
    if !(16..=16384).contains(&tokens.access_token.len())
        || !tokens
            .access_token
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-._~+/=".contains(&b))
        || tokens.access_token.starts_with("sk-")
        || tokens.account_id.is_empty()
        || tokens.account_id.len() > 256
        || !tokens
            .account_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_:".contains(&b))
    {
        return Err(Failure::InvalidAuth);
    }
    Ok(Credentials {
        token: Zeroizing::new(tokens.access_token.clone()),
        identity: Zeroizing::new(tokens.account_id.clone()),
    })
}
fn reject_links(path: &Path) -> Result<(), Failure> {
    if !path.is_absolute() || path.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(Failure::UnsafePath);
    }
    for ancestor in path.ancestors() {
        let meta = fs::symlink_metadata(ancestor).map_err(|_| Failure::UnsafePath)?;
        if meta.file_type().is_symlink() {
            return Err(Failure::UnsafePath);
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if meta.file_attributes() & 0x400 != 0 {
                return Err(Failure::UnsafePath);
            }
        }
    }
    Ok(())
}
fn read_credentials(home: &Path, cancelled: &AtomicBool) -> Result<Credentials, Failure> {
    check_cancel(cancelled)?;
    reject_links(home)?;
    verify_home(home)?;
    require_file_store(home)?;
    let path = home.join("auth.json");
    if !path.exists() {
        return Err(Failure::AuthRequired);
    }
    reject_links(&path)?;
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x00200000);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW);
    }
    let file = options.open(&path).map_err(|_| Failure::ReadFailed)?;
    #[cfg(windows)]
    windows_security::verify_private(&file)?;
    let meta = file.metadata().map_err(|_| Failure::ReadFailed)?;
    if !meta.is_file() || meta.len() > MAX_AUTH as u64 {
        return Err(Failure::UnsafePath);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return Err(Failure::UnsafePath);
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if meta.uid() != unsafe { libc::geteuid() } || meta.mode() & 0o077 != 0 || meta.nlink() != 1
        {
            return Err(Failure::UnsafePath);
        }
    }
    let mut bytes = Zeroizing::new(Vec::new());
    file.take(MAX_AUTH as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| Failure::ReadFailed)?;
    if bytes.len() > MAX_AUTH {
        return Err(Failure::UnsafePath);
    }
    check_cancel(cancelled)?;
    parse_credentials(&bytes)
}
fn resolve_home<R: Runtime>(
    window: &WebviewWindow<R>,
    account: &str,
    kind: DirectKind,
) -> Result<PathBuf, Failure> {
    match kind {
        DirectKind::System => {
            let home = std::env::var_os("CODEX_HOME")
                .map(PathBuf::from)
                .or_else(|| std::env::home_dir().map(|p| p.join(".codex")))
                .ok_or(Failure::ReadFailed)?;
            reject_links(&home)?;
            Ok(home)
        }
        DirectKind::Managed => {
            let root = window
                .app_handle()
                .path()
                .app_local_data_dir()
                .map_err(|_| Failure::UnsafePath)?;
            create_private_tree(&root)?;
            reject_links(&root)?;
            let homes = root.join("codex-homes");
            secure_create(&homes)?;
            let home = homes.join(account);
            secure_create(&home)?;
            Ok(home)
        }
    }
}
fn verify_home(path: &Path) -> Result<(), Failure> {
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        let directory = OpenOptions::new()
            .read(true)
            .custom_flags(0x02200000)
            .open(path)
            .map_err(|_| Failure::UnsafePath)?;
        windows_security::verify_private(&directory)?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let metadata = fs::metadata(path).map_err(|_| Failure::UnsafePath)?;
        if metadata.uid() != unsafe { libc::geteuid() } || metadata.mode() & 0o022 != 0 {
            return Err(Failure::UnsafePath);
        }
    }
    Ok(())
}
fn create_private_tree(path: &Path) -> Result<(), Failure> {
    if path.exists() {
        reject_links(path)?;
        return verify_home(path);
    }
    let parent = path.parent().ok_or(Failure::UnsafePath)?;
    if !parent.exists() {
        create_private_tree(parent)?;
    }
    reject_links(parent)?;
    secure_create(path)
}
fn secure_create(path: &Path) -> Result<(), Failure> {
    if !path.exists() {
        #[cfg(windows)]
        windows_security::create_private_directory(path)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            fs::DirBuilder::new()
                .mode(0o700)
                .create(path)
                .map_err(|_| Failure::UnsafePath)?;
        }
    }
    reject_links(path)?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        let directory = OpenOptions::new()
            .read(true)
            .custom_flags(0x02200000)
            .open(path)
            .map_err(|_| Failure::UnsafePath)?;
        windows_security::verify_private(&directory)?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let meta = fs::metadata(path).map_err(|_| Failure::UnsafePath)?;
        if meta.uid() != unsafe { libc::geteuid() } || meta.mode() & 0o077 != 0 {
            return Err(Failure::UnsafePath);
        }
    }
    Ok(())
}
fn http_client() -> Result<reqwest::Client, Failure> {
    reqwest::Client::builder()
        .https_only(true)
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|_| Failure::Network)
}
async fn fetch_usage(
    client: &reqwest::Client,
    credentials: &Credentials,
    cancelled: &AtomicBool,
) -> Result<Value, Failure> {
    fetch_request(client.get(USAGE_URL), credentials, cancelled).await
}
#[cfg(test)]
async fn fetch_at(
    client: &reqwest::Client,
    url: &str,
    credentials: &Credentials,
    cancelled: &AtomicBool,
) -> Result<Value, Failure> {
    fetch_request(client.get(url), credentials, cancelled).await
}
async fn fetch_request(
    request: reqwest::RequestBuilder,
    credentials: &Credentials,
    cancelled: &AtomicBool,
) -> Result<Value, Failure> {
    check_cancel(cancelled)?;
    let request = async {
        let mut authorization = reqwest::header::HeaderValue::from_str(&format!(
            "Bearer {}",
            credentials.token.as_str()
        ))
        .map_err(|_| Failure::InvalidAuth)?;
        authorization.set_sensitive(true);
        let mut identity = reqwest::header::HeaderValue::from_str(credentials.identity.as_str())
            .map_err(|_| Failure::InvalidAuth)?;
        identity.set_sensitive(true);
        let mut response = request
            .header(reqwest::header::AUTHORIZATION, authorization)
            .header("ChatGPT-Account-Id", identity)
            .header(reqwest::header::ACCEPT, "application/json")
            .send()
            .await
            .map_err(|error| {
                if error.is_timeout() {
                    Failure::Timeout
                } else {
                    Failure::Network
                }
            })?;
        match response.status().as_u16() {
            200 => {}
            401 | 403 => return Err(Failure::AuthRequired),
            429 => return Err(Failure::RateLimited),
            300..=399 => return Err(Failure::Redirect),
            500..=599 => return Err(Failure::Server),
            _ => return Err(Failure::Schema),
        }
        if response
            .content_length()
            .is_some_and(|size| size > MAX_BODY as u64)
        {
            return Err(Failure::ResponseTooLarge);
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|error| {
            if error.is_timeout() {
                Failure::Timeout
            } else {
                Failure::Network
            }
        })? {
            if bytes.len().saturating_add(chunk.len()) > MAX_BODY {
                return Err(Failure::ResponseTooLarge);
            }
            bytes.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&bytes).map_err(|_| Failure::Schema)
    };
    tokio::pin!(request);
    loop {
        tokio::select! {
            result = &mut request => { check_cancel(cancelled)?; return result; },
            _ = tokio::time::sleep(Duration::from_millis(25)) => { check_cancel(cancelled)?; }
        }
    }
}
fn validate_response_identity(value: &Value, identity: &str) -> Result<(), Failure> {
    if let Some(value) = value.get("account_id").filter(|v| !v.is_null()) {
        let response_identity = value.as_str().ok_or(Failure::Schema)?;
        if response_identity != identity {
            return Err(Failure::IdentityChanged);
        }
    }
    Ok(())
}
async fn execute(
    bridge: &DirectBridge,
    operation: &Operation,
) -> Result<(Value, Zeroizing<String>), Failure> {
    let credentials = read_credentials(&operation.home, &operation.cancelled)?;
    if operation
        .previous_identity
        .as_ref()
        .is_some_and(|identity| identity.as_str() != credentials.identity.as_str())
    {
        return Err(Failure::IdentityChanged);
    }
    {
        let mut inner = bridge.0.lock().map_err(|_| Failure::Cancelled)?;
        let session = inner
            .sessions
            .get_mut(&operation.connection)
            .ok_or(Failure::Cancelled)?;
        if session.snapshot.generation != operation.generation {
            return Err(Failure::Cancelled);
        }
        check_cancel(&operation.cancelled)?;
        if session
            .identity
            .as_ref()
            .is_some_and(|old| old.as_str() != credentials.identity.as_str())
        {
            return Err(Failure::IdentityChanged);
        }
        if session.identity.is_none() {
            session.identity = Some(credentials.identity.clone());
        }
    }
    let value = fetch_usage(&http_client()?, &credentials, &operation.cancelled).await?;
    validate_response_identity(&value, &credentials.identity)?;
    // A CLI rotation during the request must not relabel an older response.
    let current = read_credentials(&operation.home, &operation.cancelled)?;
    if current.identity.as_str() != credentials.identity.as_str() {
        return Err(Failure::IdentityChanged);
    }
    Ok((value, credentials.identity))
}
fn normalize(value: &Value, mut snapshot: DirectSnapshot) -> Result<DirectSnapshot, Failure> {
    if !value.is_object() {
        return Err(Failure::Schema);
    }
    snapshot.windows.clear();
    snapshot.plan = match value.get("plan_type").and_then(Value::as_str) {
        Some("free") => Some("Free"),
        Some("go") => Some("Go"),
        Some("plus") => Some("Plus"),
        Some("pro") => Some("Pro"),
        _ => None,
    };
    let mut malformed = false;
    if let Some(rate) = value.get("rate_limit").filter(|v| !v.is_null()) {
        append_windows(rate, "main", "", &mut snapshot.windows, &mut malformed)?;
    }
    if let Some(extra) = value.get("additional_rate_limits").filter(|v| !v.is_null()) {
        let extra = extra.as_array().ok_or(Failure::Schema)?;
        if extra.len() > 15 {
            return Err(Failure::Schema);
        }
        for (index, bucket) in extra.iter().enumerate() {
            let rate = bucket.get("rate_limit").ok_or(Failure::Schema)?;
            // Provider-controlled identifiers and strings never cross IPC.
            append_windows(
                rate,
                &format!("extra{}", index + 1),
                &format!("Additional {} ", index + 1),
                &mut snapshot.windows,
                &mut malformed,
            )?;
        }
    }
    if snapshot.windows.len() > 16 {
        return Err(Failure::Schema);
    }
    snapshot.credits = match value.get("credits").filter(|v| !v.is_null()) {
        None => None,
        Some(credits) => {
            if !credits.is_object() {
                malformed = true;
                None
            } else {
                let balance = credits.get("balance").and_then(|value| {
                    let text = match value {
                        Value::String(text) => text.clone(),
                        Value::Number(number) => number.to_string(),
                        _ => return None,
                    };
                    canonical_decimal(&text).then_some(text)
                });
                if credits.get("balance").is_some_and(|v| !v.is_null()) && balance.is_none() {
                    malformed = true;
                }
                Some(DirectCredits {
                    balance,
                    unlimited: credits.get("unlimited").and_then(Value::as_bool),
                })
            }
        }
    };
    snapshot.connection_status = "connected";
    snapshot.data_status = if snapshot
        .windows
        .iter()
        .any(|w| w.remaining_percent.is_some())
    {
        "current"
    } else {
        "unknown"
    };
    snapshot.fetched_at_ms = now_ms();
    snapshot.diagnostic = if malformed {
        Some("directInvalidQuotaValue")
    } else if snapshot.windows.is_empty() {
        Some("directQuotaUnavailable")
    } else {
        None
    };
    Ok(snapshot)
}
fn canonical_decimal(value: &str) -> bool {
    let mut parts = value.split('.');
    let integer = parts.next().unwrap_or("");
    let fraction = parts.next();
    parts.next().is_none()
        && !integer.is_empty()
        && integer.len() <= 30
        && integer.bytes().all(|b| b.is_ascii_digit())
        && (integer == "0" || !integer.starts_with('0'))
        && fraction.is_none_or(|fraction| {
            !fraction.is_empty()
                && fraction.len() <= 12
                && fraction.bytes().all(|b| b.is_ascii_digit())
        })
}
fn append_windows(
    rate: &Value,
    id: &str,
    label: &str,
    windows: &mut Vec<DirectWindow>,
    malformed: &mut bool,
) -> Result<(), Failure> {
    if !rate.is_object() {
        return Err(Failure::Schema);
    }
    for (key, name) in [
        ("primary_window", "Primary"),
        ("secondary_window", "Secondary"),
    ] {
        let Some(window) = rate.get(key).filter(|w| !w.is_null()) else {
            continue;
        };
        if !window.is_object() {
            return Err(Failure::Schema);
        }
        let used = window
            .get("used_percent")
            .and_then(Value::as_f64)
            .filter(|v| v.is_finite() && (0.0..=100.0).contains(v));
        if window.get("used_percent").is_some_and(|v| !v.is_null()) && used.is_none() {
            *malformed = true;
        }
        let duration = window
            .get("limit_window_seconds")
            .and_then(Value::as_f64)
            .filter(|v| v.is_finite() && *v > 0.0 && *v <= 315_360_000.0)
            .map(|v| v / 60.0);
        let reset = window
            .get("reset_at")
            .and_then(Value::as_u64)
            .and_then(|s| s.checked_mul(1000))
            .filter(|v| *v <= 8_640_000_000_000_000);
        let name = match duration {
            Some(300.0) => "Session",
            Some(10080.0) => "Weekly",
            _ => name,
        };
        windows.push(DirectWindow {
            id: format!("{id}-{key}"),
            name: format!("{label}{name}"),
            remaining_percent: used.map(|v| 100.0 - v),
            reset_at_ms: reset,
            window_duration_mins: duration,
        });
    }
    Ok(())
}
fn main_only<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("directMainWindowOnly".into())
    }
}
#[cfg(not(test))]
fn native_consent<R: Runtime>(window: &WebviewWindow<R>, login: bool, kind: DirectKind) -> bool {
    let message = if login {
        "Start ordinary Codex CLI browser sign-in in this account's isolated Quotafern home? Codex owns sign-in and may write its authentication state. Quotafern will read the resulting ChatGPT access token and account identifier only after approval, then send them directly to chatgpt.com/backend-api/wham/usage for read-only quota monitoring. No inference or token renewal is performed by Quotafern. While connected, quota is refreshed manually and automatically every five minutes; disconnecting or quitting ends consent. Disconnecting or removing the local account leaves CLI credentials on disk."
    } else {
        "Allow Quotafern to read this selected Codex home's auth.json access token and account identifier, then send them directly to chatgpt.com/backend-api/wham/usage for read-only quota monitoring? This unofficial endpoint may change. No inference or token renewal is performed. Consent lasts only for this session. While connected, quota is refreshed manually and automatically every five minutes; disconnecting or quitting ends consent. Disconnecting leaves CLI credentials on disk."
    };
    let source = match kind {
        DirectKind::System => "System Codex profile",
        DirectKind::Managed => "Dedicated Quotafern account",
    };
    window
        .dialog()
        .message(message)
        .title(format!("{source}: read-only quota monitoring"))
        .buttons(MessageDialogButtons::OkCancelCustom(
            if login {
                "Sign in and connect"
            } else {
                "Connect"
            }
            .into(),
            "Cancel".into(),
        ))
        .blocking_show()
}
#[cfg(test)]
fn native_consent<R: Runtime>(_window: &WebviewWindow<R>, _login: bool, _kind: DirectKind) -> bool {
    panic!("native dialog must not run in tests")
}
async fn connect<R: Runtime>(
    window: WebviewWindow<R>,
    bridge: DirectBridge,
    account: String,
    connection: String,
    kind: DirectKind,
    login: bool,
) -> Result<DirectSnapshot, String> {
    main_only(&window)?;
    valid_ids(&account, &connection)?;
    if login && kind != DirectKind::Managed {
        return Err("directLoginManagedOnly".into());
    }
    if !DIRECT_CONNECTION_ENABLED {
        let mut snapshot = bridge.snapshot(&account, &connection)?;
        snapshot.connection_status = "unavailable";
        snapshot.diagnostic = Some("directOwnerAcceptancePending");
        return Ok(snapshot);
    }
    let generation = bridge.reserve(&account, &connection, kind)?;
    let window_for_dialog = window.clone();
    let approved = tauri::async_runtime::spawn_blocking(move || {
        native_consent(&window_for_dialog, login, kind)
    })
    .await
    .map_err(|_| "directConsentUnavailable")?;
    if !bridge.attempt_current(&connection, generation) {
        return Ok(
            DirectSnapshot::empty(&account, &connection, generation).fail(Failure::Cancelled)
        );
    }
    if !approved {
        return Ok(bridge.cancel_attempt(&account, &connection, generation));
    }
    let home = match resolve_home(&window, &account, kind) {
        Ok(home) => home,
        Err(failure) => {
            let mut snapshot = bridge.cancel_attempt(&account, &connection, generation);
            snapshot = snapshot.fail(failure);
            return Ok(snapshot);
        }
    };
    let Some(operation) = bridge.authorize(&account, &connection, generation, home) else {
        return Ok(
            DirectSnapshot::empty(&account, &connection, generation).fail(Failure::Cancelled)
        );
    };
    if login {
        let login_bridge = bridge.clone();
        let login_operation = Operation {
            account: operation.account.clone(),
            connection: operation.connection.clone(),
            generation,
            kind,
            home: operation.home.clone(),
            cancelled: operation.cancelled.clone(),
            previous_identity: None,
        };
        let result = tauri::async_runtime::spawn_blocking(move || {
            run_login(&login_bridge, &login_operation)
        })
        .await
        .map_err(|_| "directLoginUnavailable")?;
        if let Err(failure) = result {
            return Ok(bridge.finish(&operation, Err(failure)));
        }
    }
    Ok(bridge.finish(&operation, execute(&bridge, &operation).await))
}
fn run_login(bridge: &DirectBridge, operation: &Operation) -> Result<(), Failure> {
    if operation.kind != DirectKind::Managed {
        return Err(Failure::UnsupportedAuth);
    }
    check_cancel(&operation.cancelled)?;
    let executable = crate::codex::direct_login_executable().ok_or(Failure::LoginFailed)?;
    run_login_with_executable(bridge, operation, &executable)
}
fn run_login_with_executable(
    bridge: &DirectBridge,
    operation: &Operation,
    executable: &Path,
) -> Result<(), Failure> {
    check_cancel(&operation.cancelled)?;
    let mut environment = Vec::new();
    for key in [
        "PATH",
        "SystemRoot",
        "WINDIR",
        "TEMP",
        "TMP",
        "USERPROFILE",
        "HOME",
        "APPDATA",
        "LOCALAPPDATA",
        "DISPLAY",
        "WAYLAND_DISPLAY",
        "XDG_RUNTIME_DIR",
        "DBUS_SESSION_BUS_ADDRESS",
    ] {
        if let Some(value) = std::env::var_os(key) {
            environment.push((key.into(), value));
        }
    }
    environment.push(("CODEX_HOME".into(), operation.home.clone().into_os_string()));
    let args = [
        "--config",
        "cli_auth_credentials_store=\"file\"",
        "--config",
        "analytics.enabled=false",
        "--config",
        "feedback.enabled=false",
        "--config",
        "otel.exporter=\"none\"",
        "--config",
        "otel.trace_exporter=\"none\"",
        "--config",
        "otel.metrics_exporter=\"none\"",
        "--config",
        "features.hooks=false",
        "--config",
        "features.apps=false",
        "--config",
        "features.plugins=false",
        "--config",
        "features.remote_plugin=false",
        "--config",
        "check_for_update_on_startup=false",
        "login",
    ];
    let child = {
        let mut inner = bridge.0.lock().map_err(|_| Failure::Cancelled)?;
        let session = inner
            .sessions
            .get_mut(&operation.connection)
            .ok_or(Failure::Cancelled)?;
        if session.snapshot.generation != operation.generation {
            return Err(Failure::Cancelled);
        }
        check_cancel(&operation.cancelled)?;
        let child = Arc::new(Mutex::new(
            SupervisedChild::spawn_with_environment(
                executable,
                &args,
                InputMode::Null,
                OutputMode::Null,
                Some(&environment),
                Some(&operation.home),
            )
            .map_err(|_| Failure::LoginFailed)?,
        ));
        session.login = Some(child.clone());
        child
    };
    let started = Instant::now();
    loop {
        if check_cancel(&operation.cancelled).is_err() || started.elapsed() >= LOGIN_TIMEOUT {
            if let Ok(mut child) = child.lock() {
                let _ = child.terminate();
            }
            return Err(if operation.cancelled.load(Ordering::SeqCst) {
                Failure::Cancelled
            } else {
                Failure::Timeout
            });
        }
        let result = child
            .lock()
            .map_err(|_| Failure::LoginFailed)?
            .try_wait()
            .map_err(|_| Failure::LoginFailed)?;
        if let Some(status) = result {
            return if status.success() {
                Ok(())
            } else {
                Err(Failure::LoginFailed)
            };
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}
#[tauri::command]
pub(crate) async fn codex_direct_connect<R: Runtime>(
    window: WebviewWindow<R>,
    bridge: State<'_, DirectBridge>,
    account_id: String,
    connection_id: String,
    kind: DirectKind,
) -> Result<DirectSnapshot, String> {
    connect(
        window,
        bridge.inner().clone(),
        account_id,
        connection_id,
        kind,
        false,
    )
    .await
}
#[tauri::command]
pub(crate) async fn codex_direct_login<R: Runtime>(
    window: WebviewWindow<R>,
    bridge: State<'_, DirectBridge>,
    account_id: String,
    connection_id: String,
    kind: DirectKind,
) -> Result<DirectSnapshot, String> {
    connect(
        window,
        bridge.inner().clone(),
        account_id,
        connection_id,
        kind,
        true,
    )
    .await
}
#[tauri::command]
pub(crate) async fn codex_direct_refresh<R: Runtime>(
    window: WebviewWindow<R>,
    bridge: State<'_, DirectBridge>,
    account_id: String,
    connection_id: String,
) -> Result<DirectSnapshot, String> {
    main_only(&window)?;
    if !DIRECT_CONNECTION_ENABLED {
        return Err("directOwnerAcceptancePending".into());
    }
    let operation = bridge.refresh_operation(&account_id, &connection_id)?;
    Ok(bridge.finish(&operation, execute(&bridge, &operation).await))
}
#[tauri::command]
pub(crate) fn codex_direct_disconnect<R: Runtime>(
    window: WebviewWindow<R>,
    bridge: State<'_, DirectBridge>,
    account_id: String,
    connection_id: String,
) -> Result<DirectSnapshot, String> {
    main_only(&window)?;
    bridge.disconnect(&account_id, &connection_id)
}
#[tauri::command]
pub(crate) fn codex_direct_status<R: Runtime>(
    window: WebviewWindow<R>,
    bridge: State<'_, DirectBridge>,
    account_id: String,
    connection_id: String,
) -> Result<DirectSnapshot, String> {
    main_only(&window)?;
    bridge.snapshot(&account_id, &connection_id)
}
// Only this home's bounded top-level config is inspected. We deliberately do
// not reproduce Codex's layered config resolver or access OS keyrings.
fn require_file_store(home: &Path) -> Result<(), Failure> {
    let path = home.join("config.toml");
    if !path.exists() {
        return Ok(());
    } // Codex's packaged default is file.
    reject_links(&path)?;
    let meta = fs::metadata(&path).map_err(|_| Failure::ReadFailed)?;
    if !meta.is_file() || meta.len() > MAX_AUTH as u64 {
        return Err(Failure::UnsafePath);
    }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x00200000);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW);
    }
    let file = options.open(path).map_err(|_| Failure::ReadFailed)?;
    let mut text = Zeroizing::new(String::new());
    file.take(MAX_AUTH as u64 + 1)
        .read_to_string(&mut text)
        .map_err(|_| Failure::ReadFailed)?;
    if text.len() > MAX_AUTH {
        return Err(Failure::UnsafePath);
    }
    #[derive(Deserialize)]
    struct Config {
        cli_auth_credentials_store: Option<String>,
        profiles: Option<HashMap<String, Profile>>,
    }
    #[derive(Deserialize)]
    struct Profile {
        cli_auth_credentials_store: Option<String>,
    }
    let config: Config = toml::from_str(&text).map_err(|_| Failure::UnsupportedAuth)?;
    if config
        .cli_auth_credentials_store
        .as_deref()
        .is_some_and(|mode| mode != "file")
        || config.profiles.is_some_and(|profiles| {
            profiles.values().any(|profile| {
                profile
                    .cli_auth_credentials_store
                    .as_deref()
                    .is_some_and(|mode| mode != "file")
            })
        })
    {
        return Err(Failure::UnsupportedAuth);
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc;
    const ACCOUNT: &str = "account_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const CONNECTION: &str = "connection_bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb";
    const OTHER_ACCOUNT: &str = "account_cccccccc-cccc-4ccc-accc-cccccccccccc";
    const OTHER_CONNECTION: &str = "connection_dddddddd-dddd-4ddd-bddd-dddddddddddd";
    fn snapshot() -> DirectSnapshot {
        DirectSnapshot::empty(ACCOUNT, CONNECTION, 1)
    }
    fn creds() -> Credentials {
        parse_credentials(br#"{"tokens":{"access_token":"synthetic-access-token-only","account_id":"synthetic-account"}}"#).unwrap()
    }
    fn fixture(used: f64) -> Value {
        json!({"plan_type":"plus","rate_limit":{"primary_window":{"used_percent":used,"reset_at":1800000000_u64,"limit_window_seconds":18000},"secondary_window":{"used_percent":100,"limit_window_seconds":604800}},"credits":{"balance":"0.0","unlimited":false}})
    }
    fn server(
        status: u16,
        headers: &str,
        body: Vec<u8>,
        delay: Duration,
    ) -> (String, mpsc::Receiver<String>, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let url = format!("http://{}/usage", listener.local_addr().unwrap());
        let headers = headers.to_owned();
        let (tx, rx) = mpsc::channel();
        let thread = std::thread::spawn(move || {
            let accept_deadline = Instant::now() + Duration::from_secs(5);
            let mut stream = loop {
                match listener.accept() {
                    Ok((stream, _)) => break stream,
                    Err(error)
                        if error.kind() == std::io::ErrorKind::WouldBlock
                            && Instant::now() < accept_deadline =>
                    {
                        std::thread::sleep(Duration::from_millis(2));
                    }
                    _ => return,
                }
            };
            stream.set_nonblocking(false).unwrap();
            stream
                .set_write_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let read_deadline = Instant::now() + Duration::from_secs(2);
            let mut bytes = Vec::new();
            let mut chunk = [0; 1024];
            while bytes.len() < 32768 {
                let Some(remaining) = read_deadline.checked_duration_since(Instant::now()) else {
                    return;
                };
                stream.set_read_timeout(Some(remaining)).unwrap();
                let n = stream.read(&mut chunk).unwrap_or(0);
                if n == 0 {
                    break;
                }
                bytes.extend_from_slice(&chunk[..n]);
                if bytes.windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }
            let _ = tx.send(String::from_utf8_lossy(&bytes).to_string());
            std::thread::sleep(delay);
            let response = format!("HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n{headers}\r\n", body.len());
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.write_all(&body);
        });
        (url, rx, thread)
    }
    fn local_client(timeout: Duration) -> reqwest::Client {
        reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(timeout)
            .build()
            .unwrap()
    }
    #[test]
    fn strict_ids_refuse_paths_wrong_versions_and_case() {
        assert!(valid_ids(ACCOUNT, CONNECTION).is_ok());
        for bad in [
            "../../auth.json",
            "account_aaaaaaaa-aaaa-1aaa-8aaa-aaaaaaaaaaaa",
            "account_AAAAAAAA-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            "account_aaaaaaaa-aaaa-4aaa-7aaa-aaaaaaaaaaaa",
        ] {
            assert!(valid_ids(bad, CONNECTION).is_err());
        }
    }
    #[test]
    fn plans_zeroes_missing_extra_windows_and_credits() {
        for (raw, plan) in [
            ("free", "Free"),
            ("go", "Go"),
            ("plus", "Plus"),
            ("pro", "Pro"),
        ] {
            let mut value = fixture(0.0);
            value["plan_type"] = json!(raw);
            let result = normalize(&value, snapshot()).unwrap();
            assert_eq!(result.plan, Some(plan));
            assert_eq!(result.windows[0].remaining_percent, Some(100.0));
            assert_eq!(result.windows[1].remaining_percent, Some(0.0));
            assert_eq!(result.windows[0].name, "Session");
            assert_eq!(result.windows[1].name, "Weekly");
            assert_eq!(result.windows[0].reset_at_ms, Some(1800000000000));
            assert_eq!(result.windows[1].reset_at_ms, None);
            assert_eq!(result.credits.unwrap().balance.as_deref(), Some("0.0"));
        }
        let mut value = fixture(20.0);
        value["additional_rate_limits"] = json!([{"limit_name":"untrusted-user-string","rate_limit":{"primary_window":{"used_percent":55,"limit_window_seconds":3600}}}]);
        let result = normalize(&value, snapshot()).unwrap();
        assert_eq!(result.windows.len(), 3);
        assert_eq!(result.windows[2].name, "Additional 1 Primary");
        assert_eq!(result.windows[2].remaining_percent, Some(45.0));
        let empty = normalize(&json!({}), snapshot()).unwrap();
        assert_eq!(empty.data_status, "unknown");
        assert!(empty.windows.is_empty());
        assert!(empty.credits.is_none());
    }
    #[test]
    fn malformed_values_never_become_zero_or_expose_provider_strings() {
        let value = json!({"plan_type":"enterprise-secret","rate_limit":{"primary_window":{"used_percent":-1,"reset_at":"tomorrow","limit_window_seconds":-2}},"credits":{"balance":"token-secret","unlimited":true}});
        let result = normalize(&value, snapshot()).unwrap();
        assert_eq!(result.plan, None);
        assert_eq!(result.windows[0].remaining_percent, None);
        assert_eq!(result.windows[0].reset_at_ms, None);
        assert_eq!(result.windows[0].window_duration_mins, None);
        let serialized = serde_json::to_string(&result).unwrap();
        assert!(!serialized.contains("secret"));
        assert_eq!(result.data_status, "unknown");
        assert_eq!(result.credits.unwrap().unlimited, Some(true));
        assert!(matches!(
            normalize(&json!({"rate_limit":[]}), snapshot()),
            Err(Failure::Schema)
        ));
        assert!(matches!(
            normalize(&json!({"additional_rate_limits":[{}]}), snapshot()),
            Err(Failure::Schema)
        ));
    }
    #[test]
    fn credentials_reject_keys_modes_conflicting_material_and_header_injection() {
        assert_eq!(creds().identity.as_str(), "synthetic-account");
        for field in [
            "OPENAI_API_KEY",
            "agent_identity",
            "personal_access_token",
            "bedrock",
            "bedrock_api_key",
            "bedrock_access_keys",
        ] {
            let mut value =
                json!({"tokens":{"access_token":"synthetic-token-only","account_id":"synthetic"}});
            value[field] = json!("synthetic-secret");
            assert!(matches!(
                parse_credentials(&serde_json::to_vec(&value).unwrap()),
                Err(Failure::UnsupportedAuth)
            ));
        }
        for value in [
            json!({"auth_mode":"apikey","tokens":{"access_token":"synthetic-token-only","account_id":"synthetic"}}),
            json!({"tokens":{"access_token":"secret\r\nheader","account_id":"synthetic"}}),
            json!({"tokens":{"access_token":"synthetic-token-only","account_id":"bad\nidentity"}}),
        ] {
            assert!(parse_credentials(&serde_json::to_vec(&value).unwrap()).is_err());
        }
        assert!(matches!(
            parse_credentials(b"{}"),
            Err(Failure::AuthRequired)
        ));
    }
    #[test]
    fn response_identity_mismatch_and_malformed_identity_fail_closed() {
        assert!(
            validate_response_identity(&json!({"account_id":"synthetic"}), "synthetic").is_ok()
        );
        assert_eq!(
            validate_response_identity(&json!({"account_id":"other"}), "synthetic"),
            Err(Failure::IdentityChanged)
        );
        assert_eq!(
            validate_response_identity(&json!({"account_id":44}), "synthetic"),
            Err(Failure::Schema)
        );
    }
    #[test]
    fn per_account_isolation_cooldown_identity_and_late_results() {
        let bridge = DirectBridge::default();
        let generation = bridge
            .reserve(ACCOUNT, CONNECTION, DirectKind::Managed)
            .unwrap();
        assert!(bridge
            .reserve(ACCOUNT, OTHER_CONNECTION, DirectKind::Managed)
            .is_err());
        let operation = bridge
            .authorize(
                ACCOUNT,
                CONNECTION,
                generation,
                PathBuf::from("trusted-test-home"),
            )
            .unwrap();
        let other_generation = bridge
            .reserve(OTHER_ACCOUNT, OTHER_CONNECTION, DirectKind::Managed)
            .unwrap();
        let other = bridge
            .authorize(
                OTHER_ACCOUNT,
                OTHER_CONNECTION,
                other_generation,
                PathBuf::from("other-trusted-home"),
            )
            .unwrap();
        let first = bridge.finish(
            &operation,
            Ok((
                fixture(20.0),
                Zeroizing::new("private-native-identity".into()),
            )),
        );
        assert_eq!(first.windows[0].remaining_percent, Some(80.0));
        assert!(bridge.refresh_operation(ACCOUNT, CONNECTION).is_err());
        bridge.finish(
            &other,
            Ok((
                fixture(80.0),
                Zeroizing::new("other-private-identity".into()),
            )),
        );
        assert_eq!(
            bridge
                .snapshot(OTHER_ACCOUNT, OTHER_CONNECTION)
                .unwrap()
                .windows[0]
                .remaining_percent,
            Some(20.0)
        );
        assert!(bridge.snapshot(OTHER_ACCOUNT, CONNECTION).is_err());
        let serialized = serde_json::to_string(&first).unwrap();
        assert!(!serialized.contains("private-native-identity"));
        bridge.disconnect(ACCOUNT, CONNECTION).unwrap();
        let late = bridge.finish(
            &operation,
            Ok((
                fixture(1.0),
                Zeroizing::new("private-native-identity".into()),
            )),
        );
        assert_eq!(late.diagnostic, Some("directOperationCancelled"));
        assert!(late.windows.is_empty());
        assert!(bridge
            .snapshot(ACCOUNT, CONNECTION)
            .unwrap()
            .windows
            .is_empty());
        assert_eq!(
            bridge
                .snapshot(OTHER_ACCOUNT, OTHER_CONNECTION)
                .unwrap()
                .connection_status,
            "connected"
        );
    }
    #[test]
    fn errors_preserve_only_sanitized_stale_data_and_auth_clears_identity() {
        let current = normalize(&fixture(35.0), snapshot()).unwrap();
        let stale = current.clone().fail(Failure::Server);
        assert_eq!(stale.data_status, "stale");
        assert_eq!(stale.windows[0].remaining_percent, Some(65.0));
        let invalid = current.fail(Failure::IdentityChanged);
        assert!(invalid.windows.is_empty());
        assert!(invalid.credits.is_none());
        assert_eq!(invalid.connection_status, "auth-required");
    }
    #[tokio::test(flavor = "current_thread")]
    async fn http_success_headers_and_response_are_bounded_and_scoped() {
        let (url, request, thread) = server(
            200,
            "Content-Type: application/json\r\n",
            serde_json::to_vec(&fixture(12.0)).unwrap(),
            Duration::ZERO,
        );
        let value = fetch_at(
            &local_client(Duration::from_secs(2)),
            &url,
            &creds(),
            &AtomicBool::new(false),
        )
        .await
        .unwrap();
        assert_eq!(value["plan_type"], "plus");
        let request = request.recv().unwrap().to_ascii_lowercase();
        assert!(request.contains("authorization: bearer synthetic-access-token-only"));
        assert!(request.contains("chatgpt-account-id: synthetic-account"));
        thread.join().unwrap();
    }
    #[tokio::test(flavor = "current_thread")]
    async fn http_statuses_redirects_schema_and_oversized_bodies_are_sanitized() {
        for (status, expected) in [
            (401, Failure::AuthRequired),
            (403, Failure::AuthRequired),
            (429, Failure::RateLimited),
            (500, Failure::Server),
            (302, Failure::Redirect),
            (404, Failure::Schema),
        ] {
            let (url, _, thread) = server(
                status,
                "Location: http://127.0.0.1:1/forbidden\r\n",
                b"synthetic-secret-response".to_vec(),
                Duration::ZERO,
            );
            let result = fetch_at(
                &local_client(Duration::from_secs(2)),
                &url,
                &creds(),
                &AtomicBool::new(false),
            )
            .await;
            assert_eq!(result.err(), Some(expected));
            thread.join().unwrap();
        }
        for body in [b"malformed secret body".to_vec(), vec![b'x'; MAX_BODY + 1]] {
            let expected = if body.len() > MAX_BODY {
                Failure::ResponseTooLarge
            } else {
                Failure::Schema
            };
            let (url, _, thread) = server(200, "", body, Duration::ZERO);
            assert_eq!(
                fetch_at(
                    &local_client(Duration::from_secs(2)),
                    &url,
                    &creds(),
                    &AtomicBool::new(false)
                )
                .await
                .err(),
                Some(expected)
            );
            thread.join().unwrap();
        }
    }
    #[tokio::test(flavor = "current_thread")]
    async fn offline_timeout_and_inflight_cancellation() {
        assert!(matches!(
            fetch_at(
                &local_client(Duration::from_millis(100)),
                "http://127.0.0.1:1/",
                &creds(),
                &AtomicBool::new(false)
            )
            .await
            .err(),
            Some(Failure::Network | Failure::Timeout)
        ));
        let (url, observed, thread) = server(200, "", b"{}".to_vec(), Duration::from_secs(1));
        assert_eq!(
            fetch_at(
                &local_client(Duration::from_millis(250)),
                &url,
                &creds(),
                &AtomicBool::new(false)
            )
            .await
            .err(),
            Some(Failure::Timeout)
        );
        observed
            .recv_timeout(Duration::from_secs(2))
            .expect("timeout fixture observed the request");
        thread.join().unwrap();
        let (url, observed, thread) = server(200, "", b"{}".to_vec(), Duration::from_secs(1));
        let cancelled = Arc::new(AtomicBool::new(false));
        let cancel = cancelled.clone();
        let stop = std::thread::spawn(move || {
            observed
                .recv_timeout(Duration::from_secs(5))
                .expect("cancellation starts only after the fixture observed the request");
            cancel.store(true, Ordering::SeqCst);
        });
        assert_eq!(
            fetch_at(
                &local_client(Duration::from_secs(2)),
                &url,
                &creds(),
                &cancelled
            )
            .await
            .err(),
            Some(Failure::Cancelled)
        );
        stop.join().unwrap();
        thread.join().unwrap();
    }
    #[test]
    fn selected_home_file_adapter_config_and_size_guards() {
        let root = std::env::temp_dir().canonicalize().unwrap().join(format!(
            "quotafern-direct-synthetic-{}-{}",
            std::process::id(),
            now_ms().unwrap()
        ));
        secure_create(&root).unwrap();
        let auth_path = root.join("auth.json");
        let mut options = OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut auth = options.open(&auth_path).unwrap();
        auth.write_all(br#"{"tokens":{"access_token":"synthetic-access-token-only","account_id":"synthetic-account"}}"#).unwrap();
        drop(auth);
        assert!(read_credentials(&root, &AtomicBool::new(false)).is_ok());
        fs::write(
            root.join("config.toml"),
            "cli_auth_credentials_store = 'keyring'\n",
        )
        .unwrap();
        assert!(matches!(
            read_credentials(&root, &AtomicBool::new(false)),
            Err(Failure::UnsupportedAuth)
        ));
        fs::write(
            root.join("config.toml"),
            "cli_auth_credentials_store = 'file'\n",
        )
        .unwrap();
        assert!(read_credentials(&root, &AtomicBool::new(false)).is_ok());
        fs::write(&auth_path, vec![b'x'; MAX_AUTH + 1]).unwrap();
        assert!(matches!(
            read_credentials(&root, &AtomicBool::new(false)),
            Err(Failure::UnsafePath)
        ));
        assert!(matches!(
            read_credentials(&root, &AtomicBool::new(true)),
            Err(Failure::Cancelled)
        ));
        fs::remove_file(&auth_path).unwrap();
        fs::remove_file(root.join("config.toml")).unwrap();
        fs::remove_dir(root).unwrap();
    }
    #[test]
    fn production_gate_stays_closed_and_client_refuses_cleartext() {
        const {
            assert!(!DIRECT_CONNECTION_ENABLED);
        }
        assert_eq!(USAGE_URL, "https://chatgpt.com/backend-api/wham/usage");
        let client = http_client().unwrap();
        tauri::async_runtime::block_on(async {
            assert!(client.get("http://127.0.0.1:1/").send().await.is_err());
        });
    }
    #[test]
    fn late_consent_results_cannot_cancel_or_authorize_a_new_attempt() {
        let bridge = DirectBridge::default();
        let first = bridge
            .reserve(ACCOUNT, CONNECTION, DirectKind::Managed)
            .unwrap();
        bridge.disconnect(ACCOUNT, CONNECTION).unwrap();
        let second = bridge
            .reserve(ACCOUNT, CONNECTION, DirectKind::Managed)
            .unwrap();
        assert!(!bridge.attempt_current(CONNECTION, first));
        // A delayed Cancel or source-resolution failure must only cancel A.
        bridge.cancel_attempt(ACCOUNT, CONNECTION, first);
        assert!(bridge.attempt_current(CONNECTION, second));
        // A delayed approval cannot attach an old selected home to B.
        assert!(bridge
            .authorize(ACCOUNT, CONNECTION, first, PathBuf::from("revoked-home"))
            .is_none());
        let current = bridge
            .authorize(ACCOUNT, CONNECTION, second, PathBuf::from("current-home"))
            .unwrap();
        assert_eq!(current.generation, second);
        bridge.shutdown();
        assert!(!bridge.attempt_current(CONNECTION, second));
        assert!(bridge
            .reserve(ACCOUNT, CONNECTION, DirectKind::Managed)
            .is_err());
        assert!(current.cancelled.load(Ordering::SeqCst));
        assert_eq!(
            bridge
                .finish(
                    &current,
                    Ok((fixture(0.0), Zeroizing::new("synthetic".into())))
                )
                .diagnostic,
            Some("directOperationCancelled")
        );
    }
    #[test]
    fn one_system_home_cannot_be_bound_to_multiple_local_accounts() {
        let bridge = DirectBridge::default();
        bridge
            .reserve(ACCOUNT, CONNECTION, DirectKind::System)
            .unwrap();
        assert!(bridge
            .reserve(OTHER_ACCOUNT, OTHER_CONNECTION, DirectKind::System)
            .is_err());
        assert!(bridge
            .reserve(OTHER_ACCOUNT, OTHER_CONNECTION, DirectKind::Managed)
            .is_ok());
    }
    #[test]
    fn ipc_direct_commands_are_local_main_only_and_gate_precedes_consent() {
        let bridge = DirectBridge::default();
        let app = tauri::test::mock_builder()
            .manage(bridge.clone())
            .invoke_handler(tauri::generate_handler![
                codex_direct_connect,
                codex_direct_login,
                codex_direct_status,
                codex_direct_disconnect,
                codex_direct_refresh
            ])
            .build(tauri::generate_context!(test = true))
            .unwrap();
        let main = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let other = tauri::WebviewWindowBuilder::new(&app, "other", Default::default())
            .build()
            .unwrap();
        let invoke = |window: &WebviewWindow<tauri::test::MockRuntime>,
                      command: &str,
                      origin: &str,
                      body: Value| {
            tauri::test::get_ipc_response(
                window,
                tauri::webview::InvokeRequest {
                    cmd: command.into(),
                    callback: tauri::ipc::CallbackFn(0),
                    error: tauri::ipc::CallbackFn(1),
                    url: origin.parse().unwrap(),
                    body: tauri::ipc::InvokeBody::Json(body),
                    headers: Default::default(),
                    invoke_key: tauri::test::INVOKE_KEY.into(),
                },
            )
            .map(|response| response.deserialize::<Value>().unwrap())
        };
        let origin = if cfg!(windows) {
            "http://tauri.localhost"
        } else {
            "tauri://localhost"
        };
        let args = json!({"accountId":ACCOUNT,"connectionId":CONNECTION,"kind":"system"});
        let gated = invoke(&main, "codex_direct_connect", origin, args.clone()).unwrap();
        assert_eq!(gated["connectionStatus"], "unavailable");
        assert!(invoke(&other, "codex_direct_connect", origin, args.clone()).is_err());
        assert!(invoke(
            &main,
            "codex_direct_connect",
            "https://example.invalid",
            args.clone()
        )
        .is_err());
        assert!(invoke(&main, "codex_direct_login", origin, args).is_err());
        assert!(bridge.0.lock().unwrap().sessions.is_empty());
    }
    #[test]
    fn managed_login_uses_only_isolated_home_and_disconnect_reaps_fake_process() {
        use std::sync::OnceLock;
        static FIXTURE: OnceLock<PathBuf> = OnceLock::new();
        let executable = FIXTURE
            .get_or_init(|| {
                let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("target")
                    .join(format!("direct-fixture-{}", std::process::id()));
                fs::create_dir_all(&directory).unwrap();
                let executable = directory.join(format!(
                    "quotafern-fake-login{}",
                    std::env::consts::EXE_SUFFIX
                ));
                assert!(std::process::Command::new("rustc")
                    .arg("--edition=2021")
                    .arg("--crate-name=quotafern_fake_login")
                    .arg(
                        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                            .join("tests/fixtures/direct_login.rs")
                    )
                    .arg("-o")
                    .arg(&executable)
                    .status()
                    .unwrap()
                    .success());
                executable
            })
            .clone();
        let root = std::env::temp_dir().canonicalize().unwrap().join(format!(
            "quotafern-fake-login-home-{}-{}",
            std::process::id(),
            now_ms().unwrap()
        ));
        secure_create(&root).unwrap();
        fs::write(root.join("fixture_hang"), "synthetic").unwrap();
        let bridge = DirectBridge::default();
        let generation = bridge
            .reserve(ACCOUNT, CONNECTION, DirectKind::Managed)
            .unwrap();
        let operation = bridge
            .authorize(ACCOUNT, CONNECTION, generation, root.clone())
            .unwrap();
        let runner = bridge.clone();
        let thread =
            std::thread::spawn(move || run_login_with_executable(&runner, &operation, &executable));
        let deadline = Instant::now() + Duration::from_secs(5);
        while !root.join("fixture_started").exists() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(root.join("fixture_started").exists());
        let disconnected = bridge.disconnect(ACCOUNT, CONNECTION).unwrap();
        assert_eq!(disconnected.connection_status, "disconnected");
        assert_eq!(thread.join().unwrap(), Err(Failure::Cancelled));
        // The credential-free marker remains: disconnect is not credential deletion.
        assert_eq!(
            fs::read_to_string(root.join("fixture_started")).unwrap(),
            "isolated-file-login"
        );
        fs::remove_file(root.join("fixture_hang")).unwrap();
        fs::remove_file(root.join("fixture_started")).unwrap();
        fs::remove_dir(root).unwrap();
    }
    #[test]
    fn credits_use_the_same_canonical_decimal_contract_as_renderer() {
        for value in ["0", "123", "0.5", "1000.123456789012"] {
            assert!(canonical_decimal(value));
        }
        for value in [
            ".5",
            "1.",
            "00",
            "01",
            "1e3",
            "-1",
            "0.1234567890123",
            "1234567890123456789012345678901",
        ] {
            assert!(!canonical_decimal(value));
            let normalized = normalize(&json!({"rate_limit":{"primary_window":{"used_percent":25}},"credits":{"balance":value}}), snapshot()).unwrap();
            assert!(normalized.credits.unwrap().balance.is_none());
            assert_eq!(normalized.windows[0].remaining_percent, Some(75.0));
        }
        let too_many = json!({"additional_rate_limits": (0..9).map(|_| json!({"rate_limit":{"primary_window":{"used_percent":0},"secondary_window":{"used_percent":0}}})).collect::<Vec<_>>()});
        assert!(matches!(
            normalize(&too_many, snapshot()),
            Err(Failure::Schema)
        ));
    }
}
