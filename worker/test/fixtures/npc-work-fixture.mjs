// Authored adapters isolate the REAL work-trip controller. They are intentionally
// simple motion/weapon/reload fixtures, not hub physics, inventory or Clanker AI.
import { createHash } from "node:crypto";
import { createNpcWork, createWorkState, createWorkCheckpoint } from "../../src/npc-work.js";
import { createNpcRandom, restoreNpcRandom } from "../../src/npc-random.js";

export const codec = createWorkCheckpoint("work-fixture-1", [2, 2]);
export const scenarios = ["normal", "maintainer", "occupied", "closed", "spare", "no-slot"];
export function initial(scenario = "normal") {
  return { scenario, frame: 0, rng: createNpcRandom(1351747683).capture(),
    events: { plans: [], shots: 0, reloads: 0, resets: 0, stops: 0, paths: 0 },
    actor: { index: 0, traits: { maintainer: scenario === "maintainer" },
      root: { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 } },
      work: createWorkState(0), slot: null, pileApproach: false,
      avoidance: { tx: NaN }, pathing: {}, progress: { backoff: 0 }, act: { kind: "eat" },
      weapon: { ammo: 30, equipped: false, burstRemaining: 0, cooldown: 0,
        swapTime: 0, reloadHandoff: 0, reloading: false, shotsFired: 0,
        spareAmmo: scenario === "spare" ? [7, 19] : [] } } };
}

export function encode(state) {
  const saved = structuredClone(state);
  saved.work = codec.capture(state.actor.work); delete saved.actor.work;
  // This fixture's sole non-JSON cache sentinel has an explicit null encoding.
  if (Number.isNaN(saved.actor.avoidance.tx)) saved.actor.avoidance.tx = null;
  return saved;
}
export function decode(saved) {
  const state = structuredClone(saved);
  state.actor.work = codec.restore(saved.work); delete state.work;
  if (state.actor.avoidance.tx === null) state.actor.avoidance.tx = NaN;
  return state;
}

export function runtime(state, create = createNpcWork) {
  let rng;
  const a = state.actor, events = state.events, home = { x: 0, y: 0, z: 0 };
  const sites = [1, -1].map((side, id) => ({ id, route: [{ x: side, z: 0 }, { x: side * 2, z: 0 }],
    approachDistance: 0.5,
    position(cave, out, retry) {
      if (retry && state.scenario === "occupied" && state.frame < 32) {
        out.x = NaN; cave.work.place = 99; return false;
      }
      cave.work.place = retry ? (cave.work.place + 1) % 4 : 0;
      Object.assign(out, { x: side * 2, y: 0, z: 1 + cave.work.place * 0.2 });
      return true;
    } }));
  const full = cave => cave.weapon.spareAmmo.reduce((best, n, i, list) => n > list[best] ? i : best, 0);
  const hooks = {
    workSites: sites, AMMO_MAX: 30, WORK_REST_MIN: 7, WORK_REST_SPREAD: 16,
    siteActive: (cave, site) => !(state.scenario === "closed" && site.id === 0 && state.frame >= 50),
    standPose() {},
    nearReload: cave => Math.hypot(cave.root.position.x, cave.root.position.z) < 0.12,
    walkWorkTo(cave, target, dt) {
      const p = cave.root.position, dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz);
      const step = Math.min(d, dt * 2);
      if (d) { p.x += dx / d * step; p.z += dz / d * step; }
      cave.work.gait += step * 5;
      return Math.hypot(target.x - p.x, target.z - p.z) < 0.12;
    },
    spotOccupied: () => state.scenario === "occupied" && state.frame >= 12 && state.frame < 40,
    resetWalkerRoute: () => { events.resets++; },
    aimWork(cave, site) {
      Object.assign(cave.work.target, { x: site.id ? -3 : 3, y: 1, z: 0 });
      cave.work.targetReady = cave.work.aimReady = !(state.scenario === "occupied" && state.frame < 50);
      cave.work.aimSample = cave.weapon.shotsFired + cave.index;
      return cave.work.aimReady;
    },
    stopBurst: () => { events.stops++; },
    fireWeapon(cave) { cave.weapon.ammo--; cave.weapon.shotsFired++; events.shots++; return true; },
    hasMagazine: cave => cave.weapon.spareAmmo.length > 0,
    magazineAmmo: (cave, i) => cave.weapon.spareAmmo[i] || 0,
    fullestMagazine: full,
    swapMagazine(cave) {
      const i = full(cave), old = cave.weapon.ammo;
      cave.weapon.ammo = cave.weapon.spareAmmo[i]; cave.weapon.spareAmmo[i] = old;
      return true;
    },
    slotAvailable: () => !(state.scenario === "no-slot" && state.frame < 180),
    closestSlot: () => state.scenario === "no-slot" && state.frame < 180 ? null : home,
    approachPile: () => false,
    reloadMissing: cave => 30 - cave.weapon.ammo + cave.weapon.spareAmmo.reduce((n, rounds) => n + 30 - rounds, 0),
    startReload: cave => { cave.weapon.reloading = true; events.reloads++; },
    runReload(cave) {
      // Deliberately a fixture: the production reload bite/handoff is not extracted.
      cave.weapon.ammo = Math.min(30, cave.weapon.ammo + 10);
      for (let i = 0; i < cave.weapon.spareAmmo.length; i++) cave.weapon.spareAmmo[i] = Math.min(30, cave.weapon.spareAmmo[i] + 10);
      if (!hooks.reloadMissing(cave)) cave.weapon.reloading = false;
    },
    planPath: () => { events.paths++; },
    workPlanned(cave, site) {
      if (events.plans.length >= 16) throw new Error("fixture plan bound");
      events.plans.push({ frame: state.frame, site });
    },
    random: () => rng.next(),
  };
  const controller = create(hooks);
  return { controller, hooks, step(dt = 0.1) {
    rng = restoreNpcRandom(state.rng);
    controller.runWork(a, dt);
    state.rng = rng.capture(); state.frame++;
  } };
}

export function record(scenario, create, frames = 420) {
  const state = initial(scenario), run = runtime(state, create), hash = createHash("sha256"), transitions = [];
  // Object insertion order is not actor state. Preserve array order (magazines,
  // route catalogs and plan notifications), but canonicalize object keys.
  const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  let phase = "";
  for (let i = 0; i < frames; i++) {
    run.step();
    const work = state.actor.work;
    if (work.phase !== phase) { phase = work.phase; transitions.push({ frame: state.frame, phase, site: work.site, ammo: state.actor.weapon.ammo }); }
    // Keep the original-source oracle in its original encoding. Reservation
    // order is a later field, covered by full-state recovery and timestamp tests.
    const legacy = encode(state);
    legacy.work.v = 1;
    delete legacy.work.work.reservedAt;
    hash.update(JSON.stringify(canonical(legacy)) + "\n");
  }
  return { frames, sha256: hash.digest("hex"), transitions, events: state.events };
}
