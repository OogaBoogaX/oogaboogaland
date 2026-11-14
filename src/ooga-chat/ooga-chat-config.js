// Ooga Chat's public configuration contract (docs/ooga-chat-app.md). The page asks one same-origin address,
// `BOOTSTRAP_PATH`, what this deployment offers; `parseBootstrap` is the boundary that turns that answer into the app's
// mode. A missing, unreadable or foreign answer is "unavailable", an answer from another revision of the contract is
// "stale" (reload), and only a valid one is "live". Nothing here falls back to fixtures: the fixture entry
// (fixture.html) supplies its own adapter and is never part of the production artifact. No secret belongs in the
// answer or in this file: paths only, each a same-origin absolute path the server owns.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const BOOTSTRAP_VERSION = 1;
  const BOOTSTRAP_PATH = "/api/bootstrap";
  // The protocol revisions this build speaks; the server lists the revisions it accepts for each.
  const PROTOCOLS = Object.freeze({ identity: 1, audience: 1, media: 1 });
  const PROVIDERS = ["github", "x"];
  // A path the page may navigate or fetch: absolute, same origin (never "//host"), no scheme, bounded.
  const pathOk = (value) => typeof value === "string" && value.length <= 200 && /^\/(?!\/)[\w\-./?=&%]*$/.test(value) && !value.includes("..");
  const unavailable = (reason) => ({ ok: false, mode: "unavailable", reason });
  // `options.fixture` admits the fixture adapter's demo payments; production never accepts them.
  const parseBootstrap = (raw, build, options = {}) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return unavailable("no configuration");
    if (raw.version !== BOOTSTRAP_VERSION) {
      return Number.isInteger(raw.version) ? { ok: false, mode: "stale", reason: `configuration v${raw.version}` } : unavailable("no configuration version");
    }
    const protocols = {};
    for (const [name, mine] of Object.entries(PROTOCOLS)) {
      const theirs = raw.protocols?.[name];
      if (!Array.isArray(theirs) || !theirs.includes(mine)) return { ok: false, mode: "stale", reason: `${name} protocol` };
      protocols[name] = mine;
    }
    const paths = raw.paths && typeof raw.paths === "object" ? raw.paths : {};
    const login = {};
    for (const provider of PROVIDERS) if (raw.features?.[provider] === true && pathOk(paths.login?.[provider])) login[provider] = paths.login[provider];
    const session = pathOk(paths.session) ? paths.session : null, logout = pathOk(paths.logout) ? paths.logout : null;
    const feed = raw.features?.feed === true ? "live" : options.fixture && raw.features?.feed === "demo" ? "demo" : "off";
    const features = { github: !!login.github, x: !!login.x, voice: raw.features?.voice === true, feed };
    // A newer deployment's build is worth a reload; an absent or matching one is not.
    const newer = typeof raw.build === "string" && raw.build.length <= 64 && build && raw.build !== build ? raw.build : null;
    return { ok: true, mode: "live", features, paths: { login, session, logout }, protocols, newer };
  };
  // The signed-in account as the session address reports it (identity protocol 1, docs/ooga-chat-app.md); anything else
  // is signed out. `principal` is the server's opaque identity: equality, deduplication and every per-person state key
  // on it, never on the login, which can be renamed. `providerUserId` stays a string (an X id outgrows a safe integer).
  // Capabilities are the server's: `speak` and `contributor` count only for a GitHub account the server reports
  // `eligible`, and never come from the provider, the name or anything the page saved. `unknown` is not eligible.
  const ELIGIBILITY = ["eligible", "ineligible", "unknown", "revoked"];
  // The longest stale window the page honours: the server's `staleAfter`, in seconds, bounded here, never invented.
  const STALE_MAX_S = 3600;
  // Text a person chose, without control or direction-override characters, bounded.
  const clean = (text, max) => typeof text === "string" ? text.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, "").trim().slice(0, max) : "";
  const time = (value) => Number.isSafeInteger(value) && value > 0 ? value : null;
  const parseSession = (raw, now = Date.now()) => {
    const who = raw?.identity;
    if (!who || !PROVIDERS.includes(who.provider) || typeof who.login !== "string" || !/^[\w.-]{1,39}$/.test(who.login)) return null;
    if (typeof who.principal !== "string" || !/^[\w:.-]{1,128}$/.test(who.principal)) return null;
    const expiresAt = time(raw.expiresAt);
    if (expiresAt !== null && expiresAt <= now) return null;
    const display = clean(who.display, 50) || who.login;
    const avatar = pathOk(who.avatar) ? who.avatar : null;
    const providerUserId = typeof who.providerUserId === "string" && /^[\w-]{1,64}$/.test(who.providerUserId) ? who.providerUserId : null;
    const github = who.provider === "github";
    const state = !github ? "ineligible" : ELIGIBILITY.includes(raw.eligibility?.state) ? raw.eligibility.state : "unknown";
    const checkedAt = time(raw.eligibility?.checkedAt);
    const staleAfter = checkedAt !== null && Number.isInteger(raw.eligibility?.staleAfter) && raw.eligibility.staleAfter > 0
      ? Math.min(raw.eligibility.staleAfter, STALE_MAX_S) : null;
    const eligible = state === "eligible";
    return { identity: { principal: who.principal, provider: who.provider, providerUserId, login: who.login, display, avatar },
      capabilities: { speak: eligible && raw.capabilities?.speak === true, contributor: eligible && raw.capabilities?.contributor === true },
      eligibility: { state, checkedAt, staleAfter }, expiresAt };
  };
  // Where the server's sign-in sends the browser back: `?signin=<result>&provider=<provider>` on the app's own page, a
  // result code and nothing else (the server keeps the OAuth code, verifier and tokens). The app reads it once and drops
  // it from the address at once, so routing, history and a reload never keep it.
  const RETURNS = ["ok", "denied", "failed", "unavailable", "rate-limited"];
  const RETURN_KEYS = ["signin", "provider", "reason"];
  const parseReturn = (search) => {
    const params = new URLSearchParams(search), result = params.get("signin");
    if (result === null) return null;
    const provider = params.get("provider");
    return { result: RETURNS.includes(result) ? result : "failed", provider: PROVIDERS.includes(provider) ? provider : null };
  };
  // The address's query without the return's keys, everything else (a fixture's `state`) kept in order.
  const withoutReturn = (search) => {
    const params = new URLSearchParams(search);
    for (const key of RETURN_KEYS) params.delete(key);
    const rest = params.toString();
    return rest ? `?${rest}` : "";
  };
  // The two outdoor zones; the roster's buttons (#653) choose between them. A saved value outside them is the first.
  const ZONES = ["main", "dsb"];
  const parseZone = (value) => ZONES.includes(value) ? value : ZONES[0];
  // Per-adapter storage keys, so a review session's choices never reach production's. Only `STORED` names are kept:
  // `sweep` removes any other key under this adapter's prefix and any older unversioned `ooga-chat.` key (a saved
  // screen, role or speaker flag), so nothing saved can bring back a choice panel or a microphone.
  const STORED = ["tab", "zone"];
  const prefixOf = (adapter) => `ooga-chat.${adapter === "fixture" ? "fixture." : ""}v1.`;
  const storageKey = (adapter, name) => `${prefixOf(adapter)}${name}`;
  const sweep = (storage, adapter) => {
    const mine = prefixOf(adapter), theirs = prefixOf(adapter === "fixture" ? "http" : "fixture"), gone = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith("ooga-chat.") || key.startsWith(theirs)) continue;
      if (key.startsWith(mine) && STORED.includes(key.slice(mine.length))) continue;
      gone.push(key);
    }
    for (const key of gone) storage.removeItem(key);
    return gone;
  };
  const appBuild = (doc) => doc.querySelector('meta[name="ooga-chat-build"]')?.content || "dev";
  BL.oogaChatConfig = { BOOTSTRAP_VERSION, BOOTSTRAP_PATH, PROTOCOLS, PROVIDERS, ELIGIBILITY, STALE_MAX_S, RETURNS, ZONES, STORED, pathOk,
    parseBootstrap, parseSession, parseReturn, withoutReturn, parseZone, storageKey, sweep, appBuild };
})();
