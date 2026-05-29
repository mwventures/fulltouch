// FullTouch — service worker (MV3, event-driven).
//
// The content script can detect gestures and render UI, but it lives in an
// isolated world with no access to chrome.windows. Only the service worker can
// drop the *browser* (F11) window out of fullscreen. So the content script
// asks us, and we do it here.

const DEFAULTS = {
  enabled: true,
  edgeZonePx: 64, // how close to the top edge a swipe must start
  thresholdPx: 40, // how far down the swipe must travel to reveal the bar
  tabSwitch: true, // two-finger horizontal swipe switches tabs (touchscreen)
  tabSwitchReverse: false, // flip which swipe direction goes to which tab
  grabber: "off", // "fullscreen" | "always" | "off" — when to show the pull tab
  searchEngine: "google", // google | bing | duckduckgo | custom
  customSearchTemplate: "https://example.com/search?q=%s",
  showReload: true,
  debug: false,
};

// Seed defaults on first install so the options page and content script agree.
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  await chrome.storage.sync.set({ ...DEFAULTS, ...stored });
});

// Exit the *browser* window's fullscreen state. windowId comes from the sender
// tab, so this needs no "tabs" permission.
async function exitWindowFullscreen(windowId) {
  if (windowId == null) return;
  try {
    const win = await chrome.windows.get(windowId);
    if (win.state === "fullscreen") {
      // "normal" returns to the windowed state and brings the real toolbar back.
      await chrome.windows.update(windowId, { state: "normal" });
    }
  } catch (e) {
    // Window may have closed; nothing actionable.
  }
}

// Switch to the previous/next tab in the sender's window, wrapping around.
// dir: "prev" (toward the first tab) | "next" (toward the last). Reads only
// id/index/active, so — like the windowId above — it needs no "tabs" permission.
async function cycleTab(windowId, dir) {
  if (windowId == null || (dir !== "prev" && dir !== "next")) return;
  try {
    // query() isn't guaranteed to be index-ordered, so sort to be safe.
    const tabs = (await chrome.tabs.query({ windowId })).sort((a, b) => a.index - b.index);
    if (tabs.length < 2) return; // nothing to switch to
    const pos = tabs.findIndex((t) => t.active);
    if (pos === -1) return;
    const n = tabs.length;
    const target = dir === "next" ? (pos + 1) % n : (pos - 1 + n) % n;
    await chrome.tabs.update(tabs[target].id, { active: true });
  } catch (e) {
    // Tab/window may have closed mid-gesture; nothing actionable.
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "exitFullscreen") {
    exitWindowFullscreen(sender.tab?.windowId).then(() => sendResponse({ ok: true }));
    return true; // async response
  }
  if (msg?.type === "cycleTab") {
    cycleTab(sender.tab?.windowId, msg.dir).then(() => sendResponse({ ok: true }));
    return true; // async response
  }
  return false;
});

// Keyboard fallbacks — these work even on pages where the content script can't
// run (chrome://, the Web Store, the new-tab page, some PDF views).
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  if (command === "exit-fullscreen") {
    await exitWindowFullscreen(tab.windowId);
    return;
  }
  if (command === "toggle-navbar") {
    sendToTab(tab.id, { type: "toggleNavbar" });
  }
});

// Clicking the toolbar icon opens the settings page. (In F11 fullscreen the
// real toolbar isn't visible anyway, so toggling the bar from here never made
// sense — the Alt+N command, the pull tab, and the top-edge swipe cover that.)
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

function sendToTab(tabId, message) {
  // The content script may be absent on restricted pages — swallow the error.
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
}
