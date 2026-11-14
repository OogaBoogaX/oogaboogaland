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
  // A signed-in account as the session address reports it; anything else is signed out. Capabilities are the
  // server's: the page shows Join Voice only where `speak` is true and never derives it from the provider or name.
  const parseSession = (raw) => {
    const who = raw?.identity;
    if (!who || !PROVIDERS.includes(who.provider) || typeof who.login !== "string" || !/^[\w.-]{1,39}$/.test(who.login)) return null;
    const display = typeof who.display === "string" && who.display.trim() ? who.display.trim().slice(0, 32) : who.login;
    const avatar = pathOk(who.avatar) ? who.avatar : null;
    const speak = who.provider === "github" && raw.capabilities?.speak === true;
    return { identity: { provider: who.provider, login: who.login, display, avatar }, capabilities: { speak, contributor: speak && raw.capabilities?.contributor === true } };
  };
  // Per-adapter storage keys, so a review session's choices never reach production's.
  const storageKey = (adapter, name) => `ooga-chat.${adapter === "fixture" ? "fixture." : ""}v1.${name}`;
  const appBuild = (doc) => doc.querySelector('meta[name="ooga-chat-build"]')?.content || "dev";
  BL.oogaChatConfig = { BOOTSTRAP_VERSION, BOOTSTRAP_PATH, PROTOCOLS, PROVIDERS, pathOk, parseBootstrap, parseSession, storageKey, appBuild };
})();
