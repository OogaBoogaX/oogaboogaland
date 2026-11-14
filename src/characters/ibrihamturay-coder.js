(() => {
  "use strict";
  const BL = window.BL;
  const { makeVox, voxelGeometry } = BL.models;
  const { createNode, addChild } = BL.scene;
  const { hexToRgb } = BL.math;
  const twins = new Map();
  let slots = null;
  const colors = (k) => {
    if (slots) return slots;
    const pair = (red, green) => {
      const slot = k.color(red);
      twins.set(slot, green);
      return slot;
    };
    return slots = {
      plate: pair("#e8e8ec", "#c0c4cc"),
      light: pair("#f6f6f8", "#d8dbe0"),
      dark: pair("#c0c4cc", "#8e939c"),
      shell: pair("#e8e8ec", "#c0c4cc"),
      core: pair("#4dd0e1", "#6fe3f0"),
      joint: k.color("#1a1a1a"),
      grip: k.color("#0f1013"),
      gripLt: k.color("#3a3e45"),
      wire: k.color("#4dd0e1"),
      eye: k.color("#2f8cff"),
      loin: k.color("#2a2a2e"),
      loinSpot: k.color("#c0c4cc")
    };
  };
  const glowOf = (C) => ({ [C.core]: 1, [C.wire]: 0.5, [C.eye]: 1, [C.light]: 0.12 });
  const legVox = (C, side) => {
    const v = makeVox();
    v.fill(0, 3, 4, 4, 0, 3, C.plate);
    v.fill(0, 3, 3, 3, 0, 3, C.dark);
    v.fill(0, 3, 2, 2, 1, 2, C.joint);
    v.fill(0, 3, 0, 1, 0, 5, C.gripLt);
    v.fill(0, 3, 0, 0, 0, 5, C.grip);
    v.fill(0, 3, 1, 1, 4, 5, C.grip);
    v.set(side < 0 ? 0 : 3, 4, 4, C.core);
    return v;
  };
  const armVox = (C) => {
    const v = makeVox();
    v.fill(-1, 3, 9, 10, -1, 3, C.plate);
    v.fill(-1, 3, 10, 10, -1, 3, C.light);
    v.fill(-1, 3, 8, 8, -1, 3, C.joint);
    v.fill(0, 2, 5, 7, 0, 2, C.plate);
    v.fill(0, 2, 4, 4, 0, 2, C.joint);
    v.fill(0, 2, 2, 3, 0, 2, C.plate);
    v.fill(0, 2, 2, 3, 2, 2, C.dark);
    v.fill(-1, 3, 0, 1, -1, 3, C.gripLt);
    v.fill(-1, 3, 0, 0, -1, 3, C.grip);
    v.set(1, 6, 2, C.core);
    return v;
  };
  const torsoVox = (C) => {
    const v = makeVox();
    v.fill(0, 8, 0, 7, 0, 5, C.plate);
    v.fill(0, 8, 7, 7, 0, 5, C.gripLt);
    v.fill(0, 8, 6, 6, 0, 5, C.light);
    for (const y of [2, 3]) {
      for (let z = 0; z <= 5; z++) {
        v.del(0, y, z);
        v.del(8, y, z);
      }
      v.fill(1, 7, y, y, 0, 5, C.joint);
    }
    for (const x of [2, 4, 6]) {
      v.set(x, 2, 5, C.wire);
      v.set(x, 3, 0, C.wire);
    }
    v.fill(3, 5, 4, 5, 5, 5, C.light);
    v.set(4, 5, 5, C.core);
    v.set(4, 4, 5, C.dark);
    v.fill(1, 1, 4, 5, 5, 5, C.dark);
    v.fill(7, 7, 4, 5, 5, 5, C.dark);
    v.fill(0, 8, 1, 1, 0, 5, C.joint);
    v.fill(3, 5, 4, 5, 0, 0, C.gripLt);
    v.fill(1, 2, 4, 5, 0, 0, C.dark);
    v.fill(6, 7, 4, 5, 0, 0, C.dark);
    v.set(4, 6, 0, C.core);
    for (let x = 0; x <= 8; x++) for (let z = 0; z <= 5; z++) for (const y of [0, 1]) {
      if (x === 0 || x === 8 || z === 0 || z === 5) v.set(x, y, z, (x * 3 + y * 5 + z * 7) % 6 === 0 ? C.loinSpot : C.loin);
    }
    return v;
  };
  const fingerVox = (C) => {
    const v = makeVox();
    v.set(0, 1, 4, C.grip);
    v.set(2, 1, 4, C.grip);
    return v;
  };
  const skullVox = (v, C) => {
    v.fill(0, 6, 0, 6, 0, 5, C.shell);
    for (const x of [0, 6]) {
      for (let z = 0; z <= 5; z++) {
        v.del(x, 6, z);
        v.del(x, 0, z);
      }
      for (const z of [0, 5]) v.del(x, 5, z);
    }
    for (const x of [1, 5]) {
      v.del(x, 6, 0);
      v.del(x, 6, 5);
    }
    for (const x of [1, 5]) {
      v.del(x, 0, 0);
      v.del(x, 0, 5);
    }
    v.fill(1, 5, 4, 4, 6, 6, C.shell);
    v.fill(3, 3, 2, 3, 6, 6, C.shell);
    v.set(1, 2, 6, C.shell);
    v.set(5, 2, 6, C.shell);
    v.fill(0, 6, 3, 3, 5, 5, C.joint);
    v.fill(1, 5, 3, 3, 6, 6, C.joint);
    v.fill(2, 4, 1, 1, 5, 5, C.dark);
    v.set(3, 1, 6, C.joint);
    v.fill(1, 5, 6, 6, 2, 2, C.dark);
    v.fill(2, 4, 4, 4, 6, 6, C.joint);
  };
  const CHUK_PALETTE = [hexToRgb("#17181b"), hexToRgb("#767c85"), hexToRgb("#3b3f45")];
  const STICK = 0, COLLAR = 1, CHAIN = 2;
  const handleVox = () => {
    const v = makeVox();
    v.fill(0, 1, 0, 4, 0, 1, STICK);
    v.fill(0, 1, 1, 1, 0, 1, COLLAR);
    v.fill(0, 1, 4, 4, 0, 1, COLLAR);
    v.fill(0, 1, 5, 5, 0, 0, CHAIN);
    v.fill(0, 1, 6, 6, 1, 1, CHAIN);
    return v;
  };
  const freeVox = () => {
    const v = makeVox();
    v.fill(0, 1, 0, 2, 0, 1, STICK);
    v.fill(0, 1, 0, 0, 0, 1, COLLAR);
    return v;
  };
  const pairVox = () => {
    const v = handleVox();
    v.fill(0, 1, 7, 9, 0, 1, STICK);
    v.fill(0, 1, 7, 7, 0, 1, COLLAR);
    return v;
  };
  const CHUK_TRAIL = 6;
  const CHAIN_Y = 6;
  const FLAME_PALETTE = [hexToRgb("#4dd0e1"), hexToRgb("#e6fbff")];
  const FLAME_GLOW = { 0: 1, 1: 1 };
  const flameVox = () => {
    const v = makeVox();
    for (const x of [1, 6]) {
      v.fill(x, x + 1, -2, -1, 0, 1, 1);
      v.fill(x, x + 1, -3, -3, 0, 1, 0);
      v.set(x, -4, 0, 0);
      v.set(x + 1, -4, 1, 0);
    }
    return v;
  };
  BL.characters.add({
    handle: "ibrihamturay-coder",
    github: "ibrihamturay-coder",
    display: "Optimus Ooga",
    joined: 1790524280,
    lastCommit: 1790524280,
    look: {
      footRockets: true, nunchaku: true,
      bald: true, hairless: true, cleanShaven: true, noBrow: true, noPupils: true,
      face: "none", height: 1.12,
      skin: "#e8e8ec", hair: "#1a1a1a", fur: "#2a2a2e"
    },
    voice: {
      poke: "Systems nominal.",
      idle: ["Optimizing.", "Running diagnostics.", "Banana protocol engaged."]
    },
    dress: {
      gear(k) {
        const C = colors(k), u = k.u, glow = glowOf(C);
        k.parts.legR.geometry = k.vg(legVox(C, -1), { x: -2 * u, y: -5 * u, z: -2.5 * u }, glow);
        k.parts.legL.geometry = k.vg(legVox(C, 1), { x: -2 * u, y: -5 * u, z: -2.5 * u }, glow);
        const torso = torsoVox(C);
        k.loin = [C.loin, C.loinSpot];
        k.loinFlaps(torso);
        k.parts.torso.geometry = k.vg(torso, { x: -4.5 * u, y: 0, z: -3 * u }, glow);
        const arm = k.vg(armVox(C), { x: -1.5 * u, y: -11 * u, z: -1.5 * u }, glow);
        k.parts.armR.geometry = k.parts.armL.geometry = arm;
        const fingers = k.vg(fingerVox(C), { x: -1.5 * u, y: -u, z: -1.5 * u });
        k.parts.fingersR.geometry = k.parts.fingersL.geometry = fingers;
      },
      club: (k) => BL.models.STYLE === "R" ? { default: BL.heroBody.nunchaku(k.u).handle, rest: { x: 0.24, z: 0 }, carry: { x: 0.95, z: 0 } }
        : { voxels: handleVox(), palette: CHUK_PALETTE, rest: { x: 0.24, z: 0 }, carry: { x: 0.95, z: 0 } },
      skull(k, v) {
        skullVox(v, colors(k));
        return true;
      },
      eyes(k, v) {
        const C = colors(k);
        for (const x of [1, 5]) {
          v.set(x, 3, 5, C.eye);
          v.set(x, 3, 6, C.eye);
          k.eyeCells.push([x, 3]);
        }
        k.lid = C.joint;
        k.headEmissive = glowOf(C);
        return true;
      },
      tint: (k, palette) => palette.map((rgb, i) => twins.has(i) ? hexToRgb(twins.get(i)) : rgb),
      extras(k) {
        const u = k.u, origin = { x: -u, y: 0, z: -u }, turned = BL.models.STYLE === "R" ? BL.heroBody.nunchaku(u) : null;
        const geometry = turned ? turned.free : voxelGeometry(freeVox(), { unit: u, palette: CHUK_PALETTE, origin });
        k.parts.chuk = createNode({ position: { x: 0, y: turned ? turned.pivot : CHAIN_Y * u, z: 0 }, geometry, skins: { default: geometry } });
        if (turned) { k.parts.chuk.swing = turned.swing; k.parts.chuk.rotation.x = Math.PI - 0.38; }
        addChild(k.parts.club, k.parts.chuk);
        const trail = turned ? turned.pair : voxelGeometry(pairVox(), { unit: u, palette: CHUK_PALETTE, origin: { x: -u, y: -u, z: -u } });
        k.parts.chukTrail = [];
        for (let i = 0; i < CHUK_TRAIL; i++) {
          const ghost = createNode({ geometry: trail, visible: false });
          k.parts.chukTrail.push(ghost);
          addChild(k.parts.armR, ghost);
        }
        k.parts.jetpack = createNode({ position: { x: 0, y: -k.legH, z: 0 }, visible: false });
        k.parts.jetFlame = createNode({ geometry: voxelGeometry(flameVox(), { unit: u, palette: FLAME_PALETTE, origin: { x: -4.5 * u, y: 0, z: -u }, emissive: FLAME_GLOW }), visible: false });
        addChild(k.parts.jetpack, k.parts.jetFlame);
        addChild(k.root, k.parts.jetpack);
      }
    }
  });
})();
