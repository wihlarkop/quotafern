//! Windows process creation and lifetime management for the Codex bridge.
//!
//! The process is created suspended and is assigned to its job through
//! `PROC_THREAD_ATTRIBUTE_JOB_LIST` as part of `CreateProcessW`. It is resumed
//! only after the process and its standard handles are safely owned here.

use std::ffi::OsStr;
use std::fs::File;
use std::io;
use std::mem::{size_of, zeroed};
use std::os::windows::ffi::OsStrExt;
use std::os::windows::io::{AsRawHandle, FromRawHandle, IntoRawHandle, OwnedHandle, RawHandle};
use std::os::windows::process::ExitStatusExt;
use std::path::Path;
use std::process::ExitStatus;
use std::ptr::{null, null_mut};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use windows_sys::Win32::Foundation::{
    GetLastError, SetHandleInformation, HANDLE, HANDLE_FLAG_INHERIT, WAIT_OBJECT_0,
};
use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, FILE_ATTRIBUTE_NORMAL, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
};
use windows_sys::Win32::System::JobObjects::{
    CreateJobObjectW, JobObjectBasicAccountingInformation, JobObjectExtendedLimitInformation,
    QueryInformationJobObject, SetInformationJobObject, TerminateJobObject,
    JOBOBJECT_BASIC_ACCOUNTING_INFORMATION, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};
use windows_sys::Win32::System::Pipes::CreatePipe;
use windows_sys::Win32::System::Threading::{
    CreateProcessW, DeleteProcThreadAttributeList, GetExitCodeProcess,
    InitializeProcThreadAttributeList, ResumeThread, UpdateProcThreadAttribute,
    WaitForSingleObject, CREATE_NO_WINDOW, CREATE_SUSPENDED, EXTENDED_STARTUPINFO_PRESENT,
    INFINITE, PROCESS_INFORMATION, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
    PROC_THREAD_ATTRIBUTE_JOB_LIST, STARTF_USESTDHANDLES, STARTUPINFOEXW,
};

const CREATE_PROCESS_ATTRIBUTE_COUNT: u32 = 2;
const MAX_COMMAND_LINE_UNITS: usize = 32_767;
const TERMINATION_WAIT_LIMIT: Duration = Duration::from_secs(5);
const TERMINATION_POLL_INTERVAL: Duration = Duration::from_millis(10);

pub(crate) type ChildInput = File;
pub(crate) type ChildOutput = File;

/// Whether the child should receive a null device or a pipe for standard input.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum InputMode {
    Null,
    Pipe,
}

/// Whether the child should receive a null device or a pipe for standard output.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum OutputMode {
    Pipe,
}

/// A Windows child process whose entire descendant tree belongs to a private job.
pub(crate) struct SupervisedChild {
    process: OwnedHandle,
    job: Arc<OwnedHandle>,
    stdin: Option<File>,
    stdout: Option<File>,
    #[cfg(test)]
    process_id: u32,
}

impl SupervisedChild {
    /// Start an executable with an explicit argument vector and standard streams.
    ///
    /// The environment is inherited unchanged. The child is never launched via a
    /// shell, and its only inherited handles are the three standard-stream handles
    /// named in the extended startup attribute list.
    pub(crate) fn spawn(
        executable: &Path,
        args: &[impl AsRef<OsStr>],
        stdin_mode: InputMode,
        stdout_mode: OutputMode,
    ) -> io::Result<Self> {
        let job = create_kill_on_close_job()?;
        let mut pending = create_suspended_process(
            executable.as_os_str(),
            args,
            stdin_mode,
            stdout_mode,
            job.as_raw_handle() as HANDLE,
        )?;

        // JOB_LIST assigns membership during process creation. The primary thread
        // has remained suspended through all handle setup until this point.
        pending.resume()?;

        Ok(Self {
            process: pending.process,
            job,
            stdin: pending.stdin,
            stdout: pending.stdout,
            #[cfg(test)]
            process_id: pending.process_id,
        })
    }

    #[cfg(test)]
    pub(crate) fn id(&self) -> u32 {
        self.process_id
    }

    pub(crate) fn take_stdin(&mut self) -> Option<ChildInput> {
        self.stdin.take()
    }

    pub(crate) fn take_stdout(&mut self) -> Option<ChildOutput> {
        self.stdout.take()
    }

    /// Return a cloneable, non-blocking handle for cancellation paths outside the
    /// session lock. Calling it terminates the job immediately; the owner later
    /// verifies that every process has exited before reporting cleanup complete.
    pub(super) fn terminate_handle(&self) -> TerminationHandle {
        TerminationHandle {
            job: Arc::clone(&self.job),
        }
    }

    /// Check the primary process and clean up its job when it has exited.
    pub(crate) fn try_wait(&mut self) -> io::Result<Option<ExitStatus>> {
        let wait = unsafe { WaitForSingleObject(raw(&self.process), 0) };
        if wait == WAIT_OBJECT_0 {
            let mut exit_code = 0;
            if unsafe { GetExitCodeProcess(raw(&self.process), &mut exit_code) } == 0 {
                return Err(io::Error::last_os_error());
            }

            // A child may leave descendants behind when it exits unexpectedly.
            // Terminate the full job before reporting the primary process status.
            self.terminate_job_and_wait()?;
            return Ok(Some(ExitStatus::from_raw(exit_code)));
        }
        if wait == windows_sys::Win32::Foundation::WAIT_TIMEOUT {
            return Ok(None);
        }
        Err(io::Error::last_os_error())
    }

    /// Terminate and reap every process still associated with this child job.
    pub(crate) fn terminate(&mut self) -> io::Result<()> {
        self.terminate_job_and_wait()
    }

    fn terminate_job_and_wait(&self) -> io::Result<()> {
        let job = raw(&self.job);
        let terminate_error = if unsafe { TerminateJobObject(job, 1) } == 0 {
            Some(io::Error::last_os_error())
        } else {
            None
        };
        let deadline = Instant::now() + TERMINATION_WAIT_LIMIT;
        loop {
            let active_processes = active_process_count(job)?;
            let process_wait = unsafe { WaitForSingleObject(raw(&self.process), 0) };
            if active_processes == 0 && process_wait == WAIT_OBJECT_0 {
                return Ok(());
            }
            if Instant::now() >= deadline {
                return Err(terminate_error.unwrap_or_else(|| {
                    io::Error::new(
                        io::ErrorKind::TimedOut,
                        "timed out waiting for all processes in the child job to exit",
                    )
                }));
            }
            if process_wait != WAIT_OBJECT_0
                && process_wait != windows_sys::Win32::Foundation::WAIT_TIMEOUT
            {
                return Err(io::Error::last_os_error());
            }
            thread::sleep(TERMINATION_POLL_INTERVAL);
        }
    }
}

impl Drop for SupervisedChild {
    fn drop(&mut self) {
        let _ = self.terminate_job_and_wait();
    }
}

#[derive(Clone)]
pub(super) struct TerminationHandle {
    job: Arc<OwnedHandle>,
}

impl TerminationHandle {
    /// Send termination to the job without waiting for blocked I/O or process exit.
    pub(super) fn terminate(&self) -> io::Result<()> {
        if unsafe { TerminateJobObject(raw(&self.job), 1) } == 0 {
            let error = io::Error::last_os_error();
            if active_process_count(raw(&self.job))? == 0 {
                return Ok(());
            }
            return Err(error);
        }
        Ok(())
    }
}

struct PendingProcess {
    process: OwnedHandle,
    primary_thread: OwnedHandle,
    stdin: Option<File>,
    stdout: Option<File>,
    #[cfg(test)]
    process_id: u32,
}

impl PendingProcess {
    fn resume(&mut self) -> io::Result<()> {
        let previous_suspend_count = unsafe { ResumeThread(raw(&self.primary_thread)) };
        if previous_suspend_count == u32::MAX {
            let error = io::Error::last_os_error();
            self.terminate_and_wait();
            return Err(error);
        }
        if previous_suspend_count != 1 {
            self.terminate_and_wait();
            return Err(io::Error::other(
                "the newly created child did not have exactly one suspended primary thread",
            ));
        }
        Ok(())
    }

    fn terminate_and_wait(&self) {
        unsafe {
            let _ = windows_sys::Win32::System::Threading::TerminateProcess(raw(&self.process), 1);
            let _ = WaitForSingleObject(raw(&self.process), INFINITE);
        }
    }
}

struct AttributeList {
    storage: Vec<usize>,
    initialized: bool,
}

impl AttributeList {
    fn new() -> io::Result<Self> {
        let mut required_size = 0usize;
        unsafe {
            // The sizing call is documented to fail after writing the required size.
            let _ = InitializeProcThreadAttributeList(
                null_mut(),
                CREATE_PROCESS_ATTRIBUTE_COUNT,
                0,
                &mut required_size,
            );
        }
        if required_size == 0 {
            return Err(io::Error::last_os_error());
        }

        let unit_count = required_size.div_ceil(size_of::<usize>());
        let mut list = Self {
            storage: vec![0; unit_count],
            initialized: false,
        };
        if unsafe {
            InitializeProcThreadAttributeList(
                list.as_mut_ptr(),
                CREATE_PROCESS_ATTRIBUTE_COUNT,
                0,
                &mut required_size,
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        list.initialized = true;
        Ok(list)
    }

    fn as_mut_ptr(
        &mut self,
    ) -> windows_sys::Win32::System::Threading::LPPROC_THREAD_ATTRIBUTE_LIST {
        self.storage.as_mut_ptr().cast()
    }
}

impl Drop for AttributeList {
    fn drop(&mut self) {
        if self.initialized {
            unsafe { DeleteProcThreadAttributeList(self.as_mut_ptr()) };
        }
    }
}

struct ChildHandles {
    stdin_child: OwnedHandle,
    stdin_parent: Option<File>,
    stdout_child: OwnedHandle,
    stdout_parent: Option<File>,
    stderr_child: OwnedHandle,
}

impl ChildHandles {
    fn new(stdin_mode: InputMode, stdout_mode: OutputMode) -> io::Result<Self> {
        let (stdin_child, stdin_parent) = match stdin_mode {
            InputMode::Null => (open_null_device(true)?, None),
            InputMode::Pipe => {
                let (child_read, parent_write) = create_pipe()?;
                clear_inherit_flag(&parent_write)?;
                let parent_write = unsafe { File::from_raw_handle(parent_write.into_raw_handle()) };
                (child_read, Some(parent_write))
            }
        };

        let (parent_read, child_write) = match stdout_mode {
            OutputMode::Pipe => {
                let (parent_read, child_write) = create_pipe()?;
                clear_inherit_flag(&parent_read)?;
                let parent_read = unsafe { File::from_raw_handle(parent_read.into_raw_handle()) };
                (Some(parent_read), child_write)
            }
        };

        Ok(Self {
            stdin_child,
            stdin_parent,
            stdout_child: child_write,
            stdout_parent: parent_read,
            stderr_child: open_null_device(false)?,
        })
    }

    fn inherited_handles(&self) -> [HANDLE; 3] {
        [
            raw(&self.stdin_child),
            raw(&self.stdout_child),
            raw(&self.stderr_child),
        ]
    }
}

fn create_suspended_process(
    executable: &OsStr,
    args: &[impl AsRef<OsStr>],
    stdin_mode: InputMode,
    stdout_mode: OutputMode,
    job: HANDLE,
) -> io::Result<PendingProcess> {
    let executable_wide = nul_terminated_wide(executable)?;
    let mut command_line = command_line(executable, args)?;
    let child_handles = ChildHandles::new(stdin_mode, stdout_mode)?;
    let inherited_handles = child_handles.inherited_handles();
    let job_handles = [job];

    let mut attributes = AttributeList::new()?;
    for (attribute, value, byte_size) in [
        (
            PROC_THREAD_ATTRIBUTE_JOB_LIST,
            job_handles.as_ptr().cast(),
            std::mem::size_of_val(&job_handles),
        ),
        (
            PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
            inherited_handles.as_ptr().cast(),
            std::mem::size_of_val(&inherited_handles),
        ),
    ] {
        if unsafe {
            UpdateProcThreadAttribute(
                attributes.as_mut_ptr(),
                0,
                attribute as usize,
                value,
                byte_size,
                null_mut(),
                null(),
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
    }

    let mut startup = STARTUPINFOEXW::default();
    startup.StartupInfo.cb = size_of::<STARTUPINFOEXW>() as u32;
    startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    startup.StartupInfo.hStdInput = inherited_handles[0];
    startup.StartupInfo.hStdOutput = inherited_handles[1];
    startup.StartupInfo.hStdError = inherited_handles[2];
    startup.lpAttributeList = attributes.as_mut_ptr();

    let mut process_info: PROCESS_INFORMATION = unsafe { zeroed() };
    let created = unsafe {
        CreateProcessW(
            executable_wide.as_ptr(),
            command_line.as_mut_ptr(),
            null(),
            null(),
            1,
            EXTENDED_STARTUPINFO_PRESENT | CREATE_SUSPENDED | CREATE_NO_WINDOW,
            null(),
            null(),
            (&startup.StartupInfo as *const windows_sys::Win32::System::Threading::STARTUPINFOW)
                .cast(),
            &mut process_info,
        )
    };
    if created == 0 {
        return Err(io::Error::from_raw_os_error(
            unsafe { GetLastError() } as i32
        ));
    }

    let process = unsafe { OwnedHandle::from_raw_handle(process_info.hProcess as RawHandle) };
    let primary_thread = unsafe { OwnedHandle::from_raw_handle(process_info.hThread as RawHandle) };

    // The child ends must stay alive through CreateProcessW so the explicit
    // handle list remains valid. They are closed as soon as creation returns.
    drop(child_handles.stdin_child);
    drop(child_handles.stdout_child);
    drop(child_handles.stderr_child);

    Ok(PendingProcess {
        process,
        primary_thread,
        stdin: child_handles.stdin_parent,
        stdout: child_handles.stdout_parent,
        #[cfg(test)]
        process_id: process_info.dwProcessId,
    })
}

fn create_kill_on_close_job() -> io::Result<Arc<OwnedHandle>> {
    let handle = unsafe { CreateJobObjectW(null(), null()) };
    if handle.is_null() {
        return Err(io::Error::last_os_error());
    }
    let job = unsafe { OwnedHandle::from_raw_handle(handle as RawHandle) };

    let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { zeroed() };
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if unsafe {
        SetInformationJobObject(
            handle,
            JobObjectExtendedLimitInformation,
            (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
            size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    Ok(Arc::new(job))
}

fn active_process_count(job: HANDLE) -> io::Result<u32> {
    let mut accounting: JOBOBJECT_BASIC_ACCOUNTING_INFORMATION = unsafe { zeroed() };
    if unsafe {
        QueryInformationJobObject(
            job,
            JobObjectBasicAccountingInformation,
            (&mut accounting as *mut JOBOBJECT_BASIC_ACCOUNTING_INFORMATION).cast(),
            size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32,
            null_mut(),
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    Ok(accounting.ActiveProcesses)
}

fn create_pipe() -> io::Result<(OwnedHandle, OwnedHandle)> {
    let mut read = null_mut();
    let mut write = null_mut();
    let attributes = SECURITY_ATTRIBUTES {
        nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: null_mut(),
        bInheritHandle: 1,
    };
    if unsafe { CreatePipe(&mut read, &mut write, &attributes, 0) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(unsafe {
        (
            OwnedHandle::from_raw_handle(read as RawHandle),
            OwnedHandle::from_raw_handle(write as RawHandle),
        )
    })
}

fn open_null_device(read: bool) -> io::Result<OwnedHandle> {
    let path: Vec<u16> = OsStr::new("NUL").encode_wide().chain(Some(0)).collect();
    let attributes = SECURITY_ATTRIBUTES {
        nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: null_mut(),
        bInheritHandle: 1,
    };
    let access = if read {
        windows_sys::Win32::Foundation::GENERIC_READ
    } else {
        windows_sys::Win32::Foundation::GENERIC_WRITE
    };
    let handle = unsafe {
        CreateFileW(
            path.as_ptr(),
            access,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            &attributes,
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            null_mut(),
        )
    };
    if handle == windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE || handle.is_null() {
        return Err(io::Error::last_os_error());
    }
    Ok(unsafe { OwnedHandle::from_raw_handle(handle as RawHandle) })
}

fn clear_inherit_flag(handle: &OwnedHandle) -> io::Result<()> {
    if unsafe { SetHandleInformation(raw(handle), HANDLE_FLAG_INHERIT, 0) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

fn raw(handle: &OwnedHandle) -> HANDLE {
    handle.as_raw_handle() as HANDLE
}

fn nul_terminated_wide(value: &OsStr) -> io::Result<Vec<u16>> {
    let wide: Vec<u16> = value.encode_wide().collect();
    if wide.is_empty() || wide.contains(&0) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Windows executable and argument values must be non-empty and cannot contain NUL",
        ));
    }
    let mut nul_terminated = wide;
    nul_terminated.push(0);
    Ok(nul_terminated)
}

fn command_line(executable: &OsStr, args: &[impl AsRef<OsStr>]) -> io::Result<Vec<u16>> {
    let mut command_line = Vec::new();
    append_quoted_argument(&mut command_line, executable)?;
    for arg in args {
        command_line.push(b' ' as u16);
        append_quoted_argument(&mut command_line, arg.as_ref())?;
    }
    command_line.push(0);
    if command_line.len() > MAX_COMMAND_LINE_UNITS {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Windows command line exceeds the CreateProcessW limit",
        ));
    }
    Ok(command_line)
}

fn append_quoted_argument(output: &mut Vec<u16>, value: &OsStr) -> io::Result<()> {
    let value: Vec<u16> = value.encode_wide().collect();
    if value.contains(&0) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Windows command line arguments cannot contain NUL",
        ));
    }

    let needs_quotes = value.is_empty()
        || value.iter().any(|unit| {
            *unit == b' ' as u16
                || *unit == b'\t' as u16
                || *unit == b'\n' as u16
                || *unit == b'\r' as u16
                || *unit == b'"' as u16
        });
    if !needs_quotes {
        output.extend(value);
        return Ok(());
    }

    output.push(b'"' as u16);
    let mut backslashes = 0usize;
    for unit in value {
        if unit == b'\\' as u16 {
            backslashes += 1;
        } else if unit == b'"' as u16 {
            output.extend(std::iter::repeat_n(b'\\' as u16, backslashes * 2 + 1));
            output.push(unit);
            backslashes = 0;
        } else {
            output.extend(std::iter::repeat_n(b'\\' as u16, backslashes));
            output.push(unit);
            backslashes = 0;
        }
    }
    output.extend(std::iter::repeat_n(b'\\' as u16, backslashes * 2));
    output.push(b'"' as u16);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Write};
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    use std::thread;
    use std::time::{Duration, Instant};

    const FIXTURE_HANGS_FILTER: &str = "__quotafern_child_fixture_hangs__";
    const FIXTURE_EXITS_FILTER: &str = "__quotafern_child_fixture_exits__";
    const FIXTURE_GRANDCHILD_FILTER: &str = "__quotafern_grandchild_fixture__";

    #[test]
    #[ignore = "launched by Windows process containment tests"]
    fn __quotafern_child_fixture_hangs__() {
        spawn_fixture_grandchild();
        loop {
            thread::sleep(Duration::from_secs(1));
        }
    }

    #[test]
    #[ignore = "launched by Windows process containment tests"]
    fn __quotafern_child_fixture_exits__() {
        spawn_fixture_grandchild();
        // The parent test closes its output pipe after reading the descendant
        // marker. Exit before libtest writes its trailing status line to it.
        std::process::exit(0);
    }

    #[test]
    #[ignore = "launched by Windows process containment tests"]
    fn __quotafern_grandchild_fixture__() {
        loop {
            thread::sleep(Duration::from_secs(1));
        }
    }

    #[test]
    fn job_assignment_contains_descendant_and_termination_kills_tree() {
        let mut child = launch_fixture(FIXTURE_HANGS_FILTER);
        let grandchild_pid = read_grandchild_pid(&mut child);
        assert_process_in_job(raw(&child.process), raw(&child.job));
        assert_pid_in_job(grandchild_pid, raw(&child.job));
        assert!(process_is_alive(grandchild_pid));
        assert!(child.try_wait().expect("wait state").is_none());

        child.terminate().expect("terminate process tree");
        assert!(process_is_dead(child.id()));
        assert!(process_is_dead(grandchild_pid));
    }

    #[test]
    fn timeout_termination_kills_the_descendant_tree() {
        let mut child = launch_fixture(FIXTURE_HANGS_FILTER);
        let grandchild_pid = read_grandchild_pid(&mut child);
        let deadline = Instant::now() + Duration::from_millis(60);
        while Instant::now() < deadline {
            assert!(child.try_wait().expect("wait state").is_none());
            thread::sleep(Duration::from_millis(5));
        }

        child.terminate().expect("terminate timed-out process tree");
        assert!(process_is_dead(child.id()));
        assert!(process_is_dead(grandchild_pid));
    }

    #[test]
    fn dropping_the_owner_kills_the_descendant_tree() {
        let mut child = launch_fixture(FIXTURE_HANGS_FILTER);
        let process_id = child.id();
        let grandchild_pid = read_grandchild_pid(&mut child);
        drop(child);
        assert!(process_is_dead(process_id));
        assert!(process_is_dead(grandchild_pid));
    }

    #[test]
    fn unexpected_primary_exit_kills_descendants_before_reporting_exit() {
        let mut child = launch_fixture(FIXTURE_EXITS_FILTER);
        let grandchild_pid = read_grandchild_pid(&mut child);
        let deadline = Instant::now() + Duration::from_secs(5);
        let status = loop {
            if let Some(status) = child.try_wait().expect("primary wait") {
                break status;
            }
            assert!(Instant::now() < deadline, "fixture process timed out");
            thread::sleep(Duration::from_millis(5));
        };
        assert!(status.success());
        assert!(process_is_dead(grandchild_pid));
    }

    #[test]
    fn missing_executable_fails_before_a_child_is_started() {
        let missing = std::env::temp_dir().join(format!(
            "quotafern-definitely-missing-fixture-{}.exe",
            std::process::id()
        ));
        assert!(SupervisedChild::spawn(
            &missing,
            &[] as &[&OsStr],
            InputMode::Null,
            OutputMode::Pipe,
        )
        .is_err());
    }

    #[test]
    fn job_assignment_failure_does_not_start_the_fixture() {
        let event = create_event_handle();
        let executable = std::env::current_exe().expect("test executable");
        let args = fixture_args(FIXTURE_HANGS_FILTER);
        let result = create_suspended_process(
            executable.as_os_str(),
            &args,
            InputMode::Null,
            OutputMode::Pipe,
            event.as_raw_handle() as HANDLE,
        );
        match result {
            Err(_) => {}
            Ok(pending) => {
                // If the OS unexpectedly accepts a non-job handle, kill the
                // still-suspended process before failing this test.
                pending.terminate_and_wait();
                panic!("a non-job handle must be rejected as a job");
            }
        }
    }

    fn launch_fixture(filter: &str) -> SupervisedChild {
        let executable = std::env::current_exe().expect("test executable");
        let args = fixture_args(filter);
        SupervisedChild::spawn(&executable, &args, InputMode::Null, OutputMode::Pipe)
            .expect("fixture child in job")
    }

    fn fixture_args(filter: &str) -> Vec<String> {
        vec![
            filter.to_owned(),
            "--ignored".to_owned(),
            "--nocapture".to_owned(),
        ]
    }

    #[allow(clippy::zombie_processes)] // Deliberate orphan: the job owner must terminate it.
    fn spawn_fixture_grandchild() {
        // The grandchild intentionally never exits. Spawn it separately so this
        // fixture can announce its process ID and exercise job inheritance.
        let executable = std::env::current_exe().expect("fixture executable");
        let child = Command::new(executable)
            .args(fixture_args(FIXTURE_GRANDCHILD_FILTER))
            .stdin(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .expect("grandchild fixture");
        println!("FIXTURE_DESCENDANT_PID={}", child.id());
        let _ = io::stdout().flush();
    }

    fn read_grandchild_pid(child: &mut SupervisedChild) -> u32 {
        let stdout = child.take_stdout().expect("fixture stdout pipe");
        let mut reader = BufReader::new(stdout);
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let mut line = String::new();
            let read = reader.read_line(&mut line).expect("fixture output");
            if read == 0 {
                panic!("fixture exited before announcing its grandchild");
            }
            if let Some(pid) = line.trim().strip_prefix("FIXTURE_DESCENDANT_PID=") {
                return pid.parse().expect("grandchild process ID");
            }
            assert!(Instant::now() < deadline, "fixture marker timed out");
        }
    }

    fn process_is_alive(process_id: u32) -> bool {
        let process = unsafe {
            windows_sys::Win32::System::Threading::OpenProcess(
                windows_sys::Win32::System::Threading::PROCESS_SYNCHRONIZE,
                0,
                process_id,
            )
        };
        if process.is_null() {
            return false;
        }
        let process = unsafe { OwnedHandle::from_raw_handle(process as RawHandle) };
        (unsafe { WaitForSingleObject(raw(&process), 0) })
            == windows_sys::Win32::Foundation::WAIT_TIMEOUT
    }

    fn assert_process_in_job(process: HANDLE, job: HANDLE) {
        let mut in_job = 0;
        assert_ne!(
            unsafe {
                windows_sys::Win32::System::JobObjects::IsProcessInJob(process, job, &mut in_job)
            },
            0,
            "IsProcessInJob should succeed"
        );
        assert_eq!(in_job, 1, "created process is not in its job");
    }

    fn assert_pid_in_job(process_id: u32, job: HANDLE) {
        let process = unsafe {
            windows_sys::Win32::System::Threading::OpenProcess(
                windows_sys::Win32::System::Threading::PROCESS_QUERY_LIMITED_INFORMATION,
                0,
                process_id,
            )
        };
        assert!(!process.is_null(), "open descendant process");
        let process = unsafe { OwnedHandle::from_raw_handle(process as RawHandle) };
        assert_process_in_job(raw(&process), job);
    }

    fn process_is_dead(process_id: u32) -> bool {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if !process_is_alive(process_id) {
                return true;
            }
            if Instant::now() >= deadline {
                return false;
            }
            thread::sleep(Duration::from_millis(10));
        }
    }

    fn create_event_handle() -> OwnedHandle {
        let event =
            unsafe { windows_sys::Win32::System::Threading::CreateEventW(null(), 0, 0, null()) };
        assert!(!event.is_null(), "test event handle");
        unsafe { OwnedHandle::from_raw_handle(event as RawHandle) }
    }

    #[test]
    fn command_line_quoting_preserves_spaces_quotes_and_trailing_slashes() {
        let mut command = Vec::new();
        append_quoted_argument(&mut command, OsStr::new("C:\\Program Files\\Codex\\"))
            .expect("path argument");
        assert_eq!(
            String::from_utf16(&command).expect("utf16"),
            "\"C:\\Program Files\\Codex\\\\\""
        );

        let mut command = Vec::new();
        append_quoted_argument(&mut command, OsStr::new("a\\\"b")).expect("quoted argument");
        assert_eq!(
            String::from_utf16(&command).expect("utf16"),
            "\"a\\\\\\\"b\""
        );
    }
}
