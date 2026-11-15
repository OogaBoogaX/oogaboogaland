// The Commons and Online Oogas for Ooga Chat's contributors (#670): a second kind of socket on the island's Room, a
// community member, with no body, pose, voice, NPC frame or player slot. It reaches the Room only through the private
// bridge (ChatBridge.fetch `/commons`, then the Room's `/community`), with the edge's assertion of a GitHub principal the
// island's contributor policy calls eligible; the Room checks the account against its own cast and ban list again.
// It shares the island's one conversation exactly: the same ring of the last CHAT_KEEP lines (`chat-history` after its
// welcome, nothing durable), the same ids and order, the same Unicode policy, the same retry dedupe and the same rate
// bucket by account, so a contributor's tabs on the island and in Ooga Chat together still speak about once a second.
// Its view of Online Oogas is presence without positions: each player's id, login, display, body, zone, voice, mute and
// hand (`join`, `leave`, `body`, `zone`, `vstate`, `hand`), and the clouds. No pose, distance, SFU id, private
// conversation or voice link reaches it, and it can send nothing but chat lines: private conversations, voice links,
// reactions over a body and every world action stay the island's (docs/ooga-chat-backend.md, the capability matrix).
// Re-exported by protocol.js, as the audience glue is, so the Room's checks load it with the protocol.

import { bridgeFeatures } from "./chat-bridge-protocol.js";
import { getPlayer } from "./db.js";
import { audienceRoom } from "./room-audience.js";

export const COMMONS_V = 1;
export const COMMONS_FEATURE = "commons-v1";
export const COMMUNITY_MAX = 128;
export const COMMUNITY_PER_ACCOUNT = 3;
export const REAUTH_MS = 60 * 60 * 1000;
const RELAYED = new Set(["join", "leave", "body", "zone", "vstate", "hand", "chat", "clouds"]);
const CLOSE = { stale: 4000, bad: 4400, auth: 4401, full: 4429 };
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

const members = (room) => room.community || (room.community = new Map());
// The Room's chat memory's life: set on the first member touch after the Room was built (a wake or a restart builds a
// new one with an empty ring), so a reconnecting app that sees a new epoch knows lines it missed are gone, not quiet.
const epochOf = (room, now) => room.communityEpoch || (room.communityEpoch = now);
const inVoice = (p) => !!p.voice && (!!p.voice.track || !!p.voice.sub && p.muted === true);
/** An island player as Online Oogas shows it to a member: presence, never a position. */
export const presenceOf = (p) => ({ id: p.id, login: p.login, display: p.display || p.login, body: p.body || null, zone: p.zone, voice: inVoice(p),
  muted: !!p.muted, hand: !!p.hand, handTone: p.handTone || 0, handEmoji: p.handEmoji || "" });

const attachmentOf = (m) => ({ community: true, connId: m.connId, id: m.id, login: m.login, display: m.display, principal: m.principal, authUntil: m.authUntil });

export const commonsRoom = {
  size: (room) => members(room).size,
  has: (room, id) => { for (const m of members(room).values()) if (m.id === id) return true; return false; },
  live: (room, m) => !!m && m.community === true && members(room).get(m.connId) === m,

  /** The member the edge vouched for, as ChatBridge handed it on (`x-community-member`), or null. */
  read(raw, now = Date.now()) {
    let who;
    try { who = JSON.parse(raw || ""); } catch { return null; }
    const id = who && typeof who.providerUserId === "string" && /^[1-9][0-9]{0,15}$/.test(who.providerUserId) ? Number(who.providerUserId) : NaN;
    if (!who || who.provider !== "github" || who.eligible !== true || !Number.isSafeInteger(id) || typeof who.login !== "string" || !LOGIN.test(who.login)) return null;
    if (!Number.isSafeInteger(who.sessionExpiresAt) || who.sessionExpiresAt <= now || typeof who.principal !== "string" || who.principal.length > 64) return null;
    return { id, login: who.login, display: typeof who.display === "string" && who.display.length <= 50 ? who.display : who.login, principal: who.principal,
      authUntil: Math.min(who.sessionExpiresAt, now + REAUTH_MS) };
  },

  // `now` is the Room's own clock, so a member's rate bucket and deadlines run on the time its players' do.
  async connect(room, request, ownedBody, now = Date.now()) {
    if (request.headers.get("upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const who = commonsRoom.read(request.headers.get("x-community-member"), now);
    // The island's own cast and contributor rule, as for a player: a member is a contributor with an Ooga.
    if (!who || !ownedBody(who.login, who.id)) return new Response("Contributors with an Ooga only", { status: 403 });
    if (room.env && room.env.DB) {
      let row;
      try { row = await getPlayer(room.env.DB, who.id); } catch { row = undefined; }
      if (row && row.banned_at) return new Response("Forbidden", { status: 403 });
      // The display name the island knows for this account, so a line reads the same from either app.
      if (row && row.display) who.display = row.display;
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    room.ctx.acceptWebSocket(server, ["community", String(who.id)]);
    const all = members(room);
    let mine = 0;
    for (const m of all.values()) if (m.id === who.id) mine++;
    if (all.size >= COMMUNITY_MAX || mine >= COMMUNITY_PER_ACCOUNT) {
      server.close(CLOSE.full, "full");
      return new Response(null, { status: 101, webSocket: client });
    }
    const m = { community: true, connId: crypto.randomUUID(), ws: server, ...who, seenAt: now, chatBucket: null };
    m.chatBucket = room.chatBucketFor(m.id, m.seenAt);
    all.set(m.connId, m);
    server.serializeAttachment(attachmentOf(m));
    room.send(server, { t: "community", v: COMMONS_V, op: "welcome", epoch: epochOf(room, now), send: bridgeFeatures(room.env).commonsSend,
      you: { id: m.id, login: m.login, display: m.display }, players: [...room.players.values()].map(presenceOf),
      features: [globalThis.BL.chatPolicy.FEATURE, COMMONS_FEATURE] });
    room.send(server, { t: "chat-history", messages: room.chat.list() });
    audienceRoom.welcome(room, m);
    await room.ensureSweep();
    return new Response(null, { status: 101, webSocket: client });
  },

  /** A woken Room's member socket, from its attachment. */
  restore(room, ws, a, now = Date.now()) {
    const m = { community: true, connId: a.connId, ws, id: a.id, login: a.login, display: a.display, principal: a.principal, authUntil: a.authUntil, seenAt: now, chatBucket: null };
    epochOf(room, now);
    members(room).set(m.connId, m);
  },

  memberOf(room, ws) {
    const a = ws.deserializeAttachment();
    const m = a && a.community ? members(room).get(a.connId) : null;
    return m && m.ws === ws ? m : null;
  },

  /** A member's frame, already parsed by the Room: a chat line is all it may send. */
  async message(room, ws, msg, now = Date.now()) {
    const m = commonsRoom.memberOf(room, ws);
    if (!m) return;
    if (msg === false) { commonsRoom.close(room, m, CLOSE.bad, "unreadable message"); return; }
    m.seenAt = now;
    if (m.authUntil <= m.seenAt) { commonsRoom.close(room, m, CLOSE.auth, "auth_required"); return; }
    if (!msg || msg.t !== "chat") return;
    // Rolled out reading first (#670): until the island's `commons-send`, a line is refused and the app keeps its draft.
    if (!bridgeFeatures(room.env).commonsSend) { room.send(ws, { t: "chat-rejected", clientId: msg.clientId, reason: "read_only" }); return; }
    if (!m.chatBucket) m.chatBucket = room.chatBucketFor(m.id, m.seenAt);
    await room.say(m, msg.text, msg.clientId);
  },

  closed(room, ws) {
    const m = commonsRoom.memberOf(room, ws);
    if (!m) return false;
    members(room).delete(m.connId);
    return true;
  },

  close(room, m, code, reason) {
    members(room).delete(m.connId);
    try { m.ws.serializeAttachment(null); m.ws.close(code, reason); } catch { /* already closed */ }
  },

  /** What the Room broadcasts that Online Oogas and The Commons show, to every member, without a position. */
  relay(room, msg) {
    if (!room.community || !room.community.size || !msg || !RELAYED.has(msg.t)) return;
    const out = JSON.stringify(msg.t === "join" ? { t: "join", p: presenceOf(room.players.get(msg.p.id) || msg.p) } : msg);
    for (const m of room.community.values()) room.send(m.ws, out);
  },

  /** An account's access ends (signed out, deleted, eligibility lost): every member socket of it closes. */
  revoke(room, id, reason) {
    let n = 0;
    for (const m of [...members(room).values()]) if (m.id === id) { commonsRoom.close(room, m, CLOSE.auth, reason === "deleted" ? "account_deleted" : "signed_out"); n++; }
    return { revoked: n };
  },

  /**
   * At each sweep: past its re-authentication deadline, no longer a contributor, or banned, a member goes; and one silent
   * past `staleMs`, its auto-answered pings included, goes as a player would, so a dead socket holds no member slot.
   */
  async sweep(room, now, ownedBody, staleMs) {
    for (const m of [...members(room).values()]) {
      if (m.authUntil <= now || !ownedBody(m.login, m.id)) { commonsRoom.close(room, m, CLOSE.auth, "auth_required"); continue; }
      const pinged = room.ctx.getWebSocketAutoResponseTimestamp(m.ws);
      if (now - Math.max(m.seenAt, pinged ? pinged.getTime() : 0) > staleMs) { commonsRoom.close(room, m, CLOSE.stale, "stale"); continue; }
      if (room.env && room.env.DB) {
        let row;
        try { row = await getPlayer(room.env.DB, m.id); } catch { continue; }
        if (row && row.banned_at) commonsRoom.close(room, m, CLOSE.auth, "revoked");
      }
    }
  },
};
