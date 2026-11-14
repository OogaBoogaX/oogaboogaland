// Ooga Chat's frame: the native tabs above the plank frame and the view each tab shows. A tab is
// `{ id, label, icon, visible(state), view }`, where `view(ctx)` returns `{ node, update(state), dispose() }`.
// A view is built the first time its tab is chosen and then kept: switching tabs only hides it, and `update` only
// passes it the new state, so a view's own nodes and listeners (a sort, a draft, a voice control) outlive both.
// `dispose` is the one teardown: every built view's `dispose`, every listener the shell added, every node it made.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const create = ({ root, tabs, ctx = {}, selected = tabs[0].id, onSelect = () => {} }) => {
    const doc = root.ownerDocument, bar = root.querySelector(".oc-tabs"), stack = root.querySelector(".oc-views");
    const listeners = new AbortController(), { signal } = listeners;
    const entries = tabs.map((tab) => {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "oc-tab";
      button.id = `oc-tab-${tab.id}`;
      button.dataset.tab = tab.id;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-label", tab.label);
      button.setAttribute("aria-controls", `oc-view-${tab.id}`);
      button.title = tab.label;
      const face = doc.createElement("span");
      face.className = "oc-tab-face";
      face.append(BL.nativeIcons.svg(tab.icon));
      button.append(face);
      button.addEventListener("click", () => select(tab.id, true), { signal });
      bar.append(button);
      return { tab, button, panel: null, view: null };
    });
    let state = null, current = null, disposed = false;
    const byId = (id) => entries.find((entry) => entry.tab.id === id);
    const shown = () => entries.filter((entry) => !entry.button.hidden);
    // The first visit to a tab builds its view; later visits reuse it.
    const mount = (entry) => {
      if (entry.view) return;
      const panel = doc.createElement("section");
      panel.className = "oc-view";
      panel.id = `oc-view-${entry.tab.id}`;
      panel.dataset.view = entry.tab.id;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", entry.button.id);
      entry.view = entry.tab.view(ctx);
      panel.append(entry.view.node);
      stack.append(panel);
      entry.panel = panel;
      if (state) entry.view.update(state);
    };
    const select = (id, chosen = false) => {
      if (disposed) return;
      const entry = byId(id);
      if (!entry || entry.button.hidden) return;
      mount(entry);
      current = id;
      for (const other of entries) {
        const on = other === entry;
        other.button.setAttribute("aria-selected", String(on));
        other.button.tabIndex = on ? 0 : -1;
        if (other.panel) other.panel.hidden = !on;
      }
      if (chosen) onSelect(id);
    };
    // Arrow keys, Home and End move between the shown tabs, as the island's tablist does.
    bar.addEventListener("keydown", (event) => {
      const list = shown(), at = list.findIndex((entry) => entry.tab.id === current);
      const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
      const to = step ? list[(at + step + list.length) % list.length] : event.key === "Home" ? list[0] : event.key === "End" ? list.at(-1) : null;
      if (!to) return;
      event.preventDefault();
      select(to.tab.id, true);
      to.button.focus();
    }, { signal });
    // New state: tabs appear or hide by it, built views hear it, and a hidden current tab falls back to the first. The
    // first state opens the remembered tab (`selected`) if it shows; nothing is built before then.
    const update = (next) => {
      if (disposed) return;
      state = next;
      for (const entry of entries) entry.button.hidden = !entry.tab.visible(state);
      if (!current || byId(current).button.hidden) {
        const remembered = !current && byId(selected);
        select(remembered && !remembered.button.hidden ? selected : shown()[0].tab.id);
      }
      for (const entry of entries) if (entry.view) entry.view.update(state);
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      listeners.abort();
      for (const entry of entries) {
        if (entry.view) entry.view.dispose();
        entry.panel?.remove();
        entry.button.remove();
        entry.view = entry.panel = null;
      }
    };
    return { update, select, dispose,
      get selected() { return current; },
      get mounted() { return entries.filter((entry) => entry.view).map((entry) => entry.tab.id); } };
  };
  BL.oogaChatShell = { create };
})();
