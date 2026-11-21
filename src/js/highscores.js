// Shared game records. Reads are public; only a run begun and finished in the same signed-in account may submit.
// Nothing is uploaded from localStorage. Watches belong to a scene/visit; requests and the bounded cache belong to
// the page. Fetch on entry, a new run, submission and tab return, never from a game's frame loop.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const rules = BL.highscoreRules, net = BL.net;
  const FRESH_MS = 30000, TIMEOUT_MS = 6000, MAX_WRITES = 4;
  const entries = new Map(Object.keys(rules.games).map(id => [id, { data: null, at: 0, source: null, loading: null, refresh: false, status: "loading", listeners: new Set(), statusListeners: new Set(), submissions: [], submissionListeners: new Set() }]));
  const tickets = new WeakMap(), requests = new Set();
  const arcade = { loading: null, refresh: false, nextAt: 0, source: null };
  let liveOff = null, refreshTimer = 0, connection = null;
  let unsubscribe = null, stopped = false, generation = 0, writes = 0, accountId = null, logoutEpoch = -1, enabled = false, resolved = false;
  const available = () => !stopped && net.state.backend && net.state.highscores === true;
  const isObject = value => !!value && typeof value === "object" && !Array.isArray(value);
  const validLogin = value => /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i.test(value) && !value.includes("--");
  const accept = (id, data) => {
    const game = rules.get(id);
    if (!game) return null;
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
    let runs;
    if (data.runs !== undefined) {
      if ((!/^cloud-hopper-l[1-4]$/.test(id) && !rules.cabinets.includes(id)) || !Array.isArray(data.runs) || data.runs.length > 10) return null;
      runs = [];
      for (const run of data.runs) {
        if (!isObject(run) || typeof run.username !== "string" || !validLogin(run.username)
          || !Number.isSafeInteger(run.score) || run.score <= 0 || run.score > game.max
          || rules.cabinets.includes(id) && run.id === undefined
          || run.id !== undefined && (typeof run.id !== "string" || !/^[a-f0-9]{64}$/.test(run.id) || runs.some(row => row.id === run.id))
          || !Number.isSafeInteger(run.achieved) || run.achieved < 0
          || runs.length && ((game.direction === "asc" ? run.score < runs.at(-1).score : run.score > runs.at(-1).score) || run.score === runs.at(-1).score && run.achieved < runs.at(-1).achieved)) return null;
        runs.push({ username: run.username, score: run.score, achieved: run.achieved, ...(run.id ? { id: run.id } : {}) });
      }
    }
    const r = data.replay;
    const replay = r && /^[a-f0-9]{64}$/.test(r.hash) && r.version === 1 && r.courseVersion === game.version
      && Number.isSafeInteger(r.bytes) && r.bytes > 0 && r.bytes <= 12 * 1024 * 1024
      && highscores[r.username] === r.score && achieved[r.username] === r.achieved
      && keys.every(key => highscores[key] > r.score || highscores[key] === r.score && achieved[key] >= r.achieved)
      ? { hash: r.hash, version: 1, courseVersion: r.courseVersion, bytes: r.bytes, username: r.username, score: r.score, achieved: r.achieved } : null;
    return { game: id, version: game.version, scoreType: game.scoreType, direction: game.direction, unit: game.unit,
      highscores, achieved, revision: data.revision, replay, ...(runs ? { runs } : {}) };
  };
  // Optional status subscribers keep loading/failure copy separate from existing score callbacks.
  const statusOf = entry => !available() ? entry.data ? "stale" : net.state.resolved ? "unavailable" : "loading" : entry.status;
  const notifyStatus = entry => { for (const fn of entry.statusListeners) fn(statusOf(entry)); };
  const notifySubmissions = entry => { for (const fn of entry.submissionListeners) fn(entry.submissions.slice()); };
  const publish = (id, data) => {
    const entry = entries.get(id);
    // A GET started before a submission must not erase that submission's newer reply.
    if (entry.data && data.revision < entry.data.revision) return;
    // A live read can confirm a write before its POST response arrives. Match identities, never equal scores.
    entry.submissions = entry.submissions.filter(run => {
      if (!data.runs?.some(saved => saved.id && saved.id === run.id)) return true;
      run.status = "saved"; return false;
    });
    notifySubmissions(entry);
    entry.at = Date.now();
    entry.status = "ready";
    if (entry.data && data.revision === entry.data.revision && data.replay?.hash === entry.data.replay?.hash) { notifyStatus(entry); return; }
    entry.data = data;
    for (const fn of entry.listeners) fn(data);
    notifyStatus(entry);
  };
  const snapshotData = data => {
    if (!isObject(data) || !Array.isArray(data.boards) || data.boards.length !== rules.arcade.length
      || !Number.isFinite(data.refreshAfterMs) || data.refreshAfterMs < 0 || data.refreshAfterMs > FRESH_MS) return null;
    const boards = data.boards.map(board => accept(board?.game, board));
    if (boards.some(board => !board || !rules.arcade.includes(board.game)) || new Set(boards.map(board => board.game)).size !== rules.arcade.length) return null;
    return { boards, refreshAfterMs: data.refreshAfterMs };
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
      return { data: id === "arcade" || id === "arcade-live" ? snapshotData(await response.json()) : accept(id, await response.json()), retry: false };
    } catch {
      return { data: null, retry: !stopped };
    } finally {
      window.clearTimeout(timer);
      requests.delete(controller);
    }
  };
  const loadOne = (id, force = false) => {
    const entry = entries.get(id);
    if (!entry || !available() || document.hidden) return;
    const source = `${generation}:${connection || ""}`;
    if (entry.loading) { entry.refresh ||= force || entry.source !== source; return; }
    if (!force && entry.source === source && entry.at && Date.now() - entry.at < FRESH_MS) return;
    entry.source = source;
    entry.at = Date.now(); // Failed reads are bounded too; entry/visibility changes can retry after this interval.
    entry.status = entry.data ? "refreshing" : "loading";
    entry.loading = request(id).then(result => {
      if (stopped) return;
      if (result.data) publish(id, result.data);
      else { entry.status = entry.data ? "stale" : "unavailable"; notifyStatus(entry); }
    }).finally(() => {
      entry.loading = null;
      scheduleGuest();
      if (entry.refresh) { entry.refresh = false; if (entry.listeners.size) load(id, true); }
    });
    notifyStatus(entry);
  };
  const combined = id => net.state.highscoreSnapshots === true && rules.arcade.includes(id);
  const watchedArcade = () => rules.arcade.some(id => entries.get(id).listeners.size);
  const scheduleGuest = () => {
    window.clearTimeout(refreshTimer); refreshTimer = 0;
    if (!available() || net.state.me || document.hidden) return;
    let due = Infinity;
    for (const [id, entry] of entries) if (entry.listeners.size) {
      if (combined(id)) { if (!arcade.loading) due = Math.min(due, arcade.nextAt); }
      else if (!entry.loading) due = Math.min(due, entry.at + FRESH_MS);
    }
    if (due !== Infinity) refreshTimer = window.setTimeout(() => {
      refreshTimer = 0;
      for (const [id, entry] of entries) if (entry.listeners.size) load(id);
      scheduleGuest();
    }, Math.max(1000, due - Date.now() + 100));
  };
  const loadArcade = (force = false) => {
    if (!available() || document.hidden) return;
    const source = `${generation}:${connection || ""}`;
    if (arcade.loading) { arcade.refresh ||= force || arcade.source !== source; return; }
    if (!force && arcade.source === source && Date.now() < arcade.nextAt) return;
    arcade.source = source;
    arcade.nextAt = Date.now() + FRESH_MS; // Back off on failure while keeping the last good boards.
    const signed = !!net.state.me;
    for (const id of rules.arcade) {
      const entry = entries.get(id);
      entry.status = entry.data ? "refreshing" : "loading"; notifyStatus(entry);
    }
    arcade.loading = request(signed ? "arcade-live" : "arcade").then(result => {
      if (stopped) return;
      if (!result.data) {
        for (const id of rules.arcade) {
          const entry = entries.get(id);
          entry.status = entry.data ? "stale" : "unavailable"; notifyStatus(entry);
        }
        return;
      }
      for (const board of result.data.boards) publish(board.game, board);
      // Use the remaining edge lifetime, not another whole browser TTL on top of it.
      arcade.nextAt = Date.now() + (signed ? FRESH_MS : result.data.refreshAfterMs);
    }).finally(() => {
      arcade.loading = null;
      if (arcade.refresh) { arcade.refresh = false; if (watchedArcade()) loadArcade(true); }
      scheduleGuest();
    });
  };
  const load = (id, force = false) => combined(id) ? loadArcade(force) : loadOne(id, force);
  const onLive = board => {
    if (!available() || !net.state.me) return;
    const data = accept(board?.game, board);
    if (!data) return;
    if (/^cloud-hopper-l[1-4]$/.test(data.game)) {
      // Room notifications contain scores only. Read the matching replay pointer through the public route.
      if (entries.get(data.game).listeners.size) loadOne(data.game, true);
    } else publish(data.game, data);
  };
  const refreshWatched = force => {
    let arcadeRead = false;
    for (const [id, entry] of entries) if (entry.listeners.size) {
      if (combined(id)) { if (!arcadeRead) loadArcade(force); arcadeRead = true; }
      else loadOne(id, force);
    }
  };
  const onAccount = () => {
    const nextId = net.state.me?.id || null, nextEnabled = available(), nextEpoch = net.state.logoutEpoch;
    const nextConnection = net.state.room === "live" ? net.state.connectionToken || "live" : null;
    const accountChanged = nextId !== accountId || nextEpoch !== logoutEpoch || nextEnabled !== enabled || resolved !== net.state.resolved;
    const joined = nextConnection && nextConnection !== connection;
    if (nextId !== accountId || nextEpoch !== logoutEpoch) {
      generation++;
      for (const entry of entries.values()) { entry.submissions.length = 0; notifySubmissions(entry); }
    }
    accountId = nextId; logoutEpoch = nextEpoch; enabled = nextEnabled; connection = nextConnection; resolved = net.state.resolved;
    if (accountChanged || joined) for (const entry of entries.values()) if (entry.listeners.size) notifyStatus(entry);
    // Join first, then read: changes committed during the snapshot also arrive over the socket.
    // Revisions settle either arrival order, and reconnect recovers messages lost with the old socket.
    if (accountChanged || joined) refreshWatched(true);
    scheduleGuest();
  };
  const onVisibility = () => {
    if (!document.hidden) refreshWatched(!!net.state.me);
    scheduleGuest();
  };
  const start = () => {
    if (unsubscribe || stopped) return;
    unsubscribe = net.subscribe(onAccount);
    liveOff = net.subscribeHighscores?.(onLive);
    document.addEventListener("visibilitychange", onVisibility);
    onAccount();
  };
  const watch = (id, fn, onStatus, onSubmissions) => {
    const entry = entries.get(id);
    if (!entry || stopped) return () => {};
    start();
    entry.listeners.add(fn);
    if (onStatus) entry.statusListeners.add(onStatus);
    if (onSubmissions) entry.submissionListeners.add(onSubmissions);
    fn(entry.data);
    onStatus?.(statusOf(entry));
    onSubmissions?.(entry.submissions.slice());
    load(id);
    scheduleGuest();
    return () => { entry.listeners.delete(fn); if (onStatus) entry.statusListeners.delete(onStatus); if (onSubmissions) entry.submissionListeners.delete(onSubmissions); scheduleGuest(); };
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
    tickets.set(token, { game: id, playerId: net.state.me.id, generation, sent: new Set(),
      runId: /^cloud-hopper-l[1-4]$/.test(id) || rules.cabinets.includes(id) ? crypto.randomUUID() : null,
      replay: BL.cloudHopperReplays?.startTicket(id) });
    return token;
  };
  const current = ticket => available() && net.state.resolved && ticket.generation === generation && ticket.playerId === net.state.me?.id;
  const submit = async (token, machine, score, recording = null) => {
    const ticket = token && tickets.get(token);
    onAccount();
    if (!ticket || !current(ticket) || !rules.valid(ticket.game, machine, score) || ticket.sent.has(machine)) return false;
    ticket.sent.add(machine);
    const entry = entries.get(ticket.game), pending = ticket.runId
      ? { id: null, username: net.state.me.login, score, status: "saving" } : null;
    if (pending) {
      // Keep all in-flight uploads (at most four) and only the latest failures.
      if (entry.submissions.length >= 10) entry.submissions.splice(entry.submissions.findIndex(run => run.status !== "saving"), 1);
      entry.submissions.push(pending); notifySubmissions(entry);
    }
    const failed = () => {
      if (pending && current(ticket) && entry.submissions.includes(pending)) { pending.status = "failed"; notifySubmissions(entry); }
    };
    if (writes >= MAX_WRITES) { failed(); BL.hud.toast("Shared score could not be saved. Your local score is kept."); return false; }
    writes++;
    const body = { machine, score, version: rules.get(ticket.game).version, playerId: ticket.playerId };
    let saved = false;
    const confirm = data => {
      if (!current(ticket)) return false;
      if (pending) entry.submissions = entry.submissions.filter(run => run !== pending);
      saved = true; publish(ticket.game, data); notifySubmissions(entry); return true;
    };
    try {
      // The replay ticket is also this run's identity on the numeric fallback. A lost
      // upload response must never append the same finish twice.
      if (ticket.runId) body.runId = (await ticket.replay)?.token || ticket.runId;
      if (!current(ticket)) return false;
      if (pending) {
        const bytes = new TextEncoder().encode(JSON.stringify([ticket.game, ticket.playerId, body.runId]));
        pending.id = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), n => n.toString(16).padStart(2, "0")).join("");
        if (!current(ticket)) return false;
      }
      const known = get(ticket.game), fastest = known && Math.min(...Object.values(known.highscores));
      if (recording && ticket.replay && BL.cloudHopperReplays && (!known || score <= fastest)) {
        const replay = { ...recording, version: 1, game: ticket.game, playerId: ticket.playerId };
        const uploaded = await BL.cloudHopperReplays.submit(ticket.game, ticket.replay, replay, () => current(ticket));
        const data = uploaded && accept(ticket.game, uploaded);
        if (data && current(ticket)) return confirm(data);
        // Storage/format/capacity failure must not discard the accepted numeric score.
      }
      // A lost response retries the same run identity; machine records still only improve.
      for (let attempt = 0; attempt < 2 && current(ticket); attempt++) {
        const result = await request(ticket.game, body);
        if (stopped) return false;
        if (result.data) return confirm(result.data);
        if (!result.retry) break;
      }
      if (pending?.status === "saved" && current(ticket)) return true;
      if (current(ticket)) BL.hud.toast("Shared score could not be saved. Your local score is kept.");
      return false;
    } catch {
      if (pending?.status === "saved" && current(ticket)) return true;
      if (current(ticket)) BL.hud.toast("Shared score could not be saved. Your local score is kept.");
      return false;
    } finally { writes--; if (!saved) failed(); }
  };
  const dispose = () => {
    stopped = true;
    generation++;
    unsubscribe?.();
    unsubscribe = null;
    liveOff?.(); liveOff = null;
    window.clearTimeout(refreshTimer); refreshTimer = 0;
    document.removeEventListener("visibilitychange", onVisibility);
    for (const controller of requests) controller.abort();
    for (const entry of entries.values()) { entry.listeners.clear(); entry.statusListeners.clear(); entry.submissionListeners.clear(); entry.submissions.length = 0; entry.data = null; }
  };
  BL.highscores = { watch, get, best, begin, submit, dispose };
})();
