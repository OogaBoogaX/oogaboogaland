// Jumbotron board, ported from rules-without-rulers/oogatron (its jumbotron/data.js + views.js).
// Data baked in as BL.jumbotronData by scripts/jumbotron-data.mjs for the first paint;
// oogatron-live.js may push fresher payloads in through refreshData at runtime.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { box, merge, cached } = BL.models;
  const { createNode, addChild } = BL.scene;
  const { mat4 } = BL.math;

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
    issues: "#e5533d",
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
    "!": [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
    $: [0b00100, 0b01111, 0b10100, 0b01110, 0b00101, 0b11110, 0b00100]
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
    reviews: (counts && counts.reviews || 0) | 0, issues: (counts && counts.issues || 0) | 0,
    comments: (counts && counts.comments || 0) | 0
  });
  const normalizeWeekly = (weekly) => Array.isArray(weekly)
    ? weekly.map((w) => ({ week: String(w.week), commits: w.commits | 0, prs: w.prs | 0, reviews: w.reviews | 0, issues: w.issues | 0, comments: w.comments | 0 })).sort((a, b) => a.week < b.week ? -1 : 1)
    : [];
  const normalizeBoard = (b) => Array.isArray(b) ? b.map((e) => ({ login: String(e.login), count: e.count | 0 })) : [];
  const normalizeBoards = (lb) => ({
    commits: normalizeBoard(lb && lb.commits), prs: normalizeBoard(lb && lb.prs),
    reviews: normalizeBoard(lb && lb.reviews), comments: normalizeBoard(lb && lb.comments)
  });
  const displayLabel = (c) => c.login.startsWith("email:") ? "anonymous" : c.login;

  // Oogatron schema 3 (/v2/stats): org-wide totals/leaderboards, a per-repo
  // breakdown with its own leaderboards and last activity, plus the recent
  // contributions feed.
  const parseStats = (json) => {
    if (typeof json !== "object" || json === null) throw new Error("stats payload is not an object");
    if (!json.meta || json.meta.schema_version !== 3) throw new Error("unsupported stats schema_version");
    if (!Array.isArray(json.repos)) throw new Error("stats repos is not an array");
    if (!Array.isArray(json.contributors)) throw new Error("stats contributors is not an array");
    const contributors = json.contributors.map((c) => ({ login: String(c.login) }));
    const byLogin = new Map(contributors.map((c) => [c.login, c]));
    const repos = json.repos.map((r) => {
      const weekly = normalizeWeekly(r.weekly);
      return {
        name: String(r.name),
        totals: { contributors: (r.totals && r.totals.contributors || 0) | 0, ...normalizeCounts(r.totals) },
        lastActivityAt: typeof r.last_activity_at === "string" ? r.last_activity_at : null,
        leaderboards: normalizeBoards(r.leaderboards),
        weeklyTotals: weekly.map((w) => ({ week: w.week, total: w.commits + w.prs + w.reviews + w.issues + w.comments }))
      };
    });
    const recent = (Array.isArray(json.recent) ? json.recent : []).map((e) => ({
      login: String(e.login), repo: String(e.repo), type: String(e.type), occurredAt: String(e.occurred_at)
    }));
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
      generatedAt: String(json.meta.generated_at || ""),
      totals: { contributors: json.totals.contributors | 0, ...normalizeCounts(json.totals) },
      leaderboards: normalizeBoards(json.leaderboards),
      repos, recent, contributors, byLogin, weeklyTotals,
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
      ["REVIEWS", totals.reviews, PALETTE.reviews],
      ["ISSUES", totals.issues, PALETTE.issues],
      ["COMMENTS", totals.comments, PALETTE.comments]
    ];
    // Six rows: y=14 step 13 keeps the last scale-2 numeral clear of the nav strip.
    let y = 14;
    for (const [label, value, color] of rows) {
      drawText(ctx, String(label), 6, y + 3, PALETTE.dim, 1);
      const v = String(value);
      drawText(ctx, v, BOARD_W - 66 - measureText(v, 2), y, color, 2);
      y += 13;
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
    // Leaderboards are per repo; without a repo param the org boards show.
    const repo = params && params.repo ? model.repos.find((r) => r.name === params.repo) : null;
    const board = (repo ? repo.leaderboards : model.leaderboards)[type] || [];
    const color = PALETTE[type] || PALETTE.accent;
    clearBoard(ctx);
    header(ctx, `${repo ? repo.name.toUpperCase() + " " : ""}TOP ${type.toUpperCase()}`, model.latestWeek || "");
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

  const TYPE_COLOR = { commit: "commits", pr: "prs", review: "reviews", merge: "accent", issue: "issues", comment: "comments" };
  // Short relative age for the recent feed, against wall-clock now.
  const recentAge = (iso, nowMs = Date.now()) => {
    const ms = nowMs - Date.parse(iso);
    if (!Number.isFinite(ms) || ms < 0) return "NOW";
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}M`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}H`;
    return `${Math.floor(hours / 24)}D`;
  };

  // The opening board: who did what where, newest first.
  const renderRecent = (ctx, model) => {
    clearBoard(ctx);
    header(ctx, "RECENT", model.latestWeek || "");
    if (!model.recent.length) {
      drawText(ctx, "NO ACTIVITY", 52, 48, PALETTE.dim, 1);
      return false;
    }
    let y = 15;
    for (const e of model.recent.slice(0, 11)) {
      const color = PALETTE[TYPE_COLOR[e.type]] || PALETTE.accent;
      drawText(ctx, fitText(e.login.toUpperCase(), 60, 1), 4, y, PALETTE.text, 1);
      drawText(ctx, fitText(e.repo.toUpperCase(), 54, 1), 68, y, PALETTE.dim, 1);
      drawText(ctx, fitText(e.type.toUpperCase(), 42, 1), 126, y, color, 1);
      const age = recentAge(e.occurredAt);
      drawText(ctx, age, BOARD_W - 4 - measureText(age, 1), y, PALETTE.dim, 1);
      y += 8;
    }
    return false;
  };

  const VIEWS = { recent: renderRecent, totals: renderTotals, repo: renderRepo, leaderboard: renderLeaderboard };
  // Active-repo boards are capped so the rotation stays bounded as the org grows.
  const MAX_REPO_BOARDS = 6;
  const ACTIVE_WINDOW_MS = 7 * 24 * 3600 * 1000;

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

  // ---- Frame-mounted navigation chrome -------------------------------------
  // Arrows on the side rails and one indicator block per slide on the bottom
  // rail, in the cave sign's paper-white blocks (#f3efe4, gentle emissive) so
  // the cabinet reads like the island's other signage. Blocks sit proud of
  // the rail faces (0.086/0.09) — coplanar faces sparkle.
  const CHROME_WHITE = [243, 239, 228];
  const CHROME_DIM = [166, 166, 162];
  const OUTER_W = SW + 2 * BORDER, OUTER_H = SH + 2 * BORDER;
  const CHROME_CELL = 0.036, CHROME_PIXEL = 0.03;
  const ARROW_Z = 0.096, DOT_Z = 0.1, DOT_SIZE = 0.05;
  const RAIL_X = OUTER_W / 2 - RAIL / 2, RAIL_Y = OUTER_H / 2 - RAIL / 2;
  // 4x7 chevrons, rows top-first; mirrored for the right rail.
  const ARROW_LEFT = ["0001", "0010", "0100", "1000", "0100", "0010", "0001"];
  const ARROW_RIGHT = ARROW_LEFT.map((row) => [...row].reverse().join(""));
  const pushBlock = (geo, cx, cy, size, z, color, emissive) => {
    pushQuad(geo, cx - size / 2, cx + size / 2, cy - size / 2, cy + size / 2, z, color, emissive);
  };
  const pushArrow = (geo, rows, cx) => {
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        if (rows[r][c] !== "1") continue;
        const x = cx + (c - (rows[r].length - 1) / 2) * CHROME_CELL;
        const y = ((rows.length - 1) / 2 - r) * CHROME_CELL;
        pushBlock(geo, x, y, CHROME_PIXEL, ARROW_Z, CHROME_WHITE, 0.25);
      }
    }
  };
  // The dot row's geometry and hit-test share this layout; pitch shrinks so
  // the row stays clear of the corner joint plates however long the cycle.
  const dotLayout = (n) => {
    const pitch = Math.max(0.07, Math.min(0.11, (OUTER_W - 0.8) / Math.max(1, n)));
    return { pitch, x0: -((n - 1) * pitch) / 2 };
  };
  const chromeGeometryFrom = (count, current) => {
    const geo = { verts: [], faces: [], lines: [] };
    pushArrow(geo, ARROW_LEFT, -RAIL_X);
    pushArrow(geo, ARROW_RIGHT, RAIL_X);
    const { pitch, x0 } = dotLayout(count);
    for (let i = 0; i < count; i++) {
      const lit = i === current;
      pushBlock(geo, x0 + i * pitch, -RAIL_Y, DOT_SIZE, DOT_Z, lit ? CHROME_WHITE : CHROME_DIM, lit ? 0.9 : 0.12);
    }
    geo.castShadow = false;
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

    let view = { name: "recent", params: undefined };
    let cycleIndex = 0;
    let rotateEvery = 8;
    let lastSwitchAt = 0;
    let resetRotation = false;
    let dirty = true;
    // World->local for board taps, cached: the cabinet never moves once placed.
    const tapInverse = new Float32Array(16);
    let tapInverseValid = false;
    const TAP_P = [0, 0, 0], TAP_D = [0, 0, 0];

    // Repos idle for a week disappear from the rotation entirely; the clock
    // reference is the payload's own generated_at so the bake is deterministic.
    const activeRepos = () => {
      if (!model) return [];
      const ref = Date.parse(model.generatedAt) || Date.now();
      return model.repos
        .filter((r) => r.lastActivityAt && ref - Date.parse(r.lastActivityAt) <= ACTIVE_WINDOW_MS)
        .slice(0, MAX_REPO_BOARDS);
    };

    // Rebuilt per model: recent feed, org totals, then each active repo's
    // summary followed by its four leaderboards.
    const cycle = () => {
      const c = [{ name: "recent" }, { name: "totals" }];
      for (const repo of activeRepos()) {
        c.push({ name: "repo", params: { name: repo.name } });
        for (const type of ["commits", "prs", "reviews", "comments"]) {
          c.push({ name: "leaderboard", params: { type, repo: repo.name } });
        }
      }
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
    // The navigation chrome lives on the wood frame, unscaled cabinet space.
    const chromeNode = createNode({ geometry: null });
    addChild(node, chromeNode);
    let chromeKey = "";

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
    const refreshChrome = (renderer) => {
      const count = cycle().length;
      const current = cycleIndex % count;
      const key = `${count}:${current}`;
      if (key === chromeKey) return;
      chromeKey = key;
      swapGeometry(chromeNode, chromeGeometryFrom(count, current), renderer);
    };

    // A world ray -> board pixel, or null off the screen: invert the cabinet's
    // world matrix (the mirror-ripples pattern), intersect the screen plane in
    // local space, then map through the screen fit back to raster coordinates.
    const boardAt = (ray) => {
      if (!tapInverseValid) {
        mat4.invert(tapInverse, node.world);
        tapInverseValid = true;
      }
      mat4.transformPoint(TAP_P, tapInverse, ray.ox, ray.oy, ray.oz);
      TAP_D[0] = tapInverse[0] * ray.dx + tapInverse[4] * ray.dy + tapInverse[8] * ray.dz;
      TAP_D[1] = tapInverse[1] * ray.dx + tapInverse[5] * ray.dy + tapInverse[9] * ray.dz;
      TAP_D[2] = tapInverse[2] * ray.dx + tapInverse[6] * ray.dy + tapInverse[10] * ray.dz;
      if (!TAP_D[2]) return null;
      const t = (SCREEN_Z - TAP_P[2]) / TAP_D[2];
      if (t < 0) return null;
      const lx = TAP_P[0] + TAP_D[0] * t, ly = TAP_P[1] + TAP_D[1] * t;
      // Anywhere on the cabinet face counts; the linear mapping lets rail
      // taps land outside the 0..BOARD range and regionize naturally. The
      // shared SCREEN_Z plane under-corrects rail parallax by a few board
      // pixels at steep angles — the rail zones are generous enough.
      if (Math.abs(lx) > OUTER_W / 2 + 0.05 || Math.abs(ly) > OUTER_H / 2 + 0.05) return null;
      const bx = (lx / (SW * FX) + 0.5) * BOARD_W;
      const by = (0.5 - ly / (SH * FY)) * BOARD_H;
      return { bx, by, lx, ly };
    };

    const api = {
      node,
      get view() { return view; },
      setView(name, params) {
        if (!VIEWS[name]) return;
        view = { name, params };
        resetRotation = dirty = true;
      },
      nextView() {
        const c = cycle();
        cycleIndex = (cycleIndex + 1) % c.length;
        view = c[cycleIndex];
        resetRotation = dirty = true;
      },
      prevView() {
        const c = cycle();
        cycleIndex = (cycleIndex - 1 + c.length) % c.length;
        view = c[cycleIndex];
        resetRotation = dirty = true;
      },
      goToView(index) {
        const c = cycle();
        if (!Number.isInteger(index) || index < 0 || index >= c.length) return;
        cycleIndex = index;
        view = c[cycleIndex];
        resetRotation = dirty = true;
      },
      boardToWorld(bx, by) {
        const out = [0, 0, 0];
        mat4.transformPoint(
          out, node.world,
          (bx / BOARD_W - 0.5) * SW * FX,
          (0.5 - by / BOARD_H) * SH * FY,
          SCREEN_Z
        );
        return { x: out[0], y: out[1], z: out[2] };
      },
      // A tap resolved onto the cabinet: the side-rail arrows page, the
      // bottom-rail dots jump to their slide, and the screen (or the top
      // rail, or a miss into thin air) advances, as tapping the board always
      // has. Returns what it did, for checks.
      tapAt(ray) {
        const hit = boardAt(ray);
        if (!hit) {
          api.nextView();
          return "next";
        }
        if (hit.bx < 0) {
          api.prevView();
          return "prev";
        }
        if (hit.bx > BOARD_W) {
          api.nextView();
          return "next";
        }
        if (hit.by > BOARD_H) {
          const c = cycle();
          const { pitch, x0 } = dotLayout(c.length);
          const index = Math.max(0, Math.min(c.length - 1, Math.round((hit.lx - x0) / pitch)));
          api.goToView(index);
          return `dot:${index}`;
        }
        api.nextView();
        return "next";
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
        // Any manual slide change restarts the auto-rotate countdown.
        if (resetRotation) {
          lastSwitchAt = elapsed;
          resetRotation = false;
        }
        if (rotateEvery > 0 && elapsed - lastSwitchAt >= rotateEvery) {
          lastSwitchAt = elapsed;
          api.nextView();
          resetRotation = false;
        }
        if (dirty) refresh(renderer);
        refreshChrome(renderer);
      },
      dispose(renderer) {
        if (renderer && renderer.releaseGeometry) {
          if (screenNode.geometry) renderer.releaseGeometry(screenNode.geometry);
          if (chromeNode.geometry) renderer.releaseGeometry(chromeNode.geometry);
          if (node.geometry) renderer.releaseGeometry(node.geometry);
        }
        screenNode.geometry = null;
        chromeNode.geometry = null;
        node.geometry = null;
      }
    };
    return api;
  };

  // The 5x7 bitmap font and its helpers are the island's only readable type; the Mempool cave
  // carves its wall panels with the same glyphs so both boards read alike.
  BL.jumbotron = { create, parseStats, PALETTE, DROP, text: { FONT, GLYPH_W, GLYPH_H, TRACKING, glyphOf, measureText, drawText, fitText } };
})();
