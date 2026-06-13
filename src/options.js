// Copyright (c) 2026 Morningwood Ventures LLC. Licensed under the MIT License.

// FullTouch — options page. `enabled` lives in chrome.storage.local (per-device);
// every other setting lives in chrome.storage.sync. Both are read live by the
// content script and the service worker.

// Keep these three blocks byte-identical across background.js, content.js, and
// options.js.
const LOCAL_DEFAULTS = {
  enabled: true,
};
const SYNC_DEFAULTS = {
  edgeZonePx: 64,
  thresholdPx: 40,
  tabSwitch: true,
  tabSwitchReverse: false,
  grabber: "off",
  searchEngine: "google",
  customSearchTemplate: "https://example.com/search?q=%s",
  showReload: true,
  tabStrip: true,
  debug: false,
};
const DEFAULTS = { ...LOCAL_DEFAULTS, ...SYNC_DEFAULTS };

const fields = {
  enabled: { el: "enabled", type: "checkbox" },
  edgeZonePx: { el: "edgeZonePx", type: "number" },
  thresholdPx: { el: "thresholdPx", type: "number" },
  tabSwitch: { el: "tabSwitch", type: "checkbox" },
  tabSwitchReverse: { el: "tabSwitchReverse", type: "checkbox" },
  grabber: { el: "grabber", type: "value" },
  showReload: { el: "showReload", type: "checkbox" },
  tabStrip: { el: "tabStrip", type: "checkbox" },
  searchEngine: { el: "searchEngine", type: "value" },
  customSearchTemplate: { el: "customSearchTemplate", type: "value" },
  debug: { el: "debug", type: "checkbox" },
};

const $ = (id) => document.getElementById(id);
const statusEl = $("status");
let statusTimer = null;

function flash(text) {
  statusEl.textContent = text;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (statusEl.textContent = ""), 1500);
}

function readField(key) {
  const f = fields[key];
  const el = $(f.el);
  if (f.type === "checkbox") return el.checked;
  if (f.type === "number") {
    const n = Number(el.value);
    return Number.isFinite(n) ? n : DEFAULTS[key];
  }
  return el.value;
}

function writeField(key, value) {
  const f = fields[key];
  const el = $(f.el);
  if (f.type === "checkbox") el.checked = !!value;
  else el.value = value;
}

function syncCustomRow() {
  $("customRow").hidden = $("searchEngine").value !== "custom";
}

function syncTabSwitchRow() {
  // The reverse-direction toggle only matters when tab switching is on.
  $("tabSwitchReverseRow").hidden = !$("tabSwitch").checked;
}

async function load() {
  const [s, l] = await Promise.all([
    chrome.storage.sync.get(SYNC_DEFAULTS),
    chrome.storage.local.get(LOCAL_DEFAULTS),
  ]);
  const stored = { ...s, ...l };
  for (const key of Object.keys(fields)) writeField(key, stored[key]);
  syncCustomRow();
  syncTabSwitchRow();
}

async function saveField(key) {
  // `enabled` is per-device; everything else syncs.
  const area = key in LOCAL_DEFAULTS ? "local" : "sync";
  await chrome.storage[area].set({ [key]: readField(key) });
  flash("Saved");
}

for (const key of Object.keys(fields)) {
  const el = $(fields[key].el);
  const evt = fields[key].type === "value" && el.tagName === "SELECT" ? "change"
    : fields[key].type === "checkbox" ? "change" : "input";
  el.addEventListener(evt, () => {
    if (key === "searchEngine") syncCustomRow();
    if (key === "tabSwitch") syncTabSwitchRow();
    saveField(key);
  });
}

load();
