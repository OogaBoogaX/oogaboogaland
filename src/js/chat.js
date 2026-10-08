// Ooga Chat, the sheet's last tab: one live conversation for every signed-in player on the island, on the
// page the Worker serves (docs/auth-and-presence.md). The tab shows only where a backend answered; signed
// out, the input is off and the panel offers the footer's sign-in. The room names each speaker and holds
// the last CHAT_KEEP lines in its memory alone, so nothing is stored: a reload forgets them, and so does a
// room that slept, though a page that stays open keeps what it saw.
// Cost: a line heard while the panel is not showing only joins a capped array, and the rows are drawn in one
// batch when it shows; while it shows a line adds a row and drops the oldest past CHAT_KEEP. The log follows
// new lines only while it is scrolled to its foot, so reading back is never yanked. No timers, no frame work.
// Enter sends one pending line with a stable retry id; its acknowledgement clears an unchanged draft.
// A refusal or disconnect keeps the draft and id, unless the player edits it into a different message.
// Escape leaves the input with the sheet open. Keys typed in the sheet never reach a scene
// (controls.js, director.js). On a phone the sheet rises above the keyboard while the input has focus.
// Exports account (fed `BL.net.state`), heard (fed the room's lines) and stats.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const net = BL.net;
  const { CHAT_MAX, CHAT_KEEP } = net;
  // Scrolled within this many pixels of the foot counts as following the newest line.
  const FOLLOW_PX = 24;
  const ROOM_WORDS = { off: "Not connected.", connecting: "Joining the island…", paused: "Paused while the tab was hidden.", replaced: "Open in another tab.", full: "The island is full." };
  const TIME = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const $ = (id) => document.getElementById(id);
  const sheet = $("sheet"), tab = $("chat-tab"), panel = $("chat-panel"), log = $("chat-log");
  const status = $("chat-status"), statusText = $("chat-status-text"), signIn = $("chat-login");
  const form = $("chat-form"), input = $("chat-input"), left = $("chat-left"), sendButton = $("chat-send");
  const viewport = window.visualViewport, fine = window.matchMedia("(pointer: fine)");
  const lines = [];
  let showing = false, drawn = true, live = false, me = "", composing = false, pending = null, notice = "";

  const row = (line) => {
    const li = document.createElement("li"), name = document.createElement("span"), text = document.createElement("span");
    li.className = "chat-row";
    li.dataset.id = String(line.id);
    if (line.login.toLowerCase() === me) li.dataset.own = "true";
    if (line.at) li.title = TIME.format(line.at);
    name.className = "chat-name";
    name.textContent = line.name;
    text.className = "chat-text";
    text.textContent = line.text;
    li.append(name, text);
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

  // From the room: one new line, or (joined) everything it holds on a join. A join merges by id rather
  // than replacing, so a socket that reconnects to a room which slept and forgot keeps what this page saw.
  const heard = (list, joined, receipt) => {
    if (receipt) {
      if (!pending || receipt.clientId !== pending.clientId) return;
      if (receipt.accepted) {
        if (input.value === pending.draft) input.value = "";
        pending = null;
        notice = "";
      } else {
        pending.awaiting = false;
        if (receipt.conflict) pending = null;
        notice = "Wait a moment, then send again.";
      }
      update();
      return;
    }
    if (joined) {
      const seen = new Set(lines.map((line) => line.id));
      for (const line of list) if (!seen.has(line.id)) lines.push(line);
      lines.sort((a, b) => a.id - b.id);
    } else for (const line of list) lines.push(line);
    const over = Math.max(0, lines.length - CHAT_KEEP);
    if (over) lines.splice(0, over);
    if (!showing) {
      drawn = false;
      return;
    }
    if (joined || !drawn) {
      redraw(!drawn || atFoot());
      return;
    }
    const follow = atFoot();
    for (const line of list) log.append(row(line));
    for (let i = 0; i < over; i++) log.firstElementChild.remove();
    if (follow) log.scrollTop = log.scrollHeight;
  };

  const updateShowing = () => {
    showing = !tab.hidden && !panel.hidden && sheet.dataset.open === "true";
    if (showing && !drawn) redraw();
  };
  const watch = new MutationObserver(updateShowing);
  watch.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  watch.observe(tab, { attributes: true, attributeFilter: ["hidden"] });
  watch.observe(sheet, { attributes: true, attributeFilter: ["data-open"] });

  // What is left of a line once sanitized as the room will.
  const update = () => {
    const length = BL.donations.sanitize(input.value, Infinity).length;
    left.textContent = String(CHAT_MAX - length);
    left.dataset.over = String(length > CHAT_MAX);
    sendButton.disabled = !live || !!(pending && pending.awaiting) || !length || length > CHAT_MAX;
    status.hidden = live && !notice;
    if (live) statusText.textContent = notice;
  };
  const account = ({ backend, me: player, room }) => {
    tab.hidden = !backend;
    me = player ? player.login.toLowerCase() : "";
    live = !!player && room === "live";
    if (!live) { if (pending) pending.awaiting = false; notice = ""; }
    input.disabled = !live;
    input.placeholder = live ? "Say something" : "";
    signIn.hidden = !!player;
    status.hidden = live;
    statusText.textContent = !player ? "Sign in to chat with everyone on the island." : ROOM_WORDS[room] || "";
    update();
  };

  const submit = () => {
    if (sendButton.disabled) return;
    const draft = input.value;
    const text = BL.donations.sanitize(draft, Infinity);
    if (!pending || pending.text !== text) pending = { clientId: window.crypto.randomUUID(), text };
    pending.draft = draft;
    pending.awaiting = true;
    notice = "";
    if (!net.sendChat(draft, pending.clientId)) pending.awaiting = false;
    update();
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submit();
    if (document.activeElement === sendButton) sendButton.blur();
  });
  input.addEventListener("input", update);
  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend", () => { composing = false; });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      input.blur();
    } else if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229 && !composing) {
      e.preventDefault();
      submit();
    }
  });
  // Choosing the tab with a mouse puts the cursor in the input; on a touch screen that would raise the keyboard
  // over the log, so there the input waits for a tap. Heard after hud.js's own click on the tab.
  sheet.addEventListener("click", (e) => {
    if (!e.target.closest || !e.target.closest("#chat-tab")) return;
    updateShowing();
    if (showing && live && fine.matches) input.focus({ preventScroll: true });
  });
  // The phone's keyboard covers the drawer's foot: lift the sheet by what it hides while the input has focus.
  const fit = () => sheet.style.setProperty("--chat-keyboard", `${Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))}px`);
  input.addEventListener("focus", () => {
    if (!viewport) return;
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
  });
  input.addEventListener("blur", () => {
    if (!viewport) return;
    viewport.removeEventListener("resize", fit);
    viewport.removeEventListener("scroll", fit);
    sheet.style.removeProperty("--chat-keyboard");
  });

  net.subscribe(account);
  net.subscribeChat(heard);
  BL.chat = { account, heard, get stats() { return { lines: lines.length, rows: log.childElementCount, showing, drawn, live }; } };
})();
