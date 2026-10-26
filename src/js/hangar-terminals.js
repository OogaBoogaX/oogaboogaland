// The Lightning Jet Hangar's terminals on stands by the runway, and the film show they start, on the static fire
// test's pattern (`hangar-fire.js`): pictures painted once a page life and laid on the stands' screens and the big
// screen, nothing allocated a frame.
//
// Each terminal turns through its pages, `HOLD` seconds each with a blink of blank screen between, the three a page
// apart: the Jet v2 build board (by the stage it has reached), the channels routing a payment through the Jet, a
// rebalance evening out their liquidity, the forwarding log scrolling, the chief engineer's mood (Kortik's Sis's,
// read live) and the film archive's card saying DISPLAY; the dock's terminal shows the Jet's blueprint, its systems and
// its launch countdown instead of the build board, the rebalance and the log. A page may have frames, played at its
// own rate. The crew's desks show pictures of their work too, slower, each desk its own and its two monitors a pair
// that goes together: a channel's liquidity beside the rebalancer's runs, the fees beside the fee policy, HTLCs beside
// the forwarding log, the peer map beside the routing's success, the mempool beside the new channels, the routing
// beside the fees; and on the Jet's side, its engines side by side, its wiring beside a unit's gauges, the static fire
// log beside the chief engineer's orders.
//
// Space beside a terminal (the act button reads DISPLAY), or a tap on it from there, starts the show: the screen hung
// from a gantry far down the runway unrolls, the old projector hung from a gantry over it nearer the door strikes its lamp
// and its reels turn, and down its beam through the hall's dust comes the film, from the repository's reading
// (`jetFeed.reading()`): the countdown leader, the title card, the plebnet era before Jet, the month the repository
// began, then a card for each year and that year's releases, oldest first, each with its date and a picture of what
// it brought, a card for the quiet years between, Jet v2 ahead, and THE END; then the film's tail flaps through the gate
// on bare light, the lamp goes out, the motor runs down and the screen rolls back up. The cards are black, in a silent
// film's ornate border; the pictures sepia under a vignette, each spliced in with a flash of bare light and a clunk;
// all of it flickering, weaving in the gate, grainy and scratched, and lighting the floor in front of it. Pressing
// again stops the show, and every terminal says NOW SHOWING meanwhile. Its sound is `hangarAudio`'s (`projector`,
// `clunk`, `roll`).
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const HM = BL.hangarModels, JM = BL.jetModels;
  const { createNode, addChild } = BL.scene;
  const TAU = Math.PI * 2;

  // A page holds HOLD seconds, BLANK of them a blink of blank screen; an Ooga within REACH of a terminal's stand, its
  // feet under FEET, works it. The terminals' pictures are PX pixels a metre, laid LIFT in front of the screen and drawn
  // before it on Canvas 2D (`FRONT`).
  const HOLD = 6, BLANK = 0.12, REACH = 1.6, FEET = 0.5, PX = 400, LIFT = 0.004, FRONT = -0.15;
  // Each page's frames and how many it plays a second (0: one held, or for the mood page, chosen by her mood); and the
  // pages each kind of terminal turns through.
  const PAGES = { build: [1, 0], route: [3, 2.5], rebal: [3, 0.8], log: [6, 1.5], mood: [6, 0], display: [2, 1.6], blueprint: [1, 0], systems: [1, 0], countdown: [2, 1.4], showing: [2, 2] };
  const TURNS = { crew: ["build", "route", "rebal", "log", "mood", "display"], jet: ["blueprint", "systems", "route", "countdown", "mood", "display"] };
  // The show's beats, s: the screen's case let down from where it is stowed (and wound back up after), the screen
  // unrolling, the lamp striking, a splice's flash of bare light, the tail flapping after THE END, the lamp out while
  // the motor runs down, the screen rolling up; how long a leader's frame, a card, a picture and the title hold; the
  // reels' turn at full, rad/s; the gate's weave, m, and how often it, the grain and the flicker move on, s; and the
  // light the picture throws on the floor, its reach and colour.
  const SHOW = { hoist: 2.5, down: 3.6, strike: 0.9, splice: 0.09, runout: 1.8, dark: 1.4, up: 3, leader: 0.25, card: 4, picture: 4.5, title: 5, reel: 5 };
  const WEAVE = { x: 0.012, y: 0.02, jump: 0.05, every: 1 / 24, grain: 1 / 14 }, LIGHT = { reach: 15, color: [1, 0.9, 0.72], power: 1.6 };
  const STRIKE = [[0.12, 1], [0.22, 0.15], [0.36, 1], [0.44, 0.35], [0.9, 1]];

  const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif', MONO = 'Menlo, Consolas, "Courier New", monospace', SERIF = 'Georgia, "Times New Roman", Times, serif';
  const INK = { bg: "#071733", bar: "#0e2d5c", text: "#cfe8ff", dim: "#6f8fb8", cyan: "#5fe3ff", amber: "#ffb02e", green: "#3dff8a", red: "#ff4b3a", grid: "#17407a" };
  const SEPIA = { ink: "#2b1e10", light: "#f2e4c4", soft: "#d8c49a", card: "#0e0c0a", line: "#e6dcc4", faint: "#b9ad94" };

  // ---- pictures ----

  const sheet = (w, h) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  };
  // A canvas as a picture of `w` by `h` metres facing +z, opaque, or with `over` see-through and blended over what is
  // behind it; `bright` its bloom.
  const plane = (canvas, w, h, bright, over = false, jpeg = false) => {
    const image = new Image();
    image.src = jpeg ? canvas.toDataURL("image/jpeg", 0.86) : canvas.toDataURL("image/png");
    const geo = { verts: [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
    geo.imageSurface = { asset: { width: canvas.width, height: canvas.height, load: () => image }, rect: [-w / 2, -h / 2, w, h], bright };
    if (over) Object.assign(geo.imageSurface, { cutout: true, soft: true, blend: "alpha" });
    return geo;
  };
  const ready = (geo) => {
    const image = geo.imageSurface.asset.load();
    return image.complete && image.naturalWidth > 0;
  };
  const write = (g, s, x, y, px, color, align = "left", font = SANS, weight = "bold", max = 0) => {
    g.font = `${weight} ${px}px ${font}`;
    if (max) while (g.measureText(s).width > max && px > 8) { px *= 0.94; g.font = `${weight} ${px}px ${font}`; }
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = "middle";
    g.fillText(s, x, y);
  };
  const disc = (g, x, y, r, fill, stroke, width = 2) => {
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); }
  };
  const line = (g, ax, ay, bx, by, color, width) => {
    g.strokeStyle = color; g.lineWidth = width; g.lineCap = "round";
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
  };
  const poly = (g, points, fill, stroke, width = 3) => {
    g.beginPath();
    points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.lineJoin = "round"; g.stroke(); }
  };
  // A lightning bolt `s` tall centred at (x, y).
  const bolt = (g, x, y, s, fill, stroke) => poly(g, [[0.12, -0.5], [-0.3, 0.06], [-0.02, 0.06], [-0.14, 0.5], [0.3, -0.08], [0.02, -0.08]].map(([u, v]) => [x + u * s, y + v * s]), fill, stroke, 2);

  // ---- the terminals' pages, on a screen of W by H pixels ----

  const W = Math.round(HM.KIOSK.w * PX), H = Math.round(HM.KIOSK.h * PX);
  const head = (g, title, dot = INK.green) => {
    g.fillStyle = INK.bg; g.fillRect(0, 0, W, H);
    g.fillStyle = INK.bar; g.fillRect(0, 0, W, 30);
    write(g, title, 10, 16, 15, INK.text);
    disc(g, W - 14, 15, 5, dot);
    g.strokeStyle = INK.grid; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, H - 2);
  };
  const PEERS = ["OOGA", "TIKI", "MAMMOTH", "BOLT", "ROCK", "BANANA"];
  const LOG = [["FWD", "21,000", "+21"], ["FWD", "150,000", "+150"], ["MISS", "50,000", "--"], ["FWD", "3,333", "+3"], ["REBAL", "1.2M", "-480"], ["FWD", "69,420", "+69"],
    ["FWD", "8,000", "+8"], ["MISS", "2.1M", "--"], ["FWD", "500,000", "+500"], ["REBAL", "800K", "-320"], ["FWD", "12,345", "+12"], ["FWD", "77,777", "+77"]];
  const MOODS = [["CALM?", INK.green], ["GRUMPY", INK.green], ["CROSS", INK.amber], ["ANGRY", INK.amber], ["FURIOUS", INK.red], ["RAMPAGE!!", INK.red]];
  const SYSTEMS = [["HYDRAULICS", "OK", INK.green], ["FUEL CELLS", "12%", INK.amber], ["LIGHTNING CHANNELS", "8 / 8", INK.green], ["TURBINES", "OK?", INK.amber],
    ["LAUNCH SHIELD", "SEALED", INK.red], ["COCKPIT", "BANANA PEEL", INK.amber], ["CREW", "READY-ISH", INK.green]];
  // The years the archive holds, from the repository's start to the reading's.
  const years = () => {
    const r = BL.jetFeed.reading();
    return r ? `${new Date(r.createdAt).getUTCFullYear()} – ${new Date(r.at).getUTCFullYear()}` : "";
  };
  // A film reel's face, `r` across its middle.
  const reelFace = (g, x, y, r, color) => {
    disc(g, x, y, r, null, color, 4);
    for (let k = 0; k < 5; k++) { const a = k * TAU / 5 - Math.PI / 2; disc(g, x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.22, null, color, 3); }
    disc(g, x, y, r * 0.12, color);
  };
  const PAINT = {
    build: (g) => {
      head(g, "JET V2 · BUILD");
      const done = new Set(JM.STAGES[JM.STAGE]), part = (name, rest) => (done.has(name) ? 100 : rest);
      [["AIRFRAME", part("body", 30)], ["LANDING GEAR", part("gear", 20)], ["WINGS", part("wings", 15)], ["TAIL", part("tail", 10)], ["ENGINES", part("engines", 25)],
        ["CANOPY", part("canopy", 5)], ["AVIONICS", 41], ["FLIGHT SOFTWARE", 63]].forEach(([label, pct], i) => {
        const y = 44 + i * 19.5, color = pct >= 100 ? INK.green : INK.amber;
        write(g, label, 10, y, 10, INK.text);
        g.fillStyle = INK.grid; g.fillRect(120, y - 5, 140, 10);
        g.fillStyle = color; g.fillRect(120, y - 5, 1.4 * pct, 10);
        write(g, `${pct}%`, W - 10, y, 10, color, "right");
      });
    },
    // A payment in from TIKI, through the Jet and out to ROCK, a frame at a time.
    route: (g, f) => {
      head(g, "ROUTING · LIVE");
      const cx = W / 2, cy = 106, at = (i) => { const a = -Math.PI / 2 + i * TAU / 6; return [cx + Math.cos(a) * 112, cy + Math.sin(a) * 52]; };
      for (let i = 0; i < 6; i++) { const [x, y] = at(i); line(g, cx, cy, x, y, i === 1 || i === 4 ? INK.amber : INK.grid, i === 1 || i === 4 ? 3 : 2); }
      for (let i = 0; i < 6; i++) {
        const [x, y] = at(i);
        disc(g, x, y, 8, INK.bar, INK.cyan);
        write(g, PEERS[i], x, y + (y < cy - 1 ? -15 : y > cy + 1 ? 15 : 0), 9, INK.dim, "center");
      }
      disc(g, cx, cy, 17, INK.bar, INK.amber, 3);
      write(g, "JET", cx, cy + 1, 11, INK.amber, "center");
      const [ax, ay] = at(1), [bx, by] = at(4), x = f === 0 ? (ax + cx) / 2 : f === 1 ? cx : (cx + bx) / 2, y = f === 0 ? (ay + cy) / 2 : f === 1 ? cy : (cy + by) / 2;
      disc(g, x, y, f === 1 ? 22 : 7, f === 1 ? "rgba(255, 210, 58, 0.35)" : INK.amber);
      if (f !== 1) disc(g, x, y, 3, "#fff6d0");
      write(g, "FWD 21,000 SAT · FEE 21 SAT", cx, H - 12, 10, INK.green, "center");
    },
    // Five channels' liquidity evening out about the middle.
    rebal: (g, f) => {
      head(g, "REBALANCING", f === 2 ? INK.green : INK.amber);
      const from = [0.88, 0.14, 0.72, 0.27, 0.62], to = [0.55, 0.46, 0.52, 0.47, 0.5];
      for (let i = 0; i < 5; i++) {
        const y = 48 + i * 25, k = from[i] + (to[i] - from[i]) * f / 2;
        write(g, PEERS[i], 10, y, 10, INK.text);
        g.fillStyle = INK.cyan; g.fillRect(84, y - 6, 190 * k, 12);
        g.fillStyle = INK.grid; g.fillRect(84 + 190 * k, y - 6, 190 * (1 - k), 12);
        g.fillStyle = INK.text; g.fillRect(178, y - 9, 2, 18);
      }
      write(g, "LOCAL", 84, 172, 9, INK.cyan);
      write(g, "REMOTE", 274, 172, 9, INK.dim, "right");
      write(g, f === 2 ? "BALANCED · FEE 480 SAT" : "MOVING 1.2M SAT...", W / 2, 189, 10, f === 2 ? INK.green : INK.amber, "center");
    },
    // The forwarding log, a line further on each frame.
    log: (g, f) => {
      head(g, "FORWARDS · LOG");
      for (let k = 0; k < 7; k++) {
        const [kind, sats, fee] = LOG[(f + k) % LOG.length], y = 45 + k * 21, color = kind === "FWD" ? INK.green : kind === "MISS" ? INK.red : INK.amber;
        write(g, `12:${10 + f + k}`, 10, y, 11, INK.dim, "left", MONO, "");
        write(g, kind, 62, y, 11, color, "left", MONO);
        write(g, sats, 214, y, 11, INK.text, "right", MONO, "");
        write(g, fee, W - 10, y, 11, color, "right", MONO, "");
      }
    },
    // A gauge from calm to rampage, its needle on her mood.
    mood: (g, f) => {
      head(g, "CHIEF ENGINEER · MOOD", MOODS[f][1]);
      const cx = W / 2, cy = 138, r = 80;
      for (let k = 0; k < 6; k++) {
        g.globalAlpha = k <= f ? 1 : 0.28;
        g.strokeStyle = MOODS[k][1]; g.lineWidth = 16; g.lineCap = "butt";
        g.beginPath(); g.arc(cx, cy, r, Math.PI + k * Math.PI / 6 + 0.03, Math.PI + (k + 1) * Math.PI / 6 - 0.03); g.stroke();
      }
      g.globalAlpha = 1;
      const a = Math.PI + (f + 0.5) * Math.PI / 6;
      line(g, cx, cy, cx + Math.cos(a) * (r - 16), cy + Math.sin(a) * (r - 16), INK.text, 4);
      disc(g, cx, cy, 7, INK.text);
      write(g, MOODS[f][0], cx, 164, 17, MOODS[f][1], "center");
      write(g, f >= 3 ? "DO NOT POKE" : "POKE AT YOUR OWN RISK", cx, 187, 9, INK.dim, "center");
    },
    // The film archive's card: DISPLAY lit by turns.
    display: (g, f) => {
      head(g, "FILM ARCHIVE");
      reelFace(g, 62, 112, 40, INK.amber);
      write(g, "JET HISTORY", 116, 74, 21, INK.text);
      write(g, years(), 116, 100, 14, INK.amber);
      g.fillStyle = f ? INK.amber : INK.bar; g.fillRect(116, 120, 172, 36);
      g.strokeStyle = INK.amber; g.lineWidth = 2; g.strokeRect(116, 120, 172, 36);
      poly(g, [[132, 128], [148, 138], [132, 148]], f ? INK.bg : INK.amber);
      write(g, "DISPLAY", 160, 139, 17, f ? INK.bg : INK.amber);
      write(g, "ON THE BIG SCREEN", 116, 178, 10, INK.dim);
    },
    // The Jet from above in a blueprint's white lines, nose to the right, called out.
    blueprint: (g) => {
      g.fillStyle = "#0b2a5c"; g.fillRect(0, 0, W, H);
      g.strokeStyle = "#16407e"; g.lineWidth = 1;
      for (let x = 8; x < W; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = 8; y < H; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      write(g, "JET V2 · BLUEPRINT", 10, 16, 14, "#e6f0ff");
      const ink = "#e6f0ff", cy = 112;
      poly(g, [[58, cy - 7], [236, cy - 9], [262, cy], [236, cy + 9], [58, cy + 7]], null, ink, 2);
      for (const s of [-1, 1]) {
        poly(g, [[176, cy + s * 8], [118, cy + s * 76], [96, cy + s * 76], [124, cy + s * 8]], null, ink, 2);
        poly(g, [[86, cy + s * 7], [62, cy + s * 34], [50, cy + s * 34], [64, cy + s * 7]], null, ink, 2);
        g.strokeStyle = ink; g.lineWidth = 2; g.strokeRect(70, cy + s * 14 - 6, 34, 12);
      }
      g.beginPath(); g.ellipse(222, cy, 13, 5, 0, 0, TAU); g.stroke();
      line(g, 222, cy - 5, 250, 52, ink, 1); write(g, "CANOPY", 252, 48, 9, ink);
      line(g, 86, cy + 20, 86, 172, ink, 1); write(g, "ENGINES ×2", 90, 176, 9, ink);
      line(g, 120, cy - 60, 150, 44, ink, 1); write(g, "WINGS", 153, 42, 9, ink);
      line(g, 40, 192, 270, 192, ink, 1); write(g, `${(JM.SIZE.length).toFixed(1)} M`, 155, 184, 9, ink, "center");
    },
    systems: (g) => {
      head(g, "JET V2 · SYSTEMS");
      SYSTEMS.forEach(([label, value, color], i) => {
        const y = 45 + i * 21;
        write(g, label, 10, y, 11, INK.text);
        disc(g, W - 16, y, 4, color);
        write(g, value, W - 26, y, 11, color, "right");
      });
    },
    countdown: (g, f) => {
      head(g, "LAUNCH WINDOW", INK.amber);
      write(g, f ? "T- ?? ?? ??" : "T- ??:??:??", W / 2, 96, 34, INK.amber, "center", MONO);
      write(g, "WHEN IT'S READY.", W / 2, 146, 14, INK.text, "center");
      write(g, "— KORTIK'S SIS", W / 2, 170, 10, INK.dim, "center");
    },
    // The show's marquee, its bulbs chasing round it.
    showing: (g, f) => {
      g.fillStyle = "#140b04"; g.fillRect(0, 0, W, H);
      let i = 0;
      for (let x = 10; x < W - 4; x += 16, i++) { disc(g, x, 9, 4, (i + f) % 2 ? "#ffd27a" : "#5a3a12"); disc(g, W - x, H - 9, 4, (i + f) % 2 ? "#ffd27a" : "#5a3a12"); }
      for (let y = 25; y < H - 16; y += 16, i++) { disc(g, 9, y, 4, (i + f) % 2 ? "#ffd27a" : "#5a3a12"); disc(g, W - 9, H - y, 4, (i + f) % 2 ? "#ffd27a" : "#5a3a12"); }
      write(g, "NOW SHOWING", W / 2, 68, 31, "#ffd23a", "center", SANS, "bold", W - 40);
      write(g, "THE LIGHTNING JET STORY", W / 2, 108, 15, "#f3e3c0", "center", SERIF, "bold", W - 50);
      write(g, "ON THE BIG SCREEN, UP THE RUNWAY", W / 2, 146, 10, "#c9a46a", "center");
    }
  };
  // Every page's frames, painted the first time a terminal wants them, kept for the page life.
  const pages = new Map();
  const page = (name, frame) => {
    const key = `${name}:${frame}`;
    let geo = pages.get(key);
    if (geo) return geo;
    const canvas = sheet(W, H);
    PAINT[name](canvas.getContext("2d"), frame);
    geo = plane(canvas, HM.KIOSK.w, HM.KIOSK.h, 0.45);
    pages.set(key, geo);
    return geo;
  };

  // ---- the crew's desks' pictures, on a screen of W by H pixels ----

  // Each desk's two monitors (`hangarModels.DESK`) show two pictures that go together, as a person's two screens do
  // (`PAIRS`, each side a kind and its variant at the pair's first, second and third desk), held DESK_HOLD seconds and
  // swapped together for the next pair with no blank between, each desk DESK_STEP seconds after the one before. The
  // front row's desks turn through the node's pairs and the back row's through the Jet's build (`DESKS`, in the order
  // of `LAYOUT.stations`), arranged so no two desks show one pair but for the moment they change over, each under its
  // own titles and from that desk's own numbers. DESK_PX pixels a metre.
  const DESK_HOLD = 20, DESK_STEP = 1, DESK_PX = 280;
  const PAIRS = {
    liquidity: [["channels", [0, 1, 2]], ["rebalance", [0, 1, 2]]], earnings: [["fees", [0, 1, 2]], ["policy", [0, 1, 2]]],
    payments: [["htlcs", [0, 1, 2]], ["forwards", [0, 1, 2]]], network: [["peers", [0, 1, 2]], ["routed", [2, 2, 2]]],
    chain: [["mempool", [0, 1, 2]], ["channels", [2, 2, 2]]], volume: [["routed", [0, 1, 1]], ["fees", [0, 1, 2]]],
    engines: [["engine", [0, 1, 2]], ["engine", [1, 2, 0]]], build: [["wiring", [0, 1, 2]], ["engine", [2, 0, 1]]], test: [["firelog", [0, 1, 2]], ["orders", [0, 1, 2]]]
  };
  const DESKS = [["liquidity", "payments", "chain"], ["earnings", "network", "volume"], ["payments", "chain", "liquidity"], ["network", "volume", "earnings"],
    ["chain", "liquidity", "payments"], ["volume", "earnings", "network"], ["engines", "build", "test"], ["build", "test", "engines"], ["test", "engines", "build"]];
  const ORDERS = [["DO NOT PRESS", "THE RED BUTTON.", "— CHIEF ENGINEER"], ["NO BANANAS", "NEAR THE ENGINES.", "THIS MEANS YOU."], ["IF IT GOES BOOM,", "IT WAS KORTIK.", "— SIS"]];
  // The `i`th of the four peers a desk's channels and rebalancer show at their `v`th turn.
  const ownPeer = (i, v) => PEERS[(i + v * 2) % PEERS.length];
  const deskHead = (g, W, H, title, dot = INK.green) => {
    g.fillStyle = INK.bg; g.fillRect(0, 0, W, H);
    g.fillStyle = INK.bar; g.fillRect(0, 0, W, 20);
    write(g, title, 8, 11, 10, INK.text, "left", SANS, "bold", W - 30);
    disc(g, W - 11, 10, 4, dot);
    g.strokeStyle = INK.grid; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, H - 2);
  };
  // Each kind's painter: its `v`th turn round the desks, its numbers from `rand`, which draws the same on both of a
  // desk's monitors.
  const DESK_PAINT = {
    // Four channels' liquidity, local against remote: its turn's four peers (`ownPeer`).
    channels: (g, W, H, v, rand) => {
      deskHead(g, W, H, ["CHANNELS · NORTH", "CHANNELS · SOUTH", "CHANNELS · NEW"][v]);
      const x0 = 64, bw = W - x0 - 10;
      for (let i = 0; i < 4; i++) {
        const y = 36 + i * 21, k = 0.15 + rand() * 0.7;
        write(g, ownPeer(i, v), 8, y, 9, INK.text);
        g.fillStyle = INK.cyan; g.fillRect(x0, y - 5, bw * k, 10);
        g.fillStyle = INK.grid; g.fillRect(x0 + bw * k, y - 5, bw * (1 - k), 10);
      }
      write(g, "LOCAL", x0, H - 10, 8, INK.cyan);
      write(g, "REMOTE", W - 10, H - 10, 8, INK.dim, "right");
    },
    // The routing fees earned, climbing over days.
    fees: (g, W, H, v, rand) => {
      deskHead(g, W, H, ["FEES EARNED · 7 DAYS", "FEES EARNED · 30 DAYS", "FEES EARNED · 90 DAYS"][v]);
      const n = [7, 15, 24][v], x0 = 10, x1 = W - 10, y0 = H - 14, y1 = 44, pts = [];
      g.strokeStyle = INK.grid; g.lineWidth = 1;
      for (let k = 0; k < 4; k++) { const y = y1 + (y0 - y1) * k / 3; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
      for (let i = 0, k = 0.15; i < n; i++) { k = Math.min(1, k + rand() * 0.16 - 0.03); pts.push([x0 + (x1 - x0) * i / (n - 1), y0 - (y0 - y1) * k]); }
      poly(g, [[x0, y0], ...pts, [x1, y0]], "rgba(95, 227, 255, 0.18)");
      g.strokeStyle = INK.cyan; g.lineWidth = 2; g.lineJoin = "round";
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
      write(g, `+${(Math.floor(800 + rand() * 4000) * (v + 1)).toLocaleString("en-US")} SAT`, x1, 32, 10, INK.green, "right");
    },
    // The Jet among its peers, a payment's way lit.
    peers: (g, W, H, v, rand) => {
      deskHead(g, W, H, ["PEER MAP", "PEER MAP · GOSSIP", "PEER MAP · PROBES"][v]);
      const cx = W / 2, cy = 74, n = 6 + v, at = [];
      for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i + rand() * 0.4) * TAU / n; at.push([cx + Math.cos(a) * (W / 2 - 22), cy + Math.sin(a) * 32]); }
      for (let i = 0; i < n; i++) {
        line(g, cx, cy, at[i][0], at[i][1], INK.grid, 2);
        if (rand() < 0.5) line(g, at[i][0], at[i][1], at[(i + 1) % n][0], at[(i + 1) % n][1], INK.grid, 1);
      }
      const hot = Math.floor(rand() * n);
      line(g, cx, cy, at[hot][0], at[hot][1], INK.amber, 3);
      for (let i = 0; i < n; i++) disc(g, at[i][0], at[i][1], 5, INK.bar, INK.cyan);
      disc(g, cx, cy, 11, INK.bar, INK.amber, 2);
      bolt(g, cx, cy, 13, INK.amber);
      write(g, `${n} PEERS · ${Math.floor(20 + rand() * 60)} CHANNELS SEEN`, cx, H - 9, 8, INK.dim, "center");
    },
    // Jet v2's engines on the gauges: speed, exhaust heat and fuel.
    engine: (g, W, H, v, rand) => {
      deskHead(g, W, H, ["ENGINE L · TELEMETRY", "ENGINE R · TELEMETRY", "APU · TELEMETRY"][v]);
      const r = Math.min(25, W / 7), level = [0.2 + rand() * 0.75, 0.2 + rand() * 0.75, 0.2 + rand() * 0.75];
      [["N1", "%"], ["EGT", "°C"], ["FUEL", "%"]].forEach(([label, unit], i) => {
        const cx = W * (i + 0.5) / 3, cy = 70, k = level[i];
        g.lineCap = "butt"; g.lineWidth = 6;
        g.strokeStyle = INK.grid; g.beginPath(); g.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 2.2); g.stroke();
        g.strokeStyle = k > 0.85 ? INK.red : k > 0.65 ? INK.amber : INK.green;
        g.beginPath(); g.arc(cx, cy, r, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * k)); g.stroke();
        write(g, `${Math.round(label === "EGT" ? 300 + k * 600 : k * 100)}${unit}`, cx, cy + 1, 9, INK.text, "center");
        write(g, label, cx, cy + r + 9, 8, INK.dim, "center");
      });
      const hot = level[1] > 0.85, running = level[0] > 0.5;
      write(g, hot ? "RUNNING HOT!" : running ? "SPOOLED UP" : "IDLE · COLD", W / 2, H - 10, 9, hot ? INK.red : running ? INK.amber : INK.cyan, "center");
    },
    // A schematic of the Jet's insides in a blueprint's white lines.
    wiring: (g, W, H, v, rand) => {
      g.fillStyle = "#0b2a5c"; g.fillRect(0, 0, W, H);
      g.strokeStyle = "#16407e"; g.lineWidth = 1;
      for (let x = 6; x < W; x += 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = 6; y < H; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      const ink = "#e6f0ff", wire = v === 2 ? INK.amber : INK.cyan, bw = 38, bh = 16;
      write(g, ["JET V2 · WIRING", "JET V2 · AVIONICS BUS", "JET V2 · FUEL LINES"][v], 8, 11, 10, ink, "left", SANS, "bold", W - 16);
      const names = [["BATT", "BUS", "ECU", "GEN", "NAV", "LN NODE"], ["CPU", "BUS", "RADIO", "GYRO", "HUD", "LN NODE"], ["TANK L", "PUMP", "VALVE", "TANK R", "ENG L", "ENG R"]][v];
      const boxes = names.map((_, i) => [10 + (i % 3) * (W - 20 - bw) / 2 + (rand() - 0.5) * 8, i < 3 ? 34 : 86]);
      g.strokeStyle = wire; g.lineWidth = 1.5;
      for (let i = 1; i < boxes.length; i++) {
        const [ax, ay] = boxes[i - 1], [bx, by] = boxes[i], x1 = ax + bw / 2, y1 = ay + bh / 2, x2 = bx + bw / 2, y2 = by + bh / 2, my = (y1 + y2) / 2;
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1, my); g.lineTo(x2, my); g.lineTo(x2, y2); g.stroke();
      }
      boxes.forEach(([x, y], i) => {
        g.fillStyle = "#0b2a5c"; g.fillRect(x, y, bw, bh);
        g.strokeStyle = ink; g.lineWidth = 1.5; g.strokeRect(x, y, bw, bh);
        write(g, names[i], x + bw / 2, y + bh / 2 + 1, 7, ink, "center", SANS, "bold", bw - 4);
      });
    },
    // The static fire tests, most of them ending the same way.
    firelog: (g, W, H, v, rand) => {
      deskHead(g, W, H, ["STATIC FIRE · LOG", "TEST BOOTH · LOG", "INCIDENT LOG"][v], INK.red);
      const first = 30 + v * 7 + Math.floor(rand() * 4);
      for (let k = 0; k < 5; k++) {
        const y = 33 + k * 18, boom = rand() < 0.75, result = boom ? "BOOM" : rand() < 0.5 ? "FIZZLE" : "OK?!";
        write(g, `TEST ${first + k}`, 8, y, 9, INK.text, "left", MONO);
        write(g, result, W - 8, y, 9, boom ? INK.red : INK.amber, "right", MONO);
      }
      write(g, `${Math.floor(rand() * 2)} DAYS SINCE THE LAST BOOM`, W / 2, H - 10, 8, INK.amber, "center", SANS, "bold", W - 16);
    },
    // The forwarding log, newest first.
    forwards: (g, W, H, v, rand) => {
      deskHead(g, W, H, ["FORWARDING LOG", "FORWARDS · LAST HOUR", "FORWARDS · BIGGEST"][v]);
      for (let k = 0; k < 5; k++) {
        const y = 33 + k * 19, ok = rand() < 0.8, sats = v === 2 ? Math.floor(5 + rand() * 20) * 100000 : Math.floor(1 + rand() * 300) * 1000;
        write(g, `12:${String(59 - k * 4 - Math.floor(rand() * 3)).padStart(2, "0")}`, 8, y, 8.5, INK.dim, "left", MONO, "");
        write(g, sats.toLocaleString("en-US"), W - 40, y, 8.5, INK.text, "right", MONO, "");
        write(g, ok ? `+${Math.max(1, Math.round(sats / 1000))}` : "--", W - 8, y, 8.5, ok ? INK.green : INK.red, "right", MONO);
      }
    },
    // The rebalancer's runs, sats moved from one channel to another, among the four the channels beside it show.
    rebalance: (g, W, H, v, rand) => {
      deskHead(g, W, H, ["REBALANCE QUEUE", "REBALANCER · RUNS", "LIQUIDITY MOVES"][v], INK.amber);
      for (let k = 0; k < 5; k++) {
        const y = 33 + k * 19, a = Math.floor(rand() * 4), b = (a + 1 + Math.floor(rand() * 3)) % 4;
        const amount = [100, 250, 500, 800, 1200][Math.floor(rand() * 5)], state = k === 0 ? 0 : rand() < 0.7 ? 1 : 2;
        write(g, `${ownPeer(a, v)} → ${ownPeer(b, v)}`, 8, y, 8.5, INK.text);
        write(g, amount >= 1000 ? `${(amount / 1000).toFixed(1)}M` : `${amount}K`, W - 44, y, 8.5, INK.dim, "right", MONO, "");
        write(g, ["RUN", "DONE", "FAIL"][state], W - 8, y, 8.5, [INK.amber, INK.green, INK.red][state], "right", MONO);
      }
    },
    // Payments on their way through the Jet, each with the blocks it has left.
    htlcs: (g, W, H, v, rand) => {
      deskHead(g, W, H, ["HTLCS IN FLIGHT", "PENDING HTLCS", "HTLC WATCH"][v]);
      for (let k = 0; k < 4; k++) {
        const y = 34 + k * 22, left = Math.floor(6 + rand() * 138), sats = Math.floor(1 + rand() * 400) * 1000, short = left < 24;
        write(g, `${sats.toLocaleString("en-US")} SAT`, 8, y, 8.5, INK.text, "left", MONO, "");
        write(g, `${left} BLOCKS`, W - 8, y, 8.5, short ? INK.red : INK.dim, "right", MONO, "");
        g.fillStyle = INK.grid; g.fillRect(8, y + 7, W - 16, 4);
        g.fillStyle = short ? INK.red : INK.cyan; g.fillRect(8, y + 7, (W - 16) * left / 144, 4);
      }
    },
    // Each channel's fee and which way it was last moved.
    policy: (g, W, H, v, rand) => {
      deskHead(g, W, H, ["FEE POLICY · PPM", "FEE POLICY · BASE", "AUTO FEES"][v]);
      write(g, "PEER", 8, 30, 8, INK.dim);
      write(g, v === 1 ? "BASE MSAT" : "PPM", W - 8, 30, 8, INK.dim, "right");
      for (let k = 0; k < 5; k++) {
        const y = 45 + k * 16, up = rand() < 0.5, value = v === 1 ? Math.floor(rand() * 4) * 500 : Math.floor(10 + rand() * 900);
        write(g, PEERS[(k + v) % PEERS.length], 8, y, 9, INK.text);
        write(g, String(value), W - 22, y, 9, INK.text, "right", MONO, "");
        poly(g, up ? [[W - 15, y + 3], [W - 11, y - 3], [W - 7, y + 3]] : [[W - 15, y - 3], [W - 11, y + 3], [W - 7, y - 3]], up ? INK.green : INK.red);
      }
    },
    // The next blocks waiting in the mempool, for the channels the Jet opens on-chain.
    mempool: (g, W, H, v, rand) => {
      deskHead(g, W, H, ["MEMPOOL · NEXT BLOCKS", "MEMPOOL · FEES", "CHANNEL OPENS"][v], INK.amber);
      const n = 3, bw = (W - 16 - (n - 1) * 8) / n;
      for (let i = 0; i < n; i++) {
        const x = 8 + i * (bw + 8), y = 32, rate = Math.max(1, Math.round((n - i) * (2 + rand() * 8)));
        g.fillStyle = i === 0 ? "#6a3fd8" : "#3a2f8a"; g.fillRect(x, y, bw, 60);
        write(g, `~${rate}`, x + bw / 2, y + 20, 13, "#ffffff", "center");
        write(g, "SAT/VB", x + bw / 2, y + 36, 7.5, "#d8ccff", "center");
        write(g, `${Math.floor(1500 + rand() * 3000)} TX`, x + bw / 2, y + 50, 7.5, "#d8ccff", "center");
      }
      write(g, v === 2 ? "OPEN WHEN FEES ARE LOW" : `NEXT BLOCK IN ~${Math.floor(1 + rand() * 9)} MIN`, W / 2, H - 14, 8.5, INK.dim, "center");
    },
    // How much the Jet routed, over a row of bars.
    routed: (g, W, H, v, rand) => {
      deskHead(g, W, H, ["ROUTED TODAY", "ROUTED THIS WEEK", "SUCCESS RATE"][v], INK.green);
      const big = v === 2 ? `${Math.floor(80 + rand() * 18)}%` : `${(Math.floor(10 + rand() * 90) / 10 * (v ? 7 : 1)).toFixed(1)}M SAT`;
      write(g, big, W / 2, 46, 20, INK.green, "center", SANS, "bold", W - 20);
      const n = 12, bw = (W - 16) / n;
      for (let i = 0; i < n; i++) {
        const h = 6 + rand() * 34;
        g.fillStyle = i === n - 1 ? INK.amber : INK.cyan;
        g.fillRect(8 + i * bw + 1, H - 10 - h, bw - 2, h);
      }
    },
    // A notice from the chief engineer.
    orders: (g, W, H, v) => {
      deskHead(g, W, H, ["CHIEF ENGINEER'S ORDERS", "SAFETY NOTICE", "SHIFT NOTES"][v], INK.red);
      const [a, b, by] = ORDERS[v];
      write(g, a, W / 2, 50, 14, INK.amber, "center", SANS, "bold", W - 16);
      write(g, b, W / 2, 72, 14, INK.amber, "center", SANS, "bold", W - 16);
      write(g, by, W / 2, 102, 9, INK.dim, "center");
    }
  };

  // ---- the film, on a picture of SW by SH pixels ----

  const SW = 480, SH = 270;
  const monthYear = (iso, long = false) => new Date(iso).toLocaleDateString("en-US", { month: long ? "long" : "short", year: "numeric", timeZone: "UTC" }).toUpperCase();
  // What a release brought, by the words of its tag: the picture it gets and a line under it.
  const KINDS = [["profit", "coins"], ["htlc", "htlc"], ["perform", "gauge"], ["docker", "gauge"], ["rebalanc", "scale"], ["inactive", "sleep"], ["voltage", "bolt"], ["embassy", "house"],
    ["lnd", "bolt"], ["metric", "chart"], ["reliab", "shield"], ["liquid", "drop"], ["probe", "radar"], ["exclude", "ban"], ["clean", "broom"], ["node", "hex"]];
  const LINES = {
    coins: "Counting every sat a channel earns.", htlc: "Watching for the payments that got away.", gauge: "Faster, lighter, and in a container.",
    scale: "A new way to balance the channels.", sleep: "Waking up the sleepy channels.", bolt: "Running on new ground.", house: "Moving in on a new platform.",
    chart: "Now with numbers on everything.", shield: "Fewer surprises, more uptime.", drop: "Liquidity, right where it is needed.", radar: "Sending out probes to map the routes.",
    ban: "Some peers left off the list.", broom: "A good sweep of the database.", hex: "Up to date for a new runtime.", jet: "Another step toward the sky.", network: ""
  };
  const kindOf = (tag) => {
    const t = tag.toLowerCase(), hit = KINDS.find(([word]) => t.includes(word));
    return hit ? hit[1] : "jet";
  };
  const nameOf = (tag) => tag.replace(/^v?\d+(\.\d+)*-?/, "").split("-").filter(Boolean).join(" ").toUpperCase() || "A NEW RELEASE";
  const versionOf = (tag) => { const m = /^v?(\d+(\.\d+)*)/.exec(tag); return m ? `v${m[1]}` : ""; };
  const count = (n) => ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"][n] || String(n);

  // The film from a reading: the countdown leader, the title, the plebnet era, the month the repository began, then by
  // year a card and that year's releases, oldest first, a card for the quiet years between, Jet v2 ahead and THE END.
  // Each frame its picture's key, what it shows and how long it holds.
  const reel = (r) => {
    const out = [], end = r ? new Date(r.at).getUTCFullYear() : new Date().getUTCFullYear();
    for (let n = 5; n >= 2; n--) for (let q = 0; q < 4; q++) out.push({ key: `leader:${n}:${q}`, kind: "leader", n, q, hold: SHOW.leader });
    const from = r ? new Date(r.createdAt).getUTCFullYear() : end;
    out.push({ key: `title:${from}:${end}:${r ? r.repo : ""}`, kind: "title", from, to: end, repo: r ? r.repo : "", hold: SHOW.title });
    out.push({ key: "plebnet", kind: "picture", icon: "network", top: "BEFORE JET", corner: "", title: "THE PLEBNET ERA", line: "Node runners balanced channels and set fees by hand.", hold: SHOW.picture });
    if (r) {
      out.push({ key: `begins:${r.createdAt}`, kind: "card", big: monthYear(r.createdAt, true), lines: ["A simple idea: automate the work", "of running a Lightning node."], small: `${r.repo} begins`, hold: SHOW.card });
      const releases = r.releases.slice().reverse();
      let year = from;
      const quiet = (a, b) => out.push({ key: `quiet:${a}:${b}`, kind: "card", big: a === b ? String(a) : `${a} – ${b}`, lines: ["Quiet years in the hangar.", "The node kept routing,", "the crew kept tinkering."], small: "", hold: SHOW.card });
      releases.forEach((rel) => {
        const y = new Date(rel.at).getUTCFullYear();
        if (y > year) {
          if (y > year + 1) quiet(year + 1, y - 1);
          const n = releases.filter((x) => new Date(x.at).getUTCFullYear() === y).length;
          out.push({ key: `year:${y}:${n}`, kind: "card", big: String(y), lines: [`${count(n)} release${n === 1 ? "" : "s"} that year.`, n >= 6 ? "The busiest year in the hangar." : ""], small: "", hold: SHOW.card });
          year = y;
        }
        const kind = kindOf(rel.tag);
        out.push({ key: `release:${rel.tag}:${rel.at}`, kind: "picture", icon: kind, top: monthYear(rel.at), corner: versionOf(rel.tag), title: nameOf(rel.tag), line: LINES[kind], hold: SHOW.picture });
      });
      if (year < end) quiet(year + 1, end);
    }
    out.push({ key: "v2", kind: "picture", icon: "jet", top: "COMING SOON", corner: "", title: "JET V2", line: "Rebuilt as an economic engine for routing nodes.", hold: SHOW.title });
    out.push({ key: "end", kind: "end", hold: SHOW.card });
    return out;
  };

  // The pictures' drawings in sepia ink, about (x, y), `s` from the middle to the edge.
  const ICON = {
    network: (g, x, y, s, ink) => {
      const pts = [[0, 0]];
      for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + 0.3; pts.push([Math.cos(a) * s * 1.5, Math.sin(a) * s * 0.85]); }
      for (let k = 1; k <= 6; k++) { line(g, x, y, x + pts[k][0], y + pts[k][1], ink, 3); line(g, x + pts[k][0], y + pts[k][1], x + pts[k % 6 + 1][0], y + pts[k % 6 + 1][1], ink, 2); }
      for (const [u, v] of pts) disc(g, x + u, y + v, u || v ? s * 0.16 : s * 0.24, "#d8c49a", ink, 3);
      bolt(g, x, y, s * 0.32, ink);
    },
    jet: (g, x, y, s, ink) => {
      for (let k = 0; k < 4; k++) line(g, x - s * (1.7 + k * 0.12), y - s * 0.3 + k * s * 0.2, x - s * (2.4 + k * 0.2), y - s * 0.3 + k * s * 0.2, ink, 3);
      poly(g, [[x - s * 1.4, y - s * 0.18], [x + s * 0.9, y - s * 0.22], [x + s * 1.5, y], [x + s * 0.9, y + s * 0.2], [x - s * 1.4, y + s * 0.16]], ink);
      poly(g, [[x - s * 0.1, y], [x - s * 0.8, y + s * 0.7], [x - s * 0.45, y + s * 0.7], [x + s * 0.4, y]], ink);
      poly(g, [[x - s * 1.1, y - s * 0.15], [x - s * 1.45, y - s * 0.75], [x - s * 1.2, y - s * 0.75], [x - s * 0.7, y - s * 0.15]], ink);
      g.fillStyle = "#d8c49a"; g.beginPath(); g.ellipse(x + s * 0.75, y - s * 0.16, s * 0.28, s * 0.08, 0, 0, TAU); g.fill();
    },
    coins: (g, x, y, s, ink) => {
      for (let k = 0; k < 4; k++) { g.fillStyle = "#c9b086"; g.strokeStyle = ink; g.lineWidth = 3; g.beginPath(); g.ellipse(x - s * 0.3, y + s * 0.6 - k * s * 0.28, s * 0.7, s * 0.24, 0, 0, TAU); g.fill(); g.stroke(); }
      disc(g, x + s * 0.7, y + s * 0.1, s * 0.55, "#c9b086", ink, 3);
      bolt(g, x + s * 0.7, y + s * 0.1, s * 0.6, ink);
    },
    htlc: (g, x, y, s, ink) => {
      disc(g, x + s * 1.1, y, s * 0.3, "#d8c49a", ink, 3);
      for (const [k, missed] of [[-1, false], [0, true], [1, false]]) {
        const ay = y + k * s * 0.55;
        if (missed) { g.setLineDash([10, 9]); line(g, x - s * 1.5, ay, x + s * 0.2, ay, ink, 3); g.setLineDash([]); line(g, x + s * 0.3, ay - s * 0.2, x + s * 0.6, ay + s * 0.2, ink, 4); line(g, x + s * 0.6, ay - s * 0.2, x + s * 0.3, ay + s * 0.2, ink, 4); }
        else { line(g, x - s * 1.5, ay, x + s * 0.72, y + k * s * 0.12, ink, 3); }
      }
    },
    gauge: (g, x, y, s, ink) => {
      g.strokeStyle = ink; g.lineWidth = 5; g.beginPath(); g.arc(x, y + s * 0.4, s, Math.PI, TAU); g.stroke();
      for (let k = 0; k <= 8; k++) { const a = Math.PI + k * Math.PI / 8; line(g, x + Math.cos(a) * s * 0.78, y + s * 0.4 + Math.sin(a) * s * 0.78, x + Math.cos(a) * s * 0.95, y + s * 0.4 + Math.sin(a) * s * 0.95, ink, 3); }
      const a = Math.PI * 1.85;
      line(g, x, y + s * 0.4, x + Math.cos(a) * s * 0.8, y + s * 0.4 + Math.sin(a) * s * 0.8, ink, 5);
      disc(g, x, y + s * 0.4, s * 0.12, ink);
    },
    scale: (g, x, y, s, ink) => {
      line(g, x, y - s * 0.8, x, y + s * 0.8, ink, 5); line(g, x - s * 0.5, y + s * 0.8, x + s * 0.5, y + s * 0.8, ink, 6);
      line(g, x - s * 1.2, y - s * 0.6, x + s * 1.2, y - s * 0.6, ink, 5);
      for (const k of [-1, 1]) {
        line(g, x + k * s * 1.2, y - s * 0.6, x + k * s * 0.9, y + s * 0.15, ink, 2); line(g, x + k * s * 1.2, y - s * 0.6, x + k * s * 1.5, y + s * 0.15, ink, 2);
        g.fillStyle = ink; g.beginPath(); g.ellipse(x + k * s * 1.2, y + s * 0.18, s * 0.38, s * 0.1, 0, 0, Math.PI); g.fill();
      }
      bolt(g, x, y - s * 0.95, s * 0.4, ink);
    },
    sleep: (g, x, y, s, ink) => {
      disc(g, x - s * 0.4, y + s * 0.2, s * 0.55, "#d8c49a", ink, 4);
      line(g, x - s * 0.65, y + s * 0.1, x - s * 0.5, y + s * 0.12, ink, 3); line(g, x - s * 0.3, y + s * 0.12, x - s * 0.15, y + s * 0.1, ink, 3);
      write(g, "Z", x + s * 0.4, y - s * 0.2, s * 0.6, ink, "center", SERIF); write(g, "z", x + s * 0.85, y - s * 0.6, s * 0.45, ink, "center", SERIF); write(g, "z", x + s * 1.2, y - s * 0.9, s * 0.32, ink, "center", SERIF);
    },
    bolt: (g, x, y, s, ink) => bolt(g, x, y, s * 1.9, ink),
    house: (g, x, y, s, ink) => {
      poly(g, [[x - s * 1.2, y - s * 0.4], [x, y - s * 1], [x + s * 1.2, y - s * 0.4]], ink);
      for (let k = 0; k < 4; k++) g.fillRect(x - s * 0.95 + k * s * 0.6, y - s * 0.3, s * 0.18, s * 0.95);
      g.fillRect(x - s * 1.25, y + s * 0.65, s * 2.5, s * 0.18);
    },
    chart: (g, x, y, s, ink) => {
      line(g, x - s * 1.3, y - s * 0.9, x - s * 1.3, y + s * 0.8, ink, 4); line(g, x - s * 1.3, y + s * 0.8, x + s * 1.4, y + s * 0.8, ink, 4);
      [0.3, 0.55, 0.45, 0.8, 1.15].forEach((h, k) => { g.fillStyle = ink; g.fillRect(x - s * 1.05 + k * s * 0.5, y + s * 0.8 - h * s * 1.3, s * 0.32, h * s * 1.3); });
    },
    shield: (g, x, y, s, ink) => {
      poly(g, [[x, y - s], [x + s * 0.85, y - s * 0.65], [x + s * 0.7, y + s * 0.3], [x, y + s], [x - s * 0.7, y + s * 0.3], [x - s * 0.85, y - s * 0.65]], null, ink, 5);
      poly(g, [[x - s * 0.4, y], [x - s * 0.1, y + s * 0.32], [x + s * 0.45, y - s * 0.35]], null, ink, 6);
    },
    drop: (g, x, y, s, ink) => {
      g.fillStyle = ink; g.beginPath(); g.moveTo(x, y - s); g.quadraticCurveTo(x + s * 0.75, y, x + s * 0.55, y + s * 0.35); g.arc(x, y + s * 0.3, s * 0.56, 0, Math.PI); g.quadraticCurveTo(x - s * 0.75, y, x, y - s); g.fill();
      line(g, x - s * 1.6, y + s * 1.05, x + s * 1.6, y + s * 1.05, ink, 3);
    },
    radar: (g, x, y, s, ink) => {
      for (const k of [0.35, 0.7, 1.05]) { g.strokeStyle = ink; g.lineWidth = 3; g.beginPath(); g.arc(x, y + s * 0.6, s * k * 1.2, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
      line(g, x, y + s * 0.6, x + s * 0.7, y - s * 0.55, ink, 4);
      disc(g, x - s * 0.5, y - s * 0.2, s * 0.09, ink); disc(g, x + s * 0.4, y - s * 0.45, s * 0.09, ink); disc(g, x + s * 0.9, y + s * 0.05, s * 0.09, ink);
    },
    ban: (g, x, y, s, ink) => {
      disc(g, x, y, s * 0.35, ink);
      disc(g, x, y, s * 0.95, null, ink, 7);
      line(g, x - s * 0.67, y - s * 0.67, x + s * 0.67, y + s * 0.67, ink, 7);
    },
    broom: (g, x, y, s, ink) => {
      line(g, x + s * 0.9, y - s * 1, x - s * 0.2, y + s * 0.3, ink, 6);
      poly(g, [[x - s * 0.05, y + s * 0.15], [x - s * 0.45, y + s * 0.55], [x - s * 1.1, y + s * 0.95], [x - s * 0.55, y + s * 1.0], [x - s * 0.05, y + s * 0.7], [x + s * 0.25, y + s * 0.45]], ink);
      for (const [u, v] of [[0.6, 0.5], [0.95, 0.15], [0.3, 0.9]]) { line(g, x + u * s - s * 0.12, y + v * s, x + u * s + s * 0.12, y + v * s, ink, 3); line(g, x + u * s, y + v * s - s * 0.12, x + u * s, y + v * s + s * 0.12, ink, 3); }
    },
    hex: (g, x, y, s, ink) => {
      const pts = [];
      for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + Math.PI / 6; pts.push([x + Math.cos(a) * s, y + Math.sin(a) * s]); }
      poly(g, pts, null, ink, 6);
      bolt(g, x, y, s * 1.05, ink);
    }
  };
  // Age on a film picture: fine grain, a few blotches, a hair and a faint scratch.
  const age = (g, dark) => {
    for (let k = 0; k < 700; k++) {
      g.fillStyle = Math.random() < 0.5 ? "rgba(20, 14, 6, 0.09)" : "rgba(255, 246, 225, 0.08)";
      g.fillRect(Math.random() * SW, Math.random() * SH, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5);
    }
    for (let k = 0; k < 7; k++) disc(g, Math.random() * SW, Math.random() * SH, 0.6 + Math.random() * 2.2, dark ? "rgba(240, 230, 205, 0.5)" : "rgba(30, 20, 8, 0.55)");
    g.strokeStyle = dark ? "rgba(240, 230, 205, 0.35)" : "rgba(30, 20, 8, 0.4)"; g.lineWidth = 1;
    const hx = Math.random() * SW, hy = Math.random() * SH;
    g.beginPath(); g.moveTo(hx, hy); g.quadraticCurveTo(hx + 14, hy - 10, hx + 6 + Math.random() * 20, hy + 16); g.stroke();
    const sx = 40 + Math.random() * (SW - 80);
    g.strokeStyle = "rgba(255, 248, 230, 0.16)";
    g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx + 3, SH); g.stroke();
  };
  // The ornate border of a silent film's card.
  const border = (g) => {
    g.strokeStyle = SEPIA.line; g.lineWidth = 3; g.strokeRect(16, 16, SW - 32, SH - 32);
    g.lineWidth = 1; g.strokeRect(25, 25, SW - 50, SH - 50);
    for (const [x, y] of [[25, 25], [SW - 25, 25], [SW - 25, SH - 25], [25, SH - 25]]) {
      poly(g, [[x, y - 7], [x + 7, y], [x, y + 7], [x - 7, y]], SEPIA.line);
      g.strokeStyle = SEPIA.line; g.lineWidth = 1.5;
      g.beginPath(); g.arc(x + (x < SW / 2 ? 16 : -16), y + (y < SH / 2 ? 16 : -16), 10, 0, TAU); g.stroke();
    }
  };
  const flourish = (g, y) => {
    line(g, SW / 2 - 80, y, SW / 2 - 14, y, SEPIA.line, 1.5);
    line(g, SW / 2 + 14, y, SW / 2 + 80, y, SEPIA.line, 1.5);
    poly(g, [[SW / 2, y - 6], [SW / 2 + 6, y], [SW / 2, y + 6], [SW / 2 - 6, y]], SEPIA.line);
  };
  const FRAMES = {
    // The countdown: grey, its sweep darkening clockwise from twelve a quarter a frame, rings, cross-hairs, the number.
    leader: (g, e) => {
      const cx = SW / 2, cy = SH / 2;
      g.fillStyle = "#aaa396"; g.fillRect(0, 0, SW, SH);
      g.fillStyle = "#6f695d"; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, SW, -Math.PI / 2, -Math.PI / 2 + (e.q + 1) * Math.PI / 2); g.closePath(); g.fill();
      line(g, 0, cy, SW, cy, "#1c1a16", 2); line(g, cx, 0, cx, SH, "#1c1a16", 2);
      disc(g, cx, cy, 104, null, "#f1ece2", 4); disc(g, cx, cy, 90, null, "#1c1a16", 3);
      write(g, String(e.n), cx, cy + 8, 130, "#14120f", "center", SANS);
      age(g, false);
    },
    title: (g, e) => {
      g.fillStyle = SEPIA.card; g.fillRect(0, 0, SW, SH);
      border(g);
      write(g, "LIGHTNING JET PICTURES PRESENTS", SW / 2, 54, 12, SEPIA.faint, "center", SERIF);
      write(g, "THE LIGHTNING JET", SW / 2, 100, 38, SEPIA.light, "center", SERIF, "bold", SW - 80);
      write(g, "STORY", SW / 2, 142, 38, SEPIA.light, "center", SERIF, "bold");
      flourish(g, 172);
      write(g, `${e.from} – ${e.to}`, SW / 2, 200, 20, SEPIA.line, "center", SERIF);
      if (e.repo) write(g, `from the logbook of ${e.repo}`, SW / 2, 230, 12, SEPIA.faint, "center", SERIF, "italic");
      age(g, true);
    },
    card: (g, e) => {
      g.fillStyle = SEPIA.card; g.fillRect(0, 0, SW, SH);
      border(g);
      write(g, e.big, SW / 2, 82, 40, SEPIA.light, "center", SERIF, "bold", SW - 90);
      flourish(g, 116);
      e.lines.forEach((text, i) => text && write(g, text, SW / 2, 150 + i * 27, 19, SEPIA.line, "center", SERIF, "", SW - 90));
      if (e.small) write(g, e.small, SW / 2, SH - 46, 13, SEPIA.faint, "center", SERIF, "italic");
      age(g, true);
    },
    picture: (g, e) => {
      const glow = g.createRadialGradient(SW / 2, SH / 2 - 20, SH * 0.15, SW / 2, SH / 2, SW * 0.62);
      glow.addColorStop(0, "#e4d1a8"); glow.addColorStop(0.65, "#bea173"); glow.addColorStop(1, "#4a3620");
      g.fillStyle = glow; g.fillRect(0, 0, SW, SH);
      ICON[e.icon](g, SW / 2, 104, 58, SEPIA.ink);
      write(g, e.top, 24, 26, 15, SEPIA.ink, "left", SERIF);
      if (e.corner) write(g, e.corner, SW - 24, 26, 15, SEPIA.ink, "right", SERIF);
      g.fillStyle = "rgba(30, 20, 10, 0.86)"; g.fillRect(0, SH - 78, SW, 78);
      write(g, e.title, SW / 2, SH - 52, 27, SEPIA.light, "center", SERIF, "bold", SW - 40);
      if (e.line) write(g, e.line, SW / 2, SH - 21, 15, SEPIA.soft, "center", SERIF, "italic", SW - 40);
      age(g, false);
    },
    end: (g) => {
      g.fillStyle = SEPIA.card; g.fillRect(0, 0, SW, SH);
      border(g);
      write(g, "THE END", SW / 2, SH / 2 - 14, 56, SEPIA.light, "center", SERIF, "bold");
      flourish(g, SH / 2 + 30);
      write(g, "Lightning Jet Pictures", SW / 2, SH / 2 + 62, 14, SEPIA.faint, "center", SERIF, "italic");
      age(g, true);
    }
  };
  // How bright each kind of frame lights the floor in front of it, as a share of the bare lamp's.
  const SHINE = { leader: 0.65, title: 0.25, card: 0.25, picture: 0.75, end: 0.25 };
  // The film's frames, painted a frame or two before they are wanted and kept for the page life, a reading's new ones
  // added beside the old.
  const frames = new Map();
  const frameOf = (e, w, h) => {
    let geo = frames.get(e.key);
    if (geo) return geo;
    const canvas = sheet(SW, SH);
    FRAMES[e.kind](canvas.getContext("2d"), e);
    geo = plane(canvas, w, h, e.kind === "picture" || e.kind === "leader" ? 0.24 : 0.2, false, true);
    frames.set(e.key, geo);
    return geo;
  };
  // The bare lamp on the screen, brightest in its middle; a black sheet for the flicker; and the grain's frames, specks
  // light and dark, hairs and a scratch now and then, which run over the picture in turn.
  const GRAIN = 6;
  const extras = BL.models.cached(() => {
    const pic = HM.filmScreen().picture, light = sheet(160, 90), lg = light.getContext("2d");
    const glow = lg.createRadialGradient(80, 45, 6, 80, 45, 96);
    glow.addColorStop(0, "#fffaf0"); glow.addColorStop(0.6, "#efe4cc"); glow.addColorStop(1, "#a99a7a");
    lg.fillStyle = glow; lg.fillRect(0, 0, 160, 90);
    const black = sheet(4, 4), bg = black.getContext("2d");
    bg.fillStyle = "#000"; bg.fillRect(0, 0, 4, 4);
    const grain = [];
    for (let k = 0; k < GRAIN; k++) {
      const c = sheet(240, 135), g = c.getContext("2d");
      for (let i = 0; i < 40 + Math.random() * 40; i++) disc(g, Math.random() * 240, Math.random() * 135, 0.4 + Math.random() * (Math.random() < 0.1 ? 2.6 : 1.1), Math.random() < 0.6 ? "rgba(20, 14, 6, 0.75)" : "rgba(255, 248, 230, 0.6)");
      for (let i = 0; i < (Math.random() < 0.5 ? 1 : 0); i++) {
        const x = Math.random() * 240, y = Math.random() * 135;
        g.strokeStyle = "rgba(20, 14, 6, 0.6)"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 8, y - 6, x - 4, y + 10, x + 10, y + 18); g.stroke();
      }
      if (Math.random() < 0.6) {
        const x = 20 + Math.random() * 200;
        g.strokeStyle = "rgba(255, 250, 238, 0.5)"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 6, 135); g.stroke();
      }
      grain.push(plane(c, pic.w, pic.h, 0, true));
    }
    return { light: plane(light, pic.w, pic.h, 0.6), black: plane(black, pic.w, pic.h, 0, true), grain };
  });

  // `root`: the scene's root; `audio`: the hangar's sound; `mood()`: Kortik's Sis's mood, 0 to 5; `toast(text)`.
  const create = ({ root, audio, mood, toast }) => {
    const L = HM.LAYOUT, K = HM.KIOSK, P = HM.projector(), S = HM.filmScreen(), B = HM.projectorBeam(), X = extras(), pic = S.picture;

    // ---- the terminals ----
    // Each laid on its screen's face (`monitor`'s, 0.02 in front of the stand's frame), and every frame of its pages
    // at hand by name.
    const live = [], pics = {};
    for (const name of Object.keys(PAGES)) {
      pics[name] = [];
      for (let f = 0; f < PAGES[name][0]; f++) live.push(pics[name][f] = page(name, f));
    }
    const kiosks = L.kiosks.map(([x, z, turn, kind], i) => {
      const c = Math.cos(turn), s = Math.sin(turn), ct = Math.cos(K.tilt), st = Math.sin(K.tilt), face = 0.02 + LIFT;
      const ly = K.y + K.h / 2 * ct - face * st, lz = K.z + K.h / 2 * st + face * ct;
      const turns = TURNS[kind === "jet" ? "jet" : "crew"];
      const node = createNode({ position: { x: x + lz * s, y: ly, z: z + lz * c }, rotation: { x: K.tilt, y: turn, z: 0 }, geometry: pics[turns[0]][0], sightHidden: true, depthBias: FRONT });
      addChild(root, node);
      return { node, x, z, turns, offset: i * HOLD };
    });
    // The desks' monitors, each laid on its screen's face, and the pairs each desk turns through (`steps`, a kind and
    // its variant for each monitor) with their pictures, a geometry for each monitor; painted each desk's first pair
    // at once and the rest a pair a frame (`toPaint`), in the order they come up; and which each desk shows (-1 none
    // yet). `seen` counts each pair's desks so far, which picks its variants.
    const D = HM.DESK, seen = {};
    const desks = L.stations.map(([x, z, turn], i) => {
      const c = Math.cos(turn), s = Math.sin(turn), face = 0.02 + LIFT;
      const nodes = D.monitors.map(([dx, , a]) => {
        const lx = dx + face * Math.sin(a), lz = D.z + face * Math.cos(a);
        const node = createNode({ position: { x: x + lx * c + lz * s, y: D.y + D.h / 2, z: z - lx * s + lz * c }, rotation: { x: 0, y: turn + a, z: 0 }, sightHidden: true, visible: false, depthBias: FRONT });
        addChild(root, node);
        return node;
      });
      const steps = DESKS[i].map((pair) => {
        const k = seen[pair] = (seen[pair] ?? -1) + 1;
        return PAIRS[pair].map(([kind, variants]) => [kind, variants[k]]);
      });
      return { nodes, steps, pics: steps.map(() => []), shown: -1, offset: i * DESK_STEP, seed: 977 + i * 13 };
    });
    const paintDesk = (d, n) => D.monitors.forEach(([, w], m) => {
      const [kind, v] = d.steps[n][m], canvas = sheet(Math.round(w * DESK_PX), Math.round(D.h * DESK_PX));
      DESK_PAINT[kind](canvas.getContext("2d"), canvas.width, canvas.height, v, BL.math.mulberry32(d.seed + n * 2 + m));
      const geo = plane(canvas, w, D.h, 0.45);
      d.pics[n].push(geo);
      live.push(geo);
    });
    const toPaint = [];
    for (let step = 0; step < 3; step++) for (const d of desks) {
      const n = (Math.floor(d.offset / DESK_HOLD) + step) % d.steps.length;
      if (step === 0) paintDesk(d, n); else toPaint.push(d, n);
    }
    let painting = 0;

    // ---- the projector, its beam and the screen ----
    const head = createNode({ position: { ...P.at }, rotation: { ...P.turn }, scale: { x: P.scale, y: P.scale, z: P.scale }, geometry: P.head });
    const glow = createNode({ geometry: P.glow, sightHidden: true });
    const reels = P.reels.map(([y, z]) => createNode({ position: { x: 0, y, z }, geometry: P.reel }));
    addChild(head, glow, ...reels);
    const cradle = createNode({ geometry: P.cradle });
    const beam = createNode({ position: { ...B.position }, rotation: { ...B.rotation }, geometry: B.geometry, sightHidden: true, visible: false });
    const SC = L.show.screen, frame = createNode({ position: { x: SC.x, y: SC.stow, z: SC.z }, geometry: S.frame });
    const rods = createNode({ position: { x: SC.x, y: S.chord, z: SC.z }, scale: { x: 1, y: S.chord - SC.stow - 0.15, z: 1 }, geometry: S.rods });
    const cloth = createNode({ position: { x: SC.x, y: SC.stow - S.under, z: SC.z }, geometry: S.cloth, visible: false });
    const batten = createNode({ position: { x: SC.x, y: SC.stow - S.under, z: SC.z }, geometry: S.batten });
    const slide = createNode({ position: { x: pic.x, y: pic.y, z: pic.z }, geometry: X.light, sightHidden: true, visible: false });
    const grain = X.grain.map((geometry) => createNode({ position: { x: pic.x, y: pic.y, z: pic.z + 0.01 }, geometry, sightHidden: true, visible: false, smokeOpacity: 0.85, depthBias: FRONT }));
    const flicker = createNode({ position: { x: pic.x, y: pic.y, z: pic.z + 0.02 }, geometry: X.black, sightHidden: true, visible: false, smokeOpacity: 0, depthBias: 2 * FRONT });
    addChild(root, cradle, head, beam, frame, rods, cloth, batten, slide, ...grain, flicker);
    live.push(X.light, X.black, ...X.grain);

    // ---- the show ----
    // `phase` and its time; the screen's case let down (0 stowed, 1 down) and where its winding back up began; its
    // unrolling (0 up, 1 down) and where a roll back up began; the lamp's and the motor's levels; the film, the frame
    // showing and its time, a splice's flash left; where the next frames get painted; and the gate's weave, the
    // grain's and the flicker's clocks.
    let phase = "idle", t = 0, hoist = 0, hoistFrom = 0, unroll = 0, upFrom = 0, lamp = 0, motor = 0, film = null, index = 0, at = 0, splice = 0, painted = 0;
    let weaveT = 0, grainT = 0, shownGrain = -1, wx = 0, wy = 0, flick = 0, clock = 0, near = -1, beep = false;
    // The light the picture throws on the floor now (`lights`).
    const light = { level: 0 };
    const running = () => phase === "lower" || phase === "down" || phase === "strike" || phase === "film";
    const go = (next) => { phase = next; t = 0; };
    const start = () => {
      film = reel(BL.jetFeed.reading());
      index = at = splice = painted = 0;
      beep = false;
      go("lower");
      audio.roll(SHOW.hoist);
      toast("Projector on · the Jet's history on the big screen over the runway.");
    };
    const stop = () => {
      if (phase === "lower") { hoistFrom = hoist; go("raise"); audio.roll(SHOW.hoist * hoistFrom); }
      else if (phase === "down") { upFrom = unroll; go("up"); audio.roll(SHOW.up * upFrom); }
      else go("runout");
      toast("Projector off.");
    };
    const press = () => {
      if (phase === "idle") start();
      else if (running()) stop();
      else return false;
      BL.gamepad.rumble(0.2, 0.4, 70);
      return true;
    };
    // The nearest terminal an Ooga standing at (x, z), its feet `feet` up, reaches, or -1.
    const reaches = (x, z, feet) => {
      if (feet >= FEET) return -1;
      let best = -1, bestD = REACH;
      for (let i = 0; i < kiosks.length; i++) {
        const d = Math.hypot(x - kiosks[i].x, z - kiosks[i].z);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    };
    const useNear = (x, z, reach, feet) => reaches(x, z, feet) >= 0 && press();
    const actLabel = () => (near < 0 ? null : phase === "idle" ? "DISPLAY" : running() ? "STOP" : null);

    // The lamp striking: on, stuttering, then steady.
    const struck = (u) => { for (let i = 0; i < STRIKE.length; i++) if (u < STRIKE[i][0]) return STRIKE[i][1]; return 1; };
    const smooth = (u) => { const v = Math.min(1, Math.max(0, u)); return v * v * (3 - 2 * v); };
    // On to the next frame: a splice's flash and a clunk between pictures and cards, none inside the leader, whose "2"
    // pops.
    const advance = () => {
      const was = film[index];
      index++;
      at = 0;
      if (index >= film.length) { go("runout"); return; }
      const now = film[index];
      if (now.kind !== "leader") { splice = SHOW.splice; audio.clunk(); }
      else if (now.n === 2 && now.q === 0 && !beep) { beep = true; audio.beep(pic.x, pic.y, pic.z); }
      if (was.kind === "leader" && now.kind !== "leader") splice = SHOW.splice * 2;
    };

    const update = (dt, driven) => {
      clock += dt;
      t += dt;
      // The show's beats.
      if (phase === "lower") {
        hoist = smooth(t / SHOW.hoist);
        if (t >= SHOW.hoist) { hoist = 1; go("down"); audio.roll(SHOW.down); }
      } else if (phase === "down") {
        unroll = smooth(t / SHOW.down);
        if (t >= SHOW.down) { go("strike"); audio.projector(true); }
      } else if (phase === "strike") {
        lamp = struck(t);
        if (t >= SHOW.strike) go("film");
      } else if (phase === "film") {
        lamp = 1;
        at += dt;
        if (splice > 0) splice -= dt;
        if (at >= film[index].hold) advance();
      } else if (phase === "runout") {
        lamp = 1;
        if (t >= SHOW.runout) { go("dark"); audio.projector(false); }
      } else if (phase === "dark") {
        lamp = Math.max(0, 1 - t * 5);
        if (t >= SHOW.dark) { upFrom = unroll; go("up"); audio.roll(SHOW.up); }
      } else if (phase === "up") {
        lamp = 0;
        unroll = upFrom * (1 - smooth(t / (SHOW.up * Math.max(0.2, upFrom))));
        if (unroll <= 0.001) { unroll = 0; hoistFrom = hoist; go("raise"); audio.roll(SHOW.hoist); }
      } else if (phase === "raise") {
        hoist = hoistFrom * (1 - smooth(t / (SHOW.hoist * Math.max(0.2, hoistFrom))));
        if (hoist <= 0.001) { hoist = 0; go("idle"); }
      }
      // A frame or two painted ahead of the one showing, one a frame.
      if (film && painted < film.length && painted <= index + 2 + (phase === "lower" || phase === "down" ? 24 : 0)) frameOf(film[painted++], pic.w, pic.h);
      // The reels turning with the motor, the lamp's glow, the beam.
      motor += ((phase === "strike" || phase === "film" || phase === "runout" ? 1 : 0) - motor) * Math.min(1, dt * (motor < 0.5 ? 1.2 : 0.8));
      for (let i = 0; i < reels.length; i++) reels[i].rotation.x -= SHOW.reel * motor * dt;
      glow.glow = 0.25 + 1.4 * lamp;
      beam.visible = lamp > 0.3 && unroll > 0.99;
      // The screen: its case as far down as it is let, on its rods from the gantry, the cloth stretched under it as far
      // as it has unrolled, the batten at its foot.
      const caseY = SC.stow + (SC.y - SC.stow) * hoist, drop = SC.drop * unroll;
      frame.position.y = caseY;
      rods.scale.y = S.chord - caseY - 0.15;
      cloth.position.y = caseY - S.under;
      cloth.visible = drop > 0.02;
      cloth.scale.y = Math.max(0.001, drop);
      batten.position.y = caseY - S.under - drop;
      // The picture: bare light while the lamp strikes, through a splice and on the tail; the frame showing otherwise,
      // once its picture has loaded. It weaves in the gate, the grain runs over it and the flicker darkens it by turns.
      const lit = lamp > 0.3 && unroll > 0.99;
      let geo = X.light, shine = 1;
      if (phase === "film" && splice <= 0) {
        const e = film[index], f = frames.get(e.key);
        if (f && ready(f)) { geo = f; shine = SHINE[e.kind]; }
      }
      slide.geometry = geo;
      slide.visible = lit;
      weaveT -= dt;
      if (weaveT <= 0) {
        weaveT = WEAVE.every;
        const jump = Math.random() < 0.02 ? WEAVE.jump : 0;
        wx = (Math.random() - 0.5) * WEAVE.x;
        wy = (Math.random() - 0.5) * WEAVE.y + jump;
        flick = phase === "runout" ? 0.12 + Math.random() * 0.5 : phase === "strike" ? 1 - lamp : 0.04 + Math.random() * 0.08 + (Math.random() < 0.04 ? 0.22 : 0);
      }
      slide.position.x = pic.x + wx;
      slide.position.y = pic.y + wy;
      flicker.visible = lit;
      flicker.smokeOpacity = Math.min(0.92, flick);
      grainT -= dt;
      if (grainT <= 0) {
        grainT = WEAVE.grain;
        const next = lit ? (shownGrain + 1 + Math.floor(Math.random() * (GRAIN - 1))) % GRAIN : -1;
        if (shownGrain >= 0) grain[shownGrain].visible = false;
        if (next >= 0) grain[next].visible = true;
        shownGrain = next;
      }
      if (shownGrain >= 0) {
        if (!lit) { grain[shownGrain].visible = false; shownGrain = -1; }
        else { grain[shownGrain].position.x = pic.x + wx; grain[shownGrain].position.y = pic.y + wy; }
      }
      light.level = lit ? lamp * shine * (1 - flick) : 0;
      // The desks: each its next picture once that has loaded, on both its monitors; and the next desk's painted.
      for (let i = 0; i < desks.length; i++) {
        const d = desks[i], n = Math.floor((clock + d.offset) / DESK_HOLD) % d.steps.length, next = d.pics[n];
        if (n === d.shown || next.length < d.nodes.length) continue;
        let loaded = true;
        for (let m = 0; m < next.length; m++) loaded = loaded && ready(next[m]);
        if (!loaded) continue;
        d.shown = n;
        for (let m = 0; m < d.nodes.length; m++) { d.nodes[m].geometry = next[m]; d.nodes[m].visible = true; }
      }
      if (painting < toPaint.length) { paintDesk(toPaint[painting], toPaint[painting + 1]); painting += 2; }
      // The terminals: their pages in turn, or NOW SHOWING while the show runs.
      for (let i = 0; i < kiosks.length; i++) {
        const k = kiosks[i];
        let name, frameNo = 0;
        if (phase !== "idle") {
          name = "showing";
          frameNo = Math.floor(clock * PAGES.showing[1]) % PAGES.showing[0];
        } else {
          const u = clock + k.offset, n = Math.floor(u / HOLD) % k.turns.length, into = u % HOLD;
          name = into < BLANK ? null : k.turns[n];
          if (name) frameNo = name === "mood" ? mood() : PAGES[name][1] ? Math.floor(into * PAGES[name][1]) % PAGES[name][0] : 0;
        }
        k.node.visible = !!name;
        if (name) k.node.geometry = pics[name][frameNo];
      }
      if (driven) {
        const p = driven.root.position;
        near = reaches(p.x, p.z, p.y - driven.baseY);
      } else near = -1;
    };

    // The picture's light on the floor in front of it, first after the scene's fixed ones; how many it wrote.
    const lights = (Lt, slot) => {
      if (light.level < 0.01) return 0;
      const o = slot * 8, k = light.level * LIGHT.power, C = LIGHT.color;
      Lt[o] = pic.x; Lt[o + 1] = pic.y - 1.4; Lt[o + 2] = pic.z + 3.2; Lt[o + 3] = LIGHT.reach;
      Lt[o + 4] = C[0] * k; Lt[o + 5] = C[1] * k; Lt[o + 6] = C[2] * k; Lt[o + 7] = 0;
      return 1;
    };
    const liveGeometry = (set) => { for (const g of live) set.add(g); };

    return {
      update, useNear, actLabel, press, lights, liveGeometry, nodes: kiosks.map((k) => k.node), projector: head, screen: frame,
      get near() { return near >= 0; },
      debug: {
        press, get phase() { return phase; }, get index() { return index; }, get frame() { return film && film[index] ? film[index].key : null; }, get film() { return film ? film.map((e) => e.key) : []; },
        // Skip to frame `i` of the film, or with none the next.
        skip: (i) => { if (phase === "film") { index = Math.max(0, Math.min(film.length - 1, i === undefined ? index + 1 : i)) - 1; advance(); } return index; },
        get desks() { return desks.map((d) => (d.shown < 0 ? null : d.steps[d.shown].map(([kind, v]) => `${kind}:${v}`).join(" | "))); },
        get hoist() { return hoist; }, get unroll() { return unroll; }, get lamp() { return lamp; }, get light() { return light.level; }, get clock() { return clock; }, set clock(v) { clock = v; }
      }
    };
  };

  BL.hangarTerminals = { create, PAGES, reel };
})();
