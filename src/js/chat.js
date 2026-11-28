// The Commons (the island's text chat, formerly shown as Ooga Chat; #660 kept every `chat-*` id, key and message), the
// tab before Ooga Chat's cloud: one live conversation for every signed-in player on the island, on the
// page the Worker serves (docs/auth-and-presence.md). Like Online Oogas, the tab is hidden while signed
// out. Contributor sign-in lives in the Contributing Oogas panel. The room names each speaker and holds
// the last CHAT_KEEP lines in its memory alone, not persisted to the database: a reload fetches the room history, and a
// room that slept forgets it; an open page keeps what it saw until reload or explicit logout.
// The conversation (the log, its drawing and following, the composer, sending, its receipt and retry) is
// commons-log.js's, shared with Ooga Chat's Commons; this file is the island's glue: the room's socket and its words,
// the unread count, the display name, and the sheet. Escape leaves the input with the sheet open. Keys typed in the
// sheet never reach a scene (controls.js, director.js). On a phone the sheet rises above the keyboard while the input
// has focus.
// Unread lines (#430): a line from someone else that this page had not had, heard while the visitor is not in the
// panel, counts on the tab until they look at it (`sheet.watchViews`). The first lines the room hands over on arrival
// do not count; on a rejoin (a reconnect, a tab back from the background), only lines newer than any this page had.
// While the panel shows its private view (#188), the island's lines are out of sight and still count.
// Exports account (fed `BL.net.state`), heard (fed the room's lines) and stats.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const net = BL.net;
  const { CHAT_KEEP } = net;
  const ROOM_WORDS = { off: "Not connected.", connecting: "Joining the island…", paused: "Paused while the tab was hidden.", replaced: "Open in another tab.", full: "The island is full.", revoked: "Your account access was revoked. Sign in again if access is restored." };
  const $ = (id) => document.getElementById(id);
  const sheet = $("sheet"), panel = $("chat-panel"), log = $("chat-log");
  const input = $("chat-input"), roomChip = $("chat-room");
  const viewport = window.visualViewport, fine = window.matchMedia("(pointer: fine)");
  const identity = $("chat-identity"), displayForm = $("chat-display-form"), displayInput = $("chat-display"), displaySave = $("chat-display-save"), displayStatus = $("chat-display-status");
  let identityId = "", identityDisplay = "", displaySaving = false, displayComposing = false;
  let showing = false, logoutEpoch = 0, unread = 0;
  const setUnread = (count) => { unread = count; BL.sheet.setBadge("chat", count); };
  // The conversation itself, the log and the composer, is commons-log.js's, shared with Ooga Chat; this page's socket
  // carries the lines.
  const conversation = BL.commonsLog.create({ log, form: $("chat-form"), input, left: $("chat-left"), send: $("chat-send"),
    status: $("chat-status"), statusText: $("chat-status-text"), announcement: $("chat-announcement") },
  { keep: CHAT_KEEP, send: (text, clientId) => net.sendChat(text, clientId), unicode: () => net.state.chatUnicode,
    escape: () => BL.sheet.tabFor(panel)?.focus({ preventScroll: true }) });

  // From the room: one new line, or (joined) everything it holds on a join. The panel's private view (private-chat.js)
  // hides the island's lines, so they still count there.
  const heard = (list, joined, receipt) => {
    const fresh = conversation.heard(list, joined, receipt);
    if (fresh && (!BL.sheet.attending(panel) || panel.dataset.view === "private")) setUnread(unread + fresh);
  };

  const updateShowing = () => {
    showing = BL.sheet.visible(panel);
    conversation.show(showing);
  };
  const watch = new MutationObserver(updateShowing);
  watch.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  watch.observe(sheet, { attributes: true, attributeFilter: ["data-open", "hidden"] });

  const account = ({ me: player, room, online = 0, logoutEpoch: epoch = logoutEpoch }) => {
    if (epoch !== logoutEpoch) {
      logoutEpoch = epoch;
      conversation.clear();
      setUnread(0);
      conversation.announce("Signed out. Local chat and draft cleared.");
    }
    if (identity) {
      identity.hidden = !player;
      const id = player ? String(player.id) : "", display = player ? player.display || player.login : "";
      if (id !== identityId || display !== identityDisplay) { displayInput.value = display; displayStatus.textContent = ""; }
      identityId = id; identityDisplay = display;
      displayInput.disabled = !player || displaySaving; displaySave.disabled = !player || displaySaving;
    }
    const live = !!player && room === "live";
    const chip = live ? `${BL.cloudPanel ? BL.cloudPanel.online({ online, room }) : online} online` : "Offline";
    if (roomChip.textContent !== chip) {
      roomChip.textContent = chip;
    }
    roomChip.dataset.tone = live ? "live" : "idle";
    conversation.setLive({ live, me: player ? player.login : "", words: room === "revoked" ? ROOM_WORDS.revoked
      : !player ? (logoutEpoch ? "Signed out. Local chat and draft cleared. Sign in to chat." : "Sign in to chat with everyone on the island.") : ROOM_WORDS[room] || "" });
  };

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
      if (e.key === "Escape") { e.preventDefault(); BL.sheet.tabFor(panel)?.focus({ preventScroll: true }); }
    });
  }
  // Choosing the tab with a mouse puts the cursor in the input; on a touch screen that would raise the keyboard
  // over the log, so there the input waits for a tap. Heard after hud.js's own click on the tab.
  document.addEventListener("click", (e) => {
    if (!e.target.closest || !e.target.closest(".sheet [data-tab='chat']")) return;
    updateShowing();
    if (showing && conversation.stats.live && fine.matches) input.focus({ preventScroll: true });
  });
  // The phone's keyboard covers the drawer's foot: lift the sheet by what it hides while the input has focus.
  let keyboardSheet = null;
  const clearFit = () => {
    if (!keyboardSheet) return;
    keyboardSheet.style.removeProperty("--chat-keyboard");
    keyboardSheet.style.removeProperty("--chat-viewport");
    delete keyboardSheet.dataset.keyboard;
    keyboardSheet = null;
  };
  const fit = () => {
    const owner = panel.closest(".sheet");
    if (keyboardSheet !== owner) { clearFit(); keyboardSheet = owner; }
    if (!owner) return;
    const keyboard = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
    owner.style.setProperty("--chat-keyboard", `${keyboard}px`);
    if (keyboard > 0) owner.dataset.keyboard = "true";
    else delete owner.dataset.keyboard;
    owner.style.setProperty("--chat-viewport", `${Math.floor(viewport.height)}px`);
    // A short landscape viewport scrolls the panel rather than hiding the focused editor.
    const field = document.activeElement;
    if (field === input || field === displayInput) field.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
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
    clearFit();
  });
  document.addEventListener("sheetchange", () => {
    updateShowing();
    if (viewport && (document.activeElement === input || document.activeElement === displayInput)) fit();
  });

  BL.sheet.watchViews(panel, () => { if (unread && panel.dataset.view !== "private") setUnread(0); });
  // Turning back from the private view to the island's lines, with the panel up, is looking at them.
  new MutationObserver(() => { if (unread && panel.dataset.view !== "private" && BL.sheet.visible(panel)) setUnread(0); })
    .observe(panel, { attributes: true, attributeFilter: ["data-view"] });
  net.subscribe(account);
  net.subscribeChat(heard);
  BL.chat = { account, heard, get stats() { return { ...conversation.stats, unread }; } };
})();
