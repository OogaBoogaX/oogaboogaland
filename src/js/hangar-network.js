// A Lightning network of nodes and channels filling the Lightning Jet Hangar for a few seconds, a first draft shown
// only on a debug page (`network=`, Shift+N in the hangar). It comes as the hall's power seems to go: the lights dip
// twice, irregularly, then the ordinary lights, screens and neon go out and only the emergency lights stay on (`POWER`,
// `EMERGENCY`, and under reduced motion one smooth fade instead of the dips). Nodes stand at real depths round where it
// starts: a few near ones and more at middle distance (chunky balls of voxels in cyans and blues, a warm glow inside
// each, turning slowly in a soft halo), more again far off through the hall and down the launch tunnel (points with
// warm middles), many faint points, some violet (`DENSITY`, `LAYERS`, `DUST`), and faint clouds of colour high up and
// far off (`NEBULA`), arriving far first. Channels grow between linked pairs only, every node joined into one network,
// bright beads drifting along them (`BEADS`); payments run hop by hop along routes of two to four linked channels, a
// glint at each node they pass and a faint glow back along the route once they settle (`PULSE`). A few of the near
// nodes light what is round them (`GLOW`), and the view's bloom strengthens while it stands (`BLOOM`). Then each layer slips its own way,
// the channels shrink to a point and fade (`T.breakup`), and the power comes smoothly back. `env` is what the scene
// applies: its lights, its own light, its pictures, the runway's markers, the emergency lights, the hall's hum, and with
// `fog` its haze pulled in. The graph is an illustration laid out each time from a seed: no live data, names or amounts.
// Additive sprites and ribbons turned to the view, written in place into fixed batches; on Canvas 2D, plain diamonds
// without the halos. Nothing allocates a frame.
(() => {
  "use strict";
  const BL = window.BL;
  const { createNode, addChild } = BL.scene;
  const { clamp, mulberry32, hexToRgb } = BL.math;
  const { cached, noShadow } = BL.models;
  const HM = BL.hangarModels, LAYOUT = HM.LAYOUT, HALL = LAYOUT.HALL, TUN = LAYOUT.tunnel;

  const smooth = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  const between = (r, [a, b]) => a + r() * (b - a);

  // The two densities: nodes by layer, faint points, channels each node reaches for, the long links of the busiest
  // nodes, and payments in flight at once.
  const DENSITY = {
    a: { near: 10, mid: 40, far: 50, dust: 300, links: [2, 2, 1], hubs: 6, hubLinks: 3, pulses: 8 },
    b: { near: 14, mid: 85, far: 120, dust: 900, links: [2, 3, 2], hubs: 10, hubLinks: 3, pulses: 14 }
  };
  // Where each layer's nodes stand from the anchor, m, how high, m, and how big their core and halo are, m.
  // A near or middle node is a ball of voxels (`ball`, m across); a far one a point (`core`).
  const LAYERS = [
    { r: [1.6, 6], y: [0.9, 3.4], core: [0.07, 0.1], halo: [0.9, 1.3], ball: [0.3, 0.46], reach: 9 },
    { r: [6, 18], y: [0.6, 10], core: [0.06, 0.09], halo: [0.5, 0.8], ball: [0.14, 0.24], reach: 13 },
    { r: [16, 90], y: [1.5, 16], core: [0.09, 0.14], halo: [0.6, 0.95], ball: [0, 0], reach: 22 }
  ];
  // The faint points: how big, m, how bright, how near the anchor at the least, m, and the share of them violet.
  const DUST = { size: [0.05, 0.1], glow: [0.3, 0.7], least: 10, violet: 0.3 };
  // The beads along each channel: one every `every` m, at most `most` a channel and `max` in all, how big, m, how
  // strong at rest and while a payment runs along their channel, how fast they drift along it, m/s, and at most how many
  // a channel on Canvas 2D.
  const BEADS = { every: 1.4, most: 9, max: 1800, size: 0.07, rest: 0.12, lit: 1, speed: 0.35, flat: 3 };
  // Faint clouds of colour high up and far off: how many, how big, m, and how strong.
  const NEBULA = { n: 7, size: [9, 18], glow: [0.1, 0.2] };
  // A ball of voxels: how bright its faces are, how big its warm glow is against it, and how near the view it fades out, m.
  const BALL = { glow: 0.42, ember: 1.1, clear: 1.1 };
  // How much stronger the view's bloom is while the network stands.
  const BLOOM = 0.35;
  // The timeline, s from a play's start: the shape steadying from `cohere`, holding `hold` s and dissolving over
  // `dissolve` s; each layer arriving (far first) once the power has gone, each node fading in, each channel waiting
  // before it grows, payments, the breakup and its length, the power coming back and its length, the end, and how long
  // after it the hall's other events still wait (`quiet`).
  const T = { cohere: 0.15, hold: 0.85, dissolve: 1.4, far: [2.4, 3.3], mid: [2.8, 3.8], near: [3.2, 4.1], dust: [2.3, 3.9], fade: 0.7,
    growWait: [0.1, 0.6], pulses: [4.4, 10.8], breakup: 11, breakLen: 2.2, restore: 12.6, restoreLen: 2, end: 14.8, quiet: 15 };
  // The power faltering: two dips, each [when, s, how low, how long it holds there, s, where it comes back to], falling
  // over `drop` s and coming back over `back` s; then the cut at `cut` s, the lights dying over `cutLen` s, and the
  // emergency lights coming on `backup` s after it over `backupLen` s. Under reduced motion one smooth fade from `fade`
  // over `fadeLen` s instead, the emergency lights coming on as it ends.
  const POWER = { dips: [[1, 0.62, 0.08, 0.94], [1.58, 0.45, 0.11, 0.8]], drop: 0.05, back: 0.14, cut: 2.05, cutLen: 0.28, backup: 0.2, backupLen: 0.45,
    fade: 1, fadeLen: 1.4 };
  // How much stays on with the power out: the hall's lights, its own light, the screens, the runway's markers (steady,
  // as emergency lights) and the hall's hum.
  const EMERGENCY = { lights: 0.03, hall: 0.16, screens: 0.04, markers: 0.45, hum: 0.12 };
  // The near nodes that light what is round them: how many, how far, m, and their colour.
  const GLOW = { n: 4, reach: 6, color: [0.26, 0.58, 1] };
  // A payment's speed, m/s, how long a hop takes at the least and most, s, its trail, and its settle glint, s.
  const PULSE = { speed: 7, hop: [0.45, 1.6], trail: 3, gap: 0.06, settle: 0.6, back: 1.6, every: [0.25, 0.7] };
  // The hall's haze, near and far, m, as it is and pulled in while the hall is dimmest (with `fog`).
  const FOG = { near: [14, 4], far: [120, 32] };
  // A channel's least width, m, and its width a metre off, m; how strong it is at rest, kept faint so the eye goes to
  // the nodes and their depth, and while a payment runs along it, and how much wider it is then.
  const CHANNEL = { width: 0.026, thin: 0.0022, glow: 0.13, lit: 0.95, widen: 0.8 };

  const paint = (w, h, seed, rgb, alphaAt) => {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d"), img = ctx.createImageData(w, h), rand = mulberry32(seed);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w, v = (y + 0.5) / h, o = (y * w + x) * 4, c = typeof rgb === "function" ? rgb(u, v) : rgb;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = Math.round(clamp(alphaAt(u, v, rand), 0, 1) * 255);
    }
    ctx.putImageData(img, 0, 0);
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    return { image, w, h };
  };
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const WHITE = [232, 250, 255], CYAN = [80, 205, 255], BLUE = [40, 110, 255], AMBER = [255, 176, 46], CREAM = [255, 236, 200], VIOLET = [170, 120, 255], NIGHT = [70, 60, 200], GOLD = [255, 205, 70], ORANGE = [255, 128, 20];
  // Soft value noise for the clouds.
  const noise = (x, y, seed) => {
    const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
    const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
    return h(ix, iy) * (1 - fx) * (1 - fy) + h(ix + 1, iy) * fx * (1 - fy) + h(ix, iy + 1) * (1 - fx) * fy + h(ix + 1, iy + 1) * fx * fy;
  };
  const pictures = cached(() => ({
    // A far node: a warm middle in a cyan rim.
    core: paint(32, 32, 11, (u, v) => { const d = Math.hypot(u - 0.5, v - 0.5) * 2; return d < 0.35 ? mix(CREAM, AMBER, d / 0.35) : mix(AMBER, CYAN, smooth((d - 0.35) / 0.35)); }, (u, v) => {
      const r2 = ((u - 0.5) ** 2 + (v - 0.5) ** 2) * 4;
      return (Math.exp(-r2 * 9) + Math.exp(-r2 * 2.5) * 0.45) * (1 - smooth((r2 - 0.75) / 0.25));
    }),
    // A faint point, white to cyan, or violet.
    star: paint(32, 32, 15, (u, v) => mix(WHITE, CYAN, smooth(Math.hypot(u - 0.5, v - 0.5) * 3)), (u, v) => {
      const r2 = ((u - 0.5) ** 2 + (v - 0.5) ** 2) * 4;
      return (Math.exp(-r2 * 9) + Math.exp(-r2 * 2.5) * 0.35) * (1 - smooth((r2 - 0.75) / 0.25));
    }),
    violet: paint(32, 32, 16, (u, v) => mix(WHITE, VIOLET, smooth(Math.hypot(u - 0.5, v - 0.5) * 2.5)), (u, v) => {
      const r2 = ((u - 0.5) ** 2 + (v - 0.5) ** 2) * 4;
      return (Math.exp(-r2 * 9) + Math.exp(-r2 * 2.5) * 0.4) * (1 - smooth((r2 - 0.75) / 0.25));
    }),
    // The warm glow inside a ball of voxels, seen through its near side.
    ember: paint(32, 32, 17, (u, v) => mix(GOLD, ORANGE, smooth(Math.hypot(u - 0.5, v - 0.5) * 2.4)), (u, v) => {
      const r2 = ((u - 0.5) ** 2 + (v - 0.5) ** 2) * 4;
      return (Math.exp(-r2 * 7) * 0.85 + Math.exp(-r2 * 2.4) * 0.3) * (1 - smooth((r2 - 0.7) / 0.3));
    }),
    // A bead: a small soft square, white in a cyan glow.
    bead: paint(16, 16, 18, (u, v) => mix(WHITE, CYAN, smooth(Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 3)), (u, v) => {
      const d = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2;
      return d < 0.45 ? 1 : Math.exp(-(((d - 0.45) / 0.22) ** 2)) * 0.6;
    }),
    // A cloud of colour, violet to deep blue, soft and uneven.
    cloud: paint(64, 64, 19, (u, v) => mix(VIOLET, NIGHT, noise(u * 3, v * 3, 2)), (u, v) => {
      const r2 = ((u - 0.5) ** 2 + (v - 0.5) ** 2) * 4, n = noise(u * 4, v * 4, 5) * 0.6 + noise(u * 9, v * 9, 9) * 0.4;
      return Math.max(0, 1 - r2) ** 1.6 * (0.35 + 0.65 * n);
    }),
    halo: paint(64, 64, 12, (u, v) => mix(CYAN, BLUE, smooth(Math.hypot(u - 0.5, v - 0.5) * 2)), (u, v) => {
      const r2 = ((u - 0.5) ** 2 + (v - 0.5) ** 2) * 4;
      return Math.exp(-r2 * 3.2) * 0.55 * (1 - smooth((r2 - 0.7) / 0.3));
    }),
    channel: paint(128, 16, 13, (u, v) => mix(CYAN, BLUE, smooth(Math.abs(v - 0.5) * 3)), (u, v) => {
      const d = (v - 0.5) ** 2;
      return (Math.exp(-d / 0.02) + Math.exp(-d / 0.09) * 0.25) * smooth(u / 0.03) * smooth((1 - u) / 0.03);
    }),
    pulse: paint(32, 32, 14, (u, v) => mix(CREAM, AMBER, smooth(Math.hypot(u - 0.5, v - 0.5) * 3)), (u, v) => {
      const r2 = ((u - 0.5) ** 2 + (v - 0.5) ** 2) * 4;
      return (Math.exp(-r2 * 7) + Math.exp(-r2 * 2) * 0.4) * (1 - smooth((r2 - 0.75) / 0.25));
    })
  }));
  const soft = (which, bright) => cached(() => {
    const { image, w, h } = pictures()[which];
    const geo = { verts: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
    geo.imageSurface = { asset: { width: w, height: h, load: () => image }, rect: [-0.5, -0.5, 1, 1], cutout: true, soft: true, blend: "add", bright };
    return geo;
  });
  const coreGeometry = soft("core", 0.95), haloGeometry = soft("halo", 0.4), channelGeometry = soft("channel", 0.8), pulseGeometry = soft("pulse", 1);
  const starGeometry = soft("star", 0.9), violetGeometry = soft("violet", 0.9), emberGeometry = soft("ember", 1), beadGeometry = soft("bead", 1), cloudGeometry = soft("cloud", 0.2);
  const diamond = (hex) => cached(() => noShadow({ verts: [0, 0.5, 0, 0.5, 0, 0, 0, -0.5, 0, -0.5, 0, 0], faces: [{ i: [0, 3, 2, 1], color: hexToRgb(hex), emissive: 1 }], lines: [] }));
  const flatCyan = diamond("#8fe0ff"), flatAmber = diamond("#ffc35a"), flatViolet = diamond("#b48cff");
  // A near or middle node: a chunky ball of voxels, a block of three by three by three with its corners off, its faces
  // lit in cyans and blues, paler on top and deeper underneath, one unit across; on Canvas 2D, which sorts every face,
  // a single block in its place (`blocks` 1).
  const ballOf = (blocks) => {
    const v = [], faces = [], u = 1 / blocks, mid = (blocks - 1) / 2, last = blocks - 1;
    const filled = (x, y, z) => x >= 0 && x < blocks && y >= 0 && y < blocks && z >= 0 && z < blocks && (blocks === 1 || !((x === 0 || x === last) && (y === 0 || y === last) && (z === 0 || z === last)));
    const tones = { top: ["#c8f6ff", "#a6ecff"], side: ["#5fd0ff", "#46b4f4", "#7adcff", "#3aa8f0"], bottom: ["#2f8fe0", "#2878d8"] };
    // Each way out, with two ways along the face whose cross is it, so its corners go round counter-clockwise from outside.
    const sides = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]];
    let k = 0;
    for (let x = 0; x < blocks; x++) for (let y = 0; y < blocks; y++) for (let z = 0; z < blocks; z++) {
      if (!filled(x, y, z)) continue;
      for (const [n, a, b] of sides) {
        if (filled(x + n[0], y + n[1], z + n[2])) continue;
        const h = u / 2, cx = (x - mid) * u + n[0] * h, cy = (y - mid) * u + n[1] * h, cz = (z - mid) * u + n[2] * h, base = v.length / 3;
        for (const [sa, sb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) v.push(cx + (a[0] * sa + b[0] * sb) * h, cy + (a[1] * sa + b[1] * sb) * h, cz + (a[2] * sa + b[2] * sb) * h);
        const set = n[1] > 0 ? tones.top : n[1] < 0 ? tones.bottom : tones.side;
        faces.push({ i: [base, base + 1, base + 2, base + 3], color: hexToRgb(set[k++ % set.length]), emissive: 1 });
      }
    }
    return noShadow({ verts: v, faces, lines: [] });
  };
  const ballGeometry = cached(() => ballOf(3)), blockGeometry = cached(() => ballOf(1));

  const solidAt = (x, y, z) => {
    if (!HM.clearAt(x, z, y, 0.05, x + 1e3, z, false)) return true;
    const top = HM.supportAt(x, z, y);
    return top > 0.3 && top > y - 0.25;
  };
  const inHall = (x, y, z) => x > HALL.x0 + 0.8 && x < HALL.x1 - 0.8 && z > HALL.back + 0.6 && z < HALL.front - 1 && y > 0.4 && y < HALL.h - 1.6;
  const inTunnel = (x, y, z) => z < HALL.back - 0.5 && z > TUN.z1 + 1.5 && Math.hypot(x, y - TUN.y) < TUN.r - 1.4 && y > 0.5;

  // `onStop(early)` hears it end, `early` when something ended it before its time.
  const create = ({ root, renderer, camera, onStop = null }) => {
    const flat = renderer.kind === "canvas2d";
    const cap = DENSITY.b, maxNodes = cap.near + cap.mid + cap.far, maxBalls = cap.near + cap.mid, maxChannels = maxNodes * 4;
    const batch = (geometry, capacity, flatGeometry) => {
      const node = createNode({ geometry: flat ? flatGeometry : geometry(), instanceData: new Float32Array(capacity * 20), instanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true, visible: false, sightHidden: true });
      addChild(root, node);
      return node;
    };
    const halos = batch(haloGeometry, maxNodes, flatCyan());
    const cores = batch(coreGeometry, maxNodes, flatAmber());
    const stars = batch(starGeometry, cap.dust, flatCyan());
    const violets = batch(violetGeometry, cap.dust, flatViolet());
    const embers = batch(emberGeometry, maxBalls, flatAmber());
    const channels = batch(channelGeometry, maxChannels, flatCyan());
    const beads = batch(beadGeometry, BEADS.max, flatCyan());
    const pulses = batch(pulseGeometry, cap.pulses * (PULSE.trail + 2) * 2, flatAmber());
    const clouds = batch(cloudGeometry, NEBULA.n, flatViolet());
    const balls = createNode({ geometry: flat ? blockGeometry() : ballGeometry(), instanceData: new Float32Array(maxBalls * 20), instanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true, visible: false, sightHidden: true });
    addChild(root, balls);
    const nodes = [halos, cores, stars, violets, embers, channels, beads, pulses, clouds, balls];
    const sphere = new Float32Array(4);
    for (const n of nodes) n.cullSphere = sphere;

    // The graph: each node's place, layer, sizes, when it arrives, its twinkle and breakup; each channel's ends, when it
    // grows and how; routes along channels.
    const N = { n: 0, x: new Float32Array(maxNodes), y: new Float32Array(maxNodes), z: new Float32Array(maxNodes), layer: new Uint8Array(maxNodes),
      core: new Float32Array(maxNodes), halo: new Float32Array(maxNodes), ball: new Float32Array(maxNodes), arrive: new Float32Array(maxNodes),
      phase: new Float32Array(maxNodes), rate: new Float32Array(maxNodes), lose: new Float32Array(maxNodes), flash: new Float32Array(maxNodes), spin: new Float32Array(maxNodes),
      dx: new Float32Array(maxNodes), dy: new Float32Array(maxNodes), dz: new Float32Array(maxNodes), degree: new Uint8Array(maxNodes) };
    const D = { n: 0, x: new Float32Array(cap.dust), y: new Float32Array(cap.dust), z: new Float32Array(cap.dust), size: new Float32Array(cap.dust), glow: new Float32Array(cap.dust), arrive: new Float32Array(cap.dust), phase: new Float32Array(cap.dust), lose: new Float32Array(cap.dust),
      violet: new Uint8Array(cap.dust) };
    // Each channel's ends, when it grows and how, its breakup, how lit it is, and its beads: how many and where along it
    // they start, as a share.
    const C = { n: 0, a: new Uint16Array(maxChannels), b: new Uint16Array(maxChannels), grow: new Float32Array(maxChannels), len: new Float32Array(maxChannels), flip: new Uint8Array(maxChannels),
      lose: new Float32Array(maxChannels), cut: new Float32Array(maxChannels), lit: new Float32Array(maxChannels), beads: new Uint8Array(maxChannels), drift: new Float32Array(maxChannels) };
    // The clouds of colour: where, how big, how strong and when each comes.
    const Q = { x: new Float32Array(NEBULA.n), y: new Float32Array(NEBULA.n), z: new Float32Array(NEBULA.n), size: new Float32Array(NEBULA.n), glow: new Float32Array(NEBULA.n), arrive: new Float32Array(NEBULA.n) };
    const adjacency = [];
    const routes = [];
    // Payments in flight: the route, the hop it is on, how far along, s, and whether it is coming back.
    const P = { route: new Int16Array(cap.pulses), hop: new Uint8Array(cap.pulses), at: new Float32Array(cap.pulses), dur: new Float32Array(cap.pulses), back: new Uint8Array(cap.pulses), on: new Uint8Array(cap.pulses), settle: new Float32Array(cap.pulses) };
    const layerDrift = new Float32Array(9);

    // Whether it plays, its clock, s, and how long since it last ended, s.
    let active = false, t = 0, since = Infinity, density = "a", fogged = false, anchorX = 0, anchorZ = 0, nextPulse = 0, still = window.matchMedia("(prefers-reduced-motion: reduce)");
    // What the scene applies: how lit the hall's lights, its own light, the screens and the runway's markers are, how
    // much the emergency lights are on, how much of itself the hall's hum plays and how far its pitch has sagged, how
    // strong the bloom is, how far the hall's own light takes the network's blue, and its haze.
    const env = { dim: 1, ambient: 1, screens: 1, markers: 1, emergency: 0, hum: 1, sag: 0, bloom: 1, cast: 0, fogNear: FOG.near[0], fogFar: FOG.far[0] };
    // The near nodes that light what is round them, and their lights as the frame has them, 8 floats each.
    const lit = new Int16Array(GLOW.n), glowLights = new Float32Array(GLOW.n * 8);
    let litN = 0, glowN = 0;

    const edgeKey = new Set();
    const link = (i, j) => {
      if (i === j) return false;
      const key = i < j ? i * 4096 + j : j * 4096 + i;
      if (edgeKey.has(key) || C.n >= maxChannels) return false;
      edgeKey.add(key);
      C.a[C.n] = i; C.b[C.n] = j; C.n++;
      adjacency[i].push(j); adjacency[j].push(i);
      N.degree[i]++; N.degree[j]++;
      return true;
    };
    const dist = (i, j) => Math.hypot(N.x[i] - N.x[j], N.y[i] - N.y[j], N.z[i] - N.z[j]);

    // Lay out a fresh graph round (ax, az), as the visitor's view stands.
    const layout = (ax, az, seed) => {
      const r = mulberry32(seed), Dn = DENSITY[density];
      N.n = 0; C.n = 0; D.n = 0; edgeKey.clear(); routes.length = 0; adjacency.length = 0;
      const counts = [Dn.near, Dn.mid, Dn.far];
      for (let L = 0; L < 3; L++) {
        const spec = LAYERS[L];
        let placed = 0, tries = 0;
        while (placed < counts[L] && tries++ < counts[L] * 200) {
          let x, y, z;
          if (L < 2) {
            const a = r() * Math.PI * 2, d = between(r, spec.r);
            x = ax + Math.cos(a) * d; z = az + Math.sin(a) * d;
            // Most mid nodes low enough for the default view; a few toward the roof.
            y = L === 1 && r() < 0.75 ? between(r, [0.6, 6]) : between(r, spec.y);
          } else if (r() < 0.22) {
            x = (r() * 2 - 1) * (TUN.r - 2); y = TUN.y + (r() * 2 - 1) * (TUN.r - 2.5); z = between(r, [TUN.z1 + 2, HALL.back - 1]);
          } else {
            x = between(r, [HALL.x0 + 1, HALL.x1 - 1]); y = between(r, spec.y); z = between(r, [HALL.back + 0.8, HALL.front - 1.2]);
            if (Math.hypot(x - ax, z - az) < spec.r[0]) continue;
          }
          if (!(inHall(x, y, z) || inTunnel(x, y, z)) || solidAt(x, y, z)) continue;
          let crowded = false;
          for (let j = 0; j < N.n && !crowded; j++) if (Math.hypot(N.x[j] - x, N.y[j] - y, N.z[j] - z) < (L === 0 ? 1.3 : 1.8)) crowded = true;
          if (crowded) continue;
          const i = N.n++;
          N.x[i] = x; N.y[i] = y; N.z[i] = z; N.layer[i] = L; N.degree[i] = 0;
          N.core[i] = between(r, spec.core); N.halo[i] = between(r, spec.halo) * (L === 2 ? 1.2 : 1); N.ball[i] = L < 2 ? between(r, spec.ball) : 0;
          N.arrive[i] = between(r, L === 0 ? T.near : L === 1 ? T.mid : T.far);
          N.phase[i] = r() * 6.283; N.rate[i] = between(r, [0.6, 1.4]); N.lose[i] = between(r, [0, 1.2]); N.flash[i] = 0; N.spin[i] = between(r, [-0.6, 0.6]);
          N.dx[i] = 0; N.dy[i] = 0; N.dz[i] = 0;
          adjacency.push([]);
          placed++;
        }
      }
      // Each node reaches for its nearest few, as far as its layer lets it.
      const order = new Array(N.n);
      for (let i = 0; i < N.n; i++) {
        const spec = LAYERS[N.layer[i]], want = Dn.links[N.layer[i]];
        for (let j = 0; j < N.n; j++) order[j] = j;
        order.sort((p, q) => dist(i, p) - dist(i, q));
        let made = 0;
        for (let k = 1; k < N.n && made < want; k++) {
          const j = order[k];
          if (dist(i, j) > spec.reach) break;
          if (N.degree[j] >= 6) continue;
          if (link(i, j)) made++;
          else if (adjacency[i].includes(j)) made++;
        }
      }
      // The near nodes with the biggest halos light what is round them.
      litN = 0;
      for (let k = 0; k < GLOW.n; k++) {
        let best = -1;
        for (let i = 0; i < N.n; i++) if (N.layer[i] === 0 && (best < 0 || N.halo[i] > N.halo[best]) && !lit.subarray(0, litN).includes(i)) best = i;
        if (best >= 0) lit[litN++] = best;
      }
      // The busiest: a few long links each.
      for (let h = 0; h < Dn.hubs; h++) {
        const i = Math.floor(r() * N.n);
        for (let k = 0; k < Dn.hubLinks; k++) {
          const j = Math.floor(r() * N.n), d = dist(i, j);
          if (d > 6 && d < 32) link(i, j);
        }
      }
      // One network: join every piece to the main one by its shortest gap.
      const comp = new Int16Array(N.n).fill(-1);
      const flood = (s, c) => { const stack = [s]; comp[s] = c; while (stack.length) { const u = stack.pop(); for (const w of adjacency[u]) if (comp[w] < 0) { comp[w] = c; stack.push(w); } } };
      let pieces = 0;
      for (let i = 0; i < N.n; i++) if (comp[i] < 0) flood(i, pieces++);
      for (let c = 1; c < pieces; c++) {
        let best = Infinity, bi = -1, bj = -1;
        for (let i = 0; i < N.n; i++) if (comp[i] === c) for (let j = 0; j < N.n; j++) if (comp[j] === 0) { const d = dist(i, j); if (d < best) { best = d; bi = i; bj = j; } }
        if (bi >= 0) { link(bi, bj); for (let i = 0; i < N.n; i++) if (comp[i] === c) comp[i] = 0; }
      }
      for (let c = 0; c < C.n; c++) {
        const a = C.a[c], b = C.b[c];
        C.len[c] = dist(a, b); C.flip[c] = r() < 0.5 ? 1 : 0; C.lit[c] = 0;
        C.grow[c] = Math.max(N.arrive[a], N.arrive[b]) + T.fade * 0.5 + between(r, T.growWait);
        C.lose[c] = between(r, [0, 0.9]); C.cut[c] = between(r, [0.25, 0.75]);
      }
      // The beads, as many as each channel's length takes, up to the most in all.
      let beadsLeft = BEADS.max;
      for (let c = 0; c < C.n; c++) {
        C.beads[c] = Math.max(0, Math.min(BEADS.most, Math.floor(C.len[c] / BEADS.every), beadsLeft));
        beadsLeft -= C.beads[c]; C.drift[c] = r();
      }
      // Routes of two to four hops along channels, never back over a node.
      for (let k = 0; k < 60; k++) {
        const start = Math.floor(r() * N.n), path = [start], hops = 2 + Math.floor(r() * 3);
        for (let h = 0; h < hops; h++) {
          const at = path[path.length - 1], next = adjacency[at].filter((j) => !path.includes(j));
          if (!next.length) break;
          path.push(next[Math.floor(r() * next.length)]);
        }
        if (path.length >= 3) routes.push(path);
      }
      // The faint points: many, far from the anchor, through the hall and down the tunnel.
      let tries = 0;
      while (D.n < Dn.dust && tries++ < Dn.dust * 50) {
        let x, y, z;
        if (r() < 0.25) { x = (r() * 2 - 1) * (TUN.r - 1.6); y = TUN.y + (r() * 2 - 1) * (TUN.r - 2); z = between(r, [TUN.z1 + 1.6, HALL.back - 0.6]); }
        else { x = between(r, [HALL.x0 + 0.9, HALL.x1 - 0.9]); y = 0.6 + Math.pow(r(), 0.7) * (HALL.h - 2.4); z = between(r, [HALL.back + 0.7, HALL.front - 1.1]); }
        if (Math.hypot(x - ax, z - az) < DUST.least || !(inHall(x, y, z) || inTunnel(x, y, z)) || solidAt(x, y, z)) continue;
        const i = D.n++;
        D.x[i] = x; D.y[i] = y; D.z[i] = z; D.size[i] = between(r, DUST.size); D.glow[i] = between(r, DUST.glow);
        D.arrive[i] = between(r, T.dust); D.phase[i] = r() * 6.283; D.lose[i] = between(r, [0, 1.4]); D.violet[i] = r() < DUST.violet ? 1 : 0;
      }
      // The clouds: high up in the hall far from the anchor, a few down the launch tunnel.
      for (let k = 0; k < NEBULA.n; k++) {
        let x = 0, y = 0, z = 0;
        for (let g = 0; g < 40; g++) {
          if (r() < 0.3) { x = (r() * 2 - 1) * (TUN.r - 3); y = TUN.y + (r() - 0.3) * (TUN.r - 3); z = between(r, [TUN.z1 + 6, HALL.back - 2]); }
          else { x = between(r, [HALL.x0 + 3, HALL.x1 - 3]); y = between(r, [7, HALL.h - 2]); z = between(r, [HALL.back + 3, HALL.front - 4]); }
          if (Math.hypot(x - ax, z - az) > 12) break;
        }
        Q.x[k] = x; Q.y[k] = y; Q.z[k] = z; Q.size[k] = between(r, NEBULA.size); Q.glow[k] = between(r, NEBULA.glow); Q.arrive[k] = between(r, T.far);
      }
      // How each layer slips as it breaks up.
      for (let L = 0; L < 3; L++) {
        const a = r() * Math.PI * 2, m = [0.7, 0.35, 0.15][L];
        layerDrift[L * 3] = Math.cos(a) * m; layerDrift[L * 3 + 1] = (r() - 0.3) * m * 0.6; layerDrift[L * 3 + 2] = Math.sin(a) * m;
      }
      sphere[0] = (HALL.x0 + HALL.x1) / 2; sphere[1] = HALL.h / 2; sphere[2] = (HALL.back + TUN.z1) / 2; sphere[3] = 80;
    };

    // Start one round (x, z), `delay` s from now, laid out from `seed`.
    const play = (x, z, seed = (Math.random() * 1e9) | 0, delay = 0) => {
      anchorX = x; anchorZ = z;
      layout(x, z, seed);
      for (let k = 0; k < P.on.length; k++) P.on[k] = 0;
      active = true; t = -delay; nextPulse = T.pulses[0];
      for (const n of nodes) n.visible = true;
    };
    const stop = () => {
      const was = active;
      active = false; glowN = 0;
      if (was) since = 0;
      for (const n of nodes) { n.visible = false; n.instanceCount = 0; }
      env.dim = env.ambient = env.screens = env.markers = env.hum = env.bloom = 1; env.emergency = env.sag = env.cast = 0; env.fogNear = FOG.near[0]; env.fogFar = FOG.far[0];
      if (was && onStop) onStop(t < T.end);
    };
    // A hidden tab ends it at once, the hall back as it was.
    const onVisibility = () => { if (document.hidden && active) stop(); };
    document.addEventListener("visibilitychange", onVisibility);

    // How much power the hall's lights have at `t`, 0 to 1 (`POWER`), and how much the emergency lights are on.
    const powerAt = (rest) => {
      if (t >= T.restore) return smooth((t - T.restore) / T.restoreLen);
      if (rest) return 1 - smooth((t - POWER.fade) / POWER.fadeLen);
      let p = 1;
      for (const [at, low, hold, back] of POWER.dips) {
        if (t < at) break;
        const u = t - at, from = p;
        p = u < POWER.drop ? from + (low - from) * (u / POWER.drop) : low + (back - low) * smooth((u - POWER.drop - hold) / POWER.back);
      }
      if (t >= POWER.cut) { const u = (t - POWER.cut) / POWER.cutLen; p *= u >= 1 ? 0 : 1 - u * u; }
      return p;
    };
    const emergencyAt = (rest, p) => {
      const on = rest ? smooth((t - POWER.fade - POWER.fadeLen * 0.7) / POWER.backupLen) : smooth((t - POWER.cut - POWER.backup) / POWER.backupLen);
      return Math.min(on, 1 - p);
    };

    // The view's basis, for pictures turned square to it.
    let fx = 0, fy = 0, fz = -1, rx = 1, ry = 0, rz = 0, ux = 0, uy = 1, uz = 0, cx = 0, cy = 0, cz = 0;
    const basis = () => {
      const p = camera.position, q = camera.target;
      cx = p.x; cy = p.y; cz = p.z;
      let x = q.x - p.x, y = q.y - p.y, z = q.z - p.z, l = Math.hypot(x, y, z) || 1;
      fx = x / l; fy = y / l; fz = z / l;
      x = fz; y = 0; z = -fx; l = Math.hypot(x, z) || 1; rx = -x / l; ry = 0; rz = -z / l;
      ux = ry * fz - rz * fy; uy = rz * fx - rx * fz; uz = rx * fy - ry * fx;
    };
    const sprite = (node, i, px, py, pz, size, opacity) => {
      const d = node.instanceData, o = i * 20;
      d[o] = rx * size; d[o + 1] = ry * size; d[o + 2] = rz * size; d[o + 3] = 0;
      d[o + 4] = ux * size; d[o + 5] = uy * size; d[o + 6] = uz * size; d[o + 7] = 0;
      d[o + 8] = -fx * 0.01; d[o + 9] = -fy * 0.01; d[o + 10] = -fz * 0.01; d[o + 11] = 0;
      d[o + 12] = px; d[o + 13] = py; d[o + 14] = pz; d[o + 15] = 1;
      d[o + 16] = flat ? 0.4 + opacity : 0; d[o + 17] = 0; d[o + 18] = -1 - clamp(opacity, 0, 1); d[o + 19] = 0;
    };
    // A ribbon from (ax..) to (bx..), `width` across, turned to the view about its own line.
    const ribbon = (node, i, ax, ay, az, bx, by, bz, width, opacity) => {
      const d = node.instanceData, o = i * 20, mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
      const lx = bx - ax, ly = by - ay, lz = bz - az;
      let wx = cx - mx, wy = cy - my, wz = cz - mz, wl = Math.hypot(wx, wy, wz) || 1;
      wx /= wl; wy /= wl; wz /= wl;
      // Across: the view's way back crossed with the line, so the ribbon faces the view.
      let sx = wy * lz - wz * ly, sy = wz * lx - wx * lz, sz = wx * ly - wy * lx, sl = Math.hypot(sx, sy, sz);
      if (sl < 1e-6) return false;
      const k = width / sl;
      sx *= k; sy *= k; sz *= k;
      if (flat) { sx *= 1.6; sy *= 1.6; sz *= 1.6; }
      d[o] = lx; d[o + 1] = ly; d[o + 2] = lz; d[o + 3] = 0;
      d[o + 4] = sx; d[o + 5] = sy; d[o + 6] = sz; d[o + 7] = 0;
      d[o + 8] = wx * 0.01; d[o + 9] = wy * 0.01; d[o + 10] = wz * 0.01; d[o + 11] = 0;
      d[o + 12] = mx; d[o + 13] = my; d[o + 14] = mz; d[o + 15] = 1;
      d[o + 16] = flat ? 0.3 + opacity : 0; d[o + 17] = 0; d[o + 18] = -1 - clamp(opacity, 0, 1); d[o + 19] = 0;
      return true;
    };
    // A ball of voxels, `size` m across, turned `turn` about the upright.
    const ball = (i, px, py, pz, size, turn, glow, opacity) => {
      const d = balls.instanceData, o = i * 20, c = Math.cos(turn) * size, s = Math.sin(turn) * size;
      d[o] = c; d[o + 1] = 0; d[o + 2] = -s; d[o + 3] = 0;
      d[o + 4] = 0; d[o + 5] = size; d[o + 6] = 0; d[o + 7] = 0;
      d[o + 8] = s; d[o + 9] = 0; d[o + 10] = c; d[o + 11] = 0;
      d[o + 12] = px; d[o + 13] = py; d[o + 14] = pz; d[o + 15] = 1;
      d[o + 16] = glow; d[o + 17] = 0; d[o + 18] = opacity >= 0.999 ? 0 : -1 - clamp(opacity, 0, 1); d[o + 19] = 0;
    };

    const posAt = (i, out) => { out[0] = N.x[i] + N.dx[i]; out[1] = N.y[i] + N.dy[i]; out[2] = N.z[i] + N.dz[i]; return out; };
    const A3 = new Float32Array(3), B3 = new Float32Array(3);

    const launch = () => {
      if (!routes.length) return;
      for (let k = 0; k < DENSITY[density].pulses; k++) if (!P.on[k]) {
        const route = Math.floor(Math.random() * routes.length), path = routes[route];
        P.on[k] = 1; P.route[k] = route; P.hop[k] = 0; P.at[k] = 0; P.back[k] = 0; P.settle[k] = 0;
        P.dur[k] = clamp(dist(path[0], path[1]) / PULSE.speed, PULSE.hop[0], PULSE.hop[1]);
        N.flash[path[0]] = Math.max(N.flash[path[0]], 0.6);
        return;
      }
    };

    const update = (dt, elapsed) => {
      if (!active) { since += dt; return; }
      t += dt;
      if (t >= T.end) { stop(); return; }
      const rest = still.matches;
      basis();
      // The hall: its power faltering and going, the emergency lights, and its power back.
      const p = powerAt(rest), e = emergencyAt(rest, p), k = 1 - p;
      env.dim = EMERGENCY.lights + (1 - EMERGENCY.lights) * p; env.ambient = EMERGENCY.hall + (1 - EMERGENCY.hall) * p;
      env.screens = EMERGENCY.screens + (1 - EMERGENCY.screens) * p; env.markers = Math.max(p, EMERGENCY.markers * e);
      env.emergency = e; env.hum = EMERGENCY.hum + (1 - EMERGENCY.hum) * p; env.sag = k;
      // While the network stands, the bloom strengthens and the dark hall takes its blue (`cast`, 0 to 1).
      const stands = k * smooth((t - T.far[0]) / (T.near[1] - T.far[0])) * (1 - smooth((t - T.breakup - 0.5) / T.breakLen));
      env.bloom = 1 + BLOOM * stands; env.cast = stands;
      env.fogNear = fogged ? FOG.near[0] + (FOG.near[1] - FOG.near[0]) * k : FOG.near[0];
      env.fogFar = fogged ? FOG.far[0] + (FOG.far[1] - FOG.far[0]) * k : FOG.far[0];
      // The breakup: each layer slipping its own way, a share of the way so far.
      const br = rest ? 0 : smooth((t - T.breakup) / T.breakLen);
      for (let i = 0; i < N.n; i++) {
        const L = N.layer[i], own = br * (0.6 + 0.4 * Math.sin(N.phase[i]));
        N.dx[i] = layerDrift[L * 3] * own; N.dy[i] = layerDrift[L * 3 + 1] * own + br * br * 0.25 * (1 + Math.sin(N.phase[i] * 3)); N.dz[i] = layerDrift[L * 3 + 2] * own;
        if (N.flash[i] > 0) N.flash[i] = Math.max(0, N.flash[i] - dt * 2.2);
      }
      // Payments.
      if (t >= nextPulse && t < T.pulses[1]) { launch(); nextPulse = t + (rest ? 2 : 1) * (PULSE.every[0] + Math.random() * (PULSE.every[1] - PULSE.every[0])); }
      for (let c = 0; c < C.n; c++) if (C.lit[c] > 0) C.lit[c] = Math.max(0, C.lit[c] - dt * 1.4);
      let np = 0;
      const pace = rest ? 0.5 : 1;
      for (let p = 0; p < P.on.length; p++) {
        if (!P.on[p]) continue;
        const path = routes[P.route[p]], last = path.length - 1;
        if (P.settle[p] > 0) { P.settle[p] -= dt; if (P.settle[p] <= 0) { if (!P.back[p]) { P.back[p] = 1; P.hop[p] = last; P.at[p] = 0; P.dur[p] = Math.max(0.25, P.dur[p] / PULSE.back); } else P.on[p] = 0; } continue; }
        P.at[p] += dt * pace;
        const from = P.back[p] ? path[P.hop[p]] : path[P.hop[p]], to = P.back[p] ? path[P.hop[p] - 1] : path[P.hop[p] + 1];
        let f = P.at[p] / P.dur[p];
        if (f >= 1) {
          N.flash[to] = Math.max(N.flash[to], P.back[p] ? 0.35 : 0.8);
          P.hop[p] += P.back[p] ? -1 : 1; P.at[p] = 0;
          const done = P.back[p] ? P.hop[p] <= 0 : P.hop[p] >= last;
          if (done) { if (!P.back[p]) { N.flash[to] = 1.3; P.settle[p] = PULSE.settle; } else P.on[p] = 0; continue; }
          const n2 = P.back[p] ? path[P.hop[p] - 1] : path[P.hop[p] + 1];
          P.dur[p] = clamp(dist(to, n2) / PULSE.speed, PULSE.hop[0], PULSE.hop[1]) / (P.back[p] ? PULSE.back : 1);
          f = 0;
          continue;
        }
        // Light the channel it runs along.
        for (let c = 0; c < C.n; c++) if ((C.a[c] === from && C.b[c] === to) || (C.a[c] === to && C.b[c] === from)) { C.lit[c] = Math.max(C.lit[c], P.back[p] ? 0.35 : 1); break; }
        posAt(from, A3); posAt(to, B3);
        const fade = 1 - smooth((t - T.breakup) / 0.8);
        for (let s = 0; s <= PULSE.trail; s++) {
          const g = clamp(f - s * PULSE.gap * (PULSE.speed / Math.max(1, dist(from, to))), 0, 1);
          const x = A3[0] + (B3[0] - A3[0]) * g, y = A3[1] + (B3[1] - A3[1]) * g, z = A3[2] + (B3[2] - A3[2]) * g;
          const op = (P.back[p] ? 0.35 : 0.95) * (1 - s / (PULSE.trail + 1)) * fade;
          const dp = Math.hypot(x - cx, y - cy, z - cz);
          sprite(pulses, np++, x, y, z, Math.min((P.back[p] ? 0.16 : 0.26) * (1 - s * 0.15) * Math.max(1, dp / 9), dp * 0.06), op);
        }
      }
      // Nodes.
      let nh = 0, nc = 0, nq = 0, ne = 0;
      for (let i = 0; i < N.n; i++) {
        const shown = smooth((t - N.arrive[i]) / T.fade) * (1 - smooth((t - T.breakup - N.lose[i]) / (T.breakLen - N.lose[i] * 0.5)));
        if (shown <= 0.005) continue;
        const x = N.x[i] + N.dx[i], y = N.y[i] + N.dy[i], z = N.z[i] + N.dz[i], dc = Math.hypot(x - cx, y - cy, z - cz);
        // Fade out what comes within reach of the camera, and keep a halo from filling the view.
        const near = smooth((dc - BALL.clear) / 1.4), twinkle = 0.8 + 0.2 * Math.sin(elapsed * N.rate[i] * (1 + br * 3) * (rest ? 0.3 : 1) + N.phase[i]);
        const lift = 1 + N.flash[i] * 0.9, haloSize = Math.min(N.halo[i] * (1 + N.flash[i] * 0.4), dc * 0.2);
        if (!flat) sprite(halos, nh++, x, y, z, haloSize, shown * near * twinkle * 0.7 * lift);
        if (N.ball[i] > 0) {
          // A ball of voxels turning slowly, and its warm glow showing through its near side.
          const size = N.ball[i];
          ball(nq++, x, y, z, size, (rest ? 0 : elapsed * N.spin[i]) + N.phase[i], (BALL.glow + N.flash[i] * 0.5) * shown, shown * near);
          if (!flat) {
            const k2 = size * 0.56 / (dc || 1);
            sprite(embers, ne++, x + (cx - x) * k2, y + (cy - y) * k2 - size * 0.08, z + (cz - z) * k2, size * BALL.ember * (1 + N.flash[i] * 0.3), shown * near * Math.min(1, 0.95 * twinkle * lift));
          }
        } else sprite(cores, nc++, x, y, z, Math.min(N.core[i] * (1 + N.flash[i] * 0.6) * Math.max(1, dc / 14), dc * 0.05), shown * near * Math.min(1, 0.9 * twinkle * lift));
      }
      // The near nodes' light on what is round them, while the hall's own is out.
      glowN = 0;
      for (let j = 0; j < litN; j++) {
        const i = lit[j], shown = smooth((t - N.arrive[i]) / T.fade) * (1 - smooth((t - T.breakup - N.lose[i]) / (T.breakLen - N.lose[i] * 0.5))) * k;
        if (shown <= 0.01) continue;
        const o = glowN++ * 8, g = shown * (1 + N.flash[i] * 0.4);
        glowLights[o] = N.x[i] + N.dx[i]; glowLights[o + 1] = N.y[i] + N.dy[i]; glowLights[o + 2] = N.z[i] + N.dz[i]; glowLights[o + 3] = GLOW.reach;
        glowLights[o + 4] = GLOW.color[0] * g; glowLights[o + 5] = GLOW.color[1] * g; glowLights[o + 6] = GLOW.color[2] * g; glowLights[o + 7] = 0;
      }
      // The faint points, white and cyan or violet.
      let ns = 0, nv = 0;
      for (let i = 0; i < D.n; i++) {
        const shown = smooth((t - D.arrive[i]) / T.fade) * (1 - smooth((t - T.breakup - D.lose[i]) / T.breakLen));
        if (shown <= 0.005) continue;
        const dc = Math.hypot(D.x[i] - cx, D.y[i] - cy, D.z[i] - cz);
        const tw = 0.6 + 0.4 * Math.sin(elapsed * (rest ? 0.5 : 1.7) + D.phase[i]);
        if (D.violet[i]) sprite(violets, nv++, D.x[i], D.y[i] + br * 0.4 * Math.sin(D.phase[i]), D.z[i], D.size[i] * 1.2 * Math.max(1, dc / 16), shown * D.glow[i] * tw);
        else sprite(stars, ns++, D.x[i], D.y[i] + br * 0.4 * Math.sin(D.phase[i]), D.z[i], D.size[i] * Math.max(1, dc / 16), shown * D.glow[i] * tw);
      }
      // The clouds of colour, faint and slow.
      let nq2 = 0;
      if (!flat) for (let q = 0; q < NEBULA.n; q++) {
        const shown = smooth((t - Q.arrive[q]) / 1.5) * (1 - smooth((t - T.breakup) / T.breakLen));
        if (shown <= 0.005) continue;
        sprite(clouds, nq2++, Q.x[q], Q.y[q], Q.z[q], Q.size[q] * (1 + 0.04 * Math.sin(elapsed * 0.3 + q)), Q.glow[q] * shown);
      }
      // Channels: growing from one end, fading and crumbling toward a point as they break up.
      let nl = 0, nb = 0;
      for (let c = 0; c < C.n; c++) {
        const grown = rest ? smooth((t - C.grow[c]) / 0.6) : smooth((t - C.grow[c]) / (0.9 + C.len[c] * 0.04));
        if (grown <= 0.002) continue;
        const going = rest ? 0 : smooth((t - T.breakup - C.lose[c]) / 1.1), fading = 1 - smooth((t - T.breakup - C.lose[c] * 0.8) / 1.6);
        if (fading <= 0.005) continue;
        const a = C.flip[c] ? C.b[c] : C.a[c], b = C.flip[c] ? C.a[c] : C.b[c];
        posAt(a, A3); posAt(b, B3);
        // Grown from a: [0, grown]; breaking: shrink toward `cut`.
        const s0 = going * C.cut[c], s1 = rest ? 1 : grown + (C.cut[c] - grown) * going;
        const ax = A3[0] + (B3[0] - A3[0]) * s0, ay = A3[1] + (B3[1] - A3[1]) * s0, az = A3[2] + (B3[2] - A3[2]) * s0;
        const bx = A3[0] + (B3[0] - A3[0]) * s1, by = A3[1] + (B3[1] - A3[1]) * s1, bz = A3[2] + (B3[2] - A3[2]) * s1;
        const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2, dm = Math.hypot(mx - cx, my - cy, mz - cz);
        const lit = C.lit[c], shade = fading * Math.min(1, grown * 3), width = Math.max(CHANNEL.width, dm * CHANNEL.thin) * (1 + CHANNEL.widen * lit);
        const op = (CHANNEL.glow + (CHANNEL.lit - CHANNEL.glow) * lit) * shade * smooth((dm - 0.5) / 1.5), bead = (BEADS.rest + (BEADS.lit - BEADS.rest) * lit) * shade;
        if (op > 0.004 && ribbon(channels, nl, ax, ay, az, bx, by, bz, width, op)) nl++;
        // Its beads, drifting along it from a toward b, only on what of it shows.
        const n = flat ? Math.min(BEADS.flat, C.beads[c]) : C.beads[c];
        if (op > 0.004) for (let j = 0; j < n; j++) {
          let u = j / n + C.drift[c] + (rest ? 0 : t * BEADS.speed / C.len[c]);
          u -= Math.floor(u);
          if (u < s0 || u > s1) continue;
          const px = A3[0] + (B3[0] - A3[0]) * u, py = A3[1] + (B3[1] - A3[1]) * u, pz = A3[2] + (B3[2] - A3[2]) * u, dp = Math.hypot(px - cx, py - cy, pz - cz);
          sprite(beads, nb++, px, py, pz, Math.min(BEADS.size * (1 + 0.5 * lit) * Math.max(1, dp / 10), dp * 0.03), Math.min(1, bead) * smooth((dp - 0.5) / 1.5));
        }
      }
      halos.instanceCount = nh; cores.instanceCount = nc; channels.instanceCount = nl; pulses.instanceCount = np; balls.instanceCount = nq;
      stars.instanceCount = ns; violets.instanceCount = nv; embers.instanceCount = ne; beads.instanceCount = nb; clouds.instanceCount = nq2;
      for (const n of nodes) n.instanceVersion++;
    };

    // The power's times for the hall's sound (`hangarAudio.outage`), s from its start: when its lamps start to strain,
    // its dips (none under reduced motion), the cut (under reduced motion, halfway through the fade) and the restore.
    const cues = () => {
      const rest = still.matches;
      return { from: T.cohere, dips: rest ? [] : POWER.dips, cut: rest ? POWER.fade + POWER.fadeLen * 0.5 : POWER.cut, restore: T.restore };
    };
    // The near nodes' lights into `Lt` from light `slot` on; how many.
    const lights = (Lt, slot) => {
      for (let i = 0; i < glowN * 8; i++) Lt[slot * 8 + i] = glowLights[i];
      return glowN;
    };
    const dispose = () => { document.removeEventListener("visibilitychange", onVisibility); stop(); };
    const liveGeometry = (set) => { for (const n of nodes) set.add(n.geometry); };
    const debug = {
      play: (x, z, seed) => play(x, z, seed), stop, get anchor() { return [anchorX, anchorZ]; },
      get density() { return density; }, set density(v) { density = v === "b" ? "b" : "a"; },
      get fog() { return fogged; }, set fog(v) { fogged = !!v; },
      get t() { return t; }, get active() { return active; }, get quiet() { return active || since < T.quiet; }, get env() { return { ...env }; },
      get counts() { return { nodes: N.n, near: Array.from(N.layer.subarray(0, N.n)).filter((l) => l === 0).length, channels: C.n, dust: D.n, routes: routes.length,
        drawn: { halos: halos.instanceCount, cores: cores.instanceCount, balls: balls.instanceCount, embers: embers.instanceCount, stars: stars.instanceCount + violets.instanceCount,
          channels: channels.instanceCount, beads: beads.instanceCount, pulses: pulses.instanceCount, clouds: clouds.instanceCount } }; }
    };
    return { update, play, stop, dispose, lights, cues, liveGeometry, debug, env, T,
      // Whether it plays, and whether the hall's other events should still wait: while it plays and `T.quiet` s after.
      get active() { return active; }, get quiet() { return active || since < T.quiet; }, get t() { return t; },
      // Whether the hall's power seems out, for what runs on it (the crane, the fan): from the cut until it is halfway back.
      get out() { return active && t >= (still.matches ? POWER.fade + POWER.fadeLen * 0.5 : POWER.cut) && t < T.restore + T.restoreLen * 0.5; },
      get density() { return density; }, set density(v) { density = v === "b" ? "b" : "a"; },
      get fog() { return fogged; }, set fog(v) { fogged = !!v; } };
  };

  BL.hangarNetwork = { create, DENSITY, T, POWER, EMERGENCY };
})();
