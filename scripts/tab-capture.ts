/** Browser evidence only. Never imported by the production application. */
type Section = "Overview" | "Accounts" | "Settings";
type TabCaptureState = {
  tabs: {
    id: string;
    name: string;
    selected: boolean;
    state: string;
    controls: string | null;
    background: string;
  }[];
  panels: { id: string; labelledBy: string | null; state: string; headings: string[] }[];
  unfinished: number;
  selectedBackground: string;
};
type BrowserPage = {
  evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
  getByRole(role: string, options: { name: string; exact: boolean }): { click(): Promise<void> };
};
export function tabStateProblem(
  state: TabCaptureState,
  expectedTab: string,
  expectedHeading: readonly string[],
) {
  const selected = state.tabs.filter((tab) => tab.selected);
  if (selected.length !== 1 || selected[0].name !== expectedTab)
    return `Expected exactly one selected ${expectedTab} tab`;
  const tab = selected[0];
  if (
    tab.state !== "active" ||
    state.tabs.some((item) => !item.selected && item.state === "active")
  )
    return "Tab aria-selected and data-state disagree";
  if (state.panels.length !== 1) return "Expected exactly one visible tab panel";
  const panel = state.panels[0];
  if (
    !tab.id ||
    tab.controls !== panel.id ||
    panel.labelledBy !== tab.id ||
    panel.state !== "active"
  )
    return "Selected tab and visible panel are not linked";
  if (panel.headings.length !== 1 || !expectedHeading.includes(panel.headings[0]))
    return "Visible panel heading does not match the expected screen";
  if (state.unfinished > 0) return "Tab or panel transition is unfinished";
  if (tab.background !== state.selectedBackground) return "Selected tab highlight is not settled";
  if (state.tabs.some((item) => !item.selected && item.background === state.selectedBackground))
    return "Inactive tab retains the selected highlight";
  return null;
}

export async function createTabCapture(
  page: BrowserPage,
  assert: (ok: boolean, label: string) => void,
) {
  const allowedHeadings: Record<Section, readonly string[]> = {
    Overview: ["Usage overview", "Codex Details", "OpenRouter Details", "Account Details"],
    Accounts: ["Accounts"],
    Settings: ["Settings"],
  };
  let expectedTab: Section = "Overview";
  const ready = async (heading?: string) => {
    const state = await page.evaluate(async () => {
      const tabs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
      const panels = [...document.querySelectorAll<HTMLElement>('[role="tabpanel"]')].filter(
        (panel) => !panel.hidden && panel.getBoundingClientRect().height > 0,
      );
      const surfaces = [document.querySelector<HTMLElement>('[role="tablist"]'), ...panels].filter(
        (surface): surface is HTMLElement => surface !== null,
      );
      const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
      // Flush styles, then allow CSS transitions/entry animations to be created.
      tabs.forEach((tab) => getComputedStyle(tab).backgroundColor);
      await nextFrame();
      const animations = () =>
        surfaces
          .flatMap((surface) =>
            surface.getAnimations({ subtree: surface.getAttribute("role") === "tablist" }),
          )
          .filter((animation) => {
            const endTime = animation.effect?.getComputedTiming().endTime;
            return typeof endTime === "number" && Number.isFinite(endTime);
          });
      await Promise.all(animations().map((animation) => animation.finished.catch(() => undefined)));
      await nextFrame();
      const probe = document.createElement("span");
      probe.style.backgroundColor = "var(--surface-raised)";
      document.body.append(probe);
      const selectedBackground = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        tabs: tabs.map((tab) => ({
          id: tab.id,
          name: tab.textContent?.trim() ?? "",
          selected: tab.getAttribute("aria-selected") === "true",
          state: tab.dataset.state ?? "",
          controls: tab.getAttribute("aria-controls"),
          background: getComputedStyle(tab).backgroundColor,
        })),
        panels: panels.map((panel) => ({
          id: panel.id,
          labelledBy: panel.getAttribute("aria-labelledby"),
          state: panel.dataset.state ?? "",
          headings: [...panel.querySelectorAll("h1")].map((item) => item.textContent?.trim() ?? ""),
        })),
        unfinished: animations().filter(
          (animation) => animation.pending || animation.playState === "running",
        ).length,
        selectedBackground,
      };
    });
    const headings = heading ? [heading] : allowedHeadings[expectedTab];
    const problem = tabStateProblem(state, expectedTab, headings);
    assert(
      problem === null,
      `${expectedTab} tab/panel/heading/highlight settled${problem ? `: ${problem}` : ""}`,
    );
    if (problem) throw new Error(problem);
    return state;
  };
  const tab = async (name: Section) => {
    await page.getByRole("tab", { name, exact: true }).click();
    expectedTab = name;
    await ready();
  };
  await ready();
  return { tab, ready };
}
