// The Worker in front of Ooga Booga Land: the built page from static assets, GitHub sign-in under
// /auth/*, the account API under /api/*, the totems' merge summaries under /api/totems/* and Repo Island's at /api/repo-totems, voice
// signalling under /api/voice/*, Tess's answers at /api/tess, /room, the island's live socket, /game/*, the sockets
// of the games the Worker hosts itself (game-host.js), /donations/*, passed on to bananapayserver over the
// DONATIONS binding, and /inspect with its feed /api/inspect/ws, the Durable Object inspector (inspect.js). Only those paths run this code (`run_worker_first` in wrangler.<env>.jsonc); every other path is
// served straight from _site.

import { handleConnectionReports, pruneConnectionReports } from "./connection-reports.js";
import { handleApi } from "./api.js";
import { handleAuth } from "./auth.js";
import { purgeExpiredSessions } from "./db.js";
import { handleDonations } from "./donations.js";
import { handleHighscores } from "./highscores.js";
import { handleArcadePlays } from "./arcade-plays.js";
import { handleCloudHopperReplays } from "./cloud-hopper-replays.js";
import { pruneCloudHopperReplays } from "./cloud-hopper-replay-store.js";
import { allowed, fromSite, getSessionFromRequest, readBody, text } from "./http.js";
import { handlePoker } from "./poker.js";
import { handleTess, pruneTess } from "./tess.js";
import { handleTotems } from "./totems.js";
import { handleRepoTotems } from "./repo-totems.js";
import { gameName } from "./games.js";
import { handleInspect } from "./inspect.js";
import { inspectEdge } from "./inspect-report.js";

export { Room } from "./room.js";
export { GameHost } from "./game-host.js";
export { Inspector } from "./inspector.js";

const ROOM_NAME = "island";

// The request passed on to a socket's object, with the player as the session says and nothing a client sent of its own.
const asPlayer = (request, found, extra = null) => {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (name.startsWith("x-player-") || name === "x-game-name") headers.delete(name);
  headers.set("x-player-id", String(found.player.id));
  headers.set("x-player-login", found.player.login);
  headers.set("x-player-display", found.player.display || found.player.login);
  headers.set("x-player-contributor", "1");
  if (extra) for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return new Request(request, { headers });
};

// Identity is decided here, once, from the session; the room trusts only the headers set below.
const handleRoom = async (request, env, ctx) => {
  if (request.headers.get("upgrade") !== "websocket") return text("Expected WebSocket", 426);
  if (!fromSite(request, env.SITE_ORIGIN)) return text("Forbidden", 403);
  const found = await getSessionFromRequest(request, env);
  if (!found) return text("Sign in first", 401);
  if (!(await allowed(env.ROOM_LIMITER, String(found.player.id)))) {
    inspectEdge(env, ctx, "limited", found.player, { which: "room" });
    return text("Too many reconnects", 429);
  }
  return env.ROOM.getByName(ROOM_NAME).fetch(asPlayer(request, found));
};

// A hosted game's socket, `/game/<kind>/<venue>` (game-host.js): only a game and venue the registry names (games.js)
// reaches an object, so no page makes one; who the player is is decided here, as for the room. An object is made where
// `GAME_LOCATION_HINT` says (a region such as "enam"), else near whoever first connects, and stays there.
const handleGame = async (request, env, url, ctx) => {
  if (request.headers.get("upgrade") !== "websocket") return text("Expected WebSocket", 426);
  if (!fromSite(request, env.SITE_ORIGIN)) return text("Forbidden", 403);
  const [, , kind = "", venue = "", rest] = url.pathname.split("/");
  const name = rest === undefined ? gameName(kind, venue) : "";
  if (!name || !env.GAMES) return text("No such game", 404);
  const found = await getSessionFromRequest(request, env);
  if (!found) return text("Sign in first", 401);
  if (!(await allowed(env.GAME_LIMITER, String(found.player.id)))) {
    inspectEdge(env, ctx, "limited", found.player, { which: "game" });
    return text("Too many reconnects", 429);
  }
  const hint = env.GAME_LOCATION_HINT;
  return env.GAMES.get(env.GAMES.idFromName(name), hint ? { locationHint: hint } : undefined).fetch(asPlayer(request, found, { "x-game-name": name }));
};

// A voice call's body: a session description, however many tracks it carries.
const VOICE_BODY_MAX = 256 * 1024;
// Voice signalling: the room validates ownership and talks to the SFU with the secret.
const handleVoice = async (request, env, url, ctx) => {
  if (request.method !== "POST") return text("Method not allowed", 405);
  if (!fromSite(request, env.SITE_ORIGIN)) return text("Forbidden", 403);
  const found = await getSessionFromRequest(request, env);
  if (!found) return text("Sign in first", 401);
  const op = url.pathname.slice("/api/voice/".length);
  const ice = op === "ice";
  if (!(await allowed(ice ? env.VOICE_ICE_LIMITER : env.VOICE_LIMITER, String(found.player.id)))) {
    inspectEdge(env, ctx, "limited", found.player, { which: ice ? "voice-ice" : "voice" });
    return text("Too many voice requests", 429);
  }
  // Read here, and bounded, so a huge body can never reach the island's only room.
  const body = await readBody(request, VOICE_BODY_MAX);
  if (body === null) return text("Too large", 413);
  const headers = new Headers({ "content-type": "application/json", "x-player-id": String(found.player.id) });
  headers.set("x-room-token", request.headers.get("x-room-token") || "");
  return env.ROOM.getByName(ROOM_NAME).fetch(new Request(new URL(`/voice/${op}`, url), { method: "POST", headers, body }));
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/poker/")) return handlePoker(request, env);
    if (url.pathname.startsWith("/auth/")) return handleAuth(request, env, url);
    if (url.pathname.startsWith("/api/totems/")) return handleTotems(request, url, env, ctx);
    if (url.pathname === "/api/repo-totems") return handleRepoTotems(request, url, env, ctx);
    if (url.pathname.startsWith("/api/voice/")) return handleVoice(request, env, url, ctx);
    if (url.pathname === "/inspect" || url.pathname === "/api/inspect/ws") return handleInspect(request, env, url);
    if (url.pathname === "/api/tess") return handleTess(request, env);
    if (url.pathname.startsWith("/api/highscores/")) return handleHighscores(request, env, ctx);
    if (url.pathname === "/api/arcade-plays" || url.pathname.startsWith("/api/arcade-plays/")) return handleArcadePlays(request, env);
    if (url.pathname.startsWith("/api/cloud-hopper-replays/")) return handleCloudHopperReplays(request, env, ctx);
    if (url.pathname === "/api/connection-reports") return handleConnectionReports(request, env);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);
    if (url.pathname === "/room") return handleRoom(request, env, ctx);
    if (url.pathname.startsWith("/game/")) return handleGame(request, env, url, ctx);
    if (url.pathname.startsWith("/donations/")) return handleDonations(request, env, url);
    return env.ASSETS.fetch(request);
  },

  // Daily: expired sessions are already refused on read; this keeps the table from growing. Tess's kept questions
  // go 90 days after they were last asked.
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(purgeExpiredSessions(env.DB));
    ctx.waitUntil(pruneTess(env.DB));
    ctx.waitUntil(pruneCloudHopperReplays(env));
    ctx.waitUntil(pruneConnectionReports(env.DB));
  },
};
