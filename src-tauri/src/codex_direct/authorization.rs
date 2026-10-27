//! Native-only remembered monitoring authority. Never part of ACC-04 metadata.
use super::*;
use sha2::{Digest, Sha256};
use std::io::Write;

const SCHEMA: u32 = 2;
const MAX_RECORD: u64 = 4096;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Grant {
    version: u32,
    pub account_id: String,
    pub connection_id: String,
    pub kind: DirectKind,
    auto_reconnect: bool,
    in_flight: bool,
    policy: String,
    pub identity_hash: String,
    pub revision: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Remembered {
    account_id: String,
    connection_id: String,
    kind: DirectKind,
    allowed: bool,
}
fn policy(kind: DirectKind) -> String {
    #[cfg(windows)]
    if kind == DirectKind::System {
        return format!(
            "codex-auto-01/4/svelte-consent/stdio-private-cache/180000/{}",
            existing_stdio::AUDITED_IMAGE_SHA256
        );
    }
    let _ = kind;
    "codex-auto-01/4/svelte-consent/direct/180000".into()
}
impl Grant {
    fn current_policy(&self) -> bool {
        self.version == SCHEMA && self.auto_reconnect && self.policy == policy(self.kind)
    }
    pub fn allowed(&self) -> bool {
        self.current_policy() && !self.in_flight
    }
}
pub(super) fn fingerprint(kind: DirectKind, identity: &str) -> Result<String, Failure> {
    let mut hash = Sha256::new();
    hash.update(b"quotafern-native-monitoring-identity-v1\0");
    #[cfg(windows)]
    if kind == DirectKind::System {
        let fields: Value = serde_json::from_str(identity).map_err(|_| Failure::IdentityChanged)?;
        // Stable workspace and user identity only. Subscription upgrades are not a new identity.
        for index in [0, 1] {
            let value = fields
                .get(index)
                .and_then(Value::as_str)
                .filter(|v| !v.is_empty())
                .ok_or(Failure::IdentityChanged)?;
            hash.update((value.len() as u64).to_le_bytes());
            hash.update(value.as_bytes());
        }
        return Ok(format!("{:x}", hash.finalize()));
    }
    let _ = kind;
    hash.update(identity.as_bytes());
    Ok(format!("{:x}", hash.finalize()))
}
pub(super) fn check_identity(operation: &Operation, identity: &str) -> Result<(), Failure> {
    if let Some(expected) = &operation.expected_identity_hash {
        if fingerprint(operation.kind, identity)? != *expected {
            return Err(Failure::IdentityChanged);
        }
    }
    Ok(())
}
pub(super) struct Store {
    directory: PathBuf,
    _guards: Vec<fs::File>,
}
fn storage<T>(result: Result<T, Failure>) -> Result<T, Failure> {
    result.map_err(|_| Failure::AuthorizationStorageUnsafe)
}
impl Store {
    pub fn open(profile: &Path, create: bool) -> Result<Option<Self>, Failure> {
        let directory = profile.join(".quotafern").join("codex-authorizations");
        if !create {
            match fs::symlink_metadata(&directory) {
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
                Err(_) => return Err(Failure::AuthorizationStorageUnsafe),
                Ok(_) => {}
            }
        }
        #[cfg(windows)]
        let guards = storage(windows_security::authorization_directory(profile))?;
        #[cfg(unix)]
        let guards = {
            use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
            let mut guards = Vec::new();
            let mut chain: Vec<_> = profile.ancestors().collect();
            chain.reverse();
            for path in chain {
                let file = OpenOptions::new()
                    .read(true)
                    .custom_flags(libc::O_NOFOLLOW | libc::O_DIRECTORY | libc::O_CLOEXEC)
                    .open(path)
                    .map_err(|_| Failure::AuthorizationStorageUnsafe)?;
                let meta = file
                    .metadata()
                    .map_err(|_| Failure::AuthorizationStorageUnsafe)?;
                if !meta.is_dir()
                    || (meta.uid() != unsafe { libc::geteuid() } && meta.uid() != 0)
                    || meta.mode() & 0o022 != 0
                {
                    return Err(Failure::AuthorizationStorageUnsafe);
                }
                guards.push(file);
            }
            for path in [profile.join(".quotafern"), directory.clone()] {
                storage(secure_create(&path))?;
                let file = OpenOptions::new()
                    .read(true)
                    .custom_flags(libc::O_NOFOLLOW | libc::O_DIRECTORY | libc::O_CLOEXEC)
                    .open(path)
                    .map_err(|_| Failure::AuthorizationStorageUnsafe)?;
                let meta = file
                    .metadata()
                    .map_err(|_| Failure::AuthorizationStorageUnsafe)?;
                if !meta.is_dir()
                    || meta.uid() != unsafe { libc::geteuid() }
                    || meta.mode() & 0o777 != 0o700
                {
                    return Err(Failure::AuthorizationStorageUnsafe);
                }
                guards.push(file);
            }
            guards
        };
        Ok(Some(Self {
            directory,
            _guards: guards,
        }))
    }
    fn path(&self, account: &str, connection: &str) -> Result<PathBuf, Failure> {
        valid_ids(account, connection).map_err(|_| Failure::AuthorizationStorageUnsafe)?;
        Ok(self.directory.join(format!("{connection}.json")))
    }
    fn read_file(&self, path: &Path) -> Result<Option<fs::File>, Failure> {
        let mut options = OpenOptions::new();
        options.read(true).write(true);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            use windows_sys::Win32::Storage::FileSystem::*;
            options
                .share_mode(FILE_SHARE_READ)
                .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC);
        }
        let file = match options.open(path) {
            Ok(file) => file,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(Failure::AuthorizationStorageUnsafe),
        };
        let meta = file
            .metadata()
            .map_err(|_| Failure::AuthorizationStorageUnsafe)?;
        if !meta.is_file() || meta.len() > MAX_RECORD || meta.permissions().readonly() {
            return Err(Failure::AuthorizationStorageUnsafe);
        }
        #[cfg(windows)]
        {
            use std::os::windows::{fs::MetadataExt, io::AsRawHandle};
            use windows_sys::Win32::Storage::FileSystem::*;
            if meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
                return Err(Failure::AuthorizationStorageUnsafe);
            }
            storage(windows_security::verify_private(&file))?;
            let mut info: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
            if unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } == 0
                || info.nNumberOfLinks != 1
            {
                return Err(Failure::AuthorizationStorageUnsafe);
            }
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if meta.uid() != unsafe { libc::geteuid() }
                || meta.mode() & 0o777 != 0o600
                || meta.nlink() != 1
            {
                return Err(Failure::AuthorizationStorageUnsafe);
            }
        }
        Ok(Some(file))
    }
    fn read(&self, path: &Path) -> Result<Option<Grant>, Failure> {
        let Some(file) = self.read_file(path)? else {
            return Ok(None);
        };
        let grant: Grant = serde_json::from_reader(file.take(MAX_RECORD + 1))
            .map_err(|_| Failure::AuthorizationStorageUnsafe)?;
        valid_ids(&grant.account_id, &grant.connection_id)
            .map_err(|_| Failure::AuthorizationStorageUnsafe)?;
        if grant.policy.len() > 256
            || grant.identity_hash.len() != 64
            || !grant.identity_hash.bytes().all(|b| b.is_ascii_hexdigit())
            || grant.revision == 0
            || path != self.path(&grant.account_id, &grant.connection_id)?
        {
            return Err(Failure::AuthorizationStorageUnsafe);
        }
        Ok(Some(grant))
    }
    pub fn load(&self, account: &str, connection: &str) -> Result<Grant, Failure> {
        let grant = self
            .read(&self.path(account, connection)?)?
            .ok_or(Failure::RememberedConsentRequired)?;
        if grant.account_id != account || grant.connection_id != connection || !grant.allowed() {
            return Err(Failure::RememberedConsentRequired);
        }
        Ok(grant)
    }
    pub fn load_for_finish(
        &self,
        account: &str,
        connection: &str,
        revision: u64,
    ) -> Result<Grant, Failure> {
        let grant = self
            .read(&self.path(account, connection)?)?
            .ok_or(Failure::RememberedConsentRequired)?;
        if grant.account_id != account || grant.revision != revision || !grant.current_policy() {
            return Err(Failure::RememberedConsentRequired);
        }
        Ok(grant)
    }
    pub fn suspend(&self, mut grant: Grant) -> Result<(), Failure> {
        if !grant.allowed() {
            return Err(Failure::RememberedConsentRequired);
        }
        grant.in_flight = true;
        self.write_grant(grant).map(|_| ())
    }
    pub fn release(&self, account: &str, connection: &str, revision: u64) -> Result<(), Failure> {
        let mut grant = self.load_for_finish(account, connection, revision)?;
        if !grant.in_flight {
            return Ok(());
        }
        grant.in_flight = false;
        self.write_grant(grant).map(|_| ())
    }
    pub fn list(&self) -> Result<Vec<Remembered>, Failure> {
        let mut results = Vec::new();
        let entries =
            fs::read_dir(&self.directory).map_err(|_| Failure::AuthorizationStorageUnsafe)?;
        for (count, entry) in entries.enumerate() {
            if count >= 128 {
                return Err(Failure::AuthorizationStorageUnsafe);
            }
            let entry = entry.map_err(|_| Failure::AuthorizationStorageUnsafe)?;
            if entry
                .file_name()
                .to_str()
                .is_some_and(|n| n.starts_with(".pending-"))
            {
                continue;
            }
            let grant = self
                .read(&entry.path())?
                .ok_or(Failure::AuthorizationStorageUnsafe)?;
            if !grant.auto_reconnect {
                continue;
            }
            results.push(Remembered {
                account_id: grant.account_id.clone(),
                connection_id: grant.connection_id.clone(),
                kind: grant.kind,
                allowed: grant.allowed(),
            });
            if results.len() > MAX_CONNECTIONS {
                return Err(Failure::AuthorizationStorageUnsafe);
            }
        }
        Ok(results)
    }
    pub fn remove(&self, account: &str, connection: &str) -> Result<(), Failure> {
        let path = self.path(account, connection)?;
        if let Some(mut grant) = self.read(&path)? {
            if grant.account_id != account {
                return Err(Failure::AuthorizationStorageUnsafe);
            }
            // Revoke durably even if a non-delete-sharing external handle prevents unlink.
            // A partial write is invalid authority and therefore also fails closed.
            grant.auto_reconnect = false;
            let mut file = self
                .read_file(&path)?
                .ok_or(Failure::AuthorizationStorageUnsafe)?;
            file.set_len(0)
                .map_err(|_| Failure::AuthorizationStorageUnsafe)?;
            serde_json::to_writer(&mut file, &grant)
                .map_err(|_| Failure::AuthorizationStorageUnsafe)?;
            file.flush()
                .and_then(|_| file.sync_all())
                .map_err(|_| Failure::AuthorizationStorageUnsafe)?;
            drop(file);
            let _ = fs::remove_file(&path);
            #[cfg(unix)]
            fs::File::open(&self.directory)
                .and_then(|f| f.sync_all())
                .map_err(|_| Failure::AuthorizationStorageUnsafe)?;
        }
        Ok(())
    }
    pub fn save(
        &self,
        account: &str,
        connection: &str,
        kind: DirectKind,
        identity: &str,
    ) -> Result<Grant, Failure> {
        let path = self.path(account, connection)?;
        if self.read(&path)?.is_some_and(|g| g.account_id != account) {
            return Err(Failure::AuthorizationStorageUnsafe);
        }
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
        let revision = now_ms()
            .ok_or(Failure::AuthorizationStorageUnsafe)?
            .checked_add(NEXT.fetch_add(1, Ordering::SeqCst))
            .ok_or(Failure::AuthorizationStorageUnsafe)?;
        let grant = Grant {
            version: SCHEMA,
            account_id: account.into(),
            connection_id: connection.into(),
            kind,
            auto_reconnect: true,
            in_flight: false,
            policy: policy(kind),
            identity_hash: fingerprint(kind, identity)?,
            revision,
        };
        self.write_grant(grant)
    }
    fn write_grant(&self, grant: Grant) -> Result<Grant, Failure> {
        let path = self.path(&grant.account_id, &grant.connection_id)?;
        if self
            .read(&path)?
            .is_some_and(|g| g.account_id != grant.account_id)
        {
            return Err(Failure::AuthorizationStorageUnsafe);
        }
        let revision = grant.revision;
        static NEXT_WRITE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let stage = self.directory.join(format!(
            ".pending-{}-{revision}-{}",
            std::process::id(),
            NEXT_WRITE.fetch_add(1, Ordering::SeqCst)
        ));
        #[cfg(windows)]
        let file = storage(windows_security::create_private_file(&stage))?;
        #[cfg(unix)]
        let file = {
            use std::os::unix::fs::OpenOptionsExt;
            OpenOptions::new()
                .write(true)
                .create_new(true)
                .mode(0o600)
                .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
                .open(&stage)
                .map_err(|_| Failure::AuthorizationStorageUnsafe)?
        };
        let result = (|| {
            let mut file = file;
            serde_json::to_writer(&mut file, &grant)
                .map_err(|_| Failure::AuthorizationStorageUnsafe)?;
            file.flush()
                .and_then(|_| file.sync_all())
                .map_err(|_| Failure::AuthorizationStorageUnsafe)?;
            drop(file);
            #[cfg(windows)]
            {
                use std::os::windows::ffi::OsStrExt;
                use windows_sys::Win32::Storage::FileSystem::*;
                let a: Vec<u16> = stage.as_os_str().encode_wide().chain(Some(0)).collect();
                let b: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
                if unsafe {
                    MoveFileExW(
                        a.as_ptr(),
                        b.as_ptr(),
                        MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
                    )
                } == 0
                {
                    return Err(Failure::AuthorizationStorageUnsafe);
                }
            }
            #[cfg(unix)]
            {
                fs::rename(&stage, &path).map_err(|_| Failure::AuthorizationStorageUnsafe)?;
                fs::File::open(&self.directory)
                    .and_then(|f| f.sync_all())
                    .map_err(|_| Failure::AuthorizationStorageUnsafe)?;
            }
            Ok(grant)
        })();
        let _ = fs::remove_file(stage);
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (PathBuf, Store) {
        let app = tauri::test::mock_app();
        let profile = app.path().home_dir().unwrap();
        static NEXT_FIXTURE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let root = profile.join(format!(
            ".quotafern-auto-synthetic-{}-{}-{}",
            std::process::id(),
            now_ms().unwrap(),
            NEXT_FIXTURE.fetch_add(1, Ordering::SeqCst)
        ));
        secure_create(&root).unwrap();
        assert!(Store::open(&root, false).unwrap().is_none());
        let store = Store::open(&root, true).unwrap().unwrap();
        (root, store)
    }
    const ACCOUNT: &str = "account_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const CONNECTION: &str = "connection_bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb";
    #[test]
    fn native_grants_are_private_versioned_references_without_raw_identity() {
        let (root, store) = fixture();
        assert!(store.list().unwrap().is_empty());
        let first = store
            .save(
                ACCOUNT,
                CONNECTION,
                DirectKind::Managed,
                "synthetic-native-identity",
            )
            .unwrap();
        assert!(store.load(ACCOUNT, CONNECTION).unwrap().allowed());
        let text = fs::read_to_string(store.path(ACCOUNT, CONNECTION).unwrap()).unwrap();
        assert!(
            !text.contains("synthetic-native-identity")
                && !text.contains("auth.json")
                && !text.contains("token")
        );
        assert_eq!(store.list().unwrap().len(), 1);
        let second = store
            .save(
                ACCOUNT,
                CONNECTION,
                DirectKind::Managed,
                "synthetic-native-identity",
            )
            .unwrap();
        assert_ne!(first.revision, second.revision);
        let mut incompatible = second.clone();
        incompatible.policy = "old-policy".into();
        fs::write(
            store.path(ACCOUNT, CONNECTION).unwrap(),
            serde_json::to_vec(&incompatible).unwrap(),
        )
        .unwrap();
        assert!(!store.list().unwrap()[0].allowed);
        assert!(matches!(
            store.load(ACCOUNT, CONNECTION),
            Err(Failure::RememberedConsentRequired)
        ));
        store.remove(ACCOUNT, CONNECTION).unwrap();
        assert!(store.list().unwrap().is_empty());
        assert!(store.load(ACCOUNT, CONNECTION).is_err());
        assert!(store
            .load("account_cccccccc-cccc-4ccc-9ccc-cccccccccccc", "../invalid")
            .is_err());
        let _new = store
            .save(ACCOUNT, CONNECTION, DirectKind::Managed, "synthetic")
            .unwrap();
        let path = store.path(ACCOUNT, CONNECTION).unwrap();
        let alias = root.join("synthetic-hardlink");
        fs::hard_link(&path, &alias).unwrap();
        assert!(matches!(
            store.load(ACCOUNT, CONNECTION),
            Err(Failure::AuthorizationStorageUnsafe)
        ));
        fs::remove_file(alias).unwrap();
        fs::write(&path, b"{\"version\":1,\"version\":2}").unwrap();
        assert!(store.load(ACCOUNT, CONNECTION).is_err());
        drop(store);
        assert!(root
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with(".quotafern-auto-synthetic-"));
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(windows)]
    #[test]
    fn revocation_remains_effective_when_unlink_is_blocked() {
        use std::os::windows::fs::OpenOptionsExt;
        use windows_sys::Win32::Storage::FileSystem::*;
        let (root, store) = fixture();
        store
            .save(ACCOUNT, CONNECTION, DirectKind::Managed, "synthetic")
            .unwrap();
        let path = store.path(ACCOUNT, CONNECTION).unwrap();
        let blocker = OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
            .open(&path)
            .unwrap();
        store.remove(ACCOUNT, CONNECTION).unwrap();
        assert!(path.exists());
        assert!(store.list().unwrap().is_empty());
        assert!(matches!(
            store.load(ACCOUNT, CONNECTION),
            Err(Failure::RememberedConsentRequired)
        ));
        drop(blocker);
        store.remove(ACCOUNT, CONNECTION).unwrap();
        assert!(!path.exists());
        drop(store);
        assert!(root
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with(".quotafern-auto-synthetic-"));
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(windows)]
    #[test]
    fn stable_system_fingerprint_excludes_plan_but_not_workspace_or_user() {
        let hash = |id: &str, email: &str, plan: &str| {
            fingerprint(
                DirectKind::System,
                &serde_json::to_string(&(id, email, plan)).unwrap(),
            )
            .unwrap()
        };
        assert_eq!(
            hash("workspace-a", "user@example.invalid", "free"),
            hash("workspace-a", "user@example.invalid", "plus")
        );
        assert_ne!(
            hash("workspace-a", "user@example.invalid", "plus"),
            hash("workspace-b", "user@example.invalid", "plus")
        );
        assert_ne!(
            hash("workspace-a", "user@example.invalid", "plus"),
            hash("workspace-a", "other@example.invalid", "plus")
        );
        assert!(fingerprint(DirectKind::System, "not-an-identity").is_err());
    }
}
