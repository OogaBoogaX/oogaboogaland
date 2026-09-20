// Jumbotron board, ported from rules-without-rulers/oogatron (its jumbotron/data.js + views.js).
// Data baked in as BL.jumbotronData by scripts/jumbotron-data.mjs for the first paint;
// oogatron-live.js may push fresher payloads in through refreshData at runtime.
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

  const normalizeCounts = (counts) => ({
    commits: (counts && counts.commits || 0) | 0, prs: (counts && counts.prs || 0) | 0,
    reviews: (counts && counts.reviews || 0) | 0
  });
  const normalizeWeekly = (weekly) => Array.isArray(weekly)
    ? weekly.map((w) => ({ week: String(w.week), commits: w.commits | 0, prs: w.prs | 0, reviews: w.reviews | 0 })).sort((a, b) => a.week < b.week ? -1 : 1)
    : [];
  const normalizeBoard = (b) => Array.isArray(b) ? b.map((e) => ({ login: String(e.login), count: e.count | 0 })) : [];
  const displayLabel = (c) => c.login.startsWith("email:") ? "anonymous" : c.login;

  // Oogatron schema 2: org-wide totals/leaderboards plus a per-repo breakdown.
  const parseStats = (json) => {
    if (typeof json !== "object" || json === null) throw new Error("stats payload is not an object");
    if (!json.meta || json.meta.schema_version !== 2) throw new Error("unsupported stats schema_version");
    if (!Array.isArray(json.repos)) throw new Error("stats repos is not an array");
    if (!Array.isArray(json.contributors)) throw new Error("stats contributors is not an array");
    const contributors = json.contributors.map((c) => ({ login: String(c.login) }));
    const byLogin = new Map(contributors.map((c) => [c.login, c]));
    const repos = json.repos.map((r) => {
      const weekly = normalizeWeekly(r.weekly);
      return {
        name: String(r.name),
        totals: { contributors: (r.totals && r.totals.contributors || 0) | 0, ...normalizeCounts(r.totals) },
        weeklyTotals: weekly.map((w) => ({ week: w.week, total: w.commits + w.prs + w.reviews }))
      };
    });
    // Org-wide weekly series: the repos' weeks summed.
    const weeklyMap = new Map();
    for (const r of repos) {
      for (const w of r.weeklyTotals) {
        let agg = weeklyMap.get(w.week);
        if (!agg) { agg = { week: w.week, total: 0 }; weeklyMap.set(w.week, agg); }
        agg.total += w.total;
      }
    }
    const weeklyTotals = [...weeklyMap.values()].sort((a, b) => a.week < b.week ? -1 : 1);
    return {
      org: String(json.meta.org || ""),
      totals: { contributors: json.totals.contributors | 0, ...normalizeCounts(json.totals) },
      leaderboards: {
        commits: normalizeBoard(json.leaderboards.commits), prs: normalizeBoard(json.leaderboards.prs),
        reviews: normalizeBoard(json.leaderboards.reviews)
      },
      repos, contributors, byLogin, weeklyTotals,
      latestWeek: weeklyTotals.length ? weeklyTotals[weeklyTotals.length - 1].week : null
    };
  };

  const clearBoard = (ctx) => {
    ctx.fillStyle = PALETTE.screenBg;
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  };
  const header = (ctx, title, right) => {
    // Repo names can outrun the board (25 glyphs > 192px beside the week label),
    // so every header title truncates to the room the right label leaves.
    const roomForTitle = BOARD_W - 6 - (right ? measureText(right, 1) + 4 : 0);
    drawText(ctx, fitText(title, roomForTitle, 1), 3, 3, PALETTE.accent, 1);
    if (right) drawText(ctx, right, BOARD_W - 3 - measureText(right, 1), 3, PALETTE.dim, 1);
    ctx.fillStyle = PALETTE.dim;
    ctx.fillRect(0, 12, BOARD_W, 1);
  };

  // Shared body for the org (Live Wire) and per-repo totals boards:
  // headline counts left, weekly activity sparkline right.
  const renderTotalsBoard = (ctx, title, right, totals, weeklyTotals) => {
    clearBoard(ctx);
    header(ctx, title, right);
    const rows = [
      ["CONTRIBUTORS", totals.contributors, PALETTE.accent],
      ["COMMITS", totals.commits, PALETTE.commits],
      ["PRS", totals.prs, PALETTE.prs],
      ["REVIEWS", totals.reviews, PALETTE.reviews]
    ];
    let y = 20;
    for (const [label, value, color] of rows) {
      drawText(ctx, String(label), 6, y + 3, PALETTE.dim, 1);
      const v = String(value);
      drawText(ctx, v, BOARD_W - 66 - measureText(v, 2), y, color, 2);
      y += 18;
    }
    const spark = weeklyTotals.slice(-14);
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

  const renderTotals = (ctx, model) =>
    renderTotalsBoard(ctx, `${(model.org || "OOGABOOGAX").toUpperCase()} TOTALS`, model.latestWeek || "", model.totals, model.weeklyTotals);

  const renderRepo = (ctx, model, params) => {
    const repo = model.repos.find((r) => r.name === (params && params.name)) || model.repos[0];
    if (!repo) {
      clearBoard(ctx);
      drawText(ctx, "NO REPOS", 58, 48, PALETTE.dim, 1);
      return false;
    }
    return renderTotalsBoard(ctx, repo.name.toUpperCase(), model.latestWeek || "", repo.totals, repo.weeklyTotals);
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

  const VIEWS = { totals: renderTotals, repo: renderRepo, leaderboard: renderLeaderboard };
  // Repo boards are capped so the rotation stays under ~90s if the org grows.
  const MAX_REPO_BOARDS = 6;

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

  const screenGeometryFrom = (ctx) => {
    const geo = { verts: [], faces: [], lines: [] };
    // Face colors are 0-255 like models.js hexToRgb; the renderer normalizes at upload.
    pushQuad(geo, -SW / 2, SW / 2, -SH / 2, SH / 2, SCREEN_Z, [10, 12, 10], 0.35);
    const data = ctx.getImageData(0, 0, BOARD_W, BOARD_H).data;
    // Skip background (10,12,10) and the scanline tint (19,25,18): it would shimmer at distance.
    const skip = (r, g, b) => (r === 10 && g === 12 && b === 10) || (r === 19 && g === 25 && b === 18);
    for (let y = 0; y < BOARD_H; y++) {
      const wy0 = SH / 2 - (y + 1) * PX_H, wy1 = SH / 2 - y * PX_H;
      const row = y * BOARD_W;
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
    let dirty = true;

    // Rebuilt per model: live refreshes can change the repo roster.
    const cycle = () => {
      const c = [{ name: "totals" }];
      if (model) for (const repo of model.repos.slice(0, MAX_REPO_BOARDS)) c.push({ name: "repo", params: { name: repo.name } });
      c.push(
        { name: "leaderboard", params: { type: "commits" } },
        { name: "leaderboard", params: { type: "prs" } },
        { name: "leaderboard", params: { type: "reviews" } }
      );
      return c;
    };

    const renderBoard = () => {
      if (!model) {
        clearBoard(ctx);
        drawText(ctx, "OOGATRON", 62, 44, PALETTE.accent, 2);
        drawText(ctx, "AWAITING DATA", 57, 60, PALETTE.dim, 1);
        return;
      }
      (VIEWS[view.name] || VIEWS.totals)(ctx, model, view.params);
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

    const swapGeometry = (target, geometry, renderer) => {
      const old = target.geometry;
      if (old === geometry) return;
      target.geometry = geometry;
      if (old && renderer && renderer.releaseGeometry) renderer.releaseGeometry(old);
    };
    const refresh = (renderer) => {
      renderBoard();
      swapGeometry(screenNode, screenGeometryFrom(ctx), renderer);
      dirty = false;
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
        const c = cycle();
        cycleIndex = (cycleIndex + 1) % c.length;
        view = c[cycleIndex];
        dirty = true;
      },
      autoRotate(seconds) {
        rotateEvery = seconds > 0 ? seconds : 0;
      },
      // A fresh /v1/stats payload from the live poller; invalid data is
      // ignored so a worker hiccup can never blank the board.
      refreshData(json) {
        let next;
        try {
          next = parseStats(json);
        } catch (e) {
          return false;
        }
        model = next;
        // A repo view whose repo vanished falls back inside renderRepo.
        dirty = true;
        return true;
      },
      update(elapsed, renderer) {
        if (rotateEvery > 0 && elapsed - lastSwitchAt >= rotateEvery) {
          lastSwitchAt = elapsed;
          api.nextView();
        }
        if (dirty) refresh(renderer);
      },
      dispose(renderer) {
        if (renderer && renderer.releaseGeometry) {
          if (screenNode.geometry) renderer.releaseGeometry(screenNode.geometry);
          if (node.geometry) renderer.releaseGeometry(node.geometry);
        }
        screenNode.geometry = null;
        node.geometry = null;
      }
    };
    return api;
  };

  BL.jumbotron = { create, parseStats, PALETTE, DROP };
})();
