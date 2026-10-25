import { ACCOUNT_DEMO_SCENARIOS, createAccountDemo } from "../src/lib/accounts/demo";
import { validMetadata } from "../src/lib/accounts/metadata";
import { isLocalId } from "../src/lib/accounts/model";
import { activityMonitoring, contextualAlias } from "../src/lib/accounts/presentation";
import { accountsView, detailsView, overviewView } from "../src/lib/accounts/views";
import { buildActivityGrid } from "../src/lib/activity";

export function runAccountUiRegression(): number {
  let count = 0;
  const assert = (condition: unknown, label: string) => {
    count++;
    if (!condition) throw new Error(label);
  };
  const now = Date.UTC(2026, 9, 25, 12);
  for (const [scenario] of ACCOUNT_DEMO_SCENARIOS) {
    const state = createAccountDemo(scenario, now);
    assert(validMetadata(state.metadata), `${scenario}: valid ACC-01 IDs/Unicode/ownership`);
    assert(
      JSON.stringify(state) === JSON.stringify(createAccountDemo(scenario, now)),
      `${scenario}: deterministic`,
    );
    assert(overviewView(state, { kind: "all" }, now).empty, `${scenario}: no live fallback`);
    const overview = overviewView(state, { kind: "all" }, now, "synthetic");
    assert(overview.totals === null, `${scenario}: no totals`);
    assert(
      new Set(overview.sources.map((s) => s.id)).size === overview.sources.length,
      `${scenario}: no duplicated sources`,
    );
    for (const source of overview.sources) {
      assert(isLocalId(source.id, "source"), "Stable opaque source ID");
      assert(
        source.origin === "synthetic" && source.authority === "synthetic-fixture",
        "Explicit fixture authority",
      );
      const details = detailsView(
        state,
        { kind: "account", providerId: source.providerId, accountId: source.accountId },
        now,
        "synthetic",
      )!;
      assert(
        details.sources.every(
          (s) => s.accountId === source.accountId && s.providerId === source.providerId,
        ),
        "Details never crosses owners",
      );
      const monitoring = activityMonitoring(source);
      assert(
        monitoring.buckets.length === 0 && monitoring.earnedResets === null,
        "Activity adapter never invents funding or reset values",
      );
      assert(monitoring.activity.summary.lifetimeTokens === null, "No inferred activity totals");
    }
  }
  const multi = createAccountDemo("multi", now);
  const [personal, work] = multi.sources;
  assert(personal.freshness === "current" && work.freshness === "stale", "Independent freshness");
  assert(work.data.subscription[1].remainingPercent === null, "Unknown quota remains null");
  assert(
    work.data.credits?.balance === "0" && work.data.entitlements?.earnedResets === 0,
    "Confirmed zero remains zero",
  );
  assert(
    JSON.stringify(personal.data.activity) !== JSON.stringify(work.data.activity),
    "Accounts have distinct activity",
  );
  const grid = buildActivityGrid(activityMonitoring(personal).activity, now);
  const cells = grid.weeks.flat();
  assert(
    cells.some((c) => c.tokens === 0 && c.intensity === 0),
    "Heatmap known zero",
  );
  assert(
    cells.some((c) => c.tokens === null && c.intensity === null && !c.isPadding),
    "Heatmap unknown gaps",
  );
  assert(cells.filter((c) => !c.isPadding).length === 84, "84-day calendar unchanged");
  const shared = createAccountDemo("shared", now);
  assert(
    overviewView(shared, { kind: "all" }, now, "synthetic").sources.length === 1,
    "Shared source shown once",
  );
  for (const connection of shared.metadata.connections) {
    const view = overviewView(
      shared,
      {
        kind: "connection",
        providerId: "openrouter",
        accountId: connection.accountId,
        connectionId: connection.id,
      },
      now,
      "synthetic",
    );
    assert(
      view.sources.length === 1 && view.sources[0].id === shared.sources[0].id,
      "Key selection retains same shared source",
    );
  }
  const unknown = createAccountDemo("two-keys", now);
  assert(
    overviewView(unknown, { kind: "all" }, now, "synthetic").billingRelationship === "unknown",
    "Unknown billing stays unknown",
  );
  const duplicate = accountsView(createAccountDemo("duplicates", now))[0].accounts;
  assert(
    contextualAlias(duplicate, 0, "account") !== contextualAlias(duplicate, 1, "account"),
    "Duplicate aliases have ordinals",
  );
  assert(
    duplicate[0].accountId !== duplicate[1].accountId,
    "Duplicate aliases retain separate IDs",
  );
  const removing = createAccountDemo("removing", now);
  const account = removing.metadata.accounts[1];
  assert(
    detailsView(
      removing,
      { kind: "account", providerId: account.providerId, accountId: account.id },
      now,
      "synthetic",
    ) === null,
    "Pending removal fails closed",
  );
  assert(
    !overviewView(removing, { kind: "all" }, now, "synthetic").sources.some(
      (s) => s.accountId === account.id,
    ),
    "Pending removal hides values",
  );
  const mixed = createAccountDemo("mixed", now);
  assert(
    mixed.connections.some((c) => c.lifecycle === "error") &&
      mixed.connections.some((c) => c.lifecycle === "auth-required"),
    "Independent error states",
  );
  assert(
    mixed.sources.length === 2 && mixed.sources.every((s) => s.providerId === "codex"),
    "Failures clear only affected keys",
  );
  assert(
    accountsView(createAccountDemo("empty", now)).every((p) => p.accounts.length === 0),
    "No invented accounts",
  );
  console.log(`PASS UX-02B account presentation: ${count} assertions`);
  return count;
}
