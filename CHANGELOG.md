# Changelog

All notable changes to FullTouch are recorded here. Newest at the top.

## [Unreleased]

## [1.1.0] - 2026-06-13
- Added a "Problems or Suggestions?" line at the bottom of the options page with a one-tap email link to morningwoodventures@gmail.com.
- The Enabled on/off switch is now per-device: turning FullTouch off on one computer no longer disables it on your other synced Chromes (every other setting still syncs). Note: with this update each device starts enabled, so if you had FullTouch turned off everywhere, you'll need to turn it off again on each device where you don't want it.
- Fixed the nav bar (and its Support pill) leaking into printed pages and print preview - most noticeable as a stray bar at the bottom of each page when printing from Google Docs. The overlay is now hidden in print output.

## [1.0.0] - 2026-06-02
- First public release.
- Added a tab strip (on by default): a row of your open tabs below the nav bar - tap one to switch, or turn it off in Settings. It reads open-tab titles and icons on your device only - nothing is stored or sent.
- Options page: moved the FullTouch title and tagline to the very top, and added a note that extensions (FullTouch included) can't run on pages like the New Tab, Chrome Settings, or the Chrome Web Store.
- Licensed under the MIT license, with per-file copyright headers (Morningwood Ventures LLC).

## [0.7.0] - 2026-06-02
- The support button (nav bar pill and options-page callout) now links to a Stripe payment page instead of GitHub Sponsors, and is relabeled "Support" (the nav pill) / "Support FullTouch Here" (the options callout).

## [0.6.1] - 2026-05-30
- Options page: the subtitle now reads "Fullscreen touch controls for tablets and 2-in-1 laptops", and the privacy explainer link is centered.
- Swapped em-dashes for hyphens across the interface and docs.

## [0.6.0] - 2026-05-30
- Fixed the nav bar, the fullscreen hint, and the exit (✕) button being unreachable or mis-placed when the page was scrolled down - the overlay is now anchored to the screen at any scroll position, even on sites that apply a CSS transform to the page (which previously made it scroll away with the content).
- Exiting fullscreen with ✕ now restores a maximized window (matching Chrome's own F11 exit) instead of a small floating one.
- Added a prominent "No data collected. Ever." privacy banner to the top of the options page, with an expandable explanation of why Chrome's "all sites" install warning doesn't mean data collection.

## [0.5.0] - 2026-05-29
- Added a "+" new-tab button to the nav bar (just right of reload) that opens a new tab.

## [0.4.0] - 2026-05-29
- Fixed the fullscreen "Swipe down" hint reappearing on every tab while cycling tabs - it now shows once per fullscreen session.
- Refreshed the accent color to cyan throughout - the app icon, the options toggle switches, and focus highlights (previously indigo).
- Added a subtle, shimmering "♥ Donate" pill to the nav bar (just left of the collapse button), linking to GitHub Sponsors.

## [0.3.0] - 2026-05-29
- Added a donation callout to the top of the options page - optional GitHub Sponsors support to keep the project (and Cookie, our Chief Canine Officer, in biscuits) going.
- The options page now opens automatically the first time you install the extension, so the settings (and gestures) are easy to find.
- Each time you enter fullscreen (F11), a brief "Swipe down to access controls" hint with a bobbing down-arrow appears for ~3 seconds - like Chrome's own "Press Esc" hint.

## [0.2.0] - 2026-05-29
- Two-finger horizontal swipe switches tabs on touchscreens: swipe right → the previous (left) tab, swipe left → the next (right) tab, wrapping at the ends. On by default; toggle it or reverse the direction in the options page.
- Pull tab is now off by default (previously shown only in fullscreen). Reveal the bar with a top-edge swipe down, or re-enable the pull tab in the options page.
- Clicking the toolbar icon now opens the options page instead of toggling the nav bar. Toggle the bar with Alt+N or the top-edge swipe instead.

## [0.1.0] - 2026-05-29
First working version.

- Swipe down from the top edge in fullscreen to reveal a nav bar.
- Pull-tab affordance (shown in fullscreen by default) as a reliable touch target - tap or pull down to open.
- Nav bar with back, forward, reload, an address/search box, collapse, and exit-fullscreen.
- Exit-fullscreen leaves Chrome's browser (F11) fullscreen via the service worker (`chrome.windows.update`).
- Dismiss the bar by tapping off it, swiping up on it, pressing `Esc`, or the collapse button.
- Address box mirrors Chrome's omnibox: TLD-aware URL-vs-search detection (e.g. a mistyped `google.con` falls through to search).
- Options page: enable/disable, edge zone, reveal distance, pull-tab visibility, search engine (Google/Bing/DuckDuckGo/custom), reload-button toggle, debug overlay.
- Keyboard fallbacks: `Alt+N` toggle bar, `Alt+Shift+F` exit fullscreen.
- Self-contained SVG icons in the bar; generated PNG extension icons.
