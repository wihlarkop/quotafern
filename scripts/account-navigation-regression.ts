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
  openFocusedQuota,
  focusedQuotaView,
  chooseFocusedQuota,
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
  const returnTo = { tab: "accounts" as const, controlId: "quota-opener", scrollTop: 145 };
  const single = createAccountDemo("single", now);
  const singleSelection = {
    kind: "account" as const,
    providerId: "codex",
    accountId: single.metadata.accounts[0].id,
  };
  const beforeFocus = JSON.stringify(single);
  const focus = openFocusedQuota(single, singleSelection, returnTo, now, "synthetic");
  assert(
    focus.sourceId === single.sources[0].id && focus.alias === single.metadata.accounts[0].alias,
    "Focused entry pins the sole owned source and alias",
  );
  assert(
    focus.returnTo === returnTo && focus.returnTo.scrollTop === 145,
    "Focused route retains exact Accounts return point",
  );
  assert(
    focusedQuotaView(single, focus, now, "synthetic").kind === "source",
    "Sole source opens details directly",
  );
  const aged = focusedQuotaView(single, focus, now + single.sources[0].staleAfterMs, "synthetic");
  assert(
    aged.source?.freshness === "stale" && single.connections[0].lifecycle === "connected",
    "Focused freshness ages independently of connected lifecycle",
  );
  assert(
    openFocusedQuota(single, singleSelection, returnTo, now, "live").sourceId === null,
    "Focused live view never substitutes synthetic sources",
  );
  const noSources = structuredClone(single);
  noSources.sources = [];
  const emptyFocus = openFocusedQuota(noSources, singleSelection, returnTo, now, "synthetic");
  assert(
    focusedQuotaView(noSources, emptyFocus, now, "synthetic").kind === "empty",
    "Zero sources has an accurate empty focused state",
  );
  assert(
    focusedQuotaView(noSources, focus, now, "synthetic").kind === "unavailable",
    "A pinned source disappearing stays unavailable",
  );
  const disconnectedSource = structuredClone(single);
  disconnectedSource.connections[0].lifecycle = "disconnected";
  assert(
    openFocusedQuota(disconnectedSource, singleSelection, returnTo, now, "synthetic").sourceId ===
      null,
    "Disconnected runtime cannot expose a retained source",
  );
  const wrongGeneration = structuredClone(single);
  wrongGeneration.connections[0].generation++;
  assert(
    openFocusedQuota(wrongGeneration, singleSelection, returnTo, now, "synthetic").sourceId ===
      null,
    "Focused source requires current connection generation",
  );
  const multiple = createAccountDemo("two-keys", now);
  const multiSelection = {
    kind: "account" as const,
    providerId: "openrouter",
    accountId: multiple.metadata.accounts[0].id,
  };
  const chooser = openFocusedQuota(multiple, multiSelection, returnTo, now, "synthetic");
  assert(
    chooser.sourceId === null &&
      focusedQuotaView(multiple, chooser, now, "synthetic").kind === "choose",
    "Multiple sources require a chooser rather than an arbitrary first source",
  );
  const chosen = chooseFocusedQuota(multiple, chooser, multiple.sources[0].id, now, "synthetic");
  assert(chosen.sourceId === multiple.sources[0].id, "Explicit chooser pins exact source ID");
  const remaining = structuredClone(multiple);
  remaining.sources.shift();
  assert(
    focusedQuotaView(remaining, chosen, now, "synthetic").kind === "unavailable",
    "Missing selected source never switches to another source of the same account",
  );
  assert(
    chooseFocusedQuota(multiple, chosen, multiple.sources[1].id, now, "synthetic") === chosen,
    "Stale chooser events cannot replace a pinned source",
  );
  assert(
    chooseFocusedQuota(multiple, chooser, single.sources[0].id, now, "synthetic") === chooser,
    "Chooser refuses a different account's source",
  );
  const missingOwner = structuredClone(single);
  missingOwner.metadata.accounts = [];
  assert(
    focusedQuotaView(missingOwner, focus, now, "synthetic").kind === "unavailable",
    "Missing focused owner never falls back to All accounts",
  );
  const removingOwner = structuredClone(single);
  removingOwner.removingAccountIds.push(singleSelection.accountId);
  assert(
    focusedQuotaView(removingOwner, focus, now, "synthetic").kind === "unavailable",
    "Removing focused account suppresses its readings",
  );
  const shared = createAccountDemo("shared", now);
  const sharedSelection = {
    kind: "account" as const,
    providerId: "openrouter",
    accountId: shared.metadata.accounts[0].id,
  };
  const sharedFocus = openFocusedQuota(shared, sharedSelection, returnTo, now, "synthetic");
  assert(
    sharedFocus.sourceId === shared.sources[0].id &&
      focusedQuotaView(shared, sharedFocus, now, "synthetic").sources.length === 1,
    "Shared source opens once despite multiple observing connections",
  );
  const normalNavigation = {
    ...initialNavigation(),
    selection: workspace.selection,
    focusedQuota: focus,
  };
  assert(
    selectionKey(selectorSelection(multi, normalNavigation)) === selectionKey(workspace.selection),
    "Focused route does not overwrite normal Overview's advanced selection",
  );
  assert(
    JSON.stringify(single) === beforeFocus,
    "Focused navigation does not modify account data or native lifecycle",
  );
  return count;
}
