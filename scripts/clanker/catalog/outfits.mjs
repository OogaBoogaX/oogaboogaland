// The catalog: every outfit and form the current gorillas wear (the survey of src/js, see catalog.md), each as make(ground)
// evaluated in the page and returning { old, new } roots: the current BL.agent dressed as its scene dresses it, and the
// new BL.clankerModel dressed by dress.js (painted outfits, refitted rigid pieces). Helpers are in HELP.
export const HELP = `
  window.__H = (() => { const D = window.__dress, S = BL.scene, M = BL.models, AM = BL.arcadeModels, FM = BL.factoryModels, HM = BL.hangarModels, BM = BL.blockModels;
    const old = (o = {}) => { const a = BL.agent.create({ groundAt: () => 0, managed: true, form: o.form || "ape", suitClip: o.suit != null ? BL.agent.suitClip({ x: 200, z: 200, ry: 0, floorY: 0 }) : null, suitColor: o.suit || 0 });
      for (let i = 0; i < 30; i++) a.poseManaged(0.05, 0, 0, 0, 0, 0, false, !!o.upright, "", o.motion || null); return a; };
    const OLDH = (() => { const a = old({ upright: true }); return D.height(a.root); })(), NEWH = (() => { const r = BL.clankerModel.rig(BL.clankerModel.sets.B, "ape"); BL.clankerModel.pose(r, 1, null, {}); return D.height(r.root); })();
    const SCALE = OLDH / NEWH;
    const neu = (o = {}) => { const r = BL.clankerModel.rig(BL.clankerModel.sets.B, o.form || "ape"); if (o.outfit) D.paint(r, o.outfit); BL.clankerModel.pose(r, o.upright ? 1 : 0, null, {}); r.root.scale = { x: SCALE, y: SCALE, z: SCALE }; S.updateWorld(r.root); return r; };
    const hat = (r, geometry, at = [0, 0.6, 0.05]) => D.hat(r.head, geometry, at);
    const vest = (r, geometry, opts) => { const n = S.createNode({ geometry: D.wrap(r, geometry, opts) }); S.addChild(r.abdomen, n); return n; };
    const belt = (r, k) => { const P = [["#1f1a17", "#b8913a"], ["#1f1a17", "#b8913a"], ["#1f1a17", "#b8913a"]][k]; const n = S.createNode({ geometry: D.belt(r, { color: P[0], brass: P[1] }) }); S.addChild(r.abdomen, n); return n; };
    // What a fist holds, as the new fist holds it (its middle at y -0.66, z -0.03 in the forearm's frame, its hole along x,
    // which hanging points ahead on the right forearm and behind on the left, the palm toward the thigh): a tool's handle
    // (built along +z, gripped at its origin) runs through the hole, the tool pointing ahead; the ticket roll sits in the
    // grip; the flask hangs by its neck; the tray (see tray) rests level across both fists.
    const FIST = { y: -0.66, z: -0.03, bottom: -0.761, top: -0.55 }, Q = BL.math.quat;
    const grip = (r, hand, geometry, kind) => { const right = hand === "foreR", n = S.createNode({ geometry });
      if (kind === "tool") { n.position = { x: 0, y: FIST.y, z: FIST.z }; n.rotation = { x: 0, y: right ? Math.PI / 2 : -Math.PI / 2, z: 0 }; }
      else if (kind === "roll") n.position = { x: (right ? 1 : -1) * 0.17, y: FIST.y - 0.03, z: FIST.z - 0.1 };
      else if (kind === "flask") { const bb = S.boundsOf(geometry); n.position = { x: 0, y: FIST.bottom + 0.06 - bb.max[1] * 0.85, z: FIST.z }; }
      S.addChild(r[hand], n); S.updateWorld(r.root); return n; };
    // both elbows bent by a (radians) about the body's sideways axis, forearms coming up ahead: the carry, as the game's
    // pose for the tray will
    const carry = (r, a) => { S.updateWorld(r.root); for (const h of ["foreR", "foreL"]) { const P = r[h].parent.world, R = [0, 1, 2].map((c) => { const l = Math.hypot(P[c * 4], P[c * 4 + 1], P[c * 4 + 2]); return [P[c * 4] / l, P[c * 4 + 1] / l, P[c * 4 + 2] / l]; });
        const B = r.abdomen.world, bl = Math.hypot(B[0], B[1], B[2]), ax = [B[0] / bl, B[1] / bl, B[2] / bl], k = R.map((col) => col[0] * ax[0] + col[1] * ax[1] + col[2] * ax[2]), s2 = Math.sin(a / 2), h2 = [k[0] * s2, k[1] * s2, k[2] * s2, Math.cos(a / 2)], q = r[h].quaternion;
        r[h].quaternion = [h2[3] * q[0] + h2[0] * q[3] + h2[1] * q[2] - h2[2] * q[1], h2[3] * q[1] - h2[0] * q[2] + h2[1] * q[3] + h2[2] * q[0], h2[3] * q[2] + h2[0] * q[1] - h2[1] * q[0] + h2[2] * q[3], h2[3] * q[3] - h2[0] * q[0] - h2[1] * q[1] - h2[2] * q[2]]; }
      S.updateWorld(r.root); };
    // the tray, level, its rim held between both fists (in the belly's frame)
    const tray = (r, geometry) => { S.updateWorld(r.root); const A = r.abdomen.world, sc = [0, 1, 2].map((m) => A[m * 4] ** 2 + A[m * 4 + 1] ** 2 + A[m * 4 + 2] ** 2);
      const at = (node, p) => { const W = node.world, w = [0, 1, 2].map((m) => W[m] * p[0] + W[4 + m] * p[1] + W[8 + m] * p[2] + W[12 + m]), d = [w[0] - A[12], w[1] - A[13], w[2] - A[14]]; return [0, 1, 2].map((m) => (A[m * 4] * d[0] + A[m * 4 + 1] * d[1] + A[m * 4 + 2] * d[2]) / sc[m]); };
      const a = at(r.foreR, [0, FIST.y, FIST.z]), b = at(r.foreL, [0, FIST.y, FIST.z]), n = S.createNode({ geometry, position: { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 - 0.03, z: (a[2] + b[2]) / 2 } });
      S.addChild(r.abdomen, n); S.updateWorld(r.root); return n; };
    return { old, neu, hat, vest, belt, grip, tray, carry, SCALE, OLDH, NEWH, D, S, M, AM, FM, HM, BM }; })();`;
const row = (name, label, body) => ({ name, label, make: `(ground) => { const H = window.__H, { S, M } = H; ${body} }` });
export const OUTFITS = [
  row("ape", "Fur (ape) form, on all fours: everywhere", `const a = H.old(), r = H.neu(); return { old: a.root, new: r.root, oldParts: a.parts, newRig: r };`),
  row("code", "Glyph (code) form, on all fours: Orbit, Drop, Rally, ghost hunt (x1.25), rage", `const a = H.old({ form: "code" }), r = H.neu({ form: "code" }); return { old: a.root, new: r.root, oldParts: a.parts, newRig: r };`),
  row("lab", "EntropyLab lab coat (inside the lab, upright)", `const a = H.old({ upright: true, motion: { lab: true } }), r = H.neu({ upright: true, outfit: "lab" }); return { old: a.root, new: r.root, oldParts: a.parts, newRig: r };`),
  ...[0, 1, 2].map((k) => row("suit" + k, "B.C.A. suit " + ["charcoal, burgundy tie", "navy, gold tie", "slate, green tie"][k], `const a = H.old({ upright: true, suit: ${k}, motion: { office: true, officeRise: 1 } }), r = H.neu({ upright: true, outfit: "suit${k}" }); H.vest(r, H.D.front(${k})); H.vest(r, H.D.tie(${k})); return { old: a.root, new: r.root, oldParts: a.parts, newRig: r };`)),
  row("factory", "Lightning Factory crew: hard hat (x0.72 in the game)", `const a = H.old(); S.addChild(a.parts.head, S.createNode({ geometry: H.FM.hardHat(), position: { x: 0, y: 0.6, z: 0.05 } })); const r = H.neu(); H.hat(r, H.FM.hardHat()); return { old: a.root, new: r.root, oldParts: a.parts, newRig: r };`),
  row("hangar", "Lightning Jet Hangar crew: hard hat and hi-vis vest (x0.86)", `const a = H.old(); S.addChild(a.parts.head, S.createNode({ geometry: H.FM.hardHat(), position: { x: 0, y: 0.6, z: 0.05 } })); S.addChild(a.parts.torso, S.createNode({ geometry: H.HM.vest() })); const r = H.neu({ outfit: "hivis" }); H.hat(r, H.FM.hardHat()); return { old: a.root, new: r.root, oldParts: a.parts, newRig: r };`),
  ...[["gamemaster", 0, 0, 1, "armR", 0, "ringmaster's hat, tailcoat, wrench"], ["attendant", 1, 1, -1, "armL", 0, "red cap, change apron"], ["mechanic", 2, 2, 1, "armL", 0, "goggled cap, tool belt, wrench"], ["runner", 3, 3, 2, "armL", 0, "paper cap, white apron, tray of drinks"], ["clerk", 1, 4, 3, "armL", 0, "red cap, staff vest, ticket roll"], ["keeper", 1, 4, 4, "armL", 0, "red cap, staff vest, feather duster"]].map(([id, hat, vest, prop, hand, , what]) =>
    row("arcade-" + id, "Ooga Arcade " + id + ": " + what + " (x0.72)", `const G = ${JSON.stringify([[0, -1.1, 0.12, false, Math.PI / 2], [0, -1.1, 0.12, false, Math.PI / 2], [-0.516, -1.1, 0.14, true, 0], [0, -1.1, 0.1, true, 0], [0, -1.1, 0.12, false, Math.PI / 2]])};
      const a = H.old({ upright: true }), P = a.parts; S.addChild(P.head, S.createNode({ geometry: H.AM.staffHat(${hat}) })); S.addChild(P.torso, S.createNode({ geometry: H.AM.staffVest(${vest}) }));
      if (${prop} >= 0) { const [x, y, z, , turn] = G[${prop}]; S.addChild(P["${hand}"], S.createNode({ position: { x, y, z }, rotation: { x: turn, y: 0, z: 0 }, geometry: H.AM.staffProp(${prop}) })); }
      const r = H.neu({ upright: true, outfit: "staff" }); H.hat(r, H.AM.staffHat(${hat}), [0, 0, 0]); H.vest(r, H.AM.staffVest(${vest}), ${vest} === 3 ? { straight: (x, y, z) => z > 0.34 && Math.abs(x) < 0.37 && y < 0.42 } : undefined); if (${prop} === 2) { H.carry(r, -1.1); H.tray(r, H.AM.staffProp(2)); } else if (${prop} >= 0) H.grip(r, "${hand === "armR" ? "foreR" : "foreL"}", H.AM.staffProp(${prop}), ${prop} === 3 ? "roll" : "tool");
      return { old: a.root, new: r.root, oldParts: a.parts, newRig: r };`)),
  row("hockey", "Air hockey bot: ringmaster's hat (x0.72)", `const a = H.old({ upright: true }); S.addChild(a.parts.head, S.createNode({ geometry: H.AM.staffHat(0) })); const r = H.neu({ upright: true }); H.hat(r, H.AM.staffHat(0), [0, 0, 0]); return { old: a.root, new: r.root, oldParts: a.parts, newRig: r };`),
  row("poker", "Ember Den poker dealer: jacket, shirt, gold tie, sleeves, cuffs (x1.16)", `const a = H.old({ upright: true }), b = (w, h, d, c, y, z = 0) => M.box({ w, h, d, color: c, offset: { y, z } });
      S.addChild(a.parts.torso, S.createNode({ geometry: M.merge(b(0.92, 0.96, 0.66, "#292f33", 0.49)) })); for (const arm of [a.parts.armR, a.parts.armL]) S.addChild(arm, S.createNode({ geometry: b(0.4, 0.78, 0.43, "#292f33", -0.29, 0.025) }), S.createNode({ geometry: b(0.41, 0.12, 0.44, "#e6e1ce", -0.73, 0.025) }));
      const r = H.neu({ upright: true, outfit: "poker" }); return { old: a.root, new: r.root, oldParts: a.parts, newRig: r };`),
  row("clanktown", "Block Frenzy, Clanktown: clank arm and red visor (x1.35)", `const a = H.old(); S.addChild(a.parts.armR, S.createNode({ geometry: H.BM.clankArm(9) })); S.addChild(a.parts.head, S.createNode({ geometry: H.BM.clankVisor(9) }));
      const r = H.neu(); const fb = H.D.box(r.foreR.geometry); S.addChild(r.foreR, S.createNode({ geometry: H.BM.clankArm(9), position: { x: 0, y: (fb.min[1] + fb.max[1]) / 2 + 0.81 - 0.1, z: 0 }, scale: { x: 1.05, y: 1, z: 1.05 } }));
      const hb = H.D.box(r.head.geometry); S.addChild(r.head, S.createNode({ geometry: H.BM.clankVisor(9), position: { x: 0, y: 0.42 - 0.39, z: hb.max[2] - 0.05 - 0.48 } })); return { old: a.root, new: r.root, oldParts: a.parts, newRig: r };`),
  row("flask", "EntropyLab worker carrying a flask (lab coat, upright)", `const a = H.old({ upright: true, motion: { lab: true } }); S.addChild(a.parts.armL, S.createNode({ geometry: BL.agent.labFlaskGeometry(), position: { x: 0, y: -1.09, z: 0.14 } }));
      const r = H.neu({ upright: true, outfit: "lab" }); H.grip(r, "foreL", BL.agent.labFlaskGeometry(), "flask"); return { old: a.root, new: r.root, oldParts: a.parts, newRig: r };`)
];
