//! Consent-gated, pinned Windows stdio quota client.
use super::*;
use crate::codex::watchdog::{Deadline, IoWatchdog};
use std::io::Write;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::thread::JoinHandle;
#[path = "stdio_image.rs"]
mod image;
#[path = "stdio_network.rs"]
mod network;

// Reviewed Codex program only; source tag 6905ecede7816e91373e9eabda3f6b0368fc747b.
pub(super) const AUDITED_IMAGE_SHA256: &str =
    "1103e9e09c71fa2cd0afd6d8f3b9a2d63174fe8efd7cb5bd09f1cb14ef58a098";
const STARTUP_TIMEOUT: Duration = Duration::from_secs(30);
const MARKER: &str = "CODEX_INTERNAL_APP_SERVER_REMOTE_CONTROL_DISABLED";
const ARGS: &[&str] = &[
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
    "--config",
    "chatgpt_base_url=\"https://chatgpt.com/backend-api/\"",
    "--config",
    "features.respect_system_proxy=false",
    "--config",
    "features.system_proxy_fallback=false",
    "--strict-config",
    "app-server",
    "--listen",
    "stdio://",
];
pub(super) fn consent_message() -> &'static str {
    "Start a temporary, supervised Codex App Server using your existing system sign-in for read-only quota? Quotafern verifies and runs its reviewed private Codex 0.164.0-alpha.11.1 program copy, retaining that version when your system CLI updates. No system program is downgraded and no credentials are copied. Quotafern will not read tokens or change existing permissions. Codex may renew authentication and write its own sign-in state, fetch cloud configuration and refresh its model catalogue. Quotafern forces Remote Control off on the audited version and verifies its status. Initialization and account reads may check account/workspace routing. Only initialization, Remote Control status, account status and quota reads are sent over private stdin/stdout. Quotafern checks for unexpected listeners in its owned process tree without recording network addresses, ports or payloads. Each process is terminated after its request. While connected, Quotafern repeats these read-only checks automatically every three minutes. Disconnect cancels owned processes, stops refresh and revokes remembered permission. Quit stops current monitoring; future access requires new consent or explicitly remembered permission."
}
pub(super) fn managed_login(
    bridge: &DirectBridge,
    operation: &Operation,
    profile: &Path,
) -> Result<(), Failure> {
    if operation.kind != DirectKind::Managed {
        return Err(Failure::UnsupportedAuth);
    }
    let (executable, _directories, _image) = image::verified_executable(
        profile,
        &operation.cancelled,
        Instant::now() + LOGIN_TIMEOUT,
    )?;
    let environment = image::environment(
        &operation.home,
        executable.parent().ok_or(Failure::RpcPeerUnsafe)?,
    )?;
    super::run_login_with_environment(bridge, operation, &executable, &environment)
}

fn disabled(value: &Value) -> Result<(), Failure> {
    if value.get("status").and_then(Value::as_str) == Some("disabled") {
        Ok(())
    } else {
        Err(Failure::RpcRemoteControlUnsafe)
    }
}
// Workspace, user identity and plan remain native; only sanitized quota crosses IPC.
type AccountBinding = (String, String, String);
fn bound_account(value: &Value) -> Result<AccountBinding, Failure> {
    let (email, plan) = rpc_snapshot::account(value)?;
    let id = value
        .get("workspaceRouting")
        .and_then(|v| v.get("chatgptAccountId"))
        .and_then(Value::as_str)
        .filter(|v| !v.is_empty() && v.len() <= 1024)
        .ok_or(Failure::RpcIdentityUnavailable)?;
    Ok((id.into(), email, plan))
}
fn bind_quota(
    before: &AccountBinding,
    after: &AccountBinding,
    usage: &Value,
    previous: Option<&str>,
) -> Result<Zeroizing<String>, Failure> {
    let id = usage
        .get("accountId")
        .and_then(Value::as_str)
        .filter(|v| !v.is_empty() && v.len() <= 1024)
        .ok_or(Failure::RpcIdentityUnavailable)?;
    if before != after || before.0 != id {
        return Err(Failure::IdentityChanged);
    }
    let identity = Zeroizing::new(serde_json::to_string(before).map_err(|_| Failure::Schema)?);
    if previous.is_some_and(|old| old != identity.as_str()) {
        return Err(Failure::IdentityChanged);
    }
    Ok(identity)
}

#[derive(Clone)]
struct FirstFailure {
    value: Arc<Mutex<Option<Failure>>>,
    outcome: Arc<std::sync::atomic::AtomicU8>,
}
impl FirstFailure {
    fn new(outcome: Arc<std::sync::atomic::AtomicU8>) -> Self {
        Self {
            value: Arc::new(Mutex::new(None)),
            outcome,
        }
    }
    fn lock(&self) -> std::sync::LockResult<std::sync::MutexGuard<'_, Option<Failure>>> {
        self.value.lock()
    }
}
fn record_failure(first: &FirstFailure, stop: &AtomicBool, failure: Failure) {
    if let Ok(mut value) = first.lock() {
        if value.is_none() {
            *value = Some(failure);
        }
    }
    if !failure.retryable() && failure != Failure::Cancelled {
        first.outcome.store(1, Ordering::SeqCst);
    }
    stop.store(true, Ordering::SeqCst);
}
struct PipeRpc {
    input: fs::File,
    frames: Receiver<Result<Value, Failure>>,
    cancel: Arc<AtomicBool>,
    caller_cancel: Arc<AtomicBool>,
    failure: FirstFailure,
    policy: Arc<AtomicBool>,
    deadline: Instant,
    next: u64,
    notifications: u32,
    checks: u32,
    identity_guard: bool,
}
impl PipeRpc {
    fn check(&self) -> Result<(), Failure> {
        if let Some(failure) = *self.failure.lock().map_err(|_| Failure::RpcStartupFailed)? {
            return Err(failure);
        }
        if self.policy.load(Ordering::SeqCst) {
            return Err(Failure::RpcRemoteControlUnsafe);
        }
        check_cancel(&self.caller_cancel)?;
        if Instant::now() >= self.deadline {
            return Err(Failure::Timeout);
        }
        if self.cancel.load(Ordering::SeqCst) {
            return Err(Failure::RpcStartupFailed);
        }
        Ok(())
    }
    fn send(&mut self, value: Value) -> Result<(), Failure> {
        self.check()?;
        let bytes = serde_json::to_vec(&value).map_err(|_| Failure::RpcProtocol)?;
        self.input
            .write_all(&bytes)
            .and_then(|_| self.input.write_all(b"\n"))
            .and_then(|_| self.input.flush())
            .map_err(|_| Failure::RpcStartupFailed)
    }
    fn status(&mut self) -> Result<(), Failure> {
        let value = self.request("remoteControl/status/read", Value::Null)?;
        if let Err(error) = disabled(&value) {
            self.failure.outcome.store(1, Ordering::SeqCst);
            return Err(error);
        }
        self.checks += 1;
        Ok(())
    }
    fn request(&mut self, method: &str, params: Value) -> Result<Value, Failure> {
        if !matches!(
            method,
            "initialize" | "remoteControl/status/read" | "account/read" | "account/rateLimits/read"
        ) {
            return Err(Failure::RpcProtocol);
        }
        // Explicit provider reads require a verified disabled Remote Control status.
        if matches!(method, "account/read" | "account/rateLimits/read") && self.checks == 0 {
            return Err(Failure::RpcProtocol);
        }
        if method == "account/rateLimits/read" && !self.identity_guard {
            return Err(Failure::RpcProtocol);
        }
        self.next += 1;
        let id = self.next;
        let mut request = serde_json::json!({"id":id,"method":method});
        if !params.is_null() {
            request["params"] = params;
        }
        self.send(request)?;
        loop {
            self.check()?;
            match self.frames.recv_timeout(Duration::from_millis(25)) {
                Ok(Ok(value)) => {
                    if let Some(method) = value.get("method") {
                        if value.get("id").is_some() {
                            return Err(Failure::RpcProtocol);
                        }
                        let method = method.as_str().ok_or(Failure::RpcProtocol)?;
                        if method == "remoteControl/status/changed" {
                            disabled(value.get("params").ok_or(Failure::RpcRemoteControlUnsafe)?)?;
                            self.notifications += 1;
                        }
                        if self.identity_guard
                            && (method == "account/updated"
                                || method.starts_with("account/login")
                                || method.starts_with("account/logout"))
                        {
                            return Err(Failure::IdentityChanged);
                        }
                        continue;
                    }
                    if value.get("id").and_then(Value::as_u64) != Some(id) {
                        return Err(Failure::RpcProtocol);
                    }
                    if value.get("error").is_some() {
                        self.failure.outcome.store(1, Ordering::SeqCst);
                        return Err(Failure::RpcProviderFailed);
                    }
                    return value
                        .get("result")
                        .cloned()
                        .filter(Value::is_object)
                        .ok_or(Failure::RpcProtocol);
                }
                Ok(Err(error)) => return Err(error),
                Err(RecvTimeoutError::Timeout) => continue,
                Err(_) => return Err(Failure::RpcStartupFailed),
            }
        }
    }
}
type FrameReader = (Receiver<Result<Value, Failure>>, JoinHandle<()>);
fn reader(
    mut output: fs::File,
    cancel: Arc<AtomicBool>,
    policy: Arc<AtomicBool>,
    failure: FirstFailure,
) -> Result<FrameReader, Failure> {
    let (tx, rx) = mpsc::sync_channel(8);
    let handle = std::thread::Builder::new()
        .name("quotafern-private-stdio-reader".into())
        .spawn(move || {
            let mut frame = Vec::new();
            let mut chunk = [0u8; 4096];
            let mut count = 0;
            loop {
                let read = match output.read(&mut chunk) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => n,
                };
                for byte in &chunk[..read] {
                    if *byte == b'\n' {
                        if frame.is_empty() {
                            continue;
                        }
                        count += 1;
                        let value = if count > 128 {
                            Err(Failure::RpcProtocol)
                        } else {
                            serde_json::from_slice::<Value>(&frame)
                                .map_err(|_| Failure::RpcProtocol)
                        };
                        frame.clear();
                        if let Ok(value) = &value {
                            // Record terminal provider failure before the consumer can race Quit.
                            if value.get("error").is_some() {
                                record_failure(&failure, &cancel, Failure::RpcProviderFailed);
                                return;
                            }
                            if value.get("method").and_then(Value::as_str)
                                == Some("remoteControl/status/changed")
                                && disabled(value.get("params").unwrap_or(&Value::Null)).is_err()
                            {
                                policy.store(true, Ordering::SeqCst);
                                record_failure(&failure, &cancel, Failure::RpcRemoteControlUnsafe);
                                return;
                            }
                        }
                        if let Err(error) = &value {
                            record_failure(&failure, &cancel, *error);
                            return;
                        }
                        if tx.try_send(value).is_err() || count > 128 {
                            record_failure(&failure, &cancel, Failure::RpcProtocol);
                            return;
                        }
                    } else {
                        frame.push(*byte);
                        if frame.len() > MAX_BODY {
                            let _ = tx.try_send(Err(Failure::ResponseTooLarge));
                            record_failure(&failure, &cancel, Failure::ResponseTooLarge);
                            return;
                        }
                    }
                }
            }
        })
        .map_err(|_| Failure::RpcStartupFailed)?;
    Ok((rx, handle))
}
struct Owned {
    child: Arc<Mutex<SupervisedChild>>,
    reader: Option<JoinHandle<()>>,
    monitor: network::Monitor,
    _watchdog: IoWatchdog,
}
impl Owned {
    fn close(&mut self) -> Result<(), Failure> {
        self.monitor.stop();
        self.child
            .lock()
            .map_err(|_| Failure::RpcCleanupFailed)?
            .terminate()
            .map_err(|_| Failure::RpcCleanupFailed)?;
        if !self
            .child
            .lock()
            .map_err(|_| Failure::RpcCleanupFailed)?
            .process_ids()
            .map_err(|_| Failure::RpcCleanupFailed)?
            .is_empty()
        {
            return Err(Failure::RpcCleanupFailed);
        }
        if let Some(reader) = self.reader.take() {
            reader.join().map_err(|_| Failure::RpcCleanupFailed)?;
        }
        Ok(())
    }
}
impl Drop for Owned {
    fn drop(&mut self) {
        let _ = self.close();
    }
}
pub(super) fn fetch(
    profile: &Path,
    bridge: &DirectBridge,
    operation: &Operation,
) -> Result<(Value, Zeroizing<String>), Failure> {
    let deadline = Instant::now() + STARTUP_TIMEOUT;
    check_cancel(&operation.cancelled)?;
    let _home = windows_security::verify_system_home(&operation.home)
        .map_err(|_| Failure::RpcEndpointUnsafe)?;
    let (executable, _directories, _image) =
        image::verified_executable(profile, &operation.cancelled, deadline)?;
    let directory = executable.parent().ok_or(Failure::RpcPeerUnsafe)?;
    let environment = image::environment(&operation.home, directory)?;
    let child = {
        let mut inner = bridge.0.lock().map_err(|_| Failure::Cancelled)?;
        let session = inner
            .sessions
            .get_mut(&operation.connection)
            .ok_or(Failure::Cancelled)?;
        if session.snapshot.generation != operation.generation
            || session.snapshot.account_id != operation.account
            || session.kind != DirectKind::System
        {
            return Err(Failure::Cancelled);
        }
        check_cancel(&operation.cancelled)?;
        let child = Arc::new(Mutex::new(
            SupervisedChild::spawn_with_environment(
                &executable,
                ARGS,
                InputMode::Pipe,
                OutputMode::Pipe,
                Some(&environment),
                Some(directory),
            )
            .map_err(|_| Failure::RpcStartupFailed)?,
        ));
        session.login = Some(child.clone());
        child
    };
    let policy = Arc::new(AtomicBool::new(false));
    let internal_stop = Arc::new(AtomicBool::new(false));
    let failure = FirstFailure::new(operation.outcome.clone());
    let shared_deadline: Deadline = Arc::new(Mutex::new(Some(deadline)));
    let mut child_lock = child.lock().map_err(|_| Failure::RpcStartupFailed)?;
    let watchdog = IoWatchdog::start_with_parent_cancel(
        child_lock.terminate_handle(),
        internal_stop.clone(),
        Some(operation.cancelled.clone()),
        shared_deadline,
    )
    .map_err(|_| Failure::RpcStartupFailed)?;
    let input = child_lock.take_stdin().ok_or(Failure::RpcStartupFailed)?;
    let output = child_lock.take_stdout().ok_or(Failure::RpcStartupFailed)?;
    drop(child_lock);
    let monitor = network::Monitor::start(
        child.clone(),
        internal_stop.clone(),
        policy.clone(),
        failure.clone(),
    )?;
    let (frames, reader) = reader(
        output,
        internal_stop.clone(),
        policy.clone(),
        failure.clone(),
    )?;
    let mut owned = Owned {
        child,
        reader: Some(reader),
        monitor,
        _watchdog: watchdog,
    };
    let mut rpc = PipeRpc {
        input,
        frames,
        cancel: internal_stop,
        caller_cancel: operation.cancelled.clone(),
        failure,
        policy,
        deadline,
        next: 0,
        notifications: 0,
        checks: 0,
        identity_guard: false,
    };
    let result: Result<(Value, Zeroizing<String>), Failure> = (|| {
        rpc.request("initialize",serde_json::json!({"clientInfo":{"name":"quotafern","title":"Quotafern","version":"0.1.0"},"capabilities":{"experimentalApi":true}}))?;
        rpc.send(serde_json::json!({"method":"initialized"}))?;
        rpc.status()?;
        let before = bound_account(
            &rpc.request("account/read", serde_json::json!({"refreshToken":false}))?,
        )?;
        authorization::check_identity(
            operation,
            &serde_json::to_string(&before).map_err(|_| Failure::Schema)?,
        )?;
        rpc.identity_guard = true;
        let usage = rpc.request(
            "account/rateLimits/read",
            serde_json::json!({"supportsLunaReserve":false,"excludeResetCreditDetails":true}),
        )?;
        let after = bound_account(
            &rpc.request("account/read", serde_json::json!({"refreshToken":false}))?,
        )?;
        let identity = bind_quota(
            &before,
            &after,
            &usage,
            operation.previous_identity.as_deref().map(String::as_str),
        )?;
        rpc.status()?;
        Ok((usage, identity))
    })();
    // Commit terminal adapter result before cleanup or shutdown can acknowledge cancellation.
    if result
        .as_ref()
        .err()
        .is_some_and(|e| !e.retryable() && *e != Failure::Cancelled)
    {
        operation.outcome.store(1, Ordering::SeqCst);
    }
    let final_policy = rpc.check();
    let closed = owned.close();
    let observed = owned
        .monitor
        .observation
        .lock()
        .map_err(|_| Failure::RpcNetworkAuditFailed)?;
    let result = match final_policy {
        Err(failure) => Err(failure),
        Ok(()) => result,
    };
    if result
        .as_ref()
        .err()
        .is_some_and(|e| !e.retryable() && *e != Failure::Cancelled)
    {
        operation.outcome.store(1, Ordering::SeqCst);
    }
    closed?;
    if rpc.policy.load(Ordering::SeqCst) {
        return Err(Failure::RpcRemoteControlUnsafe);
    }
    if observed.audit_failed || observed.samples == 0 {
        return Err(Failure::RpcNetworkAuditFailed);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fake(mode: &str) -> (PipeRpc, Owned) {
        let executable = std::env::split_paths(&std::env::var_os("PATH").unwrap())
            .map(|p| p.join("bun.exe"))
            .find(|p| p.is_file())
            .expect("Bun required by repository");
        let script = r#"const mode=Bun.argv.at(-1); if(mode==='flood')for(let i=0;i<130;i++)console.log(JSON.stringify({method:'remoteControl/status/changed',params:{status:'disabled'}})); if(mode==='queued-error')console.log(JSON.stringify({id:1,error:{code:-32603,message:'synthetic-only'}})); if(process.env.CODEX_INTERNAL_APP_SERVER_REMOTE_CONTROL_DISABLED!=='1')process.exit(4); if(mode==='listen')Bun.serve({hostname:'127.0.0.1',port:0,fetch(){return new Response('synthetic')}}); let buffer=''; for await(const chunk of Bun.stdin.stream()){buffer+=new TextDecoder().decode(chunk); let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!line)continue;const request=JSON.parse(line);if(!request.id){if(request.method==='initialized'&&'params'in request)process.exit(6);continue;}if(request.method==='remoteControl/status/read'&&'params'in request){console.log(JSON.stringify({id:request.id,error:{code:-32602}}));continue;}if(mode==='hang'){await Bun.sleep(60000);continue;}if(mode==='unsafe')console.log(JSON.stringify({method:'remoteControl/status/changed',params:{status:'connected',installationId:'synthetic-private-id'}})); if(mode==='request')console.log(JSON.stringify({id:51,method:'account/chatgptAuthTokens/refresh',params:{}}));console.log(JSON.stringify({id:mode==='wrong-id'?request.id+1:request.id,result:{status:'disabled'}}));}}"#;
        let cancel = Arc::new(AtomicBool::new(false));
        let policy = Arc::new(AtomicBool::new(false));
        let failure = FirstFailure::new(Arc::new(std::sync::atomic::AtomicU8::new(0)));
        let caller_cancel = Arc::new(AtomicBool::new(false));
        let deadline = Instant::now()
            + if mode == "hang" {
                Duration::from_millis(500)
            } else {
                Duration::from_secs(5)
            };
        let child = Arc::new(Mutex::new(
            SupervisedChild::spawn_with_environment(
                &executable,
                &["--no-env-file", "--eval", script, mode],
                InputMode::Pipe,
                OutputMode::Pipe,
                Some(&image::environment(&std::env::temp_dir(), &std::env::temp_dir()).unwrap()),
                Some(&std::env::temp_dir()),
            )
            .unwrap(),
        ));
        let mut guard = child.lock().unwrap();
        let primary = guard.id();
        assert!(guard.process_ids().unwrap().contains(&primary));
        let watchdog = IoWatchdog::start_with_parent_cancel(
            guard.terminate_handle(),
            cancel.clone(),
            Some(caller_cancel.clone()),
            Arc::new(Mutex::new(Some(deadline))),
        )
        .unwrap();
        let input = guard.take_stdin().unwrap();
        let output = guard.take_stdout().unwrap();
        drop(guard);
        let monitor = network::Monitor::start(
            child.clone(),
            cancel.clone(),
            policy.clone(),
            failure.clone(),
        )
        .unwrap();
        let (frames, reader) =
            reader(output, cancel.clone(), policy.clone(), failure.clone()).unwrap();
        (
            PipeRpc {
                input,
                frames,
                cancel,
                caller_cancel,
                failure,
                policy,
                deadline,
                next: 0,
                notifications: 0,
                checks: 0,
                identity_guard: false,
            },
            Owned {
                child,
                reader: Some(reader),
                monitor,
                _watchdog: watchdog,
            },
        )
    }
    #[test]
    fn reader_observed_provider_error_remains_terminal_when_quit_cancels_consumer() {
        let (rpc, mut owned) = fake("queued-error");
        let deadline = Instant::now() + Duration::from_secs(3);
        while rpc.failure.outcome.load(Ordering::SeqCst) == 0 && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(5));
        }
        rpc.caller_cancel.store(true, Ordering::SeqCst);
        assert_eq!(rpc.failure.outcome.load(Ordering::SeqCst), 1);
        assert!(matches!(rpc.check(), Err(Failure::RpcProviderFailed)));
        owned.close().unwrap();
        assert_eq!(rpc.failure.outcome.load(Ordering::SeqCst), 1);
    }
    #[test]
    fn bounded_frames_and_wrong_response_ids_stop_the_owned_job() {
        for mode in ["flood", "wrong-id"] {
            let (mut rpc, mut owned) = fake(mode);
            assert!(matches!(
                rpc.request("initialize", serde_json::json!({})),
                Err(Failure::RpcProtocol)
            ));
            owned.close().unwrap();
            assert!(owned
                .child
                .lock()
                .unwrap()
                .process_ids()
                .unwrap()
                .is_empty());
        }
    }
    #[test]
    fn quota_is_bound_to_active_workspace_before_and_after_read() {
        let account = serde_json::json!({"account":{"type":"chatgpt","email":"synthetic@example.invalid","planType":"plus"},
            "workspaceRouting":{"chatgptAccountId":"synthetic-workspace-a"}});
        let before = bound_account(&account).unwrap();
        let usage = serde_json::json!({"accountId":"synthetic-workspace-a"});
        let identity = bind_quota(&before, &before, &usage, None).unwrap();
        assert!(bind_quota(&before, &before, &usage, Some(identity.as_str())).is_ok());
        assert!(matches!(
            bind_quota(&before, &before, &usage, Some("other-session")),
            Err(Failure::IdentityChanged)
        ));
        let mut changed = account.clone();
        changed["workspaceRouting"]["chatgptAccountId"] =
            serde_json::json!("synthetic-workspace-b");
        let after = bound_account(&changed).unwrap();
        assert!(matches!(
            bind_quota(&before, &after, &usage, None),
            Err(Failure::IdentityChanged)
        ));
        assert!(matches!(
            bind_quota(
                &before,
                &before,
                &serde_json::json!({"accountId":"synthetic-workspace-b"}),
                None
            ),
            Err(Failure::IdentityChanged)
        ));
        for invalid in [
            serde_json::json!({}),
            serde_json::json!({"accountId":null}),
            serde_json::json!({"accountId":""}),
        ] {
            assert!(matches!(
                bind_quota(&before, &before, &invalid, None),
                Err(Failure::RpcIdentityUnavailable)
            ));
        }
        for routing in [
            Value::Null,
            serde_json::json!({}),
            serde_json::json!({"chatgptAccountId":""}),
            serde_json::json!({"chatgptAccountId":42}),
        ] {
            let mut missing = account.clone();
            missing["workspaceRouting"] = routing;
            assert!(matches!(
                bound_account(&missing),
                Err(Failure::RpcIdentityUnavailable)
            ));
        }
        let mut missing = account;
        missing.as_object_mut().unwrap().remove("workspaceRouting");
        assert!(matches!(
            bound_account(&missing),
            Err(Failure::RpcIdentityUnavailable)
        ));
    }
    #[test]
    fn fixed_startup_policy_cannot_enable_remote_control_or_inherit_auth_overrides() {
        assert!(consent_message().contains("Codex may renew authentication"));
        assert!(consent_message().contains("workspace routing"));
        let env = image::environment(
            Path::new("C:\\synthetic-only"),
            Path::new("C:\\private-program"),
        )
        .unwrap();
        assert_eq!(env.iter().filter(|(key, _)| key == MARKER).count(), 1);
        assert!(env.iter().any(|(key, value)| key == MARKER && value == "1"));
        assert!(!env.iter().any(|(key, _)| key == "OPENAI_API_KEY"
            || key == "HTTP_PROXY"
            || key == "CODEX_ACCESS_TOKEN"));
        assert!(ARGS.ends_with(&["app-server", "--listen", "stdio://"]));
        assert!(ARGS.contains(&"--strict-config"));
        assert!(ARGS.contains(&"features.respect_system_proxy=false"));
        assert!(ARGS.contains(&"features.system_proxy_fallback=false"));
        assert!(!ARGS.contains(&"respect_system_proxy=false"));
        assert!(!ARGS.iter().any(|arg| arg.contains("--remote-control")
            || arg.contains("startup-sign-out")
            || arg.starts_with("ws://")
            || arg.starts_with("unix://")));
        assert!(disabled(
            &serde_json::json!({"status":"disabled","installationId":"never-exposed"})
        )
        .is_ok());
        for status in ["connecting", "connected", "unknown", ""] {
            assert!(disabled(&serde_json::json!({"status":status})).is_err());
        }
        assert!(disabled(&serde_json::json!({})).is_err());
    }
    #[test]
    fn fake_stdio_checks_remote_control_before_account_and_quota() {
        let (mut rpc, mut owned) = fake("disabled");
        rpc.request("initialize",serde_json::json!({"clientInfo":{"name":"synthetic"},"capabilities":{"experimentalApi":true}})).unwrap();
        rpc.send(serde_json::json!({"method":"initialized"}))
            .unwrap();
        assert!(rpc.request("account/read", serde_json::json!({})).is_err());
        rpc.status().unwrap();
        assert_eq!(rpc.checks, 1);
        assert!(rpc
            .request("account/rateLimits/read", serde_json::json!({}))
            .is_err());
        assert!(rpc
            .request("remoteControl/enable", serde_json::json!({}))
            .is_err());
        std::thread::sleep(Duration::from_millis(75));
        rpc.status().unwrap();
        owned.close().unwrap();
        assert!(owned
            .child
            .lock()
            .unwrap()
            .process_ids()
            .unwrap()
            .is_empty());
        let obs = owned.monitor.observation.lock().unwrap();
        assert!(obs.samples > 0 && !obs.listener_seen && !obs.audit_failed);
    }
    #[test]
    fn unsafe_notification_or_owned_listener_stops_entire_fake_job() {
        for mode in ["unsafe", "listen"] {
            let (mut rpc, mut owned) = fake(mode);
            let result = rpc.status();
            if result.is_ok() {
                let until = Instant::now() + Duration::from_secs(2);
                while !rpc.policy.load(Ordering::SeqCst) && Instant::now() < until {
                    std::thread::sleep(Duration::from_millis(10));
                }
            }
            assert!(
                rpc.policy.load(Ordering::SeqCst)
                    || matches!(result, Err(Failure::RpcRemoteControlUnsafe))
            );
            assert!(!rpc.caller_cancel.load(Ordering::SeqCst));
            owned.close().unwrap();
            assert!(owned
                .child
                .lock()
                .unwrap()
                .process_ids()
                .unwrap()
                .is_empty());
        }
    }
    #[test]
    fn explicit_owner_cancel_terminates_job_without_becoming_a_policy_failure() {
        let (rpc, mut owned) = fake("disabled");
        rpc.caller_cancel.store(true, Ordering::SeqCst);
        let until = Instant::now() + Duration::from_secs(2);
        while owned.child.lock().unwrap().try_wait().unwrap().is_none() {
            assert!(Instant::now() < until);
            std::thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(rpc.check(), Err(Failure::Cancelled));
        assert!(rpc.failure.lock().unwrap().is_none());
        owned.close().unwrap();
        assert!(owned
            .child
            .lock()
            .unwrap()
            .process_ids()
            .unwrap()
            .is_empty());
    }
    #[test]
    fn fake_hung_stdio_and_server_token_request_fail_closed() {
        for mode in ["hang", "request"] {
            let (mut rpc, mut owned) = fake(mode);
            let started = Instant::now();
            assert!(rpc.status().is_err());
            owned.close().unwrap();
            assert!(started.elapsed() < Duration::from_secs(7));
            assert!(owned
                .child
                .lock()
                .unwrap()
                .process_ids()
                .unwrap()
                .is_empty());
        }
    }
}
