/** ACC-01 presentation/domain contract. No secret, RPC or native authority fields. */
export type LocalKind = "account" | "workspace" | "connection" | "source" | "window";
export type LocalId<K extends LocalKind> = `${K}_${string}`;
export type AccountId = LocalId<"account">;
export type WorkspaceId = LocalId<"workspace">;
export type ConnectionId = LocalId<"connection">;
export type SourceId = LocalId<"source">;

export function createLocalId<K extends LocalKind>(kind: K): LocalId<K> {
  return `${kind}_${crypto.randomUUID()}`;
}

export function isLocalId<K extends LocalKind>(value: unknown, kind: K): value is LocalId<K> {
  return (
    typeof value === "string" &&
    new RegExp(
      `^${kind}_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
    ).test(value)
  );
}

export function isProviderId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9-]{0,47}$/.test(value);
}

export const MAX_ALIAS_LENGTH = 80;
// Keep emoji joiners/variation selectors, while rejecting hidden formatting and fillers.
export const FORBIDDEN_ALIAS_CHARACTERS =
  /[\p{Cc}\u00ad\u061c\u115f\u1160\u180e\u200b\u200e\u200f\u202a-\u202e\u2060-\u206f\u3164\ufeff\uffa0]|\u034f|\u17b4|\u17b5/u;
export function validateAlias(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Preserve Unicode/emoji and duplicate names, but reject controls and bidi overrides.
  if (FORBIDDEN_ALIAS_CHARACTERS.test(value)) return null;
  const alias = value.normalize("NFC").trim();
  if (!/[\p{L}\p{N}\p{P}\p{S}]/u.test(alias) || Array.from(alias).length > MAX_ALIAS_LENGTH)
    return null;
  return alias;
}

export type Mechanism = "cli-session" | "codex-managed" | "oauth-grant" | "api-key";
export interface Provider {
  id: string;
  displayName: string;
  adapter: "gated" | "coming-soon";
  /** Presentation catalogue only; absent until a separately scoped provider setup exists. */
  accountSetupAvailable?: boolean;
  capabilities: {
    monitoring: false;
    multipleAccounts: "unverified";
    workspaces: "unverified";
    multipleKeys: "unverified";
  };
}

export const PROVIDERS: readonly Provider[] = [
  ["codex", "Codex"],
  ["claude-code", "Claude Code"],
  ["gemini-cli", "Gemini CLI"],
  ["github-copilot", "GitHub Copilot"],
  ["opencode", "OpenCode-connected services"],
  ["openrouter", "OpenRouter"],
].map(([id, displayName]) => ({
  id,
  displayName,
  adapter: id === "codex" ? "gated" : "coming-soon",
  capabilities: {
    monitoring: false,
    multipleAccounts: "unverified",
    workspaces: "unverified",
    multipleKeys: "unverified",
  },
}));

export interface Account {
  id: AccountId;
  providerId: string;
  alias: string;
}
export interface Workspace {
  id: WorkspaceId;
  accountId: AccountId;
  alias: string;
}
export interface Connection {
  id: ConnectionId;
  accountId: AccountId;
  workspaceId: WorkspaceId | null;
  alias: string;
  mechanism: Mechanism;
}
/** Only this allowlisted structural/alias envelope can ever be serialized. */
export interface AccountMetadata {
  version: 1;
  accounts: Account[];
  workspaces: Workspace[];
  connections: Connection[];
}
export const emptyMetadata = (): AccountMetadata => ({
  version: 1,
  accounts: [],
  workspaces: [],
  connections: [],
});

export type Diagnostic =
  | "authentication-expired"
  | "unavailable"
  | "refresh-failed"
  | "cleanup-failed";
export type Lifecycle = "disconnected" | "connecting" | "connected" | "auth-required" | "error";
export interface ConnectionRuntime {
  connectionId: ConnectionId;
  generation: number;
  lifecycle: Lifecycle;
  consent: "not-requested" | "granted";
  authorization: "not-requested" | "granted" | "expired";
  lastSuccessAtMs: number | null;
  diagnostic: Diagnostic | null;
}
export type Freshness = "current" | "stale" | "unknown" | "unavailable" | "error";
export interface SourceData {
  plan?: "Free" | "Go" | "Plus" | "Pro";
  subscription: {
    id: LocalId<"window">;
    label: string;
    remainingPercent: number | null;
    resetAtMs: number | null;
    durationMins: number | null;
  }[];
  apiMetering: { value: number | null; unit: "tokens" | "requests" } | null;
  spending: { used: string | null; limit: string | null; currency: string | null } | null;
  credits: { balance: string | null; unit: "provider-credits"; unlimited: boolean | null } | null;
  entitlements: { earnedResets: number | null } | null;
  activity: { date: string; tokens: number | null }[] | null;
}
export interface QuotaSource {
  id: SourceId;
  providerId: string;
  accountId: AccountId;
  workspaceId: WorkspaceId | null;
  /** Verified is an authorized adapter assertion, never an alias comparison. */
  association:
    | { kind: "verified"; connectionIds: ConnectionId[] }
    | { kind: "unknown"; connectionIds: [ConnectionId] };
  /** Native-validated generation for every association, not only the observing connection. */
  connectionGenerations: Partial<Record<ConnectionId, number>>;
  origin: "live" | "synthetic";
  authority: "authorized-provider-read" | "synthetic-fixture";
  freshness: Freshness;
  fetchedAtMs: number | null;
  staleAfterMs: number;
  data: SourceData;
}
export interface VerifiedIdentity {
  accountId: AccountId;
  connectionId: ConnectionId;
  /** Sanitized display text from a separately authorized adapter, never a credential ID. */
  label: string;
}
export interface AccountState {
  metadata: AccountMetadata;
  connections: ConnectionRuntime[];
  sources: QuotaSource[];
  identities: VerifiedIdentity[];
  removingAccountIds: AccountId[];
}
