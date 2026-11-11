// Room 0, the Planetarium: the night sky over London as it stands now. The screen starts at the sphere's equator,
// 1.6 m up, so the dome is the whole sky above the horizon and a star's height over the island's skyline is its true
// altitude. The real bright stars, their constellation figures and names and the Milky Way stand on one node the
// scene turns about the celestial pole by the local sidereal time, so the sky turns in real time, as it does outside;
// the Zeiss-style projector in the middle, its axis on the pole, turns its two star balls with it, and a tap on it or
// on its console runs the night forward an hour a second, and again brings it back to now. Loungers in two rings lie
// back facing out from it, and the island's skyline (hills, palms, huts and a billboard, the compass points under it)
// stands in silhouette round the horizon. The sky's builder is shared with the Observatory's slit (`sky`).
(() => {
  "use strict";
  const BL = window.BL;
  const RM = BL.timechainRoomModels, ROOMS = BL.timechainRooms;
  const { box, merge, moved, turnedX, noShadow } = BL.models;
  const { face, blank, own, perRoom, litWord } = RM.helpers;
  const { rng, pix, font, MONO } = RM.paintKit;
  const DEG = ROOMS.DEG, TAU = ROOMS.TAU, AMBER = "#f7931a";

  // ---------- the sky ----------
  // The brightest stars by name: right ascension (hours), declination (degrees), visual magnitude and colour.
  const STARS = [
    ["Sirius", 6.7525, -16.716, -1.46, "w"], ["Canopus", 6.3992, -52.696, -0.74, "w"], ["Arcturus", 14.261, 19.182, -0.05, "o"], ["Rigil Kentaurus", 14.66, -60.834, -0.27, "y"],
    ["Vega", 18.6156, 38.784, 0.03, "b"], ["Capella", 5.2782, 45.998, 0.08, "y"], ["Rigel", 5.2423, -8.202, 0.13, "b"], ["Procyon", 7.655, 5.225, 0.34, "w"],
    ["Achernar", 1.6286, -57.237, 0.46, "b"], ["Betelgeuse", 5.9195, 7.407, 0.5, "r"], ["Hadar", 14.0637, -60.373, 0.61, "b"], ["Altair", 19.8464, 8.868, 0.76, "w"],
    ["Acrux", 12.4433, -63.099, 0.77, "b"], ["Aldebaran", 4.5987, 16.509, 0.86, "r"], ["Antares", 16.4901, -26.432, 0.96, "r"], ["Spica", 13.4199, -11.161, 0.97, "b"],
    ["Pollux", 7.7553, 28.026, 1.14, "o"], ["Fomalhaut", 22.9608, -29.622, 1.16, "w"], ["Deneb", 20.6905, 45.28, 1.25, "w"], ["Mimosa", 12.7953, -59.689, 1.25, "b"],
    ["Regulus", 10.1395, 11.967, 1.35, "b"], ["Adhara", 6.9771, -28.972, 1.5, "b"], ["Castor", 7.5767, 31.888, 1.58, "w"], ["Shaula", 17.5601, -37.104, 1.62, "b"],
    ["Gacrux", 12.5194, -57.113, 1.64, "r"], ["Bellatrix", 5.4189, 6.35, 1.64, "b"], ["Elnath", 5.4382, 28.608, 1.65, "b"], ["Alnilam", 5.6036, -1.202, 1.69, "b"],
    ["Alnitak", 5.6793, -1.943, 1.77, "b"], ["Alioth", 12.9005, 55.96, 1.77, "w"], ["Dubhe", 11.0621, 61.751, 1.79, "o"], ["Mirfak", 3.4054, 49.861, 1.79, "y"],
    ["Alkaid", 13.7923, 49.313, 1.86, "b"], ["Sargas", 17.622, -42.998, 1.86, "y"], ["Alhena", 6.6285, 16.399, 1.93, "w"], ["Polaris", 2.5302, 89.264, 1.98, "y"],
    ["Hamal", 2.1195, 23.463, 2.0, "o"], ["Mirach", 1.1622, 35.621, 2.05, "r"], ["Alpheratz", 0.1398, 29.091, 2.06, "b"], ["Kochab", 14.8451, 74.155, 2.08, "o"],
    ["Algieba", 10.3329, 19.842, 2.08, "o"], ["Saiph", 5.7959, -9.67, 2.09, "b"], ["Almach", 2.065, 42.33, 2.1, "o"], ["Algol", 3.1361, 40.956, 2.12, "b"],
    ["Denebola", 11.8177, 14.572, 2.14, "w"], ["Gamma Cas", 0.9451, 60.717, 2.15, "b"], ["Mintaka", 5.5334, -0.299, 2.23, "b"], ["Mizar", 13.3988, 54.925, 2.23, "w"],
    ["Sadr", 20.3705, 40.257, 2.23, "y"], ["Schedar", 0.6751, 56.537, 2.24, "o"], ["Caph", 0.153, 59.15, 2.28, "w"], ["Dschubba", 16.0056, -22.622, 2.29, "b"],
    ["Epsilon Sco", 16.8361, -34.293, 2.29, "o"], ["Merak", 11.0307, 56.382, 2.37, "w"], ["Kappa Sco", 17.7081, -39.03, 2.41, "b"], ["Scheat", 23.0629, 28.083, 2.42, "r"],
    ["Phecda", 11.8972, 53.695, 2.44, "w"], ["Gienah", 20.7702, 33.97, 2.48, "o"], ["Markab", 23.0793, 15.205, 2.48, "b"], ["Zosma", 11.2351, 20.524, 2.56, "w"],
    ["Acrab", 16.0906, -19.806, 2.62, "b"], ["Ruchbah", 1.4303, 60.235, 2.66, "w"], ["Lesath", 17.5127, -37.296, 2.7, "b"], ["Delta Cru", 12.2524, -58.749, 2.79, "b"],
    ["Tau Sco", 16.598, -28.216, 2.82, "b"], ["Algenib", 0.2206, 15.184, 2.83, "b"], ["Alcyone", 3.7914, 24.105, 2.87, "b"], ["Delta Cyg", 19.7496, 45.131, 2.87, "b"],
    ["Pi Sco", 15.9809, -26.114, 2.89, "b"], ["Sigma Sco", 16.3531, -25.593, 2.89, "b"], ["Ras Elased", 9.7642, 23.774, 2.98, "o"], ["Pherkad", 15.3455, 71.834, 3.0, "w"],
    ["Iota Sco", 17.793, -40.127, 3.0, "y"], ["Mu Sco", 16.8645, -38.047, 3.0, "b"], ["Albireo", 19.5121, 27.96, 3.08, "o"], ["Eta Sco", 17.2025, -43.239, 3.3, "w"],
    ["Megrez", 12.2571, 57.033, 3.31, "w"], ["Chertan", 11.2373, 15.43, 3.33, "w"], ["Segin", 1.9066, 63.67, 3.35, "b"], ["Meissa", 5.5856, 9.934, 3.39, "b"],
    ["Adhafera", 10.2782, 23.417, 3.43, "w"], ["Eta Leo", 10.1222, 16.763, 3.49, "w"], ["Zeta Sco", 16.9097, -42.362, 3.6, "o"], ["Atlas", 3.8194, 24.053, 3.62, "b"],
    ["Electra", 3.7479, 24.113, 3.7, "b"], ["Maia", 3.7638, 24.368, 3.87, "b"], ["Merope", 3.7721, 23.948, 4.18, "b"], ["Taygeta", 3.7535, 24.467, 4.3, "b"]
  ];
  // The constellation figures, star to star, and the names hung under (or over) a star, `dy` 7 cm steps along the sky.
  const FIGURES = [
    ["Betelgeuse", "Meissa"], ["Meissa", "Bellatrix"], ["Betelgeuse", "Bellatrix"], ["Betelgeuse", "Alnitak"], ["Bellatrix", "Mintaka"], ["Alnitak", "Alnilam"], ["Alnilam", "Mintaka"], ["Alnitak", "Saiph"], ["Mintaka", "Rigel"],
    ["Dubhe", "Merak"], ["Merak", "Phecda"], ["Phecda", "Megrez"], ["Megrez", "Dubhe"], ["Megrez", "Alioth"], ["Alioth", "Mizar"], ["Mizar", "Alkaid"],
    ["Caph", "Schedar"], ["Schedar", "Gamma Cas"], ["Gamma Cas", "Ruchbah"], ["Ruchbah", "Segin"],
    ["Deneb", "Sadr"], ["Sadr", "Albireo"], ["Gienah", "Sadr"], ["Sadr", "Delta Cyg"],
    ["Regulus", "Eta Leo"], ["Eta Leo", "Algieba"], ["Algieba", "Adhafera"], ["Adhafera", "Ras Elased"], ["Algieba", "Zosma"], ["Zosma", "Denebola"], ["Denebola", "Chertan"], ["Chertan", "Regulus"], ["Zosma", "Chertan"],
    ["Acrab", "Dschubba"], ["Dschubba", "Pi Sco"], ["Dschubba", "Sigma Sco"], ["Sigma Sco", "Antares"], ["Antares", "Tau Sco"], ["Tau Sco", "Epsilon Sco"], ["Epsilon Sco", "Mu Sco"], ["Mu Sco", "Zeta Sco"], ["Zeta Sco", "Eta Sco"], ["Eta Sco", "Sargas"], ["Sargas", "Iota Sco"], ["Iota Sco", "Kappa Sco"], ["Kappa Sco", "Shaula"], ["Shaula", "Lesath"],
    ["Acrux", "Gacrux"], ["Mimosa", "Delta Cru"], ["Kochab", "Pherkad"],
    ["Markab", "Scheat"], ["Scheat", "Alpheratz"], ["Alpheratz", "Algenib"], ["Algenib", "Markab"], ["Alpheratz", "Mirach"], ["Mirach", "Almach"],
    ["Castor", "Pollux"], ["Vega", "Deneb"], ["Deneb", "Altair"], ["Altair", "Vega"]
  ];
  const LABELS = [["ORION", "Alnilam", -4], ["URSA MAJOR", "Megrez", -5], ["CASSIOPEIA", "Gamma Cas", 5], ["CYGNUS", "Sadr", 4], ["LEO", "Chertan", -5], ["SCORPIUS", "Epsilon Sco", -5], ["CRUX", "Acrux", -4], ["PEGASUS", "Markab", 5], ["PLEIADES", "Alcyone", -3], ["POLARIS", "Polaris", -3], ["SIRIUS", "Sirius", -3], ["VEGA", "Vega", -3], ["ARCTURUS", "Arcturus", -3], ["SUMMER TRIANGLE", "Altair", -6]];
  const STAR_COLOR = { b: [0.75, 0.84, 1], w: [1, 1, 1], y: [1, 0.94, 0.78], o: [1, 0.8, 0.58], r: [1, 0.64, 0.48] };
  const LABEL_COLOR = { star: [230, 180, 108], figure: [128, 153, 196], asterism: [105, 128, 165] };
  const FIGURE_COLOR = [58, 78, 116];
  const LONDON = { lat: 51.5072, lon: -0.1276 };
  // The local sidereal time over London at `ms` (radians): how far the sky has turned about the pole.
  const lst = (ms) => (280.46061837 + 360.98564736629 * (ms / 86400000 - 10957.5) + LONDON.lon) % 360 * DEG;
  const SIDEREAL_DAY = 86164091;
  // Stars further south than this never rise over London; the sky leaves them out.
  const NEVER = LONDON.lat - 90 - 0.5;
  // A direction in the sky's own frame: the celestial pole up +y, right ascension 0h toward +z and 6h toward +x. The
  // sky's node tilts that pole to London's latitude over the north (-z) and turns it by minus the sidereal time.
  const dirOf = (raDeg, dec) => { const a = raDeg * DEG, d = dec * DEG; return [Math.cos(d) * Math.sin(a), Math.sin(d), Math.cos(d) * Math.cos(a)]; };
  const TILT = (LONDON.lat - 90) * DEG;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const scale = (c, k) => [Math.round(c[0] * k * 255), Math.round(c[1] * k * 255), Math.round(c[2] * k * 255)];
  const unit = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // Two directions across the sky at `d`: one along its circle of declination and one toward the pole.
  const across = (d) => {
    let ax = d[2], az = -d[0];
    const l = Math.hypot(ax, az);
    if (l < 1e-6) { ax = 1; az = 0; } else { ax /= l; az /= l; }
    return [[ax, 0, az], [d[1] * az, d[2] * ax - d[0] * az, -d[1] * ax]];
  };
  // A flat polygon of `sides` corners `size` across, centred `r` out along `d` and facing back along it.
  const disc = (geo, d, r, size, sides, color, emissive = 1, spin = 0) => {
    const [a, b] = across(d), h = size / 2, pts = [];
    for (let k = 0; k < sides; k++) {
      const t = spin + k * TAU / sides, c = Math.cos(t) * h, s = Math.sin(t) * h;
      pts.push([d[0] * r + a[0] * c + b[0] * s, d[1] * r + a[1] * c + b[1] * s, d[2] * r + a[2] * c + b[2] * s]);
    }
    face(geo, pts, color, emissive, [-d[0], -d[1], -d[2]]);
  };
  // A long thin diamond through `d`, `len` long and turned `spin` from its circle of declination: a bright star's ray.
  const spike = (geo, d, r, len, wide, color, spin) => {
    const [a, b] = across(d), c = Math.cos(spin), s = Math.sin(spin);
    const u = [a[0] * c + b[0] * s, a[1] * c + b[1] * s, a[2] * c + b[2] * s], v = [b[0] * c - a[0] * s, b[1] * c - a[1] * s, b[2] * c - a[2] * s];
    const at = (p, q) => [d[0] * r + u[0] * p + v[0] * q, d[1] * r + u[1] * p + v[1] * q, d[2] * r + u[2] * p + v[2] * q];
    face(geo, [at(len / 2, 0), at(0, wide / 2), at(-len / 2, 0), at(0, -wide / 2)], color, 1, [-d[0], -d[1], -d[2]]);
  };

  // The sky in its own frame, `radius` out: as `stars`, the named stars sized and coloured by magnitude, the brightest
  // with a halo and rays; `filler` faint stars (scattered, not catalogued); the Milky Way as `clouds` of dim light along
  // the galactic plane, brightest toward Sagittarius, with specks over them; and, where asked, the constellation
  // figures as thin lines; and as `names` (or null), their names in the island's pixel letters, upright for the sky as
  // it stood at `at`, a mesh of their own so Canvas 2D can sort them over the clouds. Sizes are the Planetarium's at its
  // own radius, grown with the sky's (or by `grow`) so a star keeps its size in the eye; nothing south of `minDec` is
  // built (by default, what never rises over London). Each layer keeps its own radius, the nearer over the farther.
  const skyGeometry = ({ radius, at = Date.now(), figures = true, labels = true, filler = 1100, clouds = 1100, specks = 600, seed = 77, grow = radius / 7.86, minDec = NEVER }) => {
    const geo = blank(), r = rng(seed), index = new Map();
    const rises = (d) => Math.asin(clamp(d[1], -1, 1)) / DEG > minDec;
    for (const [name, ra, dec, mag, k] of STARS) {
      const d = dirOf(ra * 15, dec);
      if (!rises(d)) continue;
      index.set(name, d);
      const size = clamp(0.1 - mag * 0.017, 0.026, 0.115) * grow, bright = clamp(1.12 - mag * 0.12, 0.55, 1), col = STAR_COLOR[k];
      if (mag < 1.6) disc(geo, d, radius * 1.0024, size * 2.5, 8, scale(col, 0.16 * bright), 1, 0.2);
      if (mag < 0.6) for (const spin of [0, Math.PI / 2]) spike(geo, d, radius * 1.0012, size * 3.6, size * 0.28, scale(col, 0.5), spin + 0.3);
      disc(geo, d, radius, size, mag < 2.5 ? 6 : 4, scale(col, bright), 1, 0.3);
    }
    // Faint background stars: filler, as the mock-up's were, kept dim so the real ones lead.
    for (let i = 0; i < filler; i++) {
      let x, y, z, l;
      do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; l = Math.hypot(x, y, z); } while (l > 1 || l < 0.1);
      const d = [x / l, y / l, z / l], size = (0.014 + r() * 0.012) * grow, b = 0.26 + r() * 0.3, warm = r() > 0.8, spin = r() * TAU;
      if (rises(d)) disc(geo, d, radius * 1.003, size, 4, scale([warm ? 1 : 0.88, 0.92, warm ? 0.82 : 1.04], b), 1, spin);
    }
    // The Milky Way: clouds of dim light round the galactic plane, thicker and brighter toward its centre.
    const ngp = dirOf(192.85948, 27.12825), gc = dirOf(266.40499, -28.93617), gy = cross(ngp, gc);
    const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(TAU * r());
    const along = (l, b) => {
      const cb = Math.cos(b), sb = Math.sin(b), cl = Math.cos(l), sl = Math.sin(l);
      return unit(cb * cl * gc[0] + cb * sl * gy[0] + sb * ngp[0], cb * cl * gc[1] + cb * sl * gy[1] + sb * ngp[1], cb * cl * gc[2] + cb * sl * gy[2] + sb * ngp[2]);
    };
    for (let i = 0; i < clouds + specks; i++) {
      let l;
      do { l = (r() * 2 - 1) * Math.PI; } while (r() > 0.35 + 0.65 * Math.exp(-(l * l) / (2 * 0.7 * 0.7)));
      const core = Math.exp(-(l * l) / 0.5), spread = 0.05 + 0.07 * core, b = gauss() * spread, d = along(l, b);
      const fade = Math.exp(-(b * b) / (2 * spread * spread)) * (0.65 + 0.35 * core), k = r(), size = r(), spin = r() * TAU;
      if (d[1] < Math.sin((minDec - 4) * DEG)) continue;
      // A cloud is wider and dimmer the further it lies from the plane, and drawn nearer the brighter it is; a speck is
      // one of the band's unresolved stars over its clouds.
      if (i < clouds) disc(geo, d, radius * (1.012 - 0.006 * fade), (0.16 + size * 0.26) * (1 + 0.45 * core) * grow, 7, scale([0.78, 0.86, 1.15], (0.06 + k * 0.05) * (0.4 + 0.8 * fade)), 1, spin);
      else disc(geo, d, radius * 1.004, (0.012 + size * 0.01) * grow, 4, scale([0.82, 0.88, 1], 0.16 + 0.22 * fade * k), 1, spin);
    }
    // The figures: lines a little behind the stars, stopping short of each so the stars stand clear of them.
    if (figures) {
      for (const [a, b] of FIGURES) {
        const A = index.get(a), B = index.get(b);
        if (!A || !B) continue;
        const ang = Math.acos(clamp(dot(A, B), -1, 1)), gap = 0.011, span = ang - 2 * gap;
        if (span <= 0) continue;
        const n = Math.max(1, Math.ceil(span / (5 * DEG))), sin = Math.sin(ang) || 1, base = geo.verts.length / 3, rr = radius * 1.006;
        for (let s = 0; s <= n; s++) {
          const t = (gap + span * s / n) / ang, ka = Math.sin((1 - t) * ang) / sin, kb = Math.sin(t * ang) / sin;
          geo.verts.push((A[0] * ka + B[0] * kb) * rr, (A[1] * ka + B[1] * kb) * rr, (A[2] * ka + B[2] * kb) * rr);
          if (s) geo.lines.push({ i: [base + s - 1, base + s], color: FIGURE_COLOR, emissive: 0 });
        }
      }
    }
    // The names, upright for a viewer under the sky at `at`: each word's up toward the zenith then, across its star.
    const names = labels ? blank() : null;
    if (labels) {
      const zenith = dirOf(lst(at) / DEG, LONDON.lat);
      for (const [text, star, dy] of LABELS) {
        const d = index.get(star);
        if (!d) continue;
        const k = dot(zenith, d);
        let u = [zenith[0] - d[0] * k, zenith[1] - d[1] * k, zenith[2] - d[2] * k];
        if (Math.hypot(u[0], u[1], u[2]) < 0.05) u = [-d[0] * d[1], 1 - d[1] * d[1], -d[2] * d[1]];
        u = unit(u[0], u[1], u[2]);
        const side = cross(u, d), rr = radius * 0.999, off = dy * 0.07;
        const kind = text === "SUMMER TRIANGLE" ? "asterism" : STARS.some((s) => s[0].toUpperCase() === text) ? "star" : "figure";
        const word = litWord(text, 0.014, LABEL_COLOR[kind], 0.85), v = word.verts, base = names.verts.length / 3;
        // The word faces -z and reads toward -x seen from the room: its x along `side`, its y along `u`, its z outward.
        for (let i = 0; i < v.length; i += 3) {
          const x = v[i], y = v[i + 1] + off, z = v[i + 2];
          names.verts.push(d[0] * rr + side[0] * x + u[0] * y + d[0] * z, d[1] * rr + side[1] * x + u[1] * y + d[1] * z, d[2] * rr + side[2] * x + u[2] * y + d[2] * z);
        }
        for (const f of word.faces) names.faces.push({ ...f, i: f.i.map((n) => n + base) });
      }
    }
    geo.lineWidth = 1.3;
    return { stars: noShadow(geo), names: names && noShadow(names) };
  };
  // The room's sky, built once a page (its names upright for when it was built), cut at the horizon so the stars that
  // have set stay behind the wall's line.
  const sky = perRoom((id) => {
    const L = ROOMS.layout(id), built = skyGeometry({ radius: L.R * 0.982 });
    built.stars.clipPlane = built.names.clipPlane = [0, -1, 0, L.c + 0.015];
    return built;
  });

  // ---------- the skyline round the horizon ----------
  // The island's skyline in silhouette, drawn as the mock-up's canvas was (4096 by 256 pixels round the whole horizon
  // from azimuth -180, the bottom row the horizon and the top 11 degrees up) and stood a little inside the dome, so
  // the stars set behind it. Nothing stands where the doorway's bay covers it.
  const SKY_W = 4096, SKY_H = 256, INK = [4, 5, 10];
  const skyline = perRoom((id) => {
    const L = ROOMS.layout(id), geo = blank(), r = rng(5), inset = 0.955;
    const azOf = (x) => x / SKY_W * 360 - 180, open = (x) => Math.abs(azOf(x)) < 158;
    const P = (x, y) => { const q = ROOMS.onSphere(L, azOf(x) * DEG, (SKY_H - y) / SKY_H * 11 * DEG, inset); return [q.x, q.y, q.z]; };
    const shape = (pts) => {
      if (!pts.every(([x]) => open(x))) return;
      const q = pts.map(([x, y]) => P(x, y));
      let cx = 0, cy = 0, cz = 0;
      for (const p of q) { cx += p[0]; cy += p[1] - L.c; cz += p[2]; }
      face(geo, q, INK, 1, [-cx, -cy, -cz]);
    };
    // A stroke along a quadratic curve as a ribbon of quads, `w0` pixels wide at its start and `w1` at its end.
    const stroke = (x0, y0, cx, cy, x1, y1, w0, w1, n) => {
      let prev = null;
      for (let s = 0; s <= n; s++) {
        const t = s / n, mt = 1 - t, x = mt * mt * x0 + 2 * mt * t * cx + t * t * x1, y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
        const tx = 2 * mt * (cx - x0) + 2 * t * (x1 - cx), ty = 2 * mt * (cy - y0) + 2 * t * (y1 - cy), l = Math.hypot(tx, ty) || 1, w = (w0 + (w1 - w0) * t) / 2;
        const a = [x - ty / l * w, y + tx / l * w], b = [x + ty / l * w, y - tx / l * w];
        if (prev) shape([prev[0], prev[1], b, a]);
        prev = [a, b];
      }
    };
    const top = (x) => SKY_H - 46 - 22 * Math.sin(x / 260) - 14 * Math.sin(x / 97 + 1) - (Math.abs(x - 1300) < 260 ? 70 * Math.cos((x - 1300) / 260 * Math.PI / 2) : 0);
    for (let x = 0; x < SKY_W; x += 16) shape([[x, SKY_H], [x + 16, SKY_H], [x + 16, top(x + 16)], [x, top(x)]]);
    const palm = (x, h, lean) => {
      const base = SKY_H - 50, tx = x + lean, ty = base - h;
      stroke(x, SKY_H - 10, x, SKY_H - 30, x, base, 7, 7, 1);
      stroke(x, base, x + lean * 0.2, base - h * 0.6, tx, ty, 7, 5, 6);
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI + k * Math.PI / 6 + (r() - 0.5) * 0.3, len = 34 + r() * 18;
        stroke(tx, ty, tx + Math.cos(a) * len * 0.6, ty + Math.sin(a) * len * 0.6 - 12, tx + Math.cos(a) * len, ty + Math.sin(a) * len * 0.5 + 14, 5, 1.5, 4);
      }
    };
    for (let i = 0; i < 26; i++) palm(80 + i * 157 + r() * 60, 60 + r() * 60, (r() - 0.5) * 40);
    for (const x of [700, 2300, 3300]) {
      shape([[x - 40, SKY_H - 60], [x, SKY_H - 100], [x + 40, SKY_H - 60]]);
      shape([[x - 30, SKY_H - 32], [x + 30, SKY_H - 32], [x + 30, SKY_H - 62], [x - 30, SKY_H - 62]]);
    }
    shape([[2960, SKY_H - 76], [3090, SKY_H - 76], [3090, SKY_H - 150], [2960, SKY_H - 150]]);
    for (const x of [2985, 3055]) shape([[x, SKY_H - 40], [x + 10, SKY_H - 40], [x + 10, SKY_H - 80], [x, SKY_H - 80]]);
    return noShadow(geo);
  });
  // The compass points under the skyline, in amber (S is over the door).
  const COMPASS = [[0, "N"], [45, "NE"], [90, "E"], [135, "SE"], [-135, "SW"], [-90, "W"], [-45, "NW"]];

  // ---------- the furniture ----------
  // A lounger, its foot toward -z: base, seat, a back laid well back with a pillow, the footrest on a leg, and an
  // amber strip at its foot.
  const lounger = own(() => merge(
    box({ w: 0.86, h: 0.26, d: 0.9, color: "#1f1c19", offset: { y: 0.13 } }),
    box({ w: 0.82, h: 0.12, d: 0.86, color: "#273041", offset: { y: 0.32 } }),
    moved(turnedX(box({ w: 0.82, h: 0.8, d: 0.15, color: "#273041" }), 0.62), 0, 0.62, 0.52),
    moved(turnedX(box({ w: 0.6, h: 0.16, d: 0.1, color: "#2f3a52" }), 0.62), 0, 0.9, 0.6),
    moved(turnedX(box({ w: 0.78, h: 0.1, d: 0.46, color: "#273041" }), -0.25), 0, 0.3, -0.62),
    box({ w: 0.5, h: 0.22, d: 0.06, color: "#1a1816", offset: { y: 0.11, z: -0.78 } }),
    box({ w: 0.84, h: 0.02, d: 0.04, color: AMBER, emissive: 0.9, offset: { y: 0.02, z: -0.44 } })
  ));
  // The projector's turning head, about its middle on the polar axis (+y here): the axis, the open cage round it, and
  // the two star balls on their necks, each studded with its little lenses.
  const projectorHead = own(() => {
    const lenses = blank(), parts = [], steel = "#3a3a44", cage = "#6a5f55";
    parts.push(RM.helpers.cylinder(0.12, 0.12, 2.7, steel, 16));
    for (let k = 0; k < 10; k++) { const a = k * TAU / 10; parts.push(box({ w: 0.03, h: 1, d: 0.03, color: cage, offset: { x: 0.34 * Math.cos(a), z: 0.34 * Math.sin(a) } })); }
    for (const y of [-0.5, 0.5]) parts.push(moved(BL.models.torus(0.34, 0.018, cage, 0, 24, 4), 0, y, 0));
    for (const sgn of [1, -1]) {
      const cy = 1.35 * sgn, rr = rng(sgn > 0 ? 8 : 9);
      parts.push(moved(RM.helpers.ballGeo(0.5, "#26262e", 22), 0, cy, 0));
      parts.push(moved(RM.helpers.cylinder(0.2, 0.26, 0.12, "#2e2e36", 16), 0, cy * 0.66, 0));
      for (let i = 0; i < 90; i++) {
        const d = unit(rr() * 2 - 1, rr() * 2 - 1, rr() * 2 - 1), [a, b] = across(d), h = 0.012;
        const corner = (k) => { const t = k * TAU / 6, x = Math.cos(t) * h, y = Math.sin(t) * h; return [d[0] * 0.505 + a[0] * x + b[0] * y, d[1] * 0.505 + cy + a[1] * x + b[1] * y, d[2] * 0.505 + a[2] * x + b[2] * y]; };
        face(lenses, [0, 1, 2, 3, 4, 5].map(corner), [255, 217, 160], 1, d);
      }
    }
    return merge(...parts, lenses);
  });

  // ---------- the room ----------
  // Loungers in two rings round the projector, facing out, with a gap toward the doorway: the outer ring's gap
  // widened until its first loungers stand clear of the doorway's approach.
  const RINGS = [{ r: 3.2, pitch: 1.55 }, { r: 5.5, pitch: 1.55 }];
  const LOUNGER = { z0: -0.86, z1: 0.62, hx: 0.45, seat: 0.42, up: 1.25 };
  const ringOf = (L, ring) => {
    const clear = (b) => {
      const h = Math.atan2(-Math.sin(b), -Math.cos(b)), cx = ring.r * Math.sin(b), cz = ring.r * Math.cos(b);
      for (const [lx, lz] of [[-LOUNGER.hx, LOUNGER.z0], [LOUNGER.hx, LOUNGER.z0], [-LOUNGER.hx, LOUNGER.z1], [LOUNGER.hx, LOUNGER.z1]]) {
        const x = cx + lx * Math.cos(h) + lz * Math.sin(h), z = cz - lx * Math.sin(h) + lz * Math.cos(h);
        if (Math.hypot(x, z - L.doorZ) < 3 || z > L.doorZ - 3 && Math.abs(x) < 3) return false;
      }
      return true;
    };
    for (let gap = 1.15 / ring.r; ; gap += 0.5 * DEG) {
      const count = Math.floor((TAU - 2 * gap) * ring.r / ring.pitch), step = (TAU - 2 * gap) / count;
      if (clear(gap + step / 2)) return Array.from({ length: count }, (_, k) => gap + (k + 0.5) * step);
    }
  };
  // The console beside the aisle, its operator on the doorway's side looking over it at the projector, the aisle's
  // middle left clear to the projector's ring.
  const CONSOLE = { x: 0.92, z: 1.7, w: 1, d: 0.6, tilt: 0.35 };
  const SCREEN = { w: 0.42, h: 0.26, pw: 460, ph: 280 };
  // The time-lapse: how far the sky runs ahead of now (ms) and whether it is running; the console's screen reads it.
  const SKY = { offset: 0, lapse: false };
  const LAPSE = 3600 * 1000;
  const two = (n) => String(Math.floor(n)).padStart(2, "0");
  const paintScreen = (ctx, now) => {
    const W = SCREEN.pw, H = SCREEN.ph, t = now + SKY.offset, s = lst(t) / DEG / 15, d = new Date(t);
    ctx.fillStyle = "#07090d"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#3a2a10"; ctx.lineWidth = 4; ctx.strokeRect(6, 6, W - 12, H - 12);
    pix(ctx, "LONDON 51.5N 0.1W", W / 2, 40, 22, "#ffb04d");
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#8fa6d0"; ctx.font = font(500, 22, MONO); ctx.fillText("LOCAL SIDEREAL TIME", W / 2, 88);
    ctx.fillStyle = "#e9eef8"; ctx.font = font(600, 64, MONO); ctx.fillText(`${two(s)}:${two(s % 1 * 60)}`, W / 2, 146);
    ctx.fillStyle = "#a89c8b"; ctx.font = font(500, 24, MONO);
    ctx.fillText(`${d.toISOString().slice(0, 10)} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())} UTC`, W / 2, 202);
    pix(ctx, SKY.lapse ? "TIME-LAPSE 1 HOUR A SECOND" : SKY.offset ? "BACK TO NOW" : "THE SKY NOW", W / 2, 246, 16, SKY.lapse ? "#ffb04d" : "#4fd08a");
  };
  const TAP = "Projector console · tap to run the night forward";

  // ---------- its door ----------
  // A night door: midnight leaves, each with a constellation (Orion on the left, the Plough on the right), its stars
  // lit and joined by faint lines over a scatter of dim ones, in a silver frame strung round with pale stars that
  // twinkle.
  const STAR_FIGURES = {
    "-1": { stars: [[-0.34, 2.55], [0.3, 2.48], [-0.14, 1.92], [0, 1.86], [0.14, 1.8], [-0.3, 1.2], [0.36, 1.26]], lines: [[0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6]] },
    "1": { stars: [[-0.5, 2.62], [-0.18, 2.5], [0.1, 2.44], [0.34, 2.24], [0.46, 1.8], [0.08, 1.72], [0.02, 2.14]], lines: [[0, 1], [1, 2], [2, 3], [3, 6], [6, 5], [5, 4], [4, 3]] }
  };
  const door = {
    casing: "#0d1226", frame: "#9aa6b8", header: "#0a0e1d", word: "#9fd8ff", strip: "#5b8cff", chain: false,
    leaf: "#121a36", seam: "#070a16", plate: "#0a0e1d", face: "#9fd8ff", mark: "#0a0e1d",
    leafFace(side, H) {
      const fig = STAR_FIGURES[side], r = RM.paintKit.rng(side < 0 ? 11 : 12);
      for (let i = 0; i < 26; i++) H.diamond((r() - 0.5) * 1.3, 0.3 + r() * 2.8, 0.008 + r() * 0.01, "#6f7fb0", 0.5);
      for (const [a, b] of fig.lines) H.line(fig.stars[a][0], fig.stars[a][1], fig.stars[b][0], fig.stars[b][1], 0.008, "#3d5a9a", 0.6, 1);
      for (const [x, y] of fig.stars) H.diamond(x, y, 0.03, "#e8f2ff", 1, 2);
    }
  };
  const doorTrim = (K, L) => { RM.doorBulbs(K, L, "#cfe6ff", 0.36, 0.03); };

  const plan = (K, L) => {
    doorTrim(K, L);
    K.wallColor("#15161b");
    K.render({ sky: [0.13, 0.16, 0.26], ground: [0.05, 0.05, 0.06], ambientFloor: 0.2, bloomStrength: 0.9 });
    // The dome under the stars: night, with the town's glow low over the horizon.
    K.dome((ctx, D) => { D.sky(ctx, [[90, "#010206"], [45, "#02040a"], [11, "#050812"], [2.75, "#0e1220"], [0, "#261e1c"]]); });
    // The floor: dark tiles, the chain from the doors to the ring round the projector.
    K.floor((ctx, F) => { F.tiles("#17181c", "#141519"); F.ring(1.55, 2.2); F.path(0, L.doorZ, 0, 2.2); });
    // The skyline and the compass points under it, a mesh of their own so Canvas 2D draws them over the hills.
    K.add(skyline(L.id), 0, 0, 0, { glow: true });
    K.node(null, (k) => {
      for (const [az, text] of COMPASS) {
        const p = ROOMS.onSphere(L, az * DEG, 1.05 * DEG, 0.948);
        k.add(litWord(text, 0.026, AMBER, 0.85), p.x, p.y, p.z, { ry: Math.PI - az * DEG, glow: true });
      }
    }, 0, 0, 0, { glow: true, depthBias: RM.MARK_BIAS });
    // The sky: tilted so its pole stands at London's latitude over the north, turned about it by the sidereal time.
    K.node("skyTilt", null, 0, L.c, 0, { rx: TILT });
    K.node("skySpin", null, 0, 0, 0, { parent: "skyTilt", ry: -lst(Date.now()) });
    K.node("stars", sky(L.id).stars, 0, 0, 0, { parent: "skySpin", glow: true });
    K.node("names", sky(L.id).names, 0, 0, 0, { parent: "skySpin", glow: true, depthBias: RM.MARK_BIAS });
    // The projector: a pedestal and fork holding the axis at the sky's middle, its head turning with the sky.
    K.cyl(0.42, 0.55, 1.1, "#24242a", 0, 0.55, 0, { seg: 24 });
    K.torus(0.5, 0.02, AMBER, 0, 0.04, 0, { emissive: 0.8, glow: true, seg: 32 });
    for (const x of [-0.38, 0.38]) K.box(0.16, 0.9, 0.5, "#2e2e36", x, 1.3, 0);
    K.node("projector", projectorHead(), 0, 0, 0, { parent: "skySpin", target: { kind: "projector", tip: "Star projector · tap to run the night forward", radius: 1.5 } });
    K.solid({ x: 0, z: 0, r: 0.62 });
    K.solid({ x: 0, z: 0.84, r: 0.56 });
    K.solid({ x: 0, z: -0.84, r: 0.56, below: 2.1 });
    // The console: a dark desk with an amber kick strip, its panel sloped toward the operator with lit keys and the
    // screen telling the sky's time.
    K.node("console", (k) => {
      k.box(CONSOLE.w, 0.72, CONSOLE.d, "#23201d", 0, 0.36, 0);
      k.box(CONSOLE.w - 0.06, 0.03, 0.03, AMBER, 0, 0.05, CONSOLE.d / 2 + 0.005, { emissive: 0.85 });
    }, CONSOLE.x, 0, CONSOLE.z, { target: { kind: "console", tip: TAP, radius: 0.75 } });
    K.solid({ x: CONSOLE.x, z: CONSOLE.z, hx: CONSOLE.w / 2, hz: CONSOLE.d / 2 });
    const P = K.group(CONSOLE.x, 0.75, CONSOLE.z + 0.02, 0, CONSOLE.tilt);
    P.box(CONSOLE.w, 0.05, 0.56, "#2a2622", 0, 0, 0);
    P.box(CONSOLE.w - 0.04, 0.012, 0.02, AMBER, 0, 0.03, 0.27, { emissive: 0.9, glow: true });
    const KEYS = [AMBER, "#4fd08a", AMBER, "#e0533d", "#8fb4ff", AMBER];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) P.box(0.045, 0.02, 0.045, KEYS[(i + j * 2) % KEYS.length], 0.1 + i * 0.065, 0.03, -0.12 + j * 0.09, { emissive: 0.85, glow: true });
    P.box(SCREEN.w + 0.04, 0.02, SCREEN.h + 0.04, "#0c0c0d", -0.24, 0.028, -0.02);
    const sp = P.at(-0.24, 0.04, -0.02);
    K.live({ tip: TAP, flat: { x: sp.x, y: sp.y, z: sp.z, rx: CONSOLE.tilt - Math.PI / 2, ry: 0, w: SCREEN.w, h: SCREEN.h }, w: SCREEN.pw, h: SCREEN.ph,
      key: (f, now) => `${SKY.lapse ? "L" : SKY.offset ? "B" : "N"}|${Math.floor((now + SKY.offset) / 60000)}`, paint: (ctx, f, now) => paintScreen(ctx, now) });
    // The loungers, each a seat lying back toward the dome; standing up steps off its foot.
    for (const ring of RINGS) for (const b of ringOf(L, ring)) {
      const x = ring.r * Math.sin(b), z = ring.r * Math.cos(b), h = Math.atan2(-x, -z);
      const seat = K.seat(x, z, h + Math.PI, LOUNGER.seat, 0, -LOUNGER.up), G = K.group(x, 0, z, h);
      K.node(null, lounger(), x, 0, z, { ry: h, target: { kind: "chair", tip: "Lounger", radius: 0.8, index: seat.index } });
      // Two circles along its length: round ends a body slides past, whatever way the lounger is turned.
      for (const lz of [LOUNGER.z0 + LOUNGER.hx, LOUNGER.z1 - LOUNGER.hx]) G.solid({ x: 0, z: lz, r: LOUNGER.hx });
    }
    // The light: a dim blue from the sky, the console's amber, the projector's pedestal and a soft fill.
    K.light(0, 5.2, -2.8, 14, 0.18, 0.23, 0.38);
    K.light(CONSOLE.x, 1.3, CONSOLE.z + 0.6, 3, 0.7, 0.42, 0.12);
    K.light(0, 0.5, 0, 3, 0.36, 0.24, 0.12);
    K.light(2.4, 4, 3.2, 12, 0.16, 0.15, 0.15);
  };

  // The sky turns by the sidereal time: now or, with the time-lapse running, an hour further every second; stopped,
  // it eases back to now the short way round. Nothing here allocates.
  const animate = (nodes) => {
    const spin = nodes.skySpin, stars = RM.bulbsOf(nodes);
    SKY.offset = 0; SKY.lapse = false;
    return {
      update(dt, t) {
        // The door's stars twinkle, each on its own beat.
        for (let i = 0; i < stars.length; i++) stars[i].glow = 0.55 + 0.45 * Math.sin(t * (1.3 + (i % 5) * 0.37) + i * 2.1);
        if (SKY.lapse) SKY.offset += dt * LAPSE;
        else if (SKY.offset) {
          SKY.offset -= SKY.offset * Math.min(1, dt * 1.4);
          if (Math.abs(SKY.offset) < 1000) SKY.offset = 0;
        }
        spin.rotation.y = -lst(Date.now() + SKY.offset);
      },
      tap(owner, hud) {
        if (owner.kind !== "projector" && owner.kind !== "console" && owner.kind !== "live") return false;
        SKY.lapse = !SKY.lapse;
        if (!SKY.lapse) SKY.offset = ((SKY.offset % SIDEREAL_DAY) + SIDEREAL_DAY * 1.5) % SIDEREAL_DAY - SIDEREAL_DAY / 2;
        hud.toast(SKY.lapse ? "Time-lapse · the night runs an hour a second" : "Back to the sky over London now");
        return true;
      }
    };
  };
  BL.timechainRoomKinds.planetarium = {
    plan, animate, door, steps: (L) => [() => sky(L.id), () => skyline(L.id)],
    // The sky's builder and clock, shared with the Observatory's slit.
    sky: { build: skyGeometry, lst, TILT }
  };
})();
