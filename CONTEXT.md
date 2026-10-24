# Quotafern language

Quotafern presents independent monitoring contexts without owning a provider's identity, authentication or billing decisions.

## Language

**Provider**: An integration family with a stable identifier and explicitly assessed adapter capabilities. OpenCode is a client integration family; its upstream services remain distinct billing authorities.

**Account**: A locally identified grouping under one provider, independent of its editable name and any externally verified identity.
_Avoid_: Credential, connection, email identity

**Workspace**: An optional, separately identified context within one account. Two workspaces need not share quotas or billing.

**Connection**: One independently named monitoring relationship to an account and optional workspace, using a session, grant or eligible API key. A connection record is not authorization to monitor.
_Avoid_: Account, login

**Alias**: A local editable display name. Equal aliases do not imply equal accounts, credentials, identities or billing sources.

**Verified identity**: Display information established by a permitted provider read for a specific authorized connection. An alias is never a verified identity.

**Quota source**: An authoritative provider context owning subscription windows, API metering, spending, credits, entitlements or activity. Multiple authorized connections may refer to the same verified source.
_Avoid_: Credential balance, account total

**Unknown billing relationship**: Insufficient authorized evidence to establish whether two observations share billing. Neither shared nor separate billing may be assumed.

**Disconnect**: Stop Quotafern monitoring and revoke its connection authorization. It does not mean provider logout or credential deletion.

**Remove**: Delete local account or connection metadata after monitoring cleanup. It does not delete a provider account or sign out another application.
