// The EntropyLab chalkboard keeps one bounded list of marks for its close-up and its world-space writing. Every
// edit goes through chalk-board.js `apply`: on the visitor's own board, kept in this browser, or, signed in to a room
// that shares it, on the room's board (net.js `state.chalk`), which the page edits only while it holds it.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const C = BL.chalkBoard;
  // v3 holds the board as it is now; v2 held the smaller first board (widened as it loads), and v1 only the marks
  // drawn over the original message.
  const KEY = "ooga-chalkboard-v3", SMALL_KEY = "ooga-chalkboard-v2", OLD_KEY = "ooga-chalkboard-v1", MAX_STROKES = C.MAX_MARKS, MAX_POINTS = C.MAX_POINTS;
  // The face in the dressing kit's chalkboard, in its own metres: 36 by 21 cells of a sixteenth over its foot.
  const W = 1200, H = 750, BOARD_W = 2.25, BOARD_H = 1.3125, BOARD_Y = 0.5625, BOARD_FACE_Z = -1 / 16 + 0.002;
  const GRID_W = 240, GRID_H = 150, WASH_MS = 650, DRAW_MS = 700, WASH_BANDS = 6, WORLD_UPDATE_MS = 100;
  const TEXT_FONT = "58.125px 'Bradley Hand', 'Marker Felt', cursive", TEXT_SIZE = 60, TEXT_LINE = 84.375, TEXT_MARGIN = 32;
  // The eraser's footprint in canvas pixels: a long block about 2.2 times as long as it is wide, held sideways (an
  // eraser line's `f` 1) or upright (`f` 2). Sideways a tap spans about two typed characters (pitch about 31); upright it
  // is as wide as one. Either way it is narrower than the pitch of the message's drawn digits (60).
  const ERASER_LONG = 58, ERASER_SHORT = 26, SMUDGE_TURNS = 8, SMUDGE_TILE = 256;
  const clamp = (v) => Math.max(0, Math.min(1, v));
  // Where the footprint's corner lands for a point on the board, on whole pixels so its edges are clean. The drawn
  // cursor and the painted sweep both come from these.
  const eraserW = (f) => f === 2 ? ERASER_SHORT : ERASER_LONG, eraserH = (f) => f === 2 ? ERASER_LONG : ERASER_SHORT;
  const eraserLeft = (x, f) => Math.round(x * W - eraserW(f) / 2), eraserTop = (y, f) => Math.round(y * H - eraserH(f) / 2);
  const read = (key) => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved) || saved.length > MAX_STROKES) return null;
      let points = 0;
      return saved.filter((mark) => {
        if (!mark || !Array.isArray(mark.p)) return false;
        if (mark.t === "t") {
          if (typeof mark.ch !== "string" || Array.from(mark.ch).length !== 1 || /[\x00-\x1f\x7f]/.test(mark.ch) || mark.p.length !== 2) return false;
        } else if ((mark.t !== "c" && mark.t !== "e") || (mark.s !== undefined && mark.s !== 2 && mark.s !== 4)
          || (mark.f !== undefined && ((mark.f !== 1 && mark.f !== 2) || mark.t !== "e")) || mark.p.length < 2 || mark.p.length % 2 || mark.p.length > 2000) return false;
        points += mark.p.length / 2;
        return points <= MAX_POINTS && mark.p.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1);
      });
    } catch (_) { return null; }
  };
  const write = (marks) => {
    try { localStorage.setItem(KEY, JSON.stringify(marks)); } catch (_) { /* Storage may be unavailable. */ }
  };
  const geometryFor = (ctx, previous = null) => {
    const geo = previous || { verts: [], faces: [], lines: [], castShadow: false };
    if (!geo.imageSurface) {
      const pad = 0.006, left = -BOARD_W / 2 + pad, top = BOARD_Y + BOARD_H - pad;
      const width = BOARD_W - pad * 2, height = BOARD_H - pad * 2;
      geo.verts.push(left, top - height, BOARD_FACE_Z, left + width, top - height, BOARD_FACE_Z,
        left + width, top, BOARD_FACE_Z, left, top, BOARD_FACE_Z);
      geo.faces.push({ i: [0, 1, 2, 3], color: [255, 255, 255], emissive: 0.35 });
      const canvas = document.createElement("canvas");
      canvas.width = GRID_W; canvas.height = GRID_H;
      const context = canvas.getContext("2d", { alpha: false });
      geo.imageSurface = { canvas, context, image: context.createImageData(GRID_W, GRID_H),
        version: 0, rect: [left, top - height, width, height], background: null, tessellated: false };
    }
    // This authored transform needs the finished popup pixels: each 5x5 box uses its exact RGB mean and
    // maximum brightness, including translucent chalk and erasures. Read back only when edits flush,
    // keeping the raster, quad and GPU buffers for the whole board visit.
    const pixels = ctx.getImageData(0, 0, W, H).data;
    const surface = geo.imageSurface, target = surface.image.data, tileW = W / GRID_W, tileH = H / GRID_H;
    for (let row = 0; row < GRID_H; row++) for (let col = 0; col < GRID_W; col++) {
      let red = 0, green = 0, blue = 0, bright = 0;
      for (let dy = 0; dy < tileH; dy++) for (let dx = 0; dx < tileW; dx++) {
        const at = ((row * tileH + dy) * W + col * tileW + dx) * 4;
        red += pixels[at]; green += pixels[at + 1]; blue += pixels[at + 2];
        bright = Math.max(bright, pixels[at], pixels[at + 1], pixels[at + 2]);
      }
      const count = tileW * tileH, gain = bright > 170 ? 1.55 : 1, at = (row * GRID_W + col) * 4;
      target[at] = Math.min(255, Math.round(red / count * gain / 8) * 8);
      target[at + 1] = Math.min(255, Math.round(green / count * gain / 8) * 8);
      target[at + 2] = Math.min(255, Math.round(blue / count * gain / 8) * 8);
      target[at + 3] = 255;
    }
    surface.context.putImageData(surface.image, 0, 0);
    surface.version++;
    return geo;
  };
  const create = ({ renderer, onOpen, onClose, onRefused }) => {
    const dialog = document.getElementById("chalk-modal"), frame = document.getElementById("chalk-frame");
    const canvas = document.getElementById("chalk-canvas"), ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    const pointer = document.getElementById("chalk-pointer"), held = document.getElementById("chalk-held"), caret = document.getElementById("chalk-caret"), typeInput = document.getElementById("chalk-type-input"), hint = document.getElementById("chalk-hint");
    const eraser = document.getElementById("chalk-eraser"), chalk = document.getElementById("chalk-chalk");
    const keyboard = document.getElementById("chalk-keyboard"), clean = document.getElementById("chalk-clean"), reset = document.getElementById("chalk-reset");
    const closeButton = document.getElementById("chalk-close");
    let listeners = new AbortController();
    const bindings = [];
    const on = (target, type, fn, options) => {
      const opts = { ...options }; delete opts.signal;
      bindings.push([target, type, fn, opts]);
      target.addEventListener(type, fn, { ...opts, signal: listeners.signal });
    };
    const net = BL.net, startingMarks = C.initial(), saved = read(KEY);
    const small = saved === null ? read(SMALL_KEY) : null, legacy = saved === null && small === null ? read(OLD_KEY) : null;
    const local = C.board(saved !== null ? saved : small !== null ? C.widen(small)
      : legacy !== null ? startingMarks.concat(C.widen(legacy)) : startingMarks.slice());
    let localSession = C.session(local);
    const shared = () => net && net.state.chalk;
    const holding = () => { const c = shared(); return !!c && !!c.editor && c.editor === net.state.selfId; };
    const board = () => { const c = shared(); return c ? c.board : local; };
    const lastMark = () => { const marks = board().marks; return marks[marks.length - 1]; };
    const edit = (op) => shared() ? net.chalkEdit(op) : C.apply(local, op, localSession);
    const startingSegments = startingMarks.reduce((n, mark) => n + mark.p.length / 2 - 1, 0);
    // A stroke being drawn: its tool, its last point in thousandths, and whether its line has begun.
    let node = null, tool = null, stroke = null, pending = false, pendingFocal = null, unheard = null;
    let turn = 1, lastMove = null;
    let changed = false, activePointer = -1, animation = null, liveTimer = 0, worldDirty = false;
    let cursorX = TEXT_MARGIN, cursorY = TEXT_MARGIN + TEXT_SIZE, textStartX = TEXT_MARGIN;
    const typeHistory = [];
    const coords = (e) => {
      const r = canvas.getBoundingClientRect();
      return [clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)];
    };
    // What a felt eraser leaves, one repeating tile pair for each of SMUDGE_TURNS drag directions, drawn the first time
    // it is needed and from a fixed seed, so every page draws the same. `floor` is the dusty haze and streaks; `ceiling`
    // is the floor with thin broken dashes on top.
    const smudges = [];
    const smudgeFor = (turn) => {
      if (smudges[turn]) return smudges[turn];
      let seed = turn * 2654435761 + 12345 | 0;
      const random = () => { seed = Math.imul(seed ^ seed >>> 15, 0x2c1b3c6d) + 0x9e3779b9 | 0; return ((seed ^ seed >>> 13) >>> 0) / 4294967296; };
      const tile = () => {
        const c = document.createElement("canvas");
        c.width = c.height = SMUDGE_TILE;
        return [c, c.getContext("2d", { alpha: false, willReadFrequently: true })];
      };
      const along = turn * Math.PI / SMUDGE_TURNS, ux = Math.cos(along), uy = Math.sin(along);
      // A line along the drag, drawn again a tile away each way so the tile repeats without a seam.
      const streak = (t, length, width, style) => {
        const x = random() * SMUDGE_TILE, y = random() * SMUDGE_TILE;
        t.lineCap = "round"; t.lineWidth = width; t.strokeStyle = style;
        for (let ox = -SMUDGE_TILE; ox <= SMUDGE_TILE; ox += SMUDGE_TILE) for (let oy = -SMUDGE_TILE; oy <= SMUDGE_TILE; oy += SMUDGE_TILE) {
          t.beginPath(); t.moveTo(x + ox, y + oy); t.lineTo(x + ox + ux * length, y + oy + uy * length); t.stroke();
        }
      };
      const [floorTile, floor] = tile(), [ceilingTile, ceiling] = tile();
      floor.fillStyle = "#21473a"; floor.fillRect(0, 0, SMUDGE_TILE, SMUDGE_TILE);
      for (let i = 0; i < 60; i++) streak(floor, 50 + random() * 150, 5 + random() * 12, `rgba(177,196,167,${0.02 + random() * 0.05})`);
      for (let i = 0; i < 40; i++) streak(floor, 50 + random() * 150, 4 + random() * 10, `rgba(27,64,52,${0.25 + random() * 0.35})`);
      for (let i = 0; i < 80; i++) streak(floor, 30 + random() * 120, 1 + random() * 1.5, `rgba(186,204,176,${0.04 + random() * 0.08})`);
      for (let i = 0; i < 40; i++) streak(floor, 30 + random() * 110, 1 + random() * 2, `rgba(21,57,47,${0.12 + random() * 0.18})`);
      ceiling.drawImage(floorTile, 0, 0);
      for (let i = 0; i < 200; i++) streak(ceiling, 5 + random() * 18, 1, `rgba(226,236,212,${0.2 + random() * 0.2})`);
      return smudges[turn] = { floor: ctx.createPattern(floorTile, "repeat"), ceiling: ctx.createPattern(ceilingTile, "repeat") };
    };
    // One step of an eraser line (`f`): the footprint swept from point to point, the convex hull of its rectangle at
    // both ends, so it covers the same ground whichever way it travels and a tap covers one footprint. Inside it each
    // pixel is held between the smudge's floor and ceiling: everything goes to the haze, and chalk survives only in the
    // ceiling's dashes. Clamping twice changes nothing, so a slow drag and a quick one leave the same, and a repaint
    // matches. The streaks follow the last few points; a tap's direction comes from where it landed.
    const sweepSegment = (p, i, f) => {
      const ERASER_W = eraserW(f), ERASER_H = eraserH(f);
      const forward = eraserLeft(p[i - 2], f) <= eraserLeft(p[i], f), a = forward ? i - 2 : i, b = forward ? i : i - 2;
      const ax = eraserLeft(p[a], f), ay = eraserTop(p[a + 1], f), bx = eraserLeft(p[b], f), by = eraserTop(p[b + 1], f);
      const back = Math.max(0, i - 8), dx = (p[i] - p[back]) * W, dy = (p[i + 1] - p[back + 1]) * H;
      const turn = Math.hypot(dx, dy) < 1 ? (Math.round(p[i] * 1000) * 31 + Math.round(p[i + 1] * 1000) * 17) % SMUDGE_TURNS
        : Math.round(Math.atan2(dy, dx) / Math.PI * SMUDGE_TURNS) & SMUDGE_TURNS - 1;
      const smudge = smudgeFor(turn);
      ctx.beginPath(); ctx.moveTo(ax, ay);
      if (ay <= by) { ctx.lineTo(ax + ERASER_W, ay); ctx.lineTo(bx + ERASER_W, by); ctx.lineTo(bx + ERASER_W, by + ERASER_H); ctx.lineTo(bx, by + ERASER_H); ctx.lineTo(ax, ay + ERASER_H); }
      else { ctx.lineTo(bx, by); ctx.lineTo(bx + ERASER_W, by); ctx.lineTo(bx + ERASER_W, by + ERASER_H); ctx.lineTo(ax + ERASER_W, ay + ERASER_H); ctx.lineTo(ax, ay + ERASER_H); }
      ctx.closePath();
      ctx.globalCompositeOperation = "darken"; ctx.fillStyle = smudge.ceiling; ctx.fill();
      ctx.globalCompositeOperation = "lighten"; ctx.fillStyle = smudge.floor; ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    };
    // An eraser line stored before the footprint (no `f`) keeps its old wide band, so what it erased stays erased.
    const paintSegment = (mark, i) => {
      if (mark.t === "e" && mark.f) { sweepSegment(mark.p, i, mark.f); return; }
      const p = mark.p, size = mark.s || 1;
      ctx.lineCap = mark.t === "e" ? "butt" : "round";
      ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(p[i - 2] * W, p[i - 1] * H); ctx.lineTo(p[i] * W, p[i + 1] * H);
      if (mark.t === "e") {
        ctx.lineWidth = 48 * size; ctx.strokeStyle = "rgba(27,65,52,0.9)"; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p[i - 2] * W + 3 * size, p[i - 1] * H + 2 * size); ctx.lineTo(p[i] * W + 3 * size, p[i + 1] * H + 2 * size);
        ctx.lineWidth = 32 * size; ctx.strokeStyle = "rgba(177,196,167,0.11)"; ctx.stroke();
      } else {
        ctx.lineWidth = 5.2 * size; ctx.strokeStyle = "rgba(237,244,220,0.88)"; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p[i - 2] * W + 1.2 * size, p[i - 1] * H + size); ctx.lineTo(p[i] * W + 1.2 * size, p[i + 1] * H + size);
        ctx.lineWidth = 2 * size; ctx.strokeStyle = "rgba(217,228,204,0.36)"; ctx.stroke();
      }
    };
    const paintText = (mark) => {
      const x = mark.p[0] * W, y = mark.p[1] * H;
      ctx.font = TEXT_FONT;
      ctx.textBaseline = "alphabetic";
      ctx.lineJoin = "round";
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = "rgba(214,229,203,0.55)";
      ctx.strokeText(mark.ch, x, y);
      ctx.fillStyle = "rgba(239,244,220,0.82)";
      ctx.fillText(mark.ch, x, y);
    };
    const paintBase = () => {
      ctx.fillStyle = "#1b4034"; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 2025; i++) {
        const x = (i * 1973 % (W - 3)), y = (i * 839 % (H - 1));
        ctx.fillStyle = i % 3 ? "#325549" : "#15392f";
        ctx.fillRect(x, y, 1 + i % 2, 1);
      }
    };
    const paint = () => {
      paintBase();
      for (const mark of board().marks) {
        if (mark.t === "t") paintText(mark);
        else for (let i = 2; i < mark.p.length; i += 2) paintSegment(mark, i);
      }
    };
    const syncWorld = () => {
      liveTimer = 0;
      if (holding()) net.flushChalk();
      if (!worldDirty || !node) return;
      geometryFor(ctx, node.geometry);
      worldDirty = false;
    };
    const markWorld = () => {
      worldDirty = true;
      if (!liveTimer) liveTimer = setTimeout(syncWorld, WORLD_UPDATE_MS);
    };
    const flushWorld = () => {
      if (liveTimer) clearTimeout(liveTimer);
      syncWorld();
    };
    const placeCaret = () => {
      caret.style.left = `${cursorX / W * 100}%`;
      caret.style.top = `${(cursorY - TEXT_SIZE) / H * 100}%`;
    };
    const newTextLine = () => {
      if (cursorY + TEXT_LINE > H - TEXT_MARGIN) { hint.textContent = "Bottom of board reached"; return false; }
      cursorX = textStartX;
      cursorY += TEXT_LINE;
      placeCaret();
      return true;
    };
    const typeText = (value) => {
      for (const ch of value.replace(/\r\n?/g, "\n").replace(/\t/g, "    ")) {
        if (ch === "\n") {
          const x = cursorX, y = cursorY;
          if (!newTextLine()) break;
          typeHistory.push({ x, y, mark: null });
          continue;
        }
        if (/[\x00-\x1f\x7f]/.test(ch)) continue;
        const b = board();
        if (b.marks.length >= MAX_STROKES || b.points >= MAX_POINTS) { hint.textContent = "Board is full"; break; }
        ctx.font = TEXT_FONT;
        const advance = Math.max(12, ctx.measureText(ch).width + 2);
        const x = cursorX, y = cursorY;
        if (cursorX + advance > W - TEXT_MARGIN && !newTextLine()) break;
        if (edit({ k: "type", c: [[ch, Math.round(cursorX / W * 1000), Math.round(cursorY / H * 1000)]] })) break;
        const mark = lastMark();
        typeHistory.push({ x, y, mark });
        paintText(mark);
        cursorX += advance;
        placeCaret();
        changed = true;
        markWorld();
      }
    };
    const backspaceText = () => {
      const previous = typeHistory.pop();
      if (!previous) return;
      cursorX = previous.x;
      cursorY = previous.y;
      placeCaret();
      if (!previous.mark || edit({ k: "back" })) return;
      paint();
      changed = true;
      markWorld();
    };
    const finishAnimation = () => {
      if (!animation) return;
      cancelAnimationFrame(animation.raf);
      const type = animation.type;
      animation = null;
      edit({ k: "wipe", to: type === "reset" ? "original" : "clean" });
      changed = true;
      clean.disabled = reset.disabled = eraser.disabled = chalk.disabled = keyboard.disabled = false;
      select("c");
      hint.textContent = type === "reset" ? "Original message restored" : "Board is clean";
      paint();
      markWorld();
      if (dialog.open) flushWorld();
    };
    const washFrame = (time) => {
      if (!animation) return;
      if (!animation.started) animation.started = time;
      const elapsed = time - animation.started, washMs = animation.wash ? WASH_MS : 0;
      if (elapsed < washMs) {
        paint();
        const wash = elapsed / WASH_MS;
        const position = wash * WASH_BANDS, band = Math.min(WASH_BANDS - 1, Math.floor(position));
        const fraction = position - band, bandH = H / WASH_BANDS;
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, band * bandH); ctx.clip(); paintBase(); ctx.restore();
        const rightward = band % 2 === 0, edge = (rightward ? fraction : 1 - fraction) * W;
        ctx.save(); ctx.beginPath(); ctx.rect(rightward ? 0 : edge, band * bandH, rightward ? edge : W - edge, bandH);
        ctx.clip(); paintBase(); ctx.restore();
        ctx.save(); ctx.translate(edge, (band + 0.5) * bandH); ctx.rotate(rightward ? -0.12 : 0.12);
        ctx.fillStyle = "#b8bc9a"; ctx.fillRect(-37, -25, 74, 50);
        ctx.fillStyle = "#d9dcc1"; ctx.fillRect(-31, -21, 62, 9);
        ctx.strokeStyle = "#777c66"; ctx.lineWidth = 4; ctx.strokeRect(-37, -25, 74, 50);
        ctx.restore();
      } else if (animation.type === "reset" && elapsed < washMs + DRAW_MS) {
        paintBase();
        let segments = Math.floor((elapsed - washMs) / DRAW_MS * startingSegments);
        for (const mark of startingMarks) for (let i = 2; i < mark.p.length && segments > 0; i += 2, segments--) paintSegment(mark, i);
      } else { finishAnimation(); return; }
      markWorld();
      animation.raf = requestAnimationFrame(washFrame);
    };
    const startAnimation = (type) => {
      if (animation) finishAnimation();
      if (stroke) return;
      select(null);
      pointer.classList.remove("visible");
      const wash = type === "clean" || board().marks.length > 0;
      clean.disabled = reset.disabled = eraser.disabled = chalk.disabled = keyboard.disabled = true;
      hint.textContent = type === "reset" ? wash ? "Washing, then rewriting…" : "Rewriting original message…" : "Washing the board…";
      animation = { type, wash, started: 0, raf: requestAnimationFrame(washFrame) };
    };
    const select = (next) => {
      tool = next;
      eraser.setAttribute("aria-pressed", String(tool === "e"));
      chalk.setAttribute("aria-pressed", String(tool === "c"));
      keyboard.setAttribute("aria-pressed", String(tool === "k"));
      pointer.classList.toggle("eraser", tool === "e");
      pointer.classList.toggle("upright", turn === 2);
      eraser.setAttribute("aria-label", tool === "e" ? `Eraser, held ${turn === 2 ? "upright" : "sideways"}. Click again or press R to turn it` : "Eraser");
      if (tool !== "e") held.style.width = held.style.height = "";
      frame.classList.toggle("has-tool", !!tool);
      frame.classList.toggle("typing", tool === "k");
      caret.hidden = tool !== "k";
      if (tool === "k") { pointer.classList.remove("visible"); placeCaret(); typeInput.focus({ preventScroll: true }); }
      else { typeInput.blur(); typeHistory.length = 0; }
      hint.textContent = tool === "e" ? "Drag to erase · Click Eraser again or press R to turn it" : tool === "c" ? "Drag on the board to write · Esc to leave"
        : tool === "k" ? "Type to write · Click board to place cursor · Enter for a new line" : "Pick up the chalk, eraser, or keyboard";
    };
    const movePointer = (e) => {
      lastMove = e;
      if (!tool || tool === "k") { pointer.classList.remove("visible"); return; }
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (x < 0 || y < 0 || x > r.width || y > r.height) { pointer.classList.remove("visible"); return; }
      if (tool === "e") {
        // Drawn from the footprint and the board's size on screen now: the cursor is exactly what a press would erase.
        const [tx, ty] = thousandths(e), scaleX = r.width / W, scaleY = r.height / H;
        pointer.style.left = `${(eraserLeft(tx / 1000, turn) + eraserW(turn) / 2) * scaleX}px`;
        pointer.style.top = `${(eraserTop(ty / 1000, turn) + eraserH(turn) / 2) * scaleY}px`;
        held.style.width = `${eraserW(turn) * scaleX}px`;
        held.style.height = `${eraserH(turn) * scaleY}px`;
      } else {
        pointer.style.left = `${x}px`;
        pointer.style.top = `${y}px`;
      }
      pointer.classList.add("visible");
    };
    // Turns the eraser between sideways and upright, for this visit; the cursor follows at once. A line already drawn,
    // or being drawn, keeps the way it was held.
    const turnEraser = () => {
      turn = turn === 2 ? 1 : 2;
      select("e");
      if (lastMove && pointer.classList.contains("visible")) movePointer(lastMove);
    };
    // In thousandths of the board, as edits carry them.
    const thousandths = (e) => { const [x, y] = coords(e); return [Math.round(x * 1000), Math.round(y * 1000)]; };
    // A new line's edit; an upright eraser's says so (`o`), as the contract carries it.
    const lineOp = (s, x, y) => s.m === "e" && s.o === 2 ? { k: "line", m: "e", o: 2, p: [s.x, s.y, x, y] } : { k: "line", m: s.m, p: [s.x, s.y, x, y] };
    // A line begins at its second point; one that takes no more points starts afresh from the next.
    const addPoint = (e) => {
      if (!stroke) return;
      const [x, y] = thousandths(e);
      stroke.endX = x; stroke.endY = y;
      if (Math.hypot(x - stroke.x, y - stroke.y) < 3) return;
      const failed = edit(stroke.line ? { k: "more", p: [x, y] } : lineOp(stroke, x, y));
      stroke.x = x; stroke.y = y; stroke.line = !failed;
      if (failed) return;
      const mark = lastMark();
      paintSegment(mark, mark.p.length - 2);
      changed = true;
      markWorld();
    };
    // A press that never moved leaves a dot of chalk, or one footprint of the eraser, which also goes the last little
    // way to where the pointer stopped.
    const finishStroke = () => {
      if (stroke && stroke.m === "e") {
        const { x, y, endX, endY, line } = stroke;
        if ((!line || endX !== x || endY !== y) && !edit(line ? { k: "more", p: [endX, endY] } : lineOp(stroke, endX, endY))) {
          const mark = lastMark();
          paintSegment(mark, mark.p.length - 2);
          changed = true;
          markWorld();
        }
      } else if (stroke && !stroke.line && stroke.m === "c" && !edit({ k: "line", m: "c", p: [stroke.x, stroke.y, Math.min(1000, stroke.x + 1), stroke.y] })) {
        paintSegment(lastMark(), 2);
        changed = true;
        markWorld();
      }
      stroke = null;
    };
    // Another's edit on the shared board, drawn as it comes.
    const paintOp = (op) => {
      const marks = board().marks, mark = marks[marks.length - 1];
      if ((op.k === "line" || op.k === "more") && mark && mark.t !== "t") {
        for (let i = Math.max(2, op.k === "line" ? 2 : mark.p.length - op.p.length); i < mark.p.length; i += 2) paintSegment(mark, i);
      } else if (op.k === "type") for (let i = Math.max(0, marks.length - op.c.length); i < marks.length; i++) paintText(marks[i]);
      else paint();
    };
    on(canvas, "pointerdown", (e) => {
      if (tool === "k") {
        if (!e.isPrimary || e.button !== 0) return;
        e.preventDefault();
        const [x, y] = coords(e);
        cursorX = Math.max(TEXT_MARGIN, Math.min(W - TEXT_MARGIN - 48, x * W));
        textStartX = cursorX;
        cursorY = Math.max(TEXT_MARGIN + TEXT_SIZE, Math.min(H - TEXT_MARGIN, y * H + TEXT_SIZE));
        typeHistory.length = 0;
        placeCaret();
        typeInput.focus({ preventScroll: true });
        return;
      }
      const b = board();
      if (stroke || !e.isPrimary || e.button !== 0 || !tool || b.marks.length >= MAX_STROKES || b.points >= MAX_POINTS) return;
      e.preventDefault();
      const [x, y] = thousandths(e);
      stroke = { m: tool, o: turn, x, y, endX: x, endY: y, line: false };
      activePointer = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      movePointer(e);
    }, { signal: listeners.signal });
    on(canvas, "pointermove", (e) => { movePointer(e); if (e.pointerId === activePointer) addPoint(e); }, { signal: listeners.signal });
    const endStroke = (e) => {
      if (!stroke || e.pointerId !== activePointer) return;
      finishStroke();
      flushWorld();
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      activePointer = -1;
      if (e.pointerType === "touch") pointer.classList.remove("visible");
    };
    on(canvas, "pointerup", endStroke, { signal: listeners.signal });
    on(canvas, "pointercancel", endStroke, { signal: listeners.signal });
    on(canvas, "pointerleave", () => pointer.classList.remove("visible"), { signal: listeners.signal });
    on(eraser, "click", () => { if (tool === "e" && !stroke) turnEraser(); else select("e"); }, { signal: listeners.signal });
    on(dialog, "keydown", (e) => {
      if (tool !== "e" || stroke || e.ctrlKey || e.metaKey || e.altKey || (e.key !== "r" && e.key !== "R")) return;
      e.preventDefault();
      turnEraser();
    }, { signal: listeners.signal });
    on(chalk, "click", () => select("c"), { signal: listeners.signal });
    on(keyboard, "click", () => select(tool === "k" ? "c" : "k"), { signal: listeners.signal });
    const receiveText = () => {
      const value = typeInput.value;
      typeInput.value = "";
      if (tool === "k" && !animation && value) typeText(value);
    };
    on(typeInput, "input", (e) => { if (!e.isComposing) receiveText(); }, { signal: listeners.signal });
    on(typeInput, "keydown", (e) => {
      if (tool !== "k" || e.isComposing) return;
      if (e.key === "Enter") {
        e.preventDefault();
        const x = cursorX, y = cursorY;
        if (newTextLine()) typeHistory.push({ x, y, mark: null });
      } else if (e.key === "Backspace") { e.preventDefault(); backspaceText(); }
    }, { signal: listeners.signal });
    on(typeInput, "beforeinput", (e) => {
      if (tool === "k" && e.inputType === "deleteContentBackward") { e.preventDefault(); backspaceText(); }
    }, { signal: listeners.signal });
    on(clean, "click", () => startAnimation("clean"), { signal: listeners.signal });
    on(reset, "click", () => startAnimation("reset"), { signal: listeners.signal });
    on(closeButton, "click", () => dialog.close(), { signal: listeners.signal });
    on(dialog, "close", () => {
      finishAnimation();
      if (activePointer >= 0 && canvas.hasPointerCapture(activePointer)) canvas.releasePointerCapture(activePointer);
      activePointer = -1;
      finishStroke();
      pointer.classList.remove("visible");
      typeInput.value = "";
      // A shared board goes back to the room; the visitor's own stays in this browser.
      if (shared()) net.dropChalk();
      else if (changed) write(local.marks);
      if (changed) {
        paint();
        worldDirty = true;
        changed = false;
      }
      flushWorld();
      onClose();
    }, { signal: listeners.signal });
    const nameOf = (id) => { const rec = net.remotes.get(id); return rec ? rec.display : "Someone"; };
    // The shared board's news (net.js `subscribeChalk`): another's edit or a new board drawn as it comes, and the
    // lock, which opens the board here once it is this page's and closes it when it no longer is.
    const heard = (kind, detail) => {
      if (kind === "op") paintOp(detail);
      else if (kind === "board") {
        if (stroke) stroke.line = false;
        if (dialog.open && !holding()) { dialog.close(); return; }
        paint();
      } else if (kind === "lock") {
        const c = shared(), mine = holding();
        if (pending && (mine || net.state.room !== "live")) { pending = false; if (mine) show(pendingFocal); }
        // Granted after the visitor gave up waiting: hand it straight back.
        else if (mine && !dialog.open) net.dropChalk();
        else if (dialog.open && !mine) { dialog.close(); onRefused(c && c.editor ? `${nameOf(c.editor)} has the chalkboard now.` : "The chalkboard was let go."); }
        return;
      } else if (kind === "refused") {
        if (!pending) return;
        pending = false;
        onRefused(detail.why === "busy" ? `${detail.name || "Someone"} is writing on the chalkboard. Wait for them to finish.`
          : detail.why === "wait" ? "Wait a moment, then try the chalkboard again." : "Walk up to the chalkboard to write on it.");
        return;
      }
      markWorld();
    };
    const listen = () => { if (net && !unheard) unheard = net.subscribeChalk(heard); };
    const show = (focal) => {
      if (dialog.open) return;
      if (!shared()) localSession = C.session(local);
      cursorX = textStartX = TEXT_MARGIN;
      cursorY = TEXT_MARGIN + TEXT_SIZE;
      select("c");
      paint();
      onOpen();
      if (document.pointerLockElement) document.exitPointerLock();
      if (focal) dialog.style.transformOrigin = `${Math.round(focal.x / innerWidth * 100)}% ${Math.round(focal.y / innerHeight * 100)}%`;
      dialog.showModal();
    };
    listen();
    const suspend = () => {
      if (unheard) { unheard(); unheard = null; }
      pending = false;
      listeners.abort();
      if (animation) { cancelAnimationFrame(animation.raf); animation = null; }
      if (liveTimer) { clearTimeout(liveTimer); liveTimer = 0; }
      if (dialog.open) dialog.close();
    };
    const resume = () => {
      if (!listeners.signal.aborted) return;
      listeners = new AbortController();
      for (const [target, type, fn, opts] of bindings) target.addEventListener(type, fn, { ...opts, signal: listeners.signal });
      // The shared board may have moved on while the island was away.
      listen();
      paint();
      markWorld();
    };
    return {
      suspend, resume,
      attach(parent, x, y, z, angle = 0) {
        paint();
        node = BL.scene.createNode({ position: { x, y, z }, rotation: { x: 0, y: angle, z: 0 }, geometry: geometryFor(ctx), sightHidden: true });
        BL.scene.addChild(parent, node);
      },
      // A shared board opens once the room says this page holds it.
      open(focal) {
        if (dialog.open || pending) return;
        const c = shared();
        if (c && net.state.room !== "live") { onRefused("Reconnecting to the island. Try the chalkboard again in a moment."); return; }
        if (c && !holding()) { pending = true; pendingFocal = focal || null; net.takeChalk(); return; }
        show(focal);
      },
      close() { pending = false; if (dialog.open) dialog.close(); },
      dispose() {
        suspend();
        if (node) {
          renderer.releaseGeometry(node.geometry);
          const canvas = node.geometry.imageSurface.canvas;
          canvas.width = canvas.height = 0;
        }
        node = null;
      },
      get openNow() { return dialog.open; },
      // Waiting for the room to grant the shared board.
      get waiting() { return pending; },
      // Who else holds the shared board now, by name, or null.
      get writer() { const c = shared(); return c && c.editor && c.editor !== net.state.selfId ? nameOf(c.editor) : null; }
    };
  };
  BL.chalkboard = { create };
})();
