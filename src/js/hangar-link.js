// The Lightning Jet Hangar's link to its hall on the Worker (worker/src/games/hangar.js, kind "hangar" at "hall"):
// while the visitor is in the hangar, signed in, and the Worker offers the hall (`BL.gameNet.offers`, the Worker's
// GAME_FEATURES), the page follows it, so everyone in the hangar sees the same thing at the same moment; otherwise the
// hangar plays on its own, as it always has. `create()` once a visit; `update()` once a frame opens the link when the
// hall is offered and lets it go when it is not; `following` says whether the scene plays the hall's state now: while
// the link is live and its state heard, and for `GRACE_MS` after it drops (a deploy, a network change), holding what it
// last heard, so a short drop starts nothing of the page's own. `hall` is the hall's last state, `serverNow()` the
// server's clock (ms), `you` this page's account as the hall knows it, `send(msg)` a message to the hall (false while
// not live), `sendBytes` a frame of the walkers; `hosting`, whether this page is the one the hall has move the walkers
// (`hangar-relay.js`), whose frames from the others go to `bytes`. The hall hears whether the page is showing (`seen`)
// as it joins and whenever that changes, so a hidden page hands the walkers on. `close()` on leaving.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};

  const KIND = "hangar", VENUE = "hall", GRACE_MS = 20000;
  const create = ({ bytes = null } = {}) => {
    let link = null, hall = null, heardAt = -Infinity, told = null;
    // The hall told whether this page shows, whenever that changes and once each time the link comes up.
    const tell = () => {
      const v = !document.hidden;
      if (link && link.state === "live" && told !== v && link.send({ t: "seen", v })) told = v;
    };
    document.addEventListener("visibilitychange", tell);
    const api = {
      get following() { return !!link && !!hall && (link.state === "live" || performance.now() - heardAt < GRACE_MS); },
      get hall() { return hall; },
      get live() { return !!link && link.state === "live"; },
      get you() { return link ? link.id : 0; },
      get hosting() { return api.following && !!link && hall.host === link.id; },
      serverNow: () => link ? link.serverNow() : Date.now(),
      send: (msg) => !!link && link.send(msg),
      sendBytes: (buffer) => !!link && link.sendBytes(buffer),
      update: () => {
        const want = !!BL.gameNet && BL.gameNet.offers(KIND);
        if (want && !link) {
          link = BL.gameNet.open(KIND, VENUE, { state: (msg) => {
            if (msg.s && typeof msg.s === "object") { hall = msg.s; heardAt = performance.now(); }
          }, bytes });
        } else if (!want && link) api.close();
        if (link && link.state === "live") { heardAt = performance.now(); tell(); }
        else told = null;
      },
      close: () => {
        if (link) link.close();
        link = null; hall = null; heardAt = -Infinity; told = null;
      },
      dispose: () => {
        api.close();
        document.removeEventListener("visibilitychange", tell);
      }
    };
    return api;
  };

  BL.hangarLink = { create };
})();
