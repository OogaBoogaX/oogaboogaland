// The island view's opt-in Live view (island-view.js; docs/ooga-chat-hosts.md, "The island view"), as the Observatory's
// screens are camera feeds (observatory-cameras.js): the game's own renderer (gl-renderer.js) on the strip's own canvas,
// drawing a reduced Main Island (its ground and the banana pile, no NPCs and nothing to press) from a fixed far camera a
// few times a second, with each walking speaker stood as a plain body (observatory-visitors.js's shape) where the chat
// says they are, under the light the map was baked in (island-view-data.js). Nothing is captured or sent: it is drawn in
// the viewer's own browser. Ooga Chat fetches it and the renderer's code as its `live` chunk only when the viewer turns
// Live view on; the island page has them already and hands `prepare` the island its own scene built (`from`), so the
// ground is not built twice. `prepare(from)` resolves to the island (built once, in slices, where the page has none),
// `create(canvas, { ground, data })` returns `{ place(i, x, y, z, yaw, on), render(), project(x, y, z, out), resize(),
// dispose() }`.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const SLOTS = 32;
  let built = null;
  const prepare = (from) => {
    const own = from && from();
    if (own) return Promise.resolve(own);
    built ||= BL.buildTasks.run(BL.terrain.islandSteps({ seed: 1 }, { until: 0, budget: 8, work: 0 }), "island-view").catch((error) => { built = null; throw error; });
    return built;
  };
  let body = null;
  const bodyGeometry = () => body ||= (() => {
    const { box, merge } = BL.models;
    const g = merge(
      box({ w: 0.55, h: 0.55, d: 0.5, color: "#be9873", offset: { y: 1.2 } }),
      box({ w: 0.6, h: 0.58, d: 0.36, color: "#987b57", offset: { y: 0.68 } }),
      box({ w: 0.64, h: 0.22, d: 0.39, color: "#4d5b39", offset: { y: 0.38 } }),
      ...[-1, 1].flatMap((side) => [
        box({ w: 0.18, h: 0.46, d: 0.2, color: "#be9873", offset: { x: side * 0.39, y: 0.72 } }),
        box({ w: 0.2, h: 0.3, d: 0.27, color: "#be9873", offset: { x: side * 0.18, y: 0.15 } })]));
    g.castShadow = false;
    return g;
  })();
  const create = (canvas, { ground, data }) => {
    const { createNode, addChild, updateWorld, createCamera } = BL.scene;
    const renderer = BL.glRenderer.createRenderer(canvas, { quality: "low" });
    const root = createNode();
    addChild(root, createNode({ geometry: ground.geometry }));
    addChild(root, createNode({ geometry: BL.models.bananaPileCoreGeometry(2.7, 2.88, 0.45), position: { x: 0, y: 0.36, z: 0 }, scale: { x: 2.2, y: 0.9, z: 2.2 } }));
    // Bodies stand twice life size, so a speaker reads from this far out.
    const bodies = [];
    for (let i = 0; i < SLOTS; i++) {
      const node = createNode({ geometry: bodyGeometry(), scale: { x: 2, y: 2, z: 2 }, visible: false });
      addChild(root, node);
      bodies.push(node);
    }
    // From the south and above, framing the island's meadow and its bridges' ends.
    const camera = createCamera({ fov: 40, near: 5, far: 900 });
    camera.position = { x: 0, y: 58, z: 74 };
    camera.target = { x: 0, y: -2, z: 2 };
    const opts = { ...data.light, lights: null, lightCount: 0, shadowCenter: { x: 0, y: 0, z: 0 }, shadowExtent: 90 };
    renderer.resize();
    return {
      place(i, x, y, z, yaw, on) {
        const node = bodies[i];
        node.visible = on;
        if (!on) return;
        node.position.x = x; node.position.y = y; node.position.z = z;
        node.rotation.y = yaw;
      },
      render() { updateWorld(root); return renderer.render(root, camera, opts); },
      project: (x, y, z, out) => renderer.project(x, y, z, out),
      resize: () => renderer.resize(),
      dispose() { renderer.dispose(); root.children.length = 0; bodies.length = 0; }
    };
  };
  BL.islandViewLive = { prepare, create };
})();
