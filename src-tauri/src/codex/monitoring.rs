use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;

const MAX_BUCKETS: usize = 16;
const MAX_RESET_DETAILS: usize = 64;
const MAX_ACTIVITY_DAYS: usize = 400;
const MAX_DECIMAL_LENGTH: usize = 64;
const MAX_SAFE_JS_INTEGER: u64 = 9_007_199_254_740_991;
const MAX_SAFE_TIMESTAMP_MS: u64 = 8_640_000_000_000_000;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CodexMonitoring {
    pub(super) buckets: Vec<MonitoringBucket>,
    pub(super) earned_resets: Option<EarnedResets>,
    pub(super) activity: CodexActivity,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct MonitoringBucket {
    pub(super) label: String,
    pub(super) credits: Option<Credits>,
    pub(super) spending: Option<Spending>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Credits {
    pub(super) has_credits: Option<bool>,
    pub(super) unlimited: Option<bool>,
    pub(super) balance: Option<String>,
    pub(super) unit: &'static str,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Spending {
    pub(super) limit: Option<String>,
    pub(super) used: Option<String>,
    pub(super) remaining_percent: Option<f64>,
    pub(super) reset_at_ms: Option<u64>,
    pub(super) unit: Option<&'static str>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct EarnedResets {
    pub(super) available_count: Option<u64>,
    pub(super) details: Option<Vec<ResetDetail>>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(super) struct ResetDetail {
    pub(super) status: ResetStatus,
    pub(super) granted_at_ms: Option<u64>,
    pub(super) expires_at_ms: Option<u64>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(super) enum ResetStatus {
    Available,
    Redeeming,
    Redeemed,
    Unknown,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CodexActivity {
    pub(super) state: ActivityState,
    pub(super) summary: ActivitySummary,
    pub(super) daily_buckets: Option<Vec<DailyBucket>>,
    pub(super) fetched_at_ms: Option<u64>,
    pub(super) diagnostic: Option<&'static str>,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(super) enum ActivityState {
    Unavailable,
    Current,
    Stale,
    Error,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ActivitySummary {
    pub(super) lifetime_tokens: Option<u64>,
    pub(super) peak_daily_tokens: Option<u64>,
    pub(super) current_streak_days: Option<u64>,
    pub(super) longest_streak_days: Option<u64>,
    pub(super) longest_running_turn_sec: Option<u64>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(super) struct DailyBucket {
    pub(super) date: String,
    pub(super) tokens: Option<u64>,
}

impl CodexMonitoring {
    pub(super) fn unavailable() -> Self {
        Self {
            buckets: Vec::new(),
            earned_resets: None,
            activity: CodexActivity::unavailable(None),
        }
    }
}

impl CodexActivity {
    fn unavailable(diagnostic: Option<&'static str>) -> Self {
        Self {
            state: ActivityState::Unavailable,
            summary: ActivitySummary::empty(),
            daily_buckets: None,
            fetched_at_ms: None,
            diagnostic,
        }
    }

    pub(super) fn mark_stale(&mut self, diagnostic: &'static str) {
        if self.state == ActivityState::Current {
            self.state = ActivityState::Stale;
            self.diagnostic = Some(diagnostic);
        }
    }
}

pub(super) fn unavailable_activity(diagnostic: &'static str) -> CodexActivity {
    CodexActivity::unavailable(Some(diagnostic))
}

impl ActivitySummary {
    fn empty() -> Self {
        Self {
            lifetime_tokens: None,
            peak_daily_tokens: None,
            current_streak_days: None,
            longest_streak_days: None,
            longest_running_turn_sec: None,
        }
    }
}

/// Normalize the optional monitoring fields from a successful rate-limit response.
/// The boolean reports malformed or over-limit optional fields for a static diagnostic.
pub(super) fn apply_quota_monitoring(monitoring: &mut CodexMonitoring, response: &Value) -> bool {
    let (buckets, mut invalid) = normalize_buckets(response);
    let (earned_resets, resets_invalid) = normalize_earned_resets(response);
    monitoring.buckets = buckets;
    monitoring.earned_resets = earned_resets;
    invalid |= resets_invalid;
    invalid
}

pub(super) fn apply_activity_result(
    monitoring: &mut CodexMonitoring,
    response: &Value,
    fetched_at_ms: Option<u64>,
) {
    let mut diagnostic = None;
    let summary_value = response.get("summary");
    let summary = if let Some(value) = summary_value.filter(|value| value.is_object()) {
        normalize_summary(value, &mut diagnostic)
    } else {
        diagnostic = Some("invalidActivitySummary");
        ActivitySummary::empty()
    };

    let daily_buckets = match response.get("dailyUsageBuckets") {
        None | Some(Value::Null) => None,
        Some(Value::Array(rows)) => normalize_daily_buckets(rows, &mut diagnostic),
        Some(_) => {
            diagnostic.get_or_insert("invalidActivityBuckets");
            None
        }
    };

    monitoring.activity = CodexActivity {
        state: if fetched_at_ms.is_some() && diagnostic.is_none() {
            ActivityState::Current
        } else {
            if fetched_at_ms.is_none() {
                diagnostic.get_or_insert("invalidActivityTimestamp");
            }
            ActivityState::Error
        },
        summary,
        daily_buckets,
        fetched_at_ms,
        diagnostic,
    };
}

pub(super) fn mark_activity_failure(monitoring: &mut CodexMonitoring, diagnostic: &'static str) {
    if monitoring.activity.fetched_at_ms.is_some()
        && monitoring.activity.state != ActivityState::Unavailable
    {
        monitoring.activity.state = ActivityState::Stale;
        monitoring.activity.diagnostic = Some(diagnostic);
    } else {
        monitoring.activity = CodexActivity::unavailable(Some(diagnostic));
        monitoring.activity.state = ActivityState::Error;
    }
}

fn normalize_buckets(response: &Value) -> (Vec<MonitoringBucket>, bool) {
    if let Some(by_limit_id) = response
        .get("rateLimitsByLimitId")
        .filter(|value| !value.is_null())
    {
        let Some(buckets) = by_limit_id.as_object() else {
            return (Vec::new(), true);
        };
        if buckets.len() > MAX_BUCKETS {
            return (Vec::new(), true);
        }
        let mut invalid = false;
        let normalized = buckets
            .iter()
            .enumerate()
            .map(|(index, (key, value))| {
                let label = bucket_label(index + 1, key == "codex");
                normalize_bucket(value, label, &mut invalid)
            })
            .collect();
        return (normalized, invalid);
    }

    let Some(bucket) = response.get("rateLimits") else {
        return (Vec::new(), false);
    };
    let label_is_codex = bucket
        .get("limitId")
        .and_then(Value::as_str)
        .is_none_or(|limit_id| limit_id == "codex");
    let mut invalid = false;
    (
        vec![normalize_bucket(
            bucket,
            bucket_label(1, label_is_codex),
            &mut invalid,
        )],
        invalid,
    )
}

fn bucket_label(index: usize, is_codex: bool) -> String {
    if is_codex {
        "Codex".to_owned()
    } else {
        format!("Bucket {index}")
    }
}

fn normalize_bucket(value: &Value, label: String, invalid: &mut bool) -> MonitoringBucket {
    let Some(bucket) = value.as_object() else {
        *invalid = true;
        return MonitoringBucket {
            label,
            credits: None,
            spending: None,
        };
    };

    let credits = match bucket.get("credits") {
        None | Some(Value::Null) => None,
        Some(value) => Some(normalize_credits(value, invalid)),
    };
    let spending = match bucket.get("individualLimit") {
        None | Some(Value::Null) => None,
        Some(value) => Some(normalize_spending(value, invalid)),
    };

    MonitoringBucket {
        label,
        credits,
        spending,
    }
}

fn normalize_credits(value: &Value, invalid: &mut bool) -> Credits {
    let Some(credits) = value.as_object() else {
        *invalid = true;
        return Credits {
            has_credits: None,
            unlimited: None,
            balance: None,
            unit: "credits",
        };
    };
    let has_credits = optional_bool(credits.get("hasCredits"), invalid);
    let unlimited = optional_bool(credits.get("unlimited"), invalid);
    let balance = optional_decimal(credits.get("balance"), true, invalid);
    Credits {
        has_credits,
        unlimited,
        balance,
        unit: "credits",
    }
}

fn optional_bool(value: Option<&Value>, invalid: &mut bool) -> Option<bool> {
    match value {
        None | Some(Value::Null) => None,
        Some(value) => match value.as_bool() {
            Some(value) => Some(value),
            None => {
                *invalid = true;
                None
            }
        },
    }
}

fn optional_decimal(
    value: Option<&Value>,
    allow_negative: bool,
    invalid: &mut bool,
) -> Option<String> {
    match value {
        None | Some(Value::Null) => None,
        Some(Value::String(value)) if valid_decimal(value, allow_negative) => Some(value.clone()),
        Some(_) => {
            *invalid = true;
            None
        }
    }
}

fn valid_decimal(value: &str, allow_negative: bool) -> bool {
    if value.is_empty() || value.len() > MAX_DECIMAL_LENGTH {
        return false;
    }
    let value = match value.strip_prefix('-') {
        Some(unsigned) if allow_negative => unsigned,
        Some(_) => return false,
        None => value,
    };
    if value.is_empty() {
        return false;
    }
    let mut dots = 0;
    let mut digits = 0;
    for character in value.chars() {
        match character {
            '0'..='9' => digits += 1,
            '.' => dots += 1,
            _ => return false,
        }
    }
    dots <= 1 && digits > 0 && !value.starts_with('.') && !value.ends_with('.')
}

fn normalize_spending(value: &Value, invalid: &mut bool) -> Spending {
    let Some(spending) = value.as_object() else {
        *invalid = true;
        return Spending {
            limit: None,
            used: None,
            remaining_percent: None,
            reset_at_ms: None,
            unit: None,
        };
    };
    let limit = optional_decimal(spending.get("limit"), false, invalid);
    let used = optional_decimal(spending.get("used"), false, invalid);
    let remaining_percent = match spending.get("remainingPercent") {
        None | Some(Value::Null) => None,
        Some(value) => match value.as_f64() {
            Some(percent) if percent.is_finite() && (0.0..=100.0).contains(&percent) => {
                Some(percent)
            }
            _ => {
                *invalid = true;
                None
            }
        },
    };
    let reset_at_ms = match spending.get("resetsAt") {
        None | Some(Value::Null) => None,
        Some(value) => match value.as_u64().and_then(seconds_to_ms) {
            Some(timestamp) => Some(timestamp),
            None => {
                *invalid = true;
                None
            }
        },
    };
    Spending {
        limit,
        used,
        remaining_percent,
        reset_at_ms,
        unit: None,
    }
}

fn normalize_earned_resets(response: &Value) -> (Option<EarnedResets>, bool) {
    let Some(value) = response.get("rateLimitResetCredits") else {
        return (None, false);
    };
    if value.is_null() {
        return (None, false);
    }
    let Some(reset_credits) = value.as_object() else {
        return (None, true);
    };
    let mut invalid = false;
    let available_count = match reset_credits.get("availableCount") {
        None | Some(Value::Null) => None,
        Some(value) => match value.as_u64().filter(|count| *count <= MAX_SAFE_JS_INTEGER) {
            Some(count) => Some(count),
            None => {
                invalid = true;
                None
            }
        },
    };
    let details = match reset_credits.get("credits") {
        None | Some(Value::Null) => None,
        Some(Value::Array(rows)) if rows.len() <= MAX_RESET_DETAILS => Some(
            rows.iter()
                .map(|row| normalize_reset_detail(row, &mut invalid))
                .collect(),
        ),
        Some(Value::Array(_)) | Some(_) => {
            invalid = true;
            None
        }
    };
    (
        Some(EarnedResets {
            available_count,
            details,
        }),
        invalid,
    )
}

fn normalize_reset_detail(value: &Value, invalid: &mut bool) -> ResetDetail {
    let Some(detail) = value.as_object() else {
        *invalid = true;
        return ResetDetail {
            status: ResetStatus::Unknown,
            granted_at_ms: None,
            expires_at_ms: None,
        };
    };
    let status = match detail.get("status").and_then(Value::as_str) {
        Some("available") => ResetStatus::Available,
        Some("redeeming") => ResetStatus::Redeeming,
        Some("redeemed") => ResetStatus::Redeemed,
        _ => ResetStatus::Unknown,
    };
    let granted_at_ms = optional_seconds(detail.get("grantedAt"), invalid);
    let expires_at_ms = optional_seconds(detail.get("expiresAt"), invalid);
    ResetDetail {
        status,
        granted_at_ms,
        expires_at_ms,
    }
}

fn optional_seconds(value: Option<&Value>, invalid: &mut bool) -> Option<u64> {
    match value {
        None | Some(Value::Null) => None,
        Some(value) => match value.as_u64().and_then(seconds_to_ms) {
            Some(timestamp) => Some(timestamp),
            None => {
                *invalid = true;
                None
            }
        },
    }
}

fn seconds_to_ms(seconds: u64) -> Option<u64> {
    seconds
        .checked_mul(1000)
        .filter(|milliseconds| *milliseconds <= MAX_SAFE_TIMESTAMP_MS)
}

fn normalize_summary(value: &Value, diagnostic: &mut Option<&'static str>) -> ActivitySummary {
    let mut summary = ActivitySummary {
        lifetime_tokens: optional_safe_count(value.get("lifetimeTokens"), diagnostic),
        peak_daily_tokens: optional_safe_count(value.get("peakDailyTokens"), diagnostic),
        current_streak_days: optional_safe_count(value.get("currentStreakDays"), diagnostic),
        longest_streak_days: optional_safe_count(value.get("longestStreakDays"), diagnostic),
        longest_running_turn_sec: optional_safe_count(
            value.get("longestRunningTurnSec"),
            diagnostic,
        ),
    };
    if summary
        .current_streak_days
        .zip(summary.longest_streak_days)
        .is_some_and(|(current, longest)| current > longest)
    {
        summary.current_streak_days = None;
        summary.longest_streak_days = None;
        diagnostic.get_or_insert("inconsistentActivityStreak");
    }
    summary
}

fn optional_safe_count(
    value: Option<&Value>,
    diagnostic: &mut Option<&'static str>,
) -> Option<u64> {
    match value {
        None | Some(Value::Null) => None,
        Some(value) => match value.as_u64().filter(|count| *count <= MAX_SAFE_JS_INTEGER) {
            Some(count) => Some(count),
            None => {
                diagnostic.get_or_insert("invalidActivityValue");
                None
            }
        },
    }
}

fn normalize_daily_buckets(
    rows: &[Value],
    diagnostic: &mut Option<&'static str>,
) -> Option<Vec<DailyBucket>> {
    if rows.len() > MAX_ACTIVITY_DAYS {
        diagnostic.get_or_insert("tooManyActivityDays");
        return None;
    }

    let mut by_date = BTreeMap::<String, Option<u64>>::new();
    let mut conflicting_dates = Vec::new();
    for row in rows {
        let Some(object) = row.as_object() else {
            diagnostic.get_or_insert("invalidActivityBuckets");
            return None;
        };
        let Some(date) = object.get("startDate").and_then(Value::as_str) else {
            diagnostic.get_or_insert("invalidActivityDate");
            return None;
        };
        if !valid_calendar_date(date) {
            diagnostic.get_or_insert("invalidActivityDate");
            return None;
        }
        let tokens_value = object.get("tokens");
        let tokens = match tokens_value {
            None | Some(Value::Null) => None,
            Some(value) => match value.as_u64().filter(|count| *count <= MAX_SAFE_JS_INTEGER) {
                Some(count) => Some(count),
                None => {
                    diagnostic.get_or_insert("invalidActivityValue");
                    None
                }
            },
        };
        if let Some(previous) = by_date.get(date) {
            if previous != &tokens {
                conflicting_dates.push(date.to_owned());
                diagnostic.get_or_insert("conflictingActivityDate");
            }
        } else {
            by_date.insert(date.to_owned(), tokens);
        }
    }
    for date in conflicting_dates {
        by_date.insert(date, None);
    }
    Some(
        by_date
            .into_iter()
            .map(|(date, tokens)| DailyBucket { date, tokens })
            .collect(),
    )
}

fn valid_calendar_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    if !bytes
        .iter()
        .enumerate()
        .all(|(index, byte)| matches!(index, 4 | 7) || byte.is_ascii_digit())
    {
        return false;
    }
    let year = value[0..4].parse::<u32>().ok();
    let month = value[5..7].parse::<u32>().ok();
    let day = value[8..10].parse::<u32>().ok();
    let (Some(year), Some(month), Some(day)) = (year, month, day) else {
        return false;
    };
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap_year(year) => 29,
        2 => 28,
        _ => return false,
    };
    (1..=days_in_month).contains(&day)
}

fn is_leap_year(year: u32) -> bool {
    year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn optional_credit_and_spending_fields_keep_unknown_units_and_safe_values() {
        let response = json!({
            "rateLimitsByLimitId": {
                "codex": {
                    "credits": {"hasCredits": true, "unlimited": false, "balance": "012.50"},
                    "individualLimit": {"limit": "200", "used": "25.5", "remainingPercent": 75, "resetsAt": 1_700_000_000}
                },
                "other-id": {
                    "credits": null,
                    "individualLimit": null
                }
            }
        });
        let mut monitoring = CodexMonitoring::unavailable();
        assert!(!apply_quota_monitoring(&mut monitoring, &response));
        assert_eq!(monitoring.buckets.len(), 2);
        assert_eq!(monitoring.buckets[0].label, "Codex");
        assert_eq!(monitoring.buckets[1].label, "Bucket 2");
        let codex = &monitoring.buckets[0];
        assert_eq!(
            codex.credits.as_ref().unwrap().balance.as_deref(),
            Some("012.50")
        );
        assert_eq!(codex.credits.as_ref().unwrap().unit, "credits");
        assert_eq!(
            codex.spending.as_ref().unwrap().remaining_percent,
            Some(75.0)
        );
        assert_eq!(codex.spending.as_ref().unwrap().unit, None);
        assert_eq!(
            codex.spending.as_ref().unwrap().reset_at_ms,
            Some(1_700_000_000_000)
        );
        let serialized = serde_json::to_string(&monitoring).unwrap();
        assert!(!serialized.contains("other-id"));
        assert!(!serialized.contains("limitName"));
        assert!(!serialized.contains("USD"));
    }

    #[test]
    fn malformed_credit_and_spending_values_become_unknown_with_static_diagnostic_signal() {
        let mut response = json!({
            "rateLimits": {
                "limitId": "unknown-private-id",
                "credits": {"hasCredits": "yes", "unlimited": false, "balance": "NaN"},
                "individualLimit": {"limit": "-1", "used": "1e9", "remainingPercent": 101, "resetsAt": -4}
            }
        });
        let mut monitoring = CodexMonitoring::unavailable();
        assert!(apply_quota_monitoring(&mut monitoring, &response));
        assert_eq!(monitoring.buckets[0].label, "Bucket 1");
        assert_eq!(
            monitoring.buckets[0].credits.as_ref().unwrap().balance,
            None
        );
        assert_eq!(monitoring.buckets[0].spending.as_ref().unwrap().limit, None);
        response["rateLimits"]["credits"]["hasCredits"] = Value::Bool(true);
        response["rateLimits"]["individualLimit"] = json!({
            "limit": "1",
            "used": "0",
            "remainingPercent": 50,
            "resetsAt": 1
        });
        response["rateLimits"]["credits"]["balance"] = Value::String("-0.5".to_owned());
        assert!(!apply_quota_monitoring(&mut monitoring, &response));
        assert_eq!(
            monitoring.buckets[0]
                .credits
                .as_ref()
                .unwrap()
                .balance
                .as_deref(),
            Some("-0.5")
        );
        response["rateLimits"]["credits"]["balance"] = Value::String("9".repeat(65));
        assert!(apply_quota_monitoring(&mut monitoring, &response));
        assert_eq!(
            monitoring.buckets[0].credits.as_ref().unwrap().balance,
            None
        );
    }

    #[test]
    fn earned_reset_null_empty_count_details_and_safe_expiry_are_preserved() {
        let mut monitoring = CodexMonitoring::unavailable();
        assert!(apply_quota_monitoring(
            &mut monitoring,
            &json!({
                "rateLimitResetCredits": {"availableCount": 3, "credits": [
                    {"id":"private-id", "status":"available", "grantedAt":1, "expiresAt":2, "title":"private title", "description":"private description"},
                    {"status":"redeeming", "grantedAt":null, "expiresAt":null},
                    {"status":"unexpected", "grantedAt":-1}
                ]}
            })
        ));
        let earned = monitoring.earned_resets.as_ref().unwrap();
        assert_eq!(earned.available_count, Some(3));
        assert_eq!(earned.details.as_ref().unwrap().len(), 3);
        assert_eq!(
            earned.details.as_ref().unwrap()[0].expires_at_ms,
            Some(2_000)
        );
        assert_eq!(
            earned.details.as_ref().unwrap()[2].status,
            ResetStatus::Unknown
        );
        assert_eq!(earned.details.as_ref().unwrap()[2].granted_at_ms, None);
        let serialized = serde_json::to_string(&monitoring).unwrap();
        assert!(!serialized.contains("private-id"));
        assert!(!serialized.contains("private title"));
        assert!(!serialized.contains("private description"));

        assert!(!apply_quota_monitoring(
            &mut monitoring,
            &json!({
                "rateLimitResetCredits": {"availableCount": 0, "credits": []}
            })
        ));
        assert_eq!(
            monitoring
                .earned_resets
                .as_ref()
                .unwrap()
                .details
                .as_ref()
                .unwrap()
                .len(),
            0
        );
        assert!(!apply_quota_monitoring(
            &mut monitoring,
            &json!({
                "rateLimitResetCredits": {"availableCount": 0, "credits": null}
            })
        ));
        assert_eq!(monitoring.earned_resets.as_ref().unwrap().details, None);
        assert!(apply_quota_monitoring(
            &mut monitoring,
            &json!({
                "rateLimitResetCredits": {"availableCount": -1, "credits": []}
            })
        ));
        assert_eq!(
            monitoring.earned_resets.as_ref().unwrap().available_count,
            None
        );
    }

    #[test]
    fn bucket_and_reset_detail_overflow_are_rejected_without_silent_truncation() {
        let buckets = (0..=MAX_BUCKETS)
            .map(|index| (format!("private-{index}"), json!({"credits": null})))
            .collect::<serde_json::Map<_, _>>();
        let mut monitoring = CodexMonitoring::unavailable();
        assert!(apply_quota_monitoring(
            &mut monitoring,
            &json!({"rateLimitsByLimitId": buckets})
        ));
        assert!(monitoring.buckets.is_empty());

        let details = (0..=MAX_RESET_DETAILS)
            .map(|_| json!({"status":"available"}))
            .collect::<Vec<_>>();
        assert!(apply_quota_monitoring(
            &mut monitoring,
            &json!({"rateLimitResetCredits":{"availableCount":0,"credits":details}})
        ));
        assert_eq!(monitoring.earned_resets.as_ref().unwrap().details, None);
    }

    #[test]
    fn activity_normalizes_safe_summary_sparse_zero_and_duplicate_dates() {
        let mut monitoring = CodexMonitoring::unavailable();
        apply_activity_result(
            &mut monitoring,
            &json!({
                "summary": {"lifetimeTokens": 9_007_199_254_740_991_i64, "peakDailyTokens": 20, "currentStreakDays": 4, "longestStreakDays": 9, "longestRunningTurnSec": 13},
                "dailyUsageBuckets": [
                    {"startDate":"2024-02-29","tokens":0},
                    {"startDate":"2024-02-29","tokens":0},
                    {"startDate":"2024-03-02","tokens":9}
                ]
            }),
            Some(1_700_000_000_000),
        );
        assert_eq!(monitoring.activity.state, ActivityState::Current);
        assert_eq!(
            monitoring.activity.summary.lifetime_tokens,
            Some(9_007_199_254_740_991)
        );
        assert_eq!(monitoring.activity.summary.peak_daily_tokens, Some(20));
        let days = monitoring.activity.daily_buckets.as_ref().unwrap();
        assert_eq!(days.len(), 2);
        assert_eq!(days[0].date, "2024-02-29");
        assert_eq!(days[0].tokens, Some(0));
        assert_eq!(days[1].date, "2024-03-02");
        assert_eq!(days[1].tokens, Some(9));
        assert_eq!(monitoring.activity.fetched_at_ms, Some(1_700_000_000_000));
    }

    #[test]
    fn activity_invalid_counts_and_inconsistent_streaks_are_unknown_not_repaired() {
        let mut monitoring = CodexMonitoring::unavailable();
        apply_activity_result(
            &mut monitoring,
            &json!({
                "summary": {
                    "lifetimeTokens": 9_007_199_254_740_992_u64,
                    "currentStreakDays": 8,
                    "longestStreakDays": 7
                }
            }),
            Some(1),
        );
        assert_eq!(monitoring.activity.summary.lifetime_tokens, None);
        assert_eq!(monitoring.activity.summary.current_streak_days, None);
        assert_eq!(monitoring.activity.summary.longest_streak_days, None);
        assert_eq!(monitoring.activity.state, ActivityState::Error);
        assert_eq!(monitoring.activity.diagnostic, Some("invalidActivityValue"));

        apply_activity_result(
            &mut monitoring,
            &json!({"summary":{"currentStreakDays":8,"longestStreakDays":7}}),
            Some(2),
        );
        assert_eq!(monitoring.activity.summary.current_streak_days, None);
        assert_eq!(monitoring.activity.summary.longest_streak_days, None);
        assert_eq!(
            monitoring.activity.diagnostic,
            Some("inconsistentActivityStreak")
        );
    }

    #[test]
    fn activity_rejects_invalid_dates_bounds_negative_counts_and_conflicts() {
        let mut monitoring = CodexMonitoring::unavailable();
        let invalid_dates = [
            "2023-02-29",
            "2024-13-01",
            "2024-1-01",
            "2024-01-01T00:00:00Z",
        ];
        for date in invalid_dates {
            apply_activity_result(
                &mut monitoring,
                &json!({"summary":{},"dailyUsageBuckets":[{"startDate":date,"tokens":1}]}),
                Some(1),
            );
            assert_eq!(monitoring.activity.daily_buckets, None, "date={date}");
            assert_eq!(monitoring.activity.diagnostic, Some("invalidActivityDate"));
        }

        apply_activity_result(
            &mut monitoring,
            &json!({"summary":{"lifetimeTokens":-1},"dailyUsageBuckets":[{"startDate":"2024-01-01","tokens":-5}]}),
            Some(2),
        );
        assert_eq!(monitoring.activity.summary.lifetime_tokens, None);
        assert_eq!(
            monitoring.activity.daily_buckets.as_ref().unwrap()[0].tokens,
            None
        );
        assert_eq!(monitoring.activity.diagnostic, Some("invalidActivityValue"));

        apply_activity_result(
            &mut monitoring,
            &json!({"summary":{},"dailyUsageBuckets":[{"startDate":"2024-01-01","tokens":1},{"startDate":"2024-01-01","tokens":2}]}),
            Some(3),
        );
        assert_eq!(
            monitoring.activity.daily_buckets.as_ref().unwrap()[0].tokens,
            None
        );
        assert_eq!(
            monitoring.activity.diagnostic,
            Some("conflictingActivityDate")
        );

        let too_many = (0..=MAX_ACTIVITY_DAYS)
            .map(|day| json!({"startDate":format!("2024-{:02}-{:02}", 1 + day / 28, 1 + day % 28),"tokens":day}))
            .collect::<Vec<_>>();
        apply_activity_result(
            &mut monitoring,
            &json!({"summary":{},"dailyUsageBuckets":too_many}),
            Some(4),
        );
        assert_eq!(monitoring.activity.daily_buckets, None);
        assert_eq!(monitoring.activity.diagnostic, Some("tooManyActivityDays"));
    }

    #[test]
    fn activity_null_days_stay_null_and_failure_preserves_stale_data_timestamp() {
        let mut monitoring = CodexMonitoring::unavailable();
        apply_activity_result(
            &mut monitoring,
            &json!({"summary":{"lifetimeTokens":10},"dailyUsageBuckets":null}),
            Some(8),
        );
        assert_eq!(monitoring.activity.daily_buckets, None);
        assert_eq!(monitoring.activity.summary.lifetime_tokens, Some(10));
        mark_activity_failure(&mut monitoring, "activityReadFailed");
        assert_eq!(monitoring.activity.state, ActivityState::Stale);
        assert_eq!(monitoring.activity.fetched_at_ms, Some(8));
        monitoring.activity = unavailable_activity("activityUnsupported");
        assert_eq!(monitoring.activity.state, ActivityState::Unavailable);
        assert_eq!(monitoring.activity.fetched_at_ms, None);
    }
}
