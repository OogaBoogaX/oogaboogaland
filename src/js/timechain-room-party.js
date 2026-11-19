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
// stretch, gives a short show in one or two colours, its looks changing every phrase. Everything that pulses (the
// lasers' beat-locked looks, the floor's rings and sparks, the woofers, the bulbs) does so only while a strong kick
// drives the music (the beat the radio finds and how hard it hits); a loud part without one gets the flowing looks,
// the lasers a slow mesh of level beams crossing over everyone's heads from all round the room. Where the music can't
// be read (a stream heard but not analysed, or the radio off) the room plays its own arrangement on the room's clock,
// so everyone sees it alike. A new block on the chain drops the bass: a ring of light falls down the dome, a wave runs out
// across the floor, the lasers strobe white and the sign over the booth says so. The DJ booth stands up on a stage
// across the front, dressed as a club's is (a velour skirt with the subs behind grilles, stage stairs with handrails
// each end, booth monitors on stands, road cases); line arrays hang off the walls all the way round between the lasers and
// thump, the mirror ball turns under the crown, and the latest block hangs on the dome. Oogas standing still on the
// floor groove to the beat, closer to standing than dancing (`dance`). Two glass balconies, one over the
// other, run round the wall over the line arrays and lasers, all but the front of the room, with no stair: a jetpack
// gets an Ooga up there.
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
  const PALETTE_HEX = [["#5b3fd0", "#3a7bd5"], ["#3a7bd5", "#2fbf71"], ["#7b3fe0", "#e0533d"], ["#f7931a", "#e0533d"],
    ["#2b9fd5", "#9a5cff"], ["#5b3fd0", "#f7931a"], ["#2fbf71", "#3ac8d5"], ["#e0533d", "#9a5cff"]];
  const PALETTES = PALETTE_HEX.map((p) => p.map(rgbOf));
  // A sine read from a table, for the dome's looks that need one or two a pixel.
  const SIN = new Float32Array(1024).map((_, i) => Math.sin(i / 1024 * Math.PI * 2)), fsin = (x) => SIN[((x * 162.97466) | 0) & 1023];
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
  // Drops seen coming: the radio's readings run LOOK seconds ahead of its speakers (the arrangement is known outright),
  // read every SCAN seconds at STEP-second points, each the mean of three frames AROUND seconds apart. A drop is where a
  // second under BELOW gives way to OVER seconds over ABOVE, at least JUMP harder, seen on two scans in a row; it lands
  // on the beat nearest, the room building toward it over its last BUILD seconds and holding its breath HUSH beats
  // before it. One that stops showing while more than LOSE seconds off is let go.
  const AHEAD = { LOOK: 8, STEP: 0.25, AROUND: 0.08, SCAN: 0.25, BELOW: 0.65, OVER: 0.75, ABOVE: 0.75, JUMP: 0.25, BUILD: 8, HUSH: 0.5, LOSE: 1 };
  // The sign's height in a drop, and where what is put away waits.
  const SIGN_Y = 5.4, AWAY = -3;
  // The DJ booth, up on the stage: its top (over the stage's) an Ooga can jump up onto, BOOTH_W across. The stage
  // stands H high across the front of the room, W either side of the middle, from FRONT metres in from the wall at
  // the room's middle back to the wall, with STEPS steps up each end, each TREAD deep and STEP_W long, from DOWN
  // metres behind its front edge.
  const BOOTH_TOP = 1.03, BOOTH_W = 7;
  // The DJ's platform behind the booth, DJ_UP over the stage (an Ooga steps up onto it, under the walkers' STEP_UP),
  // so the decks stand at an Ooga's waist rather than its chest; DJ_IN degrees short of the booth's ends each side.
  const DJ_UP = 0.4, DJ_IN = 1.5;
  const STAGE = { H: 0.8, W: 7, FRONT: 6, STEPS: 2, TREAD: 0.45, STEP_W: 2.4, DOWN: 0.4 };
  // The stage dressed as a club's is: a velour skirt along its front in folds PLEAT apart and DEPTH deep, the sub bays
  // built into it (SUBS: each w by h, at x), its deck in platforms PLATFORM square, a monitor either side of the booth on a
  // stand MON out from its ends, road cases at the back, and the colours of all of it.
  const SKIRT = { PLEAT: 0.09, DEPTH: 0.025 }, SUBS = { w: 1.3, h: 0.5, y: 0.12, at: [-4.5, -1.5, 1.5, 4.5] }, PLATFORM = 1.22, MON = 0.75;
  const STAGE_C = { skirt: "#141017", fold: "#1e1923", nosing: "#45474f", seam: "#0d0a11", tape: "#c9c4b6", grille: "#0b0b0e", slat: "#1a1a1f",
    frame: "#2a2b31", tread: "#1d1a22", riser: "#121016", lamp: "#ffcf9a", alu: "#8a8f98", led: "#3aff7a" };
  // The dome: its looks repainted DOME_FPS times a second on a canvas DOME_W by DOME_H drawn up smooth; its LED dots a
  // cell a fortieth of a radian round, about one in seven lit, in DOT_GROUPS nodes, sorted DOT_BIAS metres nearer for
  // Canvas 2D; the LED wall WALL_BIAS.
  const DOME_W = 512, DOME_H = 192, DOME_FPS = 24, DOT_GROUPS = 6, DOT_BIAS = -1.5, WALL_BIAS = -0.5;
  // The lasers: an RGB projector's colours; NB beams a projector, each a thin bar BEAM_LEN long stretched to what it
  // meets, with a dot where it lands; a new look every PHRASE beats; the pairs of colours a show may be in.
  const RGB = ["#2bff5a", "#ff2b3a", "#3b5bff", "#2bf2ff", "#ff2bea", "#ffe62b", "#f4f2ff"];
  const GREEN = 0, RED = 1, BLUE = 2, CYAN = 3, MAGENTA = 4, YELLOW = 5, WHITE = 6;
  const SHOW_COLORS = [[GREEN, GREEN], [CYAN, MAGENTA], [RED, RED], [BLUE, CYAN], [GREEN, CYAN], [MAGENTA, BLUE]];
  const NB = 10, PHRASE = 16, BEAM_W = 0.007, BEAM_LEN = 8;
  // An Ooga standing still in the room grooves to the beat, closer to standing than dancing: after STILL seconds it eases
  // in over EASE, a two-step (its weight shifting side to side over two beats, a leg opening STEP and the body leaning
  // LEAN toward it, a small dip NOD on every beat), and now and then the arms join in, in one of a few small ways
  // (`GROOVES`), picked afresh from its name every PHRASE beats so neighbours differ and nobody does the same thing
  // all night. Every movement's size is in radians and grows a little with the music (QUIET at its quietest).
  const DANCE = { STILL: 0.8, EASE: 1.2, STEP: 0.055, LEAN: 0.03, NOD: 0.025, QUIET: 0.6 };
  // Each groove's arms: `sway` (the upper arms swinging with the step), `lift` (the forearms bent up from hanging),
  // `pump` (both forearms on every beat), `alt` (the forearms in turn, beat by beat), `one` (the right forearm alone,
  // on the beat), `fwd` (the upper arms brought forward). The hands-still groove comes up more often than the rest.
  const GROOVES = [
    { sway: 0.03, lift: 0, pump: 0, alt: 0, one: 0, fwd: 0 },
    { sway: 0.03, lift: 0, pump: 0, alt: 0, one: 0, fwd: 0 },
    { sway: 0.06, lift: 0.1, pump: 0.08, alt: 0, one: 0, fwd: 0 },
    { sway: 0.02, lift: 0.5, pump: 0.12, alt: 0, one: 0, fwd: 0.12 },
    { sway: 0.02, lift: 0.65, pump: 0, alt: 0.1, one: 0, fwd: 0.15 },
    { sway: 0.04, lift: 0.05, pump: 0, alt: 0, one: 0.6, fwd: 0.05 }
  ];
  // The lasers' looks a show turns through: on the beat while a strong kick drives the music, and flowing (the level
  // sheet, the liquid sky and the mesh) while nothing kicks, turning half as often.
  const PULSE_LOOKS = [0, 1, 2, 4, 5, 7, 8, 10, 12, 13], FLOW_LOOKS = [3, 6, 9, 11];
  // A rainbow fan's colours, in order round the wheel.
  const RAINBOW = [RED, YELLOW, GREEN, CYAN, BLUE, MAGENTA];
  // A strong kick: the beat the radio finds, as hard as it hits now (`hit`, 0 to 1), counts from ON and stops counting
  // under OFF; a change holds HOLD bars before another.
  const KICK = { ON: 0.55, OFF: 0.4, HOLD: 8 };
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
  // The balconies: glass decks on steel round the wall, one over the other, each LEVELS' floor at Y1 and its inner
  // edge R in (the dome closing in over the upper one), its underside (for collision) DEPTH under its floor: the lower
  // over the line arrays and the lasers hung under it, the upper as high again over it. All the way round but the
  // front of the room (OPEN degrees either side of the booth), a glass balustrade RAIL high round each, with no stair:
  // an Ooga gets up there by jetpack. A beam every BEAM degrees; the floor's glass GLASS see-through and the
  // balustrade's RAIL_GLASS; collision in boxes SEG degrees round.
  const BALCONY = { LEVELS: [{ R: 16.4, Y1: 8.15 }, { R: 13.2, Y1: 16.3 }], DEPTH: 0.35, OPEN: 34, RAIL: 1.05, SEG: 4, BEAM: 6, GLASS: 0.16, RAIL_GLASS: 0.1 };
  const BALCONY_C = { steel: "#2a2d34", edge: "#33363e", joint: "#101116", shoe: "#1c1e23", rail: "#b3b8c0", lamp: "#ffd9a8", glass: "#cfe6e2", railGlass: "#dcefee" };
  // The booth's screen: a canvas W by H wrapped round the booth's face from Y0 to Y1, repainted at most FPS times a
  // second: BARS bars of ROWS segments either side of the name, and a wave.
  const SCREEN = { W: 1024, H: 144, Y0: 0.16, Y1: 0.92, FPS: 60, BARS: 40, ROWS: 14, LOGO_W: 300, LOGO_H: 104, TAG: 4 };
  const MUSIC = { BANDS: 96, WAVE: 512 };
  // The LED wall round the room: a canvas W by H wrapped just inside the wall below the dome (INSET), from Y0 to Y1, all
  // the way round but DOOR either side of the doors; its spectrum's segments SEG pixels, its blocks BLOCKS a side.
  const WALL = { W: 2048, H: 96, INSET: 0.995, Y0: 0.14, Y1: 3.62, DOOR: 2.8, SEG: 4, BLOCKS: 24 };
  // The surfaces' looks, and which suit each section (calm, middle, hard), and the flowing ones a middle or hard section
  // gets while nothing kicks (the fourth list).
  const DOME = { WASH: 0, NIGHT: 1, SWEEP: 2, RINGS: 3, SPIRAL: 4, PLASMA: 5, KALEIDO: 6, BURST: 7,
    NAMES: ["wash", "night", "sweep", "rings", "spiral", "plasma", "kaleido", "burst"], FOR: [[0, 1, 2, 5], [0, 2, 3, 5, 6], [3, 4, 6, 7], [0, 5, 6, 2]] };
  const FLOOR = { GLOW: 0, RIPPLES: 1, SWEEP: 2, SPARKS: 3, RINGS: 4, NAMES: ["glow", "ripples", "sweep", "sparks", "rings"], FOR: [[0, 1], [1, 2, 3], [4, 3, 2], [0, 1, 2]] };
  const WALLS = { WAVE: 0, FLOW: 1, BLOCKS: 2, SPECTRUM: 3, WATERFALL: 4, HASHES: 5, SKYLINE: 6, WARP: 7,
    NAMES: ["wave", "flow", "blocks", "spectrum", "waterfall", "hashes", "skyline", "warp"],
    FOR: [[0, 1, 4, 6], [1, 2, 3, 4, 5, 6], [3, 2, 5, 7], [1, 4, 0, 6]] };
  // The wall's skyline: TOWERS a side. Its warp: STARS streaks and CHEVRONS a side.
  const CITY = { TOWERS: 48 }, WARP = { STARS: 150, CHEVRONS: 4 };
  // The wall's hash rain: COLS columns of the latest block's hash falling a CELL-pixel row at a time, its trail fading
  // at FADE a second.
  const RAIN = { COLS: 128, CELL: 10, FADE: 3.5 };
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
  const moment = () => ({ t: 0, beat: 0, step: 0, kick: 0, I: 0, a: [0, 0, 0], b: [0, 0, 0], spin: 0, rings: 0, sweep: 0, ripple: 0, flow: 0, hash: "" });

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
    // the beat; spirals turning across the rings; a slow plasma of the two colours folding through each other; a
    // kaleidoscope of rings bent six ways round the crown, flowing down on the beat; and a starburst of rays turning
    // from the crown with a ring of light running down it every other beat.
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
      if (look === DOME.PLASMA) {
        for (let u = 0; u < w; u++) { cs[u] = fsin(az[u] * 3 + M.t * 0.23); sn[u] = az[u] * 2; }
        for (let v = 0; v < h; v++) { se[v] = fsin(el[v] * 7 - M.t * 0.31); ce[v] = el[v] * 5 + M.t * 0.17; rr[v] = (0.1 + 0.28 * (1 - up[v])) * (0.6 + 0.4 * I); }
        for (let v = 0, o = 0; v < h; v++) {
          const s1 = se[v], c1 = ce[v], g = rr[v], R = br[v], G = bg[v], B = bb[v];
          for (let u = 0; u < w; u++, o += 3) {
            const f = 0.5 + 0.5 * fsin((cs[u] + s1 + fsin(sn[u] + c1)) * 1.4 + M.spin * 0.6), k = g * (0.3 + 0.7 * f * f);
            buf[o] = R + (a[0] + (b[0] - a[0]) * f) * k; buf[o + 1] = G + (a[1] + (b[1] - a[1]) * f) * k; buf[o + 2] = B + (a[2] + (b[2] - a[2]) * f) * k;
          }
        }
        return;
      }
      if (look === DOME.KALEIDO) {
        for (let u = 0; u < w; u++) { cs[u] = 1.4 * fsin(az[u] * 6 + M.spin * 0.7); sn[u] = fsin(az[u] * 12 - M.spin * 1.1); }
        for (let v = 0; v < h; v++) { ce[v] = el[v] * 18 + M.rings * 1.2; rr[v] = (0.2 + 0.45 * I + 0.25 * M.kick * I) * (1 - up[v] * 0.35); }
        for (let v = 0, o = 0; v < h; v++) {
          const c1 = ce[v], g = rr[v], R = br[v], G = bg[v], B = bb[v];
          for (let u = 0; u < w; u++, o += 3) {
            const q = 0.5 + 0.5 * fsin(c1 + cs[u]), q2 = q * q, k = q2 * q2 * g * (0.7 + 0.3 * sn[u]), f = 0.5 + 0.5 * sn[u];
            buf[o] = R + (a[0] + (b[0] - a[0]) * f) * k; buf[o + 1] = G + (a[1] + (b[1] - a[1]) * f) * k; buf[o + 2] = B + (a[2] + (b[2] - a[2]) * f) * k;
          }
        }
        return;
      }
      if (look === DOME.BURST) {
        for (let u = 0; u < w; u++) { const p = 0.5 + 0.5 * Math.cos(az[u] * 16 + M.spin), p2 = p * p, p4 = p2 * p2; colK[u] = p4 * p4; }
        const front = 1 - ((M.beat * 0.5) % 1);
        for (let v = 0; v < h; v++) {
          mix(a, b, up[v], c); rr[v] = c[0]; rg[v] = c[1]; rb[v] = c[2];
          const d = (up[v] - front) * 7;
          se[v] = (0.22 + 0.45 * I) * (0.3 + 0.7 * up[v]); ce[v] = 0.55 * I * Math.exp(-d * d);
        }
        for (let v = 0, o = 0; v < h; v++) {
          const ray = se[v], ring = ce[v], R = br[v], G = bg[v], B = bb[v], CR = rr[v], CG = rg[v], CB = rb[v];
          for (let u = 0; u < w; u++, o += 3) { const k = colK[u] * ray + ring; buf[o] = R + CR * k; buf[o + 1] = G + CG * k; buf[o + 2] = B + CB * k; }
        }
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
        if (el < ROOMS.edgeEl(L, az) + 1.5 * DEG || Math.abs(az) < 17 * DEG && el > -0.2 * DEG && el < 11.6 * DEG) continue;
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
    // Each projector's place going round the room, for the chase; and the mirror ball, which a look aims them all at.
    out.slice().sort((p, q) => (p.bearing + 360) % 360 - (q.bearing + 360) % 360).forEach((g, i) => { g.round = i; });
    out.ball = ballY(L);
    return out;
  };
  // Where every beam points this moment, into `out` (`dir`, three numbers a beam; `on`; `color`), in the look `look`
  // and the show's colours `ca` and `cb`: mirrored fans dipping on the kick; tunnels spinning onto the floor; a pair of
  // beams scanning each fan; a level sheet over the crowd's heads; upright fans swaying side to side; every projector's
  // cone grazing the mirror ball, so the beams meet there from all round; a liquid sky, level fans over the heads with
  // a ripple running through them; a fan flashing from one projector after another round the room; crossfire, tight
  // fans sweeping the floor against their partners; a block's drop (-1), wide white fans spinning and strobing; and
  // while nothing kicks, a mesh of level fans from every projector drifting slowly over the heads so they cross into a
  // net; scissors, each fan's two halves crossing and parting on the beat (10); a prism, a wide level sheet in every
  // colour of the rainbow rolling slowly, its colours drifting along it (11); lighthouses, every projector's tight
  // cone landing on a ring round the floor and the ring turning a quarter a bar, so the spots chase round the room (12);
  // and a burst, every cone on the mirror ball opening wide on the kick, its beams in the show's two colours in turn
  // (13). The beat moves the pulsing looks, the time `t` the flowing ones. Only the projectors whose pair's bit is set in
  // `pairs` shine in a pulsing look but the ball's and the chase's, every one in a flowing one (every other in the
  // sheet). `F` is scratch.
  const aim = (rigs, beat, t, kick, look, ca, cb, pairs, out, F) => {
    for (let p = 0; p < rigs.length; p++) {
      const g = rigs[p], s = g.side, base = p * NB, D = g.D;
      let tx = g.ax + g.ix * D * 0.6, ty = 2.4, tz = g.az + g.iz * D * 0.6, cone = 0, spread = 0, roll = 0, spin = 0, color = p % 2 ? cb : ca, lit = -1, on = (pairs >> g.pair & 1) === 1, ripple = 0;
      let scissor = 0, rainbow = -1, alternate = false;
      if (look === 10) {
        tx = g.ax + g.ix * D * 0.6; tz = g.az + g.iz * D * 0.6; ty = 2.0 - 0.3 * kick;
        spread = 0.5; scissor = 0.42 * Math.sin(beat * Math.PI / 2); roll = s * 0.2;
      } else if (look === 11) {
        on = true;
        tx = g.ax + g.ix * D * 1.35; tz = g.az + g.iz * D * 1.35; ty = 2.6 + 0.25 * Math.sin(t * 0.41 + p * 0.9);
        spread = 1.25; roll = 0.22 * Math.sin(t * 0.23 + p * 1.3); ripple = 0.012; rainbow = Math.floor(t * 1.5 + p);
      } else if (look === 12) {
        on = true;
        const a = beat * Math.PI / 8 + g.round * TAU / rigs.length;
        tx = 6.5 * Math.cos(a); tz = FZ + 6.5 * Math.sin(a); ty = 0;
        cone = 0.028 + 0.01 * kick; spin = (p % 2 ? 1 : -1) * beat * Math.PI / 2;
      } else if (look === 13) {
        on = true;
        tx = 0; ty = rigs.ball; tz = FZ;
        cone = 0.035 + 0.2 * kick; spin = (p % 2 ? 1 : -1) * beat * Math.PI / 3; alternate = true;
      } else if (look === 0) {
        tx = g.ax + g.ix * D * 0.55; tz = g.az + g.iz * D * 0.55; ty = 2.2 + 0.8 * Math.sin(beat * Math.PI / 4) - 0.4 * kick;
        spread = 0.55; roll = s * 0.5 * Math.sin(beat * Math.PI / 8);
      } else if (look === 1) {
        tx = g.ax + g.ix * D * 0.75; tz = g.az + g.iz * D * 0.75; ty = 0;
        cone = 0.07 + 0.025 * kick; spin = (p % 2 ? 1 : -1) * beat * Math.PI / 2;
      } else if (look === 2) {
        spread = 0.8; lit = Math.floor(((beat + p * 0.15) % 1) * NB);
      } else if (look === 3) {
        on = p % 2 === 0;
        tx = g.ax + g.ix * D * 1.6; tz = g.az + g.iz * D * 1.6; ty = 2.6 + 0.15 * Math.sin(t * 0.5 + p * 0.7);
        spread = 1.0;
      } else if (look === 9) {
        on = true;
        const sway = 5 * Math.sin(t * 0.21 + p * 0.8);
        tx = g.ax + g.ix * D * 1.4 - g.iz * sway; tz = g.az + g.iz * D * 1.4 + g.ix * sway; ty = 2.7 + 0.25 * Math.sin(t * 0.37 + p);
        spread = 0.9; roll = 0.15 * Math.sin(t * 0.29 + p * 1.7); ripple = 0.02;
      } else if (look === 5) {
        on = true;
        tx = 0; ty = rigs.ball; tz = FZ;
        cone = 0.02 + 0.012 * kick; spin = (p % 2 ? 1 : -1) * beat * Math.PI / 4;
      } else if (look === 6) {
        on = true;
        tx = g.ax + g.ix * D * 1.5; tz = g.az + g.iz * D * 1.5; ty = 2.8;
        spread = 1.1; ripple = 0.035;
      } else if (look === 7) {
        on = Math.floor(beat * 2) % rigs.length === g.round;
        spread = 0.9; roll = s * 0.3;
      } else if (look === 8) {
        const sweep = 6 * s * Math.sin(beat * Math.PI / 4);
        tx = g.ax + g.ix * D * 0.65 - g.iz * sweep; tz = g.az + g.iz * D * 0.65 + g.ix * sweep; ty = 0;
        spread = 0.25;
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
          const half = NB >> 1, a = scissor ? ((j % half) / (half - 1) - 0.5) * spread + (j < half ? scissor : -scissor) : (j / (NB - 1) - 0.5) * spread, c = Math.cos(a), sn = Math.sin(a);
          x = c * dx + sn * F[0]; y = c * dy + sn * F[1] + ripple * Math.sin(j * 0.9 + t * 1.3 + p * 1.3); z = c * dz + sn * F[2];
        }
        const i = base + j, l = Math.hypot(x, y, z);
        out.dir[i * 3] = x / l; out.dir[i * 3 + 1] = y / l; out.dir[i * 3 + 2] = z / l;
        out.on[i] = on && (lit < 0 || j === lit || j === NB - 1 - lit) ? 1 : 0;
        out.color[i] = rainbow >= 0 ? RAINBOW[(rainbow + j) % RAINBOW.length] : alternate ? (j % 2 ? cb : ca) : color;
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
  // ring round it in `ring` that glows on the kick. A box's lit strip along its foot, in `color`, on a node of its own.
  const cone = (rr, ring) => (k) => {
    k.cyl(rr, rr * 0.6, 0.05, "#08080a", 0, -0.025, 0, { seg: 20 });
    k.ball(rr * 0.3, "#34343a", 0, 0, 0, { seg: 10 });
    k.torus(rr * 0.72, 0.008, ring, 0, 0.002, 0, { seg: 20, sides: 4, emissive: 1 });
  };
  const speakerStrip = (color) => (k) => k.box(BOX.w - 0.08, 0.012, 0.012, color, 0, 0, 0, { emissive: 0.7, glow: true });
  // A line array hung off the wall, in a frame at the foot of the wall under it with +z into the room: a braced
  // bracket out from the wall, the bumper on chains under it, and `n` boxes hung below in a curve, each from the bottom
  // back edge of the one above and tipped a little further down, two woofers either side of a horn on each and a lit
  // strip along its foot, on nodes of their own (`name`, the box and the side), sharing `shared`'s woofer and strip,
  // builders until the first is built and then their geometry.
  const lineArray = (K, n, name, shared, tip) => {
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
      shared.strip = g.node(`speakerStrip${name}_${k}`, shared.strip, 0, -BOX.h / 2 + 0.02, front + 0.012, { rx: tilt, glow: true }).geometry;
      for (const sx of [-1, 1]) g.box(0.012, BOX.h * 0.8, 0.012, "#2a2a30", sx * (BOX.w / 2 + 0.006), 0, -0.05);
      for (const sx of [-1, 1]) {
        shared.woofer = g.node(`${name}_${k}_${sx < 0 ? 0 : 1}`, shared.woofer, sx * 0.34, 0.01, front + 0.012, { rx: Math.PI / 2 + tilt, target: k === 1 && sx < 0 ? tip : null }).geometry;
      }
      y -= BOX.h * c; z -= BOX.h * s;
    }
  };

  // ---------- the stage ----------
  // The velour skirt along the stage's straight front (z = zs, facing the room) from x0 to x1 and y0 to y1, as faces
  // into `geo`: a fold every PLEAT in two shades, so the light catches one side of each, left open over the `gaps`.
  const skirt = (geo, zs, x0, x1, y0, y1, gaps) => {
    const n = Math.round((x1 - x0) / SKIRT.PLEAT), za = zs + 0.006, zm = za + SKIRT.DEPTH;
    for (let i = 0; i < n; i++) {
      const a = x0 + (x1 - x0) * i / n, b = x0 + (x1 - x0) * (i + 1) / n, m = (a + b) / 2;
      if (gaps.some(([g0, g1]) => b > g0 && a < g1)) continue;
      face(geo, [[a, y0, za], [m, y0, zm], [m, y1, zm], [a, y1, za]], STAGE_C.skirt, 0, [-SKIRT.DEPTH, 0, m - a]);
      face(geo, [[m, y0, zm], [b, y0, za], [b, y1, za], [m, y1, zm]], STAGE_C.fold, 0, [SKIRT.DEPTH, 0, b - m]);
    }
  };
  // A sub bay in the stage's front at x: a steel frame, the grille's black mesh and its slats.
  const subBay = (K, x, zs) => {
    const { w, h, y } = SUBS, cy = y + h / 2;
    K.box(w + 0.07, h + 0.07, 0.03, STAGE_C.frame, x, cy, zs + 0.015);
    K.box(w, h, 0.02, STAGE_C.grille, x, cy, zs + 0.03);
    for (let k = 1; k * 0.045 < h; k++) K.box(w - 0.02, 0.011, 0.012, STAGE_C.slat, x, y + k * 0.045, zs + 0.046);
  };
  // A booth monitor on a tripod stand on the deck at (x, z), turned to face (tx, tz) and tipped a little down: the
  // cabinet, its baffle, woofer and horn, a power lamp, and the stand's pole and legs.
  const boothMonitor = (K, x, y, z, tx, tz) => {
    const ry = Math.atan2(tx - x, tz - z), top = y + 1.02;
    for (let k = 0; k < 3; k++) {
      const a = ry + k * TAU / 3;
      rod(K, [x, y + 0.42, z], [x + 0.36 * Math.sin(a), y + 0.01, z + 0.36 * Math.cos(a)], 0.012, C.rig);
    }
    K.cyl(0.02, 0.02, top - y, C.rig, x, (y + top) / 2, z, { seg: 8 });
    const g = K.group(x, top + 0.34, z, ry, 0.12);
    g.box(0.42, 0.66, 0.4, C.cab, 0, 0, 0);
    g.box(0.38, 0.62, 0.012, C.grille, 0, 0, 0.204);
    g.torus(0.135, 0.012, "#26262c", 0, -0.1, 0.212, { rx: Math.PI / 2, seg: 20, sides: 4 });
    g.cyl(0.12, 0.07, 0.03, "#08080a", 0, -0.1, 0.205, { rx: Math.PI / 2, seg: 18 });
    g.box(0.22, 0.1, 0.025, C.horn, 0, 0.2, 0.212);
    g.box(0.014, 0.014, 0.008, STAGE_C.led, 0.16, -0.28, 0.212, { emissive: 1, glow: true });
    K.solid({ x, z, r: 0.34 });
  };
  // A road case on castors on the deck at (x, z), turned by ry: the box, aluminium on every edge, ball corners,
  // latches and handles on its front, and castors under it; something to stand on.
  const roadCase = (K, x, y, z, ry, w, h, d) => {
    const g = K.group(x, y, z, ry), c = 0.08, cy = c + h / 2, e = 0.022;
    g.box(w, h, d, "#151519", 0, cy, 0);
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) g.box(w + 0.01, e, e, STAGE_C.alu, 0, cy + sy * h / 2, sz * d / 2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(e, h + 0.01, e, STAGE_C.alu, sx * w / 2, cy, sz * d / 2);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) g.box(e, e, d + 0.01, STAGE_C.alu, sx * w / 2, cy + sy * h / 2, 0);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) g.ball(0.03, STAGE_C.alu, sx * w / 2, cy + sy * h / 2, sz * d / 2, { seg: 6 });
    for (const sx of [-0.3, 0.3]) g.box(0.07, 0.05, 0.02, STAGE_C.alu, sx * w, cy + h * 0.32, d / 2 + 0.012);
    g.box(0.16, 0.05, 0.03, "#0c0c0f", 0, cy, d / 2 + 0.014);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      g.box(0.07, 0.03, 0.07, C.rig, sx * (w / 2 - 0.08), c - 0.015, sz * (d / 2 - 0.08));
      g.cyl(0.03, 0.03, 0.025, "#0a0a0c", sx * (w / 2 - 0.08), 0.03, sz * (d / 2 - 0.08), { rz: Math.PI / 2, seg: 8 });
    }
    const p = g.at(0, 0, 0);
    K.solid({ x: p.x, z: p.z, hx: w / 2, hz: d / 2, ry, top: y + c + h });
  };

  // ---------- the balcony ----------
  // A steel member along bearing `b` (degrees) from radius v0 to v1, `w` either side of its line, its top at t0 and
  // its bottom at d0 at v0, tapering to t1 and d1 at v1, as faces into `geo`.
  const member = (geo, b, v0, v1, t0, t1, d0, d1, w, color) => {
    const s = Math.sin(b * DEG), c = Math.cos(b * DEG), p = (v, u, y) => [v * s + u * c, y, v * c - u * s];
    const A = [p(v0, -w, d0), p(v0, w, d0), p(v1, w, d1), p(v1, -w, d1)], B = [p(v0, -w, t0), p(v0, w, t0), p(v1, w, t1), p(v1, -w, t1)];
    face(geo, A, color, 0, [0, -1, 0]);
    face(geo, B, color, 0, [0, 1, 0]);
    face(geo, [A[0], A[3], B[3], B[0]], color, 0, [-c, 0, s]);
    face(geo, [A[1], A[2], B[2], B[1]], color, 0, [c, 0, -s]);
    face(geo, [A[0], A[1], B[1], B[0]], color, 0, [-s, 0, -c]);
    face(geo, [A[3], A[2], B[2], B[3]], color, 0, [s, 0, c]);
  };
  // Whether a bearing (degrees) keeps clear of the line arrays and the lasers hung on the wall, which keep the wall
  // under the balcony to themselves.
  const clearOfHangings = (b) => {
    const at = ((b % 360) + 540) % 360 - 180;
    for (const h of [...ARRAYS.map((a) => a.b), ...PROJ.BEARINGS]) if (Math.abs(Math.abs(at) - h) < 4) return false;
    return true;
  };
  // A balcony (LEVELS' `i`) as a real one is built: a steel ledger bolted along the wall; a tapered I-beam out from it every BEAM
  // degrees, deep at the wall and shallow at the edge, each held up by a raking strut down to a plate on the wall
  // (but where a line array or a laser hangs under the lower one); a ring joist halfway out and a channel along the edge, lit along its
  // face, with warm downlights under it; on them the floor's laminated glass, a dark joint over every beam and along
  // the joist; and a frameless glass balustrade in a steel shoe along the edge and across both ends, a brushed steel
  // cap along its top. Then the boxes that hold an Ooga up on it, keep one under it from flying up through it, and
  // keep one on it from walking off over the balustrade.
  const balcony = (K, L, i) => {
    const { DEPTH, OPEN, RAIL, SEG, BEAM, GLASS, RAIL_GLASS } = BALCONY, { R, Y1 } = BALCONY.LEVELS[i], Y0 = Y1 - DEPTH, S = BALCONY_C, span = 360 - 2 * OPEN;
    const wall = ROOMS.radiusAt(L, Y1) - 0.12, deep = wall + 0.1, a0 = (180 + OPEN) * DEG, a1 = a0 + span * DEG, mid = (R + wall) / 2;
    const under = Y1 - 0.045, edge = R + 0.1, rail = R + 0.05, top = Y1 + RAIL, geo = blank();
    // The ledger, the edge channel with its lit face, and the ring joist.
    K.sector(0, wall - 0.12, deep, a0, a1, Y1 - 0.6, under, S.steel);
    K.sector(0, R, edge, a0, a1, Y1 - 0.3, under, S.edge);
    K.sector(0, R - 0.01, R, a0, a1, Y1 - 0.2, Y1 - 0.17, PURPLE, { emissive: 1, glow: true });
    K.sector(0, mid - 0.05, mid + 0.05, a0, a1, under - 0.16, under, S.steel);
    const n = Math.round(span / BEAM);
    for (let k = 0; k <= n; k++) {
      const b = 180 + OPEN + span * k / n, d0 = under - 0.24, d1 = under - 0.55;
      // The beam: its web, deep at the wall, and its flanges top and bottom.
      member(geo, b, edge, deep, under, under, d0, d1, 0.02, S.steel);
      member(geo, b, edge, deep, under, under, under - 0.025, under - 0.025, 0.08, S.steel);
      member(geo, b, edge, deep, d0 + 0.025, d1 + 0.025, d0, d1, 0.08, S.steel);
      // The joint over it in the glass, and a downlight under the edge.
      member(geo, b, edge, wall, Y1 + 0.003, Y1 + 0.003, Y1 - 0.006, Y1 - 0.006, 0.012, S.joint);
      const lamp = polar(R + 0.35, b);
      K.cyl(0.07, 0.07, 0.03, S.steel, lamp.x, d0 - 0.005, lamp.z, { seg: 10 });
      K.cyl(0.05, 0.05, 0.01, S.lamp, lamp.x, d0 - 0.02, lamp.z, { seg: 10, emissive: 1, glow: true });
      if (i === 0 && !clearOfHangings(b)) continue;
      // The strut, from a plate on the wall (which leans in as the dome closes) up to the beam's underside a third of
      // the way out.
      const foot = polar(ROOMS.radiusAt(L, Y1 - 1.7) - 0.12, b), head = polar(wall - (wall - R) * 0.62, b), hy = d1 + (d0 - d1) * 0.62, fy = Y1 - 1.7;
      rod(K, [foot.x, fy, foot.z], [head.x, hy, head.z], 0.045, S.steel);
      K.group(foot.x, fy, foot.z, b * DEG + Math.PI).box(0.24, 0.34, 0.03, S.steel, 0, 0, 0.015);
    }
    K.add(geo);
    // The floor: one sheet of glass from the edge channel to the wall, its joint along the joist.
    const floor = K.node(`balconyGlass${i}`, (k) => k.sector(0, edge - 0.02, deep, a0, a1, under, Y1, S.glass), 0, 0, 0).geometry;
    floor.glass = GLASS; floor.castShadow = false;
    K.sector(0, mid - 0.012, mid + 0.012, a0, a1, Y1 - 0.006, Y1 + 0.003, S.joint);
    // The balustrade: its shoe, a pane a bay, and the cap; and across each end the same from the edge to the wall.
    K.sector(0, rail - 0.045, rail + 0.045, a0, a1, Y1, Y1 + 0.1, S.shoe);
    K.sector(0, rail - 0.028, rail + 0.028, a0, a1, top - 0.06, top, S.rail);
    const gap = 0.012 / rail;
    const panes = K.node(`balconyRail${i}`, (k) => {
      for (let j = 0; j < n; j++) {
        const b0 = a0 + (a1 - a0) * j / n, b1 = a0 + (a1 - a0) * (j + 1) / n;
        k.sector(0, rail - 0.008, rail + 0.008, b0 + gap, b1 - gap, Y1 + 0.1, top - 0.06, S.railGlass, { steps: 2 });
      }
      for (const b of [a0, a1]) {
        const g = k.group(0, 0, 0, b);
        g.box(0.016, RAIL - 0.16, wall - rail - 0.1, S.railGlass, 0, Y1 + 0.1 + (RAIL - 0.16) / 2, (rail + wall) / 2);
      }
    }, 0, 0, 0).geometry;
    panes.glass = RAIL_GLASS; panes.castShadow = false;
    for (const b of [a0, a1]) {
      const g = K.group(0, 0, 0, b);
      g.box(0.09, 0.1, wall - rail, S.shoe, 0, Y1 + 0.05, (rail + wall) / 2);
      g.box(0.056, 0.06, wall - rail, S.rail, 0, top - 0.03, (rail + wall) / 2);
    }
    // Collision: the deck, the balustrade along the edge and across the ends.
    const m = Math.ceil(span / SEG), step = span / m, half = (wall - R) / 2;
    for (let j = 0; j < m; j++) {
      const b = 180 + OPEN + (j + 0.5) * step, deck = polar((R + wall) / 2, b), at = polar(rail, b);
      K.solid({ x: deck.x, z: deck.z, hx: wall * Math.sin(step / 2 * DEG) + 0.05, hz: half, ry: b * DEG, top: Y1, below: Y0, deck: true });
      K.solid({ x: at.x, z: at.z, hx: rail * Math.sin(step / 2 * DEG) + 0.02, hz: 0.05, ry: b * DEG, top, below: Y1 });
    }
    for (const b of [a0, a1]) { const c = polar((R + wall) / 2, b / DEG); K.solid({ x: c.x, z: c.z, hx: 0.05, hz: half, ry: b, top, below: Y1 }); }
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
    let barStyle = "#fff", waveStyle = "#fff", glowStyle = "#fff", shape = null, step = 0;
    // The waterfall: the spectrum's history, newest at the booth and flowing out round both sides, a column a frame.
    const hist = CH.canvas(half, H), hc = hist.getContext("2d"), col = hc.createImageData(1, H), cpx = col.data, ca = [0, 0, 0], cb = [0, 0, 0];
    hc.fillStyle = "#06030b"; hc.fillRect(0, 0, half, H);
    // The rain: the hash's characters in the two colours (a column's head white over them), its trail a canvas of its own.
    const HEX = "0123456789abcdef", { COLS, CELL } = RAIN, glyphs = CH.canvas(16 * CELL, 3 * CELL), gc = glyphs.getContext("2d");
    const rain = CH.canvas(W, H), rc = rain.getContext("2d"), rowY = new Float32Array(COLS), rowV = new Float32Array(COLS), last = new Int16Array(COLS).fill(-1);
    for (let i = 0; i < COLS; i++) { rowY[i] = -Math.random() * 12; rowV[i] = 6 + Math.random() * 10; }
    // The wave's echo: the last frames' waves fading on a canvas of their own.
    const echo = CH.canvas(W, H), ec = echo.getContext("2d");
    // The skyline: each tower's width and height as a share of its slot, its windows a canvas of lit and unlit panes
    // (two of them, swapped on the beat), and the sky behind with its stars and the moon over the booth.
    const towerW = new Float32Array(CITY.TOWERS), towerH = new Float32Array(CITY.TOWERS), towerX = new Uint16Array(CITY.TOWERS);
    for (let i = 0; i < CITY.TOWERS; i++) { towerW[i] = 0.55 + 0.4 * Math.random(); towerH[i] = 0.45 + 0.55 * Math.random(); towerX[i] = Math.floor(Math.random() * (W - 64)); }
    const panes = [CH.canvas(W, H), CH.canvas(W, H)], sky = CH.canvas(W, H), sk = sky.getContext("2d");
    for (const [n, pane] of panes.entries()) {
      const pg = pane.getContext("2d");
      for (let y = 3; y < H; y += 5) for (let x = 2; x < W; x += 4) {
        const r = Math.random();
        if (r < (n ? 0.38 : 0.45)) { pg.fillStyle = r < 0.05 ? "#9fe7ff" : r < 0.3 ? "#ffd27a" : "#ffb04d"; pg.fillRect(x, y, 2, 3); }
      }
    }
    let bodyStyle = "#111";
    // The warp: each streak's distance out from the booth, its height and its speed.
    const starX = new Float32Array(WARP.STARS), starY = new Float32Array(WARP.STARS), starZ = new Float32Array(WARP.STARS);
    for (let i = 0; i < WARP.STARS; i++) { starX[i] = Math.random() * half; starY[i] = 4 + Math.random() * (H - 8); starZ[i] = 0.2 + Math.random(); }
    let streakStyles = ["#fff", "#fff", "#f4f2ff"];
    const colors = (a, bb) => {
      ca[0] = a[0]; ca[1] = a[1]; ca[2] = a[2]; cb[0] = bb[0]; cb[1] = bb[1]; cb[2] = bb[2];
      gc.clearRect(0, 0, 16 * CELL, 3 * CELL);
      [rgbStyle(a, 1.3), rgbStyle(bb, 1.3), "#f4f2ff"].forEach((ink, r) => {
        for (let i = 0; i < 16; i++) RM.paintKit.pix(gc, HEX[i], i * CELL + CELL / 2, r * CELL + CELL / 2, CELL * 0.75, ink);
      });
      const grad = ctx.createLinearGradient(0, H, 0, 0);
      grad.addColorStop(0, rgbStyle(a)); grad.addColorStop(1, rgbStyle(bb, 1.25));
      barStyle = grad; waveStyle = rgbStyle(bb, 1.3); glowStyle = rgbStyle(a, 0.9);
      const across = f.createLinearGradient(0, 0, W, 0);
      for (let i = 0; i <= 4; i++) across.addColorStop(i / 4, rgbStyle(i % 2 ? bb : a, 0.85));
      f.fillStyle = across; f.fillRect(0, 0, W, H);
      const fade = f.createLinearGradient(0, 0, 0, H);
      fade.addColorStop(0, "rgba(6,3,11,0.85)"); fade.addColorStop(0.5, "rgba(6,3,11,0)"); fade.addColorStop(1, "rgba(6,3,11,0.6)");
      f.fillStyle = fade; f.fillRect(0, 0, W, H);
      bodyStyle = rgbStyle(a, 0.16); streakStyles = [rgbStyle(a, 1.35), rgbStyle(bb, 1.35), "#f4f2ff"];
      // The skyline's sky: dark at the top into the room's colour at the horizon, stars, and the moon over the booth.
      const dusk = sk.createLinearGradient(0, 0, 0, H);
      dusk.addColorStop(0, "#05030a"); dusk.addColorStop(1, rgbStyle(bb, 0.35));
      sk.fillStyle = dusk; sk.fillRect(0, 0, W, H);
      for (let i = 0; i < 260; i++) { sk.fillStyle = i % 9 ? "rgba(244,242,255,0.55)" : "#ffffff"; sk.fillRect(Math.random() * W, Math.random() * H * 0.7, i % 9 ? 1 : 2, i % 9 ? 1 : 2); }
      sk.fillStyle = "#f6f0d8"; sk.beginPath(); sk.arc(half, 22, 13, 0, TAU); sk.fill();
      sk.fillStyle = "rgba(246,240,216,0.12)"; sk.beginPath(); sk.arc(half, 22, 24, 0, TAU); sk.fill();
    };
    const drawWave = (alpha, width, style, to = ctx) => {
      to.globalAlpha = alpha; to.strokeStyle = style; to.lineWidth = width;
      to.beginPath();
      for (let i = 0; i < WAVE; i++) {
        const x = i / (WAVE - 1) * W, y = H / 2 - Math.max(-1, Math.min(1, shape[i])) * H * 0.4;
        if (i) to.lineTo(x, y); else to.moveTo(x, y);
      }
      to.stroke();
    };
    const draw = (look, alpha, M) => {
      if (alpha <= 0.002) return;
      if (look === WALLS.WATERFALL) {
        hc.drawImage(hist, 1, 0);
        for (let y = 0; y < H; y++) {
          const v = level[Math.min(BARS - 1, Math.floor((H - 1 - y) * BARS / H))], g = 0.08 + 1.1 * v * v, o = y * 4;
          cpx[o] = Math.min(255, (ca[0] + (cb[0] - ca[0]) * v) * g * 255); cpx[o + 1] = Math.min(255, (ca[1] + (cb[1] - ca[1]) * v) * g * 255);
          cpx[o + 2] = Math.min(255, (ca[2] + (cb[2] - ca[2]) * v) * g * 255); cpx[o + 3] = 255;
        }
        hc.putImageData(col, 0, 0);
        ctx.globalAlpha = alpha;
        ctx.drawImage(hist, half, 0);
        ctx.save(); ctx.translate(half, 0); ctx.scale(-1, 1); ctx.drawImage(hist, 0, 0); ctx.restore();
        ctx.drawImage(gaps, 0, 0);
      } else if (look === WALLS.HASHES) {
        // The trail fades; each column's head writes a character as it reaches a new row, faster the louder the bass.
        rc.globalCompositeOperation = "destination-out"; rc.fillStyle = "#000"; rc.globalAlpha = Math.min(1, step * RAIN.FADE);
        rc.fillRect(0, 0, W, H);
        rc.globalCompositeOperation = "source-over"; rc.globalAlpha = 1;
        const pitch = W / COLS, rows = Math.ceil(H / CELL), boost = 0.5 + M.I + 1.5 * level[2];
        for (let i = 0; i < COLS; i++) {
          rowY[i] += rowV[i] * boost * step;
          const r = Math.floor(rowY[i]);
          if (r > rows + 4) { rowY[i] = -Math.random() * 10; rowV[i] = 6 + Math.random() * 10; last[i] = -1; continue; }
          if (r === last[i] || r < 0) continue;
          if (last[i] >= 0 && last[i] < rows) {
            const k = HEX.indexOf(M.hash[(i * 7 + last[i]) % 64] || "0"), g = i % 3 === 0 ? 1 : 0;
            rc.drawImage(glyphs, k * CELL, g * CELL, CELL, CELL, i * pitch, last[i] * CELL, CELL, CELL);
          }
          last[i] = r;
          if (r < rows) {
            const k = HEX.indexOf(M.hash[(i * 7 + r) % 64] || "0");
            rc.drawImage(glyphs, k * CELL, 2 * CELL, CELL, CELL, i * pitch, r * CELL, CELL, CELL);
          }
        }
        ctx.globalAlpha = alpha; ctx.drawImage(rain, 0, 0);
      } else if (look === WALLS.WAVE) {
        // Its echo: the last waves fading behind it, longer while the music is soft.
        ec.globalCompositeOperation = "destination-out"; ec.fillStyle = "#000"; ec.globalAlpha = Math.min(1, step * (3 + 5 * M.I));
        ec.fillRect(0, 0, W, H);
        ec.globalCompositeOperation = "source-over";
        drawWave(0.8, 1.5, glowStyle, ec);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = alpha * 0.55; ctx.drawImage(echo, 0, 0);
        drawWave(alpha * 0.25, 7, glowStyle); drawWave(alpha * (0.55 + 0.35 * M.I), 2, waveStyle);
        ctx.globalCompositeOperation = "source-over";
      } else if (look === WALLS.SKYLINE) {
        // A city each way from the booth under its sky: a tower a band of the spectrum, as tall as that band is loud, its
        // windows lit (another set on every other beat), a lamp on every fourth roof blinking on the beat.
        ctx.globalAlpha = alpha; ctx.drawImage(sky, 0, 0);
        const n = CITY.TOWERS, slot = half / n, pane = panes[Math.floor(M.beat) & 1], blink = M.beat - Math.floor(M.beat) < 0.3;
        for (let i = 0; i < n; i++) {
          const v = level[Math.floor(i * BARS / n)], tw = Math.max(3, Math.round(slot * towerW[i])), th = Math.max(6, Math.round((0.16 + 0.84 * v) * (H - 12) * towerH[i]));
          const x = Math.round(half + i * slot + (slot - tw) / 2), mx = W - x - tw, yy = H - th;
          ctx.fillStyle = bodyStyle; ctx.fillRect(x, yy, tw, th); ctx.fillRect(mx, yy, tw, th);
          ctx.drawImage(pane, towerX[i], yy, tw, th, x, yy, tw, th);
          ctx.drawImage(pane, towerX[(i + 7) % n], yy, tw, th, mx, yy, tw, th);
          if (i % 4 === 1 && th > 20) {
            ctx.fillStyle = blink ? "#ff3a3a" : "#5a1a1a";
            ctx.fillRect(x + (tw >> 1) - 1, yy - 4, 2, 4); ctx.fillRect(mx + (tw >> 1) - 1, yy - 4, 2, 4);
          }
        }
      } else if (look === WALLS.WARP) {
        // Hyperspace out from the booth: streaks rushing out both ways, faster and longer the harder the music and on the
        // kick, and chevrons flying out on every beat.
        const speed = (70 + 520 * M.I) * (1 + 1.6 * M.kick);
        ctx.globalCompositeOperation = "lighter";
        for (let g = 0; g < 3; g++) {
          ctx.fillStyle = streakStyles[g];
          for (let i = g; i < WARP.STARS; i += 3) {
            starX[i] += speed * step * starZ[i] * (0.25 + starX[i] / half);
            if (starX[i] > half) { starX[i] = Math.random() * 40; starY[i] = 4 + Math.random() * (H - 8); starZ[i] = 0.2 + Math.random(); }
            const len = 2 + speed * 0.04 * starZ[i] * (0.3 + starX[i] / half), out = starX[i] / half;
            ctx.globalAlpha = alpha * Math.min(1, 0.15 + out * 1.4);
            const th = starZ[i] > 0.9 ? 2 : 1;
            ctx.fillRect(half + starX[i], starY[i], len, th); ctx.fillRect(half - starX[i] - len, starY[i], len, th);
          }
        }
        ctx.fillStyle = streakStyles[1];
        for (let c = 0; c < WARP.CHEVRONS; c++) {
          const p = (M.beat - Math.floor(M.beat) + c) / WARP.CHEVRONS, x = half + 30 + p * (half - 60), s = 10 + 22 * p;
          ctx.globalAlpha = alpha * (1 - p) * (0.5 + 0.5 * M.I);
          for (let dir = 1; dir >= -1; dir -= 2) {
            const cx = dir > 0 ? x : W - x;
            const bx = cx - dir * s * 0.5, tx = cx + dir * s * 0.5, th = dir * s * 0.45;
            ctx.beginPath(); ctx.moveTo(bx, H / 2 - s); ctx.lineTo(bx + th, H / 2 - s); ctx.lineTo(tx + th, H / 2); ctx.lineTo(bx + th, H / 2 + s);
            ctx.lineTo(bx, H / 2 + s); ctx.lineTo(tx, H / 2); ctx.closePath(); ctx.fill();
          }
        }
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
      shape = wave; step = dt;
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
  // What the radio plays, as its station's feed names it: the station's name and the song (empty when the feed names
  // none, and then the picture under the block is put away). The room's `animate` keeps it current.
  const playing = { station: "", song: "" };
  const songKey = () => playing.song ? `${playing.station}|${playing.song}` : "";
  // Under the latest block: the station in the island's letters and the song in plain type, fitted to the width.
  const paintSong = (ctx, w, h) => {
    const P = RM.paintKit;
    ctx.fillStyle = C.ink; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = PURPLE; ctx.lineWidth = h * 0.06; P.roundRect(ctx, h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12, h * 0.16);
    ctx.stroke();
    if (!playing.song) return;
    const title = `NOW PLAYING · ${playing.station}`;
    P.pix(ctx, title, w / 2, h * 0.3, Math.min(h * 0.19, w * 0.8 / P.pixWidth(title, 1)), "#c9a6ff");
    ctx.fillStyle = "#f4ecff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    P.fit(ctx, playing.song, w * 0.86, 700, h * 0.32);
    ctx.fillText(playing.song, w / 2, h * 0.67);
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

  // ---------- the DJ's gear ----------
  // One club rig across the booth's top, built in a frame whose +z runs toward the DJ behind it (their right +x): a
  // four-channel mixer between two big media players, butted together on one plinth lit along its front. Each player
  // has its touch screen standing up at the back, its hot cue pads, a big jog wheel with a screen in its middle, the
  // play button in its lit ring and its tempo fader; the mixer its channels' knobs, meters, colour knobs,
  // cue buttons and faders, the crossfader, its FX screen and beat lamps, and an antenna. Beside it a laptop showing
  // the radio's station and song, and headphones. What moves is its own node: the jog wheels and their screens turn,
  // the meters, beat lamps and the players' play rings light with the music.
  const GEAR = { black: "#111115", panel: "#1b1b21", edge: "#2c2c34", silver: "#b4b4bc", rubber: "#08080a", knob: "#24242a",
    cap: "#c8c8d0", tick: "#ececf4", screen: "#06080f", button: "#2e2e36" };
  const RIG = { H: 0.11, D: 0.56, PW: 0.46, MW: 0.54, GAP: 0.006, BASE: 0.03 };
  const METER = { SEGS: 10, GREEN: 7, AMBER: 2 };
  const PADS = ["#ff3d6e", "#ff9b2e", "#ffe14d", "#4dff88", "#3dd9ff", "#4d7aff", "#b44dff", "#ff4de1"];
  // Geometries shared by every copy (a meter's segments, the players' rings), made once.
  const gearParts = new Map();
  const gearPart = (key, build) => {
    if (!gearParts.has(key)) { const g = RM.solo(build); g.castShadow = false; gearParts.set(key, g); }
    return gearParts.get(key);
  };
  const knob = (G, x, y, z, r, color) => {
    G.cyl(r, r * 1.08, r * 1.4, color, x, y + r * 0.7, z, { seg: 12 });
    G.box(r * 0.18, 0.002, r * 0.75, GEAR.tick, x, y + r * 1.42, z - r * 0.4);
  };
  // A slot with its cap, along z (or along x with `across`); `at` is where the cap stands, -1 to 1.
  const fader = (G, x, y, z, len, across, at) => {
    G.box(across ? len : 0.006, 0.002, across ? 0.006 : len, GEAR.rubber, x, y + 0.001, z);
    const cx = across ? x + at * len / 2 : x, cz = across ? z : z + at * len / 2;
    G.box(across ? 0.014 : 0.03, 0.016, across ? 0.026 : 0.014, GEAR.cap, cx, y + 0.008, cz);
    G.box(across ? 0.003 : 0.022, 0.002, across ? 0.02 : 0.003, GEAR.tick, cx, y + 0.0165, cz);
  };
  // A tube from a to b, a cylinder `r` round: the kit turns a part about z, then x (its y axis then runs along
  // (-sin rz, cos rx cos rz, sin rx cos rz)).
  const rod = (G, a, b, r, color) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l = Math.hypot(dx, dy, dz);
    G.cyl(r, r, l, color, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, { seg: 6, rz: Math.asin(-dx / l), rx: Math.atan2(dz, dy) });
  };
  // A media player's screen, as the image shows one: its tabs, the track, the waveform with its playhead, the time,
  // tempo and BPM, and the track's overview.
  const playerScreen = (i) => (ctx, w, h) => {
    const rand = RM.paintKit.rng(31 + i), P = RM.paintKit;
    ctx.fillStyle = GEAR.screen; ctx.fillRect(0, 0, w, h);
    ["SOURCE", "BROWSE", "TAG LIST", "PLAYLIST", "SEARCH", "MENU"].forEach((t, k) => {
      const x = w * (0.03 + k * 0.16);
      ctx.fillStyle = k === 1 ? "#24406e" : "#1e2230"; ctx.fillRect(x, h * 0.03, w * 0.14, h * 0.07);
      P.pix(ctx, t, x + w * 0.07, h * 0.067, Math.min(h * 0.035, w * 0.12 / P.pixWidth(t, 1)), "#c9d8ff");
    });
    P.pix(ctx, i ? "BLOCK 2 · OOGA DUB" : "BLOCK 1 · HALVING", w * 0.04, h * 0.16, h * 0.05, "#e8eeff", "left");
    for (let x = 0; x < w; x++) {
      const a = (0.2 + 0.8 * rand()) * (0.45 + 0.55 * Math.abs(Math.sin(x * 0.03 + i))), mid = h * 0.4;
      ctx.fillStyle = a > 0.78 ? "#e6f6ff" : a > 0.4 ? "#3fa2ff" : "#1d5fbf";
      ctx.fillRect(x, mid - a * h * 0.17, 1, a * h * 0.34);
    }
    ctx.fillStyle = "#ff8a3d"; ctx.fillRect(w * 0.5 - 1, h * 0.2, 2, h * 0.4);
    ctx.fillStyle = "#1e2230"; ctx.fillRect(w * 0.03, h * 0.63, w * 0.94, h * 0.14);
    P.pix(ctx, i ? "02" : "01", w * 0.07, h * 0.7, h * 0.08, "#ffffff");
    P.pix(ctx, i ? "02:35.503" : "04:12.091", w * 0.33, h * 0.7, h * 0.075, "#ffffff");
    P.pix(ctx, "-0.05%", w * 0.62, h * 0.7, h * 0.05, "#c9d8ff");
    ctx.strokeStyle = "#c9d8ff"; ctx.lineWidth = 2; ctx.strokeRect(w * 0.76, h * 0.645, w * 0.19, h * 0.11);
    P.pix(ctx, "124.0", w * 0.855, h * 0.7, h * 0.06, "#ffffff");
    for (let x = 0; x < w * 0.94; x += 2) {
      const a = 0.25 + 0.75 * rand();
      ctx.fillStyle = x < w * (i ? 0.31 : 0.58) ? "#5d6c8a" : "#9ad0ff";
      ctx.fillRect(w * 0.03 + x, h * 0.93 - a * h * 0.1, 1.5, a * h * 0.1);
    }
  };
  // The mixer's FX screen: the effect, its tempo and its beat.
  const fxScreen = (ctx, w, h) => {
    const P = RM.paintKit;
    ctx.fillStyle = GEAR.screen; ctx.fillRect(0, 0, w, h);
    P.pix(ctx, "124 BPM", w * 0.95, h * 0.14, h * 0.11, "#c9d8ff", "right");
    ctx.fillStyle = "#e8e8f0"; ctx.fillRect(w * 0.06, h * 0.28, w * 0.88, h * 0.22);
    P.pix(ctx, "FLANGER", w / 2, h * 0.39, h * 0.15, "#06080f");
    ctx.fillStyle = "#3a8cff"; ctx.fillRect(w * 0.06, h * 0.58, w * 0.42, h * 0.16); ctx.fillRect(w * 0.52, h * 0.58, w * 0.42, h * 0.16);
    P.pix(ctx, "1/2", w * 0.27, h * 0.66, h * 0.1, "#ffffff"); P.pix(ctx, "BEAT", w * 0.73, h * 0.66, h * 0.1, "#ffffff");
    P.pix(ctx, "OOGA DJ", w / 2, h * 0.88, h * 0.1, "#9a5cff");
  };
  // A round button in a lit ring, `r` round, the ring's colour lit by its node.
  const ringButton = (key, r, color) => gearPart(key, (k) => {
    k.torus(r, r * 0.16, color, 0, 0, 0, { emissive: 1, glow: true, seg: 20, sides: 5 });
    k.cyl(r * 0.82, r * 0.82, 0.008, GEAR.button, 0, 0, 0, { seg: 18 });
  });
  const player = (G, x, i) => {
    const W = RIG.PW, D = RIG.D, top = RIG.H, z0 = -D / 2;
    G.box(W, top, D, GEAR.black, x, top / 2, 0);
    G.box(W - 0.014, 0.003, D - 0.014, GEAR.panel, x, top + 0.0015, 0);
    // The touch screen standing up at the back in its bezel, leaning away from the DJ.
    const lean = -0.35, sh = 0.26, sw = 0.4, cy = top + 0.02 + sh / 2 * Math.cos(lean), cz = z0 + 0.06 + sh / 2 * Math.sin(lean);
    G.box(sw + 0.024, sh + 0.024, 0.014, GEAR.black, x, cy, cz - 0.008, { rx: lean });
    G.box(sw * 0.8, 0.03, 0.05, GEAR.black, x, top + 0.015, z0 + 0.04);
    G.picture(sw, sh, DECK.W, DECK.H, playerScreen(i), x, cy, cz, { name: `deckScreen${i}`, rx: lean, emissive: 0.85 });
    // The hot cue pads under it, the loop buttons and the USB slots down its left.
    for (let k = 0; k < 8; k++) {
      const px = x - 0.16 + k * 0.042;
      G.box(0.034, 0.008, 0.02, GEAR.button, px, top + 0.004, z0 + 0.135);
      G.box(0.034, 0.003, 0.004, PADS[k], px, top + 0.009, z0 + 0.124, { emissive: 0.9, glow: true });
    }
    for (let k = 0; k < 3; k++) G.box(0.03, 0.006, 0.02, GEAR.button, x - W / 2 + 0.035, top + 0.003, z0 + 0.19 + k * 0.035);
    for (const k of [0, 1]) G.torus(0.013, 0.003, "#ff9b2e", x - W / 2 + 0.08 + k * 0.035, top + 0.004, z0 + 0.19, { emissive: 0.8, glow: true, seg: 12, sides: 4 });
    G.box(0.05, 0.006, 0.014, GEAR.rubber, x - W / 2 + 0.04, top + 0.003, z0 + 0.03);
    // The jog wheel: a silver rim round its knurled platter, its screen in the middle.
    const jx = x - 0.02, jz = 0.085;
    G.cyl(0.178, 0.178, 0.01, GEAR.edge, jx, top + 0.005, jz, { seg: 40 });
    G.torus(0.168, 0.008, GEAR.silver, jx, top + 0.014, jz, { seg: 40, sides: 6 });
    G.node(`record${i}`, (k) => {
      k.cyl(0.155, 0.157, 0.016, "#16161a", 0, 0, 0, { seg: 40 });
      for (let d = 0; d < 48; d++) { const a = TAU * d / 48; k.box(0.004, 0.004, 0.014, "#3a3a44", 0.142 * Math.sin(a), 0.009, 0.142 * Math.cos(a), { ry: a }); }
    }, jx, top + 0.016, jz, { target: { kind: "decks", tip: "Media player", radius: 0.3, data: { say: "Two decks and a mixer, and the bass drops on every block" } } });
    G.node(`jog${i}`, (k) => {
      k.cyl(0.062, 0.062, 0.004, "#0b1530", 0, 0, 0, { seg: 24 });
      k.torus(0.06, 0.004, "#3a8cff", 0, 0.002, 0, { emissive: 1, glow: true, seg: 24, sides: 4 });
      k.torus(0.04, 0.003, "#9a5cff", 0, 0.002, 0, { emissive: 1, glow: true, seg: 20, sides: 4 });
      k.box(0.008, 0.003, 0.03, "#ffffff", 0, 0.003, 0.043, { emissive: 1, glow: true });
    }, jx, top + 0.026, jz, { glow: true });
    // The play button in its ring, bottom left.
    G.node(`play${i}`, ringButton("play", 0.028, "#3dff7a"), x - W / 2 + 0.05, top + 0.006, D / 2 - 0.05, { glow: true });
    // The tempo fader and its buttons down the right, the sync buttons and jog knob over it.
    fader(G, x + W / 2 - 0.04, top, 0.135, 0.2, false, -0.1);
    for (let k = 0; k < 3; k++) G.box(0.036, 0.008, 0.02, k === 1 ? "#ff9b2e" : GEAR.button, x + W / 2 - 0.04, top + 0.004, -0.02 + k * 0.026, { emissive: k === 1 ? 0.6 : 0 });
    knob(G, x + W / 2 - 0.04, top, -0.1, 0.012, GEAR.knob);
  };
  const mixer = (G) => {
    const W = RIG.MW, D = RIG.D, top = RIG.H, z0 = -D / 2;
    G.box(W, top, D, GEAR.black, 0, top / 2, 0);
    G.box(W - 0.014, 0.003, D - 0.014, GEAR.panel, 0, top + 0.0015, 0);
    for (const sx of [-1, 1]) G.box(0.004, 0.003, D - 0.06, GEAR.edge, sx * 0.165, top + 0.0015, 0.0);
    // The USB slots and the antenna at the back.
    for (const sx of [-1, 1]) {
      G.box(0.05, 0.008, 0.022, GEAR.rubber, sx * 0.21 + (sx < 0 ? 0.03 : -0.03) - 0.03, top + 0.004, z0 + 0.04);
      G.box(0.05, 0.002, 0.003, "#3a8cff", sx * 0.21 + (sx < 0 ? 0.03 : -0.03) - 0.03, top + 0.005, z0 + 0.054, { emissive: 1, glow: true });
    }
    G.cyl(0.004, 0.006, 0.2, GEAR.black, -W / 2 + 0.04, top + 0.1, z0 + 0.02, { seg: 6 });
    // The mic section down the left.
    for (let k = 0; k < 4; k++) knob(G, -0.215, top, z0 + 0.12 + k * 0.06, 0.012, GEAR.knob);
    for (let k = 0; k < 3; k++) G.box(0.026, 0.006, 0.016, GEAR.button, -0.215, top + 0.003, z0 + 0.38 + k * 0.03);
    [-0.12, -0.04, 0.04, 0.12].forEach((x, c) => {
      for (let k = 0; k < 4; k++) knob(G, x - 0.008, top, z0 + 0.09 + k * 0.045, 0.012, k ? GEAR.knob : GEAR.cap);
      // The channel's meter beside its knobs, bottom toward the DJ: a dark strip with its segments over it.
      G.box(0.009, 0.002, 0.15, GEAR.rubber, x + 0.026, top + 0.001, z0 + 0.155);
      for (let i = 0; i < METER.SEGS; i++) {
        const color = i < METER.GREEN ? "#3dffb0" : i < METER.GREEN + METER.AMBER ? "#ffb020" : "#ff3030";
        G.node(`meter${c}_${i}`, gearPart(`seg${color}`, (k) => k.box(0.007, 0.003, 0.01, color, 0, 0, 0, { emissive: 1, glow: true })), x + 0.026, top + 0.003, z0 + 0.222 - i * 0.0145, { glow: true });
      }
      knob(G, x, top, z0 + 0.3, 0.02, GEAR.knob);
      G.torus(0.026, 0.002, PADS[(c * 2 + 3) % 8], x, top + 0.002, z0 + 0.3, { emissive: 0.6, glow: true, seg: 16, sides: 3 });
      G.box(0.03, 0.008, 0.018, GEAR.button, x, top + 0.004, z0 + 0.35);
      G.box(0.03, 0.002, 0.004, "#ff9b2e", x, top + 0.009, z0 + 0.343, { emissive: 0.8, glow: true });
      fader(G, x, top, z0 + 0.43, 0.1, false, 0.5 - c * 0.3);
    });
    fader(G, 0, top, D / 2 - 0.035, 0.16, true, 0);
    // The master section down the right: its knob, the FX screen with the beat lamps under it, the FX knobs and the
    // big lit FX button.
    knob(G, 0.205, top, z0 + 0.06, 0.014, GEAR.cap);
    G.picture(0.09, 0.07, FXS.W, FXS.H, fxScreen, 0.205, top + 0.004, z0 + 0.14, { name: "fxScreen", rx: -Math.PI / 2, emissive: 0.85 });
    for (let i = 0; i < 4; i++) G.node(`beat${i}`, gearPart("beatLamp", (k) => k.box(0.016, 0.003, 0.008, "#ffd34d", 0, 0, 0, { emissive: 1, glow: true })), 0.178 + i * 0.018, top + 0.002, z0 + 0.19, { glow: true });
    for (let k = 0; k < 3; k++) knob(G, 0.205, top, z0 + 0.24 + k * 0.06, 0.013, GEAR.knob);
    G.node("fxOn", ringButton("fxOn", 0.022, "#3a8cff"), 0.205, top + 0.006, D / 2 - 0.05, { glow: true });
  };
  // The laptop's screen, a DJ library: the stations down the side with the one playing lit, the station and what it
  // plays (a dash while its feed names nothing) over two decks' waveforms, the tempo, and a track list. Repainted by the
  // room as either changes.
  const LAPTOP = { W: 768, H: 480 };
  const paintLaptop = (ctx, station, song) => {
    const P = RM.paintKit, w = LAPTOP.W, h = LAPTOP.H, rand = P.rng(57), side = w * 0.24, x0 = side + w * 0.02, cw = w - x0 - w * 0.02;
    const stations = BL.timechainPartyRadio ? BL.timechainPartyRadio.STATIONS : [];
    ctx.fillStyle = "#0a0d16"; ctx.fillRect(0, 0, w, h);
    // The title bar: the app, the clock and the master level.
    ctx.fillStyle = "#151a28"; ctx.fillRect(0, 0, w, h * 0.07);
    P.pix(ctx, "OOGA RADIO", w * 0.02, h * 0.035, h * 0.035, "#9a5cff", "left");
    P.pix(ctx, "ON AIR", w * 0.6, h * 0.035, h * 0.03, "#ff4d6e");
    for (let k = 0; k < 16; k++) { ctx.fillStyle = k < 11 ? "#3dffb0" : k < 14 ? "#ffb020" : "#3a2020"; ctx.fillRect(w * 0.76 + k * w * 0.013, h * 0.022, w * 0.009, h * 0.026); }
    // The side: the library and the stations.
    ctx.fillStyle = "#10141f"; ctx.fillRect(0, h * 0.07, side, h * 0.93);
    P.pix(ctx, "COLLECTION", w * 0.02, h * 0.11, h * 0.026, "#7f8bb0", "left");
    P.pix(ctx, "STATIONS", w * 0.02, h * 0.17, h * 0.026, "#7f8bb0", "left");
    stations.forEach((s, k) => {
      const y = h * (0.21 + k * 0.055), on = s.name === station;
      if (on) { ctx.fillStyle = "#2a1f4a"; ctx.fillRect(0, y - h * 0.022, side, h * 0.044); ctx.fillStyle = "#9a5cff"; ctx.fillRect(0, y - h * 0.022, w * 0.005, h * 0.044); }
      P.pix(ctx, s.short, w * 0.025, y, h * 0.024, on ? "#ffffff" : "#aab4d4", "left");
    });
    P.pix(ctx, "HISTORY", w * 0.02, h * 0.55, h * 0.026, "#7f8bb0", "left");
    P.pix(ctx, "PLAYLISTS", w * 0.02, h * 0.61, h * 0.026, "#7f8bb0", "left");
    for (let k = 0; k < 4; k++) { ctx.fillStyle = "#2a3248"; ctx.fillRect(w * 0.035, h * (0.65 + k * 0.045), side * (0.4 + 0.4 * rand()), h * 0.014); }
    // Now playing: the station and the song.
    ctx.fillStyle = "#c9a6ff"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    P.fit(ctx, station || "Tuning in", cw, 700, h * 0.06);
    ctx.fillText(station || "Tuning in", x0, h * 0.12);
    ctx.fillStyle = "#f4ecff";
    P.fit(ctx, song || "—", cw, 600, h * 0.05);
    ctx.fillText(song || "—", x0, h * 0.19);
    // The two decks: each a waveform with its playhead, its number and its tempo.
    for (let d = 0; d < 2; d++) {
      const y = h * (0.3 + d * 0.13), hi = d ? "#ffd0a0" : "#e6f6ff", mid = d ? "#ff8a3d" : "#3fa2ff";
      ctx.fillStyle = "#121828"; ctx.fillRect(x0, y - h * 0.055, cw, h * 0.11);
      for (let x = 0; x < cw - w * 0.08; x++) {
        const a = (0.2 + 0.8 * rand()) * (0.45 + 0.55 * Math.abs(Math.sin(x * 0.035 + d * 2)));
        ctx.fillStyle = a > 0.78 ? hi : mid;
        ctx.fillRect(x0 + w * 0.07 + x, y - a * h * 0.045, 1, a * h * 0.09);
      }
      ctx.fillStyle = "#ffffff"; ctx.fillRect(x0 + w * 0.07 + (cw - w * 0.08) / 2, y - h * 0.05, 2, h * 0.1);
      P.pix(ctx, `${d + 1}`, x0 + w * 0.02, y - h * 0.02, h * 0.035, mid);
      P.pix(ctx, "124.0", x0 + w * 0.035, y + h * 0.03, h * 0.022, "#c9d8ff");
    }
    // The track list: a header and rows of artists, titles, tempos and keys.
    const ty = h * 0.5;
    ctx.fillStyle = "#1a2134"; ctx.fillRect(x0, ty, cw, h * 0.05);
    ["#", "TITLE", "ARTIST", "BPM", "KEY"].forEach((t, k) => P.pix(ctx, t, x0 + cw * [0.02, 0.1, 0.5, 0.8, 0.92][k], ty + h * 0.025, h * 0.022, "#7f8bb0", "left"));
    for (let r = 0; r < 8; r++) {
      const y = ty + h * (0.055 + r * 0.055);
      ctx.fillStyle = r === 2 ? "#24406e" : r % 2 ? "#0e1320" : "#111726"; ctx.fillRect(x0, y, cw, h * 0.05);
      P.pix(ctx, `${r + 1}`, x0 + cw * 0.02, y + h * 0.025, h * 0.02, "#7f8bb0", "left");
      ctx.fillStyle = r === 2 ? "#c9d8ff" : "#4a5a7a";
      ctx.fillRect(x0 + cw * 0.1, y + h * 0.018, cw * (0.18 + 0.18 * rand()), h * 0.014);
      ctx.fillRect(x0 + cw * 0.5, y + h * 0.018, cw * (0.12 + 0.14 * rand()), h * 0.014);
      P.pix(ctx, `${120 + Math.floor(rand() * 10)}`, x0 + cw * 0.8, y + h * 0.025, h * 0.02, "#aab4d4", "left");
      P.pix(ctx, `${1 + Math.floor(rand() * 12)}A`, x0 + cw * 0.92, y + h * 0.025, h * 0.02, PADS[r], "left");
    }
  };
  // A laptop on its stand, its back toward the dancers, black like the decks: its body with a backlit keyboard, a trackpad and speaker
  // grilles, ports down its side, the lid on its hinge with a black bezel, a camera and the screen, a glowing logo on
  // its back, and a cable across the desk into the player beside it.
  const laptop = (G, x, z, plug) => {
    const slate = "#17171c", stand = GEAR.edge, tilt = 0.32, lean = -0.57;
    // The stand: two side plates on the desk rising toward the back, a top plate under the laptop and a front lip.
    for (const sx of [-1, 1]) {
      rod(G, [x + sx * 0.13, 0.004, z + 0.1], [x + sx * 0.13, 0.11, z - 0.11], 0.006, stand);
      rod(G, [x + sx * 0.13, 0.004, z + 0.1], [x + sx * 0.13, 0.004, z - 0.12], 0.005, stand);
      rod(G, [x + sx * 0.13, 0.004, z - 0.12], [x + sx * 0.13, 0.11, z - 0.11], 0.005, stand);
    }
    const D = G.group(x, 0.072, z, 0, tilt);
    D.box(0.3, 0.004, 0.22, stand, 0, -0.012, 0);
    D.box(0.3, 0.018, 0.008, stand, 0, -0.002, 0.112);
    // The body: its slate shell, rubber feet, the keyboard well with its backlight and keys, the trackpad, grilles
    // either side of the keys and ports down the left side.
    D.box(0.34, 0.016, 0.24, slate, 0, 0, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) D.box(0.02, 0.003, 0.012, GEAR.rubber, sx * 0.14, -0.009, sz * 0.1);
    D.box(0.29, 0.002, 0.118, "#0b0b0e", 0, 0.008, -0.04);
    D.box(0.286, 0.0015, 0.114, "#7a4dff", 0, 0.0088, -0.04, { emissive: 0.5, glow: true });
    for (let row = 0; row < 5; row++) for (let k = 0; k < 13; k++) {
      const kx = -0.13 + k * 0.0217 + (row % 2) * 0.005, kz = -0.088 + row * 0.022;
      if (row === 4 && k > 3 && k < 9) continue;
      D.box(0.018, 0.004, 0.018, "#0e0e12", kx, 0.0105, kz);
    }
    D.box(0.1, 0.004, 0.018, "#0e0e12", 0, 0.0105, 0.0);
    D.box(0.11, 0.002, 0.07, "#24242c", 0, 0.0085, 0.072);
    for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) D.box(0.008, 0.002, 0.004, "#24242c", sx * 0.158, 0.0085, -0.09 + k * 0.018);
    for (let k = 0; k < 3; k++) D.box(0.002, 0.006, 0.012, k ? "#121218" : "#3a8cff", -0.171, 0, -0.06 + k * 0.03, { emissive: k ? 0 : 0.8 });
    // The lid on its hinge, leaning back; its picture's node turns by the deck's tilt and the lid's lean together.
    D.cyl(0.008, 0.008, 0.28, slate, 0, 0.006, -0.12, { rz: Math.PI / 2, seg: 10 });
    const Lg = D.group(0, 0.008, -0.12, 0, lean);
    Lg.box(0.34, 0.232, 0.008, slate, 0, 0.116, -0.004);
    Lg.box(0.334, 0.226, 0.002, "#08080c", 0, 0.116, 0.001);
    Lg.ball(0.003, "#3a3a44", 0, 0.222, 0.0025, { seg: 6 });
    Lg.cyl(0.03, 0.03, 0.002, "#ff9b2e", 0, 0.125, -0.009, { rx: Math.PI / 2, emissive: 1, glow: true, seg: 20 });
    Lg.torus(0.038, 0.003, "#ffd34d", 0, 0.125, -0.0085, { rx: Math.PI / 2, emissive: 0.8, glow: true, seg: 20, sides: 3 });
    const canvas = CH.canvas(LAPTOP.W, LAPTOP.H);
    paintLaptop(canvas.getContext("2d"), "", "");
    Lg.node("laptopScreen", RM.flatPicture(canvas, 0.31, 0.194, 0.85), 0, 0.12, 0.0025, { rx: tilt + lean, glow: true });
    // The cable from its right side down across the desk and into the player.
    const a = [x + 0.171, 0.072 + 0.02 * Math.sin(tilt), z - 0.02 * Math.cos(tilt)];
    const pts = [a, [a[0] + 0.03, 0.02, a[2]], [a[0] + 0.06, 0.004, a[2] - 0.04], [plug[0] - 0.05, 0.004, plug[2]], plug];
    for (let k = 1; k < pts.length; k++) rod(G, pts[k - 1], pts[k], 0.0035, "#18181e");
  };
  const headphones = (G, x, z) => {
    for (const sx of [-1, 1]) {
      G.cyl(0.05, 0.05, 0.04, GEAR.black, x + sx * 0.08, 0.05, z, { rz: Math.PI / 2, seg: 16 });
      G.cyl(0.04, 0.04, 0.012, GEAR.rubber, x + sx * 0.055, 0.05, z, { rz: Math.PI / 2, seg: 14 });
      G.torus(0.035, 0.003, "#9a5cff", x + sx * 0.101, 0.05, z, { rz: Math.PI / 2, emissive: 0.8, glow: true, seg: 14, sides: 3 });
    }
    G.torus(0.095, 0.01, GEAR.edge, x, 0.05, z, { rx: Math.PI / 2, seg: 24, sides: 5 });
  };
  // ---------- the gear's screens, playing ----------
  // While the eye is within NEAR metres of the booth the players' screens, the mixer's FX screen and the laptop are
  // repainted from the music: FPS ticks a second, a player each tick in turn, the laptop and the FX screen every third.
  // A player's waveform runs SPAN seconds across its screen, what is heard now under the playhead in the middle and what
  // the radio has already read (its lookahead) coming in from the right, as a CDJ shows a track; TRACK is how long the
  // overview pretends a track is.
  const DECK = { W: 512, H: 333, COLS: 256, SPAN: [3, 6], FPS: 60, NEAR: 10, TRACK: 372 };
  const FXS = { W: 160, H: 124 };
  const FX_NAMES = ["FLANGER", "ECHO", "REVERB", "FILTER", "PHASER", "ROLL", "SPIRAL", "PITCH"], FX_BEATS = ["1/2", "3/4", "1", "1/4", "2", "1/8", "1/2", "1"];
  // A waveform where the radio can't be read, from the room's own beat: a kick on every beat, a middle rising and
  // falling through the bar, a hiss of top with the hats on the off-beats, each roughened by a hash of where in the
  // beat it falls, so it stands still against the grid as it scrolls.
  const grain = (q) => { const v = fsin(q * 12.9898) * 437.5453; return v - Math.floor(v); };
  const synthWave = (lo, mid, hi, beat, rate, span, I) => {
    const n = lo.length;
    for (let c = 0; c < n; c++) {
      const bt = beat + (-span / 2 + span * (c + 0.5) / n) * rate, f = bt - Math.floor(bt), k = Math.exp(-f * 7), q = Math.floor(bt * 24);
      lo[c] = (0.06 + 0.5 * k * (0.75 + 0.25 * grain(q))) * (0.5 + 0.5 * I);
      mid[c] = (0.08 + 0.1 * grain(q + 7.3) + 0.05 * fsin(bt * 0.5)) * (0.6 + 0.4 * I);
      hi[c] = 0.02 + 0.04 * grain(q + 3.1) + (Math.abs(f - 0.5) < 0.05 ? 0.1 : 0);
    }
  };
  // A waveform's columns stacked as a club player's three bands are: the whole in `colors[0]`, the middle and top in
  // `colors[1]` and the top alone in `colors[2]`, `g` the gain; into the box from `x` across `w`, round `mid`, `A` high.
  const stacked = (ctx, lo, md, hi, g, x, w, mid, A, colors) => {
    const n = lo.length, cw = w / n;
    for (let layer = 0; layer < 3; layer++) {
      ctx.fillStyle = colors[layer];
      const k = layer === 0 ? 1 : layer === 1 ? 0.85 : 0.6;
      for (let c = 0; c < n; c++) {
        const v = layer === 0 ? lo[c] + md[c] + hi[c] : layer === 1 ? md[c] + hi[c] : hi[c] * 1.6, a = Math.min(1, v * g) * A * k;
        if (a > 0.5) ctx.fillRect(x + c * cw, mid - a, cw, 2 * a);
      }
    }
  };
  // The loudest a waveform's columns stack, for its gain.
  const loudest = (lo, md, hi) => {
    let top = 0;
    for (let c = 0; c < lo.length; c++) { const v = lo[c] + md[c] + hi[c]; if (v > top) top = v; }
    return top;
  };
  const DECK_INKS = [["#2160d8", "#ffa23d", "#f4f8ff"], ["#b8402c", "#ffb27a", "#fff1e0"]];
  // A player's screen as it plays, made once per canvas: deck 1 in a club player's three bands, deck 2 in RGB (low red,
  // middle green, top blue, added) over twice the time with its four-beat loop boxed; the bars marked red on the beat
  // grid and a memory cue every phrase; the phase meter counting the bar; the time, the tempo and the BPM; the overview
  // lit as far as it has played; deck 1's edge red with ON AIR, on the kick. `paint(S, lo, mid, hi)`.
  const deckScreens = new WeakMap();
  const deckOf = (canvas, i) => {
    let deck = deckScreens.get(canvas);
    if (deck) return deck;
    const P = RM.paintKit, w = DECK.W, h = DECK.H, n = DECK.COLS, ctx = canvas.getContext("2d"), rand = P.rng(71 + i);
    const y0 = h * 0.22, y1 = h * 0.56, mid = (y0 + y1) / 2, A = (y1 - y0) / 2 - 2, oy = h * 0.84, oh = h * 0.12, ox = w * 0.03, ow = w * 0.94;
    // What never moves: the tabs, the waveform's box, the info row and the overview, dim and, on a canvas of its own,
    // bright as it is once played.
    const back = CH.canvas(w, h), b = back.getContext("2d"), played = CH.canvas(w, h), pc = played.getContext("2d");
    b.fillStyle = GEAR.screen; b.fillRect(0, 0, w, h);
    ["SOURCE", "BROWSE", "TAG LIST", "PLAYLIST", "SEARCH", "MENU"].forEach((t, k) => {
      const x = w * (0.03 + k * 0.16);
      b.fillStyle = k === 1 ? "#24406e" : "#1e2230"; b.fillRect(x, h * 0.03, w * 0.14, h * 0.07);
      P.pix(b, t, x + w * 0.07, h * 0.067, Math.min(h * 0.035, w * 0.12 / P.pixWidth(t, 1)), "#c9d8ff");
    });
    b.fillStyle = "#0a0e1a"; b.fillRect(0, y0 - 10, w, y1 - y0 + 20);
    b.fillStyle = "#161b2a"; b.fillRect(0, mid, w, 1);
    b.fillStyle = "#1e2230"; b.fillRect(w * 0.03, h * 0.655, w * 0.94, h * 0.13);
    P.pix(b, i ? "02" : "01", w * 0.07, h * 0.72, h * 0.08, i ? "#ffb27a" : "#7fb6ff");
    P.pix(b, i ? "+0.00%" : "-0.05%", w * 0.62, h * 0.7, h * 0.042, "#c9d8ff");
    P.pix(b, i ? "KEY 8A" : "KEY 5A", w * 0.62, h * 0.75, h * 0.036, PADS[i ? 4 : 2]);
    b.strokeStyle = "#c9d8ff"; b.lineWidth = 2; b.strokeRect(w * 0.76, h * 0.665, w * 0.19, h * 0.11);
    P.pix(b, "BPM", w * 0.855, h * 0.755, h * 0.028, "#7f8bb0");
    P.pix(b, i ? "LOOP 4" : "ON AIR", w * 0.06, h * 0.615, h * 0.03, i ? "#3cdc8c" : "#ff4d5e", "left");
    for (let x = 0; x < ow; x += 2) {
      const a = 0.25 + 0.75 * rand(), bx = ox + x, by = oy + oh - a * oh;
      b.fillStyle = "#3a4560"; b.fillRect(bx, by, 1.5, a * oh);
      pc.fillStyle = a > 0.8 ? DECK_INKS[i][2] : DECK_INKS[i][i ? 1 : 0]; pc.fillRect(bx, by, 1.5, a * oh);
    }
    for (let k = 1; k < 8; k++) { b.fillStyle = "#566080"; b.fillRect(ox + ow * k / 8, oy - 3, 1, 3); }
    const title = CH.canvas(w, Math.ceil(h * 0.075)), tc = title.getContext("2d");
    let titled = null, clock = "", tenths = -1, bpmText = "", bpmShown = -1, peak = 0.3;
    const paint = (S, lo, md, hi) => {
      const label = i ? S.next : S.title;
      if (label !== titled) {
        titled = label; tc.clearRect(0, 0, title.width, title.height);
        P.pix(tc, label, 0, title.height / 2, Math.min(h * 0.05, w * 0.92 / Math.max(1, P.pixWidth(label, 1))), "#e8eeff", "left");
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(back, 0, 0);
      ctx.drawImage(title, w * 0.04, h * 0.125);
      peak = Math.max(loudest(lo, md, hi), peak * 0.985, 0.06);
      const g = 1.1 / peak, span = DECK.SPAN[i], px = w / span / S.rate, at = (bt) => w / 2 + (bt - S.beat) * px;
      if (i === 0) stacked(ctx, lo, md, hi, g, 0, w, mid, A, DECK_INKS[0]);
      else {
        ctx.globalCompositeOperation = "lighter";
        const cw = w / n;
        for (let layer = 0; layer < 3; layer++) {
          const src = layer === 0 ? lo : layer === 1 ? md : hi, k = layer === 0 ? 1.2 : layer === 1 ? 2.2 : 3;
          ctx.fillStyle = layer === 0 ? "#d02a34" : layer === 1 ? "#2aa344" : "#2a58d8";
          for (let c = 0; c < n; c++) { const a = Math.min(1, src[c] * g * k) * A; if (a > 0.5) ctx.fillRect(c * cw, mid - a, cw, 2 * a); }
        }
        ctx.globalCompositeOperation = "source-over";
        const b0 = Math.floor(S.beat / 4) * 4, lx = at(b0);
        ctx.fillStyle = "rgba(60,220,140,0.14)"; ctx.fillRect(lx, y0 - 10, 4 * px, y1 - y0 + 20);
        ctx.fillStyle = "#3cdc8c"; ctx.fillRect(lx, y0 - 10, 2, y1 - y0 + 20); ctx.fillRect(lx + 4 * px - 2, y0 - 10, 2, y1 - y0 + 20);
      }
      // What has played, a little dimmer than what is coming.
      ctx.fillStyle = "rgba(6,8,15,0.4)"; ctx.fillRect(0, y0 - 10, w / 2, y1 - y0 + 20);
      // The beat grid: a tick on every beat, a red one on every bar, an orange memory cue every phrase.
      for (let bt = Math.ceil(S.beat - span * S.rate / 2); bt <= S.beat + span * S.rate / 2; bt++) {
        const x = at(bt), q = ((bt % 4) + 4) % 4, bar = q === 0;
        ctx.fillStyle = bar ? "#ff3b4a" : "rgba(235,240,255,0.6)";
        ctx.fillRect(x - (bar ? 1 : 0.5), y0 - 10, bar ? 2 : 1, bar ? 9 : 5);
        ctx.fillRect(x - (bar ? 1 : 0.5), y1 + 10 - (bar ? 9 : 5), bar ? 2 : 1, bar ? 9 : 5);
        if (((bt % 16) + 16) % 16 === 0) { ctx.fillStyle = "#ff8a1e"; ctx.fillRect(x - 3, y0 - 10, 7, 4); }
      }
      // The playhead, its glow beating with the kick.
      ctx.fillStyle = "#ffffff"; ctx.globalAlpha = 0.12 + 0.4 * S.kick; ctx.fillRect(w / 2 - 4, y0 - 10, 8, y1 - y0 + 20);
      ctx.globalAlpha = 1; ctx.fillStyle = "#ff3b3b"; ctx.fillRect(w / 2 - 1, y0 - 12, 2, y1 - y0 + 24);
      // The phase meter: the bar's four beats, the one now lit and filling.
      const whole = Math.floor(S.beat), inBar = ((whole % 4) + 4) % 4, frac = S.beat - whole;
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = k === inBar ? "#5a3a10" : k < inBar ? "#3a2a18" : "#22283a";
        ctx.fillRect(w * (0.3 + k * 0.105), h * 0.6, w * 0.095, h * 0.03);
      }
      ctx.fillStyle = "#ff9b2e"; ctx.fillRect(w * (0.3 + inBar * 0.105), h * 0.6, w * 0.095 * Math.min(1, frac * 1.3), h * 0.03);
      // The time and the tempo, written again only as they change.
      const e = S.t + i * 97.3, tn = Math.floor(e * 10);
      if (tn !== tenths) {
        tenths = tn;
        const m = Math.floor(e / 60) % 100, sec = Math.floor(e) % 60;
        clock = `${m < 10 ? "0" : ""}${m}:${sec < 10 ? "0" : ""}${sec}.${tn % 10}`;
      }
      P.pix(ctx, clock, w * 0.36, h * 0.72, h * 0.075, "#ffffff");
      const bv = Math.round(S.bpm * 10);
      if (bv !== bpmShown) { bpmShown = bv; bpmText = (bv / 10).toFixed(1); }
      P.pix(ctx, bpmText, w * 0.855, h * 0.71, h * 0.052, S.live ? "#ffffff" : "#9aa6c6");
      // The overview, lit as far as the track has played.
      const pw = ow * ((((e / DECK.TRACK) % 1) + 1) % 1);
      if (pw >= 1) ctx.drawImage(played, ox, oy, pw, oh, ox, oy, pw, oh);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(ox + pw - 1, oy - 3, 2, oh + 5);
      if (i === 0) {
        ctx.strokeStyle = "#ff2b3a"; ctx.lineWidth = 4; ctx.globalAlpha = 0.25 + 0.6 * S.kick;
        ctx.strokeRect(2, 2, w - 4, h - 4); ctx.globalAlpha = 1;
      }
    };
    deck = { paint };
    deckScreens.set(canvas, deck);
    return deck;
  };
  // The mixer's FX screen as it plays: the BPM, the effect (a new one every phrase) and its beat, how hard it works (as
  // hard as the music), and the bar's four beats. `paint(S)`.
  const fxScreens = new WeakMap();
  const fxOf = (canvas) => {
    let fx = fxScreens.get(canvas);
    if (fx) return fx;
    const P = RM.paintKit, w = FXS.W, h = FXS.H, ctx = canvas.getContext("2d");
    let bpmText = "", bpmShown = -1;
    const paint = (S) => {
      ctx.globalAlpha = 1;
      ctx.fillStyle = GEAR.screen; ctx.fillRect(0, 0, w, h);
      const bv = Math.round(S.bpm);
      if (bv !== bpmShown) { bpmShown = bv; bpmText = `${bv} BPM`; }
      P.pix(ctx, bpmText, w * 0.95, h * 0.12, h * 0.1, "#c9d8ff", "right");
      P.pix(ctx, "FX", w * 0.05, h * 0.12, h * 0.1, "#9a5cff", "left");
      const f = ((Math.floor(S.beat / 16) % 8) + 8) % 8, whole = Math.floor(S.beat), inBar = ((whole % 4) + 4) % 4;
      ctx.fillStyle = "#e8e8f0"; ctx.fillRect(w * 0.06, h * 0.24, w * 0.88, h * 0.2);
      P.pix(ctx, FX_NAMES[f], w / 2, h * 0.34, h * 0.13, "#06080f");
      ctx.fillStyle = "#3a8cff"; ctx.fillRect(w * 0.06, h * 0.5, w * 0.42, h * 0.14); ctx.fillRect(w * 0.52, h * 0.5, w * 0.42, h * 0.14);
      P.pix(ctx, FX_BEATS[f], w * 0.27, h * 0.57, h * 0.09, "#ffffff"); P.pix(ctx, "BEAT", w * 0.73, h * 0.57, h * 0.09, "#ffffff");
      ctx.fillStyle = "#1e2230"; ctx.fillRect(w * 0.06, h * 0.7, w * 0.88, h * 0.08);
      ctx.fillStyle = "#9a5cff"; ctx.fillRect(w * 0.06, h * 0.7, w * 0.88 * Math.min(1, 0.15 + 0.85 * S.I), h * 0.08);
      ctx.fillStyle = "#e0d0ff"; ctx.globalAlpha = S.kick; ctx.fillRect(w * 0.06, h * 0.7, w * 0.88 * Math.min(1, 0.15 + 0.85 * S.I), h * 0.08); ctx.globalAlpha = 1;
      for (let k = 0; k < 4; k++) { ctx.fillStyle = k === inBar ? "#ffd34d" : "#2a3046"; ctx.fillRect(w * (0.06 + k * 0.225), h * 0.84, w * 0.2, h * 0.09); }
    };
    fx = { paint };
    fxScreens.set(canvas, fx);
    return fx;
  };
  // The laptop as it plays: its library painted again only as the station or the song changes, and over it each
  // frame the two decks' waveforms scrolling past their playheads with their BPM, the master meter in the title bar
  // and ON AIR blinking on the beat. `paint(S, waves)`, `waves` the players' (each its low, middle and top).
  const laptops = new WeakMap();
  const laptopOf = (canvas) => {
    let lap = laptops.get(canvas);
    if (lap) return lap;
    const P = RM.paintKit, w = LAPTOP.W, h = LAPTOP.H, ctx = canvas.getContext("2d"), back = CH.canvas(w, h), bc = back.getContext("2d");
    const side = w * 0.24, x0 = side + w * 0.02, cw = w - x0 - w * 0.02, lx = x0 + w * 0.07, lw = cw - w * 0.08;
    const peak = [0.3, 0.3];
    let station = null, song = null, bpmText = "", bpmShown = -1;
    const paint = (S, waves) => {
      if (S.station !== station || S.song !== song) { station = S.station; song = S.song; paintLaptop(bc, station, song); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(back, 0, 0);
      const bv = Math.round(S.bpm * 10);
      if (bv !== bpmShown) { bpmShown = bv; bpmText = (bv / 10).toFixed(1); }
      for (let d = 0; d < 2; d++) {
        const y = h * (0.3 + d * 0.13), [lo, md, hi] = waves[d], mid2 = d ? "#ff8a3d" : "#3fa2ff";
        ctx.fillStyle = "#121828"; ctx.fillRect(x0, y - h * 0.055, cw, h * 0.11);
        peak[d] = Math.max(loudest(lo, md, hi), peak[d] * 0.985, 0.06);
        stacked(ctx, lo, md, hi, 1.1 / peak[d], lx, lw, y, h * 0.045, d ? DECK_INKS[1] : DECK_INKS[0]);
        ctx.fillStyle = "rgba(18,24,40,0.45)"; ctx.fillRect(lx, y - h * 0.05, lw / 2, h * 0.1);
        const px = lw / DECK.SPAN[d] / S.rate;
        for (let bt = Math.ceil(S.beat - DECK.SPAN[d] * S.rate / 2); bt <= S.beat + DECK.SPAN[d] * S.rate / 2; bt++) {
          ctx.fillStyle = ((bt % 4) + 4) % 4 === 0 ? "#ff3b4a" : "rgba(235,240,255,0.5)";
          ctx.fillRect(lx + lw / 2 + (bt - S.beat) * px, y - h * 0.05, 1, h * 0.012);
        }
        ctx.fillStyle = "#ffffff"; ctx.fillRect(lx + lw / 2 - 1, y - h * 0.05, 2, h * 0.1);
        P.pix(ctx, d ? "2" : "1", x0 + w * 0.02, y - h * 0.02, h * 0.035, mid2);
        P.pix(ctx, bpmText, x0 + w * 0.035, y + h * 0.03, h * 0.022, S.live ? "#ffffff" : "#c9d8ff");
      }
      const lit = Math.round(Math.min(1, 0.25 + 0.5 * S.I + 0.35 * S.kick) * 16);
      for (let k = 0; k < 16; k++) { ctx.fillStyle = k >= lit ? "#202634" : k < 11 ? "#3dffb0" : k < 14 ? "#ffb020" : "#ff3a3a"; ctx.fillRect(w * 0.76 + k * w * 0.013, h * 0.022, w * 0.009, h * 0.026); }
      if (S.beat - Math.floor(S.beat) > 0.5) { ctx.fillStyle = "#151a28"; ctx.fillRect(w * 0.55, h * 0.012, w * 0.1, h * 0.046); }
    };
    lap = { paint };
    laptops.set(canvas, lap);
    return lap;
  };
  const djGear = (G) => {
    const span = RIG.MW / 2 + RIG.GAP + RIG.PW, B = RIG.BASE;
    laptop(G, -span - 0.32, 0.02, [-span, B + 0.06, -0.12]);
    headphones(G, span + 0.22, 0.12);
    G.box(2 * span + 0.04, B, RIG.D + 0.04, GEAR.black, 0, B / 2, 0);
    G.box(2 * span + 0.04, 0.008, 0.004, PURPLE, 0, B * 0.5, -RIG.D / 2 - 0.021, { emissive: 1, glow: true });
    const R = G.group(0, B, 0);
    mixer(R);
    for (const side of [-1, 1]) player(R, side * (RIG.MW / 2 + RIG.GAP + RIG.PW / 2), side < 0 ? 0 : 1);
  };

  // ---------- its door ----------
  // A club's: black leather leaves buttoned in a diamond pattern with a soft strip down the seam and a porthole, neon
  // tubes round the frame, EXIT over it and a string of bulbs round it that chase the beat, the neon, EXIT and the bulbs
  // in the room's two colours (`lightsIn`, swapped as the colours change), and no strip across the bay.
  const door = {
    casing: "#120d18", frame: "#2a1f36", header: "#0b0714", word: PALETTE_HEX[0][1], strip: false, chain: false,
    leaf: "#17121c", seam: "#050307", plate: "#0b0714", face: "#d8d0ff", mark: "#0b0714",
    leafFace(side, H) {
      for (let row = 0; row < 11; row++) for (let col = 0; col < 5; col++) {
        const x = -0.6 + col * 0.3 + (row & 1 ? 0.15 : 0), y = 0.35 + row * 0.27;
        if (x < 0.72 && Math.hypot(x, y - 2.35) > 0.28) H.diamond(x, y, 0.025, "#6e5a86", 0.15, 1);
      }
      H.rect(H.inner + side * 0.02, 0.1, H.inner + side * 0.05, 3.1, "#4a3d66", 0.6, 2);
      H.disc(0, 2.35, 0.15, "#24123a", 0.5, 16, 1);
      H.ring(0, 2.35, 0.18, 0.03, "#9a8ab8", 0.5, 16, 2);
    }
  };
  // The neon round the frame in `color`, in the room's frame: up both sides and across the top.
  const neon = (k, d, color) => {
    const x = d.W + d.F + 0.03, z = d.Z - 0.14;
    for (const sx of [-1, 1]) k.box(0.03, d.D + d.F, 0.03, color, sx * x, (d.D + d.F) / 2, z, { emissive: 1, glow: true });
    k.box(2 * x, 0.03, 0.03, color, 0, d.D + d.F, z, { emissive: 1, glow: true });
  };
  const doorTrim = (K, L) => {
    K.node("doorNeon", (k) => neon(k, RM.doorway(L), PALETTE_HEX[0][1]), 0, 0, 0, { glow: true });
    RM.doorBulbs(K, L, PALETTE_HEX[0][0], 0.38);
  };
  // The door's and the speakers' lights in a palette's colours, made once a room and palette: the neon, EXIT and the
  // woofers' rings in its second colour, the bulbs and the speakers' strips in its first.
  const lightLooks = new Map();
  const lightsIn = (L, i) => {
    const key = `${L.id}|${i}`;
    if (!lightLooks.has(key)) {
      const [ha, hb] = PALETTE_HEX[i], d = RM.doorway(L), tube = RM.solo((k) => neon(k, d, hb)), bulb = RM.helpers.ballGeo(0.045, ha, 8, 1), strip = RM.solo(speakerStrip(ha));
      tube.castShadow = bulb.castShadow = strip.castShadow = false;
      lightLooks.set(key, { tube, exit: RM.helpers.litWord("EXIT", 0.036, hb, 0.9), bulb, ring: RM.solo(cone(0.13, hb)), strip });
    }
    return lightLooks.get(key);
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

    // The stage across the front: a deck from its straight front edge back to the wall, in platforms whose seams show,
    // white tape along its lip under an aluminium nosing, a velour skirt down its front with the subs built in behind
    // grilles, and a violet cove light under the nosing and along the foot, which glow with the music; stage stairs up
    // each end, their treads taped white, a dim step light in each riser and a handrail either side. Its top and the
    // steps' are solids' tops, so an Ooga steps up them, or jumps up onto the deck anywhere.
    const H = STAGE.H, W = STAGE.W, zs = stageZ(L), rw = ROOMS.radiusAt(L, 0) - 0.05, back = Math.asin(W / rw) / DEG, deck = [[-W, zs], [W, zs]];
    for (let i = 0; i <= 12; i++) { const p = polar(rw, 180 - back + 2 * back * i / 12); deck.push([p.x, p.z]); }
    K.slab(deck.reverse(), 0, H, C.stage);
    K.slab(deck.map(([x, z]) => [x * 0.999, z + (z > zs - 0.01 ? -0.02 : 0)]), H, H + 0.012, C.stageTop);
    const seamY = H + 0.0135;
    for (let z = zs - PLATFORM; z > -rw; z -= PLATFORM) { const half = Math.min(W, Math.sqrt(rw * rw - z * z)); K.box(2 * half, 0.003, 0.012, STAGE_C.seam, 0, seamY, z); }
    for (let x = 0; x < W; x += PLATFORM) for (const sx of x ? [-1, 1] : [1]) {
      const zw = -Math.sqrt(rw * rw - x * x);
      K.box(0.012, 0.003, zs - zw, STAGE_C.seam, sx * x, seamY, (zs + zw) / 2);
    }
    K.box(2 * W, 0.003, 0.05, STAGE_C.tape, 0, seamY, zs - 0.04);
    K.box(2 * W + 0.04, 0.05, 0.075, STAGE_C.nosing, 0, H - 0.019, zs + 0.03);
    const skirtGeo = blank(), bays = SUBS.at.map((x) => [x - SUBS.w / 2 - 0.035, x + SUBS.w / 2 + 0.035]);
    skirt(skirtGeo, zs, -W, W, 0.07, H - 0.045, bays);
    K.add(skirtGeo);
    for (const x of SUBS.at) subBay(K, x, zs);
    K.node("stageEdge", (k) => {
      k.box(2 * W, 0.012, 0.014, PURPLE, 0, H - 0.055, zs + 0.05, { emissive: 1, glow: true });
      k.box(2 * W, 0.02, 0.02, PURPLE, 0, 0.035, zs + 0.03, { emissive: 1, glow: true });
    }, 0, 0, 0, { glow: true });
    K.solid({ x: 0, z: zs - 4, hx: W, hz: 4, top: H, stay: true });
    const sz = zs - STAGE.DOWN - STAGE.STEP_W / 2, out = W + STAGE.STEPS * STAGE.TREAD, rail = STAGE.STEP_W / 2 - 0.04;
    for (const side of [-1, 1]) {
      for (let s = 1; s <= STAGE.STEPS; s++) {
        const top = H * s / (STAGE.STEPS + 1), x0 = W + (STAGE.STEPS - s) * STAGE.TREAD, x1 = x0 + STAGE.TREAD;
        K.box(x1 - W, top, STAGE.STEP_W, STAGE_C.riser, side * (W + x1) / 2, top / 2, sz);
        K.box(x1 - x0, 0.012, STAGE.STEP_W, STAGE_C.tread, side * (x0 + x1) / 2, top + 0.006, sz);
        K.box(0.045, 0.003, STAGE.STEP_W, STAGE_C.tape, side * (x1 - 0.03), top + 0.0135, sz);
        for (const dz of [-0.6, 0.6]) K.box(0.004, 0.025, 0.09, STAGE_C.lamp, side * (x1 + 0.002), top * 0.55, sz + dz, { emissive: 0.55, glow: true });
        K.solid({ x: side * (x0 + x1) / 2, z: sz, hx: STAGE.TREAD / 2, hz: STAGE.STEP_W / 2, top });
      }
      // The handrails: a post at the foot on the lowest tread and one on the deck, a rail and a mid rail between.
      const lo = H / (STAGE.STEPS + 1), xb = side * (out - 0.08), xt = side * (W - 0.08), up = 0.95;
      for (const dz of [-rail, rail]) {
        const z = sz + dz;
        K.cyl(0.024, 0.024, up, STAGE_C.alu, xb, lo + up / 2, z, { seg: 8 });
        K.cyl(0.024, 0.024, up, STAGE_C.alu, xt, H + up / 2, z, { seg: 8 });
        rod(K, [xb, lo + up, z], [xt, H + up, z], 0.02, STAGE_C.alu);
        rod(K, [xb, lo + up * 0.5, z], [xt, H + up * 0.5, z], 0.014, STAGE_C.alu);
        K.solid({ x: (xb + xt) / 2, z, hx: Math.abs(xb - xt) / 2 + 0.03, hz: 0.04 });
      }
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
    // The DJ's platform behind it, from the desk back to the wall, its top a solid's in slices along it; white tape
    // along its open ends, where an Ooga steps up.
    const pr0 = rb1 + 0.01, pr1 = rw - 0.05, pb = ah - DJ_IN, P = H + DJ_UP, da0 = (180 - pb) * DEG, da1 = (180 + pb) * DEG;
    K.sector(0, pr0, pr1, da0, da1, H, P, C.stage);
    K.sector(0, pr0 + 0.01, pr1, da0 + 0.001, da1 - 0.001, P, P + 0.012, C.stageTop);
    for (const a of [da0, da1 - 0.004]) K.sector(0, pr0, pr1, a, a + 0.004, P + 0.004, P + 0.016, STAGE_C.tape);
    const rows = 3, slices = Math.ceil(2 * pb * DEG * (pr0 + pr1) / 2 / 0.5), depth = (pr1 - pr0) / rows;
    for (let i = 0; i < rows; i++) for (let j = 0; j < slices; j++) {
      const rm = pr0 + depth * (i + 0.5), b = 180 - pb + 2 * pb * (j + 0.5) / slices, c = polar(rm, b);
      K.solid({ x: c.x, z: c.z, hx: pb * DEG * rm / slices - 0.02, hz: depth / 2 - 0.02, top: P, stay: true });
    }
    djGear(K.group(0, U, BZ + 0.05, Math.PI));
    // A monitor either side of the booth turned to the DJ, its cable taped along the deck to the booth's end; and two
    // road cases at the back corners of the stage.
    const dj = -(pr0 + pr1) / 2, mx = BOOTH_W / 2 + MON;
    for (const sx of [-1, 1]) {
      boothMonitor(K, sx * mx, H + 0.012, BZ + 0.1, 0, dj);
      rod(K, [sx * (mx - 0.3), H + 0.022, BZ + 0.1], [sx * (BOOTH_W / 2 - 0.1), H + 0.022, BZ + 0.3], 0.01, "#0a0a0c");
      const c = polar(rw - 1.1, 180 + sx * (back - 4));
      roadCase(K, c.x, H + 0.012, c.z, (sx * (back - 4)) * DEG, 1.1, 0.7, 0.6);
    }

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
    const shared = { woofer: cone(0.13, PALETTE_HEX[0][1]), strip: speakerStrip(PALETTE_HEX[0][0]) };
    const tip = { kind: "speaker", tip: "Line array", radius: 0.6, data: { say: "Hung off the wall, and a drop on every block" } }, rh = ROOMS.radiusAt(L, HANG_Y);
    for (const [i, a] of ARRAYS.entries()) for (const s of [1, -1]) {
      const b = s * a.b * DEG;
      lineArray(K.group(rh * Math.sin(b), 0, rh * Math.cos(b), b + Math.PI), a.n, `woofer${i}${s < 0 ? "l" : "r"}`, shared, tip);
    }

    for (let i = 0; i < BALCONY.LEVELS.length; i++) balcony(K, L, i);

    // The mirror ball under the crown on its line; the ring of light a drop sends down the dome and the sign over the
    // booth that a block's drop shows, both kept under the floor until then.
    const by = ballY(L);
    K.node("ball", (k) => mirrorBall(k, 1.1), 0, by, FZ, { target: { kind: "ball", tip: "Mirror ball", radius: 1.3, data: { say: "It turns faster when the music hits hard" } } });
    // It is solid to an Ooga flying into it, and one that comes down on it stands on its crown: a wide circle up to its
    // shoulder and a narrow one up to its top, both hung, so nobody under it meets them and a rise from below stops at
    // its underside.
    K.solid({ x: 0, z: FZ, r: 0.95, top: by + 0.55, below: by - 1.0 });
    K.solid({ x: 0, z: FZ, r: 0.25, top: by + 1.1, below: by - 1.0 });
    K.box(0.03, L.crown - by - 1.25, 0.03, "#55555c", 0, (by + 1.15 + L.crown - 0.1) / 2, FZ);
    K.node("wave", (k) => k.torus(1, 0.025, FLASH, 0, 0, 0, { emissive: 1, glow: true, seg: 96, sides: 5 }), 0, AWAY, 0, { glow: true });
    K.picture(9, 1.1, 1636, 200, sign("BLOCK FOUND · DROP!", FLASH, FLASH), 0, AWAY, BZ + 1.6, { name: "drop", rx: 0.3 });

    // The latest block on the dome over the booth.
    const pa0 = -15, pa1 = 15, pe0 = 4.6, pe1 = 10.6, pw = 1024;
    const wM = (pa1 - pa0) * DEG * L.R * Math.cos((pe0 + pe1) / 2 * DEG), hM = L.R * (Math.sin(pe1 * DEG) - Math.sin(pe0 * DEG)), ph = Math.round(pw * hM / wM);
    K.live({ az0: pa0, az1: pa1, el0: pe0, el1: pe1, w: pw, h: ph, tip: "The latest block",
      key: (f, now) => blockKey(f.reader, now), paint: (ctx, f, now) => paintBlock(ctx, f.reader, now, pw, ph) });
    // Under it, what the radio plays, shown only while its station's feed names a song.
    const se0 = 0.4, se1 = 4.3, sw = 1024, swM = (pa1 - pa0) * DEG * L.R * Math.cos((se0 + se1) / 2 * DEG), sh = Math.round(sw * L.R * (Math.sin(se1 * DEG) - Math.sin(se0 * DEG)) / swM);
    K.live({ az0: pa0, az1: pa1, el0: se0, el1: se1, w: sw, h: sh, tip: "Now playing", key: songKey, paint: (ctx) => paintSong(ctx, sw, sh) });

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
    // Each Ooga's groove: how long it has stood still, how far its groove has eased in, and whether it has one going;
    // kept weakly, so a body let go (a player gone) takes its groove with it.
    const grooves = new WeakMap(), STAND = BL.crew.GAIT.stand;
    const projectors = rigs.map((_, p) => nodes[`projector${p}`]), look = { dir: new Float32Array(count * 3), on: new Uint8Array(count), color: new Uint8Array(count) };
    const dots = [];
    for (let g = 0; nodes[`dots${g}`]; g++) dots.push(nodes[`dots${g}`]);
    // Each woofer's rest and the way it pushes out, toward the room's middle.
    const cones = [], strips = [];
    for (const name of Object.keys(nodes)) if (/^speakerStrip/.test(name)) strips.push(nodes[name]);
    for (const name of Object.keys(nodes)) if (/^woofer/.test(name)) {
      const n = nodes[name], p = n.position, d = Math.hypot(p.x, p.z);
      cones.push({ node: n, x: p.x, z: p.z, dx: -p.x / d, dz: -p.z / d });
    }
    const records = [nodes.record0, nodes.record1], jogs = [nodes.jog0, nodes.jog1], plays = [nodes.play0, nodes.play1];
    const fxOn = nodes.fxOn, ball = nodes.ball, wave = nodes.wave, drop = nodes.drop, stageEdge = nodes.stageEdge, wallNode = nodes.wall;
    // The mixer's meters, a channel's segments bottom up, and how many of each are lit; its beat lamps.
    const meterSegs = [], meterLit = new Int8Array(4).fill(-1), beatLamps = [0, 1, 2, 3].map((i) => nodes[`beat${i}`]);
    for (let c = 0; c < 4; c++) for (let i = 0; i < METER.SEGS; i++) meterSegs.push(nodes[`meter${c}_${i}`]);
    // What the radio plays, under the latest block.
    const songPicture = built.live.find((l) => l.spec.tip === "Now playing");
    // The gear's screens, repainted as the music plays while the eye is near the booth (DECK): what each reads, a
    // player's waveform each, and the tick that takes them in turn.
    const laptopSurface = nodes.laptopScreen.geometry.imageSurface, laptop = laptopOf(laptopSurface.canvas);
    const deckSurfaces = [nodes.deckScreen0, nodes.deckScreen1].map((n) => n.geometry.imageSurface), deckPainters = deckSurfaces.map((s, i) => deckOf(s.canvas, i));
    const fxSurface = nodes.fxScreen.geometry.imageSurface, fxPainter = fxOf(fxSurface.canvas);
    const waves = [0, 1].map(() => [new Float32Array(DECK.COLS), new Float32Array(DECK.COLS), new Float32Array(DECK.COLS)]);
    const S = { t: 0, beat: 0, rate: 1 / BEAT, bpm: 60 / BEAT, kick: 0, I: 0, live: false, title: "", next: "", station: "", song: "" };
    const gearAt = { x: 0, y: STAGE.H + BOOTH_TOP, z: boothZ(L) };
    let gearWait = 0, gearTick = 0;
    // The door's neon, EXIT and bulbs, in the colours the room is in.
    const doorNeon = nodes.doorNeon, exitSign = built.exitSign;
    let doorColors = -1;
    const domeSurface = built.dome && built.dome.geometry.imageSurface, domeShow = domeSurface && shows.get(domeSurface.canvas);
    const screenSurface = nodes.screen.geometry.imageSurface, screen = screenOf(screenSurface.canvas);
    const wallSurface = nodes.wall.geometry.imageSurface, wall = wallOf(wallSurface.canvas), music = new Float32Array(MUSIC.BANDS), shape = new Float32Array(MUSIC.WAVE);
    const e0 = ROOMS.edgeEl(L, 0) / DEG;
    const floorRgb = built.lights[2].slice(4, 7), screenRgb = built.lights[8].slice(4, 7);
    const radio = BL.timechainPartyRadio.create(), heard = { live: false, bpm: 0, phase: 0, level: 0, conf: 0 }, E = { loud: 0, bass: 0 }, E2 = { loud: 0, bass: 0 }, bulbs = RM.bulbsOf(nodes);
    const setLight = (lights, i, r, g, b) => { const o = i * 8; lights[o + 4] = r; lights[o + 5] = g; lights[o + 6] = b; };
    // The room's clock for its own arrangement: the island room's where there is one, so everyone sees it alike.
    const clock = () => (BL.net.state.room === "live" ? BL.net.serverNow() : Date.now()) / 1000 + shift;
    let shift = 0, pinned = null;

    // The beat, the music's energy and the section.
    let beat = 0, rate = 1 / BEAT, lastStep = 0, hit = 1, I = 0.25, raw = 0.25, forced = null, analysed = false;
    let fastB = NaN, fastL = 0, refB = 0, refL = 0;
    let kicking = false, kickBeat = 0, forcedKick = null, forcedLook = null, held = false;
    // A drop seen coming: the beat it lands on (-1 for none), the one the last scan saw, when the next scan is due; the
    // build toward it, the room holding its breath before it, and the build's rings across the floor.
    const curve = new Float32Array(Math.round(AHEAD.LOOK / AHEAD.STEP) + 1);
    let dropBeat = -1, seenBeat = -1, scanWait = 0, tension = 0, hushK = 0, converge = 0;
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
      showLook = dropped ? 0 : Math.floor(Math.random() * 64);
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
    let chose = false, shown = radio.channel;
    // In a shared room a change waits PARTY_GAP after the last, a little over the room's own gap, so this page never
    // tunes itself to a channel the room refuses (which the room would answer with its own, tuning it back).
    let sentAt = -Infinity;
    const CHANNEL = { key: "channel", label: "CHANNEL", hint: "Space · Change the channel", tap: "Tap CHANNEL to change the channel", run: (hud) => {
      const now = performance.now(), net = BL.net.state, shared = net.room === "live" && net.partyRadio && net.zone === "sphere-6";
      if (shared && now - sentAt < PARTY_GAP) return;
      radio.next(); chose = true;
      shown = radio.channel; screen.channel(radio.station.short);
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
      shown = radio.channel; screen.channel(radio.station.short);
      if (by === BL.net.state.selfId) return;
      const rec = by && BL.net.remotes.get(by), who = rec ? rec.display || rec.login : "";
      BL.hud.toast(`${who ? `${who} changed the channel · ` : ""}Channel ${radio.channel + 1} of ${stations} · ${radio.station.name}`);
    });

    // How hard a reading is against the loudest lately, as the intensity reads it.
    const rawOf = (bass, loud) => ENERGY.BASS_SHARE * clamp01((bass - refB + ENERGY.BASS_SPAN) / ENERGY.BASS_WIDTH) + (1 - ENERGY.BASS_SHARE) * clamp01((loud - refL + ENERGY.LOUD_SPAN) / ENERGY.LOUD_WIDTH);
    // How hard the music will be `d` seconds on (-1 where it can't be read).
    const futureAt = (d) => {
      if (!analysed) return arranged(clock() + d);
      let b = 0, l = 0, n = 0;
      for (let j = -1; j <= 1; j++) if (radio.ahead(d + j * AHEAD.AROUND, E2)) { b += E2.bass; l += E2.loud; n++; }
      return n ? rawOf(b / n, l / n) : -1;
    };
    // The seconds to the first drop coming, or -1: the steepest step where a quiet second meets a hard stretch.
    const scanAhead = () => {
      const n = curve.length, back = Math.round(1 / AHEAD.STEP), on = Math.round(AHEAD.OVER / AHEAD.STEP);
      for (let k = 0; k < n; k++) curve[k] = futureAt(k * AHEAD.STEP);
      for (let k = back; k + on <= n; k++) {
        let before = 0, after = 0, ok = true;
        for (let j = k - back; j < k; j++) { if (curve[j] < 0) ok = false; before += curve[j]; }
        for (let j = k; j < k + on; j++) { if (curve[j] < 0) ok = false; after += curve[j]; }
        before /= back; after /= on;
        if (!ok || before >= AHEAD.BELOW || after <= AHEAD.ABOVE || after - before < AHEAD.JUMP) continue;
        let best = k, rise = -1;
        for (let j = Math.max(1, k - 2); j <= Math.min(n - 1, k + 2); j++) if (curve[j] - curve[j - 1] > rise) { rise = curve[j] - curve[j - 1]; best = j; }
        return (best - 0.5) * AHEAD.STEP;
      }
      return -1;
    };
    // The drop lands: the room goes hard on that beat, every surface and the colours change and the lasers come on.
    const landDrop = (t, step) => {
      musicT = 0;
      if (showUntil < 0) startShow(LASER.SHOW_DROP, true);
      section = 2; sectionBeat = beat; I = Math.max(I, 0.85);
      for (let i = 0; i < 3; i++) surfaces[i].due = step + i * BAR;
      newColors();
      nextChange = step + CHANGE.EVERY * BAR; nextColors = step + CHANGE.PALETTE * BAR;
    };

    return {
      update(dt, t) {
        // The beat: its own steady one, or eased onto the music's tempo and phase; it never runs backward.
        radio.sample(heard);
        // A channel that never answered puts the dial back on the station still playing.
        if (radio.channel !== shown) { shown = radio.channel; screen.channel(radio.station.short); }
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
        } else raw = radio.warming ? 0.15 : arranged(clock());
        if (forced !== null) raw = forced;
        I += (raw - I) * Math.min(1, dt * (raw > I ? ENERGY.RISE : ENERGY.SINK));
        // A drop coming: looked for while the room is not already hard, landed on its beat; the build over its last
        // seconds and the breath held just before it.
        if ((scanWait -= dt) <= 0) {
          scanWait = AHEAD.SCAN;
          const s = forced === null && section !== 2 && !radio.warming ? scanAhead() : -1;
          if (s >= 0) {
            const at = Math.round(beat + s * rate);
            if (seenBeat >= 0 && Math.abs(at - seenBeat) <= 2 && (dropBeat < 0 || Math.abs(at - dropBeat) > 1)) dropBeat = at;
            seenBeat = at;
          } else {
            seenBeat = -1;
            if (dropBeat >= 0 && (forced !== null || (dropBeat - beat) / rate > AHEAD.LOSE)) dropBeat = -1;
          }
        }
        if (dropBeat >= 0 && beat >= dropBeat) {
          dropBeat = seenBeat = -1;
          if (section !== 2) landDrop(t, Math.floor(beat));
        }
        const toDrop = dropBeat >= 0 ? (dropBeat - beat) / rate : Infinity;
        tension = toDrop < AHEAD.BUILD ? smooth(1 - toDrop / AHEAD.BUILD) : 0;
        hushK += ((dropBeat >= 0 && dropBeat - beat < AHEAD.HUSH ? 1 : 0) - hushK) * Math.min(1, dt * 25);
        const dim = 1 - 0.85 * hushK;
        // How hard a kick drives the music now: the beat the radio finds, as hard as it hits (none when it finds none);
        // or, where the music can't be read, the arrangement's, kicking through its hard part.
        const groove = forcedKick !== null ? forcedKick : analysed ? (heard.live ? heard.level : 0) : I > 0.6 ? 1 : 0.3;
        hit += (groove - hit) * Math.min(1, dt * TEMPO_RATE);
        const kick = Math.exp(-(beat - step) * 6) * hit * (0.35 + 0.65 * I);
        if (I < SECTION.CALM_DOWN) lastCalm = t;
        // A new block on the chain drops the bass.
        const blocks = feeds.reader.value("recent"), height = blocks && blocks[0] ? blocks[0].height : -1;
        M.hash = blocks && blocks[0] ? blocks[0].id : "00000000000000000002a7c4c1e48d76c5a37902165a270156b7a8d72728a054";
        if (height > 0 && lastHeight > 0 && height > lastHeight) blockDrop();
        if (height > 0) lastHeight = height;
        // On each bar: the section, and now and then a new look for one surface or new colours.
        if (newStep && step % BAR === 0) {
          // Whether a strong kick drives it: a change of mind repicks every surface's look, a bar apart.
          const kickWant = kicking ? hit > KICK.OFF : hit > KICK.ON;
          if (kickWant !== kicking && beat - kickBeat >= KICK.HOLD * BAR) {
            kicking = kickWant; kickBeat = beat;
            for (let i = 0; i < 3; i++) surfaces[i].due = Math.min(surfaces[i].due, step + i * BAR);
          }
          const want = section === 2 ? (I < SECTION.CALM_DOWN ? 0 : I < SECTION.HARD_DOWN ? 1 : 2)
            : section === 0 ? (I > SECTION.HARD_UP ? 2 : I > SECTION.CALM_UP ? 1 : 0)
              : (I > SECTION.HARD_UP ? 2 : I < SECTION.CALM_DOWN ? 0 : 1);
          if (want !== section && !(want === 2 && dropBeat >= 0) && (beat - sectionBeat >= SECTION.HOLD * BAR || want === 2)) {
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
          const mood = section > 0 && !kicking ? 3 : section;
          if (!held) for (const s of surfaces) if (step >= s.due) { s.due = Infinity; change(s, pick(s.fors[mood], s.look)); }
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
        M.t = t; M.beat = beat; M.step = step; M.kick = kick * dim; M.I = I * dim;
        const rush = 1 + 1.5 * tension;
        M.spin += dt * (0.25 + 0.9 * I) * rush; M.rings += move * Math.PI * (0.3 + 0.7 * I) * rush; M.sweep += move * TAU / 16 * (0.5 + 0.5 * I) * rush;
        M.ripple += dt * (0.7 + 1.5 * I); M.flow += dt * (12 + 40 * I);
        // The drops: a block's lasts DROP_TIME, the music's MUSIC_DROP.
        if (blockT >= 0 && (blockT += dt / DROP_TIME) >= 1) blockT = -1;
        if (musicT >= 0 && (musicT += dt / MUSIC_DROP) >= 1) musicT = -1;
        const d = blockT >= 0 ? blockT : musicT, dropping = d >= 0, boom = blockT >= 0 ? 1 - blockT : 0;
        // The stage's lip glows with how hard the music is and on the kick.
        stageEdge.glow = (0.3 + 0.35 * I + 0.35 * kick + 0.4 * tension) * dim + boom;
        // The door's and the speakers' lights take the room's colours halfway through their fade; the neon, EXIT and the
        // speakers' strips glow with the music, and the door's bulbs chase round the frame a bulb a beat, every third lit.
        const doorWants = cf >= 0.5 ? colorTo : colorFrom;
        if (doorWants !== doorColors) {
          doorColors = doorWants;
          const look = lightsIn(L, doorColors);
          doorNeon.geometry = look.tube; exitSign.geometry = look.exit;
          for (let i = 0; i < bulbs.length; i++) bulbs[i].geometry = look.bulb;
          for (let i = 0; i < cones.length; i++) cones[i].node.geometry = look.ring;
          for (let i = 0; i < strips.length; i++) strips[i].geometry = look.strip;
        }
        for (let i = 0; i < strips.length; i++) strips[i].glow = (0.35 + 0.35 * I + 0.3 * kick) * dim;
        doorNeon.glow = 0.45 + 0.3 * I + 0.25 * kick;
        exitSign.glow = 0.7 + 0.3 * I;
        for (let i = 0; i < bulbs.length; i++) bulbs[i].glow = (i + step) % 3 === 0 ? 0.3 + 0.5 * kick : 0.1;
        // The floor: its look wiped outward ring by ring over the last, a drop's wave over it all; re-hashed on every
        // beat while the music is hard and every bar while it is not, the hashes held through a drop.
        // In a build, rings run in from the walls toward the middle, quicker as the drop nears.
        converge += move * (0.25 + 1.75 * tension);
        const front = dropping ? (d - 0.3) / 0.6 * (RINGS + 1) : tension > 0.05 ? (1 - (converge % 1)) * (RINGS + 1) : -9;
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
          if (floor.paint(floorA, nonce, (0.3 + 0.7 * I) * dim)) floorSurface.version++;
        }
        // The lasers: during a show as bright as the music is hard, one pair at a time taking turns by the phrase and the
        // opposite pair with it at the hardest; a block's drop all of them.
        // In a build's last half every beam finds the mirror ball, brighter as the drop nears; they go dark before it.
        const building = showUntil < 0 && blockT < 0 && tension > 0.5;
        const target = blockT >= 0 ? 1 : showUntil >= 0 ? clamp01((I - 0.45) / 0.35) : building ? (tension - 0.5) * 1.2 : 0;
        laser += (target - laser) * Math.min(1, dt * (target > laser ? 3 : 1.5));
        if (hushK > 0.5) laser = 0;
        const n = PROJ.BEARINGS.length, first = (showPair + Math.floor((beat - showFrom) / PHRASE)) % n;
        const pairs = blockT >= 0 ? (1 << n) - 1 : laser > 0.03 ? 1 << first | (laser > 0.75 ? 1 << (first + 2) % n : 0) : 0;
        if (pairs) {
          const list = kicking ? PULSE_LOOKS : FLOW_LOOKS;
          const lk = blockT >= 0 ? -1 : forcedLook !== null ? forcedLook : building ? 5 : list[(showLook + Math.floor((beat - showFrom) / (kicking ? PHRASE : 2 * PHRASE))) % list.length];
          aim(rigs, beat, t, kick, lk, showColors[0], showColors[1], pairs, look, F);
          const glow = (0.35 + 0.65 * laser) * (0.85 + 0.15 * kick) * (kicking || blockT >= 0 ? 1 : 0.7);
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
        for (let p = 0; p < projectors.length; p++) {
          let lit = false;
          for (let j = 0; pairs && j < NB && !lit; j++) lit = look.on[p * NB + j] === 1;
          projectors[p].glow = lit ? 0.4 + 0.6 * laser : 0.25;
        }
        // The dome: its look faded over the last, warm in a block's drop; the dots twinkling softly, brighter in the
        // night's look, a group lit on the kick.
        if (domeShow && (domeWait -= dt) <= 0) {
          domeWait = 1 / DOME_FPS;
          domeShow.paint(dome.from, dome.look, smooth(dome.fade), M, 0.35 * boom);
          domeSurface.version++;
        }
        const night = dome.look === DOME.NIGHT ? dome.fade : dome.from === DOME.NIGHT ? 1 - dome.fade : 0;
        for (let g = 0; g < dots.length; g++) dots[g].glow = (0.12 + 0.3 * night + (0.15 + 0.25 * night) * (0.5 + 0.5 * Math.sin(t * 1.3 + g * 1.7)) + (g === step % dots.length ? 0.5 * kick * I : 0)) * dim + boom;
        // The booth's screen and the LED wall, from the music read once for both (or made from the beat).
        screenDt += dt;
        if ((screenWait -= dt) <= 0) {
          screenWait = 1 / SCREEN.FPS;
          if (!radio.spectrum(music) || !radio.scope(shape)) madeUp(t, kick, I, music, shape);
          const styled = Math.round(cf * 8) + colorTo * 16;
          if (styled !== colorStyled) { colorStyled = styled; wall.colors(M.a, M.b); }
          screen.paint(screenDt, kick, I, boom, music, shape);
          // The mixer's meters, a channel a quarter of the spectrum, low to high.
          const quarter = MUSIC.BANDS / 4;
          for (let c = 0; c < 4; c++) {
            let sum = 0;
            for (let k = c * quarter; k < (c + 1) * quarter; k++) sum += music[k];
            const lit = Math.round(clamp01(sum / quarter * 1.6 * dim) * METER.SEGS);
            if (lit === meterLit[c]) continue;
            meterLit[c] = lit;
            for (let i = 0; i < METER.SEGS; i++) meterSegs[c * METER.SEGS + i].visible = i < lit;
          }
          wall.paint(screenDt, strip.from, strip.look, smooth(strip.fade), M, boom, music, shape);
          screenSurface.version++; wallSurface.version++; screenDt = 0;
        }
        // The LED wall strobes through a build's second half, on eighths then sixteenths, and dims before the drop.
        const strobe = tension > 0.5 ? ((beat * (tension > 0.75 ? 4 : 2)) % 1 < 0.5 ? 1 + 0.6 * tension : 0.6) : 1;
        wallNode.glow = strobe * dim;
        // The woofers push out on the kick, harder in a block's drop.
        const push = 0.02 * kick * (1 + boom);
        for (let i = 0; i < cones.length; i++) {
          const c = cones[i], n = c.node;
          n.position.x = c.x + c.dx * push; n.position.z = c.z + c.dz * push;
          n.scale.x = n.scale.z = 1 + push * 2.5;
          n.glow = 0.2 + 0.6 * kick;
        }
        // The DJ's rig: the jog wheels and their screens turn at 33 rpm at 124 BPM, quicker or slower with the tempo,
        // and pulse on the kick; the play rings blink on the beat, the beat lamps
        // count the bar and the FX button pulses on the kick.
        for (let i = 0; i < 2; i++) {
          const spin = dt * 3.49 * rate * BEAT;
          records[i].rotation.y -= spin; jogs[i].rotation.y -= spin;
          jogs[i].glow = (0.55 + 0.45 * kick) * dim;
          plays[i].glow = (beat % 1 < 0.5 ? 1 : 0.4) * dim;
        }
        for (let i = 0; i < 4; i++) beatLamps[i].glow = (i === step % 4 ? 0.5 + 0.5 * kick : 0.08) * dim;
        fxOn.glow = (0.45 + 0.55 * kick) * dim;
        // What the radio plays, under the latest block, put away while its station names no song.
        const song = pinned !== null ? pinned : radio.song, on = radio.playing;
        if (song !== playing.song || on.short !== playing.station) {
          playing.song = song; playing.station = on.short;
          const list = BL.timechainPartyRadio.STATIONS;
          S.title = song ? `${on.short} · ${song}` : on.short; S.next = `NEXT · ${list[(list.indexOf(on) + 1) % list.length].short}`;
          S.station = on.name; S.song = song;
        }
        if (songPicture) songPicture.node.visible = !!song;
        // The gear's screens, while the eye is near enough to read them.
        if ((gearWait -= dt) <= 0) {
          gearWait = 1 / DECK.FPS;
          const cam = BL.scenes.timechain.camera, p = cam && cam.position;
          if (p && Math.hypot(p.x - gearAt.x, p.y - gearAt.y, p.z - gearAt.z) < DECK.NEAR) {
            gearTick++;
            S.t = t; S.beat = beat; S.rate = rate; S.bpm = heard.live ? heard.bpm : rate * 60; S.kick = kick * dim; S.I = I * dim; S.live = heard.live;
            const d = gearTick & 1, span = DECK.SPAN[d], wv = waves[d];
            if (!radio.waveform(-span / 2, span / 2, wv[0], wv[1], wv[2])) synthWave(wv[0], wv[1], wv[2], beat, rate, span, I);
            deckPainters[d].paint(S, wv[0], wv[1], wv[2]); deckSurfaces[d].version++;
            if (gearTick % 3 === 0) { laptop.paint(S, waves); laptopSurface.version++; }
            else if (gearTick % 3 === 1) { fxPainter.paint(S); fxSurface.version++; }
          }
        }
        ball.rotation.y += dt * (0.15 + 0.35 * I + boom * 2.2 + 0.8 * tension);
        ball.glow = (0.55 + 0.35 * I + 0.3 * kick + 0.4 * tension) * dim + boom;
        // A drop's ring of light falls from the crown to the dome's edge in its first half; a block's sign blinks.
        const fall = d / 0.5;
        if (dropping && fall < 1) {
          const el = (90 - fall * (90 - e0)) * DEG, s = Math.max(0.3, (L.R * Math.cos(el) - 0.12) / 1.025);
          wave.position.y = L.c + L.R * Math.sin(el); wave.scale.x = wave.scale.y = wave.scale.z = s;
        } else if (tension > 0.02 && hushK < 0.5) {
          // In a build the ring rises from the dome's edge toward the crown.
          const el = (e0 + tension * (84 - e0)) * DEG, s = Math.max(0.3, (L.R * Math.cos(el) - 0.12) / 1.025);
          wave.position.y = L.c + L.R * Math.sin(el); wave.scale.x = wave.scale.y = wave.scale.z = s;
        } else wave.position.y = AWAY;
        wave.glow = dropping ? 1 : 0.35 + 0.65 * tension;
        drop.position.y = blockT >= 0 && (blockT * 7) % 1 < 0.7 ? SIGN_Y : AWAY;
        // The lights in the room's two colours, as bright as the music is hard, flaring warm in a block's drop.
        const opts = BL.scenes.timechain.renderOpts, lights = opts && opts.lights;
        if (lights && opts.lightCount >= 9) {
          const lift = (0.45 + 0.55 * I) * (1 + 0.6 * boom) * dim;
          mix(M.a, FLASH_RGB, boom, rgb); setLight(lights, 0, rgb[0] * lift, rgb[1] * lift, rgb[2] * lift);
          mix(M.b, FLASH_RGB, boom, rgb); setLight(lights, 1, rgb[0] * lift, rgb[1] * lift, rgb[2] * lift);
          const f = (0.35 + 0.35 * I + 0.3 * kick) * (1 + 0.6 * boom) * dim;
          setLight(lights, 2, floorRgb[0] * f, floorRgb[1] * f, floorRgb[2] * f);
          const bl = (0.6 + 0.3 * I) * (1 + 0.6 * boom) * dim;
          setLight(lights, 3, M.b[0] * bl, M.b[1] * bl, M.b[2] * bl);
          const fr = (0.25 + 0.3 * I + 0.25 * kick) * dim, ring = blockT >= 0 && Math.abs(FAR - front) < 1.3 ? FLASH_RGB : M.a;
          for (let q = 4; q < 8; q++) setLight(lights, q, ring[0] * fr, ring[1] * fr, ring[2] * fr);
          const sc = (0.55 + 0.4 * kick) * dim + boom;
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
        if (owner.tip === "Now playing") { hud.toast(`${radio.playing.name} · ${playing.song || "now playing"}`); return true; }
        hud.toast("The latest block, from mempool.space · the bass drops on every one");
        return true;
      },
      // Under debug (`__ooga.timechain.motion`): the radio's state and the room's reading of the music, with handles to
      // hold its intensity, how hard its kick is and the lasers' look (null lets go of each) and its surfaces' looks, drop
      // the bass as a block or the music would, set a surface's look by name at once and set the colours; the drop seen
      // coming and the build toward it, a place in the room's own arrangement to play from (`arrange`), and a song to
      // show under the latest block (`song`, null lets go).
      get stats() {
        return { ...radio.stats, intensity: +I.toFixed(3), analysed, section, kicking, hit: +hit.toFixed(3), laser: +laser.toFixed(3), showing: showUntil >= 0, shows: showCount,
          dropIn: dropBeat >= 0 ? +((dropBeat - beat) / rate).toFixed(2) : -1, tension: +tension.toFixed(3), playing: playing.song,
          arrange: (s) => { shift = 0; shift = s - ((clock() % ARRANGE_S) + ARRANGE_S) % ARRANGE_S; }, song: (text) => { pinned = text; },
          looks: { dome: DOME.NAMES[dome.look], floor: FLOOR.NAMES[ground.look], wall: WALLS.NAMES[strip.look] }, colors: colorTo,
          force: (v) => { forced = v === null ? null : clamp01(v); }, kick: (v) => { forcedKick = v === null ? null : clamp01(v); kickBeat = -1e9; }, laserLook: (i) => { forcedLook = i; }, blockDrop, musicDrop: () => { showUntil = -1; musicDrop(1e9); }, hold: (on) => { held = !!on; },
          look: (which, name) => {
            const s = { dome, floor: ground, wall: strip }[which], names = { dome: DOME.NAMES, floor: FLOOR.NAMES, wall: WALLS.NAMES }[which];
            change(s, names.indexOf(name)); s.fade = 1;
          },
          palette: (i) => { colorFrom = colorTo = i % PALETTES.length; colorFade = 1; } };
      },
      // An Ooga standing still on the floor grooves (DANCE): called after the crew and the other players are posed, for
      // each Ooga shown, `off` for one that should stand still now (the visitor's own, seen from its own eyes). Every
      // joint it moves is written whole from the standing pose, and put back as it was once the groove has eased out.
      dance(cave, dt, off) {
        let g = grooves.get(cave);
        if (!g) grooves.set(cave, g = { still: 0, k: 0, on: false, phrase: -1, name: "", groove: GROOVES[0], fR: 0, fL: 0 });
        const parts = cave.parts, standing = !off && cave.root.visible && cave.gait === STAND && !(cave.camp && cave.camp.seat)
          && !(cave.hop > 0) && !(cave.jet && cave.jet.thrust) && !cave.grabbedBy;
        g.still = standing ? g.still + dt : 0;
        g.k = standing && g.still > DANCE.STILL ? Math.min(1, g.k + dt / DANCE.EASE) : 0;
        // The forearms hang at whatever bend the body gives them standing, read as the groove starts.
        const fore = parts.forearmR && parts.forearmL;
        if (g.k <= 0) {
          if (g.on) {
            g.on = false;
            if (standing) {
              parts.legR.rotation.z = parts.legL.rotation.z = parts.torso.rotation.x = parts.torso.rotation.z = 0;
              parts.armR.rotation.x = parts.armL.rotation.x = -0.2; parts.armR.rotation.z = cave.armRZ; parts.armL.rotation.z = cave.armLZ;
            }
            if (fore) { parts.forearmR.rotation.x = g.fR; parts.forearmL.rotation.x = g.fL; }
          }
          return;
        }
        if (!g.on && fore) { g.fR = parts.forearmR.rotation.x; g.fL = parts.forearmL.rotation.x; }
        g.on = true;
        const b = M.beat, frac = b - Math.floor(b), k = smooth(g.k) * (DANCE.QUIET + (1 - DANCE.QUIET) * M.I);
        const s = Math.sin(Math.PI * b), dip = Math.exp(-frac * 5), turn = Math.floor(b) & 1 ? 1 : -1;
        const phrase = Math.floor(b / PHRASE);
        if (phrase !== g.phrase || cave.traits.name !== g.name) {
          g.phrase = phrase; g.name = cave.traits.name;
          g.groove = GROOVES[BL.math.fnv1a(g.name + ":" + phrase) % GROOVES.length];
        }
        const G = g.groove;
        const sideR = parts.legR.position.x >= 0 ? 1 : -1, open = DANCE.STEP * k;
        parts.legR.rotation.z = sideR * open * Math.max(0, s);
        parts.legL.rotation.z = -sideR * open * Math.max(0, -s);
        parts.torso.rotation.z = -sideR * DANCE.LEAN * k * s;
        parts.torso.rotation.x = DANCE.NOD * k * dip;
        parts.armR.rotation.x = -0.2 - (G.fwd + G.sway * s) * k;
        parts.armL.rotation.x = -0.2 - (G.fwd - G.sway * s) * k;
        parts.armR.rotation.z = cave.armRZ; parts.armL.rotation.z = cave.armLZ;
        if (fore) {
          const both = G.lift + G.pump * dip;
          parts.forearmR.rotation.x = g.fR - (both + G.alt * dip * (turn > 0 ? 1 : 0) + G.one * (0.7 + 0.3 * dip)) * k;
          parts.forearmL.rotation.x = g.fL - (both + G.alt * dip * (turn < 0 ? 1 : 0)) * k;
        }
      },
      // The visitor walking out: the music fades out on the way to the doors, and back in if they stay after all.
      fadeOut() { radio.fadeOut(); },
      fadeBack() { radio.fadeBack(); },
      dispose() { offParty(); radio.dispose(); playing.song = playing.station = ""; }
    };
  };
  // `jetpack`: the visitor's jetpack comes in with them and flies under the dome.
  BL.timechainRoomKinds.party = { plan, animate, door, jetpack: true };
})();
