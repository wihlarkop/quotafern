//! Out-of-band termination for cancellation and blocked protocol writes.
use super::process::TerminationHandle;
use std::io;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

pub(super) type Deadline = Arc<Mutex<Option<Instant>>>;

pub(super) struct IoWatchdog {
    stopped: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl IoWatchdog {
    pub(super) fn start(
        kill: TerminationHandle,
        cancel: Arc<AtomicBool>,
        deadline: Deadline,
    ) -> io::Result<Self> {
        let stopped = Arc::new(AtomicBool::new(false));
        let stop = Arc::clone(&stopped);
        let worker = thread::Builder::new()
            .name("quotafern-codex-io-watchdog".into())
            .spawn(move || {
                while !stop.load(Ordering::SeqCst) {
                    let expired = deadline
                        .lock()
                        .map_or(true, |value| value.is_some_and(|at| Instant::now() >= at));
                    if cancel.load(Ordering::SeqCst) || expired {
                        cancel.store(true, Ordering::SeqCst);
                        let _ = kill.terminate();
                        return;
                    }
                    thread::sleep(Duration::from_millis(10));
                }
            })?;
        Ok(Self {
            stopped,
            thread: Some(worker),
        })
    }
}

impl Drop for IoWatchdog {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::SeqCst);
        if let Some(worker) = self.thread.take() {
            let _ = worker.join();
        }
    }
}

pub(super) struct RequestDeadline(Option<Deadline>);

impl RequestDeadline {
    pub(super) fn arm(deadline: &Option<Deadline>, timeout: Duration) -> Self {
        if let Some(shared) = deadline {
            if let Ok(mut value) = shared.lock() {
                *value = Some(Instant::now() + timeout);
            }
        }
        Self(deadline.clone())
    }
}

impl Drop for RequestDeadline {
    fn drop(&mut self) {
        if let Some(shared) = &self.0 {
            if let Ok(mut value) = shared.lock() {
                *value = None;
            }
        }
    }
}
