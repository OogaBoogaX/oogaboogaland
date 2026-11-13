// The Inspector: one Durable Object ("global") that every other object reports to (inspect-report.js) and that the
// admin page at /inspect (inspect.js) watches over one hibernatable socket. It keeps one row per object (its last state,
// rates, when it was first and last heard from, how often it woke) and a log of the last LOG_KEEP events for up to a
// day, both in SQLite, so a drop that happened while nobody watched is still there to read. Rules in
// inspector-logic.js.
//
// This is the app's view, not Cloudflare's: an object that never reports is not here, sleep is inferred from a
// constructor running, and CPU, memory and billing are on the dashboard. It costs one request per report and nothing
// between them: viewers' pings are answered without waking it, the only timer is a quarter-second batch of updates
// for viewers after a report, and its alarm runs only to mark rows stale and age the log.
import { DurableObject } from "cloudflare:workers";
import { inspectorAllowed } from "./inspect-report.js";
import { LIMITS, RECENT_MS, WATCH_MS, absorb, cleanReport, nextAlarm, expiredEvents, sweep } from "./inspector-logic.js";

const BATCH_MS = 250;
const CLOSE_KICK = 4000;

export class Inspector extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.rows = new Map();
    this.events = [];
    this.upserts = new Map();
    this.added = [];
    this.removals = new Set();
    this.flushing = 0;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      const sql = ctx.storage.sql;
      sql.exec("create table if not exists object (key text primary key, row text not null)");
      sql.exec("create table if not exists event (id integer primary key autoincrement, row text not null)");
      for (const r of sql.exec("select row from object")) { const row = JSON.parse(r.row); this.rows.set(row.key, row); }
      for (const r of sql.exec("select id, row from event order by id")) this.events.push({ ...JSON.parse(r.row), id: r.id });
    });
  }

  // An object's report (inspect-report.js); the answer tells it whether anyone is watching.
  async report(raw) {
    const now = Date.now(), r = cleanReport(raw);
    if (r) {
      const { row, events } = absorb(this.rows.get(`${r.cls}:${r.name}`), r, now);
      this.save(row);
      const sql = this.ctx.storage.sql;
      for (const e of events) {
        sql.exec("insert into event (row) values (?)", JSON.stringify(e));
        const added = { ...e, id: sql.exec("select last_insert_rowid() as id").one().id };
        this.events.push(added);
        this.added.push(added);
      }
      this.prune(now);
      this.queueFlush();
      await this.schedule(now);
    }
    return { watchUntil: this.ctx.getWebSockets().length ? now + WATCH_MS : 0 };
  }

  save(row) {
    this.rows.set(row.key, row);
    this.upserts.set(row.key, row);
    this.removals.delete(row.key);
    this.ctx.storage.sql.exec("insert or replace into object (key, row) values (?, ?)", row.key, JSON.stringify(row));
  }

  prune(now) {
    const expired = expiredEvents(this.events, now);
    if (!expired.length) return;
    const ids = new Set(expired.map((e) => e.id));
    for (const id of ids) this.ctx.storage.sql.exec("delete from event where id = ?", id);
    this.events = this.events.filter((e) => !ids.has(e.id));
    this.added = this.added.filter((e) => !ids.has(e.id));
  }

  // A viewer: the Worker checked the session and the allowlist and names them in the headers it set.
  async fetch(request) {
    if (request.headers.get("upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const id = Number(request.headers.get("x-viewer-id")), login = request.headers.get("x-viewer-login") || "";
    if (!inspectorAllowed(this.env, id)) return new Response("Not found", { status: 404 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, login });
    const now = Date.now();
    this.prune(now);
    server.send(JSON.stringify({ t: "snapshot", now, you: { id, login }, limits: LIMITS, objects: [...this.rows.values()], events: this.events }));
    // Ask every object heard from lately for its detail now, rather than at its next report.
    for (const row of this.rows.values()) {
      if (now - row.lastSeen > RECENT_MS) continue;
      const stub = row.cls === "Room" ? this.env.ROOM.getByName(row.name) : row.cls === "GameHost" ? this.env.GAMES.getByName(row.name) : null;
      if (stub) this.ctx.waitUntil(stub.inspectWatch(now + WATCH_MS).catch(() => {}));
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  // Viewers only listen; their pings are answered without waking this.
  webSocketMessage() {}

  queueFlush() {
    if (this.flushing) return;
    this.flushing = setTimeout(() => this.flush(), BATCH_MS);
  }

  flush() {
    this.flushing = 0;
    if (!this.upserts.size && !this.added.length && !this.removals.size) return;
    const text = JSON.stringify({ t: "update", now: Date.now(), upsert: [...this.upserts.values()], events: this.added, remove: [...this.removals] });
    this.upserts.clear();
    this.added = [];
    this.removals.clear();
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      // Taken off the allowlist: the page goes dark at the next update.
      if (!a || !inspectorAllowed(this.env, a.id)) {
        try { ws.close(CLOSE_KICK, "not allowed"); } catch { /* closing */ }
        continue;
      }
      try { ws.send(text); } catch { /* closing */ }
    }
  }

  async alarm() {
    const now = Date.now(), { stale, removed } = sweep(this.rows.values(), now);
    for (const row of stale) this.save(row);
    for (const key of removed) {
      this.rows.delete(key);
      this.upserts.delete(key);
      this.removals.add(key);
      this.ctx.storage.sql.exec("delete from object where key = ?", key);
    }
    this.prune(now);
    this.flush();
    await this.schedule(now, true);
  }

  // Only ever brought earlier between alarms: a busy row's deadline moves on with every report, and an alarm that comes
  // early finds nothing due and sets the next one itself.
  async schedule(now, fromAlarm = false) {
    const next = nextAlarm(this.rows.values(), this.events, now);
    if (next === null) return;
    const set = fromAlarm ? null : await this.ctx.storage.getAlarm();
    if (set === null || next < set) await this.ctx.storage.setAlarm(next);
  }
}
