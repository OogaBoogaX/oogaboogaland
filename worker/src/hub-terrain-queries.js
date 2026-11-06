// Host-only terrain representation. Voxel/window/sight data already describes
// solid terrain; only continuous ramp faces are read by the shared queries.
// Keep their order, metadata, colours and exact Float64 coordinates. Browser
// terrain snapshots and rendering geometry are untouched.
export function hubTerrainQueries(snapshot) {
  const fail = () => { throw Error('invalid host terrain query geometry'); };
  const geometry = snapshot?.geometry, offset = snapshot?.rampFaceOffset;
  if (!(geometry?.verts instanceof Float64Array) || geometry.verts.length % 3
    || !Array.isArray(geometry.faces) || geometry.faces.length > 200000
    || !Number.isSafeInteger(offset) || offset < 0
    || !(snapshot.rampSight instanceof Float64Array) || snapshot.rampSight.length % 17
    || !(snapshot.rampCollision instanceof Uint32Array) || !(snapshot.basementCollision instanceof Uint32Array)) fail();
  const count = snapshot.rampSight.length / 17;
  if (offset + count > geometry.faces.length) fail();
  for (const ranges of [snapshot.rampCollision, snapshot.basementCollision]) {
    for (const range of ranges) if ((range >>> 2) + (range & 3) > count) fail();
  }
  const vertices = [], remap = new Map(), faces = [];
  for (let n = 0; n < count; n++) {
    const face = geometry.faces[offset + n];
    if (!Array.isArray(face?.i) || face.i.length < 3 || face.i.length > 72) fail();
    const indices = face.i.map(index => {
      if (!Number.isSafeInteger(index) || index < 0 || index * 3 + 2 >= geometry.verts.length) fail();
      if (!remap.has(index)) {
        remap.set(index, vertices.length / 3);
        for (let axis = 0; axis < 3; axis++) {
          const value = geometry.verts[index * 3 + axis];
          if (!Number.isFinite(value)) fail();
          vertices.push(value);
        }
      }
      return remap.get(index);
    });
    faces.push({ ...face, i: indices });
  }
  return { ...snapshot, rampFaceOffset: 0,
    geometry: { ...geometry, verts: Float64Array.from(vertices), faces } };
}
