// The existing Ooga work-trip transitions, shared by the browser crew and host.
// Movement, collision, aim, inventory and companion notifications are explicit
// adapters. This controller does not create rigs, schedule wakes or own effects.
// Host adapters must mutate transaction-local data only; no external side effects.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const setVec = (v, x, y, z) => { v.x = x; v.y = y; v.z = z; };
  const createState = (i) => ({ phase: "", site: 0, plannedSite: -1, targetReady: false, aimReady: false, aimSample: i, index: 0, place: -1, blocked: false, blockedTime: 0, gait: 0, timer: i * 0.137, emptyTime: 0, rest: 0, reloadSlot: false, reservedAt: Infinity, direct: false, position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } });
  const create = ({ workSites, siteActive, standPose, nearReload, walkWorkTo, spotOccupied, resetWalkerRoute, aimWork, stopBurst, fireWeapon, hasMagazine, magazineAmmo, fullestMagazine, swapMagazine, slotAvailable, closestSlot, approachPile, reloadMissing, startReload, runReload, planPath, workPlanned, random, AMMO_MAX, WORK_REST_MIN, WORK_REST_SPREAD, fixedTrip = () => false, clock = () => 0 }) => {
    const planWorkSite = (cave, resume = false, announceTrip = false) => {
      const previous = cave.weapon.workSite === undefined ? -1 : cave.weapon.workSite;
      const first = resume && previous >= 0 ? 0 : 1;
      let selected = -1;
      for (let offset = first; offset < first + workSites.length; offset++) {
        const index = (previous + offset) % workSites.length, site = workSites[index];
        if (!siteActive(cave, site)) continue;
        selected = index;
        break;
      }
      if (cave.work.plannedSite !== selected || announceTrip) {
        cave.work.plannedSite = selected;
        workPlanned(cave, selected);
      }
      return selected;
    };
    const selectWorkSite = (cave, resume = false) => {
      let index = cave.work.plannedSite;
      if (resume || index < 0 || !siteActive(cave, workSites[index])) index = planWorkSite(cave, resume);
      if (index < 0) return false;
      const work = cave.work, site = workSites[index];
      work.site = cave.weapon.workSite = index;
      work.index = 0;
      if (site.position) { if (site.position(cave, work.position) === false) return false; }
      else setVec(work.position, site.route[site.route.length - 1].x, 0, site.route[site.route.length - 1].z);
      work.phase = "outbound";
      work.targetReady = work.aimReady = false;
      work.blocked = false; work.blockedTime = 0;
      work.rest = cave.traits.maintainer ? WORK_REST_MIN + random(cave) * WORK_REST_SPREAD : 0;
      work.reloadSlot = work.direct = cave.pileApproach = false; work.reservedAt = Infinity;
      cave.act.kind = "work";
      cave.weapon.equipped = true;
      cave.avoidance.tx = NaN;
      // Publish an outbound trip with its surface route already planned.
      // Reload can start this phase after the frame's walking update.
      planPath(cave, site.route[0]);
      return true;
    };
    const runWork = (cave, dt) => {
      const work = cave.work, weapon = cave.weapon;
      if (!work.phase) {
        if (weapon.ammo >= AMMO_MAX) {
          if (!selectWorkSite(cave)) { standPose(cave); return; }
        } else {
          work.site = Math.min(workSites.length - 1, weapon.workSite || 0);
          work.phase = nearReload(cave) ? "reload" : "return";
          work.index = workSites[work.site].route.length - 1;
          planWorkSite(cave);
        }
      }
      const site = workSites[work.site];
      // A page following the room's host takes the phase and site from its frames but no place along the route: handed
      // back its Oogas, its own index can lie off either end of this one, and a thrown frame here would freeze the picture.
      if (!site) { work.phase = ""; standPose(cave); return; }
      const route = site.route;
      if (work.phase === "outbound") work.index = Math.max(0, Math.min(work.index, route.length));
      else if (work.phase === "return") work.index = Math.min(work.index, route.length - 1);
      if ((work.phase === "outbound" || work.phase === "station" || work.phase === "shoot") && !siteActive(cave, site)) {
        work.index = work.phase === "outbound" ? Math.min(work.index, route.length - 1) : route.length - 1;
        work.phase = "return"; cave.act.kind = "reload-return"; cave.avoidance.tx = NaN;
        planWorkSite(cave);
      }
      if ((work.phase === "return" || work.phase === "reload") && (work.plannedSite < 0 || !siteActive(cave, workSites[work.plannedSite]))) planWorkSite(cave);
      if (work.phase === "outbound") {
        const approach = route[route.length - 1], p = cave.root.position;
        if (work.index === route.length - 1 && site.approachDistance && Math.hypot(approach.x - p.x, approach.z - p.z) <= site.approachDistance) {
          work.phase = "station"; cave.avoidance.tx = NaN;
        } else if (work.index < route.length) {
          if (walkWorkTo(cave, route[work.index], dt)) { work.index++; cave.avoidance.tx = NaN; }
          return;
        } else {
          work.phase = "station";
        }
      }
      if (work.phase === "station") {
        // A nonworker can occupy a reserved shooting place after it was
        // selected. Walking around that body cannot reach its exact center.
        const occupied = spotOccupied(cave, work.position.x, work.position.y, work.position.z, true);
        work.blockedTime = occupied ? work.blockedTime + dt : 0;
        // An occupied place re-invokes the site's position hook every 0.8 s by
        // design. It is also the place-cycling hook, so it must be total and bounded.
        if (work.blockedTime >= 0.8 && site.position) {
          work.blockedTime = 0;
          const x = work.position.x, y = work.position.y, z = work.position.z, place = work.place;
          if (site.position(cave, work.position, true) !== false && Number.isFinite(work.position.x)
            && Number.isFinite(work.position.y) && Number.isFinite(work.position.z)) {
            if (work.position.x !== x || work.position.y !== y || work.position.z !== z) {
              resetWalkerRoute(cave); cave.progress.backoff = 0;
            }
          } else {
            setVec(work.position, x, y, z); work.place = place;
          }
        }
        if (walkWorkTo(cave, work.position, dt, !site.approachDistance)) {
          work.phase = "shoot"; work.direct = false; work.timer = 0.2 + cave.index * 0.07; work.emptyTime = work.blockedTime = 0;
          aimWork(cave, site);
        }
      } else if (work.phase === "shoot") {
        if (site.approachDistance && Math.hypot(cave.root.position.x - work.position.x, cave.root.position.z - work.position.z) > 0.45) {
          stopBurst(cave); work.phase = "station"; cave.avoidance.tx = NaN;
          return;
        }
        work.blockedTime = work.blocked ? work.blockedTime + dt : 0;
        if (work.blockedTime >= 0.6 && site.position) {
          work.blockedTime = 0;
          if (site.position(cave, work.position, true) !== false) {
            stopBurst(cave); work.blocked = false; work.phase = "station"; cave.avoidance.tx = NaN;
            return;
          }
        }
        standPose(cave);
        cave.act.kind = "work";
        const targetReady = aimWork(cave, site);
        if (targetReady) work.timer -= dt;
        else work.timer = Math.max(0.2, work.timer);
        if (targetReady && work.timer <= 0 && weapon.ammo > 0 && !weapon.burstRemaining && weapon.cooldown <= 0) {
          if (fireWeapon(cave, work.target)) work.timer = 0.22 + (cave.index % 3) * 0.045;
          else if (work.blocked) work.timer = 0.15;
        }
        if (!weapon.ammo && !weapon.swapTime) {
          // Send the companion ahead as soon as this cave's last shot is
          // fired. The owner's empty-rifle pause and reload trip are separate.
          if (!work.emptyTime && !(hasMagazine(cave) && magazineAmmo(cave, fullestMagazine(cave)) > 0))
            planWorkSite(cave, false, true);
          // Let the last banana land while the visibly empty rifle remains
          // aimed into the cave, then lower it for the return to the pile.
          work.emptyTime += dt;
          if (work.emptyTime >= 0.45) {
            if (hasMagazine(cave) && magazineAmmo(cave, fullestMagazine(cave)) > 0 && swapMagazine(cave)) {
              work.emptyTime = 0;
            } else {
              work.phase = "return"; work.index = route.length - 1;
              cave.act.kind = "reload-return"; cave.avoidance.tx = NaN;
              // The next cave was announced on the final shot. A companion
              // whose next shift is here stays inside through the reload.
            }
          }
        }
      } else if (work.phase === "return") {
        if (work.index >= 0) {
          const point = route[work.index], direct = site.approachDistance && work.index === route.length - 1;
          if (direct && Math.hypot(point.x - cave.root.position.x, point.z - cave.root.position.z) < 0.8) {
            work.index--; cave.avoidance.tx = NaN;
          } else {
            if (walkWorkTo(cave, point, dt, !direct)) { work.index--; cave.avoidance.tx = NaN; }
            return;
          }
        }
        if (work.index < 0) {
          if (!work.reloadSlot || !cave.slot || !slotAvailable(cave, cave.slot)) {
            const slot = closestSlot(cave);
            if (!slot) { standPose(cave); return; }
            cave.slot = slot; work.reloadSlot = true; work.reservedAt = clock(); cave.pileApproach = false;
          }
          // A passive meadow leg keeps its reserved slot along the authored ring. The direct approach re-picks the
          // nearest slot it can sweep to past props and the pile, which swings a walker on the ring to another slot.
          const direct = !fixedTrip(cave) && approachPile(cave);
          if (walkWorkTo(cave, cave.slot, dt, !direct)) { work.phase = "reload"; work.direct = false; cave.act.kind = "reload"; }
        }
      } else if (work.phase === "reload") {
        standPose(cave);
        cave.root.rotation.y = Math.atan2(-cave.root.position.x, -cave.root.position.z);
        if (!nearReload(cave)) { work.phase = "return"; work.index = -1; return; }
        if (!reloadMissing(cave)) {
          if (weapon.reloadHandoff) return;
          // Loaded and in no hurry: stand at the pile before the next trip.
          if (work.rest > 0) { work.rest -= dt; return; }
          selectWorkSite(cave);
          return;
        }
        if (!weapon.reloading) startReload(cave);
        runReload(cave, dt);
      }
    };
    return { planWorkSite, selectWorkSite, runWork };
  };
  BL.npcWork = { createState, create };
})();
