//! Dedicated bundled consent view. The main renderer cannot approve its own request.
use super::*;

pub(crate) const LABEL: &str = "codex-consent";
const LIFETIME: Duration = Duration::from_secs(120);
pub(super) struct Pending {
    nonce: String,
    account: String,
    connection: String,
    generation: u64,
    kind: DirectKind,
    login: bool,
    expires: Instant,
    decision: Option<bool>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Prompt {
    challenge: String,
    source: &'static str,
    summary: &'static str,
    detail: &'static str,
}
fn current(inner: &Inner, pending: &Pending) -> bool {
    !inner.shutting_down
        && Instant::now() < pending.expires
        && inner
            .sessions
            .get(&pending.connection)
            .is_some_and(|session| {
                session.snapshot.account_id == pending.account
                    && session.snapshot.generation == pending.generation
                    && session.kind == pending.kind
                    && !session.cancelled.load(Ordering::SeqCst)
            })
}
fn eligible<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    if window.label() != LABEL {
        return Err("directConsentWindowOnly".into());
    }
    let url = window.url().map_err(|_| "directConsentWindowOnly")?;
    if !trusted_url(&url) {
        return Err("directConsentWindowOnly".into());
    }
    Ok(())
}
fn trusted_url(url: &tauri::Url) -> bool {
    let bundled = url.port().is_none()
        && ((url.scheme() == "tauri" && url.host_str() == Some("localhost"))
            || (["http", "https"].contains(&url.scheme())
                && url.host_str() == Some("tauri.localhost")));
    let development = cfg!(debug_assertions)
        && url.scheme() == "http"
        && url.host_str() == Some("127.0.0.1")
        && url.port() == Some(1420);
    (bundled || development)
        && url.path() == "/consent.html"
        && url.query().is_none()
        && url.fragment().is_none()
        && url.username().is_empty()
        && url.password().is_none()
}
fn prompt(inner: &Inner) -> Result<Prompt, String> {
    let pending = inner
        .pending_consent
        .as_ref()
        .ok_or("directConsentExpired")?;
    if !current(inner, pending) || pending.decision.is_some() {
        return Err("directConsentExpired".into());
    }
    #[cfg(windows)]
    let system_detail = existing_stdio::consent_message();
    #[cfg(not(windows))]
    let system_detail = "After approval, Quotafern checks the selected Codex home's private storage and reads its ChatGPT token natively, then requests quota from the fixed chatgpt.com/backend-api/wham/usage endpoint. This unofficial endpoint may change. Tokens and native account identifiers never reach this window. Codex owns login and credential renewal. Quotafern performs no inference, purchase, logout or token renewal. Disconnect preserves CLI credentials.";
    #[cfg(windows)]
    let system_summary = "Uses Quotafern's reviewed private Codex helper. Codex may renew its sign-in, fetch cloud configuration and refresh its model catalogue. Remote Control stays disabled.";
    #[cfg(not(windows))]
    let system_summary = "Reads quota using the existing Codex login. Quotafern may contact Codex/OpenAI services automatically when it opens.";
    let (source, summary, detail) = match pending.kind {
        DirectKind::System => (
            "Existing Codex account",
            system_summary,
            system_detail,
        ),
        DirectKind::Managed if pending.login => (
            "Separate Codex account",
            "Starts browser sign-in with the reviewed private Codex helper in this account's isolated home, then reads its quota. Your system Codex sign-in is unchanged.",
            "Codex owns login and credential renewal. After approval, Quotafern checks private storage and reads this home's ChatGPT token natively, then sends a read-only request to the fixed chatgpt.com/backend-api/wham/usage endpoint. Tokens and native account identifiers never reach this window. This unofficial endpoint may change. Quotafern performs no inference, purchase, logout or token renewal. Disconnect preserves the CLI-owned credentials.",
        ),
        DirectKind::Managed => (
            "Separate Codex account",
            "Reads quota using this account's isolated Codex login. Quotafern may contact Codex/OpenAI services automatically when it opens.",
            "After approval, Quotafern checks private storage and reads this home's ChatGPT token natively, then sends a read-only request to the fixed chatgpt.com/backend-api/wham/usage endpoint. Tokens and native account identifiers never reach this window. This unofficial endpoint may change. Codex owns login and credential renewal. Quotafern performs no inference, purchase, logout or token renewal. Disconnect preserves the CLI-owned credentials.",
        ),
    };
    Ok(Prompt {
        challenge: pending.nonce.clone(),
        source,
        summary,
        detail,
    })
}
fn decide(inner: &mut Inner, challenge: &str, approved: bool) -> Result<(), String> {
    let pending = inner
        .pending_consent
        .as_ref()
        .ok_or("directConsentExpired")?;
    if !current(inner, pending) || pending.nonce != challenge || pending.decision.is_some() {
        return Err("directConsentExpired".into());
    }
    inner.pending_consent.as_mut().unwrap().decision = Some(approved);
    Ok(())
}
#[tauri::command]
pub(crate) fn codex_consent_prompt<R: Runtime>(
    window: WebviewWindow<R>,
    bridge: State<'_, DirectBridge>,
) -> Result<Prompt, String> {
    eligible(&window)?;
    let inner = bridge.0.lock().map_err(|_| "directBridgeUnavailable")?;
    prompt(&inner)
}
#[tauri::command]
pub(crate) fn codex_consent_confirm<R: Runtime>(
    window: WebviewWindow<R>,
    bridge: State<'_, DirectBridge>,
    challenge: String,
) -> Result<(), String> {
    eligible(&window)?;
    let mut inner = bridge.0.lock().map_err(|_| "directBridgeUnavailable")?;
    decide(&mut inner, &challenge, true)
}
#[tauri::command]
pub(crate) fn codex_consent_cancel<R: Runtime>(
    window: WebviewWindow<R>,
    bridge: State<'_, DirectBridge>,
    challenge: String,
) -> Result<(), String> {
    eligible(&window)?;
    let mut inner = bridge.0.lock().map_err(|_| "directBridgeUnavailable")?;
    decide(&mut inner, &challenge, false)
}

#[cfg(not(test))]
pub(super) fn present<R: Runtime>(
    window: &WebviewWindow<R>,
    bridge: &DirectBridge,
    account: &str,
    connection: &str,
    generation: u64,
    login: bool,
    kind: DirectKind,
) -> Result<bool, Failure> {
    let mut random = [0u8; 32];
    getrandom::fill(&mut random).map_err(|_| Failure::ConsentUnavailable)?;
    let nonce: String = random.iter().map(|byte| format!("{byte:02x}")).collect();
    {
        let mut inner = bridge.0.lock().map_err(|_| Failure::ConsentUnavailable)?;
        if inner.pending_consent.is_some() || inner.shutting_down {
            return Err(Failure::ConsentUnavailable);
        }
        inner.pending_consent = Some(Pending {
            nonce: nonce.clone(),
            account: account.into(),
            connection: connection.into(),
            generation,
            kind,
            login,
            expires: Instant::now() + LIFETIME,
            decision: None,
        });
    }
    let main = window.clone();
    let app = window.app_handle().clone();
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    let close_bridge = bridge.clone();
    let close_nonce = nonce.clone();
    let build_bridge = bridge.clone();
    let build_nonce = nonce.clone();
    let queued = app.run_on_main_thread(move || {
        let active = build_bridge.0.lock().is_ok_and(|inner| {
            inner
                .pending_consent
                .as_ref()
                .is_some_and(|p| p.nonce == build_nonce && current(&inner, p))
        });
        if !active {
            let _ = sender.send(false);
            return;
        }
        let result = (|| -> tauri::Result<()> {
            let child = tauri::WebviewWindowBuilder::new(
                main.app_handle(),
                LABEL,
                tauri::WebviewUrl::App("consent.html".into()),
            )
            .title("Quotafern — Connect Codex")
            .center()
            .inner_size(460.0, 580.0)
            .min_inner_size(360.0, 420.0)
            .resizable(true)
            .minimizable(false)
            .maximizable(false)
            .skip_taskbar(true)
            .visible(false)
            .incognito(true)
            .devtools(false)
            .disable_drag_drop_handler()
            .parent(&main)?
            .on_navigation(trusted_url)
            .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
            .build()?;
            child.on_window_event(move |event| {
                if matches!(
                    event,
                    tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed
                ) {
                    if let Ok(mut inner) = close_bridge.0.lock() {
                        let _ = decide(&mut inner, &close_nonce, false);
                    }
                }
            });
            main.set_enabled(false)?;
            child.show()?;
            child.set_focus()?;
            Ok(())
        })();
        let _ = sender.send(result.is_ok());
    });
    let built = queued.is_ok()
        && receiver
            .recv_timeout(Duration::from_secs(10))
            .unwrap_or(false);
    let mut approved = false;
    if built {
        loop {
            let outcome = {
                bridge
                    .0
                    .lock()
                    .map_or(Some(false), |inner| match inner.pending_consent.as_ref() {
                        Some(pending) if pending.nonce == nonce && current(&inner, pending) => {
                            pending.decision
                        }
                        _ => Some(false),
                    })
            };
            if let Some(value) = outcome {
                approved = value;
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    }
    let main = window.clone();
    let app_for_close = app.clone();
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    let queued = app.run_on_main_thread(move || {
        let closed = app_for_close
            .get_webview_window(LABEL)
            .is_none_or(|child| child.destroy().is_ok());
        let enabled = main.set_enabled(true).is_ok();
        let _ = main.set_focus();
        let _ = sender.send(closed && enabled);
    });
    let cleaned = queued.is_ok()
        && receiver
            .recv_timeout(Duration::from_secs(10))
            .unwrap_or(false);
    if cleaned {
        if let Ok(mut inner) = bridge.0.lock() {
            if inner
                .pending_consent
                .as_ref()
                .is_some_and(|p| p.nonce == nonce)
            {
                inner.pending_consent = None;
            }
        }
    }
    if !built || !cleaned {
        return Err(Failure::ConsentUnavailable);
    }
    Ok(approved)
}

#[cfg(test)]
mod tests {
    use super::*;
    const ACCOUNT: &str = "account_11111111-1111-4111-8111-111111111111";
    const CONNECTION: &str = "connection_22222222-2222-4222-8222-222222222222";
    fn pending() -> DirectBridge {
        let bridge = DirectBridge::default();
        let generation = bridge
            .reserve(ACCOUNT, CONNECTION, DirectKind::Managed)
            .unwrap();
        bridge.0.lock().unwrap().pending_consent = Some(Pending {
            nonce: "a".repeat(64),
            account: ACCOUNT.into(),
            connection: CONNECTION.into(),
            generation,
            kind: DirectKind::Managed,
            login: false,
            expires: Instant::now() + LIFETIME,
            decision: None,
        });
        bridge
    }
    #[test]
    fn challenge_is_one_time_bound_expiring_and_never_provider_authority() {
        assert_eq!(
            DirectSnapshot::empty(ACCOUNT, CONNECTION, 1)
                .fail(Failure::ConsentUnavailable)
                .diagnostic,
            Some("directConsentUnavailable")
        );
        let bridge = pending();
        let mut inner = bridge.0.lock().unwrap();
        assert!(prompt(&inner).is_ok());
        assert!(decide(&mut inner, &"b".repeat(64), true).is_err());
        assert!(inner.sessions[CONNECTION].home.is_none());
        assert!(!inner.sessions[CONNECTION].remember_requested);
        decide(&mut inner, &"a".repeat(64), true).unwrap();
        assert!(decide(&mut inner, &"a".repeat(64), true).is_err());
        assert!(prompt(&inner).is_err());
        assert!(inner.sessions[CONNECTION].home.is_none());
        assert!(!inner.sessions[CONNECTION].remember_requested);
        drop(inner);
        for mutation in [0, 1, 2, 3] {
            let bridge = pending();
            let mut inner = bridge.0.lock().unwrap();
            match mutation {
                0 => {
                    inner.pending_consent.as_mut().unwrap().expires =
                        Instant::now() - Duration::from_secs(1)
                }
                1 => inner.pending_consent.as_mut().unwrap().generation += 1,
                2 => inner.pending_consent.as_mut().unwrap().kind = DirectKind::System,
                _ => inner.pending_consent.as_mut().unwrap().account = "other".into(),
            }
            assert!(decide(&mut inner, &"a".repeat(64), true).is_err());
        }
        let bridge = pending();
        bridge.disconnect(ACCOUNT, CONNECTION).unwrap();
        assert!(decide(&mut bridge.0.lock().unwrap(), &"a".repeat(64), true).is_err());
        let bridge = pending();
        decide(&mut bridge.0.lock().unwrap(), &"a".repeat(64), false).unwrap();
        assert!(decide(&mut bridge.0.lock().unwrap(), &"a".repeat(64), true).is_err());
        let bridge = pending();
        bridge.shutdown();
        assert!(decide(&mut bridge.0.lock().unwrap(), &"a".repeat(64), true).is_err());
    }
    #[test]
    fn consent_origin_is_bundled_exact_and_main_cannot_inherit_child_capability() {
        for url in [
            "https://evil.example/consent.html",
            "http://tauri.localhost:1234/consent.html",
            "http://tauri.localhost/",
            "http://tauri.localhost/consent.html?challenge=x",
            "http://tauri.localhost/consent.html#x",
        ] {
            assert!(!trusted_url(&url.parse().unwrap()));
        }
        assert!(trusted_url(
            &"http://tauri.localhost/consent.html".parse().unwrap()
        ));
        let bridge = pending();
        let app = tauri::test::mock_builder()
            .manage(bridge)
            .invoke_handler(tauri::generate_handler![
                codex_consent_prompt,
                codex_consent_confirm,
                codex_consent_cancel,
                super::super::codex_direct_status
            ])
            .build(tauri::generate_context!(test = true))
            .unwrap();
        let main = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let child = tauri::WebviewWindowBuilder::new(
            &app,
            LABEL,
            tauri::WebviewUrl::App("consent.html".into()),
        )
        .build()
        .unwrap();
        let origin = if cfg!(windows) {
            "http://tauri.localhost/consent.html"
        } else {
            "tauri://localhost/consent.html"
        };
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
        };
        assert!(invoke(&main, "codex_consent_prompt", origin, serde_json::json!({})).is_err());
        assert!(invoke(
            &main,
            "codex_consent_confirm",
            origin,
            serde_json::json!({"challenge":"a".repeat(64)})
        )
        .is_err());
        assert!(invoke(
            &child,
            "codex_direct_status",
            origin,
            serde_json::json!({"accountId":ACCOUNT,"connectionId":CONNECTION})
        )
        .is_err());
        assert!(invoke(
            &child,
            "codex_consent_prompt",
            "https://evil.example",
            serde_json::json!({})
        )
        .is_err());
        let view = invoke(
            &child,
            "codex_consent_prompt",
            origin,
            serde_json::json!({}),
        )
        .unwrap()
        .deserialize::<Value>()
        .unwrap();
        assert_eq!(view["challenge"], "a".repeat(64));
        assert!(view.get("accountId").is_none());
        assert!(view.get("connectionId").is_none());
        assert!(invoke(
            &child,
            "codex_consent_confirm",
            origin,
            serde_json::json!({"challenge":"a".repeat(64)})
        )
        .is_ok());
        assert!(invoke(
            &child,
            "codex_consent_confirm",
            origin,
            serde_json::json!({"challenge":"a".repeat(64)})
        )
        .is_err());
    }
}
