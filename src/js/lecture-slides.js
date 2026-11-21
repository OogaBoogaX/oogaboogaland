// What a lecture puts on a hall's screens, painted on canvases the hall hands in: the slide (`slide`, each kind of
// lecture-kit.js `SLIDES` in one dark deck style), the board (`board`: the lecturer's marker strokes in a hand that
// wobbles the same way every time, each drawn as far as its moment has got, added to what is already there so a
// repaint while he draws costs one stroke), the outline with the lecture's sections and how far it has run
// (`outline`), the sentence being said (`caption`), what the screens show between lectures (`idle*`) and the
// programme a visitor chooses a lecture from (`programme`). `kit` is the room kit's paint kit (fonts, `fit`, the
// island's pixel letters). Painting happens on a change, never every frame.
(() => {
  "use strict";
  const BL = window.BL;
  const LK = BL.lectures, GRID = LK.GRID, TAU = Math.PI * 2;
  const DECK = { bg: "#0e0d0c", panel: "#16120e", frame: "rgba(247,147,26,.6)", ink: "#f4efe6", soft: "#d8d0c2", grey: "#a89c8b", amber: "#f7931a", amberText: "#ffb04d", blue: "#6fb1ff", red: "#ff6b5e", green: "#4fd08a" };
  const SLIDE_INK = { ink: DECK.ink, blue: DECK.blue, red: DECK.red, green: DECK.green, amber: DECK.amberText, grey: DECK.grey };
  // The board's white is a pale grey on the canvas: the hall's own lamps light the dome, and a true white blooms.
  const BOARD = { bg: "#aeaba0", smudge: "rgba(90,100,120,.10)", rule: "rgba(40,50,70,.22)" };
  const BOARD_INK = { ink: "#101010", blue: "#12297a", red: "#9c150f", green: "#17601c", amber: "#8f4a00", grey: "#575757" };
  const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  // Words broken into lines no wider than `maxW` in the context's current font.
  const wrap = (ctx, words, maxW, out = []) => {
    out.length = 0;
    let line = "";
    for (const word of String(words).split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxW) { out.push(line); line = word; } else line = next;
    }
    if (line) out.push(line);
    return out;
  };
  const LINES = [];

  // ---------- shapes, clean (a slide's figure) ----------
  const cleanOp = (ctx, P, op, x0, y0, s) => {
    const kind = LK.shapeOf(op), v = op[kind], col = SLIDE_INK[op.c || "ink"], X = (x) => x0 + x * s, Y = (y) => y0 + y * s;
    ctx.strokeStyle = ctx.fillStyle = col; ctx.lineWidth = Math.max(2, s * 0.45); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.setLineDash(op.dash ? [s * 1.6, s * 1.4] : []);
    const label = (t, x, y, size, align = "center") => { ctx.setLineDash([]); ctx.fillStyle = col; ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.font = P.font(op.mono ? 500 : 600, size * s, op.mono ? P.MONO : P.FONT); ctx.fillText(t, X(x), Y(y)); };
    if (kind === "text") { label(v, op.x, op.y, op.size || 5, op.a === "c" ? "center" : op.a === "r" ? "right" : "left"); return; }
    if (kind === "box") {
      P.roundRect(ctx, X(v[0]), Y(v[1]), v[2] * s, v[3] * s, s * 1.2);
      if (op.fill) { ctx.globalAlpha = 0.16; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.stroke();
      if (op.t) label(op.t, v[0] + v[2] / 2, v[1] + v[3] / 2, Math.min(op.size || 5, v[3] * 0.62));
      return;
    }
    if (kind === "circle" || kind === "ellipse") {
      ctx.beginPath(); ctx.ellipse(X(v[0]), Y(v[1]), v[2] * s, (kind === "circle" ? v[2] : v[3]) * s, 0, 0, TAU);
      if (op.fill) { ctx.globalAlpha = 0.16; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.stroke();
      if (op.t) label(op.t, v[0], v[1], Math.min(op.size || 5, v[2] * 0.8));
      return;
    }
    ctx.beginPath(); ctx.moveTo(X(v[0]), Y(v[1]));
    for (let i = 2; i + 1 < v.length; i += 2) ctx.lineTo(X(v[i]), Y(v[i + 1]));
    ctx.stroke();
    if (kind === "arrow") {
      const a = Math.atan2(v[3] - v[1], v[2] - v[0]), h = 3 * s;
      ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(X(v[2]), Y(v[3]));
      ctx.lineTo(X(v[2]) - Math.cos(a - 0.45) * h, Y(v[3]) - Math.sin(a - 0.45) * h); ctx.lineTo(X(v[2]) - Math.cos(a + 0.45) * h, Y(v[3]) - Math.sin(a + 0.45) * h); ctx.closePath(); ctx.fill();
      if (op.t) { const nx = -Math.sin(a), ny = Math.cos(a), up = ny > 0 ? -1 : 1; label(op.t, (v[0] + v[2]) / 2 + nx * up * 3.4, (v[1] + v[3]) / 2 + ny * up * 3.4, op.size || 4); }
    }
  };

  // ---------- the slide ----------
  const footer = (ctx, P, W, H, u, meta) => {
    P.pix(ctx, meta.left || "", u * 7, H - u * 5.4, u * 3.2, DECK.grey, "left");
    if (meta.mid) P.pix(ctx, meta.mid, W / 2, H - u * 5.4, u * 3.2, meta.midColor || DECK.grey);
    if (meta.right) P.pix(ctx, meta.right, W - u * 7, H - u * 5.4, u * 3.2, DECK.grey, "right");
  };
  const frame = (ctx, W, H, u) => {
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.fillStyle = DECK.bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = DECK.frame; ctx.lineWidth = u * 0.5; ctx.strokeRect(u * 2, u * 2, W - u * 4, H - u * 4);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  };
  const heading = (ctx, P, W, u, title) => { ctx.fillStyle = DECK.ink; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; P.fit(ctx, title, W - u * 14, 700, u * 8.4); ctx.fillText(title, u * 7, u * 16); ctx.fillStyle = DECK.amber; ctx.fillRect(u * 7, u * 19.2, u * 12, u * 0.7); };
  const note = (ctx, P, W, H, u, text) => { if (!text) return; ctx.fillStyle = DECK.grey; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; P.fit(ctx, text, W - u * 14, 400, u * 3.9); ctx.fillText(text, u * 7, H - u * 10.6); };
  // A live panel or card painted at its own size, then laid into the slide.
  let scratch = null;
  const livePanel = (ctx, P, W, H, u, slide, meta) => {
    const CH = BL.timechainCharts, reader = meta.reader, x = u * 7, y = u * 24, w = W - u * 14, h = H - u * 40;
    if (!CH || !reader) { ctx.fillStyle = DECK.grey; ctx.textAlign = "center"; ctx.font = P.font(500, u * 5); ctx.fillText("Live from the chain when the hall is open", W / 2, y + h / 2); return; }
    if (slide.panel === "blocks") {
      const blocks = reader.value("recent"), n = 4, cw = (w - u * 3 * (n - 1)) / n, ch = cw * CH.CARD_H / CH.CARD_W;
      if (!scratch || scratch.width !== CH.CARD_W || scratch.height !== CH.CARD_H) scratch = CH.canvas(CH.CARD_W, CH.CARD_H);
      for (let i = 0; i < n; i++) { CH.card(scratch.getContext("2d"), blocks && blocks[n - 1 - i], meta.now); ctx.drawImage(scratch, x + i * (cw + u * 3), y + (h - ch) / 2, cw, ch); }
      return;
    }
    const i = CH.PANELS.findIndex((p) => p.id === slide.panel);
    if (!scratch || scratch.width !== CH.PANEL_W || scratch.height !== CH.PANEL_H) scratch = CH.canvas(CH.PANEL_W, CH.PANEL_H);
    CH.PANELS[i].paint(scratch.getContext("2d"), reader, meta.now);
    const k = Math.min(w / CH.PANEL_W, h / CH.PANEL_H);
    ctx.drawImage(scratch, x + (w - CH.PANEL_W * k) / 2, y + (h - CH.PANEL_H * k) / 2, CH.PANEL_W * k, CH.PANEL_H * k);
  };
  // `show`: how many of a slide's points, lines or rows are up; `local`: the sentence of the slide's own beat being
  // said (every figure op from an earlier one is up), 99 once the lecture has moved to a later beat.
  const slide = (ctx, W, H, P, s, show, local, meta) => {
    const u = H / 100, k = s.k;
    frame(ctx, W, H, u);
    if (meta.quizRows) meta.quizRows.length = 0;
    if (k === "title") {
      ctx.textAlign = "center";
      if (s.kicker || meta.kicker) P.pix(ctx, (s.kicker || meta.kicker).toUpperCase(), W / 2, u * 24, u * 4, DECK.amberText);
      ctx.fillStyle = DECK.ink; P.fit(ctx, s.title, W - u * 20, 800, u * 15); ctx.fillText(s.title, W / 2, u * 50);
      ctx.fillStyle = DECK.amber; ctx.fillRect(W / 2 - u * 10, u * 56, u * 20, u * 0.9);
      if (s.sub) { ctx.fillStyle = DECK.soft; P.fit(ctx, s.sub, W - u * 24, 400, u * 5.6); ctx.fillText(s.sub, W / 2, u * 68); }
      if (meta.credit) { ctx.fillStyle = DECK.grey; P.fit(ctx, meta.credit, W - u * 24, 400, u * 3.4); ctx.fillText(meta.credit, W / 2, u * 84); }
    } else if (k === "section") {
      ctx.textAlign = "left";
      P.pix(ctx, meta.part || "", u * 9, u * 36, u * 4, DECK.amberText, "left");
      ctx.fillStyle = DECK.ink; P.fit(ctx, s.title, W - u * 18, 800, u * 13); ctx.fillText(s.title, u * 9, u * 55);
      ctx.fillStyle = DECK.amber; ctx.fillRect(u * 9, u * 60, u * 16, u * 0.9);
      if (s.sub) { ctx.fillStyle = DECK.soft; P.fit(ctx, s.sub, W - u * 18, 400, u * 5.4); ctx.fillText(s.sub, u * 9, u * 71); }
    } else if (k === "quote") {
      ctx.textAlign = "center"; ctx.fillStyle = DECK.amber; ctx.font = P.font(700, u * 22, P.SERIF); ctx.fillText("“", W / 2, u * 30);
      ctx.fillStyle = DECK.ink; ctx.font = P.font(400, u * 6.4, P.SERIF);
      const lines = wrap(ctx, s.text, W - u * 30, LINES), y0 = u * 50 - (lines.length - 1) * u * 4.4;
      lines.forEach((line, i) => ctx.fillText(line, W / 2, y0 + i * u * 8.8));
      ctx.fillStyle = DECK.amberText; ctx.font = P.font(600, u * 4.4); ctx.fillText(s.by, W / 2, y0 + lines.length * u * 8.8 + u * 5);
    } else if (k === "quiz") {
      // A question and its answers, numbered as the keys that choose them. `show` is the answer chosen, from 1 (0 while
      // none is): the right one then stands in green, a wrong choice in red, and the rest dim.
      const chosen = show > 0 && show <= s.options.length ? show - 1 : -1, n = s.options.length;
      P.pix(ctx, `QUESTION ${s.n}`, u * 7, u * 10.5, u * 3.6, DECK.amberText, "left");
      ctx.fillStyle = DECK.ink; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.font = P.font(700, u * 6.4);
      const lines = wrap(ctx, s.q, W - u * 14, LINES).slice(0, 3), lh = u * 7.6;
      lines.forEach((line, i) => ctx.fillText(line, u * 7, u * 20.5 + i * lh));
      const top = u * 20.5 + lines.length * lh - u * 1.5, step = Math.min(u * 13.5, (H - u * 13 - top) / n), rh = step * 0.82;
      for (let i = 0; i < n; i++) {
        const y = top + i * step, right = chosen >= 0 && i === s.answer, wrong = chosen === i && i !== s.answer, dim = chosen >= 0 && !right && !wrong;
        if (meta.quizRows) meta.quizRows.push({ x: u * 7, y, w: W - u * 14, h: rh });
        const hover = chosen < 0 && meta.hover === i;
        const col = right ? DECK.green : wrong ? DECK.red : hover ? DECK.ink : DECK.amber;
        ctx.globalAlpha = dim ? 0.4 : 1;
        ctx.fillStyle = right ? "rgba(79,208,138,.16)" : wrong ? "rgba(255,107,94,.16)" : hover ? "rgba(247,147,26,.26)" : DECK.panel; P.roundRect(ctx, u * 7, y, W - u * 14, rh, u * 1.6); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = u * (right || wrong || hover ? 0.7 : 0.35); ctx.stroke();
        ctx.fillStyle = col; P.roundRect(ctx, u * 8.6, y + rh * 0.16, rh * 0.68, rh * 0.68, u * 1.1); ctx.fill();
        ctx.fillStyle = DECK.bg; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = P.font(800, rh * 0.44, P.MONO); ctx.fillText(right ? "✓" : wrong ? "✗" : String(i + 1), u * 8.6 + rh * 0.34, y + rh * 0.52);
        ctx.fillStyle = right ? DECK.green : wrong ? DECK.red : DECK.ink; ctx.textAlign = "left";
        P.fit(ctx, s.options[i], W - u * 20 - rh, right || wrong ? 700 : 500, Math.min(u * 5.4, rh * 0.5)); ctx.fillText(s.options[i], u * 10.4 + rh * 0.68, y + rh * 0.52);
        ctx.textBaseline = "alphabetic";
      }
      ctx.globalAlpha = 1;
      meta = { ...meta, mid: chosen < 0 ? "CHOOSE AN ANSWER" : chosen === s.answer ? "CORRECT" : "NOT QUITE", midColor: chosen < 0 ? DECK.amberText : chosen === s.answer ? DECK.green : DECK.red };
    } else if (k === "number") {
      ctx.textAlign = "center"; ctx.fillStyle = DECK.amberText; P.fit(ctx, s.value, W - u * 24, 800, u * 30, P.MONO); ctx.fillText(s.value, W / 2, u * 54);
      ctx.fillStyle = DECK.ink; P.fit(ctx, s.label, W - u * 24, 500, u * 6); ctx.fillText(s.label, W / 2, u * 70);
      if (s.note) { ctx.fillStyle = DECK.grey; P.fit(ctx, s.note, W - u * 24, 400, u * 4); ctx.fillText(s.note, W / 2, u * 80); }
    } else {
      heading(ctx, P, W, u, s.title);
      if (k === "points") {
        const n = s.points.length, step = Math.min(u * 11.5, u * 58 / n), up = Math.min(n, show);
        for (let i = 0; i < up; i++) {
          const y = u * 31 + i * step;
          ctx.fillStyle = DECK.amber; ctx.fillRect(u * 7.4, y - u * 2.6, u * 1.7, u * 1.7);
          ctx.fillStyle = i === up - 1 && up < n ? DECK.ink : up === n ? DECK.ink : DECK.soft;
          P.fit(ctx, s.points[i], W - u * 20, 500, u * 5.6); ctx.fillText(s.points[i], u * 12, y);
        }
      } else if (k === "compare") {
        const cw = (W - u * 18) / 2;
        [s.left, s.right].forEach((c, j) => {
          const x = u * 7 + j * (cw + u * 4), col = j ? DECK.blue : DECK.amberText;
          ctx.fillStyle = DECK.panel; P.roundRect(ctx, x, u * 24, cw, u * 60, u * 2); ctx.fill();
          ctx.strokeStyle = col; ctx.lineWidth = u * 0.5; ctx.stroke();
          ctx.fillStyle = col; P.fit(ctx, c.head, cw - u * 8, 700, u * 6); ctx.fillText(c.head, x + u * 4, u * 34);
          const up = Math.min(c.points.length, show);
          for (let i = 0; i < up; i++) { ctx.fillStyle = DECK.ink; P.fit(ctx, c.points[i], cw - u * 8, 500, u * 4.6); ctx.fillText(c.points[i], x + u * 4, u * 44 + i * u * 8.2); }
        });
      } else if (k === "code") {
        ctx.fillStyle = DECK.panel; P.roundRect(ctx, u * 7, u * 24, W - u * 14, u * 60, u * 2); ctx.fill();
        const n = s.lines.length, step = Math.min(u * 6.4, u * 54 / n), up = Math.min(n, show);
        for (let i = 0; i < up; i++) { const line = s.lines[i]; ctx.fillStyle = line.trimStart().startsWith("#") ? DECK.grey : line.startsWith("$") ? DECK.green : DECK.ink; P.fit(ctx, line || " ", W - u * 22, 500, Math.min(u * 4.6, step * 0.78), P.MONO); ctx.fillText(line, u * 11, u * 31 + i * step); }
      } else if (k === "table") {
        const cols = s.head.length, cw = (W - u * 14) / cols, step = Math.min(u * 8.6, u * 52 / s.rows.length), up = Math.min(s.rows.length, show);
        s.head.forEach((h, j) => { ctx.fillStyle = DECK.amberText; P.fit(ctx, h, cw - u * 3, 700, u * 4.6); ctx.fillText(h, u * 7 + j * cw, u * 30); });
        ctx.fillStyle = DECK.frame; ctx.fillRect(u * 7, u * 32.4, W - u * 14, u * 0.35);
        for (let i = 0; i < up; i++) s.rows[i].forEach((cell, j) => { ctx.fillStyle = j ? DECK.soft : DECK.ink; P.fit(ctx, String(cell), cw - u * 3, j ? 400 : 600, u * 4.4); ctx.fillText(String(cell), u * 7 + j * cw, u * 39.5 + i * step); });
      } else if (k === "figure") {
        // The grid as wide as the slide allows and no taller than the room between the heading and the foot, so a
        // screen wider than it is tall for the grid draws the figure a little smaller, in the middle.
        const sc = Math.min((W - u * 14) / GRID.w, u * 65 / GRID.figure);
        for (const op of s.ops) if ((op.at || 0) <= local) cleanOp(ctx, P, op, (W - GRID.w * sc) / 2, u * 23, sc);
        ctx.setLineDash([]);
      } else if (k === "live") livePanel(ctx, P, W, H, u, s, meta);
      note(ctx, P, W, H, u, s.note);
    }
    footer(ctx, P, W, H, u, meta);
  };

  // ---------- the board ----------
  // A stroke's line, cut into short pieces that each wander a little, the same way every time (seeded by the stroke):
  // [x0, y0, x1, y1, ...] in grid units, with how long it is.
  const scribble = (pts, seed, P, closed) => {
    const r = P.rng(seed), out = [];
    let len = 0;
    const jit = () => (r() - 0.5) * 0.7;
    let px = pts[0] + jit(), py = pts[1] + jit();
    out.push(px, py);
    for (let i = 2; i + 1 < pts.length; i += 2) {
      const ax = pts[i - 2], ay = pts[i - 1], bx = pts[i], by = pts[i + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 9));
      for (let k = 1; k <= n; k++) {
        const x = ax + (bx - ax) * k / n + jit(), y = ay + (by - ay) * k / n + jit();
        len += Math.hypot(x - px, y - py); out.push(x, y); px = x; py = y;
      }
    }
    if (closed) { len += Math.hypot(out[0] - px, out[1] - py); out.push(out[0] + 0.5, out[1] + 0.4); }
    return { pts: out, len };
  };
  // What a stroke draws, made once: its lines in order and its words.
  const inked = (stroke, index, P) => {
    if (stroke.ink) return stroke.ink;
    const op = stroke.op, kind = LK.shapeOf(op), v = op[kind], lines = [];
    let words = null;
    if (kind === "text") words = { t: String(v), x: op.x, y: op.y, size: op.size || 5, a: op.a || "l" };
    else if (kind === "box") {
      lines.push(scribble([v[0], v[1], v[0] + v[2], v[1], v[0] + v[2], v[1] + v[3], v[0], v[1] + v[3], v[0], v[1]], index * 31 + 7, P));
      if (op.t) words = { t: String(op.t), x: v[0] + v[2] / 2, y: v[1] + v[3] / 2, size: Math.min(op.size || 5, v[3] * 0.62), a: "c" };
    } else if (kind === "circle" || kind === "ellipse") {
      const rx = v[2], ry = kind === "circle" ? v[2] : v[3], ring = [];
      for (let i = 0; i <= 26; i++) { const a = -1.9 + TAU * 1.04 * i / 26; ring.push(v[0] + Math.cos(a) * rx, v[1] + Math.sin(a) * ry); }
      lines.push(scribble(ring, index * 31 + 7, P));
      if (op.t) words = { t: String(op.t), x: v[0], y: v[1], size: Math.min(op.size || 5, rx * 0.8), a: "c" };
    } else {
      lines.push(scribble(v, index * 31 + 7, P));
      if (kind === "arrow") {
        const a = Math.atan2(v[3] - v[1], v[2] - v[0]), h = 3.4;
        lines.push(scribble([v[2] - Math.cos(a - 0.5) * h, v[3] - Math.sin(a - 0.5) * h, v[2], v[3]], index * 31 + 11, P), scribble([v[2], v[3], v[2] - Math.cos(a + 0.5) * h, v[3] - Math.sin(a + 0.5) * h], index * 31 + 13, P));
        if (op.t) { const nx = -Math.sin(a), ny = Math.cos(a), up = ny > 0 ? -1 : 1; words = { t: String(op.t), x: (v[0] + v[2]) / 2 + nx * up * 3.6, y: (v[1] + v[3]) / 2 + ny * up * 3.6, size: op.size || 4, a: "c" }; }
      }
    }
    let len = 0;
    for (const l of lines) len += l.len;
    return stroke.ink = { lines, len, words, share: lines.length ? words ? 0.6 : 1 : 0, color: BOARD_INK[op.c || "ink"], fill: !!op.fill, dash: !!op.dash, at: null };
  };
  // One stroke as far as `p` (0 to 1) of it has been drawn.
  const drawStroke = (ctx, P, ink, p, s, x0, y0) => {
    ctx.strokeStyle = ctx.fillStyle = ink.color; ctx.lineWidth = Math.max(2.5, s * 0.62); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.setLineDash(ink.dash ? [s * 1.8, s * 1.6] : []);
    if (ink.lines.length) {
      let left = Math.min(1, p / ink.share) * ink.len;
      for (const l of ink.lines) {
        if (left <= 0) break;
        const q = l.pts;
        ctx.beginPath(); ctx.moveTo(x0 + q[0] * s, y0 + q[1] * s);
        for (let i = 2; i + 1 < q.length && left > 0; i += 2) {
          const d = Math.hypot(q[i] - q[i - 2], q[i + 1] - q[i - 1]), f = d > left ? left / d : 1;
          ctx.lineTo(x0 + (q[i - 2] + (q[i] - q[i - 2]) * f) * s, y0 + (q[i - 1] + (q[i + 1] - q[i - 1]) * f) * s);
          left -= d;
        }
        ctx.stroke();
      }
      if (ink.fill && p >= 1) { const l = ink.lines[0].pts; ctx.globalAlpha = 0.1; ctx.beginPath(); ctx.moveTo(x0 + l[0] * s, y0 + l[1] * s); for (let i = 2; i + 1 < l.length; i += 2) ctx.lineTo(x0 + l[i] * s, y0 + l[i + 1] * s); ctx.fill(); ctx.globalAlpha = 1; }
    }
    if (ink.words && p > ink.share) {
      const w = ink.words, n = Math.max(1, Math.ceil(w.t.length * Math.min(1, (p - ink.share) / (1 - ink.share))));
      ctx.setLineDash([]); ctx.textBaseline = "middle"; ctx.font = P.font(400, w.size * s * 1.12, P.HAND);
      // Typed from its start whatever its anchor, so the words written so far never move.
      const full = ctx.measureText(w.t).width, left = w.a === "c" ? -full / 2 : w.a === "r" ? -full : 0;
      ctx.textAlign = "left"; ctx.fillText(n >= w.t.length ? w.t : w.t.slice(0, n), x0 + w.x * s + left, y0 + w.y * s);
    }
  };
  const boardBlank = (ctx, W, H, P, title) => {
    const r = P.rng(31);
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.fillStyle = BOARD.bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = BOARD.smudge;
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.ellipse(r() * W, r() * H, W * (0.08 + r() * 0.1), H * (0.04 + r() * 0.05), r(), 0, TAU); ctx.fill(); }
    ctx.strokeStyle = "#5e6168"; ctx.lineWidth = H * 0.014; ctx.strokeRect(0, 0, W, H);
    if (title) { ctx.fillStyle = BOARD_INK.blue; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = P.font(400, H * 0.075, P.HAND); ctx.fillText(title, W * 0.035, H * 0.075); ctx.fillStyle = BOARD.rule; ctx.fillRect(W * 0.03, H * 0.125, W * 0.94, H * 0.004); }
  };
  // The board at `t`. `mark` ({ epoch, settled }) is what the canvas already holds: the same board with that many
  // strokes finished is only added to; anything else is painted afresh. Returns whether a stroke is still being drawn.
  // A panel's drawing kept clear of its title and of the board's foot: how much smaller it is drawn (about the board's
  // middle) and how far down it is moved, worked out once a panel from what its strokes cover. Most need neither.
  const TOP = 14, FOOT = 87;
  const fitOf = (timeline, E) => {
    if (E.fit) return E.fit;
    let lo = Infinity, hi = -Infinity;
    for (let k = E.first; k < E.first + E.count; k++) {
      const op = timeline.strokes[k].op, kind = LK.shapeOf(op), v = op[kind];
      if (kind === "text") { const z = op.size || 5; lo = Math.min(lo, op.y - z * 0.85); hi = Math.max(hi, op.y + z * 0.35); }
      else if (kind === "box") { lo = Math.min(lo, v[1]); hi = Math.max(hi, v[1] + v[3]); }
      else if (kind === "circle" || kind === "ellipse") { const r = kind === "circle" ? v[2] : v[3]; lo = Math.min(lo, v[1] - r); hi = Math.max(hi, v[1] + r); }
      else for (let i = 1; i < v.length; i += 2) { lo = Math.min(lo, v[i] - (op.t ? 4 : 0)); hi = Math.max(hi, v[i]); }
    }
    const top = E.title ? TOP : 3, k = hi > lo ? Math.min(1, (FOOT - top) / (hi - lo)) : 1;
    // Scaled about the middle of the board, then moved only as far as it must be.
    let dy = GRID.board / 2 * (1 - k);
    if (lo * k + dy < top) dy = top - lo * k;
    if (hi * k + dy > FOOT) dy = FOOT - hi * k;
    return E.fit = { k, dx: GRID.w / 2 * (1 - k), dy };
  };
  const board = (ctx, W, H, P, timeline, epoch, t, mark) => {
    const E = epoch >= 0 ? timeline.epochs[epoch] : null;
    let s = Math.min(W / GRID.w, H / GRID.board), x0 = (W - GRID.w * s) / 2, y0 = (H - GRID.board * s) / 2;
    if (E) { const f = fitOf(timeline, E); x0 += f.dx * s; y0 += f.dy * s; s *= f.k; }
    if (!E) { if (mark.epoch !== -1 || mark.settled !== -1) { boardIdle(ctx, W, H, P); mark.epoch = -1; mark.settled = -1; } return false; }
    const K = timeline.strokes, first = E.first, end = first + E.count;
    let settledAt = first;
    while (settledAt < end && K[settledAt].start + K[settledAt].length <= t) settledAt++;
    if (mark.epoch !== epoch || mark.settled < 0 || mark.settled > settledAt - first) { boardBlank(ctx, W, H, P, E.title); mark.epoch = epoch; mark.settled = 0; }
    let drawing = false;
    for (let k = first + mark.settled; k < end && K[k].start <= t; k++) {
      const p = Math.min(1, (t - K[k].start) / K[k].length);
      drawStroke(ctx, P, inked(K[k], k, P), p, s, x0, y0);
      if (p < 1) drawing = true;
    }
    ctx.setLineDash([]);
    mark.settled = settledAt - first;
    return drawing;
  };
  // Where the marker is at `t` on the board in view, as a share of its width and height (for the lecturer's hand), or
  // null between strokes.
  const penAt = (timeline, epoch, t, out) => {
    const E = epoch >= 0 ? timeline.epochs[epoch] : null;
    if (!E) return null;
    const K = timeline.strokes;
    for (let k = E.first; k < E.first + E.count; k++) {
      const st = K[k];
      if (st.start > t) break;
      if (t >= st.start + st.length) continue;
      const op = st.op, kind = LK.shapeOf(op), v = op[kind], p = (t - st.start) / st.length;
      if (kind === "text") { out.x = (op.x + p * String(v).length * 2.2 * (op.a === "c" ? 0.5 : 1)) / GRID.w; out.y = op.y / GRID.board; }
      else if (kind === "circle" || kind === "ellipse") { out.x = (v[0] + Math.cos(p * TAU) * v[2]) / GRID.w; out.y = (v[1] + Math.sin(p * TAU) * (kind === "circle" ? v[2] : v[3])) / GRID.board; }
      else if (kind === "box") { out.x = (v[0] + v[2] * (p < 0.5 ? p * 2 : 2 - p * 2)) / GRID.w; out.y = (v[1] + v[3] * (p < 0.5 ? 0 : 1)) / GRID.board; }
      else { out.x = (v[0] + (v[v.length - 2] - v[0]) * p) / GRID.w; out.y = (v[1] + (v[v.length - 1] - v[1]) * p) / GRID.board; }
      return out;
    }
    return null;
  };

  // ---------- the outline, the caption and what shows between lectures ----------
  const timebar = (W, H) => ({ x: H * 0.07, y: H * 0.87, w: W - H * 0.14, h: H * 0.014, r: H * 0.018 });
  const outline = (ctx, W, H, P, timeline, st, t, meta) => {
    const u = H / 100, S = timeline.sections;
    frame(ctx, W, H, u);
    P.pix(ctx, meta.kicker || "", u * 7, u * 10, u * 3.4, DECK.amberText, "left");
    ctx.fillStyle = DECK.ink; P.fit(ctx, meta.title, W - u * 14, 700, u * 7); ctx.fillText(meta.title, u * 7, u * 21);
    const reading = timeline.lecture.reading || [], room = reading.length ? 40 : 50, step = Math.min(u * 8.6, u * room / S.length);
    if (reading.length) {
      P.pix(ctx, "BEFORE CLASS", u * 7, u * 73.5, u * 2.8, DECK.amberText, "left");
      reading.slice(0, 2).forEach((r, i) => { ctx.fillStyle = DECK.soft; ctx.textAlign = "left"; const line = r.by ? `${r.title} · ${r.by}` : r.title; P.fit(ctx, line, W - u * 14, 400, u * 3.5); ctx.fillText(line, u * 7, u * 78.6 + i * u * 4.4); });
    }
    if (meta.sectionRows) meta.sectionRows.length = S.length;
    S.forEach((sec, i) => {
      const y = u * 32 + i * step, now = i === st.section, done = i < st.section;
      const x = u * 5, top = y - step * 0.62, w = W - u * 10, h = step * 0.92, hover = meta.hover === i;
      if (meta.sectionRows) {
        const row = meta.sectionRows[i] || (meta.sectionRows[i] = {});
        row.x = x; row.y = top; row.w = w; row.h = h;
      }
      if (now || hover) {
        ctx.fillStyle = hover ? "rgba(247,147,26,.26)" : "rgba(247,147,26,.16)";
        P.roundRect(ctx, x, top, w, h, u * 1.2); ctx.fill();
        if (hover) { ctx.strokeStyle = DECK.ink; ctx.lineWidth = u * 0.7; ctx.stroke(); }
      }
      ctx.fillStyle = done ? DECK.green : now ? DECK.amber : DECK.grey;
      ctx.font = P.font(700, u * 4.4, P.MONO); ctx.textAlign = "left"; ctx.fillText(done ? "✓" : String(i + 1), u * 7.4, y);
      ctx.fillStyle = now ? DECK.ink : done ? DECK.grey : DECK.soft; P.fit(ctx, sec.title, W - u * 34, now ? 700 : 500, u * 4.6); ctx.fillText(sec.title, u * 13, y);
      ctx.fillStyle = DECK.grey; ctx.textAlign = "right"; ctx.font = P.font(400, u * 3.6, P.MONO); ctx.fillText(clock(sec.start), W - u * 7, y); ctx.textAlign = "left";
    });
    const bar = timebar(W, H), bx = bar.x, bw = bar.w, by = bar.y, k = Math.max(0, Math.min(1, t / timeline.duration));
    ctx.fillStyle = "#2a241c"; ctx.fillRect(bx, by, bw, u * 1.4);
    ctx.fillStyle = DECK.amber; ctx.fillRect(bx, by, bw * k, u * 1.4);
    for (const sec of S) { ctx.fillStyle = DECK.bg; ctx.fillRect(bx + bw * sec.start / timeline.duration - 1, by, 2, u * 1.4); }
    ctx.beginPath(); ctx.arc(bx + bw * k, by + bar.h / 2, bar.r, 0, TAU);
    ctx.fillStyle = DECK.ink; ctx.fill(); ctx.strokeStyle = DECK.amber; ctx.lineWidth = u * 0.45; ctx.stroke();
    footer(ctx, P, W, H, u, { left: `${clock(t)} / ${clock(timeline.duration)}`, right: meta.state || "" });
  };
  const caption = (ctx, W, H, P, text, paused) => {
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.fillStyle = "#0a0908"; ctx.fillRect(0, 0, W, H);
    if (!text) return;
    ctx.fillStyle = paused ? DECK.grey : DECK.ink; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = P.font(500, H * 0.3);
    let lines = wrap(ctx, text, W * 0.94, LINES);
    if (lines.length > 2) { ctx.font = P.font(500, H * 0.24); lines = wrap(ctx, text, W * 0.94, LINES); }
    const lh = H / (lines.length > 2 ? 3.2 : 2.4), y0 = H / 2 - (lines.length - 1) * lh / 2;
    for (let i = 0; i < lines.length && i < 3; i++) ctx.fillText(lines[i], W / 2, y0 + i * lh);
  };
  const idleSlide = (ctx, W, H, P, course, hint) => {
    const u = H / 100;
    frame(ctx, W, H, u);
    ctx.textAlign = "center";
    P.pix(ctx, "LECTURE HALL", W / 2, u * 22, u * 4.4, DECK.amberText);
    ctx.fillStyle = DECK.ink; P.fit(ctx, course.title, W - u * 20, 800, u * 15); ctx.fillText(course.title, W / 2, u * 48);
    ctx.fillStyle = DECK.amber; ctx.fillRect(W / 2 - u * 10, u * 54, u * 20, u * 0.9);
    ctx.fillStyle = DECK.soft; P.fit(ctx, course.subtitle, W - u * 24, 400, u * 5.6); ctx.fillText(course.subtitle, W / 2, u * 65);
    if (course.by) { ctx.fillStyle = DECK.ink; P.fit(ctx, `with ${course.by}`, W - u * 24, 600, u * 4.6); ctx.fillText(`with ${course.by}`, W / 2, u * 73); }
    ctx.fillStyle = DECK.amberText; P.fit(ctx, hint, W - u * 24, 600, u * 4.2); ctx.fillText(hint, W / 2, u * 83);
    footer(ctx, P, W, H, u, { left: `${course.lectures.length} LECTURES`, right: "" });
  };
  const boardIdle = (ctx, W, H, P) => {
    boardBlank(ctx, W, H, P, "");
    ctx.strokeStyle = "rgba(29,58,138,.22)"; ctx.lineWidth = W * 0.006; ctx.lineCap = "round";
    ctx.beginPath(); ctx.ellipse(W / 2, H / 2, H * 0.2, H * 0.2, 0, 0.3, TAU + 0.1); ctx.stroke();
    ctx.fillStyle = "rgba(29,58,138,.22)"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = P.font(400, H * 0.24, P.HAND); ctx.fillText("₿", W / 2, H / 2);
  };
  // The course as a list: every lecture, the one playing lit, a tick on each one heard to its end.
  const idleOutline = (ctx, W, H, P, course, progress, playing) => {
    const u = H / 100, list = course.lectures, step = Math.min(u * 5.4, u * 74 / list.length);
    frame(ctx, W, H, u);
    P.pix(ctx, "THE COURSE", u * 7, u * 10, u * 3.4, DECK.amberText, "left");
    list.forEach((l, i) => {
      const y = u * 19.5 + i * step, done = progress && progress[l.id] && progress[l.id].done, now = l.id === playing;
      ctx.fillStyle = done ? DECK.green : now ? DECK.amber : DECK.grey; ctx.textAlign = "right"; ctx.font = P.font(700, step * 0.62, P.MONO); ctx.fillText(done ? "✓" : String(l.n), u * 12, y);
      ctx.fillStyle = now ? DECK.ink : DECK.soft; ctx.textAlign = "left"; P.fit(ctx, l.title, W - u * 22, now ? 700 : 500, step * 0.72); ctx.fillText(l.title, u * 14.5, y);
    });
    footer(ctx, P, W, H, u, { left: course.title.toUpperCase().slice(0, 44), right: "" });
  };
  // The programme a visitor picks from, a page of the board dialog: two columns of lectures, each a row with its
  // number, title, what it covers and where the visitor left it. Fills `rows` with each row's rectangle.
  const programme = (ctx, W, H, P, course, progress, selected, rows, ready, hovered = -1) => {
    const u = H / 100, list = course.lectures, per = Math.ceil(list.length / 2), cw = (W - u * 14) / 2, rh = u * 72 / per;
    frame(ctx, W, H, u);
    ctx.fillStyle = DECK.ink; ctx.textAlign = "left"; P.fit(ctx, course.title, W * 0.6, 800, u * 8); ctx.fillText(course.title, u * 7, u * 13);
    ctx.fillStyle = DECK.grey; ctx.font = P.font(400, u * 3.4); ctx.fillText(course.by ? `${course.subtitle} · with ${course.by}` : course.subtitle, u * 7, u * 18.5);
    rows.length = 0;
    list.forEach((l, i) => {
      const col = i < per ? 0 : 1, x = u * 6 + col * (cw + u * 2), y = u * 22 + (i - col * per) * rh, p = progress && progress[l.id], sel = i === selected, available = !ready || ready(l), hover = i === hovered;
      rows.push({ x, y, w: cw, h: rh - u * 1.2, index: i });
      ctx.fillStyle = hover ? available ? "rgba(247,147,26,.3)" : "rgba(160,160,160,.22)" : sel ? available ? "rgba(247,147,26,.2)" : "rgba(160,160,160,.12)" : DECK.panel; P.roundRect(ctx, x, y, cw, rh - u * 1.2, u * 1.4); ctx.fill();
      if (sel || hover) { ctx.strokeStyle = available ? hover ? DECK.ink : DECK.amber : DECK.grey; ctx.lineWidth = u * 0.4; ctx.stroke(); }
      ctx.fillStyle = !available ? DECK.grey : p && p.done ? DECK.green : DECK.amberText; ctx.textAlign = "center"; ctx.font = P.font(700, rh * 0.36, P.MONO); ctx.fillText(p && p.done ? "✓" : String(l.n), x + u * 4.4, y + rh * 0.56);
      ctx.textAlign = "left"; ctx.fillStyle = available ? DECK.ink : DECK.grey; P.fit(ctx, l.title, cw - u * 26, 700, rh * 0.3); ctx.fillText(l.title, x + u * 9, y + rh * 0.4);
      ctx.fillStyle = DECK.grey; P.fit(ctx, l.blurb, cw - u * 12, 400, rh * 0.2); ctx.fillText(l.blurb, x + u * 9, y + rh * 0.7);
      const tag = !available ? "SOON" : p && !p.done && p.t > 5 ? `AT ${clock(p.t)}` : "";
      if (tag) P.pix(ctx, tag, x + cw - u * 2.4, y + rh * 0.34, rh * 0.17, tag === "SOON" ? DECK.grey : DECK.amberText, "right");
    });
    footer(ctx, P, W, H, u, { left: `${list.length} LECTURES · ${course.parts ? course.parts.length + " PARTS" : ""}`, right: "" });
  };

  BL.lectureSlides = { DECK, slide, board, penAt, outline, timebar, caption, idleSlide, boardIdle, idleOutline, programme, clock, mark: () => ({ epoch: -2, settled: -1 }) };
})();
