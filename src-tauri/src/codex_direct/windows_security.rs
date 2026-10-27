//! Fail closed unless the opened object belongs to the current user and its
//! DACL grants access only to that user, SYSTEM, or built-in administrators.
use super::Failure;
use std::fs::File;
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::ptr::{addr_of_mut, null_mut};
use windows_sys::Win32::Foundation::LocalFree;
use windows_sys::Win32::Security::Authorization::{GetSecurityInfo, SE_FILE_OBJECT};
use windows_sys::Win32::Security::*;
use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

struct Descriptor(PSECURITY_DESCRIPTOR);
impl Drop for Descriptor {
    fn drop(&mut self) {
        unsafe {
            LocalFree(self.0);
        }
    }
}
#[derive(Clone, Copy)]
enum Policy {
    Private,
    SystemHome,
    Ancestor,
    VolumeRoot,
}

pub(super) fn verify_private(file: &File) -> Result<(), Failure> {
    verify_security(file, Policy::Private, false)
}

// Ancestors may be readable, but may not be replaced or have their security
// changed by another principal. Sensitive children are still private and created
// atomically; precreation can deny service but cannot authorize a credential read.
fn expanded_directory_mask(mut mask: u32) -> u32 {
    use windows_sys::Win32::Storage::FileSystem::*;
    let mapping = GENERIC_MAPPING {
        GenericRead: FILE_GENERIC_READ,
        GenericWrite: FILE_GENERIC_WRITE,
        GenericExecute: FILE_GENERIC_EXECUTE,
        GenericAll: FILE_ALL_ACCESS,
    };
    unsafe { MapGenericMask(&mut mask, &mapping) };
    mask
}

fn outsider_directory_read_only(mask: u32) -> bool {
    use windows_sys::Win32::Storage::FileSystem::*;
    expanded_directory_mask(mask) & !(FILE_GENERIC_READ | FILE_GENERIC_EXECUTE) == 0
}

fn outsider_can_mutate(mask: u32) -> bool {
    use windows_sys::Win32::Storage::FileSystem::*;
    expanded_directory_mask(mask)
        & (DELETE
            | FILE_DELETE_CHILD
            | WRITE_DAC
            | WRITE_OWNER
            | FILE_WRITE_ATTRIBUTES
            | FILE_WRITE_EA)
        != 0
}

unsafe fn volume_owner_is_installer(owner: PSID) -> bool {
    // The OS volume root can be owned by Windows Modules Installer. This fixed
    // OS service is trusted only at the volume anchor, never for credential ACLs.
    let name: Vec<u16> = "NT SERVICE\\TrustedInstaller\0".encode_utf16().collect();
    let mut sid_bytes = 0;
    let mut domain_chars = 0;
    let mut kind = 0;
    LookupAccountNameW(
        null_mut(),
        name.as_ptr(),
        null_mut(),
        &mut sid_bytes,
        null_mut(),
        &mut domain_chars,
        &mut kind,
    );
    if sid_bytes == 0 || sid_bytes > 65536 || domain_chars > 65536 {
        return false;
    }
    let mut sid = vec![0usize; (sid_bytes as usize).div_ceil(size_of::<usize>())];
    let mut domain = vec![0u16; domain_chars as usize];
    LookupAccountNameW(
        null_mut(),
        name.as_ptr(),
        sid.as_mut_ptr().cast(),
        &mut sid_bytes,
        domain.as_mut_ptr(),
        &mut domain_chars,
        &mut kind,
    ) != 0
        && IsValidSid(sid.as_mut_ptr().cast()) != 0
        && EqualSid(owner, sid.as_mut_ptr().cast()) != 0
}

fn verify_security(file: &File, policy: Policy, require_protected: bool) -> Result<(), Failure> {
    unsafe {
        let mut token = null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return Err(Failure::UnsafePath);
        }
        let token = OwnedHandle::from_raw_handle(token);
        let mut length = 0;
        GetTokenInformation(token.as_raw_handle(), TokenUser, null_mut(), 0, &mut length);
        if length == 0 || length > 65536 {
            return Err(Failure::UnsafePath);
        }
        let mut user_storage = vec![0usize; (length as usize).div_ceil(size_of::<usize>())];
        if GetTokenInformation(
            token.as_raw_handle(),
            TokenUser,
            user_storage.as_mut_ptr().cast(),
            length,
            &mut length,
        ) == 0
        {
            return Err(Failure::UnsafePath);
        }
        let user = (*(user_storage.as_ptr().cast::<TOKEN_USER>())).User.Sid;
        let mut owner = null_mut();
        let mut dacl = null_mut();
        let mut descriptor = null_mut();
        if GetSecurityInfo(
            file.as_raw_handle(),
            SE_FILE_OBJECT,
            OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION,
            &mut owner,
            null_mut(),
            &mut dacl,
            null_mut(),
            &mut descriptor,
        ) != 0
        {
            return Err(Failure::UnsafePath);
        }
        let _descriptor = Descriptor(descriptor);
        if require_protected {
            let mut control = 0;
            let mut revision = 0;
            if GetSecurityDescriptorControl(descriptor, &mut control, &mut revision) == 0
                || control & SE_DACL_PROTECTED == 0
            {
                return Err(Failure::UnsafePath);
            }
        }
        if owner.is_null() || dacl.is_null() || IsValidSid(owner) == 0 {
            return Err(Failure::UnsafePath);
        }
        let mut system = [0usize; 16];
        let mut admins = [0usize; 16];
        for (kind, storage) in [
            (WinLocalSystemSid, &mut system),
            (WinBuiltinAdministratorsSid, &mut admins),
        ] {
            let mut size = size_of_val(storage) as u32;
            if CreateWellKnownSid(kind, null_mut(), storage.as_mut_ptr().cast(), &mut size) == 0 {
                return Err(Failure::UnsafePath);
            }
        }
        let trusted_owner = EqualSid(owner, user) != 0
            || (!matches!(policy, Policy::Private | Policy::SystemHome)
                && (EqualSid(owner, system.as_mut_ptr().cast()) != 0
                    || EqualSid(owner, admins.as_mut_ptr().cast()) != 0
                    || (matches!(policy, Policy::VolumeRoot) && volume_owner_is_installer(owner))));
        if !trusted_owner {
            return Err(Failure::UnsafePath);
        }
        if IsValidAcl(dacl) == 0 {
            return Err(Failure::UnsafePath);
        }
        for index in 0..(*dacl).AceCount {
            let mut ace = null_mut();
            if GetAce(dacl, u32::from(index), &mut ace) == 0 {
                return Err(Failure::UnsafePath);
            }
            let header = &*ace.cast::<ACE_HEADER>();
            if header.AceFlags & 0x08 != 0 {
                continue;
            } // INHERIT_ONLY_ACE
            match header.AceType {
                1 => continue, // A deny ACE cannot disclose the credential.
                0 => {
                    if usize::from(header.AceSize) < size_of::<ACCESS_ALLOWED_ACE>() {
                        return Err(Failure::UnsafePath);
                    }
                    let allowed = ace.cast::<ACCESS_ALLOWED_ACE>();
                    let sid = addr_of_mut!((*allowed).SidStart).cast();
                    if IsValidSid(sid) == 0
                        || (EqualSid(sid, user) == 0
                            && EqualSid(sid, system.as_mut_ptr().cast()) == 0
                            && EqualSid(sid, admins.as_mut_ptr().cast()) == 0
                            && match policy {
                                Policy::Private => true,
                                Policy::SystemHome => {
                                    !outsider_directory_read_only((*allowed).Mask)
                                }
                                Policy::Ancestor | Policy::VolumeRoot => {
                                    outsider_can_mutate((*allowed).Mask)
                                }
                            })
                    {
                        return Err(Failure::UnsafePath);
                    }
                }
                _ => return Err(Failure::UnsafePath),
            }
        }
        Ok(())
    }
}

fn with_private_descriptor<T>(
    create: impl FnOnce(&SECURITY_ATTRIBUTES) -> Result<T, Failure>,
) -> Result<T, Failure> {
    use windows_sys::Win32::Security::Authorization::{
        ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
        SDDL_REVISION_1,
    };
    unsafe {
        let mut token = null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return Err(Failure::UnsafePath);
        }
        let token = OwnedHandle::from_raw_handle(token);
        let mut length = 0;
        GetTokenInformation(token.as_raw_handle(), TokenUser, null_mut(), 0, &mut length);
        if length == 0 || length > 65536 {
            return Err(Failure::UnsafePath);
        }
        let mut user_storage = vec![0usize; (length as usize).div_ceil(size_of::<usize>())];
        if GetTokenInformation(
            token.as_raw_handle(),
            TokenUser,
            user_storage.as_mut_ptr().cast(),
            length,
            &mut length,
        ) == 0
        {
            return Err(Failure::UnsafePath);
        }
        let user = (*(user_storage.as_ptr().cast::<TOKEN_USER>())).User.Sid;
        let mut sid_text = null_mut();
        if ConvertSidToStringSidW(user, &mut sid_text) == 0 {
            return Err(Failure::UnsafePath);
        }
        let _sid_text = Descriptor(sid_text.cast());
        let mut length = 0;
        while *sid_text.add(length) != 0 {
            length += 1;
            if length > 256 {
                return Err(Failure::UnsafePath);
            }
        }
        let user = String::from_utf16(std::slice::from_raw_parts(sid_text, length))
            .map_err(|_| Failure::UnsafePath)?;
        // TokenOwner can be Administrators for elevated processes. Match the strict
        // TokenUser ownership check at creation, without relaxing the protected DACL.
        let sddl: Vec<u16> =
            format!("O:{user}D:P(A;OICI;FA;;;{user})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)\0")
                .encode_utf16()
                .collect();
        let mut descriptor = null_mut();
        if ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            SDDL_REVISION_1,
            &mut descriptor,
            null_mut(),
        ) == 0
        {
            return Err(Failure::UnsafePath);
        }
        let _descriptor = Descriptor(descriptor);
        let attributes = SECURITY_ATTRIBUTES {
            nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: descriptor,
            bInheritHandle: 0,
        };
        create(&attributes)
    }
}
fn wide_path(path: &std::path::Path) -> Result<Vec<u16>, Failure> {
    use std::os::windows::ffi::OsStrExt;
    let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
    if wide.contains(&0) {
        return Err(Failure::UnsafePath);
    }
    wide.push(0);
    Ok(wide)
}
pub(super) fn create_private_directory(path: &std::path::Path) -> Result<(), Failure> {
    let wide = wide_path(path)?;
    with_private_descriptor(|attributes| {
        if unsafe {
            windows_sys::Win32::Storage::FileSystem::CreateDirectoryW(wide.as_ptr(), attributes)
        } == 0
        {
            return Err(Failure::UnsafePath);
        }
        Ok(())
    })
}
pub(super) fn create_private_file(path: &std::path::Path) -> Result<File, Failure> {
    use windows_sys::Win32::{Foundation::*, Storage::FileSystem::*};
    let wide = wide_path(path)?;
    with_private_descriptor(|attributes| {
        let handle = unsafe {
            CreateFileW(
                wide.as_ptr(),
                GENERIC_READ | GENERIC_WRITE,
                0,
                attributes,
                CREATE_NEW,
                FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT,
                std::ptr::null_mut(),
            )
        };
        if handle == INVALID_HANDLE_VALUE {
            return Err(Failure::UnsafePath);
        }
        Ok(unsafe { File::from_raw_handle(handle) })
    })
}
pub(super) fn authorization_directory(profile: &std::path::Path) -> Result<Vec<File>, Failure> {
    use std::os::windows::fs::OpenOptionsExt;
    use windows_sys::Win32::Storage::FileSystem::*;
    let mut guards = verify_executable_chain(&profile.join("authorization-anchor"))?;
    for path in [
        profile.join(".quotafern"),
        profile.join(".quotafern").join("codex-authorizations"),
    ] {
        super::secure_create(&path)?;
        guards.push(open_directory(&path, Policy::Private)?);
    }
    let directory = profile.join(".quotafern").join("codex-authorizations");
    guards.push(
        std::fs::OpenOptions::new()
            .access_mode(
                READ_CONTROL
                    | FILE_READ_ATTRIBUTES
                    | FILE_LIST_DIRECTORY
                    | FILE_ADD_FILE
                    | FILE_DELETE_CHILD,
            )
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
            .open(directory)
            .map_err(|_| Failure::AuthorizationStorageUnsafe)?,
    );
    Ok(guards)
}
pub(super) fn private_executable_directory(
    profile: &std::path::Path,
    hash: &str,
) -> Result<(std::path::PathBuf, Vec<File>), Failure> {
    if hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(Failure::RpcPeerUnsafe);
    }
    let mut guards = verify_executable_chain(&profile.join("executable-anchor"))?;
    let root = profile.join(".quotafern");
    let binaries = root.join("codex-binaries");
    let cache = binaries.join(hash);
    for path in [&root, &binaries, &cache] {
        super::secure_create(path)?;
        guards.push(open_directory(path, Policy::Private)?);
    }
    Ok((cache, guards))
}

// Handles deny delete sharing while the chain is checked and private children
// are created. Opened-object attributes are checked too, closing the lstat/open gap.
fn open_directory(path: &std::path::Path, policy: Policy) -> Result<File, Failure> {
    use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
    use windows_sys::Win32::Storage::FileSystem::*;
    let directory = std::fs::OpenOptions::new()
        .access_mode(READ_CONTROL | FILE_READ_ATTRIBUTES | FILE_LIST_DIRECTORY)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
        .map_err(|_| Failure::UnsafePath)?;
    let metadata = directory.metadata().map_err(|_| Failure::UnsafePath)?;
    if !metadata.is_dir() || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(Failure::UnsafePath);
    }
    verify_security(&directory, policy, matches!(policy, Policy::Private))?;
    Ok(directory)
}

// Return guards so the verified, non-reparse directory chain stays pinned until
// the caller finishes the credential-file validation and read. Directory listing
// is not credential authority: the file still uses the unchanged Private policy.
pub(super) fn verify_system_home(path: &std::path::Path) -> Result<Vec<File>, Failure> {
    super::reject_links(path)?;
    let mut chain: Vec<_> = path.ancestors().collect();
    chain.reverse();
    let last = chain.len().checked_sub(1).ok_or(Failure::UnsafePath)?;
    let mut guards = Vec::new();
    for (index, ancestor) in chain.into_iter().enumerate() {
        let policy = if index == last {
            Policy::SystemHome
        } else if index == 0 {
            Policy::VolumeRoot
        } else {
            Policy::Ancestor
        };
        guards.push(open_directory(ancestor, policy)?);
    }
    Ok(guards)
}
pub(super) fn verify_executable_chain(path: &std::path::Path) -> Result<Vec<File>, Failure> {
    let parent = path.parent().ok_or(Failure::UnsafePath)?;
    super::reject_links(parent)?;
    let mut chain: Vec<_> = parent.ancestors().collect();
    chain.reverse();
    chain
        .into_iter()
        .enumerate()
        .map(|(index, path)| {
            open_directory(
                path,
                if index == 0 {
                    Policy::VolumeRoot
                } else {
                    Policy::Ancestor
                },
            )
        })
        .collect()
}
pub(super) fn managed_home(
    profile: &std::path::Path,
    account: &str,
) -> Result<std::path::PathBuf, Failure> {
    super::reject_links(profile).map_err(|_| Failure::ManagedProfileUnsafe)?;
    let mut chain: Vec<_> = profile.ancestors().collect();
    chain.reverse();
    let mut guards = Vec::new();
    for (index, ancestor) in chain.into_iter().enumerate() {
        guards.push(
            open_directory(
                ancestor,
                if index == 0 {
                    Policy::VolumeRoot
                } else {
                    Policy::Ancestor
                },
            )
            .map_err(|_| Failure::ManagedProfileUnsafe)?,
        );
    }
    // A fixed location avoids silently choosing a different identity when an
    // app-data ACL changes. Never copy, migrate, or repair an existing home.
    let root = profile.join(".quotafern");
    let homes = root.join("codex-homes");
    let home = homes.join(account);
    for (path, failure) in [
        (&root, Failure::ManagedRootUnsafe),
        (&homes, Failure::ManagedHomesUnsafe),
        (&home, Failure::ManagedAccountUnsafe),
    ] {
        super::secure_create(path).map_err(|_| failure)?;
        guards.push(open_directory(path, Policy::Private).map_err(|_| failure)?);
    }
    Ok(home)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::windows::fs::OpenOptionsExt;
    use std::path::Path;
    use tauri::Manager;
    use windows_sys::Win32::Foundation::{
        GENERIC_ALL, GENERIC_EXECUTE, GENERIC_READ, GENERIC_WRITE,
    };
    use windows_sys::Win32::Security::Authorization::*;
    use windows_sys::Win32::Storage::FileSystem::*;

    // Mutate only a newly created synthetic directory, never application storage.
    fn grant_everyone(path: &Path, mask: u32, inheritance: u32) {
        let file = std::fs::OpenOptions::new()
            .access_mode(READ_CONTROL | WRITE_DAC)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
            .open(path)
            .unwrap();
        unsafe {
            let mut dacl = null_mut();
            let mut descriptor = null_mut();
            assert_eq!(
                GetSecurityInfo(
                    file.as_raw_handle(),
                    SE_FILE_OBJECT,
                    DACL_SECURITY_INFORMATION,
                    null_mut(),
                    null_mut(),
                    &mut dacl,
                    null_mut(),
                    &mut descriptor
                ),
                0
            );
            let _descriptor = Descriptor(descriptor);
            let mut world = [0usize; 16];
            let mut length = size_of_val(&world) as u32;
            assert_ne!(
                CreateWellKnownSid(
                    WinWorldSid,
                    null_mut(),
                    world.as_mut_ptr().cast(),
                    &mut length
                ),
                0
            );
            let entry = EXPLICIT_ACCESS_W {
                grfAccessPermissions: mask,
                grfAccessMode: GRANT_ACCESS,
                grfInheritance: inheritance,
                Trustee: TRUSTEE_W {
                    pMultipleTrustee: null_mut(),
                    MultipleTrusteeOperation: NO_MULTIPLE_TRUSTEE,
                    TrusteeForm: TRUSTEE_IS_SID,
                    TrusteeType: TRUSTEE_IS_WELL_KNOWN_GROUP,
                    ptstrName: world.as_mut_ptr().cast(),
                },
            };
            let mut new_dacl = null_mut();
            assert_eq!(SetEntriesInAclW(1, &entry, dacl, &mut new_dacl), 0);
            let _new_dacl = Descriptor(new_dacl.cast());
            assert_eq!(
                SetSecurityInfo(
                    file.as_raw_handle(),
                    SE_FILE_OBJECT,
                    DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
                    null_mut(),
                    null_mut(),
                    new_dacl,
                    null_mut()
                ),
                0
            );
        }
    }

    #[test]
    fn system_directory_read_is_not_credential_file_authority() {
        use std::io::Write;
        let app = tauri::test::mock_app();
        let profile = app.path().home_dir().unwrap();
        let fixture = profile.join(format!(
            ".quotafern-system-synthetic-{}-{}",
            std::process::id(),
            super::super::now_ms().unwrap()
        ));
        super::super::secure_create(&fixture).unwrap();
        let home = fixture.join("system");
        super::super::secure_create(&home).unwrap();
        let path = home.join("auth.json");
        let mut file = std::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .access_mode(GENERIC_WRITE | WRITE_OWNER | READ_CONTROL)
            .open(&path)
            .unwrap();
        file.write_all(br#"{"tokens":{"access_token":"synthetic-access-token-only","account_id":"synthetic-account"}}"#).unwrap();
        super::super::tests::set_synthetic_file_owner(&file, &home);
        drop(file);
        let config_path = home.join("config.toml");
        std::fs::write(&config_path, "cli_auth_credentials_store = 'file'\n").unwrap();
        let config = std::fs::OpenOptions::new()
            .access_mode(WRITE_OWNER | READ_CONTROL)
            .open(&config_path)
            .unwrap();
        super::super::tests::set_synthetic_file_owner(&config, &home);
        drop(config);
        // Keep a safe descriptor copy, not a credential copy. This fixture repair
        // models protecting just a file; the real system ACL is never touched.
        let file = std::fs::OpenOptions::new()
            .access_mode(READ_CONTROL | WRITE_DAC | FILE_READ_ATTRIBUTES)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
            .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
            .open(&path)
            .unwrap();
        unsafe {
            let mut safe_dacl = null_mut();
            let mut descriptor = null_mut();
            assert_eq!(
                GetSecurityInfo(
                    file.as_raw_handle(),
                    SE_FILE_OBJECT,
                    DACL_SECURITY_INFORMATION,
                    null_mut(),
                    null_mut(),
                    &mut safe_dacl,
                    null_mut(),
                    &mut descriptor
                ),
                0
            );
            let _descriptor = Descriptor(descriptor);
            // Setup only: reproduce inherited outsider RX on synthetic config and auth files.
            grant_everyone(&home, FILE_GENERIC_READ | FILE_GENERIC_EXECUTE, 3);
            assert!(verify_system_home(&home).is_ok());
            assert!(open_directory(&home, Policy::Private).is_err());
            assert!(matches!(
                super::super::read_credentials(
                    &home,
                    &std::sync::atomic::AtomicBool::new(false),
                    super::super::DirectKind::System
                ),
                Err(Failure::ConfigFileUnsafe)
            ));
            assert!(verify_private(&file).is_err());
            assert!(matches!(
                super::super::read_credentials(
                    &home,
                    &std::sync::atomic::AtomicBool::new(false),
                    super::super::DirectKind::Managed
                ),
                Err(Failure::CredentialDirectoryUnsafe)
            ));
            for index in 0..(*safe_dacl).AceCount {
                let mut ace = null_mut();
                assert_ne!(GetAce(safe_dacl, u32::from(index), &mut ace), 0);
                (*ace.cast::<ACE_HEADER>()).AceFlags &= !0x10; // convert inherited entries to explicit
            }
            let config = std::fs::OpenOptions::new()
                .access_mode(READ_CONTROL | WRITE_DAC | FILE_READ_ATTRIBUTES)
                .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
                .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
                .open(&config_path)
                .unwrap();
            assert_eq!(
                SetSecurityInfo(
                    config.as_raw_handle(),
                    SE_FILE_OBJECT,
                    DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
                    null_mut(),
                    null_mut(),
                    safe_dacl,
                    null_mut()
                ),
                0
            );
            assert!(super::super::require_file_store(&home).is_ok());
            assert!(matches!(
                super::super::read_credentials(
                    &home,
                    &std::sync::atomic::AtomicBool::new(false),
                    super::super::DirectKind::System
                ),
                Err(Failure::CredentialFileUnsafe)
            ));
            drop(config);
            assert_eq!(
                SetSecurityInfo(
                    file.as_raw_handle(),
                    SE_FILE_OBJECT,
                    DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
                    null_mut(),
                    null_mut(),
                    safe_dacl,
                    null_mut()
                ),
                0
            );
            assert!(verify_private(&file).is_ok());
        }
        drop(file);
        assert!(super::super::read_credentials(
            &home,
            &std::sync::atomic::AtomicBool::new(false),
            super::super::DirectKind::System
        )
        .is_ok());
        // Current upstream renewal shape keeps the existing file and its DACL.
        let mut file = std::fs::OpenOptions::new()
            .truncate(true)
            .write(true)
            .open(&path)
            .unwrap();
        file.write_all(br#"{"tokens":{"access_token":"synthetic-renewed-token-only","account_id":"synthetic-account"}}"#).unwrap();
        drop(file);
        assert!(super::super::read_credentials(
            &home,
            &std::sync::atomic::AtomicBool::new(false),
            super::super::DirectKind::System
        )
        .is_ok());
        // A delete/recreate writer can reintroduce inherited read: fail closed.
        std::fs::remove_file(&path).unwrap();
        std::fs::write(&path, br#"{"tokens":{"access_token":"synthetic-recreated-only","account_id":"synthetic-account"}}"#).unwrap();
        assert!(matches!(
            super::super::read_credentials(
                &home,
                &std::sync::atomic::AtomicBool::new(false),
                super::super::DirectKind::System
            ),
            Err(Failure::CredentialFileUnsafe)
        ));
        for mask in [
            FILE_ADD_FILE,
            FILE_ADD_SUBDIRECTORY,
            FILE_WRITE_EA,
            FILE_WRITE_ATTRIBUTES,
            DELETE,
            FILE_DELETE_CHILD,
            WRITE_DAC,
            WRITE_OWNER,
            GENERIC_WRITE,
            GENERIC_ALL,
        ] {
            assert!(!outsider_directory_read_only(mask));
        }
        assert!(outsider_directory_read_only(GENERIC_READ | GENERIC_EXECUTE));
        // A safe child never authorizes using a replaceable system ancestor.
        grant_everyone(&fixture, FILE_DELETE_CHILD, 0);
        assert!(verify_system_home(&home).is_err());
        assert!(fixture.starts_with(&profile));
        assert!(fixture
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with(".quotafern-system-synthetic-"));
        std::fs::remove_dir_all(&fixture).unwrap();
    }
    #[test]
    fn managed_storage_safe_and_unsafe_windows_layouts() {
        let app = tauri::test::mock_app();
        let profile = app.path().home_dir().unwrap();
        let fixture = profile.join(format!(
            ".quotafern-storage-synthetic-{}-{}",
            std::process::id(),
            super::super::now_ms().unwrap()
        ));
        super::super::secure_create(&fixture).unwrap();
        // A legitimately readable/create-child ancestor must not be treated as
        // a credential directory. Inheritable outsider ACEs must stop at D:P.
        grant_everyone(&fixture, FILE_GENERIC_READ | FILE_ADD_SUBDIRECTORY, 3);
        assert!(open_directory(&fixture, Policy::Private).is_err());
        assert!(open_directory(&fixture, Policy::Ancestor).is_ok());
        let home = managed_home(&fixture, "account_00000000-0000-4000-8000-000000000001").unwrap();
        assert!(open_directory(&home, Policy::Private).is_ok());
        assert!(open_directory(home.parent().unwrap(), Policy::Private).is_ok());
        assert!(open_directory(&fixture.join(".quotafern"), Policy::Private).is_ok());
        // Reuse is stable and revalidates, without rewriting any ACL.
        assert_eq!(
            managed_home(&fixture, "account_00000000-0000-4000-8000-000000000001").unwrap(),
            home
        );

        let grant_guards = authorization_directory(&fixture).unwrap();
        drop(grant_guards);
        let store = super::super::authorization::Store::open(&fixture, false)
            .unwrap()
            .unwrap();
        let account = "account_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
        let connection = "connection_bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb";
        store
            .save(
                account,
                connection,
                super::super::DirectKind::Managed,
                "synthetic",
            )
            .unwrap();
        let permission = fixture
            .join(".quotafern")
            .join("codex-authorizations")
            .join(format!("{connection}.json"));
        grant_everyone(&permission, FILE_GENERIC_READ, 0);
        assert!(matches!(
            store.load(account, connection),
            Err(Failure::AuthorizationStorageUnsafe)
        ));
        let bridge = super::super::DirectBridge::default();
        assert!(bridge
            .reserve_remembered(&fixture, account, connection)
            .is_err());
        assert!(bridge.0.lock().unwrap().sessions.is_empty());
        drop(store);
        let cache_hash = "a".repeat(64);
        let (cache, cache_guards) = private_executable_directory(&fixture, &cache_hash).unwrap();
        assert!(open_directory(&cache, Policy::Private).is_ok());
        let program = create_private_file(&cache.join("synthetic-program")).unwrap();
        assert!(verify_private(&program).is_ok());
        drop(program);
        drop(cache_guards);
        let precreated = fixture.join("precreated");
        super::super::secure_create(&precreated).unwrap();
        super::super::secure_create(&precreated.join(".quotafern")).unwrap();
        grant_everyone(&precreated.join(".quotafern"), FILE_GENERIC_READ, 0);
        assert!(matches!(
            managed_home(&precreated, "account_00000000-0000-4000-8000-000000000001"),
            Err(Failure::ManagedRootUnsafe)
        ));
        assert!(open_directory(&precreated.join(".quotafern"), Policy::Private).is_err());
        assert!(private_executable_directory(&precreated, &cache_hash).is_err());
        assert!(authorization_directory(&precreated).is_err());

        // Each replacement/security right remains fatal on an ancestor.
        for (index, mask) in [
            DELETE,
            FILE_DELETE_CHILD,
            WRITE_DAC,
            WRITE_OWNER,
            FILE_WRITE_ATTRIBUTES,
            FILE_WRITE_EA,
            0x10000000,
            0x40000000,
        ]
        .into_iter()
        .enumerate()
        {
            let ancestor = fixture.join(format!("unsafe-{index}"));
            super::super::secure_create(&ancestor).unwrap();
            grant_everyone(&ancestor, mask, 0);
            assert!(open_directory(&ancestor, Policy::Ancestor).is_err());
            assert!(matches!(
                managed_home(&ancestor, "account_00000000-0000-4000-8000-000000000001"),
                Err(Failure::ManagedProfileUnsafe)
            ));
            assert!(private_executable_directory(&ancestor, &cache_hash).is_err());
            assert!(authorization_directory(&ancestor).is_err());
            assert!(!ancestor.join(".quotafern").exists());
        }
        assert!(!outsider_can_mutate(0x80000000)); // GENERIC_READ
        assert!(!outsider_can_mutate(FILE_ADD_FILE | FILE_ADD_SUBDIRECTORY));
        assert!(outsider_can_mutate(0x10000000)); // GENERIC_ALL
        assert!(outsider_can_mutate(0x40000000)); // GENERIC_WRITE

        let junction_case = fixture.join("junction-case");
        super::super::secure_create(&junction_case).unwrap();
        let target = fixture.join("junction-target");
        super::super::secure_create(&target).unwrap();
        let link = junction_case.join(".quotafern");
        let result = std::process::Command::new("cmd.exe")
            .args(["/D", "/C", "mklink", "/J"])
            .arg(&link)
            .arg(&target)
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "synthetic junction creation failed"
        );
        assert!(matches!(
            managed_home(
                &junction_case,
                "account_00000000-0000-4000-8000-000000000001"
            ),
            Err(Failure::ManagedRootUnsafe)
        ));
        assert!(private_executable_directory(&junction_case, &cache_hash).is_err());
        assert!(authorization_directory(&junction_case).is_err());
        std::fs::remove_dir(&link).unwrap();
        assert!(target.exists());
        // This fixture name and root are fixed by this test, never provider input.
        assert!(fixture.starts_with(&profile));
        assert!(fixture
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with(".quotafern-storage-synthetic-"));
        std::fs::remove_dir_all(&fixture).unwrap();
    }
}
