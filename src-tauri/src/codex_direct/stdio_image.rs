//! Only pinned program bytes cross from the mutable installation into a private cache.
use super::*;
use sha2::{Digest, Sha256};
use std::ffi::OsString;
use std::os::windows::{
    ffi::OsStrExt,
    fs::{MetadataExt, OpenOptionsExt},
    io::AsRawHandle,
};
use windows_sys::Win32::{Foundation::*, Storage::FileSystem::*, System::SystemInformation::*};

const MAX_IMAGE: u64 = 512 * 1024 * 1024;
type PinnedImage = (PathBuf, Vec<fs::File>, fs::File);
fn bounded(cancel: &AtomicBool, deadline: Instant) -> Result<(), Failure> {
    check_cancel(cancel)?;
    if Instant::now() >= deadline {
        return Err(Failure::Timeout);
    }
    Ok(())
}
fn open_image(path: &Path, private: bool) -> Result<fs::File, Failure> {
    let file = OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
        .map_err(|_| Failure::RpcPeerUnsafe)?;
    let metadata = file.metadata().map_err(|_| Failure::RpcPeerUnsafe)?;
    if !metadata.is_file()
        || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
        || metadata.len() == 0
        || metadata.len() > MAX_IMAGE
    {
        return Err(Failure::RpcPeerUnsafe);
    }
    if private {
        windows_security::verify_private(&file).map_err(|_| Failure::RpcPeerUnsafe)?;
        let mut info: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
        if unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } == 0
            || info.nNumberOfLinks != 1
        {
            return Err(Failure::RpcPeerUnsafe);
        }
    }
    Ok(file)
}
fn hash_image(
    file: &mut fs::File,
    mut copy: Option<&mut fs::File>,
    expected: &str,
    cancel: &AtomicBool,
    deadline: Instant,
) -> Result<(), Failure> {
    let mut digest = Sha256::new();
    let mut bytes = [0u8; 65536];
    let mut total = 0u64;
    loop {
        bounded(cancel, deadline)?;
        let count = file.read(&mut bytes).map_err(|_| Failure::RpcPeerUnsafe)?;
        if count == 0 {
            break;
        }
        total += count as u64;
        if total > MAX_IMAGE {
            return Err(Failure::RpcPeerUnsafe);
        }
        digest.update(&bytes[..count]);
        if let Some(target) = copy.as_deref_mut() {
            target
                .write_all(&bytes[..count])
                .map_err(|_| Failure::RpcPeerUnsafe)?;
        }
    }
    if total == 0 || format!("{:x}", digest.finalize()) != expected {
        return Err(Failure::RpcVersionUnsupported);
    }
    Ok(())
}
struct Staging(PathBuf);
impl Drop for Staging {
    fn drop(&mut self) {
        // Only this invocation's create_new file, under still-held directory guards.
        let _ = fs::remove_file(&self.0);
    }
}
fn publish(source: &Path, destination: &Path) -> Result<(), Failure> {
    let wide = |path: &Path| -> Result<Vec<u16>, Failure> {
        let mut value: Vec<u16> = path.as_os_str().encode_wide().collect();
        if value.contains(&0) {
            return Err(Failure::RpcPeerUnsafe);
        }
        value.push(0);
        Ok(value)
    };
    let source = wide(source)?;
    let destination = wide(destination)?;
    // No MOVEFILE_REPLACE_EXISTING: never replace a previously cached image.
    if unsafe { MoveFileExW(source.as_ptr(), destination.as_ptr(), 0) } != 0 {
        return Ok(());
    }
    match unsafe { GetLastError() } {
        ERROR_ALREADY_EXISTS | ERROR_FILE_EXISTS => Ok(()),
        _ => Err(Failure::RpcPeerUnsafe),
    }
}
fn snapshot(
    profile: &Path,
    source: &Path,
    expected: &str,
    cancel: &AtomicBool,
    deadline: Instant,
) -> Result<(PathBuf, Vec<fs::File>, fs::File), Failure> {
    // The source's ancestors are deliberately untrusted; no original image is executed.
    let mut original = open_image(source, false)?;
    let (directory, guards) = windows_security::private_executable_directory(profile, expected)
        .map_err(|_| Failure::RpcPeerUnsafe)?;
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let stage = directory.join(format!(
        ".image-{}-{}.tmp",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::SeqCst)
    ));
    let target =
        windows_security::create_private_file(&stage).map_err(|_| Failure::RpcPeerUnsafe)?;
    let staging = Staging(stage);
    let mut target = target;
    hash_image(&mut original, Some(&mut target), expected, cancel, deadline)?;
    target.sync_all().map_err(|_| Failure::RpcPeerUnsafe)?;
    drop(target);
    bounded(cancel, deadline)?;
    let executable = directory.join("codex.exe");
    publish(&staging.0, &executable)?;
    let mut image = open_image(&executable, true)?;
    hash_image(&mut image, None, expected, cancel, deadline)?;
    Ok((executable, guards, image))
}
fn cached_image(
    profile: &Path,
    expected: &str,
    cancel: &AtomicBool,
    deadline: Instant,
) -> Result<Option<PinnedImage>, Failure> {
    bounded(cancel, deadline)?;
    let (directory, guards) = windows_security::private_executable_directory(profile, expected)
        .map_err(|_| Failure::RpcPeerUnsafe)?;
    let executable = directory.join("codex.exe");
    match fs::symlink_metadata(&executable) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(Failure::RpcPeerUnsafe),
        Ok(_) => {}
    }
    // A changed or unsafe cache is terminal; never repair it from an installation.
    let mut image = open_image(&executable, true)?;
    hash_image(&mut image, None, expected, cancel, deadline)?;
    Ok(Some((executable, guards, image)))
}
pub(super) fn verified_executable(
    profile: &Path,
    cancel: &AtomicBool,
    deadline: Instant,
) -> Result<(PathBuf, Vec<fs::File>, fs::File), Failure> {
    if let Some(image) = cached_image(
        profile,
        existing_stdio::AUDITED_IMAGE_SHA256,
        cancel,
        deadline,
    )? {
        return Ok(image);
    }
    let source =
        crate::codex::direct_login_executable().map_err(|_| Failure::UnsupportedLauncher)?;
    snapshot(
        profile,
        &source,
        existing_stdio::AUDITED_IMAGE_SHA256,
        cancel,
        deadline,
    )
}
fn windows_directory(system: bool) -> Result<PathBuf, Failure> {
    let mut buffer = [0u16; 32768];
    let count = unsafe {
        if system {
            GetSystemDirectoryW(buffer.as_mut_ptr(), buffer.len() as u32)
        } else {
            GetWindowsDirectoryW(buffer.as_mut_ptr(), buffer.len() as u32)
        }
    } as usize;
    if count == 0 || count >= buffer.len() {
        return Err(Failure::RpcPeerUnsafe);
    }
    use std::os::windows::ffi::OsStringExt;
    let path = PathBuf::from(OsString::from_wide(&buffer[..count]));
    if !path.is_absolute() {
        return Err(Failure::RpcPeerUnsafe);
    }
    Ok(path)
}
pub(super) fn environment(
    home: &Path,
    executable_directory: &Path,
) -> Result<Vec<(OsString, OsString)>, Failure> {
    let system = windows_directory(true)?;
    let windows = windows_directory(false)?;
    let path = std::env::join_paths([executable_directory, system.as_path(), windows.as_path()])
        .map_err(|_| Failure::RpcPeerUnsafe)?;
    let mut env = vec![
        ("PATH".into(), path),
        ("SystemRoot".into(), windows.as_os_str().into()),
        ("WINDIR".into(), windows.as_os_str().into()),
    ];
    for key in [
        "TEMP",
        "TMP",
        "USERPROFILE",
        "HOME",
        "APPDATA",
        "LOCALAPPDATA",
    ] {
        if let Some(value) = std::env::var_os(key) {
            env.push((key.into(), value));
        }
    }
    env.push(("CODEX_HOME".into(), home.as_os_str().into()));
    env.push((MARKER.into(), "1".into()));
    env.push(("RUST_LOG".into(), "off".into()));
    Ok(env)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn private_program_snapshot_rechecks_content_and_refuses_unsafe_reuse() {
        let app = tauri::test::mock_app();
        let profile = app.path().home_dir().unwrap();
        let fixture = profile.join(format!(
            ".quotafern-image-synthetic-{}-{}",
            std::process::id(),
            now_ms().unwrap()
        ));
        secure_create(&fixture).unwrap();
        let source = fixture.join("untrusted-program-bytes");
        let bytes = b"synthetic executable bytes - never executed";
        fs::write(&source, bytes).unwrap();
        let hash = format!("{:x}", Sha256::digest(bytes));
        let cancel = AtomicBool::new(false);
        let deadline = Instant::now() + Duration::from_secs(10);
        assert!(cached_image(&fixture, &hash, &cancel, deadline)
            .unwrap()
            .is_none());
        let (cached, guards, image) =
            snapshot(&fixture, &source, &hash, &cancel, deadline).unwrap();
        assert_ne!(cached, source);
        assert!(OpenOptions::new().write(true).open(&cached).is_err());
        assert!(fs::rename(cached.parent().unwrap(), fixture.join("replacement")).is_err());
        assert_eq!(fs::read(&cached).unwrap(), bytes);
        drop(image);
        drop(guards);
        assert!(snapshot(&fixture, &source, &hash, &cancel, deadline).is_ok());
        fs::write(&source, b"changed installation").unwrap();
        assert!(cached_image(&fixture, &hash, &cancel, deadline)
            .unwrap()
            .is_some());
        assert!(matches!(
            snapshot(&fixture, &source, &hash, &cancel, deadline),
            Err(Failure::RpcVersionUnsupported)
        ));
        fs::write(&source, bytes).unwrap();
        fs::write(&cached, b"changed cache").unwrap();
        assert!(matches!(
            cached_image(&fixture, &hash, &cancel, deadline),
            Err(Failure::RpcVersionUnsupported)
        ));
        assert!(matches!(
            snapshot(&fixture, &source, &hash, &cancel, deadline),
            Err(Failure::RpcVersionUnsupported)
        ));
        assert_eq!(fs::read(&cached).unwrap(), b"changed cache"); // No replacement/repair.
        fs::write(&cached, bytes).unwrap();
        let alias = fixture.join("hardlink");
        fs::hard_link(&cached, &alias).unwrap();
        assert!(matches!(
            cached_image(&fixture, &hash, &cancel, deadline),
            Err(Failure::RpcPeerUnsafe)
        ));
        assert!(matches!(
            snapshot(&fixture, &source, &hash, &cancel, deadline),
            Err(Failure::RpcPeerUnsafe)
        ));
        fs::remove_file(alias).unwrap();
        let env = environment(Path::new("C:\\synthetic-home"), cached.parent().unwrap()).unwrap();
        let paths: Vec<_> =
            std::env::split_paths(&env.iter().find(|(k, _)| k == "PATH").unwrap().1).collect();
        assert_eq!(paths.len(), 3);
        assert_eq!(paths[0], cached.parent().unwrap());
        assert!(
            fixture.starts_with(&profile)
                && fixture
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with(".quotafern-image-synthetic-")
        );
        fs::remove_dir_all(fixture).unwrap();
    }
}
