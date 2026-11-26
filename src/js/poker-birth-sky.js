// An invented morning sky, leaded as a round window for the stained glass room. A sky map
// as seen looking up (zenith at the middle, the horizon at the rim, north up, east on the left): daylight glass
// warming to gold round the sun, every bright star still there behind the day as a small jewel, the constellations in
// fine gold came, the waning moon in the west, and a ring of larkspur round the rim. The sun carries
// the light: it swells each day at noon on the visitor's clock.
(() => {
  "use strict";
  const BL = window.BL, M = BL.models, tau = Math.PI * 2, DEG = Math.PI / 180;
  // Made up, not any real moment: the latitude and local sidereal angle (degrees) that turn the star field, the sun's
  // and moon's altitude and azimuth (degrees, azimuth from north through east) and the moon's lit share.
  const SKY = Object.freeze({ lat: 36, lst: 140, sun: [52, 110], moon: [30, 240], moonLit: 0.5 });
  // Noon on the visitor's clock as a time of day in UTC, read once at load, for the sun's daily swell.
  const NOON = (12 * 60 + new Date().getTimezoneOffset()) * 60000, DAY = 86400000;
  const SIZE = 1024, MID = SIZE / 2, HORIZON = 404, RIM = 500;
  // Altitude and azimuth (degrees, azimuth from north through east) of a body at right ascension `ra` hours.
  const altAz = (ra, dec) => {
    const h = (SKY.lst - ra * 15) * DEG, d = dec * DEG, p = SKY.lat * DEG;
    const alt = Math.asin(Math.sin(d) * Math.sin(p) + Math.cos(d) * Math.cos(p) * Math.cos(h));
    const az = Math.atan2(-Math.sin(h) * Math.cos(d), Math.cos(p) * Math.sin(d) - Math.sin(p) * Math.cos(d) * Math.cos(h));
    return [alt / DEG, (az / DEG + 360) % 360];
  };
  // Where a body falls on the window, in canvas pixels: zenith at the middle, the horizon at HORIZON, east on the left.
  const place = (alt, az) => {
    const r = HORIZON * (90 - alt) / 90;
    return [MID - r * Math.sin(az * DEG), MID - r * Math.cos(az * DEG)];
  };
  const sunAt = place(...SKY.sun), moonAltAz = SKY.moon, moonAt = place(...moonAltAz);

  const LEAD = "#1b1724";
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  // The daylight glass: deep cobalt overhead to a paler blue at the horizon, warming to gold near the sun.
  const ZENITH = hex("#1f3c8c"), LOW = hex("#4f82c8"), PALE = hex("#a8d0f2"), WARM = hex("#f7cf6a"), HALO = hex("#fff0b8");
  const skyAt = (x, y, random) => {
    const r = Math.hypot(x - MID, y - MID) / HORIZON, near = Math.hypot(x - sunAt[0], y - sunAt[1]) / HORIZON;
    let c = mix(ZENITH, LOW, Math.min(1, r * r * 0.9));
    // Through pale sky to gold, never straight across, so the glass near the sun stays clear instead of grey.
    c = mix(c, PALE, Math.min(1, Math.max(0, 1 - near / 0.7) * 1.5));
    c = mix(c, WARM, Math.max(0, 1 - near / 0.42) ** 1.3 * 0.9);
    c = mix(c, HALO, Math.max(0, 1 - near / 0.2) ** 1.2 * 0.8);
    const j = (random() - 0.5) * 22;
    return [c[0] + j, c[1] + j * 0.8, c[2] + j * 0.5].map(v => Math.max(0, Math.min(255, Math.round(v))));
  };
  // The field as a rose of shards: rings, each cut into panes that never line up with the ring inside it.
  const field = (c, random) => {
    const rings = [0, 46, 96, 150, 206, 262, 318, 364, HORIZON];
    for (let k = 1; k < rings.length; k++) {
      const r0 = rings[k - 1], r1 = rings[k], count = k === 1 ? 5 : 6 + k * 4, turn = random() * tau;
      for (let i = 0; i < count; i++) {
        const a0 = turn + i * tau / count, a1 = turn + (i + 1) * tau / count, am = (a0 + a1) / 2, rm = (r0 + r1) / 2;
        c.beginPath();
        if (r0) c.arc(MID, MID, r0, a0, a1); else c.moveTo(MID, MID);
        c.arc(MID, MID, r1, a1, a0, true); c.closePath();
        c.fillStyle = rgb(skyAt(MID + rm * Math.cos(am), MID + rm * Math.sin(am), random)); c.fill();
        c.strokeStyle = LEAD; c.lineWidth = 3; c.stroke();
      }
    }
  };
  // A low line of desert hills on the horizon, east and west, in dusk-violet glass.
  const hills = (c, random) => {
    c.beginPath();
    for (let i = 0; i <= 180; i++) {
      const a = i * tau / 180, lift = 10 + 18 * Math.max(0, Math.sin(a * 3 + 1.1)) ** 2 + 26 * Math.max(0, Math.sin(a * 2 - 0.4)) ** 6 + random() * 4;
      const r = HORIZON - lift;
      if (i) c.lineTo(MID + r * Math.cos(a), MID + r * Math.sin(a)); else c.moveTo(MID + r * Math.cos(a), MID + r * Math.sin(a));
    }
    c.arc(MID, MID, HORIZON, tau, 0, true); c.closePath();
    c.fillStyle = "#5b4a7c"; c.fill(); c.strokeStyle = LEAD; c.lineWidth = 3; c.stroke();
  };
  const STAR_INK = { b: "#e6eeff", w: "#ffffff", y: "#fff1c4", o: "#ffd7a0", r: "#ffc0a0" };
  // A four-pointed jewel with a long and a short pair of facets, lead round it.
  const jewel = (c, x, y, s, ink) => {
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * tau / 8 - Math.PI / 2, r = i % 2 ? s * 0.34 : (i % 4 ? s * 0.72 : s);
      c.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
    }
    c.closePath(); c.fillStyle = ink; c.fill(); c.strokeStyle = LEAD; c.lineWidth = 1.6; c.stroke();
  };
  const stars = c => {
    const { STARS, FIGURES } = BL.skyCatalog, at = new Map();
    for (const [name, ra, dec, mag, k] of STARS) {
      const [alt, az] = altAz(ra, dec);
      if (alt > 1) at.set(name, { xy: place(alt, az), mag, k });
    }
    c.lineCap = "round"; c.strokeStyle = "rgba(240,206,120,.75)"; c.lineWidth = 2.4;
    for (const [a, b] of FIGURES) {
      const p = at.get(a), q = at.get(b);
      if (!p || !q) continue;
      c.beginPath(); c.moveTo(...p.xy); c.lineTo(...q.xy); c.stroke();
    }
    for (const { xy, mag, k } of at.values()) jewel(c, xy[0], xy[1], Math.max(5, 15 - 3.2 * mag), STAR_INK[k]);
  };
  // The waning moon at its true phase, its lit side toward the sun.
  const moon = c => {
    if (moonAltAz[0] <= 0) return;
    const [x, y] = moonAt, r = 30, toward = Math.atan2(sunAt[1] - y, sunAt[0] - x), k = 1 - 2 * SKY.moonLit;
    c.save(); c.translate(x, y); c.rotate(toward);
    c.beginPath(); c.arc(0, 0, r, 0, tau); c.fillStyle = "#3d4f86"; c.fill();
    c.beginPath(); c.arc(0, 0, r, -Math.PI / 2, Math.PI / 2); c.ellipse(0, 0, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, k > 0);
    c.fillStyle = "#e9eef8"; c.fill();
    c.beginPath(); c.arc(0, 0, r, 0, tau); c.strokeStyle = LEAD; c.lineWidth = 3; c.stroke(); c.restore();
  };
  // The sun: a gold boss in two whorls of ray panes. The swell is a separate node over it (see `light`).
  const sun = (c, random) => {
    const [x, y] = sunAt;
    for (const [count, inner, outer, ink, turn] of [[16, 34, 92, ["#f7a531", "#ffcb5c"], 0], [16, 34, 66, ["#ffd36b", "#fff0b0"], Math.PI / 16]]) {
      for (let i = 0; i < count; i++) {
        const a = turn + i * tau / count, w = tau / count * 0.42, reach = outer * (0.9 + 0.1 * random());
        c.beginPath(); c.moveTo(x + inner * Math.cos(a - w), y + inner * Math.sin(a - w));
        c.lineTo(x + reach * Math.cos(a), y + reach * Math.sin(a));
        c.lineTo(x + inner * Math.cos(a + w), y + inner * Math.sin(a + w)); c.closePath();
        c.fillStyle = ink[i % 2]; c.fill(); c.strokeStyle = LEAD; c.lineWidth = 2.4; c.stroke();
      }
    }
    const boss = c.createRadialGradient(x - 8, y - 8, 4, x, y, 36);
    boss.addColorStop(0, "#fffbe6"); boss.addColorStop(0.55, "#ffe08a"); boss.addColorStop(1, "#f6a92e");
    c.beginPath(); c.arc(x, y, 36, 0, tau); c.fillStyle = boss; c.fill(); c.strokeStyle = LEAD; c.lineWidth = 3.4; c.stroke();
  };
  const LARKSPUR = ["#7d5fd0", "#a58be8", "#c9adf5", "#5d4bb5", "#9a7fe0"];
  // The rim: violet glass between the horizon and the frame, larkspur spikes growing all the way round it clockwise.
  const rim = (c, random) => {
    const band = c.createRadialGradient(MID, MID, HORIZON, MID, MID, RIM);
    band.addColorStop(0, "#2f2457"); band.addColorStop(1, "#4a3a82");
    c.beginPath(); c.arc(MID, MID, RIM, 0, tau); c.arc(MID, MID, HORIZON, tau, 0, true);
    c.fillStyle = band; c.fill("evenodd");
    const spikes = 13;
    for (let i = 0; i < spikes; i++) {
      const a0 = i * tau / spikes, len = 0.44, r = (HORIZON + RIM) / 2;
      const point = t => { const a = a0 + t * len, rr = r + 22 * Math.sin(t * Math.PI) * (i % 2 ? 1 : -1) * 0.5; return [MID + rr * Math.cos(a), MID + rr * Math.sin(a)]; };
      c.beginPath(); c.moveTo(...point(0));
      for (let t = 0.05; t <= 1.001; t += 0.05) c.lineTo(...point(t));
      c.strokeStyle = "#5f8a4e"; c.lineWidth = 5; c.stroke();
      for (const s of [-1, 1]) {
        const [lx, ly] = point(0.12), a = a0 + 0.12 * len + s * 0.5;
        c.beginPath(); c.ellipse(lx + s * 10 * Math.cos(a), ly + s * 10 * Math.sin(a), 14, 4, a, 0, tau);
        c.fillStyle = "#6f9a5a"; c.fill(); c.strokeStyle = LEAD; c.lineWidth = 1.4; c.stroke();
      }
      for (let f = 0; f < 8; f++) {
        const t = 0.2 + f * 0.105, [fx, fy] = point(t), size = 19 - f * 1.6;
        for (let p = 0; p < 5; p++) {
          const a = p * tau / 5 + f, px = fx + size * 0.62 * Math.cos(a), py = fy + size * 0.62 * Math.sin(a);
          c.beginPath(); c.ellipse(px, py, size * 0.58, size * 0.38, a, 0, tau);
          c.fillStyle = LARKSPUR[(p + f + i) % LARKSPUR.length]; c.fill(); c.strokeStyle = LEAD; c.lineWidth = 1.3; c.stroke();
        }
        c.beginPath(); c.arc(fx, fy, size * 0.26, 0, tau); c.fillStyle = "#efe6ff"; c.fill();
      }
    }
    for (const r of [HORIZON, RIM - 2]) { c.beginPath(); c.arc(MID, MID, r, 0, tau); c.strokeStyle = LEAD; c.lineWidth = r === HORIZON ? 6 : 8; c.stroke(); }
  };
  const paint = c => {
    const random = BL.math.mulberry32(271828);
    c.fillStyle = LEAD; c.fillRect(0, 0, SIZE, SIZE);
    field(c, random); hills(c, random); stars(c); moon(c); sun(c, random); rim(c, random);
  };
  // A disc of glass `radius` metres across the room's face, lit like the room's other windows.
  const disk = (radius, emissive) => {
    const g = M.geometry(), centre = M.pushVert(g, 0, 0, 0), ring = [];
    for (let i = 0; i < 64; i++) ring.push(M.pushVert(g, radius * Math.cos(i * tau / 64), radius * Math.sin(i * tau / 64), 0));
    for (let i = 0; i < 64; i++) M.face(g, [centre, ring[i], ring[(i + 1) % 64]], [255, 255, 255], { emissive });
    g.castShadow = false; return g;
  };
  const window_ = radius => {
    const g = disk(radius, 0.78);
    if (typeof document === "undefined") return g;
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = SIZE;
    paint(canvas.getContext("2d")); g.imageSurface = { canvas, rect: [-radius, -radius, 2 * radius, 2 * radius], smooth: true, version: 1 };
    return g;
  };
  // Where the sun sits on a window of `radius` metres, from its middle (y up), and how wide its boss is.
  const sunOn = radius => ({ x: (sunAt[0] - MID) / MID * radius, y: (MID - sunAt[1]) / MID * radius, r: 36 / MID * radius });
  // The light, 0 to 1 by the time of day: a gentle glow always, swelling through the half hour before noon, full for
  // that minute, easing back over the half hour after.
  // `?debug=1&herlight=1` holds it full all day, to look at it outside that hour.
  const params = typeof location === "undefined" ? null : new URLSearchParams(location.search);
  const HELD = !!params && params.get("debug") === "1" && params.get("herlight") === "1";
  const light = ms => {
    if (HELD) return 1;
    const t = ((ms - NOON) % DAY + DAY) % DAY, before = DAY - t, ease = u => u * u * (3 - 2 * u);
    if (t < 60000) return 1;
    if (t < 60000 + 1800000) return ease(1 - (t - 60000) / 1800000);
    if (before < 1800000) return ease(1 - before / 1800000);
    return 0;
  };
  BL.pokerBirthSky = Object.freeze({ window: window_, sunOn, light, paint, SIZE });
})();
