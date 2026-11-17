// The Lightning Jet Hangar's link to its hall on the Worker (worker/src/games/hangar.js, kind "hangar" at "hall"):
// while the visitor is in the hangar, signed in, and the Worker offers the hall (`BL.gameNet.offers`, the Worker's
// GAME_FEATURES), the page follows it, so everyone in the hangar sees the same thing at the same moment; otherwise the
// hangar plays on its own, as it always has. `create()` once a visit; `update()` once a frame opens the link when the
// hall is offered and lets it go when it is not; `following` says whether the scene plays the hall's state now: while
// the link is live and its state heard, and for `GRACE_MS` after it drops (a deploy, a network change), holding what it
// last heard, so a short drop starts nothing of the page's own. `hall` is the hall's last state, `serverNow()` the
// server's clock (ms), `send(msg)` a message to the hall (false while not live); `close()` on leaving.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};

  const KIND = "hangar", VENUE = "hall", GRACE_MS = 20000;
  const create = () => {
    let link = null, hall = null, heardAt = -Infinity;
    const api = {
      get following() { return !!link && !!hall && (link.state === "live" || performance.now() - heardAt < GRACE_MS); },
      get hall() { return hall; },
      get live() { return !!link && link.state === "live"; },
      serverNow: () => link ? link.serverNow() : Date.now(),
      send: (msg) => !!link && link.send(msg),
      update: () => {
        const want = !!BL.gameNet && BL.gameNet.offers(KIND);
        if (want && !link) {
          link = BL.gameNet.open(KIND, VENUE, { state: (msg) => {
            if (msg.s && typeof msg.s === "object") { hall = msg.s; heardAt = performance.now(); }
          } });
        } else if (!want && link) api.close();
        if (link && link.state === "live") heardAt = Math.max(heardAt, performance.now() - 1);
      },
      close: () => {
        if (link) link.close();
        link = null; hall = null; heardAt = -Infinity;
      }
    };
    return api;
  };

  BL.hangarLink = { create };
})();
