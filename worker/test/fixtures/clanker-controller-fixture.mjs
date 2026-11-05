// Actual outer controller and rigs over a synthetic empty meadow. No renderer,
// account, island geometry, storage or substitute AI implementation.
import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import { createHash } from "node:crypto";
export function clankerController({ count = 1, checkpointRandom = false, spacious = false, agentSource = null, checkpointProfile = null, start = true,
  clearance = null, ground = null } = {}) {
  if (!Number.isInteger(count) || count < 1 || count > 53) throw Error("bounded fixture roster required");
  const hashes = {}, context = createContext({ window: {}, TextEncoder });
  const run = code => new Script(code).runInContext(context, { timeout: 5000 });
  const load = name => {
    const source = name === "agent" && agentSource !== null ? agentSource
      : readFileSync(new URL(`../../../src/js/${name}.js`, import.meta.url), "utf8");
    hashes[name] = createHash("sha256").update(source).digest("hex"); run(source);
  };
  for (const name of ["math", "scene", "models", "convex", "npc-authority", "clanker-pose", "npc-pose-packet", "clanker-state"]) load(name);
  // Authored fixture constants matching pilot.WALK and crew's public constants.
  run(`Object.assign(window.BL, { pilot: { WALK: { speed: 7.75, gravity: 9.8, ledgeRise: 2.4 } },
    crew: { JUMP_SPEED: 4.8, HEALTH_MAX: 100, HEALTH_REGEN_DELAY: 4, HEALTH_REGEN_RATE: 20 } });`);
  for (const name of ["agent", "clanker-flight", "clanker-rage", "clankers"]) load(name);
  Object.assign(context, { actorCount: count, checkpointRandom, spacious, checkpointProfile, startActors: start, clearance, ground });
  const startedAt = performance.now();
  run(`const B = window.BL;
    const owners = Array.from({ length: actorCount }, (_, i) => ({ id: 'fixture-' + i,
      traits: { name: 'fixture-' + i }, state: 'chilling', work: { site: -1, plannedSite: -1 },
      root: B.scene.createNode(), camp: { burning: false } }));
    const crew = { list: owners, cavemen: new Map(owners.map(o => [o.traits.name, o])), stateOf: o => o.state };
    const sim = B.clankers.create({ root: B.scene.createNode(), crew, sites: [], checkpointRandom, checkpointProfile,
      groundAt: (...args) => ground ? ground(...args) : 0, clear: (...args) => clearance ? clearance(...args) : true, combatEnabled: false,
      ...(spacious ? { meadowRadius: 60, roamRadius: 68 } : {}) });
    globalThis.sim = sim;
    if (checkpointProfile && startActors) sim.sync();
    // Exercise actual destination choices after the ordinary lounge departure.
    // This authored initial condition changes no gameplay default.
    for (const e of sim.list) e.rest = 0;`);
  const bootMs = performance.now() - startedAt, step = new Script("sim.update(.25)");
  return { context, hashes, bootMs, sim: context.sim, B: context.window.BL,
    start: () => run("sim.sync(); for (const e of sim.list) e.rest = 0;"),
    step: () => step.runInContext(context, { timeout: 5000 }), dispose: () => run("sim.dispose()") };
}
