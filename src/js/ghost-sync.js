// HALLOWEEN: the ghost hunt kept in step for signed-in players. The room's elected host (npc-sync.js's role) runs the
// hunt and sends its whole state as one `gh` record in the npc frame's event tail (`npcSync.extra`), four times a
// second while a page follows; a follower takes each one as it arrives (`onSnapshot`). Followers report to the host
// through the room (`net.sendGhost`, relayed to the host alone, worker/src/room.js): `start` when they click the
// herald, `ready` in its lobby, `hits` (every target their weapons landed on in the last tenth of a second, with its damage), `pause` when
// they press P. A lone `hit` is still read from an older page. The host hears them with `onMessage(msg)`, `msg.from` the room's
// id of the page that sent it. Signed out, or with no room, a page is "solo" and runs its own hunt.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};

  const fair = (g, d) => Number.isInteger(g) && g >= 0 && Number.isInteger(d) && d >= 1 && d <= 60;
  const create = ({ npcSync, write, onSnapshot, onMessage }) => {
    const net = BL.net;
    npcSync.extra = { write, read: onSnapshot };
    const receive = (msg) => {
      if (npcSync.role !== "host" || !Number.isSafeInteger(msg.from) || msg.from <= 0) return;
      if (msg.k === "start" || msg.k === "pause" || msg.k === "ready") onMessage({ k: msg.k, from: msg.from, g: 0, d: 0 });
      else if (msg.k === "hit" && fair(msg.g, msg.d)) onMessage({ k: "hit", from: msg.from, g: msg.g, d: msg.d });
      else if (msg.k === "hits" && Array.isArray(msg.h)) for (let i = 0; i + 1 < msg.h.length; i += 2) if (fair(msg.h[i], msg.h[i + 1])) onMessage({ k: "hit", from: msg.from, g: msg.h[i], d: msg.h[i + 1] });
    };
    const unsubscribe = net.subscribeGhost(receive);
    const START = { t: "ghost", k: "start" }, PAUSE = { t: "ghost", k: "pause" }, READY = { t: "ghost", k: "ready" }, HITS = { t: "ghost", k: "hits", h: [] };
    const start = () => net.sendGhost(START);
    const ready = () => net.sendGhost(READY);
    const pause = () => net.sendGhost(PAUSE);
    /** Every target's damage since the last report as one message: `count` ids and their damage. */
    const hits = (ids, damage, count) => {
      HITS.h.length = 0;
      for (let i = 0; i < count; i++) HITS.h.push(ids[i], Math.max(1, Math.min(60, Math.round(damage[i]))));
      net.sendGhost(HITS);
    };
    const dispose = () => {
      unsubscribe();
      if (npcSync.extra && npcSync.extra.write === write) npcSync.extra = null;
    };
    return { start, ready, pause, hits, receive, dispose, get role() { return npcSync.role; } };
  };

  BL.ghostSync = { create };
})();
