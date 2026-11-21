// Which public Ooga Chat audience (#650, #658) the visitor's own body stands in: `main` (the main island's outdoors)
// or `dsb` (DSB Land's), else none. This is a privacy boundary, so it is physical and immediate, apart from the panels'
// zone names (zone-map.js) and their ZONE_HOLD debounce, and apart from voice-blend.js `WORLD`, which folds HQ and the
// caves into the surface. Each scene that can stand outdoors reports a reason every frame from its own geometry:
// scene-hub.js (`hubReason`), scene-dsb.js (`dsbReason`). The director holds it at `scene` for a whole transition
// (`hold`), from the moment one starts until it settles, so the old scene's last frames during the fade cannot report
// the body outdoors again; every other scene leaves it there. `report` records a change only, and a change of scope
// moves the `epoch`.
// A scope is public only once something acknowledges that exact epoch and scope (`acknowledge`): until the backend's
// transition handshake exists (#665, #667) and a transport attaches (#661), nothing does, so `public` stays false and
// `supported` says why. `reset` (a reconnect, a new account) moves the epoch, so no old acknowledgement, promise or
// snapshot can reopen a scope. Plain data and pure functions plus one page-wide record; loaded in Node by the suite.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const VERSION = 1;
  // Why the body is, or is not, in a public scope. Only `outdoor` is public.
  const REASONS = ["outdoor", "interior", "descending", "entering", "transit", "scene", "game", "no-body", "unknown"];
  // The hub's own zones (scene-hub.js `zoneOf`) that may be public, named one by one: never a group, a prefix or WORLD.
  // The bridges and the air between lands are the public air joining them, and Merge Rock (`repos`) is one of those
  // lands. Every zone not named here is excluded.
  const HUB_OUTDOOR = new Set(["outside", "between", "sphere", "rainforest", "bifrost", "repos"]);
  const HUB_UNDER = new Set(["rainforest-under", "hq", "hq-basement"]);
  // The hub's reason from its immediate zone, whether the body is inside the Sphere's shell (its wall being the
  // entrance), and whether it has started down a level (`descending`: the hub's voice levels say so, including the air
  // off the island's edge and HQ's entrance ramps while their zone still reads `outside`). A level crossing is excluded
  // at any depth, however much surface the voice blend keeps. The caves' entrances on the island, up to the scene or
  // level each leads to, are the island's surface (`outside`) and so public.
  const hubReason = (zone, inside, descending = false) => inside ? "interior" : descending || HUB_UNDER.has(zone) ? "descending"
    : HUB_OUTDOOR.has(zone) ? "outdoor" : "unknown";
  // DSB Land's: outdoors only with no room active, no entry or exit fading (an entry is excluded from its request on,
  // before the fade), and the arrival done. An unknown room is a room.
  const dsbReason = (travelling, transitioning, room) => travelling ? "transit" : transitioning ? "entering" : room ? "interior" : "outdoor";
  // A cave cabinet's seat (`<id>@out`, arcade-cabinets.js) holds the body at its slot on the island's surface for the
  // whole game, whatever scene draws it, so the player stays public there; any other scene or game keeps its reason.
  const seatReason = (otherwise) => {
    const seat = BL.net && BL.net.cabinet;
    return seat && seat.id.endsWith("@out") ? "outdoor" : otherwise;
  };
  const create = () => {
    const state = { version: VERSION, scope: null, reason: "scene", epoch: 0, acknowledged: -1, public: false, supported: false };
    const listeners = new Set();
    let held = false;
    const emit = () => { for (const fn of listeners) fn(state); };
    // A scene's verdict. Returns whether anything changed; listeners hear changes only.
    const report = (scope, reason) => {
      if (!REASONS.includes(reason) || (scope !== null) !== (reason === "outdoor") || scope !== null && scope !== "main" && scope !== "dsb") {
        throw new Error(`outdoor scope: ${scope} for ${reason}`);
      }
      if (held || scope === state.scope && reason === state.reason) return false;
      if (scope !== state.scope) state.epoch++;
      state.scope = scope;
      state.reason = reason;
      state.public = false;
      emit();
      return true;
    };
    // A scene change: out of every scope from its start (`hold(true)`) until it settles (`hold(false)`), whatever any
    // scene reports meanwhile; the scene that is there afterwards reports again from its next frame.
    const hold = (on) => {
      if (on) report(null, "scene");
      held = !!on;
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
    return { state, report, hold, acknowledge, reset, setSupported, subscribe };
  };
  const page = create();
  BL.outdoorScope = { VERSION, REASONS, HUB_OUTDOOR, hubReason, dsbReason, seatReason, create, state: page.state, report: page.report,
    hold: page.hold, acknowledge: page.acknowledge, reset: page.reset, setSupported: page.setSupported, subscribe: page.subscribe };
})();
