import { createAccountDemo, ACCOUNT_DEMO_SCENARIOS } from "../src/lib/accounts/demo";
import {
  contextLabel,
  contextOptions,
  contextSelectorGroups,
  primaryContextKey,
  initialNavigation,
  reconcileNavigation,
  selectionKey,
  selectorSelection,
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
    const grouped = contextSelectorGroups(state);
    assert(
      grouped.primary
        .flatMap((g) => g.options)
        .every((o) => o.selection.kind === "account" && !o.selection.workspaceId),
      `${scenario}: main selector contains only accounts`,
    );
    assert(
      grouped.primary.flatMap((g) => g.options).length === state.metadata.accounts.length,
      `${scenario}: all accounts reachable in main selector`,
    );
    for (const group of [...grouped.primary, ...grouped.advanced]) {
      assert(
        new Set(group.options.map((o) => o.label)).size === group.options.length,
        `${scenario}: options distinguish duplicate names inside group`,
      );
      for (const option of group.options)
        assert(
          JSON.stringify(options.find((o) => o.key === option.key)?.selection) ===
            JSON.stringify(option.selection),
          "Short grouped labels preserve exact selection IDs and scope",
        );
    }
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
  const personalSource = multi.sources[0];
  const personal = {
    kind: "account" as const,
    providerId: personalSource.providerId,
    accountId: personalSource.accountId,
  };
  for (const origin of [
    { kind: "all" as const },
    { kind: "provider" as const, providerId: "codex" },
  ]) {
    const navigation = {
      ...initialNavigation(),
      selection: origin,
      detail: { selection: personal, sourceId: personalSource.id },
    };
    const before = JSON.stringify(multi);
    assert(
      selectionKey(selectorSelection(multi, navigation)) === personal.accountId,
      "Details selector shows Personal rather than its Overview origin",
    );
    assert(
      selectionKey(navigation.selection) === selectionKey(origin),
      "Opening Details preserves Overview filter separately",
    );
    assert(
      selectionKey(selectorSelection(multi, { ...navigation, detail: null })) ===
        selectionKey(origin),
      "Back restores All/provider filter",
    );
    assert(
      JSON.stringify(multi) === before,
      "Selector projection cannot change source values or lifecycle",
    );
  }
  const duplicateSource = duplicate.sources[1];
  const duplicateTarget = {
    kind: "account" as const,
    providerId: duplicateSource.providerId,
    accountId: duplicateSource.accountId,
  };
  const retained = {
    ...initialNavigation(),
    detail: { selection: duplicateTarget, sourceId: duplicateSource.id },
  };
  assert(
    contextLabel(duplicate, selectorSelection(duplicate, retained)).includes("account 2"),
    "Duplicate Details selector uses stable owner ID and ordinal",
  );
  assert(
    selectionKey(selectorSelection(createAccountDemo("empty", now), retained)) ===
      duplicateTarget.accountId,
    "Missing Details owner never displays an unrelated All context",
  );
  const disconnectedTarget = {
    ...initialNavigation(),
    detail: { selection: personal, sourceId: personalSource.id },
  };
  assert(
    selectionKey(selectorSelection(createAccountDemo("disconnected", now), disconnectedTarget)) ===
      personal.accountId,
    "Disconnected source retains its actual owner in selector",
  );
  assert(
    detailsView(createAccountDemo("disconnected", now), personal, now, "synthetic")?.sources
      .length === 0,
    "Unavailable source keeps Details values empty",
  );
  const workspace = contextOptions(multi).find(
    (o) => o.selection.kind === "account" && o.selection.workspaceId,
  )!;
  assert(
    workspace.selection.kind === "account" &&
      primaryContextKey(workspace.selection) === workspace.selection.accountId,
    "Advanced workspace retains owning account in primary selector",
  );
  assert(
    connection.selection.kind === "connection" &&
      primaryContextKey(connection.selection) === connection.selection.accountId,
    "Advanced connection retains owning account",
  );
  const colliding = createAccountDemo("duplicates", now);
  colliding.metadata.accounts[0].alias = "Same";
  colliding.metadata.accounts[1].alias = "Same";
  colliding.metadata.accounts.push({
    ...colliding.metadata.accounts[0],
    id: "account_d0030000-0000-4000-8000-000000000099",
    alias: "Same · account 1",
  });
  const collisionOptions = contextSelectorGroups(colliding).primary.find(
    (g) => g.key === "codex",
  )!.options;
  assert(
    new Set(collisionOptions.map((o) => o.label)).size === collisionOptions.length,
    "Generated duplicate-name suffix cannot collide with a literal alias",
  );
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
