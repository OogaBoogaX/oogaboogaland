// The Worker in front of Ooga Booga Land: the built page from static assets, GitHub sign-in under
// /auth/*, the account API under /api/*, the totems' merge summaries under /api/totems/* and Repo Island's at /api/repo-totems, voice
// signalling under /api/voice/*, Tess's answers at /api/tess, GitHub pictures at /api/avatar/<id> (avatar.js), who stands where for the World Map at /api/world and, pushed, /api/world/live (world.js, world-watch.js), /room, the island's live socket, /game/*, the sockets
// of the games the Worker hosts itself (game-host.js), /donations/*, passed on to bananapayserver over the
// DONATIONS binding, /inspect with its feed /api/inspect/ws, the Durable Object inspector (inspect.js), and the lecture
// recordings under /media/lectures/* from R2 (lecture-audio.js). Only those paths run this code (`run_worker_first` in wrangler.<env>.jsonc); every other path is
// served straight from _site.

import { handleAvatar } from "./avatar.js";
import { handleCharacterCatalog } from "./character-catalog-http.js";
import { handleCharacterPortrait } from "./character-portraits.js";
import { handleConnectionReports, pruneConnectionReports } from "./connection-reports.js";
import { handleApi } from "./api.js";
import { handleChats } from "./chats.js";
import { handleEquipment, handleEquipmentCatalog, handleEquipmentHat, handleWardrobeCatalog } from "./equipment.js";
import { handleAuth } from "./auth.js";
import { purgeExpiredSessions } from "./db.js";
import { handleDonations } from "./donations.js";
import { handleHighscores } from "./highscores.js";
import { handleArcadePlays } from "./arcade-plays.js";
import { handleCloudHopperReplays } from "./cloud-hopper-replays.js";
import { pruneCloudHopperReplays } from "./cloud-hopper-replay-store.js";
import { allowed, asPlayer, fromSite, getSessionForRemoval, readBody, serviceSession, text } from "./http.js";
import { handlePoker } from "./poker.js";
import { handleTess, pruneTess } from "./tess.js";
import { handleWorld, handleWorldLive } from "./world.js";
import { handleTotems } from "./totems.js";
import { handleRepoTotems } from "./repo-totems.js";
import { gameName } from "./games.js";
import { handleInspect } from "./inspect.js";
import { handleLectureAudio } from "./lecture-audio.js";
import { inspectEdge } from "./inspect-report.js";

export { Room } from "./room.js";
export { GameHost } from "./game-host.js";
export { Inspector } from "./inspector.js";
export { WorldWatch } from "./world-watch.js";
// Ooga Chat's private door (docs/ooga-chat-backend.md): reachable only through a service binding that names it.
export { ChatBridge } from "./chat-bridge.js";
// Ooga Chat's audience (#665): both outdoor zones' listeners and speakers, apart from the Room's 32 players.
export { Audience } from "./audience.js";
// Hosted chats (docs/ooga-chat-hosts.md): the directory of live chats; each chat is an Audience object of its own.
export { ChatDirectory } from "./chat-directory.js";

const ROOM_NAME = "island";

// Identity is decided here, once, from the session; the room trusts only the headers set below.
const handleRoom = async (request, env, ctx) => {
  if (request.headers.get("upgrade") !== "websocket") return text("Expected WebSocket", 426);
  if (!fromSite(request, env.SITE_ORIGIN)) return text("Forbidden", 403);
  const found = await serviceSession(request, env);
  if (found instanceof Response) return found;
  if (!found) return text("Sign in first", 401);
  if (!(await allowed(env.ROOM_LIMITER, String(found.player.id)))) {
    inspectEdge(env, ctx, "limited", found.player, { which: "room" });
    return text("Too many reconnects", 429);
  }
  return env.ROOM.getByName(ROOM_NAME).fetch(asPlayer(request, found,
    env.EQUIPMENT_ENABLED === "1" ? { "x-player-equipment-session": found.session.token_hash } : null));
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
  const found = await serviceSession(request, env);
  if (found instanceof Response) return found;
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
  const op = url.pathname.slice("/api/voice/".length);
  // Cleanup needs the account session and Room connection token, never a new character grant.
  const cleanup = ["leave", "unpublish", "close"].includes(op);
  const found = cleanup ? await getSessionForRemoval(request, env) : await serviceSession(request, env);
  if (found instanceof Response) return found;
  if (!found) return text("Sign in first", 401);
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
    if (url.pathname.startsWith("/api/avatar/")) return handleAvatar(request, env, url, ctx);
    if (url.pathname === "/api/equipment") return handleEquipment(request, env);
    if (url.pathname === "/api/equipment/catalog") return handleEquipmentCatalog(request);
    if (url.pathname === "/api/equipment/wardrobe/catalog") return handleWardrobeCatalog(request);
    if (url.pathname.startsWith("/api/equipment/hats/")) return handleEquipmentHat(request, env, url);
    if (url.pathname === "/api/characters/catalog") return handleCharacterCatalog(request, env);
    if (url.pathname.startsWith("/api/characters/portraits/")) return handleCharacterPortrait(request, env);
    if (url.pathname === "/api/world") return handleWorld(request, env, ctx);
    if (url.pathname === "/api/world/live") return handleWorldLive(request, env);
    if (url.pathname === "/api/chats" || url.pathname.startsWith("/api/chats/")) return handleChats(request, env, url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);
    if (url.pathname === "/room") return handleRoom(request, env, ctx);
    if (url.pathname.startsWith("/game/")) return handleGame(request, env, url, ctx);
    if (url.pathname.startsWith("/donations/")) return handleDonations(request, env, url);
    if (url.pathname.startsWith("/media/lectures/")) return handleLectureAudio(request, env, url, ctx);
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
