// Room 7, the Mining Museum: how the work moved from hobby desktops to warehouses, and why today's hardware does
// about a million times more hashes per joule than in 2009. The dome is seventeen years of network hashrate on a log
// scale wrapped round the room, from 2009 by the door on the left to today on the right, shaded by era (CPU, GPU,
// FPGA, ASIC) right over that era's exhibits, the hash units labelled over the door where the chart starts and ends;
// the crown spells today's rate out, live from mempool.space when it can read it. Eleven exhibits stand round a ring
// in date order, each a model (1.6 times life size) on a plinth with its plaque; a tap opens the plaques as a board.
// A big S21 turns slowly on a plinth in the middle.
(() => {
  "use strict";
  const BL = window.BL;
  const RM = BL.timechainRoomModels, CH = BL.timechainCharts, ROOMS = BL.timechainRooms, P = RM.paintKit;
  const { box, merge } = BL.models;
  const { own } = RM.helpers;
  const C = {
    amber: "#f7931a", amberText: "#ffb04d", white: "#f4efe6", grey: "#a89c8b", ink: "#14110e", stone: "#d8d0c2", post: "#3a3530",
    alu: "#b8bec6", dark: "#1c1e22", beige: "#cfc6b0", pcb: "#1f6b3a", chip: "#111111", fanPlate: "#2a2d32", fanHole: "#0d0e10",
    blade: "#41454c", hub: "#7a8089", led: "#3ce07a", cable: "#1d6fd6", label: "#e8e8ea"
  };

  // ---------- what the museum says (checked against the Bitcoin Wiki's hardware tables, the makers' specifications
  // and mempool.space's hashrate history) ----------
  // Each exhibit: its year (placing it on the ring and the dome), the plaque's title, name, line and three stats, and
  // its joules a terahash for the plaque's efficiency scale (none for the pool, which is an idea, not a machine).
  const MINERS = [
    { year: 2009.1, title: "CPU", name: "The first blocks", text: "Desktop processors, including Satoshi's, mined the first blocks. Through 2009 the whole network averaged about 5 MH/s.", stats: [["Hashrate", "a few MH/s"], ["Power", "~100 W"], ["J/TH", "~20,000,000"]], model: "cpu", jth: 2e7 },
    { year: 2010.6, title: "GPU", name: "Graphics cards", text: "GPU miners arrived in 2010. A Radeon HD 5870 did about 350 MH/s.", stats: [["Hashrate", "~350 MH/s"], ["Power", "~190 W"], ["J/TH", "~550,000"]], model: "gpu", jth: 5.5e5 },
    { year: 2010.95, title: "POOLS", name: "Mining pools", text: "Slush's pool found its first block in December 2010: miners share the work and split the reward for steadier pay.", stats: [["Idea", "share the work"], ["Pay", "small, steady"], ["Today", "most hashrate"]], model: "pool", jth: null },
    { year: 2011.6, title: "FPGA", name: "FPGA boards", text: "Programmable chips: over half a GPU's hashrate on a twentieth of its power.", stats: [["Hashrate", "~215 MH/s"], ["Power", "~10 W"], ["J/TH", "~46,000"]], model: "fpga", jth: 4.6e4 },
    { year: 2013.05, title: "ASIC", name: "Avalon and Block Erupter", text: "The first chips made only for SHA-256. Avalon's first batch shipped in January 2013.", stats: [["Avalon", "~66 GH/s"], ["USB stick", "333 MH/s"], ["J/TH", "~9,400"]], model: "avalon", jth: 9400 },
    { year: 2016.4, title: "S9", name: "Antminer S9", text: "The workhorse of its era, still hashing in places years later.", stats: [["Hashrate", "14 TH/s"], ["Power", "1,375 W"], ["J/TH", "98"]], model: "s9", jth: 98 },
    { year: 2019.3, title: "S17", name: "Antminer S17 Pro", text: "7 nm chips pass 50 TH/s in one box.", stats: [["Hashrate", "53 TH/s"], ["Power", "2,094 W"], ["J/TH", "39.5"]], model: "s17", jth: 39.5 },
    { year: 2020.4, title: "S19", name: "Antminer S19 Pro", text: "Over 100 TH/s, shipping around the 2020 halving.", stats: [["Hashrate", "110 TH/s"], ["Power", "3,250 W"], ["J/TH", "29.5"]], model: "s19", jth: 29.5 },
    { year: 2023.85, title: "S21", name: "Antminer S21", text: "200 TH/s in one box, below 20 joules a terahash.", stats: [["Hashrate", "200 TH/s"], ["Power", "3,500 W"], ["J/TH", "17.5"]], model: "s21", jth: 17.5 },
    { year: 2024.7, title: "BITAXE", name: "Bitaxe Gamma", text: "An open-source home miner the size of a hand: one S21 Pro chip on the power of a desk lamp.", stats: [["Hashrate", "~1.2 TH/s"], ["Power", "~18 W"], ["J/TH", "~15"]], model: "bitaxe", jth: 15 },
    { year: 2024.9, title: "HYDRO", name: "Antminer S21 XP Hydro", text: "Water-cooled for warehouses and heat reuse.", stats: [["Hashrate", "473 TH/s"], ["Power", "5,676 W"], ["J/TH", "12"]], model: "hydro", jth: 12 }
  ];
  // Network hashrate, log10 of hashes a second: mempool.space's daily estimates (/api/v1/mining/hashrate/all)
  // averaged over five weeks round each point, every quarter from January 2009 to November 2026.
  const HISTORY = [[2009.05, 6.74], [2009.3, 6.76], [2009.55, 6.5], [2009.8, 6.53], [2010.05, 7.05], [2010.3, 7.88], [2010.55, 9.18], [2010.8, 10.28],
    [2011.05, 11.19], [2011.3, 11.92], [2011.55, 13.1], [2011.8, 12.97], [2012.05, 12.98], [2012.3, 13.06], [2012.55, 13.15], [2012.8, 13.36],
    [2013.05, 13.36], [2013.3, 13.84], [2013.55, 14.39], [2013.8, 15.41], [2014.05, 16.2], [2014.3, 16.74], [2014.55, 17.13], [2014.8, 17.43],
    [2015.05, 17.49], [2015.3, 17.53], [2015.55, 17.57], [2015.8, 17.65], [2016.05, 17.96], [2016.3, 18.12], [2016.55, 18.18], [2016.8, 18.26],
    [2017.05, 18.44], [2017.3, 18.58], [2017.55, 18.78], [2017.8, 18.97], [2018.05, 19.26], [2018.3, 19.45], [2018.55, 19.61], [2018.8, 19.71],
    [2019.05, 19.63], [2019.3, 19.66], [2019.55, 19.83], [2019.8, 19.97], [2020.05, 20.04], [2020.3, 20.05], [2020.55, 20.09], [2020.8, 20.12],
    [2021.05, 20.18], [2021.3, 20.21], [2021.55, 20.01], [2021.8, 20.18], [2022.05, 20.27], [2022.3, 20.33], [2022.55, 20.31], [2022.8, 20.42],
    [2023.05, 20.44], [2023.3, 20.54], [2023.55, 20.57], [2023.8, 20.65], [2024.05, 20.73], [2024.3, 20.79], [2024.55, 20.79], [2024.8, 20.84],
    [2025.05, 20.9], [2025.3, 20.94], [2025.55, 20.96], [2025.8, 21.03], [2026.05, 20.99], [2026.3, 20.98], [2026.55, 20.96], [2026.84, 21.01]];
  // Today's rate as the crown shows it with no live reading: the 30-day average to 10 November 2026.
  const BAKED = { rate: 1.03e21, when: "30-day average · Nov 2026" };
  // The chart wraps the dome from 2009 by the door on the left (azimuth -168) to its end on the right (168), the same
  // distance either side of the unit labels over the door (180).
  const START = 2009, END = 2026.9, azOf = (yr) => -168 + (yr - START) / (END - START) * 336;
  // The eras' tints are faint: the dome's screen shows its canvas about twice as bright as it is painted.
  const ERAS = [["CPU", 2009, 2010.5, "rgba(120,160,255,.06)"], ["GPU", 2010.5, 2011.5, "rgba(80,220,140,.06)"], ["FPGA", 2011.5, 2013, "rgba(230,200,60,.06)"], ["ASIC", 2013, END, "rgba(247,147,26,.04)"]];
  const UNITS = [[6, "MH/s"], [9, "GH/s"], [12, "TH/s"], [15, "PH/s"], [18, "EH/s"], [21, "ZH/s"]];
  // The exhibits' azimuths: their years', pushed apart where years crowd so neighbours keep 13 degrees.
  const AZ = [];
  MINERS.forEach((ex, i) => { const a = azOf(ex.year); AZ.push(i && a < AZ[i - 1] + 13 ? AZ[i - 1] + 13 : a); });
  const headingTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
  // Plinths (their top at TOP), and the big S21's scale.
  const TOP = 0.9, BIG = 2.2;

  // ---------- the models, 1.6 times life size, each on its plinth facing -z (the ring's middle) ----------
  // A fan on a face looking along `side` (-1 for -z): its plate, the dark hole, five blades and the hub.
  const fan = (k, s, w, x, y, z, side) => {
    const t = 0.04 * w, at = (d) => z + side * (t / 2 + d * w);
    k.box(w * s, w * s, t * s, C.fanPlate, x * s, y, z * s);
    k.cyl(0.45 * w * s, 0.45 * w * s, 0.01 * w * s, C.fanHole, x * s, y, at(0.01) * s, { rx: Math.PI / 2, seg: 16 });
    for (let b = 0; b < 5; b++) {
      const a = b * P.TAU / 5;
      k.box(0.34 * w * s, 0.11 * w * s, 0.01 * w * s, C.blade, (x + Math.cos(a) * 0.2 * w) * s, y + Math.sin(a) * 0.2 * w * s, at(0.03) * s, { rz: a + 0.35 });
    }
    k.cyl(0.1 * w * s, 0.1 * w * s, 0.02 * w * s, C.hub, x * s, y, at(0.045) * s, { rx: Math.PI / 2, seg: 10 });
  };
  // An ASIC's size as [length, width, height, colour], 1.6 times its real box.
  const ASIC = { s9: [0.56, 0.22, 0.25, C.alu], s17: [0.9, 0.31, 0.46, "#aab0b8"], s19: [0.64, 0.31, 0.46, C.alu], s21: [0.64, 0.31, 0.46, "#8a9099"], hydro: [0.66, 0.27, 0.33, "#3a3e45"] };
  const LABEL = { s9: "S9", s17: "S17 PRO", s19: "S19 PRO", s21: "S21", hydro: "S21 XP HYD" };
  // A miner in kit `k`, standing at height `y`, `s` times the museum's size. Returns where its own pictures go: an
  // ASIC's top label, the desktop's screen.
  const model = (k, kind, s = 1, y = 0) => {
    const B = (w, h, d, color, x, yy, z, o) => k.box(w * s, h * s, d * s, color, x * s, y + yy * s, z * s, o);
    const Y = (rt, rb, h, color, x, yy, z, o) => k.cyl(rt * s, rb * s, h * s, color, x * s, y + yy * s, z * s, o);
    const lit = (w, h, d, color, x, yy, z) => B(w, h, d, color, x, yy, z, { emissive: 0.95, glow: true });
    if (kind === "cpu") {
      B(0.22, 0.46, 0.46, C.beige, -0.28, 0.23, 0.05);
      B(0.14, 0.02, 0.01, "#2a2620", -0.28, 0.36, -0.184);
      lit(0.02, 0.02, 0.01, C.led, -0.21, 0.07, -0.184);
      B(0.42, 0.36, 0.38, C.beige, 0.14, 0.18, 0.06);
      B(0.3, 0.26, 0.2, C.beige, 0.14, 0.17, 0.32);
      B(0.36, 0.02, 0.14, C.beige, 0.14, 0.01, -0.3);
      for (let r = 0; r < 3; r++) B(0.32, 0.006, 0.03, "#a89f88", 0.14, 0.022, -0.34 + r * 0.04);
      return { screen: { w: 0.3 * s, h: 0.24 * s, x: 0.14 * s, y: y + 0.2 * s, z: -0.136 * s } };
    }
    if (kind === "gpu") {
      for (const [x, z] of [[-0.36, -0.2], [0.36, -0.2], [-0.36, 0.25], [0.36, 0.25]]) B(0.03, 0.42, 0.03, C.alu, x, 0.21, z);
      B(0.75, 0.03, 0.5, C.alu, 0, 0.42, 0.02);
      B(0.75, 0.02, 0.5, C.pcb, 0, 0.01, 0.02);
      B(0.16, 0.08, 0.14, C.dark, 0.26, 0.475, 0.12);
      for (let i = 0; i < 4; i++) {
        const z = -0.15 + i * 0.12;
        B(0.6, 0.2, 0.04, C.dark, 0, 0.22, z);
        B(0.02, 0.22, 0.05, C.alu, -0.31, 0.22, z);
        for (const x of [-0.15, 0.15]) fan(k, s, 0.15, x, y + 0.22 * s, z - 0.02, -1);
      }
      return {};
    }
    if (kind === "pool") {
      B(0.32, 0.08, 0.2, C.dark, 0, 0.04, 0);
      lit(0.24, 0.02, 0.02, C.led, 0, 0.06, -0.101);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * P.TAU + 0.3, x = Math.sin(a) * 0.38, z = Math.cos(a) * 0.32;
        B(0.12, 0.13, 0.12, C.beige, x, 0.065, z);
        lit(0.03, 0.02, 0.01, C.led, x, 0.1, z - 0.061);
        B(0.016, 0.016, Math.hypot(x, z) - 0.16, C.cable, x / 2, 0.02, z / 2, { ry: Math.atan2(x, z) });
      }
      return {};
    }
    if (kind === "fpga") {
      for (let i = 0; i < 3; i++) {
        const yy = 0.05 + i * 0.1;
        B(0.42, 0.02, 0.3, C.pcb, 0, yy, 0);
        B(0.1, 0.025, 0.1, C.chip, -0.08, yy + 0.02, 0);
        B(0.06, 0.02, 0.06, C.chip, 0.12, yy + 0.02, 0.06);
        lit(0.02, 0.012, 0.02, C.led, 0.17, yy + 0.016, -0.12);
        for (const [x, z] of [[-0.19, -0.13], [0.19, -0.13], [-0.19, 0.13], [0.19, 0.13]]) Y(0.01, 0.01, 0.1, C.alu, x, yy - 0.05, z, { seg: 6 });
      }
      return {};
    }
    if (kind === "avalon") {
      B(0.3, 0.44, 0.34, "#2b2b2e", -0.16, 0.22, 0);
      lit(0.31, 0.04, 0.355, C.amber, -0.16, 0.33, 0);
      for (let r = 0; r < 4; r++) B(0.22, 0.012, 0.01, "#121214", -0.16, 0.1 + r * 0.045, -0.172);
      B(0.3, 0.03, 0.08, C.dark, 0.24, 0.015, 0);
      for (let i = 0; i < 3; i++) {
        const x = 0.15 + i * 0.09;
        B(0.045, 0.13, 0.02, "#2a5ab0", x, 0.095, 0);
        B(0.05, 0.05, 0.03, "#c9a23a", x, 0.12, 0);
        lit(0.01, 0.01, 0.005, C.led, x, 0.05, -0.012);
      }
      return {};
    }
    if (kind === "bitaxe") {
      for (const [x, z] of [[-0.09, -0.09], [0.09, -0.09], [-0.09, 0.09], [0.09, 0.09]]) Y(0.01, 0.01, 0.06, C.alu, x, 0.03, z, { seg: 6 });
      B(0.2, 0.012, 0.2, "#1b3a6b", 0, 0.066, 0);
      B(0.1, 0.03, 0.1, C.alu, 0, 0.087, 0);
      for (let f = 0; f < 5; f++) B(0.1, 0.03, 0.006, C.alu, 0, 0.115, -0.04 + f * 0.02);
      Y(0.045, 0.045, 0.02, C.dark, 0, 0.14, 0, { seg: 16 });
      lit(0.06, 0.035, 0.008, C.led, 0.05, 0.09, -0.098);
      B(0.03, 0.02, 0.03, "#2b2b2e", -0.07, 0.082, -0.08);
      return {};
    }
    const [len, w, h, color] = ASIC[kind];
    B(w, h, len, color, 0, h / 2, 0);
    // Seams down its sides, the controller's panel at the back.
    for (const side of [-1, 1]) B(0.004, h * 0.8, len * 0.9, "#6e737a", side * (w / 2 + 0.002), h / 2, 0);
    if (kind === "hydro") {
      // Water-cooled: no fans; a front panel with its status lights, and the water in and out at the back.
      B(w * 0.9, h * 0.8, 0.012, "#24272c", 0, h / 2, -len / 2 - 0.006);
      lit(0.02, 0.02, 0.006, C.led, -w * 0.3, h * 0.8, -len / 2 - 0.014);
      lit(0.02, 0.02, 0.006, "#ff5a3d", -w * 0.2, h * 0.8, -len / 2 - 0.014);
      for (const x of [-0.07, 0.07]) Y(0.03, 0.03, 0.3, C.cable, x, h * 0.6, len / 2 + 0.15, { rx: Math.PI / 2, seg: 10 });
    } else {
      const f = Math.min(w, h) * 0.92;
      fan(k, s, f, 0, y + h / 2 * s, -len / 2, -1);
      fan(k, s, f, 0, y + h / 2 * s, len / 2, 1);
    }
    return { label: { w: w * 0.9 * s, h: len * 0.5 * s, y: y + (h + 0.004) * s, text: LABEL[kind] } };
  };
  // The plinth every exhibit stands on: pale stone with an amber band under its top.
  const plinth = own(() => merge(
    box({ w: 1.2, h: TOP, d: 1.2, color: C.stone, offset: { y: TOP / 2 } }),
    box({ w: 1.24, h: 0.04, d: 1.24, color: C.amber, emissive: 1, offset: { y: TOP - 0.04 } })
  ));

  // ---------- pictures ----------
  // An ASIC's top label, white with ANTMINER and the model in black.
  const paintLabel = (text) => (ctx, w, h) => {
    ctx.fillStyle = C.label; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#c9c9cc"; ctx.fillRect(0, h * 0.06, w, 3); ctx.fillRect(0, h * 0.94 - 3, w, 3);
    P.pix(ctx, "ANTMINER", w / 2, h * 0.36, Math.min(w * 0.11, h * 0.14), "#17110a");
    P.pix(ctx, text, w / 2, h * 0.62, Math.min(w * 0.75 / Math.max(3, text.length) * 7 / 6, h * 0.2), "#17110a");
  };
  // The desktop's screen: the first client with Generate Coins ticked.
  const paintCrt = (ctx, w, h) => {
    ctx.fillStyle = "#031006"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#5dff95"; ctx.font = P.font(500, 17, P.MONO); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ["bitcoin v0.1", "Options:", " [x] Generate Coins", "blocks: 1,207"].forEach((line, i) => ctx.fillText(line, 14, 34 + i * 26));
    ctx.fillStyle = "rgba(0,0,0,.25)";
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  };
  // A plaque, `k` times its 560 by 440 size: year and title, name, the line, and three stats.
  const PLAQUE = { w: 560, h: 440 };
  const paintPlaque = (ctx, ex, k = 1) => {
    const W = PLAQUE.w * k, H = PLAQUE.h * k;
    ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = C.amber; ctx.lineWidth = 6 * k; ctx.strokeRect(6 * k, 6 * k, W - 12 * k, H - 12 * k);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    P.pix(ctx, `${Math.floor(ex.year)} · ${ex.title}`, 28 * k, 48 * k, 30 * k, C.amberText, "left");
    ctx.fillStyle = C.white; P.fit(ctx, ex.name, 500 * k, 700, 36 * k); ctx.fillText(ex.name, 28 * k, 112 * k);
    ctx.fillStyle = "#d4c8b6"; ctx.font = P.font(400, 23 * k);
    let line = "", y = 152 * k;
    for (const word of ex.text.split(" ")) {
      const t = line ? line + " " + word : word;
      if (ctx.measureText(t).width > 500 * k) { ctx.fillText(line, 28 * k, y); y += 30 * k; line = word; } else line = t;
    }
    ctx.fillText(line, 28 * k, y);
    // Efficiency on a log scale from 10^7.5 joules a terahash (left) to 10^0.5 (right): every machine a tick, this one
    // lit, so walking the ring the dot runs from one end to the other.
    if (ex.jth) {
      const x0 = 28 * k, w = 504 * k, at = (j) => x0 + (7.5 - Math.log10(j)) / 7 * w;
      P.pix(ctx, "JOULES A TERAHASH · LOG SCALE", x0, 250 * k, 12 * k, "#8c7f6c", "left");
      ctx.fillStyle = "#2b2520"; P.roundRect(ctx, x0, 264 * k, w, 12 * k, 6 * k); ctx.fill();
      ctx.fillStyle = "rgba(247,147,26,.45)"; P.roundRect(ctx, x0, 264 * k, at(ex.jth) - x0, 12 * k, 6 * k); ctx.fill();
      for (const other of MINERS) if (other.jth && other !== ex) { ctx.fillStyle = "#6e6457"; ctx.fillRect(at(other.jth) - 1.5 * k, 261 * k, 3 * k, 18 * k); }
      ctx.fillStyle = C.amberText; ctx.beginPath(); ctx.arc(at(ex.jth), 270 * k, 10 * k, 0, P.TAU); ctx.fill();
      ctx.fillStyle = "#8c7f6c"; ctx.font = P.font(500, 15 * k, P.MONO); ctx.textAlign = "center";
      for (const [j, label] of [[1e7, "10,000,000"], [1e5, "100,000"], [1e3, "1,000"], [10, "10"]]) ctx.fillText(label, at(j), 302 * k);
      ctx.textAlign = "left";
    }
    ex.stats.forEach(([key, value], i) => {
      const x = (28 + i * 172) * k;
      ctx.fillStyle = "#d98a2b"; ctx.font = P.font(500, 19 * k); ctx.fillText(key, x, 360 * k);
      ctx.fillStyle = C.white; P.fit(ctx, value, 160 * k, 600, 26 * k, P.MONO); ctx.fillText(value, x, 398 * k);
    });
  };
  const plaques = own(() => MINERS.map((ex) => {
    const canvas = CH.canvas(PLAQUE.w, PLAQUE.h);
    paintPlaque(canvas.getContext("2d"), ex);
    return RM.flatPicture(canvas, 1, 0.79);
  }));
  // The sign on the middle plinth's front.
  const paintSign = (ctx, w, h) => {
    ctx.fillStyle = C.ink; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = C.amber; ctx.lineWidth = h * 0.04; ctx.strokeRect(h * 0.04, h * 0.04, w - h * 0.08, h - h * 0.08);
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = C.white;
    for (const [text, y] of [["One S21 (200 TH/s) outhashes the whole", 0.27], ["2012 network (~16 TH/s) about 13 times over", 0.5]]) { P.fit(ctx, text, w * 0.9, 600, h * 0.14); ctx.fillText(text, w / 2, h * y); }
    P.pix(ctx, "MODELS 1.6X LIFE SIZE · STATS APPROXIMATE", w / 2, h * 0.76, h * 0.075, C.amberText);
  };
  // The crown: today's rate in full, live from mempool.space's reading when there is one, else the baked figure. Its
  // picture is laid out on 1024 units and painted at CROWN pixels, small enough that Canvas 2D's shaded-picture cache
  // keeps it whole beside the plaques.
  const CROWN = 768;
  const spelled = (rate) => {
    const e = Math.floor(Math.log10(rate)), lead = String(Math.round(rate / 10 ** (e - 2)));
    return (lead + "0".repeat(Math.max(0, e - 2))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };
  const paintCrown = (ctx, reader, now) => {
    const N = CROWN, u = N / 1024, cx = N / 2, v = reader.value("hashrate"), rate = v && v.current > 0 ? v.current : BAKED.rate;
    ctx.fillStyle = "#0a0b0f"; ctx.fillRect(0, 0, N, N);
    ctx.strokeStyle = C.amber; ctx.lineWidth = 8 * u; ctx.beginPath(); ctx.arc(cx, cx, 480 * u, 0, P.TAU); ctx.stroke();
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    P.pix(ctx, "THE NETWORK TODAY", cx, 320 * u, 40 * u, C.amberText);
    ctx.fillStyle = C.white; ctx.font = P.font(600, 130 * u, P.MONO);
    ctx.fillText(rate >= 1e21 ? `${(rate / 1e21).toFixed(2)} ZH/s` : `${Math.round(rate / 1e18)} EH/s`, cx, 470 * u);
    ctx.fillStyle = C.amberText; ctx.font = P.font(600, 34 * u, P.MONO);
    ctx.fillText(spelled(rate), cx, 560 * u);
    ctx.fillText(`hashes a second ≈ 2^${Math.round(Math.log2(rate))}`, cx, 610 * u);
    ctx.fillStyle = v ? "#4fd08a" : C.grey; ctx.font = P.font(600, 30 * u, P.MONO);
    ctx.fillText(v ? CH.freshness(reader.status("hashrate"), reader.at("hashrate"), now) : `${BAKED.when} · ${reader.status("hashrate")}`, cx, 690 * u);
  };

  const plan = (K, L) => {
    const e0 = ROOMS.edgeEl(L, 0) / P.DEG, lo = e0 + 6, hi = e0 + 42, elOf = (lg) => lo + (lg - 6) / 16 * (hi - lo);
    K.wallColor("#1c1d22");
    K.render({ sky: [0.52, 0.5, 0.48], ground: [0.22, 0.2, 0.18], ambientFloor: 0.42, bloomStrength: 0.55 });
    // The dome: the hashrate chart round the room, eras shaded, units over the door, years along its foot.
    K.dome((ctx, D) => {
      D.sky(ctx, [[90, "#0a0b0f"], [0, "#0e0f13"]]);
      const X = (yr) => D.x(azOf(yr)), base = D.y(lo);
      for (const [, a, b, color] of ERAS) { ctx.fillStyle = color; ctx.fillRect(X(a), D.y(hi + 4), X(b) - X(a), base - D.y(hi + 4)); }
      for (const [name, a, b] of ERAS) D.pixText(ctx, name, azOf((a + b) / 2), hi + 2, name === "ASIC" ? 1.3 : 0.8, "rgba(255,230,190,.9)");
      for (const [lg, unit] of UNITS) {
        ctx.fillStyle = "rgba(255,255,255,.1)"; ctx.fillRect(0, D.y(elOf(lg)) - 1, D.W, 2);
        for (const az of [180, -40, 60]) D.text(ctx, unit, az, elOf(lg) + 1.2, 0.69, "rgba(200,200,210,.75)", 600, D.MONO);
      }
      // The history from the chart's start to its end, filled down to its foot and traced in amber.
      const points = [[START, HISTORY[0][1]], ...HISTORY, [END, HISTORY[HISTORY.length - 1][1]]];
      const trace = () => { ctx.beginPath(); points.forEach(([yr, lg], i) => { const x = X(yr), y = D.y(elOf(lg)); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); };
      trace(); ctx.lineTo(X(END), base); ctx.lineTo(X(START), base); ctx.closePath(); ctx.fillStyle = "rgba(247,147,26,.08)"; ctx.fill();
      trace(); ctx.strokeStyle = C.amber; ctx.lineWidth = 5; ctx.lineJoin = "round"; ctx.stroke();
      for (let yr = START; yr <= 2026; yr++) {
        ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(X(yr) - 1, base, 2, 10);
        if (yr % 2) D.text(ctx, String(yr), azOf(yr), lo - 2.2, 0.74, C.grey, 600, D.MONO);
      }
      D.text(ctx, "about 5 MH/s", azOf(START) + 1, elOf(6.74) + 4.5, 0.92, C.white, 700, D.FONT, "left");
      D.text(ctx, "about 1 ZH/s · 2026", azOf(END) - 1, elOf(21.01) + 3.5, 1, C.amberText, 700, D.FONT, "right");
      D.text(ctx, "NETWORK HASHRATE · LOG SCALE · 14 ORDERS OF MAGNITUDE", 0, hi + 9, 0.85, C.white, 700);
      D.text(ctx, "five-week averages of mempool.space's daily estimates · approximate", 0, hi + 6.6, 0.45, C.grey, 500);
    });
    // The crown stands well inside the dome, so Canvas 2D's face sort keeps it in front of the dome's own faces.
    K.live({ cap: true, el0: hi + 13, inset: 0.97, w: CROWN, h: CROWN, tip: "The network's hashrate today",
      key: (f) => { const v = f.reader.value("hashrate"); return `${f.reader.status("hashrate")}|${v ? v.current : ""}|${f.reader.at("hashrate")}`; },
      paint: (ctx, f, now) => paintCrown(ctx, f.reader, now) });
    // The exhibits' ring: plinths `rx` out, the amber ring on the floor `ringR` out with a dot and the year at each.
    const rx = L.r0 - 3.4, ringR = rx - 1.9;
    K.floor((ctx, F) => {
      ctx.fillStyle = "#1f1c19"; ctx.fillRect(0, 0, F.N, F.N);
      ctx.strokeStyle = "#2c2824"; ctx.lineWidth = 3;
      for (let v = -1.2 * Math.ceil(F.rf / 1.2); v < F.rf; v += 1.2) {
        ctx.beginPath(); ctx.moveTo(F.X(v), 0); ctx.lineTo(F.X(v), F.N); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, F.Y(v)); ctx.lineTo(F.N, F.Y(v)); ctx.stroke();
      }
      ctx.strokeStyle = C.amber; ctx.lineWidth = 0.08 * F.s; ctx.beginPath(); ctx.arc(F.X(0), F.Y(0), ringR * F.s, 0, P.TAU); ctx.stroke();
      F.path(0, L.doorZ, 0, ringR + 0.1);
      MINERS.forEach((ex, i) => {
        const a = AZ[i] * P.DEG, sx = Math.sin(a), sz = -Math.cos(a);
        ctx.fillStyle = C.amber; ctx.beginPath(); ctx.arc(F.X(sx * ringR), F.Y(sz * ringR), 0.16 * F.s, 0, P.TAU); ctx.fill();
        // The year, reading from inside the ring toward its exhibit.
        ctx.save(); ctx.translate(F.X(sx * (ringR - 0.7)), F.Y(sz * (ringR - 0.7))); ctx.rotate(a);
        P.pix(ctx, String(Math.floor(ex.year)), 0, 0, 0.36 * F.s, C.amberText);
        ctx.restore();
      });
    });
    // The exhibits: plinth, model, the plaque on its post to the plinth's right as seen from the middle.
    const cards = plaques();
    MINERS.forEach((ex, i) => {
      const a = AZ[i] * P.DEG, x = rx * Math.sin(a), z = -rx * Math.cos(a), g = K.group(x, 0, z, headingTo(x, z, 0, 0));
      const target = { kind: "exhibit", tip: `${Math.floor(ex.year)} · ${ex.name} · tap for its plaque`, radius: 0.95, index: i };
      g.node(null, plinth(), 0, 0, 0, { target });
      const parts = model(g, ex.model, 1, TOP + 0.005);
      if (parts.screen) { const p = parts.screen; g.picture(p.w, p.h, 320, 240, paintCrt, p.x, p.y, p.z, { ry: Math.PI, depthBias: -0.05 }); }
      if (parts.label) { const p = parts.label; g.picture(p.w, p.h, 256, Math.round(256 * p.h / p.w), paintLabel(p.text), 0, p.y, 0, { ry: Math.PI, rx: -Math.PI / 2, depthBias: -0.05 }); }
      g.box(0.08, 0.88, 0.08, C.post, -1.25, 0.44, -0.25);
      g.node(null, cards[i], -1.25, 0.98, -0.3, { ry: Math.PI, rx: -0.55, glow: true, target });
      g.solid({ x: -0.57, z: -0.05, hx: 1.2, hz: 0.66 });
    });
    // The middle: a round plinth with an amber ring, its sign toward the doors, and a big S21 turning on it.
    K.cyl(1.2, 1.3, TOP, C.stone, 0, TOP / 2, 0, { seg: 48 });
    K.torus(1.2, 0.03, C.amber, 0, TOP, 0, { emissive: 1, glow: true, seg: 64 });
    K.picture(1.6, 0.5, 1000, 310, paintSign, 0, 0.55, 1.29, { rx: -0.1, target: { kind: "sign", tip: "One S21 against the 2012 network", radius: 0.9, data: { say: "One S21 (200 TH/s) outhashes the whole 2012 network (~16 TH/s) about 13 times over" } } });
    let big = null;
    K.node("turntable", (k) => { big = model(k, "s21", BIG, 0); }, 0, TOP + 0.005, 0, { target: { kind: "exhibit", tip: "Antminer S21 · tap for the plaques", radius: 1.2, index: 8 } });
    K.picture(big.label.w, big.label.h, 384, Math.round(384 * big.label.h / big.label.w), paintLabel(big.label.text), 0, big.label.y, 0, { parent: "turntable", ry: Math.PI, rx: -Math.PI / 2, depthBias: -0.05 });
    K.solid({ x: 0, z: 0, r: 1.38 });
    // Two benches either side of the middle, facing the turning S21, each seating two.
    for (const side of [-1, 1]) {
      const b = K.group(side * 4.5, 0, 0, -side * Math.PI / 2);
      const seats = [-0.55, 0.55].map((x) => b.seat(x, 0, 0, 0.46, 0, 1.3));
      b.node(null, (k) => {
        k.box(2, 0.08, 0.5, "#4a3a2c", 0, 0.42, 0);
        for (const x of [-0.85, 0.85]) k.box(0.1, 0.38, 0.42, "#2a2420", x, 0.19, 0);
        k.box(1.9, 0.02, 0.03, C.amber, 0, 0.36, 0.26, { emissive: 0.7 });
      }, 0, 0, 0, { target: { kind: "chair", tip: "Bench", radius: 1, index: seats[0].index } });
      b.solid({ x: 0, z: 0, hx: 1.05, hz: 0.3 });
    }
    // Point lights: the turntable's spot, the exhibits round the ring, the dome's wash.
    K.light(0, 5.5, 0, 14, 1, 0.94, 0.86);
    for (const az of [-150, -102, -30, 36, 108, 146]) K.light(9.2 * Math.sin(az * P.DEG), 3.8, -9.2 * Math.cos(az * P.DEG), 8, 0.78, 0.7, 0.6);
    K.light(0, 9, -5, 22, 0.5, 0.46, 0.42);
  };

  // What moves: the big S21 turning; a tap on an exhibit opens the plaques as a board, paged in date order.
  const animate = (nodes) => {
    const turntable = nodes.turntable;
    let index = 0, version = 0, canvas = null;
    const board = {
      title: "Mining Museum", help: "From Satoshi's CPU to today's ASICs, in date order. Arrow keys walk the exhibits.",
      get canvas() { return canvas; }, get count() { return MINERS.length; }, get index() { return index; },
      get caption() { return MINERS[index].name; }, get note() { return "Models 1.6 times life size; stats approximate."; }, get version() { return version; },
      go: (i) => {
        index = i;
        canvas = canvas || CH.canvas(PLAQUE.w * 2, PLAQUE.h * 2);
        paintPlaque(canvas.getContext("2d"), MINERS[index], 2);
        version++;
      }
    };
    return {
      update(dt) { turntable.rotation.y += dt * 0.35; },
      tap(owner, hud) {
        if (owner.kind !== "exhibit") return false;
        board.go(owner.index);
        hud.openBoard(board);
        return true;
      }
    };
  };
  BL.timechainRoomKinds.mining = { plan, animate };
})();
