// Room 3, the Block Party: a club under a dome of light (the shortlist mock-up's `buildParty`). The dome plays the
// mock-up's light show: rings of the fee bands' colours stepping down from the crown on the beat, bands sweeping round it
// in spirals and a scatter of warm LED dots twinkling over it. The whole floor is LED panels, each a block of cells in
// a hash grid that re-hashes on every beat, whose rings step out through the same colours on every beat, and the wall under the dome is an LED wall all the way round but for the doors, the
// music's spectrum mirrored round it from the front with its wave over it. The DJ booth stands at the front, its face an
// LED screen of the music's spectrum and wave with the room's name in the middle, room to walk round it to the DJ's place
// behind and a top to jump up onto and over; behind it a truss of laser projectors, and one on each speaker stack,
// throws fans, tunnels, scans and sheets of beams that change look every phrase. A stack of speakers either side thumps
// and the mirror ball turns under the crown. The latest block hangs on the dome over the booth. The radio plays live
// (timechain-party-radio.js), EDM Sessions first, and the DJ changes the channel from behind the booth; the lights
// follow its beat, found in the music as it plays, and until the beat is found, or where the stream can't be analysed,
// they keep a steady 124 BPM and the screens make their own spectrum from that beat. Every twelve seconds, on the next
// bar, the bass drops as it does on a block: a ring of light falls down the dome, a wave of light runs out across the
// floor, the lasers fan wide and strobe and the sign over the booth says so.
(() => {
  "use strict";
  const BL = window.BL;
  const RM = BL.timechainRoomModels, CH = BL.timechainCharts, ROOMS = BL.timechainRooms;
  const { face, blank } = RM.helpers;
  const { DEG, TAU } = ROOMS;
  const { hexToRgb } = BL.math;
  // The fee bands' colours, low to high, that every light in the room is drawn from, and the drop's warm flash.
  const BANDS = ["#5b3fd0", "#3a7bd5", "#2fbf71", "#e3c33a", "#f7931a", "#e0533d"], FLASH = "#ffd08a", PURPLE = "#9a5cff";
  const BAND_RGB = BANDS.map((c) => hexToRgb(c).map((v) => v / 255)), FLASH_RGB = hexToRgb(FLASH).map((v) => v / 255);
  const C = {
    booth: "#1a1420", boothTop: "#2a2030", bezel: "#0a0810", metal: "#2a2a2e", vinyl: "#0b0b0b", cab: "#101012", baffle: "#161618",
    surround: "#26262b", label: "#ffb04d", ink: "#0b0714", truss: "#8e929b", plate: "#1c1c20", housing: "#16161b", trim: "#0c0c0f",
    glass: "#0a1622", fin: "#26272d", knob: "#2a2a30"
  };
  // The floor: LED panels TILE apart round (0, FZ), wall to wall (under the speakers and the truss's towers too) but
  // inside the booth, lit a ring at a time; painted FLOOR_FPS times a second on the floor's own canvas at FLOOR_PX
  // pixels a metre, so a panel is a black seam round CELLS by CELLS cells of a hash grid, each a few pixels in the
  // panel's colour, dark or bright, on a dimmer ground of it, so each panel reads as a block.
  const FZ = -1, TILE = 0.8, FLOOR_PX = 20, FLOOR_FPS = 30, CELLS = 4;
  // The beat with no music to follow, and the drop that stands in for a block: due every DROP_EVERY seconds from
  // DROP_FIRST, starting on the next bar of BAR beats, DROP_TIME long. Following the radio, the room's beat eases to
  // its tempo at TEMPO_RATE and its phase at PHASE_RATE a second, so a beat found or lost never jumps the floor.
  const BEAT = 60 / 124, DROP_EVERY = 12, DROP_FIRST = 3, DROP_TIME = 1.6, BAR = 4, TEMPO_RATE = 3, PHASE_RATE = 6;
  // The sign's height in a drop, and where what is put away waits.
  const SIGN_Y = 8.2, AWAY = -3;
  // The DJ booth's top, which an Ooga can jump up onto.
  const BOOTH_TOP = 1.03;
  // The speaker stacks' bearings, either side of the booth.
  const STACKS = [214, 146];
  // The dome: its light show repainted DOME_FPS times a second on a canvas DOME_W by DOME_H the renderer draws up smooth,
  // first as it stood at SHOW_T; its LED dots a cell a fortieth of a radian round, about one in seven lit, in DOT_GROUPS
  // nodes that twinkle in turn, sorted DOT_BIAS metres nearer for Canvas 2D.
  const DOME_W = 512, DOME_H = 192, DOME_FPS = 30, SHOW_T = 10.2, DOT_GROUPS = 6, DOT = 0.075, DOT_BIAS = -1.5;
  // The LED wall is sorted WALL_BIAS metres nearer for Canvas 2D, in front of the wall's own large faces but behind what
  // stands in the room.
  const WALL_BIAS = -0.5;
  // The lasers: an RGB projector's colours; NB beams a projector, each a thin bar BEAM_LEN long stretched to whatever it
  // meets, with a dot where it lands; a new look every PHRASE beats.
  const RGB = ["#2bff5a", "#ff2b3a", "#3b5bff", "#2bf2ff", "#ff2bea", "#ffe62b", "#f4f2ff"];
  const GREEN = 0, RED = 1, BLUE = 2, CYAN = 3, MAGENTA = 4, YELLOW = 5, WHITE = 6;
  const NB = 10, PHRASE = 16, BEAM_W = 0.007, BEAM_LEN = 8, LOOKS = 5;
  // The truss: a box truss S square on two towers X either side of the middle behind the booth (far enough out that the
  // widest Ooga walks between a tower and the booth's end to the DJ's place behind it), its lower chords at Y,
  // its lacing in bays BAY long. Projectors hang in yokes under its front chord at HANG, their pivots KNOB under it,
  // tipped TILT down; a projector's body is BODY, its aperture at APERTURE in its own frame.
  const TRUSS = { S: 0.29, Y: 3.05, X: 5.6, BAY: 0.5, chord: 0.024, lace: 0.009 };
  const BODY = { w: 0.3, h: 0.17, d: 0.32 }, TILT = 0.32, KNOB = 0.26, HANG = [-3.2, -1.6, 0, 1.6, 3.2], APERTURE = [0, -0.012, 0.182];
  // The booth's screen: a canvas W by H wrapped round the booth's face across HALF either side of the middle, from Y0 to
  // Y1, repainted at most FPS times a second: BARS bars of ROWS segments either side of the name, and a wave of WAVE points.
  const SCREEN = { W: 1024, H: 144, HALF: 18.5 * DEG, Y0: 0.16, Y1: 0.92, FPS: 60, BARS: 40, ROWS: 14, LOGO_W: 300, LOGO_H: 104, TAG: 4 };
  // The music as the room reads it once a frame for both screens: BANDS bands of its spectrum, low to high, and WAVE
  // points of its wave.
  const MUSIC = { BANDS: 96, WAVE: 512 };
  // The LED wall round the room: a canvas W by H wrapped round just inside the wall below the dome (INSET), from Y0 over
  // the skirting to Y1 under the screen's amber edge, all the way round but DOOR either side of the doors (their frame,
  // bulbs and the Exit button), repainted with the booth's screen; the spectrum mirrored round it, bass behind the booth
  // and treble by the doors, in bars of SEG-pixel segments, in HUES hues round the room.
  const WALL = { W: 2048, H: 96, INSET: 0.995, Y0: 0.14, Y1: 3.62, DOOR: 2.8, SEG: 4, HUES: 48 };
  const polar = (r, b) => ({ x: r * Math.sin(b * DEG), z: r * Math.cos(b * DEG) });
  const boothZ = (L) => -(L.r0 - 2.7);
  const trussZ = (L) => boothZ(L) - 0.45;
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
  const rgbStyle = (c) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;

  // ---------- the floor ----------
  // The panels, each with the ring it lights with: every one whose corners keep clear of the wall, but those wholly
  // hidden inside the booth.
  const floorTiles = (L) => {
    const rb0 = L.r0 - 3.2, rb1 = L.r0 - 2.4, wall = ROOMS.radiusAt(L, 0) - 0.15, half = TILE * 0.475, n = Math.ceil((L.r0 + 1) / TILE), out = [];
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const x = i * TILE, z = FZ + j * TILE, r = Math.hypot(x, z);
      if (Math.hypot(Math.abs(x) + half, Math.abs(z) + half) > wall) continue;
      if (r > rb0 + 0.2 && r < rb1 - 0.2 && Math.abs(Math.atan2(x, z)) > 161 * DEG) continue;
      out.push({ x, z, ring: Math.round(Math.hypot(i, j)) });
    }
    return out;
  };

  // The floor's painter, made once per canvas: the canvas near black, then each panel inside its seam written whole into
  // one image, as the room's beat colours it. `paint(step, t, kick, front, nonce)`: each ring's band colour steps out a
  // ring a beat and pulses; a drop's wave (`front`, a ring) runs the flash colour out; every panel's cells are a hash of
  // its place and `nonce`, half lit in its colour, a quarter dark and a quarter bright.
  const floors = new WeakMap();
  const floorOf = (canvas, F, tiles) => {
    let floor = floors.get(canvas);
    if (floor) return floor;
    const ctx = canvas.getContext("2d"), N = F.N, img = ctx.createImageData(N, N), px = new Uint32Array(img.data.buffer), side = Math.round(TILE * F.s);
    // Inside the seam, cells `cell` pixels square a pixel apart, the last against the next panel's seam.
    const pitch = Math.ceil((side - 1) / CELLS), cell = pitch - 1, c = [0, 0, 0];
    px.fill(0xff070305);
    // Each panel's top left pixel inside its seam, and its ring.
    const at = new Int32Array(tiles.length), ring = new Int8Array(tiles.length);
    tiles.forEach((t, k) => { at[k] = (Math.round(F.Y(t.z - TILE / 2)) + 1) * N + Math.round(F.X(t.x - TILE / 2)) + 1; ring[k] = t.ring; });
    const pack = (r, g, b) => 0xff000000 | Math.min(255, b * 255) << 16 | Math.min(255, g * 255) << 8 | Math.min(255, r * 255);
    const paint = (step, t, kick, front, nonce) => {
      for (let k = 0; k < at.length; k++) {
        const r = ring[k], flash = Math.abs(r - front) < 1.3, rgb = flash ? FLASH_RGB : BAND_RGB[((r - step) % 6 + 6) % 6];
        const glow = flash ? 1.15 : 0.32 + 0.4 * Math.max(0, Math.sin(r * 1.2 - t * 6)) + 0.38 * kick;
        c[0] = rgb[0] * glow; c[1] = rgb[1] * glow; c[2] = rgb[2] * glow;
        const lit = pack(c[0], c[1], c[2]), dark = pack(c[0] * 0.16, c[1] * 0.16, c[2] * 0.16), gap = pack(c[0] * 0.3, c[1] * 0.3, c[2] * 0.3);
        const bright = pack(c[0] + (glow - c[0]) * 0.45, c[1] + (glow - c[1]) * 0.45, c[2] + (glow - c[2]) * 0.45);
        // The hash: the panel's place and the nonce mixed, two bits a cell.
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
      ctx.putImageData(img, 0, 0);
    };
    floor = { paint, rings: 1 + ring.reduce((m, r) => Math.max(m, r), 0) };
    floors.set(canvas, floor);
    return floor;
  };

  // ---------- the dome ----------
  // The mock-up's light-show shader at a moment, painted whole onto the dome's small canvas: per column the spirals'
  // phase and colour (by azimuth), per row the rings' (by elevation), so each pixel only adds the two. Made once per
  // canvas, its buffers kept for every repaint.
  const shows = new WeakMap();
  const showOf = (canvas, D) => {
    let show = shows.get(canvas);
    if (show) return show;
    const ctx = canvas.getContext("2d"), w = D.W, h = D.H, img = ctx.createImageData(w, h), px = img.data, c = [0, 0, 0];
    const az = new Float32Array(w), el = new Float32Array(h), sa = new Float32Array(w), ca = new Float32Array(w), sr = new Float32Array(w), sg = new Float32Array(w), sb = new Float32Array(w);
    const se = new Float32Array(h), ce = new Float32Array(h), r0 = new Float32Array(h), g0 = new Float32Array(h), b0 = new Float32Array(h);
    for (let u = 0; u < w; u++) az[u] = ((u + 0.5) / w * 360 - 180) * DEG;
    for (let v = 0; v < h; v++) { el[v] = D.elAt(v + 0.5) * DEG; se[v] = Math.sin(el[v] * 4); ce[v] = Math.cos(el[v] * 4); }
    // `spin` turns the spirals, `rings` moves the rings down, `hue` turns the colours; `ringGain` and `spiralGain` are
    // how bright each is and `warm` how much of the drop's flash lies over it all.
    const paint = (spin, rings, hue, ringGain, spiralGain, warm) => {
      for (let u = 0; u < w; u++) {
        const a = az[u] * 8 + spin;
        sa[u] = Math.sin(a); ca[u] = Math.cos(a);
        band(az[u] / TAU + hue + 0.5, c); sr[u] = c[0] * spiralGain; sg[u] = c[1] * spiralGain; sb[u] = c[2] * spiralGain;
      }
      for (let v = 0; v < h; v++) {
        const ring = Math.pow(0.5 + 0.5 * Math.sin(el[v] * 18 + rings), 6) * ringGain;
        band(el[v] * 0.6 + hue * 1.6, c);
        r0[v] = 0.025 + c[0] * ring + FLASH_RGB[0] * warm; g0[v] = 0.012 + c[1] * ring + FLASH_RGB[1] * warm; b0[v] = 0.05 + c[2] * ring + FLASH_RGB[2] * warm;
      }
      for (let v = 0, o = 0; v < h; v++) {
        const s1 = se[v], c1 = ce[v], R = r0[v], G = g0[v], B = b0[v];
        for (let u = 0; u < w; u++, o += 4) {
          const s = 0.5 + 0.5 * (sa[u] * c1 + ca[u] * s1), s2 = s * s, s4 = s2 * s2, k = s4 * s4 * s2;
          px[o] = (R + sr[u] * k) * 255; px[o + 1] = (G + sg[u] * k) * 255; px[o + 2] = (B + sb[u] * k) * 255; px[o + 3] = 255;
        }
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
    const rand = RM.paintKit.rng(91), groups = Array.from({ length: DOT_GROUPS }, () => blank()), E = 1e-3;
    const at = (az, el) => { const p = ROOMS.onSphere(L, az, el, 0.992); return [p.x, p.y, p.z]; };
    for (let cy = Math.floor(-6 * DEG * 40); cy < 62; cy++) {
      const el = (cy + 0.5) / 40, cols = Math.max(1, Math.round(TAU * 40 * Math.cos(el)));
      for (let cx = 0; cx < cols; cx++) {
        if (rand() < 0.86) continue;
        const az = (cx + 0.5) / cols * TAU - Math.PI, color = rand() < 0.15 ? BANDS[Math.floor(rand() * 6)] : "#ffd999", g = Math.floor(rand() * DOT_GROUPS);
        if (el < ROOMS.edgeEl(L, az) + 1.5 * DEG || Math.abs(az) < 17 * DEG && el > 2.5 * DEG && el < 10.5 * DEG) continue;
        const p = at(az, el), e = at(az + E, el), n = at(az, el + E);
        const ex = e[0] - p[0], ey = e[1] - p[1], ez = e[2] - p[2], el1 = Math.hypot(ex, ey, ez), nx = n[0] - p[0], ny = n[1] - p[1], nz = n[2] - p[2], nl = Math.hypot(nx, ny, nz);
        const ux = ex / el1 * DOT / 2, uy = ey / el1 * DOT / 2, uz = ez / el1 * DOT / 2, vx = nx / nl * DOT / 2, vy = ny / nl * DOT / 2, vz = nz / nl * DOT / 2;
        face(groups[g], [[p[0] - ux - vx, p[1] - uy - vy, p[2] - uz - vz], [p[0] + ux - vx, p[1] + uy - vy, p[2] + uz - vz], [p[0] + ux + vx, p[1] + uy + vy, p[2] + uz + vz], [p[0] - ux + vx, p[1] - uy + vy, p[2] - uz + vz]],
          color, 1, [-p[0], L.c - p[1], -p[2]]);
      }
    }
    for (const g of groups) g.castShadow = false;
    return groups;
  };

  // ---------- the lasers ----------
  // Every projector: where its body stands and how it is turned (a node's YXZ turn), its aperture, which side of the
  // middle it is on, and whether it stands on a speaker stack rather than the truss.
  const turned = (rx, ry, x, y, z) => {
    const y1 = y * Math.cos(rx) - z * Math.sin(rx), z1 = y * Math.sin(rx) + z * Math.cos(rx);
    return [x * Math.cos(ry) + z1 * Math.sin(ry), y1, -x * Math.sin(ry) + z1 * Math.cos(ry)];
  };
  const rigsOf = (L) => {
    const out = [], z = trussZ(L) + TRUSS.S / 2, y = TRUSS.Y - KNOB;
    for (const x of HANG) out.push({ x, y, z, rx: TILT, ry: 0, side: Math.sign(x), stack: false });
    for (const b of STACKS) {
      const p = polar(L.r0 - 1.5, b), ry = Math.atan2(p.x, p.z);
      out.push({ x: p.x - 0.1 * Math.sin(ry), y: 2.81 + BODY.h / 2 + 0.015, z: p.z - 0.1 * Math.cos(ry), rx: -0.08, ry: ry + Math.PI, side: Math.sign(p.x), stack: true });
    }
    for (const g of out) { const a = turned(g.rx, g.ry, ...APERTURE); g.ax = g.x + a[0]; g.ay = g.y + a[1]; g.az = g.z + a[2]; }
    return out;
  };
  // Where every beam points this moment, into `out` (`dir`, three numbers a beam; `on`; `color`), from the beat: each
  // projector a fan of beams (spread across a plane through its aim, rolled round it) or a cone (spun round its aim), in
  // the look of the phrase: mirrored fans rolling and dipping on the kick; tunnels spinning onto the floor; a pair of
  // beams scanning each fan every beat, the projectors a wave apart; a level sheet over the crowd's heads; rainbow fans
  // standing up and swinging. A drop overrides them all with wide white fans spinning and strobing. `F` is scratch.
  const aim = (rigs, beat, kick, boom, out, F) => {
    const step = Math.floor(beat), look = boom > 0 ? -1 : Math.floor(step / PHRASE) % LOOKS;
    for (let p = 0; p < rigs.length; p++) {
      const g = rigs[p], s = g.side, base = p * NB;
      let tx = 0, ty = 0, tz = 0, cone = 0, spread = 0, roll = 0, spin = 0, color = WHITE, rainbow = false, lit = -1, on = true;
      if (look === 0) {
        tx = g.ax * 0.6; ty = 3 + 0.8 * Math.sin(beat * Math.PI / 4) - 0.5 * kick; tz = FZ;
        spread = 0.75; roll = s * 0.6 * Math.sin(beat * Math.PI / 8); color = p % 2 ? CYAN : GREEN;
      } else if (look === 1) {
        tx = g.ax * 0.3; ty = 0; tz = FZ - 2;
        cone = 0.13 + 0.04 * kick; spin = (p % 2 ? 1 : -1) * beat * Math.PI / 2; color = g.stack ? BLUE : MAGENTA;
      } else if (look === 2) {
        tx = g.ax * 0.5; ty = 2.6; tz = FZ;
        spread = 1.1; color = RED; lit = Math.floor(((beat + p * 0.15) % 1) * NB);
      } else if (look === 3) {
        on = !g.stack;
        tx = g.ax; ty = g.ay - 0.2 - 0.12 * Math.sin(beat * Math.PI / 4 + p * 0.7); tz = g.az + 10;
        spread = 1.6; color = p % 2 ? CYAN : GREEN;
      } else if (look === 4) {
        tx = g.ax * 0.4 + 3 * Math.sin(beat * Math.PI / 2 + p); ty = 3.4 + 1.2 * Math.sin(beat * Math.PI / 4); tz = FZ;
        spread = 0.6; roll = Math.PI / 2; rainbow = true;
      } else {
        tx = g.ax * 0.8; ty = 2.4; tz = FZ;
        spread = 1.3; roll = beat * Math.PI; color = step % 2 ? YELLOW : WHITE; on = (beat * 4) % 1 < 0.55;
      }
      // The aim and a frame round it: across (level) and up.
      let dx = tx - g.ax, dy = ty - g.ay, dz = tz - g.az;
      const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
      const ul = Math.hypot(dz, dx), ux = -dz / ul, uz = dx / ul, vx = -uz * dy, vy = uz * dx - ux * dz, vz = ux * dy;
      F[0] = Math.cos(roll) * ux + Math.sin(roll) * vx; F[1] = Math.sin(roll) * vy; F[2] = Math.cos(roll) * uz + Math.sin(roll) * vz;
      for (let j = 0; j < NB; j++) {
        let x, y, z;
        if (cone) {
          const a = j / NB * TAU + spin, ca = Math.cos(a) * Math.sin(cone), sa = Math.sin(a) * Math.sin(cone), cc = Math.cos(cone);
          x = cc * dx + ca * ux + sa * vx; y = cc * dy + sa * vy; z = cc * dz + ca * uz + sa * vz;
        } else {
          const a = (j / (NB - 1) - 0.5) * spread, c = Math.cos(a), sn = Math.sin(a);
          x = c * dx + sn * F[0]; y = c * dy + sn * F[1]; z = c * dz + sn * F[2];
        }
        const i = base + j, l = Math.hypot(x, y, z);
        out.dir[i * 3] = x / l; out.dir[i * 3 + 1] = y / l; out.dir[i * 3 + 2] = z / l;
        out.on[i] = on && (lit < 0 || j === lit || j === NB - 1 - lit) ? 1 : 0;
        out.color[i] = rainbow ? j % RGB.length : color;
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
  // A round bar from a to b, `r` thick: a cylinder turned from +y onto the line between them.
  const rod = (K, ax, ay, az, bx, by, bz, r, color) => {
    const dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.hypot(dx, dy, dz), c = Math.max(-1, Math.min(1, dy / l));
    K.cyl(r, r, l, color, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, { seg: 6, rz: Math.acos(c), ry: Math.abs(c) < 1 - 1e-9 ? Math.atan2(dz, -dx) : 0 });
  };
  // A zigzag of lacing between two parallel chords from a0 to a1 and b0 to b1, a bay `bay` long.
  const lacing = (K, a0, a1, b0, b1, bay, r, color) => {
    const n = Math.max(1, Math.round(Math.hypot(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]) / bay));
    const p = (q0, q1, t) => [q0[0] + (q1[0] - q0[0]) * t, q0[1] + (q1[1] - q0[1]) * t, q0[2] + (q1[2] - q0[2]) * t];
    for (let k = 0; k < n; k++) {
      const s = p(k % 2 ? b0 : a0, k % 2 ? b1 : a1, k / n), e = p(k % 2 ? a0 : b0, k % 2 ? a1 : b1, (k + 1) / n);
      rod(K, s[0], s[1], s[2], e[0], e[1], e[2], r, color);
    }
  };
  // The truss: two towers of four uprights on base plates, capped, and the span between them along their tops, every
  // face laced; the projectors' yokes under its front chord, each on a half coupler round it.
  const truss = (K, L) => {
    const { S, Y, X, BAY, chord, lace } = TRUSS, Z = trussZ(L), h = S / 2, top = Y + S, color = C.truss;
    const span = X - h;
    for (const sx of [-1, 1]) {
      // Each tower on a base plate on the floor.
      const x = sx * X, foot = 0.02, corner = [[-h, -h], [h, -h], [h, h], [-h, h]];
      K.box(0.62, foot, 0.62, C.plate, x, foot / 2, Z);
      K.box(S + 0.04, 0.02, S + 0.04, C.plate, x, top + chord + 0.01, Z);
      for (const [ox, oz] of corner) rod(K, x + ox, foot, Z + oz, x + ox, top + chord, Z + oz, chord, color);
      for (let k = 0; k < 4; k++) {
        const [ax, az] = corner[k], [bx, bz] = corner[(k + 1) % 4];
        lacing(K, [x + ax, foot, Z + az], [x + ax, top, Z + az], [x + bx, foot, Z + bz], [x + bx, top, Z + bz], BAY, lace, color);
      }
    }
    for (const y of [Y, top]) for (const oz of [-h, h]) rod(K, -span, y, Z + oz, span, y, Z + oz, chord, color);
    lacing(K, [-span, Y, Z + h], [span, Y, Z + h], [-span, top, Z + h], [span, top, Z + h], BAY, lace, color);
    lacing(K, [-span, Y, Z - h], [span, Y, Z - h], [-span, top, Z - h], [span, top, Z - h], BAY, lace, color);
    lacing(K, [-span, Y, Z - h], [span, Y, Z - h], [-span, Y, Z + h], [span, Y, Z + h], BAY, lace, color);
    lacing(K, [-span, top, Z - h], [span, top, Z - h], [-span, top, Z + h], [span, top, Z + h], BAY, lace, color);
    // The yokes: a coupler round the chord, a bar under it and an arm down either side to the body's pivots.
    const zf = Z + h, yk = Y - KNOB, side = BODY.w / 2 + 0.045;
    for (const x of HANG) {
      K.torus(chord + 0.008, 0.008, C.knob, x, Y, zf, { rz: Math.PI / 2, seg: 12, sides: 4 });
      K.box(0.04, Y - chord - (yk + 0.18), 0.04, C.knob, x, (Y - chord + yk + 0.18) / 2, zf);
      K.box(BODY.w + 0.11, 0.02, 0.05, C.housing, x, yk + 0.17, zf);
      for (const s of [-1, 1]) {
        K.box(0.015, 0.18, 0.05, C.housing, x + s * side, yk + 0.08, zf);
        K.cyl(0.024, 0.024, 0.03, C.knob, x + s * (side + 0.02), yk, zf, { rz: Math.PI / 2, seg: 10 });
      }
    }
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

  // ---------- the booth's screen ----------
  // The screen's face round the booth's inside, in the frame of a node standing on its middle with the curve's axis a
  // radius `rs` behind it (the room's middle), mapped round that curve; seen from the room, its canvas's left on the left.
  const screenGeometry = (rs, canvas) => {
    const geo = blank(), n = 24, { HALF, Y0, Y1 } = SCREEN, at = (b, y) => [-rs * Math.sin(b), y, rs - rs * Math.cos(b)];
    for (let i = 0; i < n; i++) {
      const b0 = -HALF + 2 * HALF * i / n, b1 = b0 + 2 * HALF / n, bm = (b0 + b1) / 2;
      face(geo, [at(b0, Y0), at(b1, Y0), at(b1, Y1), at(b0, Y1)], [255, 255, 255], 1, [Math.sin(bm), 0, Math.cos(bm)]);
    }
    geo.castShadow = false;
    geo.imageSurface = { canvas, version: 1, rect: [-HALF * rs, Y0, 2 * HALF * rs, Y1 - Y0], curve: [rs, 0, 0], tessellated: true };
    return geo;
  };
  // The screen's painter, made once per canvas: a dim grid of LED pixels; bars of segments either side of the name, bass
  // next to it and treble at the ends, coloured up through the fee bands with a peak over each; the wave across it all;
  // the name on its plate swelling on the kick; the edges flashing on the kick and the whole of it flooding warm in a
  // drop. `paint(dt, t, kick, boom, bands, wave)` takes the music as the room read it (MUSIC); `channel(name)` shows the
  // station just tuned to in the name's place for TAG seconds.
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
    const paint = (dt, t, kick, boom, bands, wave) => {
      for (let i = 0; i < BARS; i++) {
        // Each bar the loudest of its share of the bands.
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
      ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = "rgba(60,200,255,0.85)"; ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < WAVE; i++) {
        const x = i / (WAVE - 1) * W, y = H / 2 - Math.max(-1, Math.min(1, wave[i * 2])) * H * 0.42;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      const s = 1 + 0.06 * kick, lw = LOGO_W * s, lh = LOGO_H * s;
      tagged = Math.max(0, tagged - dt);
      ctx.drawImage(tagged > 0 ? tag : logo, (W - lw) / 2, (H - lh) / 2, lw, lh);
      ctx.fillStyle = PURPLE; ctx.globalAlpha = 0.7 * kick;
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
    const geo = blank(), r = L.R * WALL.INSET, el = (y) => Math.asin((y - L.c) / r), gap = Math.asin(WALL.DOOR / ROOMS.radiusAt(L, WALL.Y0)), cols = 168, rows = 4;
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
  // The wall's painter, made once per canvas: a dim grid of LED pixels; the spectrum's bars mirrored round the room
  // (bass either side of the front, treble meeting at the doors), cut into segments, each bar in a hue that turns round
  // the room, with a peak over each; the wave all the way round; a pulse of light running from the front round both
  // sides to the doors on every beat, brightest on the kick; the edges flashing on the kick, and all of it flooding warm
  // in a drop. `paint(dt, t, beat, kick, boom, bands, wave)` takes the music as the room read it (MUSIC).
  const walls = new WeakMap();
  const wallOf = (canvas) => {
    let wall = walls.get(canvas);
    if (wall) return wall;
    const { W, H, SEG, HUES } = WALL, BARS = MUSIC.BANDS, WAVE = MUSIC.WAVE, ctx = canvas.getContext("2d"), c = [0, 0, 0];
    const back = CH.canvas(W, H), b = back.getContext("2d");
    b.fillStyle = "#06030b"; b.fillRect(0, 0, W, H);
    b.fillStyle = "rgba(154,92,255,0.1)";
    for (let y = 1; y < H; y += 4) for (let x = 1; x < W; x += 4) b.fillRect(x, y, 2, 2);
    // The gaps between segments, laid over the bars in one go.
    const gaps = CH.canvas(W, H), g = gaps.getContext("2d");
    g.fillStyle = "#06030b";
    for (let y = H - 2 - SEG; y > 0; y -= SEG) g.fillRect(0, y, W, 1);
    const hues = [];
    for (let k = 0; k < HUES; k++) hues.push(rgbStyle(band(k / HUES, c)));
    const level = new Float32Array(BARS), peak = new Float32Array(BARS), half = W / 2, pitch = half / BARS, bw = Math.max(2, pitch - 3), top = H - 4;
    const paint = (dt, t, beat, kick, boom, bands, wave) => {
      for (let i = 0; i < BARS; i++) {
        level[i] = bands[i] > level[i] ? bands[i] : Math.max(bands[i], level[i] - dt * 2);
        peak[i] = level[i] > peak[i] ? level[i] : Math.max(0, peak[i] - dt * 0.4);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(back, 0, 0);
      const turn = t * 0.06;
      for (let i = 0; i < BARS; i++) {
        const h = Math.round(level[i] * top);
        if (h < 2) continue;
        const x = half + i * pitch + (pitch - bw) / 2, y = H - 2 - h;
        ctx.fillStyle = hues[(Math.floor((i / BARS * 0.5 + turn) * HUES) % HUES + HUES) % HUES];
        ctx.fillRect(x, y, bw, h); ctx.fillRect(W - x - bw, y, bw, h);
      }
      ctx.drawImage(gaps, 0, 0);
      ctx.fillStyle = "#f4f2ff";
      for (let i = 0; i < BARS; i++) {
        const h = Math.round(peak[i] * top);
        if (h < 4) continue;
        const x = half + i * pitch + (pitch - bw) / 2;
        ctx.fillRect(x, H - 3 - h, bw, 2); ctx.fillRect(W - x - bw, H - 3 - h, bw, 2);
      }
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(60,200,255,0.8)"; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < WAVE; i++) {
        const x = i / (WAVE - 1) * W, y = H / 2 - Math.max(-1, Math.min(1, wave[i])) * H * 0.4;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      const run = (beat - Math.floor(beat)) * half;
      ctx.fillStyle = "#ffffff"; ctx.globalAlpha = 0.12 + 0.45 * kick;
      ctx.fillRect(half + run - 14, 0, 28, H); ctx.fillRect(half - run - 14, 0, 28, H);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = PURPLE; ctx.globalAlpha = 0.8 * kick;
      ctx.fillRect(0, 0, W, 2); ctx.fillRect(0, H - 2, W, 2);
      if (boom > 0) { ctx.fillStyle = FLASH; ctx.globalAlpha = boom * 0.22; ctx.fillRect(0, 0, W, H); }
      ctx.globalAlpha = 1;
    };
    wall = { paint };
    walls.set(canvas, wall);
    return wall;
  };
  // The music when the radio can't be read: a spectrum and a wave made from the beat, into `bands` and `wave`.
  const madeUp = (t, kick, hit, bands, wave) => {
    for (let i = 0; i < bands.length; i++) {
      const shimmer = (0.5 + 0.5 * Math.sin(t * 7.3 + i * 0.37)) * (0.5 + 0.5 * Math.sin(t * 3.1 - i * 0.15));
      bands[i] = Math.min(1, kick * hit * Math.pow(1 - i / bands.length, 1.4) * 0.95 + 0.3 * shimmer * (0.4 + 0.6 * hit));
    }
    for (let i = 0; i < wave.length; i++) wave[i] = (0.55 * Math.sin(i * 0.055 + t * 9) + 0.3 * Math.sin(i * 0.185 - t * 13)) * (0.15 + 0.5 * kick * hit);
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
    const geo = blank(), rand = RM.paintKit.rng(77), rows = 10, cols = 22, GREYS = ["#d8d8e2", "#a8a8b4", "#eeeef4", "#8a8a96", "#c0c0cc"];
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
  // A speaker's cone round its node's +y, which the node turns out of the cabinet's face: the cone, its dust cap
  // and a lit ring round it that flashes on the beat.
  const cone = (rr) => (k) => {
    k.cyl(rr, rr * 0.6, 0.05, "#08080a", 0, -0.025, 0, { seg: 20 });
    k.ball(rr * 0.3, "#34343a", 0, 0, 0, { seg: 10 });
    k.torus(rr * 0.72, 0.008, PURPLE, 0, 0.002, 0, { seg: 20, sides: 4, emissive: 1 });
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
    const r0 = L.r0, BZ = boothZ(L), tiles = floorTiles(L);
    K.wallColor("#140e1a");
    K.render({ sky: [0.3, 0.24, 0.42], ground: [0.12, 0.08, 0.16], direct: [0.4, 0.34, 0.5], directStrength: 0.12, ambientFloor: 0.3, bloomStrength: 0.95 });
    K.dome((ctx, D) => showOf(ctx.canvas, D).paint(SHOW_T * 1.3, SHOW_T * 5, SHOW_T * 0.05, 0.55, 0.6, 0), { w: DOME_W, h: DOME_H, smooth: true });
    domeDots(L).forEach((geo, g) => K.node(`dots${g}`, geo, 0, 0, 0, { glow: true, depthBias: DOT_BIAS }));
    // The LED wall round the room, first painted (as the booth's screen is) from the room's own beat.
    const wallCanvas = CH.canvas(WALL.W, WALL.H), firstBands = new Float32Array(MUSIC.BANDS), firstWave = new Float32Array(MUSIC.WAVE);
    madeUp(0, 0.6, 1, firstBands, firstWave);
    wallOf(wallCanvas).paint(0.1, 0, 0, 0.6, 0, firstBands, firstWave);
    K.node("wall", wallGeometry(L, wallCanvas), 0, 0, -1, { glow: true, depthBias: WALL_BIAS, target: { kind: "booth", tip: "LED wall", radius: 1.5, data: { say: "Block Party · the music round the room" } } });
    // The floor: its LED panels painted as the room starts, then repainted as it plays.
    K.floor((ctx, F) => floorOf(ctx.canvas, F, tiles).paint(0, 0, 0.6, -9, 0), { scale: FLOOR_PX, emissive: 1 });

    // The DJ booth at the front: a curved desk, its face an LED screen in a dark bezel lit violet along its edges, its
    // decks and mixer on top.
    const rb0 = r0 - 3.2, rb1 = r0 - 2.4, a0 = 160 * DEG, a1 = 200 * DEG, rs = rb0 - 0.046;
    K.sector(0, rb0, rb1, a0, a1, 0, 1.0, C.booth);
    K.sector(0, rb0 - 0.06, rb1, a0, a1, 1.0, BOOTH_TOP, C.boothTop);
    K.sector(0, rb0 - 0.04, rb0, a0, a1, 0.1, 0.98, C.bezel, { steps: 40 });
    for (const y of [0.115, 0.945]) K.sector(0, rb0 - 0.05, rb0 - 0.04, a0, a1, y, y + 0.012, PURPLE, { emissive: 1, glow: true, steps: 40 });
    const screenCanvas = CH.canvas(SCREEN.W, SCREEN.H);
    screenOf(screenCanvas).paint(0.1, 0, 0.6, 0, firstBands, firstWave);
    K.node("screen", screenGeometry(rs, screenCanvas), 0, 0, -rs,
      { glow: true, depthBias: -0.3, target: { kind: "booth", tip: "DJ booth", radius: 1.3, data: { say: "Block Party · the bass drops on every block" } } });
    // The desk stands in the way of feet below its top, so an Ooga walks round it to the DJ's place behind, or jumps up
    // onto it and over.
    arcSolids(K, (rb0 + rb1) / 2, 160, 200, 0.42, BOOTH_TOP);
    for (const side of [-1, 1]) {
      const x = side * 0.65;
      K.cyl(0.3, 0.3, 0.05, C.metal, x, 1.055, BZ, { seg: 24 });
      K.box(0.03, 0.03, 0.3, "#c9c9d0", x + side * 0.26, 1.1, BZ + 0.04, { ry: side * 0.25 });
      K.node(`record${side < 0 ? 0 : 1}`, (k) => {
        k.cyl(0.25, 0.25, 0.012, C.vinyl, 0, 0, 0, { seg: 24 });
        k.cyl(0.08, 0.08, 0.014, C.label, 0, 0.001, 0, { seg: 12 });
        k.box(0.13, 0.016, 0.02, "#3a3a44", 0.15, 0.001, 0);
      }, x, 1.087, BZ, { target: { kind: "decks", tip: "Decks", radius: 0.4, data: { say: "33 rpm, and the bass drops on every block" } } });
    }
    K.box(0.42, 0.08, 0.32, C.metal, 0, 1.07, BZ);
    K.box(0.36, 0.01, 0.26, PURPLE, 0, 1.115, BZ, { emissive: 0.6, glow: true });
    for (let m = 0; m < 2; m++) K.node(`meter${m}`, (k) => k.box(0.03, 0.12, 0.03, m ? BANDS[4] : BANDS[2], 0, 0.06, 0, { emissive: 1, glow: true }), (m - 0.5) * 0.12, 1.12, BZ - 0.08, { glow: true });

    // The lasers: the truss and its yokes, a projector in each and one on each speaker stack, and every projector's
    // beams and their dots, built in the look they start in so the room seen before its first frame shows them. Every
    // colour's beam and dot is some beam's at the start, so all of them stay with the room.
    truss(K, L);
    const rigs = rigsOf(L), start = aim(rigs, 0, 0, 0, { dir: new Float32Array(rigs.length * NB * 3), on: new Uint8Array(rigs.length * NB), color: new Uint8Array(rigs.length * NB) }, new Float64Array(3));
    let body = projector;
    const beamGeo = [], dotGeo = [];
    rigs.forEach((g, p) => {
      body = K.node(`projector${p}`, body, g.x, g.y, g.z, { rx: g.rx, ry: g.ry, glow: false,
        target: { kind: "laser", tip: "Laser projector", radius: 0.35, data: { say: "An RGB laser · its beams take a new look every sixteen beats and fan wide when the bass drops" } } }).geometry;
      for (let j = 0; j < NB; j++) {
        const i = p * NB + j, c = (p + j) % RGB.length, dx = start.dir[i * 3], dy = start.dir[i * 3 + 1], dz = start.dir[i * 3 + 2], reach = reachOf(L, g.ax, g.ay, g.az, dx, dy, dz);
        beamGeo[c] = K.node(`beam${p}_${j}`, beamGeo[c] || ((k) => k.box(BEAM_W, BEAM_W, BEAM_LEN, RGB[c], 0, 0, BEAM_LEN / 2, { emissive: 1, glow: true })), g.ax, g.ay, g.az, { rx: Math.asin(-dy), ry: Math.atan2(dx, dz), glow: true }).geometry;
        dotGeo[c] = K.node(`hit${p}_${j}`, dotGeo[c] || ((k) => k.ball(0.035, RGB[c], 0, 0, 0, { emissive: 1, glow: true, seg: 6 })), g.ax + dx * reach, g.ay + dy * reach, g.az + dz * reach, { glow: true }).geometry;
      }
    });

    // The speaker stacks either side of the booth, three cabinets each facing the floor, their cones on nodes of
    // their own that thump.
    let woofer = cone(0.2), tweeter = cone(0.13);
    for (const [s, b] of STACKS.entries()) {
      const p = polar(r0 - 1.5, b), g = K.group(p.x, 0, p.z, Math.atan2(p.x, p.z));
      const tip = { kind: "speaker", tip: "Speaker stack", radius: 0.5, data: { say: "Four on the floor, and a drop on every block" } };
      for (let k = 0; k < 3; k++) {
        const y = 0.45 + k * 0.9;
        g.box(1.0, 0.86, 0.8, C.cab, 0, y, 0);
        g.box(0.9, 0.78, 0.02, C.baffle, 0, y, -0.405);
        g.box(0.894, 0.025, 0.02, PURPLE, 0, y - 0.4, -0.41, { emissive: 0.7, glow: true });
        g.torus(0.22, 0.025, C.surround, 0, y + 0.12, -0.415, { rx: Math.PI / 2, seg: 20, sides: 4 });
        g.torus(0.145, 0.02, C.surround, 0, y - 0.22, -0.415, { rx: Math.PI / 2, seg: 16, sides: 4 });
        woofer = g.node(`woofer${s}_${k}`, woofer, 0, y + 0.12, -0.415, { rx: -Math.PI / 2, target: k === 1 ? tip : null }).geometry;
        tweeter = g.node(`tweeter${s}_${k}`, tweeter, 0, y - 0.22, -0.415, { rx: -Math.PI / 2 }).geometry;
      }
      g.box(1.0, 0.04, 0.8, "#1e1e22", 0, 2.73, 0);
      // The stand its projector sits on.
      g.box(0.4, 0.03, 0.34, C.plate, 0, 2.765, -0.1);
      for (const fx of [-0.11, 0.11]) g.box(0.04, 0.03, 0.22, C.knob, fx, 2.795, -0.1);
      K.solid({ x: p.x, z: p.z, r: 0.62 });
    }
    for (const sx of [-1, 1]) K.solid({ x: sx * TRUSS.X, z: trussZ(L), r: 0.32 });

    // The mirror ball under the crown on its line; the ring of light a drop sends down the dome and the sign over the
    // booth that says so, both kept under the floor until a drop.
    K.node("ball", (k) => mirrorBall(k, 0.85), 0, 8.5, FZ, { target: { kind: "ball", tip: "Mirror ball", radius: 1, data: { say: "It turns faster when the bass drops" } } });
    K.box(0.03, L.crown - 9.45, 0.03, "#55555c", 0, (9.35 + L.crown - 0.1) / 2, FZ);
    K.node("wave", (k) => k.torus(1, 0.025, FLASH, 0, 0, 0, { emissive: 1, glow: true, seg: 72, sides: 5 }), 0, AWAY, 0, { glow: true });
    K.picture(9, 1.1, 1636, 200, sign("BLOCK FOUND · DROP!", FLASH, FLASH), 0, AWAY, BZ + 1.6, { name: "drop", rx: 0.3 });

    // The latest block on the dome over the booth.
    const pa0 = -15, pa1 = 15, pe0 = 3.5, pe1 = 9.5, pw = 1024;
    const wM = (pa1 - pa0) * DEG * L.R * Math.cos((pe0 + pe1) / 2 * DEG), hM = L.R * (Math.sin(pe1 * DEG) - Math.sin(pe0 * DEG)), ph = Math.round(pw * hM / wM);
    K.live({ az0: pa0, az1: pa1, el0: pe0, el1: pe1, w: pw, h: ph, tip: "The latest block",
      key: (f, now) => blockKey(f.reader, now), paint: (ctx, f, now) => paintBlock(ctx, f.reader, now, pw, ph) });

    // Point lights, in the order `animate` drives them: the two mood lights over the floor, the floor's own glow in the
    // middle and the ball's; four more over the floor round it, each in the colour of the ring under it; the screen's.
    K.light(-4, 4, -2, 18, 0.48, 0.25, 0.82);
    K.light(4, 4, -2, 18, 0.97, 0.58, 0.1);
    K.light(0, 0.9, FZ, 7.5, 0.5, 0.35, 0.7);
    K.light(0, 7.4, FZ, 9, 0.45, 0.45, 0.55);
    for (let q = 0; q < 4; q++) { const p = polar(7, 45 + q * 90); K.light(p.x, 0.9, FZ + p.z, 7, 0.5, 0.35, 0.7); }
    K.light(0, 1.6, BZ + 1.4, 6, 0.55, 0.3, 0.85);
  };

  // The room alive: the beat on the floor, the cones, the meters and the lights; the dome's show and its dots, the
  // booth's screen, the lasers' looks, the decks and the ball turning; and a drop every DROP_EVERY seconds. The radio
  // plays for the visit and is let go in `dispose`.
  const animate = (nodes, built) => {
    const L = built.layout, rigs = rigsOf(L), rgb = [0, 0, 0], F = new Float64Array(3);
    const floorSurface = built.floor && built.floor.geometry.imageSurface, floor = floorSurface && floors.get(floorSurface.canvas);
    const RINGS = floor ? floor.rings : 1, FAR = Math.round(7 / TILE);
    // The beams, their dots and their colours now; each colour's beam and dot, from the beams that start in it.
    const count = rigs.length * NB, beams = [], hits = [], beamGeo = [], dotGeo = [], colorNow = new Uint8Array(count);
    for (let p = 0; p < rigs.length; p++) for (let j = 0; j < NB; j++) {
      const c = (p + j) % RGB.length, beam = nodes[`beam${p}_${j}`], hit = nodes[`hit${p}_${j}`];
      beams.push(beam); hits.push(hit); colorNow[p * NB + j] = c;
      beamGeo[c] = beam.geometry; dotGeo[c] = hit.geometry;
    }
    const projectors = rigs.map((_, p) => nodes[`projector${p}`]), look = { dir: new Float32Array(count * 3), on: new Uint8Array(count), color: new Uint8Array(count) };
    const dots = [];
    for (let g = 0; nodes[`dots${g}`]; g++) dots.push(nodes[`dots${g}`]);
    // Each cone's rest and the way it pushes out, toward the room's middle.
    const cones = [];
    for (const name of Object.keys(nodes)) if (/^(woofer|tweeter)/.test(name)) {
      const n = nodes[name], p = n.position, d = Math.hypot(p.x, p.z);
      cones.push({ node: n, x: p.x, z: p.z, dx: -p.x / d, dz: -p.z / d, big: name[0] === "w" ? 1 : 0.6 });
    }
    const records = [nodes.record0, nodes.record1], meters = [nodes.meter0, nodes.meter1], ball = nodes.ball, wave = nodes.wave, drop = nodes.drop;
    const domeSurface = built.dome && built.dome.geometry.imageSurface, domeShow = domeSurface && shows.get(domeSurface.canvas);
    const screenSurface = nodes.screen.geometry.imageSurface, screen = screenOf(screenSurface.canvas);
    const wallSurface = nodes.wall.geometry.imageSurface, wall = wallOf(wallSurface.canvas), music = new Float32Array(MUSIC.BANDS), shape = new Float32Array(MUSIC.WAVE);
    const e0 = ROOMS.edgeEl(L, 0) / DEG;
    // The planned colours of the floor's and the ball's lights, which the beat and the drop scale.
    const floorRgb = built.lights[2].slice(4, 7), ballRgb = built.lights[3].slice(4, 7), screenRgb = built.lights[8].slice(4, 7);
    let next = DROP_FIRST, dropT = -1, beat = 0, rate = 1 / BEAT, lastStep = 0, hit = 1, spin = SHOW_T * 1.3, domeWait = 0, screenWait = 0, screenDt = 0, floorWait = 0, nonce = 0;
    const radio = BL.timechainPartyRadio.create(), heard = { live: false, bpm: 0, phase: 0, level: 0, conf: 0 }, bulbs = RM.bulbsOf(nodes);
    const setLight = (lights, i, r, g, b) => { const o = i * 8; lights[o + 4] = r; lights[o + 5] = g; lights[o + 6] = b; };
    // The DJ's place, behind the booth from its back toward the truss and within its ends: Space there changes the
    // channel for this page, named on the booth's screen.
    const behind = L.r0 - 2.4, stations = BL.timechainPartyRadio.STATIONS.length;
    const CHANNEL = { key: "channel", label: "CHANNEL", hint: "Space · Change the channel", tap: "Tap CHANNEL to change the channel", run: (hud) => {
      radio.next();
      screen.channel(radio.station.short);
      hud.toast(`Channel ${radio.channel + 1} of ${stations} · ${radio.station.name}`);
    } };
    return {
      update(dt, t) {
        // The room's beat: its own steady one, or eased onto the music's tempo and phase; it never runs backward, so
        // the floor never steps back a ring. Between kicks the beat lights only as hard as the music hits now.
        radio.sample(heard);
        rate += ((heard.live ? heard.bpm / 60 : 1 / BEAT) - rate) * Math.min(1, dt * TEMPO_RATE);
        let move = rate * dt;
        if (heard.live) { const off = heard.phase - (beat - Math.floor(beat)); move += (off - Math.round(off)) * Math.min(1, dt * PHASE_RATE); }
        beat += Math.max(0, move);
        hit += ((heard.live ? 0.35 + 0.65 * heard.level : 1) - hit) * Math.min(1, dt * TEMPO_RATE);
        const step = Math.floor(beat), kick = Math.exp(-(beat - step) * 6) * hit;
        if (t >= next && step !== lastStep && step % BAR === 0) { next = t + DROP_EVERY; dropT = 0; }
        lastStep = step;
        // The door's bulbs chase round the frame a bulb a beat, every third lit.
        for (let i = 0; i < bulbs.length; i++) bulbs[i].glow = (i + step) % 3 === 0 ? 0.55 + 0.45 * kick : 0.12;
        if (dropT >= 0 && (dropT += dt / DROP_TIME) >= 1) dropT = -1;
        const d = dropT, dropping = d >= 0, boom = dropping ? 1 - d : 0;
        // The floor: each ring a band colour, stepping outward a ring every beat and pulsing, its panels re-hashed on
        // every beat as a miner tries nonces; in a drop, the block found, the hashes hold and a wave of the flash colour
        // runs out from the middle once the dome's ring has come down.
        const front = dropping ? (d - 0.3) / 0.6 * (RINGS + 1) : -9;
        if (!dropping) nonce = step;
        if (floor && (floorWait -= dt) <= 0) {
          floorWait = 1 / FLOOR_FPS;
          floor.paint(step, t, kick, front, nonce);
          floorSurface.version++;
        }
        // The lasers: every beam aimed, stretched to what it meets and its dot set there, in its colour.
        aim(rigs, beat, kick, boom, look, F);
        let lit = 0;
        for (let i = 0; i < count; i++) {
          const beam = beams[i], dot = hits[i], on = look.on[i] === 1;
          beam.visible = dot.visible = on;
          if (!on) continue;
          lit++;
          const c = look.color[i];
          if (c !== colorNow[i]) { colorNow[i] = c; beam.geometry = beamGeo[c]; dot.geometry = dotGeo[c]; }
          const g = rigs[(i / NB) | 0], dx = look.dir[i * 3], dy = look.dir[i * 3 + 1], dz = look.dir[i * 3 + 2], reach = reachOf(L, g.ax, g.ay, g.az, dx, dy, dz);
          beam.rotation.x = Math.asin(-dy); beam.rotation.y = Math.atan2(dx, dz); beam.scale.z = reach / BEAM_LEN;
          dot.position.x = g.ax + dx * reach; dot.position.y = g.ay + dy * reach; dot.position.z = g.az + dz * reach;
          beam.glow = dot.glow = 0.8 + 0.2 * kick;
        }
        const aperture = 0.3 + 0.7 * lit / count * (0.8 + 0.2 * kick);
        for (let p = 0; p < projectors.length; p++) projectors[p].glow = aperture;
        // The dome: its show turning, its rings stepping down on the beat and swelling with the kick, warm in a drop;
        // its dots twinkling, a group lit on each beat.
        spin += dt * (1.3 + 3 * boom);
        if (domeShow && (domeWait -= dt) <= 0) {
          domeWait = 1 / DOME_FPS;
          domeShow.paint(spin, beat * Math.PI + 0.9 * kick, t * 0.05, 0.4 + 0.45 * kick + 0.6 * boom, 0.5 + 0.2 * hit, 0.35 * boom);
          domeSurface.version++;
        }
        for (let g = 0; g < dots.length; g++) dots[g].glow = 0.2 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.3 + g * 1.7)) + (g === step % dots.length ? 0.7 * kick : 0) + boom;
        // The booth's screen and the LED wall, from the music read once for both (or made from the beat).
        screenDt += dt;
        if ((screenWait -= dt) <= 0) {
          screenWait = 1 / SCREEN.FPS;
          if (!radio.spectrum(music) || !radio.scope(shape)) madeUp(t, kick, hit, music, shape);
          screen.paint(screenDt, t, kick, boom, music, shape);
          wall.paint(screenDt, t, beat, kick, boom, music, shape);
          screenSurface.version++; wallSurface.version++; screenDt = 0;
        }
        // The cones thump on the beat, harder in a drop.
        const push = 0.025 * kick * (1 + boom);
        for (let i = 0; i < cones.length; i++) {
          const c = cones[i], p = push * c.big, n = c.node;
          n.position.x = c.x + c.dx * p; n.position.z = c.z + c.dz * p;
          n.scale.x = n.scale.z = 1 + p * 2.5;
          n.glow = 0.3 + 0.7 * kick;
        }
        records[0].rotation.y -= dt * 3.49; records[1].rotation.y -= dt * 3.49;
        meters[0].scale.y = 0.25 + 0.75 * kick; meters[1].scale.y = 0.25 + 0.75 * Math.exp(-((beat + 0.5) % 1) * 5);
        ball.rotation.y += dt * (0.4 + boom * 2.2);
        ball.glow = 0.8 + 0.5 * kick + boom;
        // The drop's ring of light falls from the crown to the dome's edge in its first half; its sign blinks.
        const fall = d / 0.5;
        if (dropping && fall < 1) {
          const el = (90 - fall * (90 - e0)) * DEG, s = Math.max(0.3, (L.R * Math.cos(el) - 0.12) / 1.025);
          wave.position.y = L.c + L.R * Math.sin(el); wave.scale.x = wave.scale.y = wave.scale.z = s;
        } else wave.position.y = AWAY;
        drop.position.y = dropping && (d * 7) % 1 < 0.7 ? SIGN_Y : AWAY;
        // The lights: the mood pair cycling round the bands opposite each other, the floor's and the ball's on the
        // beat, the four over the floor in their rings' colours, the screen's on the kick, all flaring warm in a drop.
        const opts = BL.scenes.timechain.renderOpts, lights = opts && opts.lights;
        if (lights && opts.lightCount >= 9) {
          const lift = 1 + 0.6 * boom;
          for (let i = 0; i < 2; i++) {
            band(t * 0.05 + i * 0.5, rgb);
            setLight(lights, i, (rgb[0] + (FLASH_RGB[0] - rgb[0]) * boom) * lift, (rgb[1] + (FLASH_RGB[1] - rgb[1]) * boom) * lift, (rgb[2] + (FLASH_RGB[2] - rgb[2]) * boom) * lift);
          }
          const f = (0.6 + 0.5 * kick) * lift, bl = (0.85 + 0.3 * kick) * lift, ring = boom > 0 && Math.abs(FAR - front) < 1.3 ? FLASH_RGB : BAND_RGB[((FAR - step) % 6 + 6) % 6], fr = 0.45 + 0.35 * kick;
          setLight(lights, 2, floorRgb[0] * f, floorRgb[1] * f, floorRgb[2] * f);
          setLight(lights, 3, ballRgb[0] * bl, ballRgb[1] * bl, ballRgb[2] * bl);
          for (let q = 4; q < 8; q++) setLight(lights, q, ring[0] * fr, ring[1] * fr, ring[2] * fr);
          const sc = 0.7 + 0.5 * kick + boom;
          setLight(lights, 8, screenRgb[0] * sc, screenRgb[1] * sc, screenRgb[2] * sc);
        }
      },
      near(x, z) {
        const r = Math.hypot(x, z);
        return r > behind - 0.1 && r < behind + 1.5 && Math.abs(Math.atan2(x, z)) > 163 * DEG ? CHANNEL : null;
      },
      tap(owner, hud) {
        if (owner.kind === "booth" || owner.kind === "decks" || owner.kind === "speaker") { hud.toast(radio.words()); return true; }
        if (owner.kind !== "live") return false;
        hud.toast("The latest block, from mempool.space · the bass drops on every one");
        return true;
      },
      get stats() { return radio.stats; },
      dispose() { radio.dispose(); }
    };
  };
  BL.timechainRoomKinds.party = { plan, animate, door };
})();
