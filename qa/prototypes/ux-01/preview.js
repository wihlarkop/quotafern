// Three throwaway compositions of one synthetic presentation. No product/runtime imports.
const directions = {
  A: {
    name: "Soft Native / Graphite & Jade",
    description: "Room to breathe. Account-first panels with a quiet, spacious rhythm.",
    palette: "graphite-jade",
  },
  B: {
    name: "Refined Graphite & Jade",
    description: "Familiar, refined. Bordered quota cards and compact account groups.",
    palette: "graphite-jade",
  },
  C: {
    name: "Refined Zinc & Signal",
    description: "A precise ledger. Aligned readings and a compact connection tree.",
    palette: "zinc-signal",
  },
};
const form = document.querySelector(".review-controls");
const params = new URLSearchParams(location.search);
for (const control of form.querySelectorAll("select")) {
  if ([...control.options].some((option) => option.value === params.get(control.name)))
    control.value = params.get(control.name);
}
let config = Object.fromEntries(new FormData(form));
const scoped = Object.fromEntries(
  Object.keys(directions).map((id) => [
    id,
    {
      provider: "all",
      account: "all",
      connection: "all",
      detail: ["keys", "shared", "billing"].includes(config.fixture) ? "router" : "personal",
    },
  ]),
);
const aliases = new Map();
const disconnected = new Set();
const removing = new Set();
const removingConnections = new Set();
let dialogTarget = null;
let triggerKey = null;
const systemTheme = matchMedia("(prefers-color-scheme: dark)");
const escapeText = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
const providerName = (id) => (id === "codex" ? "Codex" : "OpenRouter");
const option = (value, label, selected) =>
  `<option value="${escapeText(value)}"${value === selected ? " selected" : ""}>${escapeText(label)}</option>`;
const leaf =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M19 4c-9-1-15 3-14 9 1 7 12 7 14-9Z"/><path d="M5 21c0-7 4-9 9-12"/></svg>';

function fixture() {
  let accounts = [
    {
      id: "personal",
      provider: "codex",
      alias: "Personal",
      connections: [
        {
          id: "personal-session",
          alias: "Desktop session",
          status: "connected",
          type: "CLI session",
        },
      ],
      windows: [72, 43],
      resets: ["in 2h 14m · 16:14", "Thu, 29 Oct · 09:00"],
      freshness: "current",
    },
    {
      id: "work",
      provider: "codex",
      alias: "Work",
      workspace: "Studio",
      connections: [
        { id: "work-session", alias: "Work session", status: "connected", type: "CLI session" },
      ],
      windows: [18, 7],
      resets: ["in 48m · 14:48", "Fri, 30 Oct · 11:30"],
      freshness: "stale",
    },
    {
      id: "router",
      provider: "openrouter",
      alias: "Personal",
      connections: [
        { id: "key-personal", alias: "Personal Key", status: "connected", type: "API key label" },
        {
          id: "key-project",
          alias: "Project B Key",
          status: "disconnected",
          type: "API key label",
        },
      ],
      freshness: "current",
      billing: "unknown",
    },
  ];
  const f = config.fixture;
  if (f === "empty" || f === "soon") accounts = [];
  if (f === "single") accounts = accounts.slice(0, 1);
  if (
    f === "two" ||
    f === "stale" ||
    f === "low" ||
    f === "unknown" ||
    f === "duplicate" ||
    f === "unicode" ||
    f === "auth" ||
    f === "removing"
  )
    accounts = accounts.slice(0, 2);
  if (f === "keys" || f === "shared" || f === "billing") accounts = accounts.slice(2);
  if (f === "auth") accounts[1].connections[0].status = "auth-required";
  if (f === "error") accounts[1].connections[0].status = "error";
  if (f === "mixed") accounts[1].connections[0].status = "disconnected";
  if (f === "unknown") {
    accounts[0].windows = [null, null];
    accounts[0].resets = [null, null];
    accounts[0].freshness = "unknown";
  }
  if (f === "shared" || f === "keys") {
    accounts[0].billing = "verified";
    accounts[0].connections[1].status = "connected";
  }
  if (f === "billing") accounts[0].connections[1].status = "connected";
  if (f === "duplicate") {
    accounts[1].alias = "Personal";
    accounts[0].ordinal = "account 1";
    accounts[1].ordinal = "account 2";
  }
  if (f === "unicode")
    accounts[1].alias = "仕事用ワークスペース・研究開発チーム — Équipe créative / Nusantara 🌿";
  if (f === "removing") accounts[1].removing = true;
  for (const account of accounts) {
    account.alias = aliases.get(account.id) ?? account.alias;
    account.removing ||= removing.has(account.id);
    for (const connection of account.connections) {
      connection.alias = aliases.get(connection.id) ?? connection.alias;
      if (disconnected.has(connection.id) || account.removing) connection.status = "disconnected";
      if (removingConnections.has(connection.id)) connection.status = "removing";
    }
  }
  for (const account of accounts) {
    const equal = accounts.filter(
      (a) => a.provider === account.provider && a.alias === account.alias,
    );
    account.ordinal = equal.length > 1 ? `account ${equal.indexOf(account) + 1}` : null;
  }
  return accounts;
}
const accountLabel = (a) => `${a.alias}${a.ordinal ? ` · ${a.ordinal}` : ""}`;
const statusText = (status) =>
  ({
    connected: "Connected · simulated",
    disconnected: "Disconnected",
    "auth-required": "Authentication required",
    removing: "Removal pending",
    current: "Current · 14:00",
    stale: "Stale · last read 13:42",
    unknown: "Freshness unknown",
  })[status] ?? status;
const badge = (status) => `<span class="status ${status}">${statusText(status)}</span>`;
const context = (a) => `${providerName(a.provider)}${a.workspace ? ` / ${a.workspace}` : ""}`;
const actionButton = (text, action, a, c = null) =>
  `<button type="button" data-action="${action}" data-account="${a.id}"${c ? ` data-connection="${c.id}"` : ""} data-focus="${action}-${c?.id ?? a.id}" aria-label="${escapeText(`${providerName(a.provider)}, ${accountLabel(a)}${c ? `, ${c.alias}` : ""}: ${text}`)}"${a.removing || c?.status === "removing" ? " disabled" : ""}>${text}</button>`;

function filters(id, accounts, details = false) {
  const state = scoped[id];
  const eligible = accounts.filter(
    (a) => state.provider === "all" || a.provider === state.provider,
  );
  const selected = accounts.find((a) => a.id === state.account);
  if (details)
    return `<div class="scope"><label>Inspect account<select data-scope="detail">${option("unavailable", "Choose an account", state.detail)}${accounts.map((a) => option(a.id, `${context(a)} · ${accountLabel(a)}`, state.detail)).join("")}</select></label></div>`;
  return `<div class="scope"><label>Selection<select data-scope="selection">${option("all", "All Accounts", state.provider === "all" && state.account === "all" ? "all" : "filtered")}${state.provider === "all" && state.account === "all" ? "" : option("filtered", "Filtered accounts", "filtered")}</select></label><label>Provider<select data-scope="provider">${option("all", "All providers", state.provider)}${option("codex", "Codex", state.provider)}${option("openrouter", "OpenRouter", state.provider)}</select></label><label>Account<select data-scope="account">${option("all", "All accounts", state.account)}${eligible.map((a) => option(a.id, `${providerName(a.provider)} · ${accountLabel(a)}`, state.account)).join("")}</select></label>${selected?.connections.length > 1 ? `<label class="connection-filter">Connection / key label<select data-scope="connection">${option("all", "All connections", state.connection)}${selected.connections.map((c) => option(c.id, c.alias, state.connection)).join("")}</select></label>` : ""}</div>`;
}

function windows(a) {
  return a.windows
    .map((value, i) => {
      const status =
        value === null ? "unknown" : value < 10 ? "critical" : value <= 25 ? "low" : "normal";
      const name = i === 0 ? "5-hour window" : "Weekly window";
      return `<div class="quota-window" data-status="${status}"><div class="window-top"><span class="window-name">${name}</span><strong class="quota-value">${value === null ? "Unknown" : `${value}%`} <small>${value === null ? "remaining unavailable" : "remaining"}</small></strong></div>${value === null ? '<div class="context">Quota not reported</div>' : `<div class="meter" role="meter" aria-label="${escapeText(`${providerName(a.provider)} ${accountLabel(a)}, ${name}, remaining quota`)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}" aria-valuetext="${value}% remaining${status === "normal" ? "" : `, ${status} quota`}"><div class="meter-fill" style="width:${value}%"></div></div>`}<div class="reset"><span>Resets ${a.resets[i] ?? "Unknown"}</span><span>${status === "low" ? "Low quota" : status === "critical" ? "Critical quota" : ""}</span></div></div>`;
    })
    .join("");
}

function sourcePanel(a, variant, connection = null) {
  const activeConnections = a.connections.filter((c) => c.status === "connected");
  const usable =
    !a.removing && (connection ? connection.status === "connected" : activeConnections.length > 0);
  if (!usable)
    return `<article class="source-panel"><h4>${escapeText(accountLabel(a))}</h4><p class="context">${escapeText(context(a))} · ${escapeText((connection ?? a.connections[0]).alias)} · Synthetic demo</p><div class="notice">${badge(a.removing ? "removing" : (connection ?? a.connections[0]).status)}<p>${a.removing ? "Monitoring cleanup could not be confirmed. Values hidden; edits and reconnect blocked." : "No quota or activity is available for this connection."}</p></div></article>`;
  const unknownBilling = a.provider === "openrouter" && a.billing === "unknown";
  const sourceKey =
    a.billing === "verified" ? `${a.id}-shared` : `${a.id}${connection ? `-${connection.id}` : ""}`;
  return `<article class="source-panel" data-source="${sourceKey}"><div class="source-header"><div><h4>${escapeText(accountLabel(a))}</h4><p class="context">${escapeText(context(a))} · ${a.provider === "codex" ? "Subscription" : "API billing"}</p><p class="context">${connection ? escapeText(connection.alias) : `${activeConnections.length} ${activeConnections.length === 1 ? "connection" : "connections"}`} · Synthetic demo</p></div></div>${a.provider === "codex" ? windows(a, variant) : `<p class="money">24.80 <small>provider credits</small></p><p class="context">Reported balance · not a subscription allowance</p><p class="billing-note">${unknownBilling ? "Billing relationship unknown; do not add these balances." : `Verified shared source · shared by ${activeConnections.length} connections. Balance shown once.`}</p>`}<div class="source-footer">${badge(a.freshness)}<button type="button" class="text-button" data-detail="${a.id}"${connection ? ` data-detail-connection="${connection.id}"` : ""} aria-label="${escapeText(`Details: ${context(a)}, ${accountLabel(a)}${connection ? `, ${connection.alias}` : ""}`)}">Details →</button></div></article>`;
}

function overview(id, accounts) {
  const s = scoped[id];
  const chosen = accounts.filter(
    (a) =>
      (s.provider === "all" || a.provider === s.provider) &&
      (s.account === "all" || a.id === s.account),
  );
  return `<h2 class="surface-heading">Your quotas, at a glance</h2><p class="intro">Independent accounts. A little more clarity.</p>${filters(id, accounts)}${
    accounts.length === 0
      ? empty()
      : `${chosen.length ? "" : '<div class="empty">No accounts in this selection.</div>'}${[
          "codex",
          "openrouter",
        ]
          .map((provider) => {
            const group = chosen.filter((a) => a.provider === provider);
            if (!group.length) return "";
            return `<h3 class="section-title">${providerName(provider)} <span>${provider === "codex" ? "Subscription quotas" : "API billing · Coming Soon"}</span></h3>${group
              .map((a) => {
                if (a.provider === "codex") return sourcePanel(a, id);
                const connections = a.connections.filter(
                  (c) => s.connection === "all" || c.id === s.connection,
                );
                if (a.billing === "verified")
                  return sourcePanel(a, id, s.connection === "all" ? null : connections[0]);
                return connections.map((c) => sourcePanel(a, id, c)).join("");
              })
              .join("")}`;
          })
          .join(
            "",
          )}<p class="context">No combined quota or balance. Each reset belongs to its own source. Times shown in this fixture: UTC+07.</p>`
  }`;
}
function empty() {
  return `<div class="empty"><strong>${config.fixture === "soon" ? "More providers, when ready" : "No accounts configured"}</strong><p>Codex monitoring is gated. OpenRouter, Claude Code and Gemini CLI are Coming Soon. Local setup does not authorize monitoring.</p><p>Try an explicit synthetic Demo preview in Settings.</p><button type="button" class="text-button" data-screen="settings">Open Settings →</button></div>`;
}

function accountsScreen(id, accounts) {
  return `<h2 class="surface-heading">Accounts</h2><p class="intro">Your names. Each connection stays independent.</p>${accounts.length ? "" : empty()}${[
    "codex",
    "openrouter",
  ]
    .map((provider) => {
      const group = accounts.filter((a) => a.provider === provider);
      return `<section class="provider-group"><div class="provider-heading"><h3>${providerName(provider)}</h3><small>${provider === "codex" ? "Live monitoring gated" : "Coming Soon · demo structure"}</small></div>${group.map((a) => `<article class="account-block"><div class="account-heading"><div><h4>${escapeText(accountLabel(a))}</h4><p class="context">Local account alias · Identity not verified</p>${a.workspace ? `<p class="context">Workspace: ${a.workspace}</p>` : ""}</div><button class="text-button" type="button" data-detail="${a.id}" aria-label="${escapeText(`Inspect ${context(a)}, ${accountLabel(a)}`)}">Inspect</button></div>${a.removing ? '<div class="notice"><strong>Removal pending</strong><p>Monitoring cleanup could not be confirmed. Values hidden; edits and reconnect blocked.</p></div>' : ""}<details class="action-menu"><summary>Account actions<span class="sr-only">: ${escapeText(context(a))}, ${escapeText(accountLabel(a))}</span></summary><div class="action-list">${actionButton("Rename account", "rename-account", a)}${actionButton("Remove account", "remove-account", a)}</div></details>${a.connections.map((c) => `<div class="connection"><p class="connection-name">${escapeText(c.alias)}</p><p class="context">${c.type} · Identity not verified</p><div class="connection-meta">${badge(c.status)}${c.status === "connected" ? `<span class="context">${a.freshness === "stale" ? "Last read 13:42 · stale" : a.freshness === "unknown" ? "Last read unknown · freshness unknown" : "Last read 14:00 · current"}</span>` : ""}</div><details class="action-menu"><summary>Connection actions<span class="sr-only">: ${escapeText(context(a))}, ${escapeText(accountLabel(a))}, ${escapeText(c.alias)}</span></summary><div class="action-list">${actionButton(c.type.includes("key") ? "Rename key label" : "Rename connection", "rename-connection", a, c)}${c.status !== "disconnected" ? actionButton("Disconnect", "disconnect", a, c) : ""}${actionButton("Remove connection", "remove-connection", a, c)}</div></details></div>`).join("")}<div class="add-row"><button type="button" disabled>Add connection</button></div></article>`).join("")}<div class="add-row"><button type="button" disabled>Add account</button></div><p class="context">${provider === "codex" ? "Available after startup and authorization review." : "Supported read-only monitoring and credential lifecycle pending."} Add controls are future affordances.</p></section>`;
    })
    .join(
      "",
    )}<div class="notice"><strong>Claude Code & Gemini CLI · Coming Soon</strong><p>No supported connection flow in this exploration. No sign-in or API key collection.</p></div><p class="context">Disconnect stops Quotafern monitoring. Remove deletes local metadata after cleanup; it never deletes a provider account.</p>`;
}

function activity(a) {
  const days = Array.from({ length: 84 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 7, 3 + i)).toISOString().slice(0, 10);
    const level = i % 13 === 0 ? "unknown" : (i * (a.id === "work" ? 5 : 3) + 2) % 5;
    const count = level === "unknown" ? null : Number(level) * (a.id === "work" ? 800 : 1200);
    return `<button type="button" class="day" data-day="${i}" data-level="${level}" tabindex="${i === 0 ? "0" : "-1"}" aria-label="${escapeText(`${accountLabel(a)} · ${date}: ${count === null ? "Activity unknown" : `${count.toLocaleString("en-US")} tokens${count === 0 ? ", confirmed zero" : ""}`}`)}"></button>`;
  }).join("");
  return `<section class="detail-section"><h4>Activity · 84 days</h4><p class="context">3 Aug – 25 Oct 2026 · UTC · synthetic tokens</p><div class="calendar-months" aria-hidden="true"><span>Aug</span><span>Sep</span><span>Oct</span></div><div class="calendar" role="group" aria-label="${escapeText(`84-day token activity for ${context(a)}, ${accountLabel(a)}. Arrow up/down moves one day; left/right moves one week. Home/End moves to first/last day.`)}">${days}</div><p class="legend">Dashed outline: unknown · Solid outline: confirmed zero<br />Lower to higher intensity: fewer to more tokens. Tokens never imply money.</p><p class="activity-detail" aria-live="polite">Focus a day to read its date and token activity.</p></section>`;
}

function apiBilling(a, connections) {
  const active = connections.filter((c) => c.status === "connected");
  const observations = a.billing === "verified" ? [null] : active;
  return observations
    .map(
      (c) =>
        `<div class="api-observation"><p class="context">${c ? escapeText(c.alias) : "Verified shared source"}</p><p class="money">24.80 <small>provider credits · synthetic</small></p><p class="billing-note">${a.billing === "verified" ? "Shown once across linked connections." : "Billing relationship unknown; do not add these balances."}</p></div>`,
    )
    .join("");
}

function detailsScreen(id, accounts) {
  const state = scoped[id];
  const a = accounts.find((item) => item.id === state.detail);
  const selectedConnection = state.detailConnection
    ? a?.connections.find((c) => c.id === state.detailConnection)
    : null;
  const connections = selectedConnection ? [selectedConnection] : (a?.connections ?? []);
  const available =
    a &&
    !a.removing &&
    (!state.detailConnection || selectedConnection) &&
    connections.some((c) => c.status === "connected");
  return `<button type="button" class="text-button" data-screen="overview">← Back to Overview</button><h2 class="surface-heading">Details</h2>${filters(id, accounts, true)}${!available ? `<div class="empty"><strong>Selection unavailable</strong><p>${a ? `${escapeText(context(a))} · ${escapeText(accountLabel(a))}. No authorized source values in this simulated state.` : "This account is missing or was removed. Choose an account or return to Overview."}</p><p>Another account’s values are never substituted.</p></div>` : `<div class="detail-context"><h3>${escapeText(accountLabel(a))}</h3><p class="context">${escapeText(context(a))}${selectedConnection ? ` · ${escapeText(selectedConnection.alias)}` : ""} · Synthetic demo</p><p class="context">Identity not verified</p>${badge(a.freshness)}</div>${a.provider === "codex" ? `<section class="detail-section"><h4>Subscription quota</h4>${windows(a, id)}</section><section class="detail-section"><h4>Credits & spending</h4><dl class="facts"><div><dt>Credit balance</dt><dd>${a.id === "work" ? "Unknown" : "120 provider credits"}</dd></div><div><dt>Unlimited credits</dt><dd>Not reported</dd></div><div><dt>Spending reported</dt><dd>${a.id === "work" ? "Unknown" : "USD 8.40"}</dd></div><div><dt>Reported limit</dt><dd>${a.id === "work" ? "Unknown" : "USD 20.00"}</dd></div></dl><p class="billing-note">Provider-reported controls, read only. Currency and credit units stay separate.</p></section><section class="detail-section"><h4>Earned resets</h4><dl class="facts"><div><dt>Reported entitlement</dt><dd>${a.id === "work" ? "Unknown" : "2 resets"}</dd></div><div><dt>Redemption</dt><dd>Unavailable</dd></div></dl><p class="billing-note">Informational only. No reset consumption.</p></section>${activity(a)}` : `<section class="detail-section"><h4>API billing · Coming Soon</h4>${apiBilling(a, connections)}</section><section class="detail-section"><h4>Provider details</h4><p class="context">Subscription windows, spending controls, earned resets and token activity: unsupported in this future-provider design fixture. No fabricated monitoring controls.</p></section>`}`}`;
}

function settingsScreen(id) {
  const resolved =
    config.mode === "system"
      ? systemTheme.matches
        ? "Dark"
        : "Light"
      : config.mode === "dark"
        ? "Dark"
        : "Light";
  return `<h2 class="surface-heading">Make it feel like home</h2><p class="intro">Appearance changes only this temporary preview.</p><section class="settings-group"><h3>Appearance</h3><div class="setting-options" role="group" aria-label="Appearance">${[
    ["system", "Follow System"],
    ["light", "Light"],
    ["dark", "Dark"],
  ]
    .map(
      ([value, label]) =>
        `<button type="button" data-setting="mode" data-value="${value}" aria-pressed="${config.mode === value}">${label}</button>`,
    )
    .join(
      "",
    )}</div><p>${resolved} appearance${config.mode === "system" ? " · following the operating system" : " · explicit choice"}. No preference is saved by this prototype.</p></section><section class="settings-group"><h3>Palette</h3><div class="setting-options" role="group" aria-label="Palette">${[
    ["graphite-jade", "Graphite & Jade"],
    ["zinc-signal", "Zinc & Signal"],
  ]
    .map(
      ([value, label]) =>
        `<button type="button" data-setting="palette" data-value="${value}" aria-pressed="${(config.palette === "native" ? directions[id].palette : config.palette) === value}">${label}</button>`,
    )
    .join(
      "",
    )}</div><p>Palette stays independent from Light, Dark and Follow System.</p></section><section class="settings-group"><h3>Demo preview</h3><button type="button" data-demo>Open synthetic Demo preview</button><p>Explicit, invented quota values. Does not contact a provider or authorize monitoring.</p></section><section class="settings-group"><h3>Future connection preferences</h3><label><input type="checkbox" disabled /> Remember connection · not available</label><p>Off by default. Requires a separate credential lifecycle and consent review. An appearance choice never grants authorization.</p></section><div class="notice"><strong>Monitoring is disabled</strong><p>Codex live startup is gated. Other providers are Coming Soon. Codex manages its own authentication and may refresh credentials or write authentication state in an approved future connection flow.</p></div>`;
}

function render() {
  document.body.dataset.height = config.height;
  document.documentElement.style.setProperty("--dialog-width", `${Number(config.width) - 24}px`);
  const accounts = fixture();
  const ids = config.variant === "all" ? Object.keys(directions) : [config.variant];
  const theme = config.mode === "system" ? (systemTheme.matches ? "dark" : "light") : config.mode;
  const height = config.height === "full" ? "auto" : `${config.height}px`;
  document.querySelector("#comparisons").innerHTML = ids
    .map((id) => {
      const direction = directions[id];
      const screen = config.screen;
      const content =
        screen === "accounts"
          ? accountsScreen(id, accounts)
          : screen === "details"
            ? detailsScreen(id, accounts)
            : screen === "settings"
              ? settingsScreen(id)
              : overview(id, accounts);
      return `<section class="concept" data-variant="${id}" style="--popup-width:${config.width}px;--popup-height:${height}"><h2 class="concept-title">${id} · ${direction.name}</h2><p class="concept-description">${direction.description}</p><div class="popup ${id}" data-theme="${theme}" data-palette="${config.palette === "native" ? direction.palette : config.palette}"><header class="shell-heading"><div class="brand">${leaf}Quotafern</div><span class="demo-label">Synthetic demo</span></header><nav class="primary-nav" aria-label="${id} preview navigation">${["overview", "accounts", "settings"].map((tab) => `<button type="button" data-screen="${tab}"${screen === tab || (screen === "details" && tab === "overview") ? ' aria-current="page"' : ""}>${tab[0].toUpperCase() + tab.slice(1)}</button>`).join("")}</nav><div class="content" tabindex="0" role="region" aria-label="${id} ${screen} scrollable content">${content}</div><footer class="shell-footer"><span>Design state · no provider access</span><span>${theme === "dark" ? "Dark" : "Light"}</span></footer></div></section>`;
    })
    .join("");
  document.querySelector("#variant-label").textContent =
    config.variant === "all"
      ? "Compare A / B / C"
      : `${config.variant} · ${directions[config.variant].name.split(" / ")[0]}`;
  const next = new URL(location.href);
  for (const [name, value] of Object.entries(config)) next.searchParams.set(name, value);
  history.replaceState(null, "", next);
}
function announce(message) {
  document.querySelector("#announcement").textContent = message;
}
function setConfig(name, value) {
  form.elements[name].value = value;
  config[name] = value;
  render();
}
form.addEventListener("submit", (event) => event.preventDefault());
form.addEventListener("change", () => {
  const next = Object.fromEntries(new FormData(form));
  if (next.fixture !== config.fixture) {
    aliases.clear();
    disconnected.clear();
    removing.clear();
    removingConnections.clear();
    for (const state of Object.values(scoped))
      Object.assign(state, {
        provider: "all",
        account: "all",
        connection: "all",
        detail:
          next.fixture === "keys" || next.fixture === "shared" || next.fixture === "billing"
            ? "router"
            : "personal",
        detailConnection: null,
      });
  }
  config = next;
  render();
  announce(`Showing ${config.screen}, ${config.fixture} synthetic fixture.`);
});

document.querySelector("#comparisons").addEventListener("change", (event) => {
  const select = event.target.closest("[data-scope]");
  if (!select) return;
  const id = select.closest("[data-variant]").dataset.variant;
  const state = scoped[id];
  const scope = select.dataset.scope;
  if (scope === "selection")
    Object.assign(state, { provider: "all", account: "all", connection: "all" });
  else {
    state[scope] = select.value;
    if (scope === "provider") state.account = "all";
    if (scope !== "connection") state.connection = "all";
    if (scope === "detail") state.detailConnection = null;
  }
  render();
  document.querySelector(`[data-variant="${id}"] [data-scope="${scope}"]`)?.focus();
  announce(`Selected ${select.selectedOptions[0].textContent}. Synthetic context updated.`);
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  const id = button.closest("[data-variant]")?.dataset.variant;
  if (button.dataset.screen) {
    setConfig("screen", button.dataset.screen);
    focusContent(id);
  }
  if (button.dataset.detail) {
    scoped[id].detail = button.dataset.detail;
    scoped[id].detailConnection = button.dataset.detailConnection ?? null;
    setConfig("screen", "details");
    focusContent(id);
    announce(
      `Details for ${accountLabel(fixture().find((a) => a.id === scoped[id].detail))}. Synthetic demo.`,
    );
  }
  if (button.dataset.setting) {
    setConfig(button.dataset.setting, button.dataset.value);
    document
      .querySelector(
        `[data-variant="${id}"] [data-setting="${button.dataset.setting}"][data-value="${button.dataset.value}"]`,
      )
      ?.focus();
  }
  if (button.hasAttribute("data-demo")) {
    setConfig("fixture", "demo");
    setConfig("screen", "overview");
  }
  if (button.dataset.cycle) cycle(Number(button.dataset.cycle));
  if (button.hasAttribute("data-cancel")) closeDialog(button.closest("dialog"));
  if (button.dataset.action) openAction(button, id);
});
function focusContent(id) {
  document.querySelector(`[data-variant="${id ?? "A"}"] .content`)?.focus();
}
function cycle(delta) {
  const keys = ["all", "A", "B", "C"];
  setConfig("variant", keys[(keys.indexOf(config.variant) + delta + keys.length) % keys.length]);
}
document.querySelector(".variant-switcher").addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    cycle(event.key === "ArrowLeft" ? -1 : 1);
  }
});
document.addEventListener("focusin", (event) => {
  if (event.target.matches(".day")) {
    const calendar = event.target.closest(".calendar");
    for (const day of calendar.querySelectorAll(".day"))
      day.tabIndex = day === event.target ? 0 : -1;
    calendar.parentElement.querySelector(".activity-detail").textContent =
      event.target.getAttribute("aria-label");
  }
});
document.addEventListener("keydown", (event) => {
  const day = event.target.closest(".day");
  if (day) {
    const moves = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };
    let index = Number(day.dataset.day);
    if (event.key in moves) index = Math.max(0, Math.min(83, index + moves[event.key]));
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = 83;
    else return;
    event.preventDefault();
    day.closest(".calendar").querySelector(`[data-day="${index}"]`).focus();
  }
  if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
    const disclosure = event.target.closest("details[open]");
    if (disclosure) {
      event.preventDefault();
      event.stopPropagation();
      disclosure.open = false;
      disclosure.querySelector("summary").focus();
    }
  }
});

function openAction(button, variant) {
  const account = fixture().find((a) => a.id === button.dataset.account);
  const connection = account.connections.find((c) => c.id === button.dataset.connection);
  dialogTarget = { account, connection, action: button.dataset.action, variant };
  triggerKey = { variant, focus: button.dataset.focus };
  if (button.dataset.action.startsWith("rename")) {
    const dialog = document.querySelector("#rename-dialog");
    const input = document.querySelector("#alias-input");
    document.querySelector("#rename-heading").textContent = connection
      ? "Rename connection"
      : "Rename account";
    document.querySelector("#rename-context").textContent =
      `${providerName(account.provider)} / ${accountLabel(account)}${connection ? ` / ${connection.alias}` : ""} · Synthetic preview`;
    input.value = (connection ?? account).alias;
    document.querySelector("#alias-error").textContent = "";
    input.removeAttribute("aria-invalid");
    updateCount();
    dialog.showModal();
    input.focus();
    input.select();
  } else {
    const dialog = document.querySelector("#action-dialog");
    const removingAccount = button.dataset.action === "remove-account";
    const removingConnection = button.dataset.action === "remove-connection";
    document.querySelector("#action-heading").textContent =
      `${removingAccount || removingConnection ? "Remove" : "Disconnect"} ${connection ? "connection" : "account"}?`;
    document.querySelector("#action-description").textContent =
      `${providerName(account.provider)} / ${accountLabel(account)}${connection ? ` / ${connection.alias}` : ` · ${account.connections.length} connections`}. ${removingAccount || removingConnection ? "Local metadata is removed only after monitoring cleanup. This preview demonstrates the pending barrier and does not claim successful native cleanup." : "Stops only this simulated monitoring connection and clears its values."} Your provider account and external sign-in are unchanged. Synthetic preview only.`;
    document.querySelector("#simulate-action").textContent =
      removingAccount || removingConnection ? "Preview removal pending" : "Simulate disconnect";
    dialog.showModal();
    dialog.querySelector("[data-cancel]").focus();
  }
}
function closeDialog(dialog) {
  dialog.close();
  if (triggerKey) {
    const target = document.querySelector(
      `[data-variant="${triggerKey.variant}"] [data-focus="${triggerKey.focus}"]`,
    );
    if (target?.closest("details")) target.closest("details").open = true;
    (target && !target.disabled
      ? target
      : document.querySelector(`[data-variant="${triggerKey.variant}"] .content`)
    )?.focus();
  }
}
for (const dialog of document.querySelectorAll("dialog")) {
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const controls = [...dialog.querySelectorAll("button:not([disabled]), input:not([disabled])")];
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeDialog(dialog);
  });
}
function updateCount() {
  document.querySelector("#alias-count").textContent =
    `${Array.from(document.querySelector("#alias-input").value.normalize("NFC").trim()).length} / 80 Unicode code points`;
}
document.querySelector("#alias-input").addEventListener("input", updateCount);
document.querySelector("#rename-form").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.isComposing) event.preventDefault();
});
document.querySelector("#rename-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#alias-input");
  const value = input.value.normalize("NFC").trim();
  if (
    !/[\p{L}\p{N}\p{P}\p{S}]/u.test(value) ||
    Array.from(value).length > 80 ||
    /[\p{Cc}\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u.test(input.value)
  ) {
    document.querySelector("#alias-error").textContent =
      "Use a nonempty name of up to 80 Unicode code points, without control or invisible direction characters.";
    input.setAttribute("aria-invalid", "true");
    input.focus();
    return;
  }
  aliases.set((dialogTarget.connection ?? dialogTarget.account).id, value);
  render();
  closeDialog(document.querySelector("#rename-dialog"));
  announce("Preview name updated. Provider identity, selection and billing are unchanged.");
});
document.querySelector("#simulate-action").addEventListener("click", () => {
  if (dialogTarget.action === "disconnect") disconnected.add(dialogTarget.connection.id);
  else if (dialogTarget.connection) removingConnections.add(dialogTarget.connection.id);
  else removing.add(dialogTarget.account.id);
  render();
  closeDialog(document.querySelector("#action-dialog"));
  announce(
    dialogTarget.action === "disconnect"
      ? "Simulated connection disconnected. Values cleared."
      : "Removal pending: monitoring cleanup could not be confirmed. No removal success claimed.",
  );
});
systemTheme.addEventListener("change", () => {
  if (config.mode === "system") render();
});
render();
