// Display-only lab snapshot. Held items are posed by their Clanker; loose items
// and screens are absolute transforms, never client-simulated continuations.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {}, MAX_BYTES = 8192;
  const bad = () => { throw Error("invalid lab presentation"); };
  const id = s => typeof s === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(s);
  const dense = a => Array.isArray(a) && Object.keys(a).length === a.length;
  const row = a => dense(a) && a.length === 10 && (a[0] === 0 || a[0] === 1)
    && a.slice(1).every(n => Number.isFinite(n) && Math.abs(n) <= 10000)
    && a.slice(7).every(n => n >= 0 && n <= 100);
  const validate = value => {
    if (!value || Object.keys(value).sort().join() !== "items,screens,v" || value.v !== 1
      || !dense(value.items) || value.items.length > 16 || !dense(value.screens) || value.screens.length > 8) bad();
    const items = new Set(), screens = new Set();
    for (const item of value.items) {
      if (!dense(item) || item.length !== 2 || !id(item[0]) || items.has(item[0])
        || item[1] !== null && !row(item[1])) bad();
      items.add(item[0]);
    }
    for (const screen of value.screens) {
      if (!dense(screen) || screen.length !== 2 || !Number.isInteger(screen[0]) || screen[0] < 0 || screen[0] > 30
        || screens.has(screen[0]) || !dense(screen[1]) || !screen[1].length || screen[1].length > 16
        || !screen[1].every(row)) bad();
      screens.add(screen[0]);
    }
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_BYTES) bad();
    return value;
  };
  const create = getLab => {
    const identity = (item, index) => `${index}:${item.kind}:${item.station}`;
    const nodes = display => [display.node, ...display.strips, ...display.markers,
      ...(display.work ? [display.work.node, ...display.work.strips, ...display.work.markers] : [])];
    const captureNode = n => {
      if (n.quaternion) bad();
      return [+n.visible, n.position.x, n.position.y, n.position.z,
        n.rotation.x, n.rotation.y, n.rotation.z, n.scale.x, n.scale.y, n.scale.z];
    };
    const validateRig = (value, held) => {
      validate(value);
      const lab = getLab();
      if (!(held instanceof Set) || value.items.length !== lab.equipment.length || value.screens.length !== lab.displays.length) bad();
      for (let i = 0; i < value.items.length; i++) {
        const item = value.items[i];
        if (item[0] !== identity(lab.equipment[i], i) || (item[1] === null) !== held.has(item[0])) bad();
      }
      for (const id of held) if (!value.items.some(item => item[0] === id)) bad();
      for (let i = 0; i < value.screens.length; i++) {
        if (value.screens[i][0] !== lab.displays[i].station
          || value.screens[i][1].length !== nodes(lab.displays[i]).length) bad();
      }
    };
    const applyNode = (node, values) => {
      node.visible = !!values[0]; node.quaternion = null;
      for (let i = 0; i < 3; i++) {
        const axis = ["x", "y", "z"][i];
        node.position[axis] = values[1 + i]; node.rotation[axis] = values[4 + i]; node.scale[axis] = values[7 + i];
      }
      BL.scene.updateLocal(node);
    };
    return {
      validate: validateRig,
      capture() {
        const lab = getLab();
        return validate({ v: 1,
          items: lab.equipment.map((item, i) => [identity(item, i), item.holder?.gorilla.labItem === item.node ? null : captureNode(item.node)]),
          screens: lab.displays.map(display => [display.station, nodes(display).map(captureNode)]) });
      },
      apply(value, held) {
        validateRig(value, held);
        const lab = getLab();
        for (let i = 0; i < value.items.length; i++) if (value.items[i][1] !== null) {
          const item = lab.equipment[i];
          if (item.node.parent !== item.parent || item.holder?.gorilla.labItem === item.node) bad();
        }
        for (let i = 0; i < value.items.length; i++) if (value.items[i][1] !== null) {
          const item = lab.equipment[i]; item.holder = null; item.rolling = false;
          applyNode(item.node, value.items[i][1]);
        }
        for (let i = 0; i < value.screens.length; i++) {
          const list = nodes(lab.displays[i]);
          for (let k = 0; k < list.length; k++) applyNode(list[k], value.screens[i][1][k]);
        }
      },
    };
  };
  BL.npcLabPose = { MAX_BYTES, validate, create };
})();
