// Reactions, on X Spaces' pattern: a dark card of ten emoji in two rows of five and, past a divider, the raised hand
// pinned beside them, under Online Oogas' list and under The Commons' input (two bars, the same state; `mount` adds
// Ooga Chat's, under its roster, whose hand only an active speaker may raise). A tap shows that
// emoji over the visitor's Ooga for everyone in their zone for a moment (`net.sendReaction`, drawn by remote-players.js);
// the right slot stays up until tapped again (`net.setHand`), defaulting to the raised hand. A long press on any slot
// (or a right click, the context-menu key or Shift+F10) opens the picker, floating in the middle of the screen: every emoji in
// emoji-data.js under its group, a search by name, a skin tone (applied to every bar emoji and the hand that takes one),
// a heart colour (any heart in a slot shows and goes out in it; red until changed) and Reset. Choosing one puts it in
// that slot, swapping with the slot that already held it so the ten stay distinct; choosing a heart sets the heart
// colour too, and the slot keeps "a heart". The right slot is independent of the ten; only it can stay up. Its choice
// lives in `ooga-reactions-persistent`, defaulting to the hand on older rooms. The ten, tone and heart are this browser's (localStorage
// `ooga-reactions`, `ooga-reactions-tone`, `ooga-reactions-heart`), read at load and checked against the shared policy.
// The bars show only where the room takes reactions (`net.state.reactions`), signed in. net.js spends one bucket,
// mirroring the room's, for reactions and the hand alike, so a tap the room would drop shows nothing here either. The
// picker's grid is built on its first opening and kept for the page life. No frame work and no timers but a long press's.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const P = BL.reactionPolicy, net = BL.net;
  const SLOTS_KEY = "ooga-reactions", TONE_KEY = "ooga-reactions-tone", HEART_KEY = "ooga-reactions-heart", PIN_KEY = "ooga-reactions-persistent";
  // The plain hearts, red first: a slot holding any of them holds "a heart" (stored as the red one) in the chosen colour.
  const HEARTS = ["❤️", "🩷", "🧡", "💛", "💚", "💙", "🩵", "💜", "🤎", "🖤", "🩶", "🤍"], HEART = HEARTS[0];
  const HEART_NAMES = ["Red", "Pink", "Orange", "Yellow", "Green", "Blue", "Light blue", "Purple", "Brown", "Black", "Grey", "White"];
  const asSlot = (emoji) => HEARTS.includes(emoji) ? HEART : emoji;
  const HOLD_MS = 450, MOVE_PX = 10, PERSISTENT = P.DEFAULTS.length;
  const GROUP_ICONS = { "Smileys & Emotion": "😀", "People & Body": "👋", "Animals & Nature": "🐻", "Food & Drink": "🍔", "Travel & Places": "✈️",
    "Activities": "⚽", "Objects": "💡", "Symbols": "💯", "Flags": "🏁" };
  const TONE_NAMES = ["No skin tone", "Light skin tone", "Medium-light skin tone", "Medium skin tone", "Medium-dark skin tone", "Dark skin tone"];
  const $ = (id) => document.getElementById(id);
  const names = new Map();
  for (const group of BL.emojiData.groups) for (const [emoji, name] of group.emoji) names.set(emoji, name);

  const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private window: kept for the page */ } };
  let slots = P.DEFAULTS.slice(), tone = 0, heart = 0, persistent = P.HAND;
  {
    let saved = null;
    try { saved = JSON.parse(read(SLOTS_KEY)); } catch { saved = null; }
    if (Array.isArray(saved) && saved.length === slots.length && saved.every((e) => P.valid(e))) {
      saved = saved.map(asSlot);
      if (new Set(saved).size === saved.length) slots = saved;
    }
    const pin = read(PIN_KEY);
    if (names.has(pin)) persistent = asSlot(pin);
    const t = Number(read(TONE_KEY)), h = Number(read(HEART_KEY));
    if (P.tone(t)) tone = t;
    if (Number.isInteger(h) && h >= 0 && h < HEARTS.length) heart = h;
  }
  const save = () => {
    write(SLOTS_KEY, JSON.stringify(slots));
    write(TONE_KEY, String(tone));
    write(HEART_KEY, String(heart));
    write(PIN_KEY, persistent);
  };
  const shown = (emoji) => emoji === HEART ? HEARTS[heart] : P.toned(emoji, tone);
  const label = (emoji) => names.get(shown(emoji)) || names.get(emoji) || emoji;
  const selected = (slot) => slot === PERSISTENT ? persistent : slots[slot];
  const persistentEmoji = () => net.state.customHand ? shown(persistent) : P.HANDS[tone];
  // The empty wire emoji retains the original hand and skin-tone semantics for older pages.
  const setPersistent = (on) => net.setHand(on, tone, persistent === P.HAND ? "" : persistentEmoji());
  const syncPersistent = () => { if (net.state.hand) setPersistent(true); };

  // One bar: the grid of ten, the divider and the hand.
  const bars = [];
  const makeBar = (host, handAllowed = null) => {
    const card = document.createElement("div"), grid = document.createElement("div"), divider = document.createElement("span"), hand = document.createElement("button");
    card.className = "reaction-bar"; card.setAttribute("role", "group"); card.setAttribute("aria-label", "Reactions");
    grid.className = "reaction-grid";
    const buttons = slots.map((_, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "reaction"; b.dataset.slot = String(i);
      grid.append(b);
      return b;
    });
    divider.className = "reaction-divider"; divider.setAttribute("aria-hidden", "true");
    hand.dataset.slot = String(PERSISTENT);
    hand.type = "button"; hand.className = "reaction reaction-hand"; hand.setAttribute("aria-pressed", "false");
    card.append(grid, divider, hand);
    host.append(card);
    const bar = { host, card, buttons, hand, handAllowed };
    bars.push(bar);
    return bar;
  };
  const paint = () => {
    for (const bar of bars) {
      bar.buttons.forEach((b, i) => {
        const e = slots[i], text = shown(e);
        if (b.textContent !== text) b.textContent = text;
        b.setAttribute("aria-label", label(e));
        b.title = `${label(e)} · long-press to change`;
      });
      const up = net.state.hand, text = up ? net.state.handEmoji || P.HANDS[net.state.handTone] : persistentEmoji();
      if (bar.hand.textContent !== text) bar.hand.textContent = text;
      bar.hand.setAttribute("aria-pressed", String(up));
      const words = P.HANDS.includes(text) ? up ? "Lower your hand" : "Raise your hand" : `${up ? "Unpin" : "Pin"} ${text}`;
      bar.hand.setAttribute("aria-label", words);
      bar.hand.title = `${words}: stays over your Ooga until toggled off${net.state.customHand ? " · long-press to change" : ""}`;
      bar.hand.setAttribute("aria-haspopup", net.state.customHand ? "dialog" : "false");
    }
  };

  // Available only signed in, in a live room that takes reactions.
  let available = false;
  const account = () => {
    const s = net.state, on = !!s.me && s.reactions && s.room === "live", hide = !s.me || !s.reactions;
    for (const bar of bars) {
      if (bar.host.hidden !== hide) bar.host.hidden = hide;
      for (const b of bar.buttons) b.disabled = !on;
      // A bar may hold the hand to a rule of its own (Ooga Chat's panel: an active speaker only); it stays in view.
      bar.hand.disabled = !on || !!bar.handAllowed && !bar.handAllowed();
    }
    if (available !== on) { available = on; if (!on) { cancelHold(); close(); } }
    paint();
  };

  const react = (i) => net.sendReaction(shown(slots[i]));

  // A long press: a held pointer that stays put opens the picker and swallows the click that follows.
  let holdTimer = 0, holdSlot = -1, holdBar = null, holdX = 0, holdY = 0, holdPointer = null, swallow = false;
  const cancelHold = () => { window.clearTimeout(holdTimer); holdTimer = 0; holdSlot = -1; holdPointer = null; };
  const wire = (bar) => {
    bar.card.addEventListener("pointerdown", (e) => {
      const b = e.target.closest(".reaction[data-slot]");
      if (e.isPrimary === false || holdPointer !== null) { cancelHold(); swallow = true; return; }
      swallow = false;
      if (!b || b.disabled || e.button !== 0) return;
      if (b === bar.hand && !net.state.customHand) return;
      holdPointer = e.pointerId;
      holdSlot = Number(b.dataset.slot); holdBar = bar; holdX = e.clientX; holdY = e.clientY;
      window.clearTimeout(holdTimer);
      holdTimer = window.setTimeout(() => {
        holdTimer = 0;
        swallow = true;
        if (holdSlot >= 0) open(holdBar, holdSlot);
      }, HOLD_MS);
    });
    bar.card.addEventListener("pointermove", (e) => {
      if (holdPointer === e.pointerId && Math.hypot(e.clientX - holdX, e.clientY - holdY) > MOVE_PX) { cancelHold(); swallow = true; }
    });
    for (const type of ["pointerup", "pointercancel", "pointerleave"]) bar.card.addEventListener(type, (e) => {
      if (holdPointer !== e.pointerId) return;
      if (type !== "pointerup") swallow = true;
      cancelHold();
    });
    bar.card.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const b = e.target.closest(".reaction[data-slot]");
      cancelHold();
      // A touch's long press opened it already; a right click opens it now.
      if (b && !b.disabled && !(picker && !picker.root.hidden && pickSlot === Number(b.dataset.slot))) open(bar, Number(b.dataset.slot));
    });
    bar.card.addEventListener("click", (e) => {
      const b = e.target.closest(".reaction");
      if (!b || b.disabled) return;
      if (swallow) { swallow = false; return; }
      if (b === bar.hand) setPersistent(!net.state.hand);
      else react(Number(b.dataset.slot));
    });
    bar.card.addEventListener("keydown", (e) => {
      const b = e.target.closest(".reaction[data-slot]");
      if (!b || !(e.key === "ContextMenu" || e.key === "F10" && e.shiftKey)) return;
      e.preventDefault();
      open(bar, Number(b.dataset.slot));
    });
  };

  // The picker, one for both bars, floating in the middle of the screen over everything, outside the panels.
  let picker = null, pickSlot = -1, pickBar = null;
  const build = () => {
    const root = document.createElement("div"), head = document.createElement("div"), title = document.createElement("span"), current = document.createElement("span");
    const closeButton = document.createElement("button"), tools = document.createElement("div"), search = document.createElement("input"), tones = document.createElement("div");
    const nav = document.createElement("div"), grid = document.createElement("div"), foot = document.createElement("div"), reset = document.createElement("button");
    const hearts = document.createElement("div");
    root.className = "reaction-picker"; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Choose a reaction"); root.hidden = true;
    document.body.append(root);
    head.className = "reaction-picker-head";
    title.className = "reaction-picker-title"; current.className = "reaction-picker-current";
    title.append("Replace ", current);
    closeButton.type = "button"; closeButton.className = "reaction-picker-close"; closeButton.setAttribute("aria-label", "Close"); closeButton.textContent = "×";
    head.append(title, closeButton);
    tools.className = "reaction-picker-tools";
    search.type = "search"; search.className = "reaction-picker-search"; search.placeholder = "Search emoji"; search.setAttribute("aria-label", "Search emoji");
    search.autocomplete = "off"; search.spellcheck = false;
    tones.className = "reaction-tones"; tones.setAttribute("role", "radiogroup"); tones.setAttribute("aria-label", "Skin tone");
    const toneButtons = TONE_NAMES.map((name, t) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "reaction-tone"; b.dataset.tone = String(t); b.setAttribute("role", "radio"); b.setAttribute("aria-label", name); b.title = name;
      tones.append(b);
      return b;
    });
    tools.append(search, tones);
    hearts.className = "reaction-hearts"; hearts.setAttribute("role", "radiogroup"); hearts.setAttribute("aria-label", "Heart colour");
    const heartButtons = HEARTS.map((h, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "reaction-heart"; b.dataset.heart = String(i); b.setAttribute("role", "radio");
      b.setAttribute("aria-label", `${HEART_NAMES[i]} heart`); b.title = `${HEART_NAMES[i]} heart`; b.textContent = h;
      hearts.append(b);
      return b;
    });
    nav.className = "reaction-picker-nav"; nav.setAttribute("role", "group"); nav.setAttribute("aria-label", "Emoji groups");
    grid.className = "reaction-picker-grid";
    const all = [], toneable = [], sections = [];
    BL.emojiData.groups.forEach((group, g) => {
      const jump = document.createElement("button"), heading = document.createElement("h4"), set = document.createElement("div");
      jump.type = "button"; jump.className = "reaction-picker-jump"; jump.dataset.group = String(g); jump.textContent = GROUP_ICONS[group.name] || group.emoji[0][0];
      jump.setAttribute("aria-label", group.name); jump.title = group.name;
      nav.append(jump);
      heading.className = "reaction-picker-group"; heading.textContent = group.name;
      set.className = "reaction-picker-set";
      const items = [];
      for (const [emoji, name, light] of group.emoji) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "reaction-choice"; b.dataset.e = emoji; b.title = name; b.setAttribute("aria-label", name);
        b.textContent = emoji;
        set.append(b);
        const item = { b, emoji, name: name.toLowerCase() };
        all.push(item); items.push(item);
        if (light) toneable.push(item);
      }
      grid.append(heading, set);
      sections.push({ heading, set, items });
    });
    foot.className = "reaction-picker-foot";
    reset.type = "button"; reset.className = "link reaction-picker-reset"; reset.textContent = "Reset to defaults";
    foot.append(reset);
    root.append(head, tools, hearts, nav, grid, foot);
    const p = { root, current, search, toneButtons, grid, all, toneable, sections };
    const paintTones = () => {
      for (const item of toneable) { const text = P.toned(item.emoji, tone); if (item.b.textContent !== text) item.b.textContent = text; }
      toneButtons.forEach((b, t) => b.setAttribute("aria-checked", String(t === tone)));
      heartButtons.forEach((b, i) => b.setAttribute("aria-checked", String(i === heart)));
    };
    p.paintTones = paintTones;
    paintTones();
    closeButton.addEventListener("click", () => close(true));
    tones.addEventListener("click", (e) => {
      const b = e.target.closest(".reaction-tone");
      if (!b) return;
      tone = Number(b.dataset.tone);
      save();
      paintTones();
      p.current.textContent = shown(selected(pickSlot));
      // A raised hand takes the new tone at once.
      syncPersistent();
      paint();
    });
    hearts.addEventListener("click", (e) => {
      const b = e.target.closest(".reaction-heart");
      if (!b) return;
      heart = Number(b.dataset.heart);
      save();
      paintTones();
      p.current.textContent = shown(selected(pickSlot));
      syncPersistent();
      paint();
    });
    nav.addEventListener("click", (e) => {
      const b = e.target.closest(".reaction-picker-jump");
      if (!b) return;
      const section = sections[Number(b.dataset.group)];
      if (!section.heading.hidden) grid.scrollTop = section.heading.offsetTop - grid.offsetTop;
    });
    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      for (const section of sections) {
        let any = false;
        for (const item of section.items) { const hide = !!q && !item.name.includes(q); if (item.b.hidden !== hide) item.b.hidden = hide; any = any || !hide; }
        section.heading.hidden = section.set.hidden = !any;
      }
      grid.scrollTop = 0;
    });
    grid.addEventListener("click", (e) => {
      const b = e.target.closest(".reaction-choice");
      if (!b) return;
      choose(b.dataset.e);
    });
    reset.addEventListener("click", () => {
      slots = P.DEFAULTS.slice();
      tone = 0;
      heart = 0;
      persistent = P.HAND;
      save();
      paintTones();
      syncPersistent();
      paint();
      close(true);
    });
    root.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close(true);
    });
    return p;
  };
  const choose = (picked) => {
    if (pickSlot < 0) return;
    if (HEARTS.includes(picked)) heart = HEARTS.indexOf(picked);
    const emoji = asSlot(picked);
    if (pickSlot === PERSISTENT) persistent = emoji;
    else {
      const was = slots[pickSlot], other = slots.indexOf(emoji);
      if (other >= 0) slots[other] = was;
      slots[pickSlot] = emoji;
    }
    syncPersistent();
    save();
    paint();
    close(true);
  };
  // Closes on a press outside it, as every popup does.
  const outside = (e) => {
    if (picker && !picker.root.contains(e.target)) close(false);
  };
  const open = (bar, slot) => {
    if (!available || slot === PERSISTENT && !net.state.customHand) return;
    if (!picker) picker = build();
    pickSlot = slot; pickBar = bar;
    picker.current.textContent = shown(selected(slot));
    picker.current.title = label(selected(slot));
    picker.search.value = "";
    picker.search.dispatchEvent(new Event("input"));
    picker.root.hidden = false;
    for (const bar of bars) bar.card.dataset.picking = String(bar === pickBar);
    for (const b of [...bar.buttons, bar.hand]) b.dataset.picking = String(Number(b.dataset.slot) === slot);
    document.addEventListener("pointerdown", outside, true);
    // A fine pointer types the search at once; a phone's keyboard would cover the grid, so it waits for a tap.
    if (window.matchMedia("(pointer: fine)").matches) picker.search.focus({ preventScroll: true });
    else picker.root.querySelector(".reaction-picker-close").focus({ preventScroll: true });
  };
  const close = (refocus) => {
    swallow = false;
    if (!picker || picker.root.hidden) return;
    picker.root.hidden = true;
    document.removeEventListener("pointerdown", outside, true);
    for (const bar of bars) { delete bar.card.dataset.picking; for (const b of [...bar.buttons, bar.hand]) delete b.dataset.picking; }
    if (refocus && pickBar) (pickSlot === PERSISTENT ? pickBar.hand : pickBar.buttons[pickSlot]).focus({ preventScroll: true });
    pickSlot = -1; pickBar = null;
  };

  window.addEventListener("blur", cancelHold);
  document.addEventListener("visibilitychange", () => { if (document.hidden) { cancelHold(); close(); } });
  for (const id of ["players-reactions", "chat-reactions"]) wire(makeBar($(id)));
  net.subscribe(account);
  account();

  // The hand's key (H, director.js): false where there is no room to raise it in, so the key stays with the scene.
  const toggleHand = () => available && (setPersistent(!net.state.hand), true);

  // Another panel's bar (cloud-panel.js), on the same state; `handAllowed` gates its hand, asked again on `refresh`.
  const mount = (host, { handAllowed = null } = {}) => { wire(makeBar(host, handAllowed)); account(); };

  BL.reactions = {
    close,
    mount,
    refresh: account,
    toggleHand,
    get slots() { return slots.slice(); },
    get tone() { return tone; },
    get heart() { return HEARTS[heart]; },
    get persistent() { return persistent; },
    stats: () => ({ bars: bars.length, available, open: !!picker && !picker.root.hidden, slot: pickSlot, picker: picker ? picker.all.length : 0 })
  };
})();
