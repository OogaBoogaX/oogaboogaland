// Actual Hub lab equipment simulation, shared with the authoritative world.
// Actor ownership and table/held placement survive recovery; rig animation does not.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const create = ({ getLab, getClankers, refreshMirrorObject = () => {} }) => {
    const math = BL.math, { clamp } = math, { addChild } = BL.scene;
    const setVec = (p, x, y, z) => { p.x = x; p.y = y; p.z = z; };
    const LAB_ITEM_INVERSE = math.mat4.create(), LAB_ITEM_LOCAL = math.mat4.create();
    const placeLabDie = (item) => {
      const n = item.node, r = item.roll;
      BL.scene.updateLocal(n);
      // The original die geometry has its base at zero. Rotate around its centre
      // so tipping onto another face never drives a corner through the table.
      const m = n.local, rx = 0.13 * (Math.abs(m[0]) + Math.abs(m[4]) + Math.abs(m[8]));
      const ry = 0.13 * (Math.abs(m[1]) + Math.abs(m[5]) + Math.abs(m[9]));
      const rz = 0.13 * (Math.abs(m[2]) + Math.abs(m[6]) + Math.abs(m[10]));
      const table = item.table;
      if (r.cx < table.minX + rx || r.cx > table.maxX - rx) { r.cx = clamp(r.cx, table.minX + rx, table.maxX - rx); r.vx *= -0.35; }
      if (r.cz < table.minZ + rz || r.cz > table.maxZ - rz) { r.cz = clamp(r.cz, table.minZ + rz, table.maxZ - rz); r.vz *= -0.35; }
      if (r.cy < table.y + ry + 0.001) {
        r.cy = table.y + ry + 0.001;
        if (r.vy < -0.2) { r.bounces++; r.vy *= -0.32; r.vx *= 0.72; r.vz *= 0.72; r.wx *= 0.58; r.wy *= 0.58; r.wz *= 0.58; }
        else r.vy = 0;
      }
      setVec(n.position, r.cx - m[4] * 0.13, r.cy - m[5] * 0.13, r.cz - m[6] * 0.13);
    };
    const settleLabDie = (item) => {
      const n = item.node, r = item.roll;
      setVec(n.rotation, r.tx, r.ty, r.tz);
      r.cy = item.table.y + 0.131; r.vx = r.vy = r.vz = 0;
      placeLabDie(item);
      setVec(item.home, n.position.x, n.position.y, n.position.z);
      setVec(item.homeRotation, n.rotation.x, n.rotation.y, n.rotation.z);
      const m = item.parent.world, y = r.cy + 0.13;
      setVec(item.pickup, m[0] * r.cx + m[4] * y + m[8] * r.cz + m[12],
        m[1] * r.cx + m[5] * y + m[9] * r.cz + m[13], m[2] * r.cx + m[6] * y + m[10] * r.cz + m[14]);
      item.rolling = false;
    };
    const rollLabEquipment = (entry, index) => {
      const item = getLab().equipment[index];
      if (!item || item.kind !== "die" || item.holder !== entry || entry.gorilla.labItem !== item.node) return false;
      const n = item.node, r = item.roll;
      BL.scene.updateWorld(entry.root, entry.root.parent.world);
      math.mat4.invert(LAB_ITEM_INVERSE, item.parent.world);
      math.mat4.multiply(LAB_ITEM_LOCAL, LAB_ITEM_INVERSE, n.world);
      const m = LAB_ITEM_LOCAL;
      r.cx = m[12] + m[4] * 0.13; r.cy = m[13] + m[5] * 0.13; r.cz = m[14] + m[6] * 0.13;
      entry.gorilla.releaseLabItem(); addChild(item.parent, n);
      refreshMirrorObject(entry.root);
      setVec(n.scale, 1, 1, 1);
      setVec(n.rotation, Math.asin(clamp(-m[9], -1, 1)), Math.atan2(m[8], m[10]), Math.atan2(m[1], m[5]));
      r.time = 0; r.bounces = 0;
      r.vx = (entry.random() - 0.5) * 0.22; r.vy = 0.9 + entry.random() * 0.4;
      r.vz = -0.22 - entry.random() * 0.2;
      r.wx = 5 + entry.random() * 4; r.wy = 4 + entry.random() * 3; r.wz = 3 + entry.random() * 5;
      // Land on one of the original die's six faces; the object stays where it
      // settled, becoming the next pickup point instead of snapping back home.
      const face = Math.floor(entry.random() * 6), quarter = Math.PI / 2;
      r.tx = (face < 4 ? face : 0) * quarter; r.tz = face < 4 ? 0 : (face === 4 ? 1 : -1) * quarter;
      r.ty = Math.floor(entry.random() * 4) * quarter;
      item.rolling = true;
      return true;
    };
    const updateLabEquipment = (dt) => {
      let screens = 0, claims = 0;
      for (const e of getClankers().list) if (e.active && e.motion.lab && e.lab.station >= 0) {
        claims |= 1 << e.lab.station;
        if (e.motion.labWork === "type" || e.motion.labWork === "touch") screens |= 1 << e.lab.station;
      }
      getLab().updateScreens(dt, screens, claims);
      for (const item of getLab().equipment) {
        if (!item.rolling) continue;
        const r = item.roll, rotation = item.node.rotation;
        let remaining = Math.min(dt, 0.25);
        while (remaining > 1e-8) {
          const step = Math.min(remaining, 1 / 120); remaining -= step; r.time += step;
          r.vy -= 7 * step; r.cx += r.vx * step; r.cy += r.vy * step; r.cz += r.vz * step;
          if (r.time < 0.9) { rotation.x += r.wx * step; rotation.y += r.wy * step; rotation.z += r.wz * step; }
          else {
            const blend = 1 - Math.exp(-12 * step), drag = Math.exp(-8 * step);
            rotation.x += Math.atan2(Math.sin(r.tx - rotation.x), Math.cos(r.tx - rotation.x)) * blend;
            rotation.y += Math.atan2(Math.sin(r.ty - rotation.y), Math.cos(r.ty - rotation.y)) * blend;
            rotation.z += Math.atan2(Math.sin(r.tz - rotation.z), Math.cos(r.tz - rotation.z)) * blend;
            r.vx *= drag; r.vz *= drag;
          }
          placeLabDie(item);
        }
        if (r.time >= 1.8) settleLabDie(item);
      }
    };
    const returnLabEquipment = (entry) => {
      for (const item of getLab().equipment) {
        if (item.holder !== entry) continue;
        if (item.kind === "die" && item.node.parent === item.parent) {
          if (item.rolling) settleLabDie(item);
          item.holder = null;
          return true;
        }
        entry.gorilla.releaseLabItem();
        addChild(item.parent, item.node);
        refreshMirrorObject(entry.root);
        setVec(item.node.position, item.home.x, item.home.y, item.home.z);
        setVec(item.node.rotation, item.homeRotation.x, item.homeRotation.y, item.homeRotation.z);
        setVec(item.node.scale, item.homeScale.x, item.homeScale.y, item.homeScale.z);
        item.node.quaternion = null; item.node.visible = true; item.holder = null; item.rolling = false;
        return true;
      }
      return false;
    };
    const pickUpLabEquipment = (entry, index) => {
      const item = getLab().equipment[index], p = entry.root.position;
      if (!item || item.holder || entry.gorilla.labItem || !entry.motion.lab
        || Math.hypot(p.x - item.pickup.x, p.z - item.pickup.z) > 2.1
        || Math.abs(p.y - getLab().mouth.floorY) > 0.2) return false;
      entry.gorilla.holdLabItem(item.node);
      refreshMirrorObject(entry.root);
      item.holder = entry;
      return true;
    };

    const createCheckpoint = world => {
      if (typeof world !== "string" || !/^[A-Za-z0-9_.:-]{1,80}$/.test(world)) throw Error("invalid lab recovery world");
      const fail = () => { throw Error("invalid lab equipment checkpoint"); };
      const fields = ["time", "age", "cx", "cy", "cz", "vx", "vy", "vz", "wx", "wy", "wz", "tx", "ty", "tz", "bounces"];
      const vector = p => [p.x, p.y, p.z];
      const dense = (a, length) => Array.isArray(a) && a.length === length && Reflect.ownKeys(a).length === length + 1
        && Array.from({ length }, (_, i) => Object.getOwnPropertyDescriptor(a, i)).every(d => d && "value" in d);
      const numbers = (a, count) => dense(a, count) && a.every(n => Number.isFinite(n) && Math.abs(n) < 10000);
      const identity = (item, index) => `${index}:${item.kind}:${item.station}`;
      const validate = saved => {
        const items = getLab().equipment, actors = getClankers().list;
        if (items.length > 128 || actors.length > 53 || !saved || Object.keys(saved).sort().join() !== "items,v,world"
          || saved.v !== 1 || saved.world !== world || !dense(saved.items, items.length)) fail();
        const holders = new Set();
        for (let i = 0; i < items.length; i++) {
          const row = saved.items[i];
          if (!dense(row, 10) || row[0] !== identity(items[i], i)
            || !Number.isInteger(row[1]) || row[1] < -1 || row[1] >= actors.length
            || typeof row[2] !== "boolean" || typeof row[3] !== "boolean"
            || row[2] && (row[1] < 0 || row[3]) || row[3] && items[i].kind !== "die"
            || !row.slice(4, 8).every(v => numbers(v, 3))
            || (row[2] ? row[8] !== null : !numbers(row[8], 9))
            || !numbers(row[9], fields.length) || row[9][0] < 0 || row[9][1] < 0
            || !Number.isSafeInteger(row[9][14]) || row[9][14] < 0) fail();
          if (row[1] >= 0) {
            if (holders.has(row[1])) fail();
            holders.add(row[1]);
          }
        }
      };
      let restored = false, invalid = false;
      return {
        capture() {
          if (invalid) fail();
          const actors = getClankers().list;
          const saved = { v: 1, world, items: getLab().equipment.map((item, i) => {
            const n = item.node, holder = item.holder == null ? -1 : actors.indexOf(item.holder);
            if (item.holder != null && holder < 0) fail();
            const carried = holder >= 0 && actors[holder].gorilla.labItem === n;
            if (!carried && (n.parent !== item.parent || n.quaternion != null)) fail();
            return [identity(item, i), holder, carried, item.rolling,
              vector(item.home), vector(item.homeRotation), vector(item.homeScale), vector(item.pickup),
              carried ? null : [...vector(n.position), ...vector(n.rotation), ...vector(n.scale)],
              fields.map(key => item.roll[key])];
          }) };
          validate(saved); return saved;
        },
        restore(saved) {
          if (invalid || restored) fail(); validate(saved);
          // The enclosing factory restores all actor and equipment records into
          // a private fresh world, validates its occupancy, then publishes it.
          // A failed application poisons this component; dispose the whole world.
          invalid = true;
          const actors = getClankers().list, items = getLab().equipment;
          for (const actor of actors) actor.gorilla.releaseLabItem();
          for (let i = 0; i < items.length; i++) {
            const item = items[i], row = saved.items[i], n = item.node;
            addChild(item.parent, n); n.quaternion = null;
            item.holder = row[1] < 0 ? null : actors[row[1]]; item.rolling = row[3];
            for (const [key, at] of [["home", 4], ["homeRotation", 5], ["homeScale", 6], ["pickup", 7]]) setVec(item[key], ...row[at]);
            fields.forEach((key, at) => { item.roll[key] = row[9][at]; });
            if (row[2]) item.holder.gorilla.holdLabItem(n);
            else {
              setVec(n.position, ...row[8].slice(0, 3)); setVec(n.rotation, ...row[8].slice(3, 6)); setVec(n.scale, ...row[8].slice(6, 9));
            }
          }
          restored = true; invalid = false;
        }
      };
    };
    return { pickup: pickUpLabEquipment, release: returnLabEquipment, roll: rollLabEquipment,
      update: updateLabEquipment, createCheckpoint };
  };
  BL.npcLabEquipment = { create };
})();
