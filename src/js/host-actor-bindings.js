// Inactive presentation bindings for independent NPC tracks and player bodies.
// No spawning, possession, AI override, collision change or authority claim.
// The scene supplies two already-created actors; its source-owned body adapter
// is responsible for the committed position, physical recovery and equipment.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {}, MAX = 32, NODES = 256, GHOST = .28;
  const name = v => typeof v === "string" && /^[A-Za-z0-9._:/-]{1,64}$/.test(v);
  const positive = v => Number.isSafeInteger(v) && v > 0;
  const fail = () => { throw Error("invalid independent host actor binding"); };
  const create = ({ root, capacity = MAX }) => {
    if (!root || !Array.isArray(root.children) || !Number.isInteger(capacity) || capacity < 1 || capacity > MAX) fail();
    const rows = new Map(), npcRoots = new Map(); let disposed = false;
    const ready = () => { if (disposed) fail(); };
    const restore = row => {
      for (const saved of row.nodes) {
        // Another owner may have intentionally changed this visual since bind.
        // Release only the values still owned by this binding.
        if (saved.node.smokeOpacity !== saved.applied) continue;
        if (saved.had) saved.node.smokeOpacity = saved.opacity;
        else delete saved.node.smokeOpacity;
      }
    };
    const collect = (actor, previous) => {
      const nodes = [], seen = new Set(), old = new Map(previous?.nodes.map(s => [s.node, s]) || []);
      const visit = (node, parent) => {
        if (!node || node.parent !== parent || !Array.isArray(node.children) || seen.has(node) || seen.size >= NODES) fail();
        seen.add(node);
        const saved = old.get(node), ours = saved && node.smokeOpacity === saved.applied;
        const had = ours ? saved.had : Object.hasOwn(node, "smokeOpacity"), opacity = ours ? saved.opacity : node.smokeOpacity;
        if (had && (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)) fail();
        nodes.push({ node, had, opacity, applied: (had ? opacity : 1) * GHOST });
        for (const child of node.children) visit(child, node);
      };
      visit(actor.root, root); return nodes;
    };
    const bind = ({ bodyId, kind, generation, actor, npc = null, freeArm = null }) => {
      ready();
      if (!name(bodyId) || !["ooga", "clanker"].includes(kind) || !positive(generation)
        || !actor?.parts || !Array.isArray(actor.root?.children) || actor.root.parent !== root
        || ![null, "armL", "armR"].includes(freeArm)
        || npc && (!npc.parts || npc.root === actor.root || npc.root?.parent !== root)) fail();
      const old = rows.get(bodyId);
      if (!old && rows.size >= capacity || old && (generation < old.generation || old.kind !== kind
        || generation === old.generation && (old.actor !== actor || old.npc !== npc))) fail();
      for (const row of rows.values()) if (row !== old && (row.actor.root === actor.root || row.npc?.root === actor.root
        || npc && (row.actor.root === npc.root || row.npc?.root === npc.root))) fail();
      // Validate the entire tree before changing any node or prior binding.
      const nodes = npc ? collect(npc, old?.npc === npc ? old : null) : [];
      if (old) { restore(old); if (old.npc) npcRoots.delete(old.npc.root); }
      for (const saved of nodes) saved.node.smokeOpacity = saved.applied;
      const row = { bodyId, kind, generation, actor, npc, freeArm, nodes };
      rows.set(bodyId, row); if (npc) npcRoots.set(npc.root, row); return true;
    };
    return {
      bind,
      // Refresh after adding/removing equipment nodes, never during pose writes.
      // Existing opacity is not multiplied again; removed nodes are restored.
      refresh(bodyId, generation) {
        ready(); const row = rows.get(bodyId);
        if (!row || row.generation !== generation) return false;
        return bind(row);
      },
      // Scene model-change hook: unknown props are an O(1) no-op. No polling or
      // whole-roster traversal, and the same node/capacity validation still applies.
      refreshNpc(node) {
        ready(); const row = npcRoots.get(node);
        return row ? bind(row) : false;
      },
      resolve(bodyId, kind, generation) {
        ready(); const row = rows.get(bodyId);
        return row && row.kind === kind && row.generation === generation ? row : null;
      },
      release(bodyId, generation) {
        ready(); const row = rows.get(bodyId);
        if (!row || row.generation !== generation) return false;
        restore(row); if (row.npc) npcRoots.delete(row.npc.root);
        row.nodes.length = 0; rows.delete(bodyId); return true;
      },
      dispose() {
        if (disposed) return;
        for (const row of rows.values()) { restore(row); row.nodes.length = 0; }
        rows.clear(); npcRoots.clear(); disposed = true;
      },
      get size() { return rows.size; },
    };
  };
  BL.hostActorBindings = { create, MAX, NODES, GHOST };
})();
