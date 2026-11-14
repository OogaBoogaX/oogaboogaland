// Reviewed links to independent lands. These are navigations, never imported code or remote previews.
// Adding a row places it in the Bifrost directory without consuming a physical cave or an NPC work site.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const FIELDS = ["id", "name", "description", "repository", "url", "status"];
  const text = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
  const validate = (data) => {
    if (!data || data.schema !== 1 || Object.keys(data).some(key => key !== "schema" && key !== "entries") || !Array.isArray(data.entries) || data.entries.length > 64) throw new Error("Invalid cave directory schema or capacity");
    const ids = new Set();
    for (const row of data.entries) {
      if (!row || Object.keys(row).length !== FIELDS.length || FIELDS.some(key => !Object.hasOwn(row, key))
        || !text(row.id, 48) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.id) || ids.has(row.id)
        || !text(row.name, 64) || !text(row.description, 240) || !text(row.repository, 140)
        || !/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*$/i.test(row.repository) || !["open", "unavailable", "retired"].includes(row.status)
        || !text(row.url, 2048)) throw new Error("Invalid cave directory entry");
      const url = new URL(row.url);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.port || url.href !== row.url) throw new Error("Cave destinations must be canonical HTTPS URLs without credentials or payloads");
      ids.add(row.id);
    }
    return data;
  };
  const registry = validate({ schema: 1, entries: [
    // This is the existing lab display's external link, not a newly certified third-party release.
    { id: "entropylab", name: "EntropyLab site", description: "The independent EntropyLab project site, also linked from the mainland lab display.", repository: "OogaBoogaX/entropylab", url: "https://entropylab.online/", status: "open" }
  ] });
  for (const row of registry.entries) Object.freeze(row);
  Object.freeze(registry.entries); Object.freeze(registry);

  const create = ({ button, hold, travel }) => {
    const controller = new AbortController(), options = { signal: controller.signal };
    const dialog = document.createElement("dialog");
    dialog.id = "cave-directory"; dialog.className = "modal cave-directory";
    dialog.setAttribute("aria-labelledby", "cave-directory-title");
    dialog.setAttribute("aria-describedby", "cave-directory-note");
    let opened = false, disposed = false;
    const element = (tag, text, parent) => {
      const node = document.createElement(tag);
      if (text) node.textContent = text;
      parent.append(node); return node;
    };
    const header = element("div", "", dialog); header.className = "panel-head";
    element("h2", "Caves and lands", header).id = "cave-directory-title";
    const done = element("button", "×", header); done.type = "button"; done.className = "modal-close"; done.setAttribute("aria-label", "Close caves and lands");
    const note = element("p", "Explore OBL's caves or visit an independent site. External sites open in this tab; use browser Back to return. Your OBL identity, inventory and voice are not transferred. Sites receive normal browser request metadata.", dialog);
    note.id = "cave-directory-note";
    const groups = element("div", "", dialog);
    const close = (focus = true) => {
      if (!opened) return;
      opened = false;
      dialog.close(); hold(false);
      button.setAttribute("aria-expanded", "false");
      BL.controls.resetAll();
      if (focus && button.isConnected) button.focus({ preventScroll: true });
    };
    const link = (parent, label, href) => {
      const anchor = element("a", label, parent);
      anchor.href = href; anchor.rel = "noopener noreferrer"; anchor.referrerPolicy = "no-referrer";
      return anchor;
    };
    const render = () => {
      groups.replaceChildren();
      const group = title => { const section = element("section", "", groups); element("h3", title, section); return element("ul", "", section); };
      const internal = (list, name, id, place, repository) => {
        const item = element("li", "", list);
        element("strong", name, item);
        const actions = element("div", "", item); actions.className = "cave-directory-actions";
        const visit = element("button", "Visit in OBL", actions); visit.type = "button";
        visit.addEventListener("click", () => { if (travel(id, place)) close(false); });
        if (repository) link(actions, "Source repository ↗", `https://github.com/${repository}`).target = "_blank";
      };
      const caves = group("Mainland caves · integrated");
      for (const slot of BL.caves.slots) {
        if (!slot.name || !["open", "mirror"].includes(slot.status) || slot.scene && !BL.scenes[slot.scene]) continue;
        const route = BL.routes.list.find(row => slot.place ? row.scene === "hub" && row.place === slot.place
          : slot.scene === "lab" ? row.scene === "hub" && row.place === "lab" : slot.scene && row.scene === slot.scene);
        // The mirror cave has no route of its own; the hub still stands an Ooga at its mouth.
        internal(caves, slot.name, route?.scene || "hub", route?.place || (slot.status === "mirror" ? "mirror" : null), slot.repo || slot.link);
      }
      const worlds = group("₿IFRÖST windows · integrated");
      for (const window of BL.bifrostModels.WINDOWS) if (window.kind === "travel" && BL.scenes[window.scene]) internal(worlds, window.name, window.scene, null, null);
      const external = group("Independent sites · external");
      for (const row of registry.entries) {
        const item = element("li", "", external); item.dataset.land = row.id;
        element("strong", row.name, item);
        element("p", row.description, item);
        element("p", `${new URL(row.url).hostname} · ${row.status === "open" ? "External site" : row.status === "retired" ? "Retired" : "Unavailable"}`, item);
        const actions = element("div", "", item); actions.className = "cave-directory-actions";
        if (row.status === "open") link(actions, "Visit external site ↗", row.url).dataset.externalLand = row.id;
        link(actions, "Source repository ↗", `https://github.com/${row.repository}`).target = "_blank";
      }
      if (!registry.entries.length) element("li", "No independent sites are listed yet.", external);
    };
    const open = () => {
      if (disposed || opened || document.querySelector("dialog[open]")) return false;
      render();
      BL.controls.resetAll(); hold(true);
      if (document.pointerLockElement) document.exitPointerLock();
      dialog.showModal(); opened = true;
      button.setAttribute("aria-expanded", "true");
      done.focus({ preventScroll: true });
      return true;
    };
    dialog.addEventListener("cancel", event => { event.preventDefault(); close(); }, options);
    dialog.addEventListener("close", () => { if (!dialog.open) close(); }, options);
    dialog.addEventListener("keydown", event => {
      event.stopPropagation();
      // Also handles synthetic controller Escape, which has no browser default action.
      if (event.key === "Escape") { event.preventDefault(); close(); }
    }, options);
    done.addEventListener("click", () => close(), options);
    button.setAttribute("aria-controls", dialog.id); button.setAttribute("aria-haspopup", "dialog"); button.setAttribute("aria-expanded", "false");
    document.body.append(dialog);
    const dispose = () => {
      if (disposed) return;
      close(false); disposed = true; controller.abort(); dialog.remove();
    };
    return { open, close, dispose, get opened() { return opened; } };
  };
  BL.caveDirectory = Object.freeze({ registry, validate, create });
})();
