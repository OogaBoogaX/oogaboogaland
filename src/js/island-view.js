// The island view (docs/ooga-chat-hosts.md, "The island view"), Ooga Chat's and the island's alike: the strip at the top
// of a Main Island chat (chat-hosts.js's `.hc-room-strip`), the island as a chat's copy of it shows it (Main Island
// alone), standing still until a speaker walks the copy, each who does shown where they stand. One view, chosen once a
// page by the device (`capable`), never toggled: the flat bird's-eye picture (scripts/island-view.mjs, its matrix
// island-view-data.js) with each walker's Ooga face, or where the page offers it (`loadLive`, Ooga Chat's) to a viewer
// it allows (`liveAllowed`: Ooga Chat's, a GitHub contributor; asked again on every update) and the device can carry it (WebGL2, enough memory and cores, no data saver or connection it reports as slow), the 3D view (island-view-live.js) over the
// baked scenery at the tier the viewer's connection allows (island-scene.js), dark with a loading ring while it loads
// and the picture if it can't, the speakers not walking it sitting on the copy's clouds (`clouds`), and over each
// speaker's head their name as the island shows other players' (a green dot walking, a purple one on a cloud). In 3D the viewer turns the
// island with a drag, pans with a two-finger drag, a right or Shift drag, zooms with the wheel or a pinch, and Reset
// view puts it back. It draws only while shown and active: the map when something changed (a walker, the size), the 3D
// view as its tier's `tick` says too (every frame on the full tier, its sky, clouds, wind and fires alive), each at the
// rate the device keeps up with (`interval`, from how long a frame takes, a sixtieth of a second at best), and asks the
// chat for walkers' places a few times a second more for a viewer whose connection and device can take it (`hz`: 2, 4
// or 6). Full screen (`fullscreen`, Ooga Chat's) moves the
// view into a layer filling the tab's window, the chat's panel beside it (or under it on a tall narrow screen).
// Its fold button (`fold`, stood in the chat's title by the page; `onFold`, `folded`) folds the
// view away, this browser's choice (localStorage `ooga-island-view-folded`): nothing drawn and no places asked for until
// it is opened again. Who walks there and who sits on the clouds is a line for screen readers (`.iv-note`). Reads nothing at load but window.BL.
// `create({ picture, faceOf(row), loadLive(), liveAllowed(), scenery, fullscreen, level(id, self) })` (`level` a speaker's voice level, 0 to 1, for the plates' microphones) returns `{ node, stage, update({
// place, rows, talking, speaking, self, active }), walk(msg), looks(msg), clouds(msg), hz, mode, dispose() }`: `place` whether the chat has an
// island to show, `rows` the chat's roster rows (the walkers are those with `walking`), `talking` the ids heard
// speaking and `speaking` the visitor's own meter, `self` the visitor's id, `active` whether the strip can be seen now.
// `looks` takes a `looks` frame (audience.js): how each walker looks, which the 3D view dresses their Ooga in; `clouds`
// a `clouds` frame: who sits on which of the copy's clouds, and the chat's clock (`at`), which the 3D view moves the
// clouds by. `parseWalk(msg, walks, now)`, `parseClouds(msg)` and `project(view, x, y, z, out)` are pure.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const MAX = 32, FACE = 26, RING = "#22c55e", PULSE_HZ = 2.2;
  // The 3D view's nameplates, as the island draws other players' (remote-players.js `drawNames`): the name in bold mono
  // with a dark edge, the dot before it (green walking the chat's island, purple on a cloud) and the voice mark after it.
  const NAME_SIZE = 13, NAME_LINE = NAME_SIZE * 1.3, NAME_SPACING = "0.39px", NAME_PAD_X = 5, NAME_PAD_Y = 3, NAME_BOTTOM = 2;
  const DOT_D = 8, DOT_GAP = 6, ICON_GAP = 4, PLATE_EDGE = 4, CLOUD_DOT = "#b18aff", PLATE_REF = 600, PLATE_MIN = 0.5;
  const NAME_STROKE = "rgba(20, 14, 8, 0.85)", NAME_FILL = "#f3efe4", ICON_IDLE = "#a6a6a2", ICON_SPEAKING = "#22c55e", ICON_MUTED = "#e5533d";
  // The voice mark's size on a plate, its microphone's square in CSS pixels at full size.
  const MIC = 12;
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

  // One `clouds` frame (`{ type: "clouds", at, clouds: [{ id, character, seat }, …] }`, audience.js): the speakers on
  // the copy's clouds, each with the Ooga they sit as and their seat (main-cloud-1 to 32), or null for anything that is
  // not one.
  const CLOUD_ID = /^(gh|x):[1-9][0-9]{0,19}$/, CHARACTER = /^[a-z0-9][a-z0-9._/-]{0,99}$/i, SEAT = /^main-cloud-([1-9]|[12][0-9]|3[0-2])$/;
  const parseClouds = (msg) => {
    if (!msg || msg.type !== "clouds" || !Number.isFinite(msg.at) || !Array.isArray(msg.clouds) || msg.clouds.length > MAX) return null;
    const out = [];
    for (const c of msg.clouds) {
      if (!c || typeof c !== "object" || typeof c.id !== "string" || !CLOUD_ID.test(c.id) || typeof c.character !== "string" || !CHARACTER.test(c.character)
        || typeof c.seat !== "string" || !SEAT.test(c.seat)) return null;
      out.push({ id: c.id, character: c.character, seat: c.seat });
    }
    return { at: msg.at, clouds: out };
  };
  // Every island view on the page, for the checks (`BL.islandView.open`).
  const open = new Set();
  // Whether this device can carry the 3D view: WebGL2, and nothing that says it is short of memory, cores or data.
  let capableAnswer = null;
  const capable = () => {
    if (capableAnswer !== null) return capableAnswer;
    const n = navigator, c = n.connection;
    // A connection the browser reports as slow (2G or 3G) keeps the map: even the 3D view's ground is near a megabyte.
    const saving = !!(c && (c.saveData || /(^|-)2g$|^3g$/.test(c.effectiveType || ""))) || typeof matchMedia === "function" && matchMedia("(prefers-reduced-data: reduce)").matches;
    capableAnswer = !saving && !(n.deviceMemory < 4) && !(n.hardwareConcurrency < 4) && typeof DecompressionStream === "function";
    // Last, only for a device that passed the rest: WebGL2, on a throwaway context given back at once.
    if (capableAnswer) {
      try { const probe = document.createElement("canvas").getContext("webgl2"); capableAnswer = !!probe; probe?.getExtension("WEBGL_lose_context")?.loseContext(); } catch { capableAnswer = false; }
    }
    return capableAnswer;
  };
  // A frame's cost, eased, sets the least time between frames: never under a sixtieth of a second, never over a sixth.
  const FRAME_MIN = 1000 / 60, FRAME_MAX = 1000 / 6;
  // The full screen button's marks: corners out (to enter) and in (to leave).
  const FULL_IN = "M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4", FULL_OUT = "M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4";
  // The fold button's mark, a framed island (a picture's frame over hills), lit while the view is open. Folded is this
  // browser's choice.
  const FOLD_MARK = "M1.5 3h13v10h-13zM2 12l4-4.5 3 3 2-2 3.5 3.5", FOLD_KEY = "ooga-island-view-folded";
  const foldedSaved = () => { try { return localStorage.getItem(FOLD_KEY) === "1"; } catch { return false; } };
  const create = ({ picture, faceOf, loadLive = null, liveAllowed = () => true, scenery = "art", fullscreen = false, onFold = null, level = null }) => {
    const view = BL.islandViewData.main, state = walks();
    // The picture's sea past the inner 4:3 the matrix maps to, each side (scripts/island-view.mjs `PAD`).
    const PAD_X = view.pad ? view.pad[0] : 0, PAD_Y = view.pad ? view.pad[1] : 0;
    const node = document.createElement("div"), stage = document.createElement("div"), map = document.createElement("canvas");
    const reset = document.createElement("button"), full = document.createElement("button"), note = document.createElement("p");
    node.className = "iv";
    stage.className = "iv-stage";
    map.className = "iv-map";
    map.setAttribute("role", "img");
    reset.type = full.type = "button";
    reset.className = "iv-reset";
    reset.textContent = "Reset view";
    reset.hidden = true;
    full.className = "iv-full-button";
    full.hidden = !fullscreen;
    // The usual full screen marks: four corners pointing out to enter, in to leave; the words are its name.
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg"), mark = document.createElementNS("http://www.w3.org/2000/svg", "path");
    icon.setAttribute("viewBox", "0 0 16 16");
    icon.setAttribute("aria-hidden", "true");
    icon.append(mark);
    full.append(icon);
    note.className = "iv-note";
    note.setAttribute("aria-live", "polite");
    // Fold (`fold`, which the page stands where it likes: the chat's title): the view folds away and the roster takes its
    // place; nothing is drawn or asked for meanwhile. The line saying who is there is for screen readers alone.
    const fold = document.createElement("button");
    const foldIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg"), foldMark = document.createElementNS("http://www.w3.org/2000/svg", "path");
    fold.type = "button";
    fold.className = "iv-fold";
    foldIcon.setAttribute("viewBox", "0 0 16 16");
    foldIcon.setAttribute("aria-hidden", "true");
    foldMark.setAttribute("d", FOLD_MARK);
    foldIcon.append(foldMark);
    fold.append(foldIcon);
    let folded = foldedSaved();
    stage.append(map, reset, full);
    node.append(stage, note);
    const g = map.getContext("2d");
    const image = new Image();
    image.decoding = "async";
    let pictureAsked = false;
    // Past the picture where the strip is wider or taller still than its sea reaches: the picture's own sea edges
    // spread out and blurred, so the sea runs on to the strip's ends. Made once a size.
    const back = document.createElement("canvas"), bg = back.getContext("2d"), EDGE = 16;
    let backFor = "";
    const paintBack = () => {
      if (!image.complete || !image.naturalWidth || !map.width) return;
      const key = `${map.width}x${map.height}`;
      if (key === backFor) return;
      backFor = key;
      back.width = map.width; back.height = map.height;
      // The whole picture, its sea round the inner 4:3 included, where the frame draws it; only past its edges, on a
      // strip wider or taller still, its edges stretched and blurred.
      const pw = view.w + PAD_X * 2, ph = view.h + PAD_Y * 2, k = Math.min(back.width / view.w, back.height / view.h);
      const w = pw * k, h = ph * k, x = (back.width - view.w * k) / 2 - PAD_X * k, y = (back.height - view.h * k) / 2 - PAD_Y * k;
      bg.filter = "blur(10px)";
      if (x > 0) {
        bg.drawImage(image, 0, 0, EDGE, ph, -20, y, x + 40, h);
        bg.drawImage(image, pw - EDGE, 0, EDGE, ph, x + w - 20, y, x + 40, h);
      }
      if (y > 0) {
        bg.drawImage(image, 0, 0, pw, EDGE, x, -20, w, y + 40);
        bg.drawImage(image, 0, ph - EDGE, pw, EDGE, x, y + h - 20, w, y + 40);
      }
      bg.filter = "none";
    };
    image.addEventListener("load", () => { backFor = ""; paintBack(); paint(); changed(); });
    // A face a walker, made when their row first comes (or their picture changes): the picture and its initial.
    const faces = new Map();
    // A nameplate a speaker for the 3D view (`{ text, w, talking, muted }`, `w` measured once a name).
    const plates = new Map();
    let plateFont = "", plateBase = 0, plateN = 0;
    // The boxes laid out this frame (left, top, right, bottom), so a plate over another moves above it, or under it at
    // the top edge, as remote-players.js `stack` lays the island's.
    const platesAt = new Float64Array((MAX * 2) * 4);
    const stackPlate = (left, top, boxW, boxH) => {
      for (let again = true, tries = 0, down = false; again && tries < 8; tries++) {
        again = false;
        for (let i = 0; i < plateN; i++) {
          const o = i * 4;
          if (!(left < platesAt[o + 2] && left + boxW > platesAt[o] && top < platesAt[o + 3] && top + boxH > platesAt[o + 1])) continue;
          if (!down && platesAt[o + 1] - boxH - 2 < PLATE_EDGE) down = true;
          top = Math.round(down ? platesAt[o + 3] + 2 : platesAt[o + 1] - boxH - 2);
          again = true;
        }
      }
      top = Math.max(PLATE_EDGE, Math.min(Math.max(PLATE_EDGE, height - boxH - PLATE_EDGE), top));
      if (plateN < MAX * 2) { const o = plateN++ * 4; platesAt[o] = left; platesAt[o + 1] = top; platesAt[o + 2] = left + boxW; platesAt[o + 3] = top + boxH; }
      return top;
    };
    // The plates' size follows the view's (`PLATE_REF`, the square root of its area at which they stand full size, never
    // larger), down to half that on the smallest strip: the name, its dot, the gaps and the voice mark all alike.
    // `plateK` is that share, in steps of a twentieth so the font is made again only when it moves.
    let plateK = 0, mono = "", fontAt = "", spacingAt = "";
    // One plate standing on a head's top (x its middle, `top` its highest point, CSS pixels), kept inside the canvas.
    const drawPlate = (p, x, top, dot) => {
      // A name is measured once, at full size (measureText allocates), and drawn at the view's share of it.
      if (p.w < 0) {
        g.font = plateFont; g.letterSpacing = NAME_SPACING;
        p.w = g.measureText(p.text).width;
        g.font = fontAt; g.letterSpacing = spacingAt;
      }
      const k = plateK, w = p.w * k, padX = NAME_PAD_X * k, padY = NAME_PAD_Y * k, line = NAME_LINE * k, dotD = DOT_D * k;
      const boxW = Math.round(padX * 2 + dotD + DOT_GAP * k + w), boxH = Math.round(padY * 2 + line);
      const left = Math.round(Math.max(PLATE_EDGE, Math.min(width - boxW - PLATE_EDGE, x - boxW / 2)));
      const row = stackPlate(left, Math.round(Math.max(PLATE_EDGE, top - NAME_BOTTOM * k - boxH)), boxW, boxH) + padY, mid = row + line / 2;
      const textX = left + padX + dotD + DOT_GAP * k;
      g.strokeStyle = NAME_STROKE; g.fillStyle = NAME_FILL; g.lineWidth = 3 * k;
      g.strokeText(p.text, textX, row + plateBase * k);
      g.fillText(p.text, textX, row + plateBase * k);
      p.dotX = left + padX + dotD / 2; p.dotY = mid;
      g.beginPath(); g.arc(p.dotX, mid, dotD / 2, 0, Math.PI * 2);
      g.lineWidth = 1.5 * k; g.stroke(); g.fillStyle = dot; g.fill();
      // The voice mark, the roster's microphone (native-icons.js `drawMic`), filled with the speaker's level while talking.
      const size = MIC * k, lv = p.talking && !p.muted ? level ? level(p.id, p.self) : 1 : 0;
      BL.nativeIcons.drawMic(g, textX + w + ICON_GAP * k, mid - size / 2, size, p.muted ? ICON_MUTED : p.talking ? ICON_SPEAKING : ICON_IDLE, p.muted, lv, NAME_STROKE);
    };
    const drawPlates = () => {
      if (!mono) {
        mono = getComputedStyle(document.documentElement).getPropertyValue("--mono").trim() || "ui-monospace, monospace";
        plateFont = `bold ${NAME_SIZE}px ${mono}`;
        g.font = plateFont;
        const m = g.measureText("Mg");
        plateBase = (NAME_LINE - m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2 + m.fontBoundingBoxAscent;
      }
      const k = Math.round(Math.max(PLATE_MIN, Math.min(1, Math.sqrt(width * height) / PLATE_REF)) * 20) / 20;
      if (k !== plateK) { plateK = k; fontAt = `bold ${NAME_SIZE * k}px ${mono}`; spacingAt = `${Math.round(39 * k) / 100}px`; }
      plateN = 0;
      g.font = fontAt; g.letterSpacing = spacingAt; g.textAlign = "left"; g.textBaseline = "alphabetic"; g.lineJoin = "round";
      for (let i = 0; i < live.perches; i++) {
        const id = live.perchHead(i, P), p = id && plates.get(id);
        if (p) drawPlate(p, P.x, P.y, CLOUD_DOT);
      }
      for (let i = 0; i < MAX; i++) {
        const id = state.ids[i], p = id !== null && plates.get(id);
        if (p && live.walkerHead(i, P)) drawPlate(p, P.x, P.y, RING);
      }
      g.letterSpacing = "0px";
    };
    // Each walker's Ooga for the 3D view: the character the chat names for them, else their login (hashed, as the island does).
    const names = new Map();
    // And how each looks, as the chat last said (`looks`): an entry a walker, kept whole until the next frame.
    let looked = new Map();
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
    // `mode`: "flat" (the picture), "loading" (the picture while the 3D view comes), "3d", or "flat" again if it failed.
    // Asked again on every update, so a viewer who stops being allowed it (signing out) goes back to the picture.
    const wants3d = () => !!loadLive && liveAllowed() && capable();
    let rows = [], walking = 0, shown = false, active = false, raf = 0, live = null, mode = "flat", tier = "", hz = 2, width = 0, height = 0, dpr = 1;
    let last = 0, cost = FRAME_MIN, dirty = true, timer = 0;
    // The speakers on the copy's clouds (`clouds`), and the chat's clock less this page's (ms): the latest frames' best
    // guess, the largest, since a frame's time on the way only makes the chat's clock look behind.
    let perched = [], offset = 0, offsetKnown = false;
    const changed = () => { dirty = true; if (shown && active) draw(); };
    // The canvas follows the strip's size, read only when the strip changes size or shows (never in a frame, where
    // reading it would allocate).
    const resize = () => {
      const w = map.clientWidth, h = map.clientHeight, d = Math.min(2, window.devicePixelRatio || 1);
      if (w === width && h === height && d === dpr) return;
      width = w; height = h; dpr = d;
      map.width = Math.max(1, Math.round(width * dpr));
      map.height = Math.max(1, Math.round(height * dpr));
      live?.resize();
      dirty = true;
    };
    const sizes = typeof ResizeObserver === "function" ? new ResizeObserver(() => { resize(); if (shown && active) draw(); }) : null;
    sizes?.observe(stage);
    const P = { x: 0, y: 0 };
    let fit = 1, offX = 0, offY = 0, fontR = 0, font = "";
    // One frame: the 3D view (or the picture), then each walker's face, eased to where it is. Drawn again while a walker
    // moves, the camera is turned or the size changed; at most once every `interval`, the frame's own cost eased in.
    // Until there is something to show (the 3D view this device takes, or else the map's picture), the stage stands
    // dark with a loading ring (chat-hosts.css `[data-wait]`) and nothing is drawn: never the map flashing up first.
    const waiting = () => !live && mode !== "failed" && (mode === "loading" || wants3d() || !(image.complete && image.naturalWidth));
    const frame = (now) => {
      raf = 0;
      if (!shown || !active) return;
      if (waiting()) { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, width, height); dirty = false; return; }
      const moving = state.count > 0, lively = !!live && live.tick < 1000;
      if (!dirty && !moving && !lively && !(live && live.moved)) return;
      const interval = Math.min(FRAME_MAX, Math.max(FRAME_MIN, cost * 1.5, lively ? live.tick : 0));
      if (now - last < interval - 1) { raf = requestAnimationFrame(frame); return; }
      last = now;
      dirty = false;
      const started = performance.now();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, width, height);
      if (live) {
        for (let i = 0; i < MAX; i++) {
          if (state.ids[i] === null) { live.place(i, 0, 0, 0, 0, false); continue; }
          placeOf(state, i, now, NOW);
          live.place(i, NOW.x, NOW.y, NOW.z, NOW.yaw, true, names.get(state.ids[i]) || "", looked.get(state.ids[i]) || null);
        }
        live.render();
      } else {
        fit = Math.min(width / view.w, height / view.h);
        offX = (width - view.w * fit) / 2; offY = (height - view.h * fit) / 2;
        paintBack();
        if (backFor) g.drawImage(back, 0, 0, width, height);
        if (image.complete && image.naturalWidth) g.drawImage(image, offX - PAD_X * fit, offY - PAD_Y * fit, (view.w + PAD_X * 2) * fit, (view.h + PAD_Y * 2) * fit);
      }
      const r = Math.max(9, Math.min(FACE, width / 22)) / 2, beat = 0.5 + 0.5 * Math.sin(now / 1000 * Math.PI * 2 * PULSE_HZ);
      // Over the 3D view each speaker's name stands over their Ooga's head; the map carries their faces.
      if (live) drawPlates();
      else for (let i = 0; i < MAX; i++) {
        const id = state.ids[i];
        if (id === null) continue;
        const f = faces.get(id);
        if (!f) continue;
        placeOf(state, i, now, NOW);
        project(view, NOW.x, NOW.y, NOW.z, P);
        const x = offX + P.x * fit, y = offY + P.y * fit;
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
      cost = cost * 0.8 + (performance.now() - started) * 0.2;
      // Walkers and a lively 3D view keep it drawing; a still island waits for the next change, or the 3D view's tick.
      if (moving || dirty || lively || live && live.moved) raf = requestAnimationFrame(frame);
      else if (live) { clearTimeout(timer); timer = setTimeout(() => { timer = 0; changed(); }, live.tick); }
    };
    const draw = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; clearTimeout(timer); timer = 0; };
    // The 3D view: its code and the scenery fetched once, for a device that can carry it; the picture shows meanwhile.
    // A renderer's dispose gives its context up for good, so a canvas is never reused.
    let glCanvas = null, liveTry = 0;
    const startLive = () => {
      if (!wants3d() || live || mode === "loading" || mode === "failed" || !shown) return;
      mode = "loading";
      paint();
      const mine = ++liveTry;
      Promise.resolve(loadLive()).then(() => BL.islandViewLive.prepare(scenery)).then((baked) => {
        if (mine !== liveTry || !shown) { mode = "flat"; return paint(); }
        glCanvas = document.createElement("canvas");
        glCanvas.className = "iv-gl";
        stage.prepend(glCanvas);
        tier = baked.tier;
        hz = tier === "full" ? 6 : tier === "lite" ? 4 : 2;
        live = BL.islandViewLive.create(glCanvas, { scenery: baked, data: view, tier, quality: tier === "full" ? "high" : tier === "lite" ? "medium" : "low" });
        live.offset = offset;
        live.seat(perched);
        mode = "3d";
        cost = FRAME_MIN;
        paint();
        changed();
      }).catch(() => {
        if (mine !== liveTry) return;
        mode = "failed";
        paint();
        changed();
      });
    };
    const endLive = () => {
      liveTry++;
      if (live) { live.dispose(); live = null; }
      if (glCanvas) { glCanvas.remove(); glCanvas = null; }
      if (mode !== "failed") mode = "flat";
      tier = "";
      hz = 2;
    };
    // --- turning, panning and zooming the 3D view ---
    const pointers = new Map();
    let pinch = 0, panning = false;
    const spread = () => { const [a, b] = pointers.values(); return Math.hypot(a.x - b.x, a.y - b.y); };
    const middle = (out) => { let x = 0, y = 0; for (const p of pointers.values()) { x += p.x; y += p.y; } out.x = x / pointers.size; out.y = y / pointers.size; return out; };
    const MID = { x: 0, y: 0 }, WAS = { x: 0, y: 0 };
    stage.addEventListener("pointerdown", (e) => {
      if (!live || e.target !== glCanvas && e.target !== map) return;
      stage.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      panning = e.button === 2 || e.shiftKey;
      if (pointers.size === 2) { pinch = spread(); middle(WAS); }
      e.preventDefault();
    });
    stage.addEventListener("pointermove", (e) => {
      const p = pointers.get(e.pointerId);
      if (!p || !live) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y, w = Math.max(1, width);
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 2) {
        const now = spread();
        if (pinch > 0 && now > 0) live.zoom(pinch / now);
        pinch = now;
        middle(MID);
        live.pan((MID.x - WAS.x) / w, (MID.y - WAS.y) / w);
        WAS.x = MID.x; WAS.y = MID.y;
      } else if (panning) live.pan(dx / w, dy / w);
      else live.orbit(dx / w * Math.PI, dy / w * Math.PI * 0.6);
      reset.hidden = live.atHome;
      changed();
    });
    const lift = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = 0; if (pointers.size === 0) panning = false; else middle(WAS); };
    stage.addEventListener("pointerup", lift);
    stage.addEventListener("pointercancel", lift);
    stage.addEventListener("contextmenu", (e) => { if (live) e.preventDefault(); });
    stage.addEventListener("wheel", (e) => {
      if (!live) return;
      e.preventDefault();
      live.zoom(Math.exp(Math.max(-1, Math.min(1, e.deltaY / 400))));
      reset.hidden = live.atHome;
      changed();
    }, { passive: false });
    reset.addEventListener("click", (e) => { if (e.detail) reset.blur(); live?.reset(); reset.hidden = true; changed(); });
    // --- full screen: the view over the page, the chat's panel beside it ---
    let isFull = false, marker = null, host = null;
    // Full screen's split (`--iv-split`, the view's share of a tall screen's height; `--iv-side`, the panel's width
    // beside it on a wide one), dragged by the handle on the line between them (a layer of its own over both, so it
    // stands on that line rather than inside the view) and kept for this browser
    // (localStorage `ooga-island-view-split`).
    const SPLIT_KEY = "ooga-island-view-split", tall = () => innerHeight > innerWidth;
    let split = { tall: 0.55, wide: 0 };
    try { const kept = JSON.parse(localStorage.getItem(SPLIT_KEY) || "null"); if (kept && typeof kept === "object") split = { tall: Number.isFinite(kept.tall) ? kept.tall : 0.55, wide: Number.isFinite(kept.wide) ? kept.wide : 0 }; } catch { /* the default */ }
    const applySplit = () => {
      const doc = document.documentElement.style;
      doc.setProperty("--iv-split", `${Math.round(split.tall * 1000) / 10}dvh`);
      // Held to the window as it is now, whatever size it was dragged on (and on every resize, being CSS's to work out).
      if (split.wide) doc.setProperty("--iv-side", `clamp(280px, ${Math.round(split.wide)}px, 70vw)`); else doc.removeProperty("--iv-side");
    };
    const handle = document.createElement("div");
    handle.className = "iv-split";
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-label", "Drag to resize the island view");
    handle.tabIndex = 0;
    let dragging = false;
    const dragTo = (x, y) => {
      if (tall()) split.tall = Math.max(0.25, Math.min(0.85, y / innerHeight));
      else split.wide = Math.max(280, Math.min(innerWidth * 0.7, innerWidth - x));
      applySplit();
    };
    // Its grabber (chat-hosts.css) shows for a few seconds each time full screen opens, so the split is found, then
    // fades, and comes back while it is touched or dragged.
    const HINT_MS = 2600;
    let hintTimer = 0;
    const hint = (on) => {
      clearTimeout(hintTimer);
      if (on) { handle.dataset.hint = ""; hintTimer = setTimeout(() => { delete handle.dataset.hint; }, HINT_MS); } else delete handle.dataset.hint;
    };
    handle.addEventListener("pointerdown", (e) => { dragging = true; handle.dataset.drag = ""; handle.setPointerCapture(e.pointerId); e.preventDefault(); });
    handle.addEventListener("pointermove", (e) => { if (dragging) dragTo(e.clientX, e.clientY); });
    const drop = () => {
      if (!dragging) return;
      dragging = false;
      delete handle.dataset.drag;
      try { localStorage.setItem(SPLIT_KEY, JSON.stringify(split)); } catch { /* kept for this page */ }
    };
    handle.addEventListener("pointerup", drop);
    handle.addEventListener("pointercancel", drop);
    // From the keyboard: the arrows move the split a twentieth at a time.
    handle.addEventListener("keydown", (e) => {
      const k = e.key, step = tall() ? innerHeight / 20 : innerWidth / 20;
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(k)) return;
      e.preventDefault();
      if (tall()) dragTo(0, split.tall * innerHeight + (k === "ArrowUp" || k === "ArrowLeft" ? -step : step));
      else dragTo(innerWidth - (split.wide ? Math.max(280, Math.min(innerWidth * 0.7, split.wide)) : Math.min(420, innerWidth * 0.42)) + (k === "ArrowLeft" || k === "ArrowUp" ? -step : step), 0);
      try { localStorage.setItem(SPLIT_KEY, JSON.stringify(split)); } catch { /* kept for this page */ }
    });
    const setFull = (on) => {
      if (on === isFull || !fullscreen) return;
      isFull = on;
      const doc = document.documentElement;
      if (on) {
        marker = document.createComment("island view");
        node.before(marker);
        host = document.createElement("div");
        host.className = "iv-full-host";
        document.body.append(host);
        host.append(node);
        document.body.append(handle);
        applySplit();
        hint(true);
        doc.classList.add("iv-full");
      } else {
        doc.classList.remove("iv-full");
        if (marker) { marker.replaceWith(node); marker = null; }
        host?.remove(); host = null;
        handle.remove();
        hint(false);
        dragging = false;
        delete handle.dataset.drag;
      }
      paint();
      resize();
      changed();
    };
    full.addEventListener("click", (e) => { if (e.detail) full.blur(); setFull(!isFull); });
    const onKey = (e) => { if (e.key === "Escape" && isFull && !e.defaultPrevented) setFull(false); };
    fold.addEventListener("click", (e) => {
      if (e.detail) fold.blur();
      folded = !folded;
      try { if (folded) localStorage.setItem(FOLD_KEY, "1"); else localStorage.removeItem(FOLD_KEY); } catch { /* kept for this page alone */ }
      if (folded) setFull(false);
      paint();
      // The page says again whether the view is seen (and asks for places or stops), which redraws it.
      if (onFold) onFold(folded); else changed();
    });
    document.addEventListener("keydown", onKey);
    const paint = () => {
      node.hidden = !shown;
      stage.hidden = folded;
      node.dataset.folded = String(folded);
      const fwords = folded ? "Show the island view" : "Hide the island view";
      if (fold.title !== fwords) { fold.title = fwords; fold.setAttribute("aria-label", fwords); }
      fold.setAttribute("aria-pressed", String(!folded));
      stage.dataset.live = mode === "3d" ? "on" : mode;
      if (waiting()) stage.dataset.wait = ""; else delete stage.dataset.wait;
      const words = isFull ? "Exit full screen" : "Full screen";
      if (full.title !== words) { full.title = words; full.setAttribute("aria-label", words); }
      mark.setAttribute("d", isFull ? FULL_OUT : FULL_IN);
      full.setAttribute("aria-pressed", String(isFull));
      const names = rows.filter((row) => row.walking).map((row) => row.display || row.login);
      // A speaker not walking the island sits on a cloud over it (the copy's clouds, docs/ooga-chat-hosts.md).
      const aloft = rows.filter((row) => row.role === "speaker" && !row.walking).map((row) => row.display || row.login);
      const walked = names.length === 1 ? `${names[0]} is walking the chat's island` : `${names.length} speakers are walking the chat's island`;
      const clouds = aloft.length === 1 ? `${aloft[0]} is on a cloud over the island` : `${aloft.length} speakers are on the clouds over the island`;
      const where = names.length && aloft.length ? `${walked} · ${aloft.length} on the clouds` : names.length ? walked : aloft.length ? clouds : "Waiting for the chat's speakers";
      map.setAttribute("aria-label", names.length ? `Map of the chat's island: ${names.join(", ")}` : "Map of the chat's island");
      const text = mode === "loading" ? `${where} · the 3D view is loading…` : where;
      if (note.textContent !== text) note.textContent = text;
    };
    const update = (next) => {
      rows = next.rows;
      const walkers = rows.filter((row) => row.walking);
      const show = !!next.place;
      walking = walkers.length;
      for (const row of walkers) {
        names.set(row.id, row.character || row.login || "");
        const f = faceFor(row);
        f.talking = row.id === next.self ? !!next.speaking : next.talking.includes(row.id);
      }
      for (const row of rows) {
        if (row.role !== "speaker") continue;
        const text = row.display || row.login || "";
        let p = plates.get(row.id);
        if (!p) plates.set(row.id, p = { id: row.id, self: false, text: "", w: -1, talking: false, muted: false, seen: 0, dotX: NaN, dotY: NaN });
        if (p.text !== text) { p.text = text; p.w = -1; }
        p.self = row.id === next.self;
        p.talking = p.self ? !!next.speaking : next.talking.includes(row.id);
        p.muted = !!row.muted;
        p.seen = rows;
      }
      for (const [id, p] of plates) if (p.seen !== rows) plates.delete(id);
      if (faces.size > walkers.length) for (const id of faces.keys()) if (!walkers.some((row) => row.id === id)) { faces.delete(id); names.delete(id); }
      if (show && !pictureAsked) { pictureAsked = true; image.src = picture; }
      const was = shown;
      shown = show;
      // Folded, nothing is drawn: the page stops asking for places too (it reads `folded`).
      active = !!next.active && !folded;
      if (!shown && was) { setFull(false); endLive(); }
      else if ((live || mode === "loading") && !liveAllowed()) { setFull(false); endLive(); }
      // Nobody walking (or the strip gone): the next walk starts afresh, its first frame placing every walker where they
      // stand, and no face is left behind from the last.
      if ((!shown || !walking) && state.count) {
        state.seq = state.at = state.count = 0;
        for (let i = 0; i < MAX; i++) state.ids[i] = null;
        state.index.clear();
      }
      paint();
      if (shown && active) { resize(); startLive(); changed(); } else stop();
    };
    const walk = (msg) => { const took = parseWalk(msg, state, performance.now()); if (took && shown && active) draw(); return took; };
    // A `looks` frame (`{ type: "looks", looks: { "gh:<id>": { e, w, j } } }`): each entry checked by the 3D view as it
    // dresses an Ooga (island-view-live.js `dress`), the frame only for its shape here.
    const looks = (msg) => {
      const all = msg && msg.looks;
      if (!all || typeof all !== "object" || Array.isArray(all)) return false;
      const next = new Map();
      for (const [id, look] of Object.entries(all)) if (ID.test(id) && look && typeof look === "object" && !Array.isArray(look) && next.size < MAX) next.set(id, look);
      looked = next;
      changed();
      return true;
    };
    // A `clouds` frame: who sits where, and the chat's clock for the clouds' places.
    const clouds = (msg) => {
      const read = parseClouds(msg);
      if (!read) return false;
      const guess = read.at - Date.now();
      offset = offsetKnown ? Math.max(offset, guess) : guess;
      offsetKnown = true;
      perched = read.clouds;
      if (live) { live.offset = offset; live.seat(perched); }
      changed();
      return true;
    };
    // Where each walker's face stands on the strip now (in 3D, their nameplate's dot), in CSS pixels (the checks', made
    // on call).
    const placed = () => {
      const now = performance.now(), out = [];
      for (let i = 0; i < MAX; i++) {
        if (state.ids[i] === null) continue;
        placeOf(state, i, now, NOW);
        // Over the 3D view, where the walker's nameplate put its dot when last drawn.
        if (live) { const p = plates.get(state.ids[i]); if (p && p.dotX === p.dotX) out.push({ id: state.ids[i], x: p.dotX, y: p.dotY, world: { ...NOW } }); continue; }
        project(view, NOW.x, NOW.y, NOW.z, P);
        out.push({ id: state.ids[i], x: offX + P.x * fit, y: offY + P.y * fit, world: { ...NOW } });
      }
      return out;
    };
    const self = { node, stage, fold, update, walk, looks, clouds, placed, get folded() { return folded; }, get perched() { return perched; },
      dispose() {
        setFull(false); shown = active = false; stop(); endLive(); sizes?.disconnect(); faces.clear(); plates.clear();
        document.removeEventListener("keydown", onKey);
        node.remove(); open.delete(self);
      },
      // The walkers' places a second this view asks the chat for: more for a viewer whose tier says they can take it.
      get hz() { return live ? hz : 2; },
      get mode() { return mode; }, get tier() { return tier; }, get full() { return isFull; }, get live() { return live; },
      get walks() { return state; }, get drawing() { return !!raf; }, get interval() { return Math.min(FRAME_MAX, Math.max(FRAME_MIN, cost * 1.5, live && live.tick < 1000 ? live.tick : 0)); } };
    open.add(self);
    return self;
  };
  BL.islandView = { create, parseWalk, parseClouds, project, walks, placeOf, capable, MAX, open };
})();
