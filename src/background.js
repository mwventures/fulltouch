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
  grabber: "fullscreen", // "fullscreen" | "always" | "off" — when to show the pull tab
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "exitFullscreen") {
    exitWindowFullscreen(sender.tab?.windowId).then(() => sendResponse({ ok: true }));
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

// Toolbar button toggles the bar on the active tab.
chrome.action.onClicked.addListener((tab) => {
  if (tab?.id != null) sendToTab(tab.id, { type: "toggleNavbar" });
});

function sendToTab(tabId, message) {
  // The content script may be absent on restricted pages — swallow the error.
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
}
