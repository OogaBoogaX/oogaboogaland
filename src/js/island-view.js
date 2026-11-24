// The island view (docs/ooga-chat-hosts.md, "The island view"), Ooga Chat's and the island's alike: the strip at the top
// of a chat (chat-hosts.js's `.hc-room-strip`) while one of its speakers walks the chat's copy of Main Island. By default
// a drawn map: the baked overhead picture of the island (scripts/island-view.mjs, its matrix island-view-data.js) with
// each walking speaker's Ooga face where they stand, eased between the chat's `walk` frames (at most two a second), a
// ring pulsing round it while they talk. An opt-in Live view, off until chosen and remembered in this browser
// (`storageKey`), draws the island with the game's own renderer (island-view-live.js, which the page loads only then,
// `loadLive`) from a fixed far camera, the faces over the speakers' heads. Reads nothing at load but window.BL.
// `create({ picture, faceOf(row), loadLive(), island(), storageKey })` returns `{ node, update({ rows, talking,
// speaking, self, active }), walk(msg), dispose() }`: `rows` the chat's roster rows (the walkers are those with
// `walking`), `talking` the ids heard speaking and `speaking` the visitor's own meter, `self` the visitor's id, `active`
// whether the strip can be seen now (the panel shown, the page visible). It draws only while it shows and is active, a
// frame at a time; the faces' pictures are made once a row, so a frame allocates nothing. `parseWalk(msg, walks, now)`
// and `project(view, x, y, z, out)` are pure.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const MAX = 32, FACE = 26, RING = "#22c55e", PULSE_HZ = 2.2;
  // Where a world point falls on the picture: `view` is island-view-data.js's (`w`, `h`, `matrix`), `out` gets `x`, `y`.
  const project = (view, x, y, z, out) => {
    const m = view.matrix, w = m[3] * x + m[7] * y + m[11] * z + m[15];
    out.x = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * 0.5 + 0.5) * view.w;
    out.y = (0.5 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w * 0.5) * view.h;
    return out;
  };
  // The walkers' places, a slot each: where each was shown from and where it is going, eased over the time between
  // frames, so a walker moves on smoothly as the next frame arrives. Made once.
  const walks = () => ({ seq: 0, count: 0, at: 0, gap: 500, index: new Map(), ids: new Array(MAX).fill(null), seen: new Float64Array(MAX),
    from: new Float64Array(MAX * 4), to: new Float64Array(MAX * 4), start: new Float64Array(MAX) });
  const ID = /^gh:[1-9][0-9]{0,19}$/;
  // Eased place of slot `i` at `now`, into `out` (`x`, `y`, `z`, `yaw`).
  const placeOf = (w, i, now, out) => {
    const k = Math.max(0, Math.min(1, (now - w.start[i]) / w.gap)), o = i * 4;
    out.x = w.from[o] + (w.to[o] - w.from[o]) * k;
    out.y = w.from[o + 1] + (w.to[o + 1] - w.from[o + 1]) * k;
    out.z = w.from[o + 2] + (w.to[o + 2] - w.from[o + 2]) * k;
    let turn = w.to[o + 3] - w.from[o + 3];
    turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
    out.yaw = w.from[o + 3] + turn * k;
    return out;
  };
  const NOW = { x: 0, y: 0, z: 0, yaw: 0 };
  // One `walk` frame (`{ type: "walk", seq, p: [id, x, y, z, yaw, …] }`, audience.js) into `w`: false, changing nothing,
  // for anything that is not one or is older than the last; a walker missing from it leaves its slot.
  const parseWalk = (msg, w, now) => {
    if (!msg || msg.type !== "walk" || !Number.isSafeInteger(msg.seq) || msg.seq <= w.seq || !Array.isArray(msg.p) || msg.p.length % 5 || msg.p.length > MAX * 5) return false;
    const p = msg.p;
    for (let i = 0; i < p.length; i += 5) {
      if (typeof p[i] !== "string" || !ID.test(p[i])) return false;
      for (let k = 1; k < 5; k++) if (typeof p[i + k] !== "number" || !Number.isFinite(p[i + k]) || k < 4 && Math.abs(p[i + k]) > 1000) return false;
    }
    w.gap = w.at ? Math.max(150, Math.min(1500, now - w.at)) : 500;
    w.at = now;
    w.seq = msg.seq;
    for (let i = 0; i < p.length; i += 5) {
      let slot = w.index.get(p[i]);
      const fresh = slot === undefined;
      if (fresh) {
        slot = w.ids.indexOf(null);
        if (slot < 0) continue;
        w.ids[slot] = p[i];
        w.index.set(p[i], slot);
      } else placeOf(w, slot, now, NOW);
      const o = slot * 4;
      w.to[o] = p[i + 1]; w.to[o + 1] = p[i + 2]; w.to[o + 2] = p[i + 3]; w.to[o + 3] = p[i + 4];
      if (fresh) { w.from[o] = w.to[o]; w.from[o + 1] = w.to[o + 1]; w.from[o + 2] = w.to[o + 2]; w.from[o + 3] = w.to[o + 3]; }
      else { w.from[o] = NOW.x; w.from[o + 1] = NOW.y; w.from[o + 2] = NOW.z; w.from[o + 3] = NOW.yaw; }
      w.start[slot] = now;
      w.seen[slot] = msg.seq;
    }
    let count = 0;
    for (let i = 0; i < MAX; i++) {
      if (w.ids[i] === null) continue;
      if (w.seen[i] !== msg.seq) { w.index.delete(w.ids[i]); w.ids[i] = null; } else count++;
    }
    w.count = count;
    return true;
  };

  // Every island view on the page, for the checks (`BL.islandView.open`).
  const open = new Set();
  const create = ({ picture, faceOf, loadLive = () => null, island = () => null, storageKey = "ooga-island-view-live" }) => {
    const view = BL.islandViewData.main, state = walks();
    const node = document.createElement("div"), stage = document.createElement("div"), map = document.createElement("canvas");
    const toggle = document.createElement("button"), note = document.createElement("p");
    node.className = "iv";
    stage.className = "iv-stage";
    map.className = "iv-map";
    map.setAttribute("role", "img");
    toggle.type = "button";
    toggle.className = "iv-live";
    toggle.textContent = "Live view";
    note.className = "iv-note";
    note.setAttribute("aria-live", "polite");
    stage.append(map, toggle);
    node.append(stage, note);
    const g = map.getContext("2d");
    const image = new Image();
    image.decoding = "async";
    let pictureAsked = false;
    // Beside the picture where the strip's shape differs from it: the picture's own sea edges spread out and blurred,
    // so the sea runs on to the strip's ends. Made once a size.
    const back = document.createElement("canvas"), bg = back.getContext("2d"), EDGE = 16;
    let backFor = "";
    const paintBack = () => {
      if (!image.complete || !image.naturalWidth || !map.width) return;
      const key = `${map.width}x${map.height}`;
      if (key === backFor) return;
      backFor = key;
      back.width = map.width; back.height = map.height;
      const k = Math.min(back.width / view.w, back.height / view.h), w = view.w * k, h = view.h * k, x = (back.width - w) / 2, y = (back.height - h) / 2;
      bg.filter = "blur(10px)";
      if (x > 0) {
        bg.drawImage(image, 0, 0, EDGE, view.h, -20, y, x + 40, h);
        bg.drawImage(image, view.w - EDGE, 0, EDGE, view.h, x + w - 20, y, x + 40, h);
      }
      if (y > 0) {
        bg.drawImage(image, 0, 0, view.w, EDGE, x, -20, w, y + 40);
        bg.drawImage(image, 0, view.h - EDGE, view.w, EDGE, x, y + h - 20, w, y + 40);
      }
      bg.filter = "none";
    };
    image.addEventListener("load", () => { backFor = ""; paintBack(); });
    // A face a walker, made when their row first comes (or their picture changes): the picture and its initial.
    const faces = new Map();
    // A walker with no picture of their own shows the native Ooga face, as the roster's tiles do.
    let plain = null;
    if (BL.nativeIcons && typeof XMLSerializer === "function") {
      plain = new Image();
      plain.src = `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(BL.nativeIcons.svg("roster")))}`;
    }
    const faceFor = (row) => {
      let f = faces.get(row.id);
      const url = faceOf(row) || "";
      if (!f) { f = { url: null, img: null, initial: "", talking: false }; faces.set(row.id, f); }
      if (f.url !== url) {
        f.url = url;
        f.img = null;
        if (url) { f.img = new Image(); f.img.decoding = "async"; f.img.src = url; }
      }
      f.initial = (row.display || row.login || "?").slice(0, 1).toUpperCase();
      return f;
    };
    let rows = [], shown = false, active = false, raf = 0, live = null, liveWant = false, liveState = "off", liveAt = 0, width = 0, height = 0, dpr = 1;
    try { liveWant = localStorage.getItem(storageKey) === "1"; } catch { /* Storage may be unavailable. */ }
    // The canvas follows the strip's size, read only when the strip changes size or shows (never in a frame, where
    // reading it would allocate).
    const resize = () => {
      const w = map.clientWidth, h = map.clientHeight, d = Math.min(2, window.devicePixelRatio || 1);
      if (w === width && h === height && d === dpr) return;
      width = w; height = h; dpr = d;
      map.width = Math.max(1, Math.round(width * dpr));
      map.height = Math.max(1, Math.round(height * dpr));
      live?.resize();
    };
    const sizes = typeof ResizeObserver === "function" ? new ResizeObserver(() => { resize(); if (shown && active && !raf) draw(); }) : null;
    sizes?.observe(stage);
    const P = { x: 0, y: 0 };
    let fit = 1, offX = 0, offY = 0, fontR = 0, font = "";
    // One frame: the picture (or the live render under a clear canvas), then each walker's face, eased to where it is.
    const frame = (now) => {
      raf = 0;
      if (!shown || !active) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, width, height);
      const showLive = liveState === "on";
      if (showLive) {
        // The renderer draws a few times a second at most; the faces over it every frame.
        if (now - liveAt >= 166) {
          liveAt = now;
          for (let i = 0; i < MAX; i++) {
            if (state.ids[i] === null) { live.place(i, 0, 0, 0, 0, false); continue; }
            placeOf(state, i, now, NOW);
            live.place(i, NOW.x, NOW.y, NOW.z, NOW.yaw, true);
          }
          live.render();
        }
      } else {
        fit = Math.min(width / view.w, height / view.h);
        offX = (width - view.w * fit) / 2; offY = (height - view.h * fit) / 2;
        paintBack();
        if (backFor) g.drawImage(back, 0, 0, width, height);
        if (image.complete && image.naturalWidth) g.drawImage(image, offX, offY, view.w * fit, view.h * fit);
      }
      const r = Math.max(9, Math.min(FACE, width / 22)) / 2, beat = 0.5 + 0.5 * Math.sin(now / 1000 * Math.PI * 2 * PULSE_HZ);
      for (let i = 0; i < MAX; i++) {
        const id = state.ids[i];
        if (id === null) continue;
        const f = faces.get(id);
        if (!f) continue;
        placeOf(state, i, now, NOW);
        let x, y;
        if (showLive) {
          if (!live.project(NOW.x, NOW.y + 2.1, NOW.z, P)) continue;
          x = P.x; y = P.y - r;
        } else {
          project(view, NOW.x, NOW.y, NOW.z, P);
          x = offX + P.x * fit; y = offY + P.y * fit;
        }
        if (f.talking) {
          g.globalAlpha = 0.25 + 0.5 * beat;
          g.fillStyle = RING;
          g.beginPath(); g.arc(x, y, r + 3 + 4 * beat, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 1;
        }
        g.fillStyle = RING;
        g.beginPath(); g.arc(x, y, r + 2, 0, Math.PI * 2); g.fill();
        g.save();
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
        g.fillStyle = "#3a2a1c";
        g.fillRect(x - r, y - r, r * 2, r * 2);
        if (f.img && f.img.complete && f.img.naturalWidth) g.drawImage(f.img, x - r, y - r, r * 2, r * 2);
        else if (plain && plain.complete && plain.naturalWidth) g.drawImage(plain, x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
        else {
          g.fillStyle = "#f3efe4";
          if (fontR !== Math.round(r)) { fontR = Math.round(r); font = `700 ${fontR}px system-ui, sans-serif`; }
          g.font = font;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText(f.initial, x, y + 0.5);
        }
        g.restore();
      }
      raf = requestAnimationFrame(frame);
    };
    const draw = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    // Live view: the renderer's code fetched only now, then one renderer on a canvas of its own, new each time Live view
    // starts (a renderer's dispose gives its context up for good, so a canvas is never reused).
    let glCanvas = null;
    const setLive = (on) => {
      liveWant = on;
      try { localStorage.setItem(storageKey, on ? "1" : "0"); } catch { /* Storage may be unavailable. */ }
      paint();
      if (on) startLive();
      else endLive();
    };
    toggle.addEventListener("click", (e) => { if (e.detail) toggle.blur(); setLive(!liveWant); });
    let liveTry = 0;
    const startLive = () => {
      if (!liveWant || !shown || live || liveState === "loading" || liveState === "failed") return;
      liveState = "loading";
      paint();
      const mine = ++liveTry;
      Promise.resolve(loadLive()).then(() => BL.islandViewLive.prepare(island)).then((ground) => {
        if (mine !== liveTry || !liveWant || !shown) { liveState = "off"; return paint(); }
        glCanvas = document.createElement("canvas");
        glCanvas.className = "iv-gl";
        stage.prepend(glCanvas);
        live = BL.islandViewLive.create(glCanvas, { ground, data: view });
        liveState = "on";
        liveAt = 0;
        paint();
        draw();
      }).catch(() => {
        if (mine !== liveTry) return;
        liveState = "failed";
        paint();
      });
    };
    const endLive = () => {
      liveTry++;
      if (live) { live.dispose(); live = null; }
      if (glCanvas) { glCanvas.remove(); glCanvas = null; }
      if (liveState !== "failed" || !liveWant) liveState = "off";
      paint();
      if (shown && active) draw();
    };
    const paint = () => {
      node.hidden = !shown;
      toggle.setAttribute("aria-pressed", String(liveWant));
      stage.dataset.live = liveState;
      const names = rows.filter((row) => row.walking).map((row) => row.display || row.login);
      const where = names.length === 1 ? `${names[0]} is walking the chat's island` : `${names.length} speakers are walking the chat's island`;
      map.setAttribute("aria-label", `Map of the chat's island: ${names.join(", ")}`);
      const text = liveWant && liveState === "loading" ? "Live view loading…" : liveWant && liveState === "failed" ? "Live view couldn't start here; showing the map" : where;
      if (note.textContent !== text) note.textContent = text;
    };
    const update = (next) => {
      rows = next.rows;
      const walkers = rows.filter((row) => row.walking);
      const show = walkers.length > 0;
      for (const row of walkers) {
        const f = faceFor(row);
        f.talking = row.id === next.self ? !!next.speaking : next.talking.includes(row.id);
      }
      if (faces.size > walkers.length) for (const id of faces.keys()) if (!walkers.some((row) => row.id === id)) faces.delete(id);
      if (show && !pictureAsked) { pictureAsked = true; image.src = picture; }
      const was = shown;
      shown = show;
      active = !!next.active;
      paint();
      if (!shown && was) {
        endLive();
        // A chat's next walk starts afresh: its first frame places every walker where they stand.
        state.seq = state.at = state.count = 0;
        for (let i = 0; i < MAX; i++) state.ids[i] = null;
        state.index.clear();
      }
      if (shown && active) { resize(); if (liveWant) startLive(); draw(); } else stop();
    };
    const walk = (msg) => parseWalk(msg, state, performance.now());
    // Where each walker's face stands on the strip now, in CSS pixels (the checks', made on call).
    const placed = () => {
      const now = performance.now(), out = [];
      for (let i = 0; i < MAX; i++) {
        if (state.ids[i] === null) continue;
        placeOf(state, i, now, NOW);
        if (liveState === "on") { if (live.project(NOW.x, NOW.y + 2.1, NOW.z, P)) out.push({ id: state.ids[i], x: P.x, y: P.y, world: { ...NOW } }); continue; }
        project(view, NOW.x, NOW.y, NOW.z, P);
        out.push({ id: state.ids[i], x: offX + P.x * fit, y: offY + P.y * fit, world: { ...NOW } });
      }
      return out;
    };
    const self = { node, update, walk, placed, dispose() { shown = active = false; stop(); endLive(); sizes?.disconnect(); faces.clear(); node.remove(); open.delete(self); },
      get live() { return liveState; }, get walks() { return state; }, get drawing() { return !!raf; } };
    open.add(self);
    return self;
  };
  BL.islandView = { create, parseWalk, project, walks, placeOf, MAX, open };
})();
