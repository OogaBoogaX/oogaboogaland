// Room 6, the Block Party: a club under a dome of light, one of the large rooms. The radio plays live
// (timechain-party-radio.js): EDM Sessions, the one station it plays. The room follows the music rather than running
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
// so everyone sees it alike. A new block on the chain blinks BLOCK FOUND on the latest block's scoreboard over the booth,
// and one of the wall's looks is a chain of blocks out from the booth, a new one popping in on every second and fourth beat.
// The DJ booth stands up on a stage
// across the front, dressed as a club's is (a velour skirt with the subs behind grilles, stage stairs with handrails
// each end, booth monitors on stands, road cases); line arrays hang off the walls all the way round between the lasers and
// thump, the mirror ball turns under the crown, and the latest block hangs on the dome. Oogas standing still on the
// floor dance to the beat, each to its player's number, 0 to 9, chosen in the banner (`dance`, timechain-party-dance.js). A glass balcony runs round the
// wall over the line arrays and lasers, all but the front of the room, and as high again over it a glass ring walkway
// hangs from the dome on wire ropes, all the way round, in from the wall; neither has a stair: a jetpack gets an Ooga
// up there.
(() => {
  "use strict";
  const BL = window.BL;
  const RM = BL.timechainRoomModels, CH = BL.timechainCharts, ROOMS = BL.timechainRooms;
  const { face, blank } = RM.helpers;
  const { DEG, TAU } = ROOMS;
  const { hexToRgb } = BL.math;
  const rgbOf = (c) => hexToRgb(c).map((v) => v / 255);
  // The fee bands' colours, low to high, and the room's gold.
  const BANDS = ["#5b3fd0", "#3a7bd5", "#2fbf71", "#e3c33a", "#f7931a", "#e0533d"], FLASH = "#ffd08a", PURPLE = "#9a5cff";
  // The pairs of colours the room is lit in, one pair at a time.
  const PALETTE_HEX = [["#5b3fd0", "#3a7bd5"], ["#3a7bd5", "#2fbf71"], ["#7b3fe0", "#e0533d"], ["#f7931a", "#e0533d"],
    ["#2b9fd5", "#9a5cff"], ["#5b3fd0", "#f7931a"], ["#2fbf71", "#3ac8d5"], ["#e0533d", "#9a5cff"]];
  const PALETTES = PALETTE_HEX.map((p) => p.map(rgbOf));
  // A sine read from a table, for the dome's looks that need one or two a pixel.
  const SIN = new Float32Array(1024).map((_, i) => Math.sin(i / 1024 * Math.PI * 2)), fsin = (x) => SIN[((x * 162.97466) | 0) & 1023];
  const C = {
    booth: "#1a1420", boothTop: "#2a2030", bezel: "#0a0810", metal: "#2a2a2e", vinyl: "#0b0b0b", cab: "#111114", grille: "#1b1b20",
    label: "#ffb04d", ink: "#0b0714", stage: "#16111d", stageTop: "#261d33", rig: "#3a3b42", plate: "#1c1c20", housing: "#16161b", trim: "#0c0c0f",
    glass: "#0a1622", fin: "#26272d", knob: "#2a2a30", horn: "#09090b", chain: "#5c5e66",
    steel: "#55575f", pin: "#c8242c", rubber: "#0e0e10", frame: "#25252b", throat: "#050506", mesh: "#0d0d10", badge: "#d6d7de", motor: "#1d1e22"
  };
  // The floor: LED panels TILE apart round (0, FZ), wall to wall but inside the booth, painted on the floor's own canvas
  // at FLOOR_PX pixels a metre (a panel a black seam round CELLS by CELLS cells of a hash grid), FLOOR_FPS times a
  // second while the music is hard and half that while it is not.
  const FZ = -1, TILE = 0.8, FLOOR_PX = 20, FLOOR_FPS = 24, CELLS = 4;
  // The beat with no music to follow, BAR beats a bar; following the radio, the room's beat eases to its tempo at
  // TEMPO_RATE and its phase at PHASE_RATE a second. A drop in the music lasts MUSIC_DROP.
  const BEAT = 60 / 124, BAR = 4, TEMPO_RATE = 3, PHASE_RATE = 6, MUSIC_DROP = 1.4;
  // Finding the backbeat: the clap and snare band, the screen's spectrum bands FROM to TO (about 1.5 to 5 kHz); its
  // peak over the first HIT of a beat against its level over the beat before's last part, from TAIL on (the hi-hats
  // fall between the beats, so neither window takes them); each side's rise eased at EASE a beat; after WARM beats the
  // even side RATIO times the odd one and MARGIN over it moves the count on a beat.
  const BACKBEAT = { FROM: 59, TO: 78, HIT: 0.2, TAIL: 0.65, EASE: 0.1, WARM: 16, RATIO: 1.5, MARGIN: 0.002 };
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
  // Where what is put away waits.
  const AWAY = -3;
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
  // stand MON out from its front corners and MON_FWD in front of them, road cases against the wall (CASE_OUT from it,
  // CASE_IN degrees in from the stage's side), and the colours of all of it.
  const SKIRT = { PLEAT: 0.09, DEPTH: 0.025 }, SUBS = { w: 1.3, h: 0.5, y: 0.12, at: [-4.5, -1.5, 1.5, 4.5] }, PLATFORM = 1.22, MON = 0.6, MON_FWD = 0.3, CASE_OUT = 0.5, CASE_IN = 2.5;
  const STAGE_C = { skirt: "#141017", fold: "#1e1923", nosing: "#45474f", seam: "#0d0a11", tape: "#c9c4b6", grille: "#0b0b0e", slat: "#1a1a1f",
    frame: "#2a2b31", tread: "#1d1a22", riser: "#121016", lamp: "#ffcf9a", alu: "#8a8f98", led: "#3aff7a" };
  // The dome: its looks repainted DOME_FPS times a second on a canvas DOME_W by DOME_H drawn up smooth; its LED dots a
  // cell a fortieth of a radian round, about one in seven lit, in DOT_GROUPS nodes, sorted DOT_BIAS metres nearer for
  // Canvas 2D; the LED wall WALL_BIAS.
  const DOME_W = 512, DOME_H = 192, DOME_FPS = 24, DOT_GROUPS = 6, DOT_BIAS = -1.5, WALL_BIAS = -0.5;
  // The lasers: an RGB projector's colours; NB beams a projector, each a thin bar BEAM_LEN long stretched to what it
  // meets, with a dot where it lands; a new look every PHRASE beats; the pairs of colours a show may be in.
  const RGB = ["#2bff5a", "#ff2b3a", "#3b5bff", "#2bf2ff", "#ff2bea", "#ffe62b", "#f4f2ff"];
  const GREEN = 0, RED = 1, BLUE = 2, CYAN = 3, MAGENTA = 4, YELLOW = 5;
  const SHOW_COLORS = [[GREEN, GREEN], [CYAN, MAGENTA], [RED, RED], [BLUE, CYAN], [GREEN, CYAN], [MAGENTA, BLUE]];
  const NB = 10, PHRASE = 16, BEAM_W = 0.007, BEAM_LEN = 8;
  // The lasers' looks a show turns through: on the beat while a strong kick drives the music, a new one every LOOK_BEATS,
  // and flowing (the level sheet, the liquid sky, the mesh, the drift and the aurora) while nothing kicks, every
  // FLOW_BEATS; which comes next is drawn afresh each time (never the one just shown), with a variation of its own.
  const PULSE_LOOKS = [0, 1, 2, 4, 5, 7, 8, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24], FLOW_LOOKS = [3, 6, 9, 11, 21, 25, 16];
  const LOOK_BEATS = 8, FLOW_BEATS = 16;
  // A rainbow fan's colours, in order round the wheel.
  const RAINBOW = [RED, YELLOW, GREEN, CYAN, BLUE, MAGENTA];
  // A strong kick: the beat the radio finds, as hard as it hits now (`hit`, 0 to 1), counts from ON and stops counting
  // under OFF; a change holds HOLD bars before another.
  const KICK = { ON: 0.55, OFF: 0.4, HOLD: 8 };
  // The projectors on the walls: a pair at each of BEARINGS (degrees from the doors, mirrored, nearest the booth first),
  // in the rows TIERS sets, on a bracket OUT from the wall, tipped TILT down, built SCALE times a projector's BODY (its aperture at
  // APERTURE in its own frame). A show lights one pair at a time, two while the music is at its hardest, the pairs
  // taking turns phrase by phrase.
  const PROJ = { OUT: 0.75, TILT: 0.22, SCALE: 1.6, BEARINGS: [160, 121, 82, 43] };
  const BODY = { w: 0.3, h: 0.17, d: 0.32 }, APERTURE = [0, -0.012, 0.182];
  // How high a projector bracket's wall plate stands over the projector's pivot.
  const PLATE_Y = 0.08;
  // The line arrays hung off the walls all the way round, between the projectors, a pair at each bearing: `n` boxes
  // BOX big hung from a bracket HANG_OUT from the wall at the height its row sets (TIERS), each splayed SPLAY degrees further down than the one
  // above; the mains either side of the stage, fills round the room to the doors.
  const ARRAYS = [{ b: 141, n: 5 }, { b: 101, n: 4 }, { b: 62, n: 4 }, { b: 24, n: 3 }], BOX = { w: 1.15, h: 0.34, d: 0.6 }, HANG_OUT = 0.95, SPLAY = [2, 3, 4, 5, 6];
  // The balcony: a glass deck on steel round the wall, its floor at Y1 and its inner edge R in, its underside (for
  // collision) DEPTH under its floor, over the line arrays and the lasers hung under it. All the way round but the
  // front of the room (OPEN degrees either side of the booth), a glass balustrade RAIL high, with no stair: an Ooga
  // gets up there by jetpack. A beam every BEAM degrees; its glass, floor and balustrade alike, GLASS opaque face on;
  // collision in boxes SEG degrees round.
  const BALCONY = { R: 16.4, Y1: 8.15, DEPTH: 0.35, OPEN: 34, RAIL: 0.63, SEG: 4, BEAM: 6, GLASS: 0.04 };
  // The floors' glass, seen at an angle nearly always, pales toward a glancing view FLOOR_GRAZING as much as the
  // balustrades' does, so it stays clear across the deck rather than clouding over a few steps off.
  const FLOOR_GRAZING = 0.35;
  // The ring: a glass walkway all the way round as high again over the balcony (Y1), from R0 to R1 out, well in from
  // the wall and hung from the dome on wire ropes, a pair every HANG degrees, with a balustrade along both edges. Its
  // beams, glass, balustrade and collision are the balcony's.
  const RING = { Y1: 16.3, R0: 11, R1: 13.4, HANG: 24, WIRE: 0.016 };
  // How far glass stands clear of the steel it rests on and under (m), and how far a balustrade's shoe sits down into
  // the floor's glass, so the glass's top lies inside it rather than in its face.
  const GLASS_LIFT = 0.008, SINK = 0.012;
  // The glass floors' sheen: a glossy reflector (as the Lightning Jet Hangar's runway is) GLOSS strong, a little lighter
  // than the runway's so the glass stays see-through, laid LIFT over the glass's top, in STEPS facets a full turn. All
  // the glass, floors and balustrades' panes, is the renderer's reflective glass (`glassOpacity`, as DSB Land's water
  // is): clear face on, paler and catching the light toward a glancing view, as real glass does.
  const SHEEN = { GLOSS: 0.5, LIFT: 0.001, STEPS: 96 };
  // A glossy reflector over a floor's glass from r0 to r1 out and between bearings b0 and b1 (radians): the room kit's
  // `glossSheet`, its node to be laid face up.
  const sheen = (r0, r1, b0, b1) => RM.helpers.glossSheet(r0, r1, b0, b1, SHEEN.GLOSS, SHEEN.STEPS);
  // The rows the line arrays and the lasers hang in, every bracket's arm in a row, the speakers' and the lasers'
  // alike, at one height (`armY`), so each row's rigging runs level round the room and its hangs and projectors hang
  // from that line. The first hangs RIG_DROP under the balcony; the second as far under the ring as the first looks
  // under the balcony from the floor's middle at EYE height (the ring is well in from the wall, so it hangs a little
  // over the ring's own floor, but reads as just under it), less ROW2_DROP; the third TOP_DROP under the top of the sphere, where the
  // dome is in past the ring's inner edge, a ring of them over the open middle. `base` is the floor a row plays to, which its lasers aim over. The
  // first row's speakers and lasers are ARRAYS' and PROJ.BEARINGS'; each row above has `pairs` of a speaker and a
  // projector each side, fewer a row up, spread evenly over the same span as the first (`spread`), a box fewer a row up.
  const RIG_DROP = 0.9, TOP_DROP = 3, EYE = 1.7, ROW2_DROP = 0.6;
  const TIERS = [
    { base: 0, under: "balcony", speakers: ARRAYS.map((a) => a.b), lasers: [160, 121, 82, 43] },
    { base: BALCONY.Y1, under: "ring", pairs: 3 },
    { base: RING.Y1, under: "top", pairs: 2 }
  ];
  // A row's bearings, `pairs` speakers and as many projectors each side, alternating evenly from the first row's
  // nearest the doors (a speaker) to its nearest the booth (a projector).
  const spread = (tier) => {
    if (tier.speakers) return tier;
    const lo = Math.min(...ARRAYS.map((a) => a.b)), hi = Math.max(...PROJ.BEARINGS), n = tier.pairs * 2, out = { speakers: [], lasers: [] };
    for (let i = 0; i < n; i++) (i % 2 ? out.lasers : out.speakers).push(lo + (hi - lo) * i / (n - 1));
    return out;
  };
  // The nearest of `list` to a bearing, by its index.
  const nearest = (list, deg) => list.reduce((best, v, i) => Math.abs(v - deg) < Math.abs(list[best] - deg) ? i : best, 0);
  // The height a row's bracket arms run at.
  const armY = (L, tier) => {
    const balcony = BALCONY.Y1 - BALCONY.DEPTH - RIG_DROP;
    if (tier.under === "balcony") return balcony;
    if (tier.under === "top") return L.c + L.R - TOP_DROP;
    // How far the first row looks under the balcony's inner edge from the floor's middle, and the height on the wall
    // that looks as far under the ring's outer edge, found by halving.
    const look = (r, y) => Math.atan2(y - EYE, r), under = RING.Y1 - BALCONY.DEPTH;
    const want = look(RING.R1, under) - (look(BALCONY.R, BALCONY.Y1 - BALCONY.DEPTH) - look(ROOMS.radiusAt(L, balcony), balcony));
    let lo = under - 3, hi = under + 4;
    for (let k = 0; k < 40; k++) { const y = (lo + hi) / 2; if (look(ROOMS.radiusAt(L, y), y) < want) lo = y; else hi = y; }
    return (lo + hi) / 2 - ROW2_DROP;
  };
  const BALCONY_C = { steel: "#2a2d34", edge: "#33363e", joint: "#101116", shoe: "#1c1e23", rail: "#b3b8c0", lamp: "#ffd9a8", glass: "#cfe6e2", railGlass: "#dcefee" };
  // The booth's screen: a canvas W by H wrapped round the booth's face from Y0 to Y1, repainted at most FPS times a
  // second, its name on a plate LOGO_W by LOGO_H drawn at PLATE of that.
  const SCREEN = { W: 1024, H: 144, Y0: 0.16, Y1: 0.92, FPS: 60, LOGO_W: 300, LOGO_H: 104, END_W: 136, OFF: 0.046, BEZEL: 0.04 };
  // The booth's back screen's canvas width, as many pixels a metre along it as the front's.
  const BACK_SCREEN = { W: 1080 };
  const MUSIC = { BANDS: 96, WAVE: 512 };
  // The LED wall round the room: a canvas W by H wrapped just inside the wall below the dome (INSET), from Y0 to Y1, all
  // the way round but DOOR either side of the doors; its spectrum's segments SEG pixels, its blocks BLOCKS a side.
  const WALL = { W: 2048, H: 96, INSET: 0.995, Y0: 0.14, Y1: 3.62, DOOR: 2.8, SEG: 4, BLOCKS: 24 };
  // The surfaces' looks, and which suit each section (calm, middle, hard), and the flowing ones a middle or hard section
  // gets while nothing kicks (the fourth list).
  const DOME = { WASH: 0, NIGHT: 1, SWEEP: 2, RINGS: 3, SPIRAL: 4, PLASMA: 5, KALEIDO: 6, BURST: 7,
    NAMES: ["wash", "night", "sweep", "rings", "spiral", "plasma", "kaleido", "burst"], FOR: [[0, 1, 2, 5], [0, 2, 3, 5, 6], [3, 4, 6, 7], [0, 5, 6, 2]] };
  const FLOOR = { GLOW: 0, RIPPLES: 1, SWEEP: 2, SPARKS: 3, RINGS: 4, NAMES: ["glow", "ripples", "sweep", "sparks", "rings"], FOR: [[0, 1], [1, 2, 3], [4, 3, 2], [0, 1, 2]] };
  const WALLS = { WAVE: 0, FLOW: 1, BLOCKS: 2, SPECTRUM: 3, WATERFALL: 4, SKYLINE: 5, CHAIN: 6,
    NAMES: ["wave", "flow", "blocks", "spectrum", "waterfall", "skyline", "chain"],
    FOR: [[0, 1, 4, 5], [1, 2, 3, 4, 5, 6], [3, 2, 6, 4], [1, 4, 0, 5]] };
  // The wall's skyline: TOWERS a side.
  const CITY = { TOWERS: 48 };
  // The wall's chain of blocks out from the booth each way: a block DRAW pixels tall a SLOT apart, its sprite drawn on a
  // square grid D across and squeezed to the wall's pixels, which are ASPECT as tall as they are wide on the wall; a new
  // block pops in at the booth on the second and fourth beat of every bar and pushes the rest out over PUSH of a beat,
  // with VARIANTS lit patterns in each of the two colours.
  const CHAIN = { D: 80, DRAW: 66, SLOT: 66, ASPECT: 0.6, PUSH: 0.2, VARIANTS: 3 };
  const polar = (r, b) => ({ x: r * Math.sin(b * DEG), z: r * Math.cos(b * DEG) });
  const boothZ = (L) => -(L.r0 - 2.7);
  const stageZ = (L) => -(L.r0 - STAGE.FRONT);
  // The booth's half angle round the room's middle, in degrees.
  const boothHalf = (L) => Math.asin(BOOTH_W / 2 / (L.r0 - 2.8)) / DEG;
  const ballY = (L) => 0.45 * L.crown;
  const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  const mix = (a, b, f, out) => { out[0] = a[0] + (b[0] - a[0]) * f; out[1] = a[1] + (b[1] - a[1]) * f; out[2] = a[2] + (b[2] - a[2]) * f; return out; };
  const smooth = (f) => f * f * (3 - 2 * f);
  // A number from 0 to 1 that looks random, the same for the same two numbers.
  const hash01 = (a, b) => { const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x); };
  // Circles along an arc round the room's middle (bearings in degrees), close enough that nobody slips between; with a
  // `top`, something to jump up onto and over.
  const arcSolids = (K, r, b0, b1, rad, top) => {
    const n = Math.max(1, Math.ceil(Math.abs(b1 - b0) * DEG * r / (rad * 1.8)));
    for (let i = 0; i <= n; i++) { const p = polar(r, b0 + (b1 - b0) * i / n); K.solid({ x: p.x, z: p.z, r: rad, top }); }
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
    // `from` fading into `to` by `f`.
    const paint = (from, to, f, M) => {
      const one = f >= 1 || from === to, A = bufs[0], B = bufs[1], g = 1 - f;
      render(to, A, M);
      if (!one) render(from, B, M);
      for (let i = 0, o = 0, end = w * h * 3; i < end; i += 3, o += 4) {
        const r = one ? A[i] : A[i] * f + B[i] * g, gg = one ? A[i + 1] : A[i + 1] * f + B[i + 1] * g, bl = one ? A[i + 2] : A[i + 2] * f + B[i + 2] * g;
        px[o] = r * 255; px[o + 1] = gg * 255; px[o + 2] = bl * 255; px[o + 3] = 255;
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
  // A tier's projectors (`base`, the floor under them) share their pairs with the ones below, so a show lights a
  // bearing's every tier together, and each aims over its own floor's heads.
  const rigsOf = (L) => {
    const out = [];
    // A projector's pivot hangs its bracket's arm height under the arm, and PROJ.OUT in from the wall at the arm.
    const rise = PROJ.SCALE * (BODY.h / 2 + 0.17) + 0.08;
    for (const [ti, tier] of TIERS.entries()) for (const deg of spread(tier).lasers) {
      const base = tier.base, arm = armY(L, tier), pair = nearest(PROJ.BEARINGS, deg), y = arm - rise, r = ROOMS.radiusAt(L, arm) - PROJ.OUT;
      for (const s of [1, -1]) {
        const b = s * deg * DEG, g = { x: r * Math.sin(b), y, z: r * Math.cos(b), rx: PROJ.TILT, ry: b + Math.PI, side: s, pair, bearing: s * deg, base, tier: ti, near: deg / 180 };
        const a = turned(g.rx, g.ry, APERTURE[0] * PROJ.SCALE, APERTURE[1] * PROJ.SCALE, APERTURE[2] * PROJ.SCALE);
        g.ax = g.x + a[0]; g.ay = g.y + a[1]; g.az = g.z + a[2];
        const dx = -g.ax, dz = FZ - g.az;
        g.D = Math.hypot(dx, dz); g.ix = dx / g.D; g.iz = dz / g.D;
        out.push(g);
      }
    }
    // Each projector's place going round the room, for the chase; and the mirror ball, which a look aims them all at.
    out.slice().sort((p, q) => (p.bearing + 360) % 360 - (q.bearing + 360) % 360).forEach((g, i) => { g.round = i; });
    // Each projector's place round the room among its own row's (`ti` of `tn`), and the dome's crown, which some looks
    // aim up at.
    for (let k = 0; k < TIERS.length; k++) {
      const row = out.filter((g) => g.tier === k).sort((p, q) => (p.bearing + 360) % 360 - (q.bearing + 360) % 360);
      row.forEach((g, i) => { g.ti = i; g.tn = row.length; });
    }
    out.ball = ballY(L); out.crown = L.c + L.R - 1.5; out.tiers = TIERS.length;
    return out;
  };
  // Where every beam points this moment, into `out` (`dir`, three numbers a beam; `on`; `color`), in the look `look`
  // and the show's colours `ca` and `cb`: mirrored fans dipping on the kick; tunnels spinning onto the floor; a pair of
  // beams scanning each fan; a level sheet over the crowd's heads; upright fans swaying side to side; every projector's
  // cone grazing the mirror ball, so the beams meet there from all round; a liquid sky, level fans over the heads with
  // a ripple running through them; a fan flashing from one projector after another round the room; crossfire, tight
  // fans sweeping the floor against their partners; and
  // while nothing kicks, a mesh of level fans from every projector drifting slowly over the heads so they cross into a
  // net; scissors, each fan's two halves crossing and parting on the beat (10); a prism, a wide level sheet in every
  // colour of the rainbow rolling slowly, its colours drifting along it (11); lighthouses, every projector's tight
  // cone landing on a ring round the floor and the ring turning a quarter a bar, so the spots chase round the room (12);
  // and a burst, every cone on the mirror ball opening wide on the kick, its beams in the show's two colours in turn
  // (13). Then the looks that play the three rows together: a cascade, upright fans falling from the top row onto the
  // floor, then the middle's, then the bottom's, one a beat and all of them on the bar's last (14); a figure eight, every
  // projector on every row bundled onto one point tracing an eight over the floor, the bundles opening on the kick
  // (15); rings, each row's spots a ring round the floor's middle, the rows turning against each other and wider a row
  // up (16); a wave, level fans rising and falling in a wave running out from the booth round both sides and up the rows
  // (17); crossfire, the bottom row climbing to the crown as the top row comes down to the floor and back over four
  // bars, the middle row sweeping level across the room (18); scatter, tight bundles landing on spots drawn afresh every
  // half beat (19); glitter, single pairs of beams flicking out at random every sixteenth (20); a drift, every fan
  // wandering on its own slow curves (21); a lattice, fans aimed straight across the room at the projector opposite and
  // rolling, the rows and neighbours lighting by turns on the beat (22); a kaleidoscope, fans landing on a ring that
  // turns one way on one side of the room and the other on the other, each row a third of the way round from the next
  // (23); scissors across the room, each side's tight fans sweeping to the far wall and back through the other side's, a
  // row a third of a beat behind the one under it (24); and an aurora, upright curtains rising to the crown in every
  // colour, swaying (25). The beat moves the pulsing looks, the time `t` the flowing ones; `v` (0 to 1) varies a look a
  // little each time it comes round. Only the projectors whose pair's bit is set in `pairs` shine in a pulsing look
  // from 0 to 13 but the ball's and the chase's; the later looks light their own. `F` is scratch.
  const aim = (rigs, beat, t, kick, look, ca, cb, pairs, out, F, v = 0) => {
    for (let p = 0; p < rigs.length; p++) {
      const g = rigs[p], s = g.side, base = p * NB, D = g.D;
      let tx = g.ax + g.ix * D * 0.6, ty = 2.4, tz = g.az + g.iz * D * 0.6, cone = 0, spread = 0, roll = 0, spin = 0, color = p % 2 ? cb : ca, lit = -1, on = (pairs >> g.pair & 1) === 1, ripple = 0;
      let scissor = 0, rainbow = -1, alternate = false, ball = false, abs = false;
      if (look >= 14) {
        // Every later look lights its own projectors and, but the drift's and the wave's, aims at heights in the room
        // rather than over each row's own floor; a colour a row unless it says otherwise.
        on = true; abs = true; color = g.tier % 2 ? cb : ca;
        if (look === 14) {
          const q = ((beat % 4) + 4) % 4, step = Math.floor(q);
          on = step === 3 || step === rigs.tiers - 1 - g.tier;
          tx = g.ax + g.ix * D * (0.3 + 0.12 * v); tz = g.az + g.iz * D * (0.3 + 0.12 * v); ty = 0;
          spread = 0.3 + 0.2 * v; roll = Math.PI / 2 + s * 0.2 * Math.sin(beat * Math.PI / 2);
        } else if (look === 15) {
          const th = beat * Math.PI / 8, w = v < 0.5 ? 1 : -1;
          tx = 5.5 * w * Math.sin(th); tz = FZ + 3.5 * Math.sin(2 * th); ty = 2.2 + 0.8 * Math.sin(3 * th);
          cone = 0.01 + 0.035 * kick; spin = (p % 2 ? 1 : -1) * beat * Math.PI / 2; alternate = true;
        } else if (look === 16) {
          const dir = g.tier % 2 ? -1 : 1, rad = 2.5 + 1.8 * g.tier + 1.5 * v, a = dir * beat * Math.PI / 8 + g.ti / g.tn * TAU;
          tx = rad * Math.cos(a); tz = FZ + rad * Math.sin(a); ty = 0;
          cone = 0.03 + 0.012 * g.tier + 0.015 * kick; spin = dir * beat * Math.PI / 2;
        } else if (look === 17) {
          abs = false; color = p % 2 ? cb : ca;
          const ph = beat * Math.PI / 2 - g.near * TAU - g.tier * Math.PI / 3;
          tx = g.ax + g.ix * D * 0.6; tz = g.az + g.iz * D * 0.6; ty = 2.3 + 1.1 * Math.sin(ph) - 0.3 * kick;
          spread = 0.7 + 0.2 * v; roll = s * 0.25 * Math.cos(ph);
        } else if (look === 18) {
          if (g.tier === 1) {
            tx = -g.ax * 0.6; tz = FZ - (g.az - FZ) * 0.6; ty = g.ay - 0.5 + Math.sin(beat * Math.PI / 4);
            spread = 0.5; roll = s * 0.3;
          } else {
            const k = 0.5 - 0.5 * Math.cos(beat * Math.PI / 8), r = g.tier === 0 ? k : 1 - k;
            tx = g.ax * 0.15; tz = FZ + (g.az - FZ) * 0.15; ty = r * rigs.crown;
            spread = 0.35 + 0.1 * v; roll = s * beat * Math.PI / 8;
          }
        } else if (look === 19) {
          const k = Math.floor(beat * 2), h = hash01(k + 17 * v, p), ang = hash01(k, p + 50) * TAU, rad = 1 + 8 * Math.sqrt(hash01(k, p + 90));
          on = h < 0.4 + 0.3 * kick;
          tx = rad * Math.cos(ang); tz = FZ + rad * Math.sin(ang); ty = 0;
          cone = 0.012; spin = beat * 3; color = hash01(k, p + 7) < 0.5 ? ca : cb;
        } else if (look === 20) {
          const k = Math.floor(beat * 4), h = hash01(k + 31 * v, p), far = 0.4 + 0.5 * hash01(k, p + 99);
          on = h < 0.55; lit = Math.floor(hash01(k, p + 33) * (NB >> 1));
          tx = g.ax + g.ix * D * far; tz = g.az + g.iz * D * far; ty = g.base + 1 + 2 * hash01(k, p + 11);
          spread = 1.1 + 0.3 * v; roll = (hash01(k, p + 66) - 0.5) * 1.6; color = h < 0.27 ? ca : cb;
        } else if (look === 21) {
          abs = false; color = p % 2 ? cb : ca;
          const f1 = 0.11 + 0.1 * hash01(p, 1), f2 = 0.09 + 0.1 * hash01(p, 2), f3 = 0.13 + 0.1 * hash01(p, 3), q1 = TAU * hash01(p, 4), q2 = TAU * hash01(p, 5);
          tx = 7 * Math.sin(t * f1 + q1); tz = FZ + 7 * Math.sin(t * f2 + q2); ty = 2.4 + 0.8 * Math.sin(t * f3 + q1);
          spread = 0.6 + 0.35 * Math.sin(t * f2 * 1.7 + q2); roll = 0.6 * Math.sin(t * f3 * 0.8 + q2); ripple = 0.015;
        } else if (look === 22) {
          on = (Math.floor(beat) + g.ti + g.tier) % 2 === 0;
          tx = -g.ax; tz = 2 * FZ - g.az; ty = g.ay - 0.4;
          spread = 0.55 + 0.15 * v; roll = s * beat * Math.PI / 16 + g.tier * Math.PI / 3;
        } else if (look === 23) {
          const a = beat * Math.PI / 8 + g.tier * TAU / 3 + (v < 0.5 ? 0 : Math.PI / 4);
          tx = s * 4.5 * Math.sin(a); tz = FZ + 4.5 * Math.cos(a); ty = 1.2 + 0.6 * g.tier;
          spread = 0.6; roll = s * beat * Math.PI / 4;
        } else if (look === 24) {
          const ph = beat / 2 + g.tier / 3, f = ((ph % 1) + 1) % 1, e = Math.sin((1 - 2 * Math.abs(2 * f - 1)) * Math.PI / 2);
          tx = s * 7 * e; tz = FZ + 2 * Math.sin(beat * Math.PI / 8); ty = g.base + 1.6;
          spread = 0.18 + 0.1 * v; roll = Math.PI / 2; color = s > 0 ? ca : cb;
        } else {
          tx = g.ax * 0.25 + 3 * Math.sin(t * 0.17 + g.round); tz = FZ + (g.az - FZ) * 0.25; ty = rigs.crown;
          spread = 0.8; roll = Math.PI / 2 + 0.3 * Math.sin(t * 0.21 + p); ripple = 0.03; rainbow = Math.floor(t * 0.8 + g.round);
        }
        // One time in five the look comes round in a rainbow round the room instead of the show's colours.
        if (v > 0.8 && rainbow < 0 && look !== 19 && look !== 20) rainbow = g.round + 2 * g.tier;
      } else if (look === 10) {
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
        tx = 0; ty = rigs.ball; tz = FZ; ball = true;
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
        tx = 0; ty = rigs.ball; tz = FZ; ball = true;
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
      }
      if (!ball && !abs) ty += g.base;
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
  // A laser projector in its own frame, its front +z, after a club projector: a housing with its edges picked out, a
  // vented lid and a carry handle, finned sides, rubber feet; on its face a framed emission window, the lens ring and
  // its hot spot over the two scanner mirrors behind the glass (all of it lit with the show through the node's glow),
  // a row of status lamps, a small display and the key; behind, two fans in their guards, the inputs and the mains
  // socket; a warning label on the lid.
  const projector = (k) => {
    const { w, h, d } = BODY, f = d / 2;
    // Every part laid on the housing stands at least 6 mm proud of the face under it (the node is drawn PROJ.SCALE
    // larger), since faces nearer than that flicker from across the room.
    k.box(w, h, d, C.housing, 0, 0, 0);
    for (let v = 0; v < 6; v++) k.box(w - 0.08, 0.005, 0.008, C.trim, 0, h / 2 + 0.0025, -0.04 - v * 0.018);
    k.box(0.07, 0.005, 0.05, "#ffcf00", 0.07, h / 2 + 0.0025, 0.08, { emissive: 0.2 });
    for (const sx of [-0.07, 0.07]) k.box(0.012, 0.03, 0.012, C.frame, sx, h / 2 + 0.015, 0.02);
    k.box(0.16, 0.012, 0.016, C.frame, 0, h / 2 + 0.032, 0.02);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.014, 0.016, 0.01, C.rubber, sx * (w / 2 - 0.03), -h / 2 - 0.005, sz * (f - 0.04), { seg: 8 });
    for (const s of [-1, 1]) for (let fi = 0; fi < 7; fi++) k.box(0.022, 0.005, d - 0.04, C.fin, s * (w / 2 + 0.011), -h / 2 + 0.02 + fi * 0.022, -0.01);
    // The face: its bezel, the window's frame and tinted glass, the lens ring and hot spot, the galvo mirrors.
    k.box(w + 0.01, h + 0.01, 0.012, C.trim, 0, 0, f + 0.006);
    const wy = APERTURE[1];
    for (const sy of [-1, 1]) k.box(0.15, 0.009, 0.014, C.frame, 0, wy + sy * 0.038, f + 0.019);
    for (const sx of [-1, 1]) k.box(0.01, 0.067, 0.014, C.frame, sx * 0.07, wy, f + 0.019);
    k.box(0.13, 0.067, 0.008, C.glass, 0, wy, f + 0.016, { emissive: 0.35 });
    k.torus(0.016, 0.0022, "#9fd8ff", 0, wy, f + 0.026, { rx: Math.PI / 2, seg: 16, sides: 4, emissive: 0.8 });
    k.ball(0.006, "#ffffff", 0, wy, f + 0.024, { seg: 8, emissive: 1 });
    // Status lamps, a little display and the key switch.
    ["#3cff7a", "#ffb04d", "#ff3a4a", "#3b8bff"].forEach((color, i) => k.box(0.009, 0.009, 0.004, color, -0.125 + i * 0.016, 0.055, f + 0.014, { emissive: 1 }));
    k.box(0.05, 0.022, 0.004, "#0d2a3a", 0.075, 0.055, f + 0.014, { emissive: 0.7 });
    k.cyl(0.011, 0.011, 0.012, C.knob, 0.125, -0.05, f + 0.018, { rx: Math.PI / 2, seg: 10 });
    k.box(0.004, 0.014, 0.008, C.steel, 0.125, -0.05, f + 0.032);
    // Behind: two fans in their guards, the ILDA and DMX inputs and the mains socket.
    for (const fx of [-0.07, 0.07]) {
      k.cyl(0.045, 0.045, 0.006, C.trim, fx, 0.01, -f - 0.003, { rx: Math.PI / 2, seg: 16 });
      k.torus(0.045, 0.005, C.fin, fx, 0.01, -f - 0.007, { rx: Math.PI / 2, seg: 16, sides: 4 });
      k.torus(0.026, 0.003, C.fin, fx, 0.01, -f - 0.007, { rx: Math.PI / 2, seg: 12, sides: 4 });
      k.box(0.084, 0.004, 0.004, C.fin, fx, 0.01, -f - 0.007);
      k.box(0.004, 0.084, 0.004, C.fin, fx, 0.01, -f - 0.007);
    }
    k.box(0.05, 0.018, 0.012, C.frame, -0.07, -0.06, -f - 0.006);
    for (const [cx, color] of [[0.035, C.steel], [0.075, "#2a5ad8"], [0.115, C.steel]]) k.cyl(0.011, 0.011, 0.014, color, cx, -0.06, -f - 0.007, { rx: Math.PI / 2, seg: 10 });
  };
  // A projector's wall bracket, in a frame on the wall at the projector's pivot height with +z into the room, the wall
  // there leaning `slope` into the room for each metre up (the dome's, high up): a plate bolted flat on the wall, a
  // braced arm `out` from the wall with a pipe stub across its end, a clamp on the pipe and a yoke down to the
  // projector's pivots with their knobs, a safety cable, and the power lead from the wall to the projector's back.
  const bracket = (K, slope = 0, out = PROJ.OUT) => {
    const S = PROJ.SCALE, top = S * (BODY.h / 2 + 0.17), side = S * (BODY.w / 2 + 0.045), wall = (y) => (y - PLATE_Y) * slope, lean = Math.atan(slope);
    K.box(0.3, 0.46, 0.03, C.plate, 0, PLATE_Y, 0.015, { rx: lean });
    for (const bx of [-0.1, 0.1]) for (const by of [-0.1, 0.26]) K.cyl(0.014, 0.014, 0.012, C.steel, bx, by, wall(by) + 0.034, { rx: Math.PI / 2 + lean, seg: 8 });
    const z0 = wall(top + 0.08);
    K.box(0.06, 0.06, out - z0, C.rig, 0, top + 0.08, (z0 + out) / 2);
    rod(K, [0, top - 0.24, wall(top - 0.24) + 0.02], [0, top + 0.06, z0 + 0.22], 0.02, C.rig);
    K.cyl(0.026, 0.026, 2 * side + 0.12, C.steel, 0, top + 0.06, out, { rz: Math.PI / 2, seg: 12 });
    K.box(0.09, 0.07, 0.09, C.frame, 0, top + 0.05, out);
    K.cyl(0.02, 0.02, 0.05, C.knob, 0, top + 0.09, out + 0.04, { rx: Math.PI / 2, seg: 8 });
    K.box(2 * side + 0.04, 0.03, 0.07, C.housing, 0, top - 0.005, out);
    for (const s of [-1, 1]) {
      K.box(0.022, top - 0.01, 0.07, C.housing, s * side, top / 2, out);
      K.cyl(0.036, 0.036, 0.04, C.knob, s * (side + 0.03), 0, out, { rz: Math.PI / 2, seg: 10 });
      K.box(0.012, 0.05, 0.012, C.steel, s * (side + 0.052), 0, out, { rz: Math.PI / 2 });
    }
    K.box(0.006, 0.006, (out - z0) * 0.9, C.chain, 0.04, top + 0.125, (z0 + out) / 2);
    rod(K, [0.1, -0.06, wall(-0.06) + 0.03], [0.09, -0.12, out * 0.55], 0.008, C.rubber);
    rod(K, [0.09, -0.12, out * 0.55], [0.06, -0.06 * S, out - S * BODY.d / 2], 0.008, C.rubber);
  };

  // ---------- the speakers ----------
  // A speaker's cone round its node's +y, which the node turns out of the box's face: the cone, its dust cap and a lit
  // ring round it in `ring` that glows on the kick. A box's lit strip along its foot, in `color`, on a node of its own.
  const cone = (rr, ring) => (k) => {
    k.torus(rr * 1.02, 0.012, C.frame, 0, -0.004, 0, { seg: 24, sides: 4 });
    k.torus(rr * 0.9, 0.016, C.rubber, 0, -0.006, 0, { seg: 24, sides: 6 });
    k.cyl(rr * 0.82, rr * 0.4, 0.05, "#08080a", 0, -0.03, 0, { seg: 20 });
    k.ball(rr * 0.3, "#34343a", 0, -0.008, 0, { seg: 10 });
    k.torus(rr * 0.66, 0.008, ring, 0, 0.001, 0, { seg: 20, sides: 4, emissive: 1 });
  };
  const speakerStrip = (color) => (k) => k.box(BOX.w - 0.08, 0.012, 0.012, color, 0, 0, 0, { emissive: 0.7, glow: true });
  // A line array hung off the wall, in a frame at the foot of the wall under it with +z into the room, after a touring
  // rig: a braced bracket out from the wall, a chain motor hung under its end with its chain bag, the steel flying
  // frame on the motor's chain and a safety steel, and `n` boxes hung below it in a curve, each from the bottom back
  // edge of the one above and tipped a little further down. A box is narrower behind than in front, as a line array's
  // boxes are, so the hang can splay: its front framed round a mesh grille, two woofers either side of a flared
  // waveguide, a lit strip along its foot and a badge; steel link plates down its front corners and an angle bar down
  // its back, each pinned with a red pin; handles and a connector plate behind, and the loom down the back. The woofers
  // and strips are nodes of their own (`name`, the box and the side), sharing `shared`'s woofer and strip, builders
  // until the first is built and then their geometry.
  const BACK_W = 0.78;
  const lineArray = (K, n, name, shared, tip, top, slope = 0) => {
    const out = HANG_OUT, W = BOX.w, H = BOX.h, D = BOX.d, front = D / 2, wall = (y) => (y - top - 0.45) * slope, lean = Math.atan(slope);
    // The bracket, and the motor under its end on a shackle, its hook down to the frame, its chain bag beside it.
    K.box(0.6, 0.5, 0.03, C.plate, 0, top + 0.45, 0.015, { rx: lean });
    for (const bx of [-0.2, 0.2]) for (const by of [0.28, 0.62]) K.cyl(0.016, 0.016, 0.012, C.steel, bx, top + by, wall(top + by) + 0.034, { rx: Math.PI / 2 + lean, seg: 8 });
    const z0 = wall(top + 0.6);
    for (const sx of [-0.22, 0.22]) {
      K.box(0.06, 0.08, out + 0.15 - z0, C.rig, sx, top + 0.6, (z0 + out + 0.15) / 2);
      rod(K, [sx, top + 0.2, wall(top + 0.2) + 0.02], [sx, top + 0.57, z0 + 0.45], 0.025, C.rig);
    }
    K.box(0.56, 0.06, 0.06, C.rig, 0, top + 0.6, out + 0.1);
    K.torus(0.03, 0.007, C.steel, 0, top + 0.54, out + 0.1, { seg: 12, sides: 4 });
    K.box(0.18, 0.16, 0.15, C.motor, 0, top + 0.42, out + 0.1);
    K.cyl(0.065, 0.065, 0.2, C.motor, 0, top + 0.42, out + 0.1, { rz: Math.PI / 2, seg: 14 });
    K.box(0.1, 0.04, 0.02, "#d8a018", 0, top + 0.44, out + 0.18, { emissive: 0.1 });
    K.cyl(0.06, 0.05, 0.18, C.rubber, 0.17, top + 0.35, out + 0.1, { seg: 12 });
    K.box(0.014, 0.18, 0.014, C.chain, 0, top + 0.25, out + 0.1);
    K.box(0.006, 0.5, 0.006, C.chain, 0.3, top + 0.33, out - 0.15);
    // The flying frame: side rails, cross bars and a spreader with the pickup.
    for (const sx of [-1, 1]) K.box(0.04, 0.08, D + 0.12, C.steel, sx * (W / 2 + 0.02), top + 0.06, out);
    for (const sz of [-1, 1]) K.box(W + 0.08, 0.05, 0.04, C.steel, 0, top + 0.06, out + sz * (D / 2 + 0.04));
    K.box(0.06, 0.06, D + 0.08, C.rig, 0, top + 0.11, out);
    K.torus(0.03, 0.007, C.steel, 0, top + 0.17, out + 0.1, { rx: Math.PI / 2, seg: 12, sides: 4 });
    let y = top + 0.02, z = out - D / 2, tilt = 0;
    for (let k = 0; k < n; k++) {
      tilt += SPLAY[k] * DEG;
      const c = Math.cos(tilt), s = Math.sin(tilt), cy = y - (H / 2) * c - (D / 2) * s, cz = z - (H / 2) * s + (D / 2) * c;
      const g = K.group(0, cy, cz, 0, tilt);
      g.prism([[-BACK_W / 2, -front], [BACK_W / 2, -front], [W / 2, front], [-W / 2, front]], H, C.cab, 0, 0, 0, { rx: Math.PI / 2 });
      // The face, every layer standing well proud of the one under it (no two faces nearer than 6 mm, which flicker):
      // the mesh on the cabinet's front, the frame round it from the front out, the waveguide's ring and slot over its
      // throat, the badge, and the woofers and strip on nodes of their own.
      const mesh = front + 0.008;
      for (const sy of [-1, 1]) g.box(W, 0.018, 0.02, C.frame, 0, sy * (H / 2 - 0.009), front + 0.01);
      for (const sx of [-1, 1]) g.box(0.022, H - 0.036, 0.02, C.frame, sx * (W / 2 - 0.011), 0, front + 0.01);
      g.box(W - 0.044, H - 0.036, 0.008, C.mesh, 0, 0, front + 0.004);
      for (const sy of [-1, 1]) g.box(0.3, 0.02, 0.018, C.frame, 0, 0.005 + sy * 0.11, mesh + 0.009);
      for (const sx of [-1, 1]) g.box(0.025, 0.2, 0.018, C.frame, sx * 0.1375, 0.005, mesh + 0.009);
      g.box(0.2, 0.2, 0.006, C.throat, 0, 0.005, mesh + 0.003);
      g.box(0.022, 0.18, 0.012, "#2a2a30", 0, 0.005, mesh + 0.012);
      g.box(0.09, 0.02, 0.012, C.badge, W / 2 - 0.09, H / 2 - 0.038, mesh + 0.006, { emissive: 0.25 });
      shared.strip = g.node(`speakerStrip${name}_${k}`, shared.strip, 0, -H / 2 + 0.024, mesh + 0.008, { rx: tilt, glow: true }).geometry;
      for (const sx of [-1, 1]) {
        shared.woofer = g.node(`${name}_${k}_${sx < 0 ? 0 : 1}`, shared.woofer, sx * 0.34, 0.01, mesh + 0.024, { rx: Math.PI / 2 + tilt, target: k === 1 && sx < 0 ? tip : null }).geometry;
      }
      // The rigging: a link plate at each front corner with its pin, an angle bar down the back with its pin.
      for (const sx of [-1, 1]) {
        g.box(0.012, H + 0.04, 0.07, C.steel, sx * (W / 2 + 0.006), -0.01, front - 0.06);
        g.cyl(0.009, 0.009, 0.04, C.steel, sx * (W / 2 + 0.02), H / 2 - 0.04, front - 0.06, { rz: Math.PI / 2, seg: 8 });
        g.torus(0.014, 0.004, C.pin, sx * (W / 2 + 0.042), H / 2 - 0.04, front - 0.06, { ry: Math.PI / 2, seg: 10, sides: 4 });
      }
      g.box(0.05, H + 0.03, 0.022, C.steel, 0, -0.01, -front - 0.011);
      for (const hy of [-0.08, 0, 0.08]) g.cyl(0.008, 0.008, 0.024, C.throat, 0, hy, -front - 0.013, { rx: Math.PI / 2, seg: 8 });
      g.torus(0.014, 0.004, C.pin, 0.032, 0.08, -front - 0.024, { seg: 10, sides: 4 });
      // Behind: the handles' recesses, the connector plate, and the loom running down past the box.
      for (const sx of [-1, 1]) g.box(0.12, 0.045, 0.012, C.throat, sx * 0.24, 0.06, -front - 0.004);
      g.box(0.12, 0.08, 0.006, C.frame, 0.23, -0.07, -front - 0.003);
      for (const cx of [0.2, 0.26]) g.cyl(0.016, 0.016, 0.02, C.steel, cx, -0.07, -front - 0.01, { rx: Math.PI / 2, seg: 10 });
      g.cyl(0.02, 0.02, H + 0.01, C.rubber, 0.33, 0, -front - 0.035, { seg: 8 });
      y -= H * c; z -= H * s;
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
  // A booth monitor on a tripod stand on the deck at (x, z), turned to face (tx, tz) and level: the
  // cabinet, its baffle, woofer and horn, a power lamp, and the stand's pole and legs.
  const boothMonitor = (K, x, y, z, tx, tz) => {
    const ry = Math.atan2(tx - x, tz - z), top = y + 1.02;
    for (let k = 0; k < 3; k++) {
      const a = ry + k * TAU / 3;
      rod(K, [x, y + 0.42, z], [x + 0.36 * Math.sin(a), y + 0.01, z + 0.36 * Math.cos(a)], 0.012, C.rig);
    }
    K.cyl(0.02, 0.02, top - y, C.rig, x, (y + top) / 2, z, { seg: 8 });
    const g = K.group(x, top + 0.34, z, ry);
    g.box(0.42, 0.66, 0.4, C.cab, 0, 0, 0);
    g.box(0.38, 0.62, 0.012, C.grille, 0, 0, 0.204);
    g.torus(0.135, 0.012, "#26262c", 0, -0.1, 0.212, { rx: Math.PI / 2, seg: 20, sides: 4 });
    g.cyl(0.12, 0.07, 0.03, "#08080a", 0, -0.1, 0.205, { rx: Math.PI / 2, seg: 18 });
    g.box(0.22, 0.1, 0.025, C.horn, 0, 0.2, 0.222);
    g.box(0.014, 0.014, 0.008, STAGE_C.led, 0.16, -0.28, 0.218, { emissive: 1, glow: true });
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
  // The balcony as a real one is built: a steel ledger bolted along the wall; a tapered I-beam out from it every BEAM
  // degrees, deep at the wall and shallow at the edge, each held up by a raking strut down to a plate on the wall
  // (but where a line array or a laser hangs under it); a ring joist halfway out and a channel along the edge, lit along its
  // face, with warm downlights under it; on them the floor's laminated glass, a dark joint over every beam and along
  // the joist; and a frameless glass balustrade in a steel shoe along the edge and across both ends, a brushed steel
  // cap along its top. Then the boxes that hold an Ooga up on it, keep one under it from flying up through it, and
  // keep one on it from walking off over the balustrade.
  const balcony = (K, L) => {
    const { R, Y1, DEPTH, OPEN, RAIL, SEG, BEAM, GLASS } = BALCONY, Y0 = Y1 - DEPTH, S = BALCONY_C, span = 360 - 2 * OPEN;
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
      // (none at either end, where the balustrade across the end stands over that line).
      if (k > 0 && k < n) member(geo, b, edge, wall, Y1 + 0.008, Y1 + 0.008, Y1 - 0.006, Y1 - 0.006, 0.012, S.joint);
      const lamp = polar(R + 0.35, b);
      K.cyl(0.07, 0.07, 0.03, S.steel, lamp.x, d0 - 0.005, lamp.z, { seg: 10 });
      K.cyl(0.05, 0.05, 0.01, S.lamp, lamp.x, d0 - 0.02, lamp.z, { seg: 10, emissive: 1, glow: true });
      if (!clearOfHangings(b)) continue;
      // The strut, from a plate on the wall (which leans in as the dome closes) up to the beam's underside a third of
      // the way out.
      const foot = polar(ROOMS.radiusAt(L, Y1 - 1.7) - 0.12, b), head = polar(wall - (wall - R) * 0.62, b), hy = d1 + (d0 - d1) * 0.62, fy = Y1 - 1.7;
      rod(K, [foot.x, fy, foot.z], [head.x, hy, head.z], 0.045, S.steel);
      K.group(foot.x, fy, foot.z, b * DEG + Math.PI).box(0.24, 0.34, 0.03, S.steel, 0, 0, 0.015);
    }
    K.add(geo);
    // The floor: one sheet of glass from the edge channel to the wall, its joint along the joist.
    // Glass draws its back faces too, so its underside stands GLASS_LIFT clear of the steel under it, and a pane's foot
    // clear of its shoe, or the two would flicker where they meet.
    const floor = K.node("balconyGlass", (k) => k.sector(0, edge - 0.02, deep, a0, a1, under + GLASS_LIFT, Y1, S.glass), 0, 0, 0).geometry;
    floor.glassOpacity = GLASS; floor.glassGrazing = FLOOR_GRAZING; floor.castShadow = false;
    K.node("balconySheen", sheen(edge - 0.02, wall, a0, a1), 0, Y1 + SHEEN.LIFT, 0, { rx: -Math.PI / 2, glow: true });
    // Sliced apart from the glass and ending just inside it, so no face of one lies in a face of the other (they flicker).
    K.sector(0, mid - 0.012, mid + 0.012, a0 + 0.002, a1 - 0.002, Y1 - 0.006, Y1 + 0.008, S.joint, { steps: Math.max(4, Math.ceil((a1 - a0) / (3 * DEG))) + 1 });
    // The balustrade: its shoe, a pane a bay, and the cap; and across each end the same from the edge to the wall.
    K.sector(0, rail - 0.045, rail + 0.045, a0, a1, Y1 - SINK, Y1 + 0.1, S.shoe);
    K.sector(0, rail - 0.028, rail + 0.028, a0, a1, top - 0.06, top, S.rail);
    const gap = 0.012 / rail;
    const panes = K.node("balconyRail", (k) => {
      for (let j = 0; j < n; j++) {
        const b0 = a0 + (a1 - a0) * j / n, b1 = a0 + (a1 - a0) * (j + 1) / n;
        k.sector(0, rail - 0.008, rail + 0.008, b0 + gap, b1 - gap, Y1 + 0.1 + GLASS_LIFT, top - 0.06 - GLASS_LIFT, S.railGlass, { steps: 2 });
      }
      for (const b of [a0, a1]) {
        const g = k.group(0, 0, 0, b);
        g.box(0.016, RAIL - 0.16 - 2 * GLASS_LIFT, wall - rail - 0.1, S.railGlass, 0, Y1 + 0.1 + GLASS_LIFT + (RAIL - 0.16 - 2 * GLASS_LIFT) / 2, (rail + wall) / 2);
      }
    }, 0, 0, 0).geometry;
    panes.glassOpacity = GLASS; panes.castShadow = false;
    for (const b of [a0, a1]) {
      const g = K.group(0, 0, 0, b);
      g.box(0.09, 0.1 + SINK, wall - rail, S.shoe, 0, Y1 + (0.1 - SINK) / 2, (rail + wall) / 2);
      g.box(0.056, 0.06, wall - rail, S.rail, 0, top - 0.03, (rail + wall) / 2);
    }
    // Collision: the deck, the balustrade along the edge and across the ends.
    const m = Math.ceil(span / SEG), step = span / m, half = (wall - R) / 2;
    for (let j = 0; j < m; j++) {
      const b = 180 + OPEN + (j + 0.5) * step, deck = polar((R + wall) / 2, b), at = polar(rail, b);
      K.solid({ x: deck.x, z: deck.z, hx: wall * Math.sin(step / 2 * DEG) + 0.05, hz: half, ry: b * DEG, top: Y1, below: Y0, deck: true });
      K.solid({ x: at.x, z: at.z, hx: rail * Math.sin(step / 2 * DEG) + 0.02, hz: 0.05, ry: b * DEG, top, below: Y1, stay: true });
    }
    for (const b of [a0, a1]) { const c = polar((R + wall) / 2, b / DEG); K.solid({ x: c.x, z: c.z, hx: 0.05, hz: half, ry: b, top, below: Y1, stay: true }); }
  };
  // The ring as a suspended walkway is built: a steel box stringer along each edge, lit along its outer face, with
  // warm downlights under the outer one; a beam across between them every BEAM degrees; on them the floor's
  // laminated glass, a dark joint over every beam; a frameless glass balustrade in a steel shoe along both edges with
  // a brushed cap. Every HANG degrees, outside each stringer, a wire rope up to a plate on the dome, a clevis where it
  // takes the stringer, a turnbuckle low down and a socket at the plate. Then the boxes that hold an Ooga up on it,
  // keep one under it from flying up through it, and keep one on it from walking off over either balustrade (both
  // `stay`, so a walker slides along them rather than shouldering round).
  const ring = (K, L) => {
    const { DEPTH, RAIL, SEG, BEAM, GLASS } = BALCONY, { Y1, R0, R1, HANG, WIRE } = RING, Y0 = Y1 - DEPTH, S = BALCONY_C;
    const under = Y1 - 0.045, d0 = under - 0.3, top = Y1 + RAIL, geo = blank(), rails = [R0 + 0.05, R1 - 0.05];
    // The stringers, each a box section with a lit strip along its outer face.
    for (const [ri, ro, lit] of [[R0 - 0.16, R0, R0 - 0.17], [R1, R1 + 0.16, R1 + 0.16]]) {
      K.sector(0, ri, ro, 0, TAU, d0, under, S.edge);
      K.sector(0, lit, lit + 0.01, 0, TAU, Y1 - 0.2, Y1 - 0.17, PURPLE, { emissive: 1, glow: true });
    }
    const n = Math.round(360 / BEAM);
    for (let k = 0; k < n; k++) {
      const b = k * BEAM, h = under - 0.2;
      // The beam: its web, and its flanges top and bottom.
      member(geo, b, R0, R1, under, under, h, h, 0.02, S.steel);
      member(geo, b, R0, R1, under, under, under - 0.025, under - 0.025, 0.07, S.steel);
      member(geo, b, R0, R1, h + 0.025, h + 0.025, h, h, 0.07, S.steel);
      member(geo, b, R0 + 0.01, R1 - 0.01, Y1 + 0.008, Y1 + 0.008, Y1 - 0.006, Y1 - 0.006, 0.012, S.joint);
      const lamp = polar(R1 + 0.08, b + BEAM / 2);
      K.cyl(0.06, 0.06, 0.03, S.steel, lamp.x, d0 - 0.015, lamp.z, { seg: 10 });
      K.cyl(0.045, 0.045, 0.01, S.lamp, lamp.x, d0 - 0.03, lamp.z, { seg: 10, emissive: 1, glow: true });
    }
    // The hangers: from a clevis on the stringer's outer face straight up to a plate on the dome over it.
    const ceil = L.R * 0.99;
    for (let k = 0; k < 360 / HANG; k++) for (const [r, out] of [[R0 - 0.22, -1], [R1 + 0.22, 1]]) {
      const b = k * HANG + HANG / 2, p = polar(r, b), y0 = d0 + 0.06, y1 = L.c + Math.sqrt(ceil * ceil - r * r) - 0.02;
      const g = K.group(p.x, 0, p.z, b * DEG);
      g.box(0.025, 0.24, 0.14, S.steel, 0, d0 + 0.13, -out * 0.06);
      g.cyl(0.02, 0.02, 0.07, S.rail, 0, y0, 0, { rz: Math.PI / 2, seg: 8 });
      K.cyl(WIRE, WIRE, y1 - y0, S.rail, p.x, (y0 + y1) / 2, p.z, { seg: 6 });
      K.cyl(0.03, 0.03, 0.34, S.steel, p.x, y0 + 0.75, p.z, { seg: 8 });
      K.cyl(0.035, 0.035, 0.22, S.steel, p.x, y1 - 0.15, p.z, { seg: 8 });
      K.cyl(0.16, 0.16, 0.04, S.steel, p.x, y1, p.z, { seg: 12 });
    }
    K.add(geo);
    // The floor: one sheet of glass between the stringers.
    const floor = K.node("ringGlass", (k) => k.sector(0, R0, R1, 0, TAU, under + GLASS_LIFT, Y1, S.glass), 0, 0, 0).geometry;
    floor.glassOpacity = GLASS; floor.glassGrazing = FLOOR_GRAZING; floor.castShadow = false;
    K.node("ringSheen", sheen(R0, R1, 0, TAU), 0, Y1 + SHEEN.LIFT, 0, { rx: -Math.PI / 2, glow: true });
    // The balustrades: a shoe, a pane a bay and the cap along each edge.
    for (const r of rails) {
      K.sector(0, r - 0.045, r + 0.045, 0, TAU, Y1 - SINK, Y1 + 0.1, S.shoe);
      K.sector(0, r - 0.028, r + 0.028, 0, TAU, top - 0.06, top, S.rail);
    }
    const panes = K.node("ringRail", (k) => {
      for (const r of rails) {
        const gap = 0.012 / r;
        for (let j = 0; j < n; j++) k.sector(0, r - 0.008, r + 0.008, j * BEAM * DEG + gap, (j + 1) * BEAM * DEG - gap, Y1 + 0.1 + GLASS_LIFT, top - 0.06 - GLASS_LIFT, S.railGlass, { steps: 2 });
      }
    }, 0, 0, 0).geometry;
    panes.glassOpacity = GLASS; panes.castShadow = false;
    // Collision: the deck, and the balustrade along both edges.
    const m = Math.round(360 / SEG), step = 360 / m;
    for (let j = 0; j < m; j++) {
      const b = (j + 0.5) * step, deck = polar((R0 + R1) / 2, b);
      K.solid({ x: deck.x, z: deck.z, hx: R1 * Math.sin(step / 2 * DEG) + 0.05, hz: (R1 - R0) / 2, ry: b * DEG, top: Y1, below: Y0, deck: true });
      for (const r of rails) {
        const at = polar(r, b);
        K.solid({ x: at.x, z: at.z, hx: r * Math.sin(step / 2 * DEG) + 0.02, hz: 0.05, ry: b * DEG, top, below: Y1, stay: true });
      }
    }
  };

  // ---------- the booth's screen ----------
  // The screen's face round the booth's inside, `half` radians either side, in the frame of a node standing on its
  // middle with the curve's axis a radius `rs` behind it (the room's middle); seen from the room, its canvas's left on
  // the left.
  // A flat or gently curved screen facing +z, its picture mapped flat across x (a curve of a few degrees barely bends
  // it): `pts(t)` the point t (0 to 1, from +x to -x) along its foot in this frame, `n` columns of it, from Y0 to Y1.
  const flatScreen = (pts, n, Y0, Y1, canvas) => {
    const geo = blank();
    for (let i = 0; i < n; i++) {
      const p = pts(i / n), q = pts((i + 1) / n), nx = q[1] - p[1], nz = p[0] - q[0], l = Math.hypot(nx, nz) || 1;
      face(geo, [[p[0], Y0, p[1]], [q[0], Y0, q[1]], [q[0], Y1, q[1]], [p[0], Y1, p[1]]], [255, 255, 255], 1, [nx / l, 0, nz / l]);
    }
    const x0 = pts(1)[0], x1 = pts(0)[0];
    geo.castShadow = false;
    geo.imageSurface = { canvas, version: 1, rect: [x0, Y0, x1 - x0, Y1 - Y0], tessellated: true };
    return geo;
  };
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
  // The DJ's screen, made once per canvas, synthwave in the room's colours: a sky deepening up from its first colour, a
  // sun in gold banded into its second, the spectrum standing as a skyline on the horizon edged in the first colour,
  // and a grid in the second rolling toward the room, faster as the music hardens; the name on its plate glowing in
  // the first colour and swelling on the kick; the edges glowing with the kick.
  // `paint(dt, kick, I, bands, wave)` takes the music as the room read it (MUSIC); `colors(a, b)` the room's two
  // colours (the sky, sun and plates are drawn again only then).
  const SYNTH = { HORIZON: 0.6, SUN: 0.47, SKY: 48, LINES: 7, RAYS: 16, ROLL: 0.5, PLATE: 0.72 };
  const screens = new WeakMap();
  // A screen with no `centre` (the booth's ends and back) shows the scene without its sun and name, carrying the
  // front's round the booth. Every screen is drawn at the front's scale, SCREEN.H tall: one shorter than that (the back,
  // over the DJ's platform) shows a wider stretch of the same scene, never a squashed one.
  const screenOf = (canvas, centre = true) => {
    let screen = screens.get(canvas);
    if (screen) return screen;
    const P = RM.paintKit, { LOGO_W, LOGO_H } = SCREEN, k = canvas.height / SCREEN.H, W = canvas.width / k, H = SCREEN.H;
    const ctx = canvas.getContext("2d"), HY = H * SYNTH.HORIZON;
    const back = CH.canvas(canvas.width, canvas.height), b = back.getContext("2d"), logo = CH.canvas(LOGO_W + 40, LOGO_H + 40), l = logo.getContext("2d");
    const level = new Float32Array(SYNTH.SKY);
    let a = PALETTES[0][0], c = PALETTES[0][1], A = "", Cc = "", roll = 0;
    const plate = (x, frame, lines) => {
      x.clearRect(0, 0, LOGO_W + 40, LOGO_H + 40);
      x.save(); x.shadowColor = frame; x.shadowBlur = 22; x.fillStyle = C.ink; P.roundRect(x, 22, 22, LOGO_W - 4, LOGO_H - 4, 16); x.fill();
      x.strokeStyle = frame; x.lineWidth = 4; x.stroke(); x.restore();
      lines(x);
    };
    const colors = (na, nc) => {
      a = na; c = nc; A = rgbStyle(a, 1.25); Cc = rgbStyle(c, 1.25);
      b.setTransform(k, 0, 0, k, 0, 0);
      const sky = b.createLinearGradient(0, 0, 0, HY);
      sky.addColorStop(0, "#06030b"); sky.addColorStop(0.55, rgbStyle(a, 0.28)); sky.addColorStop(1, rgbStyle(a, 0.6));
      b.fillStyle = sky; b.fillRect(0, 0, W, HY);
      b.fillStyle = "#06030b"; b.fillRect(0, HY, W, H - HY);
      if (!centre) return;
      const R = H * SYNTH.SUN, sun = b.createLinearGradient(0, HY - R, 0, HY);
      sun.addColorStop(0, FLASH); sun.addColorStop(1, rgbStyle(c, 1.3));
      b.save(); b.beginPath(); b.arc(W / 2, HY, R, Math.PI, TAU); b.clip(); b.fillStyle = sun; b.fillRect(W / 2 - R, HY - R, 2 * R, R);
      b.fillStyle = rgbStyle(a, 0.35); for (let k = 0; k < 6; k++) b.fillRect(W / 2 - R, HY - R * 0.45 + k * R * 0.085, 2 * R, 1 + k * 0.9); b.restore();
      plate(l, A, (x) => P.pix(x, "BLOCK PARTY", LOGO_W / 2 + 20, LOGO_H / 2 + 20, Math.min(LOGO_H * 0.42, (LOGO_W - 40) / P.pixWidth("BLOCK PARTY", 1)), C.label));
    };
    colors(a, c);
    const paint = (dt, kick, I, bands) => {
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(back, 0, 0);
      ctx.setTransform(k, 0, 0, k, 0, 0);
      // The skyline: the spectrum's bands as towers along the horizon, low in the middle behind the sun (as many as fit
      // at the front's width apart on a narrower screen, all their height).
      const n = centre ? SYNTH.SKY : Math.max(4, Math.round(SYNTH.SKY * W / SCREEN.W)), pitch = W / n, per = MUSIC.BANDS / n;
      for (let i = 0; i < n; i++) {
        let v = 0;
        for (let j = Math.floor(i * per); j < Math.floor((i + 1) * per); j++) v = Math.max(v, bands[j]);
        level[i] = v > level[i] ? v : Math.max(v, level[i] - dt * 2);
      }
      for (let i = 0; i < n; i++) {
        const x = (i % 2 ? W / 2 + Math.floor(i / 2) * pitch : W / 2 - (Math.floor(i / 2) + 1) * pitch), from = centre ? Math.abs(x + pitch / 2 - W / 2) / (W / 2) : 1;
        const h = (4 + clamp01(level[i] * 1.2) * HY * 0.7) * (0.35 + 0.65 * from);
        ctx.fillStyle = "#0d0618"; ctx.fillRect(x + 1, HY - h, pitch - 2, h);
        ctx.fillStyle = A; ctx.fillRect(x + 1, HY - h, pitch - 2, 2);
      }
      // The grid rolling toward the room.
      roll = (roll + dt * SYNTH.ROLL * (0.6 + 1.4 * I)) % 1;
      ctx.strokeStyle = Cc; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(0, HY); ctx.lineTo(W, HY);
      for (let k = 0; k < SYNTH.LINES; k++) { const y = HY + Math.pow((k + roll) / SYNTH.LINES, 2) * (H - HY); ctx.moveTo(0, y); ctx.lineTo(W, y); }
      for (let k = -SYNTH.RAYS; k <= SYNTH.RAYS; k++) { ctx.moveTo(W / 2 + k * 14, HY); ctx.lineTo(W / 2 + k * 90, H); }
      ctx.stroke(); ctx.globalAlpha = 1;
      if (centre) {
        const s = SYNTH.PLATE * (1 + 0.04 * kick * I), lw = (LOGO_W + 40) * s, lh = (LOGO_H + 40) * s;
        ctx.drawImage(logo, (W - lw) / 2, H * 0.47 - lh / 2, lw, lh);
      }
      ctx.fillStyle = A; ctx.globalAlpha = 0.25 + 0.45 * kick * I;
      ctx.fillRect(0, 0, W, 4); ctx.fillRect(0, H - 4, W, 4);
      ctx.globalAlpha = 1;
    };
    screen = { paint, colors };
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
    const hist = CH.canvas(half, H), hc = hist.getContext("2d"), col = hc.createImageData(1, H), cpx = col.data;
    hc.fillStyle = "#06030b"; hc.fillRect(0, 0, half, H);
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
    // The chain's blocks: a cube in three-quarter view, its front a grid of lit cells, edges glowing, in each colour and
    // pattern; and the link between two, a pair of bars.
    const { D } = CHAIN, cubes = [], linkStyles = ["#fff", "#fff"], glow = CH.canvas(64, 64), gl = glow.getContext("2d");
    const soft = gl.createRadialGradient(32, 32, 0, 32, 32, 32);
    soft.addColorStop(0, "rgba(244,242,255,1)"); soft.addColorStop(0.35, "rgba(244,242,255,0.45)"); soft.addColorStop(1, "rgba(244,242,255,0)");
    gl.fillStyle = soft; gl.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 2 * CHAIN.VARIANTS; i++) cubes.push(CH.canvas(D, D));
    const cells = [];
    for (let v = 0; v < CHAIN.VARIANTS; v++) { const m = []; for (let k = 0; k < 16; k++) m.push(Math.random() < 0.45 || k === 5 || k === 10); cells.push(m); }
    const cube = (cv, c, lit) => {
      const x = cv.getContext("2d"), f = D * 0.56, d = D * 0.16, x0 = D * 0.12, y0 = D * 0.3;
      x.clearRect(0, 0, D, D);
      const poly = (pts, fill) => { x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); x.closePath(); x.fillStyle = fill; x.fill(); };
      poly([x0, y0, x0 + d, y0 - d, x0 + f + d, y0 - d, x0 + f, y0], rgbStyle(c, 0.75));
      poly([x0 + f, y0, x0 + f + d, y0 - d, x0 + f + d, y0 + f - d, x0 + f, y0 + f], rgbStyle(c, 0.4));
      poly([x0, y0, x0 + f, y0, x0 + f, y0 + f, x0, y0 + f], rgbStyle(c, 0.22));
      const cell = f / 4;
      for (let k = 0; k < 16; k++) {
        if (!lit[k]) continue;
        x.fillStyle = k === 5 || k === 10 ? "#f4f2ff" : rgbStyle(c, 1.35);
        x.fillRect(x0 + (k & 3) * cell + cell * 0.25, y0 + (k >> 2) * cell + cell * 0.25, cell * 0.5, cell * 0.5);
      }
      x.save(); x.shadowColor = rgbStyle(c, 1.4); x.shadowBlur = D * 0.08; x.strokeStyle = rgbStyle(c, 1.5); x.lineWidth = D * 0.035; x.lineJoin = "round";
      x.beginPath();
      x.moveTo(x0, y0); x.lineTo(x0 + f, y0); x.lineTo(x0 + f, y0 + f); x.lineTo(x0, y0 + f); x.closePath();
      x.moveTo(x0, y0); x.lineTo(x0 + d, y0 - d); x.lineTo(x0 + f + d, y0 - d); x.lineTo(x0 + f, y0);
      x.moveTo(x0 + f + d, y0 - d); x.lineTo(x0 + f + d, y0 + f - d); x.lineTo(x0 + f, y0 + f);
      x.stroke(); x.restore();
    };
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
      bodyStyle = rgbStyle(a, 0.16);
      for (let i = 0; i < cubes.length; i++) cube(cubes[i], i & 1 ? bb : a, cells[i >> 1]);
      linkStyles[0] = rgbStyle(a, 1.2); linkStyles[1] = rgbStyle(bb, 1.2);
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
        // Each new column in the room's colours as they are this moment (the colours fade frame by frame, not in the
        // steps the other looks take them in), so a change of colours flows out round the wall without a seam.
        hc.drawImage(hist, 1, 0);
        const ca = M.a, cb = M.b;
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
      } else if (look === WALLS.CHAIN) {
        // A block pops in at the booth on the second and fourth beat of the bar (the odd ones counting from 0, which the
        // backbeat keeps on the music's claps) and pushes the chain out a slot each way, starting on the beat and most of
        // the way there within PUSH of it, overshooting a little and settling; the blocks dim as they go out. Each block
        // is known by how many pushes have come since it popped, so the chain needs no state and is whole at once.
        const beat = M.beat, at = Math.floor(beat), n = Math.floor((at + 1) / 2), u = n > 0 ? beat - (2 * n - 1) : 2;
        const p = Math.min(1, u / CHAIN.PUSH), e = p >= 1 ? 1 : 1 + 2.2 * (p - 1) ** 3 + 1.2 * (p - 1) ** 2;
        const { DRAW, SLOT, ASPECT } = CHAIN, sw = DRAW * ASPECT, cy = H / 2, count = Math.ceil(half / SLOT) + 1;
        // A block's middle, `slot` slots out from the booth: the two newest half a slot either side of it, so they stand
        // a slot apart as every other two do.
        const bodyY = cy - DRAW / 2, mid = (slot) => half + (slot + 0.5) * SLOT, slotOf = (k) => k === 0 ? 0 : k - 1 + e;
        ctx.globalAlpha = alpha;
        // The links first, under the blocks: two bars between each pair on each side, none across the booth between the
        // two newest.
        for (let k = count; k >= 1; k--) {
          const xa = mid(slotOf(k - 1)), xb = mid(slotOf(k)), fade = Math.max(0.25, 1 - slotOf(k) * SLOT / half);
          ctx.globalAlpha = alpha * fade * (0.55 + 0.45 * M.kick);
          ctx.fillStyle = linkStyles[(n - k) & 1];
          const lx = xa + sw * 0.3, len = xb - sw * 0.3 - lx;
          if (len <= 0) continue;
          ctx.fillRect(lx, cy - 4, len, 2); ctx.fillRect(lx, cy + 2, len, 2);
          ctx.fillRect(W - lx - len, cy - 4, len, 2); ctx.fillRect(W - lx - len, cy + 2, len, 2);
        }
        for (let k = count; k >= 0; k--) {
          const id = n - k, slot = slotOf(k), fade = Math.max(0.3, 1 - slot * SLOT / half);
          const pop = k === 0 ? e : 1, s = pop * (k === 0 ? 1 + 0.25 * (1 - p) : 1);
          if (s <= 0.02) continue;
          const img = cubes[((id & 1) + 2 * ((((id >> 1) % CHAIN.VARIANTS) + CHAIN.VARIANTS) % CHAIN.VARIANTS))], w = sw * s, h = DRAW * s;
          const x = mid(slot) - w / 2, y = bodyY + (DRAW - h) / 2;
          ctx.globalAlpha = alpha * fade * (0.8 + 0.2 * M.kick);
          ctx.drawImage(img, x, y, w, h); ctx.drawImage(img, W - x - w, y, w, h);
        }
        // The pop's flash: a soft white burst at the booth, swelling as it fades.
        if (u < 0.6) {
          const fl = 1 - u / 0.6, gw = sw * (2.2 + 1.6 * (1 - fl)), gh = DRAW * (1.1 + 0.5 * (1 - fl));
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = alpha * fl * fl * 0.7;
          ctx.drawImage(glow, half - gw, cy - gh / 2, gw * 2, gh);
          ctx.globalCompositeOperation = "source-over";
        }
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
    // `from` fading into `to` by `fade`, from the music as the room read it (MUSIC).
    const paint = (dt, from, to, fade, M, bands, wave) => {
      for (let i = 0; i < BARS; i++) {
        level[i] = bands[i] > level[i] ? bands[i] : Math.max(bands[i], level[i] - dt * 2);
        peak[i] = level[i] > peak[i] ? level[i] : Math.max(0, peak[i] - dt * 0.4);
      }
      shape = wave; step = dt;
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(back, 0, 0);
      if (from !== to && fade < 1) draw(from, 1 - fade, M);
      draw(to, from !== to ? fade : 1, M);
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
  // The latest block over the booth, a scoreboard: its height large in the island's letters in the middle, glowing in
  // the room's first colour and swelling with the kick, over a ticker of who mined it, its transactions, fees, median
  // rate and age scrolling past; and BLOCK FOUND blinking either side of the height for FOUND seconds after a block
  // lands. Its frame and labels take the room's two colours
  // as they fade. What changes with the block or the colours is drawn once (`base`, `halo`, `tick`), and each frame only
  // lays them together, so it runs at PANEL_FPS (`paint`, from the room's `animate`; the first picture from its `live`).
  const PANEL_FPS = 30, TICK_SPEED = 70, FOUND = 4;
  const scores = new WeakMap();
  const blockOf = (reader) => { const blocks = reader.value("recent"); return blocks && blocks[0] || null; };
  const scoreOf = (canvas) => {
    let score = scores.get(canvas);
    if (score) return score;
    const P = RM.paintKit, W = canvas.width, H = canvas.height, ctx = canvas.getContext("2d");
    const base = CH.canvas(W, H), halo = CH.canvas(W, H), tick = CH.canvas(4096, 36), found = CH.canvas(W, H);
    const bx = base.getContext("2d"), hx = halo.getContext("2d"), tx = tick.getContext("2d"), fx = found.getContext("2d");
    // The frame's inside edges, the ticker a small gap over the bottom one, and the height midway between the top one
    // and the ticker, the same space above it as below.
    const T0 = H * 0.0675, B0 = H - T0, TH = H * 0.2, TY = B0 - H * 0.06 - TH / 2, between = (T0 + TY - TH / 2) / 2;
    let key = "", tickW = 1, shift = 0;
    const build = (b, status, now, a, c) => {
      const A = rgbStyle(a), Ab = rgbStyle(a, 1.25), Cl = rgbStyle(c, 1.35);
      bx.fillStyle = C.ink; bx.fillRect(0, 0, W, H);
      const g = bx.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H * 0.4, W * 0.6);
      g.addColorStop(0, rgbStyle(a, 0.35)); g.addColorStop(1, C.ink); bx.fillStyle = g; bx.fillRect(0, 0, W, H);
      bx.save(); bx.shadowColor = A; bx.shadowBlur = 18; bx.strokeStyle = Ab; bx.lineWidth = H * 0.035;
      P.roundRect(bx, H * 0.05, H * 0.05, W - H * 0.1, H - H * 0.1, H * 0.09); bx.stroke(); bx.restore();
      hx.clearRect(0, 0, W, H);
      if (!b) {
        P.pix(bx, "THE LATEST BLOCK", W / 2, H * 0.3, H * 0.12, Cl);
        P.pix(bx, status, W / 2, H * 0.6, H * 0.2, FLASH);
        tickW = 0;
      } else {
        // BLOCK FOUND either side, shown only as a block lands.
        fx.clearRect(0, 0, W, H); fx.save(); fx.shadowColor = A; fx.shadowBlur = 16;
        for (const x of [W * 0.1, W * 0.9]) { P.pix(fx, "BLOCK", x, between - H * 0.075, H * 0.11, Cl); P.pix(fx, "FOUND", x, between + H * 0.075, H * 0.11, Cl); }
        fx.restore();
        // The height in the middle, clear of BLOCK FOUND either side.
        const height = CH.format.group(b.height), size = Math.min(H * 0.42, W * 0.6 / P.pixWidth(height, 1));
        hx.save(); hx.shadowColor = A; hx.shadowBlur = 34; P.pix(hx, height, W / 2, between, size, FLASH); hx.restore();
        P.pix(bx, height, W / 2, between, size, FLASH);
        bx.fillStyle = rgbStyle(a, 0.3); bx.fillRect(W * 0.03, TY - TH / 2, W * 0.94, TH);
        const parts = [`MINED BY ${(b.pool || "an unknown pool").toUpperCase()}`, `${CH.format.group(b.tx)} TXS`, `${(b.fees / 1e8).toFixed(3)} BTC IN FEES`];
        if (b.medianFee != null) parts.push(`MEDIAN ${Math.round(b.medianFee)} SAT/VB`);
        parts.push(CH.format.ago(now - b.time * 1000).toUpperCase());
        const text = parts.join("   *   ") + "   *   ";
        tx.clearRect(0, 0, tick.width, tick.height);
        tickW = Math.min(tick.width, P.pix(tx, text, 0, tick.height / 2, tick.height * 0.62, "#ffe7c2", "left"));
      }
      for (let y = 6; y < H; y += 4) { bx.fillStyle = "rgba(0,0,0,0.22)"; bx.fillRect(0, y, W, 1); }
    };
    // `landed`, the seconds of BLOCK FOUND left (0 for none).
    const paint = (dt, kick, a, c, styled, reader, now, landed = 0) => {
      const b = blockOf(reader), status = b ? "" : reader.status("recent");
      const k = b ? `${b.height}|${b.pool}|${CH.format.ago(now - b.time * 1000)}|${styled}` : `${status}|${styled}`;
      if (k !== key) { key = k; build(b, status, now, a, c); }
      ctx.globalAlpha = 1; ctx.drawImage(base, 0, 0);
      if (b) {
        ctx.globalAlpha = 0.45 + 0.55 * kick; ctx.drawImage(halo, 0, 0); ctx.globalAlpha = 1;
        if (landed > 0) {
          ctx.globalAlpha = (Math.sin(landed * TAU * 3) > -0.4 ? 1 : 0.2) * Math.min(1, landed / 0.5);
          ctx.drawImage(found, 0, 0); ctx.globalAlpha = 1;
        }
        if (tickW > 0) {
          shift = (shift + dt * TICK_SPEED) % tickW;
          ctx.save(); ctx.beginPath(); ctx.rect(W * 0.03, TY - TH / 2, W * 0.94, TH); ctx.clip();
          for (let x = W * 0.03 - shift; x < W; x += tickW) ctx.drawImage(tick, 0, 0, tickW, tick.height, x, TY - tick.height / 2, tickW, tick.height);
          ctx.restore();
        }
      }
    };
    score = { paint };
    scores.set(canvas, score);
    return score;
  };
  // What the radio plays, as its station's feed names it: the station's name and the song (empty when the feed names
  // none, and then the picture under the block is put away). The room's `animate` keeps it current.
  const playing = { station: "", song: "" };
  // Under the latest block, what plays: a record turning at 33 rpm with a label in the room's first colour, ON AIR
  // lit in its second and pulsing on the kick, the station and the song, and an equaliser off the spectrum, coloured
  // from the first colour to the second up each bar. Its frame and type are drawn once for each song and colouring.
  const EQ = { BARS: 16 };
  const songs = new WeakMap();
  const songOf = (canvas) => {
    let one = songs.get(canvas);
    if (one) return one;
    const P = RM.paintKit, W = canvas.width, H = canvas.height, ctx = canvas.getContext("2d"), base = CH.canvas(W, H), bx = base.getContext("2d");
    const RR = H * 0.36, RX = H * 0.62, RY = H / 2, record = CH.canvas(Math.ceil(RR * 2 + 4), Math.ceil(RR * 2 + 4)), rx = record.getContext("2d");
    const EX = W - H * 0.35 - EQ.BARS * 12, level = new Float32Array(EQ.BARS);
    let key = "", spin = 0, onAir = "#fff";
    const build = (station, song, a, c) => {
      const A = rgbStyle(a, 1.25);
      bx.fillStyle = C.ink; bx.fillRect(0, 0, W, H);
      const g = bx.createRadialGradient(W * 0.3, H / 2, 10, W * 0.3, H / 2, W * 0.6);
      g.addColorStop(0, rgbStyle(a, 0.3)); g.addColorStop(1, C.ink); bx.fillStyle = g; bx.fillRect(0, 0, W, H);
      bx.save(); bx.shadowColor = rgbStyle(a); bx.shadowBlur = 16; bx.strokeStyle = A; bx.lineWidth = H * 0.045;
      P.roundRect(bx, H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12, H * 0.2); bx.stroke(); bx.restore();
      P.pix(bx, station, H * 2.06, H * 0.3, H * 0.13, rgbStyle(c, 1.35), "left");
      bx.fillStyle = "#f4ecff"; bx.textAlign = "left"; bx.textBaseline = "middle";
      P.fit(bx, song, EX - H * 1.25 - 20, 800, H * 0.3); bx.fillText(song, H * 1.25, H * 0.66);
      // The record: grooves, a highlight across them, the label in the first colour and the hole.
      const r = record.width / 2;
      rx.clearRect(0, 0, record.width, record.height);
      rx.fillStyle = "#0d0d10"; rx.beginPath(); rx.arc(r, r, RR, 0, TAU); rx.fill();
      rx.strokeStyle = "rgba(255,255,255,0.1)"; rx.lineWidth = 1;
      for (let k = RR * 0.4; k < RR - 1; k += 4) { rx.beginPath(); rx.arc(r, r, k, 0, TAU); rx.stroke(); }
      rx.strokeStyle = "rgba(255,255,255,0.45)"; rx.lineWidth = 3; rx.beginPath(); rx.arc(r, r, RR * 0.8, -0.7, 0.1); rx.stroke();
      rx.fillStyle = rgbStyle(a, 1.2); rx.beginPath(); rx.arc(r, r, RR * 0.32, 0, TAU); rx.fill();
      rx.fillStyle = rgbStyle(c, 1.2); rx.fillRect(r - RR * 0.2, r - RR * 0.06, RR * 0.4, RR * 0.12);
      rx.fillStyle = "#000"; rx.beginPath(); rx.arc(r, r, RR * 0.06, 0, TAU); rx.fill();
      onAir = rgbStyle(c, 1.2);
    };
    const paint = (dt, kick, a, c, styled, bands) => {
      const k = `${playing.station}|${playing.song}|${styled}`;
      if (k !== key) { key = k; build(playing.station, playing.song, a, c); }
      ctx.globalAlpha = 1; ctx.drawImage(base, 0, 0);
      spin = (spin + dt * TAU * 33 / 60) % TAU;
      ctx.save(); ctx.translate(RX, RY); ctx.rotate(spin); ctx.drawImage(record, -record.width / 2, -record.height / 2); ctx.restore();
      ctx.globalAlpha = 0.55 + 0.45 * kick; ctx.fillStyle = onAir; RM.paintKit.roundRect(ctx, H * 1.25, H * 0.16, H * 0.66, H * 0.26, H * 0.07); ctx.fill();
      ctx.globalAlpha = 1; RM.paintKit.pix(ctx, "ON AIR", H * 1.58, H * 0.29, H * 0.12, C.ink);
      const per = MUSIC.BANDS * 0.7 / EQ.BARS, foot = H * 0.8, tall = H * 0.6;
      for (let i = 0; i < EQ.BARS; i++) {
        let v = 0;
        for (let j = Math.floor(i * per); j < Math.floor((i + 1) * per); j++) v = Math.max(v, bands[j]);
        level[i] = v > level[i] ? v : Math.max(v, level[i] - dt * 2.4);
        const h = 4 + clamp01(level[i] * 1.15) * tall, g = ctx.createLinearGradient(0, foot, 0, foot - tall);
        g.addColorStop(0, rgbStyle(a, 1.2)); g.addColorStop(1, rgbStyle(c, 1.3));
        ctx.fillStyle = g; ctx.fillRect(EX + i * 12, foot - h, 8, h);
      }
    };
    one = { paint };
    songs.set(canvas, one);
    return one;
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
  // the radio's station and song. What moves is its own node: the jog wheels and their screens turn,
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
    G.box(r * 0.18, 0.004, r * 0.75, GEAR.tick, x, y + r * 1.4 + 0.0005, z - r * 0.4);
  };
  // A slot with its cap, along z (or along x with `across`); `at` is where the cap stands, -1 to 1.
  const fader = (G, x, y, z, len, across, at) => {
    G.box(across ? len : 0.006, 0.002, across ? 0.006 : len, GEAR.rubber, x, y + 0.0045, z);
    const cx = across ? x + at * len / 2 : x, cz = across ? z : z + at * len / 2;
    G.box(across ? 0.014 : 0.03, 0.016, across ? 0.026 : 0.014, GEAR.cap, cx, y + 0.008, cz);
    G.box(across ? 0.003 : 0.022, 0.004, across ? 0.02 : 0.003, GEAR.tick, cx, y + 0.0165, cz);
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
    // Its bezel set back along the screen's own facing, its face 4 mm behind the picture's.
    G.box(sw + 0.024, sh + 0.024, 0.014, GEAR.black, x, cy + Math.sin(lean) * 0.011, cz - Math.cos(lean) * 0.011, { rx: lean });
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
    }, jx, top + 0.016, jz, { target: { kind: "decks", tip: "Media player", radius: 0.3, data: { say: "Two decks and a mixer, playing EDM Sessions live" } } });
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
    // What lies on the panel stands at least 2.5 mm proud of it (nearer than that, two faces flicker from afar).
    for (const sx of [-1, 1]) G.box(0.004, 0.003, D - 0.14, GEAR.edge, sx * 0.165, top + 0.0045, 0.04);
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
      G.box(0.009, 0.002, 0.15, GEAR.rubber, x + 0.026, top + 0.0045, z0 + 0.155);
      for (let i = 0; i < METER.SEGS; i++) {
        const color = i < METER.GREEN ? "#3dffb0" : i < METER.GREEN + METER.AMBER ? "#ffb020" : "#ff3030";
        G.node(`meter${c}_${i}`, gearPart(`seg${color}`, (k) => k.box(0.007, 0.003, 0.01, color, 0, 0, 0, { emissive: 1, glow: true })), x + 0.026, top + 0.0075, z0 + 0.222 - i * 0.0145, { glow: true });
      }
      knob(G, x, top, z0 + 0.3, 0.02, GEAR.knob);
      G.torus(0.026, 0.002, PADS[(c * 2 + 3) % 8], x, top + 0.002, z0 + 0.3, { emissive: 0.6, glow: true, seg: 16, sides: 3 });
      G.box(0.03, 0.008, 0.018, GEAR.button, x, top + 0.004, z0 + 0.35);
      G.box(0.03, 0.003, 0.004, "#ff9b2e", x, top + 0.0095, z0 + 0.343, { emissive: 0.8, glow: true });
      fader(G, x, top, z0 + 0.43, 0.1, false, 0.5 - c * 0.3);
    });
    fader(G, 0, top, D / 2 - 0.035, 0.16, true, 0);
    // The master section down the right: its knob, the FX screen with the beat lamps under it, the FX knobs and the
    // big lit FX button.
    knob(G, 0.205, top, z0 + 0.06, 0.014, GEAR.cap);
    G.picture(0.09, 0.07, FXS.W, FXS.H, fxScreen, 0.205, top + 0.009, z0 + 0.14, { name: "fxScreen", rx: -Math.PI / 2, emissive: 0.85 });
    for (let i = 0; i < 4; i++) G.node(`beat${i}`, gearPart("beatLamp", (k) => k.box(0.016, 0.003, 0.008, "#ffd34d", 0, 0, 0, { emissive: 1, glow: true })), 0.178 + i * 0.018, top + 0.0045, z0 + 0.19, { glow: true });
    for (let k = 0; k < 3; k++) knob(G, 0.205, top, z0 + 0.24 + k * 0.06, 0.013, GEAR.knob);
    G.node("fxOn", ringButton("fxOn", 0.022, "#3a8cff"), 0.205, top + 0.006, D / 2 - 0.05, { glow: true });
  };
  // The laptop's screen, a DJ library: the station down the side, lit, the station and what it
  // plays (a dash while its feed names nothing) over two decks' waveforms, the tempo, and a track list. Repainted by the
  // room as either changes.
  const LAPTOP = { W: 768, H: 480 };
  const paintLaptop = (ctx, station, song) => {
    const P = RM.paintKit, w = LAPTOP.W, h = LAPTOP.H, rand = P.rng(57), side = w * 0.24, x0 = side + w * 0.02, cw = w - x0 - w * 0.02;
    const stations = BL.timechainPartyRadio ? [BL.timechainPartyRadio.STATION] : [];
    ctx.fillStyle = "#0a0d16"; ctx.fillRect(0, 0, w, h);
    // The title bar: the app, the clock and the master level.
    ctx.fillStyle = "#151a28"; ctx.fillRect(0, 0, w, h * 0.07);
    P.pix(ctx, "OOGA RADIO", w * 0.02, h * 0.035, h * 0.035, "#9a5cff", "left");
    P.pix(ctx, "ON AIR", w * 0.6, h * 0.035, h * 0.03, "#ff4d6e");
    for (let k = 0; k < 16; k++) { ctx.fillStyle = k < 11 ? "#3dffb0" : k < 14 ? "#ffb020" : "#3a2020"; ctx.fillRect(w * 0.76 + k * w * 0.013, h * 0.022, w * 0.009, h * 0.026); }
    // The side: the library and the stations.
    ctx.fillStyle = "#10141f"; ctx.fillRect(0, h * 0.07, side, h * 0.93);
    P.pix(ctx, "COLLECTION", w * 0.02, h * 0.11, h * 0.026, "#7f8bb0", "left");
    P.pix(ctx, "LIVE RADIO", w * 0.02, h * 0.17, h * 0.026, "#7f8bb0", "left");
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
  // A laptop on its stand, its back toward the dancers, black like the decks, twice a real one's size: its body with a
  // backlit keyboard, a trackpad and speaker grilles, ports down its side, the lid on its hinge with a black bezel, a
  // camera and the screen, the Bananas panel's banana glowing on its back, and a cable across the desk into the player
  // beside it.
  const laptop = (G, x, z, plug) => {
    const slate = "#17171c", stand = GEAR.edge, tilt = 0.32, lean = -0.57;
    // The stand: two side plates on the desk rising toward the back, a top plate under the laptop and a front lip.
    for (const sx of [-1, 1]) {
      rod(G, [x + sx * 0.26, 0.008, z + 0.2], [x + sx * 0.26, 0.22, z - 0.22], 0.012, stand);
      rod(G, [x + sx * 0.26, 0.008, z + 0.2], [x + sx * 0.26, 0.008, z - 0.24], 0.01, stand);
      rod(G, [x + sx * 0.26, 0.008, z - 0.24], [x + sx * 0.26, 0.22, z - 0.22], 0.01, stand);
    }
    const D = G.group(x, 0.144, z, 0, tilt);
    D.box(0.6, 0.008, 0.44, stand, 0, -0.024, 0);
    D.box(0.6, 0.028, 0.016, stand, 0, -0.008, 0.224);
    // The body: its slate shell, rubber feet, the keyboard well with its backlight and keys, the trackpad, grilles
    // either side of the keys and ports down the left side.
    D.box(0.68, 0.032, 0.48, slate, 0, 0, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) D.box(0.04, 0.006, 0.024, GEAR.rubber, sx * 0.28, -0.018, sz * 0.2);
    // Each layer of the keyboard 5 mm or more over the last: the well, its backlight, the keys.
    D.box(0.58, 0.005, 0.236, "#0b0b0e", 0, 0.0185, -0.08);
    D.box(0.572, 0.003, 0.228, "#7a4dff", 0, 0.0255, -0.08, { emissive: 0.5, glow: true });
    for (let row = 0; row < 5; row++) for (let k = 0; k < 13; k++) {
      const kx = -0.26 + k * 0.0434 + (row % 2) * 0.01, kz = -0.176 + row * 0.044;
      if (row === 4 && k > 3 && k < 9) continue;
      D.box(0.036, 0.008, 0.036, "#0e0e12", kx, 0.031, kz);
    }
    D.box(0.2, 0.008, 0.036, "#0e0e12", 0, 0.031, 0.0);
    D.box(0.22, 0.004, 0.14, "#24242c", 0, 0.019, 0.144);
    for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) D.box(0.016, 0.004, 0.008, "#24242c", sx * 0.316, 0.019, -0.18 + k * 0.036);
    for (let k = 0; k < 3; k++) D.box(0.008, 0.012, 0.024, k ? "#121218" : "#3a8cff", -0.344, 0, -0.12 + k * 0.06, { emissive: k ? 0 : 0.8 });
    // The lid on its hinge, leaning back; its picture's node turns by the deck's tilt and the lid's lean together. The
    // banana faces +z as built, so it is turned round to face out of the lid's back, standing 1.5 mm proud of it.
    D.cyl(0.016, 0.016, 0.56, slate, 0, 0.012, -0.24, { rz: Math.PI / 2, seg: 10 });
    const Lg = D.group(0, 0.016, -0.24, 0, lean);
    Lg.box(0.68, 0.464, 0.016, slate, 0, 0.232, -0.008);
    Lg.box(0.668, 0.452, 0.006, "#08080c", 0, 0.232, 0.003);
    Lg.ball(0.006, "#3a3a44", 0, 0.444, 0.005, { seg: 6 });
    Lg.add(BL.bananaIcon.geometry(0.15, 0.004), 0, 0.25, -0.0195, { ry: Math.PI, glow: true });
    const canvas = CH.canvas(LAPTOP.W, LAPTOP.H);
    paintLaptop(canvas.getContext("2d"), "", "");
    Lg.node("laptopScreen", RM.flatPicture(canvas, 0.62, 0.388, 0.85), 0, 0.24, 0.012, { rx: tilt + lean, glow: true });
    // The cable from its right side down across the desk and into the player.
    const a = [x + 0.342, 0.144 + 0.04 * Math.sin(tilt), z - 0.04 * Math.cos(tilt)];
    const pts = [a, [a[0] + 0.03, 0.02, a[2]], [a[0] + 0.06, 0.004, a[2] - 0.04], [plug[0] - 0.05, 0.004, plug[2]], plug];
    for (let k = 1; k < pts.length; k++) rod(G, pts[k - 1], pts[k], 0.0035, "#18181e");
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
    laptop(G, -span - 0.49, 0.02, [-span, B + 0.06, -0.12]);
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
    K.dome((ctx, D) => showOf(ctx.canvas, D).paint(DOME.WASH, DOME.WASH, 1, M), { w: DOME_W, h: DOME_H, smooth: true });
    domeDots(L).forEach((geo, g) => K.node(`dots${g}`, geo, 0, 0, 0, { glow: true, depthBias: DOT_BIAS }));
    // The LED wall round the room, first painted in its quiet look.
    const wallCanvas = CH.canvas(WALL.W, WALL.H), firstBands = new Float32Array(MUSIC.BANDS), firstWave = new Float32Array(MUSIC.WAVE);
    madeUp(0, 0.3, 0.3, firstBands, firstWave);
    const wallPainter = wallOf(wallCanvas);
    wallPainter.colors(M.a, M.b);
    wallPainter.paint(0.1, WALLS.WAVE, WALLS.WAVE, 1, M, firstBands, firstWave);
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
    // steps' are solids' tops, so an Ooga steps up them, or jumps up onto the deck anywhere; the camera keeps over them
    // as over the floor (`floor`).
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
    // The tape lies over the seams' ends, its top 3 mm over theirs (faces nearer than that flicker).
    K.box(2 * W, 0.006, 0.05, STAGE_C.tape, 0, seamY + 0.0015, zs - 0.04);
    K.box(2 * W + 0.04, 0.05, 0.075, STAGE_C.nosing, 0, H - 0.019, zs + 0.03);
    const skirtGeo = blank(), bays = SUBS.at.map((x) => [x - SUBS.w / 2 - 0.035, x + SUBS.w / 2 + 0.035]);
    skirt(skirtGeo, zs, -W, W, 0.07, H - 0.045, bays);
    K.add(skirtGeo);
    for (const x of SUBS.at) subBay(K, x, zs);
    K.node("stageEdge", (k) => {
      k.box(2 * W, 0.012, 0.014, PURPLE, 0, H - 0.055, zs + 0.05, { emissive: 1, glow: true });
      k.box(2 * W, 0.02, 0.02, PURPLE, 0, 0.035, zs + 0.03, { emissive: 1, glow: true });
    }, 0, 0, 0, { glow: true });
    K.solid({ x: 0, z: zs - 4, hx: W, hz: 4, top: H, stay: true, floor: true });
    const sz = zs - STAGE.DOWN - STAGE.STEP_W / 2, out = W + STAGE.STEPS * STAGE.TREAD, rail = STAGE.STEP_W / 2 - 0.04;
    for (const side of [-1, 1]) {
      for (let s = 1; s <= STAGE.STEPS; s++) {
        const top = H * s / (STAGE.STEPS + 1), x0 = W + (STAGE.STEPS - s) * STAGE.TREAD, x1 = x0 + STAGE.TREAD;
        K.box(x1 - W, top, STAGE.STEP_W, STAGE_C.riser, side * (W + x1) / 2, top / 2, sz);
        K.box(x1 - x0, 0.012, STAGE.STEP_W, STAGE_C.tread, side * (x0 + x1) / 2, top + 0.006, sz);
        K.box(0.045, 0.003, STAGE.STEP_W, STAGE_C.tape, side * (x1 - 0.03), top + 0.0135, sz);
        for (const dz of [-0.6, 0.6]) K.box(0.004, 0.025, 0.09, STAGE_C.lamp, side * (x1 + 0.002), top * 0.55, sz + dz, { emissive: 0.55, glow: true });
        K.solid({ x: side * (x0 + x1) / 2, z: sz, hx: STAGE.TREAD / 2, hz: STAGE.STEP_W / 2, top, floor: true });
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

    // The DJ booth on the stage: a curved desk wrapped in LED screen, each in a dark bezel lit violet along its edges:
    // its face from corner to corner, each end, and its back, as tall as the front, its foot behind the DJ's platform;
    // the screens a hair past each corner so they meet round it; its decks and mixer on top.
    const rb0 = r0 - 3.2, rb1 = r0 - 2.4, a0 = (180 - ah) * DEG, a1 = (180 + ah) * DEG, rs = rb0 - 0.046, U = H + BOOTH_TOP;
    K.sector(0, rb0, rb1, a0, a1, H, H + 1.0, C.booth);
    K.sector(0, rb0 - 0.06, rb1, a0, a1, H + 1.0, U, C.boothTop);
    const { OFF, BEZEL } = SCREEN, BS = BACK_SCREEN, rk = rb1 + OFF;
    K.sector(0, rb0 - BEZEL, rb0, a0, a1, H + 0.1, H + 0.98, C.bezel, { steps: 40 });
    for (const y of [0.115, 0.945]) K.sector(0, rb0 - 0.05, rb0 - BEZEL, a0, a1, H + y, H + y + 0.012, PURPLE, { emissive: 1, glow: true, steps: 40 });
    K.sector(0, rb1, rb1 + BEZEL, a0, a1, H + 0.1, H + 0.98, C.bezel, { steps: 40 });
    for (const y of [0.115, 0.945]) K.sector(0, rb1 + BEZEL, rb1 + 0.05, a0, a1, H + y, H + y + 0.012, PURPLE, { emissive: 1, glow: true, steps: 40 });
    const say = { kind: "booth", tip: "DJ booth", radius: 1.3, data: { say: "Block Party · EDM Sessions, live" } };
    const screenCanvas = CH.canvas(SCREEN.W, SCREEN.H), backCanvas = CH.canvas(BS.W, SCREEN.H), endCanvas = CH.canvas(SCREEN.END_W, SCREEN.H);
    screenOf(screenCanvas).paint(0.1, 0.3, 0.3, 0, firstBands, firstWave);
    screenOf(backCanvas, false).paint(0.1, 0.3, 0.3, 0, firstBands, firstWave);
    screenOf(endCanvas, false).paint(0.1, 0.3, 0.3, 0, firstBands, firstWave);
    K.node("screen", screenGeometry(rs, ah * DEG + OFF / rs, screenCanvas), 0, H, -rs, { glow: true, depthBias: -0.3, target: say });
    // The back, seen from the DJ's side (its frame turned round), the scene going on round from the ends.
    const hb = ah * DEG + OFF / rk;
    K.node("screenBack", flatScreen((t) => { const b = hb * (1 - 2 * t); return [rk * Math.sin(b), rk * Math.cos(b)]; }, 24, SCREEN.Y0, SCREEN.Y1, backCanvas),
      0, H, 0, { ry: Math.PI, glow: true, depthBias: -0.3, target: say });
    // Each end, from a hair in front of the face to a hair behind the back, standing OFF out from the end.
    const ew = rb1 - rb0 + 2 * OFF, rm = (rb0 + rb1) / 2;
    let endGeo = flatScreen((t) => [ew / 2 - ew * t, 0], 1, SCREEN.Y0, SCREEN.Y1, endCanvas);
    for (const sx of [-1, 1]) {
      const c = polar(rm, 180 - sx * ah), nx = sx * Math.cos(ah * DEG), nz = Math.sin(ah * DEG), ry = Math.atan2(nx, nz);
      const g = K.group(c.x, H, c.z, ry);
      g.box(ew + 2 * BEZEL - 2 * OFF, 0.88, BEZEL, C.bezel, 0, 0.54, BEZEL / 2);
      for (const y of [0.115, 0.945]) g.box(ew + 2 * BEZEL - 2 * OFF, 0.012, 0.01, PURPLE, 0, y + 0.006, BEZEL + 0.005, { emissive: 1, glow: true });
      endGeo = K.node(sx < 0 ? "screenEndL" : "screenEndR", endGeo, c.x + nx * OFF, H, c.z + nz * OFF, { ry, glow: true, depthBias: -0.3 }).geometry;
    }
    // The desk stands in the way of feet below its top, so an Ooga walks round it on the stage to the DJ's place
    // behind, or jumps up onto it and over.
    arcSolids(K, (rb0 + rb1) / 2, 180 - ah, 180 + ah, 0.42, U);
    // The DJ's platform behind it, from the desk back to the wall, its top a solid's in slices along it; white tape
    // along its open ends, where an Ooga steps up.
    const pr0 = rb1 + 0.01, pr1 = rw - 0.05, pb = ah - DJ_IN, P = H + DJ_UP, da0 = (180 - pb) * DEG, da1 = (180 + pb) * DEG;
    K.sector(0, pr0, pr1, da0, da1, H + 0.006, P, C.stage);
    K.sector(0, pr0 + 0.01, pr1, da0 + 0.001, da1 - 0.001, P, P + 0.012, C.stageTop);
    for (const a of [da0 + 0.0015, da1 - 0.0055]) K.sector(0, pr0, pr1, a, a + 0.004, P + 0.004, P + 0.016, STAGE_C.tape);
    const rows = 3, slices = Math.ceil(2 * pb * DEG * (pr0 + pr1) / 2 / 0.5), depth = (pr1 - pr0) / rows;
    for (let i = 0; i < rows; i++) for (let j = 0; j < slices; j++) {
      const rm = pr0 + depth * (i + 0.5), b = 180 - pb + 2 * pb * (j + 0.5) / slices, c = polar(rm, b);
      K.solid({ x: c.x, z: c.z, hx: pb * DEG * rm / slices - 0.02, hz: depth / 2 - 0.02, top: P, stay: true });
    }
    djGear(K.group(0, U, BZ + 0.05, Math.PI));
    // A monitor either side of the booth, beside its front corner (MON out and MON_FWD in front of it) and turned to the
    // DJ, its cable taped along the deck to the booth's end; and two road cases back against the wall in the stage's back
    // corners (CASE_OUT from the wall, CASE_IN degrees in from the stage's side), so the way round each end of the booth
    // to the DJ's place stays wide open.
    const dj = -(pr0 + pr1) / 2, corner = polar(rb0, 180 - ah), mx = corner.x + MON, mz = corner.z + MON_FWD;
    for (const sx of [-1, 1]) {
      boothMonitor(K, sx * mx, H + 0.012, mz, 0, dj);
      rod(K, [sx * (mx - 0.2), H + 0.022, mz - 0.15], [sx * (corner.x + 0.05), H + 0.022, corner.z - 0.2], 0.01, "#0a0a0c");
      const c = polar(rw - CASE_OUT, 180 + sx * (back - CASE_IN));
      roadCase(K, c.x, H + 0.012, c.z, (sx * (back - CASE_IN)) * DEG, 1.1, 0.7, 0.6);
    }

    // The lasers on the walls: each projector on its bracket, and every projector's beams and their dots, built shrunk
    // to nothing (the room starts dark) and in every colour among them, so all of them stay with the room.
    const rigs = rigsOf(L);
    let body = projector;
    const beamGeo = [], dotGeo = [];
    rigs.forEach((g, p) => {
      const b = g.bearing * DEG;
      const rp = ROOMS.radiusAt(L, g.y + PLATE_Y);
      bracket(K.group(rp * Math.sin(b), g.y, rp * Math.cos(b), b + Math.PI), (g.y + PLATE_Y - L.c) / rp, rp - Math.hypot(g.x, g.z));
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
    const tip = { kind: "speaker", tip: "Line array", radius: 0.6, data: { say: "Hung off the wall, thumping with the kick" } };
    // Each row's, a box fewer a row up, its brackets' arms at its row's height (`lineArray` runs the arm 0.6 over the
    // hang's top), each bracket's plate flat on the wall where the wall is at the plate's height.
    TIERS.forEach((tier, u) => {
      spread(tier).speakers.forEach((deg, i) => {
        const n = Math.max(2, ARRAYS[nearest(ARRAYS.map((a) => a.b), deg)].n - u), top = armY(L, tier) - 0.6;
        const plate = top + 0.45, ru = ROOMS.radiusAt(L, plate), slope = (plate - L.c) / ru;
        for (const s of [1, -1]) {
          const b = s * deg * DEG;
          lineArray(K.group(ru * Math.sin(b), 0, ru * Math.cos(b), b + Math.PI), n, `woofer${u ? `${u}u` : ""}${i}${s < 0 ? "l" : "r"}`, shared, tip, top, slope);
        }
      });
    });

    balcony(K, L);
    ring(K, L);

    // The mirror ball under the crown on its line; the ring of light a drop in the music sends down the dome, kept under
    // the floor until then.
    const by = ballY(L);
    K.node("ball", (k) => mirrorBall(k, 1.1), 0, by, FZ, { target: { kind: "ball", tip: "Mirror ball", radius: 1.3, data: { say: "It turns faster when the music hits hard" } } });
    // It is solid to an Ooga flying into it, and one that comes down on it stands on its curve: rings each as high as
    // the sphere at its own edge, so a body anywhere on it stands on the ball (a little over it between rings), never
    // sunk into it, and walks over it a ring at a time; all hung, so nobody under it meets them and a rise from below
    // stops at its underside.
    for (const r of [0.05, 0.25, 0.45, 0.62, 0.76, 0.88, 0.97, 1.05]) K.solid({ x: 0, z: FZ, r, top: by + Math.sqrt(1.1 * 1.1 - r * r), below: by - 1.0 });
    K.box(0.03, L.crown - by - 1.25, 0.03, "#55555c", 0, (by + 1.15 + L.crown - 0.1) / 2, FZ);
    K.node("wave", (k) => k.torus(1, 0.025, FLASH, 0, 0, 0, { emissive: 1, glow: true, seg: 96, sides: 5 }), 0, AWAY, 0, { glow: true });

    // The latest block on the dome over the booth.
    const pa0 = -15, pa1 = 15, pe0 = 4.6, pe1 = 10.6, pw = 1024;
    const wM = (pa1 - pa0) * DEG * L.R * Math.cos((pe0 + pe1) / 2 * DEG), hM = L.R * (Math.sin(pe1 * DEG) - Math.sin(pe0 * DEG)), ph = Math.round(pw * hM / wM);
    // Painted once by the room and from then on by `animate` (its key never changes), so it can move with the music.
    K.live({ az0: pa0, az1: pa1, el0: pe0, el1: pe1, w: pw, h: ph, tip: "The latest block",
      key: () => "score", paint: (ctx, f, now) => scoreOf(ctx.canvas).paint(0, 0.3, PALETTES[0][0], PALETTES[0][1], -1, f.reader, now) });
    // Under it, what the radio plays, shown only while its station's feed names a song.
    const se0 = 0.4, se1 = 4.3, sw = 1024, swM = (pa1 - pa0) * DEG * L.R * Math.cos((se0 + se1) / 2 * DEG), sh = Math.round(sw * L.R * (Math.sin(se1 * DEG) - Math.sin(se0 * DEG)) / swM);
    K.live({ az0: pa0, az1: pa1, el0: se0, el1: se1, w: sw, h: sh, tip: "Now playing", key: () => "song", paint: (ctx) => songOf(ctx.canvas).paint(0, 0.3, PALETTES[0][0], PALETTES[0][1], -1, new Float32Array(MUSIC.BANDS)) });

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
    const L = built.layout, rigs = rigsOf(L), F = new Float64Array(3), M = moment();
    const floorSurface = built.floor && built.floor.geometry.imageSurface, floor = floorSurface && floors.get(floorSurface.canvas);
    const RINGS = floor ? floor.rings : 1;
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
    // The Oogas' dancing (timechain-party-dance.js), and the visitor's own level in the banner (`#dance-hud`).
    const dancer = BL.partyDance.create(), DANCE_MAX = BL.partyDance.DANCE.MAX;
    const danceHud = document.getElementById("dance-hud"), danceNum = document.getElementById("dance-level");
    const danceDown = danceHud && danceHud.querySelector('[data-action="dance-down"]'), danceUp = danceHud && danceHud.querySelector('[data-action="dance-up"]');
    const showDance = () => {
      if (!danceHud) return;
      const n = BL.partyDance.level();
      danceNum.textContent = String(n);
      danceHud.dataset.level = String(n);
      danceHud.title = `Dance ${n} of ${DANCE_MAX} · ${BL.partyDance.NUMBERS[n].label}`;
      danceDown.disabled = n <= 0; danceUp.disabled = n >= DANCE_MAX;
    };
    // The visitor's dance number, from the banner's buttons, - and =, or a number key; the same number keeps the move.
    const setDance = (n) => { BL.partyDance.setLevel(n); showDance(); };
    if (danceHud) { showDance(); danceHud.hidden = false; }
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
    const fxOn = nodes.fxOn, ball = nodes.ball, wave = nodes.wave, stageEdge = nodes.stageEdge, wallNode = nodes.wall;
    // The mixer's meters, a channel's segments bottom up, and how many of each are lit; its beat lamps.
    const meterSegs = [], meterLit = new Int8Array(4).fill(-1), beatLamps = [0, 1, 2, 3].map((i) => nodes[`beat${i}`]);
    for (let c = 0; c < 4; c++) for (let i = 0; i < METER.SEGS; i++) meterSegs.push(nodes[`meter${c}_${i}`]);
    // What the radio plays, under the latest block.
    const songPicture = built.live.find((l) => l.spec.tip === "Now playing"), blockPicture = built.live.find((l) => l.spec.tip === "The latest block");
    // The two pictures over the booth, painted by the room once and then here, PANEL_FPS times a second: each's canvas
    // once the room has hung it.
    const surfaceOf = (live) => live && live.node.geometry && live.node.geometry.imageSurface;
    let panelWait = 0, panelDt = 0;
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
    const backSurface = nodes.screenBack.geometry.imageSurface, backScreen = screenOf(backSurface.canvas, false);
    const endSurface = nodes.screenEndL.geometry.imageSurface, endScreen = screenOf(endSurface.canvas, false);
    const wallSurface = nodes.wall.geometry.imageSurface, wall = wallOf(wallSurface.canvas), music = new Float32Array(MUSIC.BANDS), shape = new Float32Array(MUSIC.WAVE);
    const e0 = ROOMS.edgeEl(L, 0) / DEG;
    const floorRgb = built.lights[2].slice(4, 7), screenRgb = built.lights[8].slice(4, 7);
    const radio = BL.timechainPartyRadio.take(), heard = { live: false, bpm: 0, phase: 0, level: 0, conf: 0 }, E = { loud: 0, bass: 0 }, E2 = { loud: 0, bass: 0 }, bulbs = RM.bulbsOf(nodes);
    const setLight = (lights, i, r, g, b) => { const o = i * 8; lights[o + 4] = r; lights[o + 5] = g; lights[o + 6] = b; };
    // The room's clock for its own arrangement: the island room's where there is one, so everyone sees it alike.
    const clock = () => (BL.net.state.room === "live" ? BL.net.serverNow() : Date.now()) / 1000 + shift;
    let shift = 0, pinned = null;

    // The beat, the music's energy and the section.
    let beat = 0, rate = 1 / BEAT, lastStep = 0, hit = 1, I = 0.25, raw = 0.25, forced = null, analysed = false;
    // The backbeat (BACKBEAT): how much the clap band rises on the room's even beats and its odd ones, eased; the beats
    // read since the count was last turned; and the clap band's tail before this beat, its peak on it, and whether
    // this beat's rise is in.
    const backbeat = [0, 0], clap = new Float32Array(MUSIC.BANDS);
    let backbeats = 0, turned = 0, clapPrev = -1, clapTail = 0, clapTailN = 0, clapPeak = 0, clapDone = true, turnBeat = false;
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
    // The two colours a change of colours starts from: wherever the last change had got to, so one starting before the
    // last has finished blends on from there rather than jumping (which left a seam in the wall's waterfall).
    const fromA = PALETTES[0][0].slice(), fromB = PALETTES[0][1].slice();
    for (let k = 0; k < 3; k++) { M.a[k] = fromA[k]; M.b[k] = fromB[k]; }
    // The lasers: the show's end (a beat, -1 for none), its first look and when it began, its colours, how bright they
    // are, and when the last show ended.
    let showUntil = -1, showFrom = 0, showLook = 0, showPair = 0, showColors = SHOW_COLORS[0], laser = 0, lastShowEnd = LASER.FIRST - LASER.LONG, showCount = 0;
    // Drops: a block's and the music's, each 0 to 1 through it, -1 when none; the latest block's height seen.
    let musicT = -1, lastHeight = -1, landed = 0;
    let domeWait = 0, screenWait = 0, screenDt = 0, floorWait = 0, nonce = 0, sparkDt = 0;
    const others = [];
    const pick = (list, not) => {
      others.length = 0;
      for (const v of list) if (v !== not) others.push(v);
      return others.length ? others[Math.floor(Math.random() * others.length)] : list[0];
    };
    const change = (s, to) => { if (to === s.look) return; s.from = s.fade < 0.5 ? s.from : s.look; s.look = to; s.fade = 0; };
    const PALETTE_IDS = PALETTES.map((_, i) => i);
    const newColors = () => {
      fromA[0] = M.a[0]; fromA[1] = M.a[1]; fromA[2] = M.a[2]; fromB[0] = M.b[0]; fromB[1] = M.b[1]; fromB[2] = M.b[2];
      colorFrom = colorTo; colorTo = pick(PALETTE_IDS, colorTo); colorFade = 0;
    };
    const startShow = (beats, dropped) => {
      showFrom = beat; showUntil = beat + beats; showCount++;
      showLook = dropped ? 0 : Math.floor(Math.random() * 64);
      showPair = dropped ? 0 : Math.floor(Math.random() * PROJ.BEARINGS.length);
      showColors = SHOW_COLORS[Math.floor(Math.random() * SHOW_COLORS.length)];
    };
    // The look a show's `no`th stretch plays from `list`, drawn from the show's own seed and never the one before it.
    const drawn = (list, no) => Math.floor(hash01(showLook + no * 7.31, showCount * 3.7 + list.length) * list.length);
    const lookAt = (list, no) => {
      const i = drawn(list, no);
      return list[no > 0 && i === drawn(list, no - 1) ? (i + 1) % list.length : i];
    };
    const endShow = (t) => { if (showUntil < 0) return; showUntil = -1; lastShowEnd = t; };
    // A drop in the music: a ring falls down the dome and a wave runs out across the floor in the room's colour, and the
    // lasers come on unless they shone a moment ago.
    const musicDrop = (t) => { musicT = 0; if (showUntil < 0 && t - lastShowEnd > LASER.GAP / 2) startShow(LASER.SHOW_DROP, true); };
    // A new block: BLOCK FOUND on the scoreboard for FOUND seconds.
    const blockFound = () => { landed = FOUND; };

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
        rate += ((heard.live ? heard.bpm / 60 : 1 / BEAT) - rate) * Math.min(1, dt * TEMPO_RATE);
        let move = rate * dt;
        if (heard.live) { const off = heard.phase - (beat - Math.floor(beat)); move += (off - Math.round(off)) * Math.min(1, dt * PHASE_RATE); }
        move = Math.max(0, move);
        beat += move;
        // A beat further on when the backbeat was found on the even beats, so the claps land on 2 and 4.
        if (turnBeat) { turnBeat = false; beat += 1; turned++; }
        const step = Math.floor(beat), newStep = step !== lastStep;
        // The backbeat: the beat the radio finds is the kick's, on every beat, so which are a bar's 2 and 4 is read
        // from the clap or snare that dance music puts there. Each beat, how far the clap band rises on it over where
        // it stood at the end of the beat before goes to that beat's side (even or odd); once one side has clearly
        // been the louder for a while and it is the even one, the count moves on a beat (turned the next frame).
        if (heard.live && radio.spectrum(clap)) {
          let m = 0;
          for (let k = BACKBEAT.FROM; k < BACKBEAT.TO; k++) m += clap[k];
          m /= BACKBEAT.TO - BACKBEAT.FROM;
          const f = beat - step;
          if (newStep) { clapPrev = clapTailN ? clapTail / clapTailN : -1; clapTail = clapTailN = 0; clapPeak = 0; clapDone = false; }
          if (f < BACKBEAT.HIT) clapPeak = Math.max(clapPeak, m);
          else if (!clapDone) {
            clapDone = true;
            if (clapPrev >= 0) {
              const side = step & 1;
              backbeat[side] += (Math.max(0, clapPeak - clapPrev) - backbeat[side]) * BACKBEAT.EASE;
              backbeats++;
              if (backbeats >= BACKBEAT.WARM && backbeat[0] > backbeat[1] * BACKBEAT.RATIO + BACKBEAT.MARGIN) {
                turnBeat = true; backbeats = 0;
                const t0 = backbeat[0]; backbeat[0] = backbeat[1]; backbeat[1] = t0;
              }
            }
          }
          if (f >= BACKBEAT.TAIL) { clapTail += m; clapTailN++; }
        }
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
        if (height > 0 && lastHeight > 0 && height > lastHeight) blockFound();
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
        mix(fromA, PALETTES[colorTo][0], cf, M.a); mix(fromB, PALETTES[colorTo][1], cf, M.b);
        M.t = t; M.beat = beat; M.step = step; M.kick = kick * dim; M.I = I * dim;
        const rush = 1 + 1.5 * tension;
        M.spin += dt * (0.25 + 0.9 * I) * rush; M.rings += move * Math.PI * (0.3 + 0.7 * I) * rush; M.sweep += move * TAU / 16 * (0.5 + 0.5 * I) * rush;
        M.ripple += dt * (0.7 + 1.5 * I); M.flow += dt * (12 + 40 * I);
        // A drop in the music lasts MUSIC_DROP.
        if (musicT >= 0 && (musicT += dt / MUSIC_DROP) >= 1) musicT = -1;
        const d = musicT, dropping = d >= 0;
        // The stage's lip glows with how hard the music is and on the kick.
        stageEdge.glow = (0.3 + 0.35 * I + 0.35 * kick + 0.4 * tension) * dim;
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
          const reach = ground.fade * (RINGS + 6), flash = M.b;
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
        // opposite pair with it at the hardest.
        // In a build's last half every beam finds the mirror ball, brighter as the drop nears; they go dark before it.
        const building = showUntil < 0 && tension > 0.5;
        const target = showUntil >= 0 ? clamp01((I - 0.45) / 0.35) : building ? (tension - 0.5) * 1.2 : 0;
        laser += (target - laser) * Math.min(1, dt * (target > laser ? 3 : 1.5));
        if (hushK > 0.5) laser = 0;
        const n = PROJ.BEARINGS.length, first = (showPair + Math.floor((beat - showFrom) / PHRASE)) % n;
        const pairs = laser > 0.03 ? 1 << first | (laser > 0.75 ? 1 << (first + 2) % n : 0) : 0;
        if (pairs) {
          const list = kicking ? PULSE_LOOKS : FLOW_LOOKS, no = Math.floor((beat - showFrom) / (kicking ? LOOK_BEATS : FLOW_BEATS));
          const lk = forcedLook !== null ? forcedLook : building ? 5 : lookAt(list, no);
          aim(rigs, beat, t, kick, lk, showColors[0], showColors[1], pairs, look, F, hash01(no + 0.5, showLook));
          const glow = (0.35 + 0.65 * laser) * (0.85 + 0.15 * kick) * (kicking ? 1 : 0.7);
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
          domeShow.paint(dome.from, dome.look, smooth(dome.fade), M);
          domeSurface.version++;
        }
        const night = dome.look === DOME.NIGHT ? dome.fade : dome.from === DOME.NIGHT ? 1 - dome.fade : 0;
        for (let g = 0; g < dots.length; g++) dots[g].glow = (0.12 + 0.3 * night + (0.15 + 0.25 * night) * (0.5 + 0.5 * Math.sin(t * 1.3 + g * 1.7)) + (g === step % dots.length ? 0.5 * kick * I : 0)) * dim;
        // The booth's screen and the LED wall, from the music read once for both (or made from the beat).
        screenDt += dt;
        if ((screenWait -= dt) <= 0) {
          screenWait = 1 / SCREEN.FPS;
          if (!radio.spectrum(music) || !radio.scope(shape)) madeUp(t, kick, I, music, shape);
          const styled = Math.round(cf * 8) + colorTo * 16;
          if (styled !== colorStyled) { colorStyled = styled; wall.colors(M.a, M.b); screen.colors(M.a, M.b); backScreen.colors(M.a, M.b); endScreen.colors(M.a, M.b); }
          screen.paint(screenDt, kick, I, music, shape); backScreen.paint(screenDt, kick, I, music, shape); endScreen.paint(screenDt, kick, I, music, shape);
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
          wall.paint(screenDt, strip.from, strip.look, smooth(strip.fade), M, music, shape);
          screenSurface.version++; backSurface.version++; endSurface.version++; wallSurface.version++; screenDt = 0;
        }
        // The latest block's scoreboard and what plays, under it, in the room's colours.
        panelDt += dt;
        landed = Math.max(0, landed - dt);
        if ((panelWait -= dt) <= 0) {
          panelWait = 1 / PANEL_FPS;
          const bs = surfaceOf(blockPicture), ss = songPicture && songPicture.node.visible ? surfaceOf(songPicture) : null;
          if (bs) { scoreOf(bs.canvas).paint(panelDt, kick * dim, M.a, M.b, colorStyled, feeds.reader, Date.now(), landed); bs.version++; }
          if (ss) { songOf(ss.canvas).paint(panelDt, kick * dim, M.a, M.b, colorStyled, music); ss.version++; }
          panelDt = 0;
        }
        // The LED wall strobes through a build's second half, on eighths then sixteenths, and dims before the drop.
        const strobe = tension > 0.5 ? ((beat * (tension > 0.75 ? 4 : 2)) % 1 < 0.5 ? 1 + 0.6 * tension : 0.6) : 1;
        wallNode.glow = strobe * dim;
        // The woofers push out on the kick.
        const push = 0.02 * kick;
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
        const song = pinned !== null ? pinned : radio.song, on = BL.timechainPartyRadio.STATION;
        if (song !== playing.song || on.short !== playing.station) {
          playing.song = song; playing.station = on.short;
          S.title = song ? `${on.short} · ${song}` : on.short; S.next = `${on.short} · LIVE`;
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
        ball.rotation.y += dt * (0.15 + 0.35 * I + 0.8 * tension);
        ball.glow = (0.55 + 0.35 * I + 0.3 * kick + 0.4 * tension) * dim;
        // A drop's ring of light falls from the crown to the dome's edge in its first half.
        const fall = d / 0.5;
        if (dropping && fall < 1) {
          const el = (90 - fall * (90 - e0)) * DEG, s = Math.max(0.3, (L.R * Math.cos(el) - 0.12) / 1.025);
          wave.position.y = L.c + L.R * Math.sin(el); wave.scale.x = wave.scale.y = wave.scale.z = s;
        } else wave.position.y = AWAY;
        wave.glow = 1;
        // The lights in the room's two colours, as bright as the music is hard.
        const opts = BL.scenes.timechain.renderOpts, lights = opts && opts.lights;
        if (lights && opts.lightCount >= 9) {
          const lift = (0.45 + 0.55 * I) * dim;
          setLight(lights, 0, M.a[0] * lift, M.a[1] * lift, M.a[2] * lift);
          setLight(lights, 1, M.b[0] * lift, M.b[1] * lift, M.b[2] * lift);
          const f = (0.35 + 0.35 * I + 0.3 * kick) * dim;
          setLight(lights, 2, floorRgb[0] * f, floorRgb[1] * f, floorRgb[2] * f);
          const bl = (0.6 + 0.3 * I) * dim;
          setLight(lights, 3, M.b[0] * bl, M.b[1] * bl, M.b[2] * bl);
          const fr = (0.25 + 0.3 * I + 0.25 * kick) * dim, ring = M.a;
          for (let q = 4; q < 8; q++) setLight(lights, q, ring[0] * fr, ring[1] * fr, ring[2] * fr);
          const sc = (0.55 + 0.4 * kick) * dim;
          setLight(lights, 8, screenRgb[0] * sc, screenRgb[1] * sc, screenRgb[2] * sc);
        }
      },
      tap(owner, hud) {
        if (owner.kind === "booth" || owner.kind === "decks" || owner.kind === "speaker") { hud.toast(radio.words()); return true; }
        if (owner.kind !== "live") return false;
        if (owner.tip === "Now playing") { hud.toast(`${BL.timechainPartyRadio.STATION.name} · ${playing.song || "now playing"}`); return true; }
        hud.toast("The latest block, from mempool.space");
        return true;
      },
      // Under debug (`__ooga.timechain.motion`): the radio's state and the room's reading of the music, with handles to
      // hold its intensity, how hard its kick is and the lasers' look (null lets go of each) and its surfaces' looks, drop
      // the bass as a block or the music would, set a surface's look by name at once and set the colours; the drop seen
      // coming and the build toward it, a place in the room's own arrangement to play from (`arrange`), and a song to
      // show under the latest block (`song`, null lets go).
      get stats() {
        return { ...radio.stats, backbeat: [+backbeat[0].toFixed(3), +backbeat[1].toFixed(3)], turned, beat: +beat.toFixed(2), intensity: +I.toFixed(3), analysed, section, kicking, hit: +hit.toFixed(3), laser: +laser.toFixed(3), showing: showUntil >= 0, shows: showCount,
          dropIn: dropBeat >= 0 ? +((dropBeat - beat) / rate).toFixed(2) : -1, tension: +tension.toFixed(3), playing: playing.song,
          arrange: (s) => { shift = 0; shift = s - ((clock() % ARRANGE_S) + ARRANGE_S) % ARRANGE_S; }, song: (text) => { pinned = text; },
          looks: { dome: DOME.NAMES[dome.look], floor: FLOOR.NAMES[ground.look], wall: WALLS.NAMES[strip.look] }, colors: colorTo,
          force: (v) => { forced = v === null ? null : clamp01(v); }, kick: (v) => { forcedKick = v === null ? null : clamp01(v); kickBeat = -1e9; }, laserLook: (i) => { forcedLook = i; }, nudge: () => { beat += 1; const t0 = backbeat[0]; backbeat[0] = backbeat[1]; backbeat[1] = t0; backbeats = 0; }, blockFound, musicDrop: () => { showUntil = -1; musicDrop(1e9); }, hold: (on) => { held = !!on; },
          look: (which, name) => {
            const s = { dome, floor: ground, wall: strip }[which], names = { dome: DOME.NAMES, floor: FLOOR.NAMES, wall: WALLS.NAMES }[which];
            change(s, names.indexOf(name)); s.fade = 1;
          },
          palette: (i) => { colorFrom = colorTo = i % PALETTES.length; colorFade = 1; for (let k = 0; k < 3; k++) { fromA[k] = PALETTES[colorTo][0][k]; fromB[k] = PALETTES[colorTo][1][k]; } } };
      },
      // An Ooga standing still on the floor dances (timechain-party-dance.js) at its player's level: called after the
      // crew and the other players are posed, for each Ooga shown, `off` for one that should stand still now (the
      // visitor's own, seen from its own eyes); `undance` takes every pose off again before anything moves the bodies.
      dance(cave, dt, eyes, level) { return dancer.dance(cave, dt, eyes, level, M); },
      undance() { dancer.undance(); },
      liveGeometry(set) { dancer.liveGeometry(set); },
      danceLevel: () => BL.partyDance.level(),
      // The banner's dance buttons, and - and = (or +) for the same.
      action(name) {
        if (name === "dance-down") setDance(BL.partyDance.level() - 1);
        else if (name === "dance-up") setDance(BL.partyDance.level() + 1);
      },
      // 0 to 9 (on the row or the number pad): 0 stops dancing, 1 to 9 dance that number's move at once; - and = step down
      // and up. 0 is the room's for resetting the view anywhere else, so the party claims it.
      claims: ["0"],
      key(e) {
        if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return false;
        if (e.key === "-" || e.key === "_") { setDance(BL.partyDance.level() - 1); return true; }
        if (e.key === "=" || e.key === "+") { setDance(BL.partyDance.level() + 1); return true; }
        const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
        if (digit && !e.shiftKey) { setDance(+digit[1]); return true; }
        return false;
      },
      controlsHelp: (touch, H) => touch ? [H.row([], "Dance: 0 stands still, 1 to 9 a move each", "Dance − and + buttons")] : [
        H.row(["0"], "Stop dancing"),
        H.row(["1–9"], "Dance: " + BL.partyDance.NUMBERS.slice(1).map((n, i) => `${i + 1} ${n.label.toLowerCase()}`).join(", ")),
        H.row(["-", "="], "The dance number down and up, 0 standing still")
      ],
      // The visitor walking out: the music fades out on the way to the doors, and back in if they stay after all.
      fadeOut() { radio.fadeOut(); },
      fadeBack() { radio.fadeBack(); },
      dispose() { dancer.undance(); if (danceHud) danceHud.hidden = true; radio.dispose(); playing.song = playing.station = ""; }
    };
  };
  // `jetpack`: the visitor's jetpack comes in with them and flies under the dome.
  BL.timechainRoomKinds.party = { plan, animate, door, jetpack: true };
})();
