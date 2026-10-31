// Temporary stone closures for Cloud Hopper. The hub owns its decor masks;
// this module covers the authored entrances without changing the terrain.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild, removeChild } = BL.scene;
  const { box, lathe, merge, moved, turnedY } = BL.models;
  const STONE = [BL.terrain.PALETTE[5], BL.terrain.PALETTE[6], BL.terrain.PALETTE[8]];
  const PLAYER_RADIUS = 0.3;

  // All collision comes from the same closed meshes as the visible stone.
  // show toggles their shared ancestor, which solidProps checks on sync.
  // supportAt/clear query only these closures; the caller combines them with
  // its ordinary island support and movement queries. y is the body's feet.
  const create = ({ root, island, solids }) => {
    const parts = [], unit = island.unit, hq = island.headquarters;
    const rock = (part, x, y, z) => {
      const band = (Math.floor(x) * 3 + Math.floor(y) * 5 + Math.floor(z) * 7) >>> 0;
      const color = STONE[band % STONE.length];
      for (const face of part.faces) face.color = color;
      return part;
    };
    const block = (x, y, z, w, h, d, ry = 0, color = null) => {
      const part = box({ w, h, d, color: "#877869" });
      if (color) for (const face of part.faces) face.color = color;
      else rock(part, x, y, z);
      parts.push(moved(turnedY(part, ry), x, y, z));
    };
    // The cave rim's actual opening is five metres wide and three high, at
    // local z=0.5. Overlap the surrounding quarter-metre terrain voxels so
    // diagonal mouths have no crack along their stair-stepped stone edge.
    for (const mouth of island.mouths) {
      const sr = Math.sin(mouth.ry), cr = Math.cos(mouth.ry);
      for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
        const x = (col - 2.5) * 0.9, y = mouth.floorY - 0.125 + (row + 0.5) * 0.875, z = 0.15;
        block(mouth.x + cr * x + sr * z, y, mouth.z - sr * x + cr * z, 0.9, 0.875, 0.8, mouth.ry);
      }
    }
    // Close the exposed top of each HQ stairwell at lawn height. Once its
    // ceiling is below the lawn, the original terrain already supplies a roof.
    // Segment overlap seals bends as well as the planar entrance throat.
    for (const ramp of hq.ramps) {
      for (let i = 1; i < ramp.samples.length; i++) {
        const a = ramp.samples[i - 1], b = ramp.samples[i];
        if (a.y + 3.5 < -unit && b.y + 3.5 < -unit) break;
        const dx = b.x - a.x, dz = b.z - a.z;
        block((a.x + b.x) * 0.5, -unit + 0.01, (a.z + b.z) * 0.5,
          ramp.width + unit * 2, unit * 2, Math.hypot(dx, dz) + unit * 4, Math.atan2(dx, dz), STONE[0]);
      }
    }
    // A curved closure follows an authored balcony/gallery arc. Its inner
    // radius is the narrowest opening at floor level; the original outer
    // stone overlaps every course, including the underside's taper.
    const arc = (start, end, radius, floor, ceiling) => {
      const columns = Math.max(1, Math.ceil((end - start) * radius / 1.5));
      const step = (end - start) / columns, rows = Math.max(1, Math.ceil((ceiling - floor) / 1.1));
      const height = (ceiling - floor) / rows;
      for (let i = 0; i < columns; i++) {
        const angle = start + (i + 0.5) * step, x = Math.sin(angle) * radius, z = -Math.cos(angle) * radius;
        for (let row = 0; row < rows; row++) {
          block(x, floor + (row + 0.5) * height, z, 2 * radius * Math.tan(step / 2) + unit,
            height, 0.75, -angle);
        }
      }
    };
    for (const window of hq.windows) {
      if (window.kind === "panorama") {
        // This is the broad north HQ entrance/window, not one of the eight
        // cave mouths. Its arc must be sealed independently.
        arc(window.startAngle, window.endAngle, window.radius,
          window.sill - unit, window.sill + window.height + unit);
        continue;
      }
      const radius = window.flare.innerRadius + unit;
      const sx = Math.sin(window.angle), sz = -Math.cos(window.angle);
      const rows = Math.ceil((window.height + unit * 2) / 1.1), h = (window.height + unit * 2) / rows;
      const columns = Math.ceil((window.width + unit * 2) / 1.2), w = (window.width + unit * 2) / columns;
      for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
        const across = (col + 0.5 - columns / 2) * w;
        block(sx * radius - sz * across, window.sill - unit + (row + 0.5) * h,
          sz * radius + sx * across, w, h, 0.75, -window.angle);
      }
    }
    for (const level of [hq, hq.basement]) for (const balcony of level.balconies) {
      arc(balcony.startAngle, balcony.endAngle, balcony.radius + unit * 0.5,
        balcony.floor - unit, balcony.ceiling + unit);
    }
    const plug = (x, z, radius, bottom, top) => {
      const part = lathe({ profile: [[0, bottom], [radius, bottom], [radius, top], [0, top]], segments: 32, color: "#877869" });
      rock(part, x, top, z);
      parts.push(moved(part, x, 0, z));
    };
    // The basement's central shaft also opens through the underside. Filling
    // its complete depth prevents an upward flight beneath the top cap.
    const hole = hq.basement.hole;
    plug(hole.x, hole.z, hole.mouthRadius + unit, hole.bottom - unit, hole.floor + unit);
    // The Factory chimney is the one opening cut after voxel meshing; its
    // radius and world position are supplied by that same construction step.
    if (island.roofOpening) {
      const hole = island.roofOpening, top = island.surfaceAt(hole.x, hole.z);
      plug(hole.x, hole.z, hole.radius + unit, hole.bottom - unit, top + 0.01);
    }
    const node = createNode({ geometry: merge(...parts), visible: false, sightHidden: true });
    addChild(root, node);
    solids.add(node);
    const collision = BL.solidProps.create();
    collision.add(node);
    let visible = false;
    const show = (on) => {
      visible = !!on;
      node.visible = visible;
      collision.sync();
      solids.sync();
    };
    const supportAt = (x, z, y, rise, radius = PLAYER_RADIUS) => visible ? collision.supportAt(x, z, y, rise, radius) : -Infinity;
    const clear = (fromX, fromZ, toX, toZ, y, height, radius = PLAYER_RADIUS) => !visible
      || collision.segmentClear(fromX, y + 1e-5, fromZ, toX, y + 1e-5, toZ, radius, height - 1e-5);
    const dispose = () => {
      visible = false;
      solids.remove(node);
      collision.dispose();
      removeChild(root, node);
    };
    return { node, show, supportAt, clear, dispose };
  };
  BL.cloudHopperIsland = { create };
})();
