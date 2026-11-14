// The island Room's side of Ooga Chat's audience (#665): the panel's messages (`audience-v1`, src/js/audience.js) and
// what the Room tells the Audience object (audience.js) about its own players. Kept out of room.js and reached through
// protocol.js, as hockey and block are, so the Room's checks load it with the rest of the protocol. Pure of the host.
//
// To the Audience: `world(seq, speakers, active)` whenever who publishes outdoors, or who is in the island's voice at
// all, changes (a signature check sends nothing otherwise): `speakers` are the players the outdoor handshake has opened
// (#667 fills `p.outdoor`; until then nobody), `active` every player in voice anywhere, so a chat speaker never doubles
// an island source. `watch(zones)` names the zones the Room has panels open on, so deltas reach it only for those.
// From the Audience: `audienceDelta(delta)` (Room RPC), relayed to each panel on that zone with its own `self`.
// A panel asks with `audience-view` (a zone to see; the same zone again sends nothing new) and `audience-resync` (a
// gap), and gets a snapshot in parts of PART_ROWS rows: `{ t: "audience", v: 1, kind: "snapshot", epoch, rev, zone,
// part, parts, you, rows }`, then `kind: "delta"` messages with `base`. Viewing never moves the visitor's Ooga, voice
// or microphone; the island's own players are listed only while they speak outdoors.

import { islandRow, isZone } from "./audience-model.js";
import { bridgeFeatures } from "./chat-bridge-protocol.js";

export const AUDIENCE_FEATURE = "audience-v1";
export const AUDIENCE_V = 1;
export const PART_ROWS = 100;
const NAME = "audience";

const selfOf = (p) => `gh:${p.id}`;
const enabled = (room) => !!room.env && !!room.env.AUDIENCE && bridgeFeatures(room.env).bridge;
const stub = (room) => room.env.AUDIENCE.getByName(NAME);

export const audienceRoom = {
  enabled,
  features: (room) => (enabled(room) ? [AUDIENCE_FEATURE] : []),

  parse: (msg) => {
    if (msg.v !== AUDIENCE_V || !isZone(msg.zone)) return null;
    return { t: msg.t, zone: msg.zone };
  },

  // What the panel's footer may offer the visitor: the island's own voice is how an island player speaks.
  you: (p) => ({ speak: p.outdoor && p.outdoor.state === "open" ? "active" : "eligible" }),

  async view(room, p, zone, again = false) {
    if (!enabled(room)) return;
    if (p.audienceZone === zone && !again) return;
    p.audienceZone = zone;
    room.saveAttachment(p);
    audienceRoom.watch(room);
    await audienceRoom.snapshot(room, p);
  },

  async snapshot(room, p) {
    const zone = p.audienceZone;
    let snap;
    try { snap = await stub(room).snapshot(zone); } catch { snap = null; }
    if (!snap || room.players.get(p.id) !== p || p.audienceZone !== zone) return;
    const rows = snap.rows.map((row) => islandRow(row, selfOf(p)));
    const parts = Math.max(1, Math.ceil(rows.length / PART_ROWS));
    for (let part = 0; part < parts; part++) {
      room.send(p.ws, { t: "audience", v: AUDIENCE_V, kind: "snapshot", epoch: snap.epoch, rev: snap.rev, zone, part, parts,
        you: audienceRoom.you(p), rows: rows.slice(part * PART_ROWS, part * PART_ROWS + PART_ROWS) });
    }
  },

  delta(room, delta) {
    if (!delta || !isZone(delta.zone)) return;
    for (const p of room.players.values()) {
      if (p.audienceZone !== delta.zone) continue;
      room.send(p.ws, { t: "audience", v: AUDIENCE_V, kind: "delta", epoch: delta.epoch, rev: delta.rev, base: delta.base, zone: delta.zone,
        upsert: delta.upsert.map((row) => islandRow(row, selfOf(p))), remove: delta.remove.map((r) => r.id), you: audienceRoom.you(p) });
    }
  },

  // The zones with a panel open, sent only when that set changes.
  watch(room) {
    if (!enabled(room)) return;
    const zones = [...new Set([...room.players.values()].map((p) => p.audienceZone).filter(isZone))].sort();
    const sig = zones.join(",");
    if (room.audienceWatch === sig) return;
    room.audienceWatch = sig;
    room.background(stub(room).watch(zones).catch(() => {}));
  },

  // The island's word on its players, sent only when it changes, newest `seq` winning at the Audience.
  world(room) {
    if (!enabled(room)) return;
    const speakers = [], active = [];
    for (const p of room.players.values()) {
      // In the island's voice at all (a microphone published, or listening with it muted): its source wins.
      const inVoice = !!(p.voice && (p.voice.track || p.voice.pub || (p.voice.sub && p.muted === true)));
      if (inVoice) active.push(selfOf(p));
      const o = p.outdoor;
      if (inVoice && o && o.state === "open" && isZone(o.scope))
        speakers.push({ id: selfOf(p), zone: o.scope, mic: p.muted ? "muted" : "on", login: p.login, display: p.display || p.login,
          character: typeof p.body === "string" ? p.body.replace(/^gorilla:/, "") : null, hand: p.hand ? p.handEmoji || "" : "" });
    }
    speakers.sort((a, b) => (a.id < b.id ? -1 : 1));
    active.sort();
    const sig = JSON.stringify([speakers, active]);
    if (room.audienceWorld === sig) return;
    room.audienceWorld = sig;
    room.audienceSeq = Math.max(Date.now(), (room.audienceSeq || 0) + 1);
    room.background(stub(room).world(room.audienceSeq, speakers, active).catch(() => {}));
  },

  leave(room) {
    audienceRoom.watch(room);
    audienceRoom.world(room);
  },
};
