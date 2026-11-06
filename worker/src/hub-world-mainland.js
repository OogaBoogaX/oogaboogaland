// Physical mainland planting. Browser-only lights, picks and effects are not
// started here; placement and mesh generation use the same authored functions.
import { hubScene, hubSlots, hubGroundLayout as L, hubMainlandPlanting as planting,
  hubPoolModels, hubTimechainModels, hubLibrary } from './ooga-crew.js';

export function* buildHubMainland({ island, root, solids, placed, targets, props, addProp,
  claimed, claim, free, nearPath, getRosterCount, layout, chalkboardClearance, mempool, timechain, bifrost, firePosition }) {
  const { createNode, addChild, removeChild } = hubScene;
  const meadowPalms = [], hammockClaims = [], scenery = [], sceneryClaims = [];
  const workZones = [], entranceZones = [];
  for (const slot of hubSlots) {
    const m = island.mouths.find(mouth => mouth.id === slot.id);
    const zone = { x: m.x, z: m.z, sr: Math.sin(m.ry), cr: Math.cos(m.ry) };
    if (slot.repo && (slot.status === 'open' || slot.status === 'mirror')) workZones.push(zone);
    if (['open', 'mirror', 'headquarters'].includes(slot.status)) entranceZones.push(zone);
  }
  const nearMouth = (x, z, r) => island.mouths.some(m => Math.hypot(m.x - x, m.z - z) < r);
  const entranceClear = (x, z, r) => L.entranceClear(entranceZones, x, z, r);
  let constructing = true, ringReached = layout.ring;
  const workSceneryClear = (x, z, r) => L.workSceneryClear(workZones,
    constructing ? layout.count : getRosterCount(), x, z, r);
  const reasonContext = { island, workSceneryClear, chalkboardClearance, claimed };
  const reason = o => planting.sceneryReason(reasonContext, o);
  const drop = (list, value) => { const i = list.indexOf(value); if (i >= 0) list.splice(i, 1); };
  let hammock = null, complete = false, disposed = false, lastRosterCount = -1, lastRing = -1;
  const removeHammock = () => {
    if (!hammock) return;
    hammock.dispose(); hammock = null;
    for (const c of hammockClaims) drop(claimed, c);
    hammockClaims.length = 0;
  };
  const removeProp = owner => {
    targets.delete(owner.node); drop(props, owner); drop(placed, owner.node);
    solids.remove(owner.node); removeChild(root, owner.node);
  };
  const dispose = () => { if (!disposed) { removeHammock(); disposed = true; } };
  const refresh = () => {
    if (disposed) throw Error('mainland disposed');
    const count = getRosterCount(), ring = island.path.debug.ringOuterRadius;
    if (count === lastRosterCount && ring === lastRing) return false;
    ringReached = Math.max(ringReached, ring);
    let removedSupport = false;
    if (ring !== lastRing) for (let i = meadowPalms.length - 1; i >= 0; i--) {
      const { owner, reservation } = meadowPalms[i];
      if (Math.hypot(owner.x, owner.z) >= ringReached + 0.9) continue;
      if (hammock?.anchors.includes(owner)) removeHammock();
      removeProp(owner); drop(claimed, reservation); meadowPalms.splice(i, 1);
      removedSupport = true;
    }
    for (const o of scenery) o.node.visible = o.active = reason(o) === 0;
    lastRosterCount = count; lastRing = ring;
    hubScene.updateWorld(root); solids.sync();
    return removedSupport;
  };
  try {
    const arcadeSlot = hubSlots.find(slot => slot.scene === 'arcade');
    const arcadeMouth = island.mouths.find(m => m.id === arcadeSlot?.id) || null;
    const context = { island, root, placed, solids, addProp, claim, free, nearPath,
      nearMouth, entranceClear, slots: hubSlots, meadowPalms };
    planting.plantPalms({ ...context, plantHammock(offRuns, choices) {
      hammock = planting.plantHammock({ ...context, claimed, arcadeMouth, hammockClaims }, offRuns, choices) || null;
    } });
    const place = (geometry, x, z, ry, y, kind, radius) => {
      const node = createNode({ geometry, position: { x, y, z }, rotation: { x: 0, y: ry, z: 0 } });
      addChild(root, node); placed.push(node);
      if (kind) addProp(kind, node, x, z, radius);
      return node;
    };
    yield* planting.scatter({ island, claim, free, nearMouth, workSceneryClear,
      entranceClear, sceneryClaims, scenery, place, props, pause: function* () { yield; } });
    // Same deferred claim order as the browser: never perturb seeded planting
    // by inserting the library or satellite approach claims ahead of it.
    claim(hubLibrary.x, hubLibrary.z, hubLibrary.reach);
    const P = hubPoolModels, T = hubTimechainModels;
    claim(mempool.place.x, mempool.place.z, P.SITE.reach);
    for (let r = P.SITE.approachFrom; r <= mempool.place.rimRadius; r += 1.5)
      claim(P.DIR.x * r, P.DIR.z * r, P.SITE.width / 2 + 2.1);
    claim(timechain.place.x, timechain.place.z, T.SITE.radius + 1);
    for (let r = timechain.place.approachFrom - 1; r <= timechain.place.rim; r += 1)
      claim(T.DIR.x * r, T.DIR.z * r, T.SITE.width / 2 + 0.9);
    for (const [x, z, r] of bifrost.claims) claim(x, z, r);
    let nearest = null, distance = Infinity;
    for (const o of scenery) {
      if (o.prop !== 'bush' || o.node.position.y !== 0 || reason(o)) continue;
      const d = (o.x - firePosition.x) ** 2 + (o.z - firePosition.z) ** 2;
      if (d < distance) { nearest = o; distance = d; }
    }
    if (nearest) {
      removeProp(nearest); drop(scenery, nearest);
      drop(claimed, nearest.reservation); drop(sceneryClaims, nearest.reservation);
    }
    constructing = false;
    refresh(); complete = true;
    return { refresh, dispose, get ringReached() { return ringReached; } };
  } finally {
    if (!complete) dispose();
  }
}
