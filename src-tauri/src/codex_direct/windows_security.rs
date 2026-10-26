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
pub(super) fn verify_private(file: &File) -> Result<(), Failure> {
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
        if owner.is_null() || dacl.is_null() || IsValidSid(owner) == 0 || EqualSid(owner, user) == 0
        {
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
                            && EqualSid(sid, admins.as_mut_ptr().cast()) == 0)
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

pub(super) fn create_private_directory(path: &std::path::Path) -> Result<(), Failure> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Security::Authorization::{
        ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
        SDDL_REVISION_1,
    };
    use windows_sys::Win32::Storage::FileSystem::CreateDirectoryW;
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
        let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
        if wide.contains(&0) {
            return Err(Failure::UnsafePath);
        }
        wide.push(0);
        if CreateDirectoryW(wide.as_ptr(), &attributes) == 0 {
            return Err(Failure::UnsafePath);
        }
        Ok(())
    }
}
