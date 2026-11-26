// Ooga Chat's roster as circles, the island's (cloud-panel.js) and Ooga Chat's alike (#656): everyone in an outdoor zone,
// as many to a row as fit at 76 px or more a column, in the order the caller hands them (speakers first), the whole list scrolling in its slab. A tile is a
// portrait (a picture, or the native Ooga face when there is none or it fails, asked for once) carrying a speaker's
// source ring (green from the island, purple from Ooga Chat; in a hosted chat green while the speaker walks the chat's
// island with their Ooga, `walking`, else purple) and, over its centre, a raised hand or a reaction; then
// the name on one line, cut short with its whole self in the title; then
// the role, a speaker's voice mark first. Reads nothing at load but window.BL, so Ooga Chat shares it.
// `create(list, { mic(id), menu(id, tile) })` takes the <ul>, what a press on a voice mark does and, optionally, on a
// portrait or Enter or Space on a focused tile (a hosted chat's tile menu). Returns:
//   draw(items, describe)  one pass in the list's order: `describe(item, tile)` writes each item into one scratch tile
//                          ({ id, display, role, source, walking, face, look, hand, self, micDisabled, micPressed, micWords, and
//                          and a hosted chat's `rank` and `request` as `data-` attributes, `chat` saying "speaking",
//                          and `reconnecting`: a dropped one's tile dimmed in its place, Reconnecting… for its role).
//                          A tile's nodes are kept by id, only changed fields are written, a tile moves only when out
//                          of place, and one whose item has gone is dropped with its picture cancelled
//   repaint(describe)      the speakers' tiles again, from the items they were drawn from (a microphone's state changes
//                          far more often than the list, and only speakers have one)
//   prune(keep)            drops every tile whose id `keep(id)` refuses, cancelling its picture (for a list that changed
//                          while hidden, which is drawn again only once shown)
//   pop(id, emoji)         a reaction over that tile's centre, as Online Oogas' rows show one (reaction-bar.js `pop`): the
//                          newest replaces the one before
//   clear()                every tile gone (a sign-out)
//   count                  the tiles kept
//   dispose()
// The list has one tab stop: the arrow keys, Home and End move through the tiles, up and down a row of the grid at a
// time; a speaker's voice mark is a button of its own. No timers, no frame work.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const set = (el, key, value) => { if (el[key] !== value) el[key] = value; };
  const attr = (el, key, value) => { if (el.getAttribute(key) !== value) el.setAttribute(key, value); };
  const make = (tag, className) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  };
  const create = (list, { mic = () => {}, menu = null } = {}) => {
    const tiles = new Map();
    const tile = { id: "", display: "", role: "listener", source: "", walking: false, face: "", look: "", hand: "", self: false, micDisabled: true, micPressed: false, micWords: "", rank: "", request: "", chat: false, reconnecting: false };
    let mark = 0, current = null;
    const build = (id) => {
      const li = make("li", "cloud-tile"), face = make("span", "cloud-face"), portrait = make("span", "cloud-portrait");
      const react = make("span", "cloud-react"), hand = make("span", "cloud-hand"), name = make("span", "cloud-name");
      const popped = make("span", "cloud-pop");
      const text = make("span", "cloud-name-text"), role = make("span", "cloud-role");
      const voice = make("button", "roster-voice cloud-mic"), word = make("span", "");
      voice.type = "button";
      voice.append(BL.nativeIcons.voice());
      popped.hidden = true;
      popped.setAttribute("aria-hidden", "true");
      react.append(hand, popped);
      // An open request's badge (chat-hosts.css `.cloud-badge`, shown by the tile's `data-request`): an outlined microphone
      // for one who asked or was invited to speak, an outlined star for a co-host offer. The tile's label says it in words.
      const badge = make("span", "cloud-badge");
      badge.setAttribute("aria-hidden", "true");
      badge.innerHTML = '<svg viewBox="0 0 24 24"><path class="badge-mic" d="M12 3.5a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-5 0V6A2.5 2.5 0 0 1 12 3.5zM7 11a5 5 0 0 0 10 0M12 16v3.5"/><path class="badge-star" d="M12 3.8l2.4 5 5.4.6-4 3.7 1.1 5.4L12 15.8l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/></svg>';
      face.append(portrait, react, badge);
      name.append(text);
      role.append(voice, word);
      li.dataset.id = id;
      li.tabIndex = -1;
      li.append(face, name, role);
      return { li, portrait, react, hand, text, voice, word, item: null, img: null, url: null, popped, reacting: null, mark: 0, lv: -1 };
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
      const t = tile, speaker = t.role === "speaker", source = speaker ? t.walking ? "world" : t.source : "";
      if (entry.li.dataset.role !== t.role) entry.li.dataset.role = t.role;
      if (entry.li.dataset.source !== source) entry.li.dataset.source = source;
      set(entry.text, "textContent", t.display);
      set(entry.text, "title", t.display);
      // A host's or co-host's rank is its label, on stage or not (docs/ooga-chat-hosts.md); everyone else's, their role.
      set(entry.word, "textContent", t.reconnecting ? "Reconnecting…" : t.rank === "host" ? "Host" : t.rank === "cohost" ? "Co-host" : speaker ? "Speaker" : "Listener");
      if ((entry.li.dataset.reconnecting || "") !== (t.reconnecting ? "true" : "")) { if (t.reconnecting) entry.li.dataset.reconnecting = "true"; else delete entry.li.dataset.reconnecting; }
      picture(entry, t.face);
      set(entry.hand, "textContent", t.hand);
      set(entry.hand, "title", t.hand ? `${t.display} has ${t.hand} up` : "");
      set(entry.voice, "hidden", !speaker || t.reconnecting);
      if (speaker) {
        if (entry.voice.dataset.voice !== t.look) entry.voice.dataset.voice = t.look;
        attr(entry.voice, "aria-pressed", String(t.micPressed));
        set(entry.voice, "disabled", t.micDisabled);
        attr(entry.voice, "aria-label", t.micWords);
        set(entry.voice, "title", t.micWords);
      }
      if ((entry.li.dataset.rank || "") !== t.rank) entry.li.dataset.rank = t.rank;
      if ((entry.li.dataset.request || "") !== t.request) entry.li.dataset.request = t.request;
      const where = speaker ? t.chat ? "speaking" : source === "world" ? "speaking from the island" : "speaking from Ooga Chat" : "listening";
      attr(entry.li, "aria-label", `${t.display}${t.self ? " (you)" : ""}${t.rank ? `, ${t.rank === "cohost" ? "co-host" : t.rank}` : ""}, ${where}${t.reconnecting ? ", reconnecting" : speaker && t.look === "muted" ? ", muted" : ""}${t.request === "cohost" ? ", invited to co-host" : t.request ? `, ${t.request} to speak` : ""}`);
    };
    const drop = (id, entry) => {
      cancel(entry);
      if (entry.reacting) { entry.reacting.cancel(); entry.reacting = null; }
      entry.li.remove();
      tiles.delete(id);
    };
    const draw = (items, describe) => {
      mark++;
      const active = document.activeElement, held = active && active.parentElement === list ? active : null;
      let i = 0;
      for (const item of items) {
        tile.walking = false;
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
        tile.walking = false;
        describe(entry.item, tile);
        paint(entry);
      }
    };
    // The speakers' voice marks' levels (style.css `--lv`), from the page's meter read (`level(id)`, 0 to 1), each written
    // only when it moves by a step a tile can show.
    const levels = (level) => {
      for (const [id, entry] of tiles) {
        if (entry.voice.hidden) continue;
        const v = Math.round(level(id) * 20) / 20;
        if (entry.lv !== v) { entry.lv = v; entry.voice.style.setProperty("--lv", String(v)); }
      }
    };
    const prune = (keep) => {
      for (const [id, entry] of tiles) if (!keep(id)) drop(id, entry);
    };
    const pop = (id, emoji) => {
      const entry = tiles.get(id);
      if (!entry || !entry.li.isConnected) return;
      if (entry.reacting) entry.reacting.cancel();
      entry.popped.textContent = emoji; entry.popped.hidden = false;
      const run = entry.reacting = BL.reactionBar.pop(entry.popped);
      run.onfinish = () => {
        if (entry.reacting !== run) return;
        entry.reacting = null; entry.popped.hidden = true;
      };
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
      if (menu && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); return menu(from.dataset.id, from); }
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
      const face = menu && event.target.closest(".cloud-face");
      if (face && list.contains(face)) menu(face.parentElement.dataset.id, face.parentElement);
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
    return { draw, repaint, levels, prune, pop, clear, dispose, get count() { return tiles.size; } };
  };
  BL.audienceTiles = { create };
})();
