// Scene-owned replicas of committed frozen bodies, never controllers or NPCs.
// The caller removes legacy replicas between prepare() and render(), so the
// shared 32-body bound includes live and frozen actors without double-spawning.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {}, MAX = 32;
  const create = ({ root, source, make, drop, npcFor }) => {
    if (!root || ![source?.sample, make, drop, npcFor].every(f => typeof f === "function")) throw Error("frozen body adapter required");
    const rows = new Map(), entries = [], display = { now: 0, views: [], departures: [] };
    let frame = null, sample = null, prepared = false, latched = false, failedFrame = null, time = 0, presence = null, bindings = null;
    let dirty = true, animating = false, nextVisualAt = Infinity, local = null, invalidating = false;
    const localMatch = (row, target = local) => target && row.accountId === target.accountId && row.bodyId === target.bodyId
      && (row.kind || row.body?.kind) === target.kind && row.generation <= target.generation;
    const reservations = (next, target, stamp, stale) => {
      let count = target ? 1 : 0;
      if (next) {
        for (const v of next.views) if (v.state !== "live" && !localMatch(v, target)) count++;
        if (!stale) for (const d of next.departures)
          if (!localMatch(d, target) && stamp >= d.at && stamp - d.at < BL.hostPresence.BEAM_MS) count++;
      }
      return count;
    };
    const invalidateLocal = () => {
      if (!local) return;
      const previous = local; local = null; dirty = true;
      invalidating = true;
      try { previous.onFenced(); } finally { invalidating = false; }
    };
    // The receipt names the final starting snapshot, not the later live commit.
    // Unrelated host saves can publish that same starting generation at newer
    // revisions. It cannot return to starting after live without a NEW generation.
    const continues = (next, target) => next.views.some(v => v.accountId === target.accountId
      && v.bodyId === target.bodyId && v.kind === target.kind && v.generation === target.generation
      && (v.state === "live" || v.state === "starting"));
    const checkLocal = next => {
      if (!local) return;
      if (next.world !== local.world || next.epoch > local.epoch) { invalidateLocal(); return; }
      if (reservations(next, local, sample.now, sample.stale) > MAX) { invalidateLocal(); return; }
      if (next.epoch < local.epoch || next.revision <= local.revision) return;
      if (!continues(next, local)) invalidateLocal();
    };
    const clear = () => {
      presence?.dispose(); presence = null;
      bindings?.dispose(); bindings = null;
      for (const row of rows.values()) drop(row.entry);
      rows.clear(); entries.length = display.views.length = display.departures.length = 0;
    };
    const remove = row => {
      bindings?.release(row.view.bodyId, row.view.generation);
      drop(row.entry); rows.delete(row.view.bodyId);
    };
    const prepare = () => {
      prepared = true;
      const previous = sample;
      sample = source.sample();
      dirty = dirty || !!previous !== !!sample || previous?.stale !== sample?.stale || animating;
      if (!sample) {
        if (!dirty) return;
        presence?.prepare();
        for (const row of rows.values()) if (!row.view.state) remove(row);
        entries.length = 0; for (const row of rows.values()) entries.push(row.entry);
        return;
      }
      // Validate the whole frame before changing a single actor. A receiver ACK
      // only confirms delivery, so adapter failure must still fail closed here.
      if (!Number.isSafeInteger(sample.now) || sample.now < sample.frame?.now || typeof sample.stale !== "boolean")
        throw Error("invalid frozen presentation clock");
      if (sample.frame !== frame) {
        BL.bodyPresence.validate(sample.frame);
        checkLocal(sample.frame);
        if (frame && sample.frame.world !== frame.world) { clear(); time = 0; }
        frame = sample.frame; latched = true; dirty = true;
      }
      time = Math.max(time, sample.now);
      dirty = dirty || time >= nextVisualAt;
      if (!dirty) return;
      presence?.prepare();
      // Retire obsolete frozen resources before the caller creates newly live
      // replicas; a mass reclaim must not temporarily double the actor budget.
      for (const row of rows.values()) {
        const held = frame.views.some(v => v.bodyId === row.view.bodyId && v.state !== "live" && !localMatch(v));
        const departing = !sample.stale && frame.departures.some(d => d.bodyId === row.view.bodyId
          && !localMatch(d) && time >= d.at && time - d.at < BL.hostPresence.BEAM_MS);
        if (!held && !departing) remove(row);
      }
      entries.length = 0; for (const row of rows.values()) entries.push(row.entry);
    };
    // Presence is presentation, not a lease for ordinary player transport.
    // A missing/stale presence refresh must not tear down healthy Room peers.
    // The last committed held body still wins over stale ordinary pose packets.
    const liveView = rec => frame ? frame.views.find(v => v.state === "live"
      && v.accountId === rec.id && v.bodyId === rec.body) || null : null;
    const allows = rec => !(local && (rec.id === local.accountId || rec.body === local.bodyId))
      && (!latched || !frame.views.some(v => v.state !== "live"
        && (v.accountId === rec.id || v.bodyId === rec.body)) && !frame.departures.some(d => d.bodyId === rec.body));
    const render = () => {
      if (!prepared) throw Error("prepare frozen bodies before rendering");
      prepared = false;
      if (!frame || failedFrame === frame) return false;
      if (!dirty) for (const row of rows.values()) if (row.visible !== row.entry.cave.root.visible) {
        dirty = true; presence?.prepare(); break;
      }
      if (!dirty) return true; // Static bodies do no pose work between events.
      const wanted = [], wantedIds = new Set();
      for (const v of frame.views) if (v.state !== "live" && !localMatch(v)) { wanted.push({ view: v, departure: null }); wantedIds.add(v.bodyId); }
      // An expired tombstone never creates a replica just to replay a beam.
      // With no clock sample, keep held bodies static and end transient beams.
      if (sample && !sample.stale) for (const d of frame.departures) if (!localMatch(d) && time >= d.at && time - d.at < BL.hostPresence.BEAM_MS) {
        const v = { accountId: d.accountId, bodyId: d.bodyId, generation: d.generation, zone: d.zone, ...d.body };
        wanted.push({ view: v, departure: d }); wantedIds.add(v.bodyId);
      }
      try {
        for (const row of rows.values()) if (!wantedIds.has(row.view.bodyId)) remove(row);
        display.now = time; display.views.length = display.departures.length = 0;
        for (const item of wanted) {
          const v = item.view, key = JSON.stringify([v.accountId, v.generation, v.kind, v.zone, v.motion, v.equipment]);
          let row = rows.get(v.bodyId);
          if (row && row.key !== key) { remove(row); row = null; }
          if (!row) {
            // Release the replaced resource first: even a changed full roster
            // never temporarily allocates a second 32-body staging pool.
            const entry = make(v);
            if (!entry?.cave?.root || entry.cave.root.parent !== root || !entry.cave.parts) {
              if (entry) drop(entry);
              throw Error("invalid frozen body replica");
            }
            row = { view: v, key, entry, departing: !!item.departure }; rows.set(v.bodyId, row);
            if (!bindings) bindings = BL.hostActorBindings.create({ root, capacity: MAX });
            const occupied = arm => ["club", "gun", "snack", "chuk"].some(k => {
              const node = entry.cave.parts[k]; return node?.visible && node.parent === arm;
            }) || entry.cave.labItem?.parent === arm;
            const freeArm = ["armL", "armR"].find(k => entry.cave.parts[k] && !occupied(entry.cave.parts[k])) || null;
            bindings.bind({ bodyId: v.bodyId, kind: v.kind, generation: v.generation,
              actor: entry.cave, npc: item.departure ? null : npcFor(v) || null, freeArm });
          } else if (item.departure && !row.departing) {
            // The player beam can linger visually, but expiry makes its NPC
            // solid immediately at the independently simulated NPC position.
            bindings.release(v.bodyId, v.generation);
            bindings.bind({ bodyId: v.bodyId, kind: v.kind, generation: v.generation,
              actor: row.entry.cave, npc: null, freeArm: null });
            row.departing = true;
          }
          row.view = v; row.visible = row.entry.cave.root.visible;
          if (item.departure) display.departures.push(item.departure);
          else display.views.push(v);
        }
        entries.length = 0;
        for (const row of rows.values()) entries.push(row.entry);
        if (rows.size && !presence) {
          presence = BL.hostPresence.create({ root, capacity: MAX, resolve: bindings.resolve }); presence.prepare();
        }
        if (presence) presence.render(display);
        animating = display.departures.length > 0;
        nextVisualAt = Infinity;
        for (const v of display.views) if (v.deadline > time) nextVisualAt = Math.min(nextVisualAt, v.deadline);
        dirty = false;
        return true;
      } catch (error) {
        // No partially built roster, hidden NPC ownership or repeated per-frame
        // construction attempts after failure. A new committed frame may retry.
        failedFrame = frame; clear(); return false;
      }
    };
    // Scene callback only, AFTER the private reclaim coordinator receives live
    // acknowledgement. This changes visuals, never grants or renews controls.
    const acquireLocal = (view, scope, onFenced, retireLive) => {
      if (local || invalidating || typeof onFenced !== "function" || typeof retireLive !== "function" || !view || !scope
        || typeof scope.world !== "string" || !/^[A-Za-z0-9_.:-]{1,80}$/.test(scope.world)
        || typeof view.bodyId !== "string" || !/^[A-Za-z0-9._:/-]{1,64}$/.test(view.bodyId)
        || view.state !== "starting"
        || ![scope.epoch, scope.revision, view.accountId, view.generation].every(n => Number.isSafeInteger(n) && n > 0)
        || !["ooga", "clanker"].includes(view.kind)) throw Error("invalid local body presentation receipt");
      const candidate = { world: scope.world, epoch: scope.epoch, revision: scope.revision,
        accountId: view.accountId, bodyId: view.bodyId, kind: view.kind, generation: view.generation, onFenced };
      // Consume any accepted-but-not-yet-rendered frame BEFORE publishing the
      // callback. A refused acquire never calls back before returning its handle.
      prepare();
      if (reservations(frame, candidate, time, !sample || sample.stale) > MAX)
        throw Error("local body presentation capacity");
      if (frame && (frame.world !== candidate.world || frame.epoch > candidate.epoch
        || frame.epoch === candidate.epoch && frame.revision > candidate.revision
          && !continues(frame, candidate)))
        throw Error("local body presentation fenced");
      local = candidate; dirty = true;
      try {
        // No second source read: all work below uses the checked frame.
        presence?.prepare();
        for (const row of rows.values()) if (localMatch(row.view)) remove(row);
        retireLive(MAX - reservations(frame, local, time, !sample || sample.stale));
        if (local !== candidate || frame && !render()) throw Error("local body presentation refused");
      } catch (error) { if (local === candidate) { local = null; dirty = true; } throw error; }
      let released = false;
      return () => { if (released) return; released = true; if (local === candidate) { local = null; dirty = true; } };
    };
    return {
      prepare, render, allows, liveView, entries, acquireLocal,
      get world() { return frame?.world || null; }, get epoch() { return frame?.epoch || null; },
      // Reserve before live replicas are built, including the first frame when
      // rows is still empty. Unknown healthy Room peers share this same cap.
      get reserved() {
        return reservations(frame, local, time, !sample || sample.stale);
      },
      liveGeometry(set) { presence?.liveGeometry(set); },
      refreshNpc(node) { return bindings?.refreshNpc(node) || false; },
      dispose() {
        try { invalidateLocal(); } finally {
          clear(); frame = sample = failedFrame = null; time = 0; latched = prepared = animating = false; dirty = true; nextVisualAt = Infinity;
        }
      },
      get active() { return latched; }, get failed() { return !!failedFrame && failedFrame === frame; }, get size() { return rows.size; },
    };
  };
  BL.hostFrozenBodies = { create, MAX };
})();
