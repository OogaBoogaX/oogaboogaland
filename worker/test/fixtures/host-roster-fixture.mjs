// Capacity fixture, not the production hub. Each Ooga uses the real work/walker
// controllers and each Clanker the real flight controller, over one authored mesh.
// Work inventories, crowd, rigs, activity selection and hub systems remain fixtures.
import { prepare as prepareWalker } from "./npc-walker-fixture.mjs";
import { initial, prepare, capture, restore } from "./clanker-flight-fixture.mjs";
import { compactSimulation } from "../../src/simulation-checkpoint.js";

export async function rosterFixture(pairs, budget = 64 * 1024, varied = false) {
  if (!Number.isInteger(pairs) || pairs < 1 || pairs > 53) throw Error("roster fixture supports 1..53 pairs; remeasure before growth");
  const walker = await prepareWalker(), flight = await prepare();
  const source = { version: `roster-fixture-${pairs}${varied ? '-varied' : ''}`, checkpointBytes: budget,
    initial() {
      return { meshes: walker.initial().meshes,
        oogas: Array.from({ length: pairs }, (_, i) => {
          const s = walker.initial(); s.actor.index = i;
          if (varied) {
            s.rng.word = (1351747683 + Math.imul(i, 2654435761)) >>> 0;
            s.actor.root.position.x = -2 + i % 9 / 2; s.actor.root.position.z = -1 + i % 7 / 3;
            for (let step = 0; step < i % 31; step++) walker.runtime(s).step(.05);
          }
          const saved = walker.encode(s); delete saved.meshes; return saved;
        }),
        clankers: Array.from({ length: pairs }, (_, i) => {
          const e = initial(); flight.controller.prepareJump(e, varied ? i / 100 : 0, 0, varied ? -4 + i / 70 : -4, varied ? 1.5 + i / 53 : 1.5); return capture(e);
        }) };
    },
    validate(s) {
      if (s.oogas.length !== pairs || s.clankers.length !== pairs) return false;
      walker.catalog.validate(s.meshes);
      for (const a of s.oogas) walker.decode({ ...a, meshes: s.meshes });
      for (const e of s.clankers) restore(e);
      return true;
    },
    step(s, ms) {
      for (let i = 0; i < pairs; i++) {
        const a = walker.decode({ ...s.oogas[i], meshes: s.meshes }); walker.runtime(a).step(ms / 1000);
        s.oogas[i] = walker.encode(a); delete s.oogas[i].meshes;
        const e = restore(s.clankers[i]); if (e.jump.active) flight.controller.updateJump(e, ms / 1000);
        s.clankers[i] = capture(e);
      }
    },
    project(s) {
      return { npcs: [
        ...s.oogas.map((a, i) => ({ id: `ooga-${i}`, kind: "ooga", ...a.actor.root.position, yaw: a.actor.root.rotation.y,
          activity: "working", phase: a.work.work.phase, route: `site:${a.work.work.site}`, progress: 0, seed: a.rng.word })),
        ...s.clankers.map((e, i) => ({ id: `clanker-${i}`, kind: "clanker", ...e.root.position, yaw: e.heading,
          activity: "chilling", phase: e.jump.active ? "jump" : "idle", route: "fixture", progress: 0, seed: 0 })),
      ], hub: { pile: 0 } };
    }, npcFor: () => null, handoff: () => false,
  };
  return { source, simulation: compactSimulation(source, budget), mesh: flight.mesh };
}
