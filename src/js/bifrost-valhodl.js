(function () {
  "use strict";
  // ₿IFRÖST's Valhodl window, alive over its baked picture (bifrost-valhodl-art.js): dark clouds drifting across the
  // storm, lightning now and then lighting the sky with a rumble after it, the castle's lit windows and the channel's
  // candles flickering, and crows wheeling round the keep's spire. Every piece is a flat picture laid a little in
  // front of the window's picture, in the window's own frame (its picture `pic`: `w` across and `h` tall from the
  // floor up, facing +z at `z`), so the passage frames them. Fixed pools built once a visit; nothing allocated a frame.
  // Canvas 2D gets the flickering lights alone.
  const BL = window.BL;
  const { createNode, addChild } = BL.scene;

  // The clouds: `n` of them in two depths over the skyline, each `size` of the picture's width across, drifting at
  // `speed` m/s. The lightning: a strike every `every` s, a flash `flash` s long with a second flicker, its rumble
  // `rumble` s after. The lights' flicker and the crows' wheel.
  const CLOUDS = { n: 9, size: [0.38, 0.62], speed: [0.03, 0.08], opacity: [0.5, 0.85] };
  const STRIKE = { every: [6, 14], flash: 0.22, again: 0.09, rumble: [0.7, 1.6], lift: 0.55 };
  const LIGHTS = { size: 0.014, candle: 0.007, rate: [5, 13] };
  const CROWS = { n: 6, radius: [0.06, 0.15], rate: [0.25, 0.5], size: 0.016, flap: 7 };

  /** A picture painted once into a quad one unit tall with its foot at `foot` of its height. */
  const picture = (w, h, foot, blend, paint) => {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    paint(canvas.getContext("2d"), w, h);
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const W = w / h, x0 = -W / 2, y0 = -foot;
    const geo = { verts: [x0, y0, 0, x0 + W, y0, 0, x0 + W, y0 + 1, 0, x0, y0 + 1, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
    geo.imageSurface = { asset: { width: w, height: h, load: () => image }, rect: [x0, y0, W, 1], cutout: true, soft: true, blend, bright: blend === "add" ? 0.9 : 0 };
    return geo;
  };
  let parts = null;
  const build = () => parts || (parts = {
    cloud: picture(256, 128, 0.5, "alpha", (g, w, h) => {
      for (let k = 0; k < 7; k++) {
        const x = w * (0.2 + 0.6 * ((k * 0.618) % 1)), y = h * (0.42 + 0.2 * ((k * 0.37) % 1)), r = h * (0.22 + 0.14 * ((k * 0.73) % 1));
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, "rgba(14,16,26,0.75)"); grad.addColorStop(0.6, "rgba(18,20,32,0.4)"); grad.addColorStop(1, "rgba(20,22,34,0)");
        g.fillStyle = grad; g.fillRect(0, 0, w, h);
      }
    }),
    glow: picture(64, 64, 0.5, "add", (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grad.addColorStop(0, "rgba(255,226,150,1)"); grad.addColorStop(0.35, "rgba(255,170,70,0.55)"); grad.addColorStop(1, "rgba(255,130,40,0)");
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    }),
    flash: picture(64, 64, 0, "add", (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "rgba(190,205,255,0.9)"); grad.addColorStop(0.55, "rgba(150,165,230,0.35)"); grad.addColorStop(1, "rgba(120,130,200,0)");
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    }),
    // Three bolts, each forking down from the clouds.
    bolts: [11, 23, 37].map((seed) => picture(96, 256, 0, "add", (g, w, h) => {
      let s = seed;
      const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
      const fork = (x, y, len, width) => {
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 9 && y < h; k++) {
          x += (rand() - 0.5) * w * 0.28; y += len / 9 * (0.7 + rand() * 0.6);
          g.lineTo(Math.max(4, Math.min(w - 4, x)), y);
          if (rand() < 0.22 && width > 1.5) { const keepX = x, keepY = y; g.stroke(); fork(keepX, keepY, len * 0.4, width * 0.55); g.beginPath(); g.moveTo(keepX, keepY); }
        }
        g.lineWidth = width; g.stroke();
      };
      g.lineCap = g.lineJoin = "round";
      g.shadowColor = "rgba(160,180,255,0.9)"; g.shadowBlur = 10;
      g.strokeStyle = "rgba(235,240,255,1)";
      fork(w / 2, 0, h, 3.2);
    })),
    crow: picture(48, 24, 0.5, "alpha", (g, w, h) => {
      g.strokeStyle = "rgba(6,6,10,0.95)"; g.lineWidth = 4; g.lineCap = "round";
      g.beginPath(); g.moveTo(3, h * 0.35); g.quadraticCurveTo(w * 0.3, h * 0.2, w / 2, h * 0.62); g.quadraticCurveTo(w * 0.7, h * 0.2, w - 3, h * 0.35); g.stroke();
    })
  });

  const between = (r) => r[0] + Math.random() * (r[1] - r[0]);

  /** The live layer for the Valhodl window: built under `node`, the window's own node, over the picture `pic` from the
   *  baked `art`; `onThunder()` is called as each strike's rumble arrives. */
  const create = (node, art, pic, onThunder, canvas2d) => {
    const P = build(), group = createNode({ sightHidden: true }), skyY = (1 - art.sky) * pic.h, X = (u) => (u - 0.5) * pic.w, Y = (v) => (1 - v) * pic.h;
    addChild(node, group);
    const sprite = (geometry, z) => { const n = createNode({ geometry, position: { x: 0, y: 0, z: pic.z + z }, sightHidden: true }); addChild(group, n); return n; };
    // The lit windows and the candles, each flickering on its own phase.
    const lights = art.lights.map(([u, v, size], i) => {
      const n = sprite(P.glow, 0.03), s = size < 0.7 ? LIGHTS.candle : LIGHTS.size * Math.min(1.8, 0.6 + size * 0.35);
      n.position.x = X(u); n.position.y = Y(v);
      return { n, s: s * pic.w, rate: between(LIGHTS.rate), phase: i * 2.399, base: size < 0.7 ? 0.42 : 0.38 };
    });
    const clouds = [], crows = [], bolts = [];
    let flash = null, next = between(STRIKE.every), t = -1, rumble = -1, bolt = null;
    if (!canvas2d) {
      for (let i = 0; i < CLOUDS.n; i++) {
        const n = sprite(P.cloud, 0.06 + (i & 1) * 0.04), w = between(CLOUDS.size) * pic.w;
        n.scale.x = n.scale.y = n.scale.z = w / 2;
        clouds.push({ n, w, x: (Math.random() - 0.5) * pic.w, y: skyY + (0.1 + Math.random() * 0.85) * (pic.h - skyY), v: between(CLOUDS.speed) * (i & 1 ? 1 : 0.7), o: between(CLOUDS.opacity) });
      }
      for (const g of P.bolts) { const n = sprite(g, 0.04); n.visible = false; bolts.push(n); }
      flash = sprite(P.flash, 0.1);
      // The sky lit from the top of the picture down to a little under the skyline.
      flash.scale.x = pic.w; flash.scale.y = pic.h - skyY * 0.6; flash.position.y = skyY * 0.6;
      flash.visible = false;
      for (let i = 0; i < CROWS.n; i++) {
        const n = sprite(P.crow, 0.08);
        crows.push({ n, r: between(CROWS.radius) * pic.w, a: Math.random() * Math.PI * 2, rate: between(CROWS.rate) * (i & 1 ? 1 : -1), lift: 0.04 + Math.random() * 0.08, phase: Math.random() * 6 });
      }
    }
    const edge = (x, half) => Math.max(0, Math.min(1, (pic.w / 2 - Math.abs(x) - half * 0.5) / (half * 0.6)));
    const update = (dt, elapsed) => {
      for (let i = 0; i < lights.length; i++) {
        const l = lights[i], k = l.base + 0.25 * Math.sin(elapsed * l.rate + l.phase) + 0.12 * Math.sin(elapsed * l.rate * 2.3 + l.phase * 1.7);
        l.n.smokeOpacity = k; l.n.scale.x = l.n.scale.y = l.n.scale.z = l.s * (0.85 + 0.2 * k);
      }
      if (canvas2d) return;
      for (let i = 0; i < clouds.length; i++) {
        const c = clouds[i], half = c.w / 2;
        c.x += c.v * dt;
        if (c.x - half > pic.w / 2) c.x = -pic.w / 2 - half;
        c.n.position.x = c.x; c.n.position.y = c.y;
        c.n.smokeOpacity = c.o * edge(c.x, half);
      }
      for (let i = 0; i < crows.length; i++) {
        const c = crows[i];
        c.a += c.rate * dt;
        c.n.position.x = X(art.spire[0]) + Math.cos(c.a) * c.r; c.n.position.y = Y(art.spire[1]) + c.lift * pic.h + Math.sin(c.a) * c.r * 0.35;
        const s = CROWS.size * pic.w;
        c.n.scale.x = c.n.scale.z = s; c.n.scale.y = s * (0.55 + 0.45 * Math.abs(Math.sin(elapsed * CROWS.flap + c.phase)));
      }
      // The lightning: a bolt and the sky lit, flickering once more, then the rumble.
      if (t < 0) {
        if ((next -= dt) <= 0) {
          t = 0; next = between(STRIKE.every); rumble = between(STRIKE.rumble);
          bolt = bolts[(Math.random() * bolts.length) | 0];
          const tall = (pic.h - skyY) * (0.75 + Math.random() * 0.2);
          bolt.scale.x = bolt.scale.y = bolt.scale.z = tall;
          bolt.position.x = (Math.random() - 0.5) * pic.w * 0.7; bolt.position.y = pic.h - tall;
        }
      } else {
        t += dt;
        const on = t < STRIKE.flash && !(t > STRIKE.again && t < STRIKE.again * 1.6);
        bolt.visible = flash.visible = on;
        if (on) { const k = 1 - t / STRIKE.flash; bolt.smokeOpacity = 0.6 + 0.4 * k; flash.smokeOpacity = STRIKE.lift * k; }
        if (rumble >= 0 && t >= rumble) { rumble = -1; onThunder(); }
        if (t > STRIKE.flash && rumble < 0) { t = -1; bolt.visible = flash.visible = false; }
      }
    };
    return { update, group };
  };

  BL.bifrostValhodl = { create };
})();
