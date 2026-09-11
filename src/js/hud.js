(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { canvasRenderer } = BL;
  const { formatLarge } = BL.game;
  const { createNode, addChild, createCamera, boundsOf } = BL.scene;
  const STATE_LABELS = { working: "EATING", sleeping: "ZZZ", away: "AWAY" };
  const $ = (id) => document.getElementById(id);
  const TIER_RANK = { legendary: 0, epic: 1, rare: 2, common: 3 };
  // Headings in the cave-sign lettering: one path of pixels per element, scaled by its CSS height
  const SIGN_NS = "http://www.w3.org/2000/svg";
  // Markup may wrap a sign across lines; the lettering wants one run of words
  const signText = (raw) => raw.replace(/\s+/g, " ").trim();
  const signLettering = (raw) => {
    const { SIGN_GLYPHS } = BL.hubModels;
    const text = signText(raw);
    let cells = -1;
    for (const ch of text) cells += ch === " " ? 2 : 4;
    const svg = document.createElementNS(SIGN_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${cells} 6`);
    svg.setAttribute("class", "sign");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(SIGN_NS, "path");
    let d = "", cursor = 0;
    for (const ch of text) {
      if (ch === " ") {
        cursor += 2;
        continue;
      }
      const glyph = SIGN_GLYPHS[ch];
      if (!glyph) throw new Error(`No cave-sign glyph for "${ch}"`);
      for (let row = 0; row < glyph.length; row++) {
        for (let col = 0; col < glyph[row].length; col++) {
          if (glyph[row][col] === "1") d += `M${cursor + col} ${row}h.82v.82h-.82z`;
        }
      }
      cursor += 4;
    }
    path.setAttribute("d", d);
    path.setAttribute("fill", "currentColor");
    svg.append(path);
    return svg;
  };
  for (const el of document.querySelectorAll("[data-sign]")) {
    const text = signText(el.textContent);
    el.setAttribute("aria-label", text);
    el.replaceChildren(signLettering(text));
  }
  // The panel shows itself once on load, then folds away unless the visitor is using it
  const INTRO_MS = 5000;
  let introTimer = 0;
  // Swag icons drawn once into an offscreen canvas
  const ICON_PX = 48;
  const renderIcon = (item) => {
    const canvas = document.createElement("canvas");
    const iconRenderer = canvasRenderer.createRenderer(canvas, { width: ICON_PX, height: ICON_PX, transparent: true });
    const iconRoot = createNode();
    const node = item.buildNode();
    const bounds = boundsOf(node.geometry);
    const fit = 0.62 / Math.max(bounds.radius, 0.05);
    Object.assign(node.scale, { x: fit, y: fit, z: fit });
    Object.assign(node.position, { x: -bounds.center[0] * fit, y: -bounds.center[1] * fit, z: -bounds.center[2] * fit });
    if (item.rotation) Object.assign(node.rotation, item.rotation);
    addChild(iconRoot, node);
    const iconCamera = createCamera({ fov: 32, near: 0.1, far: 20 });
    Object.assign(iconCamera.position, { x: 1.6, y: 1.4, z: 2.4 });
    Object.assign(iconCamera.target, { x: 0, y: 0, z: 0 });
    iconRenderer.render(iconRoot, iconCamera);
    return canvas;
  };
  const create = ({ roster, catalog, tierColors, renderIcon, lootEnabled = false }) => {
    const el = {
      meterFill: $("meter-fill"),
      meterCount: $("meter-count"),
      meterForecast: $("meter-forecast"),
      roster: $("roster"),
      statDonations: $("stat-donations"),
      statSats: $("stat-sats"),
      lootTab: $("loot-tab"),
      lootCount: $("loot-count"),
      crateHelp: $("crate-help"),
      worldLootHint: $("world-loot-hint"),
      subtitle: $("subtitle"),
      actions: [...document.querySelectorAll("[data-action]")],
      act: $("act"),
      toast: $("toast"),
      tooltip: $("tooltip"),
      hint: $("hint"),
      sheet: $("sheet"),
      sheetToggle: $("sheet-toggle"),
      sheetBananas: $("sheet-bananas"),
      tabs: [...document.querySelectorAll("[data-tab]")],
      panels: [...document.querySelectorAll("[data-panel]")],
      presets: [...document.querySelectorAll("[data-preset]")],
      inventory: $("inventory"),
      inventoryEmpty: $("inventory-empty"),
      handle: $("handle"),
      message: $("message"),
      qr: $("qr"),
      qrUrl: $("qr-url"),
      feed: $("feed")
    };
    el.lootTab.hidden = !lootEnabled;
    el.crateHelp.hidden = !lootEnabled;
    el.worldLootHint.hidden = !lootEnabled;
    const listeners = [];
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      listeners.push(() => target.removeEventListener(type, fn, opts));
    };
    let toastTimer = 0, hintTimer = 0;
    const rosterRows = new Map();
    for (const contributor of roster) {
      const li = document.createElement("li");
      li.dataset.name = contributor.name;
      const name = document.createElement("span");
      name.className = "roster-name";
      name.textContent = contributor.name;
      const age = document.createElement("span");
      age.className = "roster-age";
      const state = document.createElement("span");
      state.className = "roster-state";
      li.append(name, age, state);
      el.roster.append(li);
      rosterRows.set(contributor.name, { li, state, age });
    }
    const setRosterRow = (name, stateKey, ageText) => {
      const row = rosterRows.get(name);
      if (!row) return;
      row.state.dataset.state = stateKey;
      row.state.textContent = STATE_LABELS[stateKey] || stateKey;
      if (ageText != null) row.age.textContent = ageText;
    };
    // Mutate the text nodes so updates make no DOM
    for (const node of [el.meterCount, el.meterForecast]) if (!node.firstChild) node.append("");
    const setMeter = (level, capacity, forecastText) => {
      el.meterFill.style.width = `${Math.min(100, Math.max(0, level / capacity * 100))}%`;
      el.meterFill.dataset.level = level < capacity * 0.15 ? "low" : level < capacity * 0.4 ? "mid" : "ok";
      el.meterCount.firstChild.data = String(Math.floor(level));
      el.meterForecast.firstChild.data = forecastText;
    };
    const setStats = ({ totalSats, donations }) => {
      el.statDonations.textContent = String(donations);
      el.statSats.textContent = formatLarge(totalSats);
    };
    const setAct = (label) => {
      el.act.textContent = label;
    };
    const setSubtitle = (text) => {
      el.subtitle.textContent = text;
    };
    let actionHandler = null;
    const onAction = (fn) => {
      actionHandler = fn;
    };
    // Open and close the feed dialog
    const openFeed = () => {
      if (!el.feed.open) el.feed.showModal();
    };
    const closeFeed = () => {
      if (el.feed.open) el.feed.close();
    };
    on(el.feed, "keydown", (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closeFeed();
    });
    for (const b of el.actions) on(b, "click", () => {
      b.blur();
      if (b.dataset.action === "feed") openFeed();
      else if (b.dataset.action === "feed-close") closeFeed();
      else actionHandler && actionHandler(b.dataset.action);
    });
    const toast = (text) => {
      el.toast.textContent = text;
      el.toast.hidden = false;
      el.toast.classList.add("show");
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => el.toast.classList.remove("show"), 2800);
    };
    let tipText = "", tipW = 0, tipH = 0;
    const tooltip = {
      show: (text, x, y) => {
        el.tooltip.hidden = false;
        if (text !== tipText) {
          tipText = text;
          el.tooltip.textContent = text;
          tipW = el.tooltip.offsetWidth;
          tipH = el.tooltip.offsetHeight;
        }
        const w = tipW, h = tipH;
        const left = Math.min(window.innerWidth - w - 8, x + 14);
        const top = y + 18 + h > window.innerHeight ? y - h - 10 : y + 18;
        el.tooltip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
      },
      hide: () => {
        el.tooltip.hidden = true;
        tipText = "";
      }
    };
    const hint = (text, ms = 4200) => {
      el.hint.textContent = text;
      el.hint.hidden = false;
      el.hint.classList.add("show");
      window.clearTimeout(hintTimer);
      hintTimer = window.setTimeout(() => el.hint.classList.remove("show"), ms);
    };
    const selectTab = (name) => {
      for (const t of el.tabs) t.setAttribute("aria-selected", String(t.dataset.tab === name));
      for (const p of el.panels) p.hidden = p.dataset.panel !== name;
      el.sheet.dataset.open = "true";
    };
    for (const t of el.tabs) {
      on(t, "click", () => {
        const already = t.getAttribute("aria-selected") === "true" && el.sheet.dataset.open === "true";
        if (already && window.matchMedia("(max-width: 720px)").matches) el.sheet.dataset.open = "false";
        else selectTab(t.dataset.tab);
      });
    }
    // Each pull tab opens straight onto its panel, and folds the sheet when that panel is already showing
    const pull = (name) => {
      window.clearTimeout(introTimer);
      const showing = el.sheet.dataset.open === "true" && el.tabs.some((t) => t.dataset.tab === name && t.getAttribute("aria-selected") === "true");
      if (showing) el.sheet.dataset.open = "false";
      else selectTab(name);
    };
    on(el.sheetToggle, "click", () => pull("roster"));
    on(el.sheetBananas, "click", () => pull("bananas"));
    on(el.sheet, "pointerdown", () => window.clearTimeout(introTimer));
    if (introTimer === 0) introTimer = window.setTimeout(() => {
      el.sheet.dataset.open = "false";
    }, INTRO_MS);
    let presetHandler = null;
    for (const b of el.presets) on(b, "click", () => {
      b.blur();
      presetHandler && presetHandler(b.dataset.preset);
    });
    const onPreset = (fn) => {
      presetHandler = fn;
    };
    let identityHandler = null;
    const onIdentityChange = (fn) => {
      identityHandler = fn;
    };
    const emitIdentity = () => identityHandler && identityHandler({ handle: el.handle.value, message: el.message.value });
    on(el.handle, "change", emitIdentity);
    on(el.message, "change", emitIdentity);
    const setIdentity = ({ handle, message }) => {
      el.handle.value = handle || "";
      el.message.value = message || "";
    };
    const setDonationUrl = (url) => {
      el.qrUrl.textContent = url;
    };
    let assignHandler = null, unassignHandler = null;
    const onAssign = (fn) => {
      assignHandler = fn;
    };
    const onUnassign = (fn) => {
      unassignHandler = fn;
    };
    const iconCache = new Map();
    const iconFor = (item) => {
      let icon = iconCache.get(item.id);
      if (!icon && renderIcon) {
        icon = renderIcon(item);
        iconCache.set(item.id, icon);
      }
      return icon;
    };
    const groupEntries = (entries) => {
      const groups = new Map();
      for (const entry of entries) {
        const item = catalog.find((c) => c.id === entry.itemId);
        if (!item) continue;
        let group = groups.get(item.id);
        if (!group) {
          group = { item, tier: entry.tier, entries: [] };
          groups.set(item.id, group);
        }
        group.entries.push(entry);
      }
      return [...groups.values()].sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.item.name.localeCompare(b.item.name));
    };
    const renderInventory = (entries, assignedTo, wornBy = () => null) => {
      el.inventory.replaceChildren();
      el.inventoryEmpty.hidden = entries.length > 0;
      el.lootCount.hidden = entries.length === 0;
      el.lootCount.textContent = String(entries.length);
      for (const group of groupEntries(entries)) {
        const { item } = group;
        const worn = group.entries.map((e) => ({ entry: e, name: assignedTo(e.id) })).filter((w) => w.name);
        const free = group.entries.filter((e) => !assignedTo(e.id));
        const li = document.createElement("li");
        li.className = "loot-row";
        li.style.setProperty("--tier", tierColors[group.tier]);
        const icon = iconFor(item);
        if (icon) {
          const canvas = document.createElement("canvas");
          canvas.className = "loot-icon";
          canvas.width = icon.width;
          canvas.height = icon.height;
          canvas.getContext("2d").drawImage(icon, 0, 0);
          li.append(canvas);
        }
        const main = document.createElement("div");
        main.className = "loot-main";
        const title = document.createElement("div");
        title.className = "loot-title";
        const name = document.createElement("span");
        name.className = "loot-name";
        name.textContent = item.name;
        const badge = document.createElement("span");
        badge.className = "loot-tier";
        badge.textContent = group.tier;
        title.append(name, badge);
        if (group.entries.length > 1) {
          const count = document.createElement("span");
          count.className = "loot-count";
          count.textContent = `×${group.entries.length}`;
          title.append(count);
        }
        main.append(title);
        if (worn.length) {
          const chips = document.createElement("div");
          chips.className = "loot-worn";
          for (const w of worn) {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "chip";
            chip.title = `Take ${item.name} off ${w.name}`;
            chip.textContent = w.name;
            chip.addEventListener("click", () => unassignHandler && unassignHandler(w.name));
            chips.append(chip);
          }
          main.append(chips);
        }
        li.append(main);
        const select = document.createElement("select");
        select.className = "loot-assign";
        select.setAttribute("aria-label", `Give ${item.name} to a caveman`);
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = free.length ? `Give one to… (${free.length} free)` : "All worn";
        select.append(placeholder);
        select.disabled = free.length === 0;
        for (const contributor of roster) {
          const opt = document.createElement("option");
          opt.value = contributor.name;
          const wearing = wornBy(contributor.name);
          opt.textContent = wearing ? `${contributor.name} · ${wearing}` : `${contributor.name} · no swag`;
          select.append(opt);
        }
        select.addEventListener("change", () => {
          const target = select.value;
          select.value = "";
          select.blur();
          if (target && free.length) assignHandler && assignHandler(free[0].id, target);
        });
        li.append(select);
        el.inventory.append(li);
      }
    };
    // Remove the rows and timers this instance added
    const dispose = () => {
      window.clearTimeout(toastTimer);
      window.clearTimeout(hintTimer);
      for (const off of listeners) off();
      el.roster.replaceChildren();
      el.inventory.replaceChildren();
      el.toast.classList.remove("show");
      el.hint.classList.remove("show");
      tooltip.hide();
      closeFeed();
    };
    return { el, openFeed, closeFeed, setRosterRow, setMeter, setStats, setAct, setSubtitle, onAction, toast, tooltip, hint, selectTab, onPreset, onIdentityChange, setIdentity, setDonationUrl, onAssign, onUnassign, renderInventory, dispose };
  };
  BL.hud = { create, renderIcon, signLettering, STATE_LABELS };
})();
