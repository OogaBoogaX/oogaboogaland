// Actual headwear envelope and intact mirror-plane sweeps, without camera state.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {}, terrain = BL.terrain;
  const create = ({ getMirror, radius: PLAYER_RADIUS, eyeForward, portalZ: PORTAL_Z }) => {
    if (typeof getMirror !== "function" || ![PLAYER_RADIUS, eyeForward, PORTAL_Z].every(Number.isFinite)
      || PLAYER_RADIUS <= 0) throw Error("Hub mirror clearance providers required");
  const MIRROR_ACTOR_RADII = new WeakMap();
  const mirrorPartReach = (geometry, m, x, y, z) => {
    const b = BL.scene.boundsOf(geometry);
    let reach = 0;
    for (let corner = 0; corner < 8; corner++) {
      const px = corner & 1 ? b.max[0] : b.min[0], py = corner & 2 ? b.max[1] : b.min[1], pz = corner & 4 ? b.max[2] : b.min[2];
      reach = Math.max(reach, Math.hypot(m[0] * px + m[4] * py + m[8] * pz + m[12] - x,
        m[1] * px + m[5] * py + m[9] * pz + m[13] - y,
        m[2] * px + m[6] * py + m[10] * pz + m[14] - z));
    }
    return reach;
  };
  const mirrorHeadReach = (node, x, y, z) => {
    if (!node.visible) return 0;
    let reach = node.geometry ? mirrorPartReach(node.geometry, node.world, x, y, z) : 0;
    for (let i = 0; i < node.children.length; i++) reach = Math.max(reach, mirrorHeadReach(node.children[i], x, y, z));
    return reach;
  };
  const mirrorActorRadius = (actor) => {
    let radius = MIRROR_ACTOR_RADII.get(actor);
    if (radius !== undefined) return radius;
    BL.scene.updateWorld(actor.root, actor.root.parent?.world);
    // Away actors still need current accessory transforms when gear changes.
    BL.scene.updateWorld(actor.parts.head, actor.root.world);
    const head = actor.parts.head, m = head.world;
    const reach = Math.max(mirrorHeadReach(head, m[12], m[13], m[14]), mirrorPartReach(actor.headClosed, m, m[12], m[13], m[14]));
    // A sphere about the head pivot contains every yaw/pitch, including hats
    // and masks. Held weapons stay outside this physical clearance envelope.
    // The close view uses a 0.1 m near plane; reserve its oblique corners too.
    radius = Math.max(PLAYER_RADIUS, actor.bodyRadius, Math.hypot(actor.sleepParts.headX, actor.sleepParts.headZ) + reach, eyeForward + 0.2) + 0.015;
    MIRROR_ACTOR_RADII.set(actor, radius);
    return radius;
  };
  const mirrorActorSegmentClear = (x, y, z, toX, toY, toZ, height, actor, fixedRadius = 0) => {
    if (!fixedRadius && !actor) return true;
    const mirrorCave = getMirror(), m = mirrorCave.mouth, sr = Math.sin(m.ry), cr = Math.cos(m.ry);
    const bounds = BL.scene.boundsOf(mirrorCave.node.geometry), radius = fixedRadius || mirrorActorRadius(actor);
    const bottom = mirrorCave.node.position.y + bounds.min[1], top = mirrorCave.node.position.y + bounds.max[1];
    if (Math.min(y, toY) >= m.floorY + top || Math.max(y, toY) + height <= m.floorY + bottom) return true;
    const lx = (x - m.x) * cr - (z - m.z) * sr, lz = (x - m.x) * sr + (z - m.z) * cr;
    const dx = (toX - x) * cr - (toZ - z) * sr, dz = (toX - x) * sr + (toZ - z) * cr;
    if (Math.min(lz, lz + dz) > PORTAL_Z + radius || Math.max(lz, lz + dz) < PORTAL_Z - radius) return true;
    // The intact glass keeps the complete actor outside, including headwear.
    return terrain.segmentBoxClear(lx, y - m.floorY, lz, dx, toY - y, dz, radius, height,
      bounds.min[0], bottom, PORTAL_Z, bounds.max[0], top, PORTAL_Z);
  };
    return { mirrorActorSegmentClear, mirrorActorRadius, invalidate: actor => MIRROR_ACTOR_RADII.delete(actor) };
  };
  BL.hubMirrorClearance = { create };
})();
