// What this deployment offers, as the page and an operator read it: the bootstrap (`GET /api/bootstrap`, the contract
// in docs/ooga-chat-app.md that the app parses with `parseBootstrap`), the public health (`GET /api/chat/health`) and
// the version (`GET /api/chat/version`). Feature flags (`FEATURES`, comma-separated, in wrangler.ooga-chat.<env>.jsonc)
// say what the owner has turned on; a flag counts only when what it needs is also there (a client id and secret, the
// database, the island Worker's bridge, the donations binding), so a missing secret or binding switches its feature
// off rather than offering a button that fails. Nothing here names a binding, a secret, an account id or a database id.

import { BRIDGE_VERSION } from "../../src/chat-bridge-protocol.js";
import { bridgeHello, bridgeReadiness } from "./bridge.js";
import { publicState } from "./public.js";

export const FLAGS = ["github", "x", "listen", "speak", "feed", "commons", "cloud", "chats"];
// The protocol revisions this deployment's server speaks, which the page checks against its own.
// Audience protocol 2 is a hosted chat's (docs/ooga-chat-hosts.md), offered while `chats` is on.
export const PROTOCOLS = { identity: [1], audience: [1], media: [1] };
export const PATHS = {
  session: "/api/chat/me",
  logout: "/api/chat/logout",
  login: { github: "/auth/github", x: "/auth/x" },
  audience: "/api/chat/audience",
  commons: "/api/chat/commons",
  chats: "/api/chat/chats",
};
export const BOOTSTRAP_VERSION = 1;

export const flagsOf = (env) => new Set(String(env.FEATURES || "").split(",").map((name) => name.trim()).filter((name) => FLAGS.includes(name)));

/** Every feature's effective state: its flag, and everything it needs. `bridge` is ChatBridge's `hello`, or null. */
export const effective = (env, bridge) => {
  const flags = flagsOf(env), db = !!env.DB;
  const on = (name) => flags.has(name);
  const reached = !!bridge && bridge.version === BRIDGE_VERSION && bridge.environment === env.ENVIRONMENT;
  const github = on("github") && db && !!env.GITHUB_CLIENT_ID && !!env.GITHUB_CLIENT_SECRET;
  const x = on("x") && db && !!env.X_CLIENT_ID && !!env.X_CLIENT_SECRET;
  const listen = on("listen") && (github || x) && reached && !!bridge.features?.bridge && !!bridge.voice;
  const speak = on("speak") && listen && github;
  return {
    github, x, listen, speak,
    feed: on("feed") && !!env.DONATIONS,
    commons: on("commons") && github && reached && !!bridge.features?.commons,
    cloud: on("cloud") && speak && !!bridge.features?.cloud,
    // Hosted chats: listening through the bridge, with the island's own `chats` switch. A chat lets anyone signed in speak.
    chats: on("chats") && listen && !!bridge.features?.chats,
    bridge: reached ? "ok" : bridge ? "mismatch" : env.OBL ? "unavailable" : "unbound",
  };
};

let build = null;
/** The staged app's build identity, from the build.json the app's own build writes beside it; "" when it has none. */
export const appBuild = async (env) => {
  if (build !== null && build.env === env) return build.value;
  let value = "";
  try {
    const res = env.ASSETS ? await env.ASSETS.fetch(new Request("https://assets.invalid/build.json")) : null;
    const data = res && res.ok ? await res.json() : null;
    if (data && data.app === "ooga-chat" && typeof data.build === "string" && /^[\w.-]{1,64}$/.test(data.build)) value = data.build;
  } catch { /* No staged build: the page then never hears of a newer one. */ }
  build = { env, value };
  return value;
};

/** The island's origin (`ISLAND_ORIGIN`): an https origin with no path, or null. */
export const islandOrigin = (env) => {
  try {
    const url = new URL(env.ISLAND_ORIGIN || "");
    return url.protocol === "https:" && url.origin === env.ISLAND_ORIGIN ? url.origin : null;
  } catch { return null; }
};

export const bootstrap = async (env) => {
  const features = effective(env, await bridgeHello(env));
  const login = {};
  if (features.github) login.github = PATHS.login.github;
  if (features.x) login.x = PATHS.login.x;
  const paths = { login, ...(env.DB ? { session: PATHS.session, logout: PATHS.logout } : {}), ...(features.listen ? { audience: PATHS.audience } : {}),
    ...(features.commons ? { commons: PATHS.commons } : {}), ...(features.chats ? { chats: PATHS.chats } : {}) };
  return {
    version: BOOTSTRAP_VERSION,
    build: await appBuild(env),
    environment: env.ENVIRONMENT || "",
    protocols: features.chats ? { ...PROTOCOLS, audience: [...PROTOCOLS.audience, 2] } : PROTOCOLS,
    features: { github: features.github, x: features.x, voice: features.listen, feed: features.feed, speak: features.speak, commons: features.commons, cloud: features.cloud, chats: features.chats },
    paths,
    // The island the chats belong to, for a chat's Go there: an https origin, or none.
    ...(features.chats && islandOrigin(env) ? { island: islandOrigin(env) } : {}),
  };
};

let database = null;
const databaseOk = async (env, now) => {
  if (!env.DB) return false;
  if (database && database.env === env && now - database.at < 30000) return database.ok;
  let ok = false;
  try { ok = !!(await env.DB.prepare("SELECT 1 AS up").first()); } catch { ok = false; }
  database = { env, at: now, ok };
  return ok;
};

/** Public readiness: enough for an operator or a status page to tell what is off, and nothing that identifies anyone. */
export const health = async (env, now = Date.now()) => {
  const bridge = await bridgeHello(env, now), features = effective(env, bridge);
  const db = await databaseOk(env, now);
  const assets = (await appBuild(env)) !== "";
  const checks = {
    assets, database: db, bridge: features.bridge,
    auth: { github: features.github, x: features.x },
    voice: features.listen, speak: features.speak, feed: features.feed, commons: features.commons,
    // #669: the island's media (`off` while listening is) and the public panels' data as this isolate last read it.
    media: features.listen ? await bridgeReadiness(env, now) : "off",
    publicData: publicState(env, now),
  };
  // Assets and the database are what every visitor needs; the rest can be off on purpose, but what is on must be well:
  // listening's media (the SFU, the cleanup queue) and the public panels' data once read.
  const mediaWell = checks.media === "off" || (checks.media !== "unavailable" && checks.media.sfu === "ok" && checks.media.cleanup === "ok");
  const dataWell = checks.publicData === "ok" || checks.publicData === "unknown";
  const status = assets && db && features.bridge === "ok" && mediaWell && dataWell ? "ok" : assets ? "degraded" : "down";
  return { schema: 1, environment: env.ENVIRONMENT || "", status, checks };
};

export const version = async (env) => ({
  schema: 1,
  environment: env.ENVIRONMENT || "",
  worker: env.CF_VERSION_METADATA && typeof env.CF_VERSION_METADATA.id === "string" ? env.CF_VERSION_METADATA.id : "",
  build: await appBuild(env),
  protocols: PROTOCOLS,
  bridge: BRIDGE_VERSION,
});
