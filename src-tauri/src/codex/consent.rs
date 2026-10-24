//! Native-owned authorization for one connection attempt. Nothing is serialized.
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, Weak};

#[derive(Default)]
pub(super) struct ConsentGate {
    active: Mutex<Weak<AtomicBool>>,
    operation: Arc<Mutex<()>>,
}

impl ConsentGate {
    pub(super) fn begin(&self) -> Option<ConsentAttempt> {
        let mut active = self.active.lock().ok()?;
        // Keep a cancelled dialog reserved until it actually returns. This also
        // prevents renderer IPC flooding from stacking native dialogs.
        if active.upgrade().is_some() {
            return None;
        }
        let cancelled = Arc::new(AtomicBool::new(false));
        *active = Arc::downgrade(&cancelled);
        Some(ConsentAttempt {
            cancelled,
            operation: Arc::clone(&self.operation),
        })
    }

    pub(super) fn cancel(&self) {
        if let Ok(active) = self.active.lock() {
            if let Some(cancelled) = active.upgrade() {
                cancelled.store(true, Ordering::SeqCst);
            }
        }
        // Revocation is visible to the independent I/O killer before waiting.
        // Completing this barrier also waits for any already-authorized spawn
        // or write; later operations observe cancellation under the same lock.
        drop(self.operation.lock());
    }
}

pub(super) struct ConsentAttempt {
    cancelled: Arc<AtomicBool>,
    operation: Arc<Mutex<()>>,
}

impl ConsentAttempt {
    // Only the Rust OS-dialog result may call this. No IPC accepts an answer,
    // session identifier, nonce or approval flag from the WebView.
    pub(super) fn confirm(self, approved: bool) -> Option<NativeConsent> {
        if approved && !self.cancelled.load(Ordering::SeqCst) {
            Some(NativeConsent { attempt: self })
        } else {
            None
        }
    }
}

pub(super) struct NativeConsent {
    attempt: ConsentAttempt,
}

impl NativeConsent {
    pub(super) fn operation(&self) -> Arc<Mutex<()>> {
        Arc::clone(&self.attempt.operation)
    }
    pub(super) fn cancelled(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.attempt.cancelled)
    }

    pub(super) fn is_valid(&self) -> bool {
        !self.attempt.cancelled.load(Ordering::SeqCst)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_approval_is_single_attempt_and_never_remembered() {
        let gate = ConsentGate::default();
        let attempt = gate.begin().unwrap();
        assert!(gate.begin().is_none());
        let approved = attempt.confirm(true).unwrap();
        assert!(gate.begin().is_none());
        assert!(approved.is_valid());
        gate.cancel();
        assert!(!approved.is_valid());
        drop(approved);
        assert!(gate.begin().unwrap().confirm(false).is_none());
        assert!(ConsentGate::default()
            .begin()
            .unwrap()
            .confirm(false)
            .is_none());
    }

    #[test]
    fn late_approval_after_disconnect_and_cancel_fail_closed() {
        let gate = ConsentGate::default();
        let pending = gate.begin().unwrap();
        gate.cancel();
        assert!(gate.begin().is_none());
        assert!(pending.confirm(true).is_none());
        assert!(gate.begin().unwrap().confirm(false).is_none());
        assert!(gate.begin().unwrap().confirm(true).is_some());
    }

    #[test]
    fn revocation_is_visible_before_waiting_for_an_inflight_operation() {
        let gate = Arc::new(ConsentGate::default());
        let consent = gate.begin().unwrap().confirm(true).unwrap();
        let operation = consent.operation();
        let inflight = operation.lock().unwrap();
        let revoker = Arc::clone(&gate);
        let (done_tx, done_rx) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            revoker.cancel();
            done_tx.send(()).unwrap();
        });
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
        while consent.is_valid() {
            assert!(std::time::Instant::now() < deadline);
            std::thread::yield_now();
        }
        assert!(
            done_rx.try_recv().is_err(),
            "cancel synchronizes the existing operation"
        );
        drop(inflight);
        done_rx
            .recv_timeout(std::time::Duration::from_secs(3))
            .unwrap();
        worker.join().unwrap();
        assert!(!consent.is_valid());
    }
}
