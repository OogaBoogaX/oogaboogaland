// Which public Ooga Chat audience (#650, #658) the visitor's own body stands in: `main` (the main island's outdoors)
// or `dsb` (DSB Land's), else none. This is a privacy boundary, so it is physical and immediate, apart from the panels'
// zone names (zone-map.js) and their ZONE_HOLD debounce, and apart from voice-blend.js `WORLD`, which folds HQ and the
// caves into the surface. Each scene that can stand outdoors reports a reason every frame from its own geometry:
// scene-hub.js (`hubReason`), scene-dsb.js (`dsbReason`); the director reports `scene` the moment a transition starts,
// and every other scene leaves it there. `report` records a change only, and a change of scope moves the `epoch`.
// A scope is public only once something acknowledges that exact epoch and scope (`acknowledge`): until the backend's
// transition handshake exists (#665, #667) and a transport attaches (#661), nothing does, so `public` stays false and
// `supported` says why. `reset` (a reconnect, a new account) moves the epoch, so no old acknowledgement, promise or
// snapshot can reopen a scope. Plain data and pure functions plus one page-wide record; loaded in Node by the suite.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const VERSION = 1;
  // Why the body is, or is not, in a public scope. Only `outdoor` is public.
  const REASONS = ["outdoor", "interior", "descending", "entering", "transit", "scene", "game", "unscoped", "no-body", "unknown"];
  // The hub's own zones (scene-hub.js `zoneOf`) that may be public, named one by one: never a group, a prefix or WORLD.
  // The bridges and the air between lands are the public air joining them. Merge Rock (`repos`) and any other land
  // await an explicit scope decision; every zone not named here is excluded.
  const HUB_OUTDOOR = new Set(["outside", "between", "sphere", "rainforest", "bifrost"]);
  const HUB_UNDER = new Set(["rainforest-under", "hq", "hq-basement"]);
  // The hub's reason from its immediate zone and whether the body is inside a cave or the Sphere's shell (either
  // counts, mouth plane and shell wall being the entrances). A level crossing down (rainforest-under at any depth,
  // HQ's ramps) is already excluded, however much surface the voice blend still keeps.
  const hubReason = (zone, inside) => inside ? "interior" : HUB_UNDER.has(zone) ? "descending" : HUB_OUTDOOR.has(zone) ? "outdoor"
    : zone === "repos" ? "unscoped" : "unknown";
  // DSB Land's: outdoors only with no room active, no entry or exit fading (an entry is excluded from its request on,
  // before the fade), and the arrival done. An unknown room is a room.
  const dsbReason = (travelling, transitioning, room) => travelling ? "transit" : transitioning ? "entering" : room ? "interior" : "outdoor";
  const create = () => {
    const state = { version: VERSION, scope: null, reason: "scene", epoch: 0, acknowledged: -1, public: false, supported: false };
    const listeners = new Set();
    const emit = () => { for (const fn of listeners) fn(state); };
    // A scene's verdict. Returns whether anything changed; listeners hear changes only.
    const report = (scope, reason) => {
      if (!REASONS.includes(reason) || (scope !== null) !== (reason === "outdoor") || scope !== null && scope !== "main" && scope !== "dsb") {
        throw new Error(`outdoor scope: ${scope} for ${reason}`);
      }
      if (scope === state.scope && reason === state.reason) return false;
      if (scope !== state.scope) state.epoch++;
      state.scope = scope;
      state.reason = reason;
      state.public = false;
      emit();
      return true;
    };
    // The backend's word that this epoch's scope is open. A stale epoch, another scope or an excluded one is refused.
    const acknowledge = (epoch, scope) => {
      if (!state.supported || epoch !== state.epoch || scope !== state.scope || scope === null) return false;
      state.acknowledged = epoch;
      state.public = true;
      emit();
      return true;
    };
    // Whatever was granted before is gone: a reconnect, a new account or a lost transport.
    const reset = () => {
      state.epoch++;
      state.public = false;
      emit();
    };
    // A transport that can carry the handshake (#661) says it is there; without one nothing is ever public.
    const setSupported = (on) => {
      if (state.supported === !!on) return;
      state.supported = !!on;
      if (!on) state.public = false;
      state.epoch++;
      emit();
    };
    const subscribe = (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    };
    return { state, report, acknowledge, reset, setSupported, subscribe };
  };
  const page = create();
  BL.outdoorScope = { VERSION, REASONS, HUB_OUTDOOR, hubReason, dsbReason, create, state: page.state, report: page.report,
    acknowledge: page.acknowledge, reset: page.reset, setSupported: page.setSupported, subscribe: page.subscribe };
})();
