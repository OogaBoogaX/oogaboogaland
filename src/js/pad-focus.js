(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // A controller in menus: while a layer is open (a modal dialog, a game's title, results or pause card, a garage or
  // builder, a DSB menu)
  // the pad's Menus context drives focus here instead of play. The d-pad or stick moves focus to the nearest control
  // in that direction inside the topmost layer, A presses it, B is the layer's own Escape, the bumpers page its tabs or
  // board, and View opens the controller screen. A range slider takes left and right as its own steps. Focus shows
  // with `.pad-focus`. The gamepad calls `verb` on a press and `open` as it polls, which only looks again after a change.
  // The ghost hunt's round cards take no input (hunters walk and shoot behind them), so they never take the pad.
  const LAYERS = ["dialog:modal", ".dsb-menu-engaged", "[data-intro]:not([hidden])", "#mine-intro:not([hidden])",
    "#ghost-lobby:not([hidden])", ".race-results:not([hidden]):not(.ghost-intro)", ".race-pause:not([hidden])", "#prize-panel:not([hidden])",
    "#garage:not([hidden])", "#drop-board:not([hidden])", "#orbit-build:not([hidden])", "#mine-card:not([hidden])", "#hangar-sound:not([hidden])"].join(",");
  const FOCUSABLE = "button, [href], input, select, textarea, summary, [tabindex]:not([tabindex='-1'])";
  // A layer's main button, in this order: where focus starts and what A presses before anything has focus.
  const PRIMARY = ["[autofocus]", ".game-intro-go", "[data-action='intro-go']", ".primary", ".race-go", ".panel-primary", ".actions button"];
  const shown = (el) => !el.hidden && !el.closest("[hidden], [inert]") && el.getClientRects().length > 0;
  // The topmost open layer: the last modal dialog in the top layer wins, else the last visible card with something to
  // press (a card that only shows, such as the hunt's results, leaves the pad to play).
  const layer = () => {
    let top = null;
    for (const el of document.querySelectorAll(LAYERS)) {
      if (el.matches("dialog:modal") || shown(el) && controls(el).length) top = el;
    }
    return top;
  };
  // Asked every frame while a pad is connected, so the answer is kept until the page shows or hides something.
  let dirty = true, cached = false;
  new MutationObserver(() => { dirty = true; }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "open", "inert", "aria-modal"] });
  // The right stick scrolls the open layer, or the first part of it that scrolls, found once per change.
  const scrollerOf = (root) => {
    if (root.scrollHeight > root.clientHeight + 1) return root;
    for (const c of root.querySelectorAll("*")) if (c.scrollHeight > c.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(c).overflowY)) return c;
    return root;
  };
  let scroller = null;
  const open = () => {
    if (dirty) { dirty = false; const top = layer(); scroller = top && scrollerOf(top); cached = !!top; }
    return cached;
  };
  const scroll = (dy) => { if (scroller) scroller.scrollTop += dy; };
  const controls = (root) => [...root.querySelectorAll(FOCUSABLE)].filter(el => !el.disabled && shown(el));
  let marked = null;
  const mark = (el) => {
    if (marked) marked.classList.remove("pad-focus");
    marked = el;
    if (!el) return;
    el.classList.add("pad-focus");
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  const inside = (root) => {
    const el = document.activeElement;
    return el && el !== document.body && root.contains(el) && el !== root ? el : null;
  };
  const start = (root) => {
    const list = controls(root);
    let first = null;
    for (const sel of PRIMARY) if (!first) first = list.find(el => el.matches(sel)) || null;
    first = first || list[0] || null;
    mark(first);
    return first;
  };
  // The nearest control whose centre lies in the direction pressed, weighing sideways distance double.
  const move = (root, dx, dy) => {
    const from = inside(root);
    if (!from) return start(root);
    if (from.type === "range" && dx) { step(from, dx); return from; }
    const a = from.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, score = Infinity;
    for (const el of controls(root)) {
      if (el === from) continue;
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2 - ax, y = r.top + r.height / 2 - ay;
      const along = x * dx + y * dy, across = Math.abs(x * dy - y * dx);
      if (along <= 1) continue;
      const s = along + 2 * across;
      if (s < score) { score = s; best = el; }
    }
    if (best) mark(best);
    return best;
  };
  const step = (input, dir) => {
    const s = Number(input.step) || 1, min = Number(input.min), max = Number(input.max);
    input.value = String(Math.min(max, Math.max(min, Number(input.value) + dir * s * Math.max(1, Math.round((max - min) / s / 20)))));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const key = (target, k) => {
    const e = new KeyboardEvent("keydown", { key: k, code: k, bubbles: true, cancelable: true });
    Object.defineProperty(e, "pad", { value: true });
    target.dispatchEvent(e);
    return e;
  };
  const select = (root) => {
    const el = inside(root) || start(root);
    if (!el) { key(root, "Enter"); return; }
    if (el.type === "range") return;
    el.click();
  };
  // B: the layer's own Escape, sent where its handler listens. A dialog that ignores keys closes as the browser's
  // own Escape would close it.
  const back = (root) => {
    const e = key(inside(root) || root, "Escape");
    if (!e.defaultPrevented && root.matches("dialog:modal") && root.open) {
      if (root.requestClose) root.requestClose();
      else if (root.dispatchEvent(new Event("cancel", { cancelable: true }))) root.close();
    }
  };
  // The bumpers: a tab list's neighbour, a board's chevrons, else the arrows the layer pages with.
  const page = (root, dir) => {
    const tabs = [...root.querySelectorAll("[role='tab']")].filter(shown);
    if (tabs.length) {
      const at = Math.max(0, tabs.findIndex(t => t.getAttribute("aria-selected") === "true"));
      const next = tabs[(at + dir + tabs.length) % tabs.length];
      next.click();
      mark(next);
      return;
    }
    const chevron = root.querySelector(dir > 0 ? "[data-action='board-next']" : "[data-action='board-prev']");
    if (chevron && shown(chevron) && !chevron.disabled) { chevron.click(); return; }
    key(inside(root) || root, dir > 0 ? "ArrowRight" : "ArrowLeft");
  };
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const verb = (name) => {
    const root = layer();
    if (!root) return;
    if (name in DIRS) move(root, DIRS[name][0], DIRS[name][1]);
    else if (name === "select") select(root);
    else if (name === "back" || name === "close") back(root);
    else if (name === "prev" || name === "next") page(root, name === "next" ? 1 : -1);
    else if (name === "help" && BL.padSettings) BL.padSettings.open();
  };
  // A pointer or keyboard user takes focus back, so the pad's ring goes.
  window.addEventListener("pointerdown", () => mark(null), true);
  // Focus moved by anything else (a dialog opening, a list re-rendering) takes the ring with it.
  document.addEventListener("focusin", (e) => { if (marked && e.target !== marked) mark(null); }, true);
  window.addEventListener("keydown", (e) => { if (!e.pad && marked) marked.classList.remove("pad-focus"); }, true);
  BL.padFocus = { layer, open, verb, scroll };
  BL.gamepad.setMenu(open);
})();
