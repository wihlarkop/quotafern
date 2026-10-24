//! Existing Unix process-group ownership, kept separate from Windows handles.
use std::ffi::OsStr;
use std::io;
use std::path::Path;
use std::process::{Child, Command, ExitStatus, Stdio};

pub(super) type ChildInput = std::process::ChildStdin;
pub(super) type ChildOutput = std::process::ChildStdout;

pub(super) enum InputMode {
    Null,
    Pipe,
}

pub(super) enum OutputMode {
    Pipe,
}

pub(super) struct SupervisedChild(Child);

pub(super) struct TerminationHandle(u32);

impl TerminationHandle {
    pub(super) fn terminate(&self) -> io::Result<()> {
        if unsafe { libc::kill(-(self.0 as i32), libc::SIGKILL) } == 0 {
            Ok(())
        } else {
            Err(io::Error::last_os_error())
        }
    }
}

impl SupervisedChild {
    pub(super) fn terminate_handle(&self) -> TerminationHandle {
        TerminationHandle(self.0.id())
    }
    pub(super) fn spawn(
        executable: &Path,
        args: &[impl AsRef<OsStr>],
        stdin: InputMode,
        _stdout: OutputMode,
    ) -> io::Result<Self> {
        use std::os::unix::process::CommandExt;
        Command::new(executable)
            .args(args)
            .stdin(match stdin {
                InputMode::Null => Stdio::null(),
                InputMode::Pipe => Stdio::piped(),
            })
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .process_group(0)
            .spawn()
            .map(Self)
    }

    pub(super) fn take_stdin(&mut self) -> Option<ChildInput> {
        self.0.stdin.take()
    }
    pub(super) fn take_stdout(&mut self) -> Option<ChildOutput> {
        self.0.stdout.take()
    }

    pub(super) fn try_wait(&mut self) -> io::Result<Option<ExitStatus>> {
        let status = self.0.try_wait()?;
        if status.is_some() {
            self.terminate()?;
        }
        Ok(status)
    }

    pub(super) fn terminate(&mut self) -> io::Result<()> {
        unsafe {
            let _ = libc::kill(-(self.0.id() as i32), libc::SIGKILL);
        }
        if !matches!(self.0.try_wait(), Ok(Some(_))) {
            let _ = self.0.kill();
            self.0.wait()?;
        }
        Ok(())
    }
}

impl Drop for SupervisedChild {
    fn drop(&mut self) {
        let _ = self.terminate();
    }
}
