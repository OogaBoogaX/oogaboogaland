// The room's cosmetic preset. Never read or mutate a table, deck, balance or action.
(() => {
  "use strict";
  const BL = window.BL;
  // The globe beyond the bar and the key light through the glass share this bearing.
  const MOON = (([x, y, z]) => { const l = Math.hypot(x, y, z); return Object.freeze({ x: x / l, y: y / l, z: z / l }); })([0.56, 0.46, -1]);
  // Direction back toward the room for consumers of the night lighting preset.
  const MOON_SUN = Object.freeze({ x: -MOON.x, y: -MOON.y, z: -MOON.z });
  const club = {
    // Marble: floor, wall panels, side walls, end walls, the cream ceiling and the table tops. Walnut chairs and pale
    // gold lettering on the far wall's green field. `runner` is the green the hall's runner once was, still the
    // ₿IFRÖST window's poker palette with `ui`; the floor now carries a dark river channel (poker-hall.js).
    stone: ["#ece8e1", "#e8e3da", "#d9d2c6", "#e4ded4", "#efe3c8", "#f1ede6"],
    wood: "#4a2e1e", accent: "#c8a45f", mineral: "#e2c98a", felt: "#1f4a3a", runner: "#2c614c",
    ui: { accent: "#dfbe77", bright: "#f4dda2", deep: "#142820", feltLight: "#3b7963" },
    // An evening hall: the fill comes down (the floor's fill is the larger of `sky` and `ambient`) so the lamps do the
    // work, warm pools under the chandeliers and each table's lamp, and the polished floor's reflection reads over it.
    // Bloom comes up for the crystal, bottles and signs. Each table's lamp still outshines the chandeliers over its felt.
    // `light` is the main light's direction (the renderer's key), and a warm dark haze thickens down the hall, thin
    // enough that the far wall reads. Tuned by eye in the built room.
    sky: [0.16, 0.145, 0.12], ground: [0.35, 0.29, 0.22], direct: [1.0, 0.78, 0.47], ambient: 0.15,
    tableRange: 7.6, tableY: 3.15, bloom: 0.54, directStrength: 0.25, shadowStrength: 0.55,
    tableLight: [1.45, 1.18, 0.76], roomLight: [0.92, 0.68, 0.39], roomRange: 10,
    light: MOON, fog: [0.07, 0.053, 0.034], fogNear: 20, fogFar: 120,
    // The night over the glass vault: the sky pass's gradient, stars and moon (₿IFRÖST's own values), and how the
    // cosmos rig (cosmos.js) is hung over the hall (`hang` below), which runs along z and is entered at z 29 facing -z,
    // glass on every side: the sky under the horizon too (`below`) and its band's clouds and halos rounder (`soft`);
    // the Bitcoin moon over the bar end, a little right, clear of the chandeliers from the
    // arrival and the promenade; a world low off each long side, so a seated player can look out at one: the red
    // world (twice its size, `grow`) off the -x side toward the bar, the ice world off the +x side toward the bar
    // (the builder's sun stands toward +x and +z, so a world off +x leans to -z to show more than its night side),
    // and a small ice world (`extra`) off the -x side toward the arrival.
    night: { horizon: [0.038, 0.03, 0.046], zenith: [0.006, 0.008, 0.03], stars: 1, sun: [0.05, 0.05, 0.08], moon: MOON, moonSun: MOON_SUN,
      cosmos: { scale: 1, tilt: 0, below: true, soft: true,
        place: { giant: { dir: [0.56, 0.46, -1] }, red: [-1, 0.09, -0.3], ice: [1, 0.08, -0.7], extra: { dir: [-1, 0.06, 0.62], kind: "ice", size: 8 } },
        grow: { red: 2 } } },
    // Canvas 2D has no reflection, bloom or glow to carry an evening room, so it keeps a brighter warm hall and no haze.
    canvas: { sky: [0.72, 0.66, 0.56], ground: [0.48, 0.43, 0.37], ambient: 0.48, directStrength: 0.4 }
  };
  // The room's light, written into a scene's render options in place: its fill, key direction and haze, and the
  // renderer's sky pass (the gradient, the moon and the twinkling stars, turned by `starMatrix`, a matrix these options
  // own, made on the first call and kept, which the cosmos rig writes in place each frame), with `sun` the night's dim
  // colour, as the sky pass reads it. On Canvas 2D the `canvas` record stands in for its own values and no haze is passed.
  const light = (opts, kind) => {
    const canvas = kind === "canvas2d" ? club.canvas : null, of = key => (canvas && key in canvas ? canvas : club)[key];
    opts.sky = of("sky"); opts.ground = of("ground"); opts.direct = of("direct"); opts.ambientFloor = of("ambient");
    opts.bloomStrength = of("bloom"); opts.directStrength = of("directStrength");
    opts.light = club.light; opts.shadowStrength = club.shadowStrength;
    if (canvas) { delete opts.fog; delete opts.fogNear; delete opts.fogFar; } else { opts.fog = club.fog; opts.fogNear = club.fogNear; opts.fogFar = club.fogFar; }
    const night = club.night;
    opts.sun = night.sun;
    opts.horizon = night.horizon; opts.zenith = night.zenith; opts.stars = night.stars; opts.skyMoonDisc = false; opts.moon = night.moon; opts.moonSun = night.moonSun;
    if (!opts.starMatrix) opts.starMatrix = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  };
  // The night sky (`night.cosmos`), made and hung: a cosmos rig (cosmos.js) with the sky under the horizon when the
  // record asks (`below`), its worlds placed as `place` says and each world named in `grow` made that many times its
  // size (its moons' ways with it). The scene and the ₿IFRÖST chamber's picture of the room hang it alike.
  const hang = ({ sparse, canvas = false, scale = club.night.cosmos.scale, ship = true }) => {
    const c = club.night.cosmos, rig = BL.cosmos.create({ sparse, scale, tilt: c.tilt, ship, below: !!c.below });
    BL.cosmos.place(rig, c.place);
    // The glass pavilion looks straight across the water through both halves of the star field.
    // The galaxy's concentric painted discs would stand out against this long, level horizon.
    rig.parts.band.visible=false;
    if(rig.parts.low)rig.parts.low.band.visible=false;
    if (c.soft) BL.cosmos.soften(rig);
    for (const key in c.grow) { const n = rig.parts.planets.find(p => p.key === key).node; n.scale.x = n.scale.y = n.scale.z = c.grow[key]; }
    BL.pokerHall.hangMoon(rig, sparse, canvas);
    return rig;
  };
  BL.pokerThemes = { club, light, hang };
})();
