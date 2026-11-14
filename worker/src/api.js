// /api/*: who is signed in, their display name, and deleting the account.
// Signed out, /api/me answers 200 with `player: null`, so a signed-out page logs nothing. Its `donations` says
// whether this Worker reaches bananapayserver (the `DONATIONS` binding), which turns the page's real donations on
// through its own address; without the binding the page stays simulated. Its `tess` says whether the Worker has the key
// for Tess's answers (/api/tess); without it the page answers only what it knows by itself. Its `games` lists the games
// this Worker hosts itself (games.js, over the GAMES binding), each a page then follows over its own socket.

import { cookieNames, isSecureOrigin, serializeCookie } from "./cookies.js";
import { deletePlayer, getPlayer, publicPlayer, sanitizeDisplay, updateDisplay } from "./db.js";
import { fromSite, getSessionForRemoval, getSessionFromRequest, json, text } from "./http.js";
import { turnConfigured } from "./sfu.js";
import { GAME_KINDS } from "./games.js";

const BODY_MAX = 1024;

const me = async (request, env) => {
  let found;
  try { found = await (request.method === "DELETE" ? getSessionForRemoval : getSessionFromRequest)(request, env, true); }
  catch { return json({ error: "unavailable" }, 503, { "retry-after": "5" }); }
  if (request.method === "GET") return json({ player: found ? publicPlayer(found.player) : null,
    character: found ? found.character : null, donations: !!env.DONATIONS, tess: !!env.ANTHROPIC_API_KEY, highscores: !!env.DB, highscoreSnapshots: !!env.DB, arcadePlays: !!env.DB, connectionReports: !!env.DB && !!env.CONNECTION_REPORT_LIMITER,
    games: env.GAMES ? [...GAME_KINDS.keys()] : [],
    ...(found && turnConfigured(env) ? { voiceTurn: true } : {}) });
  if (!fromSite(request, env.SITE_ORIGIN)) return json({ error: "forbidden" }, 403);
  if (!found) return json({ error: "unauthenticated" }, 401);

  if (request.method === "PATCH") {
    const raw = await request.text();
    if (raw.length > BODY_MAX) return json({ error: "too large" }, 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const display = sanitizeDisplay(body && body.display);
    if (!display) return json({ error: "display must be 3-24 letters, digits or simple punctuation" }, 400);
    await updateDisplay(env.DB, found.player.id, display);
    return json({ player: publicPlayer(await getPlayer(env.DB, found.player.id)) });
  }

  if (request.method === "DELETE") {
    await deletePlayer(env.DB, found.player.id);
    // The room's voice links are by account; one that cannot be reached now must not undo the deletion.
    await Promise.resolve().then(() => env.ROOM.getByName("island").forgetVoiceLinks(found.player.id)).catch(() => {});
    const clear = serializeCookie(cookieNames(env.SITE_ORIGIN).session, "", { maxAge: 0, secure: isSecureOrigin(env.SITE_ORIGIN) });
    return new Response(null, { status: 204, headers: { "set-cookie": clear, "cache-control": "no-store" } });
  }

  return json({ error: "method not allowed" }, 405, { allow: "GET, PATCH, DELETE" });
};

export const handleApi = (request, env, url) => {
  if (url.pathname === "/api/me") return me(request, env);
  if (url.pathname === "/api/health") return text("ok", 200);
  return json({ error: "not found" }, 404);
};
