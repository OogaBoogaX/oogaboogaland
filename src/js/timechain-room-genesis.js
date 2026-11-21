// The Genesis Museum, Room 8 of the Timechain Sphere: the technologies and events of the thirty-four years before
// the genesis block, from the first packet-switching protocol to the last centralised e-money, in date order round a
// ring of plinths with its gap at the door, so the walk runs from 1974 at the door's left round the room to 2008 at
// its right. Each stands on a plinth with its plaque in the Mining Museum's dress (concrete, an amber band, the plaque
// on its front), every piece open to walk round; a tap, or Space in front of one, opens it in the model viewer
// beside its account, facts and sources. In the middle, under the main spot, the whitepaper on its lectern facing the
// door and the genesis block behind it, open on their drum. The dome is the timeline: one lit band bent round
// the room over the plinths' walk, every event a branch off it over its own plinth with its date and title on a chip
// at the branch's end, the decades named along the band, and at 2008 the band turns up the dome to the crown, where
// the paper and the block stand under the room's own mark. Every date says what it marks and every plaque says how its
// piece connects: cited in the whitepaper, named by Satoshi, or context. The words are the room's own; the models
// (timechain-genesis-models.js) are original designs of real kinds of artefact.
(() => {
  "use strict";
  const BL = window.BL;
  const RM = BL.timechainRoomModels, CH = BL.timechainCharts, ROOMS = BL.timechainRooms, P = RM.paintKit, GM = BL.timechainGenesisModels, GF = BL.timechainGenesisFirst;
  const { box, noShadow } = BL.models;
  const { own } = RM.helpers;
  const C = {
    amber: "#f7931a", amberText: "#ffb04d", glow: "#ffc93c", glowText: "#ffd66b", white: "#f4efe6", grey: "#a89c8b", ink: "#14110e",
    steel: "#34373d", steelDark: "#26282d", concrete: "#4a4c51", floor: "#1b1a18", ceiling: "#0b0c12", glass: "#cfe6ea",
    cite: "#ffc93c", named: "#f7931a", context: "#8c8f94", red: "#e04a3c", btc: "#f7931a", btcGlow: "#ffb347"
  };
  const DEG = P.DEG, TAU = P.TAU, HALF_PI = Math.PI / 2;
  // The room's own palette, Abyss Aurora: graphite and deep indigo stone, a soft teal-blue for every highlight,
  // the aurora's green and violet under the glass and as accents on the portal and the marks of what Satoshi named,
  // cream words, and in the room itself Bitcoin orange (`C.btc`) kept for the centre, the ₿, the genesis burst, the
  // falling block and the chain. The pieces on the plinths carry their own colours (chrome, warm orange against cool
  // blue) and take the room's teal for their label strips alone. Applied to the room's and the models' colour tables
  // before anything is built.
  const PALETTE = { room: { amber: "#3db8cc", amberText: "#9be4ef", glow: "#62cfe0", glowText: "#b5eef5", white: "#efe6d2", grey: "#9aa3ad", concrete: "#22252c", steel: "#262a48", steelDark: "#171a33", floor: "#0b0c16", ceiling: "#06061a", glass: "#5f7f8c", cite: "#62cfe0", named: "#b7a2f5", context: "#8a94a0" },
    models: { amberText: "#9be4ef", amber: "#3db8cc" },
    // The first versions (timechain-genesis-first.js) in the colours they were first shown in: the room's teal for
    // their lights and label strips, its navy for their steel, Bitcoin orange kept.
    first: { amberText: "#9be4ef", glowText: "#b5eef5", amber: "#3db8cc", glow: "#62cfe0", white: "#efe6d2", steel: "#262a48", steelDark: "#171a33", led: "#62cfe0", phosphor: "#74d3a4", btc: "#f7931a" }, pit: "#08091e", atom: "#8dffb6", chainDim: "#2a2f5a", glass: 0.03, accent2: "#9b7cf0" };
  Object.assign(C, PALETTE.room);
  if (GM && GM.C) Object.assign(GM.C, PALETTE.models);
  if (GF && GF.C) Object.assign(GF.C, PALETTE.first);

  // ---------- the Proof-of-Knowledge portal ----------
  // A sealed stone door in the wall on the walk's 2008 side, unseen until a visitor comes near: then its carving comes
  // out of the dark as thin glowing line art (a tall round arch, an inscription band, a Merkle tree whose branches are
  // the door's cracks, a ₿ keystone), in the room's own accent while it is locked and in Bitcoin orange when it opens.
  // Five riddles drawn from the pool, each solved at the right plinth, fill five fields of a block header; the nonce
  // is mined on a dial; then the cracks blaze, the leaves part and the Sphere's own entry into the Mining Museum plays.
  // Per viewer (localStorage), no network or server part; the keypad to the Mining Museum is untouched. The design is the room's
  // own: no script, emblem, outline or words from any film or book.
  const PORTAL = { az: 160, w: 2.5, h: 3.55, reveal: 2.5, prompt: 2.5, zeros: 2, open: 1.6 };
  const PORTAL_KEY = "ooga-genesis-portal", PORTAL_RUN = 5;
  // The riddle pool: each is a riddle with one answer, a plinth (by its id); `hint` is the plain clue a wrong plinth
  // earns, `decade` the one after it. The facts are the exhibits' own.
  const RIDDLES = [
    { id: "dh", q: "We met in a crowd and never whispered,\nyet left with a secret the crowd never heard.\nMix your colour with mine, and mine with yours:\nwhat are we?", hint: "a key exchange, published in 1976", decade: "the 1970s" },
    { id: "rsa", q: "I am a lock that anyone may snap shut,\nbut only one key was ever cut.\nTwo hidden primes are all my art:\neasy to multiply, never pulled apart.", hint: "three initials, 1977", decade: "the 1970s" },
    { id: "tcpip", q: "Tear the letter into scraps and send each by its own road;\nat the far end they queue up and the letter is whole.\nNo wire is mine alone.\nWhat stood at every site and passed the scraps along?", hint: "the switch at every ARPANET site", decade: "the 1970s" },
    { id: "merkle", q: "Many leaves, one root to show;\nprove one leaf without the whole.\nI grow downward from a single name.", hint: "a tree made of hashes", decade: "the 1980s" },
    { id: "byzantine", q: "We ring the city, each in his tent,\nand some among us are not what they seem.\nStrike together or fall apart:\nhow do the loyal agree?", hint: "a problem named for an empire's generals, 1982", decade: "the 1980s" },
    { id: "chaum", q: "I put my name to what I never read.\nThrough a sealed envelope my mark went in,\nand when the coin came out\nI could not say whose it had been.", hint: "a signature made blind, 1982", decade: "the 1980s" },
    { id: "timestamp", q: "Each of us carries the fingerprint of the one before;\nchange one, and every later one cries foul.\nOnce a week our newest print ran in the paper\nfor all to see.", hint: "certificates linked in a chain, 1991", decade: "the 1990s" },
    { id: "pgp", q: "I made privacy pretty good and gave it away.\nI crossed borders on floppy disks,\nand for that my maker was investigated\nas an exporter of arms.", hint: "three letters, June 1991", decade: "the 1990s" },
    { id: "hashcash", q: "I am a stamp no post office sells.\nYou pay for me in heat, not coin:\na moment's work for one letter,\na furnace for a flood.", hint: "proof of work against spam, 1997", decade: "the 1990s" },
    { id: "egold", q: "I never left the vault,\nyet I crossed the world by the gram.\nMillions held me with a click,\nuntil the courts came for my keepers.", hint: "gold spent online, from 1996", decade: "the 1990s" },
    { id: "p2p", q: "No one holds all of me,\nyet together you hold me whole.\nGive a piece to get a piece;\ncut off any head and I am still there.", hint: "a swarm with no server, 2001", decade: "the 2000s" },
    { id: "rpow", q: "Spend me once and I am gone,\nyet a sealed machine mints my twin for the next hand.\nMy keeper received the first bitcoin ever sent.", hint: "proofs of work made reusable, 2004", decade: "the 2000s" },
    { id: "bitgold", q: "Solve me, and my answer is the next one's question.\nStamp the time, record the owner, begin again.\nI was a chain of gold that was never minted.", hint: "Szabo's proposal, published in 2005", decade: "the 2000s" }
  ];
  // The header the fragments fill: the genesis block's own fields, in the order a header holds them; the nonce is the
  // visitor's to find (on this door, two leading zero digits of a SHA-256; the real chain asks for about nineteen).
  const HEADER = [["VERSION", "1"], ["PREV HASH", "0000000000000000000000000000000000000000000000000000000000000000"], ["MERKLE ROOT", "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b"], ["TIME", "1231006505 · 3 Jan 2009 18:15:05 UTC"], ["BITS", "1d00ffff"]];
  const portalStore = {
    read() { try { const v = JSON.parse(localStorage.getItem(PORTAL_KEY) || "null"); return v && typeof v === "object" ? v : {}; } catch { return {}; } },
    write(v) { try { localStorage.setItem(PORTAL_KEY, JSON.stringify(v)); } catch { /* private mode: the run is not remembered */ } }
  };
  const CAN_HASH = !!(window.crypto && crypto.subtle);
  const sha256hex = async (text) => {
    if (!CAN_HASH) throw new Error("SHA-256 needs the Web Crypto API (a secure page)");
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
  };
  // The portal's sound, synthesized here (no samples, nothing to credit): a low resonance as the carving lights, a soft
  // two-note chime at a right plinth, a tone that rises as the dial nears the block, and a stone shift with a rush of
  // air as the leaves part; and, as the carving is first discovered, a slow chord of soft bells over a breath of air.
  // Behind the page's mute (BL.sound.output), opened when the carving first lights for a visitor (who has walked here,
  // so the page has had its gesture) or on Begin, modest
  // levels throughout, and never in a test or a render (?nosim=1).
  const portalAudio = (() => {
    const SILENT = (new URLSearchParams(location.search)).has("nosim");
    let ctx = null, out = null, humGain = null, tone = null, toneGain = null, revealedAt = -100;
    const open = () => {
      if (ctx || SILENT || BL.sound.muted || typeof AudioContext === "undefined" || navigator.userActivation && !navigator.userActivation.hasBeenActive) return !!ctx;
      try { ctx = new AudioContext(); } catch { return false; }
      out = BL.sound.output(ctx);
      humGain = ctx.createGain(); humGain.gain.value = 0; humGain.connect(out);
      [55, 82.5, 110.5].forEach((f, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.value = f; g.gain.value = i ? 0.35 : 1; o.connect(g); g.connect(humGain); o.start(); });
      toneGain = ctx.createGain(); toneGain.gain.value = 0; toneGain.connect(out);
      tone = ctx.createOscillator(); tone.type = "triangle"; tone.frequency.value = 220; tone.connect(toneGain); tone.start();
      return true;
    };
    const blip = (f, t0, peak, a, d) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.value = f; o.connect(g); g.connect(out); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); o.start(t0); o.stop(t0 + a + d + 0.05); };
    return {
      open,
      hum(level) { if (ctx) humGain.gain.setTargetAtTime(0.045 * level, ctx.currentTime, 0.25); },
      chime() { if (!ctx) return; const t = ctx.currentTime; blip(880, t, 0.07, 0.01, 0.6); blip(1318.5, t + 0.12, 0.06, 0.01, 0.7); },
      // The discovery: five soft bells a fifth and an octave apart, each with a twin a hair sharp so the chord shimmers,
      // over a breath of filtered air that opens and closes; once, then not again for a while.
      reveal() {
        if (!ctx) return;
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        const t = ctx.currentTime;
        if (t - revealedAt < 12) return;
        revealedAt = t;
        [293.66, 440, 587.33, 739.99, 880].forEach((f, i) => { blip(f, t + i * 0.11, 0.035, 0.05, 2.2); blip(f * 1.004, t + i * 0.11 + 0.02, 0.02, 0.06, 2.4); });
        blip(1760, t + 0.6, 0.012, 0.08, 1.8);
        const N = Math.floor(ctx.sampleRate * 1.8), buf = ctx.createBuffer(1, N, ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < N; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
        src.buffer = buf; bp.type = "bandpass"; bp.Q.value = 1.2; bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(3200, t + 1.1); bp.frequency.exponentialRampToValueAtTime(900, t + 1.8);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
        src.connect(bp); bp.connect(g); g.connect(out); src.start(t); src.stop(t + 1.85);
      },
      found() { if (!ctx) return; const t = ctx.currentTime; [659.3, 880, 1318.5].forEach((f, i) => blip(f, t + i * 0.1, 0.07, 0.01, 0.9)); },
      dial(on, k) { if (!ctx) return; toneGain.gain.setTargetAtTime(on ? 0.025 : 0, ctx.currentTime, 0.08); tone.frequency.setTargetAtTime(196 * Math.pow(2, 1.6 * k), ctx.currentTime, 0.08); },
      opening() {
        if (!ctx) return;
        const t = ctx.currentTime, N = Math.floor(ctx.sampleRate * 2.2), buf = ctx.createBuffer(1, N, ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < N; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / N);
        const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
        src.buffer = buf; lp.type = "lowpass"; lp.frequency.setValueAtTime(180, t); lp.frequency.exponentialRampToValueAtTime(2400, t + 0.9); lp.frequency.exponentialRampToValueAtTime(240, t + 2.2);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
        src.connect(lp); lp.connect(g); g.connect(out); src.start(t); src.stop(t + 2.3);
        const sub = ctx.createOscillator(), sg = ctx.createGain(); sub.type = "sine"; sub.frequency.setValueAtTime(48, t); sub.frequency.exponentialRampToValueAtTime(30, t + 1.4); sub.connect(sg); sg.connect(out);
        sg.gain.setValueAtTime(0.0001, t); sg.gain.exponentialRampToValueAtTime(0.1, t + 0.05); sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.6); sub.start(t); sub.stop(t + 1.7);
      },
      close() { if (ctx) ctx.close().catch(() => {}); ctx = null; }
    };
  })();
  // The door's place: on the wall at PORTAL.az. Nothing of it is built: it is light drawn on the wall itself, dots of
  // glow set on the sphere's own surface (so they follow its curve), the inscription in the room's letters, the ₿ in
  // small blocks, and three rings of orange light where it opens. Door coordinates: u across the wall in metres of
  // arc, v up from the floor.
  const portalSpot = (L, back = 0.15) => { const r = ROOMS.radiusAt(L, 0) - back, a = PORTAL.az * DEG; return { x: r * Math.sin(a), z: -r * Math.cos(a), a, r }; };
  const portalFoot = (L) => portalSpot(L, 0.9);
  const onWall = (L, u, v, inset = 0.06) => { const r = ROOMS.radiusAt(L, v) - inset, a = PORTAL.az * DEG + u / r; return { x: r * Math.sin(a), y: v, z: -r * Math.cos(a) }; };
  const PORTAL_DOTS = [], PORTAL_HALOS = [];
  // The ₿ mark's cells (the medallion's rows) at a cell size, as [x, y] offsets about the mark's middle.
  const bCells = (cell) => { const out = []; SYMBOL.forEach((row, ri) => [...row].forEach((ch, ci) => { if (ch === "#") out.push([(ci - (row.length - 1) / 2) * cell, -(ri - (SYMBOL.length - 1) / 2) * cell]); })); return out; };
  const portalPlan = (K, L) => {
    const W = PORTAL.w, H = PORTAL.h, R = W / 2, yArc = H - R, STEP = 0.03;
    // The dots: one small block of glow in the accent, one in the scheme's second colour (the cracks), one in orange
    // for the open door; the animate swaps them in.
    const dotG = { accent: own(() => noShadow(box({ w: 0.036, h: 0.036, d: 0.02, color: C.amber, emissive: 1 }))), violet: own(() => noShadow(box({ w: 0.036, h: 0.036, d: 0.02, color: PALETTE.accent2 || C.glow, emissive: 1 }))), orange: own(() => noShadow(box({ w: 0.042, h: 0.042, d: 0.022, color: C.btc, emissive: 1 }))) };
    let n = 0;
    const dot = (kind, u, v, t, tone) => { const q = onWall(L, u, v), name = `portalDot${n++}`; K.node(name, dotG[tone](), q.x, q.y, q.z, { ry: Math.PI - (PORTAL.az * DEG + u / ROOMS.radiusAt(L, v)) }); PORTAL_DOTS.push({ name, kind, t, tone }); };
    // A polyline sampled every STEP, its dots given their moment in the draw from t0 to t1 in order.
    const trace = (kind, pts, t0, t1, tone = "accent") => {
      let len = 0; const seg = [];
      for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); len += d; }
      const count = Math.max(2, Math.round(len / STEP));
      let i = 1, acc = 0;
      for (let k = 0; k <= count; k++) { const sAt = len * k / count; while (i < pts.length - 1 && acc + seg[i - 1] < sAt) { acc += seg[i - 1]; i++; } const f = seg[i - 1] ? (sAt - acc) / seg[i - 1] : 0; dot(kind, pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f, t0 + (t1 - t0) * k / count, tone); }
    };
    const arc = (rr, m = 14) => Array.from({ length: m + 1 }, (_, i) => { const a = Math.PI * i / m; return [-rr * Math.cos(a), yArc + rr * Math.sin(a)]; });
    // The outline first (the draw's first 45 %), up the left jamb, over the head and down the right; the inner head
    // arc after it in the second colour.
    trace("arch", [[-R - 0.03, 0.08], [-R - 0.03, yArc], ...arc(R + 0.03).slice(1), [R + 0.03, 0.08]], 0, 0.45);
    trace("arch", arc(R - 0.16), 0.45, 0.55, "violet");
    // The inscription, two lit lines in the room's letters (large enough to stay crisp through the glow), in at 0.58;
    // then the trunk (0.6 to 0.68).
    const lines = ["PROOF OF KNOWLEDGE", "MINING MUSEUM"], wpx = Math.min(0.0185, (W - 0.52) / widthOfText(lines[0], 1)), bandV = 0.6, lead = wpx * 11, bp = onWall(L, 0, bandV, 0.07);
    // Each line stands upright at the wall's own distance at its height (the wall leans in toward the floor), so
    // neither sinks into it: the node's +z runs out to the wall.
    const out = (v) => ROOMS.radiusAt(L, v) - ROOMS.radiusAt(L, bandV);
    const bandOf = (color) => own(() => BL.models.merge(BL.models.moved(RM.helpers.litWord(lines[0], wpx, color, 0.85), 0, lead / 2, out(bandV + lead / 2)), BL.models.moved(RM.helpers.litWord(lines[1], wpx, color, 0.85), 0, -lead / 2, out(bandV - lead / 2 - wpx * 3.5))));
    const band = { accent: bandOf(C.amber), orange: bandOf(C.btc) };
    lines.forEach((t) => fitRec("portal", `inscription · ${t}`, W - 0.32, widthOfText(t, wpx)));
    K.node("portalBand", band.accent(), bp.x, bp.y, bp.z, { ry: Math.PI - PORTAL.az * DEG });
    const rr = P.rng(2009), jit = (k) => (rr() - 0.5) * k;
    const jag = ([x0, y0], [x1, y1], m) => { const pts = [[x0, y0]]; for (let i = 1; i < m; i++) { const t = i / m; pts.push([x0 + (x1 - x0) * t + jit(0.14), y0 + (y1 - y0) * t + jit(0.08)]); } pts.push([x1, y1]); return pts; };
    trace("trunk", jag([0, 0.9], [0, 1.72], 3), 0.6, 0.68, "violet");
    // Five cracks fanning to the head, grown together (0.68 to 0.9), two twigs each; the middle one ends under the keystone.
    const ends = [[-1.02, 2.5], [-0.62, 2.98], [0, 2.58], [0.62, 2.98], [1.02, 2.5]];
    ends.forEach((e, k) => { const pts = jag([0, 1.72], e, 6); trace(`crack${k}`, pts, 0.68, 0.9, "violet"); for (const j of [2, 4]) { const [px, py] = pts[j], a = Math.atan2(e[1] - 1.72, e[0]) + (j === 2 ? 0.9 : -0.9); trace(`crack${k}`, [[px, py], [px + Math.cos(a) * 0.22, py + Math.sin(a) * 0.22]], 0.72 + j * 0.03, 0.9, "violet"); } });
    // The keystone last (0.9 to 1): the ₿ in 47 small blocks.
    { const cellsB = bCells(0.042); cellsB.forEach(([x, y], i) => dot("b", x, 3.0 + y, 0.88 + 0.08 * i / (cellsB.length - 1), "accent")); }
    // Where it opens: three rings of orange light on the wall inside the outline, unseen until then.
    const swirlRing = (r0, r1) => own(() => { const geo = RM.helpers.blank(), m = 28; for (let k = 0; k < m; k++) { if (k % 7 === 6) continue; const a = TAU * k / m, b = TAU * (k + 1) / m; RM.helpers.face(geo, [[r0 * Math.cos(a), r0 * Math.sin(a), 0], [r1 * Math.cos(a), r1 * Math.sin(a), 0], [r1 * Math.cos(b), r1 * Math.sin(b), 0], [r0 * Math.cos(b), r0 * Math.sin(b), 0]], C.btc, 1, [0, 0, 1]); } return noShadow(geo); });
    [[0.22, 0.34], [0.5, 0.6], [0.8, 0.88]].forEach(([r0, r1], i) => { const q = onWall(L, 0, 1.55, 0.1); K.node(`portalSwirl${i}`, swirlRing(r0, r1)(), q.x, q.y, q.z, { ry: -PORTAL.az * DEG, glow: true, scale: 0.001 }); });
    { const q = onWall(L, 0, 1.3, 0.4); K.node(null, null, q.x, q.y, q.z, { target: { kind: "genesis-portal", tip: "The wall · Space to test your knowledge", radius: 1.6 } }); }
    // Light with no edge behind the drawing (the renderer's additive pictures): a halo every 0.3 m of the outline,
    // one behind the keystone and one where the cracks spring; a pool on the floor before the door and a wash on the
    // bench to either side. Unseen until the carving shows; orange when it opens.
    const haloG = { accent: softDot(PALETTE.atom, 0.62, 0.12, 0.26, 0.8), orange: softDot(C.btc, 0.7, 0.12, 0.4, 0.9) }, poolG = { accent: softDot(C.amber, 4.2, 0.1, 0.26, 0.8), orange: softDot(C.btc, 4.6, 0.1, 0.34, 0.9) };
    const halo = (u, v, t, k = 1) => { const q = onWall(L, u, v, 0.03), name = `portalHalo${PORTAL_HALOS.length}`; K.node(name, haloG.accent(), q.x, q.y, q.z, { ry: -(PORTAL.az * DEG + u / ROOMS.radiusAt(L, v)), glow: true, scale: 0.001 }); PORTAL_HALOS.push({ name, t, k }); };
    { const pts = [[-R - 0.03, 0.2], [-R - 0.03, yArc], ...arc(R + 0.03).slice(1), [R + 0.03, 0.2]]; let len = 0; const seg = []; for (let i = 1; i < pts.length; i++) { seg.push(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); len += seg[i - 1]; }
      const count = Math.round(len / 0.3); let i = 1, acc = 0;
      for (let k = 0; k <= count; k++) { const sAt = len * k / count; while (i < pts.length - 1 && acc + seg[i - 1] < sAt) { acc += seg[i - 1]; i++; } const f = seg[i - 1] ? (sAt - acc) / seg[i - 1] : 0; halo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f, 0.45 * k / count); } }
    halo(0, 1.72, 0.68, 1.4); halo(0, 3.0, 0.9, 1.8);
    { const f = portalFoot(L); K.node("portalPool0", poolG.accent(), f.x, 0.03, f.z, { rx: -HALF_PI, glow: true, scale: 0.001 }); PORTAL_HALOS.pools = [{ name: "portalPool0", k: 1 }];
      for (const u of [-1.9, 1.9]) { const q = onWall(L, u, 0.5, 0.45), name = `portalPool${PORTAL_HALOS.pools.length}`; K.node(name, poolG.accent(), q.x, 0.5, q.z, { rx: -HALF_PI, glow: true, scale: 0.001 }); PORTAL_HALOS.pools.push({ name, k: 0.32 }); } }
    BL.timechainGenesis.portalSpot = portalSpot(L);
    PORTAL_DOTS.swap = { dotG, band, haloG, poolG };
  };
  // The portal's life in the room: the carving's reveal, the riddles, the header, the dial, the opening, the hand-over.
  const portalAnimate = (nodes, built, ctx) => {
    const L = built.layout, s = portalSpot(L);
    const dots = PORTAL_DOTS.map((d) => ({ ...d, node: nodes[d.name], crack: d.kind.startsWith("crack") ? Number(d.kind.slice(5)) : -1 })).filter((d) => d.node), G = PORTAL_DOTS.swap, band = nodes.portalBand, swirl = [0, 1, 2].map((i) => nodes[`portalSwirl${i}`]), ledge = nodes.ledgePortal, halos = PORTAL_HALOS.map((h) => ({ ...h, node: nodes[h.name] })).filter((h) => h.node), pools = (PORTAL_HALOS.pools || []).map((h) => ({ ...h, node: nodes[h.name] })).filter((h) => h.node);
    const saved = portalStore.read();
    const st = { phase: "idle", riddles: [], current: 0, fragments: 0, wrong: 0, hint: "", nonce0: 0, need: 0, pos: 0, spin: 0, hash: "", finalHash: "", reveal: 0, draw: 0, pfx: 0, pfz: 1, away: false, solved: false, badge: typeof saved.badge === "string" && saved.badge.length <= 80 ? saved.badge : "", openK: 0, t: 0, swapped: false, seq: 0 };
    const plinthOf = (id) => PLINTHS.findIndex((p) => p.id === id);
    const pool = RIDDLES.filter((r) => plinthOf(r.id) >= 0);
    // Only the badge is kept from one visit to the next, as a record: the door is blank wall and locked again for
    // whoever comes back, by any way out and in.
    const remember = () => portalStore.write({ badge: st.badge });
    // ---- the panel (DOM): the prompt, the riddle, the header, the dial, the open door's line ----
    let panel = null, body = null, held = 0;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    // The panel is the HUD's (`hud.genesis`): the room fills its body and listens there for as long as the visit lasts.
    const ensurePanel = () => {
      if (panel) return;
      panel = ctx.hud.genesis.portal; body = ctx.hud.genesis.body;
      const listen = { signal: ctx.gone.signal };
      panel.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-gp]"); if (!b) return; const k = b.dataset.gp; if (k === "begin") begin(); else if (k === "reroll") reroll(); else if (k === "push") push(); }, listen);
      panel.addEventListener("pointerdown", (e) => { const b = e.target.closest && e.target.closest("[data-gp='push']"); if (!b) return; e.preventDefault(); held = 1; }, listen);
      for (const ev of ["pointerup", "pointercancel", "pointerleave"]) panel.addEventListener(ev, () => { held = 0; }, listen);
    };
    const show = (on) => { ensurePanel(); ctx.hud.showGenesisPortal(on); }, shown = () => !!panel && !panel.hidden;
    const headerTable = () => {
      const t = el("table", "gp-header");
      HEADER.forEach(([k, v], i) => { const tr = el("tr", i < st.fragments ? "gp-mined" : "gp-dim"); tr.append(el("th", null, k), el("td", null, i < st.fragments ? v : "· · · · · ·")); t.append(tr); });
      const tr = el("tr", st.phase === "mine" || st.phase === "found" || st.phase === "opening" || st.phase === "open" ? "gp-live" : "gp-dim"); tr.append(el("th", null, "NONCE"), el("td", "gp-nonce", st.phase === "idle" || st.phase === "riddles" ? "yours to find" : String(st.nonce0 + Math.min(st.need, Math.floor(st.pos))))); t.append(tr);
      return t;
    };
    const render = () => {
      ensurePanel();
      body.replaceChildren();
      if (st.phase === "idle") {
        body.append(el("h3", null, "TEST YOUR KNOWLEDGE"), el("p", null, "Proof of work required to enter. Five riddles, each answered at the right plinth, fill a block header; then mine its nonce and the door opens on the Mining Museum."));
        if (st.badge) body.append(el("p", "gp-badge", st.badge));
        if (CAN_HASH) { const b = el("button", "gp-btn", "BEGIN"); b.type = "button"; b.dataset.gp = "begin"; body.append(b); }
        else body.append(el("p", "gp-how", "Mining the block needs a secure page (https), so the door stays shut here."));
      } else if (st.phase === "riddles") {
        const r = pool[st.riddles[st.current]];
        body.append(el("div", "gp-prog", `RIDDLE ${st.current + 1} OF ${PORTAL_RUN} · ${st.fragments} FRAGMENT${st.fragments === 1 ? "" : "S"} MINED`), el("p", "gp-q", r.q), el("p", "gp-how", "Find the plinth that answers it and press LOOK there, or tap the piece."));
        if (st.hint) body.append(el("p", "gp-hint", st.hint));
        body.append(headerTable());
      } else if (st.phase === "mine") {
        body.append(el("div", "gp-prog", "HEADER COMPLETE · MINE THE BLOCK"), headerTable());
        const dial = el("div", "gp-dial"); dial.append(el("div", "gp-hash", st.hash || "…"), el("div", "gp-zeros", `leading zeros ${leading(st.hash)} · needs ${PORTAL.zeros}`));
        const b = el("button", "gp-btn gp-push", "HOLD TO MINE"); b.type = "button"; b.dataset.gp = "push"; dial.append(b);
        body.append(dial, el("p", "gp-how", `Hold Space at the door, or hold the button: each turn of the nonce is hashed again until the hash starts with ${PORTAL.zeros} zeros. A real block today needs about nineteen.`));
      } else if (st.phase === "found" || st.phase === "opening") {
        body.append(el("div", "gp-prog", "BLOCK FOUND"), headerTable(), el("div", "gp-hash gp-found", st.finalHash), el("p", null, "Proof of work done. The door is opening."));
      } else if (st.phase === "open") {
        body.append(el("div", "gp-prog", "PROOF OF KNOWLEDGE"), el("p", null, "The way to the Mining Museum is open. Step up to the door and press ENTER to go through. It closes behind you: the door is blank wall again on your next visit."));
        if (st.badge) body.append(el("p", "gp-badge", st.badge));
        const b = el("button", "gp-btn gp-quiet", "RE-ROLL THE RIDDLES"); b.type = "button"; b.dataset.gp = "reroll"; body.append(b);
      }
    };
    const leading = (h) => { let n = 0; while (n < h.length && h[n] === "0") n++; return n; };
    const headerText = (nonce) => `${HEADER.map(([, v]) => v.split(" ")[0]).join("|")}|${nonce}`;
    // ---- the run ----
    const deal = () => { const idx = pool.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } return idx.slice(0, PORTAL_RUN); };
    const begin = () => { if (st.phase !== "idle" || !CAN_HASH) return; portalAudio.open(); st.phase = "riddles"; st.riddles = deal(); st.current = 0; st.fragments = 0; st.wrong = 0; st.hint = ""; render(); show(true); };
    const reroll = () => { st.solved = false; st.openK = 0; st.swapped = false; for (const d of dots) d.node.geometry = G.dotG[d.tone](); for (const h of halos) h.node.geometry = G.haloG.accent(); for (const h of pools) h.node.geometry = G.poolG.accent(); if (band) band.geometry = G.band.accent(); st.phase = "idle"; remember(); begin(); };
    let scanning = false, disposed = false;
    const prepareMine = async () => {
      scanning = true;
      st.nonce0 = Math.floor(Math.random() * 0xffffffff); st.need = 0; st.pos = 0; st.spin = 0; st.hash = "";
      // The first winning nonce at least 200 on from the start (an earlier one moves the start past it), so the dial
      // always turns for about a quarter of a minute.
      st.finalHash = "";
      for (let n = 0; n < 6000; n++) { const h = await sha256hex(headerText(st.nonce0 + n)); if (disposed) return; if (leading(h) < PORTAL.zeros) continue; if (n < 200) { st.nonce0 += n + 1; n = -1; continue; } st.need = n; st.finalHash = h; break; }
      if (!st.finalHash) { st.need = 5999; st.finalHash = await sha256hex(headerText(st.nonce0 + st.need)); if (disposed) return; }
      scanning = false;
      st.hash = await sha256hex(headerText(st.nonce0));
      if (disposed) return;
      render();
    };
    const hit = (plinthIndex) => {
      if (st.phase !== "riddles" || plinthIndex < 0) return false;
      const r = pool[st.riddles[st.current]], p = PLINTHS[plinthIndex];
      if (p && p.id === r.id) {
        st.fragments++; st.current++; st.hint = ""; st.wrong = 0; portalAudio.chime();
        if (ctx.focus[plinthIndex]) ctx.focus[plinthIndex].boost = 3;
        if (st.fragments >= PORTAL_RUN) { st.phase = "mine"; prepareMine(); }
        render(); show(true);
        return true;
      }
      st.wrong++;
      // A wrong plinth costs nothing: the first earns the riddle's plain hint, the second its decade, the third how
      // the room marks the piece.
      st.hint = `Not this one. A hint: ${r.hint}.${st.wrong > 1 ? ` It is from ${r.decade}.` : ""}${st.wrong > 2 ? ` It ${LINK_HINT(r.id)}.` : ""}`;
      render(); show(true);
      return false;
    };
    const LINK_HINT = (id) => { const p = PLINTHS[plinthOf(id)], ex = p && p.entries[0]; return ex ? `is marked ${LINK[ex.link] ? LINK[ex.link].word.toLowerCase() : "context"}` : "is on the ring"; };
    const push = () => { if (st.phase !== "mine" || scanning) return; st.spin = Math.min(st.spin + 0.9, 2.2); };
    let lastHashAt = 0;
    const stepMine = (dt, now) => {
      if (held) push();
      const spinning = st.spin > 0 && !scanning;
      portalAudio.dial(spinning, st.need ? Math.min(1, st.pos / st.need) : 0);
      if (!spinning) return;
      st.spin -= dt;
      st.pos += Math.max(12, st.need / 14) * dt;
      if (st.pos >= st.need) {
        st.pos = st.need; st.hash = st.finalHash; st.phase = "found"; st.t = 0; st.spin = 0; portalAudio.dial(false, 1); portalAudio.found(); render();
        return;
      }
      if (now - lastHashAt > 0.05) { lastHashAt = now; const seq = ++st.seq, nonce = st.nonce0 + Math.floor(st.pos); sha256hex(headerText(nonce)).then((h) => { if (disposed || seq !== st.seq || st.phase !== "mine") return; st.hash = h; const hs = body && body.querySelector(".gp-hash"), zs = body && body.querySelector(".gp-zeros"), ns = body && body.querySelector(".gp-nonce"); if (hs) hs.textContent = h; if (zs) zs.textContent = `leading zeros ${leading(h)} · needs ${PORTAL.zeros}`; if (ns) ns.textContent = String(nonce); }); }
    };
    const openDoor = () => { st.phase = "opening"; st.t = 0; portalAudio.opening(); render(); };
    const keys = (e) => { if (e.code !== "Space" || !e.repeat || st.phase !== "mine" || e.target && e.target.closest && e.target.closest("input, textarea, [contenteditable], dialog")) return; push(); };
    window.addEventListener("keydown", keys, true);
    // ---- what the interior asks ----
    let self = null;
    const ACTS = {
      idle: { key: "portal-begin", label: "BEGIN", hint: "Space · Test your knowledge · proof of work required to enter", tap: "Tap BEGIN · proof of work required to enter", run: () => begin() },
      riddles: { key: "portal-riddles", label: "RIDDLES", hint: "Space · Show the riddle", tap: "Tap to show the riddle", run: () => { render(); show(true); } },
      mine: { key: "portal-mine", label: "MINE", hint: "Hold Space · Mine the block", tap: "Hold MINE to turn the nonce", run: () => { push(); if (!shown()) { render(); show(true); } } },
      open: { key: "portal-enter", label: "ENTER", hint: "Space · Enter the Mining Museum", tap: "Tap ENTER to go through", run: () => enter() }
    };
    const doorAct = () => ACTS[st.phase] || null;
    const enter = () => { if (st.phase !== "open" || !self) return; const f = portalSpot(L, 0.95); self.portalGo = { x: f.x, z: f.z, room: ROOMS.ROOMS.find((room) => room.kind === "mining").id }; show(false); };
    // The visitor's facing, kept for the reveal; the door's act only once the drawing is complete and in front of it.
    const near = (x, z, fx, fz) => {
      st.pfx = fx; st.pfz = fz;
      const dx = s.x - x, dz = s.z - z, d = Math.hypot(dx, dz), f = Math.hypot(fx, fz) || 1;
      if (st.draw < 1 || d > PORTAL.prompt || (dx * fx + dz * fz) / (d * f) < 0.3) return null;
      return doorAct();
    };
    const ease = (k) => k * k * (3 - 2 * k), clamp01 = (v) => Math.max(0, Math.min(1, v));
    const update = (dt, px, pz, now) => {
      const dx = s.x - px, dz = s.z - pz, d = Math.hypot(dx, dz), f = Math.hypot(st.pfx, st.pfz) || 1, facing = (dx * st.pfx + dz * st.pfz) / (d * f);
      const open = st.phase === "open" || st.phase === "opening" || st.phase === "found";
      // The reveal: in front of the wall (within PORTAL.reveal, facing it within 60°) the light races round the doorway
      // over two seconds; it holds while the visitor stays within 3.5 m, and goes back to blank wall over a second
      // beyond that. Open, it stays drawn.
      const inFront = d < PORTAL.reveal && facing > 0.5;
      if (inFront && st.draw === 0 && !open && portalAudio.open()) portalAudio.reveal();
      if (open || inFront || (st.draw > 0 && d < 3.5)) st.draw = Math.min(1, st.draw + dt / 2.0); else st.draw = Math.max(0, st.draw - dt / 1.0);
      st.reveal = st.draw;
      if (ledge) { const k = st.draw * 0.64; ledge.position.x = Math.sin(s.a) * k; ledge.position.z = -Math.cos(s.a) * k; }
      portalAudio.hum(open ? 0.4 : st.draw);
      if (st.phase === "idle" && !shown() && st.draw >= 1 && d < PORTAL.prompt) { render(); show(true); }
      if (st.phase === "idle" && shown() && (st.draw < 0.9 || d > PORTAL.prompt + 1.5)) show(false);
      if (st.phase === "mine") stepMine(dt, now);
      if (st.phase === "found" && (st.t += dt) > 1.2) openDoor();
      if (st.phase === "opening") { st.t += dt; st.openK = ease(clamp01(st.t / PORTAL.open)); if (st.t > PORTAL.open + 0.4) { st.phase = "open"; st.solved = true; st.badge = `Proof of Knowledge · earned ${new Date().toISOString().slice(0, 10)}`; remember(); render(); } }
      if (open && !st.swapped) { st.swapped = true; for (const q of dots) q.node.geometry = G.dotG.orange(); for (const h of halos) h.node.geometry = G.haloG.orange(); for (const h of pools) h.node.geometry = G.poolG.orange(); if (band) band.geometry = G.band.orange(); }
      const vis = st.draw, drawing = st.draw > 0 && st.draw < 1;
      const blaze = st.phase === "opening" ? 1 + 1.2 * Math.sin(Math.PI * clamp01(st.t / PORTAL.open)) : 1;
      // Away from the door nothing of it shows: its nodes are put away once and then left alone.
      const away = vis <= 0 && st.openK <= 0;
      if (away && st.away) return;
      st.away = away;
      for (let i = 0; i < dots.length; i++) {
        // A pulse of light runs the lines in the order they were drawn, every six seconds, once the door is whole.
        const q = dots[i], n = q.node, wave = st.draw >= 1 ? Math.exp(-Math.pow((((now * 0.17) % 1) * 1.3 - 0.15 - q.t) / 0.045, 2)) : 0, shimmer = 1 + 0.07 * Math.sin(now * 2.3 + i * 0.7) + 0.5 * wave;
        const k = clamp01((vis - q.t) / 0.04), head = drawing ? Math.exp(-Math.pow((st.draw - q.t) / 0.03, 2)) : 0;
        const lit = open || (q.kind === "trunk" && st.phase !== "idle") || (q.crack >= 0 && q.crack < st.fragments) || (q.kind === "b" && (st.phase === "found" || st.phase === "mine" && st.spin > 0));
        let sc = k * (lit ? 1.6 : 1) * (1 + 0.9 * head) * shimmer * blaze * (st.draw < 1 && st.solved ? 1 : 1);
        if (sc < 0.02) sc = 0.001;
        n.scale.x = n.scale.y = sc; n.scale.z = Math.max(0.001, sc * 0.6);
      }
      for (let i = 0; i < halos.length; i++) { const h = halos[i], sc = clamp01((vis - h.t) / 0.06) * h.k * (0.88 + 0.12 * Math.sin(now * 1.3 + i * 0.9)) * (0.8 + 0.2 * blaze); h.node.scale.x = h.node.scale.y = h.node.scale.z = Math.max(0.001, sc); }
      for (let i = 0; i < pools.length; i++) { const h = pools[i], sc = ease(clamp01(vis)) * h.k * (0.94 + 0.06 * Math.sin(now * 0.9)) * (0.8 + 0.2 * blaze); h.node.scale.x = h.node.scale.y = h.node.scale.z = Math.max(0.001, sc); }
      if (band) { const kb = clamp01((vis - 0.58) / 0.04); band.scale.x = band.scale.y = band.scale.z = Math.max(0.001, kb); band.visible = kb > 0.01; }
      for (let i = 0; i < swirl.length; i++) if (swirl[i]) { const sc = st.openK * (0.85 + 0.25 * Math.sin(now * 1.4 + i * 2.1)); swirl[i].scale.x = swirl[i].scale.y = swirl[i].scale.z = Math.max(0.001, sc); }
    };
    // For the renders and the suite.
    BL.timechainGenesis.portal = {
      state: () => ({ ...st, riddles: st.riddles.map((i) => pool[i].id) }), begin, hit, enter, reroll, push,
      force: (phase, fragments = 0) => { portalStore.write({}); st.hint = ""; st.draw = 1; if (phase === "idle") { st.phase = "idle"; st.fragments = 0; return render(); } st.phase = "riddles"; st.riddles = deal(); st.current = Math.min(fragments, PORTAL_RUN - 1); st.fragments = Math.min(fragments, PORTAL_RUN); if (phase === "riddles") { render(); return show(true); } st.nonce0 = 2083236000; st.need = 893; st.pos = phase === "mine" ? 480 : 893; st.hash = "0a7c…"; st.finalHash = "00d2a1f6c90e4b7a1c3e5f8092b4d6e7f1a2c3b4d5e6f70819a2b3c4d5e6f7a8"; st.fragments = PORTAL_RUN; if (phase === "mine") { st.phase = "mine"; st.spin = 1; render(); return show(true); } if (phase === "found") { st.phase = "found"; st.t = 0; render(); return show(true); } if (phase === "opening") { st.phase = "opening"; st.t = 0.8; st.openK = 0.5; render(); return show(true); } st.phase = "open"; st.openK = 1; st.solved = true; st.badge = "Proof of Knowledge · earned today"; render(); show(true); },
      reveal: (v) => { st.draw = st.reveal = v; }, pool: pool.map((r) => r.id), spot: s
    };
    return {
      near, update, hit,
      // Whether the floor in front of the door should hold still: while the door shows, within 3.2 m of it.
      holds: (x, z) => st.draw > 0 && Math.hypot(s.x - x, s.z - z) < 3.2,
      tapDoor() { const a = doorAct(); if (a) a.run(); return true; },
      bind(owner) { self = owner; },
      dispose() { disposed = true; window.removeEventListener("keydown", keys, true); if (panel) { panel.hidden = true; body.replaceChildren(); } panel = body = null; portalAudio.close(); }
    };
  };

  // ---------- what the gallery says ----------
  // How a piece connects to Bitcoin: `cite` is in the whitepaper's reference list (its number), `named` is one Satoshi
  // named in a published post or email, `context` is history round it with no documented link, and the plaque says so; `author` is Satoshi's own entry.
  const LINK = { cite: { word: "WHITEPAPER REFERENCE", color: C.cite }, named: { word: "NAMED BY SATOSHI", color: C.named }, context: { word: "CONTEXT", color: C.context }, author: { word: "THE AUTHOR", color: C.named } };
  const SRC = {
    tcp: { href: "https://doi.org/10.1109/TCOM.1974.1092259", label: "Cerf & Kahn · A Protocol for Packet Network Intercommunication (1974)" },
    dh: { href: "https://doi.org/10.1109/TIT.1976.1055638", label: "Diffie & Hellman · New Directions in Cryptography (1976)" },
    rsa: { href: "https://doi.org/10.1145/359340.359342", label: "Rivest, Shamir & Adleman · CACM (1978)" },
    merkle: { href: "https://doi.org/10.1109/SP.1980.10006", label: "Merkle · Protocols for Public Key Cryptosystems (1980)" },
    chaum: { href: "https://doi.org/10.1007/978-1-4757-0602-4_18", label: "Chaum · Blind Signatures for Untraceable Payments (1982)" },
    koblitz: { href: "https://doi.org/10.1090/S0025-5718-1987-0866109-5", label: "Koblitz · Elliptic Curve Cryptosystems (1987)" },
    miller: { href: "https://doi.org/10.1007/3-540-39799-X_31", label: "Miller · Use of Elliptic Curves in Cryptography (1985)" },
    secp: { href: "https://www.secg.org/sec2-v2.pdf", label: "SECG · SEC 2, recommended curve secp256k1" },
    may88: { href: "https://nakamotoinstitute.org/library/crypto-anarchist-manifesto/", label: "May · The Crypto Anarchist Manifesto (1988)" },
    digicash: { href: "https://www.wired.com/1994/12/emoney/", label: "Wired · E-Money (That's What I Want) (1994)" },
    pgp: { href: "https://www.philzimmermann.com/EN/essays/WhyIWrotePGP.html", label: "Zimmermann · Why I Wrote PGP (1991)" },
    hughes: { href: "https://nakamotoinstitute.org/library/cypherpunk-manifesto/", label: "Hughes · A Cypherpunk's Manifesto (1993)" },
    cyphernomicon: { href: "https://nakamotoinstitute.org/library/cyphernomicon/", label: "May · The Cyphernomicon (1994)" },
    cybercash: { href: "https://www.sec.gov/cgi-bin/browse-edgar?company=cybercash&type=10-K", label: "SEC EDGAR · CyberCash, Inc. filings" },
    mint: { href: "https://groups.csail.mit.edu/mac/classes/6.805/articles/money/nsamint/nsamint.htm", label: "Law, Sabett & Solinas · How to Make a Mint (NSA, 1996)" },
    egold: { href: "https://www.justice.gov/archive/opa/pr/2008/July/08-crm-635.html", label: "US DOJ · e-gold guilty plea (2008)" },
    hashcash: { href: "http://www.hashcash.org/papers/hashcash.pdf", label: "Back · Hashcash, a Denial of Service Counter-Measure (2002)" },
    hashcash97: { href: "http://www.hashcash.org/papers/announce.txt", label: "Back · hash cash postage implementation, cypherpunks (28 Mar 1997)" },
    szabo97: { href: "https://doi.org/10.5210/fm.v2i9.548", label: "Szabo · Formalizing and Securing Relationships on Public Networks (1997)" },
    bmoney: { href: "https://www.weidai.com/bmoney.txt", label: "Dai · b-money (1998)" },
    titles: { href: "https://nakamotoinstitute.org/library/secure-property-titles/", label: "Szabo · Secure Property Titles with Owner Authority (1998)" },
    bitgold: { href: "https://nakamotoinstitute.org/library/bit-gold/", label: "Szabo · Bit Gold (2005)" },
    satoshi2010: { href: "https://bitcointalk.org/index.php?topic=342.msg4508#msg4508", label: "Satoshi · bitcointalk, 20 Jul 2010 (b-money and Bitgold)" },
    keiser: { href: "https://patents.google.com/patent/US5950176A/en", label: "US Patent 5,950,176 · Keiser & Burns (1999)" },
    castronova: { href: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=294828", label: "Castronova · Virtual Worlds (2001)" },
    chord: { href: "https://doi.org/10.1145/383059.383071", label: "Stoica et al. · Chord (SIGCOMM 2001)" },
    bittorrent: { href: "https://www.bittorrent.org/beps/bep_0003.html", label: "Cohen · The BitTorrent Protocol Specification (BEP 3)" },
    rpow: { href: "https://nakamotoinstitute.org/library/rpow/", label: "Finney · RPOW, Reusable Proofs of Work (2004)" },
    lr: { href: "https://www.justice.gov/opa/pr/manhattan-us-attorney-announces-charges-against-liberty-reserve-one-world-s-largest-digital", label: "US DOJ · Liberty Reserve charges (2013)" },
    site: { href: "https://bitcoin.org/en/bitcoin-paper", label: "Read it on bitcoin.org" },
    paper: { href: "https://bitcoin.org/en/bitcoin-paper", label: "Nakamoto · Bitcoin: A Peer-to-Peer Electronic Cash System (2008)" },
    announce: { href: "https://www.metzdowd.com/pipermail/cryptography/2008-October/014810.html", label: "Nakamoto · Bitcoin P2P e-cash paper, cryptography list (31 Oct 2008)" },
    block0: { href: "https://mempool.space/block/000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f", label: "mempool.space · block 0" },
    lamport: { href: "https://doi.org/10.1145/357172.357176", label: "Lamport, Shostak & Pease · The Byzantine Generals Problem (TOPLAS, Jul 1982)" },
    byzantine: { href: "https://satoshi.nakamotoinstitute.org/emails/cryptography/11/", label: "Nakamoto · cryptography list, 13 Nov 2008 (Byzantine Generals)" },
    pdf: { href: "https://bitcoin.org/bitcoin.pdf", label: "bitcoin.org · the whitepaper (PDF)" },
    thread: { href: "https://www.mail-archive.com/cryptography@metzdowd.com/msg09959.html", label: "Nakamoto · Bitcoin P2P e-cash paper, the cryptography list's thread (31 Oct 2008)" },
    release: { href: "https://www.metzdowd.com/pipermail/cryptography/2009-January/014994.html", label: "Nakamoto · Bitcoin v0.1 released, cryptography list (8 Jan 2009)" },
    complete: { href: "https://satoshi.nakamotoinstitute.org/", label: "Satoshi Nakamoto Institute · The Complete Satoshi (emails, posts, code)" }
  };
  // Each entry: the year it stands at, the plaque's date, title, name and line, its link, what it gave and what was
  // still missing (the plaque's two rows), and for the viewer a longer account, its facts, a note and sources;
  // `plinth` groups the entries that share one (their `part` the piece of the shared model the viewer shows alone).
  const EXHIBITS = [
    { key: "tcpip", year: 1974, when: "MAY 1974", title: "PACKETS", name: "TCP: packet network intercommunication", link: "context",
      line: "Cerf and Kahn's protocol let different networks pass packets to one another: the Internet's design.",
      gave: "A network any computer can join and talk over", missing: "Nothing you could own or pay with",
      about: "Vinton Cerf and Robert Kahn's paper, \"A Protocol for Packet Network Intercommunication\", appeared in the IEEE Transactions on Communications in May 1974. It described a Transmission Control Program that let packets cross from one network to another through gateways, with the end hosts, not the network, responsible for getting every byte through. Split into TCP and IP in 1978 and switched on across the ARPANET on 1 January 1983, it is the network Bitcoin's nodes still gossip over, on port 8333.",
      specs: [["Authors", "Vinton G. Cerf, Robert E. Kahn"], ["Published", "IEEE Trans. Communications, May 1974"], ["Became", "TCP and IP (1978); ARPANET cut over 1 Jan 1983"], ["In Bitcoin", "peer connections over TCP, port 8333"], ["Connection", "context: the network it runs on"]],
      note: "One message at the sender splits into four coloured packets. Each takes its own route through a mesh of chrome nodes, and they stack up again in order at the receiver. An original design.", sources: [SRC.tcp] },
    { key: "dh", year: 1976, when: "NOV 1976", title: "PUBLIC KEYS", name: "Diffie–Hellman key exchange", link: "context",
      line: "Two strangers agree a secret over an open line. Cryptography stops needing a courier.",
      gave: "Keys you can publish, and secrets without a meeting", missing: "A way to sign, and anything worth owning",
      about: "Whitfield Diffie and Martin Hellman's \"New Directions in Cryptography\" (IEEE Transactions on Information Theory, November 1976) proposed public-key cryptography: a key you can publish paired with one you keep, and a way for two parties who have never met to settle on a shared secret while anyone listens. Ralph Merkle had reached the same idea independently. Bitcoin does not use the exchange itself, but every address and every signature rests on the public-key idea it opened.",
      specs: [["Authors", "Whitfield Diffie, Martin E. Hellman"], ["Published", "IEEE Trans. Information Theory, Nov 1976"], ["Idea", "a public key and a private key; a shared secret over an open channel"], ["In Bitcoin", "ownership is a key pair"], ["Connection", "context"]],
      note: "Two chrome pods each keep a private crystal under dark glass, steeped in liquid of its own colour, and send a public orb across the open arch. Each then raises the same violet key at its masthead, a key nobody watching the arch can make.", sources: [SRC.dh] },
    { key: "rsa", year: 1977.5, when: "1977-78", title: "SIGNATURES", name: "RSA: public-key cryptosystems and digital signatures", link: "context",
      line: "A lock anyone can shut and only one key opens, and the first practical digital signature.",
      gave: "Proof that the owner, and nobody else, agreed", missing: "Something to sign that is money",
      about: "Ron Rivest, Adi Shamir and Leonard Adleman found the first practical public-key cryptosystem at MIT in 1977; their memo, MIT/LCS/TM-82, is dated April 1977, Martin Gardner's Scientific American column carried it that August, and \"A Method for Obtaining Digital Signatures and Public-Key Cryptosystems\" appeared in Communications of the ACM in February 1978. It made digital signatures real: a message signed with a private key that anyone can check with the public one. Every Bitcoin spend is such a signature, though on an elliptic curve rather than RSA's large primes.",
      specs: [["Authors", "Ronald Rivest, Adi Shamir, Leonard Adleman"], ["Memo", "MIT/LCS/TM-82, April 1977"], ["Published", "Communications of the ACM, Feb 1978"], ["Gave", "digital signatures anyone can verify"], ["In Bitcoin", "every spend is a signature (ECDSA, not RSA)"], ["Connection", "context"]],
      note: "A chrome lock stands on two secret prime crystals. One floating key fits it, and the same key's bow presses a seal of light onto a sheet: the signature.", sources: [SRC.rsa] },
    { key: "merkle", year: 1980, when: "APR 1980", title: "MERKLE TREES", name: "Merkle's tree authentication", link: "cite", ref: 7,
      line: "Hash the leaves in pairs up to one root, and one short value vouches for them all.",
      gave: "One hash that stands for a whole block of transactions", missing: "Who orders the leaves in time",
      about: "Ralph Merkle's \"Protocols for Public Key Cryptosystems\", given at the IEEE Symposium on Security and Privacy in April 1980, described tree authentication: hash the items in pairs, hash the pairs, and so on up to one root, so a short path of hashes proves any one item belongs. The whitepaper cites it as reference 7. Every Bitcoin block header carries the Merkle root of its transactions, and a light wallet checks a payment with a Merkle branch alone.",
      specs: [["Author", "Ralph C. Merkle"], ["Published", "IEEE Symposium on Security and Privacy, Apr 1980"], ["Patent", "US 4,309,569, filed 1979, granted Jan 1982"], ["Whitepaper", "reference [7]; §7 Reclaiming Disk Space, §8 SPV"], ["In Bitcoin", "the Merkle root in every block header"]],
      note: "The sculpture is a true binary hash tree of eight leaves: glass leaves joined in pairs by rising branches to four, two and one root crystal, the light warming from the cool leaves to the orange root. Not to be confused with Merkle's puzzles (1974), his key-exchange idea.", sources: [SRC.merkle] },
    { key: "byzantine", year: 1982.5, when: "JUL 1982", title: "BYZANTINE GENERALS", name: "Lamport, Shostak & Pease: the Byzantine Generals Problem", link: "named",
      line: "Generals round a city must agree on one plan by messenger, though some of them lie.",
      gave: "The exact problem proof of work solves: agreement with traitors", missing: "A solution that needs no roll of known members",
      about: "Leslie Lamport, Robert Shostak and Marshall Pease published \"The Byzantine Generals Problem\" in ACM Transactions on Programming Languages and Systems in July 1982: how can generals camped round a city agree on a plan by messenger when some generals, or messengers, are traitors? On 13 November 2008 Satoshi wrote to the cryptography list that the proof-of-work chain is a solution to the Byzantine Generals' Problem, and told the story as generals brute-forcing a password together.",
      specs: [["Authors", "Leslie Lamport, Robert Shostak, Marshall Pease"], ["Published", "ACM TOPLAS 4(3), July 1982"], ["Problem", "agreement among parties when some are faulty or lying"], ["Satoshi", "cryptography list, 13 Nov 2008"], ["In Bitcoin", "the longest proof-of-work chain is the agreement"]],
      note: "Seven chrome generals ring a floating citadel and pass messengers round the ring. The five loyal ones (blue) agree and each aims one orange beam at the city. The two traitors (red) send lies.", sources: [SRC.lamport, SRC.byzantine] },
    { key: "chaum", year: 1982.6, when: "AUG 1982", title: "BLIND SIGNATURES", name: "Chaum: blind signatures for untraceable payments", link: "context",
      line: "A bank signs a note through a carbon-lined envelope and never sees the number inside.",
      gave: "Digital cash that keeps the payer private", missing: "The bank: a mint that can be shut",
      about: "David Chaum presented \"Blind Signatures for Untraceable Payments\" at CRYPTO '82 in Santa Barbara in August 1982; the proceedings came out in 1983. His picture is a carbon-lined envelope: the bank signs the outside, the signature goes through onto the note inside, and the bank never sees which note it signed. It is the root of private digital cash. Every such scheme still needed the bank, which is what Bitcoin set out to remove.",
      specs: [["Author", "David Chaum"], ["Presented", "CRYPTO '82, Aug 1982; proceedings 1983"], ["Idea", "a signature on a message the signer cannot read"], ["Led to", "ecash and DigiCash (about 1990)"], ["Connection", "context"]],
      note: "The bank's floating chrome press signs a coin through a sealed cover of dark glass it cannot see into. Beside it the cover lies open, and the coin still wears the same ring of signature light.", sources: [SRC.chaum] },
    { key: "ecc", year: 1985, when: "1985", title: "ELLIPTIC CURVES", name: "Elliptic-curve cryptography", link: "context",
      line: "Koblitz and Miller, separately, put public keys on a curve: same strength, far shorter keys.",
      gave: "The small, fast keys Bitcoin signs with", missing: "A use that was money",
      about: "In 1985 Neal Koblitz and Victor Miller each, independently, proposed building public-key systems on the points of an elliptic curve, where adding points is easy and undoing it is hard. Keys a quarter the size of RSA's give the same strength. Bitcoin signs with ECDSA on the curve secp256k1, y² = x³ + 7 over a 256-bit prime field: a private key is a number, the public key that number of additions of the curve's base point.",
      specs: [["Authors", "Neal Koblitz; Victor S. Miller (independently)"], ["Published", "Miller, CRYPTO '85; Koblitz, Math. Comp. 1987"], ["Bitcoin's curve", "secp256k1: y² = x³ + 7 over F_p, p = 2²⁵⁶ − 2³² − 977"], ["In Bitcoin", "ECDSA signatures, Schnorr since Taproot (2021)"], ["Connection", "context"]],
      note: "The sculpture is the curve y² = x³ + 7 over the real numbers, for its shape, as a chrome rail with the group law drawn: a beam through P and Q strikes the curve at a third point and drops straight through to P + Q. The real curve lives over a prime field and looks like noise.", sources: [SRC.miller, SRC.koblitz, SRC.secp] },
    { key: "may88", year: 1988, when: "1988", title: "CRYPTO ANARCHY", name: "May: The Crypto Anarchist Manifesto", link: "context",
      line: "Tim May's leaflet: cryptography will let people trade and speak beyond any state's reach.",
      gave: "The idea that code, not law, could protect value", missing: "Any working money to trade in",
      about: "Timothy C. May wrote \"The Crypto Anarchist Manifesto\" in 1988 (his own FAQ dates it to August 1988) and photocopied it for the Crypto '88 crowd; it opened the cypherpunks mailing list in 1992. Deliberately echoing an older manifesto, it argued that public-key cryptography and anonymous networks would let people deal with one another without governments able to watch or stop them. It is the political soil the later money ideas grew in.",
      specs: [["Author", "Timothy C. May"], ["Written", "1988 (dated August 1988); handed out at Crypto '88"], ["Posted", "cypherpunks list, 1992"], ["Connection", "context: the culture"]],
      note: "One short text copied from hand to hand: the copies spiral up from a chrome beacon and out over the red fence of the state's reach.", sources: [SRC.may88] },
    { key: "digicash", year: 1989.7, when: "1989", title: "DIGICASH", name: "DigiCash and ecash", link: "context",
      line: "Chaum's company put blind signatures to work: ecash on a PC, trials from 1994, bankrupt in 1998.",
      gave: "Proof that private digital cash could run", missing: "It ran on one company's server",
      about: "David Chaum founded DigiCash in Amsterdam to sell ecash, the blind-signature money of his papers; most accounts date the company to 1989, Wired's 1994 profile to 1990. Its CyberBucks trial ran from 1994 and Mark Twain Bank in St. Louis issued real-dollar ecash from 1995. Few merchants joined, the company went bankrupt in November 1998, and the lesson stuck: cash that depends on one issuer dies with it.",
      specs: [["Founder", "David Chaum"], ["Founded", "1989 or 1990 (sources differ); Amsterdam"], ["Product", "ecash: blind-signed coins on a PC"], ["Trials", "CyberBucks 1994; Mark Twain Bank, from 23 Oct 1995"], ["Ended", "bankrupt, Nov 1998"], ["Connection", "context"]],
      note: "Coins leave the bank's vault inside dark envelopes (blinded), rest in the wallet in the middle and are spent bare at the shop. The bank's red tracing beam breaks off without finding them. No logos: an original design.", sources: [SRC.digicash] },
    { key: "timestamp", year: 1990.6, when: "AUG 1990", title: "TIME-STAMPING", name: "Haber & Stornetta: how to time-stamp a digital document", link: "cite", ref: 3,
      line: "Each stamp holds the hash of the one before; the newest is printed in the newspaper for all.",
      gave: "The linked hash chain, with its root published where nobody can change it", missing: "Still one stamping service to trust",
      about: "Stuart Haber and W. Scott Stornetta presented \"How to Time-Stamp a Digital Document\" at CRYPTO '90 in August 1990; it appeared in the Journal of Cryptology in 1991. Each certificate carries the hash of the one before it, so no record can be altered or backdated without breaking every later link; with Dave Bayer in 1993 they batched records into Merkle trees. Their company, Surety, printed the chain's latest hash in the New York Times' classified ads every week from 1995. The whitepaper cites them three times, as references 3, 4 and 5.",
      specs: [["Authors", "Stuart Haber, W. Scott Stornetta"], ["Presented", "CRYPTO '90, Aug 1990; J. Cryptology 3(2), 1991"], ["Also cited", "Bayer, Haber & Stornetta 1993 [4]; Haber & Stornetta 1997 [5]"], ["Published root", "Surety's weekly hash in the New York Times, from 1995"], ["In Bitcoin", "every block header holds the previous block's hash"]],
      note: "Four certificates climb a chrome rail of time. Each one's own seal, the bright crystal on its right, is copied into the next one's left side and chained to it, so none can be slipped in earlier.", sources: [{ href: "https://doi.org/10.1007/BF00196791", label: "Haber & Stornetta · How to Time-Stamp a Digital Document (1991)" }, { href: "https://en.wikipedia.org/wiki/Stuart_Haber", label: "Surety and the New York Times hashes" }] },
    { key: "pgp", year: 1991.4, when: "JUN 1991", title: "PGP", name: "Pretty Good Privacy", link: "context",
      line: "Zimmermann gave strong encryption to anyone with a PC, free, and spread it on floppies and Usenet.",
      gave: "Strong crypto in ordinary hands, and the web of trust", missing: "Money",
      about: "Phil Zimmermann released PGP 1.0 in June 1991, free, so that ordinary people could encrypt and sign email with public keys. It spread by floppy and Usenet beyond US borders, which brought a three-year criminal export investigation, dropped in 1996. PGP made key pairs, fingerprints and signed messages everyday tools for the people who would later argue about digital money on the cypherpunks list.",
      specs: [["Author", "Philip R. Zimmermann"], ["Released", "PGP 1.0, 5 June 1991 (MS-DOS)"], ["Ciphers", "RSA keys with Bass-O-Matic (1.0); IDEA from 2.0 (1992)"], ["Investigation", "US export case 1993–96, dropped"], ["Connection", "context"]],
      note: "A message sealed in a locked chrome capsule, and round it a web of trust: six people's keys, each vouching for its neighbours along beams of light.", sources: [SRC.pgp] },
    { key: "cypherpunks", year: 1992.7, when: "SEP 1992", title: "CYPHERPUNKS", name: "The cypherpunks mailing list", link: "context", plinth: "cypherpunks",
      line: "Hughes, May and Gilmore start the list where Hashcash and b-money were first posted.",
      gave: "The room where the pieces were argued out", missing: "The design that joined them",
      about: "Eric Hughes, Timothy C. May and John Gilmore held the first meeting in September 1992 in the Bay Area; Jude Milhon named them cypherpunks. The mailing list that followed is where anonymous remailers, digital cash schemes, Hashcash (1997) and b-money (1998) were announced and picked apart. Satoshi later said of b-money that it had appeared \"on Cypherpunks\".",
      specs: [["Founders", "Eric Hughes, Timothy C. May, John Gilmore"], ["Started", "September 1992, San Francisco Bay Area"], ["Posted there", "Hashcash (1997), b-money (1998)"], ["Connection", "context"]],
      note: "Six chrome voices speak inward to one list, a twisting stack of posts and replies. Out of the top of the argument rises a coin of digital money.", sources: [SRC.hughes, SRC.satoshi2010] },
    { key: "hughes93", year: 1993.2, when: "9 MAR 1993", title: "THE MANIFESTO", name: "Hughes: A Cypherpunk's Manifesto", link: "context", plinth: "cypherpunks", part: "manifesto",
      line: "\"Cypherpunks write code.\" Privacy is built, not asked for.",
      gave: "The rule that the tools must exist, in the open", missing: "A money the tools could carry",
      about: "Eric Hughes's \"A Cypherpunk's Manifesto\", dated 9 March 1993, set the list's rule: privacy in an open society needs anonymous transaction systems, and the people who want them have to write the software themselves and give it away. \"Cypherpunks write code.\" Fifteen years later the Bitcoin software was released the same way, free and open, with its author's name on nothing but the paper.",
      specs: [["Author", "Eric Hughes"], ["Dated", "9 March 1993"], ["Line", "\"Cypherpunks write code.\""], ["Connection", "context"]],
      note: "A chrome tablet of code with a keyhole of light, and round it a wall of glass bricks going up course by course, the next brick on its way down: privacy is built, not asked for.", sources: [SRC.hughes] },
    { key: "cybercash", year: 1994.6, when: "AUG 1994", title: "CYBERCASH", name: "CyberCash and CyberCoin", link: "context",
      line: "Card payments over the new web, then CyberCoin micropayments. Bankrupt in 2001.",
      gave: "Proof people would pay online", missing: "It all went through one company's gateway",
      about: "CyberCash was founded in Reston, Virginia, in August 1994 (William Melton, Daniel Lynch, Steve Crocker and Bruce Wilson) to move card payments across the Internet safely, with a wallet on the buyer's PC and a gateway to the banks. CyberCoin, its 1996 micropayment system, let people pay cents for a page. It filed for bankruptcy in 2001. Each payment still passed through a middleman.",
      specs: [["Founded", "August 1994, Reston, Virginia"], ["Products", "Secure Internet Payment Service; CyberCoin (1996)"], ["Ended", "bankrupt 2001; assets to VeriSign"], ["Connection", "context"]],
      note: "A card of light rides an armoured glass tube from the buyer's pod, through the chrome gateway that checks it, to the shop, which sends a parcel out and a green light back. An original design, no marks.", sources: [SRC.cybercash] },
    { key: "cyphernomicon", year: 1994.7, when: "SEP 1994", title: "THE FAQ", name: "May: The Cyphernomicon", link: "context", plinth: "cypherpunks", part: "binder",
      line: "Tim May's book-length FAQ of the list: digital cash, reputations, remailers, all of it.",
      gave: "The questions written down, years before the answer", missing: "The answer",
      about: "In September 1994 Timothy C. May posted the Cyphernomicon, the cypherpunks' FAQ: hundreds of pages on anonymous remailers, digital cash, reputations and the politics round them, including the open problem of money without a bank. It is a record of what the list already knew it wanted when Bitcoin arrived.",
      specs: [["Author", "Timothy C. May"], ["Posted", "version 0.666, 10 September 1994"], ["Form", "a FAQ, book length"], ["Connection", "context"]],
      note: "A book opened all the way round: twenty glass chapters fanned from a glowing spine between two chrome covers, their index tabs stepping down in a spiral.", sources: [SRC.cyphernomicon] },
    { key: "mint", year: 1996.4, when: "JUN 1996", title: "HOW TO MAKE A MINT", name: "The NSA's survey of anonymous electronic cash", link: "context",
      line: "Three NSA cryptographers write up Chaum-style ecash: how it works and how it could be abused.",
      gave: "A clear public account of ecash, double spending and all", missing: "Any way round the mint",
      about: "\"How to Make a Mint: The Cryptography of Anonymous Electronic Cash\", dated 18 June 1996, was written by Laurie Law, Susan Sabett and Jerry Solinas of the NSA's Cryptology Division and later printed in the American University Law Review. It explains blind signatures, withdrawal and payment, and the double-spending problem that makes every such scheme lean on its bank. A public, careful statement of exactly what Bitcoin would have to solve without one.",
      specs: [["Authors", "Laurie Law, Susan Sabett, Jerry Solinas (NSA)"], ["Dated", "18 June 1996"], ["Reprinted", "American University Law Review 46(4), 1997"], ["Subject", "Chaum-style ecash; double spending"], ["Connection", "context"]],
      note: "Electronic cash in three steps down a cascade: a chrome press, fed from a tank of molten metal, strikes a coin of light, the coin is hidden in a sphere of dark glass and liquid, and it is spent into a chrome till. The survey's page floats over it all.", sources: [SRC.mint] },
    { key: "egold", year: 1996.9, when: "1996", title: "E-GOLD", name: "e-gold: digital gold currency", link: "context",
      line: "Grams of gold in a vault, moved between accounts online. Shut down by the US in 2008.",
      gave: "Millions of people moving value online", missing: "The vault and the company could be seized",
      about: "Douglas Jackson and Barry Downey launched e-gold in 1996: accounts denominated in grams of gold held in vaults, transferable to any other account on the web. By the mid-2000s it had millions of accounts. In 2007 the company and its founders were indicted for running an unlicensed money transmitter; they pleaded guilty in 2008 and the system was wound down. Value with a single operator ends when the operator does.",
      specs: [["Founders", "Douglas Jackson, Barry Downey"], ["Launched", "1996, Melbourne, Florida"], ["Backing", "gold bullion in vaults; accounts in grams"], ["Ended", "indicted 2007; guilty pleas 2008"], ["Connection", "context"]],
      note: "The gold never moves. A chrome vault floats shut round a stack of bars standing in molten gold, seen through its glass waist, while over it grams pass as light from one account's pod to another's.", sources: [SRC.egold] },
    { key: "hashcash", year: 1997.2, when: "28 MAR 1997", title: "HASHCASH", name: "Back: Hashcash proof of work", link: "cite", ref: 6,
      line: "Burn a little CPU to mint a stamp: a hash with leading zeros that anyone can check in an instant.",
      gave: "Proof of work: cost that can be verified", missing: "Stamps could not be passed on or counted",
      about: "Adam Back announced hash cash on the cypherpunks list on 28 March 1997 as postage against spam: the sender finds a header whose SHA-1 hash begins with twenty zero bits, which takes work, and the receiver checks it with one hash. His paper \"Hashcash – A Denial of Service Counter-Measure\" followed on 1 August 2002, and the whitepaper cites it as reference 6: Bitcoin's mining is a Hashcash-style proof of work on SHA-256, chained block to block.",
      specs: [["Author", "Adam Back"], ["Announced", "cypherpunks list, 28 Mar 1997"], ["Paper", "1 Aug 2002"], ["Stamp (v1, 2002)", "ver:bits:date:resource:ext:rand:counter; SHA-1 with 20 leading zero bits (1997's v0: ver:date:resource:counter)"], ["Whitepaper", "reference [6]; §4 Proof-of-Work"]],
      note: "A finned chrome engine burns work, its coolant boiling in the tanks behind it, throwing off a spiral of dead tries, until one comes out a stamp whose hash starts with zeros. A small lens at its side checks it at once and shows green.", sources: [SRC.hashcash97, SRC.hashcash] },
    { key: "szabo97", year: 1997.7, when: "SEP 1997", title: "SMART CONTRACTS", name: "Szabo: Formalizing and Securing Relationships on Public Networks", link: "context",
      line: "A vending machine is a contract in hardware. Szabo asks what contracts in software could do.",
      gave: "The idea of agreements enforced by code", missing: "A ledger to enforce them on",
      about: "Nick Szabo's essay appeared in First Monday in September 1997. His humble example is the vending machine: put in the coin, get the drink, no clerk and no court; a contract enforced by the mechanism itself. He asked how far protocols on public networks could take that. Bitcoin's scripts, small and deliberately limited, are a first answer.",
      specs: [["Author", "Nick Szabo"], ["Published", "First Monday 2(9), Sep 1997"], ["Example", "the vending machine"], ["In Bitcoin", "Script: conditions a spend must meet"], ["Connection", "context"]],
      note: "The vending machine, with no keeper: a coin goes into the chrome hopper, falls to the gate where the rule is tested, and the goods are let out of the bell below.", sources: [SRC.szabo97] },
    { key: "titles", year: 1998.5, when: "1998", title: "PROPERTY TITLES", name: "Szabo: Secure Property Titles with Owner Authority", link: "context",
      line: "A register of who owns what, replicated across a club of servers so no clerk can forge a transfer.",
      gave: "A replicated registry of signed transfers", missing: "A cost to joining the club",
      about: "Nick Szabo's 1998 essay proposed a title registry kept not by one office but by a group of servers, each title a chain of transfers signed by its previous owner, and the group able to split from any member who cheats. It is the registry half of bit gold, and an early sketch of an ownership ledger with no single keeper.",
      specs: [["Author", "Nick Szabo"], ["Published", "1998"], ["Idea", "a replicated title database; a chain of signed transfers"], ["Led to", "bit gold's registry"], ["Connection", "context"]],
      note: "One property held aloft by six keepers of the same register. Five copies agree and their beams carry the title. The sixth, a forgery, is red, cut off from the rest and carries nothing.", sources: [SRC.titles] },
    { key: "bmoney", year: 1998.8, when: "NOV 1998", title: "B-MONEY", name: "Dai: b-money", link: "cite", ref: 1,
      line: "Money created by solving computational problems, every participant keeping a copy of the accounts.",
      gave: "Proof of work as the mint; everyone holds the ledger", missing: "How everyone agrees which copy is right",
      about: "Wei Dai circulated b-money in November 1998: a scheme in which money is created by publishing solutions to computational problems, every participant keeps a database of how much everyone owns, and transfers are signed and broadcast. It is the whitepaper's first reference, and in 2010 Satoshi wrote that Bitcoin is an implementation of Dai's proposal and Szabo's Bitgold. Dai's design assumed an unjammable broadcast channel; Bitcoin's chain of work is what replaced that assumption.",
      specs: [["Author", "Wei Dai"], ["Circulated", "November 1998, cypherpunks"], ["Whitepaper", "reference [1]"], ["Satoshi", "\"an implementation of Wei Dai's b-money proposal\" (2010)"], ["Open problem", "agreement without a synchronous broadcast"]],
      note: "At the centre a puzzle of chrome dials turned into line, and the coin it makes. Round it five participants each carry the same five accounts, every one linked to every other.", sources: [SRC.bmoney, SRC.satoshi2010] },
    { key: "keiser", year: 1999.7, when: "7 SEP 1999", title: "VIRTUAL SPECIALIST", name: "Keiser & Burns: a computer-implemented securities trading system", link: "context",
      line: "A patent for a market run by software, used by the Hollywood Stock Exchange. No link to Bitcoin.",
      gave: "A market made by a program rather than a floor", missing: "Any connection to Bitcoin's design that a source shows",
      about: "US patent 5,950,176, \"Computer-implemented securities trading system with a virtual specialist function\", was granted to Timothy M. (Max) Keiser and Michael R. Burns on 7 September 1999 and ran the Hollywood Stock Exchange, a game market in film futures. It appears on the prehistory chart this gallery grew from. We found no primary source tying it to Bitcoin's design, so it stands here as context, as the chart's own era of software markets.",
      specs: [["Inventors", "Timothy M. (Max) Keiser, Michael R. Burns"], ["Patent", "US 5,950,176, granted 7 Sep 1999"], ["Used by", "Hollywood Stock Exchange"], ["Connection", "context; no documented link"]],
      note: "A program afloat in the gap of a price ladder: bids (blue) climb to it from below, offers (orange) step away above, and it always shows one price to buy at and one to sell at.", sources: [SRC.keiser] },
    { key: "dotcom", year: 2000, when: "1998-2001", title: "WEB POINTS", name: "Beenz and Flooz: dot-com web currencies", link: "context", plinth: "dotcom",
      line: "Points earned and spent across websites, issued by companies that folded in August 2001.",
      gave: "Demand: people wanted money native to the web", missing: "An issuer that could not disappear",
      about: "Beenz (London, 1998) and Flooz (New York, 1999) sold web-wide points and gift money that shoppers earned or bought and spent at partner stores. Both ran out of money in August 2001 and their balances went with them. They are on the chart as demand: the web wanted its own money, and a company's promise was not enough.",
      specs: [["Beenz", "founded 1998, launched 1999; London"], ["Flooz", "1999–2001, New York"], ["Ended", "both closed Aug 2001; balances lost"], ["Connection", "context: demand"]],
      note: "A chrome horn blowing a bubble full of points, and beside it the one that burst: its issuer folded, the horn dark and tipped over, its points fallen grey to the deck.", sources: [{ href: "https://en.wikipedia.org/wiki/Flooz.com", label: "Flooz.com (1999–2001)" }, { href: "https://en.wikipedia.org/wiki/Beenz.com", label: "Beenz.com (1998–2001)" }] },
    { key: "games", year: 2001.4, when: "2001", title: "GAME GOLD", name: "Virtual-world currencies and their markets", link: "context", plinth: "dotcom", part: "chest",
      line: "Players traded game gold for real dollars; in 2001 an economist measured a game world's GDP.",
      gave: "Proof that digital tokens take real value when people agree", missing: "The tokens belonged to the game's company",
      about: "By 2001 players of online worlds were selling game currency and items for dollars on auction sites, and Edward Castronova's December 2001 paper \"Virtual Worlds\" worked out one game's economy as if it were a country. The tokens had value because players agreed they did, and none because the publisher could print or confiscate them at will.",
      specs: [["Marker", "Castronova, \"Virtual Worlds\", Dec 2001"], ["Trade", "game gold and items for dollars, from the late 1990s"], ["Connection", "context: demand"]],
      note: "A small world sealed in glass inside a chrome ring. Its gold pours out on one side into a dish, and real dollars climb in from the dish on the other.", sources: [SRC.castronova] },
    { key: "bittorrent", year: 2001.5, when: "2 JUL 2001", title: "BITTORRENT", name: "Cohen: BitTorrent", link: "context", plinth: "p2p", part: "swarm",
      line: "A file in pieces from a swarm of peers, each trading pieces tit for tat.",
      gave: "Incentives built into a protocol", missing: "Nothing to settle who owned what",
      about: "Bram Cohen released BitTorrent on 2 July 2001: a file is cut into pieces, every downloader uploads the pieces it has, and peers favour those who give back. It proved a peer-to-peer system could run on incentives written into the protocol itself, an idea the whitepaper leans on in its own section on incentive.",
      specs: [["Author", "Bram Cohen"], ["Released", "2 July 2001"], ["Idea", "swarming downloads; tit-for-tat choking"], ["Connection", "context"]],
      note: "The file as a chrome sphere cut into slices, and round it a swarm of peers each building its own copy slice by slice, passing a piece on for every piece it is given.", sources: [SRC.bittorrent] },
    { key: "dht", year: 2001.6, when: "AUG 2001", title: "HASH TABLES", name: "Distributed hash tables: Chord and its kin", link: "context", plinth: "p2p",
      line: "Chord, CAN, Pastry and Tapestry: find any key among thousands of peers in a few hops, no server.",
      gave: "Peer-to-peer lookup at scale", missing: "Bitcoin chose gossip over lookup",
      about: "In 2001 four designs, Chord (SIGCOMM, August 2001), CAN, Pastry and Tapestry, showed how thousands of peers could share one lookup table with no server, each knowing only a few others. Kademlia followed in 2002. Bitcoin's network is simpler and older in spirit, flooding every transaction and block to every node, but the peer-to-peer engineering of these years is the water it swam in.",
      specs: [["Chord", "Stoica, Morris, Karger, Kaashoek, Balakrishnan; SIGCOMM 2001"], ["Also 2001", "CAN, Pastry, Tapestry"], ["Bitcoin", "gossip (flooding), not a DHT"], ["Connection", "context"]],
      note: "A chrome ring of peers with nothing at its centre, and one lookup leaping round it in ever shorter hops to the peer that holds the key.", sources: [SRC.chord] },
    { key: "rpow", year: 2004.6, when: "15 AUG 2004", title: "RPOW", name: "Finney: Reusable Proofs of Work", link: "context",
      line: "Hashcash tokens you can pass on, exchanged one for one by a server anyone can audit.",
      gave: "Proof of work as a transferable token", missing: "The one server, however honest",
      about: "Hal Finney announced RPOW on 15 August 2004. A Hashcash stamp is spent once; RPOW let its owner trade it in for a fresh token at a server, and that server ran inside an IBM 4758 secure coprocessor whose code anyone could verify by remote attestation. Transferable proof of work with a trusted machine instead of a trusted person. Finney went on to run the second Bitcoin node and received the first transaction, in block 170, on 12 January 2009.",
      specs: [["Author", "Hal Finney"], ["Announced", "15 Aug 2004"], ["Hardware", "IBM 4758 secure coprocessor, remote attestation"], ["Idea", "one-for-one exchange of proof-of-work tokens"], ["Connection", "context"]],
      note: "A sealed chrome capsule with a glass waist that shows its chip, standing in its coolant, to anyone, and three lenses watching it. A spent grey token goes in at one port and a fresh lit one comes out of the other.", sources: [SRC.rpow] },
    { key: "bitgold", year: 2005.99, when: "DEC 2005", title: "BIT GOLD", name: "Szabo: bit gold", link: "named",
      line: "Solve a puzzle, timestamp the solution, register the owner, start the next puzzle from it.",
      gave: "Chained proof of work as a scarce, unforgeable thing", missing: "The bits were not fungible, and the registry still needed trust",
      about: "Nick Szabo says he conceived bit gold in 1998; he posted it on his blog Unenumerated in December 2005 (the 27th or 29th, by source). A challenge string is hashed with work, the solution timestamped and entered in a distributed title registry as its finder's, and the next challenge grows from it: a chain of proofs of work that nobody can forge. Each bit was its own size, so he needed a second layer to make them into money. Satoshi named Bitgold beside b-money in 2010.",
      specs: [["Author", "Nick Szabo"], ["Conceived", "1998 (Szabo, 2011)"], ["Posted", "Unenumerated, Dec 2005"], ["Satoshi", "\"Nick Szabo's Bitgold proposal\" (2010)"], ["Left open", "fungibility; the registry's trust"]],
      note: "Nuggets climbing a chrome spire, each a solved puzzle ringed by its time-stamp and tied to the next. The topmost is still glass: the puzzle begun from the last solution.", sources: [SRC.bitgold, SRC.satoshi2010] },
    { key: "lr", year: 2006, when: "2006", title: "LIBERTY RESERVE", name: "Liberty Reserve: the last centralised e-currency", link: "context",
      line: "A Costa Rican e-currency with no questions asked. Seized by the United States in May 2013.",
      gave: "The counter-example: a central issuer ends in a courtroom", missing: "Everything Bitcoin is",
      about: "Liberty Reserve opened in 2006 in Costa Rica, issuing LR dollars and euros moved between accounts with little or no identity checking. In May 2013 the United States shut it down and charged its founder with running a six-billion-dollar laundering operation; he was sentenced in 2016. It stands at the end of the ring as the last of the issuers, and the reason the one that came next had none.",
      specs: [["Founded", "2006, Costa Rica"], ["Units", "LR dollars, LR euros"], ["Ended", "seized May 2013; founder sentenced 2016"], ["Connection", "context: what Bitcoin is not"]],
      note: "Every account hangs from one chrome hub. The hub is bound and crossed in red, its lights are out, and every coin under it has gone dark with it.", sources: [SRC.lr, { href: "https://krebsonsecurity.com/2013/05/u-s-government-seizes-libertyreserve-com/", label: "Krebs on Security · U.S. government seizes LibertyReserve.com (2013)" }] },
    { key: "satoshi", year: 2008.6, when: "2008 TO 2011", title: "SATOSHI NAKAMOTO", name: "Satoshi Nakamoto", link: "author", plinth: "centre",
      line: "The name on the whitepaper and on the first Bitcoin software. Who stood behind it is not known.",
      gave: "The paper, the first software, the first block", missing: "A face: the name is all there is",
      about: "Satoshi Nakamoto is the name signed to the whitepaper and to the first Bitcoin software. Whether it stands for one person or for several has never been established, and this room does not guess. What is known is what was published under the name. The domain bitcoin.org was registered on 18 August 2008. The paper went to the cryptography mailing list on 31 October 2008. The genesis block is dated 3 January 2009 and carries that day's headline from The Times. Bitcoin 0.1 was announced to the same list on 8 January 2009, and block 1 followed the next day. For two years Satoshi wrote the code and answered the list and the forum, then stepped back: the last forum post is dated 12 December 2010, the software passed to Gavin Andresen and the other developers, and emails their recipients have since published run on to April 2011.",
      specs: [["Known as", "Satoshi Nakamoto, a pseudonym; identity unknown"], ["bitcoin.org", "registered 18 Aug 2008"], ["Whitepaper", "cryptography list, 31 Oct 2008"], ["Genesis block", "3 Jan 2009, 18:15:05 UTC"], ["Its headline", "The Times 03/Jan/2009 Chancellor on brink of second bailout for banks"], ["Bitcoin 0.1", "announced 8 Jan 2009; block 1 on 9 Jan"], ["Last forum post", "bitcointalk, 12 Dec 2010"], ["Handed on", "to Gavin Andresen and the developers; last known emails, April 2011"], ["The statue", "by Valentina Picozzi; the original stands in Lugano. Recreated for the Temple in Ooga Booga Land by wicked, with her permission"]],
      note: "The figure is the Temple's statue, the one this room's hologram is thrown from, here to turn by hand.", sources: [SRC.pdf, SRC.thread, SRC.block0, SRC.release, SRC.complete] },
    { key: "whitepaper", year: 2008.8, when: "31 OCT 2008", title: "THE WHITEPAPER", name: "Bitcoin: A Peer-to-Peer Electronic Cash System", link: "named", plinth: "centre",
      line: "Nine pages posted to the cryptography mailing list. Eight references, most of them in this room.",
      gave: "The pieces joined: signatures, a timestamp chain of proof of work, the longest chain", missing: "The network, nine weeks away",
      about: "Satoshi Nakamoto posted the paper to the cryptography mailing list on 31 October 2008: \"A purely peer-to-peer version of electronic cash\", in nine pages. Coins are chains of signatures; a network of nodes timestamps transactions into a chain of hash-based proof of work; the longest chain is the record, and honest nodes win while they hold most of the CPU power. Its references: b-money, Massias et al., Haber and Stornetta (three papers), Hashcash, Merkle, and Feller on probability.",
      specs: [["Author", "Satoshi Nakamoto"], ["Posted", "cryptography list, 31 Oct 2008, 18:10 UTC"], ["Length", "9 pages, 8 references"], ["Cited here", "b-money [1], Hashcash [6], Merkle [7]"], ["Also cited", "Massias et al. [2]; Haber & Stornetta [3][4][5]; Feller [8]"], ["Software", "Bitcoin 0.1, released 9 Jan 2009"]],
      note: "The real paper: its first page in this pop-up, all nine pages in the reader, reproduced unchanged from the PDF bitcoin.org serves under the MIT licence.", sources: [SRC.paper, SRC.announce, SRC.byzantine] },
    { key: "genesis", year: 2009.01, when: "3 JAN 2009", title: "BLOCK 0", name: "The genesis block", link: "named", part: "genesis",
      line: "18:15:05 UTC. One transaction, fifty unspendable bitcoin, and a headline from the day's paper.",
      gave: "The first link of the chain", missing: "Nothing. Block 1 followed on 9 January",
      about: "The first block has height 0 and a header time of 3 January 2009, 18:15:05 UTC. Its one transaction pays fifty bitcoin to the address 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa, a reward the software never lets anyone spend, and its coinbase carries the text \"The Times 03/Jan/2009 Chancellor on brink of second bailout for banks\", a headline from that morning's paper that proves the block was not made earlier. The next block came six days later.",
      specs: [["Height", "0"], ["Time", "2009-01-03 18:15:05 UTC"], ["Hash", "000000000019d668…60a8ce26f"], ["Nonce / bits", "2083236893 / 0x1d00ffff"], ["Reward", "50 BTC, unspendable"], ["Size", "285 bytes, 1 transaction"], ["Block 1", "9 Jan 2009"]],
      note: "A dark slab carrying the block's header and its coinbase, cradled between two chrome pylons banded in Bitcoin orange, a chain beginning along its crown. Every value is the block's own.", sources: [SRC.block0] }
  ];
  // The ring: one plinth per entry, or per shared plinth, in the order the entries come (the viewer pages them so).
  const PLINTHS = [];
  const byPlinth = new Map();
  EXHIBITS.forEach((ex, i) => {
    ex.index = i;
    const id = ex.plinth || ex.key;
    if (id === "centre") return;
    if (!byPlinth.has(id)) { const p = { id, model: id, entries: [] }; byPlinth.set(id, p); PLINTHS.push(p); }
    byPlinth.get(id).entries.push(ex);
    ex.plinthIndex = PLINTHS.length - 1;
  });

  // ---------- the room's measure ----------
  // The ring runs round the room from the door's left to its right, by azimuth (degrees from the front toward +x, the
  // door at 180), its gap at the door; the plinths on it `RING` out from the middle, free-standing, with at least 1.5 m
  // of floor between neighbours and 2 m behind them to the wall, so a visitor walks all the way round every one
  // (the room is sized for it, R 21 in timechain-rooms.js, with the benches behind). Every display on the ring stands
  // `BIG` times the museum's size: its piece, its plaque and its plinth's footprint (DEPTH front to back, FACE how far
  // its faces stand from its middle). The plinth's top, TOP, rises less, only as far as the larger plaque needs: a
  // visitor's eye stays where it was, and a top any higher would show them the pieces edge on. The words cut into the
  // faces grow with the faces' height, `WORDS`. The piece stands on a deck `RISE` above the top's front edge, where
  // its label strip stands, so the strip hides nothing low on the piece from that eye. The middle's drum keeps the
  // museum's size.
  const BIG = 1.3, TOP = 1.05, RISE = 0.06, WORDS = 1.2, DEPTH = 1.2 * BIG, FACE = DEPTH / 2 + 0.004, MID_TOP = 0.9, AZ0 = -158, AZ1 = 158, GAP = 1.6;
  // A plaque card: its size on a plinth's front, its centre's height, and the pitch of cards side by side where a
  // plinth carries more than one entry (its front widened to hold them, so every card faces the walk).
  const MID_CARD = { w: 0.94, h: 0.74, y: 0.45, pitch: 1.0 }, CARD = { w: MID_CARD.w * BIG, h: MID_CARD.h * BIG, y: TOP / 2 - 0.02, pitch: MID_CARD.pitch * BIG };
  const widthOf = (p) => (1.2 + (p.entries.length - 1) * MID_CARD.pitch) * BIG;
  // The ring's radius is what gives the plinths, from AZ0 round to AZ1, `GAP` metres of floor between neighbours.
  const RING = (() => { let between = 0; for (let i = 1; i < PLINTHS.length; i++) between += (widthOf(PLINTHS[i - 1]) + widthOf(PLINTHS[i])) / 2; return (between + GAP * (PLINTHS.length - 1)) / ((AZ1 - AZ0) * DEG); })();
  // The ring's pieces are built in `SECTORS` nodes round the ring, so the renderer culls the sectors behind the
  // visitor. `PIECE_GLASS`: how see-through the pieces' glass is, how far it swells and fades about that, and the
  // seconds one such breath takes.
  const SECTORS = 6, PIECE_GLASS = { alpha: 0.34, swell: 0.07, period: 7 };
  // A plinth's first version (timechain-genesis-first.js) takes its piece's place while a visitor stands within
  // `near` metres of it (the reach at which its ring of light rises), the nearest plinth alone, and gives it back
  // beyond `far`; the change takes `time` seconds, under a column of light. `scale`: a first version shown larger.
  // Where the ₿ over the crown leads: the site whose feed it draws.
  const MEMPOOL_URL = "https://mempool.space";
  const FIRST = { near: 3 * BIG, far: 3 * BIG + 0.5, time: 0.45, scale: { byzantine: 1.15 } };
  // The plinth's deck in its own frame (plinthBody): its front and back edges, how far in from them the first version's
  // ring of light keeps, and where the label strip stands along its front.
  const DECK = { front: 0.045 - (DEPTH - 0.09) / 2, back: 0.045 + (DEPTH - 0.09) / 2, margin: 0.05, strip: -0.6 };
  // The inner loop keeps a still strip (3.2 m at the museum's size) between its edge and the plinths' fronts: far
  // enough back that a visitor who steps off toward a plinth has the whole display on screen (model, plaque or cut
  // words) at the default view, on a desktop and on a phone held sideways, and is not carried while reading.
  const TRAV = { r: RING - DEPTH / 2 - 3.2 * BIG - 0.4, w: 0.8, speed: 0.6 };
  // The outer loop, in the lane between the plinths' backs and the benches, the other way round (2008 to 1974) at
  // twice the pace: 1.4 m of still floor behind the plinths, to read their backs from, and over a metre between the
  // lane and the bench.
  const TRAV2 = { r: RING + DEPTH / 2 + 1.4 + 0.4, w: 0.8, speed: 1.2, doorGap: 13 };
  // A flat lit ring (0.55 to 0.8 m) and a lit unit bar along +x, shared by every node that needs one.
  const glowRing = own(() => { const g = RM.helpers.blank(), n = 28, r0 = 0.62, r1 = 0.76; for (let k = 0; k < n; k++) { const a = TAU * k / n, b = TAU * (k + 1) / n; RM.helpers.face(g, [[r0 * Math.sin(a), 0, -r0 * Math.cos(a)], [r1 * Math.sin(a), 0, -r1 * Math.cos(a)], [r1 * Math.sin(b), 0, -r1 * Math.cos(b)], [r0 * Math.sin(b), 0, -r0 * Math.cos(b)]], C.amber, 0.5, [0, 1, 0]); } return noShadow(g); });
  const glowBar = own(() => noShadow(box({ w: 1, h: 0.04, d: 0.04, color: C.amber, emissive: 0.9, offset: { x: 0.5 } })));
  // Two builds of every sector: the near one at full detail, the far one lighter, swapped by
  // the visitor's distance to the sector's nearest plinth (`LOD_NEAR` metres, with a little hysteresis): near from the
  // standing strip and the inner loop, far from the doorway, where the ring's two ends stand 6.5 m off.
  const LOD_NEAR = 5.8, LOD_FAR = 6.4, INSC_GROUPS = 9, INSC_NEAR = 5.8, INSC_FAR = 6.4;
  // The plinths' azimuths: the first at AZ0, the last at AZ1, neighbours half their widths apart plus one even gap.
  const AZ = (() => {
    const span = (AZ1 - AZ0) * DEG * RING;
    let between = 0;
    for (let i = 1; i < PLINTHS.length; i++) between += (widthOf(PLINTHS[i - 1]) + widthOf(PLINTHS[i])) / 2;
    const gap = (span - between) / (PLINTHS.length - 1), out = [AZ0];
    let s = 0;
    for (let i = 1; i < PLINTHS.length; i++) { s += (widthOf(PLINTHS[i - 1]) + widthOf(PLINTHS[i])) / 2 + gap; out.push(AZ0 + s / RING / DEG); }
    return out;
  })();
  const azOf = (i) => AZ[i];
  const headingTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
  const spotOf = (i, r = RING) => { const a = azOf(i) * DEG; return { x: r * Math.sin(a), z: -r * Math.cos(a), az: azOf(i) }; };

  // ---------- geometry ----------
  // The plinth an exhibit stands on, in the room's static mesh: the museum's, dark concrete with an amber band under
  // its top, `w` wide across the walk (1.2 m, or wider for a plinth with cards side by side).
  const plinthBody = (g, w) => {
    g.box(w, TOP, DEPTH, C.concrete, 0, TOP / 2, 0);
    // A line of light on the glass round its foot; a cap that overhangs the lit band under the top; a lit inlay down
    // each front corner.
    g.box(w + 0.11, 0.004, DEPTH + 0.11, C.amber, 0, 0.004, 0, { emissive: 0.55, glow: true });
    g.box(w + 0.04, 0.03, DEPTH + 0.04, "#1d4f63", 0, TOP - 0.03, 0, { emissive: 0.4 });
    g.box(w + 0.07, 0.014, DEPTH + 0.07, "#30343d", 0, TOP - 0.007, 0);
    for (const sx of [-1, 1]) g.box(0.016, TOP - 0.08, 0.016, "#1d4f63", sx * w / 2, 0.02 + (TOP - 0.08) / 2, -DEPTH / 2, { emissive: 0.4 });
    // The deck: a paler inlaid top, and a line of light along its front edge, behind the label strip.
    g.box(w, RISE, DEPTH - 0.09, C.concrete, 0, TOP + RISE / 2, 0.045);
    g.box(w - 0.07, 0.003, DEPTH - 0.16, "#2a2e37", 0, TOP + RISE + 0.0015, 0.045);
    g.box(w - 0.04, 0.01, 0.01, C.glow, 0, TOP + RISE - 0.009, 0.045 - (DEPTH - 0.09) / 2 - 0.004, { emissive: 0.9, glow: true });
  };
  // Every piece stands open on its plinth (no glass cases). The middle's drum is a straight cylinder this radius.
  const MID_R = 1.56;
  // Each entry's piece alone, at the museum's size, for the viewer: the first version built for its plinth (the
  // paper's piece, in the middle, is the paper's own; Satoshi's is the statue, `soloFigure`).
  const viewModel = own(() => EXHIBITS.map((ex) => {
    if (ex.key === "satoshi") return null;
    if (ex.plinth === "centre") {
      const pass = (glass) => RM.solo((k) => GM.model(k, ex.key, 0, { part: ex.part || "main", glass, view: true }));
      const glass = pass(true);
      for (const f of glass.faces) f.glass = PIECE_GLASS.alpha;
      return BL.models.merge(pass(false), glass);
    }
    return GF.settle(RM.solo((k) => GF.model(k, ex.plinth || ex.key, 1, 0, { part: ex.part || "main", view: true })));
  }));

  // A plinth's first version as the room stands it on the plinth (`FIRST`), in the plinth's own frame with its top at
  // y = 0, settled (`GF.settle`) and with a cool ring of light on the deck round its foot. Built in the room's
  // preparation, one plinth a step (`steps`), and kept until the director lets the `timechain` scope go. `firstBuilds`
  // counts the builds of each plinth's first version, never holding one, so a step whose plinth's first version is
  // still kept takes no frame, and one let go is built again.
  const firstBuilds = new Uint32Array(PLINTHS.length);
  const firstPiece = RM.helpers.perRoom((i) => {
    const p = PLINTHS[i], piece = GF.settle(RM.solo((k) => GF.model(k, p.model, FIRST.scale[p.model] || 1, RISE + 0.005, { unit: BIG, lip: RISE })));
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    // The ring round the piece's foot (its parts over the deck, the label strip on the front edge left out), kept on
    // the deck: the deck runs the plinth's width and from `DECK.front` to `DECK.back`.
    for (let v = 0; v < piece.verts.length; v += 3) { if (piece.verts[v + 1] < RISE + 0.012 || piece.verts[v + 2] < DECK.strip) continue; x0 = Math.min(x0, piece.verts[v]); x1 = Math.max(x1, piece.verts[v]); z0 = Math.min(z0, piece.verts[v + 2]); z1 = Math.max(z1, piece.verts[v + 2]); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, r = Math.min(0.55 * Math.hypot(x1 - x0, z1 - z0), widthOf(p) / 2 - DECK.margin - Math.abs(cx), cz - DECK.front - DECK.margin, DECK.back - cz - DECK.margin);
    const foot = RM.solo((k) => k.torus(r, 0.006, C.glow, cx, RISE + 0.008, cz, { emissive: 1, glow: true, seg: 64, sides: 4 }));
    firstBuilds[i]++;
    return BL.models.merge(piece, noShadow(foot));
  });

  // ---------- pictures ----------
  // A plaque, `k` times its 560 by 440 size: the date and title, the name, the line, how it connects, and two rows:
  // what it gave Bitcoin and what was still missing.
  const PLAQUE = { w: 560, h: 440 };
  const linesOf = (ctx, text, maxW) => {
    let line = "", n = 1;
    for (const word of text.split(" ")) { const t = line ? line + " " + word : word; if (ctx.measureText(t).width > maxW && line) { n++; line = word; } else line = t; }
    return n;
  };
  const wrap = (ctx, text, x, y, maxW, lh, max = 4) => {
    const words = text.split(" ");
    let line = "", n = 0;
    for (let i = 0; i < words.length; i++) {
      const word = words[i], t = line ? line + " " + word : word;
      if (ctx.measureText(t).width > maxW && line) {
        ctx.fillText(line, x, y); y += lh; line = word;
        // The last row takes everything left, cut with an ellipsis if it still does not fit.
        if (++n >= max - 1) { line = words.slice(i).join(" "); while (line.length > 1 && ctx.measureText(line + "…").width > maxW) line = line.slice(0, -1).trimEnd(); if (line !== words.slice(i).join(" ")) line += "…"; break; }
      } else line = t;
    }
    ctx.fillText(line, x, y);
    return y + lh;
  };
  const paintPlaque = (ctx, ex, k = 1) => {
    const W = PLAQUE.w * k, H = PLAQUE.h * k, link = LINK[ex.link];
    // A dark plate, a shade paler toward its top, in a lit frame with a hairline inside it and a bracket at each corner.
    { const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#1b212a"); bg.addColorStop(0.45, C.ink); bg.addColorStop(1, C.ink); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
    ctx.strokeStyle = C.amber; ctx.lineWidth = 4 * k; ctx.strokeRect(5 * k, 5 * k, W - 10 * k, H - 10 * k);
    ctx.strokeStyle = "rgba(98,207,224,.28)"; ctx.lineWidth = k; ctx.strokeRect(12.5 * k, 12.5 * k, W - 25 * k, H - 25 * k);
    ctx.fillStyle = C.glowText;
    for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const x = cx ? W - 3 * k : 3 * k, y = cy ? H - 3 * k : 3 * k, sx = cx ? -1 : 1, sy = cy ? -1 : 1; ctx.fillRect(Math.min(x, x + sx * 26 * k), Math.min(y, y + sy * 5 * k), 26 * k, 5 * k); ctx.fillRect(Math.min(x, x + sx * 5 * k), Math.min(y, y + sy * 26 * k), 5 * k, 26 * k); }
    // A rule under the date and title, and one over the two rows at the foot.
    ctx.fillStyle = "rgba(98,207,224,.35)"; ctx.fillRect(28 * k, 66 * k, 504 * k, 1.5 * k); ctx.fillRect(28 * k, 296 * k, 504 * k, 1.5 * k);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    // The date and title in the sign font, smaller where they would run off the plaque.
    const head = `${ex.when} · ${ex.title}`;
    let size = 26 * k;
    while (size > 15 * k && P.pixWidth(head, size) > 504 * k) size -= k;
    P.pix(ctx, head, 28 * k, 48 * k, size, C.amberText, "left");
    fitRec(ex.key, "plaque · date and title", PLAQUE.w * k, P.pixWidth(head, size));
    ctx.fillStyle = C.white; P.fit(ctx, ex.name, 500 * k, 700, 32 * k); ctx.fillText(ex.name, 28 * k, 106 * k);
    // The line, shrunk a step at a time until it fits the plaque's three rows.
    ctx.fillStyle = "#d4c8b6";
    let lineSize = 22 * k;
    while (lineSize > 16 * k && (ctx.font = P.font(400, lineSize), linesOf(ctx, ex.line, 500 * k) > 3)) lineSize -= k;
    wrap(ctx, ex.line, 28 * k, 146 * k, 500 * k, 28 * k, 3);
    // How it connects: a lit badge.
    const word = ex.link === "cite" ? `${link.word} [${ex.ref}]` : link.word;
    ctx.fillStyle = link.color; P.roundRect(ctx, 28 * k, 252 * k, (P.pixWidth(word, 13 * k) + 28 * k), 26 * k, 5 * k); ctx.fill();
    P.pix(ctx, word, 42 * k, 265 * k, 13 * k, C.ink, "left");
    ctx.font = P.font(500, 18 * k); ctx.fillStyle = "#eba043"; ctx.fillText("GAVE BITCOIN", 28 * k, 322 * k);
    ctx.fillStyle = C.white; ctx.font = P.font(400, 20 * k); wrap(ctx, ex.gave, 28 * k, 346 * k, 504 * k, 24 * k, 2);
    ctx.fillStyle = "#eba043"; ctx.font = P.font(500, 18 * k); ctx.fillText("STILL MISSING", 28 * k, 390 * k);
    ctx.fillStyle = C.white; ctx.font = P.font(400, 20 * k); wrap(ctx, ex.missing, 28 * k, 414 * k, 504 * k, 24 * k, 1);
  };
  // The cards as the renderer draws them: not one picture each, but a few bands. A band is one geometry holding
  // many cards and one canvas the renderer maps round the middle by angle (its `curve`, as the museum's sign band
  // upstairs is mapped): a card at azimuth `az` lands at arc length `R * az` along the canvas, whatever its radius,
  // so flat cards on the ring's plinth fronts and curved cards on the middle's round plinth both map exactly. Each
  // card is drawn at `PPM` pixels a metre; a band's canvas spans its first card to its last, at most `MAX_SPAN` m, so
  // the ring's 25 fronts take four bands and the middle's two cards one.
  // `cards`: [{ ex, az (degrees), r (radius of the card's centre), curved }]; `R` the mapping radius; `y` the card's
  // centre height in the node's frame. Returns the node's place (world) and its geometry.
  // The ring's cards are drawn at the size their plaque is designed in (560 pixels across), so nothing on them is
  // scaled down.
  const PPM = 400, RING_PPM = 460, MAX_SPAN = 17;
  const band = (cards, R, y, outside = false, painter = paintPlaque, size = CARD, ppm = RING_PPM) => {
    const azMid = (cards[0].az + cards[cards.length - 1].az) / 2, theta = -azMid * DEG, c = Math.cos(theta), sn = Math.sin(theta);
    const px = -R * Math.sin(theta), pz = -R * Math.cos(theta);
    const local = (w) => { const dx = w[0] - px, dz = w[2] - pz; return [c * dx - sn * dz, w[1], sn * dx + c * dz]; };
    const uOf = (l) => Math.atan2(l[0], R - l[2]) * R;
    const geo = RM.helpers.blank(), spans = [];
    for (const card of cards) {
      // A flat card lies in its plinth's front plane (`face`, the plinth's azimuth): turned to its own radius instead,
      // a card off the plinth's middle dips into the plinth at one end, which hides that end of its text.
      const a = card.az * DEG, f = (card.face === undefined ? card.az : card.face) * DEG, t = [Math.cos(f), 0, Math.sin(f)], n = [-Math.sin(f), 0, Math.cos(f)];
      const cx = card.r * Math.sin(a), cz = -card.r * Math.cos(a), y0 = y - size.h / 2, y1 = y + size.h / 2;
      const normal = [c * n[0] - sn * n[2], 0, sn * n[0] + c * n[2]];
      if (!card.curved) {
        const pts = [[cx - t[0] * size.w / 2, y0, cz - t[2] * size.w / 2], [cx + t[0] * size.w / 2, y0, cz + t[2] * size.w / 2], [cx + t[0] * size.w / 2, y1, cz + t[2] * size.w / 2], [cx - t[0] * size.w / 2, y1, cz - t[2] * size.w / 2]].map(local);
        RM.helpers.face(geo, pts, [255, 255, 255], 0.9, normal);
        const ua = uOf(pts[0]), ub = uOf(pts[1]);
        spans.push({ ex: card.ex, u0: Math.min(ua, ub), u1: Math.max(ua, ub), flip: ua > ub });
      } else {
        // Round the plinth: strips of its arc, the card's width as arc length.
        const half = size.w / 2 / card.r, N = 10;
        const at = (b, yy) => local([card.r * Math.sin(b), yy, -card.r * Math.cos(b)]);
        for (let k = 0; k < N; k++) {
          const b0 = a - half + 2 * half * k / N, b1 = a - half + 2 * half * (k + 1) / N, bm = (b0 + b1) / 2, o = outside ? -1 : 1, nm = [-o * Math.sin(bm), 0, o * Math.cos(bm)];
          const pts = [at(b0, y0), at(b1, y0), at(b1, y1), at(b0, y1)];
          RM.helpers.face(geo, outside ? pts.reverse() : pts, [255, 255, 255], 0.9, [c * nm[0] - sn * nm[2], 0, sn * nm[0] + c * nm[2]]);
        }
        const ua = uOf(at(a - half, y)), ub = uOf(at(a + half, y));
        spans.push({ ex: card.ex, u0: Math.min(ua, ub), u1: Math.max(ua, ub), flip: ua > ub });
      }
    }
    const u0 = spans[0].u0 - 0.01, u1 = spans[spans.length - 1].u1 + 0.01, w = Math.ceil((u1 - u0) * ppm), k = size.w * ppm / PLAQUE.w, h = Math.round(PLAQUE.h * k);
    const canvas = CH.canvas(w, h), ctx = canvas.getContext("2d");
    ctx.fillStyle = C.ink; ctx.fillRect(0, 0, w, h);
    // Seen from outside the curve, arc length runs to the viewer's left: each card is painted mirrored within its own
    // span (never the whole canvas, which would swap the cards' places).
    for (const sp of spans) {
      const x0 = (sp.u0 - u0) * ppm, kk = (sp.u1 - sp.u0) * ppm / PLAQUE.w;
      ctx.save();
      // A card whose geometry runs the other way along the band (its corners' arc lengths reversed), or one seen from
      // outside the curve, is painted mirrored within its own span, so its words read the right way round.
      if (sp.flip !== outside) { ctx.translate(Math.round(x0 + (sp.u1 - sp.u0) * ppm), 0); ctx.scale(-kk / k, 1); } else { ctx.translate(Math.round(x0), 0); ctx.scale(kk / k, 1); }
      painter(ctx, sp.ex, k); ctx.restore();
    }
    geo.castShadow = false;
    geo.imageSurface = { canvas, version: 1, rect: [u0, y - size.h / 2, w / ppm, h / (PLAQUE.h * k) * size.h], curve: [R, 0, 0], tessellated: true };
    return { geo: noShadow(geo), x: px, z: pz, ry: theta };
  };
  // The ring's cards, in walk order, cut into bands of at most MAX_SPAN m of arc.
  const ringBands = (cards, R, y, outside = false, painter = paintPlaque) => {
    const out = [];
    let start = 0;
    for (let i = 1; i <= cards.length; i++) {
      if (i === cards.length || (cards[i].az - cards[start].az) * DEG * R + CARD.w > MAX_SPAN) { out.push({ ...band(cards.slice(start, i), R, y, outside, painter), first: cards[start].plinth, last: cards[i - 1].plinth }); start = i; }
    }
    return out;
  };

  // ---------- meanwhile in the world: the clippings on the plinths' backs ----------
  // For each exhibit's year, three or four real events in our own short words (a heading and a line each; the heading
  // alone is cut into the plinth), each checked against its source.
  const CLIPPINGS = {
    tcpip: ["1974", [["THE TERRACOTTA ARMY IS FOUND", "March, near Xi'an: farmers digging a well strike the first of thousands of clay soldiers."], ["NIXON RESIGNS OVER WATERGATE", "9 August: the first US president to leave office, after the tapes came out."], ["FIRST BARCODE SCANNED AT A CHECKOUT", "26 June, Troy, Ohio: a pack of chewing gum, the first item sold by UPC."]]],
    dh: ["1976", [["CONCORDE CARRIES ITS FIRST PASSENGERS", "21 January: London and Paris to the Gulf and Rio at twice the speed of sound."], ["VIKING 1 LANDS ON MARS", "20 July: the first lasting landing on another planet sends back pictures."], ["TWO FRIENDS START APPLE COMPUTER", "1 April, in a California garage, to sell a hand-built circuit board."]]],
    rsa: ["1977", [["STAR WARS OPENS", "25 May: in 32 cinemas, then everywhere."], ["VOYAGERS LEAVE FOR THE OUTER PLANETS", "Launched 20 August and 5 September; both are still sending."], ["THREE HOME COMPUTERS IN ONE YEAR", "The Apple II, the Commodore PET and the TRS-80 all go on sale."]]],
    merkle: ["1980", [["MOUNT ST. HELENS ERUPTS", "18 May: the biggest volcanic eruption in the modern history of the United States."], ["PAC-MAN REACHES THE ARCADES", "Released in Japan in May; it becomes the best-selling arcade game of all."], ["CNN SIGNS ON", "1 June: the first channel to carry news all day."]]],
    byzantine: ["1982", [["THE COMPUTER IS MACHINE OF THE YEAR", "Time gives its person-of-the-year cover to the personal computer for 1982."], ["ARPANET SETS A DATE FOR TCP/IP", "The switch is set for 1 January 1983; the old protocol goes off that day."], ["THE COMMODORE 64 GOES ON SALE", "August: the home computer that sells more than any other single model."]]],
    chaum: ["1982", [["THE FALKLANDS WAR ENDS", "14 June: the Argentine surrender at Stanley after ten weeks."], ["THE FIRST COMPACT DISC PLAYERS SOLD", "October, in Japan: music as digits, the end of the needle in sight."], ["A SMILE MADE OF PUNCTUATION", "19 September: :-) proposed on a university message board to mark a joke."]]],
    ecc: ["1985", [["THE FIRST .COM IS REGISTERED", "15 March: symbolics.com, the first commercial name on the Internet."], ["WINDOWS 1.0 SHIPS", "20 November, after two years of promises: windows on a PC, side by side."], ["LIVE AID PLAYS TO THE WORLD", "13 July: two stadiums, sixteen hours, a global broadcast for famine relief."]]],
    may88: ["1988", [["IRC IS WRITTEN IN FINLAND", "August: chat rooms across the Internet, in text, in real time."], ["A WORM BRINGS DOWN THE INTERNET", "2 November: the Morris worm halts thousands of machines; the first conviction follows."], ["THE FIRST FIBRE CABLE CROSSES THE ATLANTIC", "December: TAT-8 carries 40,000 calls at once between the US and Europe."]]],
    digicash: ["1989", [["THE BERLIN WALL COMES DOWN", "9 November: crossings open after 28 years."], ["A PROPOSAL FOR A WEB OF DOCUMENTS", "March, at CERN: a memo on linked information, 'vague but exciting'."], ["HUBBLE REACHES ORBIT", "24 April 1990: a telescope above the air, flawed mirror and all."]]],
    timestamp: ["1990", [["IRAQ INVADES KUWAIT", "2 August: the crisis that becomes the Gulf War."], ["THE FIRST WEB PAGE IS SERVED", "December, at CERN: one computer, one page, the first browser."], ["GERMANY IS ONE COUNTRY AGAIN", "3 October: reunification, less than a year after the Wall."]]],
    pgp: ["1991", [["THE WEB IS OPENED TO EVERYONE", "6 August: the project is announced on a newsgroup and its code released."], ["A STUDENT POSTS A FREE OPERATING SYSTEM", "25 August: Linux, 'just a hobby, won't be big and professional'."], ["THE SOVIET UNION DISSOLVES", "26 December: fifteen states where there was one."]]],
    cypherpunks: ["1992", [["THE FIRST TEXT MESSAGE", "3 December: 'Merry Christmas', sent from a computer to a phone."], ["WINDOWS 3.1 SHIPS", "6 April: the version that put Windows on most office desks."], ["THE FIRST WEB SERVER OUTSIDE EUROPE", "12 December 1991 to 1992: Stanford's linear accelerator puts up America's first web page; the web counts 26 servers by year's end."]]],
    cybercash: ["1994", [["THE FIRST SECURE PURCHASE ONLINE", "11 August: a CD bought over the web with an encrypted card number."], ["AMAZON IS FOUNDED", "5 July: an online bookshop run from a Seattle garage."], ["THE CHANNEL TUNNEL OPENS", "6 May: Britain and France joined by rail under the sea."]]],
    mint: ["1996", [["DOLLY THE SHEEP IS BORN", "5 July: the first mammal cloned from an adult cell, announced the next year."], ["A LAW FOR THE NET'S CONTENT", "February: the Communications Decency Act is signed, and challenged at once."], ["THE NINTENDO 64 LAUNCHES", "23 June, in Japan: 3D games in the living room."]]],
    egold: ["1996", [["FREE WEB MAIL FOR ALL", "4 July: Hotmail launches, an inbox in any browser."], ["A COMPUTER TAKES A GAME OFF KASPAROV", "10 February: Deep Blue wins the first game of their match; the champion wins the match."], ["THE PALM PILOT SHIPS", "March: a pocket computer that syncs with the desk."]]],
    hashcash: ["1997", [["DEEP BLUE BEATS THE WORLD CHAMPION", "11 May: a machine wins a chess match against Kasparov."], ["HONG KONG RETURNS TO CHINA", "1 July: the end of 156 years of British rule."], ["A ROVER DRIVES ON MARS", "4 July: Pathfinder lands and Sojourner rolls off."]]],
    szabo97: ["1997", [["GOOGLE.COM IS REGISTERED", "15 September: a search engine built on who links to whom."], ["THE KYOTO PROTOCOL IS AGREED", "11 December: the first binding targets on greenhouse gases."], ["NETFLIX IS FOUNDED", "29 August: DVDs by post, with no late fees."]]],
    titles: ["1998", [["GOOGLE IS INCORPORATED", "4 September, in a Menlo Park garage."], ["THE IMAC GOES ON SALE", "15 August: a computer in translucent blue, with no floppy drive."], ["THE SPACE STATION'S FIRST MODULE FLIES", "20 November: Zarya, launched from Baikonur."]]],
    bmoney: ["1998", [["A COPYRIGHT LAW FOR THE DIGITAL AGE", "28 October: the DMCA is signed, making it an offence to break a digital lock."], ["WINDOWS 98 RELEASED", "25 June: the web browser built into the desktop."], ["THE COMPANY THAT BECOMES PAYPAL IS FOUNDED", "December: Confinity, to beam money between handhelds."]]],
    keiser: ["1999", [["THE EURO IS BORN", "1 January: eleven currencies become one, on paper first; the notes follow in 2002."], ["NAPSTER LAUNCHES", "June: music shared from one PC to another, millions of them."], ["THE WORLD BRACES FOR Y2K", "December: the two-digit year is checked in every computer on earth."]]],
    dotcom: ["2000", [["THE NASDAQ PEAKS, THEN FALLS", "10 March: 5,048 at the close; the dot-com bubble bursts over the year that follows."], ["AOL BUYS TIME WARNER", "10 January: the biggest merger yet, a web company taking over a media giant."], ["PETS.COM CLOSES", "November: the sock puppet goes dark, nine months after its Super Bowl advert."]]],
    rpow: ["2004", [["GOOGLE GOES PUBLIC", "19 August: the IPO prices at $85 a share, by auction."], ["A SOCIAL NETWORK OPENS AT HARVARD", "4 February: thefacebook.com, for students only at first."], ["GMAIL LAUNCHES", "1 April: a gigabyte of mail, free; many took it for a joke."]]],
    bitgold: ["2005", [["YOUTUBE IS FOUNDED", "14 February: the first video, at the zoo, is uploaded in April."], ["HURRICANE KATRINA STRIKES", "29 August: New Orleans floods after the levees fail."], ["THE XBOX 360 LAUNCHES", "22 November: the first of the high-definition consoles."]]],
    hughes93: ["1993", [["THE PENTIUM PROCESSOR ARRIVES", "22 March: Intel's fifth generation, and the first with a name."], ["MOSAIC PUTS PICTURES ON THE WEB", "22 April: a browser anyone can install; the web takes off."], ["DOOM IS RELEASED", "10 December: shareware by upload, the game that made a generation of PCs."]]],
    cyphernomicon: ["1994", [["THE FIRST BANNER ADVERTISEMENT", "27 October: a strip across the top of a web magazine; the web learns to sell."], ["THE PLAYSTATION LAUNCHES", "3 December, in Japan: games on CD, in 3D."], ["NETSCAPE SHIPS ITS NAVIGATOR", "15 December: the browser that brings the web to the shops."]]],
    bittorrent: ["2001", [["MAC OS X SHIPS", "24 March: Unix under the Macintosh."], ["NAPSTER IS SHUT DOWN", "July: a court order ends the service that made file sharing a household word."], ["APPLE ANNOUNCES THE IPOD", "23 October: a thousand songs in your pocket."]]],
    dht: ["2001", [["THE SEGWAY IS UNVEILED", "3 December: a self-balancing scooter, after a year of rumour."], ["THE CODE RED WORM SPREADS", "19 July: hundreds of thousands of web servers infected in hours."], ["WINDOWS XP RELEASED", "25 October: the desktop most of the decade would run on."]]],
    games: ["2001", [["THE GAMECUBE LAUNCHES", "14 September, in Japan: Nintendo's disc console."], ["WIKIPEDIA GOES LIVE", "15 January: an encyclopedia anyone can edit."], ["THE XBOX LAUNCHES", "15 November: a PC maker's console, with a hard disk inside."]]],
    lr: ["2006", [["TWITTER OPENS TO THE PUBLIC", "15 July: messages of 140 characters, sent to everyone at once."], ["PLUTO IS NO LONGER A PLANET", "24 August: astronomers vote it a dwarf planet."], ["THE WII LAUNCHES", "19 November: a console played by waving the controller."]]],
    genesis: ["2009", [["A JET LANDS ON THE HUDSON", "15 January: US Airways 1549 loses both engines to geese; all 155 aboard are saved."], ["OBAMA TAKES OFFICE", "20 January: the 44th US president is sworn in before a record crowd in Washington."], ["KEPLER LEAVES TO COUNT PLANETS", "7 March: NASA's telescope launches to look for Earth-sized worlds round other stars."]]]
  };
  // The year's facts, cut into a plinth's back (or, in layout B, a plate on the wall) in the quotes' own style: a
  // heading "1998 · ELSEWHERE IN THE WORLD" and three or four short bullet points, no masthead and no paper.
  const factsOf = (p) => { const out = []; for (const ex of p.entries) { const c = CLIPPINGS[ex.key] || CLIPPINGS[p.id]; if (c) for (const f of c[1]) out.push([c[0], f[0]]); } const years = [...new Set(out.map((f) => f[0]))]; return { years: years.length > 1 ? `${years[0]} - ${years[years.length - 1]}` : years[0] || "", facts: out.map((f) => f[1]).slice(0, 4) }; };
  const engraveFacts = (g, p, faceW, yTop, label = "back") => {
    const { years, facts } = factsOf(p);
    let fit = null, use = facts.slice();
    while (!fit && use.length) {
      fit = layout([[`${years} · ELSEWHERE IN THE WORLD`, 0.85, 0], ...use.map((f) => [`· ${f}`, 1, 0.004])], faceW, yTop, yTop);
      if (!fit) use = use.slice(0, -1);
    }
    const rec = { plinth: p.id, face: label, faceW, fits: !!fit, facts: use.length };
    if (!CUT.panels) INSCRIPTIONS.push(rec);
    if (!fit) return;
    const lines = fit.lines.map((l, i) => i === 0 ? [l[0], l[1], l[2], C.amberText, 0.25] : l);
    rec.w = fit.w; rec.h = cut(g, lines, yTop, fit.w); rec.px = fit.px;
  };


  // ---------- Satoshi's words on the plinths' sides ----------
  // One exact quotation per plinth, matched to its technology, cut into the plinth's two side faces (the front keeps
  // the plaque, the back the clipping), attributed with its date.
  const WP = "the whitepaper, 31 Oct 2008", P2P = "P2P Foundation, 11 Feb 2009", LIST = (d) => `the cryptography list, ${d} Nov 2008`;
  const QUOTES = {
    tcpip: ["Nodes can leave and rejoin the network at will, accepting the longest proof-of-work chain as proof of what happened while they were gone.", WP],
    dh: ["Digital signatures provide part of the solution, but the main benefits are lost if a trusted third party is still required to prevent double-spending.", WP],
    rsa: ["We define an electronic coin as a chain of digital signatures.", WP],
    merkle: ["Transactions are hashed in a Merkle Tree, with only the root included in the block's hash.", WP],
    byzantine: ["The proof-of-work chain is a solution to the Byzantine Generals' Problem.", LIST(13)],
    chaum: ["What is needed is an electronic payment system based on cryptographic proof instead of trust, allowing any two willing parties to transact directly with each other without the need for a trusted third party.", WP],
    ecc: ["Each owner transfers the coin to the next by digitally signing a hash of the previous transaction and the public key of the next owner and adding these to the end of the coin.", WP],
    may88: ["Yes, but we can win a major battle in the arms race and gain a new territory of freedom for several years.", LIST(6)],
    digicash: ["I hope it's obvious it was only the centrally controlled nature of those systems that doomed them. I think this is the first time we're trying a decentralized, non-trust-based system.", P2P],
    timestamp: ["The solution we propose begins with a timestamp server.", WP],
    pgp: ["The public can see that someone is sending an amount to someone else, but without information linking the transaction to anyone.", WP],
    cypherpunks: ["It's very attractive to the libertarian viewpoint if we can explain it properly. I'm better with code than with words though.", LIST(14)],
    cybercash: ["Commerce on the Internet has come to rely almost exclusively on financial institutions serving as trusted third parties to process electronic payments.", WP],
    mint: ["The problem of course is the payee can't verify that one of the owners did not double-spend the coin.", WP],
    egold: ["The root problem with conventional currency is all the trust that's required to make it work. The central bank must be trusted not to debase the currency, but the history of fiat currencies is full of breaches of that trust.", P2P],
    hashcash: ["Proof-of-work is essentially one-CPU-one-vote.", WP],
    szabo97: ["The design supports a tremendous variety of possible transaction types that I designed years ago. Escrow transactions, bonded contracts, third party arbitration, multi-party signature, etc.", "bitcointalk, 17 Jun 2010"],
    titles: ["The only way to confirm the absence of a transaction is to be aware of all transactions.", WP],
    bmoney: ["The network itself requires minimal structure. Messages are broadcast on a best effort basis.", WP],
    keiser: ["While the system works well enough for most transactions, it still suffers from the inherent weaknesses of the trust based model.", WP],
    dotcom: ["A lot of people automatically dismiss e-currency as a lost cause because of all the companies that failed since the 1990's.", P2P],
    p2p: ["Governments are good at cutting off the heads of a centrally controlled networks like Napster, but pure P2P networks like Gnutella and Tor seem to be holding their own.", LIST(6)],
    rpow: ["Once the CPU effort has been expended to make it satisfy the proof-of-work, the block cannot be changed without redoing the work.", WP],
    bitgold: ["Bitcoin is an implementation of Wei Dai's b-money proposal on Cypherpunks in 1998 and Nick Szabo's Bitgold proposal.", "bitcointalk, 20 Jul 2010"],
    lr: ["Banks must be trusted to hold our money and transfer it electronically, but they lend it out in waves of credit bubbles with barely a fraction in reserve.", P2P],
    genesis: ["The root problem with conventional currency is all the trust that's required to make it work.", P2P]
  };
  // Cut letters: the island's pixel glyphs as geometry, pale on the concrete, a shade behind them for the cut. Every
  // block is laid out by measure: lines wrapped to the face's width inside an 8 % margin each side, the size reduced
  // only down to a legible floor (`PX_MIN`), and each block's box recorded (`INSCRIPTIONS`) for the overflow audit.
  const PX_MIN = 0.0046, PX_MAX = 0.0062, MARGIN = 0.11;
  const INSCRIPTIONS = [];
  // Every other line of words with a width to keep (cards, screens, the door's inscription) is
  // measured where it is made and added to the same table: `w` against `faceW`, both in that surface's own unit.
  const FIT_SEEN = new Set();
  const fitRec = (plinth, face, faceW, w, limit = 0.92) => { const key = `${plinth}|${face}`; if (FIT_SEEN.has(key)) return; FIT_SEEN.add(key); INSCRIPTIONS.push({ plinth, face, faceW, w, limit, fits: w <= faceW * limit + 1e-6 }); };
  const widthOfText = (t, px) => BL.jumbotron.text.measureText(t, px);
  const wrapTo = (text, px, maxW) => { const lines = []; let line = ""; for (const w of text.split(" ")) { const t = line ? `${line} ${w}` : w; if (widthOfText(t, px) > maxW && line) { lines.push(line); line = w; } else line = t; } lines.push(line); return lines; };
  // Lines for `blocks` ([text, sizeFactor, lead]) at the largest size from PX_MAX down to PX_MIN that fits the face.
  const layout = (blocks, faceW, faceH, yTop) => {
    const maxW = faceW * (1 - 2 * MARGIN);
    for (let px = PX_MAX; px >= PX_MIN - 1e-9; px -= 0.0002) {
      const lines = [];
      // Each line keeps which block it came from (its sixth place), so a block that wraps is coloured whole.
      blocks.forEach(([text, k, lead], bi) => { for (const t of wrapTo(text, px * k, maxW)) lines.push([t, px * k, lead || 0, undefined, undefined, bi]); });
      const h = lines.reduce((a, l) => a + l[1] * 10 + l[2], 0);
      const wide = Math.max(...lines.map((l) => widthOfText(l[0], l[1])));
      if (wide <= maxW && h <= yTop - faceH * MARGIN) return { lines, px, w: wide, h };
    }
    return null;
  };
  // A block of lines cut into a face: a dark inset panel on the stone first (`w` wide), a shadow copy of each line, then
  // the line itself in bright cream, lit, so it reads from the moving floor.
  // The words are most of the room's triangles, so they are cut in two passes: `CUT.panels` lays only the dark panels
  // (in the room's static mesh, seen from anywhere), and the other pass only the words (in a node per group of plinths,
  // shown to a visitor near enough to read them).
  const CUT = { panels: false };
  const cut = (g, lines, yTop, w = 0) => {
    let h = 0; for (const [, px, lead] of lines) h += lead + px * 10;
    if (CUT.panels) { if (w) g.box((w + 0.1) * WORDS, (h + 0.06) * WORDS, 0.002, "#0a0c10", 0, (yTop - h / 2 + 0.03) * WORDS, 0.0025); return h; }
    let y = yTop;
    for (const [t, px, lead, color, e] of lines) { y -= lead; g.add(RM.helpers.litWord(t, px * WORDS, color || "#f1e9d6", e === undefined ? 0.42 : e), 0, y * WORDS, -0.002, { glow: true }); y -= px * 10; }
    return yTop - y;
  };
  const engrave = (g, key, faceW, yTop, label = "") => {
    const q = QUOTES[key];
    if (!q) return;
    const fit = layout([[q[0].toUpperCase(), 1], [`- SATOSHI NAKAMOTO, ${q[1].toUpperCase()}`, 0.75, 0.012]], faceW, yTop, yTop);
    const rec = { plinth: key, face: label, faceW, fits: !!fit };
    if (!CUT.panels) INSCRIPTIONS.push(rec);
    if (!fit) return;
    const lines = fit.lines.map((l) => l[5] === 1 ? [l[0], l[1], l[2], C.amberText, 0.25] : l);
    rec.w = fit.w; rec.h = cut(g, lines, yTop, fit.w); rec.px = fit.px;
  };

  // ---------- pictures: the dome and the crown ----------
  // The dome is the timeline: one axis, a lit band bent round the room `over` degrees above the screen's edge, from
  // 1974 over the first plinth to 2008 over the last, every event a branch off it in walk order over its own plinth,
  // up and down the dome by turns and a short branch then a far one, so no two chips crowd, its date and title on a
  // chip at the branch's end with its name under them; the decades named along the band; and at 2008 the band turns
  // up the dome's meridian to the cap over the crown, where the paper and the block stand under the room's own mark.
  // The dome's canvas is a column an azimuth and a row a height, so a thing drawn square there is drawn with the
  // canvas's stretch at that height undone (`at`).
  // The band `over` degrees above the screen's edge; the branches in five reaches, up and down by turns and short,
  // middle and far, so no two chips crowd; the chip `chip` metres beyond the node: DATE · TITLE alone (the names are
  // on the plaques).
  const BAND = { at: 15, reaches: [[1, 1.7], [-1, 1.7], [1, 3.6], [-1, 3.4], [1, 5.5]], chip: 1.0 };
  // Every ceiling label's box in the dome canvas's pixels, for the overlap check (`BL.timechainGenesis.ceilingBoxes`).
  const CEILING_BOXES = [];
  // The cap is the mark's own ring (`rIn` metres out, `ring` wide) and what lies inside it, and ends at the ring's
  // outer edge, so the dome's stars carry on round it; `el` is the height the mark hangs from and the stream's dots
  // turn in at.
  const CAP = { el: 68, px: 1024, rIn: 4.9, ring: 0.075 };
  // The ₿'s cell: a bevelled lit cube in Bitcoin orange (a cube with a brighter inset on every face).
  // The ₿'s block at nine heats, from a dark ember to white-hot: the mark fills from dim to bright through each block
  // interval by its blocks stepping up through them, each at its own moment (nine geometries, so nine records).
  // The mark's tile: one unit square shared by every square of the mosaic (each node scaled to its own side), in
  // three finishes the animator swaps between: white at rest, orange once its transaction has landed, hot for a
  // landing's spark and a block's flash. A dark rim round a lit face, proud of it above and below.
  const markTile = (color, e) => own(() => noShadow(BL.models.merge(box({ w: 1, h: 1, d: 1, color: "#15171d" }), box({ w: 0.93, h: 1.1, d: 0.93, color, emissive: e }))));
  const MARK_TILE = { white: markTile("#dde2ea", 0.5), orange: markTile("#ee8a14", 0.78), hot: markTile("#ffc35c", 1) };
  const paintDome = (ctx, D, L) => {
    const e0 = ROOMS.edgeEl(L, 0) / DEG, B = BAND.at, perM = 1 / (L.R * DEG), x = D.x, y = D.y;
    D.sky(ctx, [[90, "#0a0b11"], [e0, C.ceiling]]);
    const r = P.rng(2008), s0 = Math.sin(e0 * DEG);
    ctx.fillStyle = "rgba(255,248,235,.4)";
    for (let i = 0; i < 900; i++) { const el = Math.asin(s0 + r() * (1 - s0)) / DEG; ctx.fillRect(x(-180 + 360 * r()), y(el), 2 * D.perX(el) / D.perY(el), 2); }
    // Square drawing at a place on the dome: `draw` gets the pixels a metre there.
    const at = (az, el, draw) => { ctx.save(); ctx.translate(x(az), y(el)); ctx.scale(D.perX(el) / D.perY(el), 1); draw(D.perY(el)); ctx.restore(); };
    // A line along a circle of latitude, and one up a meridian, each `metres` thick.
    const along = (el, a0, a1, metres, color) => { const h = metres * D.perY(el); ctx.fillStyle = color; ctx.fillRect(x(a0), y(el) - h / 2, x(a1) - x(a0), h); };
    const up = (az, el0, el1, metres, color) => { const w = metres * D.perX((el0 + el1) / 2); ctx.fillStyle = color; ctx.fillRect(x(az) - w / 2, Math.min(y(el0), y(el1)), w, Math.abs(y(el1) - y(el0))); };
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    // The band, from a little before the first plinth to a little past the last: a broad dark stripe with the lit
    // axis down its middle, and a hairline either side.
    const d0 = AZ0 - 9, d1 = AZ1 + 7, hw = 0.55 * perM;
    along(B, d0, d1, 1.1, rgba(C.amber, 0.13));
    along(B - hw, d0, d1, 0.025, rgba(C.glow, 0.5)); along(B + hw, d0, d1, 0.025, rgba(C.glow, 0.5));
    along(B, d0, d1, 0.09, C.glow);
    // The ends: 1974 where the walk begins, 2008 where the band turns up.
    const end = (az, word) => at(az, B, (s) => { ctx.fillStyle = C.ceiling; ctx.beginPath(); ctx.arc(0, 0, 0.8 * s, 0, TAU); ctx.fill(); ctx.strokeStyle = C.glow; ctx.lineWidth = 0.06 * s; ctx.stroke(); P.pix(ctx, word, 0, 0, 0.34 * s, C.glowText); });
    end(d0, "1974"); end(d1, "2009");
    CEILING_BOXES.length = 0;
    const box = (label, az, el, wM, hM) => { const sx = D.perX(el), sy = D.perY(el); CEILING_BOXES.push({ label, x0: x(az) - wM / 2 * sx, x1: x(az) + wM / 2 * sx, y0: y(el) - hM / 2 * sy, y1: y(el) + hM / 2 * sy }); };
    // The decades: a tick across the band where each begins along the walk, its name just under the band.
    const firstOf = (year) => PLINTHS.findIndex((p) => p.entries[0].year >= year);
    const starts = [[d0, "THE 1970S"], ...[1980, 1990, 2000].map((yr) => { const i = firstOf(yr); return [azOf(i) - (azOf(i) - azOf(i - 1)) / 2, `THE ${yr}S`]; }), [d1, null]];
    for (let k = 0; k < starts.length - 1; k++) {
      const [az, name] = starts[k], next = starts[k + 1][0], mid = (az + next) / 2, el = B - 1.1 * perM;
      if (k) up(az, B - hw, B + hw, 0.05, C.white);
      at(mid, el, (s) => { const w = P.pixWidth(name, 0.26 * s); ctx.fillStyle = C.ceiling; ctx.fillRect(-w / 2 - 0.15 * s, -0.2 * s, w + 0.3 * s, 0.4 * s); P.pix(ctx, name, 0, 0, 0.26 * s, "#e8dcc8"); });
      box(name, mid, el, P.pixWidth(name, 0.26) + 0.3, 0.4);
    }
    // Each event: its branch off the band over its plinth (a shared plinth's entries fanned a little apart), in the
    // five reaches by turns, the node at its end coloured by how it connects, and beyond the node, clear of it, its
    // date and title with its name under them in one or two lines.
    let turn = 0;
    EXHIBITS.forEach((ex) => {
      if (ex.plinth === "centre") return;
      const plinth = PLINTHS[ex.plinthIndex], j = plinth.entries.indexOf(ex), n = plinth.entries.length;
      const a = azOf(ex.plinthIndex) + (j - (n - 1) / 2) * CARD.pitch / RING / DEG, [out, reach] = BAND.reaches[turn++ % BAND.reaches.length];
      const el1 = B + out * reach * perM, color = LINK[ex.link].color, context = ex.link === "context";
      up(a, B, el1, context ? 0.03 : 0.05, context ? "rgba(226,228,232,.7)" : color);
      at(a, el1, (s) => {
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, (context ? 0.14 : 0.2) * s, 0, TAU); ctx.fill();
        if (!context) { ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 0.32 * s, 0, TAU); ctx.stroke(); }
      });
      const lines = [], head = `${ex.when} · ${ex.title}`, elC = el1 + out * BAND.chip * perM;
      at(a, elC, (s) => {
        // The date and title nearest the node, the name's lines on the far side of them.
        P.pix(ctx, head, 0, 0, 0.4 * s, context ? "#e2e4e8" : color);
      });
      box(head, a, elC, P.pixWidth(head, 0.4) + 0.2, 0.7);
    });
    // The band ends at 2008; the show draws the eye up from there to the cap (no line).
    // The exhibition's title over the front, high on the dome.
    D.text(ctx, "BEFORE THE BLOCK", 0, B + 30, 1.0, C.white, 700);
    D.text(ctx, "THE ROAD TO BITCOIN · 1974 – 2009", 0, B + 27.4, 0.55, C.grey, 500);
    box("BEFORE THE BLOCK", 0, B + 30, 9, 1.0); box("THE ROAD TO BITCOIN", 0, B + 27.4, 9, 0.55);
  };
  // The cap over the crown, flat, seen from below by a visitor facing the front: the band's end coming in from the
  // dome to the middle ring, and in it the room's mark, the ₿ in pixels, over the paper and the block.
  const SYMBOL = ["...#..#....", ".#######...", ".##....##..", ".##.....##.", ".##.....##.", ".##....##..", ".#######...", ".##.....##.", ".##......##", ".##......##", ".##.....##.", ".########..", "...#..#...."];
  // The mark as a mosaic: squares of four sizes packed inside a pattern of rows, as a block explorer draws a
  // block's transactions: each square one transaction, its side its size (under 200 vB, to 600, to 3,000, larger),
  // many small and a few large. Each of the pattern's cells is four fine cells across; a square is 1, 2, 4 or 8 of
  // them. Room-agnostic: any pattern, cell size and seed.
  const markOf = (pattern, cell, seed) => {
    const SUB = 4, rows = pattern.length, cols = pattern[0].length, f = cell / SUB, rr = P.rng(seed), taken = new Set(), squares = [];
    const on = (c, r) => r >= 0 && r < rows && c >= 0 && c < cols && pattern[r][c] === "#" && !taken.has(r * cols + c);
    const put = (fc, fr, n) => { const cells = []; for (let j = 0; j < n; j += SUB) for (let i = 0; i < n; i += SUB) cells.push(Math.floor((fr + j) / SUB) * cols + Math.floor((fc + i) / SUB)); squares.push({ x: (fc + n / 2 - cols * SUB / 2) * f, z: -(fr + n / 2 - rows * SUB / 2) * f, n, side: n * f, cells }); };
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) if (on(c, r) && on(c + 1, r) && on(c, r + 1) && on(c + 1, r + 1) && rr() < 0.5) { for (const k of [r * cols + c, r * cols + c + 1, (r + 1) * cols + c, (r + 1) * cols + c + 1]) taken.add(k); put(c * SUB, r * SUB, 8); }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!on(c, r)) continue;
      if (rr() < 0.16) { put(c * SUB, r * SUB, 4); continue; }
      for (let q = 0; q < 4; q++) { const fc = c * SUB + (q % 2) * 2, fr = r * SUB + (q >> 1) * 2; if (rr() < 0.45) put(fc, fr, 2); else for (let t = 0; t < 4; t++) put(fc + (t % 2), fr + (t >> 1), 1); }
    }
    return { squares, cols, rows, cell, w: cols * cell, h: rows * cell };
  };
  const MARK = markOf(SYMBOL, 0.5, 2009), MARK_GAP = 0.024, MARK_THICK = 0.14, MARK_PERIOD = 600;
  // The square that falls on a block: one of the larger ones at the foot of the mark.
  MARK.drop = MARK.squares.reduce((best, q, i) => { const d = Math.hypot(q.x - 0.5, q.z + 3) + (q.n < 2 ? 5 : 0); return d < best.d ? { i, d } : best; }, { i: 0, d: 1e9 }).i;
  const paintCap = (ctx) => {
    const N = CAP.px, rr = CAP.rIn + CAP.ring / 2, s = N / (2 * rr);
    ctx.fillStyle = C.ceiling; ctx.fillRect(0, 0, N, N);
    ctx.fillStyle = "rgba(247,147,26,.1)"; ctx.beginPath(); ctx.arc(N / 2, N / 2, CAP.rIn * s, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.btc; ctx.lineWidth = CAP.ring * s; ctx.beginPath(); ctx.arc(N / 2, N / 2, CAP.rIn * s, 0, TAU); ctx.stroke();
    ctx.save(); ctx.translate(N / 2, N / 2);
    const halo = ctx.createRadialGradient(0, 0, 0.3 * s, 0, 0, 4.4 * s); halo.addColorStop(0, "rgba(247,147,26,.22)"); halo.addColorStop(1, "rgba(247,147,26,0)");
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, 4.4 * s, 0, TAU); ctx.fill();
    // The ₿ itself stands in front of the cap as its mosaic (`btile` nodes); the cap keeps only its halo and ring.
    // No dates on the mark: they live on the centre and on Block 0's plinth.
    ctx.restore();
  };

  // ---------- the door ----------
  // The museum's steel door in the room's own dress: a steel rim, the amber strip along the seam, a dark window, and
  // across each leaf at hand height the timeline's own mark, a lit band with branches up and down by turns.
  const door = {
    casing: "#2a2c31", frame: C.steel, header: C.steelDark, word: C.amber, strip: C.amber, chain: false,
    leaf: "#2b2d33", seam: "#121316", plate: C.steelDark, face: C.amber, mark: C.steelDark,
    leafFace(side, H) {
      const h = H.W / 2, top = H.D - 0.14, rim = "#40444b";
      for (const [x0, y0, x1, y1] of [[-h + 0.08, top - 0.06, h - 0.08, top], [-h + 0.08, 0.36, h - 0.08, 0.42], [-h + 0.08, 0.42, -h + 0.14, top - 0.06], [h - 0.14, 0.42, h - 0.08, top - 0.06]]) H.rect(x0, y0, x1, y1, rim, 0, 1);
      H.rect(H.inner, 0.05, H.inner - Math.sign(H.inner) * 0.03, H.D - 0.05, C.amber, 0.7, 1);
      H.rect(-0.22, 1.75, 0.22, 2.45, "#0d1014", 0.3, 1);
      for (const [x0, y0, x1, y1] of [[-0.24, 2.45, 0.24, 2.47], [-0.24, 1.73, 0.24, 1.75], [-0.24, 1.75, -0.22, 2.45], [0.22, 1.75, 0.24, 2.45]]) H.rect(x0, y0, x1, y1, C.amber, 0.5, 2);
      H.rect(-h + 0.16, 1.08, h - 0.16, 1.12, C.glow, 0.8, 2);
      for (let i = 0; i < 4; i++) {
        const x = -h + 0.3 + i * (2 * h - 0.6) / 3, dir = i % 2 ? 1 : -1;
        H.line(x, 1.1, x, 1.1 + dir * 0.22, 0.02, C.glow, 0.6, 2);
        H.disc(x, 1.1 + dir * 0.27, 0.035, i % 3 ? C.amber : C.cite, 0.8, 8, 3);
      }
      H.rect(-h + 0.06, 0.06, h - 0.06, 0.3, "#141414", 0, 1);
    }
  };
  // Steel pilasters either side of the doors, each with an amber strip, and a steel lintel over them.
  const doorTrim = (K, L) => {
    const d = RM.doorway(L), z = d.Z - 0.14, x = d.W + d.F + 0.14;
    for (const sx of [-1, 1]) {
      K.box(0.22, d.head - 0.3, 0.16, C.steel, sx * x, (d.head - 0.3) / 2 + 0.15, z);
      K.box(0.04, d.head - 0.5, 0.004, C.amber, sx * x, (d.head - 0.3) / 2 + 0.15, z - 0.082, { emissive: 0.85, glow: true });
      K.box(0.3, 0.15, 0.2, C.steelDark, sx * x, 0.075, z);
      K.box(0.3, 0.15, 0.2, C.steelDark, sx * x, d.head - 0.075, z);
    }
    K.box(2 * x + 0.5, 0.14, 0.3, C.steel, 0, d.head + 0.07, d.Z - 0.15);
    K.box(2 * x + 0.4, 0.03, 0.004, C.amber, 0, d.head + 0.07, d.Z - 0.302, { emissive: 0.85, glow: true });
  };


  // ---------- the glass floor and the world under it ----------
  // The floor is glass, the same everywhere, and under it is one scene in a black void: a faint cream outline of the
  // world in the polar projection (the North Pole under the whitepaper), the node clusters as warm lights, arcs
  // lifting off the map between them with pulses firing node to node, markers trailing from cluster to cluster, the
  // chain as a spiral of holographic blocks from genesis out to the rim; a stream of dots from the clusters across
  // the map, up the wall and over the dome into the ₿, which fills dim to bright through each block interval and
  // drops a block into the chain on each real block (mempool.js's feed) or, with the feeds off, on a shared
  // ten-minute timer, a wave of firings crossing the map as it lands. A scripted road of history (48 s on the
  // shared clock: the stream round the plinths 1974 to 2009, the turn in, the burst under the whitepaper, the
  // wave across the map, the dome's net) runs over it. Everything is soft additive light (the renderer's blended
  // pictures) or thin lines; every clock is the room's (`net.serverNow`), so every visitor sees the same moment;
  // nothing allocates a frame, and nothing is sent anywhere.
  const POC = { glassY: 0, roadY: -0.5, chainY: -1.6, pitY: -2.3, cycle: 48, stream: 20, turn: 3, burst: 2, charge: 3, net: 6, fade: 4, atoms: 40, spacing: 0.32, glass: 0.08, spokes: 0, seams: 0, pulses: 48, motes: 24, netDots: 24, chain: 96, chainR0: 2.2, chainR1: 11.8 };
  // Soft additive light: a radial gradient on a quad the renderer blends after the glass (its "add" pictures), so
  // every dot under the floor, and the ₿'s glow above, is light with no edge. `peak` is the middle's alpha.
  const rgba = (hex, al) => { const c = BL.math.hexToRgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${al})`; };
  const lightPicture = (cv, w, h, bright) => {
    // The renderer blends only pictures that come as an image asset (as the hangar's sparks do): the canvas goes to an
    // image once, the quad's own face stays black.
    const image = new Image(); image.src = cv.toDataURL("image/png");
    const geo = { verts: [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
    geo.imageSurface = { asset: { width: cv.width, height: cv.height, load: () => image }, rect: [-w / 2, -h / 2, w, h], cutout: true, soft: true, blend: "add", bright };
    return geo;
  };
  const softDot = (hex, size, core = 0.3, peak = 1, bright = 1) => own(() => {
    const N = 64, cv = CH.canvas(N, N), cx = cv.getContext("2d"), g = cx.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    if (peak >= 0.99) { g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(core, rgba(hex, 0.9)); g.addColorStop(Math.min(0.98, core + 0.35), rgba(hex, 0.18)); }
    else { g.addColorStop(0, rgba(hex, peak)); g.addColorStop(0.5, rgba(hex, peak * 0.45)); }
    g.addColorStop(1, rgba(hex, 0));
    cx.fillStyle = g; cx.fillRect(0, 0, N, N);
    return lightPicture(cv, size, size, bright);
  });
  // ---------- the hologram over the middle ----------
  // The Temple's statue (timechain-room-temple.js: its replica of Valentina Picozzi's statue of Satoshi in Lugano,
  // made with her permission) stands in the air over the middle plinth as a hologram, alone there, thrown up by an
  // emitter set into the plinth's top: the Temple's own built model, its shape untouched, `tall` metres high, its
  // foot `foot` over the plinth, turning once in `turn` seconds about its own middle so it faces everyone round the
  // room in turn. A display treatment alone: the Temple's surface is drawn as it is, each face given the hologram's
  // light in place of steel, as bright as the Temple's own light left it, fainter toward the seat, every other row
  // of its height a shade darker (its scanlines); drawn as glass, which lets the layers show through one another
  // and brightens every edge turned away from the eye. `w`, `h` and `yaw` are the flat picture of it that the
  // Canvas 2D fallback shows instead (`holoCanvas`).
  const HOLO = { tall: 2.2, foot: 0.75, turn: 36, glass: 0.3, band: 0.009, shades: 7, w: 520, h: 672, yaw: -58 * DEG, canvas: null };
  const holoCanvas = () => {
    if (HOLO.canvas) return HOLO.canvas;
    const W = HOLO.w, H = HOLO.h, cv = CH.canvas(W, H), ctx = cv.getContext("2d"), temple = BL.timechainRoomKinds.temple;
    HOLO.canvas = cv;
    if (!temple || !temple.statue) return cv;
    const g = temple.statue(), v = g.verts, rx = -Math.cos(HOLO.yaw), rz = Math.sin(HOLO.yaw);
    let x0 = 1e9, x1 = -1e9, top = 0;
    for (let i = 0; i < v.length; i += 3) { const sx = v[i] * rx + v[i + 2] * rz; if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (v[i + 1] > top) top = v[i + 1]; }
    const k = Math.min(W * 0.88 / (x1 - x0), H * 0.7 / top), ox = W / 2 - (x0 + x1) / 2 * k, foot = H * 0.85;
    // The emitter at the foot and the light it throws up to the figure.
    { const up = top * k * 0.3, beam = ctx.createLinearGradient(0, foot + 28, 0, foot - up); beam.addColorStop(0, "rgba(98,207,224,.16)"); beam.addColorStop(1, "rgba(98,207,224,0)");
      ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(W / 2 - 46, foot + 28); ctx.lineTo(W / 2 + 46, foot + 28); ctx.lineTo(ox + x1 * k, foot - up); ctx.lineTo(ox + x0 * k, foot - up); ctx.fill();
      const lamp = ctx.createRadialGradient(W / 2, foot + 30, 0, W / 2, foot + 30, 120); lamp.addColorStop(0, "rgba(181,238,245,.95)"); lamp.addColorStop(0.25, "rgba(98,207,224,.4)"); lamp.addColorStop(1, "rgba(98,207,224,0)");
      ctx.fillStyle = lamp; ctx.save(); ctx.translate(0, foot + 30); ctx.scale(1, 0.22); ctx.translate(0, -(foot + 30)); ctx.fillRect(W / 2 - 120, foot - 90, 240, 240); ctx.restore(); }
    // The figure: each face added to what is under it, the ones turned to the eye brighter, and each as bright as the
    // Temple's own light left it, so the form reads through the layers.
    let lit = 1;
    for (const f of g.faces) lit = Math.max(lit, f.color[0] + f.color[1] + f.color[2]);
    ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = "rgb(98,207,224)";
    for (const pass of [0, 1]) {
      for (const f of g.faces) {
        const I = f.i, a = I[0] * 3, b = I[1] * 3, c = I[2] * 3;
        const ax = v[a] * rx + v[a + 2] * rz, bx = v[b] * rx + v[b + 2] * rz, cx = v[c] * rx + v[c + 2] * rz;
        if (((bx - ax) * (v[c + 1] - v[a + 1]) - (cx - ax) * (v[b + 1] - v[a + 1]) > 0) !== !!pass) continue;
        ctx.globalAlpha = (pass ? 0.02 : 0.006) * (0.35 + 1.65 * (f.color[0] + f.color[1] + f.color[2]) / lit);
        ctx.beginPath();
        for (let n = 0; n < I.length; n++) { const j = I[n] * 3, px = ox + (v[j] * rx + v[j + 2] * rz) * k, py = foot - v[j + 1] * k; if (n) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        ctx.fill();
      }
    }
    // A soft glow round it, then the scanlines cut across everything.
    { const copy = CH.canvas(W, H), cc = copy.getContext("2d"); cc.filter = "blur(5px)"; cc.drawImage(cv, 0, 0); ctx.globalAlpha = 0.4; ctx.drawImage(copy, 0, 0); ctx.globalAlpha = 1; }
    ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = "rgba(0,0,0,.42)";
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1.5);
    ctx.globalCompositeOperation = "source-over";
    return cv;
  };
  // The Temple's statue, face by face, in fewer faces: the model is thin plates stood side by side, each plate's two
  // flat sides cut into thousands of small squares, and squares that lie side by side in one row of one side, with
  // the same `shadeOf`, are handed on as one: the same surface exactly. `add(points, faces, shade)` takes each face
  // to draw with the Temple's faces it stands for; every face that is not a plate's side comes as the Temple made
  // it, alone and with no shade. `one` leaves out one of each plate's two sides.
  const statueFaces = (one, shadeOf, add) => {
    const g = BL.timechainRoomKinds.temple.statue(), v = g.verts, runs = new Map();
    for (const f of g.faces) {
      const pts = f.i.map((j) => [v[j * 3], v[j * 3 + 1], v[j * 3 + 2]]);
      if (pts.length !== 4 || !pts.every((q) => Math.abs(q[0] - pts[0][0]) < 1e-6)) { add(pts, [f]); continue; }
      const y0 = Math.min(pts[0][1], pts[1][1], pts[2][1], pts[3][1]), y1 = Math.max(pts[0][1], pts[1][1], pts[2][1], pts[3][1]);
      const z0 = Math.min(pts[0][2], pts[1][2], pts[2][2], pts[3][2]), z1 = Math.max(pts[0][2], pts[1][2], pts[2][2], pts[3][2]), facing = (pts[1][1] - pts[0][1]) * (pts[2][2] - pts[0][2]) - (pts[1][2] - pts[0][2]) * (pts[2][1] - pts[0][1]) > 0 ? 1 : 0;
      if (one && !facing) continue;
      const key = `${pts[0][0].toFixed(5)}|${facing}|${y0.toFixed(5)}`;
      if (!runs.has(key)) runs.set(key, []);
      runs.get(key).push({ z0, z1, pts, f, shade: shadeOf(f, (y0 + y1) / 2) });
    }
    for (const row of runs.values()) {
      row.sort((a, b) => a.z0 - b.z0);
      for (let i = 0; i < row.length;) {
        let j = i;
        while (j + 1 < row.length && row[j + 1].shade === row[i].shade && row[j + 1].z0 - row[j].z1 < 1e-5) j++;
        const first = row[i], zEnd = row[j].z1;
        add(first.pts.map((q) => [q[0], q[1], Math.abs(q[2] - first.z0) < 1e-6 ? first.z0 : zEnd]), row.slice(i, j + 1).map((r) => r.f), first.shade);
        i = j + 1;
      }
    }
  };
  const holoFigure = own(() => {
    const g = BL.timechainRoomKinds.temple.statue(), v = g.verts, verts = [], faces = [];
    let lit = 1;
    for (const f of g.faces) lit = Math.max(lit, f.color[0] + f.color[1] + f.color[2]);
    const lightOf = (f, y) => (0.3 + 0.9 * (f.color[0] + f.color[1] + f.color[2]) / lit) * (0.3 + 0.7 * Math.min(1, y / 0.3)) * (Math.round(y / HOLO.band) % 2 ? 1 : 0.5);
    const midOf = (f) => { let y0 = Infinity, y1 = -Infinity; for (const j of f.i) { const y = v[j * 3 + 1]; if (y < y0) y0 = y; if (y > y1) y1 = y; } return (y0 + y1) / 2; };
    // A plate's side takes one of `shades` shades of the light, so its squares join in runs, in under half the
    // faces; and of a plate's two flat sides, a few millimetres apart, one is enough for light: drawing both
    // doubles what the eye looks through, and what the renderer fills, for nothing.
    statueFaces(true, (f, y) => Math.round(lightOf(f, y) * HOLO.shades), (pts, from, shade) => {
      const n = verts.length / 3, k = shade === undefined ? lightOf(from[0], midOf(from[0])) : shade / HOLO.shades;
      for (const q of pts) verts.push(q[0], q[1], q[2]);
      faces.push({ i: pts.map((_, c) => n + c), color: [Math.min(255, Math.round(98 * k)), Math.min(255, Math.round(207 * k)), Math.min(255, Math.round(224 * k))], emissive: 1 });
    });
    return { verts, faces, lines: [], castShadow: false, glass: HOLO.glass };
  });
  // The statue for the viewer's Canvas 2D, solid, in the Temple's own steel: every row of a plate's side one face in
  // the row's mean colour, since the viewer draws each face by itself and fifty thousand are more than it can turn.
  // It stands turned (`SOLO_TURN`) so the viewer, which opens every model from the same side, opens on its face.
  const SOLO_TURN = 1.2;
  const soloFigure = own(() => {
    const verts = [], faces = [], c = Math.cos(SOLO_TURN), s = Math.sin(SOLO_TURN);
    statueFaces(false, () => 0, (pts, from) => {
      const n = verts.length / 3, color = [0, 0, 0];
      let emissive = 0;
      for (const f of from) { color[0] += f.color[0]; color[1] += f.color[1]; color[2] += f.color[2]; emissive += f.emissive || 0; }
      for (const q of pts) verts.push(q[0] * c + q[2] * s, q[1], q[2] * c - q[0] * s);
      faces.push({ i: pts.map((_, k) => n + k), color: color.map((k) => Math.round(k / from.length)), emissive: emissive / from.length });
    });
    return { verts, faces, lines: [] };
  });
  // The Temple's own steps build the statue at the doorway, a little each frame, and the last one makes the figure.
  const steps = () => { const temple = BL.timechainRoomKinds.temple, first = PLINTHS.map((p, i) => () => { const was = firstBuilds[i]; firstPiece(i); return firstBuilds[i] === was ? false : undefined; }); return temple && temple.steps ? [...temple.steps(), () => { holoFigure(); }, ...first] : first; };
  // The light the emitter throws up: a cone's skin from its ring to the ring under the figure, fading on the way (the
  // renderer's light beams fade along their own x, so the cone is built lying down and stood up).
  // The column of light over a plinth while its piece and its first version change places: a cylinder's skin of
  // light fading as it climbs, built lying along x and stood up by its node (the renderer's light beams fade along
  // their own x). And the word on the plaque's band while a first version stands there.
  const firstColumn = own(() => {
    const g = RM.helpers.blank(), N = 32, H = 0.95, r0 = 0.5, r1 = 0.42;
    for (let i = 0; i < N; i++) {
      const a = TAU * i / N, b = TAU * (i + 1) / N, m = (a + b) / 2;
      RM.helpers.face(g, [[0, r0 * Math.cos(a), r0 * Math.sin(a)], [0, r0 * Math.cos(b), r0 * Math.sin(b)], [H, r1 * Math.cos(b), r1 * Math.sin(b)], [H, r1 * Math.cos(a), r1 * Math.sin(a)]], C.glow, 0.9, [0, Math.cos(m), Math.sin(m)]);
    }
    g.glass = 0.16; g.lightBeam = H * 1.05; g.twoSided = true;
    return noShadow(g);
  });
  const firstWord = own(() => noShadow(RM.helpers.litWord("FIRST VERSION", 0.0038, C.btc, 0.9)));
  const holoCone = own(() => {
    const g = RM.helpers.blank(), N = 28, H = HOLO.foot - 0.14, r0 = 0.9, r1 = 0.47 * HOLO.tall / 0.909;
    for (let i = 0; i < N; i++) {
      const a = TAU * i / N, b = TAU * (i + 1) / N, m = (a + b) / 2;
      RM.helpers.face(g, [[0, r0 * Math.cos(a), r0 * Math.sin(a)], [0, r0 * Math.cos(b), r0 * Math.sin(b)], [H, r1 * Math.cos(b), r1 * Math.sin(b)], [H, r1 * Math.cos(a), r1 * Math.sin(a)]], C.glow, 0.9, [0, Math.cos(m), Math.sin(m)]);
    }
    g.glass = 0.12; g.lightBeam = H * 1.1; g.twoSided = true;
    return noShadow(g);
  });
  // A sheet of light that climbs through the figure: a soft ring, seen from below as it passes.
  const holoSheet = own(() => { const N = 96, cv = CH.canvas(N, N), cx = cv.getContext("2d"), g = cx.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2); g.addColorStop(0, "rgba(98,207,224,.06)"); g.addColorStop(0.62, "rgba(98,207,224,.1)"); g.addColorStop(0.8, "rgba(181,238,245,.36)"); g.addColorStop(1, "rgba(98,207,224,0)"); cx.fillStyle = g; cx.fillRect(0, 0, N, N); return lightPicture(cv, 1.2 * HOLO.tall, 1.2 * HOLO.tall, 1); });
  // Where the Canvas 2D fallback draws the room, the figure's thousands of faces are more than it can turn: a flat
  // picture of it (`holoCanvas`) stands there in its place, seen from either side, turning the same way.
  const holoFlat = own(() => { const h = HOLO.tall / 0.62, g = lightPicture(holoCanvas(), h * HOLO.w / HOLO.h, h, 1); g.faces.push({ i: [3, 2, 1, 0], color: [0, 0, 0], emissive: 0 }); return g; });

  // ---------- the block's height, in stars ----------
  // As a block drops, stars come out round the mark, drift together into BLOCK and the block's height in the island's
  // pixel letters, a star to each lit pixel, twinkle there and scatter again. The line bends a little round the
  // mark's ring (`bend` the radius it bends on), `gap` of the ring's radius clear of it, on the front's side, so it
  // reads the right way up to a visitor facing the front as the mark does. Only a height the feed gave is written.
  const HEIGHT = { stars: 260, pitch: 0.16, gap: 0.42, bend: 14, early: 1.2, gather: 2.2, hold: 4.8, scatter: 2.4 };

  const floorPoc = (() => {
    // The path of the history road: the walk ring under the plinths in order, then in to the middle.
    const path = PLINTHS.map((p, i) => spotOf(i, RING - DEPTH / 2 - 0.4)).map((s) => [s.x, s.z]);
    path.push([0, 0]);
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    const ringLen = cum[path.length - 2], total = cum[path.length - 1];
    const at = (s, out) => {
      s = Math.max(0, Math.min(total, s));
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      const t = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
      out.x = path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t; out.z = path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t;
      return out;
    };
    // ---- the world under the glass: the map's disc, its projection, the node clusters, the arcs ----
    // The polar projection (the UN emblem's): the North Pole at the middle under the whitepaper, latitude as radius,
    // longitude as the angle, Greenwich toward the door. Depths: the map plane, the arcs' crest, the chain, the void.
    const M = { mapR: 18.6, mapY: -0.95, arcY: -0.3, chainY: -1.7, voidY: -2.4, clusters: 0, pulses: 56, markers: 16, stream: 120, fallback: 600, wave: 7.5 };
    const project = (lat, lon) => { const r = (90 - lat) / 150 * M.mapR, a = (lon + 180) * DEG; return { x: r * Math.sin(a), z: -r * Math.cos(a) }; };
    // Where the nodes are (an approximate table from general knowledge of the public node distribution, by city or
    // region, with a weight for density: timechain-genesis-map.js).
    const MAP = BL.timechainGenesisMap;
    if (!MAP) throw new Error("timechain-genesis-map.js is not loaded");
    const CLUSTERS = MAP.clusters;
    const clusters = CLUSTERS.map(([lat, lon, w, name]) => ({ ...project(lat, lon), y: M.mapY, w, name, glow: 0, links: [], seed: (lat * 7 + lon) % 6.28 }));
    M.clusters = clusters.length;
    // The coastlines (timechain-genesis-map.js: Natural Earth 1:110m, public domain, simplified), each a run of
    // [lat, lon].
    const COAST = MAP.coast;
    const coastlines = own(() => { const geo = RM.helpers.blank(), w = 0.014; for (const run of COAST) { for (let i = 1; i < run.length; i++) { if (run[i][0] < -58 || run[i - 1][0] < -58) continue; const a = project(run[i - 1][0], run[i - 1][1]), b = project(run[i][0], run[i][1]), dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1, nx = -dz / d * w, nz = dx / d * w; RM.helpers.face(geo, [[a.x + nx, 0, a.z + nz], [b.x + nx, 0, b.z + nz], [b.x - nx, 0, b.z - nz], [a.x - nx, 0, a.z - nz]], C.white, 0.2, [0, 1, 0]); } } return noShadow(geo); });
    // The arcs: each cluster to its two nearest and sometimes a third, lifting off the map toward the glass.
    const links = [];
    const rr0 = P.rng(2140);
    const addLink = (i, j) => { if (i === j || links.some((l) => (l.a === i && l.b === j) || (l.a === j && l.b === i))) return; const A = clusters[i], B = clusters[j], len = Math.hypot(B.x - A.x, B.z - A.z); links.push({ a: i, b: j, len: len * 1.15, c: { x: (A.x + B.x) / 2, y: M.arcY - Math.min(0.5, len * 0.015), z: (A.z + B.z) / 2 } }); A.links.push(links.length - 1); B.links.push(links.length - 1); };
    clusters.forEach((n, i) => { const near = clusters.map((m, j) => ({ j, d: Math.hypot(m.x - n.x, m.z - n.z) })).filter((q) => q.j !== i).sort((p, q) => p.d - q.d); addLink(i, near[0].j); addLink(i, near[1].j); if (rr0() < 0.45) addLink(i, near[2 + Math.floor(rr0() * 3)].j); });
    const along = (l, t, out) => { const A = clusters[l.a], B = clusters[l.b], u = 1 - t; out.x = u * u * A.x + 2 * u * t * l.c.x + t * t * B.x; out.y = u * u * A.y + 2 * u * t * l.c.y + t * t * B.y; out.z = u * u * A.z + 2 * u * t * l.c.z + t * t * B.z; return out; };
    const arcs = own(() => { const geo = RM.helpers.blank(), q = { x: 0, y: 0, z: 0 }, q2 = { x: 0, y: 0, z: 0 }, w = 0.006; for (const l of links) { const m = 16; for (let k = 0; k < m; k++) { along(l, k / m, q); along(l, (k + 1) / m, q2); const dx = q2.x - q.x, dz = q2.z - q.z, d = Math.hypot(dx, dz) || 1, nx = -dz / d * w, nz = dx / d * w; RM.helpers.face(geo, [[q.x + nx, q.y, q.z + nz], [q2.x + nx, q2.y, q2.z + nz], [q2.x - nx, q2.y, q2.z - nz], [q.x - nx, q.y, q.z - nz]], PALETTE.accent2 || C.glow, 0.05, [0, 1, 0]); } } return noShadow(geo); });
    // ---- the light ----
    const GREEN = PALETTE.atom, VIOLET = PALETTE.accent2 || C.glow, WARM = "#ffb347";
    const dotG = softDot(GREEN, 0.22, 0.2), dotW = softDot(WARM, 0.22, 0.2), dotO = softDot(C.btc, 0.28, 0.22), dotWSmall = softDot(WARM, 0.55, 0.25);
    const nodeLight = softDot(WARM, 1.0, 0.06, 1, 0.7), bloom = softDot(C.btc, 1, 0.12), plinthGlow = softDot(GREEN, 1.6, 0.05, 1, 0.5);
    // The chain's holographic cubes: twelve thin edges in green (orange for genesis and the newest), and a face of
    // hex from the genesis header as light, one picture shared by all.
    const edgesOf = (hex) => own(() => { const parts = [], e = 0.24, t = 0.008, h = e / 2; for (const [x, y, z, w, hh, d] of [[0, -h, -h, e, t, t], [0, h, -h, e, t, t], [0, -h, h, e, t, t], [0, h, h, e, t, t], [-h, 0, -h, t, e, t], [h, 0, -h, t, e, t], [-h, 0, h, t, e, t], [h, 0, h, t, e, t], [-h, -h, 0, t, t, e], [h, -h, 0, t, t, e], [-h, h, 0, t, t, e], [h, h, 0, t, t, e]]) parts.push(box({ w, h: hh, d, color: hex, emissive: 0.45, offset: { x, y, z } })); return noShadow(BL.models.merge(...parts)); });
    const edgesG = edgesOf(GREEN), edgesO = edgesOf(C.btc);
    const HEX = "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b";
    const faceOf = (hex) => own(() => { const N = 128, cv = CH.canvas(N, N), cx = cv.getContext("2d"); cx.fillStyle = rgba(hex, 0.05); cx.fillRect(0, 0, N, N); cx.fillStyle = rgba(hex, 0.75); cx.font = "bold 13px monospace"; cx.textBaseline = "top"; for (let r = 0; r < 8; r++) cx.fillText(HEX.slice((r * 13) % 100, (r * 13) % 100 + 16), 6, 6 + r * 15); return lightPicture(cv, 0.22, 0.22, 0.6); });
    const faceG = faceOf(GREEN), faceO = faceOf(C.btc);
    // The spiral, three turns from genesis out to the rim, the blocks evenly spaced along it (by arc length).
    const SPB = (POC.chainR1 - POC.chainR0) / (6 * Math.PI), SPL = POC.chainR0 * 6 * Math.PI + SPB * 36 * Math.PI * Math.PI / 2;
    // Written into `out` (x, z, the spiral's angle), so the frame loop asks it without allocating.
    const chainAt = (i, out) => { const sArc = SPL * Math.max(0, i) / (POC.chain - 1), th = (-POC.chainR0 + Math.sqrt(POC.chainR0 * POC.chainR0 + 2 * SPB * sArc)) / SPB, r = POC.chainR0 + SPB * th; out[0] = r * Math.sin(th); out[1] = -r * Math.cos(th); out[2] = th; return out; };
    // The spiral recedes: genesis nearest the glass, the rim's blocks deepest and dimmer.
    const chainY = (i) => M.chainY + 0.25 - 0.9 * i / (POC.chain - 1);
    const blockGeo = own(() => noShadow(BL.models.merge(box({ w: 0.6, h: 0.6, d: 0.6, color: "#3b2608" }), box({ w: 0.56, h: 0.56, d: 0.62, color: C.btc, emissive: 0.8 }), box({ w: 0.62, h: 0.56, d: 0.56, color: C.btc, emissive: 0.8 }))));
    const bar = own(() => noShadow(box({ w: 1, h: 0.04, d: 0.04, color: C.amber, emissive: 0.9, offset: { x: 0.5 } })));
    const ring = own(() => { const g = RM.helpers.blank(), n = 28, r0 = 0.55, r1 = 0.8; for (let k = 0; k < n; k++) { const a = TAU * k / n, b = TAU * (k + 1) / n; RM.helpers.face(g, [[r0 * Math.sin(a), 0, -r0 * Math.cos(a)], [r1 * Math.sin(a), 0, -r1 * Math.cos(a)], [r1 * Math.sin(b), 0, -r1 * Math.cos(b)], [r0 * Math.sin(b), 0, -r0 * Math.cos(b)]], C.btc, 1, [0, 1, 0]); } return noShadow(g); });
    // The void: a black disc far below, its two outer rings a faint cool glow (the atmosphere of the night-side references,
    // in the mesh itself rather than a dozen large blended sprites).
    const voidFloor = (L) => { const rf = L.r0 + 0.3, geo = RM.helpers.blank(), rings = 6, sectors = 48; for (let i = 0; i < rings; i++) { const r0 = rf * i / rings, r1 = rf * (i + 1) / rings; for (let k = 0; k < sectors; k++) { const b0 = TAU * k / sectors, b1 = TAU * (k + 1) / sectors, pt = (r, b) => [r * Math.sin(b), 0, -r * Math.cos(b)]; RM.helpers.face(geo, i === 0 ? [[0, 0, 0], pt(r1, b0), pt(r1, b1), pt(r1, b1)] : [pt(r0, b0), pt(r1, b0), pt(r1, b1), pt(r0, b1)], i < 4 ? "#020308" : i === 4 ? "#06111a" : "#0c2434", i < 4 ? 0 : 0.5, [0, 1, 0]); } } return noShadow(geo); };
    const FLAT = { rx: -HALF_PI, glow: true, scale: 0.001 };
    const plan = (K, L) => {
      K.floorColor(C.glass); K.floorGlass(PALETTE.glass); K.rimColor("#1d5566");
      K.add(voidFloor(L), 0, M.voidY, 0);
      K.add(coastlines(), 0, M.mapY, 0, { glow: true });
      K.add(arcs(), 0, 0, 0);
      // The chain's link: one faint line along the spiral under the blocks.
      { const geo = RM.helpers.blank(), w = 0.008, m = 4; for (let i = 0; i < (POC.chain - 1) * m; i++) { const a = chainAt(i / m, [0, 0, 0]), b = chainAt((i + 1) / m, [0, 0, 0]), ya = chainY(i / m), yb = chainY((i + 1) / m), dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz) || 1, nx = -dz / d * w, nz = dx / d * w; RM.helpers.face(geo, [[a[0] + nx, ya, a[1] + nz], [b[0] + nx, yb, b[1] + nz], [b[0] - nx, yb, b[1] - nz], [a[0] - nx, ya, a[1] - nz]], GREEN, 0.22, [0, 1, 0]); } K.add(noShadow(geo), 0, 0, 0); }
      clusters.forEach((n, i) => K.node(`pocCluster${i}`, nodeLight(), n.x, n.y, n.z, { rx: -HALF_PI, glow: true, scale: 0.3 + 0.05 * n.w }));
      for (let i = 0; i < M.pulses; i++) K.node(`pocPulse${i}`, dotG(), 0, -1, 0, FLAT);
      for (let i = 0; i < M.markers; i++) for (let k = 0; k < 3; k++) K.node(`pocMark${i}_${k}`, dotW(), 0, -1, 0, FLAT);
      for (let i = 0; i < M.stream; i++) K.node(`pocStream${i}`, dotWSmall(), 0, -1, 0, FLAT);
      for (let i = 0; i < POC.chain; i++) { const [cx, cz] = chainAt(i, [0, 0, 0]); K.node(`pocChain${i}`, (i ? edgesG : edgesO)(), cx, chainY(i), cz, {}); K.node(`pocChainF${i}`, (i ? faceG : faceO)(), cx, chainY(i), cz, { ry: Math.PI - Math.atan2(cx, cz), glow: true }); }
      path.forEach(([x, z], i) => K.node(`pocRing${i}`, plinthGlow(), x, POC.roadY - 0.25, z, FLAT));
      for (let i = 0; i < POC.atoms; i++) for (let k = 0; k < 2; k++) K.node(`pocAtom${i}_${k}`, dotG(), 0, POC.roadY, 0, FLAT);
      for (let i = 0; i < 4; i++) K.node(`pocBurst${i}`, bloom(), 0, POC.roadY - 0.1 - i * 0.03, 0, FLAT);
      THREADS.forEach((th, k) => { for (let i = 0; i < 5; i++) K.node(`pocCite${k}_${i}`, dotG(), 0, POC.roadY - 0.15, 0, FLAT); });
      for (let i = 0; i < POC.netDots; i++) { const a = i / POC.netDots * TAU, el = (28 + (i % 3) * 14) * DEG, q = ROOMS.onSphere(L, a, el, 0.985); K.node(`pocDot${i}`, ring(), q.x, q.y, q.z, { glow: true, scale: 0.001 }); }
      for (let i = 0; i < POC.netDots; i++) { const a = i / POC.netDots * TAU, el = (28 + (i % 3) * 14) * DEG, q = ROOMS.onSphere(L, a, el, 0.985), el2 = (28 + ((i + 1) % 3) * 14) * DEG, a2 = (i + 1) / POC.netDots * TAU, q2 = ROOMS.onSphere(L, a2, el2, 0.985); K.node(`pocLink${i}`, bar(), (q.x + q2.x) / 2, (q.y + q2.y) / 2, (q.z + q2.z) / 2, { ry: Math.atan2(-(q2.z - q.z), q2.x - q.x), rz: Math.atan2(q2.y - q.y, Math.hypot(q2.x - q.x, q2.z - q.z)), glow: true, scale: 0.001 }); }
      K.node("pocBlock", blockGeo(), 0, L.c + L.R * 0.9, 0, { scale: 0.001 });
      // The hints to the hidden door: three strays off the stream to the foot of the portal's wall, the spiral's last
      // arm reaching the same foot after a drop and ending in one bright point, a resting trickle always drifting that way.
      { const f = portalFoot(L); for (let i = 0; i < 3; i++) K.node(`pocStray${i}`, dotG(), f.x, POC.roadY, f.z, FLAT); for (let i = 0; i < 8; i++) K.node(`pocArm${i}`, (i === 7 ? dotO : dotWSmall)(), f.x, M.chainY, f.z, FLAT); for (let i = 0; i < 8; i++) K.node(`pocTrickle${i}`, dotG(), f.x, POC.roadY - 0.12, f.z, FLAT); }
    };
    const animate = (nodes, built) => {
      const L = built.layout, N = (name) => nodes[name], arr = (name, n) => Array.from({ length: n }, (_, i) => nodes[`${name}${i}`]);
      const rings = path.map((_, i) => N(`pocRing${i}`)), bursts = arr("pocBurst", 4), dots = arr("pocDot", POC.netDots), linksD = arr("pocLink", POC.netDots), block = N("pocBlock");
      const atoms = Array.from({ length: POC.atoms }, (_, i) => [0, 1].map((k) => N(`pocAtom${i}_${k}`)));
      const clusterN = clusters.map((_, i) => N(`pocCluster${i}`)), pulseN = arr("pocPulse", M.pulses), streamN = arr("pocStream", M.stream);
      const markers = Array.from({ length: M.markers }, (_, i) => ({ nodes: [0, 1, 2].map((k) => N(`pocMark${i}_${k}`)), link: i % links.length, t: (i * 0.37) % 1, dir: 1, speed: 0.12 + (i % 4) * 0.03 }));
      const cites = THREADS.map((th, k) => ({ nodes: Array.from({ length: 5 }, (_, i) => N(`pocCite${k}_${i}`)), i: PLINTHS.findIndex((p) => p.id === th.id) })).filter((c) => c.i >= 0);
      // Each citation's plinth stands still: its spot is found once here, not every frame.
      for (const c of cites) c.spot = spotOf(c.i);
      const linkLen = linksD.map((n, i) => { const a = i / POC.netDots * TAU, el = (28 + (i % 3) * 14) * DEG, q = ROOMS.onSphere(L, a, el, 0.985), a2 = (i + 1) / POC.netDots * TAU, el2 = (28 + ((i + 1) % 3) * 14) * DEG, q2 = ROOMS.onSphere(L, a2, el2, 0.985); return Math.hypot(q2.x - q.x, q2.y - q.y, q2.z - q.z); });
      const capEl = CAP.el * DEG, capY = L.c + L.R * 0.97 * Math.sin(capEl) - 0.6, blockTop = capY - 0.3, blockFloor = POC.roadY;
      const chainE = arr("pocChain", POC.chain), chainF = arr("pocChainF", POC.chain);
      // The frame loop's scratch: a point on the road, one in the room, the spiral's places, the candidates of a firing.
      const p = { x: 0, z: 0 }, q3 = { x: 0, y: 0, z: 0 }, T = POC, ch0 = [0, 0, 0], ch1 = [0, 0, 0], cands = new Int32Array(Math.max(1, ...clusters.map((n) => n.links.length)));
      const tStream = T.stream, tTurn = tStream + T.turn, tBurst = tTurn + T.burst, tCharge = tBurst + T.charge, tNet = tCharge + T.net, tFade = tNet + T.fade;
      const clock = () => (BL.net && typeof BL.net.serverNow === "function" ? BL.net.serverNow() : Date.now()) / 1000;
      let forced = -1, lastT = -1, lastNow = 0, seedNow = 0;
      const rnd = (k) => { const x = Math.sin(k * 12.9898 + seedNow * 78.233) * 43758.5453; return x - Math.floor(x); };
      const setScale = (n, s) => { n.scale.x = s; n.scale.y = s; n.scale.z = s; }, TRAIL = [0.7, 0.45, 0.28], ATOM_LAG = [0, 0.5], ATOM_SIZE = [1, 0.5], BURST_LAG = [0, 0.08];
      const setBar = (n, len, thick) => { n.scale.x = Math.max(0.001, len); n.scale.y = n.scale.z = Math.max(0.001, thick); };
      const ease = (k) => k * k * (3 - 2 * k), clamp01 = (v) => Math.max(0, Math.min(1, v));
      // ---- the live side: the feed's blocks and inflow, the fallback timer, the fill ----
      const now0 = clock();
      // `heat` is the ₿'s fill: 0 as a block lands, 1 ten minutes on, and on to 1.3 while the next one is late.
      const live = { mode: "fallback", rate: 1.2, liveAt: 0, lastBlockAt: now0 - (now0 % M.fallback), dropAt: -1e9, height: 0, fill: 0, heat: 0, landed: -1e9, landSeed: 0, drops: 0, newest: 0, wave: { on: false, at: 0, from: 0 }, nextFee: 0 };
      // With the feeds on, the time of the chain's own last block (chain.js's snapshot) sets where the fill stands.
      const chainTip = () => { const snap = BL.chain && BL.chain.snapshot; return snap && snap.lastBlockAt > 0 ? snap.lastBlockAt / 1000 : 0; };
      let fallbackSlot = Math.floor(now0 / M.fallback);
      // A block: the mark peaks for two seconds (its lock wave), then one of its blocks drops and the fill starts again.
      const drop = (height, from) => { const t = clock() + 2; live.dropAt = t; live.lastBlockAt = t; live.height = height || 0; live.drops++; live.newest = (live.newest + 1) % POC.chain; const w = live.wave; w.on = true; w.at = t + 5.2; w.from = from === undefined ? Math.floor(rnd(live.drops) * clusters.length) : from; };
      let unsub = null;
      if (BL.mempool && BL.mempool.subscribe && BL.mempool.state && BL.mempool.state.enabled) unsub = BL.mempool.subscribe((e) => { if (e.type === "block") drop(e.height); else if (e.type === "stats") { live.mode = "live"; live.liveAt = clock(); live.rate = Math.max(2, Math.min(5, (e.inflow || 0) / 300)); } else if (e.type === "fees") live.nextFee = e.nextFee || 0; });
      // ---- firing along the arcs ----
      const pulses = pulseN.map((node) => ({ node, on: false, link: 0, dir: 1, t: 0, energy: 0 }));
      const fire = (ni, energy, except = -1, inward = false) => {
        const n = clusters[ni]; if (!n) return;
        n.glow = Math.max(n.glow, Math.min(1.4, energy));
        if (energy < 0.3) return;
        // The links it may fire along, into the scratch list in their own order (inward: only toward the middle).
        let nc = 0;
        for (let j = 0; j < n.links.length; j++) {
          const li = n.links[j];
          if (li === except) continue;
          if (inward) { const l = links[li], o = l.a === ni ? l.b : l.a; if (Math.hypot(clusters[o].x, clusters[o].z) >= Math.hypot(n.x, n.z)) continue; }
          cands[nc++] = li;
        }
        for (let k = 0; k < (energy > 0.9 ? 2 : 1) && nc; k++) {
          const pick = Math.floor(rnd(ni * 7 + k) * nc), li = cands[pick];
          for (let j = pick; j < nc - 1; j++) cands[j] = cands[j + 1];
          nc--;
          let free = null;
          for (let j = 0; j < pulses.length; j++) if (!pulses[j].on) { free = pulses[j]; break; }
          if (!free) return;
          free.on = true; free.link = li; free.dir = links[li].a === ni ? 1 : -1; free.t = 0; free.energy = energy;
        }
      };
      const stepPulses = (dt, cascade, inward) => {
        for (let j = 0; j < pulses.length; j++) {
          const pu = pulses[j];
          if (!pu.on) { setScale(pu.node, 0.001); continue; }
          const l = links[pu.link];
          pu.t += dt * 4.2 / l.len;
          if (pu.t >= 1) { pu.on = false; setScale(pu.node, 0.001); const to = pu.dir === 1 ? l.b : l.a; clusters[to].glow = Math.max(clusters[to].glow, Math.min(1.3, pu.energy)); if (rnd(pu.link + 3) < cascade) fire(to, pu.energy * 0.68, pu.link, inward); continue; }
          along(l, pu.dir === 1 ? pu.t : 1 - pu.t, q3);
          pu.node.position.x = q3.x; pu.node.position.y = q3.y + 0.02; pu.node.position.z = q3.z;
          setScale(pu.node, 0.6 + 0.6 * pu.energy);
        }
      };
      const nearest = (x, z) => { let b = 0, bd = Infinity; for (let i = 0; i < clusters.length; i++) { const d = Math.hypot(clusters[i].x - x, clusters[i].z - z); if (d < bd) { bd = d; b = i; } } return b; };
      const crossed = (t, tick, phase = 0) => lastT >= 0 && Math.floor((t - phase) / tick) !== Math.floor((lastT - phase) / tick) && t > lastT;
      // ---- the stream: dots born at the clusters, across the map, up the wall, over the dome, into the ₿ ----
      const stream = streamN.map((node) => ({ node, on: false, t: 0, az: 0, x0: 0, z0: 0, size: 1 }));
      let spawnAcc = 0;
      const wallR0 = ROOMS.radiusAt(L, 0) - 0.5;
      const stepStream = (dt, now) => {
        const rate = live.mode === "live" ? live.rate : 4;
        spawnAcc += dt * rate;
        // Each spawn is a short trail of three dots from one cluster, so the dots read as streams up the wall.
        while (spawnAcc >= 1) { spawnAcc -= 1; const ci = Math.floor(rnd(Math.floor(now * 50)) * clusters.length), c = clusters[ci], size = 0.8 + Math.min(0.8, live.nextFee / 40); for (let k = 0; k < 3; k++) { let free = null; for (let j = 0; j < stream.length; j++) if (!stream[j].on) { free = stream[j]; break; } if (!free) break; free.on = true; free.t = -k * 0.22; free.x0 = c.x; free.z0 = c.z; free.az = Math.atan2(c.x, -c.z); free.size = size * (1 - 0.22 * k); free.tgt = -2; free.tx = 0; free.tz = 0; } c.glow = Math.max(c.glow, 0.5); }
        for (let j = 0; j < stream.length; j++) {
          const d = stream[j];
          if (!d.on) { setScale(d.node, 0.001); continue; }
          d.t += dt;
          const n = d.node;
          if (d.t < 0) { setScale(n, 0.001); continue; }
          if (d.t < 2.4) { const u = ease(d.t / 2.4), wx = wallR0 * Math.sin(d.az), wz = -wallR0 * Math.cos(d.az); n.position.x = d.x0 + (wx - d.x0) * u; n.position.z = d.z0 + (wz - d.z0) * u; n.position.y = M.mapY + 0.05 + (POC.roadY - M.mapY) * u; n.rotation.x = -HALF_PI; n.rotation.y = 0; setScale(n, d.size); }
          else if (d.t < 7.2) { const u = (d.t - 2.4) / 4.8, el = -1 * DEG + (capEl - 2 * DEG + 1 * DEG) * ease(u), q = ROOMS.onSphere(L, d.az, el, 0.985, q3); n.position.x = q.x; n.position.y = q.y; n.position.z = q.z; n.rotation.x = el * 0.9; n.rotation.y = -d.az; setScale(n, d.size * 3); }
          else if (d.t < 8.2) {
            // Off the dome and in to the mark: the dot is a transaction now, the next square to turn is its own (and
            // gives it its size); with none left to turn this minute it flies to the middle and only glints. It comes
            // in behind the squares, never in front: its light over a square would colour one that has not turned.
            if (d.tgt === -2) { const mk = BL.timechainGenesis.mark; d.tgt = mk ? mk.claim() : -1; const sq = d.tgt >= 0 ? MARK.squares[d.tgt] : null; d.tx = sq ? sq.x : 0; d.tz = sq ? sq.z : 0; if (sq) d.size = 0.5 + 0.26 * sq.n; }
            const u = ease((d.t - 7.2) / 1.0), q = ROOMS.onSphere(L, d.az, capEl - 1 * DEG, 0.985, q3); n.position.x = q.x + (d.tx - q.x) * u; n.position.z = q.z + (d.tz - q.z) * u; n.position.y = q.y + (capY + 0.1 - q.y) * u; n.rotation.x = HALF_PI; n.rotation.y = 0; setScale(n, d.size * 3 * (1 - 0.7 * u)); }
          else { d.on = false; setScale(n, 0.001); live.landed = now; const mk = BL.timechainGenesis.mark; if (mk && d.tgt >= 0) mk.light(d.tgt, now, true); }
        }
      };
      // ---- the markers: light trailing from cluster to cluster across the map, always ----
      const stepMarkers = (dt, now) => {
        for (let i = 0; i < markers.length; i++) {
          const mk = markers[i], l = links[mk.link];
          mk.t += dt * mk.speed * 10 / Math.max(3, l.len);
          if (mk.t >= 1) { const end = mk.dir === 1 ? l.b : l.a, c = clusters[end], others = c.links.length - (c.links.includes(mk.link) ? 1 : 0); if (others > 0) { let pick = Math.floor(rnd(i * 13 + Math.floor(now)) * others); for (let j = 0; j < c.links.length; j++) if (c.links[j] !== mk.link && pick-- === 0) { mk.link = c.links[j]; break; } } mk.dir = links[mk.link].a === end ? 1 : -1; mk.t = 0; c.glow = Math.max(c.glow, 0.35); }
          for (let k = 0; k < 3; k++) { const n = mk.nodes[k]; if (!n) continue; const tt = Math.max(0, mk.t - k * 0.05), ll = links[mk.link]; along(ll, mk.dir === 1 ? tt : 1 - tt, q3); n.position.x = q3.x; n.position.y = q3.y + 0.01; n.position.z = q3.z; setScale(n, TRAIL[k]); }
        }
      };
      // The hints' geometry.
      const foot = portalFoot(L), nearIdx = PLINTHS.reduce((b, _, i) => Math.abs(azOf(i) - PORTAL.az) < Math.abs(azOf(b) - PORTAL.az) ? i : b, 0), sPortal = cum[nearIdx], roadPt = at(sPortal, { x: 0, z: 0 });
      const strays = arr("pocStray", 3), arm = arr("pocArm", 8), trickle = arr("pocTrickle", 8);
      { const e = chainAt(POC.chain - 1, ch0); for (let i = 0; i < arm.length; i++) { const n = arm[i]; if (!n) continue; const u = (i + 1) / 8; n.position.x = e[0] + (foot.x - e[0]) * u; n.position.z = e[1] + (foot.z - e[1]) * u; } }
      const tStray0 = T.stream * sPortal / ringLen;
      const update = () => {
        const now = clock(), dt = lastNow ? Math.min(0.1, now - lastNow) : 1 / 60; lastNow = now; seedNow = Math.floor(now * 8);
        const t = forced >= 0 ? forced : now % T.cycle;
        // The live side each frame: a feed gone quiet falls back; the fallback drops a block on the shared ten-minute
        // boundary; the fill is the time since the last block, or the dots that have arrived, whichever is further.
        if (live.mode === "live" && now - live.liveAt > 30) live.mode = "fallback";
        if (live.mode !== "live") { const slot = Math.floor(now / M.fallback); if (slot !== fallbackSlot) { fallbackSlot = slot; drop(0); } }
        if (live.mode === "live") { const tip = chainTip(); if (tip > live.lastBlockAt + 1 && now - live.dropAt > 30) live.lastBlockAt = Math.min(tip, now); }
        const td = now - live.dropAt;
        live.heat = td < 0 ? 1.3 : Math.max(0, Math.min(1.3, (now - live.lastBlockAt) / M.fallback));
        live.fill = Math.min(1, live.heat);
        // The history road: the stream along the ring, the turn in, the burst, the charge across the map, the dome's net.
        const head = t < tStream ? ringLen * t / tStream : t < tTurn ? ringLen + (total - ringLen) * (t - tStream) / T.turn : total;
        const bursting = t >= tTurn, tb = t - tTurn;
        const after = t >= tNet ? 1 - clamp01((t - tNet) / T.fade) : 1;
        if (lastT >= 0 && t < lastT) lastT = -1;
        // ---- the network's firings: the story when the show runs, a propagation wave on a block, gentle traffic otherwise ----
        if (t < tStream) { if (crossed(t, 0.5)) { at(head, p); fire(nearest(p.x, p.z), 1.1); } }
        else if (t < tTurn) { if (crossed(t, 0.3)) for (let k = 0; k < 2; k++) fire(Math.floor(rnd(Math.floor(t * 10) + k * 31) * clusters.length), 1.0, -1, true); }
        else if (t < tBurst) { if (crossed(t, 10, tTurn)) for (let i = 0; i < clusters.length; i++) clusters[i].glow = 1.3; }
        else if (t < tNet) { const front = (t - tBurst) * M.wave; for (let i = 0; i < clusters.length; i++) { const r = Math.hypot(clusters[i].x, clusters[i].z); if (r <= front && r > front - M.wave * dt * 1.05) fire(i, 1.1); } }
        if (crossed(now, 0.9)) fire(Math.floor(rnd(Math.floor(now)) * clusters.length), 0.6);
        if (live.wave.on && now >= live.wave.at) { const w = live.wave, o = clusters[w.from], front = (now - w.at) * M.wave; for (let i = 0; i < clusters.length; i++) { const r = Math.hypot(clusters[i].x - o.x, clusters[i].z - o.z); if (r <= front && r > front - M.wave * dt * 1.05) fire(i, 1.3); } if (front > 2 * M.mapR) live.wave.on = false; }
        stepPulses(dt, 0.7, t >= tStream && t < tTurn);
        for (let i = 0; i < clusters.length; i++) { const n = clusters[i], node = clusterN[i]; if (!node) continue; n.glow *= Math.exp(-dt * 1.5); setScale(node, (0.3 + 0.05 * n.w) * (1 + 0.06 * Math.sin(now * 0.8 + n.seed)) + 0.55 * n.glow); }
        stepMarkers(dt, now);
        stepStream(dt, now);
        // ---- the road's atoms (the show's stream phase), the plinth glows, the bloom ----
        for (let i = 0; i < atoms.length; i++) {
          const pair = atoms[i], s = head - i * T.spacing;
          if (t >= tFade || (!bursting && s < 0)) { setScale(pair[0], 0.001); setScale(pair[1], 0.001); continue; }
          // Each atom is a dot and its fainter follower (`ATOM_LAG`, `ATOM_SIZE`; out in the burst, `BURST_LAG`).
          if (!bursting) for (let k = 0; k < 2; k++) { const n = pair[k]; at(s - ATOM_LAG[k], p); n.position.x = p.x + Math.sin(t * 7 + i * 1.7) * 0.2; n.position.z = p.z + Math.cos(t * 5 + i * 2.1) * 0.2; n.position.y = T.roadY + Math.sin(t * 9 + i) * 0.08; setScale(n, ATOM_SIZE[k]); }
          else { const r = tb * 9, a = i / atoms.length * TAU + tb * 2, sc = tb < T.burst ? 1.2 * (1 - tb / T.burst) : 0.001; for (let k = 0; k < 2; k++) { const n = pair[k], lag = BURST_LAG[k], rr = Math.max(0, r - lag * 9); n.position.x = Math.sin(a - lag * 2) * rr; n.position.z = -Math.cos(a - lag * 2) * rr; n.position.y = T.roadY; setScale(n, sc); } }
        }
        for (let i = 0; i < rings.length; i++) { const reached = head - cum[i]; let s = 0.001; if (bursting) s = i === rings.length - 1 ? 0.001 : Math.max(0.001, 0.6 * after); else if (reached > 0) s = reached < 1.5 ? 0.3 + 0.9 * reached / 1.5 : Math.max(0.6, 1.2 - (reached - 1.5) * 0.08); setScale(rings[i], s); }
        const kb = bursting ? (tb < T.burst ? tb / T.burst : Math.max(0, 1 - (tb - T.burst) / 1.5)) : 0;
        for (let i = 0; i < bursts.length; i++) setScale(bursts[i], Math.max(0.001, kb * (3 + i * 2.2)));
        const onRefs = BL.timechainGenesis.readerPage === 8;
        for (let c = 0; c < cites.length; c++) { const ct = cites[c], sp = ct.spot, on = onRefs || (t >= tBurst + c * 0.4 && t < tNet); for (let i = 0; i < ct.nodes.length; i++) { const n = ct.nodes[i]; if (!n) continue; if (!on) { setScale(n, 0.001); continue; } const u = ((now * 0.5 + i / ct.nodes.length + c * 0.13) % 1); n.position.x = sp.x * 0.1 + sp.x * 0.8 * u; n.position.z = sp.z * 0.1 + sp.z * 0.8 * u; setScale(n, 0.5 * (u < 0.1 ? u / 0.1 : u > 0.9 ? (1 - u) / 0.1 : 1) * after); } }
        const charged = t >= tBurst && t < tFade;
        for (let i = 0; i < dots.length; i++) { const lit = charged && t >= tCharge + (i / dots.length) * T.net * 0.8; if (dots[i]) setScale(dots[i], lit ? 0.9 * after : 0.001); const frontAt = (t - tCharge) / (T.net * 0.8) * dots.length, linkLit = charged && i + 1 <= frontAt && i + 1 > frontAt - 8; if (linksD[i]) setBar(linksD[i], linkLit ? linkLen[i] : 0, linkLit ? 0.6 * after : 0); }
        // ---- the block: on a drop it falls from the ₿ to the glass (5 s), runs the spiral to the newest place (5 s), and a pulse runs back to genesis (5 s) ----
        // Its fall comes in over the middle, drops straight down through the hologram into the emitter in the drum, and
        // comes out under the glass at the chain's first place.
        if (block) {
          if (td >= 0 && td < 5) {
            const d = ease(td / 5), g0 = chainAt(0, ch0), from = MARK.squares[MARK.drop], y = blockTop - (blockTop - blockFloor) * d, over = MID_TOP + HOLO.foot + HOLO.tall + 0.6;
            const off = y > over ? 1 - ease((blockTop - y) / (blockTop - over)) : 0, under = y < MID_TOP ? (MID_TOP - y) / (MID_TOP - blockFloor) : 0;
            block.position.x = from.x * off + g0[0] * under; block.position.z = from.z * off + g0[1] * under; block.position.y = y; block.rotation.y = now * 0.6; setScale(block, 1);
          }
          else if (td >= 5 && td < 10) { const u = ease((td - 5) / 5), i = u * live.newest, kk = Math.floor(i), f = i - kk, a0 = chainAt(kk, ch0), a1 = chainAt(Math.min(POC.chain - 1, kk + 1), ch1); block.position.x = a0[0] + (a1[0] - a0[0]) * f; block.position.z = a0[1] + (a1[1] - a0[1]) * f; block.position.y = blockFloor + (M.chainY - blockFloor) * Math.min(1, u * 3); block.rotation.y = -a0[2]; setScale(block, 0.6); }
          else setScale(block, 0.001);
        }
        // ---- the chain: holographic cubes gliding slowly along the spiral; genesis and the newest in orange; the pulse back ----
        const glide = (now * 0.05) % 1, pulseAt = td >= 10 && td < 15 ? (1 - ease((td - 10) / 5)) * live.newest : -1;
        for (let i = 0; i < chainE.length; i++) {
          const e = chainE[i], f = chainF[i], pos = chainAt(Math.min(POC.chain - 1 + 0.999, i + glide), ch0);
          const orange = i === 0 || i === live.newest, lit = pulseAt >= 0 && i - pulseAt >= 0 && i - pulseAt < 8;
          const deep = 1 - 0.35 * i / (POC.chain - 1);
          if (e) { e.position.x = pos[0]; e.position.z = pos[1]; e.position.y = chainY(i + glide); e.rotation.y = -pos[2] + now * 0.15; e.geometry = orange ? edgesO() : edgesG(); setScale(e, deep * (orange ? 1.3 : 0.9) * (lit ? 1.35 : 1) * (i === live.newest && td >= 0 && td < 10 ? 0.001 : 1)); }
          if (f) { f.position.x = pos[0]; f.position.z = pos[1]; f.position.y = chainY(i + glide); f.rotation.y = Math.PI - Math.atan2(pos[0], pos[1]); f.geometry = orange ? faceO() : faceG(); setScale(f, deep * (orange ? 1.3 : 0.9) * (lit ? 1.4 : 1)); }
        }
        // ---- the hints to the door ----
        for (let i = 0; i < strays.length; i++) { const n = strays[i]; if (!n) continue; const u = (t - tStray0 - i * 0.9) / 6; if (u < 0 || u >= 1) { setScale(n, 0.001); continue; } const e = ease(u); n.position.x = roadPt.x + (foot.x - roadPt.x) * e + Math.sin(t * 6 + i) * 0.12; n.position.z = roadPt.z + (foot.z - roadPt.z) * e + Math.cos(t * 5 + i * 2) * 0.12; n.position.y = T.roadY + Math.sin(t * 8 + i) * 0.06; setScale(n, u < 0.7 ? 0.8 : 0.8 * (1 - (u - 0.7) / 0.3)); }
        { const tA = td - 10; for (let i = 0; i < arm.length; i++) if (arm[i]) setScale(arm[i], i === 7 ? 0.5 : (tA >= i * 0.35 && tA < 30 ? Math.max(0.001, 0.7 * (1 - clamp01((tA - 20) / 10))) : 0.001)); }
        for (let i = 0; i < trickle.length; i++) { const n = trickle[i]; if (!n) continue; const u = ((now + i * 7 / 8) % 7) / 7, from = at(sPortal - 1.5 + i * 0.3, p); n.position.x = from.x + (foot.x - from.x) * u + Math.sin(now * 2 + i) * 0.08; n.position.z = from.z + (foot.z - from.z) * u + Math.cos(now * 1.7 + i) * 0.08; n.position.y = T.roadY - 0.12; setScale(n, 0.45 * (u < 0.1 ? u / 0.1 : u > 0.85 ? (1 - u) / 0.15 : 1)); }
        lastT = t;
      };
      BL.timechainGenesis.live = live;
      BL.timechainGenesis.floorPoc = { force: (t) => { forced = t; lastT = -1; }, drop: (h) => drop(h), cycle: T.cycle, stream: T.stream, turn: T.turn, phases: { stream: 0, turn: tStream, burst: tTurn, charge: tBurst, net: tCharge, fade: tNet, dark: tFade }, cum, ringLen, total, path, clusters: clusters.length, links: links.length, live };
      return { update, dispose() { if (unsub) unsub(); } };
    };
    return { plan, animate };
  })();

  // The whitepaper's references that stand on a plinth, in citation order.
  const THREADS = [{ ref: 1, id: "bmoney" }, { ref: 3, id: "timestamp" }, { ref: 6, id: "hashcash" }, { ref: 7, id: "merkle" }];
  // The Block 0 screen: its header; `nonce` 0..1 how far the count has run, `hash` 0..1 how much of the hash has printed,
  // `head` 0..1 how much of the headline has typed.
  const BLOCK_HASH = "000000000019D6689C085AE165831E934FF763AE46A2A6C172B3F1B60A8CE26F", NONCE = 2083236893;
  const paintBlockScreen = (ctx, W, H, nonce, hash, head) => {
    const k = W / 1224;
    ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(247,147,26,.35)"; ctx.lineWidth = 4 * k; ctx.strokeRect(8 * k, 8 * k, W - 16 * k, H - 16 * k);
    P.pix(ctx, "BLOCK 0 · 3 JAN 2009", W / 2, 74 * k, 52 * k, C.glow);
    for (const [face, t, size] of [["block line", "BLOCK 0 · 3 JAN 2009", 52], ["nonce", `NONCE ${NONCE}`, 40], ["figures", "DIFFICULTY 1 · REWARD 50 BTC · 1 TRANSACTION", 24], ["hash row", BLOCK_HASH.slice(0, 16), 34], ["headline 1", "THE TIMES 03/JAN/2009 CHANCELLOR ON BRINK", 28], ["headline 2", "OF SECOND BAILOUT FOR BANKS", 28]]) fitRec("genesis", `screen · ${face}`, W, P.pixWidth(t, size * k));
    const n = Math.round(NONCE * (nonce < 1 ? Math.pow(nonce, 0.6) : 1)), nonceWord = nonce < 1 ? String(n).padStart(10, "0") : String(NONCE);
    P.pix(ctx, `NONCE ${nonceWord}`, W / 2, 160 * k, 40 * k, nonce < 1 ? C.glow : C.white);
    P.pix(ctx, "DIFFICULTY 1 · REWARD 50 BTC · 1 TRANSACTION", W / 2, 225 * k, 24 * k, "#d4c8b6");
    const shown = Math.round(64 * hash);
    for (let i = 0; i < 4; i++) { const part = BLOCK_HASH.slice(i * 16, Math.min(i * 16 + 16, shown)); if (part) P.pix(ctx, part, W / 2, 300 * k + i * 54 * k, 34 * k, C.glow); }
    const line = "THE TIMES 03/JAN/2009 CHANCELLOR ON BRINK", line2 = "OF SECOND BAILOUT FOR BANKS", all = line + "|" + line2, cut = Math.round(all.length * head), t1 = line.slice(0, cut), t2 = cut > line.length + 1 ? line2.slice(0, cut - line.length - 1) : "";
    ctx.fillStyle = "rgba(247,147,26,.14)"; ctx.fillRect(40 * k, 560 * k, W - 80 * k, 150 * k);
    if (t1) P.pix(ctx, t1, W / 2, 605 * k, 28 * k, C.white);
    if (t2) P.pix(ctx, t2, W / 2, 665 * k, 28 * k, C.white);
  };

  // ---------- the plan ----------
  // The doorway's trim, the dome, the cap over the crown and the floor; the ring of plinths,
  // cases and plaques; the middle; the lights.
  const plan = (K, L) => {
    doorTrim(K, L);
    K.wallColor("#1c1d22");
    // A dark room lit by its own light: the bloom of the Sphere's other dark rooms (and near the Factory's and the Hangar's).
    K.render({ sky: [0.52, 0.5, 0.48], ground: [0.22, 0.2, 0.18], ambientFloor: 0.42, bloomStrength: 0.8 });
    K.dome((ctx, D) => paintDome(ctx, D, L));
    // The cap stands well inside the dome, so Canvas 2D's face sort keeps it in front of the dome's own faces; its key
    // never changes, so it is painted once.
    K.live({ cap: true, el0: Math.acos((CAP.rIn + CAP.ring / 2) / (L.R * 0.97)) / DEG, inset: 0.97, w: CAP.px, h: CAP.px, id: "mark", tip: "Where the road led: the whitepaper and the genesis block · Open mempool.space ↗", key: () => "genesis", paint: (ctx) => paintCap(ctx) });
    floorPoc.plan(K, L);
    // The ₿ over the crown, a mosaic of squares (`MARK`): one tile geometry shared by every square, each a node the
    // animator sizes, turns from white to orange as its transaction lands, flashes on a block and lets one fall.
    { const capY = L.c + L.R * 0.97 * Math.sin(CAP.el * DEG) - 0.6, cell = MARK.cell;
      MARK.squares.forEach((q, i) => K.node(`btile${i}`, MARK_TILE.white(), q.x, capY, q.z, { scale: 0.001 }));
      // Behind each of the pattern's cells a soft orange glow that grows as the squares over it turn.
      // The stars the block's height is written in (`HEIGHT`): a pool of soft points, one geometry between them, a
      // metre under the mark's own height, where the dome's facets, which cut inside its curve, are still behind them.
      { const star = softDot("#ffc27a", 0.42, 0.22, 1, 1.3); for (let i = 0; i < HEIGHT.stars; i++) K.node(`hstar${i}`, star(), 0, capY - 1, 0, { rx: HALF_PI, glow: true, scale: 0.001 }); }
      { const bGlow = softDot(C.btc, 1.0, 0.15, 0.5, 0.6); SYMBOL.forEach((row, ri) => [...row].forEach((ch, ci) => { if (ch !== "#") return; K.node(`bglow:${ci}:${ri}`, bGlow(), (ci - (row.length - 1) / 2) * cell, capY + 0.2, -(ri - (SYMBOL.length - 1) / 2) * cell, { rx: HALF_PI, glow: true, scale: 0.001 }); })); }
    }
    // The ring's cards: each plinth's entries side by side on its front (walk order left to right), as bands.
    const FRONT = RING - FACE, ringCards = [];
    PLINTHS.forEach((p, i) => p.entries.forEach((ex, j) => {
      const off = (j - (p.entries.length - 1) / 2) * CARD.pitch, a = azOf(i) * DEG;
      // The card's centre: along the flat front, `off` from its middle.
      const x = FRONT * Math.sin(a) + off * Math.cos(a), z = -FRONT * Math.cos(a) + off * Math.sin(a);
      ringCards.push({ ex, az: azOf(i) + Math.atan(off / FRONT) / DEG, face: azOf(i), r: Math.hypot(FRONT, off), x, z, plinth: i, off });
    }));
    ringBands(ringCards, FRONT, CARD.y).forEach((b, i) => K.node(`galleryBand${i}`, b.geo, b.x, 0, b.z, { ry: b.ry, glow: true }));
    // The two moving floors are invisible: the glass is the same everywhere, and `carry` alone moves a body
    // standing in a loop's lane (the inner one the walk's way, 1974 to 2009, the outer one back), at a slow stroll.
    // The year's facts are cut into the plinths' backs, which visitors walk round to.
    // The seating: one continuous shelf bench fixed to the perimeter wall all the way round, cantilevered so the
    // space under it stays open (the liquidity channel's place next round), a soft underglow along its front edge, a
    // sitting place every 1.25 m facing the middle. It breaks only at the doorway; the short section in front of the
    // portal's wall is its own node, which slides back into the wall as the door's light is drawn, so nothing gives
    // the door away at rest. Angles here are the kit's (b = π − azimuth): the door at 0.
    { const rOut = ROOMS.radiusAt(L, 0.5) - 0.02, D = 0.55, rIn = rOut - D, y0 = 0.42, y1 = 0.48, dGap = Math.asin(Math.min(1, (ROOMS.DOOR.halfW + 2.0) / rOut)), pHalf = 1.7 / rOut, pa = Math.PI - PORTAL.az * DEG;
      const runs = [[dGap, pa - pHalf], [pa + pHalf, TAU - dGap]];
      const shelf = (k, b0, b1, steps) => { k.sector(0, rIn, rOut, b0, b1, y0, y1, "#3a3f4a", { steps }); k.sector(0, rIn, rIn + 0.04, b0, b1, y0 - 0.05, y1, C.steelDark, { steps }); k.sector(0, rIn - 0.006, rIn + 0.03, b0, b1, y0 - 0.075, y0 - 0.05, C.amber, { emissive: 0.9, glow: true, steps }); };
      for (const [b0, b1] of runs) shelf(K, b0, b1, Math.max(8, Math.round((b1 - b0) * 60)));
      K.node("ledgePortal", (k) => shelf(k, pa - pHalf, pa + pHalf, 24), 0, 0, 0);
      // SIT is how near a seat a body can take it (the interior's reach), so how wide a seat's own prompt is.
      const rSeat = rIn + 0.22, step = 1.25 / rSeat, SIT = 1.3, E = L.exitButton, wake = portalSpot(L);
      for (const [b0, b1] of runs) for (let bb = b0 + step / 2; bb < b1 - step / 3; bb += step) {
        const az = Math.PI - bb, x = rSeat * Math.sin(az), z = -rSeat * Math.cos(az);
        // None whose prompt comes within its own width of the Exit button's, the same on both sides of the doorway, or
        // of the portal's: where Space walks out or wakes the door, no seat is in reach or a step away.
        if (Math.hypot(Math.abs(x) - Math.abs(E.x), z - E.z) < L.exitReach + SIT * 2 || Math.hypot(x - wake.x, z - wake.z) < PORTAL.prompt + SIT * 2) continue;
        const g = K.group(x, 0, z, headingTo(x, z, 0, 0) + Math.PI);
        // The standing spot is in front of the bench (a negative `back`): behind it is the room's edge.
        const place = g.seat(0, 0, 0, 0.45, 0, -0.9, "bench");
        g.node(null, null, 0, 0.3, 0, { target: { kind: "chair", tip: "The ledge · Space to sit and watch", radius: 0.5, index: place.index } });
      }
      BL.timechainGenesis.ledge = { rIn, rOut, y: y1, pitch: 1.25 };
    }
    portalPlan(K, L);
    // The pieces on the ring's plinths. Near, each plinth's piece and its glass are nodes of their own, so one plinth
    // can give its place to its first version; far, a sector's pieces are one lighter build and its glass one mesh.
    // One of the two is shown at a time. The near build's bubbles, sparks and lamps are nodes of their own
    // (timechain-genesis-models.js `flow`, `blink`), a kind sharing one geometry.
    const pieceAt = (i, opts) => (k) => { const { x, z } = spotOf(i); GM.model(k.group(x, 0, z, headingTo(x, z, 0, 0)), PLINTHS[i].model, TOP + RISE + 0.005, { unit: BIG, lip: RISE, ...opts }); };
    PLINTHS.forEach((p, i) => {
      K.node(`galleryPiece${i}`, pieceAt(i, { moving: true }), 0, 0, 0);
      const glass = K.node(`galleryPieceGlass${i}`, pieceAt(i, { glass: true }), 0, 0, 0).geometry;
      glass.glass = PIECE_GLASS.alpha; glass.castShadow = false;
    });
    for (let sct = 0; sct < SECTORS; sct++) {
      const pieces = (opts) => (k) => { PLINTHS.forEach((p, i) => { if (Math.floor(i * SECTORS / PLINTHS.length) === sct) pieceAt(i, opts)(k); }); };
      K.node(`gallerySectorLow${sct}`, pieces({ quiet: true }), 0, 0, 0);
      const glass = K.node(`galleryGlassLow${sct}`, pieces({ quiet: true, glass: true }), 0, 0, 0).geometry;
      glass.glass = PIECE_GLASS.alpha; glass.castShadow = false;
    }
    // Each plinth's first version, built once here and hidden until a visitor comes up to it: a node standing on the
    // plinth's top, turned with it, so it grows out of the plinth and shrinks back into it, with a cool ring of light
    // on the deck round its foot. A column of light covers the change, and while it is shown its plaque's band reads
    // FIRST VERSION (one shared word).
    PLINTHS.forEach((p, i) => {
      const { x, z } = spotOf(i), ry = headingTo(x, z, 0, 0);
      K.node(`galleryFirst${i}`, firstPiece(i), x, TOP, z, { ry, scale: 0.001 });
      K.node(`firstShimmer${i}`, firstColumn(), x, TOP + RISE, z, { rz: HALF_PI, glow: true, scale: 0.001 });
      K.node(`firstTag${i}`, firstWord(), x - Math.sin(ry) * ((DEPTH + 0.04) / 2 + 0.003), TOP - 0.03, z - Math.cos(ry) * ((DEPTH + 0.04) / 2 + 0.003), { ry, glow: true, scale: 0.001 });
    });
    // The words cut into the plinths, in INSC_GROUPS nodes round the ring (each shown only to a visitor near it).
    // The words are laid out as at the museum's size, on faces `WORDS` times smaller than these, and cut `WORDS` times as large.
    const inscribe = (g, p, w) => { for (const sx of [-1, 1]) engrave(g.group(sx * (w / 2 + 0.004), 0, 0, -sx * HALF_PI), p.id, DEPTH / WORDS, 0.77, sx < 0 ? "left side" : "right side"); engraveFacts(g.group(0, 0, FACE, Math.PI), p, w / WORDS, 0.77); };
    for (let grp = 0; grp < INSC_GROUPS; grp++) K.node(`inscGroup${grp}`, (k) => { PLINTHS.forEach((p, i) => { if (Math.floor(i * INSC_GROUPS / PLINTHS.length) !== grp) return; const { x, z } = spotOf(i); inscribe(k.group(x, 0, z, headingTo(x, z, 0, 0)), p, widthOf(p)); }); }, 0, 0, 0);
    // The plinths, each turned to the middle, its plaque on its front, every piece open.
    PLINTHS.forEach((p, i) => {
      const { x, z } = spotOf(i), g = K.group(x, 0, z, headingTo(x, z, 0, 0)), w = widthOf(p);
      const target = { kind: "genesis", tip: `${p.entries[0].when} · ${p.entries[0].name} · tap to see it up close`, radius: 0.95 * BIG, index: p.entries[0].index };
      plinthBody(g, w);
      // Satoshi's words on the two side faces and the year's facts on the back: here only their dark panels.
      CUT.panels = true; inscribe(g, p, w); CUT.panels = false;
      // A ring of light that rises under the plinth as a visitor comes near, and the year tick in the floor before it
      // that lights as they pass (one shared geometry each).
      K.node(`focusRing${i}`, glowRing(), x, 0.012, z, { glow: true, scale: 0.001 });
      { const a = azOf(i) * DEG, rr = RING - 1.35 * BIG; K.node(`yearTick${i}`, glowBar(), rr * Math.sin(a) - 0.3 * Math.cos(a), 0.01, -rr * Math.cos(a) - 0.3 * Math.sin(a), { ry: -a, glow: true, scale: 0.001 }); }
      // A tap target at each card (an empty node: the card itself is drawn in its band), and one at the piece.
      g.node(null, null, 0, TOP + 0.3 * BIG, 0, { target });
      for (const card of ringCards) if (card.plinth === i) g.node(null, null, -card.off, CARD.y, -FACE, { target: { ...target, index: card.ex.index, tip: `${card.ex.when} · ${card.ex.name} · tap to see it up close` } });
      g.solid({ x: 0, z: 0, hx: w / 2 + 0.06, hz: DEPTH / 2 + 0.06 });
    });
    // The middle, the room's showpiece: a round drum with an amber ring and, over it, the hologram alone (`HOLO`),
    // thrown up from an emitter set into the drum's top; one flat card on the drum's side.
    { const g = K.group(0, 0, 0, Math.PI);
      g.cyl(MID_R, MID_R, MID_TOP, C.concrete, 0, MID_TOP / 2, 0, { seg: 48 });
      g.torus(MID_R, 0.03, C.btc, 0, MID_TOP, 0, { emissive: 1, glow: true, seg: 64 });
      const paper = EXHIBITS.find((ex) => ex.key === "whitepaper");
      // A press on the figure, or on the plaque, opens the pop-up about the paper, which leads to the large reader.
      const COARSE = matchMedia("(pointer: coarse)").matches;
      const tP = { kind: "genesis", tip: COARSE ? "The whitepaper · tap to read" : "The whitepaper · click to read", index: paper.index };
      const tI = { kind: "genesis", tip: "31 Oct 2008 · the whitepaper · about this paper", radius: 1.1, index: paper.index };
      // The emitter in the drum's top: a dark well, a lit lens in a bezel at its middle, two rings of light round it.
      // Over it the cone of light it throws; a frame at the figure's foot that turns, a ring of light under it; the
      // figure in that frame, set so it turns about its own middle; two sheets of light that climb through it; the
      // node that carries its flat picture on the Canvas 2D fallback. The figure is its own tap target, a sphere
      // generously round the whole of it (a target's radius is in its node's own measure), and the flat picture is
      // where that stands in for it. The figure and the cone are light (`glow`): they stand in no one's sight.
      { const s = HOLO.tall / 0.909, y0 = MID_TOP + HOLO.foot;
        g.cyl(0.98, 0.98, 0.016, "#0c1418", 0, MID_TOP + 0.008, 0, { seg: 48 });
        g.torus(0.9, 0.022, C.glow, 0, MID_TOP + 0.03, 0, { emissive: 1, glow: true, seg: 64 });
        g.torus(0.62, 0.008, C.glowText, 0, MID_TOP + 0.024, 0, { emissive: 1, glow: true, seg: 64 });
        g.cyl(0.16, 0.16, 0.03, C.glowText, 0, MID_TOP + 0.031, 0, { emissive: 1, glow: true, seg: 24 });
        g.torus(0.22, 0.02, "#3a3f4a", 0, MID_TOP + 0.034, 0, { seg: 32 });
        K.node("holoCone", holoCone(), 0, MID_TOP + 0.05, 0, { rz: HALF_PI, glow: true });
        K.node("holoSpin", (k) => { k.torus(0.47 * s, 0.012, C.glow, 0, -0.08, 0, { emissive: 1, glow: true, seg: 48 }); }, 0, y0, 0);
        K.node("holoFigure", holoFigure(), 0, 0, 0.24 * s, { parent: "holoSpin", scale: s, glow: true, target: { ...tP, radius: 0.65 * HOLO.tall / s } });
        K.node("holoFlat", holoSheet(), 0, 0.35 * HOLO.tall / 0.62, 0, { parent: "holoSpin", scale: 0.001, target: { ...tP, radius: 0.65 * HOLO.tall } });
        for (let i = 0; i < 2; i++) K.node(`holoSheet${i}`, holoSheet(), 0, 0, 0, { parent: "holoSpin", rx: HALF_PI, glow: true, scale: 0.001 });
      }
      // One flat card on the drum's side.
      const rc = MID_R + 0.008;
      { const mb = band([{ ex: paper, az: 180, r: rc, curved: true }], rc, MID_CARD.y, true, paintPlaque, MID_CARD, PPM); K.node(null, mb.geo, mb.x, 0, mb.z, { ry: mb.ry, glow: true }); g.node(null, null, 0, MID_CARD.y, -rc, { target: tI }); }
      g.solid({ x: 0, z: 0, r: 1.62 });
      // Block 0's face as a live screen on its plinth, over the cut header: the same figures, and at the show's
      // burst the nonce counting up to 2083236893, the hash printing digit by digit and the headline typing out.
      const BS = BIG, bw = (1.1 - 0.08) * BS, bh = (0.7 - 0.08) * BS, bcv = CH.canvas(1224, 744), bctx = bcv.getContext("2d");
      const blockGeo2 = RM.flatPicture(bcv, bw, bh, 0.75);
      paintBlockScreen(bctx, 1224, 744, 1, 1, 1);
      { const gi = PLINTHS.findIndex((p) => p.id === "genesis"), sp = spotOf(gi), h = headingTo(sp.x, sp.z, 0, 0), lz = -0.1 * BS - 0.004;
        K.node("blockScreen", blockGeo2, sp.x + lz * Math.sin(h), TOP + RISE + 0.005 + (0.12 + 0.35) * BS, sp.z + lz * Math.cos(h), { ry: h + Math.PI }); }
      BL.timechainGenesis.blockScreen = { canvas: bcv, ctx: bctx, geo: blockGeo2 };
      // The slab's back, the coinbase, as a picture too: the address and The Times' headline in their own letters
      // (the room's pixel letters are capitals only, and an address is not).
      { const gi = PLINTHS.findIndex((p) => p.id === "genesis"), sp = spotOf(gi), h = headingTo(sp.x, sp.z, 0, 0), lz = 0.1 * BS + 0.004;
        K.picture(bw, bh, 1224, 744, (ctx, w, hh) => {
          ctx.fillStyle = C.ink; ctx.fillRect(0, 0, w, hh);
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          P.pix(ctx, "COINBASE", w / 2, 70, 56, C.glow);
          const say = (t, y, font, color) => { ctx.font = font; ctx.fillStyle = color; ctx.fillText(t, w / 2, y); fitRec("genesis", `coinbase · ${t.slice(0, 28)}`, w, ctx.measureText(t).width); };
          say("The message in the first transaction", 140, P.font(500, 30), "#d4c8b6");
          ctx.fillStyle = "#1c1813"; ctx.fillRect(90, 190, w - 180, 150);
          say("The Times 03/Jan/2009 Chancellor on", 240, P.font(600, 44), C.white); say("brink of second bailout for banks", 296, P.font(600, 44), C.white);
          say("50 BTC to", 400, P.font(500, 30), "#d4c8b6");
          say("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", 452, "600 44px ui-monospace, Menlo, Consolas, monospace", C.glowText);
          say("never spent: the software does not let anyone spend it", 506, P.font(500, 28), "#a89c8b");
          say("Next: block 1 · 9 Jan 2009", 600, P.font(600, 38), C.btcGlow);
          say("Every block since points back to this one", 660, P.font(500, 30), "#d4c8b6");
        }, sp.x + lz * Math.sin(h), TOP + RISE + 0.005 + (0.12 + 0.35) * BS, sp.z + lz * Math.cos(h), { ry: h, emissive: 0.75 }); }
    }
    // Light: a wide warm spot over the middle that reaches the ring, and a dim wash over the dome's front (every light
    // is a per-pixel cost over the whole screen, about a tenth of a frame on an integrated GPU); the plaques, the
    // bands and the amber lines light themselves.
    K.light(0, 5.5, 0, 14, 1, 0.94, 0.86);
    K.light(0, 9, -5, 22, 0.5, 0.46, 0.42);
  };

  // ---------- what moves, and the viewer ----------
  // `hud` is the visit's HUD (its Proof of Knowledge panel and whitepaper reader); `gone` ends every listener the visit
  // put on them. A tap on a piece, or Space in front of one, opens it in the model viewer, every entry in date order.
  const animate = (nodes, built, feeds, menuOpen, hud, drawnBy) => {
    const gone = new AbortController(), poc = floorPoc.animate(nodes, built);
    const spots = PLINTHS.map((p, i) => ({ ...spotOf(i), index: p.entries[0].index }));
    const smooth = (k) => k * k * (3 - 2 * k), unit = (v) => Math.max(0, Math.min(1, v));
    // The pieces' glass, each plinth's near mesh and each sector's far one: it breathes, each sector a little after the
    // last round the ring (held still for a visitor who asks for less motion).
    const sectorOf = (i) => Math.floor(i * SECTORS / PLINTHS.length), calm = matchMedia("(prefers-reduced-motion: reduce)");
    const glass = PLINTHS.map((_, i) => nodes[`galleryPieceGlass${i}`].geometry), glassFar = Array.from({ length: SECTORS }, (_, i) => nodes[`galleryGlassLow${i}`].geometry);
    // The shared clock's seconds, so every player's show stands at the same point of its cycle.
    const clock = () => (BL.net && typeof BL.net.serverNow === "function" ? BL.net.serverNow() : Date.now()) / 1000;
    const focus = PLINTHS.map((p, i) => ({ node: nodes[`focusRing${i}`], tick: nodes[`yearTick${i}`], ...spotOf(i), level: 0, lit: 0, boost: 0 })), genesisAt = PLINTHS.findIndex((p) => p.id === "genesis");
    const screen = BL.timechainGenesis.blockScreen;
    // The mark's squares and the glow behind each of the pattern's cells. `mark` is what the stream's dots ask: the
    // order the squares turn in (shuffled afresh for each block from the block's own time, so every visitor sees the
    // same squares turn), how many have been handed to a dot (`next`), and `light`, a landing.
    const tiles = MARK.squares.map((q, i) => ({ ...q, node: nodes[`btile${i}`], lit: false, at: -1e9, d: Math.hypot(q.x, q.z), seed: (i * 7919) % 97, look: "", sc: -1 })), reach = Math.max(...tiles.map((q) => q.d));
    const glowOf = Array.from({ length: MARK.cols * MARK.rows }, (_, k) => nodes[`bglow:${k % MARK.cols}:${Math.floor(k / MARK.cols)}`] || null), litArea = new Float32Array(MARK.cols * MARK.rows);
    const mark = { order: new Int32Array(tiles.length), next: 0, lit: 0, target: 0, block: NaN, count: tiles.length,
      claim() { return this.next < this.target ? this.order[this.next++] : -1; },
      light(i, at, spark) { const q = tiles[i]; if (!q || q.lit) return; q.lit = true; q.at = spark ? at : -1e9; this.lit++; for (let j = 0; j < q.cells.length; j++) litArea[q.cells[j]] += q.n * q.n / q.cells.length / 16; },
      // The order is shuffled in place, in the one list the mark keeps; only the block's own generator is made anew.
      reset(blockAt) { this.block = blockAt; this.next = 0; this.lit = 0; litArea.fill(0); for (let i = 0; i < tiles.length; i++) { tiles[i].lit = false; tiles[i].at = -1e9; } const rr = P.rng(Math.floor(blockAt) % 2147483647 || 1), o = this.order; for (let i = 0; i < o.length; i++) o[i] = i; for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rr() * (i + 1)), v = o[i]; o[i] = o[j]; o[j] = v; } }
    };
    BL.timechainGenesis.mark = mark;
    let screenState = -2;
    // The hologram's figure, or on the Canvas 2D fallback the flat picture of it in its place.
    const spin = nodes.holoSpin, figure = nodes.holoFigure, sheets = [nodes.holoSheet0, nodes.holoSheet1], flat = drawnBy === "canvas2d";
    // A falling block's own node, whose height drives the ripple it sends down the figure, and how much of that
    // ripple is still in the figure once the block has gone.
    const falling = nodes.pocBlock, figureZ = figure.position.z;
    let ripple = 0;
    if (flat) { const n = nodes.holoFlat; figure.visible = false; n.geometry = holoFlat(); n.scale.x = n.scale.y = n.scale.z = 1; }
    // The stars of the block's height: where each waits in the sky (`hx`, `hz`), where it
    // scatters to (`gx`, `gz`), its pixel of the line (`tx`, `tz`), when it sets out and how it twinkles.
    const FT = BL.jumbotron.text, NS = HEIGHT.stars;
    const hs = { n: 0, c: 0, shown: 0, on: false, w: 0, zc: 0, node: Array.from({ length: NS }, (_, i) => nodes[`hstar${i}`]), tx: new Float32Array(NS), tz: new Float32Array(NS), hx: new Float32Array(NS), hz: new Float32Array(NS), gx: new Float32Array(NS), gz: new Float32Array(NS), lag: new Float32Array(NS), tw: new Float32Array(NS), ph: new Float32Array(NS), digits: new Uint8Array(12) };
    { const rr = P.rng(2009), R0 = CAP.rIn + 1, spot = (X, Z, i) => { const a = (rr() * 2 - 1) * 110 * DEG, r = R0 + rr() * (9.4 - R0); X[i] = r * Math.sin(a); Z[i] = -r * Math.cos(a); };
      for (let i = 0; i < NS; i++) { spot(hs.hx, hs.hz, i); spot(hs.gx, hs.gz, i); hs.lag[i] = rr() * 0.6; hs.tw[i] = 3 + rr() * 5; hs.ph[i] = rr() * TAU; } }
    const WORD = ["B", "L", "O", "C", "K"].map((ch) => FT.FONT[ch]), DIGIT = "0123456789".split("").map((ch) => FT.FONT[ch]), COMMA = FT.FONT[","];
    // One letter's lit pixels into the line, the next star to each, on the line's bend.
    const put = (glyph) => {
      if (glyph) for (let r = 0; r < 7; r++) for (let j = 0; j < 5; j++) if (glyph[r] & (16 >> j) && hs.n < NS) {
        const th = ((hs.c * 6 + j + 0.5) * HEIGHT.pitch - hs.w / 2) / HEIGHT.bend, rho = HEIGHT.bend - (3 - r) * HEIGHT.pitch;
        hs.tx[hs.n] = rho * Math.sin(th); hs.tz[hs.n] = hs.zc - rho * Math.cos(th); hs.n++;
      }
      hs.c++;
    };
    const writeHeight = (h) => {
      let nd = 0;
      for (let v = h; v > 0 && nd < 12; v = Math.floor(v / 10)) hs.digits[nd++] = v % 10;
      hs.w = ((6 + nd + Math.floor((nd - 1) / 3)) * 6 - 1) * HEIGHT.pitch; hs.zc = -(CAP.rIn + CAP.ring / 2 + HEIGHT.gap * CAP.rIn) + HEIGHT.bend - 3.5 * HEIGHT.pitch;
      for (let i = 0; i < hs.n; i++) if (hs.node[i]) hs.node[i].scale.x = hs.node[i].scale.y = hs.node[i].scale.z = 0.001;
      hs.n = 0; hs.c = 0;
      for (let i = 0; i < 5; i++) put(WORD[i]);
      put(null);
      for (let i = nd - 1; i >= 0; i--) { put(DIGIT[hs.digits[i]]); if (i && i % 3 === 0) put(COMMA); }
    };
    const dialogOpen = () => { const d = document.getElementById("model-modal"), r = document.getElementById("wp-reader"); return !!(d && d.open || r && r.open); };
    // Each plinth on the ring: its piece and glass near, its first version (`level`: 0 the piece, 1 the first version,
    // between them while they change places), the column of light over the change and the plaque's word, and what
    // flows and blinks on its piece. `sectors` hold the far builds, swapped with the plinths' near ones by distance.
    const plinths = PLINTHS.map((p, i) => ({ piece: nodes[`galleryPiece${i}`], glass: nodes[`galleryPieceGlass${i}`], first: nodes[`galleryFirst${i}`], column: nodes[`firstShimmer${i}`], tag: nodes[`firstTag${i}`], x: spots[i].x, z: spots[i].z, sector: sectorOf(i), level: 0, flows: [], blinks: [] }));
    const sectors = Array.from({ length: SECTORS }, (_, i) => ({ far: nodes[`gallerySectorLow${i}`], farGlass: nodes[`galleryGlassLow${i}`], spots: spots.filter((_, j) => sectorOf(j) === i), plinths: plinths.filter((q) => q.sector === i), isNear: true }));
    for (const s of sectors) s.far.visible = s.farGlass.visible = false;
    for (const q of plinths) q.first.visible = q.column.visible = q.tag.visible = false;
    // What flows and blinks on the pieces, by the plinth it stands on (the nearest): only a plinth shown near with its
    // piece has its own moved. `drift` puts a flow's part `u` of the way along: carried, swaying a little to either
    // side, small as it sets out and as it arrives.
    for (const name of Object.keys(nodes)) {
      const f = name.split(":");
      if (f[0] !== "flow" && f[0] !== "blink") continue;
      const n = nodes[name];
      let home = plinths[0], least = Infinity;
      for (const q of plinths) { const d = Math.hypot(q.x - n.position.x, q.z - n.position.z); if (d < least) { least = d; home = q; } }
      if (f[0] === "blink") home.blinks.push({ node: n, period: Number(f[2]), phase: Number(f[3]) });
      else home.flows.push({ node: n, x: n.position.x, y: n.position.y, z: n.position.z, dx: Number(f[2]), dy: Number(f[3]), dz: Number(f[4]), spread: Number(f[5]), period: Number(f[6]), phase: Number(f[7]), size: n.scale.x });
    }
    const drift = (q, u) => {
      const n = q.node, k = Math.max(0.001, q.size * Math.min(1, u * 6, (1 - u) * 6));
      n.position.x = q.x + q.dx * u + q.spread * Math.sin(TAU * (u * 2 + q.phase * 7)); n.position.y = q.y + q.dy * u; n.position.z = q.z + q.dz * u + q.spread * Math.cos(TAU * (u * 1.5 + q.phase * 5));
      n.scale.x = n.scale.y = n.scale.z = k;
    };
    // A plinth as its `level` stands, its sector near or not: the piece (with its glass, flows and lamps) until half
    // way, then the first version, grown out of the plinth's top as the piece goes, under a column of light that is
    // brightest at the change, and the plaque's word once it stands there.
    const showPlinth = (q, near) => {
      const k = smooth(q.level), piece = near && q.level < 0.5, first = near && q.level > 0, moving = q.level > 0 && q.level < 1;
      if (q.piece.visible !== piece) { q.piece.visible = q.glass.visible = piece; for (let j = 0; j < q.flows.length; j++) q.flows[j].node.visible = piece; for (let j = 0; j < q.blinks.length; j++) q.blinks[j].node.visible = piece; }
      q.first.visible = first; q.first.scale.x = q.first.scale.y = q.first.scale.z = Math.max(0.001, k);
      q.column.visible = near && moving; q.column.scale.x = q.column.scale.y = q.column.scale.z = Math.max(0.001, Math.sin(Math.PI * q.level));
      q.tag.visible = near && q.level > 0.5; q.tag.scale.x = q.tag.scale.y = q.tag.scale.z = Math.max(0.001, 2 * q.level - 1);
    };
    // Where each stands until it is first moved, and for a visitor who asks for less motion.
    for (const q of plinths) for (const w of q.flows) drift(w, 0.15 + 0.7 * w.phase);
    const insc = Array.from({ length: INSC_GROUPS }, (_, i) => ({ node: nodes[`inscGroup${i}`], spots: spots.filter((_, j) => Math.floor(j * INSC_GROUPS / PLINTHS.length) === i), on: true })).filter((q) => q.node);
    let px = 0, pz = 14;
    const carried = { x: 0, z: 0 };
    const show = (i) => BL.modelViewer.open({
      title: "Genesis Museum", theme: "genesis", count: EXHIBITS.length, index: i,
      help: matchMedia("(pointer: coarse)").matches ? "Drag to turn it · pinch to zoom · the arrows for the next piece" : "Drag to turn it · scroll to zoom · ← → for the next piece",
      item: (n) => {
        const ex = EXHIBITS[n], link = LINK[ex.link];
        return { kicker: `${ex.when} · ${ex.title} · ${ex.link === "cite" ? `${link.word} [${ex.ref}]` : link.word}`, name: ex.name, text: ex.about, stats: ex.specs, note: ex.note, links: ex.sources, geometry: ex.key === "satoshi" ? soloFigure() : viewModel()[n], image: ex.key === "whitepaper" && BL.whitepaperPages && BL.whitepaperPages.pages[0] || null, ...(ex.key === "whitepaper" ? { onImage: () => readLarge(0), buttons: [{ label: "READ THE WHITEPAPER", run: () => readLarge(0) }] } : null) };
      }
    });
    // The paper's piece shows its first page, a still beside its account, and the page or the button opens the
    // reader. The pages are cut from their strip as the room is entered (a second's work, so a first press is not
    // kept waiting for it). Until they are cut, a pop-up opened at the paper waits for them, and one opened elsewhere
    // and paged to the paper shows the paper again when they are.
    let left = false;
    if (BL.whitepaperPages) BL.whitepaperPages.load();
    const look = (i) => {
      const D = BL.whitepaperPages, at = paper.index;
      if (!D || D.pages[0]) { show(i); return; }
      D.load().then(() => { if (left) return; const s = BL.modelViewer.stats; if (s.open ? i !== at && s.index === at && D.pages[0] : i === at) show(at); });
      if (i !== at) show(i);
    };
    const readPaper = () => look(paper.index);
    BL.timechainGenesis.readPaper = readPaper;
    // The reader, as the whitepaper read on the island: the nine pages as one continuous strip in a large
    // panel, sliding under the hand as a phone's screen does: a drag or a swipe carries it and lets it run on, slowing
    // (momentum), and past either end it follows at a fraction and springs back (the rubber band); the wheel and the
    // arrows move it too. Next to no chrome: a close button, and under the panel the way back to the pop-up, the page
    // it is on and the source's credit with a small link to bitcoin.org's page for the paper. Esc or a press outside the panel closes it (`hud.dismissOutside`). The strip and its sliding window are
    // the monolith reader's of #354 (`scene-hub.js` `wpStripGeometry`, `wpScrollBy`, `wpPanBy`, removed in #539), a
    // panel on the page instead of a stone's face.
    let readerEl = null;
    const readLarge = (n = 0) => {
      const D = BL.whitepaperPages;
      if (!D || !D.strip) { readPaper(); return; }
      if (!readerEl) {
        // The dialog and its parts are the HUD's (`hud.genesis`); the room slides the strip and listens for the visit.
        const G = hud.genesis, d = G.reader, view = G.view, img = G.strip, thumb = G.thumb, pageEl = G.page, about = G.about;
        const on = (node, type, fn, opts) => node.addEventListener(type, fn, { ...opts, signal: gone.signal });
        img.src = D.strip;
        // Where the strip stands: `y` down it and `x` across it in pixels (y may run past an end while held or thrown),
        // `v` its speed once let go, `glide` where a key or the wheel is easing it to.
        let y = 0, x = 0, v = 0, zoom = 1, glide = -1, held = null, raf = 0, last = 0, fade = 0;
        const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
        const viewH = () => view.clientHeight, viewW = () => view.clientWidth, stripW = () => viewW() * zoom, stripH = () => stripW() * D.height / D.width;
        const maxY = () => Math.max(0, stripH() - viewH()), maxX = () => Math.max(0, stripW() - viewW()), unit = () => stripW() / D.width * (D.page + D.gap);
        const band = (over, dim) => dim * (1 - 1 / (over * 0.55 / dim + 1));
        const shownY = () => { const m = maxY(), h = viewH() || 1; return y < 0 ? -band(-y, h) : y > m ? m + band(y - m, h) : y; };
        const pageOf = () => clamp(Math.floor((clamp(y, 0, maxY()) + viewH() * 0.35) / Math.max(1, unit())) + 1, 1, D.count);
        const paint = () => {
          const m = maxY(), h = viewH(), t = Math.max(28, h * h / Math.max(h, stripH() || h));
          img.style.width = `${stripW()}px`; img.style.transform = `translate3d(${-clamp(x, 0, maxX())}px, ${-shownY()}px, 0)`;
          thumb.style.height = `${t}px`; thumb.style.transform = `translateY(${clamp(m ? y / m : 0, 0, 1) * (h - t)}px)`;
          const pg = pageOf(); pageEl.textContent = `PAGE ${pg} / ${D.count}`; BL.timechainGenesis.readerPage = pg - 1;
        };
        const step = (t) => {
          raf = 0;
          const dt = Math.max(0, Math.min(0.1, (t - last) / 1000)), m = maxY(); last = t;
          let busy = false;
          if (!held) {
            if (glide >= 0) { y += (glide - y) * (1 - Math.exp(-dt * 11)); v = 0; if (Math.abs(glide - y) < 0.5) { y = glide; glide = -1; } else busy = true; }
            else if (y < 0 || y > m) { const to = y < 0 ? 0 : m; v *= Math.exp(-dt * 18); y += v * dt + (to - y) * (1 - Math.exp(-dt * 13)); if (Math.abs(to - y) < 0.5 && Math.abs(v) < 20) { y = to; v = 0; } else busy = true; }
            else if (Math.abs(v) > 6) { y += v * dt; v *= Math.exp(-dt * 2.6); busy = true; }
            else v = 0;
          }
          paint();
          if (busy && d.open) raf = requestAnimationFrame(step);
        };
        const wake = () => { view.classList.add("wpr-moving"); clearTimeout(fade); fade = setTimeout(() => view.classList.remove("wpr-moving"), 900); if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); } };
        const setZoom = (z) => { const f = stripH() ? y / stripH() : 0; zoom = clamp(z, 1, 2.6); y = f * stripH(); x = maxX() / 2; v = 0; glide = -1; paint(); };
        const ease = (to) => { glide = clamp(to, 0, maxY()); v = 0; wake(); };
        on(view, "pointerdown", (e) => { if (e.button) return; view.setPointerCapture(e.pointerId); held = { id: e.pointerId, x: e.clientX, y: e.clientY, trail: [[performance.now(), e.clientY]] }; v = 0; glide = -1; view.classList.add("wpr-held"); });
        on(view, "pointermove", (e) => {
          if (!held || e.pointerId !== held.id) return;
          const now = performance.now(); y -= e.clientY - held.y; x = clamp(x - (e.clientX - held.x), 0, maxX()); held.x = e.clientX; held.y = e.clientY;
          held.trail.push([now, e.clientY]); while (held.trail.length > 2 && now - held.trail[0][0] > 90) held.trail.shift();
          paint(); view.classList.add("wpr-moving");
        });
        const release = (e) => {
          if (!held || e.pointerId !== held.id) return;
          const tr = held.trail, now = performance.now(), a = tr[0], b = tr[tr.length - 1]; held = null; view.classList.remove("wpr-held");
          // The throw: the hand's speed over its last moments, if it was still moving as it let go.
          if (tr.length > 1 && now - b[0] < 70 && b[0] > a[0]) v = clamp(-(b[1] - a[1]) / ((b[0] - a[0]) / 1000), -9000, 9000);
          wake();
        };
        for (const ev of ["pointerup", "pointercancel"]) on(view, ev, release);
        on(view, "wheel", (e) => { e.preventDefault(); const k = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? viewH() : 1; if (e.ctrlKey) { setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); return; } x = clamp(x + e.deltaX * k, 0, maxX()); ease((glide >= 0 ? glide : clamp(y, 0, maxY())) + e.deltaY * k); }, { passive: false });
        on(about, "click", () => { d.close(); readPaper(); });
        on(d, "keydown", (e) => {
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          const h = viewH(), at = glide >= 0 ? glide : clamp(y, 0, maxY()), go = (to) => { ease(to); e.preventDefault(); };
          if (e.key === "ArrowDown") go(at + 140); else if (e.key === "ArrowUp") go(at - 140);
          else if (e.key === " ") go(at + (e.shiftKey ? -h : h) * 0.9);
          else if (e.key === "PageDown") go(at + h * 0.9); else if (e.key === "PageUp") go(at - h * 0.9);
          else if (e.key === "Home") go(0); else if (e.key === "End") go(maxY());
          else if (e.key === "+" || e.key === "=") setZoom(zoom * 1.25); else if (e.key === "-") setZoom(zoom / 1.25);
        });
        const resized = () => { if (d.open) { y = clamp(y, 0, maxY()); paint(); } };
        on(window, "resize", resized);
        on(d, "close", () => { BL.timechainGenesis.readerPage = -1; held = null; v = 0; glide = -1; });
        readerEl = { d, view, img, setZoom, to: (n, part = 0) => { v = 0; glide = -1; y = clamp((n + part) * unit(), 0, maxY()); paint(); } };
      }
      const R = readerEl;
      BL.modelViewer.close();
      if (document.pointerLockElement) document.exitPointerLock();
      hud.openReader();
      const jump = () => { R.setZoom(1); R.to(n); R.view.focus({ preventScroll: true }); };
      if (R.img.complete && R.img.naturalWidth) requestAnimationFrame(jump); else R.img.addEventListener("load", () => requestAnimationFrame(jump), { once: true });
    };
    BL.timechainGenesis.readLarge = readLarge;
    BL.timechainGenesis.readerClose = () => { if (readerEl && readerEl.d.open) readerEl.d.close(); };
    // For the renders: the reader at a page and a part of the way down it, at a zoom.
    BL.timechainGenesis.readerTo = (n, part = 0, zoom = 1) => { if (readerEl) { readerEl.setZoom(zoom); readerEl.to(n, part); } };
    const acts = PLINTHS.map((p) => ({ key: `genesis${p.id}`, label: "LOOK", hint: `Space · Look at ${p.entries[0].name.split(":")[0]} up close`, tap: "Tap LOOK to see it up close", run: () => look(p.entries[0].index) }));
    const paper = EXHIBITS.find((ex) => ex.key === "whitepaper");
    const middle = { key: "genesis-middle", label: "READ", hint: "Space · Read the whitepaper", tap: "Tap READ to read the whitepaper", run: () => readPaper() };
    let act = null, best = 0;
    const consider = (a, ax, az, reach, x, z, fx, fz) => {
      const dx = ax - x, dz = az - z, d = Math.hypot(dx, dz), f = Math.hypot(fx, fz) || 1;
      if (d < reach && d < best && (dx * fx + dz * fz) / (d * f) > 0.2) { act = a; best = d; }
    };
    // For the renders and the suite: open an entry from outside.
    BL.timechainGenesis.look = look;
    // The portal: a LOOK at a plinth while a riddle is open is an answer first (a right one mines the fragment and
    // does not open the viewer; a wrong one hints, then opens it as usual).
    const portal = portalAnimate(nodes, built, { focus, spots, look, hud, gone });
    // Debug only (`?debug=1`, where the director hangs `window.__ooga`): `__ooga.genesis.dropBlock()` plays a block's
    // arrival now, and `&dropnow=1` does it once, five seconds after the room stands.
    const dbg = window.__ooga || null;
    // A drop played this way carries the chain's own latest height where a feed has given one (or the one it is handed).
    const tipHeight = () => (BL.chain && BL.chain.snapshot && BL.chain.snapshot.height) || (BL.mempool && BL.mempool.state && BL.mempool.state.height) || 0;
    if (dbg) dbg.genesis = { dropBlock: (height) => { const F = BL.timechainGenesis.floorPoc; if (F) F.drop(height || tipHeight()); } };
    let dropnowAt = dbg && (new URLSearchParams(location.search)).get("dropnow") === "1" ? clock() + 5 : 0;
    acts.forEach((a, i) => { const run = a.run; a.run = (hud) => { if (!portal.hit(i)) run(hud); }; });
    const self = {
      portalGo: null,
      update(dt, elapsed) {
        const now = clock();
        // The show, where it runs (the glass floor option), and where its clock stands this cycle.
        const show = BL.timechainGenesis.floorPoc, tShow = show ? now % show.cycle : -1, inBurst = show && tShow >= show.phases.burst && tShow < show.phases.charge + 1;
        // The ₿ breathes (a 5 s swell, never a flash) with a faint hashing shimmer across its cells; at the show's
        // convergence every cell locks bright in a wave from the middle out and one cell drops away to become the
        // falling block, the ₿ re-forming it cell by cell afterwards.
        { const live = BL.timechainGenesis.live, td = live ? now - live.dropAt : 1e9, blockAt = live ? live.lastBlockAt : 0;
          // The fill is worked out here from the block's own time (the feed's side may not have run yet this frame).
          const heat = !live ? 0.6 : td < 0 ? 1.3 : Math.max(0, Math.min(1.3, (now - blockAt) / MARK_PERIOD));
          // White after a block. The share of squares turned follows the time since the block (half at five minutes,
          // all at ten): each is turned by a dot of the stream landing on it, with a spark; squares the dots have not
          // reached in time (a visitor arriving mid-interval, a quiet feed) turn without one. While a block is late the
          // orange squares pulse brighter in turn. Two seconds before a drop every square flashes hot in a wave from
          // the middle out; then one falls away, the mark is white again and re-forms the fallen square.
          if (td >= 0 && mark.block !== blockAt) mark.reset(blockAt);
          mark.target = Math.floor(Math.min(1, heat) * mark.count + 1e-6);
          while (mark.next < mark.target - 8) mark.light(mark.order[mark.next++], now, false);
          const breath = 0.95 + 0.05 * (0.5 + 0.5 * Math.sin(now / 5 * TAU)), lock = td >= -2 && td < 0 ? (td + 2) / 2 : -1, gone = td >= 0 && td < 9, reform = td >= 6 && td < 9 ? (td - 6) / 3 : -1, late = heat > 1.001;
          for (let i = 0; i < tiles.length; i++) {
            const q = tiles[i], n = q.node;
            if (!n) continue;
            const since = now - q.at, flash = lock >= 0 && q.d / reach <= lock;
            const look = flash || since < 0.25 || (late && q.lit && Math.sin(now * 1.5 + q.seed * 0.7) > 0.72) ? "hot" : q.lit ? "orange" : "white";
            if (look !== q.look) { q.look = look; n.geometry = MARK_TILE[look](); }
            // A landing's spark swells from inside the square to its full size, never past it over its neighbours.
            let sc = (q.side - MARK_GAP) * (flash ? 1.05 : since < 0.4 ? 1 - 0.3 * (1 - since / 0.4) : 1);
            if (i === MARK.drop && gone) sc = reform >= 0 ? Math.max(0.001, sc * reform) : 0.001;
            if (sc !== q.sc) { q.sc = sc; n.scale.x = n.scale.z = sc; n.scale.y = MARK_THICK; }
          }
          for (let k = 0; k < glowOf.length; k++) { const g = glowOf[k]; if (!g) continue; const gl = lock >= 0 ? 1.5 : (0.02 + 1.2 * Math.min(1, litArea[k])) * breath * (late ? 1.12 : 1); g.scale.x = g.scale.y = g.scale.z = Math.max(0.001, gl); }
        }
        // The hologram: it turns about its own middle and rides a little up and down, its sheets of light climb
        // through it one after the other, and every few seconds it jumps aside and blinks.
        spin.rotation.y = now / HOLO.turn * TAU; spin.position.y = MID_TOP + HOLO.foot + 0.035 * Math.sin(now * 0.7);
        // A falling block passes down through the figure, and a ripple runs down it with the block: the two sheets of
        // light leave their climb and ride at the block's height, bright, and the figure shivers, then settles.
        const at = falling && falling.scale.x > 0.5 ? falling.position.y - spin.position.y : -1, passing = at > -0.3 && at < HOLO.tall + 0.3;
        ripple = passing ? 1 : Math.max(0, ripple - dt * 2.5);
        for (let i = 0; i < 2; i++) {
          const u = (now / 4.5 + i / 2) % 1, n = sheets[i], k = passing ? 1.25 - 0.35 * i : Math.sin(u * Math.PI) * (0.55 + 0.45 * Math.sin(u * Math.PI));
          n.position.y = passing ? at + 0.3 * i : -0.05 + u * (HOLO.tall + 0.1); n.scale.x = n.scale.y = n.scale.z = Math.max(0.001, k);
        }
        if (!flat) { const tg = now % 5.7; figure.position.x = (tg < 0.07 ? 0.035 : tg < 0.14 ? -0.02 : 0) + ripple * 0.022 * Math.sin(now * 85); figure.position.z = figureZ + ripple * 0.022 * Math.cos(now * 67); figure.visible = tg < 0.14 || tg >= 0.19; }
        // The block's height in stars: out in the sky as the mark locks, together as the block falls, held, scattered.
        { const live = BL.timechainGenesis.live, td = live ? now - live.dropAt : 1e9, T1 = HEIGHT.gather, T2 = T1 + HEIGHT.hold, T3 = T2 + HEIGHT.scatter;
          if (live && live.height > 0 && td >= -HEIGHT.early && td < T3) {
            if (hs.shown !== live.height) { hs.shown = live.height; writeHeight(live.height); }
            hs.on = true;
            for (let i = 0; i < hs.n; i++) {
              const n = hs.node[i];
              if (!n) continue;
              let x = hs.tx[i], z = hs.tz[i], sc = 1;
              if (td < T1) { const u = smooth(unit((td - hs.lag[i]) / (T1 - 0.7))); x = hs.hx[i] + (x - hs.hx[i]) * u; z = hs.hz[i] + (z - hs.hz[i]) * u; sc = unit((td + HEIGHT.early - hs.lag[i]) / 0.8) * (0.55 + 0.45 * u); }
              else if (td >= T2) { const u = smooth(unit((td - T2 - hs.lag[i]) / (HEIGHT.scatter - 1.1))); x += (hs.gx[i] - x) * u; z += (hs.gz[i] - z) * u; sc = (1 - unit((td - T3 + 0.9) / 0.9)) * (1 - 0.45 * u); }
              sc *= 0.82 + 0.3 * Math.sin(now * hs.tw[i] + hs.ph[i]);
              n.position.x = x; n.position.z = z; n.scale.x = n.scale.y = n.scale.z = Math.max(0.001, sc);
            }
          } else if (hs.on) { hs.on = false; for (let i = 0; i < hs.n; i++) if (hs.node[i]) hs.node[i].scale.x = hs.node[i].scale.y = hs.node[i].scale.z = 0.001; }
        }
        // Proximity focus and the walk-lit years: each plinth's ring rises within 3 m of the visitor; its year tick
        // lights within 2.5 m and fades over six seconds behind them (this viewer's own, not synced).
        for (let i = 0; i < focus.length; i++) {
          const f = focus[i], d = Math.hypot(f.x - px, f.z - pz), want = d < 3 * BIG || f.boost > 0 ? 1 : 0;
          if (f.boost > 0) f.boost -= dt;
          f.level += (want - f.level) * Math.min(1, dt * 3);
          if (f.node) { const sc = Math.max(0.001, f.level * BIG * (1.15 + (f.boost > 0 ? 0.45 * (0.5 + 0.5 * Math.sin(now * 9)) : 0))); f.node.scale.x = sc; f.node.scale.y = 1; f.node.scale.z = sc; }
          f.lit = Math.max(f.lit - dt / 6, d < 2.5 * BIG ? 1 : 0);
          if (f.tick) { f.tick.scale.x = 0.6; f.tick.scale.y = f.tick.scale.z = Math.max(0.001, f.lit * 1.2); }
        }
        // The burst lights Block 0's plinth at the walk's end too (the block the burst makes).
        if (inBurst && genesisAt >= 0 && focus[genesisAt]) focus[genesisAt].boost = Math.max(focus[genesisAt].boost, 0.4);
        // The nonce reveal on Block 0's screen through the burst and the charge: the count, the hash, the headline.
        if (screen && show) {
          const tb = tShow - show.phases.burst, state = tb >= 0 && tb < 6 ? Math.floor(tb * 12) : -1;
          if (state !== screenState) {
            screenState = state;
            const nonce = tb < 0 || tb >= 6 ? 1 : Math.min(1, tb / 2), hash = tb < 0 || tb >= 6 ? 1 : Math.max(0, Math.min(1, (tb - 2) / 2)), head = tb < 0 || tb >= 6 ? 1 : Math.max(0, Math.min(1, (tb - 4) / 2));
            paintBlockScreen(screen.ctx, screen.canvas.width, screen.canvas.height, nonce, hash, head);
            screen.geo.imageSurface.version++;
          }
        }
        if (!calm.matches) {
          for (let i = 0; i < glass.length; i++) glass[i].glass = PIECE_GLASS.alpha + PIECE_GLASS.swell * Math.sin(TAU * (now / PIECE_GLASS.period - plinths[i].sector / SECTORS));
          for (let i = 0; i < SECTORS; i++) glassFar[i].glass = PIECE_GLASS.alpha + PIECE_GLASS.swell * Math.sin(TAU * (now / PIECE_GLASS.period - i / SECTORS));
        }
        for (let i = 0; i < insc.length; i++) { const q = insc[i]; let d = Infinity; for (let j = 0; j < q.spots.length; j++) d = Math.min(d, Math.hypot(q.spots[j].x - px, q.spots[j].z - pz)); const on = q.on ? d < INSC_FAR : d < INSC_NEAR; if (on !== q.on) { q.on = on; q.node.visible = on; } }
        // Near or far, by sector: a sector shown near draws its plinths' own pieces (or first versions), far its one
        // lighter build.
        for (let i = 0; i < sectors.length; i++) {
          const s = sectors[i];
          let d = Infinity;
          for (let j = 0; j < s.spots.length; j++) d = Math.min(d, Math.hypot(s.spots[j].x - px, s.spots[j].z - pz));
          const near = s.isNear ? d < LOD_FAR : d < LOD_NEAR;
          if (near !== s.isNear) { s.isNear = near; s.far.visible = s.farGlass.visible = !near; for (let j = 0; j < s.plinths.length; j++) { s.plinths[j].level = 0; showPlinth(s.plinths[j], near); } }
        }
        // The first version: the nearest plinth within FIRST.near (the one already showing it, until FIRST.far)
        // trades places with it; every other plinth goes back to its piece. Not on Canvas 2D, whose every face costs.
        let want = -1;
        if (!flat) {
          let best = Infinity;
          for (let i = 0; i < plinths.length; i++) { const q = plinths[i], d = Math.hypot(q.x - px, q.z - pz), reach = q.level > 0 ? FIRST.far : FIRST.near; if (d < reach && d < best && sectors[q.sector].isNear) { best = d; want = i; } }
        }
        for (let i = 0; i < plinths.length; i++) {
          const q = plinths[i], to = i === want ? 1 : 0;
          if (q.level === to) continue;
          q.level = to > q.level ? Math.min(1, q.level + dt / FIRST.time) : Math.max(0, q.level - dt / FIRST.time);
          showPlinth(q, sectors[q.sector].isNear);
        }
        // What flows and blinks on the pieces shown near.
        if (!calm.matches) for (let i = 0; i < plinths.length; i++) {
          const q = plinths[i];
          if (!q.piece.visible) continue;
          for (let j = 0; j < q.flows.length; j++) { const w = q.flows[j]; drift(w, (now / w.period + w.phase) % 1); }
          for (let j = 0; j < q.blinks.length; j++) { const w = q.blinks[j]; w.node.visible = (now / w.period + w.phase) % 1 < 0.6; }
        }
        portal.update(dt, px, pz, now);
        if (dropnowAt && now >= dropnowAt) { dropnowAt = 0; dbg.genesis.dropBlock(); }
        if (poc) poc.update();
      },
      // In a loop's lane a standing body is carried at a stroll, the inner loop the walk's way, the outer one back;
      // the outer loop leaves the doorway clear (nobody is carried off as they arrive) and holds still in front of the
      // portal while its door shows, so a visitor can stand there.
      carry(x, z, dt) {
        const r = Math.hypot(x, z), az = Math.atan2(x, -z) / DEG, a = az * DEG;
        if (Math.abs(r - TRAV.r) <= TRAV.w / 2 - 0.05) { const d = TRAV.speed * dt; carried.x = Math.cos(a) * d; carried.z = Math.sin(a) * d; return carried; }
        if (Math.abs(r - TRAV2.r) <= TRAV2.w / 2 - 0.05 && Math.abs(az) < 180 - TRAV2.doorGap && !portal.holds(x, z)) { const d = -TRAV2.speed * dt; carried.x = Math.cos(a) * d; carried.z = Math.sin(a) * d; return carried; }
        return null;
      },
      near(x, z, fx, fz) {
        px = x; pz = z;
        act = null; best = Infinity;
        for (let i = 0; i < spots.length; i++) consider(acts[i], spots[i].x, spots[i].z, 2.4 * BIG, x, z, fx, fz);
        // The middle: the hologram, and through it the paper.
        consider(middle, 0, 0, 3.2, x, z, fx, fz);
        const pact = portal.near(x, z, fx, fz);
        if (pact) return pact;
        return act;
      },
      tap(owner) {
        if (owner.kind === "genesis-portal") return portal.tapDoor();
        // The ₿ over the crown is the live feed's own picture: a press on it opens the feed's site in a new tab, as the
        // island's totems open theirs.
        if (owner.kind === "live" && owner.slot.spec.id === "mark") { window.open(MEMPOOL_URL, "_blank", "noopener,noreferrer"); return true; }
        if (owner.kind !== "genesis") return false;
        if (EXHIBITS[owner.index].plinth !== "centre" && portal.hit(EXHIBITS[owner.index].plinthIndex)) return true;
        look(owner.index);
        return true;
      },
      dispose() { left = true; BL.modelViewer.close(); portal.dispose(); for (const k of ["portal", "portalSpot", "live", "mark", "floorPoc", "blockScreen", "readLarge", "readPaper", "readerClose", "readerTo", "look"]) delete BL.timechainGenesis[k]; if (dbg) delete dbg.genesis; if (poc && poc.dispose) poc.dispose(); gone.abort(); hud.closeReader(); hud.genesis.strip.removeAttribute("src"); readerEl = null; }
    };
    portal.bind(self);
    return self;
  };
  BL.timechainGenesis = { plan, animate, door, EXHIBITS, PLINTHS, firstBuilds, LINK, RING, BIG, TOP, RISE, DEPTH, widthOf, loops: { inner: TRAV.r, outer: TRAV2.r, width: TRAV.w, speed: TRAV.speed, doorGap: TRAV2.doorGap }, CLIPPINGS, QUOTES, THREADS, paintPlaque, paintDome, spotOf, azOf, ceilingBoxes: CEILING_BOXES, inscriptions: INSCRIPTIONS, readerPage: -1 };
  BL.timechainRoomKinds.genesis = { plan, steps, animate, door };
})();
