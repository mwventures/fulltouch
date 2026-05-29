# FullTouch — Fullscreen Touch Controls

A Chrome extension for touchscreen 2-in-1 laptops. In browser fullscreen (F11),
Chrome hides the tab strip and address bar, and there's **no touch gesture** to
bring them back or to leave fullscreen — the top-edge reveal only works with a
mouse. FullTouch fixes that, and adds a two-finger swipe for switching tabs.

## Gestures

**Swipe down from the top edge** in fullscreen to reveal a slim nav bar with:

- **‹ / ›** — back / forward
- **⟳** — reload (optional)
- **address box** — type a URL or a search query
- **⌃** — hide the bar (stay in fullscreen)
- **✕** — exit fullscreen entirely

Swipe up on the bar or press <kbd>Esc</kbd> to dismiss it without leaving
fullscreen.

**Swipe two fingers sideways to switch tabs** (touchscreen) — swipe right for the
previous (left) tab, swipe left for the next, wrapping around at the ends. It
works in or out of fullscreen; single-finger swipe-to-go-back is left untouched.
Turn it off or reverse the direction in Settings.

Prefer a visible target to a blind swipe? Enable the optional **pull tab** in
Settings — a small handle at the top edge you can tap or drag down to open the
bar.

## How it works

Chrome's *browser* fullscreen (F11) is owned by the browser, not the page — a
web page can't leave it and `document.exitFullscreen()` has no effect on it. So
FullTouch splits the work:

- A **content script** detects the gestures and renders the nav bar inside a
  **Shadow DOM** overlay (isolated from page CSS), staying in fullscreen.
- The **service worker** is the only context with `chrome.windows` /
  `chrome.tabs` access, so it handles the privileged actions: **✕** asks it to
  call `chrome.windows.update({ state: "normal" })` (which actually drops the
  window out of fullscreen), and the two-finger swipe asks it to activate the
  next/previous tab.
- **Keyboard fallbacks** (`chrome.commands`) cover pages where content scripts
  can't run (chrome://, the Web Store, the new-tab page).

## Install (unpacked, for development)

1. Run `python scripts/gen_icons.py` if `icons/` is missing.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Open a page, press **F11**, then swipe down from the top edge.

Default shortcuts (editable at `chrome://extensions/shortcuts`):
`Alt+N` toggles the bar, `Alt+Shift+F` exits fullscreen.

## Settings

Click the toolbar icon to open the options page (or right-click it → **Options**).
Configure the top-edge zone and reveal distance, two-finger tab switching and its
direction, the optional pull tab, the search engine, and whether the reload
button shows.

## Privacy

FullTouch collects and transmits **no data**. The `<all_urls>` host permission
is required only so the gestures work on every site; nothing about the pages you
visit leaves your device.
