(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { mat4 } = BL.math;
  const createNode = (options = {}) => ({
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    geometry: null,
    glow: 1,
    highlight: 0,
    visible: true,
    parent: null,
    children: [],
    world: mat4.create(),
    local: mat4.create(),
    ...options
  });
  const addChild = (parent, ...children) => {
    for (const child of children) {
      child.parent = parent;
      parent.children.push(child);
    }
    return parent;
  };
  const removeChild = (parent, child) => {
    const i = parent.children.indexOf(child);
    if (i >= 0) {
      parent.children.splice(i, 1);
      child.parent = null;
    }
  };
  const updateWorld = (node, parentWorld) => {
    if (!node.visible) return;
    mat4.fromTRS(node.local, node.position, node.rotation, node.scale);
    if (parentWorld) mat4.multiply(node.world, parentWorld, node.local);
    else node.world.set(node.local);
    for (const child of node.children) updateWorld(child, node.world);
  };
  const traverseVisible = (node, fn) => {
    if (!node.visible) return;
    fn(node);
    for (const child of node.children) traverseVisible(child, fn);
  };
  const createCamera = ({ fov = 50, near = 0.2, far = 60 } = {}) => ({
    fov: fov * Math.PI / 180,
    near,
    far,
    position: { x: 0, y: 3, z: 8 },
    target: { x: 0, y: 1, z: 0 }
  });
  const boundsCache = new WeakMap();
  const boundsOf = (geometry) => {
    let b = boundsCache.get(geometry);
    if (b) return b;
    const v = geometry.verts;
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < v.length; i += 3) {
      minX = Math.min(minX, v[i]);
      maxX = Math.max(maxX, v[i]);
      minY = Math.min(minY, v[i + 1]);
      maxY = Math.max(maxY, v[i + 1]);
      minZ = Math.min(minZ, v[i + 2]);
      maxZ = Math.max(maxZ, v[i + 2]);
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    let r2 = 0;
    for (let i = 0; i < v.length; i += 3) {
      const dx = v[i] - cx, dy = v[i + 1] - cy, dz = v[i + 2] - cz;
      r2 = Math.max(r2, dx * dx + dy * dy + dz * dz);
    }
    b = { center: [cx, cy, cz], radius: Math.sqrt(r2), min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
    boundsCache.set(geometry, b);
    return b;
  };
  const tweens = [];
  const addTween = ({ delay = 0, dur, ease = (t) => t, update, done }) => {
    const tw = { delay, dur, ease, update, done, t: 0, alive: true };
    tweens.push(tw);
    return tw;
  };
  const stepTweens = (dt) => {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      if (!tw.alive) {
        tweens.splice(i, 1);
        continue;
      }
      if (tw.delay > 0) {
        tw.delay -= dt;
        continue;
      }
      tw.t += dt / tw.dur;
      const k = Math.min(1, tw.t);
      tw.update(tw.ease(k));
      if (k >= 1) {
        tweens.splice(i, 1);
        tw.alive = false;
        if (tw.done) tw.done();
      }
    }
  };
  const tweenCount = () => tweens.length;
  const clearTweens = () => {
    for (const tw of tweens) tw.alive = false;
    tweens.length = 0;
  };
  BL.scene = { createNode, addChild, removeChild, updateWorld, traverseVisible, createCamera, boundsOf, addTween, stepTweens, tweenCount, clearTweens };
})();
