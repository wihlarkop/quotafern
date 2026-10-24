use super::*;
#[cfg(unix)]
use std::io::{BufRead, BufReader};
use std::sync::OnceLock;

fn fixture() -> &'static Path {
    static EXECUTABLE: OnceLock<PathBuf> = OnceLock::new();
    EXECUTABLE
        .get_or_init(|| {
            let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("target")
                .join(format!("quotafern-fixture-{}", std::process::id()));
            std::fs::create_dir_all(&directory).unwrap();
            let executable = directory.join(format!(
                "quotafern-fake-app-server{}",
                env::consts::EXE_SUFFIX
            ));
            let status = std::process::Command::new("rustc")
                .arg("--edition=2021")
                .arg("--crate-name=quotafern_fake_app_server")
                .arg(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/app_server.rs"))
                .arg("-o")
                .arg(&executable)
                .status()
                .unwrap();
            assert!(status.success(), "compile the credential-free fixture");
            executable
        })
        .as_path()
}

#[test]
fn fake_app_server_completes_handshake_quota_activity_and_cleanup() {
    let snapshot = Arc::new(Mutex::new(CodexSnapshot::disconnected()));
    let (mut session, account) = launch_and_initialize(
        fixture(),
        Arc::clone(&snapshot),
        Arc::new(AtomicBool::new(false)),
        Arc::new(Mutex::new(())),
    )
    .unwrap();
    assert_eq!(account, Some(AccountKind::ChatGpt));
    assert_eq!(
        lock_snapshot(&snapshot).windows[0].remaining_percent,
        Some(75.0)
    );
    let serialized = serde_json::to_string(&*lock_snapshot(&snapshot)).unwrap();
    assert_eq!(
        lock_snapshot(&snapshot)
            .monitoring
            .activity
            .summary
            .lifetime_tokens,
        Some(5)
    );
    assert!(!serialized.contains("fixture@example.test"));
    session.shutdown();
    assert!(session.child.try_wait().unwrap().is_some());
}

#[test]
fn revoked_authorization_prevents_both_spawn_and_protocol_bytes() {
    let gate = ConsentGate::default();
    let consent = gate.begin().unwrap().confirm(true).unwrap();
    gate.cancel();
    assert!(matches!(
        spawn_authorized(
            fixture(),
            &["app-server"],
            InputMode::Pipe,
            &consent.cancelled(),
            &consent.operation()
        ),
        Err(BridgeFailure::Interrupted)
    ));
    let stream = start_frame_reader(std::io::Cursor::new(Vec::<u8>::new())).unwrap();
    let (mut rpc, reader) = RpcConnection::new(
        Vec::new(),
        stream,
        consent.cancelled(),
        Arc::new(Mutex::new(CodexSnapshot::disconnected())),
    );
    rpc.operation = Some(consent.operation());
    assert_eq!(
        rpc.request("account/read", None),
        Err(BridgeFailure::Interrupted)
    );
    assert_eq!(
        rpc.notify("initialized", json!({})),
        Err(BridgeFailure::Interrupted)
    );
    assert!(rpc.writer.is_empty());
    reader.join().unwrap();
}

#[test]
fn watchdog_interrupts_a_full_stdin_pipe_on_timeout_and_disconnect() {
    for explicit_cancel in [false, true] {
        let mut child = OwnedChild::spawn(
            fixture(),
            &["--fixture-stall"],
            InputMode::Pipe,
            OutputMode::Pipe,
        )
        .unwrap();
        let mut stdin = child.take_stdin().unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let deadline = Arc::new(Mutex::new(Some(
            Instant::now() + Duration::from_millis(150),
        )));
        let watchdog =
            IoWatchdog::start(child.terminate_handle(), Arc::clone(&cancel), deadline).unwrap();
        let (done_tx, done_rx) = mpsc::channel();
        let writer = thread::spawn(move || {
            let result = stdin.write_all(&vec![b'x'; 1024 * 1024]);
            let _ = done_tx.send(result.is_err());
        });
        if explicit_cancel {
            cancel.store(true, Ordering::SeqCst);
        }
        assert!(
            done_rx.recv_timeout(Duration::from_secs(3)).unwrap(),
            "blocked write must fail after child termination"
        );
        writer.join().unwrap();
        drop(watchdog);
        child.terminate().unwrap();
        assert!(child.try_wait().unwrap().is_some());
    }
}

#[cfg(unix)]
#[test]
fn unix_process_group_terminates_a_fake_descendant() {
    let mut child = OwnedChild::spawn(
        fixture(),
        &["--fixture-tree"],
        InputMode::Null,
        OutputMode::Pipe,
    )
    .unwrap();
    let mut marker = String::new();
    BufReader::new(child.take_stdout().unwrap())
        .read_line(&mut marker)
        .unwrap();
    let descendant: i32 = marker.trim().parse().unwrap();
    assert_eq!(unsafe { libc::kill(descendant, 0) }, 0);
    child.terminate().unwrap();
    // A terminated orphan can remain a zombie briefly while the OS reaps it.
    // macOS/Linux acceptance checks process-group delivery separately from GUI.
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        let gone = unsafe { libc::kill(descendant, 0) } != 0;
        #[cfg(target_os = "linux")]
        let zombie = std::fs::read_to_string(format!("/proc/{descendant}/stat")).is_ok_and(|s| {
            s.split_once(") ")
                .is_some_and(|(_, fields)| fields.starts_with('Z'))
        });
        #[cfg(not(target_os = "linux"))]
        let zombie = false;
        if gone || zombie {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "descendant must not keep running"
        );
        thread::sleep(Duration::from_millis(10));
    }
}
