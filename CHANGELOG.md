# Changelog

All notable changes to FullTouch are recorded here. Newest at the top.

## [Unreleased]

## [0.1.0] — 2026-05-29
First working version.

- Swipe down from the top edge in fullscreen to reveal a nav bar.
- Pull-tab affordance (shown in fullscreen by default) as a reliable touch target — tap or pull down to open.
- Nav bar with back, forward, reload, an address/search box, collapse, and exit-fullscreen.
- Exit-fullscreen leaves Chrome's browser (F11) fullscreen via the service worker (`chrome.windows.update`).
- Dismiss the bar by tapping off it, swiping up on it, pressing `Esc`, or the collapse button.
- Address box mirrors Chrome's omnibox: TLD-aware URL-vs-search detection (e.g. a mistyped `google.con` falls through to search).
- Options page: enable/disable, edge zone, reveal distance, pull-tab visibility, search engine (Google/Bing/DuckDuckGo/custom), reload-button toggle, debug overlay.
- Keyboard fallbacks: `Alt+N` toggle bar, `Alt+Shift+F` exit fullscreen.
- Self-contained SVG icons in the bar; generated PNG extension icons.
