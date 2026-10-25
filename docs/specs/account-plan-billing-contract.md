# PLAN-01: Optional plan, Free quota and billing display contract

**Status:** Proposed documentation-only contract (2026-10-26). Nothing here authorizes network access, native integration, secret storage, data migration, reminders, automatic polling or live connections.

## Owner-approved display rule

**Only display a field when it is available, trustworthy for the selected account/source, current enough for its meaning and semantically relevant. If the field cannot be established, OMIT THE FIELD.** Do not render "Unknown plan", "Not provided", "N/A", dashes, blank payment rows, empty billing panels, "Add manually", or a request for manual subscription dates as replacements.

Plan name, Free/Paid category, quota remaining, reset, renewal, next payment, subscription expiry, trial end, credit expiry and API-key expiry are **independent optional fields**. They may be shown individually. A verified plan does not prove a billing date; a quota reset does not imply a subscription renewal or charge. A quota value must have its own valid source and window.

**One exception for honest application state:** show a separate provider/connection-level state such as Not connected, Coming Soon, Permission required or Unable to refresh when necessary to explain that monitoring is unavailable. This is not an optional plan/billing field and must never appear as a fake remaining quota or 0%. If a provider supports no verified quota reading, omit its numeric quota component while keeping the connection state comprehensible.

The user has explicitly declined manual plan/payment-date entry as a fallback for missing provider information. **PLAN-01 introduces no manual entry flow, reminders, prediction, or persistence.** Future manual billing entry would require separate owner approval and a new security/data-minimization review.

## Identity and ownership

Keep ACC-01 boundaries: Provider, Account, optional Workspace, Connection and authoritative Quota/Billing Source are distinct. Local aliases are not verified identities. A plan belongs to an authorized provider account or entitlement source when evidenced. Usage belongs to a specific quota source. Billing dates belong to the provider-confirmed subscription/billing owner, which may be an organization rather than the account shown.

Do not combine unrelated quotas, credits, currencies, subscription windows, or API metering. Two connections may share one source only after a provider-authorized read establishes that exact relationship. Duplicate aliases or matching plan names prove nothing.

## Proposed normalized concepts (not implementation)

- `PlanKind`: `free | subscription | organization_provided | prepaid | pay_as_you_go | trial | unknown`.
- `AccessState`: `active | trial | paused | cancellation_pending | expired | inactive | unknown`.
- `DataAvailability`: `available | known_zero | unavailable | unsupported | permission_required | provider_blocked | stale | unknown`.
- `Provenance`: `provider_verified | published_reference | unknown`. Published reference data **cannot** be promoted to a user's current balance.
- `PlanSummary`: optional provider-observed `display_name`, `kind`, `access_state` and `billing_cadence`, independently tagged with provenance, source owner, observation time and availability.
- `QuotaReading`: source-specific `unit`, optional `used`, `remaining`, `denominator`, provider-defined window, optional reset, source identity, freshness and data state. Calculate a percent only with an authoritative compatible denominator; `remaining=0` is valid only as an observed known-zero.
- `BillingEvent`: provider-confirmed `meaning`, `occurs_at` (valid instant or precise zoned calendar date), verified `billing_owner_id`, `observed_at`, `source_connection_id` and source-specific accuracy/freshness. No inferred monthly recurrence.

Proposed `BillingEvent.meaning` values are `billing_period_start`, `billing_period_end`, `subscription_renewal`, `next_charge`, `invoice_issued`, `access_expires`, `cancellation_effective`, `promotional_credit_expires`, `prepaid_credit_expires`, `api_key_expires` and `budget_resets`. A quota reset is part of its usage window, **not** a billing event.

These types are conceptual; exact TypeScript/Rust DTOs, IPC schema, size bounds, ownership mapping, migration and data retention need separate design review.

## Rendering and omission rules

- **Plan/subscription name:** show only when a permitted provider read establishes the precise label. A user-entered alias or a static public price table is not proof. If absent, show no plan badge/row.
- **Free/Paid/Organization-provided:** show only when verified for this account/entitlement; do not infer Free from zero spending, Free models, key-level free allowance or lack of payment dates. A Free account may have a real quota.
- **Quota remaining:** show a number only when the current account-bound, provider-authorized, source-specific reading is valid. If absent, hide the numeric quota and percentage, not replace with 0%. Account/connection failure status stays visible when relevant.
- **Quota reset:** show only the reset of a verified source/window. Never reuse a reset across accounts or subscriptions.
- **Next payment / renewal / access expiry:** show only when an authorized, billing-authoritative response explicitly confirms that exact event for the correct billing owner. No static invoice anniversary, plan-price guess or calendar-month inference.
- **Billing period, cancellation effective, trial end, credit expiry, API-key expiry and budget reset:** render only the evidenced event with the exact meaning. Key expiry is not subscription expiry; budget reset is not payment; trial end is not a guaranteed debit.
- **Freshness:** only display a provider field as current if its source/generation remains valid. If stale, suppress its current-value card; an explicitly dated last-observed historical surface may be designed separately, never presented as current.
- **No content:** hide the entire Plan or Subscription & Billing section when it has no eligible children. No manual-entry affordance and no forced whitespace.
- **Presentation:** compact Overview with available plan label/category, source-specific quota and reset. Details progressively reveals only verified optional events. Maintain 320/380/420px usability, keyboard, focus, reduced motion, light/dark/system and both palettes.

## Truth cases

1. **Free with permitted current allowance:** show verified Free plus actual source quota and reset, if each is returned. Omit payment section unless an actual provider-authoritative event applies.
2. **Free with no headless remaining-quota API:** show Free if independently verified; hide numeric quota. Surface a connection-level "quota not supported" status if necessary.
3. **Unknown plan with valid API-key usage:** show usage from that key/source; omit plan name and Free/Paid badge. A key's `free_model_daily_requests` is not proof of the account's subscription tier.
4. **Paid plan confirmed; no billing metadata:** show plan name; omit payment/renewal/expiry entirely.
5. **Billing date verified, plan name unavailable:** show the verified event in Details, if the correct billing owner can be established; omit the plan label.
6. **Employer-provided seat:** show it only with authorized entitlement evidence; do not copy company-level payment dates into the employee account.
7. **Key expired while subscription is active:** show only verified key-expiry metadata; do not mark the subscription expired.
8. **Prepaid API credit expired:** hide unsupported subscription billing and treat credits separately from subscription quota.
9. **Revoked, errored or changed account:** suppress misleading numeric values and billing claims; show necessary monitoring state. Never fall back to Demo.
10. **All fields unavailable:** show only the provider/account identity and truthful connection/availability state, with no empty Plan or Billing panel.

## Security, privacy and correctness invariants

1. Renderer receives strictly sanitized, bounded typed data only, and cannot read tokens, raw provider responses, billing email, addresses, card/invoice information or arbitrary HTML.
2. Source, account, connection generation, provider authorization and billing owner must match before displaying a value; stale or mismatched responses fail closed.
3. The only accepted provider-derived field is one within the adapter's documented read-only authorization. An identity scope alone does not authorize a quota or billing read.
4. Numeric quota values and plan metadata are distinct. "Known zero" must never equal "missing". Source-specific credits cannot be summed with requests, tokens or another wallet.
5. Do not persist billing events or plan observations in ACC-04 localStorage. A separate data-minimization/storage/retention review must explicitly authorize any future persistence.
6. No requests to billing endpoints solely to fill decorative fields, no email/account scraping, no billing prediction, and no user key import before independent credential and provider scope review.
7. Neither these design fields nor provider research alters the closed Codex live flags, native consent, native cleanup or security gates.
8. No additional credentials, admin scopes, inference capabilities or external services are justified merely to show a plan name or date.

## Required future acceptance scenarios

- Account A has Free + current 20-of-50 quota; account B Free but quota unavailable; C paid with only plan name; D has only API key usage.
- No verified billing events, only renewal, only next payment, only expiry, and all three independently: absent rows and empty sections disappear without placeholders.
- An API-key expiry and subscription-expiry on different dates; a verified quota reset matching a billing date by coincidence; budget reset and credit expiry remain separate.
- Multiple connections share verified billing pool; unverified shared identity remains unknown; duplicate aliases; switching account while refresh is in flight.
- Unauthorized 401/403, absent plan, missing window, known zero, invalid or out-of-range date, stale response, revoked consent, source removal and malformed DTO.
- UI snapshots for 320/380/420px, all palettes/appearance modes, navigation/focus/accessibility, with no empty Plan/Billing panels.
- All checks use synthetic fixtures; no real credentials or live provider processes. Owner native acceptance remains separate.

## Delivery gates

1. PROVIDER-01 official source, authorized provider terms and read-only permission review.
2. Typed DTO and source binding, omission/provenance review, then synthetic UI tests.
3. Native connection coordinator, consent and process cleanup under ACC-02; OS-protected app-owned secrets under ACC-03 for key-based providers.
4. Provider-specific owner acceptance before enabling one approved live adapter; F4 Codex gates remain closed independently.

**References:** [PROVIDER-01 matrix](../plans/provider-01-official-capability-matrix.md), [ACC-01 architecture](acc-01-architecture.md), [ACC-04 metadata](acc-04.md), and [Security roadmap](../plans/security-roadmap.md).
