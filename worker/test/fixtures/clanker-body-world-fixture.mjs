// Authored static prop geometry and actual source controller queries only.
// No Hub scene, browser, renderer, account or production resources.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { clankerController } from './clanker-controller-fixture.mjs';
import { createClankerBodyCheckpoint } from '../../src/clanker-roaming.js';
export const worldId = 'terrain-body-fixture-1';
export function fixture({ narrow = false, wall = false } = {}) {
  const boot = clankerController({ checkpointRandom: true, checkpointProfile: 'roaming-1', start: false }), B = boot.B;
  runInNewContext(readFileSync(new URL('../../../src/js/solid-props.js', import.meta.url), 'utf8'), { window: { BL: B } });
  const root = B.scene.createNode(), props = B.solidProps.create(), bodies = new Set(); let blocked = 0, supportCalls = 0;
  const platform = B.scene.createNode({ geometry: B.models.box({ w: narrow ? .5 : 40, h: 2, d: 40, color: '#888888' }),
    position: { x: narrow ? 1 : 0, y: 1, z: 0 } });
  B.scene.addChild(root, platform); props.add(platform);
  if (wall) {
    const barrier = B.scene.createNode({ geometry: B.models.box({ w: .5, h: 6, d: 40, color: '#888888' }), position: { x: 7, y: 3, z: 0 } });
    B.scene.addChild(root, barrier); props.add(barrier);
  }
  props.sync();
  const supportAt = (entry, x, z, y, step, heading = entry.heading) => {
    supportCalls++;
    const shape = B.agent.footprint, radius = shape.radius(entry); let floor = 0;
    for (let i = 0; i < shape.count(entry); i++) {
      const offset = shape.offset(entry, i);
      floor = Math.max(floor, props.supportAt(x + Math.sin(heading) * offset, z + Math.cos(heading) * offset, y, step, radius));
    }
    return floor;
  };
  const queries = { version: 'props-fixture-1', supportAt, terrainSupportAt: () => 0,
    pointSupportAt: (x, z, y) => Math.max(0, props.supportAt(x, z, y, 0)), groundPlaneAt: () => false };
  const options = { profile: 'terrain-body-3', root, ownerId: 'fixture-player', name: 'fixture-player', groundAt: () => 0,
    clear(x, y, z, nx, ny, nz, radius, height) {
      const allowed = props.segmentClear(x, y, z, nx, ny, nz, radius, height);
      if (!allowed) blocked++; return allowed;
    }, terrain: queries };
  const make = (changes = {}) => {
    const selected = { ...options, ...changes }; if (selected.profile === "static-body-3") delete selected.terrain;
    const sim = B.clankers.createPlayerBody(selected); bodies.add(sim);
    const dispose = sim.dispose; sim.dispose = () => { bodies.delete(sim); dispose(); };
    return { sim, codec: createClankerBodyCheckpoint(sim, worldId) };
  };
  const seed = (body, x = 0, z = 0) => body.sim.bodyCheckpoint.restoreBody([body.sim.list[0].owner.id, x, 2, z, 0, 0, 0, 0, 0, 1]);
  return { B, root, props, platform, options, queries, make, seed, counts: () => ({ blocked, supportCalls }),
    removeSupport() { props.remove(platform); B.scene.removeChild(root, platform); props.sync(); },
    dispose() { for (const body of bodies) body.dispose(); props.dispose(); boot.dispose(); } };
}

