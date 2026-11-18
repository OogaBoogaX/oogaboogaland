// The World Map page (/map). It draws the tree scripts/world-map.mjs builds from the game's own data (`BL.worldMap`,
// written into this file's bundle by scripts/site.mjs) as cards joined by connectors, each connector naming the way
// through: a bridge, a door, a window, a keypad. Branches fold and unfold, and a place with an address opens the game
// there.
//
// The live layer comes from /api/world (worker/src/world.js), asked every `refreshMs` while the page shows:
// - for everyone: how many stand at each place;
// - for a signed-in viewer: who they are;
// - for an Inspector account: the room's sockets and every Durable Object's.
// Without the Worker (a static host, `npm run serve`) the map stands alone.
//
// Layout: a wide screen gets the tree left to right, dragged to pan and wheeled or pinched to zoom; a narrow one gets
// an outline top to bottom that the page scrolls. The page's policy refuses inline style, so every position goes
// through the CSSOM, and every text through textContent.
(() => {
  "use strict";
  const BL = window.BL;
  const { tree, prefixes } = BL.worldMap;
  const $ = (id) => document.getElementById(id);
  const view = $("map-view"), list = $("map-list"), tools = $("map-tools"), status = $("map-status"), tip = $("map-tip");
  const objectsBox = $("map-objects"), objectsList = $("map-objects-list"), objectsTitle = $("map-objects-title");
  const SVG = "http://www.w3.org/2000/svg";
  // A card's width, the gaps between columns and rows, an outline's indent per level, the width under which the
  // outline takes over, and how many names a card shows before "+N". A parent's connectors share one trunk `TRUNK`
  // right of it, each turning into its child round a corner `BEND` wide, the way through labelled on its own run.
  const W = 224, GAP_X = 128, GAP_Y = 16, INDENT = 20, NARROW = 720, CHIPS = 6, TRUNK = 20, BEND = 8;
  // The zoom's range, and the least the first view shows a wide tree at, so its words stay readable: at 0.68 the chain
  // from the island to DSB Land's venues, six columns, fits a 1440-pixel screen.
  const S_MIN = 0.2, S_MAX = 1.6, S_READABLE = 0.68;

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  // The tree, indexed.
  const byId = new Map(), parentOf = new Map(), byZone = new Map();
  const index = (n, parent, depth) => {
    n.depth = depth;
    byId.set(n.id, n);
    parentOf.set(n.id, parent);
    for (const zone of n.zones) byZone.set(zone, n);
    for (const child of n.children) index(child, n, depth + 1);
  };
  index(tree, null, 0);
  const placeOf = (zone) => {
    if (byZone.has(zone)) return byZone.get(zone);
    for (const [prefix, id] of prefixes) if (zone.startsWith(prefix)) return byId.get(id);
    return null;
  };
  const open = new Set();
  const openDefault = () => {
    open.clear();
    for (const n of byId.values()) if (n.depth === 0 || n.open) open.add(n.id);
  };
  openDefault();

  // The short description of a place, beside its card.
  const hideTip = () => { tip.hidden = true; tip.dataset.for = ""; };
  const showTip = (n, card) => {
    if (!n.blurb) { hideTip(); return; }
    tip.textContent = n.blurb;
    tip.dataset.for = n.id;
    tip.hidden = false;
    const r = card.getBoundingClientRect(), t = tip.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - t.width - 8));
    const below = r.bottom + 8, top = below + t.height > window.innerHeight - 8 ? Math.max(8, r.top - t.height - 8) : below;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };

  // One card, one connector and one label per place, made once and shown or hidden as branches fold.
  const stage = el("div", "map-stage"), edges = document.createElementNS(SVG, "svg");
  edges.setAttribute("class", "map-edges");
  edges.setAttribute("aria-hidden", "true");
  stage.append(edges);
  const parts = new Map();
  const make = (n) => {
    const card = el("article", `node land-${n.land} kind-${n.kind}`);
    card.dataset.id = n.id;
    const head = el("div", "node-head");
    const name = el(n.href ? "a" : "span", "node-name", n.name);
    if (n.href) {
      name.href = n.href;
      if (n.external) { name.target = "_blank"; name.rel = "noopener noreferrer"; }
    }
    head.append(name);
    let fold = null;
    if (n.children.length) {
      fold = el("button", "node-fold");
      fold.type = "button";
      fold.addEventListener("click", () => toggle(n));
      head.append(fold);
    }
    card.append(head);
    const meta = [n.via ? `by ${n.via}` : "", n.where || "", n.external ? "another site" : ""].filter(Boolean);
    if (meta.length) {
      const line = el("p", "node-meta");
      if (n.via) line.append(el("span", "node-via", `by ${n.via}`));
      const rest = meta.filter((m) => m !== `by ${n.via}`).join(" · ");
      if (rest) line.append(el("span", "node-where", rest));
      card.append(line);
    }
    if (n.items.length) {
      const items = el("ul", "node-items");
      for (const item of n.items) {
        const li = el("li");
        const label = el(item.href ? "a" : "span", "node-item", item.name);
        if (item.href) label.href = item.href;
        li.append(label);
        if (item.note) li.append(el("span", "node-note", item.note));
        items.append(li);
      }
      card.append(items);
    }
    const live = el("div", "node-live");
    live.hidden = true;
    const cpu = el("p", "node-cpu");
    cpu.hidden = true;
    const objects = el("ul", "node-objects");
    objects.hidden = true;
    card.append(live, cpu, objects);
    let edge = null, label = null;
    if (parentOf.get(n.id)) {
      edge = document.createElementNS(SVG, "path");
      edge.setAttribute("class", `edge land-${parentOf.get(n.id).land}`);
      edges.append(edge);
      if (n.via) {
        label = el("span", `edge-label land-${n.land}`, n.via);
        label.setAttribute("aria-hidden", "true");
        stage.append(label);
      }
    }
    card.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") showTip(n, card); });
    card.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hideTip(); });
    card.addEventListener("focusin", () => showTip(n, card));
    card.addEventListener("focusout", hideTip);
    card.addEventListener("click", (e) => {
      if (e.target.closest("a, button")) return;
      if (tip.hidden || tip.dataset.for !== n.id) showTip(n, card); else hideTip();
    });
    stage.append(card);
    parts.set(n.id, { card, fold, live, cpu, objects, edge, label });
    for (const child of n.children) make(child);
  };
  make(tree);

  // Layout.
  let narrow = false, tx = 0, ty = 0, s = 1, width = 0, height = 0;
  const shown = [];
  const collect = (n) => { shown.push(n); if (open.has(n.id)) for (const child of n.children) collect(child); };
  // A subtree's height, its cards laid from `top` down: a parent stands level with its first child, so the first open
  // branch at every level reads along one row, the island to a room in DSB Land.
  const place = (n, top) => {
    n.x = n.depth * (W + GAP_X);
    n.y = top;
    if (!open.has(n.id) || !n.children.length) return n.h;
    let y = top;
    for (const child of n.children) y += place(child, y) + GAP_Y;
    return Math.max(y - GAP_Y - top, n.h);
  };
  const layout = () => {
    narrow = view.clientWidth < NARROW;
    document.body.classList.toggle("map-narrow", narrow);
    shown.length = 0;
    collect(tree);
    const on = new Set(shown.map((n) => n.id));
    for (const [id, p] of parts) {
      const visible = on.has(id);
      p.card.hidden = !visible;
      if (p.edge) p.edge.setAttribute("display", visible ? "inline" : "none");
      if (p.label) p.label.hidden = !visible || narrow;
      if (p.fold) {
        const n = byId.get(id), folded = !open.has(id);
        p.fold.textContent = folded ? `+${n.children.length}` : "−";
        p.fold.setAttribute("aria-expanded", String(!folded));
        p.fold.setAttribute("aria-label", `${folded ? "Show" : "Hide"} the ${plural(n.children.length, "place")} in ${n.name}`);
      }
    }
    const outline = Math.max(200, view.clientWidth - 24);
    for (const n of shown) parts.get(n.id).card.style.width = `${narrow ? Math.max(180, outline - n.depth * INDENT) : W}px`;
    for (const n of shown) n.h = parts.get(n.id).card.offsetHeight;
    if (narrow) {
      let y = 12;
      for (const n of shown) { n.x = 12 + n.depth * INDENT; n.y = y; y += n.h + 10; }
      width = view.clientWidth;
      height = y + 12;
    } else {
      height = place(tree, 24) + 48;
      width = 0;
      for (const n of shown) width = Math.max(width, n.x + W);
      width += 48;
      for (const n of shown) n.x += 24;
    }
    for (const n of shown) {
      const p = parts.get(n.id);
      p.card.style.left = `${n.x}px`;
      p.card.style.top = `${n.y}px`;
      const up = parentOf.get(n.id);
      if (!up) continue;
      // A connector meets a card at its title's height, so a parent and its first child join in a straight line.
      const cy = n.y + Math.min(n.h / 2, 22);
      if (narrow) {
        const px = up.x + 10;
        p.edge.setAttribute("d", `M${px} ${up.y + up.h}V${cy}H${n.x}`);
      } else {
        const x1 = up.x + W, y1 = up.y + Math.min(up.h / 2, 22), xt = x1 + TRUNK, drop = cy - y1;
        const r = Math.min(BEND, Math.abs(drop) / 2), dir = Math.sign(drop);
        p.edge.setAttribute("d", r < 1 ? `M${x1} ${y1}H${n.x}`
          : `M${x1} ${y1}H${xt}V${cy - dir * r}Q${xt} ${cy} ${xt + r} ${cy}H${n.x}`);
        if (p.label) { p.label.style.left = `${(xt + n.x) / 2}px`; p.label.style.top = `${cy}px`; }
      }
    }
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    edges.setAttribute("width", String(width));
    edges.setAttribute("height", String(height));
    apply();
  };
  const apply = () => {
    stage.style.transform = narrow ? "" : `translate(${tx}px, ${ty}px) scale(${s})`;
  };
  // The whole tree in view, or with `readable` no smaller than S_READABLE; a tree that still overflows starts from its
  // top left, where the island and its first open branch (₿IFRÖST's, down to DSB Land's venues) are laid.
  const fit = (readable = false) => {
    if (narrow) return;
    const vw = view.clientWidth, vh = view.clientHeight, whole = Math.min(1, (vw - 32) / width, (vh - 32) / height);
    s = Math.max(S_MIN, readable ? Math.max(whole, S_READABLE) : whole);
    tx = width * s <= vw - 32 ? (vw - width * s) / 2 : 16;
    ty = height * s <= vh - 32 ? (vh - height * s) / 2 : 16;
    apply();
  };
  // Folding keeps the card that was pressed where it stood on screen.
  const toggle = (n) => {
    const before = { x: n.x * s + tx, y: n.y * s + ty };
    if (open.has(n.id)) open.delete(n.id); else open.add(n.id);
    layout();
    if (!narrow) { tx = before.x - n.x * s; ty = before.y - n.y * s; apply(); }
  };

  // Panning and zooming the wide layout. A press anywhere but a button pans, on a card's text or link too: the browser's
  // own press (selecting text, dragging a link away) is refused, and a press that moves past DRAG_PX is a pan, so the
  // click that ends it opens nothing. The view takes the pointer only once it moves, so a still click reaches its link.
  const DRAG_PX = 4;
  const pointers = new Map();
  let pinch = 0, dragged = false;
  const zoomAt = (px, py, next) => {
    next = Math.max(S_MIN, Math.min(S_MAX, next));
    tx = px - (px - tx) * (next / s);
    ty = py - (py - ty) * (next / s);
    s = next;
    apply();
  };
  view.addEventListener("pointerdown", (e) => {
    if (narrow || e.target.closest("button") || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (e.pointerType === "mouse") e.preventDefault();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, from: { x: e.clientX, y: e.clientY }, moving: false });
    if (pointers.size === 1) dragged = false;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  view.addEventListener("click", (e) => {
    if (!dragged) return;
    dragged = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  view.addEventListener("pointermove", (e) => {
    const last = pointers.get(e.pointerId);
    if (!last) return;
    if (!last.moving) {
      if (Math.hypot(e.clientX - last.from.x, e.clientY - last.from.y) < DRAG_PX) return;
      last.moving = dragged = true;
      view.setPointerCapture(e.pointerId);
      view.classList.add("dragging");
      hideTip();
    }
    if (pointers.size === 2) {
      last.x = e.clientX;
      last.y = e.clientY;
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = view.getBoundingClientRect();
      if (pinch > 0) zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, s * d / pinch);
      pinch = d;
      return;
    }
    tx += e.clientX - last.x;
    ty += e.clientY - last.y;
    last.x = e.clientX;
    last.y = e.clientY;
    apply();
  });
  const release = (e) => {
    pointers.delete(e.pointerId);
    pinch = 0;
    if (!pointers.size) view.classList.remove("dragging");
  };
  view.addEventListener("pointerup", release);
  view.addEventListener("pointercancel", release);
  view.addEventListener("wheel", (e) => {
    if (narrow) return;
    e.preventDefault();
    const r = view.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, s * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)));
  }, { passive: false });
  // A card reached with the keyboard is brought into view.
  view.addEventListener("focusin", (e) => {
    const card = e.target.closest(".node");
    if (narrow || !card) return;
    const n = byId.get(card.dataset.id), vw = view.clientWidth, vh = view.clientHeight;
    const left = n.x * s + tx, top = n.y * s + ty, right = left + W * s, bottom = top + n.h * s;
    if (left < 16) tx += 16 - left; else if (right > vw - 16) tx -= right - vw + 16;
    if (top < 16) ty += 16 - top; else if (bottom > vh - 16) ty -= bottom - vh + 16;
    apply();
  });
  tools.addEventListener("click", (e) => {
    const action = e.target.closest("button")?.dataset.map;
    if (action === "expand") { for (const n of byId.values()) if (n.children.length) open.add(n.id); layout(); fit(); }
    else if (action === "collapse") { open.clear(); open.add(tree.id); layout(); fit(); }
    else if (action === "fit") fit();
  });
  let resizing = 0, wasNarrow = null;
  new ResizeObserver(() => {
    if (resizing) return;
    resizing = requestAnimationFrame(() => {
      resizing = 0;
      layout();
      if (wasNarrow !== narrow) fit(true);
      wasNarrow = narrow;
    });
  }).observe(view);

  // The live layer.
  let live = null, timer = 0, wait = 10000, stopped = false, failed = false, nowhere = 0;
  const say = () => {
    if (stopped) { status.textContent = "The map alone: who is where shows on the live site."; return; }
    if (!live) { status.textContent = failed ? "Couldn't read who is where. Trying again." : "Reading who is where…"; return; }
    const when = new Date(live.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const tail = live.tier === "public" ? " Sign in on the island to see who they are."
      : live.tier === "inspector" ? " Inspector view: sockets and Durable Objects." : "";
    const between = nowhere ? ` ${nowhere} between places.` : "";
    const cpu = live.cpu ? ` CPU is estimated from each place's messages over the last ${Math.round(live.cpu.seconds)} s.` : "";
    status.textContent = `${plural(live.players, "player")} online, as of ${when}.${between}${failed ? " (Couldn't refresh.)" : ""}${cpu}${tail}`;
  };
  const age = (at) => {
    const s = Math.max(0, Math.round((Date.now() - at) / 1000));
    return s < 90 ? `${s} s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
  };
  // A place's estimated CPU: its own zones', what is inside it when that adds more, and for the island the whole
  // room's against one object's thread. A place no zone stands for is counted with the place its players report.
  const ms = (v) => v < 0.05 ? "0" : v < 10 ? v.toFixed(1) : String(Math.round(v));
  const cpuLine = (line, n, mine, cpu) => {
    const strong = (text) => el("b", null, text);
    if (n.zones.length || mine) {
      line.append("CPU ≈ ", strong(`${ms(mine)} ms/s`));
      if (n.children.length && n.cpu - mine >= 0.05) line.append(` · ${ms(n.cpu)} ms/s with what's inside`);
      if (n.depth === 0) line.append(` · whole room ≈ ${ms(cpu.total)} ms/s, ${(cpu.total / cpu.model.budgetMs * 100).toFixed(1)}% of one object's thread`);
      line.title = `Estimate: each message in costs about ${cpu.model.inMs.toFixed(2)} ms and each send out about ${cpu.model.outMs.toFixed(2)} ms of the object's one thread, from Cloudflare's published throughput for a Durable Object. Not a measurement.`;
      return;
    }
    if (n.cpu >= 0.05) { line.append("CPU ≈ ", strong(`${ms(n.cpu)} ms/s`), " inside"); return; }
    let up = parentOf.get(n.id);
    while (up && !up.zones.length) up = parentOf.get(up.id);
    if (up) line.append(`CPU counted with ${up.name}`);
  };
  const objectLine = (o) => [o.cls, o.name, o.sockets === null ? null : o.maxSockets ? `${o.sockets} of ${o.maxSockets} sockets` : plural(o.sockets, "socket"),
    Number.isFinite(o.cpuMs) ? `CPU ≈ ${ms(o.cpuMs)} ms/s` : null, o.status, o.lastSeen ? `reported ${age(o.lastSeen)}` : null].filter(Boolean).join(" · ");
  const paint = () => {
    const own = new Map();
    nowhere = 0;
    for (const [zone, count] of Object.entries(live ? live.zones : {})) {
      const n = placeOf(zone);
      if (!n) { nowhere += count; continue; }
      const entry = own.get(n.id) || { count: 0, names: [] };
      entry.count += count;
      if (live.names && live.names[zone]) entry.names.push(...live.names[zone]);
      own.set(n.id, entry);
    }
    const total = (n) => { let t = own.has(n.id) ? own.get(n.id).count : 0; for (const c of n.children) t += total(c); n.total = t; return t; };
    total(tree);
    // The estimated CPU (worker/src/cpu-model.js) each place's zones cost, and with everything inside it.
    const cpuOwn = new Map(), cpu = live && live.cpu;
    if (cpu) for (const [zone, ms] of Object.entries(cpu.zones)) {
      const n = placeOf(zone);
      if (n) cpuOwn.set(n.id, (cpuOwn.get(n.id) || 0) + ms);
    }
    const cpuTotal = (n) => { let t = cpuOwn.get(n.id) || 0; for (const c of n.children) t += cpuTotal(c); n.cpu = t; return t; };
    cpuTotal(tree);
    for (const [id, p] of parts) {
      const n = byId.get(id), entry = own.get(id), here = entry ? entry.count : 0, inside = n.total - here;
      p.live.replaceChildren();
      if (here) {
        p.live.append(el("span", "badge here", `${here} here`));
        if (entry.names.length) {
          entry.names.sort((a, b) => a.display.localeCompare(b.display));
          for (const who of entry.names.slice(0, CHIPS)) {
            const chip = el("span", "chip", who.display);
            chip.title = who.display === who.login ? who.login : `${who.display} (${who.login})`;
            p.live.append(chip);
          }
          if (entry.names.length > CHIPS) p.live.append(el("span", "chip more", `+${entry.names.length - CHIPS}`));
        }
      }
      if (inside && !open.has(id)) p.live.append(el("span", "badge inside", `${inside} inside`));
      p.live.hidden = !p.live.childElementCount;
      p.cpu.replaceChildren();
      if (cpu && !n.external) cpuLine(p.cpu, n, cpuOwn.get(id) || 0, cpu);
      p.cpu.hidden = !p.cpu.childNodes.length;
      p.objects.replaceChildren();
      if (live && live.tier === "inspector") {
        if (n.depth === 0 && live.room) {
          const r = live.room;
          p.objects.append(el("li", null, `${r.cls} · ${r.name} · ${r.players} of ${r.maxPlayers} players · ${plural(r.sockets, "socket")}${r.commons ? ` (${r.commons} Ooga Chat)` : ""}`));
        } else if (here && live.room) p.objects.append(el("li", null, `${live.room.cls} · ${live.room.name} · ${plural(here, "socket")} here`));
        for (const rule of n.objects) {
          if (rule.prefix) for (const o of live.objects.filter((x) => x.cls === rule.cls && x.name.startsWith(rule.prefix))) p.objects.append(el("li", null, objectLine(o)));
          else p.objects.append(el("li", null, `${rule.cls} · ${rule.name}: ${rule.note}`));
        }
      }
      p.objects.hidden = !p.objects.childElementCount;
    }
    if (live && live.tier === "inspector") {
      objectsList.replaceChildren(...live.objects.map((o) => el("li", null, objectLine(o))));
      if (!live.objects.length) objectsList.append(el("li", null, "No reports yet: the Inspector lists an object once it has reported."));
      objectsTitle.textContent = `Durable Objects (${live.objects.length})`;
      objectsBox.hidden = false;
    } else objectsBox.hidden = true;
    say();
    layout();
  };
  // Only a page with no Worker behind it (a 404 or 405, or an answer that is not JSON) stops for good. Anything else
  // that fails, the limiter's 429 among them, is waited out (its Retry-After when it gives one) and asked again.
  let asked = 0;
  const poll = async () => {
    timer = 0;
    if (document.hidden || stopped) return;
    asked = Date.now();
    try {
      const res = await fetch("/api/world", { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
      if (res.status === 404 || res.status === 405 || (res.ok && !(res.headers.get("content-type") || "").includes("json"))) { stopped = true; live = null; paint(); return; }
      if (!res.ok) {
        const after = Number(res.headers.get("retry-after"));
        throw Object.assign(new Error(`world: ${res.status}`), { after: Number.isFinite(after) && after > 0 ? after * 1000 : 0 });
      }
      live = await res.json();
      failed = false;
      wait = Number.isFinite(live.refreshMs) && live.refreshMs >= 2000 ? live.refreshMs : 10000;
    } catch (error) {
      failed = true;
      wait = Math.min(Math.max(error.after || wait * 2, 10000), 60000);
    }
    paint();
    schedule();
  };
  const schedule = (delay = wait) => { if (!timer && !stopped && !document.hidden) timer = setTimeout(poll, delay); };
  // Back on the page it asks at once only when its wait has run out since it last asked, so flipping between tabs
  // never asks more often than the page would have anyway.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { clearTimeout(timer); timer = 0; } else if (!stopped && !timer) schedule(Math.max(0, asked + wait - Date.now()));
  });

  // The drawing takes the list's place; the list stays in the page for a reader without scripts.
  // Appearance: System follows the system; Light and Dark are kept in this browser (localStorage ooga-theme, which
  // /inspect shares, and which theme.js reads before the page draws).
  const themes = $("map-theme"), root = document.documentElement;
  const choose = (choice) => {
    try { if (choice === "system") localStorage.removeItem("ooga-theme"); else localStorage.setItem("ooga-theme", choice); } catch { /* Kept for this page. */ }
    if (choice === "system") delete root.dataset.theme; else root.dataset.theme = choice;
    const shown = root.dataset.theme || "system";
    for (const b of themes.querySelectorAll("button")) b.setAttribute("aria-checked", String(b.dataset.choice === shown));
  };
  themes.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) choose(b.dataset.choice); });
  for (const b of themes.querySelectorAll("button")) b.setAttribute("aria-checked", String(b.dataset.choice === (root.dataset.theme || "system")));
  themes.hidden = false;

  // The title in the carved signs' capitals, read out as written.
  const title = document.querySelector(".map-title"), words = title.textContent;
  BL.signGlyphs.letter(title, words.toUpperCase());
  title.setAttribute("aria-label", words);
  list.hidden = true;
  tools.hidden = false;
  view.append(stage);
  layout();
  fit(true);
  wasNarrow = narrow;
  say();
  poll();
})();
