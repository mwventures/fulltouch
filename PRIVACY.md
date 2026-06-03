# FullTouch - Privacy Policy

_Last updated: 2026-06-02_

## The short version

**FullTouch collects no data. None. Ever.**

- It has **no servers**.
- It has **no analytics, telemetry, or tracking**.
- It contains **no networking code of any kind** - no `fetch`, no `XMLHttpRequest`, no remote scripts. There is nothing in the extension that *could* transmit your data anywhere.
- It **never reads, stores, or transmits** the content of the pages you visit.
- Nothing leaves your device.

## What it stores, and where

The only thing FullTouch saves is **your own settings** - gesture sensitivity, the
chosen search engine, and the on/off toggles you set on the options page. These
are stored locally through Chrome's built-in `chrome.storage.sync`, which keeps
them on your device and (if you're signed in to Chrome) syncs them across your own
Chrome browsers. They are never sent to us - we have no way to receive them.

## Why FullTouch needs the “all sites” permission

When you install it, Chrome warns that FullTouch can “read and change all your
data on all sites” (`<all_urls>`). This warning is **mandatory for any extension
allowed to run on every website**, and FullTouch's whole job - revealing a nav
bar, exiting fullscreen, switching tabs by touch - has to work on every page you
view in fullscreen. So it must be allowed to run everywhere.

“Allowed to run on every site” is **not** “collects your data.” On each page,
FullTouch does only two things:

1. Listens for the touch gestures that trigger its controls.
2. Draws its own navigation bar as an overlay (inside an isolated Shadow DOM).

It does not inspect page content, read what you type, or send anything off your
device. (The tab strip - on by default - reads your open tabs' titles and icons to
draw that strip on your device; see "The tab strip" below. You can turn it off in
Settings.) Because there is no networking code in the extension at all, it is
technically incapable of sending your data anywhere.

## The tab strip

FullTouch shows a "tab strip" (turned **on** by default, switchable off in Settings)
- a row of your open tabs below the nav bar so you can switch between them by touch.
When it's on, FullTouch reads the **titles and icons** of the tabs in the current
window to draw that strip - it does **not** read their URLs or their contents. This
happens entirely **on your device, in memory, and only while the bar is open**: the
strip is drawn for you and the information is then discarded. As with everything
else, none of it is stored or sent anywhere.

## Permissions, line by line

| Permission | Why it's needed |
| --- | --- |
| `host_permissions: <all_urls>` | So the reveal gesture and nav bar work on every site you browse in fullscreen (and, if you enable the optional tab strip, so your open tabs' titles and icons are available to draw it). Used only to run the gesture detection, draw the overlay, and - when the strip is on - read tab titles/icons; no page contents are read, and nothing is sent off your device. |
| `storage` | To save your own settings locally (and sync them across your own Chrome via `chrome.storage.sync`). Nothing else is stored. |

FullTouch requests **no other permissions** - in particular, no `"tabs"`
permission, even though it can switch and open tabs (those actions don't require
it).

## Open source

FullTouch is open-source. You don't have to take any of this on trust - you can
read every line of code yourself.

## Contact

Questions about privacy? Email **morningwoodventures@gmail.com**.
