use serde::Serialize;
use serde_json::{json, Value};
use std::env;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{State, WebviewWindow};

const MAX_FRAME_BYTES: usize = 1024 * 1024;
const MAX_QUEUED_FRAMES: usize = 8;
const MAX_STDOUT_BYTES: usize = 4096;
const MAX_BUCKETS: usize = 16;
const RPC_TIMEOUT: Duration = Duration::from_secs(8);
const READER_POLL: Duration = Duration::from_millis(50);
const REFRESH_COOLDOWN: Duration = Duration::from_secs(30);
const MAX_ERROR_BACKOFF: Duration = Duration::from_secs(300);
const MAX_SAFE_JS_INTEGER: u64 = 8_640_000_000_000_000;
const SUPPORTED_CODEX_VERSION: &str = "0.164.0";
// Pinned app-server source still starts persistent remote-control/cloud-config
// activity without a documented opt-out. Keep user connect requests closed
// until a public, fail-closed startup policy is available and reviewed.
const LIVE_CONNECTION_ENABLED: bool = false;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum ConnectionStatus {
    Disconnected,
    Connected,
    Unavailable,
    AuthRequired,
    Unsupported,
    Incompatible,
    Error,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum DataStatus {
    Current,
    Stale,
    Unknown,
    Error,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct QuotaWindow {
    id: String,
    name: String,
    remaining_percent: Option<f64>,
    reset_at_ms: Option<u64>,
    window_duration_mins: Option<f64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexSnapshot {
    source: &'static str,
    provider_id: &'static str,
    display_label: &'static str,
    connection_status: ConnectionStatus,
    data_status: DataStatus,
    windows: Vec<QuotaWindow>,
    fetched_at_ms: Option<u64>,
    diagnostic: Option<&'static str>,
}

impl CodexSnapshot {
    fn disconnected() -> Self {
        Self {
            source: "live",
            provider_id: "codex",
            display_label: "Codex",
            connection_status: ConnectionStatus::Disconnected,
            data_status: DataStatus::Unknown,
            windows: Vec::new(),
            fetched_at_ms: None,
            diagnostic: None,
        }
    }

    fn mark_stale(&mut self, diagnostic: &'static str) {
        self.data_status = if self.windows.is_empty() {
            DataStatus::Error
        } else {
            DataStatus::Stale
        };
        self.diagnostic = Some(diagnostic);
    }

    fn invalidate_account(&mut self) {
        self.windows.clear();
        self.fetched_at_ms = None;
        self.data_status = DataStatus::Unknown;
        self.diagnostic = Some("accountChanged");
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AccountKind {
    ChatGpt,
    ApiKey,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BridgeFailure {
    CodexNotFound,
    UnsupportedLauncher,
    StartupFailed,
    UnsupportedVersion,
    TimedOut,
    MalformedFrame,
    OversizedFrame,
    FrameQueueOverflow,
    ProcessExited,
    Interrupted,
    ProtocolMismatch,
    UnsupportedMethod,
    AuthenticationRequired,
    UnsupportedAccount,
    RateLimitsUnavailable,
    AccountChanged,
}

impl BridgeFailure {
    fn diagnostic(self) -> &'static str {
        match self {
            Self::CodexNotFound => "codexNotFound",
            Self::UnsupportedLauncher => "unsupportedLauncher",
            Self::StartupFailed => "codexStartupFailed",
            Self::UnsupportedVersion => "unsupportedCodexVersion",
            Self::TimedOut => "appServerTimedOut",
            Self::MalformedFrame => "malformedAppServerFrame",
            Self::OversizedFrame => "appServerFrameTooLarge",
            Self::FrameQueueOverflow => "appServerFrameQueueOverflow",
            Self::ProcessExited => "appServerExited",
            Self::Interrupted => "operationInterrupted",
            Self::ProtocolMismatch => "appServerProtocolMismatch",
            Self::UnsupportedMethod => "appServerMethodUnsupported",
            Self::AuthenticationRequired => "codexAuthenticationRequired",
            Self::UnsupportedAccount => "codexAccountUnsupported",
            Self::RateLimitsUnavailable => "codexRateLimitsUnavailable",
            Self::AccountChanged => "codexAccountChanged",
        }
    }

    fn connection_status(self) -> ConnectionStatus {
        match self {
            Self::CodexNotFound | Self::UnsupportedLauncher => ConnectionStatus::Unavailable,
            Self::UnsupportedVersion | Self::ProtocolMismatch | Self::UnsupportedMethod => {
                ConnectionStatus::Incompatible
            }
            Self::AuthenticationRequired => ConnectionStatus::AuthRequired,
            Self::UnsupportedAccount => ConnectionStatus::Unsupported,
            Self::StartupFailed
            | Self::TimedOut
            | Self::MalformedFrame
            | Self::OversizedFrame
            | Self::FrameQueueOverflow
            | Self::ProcessExited
            | Self::Interrupted
            | Self::RateLimitsUnavailable
            | Self::AccountChanged => ConnectionStatus::Error,
        }
    }

    fn is_transport_fatal(self) -> bool {
        matches!(
            self,
            Self::TimedOut
                | Self::MalformedFrame
                | Self::OversizedFrame
                | Self::FrameQueueOverflow
                | Self::ProcessExited
                | Self::Interrupted
                | Self::ProtocolMismatch
                | Self::UnsupportedMethod
        )
    }
}

#[derive(Debug)]
enum FrameError {
    Malformed,
    Oversized,
    ReadFailed,
    Closed,
}

impl FrameError {
    fn bridge_failure(&self) -> BridgeFailure {
        match self {
            Self::Malformed => BridgeFailure::MalformedFrame,
            Self::Oversized => BridgeFailure::OversizedFrame,
            Self::ReadFailed | Self::Closed => BridgeFailure::ProcessExited,
        }
    }
}

type Frame = Result<Value, FrameError>;

struct FrameStream {
    frames: Receiver<Frame>,
    overflowed: Arc<AtomicBool>,
    reader: JoinHandle<()>,
}

struct AppServerSession {
    child: OwnedChild,
    rpc: RpcConnection<ChildStdin>,
    reader: Option<JoinHandle<()>>,
}

impl AppServerSession {
    fn shutdown(&mut self) {
        self.rpc.cancel.store(true, Ordering::Relaxed);
        self.child.terminate();
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
    }

    fn refresh_rate_limits(&mut self, expected_generation: u64) -> Result<(), BridgeFailure> {
        let response = self.rpc.request("account/rateLimits/read", None)?;
        validate_account_generation(
            expected_generation,
            self.rpc.account_generation,
            &self.rpc.snapshot,
        )?;
        apply_rate_limit_result(&self.rpc.snapshot, &response)
    }
}

impl Drop for AppServerSession {
    fn drop(&mut self) {
        self.shutdown();
    }
}

struct RpcConnection<W> {
    writer: W,
    frames: Receiver<Frame>,
    overflowed: Arc<AtomicBool>,
    cancel: Arc<AtomicBool>,
    snapshot: Arc<Mutex<CodexSnapshot>>,
    next_id: u64,
    account_generation: u64,
}

impl<W: Write> RpcConnection<W> {
    fn new(
        writer: W,
        stream: FrameStream,
        cancel: Arc<AtomicBool>,
        snapshot: Arc<Mutex<CodexSnapshot>>,
    ) -> (Self, JoinHandle<()>) {
        (
            Self {
                writer,
                frames: stream.frames,
                overflowed: stream.overflowed,
                cancel,
                snapshot,
                next_id: 1,
                account_generation: 0,
            },
            stream.reader,
        )
    }

    fn notify(&mut self, method: &str, params: Value) -> Result<(), BridgeFailure> {
        let frame = serde_json::to_vec(&json!({ "method": method, "params": params }))
            .map_err(|_| BridgeFailure::ProtocolMismatch)?;
        self.writer
            .write_all(&frame)
            .and_then(|_| self.writer.write_all(b"\n"))
            .and_then(|_| self.writer.flush())
            .map_err(|_| BridgeFailure::ProcessExited)
    }

    fn request(&mut self, method: &str, params: Option<Value>) -> Result<Value, BridgeFailure> {
        self.request_with_timeout(method, params, RPC_TIMEOUT)
    }

    fn request_with_timeout(
        &mut self,
        method: &str,
        params: Option<Value>,
        timeout: Duration,
    ) -> Result<Value, BridgeFailure> {
        let id = self.next_id;
        self.next_id = self.next_id.saturating_add(1);
        let mut request = json!({ "id": id, "method": method });
        if let Some(params) = params {
            request["params"] = params;
        }
        let frame = serde_json::to_vec(&request).map_err(|_| BridgeFailure::ProtocolMismatch)?;
        self.writer
            .write_all(&frame)
            .and_then(|_| self.writer.write_all(b"\n"))
            .and_then(|_| self.writer.flush())
            .map_err(|_| BridgeFailure::ProcessExited)?;

        let deadline = Instant::now() + timeout;
        loop {
            if self.cancel.load(Ordering::Relaxed) {
                return Err(BridgeFailure::Interrupted);
            }
            if self.overflowed.load(Ordering::Relaxed) {
                return Err(BridgeFailure::FrameQueueOverflow);
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(BridgeFailure::TimedOut);
            }
            match self.frames.recv_timeout(remaining.min(READER_POLL)) {
                Ok(Ok(message)) => {
                    self.validate_header(&message)?;
                    if let Some(notification_method) = message.get("method").and_then(Value::as_str)
                    {
                        if message.get("id").is_some() {
                            return Err(BridgeFailure::ProtocolMismatch);
                        }
                        self.handle_notification(notification_method, &message);
                        continue;
                    }
                    if message.get("id") != Some(&json!(id)) {
                        return Err(BridgeFailure::ProtocolMismatch);
                    }
                    if message.get("error").is_some() {
                        let error = message.get("error").and_then(Value::as_object);
                        if error
                            .and_then(|object| object.get("code"))
                            .and_then(Value::as_i64)
                            .is_some_and(|code| code == -32601)
                        {
                            return Err(BridgeFailure::UnsupportedMethod);
                        }
                        return Err(BridgeFailure::RateLimitsUnavailable);
                    }
                    return message
                        .get("result")
                        .filter(|result| result.is_object())
                        .cloned()
                        .ok_or(BridgeFailure::ProtocolMismatch);
                }
                Ok(Err(error)) => return Err(error.bridge_failure()),
                Err(RecvTimeoutError::Timeout) => continue,
                Err(RecvTimeoutError::Disconnected) => return Err(BridgeFailure::ProcessExited),
            }
        }
    }

    fn poll_idle(&mut self) -> Result<(), BridgeFailure> {
        if self.overflowed.load(Ordering::Relaxed) {
            return Err(BridgeFailure::FrameQueueOverflow);
        }
        loop {
            match self.frames.try_recv() {
                Ok(Ok(message)) => {
                    self.validate_header(&message)?;
                    if let Some(method) = message.get("method").and_then(Value::as_str) {
                        if message.get("id").is_some() {
                            return Err(BridgeFailure::ProtocolMismatch);
                        }
                        self.handle_notification(method, &message);
                    } else {
                        return Err(BridgeFailure::ProtocolMismatch);
                    }
                }
                Ok(Err(error)) => return Err(error.bridge_failure()),
                Err(mpsc::TryRecvError::Empty) => return Ok(()),
                Err(mpsc::TryRecvError::Disconnected) => return Err(BridgeFailure::ProcessExited),
            }
        }
    }

    fn validate_header(&self, message: &Value) -> Result<(), BridgeFailure> {
        match message.get("jsonrpc") {
            None => Ok(()),
            Some(version) if version.as_str() == Some("2.0") => Ok(()),
            Some(_) => Err(BridgeFailure::ProtocolMismatch),
        }
    }

    fn handle_notification(&mut self, method: &str, message: &Value) {
        if method == "account/updated" {
            self.account_generation = self.account_generation.wrapping_add(1);
        }
        handle_notification(method, message, &self.snapshot);
    }
}

enum WorkerRequest {
    Refresh(Sender<Result<(), BridgeFailure>>),
    Shutdown(Sender<()>),
}

struct ProcessSession {
    requests: Sender<WorkerRequest>,
    cancel: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

impl ProcessSession {
    fn refresh(&self) -> Result<(), BridgeFailure> {
        if self.cancel.load(Ordering::Relaxed) {
            return Err(BridgeFailure::ProcessExited);
        }

        let (reply_tx, reply_rx) = mpsc::channel();
        self.requests
            .send(WorkerRequest::Refresh(reply_tx))
            .map_err(|_| BridgeFailure::ProcessExited)?;
        reply_rx
            .recv_timeout(RPC_TIMEOUT.saturating_mul(2) + Duration::from_secs(1))
            .map_err(|error| match error {
                RecvTimeoutError::Timeout => BridgeFailure::TimedOut,
                RecvTimeoutError::Disconnected => BridgeFailure::ProcessExited,
            })?
    }

    fn shutdown(&mut self) {
        self.cancel.store(true, Ordering::Relaxed);
        let (reply_tx, reply_rx) = mpsc::channel();
        let sent = self
            .requests
            .send(WorkerRequest::Shutdown(reply_tx))
            .is_ok();
        if sent {
            let _ = reply_rx.recv_timeout(Duration::from_secs(2));
        }
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

impl Drop for ProcessSession {
    fn drop(&mut self) {
        self.shutdown();
    }
}

struct BridgeInner {
    session: Option<ProcessSession>,
    next_refresh_at: Option<Instant>,
    error_backoff: Duration,
}

impl Default for BridgeInner {
    fn default() -> Self {
        Self {
            session: None,
            next_refresh_at: None,
            error_backoff: REFRESH_COOLDOWN,
        }
    }
}

#[derive(Clone)]
pub(crate) struct CodexBridge {
    inner: Arc<Mutex<BridgeInner>>,
    snapshot: Arc<Mutex<CodexSnapshot>>,
}

impl Default for CodexBridge {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(BridgeInner::default())),
            snapshot: Arc::new(Mutex::new(CodexSnapshot::disconnected())),
        }
    }
}

impl CodexBridge {
    fn lock(&self) -> MutexGuard<'_, BridgeInner> {
        self.inner
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    pub(crate) fn status(&self) -> CodexSnapshot {
        lock_snapshot(&self.snapshot).clone()
    }

    pub(crate) fn connect(&self) -> CodexSnapshot {
        if !LIVE_CONNECTION_ENABLED {
            let mut snapshot = lock_snapshot(&self.snapshot);
            snapshot.connection_status = ConnectionStatus::Incompatible;
            snapshot.data_status = DataStatus::Unknown;
            snapshot.windows.clear();
            snapshot.fetched_at_ms = None;
            snapshot.diagnostic = Some("startupPolicyUnverified");
            return snapshot.clone();
        }

        let mut state = self.lock();
        if state.session.is_some() {
            return lock_snapshot(&self.snapshot).clone();
        }

        *lock_snapshot(&self.snapshot) = CodexSnapshot::disconnected();
        state.next_refresh_at = None;
        state.error_backoff = REFRESH_COOLDOWN;

        let executable = match find_codex_executable() {
            Ok(path) => path,
            Err(error) => {
                apply_failure(&mut lock_snapshot(&self.snapshot), error);
                return lock_snapshot(&self.snapshot).clone();
            }
        };

        match launch_and_initialize(&executable, Arc::clone(&self.snapshot)) {
            Ok((session, initial_account)) => {
                let cancel = Arc::clone(&session.rpc.cancel);
                let (request_tx, request_rx) = mpsc::channel();
                let worker_cancel = Arc::clone(&cancel);
                let worker = thread::Builder::new()
                    .name("quotafern-codex-app-server".to_owned())
                    .spawn(move || {
                        worker_loop(session, request_rx, worker_cancel, initial_account);
                    });

                match worker {
                    Ok(worker) => {
                        state.session = Some(ProcessSession {
                            requests: request_tx,
                            cancel,
                            worker: Some(worker),
                        });
                        state.next_refresh_at = Some(Instant::now() + REFRESH_COOLDOWN);
                        state.error_backoff = REFRESH_COOLDOWN;
                    }
                    Err(_) => {
                        apply_failure(
                            &mut lock_snapshot(&self.snapshot),
                            BridgeFailure::StartupFailed,
                        );
                        lock_snapshot(&self.snapshot).connection_status = ConnectionStatus::Error;
                    }
                }
            }
            Err(error) => apply_failure(&mut lock_snapshot(&self.snapshot), error),
        }

        lock_snapshot(&self.snapshot).clone()
    }

    pub(crate) fn refresh(&self) -> CodexSnapshot {
        let mut state = self.lock();
        self.refresh_locked(&mut state)
    }

    fn refresh_locked(&self, state: &mut BridgeInner) -> CodexSnapshot {
        if state
            .next_refresh_at
            .is_some_and(|next| Instant::now() < next)
        {
            let mut snapshot = lock_snapshot(&self.snapshot).clone();
            snapshot.diagnostic = Some("refreshCooldown");
            return snapshot;
        }

        let Some(session) = state.session.as_ref() else {
            return lock_snapshot(&self.snapshot).clone();
        };

        match session.refresh() {
            Ok(()) => {
                state.error_backoff = REFRESH_COOLDOWN;
                state.next_refresh_at = Some(Instant::now() + REFRESH_COOLDOWN);
            }
            Err(error) => {
                let close_session = error.is_transport_fatal()
                    || matches!(error, BridgeFailure::UnsupportedAccount);
                if close_session {
                    let mut snapshot = lock_snapshot(&self.snapshot);
                    if matches!(error, BridgeFailure::UnsupportedAccount) {
                        apply_failure(&mut snapshot, error);
                    } else {
                        snapshot.connection_status = error.connection_status();
                        snapshot.mark_stale(error.diagnostic());
                    }
                    drop(snapshot);
                    if let Some(mut session) = state.session.take() {
                        session.shutdown();
                    }
                } else {
                    apply_failure(&mut lock_snapshot(&self.snapshot), error);
                }
                state.next_refresh_at = Some(Instant::now() + state.error_backoff);
                state.error_backoff = (state.error_backoff * 2).min(MAX_ERROR_BACKOFF);
            }
        }

        lock_snapshot(&self.snapshot).clone()
    }

    pub(crate) fn disconnect(&self) -> CodexSnapshot {
        let session = {
            let mut state = self.lock();
            state.next_refresh_at = None;
            state.error_backoff = REFRESH_COOLDOWN;
            *lock_snapshot(&self.snapshot) = CodexSnapshot::disconnected();
            state.session.take()
        };
        if let Some(mut session) = session {
            session.shutdown();
        }
        self.status()
    }

    pub(crate) fn shutdown(&self) {
        let session = {
            let mut state = self.lock();
            state.session.take()
        };
        if let Some(mut session) = session {
            session.shutdown();
        }
    }
}

fn lock_snapshot(snapshot: &Arc<Mutex<CodexSnapshot>>) -> MutexGuard<'_, CodexSnapshot> {
    snapshot
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn apply_failure(snapshot: &mut CodexSnapshot, error: BridgeFailure) {
    match error {
        BridgeFailure::AuthenticationRequired | BridgeFailure::UnsupportedAccount => {
            snapshot.windows.clear();
            snapshot.fetched_at_ms = None;
            snapshot.data_status = DataStatus::Unknown;
        }
        _ => snapshot.mark_stale(error.diagnostic()),
    }
    snapshot.connection_status = error.connection_status();
    snapshot.diagnostic = Some(error.diagnostic());
}

fn find_codex_executable() -> Result<PathBuf, BridgeFailure> {
    let path = env::var_os("PATH").ok_or(BridgeFailure::CodexNotFound)?;
    #[cfg(windows)]
    let mut saw_unsupported = false;
    #[cfg(not(windows))]
    let saw_unsupported = false;

    for directory in env::split_paths(&path).filter(|entry| entry.is_absolute()) {
        #[cfg(windows)]
        let names = ["codex.exe"];
        #[cfg(not(windows))]
        let names = ["codex"];

        for name in names {
            let candidate = directory.join(name);
            if candidate.is_file() {
                let absolute = candidate
                    .canonicalize()
                    .map_err(|_| BridgeFailure::CodexNotFound)?;
                return Ok(absolute);
            }
        }

        #[cfg(windows)]
        for shim in ["codex.cmd", "codex.bat", "codex.ps1"] {
            if directory.join(shim).is_file() {
                saw_unsupported = true;
            }
        }
    }

    if saw_unsupported {
        Err(BridgeFailure::UnsupportedLauncher)
    } else {
        Err(BridgeFailure::CodexNotFound)
    }
}

fn fixed_config_args() -> Vec<&'static str> {
    vec![
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
    ]
}

fn probe_codex_version(executable: &Path) -> Result<(), BridgeFailure> {
    let mut command = Command::new(executable);
    command
        .args(fixed_config_args())
        .arg("--strict-config")
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let mut child = OwnedChild::spawn(&mut command).map_err(|_| BridgeFailure::StartupFailed)?;
    let stdout = child
        .child
        .stdout
        .take()
        .ok_or(BridgeFailure::StartupFailed)?;
    let (output_tx, output_rx) = mpsc::channel();
    let reader = thread::Builder::new()
        .name("quotafern-codex-version".to_owned())
        .spawn(move || {
            let mut limited = stdout.take(MAX_STDOUT_BYTES as u64 + 1);
            let mut bytes = Vec::new();
            let result = limited.read_to_end(&mut bytes);
            let _ = output_tx.send(result.map(|_| bytes));
        })
        .map_err(|_| BridgeFailure::StartupFailed)?;

    let deadline = Instant::now() + RPC_TIMEOUT;
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|_| BridgeFailure::StartupFailed)? {
            break status;
        }
        if Instant::now() >= deadline {
            child.terminate();
            let _ = reader.join();
            return Err(BridgeFailure::TimedOut);
        }
        thread::sleep(Duration::from_millis(20));
    };
    let output = output_rx
        .recv_timeout(Duration::from_secs(1))
        .map_err(|_| BridgeFailure::StartupFailed)?
        .map_err(|_| BridgeFailure::StartupFailed)?;
    let _ = reader.join();

    if !status.success() || output.len() > MAX_STDOUT_BYTES {
        return Err(BridgeFailure::StartupFailed);
    }
    let version = String::from_utf8(output).map_err(|_| BridgeFailure::UnsupportedVersion)?;
    check_supported_codex_version(&version)
}

fn check_supported_codex_version(output: &str) -> Result<(), BridgeFailure> {
    let reported_version = output.split_whitespace().last().unwrap_or_default();
    if reported_version == SUPPORTED_CODEX_VERSION {
        Ok(())
    } else {
        Err(BridgeFailure::UnsupportedVersion)
    }
}

fn launch_and_initialize(
    executable: &Path,
    snapshot: Arc<Mutex<CodexSnapshot>>,
) -> Result<(AppServerSession, Option<AccountKind>), BridgeFailure> {
    probe_codex_version(executable)?;

    let mut command = Command::new(executable);
    command
        .args(fixed_config_args())
        .arg("--strict-config")
        .arg("app-server")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let mut child = OwnedChild::spawn(&mut command).map_err(|_| BridgeFailure::StartupFailed)?;
    let Some(stdin) = child.child.stdin.take() else {
        return Err(BridgeFailure::StartupFailed);
    };
    let Some(stdout) = child.child.stdout.take() else {
        return Err(BridgeFailure::StartupFailed);
    };
    let stream = start_frame_reader(stdout).map_err(|_| BridgeFailure::StartupFailed)?;
    let cancel = Arc::new(AtomicBool::new(false));
    let (rpc, reader) = RpcConnection::new(stdin, stream, cancel, Arc::clone(&snapshot));
    let mut session = AppServerSession {
        child,
        rpc,
        reader: Some(reader),
    };

    session.rpc.request(
        "initialize",
        Some(json!({
            "clientInfo": {
                "name": "quotafern",
                "title": "Quotafern",
                "version": env!("CARGO_PKG_VERSION")
            },
            "capabilities": {}
        })),
    )?;
    session.rpc.notify("initialized", json!({}))?;

    let initial_generation = session.rpc.account_generation;
    let account_response = session
        .rpc
        .request("account/read", Some(json!({ "refreshToken": false })))?;
    let account_kind = account_from_result(&account_response)?;
    validate_account_generation(
        initial_generation,
        session.rpc.account_generation,
        &snapshot,
    )?;

    match account_kind {
        None => {
            let mut initial = lock_snapshot(&snapshot);
            initial.connection_status = ConnectionStatus::AuthRequired;
            initial.data_status = DataStatus::Unknown;
            initial.diagnostic = Some(BridgeFailure::AuthenticationRequired.diagnostic());
        }
        Some(AccountKind::ChatGpt) => {
            lock_snapshot(&snapshot).connection_status = ConnectionStatus::Connected;
            session.refresh_rate_limits(initial_generation)?;
        }
        Some(kind) => validate_rate_limit_account(kind)?,
    }
    Ok((session, account_kind))
}

fn start_frame_reader<R: Read + Send + 'static>(mut reader: R) -> std::io::Result<FrameStream> {
    let (sender, receiver) = mpsc::sync_channel(MAX_QUEUED_FRAMES);
    let overflowed = Arc::new(AtomicBool::new(false));
    let reader_overflowed = Arc::clone(&overflowed);
    let handle = thread::Builder::new()
        .name("quotafern-codex-jsonl-reader".to_owned())
        .spawn(move || {
            let mut chunk = [0_u8; 8192];
            let mut frame = Vec::with_capacity(4096);
            loop {
                let count = match reader.read(&mut chunk) {
                    Ok(0) => {
                        let error = if frame.is_empty() {
                            FrameError::Closed
                        } else {
                            FrameError::Malformed
                        };
                        try_send_frame(&sender, &reader_overflowed, Err(error));
                        return;
                    }
                    Ok(count) => count,
                    Err(_) => {
                        try_send_frame(&sender, &reader_overflowed, Err(FrameError::ReadFailed));
                        return;
                    }
                };

                for byte in &chunk[..count] {
                    if *byte == b'\n' {
                        if frame.last() == Some(&b'\r') {
                            frame.pop();
                        }
                        let parsed = serde_json::from_slice::<Value>(&frame)
                            .map_err(|_| FrameError::Malformed);
                        match sender.try_send(parsed) {
                            Ok(()) => {}
                            Err(mpsc::TrySendError::Full(_)) => {
                                reader_overflowed.store(true, Ordering::Relaxed);
                                return;
                            }
                            Err(mpsc::TrySendError::Disconnected(_)) => return,
                        }
                        frame.clear();
                    } else {
                        if frame.len() >= MAX_FRAME_BYTES {
                            try_send_frame(&sender, &reader_overflowed, Err(FrameError::Oversized));
                            return;
                        }
                        frame.push(*byte);
                    }
                }
            }
        })?;
    Ok(FrameStream {
        frames: receiver,
        overflowed,
        reader: handle,
    })
}

fn try_send_frame(sender: &mpsc::SyncSender<Frame>, overflowed: &AtomicBool, frame: Frame) {
    if let Err(mpsc::TrySendError::Full(_)) = sender.try_send(frame) {
        overflowed.store(true, Ordering::Relaxed);
    }
}

fn handle_notification(method: &str, message: &Value, snapshot: &Arc<Mutex<CodexSnapshot>>) {
    let mut snapshot = lock_snapshot(snapshot);
    match method {
        "account/updated" => snapshot.invalidate_account(),
        "account/rateLimits/updated" => {
            let has_rate_limits = message
                .get("params")
                .and_then(Value::as_object)
                .and_then(|params| params.get("rateLimits"))
                .is_some();
            if has_rate_limits {
                if snapshot.connection_status == ConnectionStatus::Connected {
                    snapshot.data_status = if snapshot.windows.is_empty() {
                        DataStatus::Unknown
                    } else {
                        DataStatus::Stale
                    };
                }
                snapshot.diagnostic = Some("rateLimitsUpdated");
            }
        }
        _ => {}
    }
}

fn worker_loop(
    mut session: AppServerSession,
    requests: Receiver<WorkerRequest>,
    cancel: Arc<AtomicBool>,
    initial_account: Option<AccountKind>,
) {
    let mut account_kind = initial_account;
    let mut disconnected = false;
    let mut intentional_shutdown = false;
    let mut failure_reported = false;

    loop {
        if cancel.load(Ordering::Relaxed) {
            break;
        }

        let before_idle_poll = session.rpc.account_generation;
        if let Err(error) = session.rpc.poll_idle() {
            let mut status = lock_snapshot(&session.rpc.snapshot);
            status.connection_status = error.connection_status();
            status.mark_stale(error.diagnostic());
            disconnected = true;
            failure_reported = true;
            break;
        }
        if session.rpc.account_generation != before_idle_poll {
            account_kind = None;
        }

        match requests.recv_timeout(READER_POLL) {
            Ok(WorkerRequest::Refresh(reply)) => {
                let result = refresh_account(&mut session, &mut account_kind);
                let fatal = result.as_ref().err().is_some_and(|error| {
                    error.is_transport_fatal() || matches!(error, BridgeFailure::UnsupportedAccount)
                });
                let unsupported_account = result
                    .as_ref()
                    .is_err_and(|error| matches!(error, BridgeFailure::UnsupportedAccount));
                let _ = reply.send(result);
                if fatal {
                    intentional_shutdown = unsupported_account;
                    disconnected = true;
                    break;
                }
            }
            Ok(WorkerRequest::Shutdown(reply)) => {
                cancel.store(true, Ordering::Relaxed);
                session.shutdown();
                let _ = reply.send(());
                intentional_shutdown = true;
                break;
            }
            Err(RecvTimeoutError::Timeout) => {
                if let Ok(Some(_)) = session.child.try_wait() {
                    let mut status = lock_snapshot(&session.rpc.snapshot);
                    status.connection_status = ConnectionStatus::Error;
                    status.mark_stale("appServerExited");
                    disconnected = true;
                    failure_reported = true;
                    break;
                }
            }
            Err(RecvTimeoutError::Disconnected) => {
                disconnected = true;
                break;
            }
        }
    }

    let was_cancelled = cancel.load(Ordering::Relaxed);
    cancel.store(true, Ordering::Relaxed);
    session.shutdown();
    if disconnected && !intentional_shutdown && !was_cancelled && !failure_reported {
        let mut status = lock_snapshot(&session.rpc.snapshot);
        status.connection_status = ConnectionStatus::Error;
        status.mark_stale("appServerExited");
    }
}

fn refresh_account(
    session: &mut AppServerSession,
    account_kind: &mut Option<AccountKind>,
) -> Result<(), BridgeFailure> {
    let refresh_generation = session.rpc.account_generation;
    let response = session
        .rpc
        .request("account/read", Some(json!({ "refreshToken": false })))?;
    let next_account = account_from_result(&response)?;
    if let Err(error) = validate_account_generation(
        refresh_generation,
        session.rpc.account_generation,
        &session.rpc.snapshot,
    ) {
        *account_kind = None;
        return Err(error);
    }

    match next_account {
        None => {
            let mut snapshot = lock_snapshot(&session.rpc.snapshot);
            snapshot.windows.clear();
            snapshot.fetched_at_ms = None;
            snapshot.data_status = DataStatus::Unknown;
            snapshot.connection_status = ConnectionStatus::AuthRequired;
            snapshot.diagnostic = Some(BridgeFailure::AuthenticationRequired.diagnostic());
            *account_kind = None;
            Err(BridgeFailure::AuthenticationRequired)
        }
        Some(AccountKind::ApiKey) => {
            lock_snapshot(&session.rpc.snapshot).invalidate_account();
            *account_kind = None;
            validate_rate_limit_account(AccountKind::ApiKey)
        }
        Some(AccountKind::ChatGpt) => {
            if *account_kind != Some(AccountKind::ChatGpt) {
                lock_snapshot(&session.rpc.snapshot).invalidate_account();
            }
            *account_kind = Some(AccountKind::ChatGpt);
            lock_snapshot(&session.rpc.snapshot).connection_status = ConnectionStatus::Connected;
            session.refresh_rate_limits(refresh_generation)
        }
    }
}

fn account_from_result(result: &Value) -> Result<Option<AccountKind>, BridgeFailure> {
    let account = result
        .get("account")
        .ok_or(BridgeFailure::ProtocolMismatch)?;
    if account.is_null() {
        return Ok(None);
    }
    let account_type = account
        .get("type")
        .and_then(Value::as_str)
        .ok_or(BridgeFailure::ProtocolMismatch)?;
    match account_type {
        "chatgpt" => Ok(Some(AccountKind::ChatGpt)),
        "apiKey" => Ok(Some(AccountKind::ApiKey)),
        "amazonBedrock" => Err(BridgeFailure::UnsupportedAccount),
        _ => Err(BridgeFailure::UnsupportedAccount),
    }
}

fn validate_account_generation(
    expected: u64,
    actual: u64,
    snapshot: &Arc<Mutex<CodexSnapshot>>,
) -> Result<(), BridgeFailure> {
    if expected != actual {
        lock_snapshot(snapshot).invalidate_account();
        Err(BridgeFailure::AccountChanged)
    } else {
        Ok(())
    }
}

fn validate_rate_limit_account(kind: AccountKind) -> Result<(), BridgeFailure> {
    match kind {
        AccountKind::ChatGpt => Ok(()),
        AccountKind::ApiKey => Err(BridgeFailure::UnsupportedAccount),
    }
}

fn apply_rate_limit_result(
    snapshot: &Arc<Mutex<CodexSnapshot>>,
    response: &Value,
) -> Result<(), BridgeFailure> {
    let fetched_at_ms = now_ms().ok_or(BridgeFailure::ProtocolMismatch)?;
    let windows = normalize_rate_limits(response, fetched_at_ms);
    let invalid_shape = has_invalid_rate_limit_shape(response);
    let invalid_percentage = has_invalid_used_percent(response);
    let bucket_overflow = rate_limit_bucket_count(response) > MAX_BUCKETS;
    let has_valid_value = windows
        .iter()
        .any(|window| window.remaining_percent.is_some());
    let mut snapshot = lock_snapshot(snapshot);
    snapshot.windows = windows;
    snapshot.fetched_at_ms = Some(fetched_at_ms);
    snapshot.data_status = if has_valid_value && !bucket_overflow {
        DataStatus::Current
    } else {
        DataStatus::Unknown
    };
    snapshot.connection_status = ConnectionStatus::Connected;
    snapshot.diagnostic = if bucket_overflow {
        Some("tooManyQuotaBuckets")
    } else if invalid_shape || invalid_percentage {
        Some("invalidQuotaValue")
    } else {
        None
    };
    Ok(())
}

fn normalize_rate_limits(result: &Value, _fetched_at_ms: u64) -> Vec<QuotaWindow> {
    let mut windows = Vec::new();
    if let Some(by_limit_id) = result.get("rateLimitsByLimitId") {
        if let Some(buckets) = by_limit_id.as_object() {
            for (index, (key, bucket)) in buckets.iter().take(MAX_BUCKETS).enumerate() {
                append_bucket_windows(&mut windows, bucket, index + 1, key == "codex");
            }
        }
    } else if let Some(bucket) = result.get("rateLimits") {
        let primary_bucket = bucket
            .get("limitId")
            .and_then(Value::as_str)
            .is_none_or(|limit_id| limit_id == "codex");
        append_bucket_windows(&mut windows, bucket, 1, primary_bucket);
    }
    windows
}

fn rate_limit_bucket_count(result: &Value) -> usize {
    match result.get("rateLimitsByLimitId") {
        Some(by_limit_id) => by_limit_id.as_object().map_or(0, serde_json::Map::len),
        None => usize::from(result.get("rateLimits").is_some()),
    }
}

fn has_invalid_rate_limit_shape(result: &Value) -> bool {
    let bucket_is_invalid = |bucket: &Value| {
        let Some(bucket) = bucket.as_object() else {
            return true;
        };
        for name in ["primary", "secondary"] {
            if let Some(window) = bucket.get(name).filter(|window| !window.is_null()) {
                if !window.is_object() {
                    return true;
                }
            }
        }
        false
    };
    match result.get("rateLimitsByLimitId") {
        Some(by_limit_id) => by_limit_id
            .as_object()
            .is_none_or(|buckets| buckets.values().any(bucket_is_invalid)),
        None => result.get("rateLimits").is_some_and(bucket_is_invalid),
    }
}

fn has_invalid_used_percent(result: &Value) -> bool {
    let has_invalid_bucket = |bucket: &Value| {
        ["primary", "secondary"].into_iter().any(|name| {
            bucket
                .get(name)
                .and_then(Value::as_object)
                .and_then(|window| window.get("usedPercent"))
                .is_some_and(|value| {
                    value
                        .as_f64()
                        .is_none_or(|used| !used.is_finite() || !(0.0..=100.0).contains(&used))
                })
        })
    };
    match result.get("rateLimitsByLimitId") {
        Some(by_limit_id) => by_limit_id
            .as_object()
            .is_some_and(|buckets| buckets.values().any(has_invalid_bucket)),
        None => result.get("rateLimits").is_some_and(has_invalid_bucket),
    }
}

fn append_bucket_windows(
    windows: &mut Vec<QuotaWindow>,
    bucket: &Value,
    bucket_index: usize,
    primary_bucket: bool,
) {
    for window_name in ["primary", "secondary"] {
        let Some(window) = bucket.get(window_name).filter(|value| value.is_object()) else {
            continue;
        };
        let prefix = if primary_bucket {
            "codex".to_owned()
        } else {
            format!("bucket-{bucket_index}")
        };
        let id = format!("{prefix}-{window_name}");
        let label = if primary_bucket {
            format!("Codex · {window_name}")
        } else {
            format!("Bucket {bucket_index} · {window_name}")
        };
        let remaining_percent = window
            .get("usedPercent")
            .and_then(Value::as_f64)
            .filter(|value| value.is_finite() && (0.0..=100.0).contains(value))
            .map(|used_percent| 100.0 - used_percent);
        let reset_at_ms = window
            .get("resetsAt")
            .and_then(Value::as_f64)
            .filter(|seconds| seconds.is_finite() && *seconds >= 0.0)
            .map(|seconds| seconds * 1000.0)
            .filter(|milliseconds| {
                milliseconds.is_finite() && *milliseconds <= MAX_SAFE_JS_INTEGER as f64
            })
            .map(|milliseconds| milliseconds.round() as u64);
        let window_duration_mins = window
            .get("windowDurationMins")
            .and_then(Value::as_f64)
            .filter(|minutes| minutes.is_finite() && *minutes >= 0.0);
        windows.push(QuotaWindow {
            id,
            name: label,
            remaining_percent,
            reset_at_ms,
            window_duration_mins,
        });
    }
}

fn now_ms() -> Option<u64> {
    let milliseconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis();
    if milliseconds > u128::from(MAX_SAFE_JS_INTEGER) {
        return None;
    }
    Some(milliseconds as u64)
}

struct OwnedChild {
    child: Child,
    #[cfg(windows)]
    job: WindowsJob,
}

impl OwnedChild {
    fn spawn(command: &mut Command) -> std::io::Result<Self> {
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt as _;
            command.process_group(0);
        }

        let child = command.spawn()?;
        #[cfg(windows)]
        let (child, job) = {
            let mut child = child;
            let job = match WindowsJob::attach(child.id()) {
                Ok(job) => job,
                Err(error) => {
                    terminate_child(&mut child);
                    return Err(error);
                }
            };
            (child, job)
        };
        Ok(Self {
            child,
            #[cfg(windows)]
            job,
        })
    }

    fn try_wait(&mut self) -> std::io::Result<Option<std::process::ExitStatus>> {
        self.child.try_wait()
    }

    fn terminate(&mut self) {
        #[cfg(unix)]
        unsafe {
            let _ = libc::kill(-(self.child.id() as i32), libc::SIGKILL);
        }

        #[cfg(windows)]
        self.job.terminate();

        terminate_child(&mut self.child);
    }
}

impl Drop for OwnedChild {
    fn drop(&mut self) {
        self.terminate();
    }
}

#[cfg(windows)]
struct WindowsJob(windows_sys::Win32::Foundation::HANDLE);

#[cfg(windows)]
unsafe impl Send for WindowsJob {}

#[cfg(windows)]
impl WindowsJob {
    fn attach(process_id: u32) -> std::io::Result<Self> {
        use std::mem::{size_of, zeroed};
        use std::ptr::null;
        use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
        use windows_sys::Win32::System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        };
        use windows_sys::Win32::System::Threading::{
            OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE,
        };

        let job = unsafe { CreateJobObjectW(null(), null()) };
        if job.is_null() {
            return Err(std::io::Error::last_os_error());
        }

        let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { zeroed() };
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = unsafe {
            SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &mut limits as *mut _ as *mut _,
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };
        if configured == 0 {
            unsafe {
                CloseHandle(job);
            }
            return Err(std::io::Error::last_os_error());
        }

        let process = unsafe { OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, process_id) };
        if process.is_null() {
            unsafe {
                TerminateJobObject(job, 1);
                CloseHandle(job);
            }
            return Err(std::io::Error::last_os_error());
        }
        let assigned = unsafe { AssignProcessToJobObject(job, process) };
        unsafe {
            CloseHandle(process as HANDLE);
        }
        if assigned == 0 {
            unsafe {
                TerminateJobObject(job, 1);
                CloseHandle(job);
            }
            return Err(std::io::Error::last_os_error());
        }
        Ok(Self(job))
    }

    fn terminate(&self) {
        use windows_sys::Win32::System::JobObjects::TerminateJobObject;
        unsafe {
            let _ = TerminateJobObject(self.0, 1);
        }
    }
}

#[cfg(windows)]
impl Drop for WindowsJob {
    fn drop(&mut self) {
        use windows_sys::Win32::Foundation::CloseHandle;
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

fn terminate_child(child: &mut Child) {
    match child.try_wait() {
        Ok(Some(_)) => {}
        _ => {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn ensure_main_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Codex commands are only available to the main window".to_owned())
    }
}

#[tauri::command]
pub(crate) async fn codex_connect(
    window: WebviewWindow,
    bridge: State<'_, CodexBridge>,
) -> Result<CodexSnapshot, String> {
    ensure_main_window(&window)?;
    let bridge = bridge.inner().clone();
    tauri::async_runtime::spawn_blocking(move || bridge.connect())
        .await
        .map_err(|_| "Codex connection operation failed".to_owned())
}

#[tauri::command]
pub(crate) async fn codex_refresh(
    window: WebviewWindow,
    bridge: State<'_, CodexBridge>,
) -> Result<CodexSnapshot, String> {
    ensure_main_window(&window)?;
    let bridge = bridge.inner().clone();
    tauri::async_runtime::spawn_blocking(move || bridge.refresh())
        .await
        .map_err(|_| "Codex refresh operation failed".to_owned())
}

#[tauri::command]
pub(crate) async fn codex_disconnect(
    window: WebviewWindow,
    bridge: State<'_, CodexBridge>,
) -> Result<CodexSnapshot, String> {
    ensure_main_window(&window)?;
    let bridge = bridge.inner().clone();
    tauri::async_runtime::spawn_blocking(move || bridge.disconnect())
        .await
        .map_err(|_| "Codex disconnect operation failed".to_owned())
}

#[tauri::command]
pub(crate) fn codex_status(
    window: WebviewWindow,
    bridge: State<'_, CodexBridge>,
) -> Result<CodexSnapshot, String> {
    ensure_main_window(&window)?;
    Ok(bridge.status())
}

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn normalization_is_generic_and_rejects_invalid_values() {
        let result = json!({
            "rateLimitsByLimitId": {
                "codex": {
                    "limitName": "Private account label",
                    "primary": { "usedPercent": 25.0, "resetsAt": 1_700_000_000.0, "windowDurationMins": 300 },
                    "secondary": { "usedPercent": 101, "resetsAt": -1, "windowDurationMins": "long" }
                },
                "private-provider-id": {
                    "primary": { "usedPercent": 10 }
                }
            }
        });
        let windows = normalize_rate_limits(&result, 1);
        assert_eq!(windows.len(), 3);
        let primary = windows
            .iter()
            .find(|window| window.id == "codex-primary")
            .expect("codex primary window");
        assert_eq!(primary.remaining_percent, Some(75.0));
        assert_eq!(primary.reset_at_ms, Some(1_700_000_000_000));
        assert_eq!(primary.window_duration_mins, Some(300.0));
        let secondary = windows
            .iter()
            .find(|window| window.id == "codex-secondary")
            .expect("codex secondary window");
        assert_eq!(secondary.remaining_percent, None);
        assert_eq!(secondary.reset_at_ms, None);
        let serialized = serde_json::to_string(&windows).expect("serialize safe windows");
        assert!(!serialized.contains("private-provider-id"));
        assert!(!serialized.contains("Private account label"));
        assert!(serialized.contains("Codex · primary"));
        assert!(serialized.contains("Bucket 2 · primary"));
    }

    #[test]
    fn legacy_bucket_and_missing_windows_are_handled_safely() {
        let result = json!({
            "rateLimits": {
                "primary": { "usedPercent": 0 },
                "limitName": "sensitive label"
            }
        });
        let windows = normalize_rate_limits(&result, 1);
        assert_eq!(windows.len(), 1);
        assert_eq!(windows[0].remaining_percent, Some(100.0));
        assert_eq!(windows[0].id, "codex-primary");
    }

    #[test]
    fn used_percent_conversion_covers_boundaries_and_invalid_values() {
        for (used, expected) in [
            (0.0, Some(100.0)),
            (10.0, Some(90.0)),
            (25.0, Some(75.0)),
            (100.0, Some(0.0)),
            (101.0, None),
        ] {
            let result = json!({ "rateLimits": { "primary": { "usedPercent": used } } });
            let windows = normalize_rate_limits(&result, 1);
            assert_eq!(windows[0].remaining_percent, expected, "usedPercent={used}");
            assert_eq!(has_invalid_used_percent(&result), used > 100.0);
        }
        for invalid in [json!("NaN"), Value::Null] {
            let result = json!({
                "rateLimits": { "primary": { "usedPercent": invalid } }
            });
            assert_eq!(normalize_rate_limits(&result, 1)[0].remaining_percent, None);
            assert!(has_invalid_used_percent(&result));
        }
    }

    #[test]
    fn unknown_limit_ids_are_generic_and_malformed_maps_do_not_fall_back() {
        let unknown = json!({
            "rateLimitsByLimitId": {
                "private-id": { "primary": { "usedPercent": 10 } }
            }
        });
        let windows = normalize_rate_limits(&unknown, 1);
        assert_eq!(windows[0].id, "bucket-1-primary");
        assert_eq!(windows[0].name, "Bucket 1 · primary");

        let unknown_legacy = json!({
            "rateLimits": {
                "limitId": "private-codex-bucket",
                "primary": { "usedPercent": 10 }
            }
        });
        let windows = normalize_rate_limits(&unknown_legacy, 1);
        assert_eq!(windows[0].id, "bucket-1-primary");
        assert_eq!(windows[0].name, "Bucket 1 · primary");

        let malformed = json!({
            "rateLimitsByLimitId": "invalid",
            "rateLimits": { "primary": { "usedPercent": 10 } }
        });
        assert!(normalize_rate_limits(&malformed, 1).is_empty());
    }

    #[test]
    fn account_notification_invalidates_and_rate_notification_only_marks_stale() {
        let mut snapshot = CodexSnapshot::disconnected();
        snapshot.connection_status = ConnectionStatus::Connected;
        snapshot.data_status = DataStatus::Current;
        snapshot.windows.push(QuotaWindow {
            id: "codex-primary".to_owned(),
            name: "Codex · primary".to_owned(),
            remaining_percent: Some(80.0),
            reset_at_ms: None,
            window_duration_mins: None,
        });
        snapshot.fetched_at_ms = Some(123);
        let shared = Arc::new(Mutex::new(snapshot));

        handle_notification(
            "account/rateLimits/updated",
            &json!({
                "jsonrpc": "2.0", "method": "account/rateLimits/updated",
                "params": { "rateLimits": { "primary": { "usedPercent": 99 } } }
            }),
            &shared,
        );
        {
            let snapshot = lock_snapshot(&shared);
            assert_eq!(snapshot.data_status, DataStatus::Stale);
            assert_eq!(snapshot.windows[0].remaining_percent, Some(80.0));
        }

        handle_notification(
            "account/updated",
            &json!({
                "jsonrpc": "2.0", "method": "account/updated", "params": {}
            }),
            &shared,
        );
        let snapshot = lock_snapshot(&shared);
        assert!(snapshot.windows.is_empty());
        assert_eq!(snapshot.fetched_at_ms, None);
        assert_eq!(snapshot.data_status, DataStatus::Unknown);
    }

    #[test]
    fn invalid_percentage_is_returned_as_a_static_diagnostic() {
        let snapshot = Arc::new(Mutex::new(CodexSnapshot::disconnected()));
        let result = json!({
            "rateLimits": {
                "primary": { "usedPercent": 120, "resetsAt": 1_700_000_000 }
            }
        });
        apply_rate_limit_result(&snapshot, &result).expect("normalize fake rate-limit response");
        let snapshot = lock_snapshot(&snapshot);
        assert_eq!(snapshot.data_status, DataStatus::Unknown);
        assert_eq!(snapshot.windows[0].remaining_percent, None);
        assert_eq!(snapshot.windows[0].reset_at_ms, Some(1_700_000_000_000));
        assert_eq!(snapshot.diagnostic, Some("invalidQuotaValue"));
    }

    #[test]
    fn missing_and_malformed_window_shapes_report_a_static_diagnostic() {
        for result in [
            json!({ "rateLimits": { "unexpected": true } }),
            json!({ "rateLimits": { "primary": null, "secondary": null } }),
        ] {
            let snapshot = Arc::new(Mutex::new(CodexSnapshot::disconnected()));
            apply_rate_limit_result(&snapshot, &result).expect("normalize missing windows");
            let snapshot = lock_snapshot(&snapshot);
            assert_eq!(snapshot.data_status, DataStatus::Unknown);
            assert_eq!(snapshot.diagnostic, None);
        }
        for result in [
            json!({ "rateLimits": { "primary": "invalid" } }),
            json!({ "rateLimitsByLimitId": { "opaque": null } }),
        ] {
            let snapshot = Arc::new(Mutex::new(CodexSnapshot::disconnected()));
            apply_rate_limit_result(&snapshot, &result).expect("normalize malformed shape");
            let snapshot = lock_snapshot(&snapshot);
            assert_eq!(snapshot.diagnostic, Some("invalidQuotaValue"));
        }
    }

    #[test]
    fn excessive_limit_buckets_are_bounded_and_marked_unknown() {
        let mut buckets = serde_json::Map::new();
        for index in 0..=MAX_BUCKETS {
            buckets.insert(
                format!("opaque-{index}"),
                json!({ "primary": { "usedPercent": 10 } }),
            );
        }
        let result = json!({ "rateLimitsByLimitId": buckets });
        let snapshot = Arc::new(Mutex::new(CodexSnapshot::disconnected()));
        apply_rate_limit_result(&snapshot, &result).expect("normalize bounded rate limits");
        let snapshot = lock_snapshot(&snapshot);
        assert_eq!(snapshot.windows.len(), MAX_BUCKETS);
        assert_eq!(snapshot.data_status, DataStatus::Unknown);
        assert_eq!(snapshot.diagnostic, Some("tooManyQuotaBuckets"));
    }

    #[test]
    fn frame_reader_handles_valid_malformed_and_oversized_jsonl() {
        let input = b"{\"id\":1,\"result\":{}}\nnot-json\n".to_vec();
        let stream = start_frame_reader(Cursor::new(input)).expect("reader");
        assert!(stream.frames.recv().expect("valid frame").is_ok());
        assert!(matches!(
            stream.frames.recv().expect("malformed frame"),
            Err(FrameError::Malformed)
        ));
        let _ = stream.reader.join();

        let nan = b"{\"usedPercent\":NaN}\n".to_vec();
        let stream = start_frame_reader(Cursor::new(nan)).expect("reader");
        assert!(matches!(
            stream.frames.recv().expect("malformed NaN JSON"),
            Err(FrameError::Malformed)
        ));
        let _ = stream.reader.join();

        let oversized = vec![b'a'; MAX_FRAME_BYTES + 1];
        let stream = start_frame_reader(Cursor::new(oversized)).expect("reader");
        assert!(matches!(
            stream.frames.recv().expect("oversized frame"),
            Err(FrameError::Oversized)
        ));
        let _ = stream.reader.join();
    }

    #[test]
    fn rpc_response_timeout_exit_and_interruption_are_bounded() {
        let (frames_tx, frames_rx) = mpsc::sync_channel(MAX_QUEUED_FRAMES);
        let cancel = Arc::new(AtomicBool::new(false));
        let stream = FrameStream {
            frames: frames_rx,
            overflowed: Arc::new(AtomicBool::new(false)),
            reader: thread::spawn(|| {}),
        };
        let (mut rpc, reader) = RpcConnection::new(
            Vec::new(),
            stream,
            Arc::clone(&cancel),
            Arc::new(Mutex::new(CodexSnapshot::disconnected())),
        );
        // A disconnected frame source is an immediate process-exit result.
        drop(frames_tx);
        assert!(matches!(
            rpc.request_with_timeout("x", None, Duration::from_millis(10)),
            Err(BridgeFailure::ProcessExited)
        ));
        let _ = reader.join();

        let (_frames_tx, frames_rx) = mpsc::sync_channel(MAX_QUEUED_FRAMES);
        let stream = FrameStream {
            frames: frames_rx,
            overflowed: Arc::new(AtomicBool::new(false)),
            reader: thread::spawn(|| {}),
        };
        let (mut rpc, reader) = RpcConnection::new(
            Vec::new(),
            stream,
            Arc::clone(&cancel),
            Arc::new(Mutex::new(CodexSnapshot::disconnected())),
        );
        cancel.store(true, Ordering::Relaxed);
        assert!(matches!(
            rpc.request_with_timeout("x", None, Duration::from_millis(10)),
            Err(BridgeFailure::Interrupted)
        ));
        let _ = reader.join();

        let (_frames_tx, frames_rx) = mpsc::sync_channel(MAX_QUEUED_FRAMES);
        let stream = FrameStream {
            frames: frames_rx,
            overflowed: Arc::new(AtomicBool::new(false)),
            reader: thread::spawn(|| {}),
        };
        let (mut rpc, reader) = RpcConnection::new(
            Vec::new(),
            stream,
            Arc::new(AtomicBool::new(false)),
            Arc::new(Mutex::new(CodexSnapshot::disconnected())),
        );
        cancel.store(false, Ordering::Relaxed);
        assert!(matches!(
            rpc.request_with_timeout("x", None, Duration::from_millis(10)),
            Err(BridgeFailure::TimedOut)
        ));
        let _ = reader.join();
    }

    #[test]
    fn protocol_accepts_documented_headerless_frames_and_tracks_startup_account_changes() {
        let input = b"{\"method\":\"account/updated\",\"params\":{}}\n{\"id\":1,\"result\":{\"account\":{\"type\":\"chatgpt\"}}}\n".to_vec();
        let stream = start_frame_reader(Cursor::new(input)).expect("fake app-server frames");
        let snapshot = Arc::new(Mutex::new(CodexSnapshot::disconnected()));
        {
            let mut initial = lock_snapshot(&snapshot);
            initial.connection_status = ConnectionStatus::Connected;
            initial.windows.push(QuotaWindow {
                id: "codex-primary".to_owned(),
                name: "Codex · primary".to_owned(),
                remaining_percent: Some(25.0),
                reset_at_ms: None,
                window_duration_mins: None,
            });
        }
        let (mut rpc, reader) = RpcConnection::new(
            Vec::new(),
            stream,
            Arc::new(AtomicBool::new(false)),
            Arc::clone(&snapshot),
        );
        let before = rpc.account_generation;
        let result = rpc
            .request("account/read", Some(json!({ "refreshToken": false })))
            .expect("fake account result");
        assert_eq!(account_from_result(&result), Ok(Some(AccountKind::ChatGpt)));
        assert_eq!(
            validate_account_generation(before, rpc.account_generation, &snapshot),
            Err(BridgeFailure::AccountChanged)
        );
        assert!(lock_snapshot(&snapshot).windows.is_empty());
        let written: Value =
            serde_json::from_slice(&rpc.writer).expect("outgoing JSON-RPC request");
        assert_eq!(
            written.get("method").and_then(Value::as_str),
            Some("account/read")
        );
        assert!(written.get("jsonrpc").is_none());
        let _ = reader.join();
    }

    #[test]
    fn frame_queue_saturation_fails_closed_without_unbounded_buffering() {
        let input = (0..=MAX_QUEUED_FRAMES)
            .map(|_| "{\"method\":\"account/rateLimits/updated\"}\n")
            .collect::<String>()
            .into_bytes();
        let stream = start_frame_reader(Cursor::new(input)).expect("fake notifications");
        let (mut rpc, reader) = RpcConnection::new(
            Vec::new(),
            stream,
            Arc::new(AtomicBool::new(false)),
            Arc::new(Mutex::new(CodexSnapshot::disconnected())),
        );
        let _ = reader.join();
        assert!(rpc.overflowed.load(Ordering::Relaxed));
        assert!(matches!(
            rpc.request_with_timeout("account/read", None, Duration::from_millis(10)),
            Err(BridgeFailure::FrameQueueOverflow)
        ));
    }

    #[test]
    fn terminate_child_kills_and_reaps_a_fake_process() {
        let executable = env::current_exe().expect("test executable");
        let mut child = Command::new(executable)
            .arg("--list")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("fake process");
        terminate_child(&mut child);
        assert!(child.try_wait().expect("reaped status").is_some());
    }

    #[test]
    fn safe_timestamp_rejects_values_outside_javascript_range() {
        let result = json!({
            "rateLimits": {
                "primary": { "resetsAt": 9_000_000_000_000.0 }
            }
        });
        let windows = normalize_rate_limits(&result, 1);
        assert_eq!(windows[0].reset_at_ms, None);
    }

    #[test]
    fn live_connect_stays_closed_until_startup_policy_is_verified() {
        let bridge = CodexBridge::default();
        let snapshot = bridge.connect();
        assert_eq!(snapshot.connection_status, ConnectionStatus::Incompatible);
        assert_eq!(snapshot.data_status, DataStatus::Unknown);
        assert_eq!(snapshot.diagnostic, Some("startupPolicyUnverified"));
        assert!(snapshot.windows.is_empty());
        assert_eq!(bridge.status().diagnostic, Some("startupPolicyUnverified"));
        assert_eq!(
            bridge.disconnect().connection_status,
            ConnectionStatus::Disconnected
        );
    }

    #[test]
    fn account_results_are_reduced_to_supported_kinds_only() {
        assert_eq!(account_from_result(&json!({ "account": null })), Ok(None));
        assert_eq!(
            account_from_result(&json!({
                "account": { "type": "chatgpt", "email": "private@example.test", "accessToken": "secret" }
            })),
            Ok(Some(AccountKind::ChatGpt))
        );
        assert_eq!(
            account_from_result(&json!({ "account": { "type": "apiKey" } })),
            Ok(Some(AccountKind::ApiKey))
        );
        assert_eq!(
            validate_rate_limit_account(AccountKind::ApiKey),
            Err(BridgeFailure::UnsupportedAccount)
        );
        assert_eq!(
            account_from_result(&json!({ "account": { "type": "amazonBedrock" } })),
            Err(BridgeFailure::UnsupportedAccount)
        );

        let serialized = serde_json::to_string(&CodexSnapshot::disconnected())
            .expect("serialize sanitized snapshot");
        assert!(!serialized.contains("private@example.test"));
        assert!(!serialized.contains("secret"));
    }

    #[test]
    fn version_allowlist_is_checked_with_synthetic_output() {
        assert_eq!(check_supported_codex_version("codex-cli 0.164.0"), Ok(()));
        assert_eq!(
            check_supported_codex_version("codex-cli 0.164.1"),
            Err(BridgeFailure::UnsupportedVersion)
        );
        assert_eq!(
            check_supported_codex_version(""),
            Err(BridgeFailure::UnsupportedVersion)
        );
    }

    #[test]
    fn disconnect_clears_cached_quota_without_fallback() {
        let bridge = CodexBridge::default();
        {
            let mut snapshot = lock_snapshot(&bridge.snapshot);
            snapshot.connection_status = ConnectionStatus::Connected;
            snapshot.data_status = DataStatus::Current;
            snapshot.fetched_at_ms = Some(123);
            snapshot.windows.push(QuotaWindow {
                id: "codex-primary".to_owned(),
                name: "Codex · primary".to_owned(),
                remaining_percent: Some(50.0),
                reset_at_ms: None,
                window_duration_mins: None,
            });
        }
        let disconnected = bridge.disconnect();
        assert_eq!(
            disconnected.connection_status,
            ConnectionStatus::Disconnected
        );
        assert_eq!(disconnected.data_status, DataStatus::Unknown);
        assert!(disconnected.windows.is_empty());
        assert_eq!(disconnected.fetched_at_ms, None);
        assert_eq!(
            bridge.refresh().connection_status,
            ConnectionStatus::Disconnected
        );
    }

    #[test]
    fn snapshot_serializes_only_the_frontend_dto_fields() {
        let value = serde_json::to_value(CodexSnapshot::disconnected())
            .expect("serialize frontend snapshot");
        let keys = value
            .as_object()
            .expect("snapshot object")
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>();
        assert_eq!(
            keys,
            [
                "connectionStatus",
                "dataStatus",
                "diagnostic",
                "displayLabel",
                "fetchedAtMs",
                "providerId",
                "source",
                "windows"
            ]
        );
    }
}
