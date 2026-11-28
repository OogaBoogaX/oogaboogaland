// The hosted Studio uses an HTTP save, never a second Room socket. Identity and the session
// digest are supplied by this edge only; the Room serializes saves without replacing a player.
import { allowed, fromSite, getSessionFromRequest, json, readBody } from "./http.js";
import { equipmentCommand, equipmentEnabled } from "./equipment-model.js";
import { equipmentHatArchive, equipmentHats } from "./equipment-hats.js";
import { equipmentWardrobe } from "./equipment-wardrobe.js";
import { sha256Hex } from "./crypto.js";

export const createEquipmentHandler = (session = getSessionFromRequest) => async (request, env) => {
  if (!equipmentEnabled(env)) return json({ error: "not found" }, 404);
  if (request.method !== "GET" && request.method !== "PUT") return json({ error: "method not allowed" }, 405, { allow: "GET, PUT" });
  if (!fromSite(request, env.SITE_ORIGIN)) return json({ error: "forbidden" }, 403);
  let found;
  try { found = await session(request, env, true); } catch { return json({ error: "unavailable" }, 503); }
  if (!found) return json({ error: "unauthenticated" }, 401);
  if (!env.ROOM || !env.DB) return json({ error: "unavailable" }, 503);
  if (!(await allowed(env.EQUIPMENT_LIMITER, `${found.player.id}:${request.method}`))) return json({ error: "limited" }, 429, { "retry-after": "60" });
  let command = null;
  if (request.method === "PUT") {
    const raw = await readBody(request, 4096);
    if (raw === null) return json({ error: "too large" }, 413);
    try { command = equipmentCommand(JSON.parse(raw)); } catch { return json({ error: "invalid equipment" }, 400); }
  }
  try {
    const { status, ...body } = await env.ROOM.getByName("island").equipmentFor(found.player.id, found.session.token_hash, command);
    return json(body, status);
  } catch { return json({ error: "unavailable" }, 503, { "retry-after": "5" }); }
};

export const handleEquipment = createEquipmentHandler();

// Deployments compare this public history before replacing a Worker. Keep it available with
// equipment disabled so disabling and later enabling cannot silently discard pinned versions.
export const handleEquipmentCatalog = request => {
  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "method not allowed" }, 405, { allow: "GET, HEAD" });
  const response = json({ format: 1, items: equipmentHats.items.map(({ id, versions }) => ({ id, versions })) });
  return request.method === "HEAD" ? new Response(null, { headers: response.headers }) : response;
};

// The wardrobe's history beside it: every piece ever published, retired ones too, so a release can refuse to drop one
// someone may be wearing (scripts/equipment-retention.mjs). Its own address keeps the hat catalog's shape as it was.
export const handleWardrobeCatalog = request => {
  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "method not allowed" }, 405, { allow: "GET, HEAD" });
  const response = json({ format: 1, items: equipmentWardrobe.items.map(({ id, version }) => ({ id, version })) });
  return request.method === "HEAD" ? new Response(null, { headers: response.headers }) : response;
};

// Public immutable geometry lets a page already open accept a newly offered version without
// reloading its renderer. Only reviewed archives bundled with this Worker can be requested.
export const handleEquipmentHat = async (request, env, url = new URL(request.url)) => {
  if (!equipmentEnabled(env)) return json({ error: "not found" }, 404);
  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "method not allowed" }, 405, { allow: "GET, HEAD" });
  const match = /^\/api\/equipment\/hats\/([a-f0-9]{64})\.json$/.exec(url.pathname);
  const archive = match && equipmentHatArchive(match[1]);
  if (typeof archive !== "string") return json({ error: "not found" }, 404);
  if (new TextEncoder().encode(archive).byteLength > 512 * 1024 || await sha256Hex(archive) !== match[1])
    return json({ error: "unavailable" }, 503);
  const etag = `"${match[1]}"`, headers = { "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", etag };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : archive, { headers });
};
