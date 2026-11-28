// WorldWatch: the World Map's live socket (/api/world/live, world.js), one object named `world` (world-report.js
// WORLD_NAME). Map pages connect here, never to the room, so a viewer takes none of the room's player slots and adds
// nothing to its sockets. The room reports who stands where as it changes (world-report.js) and this sends each
// viewer what its tier may see, in the shape /api/world answers (`answerFor`), so the page draws either the same way.
//
// Viewers only listen. Their sockets are hibernatable, tagged by the tier the Worker decided from their session, and
// their pings are answered by the runtime without waking this; there is no timer. The view is kept in memory only: on a
// wake it is asked of the room again as the first viewer connects, and a report brings it anyway. Nothing is stored.
// An Inspector account also gets the Inspector's object list (its reports, at most every OBJECTS_MS), never its rows.
import { DurableObject } from "cloudflare:workers";
import { answerFor } from "./world.js";
import { inspectorAllowed, inspectorOn, INSPECTOR_NAME } from "./inspect-report.js";

export const MAX_VIEWERS = 500;
const TIERS = ["public", "player", "inspector"], OBJECTS_MS = 10000, ISLAND = "island";

export class WorldWatch extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.view = null;
    this.at = 0;
    this.objects = [];
    this.objectsAt = 0;
    this.asking = null;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  // A viewer: the Worker checked where the request came from and named its tier in the headers it set.
  async fetch(request) {
    if (request.headers.get("upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const tier = request.headers.get("x-viewer-tier"), id = Number(request.headers.get("x-viewer-id"));
    if (!TIERS.includes(tier) || (tier === "inspector" && !inspectorAllowed(this.env, id))) return new Response("Not found", { status: 404 });
    const others = this.ctx.getWebSockets().length;
    if (others >= MAX_VIEWERS) return new Response("Too many viewers", { status: 503 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [tier]);
    // The first viewer (or one after a wake) asks the room: it starts reporting, and the view is current. A room that
    // could not be asked may not be reporting at all, so the socket would claim to be live over a stale view: it is
    // closed instead, and the page goes on polling and tries the socket again later.
    if ((!others || !this.view) && !(await this.ask())) {
      server.close(1011, "room unavailable");
      return new Response(null, { status: 101, webSocket: client });
    }
    if (tier === "inspector") await this.inspected();
    server.send(this.answer(tier));
    return new Response(null, { status: 101, webSocket: client });
  }

  // The room's report (world-report.js): the view as it now stands. Its answer tells the room whether to go on.
  async report(view) {
    this.take(view);
    await this.push();
    return { watching: this.ctx.getWebSockets().length > 0 };
  }

  // Viewers only listen.
  webSocketMessage() {}

  take(view) {
    this.view = view;
    this.at = Date.now();
  }

  // True once the room has answered, so it reports from now on; false when it could not be reached.
  ask() {
    if (!this.asking) this.asking = this.env.ROOM.getByName(ISLAND).worldWatch()
      .then((view) => { this.take(view); return true; }, () => false).finally(() => { this.asking = null; });
    return this.asking;
  }

  // The Inspector's object list, for an Inspector account, read again once it is OBJECTS_MS old.
  async inspected() {
    const now = Date.now();
    if (!inspectorOn(this.env) || now - this.objectsAt < OBJECTS_MS) return;
    this.objectsAt = now;
    try { this.objects = await this.env.INSPECTOR.getByName(INSPECTOR_NAME).objects(); } catch { /* The room's own count still stands. */ }
  }

  answer(tier) {
    return JSON.stringify(answerFor(this.view, this.at, tier, tier === "inspector" ? this.objects : []));
  }

  // One answer a tier, sent to that tier's viewers alone.
  async push() {
    if (!this.view) return;
    for (const tier of TIERS) {
      const viewers = this.ctx.getWebSockets(tier);
      if (!viewers.length) continue;
      if (tier === "inspector") await this.inspected();
      const text = this.answer(tier);
      for (const ws of viewers) {
        try { ws.send(text); } catch { /* A closing socket leaves by itself. */ }
      }
    }
  }
}
