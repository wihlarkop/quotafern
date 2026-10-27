//! Fail-closed unexpected-listener checks for the private job only.
use super::super::*;
use super::{record_failure, FirstFailure};
use std::thread::JoinHandle;
use windows_sys::Win32::NetworkManagement::IpHelper::*;
use windows_sys::Win32::Networking::WinSock::{AF_INET, AF_INET6};

#[derive(Default)]
pub(super) struct Observation {
    pub samples: u32,
    pub listener_seen: bool,
    pub audit_failed: bool,
}
// Never returns unrelated process rows, local addresses, or private remote addresses.
fn sample(ids: &[u32], observation: &mut Observation) -> Result<(), Failure> {
    for family in [AF_INET, AF_INET6] {
        let mut length = 0u32;
        let status = unsafe {
            GetExtendedTcpTable(
                std::ptr::null_mut(),
                &mut length,
                0,
                u32::from(family),
                TCP_TABLE_OWNER_PID_ALL,
                0,
            )
        };
        if status != 122 || !(4..=2 * 1024 * 1024).contains(&length) {
            return Err(Failure::RpcNetworkAuditFailed);
        }
        let mut storage = vec![0usize; (length as usize).div_ceil(size_of::<usize>())];
        let status = unsafe {
            GetExtendedTcpTable(
                storage.as_mut_ptr().cast(),
                &mut length,
                0,
                u32::from(family),
                TCP_TABLE_OWNER_PID_ALL,
                0,
            )
        };
        if status != 0 {
            return Err(Failure::RpcNetworkAuditFailed);
        }
        let count = unsafe { *storage.as_ptr().cast::<u32>() } as usize;
        let bytes = storage.len() * size_of::<usize>();
        if family == AF_INET {
            let offset = std::mem::offset_of!(MIB_TCPTABLE_OWNER_PID, table);
            if count > (bytes - offset) / size_of::<MIB_TCPROW_OWNER_PID>() {
                return Err(Failure::RpcNetworkAuditFailed);
            }
            let rows = unsafe {
                std::slice::from_raw_parts(
                    storage
                        .as_ptr()
                        .cast::<u8>()
                        .add(offset)
                        .cast::<MIB_TCPROW_OWNER_PID>(),
                    count,
                )
            };
            for row in rows.iter().filter(|row| ids.contains(&row.dwOwningPid)) {
                if row.dwState == 2 {
                    observation.listener_seen = true;
                    return Err(Failure::RpcRemoteControlUnsafe);
                }
            }
        } else {
            let offset = std::mem::offset_of!(MIB_TCP6TABLE_OWNER_PID, table);
            if count > (bytes - offset) / size_of::<MIB_TCP6ROW_OWNER_PID>() {
                return Err(Failure::RpcNetworkAuditFailed);
            }
            let rows = unsafe {
                std::slice::from_raw_parts(
                    storage
                        .as_ptr()
                        .cast::<u8>()
                        .add(offset)
                        .cast::<MIB_TCP6ROW_OWNER_PID>(),
                    count,
                )
            };
            for row in rows.iter().filter(|row| ids.contains(&row.dwOwningPid)) {
                if row.dwState == 2 {
                    observation.listener_seen = true;
                    return Err(Failure::RpcRemoteControlUnsafe);
                }
            }
        }
    }
    observation.samples += 1;
    Ok(())
}
pub(super) struct Monitor {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
    pub observation: Arc<Mutex<Observation>>,
}
impl Monitor {
    pub fn start(
        child: Arc<Mutex<SupervisedChild>>,
        cancel: Arc<AtomicBool>,
        policy: Arc<AtomicBool>,
        first: FirstFailure,
    ) -> Result<Self, Failure> {
        let stop = Arc::new(AtomicBool::new(false));
        let stopping = stop.clone();
        let observation = Arc::new(Mutex::new(Observation::default()));
        let observed = observation.clone();
        let thread = std::thread::Builder::new()
            .name("quotafern-owned-listener-guard".into())
            .spawn(move || {
                while !stopping.load(Ordering::SeqCst) && !cancel.load(Ordering::SeqCst) {
                    let result = (|| {
                        let ids = child
                            .lock()
                            .map_err(|_| Failure::RpcNetworkAuditFailed)?
                            .process_ids()
                            .map_err(|_| Failure::RpcNetworkAuditFailed)?;
                        sample(
                            &ids,
                            &mut *observed
                                .lock()
                                .map_err(|_| Failure::RpcNetworkAuditFailed)?,
                        )
                    })();
                    if let Err(failure) = result {
                        if let Ok(mut value) = observed.lock() {
                            value.audit_failed = true;
                        }
                        if failure == Failure::RpcRemoteControlUnsafe {
                            policy.store(true, Ordering::SeqCst);
                        }
                        record_failure(&first, &cancel, failure);
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(25));
                }
            })
            .map_err(|_| Failure::RpcNetworkAuditFailed)?;
        Ok(Self {
            stop,
            thread: Some(thread),
            observation,
        })
    }
    pub fn stop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}
impl Drop for Monitor {
    fn drop(&mut self) {
        self.stop();
    }
}
