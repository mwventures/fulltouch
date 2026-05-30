// FullTouch — content script.
//
// Two jobs:
//   1. Reveal a nav bar in fullscreen via touch. Primary trigger is a visible
//      "pull tab" pinned to the top-center (a real element, so pointer events
//      can't be swallowed by the page); secondary trigger is a swipe down from
//      the top edge.
//   2. Render that nav bar (back / forward / reload / URL+search / collapse /
//      exit-fullscreen) inside a Shadow DOM so page CSS and ours can't collide.
//
// Anything privileged (leaving *browser* fullscreen) is delegated to the
// service worker via chrome.runtime.sendMessage.

(() => {
  if (window.top !== window || window.__fullTouchInjected) return;
  window.__fullTouchInjected = true;

  const DEFAULTS = {
    enabled: true,
    edgeZonePx: 64, // how close to the top edge a swipe must start
    thresholdPx: 40, // how far down the swipe must travel to reveal the bar
    tabSwitch: true, // two-finger horizontal swipe switches tabs (touchscreen)
    tabSwitchReverse: false, // flip which swipe direction goes to which tab
    grabber: "off", // "fullscreen" | "always" | "off" — when to show the pull tab
    searchEngine: "google",
    customSearchTemplate: "https://example.com/search?q=%s",
    showReload: true,
    debug: false,
  };

  let settings = { ...DEFAULTS };

  chrome.storage.sync.get(DEFAULTS).then((s) => {
    settings = { ...DEFAULTS, ...s };
    applySettings();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [k, { newValue }] of Object.entries(changes)) settings[k] = newValue;
    applySettings();
  });

  // ---- Fullscreen detection -------------------------------------------------
  // Browser (F11) fullscreen is NOT reflected by document.fullscreenElement, so
  // we infer it: the viewport fills the whole screen only in fullscreen.
  function isLikelyFullscreen() {
    if (document.fullscreenElement) return true;
    try {
      if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
    } catch (e) { /* ignore */ }
    return Math.abs(window.innerHeight - screen.height) <= 2;
  }

  // ---- Search / navigation helpers -----------------------------------------

  const SEARCH_TEMPLATES = {
    google: "https://www.google.com/search?q=%s",
    bing: "https://www.bing.com/search?q=%s",
    duckduckgo: "https://duckduckgo.com/?q=%s",
  };

  function searchTemplate() {
    if (settings.searchEngine === "custom") return settings.customSearchTemplate;
    return SEARCH_TEMPLATES[settings.searchEngine] || SEARCH_TEMPLATES.google;
  }

  // A curated set of common multi-character TLDs. Any 2-letter TLD is treated
  // as a valid country-code TLD (all 2-letter TLDs are reserved ccTLDs), so we
  // only need to list longer ones here. This mirrors how Chrome's omnibox
  // decides URL-vs-search: "google.con" has a dot but ".con" isn't a real TLD,
  // so it falls through to search instead of loading a dead domain.
  const KNOWN_TLDS = new Set([
    "com", "org", "net", "edu", "gov", "mil", "int", "info", "biz", "name", "pro",
    "app", "dev", "page", "web", "site", "online", "store", "shop", "blog", "tech",
    "cloud", "xyz", "io", "co", "ai", "me", "tv", "fm", "gg", "ly", "sh", "so", "to",
    "cc", "ws", "run", "goog", "gle", "now", "live", "news", "media", "games", "game",
    "art", "design", "studio", "agency", "digital", "email", "wiki", "help", "link",
    "click", "fun", "life", "world", "today", "money", "finance", "health", "law",
    "academy", "school", "education", "university", "church", "team", "group", "inc",
    "ltd", "llc", "company", "solutions", "services", "systems", "network", "host",
  ]);

  function isValidTld(tld) {
    const t = tld.toLowerCase();
    return t.length === 2 || KNOWN_TLDS.has(t);
  }

  // Decide whether typed input is a URL (vs a search query).
  function looksLikeUrl(value) {
    if (value.includes(" ")) return false;
    const host = value.split(/[/?#]/)[0]; // strip path/query/fragment
    if (/^localhost(:\d+)?$/i.test(host)) return true;
    if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(host)) return true; // IPv4
    const hostname = host.replace(/:\d+$/, ""); // drop :port
    const labels = hostname.split(".");
    if (labels.length < 2 || labels.some((l) => l === "")) return false; // no dot / empty label
    return isValidTld(labels[labels.length - 1]);
  }

  function navigate(raw) {
    const value = raw.trim();
    if (!value) return;
    let url;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      url = value; // explicit scheme — respect it
    } else if (looksLikeUrl(value)) {
      const local = /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/.*)?$/i.test(value);
      url = (local ? "http://" : "https://") + value;
    } else {
      url = searchTemplate().replace("%s", encodeURIComponent(value));
    }
    window.location.assign(url);
  }

  function exitFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    chrome.runtime.sendMessage({ type: "exitFullscreen" }).catch(() => {});
    hideBar();
  }

  // ---- UI (Shadow DOM) ------------------------------------------------------

  const STYLE = `
    :host { all: initial; }
    .bar {
      position: fixed; top: 0; left: 0; right: 0;
      display: flex; align-items: center; gap: 6px;
      box-sizing: border-box; padding: 8px 10px;
      font: 14px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: rgba(28, 28, 32, 0.96); color: #fff;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
      transform: translateY(-115%);
      transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
      z-index: 2147483647; backdrop-filter: blur(8px);
    }
    .bar.open { transform: translateY(0); }
    button {
      all: unset; box-sizing: border-box;
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 40px; height: 40px; padding: 0 8px;
      border-radius: 10px; cursor: pointer; color: #fff;
      font-size: 18px; line-height: 1; user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    button:hover { background: rgba(255, 255, 255, 0.12); }
    button:active { background: rgba(255, 255, 255, 0.22); }
    button svg { display: block; width: 20px; height: 20px; }
    button.exit { color: #ff6b6b; }
    button.exit:hover { background: rgba(255, 107, 107, 0.18); }
    .url {
      flex: 1 1 auto; min-width: 0; height: 40px;
      box-sizing: border-box; padding: 0 14px;
      border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 999px;
      background: rgba(255, 255, 255, 0.08); color: #fff; font-size: 15px; outline: none;
    }
    .url:focus { border-color: #00bcd4; background: rgba(255, 255, 255, 0.14); }
    .url::placeholder { color: rgba(255, 255, 255, 0.5); }

    /* Donate pill — subtle cyan with a left-to-right shimmer + slight glow. */
    .donate {
      position: relative; overflow: hidden;
      display: inline-flex; align-items: center; gap: 6px;
      box-sizing: border-box; height: 40px; padding: 0 12px;
      border-radius: 999px; flex: none;
      color: #00bcd4; font-size: 13px; font-weight: 600; line-height: 1;
      text-decoration: none; white-space: nowrap; user-select: none;
      border: 1px solid rgba(0, 188, 212, 0.45);
      background: rgba(0, 188, 212, 0.1);
      box-shadow: 0 0 8px rgba(0, 188, 212, 0.3);
      -webkit-tap-highlight-color: transparent;
    }
    .donate:hover { background: rgba(0, 188, 212, 0.18); }
    .donate svg { display: block; width: 15px; height: 15px; }
    .donate svg, .donate span { position: relative; z-index: 1; }
    .donate::before {
      content: ""; position: absolute; inset: 0; z-index: 0; pointer-events: none;
      background: linear-gradient(100deg, transparent 35%, rgba(200, 250, 255, 0.45) 50%, transparent 65%);
      transform: translateX(-100%);
      animation: donate-shimmer 3s ease-in-out infinite;
    }
    /* Don't bother animating while the bar is hidden. */
    .bar:not(.open) .donate::before { animation-play-state: paused; }
    @keyframes donate-shimmer {
      0% { transform: translateX(-100%); }
      55%, 100% { transform: translateX(100%); }
    }

    /* Tap-to-dismiss layer — only present while the bar is open. Sits just
       below the bar and swallows the tap so the page isn't activated. */
    .backdrop {
      position: fixed; inset: 0; display: none;
      background: transparent; z-index: 2147483646; touch-action: none;
    }
    .backdrop.open { display: block; }

    /* Pull tab — the guaranteed touch target. */
    .grabber {
      position: fixed; top: 0; left: 50%; transform: translateX(-50%);
      width: 76px; height: 22px;
      display: none; align-items: flex-start; justify-content: center;
      background: rgba(28, 28, 32, 0.78); color: rgba(255,255,255,0.9);
      border-radius: 0 0 14px 14px; cursor: pointer;
      z-index: 2147483647; touch-action: none;
      -webkit-tap-highlight-color: transparent; user-select: none;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3); font-size: 13px; line-height: 22px;
      transition: height 120ms ease, background 120ms ease;
    }
    .grabber.show { display: flex; }
    .grabber:active { height: 30px; background: rgba(28,28,32,0.92); }
    .grabber .chev { font-size: 14px; }

    /* Debug HUD */
    .hud {
      position: fixed; right: 8px; bottom: 8px; max-width: 60vw;
      font: 12px/1.4 ui-monospace, Menlo, Consolas, monospace;
      background: rgba(0,0,0,0.8); color: #6ef58a; padding: 8px 10px;
      border-radius: 8px; z-index: 2147483647; white-space: pre-wrap;
      pointer-events: none;
    }
    /* Fullscreen coach mark — text on top, bobbing down-arrow below. */
    .hint {
      position: fixed; top: 12px; left: 100px;
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      z-index: 2147483647; pointer-events: none;
      opacity: 0; visibility: hidden;
      transition: opacity 240ms ease, visibility 0s linear 240ms;
    }
    .hint.show {
      opacity: 1; visibility: visible;
      transition: opacity 240ms ease;
      animation: ft-bob 1100ms ease-in-out infinite;
    }
    .hint .label {
      padding: 8px 14px; border-radius: 999px; white-space: nowrap;
      background: rgba(28, 28, 32, 0.94); color: #00bcd4;
      font: 600 14px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      text-shadow: 0 0 7px rgba(0, 188, 212, 0.55);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35), 0 0 16px rgba(0, 188, 212, 0.5);
      backdrop-filter: blur(8px);
    }
    .hint .arrow { color: #00bcd4; filter: drop-shadow(0 0 6px rgba(0, 188, 212, 0.7)); }
    .hint .arrow svg { display: block; width: 26px; height: 26px; }
    @keyframes ft-bob {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(8px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .bar { transition: none; }
      .hint.show { animation: none; }
      .donate::before { animation: none; }
    }
  `;

  // Stroke-based icons (24x24 viewBox), drawn in currentColor so each button's
  // color rule applies. SVG guarantees consistent vertical centering.
  const SVG_NS = "http://www.w3.org/2000/svg";
  const ICON_PATHS = {
    back: "M15 5l-7 7 7 7",
    forward: "M9 5l7 7-7 7",
    reload: "M21 4v6h-6 M20.49 15a9 9 0 1 1-2.12-9.36L21 10",
    collapse: "M5 15l7-7 7 7",
    exit: "M6 6l12 12 M18 6L6 18",
    plus: "M12 5v14 M5 12h14",
    arrowDown: "M12 5v14 M6 13l6 6 6-6",
  };

  function svgIcon(name) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", ICON_PATHS[name]);
    svg.appendChild(p);
    return svg;
  }

  // Filled heart for the Donate pill (the icons above are stroke-only).
  function heartIcon() {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", "M12 21l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 0.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.18L12 21z");
    svg.appendChild(p);
    return svg;
  }

  const SPONSOR_URL = "https://github.com/sponsors/mwventures";

  let ui = null;

  function buildUI() {
    const host = document.createElement("div");
    host.id = "fulltouch-host";
    host.style.cssText = "all: initial;";
    const root = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = STYLE;

    // --- tap-to-dismiss backdrop ---
    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    // A tap closes the bar. Track the start so a tap (not a scroll attempt that
    // began on the bar) is what dismisses; any pointer or swipe-up here closes.
    backdrop.addEventListener("pointerdown", (e) => { e.preventDefault(); hideBar(); });

    // --- nav bar ---
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "FullTouch navigation");

    const mk = (cls, title, glyph, onClick) => {
      const b = document.createElement("button");
      if (cls) b.className = cls;
      b.title = title;
      b.setAttribute("aria-label", title);
      b.appendChild(svgIcon(glyph));
      b.addEventListener("click", onClick);
      return b;
    };

    const backBtn = mk("", "Back", "back", () => history.back());
    const fwdBtn = mk("", "Forward", "forward", () => history.forward());
    const reloadBtn = mk("reload", "Reload", "reload", () => location.reload());
    // New tab opens via the worker (chrome.tabs). The new tab lands on Chrome's
    // new-tab page where this content script can't run, so close our bar here —
    // it reinjects automatically once that tab navigates to a real page.
    const newTabBtn = mk("", "New tab", "plus", () => {
      chrome.runtime.sendMessage({ type: "newTab" }).catch(() => {});
      hideBar();
    });

    const url = document.createElement("input");
    url.className = "url";
    url.type = "text";
    url.placeholder = "Search or type a URL";
    url.setAttribute("aria-label", "Address and search bar");
    url.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") navigate(url.value);
      else if (e.key === "Escape") hideBar();
    });
    url.addEventListener("focus", () => url.select());

    const collapseBtn = mk("", "Hide bar", "collapse", hideBar);
    const exitBtn = mk("exit", "Exit fullscreen", "exit", exitFullscreen);

    // Donate pill — opens GitHub Sponsors in a new tab.
    const donateBtn = document.createElement("a");
    donateBtn.className = "donate";
    donateBtn.href = SPONSOR_URL;
    donateBtn.target = "_blank";
    donateBtn.rel = "noopener noreferrer";
    donateBtn.title = "Support FullTouch";
    donateBtn.setAttribute("aria-label", "Donate to support FullTouch");
    const donateText = document.createElement("span");
    donateText.textContent = "Donate";
    donateBtn.append(heartIcon(), donateText);

    bar.append(backBtn, fwdBtn, reloadBtn, newTabBtn, url, donateBtn, collapseBtn, exitBtn);

    // swipe up on the bar collapses it
    let barStartY = null;
    bar.addEventListener("touchstart", (e) => { barStartY = e.touches[0].clientY; }, { passive: true });
    bar.addEventListener("touchmove", (e) => {
      if (barStartY != null && barStartY - e.touches[0].clientY > 40) { hideBar(); barStartY = null; }
    }, { passive: true });

    // --- pull tab ---
    const grabber = document.createElement("div");
    grabber.className = "grabber";
    grabber.setAttribute("role", "button");
    grabber.setAttribute("aria-label", "Show FullTouch nav bar");
    grabber.innerHTML = '<span class="chev">⌄</span>';

    let grabStart = null;
    grabber.addEventListener("pointerdown", (e) => {
      grabStart = e.clientY;
      try { grabber.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
      hud(`grab down @${Math.round(e.clientY)}`);
    });
    grabber.addEventListener("pointermove", (e) => {
      if (grabStart != null && e.clientY - grabStart > 8) { grabStart = null; showBar(); }
    });
    grabber.addEventListener("pointerup", () => {
      if (grabStart != null) { grabStart = null; showBar(); } // tap also opens
    });

    // --- first-fullscreen hint (text on top, bobbing down-arrow below) ---
    const hint = document.createElement("div");
    hint.className = "hint";
    const hintLabel = document.createElement("div");
    hintLabel.className = "label";
    hintLabel.textContent = "Swipe down to access controls";
    const hintArrow = document.createElement("div");
    hintArrow.className = "arrow";
    hintArrow.appendChild(svgIcon("arrowDown"));
    hint.append(hintLabel, hintArrow);

    // --- debug HUD ---
    const hudEl = document.createElement("div");
    hudEl.className = "hud";
    hudEl.style.display = "none";

    root.append(style, backdrop, bar, grabber, hint, hudEl);
    // Attach to <html>, not <body>. position:fixed is relative to the viewport
    // ONLY when no ancestor has a transform/filter/perspective/will-change/
    // contain — any of those turns the nearest such ancestor into the containing
    // block, so a fixed bar inside it anchors to the document (and scrolls away)
    // instead of the screen. Pages routinely put a transform on <body> or an app
    // wrapper; sitting above <body> on <html> escapes all of them, so the bar,
    // hint, and full-viewport backdrop stay pinned to the screen at any scroll
    // position. (A transform on <html> itself would still break this, but that's
    // vanishingly rare.)
    (document.documentElement || document.body).appendChild(host);

    ui = { host, root, bar, backdrop, url, reloadBtn, grabber, hint, hudEl };
    applySettings();
    return ui;
  }

  function applySettings() {
    if (!ui) {
      if (settings.enabled) buildUI();
      return;
    }
    ui.reloadBtn.style.display = settings.showReload ? "" : "none";
    ui.hudEl.style.display = settings.debug ? "" : "none";
    updateGrabber();
  }

  function updateGrabber() {
    if (!ui) return;
    const want =
      settings.enabled &&
      (settings.grabber === "always" ||
        (settings.grabber === "fullscreen" && isLikelyFullscreen()));
    ui.grabber.classList.toggle("show", !!want && !barIsOpen());
  }

  function hud(msg) {
    if (!ui || !settings.debug) return;
    ui.hudEl.style.display = "";
    ui.hudEl.textContent = `[FullTouch] fs=${isLikelyFullscreen()} ih=${window.innerHeight} sh=${screen.height}\n${msg}`;
  }

  function showBar() {
    if (!settings.enabled) return;
    if (!ui) buildUI();
    ui.url.value = location.href;
    ui.bar.classList.add("open");
    ui.backdrop.classList.add("open");
    hideFullscreenHint();
    updateGrabber();
  }

  function hideBar() {
    if (!ui) return;
    ui.bar.classList.remove("open");
    ui.backdrop.classList.remove("open");
    if (ui.root.activeElement) ui.url.blur();
    updateGrabber();
  }

  function toggleBar() {
    if (barIsOpen()) hideBar();
    else showBar();
  }

  function barIsOpen() {
    return !!(ui && ui.bar.classList.contains("open"));
  }

  // ---- Fullscreen coach mark ------------------------------------------
  // Shown once each time the user enters *browser* (F11) fullscreen — not video
  // element fullscreen (which has its own controls), and not again when cycling
  // tabs within the same fullscreen period. Each tab is a separate content
  // script, so the once-per-window-session dedupe lives in the worker; we just
  // ask before showing (see the resize handler).
  let hintTimer = null;

  function showFullscreenHint() {
    if (!settings.enabled || !ui || barIsOpen()) return;
    ui.hint.classList.add("show");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideFullscreenHint, 3000);
  }

  function hideFullscreenHint() {
    clearTimeout(hintTimer);
    if (ui) ui.hint.classList.remove("show");
  }

  // Re-evaluate the grabber and hint on resize (entering/leaving F11 fires one).
  // Track the rising edge into browser fullscreen. Switching tabs also re-lays
  // out the newly-shown tab at fullscreen size, which looks like a fresh entry
  // here — so the worker decides whether the hint actually shows (once per
  // window session). The document.hidden guard keeps a background tab from
  // claiming the hint before the visible one does.
  let wasBrowserFs = isLikelyFullscreen() && !document.fullscreenElement;
  window.addEventListener("resize", () => {
    updateGrabber();
    const isBrowserFs = isLikelyFullscreen() && !document.fullscreenElement;
    if (isBrowserFs && !wasBrowserFs && !document.hidden) {
      chrome.runtime.sendMessage({ type: "fullscreenHintCheck" })
        .then((resp) => { if (resp && resp.show) showFullscreenHint(); })
        .catch(() => {});
    } else if (!isBrowserFs && wasBrowserFs) {
      hideFullscreenHint();
      chrome.runtime.sendMessage({ type: "fullscreenExited" }).catch(() => {});
    }
    wasBrowserFs = isBrowserFs;
  }, { passive: true });

  // ---- Top-edge swipe (secondary trigger) -----------------------------------
  // Touch events (not pointer events) are used here because only touchmove can
  // preventDefault() to keep the page from scrolling once we claim the gesture.
  let armed = false;
  let startX = 0;
  let startY = 0;

  window.addEventListener("touchstart", (e) => {
    if (!settings.enabled || barIsOpen() || e.touches.length !== 1) { armed = false; return; }
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    armed = startY <= settings.edgeZonePx;
    hud(`touchstart y=${Math.round(startY)} armed=${armed}`);
  }, { passive: true, capture: true });

  window.addEventListener("touchmove", (e) => {
    if (!armed || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dy = t.clientY - startY;
    const dx = Math.abs(t.clientX - startX);
    hud(`touchmove dy=${Math.round(dy)} dx=${Math.round(dx)}`);
    if (dy > settings.thresholdPx && dy > dx) {
      armed = false;
      // Only cancel if the browser hasn't already committed to scrolling —
      // otherwise the event is non-cancelable and Chrome warns.
      if (e.cancelable) e.preventDefault();
      showBar();
    }
  }, { passive: false, capture: true });

  window.addEventListener("touchend", () => { armed = false; }, { passive: true, capture: true });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && barIsOpen()) hideBar();
  }, true);

  // ---- Two-finger horizontal swipe → switch tabs ----------------------------
  // Touchscreen only. Two fingers panning horizontally switch tabs. Chrome maps
  // a two-finger horizontal swipe to its native back/forward, so once we
  // recognize ours we preventDefault to claim it (single-finger swipe-back is
  // left alone). Tab activation needs chrome.tabs, so the worker does it.
  const TAB_SWIPE_THRESHOLD_PX = 50; // horizontal travel of the midpoint to fire
  const PINCH_TOLERANCE_PX = 30; // finger-spread change beyond this = pinch, not swipe

  let twoActive = false; // currently tracking a 2-finger gesture
  let twoFired = false; // already switched tabs during this gesture
  let twoStartCx = 0;
  let twoStartCy = 0;
  let twoStartSpread = 0;

  // Midpoint and finger-spread are symmetric in the two touches, so they don't
  // care which finger lands in touches[0] vs touches[1] across events.
  const midX = (a, b) => (a.clientX + b.clientX) / 2;
  const midY = (a, b) => (a.clientY + b.clientY) / 2;
  const spreadOf = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  window.addEventListener("touchstart", (e) => {
    if (!settings.enabled || !settings.tabSwitch || e.touches.length !== 2) {
      twoActive = false;
      return;
    }
    const a = e.touches[0];
    const b = e.touches[1];
    twoStartCx = midX(a, b);
    twoStartCy = midY(a, b);
    twoStartSpread = spreadOf(a, b);
    twoActive = true;
    twoFired = false;
  }, { passive: true, capture: true });

  window.addEventListener("touchmove", (e) => {
    if (!twoActive || e.touches.length !== 2) return;
    // Once claimed, keep canceling so native swipe-nav can't fire late.
    if (twoFired) { if (e.cancelable) e.preventDefault(); return; }

    const a = e.touches[0];
    const b = e.touches[1];
    if (Math.abs(spreadOf(a, b) - twoStartSpread) > PINCH_TOLERANCE_PX) {
      twoActive = false; // it's a pinch/zoom — hand it back to the browser
      return;
    }
    const dx = midX(a, b) - twoStartCx;
    const dy = midY(a, b) - twoStartCy;
    if (Math.abs(dx) <= TAB_SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;

    twoFired = true;
    if (e.cancelable) e.preventDefault();
    // Swipe right (dx > 0): fingers move left→right → previous (left) tab.
    let dir = dx > 0 ? "prev" : "next";
    if (settings.tabSwitchReverse) dir = dir === "prev" ? "next" : "prev";
    hud(`tab switch ${dir} dx=${Math.round(dx)}`);
    chrome.runtime.sendMessage({ type: "cycleTab", dir }).catch(() => {});
  }, { passive: false, capture: true });

  function resetTwoFinger() {
    twoActive = false;
    twoFired = false;
  }
  window.addEventListener("touchend", resetTwoFinger, { passive: true, capture: true });
  window.addEventListener("touchcancel", resetTwoFinger, { passive: true, capture: true });

  // ---- Messages from the service worker -------------------------------------
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "toggleNavbar") toggleBar();
    else if (msg?.type === "exitFullscreen") exitFullscreen();
  });
})();
