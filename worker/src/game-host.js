// One instance of a game the Worker hosts (games.js): a Durable Object per kind and venue, named only by the Worker
// (index.js `handleGame`, which also decides who each player is), holding the sockets of the pages that follow it and
// running the kind's rules on the server's clock. Nothing here touches the island's room: a busy game slows no one
// else's presence, voice or chat, and each instance runs on its own.
//
// From the room's patterns (room.js): hibernatable sockets with attachments, one socket per account (a newer one kicks
// the older with `replaced`), a cap on sockets (`full`), per-socket token buckets (protocol.js `takeToken`), and the
// false/null convention for unreadable and unwanted messages. Pages send JSON text; nothing else is read.
//
// The tick: a setTimeout chain that runs only while the kind says it runs (`running`), each call a `step` the kind
// keeps to its own fixed steps, so an idle instance has no timer and can hibernate (billed only while awake). Every tick
// it sends the kind's motion (game-wire.js bytes, when the kind writes one) to every socket; every `stateEvery` ticks,
// and at once whenever something changed, its state as JSON text (`{ t: "state", now, s }`), which a page joining gets
// at once too. While the game runs it saves the kind's record every `SAVE_MS` and on every change, so an instance
// started again (a deploy drops every socket and restarts every object) picks the game up where it stopped; a game that
// runs down deletes its own, and an alarm set with the first save deletes one left older than `RESUME_MS`, so no record
// (it names its players' accounts) outlives its game, even when nobody comes back to wake the object.
import { DurableObject } from "cloudflare:workers";
import { CLOSE_KICK, CLOSE_PROTOCOL, playerFromHeaders, takeToken } from "./protocol.js";
import { kindOf } from "./games.js";
import "../../src/js/game-wire.js";

const WIRE = globalThis.BL.gameWire;
const SAVE_MS = 5000, RESUME_MS = 10 * 60000;

export class GameHost extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Account id → { ws, id, login, display, debug, buckets }.
    this.sockets = new Map();
    this.kind = null;
    this.game = null;
    this.name = "";
    this.timer = 0;
    this.ticks = 0;
    this.savedAt = 0;
    this.sweeping = false;
    this.frame = WIRE.frame();
    this.bytes = new ArrayBuffer(WIRE.size(WIRE.MAX_ROWS, WIRE.MAX_CONFIRMS));
    const debug = String(env.GAME_DEBUG_IDS || "").split(",").map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);
    this.debugIds = new Set(debug);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      for (const ws of ctx.getWebSockets()) {
        const a = ws.deserializeAttachment();
        if (!a || !Number.isSafeInteger(a.id) || !this.bind(a.name)) continue;
        this.sockets.set(a.id, this.record(ws, a));
      }
      const saved = await ctx.storage.get("game");
      this.sweeping = (await ctx.storage.getAlarm()) !== null;
      if (saved && typeof saved === "object" && this.bind(saved.name) && Date.now() - saved.at < RESUME_MS) this.game.restore(saved.data, Date.now());
      else if (saved) await ctx.storage.delete("game");
      this.schedule();
    });
  }

  // The record's sweep: one left `RESUME_MS` after its last save goes; one still being saved waits for the next.
  async alarm() {
    this.sweeping = false;
    const saved = await this.ctx.storage.get("game");
    if (!saved) return;
    if (Date.now() - saved.at >= RESUME_MS) await this.ctx.storage.delete("game");
    else this.sweep(saved.at + RESUME_MS);
  }

  sweep(at) {
    if (this.sweeping) return;
    this.sweeping = true;
    Promise.resolve(this.ctx.storage.setAlarm(at)).catch(() => { this.sweeping = false; });
  }

  // The kind this object is, from its name (the Worker's `x-game-name`, kept in every socket's attachment and the saved
  // record): true once bound, and only ever to one name.
  bind(name) {
    if (this.kind) return name === this.name;
    const kind = kindOf(name);
    if (!kind) return false;
    this.name = name;
    this.kind = kind;
    this.game = kind.create(Date.now());
    return true;
  }

  record(ws, a) {
    return { ws, id: a.id, login: a.login, display: a.display, debug: this.debugIds.has(a.id), buckets: Object.create(null) };
  }

  async fetch(request) {
    if (request.headers.get("upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const who = playerFromHeaders(request.headers), name = request.headers.get("x-game-name") || "";
    if (!who || !who.contributor) return new Response("Contributors with an Ooga only", { status: 403 });
    if (!this.bind(name)) return new Response("No such game", { status: 404 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [String(who.id)]);
    const older = this.sockets.get(who.id);
    if (older) this.evict(older, "replaced");
    if (this.sockets.size >= this.kind.limits.sockets) {
      this.send(server, { t: "kick", reason: "full" });
      server.close(CLOSE_KICK, "full");
      return new Response(null, { status: 101, webSocket: client });
    }
    const a = { id: who.id, login: who.login, display: who.display, name };
    server.serializeAttachment(a);
    const p = this.record(server, a), now = Date.now();
    this.sockets.set(who.id, p);
    this.game.join(p, now);
    this.send(server, { t: "welcome", you: who.id, kind: this.kind.id, now, tickMs: this.kind.tickMs });
    this.send(server, this.stateMessage(now));
    this.schedule();
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    const p = this.byWs(ws);
    if (!p) return;
    if (typeof message !== "string" || message.length > this.kind.limits.chars) { this.close(p, "unreadable message"); return; }
    let raw;
    try { raw = JSON.parse(message); } catch { this.close(p, "unreadable message"); return; }
    const msg = this.kind.parse(raw);
    if (msg === false) { this.close(p, "unreadable message"); return; }
    if (!msg) return;
    const now = Date.now(), name = this.kind.bucketOf(msg.t), b = this.kind.buckets[name];
    const bucket = p.buckets[name] || (p.buckets[name] = { tokens: b.burst, at: now });
    if (!takeToken(bucket, b.rate, now, b.burst)) return;
    if (this.game.message(p, msg, now)) {
      this.broadcast(this.stateMessage(now));
      this.save(now);
    }
    this.schedule();
  }

  // On this compatibility date close handlers must not call ws.close() (room.js).
  webSocketClose(ws) {
    const p = this.byWs(ws);
    if (p) this.drop(p);
  }

  webSocketError(ws) {
    const p = this.byWs(ws);
    if (p) this.drop(p);
  }

  byWs(ws) {
    const a = ws.deserializeAttachment();
    const p = a && this.sockets.get(a.id);
    return p && p.ws === ws ? p : null;
  }

  drop(p) {
    if (this.sockets.get(p.id) !== p) return;
    this.sockets.delete(p.id);
    this.game.leave(p, Date.now());
  }

  close(p, reason) {
    this.drop(p);
    try { p.ws.close(CLOSE_PROTOCOL, reason); } catch { /* already closed */ }
  }

  evict(p, reason) {
    this.drop(p);
    this.send(p.ws, { t: "kick", reason });
    try {
      p.ws.serializeAttachment(null);
      p.ws.close(CLOSE_KICK, reason);
    } catch { /* already closed */ }
  }

  send(ws, msg) {
    try { ws.send(typeof msg === "string" || msg instanceof ArrayBuffer ? msg : JSON.stringify(msg)); } catch { /* closing */ }
  }

  broadcast(msg) {
    for (const p of this.sockets.values()) this.send(p.ws, msg);
  }

  stateMessage(now) {
    return JSON.stringify({ t: "state", now, s: this.game.state() });
  }

  schedule() {
    if (this.timer || !this.game || !this.game.running(Date.now())) return;
    this.timer = setTimeout(() => this.tick(), this.kind.tickMs);
  }

  tick() {
    this.timer = 0;
    const now = Date.now(), changed = this.game.step(now);
    this.ticks++;
    if (this.sockets.size) {
      if (this.game.motion(this.frame, now)) this.broadcast(this.bytes.slice(0, WIRE.encode(this.frame, this.bytes)));
      if (changed || this.ticks % this.kind.stateEvery === 0) this.broadcast(this.stateMessage(now));
    }
    if (changed || now - this.savedAt >= SAVE_MS) this.save(now);
    this.schedule();
  }

  // The kind's record while its game runs, deleted once it has run down. Not waited on: a lost save costs only a
  // restart's resume, and holding the frames back for it would cost every player.
  save(now) {
    this.savedAt = now;
    const data = this.game.save();
    const done = data === null ? this.ctx.storage.delete("game") : this.ctx.storage.put("game", { name: this.name, at: now, data }, { allowUnconfirmed: true });
    Promise.resolve(done).catch(() => {});
    if (data !== null) this.sweep(now + RESUME_MS);
  }
}
