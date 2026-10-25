//! Existing Unix process-group ownership, kept separate from Windows handles.
use std::ffi::{OsStr, OsString};
use std::io;
use std::path::Path;
use std::process::{Child, Command, ExitStatus, Stdio};

pub(crate) type ChildInput = std::process::ChildStdin;
pub(crate) type ChildOutput = std::process::ChildStdout;

pub(crate) enum InputMode {
    Null,
    Pipe,
}

pub(crate) enum OutputMode {
    Pipe,
    Null,
}

pub(crate) struct SupervisedChild(Child);

pub(crate) struct TerminationHandle(u32);

impl TerminationHandle {
    pub(crate) fn terminate(&self) -> io::Result<()> {
        if unsafe { libc::kill(-(self.0 as i32), libc::SIGKILL) } == 0 {
            Ok(())
        } else {
            Err(io::Error::last_os_error())
        }
    }
}

impl SupervisedChild {
    pub(crate) fn terminate_handle(&self) -> TerminationHandle {
        TerminationHandle(self.0.id())
    }
    pub(crate) fn spawn(
        executable: &Path,
        args: &[impl AsRef<OsStr>],
        stdin: InputMode,
        stdout: OutputMode,
    ) -> io::Result<Self> {
        Self::spawn_with_environment(executable, args, stdin, stdout, None, None)
    }
    pub(crate) fn spawn_with_environment(
        executable: &Path,
        args: &[impl AsRef<OsStr>],
        stdin: InputMode,
        stdout: OutputMode,
        environment: Option<&[(OsString, OsString)]>,
        current_directory: Option<&Path>,
    ) -> io::Result<Self> {
        use std::os::unix::process::CommandExt;
        let mut command = Command::new(executable);
        if let Some(environment) = environment {
            command.env_clear().envs(environment.iter().cloned());
        }
        if let Some(directory) = current_directory {
            command.current_dir(directory);
        }
        command
            .args(args)
            .stdin(match stdin {
                InputMode::Null => Stdio::null(),
                InputMode::Pipe => Stdio::piped(),
            })
            .stdout(match stdout {
                OutputMode::Pipe => Stdio::piped(),
                OutputMode::Null => Stdio::null(),
            })
            .stderr(Stdio::null())
            .process_group(0)
            .spawn()
            .map(Self)
    }

    pub(crate) fn take_stdin(&mut self) -> Option<ChildInput> {
        self.0.stdin.take()
    }
    pub(crate) fn take_stdout(&mut self) -> Option<ChildOutput> {
        self.0.stdout.take()
    }

    pub(crate) fn try_wait(&mut self) -> io::Result<Option<ExitStatus>> {
        let status = self.0.try_wait()?;
        if status.is_some() {
            self.terminate()?;
        }
        Ok(status)
    }

    pub(crate) fn terminate(&mut self) -> io::Result<()> {
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
