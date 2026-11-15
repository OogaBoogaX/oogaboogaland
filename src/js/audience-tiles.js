// Ooga Chat's roster as circles, the island's (cloud-panel.js) and Ooga Chat's alike (#656): everyone in an outdoor zone,
// four to a row, in the order the caller hands them (speakers first), the whole list scrolling in its slab. A tile is a
// portrait (a picture, or the native Ooga face when there is none or it fails, asked for once) carrying a speaker's
// source ring (green from the island, purple from Ooga Chat) and, over its corner, a raised hand or a reaction; then
// the name on one line, cut short with its whole self in the title (an Ooga Chat speaker's purple dot before it); then
// the role, a speaker's voice mark first. Reads nothing at load but window.BL, so Ooga Chat shares it.
// `create(list, { mic(id) })` takes the <ul> and what a press on a voice mark does, and returns:
//   draw(items, describe)  one pass in the list's order: `describe(item, tile)` writes each item into one scratch tile
//                          ({ id, display, role, source, face, look, hand, self, micDisabled, micPressed, micWords }).
//                          A tile's nodes are kept by id, only changed fields are written, a tile moves only when out
//                          of place, and one whose item has gone is dropped with its picture cancelled
//   repaint(describe)      the speakers' tiles again, from the items they were drawn from (a microphone's state changes
//                          far more often than the list, and only speakers have one)
//   prune(keep)            drops every tile whose id `keep(id)` refuses, cancelling its picture (for a list that changed
//                          while hidden, which is drawn again only once shown)
//   pop(id, emoji)         a reaction over that tile's corner for its own lifetime, a few at a time
//   clear()                every tile gone (a sign-out)
//   count                  the tiles kept
//   dispose()
// The list has one tab stop: the arrow keys, Home and End move through the tiles, up and down a row of the grid at a
// time; a speaker's voice mark is a button of its own. No timers, no frame work.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const POPS = 4;
  const set = (el, key, value) => { if (el[key] !== value) el[key] = value; };
  const attr = (el, key, value) => { if (el.getAttribute(key) !== value) el.setAttribute(key, value); };
  const make = (tag, className) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  };
  const create = (list, { mic = () => {} } = {}) => {
    const tiles = new Map();
    const tile = { id: "", display: "", role: "listener", source: "", face: "", look: "", hand: "", self: false, micDisabled: true, micPressed: false, micWords: "" };
    let mark = 0, current = null;
    const build = (id) => {
      const li = make("li", "cloud-tile"), face = make("span", "cloud-face"), portrait = make("span", "cloud-portrait");
      const react = make("span", "cloud-react"), hand = make("span", "cloud-hand"), name = make("span", "cloud-name");
      const dot = make("span", "cloud-dot"), text = make("span", "cloud-name-text"), role = make("span", "cloud-role");
      const voice = make("button", "roster-voice cloud-mic"), word = make("span", "");
      voice.type = "button";
      voice.append(BL.nativeIcons.voice());
      react.append(hand);
      face.append(portrait, react);
      name.append(dot, text);
      role.append(voice, word);
      li.dataset.id = id;
      li.tabIndex = -1;
      li.append(face, name, role);
      return { li, portrait, react, hand, text, voice, word, item: null, img: null, url: null, pops: 0, mark: 0 };
    };
    const ooga = (entry) => entry.portrait.replaceChildren(BL.nativeIcons.svg("roster"));
    const cancel = (entry) => {
      if (!entry.img) return;
      entry.img.onerror = null;
      entry.img.removeAttribute("src");
      entry.img = null;
    };
    const picture = (entry, url) => {
      if (entry.url === url) return;
      entry.url = url;
      cancel(entry);
      if (!url) return ooga(entry);
      const img = make("img", "");
      img.alt = "";
      img.decoding = "async";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => {
        if (entry.img !== img) return;
        entry.img = null;
        ooga(entry);
      };
      img.src = url;
      entry.img = img;
      entry.portrait.replaceChildren(img);
    };
    const paint = (entry) => {
      const t = tile, speaker = t.role === "speaker", source = speaker ? t.source : "";
      if (entry.li.dataset.role !== t.role) entry.li.dataset.role = t.role;
      if (entry.li.dataset.source !== source) entry.li.dataset.source = source;
      set(entry.text, "textContent", t.display);
      set(entry.text, "title", t.display);
      set(entry.word, "textContent", speaker ? "Speaker" : "Listener");
      picture(entry, t.face);
      set(entry.hand, "textContent", t.hand);
      set(entry.hand, "title", t.hand ? `${t.display} has ${t.hand} up` : "");
      set(entry.voice, "hidden", !speaker);
      if (speaker) {
        if (entry.voice.dataset.voice !== t.look) entry.voice.dataset.voice = t.look;
        attr(entry.voice, "aria-pressed", String(t.micPressed));
        set(entry.voice, "disabled", t.micDisabled);
        attr(entry.voice, "aria-label", t.micWords);
        set(entry.voice, "title", t.micWords);
      }
      const where = speaker ? source === "world" ? "speaking from the island" : "speaking from Ooga Chat" : "listening";
      attr(entry.li, "aria-label", `${t.display}${t.self ? " (you)" : ""}, ${where}${speaker && t.look === "muted" ? ", muted" : ""}`);
    };
    const drop = (id, entry) => {
      cancel(entry);
      entry.li.remove();
      tiles.delete(id);
    };
    const draw = (items, describe) => {
      mark++;
      const active = document.activeElement, held = active && active.parentElement === list ? active : null;
      let i = 0;
      for (const item of items) {
        describe(item, tile);
        let entry = tiles.get(tile.id);
        if (!entry) tiles.set(tile.id, entry = build(tile.id));
        entry.mark = mark;
        entry.item = item;
        paint(entry);
        const at = list.children[i];
        if (at !== entry.li) list.insertBefore(entry.li, at || null);
        i++;
      }
      for (const [id, entry] of tiles) if (entry.mark !== mark) drop(id, entry);
      if (!tiles.has(current)) current = list.children.length ? list.children[0].dataset.id : null;
      for (const [id, entry] of tiles) set(entry.li, "tabIndex", id === current ? 0 : -1);
      if (held && held.parentElement === list && document.activeElement !== held) held.focus({ preventScroll: true });
    };
    const repaint = (describe) => {
      for (const entry of tiles.values()) if (entry.li.dataset.role === "speaker") {
        describe(entry.item, tile);
        paint(entry);
      }
    };
    const prune = (keep) => {
      for (const [id, entry] of tiles) if (!keep(id)) drop(id, entry);
    };
    const pop = (id, emoji) => {
      const entry = tiles.get(id);
      if (!entry || !entry.li.isConnected || entry.pops >= POPS) return;
      const el = make("span", "cloud-pop");
      el.textContent = emoji;
      el.setAttribute("aria-hidden", "true");
      entry.pops++;
      el.addEventListener("animationend", () => { el.remove(); entry.pops--; }, { once: true });
      entry.react.append(el);
    };
    const clear = () => {
      for (const [id, entry] of tiles) drop(id, entry);
      current = null;
    };
    // A row of the grid is as many tiles as it lays out across.
    const columns = () => Math.max(1, getComputedStyle(list).gridTemplateColumns.split(" ").length);
    const onKey = (event) => {
      const from = event.target;
      if (from.parentElement !== list) return;
      const items = list.children, at = Array.prototype.indexOf.call(items, from);
      const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -columns() : event.key === "ArrowDown" ? columns() : 0;
      const to = step ? items[Math.max(0, Math.min(items.length - 1, at + step))] : event.key === "Home" ? items[0] : event.key === "End" ? items[items.length - 1] : null;
      if (!to) return;
      event.preventDefault();
      from.tabIndex = -1;
      to.tabIndex = 0;
      current = to.dataset.id;
      to.focus();
    };
    const onFocus = (event) => {
      if (event.target.parentElement === list) current = event.target.dataset.id;
    };
    const onClick = (event) => {
      const button = event.target.closest(".cloud-mic"), li = button && button.closest(".cloud-tile");
      if (li && !button.disabled) mic(li.dataset.id);
    };
    list.addEventListener("click", onClick);
    list.addEventListener("keydown", onKey);
    list.addEventListener("focusin", onFocus);
    const dispose = () => {
      list.removeEventListener("click", onClick);
      list.removeEventListener("keydown", onKey);
      list.removeEventListener("focusin", onFocus);
      clear();
    };
    return { draw, repaint, prune, pop, clear, dispose, get count() { return tiles.size; } };
  };
  BL.audienceTiles = { create };
})();
