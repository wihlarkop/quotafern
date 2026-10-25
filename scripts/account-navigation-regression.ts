import { createAccountDemo, ACCOUNT_DEMO_SCENARIOS } from "../src/lib/accounts/demo";
import {
  contextLabel,
  contextOptions,
  initialNavigation,
  reconcileNavigation,
  selectionKey,
} from "../src/lib/accounts/navigation";
import { detailsView, overviewView } from "../src/lib/accounts/views";

export function runAccountNavigationRegression(): number {
  let count = 0;
  const assert = (ok: unknown, label: string) => {
    count++;
    if (!ok) throw new Error(label);
  };
  const now = Date.UTC(2026, 9, 25, 12);
  for (const [scenario] of ACCOUNT_DEMO_SCENARIOS) {
    const state = createAccountDemo(scenario, now);
    const options = contextOptions(state);
    assert(
      new Set(options.map((o) => o.key)).size === options.length,
      `${scenario}: unique routing IDs`,
    );
    for (const option of options) {
      assert(selectionKey(option.selection) === option.key, "Selection keys round trip by ID");
      assert(
        contextLabel(state, option.selection) === option.label,
        "Full owner labels round trip",
      );
      const view = overviewView(state, option.selection, now, "synthetic");
      assert(view.totals === null, "No totals introduced by navigation");
      if (option.selection.kind === "connection" || option.selection.kind === "account") {
        const target = option.selection;
        assert(
          view.sources.every((s) => s.accountId === target.accountId),
          "Selection isolates owners",
        );
        const navigation = {
          ...initialNavigation(),
          selection: target,
          detail: { selection: target, sourceId: state.sources[0]?.id },
        };
        const withoutOwner = structuredClone(state);
        withoutOwner.metadata.accounts = withoutOwner.metadata.accounts.filter(
          (a) => a.id !== target.accountId,
        );
        const repaired = reconcileNavigation(withoutOwner, { ...navigation, detail: null });
        assert(
          repaired.selection.kind === "all" && repaired.notice.includes("Selection removed"),
          "Invalid Overview announces safe fallback",
        );
        assert(
          detailsView(withoutOwner, target, now, "synthetic") === null,
          "Missing Details owner fails closed",
        );
        assert(
          reconcileNavigation(state, repaired).selection.kind === "all",
          "Restoring records cannot resurrect removed selection",
        );
      }
    }
  }
  const duplicate = createAccountDemo("duplicates", now);
  const connection = contextOptions(duplicate).find((o) => o.label.endsWith("connection 2"))!;
  assert(Boolean(connection), "Duplicate connection 2 remains visible in narrowed context");
  assert(
    contextLabel(duplicate, connection.selection).endsWith("connection 2"),
    "Details label retains global ordinal",
  );
  const multi = createAccountDemo("multi", now);
  const workspace = contextOptions(multi).find(
    (o) => o.selection.kind === "account" && o.selection.workspaceId,
  )!;
  assert(
    overviewView(multi, workspace.selection, now, "synthetic").sources.every(
      (s) => s.workspaceId !== null,
    ),
    "Workspace context isolates sources",
  );
  const disconnected = createAccountDemo("disconnected", now);
  assert(
    disconnected.connections[0].lifecycle === "disconnected" &&
      disconnected.identities.length === 0,
    "Disconnected fixture clears identity",
  );
  assert(disconnected.sources.length === 3, "Disconnect fixture clears only target values");
  const empty = initialNavigation();
  assert(
    empty.selection.kind === "all" && empty.detail === null,
    "Startup has no remembered context",
  );
  return count;
}
