// Active duel pairs for local listening, shared by the island and Ooga Chat. Only ids are needed: never positions,
// health or outcomes. The listener's own pair is exempt; manual mute and volume are left to the voice controller.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const MAX = 128, id = (n) => Number.isSafeInteger(n) && n > 0;
  const pair = (d) => d && id(d.id) && id(d.a) && id(d.b) && d.a !== d.b;
  const create = () => {
    const duels = new Map(), partners = new Map();
    const clear = () => {
      const changed = duels.size > 0;
      duels.clear(); partners.clear();
      return changed;
    };
    const add = (d) => {
      duels.set(d.id, [d.a, d.b]);
      partners.set(d.a, d.b); partners.set(d.b, d.a);
    };
    const apply = (msg) => {
      if (!msg || typeof msg !== "object") return false;
      if (msg.op === "lost") return clear();
      if (msg.op === "list") {
        if (!Array.isArray(msg.duels) || msg.duels.length > MAX) return false;
        const ids = new Set(), players = new Set();
        for (const d of msg.duels) {
          if (!pair(d) || ids.has(d.id) || players.has(d.a) || players.has(d.b)) return false;
          ids.add(d.id); players.add(d.a); players.add(d.b);
        }
        clear();
        for (const d of msg.duels) add(d);
        return true;
      }
      if (msg.op === "start") {
        if (!pair(msg) || duels.size >= MAX || duels.has(msg.id) || partners.has(msg.a) || partners.has(msg.b)) return false;
        add(msg);
        return true;
      }
      if (msg.op === "end") {
        const d = duels.get(msg.id);
        if (!d) return false;
        duels.delete(msg.id); partners.delete(d[0]); partners.delete(d[1]);
        return true;
      }
      return false;
    };
    return { apply, clear, muted: (player, self) => player !== self && partners.has(player) && partners.get(player) !== self };
  };
  BL.duelListening = { create };
})();
