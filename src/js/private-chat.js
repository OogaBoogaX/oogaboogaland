// Private conversations (#188) in Ooga Chat's panel: one person at a time, asked from Online Oogas, sealed with a
// one-time pad the two swapped outside Ooga (one-time-pad.js) and passed on by the room, which cannot read it
// (docs/auth-and-presence.md). A switch at the panel's head turns between the island's chat and the private one, which
// has its own tint and lock; it shows only while there is an invite or a conversation.
// The steps: an invite, its accept, then each side loads the pad file (or makes one here, downloads it and sends a
// copy outside Ooga). A file this browser has no record of starts only once the visitor says it was never used. Each
// side says hello and acks the other's; the line opens on an ack to its own hello. A frame that arrives before this
// side's pad has started waits (QUEUE at most). A hello the room refused, or one the other side never answered once
// its own hello came, is said again after HELLO_WAIT, as often as the session allows. A line that hasn't arrived is
// noted once a later one shows, and the note goes when the line comes, marked late. Frames longer than any the pad
// seals are dropped unread (DATA_MAX). Nothing private is kept: the pad lives in memory until the
// conversation ends, when the session closes and then its bytes are zeroed, and the lines go with it. Only the pad's
// record of use stays in localStorage. The conversation ends when either side ends it, leaves the island or loses the
// room; starting again with the same pad carries on where it stopped.
// What it protects and what it does not: the room and the network see who talks to whom, when and how long each line
// is, never what it says, provided this page and the pad file are trustworthy. A compromised device, a page served
// with other code, or the other person copying the conversation are outside it. A record behind the other side's is
// caught and stops the pad; a pad used again where no record of its use survives, by a visitor who says it is new, is not.
// Nor is a record rolled back mid-conversation (a restored profile) whose forgotten lines the room also dropped.
// The pad file reads every line ever sealed with it, with the frames the room relayed, so the panel says to keep it safe
// and delete it once the conversation is over. "Sent" is the room's word that it passed a line on, not the other side's.
// The page's own notes carry no name, so no display name can pass for one; the other side's lines show their login.
// Exports available, invite and stats.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const net = BL.net, P = BL.oneTimePad, policy = BL.chatPolicy;
  const subtle = window.crypto && window.crypto.subtle;
  const KEEP = 100, QUEUE = 16, INVITES = 8, HELLO_WAIT = 8000;
  // The longest frame the pad seals, as base64: the room's own limit.
  const DATA_MAX = Math.ceil((P.PAD.HEAD + P.PAD.TEXT_BYTES + P.PAD.TAG) / 3) * 4;
  // What a typical line takes from the stream, to say roughly how many are left (each also takes one key slot).
  const LINE_BYTES = 50;
  const TIME = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const $ = (id) => document.getElementById(id);
  const panel = $("chat-panel"), switcher = $("pm-switch"), switchName = $("pm-switch-name"), count = $("pm-count");
  const title = $("pm-title"), note = $("pm-note"), answer = $("pm-answer"), padRow = $("pm-pad"), file = $("pm-file"), confirm = $("pm-confirm");
  const size = $("pm-size"), make = $("pm-make"), printLine = $("pm-print-line"), printPeer = $("pm-print-peer"), print = $("pm-print");
  const log = $("pm-log"), budget = $("pm-budget"), form = $("pm-form"), input = $("pm-input"), left = $("pm-left"), sendButton = $("pm-send"), end = $("pm-end");
  const views = [...switcher.querySelectorAll("[data-pm-view]")];
  const store = { get: (key) => window.localStorage.getItem(key), set: (key, value) => window.localStorage.setItem(key, value) };
  const lock = (name, fn) => navigator.locks ? navigator.locks.request(name, { mode: "exclusive" }, fn)
    : Promise.reject(Object.assign(new Error("locks"), { code: "locks" }));
  const c = { phase: "idle", peer: 0, login: "", name: "", invites: [], bytes: null, pad: null, session: null, started: false, unrecorded: false,
    print: "", queue: [], lines: [], unseen: 0, view: "island", notice: "", stopped: "", busy: false, generation: 0, loads: 0, sid: 0,
    lastSend: { n: 0, ok: true }, revision: 0, helloTimer: 0 };
  // The log is drawn again only when its lines change, never on an account or roster update.
  let drawn = -1;

  const who = (id) => {
    const rec = net.remotes.get(id);
    return { login: rec ? rec.login : "", name: rec ? rec.display || rec.login : "someone" };
  };
  const me = () => net.state.me ? net.state.me.login : "";
  const available = () => !!(net.state.privateChat && net.state.me && subtle && P);
  const viewing = () => c.view === "private" && BL.sheet.visible(panel);
  const b64 = (bytes) => window.btoa(String.fromCharCode.apply(null, bytes));
  const unb64 = (text) => {
    try { const raw = window.atob(text), out = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out; } catch { return null; }
  };
  const kb = (bytes) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.floor(bytes / 1024)} KB`;

  const padWords = (code, pad) => {
    const peer = c.name;
    if (code === "magic") return "That isn't an Ooga pad file.";
    if (code === "short") return "That pad file is cut short.";
    if (code === "size") return "That pad file is too big: 64 MB at most.";
    if (code === "login" || code === "same") return "That pad file's names can't be read.";
    if (code === "not-you") return `That pad is for ${pad.logins.join(" and ")}, not you.`;
    if (code === "not-peer") return `That pad is for you and ${pad.logins.find((l) => l !== me().toLowerCase())}, not ${peer}.`;
    if (code === "storage") return "This browser can't save how much of the pad is used, so the pad can't be used here.";
    if (code === "locks") return "This browser can't keep the pad's record safe between tabs, so the pad can't be used here.";
    if (code === "record") return "This device's record of the pad can't be read. Make a new pad together.";
    if (code === "exhausted") return "The pad is used up. Make a new one together.";
    if (code === "behind-here") return `This device's record of the pad is behind ${peer}'s: the pad was used before, on another device, in a browser that lost its storage, or from a restored copy. It won't be used here again. Make a new pad together.`;
    if (code === "mismatch") return `You and ${peer} hold different pad files, or one copy was cut short. Compare the fingerprints, then both load the same file.`;
    return "Something went wrong with the pad. Make a new one to be safe.";
  };
  const REFUSED = { offline: "isn't on the island now.", unavailable: "can't take private conversations from you.", busy: "is in another private conversation.",
    rate: "can't be asked again yet. Wait a moment.", withdrawn: "took the invite back.", closed: "isn't in this conversation any more." };

  const nudge = (text) => {
    if (viewing()) return;
    c.unseen++;
    BL.hud.toast(text);
  };
  // The session closes before the pad is zeroed, so nothing still in flight seals or reads on zeros.
  const wipe = () => {
    if (c.helloTimer) { window.clearTimeout(c.helloTimer); c.helloTimer = 0; }
    if (c.session) c.session.close();
    if (c.bytes) c.bytes.fill(0);
    c.bytes = c.pad = c.session = null;
    c.started = c.unrecorded = false;
    c.print = "";
  };
  const reset = (notice) => {
    c.generation++;
    wipe();
    c.queue.length = 0;
    c.phase = "idle"; c.peer = 0; c.login = ""; c.name = ""; c.lines.length = 0; c.stopped = ""; c.busy = false; c.revision++;
    c.notice = notice || "";
    input.value = "";
  };
  const begin = (phase, peer) => {
    if (c.peer !== peer || c.phase === "idle") { reset(); c.peer = peer; }
    const p = who(peer);
    c.phase = phase; c.login = p.login; c.name = p.name; c.notice = "";
  };
  const stop = (code, live) => {
    // Found behind the other side's record just now, the pad ends the conversation for both, so neither waits on a pad
    // that will never open; a stop read back from the record at load leaves room to load another file.
    if (live && code === "behind-here" && c.phase === "open") {
      const words = padWords(code, c.pad);
      net.sendPrivate("end", c.peer);
      reset(words);
      return render();
    }
    c.stopped = padWords(code, c.pad);
    wipe();
    c.queue.length = 0;
    render();
  };
  const add = (line) => {
    c.lines.push(line);
    if (c.lines.length > KEEP) c.lines.shift();
    c.revision++;
  };
  const mark = (n, state) => {
    // Each pad's session numbers its frames from 1, so a number means something only with the session that sent it.
    const line = c.lines.find((l) => l.n === n && l.sid === c.sid);
    if (line) { line.state = state; c.revision++; render(); }
  };

  // Says hello again after HELLO_WAIT while the line is not open, until the session says no more.
  const helloLater = () => {
    const session = c.session;
    if (c.helloTimer || !session || session.ready) return;
    c.helloTimer = window.setTimeout(() => {
      c.helloTimer = 0;
      if (session !== c.session || session.ready || c.stopped) return;
      session.hello().then((r) => { if (r.kind === "sent") helloLater(); });
    }, HELLO_WAIT);
  };
  const take = (frame) => {
    const gen = c.generation, sid = c.sid;
    c.session.heard(frame).then((r) => {
      if (gen !== c.generation) return;
      if (r.kind === "text") {
        // A gap this line is the first past is noted before it; a gap a late line filled loses its note.
        for (const gap of r.filled) {
          const i = c.lines.findIndex((l) => l.gap === gap && l.sid === sid);
          if (i >= 0) { c.lines.splice(i, 1); c.revision++; }
        }
        for (const gap of r.gaps) add({ note: `A line from ${c.name} hasn't arrived.`, gap, sid, at: Date.now() });
        add(policy.error(r.text) ? { note: "A message arrived that can't be shown here.", at: Date.now() } : { own: false, text: policy.text(r.text), late: r.late, at: Date.now() });
        nudge(`${c.name} wrote to you privately.`);
      } else if (r.kind === "hello") {
        helloLater();
        return;
      } else if (r.kind === "dropped") {
        add({ note: r.error === "pad" ? `${c.name} is using a different pad file.` : "A message failed its check and was dropped. Nothing of it is shown.", at: Date.now() });
      } else if (r.kind === "stopped") return stop(r.error, true);
      else if (r.kind !== "ready") return;
      render();
    });
  };

  // Starts the loaded pad's session, the first time with `fresh` only when the visitor said the file is new.
  const startPad = async (fresh) => {
    const gen = c.generation, session = c.session;
    const r = await session.start({ fresh });
    if (gen !== c.generation || session !== c.session) return;
    if (r.kind === "stopped") return stop(r.error);
    if (r.kind === "unrecorded") { c.unrecorded = true; return render(); }
    c.started = true; c.unrecorded = false;
    for (const frame of c.queue.splice(0)) take(frame);
    render();
  };
  const loadPad = async (bytes, fresh) => {
    const gen = c.generation, load = ++c.loads;
    let pad = null, role;
    try {
      pad = P.parse(bytes);
      role = P.roleOf(pad, me(), c.login);
    } catch (e) {
      bytes.fill(0);
      c.stopped = padWords(e.code, pad);
      return render();
    }
    const sum = await P.digest(subtle, pad);
    if (gen !== c.generation || load !== c.loads || c.phase !== "open") { bytes.fill(0); return; }
    wipe();
    c.stopped = "";
    c.bytes = bytes; c.pad = pad; c.print = P.fingerprint(sum);
    // A new session: lines from the pad before can no longer be answered or retried, and any still waiting never went.
    c.sid++;
    for (const l of c.lines) if (l.own && l.state === "sending") { l.state = "failed"; c.revision++; }
    // Ask the browser to keep this site's storage, where the pad's record lives; it may say no.
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    const peer = c.peer;
    c.session = P.session({ subtle, pad, role, sum, ledger: P.ledger(store, lock, pad, role), random: (view) => window.crypto.getRandomValues(view),
      send: (frame, n) => { c.lastSend = { n, ok: net.sendPrivate("data", peer, b64(frame), n) }; } });
    render();
    return startPad(fresh);
  };

  const heard = (msg) => {
    if (msg.op === "lost") {
      if (c.phase !== "idle") reset("The connection to the island dropped, which ended the private conversation. Start it again: your pad carries on where it stopped.");
      c.invites.length = 0;
      return render();
    }
    if (!available()) return;
    const from = Number.isSafeInteger(msg.from) ? msg.from : 0;
    if (msg.op === "invite" && from) {
      if (!c.invites.includes(from)) c.invites.push(from);
      if (c.invites.length > INVITES) c.invites.shift();
      nudge(`${who(from).name} asks for a private conversation. Open Ooga Chat to answer.`);
    } else if (msg.op === "inviting" && (c.phase === "idle" || c.phase === "inviting")) {
      begin("inviting", msg.to);
    } else if (msg.op === "open" && Number.isSafeInteger(msg.with)) {
      begin("open", msg.with);
      c.invites = c.invites.filter((id) => id !== msg.with);
      nudge(`Your private conversation with ${c.name} is open.`);
    } else if (msg.op === "declined" && c.phase === "inviting" && from === c.peer) {
      reset(`${c.name} said no.`);
    } else if (msg.op === "withdrawn") {
      c.invites = c.invites.filter((id) => id !== from);
    } else if (msg.op === "closed" && c.phase === "open" && from === c.peer) {
      const name = c.name;
      reset(msg.reason === "left" ? `${name} left the island, which ended the private conversation.` : `${name} ended the private conversation.`);
      nudge(c.notice);
    } else if (msg.op === "data" && c.phase === "open" && from === c.peer && typeof msg.d === "string" && msg.d.length <= DATA_MAX) {
      const frame = unb64(msg.d);
      if (!frame) return;
      if (c.session && c.started) take(frame);
      else if (c.queue.length < QUEUE) c.queue.push(frame);
      return;
    } else if (msg.op === "ok" && c.session && Number.isSafeInteger(msg.n)) {
      c.session.delivered(msg.n);
      mark(msg.n, "sent");
      return;
    } else if (msg.op === "refused") {
      if (Number.isSafeInteger(msg.n)) {
        if (c.session && msg.n === c.session.helloN) return helloLater();
        return mark(msg.n, "failed");
      }
      const name = who(msg.to).name;
      if ((c.phase === "inviting" || c.phase === "accepting") && msg.to === c.peer) reset(`${name} ${REFUSED[msg.reason] || "can't be asked now."}`);
      else {
        c.invites = c.invites.filter((id) => id !== msg.to);
        c.notice = `${name} ${REFUSED[msg.reason] || "can't be asked now."}`;
      }
    } else return;
    render();
  };

  const setView = (view) => {
    c.view = view;
    // A notice left from an ended conversation is read once the visitor turns back to the island.
    if (view === "island" && c.phase === "idle") c.notice = "";
    if (view === "private") panel.dataset.view = "private";
    else delete panel.dataset.view;
    if (view === "private") c.unseen = 0;
    render();
  };
  const showPrivate = () => {
    setView("private");
    if (!BL.sheet.visible(panel)) { const tab = BL.sheet.tabFor(panel); if (tab) tab.click(); }
  };

  // A note from the page has no name, so no display name can pass for one; the other side's lines carry their login.
  const row = (line) => {
    const li = document.createElement("li"), time = document.createElement("span"), text = document.createElement("p");
    li.className = "chat-row"; time.className = "chat-time"; text.className = "chat-text";
    time.textContent = line.late ? `${TIME.format(line.at)} · late` : TIME.format(line.at);
    if (line.note) {
      li.dataset.note = "true";
      const tag = document.createElement("span");
      tag.className = "pm-note-tag"; tag.textContent = "Note";
      text.textContent = line.note;
      li.append(tag, document.createElement("span"), time, text);
      return li;
    }
    const name = document.createElement("span"), extra = document.createElement("span");
    li.dataset.own = String(line.own);
    name.className = "chat-name"; name.textContent = line.own ? "You" : c.name;
    extra.className = "chat-login-name";
    if (!line.own && c.login && c.name.toLowerCase() !== c.login.toLowerCase()) extra.textContent = "@" + c.login;
    text.textContent = line.text;
    if (line.own) {
      extra.className = "pm-state";
      extra.dataset.failed = String(line.state === "failed");
      extra.textContent = line.state === "sent" ? "Sent" : line.state === "failed" ? "Not sent" : "Sending…";
      if (line.state === "failed" && line.sid === c.sid) {
        const retry = document.createElement("button");
        retry.type = "button"; retry.className = "pm-button pm-quiet pm-retry"; retry.dataset.n = String(line.n); retry.textContent = "Retry";
        extra.append(retry);
      }
    }
    li.append(name, extra, time, text);
    return li;
  };

  const render = () => {
    const on = available() && (c.phase !== "idle" || c.invites.length > 0 || !!c.notice);
    switcher.hidden = !on;
    if (!on && c.view === "private") { c.view = "island"; delete panel.dataset.view; }
    for (const b of views) b.setAttribute("aria-pressed", String(b.dataset.pmView === c.view));
    if (viewing()) c.unseen = 0;
    count.hidden = !c.unseen; count.textContent = c.unseen ? String(c.unseen) : "";
    switchName.textContent = c.phase === "idle" ? "Private" : `Private · ${c.name}`;
    const invite = c.phase === "idle" && c.invites.length ? c.invites[0] : 0;
    title.textContent = c.phase === "idle" ? invite ? `Invite from ${who(invite).name}` : "Private" : `Private with ${c.name}`;
    const ready = !!(c.session && c.session.ready && !c.stopped);
    let words = c.notice;
    if (c.stopped) words = c.stopped;
    else if (invite) words = `${who(invite).name} asks for a private conversation. Accept if you hold a pad file with them, or will make one and send it to them outside Ooga.`;
    else if (c.phase === "inviting") words = `Waiting for ${c.name} to answer…`;
    else if (c.phase === "accepting") words = `Opening the conversation with ${c.name}…`;
    else if (c.phase === "open" && !c.session) words = `Load the pad file you and ${c.name} both hold, or make one and send it to them outside Ooga, the way you would hand over a key: in person, or over a channel you trust. Ooga never sends or keeps the pad. Keep the file safe, and delete every copy when you're done: with it, anyone who recorded the conversation could read it.`;
    else if (c.unrecorded) words = "This browser has no record of this pad. Use it only if the file has never been used, on any device or in any browser; otherwise its pad would be used twice. If in doubt, make a new one together.";
    else if (c.phase === "open" && !ready) words = `Waiting for ${c.name} to load the same pad…`;
    // Once the line is open, what it protects is said in the log's empty state and the budget line, to leave room for lines.
    if (note.textContent !== words) note.textContent = words;
    answer.hidden = !invite;
    padRow.hidden = !(c.phase === "open" && (!c.session || c.stopped || c.unrecorded));
    confirm.hidden = !c.unrecorded;
    printLine.hidden = !c.print;
    printPeer.textContent = c.name; print.textContent = c.print;
    log.hidden = c.phase !== "open" || !c.session;
    if (drawn !== c.revision) { drawn = c.revision; log.replaceChildren(...c.lines.map(row)); }
    budget.textContent = ready ? `Sealed · ${kb(c.session.remaining)} left to send · about ${BL.game.formatLarge(Math.min(c.session.slotsLeft, Math.floor(c.session.remaining / LINE_BYTES)))} lines` : "";
    form.hidden = c.phase !== "open" || !c.session;
    input.disabled = !ready || c.busy;
    sendButton.disabled = input.disabled || !!policy.error(input.value);
    end.hidden = c.phase === "idle";
    end.textContent = c.phase === "open" ? "End" : "Cancel";
    const used = policy.text(input.value).length;
    left.textContent = String(policy.MAX - used); left.dataset.over = String(used > policy.MAX);
  };

  const invite = (id) => {
    if (!available()) return false;
    if (c.phase !== "idle") { showPrivate(); BL.hud.toast("End your private conversation first."); return false; }
    // Someone who already asked is answered.
    if (c.invites.includes(id)) {
      c.invites = c.invites.filter((i) => i !== id);
      if (!net.sendPrivate("accept", id)) return false;
      begin("accepting", id);
      showPrivate();
      return true;
    }
    if (!net.sendPrivate("invite", id)) return false;
    begin("inviting", id);
    showPrivate();
    return true;
  };

  for (const b of views) b.addEventListener("click", (e) => { setView(b.dataset.pmView); if (e.detail) b.blur(); });
  answer.addEventListener("click", (e) => {
    const button = e.target.closest("button"), id = c.invites[0];
    if (!button || !id) return;
    if (e.detail) button.blur();
    c.invites.shift();
    c.notice = "";
    // Accepting holds the private view until the room opens the conversation.
    if (button.id === "pm-accept") { if (net.sendPrivate("accept", id)) begin("accepting", id); }
    else net.sendPrivate(button.id === "pm-block" ? "block" : "decline", id);
    render();
  });
  end.addEventListener("click", (e) => {
    if (e.detail) end.blur();
    if (c.phase !== "idle") net.sendPrivate("end", c.peer);
    reset(c.phase === "open" ? `You ended the private conversation with ${c.name}.` : "");
    render();
  });
  confirm.addEventListener("click", (e) => {
    const button = e.target.closest("button");
    if (!button || !c.unrecorded) return;
    if (e.detail) button.blur();
    if (button.id === "pm-fresh") { c.unrecorded = false; render(); startPad(true); }
    else { wipe(); render(); }
  });
  file.addEventListener("change", () => {
    const chosen = file.files && file.files[0];
    file.value = "";
    if (!chosen || c.phase !== "open") return;
    if (chosen.size > P.PAD.MAX + 128) { c.stopped = padWords("size"); return render(); }
    chosen.arrayBuffer().then((buffer) => loadPad(new Uint8Array(buffer), false), () => { c.stopped = "That file couldn't be read."; render(); });
  });
  make.addEventListener("click", (e) => {
    if (e.detail) make.blur();
    if (c.phase !== "open") return;
    const bytes = P.make(me(), c.login, Number(size.value), (view) => window.crypto.getRandomValues(view));
    // A copy to download and send outside Ooga; the page keeps its own in memory for this conversation.
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" })), a = document.createElement("a");
    a.href = url; a.download = `ooga-pad-${me().toLowerCase()}-${c.login.toLowerCase()}.oogapad`;
    document.body.append(a); a.click(); a.remove();
    // Firefox and Safari cancel a download whose address goes at once, so it is kept a minute.
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    add({ note: `A new pad was saved to your downloads. Send that file to ${c.name} outside Ooga and keep no other copies. Until they load it, nothing can be said. Delete it when you're done: anyone who has it could read what you said.`, at: Date.now() });
    loadPad(bytes, true);
  });
  input.addEventListener("input", render);
  input.addEventListener("keydown", (e) => { if (e.key === "Escape" && !e.isComposing) input.blur(); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!c.session || !c.session.ready || c.busy || policy.error(input.value)) return;
    const gen = c.generation, text = policy.text(input.value);
    c.busy = true; render();
    const r = await c.session.say(text);
    if (gen !== c.generation) return;
    c.busy = false;
    if (r.kind === "sent") {
      add({ own: true, text, at: Date.now(), n: r.n, sid: c.sid, state: c.lastSend.n === r.n && !c.lastSend.ok ? "failed" : "sending" });
      input.value = "";
    } else if (r.kind === "stopped") return stop(r.error);
    render();
    input.focus({ preventScroll: true });
  });
  log.addEventListener("click", (e) => {
    const retry = e.target.closest(".pm-retry");
    if (!retry || !c.session) return;
    // Only a line of this pad's session: its number means nothing to any other.
    const n = Number(retry.dataset.n), gen = c.generation, sid = c.sid;
    if (!c.lines.some((l) => l.n === n && l.sid === sid)) return;
    retry.disabled = true;
    c.session.retry(n).then((r) => {
      if (gen !== c.generation || sid !== c.sid) return;
      if (r.kind === "stopped") return stop(r.error);
      const line = c.lines.find((l) => l.n === n && l.sid === sid);
      if (!line || r.kind !== "sent") return;
      // Sealed again on fresh bytes, it reaches the other side after the lines since: shown there too.
      if (r.n !== n) { c.lines.splice(c.lines.indexOf(line), 1); c.lines.push(line); line.at = Date.now(); line.n = r.n; }
      line.state = c.lastSend.n === r.n && !c.lastSend.ok ? "failed" : "sending";
      c.revision++;
      render();
    });
  });

  net.subscribePrivate(heard);
  net.subscribe(() => render());
  render();

  BL.privateChat = { available, invite,
    stats: () => ({ phase: c.phase, peer: c.peer, view: c.view, invites: c.invites.slice(), ready: !!(c.session && c.session.ready), stopped: c.stopped,
      notice: c.notice, lines: c.lines.map((l) => l.note ? { note: l.note } : { own: l.own, text: l.text, state: l.state, late: !!l.late }), queued: c.queue.length, unseen: c.unseen,
      padLoaded: !!c.pad, started: c.started, unrecorded: c.unrecorded, remaining: c.session ? c.session.remaining : 0 }) };
})();
