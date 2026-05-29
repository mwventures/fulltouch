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
    .url:focus { border-color: #6366f1; background: rgba(255, 255, 255, 0.14); }
    .url::placeholder { color: rgba(255, 255, 255, 0.5); }

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
    @media (prefers-reduced-motion: reduce) { .bar { transition: none; } }
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
    bar.append(backBtn, fwdBtn, reloadBtn, url, collapseBtn, exitBtn);

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

    // --- debug HUD ---
    const hudEl = document.createElement("div");
    hudEl.className = "hud";
    hudEl.style.display = "none";

    root.append(style, backdrop, bar, grabber, hudEl);
    (document.body || document.documentElement).appendChild(host);

    ui = { host, root, bar, backdrop, url, reloadBtn, grabber, hudEl };
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

  // Re-evaluate the grabber when the window resizes (entering/leaving F11).
  window.addEventListener("resize", updateGrabber, { passive: true });

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
