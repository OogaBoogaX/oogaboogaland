// Room 6, the Block Party: a club under a dome of light, one of the large rooms. The radio plays live
// (timechain-party-radio.js), EDM Sessions first; the DJ changes the channel from behind the booth, and in a shared room
// everyone there hears the channel the DJ chose (net.js `sendParty`). The room follows the music rather than running
// flat out: it reads how loud the whole signal and its kick band are against the loudest they have been lately, and
// from that how hard the music is now (`I`), sorted into a calm, a middle and a hard section. The dome, the LED wall
// round the room and the LED floor each have a few looks (`DOME`, `WALLS`, `FLOOR`), and the section says which suit it:
// a quiet part gets soft washes, slow searchlights and the wave on its own; a hard part rings stepping on the beat, the
// spectrum and the floor's rings. A surface changes look only now and then, one surface at a time, and fades into it
// slowly (the floor ring by ring from the middle out); all of them share one pair of colours (`PALETTES`) that changes
// as rarely. The lasers on the walls stay dark until a hard part: a drop into one after a quiet part, or a long hard
// stretch, gives a short show in one or two colours, its looks changing every phrase. Where the music can't be read
// (a stream heard but not analysed, or the radio off) the room plays its own arrangement on the room's clock, so
// everyone sees it alike. A new block on the chain drops the bass: a ring of light falls down the dome, a wave runs out
// across the floor, the lasers strobe white and the sign over the booth says so. The DJ booth stands up on a stage
// across the front with steps up each end; line arrays hang off the walls all the way round between the lasers and
// thump, the mirror ball turns under the crown, and the latest block hangs on the dome.
(() => {
  "use strict";
  const BL = window.BL;
  const RM = BL.timechainRoomModels, CH = BL.timechainCharts, ROOMS = BL.timechainRooms;
  const { face, blank } = RM.helpers;
  const { DEG, TAU } = ROOMS;
  const { hexToRgb } = BL.math;
  const rgbOf = (c) => hexToRgb(c).map((v) => v / 255);
  // The fee bands' colours, low to high, and the drop's warm flash.
  const BANDS = ["#5b3fd0", "#3a7bd5", "#2fbf71", "#e3c33a", "#f7931a", "#e0533d"], FLASH = "#ffd08a", PURPLE = "#9a5cff";
  const FLASH_RGB = rgbOf(FLASH), BAND_RGB = BANDS.map(rgbOf);
  // The pairs of colours the room is lit in, one pair at a time.
  const PALETTES = [["#5b3fd0", "#3a7bd5"], ["#3a7bd5", "#2fbf71"], ["#7b3fe0", "#e0533d"], ["#f7931a", "#e0533d"],
    ["#2b9fd5", "#9a5cff"], ["#5b3fd0", "#f7931a"], ["#2fbf71", "#3ac8d5"], ["#e0533d", "#9a5cff"]].map((p) => p.map(rgbOf));
  const C = {
    booth: "#1a1420", boothTop: "#2a2030", bezel: "#0a0810", metal: "#2a2a2e", vinyl: "#0b0b0b", cab: "#111114", grille: "#1b1b20",
    label: "#ffb04d", ink: "#0b0714", stage: "#16111d", stageTop: "#261d33", rig: "#3a3b42", plate: "#1c1c20", housing: "#16161b", trim: "#0c0c0f",
    glass: "#0a1622", fin: "#26272d", knob: "#2a2a30", horn: "#09090b", chain: "#5c5e66"
  };
  // The floor: LED panels TILE apart round (0, FZ), wall to wall but inside the booth, painted on the floor's own canvas
  // at FLOOR_PX pixels a metre (a panel a black seam round CELLS by CELLS cells of a hash grid), FLOOR_FPS times a
  // second while the music is hard and half that while it is not.
  const FZ = -1, TILE = 0.8, FLOOR_PX = 20, FLOOR_FPS = 24, CELLS = 4;
  // The beat with no music to follow, BAR beats a bar; following the radio, the room's beat eases to its tempo at
  // TEMPO_RATE and its phase at PHASE_RATE a second. A block's drop lasts DROP_TIME, the music's own MUSIC_DROP.
  const BEAT = 60 / 124, BAR = 4, TEMPO_RATE = 3, PHASE_RATE = 6, DROP_TIME = 1.6, MUSIC_DROP = 1.4;
  // How long the DJ's page waits between channel changes in a shared room, ms: over the room's own gap (room.js).
  const PARTY_GAP = 1000;
  // How hard the music is: its loudness and its kick band's, in dB, followed at FAST a second against the loudest of
  // each lately, which falls FALL dB a second; the kick band counts fully within BASS_SPAN dB of its loudest, fading
  // over BASS_WIDTH, the whole within LOUD_SPAN over LOUD_WIDTH, the kick band BASS_SHARE of it. The intensity rises at
  // RISE and sinks at SINK a second.
  const ENERGY = { FAST: 3, FALL: 0.15, BASS_SPAN: 12, BASS_WIDTH: 10, LOUD_SPAN: 6, LOUD_WIDTH: 5, BASS_SHARE: 0.65, RISE: 2.5, SINK: 0.7 };
  // Sections: 0 calm, 1 middle, 2 hard, with hysteresis; a section holds HOLD bars before another but a hard one.
  const SECTION = { CALM_DOWN: 0.35, CALM_UP: 0.45, HARD_UP: 0.72, HARD_DOWN: 0.58, HOLD: 8 };
  // Changes of look: every EVERY bars one surface in turn changes look, the colours every PALETTE bars, each faded in
  // over its own seconds; a new section changes all three, a bar apart, and the colours with them.
  const CHANGE = { EVERY: 16, PALETTE: 48, DOME: 5, WALL: 4, FLOOR: 3.5, COLORS: 6 };
  // The arrangement the room plays where the music can't be read: [seconds, intensity] round ARRANGE_S seconds of the
  // room's clock: a quiet part, a build, a drop and a hard part, a middle and back down.
  const ARRANGE = [[0, 0.22], [28, 0.26], [38, 0.6], [41.9, 0.62], [42, 0.95], [76, 0.9], [80, 0.55], [104, 0.5], [110, 0.24], [128, 0.22]], ARRANGE_S = 128;
  // The lasers: a drop into a hard section after a quiet part within DROP_AFTER seconds starts a show of SHOW_DROP
  // beats; LONG seconds of hard music since the last show starts one of SHOW_PEAK (a visit's first no sooner than FIRST
  // seconds in); a drop within GAP / 2 of the last show starts none. A show ends early with the hard part.
  const LASER = { DROP_AFTER: 24, LONG: 75, GAP: 25, FIRST: 40, SHOW_DROP: 48, SHOW_PEAK: 24 };
  // The sign's height in a drop, and where what is put away waits.
  const SIGN_Y = 5.4, AWAY = -3;
  // The DJ booth, up on the stage: its top (over the stage's) an Ooga can jump up onto, BOOTH_W across. The stage
  // stands H high across the front of the room, W either side of the middle, from FRONT metres in from the wall at
  // the room's middle back to the wall, with STEPS steps up each end, each TREAD deep and STEP_W long, from DOWN
  // metres behind its front edge.
  const BOOTH_TOP = 1.03, BOOTH_W = 7;
  const STAGE = { H: 0.8, W: 7, FRONT: 6, STEPS: 2, TREAD: 0.45, STEP_W: 2.4, DOWN: 0.4 };
  // The dome: its looks repainted DOME_FPS times a second on a canvas DOME_W by DOME_H drawn up smooth; its LED dots a
  // cell a fortieth of a radian round, about one in seven lit, in DOT_GROUPS nodes, sorted DOT_BIAS metres nearer for
  // Canvas 2D; the LED wall WALL_BIAS.
  const DOME_W = 512, DOME_H = 192, DOME_FPS = 24, DOT_GROUPS = 6, DOT_BIAS = -1.5, WALL_BIAS = -0.5;
  // The lasers: an RGB projector's colours; NB beams a projector, each a thin bar BEAM_LEN long stretched to what it
  // meets, with a dot where it lands; a new look every PHRASE beats; the pairs of colours a show may be in.
  const RGB = ["#2bff5a", "#ff2b3a", "#3b5bff", "#2bf2ff", "#ff2bea", "#ffe62b", "#f4f2ff"];
  const GREEN = 0, RED = 1, BLUE = 2, CYAN = 3, MAGENTA = 4, YELLOW = 5, WHITE = 6;
  const SHOW_COLORS = [[GREEN, GREEN], [CYAN, MAGENTA], [RED, RED], [BLUE, CYAN], [GREEN, CYAN], [MAGENTA, BLUE]];
  const NB = 10, PHRASE = 16, BEAM_W = 0.007, BEAM_LEN = 8, LOOKS = 5;
  // The projectors on the walls: a pair at each of BEARINGS (degrees from the doors, mirrored, nearest the booth first),
  // Y up, on a bracket OUT from the wall, tipped TILT down, built SCALE times a projector's BODY (its aperture at
  // APERTURE in its own frame). A show lights one pair at a time, two while the music is at its hardest, the pairs
  // taking turns phrase by phrase; a block's drop lights them all.
  const PROJ = { Y: 4.6, OUT: 0.75, TILT: 0.22, SCALE: 1.6, BEARINGS: [160, 121, 82, 43] };
  const BODY = { w: 0.3, h: 0.17, d: 0.32 }, APERTURE = [0, -0.012, 0.182];
  // The line arrays hung off the walls all the way round, between the projectors, a pair at each bearing: `n` boxes
  // BOX big hung from a bracket HANG_OUT from the wall at HANG_Y, each splayed SPLAY degrees further down than the one
  // above; the mains either side of the stage, fills round the room to the doors.
  const ARRAYS = [{ b: 141, n: 5 }, { b: 101, n: 4 }, { b: 62, n: 4 }, { b: 24, n: 3 }], BOX = { w: 1.15, h: 0.34, d: 0.6 }, HANG_Y = 6.8, HANG_OUT = 0.95, SPLAY = [2, 3, 4, 5, 6];
  // The booth's screen: a canvas W by H wrapped round the booth's face from Y0 to Y1, repainted at most FPS times a
  // second: BARS bars of ROWS segments either side of the name, and a wave.
  const SCREEN = { W: 1024, H: 144, Y0: 0.16, Y1: 0.92, FPS: 60, BARS: 40, ROWS: 14, LOGO_W: 300, LOGO_H: 104, TAG: 4 };
  const MUSIC = { BANDS: 96, WAVE: 512 };
  // The LED wall round the room: a canvas W by H wrapped just inside the wall below the dome (INSET), from Y0 to Y1, all
  // the way round but DOOR either side of the doors; its spectrum's segments SEG pixels, its blocks BLOCKS a side.
  const WALL = { W: 2048, H: 96, INSET: 0.995, Y0: 0.14, Y1: 3.62, DOOR: 2.8, SEG: 4, BLOCKS: 24 };
  // The surfaces' looks, and which suit each section (calm, middle, hard).
  const DOME = { WASH: 0, NIGHT: 1, SWEEP: 2, RINGS: 3, SPIRAL: 4, NAMES: ["wash", "night", "sweep", "rings", "spiral"], FOR: [[0, 1, 2], [0, 2, 3], [3, 4, 2]] };
  const FLOOR = { GLOW: 0, RIPPLES: 1, SWEEP: 2, SPARKS: 3, RINGS: 4, NAMES: ["glow", "ripples", "sweep", "sparks", "rings"], FOR: [[0, 1], [1, 2, 3], [4, 3, 2]] };
  const WALLS = { WAVE: 0, FLOW: 1, BLOCKS: 2, SPECTRUM: 3, NAMES: ["wave", "flow", "blocks", "spectrum"], FOR: [[0, 1], [1, 2, 3], [3, 2]] };
  const polar = (r, b) => ({ x: r * Math.sin(b * DEG), z: r * Math.cos(b * DEG) });
  const boothZ = (L) => -(L.r0 - 2.7);
  const stageZ = (L) => -(L.r0 - STAGE.FRONT);
  // The booth's half angle round the room's middle, in degrees.
  const boothHalf = (L) => Math.asin(BOOTH_W / 2 / (L.r0 - 2.8)) / DEG;
  const ballY = (L) => 0.45 * L.crown;
  const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  const mix = (a, b, f, out) => { out[0] = a[0] + (b[0] - a[0]) * f; out[1] = a[1] + (b[1] - a[1]) * f; out[2] = a[2] + (b[2] - a[2]) * f; return out; };
  const smooth = (f) => f * f * (3 - 2 * f);
  // Circles along an arc round the room's middle (bearings in degrees), close enough that nobody slips between; with a
  // `top`, something to jump up onto and over.
  const arcSolids = (K, r, b0, b1, rad, top) => {
    const n = Math.max(1, Math.ceil(Math.abs(b1 - b0) * DEG * r / (rad * 1.8)));
    for (let i = 0; i <= n; i++) { const p = polar(r, b0 + (b1 - b0) * i / n); K.solid({ x: p.x, z: p.z, r: rad, top }); }
  };
  // A colour round the fee bands' wheel, `t` turns from the lowest band.
  const band = (t, out) => {
    const u = (t - Math.floor(t)) * 6, i = Math.floor(u) % 6, f = u - Math.floor(u), a = BAND_RGB[i], b = BAND_RGB[(i + 1) % 6];
    out[0] = a[0] + (b[0] - a[0]) * f; out[1] = a[1] + (b[1] - a[1]) * f; out[2] = a[2] + (b[2] - a[2]) * f;
    return out;
  };
  const rgbStyle = (c, k = 1) => `rgb(${Math.round(Math.min(1, c[0] * k) * 255)},${Math.round(Math.min(1, c[1] * k) * 255)},${Math.round(Math.min(1, c[2] * k) * 255)})`;
  // What every surface reads of the music each frame, written in place: the time, the beat, its step and its kick, how
  // hard the music is (`I`), the two colours (`a`, `b`), and the looks' own moving phases.
  const moment = () => ({ t: 0, beat: 0, step: 0, kick: 0, I: 0, a: [0, 0, 0], b: [0, 0, 0], spin: 0, rings: 0, sweep: 0, ripple: 0, flow: 0 });

  // ---------- the floor ----------
  // The panels, each with its ring and its bearing and distance from the floor's middle: every one whose corners keep
  // clear of the wall, but those wholly hidden inside the booth.
  const floorTiles = (L) => {
    const zs = stageZ(L), wall = ROOMS.radiusAt(L, 0) - 0.15, h = TILE * 0.475, n = Math.ceil((L.r0 + 1) / TILE), out = [];
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const x = i * TILE, z = FZ + j * TILE;
      if (Math.hypot(Math.abs(x) + h, Math.abs(z) + h) > wall) continue;
      if (z + h <= zs && Math.abs(x) + h <= STAGE.W) continue;
      out.push({ x, z, ring: Math.round(Math.hypot(i, j)), ang: Math.atan2(x, z - FZ), dist: Math.hypot(x, z - FZ) });
    }
    return out;
  };
  // The floor's painter, made once per canvas. `paint(colors, nonce, texture)`: each panel's colour (three numbers, 0
  // to 1 and a little over) written inside its seam, its cells a hash of its place and `nonce`, half lit, a quarter
  // dark and a quarter bright, as far apart as `texture` (0 to 1) says; a panel whose colour, nonce and texture are as
  // last painted is left as it is, and true when any changed. `look(id, out, M)` writes a look's colours; `step(M, dt)`
  // moves what the looks keep (the sparks).
  const floors = new WeakMap();
  const floorOf = (canvas, F, tiles) => {
    let floor = floors.get(canvas);
    if (floor) return floor;
    const ctx = canvas.getContext("2d"), N = F.N, img = ctx.createImageData(N, N), px = new Uint32Array(img.data.buffer), side = Math.round(TILE * F.s);
    const pitch = Math.ceil((side - 1) / CELLS), cell = pitch - 1, n = tiles.length;
    px.fill(0xff070305);
    const at = new Int32Array(n), ring = new Int16Array(n), ang = new Float32Array(n), dist = new Float32Array(n);
    tiles.forEach((t, k) => { at[k] = (Math.round(F.Y(t.z - TILE / 2)) + 1) * N + Math.round(F.X(t.x - TILE / 2)) + 1; ring[k] = t.ring; ang[k] = t.ang; dist[k] = t.dist; });
    const rings = 1 + ring.reduce((m, r) => Math.max(m, r), 0), far = dist.reduce((m, d) => Math.max(m, d), 0);
    const last = new Uint32Array(n), spark = new Float32Array(n), c = [0, 0, 0];
    let lastNonce = -1, lastTex = -1, sparkStep = -1;
    const pack = (r, g, b) => 0xff000000 | Math.min(255, b * 255) << 16 | Math.min(255, g * 255) << 8 | Math.min(255, r * 255);
    const paint = (colors, nonce, texture) => {
      const tex = Math.round(texture * 16) / 16, fresh = nonce !== lastNonce || tex !== lastTex, dk = 1 - 0.84 * tex, gk = 0.6 * (1 - 0.7 * tex), bk = 0.45 * tex;
      lastNonce = nonce; lastTex = tex;
      let changed = false;
      for (let k = 0; k < n; k++) {
        const r = colors[k * 3], g = colors[k * 3 + 1], b = colors[k * 3 + 2], lit = pack(r, g, b);
        if (!fresh && lit === last[k]) continue;
        last[k] = lit; changed = true;
        const m = Math.max(r, g, b), dark = pack(r * dk, g * dk, b * dk), gap = pack(r * gk, g * gk, b * gk);
        const bright = pack(r + (m - r) * bk + m * 0.2 * bk, g + (m - g) * bk + m * 0.2 * bk, b + (m - b) * bk + m * 0.2 * bk);
        let h = Math.imul(k + 1, 0x9e3779b1) ^ Math.imul(nonce + 7, 0x85ebca6b);
        h = Math.imul(h ^ h >>> 15, 0x2c1b3c6d); h ^= h >>> 12;
        for (let y = 0; y < side - 1; y++) {
          const row = at[k] + y * N, cy = (y / pitch) | 0, edgeY = y % pitch === cell;
          for (let x = 0; x < side - 1; x++) {
            if (edgeY || x % pitch === cell) { px[row + x] = gap; continue; }
            const bits = h >>> (((cy * CELLS + ((x / pitch) | 0)) * 2) & 31) & 3;
            px[row + x] = bits === 2 ? dark : bits === 3 ? bright : lit;
          }
        }
      }
      if (changed) ctx.putImageData(img, 0, 0);
      return changed;
    };
    // The sparks: on each beat a few panels light, a hash of the beat, more the harder the music, and fade.
    const step = (M, dt) => {
      const fade = Math.exp(-dt * 2.2);
      for (let k = 0; k < n; k++) spark[k] *= fade;
      if (M.step === sparkStep) return;
      sparkStep = M.step;
      const count = Math.round(n * (0.015 + 0.03 * M.I));
      for (let i = 0; i < count; i++) {
        let h = Math.imul(M.step * 131 + i + 1, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
        spark[(h >>> 0) % n] = 1;
      }
    };
    // The looks: a soft gradient of the two colours turning slowly across the floor; slow ripples out from the middle;
    // a radar's sweep round it with a fading trail; panels sparking on the beat over a dim floor; rings stepping out a
    // ring a beat and pulsing.
    const look = (id, out, M) => {
      const a = M.a, b = M.b;
      for (let k = 0; k < n; k++) {
        let f, g;
        if (id === FLOOR.GLOW) {
          f = 0.5 + 0.5 * Math.sin(ang[k] + M.t * 0.07 + dist[k] * 0.06); g = 0.13 + 0.04 * Math.sin(M.t * 0.5 + dist[k] * 0.1);
        } else if (id === FLOOR.RIPPLES) {
          const w = 0.5 + 0.5 * Math.sin(dist[k] * 0.55 - M.ripple);
          f = dist[k] / far; g = 0.09 + 0.42 * w * w * w * (0.55 + 0.45 * M.I);
        } else if (id === FLOOR.SWEEP) {
          const d = ((M.sweep - ang[k]) % TAU + TAU) % TAU;
          f = Math.min(1, d * 0.6); g = 0.07 + 0.62 * Math.exp(-d * 2.4) * (0.6 + 0.4 * M.I);
        } else if (id === FLOOR.SPARKS) {
          f = spark[k]; g = 0.06 + 0.06 * M.I + 0.75 * spark[k] * (0.6 + 0.4 * M.I);
        } else {
          const s = ((ring[k] - M.step) % 4 + 4) % 4;
          f = s === 0 ? 0 : s === 2 ? 1 : 0.5;
          g = 0.22 + 0.32 * Math.max(0, Math.sin(ring[k] * 1.2 - M.ripple * 2)) + 0.34 * M.kick;
        }
        mix(a, b, f, c);
        out[k * 3] = c[0] * g; out[k * 3 + 1] = c[1] * g; out[k * 3 + 2] = c[2] * g;
      }
    };
    floor = { paint, look, step, n, ring, rings };
    floors.set(canvas, floor);
    return floor;
  };

  // ---------- the dome ----------
  // The dome's looks on its small canvas, each written whole into a buffer from what varies by column (azimuth) and by
  // row (elevation), so a pixel only adds or multiplies the two; two buffers mixed while one look fades into another.
  // Made once per canvas, its buffers kept for every repaint.
  const shows = new WeakMap();
  const showOf = (canvas, D) => {
    let show = shows.get(canvas);
    if (show) return show;
    const ctx = canvas.getContext("2d"), w = D.W, h = D.H, img = ctx.createImageData(w, h), px = img.data, c = [0, 0, 0];
    const az = new Float32Array(w), el = new Float32Array(h), up = new Float32Array(h);
    const cs = new Float32Array(w), sn = new Float32Array(w), colK = new Float32Array(w);
    const rr = new Float32Array(h), rg = new Float32Array(h), rb = new Float32Array(h), br = new Float32Array(h), bg = new Float32Array(h), bb = new Float32Array(h), se = new Float32Array(h), ce = new Float32Array(h);
    const bufs = [new Float32Array(w * h * 3), new Float32Array(w * h * 3)];
    for (let u = 0; u < w; u++) az[u] = ((u + 0.5) / w * 360 - 180) * DEG;
    for (let v = 0; v < h; v++) { el[v] = D.elAt(v + 0.5) * DEG; up[v] = clamp01(el[v] / (Math.PI / 2)); }
    // Each pixel its row's base (br, bg, bb) and its row's lit colour (rr, rg, rb) times its column's factor (colK).
    const fill = (buf, lit) => {
      for (let v = 0, o = 0; v < h; v++) {
        const R = br[v], G = bg[v], B = bb[v], LR = rr[v], LG = rg[v], LB = rb[v];
        for (let u = 0; u < w; u++, o += 3) { const k = lit ? colK[u] : 0; buf[o] = R + LR * k; buf[o + 1] = G + LG * k; buf[o + 2] = B + LB * k; }
      }
    };
    // The looks: soft washes of the two colours drifting round, brightest toward the horizon; a deep night for the dots
    // to twinkle in; two searchlights opposite each other turning slowly round; rings stepping down from the crown on
    // the beat; spirals turning across the rings.
    const render = (look, buf, M) => {
      const a = M.a, b = M.b, I = M.I;
      if (look === DOME.WASH) {
        for (let u = 0; u < w; u++) { cs[u] = Math.cos(az[u] + M.t * 0.04); sn[u] = Math.sin(az[u] + M.t * 0.04); }
        for (let v = 0; v < h; v++) { se[v] = Math.sin(el[v] * 2.4); ce[v] = Math.cos(el[v] * 2.4); const k = 1 - up[v]; rr[v] = (0.06 + 0.3 * k * k) * (0.7 + 0.3 * I); }
        for (let v = 0, o = 0; v < h; v++) {
          const s1 = se[v], c1 = ce[v], g = rr[v];
          for (let u = 0; u < w; u++, o += 3) {
            const f = 0.5 + 0.5 * (sn[u] * c1 + cs[u] * s1);
            buf[o] = (a[0] + (b[0] - a[0]) * f) * g; buf[o + 1] = (a[1] + (b[1] - a[1]) * f) * g; buf[o + 2] = (a[2] + (b[2] - a[2]) * f) * g;
          }
        }
        return;
      }
      for (let v = 0; v < h; v++) { const k = (1 - up[v]) ** 1.5; br[v] = 0.012 + a[0] * 0.07 * k; bg[v] = 0.008 + a[1] * 0.07 * k; bb[v] = 0.03 + a[2] * 0.07 * k; }
      if (look === DOME.NIGHT) { fill(buf, false); return; }
      if (look === DOME.SWEEP) {
        for (let u = 0; u < w; u++) {
          const p = 0.5 + 0.5 * Math.cos(az[u] - M.sweep), q = 1 - p, p2 = p * p, q2 = q * q, p8 = p2 * p2 * p2 * p2, q8 = q2 * q2 * q2 * q2;
          colK[u] = p8 * p8 * p8 + q8 * q8 * q8;
        }
        for (let v = 0; v < h; v++) { mix(a, b, up[v], c); const g = (0.25 + 0.55 * (1 - up[v] * 0.7)) * (0.45 + 0.55 * I); rr[v] = c[0] * g; rg[v] = c[1] * g; rb[v] = c[2] * g; }
        fill(buf, true);
        return;
      }
      if (look === DOME.RINGS) {
        for (let u = 0; u < w; u++) colK[u] = 0.8 + 0.2 * Math.cos(az[u] * 2 + M.spin);
        for (let v = 0; v < h; v++) {
          const s = 0.5 + 0.5 * Math.sin(el[v] * 16 + M.rings), s2 = s * s, g = s2 * s2 * s2 * (0.3 + 0.45 * I + 0.35 * M.kick * I);
          mix(a, b, 0.5 + 0.5 * Math.sin(el[v] * 3 + M.t * 0.1), c); rr[v] = c[0] * g; rg[v] = c[1] * g; rb[v] = c[2] * g;
        }
        fill(buf, true);
        return;
      }
      for (let u = 0; u < w; u++) { const p = az[u] * 6 + M.spin; cs[u] = Math.cos(p); sn[u] = Math.sin(p); colK[u] = 0.5 + 0.5 * Math.sin(az[u] * 2 + M.t * 0.08); }
      for (let v = 0; v < h; v++) {
        se[v] = Math.sin(el[v] * 4); ce[v] = Math.cos(el[v] * 4);
        const s = 0.5 + 0.5 * Math.sin(el[v] * 16 + M.rings), s2 = s * s, g = s2 * s2 * s2 * (0.25 + 0.3 * M.kick * I);
        mix(a, b, up[v], c); rr[v] = c[0] * g; rg[v] = c[1] * g; rb[v] = c[2] * g;
      }
      const gain = 0.45 + 0.3 * I;
      for (let v = 0, o = 0; v < h; v++) {
        const s1 = se[v], c1 = ce[v], R = br[v] + rr[v], G = bg[v] + rg[v], B = bb[v] + rb[v];
        for (let u = 0; u < w; u++, o += 3) {
          const s = 0.5 + 0.5 * (sn[u] * c1 + cs[u] * s1), s2 = s * s, s4 = s2 * s2, k = s4 * s4 * s2 * gain, f = colK[u];
          buf[o] = R + (a[0] + (b[0] - a[0]) * f) * k; buf[o + 1] = G + (a[1] + (b[1] - a[1]) * f) * k; buf[o + 2] = B + (a[2] + (b[2] - a[2]) * f) * k;
        }
      }
    };
    // `from` fading into `to` by `f`, and `warm` of the drop's flash over it all.
    const paint = (from, to, f, M, warm) => {
      const one = f >= 1 || from === to, A = bufs[0], B = bufs[1], g = 1 - f;
      render(to, A, M);
      if (!one) render(from, B, M);
      const wr = FLASH_RGB[0] * warm, wg = FLASH_RGB[1] * warm, wb = FLASH_RGB[2] * warm;
      for (let i = 0, o = 0, end = w * h * 3; i < end; i += 3, o += 4) {
        const r = one ? A[i] : A[i] * f + B[i] * g, gg = one ? A[i + 1] : A[i + 1] * f + B[i + 1] * g, bl = one ? A[i + 2] : A[i + 2] * f + B[i + 2] * g;
        px[o] = (r + wr) * 255; px[o + 1] = (gg + wg) * 255; px[o + 2] = (bl + wb) * 255; px[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    };
    show = { paint };
    shows.set(canvas, show);
    return show;
  };
  // The LED dots as squares just inside the dome, spread evenly over it in DOT_GROUPS meshes: warm, a few in the bands'
  // colours, none under the screen's lower edge or over the latest block.
  const domeDots = (L) => {
    const rand = RM.paintKit.rng(91), groups = Array.from({ length: DOT_GROUPS }, () => blank()), E = 1e-3, DOT = 0.0055 * L.R;
    const at = (az, el) => { const p = ROOMS.onSphere(L, az, el, 0.992); return [p.x, p.y, p.z]; };
    for (let cy = Math.floor(-6 * DEG * 40); cy < 62; cy++) {
      const el = (cy + 0.5) / 40, cols = Math.max(1, Math.round(TAU * 40 * Math.cos(el)));
      for (let cx = 0; cx < cols; cx++) {
        if (rand() < 0.86) continue;
        const az = (cx + 0.5) / cols * TAU - Math.PI, color = rand() < 0.15 ? BANDS[Math.floor(rand() * 6)] : "#ffd999", g = Math.floor(rand() * DOT_GROUPS);
        if (el < ROOMS.edgeEl(L, az) + 1.5 * DEG || Math.abs(az) < 17 * DEG && el > 2.5 * DEG && el < 10.5 * DEG) continue;
        const p = at(az, el), e = at(az + E, el), nn = at(az, el + E);
        const ex = e[0] - p[0], ey = e[1] - p[1], ez = e[2] - p[2], el1 = Math.hypot(ex, ey, ez), nx = nn[0] - p[0], ny = nn[1] - p[1], nz = nn[2] - p[2], nl = Math.hypot(nx, ny, nz);
        const ux = ex / el1 * DOT / 2, uy = ey / el1 * DOT / 2, uz = ez / el1 * DOT / 2, vx = nx / nl * DOT / 2, vy = ny / nl * DOT / 2, vz = nz / nl * DOT / 2;
        face(groups[g], [[p[0] - ux - vx, p[1] - uy - vy, p[2] - uz - vz], [p[0] + ux - vx, p[1] + uy - vy, p[2] + uz - vz], [p[0] + ux + vx, p[1] + uy + vy, p[2] + uz + vz], [p[0] - ux + vx, p[1] - uy + vy, p[2] - uz + vz]],
          color, 1, [-p[0], L.c - p[1], -p[2]]);
      }
    }
    for (const g of groups) g.castShadow = false;
    return groups;
  };

  // ---------- the lasers ----------
  const turned = (rx, ry, x, y, z) => {
    const y1 = y * Math.cos(rx) - z * Math.sin(rx), z1 = y * Math.sin(rx) + z * Math.cos(rx);
    return [x * Math.cos(ry) + z1 * Math.sin(ry), y1, -x * Math.sin(ry) + z1 * Math.cos(ry)];
  };
  // Every projector on the walls: where its body hangs and how it is turned (a node's YXZ turn), its aperture, the way in
  // to the floor's middle from it (`ix`, `iz`) and how far (`D`), its side, its bearing and its pair.
  const rigsOf = (L) => {
    const out = [], r = ROOMS.radiusAt(L, PROJ.Y) - PROJ.OUT;
    PROJ.BEARINGS.forEach((deg, pair) => {
      for (const s of [1, -1]) {
        const b = s * deg * DEG, g = { x: r * Math.sin(b), y: PROJ.Y, z: r * Math.cos(b), rx: PROJ.TILT, ry: b + Math.PI, side: s, pair, bearing: s * deg };
        const a = turned(g.rx, g.ry, APERTURE[0] * PROJ.SCALE, APERTURE[1] * PROJ.SCALE, APERTURE[2] * PROJ.SCALE);
        g.ax = g.x + a[0]; g.ay = g.y + a[1]; g.az = g.z + a[2];
        const dx = -g.ax, dz = FZ - g.az;
        g.D = Math.hypot(dx, dz); g.ix = dx / g.D; g.iz = dz / g.D;
        out.push(g);
      }
    });
    return out;
  };
  // Where every beam points this moment, into `out` (`dir`, three numbers a beam; `on`; `color`), in the look `look`
  // and the show's colours `ca` and `cb`: mirrored fans dipping on the kick; tunnels spinning onto the floor; a pair of
  // beams scanning each fan; a level sheet over the crowd's heads; upright fans swaying side to side; and (-1) a block's
  // drop, wide white fans spinning and strobing. Only the projectors whose pair's bit is set in `pairs` shine. `F` is
  // scratch.
  const aim = (rigs, beat, kick, look, ca, cb, pairs, out, F) => {
    for (let p = 0; p < rigs.length; p++) {
      const g = rigs[p], s = g.side, base = p * NB, D = g.D;
      let tx = g.ax + g.ix * D * 0.6, ty = 2.4, tz = g.az + g.iz * D * 0.6, cone = 0, spread = 0, roll = 0, spin = 0, color = p % 2 ? cb : ca, lit = -1, on = (pairs >> g.pair & 1) === 1;
      if (look === 0) {
        tx = g.ax + g.ix * D * 0.55; tz = g.az + g.iz * D * 0.55; ty = 2.2 + 0.8 * Math.sin(beat * Math.PI / 4) - 0.4 * kick;
        spread = 0.55; roll = s * 0.5 * Math.sin(beat * Math.PI / 8);
      } else if (look === 1) {
        tx = g.ax + g.ix * D * 0.75; tz = g.az + g.iz * D * 0.75; ty = 0;
        cone = 0.07 + 0.025 * kick; spin = (p % 2 ? 1 : -1) * beat * Math.PI / 2;
      } else if (look === 2) {
        spread = 0.8; lit = Math.floor(((beat + p * 0.15) % 1) * NB);
      } else if (look === 3) {
        on = on && p % 2 === 0;
        tx = g.ax + g.ix * D * 1.6; tz = g.az + g.iz * D * 1.6; ty = 2.3 + 0.15 * Math.sin(beat * Math.PI / 4 + p * 0.7);
        spread = 1.0;
      } else if (look === 4) {
        const sway = 4 * Math.sin(beat * Math.PI / 4 + p);
        tx = g.ax + g.ix * D * 0.6 - g.iz * sway; tz = g.az + g.iz * D * 0.6 + g.ix * sway; ty = 3;
        spread = 0.4; roll = Math.PI / 2;
      } else {
        spread = 1.2; roll = beat * Math.PI; ty = 2.2; color = Math.floor(beat) % 2 ? YELLOW : WHITE; on = (beat * 4) % 1 < 0.55;
      }
      let dx = tx - g.ax, dy = ty - g.ay, dz = tz - g.az;
      const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
      const ul = Math.hypot(dz, dx), ux = -dz / ul, uz = dx / ul, vx = -uz * dy, vy = uz * dx - ux * dz, vz = ux * dy;
      F[0] = Math.cos(roll) * ux + Math.sin(roll) * vx; F[1] = Math.sin(roll) * vy; F[2] = Math.cos(roll) * uz + Math.sin(roll) * vz;
      for (let j = 0; j < NB; j++) {
        let x, y, z;
        if (cone) {
          const a = j / NB * TAU + spin, cx = Math.cos(a) * Math.sin(cone), sx = Math.sin(a) * Math.sin(cone), cc = Math.cos(cone);
          x = cc * dx + cx * ux + sx * vx; y = cc * dy + sx * vy; z = cc * dz + cx * uz + sx * vz;
        } else {
          const a = (j / (NB - 1) - 0.5) * spread, c = Math.cos(a), sn = Math.sin(a);
          x = c * dx + sn * F[0]; y = c * dy + sn * F[1]; z = c * dz + sn * F[2];
        }
        const i = base + j, l = Math.hypot(x, y, z);
        out.dir[i * 3] = x / l; out.dir[i * 3 + 1] = y / l; out.dir[i * 3 + 2] = z / l;
        out.on[i] = on && (lit < 0 || j === lit || j === NB - 1 - lit) ? 1 : 0;
        out.color[i] = color;
      }
    }
    return out;
  };
  // How far a beam from (x, y, z) along unit (dx, dy, dz) runs before the floor or the dome.
  const reachOf = (L, x, y, z, dx, dy, dz) => {
    const wy = y - L.c, b = x * dx + wy * dy + z * dz, R = L.R - 0.2;
    let reach = -b + Math.sqrt(Math.max(0, b * b - (x * x + wy * wy + z * z - R * R)));
    if (dy < -1e-4) reach = Math.min(reach, (y - 0.005) / -dy);
    return reach;
  };
  // A laser projector in its own frame, its front +z: a finned housing, its bezel, the output window and aperture, two
  // status lights and the key, a warning label on top and two fans behind.
  const projector = (k) => {
    const { w, h, d } = BODY;
    k.box(w, h, d, C.housing, 0, 0, 0);
    k.box(w + 0.01, h + 0.01, 0.012, C.trim, 0, 0, d / 2 + 0.006);
    k.box(0.13, 0.065, 0.006, C.glass, 0, APERTURE[1], d / 2 + 0.015, { emissive: 0.15 });
    k.box(0.03, 0.03, 0.004, "#ffffff", 0, APERTURE[1], d / 2 + 0.02, { emissive: 1 });
    k.box(0.012, 0.012, 0.004, "#3cff7a", -0.11, 0.05, d / 2 + 0.014, { emissive: 1 });
    k.box(0.012, 0.012, 0.004, "#ffb04d", -0.09, 0.05, d / 2 + 0.014, { emissive: 1 });
    k.cyl(0.011, 0.011, 0.012, C.knob, 0.11, 0.05, d / 2 + 0.018, { rx: Math.PI / 2, seg: 10 });
    for (const s of [-1, 1]) for (let f = 0; f < 7; f++) k.box(0.022, 0.005, d - 0.04, C.fin, s * (w / 2 + 0.011), -h / 2 + 0.02 + f * 0.022, -0.01);
    k.box(0.07, 0.003, 0.05, "#ffcf00", 0.06, h / 2 + 0.0015, 0.09, { emissive: 0.2 });
    for (const fx of [-0.07, 0.07]) {
      k.torus(0.045, 0.006, C.fin, fx, 0, -d / 2 - 0.006, { rx: Math.PI / 2, seg: 16, sides: 4 });
      k.box(0.084, 0.004, 0.004, C.fin, fx, 0, -d / 2 - 0.004);
      k.box(0.004, 0.084, 0.004, C.fin, fx, 0, -d / 2 - 0.004);
    }
  };
  // A projector's wall bracket, in a frame on the wall at the projector's pivot height with +z into the room: a plate
  // bolted to the wall, a braced arm out over the projector, a yoke down to its pivots, and a safety cable.
  const bracket = (K) => {
    const S = PROJ.SCALE, out = PROJ.OUT, top = S * (BODY.h / 2 + 0.17), side = S * (BODY.w / 2 + 0.045);
    K.box(0.3, 0.46, 0.03, C.plate, 0, 0.08, 0.015);
    for (const bx of [-0.1, 0.1]) for (const by of [-0.1, 0.26]) K.cyl(0.014, 0.014, 0.012, C.knob, bx, by, 0.034, { rx: Math.PI / 2, seg: 8 });
    K.box(0.06, 0.06, out, C.rig, 0, top + 0.03, out / 2);
    K.box(0.04, 0.2, 0.04, C.rig, 0, top - 0.06, 0.1, { rx: -0.7 });
    K.box(2 * side + 0.04, 0.03, 0.07, C.housing, 0, top - 0.005, out);
    for (const s of [-1, 1]) {
      K.box(0.022, top - 0.01, 0.07, C.housing, s * side, top / 2, out);
      K.cyl(0.036, 0.036, 0.04, C.knob, s * (side + 0.03), 0, out, { rz: Math.PI / 2, seg: 10 });
    }
    K.box(0.006, 0.006, out * 0.9, C.chain, 0.04, top + 0.075, out * 0.5);
  };

  // ---------- the speakers ----------
  // A speaker's cone round its node's +y, which the node turns out of the box's face: the cone, its dust cap and a lit
  // ring round it that glows on the kick.
  const cone = (rr) => (k) => {
    k.cyl(rr, rr * 0.6, 0.05, "#08080a", 0, -0.025, 0, { seg: 20 });
    k.ball(rr * 0.3, "#34343a", 0, 0, 0, { seg: 10 });
    k.torus(rr * 0.72, 0.008, PURPLE, 0, 0.002, 0, { seg: 20, sides: 4, emissive: 1 });
  };
  // A line array hung off the wall, in a frame at the foot of the wall under it with +z into the room: a braced
  // bracket out from the wall, the bumper on chains under it, and `n` boxes hung below in a curve, each from the bottom
  // back edge of the one above and tipped a little further down, two woofers either side of a horn on each, on nodes of
  // their own (`name`, the box and the side). Returns the woofer's geometry, for the next to share.
  const lineArray = (K, n, name, woofer, tip) => {
    const top = HANG_Y, out = HANG_OUT;
    K.box(0.6, 0.5, 0.03, C.plate, 0, top + 0.45, 0.015);
    for (const sx of [-0.22, 0.22]) {
      K.box(0.06, 0.08, out + 0.15, C.rig, sx, top + 0.6, (out + 0.15) / 2);
      K.box(0.05, 0.05, 0.6, C.rig, sx, top + 0.35, 0.3, { rx: -0.75 });
    }
    K.box(0.56, 0.06, 0.06, C.rig, 0, top + 0.6, out + 0.1);
    for (const sx of [-0.45, 0.45]) K.box(0.012, 0.5, 0.012, C.chain, sx, top + 0.33, out);
    K.box(BOX.w + 0.1, 0.07, BOX.d + 0.08, C.rig, 0, top + 0.06, out);
    let y = top + 0.02, z = out - BOX.d / 2, tilt = 0;
    for (let k = 0; k < n; k++) {
      tilt += SPLAY[k] * DEG;
      const c = Math.cos(tilt), s = Math.sin(tilt), cy = y - (BOX.h / 2) * c - (BOX.d / 2) * s, cz = z - (BOX.h / 2) * s + (BOX.d / 2) * c;
      const g = K.group(0, cy, cz, 0, tilt), front = BOX.d / 2;
      g.box(BOX.w, BOX.h, BOX.d, C.cab, 0, 0, 0);
      g.box(BOX.w - 0.06, BOX.h - 0.05, 0.01, C.grille, 0, 0.005, front + 0.005);
      g.box(0.26, 0.2, 0.02, C.horn, 0, 0.01, front + 0.012);
      g.box(0.02, 0.17, 0.012, "#2a2a30", 0, 0.01, front + 0.024);
      g.box(BOX.w - 0.08, 0.012, 0.012, PURPLE, 0, -BOX.h / 2 + 0.02, front + 0.012, { emissive: 0.7, glow: true });
      for (const sx of [-1, 1]) g.box(0.012, BOX.h * 0.8, 0.012, "#2a2a30", sx * (BOX.w / 2 + 0.006), 0, -0.05);
      for (const sx of [-1, 1]) {
        woofer = g.node(`${name}_${k}_${sx < 0 ? 0 : 1}`, woofer, sx * 0.34, 0.01, front + 0.012, { rx: Math.PI / 2 + tilt, target: k === 1 && sx < 0 ? tip : null }).geometry;
      }
      y -= BOX.h * c; z -= BOX.h * s;
    }
    return woofer;
  };

  // ---------- the booth's screen ----------
  // The screen's face round the booth's inside, `half` radians either side, in the frame of a node standing on its
  // middle with the curve's axis a radius `rs` behind it (the room's middle); seen from the room, its canvas's left on
  // the left.
  const screenGeometry = (rs, half, canvas) => {
    const geo = blank(), n = 24, { Y0, Y1 } = SCREEN, at = (b, y) => [-rs * Math.sin(b), y, rs - rs * Math.cos(b)];
    for (let i = 0; i < n; i++) {
      const b0 = -half + 2 * half * i / n, b1 = b0 + 2 * half / n, bm = (b0 + b1) / 2;
      face(geo, [at(b0, Y0), at(b1, Y0), at(b1, Y1), at(b0, Y1)], [255, 255, 255], 1, [Math.sin(bm), 0, Math.cos(bm)]);
    }
    geo.castShadow = false;
    geo.imageSurface = { canvas, version: 1, rect: [-half * rs, Y0, 2 * half * rs, Y1 - Y0], curve: [rs, 0, 0], tessellated: true };
    return geo;
  };
  // The DJ's screen, made once per canvas: bars of segments either side of the name, coloured up through the fee bands
  // with a peak over each; the wave across it all; the name on its plate swelling a little on the kick; its edges
  // glowing with how hard the music is, all of it warm in a block's drop. `paint(dt, kick, I, boom, bands, wave)` takes
  // the music as the room read it (MUSIC); `channel(name)` shows the station just tuned to for TAG seconds.
  const screens = new WeakMap();
  const screenOf = (canvas) => {
    let screen = screens.get(canvas);
    if (screen) return screen;
    const P = RM.paintKit, { W, H, BARS, ROWS, LOGO_W, LOGO_H } = SCREEN, WAVE = MUSIC.WAVE / 2, ctx = canvas.getContext("2d"), c = [0, 0, 0];
    const back = CH.canvas(W, H), b = back.getContext("2d");
    b.fillStyle = "#06030b"; b.fillRect(0, 0, W, H);
    b.fillStyle = "rgba(154,92,255,0.09)";
    for (let y = 2; y < H; y += 6) for (let x = 2; x < W; x += 6) b.fillRect(x, y, 3, 3);
    const logo = CH.canvas(LOGO_W, LOGO_H), l = logo.getContext("2d"), name = "BLOCK PARTY";
    l.fillStyle = C.ink; P.roundRect(l, 3, 3, LOGO_W - 6, LOGO_H - 6, 16); l.fill();
    l.strokeStyle = PURPLE; l.lineWidth = 4; P.roundRect(l, 3, 3, LOGO_W - 6, LOGO_H - 6, 16); l.stroke();
    P.pix(l, name, LOGO_W / 2, LOGO_H / 2, Math.min(LOGO_H * 0.42, (LOGO_W - 40) / P.pixWidth(name, 1)), C.label);
    const tag = CH.canvas(LOGO_W, LOGO_H), g = tag.getContext("2d");
    let tagged = 0;
    const channel = (station) => {
      g.clearRect(0, 0, LOGO_W, LOGO_H);
      g.fillStyle = C.ink; P.roundRect(g, 3, 3, LOGO_W - 6, LOGO_H - 6, 16); g.fill();
      g.strokeStyle = "#3cc8ff"; g.lineWidth = 4; P.roundRect(g, 3, 3, LOGO_W - 6, LOGO_H - 6, 16); g.stroke();
      P.pix(g, "NOW PLAYING", LOGO_W / 2, LOGO_H * 0.3, LOGO_H * 0.15, "#c9a6ff");
      P.pix(g, station, LOGO_W / 2, LOGO_H * 0.64, Math.min(LOGO_H * 0.3, (LOGO_W - 30) / P.pixWidth(station, 1)), C.label);
      tagged = SCREEN.TAG;
    };
    const rows = [];
    for (let r = 0; r < ROWS; r++) rows.push(rgbStyle(band(r / (ROWS - 1) * 5 / 6, c)));
    const level = new Float32Array(BARS), peak = new Float32Array(BARS);
    const inner = (W - LOGO_W) / 2 - 12, pitch = (inner - 10) / BARS, bw = pitch * 0.68, rowH = (H - 20) / ROWS, segH = rowH * 0.72;
    const paint = (dt, kick, I, boom, bands, wave) => {
      for (let i = 0; i < BARS; i++) {
        let raw = 0;
        for (let k = Math.floor(i * MUSIC.BANDS / BARS), end = Math.max(k + 1, Math.floor((i + 1) * MUSIC.BANDS / BARS)); k < end; k++) if (bands[k] > raw) raw = bands[k];
        level[i] = raw > level[i] ? raw : Math.max(raw, level[i] - dt * 2.2);
        peak[i] = level[i] > peak[i] ? level[i] : Math.max(0, peak[i] - dt * 0.45);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(back, 0, 0);
      for (let r = 0; r < ROWS; r++) {
        const y = H - 10 - (r + 1) * rowH + (rowH - segH);
        ctx.fillStyle = rows[r];
        for (let i = 0; i < BARS; i++) if (level[i] * ROWS > r + 0.35) {
          const x = inner - (i + 1) * pitch + (pitch - bw) / 2;
          ctx.fillRect(x, y, bw, segH); ctx.fillRect(W - x - bw, y, bw, segH);
        }
      }
      ctx.fillStyle = "#f4f2ff";
      for (let i = 0; i < BARS; i++) {
        const r = Math.min(ROWS - 1, Math.floor(peak[i] * ROWS));
        if (r < 1) continue;
        const x = inner - (i + 1) * pitch + (pitch - bw) / 2, y = H - 10 - (r + 1) * rowH + (rowH - segH);
        ctx.fillRect(x, y, bw, 2.5); ctx.fillRect(W - x - bw, y, bw, 2.5);
      }
      ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = "rgba(60,200,255,0.7)"; ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < WAVE; i++) {
        const x = i / (WAVE - 1) * W, y = H / 2 - Math.max(-1, Math.min(1, wave[i * 2])) * H * 0.42;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      const s = 1 + 0.04 * kick * I, lw = LOGO_W * s, lh = LOGO_H * s;
      tagged = Math.max(0, tagged - dt);
      ctx.drawImage(tagged > 0 ? tag : logo, (W - lw) / 2, (H - lh) / 2, lw, lh);
      ctx.fillStyle = PURPLE; ctx.globalAlpha = 0.25 + 0.45 * kick * I;
      ctx.fillRect(0, 0, W, 4); ctx.fillRect(0, H - 4, W, 4);
      if (boom > 0) { ctx.fillStyle = FLASH; ctx.globalAlpha = boom * 0.55; ctx.fillRect(0, 0, W, H); }
      ctx.globalAlpha = 1;
    };
    screen = { paint, channel };
    screens.set(canvas, screen);
    return screen;
  };

  // ---------- the LED wall ----------
  // A band just inside the wall below the dome, from Y0 to Y1, round the room but for the doors, built a metre along +z
  // as the dome's screen is, so a node a metre back maps it by the same curve: its canvas's columns by azimuth (the seam
  // over the doors), its rows by height.
  const wallGeometry = (L, canvas) => {
    const geo = blank(), r = L.R * WALL.INSET, el = (y) => Math.asin((y - L.c) / r), gap = Math.asin(WALL.DOOR / ROOMS.radiusAt(L, WALL.Y0)), cols = 240, rows = 4;
    const at = (az, y) => { const p = ROOMS.onSphere(L, az, el(y), WALL.INSET); return [p.x, p.y, p.z + 1]; };
    for (let k = 0; k < cols; k++) for (let j = 0; j < rows; j++) {
      const a0 = -Math.PI + gap + (TAU - 2 * gap) * k / cols, a1 = -Math.PI + gap + (TAU - 2 * gap) * (k + 1) / cols;
      const y0 = WALL.Y0 + (WALL.Y1 - WALL.Y0) * j / rows, y1 = WALL.Y0 + (WALL.Y1 - WALL.Y0) * (j + 1) / rows, m = ROOMS.onSphere(L, (a0 + a1) / 2, el((y0 + y1) / 2));
      face(geo, [at(a0, y0), at(a1, y0), at(a1, y1), at(a0, y1)], [255, 255, 255], 1, [-m.x, L.c - m.y, -m.z]);
    }
    geo.castShadow = false;
    geo.imageSurface = { canvas, version: 1, rect: [-Math.PI, WALL.Y0, TAU, WALL.Y1 - WALL.Y0], curve: [1, 0, 0], tessellated: true };
    return geo;
  };
  // The wall's painter, made once per canvas, its canvas's middle behind the booth and its ends by the doors: over a dim
  // grid of LED pixels, the look the room asks for faded over the last: the wave alone, glowing; a slow flow of the two
  // colours round the room, as bright as the music is hard; the spectrum in a few wide blocks; or the whole spectrum
  // mirrored round from the booth with its peaks. `colors(a, b)` makes its styles from the room's two colours, so a
  // paint makes none; the room calls it only when the colours have moved enough to see.
  const walls = new WeakMap();
  const wallOf = (canvas) => {
    let wall = walls.get(canvas);
    if (wall) return wall;
    const { W, H, SEG, BLOCKS } = WALL, BARS = MUSIC.BANDS, WAVE = MUSIC.WAVE, ctx = canvas.getContext("2d");
    const back = CH.canvas(W, H), b = back.getContext("2d");
    b.fillStyle = "#06030b"; b.fillRect(0, 0, W, H);
    b.fillStyle = "rgba(154,92,255,0.08)";
    for (let y = 1; y < H; y += 4) for (let x = 1; x < W; x += 4) b.fillRect(x, y, 2, 2);
    const gaps = CH.canvas(W, H), g = gaps.getContext("2d");
    g.fillStyle = "#06030b";
    for (let y = H - 2 - SEG; y > 0; y -= SEG) g.fillRect(0, y, W, 1);
    // The flow: the two colours in turn across a strip the wall's width, darker at its top and foot.
    const flow = CH.canvas(W, H), f = flow.getContext("2d");
    const level = new Float32Array(BARS), peak = new Float32Array(BARS), half = W / 2, pitch = half / BARS, bw = Math.max(2, pitch - 3), top = H - 4;
    let barStyle = "#fff", waveStyle = "#fff", glowStyle = "#fff", shape = null;
    const colors = (a, bb) => {
      const grad = ctx.createLinearGradient(0, H, 0, 0);
      grad.addColorStop(0, rgbStyle(a)); grad.addColorStop(1, rgbStyle(bb, 1.25));
      barStyle = grad; waveStyle = rgbStyle(bb, 1.3); glowStyle = rgbStyle(a, 0.9);
      const across = f.createLinearGradient(0, 0, W, 0);
      for (let i = 0; i <= 4; i++) across.addColorStop(i / 4, rgbStyle(i % 2 ? bb : a, 0.85));
      f.fillStyle = across; f.fillRect(0, 0, W, H);
      const fade = f.createLinearGradient(0, 0, 0, H);
      fade.addColorStop(0, "rgba(6,3,11,0.85)"); fade.addColorStop(0.5, "rgba(6,3,11,0)"); fade.addColorStop(1, "rgba(6,3,11,0.6)");
      f.fillStyle = fade; f.fillRect(0, 0, W, H);
    };
    const drawWave = (alpha, width, style) => {
      ctx.globalAlpha = alpha; ctx.strokeStyle = style; ctx.lineWidth = width;
      ctx.beginPath();
      for (let i = 0; i < WAVE; i++) {
        const x = i / (WAVE - 1) * W, y = H / 2 - Math.max(-1, Math.min(1, shape[i])) * H * 0.4;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    };
    const draw = (look, alpha, M) => {
      if (alpha <= 0.002) return;
      if (look === WALLS.WAVE) {
        ctx.globalCompositeOperation = "lighter";
        drawWave(alpha * 0.25, 7, glowStyle); drawWave(alpha * (0.55 + 0.35 * M.I), 2, waveStyle);
        ctx.globalCompositeOperation = "source-over";
      } else if (look === WALLS.FLOW) {
        const x = -(((M.flow % W) + W) % W);
        ctx.globalAlpha = alpha * (0.3 + 0.55 * M.I);
        ctx.drawImage(flow, x, 0); ctx.drawImage(flow, x + W, 0);
        ctx.globalCompositeOperation = "lighter";
        drawWave(alpha * 0.35, 1.5, waveStyle);
        ctx.globalCompositeOperation = "source-over";
      } else if (look === WALLS.BLOCKS) {
        const per = BARS / BLOCKS, bp = half / BLOCKS, w2 = bp - 10;
        ctx.globalAlpha = alpha; ctx.fillStyle = barStyle;
        for (let i = 0; i < BLOCKS; i++) {
          let m = 0;
          for (let k = i * per; k < (i + 1) * per; k++) if (level[k] > m) m = level[k];
          const hh = Math.round(m * top / 8) * 8;
          if (hh < 8) continue;
          const x = half + i * bp + 5;
          ctx.fillRect(x, H - 2 - hh, w2, hh); ctx.fillRect(W - x - w2, H - 2 - hh, w2, hh);
        }
        ctx.drawImage(gaps, 0, 0);
      } else {
        ctx.globalAlpha = alpha; ctx.fillStyle = barStyle;
        for (let i = 0; i < BARS; i++) {
          const hh = Math.round(level[i] * top);
          if (hh < 2) continue;
          const x = half + i * pitch + (pitch - bw) / 2;
          ctx.fillRect(x, H - 2 - hh, bw, hh); ctx.fillRect(W - x - bw, H - 2 - hh, bw, hh);
        }
        ctx.drawImage(gaps, 0, 0);
        ctx.fillStyle = "#f4f2ff";
        for (let i = 0; i < BARS; i++) {
          const hh = Math.round(peak[i] * top);
          if (hh < 4) continue;
          const x = half + i * pitch + (pitch - bw) / 2;
          ctx.fillRect(x, H - 3 - hh, bw, 2); ctx.fillRect(W - x - bw, H - 3 - hh, bw, 2);
        }
      }
      ctx.globalAlpha = 1;
    };
    // `from` fading into `to` by `fade`, from the music as the room read it (MUSIC), and a block's drop's flash.
    const paint = (dt, from, to, fade, M, boom, bands, wave) => {
      for (let i = 0; i < BARS; i++) {
        level[i] = bands[i] > level[i] ? bands[i] : Math.max(bands[i], level[i] - dt * 2);
        peak[i] = level[i] > peak[i] ? level[i] : Math.max(0, peak[i] - dt * 0.4);
      }
      shape = wave;
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(back, 0, 0);
      if (from !== to && fade < 1) draw(from, 1 - fade, M);
      draw(to, from !== to ? fade : 1, M);
      if (boom > 0) { ctx.fillStyle = FLASH; ctx.globalAlpha = boom * 0.22; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    };
    wall = { paint, colors };
    walls.set(canvas, wall);
    return wall;
  };
  // The music when the radio can't be read: a spectrum and a wave made from the beat and how hard the room's own
  // arrangement is, into `bands` and `wave`.
  const madeUp = (t, kick, I, bands, wave) => {
    for (let i = 0; i < bands.length; i++) {
      const shimmer = (0.5 + 0.5 * Math.sin(t * 7.3 + i * 0.37)) * (0.5 + 0.5 * Math.sin(t * 3.1 - i * 0.15));
      bands[i] = Math.min(1, kick * Math.pow(1 - i / bands.length, 1.4) * 0.95 + 0.3 * shimmer * (0.3 + 0.7 * I));
    }
    for (let i = 0; i < wave.length; i++) wave[i] = (0.55 * Math.sin(i * 0.055 + t * 9) + 0.3 * Math.sin(i * 0.185 - t * 13)) * (0.12 + 0.5 * kick);
  };
  // How hard the room's own arrangement is `s` seconds into it.
  const arranged = (s) => {
    const u = ((s % ARRANGE_S) + ARRANGE_S) % ARRANGE_S;
    for (let i = 1; i < ARRANGE.length; i++) if (u < ARRANGE[i][0]) {
      const [s0, v0] = ARRANGE[i - 1], [s1, v1] = ARRANGE[i];
      return v0 + (v1 - v0) * (u - s0) / (s1 - s0);
    }
    return ARRANGE[ARRANGE.length - 1][1];
  };

  // ---------- the rest ----------
  // The latest block over the booth: its height in the island's letters, who found it and when.
  const paintBlock = (ctx, reader, now, w, h) => {
    const P = RM.paintKit, blocks = reader.value("recent"), b = blocks && blocks[0];
    ctx.fillStyle = C.ink; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = PURPLE; ctx.lineWidth = h * 0.045; P.roundRect(ctx, h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1, h * 0.12); ctx.stroke();
    P.pix(ctx, b ? "LATEST BLOCK" : "THE BASS DROPS ON EVERY BLOCK", w / 2, h * 0.25, h * 0.13, "#c9a6ff");
    if (!b) { P.pix(ctx, reader.status("recent"), w / 2, h * 0.62, h * 0.22, FLASH); return; }
    P.pix(ctx, CH.format.group(b.height), w / 2, h * 0.55, h * 0.34, FLASH);
    const line = `${b.pool || "Unknown pool"} · ${CH.format.ago(now - b.time * 1000)}`;
    ctx.fillStyle = "#e9dcff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    P.fit(ctx, line, w * 0.8, 600, h * 0.13);
    ctx.fillText(line, w / 2, h * 0.83);
  };
  const blockKey = (reader, now) => {
    const blocks = reader.value("recent"), b = blocks && blocks[0];
    return b ? `${b.height}|${b.pool}|${CH.format.ago(now - b.time * 1000)}` : reader.status("recent");
  };
  // A sign in the island's letters, framed, on the room's ink.
  const sign = (text, ink, frame) => (ctx, w, h) => {
    const P = RM.paintKit;
    ctx.fillStyle = C.ink; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = frame; ctx.lineWidth = h * 0.05; ctx.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
    P.pix(ctx, text, w / 2, h * 0.53, Math.min(h * 0.55, w * 0.88 / P.pixWidth(text, 1)), ink);
  };
  // The mirror ball: square facets in greys, a few catching a light, all faintly bright so it sparkles.
  const mirrorBall = (k, r) => {
    const geo = blank(), rand = RM.paintKit.rng(77), rows = 12, cols = 26, GREYS = ["#d8d8e2", "#a8a8b4", "#eeeef4", "#8a8a96", "#c0c0cc"];
    const at = (i, j) => { const lat = -Math.PI / 2 + Math.PI * i / rows, lon = TAU * j / cols; return [r * Math.cos(lat) * Math.cos(lon), r * Math.sin(lat), r * Math.cos(lat) * Math.sin(lon)]; };
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const pts = i === 0 ? [at(0, 0), at(1, j + 1), at(1, j)] : i === rows - 1 ? [at(i, j), at(i, j + 1), at(rows, 0)] : [at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j)];
      let nx = 0, ny = 0, nz = 0;
      for (const p of pts) { nx += p[0]; ny += p[1]; nz += p[2]; }
      const glint = rand() < 0.14, color = glint ? (rand() < 0.5 ? "#ffffff" : BANDS[Math.floor(rand() * 6)]) : GREYS[Math.floor(rand() * GREYS.length)];
      face(geo, pts, color, glint ? 1 : 0.12 + rand() * 0.22, [nx, ny, nz]);
    }
    k.add(geo, 0, 0, 0);
    k.cyl(0.07, 0.09, 0.12, "#4a4a52", 0, r + 0.04, 0);
  };

  // ---------- its door ----------
  // A club's: black leather leaves buttoned in a diamond pattern with a neon strip down the seam and a glowing
  // porthole, neon tubes round the frame, and a string of bulbs round it that chase the beat.
  const door = {
    casing: "#120d18", frame: "#2a1f36", header: "#0b0714", word: "#ff3ce0", strip: PURPLE, chain: false,
    leaf: "#17121c", seam: "#050307", plate: "#0b0714", face: "#ff3ce0", mark: "#0b0714",
    leafFace(side, H) {
      for (let row = 0; row < 11; row++) for (let col = 0; col < 5; col++) {
        const x = -0.6 + col * 0.3 + (row & 1 ? 0.15 : 0), y = 0.35 + row * 0.27;
        if (x < 0.72 && Math.hypot(x, y - 2.35) > 0.28) H.diamond(x, y, 0.025, "#6e5a86", 0.15, 1);
      }
      H.rect(H.inner + side * 0.02, 0.1, H.inner + side * 0.05, 3.1, PURPLE, 1, 2);
      H.disc(0, 2.35, 0.15, "#24123a", 0.5, 16, 1);
      H.ring(0, 2.35, 0.18, 0.03, "#ff3ce0", 0.9, 16, 2);
    }
  };
  const doorTrim = (K, L) => {
    const d = RM.doorway(L), x = d.W + d.F + 0.03, z = d.Z - 0.14;
    for (const sx of [-1, 1]) K.box(0.03, d.D + d.F, 0.03, "#ff3ce0", sx * x, (d.D + d.F) / 2, z, { emissive: 1, glow: true });
    K.box(2 * x, 0.03, 0.03, "#ff3ce0", 0, d.D + d.F, z, { emissive: 1, glow: true });
    RM.doorBulbs(K, L, "#ffd08a", 0.38);
  };

  const plan = (K, L) => {
    doorTrim(K, L);
    const r0 = L.r0, BZ = boothZ(L), tiles = floorTiles(L), M = moment(), ah = boothHalf(L);
    mix(PALETTES[0][0], PALETTES[0][0], 0, M.a); mix(PALETTES[0][1], PALETTES[0][1], 0, M.b); M.I = 0.3;
    K.wallColor("#140e1a");
    K.render({ sky: [0.3, 0.24, 0.42], ground: [0.12, 0.08, 0.16], direct: [0.4, 0.34, 0.5], directStrength: 0.12, ambientFloor: 0.3, bloomStrength: 0.95 });
    K.dome((ctx, D) => showOf(ctx.canvas, D).paint(DOME.WASH, DOME.WASH, 1, M, 0), { w: DOME_W, h: DOME_H, smooth: true });
    domeDots(L).forEach((geo, g) => K.node(`dots${g}`, geo, 0, 0, 0, { glow: true, depthBias: DOT_BIAS }));
    // The LED wall round the room, first painted in its quiet look.
    const wallCanvas = CH.canvas(WALL.W, WALL.H), firstBands = new Float32Array(MUSIC.BANDS), firstWave = new Float32Array(MUSIC.WAVE);
    madeUp(0, 0.3, 0.3, firstBands, firstWave);
    const wallPainter = wallOf(wallCanvas);
    wallPainter.colors(M.a, M.b);
    wallPainter.paint(0.1, WALLS.WAVE, WALLS.WAVE, 1, M, 0, firstBands, firstWave);
    K.node("wall", wallGeometry(L, wallCanvas), 0, 0, -1, { glow: true, depthBias: WALL_BIAS, target: { kind: "booth", tip: "LED wall", radius: 1.5, data: { say: "Block Party · the music round the room" } } });
    // The floor: its LED panels first painted in their quiet look, then repainted as it plays.
    K.floor((ctx, F) => {
      const floor = floorOf(ctx.canvas, F, tiles), colors = new Float32Array(floor.n * 3);
      floor.look(FLOOR.GLOW, colors, M);
      floor.paint(colors, 0, 0.3);
    }, { scale: FLOOR_PX, emissive: 1 });

    // The stage across the front: a deck from its straight front edge back to the wall, a violet strip along its lip
    // and its foot and footlights all along between, which glow with the music, and steps up each end, each nosed in
    // amber. Its top and the steps' are solids' tops, so an Ooga steps up them, or jumps up onto the deck anywhere.
    const H = STAGE.H, W = STAGE.W, zs = stageZ(L), rw = ROOMS.radiusAt(L, 0) - 0.05, back = Math.asin(W / rw) / DEG, deck = [[-W, zs], [W, zs]];
    for (let i = 0; i <= 12; i++) { const p = polar(rw, 180 - back + 2 * back * i / 12); deck.push([p.x, p.z]); }
    K.slab(deck.reverse(), 0, H, C.stage);
    K.slab(deck.map(([x, z]) => [x * 0.999, z + (z > zs - 0.01 ? -0.02 : 0)]), H, H + 0.012, C.stageTop);
    K.node("stageEdge", (k) => {
      k.box(2 * W, 0.035, 0.035, PURPLE, 0, H - 0.02, zs + 0.02, { emissive: 1, glow: true });
      k.box(2 * W, 0.03, 0.03, PURPLE, 0, 0.03, zs + 0.02, { emissive: 1, glow: true });
      for (let x = -W + 0.5; x < W; x += 1) k.box(0.18, 0.06, 0.02, "#ffb04d", x, H * 0.5, zs + 0.012, { emissive: 1, glow: true });
    }, 0, 0, 0, { glow: true });
    K.solid({ x: 0, z: zs - 4, hx: W, hz: 4, top: H, stay: true });
    const sz = zs - STAGE.DOWN - STAGE.STEP_W / 2;
    for (const side of [-1, 1]) for (let s = 1; s <= STAGE.STEPS; s++) {
      const top = H * s / (STAGE.STEPS + 1), x0 = W + (STAGE.STEPS - s) * STAGE.TREAD, x1 = x0 + STAGE.TREAD;
      K.box(x1 - W, top, STAGE.STEP_W, C.stage, side * (W + x1) / 2, top / 2, sz);
      K.box(0.05, 0.012, STAGE.STEP_W, "#ffb04d", side * (x1 - 0.03), top + 0.006, sz, { emissive: 0.8, glow: true });
      K.solid({ x: side * (x0 + x1) / 2, z: sz, hx: STAGE.TREAD / 2, hz: STAGE.STEP_W / 2, top });
    }

    // The DJ booth on the stage: a curved desk, its face an LED screen in a dark bezel lit violet along its edges, its
    // decks and mixer on top.
    const rb0 = r0 - 3.2, rb1 = r0 - 2.4, a0 = (180 - ah) * DEG, a1 = (180 + ah) * DEG, rs = rb0 - 0.046, U = H + BOOTH_TOP;
    K.sector(0, rb0, rb1, a0, a1, H, H + 1.0, C.booth);
    K.sector(0, rb0 - 0.06, rb1, a0, a1, H + 1.0, U, C.boothTop);
    K.sector(0, rb0 - 0.04, rb0, a0, a1, H + 0.1, H + 0.98, C.bezel, { steps: 40 });
    for (const y of [0.115, 0.945]) K.sector(0, rb0 - 0.05, rb0 - 0.04, a0, a1, H + y, H + y + 0.012, PURPLE, { emissive: 1, glow: true, steps: 40 });
    const screenCanvas = CH.canvas(SCREEN.W, SCREEN.H);
    screenOf(screenCanvas).paint(0.1, 0.3, 0.3, 0, firstBands, firstWave);
    K.node("screen", screenGeometry(rs, (ah - 1.5) * DEG, screenCanvas), 0, H, -rs,
      { glow: true, depthBias: -0.3, target: { kind: "booth", tip: "DJ booth", radius: 1.3, data: { say: "Block Party · the bass drops on every block" } } });
    // The desk stands in the way of feet below its top, so an Ooga walks round it on the stage to the DJ's place
    // behind, or jumps up onto it and over.
    arcSolids(K, (rb0 + rb1) / 2, 180 - ah, 180 + ah, 0.42, U);
    for (const side of [-1, 1]) {
      const x = side * 0.65;
      K.cyl(0.3, 0.3, 0.05, C.metal, x, H + 1.055, BZ, { seg: 24 });
      K.box(0.03, 0.03, 0.3, "#c9c9d0", x + side * 0.26, H + 1.1, BZ + 0.04, { ry: side * 0.25 });
      K.node(`record${side < 0 ? 0 : 1}`, (k) => {
        k.cyl(0.25, 0.25, 0.012, C.vinyl, 0, 0, 0, { seg: 24 });
        k.cyl(0.08, 0.08, 0.014, C.label, 0, 0.001, 0, { seg: 12 });
        k.box(0.13, 0.016, 0.02, "#3a3a44", 0.15, 0.001, 0);
      }, x, H + 1.087, BZ, { target: { kind: "decks", tip: "Decks", radius: 0.4, data: { say: "33 rpm, and the bass drops on every block" } } });
    }
    K.box(0.42, 0.08, 0.32, C.metal, 0, H + 1.07, BZ);
    K.box(0.36, 0.01, 0.26, PURPLE, 0, H + 1.115, BZ, { emissive: 0.6, glow: true });
    for (let m = 0; m < 2; m++) K.node(`meter${m}`, (k) => k.box(0.03, 0.12, 0.03, m ? BANDS[4] : BANDS[2], 0, 0.06, 0, { emissive: 1, glow: true }), (m - 0.5) * 0.12, H + 1.12, BZ - 0.08, { glow: true });

    // The lasers on the walls: each projector on its bracket, and every projector's beams and their dots, built shrunk
    // to nothing (the room starts dark) and in every colour among them, so all of them stay with the room.
    const rigs = rigsOf(L), rp = ROOMS.radiusAt(L, PROJ.Y);
    let body = projector;
    const beamGeo = [], dotGeo = [];
    rigs.forEach((g, p) => {
      const b = g.bearing * DEG;
      bracket(K.group(rp * Math.sin(b), PROJ.Y, rp * Math.cos(b), b + Math.PI));
      body = K.node(`projector${p}`, body, g.x, g.y, g.z, { rx: g.rx, ry: g.ry, scale: PROJ.SCALE, glow: false,
        target: { kind: "laser", tip: "Laser projector", radius: 0.35, data: { say: "An RGB laser · it waits for the music to hit hard" } } }).geometry;
      for (let j = 0; j < NB; j++) {
        const c = (p + j) % RGB.length;
        beamGeo[c] = K.node(`beam${p}_${j}`, beamGeo[c] || ((k) => k.box(BEAM_W, BEAM_W, BEAM_LEN, RGB[c], 0, 0, BEAM_LEN / 2, { emissive: 1, glow: true })), g.ax, g.ay, g.az, { glow: true, scale: 1e-4 }).geometry;
        dotGeo[c] = K.node(`hit${p}_${j}`, dotGeo[c] || ((k) => k.ball(0.035, RGB[c], 0, 0, 0, { emissive: 1, glow: true, seg: 6 })), g.ax, g.ay, g.az, { glow: true, scale: 1e-4 }).geometry;
      }
    });

    // The line arrays hung off the walls either side of the booth and further round, their woofers on nodes that thump.
    let woofer = cone(0.13);
    const tip = { kind: "speaker", tip: "Line array", radius: 0.6, data: { say: "Hung off the wall, and a drop on every block" } }, rh = ROOMS.radiusAt(L, HANG_Y);
    for (const [i, a] of ARRAYS.entries()) for (const s of [1, -1]) {
      const b = s * a.b * DEG;
      woofer = lineArray(K.group(rh * Math.sin(b), 0, rh * Math.cos(b), b + Math.PI), a.n, `woofer${i}${s < 0 ? "l" : "r"}`, woofer, tip);
    }

    // The mirror ball under the crown on its line; the ring of light a drop sends down the dome and the sign over the
    // booth that a block's drop shows, both kept under the floor until then.
    const by = ballY(L);
    K.node("ball", (k) => mirrorBall(k, 1.1), 0, by, FZ, { target: { kind: "ball", tip: "Mirror ball", radius: 1.3, data: { say: "It turns faster when the music hits hard" } } });
    K.box(0.03, L.crown - by - 1.25, 0.03, "#55555c", 0, (by + 1.15 + L.crown - 0.1) / 2, FZ);
    K.node("wave", (k) => k.torus(1, 0.025, FLASH, 0, 0, 0, { emissive: 1, glow: true, seg: 96, sides: 5 }), 0, AWAY, 0, { glow: true });
    K.picture(9, 1.1, 1636, 200, sign("BLOCK FOUND · DROP!", FLASH, FLASH), 0, AWAY, BZ + 1.6, { name: "drop", rx: 0.3 });

    // The latest block on the dome over the booth.
    const pa0 = -15, pa1 = 15, pe0 = 3.5, pe1 = 9.5, pw = 1024;
    const wM = (pa1 - pa0) * DEG * L.R * Math.cos((pe0 + pe1) / 2 * DEG), hM = L.R * (Math.sin(pe1 * DEG) - Math.sin(pe0 * DEG)), ph = Math.round(pw * hM / wM);
    K.live({ az0: pa0, az1: pa1, el0: pe0, el1: pe1, w: pw, h: ph, tip: "The latest block",
      key: (f, now) => blockKey(f.reader, now), paint: (ctx, f, now) => paintBlock(ctx, f.reader, now, pw, ph) });

    // Point lights, in the order `animate` drives them: the two mood lights over the floor, the floor's own glow in the
    // middle and the ball's; four more over the floor round it; the screen's.
    K.light(-6, 5, -2, 26, 0.48, 0.25, 0.82);
    K.light(6, 5, -2, 26, 0.97, 0.58, 0.1);
    K.light(0, 0.9, FZ, 10, 0.5, 0.35, 0.7);
    K.light(0, by - 1.3, FZ, 12, 0.45, 0.45, 0.55);
    for (let q = 0; q < 4; q++) { const p = polar(10, 45 + q * 90); K.light(p.x, 0.9, FZ + p.z, 9.5, 0.5, 0.35, 0.7); }
    K.light(0, STAGE.H + 1.6, BZ + 1.4, 6, 0.55, 0.3, 0.85);
  };

  // The room alive. Each frame: the beat, eased onto the music's; how hard the music is, from the radio or the room's
  // own arrangement; the section that makes, and on a bar now and then a new look for one surface or new colours; the
  // lasers while a show is on; then every surface painted from the same moment. The radio plays for the visit and is
  // let go in `dispose`.
  const animate = (nodes, built, feeds) => {
    const L = built.layout, rigs = rigsOf(L), F = new Float64Array(3), M = moment(), rgb = [0, 0, 0];
    const floorSurface = built.floor && built.floor.geometry.imageSurface, floor = floorSurface && floors.get(floorSurface.canvas);
    const RINGS = floor ? floor.rings : 1, FAR = Math.round(10 / TILE);
    const floorA = floor ? new Float32Array(floor.n * 3) : null, floorB = floor ? new Float32Array(floor.n * 3) : null;
    // The beams, their dots and their colours now; each colour's beam and dot, from the beams built in it.
    const count = rigs.length * NB, beams = [], hits = [], beamGeo = [], dotGeo = [], colorNow = new Uint8Array(count);
    for (let p = 0; p < rigs.length; p++) for (let j = 0; j < NB; j++) {
      const c = (p + j) % RGB.length, beam = nodes[`beam${p}_${j}`], hit = nodes[`hit${p}_${j}`];
      beams.push(beam); hits.push(hit); colorNow[p * NB + j] = c;
      beamGeo[c] = beam.geometry; dotGeo[c] = hit.geometry;
      beam.visible = hit.visible = false;
      beam.scale.x = beam.scale.y = beam.scale.z = 1; hit.scale.x = hit.scale.y = hit.scale.z = 1;
    }
    const projectors = rigs.map((_, p) => nodes[`projector${p}`]), look = { dir: new Float32Array(count * 3), on: new Uint8Array(count), color: new Uint8Array(count) };
    const dots = [];
    for (let g = 0; nodes[`dots${g}`]; g++) dots.push(nodes[`dots${g}`]);
    // Each woofer's rest and the way it pushes out, toward the room's middle.
    const cones = [];
    for (const name of Object.keys(nodes)) if (/^woofer/.test(name)) {
      const n = nodes[name], p = n.position, d = Math.hypot(p.x, p.z);
      cones.push({ node: n, x: p.x, z: p.z, dx: -p.x / d, dz: -p.z / d });
    }
    const records = [nodes.record0, nodes.record1], meters = [nodes.meter0, nodes.meter1], ball = nodes.ball, wave = nodes.wave, drop = nodes.drop, stageEdge = nodes.stageEdge;
    const domeSurface = built.dome && built.dome.geometry.imageSurface, domeShow = domeSurface && shows.get(domeSurface.canvas);
    const screenSurface = nodes.screen.geometry.imageSurface, screen = screenOf(screenSurface.canvas);
    const wallSurface = nodes.wall.geometry.imageSurface, wall = wallOf(wallSurface.canvas), music = new Float32Array(MUSIC.BANDS), shape = new Float32Array(MUSIC.WAVE);
    const e0 = ROOMS.edgeEl(L, 0) / DEG;
    const floorRgb = built.lights[2].slice(4, 7), screenRgb = built.lights[8].slice(4, 7);
    const radio = BL.timechainPartyRadio.create(), heard = { live: false, bpm: 0, phase: 0, level: 0, conf: 0 }, E = { loud: 0, bass: 0 }, bulbs = RM.bulbsOf(nodes);
    const setLight = (lights, i, r, g, b) => { const o = i * 8; lights[o + 4] = r; lights[o + 5] = g; lights[o + 6] = b; };
    // The room's clock for its own arrangement: the island room's where there is one, so everyone sees it alike.
    const clock = () => (BL.net.state.room === "live" ? BL.net.serverNow() : Date.now()) / 1000;

    // The beat, the music's energy and the section.
    let beat = 0, rate = 1 / BEAT, lastStep = 0, hit = 1, I = 0.25, raw = 0.25, forced = null, analysed = false;
    let fastB = NaN, fastL = 0, refB = 0, refL = 0;
    let section = 0, sectionBeat = 0, lastCalm = -99, nextChange = CHANGE.EVERY * BAR, nextColors = CHANGE.PALETTE * BAR, turn = 0;
    // Each surface's look now and the one it fades from, how far, and the step its next change is due on.
    const surface = (seconds, fors, first) => ({ look: first, from: first, fade: 1, seconds, fors, due: Infinity });
    const surfaces = [surface(CHANGE.DOME, DOME.FOR, DOME.WASH), surface(CHANGE.FLOOR, FLOOR.FOR, FLOOR.GLOW), surface(CHANGE.WALL, WALLS.FOR, WALLS.WAVE)];
    const [dome, ground, strip] = surfaces;
    // The colours: the pair now, the pair faded from, and how far.
    let colorFrom = 0, colorTo = 0, colorFade = 1, colorStyled = -1;
    // The lasers: the show's end (a beat, -1 for none), its first look and when it began, its colours, how bright they
    // are, and when the last show ended.
    let showUntil = -1, showFrom = 0, showLook = 0, showPair = 0, showColors = SHOW_COLORS[0], laser = 0, lastShowEnd = LASER.FIRST - LASER.LONG, showCount = 0;
    // Drops: a block's and the music's, each 0 to 1 through it, -1 when none; the latest block's height seen.
    let blockT = -1, musicT = -1, lastHeight = -1;
    let domeWait = 0, screenWait = 0, screenDt = 0, floorWait = 0, nonce = 0, sparkDt = 0;
    const others = [];
    const pick = (list, not) => {
      others.length = 0;
      for (const v of list) if (v !== not) others.push(v);
      return others.length ? others[Math.floor(Math.random() * others.length)] : list[0];
    };
    const change = (s, to) => { if (to === s.look) return; s.from = s.fade < 0.5 ? s.from : s.look; s.look = to; s.fade = 0; };
    const PALETTE_IDS = PALETTES.map((_, i) => i);
    const newColors = () => { colorFrom = colorTo; colorTo = pick(PALETTE_IDS, colorTo); colorFade = 0; };
    const startShow = (beats, dropped) => {
      showFrom = beat; showUntil = beat + beats; showCount++;
      showLook = dropped ? 0 : Math.floor(Math.random() * LOOKS);
      showPair = dropped ? 0 : Math.floor(Math.random() * PROJ.BEARINGS.length);
      showColors = SHOW_COLORS[Math.floor(Math.random() * SHOW_COLORS.length)];
    };
    const endShow = (t) => { if (showUntil < 0) return; showUntil = -1; lastShowEnd = t; };
    // A drop in the music: a ring falls down the dome and a wave runs out across the floor in the room's colour, and the
    // lasers come on unless they shone a moment ago.
    const musicDrop = (t) => { musicT = 0; if (showUntil < 0 && t - lastShowEnd > LASER.GAP / 2) startShow(LASER.SHOW_DROP, true); };
    const blockDrop = () => { blockT = 0; };

    // The DJ's place, behind the booth from its back toward the wall and within its ends: Space there changes the
    // channel, for everyone in a shared room.
    const behind = L.r0 - 2.4, stations = BL.timechainPartyRadio.STATIONS.length, djHalf = (180 - boothHalf(L) + 3) * DEG;
    let chose = false;
    // In a shared room a change waits PARTY_GAP after the last, a little over the room's own gap, so this page never
    // tunes itself to a channel the room refuses (which the room would answer with its own, tuning it back).
    let sentAt = -Infinity;
    const CHANNEL = { key: "channel", label: "CHANNEL", hint: "Space · Change the channel", tap: "Tap CHANNEL to change the channel", run: (hud) => {
      const now = performance.now(), net = BL.net.state, shared = net.room === "live" && net.partyRadio && net.zone === "sphere-6";
      if (shared && now - sentAt < PARTY_GAP) return;
      radio.next(); chose = true;
      screen.channel(radio.station.short);
      if (shared && BL.net.sendParty(radio.channel)) sentAt = now;
      hud.toast(`Channel ${radio.channel + 1} of ${stations} · ${radio.station.name}${shared ? " · for everyone here" : ""}`);
    } };
    // The room's channel: a change by someone else tunes this page and says who; -1 (nobody has chosen one since the
    // room filled) after this page chose its own, as after a dropped connection, gives the room this page's.
    const offParty = BL.net.subscribeParty((channel, by) => {
      if (channel < 0) { if (chose) BL.net.sendParty(radio.channel); return; }
      const ch = channel % stations;
      if (ch === radio.channel) return;
      radio.tune(ch);
      screen.channel(radio.station.short);
      if (by === BL.net.state.selfId) return;
      const rec = by && BL.net.remotes.get(by), who = rec ? rec.display || rec.login : "";
      BL.hud.toast(`${who ? `${who} changed the channel · ` : ""}Channel ${radio.channel + 1} of ${stations} · ${radio.station.name}`);
    });

    return {
      update(dt, t) {
        // The beat: its own steady one, or eased onto the music's tempo and phase; it never runs backward.
        radio.sample(heard);
        rate += ((heard.live ? heard.bpm / 60 : 1 / BEAT) - rate) * Math.min(1, dt * TEMPO_RATE);
        let move = rate * dt;
        if (heard.live) { const off = heard.phase - (beat - Math.floor(beat)); move += (off - Math.round(off)) * Math.min(1, dt * PHASE_RATE); }
        move = Math.max(0, move);
        beat += move;
        const step = Math.floor(beat), newStep = step !== lastStep;
        // How hard the music is: its kick band and its whole against the loudest of each lately; or the arrangement.
        analysed = radio.energy(E);
        if (analysed) {
          if (fastB !== fastB) { fastB = refB = E.bass; fastL = refL = E.loud; }
          const k = Math.min(1, dt * ENERGY.FAST);
          fastB += (E.bass - fastB) * k; fastL += (E.loud - fastL) * k;
          refB = Math.max(fastB, refB - dt * ENERGY.FALL); refL = Math.max(fastL, refL - dt * ENERGY.FALL);
          raw = ENERGY.BASS_SHARE * clamp01((fastB - refB + ENERGY.BASS_SPAN) / ENERGY.BASS_WIDTH) + (1 - ENERGY.BASS_SHARE) * clamp01((fastL - refL + ENERGY.LOUD_SPAN) / ENERGY.LOUD_WIDTH);
        } else raw = arranged(clock());
        if (forced !== null) raw = forced;
        I += (raw - I) * Math.min(1, dt * (raw > I ? ENERGY.RISE : ENERGY.SINK));
        hit += ((heard.live ? 0.35 + 0.65 * heard.level : 1) - hit) * Math.min(1, dt * TEMPO_RATE);
        const kick = Math.exp(-(beat - step) * 6) * hit * (0.35 + 0.65 * I);
        if (I < SECTION.CALM_DOWN) lastCalm = t;
        // A new block on the chain drops the bass.
        const blocks = feeds.reader.value("recent"), height = blocks && blocks[0] ? blocks[0].height : -1;
        if (height > 0 && lastHeight > 0 && height > lastHeight) blockDrop();
        if (height > 0) lastHeight = height;
        // On each bar: the section, and now and then a new look for one surface or new colours.
        if (newStep && step % BAR === 0) {
          const want = section === 2 ? (I < SECTION.CALM_DOWN ? 0 : I < SECTION.HARD_DOWN ? 1 : 2)
            : section === 0 ? (I > SECTION.HARD_UP ? 2 : I > SECTION.CALM_UP ? 1 : 0)
              : (I > SECTION.HARD_UP ? 2 : I < SECTION.CALM_DOWN ? 0 : 1);
          if (want !== section && (beat - sectionBeat >= SECTION.HOLD * BAR || want === 2)) {
            if (want === 2 && (section === 0 || t - lastCalm < LASER.DROP_AFTER)) musicDrop(t);
            if (want !== 2) endShow(t);
            section = want; sectionBeat = beat;
            for (let i = 0; i < 3; i++) surfaces[i].due = step + i * BAR;
            newColors();
            nextChange = step + CHANGE.EVERY * BAR; nextColors = step + CHANGE.PALETTE * BAR;
          } else if (step >= nextChange) {
            surfaces[turn].due = step; turn = (turn + 1) % 3; nextChange = step + CHANGE.EVERY * BAR;
          }
          if (step >= nextColors) { newColors(); nextColors = step + CHANGE.PALETTE * BAR; }
          for (const s of surfaces) if (step >= s.due) { s.due = Infinity; change(s, pick(s.fors[section], s.look)); }
          // A long hard stretch without lasers gets a short show.
          if (section === 2 && showUntil < 0 && t - lastShowEnd > LASER.LONG) startShow(LASER.SHOW_PEAK, false);
        }
        lastStep = step;
        if (showUntil >= 0 && beat >= showUntil) endShow(t);
        for (const s of surfaces) s.fade = Math.min(1, s.fade + dt / s.seconds);
        colorFade = Math.min(1, colorFade + dt / CHANGE.COLORS);
        // The moment every surface reads.
        const cf = smooth(colorFade);
        mix(PALETTES[colorFrom][0], PALETTES[colorTo][0], cf, M.a); mix(PALETTES[colorFrom][1], PALETTES[colorTo][1], cf, M.b);
        M.t = t; M.beat = beat; M.step = step; M.kick = kick; M.I = I;
        M.spin += dt * (0.25 + 0.9 * I); M.rings += move * Math.PI * (0.3 + 0.7 * I); M.sweep += move * TAU / 16 * (0.5 + 0.5 * I);
        M.ripple += dt * (0.7 + 1.5 * I); M.flow += dt * (12 + 40 * I);
        // The drops: a block's lasts DROP_TIME, the music's MUSIC_DROP.
        if (blockT >= 0 && (blockT += dt / DROP_TIME) >= 1) blockT = -1;
        if (musicT >= 0 && (musicT += dt / MUSIC_DROP) >= 1) musicT = -1;
        const d = blockT >= 0 ? blockT : musicT, dropping = d >= 0, boom = blockT >= 0 ? 1 - blockT : 0;
        // The stage's lip glows with how hard the music is and on the kick.
        stageEdge.glow = 0.3 + 0.35 * I + 0.35 * kick + boom;
        // The door's bulbs chase round the frame a bulb a beat, every third lit.
        for (let i = 0; i < bulbs.length; i++) bulbs[i].glow = (i + step) % 3 === 0 ? 0.3 + 0.5 * kick : 0.1;
        // The floor: its look wiped outward ring by ring over the last, a drop's wave over it all; re-hashed on every
        // beat while the music is hard and every bar while it is not, the hashes held through a drop.
        const front = dropping ? (d - 0.3) / 0.6 * (RINGS + 1) : -9;
        if (!dropping) nonce = I > 0.6 ? step : step >> 2;
        sparkDt += dt;
        if (floor && (floorWait -= dt) <= 0) {
          floorWait = 1 / (FLOOR_FPS * (I > 0.5 ? 1 : 0.5));
          floor.step(M, sparkDt); sparkDt = 0;
          floor.look(ground.look, floorA, M);
          const wipe = ground.fade < 1 && ground.from !== ground.look;
          if (wipe) floor.look(ground.from, floorB, M);
          const reach = ground.fade * (RINGS + 6), flash = blockT >= 0 ? FLASH_RGB : M.b;
          for (let k = 0; k < floor.n; k++) {
            const r = floor.ring[k], o = k * 3;
            if (wipe) {
              const w = clamp01((reach - r) / 6);
              floorA[o] = floorB[o] + (floorA[o] - floorB[o]) * w; floorA[o + 1] = floorB[o + 1] + (floorA[o + 1] - floorB[o + 1]) * w; floorA[o + 2] = floorB[o + 2] + (floorA[o + 2] - floorB[o + 2]) * w;
            }
            if (Math.abs(r - front) < 1.3) { floorA[o] = flash[0] * 1.1; floorA[o + 1] = flash[1] * 1.1; floorA[o + 2] = flash[2] * 1.1; }
          }
          if (floor.paint(floorA, nonce, 0.3 + 0.7 * I)) floorSurface.version++;
        }
        // The lasers: during a show as bright as the music is hard, one pair at a time taking turns by the phrase and the
        // opposite pair with it at the hardest; a block's drop all of them.
        const target = blockT >= 0 ? 1 : showUntil >= 0 ? clamp01((I - 0.45) / 0.35) : 0;
        laser += (target - laser) * Math.min(1, dt * (target > laser ? 3 : 1.5));
        const n = PROJ.BEARINGS.length, first = (showPair + Math.floor((beat - showFrom) / PHRASE)) % n;
        const pairs = blockT >= 0 ? (1 << n) - 1 : laser > 0.03 ? 1 << first | (laser > 0.75 ? 1 << (first + 2) % n : 0) : 0;
        if (pairs) {
          const lk = blockT >= 0 ? -1 : (showLook + Math.floor((beat - showFrom) / PHRASE)) % LOOKS;
          aim(rigs, beat, kick, lk, showColors[0], showColors[1], pairs, look, F);
          const glow = (0.35 + 0.65 * laser) * (0.85 + 0.15 * kick);
          for (let i = 0; i < count; i++) {
            const beam = beams[i], dot = hits[i], on = look.on[i] === 1;
            beam.visible = dot.visible = on;
            if (!on) continue;
            const c = look.color[i];
            if (c !== colorNow[i]) { colorNow[i] = c; beam.geometry = beamGeo[c]; dot.geometry = dotGeo[c]; }
            const g = rigs[(i / NB) | 0], dx = look.dir[i * 3], dy = look.dir[i * 3 + 1], dz = look.dir[i * 3 + 2], reach = reachOf(L, g.ax, g.ay, g.az, dx, dy, dz);
            beam.rotation.x = Math.asin(-dy); beam.rotation.y = Math.atan2(dx, dz); beam.scale.z = reach / BEAM_LEN;
            dot.position.x = g.ax + dx * reach; dot.position.y = g.ay + dy * reach; dot.position.z = g.az + dz * reach;
            beam.glow = dot.glow = glow;
          }
        } else for (let i = 0; i < count; i++) beams[i].visible = hits[i].visible = false;
        for (let p = 0; p < projectors.length; p++) projectors[p].glow = pairs >> rigs[p].pair & 1 ? 0.4 + 0.6 * laser : 0.25;
        // The dome: its look faded over the last, warm in a block's drop; the dots twinkling softly, brighter in the
        // night's look, a group lit on the kick.
        if (domeShow && (domeWait -= dt) <= 0) {
          domeWait = 1 / DOME_FPS;
          domeShow.paint(dome.from, dome.look, smooth(dome.fade), M, 0.35 * boom);
          domeSurface.version++;
        }
        const night = dome.look === DOME.NIGHT ? dome.fade : dome.from === DOME.NIGHT ? 1 - dome.fade : 0;
        for (let g = 0; g < dots.length; g++) dots[g].glow = 0.12 + 0.3 * night + (0.15 + 0.25 * night) * (0.5 + 0.5 * Math.sin(t * 1.3 + g * 1.7)) + (g === step % dots.length ? 0.5 * kick * I : 0) + boom;
        // The booth's screen and the LED wall, from the music read once for both (or made from the beat).
        screenDt += dt;
        if ((screenWait -= dt) <= 0) {
          screenWait = 1 / SCREEN.FPS;
          if (!radio.spectrum(music) || !radio.scope(shape)) madeUp(t, kick, I, music, shape);
          const styled = Math.round(cf * 8) + colorTo * 16;
          if (styled !== colorStyled) { colorStyled = styled; wall.colors(M.a, M.b); }
          screen.paint(screenDt, kick, I, boom, music, shape);
          wall.paint(screenDt, strip.from, strip.look, smooth(strip.fade), M, boom, music, shape);
          screenSurface.version++; wallSurface.version++; screenDt = 0;
        }
        // The woofers push out on the kick, harder in a block's drop.
        const push = 0.02 * kick * (1 + boom);
        for (let i = 0; i < cones.length; i++) {
          const c = cones[i], n = c.node;
          n.position.x = c.x + c.dx * push; n.position.z = c.z + c.dz * push;
          n.scale.x = n.scale.z = 1 + push * 2.5;
          n.glow = 0.2 + 0.6 * kick;
        }
        records[0].rotation.y -= dt * 3.49; records[1].rotation.y -= dt * 3.49;
        meters[0].scale.y = 0.25 + 0.75 * kick; meters[1].scale.y = 0.25 + 0.75 * Math.exp(-((beat + 0.5) % 1) * 5) * hit;
        ball.rotation.y += dt * (0.15 + 0.35 * I + boom * 2.2);
        ball.glow = 0.55 + 0.35 * I + 0.3 * kick + boom;
        // A drop's ring of light falls from the crown to the dome's edge in its first half; a block's sign blinks.
        const fall = d / 0.5;
        if (dropping && fall < 1) {
          const el = (90 - fall * (90 - e0)) * DEG, s = Math.max(0.3, (L.R * Math.cos(el) - 0.12) / 1.025);
          wave.position.y = L.c + L.R * Math.sin(el); wave.scale.x = wave.scale.y = wave.scale.z = s;
        } else wave.position.y = AWAY;
        drop.position.y = blockT >= 0 && (blockT * 7) % 1 < 0.7 ? SIGN_Y : AWAY;
        // The lights in the room's two colours, as bright as the music is hard, flaring warm in a block's drop.
        const opts = BL.scenes.timechain.renderOpts, lights = opts && opts.lights;
        if (lights && opts.lightCount >= 9) {
          const lift = (0.45 + 0.55 * I) * (1 + 0.6 * boom);
          mix(M.a, FLASH_RGB, boom, rgb); setLight(lights, 0, rgb[0] * lift, rgb[1] * lift, rgb[2] * lift);
          mix(M.b, FLASH_RGB, boom, rgb); setLight(lights, 1, rgb[0] * lift, rgb[1] * lift, rgb[2] * lift);
          const f = (0.35 + 0.35 * I + 0.3 * kick) * (1 + 0.6 * boom);
          setLight(lights, 2, floorRgb[0] * f, floorRgb[1] * f, floorRgb[2] * f);
          const bl = (0.6 + 0.3 * I) * (1 + 0.6 * boom);
          setLight(lights, 3, M.b[0] * bl, M.b[1] * bl, M.b[2] * bl);
          const fr = 0.25 + 0.3 * I + 0.25 * kick, ring = blockT >= 0 && Math.abs(FAR - front) < 1.3 ? FLASH_RGB : M.a;
          for (let q = 4; q < 8; q++) setLight(lights, q, ring[0] * fr, ring[1] * fr, ring[2] * fr);
          const sc = 0.55 + 0.4 * kick + boom;
          setLight(lights, 8, screenRgb[0] * sc, screenRgb[1] * sc, screenRgb[2] * sc);
        }
      },
      near(x, z) {
        const r = Math.hypot(x, z);
        return r > behind - 0.1 && r < behind + 1.5 && Math.abs(Math.atan2(x, z)) > djHalf ? CHANNEL : null;
      },
      tap(owner, hud) {
        if (owner.kind === "booth" || owner.kind === "decks" || owner.kind === "speaker") { hud.toast(radio.words()); return true; }
        if (owner.kind !== "live") return false;
        hud.toast("The latest block, from mempool.space · the bass drops on every one");
        return true;
      },
      // Under debug (`__ooga.timechain.motion`): the radio's state and the room's reading of the music, with handles to
      // hold its intensity (null lets go), drop the bass as a block or the music would, set a surface's look by name
      // at once and set the colours.
      get stats() {
        return { ...radio.stats, intensity: +I.toFixed(3), analysed, section, laser: +laser.toFixed(3), showing: showUntil >= 0, shows: showCount,
          looks: { dome: DOME.NAMES[dome.look], floor: FLOOR.NAMES[ground.look], wall: WALLS.NAMES[strip.look] }, colors: colorTo,
          force: (v) => { forced = v === null ? null : clamp01(v); }, blockDrop, musicDrop: () => musicDrop(1e9),
          look: (which, name) => {
            const s = { dome, floor: ground, wall: strip }[which], names = { dome: DOME.NAMES, floor: FLOOR.NAMES, wall: WALLS.NAMES }[which];
            change(s, names.indexOf(name)); s.fade = 1;
          },
          palette: (i) => { colorFrom = colorTo = i % PALETTES.length; colorFade = 1; } };
      },
      dispose() { offParty(); radio.dispose(); }
    };
  };
  // `jetpack`: the visitor's jetpack comes in with them and flies under the dome.
  BL.timechainRoomKinds.party = { plan, animate, door, jetpack: true };
})();
