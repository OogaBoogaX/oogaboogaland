// Real managed rig and renderer math in a browser-free VM, with an authored world.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
export const managedRigs = ({ presence = false } = {}) => {
  const context = { window: {}, TextEncoder };
  for (const name of ["math", "scene", "models", "hero-body", "convex", "npc-authority", "clanker-pose", "npc-pose-packet", "clanker-state"]) {
    runInNewContext(readFileSync(new URL(`../../../src/js/${name}.js`, import.meta.url), "utf8"), context);
  }
  const B = context.window.BL;
  Object.assign(B, { pilot: { WALK: { speed: 2.8, gravity: 9.8 } }, crew: { JUMP_SPEED: 4 } });
  runInNewContext(readFileSync(new URL("../../../src/js/agent.js", import.meta.url), "utf8"), context);
  let reduced = false;
  if (presence) {
    context.window.matchMedia = () => ({ get matches() { return reduced; } });
    for (const name of ["hub-models", "sleep-beam", "host-presence"]) runInNewContext(readFileSync(new URL(`../../../src/js/${name}.js`, import.meta.url), "utf8"), context);
  }
  const mouth = { x: 0, z: 0, ry: .3, floorY: 0 };
  const options = { managed: true, groundAt: () => 0, scale: 1.15,
    coatClip: B.agent.labCoatClip(mouth), suitClip: B.agent.suitClip({ ...mouth, x: 20 }), suitColor: 2 };
  const geometryIds = new Map();
  // Actual renderer world transforms and selected geometries, not a second pose formula.
  const display = rig => {
    B.scene.updateWorld(rig.root); const rows = [];
    const visit = (n, visible = true) => {
      visible = visible && n.visible;
      if (n.geometry && !geometryIds.has(n.geometry)) geometryIds.set(n.geometry, geometryIds.size + 1);
      rows.push([visible, geometryIds.get(n.geometry) || 0, visible ? Array.from(n.world) : null,
        n.glow, n.scorch, n.ember, !!n.matrixNative, !!n.matrixLiving]);
      for (const child of n.children) visit(child, visible);
    };
    visit(rig.root); return JSON.stringify(rows);
  };
  return { B, options, make: () => B.agent.create(options), display, setReduced: value => { reduced = value; } };
};
