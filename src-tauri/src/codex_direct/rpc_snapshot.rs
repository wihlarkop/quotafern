//! Sanitized presentation and native account projection for the fixed stdio client.
use super::*;

pub(super) fn account(value: &Value) -> Result<(String, String), Failure> {
    let account = value
        .get("account")
        .filter(|v| !v.is_null())
        .ok_or(Failure::AuthRequired)?;
    if account.get("type").and_then(Value::as_str) != Some("chatgpt") {
        return Err(Failure::UnsupportedAuth);
    }
    let plan = account
        .get("planType")
        .and_then(Value::as_str)
        .filter(|s| matches!(*s, "free" | "go" | "plus" | "pro"))
        .ok_or(Failure::UnsupportedAuth)?;
    let email = account
        .get("email")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty() && s.len() <= 1024)
        .ok_or(Failure::RpcIdentityUnavailable)?;
    Ok((email.into(), plan.into()))
}

pub(super) fn normalize(
    value: &Value,
    mut snapshot: DirectSnapshot,
) -> Result<DirectSnapshot, Failure> {
    let rate = value
        .get("rateLimits")
        .filter(|v| v.is_object())
        .ok_or(Failure::Schema)?;
    snapshot.windows.clear();
    snapshot.plan = match rate.get("planType").and_then(Value::as_str) {
        Some("free") => Some("Free"),
        Some("go") => Some("Go"),
        Some("plus") => Some("Plus"),
        Some("pro") => Some("Pro"),
        _ => None,
    };
    for (key, fallback) in [("primary", "Primary"), ("secondary", "Secondary")] {
        let Some(window) = rate.get(key).filter(|v| !v.is_null()) else {
            continue;
        };
        if !window.is_object() {
            return Err(Failure::Schema);
        }
        let used = window
            .get("usedPercent")
            .and_then(Value::as_f64)
            .filter(|v| (0.0..=100.0).contains(v))
            .ok_or(Failure::Schema)?;
        let duration = window
            .get("windowDurationMins")
            .filter(|v| !v.is_null())
            .map(|v| {
                v.as_f64()
                    .filter(|n| n.is_finite() && *n > 0.0 && *n <= 5_256_000.0)
                    .ok_or(Failure::Schema)
            })
            .transpose()?;
        let reset = window
            .get("resetsAt")
            .filter(|v| !v.is_null())
            .map(|v| {
                v.as_u64()
                    .and_then(|s| s.checked_mul(1000))
                    .filter(|ms| *ms <= 8_640_000_000_000_000)
                    .ok_or(Failure::Schema)
            })
            .transpose()?;
        snapshot.windows.push(DirectWindow {
            id: format!("rpc-{key}"),
            name: match duration {
                Some(300.0) => "Session",
                Some(10080.0) => "Weekly",
                _ => fallback,
            }
            .into(),
            remaining_percent: Some(100.0 - used),
            reset_at_ms: reset,
            window_duration_mins: duration,
        });
    }
    snapshot.credits = rate
        .get("credits")
        .filter(|v| !v.is_null())
        .map(|c| {
            if !c.is_object() {
                return Err(Failure::Schema);
            }
            let balance = c
                .get("balance")
                .filter(|v| !v.is_null())
                .map(|v| {
                    v.as_str()
                        .filter(|s| canonical_decimal(s))
                        .map(String::from)
                        .ok_or(Failure::Schema)
                })
                .transpose()?;
            let unlimited = c
                .get("unlimited")
                .filter(|v| !v.is_null())
                .map(|v| v.as_bool().ok_or(Failure::Schema))
                .transpose()?;
            Ok(DirectCredits { balance, unlimited })
        })
        .transpose()?;
    snapshot.connection_status = "connected";
    snapshot.data_status = if snapshot.windows.is_empty() {
        "unknown"
    } else {
        "current"
    };
    snapshot.fetched_at_ms = now_ms();
    snapshot.diagnostic = if snapshot.windows.is_empty() {
        Some("directQuotaUnavailable")
    } else {
        None
    };
    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rpc_projection_is_actual_sanitized_provider_data() {
        let value = serde_json::json!({"accountId":"native-only-account", "rateLimits":{
            "planType":"plus", "limitName":"private arbitrary text", "primary":{"usedPercent":25,"windowDurationMins":300,"resetsAt":1800000000},
            "secondary":{"usedPercent":100,"windowDurationMins":10080,"resetsAt":null},"credits":{"balance":"12.5","unlimited":false}
        }});
        let snapshot = normalize(
            &value,
            DirectSnapshot::empty("local-account", "local-connection", 1),
        )
        .unwrap();
        assert_eq!(snapshot.windows[0].remaining_percent, Some(75.0));
        assert_eq!(snapshot.windows[0].reset_at_ms, Some(1800000000000));
        assert_eq!(snapshot.windows[1].remaining_percent, Some(0.0));
        assert_eq!(snapshot.windows[1].reset_at_ms, None);
        assert_eq!(snapshot.plan, Some("Plus"));
        let serialized = serde_json::to_string(&snapshot).unwrap();
        assert!(
            !serialized.contains("native-only-account")
                && !serialized.contains("private arbitrary")
        );
        let mut invalid = value.clone();
        invalid["rateLimits"]["primary"]["usedPercent"] = serde_json::json!(101);
        assert!(matches!(
            normalize(&invalid, snapshot.clone()),
            Err(Failure::Schema)
        ));
        invalid = value.clone();
        invalid["rateLimits"]["credits"]["balance"] = serde_json::json!("token-like-secret");
        assert!(matches!(
            normalize(&invalid, snapshot.clone()),
            Err(Failure::Schema)
        ));
        let empty = normalize(&serde_json::json!({"rateLimits":{}}), snapshot).unwrap();
        assert!(empty.windows.is_empty() && empty.plan.is_none() && empty.credits.is_none());
        assert_eq!(empty.data_status, "unknown");
        assert!(matches!(
            account(&serde_json::json!({"account":null})),
            Err(Failure::AuthRequired)
        ));
        assert!(matches!(
            account(&serde_json::json!({"account":{"type":"apiKey"}})),
            Err(Failure::UnsupportedAuth)
        ));
    }
}
