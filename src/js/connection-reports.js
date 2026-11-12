// Opt-in, per-visit dropout reports. No polling, persistence, unload uploads or upload retries.
// The room observer exists only while opted in; routine activity never triggers a request.
(() => {
  "use strict";
  const net = BL.net, box = document.getElementById("players-diagnostics");
  const input = document.getElementById("players-diagnostics-input");
  const status = document.getElementById("players-diagnostics-status");
  if (!box || !input || !status) return;
  const build = document.currentScript?.src.match(/\/main-([a-f0-9]{8,64})\.js(?:\?|$)/)?.[1] || "";
  const kinds = new Set(["connect", "open", "welcome", "clear", "retry", "visibility",
    "socket-error", "socket-close", "heartbeat-timeout", "kick", "peer-return"]);
  const rooms = new Set(["off", "connecting", "live", "paused", "replaced", "full", "revoked", "protocol", "other"]);
  const reasons = new Set(["closed", "error", "stale", "replaced", "full", "revoked", "protocol", "other"]);
  const clamp = (v, max) => Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0;
  const age = v => v === null || v === undefined ? null : clamp(v, 120000);
  let owner = null, unsubscribe = null, pending = null, timer = 0, controller = null, generation = 0;
  let lastAttempt = -Infinity, attempts = 0, disposed = false;
  const history = [], departed = new Map();
  const eligible = () => !disposed && net.state.backend && net.state.connectionReports && net.state.me;
  const say = text => { status.textContent = text; };
  const stop = () => {
    generation++;
    unsubscribe?.(); unsubscribe = null;
    owner = null; pending = null; history.length = 0; departed.clear();
    window.clearTimeout(timer); timer = 0;
    controller?.abort(); controller = null;
    input.checked = false;
    say("Off");
  };
  const render = () => {
    const account = eligible();
    box.hidden = !account;
    if (owner !== null && (!account || account.id !== owner)) stop();
  };
  const send = async () => {
    timer = 0;
    if (!pending || owner === null) return;
    const account = eligible(), now = performance.now();
    if (!account || account.id !== owner) { stop(); return; }
    if (now - pending.at > 120000) { pending = null; return; }
    // A disconnected page keeps one bounded incident until welcome; never competes with reconnects.
    if (net.state.room !== "live") return;
    const report = { v: 1, consent: true, kind: pending.kind, clientBuild: build, gapMs: pending.gapMs,
      events: history.map(e => ({ ...e.data, ageMs: clamp(now - e.at, 120000) })) };
    pending = null; lastAttempt = now; attempts++;
    const current = generation, abort = new AbortController();
    controller = abort;
    const timeout = window.setTimeout(() => abort.abort(), 10000);
    try {
      const response = await fetch("/api/connection-reports", { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" }, body: JSON.stringify(report), signal: abort.signal });
      if (current !== generation) return;
      if (response.status === 401) { stop(); return; }
      say(response.ok ? "On — dropout report sent." : "On — report unavailable; no retry.");
    } catch {
      if (current === generation) say("On — report unavailable; no retry.");
    } finally {
      window.clearTimeout(timeout);
      if (controller === abort) controller = null;
    }
  };
  const observe = event => {
    if (event.kind === "dispose") { disposed = true; stop(); box.hidden = true; return; }
    const account = eligible();
    if (!account || account.id !== owner) { stop(); return; }
    const now = performance.now();
    if (pending && now - pending.at > 120000) pending = null;
    for (const [id, left] of departed) if (now - left.at > 10000) departed.delete(id);
    let trigger = "", gapMs = 0, kind = event.kind, reason = event.reason;
    if (kind === "clear" || kind === "welcome") departed.clear();
    if (kind === "peer-leave" && event.room === "live" && ["closed", "error", "stale"].includes(reason)) {
      if (departed.size >= 64) departed.delete(departed.keys().next().value);
      departed.set(event.id, { at: now, reason });
    }
    if (kind === "peer-join" && departed.has(event.id)) {
      const left = departed.get(event.id);
      departed.delete(event.id);
      gapMs = clamp(now - left.at, 10000); reason = left.reason;
      kind = trigger = "peer-return";
    }
    if (event.room === "live") {
      if (kind === "socket-close") trigger = "room-close";
      if (kind === "heartbeat-timeout") trigger = "heartbeat-timeout";
      if (kind === "kick" && ["stale", "protocol"].includes(reason)) trigger = "room-kick";
    }
    if (kinds.has(kind)) {
      const data = { kind, room: rooms.has(event.room) ? event.room : "other",
        hidden: event.hidden === true, remotes: clamp(event.remotes, 1000),
        unanswered: clamp(event.unanswered, 100), voiceEnabled: event.voiceEnabled === true,
        voiceMuted: event.voiceMuted === true, lastMessageAge: age(event.lastMessageAge),
        lastPongAge: age(event.lastPongAge) };
      if (kind === "socket-close") { data.code = clamp(event.code, 4999); data.clean = event.clean === true; }
      if (kind === "kick" || kind === "peer-return") data.reason = reasons.has(reason) ? reason : "other";
      if (history.length === 16) history.shift();
      history.push({ at: now, data });
    }
    if (trigger && !pending && !controller && now - lastAttempt >= 60000 && attempts < 10) {
      pending = { at: now, kind: trigger, gapMs };
      say("On — dropout detected; waiting for connection.");
      timer = window.setTimeout(send, 2000);
    }
    if (kind === "welcome" && pending && !timer) timer = window.setTimeout(send, 2000);
  };
  input.addEventListener("change", () => {
    if (!input.checked) { stop(); return; }
    const account = eligible();
    if (!account) { stop(); return; }
    owner = account.id;
    unsubscribe = net.subscribeConnection(observe);
    say("On — only notable dropouts are sent.");
  });
  net.subscribe(render);
  render();
})();
