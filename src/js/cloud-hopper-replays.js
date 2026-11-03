// Shared replay I/O is opt-in and outside the frame loop. Four immutable recordings at most stay in memory.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {}, codec = BL.cloudHopperReplayCodec, cache = new Map();
  const path = (game, tail) => `/api/cloud-hopper-replays/${game}/${tail}`;
  const timed = async (url, options, read) => {
    const controller = new AbortController(), timer = window.setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options, signal: controller.signal });
      return response.ok ? await read(response) : null;
    } catch { return null; } finally { window.clearTimeout(timer); }
  };
  const startTicket = game => codec.level(game) ? timed(path(game, "ticket"), { method: "POST" }, r => r.json()) : null;
  const submit = async (game, ticket, recording, current) => {
    const ready = await ticket;
    if (!ready?.token || !current()) return null;
    const bytes = codec.encode(recording);
    if (!bytes) return null;
    for (let attempt = 0; attempt < 2 && current(); attempt++) {
      const result = await timed(path(game, "finish"), { method: "POST", headers: {
        "content-type": "application/octet-stream", "x-cloud-hopper-ticket": ready.token }, body: bytes }, r => r.json());
      if (result) return current() ? result : null;
    }
    return null;
  };
  const load = async (game, pointer, signal) => {
    if (!pointer || !/^[a-f0-9]{64}$/.test(pointer.hash)) return null;
    const matches = recording => recording && recording.game === game
      && Math.round(recording.duration * 1000) === pointer.score && recording.courseVersion === pointer.courseVersion;
    if (cache.has(pointer.hash)) return !signal.aborted && matches(cache.get(pointer.hash)) ? cache.get(pointer.hash) : null;
    try {
      const response = await fetch(path(game, pointer.hash + ".bin"), { credentials: "same-origin", signal });
      if (!response.ok || response.headers.get("content-type") !== "application/octet-stream"
        || Number(response.headers.get("content-length") || 0) > codec.MAX_BYTES) return null;
      const reader = response.body.getReader(), chunks = []; let size = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > codec.MAX_BYTES) { await reader.cancel(); return null; }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size); let at = 0;
      for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), n => n.toString(16).padStart(2, "0")).join("");
      const recording = digest === pointer.hash ? codec.decode(bytes.buffer) : null;
      if (!matches(recording) || signal.aborted) return null;
      // Names can change after the immutable run was written; the board supplies its current attribution.
      if (cache.size >= 4) cache.delete(cache.keys().next().value);
      cache.set(pointer.hash, recording);
      return recording;
    } catch { return null; }
  };
  const create = ({ onBoard, onState, onPlay, onHide }) => {
    let latest = null, shown = null, game = null, version = 1, frozen = false, enabled = false, epoch = 0, controller = null;
    const pointer = () => shown?.replay?.courseVersion === version ? shown.replay : null;
    const stop = () => { epoch++; controller?.abort(); controller = null; enabled = false; onHide(); };
    const state = name => onState(name || (pointer() ? "off" : "unavailable"));
    const show = board => { stop(); shown = board; onBoard(board); state(); };
    const select = (id, courseVersion, board = null) => {
      game = id; version = courseVersion; frozen = false; latest = board; show(board);
    };
    const update = board => {
      latest = board;
      // Freeze the attempted ghost, not the numeric board feeding the timer and result card.
      if (frozen && shown) { onBoard(board); return; }
      if (board?.replay?.hash !== shown?.replay?.hash) show(board);
      else { shown = board; onBoard(board); }
    };
    const start = () => { frozen = true; show(latest); };
    const end = () => { frozen = false; show(latest); };
    const toggle = async () => {
      if (enabled) { stop(); state(); return; }
      const reference = pointer();
      if (!reference) return;
      enabled = true; state("loading");
      const generation = ++epoch, pending = new AbortController(); controller = pending;
      const timer = window.setTimeout(() => pending.abort(), 30000);
      const recording = await load(game, reference, pending.signal);
      window.clearTimeout(timer);
      if (generation !== epoch) return;
      controller = null;
      if (!recording) { enabled = false; state("error"); return; }
      // This attempt retains its winner even when a newer board arrives mid-run.
      onPlay({ ...recording, username: reference.username }); state("on");
    };
    const clear = () => { stop(); latest = shown = null; frozen = false; state("unavailable"); };
    return { select, update, start, end, toggle, clear, get frozen() { return frozen; }, get enabled() { return enabled; } };
  };
  BL.cloudHopperReplays = { startTicket, submit, create };
})();
