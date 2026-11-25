// Hosted chats' views (docs/ooga-chat-hosts.md), Ooga Chat's and the island's alike, so the two apps never drift:
// Ooga Chat's Ooga Chat tab (ooga-chat-hosts.js, in its deferred `hosts` chunk) and the island's cloud tab
// (cloud-panel.js) each hand `create` their panel and what only they know. Reads nothing at load but window.BL.
// `create({ node, head, space, chats, joinVoice, faceOf, startZone, toast, shown, rowFace, speakNow })`: `node` the
// panel, `head` its title, after which the chat's bar, notice line and list go; `space` the panel's roster
// (`parts.list`, `parts.footRow`, and the footer's `parts.foot.join`, `.mute` and `.actions`) and `setMenu(fn)`, the
// tiles' menu hook; `chats` the page's `{ list(), start(body), preview(id), open(entry), leave(), request(type,
// fields), hear(fn) }`; `joinVoice()` its Join Voice, called inside Start speaking's press; `faceOf(character)` a
// portrait's address; `startZone()` the zone Start a chat chooses first; `toast(text)` the page's own announced toast,
// if it has one; `shown()` whether the panel can be seen now; `rowFace(row)` a preview tile's portrait; `speakNow`
// whether Request to speak reads Speak now on an open stage; `goThere`, `{ state(room), press(), subscribe(fn) }`: Go
// there on the island view (the island's: its Ooga onto the chat's island, Go back while there, chat-copy.js; Ooga
// Chat's: the chat opened on the island, ooga-chat-hosts.js), `state` its `{ label, words, disabled, title }` or null for none; `islandView`, `{ picture, loadLive(), island(), storageKey }`, the island view's
// map picture, how the page brings Live view's code, the island it built already (the island page's) and where the
// viewer's Live view choice is kept (island-view.js). `update(state)` takes the page's state in Ooga Chat's
// shape: `session.identity` (`provider`, `display`, `login`, `participant`), `room` (the chat chosen, with its
// `you`), `voice` (`role`, `busy`, `elsewhere`), `device.online` and `audience.list` (the chat's rows in order);
// `preview(entry, from)` opens a chat's preview from elsewhere on the page (an entry as `parseList` gives it). It adds:
// - the Chats list (shown while signed in and no chat is chosen; signing out also closes a preview or Start a chat and
//   forgets the chats read): the live chats as the server orders them, busiest first, a list of
//   buttons, each its title, zone, host and counts; read when shown and every LIST_MS at most while it stays shown and
//   the page is visible (no timer otherwise). A chat pressed opens its preview, a modal pop-up: its title, zone and an
//   Open stage tag, its stage as the chat's circles (`rowFace(row)` their portraits) to look at only, and how many listen
//   and wait, read as it opens and every PREVIEW_MS while it stays open; a chat gone closes it, saying so. Join as
//   listener (the amber one) or Ask to speak (Join as speaker on an open stage), which asks once the chat's snapshot is here: on an open stage the
//   invite that answers it goes straight on to Join Voice (the visitor's own press), the invite card showing only if that
//   could not start; Start a chat for a GitHub account, one dialog (`startDialog`): a title
//   prefilled "<name>'s chat", three picture cards for the land, Voice only first (`startZone()` chosen first), Start chat and Cancel, with
//   the server's refusal in words;
// - in a chat: Back to chats and its title; for a host or co-host the Requests chip, in the panel's title right of the
//   zone tag, and its pop-up: the queue, then who was removed with Allow back (`allow`, the server's `removed` list); the footer's
//   Request to speak (Requested · Cancel; `speakNow`, the island's, reads Speak now on an open stage) where a listener
//   read Join Voice, End chat for its host, Leave chat for everyone (Sign out waits in the other tabs while in a chat); Unmute only for a
//   speaker or one who may speak; the Requests chip without a count while none wait; an Open stage tag beside the title, and in the Requests
//   pop-up the host's switch for it (`open`);
//   the invite card, focused as it opens, Start speaking being Join Voice inside its press; the co-host offer card
//   (Accept, then Join Voice off stage; Not now), again when a co-host left the stage; and a tile's menu, opened by
//   a press on its portrait or Enter or Space on the focused tile, offering what the viewer's rank allows over that
//   participant (`actionsFor`);
// - one polite live region (`.hc-chat-notice`, or the page's toast) for every notice and refused request, in words
//   (`noticeText`), a burst of requests joined into one line at most every ASKED_MS, nothing said twice.
// - the island view (island-view.js) in `.hc-room-strip` over the roster, in every Main Island chat: the island standing
//   still, and each speaker walking the chat's copy of it (a row's `walking`) where they stand, with Go there over it.
//   The chat is asked for walkers' places (`{ type: "view", on: true }`) only while someone walks, the panel is shown
//   and the page is visible, and told `on: false` as that ends; a new connection asks again. Its `walk` frames come
//   through `chats.hear`.
// Pop-ups (a tile's menu, the queue, a confirmation) are one wood-framed box, a sheet at the screen's foot under 400px;
// the look is chat-hosts.css. The pure parts (`parseList`, `actionsFor`, `noticeText`, `joinNames`) need no document.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // A small builder (tag, class, then text or nodes), a button, and writes made only on a change, as the panels do.
  const make = (tag, className, ...children) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    for (const child of children) el.append(child);
    return el;
  };
  const button = (className, text) => { const el = make("button", className, text); el.type = "button"; return el; };
  const set = (el, key, value) => { if (el[key] !== value) el[key] = value; };
  const attr = (el, key, value) => { if (el.getAttribute(key) !== value) el.setAttribute(key, value); };
  // Text a person chose, without control or direction-override characters, bounded (ooga-chat-config.js `clean`).
  const clean = (text, max) => typeof text === "string" ? text.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, max) : "";
  // A chat's land: `none` is Ooga Chat voice alone, whose roster's frames name the `main` zone (`rosterZone`).
  // Voice only first, as the maintainer asked: the card Start a chat lists first, and chosen first where the page has
  // no land of its own to offer (Ooga Chat); the island chooses the land its Ooga stands in.
  const ZONES = ["none", "main", "dsb"];
  const ZONE_NAMES = { none: "Voice only", main: "Main Island", dsb: "DSB Land" };
  const rosterZone = (land) => (land === "dsb" ? "dsb" : "main");
  // Main Island's mark for the zone cards, drawn as DSB Land's is (native-icons.js `dsb`): a floating isle on the sea,
  // its grass, a cave mouth, a palm and the banana pile. Kept here, in the deferred chunk, off the first load.
  const MAIN_ISLAND = [
    ["#195c78", "m3 30 9-8 30-6 18 12-5 11-23 7-24-6z"],
    ["#8a6a45", "m7 28 12-9 14-5 14 3 11 10-6 8-21 7-20-7z"],
    ["#639922", "m10 27 11-7 12-4 12 3 9 8-5 6-18 6-17-6z"],
    ["#97c459", "m15 25 9-5 9-2 9 2 6 5-4 3-12 3-13-3z"],
    ["#4a3a2a", "M12 21h6v6h-6zM13 19h4v2h-4z"],
    ["#7a5a32", "M46 12h2v13h-2z"],
    ["#3b6d11", "M40 10h6v2h-6zM48 10h7v2h-7zM42 8h4v2h-4zM48 8h5v2h-5zM45 6h4v2h-4z"],
    ["#ef9f27", "M27 21h10v3H27zM29 19h6v2h-6zM31 17h2v2h-2z"],
    ["#fac775", "M29 21h2v1h-2zM33 20h2v1h-2z"],
    ["#69b6c5", "m8 39 22 6 22-7v2l-22 7-22-6z"],
  ];
  const mainIsland = () => {
    const ns = "http://www.w3.org/2000/svg", el = document.createElementNS(ns, "svg");
    el.setAttribute("viewBox", "0 0 64 48");
    el.setAttribute("aria-hidden", "true");
    for (const [fill, d] of MAIN_ISLAND) { const path = document.createElementNS(ns, "path"); path.setAttribute("d", d); path.setAttribute("fill", fill); el.append(path); }
    return el;
  };
  const LIST_MS = 10000, PREVIEW_MS = 5000, ASKED_MS = 5000, SHOWN_MS = 6000, TITLE_MAX = 60;
  const LEVEL = { host: 2, cohost: 1 };
  // Co-hosts and open co-host offers share these slots (docs/ooga-chat-hosts.md, Roles).
  const COHOST_SLOTS = 3, SLOTS_FULL = "All 3 co-host slots are taken";
  const count = (n) => Number.isSafeInteger(n) && n >= 0 ? n : 0;
  // One list entry as the server sends it (worker/src/chat-directory.js `list`), or null.
  const parseEntry = (raw) => {
    const host = raw?.host;
    if (!raw || typeof raw.id !== "string" || !/^[\w-]{16}$/.test(raw.id) || !ZONES.includes(raw.zone)) return null;
    if (!host || typeof host.login !== "string" || !/^[\w.-]{1,39}$/.test(host.login)) return null;
    return { id: raw.id, title: clean(raw.title, TITLE_MAX) || "Untitled chat", zone: raw.zone, startedAt: count(raw.startedAt),
      host: { login: host.login, display: clean(host.display, 50) || host.login, character: typeof host.character === "string" && /^[\w.-]{1,64}$/.test(host.character) ? host.character : null },
      speakers: count(raw.speakers), listeners: count(raw.listeners), open: raw.open === true };
  };
  // A chat's preview (`{ chat, stage, listeners, requests }`): its stage as roster rows (ooga-chat-roster.js) in the
  // chat's order, how many listen and wait, and whether its stage is open; null when it isn't one.
  const parsePreview = (raw) => {
    if (!raw || typeof raw !== "object" || !raw.chat || typeof raw.chat !== "object" || !Array.isArray(raw.stage)) return null;
    const rows = raw.stage.slice(0, 64).map((r) => BL.oogaChatRoster.parseParticipant(r)).filter(Boolean);
    return { open: raw.chat.open === true, stage: order(rows), listeners: count(raw.listeners), requests: count(raw.requests) };
  };
  const parseList = (raw) => Array.isArray(raw) ? raw.slice(0, 50).map(parseEntry).filter(Boolean) : null;
  // What the viewer (`{ id, rank, slots }`, `slots` the co-hosts and open offers the chat holds) may do to a participant
  // row: only over someone they outrank, never themselves. The host offers co-hosting (an item `disabled` with its
  // `reason` while every slot is held), withdraws an offer, or makes a co-host a plain speaker (a plain listener if off stage).
  const actionsFor = (viewer, row) => {
    const mine = LEVEL[viewer.rank] || 0, theirs = LEVEL[row.rank] || 0, out = [];
    if (!row || row.id === viewer.id || !mine || mine <= theirs) return out;
    const speaker = row.role === "speaker";
    if (!speaker && row.request !== "invited" && row.request !== "cohost") out.push({ type: "invite", label: "Invite to speak" });
    if (speaker && !row.muted) out.push({ type: "mute", label: "Mute" });
    if (speaker) out.push({ type: "demote", label: "Move to listener" });
    if (viewer.rank === "host") {
      if (row.rank === "cohost") out.push({ type: "cohost", on: false, label: speaker ? "Make speaker" : "Make listener" }, { type: "handover", label: "Make host" });
      else if (row.request === "cohost") out.push({ type: "cohost", on: false, label: "Withdraw co-host invitation" });
      else out.push({ type: "cohost", on: true, label: "Make co-host", ...(viewer.slots >= COHOST_SLOTS ? { disabled: true, reason: SLOTS_FULL } : {}) });
    }
    out.push({ type: "remove", label: "Remove from chat", confirm: `Remove ${row.display} from this chat? They can't come back until it ends.` });
    return out;
  };
  // The server's list of who its hosts removed, `{ id, at, login, display }` each, earliest first; anything else dropped.
  const parseRemoved = (raw) => Array.isArray(raw) ? raw.slice(0, 500).filter((r) => r && typeof r.id === "string" && /^(gh|x):[1-9][0-9]{0,19}$/.test(r.id)
    && typeof r.login === "string" && /^[\w.-]{1,39}$/.test(r.login)).map((r) => ({ id: r.id, at: count(r.at), login: r.login, display: clean(r.display, 50) || r.login })) : [];
  // A chat's order (docs/ooga-chat-hosts.md), which the roster asks for (ooga-chat-roster.js `list`): the host, then
  // co-hosts by how long they have been one (`rankSince`), speakers by how long they have been on the stage (`since`),
  // listeners with an open request by how long it has waited (`askedAt`; an invite keeps its request's place), an invited
  // listener with no request's time, then the other listeners by how long they have been here (`since`); ties by name,
  // then id. Only a change to one of these moves a tile.
  const GROUP = (p) => p.rank === "host" ? 0 : p.rank === "cohost" ? 1 : p.role === "speaker" ? 2 : p.request && p.askedAt ? 3 : p.request === "invited" ? 4 : 5;
  const AT = [() => 0, (p) => p.rankSince, (p) => p.since, (p) => p.askedAt, (p) => p.since, (p) => p.since];
  const order = (participants) => [...participants].map((p) => [GROUP(p), p]).sort(([ga, a], [gb, b]) => ga - gb || AT[ga](a) - AT[ga](b)
    || (a.login.toLowerCase() < b.login.toLowerCase() ? -1 : a.login.toLowerCase() > b.login.toLowerCase() ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(([, p]) => p);
  const joinNames = (names) => names.length === 1 ? `${names[0]} asked to speak` : `${names[0]} and ${names.length - 1} other${names.length > 2 ? "s" : ""} asked to speak`;
  // A notice in words, for whoever it concerns (`me` the visitor's id, `nameOf(id)` a participant's name); "" says nothing.
  const noticeText = (n, me, nameOf) => ({
    not_now: () => `${nameOf(n.id)} said not now`,
    declined: () => "Your request wasn't accepted",
    expired: () => "The invite to speak lapsed",
    muted: () => "A host muted you",
    demoted: () => "A host moved you to listening",
    cohost: () => n.id === me ? "You're a co-host now" : `${nameOf(n.id)} is co-host now`,
    cohost_declined: () => `${nameOf(n.id)} said not now to co-hosting`,
    cohost_retracted: () => "The host withdrew the co-host invitation",
    uncohost: () => "You're no longer a co-host",
    host: () => n.id === me ? "You're the host now" : `${nameOf(n.id)} is the host now`,
    removed: () => "A host removed you from this chat",
    island: () => "Your chat moved to Ooga Booga Land",
    ended: () => "The chat ended"
  })[n.kind]?.() || "";
  const REFUSED = { cooldown: (s) => `You can ask again in ${s || 60} s`, rate_limited: (s) => s ? `Wait ${s} s, then try again` : "Wait a moment, then try again",
    queue_full: () => "Too many people are asking. Try again soon.", cohosts_full: () => SLOTS_FULL, not_offered: () => "That invitation has gone", not_asked: () => "That request is gone",
    not_speaking: () => "They aren't speaking now", already_allowed: () => "You may speak already: Join Voice", ended: () => "The chat ended",
    not_host: () => "Only a host can do that", not_allowed: () => "You can't do that here", not_removed: () => "They can join already" };
  const STARTS = { bad_title: () => "Give it a title of 1–60 characters.", zone_unavailable: () => "That place isn't open for chats.",
    already_hosting: () => "You're hosting a chat already.", rate_limited: (s) => `You started one a moment ago. Try again in ${s || 300} s.`,
    chats_full: () => "Every chat spot is taken. Try again soon.", capability_required: () => "Starting a chat is for Team Ooga Booga contributors.",
    auth_required: () => "Sign in again to start a chat." };

  // The Start a chat dialog: `open(name)` prefills the title, `close()`; `submit({ title, zone })` resolves to "" when the
  // chat started, else the words for why not. The zone cards are one radio group: a press or the arrow keys choose.
  // A button of several parts.
  const tap = (className, ...parts) => {
    const el = make("button", className, ...parts);
    el.type = "button";
    return el;
  };
  const startDialog = ({ zone: first = "none", submit }) => {
    const dialog = make("dialog", "hc-start"), heading = make("h2", "", "Start a chat");
    heading.id = "hc-start-head";
    dialog.setAttribute("aria-labelledby", heading.id);
    const title = make("input", "hc-start-title"), label = make("label", "hc-start-label", "Title", title);
    Object.assign(title, { type: "text", maxLength: TITLE_MAX, autocomplete: "off", spellcheck: false });
    const cards = make("div", "hc-start-zones");
    cards.setAttribute("role", "radiogroup");
    cards.setAttribute("aria-label", "Where");
    const zones = Object.entries(ZONE_NAMES).map(([value, words]) => {
      const card = tap("hc-zone-card", make("span", "hc-zone-art", value === "main" ? mainIsland() : BL.nativeIcons.svg(value === "dsb" ? "dsb" : "cloud")), make("span", "hc-zone-name", words));
      card.setAttribute("role", "radio");
      card.dataset.zone = value;
      cards.append(card);
      return card;
    });
    let zone = first;
    const choose = (value, focus = false) => {
      zone = value;
      for (const card of zones) {
        const on = card.dataset.zone === value;
        card.setAttribute("aria-checked", String(on));
        card.tabIndex = on ? 0 : -1;
        if (on && focus) card.focus();
      }
    };
    cards.addEventListener("click", (event) => { const card = event.target.closest(".hc-zone-card"); if (card) choose(card.dataset.zone); });
    cards.addEventListener("keydown", (event) => {
      const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const at = zones.findIndex((card) => card.dataset.zone === zone);
      choose(zones[(at + step + zones.length) % zones.length].dataset.zone, true);
    });
    const go = button("foot-button foot-primary", "Start chat"), cancel = button("foot-button", "Cancel"), why = make("p", "hc-start-why");
    why.setAttribute("role", "alert");
    go.type = "submit";
    const form = make("form", "slab hc-start-slab", label, cards, why, make("div", "hc-start-go", cancel, go));
    dialog.append(heading, form);
    cancel.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = title.value.trim();
      if (!text || text.length > TITLE_MAX) { why.textContent = STARTS.bad_title(); title.focus(); return; }
      if (go.disabled) return;
      go.disabled = true;
      why.textContent = "";
      const words = await submit({ title: text, zone });
      go.disabled = false;
      if (words) why.textContent = words;
      else dialog.close();
    });
    const open = (name, zone = first) => {
      title.value = `${name}'s chat`.slice(0, TITLE_MAX);
      why.textContent = "";
      choose(ZONES.includes(zone) ? zone : first);
      dialog.showModal();
      title.focus();
      title.select();
    };
    return { node: dialog, open, close: () => dialog.close(), get zone() { return zone; } };
  };

  const create = ({ node, head, space, chats, joinVoice, faceOf: portrait = () => "", startZone = () => "none", toast = null, shown = () => !node.closest("[hidden]"),
    rowFace = (p) => p.face || (p.character ? portrait(p.character) : ""), speakNow = false, goThere = null, islandView = null }) => {
    const listeners = new AbortController(), { signal } = listeners;
    let state = null, room = null, me = null, rank = "", people = [], timer = 0, shownTimer = 0, askedTimer = 0, askedAt = -Infinity;
    // `asked` the burst's ids, `askedNames` each one's name as it asked (they may have gone by the time it is said).
    const asked = [], askedNames = new Map(), said = new Map(), mine = new Map();
    const nameOf = (id) => people.find((p) => p.id === id)?.display || "Someone";

    // --- the one live region ---
    const notice = make("p", "help hc-chat-notice");
    // Never hidden, so what is written into it is announced; empty, it takes no room (chat-hosts.css). Where the page
    // has a toast that is announced already (the island's `hud.toast`), the words go there instead, said once.
    notice.setAttribute("role", "status");
    const say = (text) => {
      if (!text) return;
      said.set(text, Date.now());
      if (toast) return toast(text);
      notice.textContent = text;
      clearTimeout(shownTimer);
      shownTimer = setTimeout(() => { notice.textContent = ""; }, SHOWN_MS);
    };
    const flushAsked = () => {
      askedTimer = 0;
      if (!asked.length) return;
      askedAt = Date.now();
      say(joinNames(asked.splice(0).map((id) => askedNames.get(id) || nameOf(id))));
      askedNames.clear();
    };

    // --- the Chats list ---
    const startOpen = button("foot-button foot-primary", "Start a chat");
    const listHead = make("div", "hc-chats-head", make("span", "section-head", "Live chats"), startOpen);
    const rows = make("ul", "hc-chats-list"), listNote = make("p", "hc-chats-note"), again = button("link", "Try again");
    again.hidden = true;
    const listStatus = make("p", "hc-chats-status", listNote, " ", again);
    listStatus.setAttribute("role", "status");
    const list = make("div", "slab hc-chats", listHead, rows, listStatus);
    let entries = null, reading = false, readAt = -Infinity;
    // The host's face: the page's own portrait of their Ooga (`faceOf`), else the native Ooga face.
    const faceOf = (character) => character ? portrait(character) : "";
    const drawList = () => {
      const github = state?.session?.identity.provider === "github";
      startOpen.hidden = !github;
      if (!entries) { rows.replaceChildren(); return; }
      rows.replaceChildren(...entries.map((c) => {
        const face = make("span", "cloud-portrait"), url = faceOf(c.host.character);
        if (url) { const img = make("img", ""); img.alt = ""; img.src = url; face.append(img); } else face.append(BL.nativeIcons.svg("roster"));
        const pick = tap("hc-chat-row", face, make("span", "hc-chat-row-text", make("span", "hc-chat-row-title", c.title),
          make("span", "hc-chat-row-host", `Hosted by ${c.host.display}`), make("span", "hc-chat-row-count", `${c.speakers} speaking · ${c.listeners} listening`)),
        make("span", "panel-chip", ZONE_NAMES[c.zone]));
        pick.addEventListener("click", () => showPreview(c, pick));
        return make("li", "", pick);
      }));
      set(listNote, "textContent", entries.length ? "" : github ? "Nobody is chatting right now. Start one and others can join." : "Nobody is chatting right now. A contributor can start one; you can join and ask to speak.");
    };
    const read = async (force = false) => {
      if (reading || !force && Date.now() - readAt < LIST_MS) return;
      reading = true;
      readAt = Date.now();
      const answer = await chats.list().catch(() => ({ chats: null }));
      reading = false;
      // Signed out while it was asked: the answer was for the account that left, so it is not kept.
      if (listeners.signal.aborted || !state?.session) return;
      const parsed = parseList(answer.chats);
      if (parsed) entries = parsed;
      again.hidden = !!parsed;
      if (!parsed) set(listNote, "textContent", entries ? "The list may be out of date: it couldn't be read." : "The chats couldn't be read.");
      drawList();
    };
    again.addEventListener("click", () => read(true), { signal });
    // Read while the list shows, the panel is the visible tab and the page is visible; nothing runs otherwise.
    const watching = () => !document.hidden && !!state && !room && !!state.session && shown();
    const watch = () => {
      syncView();
      if (!watching()) { clearInterval(timer); timer = 0; return; }
      if (!timer) { read(); timer = setInterval(() => read(), LIST_MS); }
    };
    document.addEventListener("visibilitychange", watch, { signal });
    const observer = new MutationObserver(watch);
    const starter = startDialog({ submit: async (body) => {
      const answer = await chats.start(body);
      if (listeners.signal.aborted) return "";
      if (!answer.chat) return (STARTS[answer.code] || (() => "The chat couldn't start. Try again."))(answer.retryAfter);
      const entry = parseEntry({ ...answer.chat, host: { login: state.session.identity.login } });
      // The host is on stage from the start, muted, as in X Spaces: once the snapshot is here they speak (`update`),
      // the microphone asked for on the strength of this Start chat press.
      if (entry) { wantSpeak = entry.id; chats.open(entry); }
      return "";
    } });
    startOpen.addEventListener("click", () => starter.open(state.session.identity.display, startZone()), { signal });
    starter.node.addEventListener("close", () => { if (!room && startOpen.isConnected && !startOpen.hidden) startOpen.focus(); }, { signal });

    // --- a chat's preview, from the list: its stage, how many listen and wait, and the two ways in ---
    const preview = make("dialog", "hc-preview"), previewTitle = make("h2", ""), previewZone = make("span", "panel-chip"), previewOpen = make("span", "panel-chip hc-open-tag", "Open stage");
    previewTitle.id = "hc-preview-head";
    preview.setAttribute("aria-labelledby", previewTitle.id);
    const previewStage = make("ul", "cloud-roster hc-preview-stage"), previewCount = make("p", "hc-preview-count");
    previewStage.setAttribute("aria-label", "On the stage");
    const joinListener = button("foot-button foot-primary", "Join as listener"), joinSpeaker = button("foot-button hc-join-speaker", "Ask to speak"), previewCancel = button("foot-button", "Cancel");
    preview.append(make("div", "hc-preview-head", previewTitle, previewZone, previewOpen),
      make("div", "slab hc-start-slab", previewStage, previewCount, make("div", "hc-start-go", previewCancel, joinSpeaker, joinListener)));
    // The stage drawn as the chat draws it, to look at only: no menu, no volume, no microphone to press.
    const previewTiles = BL.audienceTiles.create(previewStage);
    const previewDescribe = (p, t) => {
      const speaker = p.role === "speaker", look = speaker ? p.muted ? "muted" : "on" : "";
      t.id = p.id; t.display = p.display; t.role = p.role; t.source = "chat"; t.chat = true; t.self = p.id === me; t.walking = p.role === "speaker" && !!p.walking;
      t.face = rowFace(p); t.hand = p.hand || ""; t.look = look; t.micPressed = false; t.micDisabled = true;
      t.micWords = speaker ? `${p.display}: ${p.muted ? "Muted their microphone" : "In voice"}` : ""; t.rank = p.rank || ""; t.request = ""; t.reconnecting = !!p.reconnecting;
    };
    let previewing = null, previewFrom = null, previewTimer = 0, wantSpeak = "";
    const readPreview = async () => {
      const entry = previewing;
      if (!entry) return;
      const answer = await chats.preview(entry.id).catch(() => ({}));
      if (previewing !== entry) return;
      if (answer && answer.code === "ended") { previewFrom = null; preview.close(); say("That chat has ended"); read(true); return; }
      const shown = parsePreview(answer);
      if (!shown) return;
      previewOpen.hidden = !shown.open;
      set(joinSpeaker, "textContent", shown.open ? "Join as speaker" : "Ask to speak");
      previewTiles.draw(shown.stage, previewDescribe);
      set(previewCount, "textContent", `${shown.listeners} listening · ${shown.requests} waiting to speak`);
    };
    // Read when it opens and every PREVIEW_MS while it stays open; nothing runs once it closes. Opened from elsewhere on
    // the page (the island's Online Oogas, `preview`) while the panel is hidden, it stands in the page's body until it closes.
    const showPreview = (entry, from) => {
      if (!node.offsetParent && preview.parentNode !== node.ownerDocument.body) node.ownerDocument.body.append(preview);
      previewing = entry;
      previewFrom = from;
      set(previewTitle, "textContent", entry.title);
      set(previewZone, "textContent", ZONE_NAMES[entry.zone]);
      previewOpen.hidden = !entry.open;
      // On an open stage joining as a speaker speaks at once; otherwise it joins and asks.
      set(joinSpeaker, "textContent", entry.open ? "Join as speaker" : "Ask to speak");
      previewTiles.clear();
      set(previewCount, "textContent", `${entry.listeners} listening`);
      preview.showModal();
      joinListener.focus();
      clearInterval(previewTimer);
      previewTimer = setInterval(readPreview, PREVIEW_MS);
      readPreview();
    };
    // A close event comes a task after its close, so one that lands after the preview opened again is not for it.
    preview.addEventListener("close", () => {
      if (preview.open) return;
      if (preview.parentNode !== node) node.append(preview);
      clearInterval(previewTimer);
      previewTimer = 0;
      previewing = null;
      previewTiles.clear();
      if (previewFrom && previewFrom.isConnected) previewFrom.focus();
      previewFrom = null;
    }, { signal });
    preview.addEventListener("click", (event) => { if (event.target === preview) preview.close(); }, { signal });
    previewCancel.addEventListener("click", () => preview.close(), { signal });
    const join = (asSpeaker) => {
      const entry = previewing;
      if (!entry) return;
      previewFrom = null;
      preview.close();
      // Joining as a speaker asks once the chat's snapshot is here (`update`).
      wantSpeak = asSpeaker ? entry.id : "";
      chats.open(entry);
    };
    joinListener.addEventListener("click", () => join(false), { signal });
    joinSpeaker.addEventListener("click", () => join(true), { signal });

    // --- in a chat: its bar, the invite card and the footer's own buttons ---
    const back = button("link hc-room-back", "Back to chats"), roomTitle = make("span", "hc-room-title"), requests = button("panel-chip hc-requests", "");
    const openTag = make("span", "panel-chip hc-open-tag", "Open stage");
    // Leaving, for everyone but the host, who hands the chat over first (`leaveAsHost`).
    const goOut = (at) => rank === "host" ? leaveAsHost(at) : chats.leave();
    back.addEventListener("click", () => goOut(back), { signal });
    const bar = make("div", "hc-room-bar", back, roomTitle, openTag);
    // The host's switch, in the Requests pop-up: an open stage approves every request the moment it is made.
    const openSwitch = make("input"), openLabel = make("label", "hc-open-switch", openSwitch, make("span", "", "Open stage: anyone who asks may speak"));
    Object.assign(openSwitch, { type: "checkbox" });
    openSwitch.setAttribute("role", "switch");
    openSwitch.addEventListener("change", () => send("open", { on: openSwitch.checked }, () => paint()), { signal });
    const inviteHead = make("strong", "", "A host invited you to speak"), startSpeaking = button("foot-button foot-primary", "Start speaking"), notNow = button("foot-button", "Not now");
    inviteHead.id = "hc-invite-head";
    const invite = make("div", "slab hc-invite", inviteHead, make("span", "hc-invite-note", "You'll join muted. Unmute when you're ready."), make("span", "hc-invite-go", startSpeaking, notNow));
    Object.assign(invite, { hidden: true, tabIndex: -1 });
    invite.setAttribute("role", "dialog");
    invite.setAttribute("aria-labelledby", inviteHead.id);
    let inviteShown = false, inviteTimer = 0;
    const send = (type, fields = {}, after = null) => {
      const id = chats.request(type, fields);
      if (!id) { say("Not connected. Try again in a moment."); return 0; }
      mine.set(id, after);
      return id;
    };
    startSpeaking.addEventListener("click", () => joinVoice(), { signal });
    notNow.addEventListener("click", () => send("decline"), { signal });
    invite.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); send("decline"); } }, { signal });
    // The co-host offer card, while the visitor holds an offer (`you.request` "cohost"), on stage or not; `again` when it
    // came back as they left the stage. Accept makes them a co-host and, off stage, goes straight on to Join Voice once the
    // server says they may (`autoSpeak`, as an open stage's invite does); a microphone that fails leaves them co-host,
    // and Join Voice asks again. Not now frees the slot.
    const offerHead = make("strong", ""), offerNote = make("span", "hc-invite-note"), accept = button("foot-button foot-primary", "Accept"), offerNotNow = button("foot-button", "Not now");
    offerHead.id = "hc-offer-head";
    const offer = make("div", "slab hc-invite hc-offer", offerHead, offerNote, make("span", "hc-invite-go", accept, offerNotNow));
    Object.assign(offer, { hidden: true, tabIndex: -1 });
    offer.setAttribute("role", "dialog");
    offer.setAttribute("aria-labelledby", offerHead.id);
    let offerShown = false, offerAgain = false, offered = false, answering = 0;
    const answerOffer = (yes) => {
      if (answering) return;
      const onStage = state.voice.role === "speaker" || state.voice.busy;
      answering = send("cohostAnswer", { accept: yes }, (msg) => {
        answering = 0;
        if (!msg.ok && autoFor === "cohost") autoSpeak = "";
        paint();
      });
      if (!answering) return;
      if (yes && !onStage) { autoSpeak = "invited"; autoFor = "cohost"; autoTries = 0; }
      paint();
    };
    accept.addEventListener("click", () => answerOffer(true), { signal });
    offerNotNow.addEventListener("click", () => answerOffer(false), { signal });
    offer.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); answerOffer(false); } }, { signal });
    const foot = space.parts.foot;
    const ask = button("foot-button cloud-voice hc-ask", "Request to speak"), end = button("foot-button hc-end", "End chat"), leave = button("link hc-leave", "Leave chat");
    let asking = 0;
    // A request to speak the visitor pressed for: on an open stage its invite goes straight on to Start speaking
    // (`autoSpeak`: "asked" until the invite, "starting" as voice is joined, "joining" while it is, "done" after), and
    // the invite card shows only if that join could not start.
    // `autoFor`: what it waits on, an open stage's invite ("invite") or an accepted co-host offer ("cohost").
    let autoSpeak = "", autoTries = 0, autoFor = "invite";
    const askToSpeak = () => {
      autoSpeak = "asked";
      autoFor = "invite";
      autoTries = 0;
      return send("ask", {}, () => { asking = 0; paint(); });
    };
    ask.addEventListener("click", () => {
      if (asking) return;
      if (room?.you?.request === "asked") asking = send("cancel", {}, () => { asking = 0; paint(); });
      else asking = askToSpeak();
      paint();
    }, { signal });
    leave.addEventListener("click", () => goOut(leave), { signal });
    // Go there, on the island view: on the island's page the speaker's own Ooga onto the chat's island and back; in Ooga
    // Chat the chat opened on the island, voice and all.
    const goTo = button("foot-button hc-go", "Go there");
    goTo.hidden = true;
    if (goThere) goTo.addEventListener("click", (e) => { if (e.detail) goTo.blur(); goThere.press(); }, { signal });
    const offGo = goThere ? goThere.subscribe(() => paint()) : () => {};
    foot.join.after(ask, end, leave);

    // --- pop-ups: a tile's menu, the queue, a confirmation ---
    const pop = make("div", "hc-pop");
    pop.hidden = true;
    // The Requests panel opens in the panel's own flow, under the chat's bar, so it moves the roster down rather than
    // covering it; a tile's menu and a confirmation float by what opened them.
    const dock = make("div", "hc-dock");
    let anchor = null, popKind = "", whys = 0;
    const closePop = (refocus = true) => {
      if (pop.hidden) return;
      pop.hidden = true;
      pop.replaceChildren();
      popKind = "";
      const to = anchor;
      anchor = null;
      if (refocus && to && to.isConnected) to.focus();
    };
    const place = () => {
      if (pop.hidden || !anchor || pop.parentNode === dock) return;
      if (matchMedia("(max-width: 399px)").matches) { pop.style.removeProperty("top"); pop.style.removeProperty("left"); return; }
      const a = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
      pop.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, a.left + a.width / 2 - w / 2))}px`;
      pop.style.top = `${a.bottom + h + 8 > innerHeight ? Math.max(8, a.top - h - 6) : a.bottom + 6}px`;
    };
    // `items`: `{ label, run, primary, danger, cancel }` (danger: red, for what removes or ends; cancel: the menu's own way
    // out, at its foot); `heading` names it, `role` menu or dialog.
    const openPop = (kind, at, heading, items, role = "menu", focus = true) => {
      closePop(false);
      anchor = at;
      popKind = kind;
      pop.setAttribute("role", role);
      pop.setAttribute("aria-label", heading);
      const slab = make("div", "slab hc-pop-slab");
      slab.append(make("p", "hc-pop-head", heading));
      for (const item of items) {
        if (item.node) { slab.append(item.node); continue; }
        const el = button(`foot-button${item.primary ? " foot-primary" : ""}${item.danger ? " hc-danger" : ""}${item.cancel ? " hc-pop-cancel" : ""}`, item.label);
        if (role === "menu") el.setAttribute("role", "menuitem");
        if (item.name) el.setAttribute("aria-label", item.name);
        slab.append(el);
        // Not open to the viewer now: kept in the menu, focusable, with the reason under it.
        if (item.disabled) {
          const why = make("p", "hc-pop-note hc-pop-why", item.reason);
          why.id = `hc-why-${++whys}`;
          el.setAttribute("aria-disabled", "true");
          el.setAttribute("aria-describedby", why.id);
          slab.append(why);
          continue;
        }
        el.addEventListener("click", item.run);
      }
      pop.replaceChildren(slab);
      const docked = kind === "queue";
      pop.classList.toggle("hc-docked", docked);
      if (docked && pop.parentNode !== dock) dock.append(pop);
      else if (!docked && pop.parentNode !== node) node.append(pop);
      pop.hidden = false;
      place();
      if (focus) pop.querySelector("button")?.focus();
    };
    pop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); return closePop(); }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const all = [...pop.querySelectorAll("button")], at = all.indexOf(document.activeElement);
      if (!all.length) return;
      event.preventDefault();
      all[(at + (event.key === "ArrowDown" ? 1 : -1) + all.length) % all.length].focus();
    }, { signal });
    document.addEventListener("pointerdown", (event) => { if (!pop.hidden && !pop.contains(event.target) && !anchor?.contains(event.target)) closePop(false); }, { signal, capture: true });
    addEventListener("resize", place, { signal });
    // The chat's co-hosts here, longest-serving first (the chat's own order).
    const cohostsOf = () => people.filter((p) => p.rank === "cohost");
    let leaveAway = "";
    // A host's way out: they choose the co-host who hosts next, the chat is handed over (the server's `handover`), and
    // only once that is done do they leave. With no co-host there is no way out but End chat.
    // A co-host whose connection dropped is listed but not offered: handed the chat, they would leave it without a host
    // there until they came back. Connected co-hosts come first; with none, waiting or End chat is the way out.
    const leaveAsHost = (at, focus = true) => {
      const all = cohostsOf();
      if (!all.length) return;
      const next = [...all.filter((p) => !p.reconnecting), ...all.filter((p) => p.reconnecting)], any = !next[0].reconnecting;
      leaveAway = all.map((p) => p.id + (p.reconnecting ? "~" : "")).join();
      openPop("leave", at, any ? "Choose who hosts the chat after you leave."
        : next.length === 1 ? `${next[0].display} is reconnecting. Wait for them to come back, or end the chat.` : "Your co-hosts are reconnecting. Wait for one to come back, or end the chat.",
        [...next.map((p, i) => ({ label: `Make ${p.display} host and leave`, primary: any && i === 0, disabled: !!p.reconnecting, reason: "Reconnecting…",
          run: () => { closePop(); send("handover", { id: p.id }, (msg) => { if (msg && msg.ok) chats.leave(); }); } })),
        { label: "Cancel", cancel: true, run: () => closePop() }], "dialog", focus);
    };
    const confirm = (at, words, label, run, danger = false) => openPop("confirm", at, words, [{ label, primary: true, danger, run: () => { closePop(); run(); } }, { label: "Cancel", run: () => closePop() }], "dialog");
    const menu = (id, tile) => {
      const row = people.find((p) => p.id === id);
      if (!room || !row) return;
      const chat = room.chat || {}, slots = (Array.isArray(chat.cohosts) ? chat.cohosts.length : 0) + (Array.isArray(chat.offers) ? chat.offers.length : 0);
      const items = actionsFor({ id: me, rank, slots }, row);
      if (!items.length) return;
      openPop(`menu:${id}`, tile, row.display, [...items.map((a) => ({ label: a.label, disabled: a.disabled, reason: a.reason, danger: a.type === "remove", run: () => {
        const fields = { id, ...(a.on === undefined ? {} : { on: a.on }) };
        if (a.confirm) return confirm(tile, a.confirm, a.label, () => send(a.type, fields), a.type === "remove");
        closePop();
        send(a.type, fields);
      } })), { label: "Cancel", cancel: true, run: () => closePop() }]);
    };
    space.setMenu(menu);
    const queue = () => people.filter((p) => p.request === "asked").sort((a, b) => a.askedAt - b.askedAt);
    // Who its hosts removed, for a host or co-host (the server's `removed` list, earliest first): Allow back lets them in.
    let removed = [], queued = "";
    // Drawn again only when who waits changes; the focus moves only on opening, or when the row that held it went.
    const openQueue = (opening = true) => {
      const waiting = queue(), now = [rank, ...waiting, ...removed].map((p) => p.id ? `${p.id} ${p.display}` : p).join();
      if (!opening && now === queued) return;
      queued = now;
      const held = !opening && pop.contains(document.activeElement);
      const back = removed.length ? [{ node: make("p", "hc-pop-section", "Removed") }, ...removed.map((p) => {
        const allow = button("foot-button", "Allow back"), name = make("span", "hc-queue-name", p.display);
        allow.setAttribute("aria-label", `Allow ${p.display} back`);
        allow.addEventListener("click", () => send("allow", { id: p.id }, (msg) => { if (msg.ok) say(`${p.display} can join again`); }));
        name.title = p.display;
        return { node: make("div", "hc-queue-row", name, allow) };
      })] : [];
      openPop("queue", requests, "Requests to speak", [...rank === "host" ? [{ node: openLabel }] : [], ...waiting.length ? waiting.map((p) => {
        // Stone, every row alike: a queue of many has no one amber action.
        const approve = button("foot-button", "Approve"), decline = button("foot-button", "Decline");
        approve.setAttribute("aria-label", `Approve ${p.display}`);
        decline.setAttribute("aria-label", `Decline ${p.display}`);
        approve.addEventListener("click", () => send("answer", { id: p.id, approve: true }));
        decline.addEventListener("click", () => send("answer", { id: p.id, approve: false }));
        const name = make("span", "hc-queue-name", p.display);
        name.title = p.display;
        return { node: make("div", "hc-queue-row", name, approve, decline) };
      }) : [{ node: make("p", "hc-pop-note", "No requests right now.") }], ...back], "dialog", opening);
      if (held && !pop.contains(document.activeElement)) (pop.querySelector("button") || requests).focus();
    };
    requests.addEventListener("click", () => popKind === "queue" ? closePop() : openQueue(true), { signal });
    end.addEventListener("click", () => confirm(end, "End this chat for everyone?", "End chat", () => send("end"), true), { signal });

    // What the chat says: notices, answers to this page's own requests, and the island view's walkers.
    const off = chats.hear((msg) => {
      if (msg.type === "walk") { isle?.walk(msg); return; }
      if (msg.type === "result") {
        if (!mine.has(msg.requestId)) return;
        const after = mine.get(msg.requestId);
        mine.delete(msg.requestId);
        if (!msg.ok) say((REFUSED[msg.error?.code] || (() => "That didn't work. Try again."))(msg.error?.retryAfter));
        after?.(msg);
        return;
      }
      if (msg.type === "removed") {
        removed = parseRemoved(msg.list);
        return paint();
      }
      // An invite from an open stage to a request the visitor pressed for: voice is joined as soon as `you` says it may.
      if (msg.kind === "invited" && msg.open && autoSpeak === "asked") { autoSpeak = "invited"; return paint(); }
      // A co-host offer: the card says so; `again` when it came back as they left the stage.
      if (msg.kind === "cohost_offer") { offerAgain = msg.again === true; return paint(); }
      if (msg.kind === "asked") {
        if (!asked.includes(msg.id)) asked.push(msg.id);
        if (people.some((p) => p.id === msg.id)) askedNames.set(msg.id, nameOf(msg.id));
        if (!askedTimer) askedTimer = setTimeout(flushAsked, Math.max(0, askedAt + ASKED_MS - Date.now()));
        return;
      }
      const text = noticeText(msg, me, nameOf);
      // A chat that ended or removed the visitor says so once: its notice, then its socket's close.
      if (msg.left && Date.now() - (said.get(text) || -Infinity) < SHOWN_MS) return;
      say(text);
    });

    // Where everything stands, from the app's state.
    const paint = () => {
      const r = room, you = r?.you || {}, speaker = state.voice.role === "speaker" || state.voice.busy;
      const may = you.speak === "eligible" || you.speak === "pending" || you.speak === "active" || !!state.voice.elsewhere;
      // The host stays on the stage while hosting (Mute instead of Leave Voice): a host and co-hosts always count as
      // speakers, and handing the chat over or ending it is how a host steps down.
      const hosting = you.rank === "host";
      foot.join.hidden = !r || !speaker && !may || hosting && state.voice.role === "speaker";
      // A listener who may not speak has no microphone to unmute: the button shows for a speaker or one who may join.
      foot.mute.hidden = !r || !speaker && !may;
      ask.hidden = !r || speaker || may;
      const open = !!r?.chat?.open;
      set(ask, "textContent", you.request === "asked" ? "Requested · Cancel" : speakNow && open ? "Speak now" : "Request to speak");
      openTag.hidden = !open;
      set(openSwitch, "checked", open);
      set(ask, "disabled", !!asking || !state.device.online);
      attr(ask, "aria-pressed", String(you.request === "asked"));
      end.hidden = !r || you.rank !== "host";
      // A host leaves only by handing the chat to a co-host (`leaveAsHost`); with none, End chat is the way out.
      const stuck = hosting && !cohostsOf().length;
      leave.hidden = !r || stuck;
      back.hidden = stuck;
      if (popKind === "leave" && (!hosting || stuck)) closePop(false);
      // The picker follows its co-hosts: one reconnecting, back or gone is offered or not as it stands now.
      else if (popKind === "leave" && cohostsOf().map((p) => p.id + (p.reconnecting ? "~" : "")).join() !== leaveAway) leaveAsHost(anchor, false);
      const g = goThere && r ? goThere.state(r) : null;
      goTo.hidden = !g;
      if (g) {
        set(goTo, "textContent", g.label);
        set(goTo, "disabled", g.disabled);
        set(goTo, "title", g.title);
        attr(goTo, "aria-label", g.disabled && g.title ? `${g.words}: ${g.title}` : g.words);
      }
      const manager = !!LEVEL[you.rank];
      requests.hidden = !r || !manager;
      if (manager) { const n = queue().length; set(requests, "textContent", n ? `Requests ${n}` : "Requests"); }
      if (!manager && popKind === "queue") closePop(false);
      if (popKind === "queue") openQueue(false);
      if (popKind.startsWith("menu:") && !people.some((p) => p.id === popKind.slice(5))) closePop(false);
      // The invite card, while invited, until its time runs out (the server says so too).
      set(startSpeaking, "disabled", state.voice.busy || you.speak !== "eligible");
      const invited = !!r && you.request === "invited" && !speaker && (you.inviteUntil || Infinity) > Date.now();
      // What an automatic join waits on: an open stage's invite, or the co-hosting just accepted off stage.
      const waited = autoFor === "cohost" ? you.rank === "cohost" && !speaker : invited;
      if (autoSpeak === "invited" && waited && you.speak === "eligible") {
        autoSpeak = "starting";
        // After this paint: joining voice paints again on its own. A join that could not start yet (the voice controller
        // hears `you` a moment after the request's answer) is tried again on the next paint, a few times at most.
        Promise.resolve().then(() => {
          joinVoice();
          if (autoSpeak !== "starting") return;
          autoSpeak = ++autoTries < 3 ? "invited" : "done";
          if (autoSpeak === "done") paint();
        });
      } else if (autoSpeak === "starting" && state.voice.busy) autoSpeak = "joining";
      else if (autoSpeak === "joining" && !state.voice.busy) autoSpeak = "done";
      invite.hidden = !invited || autoSpeak === "invited" || autoSpeak === "starting" || autoSpeak === "joining";
      clearTimeout(inviteTimer);
      if (invited && you.inviteUntil) inviteTimer = setTimeout(paint, you.inviteUntil - Date.now() + 50);
      if (!invite.hidden && !inviteShown) (startSpeaking.disabled ? invite : startSpeaking).focus();
      inviteShown = !invite.hidden;
      // The co-host offer card, while the offer stands.
      const holding = !!r && you.request === "cohost";
      if (offered && !holding) offerAgain = false;
      offered = holding;
      offer.hidden = !holding;
      set(offerHead, "textContent", offerAgain ? "You left the stage. Rejoin as co-host?" : "The host invited you to co-host");
      set(offerNote, "textContent", speaker ? "Co-hosts help run the stage. You keep your place on it." : "Co-hosts help run the stage. You'll join it muted.");
      set(accept, "disabled", !!answering || !state.device.online);
      set(offerNotNow, "disabled", !!answering);
      if (!offer.hidden && !offerShown) (accept.disabled ? offer : accept).focus();
      offerShown = !offer.hidden;
    };
    const update = (next) => {
      state = next;
      const was = room;
      room = next.room && next.session ? next.room : null;
      // Signed out: the list, a preview and Start a chat go with the account, and the chats it was shown are forgotten.
      if (!next.session) {
        entries = null; readAt = -Infinity;
        starter.close();
        if (preview.open) { previewFrom = null; preview.close(); }
      }
      if (room !== was) { closePop(false); asked.length = 0; askedNames.clear(); clearTimeout(askedTimer); askedTimer = 0; mine.clear(); asking = 0; removed = []; autoSpeak = ""; autoFor = "invite"; offerAgain = false; offered = false; answering = 0; viewSent = null; }
      if (!was && room) { readAt = -Infinity; }
      me = next.session?.identity.participant || null;
      rank = room?.you?.rank || "";
      people = next.audience.list;
      // Joined as a speaker: once the chat's snapshot says where the visitor stands, they ask (or, allowed already, speak).
      if (room && room.id === wantSpeak && room.you) {
        wantSpeak = "";
        if (room.you.speak === "eligible") Promise.resolve().then(joinVoice);
        else asking = askToSpeak();
      }
      set(roomTitle, "textContent", room ? room.title : "");
      set(roomTitle, "title", room ? room.title : "");
      bar.hidden = !room;
      list.hidden = !!room || !next.session;
      paint();
      if (!room) drawList();
      watch();
    };
    // The island view: shown while someone walks the chat's island, the walkers' places asked for only while it can be
    // seen. `viewSent` is what this connection was last told (null: nothing yet, or a new connection).
    const isle = islandView && BL.islandView ? BL.islandView.create({ picture: islandView.picture, faceOf: rowFace, loadLive: islandView.loadLive,
      island: islandView.island, storageKey: islandView.storageKey }) : null;
    let viewSent = null;
    function syncView() {
      if (!state) return;
      // Every Main Island chat shows its island, standing still until someone walks it; only walkers' places are asked for.
      const place = !!isle && !!room && room.zone === "main", seen = place && shown() && !document.hidden;
      const want = seen && people.some((p) => p.walking);
      set(strip, "hidden", !place);
      if (isle) isle.update({ place, rows: room ? people : [], talking: state.voice.talking || [], speaking: !!state.voice.speaking, self: me, active: seen });
      if (!room || state.audience.status !== "live") { viewSent = null; return; }
      if (viewSent === want || viewSent === null && !want) return;
      if (chats.request("view", { on: want })) viewSent = want;
    }
    let observing = false;
    const attach = () => {
      if (observing || !node.parentElement) return;
      observing = true;
      observer.observe(node.parentElement, { attributes: true, attributeFilter: ["hidden"] });
    };
    head.after(bar, dock, notice, list);
    // The Requests chip stands in the panel's title, right of the zone tag.
    const zoneTag = head.querySelector(".panel-chip");
    if (zoneTag) zoneTag.after(requests); else head.append(requests);
    // The strip over the roster: the island view, while someone walks the chat's island.
    const strip = make("div", "hc-room-strip");
    strip.hidden = true;
    if (isle) { strip.append(isle.node); isle.stage.append(goTo); }
    space.parts.list.before(strip);
    node.append(starter.node, preview);
    space.parts.footRow.before(invite, offer);
    node.append(pop);
    const dispose = () => {
      listeners.abort();
      observer.disconnect();
      clearInterval(timer);
      clearTimeout(shownTimer);
      clearTimeout(askedTimer);
      clearTimeout(inviteTimer);
      clearInterval(previewTimer);
      previewTiles.dispose();
      off();
      offGo();
      isle?.dispose();
      space.setMenu(null);
      for (const el of [bar, dock, notice, list, strip, invite, offer, pop, goTo, ask, end, leave, requests, starter.node, preview]) el.remove();
    };
    return { update: (next) => { attach(); update(next); }, redraw: () => drawList(), preview: (entry, from = null) => showPreview(entry, from), dispose };
  };
  BL.chatHosts = { create, startDialog, mainIsland, ZONE_NAMES, rosterZone, order, parseRemoved, parsePreview, parseEntry, parseList, actionsFor, noticeText, joinNames, REFUSED, STARTS, LIST_MS, ASKED_MS, COHOST_SLOTS };
})();
