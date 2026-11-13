// Account-scoped opt-in dropout reports. Only the preference persists; no polling, unload uploads or retries.
// The room observer exists only while opted in; routine activity never triggers a request.
(() => {
  "use strict";
  const net = BL.net, box = document.getElementById("players-diagnostics");
  const input = document.getElementById("players-diagnostics-input");
  const status = document.getElementById("players-diagnostics-status");
  const notice = document.getElementById("diagnostics-notice");
  const helpButton = document.getElementById("players-diagnostics-info");
  const help = document.getElementById("players-diagnostics-help");
  if (!box || !input || !status) return;
  const build = document.currentScript?.src.match(/\/main-([a-f0-9]{8,64})\.js(?:\?|$)/)?.[1] || "";
  const kinds = new Set(["connect", "open", "welcome", "clear", "retry", "visibility",
    "socket-error", "socket-close", "heartbeat-timeout", "kick", "peer-return"]);
  const rooms = new Set(["off", "connecting", "live", "paused", "replaced", "full", "revoked", "protocol", "other"]);
  const reasons = new Set(["closed", "error", "stale", "replaced", "full", "revoked", "protocol", "other"]);
  const clamp = (v, max) => Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0;
  const age = v => v === null || v === undefined ? null : clamp(v, 120000);
  let owner = null, unsubscribe = null, pending = null, timer = 0, controller = null, generation = 0;
  let lastAttempt = -Infinity, attempts = 0, disposed = false, accountId = null, noticeTimer = 0;
  const preferenceKey = id => "ooga-dropout-diagnostics:" + id;
  const remembered = id => {
    try { return localStorage.getItem(preferenceKey(id)) === "on"; } catch { return false; }
  };
  const remember = (id, on) => {
    try { localStorage.setItem(preferenceKey(id), on ? "on" : "off"); } catch { /* This visit still works without storage. */ }
  };
  const history = [], departed = new Map();
  const eligible = () => !disposed && net.state.backend && net.state.connectionReports && net.state.me;
  const say = (text, announce = false) => {
    status.textContent = text;
    if (!announce || !notice) return;
    notice.textContent = text;
    notice.hidden = false;
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => { notice.hidden = true; noticeTimer = 0; }, 6000);
  };
  const showHelp = on => {
    if (!help || !helpButton) return;
    help.hidden = !on;
    help.classList.remove("diagnostics-help-above");
    if (on && help.getBoundingClientRect().bottom > window.innerHeight - 12) help.classList.add("diagnostics-help-above");
    helpButton.setAttribute("aria-expanded", String(on));
  };
  if (help && helpButton) {
    helpButton.addEventListener("click", event => {
      if (event.pointerType === "mouse" && helpButton.matches(":hover") && !help.hidden) return;
      showHelp(help.hidden);
    });
    helpButton.addEventListener("pointerenter", event => { if (event.pointerType === "mouse") showHelp(true); });
    box.addEventListener("pointerleave", event => { if (event.pointerType === "mouse") showHelp(false); });
    helpButton.addEventListener("focus", () => { if (helpButton.matches(":focus-visible")) showHelp(true); });
    helpButton.addEventListener("blur", () => showHelp(false));
  }
  // Before the HUD's capture handler, so Escape dismisses the tooltip without folding the panel.
  const helpKey = event => {
    if (event.key !== "Escape" || !help || help.hidden || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
    showHelp(false); event.preventDefault(); event.stopImmediatePropagation();
  };
  window.addEventListener("keydown", helpKey, true);
  const stop = () => {
    generation++;
    unsubscribe?.(); unsubscribe = null;
    owner = null; pending = null; history.length = 0; departed.clear();
    window.clearTimeout(timer); timer = 0;
    controller?.abort(); controller = null;
    input.checked = false;
    window.clearTimeout(noticeTimer); noticeTimer = 0;
    if (notice) notice.hidden = true;
    showHelp(false);
    say("Off");
  };
  const start = account => {
    owner = account.id;
    input.checked = true;
    unsubscribe = net.subscribeConnection(observe);
    say("On — only notable dropouts are sent.");
  };
  const render = () => {
    const account = eligible(), id = account ? account.id : null;
    box.hidden = !account;
    if (id === accountId) return;
    stop();
    accountId = id;
    if (account && remembered(id)) start(account);
  };
  const expire = () => {
    pending = null;
    say("Dropout report expired before the connection recovered.", true);
  };
  const send = async () => {
    timer = 0;
    if (!pending || owner === null) return;
    const account = eligible(), now = performance.now();
    if (!account || account.id !== owner) { stop(); return; }
    if (now - pending.at > 120000) { expire(); return; }
    // A disconnected page keeps one bounded incident until welcome; never competes with reconnects.
    if (net.state.room !== "live") { say("Dropout detected — waiting for connection.", true); return; }
    const report = { v: 1, consent: true, kind: pending.kind, clientBuild: build, gapMs: pending.gapMs,
      events: history.map(e => ({ ...e.data, ageMs: clamp(now - e.at, 120000) })) };
    pending = null; lastAttempt = now; attempts++;
    const current = generation, abort = new AbortController();
    controller = abort;
    say("Sending dropout diagnostics to Cloudflare…", true);
    const timeout = window.setTimeout(() => abort.abort(), 10000);
    try {
      const response = await fetch("/api/connection-reports", { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" }, body: JSON.stringify(report), signal: abort.signal });
      if (current !== generation) return;
      if (response.status === 401) { stop(); say("Dropout report not sent — sign in again.", true); return; }
      say(response.ok ? "Dropout diagnostics sent to Cloudflare." : "Dropout diagnostics could not be sent; no retry.", true);
    } catch {
      if (current === generation) say("Dropout diagnostics could not be sent; no retry.", true);
    } finally {
      window.clearTimeout(timeout);
      if (controller === abort) controller = null;
    }
  };
  const observe = event => {
    if (event.kind === "dispose") { disposed = true; stop(); window.removeEventListener("storage", storageChanged); window.removeEventListener("keydown", helpKey, true); box.hidden = true; return; }
    const account = eligible();
    if (!account || account.id !== owner) { stop(); return; }
    const now = performance.now();
    if (pending && now - pending.at > 120000) expire();
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
      say(net.state.room === "live" ? "Dropout detected — preparing diagnostics." : "Dropout detected — waiting for connection.", true);
      timer = window.setTimeout(send, 2000);
    }
    if (kind === "welcome" && pending && !timer) timer = window.setTimeout(send, 2000);
  };
  input.addEventListener("change", () => {
    const account = eligible(), on = input.checked;
    stop();
    if (!account) return;
    remember(account.id, on);
    if (on) start(account);
  });
  const storageChanged = event => {
    if (accountId === null || (event.key !== null && event.key !== preferenceKey(accountId))) return;
    const account = eligible();
    stop();
    if (account && account.id === accountId && remembered(accountId)) start(account);
  };
  window.addEventListener("storage", storageChanged);
  net.subscribe(render);
  render();
})();
