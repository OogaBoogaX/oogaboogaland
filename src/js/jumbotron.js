// Jumbotron board, ported from rules-without-rulers/oogatron (its jumbotron/data.js + views.js).
// Data baked in as BL.jumbotronData by scripts/jumbotron-data.mjs; the page never fetches.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { box, merge, cached } = BL.models;
  const { createNode, addChild } = BL.scene;

  // Palette extracted from this world's own materials (see oogatron Phase 4).
  const PALETTE = {
    screenBg: "#0a0c0a",
    grid: "#131912",
    text: "#f3efe4",
    dim: "#a6a6a2",
    accent: "#d8892b",
    commits: "#46ff70",
    prs: "#3fd1c5",
    reviews: "#6f9fca",
    comments: "#f5c542",
    plank: "#a9773f",
    woodDark: "#5c4425",
    screenBezel: "#1d2326",
    standDark: "#4a3319",
    nail: "#3a2a18",
    woodJoint: "#42301a"
  };

  const BOARD_W = 192, BOARD_H = 108;

  const FONT = {
    A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
    B: [0b11110, 0b10001, 0b11110, 0b10001, 0b10001, 0b10001, 0b11110],
    C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
    D: [0b11100, 0b10010, 0b10001, 0b10001, 0b10001, 0b10010, 0b11100],
    E: [0b11111, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000, 0b11111],
    F: [0b11111, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000, 0b10000],
    G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
    H: [0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001, 0b10001],
    I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
    J: [0b00111, 0b00010, 0b00010, 0b00010, 0b10010, 0b10010, 0b01100],
    K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
    L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
    M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
    N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
    O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
    P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
    Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
    R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
    S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
    T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
    U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
    V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
    W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
    X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
    Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
    Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
    0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
    1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
    2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
    3: [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
    4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
    5: [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
    6: [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
    7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
    8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
    9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
    " ": [0, 0, 0, 0, 0, 0, 0],
    "-": [0, 0, 0, 0b01110, 0, 0, 0],
    "_": [0, 0, 0, 0, 0, 0, 0b11111],
    ".": [0, 0, 0, 0, 0, 0b00110, 0b00110],
    ",": [0, 0, 0, 0, 0, 0b00100, 0b01000],
    ":": [0, 0b00110, 0b00110, 0, 0b00110, 0b00110, 0],
    "/": [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
    "+": [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
    "*": [0, 0b10101, 0b01110, 0b11111, 0b01110, 0b10101, 0],
    "'": [0b00100, 0b00100, 0, 0, 0, 0, 0],
    "!": [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100]
  };
  const FALLBACK_GLYPH = [0b11111, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11111];
  const GLYPH_W = 5, GLYPH_H = 7, TRACKING = 1;

  const glyphOf = (ch) => FONT[ch.toUpperCase()] || FALLBACK_GLYPH;
  const measureText = (text, scale = 1) =>
    text.length === 0 ? 0 : (text.length * (GLYPH_W + TRACKING) - TRACKING) * scale;
  const drawText = (ctx, text, x, y, color, scale = 1) => {
    ctx.fillStyle = color;
    let cx = x;
    for (const ch of text) {
      const rows = glyphOf(ch);
      for (let r = 0; r < GLYPH_H; r++) {
        const bits = rows[r];
        for (let c = 0; c < GLYPH_W; c++) {
          if (bits & (1 << (GLYPH_W - 1 - c))) ctx.fillRect(cx + c * scale, y + r * scale, scale, scale);
        }
      }
      cx += (GLYPH_W + TRACKING) * scale;
    }
  };
  const fitText = (text, maxWidth, scale = 1) => {
    const perChar = (GLYPH_W + TRACKING) * scale;
    const maxChars = Math.max(0, Math.floor((maxWidth + TRACKING * scale) / perChar));
    return text.length <= maxChars ? text : text.slice(0, maxChars);
  };

  const normalizeComments = (c) => ({
    issue: (c && c.issue || 0) | 0, review: (c && c.review || 0) | 0,
    commit: (c && c.commit || 0) | 0, all: (c && c.all || 0) | 0
  });
  const normalizeCounts = (counts) => ({
    commits: (counts && counts.commits || 0) | 0, prs: (counts && counts.prs || 0) | 0,
    reviews: (counts && counts.reviews || 0) | 0, comments: normalizeComments(counts && counts.comments)
  });
  const normalizeBoard = (b) => Array.isArray(b) ? b.map((e) => ({ login: String(e.login), count: e.count | 0 })) : [];
  const CONTRIBUTOR_ALIASES = { bc1gui: "ottoz0r" };
  const displayLabel = (c) => c.login.startsWith("email:") ? "anonymous" : c.login;

  const parseStats = (json) => {
    if (typeof json !== "object" || json === null) throw new Error("stats payload is not an object");
    if (!json.meta || json.meta.schema_version !== 1) throw new Error("unsupported stats schema_version");
    if (!Array.isArray(json.contributors)) throw new Error("stats contributors is not an array");
    const contributors = json.contributors.map((c) => ({
      login: String(c.login),
      counts: normalizeCounts(c.counts),
      weekly: Array.isArray(c.weekly)
        ? c.weekly.map((w) => ({ week: String(w.week), commits: w.commits | 0, prs: w.prs | 0, reviews: w.reviews | 0, comments: w.comments | 0 })).sort((a, b) => a.week < b.week ? -1 : 1)
        : []
    }));
    const byLogin = new Map(contributors.map((c) => [c.login, c]));
    const weeklyMap = new Map();
    for (const c of contributors) {
      for (const w of c.weekly) {
        let agg = weeklyMap.get(w.week);
        if (!agg) { agg = { week: w.week, total: 0 }; weeklyMap.set(w.week, agg); }
        agg.total += w.commits + w.prs + w.reviews + w.comments;
      }
    }
    const weeklyTotals = [...weeklyMap.values()].sort((a, b) => a.week < b.week ? -1 : 1);
    const model = {
      repo: String(json.meta.repo || ""),
      totals: { contributors: json.totals.contributors | 0, commits: json.totals.commits | 0, prs: json.totals.prs | 0, reviews: json.totals.reviews | 0, comments: normalizeComments(json.totals.comments) },
      leaderboards: {
        commits: normalizeBoard(json.leaderboards.commits), prs: normalizeBoard(json.leaderboards.prs),
        reviews: normalizeBoard(json.leaderboards.reviews), comments: normalizeBoard(json.leaderboards.comments)
      },
      contributors, byLogin, weeklyTotals,
      latestWeek: weeklyTotals.length ? weeklyTotals[weeklyTotals.length - 1].week : null,
      tickerText: ""
    };
    model.tickerText = deriveTicker(model);
    return model;
  };

  const deriveTicker = (model) => {
    const t = model.totals, parts = [];
    parts.push(`${model.repo}  ${t.contributors} CONTRIBUTORS  ${t.commits} COMMITS  ${t.prs} PRS  ${t.reviews} REVIEWS  ${t.comments.all} COMMENTS`);
    if (model.latestWeek) {
      const active = model.contributors
        .map((c) => ({ c, w: c.weekly.find((w) => w.week === model.latestWeek) }))
        .filter((e) => e.w && e.w.commits + e.w.prs + e.w.reviews + e.w.comments > 0)
        .sort((a, b) => b.w.commits + b.w.prs + b.w.reviews + b.w.comments - (a.w.commits + a.w.prs + a.w.reviews + a.w.comments));
      parts.push(`WEEK ${model.latestWeek}:`);
      for (const { c, w } of active) {
        const bits = [];
        if (w.commits) bits.push(`${w.commits} COMMIT${w.commits === 1 ? "" : "S"}`);
        if (w.prs) bits.push(`${w.prs} PR${w.prs === 1 ? "" : "S"}`);
        if (w.reviews) bits.push(`${w.reviews} REVIEW${w.reviews === 1 ? "" : "S"}`);
        if (w.comments) bits.push(`${w.comments} COMMENT${w.comments === 1 ? "" : "S"}`);
        parts.push(`${displayLabel(c).toUpperCase()}: ${bits.join(" + ")}`);
      }
    }
    return parts.join("   ***   ");
  };

  const lifehashCache = new Map();
  const lifehashFor = (login) => {
    let img = lifehashCache.get(login);
    if (!img) {
      img = BL.lifehash.make(`contributor:${login}`);
      lifehashCache.set(login, img);
    }
    return img;
  };
  const drawIdenticon = (ctx, login, x, y) => {
    const { width, height, colors } = lifehashFor(login);
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const i = (r * width + c) * 3;
        ctx.fillStyle = `rgb(${colors[i]},${colors[i + 1]},${colors[i + 2]})`;
        ctx.fillRect(x + c, y + r, 1, 1);
      }
    }
  };

  const clearBoard = (ctx) => {
    ctx.fillStyle = PALETTE.screenBg;
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  };
  const header = (ctx, title, right) => {
    drawText(ctx, title, 3, 3, PALETTE.accent, 1);
    if (right) drawText(ctx, right, BOARD_W - 3 - measureText(right, 1), 3, PALETTE.dim, 1);
    ctx.fillStyle = PALETTE.dim;
    ctx.fillRect(0, 12, BOARD_W, 1);
  };
  const countTotal = (c) => c.commits + c.prs + c.reviews + c.comments.all;

  const renderTotals = (ctx, model) => {
    clearBoard(ctx);
    header(ctx, "ENTROPYLAB TOTALS", model.latestWeek || "");
    const t = model.totals;
    const rows = [
      ["CONTRIBUTORS", t.contributors, PALETTE.accent],
      ["COMMITS", t.commits, PALETTE.commits],
      ["PRS", t.prs, PALETTE.prs],
      ["REVIEWS", t.reviews, PALETTE.reviews],
      ["COMMENTS", t.comments.all, PALETTE.comments]
    ];
    let y = 17;
    for (const [label, value, color] of rows) {
      drawText(ctx, String(label), 6, y + 3, PALETTE.dim, 1);
      const v = String(value);
      drawText(ctx, v, BOARD_W - 66 - measureText(v, 2), y, color, 2);
      y += 15;
    }
    const spark = model.weeklyTotals.slice(-14);
    if (spark.length > 0) {
      const maxV = Math.max(...spark.map((w) => w.total), 1);
      const bw = 4, bx = BOARD_W - 6 - spark.length * bw, baseY = BOARD_H - 12, maxH = 56;
      spark.forEach((w, i) => {
        const h = Math.max(1, Math.round(w.total / maxV * maxH));
        ctx.fillStyle = i === spark.length - 1 ? PALETTE.accent : PALETTE.commits;
        ctx.fillRect(bx + i * bw, baseY - h, bw - 1, h);
      });
      const label = `${spark.length} WEEKS`;
      drawText(ctx, label, BOARD_W - 6 - measureText(label), baseY + 3, PALETTE.dim, 1);
    }
    return false;
  };

  const renderLeaderboard = (ctx, model, params) => {
    const type = params && params.type || "commits";
    const board = model.leaderboards[type] || [];
    const color = PALETTE[type] || PALETTE.accent;
    clearBoard(ctx);
    header(ctx, `TOP ${type.toUpperCase()}`, model.latestWeek || "");
    const top = board.slice(0, 7);
    const maxV = Math.max(...top.map((e) => e.count), 1);
    let y = 16;
    top.forEach((e, i) => {
      const c = model.byLogin.get(e.login);
      const label = fitText(displayLabel(c || e).toUpperCase(), 66, 1);
      drawText(ctx, String(i + 1), 4, y, i === 0 ? PALETTE.accent : PALETTE.dim, 1);
      drawText(ctx, label, 14, y, PALETTE.text, 1);
      const barX = 84, barMax = BOARD_W - barX - 30;
      ctx.fillStyle = color;
      ctx.fillRect(barX, y + 1, Math.max(1, Math.round(e.count / maxV * barMax)), 5);
      const v = String(e.count);
      drawText(ctx, v, BOARD_W - 4 - measureText(v, 1), y, color, 1);
      y += 13;
    });
    return false;
  };

  const renderContributor = (ctx, model, params) => {
    const login = params && params.login;
    const c = login && model.byLogin.get(login) || model.contributors[0];
    clearBoard(ctx);
    if (!c) {
      drawText(ctx, "NO CONTRIBUTORS", 40, 48, PALETTE.dim, 1);
      return false;
    }
    header(ctx, "CONTRIBUTOR", model.latestWeek || "");
    drawIdenticon(ctx, c.login, 6, 17);
    const name = fitText(displayLabel(c).toUpperCase(), BOARD_W - 50, 1);
    drawText(ctx, name, 44, 20, PALETTE.text, 1);
    const counts = [
      ["CM", c.counts.commits, PALETTE.commits],
      ["PR", c.counts.prs, PALETTE.prs],
      ["RV", c.counts.reviews, PALETTE.reviews],
      ["MSG", c.counts.comments.all, PALETTE.comments]
    ];
    let x = 44;
    for (const [label, value, color] of counts) {
      drawText(ctx, String(label), x, 42, PALETTE.dim, 1);
      drawText(ctx, String(value), x, 50, color, 1);
      x += 36;
    }
    const weeks = c.weekly.slice(-26);
    if (weeks.length > 0) {
      const maxV = Math.max(...weeks.map((w) => w.commits + w.prs + w.reviews + w.comments), 1);
      const bw = 5, bx = 6, baseY = BOARD_H - 12, maxH = 28;
      weeks.forEach((w, i) => {
        const total = w.commits + w.prs + w.reviews + w.comments;
        const h = Math.max(total > 0 ? 1 : 0, Math.round(total / maxV * maxH));
        if (h > 0) {
          ctx.fillStyle = i === weeks.length - 1 ? PALETTE.accent : PALETTE.prs;
          ctx.fillRect(bx + i * bw, baseY - h, bw - 1, h);
        }
      });
      drawText(ctx, `${weeks.length} WEEKS`, bx, baseY + 3, PALETTE.dim, 1);
    }
    return false;
  };

  const TICKER_SPEED = 30;
  // bandOnly repaints just the scrolling strip: the header and digest are the same pixels for the whole view.
  const renderTicker = (ctx, model, _params, t, bandOnly) => {
    if (!bandOnly) {
      clearBoard(ctx);
      header(ctx, "LIVE WIRE", model.latestWeek || "");
      const digest = [
        ["COMMITS", model.totals.commits, PALETTE.commits],
        ["PRS", model.totals.prs, PALETTE.prs],
        ["REVIEWS", model.totals.reviews, PALETTE.reviews],
        ["COMMENTS", model.totals.comments.all, PALETTE.comments]
      ];
      let x = 6;
      for (const [label, value, color] of digest) {
        drawText(ctx, String(label), x, 26, PALETTE.dim, 1);
        drawText(ctx, String(value), x, 36, color, 2);
        x += 46;
      }
    }
    const text = model.tickerText || "NO DATA";
    const tw = measureText(text, 1) + BOARD_W;
    const offset = (t || 0) * TICKER_SPEED % tw;
    const y = BOARD_H - 20;
    ctx.fillStyle = PALETTE.grid;
    ctx.fillRect(0, y - 4, BOARD_W, 15);
    drawText(ctx, text, BOARD_W - offset, y, PALETTE.accent, 1);
    return true;
  };

  const VIEWS = { totals: renderTotals, leaderboard: renderLeaderboard, contributor: renderContributor, ticker: renderTicker };

  const SW = 16 / 9, SH = 1, BORDER = 0.16, DEPTH = 0.14;
  // Wide thick frame: lit pixels keep a wood margin and sit back of the rails, so edge-on views show wood.
  const RAIL = (SH + 2 * BORDER) / 7.5;
  // DROP = how far the stand reaches below the cabinet's middle, so the hub seats it without copying numbers.
  const LEG_H = 0.34, FOOT_H = 0.06;
  const DROP = (SH + 2 * BORDER) / 2 + LEG_H + FOOT_H / 2;
  const OPEN_X = (SW + 2 * BORDER) / 2 - RAIL, OPEN_Y = (SH + 2 * BORDER) / 2 - RAIL;
  const MARGIN = 0.05;
  const FIT = Math.min(2 * (OPEN_X - MARGIN) / SW, 2 * (OPEN_Y - MARGIN) / SH);
  const FX = FIT, FY = FIT;
  const cabinetGeometry = cached(() => {
    const outerW = SW + 2 * BORDER, outerH = SH + 2 * BORDER;
    const t = RAIL;
    // Rails sit forward of the backing, never flush: coplanar faces make the board sparkle from either side.
    const parts = [
      // Backing is 0.024 narrower than the rails (0.012 a side): matching their extent flickers coplanar seams.
      box({ w: outerW - 0.024, h: outerH - 0.024, d: 0.06, color: PALETTE.plank, offset: { z: -0.04 } }),
      box({ w: outerW - 0.008, h: t, d: DEPTH, color: PALETTE.woodDark, offset: { y: outerH / 2 - t / 2, z: 0.02 } }),
      box({ w: outerW - 0.008, h: t, d: DEPTH, color: PALETTE.woodDark, offset: { y: -(outerH / 2 - t / 2), z: 0.02 } }),
      box({ w: t, h: outerH - 0.008, d: DEPTH - 0.008, color: PALETTE.woodDark, offset: { x: outerW / 2 - t / 2, z: 0.02 } }),
      box({ w: t, h: outerH - 0.008, d: DEPTH - 0.008, color: PALETTE.woodDark, offset: { x: -(outerW / 2 - t / 2), z: 0.02 } }),
      box({ w: 2 * OPEN_X + 0.04, h: 2 * OPEN_Y + 0.04, d: 0.06, color: PALETTE.screenBezel, offset: { z: 0.01 } })
    ];
    // No thin strips: edge-on they fall below a pixel and sparkle against the screen. Depth comes from chunky parts.
    const nx = outerW / 2 - t / 2, ny = outerH / 2 - t / 2;
    for (const [px, py] of [[-nx, ny], [nx, ny], [-nx, -ny], [nx, -ny]]) {
      parts.push(box({ w: 0.1, h: 0.1, d: 0.014, color: PALETTE.woodJoint, offset: { x: px, y: py, z: DEPTH / 2 + 0.025 } }));
      parts.push(box({ w: 0.07, h: 0.07, d: 0.028, color: PALETTE.nail, offset: { x: px, y: py, z: DEPTH / 2 + 0.042 } }));
    }
    const legX = SW / 2 - 0.18, legH = LEG_H, bottom = -outerH / 2;
    for (const sx of [-legX, legX]) {
      // Legs run up into the frame rather than butting flush against its underside.
      parts.push(box({ w: 0.12, h: legH, d: 0.12, color: PALETTE.woodDark, offset: { x: sx, y: bottom - legH / 2 + 0.015 } }));
      parts.push(box({ w: 0.3, h: FOOT_H, d: 0.3, color: PALETTE.standDark, offset: { x: sx, y: bottom - legH } }));
    }
    return merge(...parts);
  });

  // SCREEN_Z sits back of the rails' faces, just clear of the backing behind it.
  const SCREEN_Z = 0.046;
  const CONTENT_Z = 0.053;
  const PX_W = SW / BOARD_W, PX_H = SH / BOARD_H;

  const pushQuad = (geo, x0, x1, y0, y1, z, color, emissive) => {
    const base = geo.verts.length / 3;
    geo.verts.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z);
    geo.faces.push({ i: [base, base + 1, base + 2, base + 3], color, emissive });
  };

  // Only BAND_TOP..BOARD_H scrolls; the header and digest hold still, so the two are built and rebuilt apart.
  const BAND_TOP = BOARD_H - 26;
  const screenGeometryFrom = (ctx, y0 = 0, y1 = BOARD_H, withPanel = true) => {
    const geo = { verts: [], faces: [], lines: [] };
    // Face colors are 0-255 like models.js hexToRgb; the renderer normalizes at upload.
    if (withPanel) pushQuad(geo, -SW / 2, SW / 2, -SH / 2, SH / 2, SCREEN_Z, [10, 12, 10], 0.35);
    // Read back only the rows being rebuilt, not the whole board.
    const data = ctx.getImageData(0, y0, BOARD_W, y1 - y0).data;
    // Skip background (10,12,10) and the scanline tint (19,25,18): it would shimmer at distance.
    const skip = (r, g, b) => (r === 10 && g === 12 && b === 10) || (r === 19 && g === 25 && b === 18);
    for (let y = y0; y < y1; y++) {
      const wy0 = SH / 2 - (y + 1) * PX_H, wy1 = SH / 2 - y * PX_H;
      const row = (y - y0) * BOARD_W;
      let x = 0;
      while (x < BOARD_W) {
        const i = (row + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (skip(r, g, b)) { x++; continue; }
        let run = x + 1;
        while (run < BOARD_W) {
          const j = (row + run) * 4;
          if (data[j] !== r || data[j + 1] !== g || data[j + 2] !== b) break;
          run++;
        }
        pushQuad(geo, -SW / 2 + x * PX_W, -SW / 2 + run * PX_W, wy0, wy1, CONTENT_Z, [r, g, b], 0.9);
        x = run;
      }
    }
    geo.castShadow = false; // Thousands of tiny quads have no business in the shadow pass.
    return geo;
  };

  const create = ({ data, position = { x: 0, y: 0, z: 0 }, ry = 0, scale = 1 } = {}) => {
    const canvas = document.createElement("canvas");
    canvas.width = BOARD_W;
    canvas.height = BOARD_H;
    // willReadFrequently: each refresh reads the board back; without it Chrome warns and console-clean checks trip.
    const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });

    let model = null;
    try {
      model = parseStats(data);
    } catch (e) {
      model = null; // Bad data leaves model null (awaiting screen); the island must not break.
    }

    let view = { name: "totals", params: undefined };
    let cycleIndex = 0;
    let rotateEvery = 8;
    let lastSwitchAt = 0;
    let suspendUntil = 0;
    let lastTickerAt = 0;
    let dirty = true;
    let bandDirty = false;
    let animated = false;

    const cycle = (() => {
      const c = [
        { name: "totals" },
        { name: "leaderboard", params: { type: "commits" } },
        { name: "leaderboard", params: { type: "prs" } },
        { name: "leaderboard", params: { type: "reviews" } },
        { name: "leaderboard", params: { type: "comments" } }
      ];
      if (model) for (const entry of model.contributors.slice(0, 3)) c.push({ name: "contributor", params: { login: entry.login } });
      c.push({ name: "ticker" });
      return c;
    })();

    const renderBoard = (t, bandOnly) => {
      if (!model) {
        clearBoard(ctx);
        drawText(ctx, "OOGATRON", 62, 44, PALETTE.accent, 2);
        drawText(ctx, "AWAITING DATA", 57, 60, PALETTE.dim, 1);
        return false;
      }
      return !!(VIEWS[view.name] || VIEWS.totals)(ctx, model, view.params, t, bandOnly);
    };

    const node = createNode({
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: 0, y: ry, z: 0 },
      scale: { x: scale, y: scale, z: scale },
      geometry: cabinetGeometry()
    });
    // Drawn at board size then scaled in to clear the rails; z is left alone.
    const screenNode = createNode({ geometry: null, scale: { x: FX, y: FY, z: 1 } });
    addChild(node, screenNode);
    // The moving part, kept off the still part so a scroll never rebuilds it.
    const bandNode = createNode({ geometry: null, scale: { x: FX, y: FY, z: 1 } });
    addChild(node, bandNode);

    const swapGeometry = (target, geometry, renderer) => {
      const old = target.geometry;
      if (old === geometry) return;
      target.geometry = geometry;
      if (old && renderer && renderer.releaseGeometry) renderer.releaseGeometry(old);
    };
    const refresh = (t, renderer, wantBand = false) => {
      // Decided before painting, so the canvas and the geometry always agree.
      const band = wantBand && view.name === "ticker" && !!screenNode.geometry;
      animated = renderBoard(t, band);
      const scrolling = animated && view.name === "ticker";
      if (band) {
        swapGeometry(bandNode, screenGeometryFrom(ctx, BAND_TOP, BOARD_H, false), renderer);
      } else {
        swapGeometry(screenNode, screenGeometryFrom(ctx, 0, scrolling ? BAND_TOP : BOARD_H, true), renderer);
        swapGeometry(bandNode, scrolling ? screenGeometryFrom(ctx, BAND_TOP, BOARD_H, false) : null, renderer);
      }
      dirty = bandDirty = false;
    };

    const api = {
      node,
      get view() { return view; },
      setView(name, params) {
        if (!VIEWS[name]) return;
        view = { name, params };
        dirty = true;
      },
      nextView() {
        cycleIndex = (cycleIndex + 1) % cycle.length;
        view = cycle[cycleIndex];
        dirty = true;
      },
      autoRotate(seconds) {
        rotateEvery = seconds > 0 ? seconds : 0;
      },
      // Poke an Ooga -> their stats on the big screen, keyed by public handles/aliases.
      showContributor(name) {
        if (!model) return false;
        const login = model.byLogin.has(name) ? name : CONTRIBUTOR_ALIASES[String(name).toLowerCase()];
        if (!model.byLogin.has(login)) return false;
        view = { name: "contributor", params: { login } };
        dirty = true;
        suspendUntil = lastSwitchAt = -1; // -1 sentinel: resolved on the next update from elapsed.
        api._suspend = 14;
        return true;
      },
      update(elapsed, renderer) {
        if (api._suspend) {
          suspendUntil = elapsed + api._suspend;
          lastSwitchAt = elapsed;
          api._suspend = 0;
        }
        if (rotateEvery > 0 && elapsed >= suspendUntil && elapsed - lastSwitchAt >= rotateEvery) {
          lastSwitchAt = elapsed;
          api.nextView();
        }
        // Step the ticker every 0.25s, not every frame; when only the text moved rebuild the band, not the screen.
        if (animated && view.name === "ticker" && elapsed - lastTickerAt >= 0.25) {
          lastTickerAt = elapsed;
          bandDirty = true;
        }
        if (dirty) refresh(elapsed, renderer);
        else if (bandDirty) refresh(elapsed, renderer, true);
      },
      dispose(renderer) {
        if (renderer && renderer.releaseGeometry) {
          if (screenNode.geometry) renderer.releaseGeometry(screenNode.geometry);
          if (bandNode.geometry) renderer.releaseGeometry(bandNode.geometry);
          if (node.geometry) renderer.releaseGeometry(node.geometry);
        }
        screenNode.geometry = null;
        bandNode.geometry = null;
        node.geometry = null;
      }
    };
    return api;
  };

  BL.jumbotron = { create, parseStats, PALETTE, DROP };
})();
