(() => {
  "use strict";
  const BL = window.BL, R = BL.pokerRules;
  const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const chips = n => number.format(n);
  const streetName = { waiting: "Waiting for players", preflop: "Pre-flop", flop: "Flop", turn: "Turn", river: "River", reveal: "Opening showdown", showdown: "Hand complete" };
  const fairName = { keys: "Preparing private keys", shuffle: "Shuffling & checking proofs", ack: "Agreeing on the deck", hole: "Dealing private cards", board: "Opening community cards", showdown: "Checking showdown", betting: "Shuffle checked · hand in play", complete: "Completed hand record checked", aborted: "Hand canceled · chips refunded", idle: "Waiting for a shared hand", failed: "Verification stopped · actions disabled" };
  // Pot sizing includes the call before calculating the raise, and returns a
  // street TOTAL. The rules remain the authority for short all-ins and reopening.
  const betAmount = (s, preset) => {
    const l = s.legal; if (!l?.canRaise) return null;
    const floor = Math.min(l.min, l.max);
    let amount = floor;
    if (preset === "all") amount = l.max;
    else if (preset === "half" || preset === "threeQuarter" || preset === "pot") {
      const fraction = preset === "half" ? 0.5 : preset === "threeQuarter" ? 0.75 : 1;
      amount = s.currentBet + Math.round((s.pot + l.call) * fraction);
    }
    return Math.max(floor, Math.min(l.max, amount));
  };
  // Three chip stacks under the pot number, each at most eight chips high.
  const potChips = (pot, out) => {
    out[0] = pot > 0 ? Math.min(8, Math.ceil(pot / 25)) : 0;
    out[1] = pot > 0 ? Math.min(8, Math.floor(pot / 200)) : 0;
    out[2] = pot > 0 ? Math.min(8, Math.floor(pot / 1600)) : 0;
    return out;
  };
  const position = (seat, own) => (seat - Math.max(0, own) + R.SEATS) % R.SEATS;
  const resultText = s => {
    if (!s.result) return "";
    const lines = [];
    for (let i = 0; i < R.SEATS; i++) {
      if (!s.result.awards[i]) continue;
      const p = s.seats[i], won = s.result.pots.some(pot => !pot.refund && pot.winners.includes(i));
      const rank = won && s.result.revealed && p?.cards.length === 2 && p.cards.every(Number.isInteger) ? R.evaluate(p.cards.concat(s.board)).name : "";
      lines.push(`${s.result.names[i] || `Seat ${i + 1}`} ${won ? "collects" : "receives back"} ${chips(s.result.awards[i])}${rank ? ` · ${rank}` : ""}`);
    }
    return lines.join(" / ");
  };
  // The Emote button's press reaches the visit's outside-press close before its click: one on either Emote button leaves
  // the menu to the button's own toggle, so that press closes an open menu rather than closing and reopening it. The mark
  // lives for that one press: the close and the button's click each clear it, or the HUD's Escape, which calls the same
  // close, would find it still set and leave the menu open.
  let pressOnEmote = false;
  const notePress = e => { pressOnEmote = e.target instanceof Element && !!e.target.closest('[data-poker="emote"]'); };
  // `emote(id)` sends one of BL.pokerEmotes' ten and answers whether it went; `hud` is the visit's HUD, whose outside
  // presses close the emote menu. Both are optional: without `emote` the Emote buttons never show.
  // `npcAt(table, seat)` says whether a computer opponent's figure sits at a seat (1), or one asked to move after this
  // hand (2), else 0: such a seat's card is the Ask Ooga To Move button. Optional: without it no seat offers it.
  const create = (action, select, faceFor, emote, hud, npcAt = null) => {
    const el = document.getElementById("poker"), lobby = document.getElementById("poker-panel"), edge = el.querySelector(".panel-edge");
    const fields = Object.create(null);
    for (const node of el.querySelectorAll("[data-poker]")) fields[node.dataset.poker] ??= node;
    const by = name => fields[name];
    const focus = by("focus"), seatRoot = el.querySelector(".poker-seats"), rows = [], seats = [];
    const era = BL.pokerTableHud.create(el), themes = BL.pokerTableHud.tables;
    const board = by("board"), hand = by("hand"), status = by("status"), notice = by("notice"), floorNotice = by("floor-notice");
    const amount = by("amount"), slider = by("slider"), controls = by("controls"), raiseButton = by("raise");
    const presets = Array.from(el.querySelectorAll("[data-poker-size]"));
    const auto = el.querySelector('[data-poker-option="auto"]'), sound = el.querySelector('[data-poker-option="sound"]');
    const history = Array.from({ length: 10 }, () => []), recorded = new Int32Array(10);
    const soundChannel = BL.sound.channel("poker");
    let snapshot = null, lastIndex = -1, lastHand = -1, turnKey = "", focused = false, paused = false, audio = null, lastClock = null, lastHistory = "";
    let live = null;
    let filter = "all", viewBusy = false, lastLog = "", viewerId = null;
    const filterButtons = Array.from(el.querySelectorAll("[data-poker-filter]"));
    const dealer = el.querySelector(".poker-dealer"), endDeal = () => { dealTimer = 0; dealer.removeAttribute("data-dealing"); };
    let dealTimer = 0;
    const make = (tag, className, parent) => { const n = document.createElement(tag); if (className) n.className = className; if (parent) parent.appendChild(n); return n; };
    for (let i = 0; i < 10; i++) {
      const b = make("button", "poker-table-row", by("tables")); b.type = "button"; b.dataset.watch = i;
      const title = make("strong", "", b), info = make("span", "", b), state = make("small", "", b);
      const dots = make("div", "poker-seat-dots", b); dots.setAttribute("aria-hidden", "true");
      for (let j = 0; j < R.SEATS; j++) make("i", "", dots);
      title.textContent = String(i + 1).padStart(2, "0") + " · " + themes[i][0]; rows.push({ b, info, state, dots, open: true, playing: false });
    }
    for (let i = 0; i < R.SEATS; i++) {
      const wrapper = make("div", "poker-seat", seatRoot), b = make("button", "poker-seat-button", wrapper);
      b.type = "button"; b.dataset.seat = i; b.dataset.seatNumber = i + 1;
      // The seated character's face, painted only when the character at the seat changes.
      const face = make("canvas", "poker-face", b); face.width = face.height = 96; face.hidden = true; face.setAttribute("aria-hidden", "true");
      const badge = make("span", "poker-position", b), name = make("strong", "poker-player", b), stack = make("span", "poker-stack", b), last = make("small", "poker-last-action", b);
      // On a computer opponent's seat the card asks it to move: this line says so.
      const ask = make("small", "poker-ask", b); ask.hidden = true;
      const cards = make("div", "poker-seat-cards", wrapper), bet = make("span", "poker-bet", wrapper);
      // An emote the seat's player sent, over the face; the scene times it and clears it.
      const emoteNode = make("span", "poker-seat-emote", wrapper); emoteNode.setAttribute("aria-hidden", "true"); emoteNode.hidden = true;
      seats.push({ wrapper, b, face, faceKey: "", badge, name, stack, last, ask, npc: 0, cards, bet, emote: emoteNode, emoji: "" });
    }
    // The emote menu is static markup, so its ten buttons are built on the page's first visit and kept.
    const emoteButtons = Array.from(el.querySelectorAll('[data-poker="emote"]')), emoteMenu = by("emote-menu");
    if (!emoteMenu.firstChild) for (const e of BL.pokerEmotes.EMOTES) {
      const b = make("button", "", emoteMenu); b.type = "button"; b.dataset.emote = e.id;
      const glyph = make("span", "poker-emote-glyph", b); glyph.textContent = e.emoji; glyph.setAttribute("aria-hidden", "true");
      make("span", "", b).textContent = e.name;
    }
    let emoteOn = false, notSent = false;
    const emoteLabel = failed => {
      if (failed === notSent) return;
      notSent = failed;
      for (const b of emoteButtons) { b.textContent = failed ? "Not sent" : "Emote"; if (failed) b.setAttribute("aria-label", "Emote: not sent"); else b.removeAttribute("aria-label"); }
    };
    const closeEmoteMenu = () => {
      if (emoteMenu.hidden) return false;
      emoteMenu.hidden = true; for (const b of emoteButtons) b.setAttribute("aria-expanded", "false");
      return true;
    };
    const openEmoteMenu = () => { emoteLabel(false); emoteMenu.hidden = false; for (const b of emoteButtons) b.setAttribute("aria-expanded", "true"); };
    const setEmoteAvailable = on => {
      if (!!on === emoteOn) return;
      emoteOn = !!on; emoteLabel(false);
      for (const b of emoteButtons) b.hidden = !emoteOn;
      if (!emoteOn) closeEmoteMenu();
    };
    const pickEmote = id => {
      const sent = !!emote && emote(id);
      closeEmoteMenu(); if (!sent) emoteLabel(true);
    };
    // Each set, the same emoji again included, swaps the animation's name, which restarts the pop and fade.
    const showEmote = (seat, emoji) => {
      const n = seats[seat];
      if (!n || !emoji && !n.emoji) return;
      if (emoji !== n.emoji) { n.emoji = emoji; n.emote.textContent = emoji; n.emote.hidden = !emoji; }
      if (emoji) n.emote.dataset.beat = n.emote.dataset.beat === "a" ? "b" : "a";
    };
    if (hud) { window.addEventListener("pointerdown", notePress, true); hud.dismissOutside(emoteMenu, () => { if (!pressOnEmote) closeEmoteMenu(); pressOnEmote = false; }); }
    const potRoot = by("pot-chips"), chipStacks = [], chipHeights = [0, 0, 0], chipScratch = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const stack = make("span", "poker-chip-stack", potRoot);
      for (let j = 0; j < 8; j++) make("i", "", stack).hidden = true;
      chipStacks.push(stack);
    }
    const cards = (target, list, placeholders = false, reset = false) => {
      if (reset) target.replaceChildren();
      while (target.children.length > list.length) target.lastElementChild.remove();
      for (let i = 0; i < list.length; i++) {
        const c = list[i], key = c === null ? (placeholders ? "empty" : "back") : String(c);
        const n = target.children[i] || make("span", "poker-card", target);
        if (n.dataset.card === key) continue;
        n.dataset.card = key; n.className = key === "empty" ? "poker-card poker-card-slot" : "poker-card";
        n.setAttribute("role", "img"); n.setAttribute("aria-label", key === "empty" ? "Community card not dealt" : BL.pokerCards.label(c));
        n.replaceChildren();
        delete n.dataset.face; delete n.dataset.rank; delete n.dataset.suit; delete n.dataset.red;
        if (key !== "empty") n.appendChild(BL.pokerCards.svg(c));
        if (Number.isInteger(c)) {
          const face = R.cardName(c).replace(/^T/, "10");
          n.dataset.face = face; n.dataset.rank = face.slice(0, -1); n.dataset.suit = face.slice(-1);
          n.dataset.red = String(c >= 13 && c < 39);
        }
      }
    };
    const cue = kind => {
      if (!sound.checked || !audio || audio.state !== "running") return;
      // Short local synthesis: no media downloads or always-running nodes.
      const oscillator = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime;
      oscillator.type = "sine"; oscillator.frequency.setValueAtTime(kind === "turn" ? 660 : kind === "win" ? 880 : 260, now);
      oscillator.frequency.exponentialRampToValueAtTime(kind === "win" ? 1174 : 220, now + 0.11);
      gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.035, now + 0.008); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      oscillator.connect(gain); gain.connect(soundChannel.node(audio)); oscillator.start(now); oscillator.stop(now + 0.15);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    };
    const setAmount = (value, preset = "") => {
      const l = snapshot?.legal; if (!l?.canRaise) return;
      const n = Math.max(Math.min(l.min, l.max), Math.min(l.max, Math.round(Number(value) || 0)));
      amount.value = slider.value = String(n);
      raiseButton.textContent = `${snapshot.currentBet ? "Raise to" : "Bet"} ${chips(n)}${n === l.max ? " · All in" : ""}`;
      const own = snapshot.seats.find(p => p?.id === viewerId), extra = Math.max(0, n - (own?.roundBet || 0));
      by("bet-help").textContent = `Adds ${chips(extra)} chips · ${chips(Math.max(0, (own?.stack || 0) - extra))} left. Press ${snapshot.currentBet ? "Raise" : "Bet"} to send.`;
      slider.setAttribute("aria-valuetext", `${chips(n)} total this round, adds ${chips(extra)} chips`);
      for (const b of presets) b.setAttribute("aria-pressed", String(b.dataset.pokerSize === preset));
    };
    const noticeText = text => { if (notice.textContent !== text) notice.textContent = floorNotice.textContent = text; };
    const filterRows = () => {
      let count = 0;
      for (const row of rows) {
        row.b.hidden = filter === "open" ? !row.open : filter === "playing" ? !row.playing : false;
        if (!row.b.hidden) count++;
      }
      by("empty-list").hidden = count > 0;
      by("lobby-count").textContent = `${count} ${count === 1 ? "table" : "tables"}`;
      for (const b of filterButtons) b.setAttribute("aria-pressed", String(b.dataset.pokerFilter === filter));
    };
    let lobbySnapshots = null, lobbyIndex = -1, lobbyViewer = null, lobbyBlocked = false;
    const drawLobby = () => {
      if (!lobbySnapshots || focused || lobby.dataset.folded === "true") return;
      let changed = false;
      lobbySnapshots.forEach((table, i) => {
        const selected = i === lobbyIndex, disabled = lobbyBlocked || !!lobbyViewer && !selected;
        const row = rows[i], mine = !!lobbyViewer && selected;
        if (row.table === table && row.selected === selected && row.mine === mine && row.disabled === disabled) return;
        row.table = table; row.selected = selected; row.mine = mine; row.disabled = disabled;
        changed = true;
        const occupied = table.seats.filter(Boolean).length;
        row.open = occupied < R.SEATS && ["waiting", "showdown"].includes(table.phase) && (!live || ["idle", "complete", "aborted"].includes(table.fairPhase));
        row.playing = !["waiting", "showdown"].includes(table.phase) || !!live && !["idle", "complete", "aborted"].includes(table.fairPhase);
        row.info.textContent = `${occupied} / ${R.SEATS}`; row.state.textContent = row.open ? occupied ? "Join between hands" : "Start a table" : row.playing ? `${streetName[table.phase] === "Waiting for players" ? "Preparing hand" : streetName[table.phase]} · Watch` : "Table full · Watch";
        row.b.classList.toggle("selected", selected); row.b.classList.toggle("your-table", mine); row.b.disabled = disabled;
        for (let j = 0; j < R.SEATS; j++) row.dots.children[j].classList.toggle("occupied", !!table.seats[j]);
        row.b.setAttribute("aria-label", `Table ${i + 1}, ${themes[i][0]}, ${occupied} of ${R.SEATS} seats, ${row.state.textContent}`);
      });
      if (changed) filterRows();
    };
    const phone = matchMedia("(max-width: 720px), (pointer: coarse) and (max-width: 960px) and (max-height: 520px)"), sheet = el.querySelector(".poker-sheet");
    const compactLobby = matchMedia("(max-width: 720px), (pointer: coarse)");
    const sheetTitle = sheet.querySelector("h3"), content = sheet.querySelector(".poker-sheet-content");
    const betOpener = el.querySelector('[data-sheet="bet"]'), moved = [];
    const toolsNav = sheet.querySelector(".poker-sheet-nav"), panes = Array.from(sheet.querySelectorAll("[data-table-pane]"));
    let sheetKind = "", inspectedSeat = -1, sheetVersion = -1;
    const take = node => {
      const marker = document.createComment("table sheet");
      node.before(marker); moved.push([node, marker]); content.appendChild(node);
    };
    const closeSheet = () => {
      if (sheet.open) sheet.close();
      for (const [node, marker] of moved) marker.replaceWith(node);
      moved.length = 0; content.replaceChildren(); sheetKind = ""; inspectedSeat = -1;
    };
    const cancelSheet = e => { e.preventDefault(); closeSheet(); };
    const seatButtons = () => {
      closeSheet();
      if (!focused && compactLobby.matches) { lobby.dataset.folded = "true"; edge.setAttribute("aria-expanded","false"); }
      for (const node of seats) node.b.disabled = !phone.matches && !node.available;
    };
    sheet.addEventListener("cancel", cancelSheet);
    phone.addEventListener("change", seatButtons);
    const openSheet = (kind, seat = -1) => {
      if (!focused) return;
      const tool = panes.some(pane => pane.dataset.tablePane === kind);
      // Switching tools inside the dialog preserves its original focus-return target.
      if (!tool || !sheet.open || toolsNav.hidden) closeSheet();
      toolsNav.hidden = !tool;
      for (const pane of panes) pane.hidden = pane.dataset.tablePane !== kind;
      for (const tab of toolsNav.children) tab.setAttribute("aria-pressed", String(tab.dataset.sheet === kind));
      sheetKind = kind; inspectedSeat = seat; sheetVersion = snapshot.version;
      if (kind === "bet") {
        if (controls.hidden || raiseButton.disabled) { closeSheet(); return; }
        sheetTitle.textContent = snapshot.currentBet ? "Size your raise" : "Size your bet";
        take(el.querySelector(".poker-sizing")); take(by("bet-help")); take(raiseButton);
      } else if (kind === "seat") {
        const node = seats[seat];
        sheetTitle.textContent = snapshot.seats[seat]?.name || `Seat ${seat + 1}`;
        make("p","",content).textContent = [node.badge.textContent, node.stack.textContent + (snapshot.seats[seat] ? " chips" : ""),node.last.textContent].filter(Boolean).join(" · ");
        if (node.available) {
          const choose = make("button","poker-primary",content); choose.type="button"; choose.dataset.chooseSeat=seat;
          choose.textContent = node.npc ? "Ask Ooga to move" : "Take this seat";
        }
      } else {
        sheetTitle.textContent = "Table tools";
      }
      by("sheet-turn").hidden = !tool || el.dataset.yourTurn !== "true";
      if (!sheet.open) sheet.showModal();
      if (kind === "history") by("log").scrollTop = by("log").scrollHeight;
    };
    const leaveDialog = el.querySelector(".poker-leave"), leaveDetail = el.querySelector("#poker-leave-detail");
    if (hud) {
      hud.dismissOutside(sheet, closeSheet);
      hud.dismissOutside(leaveDialog, () => leaveDialog.close());
    }
    let leaveHand = -1;
    const requestWalk = () => {
      closeEmoteMenu();
      if (!viewerId) { action("walk"); return; }
      if (leaveDialog.open) return;
      leaveHand = snapshot.hand;
      el.querySelector("#poker-leave-title").textContent = "Leave " + themes[lastIndex][0] + "?";
      const active = live ? !["idle","complete","aborted"].includes(snapshot.fairPhase) : !["waiting","showdown"].includes(snapshot.phase);
      leaveDetail.textContent = active ? (live ? "Your next available turn folds. Keep this tab connected until the hand settles and your seat is released." : "Your remaining playable hand folds. The practice hand settles and your seat opens immediately.") + " Chips already all in stay in the pot." : "Your seat will open and you can join another table.";
      leaveDialog.showModal(); by("stay").focus();
    };
    const onClick = e => {
      const b = e.target.closest("button"); if (!b || b.disabled || !el.contains(b)) return;
      if (b.dataset.fold === "poker-panel") {
        const folded = lobby.dataset.folded === "true";
        edge.setAttribute("aria-expanded", String(!folded));
        if (!folded) drawLobby();
        (folded ? edge : lobby.querySelector(".panel-fold")).focus({preventScroll:true});
      } else if (b.dataset.poker === "stay") leaveDialog.close();
      else if (b.dataset.poker === "confirm-leave" && leaveDialog.open) {
        leaveDialog.close(); if (viewerId && snapshot.hand === leaveHand) action("depart");
      } else if (b.dataset.pokerAction === "walk") requestWalk();
      else if (b.dataset.poker === "tools") openSheet("history");
      else if (b.dataset.poker === "close-sheet") closeSheet();
      else if (b.dataset.sheet) openSheet(b.dataset.sheet);
      else if (b.dataset.chooseSeat !== undefined) {
        const seat = inspectedSeat, version = sheetVersion;
        if (seat >= 0 && seats[seat].available && version === snapshot.version) { closeSheet(); action(seats[seat].npc ? "ask" : "seat", seat, version); }
      } else if (b.dataset.seat !== undefined && phone.matches) openSheet("seat", Number(b.dataset.seat));
      else if (b.dataset.poker === "emote") { pressOnEmote = false; if (!closeEmoteMenu()) openEmoteMenu(); }
      else if (b.dataset.emote) pickEmote(b.dataset.emote);
      else if (b.dataset.watch !== undefined) select(Number(b.dataset.watch));
      else if (b.dataset.pokerFilter) { filter = b.dataset.pokerFilter; filterRows(); }
      else if (b.dataset.seat !== undefined) action(b.dataset.npc ? "ask" : "seat", Number(b.dataset.seat));
      else if (b.dataset.pokerSize) setAmount(betAmount(snapshot, b.dataset.pokerSize), b.dataset.pokerSize);
      else if (b.dataset.pokerAction) { noticeText(""); const version = sheetKind === "bet" ? sheetVersion : snapshot?.version; if (sheetKind === "bet") closeSheet(); action(b.dataset.pokerAction, Number(amount.value), version); }
    };
    const onInput = e => { if (e.target === slider) setAmount(slider.value); };
    const onChange = e => {
      if (e.target === by("audit-file")) {
        const file = e.target.files?.[0]; e.target.value = "";
        if (!file) return;
        if (file.size > 12 * 1024 * 1024) { noticeText("This record is too large."); return; }
        file.text().then(text => action("verify-file", JSON.parse(text))).catch(() => noticeText("That file is not a valid hand record."));
      } else if (e.target === amount) setAmount(amount.value);
      else if (e.target === auto) action("auto", auto.checked);
      else if (e.target === sound && sound.checked) {
        try {
          const Audio = window.AudioContext || window.webkitAudioContext;
          if (!Audio) throw new Error("Sound is unavailable in this browser");
          if (!audio) audio = new Audio();
          audio.resume().then(() => cue("turn")).catch(() => { sound.checked = false; noticeText("Sound could not start. You can keep playing silently."); });
        } catch (error) { sound.checked = false; noticeText(error.message); }
      }
    };
    el.addEventListener("click", onClick); el.addEventListener("input", onInput); el.addEventListener("change", onChange);
    const setFocused = value => {
      // Returning to the floor gives Space back to the walker.
      const leaving = focused && !value;
      focused = !!value; focus.hidden = !focused; lobby.hidden = edge.hidden = focused;
      // The emote menu goes with the table view, however it was left (Walk the floor from the keyboard presses nothing outside it).
      if (!focused) { if (leaveDialog.open) leaveDialog.close(); closeEmoteMenu(); closeSheet(); }
      else if (snapshot && lastIndex >= 0) era.update(lastIndex,true);
      el.dataset.tableView = String(focused);
      if (focused) { document.body.dataset.pokerTableView = "true"; by("title").focus({ preventScroll: true }); }
      else { document.body.removeAttribute("data-poker-table-view"); lobby.dataset.folded = String(compactLobby.matches); edge.setAttribute("aria-expanded", String(!compactLobby.matches)); drawLobby(); if (leaving) document.getElementById("scene").focus({ preventScroll: true }); }
    };
    const update = (index, snapshots, viewer, pendingStand, isPaused, autoDeal) => {
      const previous = snapshot, switched = index !== lastIndex;
      const s = snapshot = snapshots[index], ownIndex = s.seats.findIndex(p => p?.id === viewer), own = s.seats[ownIndex], legal = s.legal;
      if (sheet.open && (switched || (sheetKind === "bet" || sheetKind === "seat") && (sheetVersion !== s.version || viewBusy || live?.busy || live && live.connection !== "live" || isPaused || pendingStand))) closeSheet();
      era.update(index,focused);
      if (leaveDialog.open && (switched || !own || leaveHand !== s.hand)) leaveDialog.close();
      viewerId = viewer;
      by("voice-label").textContent = `Table ${index + 1} voice · spectators welcome`;
      const blocked = viewBusy || !!live && (live.busy || live.connection !== "live");
      paused = isPaused; const idle = (s.phase === "waiting" || s.phase === "showdown") && (!live || ["idle", "complete", "aborted"].includes(s.fairPhase)), fresh = switched || s.hand !== lastHand;
      snapshots.forEach((table, i) => {
        if (table.result && table.hand !== recorded[i]) {
          recorded[i] = table.hand;
          history[i].unshift(`Hand #${table.hand} · ${resultText(table)} · Board: ${table.board.map(R.cardName).join(" ") || "no community cards"}`);
          if (history[i].length > 12) history[i].pop();
        }
      });
      lobbySnapshots = snapshots; lobbyIndex = index; lobbyViewer = viewer; lobbyBlocked = blocked;
      drawLobby();
      by("title").textContent = `${themes[index][0]}`;
      by("edition").textContent = `Table ${String(index + 1).padStart(2,"0")} · Banana Club`;
      status.textContent = "No-limit Hold’em · blinds 5 / 10";
      by("hand-number").textContent = s.hand ? `#${s.hand}` : "Not dealt";
      by("seat-count").textContent = `${s.seats.filter(Boolean).length} / ${R.SEATS} seated`;
      by("private-label").textContent = own ? "YOUR HAND" : "WATCHING THE TABLE";
      by("return").hidden = !viewer; by("return").disabled = pendingStand;
      by("return-label").textContent = `Your seat · Table ${String(index + 1).padStart(2, "0")}`;
      by("floor-turn").textContent = pendingStand ? "Leaving when the live hand settles" : blocked ? live?.connection === "failed" ? "Reconnect to recover your seat" : "Waiting for the table to confirm…" : legal ? "Your turn — return to act" : own?.folded ? "You folded · the hand continues" : own?.stack === 0 && own.inHand ? "All in · waiting for the result" : idle ? "Ready for the next hand" : "Your seat is waiting for you";
      el.dataset.yourTurn = String(!!legal && !paused && !pendingStand && !blocked);
      by("pot-label").textContent = s.result ? "LAST POT" : "TOTAL POT";
      by("pot").textContent = chips(s.result ? s.lastPot : s.pot);
      potChips(s.result ? s.lastPot : s.pot, chipScratch);
      for (let i = 0; i < 3; i++) {
        if (chipScratch[i] === chipHeights[i]) continue;
        chipHeights[i] = chipScratch[i];
        for (let j = 0; j < 8; j++) chipStacks[i].children[j].hidden = j >= chipHeights[i];
      }
      const community = s.board.slice(); while (community.length < 5) community.push(null);
      cards(board, community, true, fresh); cards(hand, own?.cards.length ? own.cards : [null, null], !own?.cards.length, fresh);
      by("street").textContent = streetName[s.phase];
      by("balance").textContent = own ? `${chips(own.stack)} chips` : "You’re spectating";
      by("hand-name").textContent = own?.cards.length === 2 && own.cards.every(Number.isInteger) && s.board.length >= 3 && s.board.every(Number.isInteger) ? `${own.folded ? "Folded · " : ""}${R.evaluate(own.cards.concat(s.board)).name}` : own ? "Your private cards" : "Take a seat to play";
      for (let i = 0; i < R.SEATS; i++) {
        const p = s.seats[i], node = seats[i], winner = !!p?.inHand && !!s.result?.pots.some(pot => !pot.refund && pot.winners.includes(i));
        node.wrapper.dataset.position = position(i, ownIndex);
        node.wrapper.classList.toggle("turn", !paused && i === s.turn);
        node.wrapper.classList.toggle("yours", i === ownIndex);
        node.name.classList.toggle("self-named", i === ownIndex && p?.name === "You");
        node.wrapper.classList.toggle("folded", !!p?.folded);
        node.wrapper.classList.toggle("winner", winner);
        node.wrapper.classList.toggle("empty", !p);
        const f = faceFor(i, p);
        if ((f ? f.key : "") !== node.faceKey) { node.faceKey = f ? f.key : ""; node.face.hidden = !f; if (f) f.paint(node.face); }
        node.name.textContent = p ? `${p.name}${p.bot && !/^Bot \d+$/.test(p.name) ? " · Bot" : ""}` : `Seat ${i + 1}`;
        node.stack.textContent = p ? chips(p.stack) : idle && !viewer ? "Sit here" : "Open";
        node.last.textContent = !p ? "" : winner ? `+${chips(s.result.awards[i])} collected` : p.folded ? "Folded" : p.inHand && !p.stack ? "All in" : p.lastAction || (i === s.turn ? "Thinking" : "");
        node.badge.textContent = p && s.hand ? [i === s.dealer ? "D" : "", i === s.smallBlind ? "SB" : "", i === s.bigBlind ? "BB" : ""].filter(Boolean).join(" · ") : "";
        node.badge.hidden = !node.badge.textContent;
        const npc = npcAt ? npcAt(index, i) : 0;
        if (npc !== node.npc) {
          node.npc = npc; node.ask.hidden = !npc; node.ask.textContent = npc === 2 ? "Moves after this hand" : npc ? "Ask Ooga To Move" : "";
          node.wrapper.classList.toggle("npc", !!npc);
          if (npc) node.b.dataset.npc = String(npc); else delete node.b.dataset.npc;
        }
        node.available = npc ? npc !== 2 && !blocked : !p && !viewer && idle && !paused && !blocked;
        node.b.disabled = !phone.matches && !node.available;
        node.b.setAttribute("aria-label", phone.matches ? `Seat ${i+1} · ${p?.name || "Open"} · Details` : npc ? `Ask ${p ? p.name : "the guest at seat " + (i + 1)} to move${npc === 2 ? ", after this hand" : ""}` : p ? `${p.name}, ${chips(p.stack)} chips${i === s.turn ? ", acting now" : ""}${p.lastAction ? ", " + p.lastAction : ""}` : `Take seat ${i + 1}`);
        cards(node.cards, p?.inHand && !p.folded && i !== ownIndex ? p.cards : [], false, fresh);
        node.bet.textContent = p?.roundBet ? chips(p.roundBet) : ""; node.bet.hidden = !p?.roundBet;
      }
      by("join").hidden = !!viewer; by("join").disabled = !idle || s.seats.every(Boolean) || paused || blocked;
      by("bots").disabled = !idle || s.seats.every(Boolean) || s.seats.filter(p => p?.bot).length >= BL.pokerCarry.NPC_MAX || paused || blocked;
      by("start").hidden = !own && !!live;
      by("start").disabled = !idle || s.seats.filter(p => p && p.stack > 0).length < 2 || paused || blocked || !!live && !own;
      by("start").textContent = s.hand ? "Deal next hand" : "Deal hand";
      by("refill").hidden = !own || !idle || own.stack >= R.BUY_IN; by("refill").disabled = paused || blocked;
      by("refill").textContent = own ? `Refill to ${chips(R.BUY_IN)} · free` : "Free refill";
      by("stand").hidden = !viewer; by("stand").disabled = pendingStand || blocked || !!live && !idle;
      by("stand").textContent = pendingStand ? "Leaving after hand" : idle ? "Leave seat" : live ? "Leave between hands" : "Leave after this hand";
      by("setup").hidden = !idle;
      controls.hidden = !legal || pendingStand || paused;
      const key = legal ? `${index}:${s.hand}:${s.phase}:${s.version}` : "";
      if (legal) {
        by("fold").disabled = by("call").disabled = blocked;
        by("call").textContent = legal.check ? "Check" : `Call ${chips(legal.call)}${legal.call === own.stack ? " · All in" : ""}`;
        betOpener.textContent = s.currentBet ? "Raise…" : "Bet…";
        betOpener.disabled = raiseButton.disabled = amount.disabled = slider.disabled = !legal.canRaise || blocked;
        for (const b of presets) b.disabled = !legal.canRaise || blocked;
        amount.min = slider.min = String(Math.min(legal.min, legal.max)); amount.max = slider.max = String(legal.max);
        by("range").textContent = s.currentBet ? "Raise to" : "Bet";
        if (legal.canRaise && key !== turnKey) setAmount(betAmount(s, "min"), "min");
        if (!legal.canRaise) { raiseButton.textContent = "Raise unavailable"; amount.value = slider.value = String(legal.max); by("bet-help").textContent = "You can call or fold. Raising is not available for this action."; }
      }
      const turnText = paused ? "Demo paused · resume when ready" : pendingStand ? "Walking · your remaining turns check or fold" : legal ? `Your turn · ${legal.check ? "check for free or bet" : chips(legal.call) + " to call"}` : idle ? own?.stack === 0 ? "Out of chips? Your refill is free." : s.result ? "Hand complete" : "Take a seat, add bots, deal a hand" : own?.folded ? "You folded · watching the hand" : own?.inHand && !own.stack ? "You’re all in · waiting for the result" : `${s.seats[s.turn]?.name || "Dealer"} to act`;
      const turnLabel = blocked ? live?.connection === "failed" ? "Connection stopped" : live?.connection === "reconnecting" ? "Reconnecting to your table…" : live?.busy ? "Sending your move…" : "Connecting to live tables…" : live && !["idle", "complete", "betting"].includes(s.fairPhase) ? fairName[s.fairPhase] || "Preparing the hand" : live && idle && !s.result ? own ? "Ready when you are" : "There’s a seat for you" : turnText;
      if (by("turn").textContent !== turnLabel) by("turn").textContent = turnLabel;
      if (by("sheet-turn-label").textContent !== turnLabel) by("sheet-turn-label").textContent = turnLabel;
      by("sheet-turn").hidden = toolsNav.hidden || el.dataset.yourTurn !== "true";
      by("turn").classList.toggle("is-yours", !!legal && !paused && !blocked);
      by("turn-help").textContent = blocked ? live?.connection === "failed" ? "Reconnect to recover your seat on this device." : "Your next action unlocks when the table confirms this one." : legal ? legal.check ? "Checking keeps you in the hand for free." : "Call to match the bet, choose a raise, or fold this hand." : pendingStand ? "Your seat releases when this hand ends." : idle ? !own ? "Take any open seat. Everyone starts with 1,000 free chips." : s.seats.filter(p => p && p.stack > 0).length < 2 ? live ? "One more player is needed. Anyone seated can deal." : "Add opponents, then deal when you’re ready." : "Deal when the table is ready. Nobody owns the table." : own?.folded ? "You can watch or walk. Live players must stay connected." : !own ? "Watch this hand. Seats open when it finishes." : "Stay connected. You’ll be told when it’s your turn.";
      by("result").hidden = !s.result; by("result").textContent = resultText(s);
      const log = s.history.slice(-8).join("\n") || "The gorilla is ready. Take a seat to begin.";
      if (log !== lastLog) { by("log").textContent = log; by("log").scrollTop = by("log").scrollHeight; lastLog = log; }
      const historyKey = `${index}:${recorded[index]}`;
      if (historyKey !== lastHistory) {
        by("history").replaceChildren();
        if (!history[index].length) make("li", "", by("history")).textContent = "Completed hands will appear here.";
        for (const item of history[index]) make("li", "", by("history")).textContent = item;
        lastHistory = historyKey;
      }
      auto.checked = autoDeal;
      by("pause").textContent = paused ? "Resume practice" : "Pause practice"; by("pause").setAttribute("aria-pressed", String(paused));
      // A new hand at the table shown, not one met by switching tables or on the visit's first update: the dealer deals.
      if (!switched && previous && s.hand !== lastHand) { clearTimeout(dealTimer); dealer.dataset.dealing = ""; dealTimer = setTimeout(endDeal, 700); }
      if (!paused && !switched && previous) {
        if (s.result && !previous.result) cue("win");
        else if (legal && !previous.legal) cue("turn");
        else if (s.hand !== lastHand || s.board.length !== previous.board.length) cue("deal");
      }
      turnKey = key; lastHand = s.hand; lastIndex = index; lastClock = null;
    };
    const countdown = (seconds, enabled) => {
      const text = live ? seconds < 0 ? "" : seconds === 0 ? "Waiting for table update" : `Table timer · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : paused ? "Practice paused" : enabled && snapshot?.result ? `Next hand in ${seconds}s` : "";
      if (text !== lastClock) {
        by("countdown").textContent = text;
        by("sheet-clock").textContent = live && text ? " · " + text : "";
        lastClock = text;
      }
      by("countdown").hidden = !text;
      by("countdown").classList.toggle("urgent", !!live && seconds >= 0 && seconds <= 15);
    };
    const setLive = value => {
      // Joining or leaving the live tables swaps every table's state, so the next update counts as a switch: no deal.
      // So does coming back live after connecting, reconnecting or a stopped connection's retry, which brings a new session.
      if (!value !== !live || value && value.connection === "live" && live?.connection !== "live") lastIndex = -1;
      live = value; by("fairness").hidden = !live;
      const connection = viewBusy ? "connecting" : live?.connection || "practice";
      el.dataset.connection = connection;
      by("mode-badge").textContent = live ? "LIVE TABLE" : "PRACTICE";
      by("connection").textContent = connection === "practice" ? "Practice · on your device" : connection === "failed" ? "Connection stopped" : connection === "reconnecting" ? "Reconnecting · waiting for table" : connection === "connecting" ? "Connecting to live tables…" : ["betting", "complete"].includes(live.phase) ? "Connected · shuffle checked" : "Connected · " + (fairName[live.phase] || "waiting for players");
      by("reconnect").hidden = connection !== "failed";
      by("reconnect-floor").hidden = connection !== "failed";
      by("connect").hidden = !!live; by("practice").hidden = !live;
      by("forget").hidden = !live?.recoverable;
      by("nickname").disabled = !!live?.recoverable;
      by("connect").disabled = viewBusy;
      el.querySelector('[data-poker-action="quick"]').disabled = viewBusy;
      by("practice").disabled = viewBusy || !!live?.busy;
      by("live-label").textContent = viewBusy ? "Connecting to the live floor…" : live?.recoverable ? "Live tables · your Ooga name · recovery saved here" : live ? "Live tables · free chips · human opponents" : "Practice is ready now. Live tables need a connected poker service.";
      by("bots").hidden = by("pause").hidden = !!live; auto.parentElement.hidden = !!live;
      el.querySelector('[data-poker-action="quick"]').hidden = !!live;
      if (live) {
        by("fair-status").textContent = `${fairName[live.phase] || "Connecting"}${live.total ? ` · ${live.checked}/${live.total} shuffles checked` : ""}`;
        by("proof-root").textContent = live.root ? "Record fingerprint: " + live.root : "";
        by("verify").disabled = by("export").disabled = !live.exportable || live.busy || connection !== "live";
      }
    };
    // Ask Ooga To Move's bar while the visitor's Ooga holds a guest overhead: what the aim says and the keys, written
    // only when they change; null hides it.
    const carryBar = by("carry"), carryHint = by("carry-hint"), carryKeys = by("carry-keys"), throwButton = el.querySelector('[data-poker-action="throw"]');
    const carry = (hint, keys = "", ready = false) => {
      carryBar.hidden = hint === null;
      if (hint === null) return;
      if (carryHint.textContent !== hint) carryHint.textContent = hint;
      if (carryKeys.textContent !== keys) carryKeys.textContent = keys;
      throwButton.disabled = !ready;
    };
    // The lounge playlist's "now playing" line (a tap opens the credits); null hides it.
    const nowLine = by("now-playing");
    const nowPlaying = text => { nowLine.hidden = text === null; if (text !== null && nowLine.textContent !== text) nowLine.textContent = text; };
    // The dealer's face, painted once a visit from the room's own gorilla (every table's dealer looks the same).
    const setDealer = agent => BL.hud.renderFaceIcon(by("dealer-face"), null, agent, 144);
    return { update, countdown, requestWalk, setFocused, setLive, setDealer, setEmoteAvailable, closeEmoteMenu, showEmote, carry, nowPlaying, setConnecting(value) { viewBusy = !!value; setLive(live); }, notice: noticeText, get focused() { return focused; }, dispose() {
      if (leaveDialog.open) leaveDialog.close(); closeSheet(); phone.removeEventListener("change",seatButtons); sheet.removeEventListener("cancel",cancelSheet);
      delete el.dataset.pokerEra;
      carry(null); nowPlaying(null);
      clearTimeout(dealTimer); endDeal();
      closeEmoteMenu(); for (let i = 0; i < seats.length; i++) showEmote(i, "");
      emoteOn = false; emoteLabel(false); for (const b of emoteButtons) b.hidden = true;
      if (hud) window.removeEventListener("pointerdown", notePress, true);
      el.removeEventListener("click", onClick); el.removeEventListener("input", onInput); el.removeEventListener("change", onChange);
      by("tables").replaceChildren(); seatRoot.replaceChildren(); board.replaceChildren(); hand.replaceChildren(); potRoot.replaceChildren(); by("history").replaceChildren();
      el.removeAttribute("data-your-turn"); el.removeAttribute("data-connection");
      sound.checked = false; setFocused(false); soundChannel.release(); if (audio) { audio.close().catch(() => {}); audio = null; }
    } };
  };
  // The lounge music's credits as one board for `hud.openBoard`, on the statues' placard pattern: a page a track with
  // its three attribution lines (poker-audio.js's `credits`) and the encoding note. Made once a page.
  const PAGE_W = 480, PAGE_H = 270, MARGIN = 28, TITLE_SCALE = 3, LINE_SCALE = 2;
  const CREDIT_NOTE = "Re-encoded to AAC at 96 kbps; nothing cut or mixed";
  let credits = null;
  const wrapLine = (text, width, scale) => {
    const font = BL.jumbotronFont, lines = [];
    let line = "";
    for (const word of text.split(" ")) {
      const next = line ? line + " " + word : word;
      if (line && font.measureText(next, scale) > width) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  const paintCredit = b => {
    const font = BL.jumbotronFont, c2 = b.canvas.getContext("2d"), width = PAGE_W - 2 * MARGIN, [title, licence, url] = b.lines[b.index].split("\n");
    c2.fillStyle = "#efe9dd"; c2.fillRect(0, 0, PAGE_W, PAGE_H);
    c2.strokeStyle = BL.pokerMarble.BRASS; c2.lineWidth = 5; c2.strokeRect(9, 9, PAGE_W - 18, PAGE_H - 18);
    let y = 30;
    const draw = (lines, scale, color, gap) => { for (const line of lines) { font.drawText(c2, line, MARGIN, y, color, scale); y += font.GLYPH_H * scale + 6; } y += gap; };
    // The alphabet has no double quote: the title's quotes are set as single ones. The link breaks wherever a line is full.
    draw(wrapLine(title.replace(/"/g, "'"), width, TITLE_SCALE), TITLE_SCALE, "#2a2420", 10);
    draw(wrapLine(licence, width, LINE_SCALE), LINE_SCALE, "#4a3f34", 8);
    const per = Math.floor((width + font.TRACKING * LINE_SCALE) / ((font.GLYPH_W + font.TRACKING) * LINE_SCALE)), link = [];
    for (let k = 0; k < url.length; k += per) link.push(url.slice(k, k + per));
    draw(link, LINE_SCALE, "#4a3f34", 8);
    draw(wrapLine(CREDIT_NOTE, width, LINE_SCALE), LINE_SCALE, "#6b5a46", 0);
  };
  const creditsBoard = lines => {
    if (credits) return credits;
    const canvas = document.createElement("canvas");
    canvas.width = PAGE_W; canvas.height = PAGE_H;
    const b = credits = {
      title: "Lounge music", help: "Tracks playing in the Ember Den. Arrow keys page through them.", lines, count: lines.length, index: 0, version: 0, canvas,
      get caption() { return lines[b.index].split("\n")[0]; },
      get note() { return CREDIT_NOTE; },
      go(i) { const n = Math.max(0, Math.min(lines.length - 1, Math.round(i))); if (n === b.index && b.version) return; b.index = n; paintCredit(b); b.version++; }
    };
    paintCredit(b); b.version = 1;
    return b;
  };
  BL.pokerHud = { create, betAmount, potChips, position, resultText, creditsBoard, CREDIT_NOTE };
})();
