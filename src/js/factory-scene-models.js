// Scene-only factory geometry. Shared island props and their model-cache owners stay in factory-models.js.
(() => {
  "use strict";
  const { BL, BOARD, BOARD_FACE, BOARD_VALUES, BRASS, BRONZE, BRONZE_DK, CAP, CAP_BLUE, CAP_ORANGE, COILS, COIN_R, CONDUIT_SAMPLES, CONSOLE, COOK, COPPER, COPPER_DK, CRYSTAL, CYAN, FALLS, FLOOR, FORGE_CONSOLE, FORGE_CY, FORGE_TRACKS, GOLD, HALL, IRON_BK, IRON_DK, IRON_LT, KIOSK, LABEL_FONT, LAYOUT, LEVEL, LINE_STEP, LOOKOUT_BEAM, MONITORS, ORANGE, OUTCROPS, PORCH_HALF, REB, RING_BRIDGES, SHAFTS, STEP, STONE, STONE_DK, STUDY, TAU, TIMBER, TIMBER_DK, TIMBER_LT, TRE, TUNNEL_BOX, TUNNEL_POST, TUNNEL_THEMES, WALL_LEAN, along, banner, beam, bevelBox, box, cached, chain, columnParts, conduitPath, deckParts, donationCorner, face, flame, forwardLathe, gem, geometry, groundUnder, hexToRgb, label, labelCache, lanternParts, lathe, makeVox, merge, models, moved, mulberry32, networkGlyph, noShadow, porchOf, prism, pushVert, railParts, ringLanding, shaded, smoothBitcoin, smoothBolt, span, stairParts, stationX, stationZ, torus, tube, tunnelFrame, turn, turnedX, turnedY, turnedZ, voxelGeometry } = window.BL.factoryModelsSceneKit;
  // Construction checkpoints (see build-tasks.js). They reach it only when sliced, so an unsliced build runs without it.
  const pause = function* (slice) { if (slice) yield* BL.buildTasks.pause(slice); };
  const ROCK_LT = "#75614f";
  const IRON = "#4a4d52";
  const BOLT = "#ffd84a";
  const EMBER = "#ff7a1e";
  // The walls' stone comes in cells this big and leans this far in over the hall's height.
  const WALL_CELL = 0.75;

  // ---- small builders ------------------------------------------------------------------------------

  // A flat slab of a convex outline [[x, z], ...] between the heights y0 and y1: planks cut to fit a curve or a slant.
  const slab = (outline, y0, y1, color) => {
    const geo = geometry(), rgb = hexToRgb(color), n = outline.length, v = geo.verts;
    const cx = outline.reduce((sum, p) => sum + p[0], 0) / n, cz = outline.reduce((sum, p) => sum + p[1], 0) / n, cy = (y0 + y1) / 2;
    const lo = outline.map(([x, z]) => pushVert(geo, x, y0, z)), hi = outline.map(([x, z]) => pushVert(geo, x, y1, z));
    const add = (ids) => {
      let nx = 0, ny = 0, nz = 0, mx = 0, my = 0, mz = 0;
      for (let k = 0; k < ids.length; k++) {
        const p = ids[k] * 3, q = ids[(k + 1) % ids.length] * 3;
        nx += (v[p + 1] - v[q + 1]) * (v[p + 2] + v[q + 2]);
        ny += (v[p + 2] - v[q + 2]) * (v[p] + v[q]);
        nz += (v[p] - v[q]) * (v[p + 1] + v[q + 1]);
        mx += v[p] / ids.length; my += v[p + 1] / ids.length; mz += v[p + 2] / ids.length;
      }
      face(geo, nx * (mx - cx) + ny * (my - cy) + nz * (mz - cz) < 0 ? ids.slice().reverse() : ids, rgb, { emissive: 0 });
    };
    add(hi);
    add(lo);
    for (let i = 0; i < n; i++) add([lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]]);
    return geo;
  };
  const bananaGlyph = (height, depth, emissive = 1) => BL.bananaIcon.geometry(height, depth, emissive);

  const ball = (r, color, emissive = 0, segments = 10) => lathe({ profile: Array.from({ length: 6 }, (_, k) => [Math.sin(k / 5 * Math.PI) * r, -Math.cos(k / 5 * Math.PI) * r]), segments, color, emissive });

  // A board of public numbers, as the concept hangs them by the rebalancer and the treasury: a title over a rule,
  // then a row a line, its label on the left and its value on the right in the value's colour: `sats` orange,
  // `count` blue, `ok` green, anything else pale. `width` in metres; the height follows the rows. Cached like a label.
  const DATA_TONES = { sats: "#ffb347", count: "#6fc8ff", ok: "#4fd08a" };
  const dataBoard = (title, rows, { width = 1.8, keep = true } = {}) => {
    const key = `${title}|${rows.join("|")}|${width}`;
    let out = keep ? labelCache.get(key) : null;
    if (out) return out;
    const w = 540, h = 90 + rows.length * 50, canvas = document.createElement("canvas"), g = canvas.getContext("2d");
    canvas.width = w;
    canvas.height = h;
    g.fillStyle = "#0d0b0a";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(236,226,206,0.5)";
    g.lineWidth = 3;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.textBaseline = "middle";
    g.fillStyle = "#f8f4ec";
    g.font = `bold 36px ${LABEL_FONT}`;
    g.fillText(title, 26, 42);
    g.fillStyle = "#ffb347";
    g.fillRect(26, 64, w - 52, 3);
    rows.forEach(([name, value, tone], i) => {
      const y = 100 + i * 50;
      g.textAlign = "left";
      g.fillStyle = "#d6cfc1";
      g.font = `30px ${LABEL_FONT}`;
      g.fillText(name, 26, y);
      g.textAlign = "right";
      g.fillStyle = DATA_TONES[tone] || "#f3ead8";
      g.font = `bold 30px ${LABEL_FONT}`;
      g.fillText(String(value), w - 26, y);
    });
    const W = width, H = W * h / w, face = picture(canvas, W, H, 0.03);
    const back = bevelBox({ w: W + 0.14, h: H + 0.14, d: 0.08, color: IRON_DK, bevel: 0.03, offset: { z: -0.02 } });
    back.castShadow = false;
    out = { face, back, width: W, height: H };
    if (keep) labelCache.set(key, out);
    return out;
  };
  // The rebalancer's middle board: MOVE LIQUIDITY over an arrow, in the blue of where the sats go.
  const moveBoard = cached(() => {
    const w = 300, h = 230, canvas = document.createElement("canvas"), g = canvas.getContext("2d");
    canvas.width = w;
    canvas.height = h;
    g.fillStyle = "#0e2742";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(143,216,255,0.6)";
    g.lineWidth = 3;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#bfe6ff";
    g.font = `bold 42px ${LABEL_FONT}`;
    g.fillText("MOVE", w / 2, 58);
    g.fillText("LIQUIDITY", w / 2, 110);
    g.strokeStyle = g.fillStyle = "#8fd8ff";
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(92, 172);
    g.lineTo(196, 172);
    g.stroke();
    g.beginPath();
    g.moveTo(222, 172);
    g.lineTo(188, 148);
    g.lineTo(188, 196);
    g.fill();
    const W = 1, H = W * h / w, face = picture(canvas, W, H, 0.03);
    const back = bevelBox({ w: W + 0.12, h: H + 0.12, d: 0.08, color: IRON_DK, bevel: 0.03, offset: { z: -0.02 } });
    back.castShadow = false;
    return { face, back };
  });

  // ---- timber: decks, posts, rails and stairs ------------------------------------------------------

  // ---- the hall ---------------------------------------------------------------------------------------

  // The cavern itself: a stone floor, craggy walls in stacked blocks, a vault hung with stalactites, rock
  // ledges under the high decks, and blue crystal and the glow of water running down the back. The vault has
  // its own mesh for birdseye views; the crystal and the falls, which glow, have no shadow.
  const hall = BL.models.cachedSteps(function* (slice = null) {
    const rand = mulberry32(2112), rock = [], ceiling = [], glow = [];
    const { halfW: W, back: B, front: F, h: H } = HALL;
    for (let x = -W; x < W; x += 4) { for (let z = B; z < F; z += 4) { yield* pause(slice);
      rock.push(box({ w: 4, h: 0.4, d: 4, color: STONE[Math.floor(rand() * 4)], offset: { x: x + 2, y: -0.2 - rand() * 0.06, z: z + 2 } }));
    } }
    // Walls: voxel stone in cells of WALL_CELL metres, leaning in as they rise and heaved in and out at two scales,
    // a shell three cells thick behind the face. Openings in the walls for the peer tunnels, the study hall and the
    // tunnel out: [wall, centre along it, bottom, top, half-width]; the walls are "back", "left", "right" and "front",
    // and along a wall is x for the back and front and z for the sides. Recesses, the donation kiosk's niche and the
    // donations board's, set the face back flat at a depth of their own instead: [..., half-width, depth].
    const openings = LAYOUT.tunnels.map((t) => [t.turn === 0 ? "back" : t.x < 0 ? "left" : "right", t.turn === 0 ? t.x : t.z, t.y - 0.5, t.y + 7.8, 4.3]);
    openings.push(["right", LAYOUT.study.z, LAYOUT.study.y - 0.5, LAYOUT.study.y + 9.5, 3.4], ["front", 0, 3, 10.5, 6.5]);
    const open = (wall, u, y) => openings.some(([w, c, y0, y1, half]) => w === wall && Math.abs(u - c) < half && y > y0 && y < y1);
    const recesses = donationCorner() ? [["right", LAYOUT.kiosk.z, LAYOUT.kiosk.y - 0.5, LAYOUT.kiosk.y + 5.6, 2, 1.6], ["right", LAYOUT.board.z, LAYOUT.board.y + 0.9, LAYOUT.board.y + 4.6, 2.3, 1.6]] : [];
    const recess = (wall, u, y) => {
      for (const [w, c, y0, y1, half, depth] of recesses) if (w === wall && Math.abs(u - c) < half && y > y0 && y < y1) return depth;
      return 0;
    };
    const C = WALL_CELL, v = makeVox(), cell = (m) => Math.floor(m / C);
    const hash = (a, b, k) => {
      let h = (a * 374761393 + b * 668265263 + k * 2147483647) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    // Value noise on a lattice of `size` metres, eased between its corners.
    const heave = (u, y, size, k) => {
      const fu = u / size, fy = y / size, iu = Math.floor(fu), iy = Math.floor(fy), tu = fu - iu, ty = fy - iy;
      const su = tu * tu * (3 - 2 * tu), sy = ty * ty * (3 - 2 * ty);
      const a = hash(iu, iy, k), b = hash(iu + 1, iy, k), c = hash(iu, iy + 1, k), d = hash(iu + 1, iy + 1, k);
      return (a + (b - a) * su) * (1 - sy) + (c + (d - c) * su) * sy;
    };
    const falls = FALLS;
    // A wall's face stands `depth` in from its line: half a metre, the lean, and the heave. `put` lays one of the
    // shell's cells, `d` of them back from the face, in the wall's own axes.
    const shell = (name, from, to, k, put) => {
      for (let iu = cell(from); iu <= cell(to); iu++) for (let iy = 0; iy * C < H + 1; iy++) {
        const u = (iu + 0.5) * C, y = (iy + 0.5) * C;
        if (open(name, u, y)) continue;
        // The back wall is smooth where the water runs down it.
        const groove = name === "back" && falls.some((f) => Math.abs(u - f) < 1.1);
        const depth = recess(name, u, y) || 0.5 + y / H * WALL_LEAN + (groove ? 0 : heave(u, y, 3.2, k) * 0.95 + hash(iu, iy, k + 9) * 0.3);
        const tone = hash(iu >> 1, iy >> 1, k + 3), color = tone < 0.1 ? 5 : 1 + Math.floor(hash(iu >> 1, iy >> 1, k + 5) * 3.99);
        for (let d = 0; d < 3; d++) put(iu, iy, depth, d, color);
      }
    };
    shell("back", -W - 1, W + 1, 1, (iu, iy, depth, d, c) => v.set(iu, iy, cell(B + depth) - d, c));
    yield* pause(slice);
    shell("front", -W - 1, W + 1, 2, (iu, iy, depth, d, c) => v.set(iu, iy, cell(F - depth) + d, c));
    yield* pause(slice);
    shell("left", B, F, 3, (iu, iy, depth, d, c) => v.set(cell(-W + depth) - d, iy, iu, c));
    yield* pause(slice);
    shell("right", B, F, 4, (iu, iy, depth, d, c) => v.set(cell(W - depth) + d, iy, iu, c));
    yield* pause(slice);
    const walls = voxelGeometry(v, { unit: C, palette: [null, ...STONE, ROCK_LT] });
    // The vault: slabs across the top and stalactites hanging from them in three tapering courses.
    for (let x = -W; x < W; x += 5) { for (let z = B; z < F; z += 5) { yield* pause(slice); ceiling.push(box({ w: 5.4, h: 2, d: 5.4, color: STONE[Math.floor(rand() * 4)], offset: { x: x + 2.5, y: H + rand() * 1.2, z: z + 2.5 } })); } }
    for (let i = 0; i < 70; i++) { yield* pause(slice);
      const x = (rand() * 2 - 1) * (W - 3), z = B + 2 + rand() * (F - B - 5), len = 1.4 + rand() * 3.6, s = 0.8 + rand() * 0.8;
      const top = H - 0.8, color = STONE[Math.floor(rand() * 4)];
      ceiling.push(
        box({ w: 0.9 * s, h: len * 0.45, d: 0.9 * s, color, offset: { x, y: top - len * 0.22, z } }),
        box({ w: 0.55 * s, h: len * 0.35, d: 0.55 * s, color, offset: { x, y: top - len * 0.62, z } }),
        box({ w: 0.25 * s, h: len * 0.22, d: 0.25 * s, color, offset: { x, y: top - len * 0.9, z } })
      );
    }
    // Rock ledges the high decks and tunnels sit on, stepped out of the walls.
    const ledge = (x, y, z, w, d) => {
      for (let k = 0; k < 3; k++) rock.push(box({ w: w - k * 0.8, h: y / 3 + 0.2, d: d - k * 0.6, color: STONE[(k + 1) % 4], offset: { x, y: y * (k + 0.5) / 3, z } }));
    };
    // Their tops stand just under the porches' planks.
    for (const t of LAYOUT.tunnels) {
      if (t.turn === 0) ledge(t.x, t.y - 0.4, t.z + 2.2, 8, 5);
      else ledge(t.x - Math.sign(t.x) * 2.4, t.y - 0.4, t.z, 7, 8);
    }
    // Blue crystal in clusters along the foot of the walls and on the ledges, and three falls of glowing water
    // down the back wall, as in the concept.
    const crystal = (x, y, z, s) => {
      for (let k = 0; k < 4; k++) {
        const a = rand() * TAU, lean = 0.2 + rand() * 0.3, h = s * (1 + rand() * 1.2), r = s * (0.16 + rand() * 0.1);
        const g = lathe({ profile: [[r, 0], [r * 0.9, h * 0.8], [0, h]], segments: 5, color: k % 2 ? CRYSTAL : "#7fc4ff", emissive: 0.75 });
        const c = Math.cos(a) * lean, sn = Math.sin(a) * lean;
        const v = g.verts;
        for (let i = 0; i < v.length; i += 3) { v[i] += v[i + 1] * c; v[i + 2] += v[i + 1] * sn; }
        glow.push(moved(g, x + Math.cos(a) * s * 0.3, y, z + Math.sin(a) * s * 0.3));
      }
    };
    for (let i = 0; i < 26; i++) { yield* pause(slice);
      const side = i % 3, t = rand();
      if (side === 0) crystal(-W + 1.5 + rand(), 0, B + 3 + t * (F - B - 8), 0.8 + rand() * 0.9);
      else if (side === 1) crystal(W - 1.5 - rand(), 0, B + 3 + t * (F - B - 8), 0.8 + rand() * 0.9);
      else crystal(-W + 4 + t * (2 * W - 8), 0, B + 1.8, 0.9 + rand());
    }
    for (const t of LAYOUT.tunnels) { crystal(t.x + (t.turn ? 0 : 3.6), t.y, t.z + (t.turn ? 3.4 : 1.4), 0.7); }
    // Outcrops on the left of the front of the pit, framing the view from the balcony.
    for (const [x, z, s] of OUTCROPS) {
      for (let k = 0; k < 4; k++) {
        const w = (3.6 - k * 0.7) * s, h = 1.4 * s;
        rock.push(box({ w, h, d: w * 0.9, color: STONE[(k + 2) % 4], offset: { x: x + (rand() - 0.5) * 0.6, y: h * (k + 0.5), z: z + (rand() - 0.5) * 0.6 } }));
      }
      crystal(x + 1.4 * s, 0, z - 1.2 * s, 0.9 * s);
    }
    for (const fx of FALLS) {
      for (let y = 0; y < 15; y += 1.5) { glow.push(box({ w: 1.1 + rand() * 0.5, h: 1.6, d: 0.3, color: y % 3 < 1.5 ? "#3f8fe0" : "#6ab8ff", emissive: 0.55 + rand() * 0.2, offset: { x: fx + (rand() - 0.5) * 0.3, y: y + 0.8, z: B + 1.4 + (y + 0.8) / H * WALL_LEAN } })); }
      // The pool each fall lands in.
      glow.push(moved(lathe({ profile: [[1.6, 0.05], [0, 0.05]], segments: 10, color: "#4a9bff", emissive: 0.5 }), fx, 0, B + 2.6));
    }
    yield* pause(slice);
    const roof = models.cutCylinder(merge(...ceiling), LAYOUT.cooker.x + COOK.lip[0], LAYOUT.cooker.z + COOK.lip[2], 0.29);
    return { rock: merge(...rock), ceiling: roof, walls, glow: noShadow(merge(...glow)) };
  });
  // Where a gallery's brackets go into the back wall: clear of the peer tunnels' frames under it and of the falls.
  const galleryBrackets = (g) => {
    const out = [];
    for (let x = g.x - g.w / 2 + 0.6; x <= g.x + g.w / 2 - 0.6; x += 0.2) {
      if (LAYOUT.tunnels.some((t) => t.turn === 0 && Math.abs(x - t.x) < 4.8) || FALLS.some((f) => Math.abs(x - f) < 1.3)) continue;
      if (!out.length || x - out[out.length - 1] >= 2.8) out.push(x);
    }
    return out;
  };

  // Decks, bridges, stairs and the core's walkway ring: all the timber, as one mesh.
  const scaffold = BL.models.cachedSteps(function* (slice = null) {
    const L = LAYOUT, geos = [], r = L.ring, R = r.outer - 0.15, e = L.entrance, [[, , a0, a1], [s1x0, s1x1, s1z0]] = L.walk;
    const place = (parts, x, y, z) => { for (const g of parts) geos.push(moved(g, x, y, z)); };
    // Whether (x, y, z) stands on a deck's rail line, where that rail's cut ends carry the posts.
    const DECKS = [...L.bays, L.switchboard, L.platform, L.lookout, ...L.galleries, e];
    const atRail = (x, y, z) => DECKS.some((d) => Math.abs(y - d.y) < 0.3 && Math.abs(x - d.x) < d.w / 2 + 0.2 && Math.abs(z - d.z) < d.d / 2 + 0.2 &&
      (Math.abs(Math.abs(x - d.x) - (d.w / 2 - 0.1)) < 0.15 || Math.abs(Math.abs(z - d.z) - (d.d / 2 - 0.1)) < 0.15));
    // A bridge's two sides, each from where it leaves the rail line `from` of what it starts on to where it meets the
    // rail line `to` of what it lands on: `t0` and `t1` the fractions along it, `a` and `b` the points. A line is a
    // function of a side's ends giving that fraction: the circle round the core's walkway going out, or a line x = x.
    const crossCircle = (rad) => (ax, az, bx, bz) => {
      const dx = bx - ax, dz = bz - az, cx = ax - r.x, cz = az - r.z, qa = dx * dx + dz * dz, qb = 2 * (cx * dx + cz * dz), qc = cx * cx + cz * cz - rad * rad;
      return (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa);
    };
    const crossX = (x) => (ax, az, bx) => (x - ax) / (bx - ax);
    const bridgeOf = (x0, z0, x1, z1, w, from, to) => {
      const len = Math.hypot(x1 - x0, z1 - z0), px = -(z1 - z0) / len * w / 2, pz = (x1 - x0) / len * w / 2;
      const sides = [-1, 1].map((s) => {
        const ax = x0 + px * s, az = z0 + pz * s, bx = x1 + px * s, bz = z1 + pz * s, t0 = from(ax, az, bx, bz), t1 = to(ax, az, bx, bz);
        const at = (t) => [ax + (bx - ax) * t, az + (bz - az) * t];
        return { t0, t1, at, a: at(t0), b: at(t1) };
      });
      return { x0, z0, x1, z1, w, len, sides };
    };
    const ringBridges = RING_BRIDGES.map(([x0, z0, x1, z1]) => {
      const line = Math.sign(x1) * (Math.abs(L.bays[3].x) - L.bays[3].w / 2 + 0.1);
      return { ...bridgeOf(x0, z0, x1, z1, 2, crossCircle(R), crossX(line)), line };
    });
    const topBridges = L.bridges.map(([x0, z0, x1, z1, w]) => bridgeOf(x0, z0, x1, z1, w, crossX(x0 - 0.1), crossX(x1 + 0.1)));
    // Where a stair, a bridge, a porch, the stairway or the walkway lands on a deck, as cuts on that deck's rail:
    // exactly as wide as the rails that arrive, which end on the cut's end posts.
    const landings = [];
    for (const [ax, ay, az, bx, by, bz, w] of L.stairs) {
      const l = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / l, dz = (bz - az) / l;
      landings.push([ax, ay, az, w / 2 + 0.05, dx, dz], [bx, by, bz, w / 2 + 0.05, -dx, -dz]);
    }
    for (const l of L.ladders) {
      landings.push([l.x, l.top, l.z, l.width / 2 + 0.15, l.nx, l.nz]);
      landings.push([l.x, l.bottom, l.z, l.width / 2 + 0.15, l.nx, l.nz]);
    }
    const cutAcross = ([p, q], y) => landings.push([(p[0] + q[0]) / 2, y, (p[1] + q[1]) / 2, Math.hypot(p[0] - q[0], p[1] - q[1]) / 2]);
    for (const bd of ringBridges) { cutAcross(bd.sides.map((sd) => sd.b), LEVEL.main); }
    for (const bd of topBridges) { for (const end of ["a", "b"]) { cutAcross(bd.sides.map((sd) => sd[end]), LEVEL.top); } }
    // The first gallery's front opens onto the landing, exactly between the flights' rails.
    const ld = L.landing;
    landings.push([ld.x, ld.y, ld.z - ld.d / 2 - 0.1, ld.w / 2 - 0.1]);
    for (const t of L.tunnels) {
      const b = L.bays[t.bay];
      landings.push(t.turn === 0 ? [t.x, t.y, b.z - b.d / 2 + 0.1, PORCH_HALF - 0.1] : [b.x + Math.sign(t.x) * (b.w / 2 - 0.1), t.y, t.z, PORCH_HALF - 0.1]);
    }
    const [gx, , , , gy1, , gw] = L.stairway;
    landings.push([gx, gy1, e.z - e.d / 2 + 0.1, gw / 2 + 0.1], [e.x + e.w / 2 - 0.1, e.y, (a0 + a1) / 2, (a1 - a0) / 2 - 0.1]);
    const cutsFor = (d) => landings.filter(([x, y, z]) => Math.abs(y - d.y) < 0.3 && Math.abs(x - d.x) < d.w / 2 + 1 && Math.abs(z - d.z) < d.d / 2 + 1).map(([x, , z, ...rest]) => [x - d.x, z - d.z, ...rest]);
    // A deck's posts reach down to whatever stands under each: a lower floor, a tunnel's rock ledge, or the pit.
    const deckAt = (d, rails, drop = (x, z) => d.y - groundUnder(d.x + x, d.z + z, d.y)) => place(deckParts(d.w, d.d, drop, rails, Math.round(d.x * 7 + d.z), cutsFor(d)), d.x, d.y, d.z);
    // Every deck is railed all round, open only where something lands on it; the galleries' backs are the wall, and
    // they hang from it on brackets rather than stand on posts, which would land in the porches below them.
    for (const b of L.bays) { yield* pause(slice); deckAt(b, "nsew"); }
    for (const d of [L.switchboard, L.platform]) { yield* pause(slice); deckAt(d, "nsew"); }
    // Kortik's switchboard stands along its west edge, where a rail would be.
    deckAt(L.kortik, "nse");
    yield* pause(slice);
    deckAt(L.lookout, "nsew");
    deckAt(L.lookoutDeck, "nsew", 0);
    deckAt(L.lookoutApproach, "ew", 0);
    // Brackets carry the lantern deck out from the tower's four legs.
    for (const sx of [-1, 1]) { for (const sz of [-1, 1]) { geos.push(beam(L.lookout.x + sx * 0.9, L.lookoutDeck.y - 1.4, L.lookout.z + sz * 0.9,
      L.lookout.x + sx * 2.2, L.lookoutDeck.y - 0.4, L.lookout.z + sz * 2.2, 0.16, TIMBER_DK)); } }
    // Rails extend above the landing as handholds; the rungs stop below the deck lip.
    for (const l of L.ladders) { yield* pause(slice);
      const tx = l.nz, tz = -l.nx;
      for (const side of [-1, 1]) { geos.push(beam(l.x + tx * side * l.width / 2, l.bottom, l.z + tz * side * l.width / 2,
        l.x + tx * side * l.width / 2, l.top + 1, l.z + tz * side * l.width / 2, 0.12, TIMBER_DK)); }
      const count = Math.ceil((l.top - l.bottom) / 0.3);
      for (let i = 1; i <= count; i++) {
        const y = l.bottom + (l.top - l.bottom - 0.15) * i / count;
        geos.push(beam(l.x - tx * l.width / 2, y, l.z - tz * l.width / 2, l.x + tx * l.width / 2, y, l.z + tz * l.width / 2, 0.09, TIMBER_LT));
      }
    }
    deckAt(L.landing, "s");
    for (const g of L.galleries) { yield* pause(slice);
      deckAt(g, "swe", 0);
      const back = HALL.back + 2, front = g.z + g.d / 2;
      for (const x of galleryBrackets(g)) {
        geos.push(beam(x, g.y - 0.55, back, x, g.y - 0.55, front - 0.2, 0.26, TIMBER_DK), beam(x, g.y - 2.9, back, x, g.y - 0.68, front - 0.7, 0.2, TIMBER));
        geos.push(bevelBox({ w: 0.4, h: 0.12, d: 0.4, color: IRON_DK, bevel: 0.02, offset: { x, y: g.y - 0.65, z: front - 0.7 } }));
      }
      // An end near a side wall is bracketed into it too.
      for (const s of [-1, 1]) {
        const end = g.x + s * g.w / 2, wall = s * (HALL.halfW - 2);
        if (Math.abs(wall - end) > 2.5) continue;
        for (const z of [g.z - g.d / 4, g.z + g.d / 4]) { geos.push(beam(wall, g.y - 0.55, z, end - s * 0.2, g.y - 0.55, z, 0.26, TIMBER_DK), beam(wall, g.y - 2.6, z, end - s * 0.6, g.y - 0.68, z, 0.2, TIMBER)); }
      }
    }
    // The balcony the visitor enters on, running out from the tunnel, open at its front to the stairway and on its
    // right to the walkway.
    deckAt(e, "nwe");
    // Level 2's walkway round the right wall, posted down to the pit floor and railed along the hall side from the
    // balcony's rail to the Harbor porch's, every corner one shared post; and each line's porch out to its peer
    // tunnel, railed along both sides from its deck's rail.
    for (const [x0, x1, z0, z1] of L.walk) { yield* pause(slice); place(deckParts(x1 - x0, z1 - z0, e.y, "", 17), (x0 + x1) / 2, e.y, (z0 + z1) / 2); }
    const ex = e.x + e.w / 2 - 0.1, wx = s1x0 + 0.1;
    place(railParts(ex, a0 + 0.1, wx, a0 + 0.1, [false, true]), 0, e.y, 0);
    place(railParts(ex, a1 - 0.1, s1x1 - 0.1, a1 - 0.1, [false, true]), 0, e.y, 0);
    place(railParts(wx, a0 + 0.1, wx, s1z0 - 0.1, [false, true]), 0, e.y, 0);
    for (const t of L.tunnels) { yield* pause(slice);
      const [x0, x1, z0, z1] = porchOf(t), b = L.bays[t.bay], s = Math.sign(t.x);
      place(deckParts(x1 - x0, z1 - z0, t.turn ? t.y : 0.3, "", 23), (x0 + x1) / 2, t.y, (z0 + z1) / 2);
      if (t.turn === 0) for (const x of [x0 + 0.1, x1 - 0.1]) { place(railParts(x, z0, x, z1 + 0.1, [true, false]), 0, t.y, 0); }
      else {
        const inner = b.x + s * (b.w / 2 - 0.1), face = t.x - s * 0.5;
        place(railParts(inner, z0 + 0.1, face, z0 + 0.1, [false, true]), 0, t.y, 0);
        // The Harbor line's porch meets the walkway along its hall-side edge.
        place(t.x > 0 ? railParts(inner, z1 - 0.1, wx, z1 - 0.1, [false, false]) : railParts(inner, z1 - 0.1, face, z1 - 0.1, [false, true]), 0, t.y, 0);
      }
    }
    // The core's walkway: a ring of planks round the chamber's foot, each cut to its wedge so the ring closes
    // without gaps at its rim, posted down to the pit.
    const planks = 28;
    for (let i = 0; i < planks; i++) { yield* pause(slice);
      const a = i / planks * TAU, a2 = (i + 1) / planks * TAU, edge = (rad, t) => [r.x + Math.cos(t) * rad, r.z + Math.sin(t) * rad];
      const seam = (rad) => 0.015 / rad;
      geos.push(slab([edge(r.inner, a + seam(r.inner)), edge(r.outer, a + seam(r.outer)), edge(r.outer, a2 - seam(r.outer)), edge(r.inner, a2 - seam(r.inner))], r.y - 0.2, r.y, i % 3 ? TIMBER : TIMBER_LT));
      // Posts under it every few planks, but where the forge's arch carries it and its lines run in.
      const cx = r.x + Math.cos(a) * (r.outer - 0.4), cz = r.z + Math.sin(a) * (r.outer - 0.4);
      if (i % 4 === 0 && !(Math.abs(cx - L.forge.x) < 3.3 && cz > L.forge.z - 1)) geos.push(...columnParts(cx, cz, 0, r.y - 0.2, 0.4));
    }
    // Its rail runs round the outside, open exactly between the rails of what arrives: the bridges to C and D where
    // they leave it and the stairs' landings where they cross it. Each gap is an arc [from, to] of the rail's circle
    // between two points on it; the rest is railed in chords, a post at each end of every gap.
    const gaps = [];
    const arcOf = (p, q) => {
      const c = Math.atan2(p[1] - r.z, p[0] - r.x);
      let d = Math.atan2(q[1] - r.z, q[0] - r.x) - c;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      gaps.push([c + Math.min(0, d), c + Math.max(0, d)]);
    };
    for (const bd of ringBridges) { arcOf(bd.sides[0].a, bd.sides[1].a); }
    // A stair up from the pit arrives beside the walkway: a landing cut to the walkway's curve carries it on, its
    // top flush with the planks, railed each side from the stair's rails to the walkway's.
    for (const [, , , bx, by, bz, w] of L.stairs) { yield* pause(slice); if (ringLanding(bx, by, bz)) {
      const o = w / 2 + 0.05, rim = (x) => r.z + Math.sqrt(R * R - (x - r.x) ** 2), plank = (x) => r.z + Math.sqrt((r.outer - 0.02) ** 2 - (x - r.x) ** 2);
      const x0 = bx - w / 2, x1 = bx + w / 2;
      geos.push(slab([[x0, bz], [x1, bz], [x1, Math.min(bz, plank(x1))], [x0, Math.min(bz, plank(x0))]], by - 0.2, by - 0.005, TIMBER_LT));
      const ends = [-1, 1].map((s) => [bx + s * o, rim(bx + s * o)]);
      for (const [x, z] of ends) { if (z < bz - 0.05) geos.push(...railParts(x, bz, x, z, [false, false]).map((g) => moved(g, 0, by, 0))); }
      arcOf(ends[0], ends[1]);
    } }
    for (const g of gaps) { const span = g[1] - g[0]; g[0] = (g[0] % TAU + TAU) % TAU; g[1] = g[0] + span; }
    gaps.sort((p, q) => p[0] - q[0]);
    gaps.forEach((g, i) => {
      const b0 = g[1], b1 = i + 1 < gaps.length ? gaps[i + 1][0] : gaps[0][0] + TAU, n = Math.max(1, Math.ceil((b1 - b0) * R / 1.5));
      for (let k = 0; k < n; k++) {
        const c0 = b0 + (b1 - b0) * k / n, c1 = b0 + (b1 - b0) * (k + 1) / n;
        geos.push(...railParts(r.x + Math.cos(c0) * R, r.z + Math.sin(c0) * R, r.x + Math.cos(c1) * R, r.z + Math.sin(c1) * R, [true, k === n - 1]).map((part) => moved(part, 0, r.y, 0)));
      }
    });
    // A bridge's planks are boards across it, flush just under the floors it joins and running on under them at
    // both ends; its rails run from rail line to rail line on the posts those rails end on, and its stringers the
    // planks' length.
    const bridge = (bd, y) => {
      const { x0, z0, x1, z1, w, len, sides } = bd, ta = Math.min(sides[0].t0, sides[1].t0) - 0.35 / len, tb = Math.max(sides[0].t1, sides[1].t1) + 0.35 / len;
      const n = Math.max(2, Math.round((tb - ta) * len / 0.45)), step = (tb - ta) * len / n, turn = Math.atan2((x1 - x0) / len, (z1 - z0) / len);
      for (let i = 0; i < n; i++) {
        const t = ta + (tb - ta) * (i + 0.5) / n;
        geos.push(moved(turnedY(bevelBox({ w: w + 0.08, h: 0.14, d: step - 0.04, color: i % 2 ? TIMBER : TIMBER_LT, bevel: 0.03 }), turn), x0 + (x1 - x0) * t, y - 0.09, z0 + (z1 - z0) * t));
      }
      for (const sd of sides) {
        geos.push(...railParts(sd.a[0], sd.a[1], sd.b[0], sd.b[1], [false, false]).map((g) => moved(g, 0, y, 0)));
        const [p, q] = [sd.at(ta), sd.at(tb)];
        geos.push(beam(p[0], y - 0.3, p[1], q[0], y - 0.3, q[1], 0.24, TIMBER_DK));
      }
    };
    for (const bd of ringBridges) { bridge(bd, LEVEL.main); }
    for (const bd of topBridges) { bridge(bd, LEVEL.top); }
    // The grand stairway from the balcony down to the forge: plank treads and risers between heavy stringers,
    // propped on posts, with a rail each side that ends on the balcony rail's posts.
    {
      const [x, y0, z0, , y1, z1, w] = L.stairway, steps = Math.round((y1 - y0) / 0.32), run = (z1 - z0) / steps, rise = (y1 - y0) / steps;
      const heightAt = (z) => y0 + (y1 - y0) * (z - z0) / (z1 - z0), top = z1 + 0.1;
      for (let i = 0; i < steps; i++) { yield* pause(slice);
        const ty = y0 + rise * (i + 1), z = z0 + run * (i + 0.5);
        geos.push(bevelBox({ w: w - 0.1, h: 0.12, d: run + 0.03, color: i % 2 ? TIMBER : TIMBER_LT, bevel: 0.03, offset: { x, y: ty - 0.06, z } }));
        geos.push(box({ w: w - 0.2, h: rise, d: 0.06, color: TIMBER_DK, offset: { x, y: ty - rise / 2, z: z - run / 2 + 0.03 } }));
      }
      for (const s of [-1, 1]) {
        const sx = x + s * (w / 2 + 0.1);
        geos.push(beam(sx, y0 - 0.1, z0, sx, y1 - 0.1, z1, 0.3, TIMBER_DK));
        geos.push(beam(sx, y0 + 1.05, z0 - 0.2, sx, heightAt(top) + 1.02, top, 0.14, TIMBER_LT), beam(sx, y0 + 0.6, z0 - 0.2, sx, heightAt(top) + 0.6, top, 0.09, TIMBER));
        for (let z = z0 + 0.1; z < z1 - 0.5; z += 1.5) { geos.push(bevelBox({ w: 0.17, h: 1.1, d: 0.17, color: TIMBER_DK, bevel: 0.03, offset: { x: sx, y: heightAt(z) + 0.5, z } }), bevelBox({ w: 0.25, h: 0.08, d: 0.25, color: TIMBER_LT, bevel: 0.02, offset: { x: sx, y: heightAt(z) + 1.08, z } })); }
        for (const z of [z0 + (z1 - z0) * 0.45, z0 + (z1 - z0) * 0.8]) { geos.push(...columnParts(sx, z, 0, heightAt(z) - 0.25, 0.34)); }
      }
    }
    for (const [ax, ay, az, bx, by, bz, w] of L.stairs) { yield* pause(slice); for (const g of stairParts(ax, ay, az, bx, by, bz, w, [!atRail(ax, ay, az), !atRail(bx, by, bz)])) { geos.push(g); } }
    return merge(...geos);
  });
  const supportAt = (x, z, feet) => {
    const F = FLOOR(), reach = feet + STEP;
    let best = 0;
    const R = F.rects;
    for (let i = 0; i < R.length; i += 5) {
      const y = R[i + 4];
      if (y > best && y <= reach && x >= R[i] && x <= R[i + 1] && z >= R[i + 2] && z <= R[i + 3]) best = y;
    }
    const D = F.discs;
    for (let i = 0; i < D.length; i += 4) {
      const dx = x - D[i], dz = z - D[i + 1], y = D[i + 3];
      if (y > best && y <= reach && dx * dx + dz * dz <= D[i + 2] * D[i + 2]) best = y;
    }
    const S = F.strips;
    for (let i = 0; i < S.length; i += 7) {
      const x0 = S[i], z0 = S[i + 1], dx = S[i + 2] - x0, dz = S[i + 3] - z0, len2 = dx * dx + dz * dz;
      const t = ((x - x0) * dx + (z - z0) * dz) / len2;
      if (t < 0 || t > 1) continue;
      const px = x0 + dx * t - x, pz = z0 + dz * t - z;
      if (px * px + pz * pz > S[i + 4] * S[i + 4]) continue;
      const y = S[i + 5] + (S[i + 6] - S[i + 5]) * t;
      if (y > best && y <= reach) best = y;
    }
    // The core's walkway: the ring of planks round the chamber's foot.
    const r = F.ring, d = Math.hypot(x - r.x, z - r.z);
    if (r.y > best && r.y <= reach && d >= r.inner + 0.1 && d <= r.outer - 0.2) best = r.y;
    return best;
  };
  // Whether a walker of `radius` whose feet are at `feet` can step from (ax, az) to (bx, bz): clear of everything
  // standing on the floors all the way, and never dropping more than a step. The scene's walkers and the tests share it.
  const walkable = (ax, az, bx, bz, feet, radius, height = 0) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.2));
    for (let i = 1; i <= steps; i++) {
      const x = ax + (bx - ax) * i / steps, z = az + (bz - az) * i / steps;
      const floor = supportAt(x, z, feet);
      const px = ax + (bx - ax) * (i - 1) / steps, pz = az + (bz - az) * (i - 1) / steps;
      if (!clearAt(x, z, Math.max(feet, floor), radius, height, px, pz) || floor < feet - STEP) return false;
    }
    return true;
  };
  // The treads share a continuous thin collision shell with their walking surface. Its underside is solid,
  // while the air below it stays open. A body already standing on the treads is above this shell.
  const stairCeilingAt = (x, z, feet, radius) => {
    const S = FLOOR().stairs;
    let ceiling = Infinity;
    for (let i = 0; i < S.length; i += 7) {
      const dx = S[i + 3] - S[i], dz = S[i + 5] - S[i + 2], len = Math.hypot(dx, dz);
      const along = ((x - S[i]) * dx + (z - S[i + 2]) * dz) / len;
      if (along < -radius || along > len + radius) continue;
      const across = Math.abs((x - S[i]) * dz - (z - S[i + 2]) * dx) / len;
      const end = Math.max(0, -along, along - len), side = Math.max(0, across - S[i + 6] / 2);
      if (end * end + side * side > radius * radius) continue;
      const top = S[i + 1] + (S[i + 4] - S[i + 1]) * Math.max(0, Math.min(1, along / len));
      if (feet < top - 0.02) ceiling = Math.min(ceiling, top - 0.28);
    }
    return ceiling;
  };
  // A movement query may escape an existing overlap, provided every overlapping shell gets farther away.
  // Ordinary point queries still report that overlap, and a sweep cannot enter any new shell.
  const clearAt = (x, z, feet, radius, height = 0, fromX = x, fromZ = z) => {
    if (Math.abs(x) > HALL.halfW - 2 || z < HALL.back + 2 || z > HALL.front - 0.4) return false;
    if (feet + height > stairCeilingAt(x, z, feet, radius) + 1e-6) return false;
    const B = FLOOR().blocks;
    for (let i = 0; i < B.length; i += 5) {
      if (feet < B[i + 3] || feet > B[i + 4]) continue;
      const dx = x - B[i], dz = z - B[i + 1], r = B[i + 2] + radius;
      const distance2 = dx * dx + dz * dz;
      if (distance2 >= r * r) continue;
      const ox = fromX - B[i], oz = fromZ - B[i + 1], old2 = ox * ox + oz * oz;
      if (old2 >= r * r || distance2 <= old2 + 1e-12 || ox * (x - fromX) + oz * (z - fromZ) < -1e-12) return false;
    }
    return true;
  };
  // Horizontal clearance alone cannot stop a fall entering a lower layer's obstacle. Resolve the new
  // contact at its rim as the feet cross its top, before the walker can land trapped inside it.
  const resolveFall = (p, fromX, fromZ, previousFeet, feet, radius) => {
    if (feet >= previousFeet || clearAt(p.x, p.z, feet, radius)) return false;
    const B = FLOOR().blocks;
    let moved = false;
    for (let pass = 0; pass < 4; pass++) {
      let contact = false;
      for (let i = 0; i < B.length; i += 5) {
        if (feet < B[i + 3] || feet > B[i + 4] || pass === 0 && previousFeet <= B[i + 4]) continue;
        let dx = p.x - B[i], dz = p.z - B[i + 1], distance = Math.hypot(dx, dz);
        const r = B[i + 2] + radius + 1e-4;
        if (distance >= r) continue;
        if (distance < 1e-8) {
          dx = fromX - B[i]; dz = fromZ - B[i + 1]; distance = Math.hypot(dx, dz);
          if (distance < 1e-8) { dx = 0; dz = 1; distance = 1; }
        }
        p.x = B[i] + dx / distance * r; p.z = B[i + 1] + dz / distance * r;
        contact = moved = true;
      }
      if (!contact || clearAt(p.x, p.z, feet, radius)) break;
    }
    return moved;
  };

  // ---- the node core ------------------------------------------------------------------------------------

  // The stone plinth from the pit to the walkway, the power drum above the walkway with its lava seams and blue
  // lamps, the chamber's bronze ribs and brass rings, the stepped crown with its windows, the lantern's cage, and
  // the chains that hold it all to the vault. The glass, the bolts and the lantern's flame are `coreChamber`, so
  // the scene can light and dim them.
  const coreBody = BL.models.cachedSteps(function* (slice = null) {
    const c = LAYOUT.core, [lo, hi] = c.chamber, M = LEVEL.main, round = [], flat = [];
    round.push(turn([[4.2, 0], [4.2, 0.5], [3.9, 0.7], [3.4, 0.9], [3.3, M - 0.6], [3.65, M - 0.35], [3.65, M - 0.2], [0, M - 0.2]], 20, (t) => t < 0.3 ? STONE[3] : STONE[2]));
    for (let k = 0; k < 8; k++) { yield* pause(slice);
      const a = (k + 0.5) / 8 * TAU;
      if (Math.abs(Math.sin(a) - 1) < 0.1) continue;
      flat.push(moved(turnedY(bevelBox({ w: 0.9, h: M - 1.2, d: 0.6, color: STONE_DK, bevel: 0.1 }), -a + Math.PI / 2), Math.cos(a) * 3.5, (M - 1.2) / 2 + 0.6, Math.sin(a) * 3.5));
    }
    round.push(turn([[3.25, M - 0.2], [3.3, M + 0.1], [3.08, M + 0.22], [3.08, lo - 0.34], [3.24, lo - 0.22], [3.24, lo], [0, lo]], 28, BRONZE_DK));
    // A seam of lava zigzagging round the drum, with short cracks running off it, and a ring of blue lamps over it.
    const rand = mulberry32(77), seam = 56, at = (a, y) => [Math.cos(a) * 3.1, y, Math.sin(a) * 3.1];
    for (let k = 0; k < seam; k++) { yield* pause(slice);
      const a0 = k / seam * TAU, a1 = (k + 1) / seam * TAU, y0 = M + 0.42 + (k % 2 ? 0.12 : -0.1) + rand() * 0.05, y1 = M + 0.42 + ((k + 1) % 2 ? 0.12 : -0.1);
      flat.push(beam(...at(a0, y0), ...at(a1, y1), 0.075, "#ff8a2a", 1));
      if (k % 4 === 1) flat.push(beam(...at(a0, y0), ...at(a0 + (rand() - 0.5) * 0.12, y0 + (rand() < 0.5 ? -0.3 : 0.3)), 0.05, "#ffb040", 1));
    }
    for (let k = 0; k < 16; k++) { yield* pause(slice);
      const a = (k + 0.5) / 16 * TAU;
      round.push(moved(ball(0.1, "#5fc0ff", 1, 8), Math.cos(a) * 3.1, lo - 0.55, Math.sin(a) * 3.1));
    }
    for (const y of [lo, hi]) { round.push(moved(torus(2.7, 0.2, BRASS, 0, 32, 8), 0, y, 0)); }
    // Eight heavy riveted ribs up the glass, set so the four bolts look out between them.
    for (let k = 0; k < 8; k++) { yield* pause(slice);
      const a = (k + 0.5) / 8 * TAU, r = 2.72;
      flat.push(moved(turnedY(bevelBox({ w: 0.42, h: hi - lo + 0.2, d: 0.36, color: BRONZE, bevel: 0.07 }), -a + Math.PI / 2), Math.cos(a) * r, (lo + hi) / 2, Math.sin(a) * r));
      for (let y = lo + 0.35; y < hi - 0.2; y += 0.5) { round.push(moved(ball(0.065, BRASS, 0, 6), Math.cos(a) * (r + 0.19), y, Math.sin(a) * (r + 0.19))); }
    }
    // A ring of blue lamps round the edge of the walkway the core stands in.
    const ring = LAYOUT.ring;
    for (let k = 0; k < 40; k++) { yield* pause(slice);
      const a = (k + 0.5) / 40 * TAU;
      round.push(moved(ball(0.075, "#5fc0ff", 1, 6), Math.cos(a) * (ring.outer + 0.03), ring.y - 0.12, Math.sin(a) * (ring.outer + 0.03)));
    }
    // The crown: three stepped tiers of copper, each with a band of lit windows, up to the lantern's base.
    round.push(turn([[2.95, hi], [3.12, hi + 0.25], [3.12, hi + 0.6], [2.72, hi + 0.8], [2.72, hi + 1.35], [2.24, hi + 1.55], [2.24, hi + 2.05],
      [1.64, hi + 2.25], [1.64, hi + 2.75], [1.0, hi + 2.95], [0.75, hi + 3.1], [0, hi + 3.1]], 28, (t) => t < 0.3 ? COPPER : t < 0.6 ? COPPER_DK : COPPER));
    for (const [r, y, n, h] of [[2.73, hi + 1.07, 14, 0.42], [2.25, hi + 1.8, 12, 0.38], [1.65, hi + 2.5, 9, 0.36]]) { yield* pause(slice);
      for (let k = 0; k < n; k++) {
        const a = (k + 0.5) / n * TAU;
        flat.push(moved(turnedY(box({ w: 0.2, h, d: 0.06, color: "#ffb347", emissive: 1 }), -a + Math.PI / 2), Math.cos(a) * r, y, Math.sin(a) * r));
      }
    }
    // A band of blue lights round the crown's lip, as on the concept's core.
    for (let k = 0; k < 24; k++) { yield* pause(slice);
      const a = (k + 0.5) / 24 * TAU;
      flat.push(moved(turnedY(box({ w: 0.3, h: 0.13, d: 0.05, color: "#5fc0ff", emissive: 1 }), -a + Math.PI / 2), Math.cos(a) * 3.14, hi + 0.42, Math.sin(a) * 3.14));
    }
    // The badge on the drum's front: a blue panel with four lit studs, facing the balcony.
    const by = lo - 0.75;
    flat.push(bevelBox({ w: 0.66, h: 0.66, d: 0.1, color: IRON_DK, bevel: 0.02, offset: { y: by, z: 3.2 } }), box({ w: 0.52, h: 0.52, d: 0.04, color: "#1f5fb8", emissive: 0.9, offset: { y: by, z: 3.26 } }));
    for (const [dx, dy] of [[-0.12, 0.12], [0.12, 0.12], [-0.12, -0.12], [0.12, -0.12]]) { flat.push(box({ w: 0.1, h: 0.1, d: 0.03, color: "#dff6ff", emissive: 1, offset: { x: dx, y: by + dy, z: 3.29 } })); }
    // The lantern: a brass base, six bars of cage round the flame and a copper dome with a finial.
    round.push(turn([[0.82, hi + 3.1], [0.82, hi + 3.28], [0.66, hi + 3.36], [0, hi + 3.36]], 16, BRASS));
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU;
      flat.push(bevelBox({ w: 0.1, h: 1.2, d: 0.1, color: BRASS, bevel: 0.02, offset: { x: Math.cos(a) * 0.62, y: hi + 3.96, z: Math.sin(a) * 0.62 } }));
    }
    round.push(turn([[0.86, hi + 4.52], [0.86, hi + 4.64], [0.34, hi + 5.1], [0.14, hi + 5.5], [0, hi + 5.56]], 16, COPPER_DK));
    round.push(moved(ball(0.16, BRASS, 0, 10), 0, hi + 5.66, 0));
    // Chains up to the vault from the crown.
    for (let k = 0; k < 4; k++) { yield* pause(slice);
      const a = (k + 0.5) / 4 * TAU, x = Math.cos(a) * 1.9, z = Math.sin(a) * 1.9;
      round.push(...chain(x, hi + 2.1, z, x * 1.4, HALL.h, z * 1.4, 0.2));
    }
    return moved(shaded(round, flat), c.x, 0, c.z);
  });
  // The glass chamber, the four bolts on it and the lantern's flame: lit while the node runs, dark when it stops.
  const coreChamber = cached(() => {
    const c = LAYOUT.core, [lo, hi] = c.chamber, mid = (lo + hi) / 2;
    // `surge` is the chamber in a big forward's flash: its glass white-gold, bolts and cracks white, the flame high.
    // `lime` is the chamber taking a tip: its glass green, bolts and cracks pale green, never a forward's white-gold.
    const build = (lit, surge = false, lime = false) => {
      const glass = turn([[2.44, lo], [2.5, lo + 0.45], [2.53, lo + 1.5], [2.53, hi - 1.5], [2.5, hi - 0.45], [2.44, hi]], 32,
        (t) => lime ? (t < 0.15 || t > 0.8 ? "#3fae2a" : t < 0.35 || t > 0.6 ? "#7fe04a" : "#d8ffa0") : surge ? (t < 0.15 || t > 0.8 ? "#ffb347" : t < 0.35 || t > 0.6 ? "#ffd27a" : "#fff2c8") : lit ? (t < 0.15 || t > 0.8 ? "#d65a1a" : t < 0.35 || t > 0.6 ? "#f5822c" : "#ffa640") : "#3a2418", lit ? (surge || lime ? 1 : 0.8) : 0.12);
      const flame = turn([[0.3, hi + 3.36], [surge ? 0.5 : 0.42, hi + 3.8], [surge ? 0.44 : 0.36, hi + (surge ? 4.5 : 4.25)], [0, hi + (surge ? 5 : 4.5)]], 14, lime ? "#eaffc8" : surge ? "#fff6d0" : lit ? "#ffe08a" : "#4a3420", lit ? 1 : 0.1);
      const bolts = [0, 1, 2, 3].map((k) => turnedY(moved(smoothBolt(3.6, 0.3, lime ? "#f4ffe0" : surge ? "#ffffff" : lit ? "#fff4c0" : "#6a4a2a", lit ? 1 : 0.15), 0, mid, 2.66), k * Math.PI / 2));
      // Molten cracks running out from behind each bolt across its window, as the concept's glass has them.
      const rand = mulberry32(501), cracks = [];
      for (let k = 0; k < 4; k++) for (let n = 0; n < 9; n++) {
        let u = (rand() - 0.5) * 0.9, v = (rand() - 0.5) * 2.6;
        const du = Math.sign(u || 1) * (0.5 + rand() * 0.5), dv = (rand() - 0.5) * 0.8;
        for (let seg = 0; seg < 3; seg++) {
          const u1 = Math.max(-0.82, Math.min(0.82, u + du * (0.22 + rand() * 0.18))), v1 = v + dv * 0.3 + (rand() - 0.5) * 0.3;
          cracks.push(turnedY(beam(u, mid + v, 2.57, u1, mid + v1, 2.57, 0.045, lime ? "#e6ffb0" : surge ? "#ffffff" : lit ? "#ffe89a" : "#5a3018", lit ? 1 : 0.1), k * Math.PI / 2));
          u = u1; v = v1;
        }
      }
      return noShadow(moved(shaded([glass, flame], [...bolts, ...cracks]), c.x, 0, c.z));
    };
    return { lit: build(true), dark: build(false), surge: build(true, true), lime: build(true, false, true) };
  });
  // A big forward's surge through the node: a ring of light that climbs the chamber (at unit radius; the scene sets
  // it round the chamber), and arcs of lightning from each Tesla coil's crown to the chamber's glass, three shapes a
  // coil that the scene flickers between.
  const coreRing = cached(() => noShadow(torus(2.78, 0.1, "#fff2c0", 1, 48, 8)));
  // A tip's ring: one lime band that climbs the chamber as the core takes the sats, fatter than a surge's.
  const coreRingLime = cached(() => noShadow(torus(2.78, 0.16, "#b6ff5a", 1, 48, 8)));
  const teslaArcs = cached(() => COILS.map(([x, z], i) => {
    const c = LAYOUT.core, rand = mulberry32(700 + i), top = [x, LEVEL.main + 2.35, z];
    const dx = x - c.x, dz = z - c.z, l = Math.hypot(dx, dz);
    return [0, 1, 2].map(() => {
      const end = [c.x + dx / l * 2.56, c.chamber[0] + 1.6 + rand() * 2.2, c.z + dz / l * 2.56], geos = [], pts = [top];
      for (let k = 1; k < 7; k++) {
        const f = k / 7, j = 0.32 * Math.sin(f * Math.PI);
        pts.push([top[0] + (end[0] - top[0]) * f + (rand() - 0.5) * j, top[1] + (end[1] - top[1]) * f + (rand() - 0.5) * j, top[2] + (end[2] - top[2]) * f + (rand() - 0.5) * j]);
      }
      pts.push(end);
      for (let k = 0; k + 1 < pts.length; k++) geos.push(beam(...pts[k], ...pts[k + 1], 0.06, k % 2 ? "#dffaff" : "#ffffff", 1));
      for (const k of [2, 4]) {
        const [px, py, pz] = pts[k];
        geos.push(beam(px, py, pz, px + (rand() - 0.5) * 0.9, py + (rand() - 0.2) * 0.7, pz + (rand() - 0.5) * 0.9, 0.035, "#bff4ff", 1));
      }
      return noShadow(merge(...geos));
    });
  }));
  const CONDUIT_FLARE = [[0.6, 0], [0.57, 0.05], [0.49, 0.14], [0.42, 0.25], [0.38, 0.37], [0.36, 0.48]];
  const conduits = BL.models.cachedSteps(function* (slice = null) {
    const round = [], glass = [], lamps = [], paths = [];
    for (const bay of LAYOUT.bays) { yield* pause(slice);
      const path = conduitPath(bay), samples = new Float32Array((CONDUIT_SAMPLES + 1) * 3);
      let length = 0;
      for (let i = 0; i <= CONDUIT_SAMPLES; i++) {
        const p = path(i / CONDUIT_SAMPLES);
        samples[i * 3] = p.x; samples[i * 3 + 1] = p.y; samples[i * 3 + 2] = p.z;
        if (i) length += Math.hypot(p.x - samples[i * 3 - 3], p.y - samples[i * 3 - 2], p.z - samples[i * 3 - 1]);
      }
      paths.push(samples);
      glass.push(tube({ path, radius: () => 0.36, rings: 48, segments: 18, colorFn: () => "#ffe6c0", emissive: 0.1 }));
      const at = (t, build) => {
        const p = path(t), a = path(Math.max(0, t - 0.01)), b = path(Math.min(1, t + 0.01));
        return along(build(), p.x, p.y, p.z, b.x - a.x, b.y - a.y, b.z - a.z);
      };
      const flanges = Math.max(2, Math.round(length / 1.5));
      for (let i = 1; i < flanges; i++) { round.push(at(i / flanges, () => turn([[0.36, -0.1], [0.46, -0.1], [0.5, -0.06], [0.5, 0.06], [0.46, 0.1], [0.36, 0.1]], 16, BRASS))); }
      for (const [t, toward] of [[0, 0.02], [1, 0.98]]) {
        const p = path(t), q = path(toward);
        round.push(along(turn(CONDUIT_FLARE, 18, BRONZE), p.x, p.y, p.z, q.x - p.x, q.y - p.y, q.z - p.z));
      }
      let top = 0;
      for (let i = 1; i < CONDUIT_SAMPLES; i++) { if (samples[i * 3 + 1] > samples[top * 3 + 1]) top = i; }
      const peak = path(top / CONDUIT_SAMPLES);
      round.push(at(top / CONDUIT_SAMPLES, () => turn([[0.36, -0.16], [0.48, -0.16], [0.52, -0.12], [0.52, 0.12], [0.48, 0.16], [0.36, 0.16]], 16, BRONZE)));
      round.push(moved(turn([[0.1, 0], [0.1, 0.22], [0, 0.24]], 10, BRONZE), peak.x, peak.y + 0.46, peak.z), ...chain(peak.x, HALL.h + 0.5, peak.z, peak.x, peak.y + 0.7, peak.z, 0.12, IRON_DK));
      // Glowing bands along the pipe, orange for the node's own side of the line, as the concept lights them.
      const bands = Math.round(length / 0.9);
      for (let i = 1; i < bands; i++) { lamps.push(at((i - 0.5) / bands, () => turn([[0.36, -0.05], [0.39, -0.03], [0.39, 0.03], [0.36, 0.05]], 18, i % 2 ? "#ff9a30" : "#ffc060", 1))); }
    }
    yield* pause(slice);
    const tubes = noShadow(shaded(glass));
    tubes.glass = 0.2;
    return { pipe: shaded(round), glass: tubes, glow: noShadow(shaded(lamps)), paths };
  });
  const stationFrame = BL.models.cachedSteps(function* (slice = null) {
    const round = [], flat = [];
    yield* pause(slice);
    [-1.2, 1.2].forEach((x, side) => {
      round.push(moved(turn([[0.86, 0], [0.86, 0.3], [0.8, 0.36], [0.8, 0.55], [0.72, CAP.foot], [0, CAP.foot]], 22, BRONZE), x, 0, 0));
      round.push(moved(turn([[CAP.r + 0.02, CAP.top], [0.86, CAP.top + 0.05], [0.86, CAP.top + 0.4], [0.78, CAP.top + 0.45], [0.78, CAP.top + 0.52], [0.5, CAP.top + 0.56], [0, CAP.top + 0.58]], 22, BRONZE), x, 0, 0));
      round.push(moved(turn([[0.12, CAP.top + 0.56], [0.12, CAP.top + 0.78], [0.2, CAP.top + 0.83], [0.2, CAP.top + 0.93], [0, CAP.top + 0.95]], 10, BRASS), x, 0, 0));
      for (const y of [CAP.foot + 0.04, CAP.top - 0.03]) round.push(moved(torus(CAP.r + 0.03, 0.06, BRASS, 0, 22, 6), x, y, 0));
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * TAU;
        round.push(moved(ball(0.04, BRASS, 0, 6), x + Math.cos(a) * 0.87, CAP.top + 0.22, Math.sin(a) * 0.87), moved(ball(0.04, BRASS, 0, 6), x + Math.cos(a) * 0.87, 0.16, Math.sin(a) * 0.87));
      }
      for (let k = 0; k < 8; k++) {
        const a = (k + 0.5) / 8 * TAU;
        round.push(moved(ball(0.065, "#ffb040", 1, 8), x + Math.cos(a) * 0.66, CAP.top + 0.55, Math.sin(a) * 0.66));
      }
      // The foot's screen and lamps, in the tank's own colour.
      flat.push(moved(box({ w: 0.38, h: 0.16, d: 0.04, color: side ? "#ffa040" : "#5fc0ff", emissive: 0.95 }), x, 0.34, 0.83));
      [-0.3, 0.3].forEach((dx) => round.push(moved(ball(0.05, side ? "#ffc84a" : "#8fe0ff", 1, 8), x + dx, 0.34, 0.8)));
    });
    // Iron corner plates squaring off each cap and foot, as the concept's tanks have them.
    for (const x of [-1.2, 1.2]) { for (let k = 0; k < 4; k++) { yield* pause(slice);
      const a = (k + 0.5) / 4 * TAU;
      for (const [y, h] of [[CAP.top + 0.22, 0.44], [0.3, 0.52]]) { flat.push(moved(turnedY(bevelBox({ w: 0.26, h, d: 0.1, color: IRON_DK, bevel: 0.02 }), -a + Math.PI / 2), x + Math.cos(a) * 0.88, y, Math.sin(a) * 0.88)); }
    } }
    // Arms out from the posts' tops for the station's two lanterns.
    for (const s of [-1, 1]) { flat.push(beam(s * 2.25, 3.95, -0.6, s * 3.1, 3.95, -0.6, 0.14, TIMBER_DK), beam(s * 2.4, 3.4, -0.6, s * 2.85, 3.92, -0.6, 0.08, TIMBER)); }
    // The control panel between the tanks: a pedestal, an upright screen with green bars, and keys.
    flat.push(bevelBox({ w: 0.62, h: 0.85, d: 0.42, color: IRON_DK, bevel: 0.04, offset: { y: 0.425, z: 0.62 } }));
    const panel = [bevelBox({ w: 0.6, h: 0.42, d: 0.08, color: IRON, bevel: 0.03 }), box({ w: 0.5, h: 0.32, d: 0.02, color: "#123a2a", emissive: 0.8, offset: { z: 0.05 } })];
    for (let k = 0; k < 4; k++) { panel.push(box({ w: 0.07, h: 0.06 + k * 0.05, d: 0.02, color: "#5fff7a", emissive: 1, offset: { x: -0.15 + k * 0.1, y: -0.12 + (0.06 + k * 0.05) / 2, z: 0.07 } })); }
    flat.push(moved(merge(...panel), 0, 1.05, 0.72));
    for (let k = 0; k < 5; k++) { flat.push(box({ w: 0.08, h: 0.03, d: 0.07, color: ["#ff5a3a", "#ffc83a", "#5fb8ff", "#5fe36a", "#ff5a3a"][k], emissive: 0.95, offset: { x: -0.2 + k * 0.1, y: 0.86, z: 0.8 } })); }
    flat.push(bevelBox({ w: 4.4, h: 3.7, d: 0.16, color: "#7c4424", bevel: 0.05, offset: { y: 2, z: -0.95 } }));
    for (let i = 0; i < 13; i++) { for (const y of [0.3, 3.7]) { yield* pause(slice); round.push(moved(ball(0.05, BRASS, 0, 6), -2 + i * 0.333, y, -0.86)); } }
    for (const x of [-2.4, 2.4]) { flat.push(bevelBox({ w: 0.36, h: 4.3, d: 0.36, color: BRONZE, bevel: 0.06, offset: { x, y: 2.15, z: -0.6 } })); }
    flat.push(bevelBox({ w: 5.2, h: 0.34, d: 0.44, color: BRONZE_DK, bevel: 0.06, offset: { y: 4.15, z: -0.6 } }));
    for (let i = 0; i < 9; i++) { yield* pause(slice); round.push(moved(ball(0.07, "#ffb040", 1, 8), -2 + i * 0.5, 4.36, -0.45)); }
    round.push(tube({ path: (t) => ({ x: -1.2 + 2.4 * t, y: CAP.top + 0.9 + Math.sin(Math.PI * t) * 0.3, z: 0 }), radius: () => 0.1, rings: 16, segments: 8, colorFn: () => COPPER }));
    return shaded(round, flat);
  });
  // A capacitor's glass: a column of light with a big white sign on a halo of its own colour, a glow at its foot, a
  // shine down its left and bubbles rising; dim at rest and lit for a flash, and the scene swaps the two.
  const capacitor = cached(() => {
    const build = (tone, lit) => {
      const [edge, core] = lit ? tone.lit : tone.dim, rand = mulberry32(tone === CAP_BLUE ? 7 : 8), mid = (CAP.foot + CAP.top) / 2;
      const glass = turn([[CAP.r - 0.02, CAP.foot], [CAP.r + 0.01, CAP.foot + 0.3], [CAP.r + 0.02, mid], [CAP.r + 0.01, CAP.top - 0.3], [CAP.r - 0.02, CAP.top]], 24,
        (t) => t > 0.2 && t < 0.75 ? core : edge, lit ? 1 : 0.8);
      // The orange tank, the node's side of the line, wears the bolt; the blue one, the peer's side, the network.
      const sign = tone === CAP_BLUE ? networkGlyph : smoothBolt;
      const flat = [moved(sign(2.15, 0.05, tone.halo, 1), 0, mid + 0.02, CAP.r + 0.04), moved(sign(1.75, 0.12, lit ? "#ffffff" : "#fbf6ea", 1), 0, mid, CAP.r + 0.1)];
      flat.push(moved(turnedY(box({ w: 0.08, h: 1.7, d: 0.02, color: "#ffffff", emissive: lit ? 1 : 0.7 }), -0.62), Math.sin(-0.62) * (CAP.r + 0.02), mid + 0.05, Math.cos(-0.62) * (CAP.r + 0.02)));
      const round = [glass, moved(torus(CAP.r - 0.06, 0.07, tone.halo, 1, 22, 6), 0, CAP.foot + 0.1, 0)];
      for (let i = 0; i < 10; i++) {
        const a = (rand() - 0.5) * 1.9, y = CAP.foot + 0.2 + rand() * (CAP.top - CAP.foot - 0.4), r = 0.03 + rand() * 0.04;
        round.push(moved(ball(r, tone.halo, 1, 6), Math.sin(a) * (CAP.r + 0.01), y, Math.cos(a) * (CAP.r + 0.01)));
      }
      return noShadow(shaded(round, flat));
    };
    return {
      blue: { dim: build(CAP_BLUE, false), lit: build(CAP_BLUE, true) },
      orange: { dim: build(CAP_ORANGE, false), lit: build(CAP_ORANGE, true) }
    };
  });

  // Each line's peer channel: rather than a pipe along the floor for walkers to trip on, a channel of glass let into
  // the planks and lit in the peer's blue, running from a bronze shoe at the foot of the line's blue tank, the one on
  // the tunnel's side, across the deck and the porch to the threshold of its peer tunnel, between bronze rims with a
  // bronze disc at each turn and a bar at the tunnel. Flush with the floor, it carries the line into the tunnel and
  // never stands in the way. For A and B it runs out behind the tank, for C and D out to its side.
  const peerPipes = BL.models.cachedSteps(function* (slice = null) {
    const flat = [], glow = [];
    const disc = (r, x, y, z) => moved(turn([[r, 0], [r, 0.03], [r - 0.03, 0.04], [0, 0.04]], 20, BRONZE), x, y, z);
    for (const t of LAYOUT.tunnels) { yield* pause(slice);
      const b = LAYOUT.bays[t.bay], s = Math.sign(b.x), x0 = stationX(b) + s * 1.2, z0 = stationZ(b), y = b.y;
      const pts = t.turn === 0
        ? [[x0, z0 - 0.8], [x0, z0 - 1.6], [t.x + s * 0.7, z0 - 2.3], [t.x + s * 0.7, t.z + 0.6]]
        : [[x0 + s * 0.8, z0 + 0.3], [t.x - s * 0.5, z0 + 0.3]];
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
        const piece = (geo, u, off) => moved(turnedY(geo, Math.atan2(ux, uz)), ax + ux * u - uz * off, y, az + uz * u + ux * off);
        for (const off of [-0.14, 0.14]) { flat.push(piece(box({ w: 0.06, h: 0.03, d: len, color: BRONZE, offset: { y: 0.015 } }), len / 2, off)); }
        const n = Math.max(1, Math.round(len / 0.45));
        for (let k = 0; k < n; k++) { glow.push(piece(box({ w: 0.22, h: 0.02, d: len / n - 0.04, color: k % 2 ? "#3fa7ff" : "#8fd8ff", emissive: 1, offset: { y: 0.01 } }), (k + 0.5) * len / n, 0)); }
        if (i > 0) flat.push(disc(0.2, ax, y, az));
      }
      // The shoe under the tank's foot, and the bar across the channel's end at the tunnel.
      const [sx, sz] = pts[0], [ex, ez] = pts[pts.length - 1], [px, pz] = pts[pts.length - 2], el = Math.hypot(ex - px, ez - pz);
      flat.push(disc(0.3, sx, y, sz));
      flat.push(moved(turnedY(bevelBox({ w: 0.5, h: 0.05, d: 0.1, color: BRONZE, bevel: 0.015, offset: { y: 0.025 } }), Math.atan2((ex - px) / el, (ez - pz) / el)), ex, y, ez));
    }
    return { pipe: merge(...flat), glow: noShadow(merge(...glow)) };
  });
  const forge = BL.models.cachedSteps(function* (slice = null) {
    const f = LAYOUT.forge, geos = [], cy = FORGE_CY;
    for (const [r, n, depth, z] of [[2.25, 12, 1.3, 0], [2.95, 16, 1, -0.15]]) { for (let k = 0; k <= n; k++) { yield* pause(slice);
      const a = Math.PI * k / n, key = k === n / 2, w = r * Math.PI / n * 0.9;
      geos.push(moved(turnedZ(bevelBox({ w: key ? w * 1.35 : w, h: key ? 0.9 : 0.64, d: key ? depth + 0.2 : depth, color: key ? ROCK_LT : k % 2 ? STONE[0] : STONE[2], bevel: 0.08 }), a - Math.PI / 2), Math.cos(a) * r, cy + Math.sin(a) * r, z));
    } }
    for (const s of [-1, 1]) { for (let row = 0; row < 3; row++) { for (const [x, d, z] of [[2.25, 1.3, 0], [2.95, 1, -0.15]]) {
      geos.push(bevelBox({ w: 0.64, h: 0.5, d, color: (row + (x < 2.5 ? 0 : 1)) % 2 ? STONE[1] : STONE[3], bevel: 0.08, offset: { x: s * x, y: 0.26 + row * 0.52, z } }));
    } } }
    geos.push(bevelBox({ w: 3.8, h: 3.4, d: 0.4, color: "#1e120c", bevel: 0.06, offset: { y: 1.7, z: -0.6 } }));
    const rim = tube({ path: (t) => ({ x: Math.cos(Math.PI * t) * 1.9, y: cy + Math.sin(Math.PI * t) * 1.9, z: 0.45 }), radius: () => 0.13, rings: 28, segments: 8, colorFn: () => BRASS });
    // The timber frame round the arch, as the concept builds it: posts with glowing vents, a header beam on iron
    // brackets, all under the core's walkway.
    for (const s of [-1, 1]) {
      geos.push(bevelBox({ w: 0.46, h: 4.3, d: 0.46, color: TIMBER_DK, bevel: 0.06, offset: { x: s * 3.7, y: 2.15, z: 0.75 } }));
      for (const y of [0.85, 1.5]) { geos.push(box({ w: 0.26, h: 0.4, d: 0.05, color: "#ff8a2a", emissive: 1, offset: { x: s * 3.7, y, z: 1 } }), box({ w: 0.04, h: 0.4, d: 0.06, color: IRON_DK, offset: { x: s * 3.7, y, z: 1.01 } })); }
      for (const y of [3.95, 4.62]) { geos.push(bevelBox({ w: 0.62, h: 0.12, d: 0.6, color: IRON_DK, bevel: 0.02, offset: { x: s * 3.7, y, z: 0.75 } })); }
    }
    geos.push(bevelBox({ w: 8.3, h: 0.5, d: 0.56, color: TIMBER, bevel: 0.07, offset: { y: 4.3, z: 0.75 } }));
    // The forge's control: a console with an upright screen of green bars and a lever with a red knob.
    const cx = FORGE_CONSOLE[0], cz = FORGE_CONSOLE[1];
    geos.push(bevelBox({ w: 0.7, h: 0.95, d: 0.5, color: IRON_DK, bevel: 0.05, offset: { x: cx, y: 0.475, z: cz } }));
    const screen = [bevelBox({ w: 0.62, h: 0.44, d: 0.08, color: IRON, bevel: 0.03 }), box({ w: 0.52, h: 0.34, d: 0.02, color: "#123a2a", emissive: 0.8, offset: { z: 0.05 } })];
    for (let k = 0; k < 4; k++) { screen.push(box({ w: 0.08, h: 0.07 + k * 0.05, d: 0.02, color: "#5fff7a", emissive: 1, offset: { x: -0.16 + k * 0.1, y: -0.12 + (0.07 + k * 0.05) / 2, z: 0.07 } })); }
    geos.push(moved(merge(...screen), cx - 0.08, 1.15, cz + 0.08), beam(cx + 0.22, 0.95, cz, cx + 0.34, 1.42, cz + 0.1, 0.05, IRON_LT), moved(ball(0.08, "#e8342a", 0.4, 8), cx + 0.35, 1.46, cz + 0.11));
    return moved(shaded([rim], geos), f.x, 0, f.z);
  });
  const forgeFire = cached(() => {
    const f = LAYOUT.forge;
    const build = (hot) => {
      const face = forwardLathe(turn([[1.66, 0], [1.66, 0.12], [1.3, 0.28], [0.7, 0.36], [0, 0.38]], 28,
        (t) => hot ? (t < 0.3 ? "#e8500e" : t < 0.6 ? "#ff6e18" : "#ff8a24") : (t < 0.3 ? "#9a360c" : t < 0.6 ? "#c84a12" : "#dc5a16"), hot ? 1 : 0.85));
      const heat = forwardLathe(torus(1.76, 0.1, hot ? "#ffd868" : "#ff9a38", 1, 36, 8));
      const floor = turn([[1.5, 0.03], [0, 0.04]], 24, hot ? "#ff8a24" : "#c84a12", hot ? 0.9 : 0.6);
      const flames = [[-1.05, 0.55], [-0.55, 0.75], [0, 0.62], [0.55, 0.78], [1.05, 0.52]].flatMap(([x, h]) => flame(hot ? h * 1.25 : h, x, 0.22, 0.32, hot));
      return noShadow(moved(shaded([moved(face, 0, FORGE_CY, -0.36), moved(heat, 0, FORGE_CY, -0.2), moved(floor, 0, 0, 1.4)], flames), f.x, 0, f.z));
    };
    return { hot: build(true), warm: build(false) };
  });
  const teslaCoil = cached(() => shaded([
    turn([[0.42, 0], [0.42, 0.18], [0.3, 0.26], [0.3, 0.4], [0, 0.4]], 16, BRONZE),
    turn([[0.15, 0.4], [0.15, 2.1], [0, 2.1]], 12, IRON_DK),
    tube({ path: (t) => ({ x: Math.cos(t * TAU * 10) * 0.19, y: 0.5 + t * 1.5, z: Math.sin(t * TAU * 10) * 0.19 }), radius: () => 0.035, rings: 200, segments: 5, colorFn: () => COPPER }),
    moved(torus(0.34, 0.12, BRASS, 0, 22, 8), 0, 2.22, 0)
  ], [moved(smoothBolt(0.8, 0.05, "#fff4b0", 1), 0.4, 2.62, 0), moved(turnedY(smoothBolt(0.6, 0.05, "#bff8ff", 1), 1.4), -0.34, 2.56, 0.12)]));
  // The ₿ in the forge's fire, its own node so the scene can spin and pulse it: warm, hot while a line is opened or
  // closed, and white in a flash.
  const forgeSign = cached(() => {
    const build = (color) => noShadow(smoothBitcoin(2.3, 0.24, color, 1));
    return { warm: build("#ffd98a"), hot: build("#fff2b8"), white: build("#ffffff") };
  });
  const SHAFT_DEEP = 3;
  const SHAFT_RAMP = 2;
  const FORGE_END = 1;
  // Each line sampled every LINE_STEP metres by length from the bottom of its shaft to the forge's fire, as
  // [x, y, z, heading, pitch], so a cart or a coin rolls it at an even speed: up the shaft, out of its mouth, an S over
  // to the forge's track and straight on into the fire.
  const forgeLines = cached(() => SHAFTS.map(([sx, sz], i) => {
    const tx = LAYOUT.forge.x + FORGE_TRACKS[i], z0 = sz - 2.4, z1 = 6.8, zm = (z0 + z1) / 2, dense = [];
    for (let k = 0; k <= 30; k++) dense.push([sx, sz + SHAFT_DEEP - (SHAFT_DEEP + 2.4) * k / 30]);
    for (let k = 1; k <= 80; k++) {
      const t = k / 80, u = 1 - t;
      dense.push([(u * u * u + 3 * u * u * t) * sx + (3 * u * t * t + t * t * t) * tx, u * u * u * z0 + 3 * u * t * zm + t * t * t * z1]);
    }
    for (let k = 1; k <= 30; k++) dense.push([tx, z1 + (FORGE_END - z1) * k / 30]);
    const cum = [0];
    for (let k = 1; k < dense.length; k++) cum.push(cum[k - 1] + Math.hypot(dense[k][0] - dense[k - 1][0], dense[k][1] - dense[k - 1][1]));
    const length = cum[cum.length - 1], n = Math.floor(length / LINE_STEP) + 1, pts = new Float32Array(n * 5);
    let seg = 0;
    for (let j = 0; j < n; j++) {
      const d = Math.min(length, j * LINE_STEP);
      while (seg < dense.length - 2 && cum[seg + 1] < d) seg++;
      const a = dense[seg], b = dense[seg + 1], f = (d - cum[seg]) / (cum[seg + 1] - cum[seg] || 1), drop = Math.max(0, 1 - d / SHAFT_RAMP);
      pts[j * 5] = a[0] + (b[0] - a[0]) * f;
      pts[j * 5 + 1] = -1.6 * drop * drop;
      pts[j * 5 + 2] = a[1] + (b[1] - a[1]) * f;
      pts[j * 5 + 3] = Math.atan2(b[0] - a[0], b[1] - a[1]);
      pts[j * 5 + 4] = Math.atan(3.2 * drop / SHAFT_RAMP);
    }
    return { pts, n, length };
  }));
  // The lines' track: two iron rails on sleepers along each line, from out of the shaft's mouth (and on down into
  // the dark) to the forge, where they run on past the carts' end into the furnace to its back wall over an iron
  // hearth plate with a glowing grate, heating from iron to a glowing orange over their last few metres so the line
  // runs into the fire rather than stopping short of it.
  const mixColor = (a, b, t) => "#" + hexToRgb(a).map((v, k) => Math.round(v + (hexToRgb(b)[k] - v) * t).toString(16).padStart(2, "0")).join("");
  const forgeTrack = cached(() => {
    const geos = [], f = LAYOUT.forge, back = f.z - 0.45, hearth = f.z + 1;
    const heat = (dEnd) => Math.max(0, Math.min(1, 1 - dEnd / 3.2)) ** 1.5;
    const rail = (ax, ay, az, bx, by, bz, h) => geos.push(beam(ax, ay, az, bx, by, bz, 0.08, h > 0.02 ? mixColor(IRON_LT, "#ffb25a", h) : IRON_LT, h * 0.95));
    for (const { pts, n, length } of forgeLines()) {
      const side = (j, off) => [pts[j * 5] + Math.cos(pts[j * 5 + 3]) * off, pts[j * 5 + 1] + 0.1, pts[j * 5 + 2] - Math.sin(pts[j * 5 + 3]) * off];
      for (let j = 0; j + 1 < n; j += 5) {
        const k = Math.min(n - 1, j + 5), h = heat(length - j * LINE_STEP);
        for (const off of [-0.45, 0.45]) rail(...side(j, off), ...side(k, off), h);
      }
      const e = (n - 1) * 5;
      for (const off of [-0.45, 0.45]) rail(pts[e] + off, 0.1, pts[e + 2], pts[e] + off, 0.1, back, 1);
      for (let j = 4; j < n; j += 10) {
        if (pts[j * 5 + 2] < hearth + 0.2 && Math.abs(pts[j * 5] - f.x) < 2) continue;
        geos.push(moved(turnedY(box({ w: 1.25, h: 0.07, d: 0.2, color: TIMBER_DK }), pts[j * 5 + 3]), pts[j * 5], pts[j * 5 + 1] + 0.04, pts[j * 5 + 2]));
      }
    }
    // The hearth: an iron plate across the arch's mouth, riveted along its lip, with the grate glowing between its bars.
    geos.push(bevelBox({ w: 3.7, h: 0.06, d: hearth + 0.65 - back, color: IRON_DK, bevel: 0.02, offset: { x: f.x, y: 0.03, z: (hearth + 0.65 + back) / 2 } }));
    for (let k = 0; k < 4; k++) geos.push(box({ w: 3.3, h: 0.012, d: 0.06, color: k % 2 ? "#ff9a2a" : "#ffc868", emissive: 1, offset: { x: f.x, y: 0.066, z: back + 0.35 + k * 0.28 } }));
    for (let k = 0; k < 9; k++) geos.push(moved(ball(0.035, IRON_LT, 0, 6), f.x - 1.7 + k * 0.425, 0.065, hearth + 0.58));
    return merge(...geos);
  });
  // A shaft's mound: a hill of rough stone round a timbered mouth, lined dark inside, where the floor gives way to a
  // black drop at the back; crystals of its line's colour in the rock, and the glow of the shaft below (`glow`, dim
  // and bright), which the scene brightens when a cart comes up or a coin goes down. Built in the mound's frame, x
  // across and +z into the hill with the mouth at z 0 facing -z, and set at its mouth.
  const SHAFT_TINTS = [["#ff9a2a", "#ffd9a0"], ["#4fc8ff", "#d4f6ff"]];
  const forgeShafts = cached(() => SHAFTS.map(([sx, sz], i) => {
    const rand = mulberry32(900 + i), rock = [], lit = [], D = SHAFT_DEEP, W = 1.15, H = 2.5, stone = () => STONE[Math.floor(rand() * 4)];
    // The lining: dark walls and roof, a dark floor up to the drop and a black one over it, and the back wall.
    for (const s of [-1, 1]) rock.push(box({ w: 0.12, h: H, d: D + 0.2, color: "#1a120c", offset: { x: s * (W + 0.06), y: H / 2, z: D / 2 } }));
    rock.push(box({ w: 2 * W + 0.24, h: 0.12, d: D + 0.2, color: "#150e09", offset: { y: H + 0.06, z: D / 2 } }));
    rock.push(box({ w: 2 * W + 0.24, h: H + 0.1, d: 0.12, color: "#0a0705", offset: { y: H / 2, z: D + 0.16 } }));
    rock.push(box({ w: 2 * W, h: 0.01, d: D - SHAFT_RAMP, color: "#23180f", offset: { y: 0.005, z: (D - SHAFT_RAMP) / 2 } }));
    rock.push(box({ w: 2 * W, h: 0.012, d: SHAFT_RAMP + 0.1, color: "#020101", offset: { y: 0.006, z: D - SHAFT_RAMP / 2 + 0.05 } }));
    // The mouth's timber set, banded in iron, with knee braces, arms at the header's ends for lanterns, and a second
    // set further in.
    for (const s of [-1, 1]) {
      rock.push(bevelBox({ w: 0.32, h: H + 0.2, d: 0.36, color: TIMBER_DK, bevel: 0.05, offset: { x: s * (W + 0.16), y: (H + 0.2) / 2, z: -0.05 } }));
      for (const y of [0.7, 1.9]) rock.push(bevelBox({ w: 0.38, h: 0.09, d: 0.42, color: IRON_DK, bevel: 0.02, offset: { x: s * (W + 0.16), y, z: -0.05 } }));
      rock.push(beam(s * (W + 0.05), H - 0.55, -0.12, s * (W - 0.55), H + 0.12, -0.12, 0.12, TIMBER));
      rock.push(bevelBox({ w: 0.5, h: 0.08, d: 0.08, color: IRON_DK, bevel: 0.01, offset: { x: s * (W + 0.55), y: H + 0.3, z: -0.2 } }));
      rock.push(bevelBox({ w: 0.24, h: H, d: 0.24, color: TIMBER_DK, bevel: 0.04, offset: { x: s * (W - 0.1), y: H / 2, z: 1.2 } }));
    }
    rock.push(bevelBox({ w: 2 * W + 1.1, h: 0.38, d: 0.46, color: TIMBER, bevel: 0.06, offset: { y: H + 0.3, z: -0.05 } }));
    rock.push(bevelBox({ w: 2 * W, h: 0.24, d: 0.28, color: TIMBER_DK, bevel: 0.04, offset: { y: H - 0.1, z: 1.2 } }));
    // The hill: courses of rough stone either side of the mouth, and a crown over it stepping back as it rises.
    for (const s of [-1, 1]) for (let row = 0; row < 5; row++) {
      for (let z = -0.3 + row * 0.1; z < D + 0.5;) {
        const d = Math.min(0.8 + rand() * 0.7, D + 0.9 - z), w = 1.15 - row * 0.1 + rand() * 0.2;
        rock.push(bevelBox({ w, h: 0.58, d, color: stone(), bevel: 0.13, offset: { x: s * (W + 0.3 + w / 2 + (rand() - 0.5) * 0.12), y: 0.29 + row * 0.55, z: z + d / 2 } }));
        z += d;
      }
    }
    for (let k = 0; k < 3; k++) {
      const half = 2.55 - k * 0.75, y = H + 0.72 + k * 0.46;
      for (let z = 0.05 + k * 0.55; z < D + 0.5 - k * 0.35;) {
        const d = Math.min(0.9 + rand() * 0.6, D + 0.9 - k * 0.35 - z);
        for (let x = -half; x < half - 0.1;) {
          const w = Math.min(0.9 + rand() * 0.6, half - x);
          rock.push(bevelBox({ w, h: 0.52, d, color: stone(), bevel: 0.14, offset: { x: x + w / 2, y: y + (rand() - 0.5) * 0.08, z: z + d / 2 } }));
          x += w;
        }
        z += d;
      }
    }
    // Rubble at the hill's foot either side of the mouth.
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
      const w = 0.3 + rand() * 0.25;
      rock.push(moved(turnedY(bevelBox({ w, h: w * 0.7, d: w, color: stone(), bevel: 0.08 }), rand() * TAU), s * (W + 1.3 + rand() * 0.9), w * 0.35, -0.5 - rand() * 0.6));
    }
    // Crystals of the line's colour growing out of the rock.
    const [deep, light] = SHAFT_TINTS[i];
    for (const [x, y, z, sc] of [[-2.3, 0.5, 0.1, 0.8], [2.4, 1.2, 0.6, 0.6], [1.1, H + 1.9, 1.6, 0.7], [-1.6, H + 1.1, 0.9, 0.55]]) {
      for (let k = 0; k < 3; k++) {
        const a = rand() * TAU, lean = 0.25 + rand() * 0.3, h = sc * (0.8 + rand()), r = sc * (0.14 + rand() * 0.08);
        const g = lathe({ profile: [[r, 0], [r * 0.9, h * 0.8], [0, h]], segments: 6, color: k % 2 ? deep : light, emissive: 0.85 });
        const v = g.verts, c = Math.cos(a) * lean, sn = Math.sin(a) * lean;
        for (let q = 0; q < v.length; q += 3) { v[q] += v[q + 1] * c; v[q + 2] += v[q + 1] * sn; }
        lit.push(moved(g, x + Math.cos(a) * sc * 0.2, y, z + Math.sin(a) * sc * 0.2));
      }
    }
    // The shaft's own glow, low on the walls round the drop and, bright, over the drop itself.
    const glowOf = (bright) => {
      const e = bright ? 1 : 0.5, parts = [
        box({ w: 2 * W - 0.1, h: 0.5, d: 0.04, color: deep, emissive: e, offset: { y: 0.25, z: D + 0.09 } }),
        box({ w: 2 * W - 0.1, h: 0.4, d: 0.04, color: deep, emissive: e * 0.55, offset: { y: 0.7, z: D + 0.09 } })
      ];
      for (const s of [-1, 1]) parts.push(box({ w: 0.04, h: 0.35, d: SHAFT_RAMP, color: deep, emissive: e * 0.7, offset: { x: s * (W - 0.02), y: 0.18, z: D - SHAFT_RAMP / 2 } }));
      if (bright) parts.push(box({ w: 2 * W - 0.2, h: 0.02, d: SHAFT_RAMP - 0.2, color: light, emissive: 1, offset: { y: 0.02, z: D - SHAFT_RAMP / 2 } }));
      return noShadow(moved(merge(...parts), sx, 0, sz));
    };
    return { rock: moved(merge(...rock), sx, 0, sz), crystals: noShadow(moved(merge(...lit), sx, 0, sz)), glow: { dim: glowOf(false), bright: glowOf(true) } };
  }));

  // A cart for the forge's lines: an iron tub bound in straps and riveted, on four wheels that ride the rails, heaped
  // with sats: a glowing mound of amber, a cluster of sat crystals in its middle, cut gems in gold and orange over it
  // with their facets catching the light, and two Bitcoin coins stood in the heap. Its wheels sit on a rail's top,
  // 0.14 up.
  const SAT_GEMS = ["#ff9a1f", "#ffc83a", "#ffe7a0", "#ff6a1a", "#ffb347"];
  const coin = (r, color, glyph, emissive) => [
    forwardLathe(turn([[0, -0.025], [r * 0.85, -0.025], [r, -0.018], [r, 0.018], [r * 0.85, 0.025], [0, 0.025]], 20, color, emissive)),
    moved(smoothBitcoin(r * 1.25, 0.012, glyph, emissive), 0, 0, 0.03),
    turnedY(moved(smoothBitcoin(r * 1.25, 0.012, glyph, emissive), 0, 0, 0.03), Math.PI)
  ];
  const cart = cached(() => {
    const rand = mulberry32(61), round = [], flat = [];
    flat.push(bevelBox({ w: 1.1, h: 0.62, d: 1.3, color: IRON, bevel: 0.07, offset: { y: 0.8 } }));
    flat.push(bevelBox({ w: 1.18, h: 0.08, d: 1.38, color: IRON_DK, bevel: 0.02, offset: { y: 1.11 } }));
    for (const z of [-0.38, 0.38]) flat.push(bevelBox({ w: 1.14, h: 0.6, d: 0.07, color: IRON_DK, bevel: 0.015, offset: { y: 0.8, z } }));
    for (const s of [-1, 1]) for (let k = 0; k < 5; k++) round.push(moved(ball(0.03, IRON_LT, 0, 6), s * 0.56, 1.03, -0.52 + k * 0.26));
    flat.push(bevelBox({ w: 0.9, h: 0.1, d: 1.2, color: IRON_DK, bevel: 0.02, offset: { y: 0.46 } }));
    for (const z of [-0.42, 0.42]) {
      round.push(moved(turnedZ(turn([[0.04, -0.52], [0.04, 0.52]], 8, IRON_DK), Math.PI / 2), 0, 0.34, z));
      for (const s of [-1, 1]) round.push(moved(turnedY(forwardLathe(turn([[0, -0.04], [0.2, -0.04], [0.2, 0.04], [0.13, 0.05], [0.06, 0.08], [0, 0.08]], 16, "#2b2d31")), s * Math.PI / 2), s * 0.45, 0.34, z));
    }
    // The load: the amber mound, then the crystals, the gems and the coins on it.
    const dome = turn([[0.52, 0], [0.46, 0.12], [0.3, 0.24], [0, 0.3]], 20, "#c47418", 0.45);
    for (let k = 2; k < dome.verts.length; k += 3) dome.verts[k] *= 1.2;
    round.push(moved(dome, 0, 1.08, 0));
    const heap = (r) => 1.08 + 0.3 * Math.max(0, 1 - (r / 0.55) ** 2);
    for (let k = 0; k < 3; k++) {
      const h = 0.34 + rand() * 0.14, g = lathe({ profile: [[0.07, 0], [0.065, h * 0.75], [0, h]], segments: 6, color: k % 2 ? "#ffd27a" : "#ff8a1f", emissive: 1 });
      flat.push(moved(turnedZ(turnedX(g, (rand() - 0.5) * 0.7), (rand() - 0.5) * 0.7), (k - 1) * 0.1, heap(0) - 0.08, (rand() - 0.5) * 0.1));
    }
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * TAU + rand() * 0.4, r = 0.18 + rand() * 0.32, size = 0.9 + rand() * 0.7;
      flat.push(moved(turnedZ(turnedX(gem(size, SAT_GEMS[k % SAT_GEMS.length], 0.65 + rand() * 0.3), (rand() - 0.5) * 1.4), (rand() - 0.5) * 1.4), Math.cos(a) * r, heap(r) + 0.02, Math.sin(a) * r * 1.15));
    }
    for (const [x, z, a] of [[0.28, 0.18, 0.5], [-0.26, -0.24, -0.8]]) {
      for (const g of coin(0.17, GOLD, "#a8680e", 0.55)) flat.push(moved(turnedY(turnedX(g, 0.35), a), x, heap(Math.hypot(x, z / 1.2)) + 0.12, z));
    }
    return shaded(round, flat);
  });
  const mintCoin = cached(() => {
    const t = 0.16, R = COIN_R, round = [], flat = [];
    round.push(forwardLathe(turn([[0, -t / 2], [R - 0.08, -t / 2], [R - 0.02, -t / 2 + 0.02], [R, -t / 2 + 0.05], [R, t / 2 - 0.05], [R - 0.02, t / 2 - 0.02], [R - 0.08, t / 2], [0, t / 2]], 40, GOLD, 0.55)));
    for (const s of [-1, 1]) round.push(moved(forwardLathe(torus(R - 0.07, 0.022, "#ffe07a", 0.65, 40, 6)), 0, 0, s * t / 2));
    for (let k = 0; k < 44; k++) {
      const a = k / 44 * TAU;
      flat.push(moved(turnedZ(box({ w: 0.025, h: 0.03, d: t - 0.07, color: "#d99a1e", emissive: 0.5 }), a), Math.cos(a) * (R + 0.008), Math.sin(a) * (R + 0.008), 0));
    }
    flat.push(moved(smoothBitcoin(0.62, 0.03, "#b87a10", 0.4), 0, 0, t / 2 + 0.012), turnedY(moved(smoothBitcoin(0.62, 0.03, "#b87a10", 0.4), 0, 0, t / 2 + 0.012), Math.PI));
    return turnedY(shaded(round, flat), Math.PI / 2);
  });
  // Stands a part built facing +z at the origin where a monitor or a deck at `bearing` and `reach` puts it.
  const consoleAt = (geo, bearing, reach, y, tilt) => moved(turnedY(turnedX(geo, tilt), -bearing), CONSOLE.x + Math.sin(bearing) * reach, y, CONSOLE.z - Math.cos(bearing) * reach);
  const monitorAt = (geo, [bearing, reach, y, , , tilt]) => consoleAt(geo, bearing, reach, y, tilt);
  const switchboard = cached(() => {
    const C = CONSOLE, geos = [], segments = 7;
    for (let i = 0; i < segments; i++) {
      const b = -C.arc + (i + 0.5) / segments * C.arc * 2, w = 2 * C.desk * Math.sin(C.arc / segments) + 0.08;
      geos.push(consoleAt(bevelBox({ w, h: C.top, d: C.deep, color: TIMBER_DK, bevel: 0.06, offset: { y: -C.top / 2 } }), b, C.desk, C.top, 0));
      geos.push(consoleAt(bevelBox({ w: w + 0.02, h: 0.07, d: C.deep + 0.12, color: BRASS, bevel: 0.02 }), b, C.desk, C.top + 0.035, 0));
      // The raked control deck along the desk's front, and its buttons.
      const deck = [bevelBox({ w: w - 0.14, h: 0.06, d: 0.46, color: IRON_DK, bevel: 0.02 })];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
        const tone = ["#ff5a3a", "#5fe36a", "#ffc83a", "#5fb8ff"][(i + r * 2 + c) % 4];
        deck.push(box({ w: 0.08, h: 0.03, d: 0.07, color: tone, emissive: 0.95, offset: { x: (c - 2) * (w - 0.3) / 4, y: 0.045, z: (r - 1) * 0.13 } }));
      }
      geos.push(consoleAt(merge(...deck), b, C.desk - C.deep / 2 + 0.3, C.top + 0.16, 0.55));
    }
    for (const m of MONITORS) {
      const [bearing, reach, y, w, h] = m;
      geos.push(monitorAt(bevelBox({ w: w + 0.14, h: h + 0.14, d: 0.12, color: IRON_DK, bevel: 0.04 }), m));
      // Lower monitors stand on necks from the desk; the upper row and the board on posts from behind it.
      const foot = y > 2 ? 0 : C.top, stem = y - h / 2 - foot + 0.05, back = y > 2 ? reach + 0.12 : reach;
      geos.push(consoleAt(box({ w: 0.12, h: stem, d: 0.12, color: IRON, offset: { y: -stem / 2 - h / 2, z: -0.06 } }), bearing, back, y, 0));
    }
    geos.push(moved(merge(BL.mineModels.hubCart()), -3, 0, 1.4));
    return merge(...geos);
  });
  // The monitors' faces, dim and busy: a forward routed through the board lights them. The board draws the routes,
  // nodes joined by lines; the others scroll text, stand bars or trace a line.
  const switchScreens = cached(() => {
    const build = (busy) => {
      const geos = [], ink = busy ? "#e8fbff" : "#8fc0e0", gold = busy ? "#ffe07a" : "#e8c860";
      MONITORS.forEach((m, i) => {
        const [, , , w, h, , kind] = m, tone = i % 3 === 0 ? "#3fa7ff" : i % 3 === 1 ? "#5fe3ff" : "#2f8fe6";
        const on = (geo) => geos.push(monitorAt(geo, m));
        on(box({ w, h, d: 0.03, color: busy ? tone : "#1f4a70", emissive: busy ? 0.95 : 0.7, offset: { z: 0.07 } }));
        if (kind === "graph") {
          const nodes = [[-0.55, 0.25], [-0.18, -0.2], [0.2, 0.28], [0.56, -0.1], [-0.48, -0.3], [0.1, 0.02], [0.38, 0.33]];
          for (const [ax, ay] of nodes) for (const [bx, by] of nodes) if (ax < bx && Math.hypot(bx - ax, by - ay) < 0.55) on(beam(ax, ay, 0.09, bx, by, 0.09, 0.025, ink, 1));
          for (const [x, y] of nodes) on(box({ w: 0.09, h: 0.09, d: 0.02, color: gold, emissive: 1, offset: { x, y, z: 0.1 } }));
        } else if (kind === "bars") {
          for (let k = 0; k < 6; k++) {
            const bh = 0.12 + ((i * 5 + k * 3) % 7) * 0.055;
            on(box({ w: 0.1, h: bh, d: 0.02, color: k % 2 ? ink : gold, emissive: 1, offset: { x: -w / 2 + 0.18 + k * 0.14, y: -h / 2 + 0.1 + bh / 2, z: 0.09 } }));
          }
        } else if (kind === "line") {
          let px = -w / 2 + 0.1, py = -0.1;
          for (let k = 1; k <= 8; k++) {
            const nx = -w / 2 + 0.1 + k * (w - 0.2) / 8, ny = Math.sin(k * 1.3 + i) * 0.16 + (k - 4) * 0.02;
            on(beam(px, py, 0.09, nx, ny, 0.09, 0.03, gold, 1));
            px = nx; py = ny;
          }
        } else for (let k = 0; k < 4; k++) {
          const lw = 0.25 + ((i * 3 + k) % 4) * 0.15;
          on(box({ w: lw, h: 0.055, d: 0.02, color: ink, emissive: 1, offset: { x: -w / 2 + 0.12 + lw / 2, y: h / 2 - 0.13 - k * 0.14, z: 0.09 } }));
        }
      });
      return noShadow(merge(...geos));
    };
    return { calm: build(false), busy: build(true) };
  });
  // ---- the rebalancer and the treasury, as the concept draws them ------------------------------------

  // A path through `points` [x, y, z] with each corner rounded off `round` metres either side of it, walked by its
  // length: `at(u)` for u in 0..1.
  const roundedPath = (points, round) => {
    const pts = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1], b = points[i], c = points[i + 1];
      const la = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), lc = Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]);
      const fa = Math.min(round, la / 2) / la, fc = Math.min(round, lc / 2) / lc;
      const p = b.map((v, k) => v + (a[k] - v) * fa), q = b.map((v, k) => v + (c[k] - v) * fc);
      for (let n = 0; n <= 8; n++) { const t = n / 8, u = 1 - t; pts.push(b.map((v, k) => u * u * p[k] + 2 * u * t * v + t * t * q[k])); }
    }
    pts.push(points[points.length - 1]);
    const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1], p[2] - pts[i][2])), length = lens.reduce((sum, l) => sum + l, 0);
    const at = (u) => {
      let d = u * length;
      for (let i = 0; i < lens.length; i++) {
        if (d <= lens[i] || i === lens.length - 1) {
          const f = lens[i] ? Math.min(1, d / lens[i]) : 0, a = pts[i], b = pts[i + 1];
          return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, z: a[2] + (b[2] - a[2]) * f };
        }
        d -= lens[i];
      }
    };
    return { at, length };
  };
  // A pipe along a rounded path, `r` thick, with bronze couplers where `bands` fall along it.
  const pipeParts = (path, r, color, emissive, bands) => [
    tube({ path: path.at, radius: () => r, rings: Math.round(path.length * 10), segments: 14, colorFn: () => color, emissive }),
    ...bands.map((u) => {
      const p = path.at(u), q = path.at(Math.min(1, u + 0.01));
      return along(turn([[r + 0.02, -0.09], [r + 0.06, -0.06], [r + 0.06, 0.06], [r + 0.02, 0.09]], 14, BRONZE), p.x, p.y, p.z, q.x - p.x, q.y - p.y, q.z - p.z);
    })
  ];
  // An arrow `len` long pointing along +x in the xy plane, for the flow painted on the pipes.
  const arrow = (len, color, emissive) => merge(
    prism([[-len / 2, -len * 0.13], [len * 0.08, -len * 0.13], [len * 0.08, len * 0.13], [-len / 2, len * 0.13]], 0.03, color, emissive),
    prism([[len * 0.08, -len * 0.34], [len / 2, 0], [len * 0.08, len * 0.34]], 0.03, color, emissive)
  );
  // The flow's arrows along a pipe running in the xy plane, on its side facing +z, each pointing the way it runs.
  const flowArrows = (path, r, color, emissive, step = 0.5) => {
    const out = [], n = Math.max(1, Math.round(path.length / step));
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, p = path.at(u), q = path.at(Math.min(1, u + 0.01));
      out.push(moved(turnedZ(arrow(0.3, color, emissive), Math.atan2(q.y - p.y, q.x - p.x)), p.x, p.y, p.z + r + 0.01));
    }
    return out;
  };
  // The rebalancer's sign: two arrows chasing round a circle, orange over the top and blue under, facing +z.
  const cycleIcon = (R, r) => [[Math.PI * 0.88, Math.PI * 0.12, "#ff9a2a"], [-Math.PI * 0.12, -Math.PI * 0.88, "#3fa7ff"]].flatMap(([a0, a1, color]) => [
    tube({ path: (t) => { const a = a0 + (a1 - a0) * t; return { x: Math.cos(a) * R, y: Math.sin(a) * R, z: 0 }; }, radius: () => r, rings: 16, segments: 8, colorFn: () => color, emissive: 1 }),
    moved(turnedZ(prism([[0, -r * 2.6], [r * 3.2, 0], [0, r * 2.6]], r * 1.6, color, 1), Math.atan2(-Math.cos(a1), Math.sin(a1))), Math.cos(a1) * R, Math.sin(a1) * R, 0)
  ]);
  // A sign's frame as the concept builds them: timber round a dark board, iron at the corners, centred on (x, y) with
  // the board's face at `z`, where the scene hangs the lettering.
  const signFrame = (round, flat, x, y, z, w, h) => {
    flat.push(box({ w: w - 0.2, h: h - 0.2, d: 0.06, color: "#1e140d", offset: { x, y, z: z - 0.06 } }));
    for (const s of [-1, 1]) {
      flat.push(bevelBox({ w, h: 0.2, d: 0.2, color: TIMBER, bevel: 0.04, offset: { x, y: y + s * (h / 2 - 0.1), z: z - 0.02 } }));
      flat.push(bevelBox({ w: 0.2, h: h - 0.4, d: 0.2, color: TIMBER, bevel: 0.04, offset: { x: x + s * (w / 2 - 0.1), y, z: z - 0.02 } }));
      for (const t of [-1, 1]) {
        flat.push(bevelBox({ w: 0.34, h: 0.34, d: 0.04, color: IRON_DK, bevel: 0.01, offset: { x: x + s * (w / 2 - 0.12), y: y + t * (h / 2 - 0.12), z: z + 0.1 } }));
        round.push(moved(ball(0.045, IRON_LT, 0, 8), x + s * (w / 2 - 0.12), y + t * (h / 2 - 0.12), z + 0.13));
      }
    }
  };
  // The posts either side of a station's sign, with an arm from each top toward +z for a lantern's hook.
  const signPosts = (flat, x, z, h) => {
    for (const s of [-1, 1]) {
      flat.push(bevelBox({ w: 0.3, h, d: 0.3, color: TIMBER_DK, bevel: 0.05, offset: { x: s * x, y: h / 2, z } }));
      flat.push(bevelBox({ w: 0.4, h: 0.12, d: 0.4, color: TIMBER_LT, bevel: 0.03, offset: { x: s * x, y: h + 0.06, z } }));
      flat.push(bevelBox({ w: 0.12, h: 0.12, d: 0.55, color: IRON_DK, bevel: 0.02, offset: { x: s * x, y: h - 0.5, z: z + 0.35 } }));
    }
  };
  // A crate heaped with glowing gold bars, for the rebalancer's and the treasury's floors.
  const goldCrate = cached(() => {
    const rand = mulberry32(73), geos = [bevelBox({ w: 0.9, h: 0.55, d: 0.65, color: TIMBER_LT, bevel: 0.04, offset: { y: 0.275 } })];
    for (const y of [0.12, 0.44]) geos.push(box({ w: 0.92, h: 0.05, d: 0.67, color: TIMBER_DK, offset: { y } }));
    for (let i = 0; i < 9; i++) geos.push(moved(turnedY(bevelBox({ w: 0.26, h: 0.09, d: 0.13, color: rand() < 0.4 ? "#ffe27a" : "#ffc83a", emissive: 0.8, bevel: 0.02 }), rand() * TAU), (rand() - 0.5) * 0.6, 0.6 + rand() * 0.1, (rand() - 0.5) * 0.4));
    return merge(...geos);
  });
  const rebalancerPaths = cached(() => ({
    from: roundedPath([[-REB.leg, 0.3, REB.cz], [-REB.leg, REB.top, REB.cz], [-0.36, REB.top, REB.cz]], 0.7),
    to: roundedPath([[0.36, REB.top, REB.cz], [REB.leg, REB.top, REB.cz], [REB.leg, 0.3, REB.cz]], 0.7)
  }));
  const rebalancerBase = cached(() => {
    const round = [], flat = [], glow = [], cz = REB.cz, paths = rebalancerPaths();
    // The platform, its rim riveted and ringed in light, and the lens in its middle.
    round.push(moved(turn([[1.85, 0], [1.85, 0.36], [1.76, 0.42], [1.76, 0.5], [1.62, 0.56], [0, 0.56]], 36, (t) => t > 0.72 ? "#132a36" : t > 0.4 ? BRONZE : IRON_DK), 0, 0, cz));
    for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; round.push(moved(ball(0.04, IRON_LT, 0, 6), Math.cos(a) * 1.86, 0.18, cz + Math.sin(a) * 1.86)); }
    glow.push(moved(torus(1.79, 0.05, "#5fe3ff", 0.95, 40, 8), 0, 0.47, cz));
    round.push(moved(turn([[0.3, 0.56], [0.22, 0.74], [0.08, 0.94], [0, 0.98]], 16, BRONZE), 0, 0, cz));
    // The glass tubes at the back of the platform, the sats' colours, each with an arrow rising in it.
    for (const [s, color] of [[-1, "#ff9a3a"], [1, "#4fa8ff"]]) {
      const x = s * 1.15, z = cz - 0.95;
      round.push(moved(turn([[0.22, 0], [0.22, 0.1], [0.17, 0.12], [0, 0.12]], 14, BRONZE), x, 0.56, z), moved(turn([[0, 0.93], [0.17, 0.93], [0.22, 0.95], [0.22, 1.05], [0.1, 1.1], [0, 1.12]], 14, BRONZE), x, 0.56, z));
      glow.push(moved(turn([[0.17, 0.1], [0.17, 0.95]], 14, color, 0.85), x, 0.56, z), moved(turnedZ(arrow(0.36, "#fff4e0", 1), Math.PI / 2), x, 1.08, z + 0.18));
    }
    // The pipes on their feet, the junction they meet at, and the column down from it.
    round.push(...pipeParts(paths.from, REB.pipe, "#e27424", 0.45, [0.06, 0.4, 0.72, 0.97]), ...pipeParts(paths.to, REB.pipe, "#2f86e8", 0.45, [0.03, 0.28, 0.6, 0.94]));
    for (const s of [-1, 1]) {
      flat.push(bevelBox({ w: 0.62, h: 0.3, d: 0.62, color: BRONZE_DK, bevel: 0.05, offset: { x: s * REB.leg, y: 0.15, z: cz } }));
      round.push(along(turn([[0.24, -0.1], [0.3, -0.07], [0.3, 0.07], [0.24, 0.1]], 16, BRONZE), s * 0.42, REB.top, cz, 1, 0, 0));
    }
    round.push(moved(ball(0.36, BRONZE, 0, 16), 0, REB.top, cz), moved(turn([[0.2, 1.85], [0.27, 1.88], [0.27, 2], [0.2, 2.03], [0.2, 2.6], [0.26, 2.63], [0.26, 2.72], [0.2, 2.75], [0.2, 3.1]], 16, BRONZE), 0, 0, cz));
    // The boards' chains from the pipes, and their iron backs.
    for (const [bx, , bz] of REB.boards) for (const dx of bx ? [-0.55, 0.55] : [-0.35, 0.35]) round.push(...chain(bx + dx, 2.7, bz, bx + dx, REB.top - REB.pipe, cz, 0.04, IRON_DK));
    // The console: an upright monitor above a raked button panel and a lever.
    const [kx, kz] = REB.console, rake = 0.35;
    flat.push(bevelBox({ w: 1.5, h: 0.85, d: 0.6, color: IRON_DK, bevel: 0.06, offset: { x: kx, y: 0.425, z: kz } }));
    flat.push(moved(turnedX(bevelBox({ w: 1.56, h: 0.07, d: 0.7, color: IRON, bevel: 0.02 }), rake), kx, 0.9, kz));
    const onPanel = (geo, u, v, lift = 0.05) => moved(geo, kx + u, 0.9 + Math.cos(rake) * lift - Math.sin(rake) * v, kz + Math.sin(rake) * lift + Math.cos(rake) * v);
    flat.push(box({ w: 0.08, h: 0.14, d: 0.08, color: IRON_DK, offset: { x: kx - 0.33, y: 0.99, z: kz - 0.1 } }), bevelBox({ w: 0.68, h: 0.52, d: 0.08, color: IRON_DK, bevel: 0.03, offset: { x: kx - 0.33, y: 1.3, z: kz - 0.1 } }));
    glow.push(box({ w: 0.58, h: 0.42, d: 0.02, color: "#0f2a4a", emissive: 0.9, offset: { x: kx - 0.33, y: 1.3, z: kz - 0.05 } }));
    for (const part of cycleIcon(0.12, 0.022)) glow.push(moved(part, kx - 0.33, 1.3, kz - 0.03));
    [["#e8342a", 0.12, -0.14], ["#ffd23a", 0.26, -0.14], ["#4fd08a", 0.12, 0.02], ["#e8342a", 0.26, 0.02], ["#ffd23a", 0.12, 0.18], ["#4fd08a", 0.26, 0.18]].forEach(([color, u, v]) => glow.push(onPanel(ball(0.035, color, 1, 8), u, v, 0.06)));
    round.push(beam(kx + 0.55, 0.95, kz, kx + 0.58, 1.3, kz + 0.06, 0.04, IRON_LT), moved(ball(0.07, "#e8342a", 0.4, 10), kx + 0.58, 1.33, kz + 0.06));
    // The sign on its posts, with the arrows chasing round beside the lettering.
    signPosts(flat, REB.post, REB.postZ, 5.6);
    const [, sy, sz] = REB.sign;
    signFrame(round, flat, 0, sy, sz, 5.3, 1.55);
    for (const part of cycleIcon(0.4, 0.07)) glow.push(moved(part, -1.95, sy, sz + 0.14));
    return { body: shaded(round, flat), glow: noShadow(shaded(glow)) };
  });
  // The rings on the platform's top, blue and orange in turn with arrows chasing round the outer two, and the beam
  // from the column to the lens: dim while idle, bright while a rebalance runs, when the scene spins them.
  const rebalancerRing = cached(() => {
    const build = (on) => {
      const e = on ? 1 : 0.5, blue = on ? "#9fe4ff" : "#2f86c8", orange = on ? "#ffc868" : "#c8601a", round = [], flat = [];
      [[1.45, 0.06, blue], [1.05, 0.05, orange], [0.66, 0.045, blue], [0.4, 0.035, orange]].forEach(([R, r, color]) => round.push(torus(R, r, color, e, 40, 8)));
      for (const [R, color, dir] of [[1.45, blue, 1], [1.05, orange, -1]]) for (let k = 0; k < 3; k++) {
        const a = k / 3 * TAU + (dir > 0 ? 0 : Math.PI / 3);
        flat.push(moved(turnedY(turnedX(arrow(0.34, on ? "#ffffff" : color, e), -Math.PI / 2), -a - dir * Math.PI / 2), Math.cos(a) * R, 0.07, Math.sin(a) * R));
      }
      round.push(turn([[on ? 0.12 : 0.06, 0.42], [on ? 0.12 : 0.06, 1.3], [0, 1.32]], 12, on ? "#dffcff" : "#2d8fa6", on ? 1 : 0.5));
      return noShadow(shaded(round, flat));
    };
    return { on: build(true), off: build(false) };
  });
  // The arrows along the pipes: the way the sats flow, from the orange channel through the junction to the blue.
  const rebalancerFlow = cached(() => {
    const paths = rebalancerPaths();
    const build = (on) => noShadow(merge(...flowArrows(paths.from, REB.pipe, on ? "#fff0c8" : "#ffb45a", on ? 1 : 0.6), ...flowArrows(paths.to, REB.pipe, on ? "#e8f8ff" : "#8fd0ff", on ? 1 : 0.6)));
    return { on: build(true), off: build(false) };
  });
  const treasuryBody = cached(() => {
    const round = [], flat = [], glow = [], vz = TRE.vz, front = vz + TRE.deep / 2, [DR, DH] = TRE.dome, DB = TRE.top;
    // The vault: timber bound in iron, riveted, with the dome's bronze seat on top.
    flat.push(bevelBox({ w: 2.8, h: 1.5, d: TRE.deep, color: "#5a3a22", bevel: 0.1, offset: { y: 0.75, z: vz } }));
    for (const y of [0.25, 1.3]) {
      flat.push(bevelBox({ w: 2.86, h: 0.14, d: TRE.deep + 0.06, color: IRON_DK, bevel: 0.03, offset: { y, z: vz } }));
      for (let x = -1.25; x <= 1.26; x += 0.25) round.push(moved(ball(0.035, IRON_LT, 0, 6), x, y, front + 0.04));
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) flat.push(bevelBox({ w: 0.2, h: 1.56, d: 0.2, color: IRON_DK, bevel: 0.03, offset: { x: sx * 1.4, y: 0.78, z: vz + sz * TRE.deep / 2 } }));
    round.push(moved(turn([[1.32, 1.5], [1.32, 1.56], [1.22, DB], [0, DB]], 32, BRONZE), 0, 0, vz));
    // The medallion and its sign, and the chute under it.
    round.push(moved(forwardLathe(turn([[0.5, 0], [0.5, 0.06], [0.44, 0.1], [0, 0.11]], 28, BRONZE)), 0, 0.95, front), moved(forwardLathe(torus(0.43, 0.03, GOLD, 0.6, 28, 6)), 0, 0.95, front + 0.1));
    glow.push(moved(smoothBitcoin(0.62, 0.08, "#ffb43a", 1), 0, 0.95, front + 0.14));
    flat.push(box({ w: 0.62, h: 0.28, d: 0.04, color: "#1a120c", offset: { y: 0.3, z: front + 0.01 } }), bevelBox({ w: 0.76, h: 0.4, d: 0.06, color: IRON_DK, bevel: 0.015, offset: { y: 0.3, z: front } }));
    // The cage over the gold: ribs, a ring round its middle, the crown on top, and the glass's shine down its front.
    const rib = (a, th0, th1, r, color, e) => tube({ path: (t) => { const th = th0 + (th1 - th0) * t; return { x: Math.cos(a) * Math.cos(th) * DR, y: DB + Math.sin(th) * DH, z: vz + Math.sin(a) * Math.cos(th) * DR }; }, radius: () => r, rings: 12, segments: 6, colorFn: () => color, emissive: e });
    round.push(moved(torus(DR, 0.05, BRONZE, 0, 32, 8), 0, DB + 0.03, vz), moved(torus(DR * Math.SQRT1_2, 0.03, BRONZE, 0, 28, 6), 0, DB + DH * Math.SQRT1_2, vz));
    for (let k = 0; k < 10; k++) round.push(rib(k / 10 * TAU + 0.31, 0, Math.PI / 2, 0.035, BRONZE, 0));
    for (const a of [Math.PI / 2 - 0.5, Math.PI / 2 + 0.42]) glow.push(rib(a, 0.2, 1.15, 0.014, "#e8f6ff", 0.55));
    round.push(moved(turn([[0.25, DB + DH - 0.05], [0.29, DB + DH + 0.05], [0.16, DB + DH + 0.18], [0, DB + DH + 0.2]], 16, BRONZE), 0, 0, vz));
    // The copper pipes: up from the vault's sides, over the cage and down into its crown.
    const pipe = roundedPath([[-1.4, 1.05, vz], [-TRE.pipeX, 1.05, vz], [-TRE.pipeX, TRE.pipeY, vz], [TRE.pipeX, TRE.pipeY, vz], [TRE.pipeX, 1.05, vz], [1.4, 1.05, vz]], 0.35);
    round.push(...pipeParts(pipe, 0.13, COPPER, 0, [0.12, 0.3, 0.5, 0.7, 0.88]));
    round.push(moved(turn([[0.11, DB + DH + 0.15], [0.11, TRE.pipeY - 0.1], [0.17, TRE.pipeY - 0.06], [0.17, TRE.pipeY + 0.06], [0, TRE.pipeY + 0.08]], 12, COPPER), 0, 0, vz));
    // The belt: side rails, the belt itself and its rollers, on legs, rising from the chute to over the crate.
    const [[, y0, z0], [, y1, z1]] = TRE.belt, slope = Math.atan2(y1 - y0, z1 - z0), mid = [(y0 + y1) / 2, (z0 + z1) / 2], run = Math.hypot(y1 - y0, z1 - z0);
    flat.push(moved(turnedX(box({ w: 0.5, h: 0.04, d: run, color: "#2a2420" }), -slope), 0, mid[0], mid[1]));
    for (const x of [-0.3, 0.3]) {
      flat.push(beam(x, y0 + 0.02, z0, x, y1 + 0.02, z1, 0.07, IRON));
      flat.push(beam(x, 0, z1 - 0.15, x, y1 - 0.02, z1 - 0.15, 0.06, IRON_DK));
    }
    for (const [y, z] of [[y0, z0], [y1, z1]]) round.push(moved(turnedZ(turn([[0.07, -0.28], [0.07, 0.28]], 12, IRON_LT), Math.PI / 2), 0, y - 0.02, z));
    // The crate at the belt's end, open at the top.
    const [cx, cz] = TRE.crate;
    flat.push(box({ w: 0.9, h: 0.06, d: 0.75, color: TIMBER_DK, offset: { x: cx, y: 0.06, z: cz } }));
    for (const s of [-1, 1]) {
      flat.push(bevelBox({ w: 0.9, h: 0.72, d: 0.07, color: TIMBER_LT, bevel: 0.02, offset: { x: cx, y: 0.36, z: cz + s * 0.34 } }));
      flat.push(bevelBox({ w: 0.07, h: 0.72, d: 0.68, color: TIMBER_LT, bevel: 0.02, offset: { x: cx + s * 0.415, y: 0.36, z: cz } }));
    }
    for (const s of [-1, 1]) flat.push(box({ w: 0.94, h: 0.06, d: 0.02, color: TIMBER_DK, offset: { x: cx, y: 0.5, z: cz + s * 0.385 } }), box({ w: 0.02, h: 0.06, d: 0.79, color: TIMBER_DK, offset: { x: cx + s * 0.46, y: 0.5, z: cz } }));
    // The desk and its monitor, turned a little toward the vault, with the fees' bars lit on the screen.
    const [dx, dz] = TRE.desk, monitor = [], screen = [];
    flat.push(bevelBox({ w: 1, h: 0.08, d: 0.6, color: TIMBER_LT, bevel: 0.02, offset: { x: dx, y: 0.8, z: dz } }));
    for (const lx of [-0.44, 0.44]) for (const lz of [-0.24, 0.24]) flat.push(box({ w: 0.07, h: 0.76, d: 0.07, color: TIMBER_DK, offset: { x: dx + lx, y: 0.38, z: dz + lz } }));
    monitor.push(box({ w: 0.3, h: 0.03, d: 0.2, color: IRON_DK, offset: { y: 0.855 } }), box({ w: 0.06, h: 0.3, d: 0.05, color: IRON_DK, offset: { y: 1.0 } }), bevelBox({ w: 0.74, h: 0.52, d: 0.06, color: IRON_DK, bevel: 0.02, offset: { y: 1.38 } }), box({ w: 0.36, h: 0.02, d: 0.14, color: IRON, offset: { y: 0.85, z: 0.2 } }));
    screen.push(box({ w: 0.64, h: 0.42, d: 0.02, color: "#0f2a4a", emissive: 0.9, offset: { y: 1.38, z: 0.035 } }));
    [0.12, 0.2, 0.29, 0.36].forEach((h, i) => screen.push(box({ w: 0.09, h, d: 0.02, color: i % 2 ? "#6fc8ff" : "#4fd08a", emissive: 1, offset: { x: -0.2 + i * 0.13, y: 1.2 + h / 2, z: 0.05 } })));
    for (const g of monitor) flat.push(moved(turnedY(g, 0.35), dx, 0, dz));
    for (const g of screen) glow.push(moved(turnedY(g, 0.35), dx, 0, dz));
    // The sign on its posts, stacks of coins beside the lettering on a ledge.
    signPosts(flat, TRE.post, TRE.postZ, 5.6);
    const [, sy, sz] = TRE.sign;
    signFrame(round, flat, 0, sy, sz, 5.6, 1.55);
    flat.push(bevelBox({ w: 1.1, h: 0.05, d: 0.3, color: TIMBER_DK, bevel: 0.01, offset: { x: -2.02, y: sy - 0.42, z: sz + 0.2 } }));
    [[-2.36, 5], [-2.03, 7], [-1.7, 4]].forEach(([x, n]) => {
      for (let k = 0; k < n; k++) glow.push(moved(turn([[0.14, 0], [0.14, 0.06], [0.12, 0.07], [0, 0.07]], 14, k % 2 ? "#ffe07a" : GOLD, 0.75), x + (k % 3 - 1) * 0.008, sy - 0.395 + k * 0.072, sz + 0.2));
    });
    return { body: shaded(round, flat), glow: noShadow(shaded(glow)) };
  });
  // The gold heap: a glowing mound of coins and bars at unit size, scaled by the scene to the node's public
  // capacity: a dome of gold under coins lying every way, stacks round its foot and bars on top.
  const goldPile = cached(() => {
    const rand = mulberry32(88), round = [turn([[1.2, 0], [0.95, 0.32], [0.55, 0.68], [0, 0.82]], 18, "#d9a52a", 0.4)], flat = [];
    const coin = () => turn([[0.16, -0.025], [0.16, 0.025], [0.13, 0.03], [0, 0.03]], 12, rand() < 0.3 ? "#ffe07a" : GOLD, 0.6);
    for (let i = 0; i < 80; i++) {
      const r = Math.sqrt(rand()) * 1.15, a = rand() * TAU, y = Math.max(0.03, 0.82 * (1 - (r / 1.2) ** 1.6));
      round.push(moved(turnedY(turnedX(coin(), (rand() - 0.5) * 1.2), rand() * TAU), Math.cos(a) * r, y, Math.sin(a) * r));
    }
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU + 0.3, r = 1.3, n = 3 + Math.floor(rand() * 5);
      for (let k = 0; k < n; k++) round.push(moved(coin(), Math.cos(a) * r + (rand() - 0.5) * 0.02, 0.03 + k * 0.058, Math.sin(a) * r));
    }
    for (let i = 0; i < 9; i++) {
      const a = rand() * TAU, r = rand() * 0.6;
      flat.push(moved(turnedY(bevelBox({ w: 0.44, h: 0.13, d: 0.2, color: "#ffd24a", emissive: 0.6, bevel: 0.03 }), rand() * TAU), Math.cos(a) * r, 0.84 * (1 - (r / 1.2) ** 1.6) + 0.06, Math.sin(a) * r));
    }
    return shaded(round, flat);
  });
  // The crate's gold, which the scene raises as the belt brings in each fee's nugget, and the nugget.
  const hopperFill = cached(() => noShadow(lathe({ profile: [[0.29, 0], [0.29, 0.05], [0.2, 0.13], [0, 0.18]], segments: 12, color: "#ffd84a", emissive: 0.85 })));
  const beltNugget = cached(() => noShadow(bevelBox({ w: 0.16, h: 0.13, d: 0.16, color: "#ffd24a", emissive: 0.95, bevel: 0.03 })));
  const ORANGE_DK = "#c46d10";
  const MOUTH = "#b3181f";
  const MOUTH_DK = "#6e0d12";
  const TOOTH = "#f6f1e6";
  const HAZARD = "#ffc21a";
  // Chunky white teeth, `n` of them along z over `span`, on a gum strip: the rim's point up (`dir` 1), the jaw's down,
  // half a pitch along (`shift`) so the two rows mesh.
  const teethRow = (flat, round, x, y, span, n, dir, shift = 0) => {
    const pitch = span / n;
    flat.push(bevelBox({ w: 0.16, h: 0.06, d: span + 0.08, color: MOUTH_DK, bevel: 0.02, offset: { x, y: y + dir * 0.02 } }));
    for (let k = 0; k < n; k++) {
      const z = -span / 2 + pitch * (k + 0.5) + shift, tall = k % 3 === 1 ? 0.25 : 0.21;
      flat.push(bevelBox({ w: 0.13, h: tall, d: pitch * 0.8, color: TOOTH, bevel: 0.05, offset: { x, y: y + dir * (0.03 + tall / 2), z } }));
      round.push(moved(ball(0.035, "#ffffff", 0.15, 6), x - 0.05, y + dir * (0.05 + tall * 0.7), z - pitch * 0.18));
    }
  };
  const cookerBody = BL.models.cachedSteps(function* (slice = null) {
    const { w, h, d, plinth: P, rim: R } = COOK, round = [], flat = [], glow = [];
    // The plinth, striped yellow on black along the hall side and the right.
    flat.push(bevelBox({ w: w + 0.2, h: P, d: d + 0.2, color: IRON_BK, bevel: 0.03, offset: { y: P / 2 } }));
    const stripe = (x0) => prism([[x0, 0.025], [x0 + 0.1, 0.025], [x0 + 0.2, P - 0.025], [x0 + 0.1, P - 0.025]], 0.02, HAZARD);
    for (let x = -d / 2 - 0.08; x < d / 2 - 0.1; x += 0.24) { yield* pause(slice); flat.push(moved(turnedY(stripe(x), -Math.PI / 2), -w / 2 - 0.105, 0, 0)); }
    for (let x = -w / 2 - 0.08; x < w / 2 - 0.1; x += 0.24) { flat.push(moved(stripe(x), 0, 0, d / 2 + 0.105)); }
    // Black iron up to the mouth, the orange frame round it: corner posts, a band at the foot and the rim's walls.
    flat.push(bevelBox({ w: w - 0.04, h: R - P, d: d - 0.04, color: IRON_BK, bevel: 0.04, offset: { y: (P + R) / 2 } }));
    for (const sx of [-1, 1]) { for (const sz of [-1, 1]) { flat.push(bevelBox({ w: 0.22, h: h - P, d: 0.22, color: ORANGE, bevel: 0.05, offset: { x: sx * (w / 2 - 0.08), y: (P + h) / 2, z: sz * (d / 2 - 0.08) } })); } }
    for (const s of [-1, 1]) {
      flat.push(bevelBox({ w: 0.2, h: 0.12, d: d + 0.02, color: ORANGE_DK, bevel: 0.03, offset: { x: s * (w / 2 - 0.08), y: P + 0.07 } }));
      flat.push(bevelBox({ w: w + 0.02, h: 0.12, d: 0.2, color: ORANGE_DK, bevel: 0.03, offset: { y: P + 0.07, z: s * (d / 2 - 0.08) } }));
      // The rim's walls, open toward the hall where the jaw closes on the teeth.
      if (s > 0) flat.push(bevelBox({ w: 0.22, h: h - R, d: d + 0.02, color: ORANGE, bevel: 0.05, offset: { x: w / 2 - 0.09, y: (R + h) / 2 } }));
      flat.push(bevelBox({ w: w + 0.02, h: h - R, d: 0.22, color: ORANGE, bevel: 0.05, offset: { y: (R + h) / 2, z: s * (d / 2 - 0.09) } }));
      // The mouth's red lining inside the rim.
      if (s > 0) flat.push(box({ w: 0.02, h: h - R - 0.04, d: d - 0.44, color: MOUTH_DK, offset: { x: w / 2 - 0.205, y: (R + h) / 2 - 0.02 } }));
      flat.push(box({ w: w - 0.44, h: h - R - 0.04, d: 0.02, color: MOUTH_DK, offset: { y: (R + h) / 2 - 0.02, z: s * (d / 2 - 0.205) } }));
    }
    // Gold rivets along the frame on the hall side and the right.
    for (const y of [P + 0.07, R - 0.07]) { yield* pause(slice);
      for (let z = -d / 2 + 0.3; z <= d / 2 - 0.29; z += 0.3) { round.push(moved(ball(0.035, GOLD, 0.2, 6), -w / 2 - 0.02, y, z)); }
      for (let x = -w / 2 + 0.3; x <= w / 2 - 0.29; x += 0.3) { round.push(moved(ball(0.035, GOLD, 0.2, 6), x, y, d / 2 + 0.02)); }
    }
    // Inside: a red floor, a fat tongue and the firebox's glow at the throat.
    flat.push(box({ w: w - 0.42, h: 0.04, d: d - 0.42, color: MOUTH, offset: { y: R + 0.02 } }));
    const tongue = ball(0.5, "#e2485a", 0, 14);
    round.push(moved({ ...tongue, verts: tongue.verts.map((v, i) => v * [0.8, 0.22, 1.6][i % 3]) }, -0.12, R + 0.05, 0));
    glow.push(box({ w: 0.26, h: 0.02, d: d - 0.9, color: "#ff7a2a", emissive: 0.95, offset: { x: w / 2 - 0.4, y: R + 0.05 } }));
    // An orange lip along the front under the lower teeth, whose tips stand just under the shut jaw.
    flat.push(bevelBox({ w: 0.24, h: 0.1, d: d - 0.4, color: ORANGE, bevel: 0.03, offset: { x: -w / 2 + 0.06, y: R - 0.05 } }));
    teethRow(flat, round, -w / 2 + 0.13, R, d - 0.5, 8, 1);
    // The porthole's orange bezel on the hall side, riveted; its glass is `cookerPort`. Amber lamps on the front posts.
    const [px, py, pz] = COOK.port;
    round.push(moved(turnedY(forwardLathe(torus(0.41, 0.075, ORANGE, 0, 28, 8)), -Math.PI / 2), px + 0.02, py, pz));
    for (let k = 0; k < 10; k++) { yield* pause(slice); const a = k / 10 * TAU; round.push(moved(ball(0.03, GOLD, 0.2, 6), px - 0.06, py + Math.sin(a) * 0.41, pz + Math.cos(a) * 0.41)); }
    for (const sz of [-1, 1]) { for (const y of [0.55, 1.0]) { glow.push(bevelBox({ w: 0.06, h: 0.1, d: 0.1, color: "#ffd35a", emissive: 1, bevel: 0.02, offset: { x: -w / 2 - 0.04, y, z: sz * (d / 2 - 0.08) } })); } }
    // The hatch the bananas leave by, on the right: an orange frame round a dark mouth with the chute's glow in it.
    const [hx, hy, hz] = COOK.hatch;
    flat.push(box({ w: 0.46, h: 0.34, d: 0.04, color: "#120d0a", offset: { x: hx, y: hy + 0.02, z: d / 2 - 0.01 } }));
    for (const s of [-1, 1]) {
      flat.push(bevelBox({ w: 0.62, h: 0.09, d: 0.08, color: ORANGE, bevel: 0.025, offset: { x: hx, y: hy + 0.02 + s * 0.215, z: d / 2 + 0.02 } }));
      flat.push(bevelBox({ w: 0.09, h: 0.52, d: 0.08, color: ORANGE, bevel: 0.025, offset: { x: hx + s * 0.27, y: hy + 0.02, z: d / 2 + 0.02 } }));
    }
    glow.push(box({ w: 0.38, h: 0.06, d: 0.02, color: "#ff9a2a", emissive: 0.8, offset: { x: hx, y: hy - 0.1, z: d / 2 + 0.005 } }));
    return { body: shaded(round, flat), glow: noShadow(shaded(glow)) };
  });
  // What does not chew: the stack at the back-right, the launch chute, and the sign's posts and frame.
  const cookerFixtures = cached(() => {
    const round = [], flat = [], glow = [];
    const [kx, kz] = COOK.stack, top = COOK.stackTop;
    round.push(moved(turn([[0.22, 0], [0.22, 0.12], [0.17, 0.16], [0.17, top - 0.3], [0.23, top - 0.24], [0.23, top - 0.1], [0.27, top], [0.2, top], [0.2, top - 0.05], [0, top - 0.05]], 16, (t) => t > 0.85 ? "#120d0a" : IRON_BK), kx, 0, kz));
    for (const y of [0.9, 1.9, 2.7, top - 0.17]) round.push(moved(torus(y > 3 ? 0.24 : 0.19, 0.035, ORANGE, 0, 16, 6), kx, y, kz));
    round.push(...pipeParts(roundedPath([[COOK.w / 2 - 0.02, 0.9, kz], [kx - 0.15, 0.9, kz]], 0.05), 0.09, IRON_BK, 0, []));
    // The chute: a black trough with orange walls, sloping from the hatch to a lip that kicks up, on a leg.
    const [hx, hy, hz] = COOK.hatch, [lx, ly, lz] = COOK.lip, vx = lx - hx, vz = lz - hz, run = Math.hypot(vx, vz), len = Math.hypot(run, hy - ly);
    const pitch = Math.atan2(hy - ly, run), yaw = Math.atan2(vx, vz), chute = (g) => moved(turnedY(turnedX(g, pitch), yaw), hx, hy - 0.12, hz);
    flat.push(chute(bevelBox({ w: 0.44, h: 0.05, d: len + 0.05, color: IRON_BK, bevel: 0.015, offset: { z: len / 2 } })));
    for (const s of [-1, 1]) flat.push(chute(bevelBox({ w: 0.06, h: 0.2, d: len + 0.05, color: ORANGE, bevel: 0.02, offset: { x: s * 0.22, y: 0.08, z: len / 2 } })));
    for (let k = 1; k < 4; k++) flat.push(chute(box({ w: 0.38, h: 0.02, d: 0.04, color: ORANGE_DK, offset: { y: 0.035, z: len * k / 4 } })));
    flat.push(moved(turnedY(turnedX(bevelBox({ w: 0.44, h: 0.05, d: 0.3, color: IRON_BK, bevel: 0.015, offset: { z: 0.13 } }), -0.55), yaw), lx, ly - 0.12, lz));
    for (const s of [-1, 1]) flat.push(moved(turnedY(turnedX(bevelBox({ w: 0.06, h: 0.16, d: 0.3, color: ORANGE, bevel: 0.02, offset: { x: s * 0.22, y: 0.06, z: 0.13 } }), -0.55), yaw), lx, ly - 0.12, lz));
    const leg = ly - 0.14 + 0.2 * (hy - ly) / run;
    flat.push(bevelBox({ w: 0.12, h: leg, d: 0.12, color: IRON_BK, bevel: 0.02, offset: { x: lx - vx / run * 0.2, y: leg / 2, z: lz - vz / run * 0.2 } }));
    glow.push(moved(ball(0.07, "#ffb347", 0.9, 8), lx + vx / run * 0.2, ly + 0.02, lz + vz / run * 0.2));
    // A short, hollow intake peeks below the vault, directly over the chute's upward launch.
    const intake = COOK.intakeY, rise = HALL.h - LAYOUT.cooker.y - intake + 0.8;
    round.push(moved(lathe({ profile: [[0.46, 0], [0.4, 0.15], [0.35, 0.4], [0.35, rise], [0.29, rise], [0.29, 0.4], [0.34, 0.15], [0.4, 0], [0.46, 0]], segments: 16, color: IRON_BK }), lx, intake, lz));
    for (const y of [intake + 0.08, intake + 0.7, intake + rise - 0.2]) round.push(moved(torus(y < intake + 0.3 ? 0.44 : 0.37, 0.035, ORANGE, 0, 16, 6), lx, y, lz));
    // The sign on its posts, a bunch of bananas beside the lettering.
    signPosts(flat, COOK.post, COOK.postZ, COOK.postH);
    const [, sy2, sz2] = COOK.sign, [bx, by, bz] = COOK.board;
    signFrame(round, flat, 0, sy2, sz2, 5.4, 1.4);
    for (let k = 0; k < 3; k++) glow.push(moved(turnedZ(bananaGlyph(0.5, 0.06, 0.85), 0.45 - k * 0.3), -2.2 + k * 0.08, sy2 - 0.04 + k * 0.05, sz2 + 0.12 + k * 0.01));
    // The donations board hangs on chains from the sign's frame.
    for (const dx of [-0.7, 0.7]) round.push(...chain(bx + dx, by + 0.42, bz, bx + dx, sy2 - 0.7, sz2 - 0.06, 0.04, IRON_DK));
    return { body: shaded(round, flat), glow: noShadow(shaded(glow)) };
  });
  // The jaw in its hinge's frame: orange from the hinge at the origin out along -x, strapped in black iron and riveted in
  // gold, a ridged red palate under it and the upper teeth hanging from its free edge, in front of the lower ones. The scene opens it with a negative
  // rotation.z.
  const cookerLid = cached(() => {
    const { w, d } = COOK, round = [], flat = [], L = w + 0.08, D = d + 0.1;
    flat.push(bevelBox({ w: L, h: 0.16, d: D, color: ORANGE, bevel: 0.06, offset: { x: -L / 2, y: 0.08 } }));
    for (const s of [-1, 1]) {
      flat.push(bevelBox({ w: L + 0.02, h: 0.08, d: 0.24, color: IRON_BK, bevel: 0.03, offset: { x: -L / 2, y: 0.18, z: s * (D / 2 - 0.12) } }));
      flat.push(bevelBox({ w: 0.26, h: 0.08, d: D - 0.46, color: IRON_BK, bevel: 0.03, offset: { x: s < 0 ? -L + 0.13 : -0.13, y: 0.18 } }));
    }
    flat.push(bevelBox({ w: L - 0.6, h: 0.05, d: 0.18, color: ORANGE_DK, bevel: 0.02, offset: { x: -L / 2, y: 0.18 } }));
    for (let z = -D / 2 + 0.35; z <= D / 2 - 0.34; z += 0.36) round.push(moved(ball(0.035, GOLD, 0.2, 6), -L + 0.13, 0.225, z));
    for (let x = -L + 0.4; x <= -0.39; x += 0.36) for (const s of [-1, 1]) round.push(moved(ball(0.035, GOLD, 0.2, 6), x, 0.225, s * (D / 2 - 0.12)));
    flat.push(box({ w: L - 0.12, h: 0.02, d: D - 0.1, color: MOUTH, offset: { x: -L / 2, y: -0.005 } }));
    for (let k = 1; k < 5; k++) flat.push(bevelBox({ w: 0.07, h: 0.03, d: D - 0.6, color: MOUTH_DK, bevel: 0.012, offset: { x: -L * k / 5, y: -0.02 } }));
    teethRow(flat, round, -L + 0.07, 0, d - 0.5, 8, -1, (d - 0.5) / 16);
    for (const z of [-0.8, 0.8]) round.push(moved(turnedX(turn([[0.08, -0.24], [0.08, 0.24]], 12, ORANGE_DK), Math.PI / 2), 0, 0.06, z));
    return shaded(round, flat);
  });
  // The porthole: domed glass over the banana, dim at rest and lit while it cooks. Facing +z; the scene turns it.
  const cookerPort = cached(() => {
    const build = (lit) => noShadow(shaded([forwardLathe(turn([[0.36, -0.02], [0.36, 0.01], [0.22, 0.05], [0, 0.06]], 24, lit ? "#ff9a2a" : "#2a1a0c", lit ? 0.95 : 0.3))],
      [moved(bananaGlyph(0.42, 0.03, lit ? 1 : 0.35), 0, 0, 0.06)]));
    return { dim: build(false), lit: build(true) };
  });
  // A gear for the cooker's side: an iron disc with an orange hub, cut into `teeth` round its edge, with spokes on its
  // face; its axle along x, so the scene turns it by rotation.x. Cached by size.
  const gearCache = BL.models.scopedMap();
  const cookerGear = (r, teeth) => {
    const key = `${r}|${teeth}`;
    let geo = gearCache.get(key);
    if (geo) return geo;
    const t = 0.1, th = 0.07, round = [], flat = [];
    round.push(forwardLathe(turn([[0, -t / 2], [r - 0.04, -t / 2], [r, -t / 2 + 0.02], [r, t / 2 - 0.02], [r - 0.04, t / 2], [0, t / 2]], 32, IRON)));
    round.push(forwardLathe(turn([[0, -t / 2 - 0.04], [0.07, -t / 2 - 0.04], [0.09, -t / 2], [0.09, t / 2], [0.07, t / 2 + 0.04], [0, t / 2 + 0.04]], 14, ORANGE)));
    for (let k = 0; k < teeth; k++) {
      const a = k / teeth * TAU;
      flat.push(moved(turnedZ(bevelBox({ w: th, h: TAU * r / teeth * 0.5, d: t, color: IRON_LT, bevel: 0.015 }), a), Math.cos(a) * (r + th / 2 - 0.01), Math.sin(a) * (r + th / 2 - 0.01), 0));
    }
    for (let k = 0; k < 3; k++) flat.push(turnedZ(box({ w: r * 1.6, h: 0.05, d: 0.02, color: IRON_DK, offset: { z: t / 2 + 0.005 } }), k * Math.PI / 3));
    geo = turnedY(shaded(round, flat), Math.PI / 2);
    gearCache.set(key, geo);
    return geo;
  };
  // The sats the jaw has caught, heaped on the tongue; the scene grows the heap as they land.
  const cookerSats = cached(() => {
    const rand = mulberry32(29), parts = [];
    for (let i = 0; i < 9; i++) parts.push(moved(turnedY(turnedX(bevelBox({ w: 0.22, h: 0.22, d: 0.22, color: i % 3 ? "#7fe83a" : "#b8ff6a", emissive: 0.9, bevel: 0.04 }), rand() * 0.8), rand() * TAU), (rand() - 0.5) * 0.7, 0.09 + (i > 5 ? 0.12 : 0), (rand() - 0.5) * 1.2));
    return noShadow(merge(...parts));
  });

  // ---- the donation corner: the kiosk and the donations board ------------------------------------------------------
  // Both are built as their concepts draw them, in timber bolted with iron, each standing in a niche the hall leaves in
  // its rock (`hall`'s recesses: the wall's own rock, its face set back flat 0.4 out from the kiosk's line). Their
  // timber is voxels an eighth of a metre across (`PX`), its grain running along each beam, so the renderer's block
  // detail gives it the concepts' pixel texture. Iron, glass, lamps and lettering stay smooth. Each is built in its own
  // frame: x along the wall (the visitor's right), y up from the walkway, +z out of the rock.
  const PX = 0.125;
  const VOX_FROM = { x: -3, y: -0.5, z: -1.5 };
  const PIXEL = [null, "#9a5a28", "#8b5022", "#a6652e", "#7d461e", "#57301a"];
  const TIMBER_TONES = [1, 2, 3, 4];
  const GRAIN = 5;
  const cellOf = (m, axis) => Math.round((m - VOX_FROM[axis]) / PX);
  const pixelGeometry = (v) => voxelGeometry(v, { unit: PX, palette: PIXEL, origin: VOX_FROM });
  // Timber over the cells from (x0, y0, z0) to (x1, y1, z1) metres, its grain along x or y: each line of cells along
  // the grain keeps one tone, a few lines darker, and now and then a knot.
  const pixelTimber = (v, rand, x0, x1, y0, y1, z0, z1, along) => {
    const a = cellOf(x0, "x"), b = cellOf(x1, "x") - 1, c = cellOf(y0, "y"), d = cellOf(y1, "y") - 1, e = cellOf(z0, "z"), f = cellOf(z1, "z") - 1;
    const tones = new Map();
    for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) for (let k = e; k <= f; k++) {
      const line = along === "x" ? j * 1000 + k : i * 1000 + k;
      if (!tones.has(line)) tones.set(line, rand() < 0.12 ? GRAIN : TIMBER_TONES[Math.floor(rand() * 4)]);
      v.set(i, j, k, rand() < 0.015 ? GRAIN : tones.get(line));
    }
  };
  const carve = (v, x0, x1, y0, y1, z0, z1) => {
    for (let i = cellOf(x0, "x"); i < cellOf(x1, "x"); i++) for (let j = cellOf(y0, "y"); j < cellOf(y1, "y"); j++) for (let k = cellOf(z0, "z"); k < cellOf(z1, "z"); k++) v.del(i, j, k);
  };
  // An iron plate `w` by `h` facing +z with its back at z, a hex bolt in each corner and, if `middle`, a bigger one in
  // the middle.
  const hexBolt = (r, x, y, z) => moved(prism(Array.from({ length: 6 }, (_, k) => [Math.cos(k * Math.PI / 3 + Math.PI / 6) * r, Math.sin(k * Math.PI / 3 + Math.PI / 6) * r]), 0.035, IRON_LT), x, y, z + 0.0175);
  const ironPlate = (out, x, y, z, w, h = w, middle = false) => {
    out.push(bevelBox({ w, h, d: 0.04, color: IRON_DK, bevel: 0.012, offset: { x, y, z: z + 0.02 } }));
    const bx = w / 2 - Math.min(0.06, w * 0.22), by = h / 2 - Math.min(0.06, h * 0.22), r = Math.min(0.03, Math.min(w, h) * 0.12);
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) out.push(hexBolt(r, x + sx * bx, y + sy * by, z + 0.04));
    if (middle) out.push(hexBolt(r * 1.8, x, y, z + 0.04));
  };
  // An iron eye under a beam at (x, y, z) and a chain down from it to the hook a lantern of the hall's list hangs from.
  const lanternChain = (out, x, y, z, hookY) => {
    out.push(moved(turnedY(forwardLathe(torus(0.05, 0.016, IRON_DK, 0, 10, 5)), Math.PI / 2), x, y - 0.05, z));
    out.push(...chain(x, y - 0.1, z, x, hookY, z, 0.05, IRON_DK));
  };
  // The screen's own pictures, painted by the kiosk's flow at twice its pixels: its thanks while the cooker works, and
  // its attract screen with this visit's donation link as its QR, made each visit.
  const kioskThanks = cached(() => noShadow(picture(BL.factoryKiosk.still("thanks", null, 2), KIOSK.glass.w, KIOSK.glass.h, 0)));
  const kioskIdle = (url, net) => noShadow(picture(BL.factoryKiosk.still("idle", url, 2, net), KIOSK.glass.w, KIOSK.glass.h, 0));
  // The screen in its own frame, centred on it: the dark glass in an iron bezel with a lip round it. The scene leans it
  // back and hangs the pictures on the glass's face.
  const kioskScreen = cached(() => {
    const { w, h, z } = KIOSK.glass, flat = [bevelBox({ w: w + 0.2, h: h + 0.2, d: 0.1, color: IRON_BK, bevel: 0.03 })];
    for (const s of [-1, 1]) {
      flat.push(bevelBox({ w: w + 0.12, h: 0.05, d: 0.03, color: IRON_DK, bevel: 0.01, offset: { y: s * (h / 2 + 0.035), z: 0.06 } }));
      flat.push(bevelBox({ w: 0.05, h: h + 0.12, d: 0.03, color: IRON_DK, bevel: 0.01, offset: { x: s * (w / 2 + 0.035), z: 0.06 } }));
    }
    return { frame: merge(...flat), glass: noShadow(box({ w, h, d: 0.02, color: "#0d1116", emissive: 0.5, offset: { z: z - 0.018 } })) };
  });
  const donationKiosk = cached(() => {
    const v = makeVox(), rand = mulberry32(91), iron = [], glow = [];
    // The platform it stands on, out to the walkway's end; the frame: two posts from it up past the beam to the cap,
    // which runs out past them for the lanterns, and planks either side of the medallion; the base under the screen
    // with the grille's recess cut in its face.
    pixelTimber(v, rand, -2.125, 2.125, -0.375, 0.125, 0.375, 1.25, "x");
    for (const s of [-1, 1]) pixelTimber(v, rand, s > 0 ? 1 : -1.5, s > 0 ? 1.5 : -1, 0.125, 4.375, 0.5, 1, "y");
    pixelTimber(v, rand, -1.75, 1.75, 2.875, 3.375, 0.5, 1.125, "x");
    pixelTimber(v, rand, -2.25, 2.25, 4.375, 4.875, 0.5, 1.125, "x");
    for (let y = 3.375; y < 4.375 - 1e-6; y += 0.25) for (const s of [-1, 1]) pixelTimber(v, rand, s > 0 ? 0.5 : -1, s > 0 ? 1 : -0.5, y, y + 0.25, 0.5, 0.75, "x");
    pixelTimber(v, rand, -1, 1, 0.125, 0.75, 0.5, 1, "x");
    carve(v, -0.75, 0.75, 0.25, 0.625, 0.875, 1);
    // The medallion's box between the beam and the cap, its field set back in it.
    for (const [x0, x1, y0, y1] of [[-0.5, 0.5, 3.375, 3.5], [-0.5, 0.5, 4.25, 4.375], [-0.5, -0.375, 3.5, 4.25], [0.375, 0.5, 3.5, 4.25]]) pixelTimber(v, rand, x0, x1, y0, y1, 0.5, 1.125, y1 - y0 > 0.2 ? "y" : "x");
    pixelTimber(v, rand, -0.375, 0.375, 3.5, 4.25, 0.5, 0.875, "x");
    // Iron where the timber meets: the beam's and the cap's joints, the posts' feet, the cap's ends, the medallion's
    // corners; and the lanterns' chains from under the cap.
    for (const s of [-1, 1]) {
      ironPlate(iron, s * 1.25, 3.125, 1.125, 0.42, 0.42, true);
      ironPlate(iron, s * 1.25, 4.625, 1.125, 0.42, 0.42, true);
      ironPlate(iron, s * 1.25, 0.44, 1, 0.42, 0.36);
      ironPlate(iron, s * 2.08, 4.625, 1.125, 0.26, 0.36);
      lanternChain(iron, KIOSK.lamps[s > 0 ? 1 : 0][0], 4.375, KIOSK.lamps[0][2], KIOSK.lamps[0][1]);
      for (const t of [-1, 1]) ironPlate(iron, s * 0.44, 3.875 + t * 0.44, 1.125, 0.17, 0.17);
    }
    // The medallion's dark field and its banana; the grille's dark back and its three lit slats.
    iron.push(box({ w: 0.75, h: 0.75, d: 0.03, color: "#1a1009", offset: { y: 3.875, z: 0.89 } }));
    glow.push(moved(bananaGlyph(0.52, 0.07), 0, 3.875, 0.95));
    iron.push(box({ w: 1.5, h: 0.375, d: 0.04, color: IRON_BK, offset: { y: 0.4375, z: 0.895 } }));
    for (let k = 0; k < 3; k++) glow.push(bevelBox({ w: 1.3, h: 0.07, d: 0.03, color: k === 1 ? "#ffd24a" : "#ffc21a", emissive: 1, bevel: 0.01, offset: { y: 0.32 + k * 0.1175, z: 0.93 } }));
    // Blue crystal on the platform at both front corners.
    for (const s of [-1, 1]) for (let k = 0; k < 5; k++) {
      const h = 0.25 + rand() * 0.35;
      glow.push(moved(turnedZ(prism([[-0.05, 0], [0.05, 0], [0.035, h * 0.85], [0, h], [-0.035, h * 0.85]], 0.08, k % 2 ? CYAN : CRYSTAL, 0.85), (k - 2) * 0.32 * s), s * (1.85 + (k - 2) * 0.06), 0.125, 1.08 + (rand() - 0.5) * 0.08));
    }
    return { timber: pixelGeometry(v), iron: merge(...iron), glow: noShadow(merge(...glow)) };
  });
  const BOARD_FONT = '"Avenir Next Condensed", "Roboto Condensed", "Arial Narrow", "Helvetica Neue", sans-serif';
  const BOARD_INK = { slate: "#16110d", gold: "#ffcf3f", goldLt: "#ffe387", white: "#f1e8d8", dim: "#8d8172", rule: "#6e5532" };
  const boardBanana = (g, x, y, r) => BL.bananaIcon.paint(g, x - r, y - r * 1.75, r * 2);
  // The rows' icons, each about `r` across round (x, y): a stack of coins, a banana, a calendar, a bolt and a figure.
  const boardIcon = (g, kind, x, y, r) => {
    if (kind === "coins") {
      for (let k = 2; k >= 0; k--) {
        g.fillStyle = "#b98a1c";
        g.beginPath(); g.ellipse(x, y + r * 0.42 - k * r * 0.36 + r * 0.1, r * 0.82, r * 0.3, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = k ? "#f2c23a" : "#ffd75a";
        g.beginPath(); g.ellipse(x, y + r * 0.42 - k * r * 0.36, r * 0.82, r * 0.3, 0, 0, Math.PI * 2); g.fill();
      }
    } else if (kind === "banana") boardBanana(g, x, y + r * 0.62, r * 0.82);
    else if (kind === "calendar") {
      g.fillStyle = BOARD_INK.white;
      g.fillRect(x - r * 0.8, y - r * 0.62, r * 1.6, r * 1.42);
      g.fillStyle = BOARD_INK.slate;
      g.fillRect(x - r * 0.62, y - r * 0.22, r * 1.24, r * 0.84);
      g.fillStyle = BOARD_INK.white;
      for (const sx of [-0.42, 0.42]) g.fillRect(x + sx * r - r * 0.09, y - r * 0.86, r * 0.18, r * 0.36);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) g.fillRect(x - r * 0.48 + i * r * 0.36, y - r * 0.1 + j * r * 0.36, r * 0.24, r * 0.22);
    } else if (kind === "bolt") {
      g.fillStyle = "#ffd23a";
      g.beginPath();
      for (const [px, py] of [[0.12, -1], [-0.62, 0.16], [-0.06, 0.16], [-0.26, 1], [0.62, -0.24], [0.06, -0.24]]) g.lineTo(x + px * r, y + py * r);
      g.closePath();
      g.fill();
    } else {
      g.fillStyle = BOARD_INK.white;
      g.beginPath(); g.arc(x, y - r * 0.38, r * 0.4, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(x, y + r * 0.72, r * 0.78, r * 0.6, 0, Math.PI, 0); g.fill();
    }
  };
  const BOARD_ROWS = [["coins", "TOTAL DONATED", 200], ["banana", "BANANAS DONATED", 285], ["calendar", "TODAY", 400], ["calendar", "THIS WEEK", 482], ["bolt", "CURRENT RATE", 564], ["figure", "LATEST DONATION", 646]];
  const BOARD_RULE = 336;
  const boardFaces = BL.models.scopedMap();
  const boardFace = (note) => boardFaces.get(note) || boardFaces.set(note, paintBoardFace(note)).get(note);
  const paintBoardFace = (note) => {
    const { w: W, h: H, px: P } = BOARD_FACE, canvas = document.createElement("canvas");
    canvas.width = W * P;
    canvas.height = H * P;
    drawBoardFace(canvas.getContext("2d"), note);
    return noShadow(picture(canvas, W, H, 0));
  };
  // The face at its full size from the top left of `g`: the slate, the title, the rows' icons and labels, the note.
  const drawBoardFace = (g, note) => {
    const cw = BOARD_FACE.w * BOARD_FACE.px, ch = BOARD_FACE.h * BOARD_FACE.px;
    g.fillStyle = BOARD_INK.slate;
    g.fillRect(0, 0, cw, ch);
    g.strokeStyle = "#3d2b1b";
    g.lineWidth = 6;
    g.strokeRect(9, 9, cw - 18, ch - 18);
    g.fillStyle = "#0e0a07";
    g.fillRect(14, 14, cw - 28, 104);
    g.fillStyle = "rgba(196,140,52,0.55)";
    g.fillRect(14, 118, cw - 28, 3);
    // The title in gold between two bananas.
    g.textBaseline = "middle";
    g.textAlign = "center";
    g.font = `bold 84px ${BOARD_FONT}`;
    const title = "BANANA DONATION BOARD", tw = g.measureText(title).width, shine = g.createLinearGradient(0, 30, 0, 104);
    shine.addColorStop(0, BOARD_INK.goldLt);
    shine.addColorStop(1, "#f4a91e");
    g.fillStyle = shine;
    g.fillText(title, cw / 2, 70);
    for (const s of [-1, 1]) boardBanana(g, cw / 2 + s * (tw / 2 + 52), 92, 30);
    // The rows' icons and labels, the rule between the totals and the rest, and the note in the corner.
    g.textAlign = "left";
    g.font = `600 44px ${BOARD_FONT}`;
    for (const [icon, label, y] of BOARD_ROWS) {
      boardIcon(g, icon, 92, y, 26);
      g.fillStyle = BOARD_INK.white;
      g.fillText(label, 150, y + 2);
    }
    g.fillStyle = BOARD_INK.rule;
    g.fillRect(60, BOARD_RULE, BOARD_VALUES.x - 60, 3);
    g.textAlign = "right";
    g.font = `500 24px ${BOARD_FONT}`;
    g.fillStyle = BOARD_INK.dim;
    g.fillText(note, cw - 60, 718);
  };
  // The board's figures for its right-hand column, each row of `values` a list of [text, kind] runs ("big" or "unit"
  // in gold, "note" in white, "banana" the icon), set on its label's line and shrunk to fit the column if need be.
  const boardValues = (values) => {
    const V = BOARD_VALUES, P = BOARD_FACE.px, canvas = document.createElement("canvas");
    canvas.width = V.w;
    canvas.height = V.h;
    drawBoardValues(canvas.getContext("2d"), values);
    return noShadow(picture(canvas, V.w / P, V.h / P, 0));
  };
  // The figures' column from the top left of `g`, `BOARD_VALUES` in size.
  const drawBoardValues = (g, values) => {
    const V = BOARD_VALUES;
    g.fillStyle = BOARD_INK.slate;
    g.fillRect(0, 0, V.w, V.h);
    g.fillStyle = BOARD_INK.rule;
    g.fillRect(0, BOARD_RULE - V.y, V.w - 30, 3);
    g.textBaseline = "middle";
    g.textAlign = "left";
    const fonts = { big: [72, "bold"], unit: [46, "600"], note: [42, "500"] };
    values.forEach((runs, row) => {
      const y = BOARD_ROWS[row][2] - V.y, small = row > 1 ? 0.76 : 1;
      let total = 0;
      const width = (k) => {
        let wsum = 0;
        for (const [text, kind] of runs) {
          if (kind === "banana") { wsum += 40 * small * k; continue; }
          const [size, weight] = fonts[kind];
          g.font = `${weight} ${size * small * k}px ${BOARD_FONT}`;
          wsum += g.measureText(text).width;
        }
        return wsum;
      };
      total = width(1);
      const k = Math.min(1, (V.w - 40) / total);
      let x = 10;
      for (const [text, kind] of runs) {
        if (kind === "banana") {
          boardBanana(g, x + 18 * small * k, y + 16 * small * k, 20 * small * k);
          x += 40 * small * k;
          continue;
        }
        const [size, weight] = fonts[kind];
        g.font = `${weight} ${size * small * k}px ${BOARD_FONT}`;
        g.fillStyle = kind === "note" ? BOARD_INK.white : BOARD_INK.gold;
        g.fillText(text, x, y + 2);
        x += g.measureText(text).width;
      }
    });
  };
  // The whole board on `canvas` for the board dialog: the face with `note`, then the figures in their column.
  const paintBoard = (canvas, note, values) => {
    const w = BOARD_FACE.w * BOARD_FACE.px, h = BOARD_FACE.h * BOARD_FACE.px;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const g = canvas.getContext("2d");
    drawBoardFace(g, note);
    g.save();
    g.translate(BOARD_VALUES.x, BOARD_VALUES.y);
    drawBoardValues(g, values);
    g.restore();
  };
  const donationBoard = cached(() => {
    const v = makeVox(), rand = mulberry32(57), iron = [], glow = [], round = [], flat = [];
    // The frame: posts either side, a top beam running out past them for the lanterns and a bottom beam.
    for (const s of [-1, 1]) pixelTimber(v, rand, s > 0 ? 1.5 : -1.875, s > 0 ? 1.875 : -1.5, 1.375, 4, 0.5, 0.875, "y");
    pixelTimber(v, rand, -2.375, 2.375, 3.625, 4, 0.5, 1, "x");
    pixelTimber(v, rand, -2, 2, 1.375, 1.75, 0.5, 0.875, "x");
    // The board itself behind the face, and iron at every joint: the beams over the posts, the top beam's ends, and an
    // eye under each end for a lantern.
    iron.push(box({ w: BOARD_FACE.w, h: BOARD_FACE.h, d: 0.25, color: "#120e0b", offset: { y: BOARD.face[1], z: 0.625 } }));
    for (const s of [-1, 1]) {
      ironPlate(iron, s * 1.6875, 3.8125, 1, 0.36, 0.36, true);
      ironPlate(iron, s * 1.6875, 1.5625, 0.875, 0.36, 0.36, true);
      ironPlate(iron, s * 2.24, 3.8125, 1, 0.24, 0.3);
      iron.push(moved(turnedY(forwardLathe(torus(0.05, 0.016, IRON_DK, 0, 10, 5)), Math.PI / 2), s * 2.1, 3.575, BOARD.lamps[0][2]));
    }
    // Candles on the rock ledge the niche leaves under the board, their flames lit.
    for (const x of [-1.6, -1.35, 1.35, 1.65]) {
      const tall = 0.12 + rand() * 0.1;
      round.push(moved(lathe({ profile: [[0.04, 0], [0.04, tall], [0.03, tall + 0.01], [0, tall + 0.01]], segments: 8, color: "#efe2c4" }), x, 1, 0.85));
      glow.push(moved(lathe({ profile: [[0, 0], [0.022, 0.03], [0.014, 0.07], [0, 0.1]], segments: 6, color: "#ffb43a", emissive: 1 }), x, 1.01 + tall, 0.85));
    }
    // Ivy over the top beam and down beside the lanterns.
    for (const [x, top, len, n, z] of [[-2.5, 4.6, 2.4, 8, 0.6], [2.5, 4.6, 1.8, 6, 0.6], [-0.9, 4.55, 0.7, 3, 1.05], [1.1, 4.55, 0.5, 2, 1.05]]) {
      round.push(tube({ path: (t) => ({ x: x + Math.sin(t * 5 + x) * 0.06, y: top - t * len, z }), radius: () => 0.022, rings: 14, segments: 5, colorFn: () => "#2f5a22" }));
      for (let k = 0; k < n; k++) flat.push(moved(turnedZ(leaf(1.5, k % 2 ? "#4f9a36" : "#3c8229"), (rand() - 0.5) * 1.3), x + (rand() - 0.5) * 0.3, top - 0.15 - k * len / n, z + 0.03));
    }
    return { timber: pixelGeometry(v), iron: merge(...iron), trim: shaded(round, flat), glow: noShadow(merge(...glow)) };
  });

  // A donation's sat: a lime cube with the ₿ on two faces, green going in so the bananas come out ripe; drawn by the
  // dozen as one instanced batch.
  const satCube = cached(() => noShadow(merge(
    bevelBox({ w: 0.3, h: 0.3, d: 0.3, color: "#7fe83a", emissive: 0.9, bevel: 0.05 }),
    moved(smoothBitcoin(0.2, 0.02, "#f0ffd8", 1), 0, 0, 0.155),
    turnedY(moved(smoothBitcoin(0.2, 0.02, "#f0ffd8", 1), 0, 0, 0.155), Math.PI))));
  // A banana thrown out of the cooker: the island's banana, lowered so it turns about its middle. Its own object,
  // since the crew's thrown rounds draw the shared one.
  const flyingBanana = cached(() => {
    const b = models.bananaGeometry();
    return noShadow({ ...b, verts: b.verts.map((v, i) => i % 3 === 1 ? v - 0.22 : v) });
  });

  // The lookout: a timber tower on the top deck with a lantern room, a blue banner with the bolt hanging from it,
  // and a copper dome; the beam sweeps while the feed is live.
  const lookoutTower = cached(() => {
    const t = LAYOUT.lookout, round = [], flat = [], h = t.tower;
    for (const [x, z] of [[-1.1, -1.1], [1.1, -1.1], [1.1, 1.1], [-1.1, 1.1]]) flat.push(beam(x, 0, z, x * 0.7, h, z * 0.7, 0.26, TIMBER_DK));
    for (let y = 1.2; y < h; y += 1.6) {
      const k = 1 - y / h * 0.3;
      flat.push(beam(-1.1 * k, y, -1.1 * k, 1.1 * k, y + 0.8, 1.1 * k, 0.12, TIMBER), beam(1.1 * k, y, -1.1 * k, -1.1 * k, y + 0.8, 1.1 * k, 0.12, TIMBER));
    }
    flat.push(bevelBox({ w: 2.4, h: 0.3, d: 2.4, color: TIMBER_LT, bevel: 0.05, offset: { y: h } }));
    round.push(turn([[0.95, h + 0.15], [0.95, h + 0.28], [0.8, h + 0.34], [0, h + 0.34]], 16, BRASS));
    // A spindle and bearing support the rotating optic, leaving the lantern room open around it.
    round.push(turn([[0.3, h + 0.34], [0.3, h + 0.42], [0.2, h + 0.46], [0.2, h + 0.53], [0.1, h + 0.56], [0.1, h + 0.94], [0, h + 0.94]], 20, BRONZE));
    round.push(moved(torus(0.25, 0.025, BRASS), 0, h + 0.44, 0));
    flat.push(bevelBox({ w: 0.42, h: 0.045, d: 0.52, color: IRON_DK, bevel: 0.01, offset: { x: -0.48, y: h + 0.35, z: 0.38 } }));
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU;
      flat.push(bevelBox({ w: 0.08, h: 1.5, d: 0.08, color: BRASS, bevel: 0.02, offset: { x: Math.cos(a) * 0.86, y: h + 1.05, z: Math.sin(a) * 0.86 } }));
    }
    round.push(turn([[1.12, h + 1.8], [1.12, h + 1.92], [0.7, h + 2.45], [0.3, h + 2.8], [0, h + 2.86]], 18, COPPER_DK));
    round.push(moved(ball(0.14, BRASS, 0, 10), 0, h + 2.98, 0));
    // The banner, facing the balcony.
    flat.push(bevelBox({ w: 1.6, h: 0.1, d: 0.1, color: TIMBER_DK, bevel: 0.02, offset: { y: h - 0.35, z: 1.2 } }));
    flat.push(box({ w: 1.3, h: 2.2, d: 0.05, color: "#2b52b8", offset: { y: h - 1.5, z: 1.2 } }));
    flat.push(moved(smoothBolt(1.4, 0.06, "#8fd0ff", 0.9), 0, h - 1.45, 1.25));
    return shaded(round, flat);
  });
  const lookoutLamp = cached(() => {
    // The bulb sits at the reflector's focus; all optical parts are local to this centre.
    const build = (on) => noShadow(shaded([ball(0.13, on ? "#fff1c7" : "#8c8675", on ? 1 : 0, 16)]));
    return { on: build(true), off: build(false) };
  });
  const lookoutOptics = cached(() => {
    const round = [], flat = [], axis = (g) => turnedZ(g, -Math.PI / 2);
    // A hollow reflector opens towards +x, behind the bulb, with a pale reflective interior.
    round.push(axis(turn([[0, -0.49], [0.16, -0.46], [0.32, -0.37], [0.47, -0.2], [0.56, 0.04],
      [0.54, 0.04], [0.45, -0.18], [0.3, -0.34], [0.14, -0.43], [0, -0.46]], 32, (t) => t < 0.5 ? BRONZE : "#d6d0bb")));
    round.push(moved(axis(torus(0.55, 0.028, BRASS, 0, 32)), 0.04, 0, 0));
    round.push(moved(axis(torus(0.52, 0.035, BRASS, 0, 32)), 0.48, 0, 0));
    round.push(turn([[0.07, -0.36], [0.07, -0.15], [0, -0.15]], 12, IRON_DK));
    round.push(moved(ball(0.065, BRASS, 0, 12), 0, -0.16, 0));
    // Three slender stays hold the lens ahead of the light without hiding its centre.
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * TAU, y = Math.cos(a) * 0.52, z = Math.sin(a) * 0.52;
      flat.push(beam(0.04, y, z, 0.48, y, z, 0.035, BRONZE));
    }
    flat.push(beam(-0.3, -0.38, 0, 0.3, -0.38, 0, 0.08, BRONZE));
    // Concentric stepped rings keep a Fresnel lens thin instead of filling the room with glass.
    const profile = [[0, 0.49]];
    for (let k = 1; k <= 7; k++) {
      const r = k / 7 * 0.49;
      profile.push([r, 0.435], [r, 0.49]);
    }
    profile.push([0.49, 0.42], [0, 0.42]);
    const lens = noShadow(shaded([axis(turn(profile, 32, "#cde7df", 0.08))]));
    lens.glass = 0.26;
    return { frame: shaded(round, flat), lens };
  });
  // A faint cone through the dusty air; the matching spotlight lights the surfaces in its path.
  const lookoutBeam = cached(() => {
    const range = LOOKOUT_BEAM.range;
    const g = lathe({ profile: [[0.04, 0], [Math.tan(LOOKOUT_BEAM.outer) * range, range], [0, range]], segments: 24, color: "#fff2c0", emissive: 1 });
    const v = g.verts;
    for (let i = 0; i < v.length; i += 3) { const y = v[i + 1]; v[i + 1] = v[i]; v[i] = y; }
    g.faces.forEach((f) => f.i.reverse());
    g.glass = 0.055;
    g.lightBeam = range;
    return noShadow(g);
  });
  const BOOKS = ["#8b2d23", "#2d5a8b", "#3f7a38", "#b58a2a", "#6a3a8b", "#a0522d", "#1f5a5a"];
  const leaf = (k, color) => prism([[0, 0], [0.07 * k, 0.09 * k], [0, 0.22 * k], [-0.07 * k, 0.09 * k]], 0.02, color);
  const studyHall = BL.models.cachedSteps(function* (slice = null) {
    const round = [], flat = [], glow = [], rand = mulberry32(42), P = STUDY.post, Z = STUDY.z, HY = STUDY.header;
    const rivet = (x, y, z) => round.push(moved(ball(0.045, IRON_LT, 0, 8), x, y, z));
    const disc = (r, color, x, y, z) => moved(forwardLathe(turn([[r, 0], [r, 0.04], [r * 0.75, 0.08], [0, 0.09]], 18, color)), x, y, z);
    // The rock the wall is cut back to round the portal: piers either side of the room, courses over the arch that
    // lean out as the wall does, stones in the arch's spandrels and a slab behind it all.
    flat.push(box({ w: 7, h: 10, d: 0.5, color: STONE_DK, offset: { y: 4.5, z: -3.1 } }));
    for (const s of [-1, 1]) {
      flat.push(bevelBox({ w: 1.5, h: 5.2, d: 3.4, color: STONE[2], bevel: 0.14, offset: { x: s * 2.75, y: 2.4, z: -1.3 } }));
      flat.push(bevelBox({ w: 1, h: 1, d: 1, color: STONE[1], bevel: 0.14, offset: { x: s * 2.05, y: 4.45, z: 0.05 } }));
    }
    for (let y = 4.9; y < 9.6; y += 1.2) { for (let x = -2.7; x <= 2.8; x += 1.8) { yield* pause(slice);
      const d = 3.2 + (y - 4.9) * 0.12;
      flat.push(bevelBox({ w: 1.9, h: 1.3, d, color: STONE[Math.floor(rand() * 4)], bevel: 0.16, offset: { x: x + (rand() - 0.5) * 0.3, y: y + 0.6, z: 0.4 + (y - 4.9) * 0.1 - d / 2 - rand() * 0.3 } }));
    } }
    // The threshold: planks from the walkway's edge in under the arch.
    for (let i = 0; i < 12; i++) { yield* pause(slice); flat.push(bevelBox({ w: 0.78, h: 0.1, d: 1.58, color: i % 3 ? TIMBER : TIMBER_LT, bevel: 0.02, offset: { x: -4.5 + i * 0.8, y: -0.05, z: 0.39 } })); }
    // The arch: cut stone, pillowed, a ring of voussoirs with a keystone on jambs of alternating quoins.
    const R0 = 1.75, R1 = 2.45, CY = 2.5, CUT = ["#8a7a6a", "#7a6a5c"], mid = (R0 + R1) / 2;
    for (let k = 0; k <= 10; k++) { yield* pause(slice);
      const a = Math.PI * k / 10, key = k === 5, w = mid * Math.PI / 10 * 0.92;
      round.push(moved(turnedZ(bevelBox({ w: key ? w * 1.3 : w, h: key ? 0.95 : R1 - R0, d: key ? 1.2 : 1, color: key ? "#9c8b78" : CUT[k % 2], bevel: 0.12 }), a - Math.PI / 2), Math.cos(a) * mid, CY + Math.sin(a) * mid, key ? 0.25 : 0.15));
    }
    for (const s of [-1, 1]) { for (let row = 0; row < 3; row++) {
      const wide = row % 2 === 0;
      round.push(bevelBox({ w: wide ? 0.9 : 0.7, h: 0.72, d: 1, color: CUT[(row + (s > 0 ? 1 : 0)) % 2], bevel: 0.1, offset: { x: s * (wide ? 2.2 : 2.1), y: 0.37 + row * 0.73, z: 0.15 } }));
    } }
    // The door frame inside the arch, and the room behind it: floor, panelled walls, ceiling and a rug.
    for (const s of [-1, 1]) { flat.push(bevelBox({ w: 0.26, h: 3.3, d: 0.3, color: TIMBER_DK, bevel: 0.04, offset: { x: s * 1.58, y: 1.65, z: -0.45 } })); }
    flat.push(bevelBox({ w: 3.5, h: 0.3, d: 0.34, color: TIMBER, bevel: 0.05, offset: { y: 3.4, z: -0.45 } }));
    flat.push(box({ w: 3.9, h: 0.1, d: 2.6, color: TIMBER_LT, offset: { y: 0.02, z: -1.6 } }));
    for (const s of [-1, 1]) { flat.push(box({ w: 0.2, h: 4.6, d: 2.6, color: "#4a2e1a", emissive: 0.08, offset: { x: s * 1.95, y: 2.3, z: -1.6 } })); }
    flat.push(box({ w: 4.1, h: 4.6, d: 0.2, color: "#5a3820", emissive: 0.12, offset: { y: 2.3, z: -2.85 } }));
    flat.push(box({ w: 4.1, h: 0.2, d: 2.6, color: "#4a2e1a", offset: { y: 4.5, z: -1.6 } }));
    flat.push(box({ w: 1.8, h: 0.02, d: 1.2, color: BRASS, offset: { y: 0.08, z: -1.3 } }), box({ w: 1.6, h: 0.03, d: 1, color: "#8a2a24", offset: { y: 0.09, z: -1.3 } }));
    // Shelves of books either side of the back wall, and the bolt on a dark board between them.
    for (const sx of [-1, 1]) {
      const cx = sx * 1.2, w = 1.25;
      for (const e of [-1, 1]) { flat.push(bevelBox({ w: 0.1, h: 3.5, d: 0.45, color: TIMBER, bevel: 0.02, offset: { x: cx + e * w / 2, y: 1.75, z: -2.45 } })); }
      for (let sh = 0; sh < 5; sh++) { yield* pause(slice);
        const y = 0.12 + sh * 0.8;
        flat.push(bevelBox({ w, h: 0.07, d: 0.45, color: TIMBER_LT, bevel: 0.015, offset: { x: cx, y, z: -2.45 } }));
        if (sh === 4) break;
        for (let x = cx - w / 2 + 0.07; x < cx + w / 2 - 0.2;) {
          const bw = 0.1 + rand() * 0.07, bh = 0.44 + rand() * 0.22;
          flat.push(box({ w: bw, h: bh, d: 0.32, color: BOOKS[Math.floor(rand() * BOOKS.length)], offset: { x: x + bw / 2, y: y + 0.035 + bh / 2, z: -2.42 } }));
          x += bw + 0.012;
        }
      }
    }
    flat.push(bevelBox({ w: 0.95, h: 1.2, d: 0.08, color: "#17110d", bevel: 0.02, offset: { y: 2.75, z: -2.7 } }));
    glow.push(moved(smoothBolt(0.9, 0.06, "#ffd23a", 1), 0, 2.75, -2.63));
    // The desk, a globe on its stand and an open book, and the lantern hung over them.
    flat.push(bevelBox({ w: 1.1, h: 0.08, d: 0.55, color: TIMBER_LT, bevel: 0.02, offset: { y: 0.8, z: -1.95 } }));
    for (const lx of [-0.48, 0.48]) { for (const lz of [-0.2, 0.2]) { flat.push(box({ w: 0.07, h: 0.76, d: 0.07, color: TIMBER_DK, offset: { x: lx, y: 0.38, z: -1.95 + lz } })); } }
    round.push(moved(turn([[0.1, 0], [0.1, 0.03], [0.03, 0.05], [0.03, 0.14], [0, 0.14]], 10, BRASS), -0.3, 0.84, -1.95));
    round.push(moved(ball(0.16, "#3a7ac0", 0, 14), -0.3, 1.14, -1.95), moved(forwardLathe(torus(0.19, 0.012, BRASS, 0, 16, 4)), -0.3, 1.14, -1.95));
    flat.push(box({ w: 0.48, h: 0.025, d: 0.32, color: "#6b2a1a", offset: { x: 0.2, y: 0.85, z: -1.9 } }));
    for (const s of [-1, 1]) { flat.push(moved(turnedZ(box({ w: 0.22, h: 0.02, d: 0.3, color: "#efe2c4", offset: { x: s * 0.11 } }), s * 0.12), 0.2, 0.875, -1.9)); }
    round.push(...chain(0, 4.4, -1.5, 0, 3.95, -1.5, 0.05, IRON_DK));
    lanternParts(0.9, 0, 3.95 - 0.84 * 0.9, -1.5, flat, glow);
    // The portal: posts bound in iron on stone footings, a header on a lower beam with iron plates at the joints
    // and knee braces under it, and brackets at its ends for the lanterns.
    for (const s of [-1, 1]) { yield* pause(slice);
      const x = s * P;
      flat.push(bevelBox({ w: 0.7, h: 0.36, d: 0.7, color: STONE_DK, bevel: 0.07, offset: { x, y: 0.18, z: Z } }));
      flat.push(bevelBox({ w: 0.44, h: 7.6, d: 0.44, color: TIMBER_DK, bevel: 0.06, offset: { x, y: 4.1, z: Z } }));
      flat.push(bevelBox({ w: 0.56, h: 0.14, d: 0.56, color: TIMBER_LT, bevel: 0.03, offset: { x, y: 7.97, z: Z } }));
      for (const y of [1.2, 3.3]) {
        flat.push(bevelBox({ w: 0.5, h: 0.12, d: 0.5, color: IRON_DK, bevel: 0.02, offset: { x, y, z: Z } }));
        for (const bx of [-0.12, 0.12]) { rivet(x + bx, y, Z + 0.26); }
      }
      flat.push(bevelBox({ w: 0.62, h: 0.62, d: 0.05, color: IRON_DK, bevel: 0.015, offset: { x, y: HY, z: Z + 0.27 } }));
      for (const [bx, by] of [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]]) { rivet(x + bx, HY + by, Z + 0.3); }
      flat.push(beam(x - s * 0.2, 4.3, Z, x - s * 0.95, 5.02, Z, 0.16, TIMBER));
      flat.push(box({ w: 0.06, h: 0.06, d: 0.3, color: IRON_DK, offset: { x: s * 3.55, y: HY - 0.22, z: Z + 0.3 } }));
    }
    flat.push(bevelBox({ w: 7.6, h: 0.5, d: 0.52, color: TIMBER, bevel: 0.07, offset: { y: HY, z: Z } }));
    flat.push(bevelBox({ w: 5.9, h: 0.24, d: 0.4, color: TIMBER_DK, bevel: 0.05, offset: { y: HY - 0.45, z: Z } }));
    // The sign's frame on the header: timber round a dark board, iron at the corners and a lit bolt at each end.
    const [sx, sy, sz] = STUDY.sign;
    signFrame(round, flat, sx, sy, sz, 6.3, 1.5);
    for (const s of [-1, 1]) { glow.push(moved(smoothBolt(0.95, 0.1, "#ffd23a", 1), sx + s * 2.62, sy, sz + 0.02)); }
    // The striped rope slung between the posts' tops, over the sign.
    const rope = (t) => ({ x: -P + 2 * P * t, y: 7.82 - Math.sin(Math.PI * t) * 0.3, z: Z + 0.28 });
    round.push(tube({ path: rope, radius: () => 0.05, rings: 40, segments: 6, colorFn: (t) => Math.floor(t * 20) % 2 ? "#1c1a18" : "#f2c230" }));
    // The banner's arm off the right post, braced, and the banner in the cave's black.
    flat.push(bevelBox({ w: 1.8, h: 0.16, d: 0.16, color: TIMBER_DK, bevel: 0.03, offset: { x: P + 0.9, y: 4.95, z: Z + 0.3 } }));
    flat.push(beam(P + 0.22, 4.25, Z + 0.25, P + 0.85, 4.9, Z + 0.3, 0.1, TIMBER));
    flat.push(moved(merge(banner(2.1, "#1a1716")), P + 1.25, 4.8, Z + 0.38));
    // The easel the lesson stands on, and a crate by the right post with books and a plant on it.
    const [ex] = STUDY.easel;
    for (const s of [-1, 1]) { flat.push(beam(ex + s * 0.62, 0, 1.42, ex + s * 0.48, 2.75, 1.02, 0.09, TIMBER)); }
    flat.push(beam(ex, 0, 0.75, ex, 2.6, 1.05, 0.08, TIMBER_DK));
    const [cx, cz] = STUDY.crate;
    flat.push(bevelBox({ w: 0.8, h: 0.75, d: 0.75, color: TIMBER_LT, bevel: 0.05, offset: { x: cx, y: 0.375, z: cz } }));
    for (const y of [0.2, 0.55]) { flat.push(box({ w: 0.82, h: 0.05, d: 0.77, color: TIMBER_DK, offset: { x: cx, y, z: cz } })); }
    for (let i = 0; i < 3; i++) { flat.push(moved(turnedY(bevelBox({ w: 0.46 - i * 0.05, h: 0.1, d: 0.34, color: BOOKS[i * 2], bevel: 0.015 }), (rand() - 0.5) * 0.6), cx - 0.12, 0.8 + i * 0.1, cz)); }
    round.push(moved(turn([[0.09, 0], [0.12, 0.2], [0.13, 0.22], [0.11, 0.22], [0, 0.2]], 12, "#b0643a"), cx + 0.24, 0.75, cz + 0.14));
    for (let k = 0; k < 7; k++) { flat.push(moved(turnedY(turnedX(leaf(1.4, k % 2 ? "#4f9a36" : "#3c8229"), 0.5 + (k % 3) * 0.2), k * TAU / 7), cx + 0.24, 0.93, cz + 0.14)); }
    // Two chains from iron eyes on the posts, crossed over the doorway to the padlock.
    const CH = "#80858c";
    for (const s of [-1, 1]) { yield* pause(slice);
      round.push(...chain(s * (P - 0.24), 3.8, Z, s * 0.3, 2.56, Z + 0.16, 0.13, CH));
      round.push(...chain(s * 0.34, 1.6, Z + 0.16, s * (P - 0.24), 0.7, Z, 0.13, CH));
      for (const y of [3.8, 0.7]) { round.push(moved(turnedZ(torus(0.1, 0.035, IRON_DK, 0, 12, 6), Math.PI / 2), s * (P - 0.25), y, Z)); }
    }
    // The padlock: a pillowed yellow body with a monkey's face on it and a steel shackle.
    const LY = 2, LZ = Z + 0.2, legs = 0.2, r = 0.3, reach = legs * 2 + Math.PI * r;
    round.push(bevelBox({ w: 1.05, h: 0.95, d: 0.34, color: "#d69a1e", bevel: 0.14, offset: { y: LY, z: LZ } }));
    round.push(tube({
      path: (t) => {
        const d = t * reach, base = LY + 0.42;
        if (d < legs) return { x: -r, y: base + d, z: LZ };
        if (d > legs + Math.PI * r) return { x: r, y: base + legs - (d - legs - Math.PI * r), z: LZ };
        const a = Math.PI - (d - legs) / r;
        return { x: Math.cos(a) * r, y: base + legs + Math.sin(a) * r, z: LZ };
      },
      radius: () => 0.075, rings: 24, segments: 8, colorFn: () => "#a9aeb5"
    }));
    const FZ = LZ + 0.16, FUR = "#5b3517", MASK = "#e6b77e";
    round.push(disc(0.3, FUR, 0, LY - 0.02, FZ));
    for (const s of [-1, 1]) {
      round.push(disc(0.12, FUR, s * 0.3, LY + 0.08, FZ - 0.01), disc(0.065, MASK, s * 0.3, LY + 0.08, FZ + 0.01), disc(0.12, MASK, s * 0.1, LY + 0.04, FZ + 0.04));
      round.push(moved(ball(0.042, "#111111", 0, 8), s * 0.1, LY + 0.05, FZ + 0.13), moved(ball(0.018, "#3a1f10", 0, 6), s * 0.035, LY - 0.08, FZ + 0.13));
    }
    round.push(disc(0.16, MASK, 0, LY - 0.13, FZ + 0.04));
    flat.push(box({ w: 0.14, h: 0.025, d: 0.02, color: "#3a1f10", offset: { y: LY - 0.18, z: FZ + 0.135 } }));
    // Vines down the rock and the posts.
    const vine = (x, y, z, len) => {
      const path = (t) => ({ x: x + Math.sin(t * 9 + x * 3) * 0.07, y: y - t * len, z: z + Math.sin(t * 6 + x) * 0.03 });
      round.push(tube({ path, radius: () => 0.028, rings: 12, segments: 5, colorFn: () => "#35602a" }));
      for (let d = 0.1, i = 0; d < len; d += 0.15, i++) {
        const p = path(d / len);
        flat.push(moved(turnedZ(leaf(0.9 + rand() * 0.5, rand() < 0.5 ? "#4f9a36" : "#3c8229"), (i % 2 ? 1 : -1) * (2 + rand() * 0.5)), p.x, p.y, p.z + 0.02));
      }
    };
    vine(-2.2, HY - 0.25, Z + 0.3, 1.2);
    vine(-3.3, 7.9, Z + 0.45, 2.2);
    vine(3.35, 7.9, Z + 0.45, 1.5);
    vine(-1.6, 9.4, 0.95, 1.5);
    vine(2.3, 9.2, 1, 1.1);
    return { stone: shaded(round, flat), glow: noShadow(shaded(glow)) };
  });
  const tunnel = (theme) => {
    const T = TUNNEL_THEMES[theme], geos = [], glow = [], lit = [], rand = mulberry32(theme * 11 + 3), cy = 2.6;
    for (const [r, n, depth, z] of [[2.5, 12, 1.4, 0], [3.2, 16, 1.1, -0.15]]) for (let k = 0; k <= n; k++) {
      const a = Math.PI * k / n, key = k === n / 2, w = r * Math.PI / n * 0.9;
      geos.push(moved(turnedZ(bevelBox({ w: key ? w * 1.35 : w, h: key ? 0.9 : 0.66, d: key ? depth + 0.2 : depth, color: key ? ROCK_LT : k % 2 ? STONE[3] : STONE[1], bevel: 0.09 }), a - Math.PI / 2), Math.cos(a) * r, cy + Math.sin(a) * r, z));
    }
    for (const s of [-1, 1]) for (let row = 0; row < 4; row++) for (const [x, d, z] of [[2.5, 1.4, 0], [3.2, 1.1, -0.15]]) {
      geos.push(bevelBox({ w: 0.66, h: 0.62, d, color: (row + (x < 3 ? 0 : 1)) % 2 ? STONE[0] : STONE[2], bevel: 0.08, offset: { x: s * x, y: 0.32 + row * 0.65, z } }));
    }
    // Studs of light in iron settings on the outer ring and the piers.
    const stud = (x, y, a) => {
      geos.push(moved(turnedZ(bevelBox({ w: 0.32, h: 0.32, d: 0.1, color: IRON_DK, bevel: 0.03 }), a), x, y, 0.45));
      lit.push(moved(turnedZ(box({ w: 0.18, h: 0.18, d: 0.06, color: T.ring, emissive: 1 }), a), x, y, 0.52));
    };
    for (let k = 1; k < 6; k++) { const a = Math.PI * k / 6; stud(Math.cos(a) * 3.2, cy + Math.sin(a) * 3.2, a - Math.PI / 2); }
    for (const s of [-1, 1]) for (const y of [0.95, 1.9]) stud(s * 3.2, y, 0);
    // The neon strip round the arch's inside, down both legs to the floor.
    const R = 2.08, legs = cy - 0.15, total = 2 * legs + Math.PI * R;
    const neon = (t) => {
      const d = t * total;
      if (d < legs) return { x: -R, y: 0.15 + d, z: 0.52 };
      if (d > legs + Math.PI * R) return { x: R, y: cy - (d - legs - Math.PI * R), z: 0.52 };
      const a = Math.PI - (d - legs) / R;
      return { x: Math.cos(a) * R, y: cy + Math.sin(a) * R, z: 0.52 };
    };
    lit.push(tube({ path: neon, radius: () => 0.075, rings: 60, segments: 8, colorFn: () => T.ring, emissive: 1 }));
    // The timber frame: posts, a header on iron brackets.
    for (const s of [-1, 1]) {
      geos.push(bevelBox({ w: 0.44, h: 6.2, d: 0.46, color: TIMBER_DK, bevel: 0.06, offset: { x: s * TUNNEL_POST, y: 3.1, z: 0.35 } }));
      for (const y of [1.2, 3.4, 5.6]) geos.push(bevelBox({ w: 0.52, h: 0.1, d: 0.54, color: IRON_DK, bevel: 0.02, offset: { x: s * TUNNEL_POST, y, z: 0.35 } }));
    }
    geos.push(bevelBox({ w: 8.6, h: 0.52, d: 0.52, color: TIMBER, bevel: 0.07, offset: { y: 6.15, z: 0.35 } }));
    // Rails running in, on sleepers.
    for (const x of [-0.5, 0.5]) geos.push(box({ w: 0.08, h: 0.08, d: 4.2, color: IRON_LT, offset: { x, y: 0.1, z: -1 } }));
    for (let z = 0.9; z > -3; z -= 0.5) geos.push(box({ w: 1.3, h: 0.06, d: 0.18, color: TIMBER_DK, offset: { y: 0.04, z } }));
    // The console box by the door, with the bolt lit on its screen.
    geos.push(bevelBox({ w: 0.9, h: 0.4, d: 0.8, color: STONE[2], bevel: 0.05, offset: { x: TUNNEL_BOX[0], y: -0.2, z: TUNNEL_BOX[1] } }));
    geos.push(bevelBox({ w: 0.62, h: 0.72, d: 0.5, color: TIMBER, bevel: 0.05, offset: { x: TUNNEL_BOX[0], y: 0.36, z: TUNNEL_BOX[1] } }));
    lit.push(box({ w: 0.44, h: 0.44, d: 0.03, color: "#12305a", emissive: 0.8, offset: { x: TUNNEL_BOX[0], y: 0.42, z: TUNNEL_BOX[1] + 0.26 } }));
    lit.push(moved(smoothBolt(0.36, 0.03, "#8fd8ff", 1), TUNNEL_BOX[0], 0.42, TUNNEL_BOX[1] + 0.29));
    // The passage behind the arch, walled and roofed, and the rock the wall is cut back to round it.
    for (const x of [-2.75, 2.75]) geos.push(bevelBox({ w: 0.5, h: 5.3, d: 2.8, color: STONE[2], bevel: 0.1, offset: { x, y: 2.65, z: -1.9 } }));
    geos.push(bevelBox({ w: 6, h: 0.6, d: 2.8, color: STONE[1], bevel: 0.1, offset: { y: 5.3, z: -1.9 } }));
    geos.push(box({ w: 9, h: 8.6, d: 0.5, color: STONE_DK, offset: { y: 3.8, z: -3.6 } }));
    for (const x of [-3.9, 3.9]) geos.push(bevelBox({ w: 1.3, h: 8.2, d: 1.6, color: STONE[0], bevel: 0.14, offset: { x, y: 4.1, z: -1.2 } }));
    // The rock over the header, which the sign hangs against.
    geos.push(bevelBox({ w: 9, h: 1.8, d: 1.6, color: STONE[1], bevel: 0.14, offset: { y: 7.3, z: -0.6 } }));
    // The peer's place, far off: its sky and ground, crystals in its colour, and houses with lit windows.
    glow.push(box({ w: 4.4, h: 4.6, d: 0.1, color: T.sky, emissive: 0.8, offset: { y: 2.3, z: -3.2 } }));
    glow.push(box({ w: 4.4, h: 0.9, d: 1.4, color: T.ground, emissive: 0.45, offset: { y: 0.45, z: -2.5 } }));
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.95 + (rand() - 0.5) * 0.3, h = 0.5 + rand() * 0.9;
      lit.push(moved(lathe({ profile: [[0.14, 0], [0.1, h * 0.7], [0, h]], segments: 5, color: T.ring, emissive: 0.85 }), x, 0.9, -3 + rand() * 0.2));
    }
    for (let i = 0; i < 3; i++) {
      const x = -1.3 + i * 1.3, h = 0.6 + rand() * 0.5;
      glow.push(box({ w: 0.7, h, d: 0.5, color: "#3a2a1e", emissive: 0.3, offset: { x, y: 0.9 + h / 2, z: -2.7 } }));
      glow.push(moved(prism([[-0.45, 0], [0.45, 0], [0, 0.35]], 0.6, T.accent, 0.5), x, 0.9 + h, -2.7), box({ w: 0.14, h: 0.16, d: 0.05, color: "#ffd27a", emissive: 1, offset: { x, y: 0.9 + h / 2, z: -2.44 } }));
    }
    return { stone: merge(...geos), glow: noShadow(shaded(lit, glow)) };
  };
  const tunnels = cached(() => TUNNEL_THEMES.map((_, i) => tunnel(i)));
  // Each shield's mirror face: the arch's opening as one quad facing +z, at the shield's plane in the tunnel's
  // frame. A reflector, one geometry a tunnel, since each keeps a reflection of its own.
  const peerMirrors = cached(() => TUNNEL_THEMES.map(() => ({
    verts: [-2.1, 0.1, 0, 2.1, 0.1, 0, 2.1, 4.65, 0, -2.1, 4.65, 0],
    faces: [{ i: [0, 1, 2, 3], color: hexToRgb("#81919c"), emissive: 0 }],
    lines: [], castShadow: false, reflector: true
  })));

  // A gallery station: a smaller pair of capacitors on a stand, for the lines past the featured four.
  const galleryStation = cached(() => shaded([-0.4, 0.4].flatMap((x) => [
    moved(turn([[0.36, 0], [0.36, 0.3], [0.3, 0.36], [0, 0.36]], 14, BRONZE), x, 0, 0),
    moved(turn([[0.3, 1.6], [0.34, 1.66], [0.34, 1.8], [0, 1.84]], 14, BRONZE), x, 0, 0)
  ]), [bevelBox({ w: 1.7, h: 0.18, d: 0.6, color: IRON_DK, bevel: 0.04, offset: { y: 0.1 } })]));
  const galleryCaps = cached(() => {
    const cap = (x, tone, lit) => {
      const [edge, core] = lit ? tone.lit : tone.dim;
      return [moved(turn([[0.26, 0.36], [0.29, 0.9], [0.29, 1.1], [0.26, 1.6]], 14, (t) => t > 0.2 && t < 0.75 ? core : edge, lit ? 1 : 0.65), x, 0, 0), moved(smoothBolt(0.7, 0.06, "#ffffff", lit ? 1 : 0.7), x, 1, 0.32)];
    };
    const build = (lit) => {
      const [a, b] = cap(-0.4, CAP_BLUE, lit), [c, d] = cap(0.4, CAP_ORANGE, false);
      return noShadow(shaded([a, c], [b, d]));
    };
    return { dim: build(false), lit: build(true) };
  });

  // The note on the study hall's post, as the concept writes it: a plank of pale pine nailed up askew, LOCKED in big
  // letters, BANANAS FIRST! under it and a banana drawn in the corner.
  const NOTE_FONT = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", "Segoe Print", cursive';
  // A picture on a face at `z`, W by H metres about the origin, for `imageSurface`.
  const picture = (canvas, W, H, z) => {
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const face = { verts: [-W / 2, -H / 2, z, W / 2, -H / 2, z, W / 2, H / 2, z, -W / 2, H / 2, z], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
    face.imageSurface = { asset: { width: canvas.width, height: canvas.height, load: () => image }, rect: [-W / 2, -H / 2, W, H] };
    return face;
  };
  const studyNote = cached(() => {
    const w = 440, h = 380, canvas = document.createElement("canvas"), g = canvas.getContext("2d");
    canvas.width = w;
    canvas.height = h;
    // Two boards with the grain drawn in, the seam between them and a darker edge.
    const wood = g.createLinearGradient(0, 0, w, h);
    wood.addColorStop(0, "#e4c08a");
    wood.addColorStop(1, "#c7995e");
    g.fillStyle = wood;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(120,72,30,0.3)";
    g.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const y = 10 + i * 23 + (i % 3) * 3;
      g.beginPath();
      for (let x = 0; x <= w; x += 20) g.lineTo(x, y + Math.sin(x / 40 + i) * 3);
      g.stroke();
    }
    g.fillStyle = "rgba(90,50,20,0.5)";
    g.fillRect(0, h / 2 - 2, w, 4);
    g.strokeStyle = "rgba(90,50,20,0.55)";
    g.lineWidth = 10;
    g.strokeRect(5, 5, w - 10, h - 10);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#3a1f0e";
    const line = (text, size, x, y, a) => { g.save(); g.translate(x, y); g.rotate(a); g.font = `bold ${size}px ${NOTE_FONT}`; g.fillText(text, 0, 0); g.restore(); };
    line("LOCKED -", 90, w / 2, 84, -0.03);
    line("BANANAS", 76, w / 2 - 6, 192, 0.02);
    line("FIRST!", 82, w / 2 - 56, 294, -0.03);
    // The banana: a yellow crescent with a brown edge and stalk, and a little shine.
    g.save();
    g.translate(344, 290);
    g.rotate(-0.5);
    g.beginPath();
    g.moveTo(-54, -8);
    g.quadraticCurveTo(0, 60, 54, -14);
    g.quadraticCurveTo(0, 28, -54, -8);
    g.fillStyle = "#ffd23a";
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = "#6b4213";
    g.stroke();
    g.beginPath();
    g.moveTo(54, -14);
    g.lineTo(64, -26);
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.7)";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(-28, 12);
    g.quadraticCurveTo(0, 30, 28, 10);
    g.stroke();
    g.restore();
    const H = 1.2, W = H * w / h, face = picture(canvas, W, H, 0.035);
    const back = merge(bevelBox({ w: W, h: H, d: 0.08, color: "#c7995e", bevel: 0.025, offset: { z: -0.01 } }), ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([nx, ny]) => moved(ball(0.035, IRON_DK, 0, 8), nx * (W / 2 - 0.08), ny * (H / 2 - 0.08), 0.04)));
    back.castShadow = false;
    return { face, back };
  });
  // The lesson on the easel by the study hall: the concept's bulb in chalk on a slate, with a sum beside it, in a
  // timber frame with a chalk tray. Built facing +z about its middle; the scene leans it back on the easel.
  const CHALK_FONT = '"Chalkboard SE", "Chalkboard", ' + NOTE_FONT;
  const studyBoard = cached(() => {
    const w = 480, h = 336, canvas = document.createElement("canvas"), g = canvas.getContext("2d");
    canvas.width = w;
    canvas.height = h;
    g.fillStyle = "#1f2b25";
    g.fillRect(0, 0, w, h);
    // Old chalk wiped across it.
    g.fillStyle = "rgba(220,232,222,0.05)";
    for (let i = 0; i < 7; i++) { g.save(); g.translate(60 + i * 60, 80 + (i % 3) * 80); g.rotate(-0.3 + (i % 2) * 0.2); g.fillRect(-70, -18, 140, 36); g.restore(); }
    g.strokeStyle = g.fillStyle = "rgba(242,242,230,0.92)";
    g.lineWidth = 5;
    g.lineCap = g.lineJoin = "round";
    // The bulb: its glass, the screw base and its tip, a bolt for a filament and rays round it.
    const bx = 350, by = 128;
    g.beginPath();
    g.arc(bx, by, 60, Math.PI * 0.78, Math.PI * 2.22);
    g.lineTo(bx + 24, by + 90);
    g.lineTo(bx - 24, by + 90);
    g.closePath();
    g.stroke();
    g.strokeRect(bx - 22, by + 92, 44, 32);
    for (const y of [102, 113]) { g.beginPath(); g.moveTo(bx - 22, by + y); g.lineTo(bx + 22, by + y); g.stroke(); }
    g.beginPath();
    g.arc(bx, by + 126, 10, 0, Math.PI);
    g.stroke();
    g.strokeStyle = "rgba(255,214,90,0.95)";
    g.beginPath();
    g.moveTo(bx + 8, by - 36);
    g.lineTo(bx - 14, by + 4);
    g.lineTo(bx + 6, by + 4);
    g.lineTo(bx - 8, by + 40);
    g.stroke();
    g.strokeStyle = "rgba(242,242,230,0.92)";
    for (let k = 0; k < 7; k++) {
      const a = Math.PI * (1.05 + k * 0.15);
      g.beginPath();
      g.moveTo(bx + Math.cos(a) * 78, by + Math.sin(a) * 78);
      g.lineTo(bx + Math.cos(a) * 100, by + Math.sin(a) * 100);
      g.stroke();
    }
    g.textAlign = "left";
    g.textBaseline = "middle";
    const text = (t, size, x, y) => { g.font = `bold ${size}px ${CHALK_FONT}`; g.fillText(t, x, y); };
    text("LESSON 1", 34, 30, 44);
    g.beginPath();
    g.moveTo(30, 68);
    g.lineTo(196, 64);
    g.stroke();
    text("1 BTC =", 30, 36, 124);
    text("100,000,000", 26, 36, 170);
    text("sats", 30, 36, 214);
    g.strokeStyle = "rgba(255,214,90,0.95)";
    g.beginPath();
    g.moveTo(58, 262);
    g.lineTo(42, 288);
    g.lineTo(56, 288);
    g.lineTo(44, 310);
    g.stroke();
    text("= fast!", 30, 70, 286);
    const W = 1.5, H = W * h / w, face = picture(canvas, W, H, 0.045);
    const parts = [box({ w: W, h: H, d: 0.08, color: "#1f2b25" })];
    for (const s of [-1, 1]) {
      parts.push(bevelBox({ w: W + 0.2, h: 0.1, d: 0.12, color: TIMBER, bevel: 0.02, offset: { y: s * (H / 2 + 0.05) } }));
      parts.push(bevelBox({ w: 0.1, h: H + 0.1, d: 0.12, color: TIMBER, bevel: 0.02, offset: { x: s * (W / 2 + 0.05) } }));
    }
    parts.push(bevelBox({ w: W + 0.1, h: 0.05, d: 0.18, color: TIMBER_LT, bevel: 0.015, offset: { y: -H / 2 - 0.12, z: 0.06 } }));
    parts.push(box({ w: 0.12, h: 0.03, d: 0.03, color: "#f4f1e6", offset: { x: -0.35, y: -H / 2 - 0.08, z: 0.08 } }), box({ w: 0.09, h: 0.03, d: 0.03, color: "#ffd65a", offset: { x: -0.15, y: -H / 2 - 0.08, z: 0.1 } }));
    const back = merge(...parts);
    back.castShadow = false;
    return { face, back };
  });

  // ---- lanterns ---------------------------------------------------------------------------------------

  // A status lantern for a line, the concept's blue one: clear glass of the line's state with the bolt on its front
  // and back, on a short chain from its hook at the origin. `ok` is blue for a line that runs, `alert` red for one
  // that is closing or closed.
  const statusLantern = cached(() => {
    const build = (tint, mark) => {
      const frame = [...chain(0, 0, 0, 0, -0.3, 0, 0.05, IRON_DK)], glass = [], s = 1.1, foot = -0.3 - 0.84 * s, W = 0.34 * s;
      lanternParts(s, 0, foot, 0, frame, glass, tint, false);
      for (const a of [0, Math.PI]) glass.push(turnedY(moved(smoothBolt(0.36 * s, 0.02, mark, 1), 0, foot + 0.3 * s, W / 2 + 0.012), a));
      return merge(merge(...frame), noShadow(merge(...glass)));
    };
    return { ok: build("#3fa7ff", "#e8fbff"), alert: build("#e8342a", "#ffe0d0") };
  });

  // A worker's hard hat with a lamp on its brow, sized for the gorillas' heads.
  const hardHat = cached(() => merge(
    lathe({ profile: [[0.36, 0], [0.35, 0.12], [0.28, 0.25], [0.13, 0.32], [0, 0.33]], segments: 12, color: "#f2c230" }),
    lathe({ profile: [[0.46, -0.02], [0.46, 0.04], [0.32, 0.04], [0.32, -0.02]], segments: 12, color: "#d9a522" }),
    box({ w: 0.13, h: 0.11, d: 0.07, color: "#fff4c0", emissive: 0.95, offset: { y: 0.14, z: 0.35 } })
  ));

  // The factory's end, from the balcony's back edge out to the rim. The rock is what the terrain carves at every
  // mouth, 5 wide and 3 high out to the rim and 6 by 4 in the chamber behind it where the shield stands, in the
  // terrain's own dark inner stone; toward the hall it takes the hall's stone and fills the front wall round the
  // portal. `outside` is the island drawn simply, for a visit that did not come in from the hub, which is the one
  // time there is no picture of it to hang past the rim (`outsideView`).
  const EXIT_ROCK = { unit: 0.5, x: [-13, 12], y: [-4, 8], z: [-9, 0] };
  const exitTunnel = cached(() => {
    const R = EXIT_ROCK, u = R.unit, v = makeVox();
    const open = (x, y, z) => y > 0 && (z > -2.5 ? Math.abs(x) < 2.5 && y < 3 : Math.abs(x) < 3 && y < 4);
    const at = (i) => (i + 0.5) * u;
    for (let i = R.x[0]; i <= R.x[1]; i++) for (let j = R.y[0]; j <= R.y[1]; j++) for (let k = R.z[0]; k <= R.z[1]; k++) {
      const x = at(i), y = at(j), z = at(k);
      if (open(x, y, z)) continue;
      // The face toward the hall is craggy: about a third of it stands half a block proud, clear of the portal.
      if (k === R.z[0] && (Math.abs(x) < 3.6 && y < 4 || (((i * 73856093) ^ (j * 19349663)) >>> 0) % 8 > 2)) continue;
      const inside = open(x + u, y, z) || open(x - u, y, z) || open(x, y + u, z) || open(x, y - u, z) || open(x, y, z + u) || open(x, y, z - u);
      // Inner stone in blocks of about a metre and floor under foot, both paling toward the rim with the daylight
      // falling in (baked, so it holds on the tiers that light only the stations); the hall's stone in blocks of
      // its own size.
      const block = (Math.floor(x) * 7 + Math.floor(y) * 13 + Math.floor(z) * 5) & 3, day = z > -1 ? 2 : z > -2.5 ? 1 : 0;
      v.set(i, j, k, inside ? (j < 0 ? 7 + day : 1 + day * 2 + (block & 1)) : 10 + ((Math.floor(x / 1.5) * 3 + Math.floor(y / 1.5) * 5 + k) & 3));
    }
    const palette = [null, "#4e443c", "#453b34", "#62564c", "#584d44", "#7a6d60", "#6e6256", "#4a3e34", "#5a4c40", "#6c5c4d", ...STONE];
    const rock = voxelGeometry(v, { unit: u, palette, origin: { x: 0, y: -0.01, z: 0 } });
    const { geos, glow } = tunnelFrame(0.45);
    const outside = [], band = (h, yc, color, emissive, z) => outside.push(box({ w: 11, h, d: 0.2, color, emissive, offset: { y: yc, z } }));
    const out = 0.5;
    band(2.2, 4.3, "#d6eeff", 1, out + 7.2);
    band(1.6, 2.5, "#b4dcfa", 1, out + 7.1);
    band(1.2, 1.2, "#c9e6e8", 0.95, out + 7);
    band(0.7, 0.45, "#a9d8b0", 0.9, out + 6.9);
    outside.push(box({ w: 3.6, h: 0.9, d: 0.4, color: "#9cc9a2", emissive: 0.8, offset: { x: -1.9, y: 0.55, z: out + 6.6 } }));
    outside.push(box({ w: 1.8, h: 0.6, d: 0.4, color: "#a8d3ac", emissive: 0.8, offset: { x: 2.5, y: 0.4, z: out + 6.6 } }));
    outside.push(box({ w: 11, h: 1, d: 6.2, color: "#9cc98c", emissive: 0.7, offset: { y: -0.52, z: out + 3.6 } }));
    outside.push(box({ w: 1.5, h: 0.08, d: 6.4, color: "#e6d0a2", emissive: 0.75, offset: { y: 0.02, z: out + 3.4 } }));
    outside.push(box({ w: 2.3, h: 0.06, d: 6.4, color: "#c1d09a", emissive: 0.7, offset: { y: 0, z: out + 3.4 } }));
    for (const [x, z, h] of [[-2.4, out + 4.2, 3.2], [2.1, out + 5, 2.7]]) {
      outside.push(box({ w: 0.26, h, d: 0.26, color: "#a8906e", emissive: 0.7, offset: { x, y: h / 2, z } }));
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + 0.4;
        outside.push(moved(turnedY(box({ w: 1.5, h: 0.14, d: 0.4, color: k % 2 ? "#86bf78" : "#94c986", emissive: 0.75, offset: { x: 0.7 } }), a), x, 0.05 + h, z));
      }
    }
    return { rock, timber: merge(...geos), glow: noShadow(merge(...glow)), outside: noShadow(merge(...outside)) };
  });
  const buildSteps = function* () {
    const slice = { until: 0, budget: BL.buildTasks.SLICE_MS };
    for (const build of [hall, scaffold, coreBody, conduits, stationFrame, forge, peerPipes, cookerBody, studyHall]) yield* build.steps(slice);
    return null;
  };
  Object.assign(BL.factoryModels, {
    buildSteps,
    forgeSign, forgeLines, forgeTrack, forgeShafts, mintCoin, teslaCoil, statusLantern, peerPipes, peerMirrors, supportAt, stairCeilingAt, clearAt, walkable, resolveFall, hall, scaffold, coreBody, coreChamber, conduits, stationFrame, capacitor, forge, forgeFire, cart, switchboard, switchScreens, rebalancerBase, rebalancerRing, rebalancerFlow, treasuryBody, goldPile, hopperFill, beltNugget, goldCrate, dataBoard, moveBoard, cookerBody, cookerFixtures, cookerLid, cookerPort, cookerGear, cookerSats, donationKiosk, kioskScreen, kioskIdle, kioskThanks, donationBoard, boardFace, boardValues, paintBoard, satCube, flyingBanana, coreRingLime, coreRing, teslaArcs, lookoutTower, lookoutLamp, lookoutOptics, lookoutBeam, studyHall, studyNote, studyBoard, tunnels, galleryStation, galleryCaps, hardHat, exitTunnel
  });
})();
