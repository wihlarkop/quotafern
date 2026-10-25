# PLAN-01: Account plan, Free quota and subscription/billing display contract

**Status:** Proposed documentation-only contract (2026-10-26). This file **does not implement** data fields, migrations, provider calls, persistence, reminders, background polling, payment access, or any live adapter. It extends ACC-01/ACC-04 conceptually without authorizing a runtime change.

## User outcome

For **each distinct local account/workspace/connection context**, the user should understand:

- Provider and editable local account alias, with separately verified provider identity if officially available.
- **Plan display name** when verified (e.g., ChatGPT Plus, Copilot Free, Google AI Pro, Claude Pro). Use **Unknown plan** if no verified or explicitly manually designated plan is available.
- **Entitlement / pricing category**: Free, subscription-paid, organization-provided, prepaid credits, pay-as-you-go, or unknown. These are not interchangeable.
- Whether a numeric quota reading is available, unavailable, known zero, stale, blocked, unsupported, or based only on a static public allowance.
- Relevant usage/quota windows and their next reset times.
- **Subscription renewal**, **next payment**, **subscription access expiry**, and (separately) **credit / key expiry** when known. Do not conflate with usage reset or budget reset.
- Evidence source, verification or manual provenance, freshness, and the billing owner that the data belongs to.

## Identity and ownership

The proposed plan attaches to a **provider-authoritative account or verified subscription entitlement** when evidenced, never to a local display alias alone. Usage attaches to its authoritative **quota source**. Billing dates attach to the verified **subscription / billing owner**, which may be a workspace or organization different from the local account.

A connection never constitutes proof of a paid subscription or access to billing. Two connections may use one underlying billing source; show that pool once only if sharing is provider-verified. An unverified relationship is unknown, not assumed separate or combined.

Plan name, quota, billing details, and credential/key expiry have **independent per-field provenance**. A plan label from one connection does not license displaying billing dates from a different account.

## Proposed types (TypeScript-like specification, not executable implementation)

    PlanKind =
      free | subscription | organization_provided | prepaid |
      pay_as_you_go | trial | unknown

    AccessState =
      active | trial | paused | cancellation_pending |
      expired | inactive | unknown

    DataAvailability =
      available | known_zero | unavailable | unsupported |
      permission_required | provider_blocked | stale | unknown

    Provenance =
      provider_verified | user_entered | published_reference | unknown

    DateMeaning =
      quota_reset | billing_period_start | billing_period_end |
      subscription_renewal | next_charge | invoice_issued |
      access_expires | cancellation_effective |
      promotional_credit_expires | prepaid_credit_expires |
      api_key_expires | budget_resets

    ObservedField<T> =
      value: T | null
      provenance: Provenance
      observed_at: timestamp | null
      source_connection_id: opaque ID | null
      source_owner_id: opaque verified ID | null
      availability: DataAvailability
      reason_code: allowlisted non-secret code | null

    PlanSummary =
      display_name: ObservedField<string>
      kind: ObservedField<PlanKind>
      access_state: ObservedField<AccessState>
      billing_cadence: ObservedField<monthly | annual | usage_based | none | unknown>
      entitlement_scope: account | workspace | organization | unknown

    BillingEvent =
      meaning: DateMeaning
      occurs_at: ISO timestamp or calendar date with explicit zone/cadence
      provenance: Provenance
      owner_id: opaque verified billing owner ID or local manual owner ID
      observed_at: timestamp | null
      recurrence_policy: none | provider_supplied | user_declared_monthly | user_declared_annual
      next_event_confirmed: boolean

    QuotaReading =
      quota_source_id: opaque ID
      unit: requests | tokens | credits | currency | percentage | other
      denominator: number | null
      remaining: number | null
      used: number | null
      quota_window: provider-defined window | null
      reset_event: BillingEvent | null  # only meaning quota_reset
      availability: DataAvailability
      observed_at: timestamp | null

These are proposed design notions, **not a persistence/schema migration**. Exact fields, allowed identifiers, bounds and Rust DTOs require separate architectural review. A static public allowance may be presented as a clearly labelled reference value but **never** inserted as an observed account balance.

## UI truth table

| Condition                                                 | Plan label                                        | Remaining                                   | Payment / renewal                                                  |
| --------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| Verified Free account with current permitted usage result | Free / verified name                              | Actual returned Free quota                  | No subscription charge **only if confirmed**; otherwise Unknown    |
| Verified Free account with no machine-readable usage      | Free                                              | Quota unavailable, not 0%                   | No payment estimate                                                |
| No provider plan evidence and no manual selection         | Unknown plan                                      | Not connected / unavailable                 | Unknown                                                            |
| Provider reports planType but not billing                 | Report observed plan and its source               | Only observed source quota                  | Unknown; usage planType is not an invoice authority                |
| User sets plan manually                                   | Manually set: [name]                              | Never manufactured from name                | Only explicitly user-entered dates, marked Manual                  |
| Paid account with a provider-confirmed future charge      | Verified paid plan                                | Current quota if available                  | Next payment date with provider source                             |
| Annual subscription / team seat managed by employer       | Verified seat / organization-provided if observed | Own verified entitlement                    | Billing date may be not applicable to seat holder, else Unknown    |
| Provider reports expired API key                          | Do not mark whole subscription expired            | Key-related source unavailable              | Label **API key expires/expired**, not subscription                |
| Prepaid API credits                                       | Prepaid / pay-as-you-go if evidenced              | Credit balance only, not subscription quota | Credit expiry if returned, next charge unknown                     |
| Connection revoked, source stale or changed               | Last known label with stale marker or Unknown     | Never current                               | Manual dates can remain as Manual; provider observations are stale |

## Date semantics and manual entry

**Provider-verified dates:** only accept direct authoritative read or a specifically documented provider response explicitly about that event and billing owner. Keep UTC instant and source timezone, or original calendar date with timezone and day precision. The renderer uses the user's locale for display, but must not mutate the underlying event.

**Manual entry (optional future UX):** support explicit local-only user-entered subscription label, cadence (monthly/annual/custom), billing anniversary/next charge, renewal, and access expiry. Each field is labelled **Manually added · Not provider verified** and can be edited/cleared. No mailbox scan, invoice parsing, bank access, automatic card charge, or remote sync. A user-specified recurring day such as the 31st requires an explicit last-day policy before any reminder calculation. Do not silently create next monthly charge predictions on unspecified 29–31 day behavior or after cancellation.

**Potentially sensitive:** billing cadence/dates and manually entered plan names are non-secret in type but reveal purchase patterns. Any storage requires a separate data-minimization, consent, corruption-recovery, retention/removal, and quota-limits review before adjusting ACC-04 localStorage. No invoice number, card, transaction ID, billing email, provider account secret, full API key, or billing-address field.

**Expiry distinctions:**
- Subscription expiry: loss of entitlement at an access end date, if evidenced.
- Cancellation effective date: automatic renewal stops or access ends depending on provider terms; not automatically the next invoice date.
- Renewal: contract/entitlement rollover; may not result in a payment (e.g., employer-paid).
- Next charge: future bill or debit; not the same as plan quota reset.
- Trial end: may transition to paid only if provider confirms; no invented charge.
- API-key expiry: a connection credential becomes invalid, but provider account may be active.
- Credit expiry: a balance may lapse; not subscription termination.
- Budget reset: limit reopens, not an actual payment.

### Billing date presentation

Default card should stay compact: **Plan · Free/Paid/Unknown**, main quota with reset if observed. Details may contain **Subscription & billing** with four separately labelled rows: Next payment, Renewal, Access expires, Billing period; plus optional Credit/key expiry under their own headings. If no values are available, prefer **Not provided by provider** with an optional future **Add manually** affordance rather than an invented date. If no subscription exists, use **No subscription** only if established; otherwise **Unknown**.

No badge or alarm should say payment due merely because resetAt is near. Free plans with usage limits still have a quota area. If billing has no meaning (Free with verified no subscription), omit the payment rows rather than showing a misleading $0 monthly charge.

## Security, freshness, and consistency invariants

1. Plan, account identity, billing owner, quota source and source freshness are tracked independently.
2. **Provider-observed** does not mean billing-authoritative. Classify every source contract by fields and scopes.
3. Renderer accepts sanitized bounded field names and dates only; no raw auth payload, tokens, emails from other apps, card details or arbitrary HTML.
4. Missing values remain unknown. Do not auto-calculate a percentage when denominator is unknown or divide credits in differing units.
5. Renderer cannot forge native cleanup, grant permissions or override the closed live connection gate.
6. A manually entered plan must **never** be auto-promoted to verified; a future provider observation can be displayed alongside it with an explicit source distinction.
7. On account removal, remove only permitted local manual records owned by that stable account ID after cleanup rules are satisfied; do not delete unrelated provider metadata.
8. Stale data cannot be used to infer current subscription or payment. Last-observed information must be clearly dated if displayed.
9. Do not reuse account A's billing events when selecting account B, even with duplicate aliases.
10. All display/action states must work in 320/380/420px widths, light/dark/system, both palettes, keyboard, IME, long aliases and reduced motion.

## Acceptance scenarios required for future implementation

- Free account with actual 20-of-50 quota, Free without any quota endpoint, and Free with static published limit only.
- Paid name known, renewal unknown; renewal known but next charge unknown; next charge known with billing owner; annual prepaid and org-paid seat.
- Same-date quota reset and payment only by coincidence: fields remain distinct.
- Reset at UTC midnight while user is in Asia/Jakarta; calendar day/month boundary, DST and local display are correct.
- API key expires while subscription remains active; credit expires while subscription remains active.
- Billing cadence monthly on day 29/30/31, including February and cancellation.
- Multiple keys share verified wallet, with one shared source; unknown relationship stays unknown.
- Duplicate account aliases, account switching while refresh is in flight, stale data, removed sources, corrupt manual metadata, storage-write failure, and native-managed account removal blocked.
- Manual/provider conflict and provenance switch: never silently overwrite or claim verified.
- Unauthorized, 401/403, data unavailable, malformed timestamp, wildly future/out-of-range dates, missing reset, and known-zero quotas remain fail-closed.
- All source tests synthetic; no use of developer/CI user credentials. Native owner acceptance and explicit approval before live use.

## Dependency and delivery

1. PROVIDER-01 and independent security review select one technically **and legally** eligible adapter.
2. Approve typed source-specific normalized DTO and migration/per-field provenance.
3. Approve manual-billing preference persistence separately; preserve ACC-04 bounded local metadata contract until then.
4. ACC-02 native multi-account coordinator; ACC-03 credential ownership and OS storage if needed.
5. UI in distinct reviewable slice; source/browser/native tests; no automatic reminders, mail sync, payments or provider connection in this documentation milestone.

**Reference:** [PROVIDER-01 assessment](../plans/provider-01-official-capability-matrix.md), [ACC-01 account model](acc-01-architecture.md), [ACC-04 local metadata](acc-04.md), [Security roadmap](../plans/security-roadmap.md).
