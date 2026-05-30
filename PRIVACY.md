# FullTouch - Privacy Policy

_Last updated: 2026-05-29_

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

It does not inspect page content, read what you type, record which sites you
visit, or send anything off your device. Because there is no networking code in
the extension at all, it is technically incapable of doing so.

## Permissions, line by line

| Permission | Why it's needed |
| --- | --- |
| `host_permissions: <all_urls>` | So the reveal gesture and nav bar work on every site you browse in fullscreen. Used only to run the gesture detection and draw the overlay; no page data is read or sent. |
| `storage` | To save your own settings locally (and sync them across your own Chrome via `chrome.storage.sync`). Nothing else is stored. |

FullTouch requests **no other permissions** - in particular, no `"tabs"`
permission, even though it can switch and open tabs (those actions don't require
it).

## Open source

FullTouch is open-source. You don't have to take any of this on trust - you can
read every line of code yourself.

## Contact

Questions about privacy? Email **morningwoodventures@gmail.com**.
