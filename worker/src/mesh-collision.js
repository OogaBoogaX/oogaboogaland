// Actual solid-prop kernels, independent of DOM/renderer. The catalog is an
// explicitly authored collision bundle, NOT an exporter for the complete hub.
import "../../src/js/math.js";
import "../../src/js/convex.js";
import "../../src/js/solid-props.js";

export const COLLISION = Object.freeze({ kernel: "solid-props-1", nodes: 128, geometries: 64, vertices: 16384,
  triangles: 16384, placedTriangles: 32768, bundleBytes: 2 * 1024 * 1024, checkpointBytes: 48 * 1024 });
const bad = () => { throw new Error("invalid mesh collision state"); };
const exact = (o, keys) => o && typeof o === "object" && !Array.isArray(o)
  && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null)
  && Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k));
const array = (a, lo, hi) => Array.isArray(a) && a.length >= lo && a.length <= hi
  && Object.keys(a).length === a.length && Object.keys(a).every((k, i) => k === String(i));
const finite = (n, bound = 10000) => Number.isFinite(n) && Math.abs(n) <= bound;
const id = s => typeof s === "string" && /^[a-zA-Z0-9_.:-]{1,80}$/.test(s);
const vector = (v, scale = false) => exact(v, ["x", "y", "z"])
  && [v.x, v.y, v.z].every(n => scale ? finite(n, 100) && n >= 0.01 : finite(n));
const pose = p => exact(p, ["id", "position", "rotation", "scale", "visible"]) && id(p.id)
  && vector(p.position) && vector(p.rotation) && vector(p.scale, true) && typeof p.visible === "boolean";
const copyVector = v => ({ x: v?.x, y: v?.y, z: v?.z });
const copyPose = p => ({ id: p.id, position: copyVector(p.position), rotation: copyVector(p.rotation),
  scale: copyVector(p.scale), visible: p.visible });
const bytes = v => new TextEncoder().encode(JSON.stringify(v));

// Preparation (including hashing and BVHs) happens outside storage transactions.
// Only flat TRS meshes are supported. Hierarchy/quaternions, instances, special
// gorillaSteps and collisionGeometry must be explicitly exported first; unknown
// fields are rejected instead of silently dropping their collision semantics.
export async function prepareMeshCollision(input) {
  if (!exact(input, ["v", "world", "geometries", "nodes"]) || input.v !== 1 || !id(input.world)
    || !array(input.geometries, 1, COLLISION.geometries) || !array(input.nodes, 1, COLLISION.nodes)) bad();
  const geometries = [], names = new Map(), counts = new Map(), nodes = [], nodeIds = new Set();
  let vertexCount = 0, triangleCount = 0, placedTriangles = 0;
  for (const g of input.geometries) {
    if (!exact(g, ["id", "verts", "faces"]) || !id(g.id) || names.has(g.id)
      || !array(g.verts, 9, COLLISION.vertices * 3) || g.verts.length % 3
      || !array(g.faces, 1, COLLISION.triangles)) bad();
    vertexCount += g.verts.length / 3;
    if (vertexCount > COLLISION.vertices || !g.verts.every(n => finite(n))) bad();
    const faces = [];
    for (const f of g.faces) {
      if (!exact(f, ["i", "gorillaStep", "supportOnly", "ragePass"]) || !array(f.i, 3, 8)
        || !f.i.every(n => Number.isInteger(n) && n >= 0 && n < g.verts.length / 3)
        || [f.gorillaStep, f.supportOnly, f.ragePass].some(v => typeof v !== "boolean")) bad();
      triangleCount += f.i.length - 2;
      if (triangleCount > COLLISION.triangles) bad();
      faces.push({ i: f.i.slice(), gorillaStep: f.gorillaStep, supportOnly: f.supportOnly, ragePass: f.ragePass });
    }
    const geometry = { id: g.id, verts: g.verts.slice(), faces };
    names.set(g.id, geometry); geometries.push(geometry);
    counts.set(g.id, faces.reduce((sum, f) => sum + f.i.length - 2, 0));
  }
  for (const n of input.nodes) {
    if (!exact(n, ["id", "geometry", "position", "rotation", "scale", "visible",
      "shoulderOnly", "climbMasonry", "gorillaStepAll", "ragePass"]) || !id(n.id) || nodeIds.has(n.id)
      || !names.has(n.geometry) || !pose(copyPose(n))
      || [n.shoulderOnly, n.climbMasonry, n.gorillaStepAll, n.ragePass].some(v => typeof v !== "boolean")) bad();
    // Validate original vectors too: copying must never erase an unknown field.
    if (!vector(n.position) || !vector(n.rotation) || !vector(n.scale, true)) bad();
    placedTriangles += counts.get(n.geometry);
    if (placedTriangles > COLLISION.placedTriangles) bad();
    nodeIds.add(n.id);
    nodes.push({ ...copyPose(n), geometry: n.geometry, shoulderOnly: n.shoulderOnly,
      climbMasonry: n.climbMasonry, gorillaStepAll: n.gorillaStepAll, ragePass: n.ragePass });
  }
  const catalog = { v: 1, kernel: COLLISION.kernel, world: input.world, geometries, nodes }, encoded = bytes(catalog);
  if (encoded.length > COLLISION.bundleBytes) bad();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoded)), n => n.toString(16).padStart(2, "0")).join("");
  for (const geometry of geometries) globalThis.BL.solidProps.prepare(geometry);
  const read = saved => {
    if (!exact(saved, ["v", "world", "digest", "poses"]) || saved.v !== 1 || saved.world !== catalog.world
      || saved.digest !== digest || !array(saved.poses, nodes.length, nodes.length)
      || saved.poses.some((p, i) => !pose(p) || p.id !== nodes[i].id)
      || bytes(saved).length > COLLISION.checkpointBytes) bad();
    return saved.poses.map(copyPose);
  };
  return {
    digest,
    envelope: Object.freeze({ nodes: nodes.length, geometries: geometries.length, vertices: vertexCount,
      triangles: triangleCount, placedTriangles, bundleBytes: encoded.length }),
    validate(saved) { read(saved); return true; },
    create(saved) {
      const poses = saved === undefined ? nodes.map(copyPose) : read(saved);
      const solids = globalThis.BL.solidProps.create(), placed = nodes.map((n, i) => ({ ...n, ...poses[i],
        geometry: names.get(n.geometry), children: [], parent: null,
        local: globalThis.BL.math.mat4.create(), world: globalThis.BL.math.mat4.create() }));
      for (const n of placed) solids.add(n, n.shoulderOnly);
      solids.sync();
      return {
        capture() {
          const saved = { v: 1, world: catalog.world, digest, poses: placed.map(copyPose) };
          if (bytes(saved).length > COLLISION.checkpointBytes) bad();
          return saved;
        },
        restore(saved) {
          const poses = read(saved); // Validate the entire checkpoint before changing a single node.
          for (let i = 0; i < placed.length; i++) Object.assign(placed[i], poses[i]);
          solids.sync();
        },
        clearAt(x, y, z, radius, height) {
          check(x, y, z, radius, height);
          return solids.clearAt(x, y, z, radius, height);
        },
        segmentClear(x, y, z, toX, toY, toZ, radius, height) {
          check(x, y, z, radius, height); check(toX, toY, toZ, radius, height);
          return solids.segmentClear(x, y, z, toX, toY, toZ, radius, height);
        },
        supportAt(x, z, y, maxStep = 0, radius = 0) {
          check(x, y, z, radius, 0);
          if (!finite(maxStep, 10) || maxStep < 0) bad();
          return solids.supportAt(x, z, y, maxStep, radius);
        },
        ceilingAt(x, z, y, radius = 0) {
          check(x, y, z, radius, 0);
          return solids.ceilingAt(x, z, y, radius);
        },
        stats: () => ({ ...solids.stats }),
      };
    },
  };
}

function check(x, y, z, radius, height) {
  if (![x, y, z].every(n => finite(n)) || !finite(radius, 2) || radius < 0 || !finite(height, 10) || height < 0) bad();
}
