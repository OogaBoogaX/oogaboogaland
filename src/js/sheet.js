// The island's tabs share their original content nodes. Each used window keeps
// its tab and edge when closed; merging it into another window releases its rail.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const KEY = "oogaboogaland.sheet.v1", NAMES = ["bananas", "roster", "players", "loot", "chat"], DOCKS = ["left", "right", "bottom"], TAB_EDGE = 41;
  // A touch drawer's sticks need this much of the screen left over it.
  const STICK_ROOM = 320;
  // A phone's tabs start 16px in and stop short of the 44px chevron tab at the far right.
  const PHONE_TAB_INSET = 80;
  const visible = (panel) => {
    const owner = panel.closest(".sheet");
    return !!owner && !panel.hidden && !owner.hidden && owner.dataset.open === "true" && !!owner.getClientRects().length;
  };
  const tabFor = (panel) => panel.closest(".sheet")?.querySelector(`[data-tab="${panel.dataset.panel}"]`);
  // Unread counts on the players and chat tabs (#430) belong to the page, not to one scene's sheet: players.js and
  // chat.js keep them, and whichever sheet is up paints them beside the locker's count.
  const badges = { players: 0, chat: 0 };
  let paintBadges = null;
  const setBadge = (name, count) => {
    if (badges[name] === count) return;
    badges[name] = count;
    if (paintBadges) paintBadges();
  };
  // Only an explicit tab opening acknowledges that tab. Layout and notification inspection leave counts alone.
  const watchViews = (panel, fn) => panel.addEventListener("sheetview", fn);
  const attending = (panel) => visible(panel) && document.hasFocus() && panel.contains(document.activeElement)
    && !document.activeElement.closest(".sheet-notifications");
  const readRect = (rect) => rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
    && Math.abs(rect.x) <= 100000 && Math.abs(rect.y) <= 100000 && rect.width > 0 && rect.width <= 10000
    && rect.height > 0 && rect.height <= 10000 ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
  // Scene HUDs come and go, but the latest choice belongs to this page even when
  // storage is blocked. Only explicit panel changes update it; game hiding does not.
  let shared = null;
  // A first visit is a readable storage holding no saved layout, judged once a page. The director asks `welcome`
  // a beat after the world shows; any panel choice before then, here or by a shortcut, wins instead.
  let firstVisit = null, live = null;
  const create = ({ lootEnabled, signal }) => {
    const root = document.getElementById("sheet"), parent = root.parentElement;
    const content = root.querySelector(".sheet-content"), nav = root.querySelector(".sheet-panels");
    const panels = [...content.children], templates = [...nav.children].map((tab) => tab.cloneNode(true));
    const windows = [], listeners = [], bottom = window.matchMedia("(width < 1140px)"), coarse = window.matchMedia("(pointer: coarse)");
    const phone = window.matchMedia("(pointer: coarse) and (max-width: 720px), (pointer: coarse) and (max-height: 500px)");
    // A touch drawer's default height, from style.css: it can be dragged back to this, and the sticks always fit over it.
    const drawerShare = parseFloat(getComputedStyle(root).getPropertyValue("--drawer-share")) / 100;
    const drawerHeight = (b) => Math.ceil(b.height * drawerShare);
    // Where a phone's up tab lifts the drawer: the default, or in landscape, where that shows hardly anything, most of the screen.
    const fullHeight = (b) => b.width > b.height ? Math.ceil(b.height * 0.6) : drawerHeight(b);
    // A phone on its side leaves too short a drawer to stack the Bananas panel's title, a row of its slab and its 44px
    // Feed the Oogas, so while that panel shows there its drawer stands at least BANANA_DRAWER tall (style.css gives
    // the untouched drawer the same), its saved size untouched for the other tabs.
    const BANANA_DRAWER = 200, shortLandscape = window.matchMedia("(pointer: coarse) and (orientation: landscape) and (max-height: 500px)");
    const bananaTall = (w) => w.node === root && w.tab === "bananas" && shortLandscape.matches;
    let serial = 0, gesture = null, mergeTarget = null, suppressClick = false, hidden = false, folded = false, disposed = false, lootCount = 0, saveTimer = 0;
    if (!shared) {
      try {
        const raw = localStorage.getItem(KEY);
        if (firstVisit === null) firstVisit = raw === null;
        shared = JSON.parse(raw);
      } catch {
        // Storage may be unavailable, which is no first visit: a choice to close could not be remembered.
        if (firstVisit === null) firstVisit = false;
      }
    }
    const saved = shared;
    folded = saved?.folded === true;
    // Online Oogas and Ooga Chat are for signed-in visitors only.
    const available = (name) => NAMES.includes(name) && (name !== "loot" || lootEnabled)
      && (name !== "players" && name !== "chat" || !!BL.net.state.me);
    const belled = () => !!BL.net.state.me;
    const isOpen = (w) => !folded && w.open && available(w.tab);
    // On a phone every tab folds into the main drawer; separate panels stay saved, hidden, for a larger screen.
    const ownerOf = (name) => windows.find((w) => (w.node === root || !phone.matches) && w.tab === name && (w.open || w.rect || w.kept));
    const notify = () => document.dispatchEvent(new Event("sheetchange"));
    const on = (target, type, fn, options) => {
      target.addEventListener(type, fn, { ...options, signal });
      listeners.push(() => target.removeEventListener(type, fn, options));
    };
    let playing = null;
    const save = () => {
      window.clearTimeout(saveTimer); saveTimer = 0;
      if (disposed || playing) return;
      shared = { open: main.open, tab: main.tab, folded, drawer: 2,
        height: savedHeight, rect: main.rect, dock: main.dock, windows: windows.filter((w) => w !== main).map((w) => ({ open: w.open, tab: w.tab, rect: w.rect, dock: w.dock })) };
      try { localStorage.setItem(KEY, JSON.stringify(shared)); } catch { /* Storage may be unavailable. */ }
    };
    const scheduleSave = () => {
      if (!disposed && !saveTimer) saveTimer = window.setTimeout(save, 100);
    };
    const viewport = () => {
      const v = window.visualViewport;
      return { x: v?.offsetLeft || 0, y: v?.offsetTop || 0, width: v?.width || window.innerWidth, height: v?.height || window.innerHeight };
    };
    const nearestDock = (r) => {
      const b = viewport(), left = Math.abs(r.x - b.x), right = Math.abs(b.x + b.width - r.x - r.width);
      const bottom = Math.abs(b.y + b.height - r.y - r.height);
      return bottom < left && bottom < right ? "bottom" : left < right ? "left" : "right";
    };
    const fit = (w) => {
      w.node.dataset.open = String(isOpen(w));
      // Only the untouched launcher and a folded panel use the default edge.
      // Keep the open rectangle; CSS slides the whole panel and rail to its edge.
      if (!w.rect || w.node === root && folded) {
        for (const name of ["left", "top", "width", "height"]) w.node.style.removeProperty(name);
        w.node.dataset.sized = "false";
        w.node.dataset.dock = bottom.matches ? "bottom" : "right";
        // The sticks need room over the drawer, which the Bananas panel's taller one leaves them too little of.
        if (w.node === root) { root.dataset.sticks = String(!(bottom.matches && bananaTall(w))); parent.style.removeProperty("--drawer-height"); }
        if (phone.matches) w.node.style.setProperty("--sheet-tab-step", `${Math.min(72, (viewport().width - PHONE_TAB_INSET) / Math.max(1, w.tabCount || NAMES.length))}px`);
        else w.node.style.removeProperty("--sheet-tab-step");
        return;
      }
      const b = viewport(), preferred = w.rect, r = w.bounds || (w.bounds = { ...preferred });
      if (!w.dock) w.dock = nearestDock(preferred);
      // A phone's panels stay a full-width drawer at the foot of the screen: only their height moves. The dock stays saved.
      const dock = phone.matches ? "bottom" : w.dock, atBottom = dock === "bottom", width = Math.max(1, b.width - (atBottom ? 0 : TAB_EDGE)), height = Math.max(1, b.height - (atBottom ? TAB_EDGE : 0));
      // Fitting a keyboard-reduced viewport must not overwrite the saved size.
      // Minimum sizes belong to explicit resizing, not closing a short default drawer.
      r.width = phone.matches ? width : Math.min(width, Math.max(1, preferred.width));
      r.height = Math.min(height, Math.max(1, preferred.height, atBottom && bananaTall(w) ? BANANA_DRAWER : 0));
      r.x = dock === "left" || phone.matches ? b.x : dock === "right" ? b.x + b.width - r.width : Math.max(b.x, Math.min(b.x + b.width - r.width, preferred.x));
      r.y = atBottom ? b.y + b.height - r.height : Math.max(b.y, Math.min(b.y + b.height - r.height, preferred.y));
      w.node.dataset.sized = "true"; w.node.dataset.dock = dock;
      w.node.style.left = `${r.x}px`; w.node.style.top = `${r.y}px`;
      w.node.style.width = `${r.width}px`; w.node.style.height = `${r.height}px`;
      w.node.style.setProperty("--sheet-tab-step", `${Math.min(atBottom ? 72 : 64, (atBottom ? r.width - (phone.matches ? PHONE_TAB_INSET : 0) : r.height - 7) / Math.max(1, w.tabCount || NAMES.length))}px`);
      if (w.node === root) {
        const lift = atBottom && r.height <= Math.max(b.height - STICK_ROOM, drawerHeight(b));
        root.dataset.sticks = String(lift);
        if (lift) parent.style.setProperty("--drawer-height", `${r.height}px`);
        else parent.style.removeProperty("--drawer-height");
      }
    };
    const front = (w) => {
      const i = windows.indexOf(w);
      windows.splice(i, 1); windows.push(w);
      for (let j = 0; j < windows.length; j++) windows[j].node.style.zIndex = String((playing ? 90 : 13) + j);
    };
    const observe = new MutationObserver(notify);
    const makeWindow = (node, tab, rect, dock) => {
      const chrome = document.getElementById("sheet-chrome").content.cloneNode(true);
      if (node === root) chrome.querySelector('[data-corner="se"]').id = "sheet-resize";
      node.append(...chrome.children);
      const w = { node, tab, rect, dock: DOCKS.includes(dock) ? dock : null, open: node.dataset.open === "true", nav: node.querySelector(".sheet-panels"), body: node.querySelector(".sheet-body"), content: node.querySelector(".sheet-content") };
      w.tabs = [...w.nav.children];
      windows.push(w);
      observe.observe(node, { attributes: true, attributeFilter: ["data-open", "hidden"] });
      fit(w);
      return w;
    };
    let savedHeight = Number.isFinite(saved?.height) && saved.height > 0 && saved.height <= 10000 ? saved.height : null;
    if (savedHeight) root.style.setProperty("--sheet-height", `${savedHeight}px`);
    else root.style.removeProperty("--sheet-height");
    root.dataset.paired = "false";
    root.dataset.open = String(saved?.open === true);
    // A phone's closed drawer used to save its size as if the visitor had chosen it; those saves count for nothing.
    const staleDrawer = coarse.matches && saved?.dock === "bottom" && saved?.drawer !== 2;
    const main = makeWindow(root, NAMES.includes(saved?.tab) ? saved.tab : "roster", staleDrawer ? null : readRect(saved?.rect), staleDrawer ? null : saved?.dock);
    const addWindow = (tab, rect, dock, open = true) => {
      const node = document.createElement("aside"), body = document.createElement("div"), holder = document.createElement("div");
      const tabs = document.createElement("nav");
      node.className = "sheet"; node.dataset.open = String(open);
      node.id = `sheet-window-${++serial}`;
      tabs.className = "sheet-panels"; tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Island panels");
      for (const template of templates) {
        const button = template.cloneNode(true);
        button.id = `${node.id}-${button.dataset.tab}`;
        for (const child of button.querySelectorAll("[id]")) child.removeAttribute("id");
        tabs.append(button);
      }
      body.className = "sheet-body"; holder.className = "sheet-content";
      body.append(holder); node.append(tabs, body); root.after(node);
      return makeWindow(node, tab, rect, dock);
    };
    if (Array.isArray(saved?.windows)) for (const entry of saved.windows.slice(0, NAMES.length)) {
      const rect = readRect(entry?.rect);
      // Availability can arrive after /api/me, or change between scenes.
      // Keep those saved panels so a temporary absence never deletes a layout.
      if (rect && NAMES.includes(entry.tab) && !ownerOf(entry.tab)) addWindow(entry.tab, rect, entry.dock, entry.open !== false);
    }
    const notificationTemplate = document.getElementById("sheet-notifications");
    const badgeText = (count) => count > 99 ? "99+" : String(count);
    const showBadge = (badge, count) => {
      const text = badgeText(count);
      if (badge.hidden !== !count) badge.hidden = !count;
      if (badge.textContent !== text) badge.textContent = text;
    };
    const notificationViews = panels.map((panel) => {
      const view = notificationTemplate.content.firstElementChild.cloneNode(true);
      const button = view.querySelector("button"), detail = view.querySelector(".sheet-unread"), badge = view.querySelector(".tab-count");
      detail.id = panel.id + "-unread";
      button.setAttribute("aria-describedby", detail.id);
      panel.querySelector(".panel-title").append(view);
      let hovered = false, focused = false, pinned = false;
      const paint = () => {
        const shown = hovered || focused || pinned;
        if (detail.hidden === shown) {
          button.setAttribute("aria-expanded", String(shown));
          detail.hidden = !shown;
        }
        showBadge(badge, shown ? 0 : badges.players + badges.chat);
      };
      const reset = () => { hovered = focused = pinned = false; paint(); };
      on(button, "pointerenter", (e) => { if (e.pointerType !== "touch") { hovered = true; paint(); } });
      on(button, "pointerleave", () => { hovered = false; paint(); });
      on(button, "focus", () => { focused = button.matches(":focus-visible"); paint(); });
      on(button, "blur", reset);
      on(button, "click", () => {
        if (hovered || focused) return;
        pinned = !pinned;
        paint();
      });
      on(button, "keydown", (e) => {
        if (e.key !== "Escape" || detail.hidden) return;
        e.preventDefault(); e.stopPropagation();
        reset();
      });
      return { panel, view, detail, paint, reset };
    });
    on(document, "pointerdown", (e) => {
      for (const item of notificationViews) if (!item.view.contains(e.target)) item.reset();
    }, { capture: true });
    const showCounts = () => {
      const detail = `Online Oogas: ${badgeText(badges.players)} new\nOoga Chat: ${badgeText(badges.chat)} new`;
      for (const item of notificationViews) {
        if (item.detail.textContent !== detail) item.detail.textContent = detail;
        item.paint();
      }
      for (const w of windows) for (const badge of w.nav.querySelectorAll(".tab-count")) {
        const tab = badge.closest("[data-tab]"), name = tab.dataset.tab;
        const count = name === "loot" ? lootCount : isOpen(w) ? 0 : badges[name] || 0;
        showBadge(badge, count);
        const label = tab.dataset.label || (tab.dataset.label = tab.getAttribute("aria-label"));
        if (name !== "loot") tab.setAttribute("aria-label", count ? `${label}, ${badgeText(count)} new` : label);
      }
    };
    const expand = root.querySelector(".sheet-expand");
    const showExpand = () => {
      const open = isOpen(main), up = !open || main.node.getBoundingClientRect().height < fullHeight(viewport()) - 1;
      const label = !open ? "Open panel" : up ? "Raise panel" : "Close panel";
      expand.dataset.dir = up ? "up" : "down"; expand.title = label; expand.setAttribute("aria-label", label);
    };
    paintBadges = showCounts;
    const refresh = () => {
      for (const panel of panels) {
        // Retain the selected content during the closing slide. The closed body
        // becomes inert immediately and CSS hides it when the slide finishes.
        const owner = available(panel.dataset.panel) && ownerOf(panel.dataset.panel), target = owner || main;
        if (panel.parentElement !== target.content) target.content.append(panel);
        panel.hidden = !owner;
        if (owner) panel.setAttribute("aria-labelledby", owner.tabs.find((t) => t.dataset.tab === owner.tab).id);
      }
      for (const w of windows) {
        const open = isOpen(w);
        let index = 0;
        for (const tab of w.tabs) {
          const name = tab.dataset.tab, selected = open && name === w.tab;
          const owner = ownerOf(name);
          // The main rail launches unowned tabs; detached rails keep only their own.
          // A temporary fold gathers every available tab back onto the main rail.
          tab.hidden = !available(name) || !folded && (owner ? owner !== w : w !== main);
          tab.setAttribute("aria-selected", String(selected)); tab.tabIndex = selected || !open && !tab.hidden && !index ? 0 : -1;
          tab.setAttribute("aria-controls", `${name}-panel`);
          tab.title = phone.matches ? selected ? "Tap to close" : "Tap to open" : selected ? w === main ? "Click to close · drag to move" : "Click to close · drag to move or drop onto another panel to merge"
            : owner === w ? "Click to reopen · drag to move or merge" : "Click to select · drag to open a separate panel";
          if (!tab.hidden) tab.style.setProperty("--sheet-tab-index", String(index++));
        }
        w.tabCount = index;
        fit(w);
        w.nav.setAttribute("aria-orientation", w.node.dataset.dock === "bottom" ? "horizontal" : "vertical");
        w.node.hidden = hidden || (folded || phone.matches) && w !== main || !index || w !== main && !available(w.tab);
        w.body.inert = !open || w.node.hidden;
        w.body.setAttribute("aria-hidden", String(w.body.inert));
      }
      // The bell counts Online Oogas and Ooga Chat, so it shows on every panel for signed-in contributors alone.
      const bell = belled();
      for (const item of notificationViews) {
        if (item.view.hidden === bell) item.view.hidden = !bell;
        if (!bell || !visible(item.panel)) item.reset();
      }
      showCounts(); showExpand();
      notify();
    };
    const close = (w) => {
      firstVisit = false;
      if (w.node.contains(document.activeElement)) document.activeElement.blur();
      // A phone's untouched drawer stays untouched, so the sticks keep riding above it.
      if (!coarse.matches || w.node.dataset.dock !== "bottom") measure(w);
      else w.kept = true;
      w.open = false;
      refresh(); save();
    };
    const remove = (w) => {
      if (w.node.contains(document.activeElement)) document.activeElement.blur();
      for (const panel of [...w.content.children]) content.append(panel);
      windows.splice(windows.indexOf(w), 1); w.node.remove();
      // Reconnect the bounded set, so merged windows are not kept by the observer.
      observe.disconnect();
      for (const current of windows) observe.observe(current.node, { attributes: true, attributeFilter: ["data-open", "hidden"] });
    };
    const select = (w, name, viewed = false) => {
      if (!available(name)) return;
      firstVisit = false;
      w = ownerOf(name) || w; folded = false;
      w.tab = name; w.open = true; w.node.dataset.open = "true";
      refresh(); front(w); save();
      if (viewed) panels.find((panel) => panel.dataset.panel === name)?.dispatchEvent(new Event("sheetview"));
    };
    const measure = (w) => {
      if (w.rect) return;
      const r = w.node.getBoundingClientRect();
      const transform = getComputedStyle(w.node).transform;
      const offset = transform === "none" ? null : new DOMMatrixReadOnly(transform);
      w.rect = { x: r.left - (offset?.m41 || 0), y: r.top - (offset?.m42 || 0), width: r.width, height: r.height };
      w.dock = w.node.dataset.dock;
      fit(w);
    };
    const showMergeTarget = (target) => {
      if (target === mergeTarget) return;
      if (mergeTarget) mergeTarget.node.classList.remove("sheet-merge-target");
      mergeTarget = target;
      if (mergeTarget) mergeTarget.node.classList.add("sheet-merge-target");
    };
    const targetAt = (g, x, y) => {
      if (!g.moved || !g.tab || g.w === main) return null;
      // Pointer capture and the moving panel sit above the receiver. Read the
      // hit stack beneath them, including a folded drawer's protruding tabs.
      for (const hit of document.elementsFromPoint(x, y)) {
        const node = hit.closest(".sheet");
        if (node === g.w.node) continue;
        const target = windows.find((w) => w.node === node);
        return target && !target.node.hidden ? target : null;
      }
      return null;
    };
    const finish = (target = null) => {
      if (!gesture) return;
      const g = gesture; gesture = null;
      suppressClick = g.moved || !!g.slid;
      if (g.handle.hasPointerCapture(g.id)) g.handle.releasePointerCapture(g.id);
      showMergeTarget(null);
      g.w.node.classList.remove("sheet-tab-drag", "sheet-moving");
      if (target) {
        remove(g.w);
        select(target, g.tab);
        target.tabs.find((tab) => tab.dataset.tab === g.tab).focus({ preventScroll: true });
      } else {
        if (g.moved && g.handle.hidden) g.w.tabs.find((tab) => tab.dataset.tab === g.w.tab).focus({ preventScroll: true });
        if (g.moved) { refresh(); save(); }
      }
    };
    const findWindow = (target) => windows.find((w) => w.node === target.closest?.(".sheet"));
    on(parent, "pointerdown", (e) => {
      const w = findWindow(e.target);
      if (!w || hidden || e.button !== 0 || !e.isPrimary || gesture) return;
      front(w); suppressClick = false; firstVisit = false;
      const handle = e.target.closest("[data-tab], .sheet-drag, .sheet-corner, .sheet-edge, .sheet-panels");
      if (!handle) return;
      e.preventDefault(); e.stopPropagation();
      handle.focus({ preventScroll: true });
      const r = w.node.getBoundingClientRect();
      gesture = { id: e.pointerId, handle, w, tab: handle.dataset.tab, corner: handle.dataset.corner || handle.dataset.edge,
        x: e.clientX, y: e.clientY, rect: { x: r.left, y: r.top, width: r.width, height: r.height }, moved: false };
      // The locked virtual cursor captures its synthetic pointers itself.
      if (e.isTrusted) handle.setPointerCapture(e.pointerId);
    });
    const resize = (w, r, corner, dx, dy) => {
      const dock = w.node.dataset.dock, b = viewport(), minLeft = b.x + (dock === "right" ? TAB_EDGE : 0), maxRight = b.x + b.width - (dock === "left" ? TAB_EDGE : 0);
      const minTop = b.y + (dock === "bottom" ? TAB_EDGE : 0), minWidth = Math.min(300, Math.max(1, maxRight - minLeft)), minHeight = Math.min(coarse.matches && dock === "bottom" ? drawerHeight(b) : 263, Math.max(1, b.y + b.height - minTop));
      let left = r.x, top = r.y, right = r.x + r.width, foot = r.y + r.height;
      if (corner.includes("w")) left = Math.max(minLeft, Math.min(right - minWidth, left + dx));
      else if (corner.includes("e")) right = Math.min(maxRight, Math.max(left + minWidth, right + dx));
      if (corner.includes("n")) top = Math.max(minTop, Math.min(foot - minHeight, top + dy));
      else if (corner.includes("s")) foot = Math.min(b.y + b.height, Math.max(top + minHeight, foot + dy));
      Object.assign(w.rect, { x: left, y: top, width: right - left, height: foot - top });
      fit(w);
      if (w === main) showExpand();
    };
    const raise = () => {
      measure(main);
      const b = viewport(), height = fullHeight(b);
      main.rect.height = height; main.rect.y = b.y + b.height - height;
      refresh(); save();
    };
    on(window, "pointermove", (e) => {
      const g = gesture;
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.moved && dx * dx + dy * dy < 36) return;
      // A phone's tabs do not drag: a finger that slides off one has changed its mind.
      if (g.tab && phone.matches) { g.slid = true; return; }
      e.preventDefault(); e.stopPropagation();
      if (!g.moved) {
        g.moved = true;
        if (folded) {
          g.w = ownerOf(g.tab) || g.w;
          folded = false; refresh();
        }
        if (g.tab && ownerOf(g.tab) !== g.w) {
          const b = viewport();
          g.rect = { x: g.x + 19, y: g.y - 35, width: Math.min(380, b.width - TAB_EDGE), height: Math.min(g.rect.height, b.height) };
          g.w = addWindow(g.tab, { ...g.rect });
          front(g.w); refresh();
        } else {
          g.w.node.classList.add("sheet-moving");
          g.w.open = true; g.w.node.dataset.open = "true";
          measure(g.w); refresh(); g.rect = { ...g.w.bounds };
        }
        if (g.tab && g.w !== main) g.w.node.classList.add("sheet-tab-drag");
      }
      if (g.corner) resize(g.w, g.rect, g.corner, dx, dy);
      else {
        g.w.rect.x = g.rect.x + dx; g.w.rect.y = g.rect.y + dy;
        g.w.bounds.x = g.w.rect.x; g.w.bounds.y = g.w.rect.y;
        if (!phone.matches) g.w.dock = nearestDock(g.w.bounds);
        fit(g.w);
      }
      showMergeTarget(targetAt(g, e.clientX, e.clientY));
    });
    const end = (e) => {
      if (!gesture || e.pointerId !== gesture.id) return;
      e.preventDefault(); e.stopPropagation();
      finish(e.type === "pointerup" ? targetAt(gesture, e.clientX, e.clientY) : null);
      if (e.type !== "pointerup") suppressClick = false;
    };
    on(window, "pointerup", end); on(window, "pointercancel", end); on(window, "lostpointercapture", end);
    on(window, "blur", () => { finish(); suppressClick = false; });
    on(parent, "click", (e) => {
      const w = findWindow(e.target);
      if (!w) return;
      if (suppressClick && e.detail !== 0) { suppressClick = false; e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (e.target.closest(".sheet-expand")) {
        expand.blur();
        if (!isOpen(main)) select(main, available(main.tab) ? main.tab : "roster", true);
        else if (expand.dataset.dir === "up") raise();
        else close(main);
        return;
      }
      const tab = e.target.closest("[data-tab]");
      if (tab) {
        if (tab.dataset.tab === w.tab && w.node.dataset.open === "true") close(w);
        else select(w, tab.dataset.tab, true);
      }
    });
    on(parent, "keydown", (e) => {
      const w = findWindow(e.target);
      if (!w) return;
      const tab = e.target.closest("[data-tab]"), handle = e.target.closest(".sheet-drag, .sheet-corner, .sheet-edge");
      const arrows = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
      if (tab && (arrows.includes(e.key) || e.key === "Home" || e.key === "End")) {
        e.preventDefault(); e.stopPropagation();
        const tabs = w.tabs.filter((t) => !t.hidden), i = tabs.indexOf(tab);
        const next = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + tabs.length) % tabs.length;
        select(w, tabs[next].dataset.tab, true); tabs[next].focus({ preventScroll: true });
      } else if (handle && arrows.includes(e.key)) {
        e.preventDefault(); e.stopPropagation(); measure(w); firstVisit = false;
        const step = e.shiftKey ? 32 : 10, dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        if (handle.dataset.corner || handle.dataset.edge) resize(w, w.bounds, handle.dataset.corner || handle.dataset.edge, dx, dy);
        else { w.bounds.x += dx; w.bounds.y += dy; w.rect.x = w.bounds.x; w.rect.y = w.bounds.y; if (!phone.matches) w.dock = nearestDock(w.bounds); fit(w); }
        refresh(); save();
      }
    });
    on(parent, "dblclick", (e) => {
      const w = findWindow(e.target);
      if (!w || !e.target.closest(".sheet-drag")) return;
      finish(); firstVisit = false;
      if (w === main) {
        w.rect = null; w.dock = null; savedHeight = null;
        root.style.removeProperty("--sheet-height");
      } else { w.rect.width = 380; w.rect.height = 520; }
      fit(w); refresh(); save();
    });
    const layout = () => { finish(); refresh(); scheduleSave(); };
    on(window, "resize", layout); on(bottom, "change", layout); on(phone, "change", layout);
    if (window.visualViewport) { on(window.visualViewport, "resize", layout); on(window.visualViewport, "scroll", layout); }
    on(window, "pagehide", () => { finish(); save(); });
    let signedIn = !!BL.net.state.me;
    const unsubscribe = BL.net.subscribe(() => {
      if (signedIn === !!BL.net.state.me) return;
      signedIn = !!BL.net.state.me;
      finish();
      refresh(); save();
    });
    refresh();
    for (let i = 0; i < windows.length; i++) windows[i].node.style.zIndex = String(13 + i);
    // Games start folded without overwriting the visitor's ordinary panel choices.
    const setPlaying = (on) => {
      if (!!playing === !!on) return;
      finish();
      if (on) {
        playing = { folded, windows: windows.map(w => ({ node: w.node, open: w.open, tab: w.tab })) };
        for (const w of windows) w.open = false;
        folded = true;
        if (document.activeElement?.closest(".sheet")) document.activeElement.blur();
      } else {
        folded = playing.folded;
        for (const w of windows) {
          const saved = playing.windows.find(p => p.node === w.node);
          w.open = saved?.open || false;
          if (saved) w.tab = saved.tab;
        }
        playing = null;
      }
      for (let i = 0; i < windows.length; i++) windows[i].node.style.zIndex = String((playing ? 90 : 13) + i);
      refresh();
    };
    const api = {
      // The first visit's Bananas, only while panels are neither hidden nor folded for a game.
      welcome() {
        if (!firstVisit || disposed || hidden || playing || folded) return false;
        select(main, "bananas");
        return true;
      },
      setPlaying,
      setLootCount(count) { lootCount = count; showCounts(); },
      selectTab(name) { select(ownerOf(name) || main, name); },
      fold() { finish(); firstVisit = false; folded = true; if (document.activeElement?.closest(".sheet")) document.activeElement.blur(); refresh(); save(); },
      escape() {
        const w = [...windows].reverse().find((w) => !w.node.hidden && w.node.dataset.open === "true" && w.node.getClientRects().length);
        if (!w) return false;
        finish(); close(w); return true;
      },
      setHidden(on) { if (hidden === !!on) return; finish(); hidden = !!on; if (hidden && document.activeElement?.closest(".sheet")) document.activeElement.blur(); refresh(); },
      dispose() {
        setPlaying(false); finish(); save(); disposed = true; observe.disconnect(); unsubscribe();
        if (paintBadges === showCounts) paintBadges = null;
        for (const off of listeners) off();
        listeners.length = 0;
        for (const { view } of notificationViews) view.remove();
        for (const panel of panels) { content.append(panel); panel.hidden = !available(panel.dataset.panel) || panel.dataset.panel !== main.tab; }
        main.body.inert = false; main.body.removeAttribute("aria-hidden");
        for (const w of windows) if (w !== main) w.node.remove();
        root.querySelector(".sheet-drag").remove();
        for (const handle of root.querySelectorAll(".sheet-corner, .sheet-edge")) handle.remove();
        root.hidden = false;
        if (live === api) live = null;
        notify();
      }
    };
    live = api;
    return api;
  };
  // Asked once by the director: a missed moment (no sheet up, a game, a choice already made) is not tried again.
  const welcome = () => {
    const opened = !!live && live.welcome();
    firstVisit = false;
    return opened;
  };
  BL.sheet = { create, visible, tabFor, setBadge, watchViews, attending, welcome };
})();
