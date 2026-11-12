// HALLOWEEN, temporary: what a hunter wears in Ooga Arcade's ghost hunt. In place of the AK a black wand with no magazine,
// a ribbed hose out of its back to a pack on the shoulders, strapped on over the torso. Worn only while a hunter plays
// (scene-arcade.js `arm`, and its remote pool's `posed`). `wear` and `remove` swap the gear on an Ooga, and `pose`, once
// the gun has its final pose for the frame, lays the hose between the two ports, allocating nothing.
(() => {
  "use strict";
  const BL = window.BL;
  const { box, merge, makeVox, voxelGeometry, characterGeometry, cached } = BL.models;
  const { createNode, addChild, removeChild, updateWorld } = BL.scene;
  const { quat, mat4 } = BL.math;

  const BLACK = "#121316", EDGE = "#1d1f23", SHEEN = "#2b2e33";
  // The wand, in the AK's frame: the right hand on its grip, the left on its foregrip, its sights and muzzle where the
  // AK's are, so every hold, sight line and shot of the rifle's serves it unchanged. Nothing but black.
  const wand = (h) => {
    const part = (w, ht, d, y, z, color = BLACK, x = 0) => box({ w: w * h, h: ht * h, d: d * h, color, offset: { x: x * h, y: y * h, z: z * h } });
    const pieces = [
      // The rear housing, with the hose's socket out of its back.
      part(0.115, 0.13, 0.24, 0, -0.19), part(0.125, 0.018, 0.25, 0.068, -0.19, EDGE), part(0.06, 0.06, 0.05, -0.05, -0.33, EDGE),
      // A box on its left flank, and the ribbed barrel housing.
      part(0.035, 0.085, 0.18, 0.005, -0.15, EDGE, 0.072), part(0.105, 0.115, 0.2, 0, 0.03),
      // The front tube, its foregrip for the left hand, and the narrow muzzle ending in a collar.
      part(0.072, 0.072, 0.26, -0.005, 0.26), part(0.052, 0.13, 0.07, -0.105, 0.27), part(0.066, 0.016, 0.082, -0.04, 0.27, EDGE),
      part(0.042, 0.042, 0.26, -0.01, 0.52), part(0.06, 0.06, 0.03, -0.01, 0.655, SHEEN), part(0.05, 0.05, 0.022, -0.01, 0.42, EDGE),
      // The pistol grip and trigger guard, then the same two sights the rifle has, for the same sight line.
      part(0.065, 0.18, 0.066, -0.14, -0.184), part(0.045, 0.012, 0.106, -0.13, -0.098, EDGE), part(0.045, 0.077, 0.012, -0.0975, -0.045, EDGE),
      part(0.014, 0.045, 0.012, -0.083, -0.112, EDGE),
      part(0.012, 0.024, 0.014, 0.075, -0.18, SHEEN, 0.02), part(0.012, 0.024, 0.014, 0.075, -0.18, SHEEN, -0.02),
      part(0.01, 0.04, 0.016, 0.07, 0.59), part(0.03, 0.05, 0.03, 0.03, 0.59)
    ];
    for (let i = 0; i < 5; i++) pieces.push(part(0.125, 0.135, 0.016, 0, -0.05 + i * 0.042, SHEEN));
    return characterGeometry(merge(...pieces));
  };
  const wands = new Map();
  const wandGeometry = (h) => {
    if (!wands.has(h)) wands.set(h, cached(() => wand(h)));
    return wands.get(h)();
  };

  // The pack, in fortieths of a height, its grid's z 0 facing away from the wearer: a tall frame of equipment over a
  // round drum with four red lamps, wires and a ribbon cable run across it.
  const UNIT = 1 / 40, ORIGIN = { x: -10 * UNIT, y: -8 * UNIT, z: -7 * UNIT };
  const COLOUR = { body: 0, panel: 1, steel: 2, lamp: 3, label: 4, blue: 5, yellow: 6, silver: 7, red: 8 };
  const PALETTE = ["#121316", "#26282d", "#5e636a", "#ff3a2e", "#b3261e", "#2f7fe0", "#f0c23b", "#c9ced4", "#d0342a"];
  const packVoxels = () => {
    const v = makeVox(), C = COLOUR;
    // The frame, then the drum proud of it.
    v.fill(1, 18, 11, 27, 1, 6, C.body);
    for (let x = 0; x < 20; x++) for (let y = 0; y < 14; y++) {
      const r = Math.hypot(x - 9.5, y - 6.5);
      if (r <= 7.7) v.fill(x, x, y, y, 0, 6, r > 6.5 ? C.panel : C.body);
    }
    // The drum's strap, four lamps and hub.
    v.fill(2, 17, 9, 9, 0, 0, C.panel);
    for (const [x, y] of [[5, 2], [12, 2], [5, 10], [12, 10]]) v.fill(x, x + 2, y, y + 2, 0, 0, C.lamp);
    v.fill(8, 11, 5, 8, 0, 0, C.steel); v.fill(9, 10, 6, 7, 0, 0, C.silver);
    // The equipment on the frame: a red plate, a steel block, a column down the side, blocks and knobs.
    v.fill(8, 13, 21, 24, 0, 0, C.label); v.fill(9, 12, 22, 22, 0, 0, C.silver);
    v.fill(4, 8, 25, 26, 0, 0, C.steel);
    v.fill(2, 3, 13, 26, 0, 0, C.panel); v.fill(3, 3, 15, 20, 0, 0, C.blue);
    v.fill(14, 17, 12, 18, 0, 0, C.panel); v.set(15, 14, 0, C.red); v.fill(14, 17, 19, 20, 0, 0, C.steel);
    v.fill(15, 17, 25, 26, 0, 0, C.panel);
    // Wires, and the ribbon cable running down to the drum.
    v.fill(5, 5, 17, 24, 0, 0, C.yellow); v.fill(7, 7, 17, 20, 0, 0, C.blue); v.fill(7, 12, 16, 16, 0, 0, C.blue);
    for (let i = 0; i < 6; i++) for (let w = 0; w < 3; w++) {
      const x = 5 + i, y = 11 + i - w;
      v.set(x, y, 0, [C.lamp, C.yellow, C.blue][w]);
    }
    // The hose's socket on the wearer's right, and a cap at the frame's top.
    v.fill(0, 0, 12, 15, 2, 5, C.steel); v.fill(2, 17, 27, 27, 0, 0, C.panel);
    return v;
  };
  const packGeometry = cached(() => characterGeometry(voxelGeometry(packVoxels(), { unit: UNIT, palette: PALETTE, origin: ORIGIN, emissive: { [COLOUR.lamp]: 1 } })));
  // Where the hose meets the pack, in the pack's own unit space: out of its socket on the wearer's right.
  const PACK_PORT = { x: ORIGIN.x - 0.02, y: ORIGIN.y + 13.5 * UNIT, z: ORIGIN.z + 3.5 * UNIT };
  // Where the hose meets the wand, in heights of its wearer: out of the socket on its back.
  const WAND_PORT = { y: -0.05, z: -0.35 };

  // The straps over the shoulders and round the waist, flush with the torso, which scales them for a wide belly.
  const strapGeometry = cached(() => {
    const part = (w, h, d, x, y, z, color = BLACK) => box({ w, h, d, color, offset: { x, y, z } });
    const pieces = [part(0.6, 0.06, 0.02, 0, 0.1, 0.2), part(0.6, 0.06, 0.02, 0, 0.1, -0.2), part(0.02, 0.06, 0.4, 0.3, 0.1, 0), part(0.02, 0.06, 0.4, -0.3, 0.1, 0), part(0.09, 0.08, 0.026, 0, 0.1, 0.203, SHEEN)];
    for (const x of [-0.14, 0.14]) pieces.push(part(0.075, 0.4, 0.02, x, 0.31, 0.2), part(0.075, 0.02, 0.4, x, 0.51, 0), part(0.09, 0.05, 0.026, x, 0.27, 0.203, SHEEN));
    return characterGeometry(merge(...pieces));
  });

  // The hose, a run of short ribs in two tones, one unit long along z, stretched by each node to its stretch of the curve.
  const SEGMENTS = 18, HOSE = 0.05;
  const hoseGeometry = [BLACK, SHEEN].map((color) => cached(() => characterGeometry(box({ w: HOSE, h: HOSE, d: 1, color }))));

  const wear = (cave) => {
    if (cave.ghostGear) return;
    const h = cave.traits.height, { torso, gunBody } = cave.parts;
    const pack = createNode({ position: { x: 0, y: 0, z: -0.1875 * h }, scale: { x: h / torso.scale.x, y: h, z: h / torso.scale.z }, geometry: packGeometry(), sightHidden: true });
    const straps = createNode({ scale: { x: h, y: h, z: h }, geometry: strapGeometry(), sightHidden: true });
    addChild(torso, pack); addChild(torso, straps);
    const hose = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const node = createNode({ quaternion: quat.create(), geometry: hoseGeometry[i & 1](), sightHidden: true, visible: false });
      addChild(cave.root, node); hose.push(node);
    }
    cave.ghostGear = { pack, straps, hose, body: gunBody.geometry };
    gunBody.geometry = wandGeometry(h);
    cave.gunSkin = "ghost";
  };
  const remove = (cave) => {
    const gear = cave.ghostGear;
    if (!gear) return;
    removeChild(cave.parts.torso, gear.pack); removeChild(cave.parts.torso, gear.straps);
    for (const node of gear.hose) removeChild(cave.root, node);
    cave.parts.gunBody.geometry = gear.body;
    cave.ghostGear = cave.gunSkin = null;
  };

  const SCRATCH = new Float64Array(3), FROM = new Float64Array(3), OUT = new Float64Array(3), TO = new Float64Array(3), BACK = new Float64Array(3);
  // A world point in the root's frame: the root only moves and turns, so its rotation's transpose undoes it.
  const toRoot = (out, m, p) => {
    const x = p[0] - m[12], y = p[1] - m[13], z = p[2] - m[14];
    out[0] = m[0] * x + m[1] * y + m[2] * z; out[1] = m[4] * x + m[5] * y + m[6] * z; out[2] = m[8] * x + m[9] * y + m[10] * z;
  };
  const bezier = (a, b, c, d, t) => { const s = 1 - t; return s * s * s * a + 3 * s * s * t * b + 3 * s * t * t * c + t * t * t * d; };
  // Lay the hose from the pack's socket to the wand's, bellying out to the wearer's right and sagging under its own weight.
  // `shown` false (the wearer's own first person, where it would fill the view) hides it.
  const pose = (cave, shown = true) => {
    const gear = cave.ghostGear;
    if (!gear) return;
    const { gun } = cave.parts, hose = gear.hose, on = shown && gun.visible;
    if (hose[0].visible !== on) for (let i = 0; i < SEGMENTS; i++) hose[i].visible = on;
    if (!on) return;
    const h = cave.traits.height, root = cave.root.world;
    updateWorld(cave.root, cave.root.parent ? cave.root.parent.world : null);
    mat4.transformPoint(SCRATCH, gear.pack.world, PACK_PORT.x, PACK_PORT.y, PACK_PORT.z); toRoot(FROM, root, SCRATCH);
    mat4.transformPoint(SCRATCH, gun.world, 0, WAND_PORT.y * h, WAND_PORT.z * h); toRoot(TO, root, SCRATCH);
    mat4.transformPoint(SCRATCH, gun.world, 0, WAND_PORT.y * h, (WAND_PORT.z - 0.34) * h); toRoot(BACK, root, SCRATCH);
    OUT[0] = FROM[0] - 0.2 * h; OUT[1] = FROM[1] - 0.3 * h; OUT[2] = FROM[2] + 0.08 * h;
    BACK[1] -= 0.14 * h;
    let px = FROM[0], py = FROM[1], pz = FROM[2];
    for (let i = 0; i < SEGMENTS; i++) {
      const t = (i + 1) / SEGMENTS;
      const x = bezier(FROM[0], OUT[0], BACK[0], TO[0], t), y = bezier(FROM[1], OUT[1], BACK[1], TO[1], t), z = bezier(FROM[2], OUT[2], BACK[2], TO[2], t);
      const dx = x - px, dy = y - py, dz = z - pz, length = Math.hypot(dx, dy, dz) || 1e-6, node = hose[i], q = node.quaternion;
      node.position.x = (x + px) * 0.5; node.position.y = (y + py) * 0.5; node.position.z = (z + pz) * 0.5;
      // Turn the rib's +z along its stretch of the hose.
      if (dz / length < -0.9999) { q[0] = 0; q[1] = 1; q[2] = 0; q[3] = 0; }
      else { q[0] = -dy / length; q[1] = dx / length; q[2] = 0; q[3] = 1 + dz / length; quat.normalize(q); }
      node.scale.x = node.scale.y = h; node.scale.z = length * 1.12;
      px = x; py = y; pz = z;
    }
  };
  // Kept on the GPU through a visit, so the next hunt's gear uploads nothing.
  const liveGeometry = (set) => {
    set.add(packGeometry()).add(strapGeometry()).add(hoseGeometry[0]()).add(hoseGeometry[1]());
    for (const read of wands.values()) set.add(read());
  };

  BL.ghostGear = { wear, remove, pose, liveGeometry };
})();
