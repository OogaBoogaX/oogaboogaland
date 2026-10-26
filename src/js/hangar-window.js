// The see-through both ways at the Lightning Jet Hangar's door, on `bifrost-window.js`'s pattern: from the Factory's
// walkway the hangar behind the door's shield, and from the hangar's landing the Factory's hall. Either way the room
// beyond is a light stand-in built once at full size in its own frame, glowing with its own light baked in
// (`HM.doorWindow` for the hangar, `FM.hubWindow`'s hall and chamber for the hall), pulled every frame along each
// point's own sight line from the viewer's eye into the DEPTH metres just behind the shield (`relief`, one central
// collineation on that eye). Moving a point along its sight line never moves it on screen, so the window draws exactly
// what a window into the whole room would, in the ordinary pass, and this room's own depth masks it. What it draws is
// held to the door's passage: across it (`clipSlab`), through the band (`clipSlab2`) and from just over its sill to its
// roof (`clipMinY`, `clipMaxY`); the passage's back, the door's glimpse, stays its backdrop where the stand-in leaves a
// gap. WebGL only: the canvas renderer's painter's sort cannot mask it.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { mat4 } = BL.math;
  const { createNode, addChild, removeChild } = BL.scene;

  // How far behind the relief's axis plane (half a metre behind the shield) the room at infinity lands; the passage's
  // half-width and height the drawn relief keeps to, inside its walls and under its roof.
  const DEPTH = 0.8, HALF = 2.45, TOP = 5;
  // The window shows while the eye stands in front of the shield, and no farther from the doorway's middle than FAR.
  const NEAR = 0.05, FAR = 45, MIDDLE = 2;

  // Scratch for the frame: the eye in the door's frame, the relief, and the room beyond to the world through it.
  const EYE = new Float64Array(3), RELIEF = mat4.create(), TMP = mat4.create(), W = mat4.create();
  // Every batch's instance version, counted for the page, so a batch made on a later visit never repeats one its
  // geometry's record has already uploaded.
  let version = 0;
  // Each stand-in piece as one door draws it, projective and clipped to that door's passage: made once for the page
  // and again only if the door stands somewhere else, so every visit draws the same geometries.
  const clipped = new WeakMap();

  // The door-frame central collineation centred on the eye (ex, ey, ez): the axis plane z = axis stays put and the
  // plane at infinity comes to z = axis - DEPTH, so every point behind the axis moves along its own sight line into
  // that band, never past the eye. Column-major; its last row is not (0, 0, 0, 1), so what it draws is `projective`.
  const relief = (out, ex, ey, ez, axis) => {
    const c = 1 / (ez - axis + DEPTH);
    out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
    out[8] = -ex * c; out[9] = -ey * c; out[10] = 1 - ez * c; out[11] = -c;
    out[12] = ex * axis * c; out[13] = ey * axis * c; out[14] = ez * axis * c; out[15] = 1 + axis * c;
    return out;
  };

  // The room beyond's frame to this side's door frame, for a door standing at (x, y, z) turned `turn` in that room:
  // the two sides are one door seen from either face, so this side's frame is that one's turned half round about the
  // shield's plane, `plane` metres out along each door's +z.
  const across = (x, y, z, turn, plane) => {
    const there = mat4.invert(mat4.create(), mat4.fromTRS(mat4.create(), { x, y, z }, { x: 0, y: turn, z: 0 }, { x: 1, y: 1, z: 1 }));
    const flip = mat4.create();
    flip[0] = -1; flip[10] = -1; flip[14] = 2 * plane;
    return mat4.multiply(mat4.create(), flip, there);
  };

  // The window at a door: `group` is the door's node under the scene's root, its +z out into this room and its sill at
  // y 0, so its own placement is the door's frame in the world; `pieces` are the stand-in's geometries in the room
  // beyond's frame, `beyond` that frame to the door's (`across`), and `plane` where the shield stands.
  const create = ({ group, pieces, beyond, plane }) => {
    const GROUP = mat4.fromTRS(mat4.create(), group.position, group.rotation, group.scale), TO_DOOR = mat4.invert(mat4.create(), GROUP);
    const axis = plane - 0.5, mid = axis - DEPTH / 2, band = DEPTH / 2 + 0.05;
    const ax = GROUP[0], az = GROUP[2], zx = GROUP[8], zz = GROUP[10], ox = GROUP[12], oy = GROUP[13], oz = GROUP[14];
    const clipSlab = new Float32Array([ax / HALF, 0, az / HALF, -(ax * ox + az * oz) / HALF]);
    const clipSlab2 = new Float32Array([zx / band, 0, zz / band, -(zx * ox + zz * oz + mid) / band]);
    // Every batch culls as the clip box, the only place any of it draws.
    const sphere = [ox + zx * mid, oy + TOP / 2, oz + zz * mid, Math.hypot(HALF, TOP / 2, band) + 0.1];
    const at = `${ox},${oy},${oz},${ax},${az}`, clip = (geometry) => {
      const kept = clipped.get(geometry);
      if (kept && kept.at === at) return kept.geo;
      const geo = { ...geometry, projective: true, clipMinY: oy + 0.01, clipMaxY: oy + TOP, clipSlab, clipSlab2 };
      clipped.set(geometry, { at, geo });
      return geo;
    };
    // Every instance glows fully in its baked colours and keeps its own palette in the Matrix (mode 5).
    const batch = (geometry) => {
      const data = new Float32Array(20);
      data[16] = 1;
      data[18] = 5;
      return createNode({ geometry: clip(geometry), instanceData: data, instanceCount: 0, instanceVersion: version, fixedInstanceCapacity: true, cullSphere: sphere, visible: false });
    };
    const root = createNode({ sightHidden: true, matrixNative: true, visible: false }), batches = pieces.map(batch);
    addChild(root, ...batches);
    addChild(group, root);

    // Called once the camera is final for the frame. The window hides with the eye behind or at the shield, or past FAR.
    const update = (camera) => {
      const P = camera.position;
      mat4.transformPoint(EYE, TO_DOOR, P.x, P.y, P.z);
      const ex = EYE[0], ey = EYE[1], ez = EYE[2];
      const shown = ez - plane > NEAR && Math.hypot(ex, ey - MIDDLE, ez - plane) < FAR;
      root.visible = shown;
      if (!shown) return;
      mat4.multiply(TMP, relief(RELIEF, ex, ey, ez, axis), beyond);
      mat4.multiply(W, GROUP, TMP);
      version++;
      for (let i = 0; i < batches.length; i++) {
        const n = batches[i];
        n.instanceData.set(W, 0);
        n.instanceCount = 1;
        n.instanceVersion = version;
        n.visible = true;
      }
    };

    const dispose = () => {
      root.visible = false;
      removeChild(group, root);
    };
    return { root, update, dispose, get shown() { return root.visible; } };
  };

  BL.hangarWindow = { create, across, DEPTH, FAR };
})();
