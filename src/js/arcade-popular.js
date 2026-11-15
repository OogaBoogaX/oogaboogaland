// Which four cabinets stand in the cave in front of Ooga Arcade (#554): the most played lately, by the Worker's tally
// of every cabinet opened to play (`/api/arcade-plays`), signed in or not. Scores can't say that: a board keeps only
// the best finishes and a machine only its record. With no reading yet, or no Worker, it is DEFAULT.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const SLOTS = 4, TIMEOUT_MS = 6000, FRESH_MS = 30000;
  const DEFAULT = ["cloud-hopper", "mine", "drop", "orbit"];
  const ids = BL.arcadeCabinets.entries.map((e) => e.id);
  const order = (id) => { const i = DEFAULT.indexOf(id); return i < 0 ? DEFAULT.length + ids.indexOf(id) : i; };
  // The four with the most plays, most played first, ties in the default order.
  const pick = (plays) => [...ids].sort((a, b) => ((plays && plays[b]) || 0) - ((plays && plays[a]) || 0) || order(a) - order(b)).slice(0, SLOTS);
  const available = () => !!BL.net && BL.net.state.backend && BL.net.state.arcadePlays === true;
  const listeners = new Set();
  let shown = pick(null), plays = null, at = 0, loading = null;
  const load = () => {
    if (!available() || loading || (at && Date.now() - at < FRESH_MS)) return;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    loading = fetch("/api/arcade-plays", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        at = Date.now();
        if (!data || typeof data.plays !== "object" || data.plays === null) return;
        plays = data.plays;
        const next = pick(plays);
        if (next.join() === shown.join()) return;
        shown = next;
        for (const fn of listeners) fn(shown);
      })
      .catch(() => {})
      .finally(() => { clearTimeout(timer); loading = null; });
  };
  // One play: a cabinet opened to a run. Nothing about who played goes with it.
  const count = (id) => {
    if (!available() || !ids.includes(id)) return;
    fetch(`/api/arcade-plays/${id}`, { method: "POST", credentials: "same-origin", keepalive: true }).catch(() => {});
  };
  BL.arcadePopular = { SLOTS, DEFAULT, pick, load, count, top: () => shown, get plays() { return plays; }, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
})();
