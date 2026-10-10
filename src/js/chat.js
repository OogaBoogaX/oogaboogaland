// Ooga Chat, the sheet's last tab: one live conversation for every signed-in player on the island, on the
// page the Worker serves (docs/auth-and-presence.md). The tab shows only where a backend answered; signed
// out, the input is off and the panel offers the footer's sign-in. The room names each speaker and holds
// the last CHAT_KEEP lines in its memory alone, not persisted to the database: a reload fetches the room history, and a
// room that slept forgets it; an open page keeps what it saw until reload or explicit logout.
// Cost: a line heard while the panel is not showing only joins a capped array, and the rows are drawn in one
// batch when it shows; while it shows a line adds a row and drops the oldest past CHAT_KEEP. The log follows
// new lines only while it is scrolled to its foot, so reading back is never yanked. One bounded acknowledgement timeout, no frame work.
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
  const FOLLOW_PX = 24, ACK_MS = 10000;
  const ROOM_WORDS = { off: "Not connected.", connecting: "Joining the island…", paused: "Paused while the tab was hidden.", replaced: "Open in another tab.", full: "The island is full.", revoked: "Your account access was revoked. Sign in again if access is restored." };
  const TIME = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const $ = (id) => document.getElementById(id);
  const sheet = $("sheet"), tab = $("chat-tab"), panel = $("chat-panel"), log = $("chat-log");
  const status = $("chat-status"), statusText = $("chat-status-text"), signIn = $("chat-login");
  const form = $("chat-form"), input = $("chat-input"), left = $("chat-left"), sendButton = $("chat-send");
  const announcement = $("chat-announcement");
  const announce = (text) => { if (announcement && announcement.textContent !== text) announcement.textContent = text; };
  const viewport = window.visualViewport, fine = window.matchMedia("(pointer: fine)");
  const lines = [];
  const identity = $("chat-identity"), accountLogin = $("chat-account-login"), displayForm = $("chat-display-form"), displayInput = $("chat-display"), displaySave = $("chat-display-save"), displayStatus = $("chat-display-status");
  let identityId = "", identityDisplay = "", displaySaving = false, displayComposing = false;
  let showing = false, drawn = true, live = false, me = "", composing = false, pending = null, notice = "", revision = 0, logoutEpoch = 0, ackTimer = 0;
  const stopWaiting = () => { window.clearTimeout(ackTimer); ackTimer = 0; if (pending) pending.awaiting = false; };

  const row = (line) => {
    const li = document.createElement("li"), name = document.createElement("span"), text = document.createElement("span"), login = document.createElement("span");
    li.className = "chat-row";
    li.dataset.id = String(line.id);
    if (line.login.toLowerCase() === me) li.dataset.own = "true";
    if (line.at) li.title = TIME.format(line.at);
    name.className = "chat-name";
    name.textContent = line.name;
    text.className = "chat-text";
    text.textContent = line.text;
    login.className = "chat-login-name";
    login.textContent = "@" + line.login;
    li.append(name, login, text);
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
      stopWaiting();
      if (receipt.accepted) {
        if (revision === pending.revision && input.value === pending.draft) input.value = "";
        pending = null;
        notice = "Message sent.";
      } else {
        pending.awaiting = false;
        if (receipt.conflict) pending = null;
        notice = receipt.conflict ? "This retry could not be confirmed. Edit your message before sending again." : "Wait a moment, then send again.";
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
    if (!joined && list.length) announce(list.map((line) => line.name + " @" + line.login + ": " + line.text).join(". "));
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
    const unsupported = /[^\w .,!'?@#:-]/.test(input.value);
    const feedback = unsupported ? "Use letters A–Z, a–z, digits, spaces and _ . , ! ? ' @ # : - only. Remove unsupported characters before sending." : notice;
    left.textContent = String(CHAT_MAX - length);
    left.dataset.over = String(length > CHAT_MAX);
    sendButton.disabled = !live || !!(pending && pending.awaiting) || !length || length > CHAT_MAX || unsupported;
    status.hidden = live && !feedback;
    if (live) statusText.textContent = feedback;
    announce(statusText.textContent);
  };
  const account = ({ backend, me: player, room, logoutEpoch: epoch = logoutEpoch }) => {
    if (epoch !== logoutEpoch) {
      logoutEpoch = epoch;
      stopWaiting(); pending = null; notice = ""; revision++; input.value = "";
      lines.length = 0; log.replaceChildren(); drawn = true;
      announce("Signed out. Local chat and draft cleared.");
    }
    tab.hidden = !backend;
    if (identity) {
      identity.hidden = !player;
      accountLogin.textContent = player ? "@" + player.login : "";
      const id = player ? String(player.id) : "", display = player ? player.display || player.login : "";
      if (id !== identityId || display !== identityDisplay) { displayInput.value = display; displayStatus.textContent = ""; }
      identityId = id; identityDisplay = display;
      displayInput.disabled = !player || displaySaving; displaySave.disabled = !player || displaySaving;
    }
    me = player ? player.login.toLowerCase() : "";
    live = !!player && room === "live";
    if (!live) { stopWaiting(); notice = ""; }
    input.disabled = !live;
    input.placeholder = live ? "Say something" : "";
    signIn.hidden = !!player;
    status.hidden = live;
    statusText.textContent = room === "revoked" ? ROOM_WORDS.revoked : !player ? (logoutEpoch ? "Signed out. Local chat and draft cleared. Sign in to chat." : "Sign in to chat with everyone on the island.") : ROOM_WORDS[room] || "";
    update();
  };

  const submit = () => {
    if (composing || sendButton.disabled) return;
    const draft = input.value;
    const text = BL.donations.sanitize(draft, Infinity);
    if (!pending || pending.text !== text) pending = { clientId: window.crypto.randomUUID(), text };
    pending.draft = draft;
    pending.revision = revision;
    pending.awaiting = true;
    notice = "";
    if (!net.sendChat(draft, pending.clientId)) pending.awaiting = false;
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
      tab.focus({ preventScroll: true });
    } else if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229 && !composing) {
      e.preventDefault();
      submit();
    }
  });
  input.addEventListener("keyup", (e) => e.stopPropagation());
  if (displayForm) {
    displayForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!identityId || displaySaving || displayComposing) return;
      const id = identityId;
      displaySaving = true; displayInput.disabled = true; displaySave.disabled = true;
      displayStatus.textContent = "Saving display name…";
      let result;
      try { result = await net.setDisplay(displayInput.value); } catch (_) { result = { ok: false }; }
      displaySaving = false;
      displayInput.disabled = !identityId; displaySave.disabled = !identityId;
      if (id === identityId) displayStatus.textContent = result.ok ? "Display name saved." : result.error || "Could not save display name. Try again.";
    });
    displayInput.addEventListener("compositionstart", () => { displayComposing = true; });
    displayInput.addEventListener("compositionend", () => { displayComposing = false; });
    displayInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.isComposing || e.keyCode === 229 || displayComposing) return;
      if (e.key === "Escape") { e.preventDefault(); tab.focus({ preventScroll: true }); }
    });
    displayInput.addEventListener("keyup", (e) => e.stopPropagation());
  }
  // Choosing the tab with a mouse puts the cursor in the input; on a touch screen that would raise the keyboard
  // over the log, so there the input waits for a tap. Heard after hud.js's own click on the tab.
  sheet.addEventListener("click", (e) => {
    if (!e.target.closest || !e.target.closest("#chat-tab")) return;
    updateShowing();
    if (showing && live && fine.matches) input.focus({ preventScroll: true });
  });
  // The phone's keyboard covers the drawer's foot: lift the sheet by what it hides while the input has focus.
  const fit = () => sheet.style.setProperty("--chat-keyboard", `${Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))}px`);
  const fitInputs = displayInput ? [input, displayInput] : [input];
  for (const field of fitInputs) field.addEventListener("focus", () => {
    if (!viewport) return;
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
  });
  for (const field of fitInputs) field.addEventListener("blur", () => {
    if (!viewport) return;
    viewport.removeEventListener("resize", fit);
    viewport.removeEventListener("scroll", fit);
    sheet.style.removeProperty("--chat-keyboard");
  });

  net.subscribe(account);
  net.subscribeChat(heard);
  BL.chat = { account, heard, get stats() { return { lines: lines.length, rows: log.childElementCount, showing, drawn, live }; } };
})();
