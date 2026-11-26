// The chain clock stands on the west side of the promenade. The snapshot and the live block
// notification are the same feeds the island uses. A portal preview only builds the instrument.
(() => {
  "use strict";
  const BL = window.BL,
    M = BL.models,
    S = BL.scene;
  const X = -5.5,
    Z = 24,
    RADIUS = 0.91,
    SECONDS = 3;
  const GOLD = "#daa24c",
    EDGE = "#ffe1a0",
    COPPER = "#a45628",
    SLATE = "#24262a",
    AMBER = "#f7931a";
  const cache = M.scopedMap();
  const geometry = lite => {
    if (cache.has(lite)) return cache.get(lite);
    const n = lite ? 20 : 56,
      frame = [],
      stone = [],
      lamps = [];
    const turned = (profile, color, e = 0) => M.lathe({ profile, segments: n, color, emissive: e });
    const band = (y, r, t, color) => M.moved(M.torus(r, t, color, 0.18, n, 6), 0, y, 0);
    const add = (parts, g, x, y, z) => parts.push(M.moved(g, x, y, z));
    const pin = (a, y, r, w, h, d, color, e = 0) => {
      const g = M.box({ w, h, d, color, emissive: e });
      return M.moved(M.turnedY(g, a), Math.sin(a) * r, y, Math.cos(a) * r);
    };
    stone.push(turned([[0, 0], [0.442, 0], [0.45, 0.037], [0.433, 0.065], [0.41, 0.074], [0.41, 0.143], [0.38, 0.173], [0, 0.173]], SLATE));
    frame.push(
      turned(
        [
          [0, 0.16],
          [0.33, 0.16],
          [0.34, 0.19],
          [0.25, 0.22],
          [0.17, 0.29],
          [0.122, 0.36],
          [0.095, 0.46],
          [0.115, 0.56],
          [0.152, 0.66],
          [0.23, 0.71],
          [0.3, 0.73],
          [0.31, 0.78],
          [0, 0.78]
        ],
        COPPER
      )
    );
    for (const [y, r] of [[0.055, 0.437], [0.145, 0.403], [0.218, 0.254], [0.36, 0.126], [0.53, 0.11], [0.69, 0.212]])
      frame.push(band(y, r, 0.012, EDGE));
    for (let i = 0; i < (lite ? 10 : 20); i++) {
      const a = (2 * Math.PI * i) / (lite ? 10 : 20);
      frame.push(M.beam(Math.sin(a) * 0.16, 0.3, Math.cos(a) * 0.16, Math.sin(a) * 0.105, 0.47, Math.cos(a) * 0.105, 0.013, GOLD));
    }
    // The old 1.48 m instrument occupied y 0.98–2.46. These are its unscaled dimensions;
    // the whole assembly, including the pedestal, is doubled at placement.
    const bottom = 0.98,
      top = 2.46,
      waist = (bottom + top) / 2;
    frame.push(turned([[0, 0.76], [0.28, 0.76], [0.3, 0.81], [0.21, 0.87], [0.23, 0.92], [0.32, 0.96], [0.32, 1.0], [0, 1]], GOLD));
    const cap = turned([[0, 0], [0.335, 0], [0.35, 0.018], [0.359, 0.028], [0.359, 0.063], [0.335, 0.074], [0.307, 0.086], [0, 0.086]], GOLD);
    add(frame, cap, 0, bottom, 0);
    add(
      frame,
      M.turnedX(
        turned([[0, 0], [0.335, 0], [0.35, 0.018], [0.359, 0.028], [0.359, 0.063], [0.335, 0.074], [0.307, 0.086], [0, 0.086]], GOLD),
        Math.PI
      ),
      0,
      top,
      0
    );
    for (const [y, dir] of [[bottom, 1], [top, -1]]) {
      frame.push(band(y + dir * 0.02, 0.354, 0.009, EDGE), band(y + dir * 0.069, 0.337, 0.006, EDGE));
      const ticks = lite ? 30 : 60;
      for (let i = 0; i < ticks; i++) {
        const a = (i / ticks) * Math.PI * 2,
          major = i % (ticks / 10) === 0;
        frame.push(pin(a, y + dir * 0.043, 0.36, major ? 0.013 : 0.006, major ? 0.034 : 0.014, 0.005, major ? EDGE : COPPER, 0.24));
      }
      lamps.push(band(y + dir * 0.083, 0.311, 0.009, AMBER));
    }
    for (let i = 0; i < 3; i++) {
      const a = (2 * Math.PI * i) / 3 + Math.PI,
        x = 0.317 * Math.sin(a),
        z = 0.317 * Math.cos(a);
      const shaft = turned(
        [
          [0, 0],
          [0.044, 0],
          [0.05, 0.035],
          [0.04, 0.062],
          [0.028, 0.092],
          [0.022, 0.18],
          [0.023, 1.09],
          [0.03, 1.2],
          [0.045, 1.24],
          [0.045, 1.3],
          [0, 1.3]
        ],
        GOLD
      );
      add(frame, shaft, x, 1.065, z);
      const turns = lite ? 10 : 24;
      for (let j = 0; j < turns; j++) {
        const t = j / turns,
          s = (j + 1) / turns,
          a = t * Math.PI * 6,
          b = s * Math.PI * 6;
        frame.push(
          M.beam(
            x + 0.022 * Math.cos(a),
            1.24 + 0.94 * t,
            z + 0.022 * Math.sin(a),
            x + 0.022 * Math.cos(b),
            1.24 + 0.94 * s,
            z + 0.022 * Math.sin(b),
            0.009,
            EDGE
          )
        );
      }
      for (const y of [1.13, 2.3]) add(frame, M.torus(0.042, 0.009, EDGE, 0.24, 12, 5), x, y, z);
    }
    // Neck, shoulders and glass heels are tangent across the waist. The opposite shell faces remain transparent.
    const profile = [
      [0.019, 0],
      [0.021, 0.045],
      [0.033, 0.095],
      [0.058, 0.16],
      [0.105, 0.23],
      [0.17, 0.31],
      [0.225, 0.39],
      [0.257, 0.46],
      [0.27, 0.53],
      [0.266, 0.575],
      [0.25, 0.612],
      [0.205, 0.65],
      [0.16, 0.662]
    ];
    const glass = turned(
      [
        ...profile
          .slice(1)
          .reverse()
          .map(([r, y]) => [r, waist - y]),
        ...profile.map(([r, y]) => [r, waist + y])
      ],
      "#caedfc"
    );
    glass.smooth = true;
    glass.glassOpacity = 0.13;
    glass.glassGrazing = 0.72;
    glass.castShadow = false;
    frame.push(band(waist, 0.027, 0.007, EDGE));
    for (const side of [-1, 1]) {
      const plate = M.box({ w: 0.39, h: 0.105, d: 0.023, color: SLATE });
      const title = BL.poolModels.carve("BLOCK TIME", { joined:true, cell: 0.0088, color: EDGE, emissive: 0.45 });
      const lettering = title.geometry;
      for (let i = 2; i < lettering.verts.length; i += 3) lettering.verts[i] = (lettering.verts[i] - 0.16) * 0.13 + 0.017;
      const badge = M.merge(plate, M.moved(lettering, -title.width / 2 + 0.007, 0.019, 0));
      add(frame, M.turnedY(badge, side === 1 ? 0 : Math.PI), 0, 0.81, side * 0.294);
      for (const end of [-1, 1]) add(frame, turned([[0, 0], [0.013, 0], [0.011, 0.012], [0, 0.014]], EDGE), end * 0.176, 0.833, side * 0.305);
    }
    for (let i = 1; i < profile.length - 1; i++) {
      const [r, y] = profile[i],
        a = 0.65;
      frame.push(pin(a, waist + y, r + 0.002, i % 3 === 0 ? 0.042 : 0.019, 0.004, 0.003, EDGE, 0.32));
    }
    const grain = (profile, seed) => {
      const g = turned(profile, AMBER, 0.5),
        rand = BL.math.mulberry32(seed);
      for (const f of g.faces) {
        const t = rand();
        f.color = [232 + Math.round(15 * t), 122 + Math.round(17 * t), 25 + Math.round(9 * t)];
      }
      const flecks = lite ? 90 : 500;
      for (let i = 0; i < flecks; i++) {
        const j = 1 + Math.floor(rand() * (profile.length - 1)),
          a = rand() * Math.PI * 2,
          t = rand();
        const [r0, y0] = profile[j - 1],
          [r1, y1] = profile[j],
          r = r0 + t * (r1 - r0) + 0.0008,
          y = y0 + t * (y1 - y0) + 0.0006;
        const x = Math.cos(a) * r,
          z = Math.sin(a) * r;
        const h = 0.0016 + rand() * 0.0015,
          k = Math.sin(a) * h,
          l = Math.cos(a) * h;
        M.face(
          g,
          [M.pushVert(g, x + k, y - h, z - l), M.pushVert(g, x, y + h, z), M.pushVert(g, x - k, y - h, z + l)],
          i % 4 === 0 ? [255, 193, 94] : [194, 82, 12],
          { emissive: 0.54 }
        );
      }
      g.castShadow = false;
      return g;
    };
    const upper = grain(
      [
        [0.009, 0],
        [0.021, 0.083],
        [0.048, 0.152],
        [0.095, 0.226],
        [0.153, 0.304],
        [0.208, 0.386],
        [0.245, 0.458],
        [0.255, 0.51],
        [0.14, 0.509],
        [0.045, 0.497],
        [0, 0.48]
      ],
      360
    );
    const lower = grain(
      [[0, 0], [0.147, 0], [0.199, 0.031], [0.238, 0.076], [0.251, 0.117], [0.247, 0.155], [0.192, 0.185], [0.104, 0.242], [0.021, 0.3], [0, 0.31]],
      361
    );
    const sandfall = turned([[0.005, 0], [0.008, 0], [0.009, 1], [0.004, 1]], "#ffbd68", 0.9);
    const ore = [];
    for (let i = 0; i < (lite ? 8 : 20); i++) {
      const a = i * 2.39996,
        r = 0.004 + (i % 3) * 0.003;
      add(ore, M.box({ w: 0.006, h: 0.014, d: 0.006, color: EDGE, emissive: 0.85 }), r * Math.cos(a), i / (lite ? 8 : 20), r * Math.sin(a));
    }
    const luminous = M.merge(...lamps);
    for (const f of luminous.faces) f.emissive = 0.95;
    const metal = M.merge(...frame);
    metal.tintedMetal = 0.47;
    // The island board's 5×7 digits have open counters even looking up from the foot of the clock.
    const digits = Array.from({ length: 10 }, (_, i) => {
      const rows = BL.jumbotronFont.FONT[i],
        strokes = [],
        cell = 0.032;
      for (let y = 0; y < rows.length; y++)
        for (let x = 0; x < 5; x++) {
          if (rows[y] & (16 >> x)) add(strokes, M.box({ w: cell, h: cell, d: 0.009, color: "#ffb672", emissive: 0.83 }), x * cell, -y * cell, 0);
        }
      const g = M.merge(...strokes);
      g.castShadow = false;
      return g;
    });
    const parts = { base: M.merge(...stone), metal, glass, upper, lower, sandfall, ore: M.merge(...ore), luminous, digits };
    for (const g of [parts.base, metal, glass, upper, lower, sandfall, parts.ore, luminous, ...digits]) BL.pokerMarble.staticMesh(g);
    cache.set(lite, parts);
    return parts;
  };
  const build = lite => {
    const g = geometry(lite),
      root = S.createNode({ position: { x: X, y: 0, z: Z } });
    root.scale.x = root.scale.y = root.scale.z = 2;
    const add = (parent, geo, y = 0) => {
      const n = S.createNode({ geometry: geo, position: { x: 0, y, z: 0 } });
      S.addChild(parent, n);
      return n;
    };
    add(root, g.base);
    add(root, g.metal);
    add(root, g.glass);
    const upper = add(root, g.upper, 1.72),
      lower = add(root, g.lower, 1.07),
      stream = add(root, g.sandfall),
      grains = add(root, g.ore);
    const bezel = add(root, g.luminous),
      label = add(root, null, 2.72);
    const digits = Array.from({ length: 10 }, () => add(label, null));
    let height = 0,
      highest = 0,
      observedAt = 0,
      remaining = 0;
    const show = value => {
      if (height === value) return;
      height = value;
      const number = String(value);
      digits.forEach((n, i) => {
        n.visible = i < number.length;
        if (n.visible) {
          n.geometry = g.digits[Number(number[i])];
          n.position.x = (i - number.length / 2) * 0.192 + 0.032;
        }
      });
    };
    label.visible = false;
    // Socket news is already distinguished from the initial tip by mempool.js. REST may see the same tip first.
    const block = (value, chime) => {
      if (!Number.isSafeInteger(value) || value <= highest || value <= 0) return;
      highest = value;
      show(value);
      remaining = SECONDS;
      if (chime) chime(X, Z);
    };
    const update = (dt, time, snapshot, now, eye, chime) => {
      remaining = Math.max(0, remaining - dt);
      if (snapshot.heightAt > 0 && snapshot.height > 0 && snapshot.height !== height) {
        const recent = observedAt > 0 && now - observedAt <= 150000 && now - snapshot.heightAt <= 90000;
        if (recent && snapshot.height > highest && now - snapshot.lastBlockAt < 150000 && now - snapshot.lastBlockAt >= -7200000)
          block(snapshot.height, chime);
        else {
          show(snapshot.height);
          highest = Math.max(highest, height);
        }
      }
      observedAt = snapshot.heightAt;
      label.visible = height > 0;
      const pulse = remaining / SECONDS;
      if (eye) {
        const dx = eye.x - X,
          dz = eye.z - Z;
        label.rotation.y = Math.atan2(dx, dz);
        label.rotation.x = Math.atan2(label.position.y * 2 - eye.y, Math.hypot(dx, dz));
      }
      label.position.y = 2.71 + 0.14 * pulse + 0.012 * Math.sin(time * 1.7);
      for (const n of digits) {
        if (n.visible) n.glow = 0.75 + 0.35 * pulse;
      }
      bezel.glow = 0.22 + 1.65 * pulse;
      const known = snapshot.heightAt > 0 && snapshot.lastBlockAt > 0;
      // A sand measure of elapsed time against recent observed block pace, never a predicted arrival.
      const pace = snapshot.pace > 0 ? snapshot.pace : 600;
      const age = Math.max(0, (now - snapshot.lastBlockAt) / 1000);
      const fraction = known ? 1 - Math.exp(-age / pace) : 0;
      const u = Math.cbrt(1 - fraction),
        l = Math.cbrt(fraction);
      upper.visible = u > 0.001;
      upper.scale.x = upper.scale.y = upper.scale.z = u;
      lower.visible = l > 0.001;
      lower.scale.x = lower.scale.y = lower.scale.z = l;
      const floor = 1.07 + 0.31 * l,
        h = 1.72 - floor;
      stream.position.y = floor;
      stream.scale.y = h;
      stream.visible = grains.visible = known && fraction < 1;
      grains.position.y = floor + (1 - ((time * 3) % 1)) * 0.025;
      grains.scale.y = h - 0.025;
      upper.glow = lower.glow = 0.56 + 0.9 * pulse;
      return remaining;
    };
    return {
      root,
      block,
      update,
      get height() {
        return height;
      },
      get remaining() {
        return remaining;
      }
    };
  };
  BL.pokerHourglass = { X, Z, RADIUS, SECONDS, build };
})();
