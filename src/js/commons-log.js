// The Commons' conversation, the island's (chat.js) and Ooga Chat's (#656) alike: the log of the last `keep` lines the
// room holds and the composer under it. Nothing here reads anything at load but window.BL, so Ooga Chat shares it
// (scripts/ooga-chat.mjs SHARED); each page brings its own socket. `create(parts, options)` takes the elements (`log`,
// `form`, `input`, `left`, `send` (the button), `status`, `statusText` and the live region `announcement`) and:
//   send(text, clientId)  hands a line to the page's socket, false when it could not go
//   unicode()             whether the room takes extended text (chat-unicode-v1)
//   escape()              where Escape in the input takes the focus
// It returns `heard(list, joined, receipt)` (the room's lines, or its receipt for one of this page's), which answers how
// many new lines from others this page had not had; `setLive({ live, me, words })`, the socket's state and the words for
// it; `show(showing)`, whether the log is in sight; `clear()`, forgetting everything on a sign-out; `update()` and `stats`.
// A line heard while the log is out of sight only joins a capped array, and the rows are drawn in one batch when it
// shows; while it shows a line adds a row and drops the oldest past `keep`. The log follows new lines only while it is
// scrolled to its foot, so reading back is never yanked. A join merges by id rather than replacing, so a socket that
// reconnects to a room which slept and forgot keeps what this page saw. Enter sends one pending line with a stable retry
// id; its acknowledgement clears an unchanged draft. A refusal or disconnect keeps the draft and id, unless the visitor
// edits it into a different message. One bounded acknowledgement timeout, no frame work.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // Scrolled within this many pixels of the foot counts as following the newest line.
  const FOLLOW_PX = 24, ACK_MS = 10000;
  const TIME = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const create = ({ log, form, input, left, send: sendButton, status, statusText, announcement }, { keep = 100, send, unicode, escape }) => {
    const announce = (text) => { if (announcement && announcement.textContent !== text) announcement.textContent = text; };
    const lines = [];
    let showing = false, drawn = true, live = false, me = "", composing = false, pending = null, notice = "", revision = 0, ackTimer = 0;
    let newest = -1, synced = false;
    const stopWaiting = () => { window.clearTimeout(ackTimer); ackTimer = 0; if (pending) pending.awaiting = false; };

    const row = (line) => {
      const li = document.createElement("li"), name = document.createElement("span"), text = document.createElement("span"), login = document.createElement("span"), time = document.createElement("time");
      li.className = "chat-row";
      li.dataset.id = String(line.id);
      if (line.login.toLowerCase() === me) li.dataset.own = "true";
      if (line.at) {
        li.title = TIME.format(line.at);
        time.className = "chat-time";
        time.dateTime = new Date(line.at).toISOString();
        time.textContent = li.title;
      }
      name.className = "chat-name";
      name.textContent = line.name;
      text.className = "chat-text";
      text.textContent = line.text;
      login.className = "chat-login-name";
      login.textContent = "@" + line.login;
      li.append(name, login);
      if (line.at) li.append(time);
      li.append(text);
      return li;
    };
    const redraw = (follow = true) => {
      const top = log.getBoundingClientRect().top, oldTop = log.scrollTop;
      let anchor = null, offset = 0;
      if (!follow) for (const child of log.children) {
        const rect = child.getBoundingClientRect();
        if (rect.bottom > top) { anchor = child.dataset.id; offset = rect.top - top; break; }
      }
      const rows = document.createDocumentFragment();
      for (const line of lines) rows.append(row(line));
      log.replaceChildren(rows);
      if (follow) log.scrollTop = log.scrollHeight;
      else {
        log.scrollTop = oldTop;
        for (const child of log.children) if (child.dataset.id === anchor) {
          log.scrollTop += child.getBoundingClientRect().top - top - offset;
          break;
        }
      }
      drawn = true;
    };
    const atFoot = () => log.scrollHeight - log.scrollTop - log.clientHeight <= FOLLOW_PX;

    // From the room: one new line, or (joined) everything it holds on a join. Answers how many lines from others this
    // page had not had: none for the first lines a page is handed, and on a rejoin only those newer than any it had.
    const heard = (list, joined, receipt) => {
      if (receipt) {
        if (!pending || receipt.clientId !== pending.clientId) return 0;
        stopWaiting();
        if (receipt.accepted) {
          if (revision === pending.revision && input.value === pending.draft) input.value = "";
          pending = null;
          notice = "Message sent.";
        } else {
          pending.awaiting = false;
          if (receipt.conflict) pending = null;
          notice = receipt.conflict ? "This retry could not be confirmed. Edit your message before sending again."
            : receipt.readOnly ? "The Commons is read-only from Ooga Chat for now. Your draft is kept." : "Wait a moment, then send again.";
        }
        update();
        return 0;
      }
      let fresh = 0;
      if (joined) {
        const seen = new Set(lines.map((line) => line.id));
        for (const line of list) if (!seen.has(line.id)) {
          lines.push(line);
          if (synced && line.id > newest && line.login.toLowerCase() !== me) fresh++;
        }
        lines.sort((a, b) => a.id - b.id);
        synced = true;
      } else for (const line of list) {
        lines.push(line);
        if (line.id > newest && line.login.toLowerCase() !== me) fresh++;
      }
      for (const line of list) if (line.id > newest) newest = line.id;
      const over = Math.max(0, lines.length - keep);
      if (over) lines.splice(0, over);
      if (!showing) {
        drawn = false;
        return fresh;
      }
      if (!joined && list.length) announce(list.map((line) => line.name + " @" + line.login + ": " + line.text).join(". "));
      if (joined || !drawn) {
        redraw(!drawn || atFoot());
        return fresh;
      }
      const follow = atFoot();
      for (const line of list) log.append(row(line));
      for (let i = 0; i < over; i++) log.firstElementChild.remove();
      if (follow) log.scrollTop = log.scrollHeight;
      return fresh;
    };
    const show = (now) => {
      showing = now;
      if (showing && !drawn) redraw();
    };

    // Validate exactly as the room will; only surrounding whitespace is trimmed.
    const update = () => {
      const policy = BL.chatPolicy, length = policy.text(input.value).length, problem = policy.error(input.value);
      const unsupported = !problem && !unicode() && !policy.legacy(policy.text(input.value));
      const feedback = problem === "controls" ? "Remove control characters, line breaks or directional formatting before sending."
        : problem === "unicode" ? "This draft contains incomplete Unicode. Edit it before sending."
        : problem === "length" ? "Message is over 160 UTF-16 units. Shorten it before sending."
        : unsupported ? "This server does not yet support extended chat text. Keep the draft and reconnect after the server update."
        : notice;
      left.textContent = String(policy.MAX - length);
      left.dataset.over = String(length > policy.MAX);
      sendButton.disabled = !live || !!(pending && pending.awaiting) || !!problem || unsupported;
      status.hidden = live && !feedback;
      if (live) statusText.textContent = feedback;
      announce(statusText.textContent);
    };
    // The socket's state: whether lines can go (`live`), whose own lines are marked (`me`, a login), and what the status
    // says while they can't (`words`).
    const setLive = ({ live: now, me: login, words }) => {
      me = login ? login.toLowerCase() : "";
      live = now;
      if (!live) { stopWaiting(); notice = ""; }
      input.disabled = !live;
      input.placeholder = live ? "Say something" : "";
      status.hidden = live;
      statusText.textContent = words;
      update();
    };
    // Signed out: the lines, the draft and the line waiting to be sent go, here and from the screen.
    const clear = () => {
      stopWaiting(); pending = null; notice = ""; revision++; input.value = "";
      lines.length = 0; log.replaceChildren(); drawn = true;
      newest = -1; synced = false;
    };

    const submit = () => {
      if (composing || sendButton.disabled) return;
      const draft = input.value;
      const text = BL.chatPolicy.text(draft);
      if (!pending || pending.text !== text) pending = { clientId: window.crypto.randomUUID(), text };
      pending.draft = draft;
      pending.revision = revision;
      pending.awaiting = true;
      notice = "";
      if (!send(draft, pending.clientId)) pending.awaiting = false;
      else {
        const waiting = pending;
        window.clearTimeout(ackTimer);
        ackTimer = window.setTimeout(() => {
          if (pending !== waiting || !pending.awaiting) return;
          stopWaiting();
          notice = "Delivery is uncertain. Send again to retry the same message; it will not be duplicated while the room remembers it.";
          update();
        }, ACK_MS);
      }
      update();
    };
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      submit();
      if (document.activeElement === sendButton) input.focus({ preventScroll: true });
    });
    input.addEventListener("input", () => { revision++; update(); });
    input.addEventListener("compositionstart", () => { composing = true; });
    input.addEventListener("compositionend", () => { composing = false; });
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.isComposing || e.keyCode === 229 || composing) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        escape();
      } else if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229 && !composing) {
        e.preventDefault();
        submit();
      }
    });
    return { heard, setLive, show, clear, update, announce,
      get stats() { return { lines: lines.length, rows: log.childElementCount, showing, drawn, live }; } };
  };
  BL.commonsLog = { create };
})();
