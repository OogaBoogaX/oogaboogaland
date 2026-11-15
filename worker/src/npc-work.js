// The same trip controller the browser crew uses. This is not a complete actor,
// collision, weapon or Clanker adapter; those must commit their own coupled state.
import "../../src/js/npc-work.js";

const api = globalThis.BL.npcWork;
export const createWorkState = api.createState;
const callbacks = ["siteActive", "standPose", "nearReload", "walkWorkTo", "spotOccupied", "resetWalkerRoute",
  "aimWork", "stopBurst", "fireWeapon", "hasMagazine", "magazineAmmo", "fullestMagazine", "swapMagazine",
  "slotAvailable", "closestSlot", "approachPile", "reloadMissing", "startReload", "runReload",
  "planPath", "workPlanned", "random"];
const integer = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
const finite = (n, limit) => Number.isFinite(n) && Math.abs(n) <= limit;
const exact = (v, keys) => v && typeof v === "object" && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const vector = v => exact(v, ["x", "y", "z"]) && [v.x, v.y, v.z].every(n => finite(n, 10000));
const bad = () => { throw new Error("invalid NPC work checkpoint"); };

export function createNpcWork(adapters) {
  if (!adapters || callbacks.some(k => typeof adapters[k] !== "function")
    || ["fixedTrip", "clock"].some(k => adapters[k] !== undefined && typeof adapters[k] !== "function")
    || !Array.isArray(adapters.workSites) || !integer(adapters.workSites.length, 1, 32)
    || !integer(adapters.AMMO_MAX, 1, 30) || !finite(adapters.WORK_REST_MIN, 60)
    || adapters.WORK_REST_MIN < 0 || !finite(adapters.WORK_REST_SPREAD, 60) || adapters.WORK_REST_SPREAD < 0) {
    throw new Error("NPC work requires explicit simulation adapters");
  }
  for (const site of adapters.workSites) {
    if (!site || !Array.isArray(site.route) || !integer(site.route.length, 1, 4096)) throw new Error("NPC work route");
    for (const point of site.route) if (!point || !finite(point.x, 10000) || !finite(point.z, 10000)) throw new Error("NPC work route");
  }
  return api.create(adapters);
}

// World version must change with geometry, site order, eligibility or adapter
// semantics. Route lengths additionally fence incompatible waypoint cursors.
// This codec owns ONLY cave.work. Actor motion, RNG, inventory, slot reservations,
// activity and effect cursors must be in the same atomic enclosing checkpoint.
export function createWorkCheckpoint(world, routeLengths) {
  if (typeof world !== "string" || !/^[a-zA-Z0-9_.:-]{1,80}$/.test(world)
    || !Array.isArray(routeLengths) || !integer(routeLengths.length, 1, 32)
    || Object.keys(routeLengths).length !== routeLengths.length
    || routeLengths.some(n => !integer(n, 1, 4096))) bad();
  const routes = routeLengths.slice(), keys = Object.keys(createWorkState(0));
  const booleans = ["targetReady", "aimReady", "blocked", "reloadSlot", "direct"];
  const numbers = ["blockedTime", "gait", "timer", "emptyTime", "rest"];
  const valid = (w, saved = false) => exact(w, keys) && ["", "outbound", "station", "shoot", "return", "reload"].includes(w.phase)
    && integer(w.site, 0, routes.length - 1) && integer(w.plannedSite, -1, routes.length - 1)
    && integer(w.index, -1, routes[w.site]) && integer(w.place, -1, 4096)
    && (w.phase !== "outbound" || w.index >= 0) && (w.phase !== "return" || w.index < routes[w.site])
    && integer(w.aimSample, 0, Number.MAX_SAFE_INTEGER)
    && booleans.every(k => typeof w[k] === "boolean") && numbers.every(k => finite(w[k], 1e9))
    && (w.reservedAt === (saved ? null : Infinity) || finite(w.reservedAt, 1e9) && w.reservedAt >= 0)
    && w.blockedTime >= 0 && w.gait >= 0 && w.emptyTime >= 0 && vector(w.position) && vector(w.target);
  const copy = w => ({ ...w, position: { ...w.position }, target: { ...w.target } });
  return {
    capture(work) {
      if (!valid(work)) bad();
      return { v: 2, world, routes: routes.slice(),
        work: { ...copy(work), reservedAt: work.reservedAt === Infinity ? null : work.reservedAt } };
    },
    restore(saved) {
      if (!exact(saved, ["v", "world", "routes", "work"]) || saved.v !== 2 || saved.world !== world
        || !Array.isArray(saved.routes) || saved.routes.length !== routes.length
        || Object.keys(saved.routes).length !== routes.length
        || routes.some((n, i) => saved.routes[i] !== n) || !valid(saved.work, true)) bad();
      return { ...copy(saved.work), reservedAt: saved.work.reservedAt === null ? Infinity : saved.work.reservedAt };
    },
  };
}
