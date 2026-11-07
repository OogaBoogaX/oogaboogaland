// The island's NPC ghost tracks. While a player drives a contributor's Ooga or gorilla as a separate body (this page's
// own, signed in or out, crew.js/clankers.js `separateBodies`, or another page's, shown by remote-players.js), the roster NPC of that
// name stays the same object on its own track: its route, fire seat, bed, work and status beams go on as before,
// an Ooga through the room's one NPC host, a gorilla companion on each page from that host's Ooga states and plan/hit
// events (npc-sync.js carries no companion poses). It is only drawn as a Cloud Hopper replay ghost (`cloudHopperGhost.style`: cyan,
// glassy, shadowless), and its harmless work rounds fly in the same colour (`shotLook`). Nothing here moves an
// actor, reserves or frees a seat or bed, changes collision or authority, or sets `humanControlled`/`remoteControlled`;
// the one mark is `ghostTrack`, which the roster dot, possession refusals and the work-round presentation read.
// A guest's own likeness has no NPC track at all (crew.js `avatar`), so it never comes here.
// Frame order: the scene calls `restore` before anything simulates, so every system reads the real models (head
// swaps, colourways, gear), and `paint(dt)` once the frame's poses are final. Restoring walks the nodes painted, not
// the ghosts' trees, so a part moved off a ghost meanwhile gets its own model back too.
// A twin is made once per source geometry. Every PRUNE seconds (and on each change of who is a ghost) the twins no
// ghost wore in that frame are released, unless a round flew in one within the last LINGER seconds; so equipment or
// colourway changes leave no history behind, and nothing is released while still drawn. At most MAX ghosts: the
// remote pool's cap plus the visitor's own.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const MAX = (BL.remotePlayers?.MAX || 32) + 1, LINGER = 1, PRUNE = 2;
  const create = ({ renderer }) => {
    const ghosts = new Set(), twins = new Map(), sources = new Map(), rounds = new Map(), used = new Set();
    const painted = [];
    let disposed = false, clock = 0, pruneIn = PRUNE, marking = false;
    const twin = (source) => {
      let geometry = twins.get(source);
      if (!geometry) {
        geometry = BL.cloudHopperGhost.style(source);
        // HALLOWEEN: a straight round keeps pointing along its line.
        if (source.straight) geometry.straight = true;
        twins.set(source, geometry); sources.set(geometry, source);
      }
      if (marking) used.add(geometry);
      return geometry;
    };
    // Instanced batches (breath puffs) are effects, not the body; they keep their own look.
    const paintNode = (node) => {
      const geometry = node.geometry;
      if (geometry && !node.instanceData) {
        if (sources.has(geometry)) { if (marking) used.add(geometry); }
        else { node.geometry = twin(geometry); painted.push(node); }
      }
      for (let i = 0; i < node.children.length; i++) paintNode(node.children[i]);
    };
    // An Ooga's bed gear and pet live beside its body under the crew's root; a gorilla is its rig alone.
    const paintActor = (actor) => {
      paintNode(actor.root);
      if (actor.sleepWeapons) paintNode(actor.sleepWeapons);
      if (actor.pet) paintNode(actor.pet.node);
    };
    const restore = () => {
      for (let i = 0; i < painted.length; i++) {
        const node = painted[i], source = node.geometry && sources.get(node.geometry);
        if (source) node.geometry = source;
      }
      painted.length = 0;
    };
    const release = (geometry) => {
      const source = sources.get(geometry);
      sources.delete(geometry); twins.delete(source); rounds.delete(geometry);
      renderer.releaseGeometry(geometry);
    };
    // Twins no ghost wears now and no recent round flies in.
    const prune = () => {
      for (const geometry of twins.values()) {
        if (used.has(geometry) || clock - (rounds.get(geometry) ?? -Infinity) < LINGER) continue;
        release(geometry);
      }
      used.clear();
    };
    const set = (actor, on) => {
      if (disposed || !actor || !actor.root) return false;
      if (on) {
        if (ghosts.has(actor)) return true;
        if (ghosts.size >= MAX) return false;
        ghosts.add(actor); actor.ghostTrack = true;
      } else {
        if (!ghosts.delete(actor)) return false;
        actor.ghostTrack = false;
      }
      // Repaint from the real models, so the change shows at once and its leftovers are measured next frame.
      const wasPainted = painted.length > 0;
      restore();
      if (wasPainted) for (const ghost of ghosts) paintActor(ghost);
      pruneIn = Math.min(pruneIn, LINGER);
      return true;
    };
    const paint = (dt) => {
      if (disposed) return;
      clock += dt; pruneIn -= dt;
      marking = pruneIn <= 0;
      for (const actor of ghosts) paintActor(actor);
      if (marking) { prune(); pruneIn = PRUNE; marking = false; }
    };
    // The geometry a ghost's round flies as, or null for anyone else's.
    const shotLook = (actor, geometry) => {
      if (!actor || !geometry || !ghosts.has(actor)) return null;
      const look = twin(geometry);
      rounds.set(look, clock);
      return look;
    };
    const liveGeometry = (out) => { for (const geometry of twins.values()) out.add(geometry); };
    const dispose = () => {
      if (disposed) return;
      restore();
      for (const actor of ghosts) actor.ghostTrack = false;
      ghosts.clear();
      for (const geometry of [...twins.values()]) release(geometry);
      used.clear(); disposed = true;
    };
    return { set, restore, paint, shotLook, liveGeometry, dispose, has: (actor) => ghosts.has(actor),
      stats: () => ({ ghosts: ghosts.size, twins: twins.size, painted: painted.length }) };
  };
  BL.npcGhosts = { create, MAX };
})();
