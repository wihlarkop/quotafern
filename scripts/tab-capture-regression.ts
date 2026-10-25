import { tabStateProblem } from "./tab-capture";

export function runTabCaptureRegression(): number {
  let count = 0;
  const assert = (condition: unknown, label: string) => {
    count++;
    if (!condition) throw new Error(label);
  };
  const valid = {
    tabs: [
      {
        id: "overview",
        name: "Overview",
        selected: true,
        state: "active",
        controls: "overview-panel",
        background: "rgb(255, 255, 255)",
      },
      {
        id: "accounts",
        name: "Accounts",
        selected: false,
        state: "inactive",
        controls: "accounts-panel",
        background: "rgba(0, 0, 0, 0)",
      },
    ],
    panels: [
      {
        id: "overview-panel",
        labelledBy: "overview",
        state: "active",
        headings: ["Usage overview"],
      },
    ],
    unfinished: 0,
    selectedBackground: "rgb(255, 255, 255)",
  };
  const check = (mutate: (state: typeof valid) => void, label: string) => {
    const state = structuredClone(valid);
    mutate(state);
    assert(tabStateProblem(state, "Overview", ["Usage overview"]) !== null, label);
  };
  assert(
    tabStateProblem(valid, "Overview", ["Usage overview"]) === null,
    "Matching settled screen accepted",
  );
  check((s) => {
    s.tabs[0].selected = false;
    s.tabs[1].selected = true;
  }, "Accounts-selected/Overview-panel mismatch rejected");
  check((s) => {
    s.tabs[1].selected = true;
  }, "Multiple selected tabs rejected");
  check((s) => {
    s.tabs[0].selected = false;
  }, "No selected tab rejected");
  check((s) => {
    s.tabs[0].state = "inactive";
  }, "aria-selected/data-state disagreement rejected");
  check((s) => {
    s.tabs[1].state = "active";
  }, "Unselected active tab rejected");
  check((s) => {
    s.panels = [];
  }, "No visible panel rejected");
  check((s) => {
    s.panels.push({ ...s.panels[0] });
  }, "Multiple visible panels rejected");
  check((s) => {
    s.tabs[0].controls = "accounts-panel";
  }, "Wrong aria-controls rejected");
  check((s) => {
    s.panels[0].labelledBy = "accounts";
  }, "Wrong aria-labelledby rejected");
  check((s) => {
    s.panels[0].state = "inactive";
  }, "Inactive visible panel rejected");
  check((s) => {
    s.panels[0].headings = ["Accounts"];
  }, "Wrong screen heading rejected");
  check((s) => {
    s.panels[0].headings.push("Accounts");
  }, "Multiple headings rejected");
  check((s) => {
    s.unfinished = 1;
    s.tabs[0].background = "rgba(0, 0, 0, 0)";
    s.tabs[1].background = s.selectedBackground;
  }, "Reported mid-transition screenshot state rejected");
  check((s) => {
    s.tabs[0].background = "rgba(0, 0, 0, 0)";
  }, "Unsettled selected highlight rejected even with no animation record");
  const details = structuredClone(valid);
  check((s) => {
    s.tabs[1].background = s.selectedBackground;
  }, "Inactive selected-looking highlight rejected after animations finish");
  details.panels[0].headings = ["Codex Details"];
  assert(
    tabStateProblem(details, "Overview", ["Usage overview", "Codex Details"]) === null,
    "Details remains in Overview tab",
  );
  assert(
    tabStateProblem(details, "Overview", ["Usage overview"]) !== null,
    "Overview screenshot cannot silently contain Details",
  );
  console.log(`PASS screenshot tab-state regression: ${count} assertions`);
  return count;
}
