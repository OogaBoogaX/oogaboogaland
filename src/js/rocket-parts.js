// Ooga Orbit parts: catalog, stacking rules, the stages a stack splits into, and the builder's numbers.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const G0 = 0.6;
  // Units: h/r world units, dry mass in tons, fuel counted apart in `fuel`, thrust a force, `ve` exhaust speed.
  // `stability` is fins against the stack's wish to flip, `ablate` a shield's burn reserve, `heatTol` pod heat.
  const PARTS = [
    { id: "stickpod", kind: "pod", name: "Stick Cone Pod", note: "Sticks lashed in a cone. One Ooga, one leaf chute.", h: 1.9, r: 0.95, dry: 1.1, heatTol: 1, price: 120 },
    { id: "gourdpod", kind: "pod", name: "Gourd Pod", note: "Light and round. Runs hot.", h: 1.6, r: 0.85, dry: 0.7, heatTol: 0.62, price: 90 },
    { id: "leafshield", kind: "shield", name: "Banana Leaf Shield", note: "Light. Burns away fast.", h: 0.22, r: 0.98, dry: 0.08, ablate: 1, price: 20 },
    { id: "mudshield", kind: "shield", name: "Mud Pack Shield", note: "Heavy. Slow to burn through.", h: 0.32, r: 1, dry: 0.3, ablate: 2.6, price: 25 },
    { id: "stoneshield", kind: "shield", name: "Flat Stone Shield", note: "Nearly fireproof. Very heavy.", h: 0.3, r: 1, dry: 0.75, ablate: 6, price: 30 },
    { id: "nut", kind: "tank", name: "Nut Pod", note: "A little fuel in a shell.", h: 0.8, r: 0.55, dry: 0.08, fuel: 0.7, price: 15 },
    { id: "coconut", kind: "tank", name: "Big Coconut", note: "Round, full, cheap.", h: 1.2, r: 0.75, dry: 0.2, fuel: 2, price: 30 },
    { id: "barrel", kind: "tank", name: "Barrel", note: "The body of any good rocket.", h: 1.7, r: 0.8, dry: 0.42, fuel: 3.4, price: 30 },
    { id: "bigbarrel", kind: "tank", name: "Big Barrel", note: "Holds a lake of banana mash.", h: 2.5, r: 1, dry: 0.85, fuel: 7.5, price: 55 },
    { id: "pot", kind: "engine", name: "Fire Pot", note: "Clay pot, steady flame.", h: 0.9, r: 0.7, dry: 0.45, thrust: 9, ve: 40, price: 40 },
    { id: "jug", kind: "engine", name: "Volcano Jug", note: "Loud, strong, thirsty.", h: 1.3, r: 0.95, dry: 1.1, thrust: 24, ve: 34, price: 90 },
    { id: "tusk", kind: "engine", name: "Tusk Nozzle", note: "Weak push, sips fuel. Best up high.", h: 1, r: 0.55, dry: 0.3, thrust: 4.5, ve: 55, price: 70 },
    { id: "bamboo", kind: "engine", name: "Bamboo Firecracker", note: "Packed with powder. Cannot throttle.", h: 2.6, r: 0.5, dry: 0.4, fuel: 2.2, thrust: 14, ve: 28, solid: true, price: 25 },
    { id: "vine", kind: "sep", name: "Vine Knot", note: "Cuts a spent stage loose.", h: 0.35, r: 0.8, dry: 0.08, price: 10 },
    { id: "feathers", kind: "fins", name: "Feather Fins", note: "Keeps the nose pointed.", h: 0.9, r: 0.62, dry: 0.12, stability: 1, price: 20 },
    { id: "leaffins", kind: "fins", name: "Leaf Fins", note: "A little steadier. A little lighter.", h: 0.7, r: 0.6, dry: 0.05, stability: 0.5, price: 12 }
  ];
  const BY_ID = new Map(PARTS.map((p) => [p.id, p]));
  const KINDS = ["pod", "shield", "engine", "tank", "sep", "fins"];
  const KIND_NAMES = { pod: "Pods", shield: "Heat shields", engine: "Engines", tank: "Fuel", sep: "Separators", fins: "Fins" };
  const MAX_PARTS = 16;
  // FLIP 0.6: the stack's own wish to flip in the air, which fin stability pays back.
  const FLIP = 0.6;
  // TOP_DV 26: the speed a climb to the Sky Top costs, for the builder's gauge.
  const TOP_DV = 26;
  // Preset stacks are listed bottom to top; the first preset is ready to fly.
  const PRESETS = [
    { name: "Ooga One", stack: ["jug", "feathers", "bigbarrel", "vine", "pot", "barrel", "vine", "tusk", "coconut", "vine", "mudshield", "stickpod"] },
    { name: "Firecracker", stack: ["bamboo", "leaffins", "vine", "bamboo", "vine", "tusk", "bigbarrel", "vine", "leafshield", "stickpod"] },
    { name: "Hopper", stack: ["pot", "feathers", "barrel", "leafshield", "gourdpod"] }
  ];
  const partOf = (id) => BY_ID.get(id);
  // Sanitize anything storage hands back: known ids only, capped at MAX_PARTS.
  const sanitize = (list) => Array.isArray(list) ? list.filter((id) => typeof id === "string" && BY_ID.has(id)).slice(0, MAX_PARTS) : null;
  // Stack cut at its separators, bottom up: each stage owns its parts, the knot on it and its engine's fuel.
  // A solid engine burns only its own powder.
  const stagesOf = (stack) => {
    const stages = [];
    let from = 0;
    for (let i = 0; i <= stack.length; i++) {
      if (i < stack.length && partOf(stack[i]).kind !== "sep") continue;
      const to = Math.min(i + 1, stack.length);
      const parts = stack.slice(from, to).map(partOf);
      const engine = parts[0] && parts[0].kind === "engine" ? parts[0] : null;
      const tankFuel = parts.reduce((sum, p) => sum + (p.kind === "tank" ? p.fuel : 0), 0);
      const fuel = engine ? (engine.solid ? engine.fuel : tankFuel) : 0;
      const dry = parts.reduce((sum, p) => sum + p.dry + (p.kind === "tank" || p.solid ? p.fuel : 0), 0) - fuel;
      stages.push({ from, to, engine, fuel, dry, stranded: engine && engine.solid ? tankFuel : engine ? 0 : tankFuel, stability: parts.reduce((sum, p) => sum + (p.stability || 0), 0) });
      from = to;
    }
    return stages;
  };
  // Problems block a launch; warnings only say what will happen.
  const check = (stack) => {
    const problems = [], warnings = [];
    if (!stack.length) return { ok: false, problems: ["Start with an engine at the bottom."], warnings };
    const parts = stack.map(partOf), top = parts[parts.length - 1];
    const pods = parts.filter((p) => p.kind === "pod").length;
    if (top.kind !== "pod") problems.push(pods ? "The pod goes on top." : "Put a pod on top for the Ooga.");
    if (pods > 1) problems.push("One pod only.");
    if (parts[0].kind !== "engine") problems.push("An engine goes at the bottom.");
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i], below = parts[i - 1], above = parts[i + 1];
      if (p.kind === "shield" && (!above || above.kind !== "pod")) problems.push("A heat shield sits right under the pod.");
      if (p.kind === "engine" && i > 0 && below.kind !== "sep") problems.push(`${p.name} must sit at the bottom or on a Vine Knot.`);
      if (p.kind === "sep" && (i === 0 || !above)) problems.push("A Vine Knot goes between two stages.");
      if (p.kind === "sep" && above && above.kind !== "engine" && above.kind !== "shield" && above.kind !== "pod") problems.push("Above a Vine Knot: an engine, or the pod's section.");
    }
    const stages = stagesOf(stack);
    if (!parts.some((p) => p.kind === "shield")) warnings.push("No heat shield: the pod will burn coming home.");
    if (stages.length && stages[stages.length - 1].engine) warnings.push("No Vine Knot under the pod: it comes home with its last stage.");
    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      if (s.engine && !s.fuel) warnings.push(`Stage ${i + 1} has an engine and no fuel.`);
      if (s.engine && s.stranded) warnings.push(`Stage ${i + 1}: the firecracker cannot drink from tanks.`);
    }
    return { ok: problems.length === 0, problems: [...new Set(problems)], warnings };
  };
  const stats = (stack) => {
    const stages = stagesOf(stack);
    let above = 0, dv = 0;
    const rows = [];
    for (let i = stages.length - 1; i >= 0; i--) {
      const s = stages[i], m0 = above + s.dry + s.fuel, m1 = m0 - s.fuel;
      const e = s.engine;
      const stageDv = e && s.fuel ? e.ve * Math.log(m0 / m1) : 0;
      rows[i] = { dv: stageDv, twr: e ? e.thrust / (m0 * G0) : 0, burn: e && s.fuel ? s.fuel * e.ve / e.thrust : 0, mass: m0 };
      dv += stageDv;
      above = m0;
    }
    const parts = stack.map(partOf);
    // Steadiness is the worst the flight will see: fins on a dropped stage leave with it.
    let stability = Infinity, fromTop = 0;
    for (let i = stages.length - 1; i >= 0; i--) {
      fromTop += stages[i].stability;
      if (stages[i].engine || i === stages.length - 1) stability = Math.min(stability, fromTop - FLIP);
    }
    return {
      mass: above, dv, stages: rows, liftoff: rows.length ? rows[0].twr : 0,
      height: parts.reduce((sum, p) => sum + p.h, 0),
      cost: parts.reduce((sum, p) => sum + p.price, 0),
      stability: Number.isFinite(stability) ? stability : -FLIP
    };
  };
  BL.rocketParts = { G0, PARTS, KINDS, KIND_NAMES, MAX_PARTS, FLIP, TOP_DV, PRESETS, partOf, sanitize, stagesOf, check, stats };
})();
