// FullTouch — options page. Settings live in chrome.storage.sync and are read
// live by both the content script and the service worker.

const DEFAULTS = {
  enabled: true,
  edgeZonePx: 64,
  thresholdPx: 40,
  grabber: "fullscreen",
  searchEngine: "google",
  customSearchTemplate: "https://example.com/search?q=%s",
  showReload: true,
  debug: false,
};

const fields = {
  enabled: { el: "enabled", type: "checkbox" },
  edgeZonePx: { el: "edgeZonePx", type: "number" },
  thresholdPx: { el: "thresholdPx", type: "number" },
  grabber: { el: "grabber", type: "value" },
  showReload: { el: "showReload", type: "checkbox" },
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

async function load() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  for (const key of Object.keys(fields)) writeField(key, stored[key]);
  syncCustomRow();
}

async function saveField(key) {
  await chrome.storage.sync.set({ [key]: readField(key) });
  flash("Saved");
}

for (const key of Object.keys(fields)) {
  const el = $(fields[key].el);
  const evt = fields[key].type === "value" && el.tagName === "SELECT" ? "change"
    : fields[key].type === "checkbox" ? "change" : "input";
  el.addEventListener(evt, () => {
    if (key === "searchEngine") syncCustomRow();
    saveField(key);
  });
}

load();
