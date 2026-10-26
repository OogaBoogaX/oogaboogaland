(() => {
  "use strict";
  const BL = window.BL;
  const { makeVox } = BL.models;
  const { createNode, addChild, removeChild } = BL.scene;
  // The island's 3x5 alphabet, inlined so the embroidery needs nothing outside this file.
  const GLYPH = {
    T: ["111", "010", "010", "010", "010"],
    A: ["010", "101", "111", "101", "101"],
    P: ["110", "101", "110", "100", "100"],
    R: ["110", "101", "110", "101", "101"],
    O: ["111", "101", "101", "101", "111"],
    B: ["110", "101", "110", "101", "110"],
    L: ["100", "100", "100", "100", "111"],
    "=": ["000", "111", "000", "111", "000"],
    "1": ["010", "110", "010", "010", "111"]
  };
  const BITCOIN = "#f7931a";
  const hash = (x, y, z) => (Math.imul(x + 11, 73856093) ^ Math.imul(y + 17, 19349663) ^ Math.imul(z + 29, 83492791)) >>> 0;
  // Stamp a word from the alphabet; put maps each lit cell.
  const stamp = (v, word, put) => {
    let pen = 0;
    for (const ch of word) {
      const g = GLYPH[ch];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r][c] === "1") put(pen + c, r);
      pen += 4;
    }
  };
  const plateCells = (w, h, put) => {
    for (let a = 0; a < w; a++) for (let b = 0; b < h; b++) {
      if ((a === 0 || a === w - 1) && (b === 0 || b === h - 1)) continue;
      put(a, b);
    }
  };
  BL.characters.add({
    handle: "itsLiran",
    github: "LiranCohen",
    display: "Liran",
    joined: 1792641623,
    // Until live oogatron stats refresh it: recent enough to show as working.
    lastCommit: 1792641623,
    look: {
      bald: true,
      face: "beard",
      skin: "#d9a06b",
      // The beard takes its colour from `hair`, so this is the beard, not scalp.
      hair: "#3d2a1a",
      eyeColor: "#6e4a26",
      // Pupils live in the dress.eyes hook below; the default would double-draw them.
      noPupils: true,
      height: 1.04,
      // Locker hats clear the cap's top button (cell y9 reaches 10u).
      hatY: 11,
      // Keep the whole cap and visor in the roster face crop.
      portrait: { min: [-1, -2, -1], max: [7, 9, 11] }
    },
    voice: {
      poke: "Hey! Watch the beard.",
      idle: ["Nice weather for bananas.", "Ooga.", "Just strolling through.", "Someone left the pile full again."]
    },
    dress: {
      // The Taproot snapback: digital desert camo crown, curved visor with its
      // dark underside, the embroidered front, the side badge and the rear strap.
      crown(k, v) {
        const cream = k.color("#ded4b8"), sand = k.color("#c9bb98"), khaki = k.color("#ab9d74");
        const olive = k.color("#8a7f5c"), brown = k.color("#6a5f44"), dark = k.color("#4a4234");
        const tones = [cream, sand, khaki, olive, brown, dark];
        const slots = [0, 1, 2, 1, 0, 3, 2, 1, 4, 0, 2, 3, 5, 1, 2, 4];
        // Mostly 2-cell digital blocks, speckled with single cells every so often.
        const camo = (x, y, z) => {
          const coarse = hash(x >> 1, y >> 1, z >> 1), fine = hash(x, y, z);
          return tones[slots[(fine % 7 === 0 ? fine : coarse) % slots.length]];
        };
        // Crown over the bald dome; full ring through the front wall the text sits on.
        v.fill(-1, 7, 5, 7, -1, 6, camo);
        v.fill(0, 6, 8, 8, 0, 5, camo);
        v.fill(3, 4, 9, 9, 2, 3, khaki); // top button
        const under = k.color("#2e261c");
        v.fill(1, 5, 5, 5, -1, -1, k.color("#55493a")); // rear snap strap
        // Visor: camo top at y5, dark underside at y4, five rows to the tip.
        for (const [z, x0, x1] of [[7, -1, 7], [8, -1, 7], [9, 0, 6], [10, 0, 6], [11, 1, 5]]) {
          v.fill(x0, x1, 5, 5, z, z, camo);
          v.fill(x0, x1, 4, 4, z, z, under);
        }
      },
      // The electric rod: a 2x2 shaft with glowing rings, collar and live tip.
      club(k) {
        const rod = (body, chrome, grip, energy, energyHi) => {
          const v = makeVox();
          v.fill(0, 1, 0, 2, 0, 1, grip);
          v.fill(-1, 2, 3, 3, -1, 2, chrome);
          v.fill(0, 1, 4, 8, 0, 1, body);
          v.fill(-1, 2, 4, 4, -1, 2, energy);
          v.fill(-1, 2, 6, 6, -1, 2, energy);
          v.fill(-1, 2, 8, 8, -1, 2, energy);
          v.fill(-1, 2, 9, 9, -1, 2, chrome);
          v.fill(0, 1, 10, 10, 0, 1, energyHi);
          v.set(-1, 10, 0, energy); v.set(2, 10, 1, energy);
          return k.vg(v, { x: -1 * k.u, y: -1 * k.u, z: -1 * k.u }, { [energy]: 0.85, [energyHi]: 1 });
        };
        const standard = rod(k.color("#2b2e36"), k.color("#9aa1aa"), k.color("#141518"), k.color("#ff8c1a"), k.color("#ffd27a"));
        const gold = rod(k.color("#8a6a2e"), k.color("#e3c06a"), k.color("#3b2a10"), k.color("#ffb52e"), k.color("#fff0c2"));
        return { default: standard, gold, rest: { x: 0.24, z: 0 }, carry: { x: 0.95, z: 0 } };
      },
      // Black tee, dark blue jeans, black sneakers; the slung rifle becomes a keyboard.
      gear(k) {
        const shirt = k.color("#141519"), shirtHi = k.color("#1b1d22");
        const denim = k.color("#2c3e63"), denimDk = k.color("#22304d");
        const belt = k.color("#111214"), buckle = k.color("#8f969e"), strap = k.color("#43464d");
        const sole = k.color("#d9d3c5"), shoe = k.color("#191a1d");
        const denimAt = (x, y, z) => (hash(x, y, z) % 7 === 0 ? denimDk : denim);
        const shirtAt = (x, y, z) => (hash(x, y, z) % 11 === 0 ? shirtHi : shirt);
        const jeanLeg = (side) => {
          const v = makeVox();
          v.fill(0, 3, 2, 4, 0, 3, denimAt);
          v.fill(0, 3, 0, 0, 0, 5, sole);
          v.set(side < 0 ? 3 : 0, 0, 6, sole);
          v.set(side < 0 ? 1 : 2, 0, 6, sole);
          v.fill(0, 3, 1, 1, 0, 5, shoe);
          return k.vg(v, { x: -2 * k.u, y: -5 * k.u, z: -2.5 * k.u });
        };
        k.parts.legR.geometry = jeanLeg(-1);
        k.parts.legL.geometry = jeanLeg(1);
        const torso = makeVox();
        torso.fill(0, 8, 0, 2, 0, 5, denimAt);
        torso.fill(0, 8, 2, 2, 0, 5, belt);
        torso.set(4, 2, 5, buckle);
        torso.fill(1, 7, 3, 7, 1, 4, shirtAt);
        // The keyboard's sling: the shoulder strap the bare caveman wore, now webbing.
        for (let y = 4; y <= 7; y++) {
          const x = 7 - Math.round((y - 4) * 1.6);
          for (const z of [1, 4]) for (const dx of [0, 1]) if (x + dx >= 1 && x + dx <= 7) torso.set(x + dx, y, z, strap);
        }
        torso.set(7, 4, 4, buckle);
        k.parts.torso.geometry = k.vg(torso, { x: -4.5 * k.u, y: 0, z: -3 * k.u });
        const arm = makeVox();
        arm.fill(0, 2, 2, 7, 0, 2, k.skinJ);
        arm.fill(-1, 3, 8, 10, -1, 3, shirt);
        arm.fill(-1, 3, 0, 1, -1, 3, k.skinJ);
        const armGeo = k.vg(arm, { x: -1.5 * k.u, y: -11 * k.u, z: -1.5 * k.u });
        k.parts.armR.geometry = armGeo;
        k.parts.armL.geometry = armGeo;
        k.parts.gunBody.visible = false;
        for (const round of k.parts.gunBananas) if (round.parent === k.parts.gun) removeChild(k.parts.gun, round);
        k.parts.gunBananas.length = 0;
        const caseC = k.color("#c9c2b0"), keyC = k.color("#ece6d7");
        const esc = k.color("#e8d46a"), tab = k.color("#8fa8d8"), caps = k.color("#e69a52");
        const shift = k.color("#9dbf9a"), enter = k.color("#a49ac8"), back = k.color("#4a4d55");
        const red = k.color("#b9695f");
        const keys = makeVox();
        keys.fill(-1, 0, -1, 14, 0, 45, caseC);
        // Double-sided HHKB Pro 2: the same keys on both faces, mirrored.
        const placeRow = (y0, spec, x, flip) => {
          const total = spec.reduce((n, [w]) => n + w, 0) + spec.length - 1;
          let col = 1 + Math.floor((44 - total) / 2);
          for (const [w, color] of spec) {
            const z0 = flip ? col : 45 - (col + w - 1);
            const z1 = flip ? col + w - 1 : 45 - col;
            keys.fill(x, x, y0, y0 + 1, z0, z1, color);
            col += w + 1;
          }
        };
        const cream = (count) => Array.from({ length: count }, () => [2, keyC]);
        const ROWS = [
          [12, [[2, esc], ...cream(12), [5, back]]],
          [9, [[3, tab], ...cream(12), [4, shift]]],
          [6, [[4, caps], ...cream(11), [6, enter]]],
          [3, [[5, shift], ...cream(10), [5, caps], [2, red]]],
          [0, [[3, caps], [3, shift], [12, keyC], [3, tab], [3, caps]]]
        ];
        for (const [y0, spec] of ROWS) {
          placeRow(y0, spec, 1, false);
          placeRow(y0, spec, -2, true);
        }
        // The gun hangs clear of the hat's rear strap; pull the board back to the torso.
        const belly = k.traits.belly;
        const headRear = 0.02 * k.h - 4 * k.u;
        const gunZ = Math.min(-0.245 * k.h, headRear - 0.055 * k.h);
        const BOARD_SCALE = 0.2;
        const halfThickness = 2 * k.u * BOARD_SCALE;
        const torsoBack = -3 * k.u * belly;
        const gap = torsoBack - (gunZ + halfThickness);
        const boardShift = Math.max(0, gap + 0.005);
        addChild(k.parts.gun, createNode({
          geometry: k.vg(keys, { x: 0, y: -7 * k.u, z: -23 * k.u }),
          position: { x: -boardShift, y: 0, z: 0 },
          scale: { x: BOARD_SCALE, y: BOARD_SCALE, z: BOARD_SCALE }
        }));
      },
      // TAPROOT across the front panel: 27 half-scale cells over the wall at z6.
      headgear(k) {
        const v = makeVox(), ink = k.color("#4e3520");
        stamp(v, "TAPROOT", (x, r) => v.set(x, 4 - r, 0, ink));
        addChild(k.parts.head, createNode({
          position: { x: 0, y: 6.8 * k.u, z: 4.05 * k.u },
          geometry: k.vg(v, { x: -13.5 * k.u, y: -2.5 * k.u, z: 0 }),
          scale: { x: 0.25, y: 0.25, z: 0.25 }
        }));
        // Roundel on +x (anatomical left). Glyph columns map to decreasing z so
        // the B reads correctly when the face is viewed from +x looking in -x.
        const plate = makeVox();
        const btc = k.color(BITCOIN), btcHi = k.color("#fff1d0");
        plateCells(5, 7, (z, y) => plate.set(0, y, z, btc));
        stamp(plate, "B", (x, r) => plate.set(0, 5 - r, 3 - x, btcHi));
        addChild(k.parts.head, createNode({
          position: { x: 4.45 * k.u, y: 6.5 * k.u, z: 0.5 * k.u },
          geometry: k.vg(plate, { x: 0, y: -3.5 * k.u, z: -2.5 * k.u }),
          scale: { x: 0.35, y: 0.35, z: 0.35 }
        }));
        // LOT=1 badge on -x; columns run +z, the viewer's right.
        const tag = k.color("#26241f"), tagIn = k.color("#d9d2c0"), tagHi = k.color("#f5efe0");
        const badge = makeVox();
        for (let y = 0; y <= 8; y++) for (let z = 0; z <= 22; z++) {
          if (((y === 0 || y === 8) && (z <= 1 || z >= 21)) || ((y === 1 || y === 7) && (z === 0 || z === 22))) continue;
          const rim = y === 0 || y === 8 || z === 0 || z === 22 || ((y === 1 || y === 7) && (z === 1 || z === 21));
          badge.set(0, y, z, rim ? tagIn : tag);
        }
        stamp(badge, "LOT=1", (x, r) => badge.set(0, 2 + (4 - r), 2 + x, tagHi));
        addChild(k.parts.head, createNode({
          position: { x: -4.45 * k.u, y: 6.5 * k.u, z: 0 },
          geometry: k.vg(badge, { x: -k.u, y: -4.5 * k.u, z: -11.5 * k.u }),
          scale: { x: 0.28, y: 0.28, z: 0.28 }
        }));
      },
      // Sclera/iris/pupil per eye; every painted cell is registered in eyeCells
      // so the closed-eye blink repaints the whole eye, not just the default 2x2.
      eyes(k, v) {
        const white = k.P.white, pupil = k.P.black;
        const iris = k.traits.eyeColor ? k.color(k.traits.eyeColor) : white;
        for (const [outer, inner] of [[0, 1], [6, 5]]) {
          v.set(outer, 2, 5, white); v.set(inner, 2, 5, white);
          v.set(outer, 3, 5, iris); v.set(inner, 3, 5, pupil);
          for (const x of [outer, inner]) for (const y of [2, 3]) k.eyeCells.push([x, y]);
        }
        return true;
      },
      extras(k) {
        const plate = makeVox();
        const plateC = k.color("#1a1c20"), btc = k.color(BITCOIN);
        plateCells(5, 7, (x, z) => plate.set(x, 0, z, plateC));
        stamp(plate, "B", (x, r) => plate.set(3 - x, 0, 1 + (4 - r), btc));
        addChild(k.parts.club, createNode({
          position: { x: 0, y: 10.01 * k.u, z: 0 },
          geometry: k.vg(plate, { x: -2.5 * k.u, y: 0, z: -3.5 * k.u }, { [btc]: 0.9 }),
          scale: { x: 0.25, y: 0.25, z: 0.25 }
        }));
      }
    }
  });
})();
