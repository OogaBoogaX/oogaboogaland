// The Ooga crew kept in step for signed-in players. The room elects one page showing the island as host
// (`net.state.hostId`): it runs the crew as always and, SEND_S apart, sends one binary frame with every
// Ooga nobody drives. Every other signed-in page on the island follows: those Oogas become puppets
// (`cave.puppet`, which makes crew.update skip their AI) and are played back here, after the crew's
// update, DELAY behind the frames as they arrived (see Playback below). An Ooga someone drives is never in a frame and never a puppet: the driver's page
// runs it and the others show it through remote-players.js. With no room, no host or when hosting, every
// Ooga runs its own AI as before.
//
// A frame: a Uint32 header [FORMAT, signature of ordered crew names and work sites, record count, event bytes], one RECORD
// of floats per Ooga, then the events since the last frame as UTF-8 JSON. A record carries what shows:
// the body (root transform and visibility, legs, arms, head and eyes, torso), the gear (where the club and
// rifle hang and how, the rifle's bananas, the flash, the snack, the bed's weapons), status (stun birds,
// fire embers and scorch, colourway, a built-in jetpack's flame) and the work the gorillas follow (state,
// phase, cave, planned cave). Events are what happens once: speech, sleep marks, dust and sparks, every
// shot's flight, and the gorillas' plan and hit, so each page's gorillas react to the host's crew.
// Pages built from a different cast, work-site order (signature) or format ignore each other's frames.
// Cost: the host sends only while the room reports followers (`net.state.followers`), and a frame whose
// records match the last one sent, with no events, waits up to KEEP_S before it goes again.
// One sync per hub visit: `create` after the crew, `update` after crew.update each frame, `dispose` in leave.
//
// Playback. Easing toward the latest frame made a walker surge as each frame landed and slow to a crawl
// before the next, four times a second. A follower instead keeps the frames it receives (at most SLOTS),
// each stamped with this page's clock when it arrived (frames carry no host time), and shows every puppet
// as it stood DELAY before this page's present, between the two frames either side of that moment, so
// frames arriving evenly play a steady walk at a steady pace. Because the stamps are arrival times, network
// jitter still shows as small changes of pace between frames, and the network's own latency comes on top
// of DELAY. DELAY is one send interval and JITTER, so a frame up to JITTER later than the last interval
// still arrives before it is needed. Nothing is guessed past the newest frame: when the frames run dry
// the puppet waits on it, and the next frame restamps it to the playhead, so the move carries on from
// where the puppet stands, never back. Between two frames a puppet moves on the straight line joining
// them, which can cut a corner the host walked round (a wall's end, a door frame) when they lie far apart.
// Frames closer than MERGE_S are folded into one, their events kept in arrival order up to SLOT_EVENTS a
// folded frame (the newest past that are dropped and counted in `droppedEvents`). A jump between two
// frames (a status change, a move past SNAP, a change of visibility) is never drawn across: the puppet
// stays on the first until the playhead reaches the second. Status, work, flags and held gear come from
// the frame the playhead has reached, and that frame's events replay then, after its poses. The first
// frame of a puppet is shown at once, as is the first matching frame after a host's frames of another
// format, which discard everything kept before them. The wire format is unchanged.
// Handing back. A frame overwrites a puppet's status and work, never this page's own travel to and from bed, so a puppet
// that stops following (a new host, this page elected, another cast) goes through `crew.resumeFromHost` first.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { quat, fnv1a } = BL.math;
  const { addChild, removeChild } = BL.scene;
  // Format 3: a driven Ooga's NPC stays in the frame on its own track (npc-ghosts.js), its player a separate body.
  // A follower whose elected host sends another format holds every NPC where it stands (puppets, no AI of its own,
  // no frames applied) and says so once (`onIncompatible`): the room keeps one authority, and this page never
  // invents a second track. It follows again as soon as a matching frame arrives or the room elects another host.
  // A format-2 page can't do the same: following a format-3 host it falls back to its own crew, as it always did.
  const FORMAT = 3, HEADER = 4, RECORD = 112, SEND_S = 0.25, KEEP_S = 2;
  const SNAP = 4, EVENTS_MAX = 96, SAY_MAX = 120;
  const JITTER = 0.1, DELAY = SEND_S + JITTER, SLOTS = 6, MERGE_S = SEND_S / 2, SLOT_EVENTS = 2 * EVENTS_MAX;
  const F_VISIBLE = 1, F_CLOSED = 2, F_ROOT_Q = 4, F_ARM_L_Q = 8, F_ARM_R_Q = 16, F_HEAD_Q = 32;
  const F_CLUB = 64, F_CLUB_Q = 128, F_GUN = 256, F_GUN_Q = 512, F_FLASH = 1024, F_SNACK = 2048;
  const F_STUNNED = 4096, F_FLAME = 8192, F_BED_GEAR = 16384, F_OUTDOOR_SLEEP = 32768;
  const BODY = ["torso", "head", "legL", "legR", "armL", "armR"];
  const STATES = ["working", "chilling", "sleeping", "away"];
  const PHASES = ["", "outbound", "station", "shoot", "return", "reload"];
  const encoder = new TextEncoder(), decoder = new TextDecoder();

  const wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));

  const create = ({ crew, fx, onPlan, onHit, onModelChange, animationInterval, onIncompatible = null }) => {
    const net = BL.net;
    const list = crew.list.filter((cave) => !cave.contributor.temporary), n = list.length;
    const index = new Map(list.map((cave, i) => [cave, i]));
    const signature = fnv1a(JSON.stringify([list.map((cave) => cave.traits.name),
      (crew.workSites || []).map((site) => site.mouth?.id || site.repo)])) >>> 0;
    const out = new Float32Array(HEADER + n * RECORD), outHeader = new Uint32Array(out.buffer, 0, HEADER);
    const target = new Float32Array(n * RECORD), sent = new Float32Array(HEADER + n * RECORD);
    const have = new Uint8Array(n), fresh = new Uint8Array(n);
    // Playback's frames: SLOTS of every Ooga's record, which Oogas each carries, when it arrived, its events,
    // and the slots in use oldest first (`order`, `kept`). Each slot's events are a list reused for the page
    // life, at most SLOT_EVENTS long; `due` holds the events the playhead reached this update, at most
    // SLOTS * SLOT_EVENTS.
    const ring = new Float32Array(SLOTS * n * RECORD), carries = new Uint8Array(SLOTS * n);
    const stampOf = new Float64Array(SLOTS), playedOf = new Uint8Array(SLOTS), inUse = new Uint8Array(SLOTS);
    const eventsOf = Array.from({ length: SLOTS }, () => []), order = new Int8Array(SLOTS), due = [];
    let kept = 0, droppedEvents = 0;
    const dropOldest = () => {
      const s = order[0];
      for (let c = 1; c < kept; c++) order[c - 1] = order[c];
      kept--;
      inUse[s] = 0;
      eventsOf[s].length = 0;
    };
    const clearFrames = () => {
      while (kept) dropOldest();
      due.length = 0;
    };
    // Each puppet's own quaternions: the crew's are never written from here.
    const quats = list.map(() => ({ root: quat.create(), armL: quat.create(), armR: quat.create(), head: quat.create(), club: quat.create(), gun: quat.create() }));
    const TQ = quat.create();
    let role = "solo", hostId = null, sendIn = 0, sinceSent = 0, sentFloats = -1, seen = -1, frames = 0, events = [], elapsed = 0, incompatible = false;
    const poseFlags = new Int32Array(n).fill(-1);

    const driven = (cave) => cave === crew.player || !!cave.remoteControlled;
    const holders = list.map((cave) => [cave.parts.armL, cave.parts.armR, cave.root, cave.sleepWeapons]);
    const holderCode = (i, node) => {
      const h = holders[i];
      for (let c = 0; c < h.length; c++) if (node.parent === h[c]) return c;
      return 4;
    };

    // Host: what happens once, recorded for the next frame. Only Oogas the frame carries count.
    // Records are pooled per kind and rewritten in place; the fixed key order per kind keeps the JSON identical.
    const pools = { say: [], z: [], b: [], shot: [], plan: [], hit: [] };
    const used = { say: 0, z: 0, b: 0, shot: 0, plan: 0, hit: 0 };
    const takeEvent = (k) => {
      const pool = pools[k];
      let e = pool[used[k]];
      if (!e) {
        if (k === "say") e = { k: "say", i: 0, text: "", dur: 0 };
        else if (k === "z") e = { k: "z", i: 0, x: 0, y: 0, z: 0 };
        else if (k === "b") e = { k: "b", kind: "", x: 0, y: 0, z: 0, count: 0, speed: 0 };
        else if (k === "shot") e = { k: "shot", i: 0, a: [0, 0, 0, 0, 0, 0] };
        else if (k === "plan") e = { k: "plan", i: 0, site: 0 };
        else e = { k: "hit", i: 0 };
        pool.push(e);
      }
      used[k]++;
      return e;
    };
    const resetEvents = () => {
      for (const k in used) used[k] = 0;
      events.length = 0;
    };
    const record = (kind) => {
      if (role !== "host" || events.length >= EVENTS_MAX) return null;
      const e = takeEvent(kind);
      events.push(e);
      return e;
    };
    const npcIndex = (cave) => {
      const i = cave ? index.get(cave) : undefined;
      return i === undefined || driven(cave) ? -1 : i;
    };
    // The crew's effects go through this: the page sees them as always, and the host notes them.
    const recordingFx = Object.create(fx);
    recordingFx.say = (cave, text, dur) => {
      const i = npcIndex(cave);
      if (i >= 0) {
        const e = record("say");
        if (e) { e.i = i; e.text = String(text).slice(0, SAY_MAX); e.dur = dur; }
      }
      return fx.say(cave, text, dur);
    };
    recordingFx.zzzAt = (x, y, z, cave) => {
      const i = npcIndex(cave);
      if (i >= 0) {
        const e = record("z");
        if (e) { e.i = i; e.x = x; e.y = y; e.z = z; }
      }
      return fx.zzzAt(x, y, z, cave);
    };
    recordingFx.burst = (x, y, z, count, geos, speed) => {
      const kind = geos === BL.crew.LAND_DUST ? "dust" : geos === BL.crew.JET_SPARKS ? "sparks" : "";
      if (kind) {
        const e = record("b");
        if (e) { e.kind = kind; e.x = x; e.y = y; e.z = z; e.count = count; e.speed = speed; }
      }
      return fx.burst(x, y, z, count, geos, speed);
    };
    const recordShot = (cave, from, to) => {
      const i = npcIndex(cave);
      if (i >= 0) {
        const e = record("shot");
        if (e) { e.i = i; e.a[0] = from.x; e.a[1] = from.y; e.a[2] = from.z; e.a[3] = to.x; e.a[4] = to.y; e.a[5] = to.z; }
      }
    };
    const recordPlan = (cave, site) => {
      const i = npcIndex(cave);
      if (i >= 0) {
        const e = record("plan");
        if (e) { e.i = i; e.site = site; }
      }
    };
    const recordHit = (cave) => {
      const i = npcIndex(cave);
      if (i >= 0) {
        const e = record("hit");
        if (e) e.i = i;
      }
    };

    const writeQuat = (o, q) => {
      if (!q) return false;
      out[o] = q[0]; out[o + 1] = q[1]; out[o + 2] = q[2]; out[o + 3] = q[3];
      return true;
    };
    const writeXYZ = (o, v) => {
      out[o] = v.x; out[o + 1] = v.y; out[o + 2] = v.z;
    };
    const placed = (f, o) => {
      for (let j = 2; j < 15; j++) if ((j < 8 || j > 11) && !Number.isFinite(f[o + j])) return false;
      return true;
    };
    const encodeCave = (o, i, cave) => {
      const r = cave.root, p = cave.parts;
      let flags = 0;
      if (r.visible) flags |= F_VISIBLE;
      if (p.head.geometry === cave.headClosed) flags |= F_CLOSED;
      out[o] = i;
      writeXYZ(o + 2, r.position); writeXYZ(o + 5, r.rotation);
      if (writeQuat(o + 8, r.quaternion)) flags |= F_ROOT_Q;
      writeXYZ(o + 12, r.scale);
      out[o + 15] = p.legL.rotation.x; out[o + 16] = p.legL.rotation.z;
      out[o + 17] = p.legR.rotation.x; out[o + 18] = p.legR.rotation.z;
      writeXYZ(o + 19, p.armL.rotation);
      if (writeQuat(o + 22, p.armL.quaternion)) flags |= F_ARM_L_Q;
      writeXYZ(o + 26, p.armR.rotation);
      if (writeQuat(o + 29, p.armR.quaternion)) flags |= F_ARM_R_Q;
      writeXYZ(o + 33, p.head.rotation); writeXYZ(o + 36, p.head.position);
      if (writeQuat(o + 39, p.head.quaternion)) flags |= F_HEAD_Q;
      out[o + 43] = p.torso.scale.y; out[o + 44] = p.torso.rotation.x; out[o + 45] = p.torso.rotation.z;
      writeXYZ(o + 46, p.armL.position); writeXYZ(o + 49, p.armR.position);
      out[o + 52] = holderCode(i, p.club); writeXYZ(o + 53, p.club.position); writeXYZ(o + 56, p.club.rotation);
      if (p.club.visible) flags |= F_CLUB;
      if (writeQuat(o + 59, p.club.quaternion)) flags |= F_CLUB_Q;
      out[o + 63] = holderCode(i, p.gun); writeXYZ(o + 64, p.gun.position); writeXYZ(o + 67, p.gun.rotation);
      if (p.gun.visible) flags |= F_GUN;
      if (writeQuat(o + 70, p.gun.quaternion)) flags |= F_GUN_Q;
      let mask = 0;
      for (let b = 0; b < p.gunBananas.length; b++) if (p.gunBananas[b].visible) mask |= 1 << b;
      out[o + 74] = mask;
      if (p.gunFlash.visible) flags |= F_FLASH;
      if (p.snack.visible) flags |= F_SNACK;
      out[o + 75] = p.snack.scale.x;
      writeXYZ(o + 76, cave.sleepWeapons.position); writeXYZ(o + 79, cave.sleepWeapons.rotation);
      if (cave.sleepWeapons.visible) flags |= F_BED_GEAR;
      if (cave.state === "sleeping" && cave.bedroll?.outdoor) flags |= F_OUTDOOR_SLEEP;
      for (let b = 0; b < BODY.length; b++) {
        const node = p[BODY[b]];
        out[o + 82 + b] = node.ember || 0;
        out[o + 88 + b] = node.scorch || 0;
      }
      out[o + 94] = p.chuk ? p.chuk.rotation.x : 0;
      out[o + 95] = p.jetFlame ? p.jetFlame.scale.y : 0;
      if (p.jetFlame && p.jetFlame.visible) flags |= F_FLAME;
      if (cave.stunBirds.visible) flags |= F_STUNNED;
      out[o + 96] = STATES.indexOf(cave.state);
      out[o + 97] = PHASES.indexOf(cave.work.phase);
      out[o + 98] = cave.work.site;
      out[o + 99] = cave.work.plannedSite;
      out[o + 100] = cave.tintState || 0;
      out[o + 1] = flags;
    };
    const encode = () => {
      let k = 0;
      for (let i = 0; i < n; i++) {
        const cave = list[i];
        if (driven(cave)) continue;
        encodeCave(HEADER + k * RECORD, i, cave);
        k++;
      }
      const floats = HEADER + k * RECORD, bytes = floats * 4;
      // Nothing moved and nothing happened: skip, but not for longer than KEEP_S.
      if (!events.length && floats === sentFloats && sinceSent < KEEP_S) {
        let same = true;
        for (let i = HEADER; i < floats; i++) if (out[i] !== sent[i]) { same = false; break; }
        if (same) return;
      }
      for (let i = HEADER; i < floats; i++) sent[i] = out[i];
      sentFloats = floats;
      sinceSent = 0;
      const tail = events.length ? encoder.encode(JSON.stringify(events)) : null;
      resetEvents();
      outHeader[0] = FORMAT; outHeader[1] = signature; outHeader[2] = k; outHeader[3] = tail ? tail.length : 0;
      if (!tail) {
        net.sendNpc(new Uint8Array(out.buffer, 0, bytes));
        return;
      }
      const frame = new Uint8Array(bytes + tail.length);
      frame.set(new Uint8Array(out.buffer, 0, bytes));
      frame.set(tail, bytes);
      net.sendNpc(frame);
    };

    const replay = (event) => {
      const cave = event.i >= 0 && event.i < n ? list[event.i] : null;
      if (event.k === "b") {
        const geos = event.kind === "dust" ? BL.crew.LAND_DUST : event.kind === "sparks" ? BL.crew.JET_SPARKS : null;
        if (geos) fx.burst(+event.x, +event.y, +event.z, Math.min(24, +event.count || 0), geos, +event.speed || 1);
        return;
      }
      if (!cave || !cave.puppet) return;
      if (event.k === "say" && typeof event.text === "string") fx.say(cave, event.text.slice(0, SAY_MAX), Math.min(8, +event.dur || 2));
      else if (event.k === "z") fx.zzzAt(+event.x, +event.y, +event.z, cave);
      else if (event.k === "shot" && Array.isArray(event.a) && event.a.length === 6) crew.showShot(cave, +event.a[0], +event.a[1], +event.a[2], +event.a[3], +event.a[4], +event.a[5]);
      else if (event.k === "plan" && Number.isInteger(event.site)) onPlan(cave, event.site);
      else if (event.k === "hit") onHit(cave);
    };

    const decode = (buffer) => {
      if (!buffer || buffer.byteLength < HEADER * 4) return;
      const header = new Uint32Array(buffer, 0, HEADER);
      const count = header[2], eventBytes = header[3], recordBytes = (HEADER + count * RECORD) * 4;
      // Another format from the elected host: hold, never run a second track (see FORMAT).
      if (header[0] !== FORMAT) {
        if (!incompatible) { incompatible = true; if (onIncompatible) onIncompatible(header[0]); }
        // Every frame kept goes, played or not, with its events: the puppets hold where they stand, and a
        // matching frame starts afresh rather than play poses and events from before the interruption.
        clearFrames();
        return;
      }
      // Back from frames of another format: the puppets were held, and nothing kept is older than this frame.
      if (incompatible) fresh.set(have);
      incompatible = false;
      if (header[1] !== signature) { release(); return; }
      if (count > n || buffer.byteLength !== recordBytes + eventBytes) return;
      const f = new Float32Array(buffer, 0, recordBytes / 4);
      // Where the frame goes in playback (see Playback). `update` has already dropped every frame but the
      // newest the playhead reached, so a newest frame at or behind it is the only one: the puppets wait on it.
      const now = elapsed, play = now - DELAY, last = kept ? order[kept - 1] : -1;
      let s = -1;
      if (last >= 0 && stampOf[last] <= play) stampOf[last] = play;
      else if (last >= 0 && (kept === SLOTS || kept >= 2 && now - stampOf[last] < MERGE_S)) s = last;
      if (s < 0) {
        s = 0;
        while (inUse[s]) s++;
        inUse[s] = 1; playedOf[s] = 0; eventsOf[s].length = 0;
        carries.fill(0, s * n, s * n + n);
        order[kept++] = s;
      }
      stampOf[s] = last >= 0 && last !== s ? Math.max(now, stampOf[last] + 1e-4) : now;
      const base = s * n * RECORD;
      for (let k = 0; k < count; k++) {
        const o = HEADER + k * RECORD, i = f[o];
        // The host is only another page: a transform that is no number would poison the Ooga here for good.
        if (!(i >= 0 && i < n) || !placed(f, o)) continue;
        for (let j = 0; j < RECORD; j++) target[i * RECORD + j] = ring[base + i * RECORD + j] = f[o + j];
        carries[s * n + i] = 1;
        if (!have[i]) fresh[i] = 1;
        have[i] = 1;
      }
      frames++;
      if (!eventBytes) return;
      let list_;
      try {
        list_ = JSON.parse(decoder.decode(new Uint8Array(buffer, recordBytes, eventBytes)));
      } catch {
        return;
      }
      if (!Array.isArray(list_)) return;
      // Replayed when the playhead reaches this frame, after its poses, so a shot leaves from where the rifle is.
      // A frame gives at most EVENTS_MAX, as the host records; a folded frame keeps the first SLOT_EVENTS in
      // arrival order, and the newest past that are dropped and counted.
      const kept_ = eventsOf[s], take = Math.min(list_.length, EVENTS_MAX);
      for (let e = 0; e < take; e++) {
        const event = list_[e];
        if (!event || typeof event !== "object") continue;
        if (kept_.length < SLOT_EVENTS) kept_.push(event);
        else droppedEvents++;
      }
    };

    // The pair of frames a puppet is shown between, set by `between`: `A` at `ao` (reached, or the first there
    // is), `B` at `bo` (next) or null, and how far from A to B the playhead stands, `w` (0 when held on A).
    let A = target, ao = 0, B = null, bo = 0, w = 0;
    const between = (i, play) => {
      let a = -1, b = -1;
      for (let c = 0; c < kept; c++) {
        const s = order[c];
        if (!carries[s * n + i]) continue;
        if (stampOf[s] <= play) { a = s; continue; }
        if (a < 0) a = s;
        else b = s;
        break;
      }
      // No frame kept carries it (one it was missing from passed): hold its newest record.
      if (a < 0) { A = target; ao = i * RECORD; B = null; w = 0; return; }
      A = ring; ao = (a * n + i) * RECORD; B = null; w = 0;
      if (b < 0) return;
      const bo_ = (b * n + i) * RECORD;
      // A jump is never drawn across: a change of visibility or status (the clank-to-chill walk aside), or a move past SNAP.
      const sa = STATES[ring[ao + 96]], sb = STATES[ring[bo_ + 96]];
      if ((ring[ao + 1] & F_VISIBLE) !== (ring[bo_ + 1] & F_VISIBLE)) return;
      if (sa !== sb && !(sa === "working" && sb === "chilling")) return;
      if (Math.hypot(ring[bo_ + 2] - ring[ao + 2], ring[bo_ + 3] - ring[ao + 3], ring[bo_ + 4] - ring[ao + 4]) > SNAP) return;
      B = ring; bo = bo_;
      w = Math.min(1, Math.max(0, (play - stampOf[a]) / (stampOf[b] - stampOf[a])));
    };
    const mix = (j, k) => A[ao + j] + (k ? (B[bo + j] - A[ao + j]) * k : 0);
    const mixAngle = (j, k) => A[ao + j] + (k ? wrap(B[bo + j] - A[ao + j]) * k : 0);
    const setAngles = (rot, j, k) => {
      rot.x = mixAngle(j, k); rot.y = mixAngle(j + 1, k); rot.z = mixAngle(j + 2, k);
    };
    const setXYZ = (v, j, k) => {
      v.x = mix(j, k); v.y = mix(j + 1, k); v.z = mix(j + 2, k);
    };
    // A quaternion between the two frames', or dropped (back to the Euler rotation) when the reached frame has none.
    // A puppet's pose is the host's alone: a quaternion its own crew left (a local sleep's `sleepRotation`)
    // would hide the frame's Euler rotation, so it goes too. The crew's object itself is never written.
    const poseQuat = (node, own, j, flag, k) => {
      if (!(A[ao + 1] & flag)) {
        if (node.quaternion) node.quaternion = null;
        return;
      }
      if (node.quaternion !== own) node.quaternion = own;
      own[0] = A[ao + j]; own[1] = A[ao + j + 1]; own[2] = A[ao + j + 2]; own[3] = A[ao + j + 3];
      if (!k || !(B[bo + 1] & flag)) return;
      TQ[0] = B[bo + j]; TQ[1] = B[bo + j + 1]; TQ[2] = B[bo + j + 2]; TQ[3] = B[bo + j + 3];
      quat.slerpTo(own, TQ, k);
    };
    // Gear hangs where the host has it: a hand, the back sling (the root) or the bed's weapons.
    const holdIn = (i, node, code) => {
      if (!(code >= 0 && code <= 3)) return false;
      const want = holders[i][code];
      if (node.parent === want) return false;
      if (node.parent) removeChild(node.parent, node);
      addChild(want, node);
      return true;
    };

    const apply = (i, cave, dt, play) => {
      const r = cave.root, p = cave.parts, q = quats[i], t = target, o = i * RECORD;
      between(i, play);
      // Everything discrete is the reached frame's; only what moves continuously runs from A toward B.
      const flags = A[ao + 1];
      const x = mix(2, w), y = mix(3, w), z = mix(4, w);
      const jump = Math.hypot(x - r.position.x, y - r.position.y, z - r.position.z);
      // A status change is a passive relocation on the host (a beam): `between` never draws across it, so the
      // puppet lands there at once when the playhead reaches it. Clanking to chilling is a walk on the host.
      const status = STATES[A[ao + 96]];
      const relocated = status !== undefined && status !== cave.state && !(cave.state === "working" && status === "chilling");
      const far = fresh[i] || jump > SNAP || relocated;
      fresh[i] = 0;
      r.visible = (flags & F_VISIBLE) !== 0;
      r.position.x = x; r.position.y = y; r.position.z = z;
      setAngles(r.rotation, 5, w);
      poseQuat(r, q.root, 8, F_ROOT_Q, w);
      r.scale.x = A[ao + 12]; r.scale.y = A[ao + 13]; r.scale.z = A[ao + 14];
      // The world position and work the gorillas read always follow playback
      // at full rate. Only this visitor's settled limb interpolation may wait.
      const state = STATES[A[ao + 96]], phase = PHASES[A[ao + 97]];
      const changed = poseFlags[i] !== flags || cave.state !== state || cave.work.phase !== phase;
      if (state !== undefined) cave.state = state;
      if (phase !== undefined) cave.work.phase = phase;
      cave.work.site = A[ao + 98];
      cave.work.plannedSite = A[ao + 99];
      crew.setTint(cave, A[ao + 100]);
      if (animationInterval && cave.animation) {
        const a = cave.animation;
        const resting = state === "sleeping" || state === "chilling" && !phase;
        // Still: shown where the newest frame has it, so nothing is left to play.
        const still = Math.hypot(t[o + 2] - x, t[o + 3] - y, t[o + 4] - z) < 0.001 && Math.abs(wrap(t[o + 6] - r.rotation.y)) < 0.001;
        const holders = holderCode(i, p.club) === A[ao + 52] && holderCode(i, p.gun) === A[ao + 63];
        const interval = resting && still && holders && !(flags & (F_STUNNED | F_FLAME | F_FLASH)) ? animationInterval(cave) : 0;
        a.pending += dt;
        a.due = far || changed || !interval || interval < a.interval || elapsed >= a.at;
        a.dt = a.due ? a.pending : 0;
        if (!a.due) return;
        a.pending = 0;
        a.at = elapsed + interval * (a.interval ? 1 : 0.5 + i * 0.61803398875 % 0.5);
        a.interval = interval;
        a.updates++;
      }
      poseFlags[i] = flags;
      p.legL.rotation.x = mixAngle(15, w); p.legL.rotation.z = mixAngle(16, w);
      p.legR.rotation.x = mixAngle(17, w); p.legR.rotation.z = mixAngle(18, w);
      setAngles(p.armL.rotation, 19, w);
      poseQuat(p.armL, q.armL, 22, F_ARM_L_Q, w);
      setAngles(p.armR.rotation, 26, w);
      poseQuat(p.armR, q.armR, 29, F_ARM_R_Q, w);
      setAngles(p.head.rotation, 33, w);
      setXYZ(p.head.position, 36, w);
      poseQuat(p.head, q.head, 39, F_HEAD_Q, w);
      const head = (flags & F_CLOSED) !== 0 ? cave.headClosed : cave.headOpen;
      if (p.head.geometry !== head) p.head.geometry = head;
      p.torso.scale.y = A[ao + 43];
      p.torso.rotation.x = mixAngle(44, w); p.torso.rotation.z = mixAngle(45, w);
      setXYZ(p.armL.position, 46, w);
      setXYZ(p.armR.position, 49, w);
      // Gear: a change of holder moves the node, and the mirror and outlines learn the new shape. Gear runs
      // toward the next frame only while that frame has it in the same holder.
      let moved = holdIn(i, p.club, A[ao + 52]);
      moved = holdIn(i, p.gun, A[ao + 63]) || moved;
      const clubK = w && B[bo + 52] === A[ao + 52] ? w : 0, gunK = w && B[bo + 63] === A[ao + 63] ? w : 0;
      p.club.visible = (flags & F_CLUB) !== 0;
      setXYZ(p.club.position, 53, clubK); setAngles(p.club.rotation, 56, clubK);
      poseQuat(p.club, q.club, 59, F_CLUB_Q, clubK);
      p.gun.visible = (flags & F_GUN) !== 0;
      setXYZ(p.gun.position, 64, gunK); setAngles(p.gun.rotation, 67, gunK);
      poseQuat(p.gun, q.gun, 70, F_GUN_Q, gunK);
      const mask = A[ao + 74];
      for (let b = 0; b < p.gunBananas.length; b++) p.gunBananas[b].visible = (mask & (1 << b)) !== 0;
      p.gunFlash.visible = (flags & F_FLASH) !== 0;
      p.snack.visible = (flags & F_SNACK) !== 0;
      p.snack.scale.x = p.snack.scale.y = p.snack.scale.z = A[ao + 75];
      const bed = cave.sleepWeapons;
      bed.visible = (flags & F_BED_GEAR) !== 0;
      const outdoor = (flags & F_OUTDOOR_SLEEP) !== 0;
      if (outdoor || cave.remoteOutdoorSleep) {
        for (const node of cave.sleepParts.equipment) node.visible = state !== "sleeping";
        for (const node of cave.swagNodes) node.visible = !outdoor;
        for (const model of cave.magazineModels) if (model) model.node.visible = !outdoor;
        if (cave.jet) cave.jet.node.visible = !outdoor;
      }
      cave.remoteOutdoorSleep = outdoor;
      setXYZ(bed.position, 76, w); setAngles(bed.rotation, 79, w);
      for (let b = 0; b < BODY.length; b++) {
        const node = p[BODY[b]];
        node.ember = A[ao + 82 + b];
        node.scorch = A[ao + 88 + b];
      }
      if (p.chuk) p.chuk.rotation.x = A[ao + 94];
      if (p.jetFlame) {
        p.jetFlame.visible = (flags & F_FLAME) !== 0;
        p.jetFlame.scale.y = A[ao + 95];
      }
      cave.stunBirds.visible = crew.combatEnabled !== false && (flags & F_STUNNED) !== 0;
      if (cave.stunBirds.visible) cave.stunBirds.rotation.y += dt * 4;
      if (moved) onModelChange(cave);
    };

    // Hands the puppets back to their own AI. `resume` is false only when the crew is about to go with the visit.
    const release = (resume = true) => {
      for (let i = 0; i < n; i++) {
        const cave = list[i], was = cave.puppet;
        cave.puppet = false;
        if (was && resume) crew.resumeFromHost(cave);
      }
      incompatible = false;
      have.fill(0);
      fresh.fill(0);
      poseFlags.fill(-1);
      clearFrames();
    };

    /** Once a frame, after crew.update: host sends, follower poses its puppets, solo does nothing. */
    const update = (dt) => {
      elapsed += dt;
      const st = net.state;
      const next = st.room !== "live" || !st.hostId ? "solo" : st.hostId === st.selfId ? "host" : "follow";
      const hostChanged = hostId !== null && st.hostId !== hostId;
      if (next !== role || hostChanged) {
        // A new host or leaving follow hands the Oogas back to their own AI where they stand.
        if (role === "follow") release();
        role = next; hostId = st.hostId;
        sendIn = 0;
        sentFloats = -1;
        // net retains the previous host's frame until another binary message arrives.
        seen = hostChanged ? st.npcVersion : -1;
        resetEvents();
      }
      if (role === "host") {
        // Nobody follows: nothing to send, and nothing saved up for later.
        if (!st.followers) {
          sendIn = 0;
          sentFloats = -1;
          resetEvents();
          return;
        }
        sinceSent += dt;
        sendIn -= dt;
        if (sendIn <= 0) {
          sendIn = SEND_S;
          encode();
        }
        return;
      }
      if (role !== "follow") return;
      // Playback: the frames the playhead reached give up their events once, and only the newest of them stays.
      // (While another format's frames hold the puppets, nothing is kept: see `decode`.)
      const play = elapsed - DELAY;
      due.length = 0;
      for (let c = 0; c < kept && stampOf[order[c]] <= play; c++) {
        const s = order[c], events = eventsOf[s];
        if (playedOf[s]) continue;
        playedOf[s] = 1;
        for (let e = 0; e < events.length; e++) due.push(events[e]);
        events.length = 0;
      }
      while (kept >= 2 && stampOf[order[1]] <= play) dropOldest();
      if (st.npcVersion !== seen) {
        seen = st.npcVersion;
        decode(net.npcFrame);
      }
      for (let i = 0; i < n; i++) {
        const cave = list[i];
        if (driven(cave)) {
          cave.puppet = false;
          continue;
        }
        // Held where it stands: the host's format can't be followed and this page must not run its own.
        if (incompatible) { cave.puppet = true; continue; }
        cave.puppet = !!have[i];
        if (have[i]) apply(i, cave, dt, play);
      }
      if (incompatible) due.length = 0;
      // Poses first, then the events of the frames they were sent with, in arrival order.
      for (let d = 0; d < due.length; d++) replay(due[d]);
      due.length = 0;
    };

    // `keepCrew`: a kept hub's suspension, whose crew runs on after it. Otherwise the scene's systems are already going.
    const dispose = (keepCrew = false) => {
      release(keepCrew);
      role = "solo";
      resetEvents();
    };

    return { update, dispose, fx: recordingFx, recordShot, recordPlan, recordHit, get role() { return role; }, get frames() { return frames; },
      get buffered() { return kept; }, get droppedEvents() { return droppedEvents; },
      get incompatible() { return incompatible; } };
  };

  BL.npcSync = { create, FORMAT, RECORD, DELAY };
})();
