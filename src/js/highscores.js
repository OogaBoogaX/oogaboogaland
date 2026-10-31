// Shared game records. Reads are public; only a run begun and finished in the same signed-in account may submit.
// Nothing is uploaded from localStorage. Watches belong to a scene/visit; requests and the bounded cache belong to
// the page. Fetch on entry, a new run, submission and tab return, never from a game's frame loop.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const rules = BL.highscoreRules, net = BL.net;
  const FRESH_MS = 30000, TIMEOUT_MS = 6000, MAX_WRITES = 4;
  const entries = new Map(Object.keys(rules.games).map(id => [id, { data: null, at: 0, loading: null, refresh: false, listeners: new Set() }]));
  const tickets = new WeakMap(), requests = new Set();
  let unsubscribe = null, stopped = false, generation = 0, writes = 0, accountId = null, logoutEpoch = -1, enabled = false;
  const available = () => !stopped && net.state.backend && net.state.highscores === true;
  const isObject = value => !!value && typeof value === "object" && !Array.isArray(value);
  const validLogin = value => /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i.test(value) && !value.includes("--");
  const accept = (id, data) => {
    const game = rules.get(id);
    if (!isObject(data) || data.game !== id || data.version !== game.version || data.scoreType !== game.scoreType
      || data.direction !== game.direction || data.unit !== game.unit || !Number.isSafeInteger(data.revision) || data.revision < 0
      || !isObject(data.highscores) || !isObject(data.achieved)) return null;
    const keys = Object.keys(data.highscores), highscores = Object.create(null), achieved = Object.create(null);
    if (keys.length > (game.scoreType === "ooga" ? rules.MAX_PLAYERS : game.machines.length)) return null;
    for (const key of keys) {
      const score = data.highscores[key], at = data.achieved[key];
      if (!(game.scoreType === "ooga" ? validLogin(key) : game.machines.includes(key))
        || !Number.isSafeInteger(score) || score <= 0 || score > game.max || !Number.isSafeInteger(at) || at < 0) return null;
      highscores[key] = score;
      achieved[key] = at;
    }
    return { game: id, version: game.version, scoreType: game.scoreType, direction: game.direction, unit: game.unit,
      highscores, achieved, revision: data.revision };
  };
  const publish = (id, data) => {
    const entry = entries.get(id);
    // A GET started before a submission must not erase that submission's newer reply.
    if (entry.data && data.revision < entry.data.revision) return;
    entry.at = Date.now();
    if (entry.data && data.revision === entry.data.revision) return;
    entry.data = data;
    for (const fn of entry.listeners) fn(data);
  };
  const request = async (id, body = null) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    requests.add(controller);
    try {
      const response = await fetch(`/api/highscores/${id}`, { method: body ? "POST" : "GET", credentials: "same-origin",
        headers: body ? { accept: "application/json", "content-type": "application/json" } : { accept: "application/json" },
        cache: "no-store", signal: controller.signal, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!response.ok) return { data: null, retry: response.status >= 500 };
      if (!(response.headers.get("content-type") || "").startsWith("application/json")) return { data: null, retry: false };
      return { data: accept(id, await response.json()), retry: false };
    } catch {
      return { data: null, retry: !stopped };
    } finally {
      window.clearTimeout(timer);
      requests.delete(controller);
    }
  };
  const load = (id, force = false) => {
    const entry = entries.get(id);
    if (!entry || !available() || document.hidden) return;
    if (entry.loading) { entry.refresh ||= force; return; }
    if (!force && entry.at && Date.now() - entry.at < FRESH_MS) return;
    entry.at = Date.now(); // Failed reads are bounded too; entry/visibility changes can retry after this interval.
    entry.loading = request(id).then(result => {
      if (!stopped && result.data) publish(id, result.data);
    }).finally(() => {
      entry.loading = null;
      if (entry.refresh) { entry.refresh = false; if (entry.listeners.size) load(id, true); }
    });
  };
  const onAccount = () => {
    const nextId = net.state.me?.id || null, nextEnabled = available(), nextEpoch = net.state.logoutEpoch;
    if (nextId === accountId && nextEpoch === logoutEpoch && nextEnabled === enabled) return;
    if (nextId !== accountId || nextEpoch !== logoutEpoch) generation++;
    accountId = nextId; logoutEpoch = nextEpoch; enabled = nextEnabled;
    for (const [id, entry] of entries) if (entry.listeners.size) load(id, true);
  };
  const onVisibility = () => {
    if (!document.hidden) for (const [id, entry] of entries) if (entry.listeners.size) load(id);
  };
  const start = () => {
    if (unsubscribe || stopped) return;
    unsubscribe = net.subscribe(onAccount);
    document.addEventListener("visibilitychange", onVisibility);
    onAccount();
  };
  const watch = (id, fn) => {
    const entry = entries.get(id);
    if (!entry || stopped) return () => {};
    start();
    entry.listeners.add(fn);
    fn(entry.data);
    load(id);
    return () => entry.listeners.delete(fn);
  };
  const get = id => entries.get(id)?.data || null;
  // Zero means the shared board is loaded but this machine has no record. Null means use a labelled local best.
  const best = (id, machine) => {
    const data = get(id);
    return data ? data.highscores[machine] || 0 : null;
  };
  const begin = id => {
    start();
    onAccount();
    if (!rules.get(id)) return null;
    load(id);
    if (!available() || !net.state.resolved || !net.state.me) return null;
    const token = {};
    tickets.set(token, { game: id, playerId: net.state.me.id, generation, sent: new Set() });
    return token;
  };
  const current = ticket => available() && net.state.resolved && ticket.generation === generation && ticket.playerId === net.state.me?.id;
  const submit = async (token, machine, score) => {
    const ticket = token && tickets.get(token);
    onAccount();
    if (!ticket || !current(ticket) || !rules.valid(ticket.game, machine, score) || ticket.sent.has(machine)) return false;
    if (writes >= MAX_WRITES) { BL.hud.toast("Shared score could not be saved. Your local score is kept."); return false; }
    ticket.sent.add(machine);
    writes++;
    const body = { machine, score, version: rules.get(ticket.game).version, playerId: ticket.playerId };
    try {
      // A lost response can safely retry: the Worker only improves records, and preserves equal scores' timestamps.
      for (let attempt = 0; attempt < 2 && current(ticket); attempt++) {
        const result = await request(ticket.game, body);
        if (stopped) return false;
        if (result.data) { publish(ticket.game, result.data); return true; }
        if (!result.retry) break;
      }
      if (current(ticket)) BL.hud.toast("Shared score could not be saved. Your local score is kept.");
      return false;
    } finally { writes--; }
  };
  const dispose = () => {
    stopped = true;
    generation++;
    unsubscribe?.();
    unsubscribe = null;
    document.removeEventListener("visibilitychange", onVisibility);
    for (const controller of requests) controller.abort();
    for (const entry of entries.values()) { entry.listeners.clear(); entry.data = null; }
  };
  BL.highscores = { watch, get, best, begin, submit, dispose };
})();
