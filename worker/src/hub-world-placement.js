// Admission reads the private authored world only. It never relocates an
// obstructed body or changes an NPC's job/reservation to make recovery succeed.
import { hubScene, hubFlightBound, hubCylinderSegmentClear, createHubMirrorClearance,
  hubCaveLayout } from './ooga-crew.js';
const finite = n => Number.isFinite(n) && Math.abs(n) <= 10000;
const PARTS = ['torso', 'head', 'armL', 'armR', 'legL', 'legR'];

export function createHubWorldPlacement(g) {
  if (!g?.structuralSupport || !g.mirror) throw Error('actual Hub placement geometry required');
  const { island, solids, altar, cavePhysics, structuralSupport: support } = g;
  const { mirrorActorSegmentClear } = createHubMirrorClearance({ getMirror: () => g.mirror,
    radius: .3, eyeForward: .16, portalZ: hubCaveLayout.PORTAL_Z });
  const clear = (x, y, z, radius, height) => [x, y, z, radius, height].every(finite)
    && radius > 0 && radius <= 10 && height > 0 && height <= 10 && y > -120
    && Math.hypot(x, z) + radius <= hubFlightBound
    && island.clearAt(x, y + 1e-5, z, radius, height - 1e-5)
    && solids.clearAt(x, y + 1e-5, z, radius, height - 1e-5)
    && support.bedSegmentClear(x, y + 1e-5, z, x, y + 1e-5, z, radius, height - 1e-5)
    && cavePhysics.matrixGateSegmentClear(x, y, z, x, y, z, radius, height)
    && hubCylinderSegmentClear(x, y, z, x, y, z, radius, height, 0, 0, 0, altar.height, altar.platformRadius);
  const shotClear = (x, y, z, tx, ty, tz) => [x, y, z, tx, ty, tz].every(finite)
    && !cavePhysics.crossesSealedCave(x, z, tx, tz, Math.min(y, ty))
    && island.voxelSegmentClearAt(x, y - .025, z, tx, ty - .025, tz, .025, .05)
    && solids.segmentClear(x, y - .025, z, tx, ty - .025, tz, .025, .05)
    && cavePhysics.matrixGateSegmentClear(x, y - .025, z, tx, ty - .025, tz, .025, .05)
    && mirrorActorSegmentClear(x, y - .025, z, tx, ty - .025, tz, .05, null, .025);
  return {
    shotClear,
    playerPlacement(who, p, shape) {
      if (!who || !['ooga', 'clanker'].includes(who.kind) || !p || !shape
        || !finite(p.yaw) || !clear(p.x, p.y, p.z, shape.radius, shape.height)
        || !mirrorActorSegmentClear(p.x, p.y, p.z, p.x, p.y, p.z, shape.height, null, shape.radius)) return null;
      // Standard standing shape; no old animation, inventory or momentum.
      // Occupied player bodies are checked by the durable arrival coordinator.
      const floor = Math.max(island.supportAt(p.x, p.z, p.y, 0, -120, shape.radius),
        solids.supportAt(p.x, p.z, p.y, 0, shape.radius),
        support.bedSupportAt(p.x, p.z, p.y, 0, shape.radius),
        altar.height <= p.y + 1e-7 && Math.hypot(p.x, p.z) < altar.platformRadius + shape.radius
          ? altar.height : -Infinity,
        g.mempool.floatAt(p.x, p.z, p.y, 0, shape.height * (who.kind === 'ooga' ? .55 : .9)));
      return { grounded: floor > -120 && Math.abs(p.y - floor) <= .04 };
    },
    oogaPlacement(cave) {
      if (!cave?.nonInteractive || cave.humanControlled || cave.remoteControlled
        || ![cave.root.position.x, cave.root.position.y, cave.root.position.z, cave.root.rotation.y].every(finite)) return false;
      if (!cave.root.visible) return ['away', 'working', 'chilling', 'sleeping'].includes(cave.state);
      hubScene.updateWorld(cave.root, cave.root.parent?.world);
      // Recovery rebuilds the standard/rest pose first. Reserve the actual
      // transformed six body parts, including head accessories, rather than
      // testing a standing cylinder around a horizontal sleeper. Circumscribed
      // horizontal circles are conservative: an ambiguous overlap refuses the
      // restore, preserving the checkpoint for inspection instead of nudging it.
      const pending = PARTS.map(name => ({ node: cave.parts[name], head: name === 'head' }));
      let count = 0;
      while (pending.length) {
        const { node, head } = pending.pop();
        if (!node || ++count > 128) return false;
        if (!node.visible) continue;
        if (node.geometry) {
          const b = hubScene.boundsOf(node.geometry), m = node.world;
          let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
          for (let i = 0; i < 8; i++) {
            const x = b[i & 1 ? 'max' : 'min'][0], y = b[i & 2 ? 'max' : 'min'][1], z = b[i & 4 ? 'max' : 'min'][2];
            const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
            const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
            const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
            minX = Math.min(minX, wx); minY = Math.min(minY, wy); minZ = Math.min(minZ, wz);
            maxX = Math.max(maxX, wx); maxY = Math.max(maxY, wy); maxZ = Math.max(maxZ, wz);
          }
          const x = (minX + maxX) / 2, z = (minZ + maxZ) / 2;
          const radius = Math.max(.001, Math.hypot(maxX - minX, maxZ - minZ) / 2);
          const height = Math.max(.001, maxY - minY);
          if (!clear(x, minY, z, radius, height)
            || !mirrorActorSegmentClear(x, minY, z, x, minY, z, height, null, radius)) return false;
        }
        // Accessories on the head belong to its collision envelope. Held tools
        // and weapons are routine presentation and are not recovery obstacles.
        if (head) for (const child of node.children) pending.push({ node: child, head: true });
      }
      return true;
    },
  };
}
