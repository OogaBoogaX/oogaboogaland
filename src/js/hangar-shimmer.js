// The Lightning Jet Hangar's shimmer: now and then, a faint blue-white disturbance in the air somewhere the visitor is
// looking (`pick`, among floor spots laid out once a page, `spots`) gathers into the outline of a standing figure, a
// little over three metres tall, and comes apart again, for 8 to 12 seconds (`SHOW`). It is made of light: its outline
// (`OUTLINE`, a slim figure three-quarters on, featureless, its hands rounded) traced in a thin glowing line with sparks
// along it, in runs that glint brighter and dimmer (`EDGE`); glitter within it, thickest toward its edges and over its
// upper body (`GLITTER`); from the thighs down it comes apart into a stream of sparks falling to the floor (`FALL`);
// thin bars of light tear across it now and then, some slipping a band of it sideways (`TEARS`); motes drift round it
// (`MOTES`), and it stands in a faint column of light (`SHAFT`). Its sparks gather from a loose column into the figure as
// it forms, the head first, its line showing as each part arrives; as it dissolves its line crumbles a run at a time and
// its sparks drift apart, rising; then streaks of light stand where it stood,
// shimmering, with motes drifting in them, a faint afterimage for 15 to 20 seconds (`RESIDUE`), before it is gone. It
// faces the view, one way or mirrored. Now and then, with the visitor's own Ooga a few metres off, a few runs of its
// line hold steady and still a moment and it brightens a touch (`NEAR`), then it goes on as before; closer still, a few
// fragments may catch for an instant and break apart again (`CATCH`); and its afterimage stirs a little as the Ooga
// passes (`STIR`). It lasts no longer for it. A very faint shimmer of sound comes with the figure, not the afterimage
// (`hangarAudio.glint`). Under reduced motion nothing gathers, drifts or falls, its sparks glint slowly and no bars
// tear across it. It lights nothing and leaves nothing behind; Tess, if she is near it, in sight of it and free to
// notice it, watches it (`hangarGuide.unsettled`), and nobody else in the hangar reacts.
//
// The first comes 30 to 60 s into a visit and each next 3 to 5 minutes after the last has gone (`GAP`), counted while
// the hangar is up. When one is due it waits for a good moment and place: none of the hangar's other events for `CALM`
// s (`busy`), the visitor's Ooga on foot, no dialog open, the view not turning fast, and a spot in good view (`pick`: on
// screen, clear of the buttons and sticks on a coarse pointer, not behind the visitor's own Ooga, in sight past walls,
// boxes and the Jet, 7 to 22 m off, or 16 on a coarse pointer, and clear of the guide and anything that walks), looking
// again every `LOOK` s, a few frames to a search, and further out and across, and less strictly, once it has looked for
// `VIEW.relax` s. Of the spots that will do it takes one at random, more likely one a visitor would notice (off the
// screen's middle but not at its edge, nearer, not over the launch tunnel's neon) and away from where the last few came
// (`CHOOSE`), so it turns up somewhere new each time. While it shows, for `AFTER` s after and for up to `CLAIM` s while one is due (`holding`)
// the engine anomalies and a worker's meltdown wait. Anything else starting, the tab hiding or leaving the hangar ends it
// at once. Each page has its own: nothing of it is sent, so two visitors side by side see it at different times.
//
// Its sparks, strokes, bars and glow are soft pictures drawn additively and turned to the view, in four instanced
// batches (sparks, lines, bars, glow) with their pictures painted once a page; the Canvas 2D renderer, which draws no
// such batch, gets fewer of them as plain glowing diamonds, without the glow. `create` builds it once a visit and `update` writes it in place,
// allocating nothing a frame.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild } = BL.scene;
  const { clamp, mulberry32, hexToRgb } = BL.math;
  const { cached, noShadow } = BL.models;
  const HM = BL.hangarModels, LAYOUT = HM.LAYOUT, HALL = LAYOUT.HALL;

  // The shape is modelled TOP units tall and drawn SCALE times that, m.
  const TOP = 1.72, SCALE = 2;

  // When, s, at random between: the first into a visit, and each next after the last has gone. How long the hall must
  // have been free of its other events before one starts, s; how long it stays held for them after one, s; how often
  // to look again for a good moment and place once one is due, s; and for how long, once one is due, the events that
  // come by themselves (the engine anomalies, a worker's meltdown) wait for it to start, s, so they don't keep taking
  // its turn.
  const GAP = { first: [30, 60], next: [180, 300] }, CALM = 8, AFTER = 15, LOOK = 0.5, CLAIM = 20;
  // Its life, s, each at random between: the whole of it, forming and dissolving (holding takes the rest, within
  // `hold`).
  const SHOW = { total: [8, 12], form: [1, 2], hold: [4, 7], dissolve: [2, 3] };
  // Its outline as seen: a slim standing figure three-quarters on, its face's side (with nothing on it) toward -x; from
  // the crown down the back of the head, the neck, the near shoulder, down the outside of the arm, round the hand and up
  // its inside, down the side, the hip and the outside of the leg to the foot, up between the legs and down the other,
  // up the far side, down and up the far arm, over the far shoulder and up the face's side to the crown; each [across,
  // up] in model units, rounded twice over (`ROUND`) and walked in steps (`EDGE.step`).
  const OUTLINE = [
    [0, 1.72], [0.055, 1.705], [0.088, 1.668], [0.096, 1.618], [0.088, 1.568], [0.064, 1.528], [0.036, 1.5],
    [0.034, 1.462], [0.08, 1.438], [0.15, 1.422], [0.195, 1.395], [0.22, 1.34], [0.253, 1.22], [0.285, 1.1], [0.318, 0.98],
    [0.348, 0.87], [0.372, 0.8], [0.367, 0.755], [0.339, 0.75], [0.321, 0.79], [0.297, 0.88], [0.262, 1], [0.226, 1.12],
    [0.191, 1.24], [0.166, 1.29], [0.14, 1.24], [0.124, 1.14], [0.114, 1.05], [0.135, 0.97], [0.156, 0.9], [0.148, 0.78],
    [0.128, 0.64], [0.108, 0.5], [0.1, 0.36], [0.085, 0.2], [0.065, 0.08], [0.08, 0.02], [0.05, 0], [0.032, 0.03],
    [0.034, 0.15], [0.04, 0.3], [0.042, 0.48], [0.036, 0.64], [0.02, 0.76], [0, 0.82], [-0.02, 0.76], [-0.034, 0.64],
    [-0.04, 0.48], [-0.038, 0.3], [-0.032, 0.15], [-0.028, 0.03], [-0.045, 0], [-0.072, 0.02], [-0.058, 0.08],
    [-0.078, 0.2], [-0.092, 0.36], [-0.1, 0.5], [-0.118, 0.64], [-0.136, 0.78], [-0.142, 0.9], [-0.122, 0.97],
    [-0.102, 1.05], [-0.11, 1.14], [-0.124, 1.24], [-0.14, 1.29], [-0.171, 1.24], [-0.204, 1.12], [-0.238, 1],
    [-0.271, 0.88], [-0.293, 0.79], [-0.311, 0.75], [-0.337, 0.755], [-0.34, 0.8], [-0.318, 0.87], [-0.29, 0.98],
    [-0.259, 1.1], [-0.229, 1.22], [-0.198, 1.34], [-0.174, 1.392], [-0.13, 1.418], [-0.07, 1.435], [-0.03, 1.462],
    [-0.034, 1.495], [-0.052, 1.51], [-0.068, 1.535], [-0.074, 1.575], [-0.078, 1.615], [-0.07, 1.66], [-0.046, 1.7]
  ];
  const ROUND = 2;
  // Its outline: a point every `step` model units along it, strayed up to `jitter` model units off the line; at every
  // `every`-th a glinting spark `spark` m across, and at every `span`-th a stroke of the line to the `span`-th after it,
  // `stroke` m wide (or `thin` m a metre off, if wider, so it never thins to nothing far away), with a glow along it
  // `halo` times as wide, `haloGlow` as strong; in runs of `run` points that glint together, full `on` of the time and
  // down to `gap` between; and how strong a spark and a stroke are at most.
  const EDGE = { step: 0.011, every: 3, spark: [0.03, 0.06], jitter: 0.004, span: 5, stroke: 0.05, thin: 0.004, halo: 2.5, haloGlow: 0.4, run: [6, 18], on: 0.93, gap: 0.4, sparkGlow: 0.55, strokeGlow: 1 };
  // The glitter within it: how many sparks, how big, m, and how strong at most.
  const GLITTER = { n: 1400, size: [0.02, 0.045], glow: 0.45 };
  // How it comes apart below: the outline and the glitter fade out from `from` model units down to `to`, and a stream of
  // `n` sparks, each falling at its own `speed`, m/s, runs down from the hips (`top`, model units) to the floor.
  const FALL = { from: 0.66, to: 0.24, top: 0.86, n: 220, speed: [0.25, 0.7], size: [0.03, 0.07], glow: 0.8 };
  // Motes drifting round it: how many (the afterimage's included), how big, m, how strong, and how fast they rise, m/s.
  const MOTES = { n: 150, size: [0.018, 0.04], glow: 0.5, rise: [0.03, 0.12] };
  // The faint column of light it stands in: how wide and tall, m, and how strong as it shows and as it lingers.
  const SHAFT = { w: 1.6, h: 5.2, glow: 0.1, lingers: 0.09 };
  // The bars of light tearing across it: how many at once at most; how long each shows and stays away, s, at random
  // between; how long and wide one is, m; how strong at most; how fast one slides, m/s; how far it slips the band of the
  // figure it crosses, model units, how many of them slip one (`slips`) and how tall that band is, model units; and the
  // heights each tears across, model units, [from, to] (most of them over the head, the shoulders and the chest).
  const TEARS = { n: 16, on: [0.15, 0.8], off: [0.1, 0.7], length: [0.1, 0.8], width: [0.015, 0.03], glow: 0.95, slide: 0.45, slip: [0.015, 0.05], slips: 0.6, band: [0.01, 0.03],
    heights: [[1.5, 1.7], [1.5, 1.7], [1.5, 1.7], [1.36, 1.5], [1.36, 1.5], [1.36, 1.5], [1.18, 1.36], [1.18, 1.36], [1.18, 1.36], [1, 1.18], [1, 1.18],
      [0.82, 1], [0.82, 1], [0.6, 0.82], [0.9, 1.7], [0.9, 1.7]] };
  // The afterimage: how long, s, at random between; how fast it rises, m/s, and how far up at most, m; and the streaks of
  // light standing where it stood (how many, how long, m, at random between, how wide, m, and how strong).
  const RESIDUE = { life: [15, 20], rise: 0.04, most: 0.5, streaks: 26, streak: [0.6, 2.6], streakWidth: 0.04, streakGlow: 0.6 };
  // Near the visitor's own Ooga it may steady a little, never for long: only some showings (`chance`); once the Ooga
  // comes within `reach` m of it (drawn each showing between), after `delay` s, a share (`share`, drawn each showing) of
  // its outline's runs hold steady and nearly still (their glinting settling to `level`, a little over its own average, so
  // they read steadier rather than brighter, and losing `still` of their stray), the outline brightens up to `bright` more and
  // fewer bars tear across it (`calms`, the chance one coming is skipped), eased in over `rise` s,
  // held `hold` s and eased out over `fall` s, at a `strength` drawn each showing, wavering a little; at most `times`
  // times a showing, each coming back nearer, the later ones `again` as strong; only while it holds. It lasts no longer
  // for it, and answers nobody else.
  const NEAR = { chance: 0.7, reach: [5, 6.5], delay: [0, 0.6], share: [0.25, 0.45], level: 0.7, still: 0.7, bright: 0.06, calms: 0.25,
    rise: 0.7, hold: [0.8, 1.8], fall: 1.4, strength: [0.5, 1], times: 2, again: 0.6 };
  // Closer still it may catch for an instant: only some showings (`chance`); once the Ooga comes within `close` m of it
  // (drawn each showing between), after `delay` s, a share (`share`, drawn each showing) of its outline's runs hold
  // whole, still and up to `bright` brighter for `hold` s, then break apart over `fall` s, dimming by up to `dim` and
  // straying up to `scatter` times as far again as they do, now and then (`tears`) with a bar tearing across it as they
  // do; once a showing at most, only while it holds.
  const CATCH = { chance: 0.55, close: [2, 3], delay: [0.1, 0.5], share: [0.2, 0.4], hold: [0.15, 0.4], bright: 0.25, fall: 0.3, dim: 0.6, scatter: 4, tears: 0.5 };
  // Asked to (`cohere`), it steadies for a moment as it never otherwise does: every run of its outline whole, even and
  // nearly still, the gaps in it filled, no bars tearing across it and its breath and wavering held, up to `bright`
  // brighter, its glitter and falling stream dimmed by `glitter` and `stream`; eased in over `rise` s and let go over
  // `fall` s as it starts to dissolve. Still only an outline, broken off below the hips.
  const COHERE = { rise: 0.18, fall: 0.15, bright: 0.18, still: 0.9, glitter: 0.5, stream: 0.4 };
  // Its afterimage stirs a little as the visitor's Ooga passes: only some showings (`chance`); within `reach` m of where
  // it stood (drawn each showing between, as is its `strength`), more the nearer, eased up at `up` and back down at
  // `down` (shares a second), its streaks and motes up to `bright` brighter, their shimmer up to `quicken` times as fast
  // again and its motes pushed up to `push` model units aside, away from the Ooga. Nothing of the figure comes back.
  const STIR = { chance: 0.75, reach: [3, 4.5], strength: [0.5, 1], up: 2, down: 0.6, bright: 0.3, quicken: 1.5, push: 0.08 };
  // Where a spot may be: from the camera, m (nearer on a coarse pointer, where the screen is small), and on screen
  // (within `x` either side of centre across, `top` to `bottom` down, as fractions, `coarseTop` to `coarseBottom` on a
  // coarse pointer, and not behind the visitor's own Ooga); how far from the visitor's Ooga, from the guide and from
  // anything else that walks, m. One due that has found nowhere for
  // `relax` s looks `wider` further out and across, lets its lower part stand behind the Ooga's head, and keeps to `top`
  // and `bottom` on a coarse pointer too.
  const VIEW = { near: 7, far: 22, coarse: 16, x: 0.38, top: 0.06, bottom: 0.95, coarseTop: 0.15, coarseBottom: 0.74, relax: 30, wider: 4, wideX: 0.42 };
  const AWAY = { ooga: 4, guide: 9, body: 2.5 };
  // How a spot is chosen among those that fit: at random, but more likely where a visitor would notice it: off the
  // middle of the screen (coming in from `aside[0]` to `aside[1]` of its width off centre, as fractions), less so out
  // toward its edge (falling over `edge` to `edgeLeast` as likely), less so further than `far[0]` m (falling to
  // `farLeast` as likely by `far[1]`), and `neon` as likely where the launch tunnel's mouth, bright with neon all the way
  // down, stands behind it; and away from the last `recent` it came to this page life (`least` as likely right where
  // one came, back to as likely `apart` m off), so it comes somewhere new each time. None begins while the view turns
  // faster than `turn` rad/s, which would soon take it out of view.
  const CHOOSE = { aside: [0.04, 0.14], edge: [0.26, 0.38], edgeLeast: 0.45, far: [13, 22], farLeast: 0.4, neon: 0.3, recent: 4, apart: 10, least: 0.05, turn: 0.6 };
  // How many spots the search for a place looks at a frame.
  const SCAN = 120;
  function smooth(t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }
  const between = ([a, b]) => a + Math.random() * (b - a);
  // A number 0 to 1 from an integer, the same each time, for things that change at each of their comings.
  const hash = (n) => {
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };

  // Its pictures, painted once a page from fixed seeds, each its colour's light in its alpha: a spark, a bright core in
  // a soft halo (`spark`); a stroke, soft across and streaked along, fading at its ends (`line`); a bar, thin and crisp
  // across (`tear`); and a soft glow (`glow`).
  const paint = (w, h, seed, rgb, alphaAt) => {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d"), img = ctx.createImageData(w, h), rand = mulberry32(seed);
    // Smooth noise on a lattice of random values, for the pictures' texture.
    const lattice = new Float32Array(64 * 64);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
    const noise = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, a = (xi & 63) + (yi & 63) * 64, b = ((xi + 1) & 63) + (yi & 63) * 64;
      const c = (xi & 63) + ((yi + 1) & 63) * 64, d = ((xi + 1) & 63) + ((yi + 1) & 63) * 64, sx = smooth(fx), sy = smooth(fy);
      return (lattice[a] * (1 - sx) + lattice[b] * sx) * (1 - sy) + (lattice[c] * (1 - sx) + lattice[d] * sx) * sy;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w, v = (y + 0.5) / h, o = (y * w + x) * 4, alpha = clamp(alphaAt(u, v, noise), 0, 1), c = typeof rgb === "function" ? rgb(u, v) : rgb;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = Math.round(alpha * 255);
    }
    ctx.putImageData(img, 0, 0);
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    return { image, w, h };
  };
  // White at the middle of a spark or a stroke, cyan toward its edges, `k` the share of the way out.
  const HOT = [226, 250, 255], COOL = [70, 196, 255];
  const hue = (k) => { const f = smooth(k); return [HOT[0] + (COOL[0] - HOT[0]) * f, HOT[1] + (COOL[1] - HOT[1]) * f, HOT[2] + (COOL[2] - HOT[2]) * f]; };
  const pictures = cached(() => ({
    spark: paint(32, 32, 211, (u, v) => hue(Math.hypot(u - 0.5, v - 0.5) * 4), (u, v) => {
      const r2 = ((u - 0.5) ** 2 + (v - 0.5) ** 2) * 4;
      return (Math.exp(-r2 * 5) + Math.exp(-r2 * 1.6) * 0.3) * (1 - smooth((r2 - 0.7) / 0.3));
    }),
    line: paint(128, 16, 433, (u, v) => hue(Math.abs(v - 0.5) * 5), (u, v, noise) => {
      const d = (v - 0.5) ** 2, across = Math.exp(-d / 0.05) + Math.exp(-d / 0.12) * 0.3, ends = smooth(u / 0.2) * smooth((1 - u) / 0.2);
      return across * ends * (0.75 + 0.25 * noise(u * 9, 2));
    }),
    tear: paint(192, 12, 557, (u, v) => hue(Math.abs(v - 0.5) * 3), (u, v, noise) => {
      const across = Math.exp(-((v - 0.5) ** 2) / 0.012), ends = smooth(u / 0.06) * smooth((1 - u) / 0.06);
      return across * ends * (0.6 + 0.4 * noise(u * 30, 4));
    }),
    glow: paint(64, 64, 977, [70, 170, 255], (u, v) => {
      return Math.exp(-((u - 0.5) ** 2) / 0.03) * smooth(v / 0.35) * smooth((1 - v) / 0.35) * 0.8;
    })
  }));
  // A soft picture, one unit square centred on its own middle and facing +z, drawn additively (`bright` its share of
  // the glow).
  const softGeometry = (which, bright) => cached(() => {
    const { image, w, h } = pictures()[which];
    const geo = { verts: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
    geo.imageSurface = { asset: { width: w, height: h, load: () => image }, rect: [-0.5, -0.5, 1, 1], cutout: true, soft: true, blend: "add", bright };
    return geo;
  });
  const sparkGeometry = softGeometry("spark", 0.8), lineGeometry = softGeometry("line", 1), tearGeometry = softGeometry("tear", 0.9), glowGeometry = softGeometry("glow", 0.15);
  // A flat diamond the same unit square across, facing +z: every soft picture's stand-in on Canvas 2D, which draws one
  // `FLAT.thin` as wide and `FLAT.strong` as strong, and only one in `FLAT.every` of the sparks, since plain diamonds
  // cover where soft pictures fade.
  const FLAT = { thin: 0.7, strong: 0.6, every: 3 };
  const diamondGeometry = cached(() => noShadow({ verts: [0, 0.5, 0, 0.5, 0, 0, 0, -0.5, 0, -0.5, 0, 0], faces: [{ i: [0, 3, 2, 1], color: hexToRgb("#9fe2f6"), emissive: 1 }], lines: [] }));

  // The figure, made once a page from a fixed seed: its outline rounded and walked in steps, each point with the way the
  // line runs there, its run's glinting, how far it strays off the line, its spark's size and twinkle, where it starts
  // from as the figure gathers and drifts to as it dissolves, and when it arrives (the head first); the glitter within,
  // laid where a point falls inside the outline, more of it toward the edges and over the upper body; the falling
  // stream; the motes; and the afterimage's streaks. Where the outline reaches across at each height is kept too
  // (`reach`), for the bars.
  let shape = null;
  const makeShape = () => {
    const rand = mulberry32(5150), zeros = (k) => new Float32Array(k);
    // Round the outline, cutting each corner twice over.
    let loop = OUTLINE.map((p) => p.slice());
    for (let r = 0; r < ROUND; r++) {
      const next = [];
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length];
        next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      loop = next;
    }
    // Walk it in steps.
    const px = [], py = [];
    let carry = 0;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let d = carry; d < len; d += EDGE.step) { const f = d / len; px.push(a[0] + (b[0] - a[0]) * f); py.push(a[1] + (b[1] - a[1]) * f); }
      carry = (carry - len) % EDGE.step; if (carry < 0) carry += EDGE.step;
    }
    const n = px.length, edge = { n, x: new Float32Array(px), y: new Float32Array(py), nx: zeros(n), ny: zeros(n), size: zeros(n), rate: zeros(n), phase: zeros(n),
      runRate: zeros(n), runPhase: zeros(n), from: zeros(n * 2), to: zeros(n * 2), delay: zeros(n) };
    let left = 0, runRate = 0, runPhase = 0;
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n, b = (i + 1) % n, tx = px[b] - px[a], ty = py[b] - py[a], tl = Math.hypot(tx, ty) || 1;
      // Outward, for a loop walked as this one is.
      edge.nx[i] = ty / tl; edge.ny[i] = -tx / tl;
      edge.size[i] = EDGE.spark[0] + rand() * (EDGE.spark[1] - EDGE.spark[0]);
      edge.rate[i] = 2 + rand() * 7; edge.phase[i] = rand() * Math.PI * 2;
      if (left-- <= 0) { left = EDGE.run[0] + Math.floor(rand() * (EDGE.run[1] - EDGE.run[0])); runRate = 1.2 + rand() * 3.5; runPhase = rand() * Math.PI * 2; }
      edge.runRate[i] = runRate; edge.runPhase[i] = runPhase;
      scatter(edge, i, rand, py[i]);
    }
    // Inside the outline, by the even-odd rule.
    const inside = (x, y) => {
      let c = false;
      for (let i = 0, j = n - 1; i < n; j = i++) if ((py[i] > y) !== (py[j] > y) && x < (px[j] - px[i]) * (y - py[i]) / (py[j] - py[i]) + px[i]) c = !c;
      return c;
    };
    const near = (x, y) => {
      let best = Infinity;
      for (let i = 0; i < n; i += 2) best = Math.min(best, (px[i] - x) ** 2 + (py[i] - y) ** 2);
      return Math.sqrt(best);
    };
    const g = GLITTER.n, glitter = { n: g, x: zeros(g), y: zeros(g), size: zeros(g), rate: zeros(g), phase: zeros(g), from: zeros(g * 2), to: zeros(g * 2), delay: zeros(g) };
    for (let i = 0; i < g;) {
      const x = (rand() - 0.5) * 0.66, y = rand() * 1.74;
      if (!inside(x, y)) continue;
      const keep = (0.3 + 0.7 * Math.exp(-near(x, y) / 0.035)) * (0.35 + 0.65 * smooth((y - 0.4) / 1.1));
      if (rand() > keep) continue;
      glitter.x[i] = x; glitter.y[i] = y;
      glitter.size[i] = GLITTER.size[0] + rand() * (GLITTER.size[1] - GLITTER.size[0]);
      glitter.rate[i] = 1.5 + rand() * 6; glitter.phase[i] = rand() * Math.PI * 2;
      scatter(glitter, i, rand, y);
      i++;
    }
    // The falling stream: across between the thighs' outsides, from the hips down, each its own speed and start.
    const f = FALL.n, fall = { n: f, x: zeros(f), y: zeros(f), speed: zeros(f), size: zeros(f), phase: zeros(f) };
    for (let i = 0; i < f; i++) {
      fall.y[i] = rand() * FALL.top; fall.x[i] = (rand() - 0.5) * 0.3 * (0.35 + 0.65 * Math.sqrt(rand()));
      fall.speed[i] = FALL.speed[0] + rand() * (FALL.speed[1] - FALL.speed[0]); fall.size[i] = FALL.size[0] + rand() * (FALL.size[1] - FALL.size[0]);
      fall.phase[i] = rand() * Math.PI * 2;
    }
    const m = MOTES.n, motes = { n: m, x: zeros(m), y: zeros(m), rise: zeros(m), size: zeros(m), phase: zeros(m) };
    for (let i = 0; i < m; i++) {
      motes.x[i] = (rand() - 0.5) * 1.2; motes.y[i] = rand() * 1.9; motes.rise[i] = MOTES.rise[0] + rand() * (MOTES.rise[1] - MOTES.rise[0]);
      motes.size[i] = MOTES.size[0] + rand() * (MOTES.size[1] - MOTES.size[0]); motes.phase[i] = rand() * Math.PI * 2;
    }
    const k = RESIDUE.streaks, streaks = { n: k, x: zeros(k), y: zeros(k), length: zeros(k), phase: zeros(k) };
    for (let i = 0; i < k; i++) {
      streaks.x[i] = (rand() - 0.5) * 0.6; streaks.length[i] = RESIDUE.streak[0] + rand() * (RESIDUE.streak[1] - RESIDUE.streak[0]);
      streaks.y[i] = 0.25 + rand() * 1.2; streaks.phase[i] = rand() * Math.PI * 2;
    }
    // Where the outline reaches across, each way, at every `REACH` model units up.
    const bins = Math.ceil(1.8 / REACH), reach = { lo: zeros(bins).fill(0), hi: zeros(bins).fill(0) };
    for (let i = 0; i < n; i++) {
      const b = Math.min(bins - 1, Math.floor(py[i] / REACH));
      reach.lo[b] = Math.min(reach.lo[b], px[i]); reach.hi[b] = Math.max(reach.hi[b], px[i]);
    }
    return { edge, glitter, fall, motes, streaks, reach };
  };
  // How far apart the heights `reach` keeps are, model units.
  const REACH = 0.02;
  // Where point `i` of `list` starts from as the figure gathers (a loose column round it, mostly below) and drifts to as
  // it dissolves (apart and up), model units; and when it arrives, as a share of the forming (the head first).
  function scatter(list, i, rand, y) {
    list.from[i * 2] = (rand() - 0.5) * 0.5; list.from[i * 2 + 1] = -(0.1 + rand() * 0.5);
    list.to[i * 2] = (rand() - 0.5) * 0.3; list.to[i * 2 + 1] = 0.05 + rand() * 0.35;
    list.delay[i] = clamp((TOP - y) / TOP, 0, 1) * 0.65 + rand() * 0.15;
  }


  // Floor spots, laid out once a page: open floor on a 1 m grid with room for the shape all round it and nothing over
  // it below its head, out to the launch tunnel's mouth but off the door's landing, and clear of the booth, the laydown
  // stands and the terminals.
  let spots = null;
  // Where the last `CHOOSE.recent` came this page life, (x, z) a pair, the newest at `lastAt - 1`; and how many.
  const last = new Float32Array(CHOOSE.recent * 2);
  let lastAt = 0, lastN = 0;
  const makeSpots = () => {
    const out = [], R = 1.1, H = TOP * SCALE + 0.4, far = 1e3, F = LAYOUT.fireTest;
    for (let x = HALL.x0 + 3; x <= HALL.x1 - 3; x += 1) {
      for (let z = HALL.back + 3; z <= LAYOUT.runway.z0 - 3; z += 1) {
        if (Math.hypot(x - F.x, z - F.z) < 5) continue;
        if (HM.CRANE.stands.some(([sx, sz]) => Math.abs(x - sx) < 3.2 && Math.abs(z - sz) < 3.2)) continue;
        if (LAYOUT.kiosks.some(([kx, kz]) => Math.hypot(x - kx, z - kz) < 2.5)) continue;
        let ok = HM.supportAt(x, z, 0) === 0;
        for (let k = 0; ok && k < 8; k++) {
          const a = k / 8 * Math.PI * 2, sx = x + Math.cos(a) * R, sz = z + Math.sin(a) * R;
          ok = HM.supportAt(sx, sz, 0) === 0 && HM.supportAt(sx, sz, H) === 0;
        }
        for (let feet = 0; ok && feet < H; feet += 0.9) ok = HM.clearAt(x, z, feet, R, x + far, z, false);
        if (ok) out.push(x, z);
      }
    }
    return new Float32Array(out);
  };

  // Whether something solid stands at (x, y, z): a wall, a box or the Jet (`clearAt` asked strictly), or a deck or the
  // Jet's top just under it.
  const solidAt = (x, y, z) => {
    if (!HM.clearAt(x, z, y, 0.05, x + 1e3, z, false)) return true;
    const top = HM.supportAt(x, z, y);
    return top > 0.3 && top > y - 0.25;
  };
  // Whether the line from the camera at (ax, ay, az) to (bx, by, bz) is clear, sampled every 0.4 m from `NEAR_EYE` m
  // out (the camera may stand over the door's landing, which the walkers' floor leaves out).
  const NEAR_EYE = 1.5;
  const sightClear = (ax, ay, az, bx, by, bz) => {
    const length = Math.hypot(bx - ax, by - ay, bz - az), n = Math.max(1, Math.ceil(length / 0.4));
    for (let k = Math.ceil(NEAR_EYE / length * n); k < n; k++) {
      const t = k / n;
      if (solidAt(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t)) return false;
    }
    return true;
  };


  // `root`: the scene's root; `audio`: the hangar's sound; `camera` and `renderer` for what is in view; `coarse`, a
  // coarse pointer; `auto`, whether it comes by itself, and `gap`, a fixed wait before each instead of GAP's, s;
  // `busy()`, whether something else has the hall; `ooga()`, the visitor's driven Ooga (its `root`, `camp.seat`,
  // `baseY`), or null; `guide()`, where the hangar's guide is; `clear(x, z, r)`, whether nothing that walks stands within
  // `r` of (x, z).
  const create = ({ root, audio, camera, renderer, coarse = false, auto = true, gap = null, busy = () => false, ooga = () => null, guide = () => null, clear = () => true }) => {
    if (!shape) shape = makeShape();
    if (!spots) spots = makeSpots();
    const { edge: E, glitter: G, fall: FL, motes: MO, streaks: SK, reach: RC } = shape, flat = renderer.kind === "canvas2d", far = coarse ? VIEW.coarse : VIEW.far;
    // Its batches: the sparks (the outline's, the glitter, the falling stream and the motes); the lines (the outline's
    // strokes and the afterimage's streaks); the bars; and the glow (the column of light). On Canvas 2D all diamonds.
    const batch = (geometry, capacity) => {
      const node = createNode({ geometry: flat ? diamondGeometry() : geometry(), instanceData: new Float32Array(capacity * 20), instanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true, visible: false });
      addChild(root, node);
      return node;
    };
    const sparks = batch(sparkGeometry, E.n + G.n + FL.n + MO.n), lines = batch(lineGeometry, Math.ceil(E.n / EDGE.span) * 2 + SK.n), bars = batch(tearGeometry, TEARS.n * 2), glow = batch(glowGeometry, 1);
    const nodes = [sparks, lines, bars, glow];

    // Where it is, which way it faces (`mirror`, 1 its face toward the view's left), where its breathing starts, and
    // its timeline, s on its clock: formed by `formed`, holding until `held`, dissolved by `gone`, its afterimage over by
    // `end`.
    const at = { x: 0, z: 0, mirror: 1, slow: 0, formed: 1, held: 1, gone: 1, end: 1 };
    // `wait` or `show`; its clock, s; when on that clock it began clearing away early (-1 while it isn't); the wait still
    // to go before the next is due, s; how long the hall has been free of its other events, s; how long until it looks
    // for a moment and place again, s; how long the hall is still held for its other events after it, s; how loud it is;
    // and how long it has been due without a place, s.
    let state = "wait", t = 0, fadeAt = -1, due = auto ? (gap !== null ? gap : between(GAP.first)) : Infinity;
    let calm = 0, look = 0, after = 0, loud = 0, waited = 0, overdue = 0, shows = 0;
    // When on its clock it is to steady (`cohere`), -1 while it isn't, and how steady it is now, 0 to 1.
    let cohereAt = -1, coh = 0;
    const sphere = new Float32Array(4);
    for (const node of nodes) node.cullSphere = sphere;
    // The bars: whether each shows, how long until it next changes, s, and, while it shows, its height (model units),
    // side, length and width, m, where it starts across (model units), how strong, its slide, m/s, how far it slips the
    // band it crosses and how tall that band is (model units), and whether a second length of it follows a gap.
    const tear = { on: new Uint8Array(TEARS.n), next: new Float32Array(TEARS.n), y: new Float32Array(TEARS.n), side: new Float32Array(TEARS.n), length: new Float32Array(TEARS.n),
      width: new Float32Array(TEARS.n), start: new Float32Array(TEARS.n), glow: new Float32Array(TEARS.n), slide: new Float32Array(TEARS.n), slip: new Float32Array(TEARS.n),
      band: new Float32Array(TEARS.n), split: new Uint8Array(TEARS.n) };
    // The camera's horizontal right, and the way back toward the camera from the figure, for turning the pictures to it.
    // How far off the view is, m, and so how wide a stroke of the outline is drawn, never thinner on screen than `EDGE.thin`.
    let rx = 1, rz = 0, vx = 0, vy = 0, vz = 1, stroke = EDGE.stroke;
    // Steadying near the visitor's Ooga (`NEAR`): whether this showing may, how near, which share of its runs, how
    // strongly and its seed for picking them, drawn as it begins; how many times are left, whether the Ooga stood within
    // reach last frame; whether one is under way, how far into it, s (less than 0 while it waits), how long it holds and
    // how strong it is; and how steady it is now, 0 to 1. Its catch closer in (`CATCH`), likewise: whether this showing
    // may, how near, which share of its runs and their seed; whether it has come, how far into it, s, and how long it
    // holds, s; how much it holds now and how much it is breaking apart, 0 to 1; and whether a bar is to tear across.
    // Its afterimage's stir (`STIR`): whether this showing may, how near and how strongly; how much now, 0 to 1, which
    // side the Ooga is on (+1 the view's right); and the clock its streaks and motes shimmer by, quickened as it stirs.
    const near = { on: false, reach: 0, share: 0, peak: 0, seed: 0, left: 0, inside: false, active: false, t: 0, hold: 0, strength: 0, k: 0,
      catchOn: false, close: 0, catchShare: 0, catchSeed: 0, caught: false, ct: 0, catchLen: 0, c: 0, b: 0, tear: false,
      stirOn: false, stirReach: 0, stirPeak: 0, s: 0, side: 1, clock: 0 };


    const SCREEN = { x: 0, y: 0, depth: 0 }, FOOT = { x: 0, y: 0, depth: 0 }, still = window.matchMedia("(prefers-reduced-motion: reduce)");
    // The spots in view as `pick` finds them, each an index into `spots`.
    const found = new Int32Array(spots.length / 2);
    // How far down the screen it may stand, as fractions: on a coarse pointer clear of the buttons over the top and the
    // sticks under the bottom.
    const top = coarse ? VIEW.coarseTop : VIEW.top, bottom = coarse ? VIEW.coarseBottom : VIEW.bottom;
    // The margins the search in hand keeps to (the desktop's once it looks wide).
    let lo = top, hi = bottom;
    // Whether (x, y, z) is on screen, between `top` and `bottom` down and, with `across`, within it either side of centre.
    const inView = (x, y, z, across = 1) => {
      const p = renderer.project(x, y, z, SCREEN), w = renderer.size.width, h = renderer.size.height, off = Math.abs(p ? p.x / w - 0.5 : 1);
      return !!p && off < across && p.y / h > lo && p.y / h < hi;
    };
    // Where the visitor's own Ooga stands on screen, which in the third person often fills its middle: its middle
    // across, half its width, its head and its feet down the screen, px (`OOGA.ok` false with none on screen).
    const OOGA = { ok: false, x: 0, half: 0, top: 0, bottom: 0 };
    const placeOoga = (me) => {
      OOGA.ok = false;
      if (!me) return;
      const p = me.root.position, feet = p.y - (me.baseY || 0);
      const f = renderer.project(p.x, feet, p.z, FOOT), h = f && renderer.project(p.x, feet + 1.8, p.z, SCREEN);
      if (!h) return;
      OOGA.ok = true; OOGA.x = FOOT.x; OOGA.bottom = FOOT.y; OOGA.top = SCREEN.y; OOGA.half = (FOOT.y - SCREEN.y) * 0.4;
    };
    // Whether the shape at (x, z) would stand behind the Ooga on screen: within the Ooga's width, and any of its height,
    // feet to head, across the Ooga's; or, `wide`, its middle.
    const behindOoga = (x, z, wide) => {
      if (!OOGA.ok || !renderer.project(x, wide ? TOP * SCALE * 0.5 : 0.15, z, SCREEN)) return false;
      const across = SCREEN.x, low = SCREEN.y;
      if (!renderer.project(x, TOP * SCALE * 0.97, z, SCREEN)) return false;
      return Math.abs(across - OOGA.x) < OOGA.half + renderer.size.width * 0.05 && low > OOGA.top - (wide ? 40 : 20) && SCREEN.y < OOGA.bottom;
    };
    // Whether the launch tunnel's mouth stands behind (x, y, z) as seen from the camera at `c`.
    const T = LAYOUT.tunnel;
    const overNeon = (c, x, y, z) => {
      if (z - c.z > -0.5) return false;
      const k = (T.z0 - c.z) / (z - c.z);
      return Math.hypot(c.x + (x - c.x) * k, c.y + (y - c.y) * k - T.y) < T.r + 0.5;
    };
    // Whether the shape could stand at spot `i` (an index into `spots`) now: 0 if not, else how likely it is chosen
    // (`CHOOSE`); `wide` looks further out and across, for one that has waited long. `placeOoga` first.
    const fits = (i, wide, me, who) => {
      const c = camera.position, H = TOP * SCALE, x = spots[i], z = spots[i + 1], d = Math.hypot(x - c.x, H * 0.5 - c.y, z - c.z), across = wide ? VIEW.wideX : VIEW.x;
      if (d < VIEW.near || d > far + (wide ? VIEW.wider : 0)) return 0;
      lo = wide ? Math.min(top, VIEW.top) : top; hi = wide ? Math.max(bottom, VIEW.bottom) : bottom;
      if (me && Math.hypot(x - me.root.position.x, z - me.root.position.z) < AWAY.ooga) return 0;
      if (who && Math.hypot(x - who.x, z - who.z) < AWAY.guide) return 0;
      if (!inView(x, H * 0.5, z, across) || !inView(x, H * 0.97, z) || !inView(x, 0.15, z) || behindOoga(x, z, wide)) return 0;
      if (!clear(x, z, AWAY.body)) return 0;
      if (!sightClear(c.x, c.y, c.z, x, H * 0.55, z) || !sightClear(c.x, c.y, c.z, x, H * 0.9, z)) return 0;
      const C = CHOOSE, off = Math.abs(renderer.project(x, H * 0.5, z, SCREEN).x / renderer.size.width - 0.5);
      let w = Math.max(0.03, smooth((off - C.aside[0]) / (C.aside[1] - C.aside[0]))) * (1 - (1 - C.edgeLeast) * smooth((off - C.edge[0]) / (C.edge[1] - C.edge[0])));
      w *= 1 - (1 - C.farLeast) * smooth((d - C.far[0]) / (C.far[1] - C.far[0]));
      if (overNeon(c, x, H * 0.55, z) || overNeon(c, x, H * 0.9, z)) w *= C.neon;
      for (let k = 0; k < lastN; k++) w *= C.least + (1 - C.least) * smooth(Math.hypot(x - last[k * 2], z - last[k * 2 + 1]) / C.apart);
      return w;
    };
    // The search for a spot, `SCAN` spots a frame so no one frame pays for them all: where it has got to in `spots` (-1
    // between searches), whether it looks wide, and how many it has found (in `found`, each as likely as its `weight`,
    // `total` all told).
    const weight = new Float32Array(spots.length / 2);
    let cursor = -1, wideSearch = false, n = 0, total = 0;
    const keep = (i, w) => {
      if (w > 0) { found[n] = i; weight[n++] = w; total += w; }
    };
    // One of those found, at random as likely as its weight, or -1.
    const chosen = () => {
      let r = Math.random() * total;
      for (let k = 0; k < n; k++) if ((r -= weight[k]) <= 0) return found[k];
      return n ? found[n - 1] : -1;
    };
    // A spot in good view, the whole search at once (`play`).
    const pick = (wide) => {
      const me = ooga(), who = guide();
      placeOoga(me);
      cursor = -1; n = 0; total = 0;
      for (let i = 0; i < spots.length; i += 2) keep(i, fits(i, wide, me, who));
      return chosen();
    };


    const show = (on) => { for (const node of nodes) { node.visible = on; if (!on) node.instanceCount = 0; } };
    const begin = (i) => {
      at.x = spots[i]; at.z = spots[i + 1];
      last[lastAt * 2] = at.x; last[lastAt * 2 + 1] = at.z; lastAt = (lastAt + 1) % CHOOSE.recent; lastN = Math.min(lastN + 1, CHOOSE.recent);
      at.mirror = Math.random() < 0.5 ? -1 : 1; at.slow = Math.random() * Math.PI * 2;
      const form = between(SHOW.form), dissolve = between(SHOW.dissolve), hold = clamp(between(SHOW.total) - form - dissolve, SHOW.hold[0], SHOW.hold[1]);
      at.formed = form; at.held = form + hold; at.gone = at.held + dissolve; at.end = at.gone + between(RESIDUE.life);
      state = "show"; t = 0; fadeAt = -1; loud = 0; waited = 0; overdue = 0; shows++; cohereAt = -1; coh = 0;
      // Every bar away to start with, each coming at its own moment once it is forming.
      for (let b = 0; b < TEARS.n; b++) { tear.on[b] = 0; tear.next[b] = form * 0.6 + between(TEARS.off); }
      near.on = Math.random() < NEAR.chance; near.reach = between(NEAR.reach); near.share = between(NEAR.share); near.peak = between(NEAR.strength);
      near.seed = Math.floor(Math.random() * 1e6); near.left = NEAR.times; near.inside = false; near.active = false; near.k = 0;
      near.catchOn = Math.random() < CATCH.chance; near.close = between(CATCH.close); near.catchShare = between(CATCH.share);
      near.catchSeed = Math.floor(Math.random() * 1e6); near.caught = false; near.c = near.b = 0; near.tear = false;
      near.stirOn = Math.random() < STIR.chance; near.stirReach = between(STIR.reach); near.stirPeak = between(STIR.strength); near.s = 0;
      show(true);
      sphere[0] = at.x; sphere[1] = TOP * SCALE * 0.55; sphere[2] = at.z; sphere[3] = TOP * SCALE + 2;
    };
    // Back to waiting, the next one GAP.next s away; the hall held for its other events `AFTER` s after.
    const finish = () => {
      state = "wait"; t = 0; fadeAt = -1; loud = 0;
      show(false);
      after = AFTER; calm = 0;
      due = auto ? (gap !== null ? gap : between(GAP.next)) : Infinity;
      if (audio) audio.glint(at.x, 1, at.z, 0);
    };
    // Something else wants the hall, or the tab hid: clear away now (`instant`) or over `CLEAR` s.
    const CLEAR = 0.4;
    const abort = (instant) => {
      if (state === "wait") return;
      if (instant) finish();
      else if (fadeAt < 0) fadeAt = t;
    };

    // One soft picture into `node`'s batch at instance `i`: centred at (px, py, pz), turned to the view, `along` m long
    // and `across` m wide, leaning `lean` rad from lying along the view's right toward up, as strong as `opacity`.
    const sprite = (node, i, px, py, pz, along, across, lean, opacity) => {
      const d = node.instanceData, o = i * 20, c = Math.cos(lean), s = Math.sin(lean);
      if (flat) { if (along < across) along *= FLAT.thin; else across *= FLAT.thin; opacity *= FLAT.strong; }
      d[o] = rx * c * along; d[o + 1] = s * along; d[o + 2] = rz * c * along; d[o + 3] = 0;
      d[o + 4] = -rx * s * across; d[o + 5] = c * across; d[o + 6] = -rz * s * across; d[o + 7] = 0;
      d[o + 8] = vx * 0.01; d[o + 9] = vy * 0.01; d[o + 10] = vz * 0.01; d[o + 11] = 0;
      d[o + 12] = px; d[o + 13] = py; d[o + 14] = pz; d[o + 15] = 1;
      // The glow is the Canvas 2D diamonds' brightness; the opacity, as `-1 - opacity`, both renderers' coverage.
      d[o + 16] = flat ? 0.5 + opacity : 0; d[o + 17] = 0; d[o + 18] = -1 - clamp(opacity, 0, 1); d[o + 19] = 0;
    };

    // How far it has risen now, m; and the bars showing now, as bands of the figure they slip (`band*`), for `place`.
    let up = 0, bands = 0;
    const bandY = new Float32Array(TEARS.n), bandH = new Float32Array(TEARS.n), bandSlip = new Float32Array(TEARS.n);
    // Where the figure's point at (x, y), model units, stands in the world now, slipped by any bar across it, into `P`.
    const P = { x: 0, y: 0, z: 0 };
    const place = (x, y) => {
      for (let b = 0; b < bands; b++) if (Math.abs(y - bandY[b]) < bandH[b]) x += bandSlip[b];
      const across = x * SCALE * at.mirror;
      P.x = at.x + rx * across; P.y = y * SCALE + up; P.z = at.z + rz * across;
    };
    // How much of it shows at height `y`, model units, as it comes apart below the hips; and how bright it is there.
    const legs = (y) => smooth((y - FALL.to) / (FALL.from - FALL.to));
    const height = (y) => 0.6 + 0.4 * smooth((y - 0.7) / 0.9);

    // The frame's figure at its clock. `shown` is how much of it shows overall, `spread` how far it has come apart as it
    // dissolves, and `lasting` how strong the afterimage is (coming up as it dissolves, fading at its end). Each point
    // gathers from where it starts at its own moment, glints, and drifts to where it goes as the figure dissolves.
    const draw = (elapsed, dt) => {
      const H = SCALE, e = fadeAt < 0 ? 1 : 1 - smooth((t - fadeAt) / CLEAR), formed = at.formed, dissolve = at.gone - at.held, rest = still.matches;
      // `bits`, how much of its sparks show, lasts longer into the dissolve than the figure does as a whole.
      const spread = smooth((t - at.held) / dissolve), gather = smooth(t / (formed * 0.4)), shown = gather * (1 - spread) * e, bits = gather * (1 - spread * spread) * e, drift = rest ? 0 : spread * spread;
      const lasting = spread * Math.pow(1 - smooth((t - at.gone) / (at.end - at.gone)), 0.8) * e;
      // Wavering in strength as it holds, now and then dropping out for a moment.
      coh = cohereAt < 0 ? 0 : smooth((t - cohereAt) / COHERE.rise) * (1 - smooth((t - at.held) / COHERE.fall)) * e;
      const slot = Math.floor(t / 0.9), drop = !rest && coh === 0 && t > formed && t < at.held && hash(slot * 31 + 7) < 0.15 && t - slot * 0.9 < 0.12 ? 0.5 : 1;
      const breathing = (rest ? 0.9 : 0.85 + 0.15 * Math.sin(t * 1.7 + at.slow)) * drop, breath = breathing + (0.95 - breathing) * coh;
      up = rest ? 0 : Math.min(RESIDUE.most, Math.max(0, t - at.held) * RESIDUE.rise);
      const slowly = rest ? 0.2 : 1, step = flat ? FLAT.every : 1;
      let ns = 0, nl = 0, nb = 0, ng = 0;
      // The bars: each comes for a moment at one of its heights, tearing across the figure from inside its outline out
      // past it on one side, sliding and flickering, the band it crosses slipped sideways, sometimes in two lengths with a
      // gap between, then goes for a while; none under reduced motion, nor once it has started to dissolve.
      bands = 0;
      if (!rest && shown > 0.01) for (let b = 0; b < TEARS.n; b++) {
        if (near.tear && !tear.on[b]) { tear.next[b] = 0; near.tear = false; }
        if (coh > 0.5 && tear.on[b]) { tear.on[b] = 0; tear.next[b] = between(TEARS.off); }
        if ((tear.next[b] -= dt) <= 0) {
          tear.on[b] = tear.on[b] || t < formed * 0.6 || t > at.held + dissolve * 0.3 || Math.random() < Math.max(near.k * NEAR.calms, near.c, coh) ? 0 : 1;
          tear.next[b] = between(tear.on[b] ? TEARS.on : TEARS.off);
          if (tear.on[b]) {
            const range = TEARS.heights[b], y = range[0] + Math.random() * (range[1] - range[0]), k = Math.min(RC.hi.length - 1, Math.floor(y / REACH));
            tear.y[b] = y; tear.side[b] = Math.random() < 0.5 ? -1 : 1;
            tear.start[b] = (tear.side[b] > 0 ? RC.hi[k] : RC.lo[k]) * (0.1 + Math.random() * 0.8);
            tear.length[b] = between(TEARS.length); tear.width[b] = between(TEARS.width); tear.glow[b] = 0.6 + Math.random() * 0.4;
            tear.slide[b] = (Math.random() - 0.5) * 2 * TEARS.slide; tear.slip[b] = Math.random() < TEARS.slips ? between(TEARS.slip) * (Math.random() < 0.5 ? -1 : 1) : 0;
            tear.band[b] = between(TEARS.band); tear.split[b] = Math.random() < 0.4 ? 1 : 0;
          }
        }
        if (!tear.on[b]) continue;
        tear.start[b] += tear.slide[b] * dt / H;
        bandY[bands] = tear.y[b]; bandH[bands] = tear.band[b]; bandSlip[bands] = tear.slip[b]; bands++;
        const flicker = (0.7 + 0.3 * Math.sin(elapsed * 37 + b * 5)) * tear.glow[b] * TEARS.glow * shown, side = tear.side[b] * at.mirror, length = tear.length[b];
        const first = tear.split[b] ? length * 0.55 : length;
        place(tear.start[b], tear.y[b]);
        sprite(bars, nb++, P.x + rx * side * first / 2, P.y, P.z + rz * side * first / 2, first, tear.width[b], 0, flicker);
        if (tear.split[b]) {
          const reach = first + length * 0.1 + length * 0.175;
          sprite(bars, nb++, P.x + rx * side * reach, P.y, P.z + rz * side * reach, length * 0.35, tear.width[b] * 0.8, 0, flicker * 0.75);
        }
      }
      if (bits > 0.005) {
        // The outline: a spark at each point and a stroke from every second point to the next but one, in runs glinting
        // on and off together, each spark twinkling on its own.
        for (let i = 0; i < E.n; i++) {
          const y = E.y[i], fade = legs(y);
          if (fade <= 0) continue;
          const arrive = Math.max(coh, smooth((t - E.delay[i] * formed) / (formed * 0.45)));
          if (arrive <= 0) continue;
          // A run steadied near the visitor's Ooga holds steady at an even glint and nearly still; one caught closer in
          // holds whole, still and brighter for an instant, then breaks apart, dimming and straying.
          const mine = near.c > 0 || near.b > 0 ? hash(Math.floor(E.runPhase[i] * 1000) + near.catchSeed) < near.catchShare : false;
          const caught = Math.max(coh, mine ? near.c : 0), broke = mine ? near.b : 0;
          const settled = near.k > 0 && hash(Math.floor(E.runPhase[i] * 1000) + near.seed) < near.share ? near.k : 0, steady = Math.max(settled, caught);
          const glint = rest ? 1 : EDGE.gap + (1 - EDGE.gap) * smooth((Math.sin(elapsed * E.runRate[i] + E.runPhase[i]) + 1 - 2 * EDGE.on) / 0.4 + 0.5);
          const even = rest ? glint : glint + (NEAR.level - glint) * settled, run = even + (1 - even) * caught;
          const base = fade * height(y) * arrive * bits * breath * run * (1 + NEAR.bright * near.k + CATCH.bright * (caught - coh) + COHERE.bright * coh) * (1 - CATCH.dim * broke);
          if (base <= 0.01) continue;
          const stray = (1 - NEAR.still * steady) * (1 - 0.3 * caught) * (1 - COHERE.still * coh) * (1 + (rest ? 0 : CATCH.scatter) * broke);
          const apart = rest ? 0 : 1 - arrive, j = i * 2, jitter = EDGE.jitter * stray * Math.sin(E.phase[i] + elapsed * 0.7 * slowly);
          const x0 = E.x[i] + E.nx[i] * jitter + E.from[j] * apart + E.to[j] * drift, y0 = y + E.ny[i] * jitter + E.from[j + 1] * apart + E.to[j + 1] * drift;
          if (i % (EDGE.every * step) === 0) {
            const flicker = 0.45 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin(elapsed * E.rate[i] * slowly + E.phase[i]), 2), twinkle = flicker + (1 - flicker) * caught;
            place(x0, y0);
            sprite(sparks, ns++, P.x, P.y, P.z, E.size[i], E.size[i], 0, EDGE.sparkGlow * base * twinkle * (1 + 1.5 * spread));
          }
          if (i % EDGE.span === 0) {
            const k = (i + EDGE.span) % E.n;
            place(x0, y0);
            const ax = P.x, ay = P.y, az = P.z;
            // The stroke moves as one with its first point, and shows only once that is nearly in place; as the figure comes
            // apart its outline crumbles a run at a time, each run at its own moment.
            place(E.x[k] + (x0 - E.x[i]), E.y[k] + (y0 - y));
            const along = (P.x - ax) * rx + (P.z - az) * rz, dy = P.y - ay, length = Math.hypot(along, dy) * 1.25 + 0.01, lean = Math.atan2(dy, along);
            const whole = base * smooth((arrive - 0.6) / 0.4) * smooth((0.08 + 0.72 * E.runPhase[i] / (Math.PI * 2) - spread) / 0.1);
            // A thin hot line, and a wider glow along it.
            if (whole > 0.01) {
              sprite(lines, nl++, (ax + P.x) / 2, (ay + P.y) / 2, (az + P.z) / 2, length, stroke, lean, EDGE.strokeGlow * whole);
              if (!flat) sprite(lines, nl++, (ax + P.x) / 2, (ay + P.y) / 2, (az + P.z) / 2, length, stroke * EDGE.halo, lean, EDGE.haloGlow * whole);
            }
          }
        }
        // The glitter within.
        for (let i = 0; i < G.n; i += step) {
          const y = G.y[i], fade = legs(y);
          if (fade <= 0) continue;
          const arrive = smooth((t - G.delay[i] * formed) / (formed * 0.5));
          if (arrive <= 0) continue;
          const twinkle = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(elapsed * G.rate[i] * slowly + G.phase[i]), 3);
          const opacity = GLITTER.glow * fade * height(y) * arrive * bits * breath * twinkle * (1 - COHERE.glitter * coh);
          if (opacity <= 0.01) continue;
          const apart = rest ? 0 : 1 - arrive, j = i * 2;
          place(G.x[i] + G.from[j] * apart + G.to[j] * drift, y + G.from[j + 1] * apart + G.to[j + 1] * drift);
          sprite(sparks, ns++, P.x, P.y, P.z, G.size[i], G.size[i], 0, opacity);
        }
        // The falling stream from the hips to the floor, thinning as it falls.
        for (let i = 0; i < FL.n; i += step) {
          const fallen = rest ? 0 : elapsed * FL.speed[i] / H, y = ((FL.y[i] - fallen) % FALL.top + FALL.top) % FALL.top;
          const opacity = FALL.glow * (1 - COHERE.stream * coh) * bits * breath * smooth(y / 0.12) * (0.35 + 0.65 * smooth(y / FALL.top)) * (0.5 + 0.5 * Math.sin(elapsed * 4 * slowly + FL.phase[i]));
          if (opacity <= 0.01) continue;
          place(FL.x[i] * (0.6 + 0.4 * y / FALL.top), y + spread * 0.2);
          sprite(sparks, ns++, P.x, P.y, P.z, FL.size[i], FL.size[i], 0, opacity);
        }
      }
      // The motes, drifting up round it while it shows and through the afterimage, stirred aside as the Ooga passes.
      const mote = shown * 0.8 + lasting, stirred = 1 + STIR.bright * near.s, push = rest ? 0 : -near.side * at.mirror * near.s * STIR.push;
      if (mote > 0.01) for (let i = 0; i < MO.n; i += step) {
        const y = (MO.y[i] + (rest ? 0 : elapsed * MO.rise[i] / H)) % 1.9, opacity = MOTES.glow * mote * stirred * smooth(y / 0.2) * smooth((1.9 - y) / 0.3) * (0.4 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(near.clock * 2.3 * slowly + MO.phase[i]), 2));
        if (opacity <= 0.01) continue;
        place(MO.x[i] + (rest ? 0 : 0.03 * Math.sin(elapsed * 0.6 + MO.phase[i])) + push * smooth(y / 0.6), y);
        sprite(sparks, ns++, P.x, P.y, P.z, MO.size[i], MO.size[i], 0, opacity);
      }
      // The afterimage's streaks, standing where it stood and shimmering.
      if (lasting > 0.01) for (let i = 0; i < SK.n; i++) {
        const opacity = RESIDUE.streakGlow * lasting * stirred * (0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(near.clock * 1.3 * slowly + SK.phase[i]), 2));
        if (opacity <= 0.01) continue;
        place(SK.x[i], SK.y[i] + SK.length[i] / H / 2);
        sprite(lines, nl++, P.x, P.y, P.z, SK.length[i], RESIDUE.streakWidth, Math.PI / 2, opacity);
      }
      // The column of light it stands in.
      const column = SHAFT.glow * shown * breath + SHAFT.lingers * lasting;
      if (!flat && column > 0.003) {
        place(0, SHAFT.h / H / 2);
        sprite(glow, ng++, P.x, P.y, P.z, SHAFT.w, SHAFT.h, 0, column);
      }
      sparks.instanceCount = ns; lines.instanceCount = nl; bars.instanceCount = nb; glow.instanceCount = ng;
      for (const node of nodes) node.instanceVersion++;
      // Its sound only while the figure forms and holds: the afterimage is silent.
      loud = shown;
    };

    // Which way the view faces on the ground, rad, and how fast it turns, rad/s, eased.
    let facing = NaN, turning = 0;
    const update = (dt, elapsed) => {
      if (after > 0) after -= dt;
      calm = busy() ? 0 : calm + dt;
      const heading = Math.atan2(camera.target.x - camera.position.x, camera.target.z - camera.position.z);
      if (facing === facing && dt > 0) {
        let turn = heading - facing;
        turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
        turning += (Math.abs(turn) / dt - turning) * Math.min(1, dt * 8);
      }
      facing = heading;
      if (state === "wait") {
        due -= dt;
        if (due <= 0) overdue += dt;
        const me = ooga();
        if (!auto || due > 0 || calm < CALM || after > 0 || !me || me.camp.seat) { cursor = -1; return; }
        // Due and the hall free: how long it has looked for a place, to widen the search once that runs long.
        waited += dt;
        if (cursor < 0) {
          if ((look -= dt) > 0) return;
          look = LOOK;
          if (document.querySelector("dialog[open]") || turning > CHOOSE.turn) return;
          cursor = 0; n = 0; total = 0; wideSearch = waited > VIEW.relax;
        }
        const who = guide(), stop = Math.min(spots.length, cursor + SCAN * 2);
        placeOoga(me);
        for (; cursor < stop; cursor += 2) keep(cursor, fits(cursor, wideSearch, me, who));
        if (cursor < spots.length) return;
        cursor = -1;
        // The one chosen, checked again as the view stands now, which may have moved during the search.
        const i = chosen();
        if (i >= 0 && turning <= CHOOSE.turn && fits(i, wideSearch, me, who)) begin(i);
        return;
      }
      if (calm === 0) abort(false);
      t += dt;
      if (fadeAt >= 0 ? t - fadeAt >= CLEAR : t >= at.end) { finish(); return; }
      // Turned to the view: the camera's horizontal right, and the way back to it from where it stands.
      const c = camera.position, bx = c.x - at.x, by = c.y - TOP * SCALE * 0.5, bz = c.z - at.z, bl = Math.hypot(bx, by, bz) || 1, hl = Math.hypot(bx, bz) || 1;
      vx = bx / bl; vy = by / bl; vz = bz / bl; rx = bz / hl; rz = -bx / hl; stroke = Math.max(EDGE.stroke, bl * EDGE.thin);
      steadyNear(dt);
      draw(elapsed, dt);
      if (audio) audio.glint(at.x, TOP * SCALE * 0.55, at.z, loud);
    };

    // The visitor's Ooga coming within reach while it holds: now and then, after a moment, it steadies a little, then
    // lets go again even if the Ooga stays; it never waits or lasts longer for it.
    const steadyNear = (dt) => {
      const me = ooga(), d = me ? Math.hypot(me.root.position.x - at.x, me.root.position.z - at.z) : Infinity, inside = d < near.reach;
      // Its afterimage stirring as the Ooga passes, more the nearer, settling again once it has gone by.
      const stir = near.stirOn && t > at.gone && fadeAt < 0 ? near.stirPeak * smooth((near.stirReach - d) / 1.5) : 0;
      near.s += (stir - near.s) * Math.min(1, dt * (stir > near.s ? STIR.up : STIR.down));
      if (me) near.side = (me.root.position.x - at.x) * rx + (me.root.position.z - at.z) * rz < 0 ? -1 : 1;
      near.clock += dt * (1 + (still.matches ? 0 : STIR.quicken) * near.s);
      // Closer still, once a showing at most: a moment later a few fragments catch for an instant, then break apart.
      if (!near.caught && near.catchOn && d < near.close && fadeAt < 0 && t > at.formed && t < at.held - 0.6) {
        near.caught = true; near.ct = -between(CATCH.delay); near.catchLen = between(CATCH.hold);
      }
      if (near.caught && near.ct < near.catchLen + CATCH.fall && fadeAt < 0) {
        const T = (near.ct += dt), L = near.catchLen;
        near.c = T < 0 || T >= L ? 0 : Math.min(1, T / 0.05);
        near.b = T < L ? 0 : 1 - smooth((T - L) / CATCH.fall);
        if (T >= L && T - dt < L && Math.random() < CATCH.tears) near.tear = true;
      } else near.c = near.b = 0;
      if (inside && !near.inside && near.on && near.left > 0 && fadeAt < 0 && t > at.formed && t < at.held - NEAR.rise) {
        near.active = true; near.t = -between(NEAR.delay); near.hold = between(NEAR.hold);
        near.strength = near.peak * (near.left === NEAR.times ? 1 : NEAR.again); near.left--;
      }
      near.inside = inside;
      if (!near.active) { near.k = 0; return; }
      const T = (near.t += dt), R = NEAR.rise, env = T < 0 ? 0 : T < R ? smooth(T / R) : T < R + near.hold ? 1 : 1 - smooth((T - R - near.hold) / NEAR.fall);
      near.k = env * near.strength * (0.85 + 0.15 * Math.sin(t * 2.3 + near.seed)) * (1 - smooth((t - at.held) / 0.4)) * (fadeAt < 0 ? 1 : 0);
      if (T > R + near.hold + NEAR.fall || t > at.held + 0.4 || fadeAt >= 0) { near.active = false; near.k = 0; }
    };

    const onVisibility = () => { if (document.hidden) abort(true); };
    document.addEventListener("visibilitychange", onVisibility);
    const dispose = () => {
      document.removeEventListener("visibilitychange", onVisibility);
      abort(true);
    };
    const liveGeometry = (set) => { for (const node of nodes) set.add(node.geometry); };

    // `play(spot)`: show one now at spot index `spot` or one in view as a search would find it, strictly or else as one
    // that has waited long (else the nearest in front), whatever else is going on.
    const debug = {
      play: (spot = -1) => {
        abort(true);
        let i = spot >= 0 ? spot * 2 : pick(false);
        if (i < 0 && spot < 0) i = pick(true);
        if (i < 0) {
          const c = camera.position;
          let best = Infinity;
          for (let j = 0; j < spots.length; j += 2) {
            const d = Math.hypot(spots[j] - c.x, spots[j + 1] - c.z);
            if (d > VIEW.near && d < best && inView(spots[j], TOP * SCALE * 0.5, spots[j + 1])) { best = d; i = j; }
          }
        }
        if (i < 0) return false;
        begin(i);
        return true;
      },
      end: () => abort(true),
      get state() { return state; }, get at() { return state === "wait" ? null : [at.x, at.z]; }, get spots() { return spots.length / 2; },
      get timeline() { return state === "wait" ? null : [at.formed, at.held, at.gone, at.end].map((v) => +v.toFixed(2)); },
      get due() { return due; }, get calm() { return calm; }, get after() { return after; }, get t() { return t; },
      get count() { return sparks.instanceCount + lines.instanceCount + bars.instanceCount + glow.instanceCount; }, get coherence() { return coh; },
      get loud() { return loud; },
      get near() { return { on: near.on, reach: +near.reach.toFixed(2), left: near.left, k: +near.k.toFixed(3), catchOn: near.catchOn, close: +near.close.toFixed(2), caught: near.caught, c: +near.c.toFixed(2), b: +near.b.toFixed(2), stirOn: near.stirOn, stirReach: +near.stirReach.toFixed(2), s: +near.s.toFixed(3) }; }
    };
    return {
      update, liveGeometry, dispose, debug,
      // What the hangar may read of it: whether it shows (`state`), its clock, s, where it stands and its timeline (`at`,
      // not to be changed), whether it is clearing away early, how many bars tear across it now, and how many have come.
      at, get state() { return state; }, get t() { return t; }, get fading() { return fadeAt >= 0; }, get bands() { return bands; }, get shows() { return shows; },
      // Steady `start` s from now as it never otherwise does (`COHERE`), hold so `hold` s, then dissolve over `dissolve` s,
      // leaving only a short afterimage; returns how long until it starts dissolving, s. Already dissolving or gone to its
      // afterimage, it only clears away, and returns -1.
      cohere: (start, hold, dissolve) => {
        if (state !== "show") return -1;
        if (t >= at.held || fadeAt >= 0) { if (fadeAt < 0) fadeAt = t; return -1; }
        cohereAt = t + start; at.held = cohereAt + hold; at.gone = at.held + dissolve; at.end = at.gone + 1;
        return at.held - t;
      },
      // Whether, while it shows, its middle or its head is in sight from (x, y, z), past walls, boxes and the Jet.
      seen: (x, y, z) => state === "show" && (sightClear(x, y, z, at.x, TOP * SCALE * 0.55, at.z) || sightClear(x, y, z, at.x, TOP * SCALE * 0.9, at.z)),
      // Whether the events that come by themselves should wait: while it shows, for AFTER s after, and for CLAIM s once
      // one is due.
      get holding() { return state !== "wait" || after > 0 || auto && due <= 0 && overdue < CLAIM; }
    };
  };

  BL.hangarShimmer = { create, SHOW, RESIDUE, GAP };
})();
