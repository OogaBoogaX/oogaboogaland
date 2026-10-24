// HALLOWEEN: the ghost hunt's geometry, for both renderers. The ghosts and drops are OBL-Audio-lab's own pictures
// (ghost-art-data.js) drawn as sprites: a quad carrying a cut-out picture (`imageSurface.cutout`, its alpha the
// coverage) that the hunt turns to face the camera. As in the lab, the plain ghost has a front, a back and a side (facing
// left, mirrored for right), the general five views of eight directions, the wraith the general's views washed black;
// each is painted once on a canvas with the lab's tint, edged with a crisp outline where the lab put a glow (a general
// blue, a wraith white, anything the ice slowed cold; the hit flash washes it white), and cached by what it shows. Ghosts
// and drops are hard cut-outs (their edge is their alpha at half); only the light round the drops is soft. A sprite stands one unit tall on y 0 (the
// hunt scales it), its outline just past its edges. The drops are the lab's pictures (the bomb drawn as the lab drew it)
// and the light round them the lab's gradients: a glow disc, a ring, a beam and a falling streak, in each drop's colour.
// Also the ecto-walls over each cave and bridge, the eye beam and soul stream (a unit beam along +z, scaled to its
// length), the grave of a player gone down and the bomb's shockwave ring. Everything is a scoped cache: built on first
// use, dropped with the hub.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { hexToRgb } = BL.math;
  const { geometry, pushVert, face, box, lathe, merge, prism, moved, variants, cached, ring, noShadow, track, tube, turn, shaded, along } = BL.models;
  const TIERS = { plain: 0, general: 1, wraith: 2, boss: 3, herald: 4 };
  const MODE = { normal: 0, flash: 1, iced: 2, tagged: 3 };
  // Each tier's wash and the outline standing for the lab's glow (draw.js); `bright` how much it blooms.
  const LOOKS = [
    { art: "plain", tint: null, outline: null, bright: 0.35 },
    { art: "general", tint: "rgba(60,130,255,0.42)", outline: "rgb(70,150,255)", bright: 0.45 },
    { art: "general", tint: "rgba(12,10,20,0.88)", outline: "rgb(255,255,255)", bright: 0.2 },
    { art: "plain", tint: null, outline: null, bright: 0.35 },
    { art: "plain", tint: null, outline: null, bright: 0.35 }
  ];
  // The views: plain art 0 front, 1 back, 2 side; general art 0 front, 1 back, 2 side, 3 quarter left, 4 quarter right.
  const ART = { plain: ["front", "back", "side"], general: ["generalFront", "generalBack", "generalSide", "generalLeft", "generalRight"] };
  // The lab's eight screen sectors of a general's heading (0 right, then clockwise with y down): which view, mirrored.
  const GENERAL_VIEWS = [[2, true], [4, false], [0, false], [3, false], [2, false], [1, false], [1, false], [1, false]];

  // ---------- pictures ----------
  const sources = {};
  let preparing = null;
  /** Decodes the embedded pictures once; sprites are built as their picture becomes ready. */
  const prepare = () => preparing || (preparing = Promise.all(Object.keys(BL.ghostArtData).map((name) => {
    const image = new Image();
    image.src = BL.ghostArtData[name];
    return image.decode().then(() => { sources[name] = image; }, () => {});
  })));
  const ready = (name) => !!sources[name];
  const canvasOf = (w, h) => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(w)); canvas.height = Math.max(1, Math.ceil(h));
    return canvas;
  };
  // A copy of a picture washed in `tint` (the lab's `tinted`), alpha kept.
  const washed = (image, tint) => {
    const canvas = canvasOf(image.naturalWidth || image.width, image.naturalHeight || image.height), g = canvas.getContext("2d");
    g.drawImage(image, 0, 0);
    if (tint) { g.globalCompositeOperation = "source-atop"; g.fillStyle = tint; g.fillRect(0, 0, canvas.width, canvas.height); }
    return canvas;
  };
  // A finished canvas as a sprite: a quad one unit tall for the picture proper (`body` pixels of it), its padding
  // below the feet `foot` pixels, carrying the canvas as a cut-out picture that glows `bright` into the bloom; `soft`
  // fades with its alpha (light), otherwise its edge is hard.
  // `blend` draws it truly see-through after everything opaque: "add" for light, "alpha" for a soft-edged picture.
  const spriteOf = (canvas, body, foot, bright, soft = false, blend = null) => {
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const unit = 1 / body, w = canvas.width * unit, h = canvas.height * unit, x0 = -w / 2, y0 = -foot * unit;
    const geo = { verts: [x0, y0, 0, x0 + w, y0, 0, x0 + w, y0 + h, 0, x0, y0 + h, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
    geo.imageSurface = { asset: { width: canvas.width, height: canvas.height, load: () => image }, rect: [x0, y0, w, h], cutout: true, soft, blend, bright };
    return geo;
  };
  // A picture washed in `tint`, edged with a crisp `outline` (its silhouette in that colour, stamped round it `px`
  // pixels out), padded so the outline fits, mirrored when asked.
  const outlined = (image, { tint = null, outline = null, px = 3, mirror = false, bright = 0.35 }) => {
    const w = image.naturalWidth, h = image.naturalHeight, pad = outline ? px + 1 : 1;
    const canvas = canvasOf(w + pad * 2, h + pad * 2), g = canvas.getContext("2d");
    if (mirror) { g.translate(canvas.width, 0); g.scale(-1, 1); }
    if (outline) {
      const edge = washed(image, outline);
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * Math.PI * 2;
        g.drawImage(edge, pad + Math.cos(a) * px, pad + Math.sin(a) * px);
      }
    }
    g.drawImage(washed(image, tint), pad, pad);
    return spriteOf(canvas, h, pad, bright);
  };
  // A picture with the lab's soft coloured glow round it (its shadow blur, `blur` px for a picture the lab drew `lab`
  // units tall), blended, so the glow fades smoothly as the lab's did.
  const glowing = (image, { glow, blur, lab = 64, bright = 0.3, mirror = false }) => {
    const w = image.naturalWidth, h = image.naturalHeight, px = blur * h / lab, pad = Math.ceil(px * 1.3 + 2);
    const canvas = canvasOf(w + pad * 2, h + pad * 2), g = canvas.getContext("2d");
    if (mirror) { g.translate(canvas.width, 0); g.scale(-1, 1); }
    g.shadowColor = glow; g.shadowBlur = px;
    g.drawImage(image, pad, pad);
    return spriteOf(canvas, h, pad, bright, true, "alpha");
  };

  // ---------- ghosts ----------
  const ghostCache = new Map(), ghostEntry = track(() => ghostCache.clear());
  /**
   * A ghost's sprite: tier (TIERS), view (0..2 plain, 0..4 general), mirrored, mode (MODE). Null until its picture has
   * decoded (`prepare`); the hunt keeps showing what it had.
   */
  const ghost = (tier, view, mirror, mode) => {
    ghostEntry.use();
    const key = tier * 1000 + view * 100 + (mirror ? 10 : 0) + mode;
    let geo = ghostCache.get(key);
    if (geo) return geo;
    const look = LOOKS[tier], name = ART[look.art][view];
    if (!ready(name)) return null;
    let tint = look.tint, outline = look.outline;
    if (mode === MODE.flash) tint = "rgba(255,255,255,0.9)";
    else if (mode === MODE.tagged) { tint = "rgba(150,200,255,0.5)"; outline = null; }
    else if (mode === MODE.iced) outline = "rgb(120,215,255)";
    geo = outlined(sources[name], { tint, outline, mirror, bright: mode === MODE.flash ? 0.8 : look.bright });
    ghostCache.set(key, geo);
    return geo;
  };
  /**
   * Which view a ghost shows, the lab's way: from its velocity on screen, `sx` to the right and `sy` toward the camera.
   * A plain ghost shows its front coming, its back going and its side across (`out[0]` view, `out[1]` mirrored); a
   * general or wraith one of eight sectors, held 10 degrees past its edge (`prev`) so it does not flicker.
   */
  const viewOf = (general, sx, sy, prev, out) => {
    if (general) {
      const a = Math.atan2(sy, sx) * 180 / Math.PI;
      let sector = ((Math.round(a / 45) % 8) + 8) % 8;
      if (prev >= 0 && Math.abs(((a - prev * 45 + 540) % 360) - 180) < 32.5) sector = prev;
      out[0] = GENERAL_VIEWS[sector][0]; out[1] = GENERAL_VIEWS[sector][1]; out[2] = sector;
      return out;
    }
    if (Math.abs(sy) > Math.abs(sx) * 1.2) { out[0] = sy > 0 ? 0 : 1; out[1] = false; }
    else { out[0] = 2; out[1] = sx > 0; }
    out[2] = -1;
    return out;
  };

  // ---------- drops ----------
  // In BL.ghostSim.DROP's order: bomb, shield, ice, health, double. `mist` the colours of the light round each (the
  // lab's MIST: light, mid, dark); `h` its height; `hover` the drops that float.
  const DROPS = [
    { art: null, h: 0.62, mist: [[255, 235, 190], [255, 175, 70], [220, 120, 30]], hover: true },
    { art: "shield", h: 1.0, mist: [[255, 225, 225], [255, 110, 110], [225, 50, 50]], hover: false, glow: "rgba(255,110,110,0.65)", blur: 14 },
    { art: "ice", h: 0.86, mist: [[215, 245, 255], [130, 200, 255], [90, 170, 255]], hover: false, glow: "rgba(140,215,255,0.7)", blur: 14 },
    { art: "health", h: 0.72, mist: [[255, 220, 170], [255, 130, 20], [235, 90, 0]], hover: true, glow: "rgba(255,140,30,0.8)", blur: 16 },
    { art: "double", h: 0.78, mist: [[200, 255, 200], [60, 230, 90], [20, 170, 50]], hover: false, glow: "rgba(60,230,90,0.8)", blur: 16 },
    // Tess herself is the drop (the hub's guide, lent to the hunt); only her light is drawn here.
    { art: null, tess: true, h: 0.9, mist: [[255, 244, 214], [255, 190, 80], [230, 140, 40]], hover: true },
    // The lightning: a white bolt spinning over the banana pile in a blue beam (`lightningBolt`), no picture.
    { art: null, lightning: true, h: 1.8, mist: [[225, 240, 255], [110, 180, 255], [60, 130, 255]], hover: true },
    // The lab's monkey sidearm, standing armed, in its purple light.
    { art: "monkeyFront", h: 0.85, mist: [[235, 215, 255], [170, 90, 255], [110, 40, 200]], hover: false, glow: "rgba(190,110,255,0.85)", blur: 16 }
  ];
  // The lab's black cannonball with its lit fuse, drawn once.
  const bombCanvas = () => {
    const r = 48, canvas = canvasOf(r * 2.6, r * 3.6), g = canvas.getContext("2d"), cx = r * 1.15, cy = canvas.height - r * 1.05;
    const ball = g.createRadialGradient(cx - r * 0.35, cy - r * 0.3, r * 0.1, cx, cy, r * 1.05);
    ball.addColorStop(0, "#5a5a60"); ball.addColorStop(0.5, "#1c1c20"); ball.addColorStop(1, "#050506");
    g.fillStyle = ball;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 2; g.stroke();
    g.strokeStyle = "#8a6236"; g.lineWidth = r * 0.16; g.lineCap = "round";
    g.beginPath(); g.moveTo(cx + r * 0.15, cy - r * 0.9); g.quadraticCurveTo(cx + r * 0.55, cy - r * 1.5, cx + r * 0.85, cy - r * 1.25); g.stroke();
    g.fillStyle = "rgba(255,220,90,0.95)";
    g.beginPath(); g.arc(cx + r * 0.85, cy - r * 1.25, r * 0.24, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#ffffff";
    g.beginPath(); g.arc(cx + r * 0.85, cy - r * 1.25, r * 0.09, 0, Math.PI * 2); g.fill();
    return canvas;
  };
  const dropCache = [], dropEntry = track(() => { dropCache.length = 0; });
  /** A drop's sprite, one unit tall (the hunt scales it by `DROPS[kind].h`); null until its picture has decoded. */
  const drop = (kind) => {
    dropEntry.use();
    if (dropCache[kind]) return dropCache[kind];
    const d = DROPS[kind];
    if (d.tess || d.lightning) return null;
    if (!d.art) {
      const canvas = bombCanvas();
      return dropCache[kind] = spriteOf(canvas, canvas.height, 0, 0.1, true, "alpha");
    }
    if (!ready(d.art)) return null;
    return dropCache[kind] = glowing(sources[d.art], { glow: d.glow, blur: d.blur });
  };

  // The elixir hung on each totem: EntropyLab's logo in a soft orange glow, as a drop is drawn. Null until decoded.
  let elixirGeo = null;
  const elixirEntry = track(() => { elixirGeo = null; });
  const elixir = () => {
    elixirEntry.use();
    if (elixirGeo || !ready("elixir")) return elixirGeo;
    return elixirGeo = glowing(sources.elixir, { glow: "rgba(255,140,30,0.85)", blur: 16 });
  };
  /** A decoded picture by name, for the overlay to draw (the elixir by the health bar); null until it has decoded. */
  const picture = (name) => sources[name] || null;

  // ---------- light: the lab's gradients as sprites, one per colour ----------
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const lightCache = new Map(), lightEntry = track(() => lightCache.clear());
  const light = (key, paint, size, centred, bright = 0.9, blend = bright > 0 ? "add" : "alpha") => {
    lightEntry.use();
    let geo = lightCache.get(key);
    if (geo) return geo;
    const [w, h] = size, canvas = canvasOf(w, h);
    paint(canvas.getContext("2d"), w, h);
    geo = spriteOf(canvas, h, centred ? h / 2 : 0, bright, true, blend);
    lightCache.set(key, geo);
    return geo;
  };
  /** A soft disc of light, one unit across, centred: the halo, the aura, the flash at a power-up's feet, mist. */
  const glowDisc = (c) => light(`disc${c}`, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, rgba(c, 0.9)); grad.addColorStop(0.45, rgba(c, 0.45)); grad.addColorStop(1, rgba(c, 0));
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  }, [128, 128], true);
  /** A ring one unit across, centred: the pulse round a landed drop and a power-up's shockwave. */
  const ringOf = (c) => light(`ring${c}`, (g, w) => {
    g.strokeStyle = rgba(c, 1); g.lineWidth = w * 0.045;
    g.beginPath(); g.arc(w / 2, w / 2, w * 0.45, 0, Math.PI * 2); g.stroke();
  }, [192, 192], true);
  /** A beam one unit tall standing on its foot, brightest at the middle; `fade` dims it toward the top. */
  const beamOf = (core, mid, edge, fade) => light(`beam${core}${mid}${edge}${fade}`, (g, w, h) => {
    const across = g.createLinearGradient(0, 0, w, 0);
    across.addColorStop(0, rgba(edge, 0)); across.addColorStop(0.35, rgba(mid, 0.55)); across.addColorStop(0.5, rgba(core, 0.95));
    across.addColorStop(0.65, rgba(mid, 0.55)); across.addColorStop(1, rgba(edge, 0));
    g.fillStyle = across; g.fillRect(0, 0, w, h);
    if (!fade) return;
    const up = g.createLinearGradient(0, h, 0, 0);
    up.addColorStop(0, "rgba(0,0,0,1)"); up.addColorStop(1, "rgba(0,0,0,0)");
    g.globalCompositeOperation = "destination-in"; g.fillStyle = up; g.fillRect(0, 0, w, h);
  }, [64, 256], false);
  /** The scorched ground where a drop struck: dark, one unit across, centred. */
  const scorch = cached(() => light("scorch", (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, "rgba(12,8,6,0.9)"); grad.addColorStop(0.55, "rgba(24,16,12,0.7)"); grad.addColorStop(1, "rgba(24,16,12,0)");
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  }, [128, 128], true, 0));

  // The shield round a player, as the lab drew it: a pale red bubble with a bright rim, one unit tall, centred.
  const bubble = cached(() => light("bubble", (g, w, h) => {
    const cx = w / 2, cy = h / 2, rx = w / 2 - 3, ry = h / 2 - 3;
    const grad = g.createRadialGradient(cx - rx * 0.3, cy - ry * 0.35, rx * 0.1, cx, cy, rx);
    grad.addColorStop(0, "rgba(255,235,235,0.3)"); grad.addColorStop(0.8, "rgba(255,110,110,0.24)"); grad.addColorStop(1, "rgba(255,70,70,0.85)");
    g.fillStyle = grad;
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(255,170,170,0.95)"; g.lineWidth = 3; g.stroke();
  }, [194, 200], true, 0.35, "alpha"));
  // A forked lightning bolt one unit tall, standing on its foot, a white core in a blue glow; `variant` (0..3) seeds its
  // shape. Light: drawn added onto the sky.
  const bolt = (variant) => light(`bolt${variant}`, (g, w, h) => {
    let seed = 1 + variant * 7919;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const branch = (x, y, length, spread, width) => {
      const pts = [x, y];
      let px = x, py = y;
      const steps = Math.max(4, Math.round(length / 22));
      for (let i = 0; i < steps; i++) { px += (rand() - 0.5) * spread; py += length / steps; pts.push(px, py); }
      for (const [colour, lw] of [["rgba(120,170,255,0.35)", width * 5], ["rgba(170,205,255,0.7)", width * 2.2], ["rgba(255,255,255,1)", width]]) {
        g.strokeStyle = colour; g.lineWidth = lw; g.lineJoin = "round"; g.lineCap = "round";
        g.beginPath(); g.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
        g.stroke();
      }
      return pts;
    };
    const trunk = branch(w / 2, 0, h, w * 0.32, 3.2);
    for (let k = 0; k < 3; k++) {
      const at = 2 + 2 * Math.floor(rand() * (trunk.length / 2 - 3));
      branch(trunk[at], trunk[at + 1], h * (0.15 + rand() * 0.2), w * 0.4, 1.6);
    }
  }, [96, 512], false, 1.2);

  // ---------- the rest ----------
  // A jack-o'-lantern one unit across (radius 1 at its waist), centred, its carved face lit toward +z: a ribbed lathe
  // of orange skin with a stem, the eyes, nose and gap-toothed grin following its curve.
  const pumpkin = cached(() => {
    const geo = geometry(), segments = 16, skin = hexToRgb("#e8701a"), shade = hexToRgb("#b8520f"), lit = hexToRgb("#ffcc33");
    const PROFILE = [[0.08, -0.84], [0.55, -0.76], [0.9, -0.45], [1, 0], [0.92, 0.4], [0.62, 0.7], [0.16, 0.8]];
    const rib = (a) => 0.92 + 0.08 * Math.abs(Math.cos(a * 4));
    const rings = PROFILE.map(([r, y]) => {
      const ids = [];
      for (let k = 0; k < segments; k++) {
        const a = k / segments * Math.PI * 2, rr = r * rib(a);
        ids.push(pushVert(geo, Math.cos(a) * rr, y, Math.sin(a) * rr));
      }
      return ids;
    });
    for (let p = 0; p < rings.length - 1; p++) for (let k = 0; k < segments; k++) {
      const k2 = (k + 1) % segments;
      face(geo, [rings[p][k], rings[p + 1][k], rings[p + 1][k2], rings[p][k2]], k % 2 ? shade : skin, { emissive: 0.22 });
    }
    // The carving: each point laid just proud of the skin in front of it.
    const radiusAt = (y) => {
      for (let i = 0; i < PROFILE.length - 1; i++) {
        const [r0, y0] = PROFILE[i], [r1, y1] = PROFILE[i + 1];
        if (y <= y1) return r0 + (r1 - r0) * Math.max(0, (y - y0) / (y1 - y0));
      }
      return 0.16;
    };
    const carve = (points) => {
      const ids = [];
      for (let i = 0; i < points.length; i += 2) {
        const x = points[i], y = points[i + 1], r = radiusAt(y) * 0.92;
        ids.push(pushVert(geo, x, y, Math.sqrt(Math.max(0, r * r - x * x)) + 0.03));
      }
      face(geo, ids, lit, { emissive: 1 });
    };
    carve([-0.46, 0.12, -0.14, 0.12, -0.3, 0.4]);
    carve([0.14, 0.12, 0.46, 0.12, 0.3, 0.4]);
    carve([-0.08, -0.06, 0.08, -0.06, 0, 0.08]);
    const grin = (x) => -0.44 + 0.3 * x * x;
    for (const [x0, x1] of [[-0.58, -0.36], [-0.29, -0.06], [0.06, 0.29], [0.36, 0.58]]) carve([x0, grin(x0), x1, grin(x1), x1, grin(x1) + 0.17, x0, grin(x0) + 0.17]);
    const out = merge(geo, box({ w: 0.14, h: 0.28, d: 0.14, color: "#4f4220", offset: { y: 0.9 } }));
    out.castShadow = false;
    return out;
  });
  // A ghost wall: a sheet of black, ragged at the crest and dripping at the foot, `width` across and `height` tall,
  // standing on y 0 and centred on x 0, its two faces along ±z, a lit jack-o'-lantern on its front (+z, the meadow side).
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const wall = variants((key) => {
    const width = Math.floor(key / 100) / 10, height = key % 100 / 10, geo = geometry();
    const cols = Math.max(6, Math.round(width / 0.4)), rows = 6;
    const bottom = hexToRgb("#0b0a0d"), top = hexToRgb("#1b1820");
    const grid = [];
    for (let j = 0; j <= rows; j++) {
      const row = [];
      for (let i = 0; i <= cols; i++) {
        const u = i / cols, x = (u - 0.5) * width;
        let y = j / rows * height;
        if (j === rows) y += 0.22 * Math.sin(i * 1.7) + 0.12 * Math.sin(i * 3.1 + 1);
        if (j === 0) y -= 0.12 * Math.max(0, Math.sin(i * 2.3 + 0.4));
        const z = 0.07 * Math.sin(x * 2.1 + y * 1.3);
        row.push(x, y, z);
      }
      grid.push(row);
    }
    const sides = [];
    for (const side of [1, -1]) {
      const ids = grid.map((row) => {
        const out = [];
        for (let i = 0; i < row.length; i += 3) out.push(pushVert(geo, row[i], row[i + 1], row[i + 2] + side * 0.05));
        return out;
      });
      sides.push(ids);
      for (let j = 0; j < rows; j++) {
        const c = mix(bottom, top, j / (rows - 1));
        for (let i = 0; i < cols; i++) {
          const q = [ids[j][i], ids[j][i + 1], ids[j + 1][i + 1], ids[j + 1][i]];
          face(geo, side > 0 ? q : q.reverse(), c, { emissive: 0.03 });
        }
      }
    }
    const crest = hexToRgb("#26222c"), front = sides[0][rows], back = sides[1][rows];
    for (let i = 0; i < cols; i++) face(geo, [front[i], front[i + 1], back[i + 1], back[i]], crest, { emissive: 0.03 });
    const size = Math.min(0.62, height * 0.19, width * 0.14), lantern = pumpkin(), parts = [geo];
    const moved = { verts: lantern.verts.map((v, i) => i % 3 === 0 ? v * size : i % 3 === 1 ? v * size + height * 0.52 : v * size + 0.05 + size * 0.55), faces: lantern.faces, lines: [] };
    parts.push(moved);
    const out = merge(...parts);
    out.castShadow = false;
    return out;
  });
  const wallGeometry = (width, height) => wall(Math.round(width * 10) * 100 + Math.round(height * 10));
  // An orb that circles a general (blue, lit), or a wraith or the herald (black, a pale rim).
  const orbs = [
    cached(() => noShadow(lathe({ profile: [[0.01, -0.08], [0.06, -0.06], [0.08, 0], [0.06, 0.06], [0.01, 0.08]], segments: 8, color: "#4f9dff", emissive: 1 }))),
    cached(() => noShadow(merge(
      lathe({ profile: [[0.01, -0.08], [0.06, -0.06], [0.08, 0], [0.06, 0.06], [0.01, 0.08]], segments: 8, color: "#08070c", emissive: 0 }),
      lathe({ profile: [[0.085, -0.012], [0.095, 0], [0.085, 0.012]], segments: 10, color: "#eef2ff", emissive: 0.8 }))))
  ];
  const orb = (dark) => orbs[dark ? 1 : 0]();
  // A unit beam: one metre along +z from the origin, its core inside a wider glow.
  const beam = cached(() => noShadow(merge(
    box({ w: 0.05, h: 0.05, d: 1, color: "#ffffff", emissive: 1, offset: { z: 0.5 } }),
    box({ w: 0.14, h: 0.14, d: 1, color: "#5aa8ff", emissive: 1, offset: { z: 0.5 } }))));
  // Tess's zap: her working beam's white-hot core in amber.
  const zap = cached(() => noShadow(merge(
    box({ w: 0.05, h: 0.05, d: 1, color: "#fffbe8", emissive: 1, offset: { z: 0.5 } }),
    box({ w: 0.15, h: 0.15, d: 1, color: "#ffb347", emissive: 1, offset: { z: 0.5 } }))));
  const soul = cached(() => noShadow(merge(
    box({ w: 0.08, h: 0.08, d: 1, color: "#c9a8ff", emissive: 0.9, offset: { z: 0.5 } }),
    box({ w: 0.2, h: 0.2, d: 1, color: "#1a0b26", emissive: 0.15, offset: { z: 0.5 } }))));
  // What the hunters' rifles fire through the night in place of bananas: a lumpy off-white rock about a hand across.
  const rock = cached(() => noShadow(merge(
    lathe({ profile: [[0.02, -0.11], [0.12, -0.07], [0.145, 0.0], [0.1, 0.085], [0.03, 0.12]], segments: 5, color: "#fffaf0", emissive: 0.6 }),
    box({ w: 0.12, h: 0.1, d: 0.1, color: "#f2ecdf", emissive: 0.55, offset: { x: 0.09, y: 0.04, z: 0.03 } }),
    box({ w: 0.09, h: 0.08, d: 0.11, color: "#ffffff", emissive: 0.65, offset: { x: -0.07, y: -0.05, z: -0.05 } }))));
  // What the monkeys fire: a burst of orange laser, a white-hot core in an orange glow, one unit long along z, centred.
  const laserBurst = cached(() => noShadow(merge(
    box({ w: 0.035, h: 0.035, d: 1, color: "#fff4d6", emissive: 1 }),
    box({ w: 0.1, h: 0.1, d: 0.92, color: "#ff7a14", emissive: 1 }))));
  // The lightning drop: a white-hot zigzag bolt, one unit tall and centred, its two halves convex prisms.
  const lightningBolt = cached(() => noShadow(merge(
    prism([[-0.14, 0.06], [0.08, 0.06], [0.3, 0.5], [0.06, 0.5]], 0.12, "#ffffff", 1),
    prism([[-0.24, 0.12], [-0.12, -0.5], [0.22, 0.12]], 0.12, "#ffffff", 1))));
  // The lab's monkey sidearm at a player's side: from the front, the side (its picture faces left; mirrored for right)
  // or behind, a plain hard-edged picture; one unit tall, null until its picture has decoded.
  const MONKEY_VIEWS = ["monkeyFront", "monkeySide", "monkeyBack"];
  const monkeyCache = new Map(), monkeyEntry = track(() => monkeyCache.clear());
  const monkey = (view, mirror) => {
    monkeyEntry.use();
    const key = view * 2 + (mirror ? 1 : 0);
    let geo = monkeyCache.get(key);
    if (geo) return geo;
    if (!ready(MONKEY_VIEWS[view])) return null;
    geo = outlined(sources[MONKEY_VIEWS[view]], { mirror });
    monkeyCache.set(key, geo);
    return geo;
  };
  // A grave for a player gone down: a rounded grey headstone with a cross cut in its face, on a mound of fresh earth;
  // the hunt sets the player's own head on its top. It stands on y 0, its face toward +z, `GRAVE_TOP` tall.
  // A skeleton, the hunt's crawler: only its upper body, dragging a broken spine behind it, bones turned round and
  // shaded smooth, a little lit so the hunt's night shows them, green fire deep in the skull's sockets. Each part hangs
  // from its own pivot for the hunt's rig, facing +z: the chest's spine runs along +z on y 0 (its ribs below it) from the
  // tail's root to the neck; the tail trails back along -z; the skull sits on the neck with its jaw hinged under it; an
  // upper arm reaches down -y 0.3 m from its shoulder ball to the elbow, and the forearm 0.27 m on to the wrist, its
  // fingers curling forward to their claws about 0.37 m down.
  const BONE = "#e8dfc6", JOINT = "#b8aa86", TOOTH = "#f6f0de", SOCKET = "#120c08", EYE = "#3dff6a", GLOW = 0.22;
  // A long bone, knobbed at both ends, `L` along +y from its foot; a ball; a vertebra's disc lying across +y.
  const longBone = (L, r, color = BONE) => turn([[0, 0], [r * 1.7, L * 0.03], [r * 1.9, L * 0.1], [r, L * 0.22], [r * 0.85, L * 0.5], [r, L * 0.78], [r * 1.9, L * 0.9], [r * 1.7, L * 0.97], [0, L]], 10, color, GLOW);
  const ball = (r, color = JOINT, emissive = GLOW) => turn(Array.from({ length: 9 }, (_, k) => [r * Math.sin(Math.PI * k / 8), -r * Math.cos(Math.PI * k / 8)]), 10, color, emissive);
  const disc = (r, h, color = BONE) => turn([[0, -h], [r * 0.85, -h], [r, -h * 0.4], [r, h * 0.4], [r * 0.85, h], [0, h]], 10, color, GLOW);
  // A bone from (ax, ay, az) to (bx, by, bz).
  const span = (ax, ay, az, bx, by, bz, r, color) => along(longBone(Math.hypot(bx - ax, by - ay, bz - az), r, color), ax, ay, az, bx - ax, by - ay, bz - az);
  const rib = (side, z, w, h) => tube({ path: (t) => { const a = t * Math.PI * 0.94; return { x: side * w * Math.sin(a), y: -h * (1 - Math.cos(a)) / 2, z: z + 0.035 * Math.sin(a) }; },
    radius: (t) => 0.012 * (1 - 0.35 * t), rings: 12, segments: 6, colorFn: () => BONE, emissive: GLOW });
  const skeletonParts = cached(() => {
    const chest = [], flat = [];
    for (let i = 0; i < 10; i++) {
      const z = -0.1 + i * 0.062;
      chest.push(along(disc(0.03, 0.016), 0, 0, z, 0, 0, 1), span(0, 0.01, z - 0.01, 0, 0.055, z - 0.04, 0.008, JOINT));
    }
    for (let i = 0; i < 6; i++) {
      const k = Math.sin(Math.PI * (i + 0.8) / 6.6), z = 0.06 + i * 0.065, w = 0.1 + 0.07 * k, h = 0.19 + 0.07 * k;
      chest.push(rib(1, z, w, h), rib(-1, z, w, h));
    }
    chest.push(span(0, -0.25, 0.2, 0, -0.22, 0.45, 0.014),
      span(0.02, -0.21, 0.45, 0.17, -0.04, 0.38, 0.01), span(-0.02, -0.21, 0.45, -0.17, -0.04, 0.38, 0.01),
      along(disc(0.075, 0.006, JOINT), 0.11, 0.02, 0.3, 0.6, 1, 0), along(disc(0.075, 0.006, JOINT), -0.11, 0.02, 0.3, -0.6, 1, 0));
    const tail = [];
    for (let i = 0; i < 8; i++) {
      const k = 1 - i * 0.07, z = -0.04 - i * 0.058;
      tail.push(along(disc(0.028 * k, 0.015 * k), 0, -0.004 * i, z, 0, 0, 1), span(0, 0.01 - 0.004 * i, z, 0, 0.045 * k - 0.004 * i, z - 0.03, 0.007 * k, JOINT));
    }
    // What is left of the pelvis: a broken wing of hip bone and the sacrum, dragged along.
    tail.push(along(disc(0.09, 0.008, JOINT), 0.05, -0.04, -0.52, 0.8, 0.4, -0.3), span(0, -0.03, -0.48, 0, -0.06, -0.6, 0.02));
    // The skull: a rounded cranium, the face below it reaching forward, cheekbones, sockets with embers in them, the nose.
    const skull = [moved(turn([[0, 0], [0.07, 0.01], [0.1, 0.04], [0.115, 0.09], [0.105, 0.14], [0.075, 0.18], [0, 0.2]], 14, BONE, GLOW), 0, 0, -0.01),
      along(turn([[0, 0], [0.06, 0.01], [0.072, 0.05], [0.058, 0.09], [0, 0.105]], 12, BONE, GLOW), 0, 0.06, 0.03, 0, -0.35, 1),
      span(0.08, 0.08, 0.05, 0.055, 0.06, 0.11, 0.009, JOINT), span(-0.08, 0.08, 0.05, -0.055, 0.06, 0.11, 0.009, JOINT),
      along(disc(0.033, 0.008, SOCKET), 0.045, 0.11, 0.093, 0.35, 0, 1), along(disc(0.033, 0.008, SOCKET), -0.045, 0.11, 0.093, -0.35, 0, 1),
      moved(ball(0.019, EYE, 1), 0.045, 0.11, 0.098), moved(ball(0.019, EYE, 1), -0.045, 0.11, 0.098),
      along(disc(0.016, 0.006, SOCKET), 0, 0.075, 0.126, 0, -0.2, 1)];
    for (let i = 0; i < 6; i++) { const a = (i - 2.5) / 2.5 * 0.8; flat.push(box({ w: 0.013, h: 0.022, d: 0.012, color: TOOTH, emissive: GLOW, offset: { x: Math.sin(a) * 0.05, y: 0.025, z: 0.065 + Math.cos(a) * 0.06 } })); }
    // The jaw, hinged at its back corners: a U of bone with its teeth along the front, and the two posts up to the hinge.
    const jaw = [tube({ path: (t) => { const a = Math.PI * t; return { x: 0.065 * Math.cos(a), y: -0.02 - 0.015 * Math.sin(a), z: 0.02 + 0.085 * Math.sin(a) }; },
      radius: () => 0.013, rings: 14, segments: 6, colorFn: () => BONE, emissive: GLOW }),
      span(0.065, -0.02, 0.02, 0.07, 0.02, -0.005, 0.01, JOINT), span(-0.065, -0.02, 0.02, -0.07, 0.02, -0.005, 0.01, JOINT)];
    const jawFlat = [];
    for (let i = 0; i < 6; i++) { const a = (i - 2.5) / 2.5 * 0.8; jawFlat.push(box({ w: 0.012, h: 0.02, d: 0.011, color: TOOTH, emissive: GLOW, offset: { x: Math.sin(a) * 0.05, y: -0.002, z: 0.035 + Math.cos(a) * 0.06 } })); }
    const upper = [ball(0.032), along(longBone(0.3, 0.017), 0, 0, 0, 0, -1, 0)];
    const fore = [ball(0.026), span(0.012, 0, 0, 0.01, -0.27, 0.005, 0.011), span(-0.012, 0, 0, -0.008, -0.27, 0, 0.009), moved(ball(0.028, JOINT), 0, -0.285, 0.005)];
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.02;
      fore.push(span(x * 0.8, -0.29, 0.01, x * 1.2, -0.325, 0.05, 0.006), span(x * 1.2, -0.325, 0.05, x * 1.35, -0.355, 0.095, 0.005),
        along(turn([[0, 0], [0.006, 0.004], [0, 0.03]], 6, JOINT, GLOW), x * 1.35, -0.355, 0.095, 0, -0.5, 1));
    }
    return { chest: shaded(chest), tail: shaded(tail), skull: shaded(skull, flat), jaw: shaded(jaw, jawFlat), upper: shaded(upper), fore: shaded(fore) };
  });
  const GRAVE_TOP = 1.05;
  const gravestone = cached(() => {
    const arch = [];
    for (let k = 0; k <= 8; k++) { const a = Math.PI * k / 8; arch.push([Math.cos(a) * 0.36, 0.72 + Math.sin(a) * 0.33]); }
    // Its outline counter-clockwise from the front: the foot, then the arch from right over to left.
    const slab = prism([[-0.36, 0], [0.36, 0], ...arch], 0.16, "#8b9098");
    const out = merge(
      slab,
      box({ w: 0.08, h: 0.46, d: 0.02, color: "#3e4249", offset: { y: 0.6, z: 0.085 } }),
      box({ w: 0.3, h: 0.08, d: 0.02, color: "#3e4249", offset: { y: 0.7, z: 0.085 } }),
      box({ w: 0.86, h: 0.14, d: 0.3, color: "#6d7178", offset: { y: 0.03 } }),
      moved(lathe({ profile: [[0.02, 0], [0.75, 0], [0.6, 0.12], [0.3, 0.2], [0.02, 0.22]], segments: 10, color: "#4a3626" }), 0, -0.04, 0.55));
    out.castShadow = false;
    return out;
  });
  const shockwave = cached(() => noShadow(ring({ r: 1, thickness: 0.05, segments: 40, color: "#7dff9a", emissive: 1 })));

  BL.ghostModels = { TIERS, MODE, DROPS, prepare, ghost, viewOf, drop, glowDisc, ringOf, beamOf, scorch, bolt, bubble, wallGeometry, orb, beam, zap, soul, rock, laserBurst, lightningBolt, monkey, elixir, picture, skeletonParts, gravestone, GRAVE_TOP, shockwave };
})();
