(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { canvasRenderer } = BL;
  const { formatLarge } = BL.game;
  const { createNode, addChild, createCamera, boundsOf } = BL.scene;
  const STATE_LABELS = { working: "clankin", chilling: "chillin", sleeping: "sleepin", away: "chillin", online: "online" };
  // Tooltip dots retain their human-presence color without changing NPC activity.
  const statusFor = (cave) => cave.humanControlled ? "online" : cave.state === "away" ? "chilling" : cave.state;
  const $ = (id) => document.getElementById(id);
  const TIER_RANK = { legendary: 0, epic: 1, rare: 2, common: 3 };
  const BANANA_COUNT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const MESSAGE_FADE_MS = 300;
  // Sign headings: one pixel path per element, scaled by that element's CSS height.
  const SIGN_NS = "http://www.w3.org/2000/svg";
  // Collapse whitespace: markup may wrap a sign across lines but the lettering needs one run of words.
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
  // Panel shows itself once on load (INTRO_MS), then folds away unless the visitor is using it.
  const INTRO_MS = 5000;
  let introTimer = 0;
  // Icons are rasterized once into an offscreen canvas.
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
    iconRenderer.dispose();
    return canvas;
  };
  const create = ({ roster, catalog, tierColors, renderIcon, lootEnabled = false }) => {
    const el = {
      meterFill: $("meter-fill"),
      meterCount: $("meter-count"),
      meterForecast: $("meter-forecast"),
      worldBananas: $("world-bananas"),
      worldBananaCount: $("world-banana-count"),
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
      flyby: $("flyby"),
      weapon: $("weapon-hud"),
      weaponToggle: $("weapon-hud"),
      weaponReadout: $("weapon-readout"),
      weaponLabel: $("weapon-ammo-label"),
      weaponAmmo: $("weapon-ammo-count"),
      weaponCompact: $("weapon-ammo-compact"),
      weaponMagazine: $("weapon-magazine"),
      weaponBananas: [...$("weapon-magazine").querySelectorAll(".weapon-banana")],
      magazine: $("magazine-hud"),
      magazineIcon: $("magazine-hud").querySelector(".magazine-icon"),
      magazineFront: $("magazine-front"),
      magazineAmmo: $("magazine-ammo"),
      magazineBananas: [...$("magazine-front").querySelectorAll(".magazine-banana")],
      magazineLowAmmo: $("magazine-ammo-low"),
      magazineRearBananas: [...$("magazine-back").querySelectorAll(".magazine-banana")],
      jetpack: $("jetpack-hud"),
      jetpackFuel: $("jetpack-fuel"),
      jetpackFuelFill: $("jetpack-fuel-fill"),
      jetpackFuelValue: $("jetpack-fuel-value"),
      jetpackCompact: $("jetpack-fuel-compact"),
      messageStack: $("message-stack"),
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
      feed: $("feed"),
      recipe: $("recipe"),
      recipeText: $("recipe-text")
    };
    el.lootTab.hidden = !lootEnabled;
    el.crateHelp.hidden = !lootEnabled;
    el.worldLootHint.hidden = !lootEnabled;
    el.weapon.hidden = true;
    el.magazine.hidden = true;
    el.jetpack.hidden = true;
    const listeners = [];
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      listeners.push(() => target.removeEventListener(type, fn, opts));
    };
    let toastTimer = 0, toastHideTimer = 0, hintTimer = 0, hintHideTimer = 0, copyTimer = 0;
    const rosterRows = new Map();
    const orderedRoster = [...roster].sort((a, b) => b.lastCommitAt - a.lastCommitAt);
    for (let rosterIndex = 0; rosterIndex < orderedRoster.length; rosterIndex++) {
      const contributor = orderedRoster[rosterIndex];
      const li = document.createElement("li");
      li.dataset.name = contributor.name;
      const presence = document.createElement("span");
      presence.className = "roster-presence";
      presence.dataset.online = "false";
      presence.setAttribute("role", "img");
      presence.setAttribute("aria-label", "Offline");
      presence.title = "Offline";
      const name = document.createElement("span");
      name.className = "roster-name";
      name.textContent = contributor.name;
      const age = document.createElement("span");
      age.className = "roster-age";
      age.append("");
      const state = document.createElement("span");
      state.className = "roster-state";
      state.append("");
      li.append(presence, name, age, state);
      el.roster.append(li);
      rosterRows.set(contributor.name, { li, presence, state, age, contributor, rosterIndex, online: false });
    }
    const placeRosterRow = (row) => {
      let before = null;
      for (const sibling of el.roster.children) {
        if (sibling === row.li) continue;
        const other = rosterRows.get(sibling.dataset.name);
        if (other.contributor.lastCommitAt < row.contributor.lastCommitAt ||
          other.contributor.lastCommitAt === row.contributor.lastCommitAt && other.rosterIndex > row.rosterIndex) { before = sibling; break; }
      }
      if (before) {
        if (row.li.nextElementSibling !== before) el.roster.insertBefore(row.li, before);
      } else if (el.roster.lastElementChild !== row.li) el.roster.append(row.li);
    };
    const setRosterRow = (name, stateKey, ageText, online = false) => {
      const row = rosterRows.get(name);
      if (!row) return;
      const activity = stateKey === "away" ? "chilling" : stateKey;
      if (row.state.dataset.state !== activity) {
        row.state.dataset.state = activity;
        row.state.firstChild.data = STATE_LABELS[activity] || activity;
      }
      if (ageText != null && row.age.firstChild.data !== ageText) row.age.firstChild.data = ageText;
      if (row.online !== online) {
        row.online = online;
        row.presence.dataset.online = online ? "true" : "false";
        row.presence.title = online ? "Online" : "Offline";
        row.presence.setAttribute("aria-label", row.presence.title);
      }
      placeRosterRow(row);
    };
    // Seed empty text nodes so later updates only mutate text, never the DOM.
    for (const node of [el.meterCount, el.meterForecast, el.worldBananaCount]) if (!node.firstChild) node.append("");
    let shownBananas = -1, shownWidth = "", shownBand = "", shownForecast = null;
    const setMeter = (level, capacity, forecastText) => {
      const percent = Math.min(100, Math.max(0, level / capacity * 100));
      const width = `${percent}%`;
      if (width !== shownWidth) {
        shownWidth = width;
        el.meterFill.style.width = width;
        el.meterFill.parentElement.setAttribute("aria-valuenow", String(Math.round(percent)));
      }
      const band = level < capacity * 0.15 ? "low" : level < capacity * 0.4 ? "mid" : "ok";
      if (band !== shownBand) el.meterFill.dataset.level = shownBand = band;
      const bananas = Math.floor(level);
      if (bananas !== shownBananas) {
        shownBananas = bananas;
        const count = BANANA_COUNT.format(bananas);
        el.meterCount.firstChild.data = count;
        el.worldBananaCount.firstChild.data = count;
      }
      if (forecastText !== shownForecast) el.meterForecast.firstChild.data = shownForecast = forecastText;
    };
    const setStats = ({ totalSats, donations }) => {
      el.statDonations.textContent = String(donations);
      el.statSats.textContent = formatLarge(totalSats);
    };
    let actLabel = el.act.textContent;
    const setAct = (label) => {
      if (label === actLabel) return;
      actLabel = label;
      el.act.textContent = label;
    };
    let weaponShown = false, weaponEquipped = false, weaponAmmo = -1, weaponDisplayAmmo = -1, weaponReloading = false, weaponCanReload = false, weaponUnlimited = false;
    let magazineCount = 0, magazineHigh = -1, magazineLow = -1, magazineCanSwap = false;
    let magazineHighReloading = false, magazineLowReloading = false;
    let weaponTotal = -1, weaponLabelAmmo = -1, weaponLabelEquipped = false;
    const refreshWeaponSummary = () => {
      const total = weaponUnlimited ? Infinity : Math.max(0, weaponAmmo) + (magazineCount ? Math.max(0, magazineHigh) : 0) + (magazineCount > 1 ? Math.max(0, magazineLow) : 0);
      const shown = weaponShown && weaponEquipped && magazineCount > 0;
      if (el.magazine.hidden === shown) el.magazine.hidden = !shown;
      const disabled = !shown || !magazineCanSwap;
      if (el.magazine.disabled !== disabled) el.magazine.disabled = disabled;
      if (total !== weaponTotal) {
        weaponTotal = total;
        el.weaponCompact.firstChild.data = weaponUnlimited ? "∞" : String(total);
        el.weaponCompact.dataset.level = total === 0 ? "empty" : total <= 5 ? "low" : "ok";
      }
      const labelAmmo = weaponEquipped ? weaponDisplayAmmo : total;
      if (labelAmmo !== weaponLabelAmmo || weaponEquipped !== weaponLabelEquipped) {
        weaponLabelAmmo = labelAmmo; weaponLabelEquipped = weaponEquipped;
        el.weaponToggle.setAttribute("aria-label", weaponUnlimited ? `${weaponEquipped ? "Stow" : "Equip"} AK-47; unlimited ammunition` : weaponEquipped ? `Stow AK-47; ammo ${labelAmmo} of 30 rounds` : `Equip AK-47; ${total} rounds total`);
      }
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const showWeaponAmmo = (ammo) => {
      if (ammo === weaponDisplayAmmo) return;
      weaponDisplayAmmo = ammo;
      el.weaponAmmo.firstChild.data = weaponUnlimited ? "∞" : `${ammo} / 30`;
      el.weaponMagazine.setAttribute("aria-valuenow", String(ammo));
      el.weaponMagazine.setAttribute("aria-valuetext", weaponUnlimited ? "Unlimited ammunition" : `${ammo} of 30 rounds`);
      el.weaponMagazine.dataset.level = weaponUnlimited ? "ok" : ammo === 0 ? "empty" : ammo <= 5 ? "low" : "ok";
      refreshWeaponSummary();
    };
    const clearWeaponLoad = () => {
      for (const banana of el.weaponBananas) {
        banana.classList.remove("weapon-banana--loading");
        banana.style.removeProperty("animation-delay");
      }
    };
    on(el.weaponMagazine, "animationstart", (event) => {
      if (event.animationName !== "weapon-banana-load" || !weaponShown || !weaponEquipped) return;
      const banana = event.target.closest(".weapon-banana");
      if (!banana.classList.contains("weapon-banana--loading") || banana.dataset.filled !== "true") return;
      // A banana credits three rounds at once; the readout follows each
      // already-loaded slot as its staggered fill actually appears.
      showWeaponAmmo(Math.min(weaponAmmo, Math.max(weaponDisplayAmmo, el.weaponBananas.indexOf(banana) + 1)));
    });
    on(el.weaponMagazine, "animationend", (event) => {
      if (event.animationName !== "weapon-banana-load") return;
      const banana = event.target.closest(".weapon-banana");
      banana.classList.remove("weapon-banana--loading");
      banana.style.removeProperty("animation-delay");
    });
    on(reducedMotion, "change", () => {
      if (!reducedMotion.matches) return;
      clearWeaponLoad();
      showWeaponAmmo(weaponAmmo);
    });
    const setWeapon = (available, equipped, ammo, reloading = false, canReload = false, unlimited = false) => {
      const modeChanged = weaponUnlimited !== unlimited;
      if (modeChanged) {
        weaponUnlimited = unlimited;
        weaponDisplayAmmo = weaponTotal = weaponLabelAmmo = -1;
      }
      ammo = Math.max(0, Math.min(30, Math.floor(ammo)));
      const animateReload = !unlimited && available && weaponShown && equipped && weaponEquipped && weaponAmmo >= 0
        && ammo > weaponAmmo && ammo <= weaponAmmo + 3 && (reloading || weaponReloading) && !reducedMotion.matches;
      if (modeChanged || (!available && weaponShown) || (!equipped && weaponEquipped) || ammo !== weaponAmmo && !animateReload) clearWeaponLoad();
      if (available !== weaponShown) {
        weaponShown = available;
        el.weapon.hidden = !available;
      }
      if (equipped !== weaponEquipped) {
        weaponEquipped = equipped;
        el.weapon.dataset.equipped = String(equipped);
        el.weaponToggle.setAttribute("aria-pressed", String(equipped));
        el.weaponToggle.setAttribute("aria-expanded", String(equipped));
        el.weaponToggle.title = equipped ? "Stow AK-47 (G)" : "Equip AK-47 (G)";
        el.weaponReadout.setAttribute("aria-hidden", String(!equipped));
      }
      if (modeChanged || reloading !== weaponReloading || canReload !== weaponCanReload) {
        weaponReloading = reloading;
        weaponCanReload = canReload;
        el.weapon.dataset.reloading = String(reloading);
        el.weapon.dataset.canReload = String(canReload);
        el.weaponLabel.firstChild.data = reloading ? "Reloading" : "Ammo";
        el.weaponMagazine.title = unlimited ? "Unlimited ammunition; firing does not consume rounds" : reloading ? "Stay near the pile to keep reloading; leave its range to stop" : canReload ? "Press Space to reload; two bananas load 6 rounds" : "Each slot is 1 round. Press Space beside the pile to reload.";
      }
      if (ammo === weaponAmmo) {
        if (modeChanged || !available || !equipped || reducedMotion.matches) showWeaponAmmo(ammo);
        refreshWeaponSummary(); return;
      }
      const from = Math.max(0, Math.min(ammo, weaponAmmo)), to = weaponAmmo < 0 ? 30 : Math.max(ammo, weaponAmmo);
      weaponAmmo = ammo;
      if (!animateReload) showWeaponAmmo(ammo);
      for (let i = from; i < to; i++) {
        const banana = el.weaponBananas[i];
        banana.dataset.filled = String(i < ammo);
        banana.classList.toggle("weapon-banana--loading", animateReload);
        if (animateReload) banana.style.animationDelay = `${(i - from) * 70}ms`;
        else banana.style.removeProperty("animation-delay");
      }
      refreshWeaponSummary();
    };
    const setMagazine = (count, firstAmmo, secondAmmo, canSwap, reloadingIndex = -1) => {
      const button = el.magazine;
      firstAmmo = Math.max(0, Math.min(30, Math.floor(firstAmmo)));
      secondAmmo = Math.max(0, Math.min(30, Math.floor(secondAmmo)));
      const front = count > 1 && secondAmmo > firstAmmo ? 1 : 0;
      const high = count ? front ? secondAmmo : firstAmmo : 0, low = count > 1 ? front ? firstAmmo : secondAmmo : 0;
      const highReloading = count > 0 && reloadingIndex === front, lowReloading = count > 1 && reloadingIndex === 1 - front;
      canSwap = count > 0 && canSwap && reloadingIndex < 0;
      if (count === magazineCount && high === magazineHigh && low === magazineLow && canSwap === magazineCanSwap
        && highReloading === magazineHighReloading && lowReloading === magazineLowReloading) return;
      if (count !== magazineCount) {
        magazineCount = count;
        button.dataset.count = String(count);
        button.dataset.owned = String(count > 0);
        el.magazineIcon.setAttribute("viewBox", count === 2 ? "0 0 32 32" : "2 0 32 32");
        el.magazineFront.setAttribute("transform", count === 2
          ? "translate(11.15 16) scale(0.86) rotate(20) scale(-1 1) translate(-12 -17)"
          : "translate(16 16) scale(0.94) rotate(20) scale(-1 1) translate(-12 -17)");
      }
      magazineCanSwap = canSwap;
      magazineHighReloading = highReloading; magazineLowReloading = lowReloading;
      button.dataset.reloading = String(highReloading);
      el.magazineLowAmmo.dataset.reloading = String(lowReloading);
      button.title = reloadingIndex >= 0 ? "Loading spare magazines; stay near the banana pile"
        : canSwap ? "Click or press R to use the fullest spare. Each banana is 6 rounds."
        : "Equip the AK-47 to swap magazines";
      button.setAttribute("aria-label", `${count} spare magazine${count === 1 ? "" : "s"}; ${high} of 30 rounds${count > 1 ? ` fullest, ${low} of 30 rounds lowest` : ""}${reloadingIndex >= 0 ? "; reloading" : canSwap ? "; click to use the fullest spare" : ""}`);
      if (high !== magazineHigh) {
        const filled = Math.floor(high / 6), previous = Math.floor(magazineHigh / 6);
        for (let i = 0; i < el.magazineBananas.length; i++) if (magazineHigh < 0 || (i < filled) !== (i < previous)) el.magazineBananas[i].dataset.filled = String(i < filled);
        magazineHigh = high;
        el.magazineAmmo.firstChild.data = String(high);
        button.dataset.level = high === 0 ? "empty" : high <= 5 ? "low" : "ok";
      }
      if (low !== magazineLow) {
        const filled = Math.floor(low / 6), previous = Math.floor(magazineLow / 6);
        for (let i = 0; i < el.magazineRearBananas.length; i++) if (magazineLow < 0 || (i < filled) !== (i < previous)) el.magazineRearBananas[i].dataset.filled = String(i < filled);
        magazineLow = low;
        el.magazineLowAmmo.firstChild.data = String(low);
        el.magazineLowAmmo.dataset.level = low === 0 ? "empty" : low <= 5 ? "low" : "ok";
      }
      refreshWeaponSummary();
    };
    let jetpackShown = false, jetpackEquipped = false, jetpackBlocked = false, jetpackPercent = -1;
    const setJetpack = (owned, equipped, fuel, blocked = false) => {
      if (owned !== jetpackShown) {
        jetpackShown = owned;
        el.jetpack.hidden = !owned;
      }
      if (equipped !== jetpackEquipped || blocked !== jetpackBlocked) {
        jetpackEquipped = equipped;
        jetpackBlocked = blocked;
        el.jetpack.disabled = blocked;
        el.jetpack.dataset.equipped = String(equipped);
        el.jetpack.setAttribute("aria-pressed", String(equipped));
        el.jetpack.setAttribute("aria-label", blocked ? "Jetpack unavailable underground" : equipped ? "Take off jetpack" : "Put on jetpack");
        el.jetpack.title = blocked ? "Jetpack unavailable underground" : "";
      }
      if (!owned) return;
      const percent = Math.ceil(fuel * 100);
      if (percent === jetpackPercent) return;
      jetpackPercent = percent;
      el.jetpackFuelFill.style.transform = `scaleX(${percent / 100})`;
      el.jetpackFuel.setAttribute("aria-valuenow", String(percent));
      el.jetpackFuel.dataset.level = percent <= 20 ? "low" : "ok";
      el.jetpackFuelValue.firstChild.data = `${percent}%`;
      el.jetpackCompact.firstChild.data = `${percent}%`;
    };
    const setSubtitle = (text) => {
      el.subtitle.textContent = text;
    };
    let actionHandler = null;
    const onAction = (fn) => {
      actionHandler = fn;
    };
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
    const openRecipe = () => {
      if (!el.recipe.open) el.recipe.showModal();
    };
    const closeRecipe = () => {
      if (el.recipe.open) el.recipe.close();
    };
    on(el.recipe, "keydown", (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closeRecipe();
    });
    // The prompt is written to be pasted, so it leaves in one click.
    const copyRecipe = (button) => {
      const text = el.recipeText.textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => {});
      else {
        const field = document.createElement("textarea");
        field.value = text;
        document.body.append(field);
        field.select();
        document.execCommand("copy");
        field.remove();
      }
      // A toast would sit behind the modal's backdrop, so the button answers.
      window.clearTimeout(copyTimer);
      button.textContent = "Copied";
      copyTimer = window.setTimeout(() => { button.textContent = "Copy prompt"; }, 1600);
    };
    for (const b of el.actions) on(b, "click", () => {
      b.blur();
      if (b.dataset.action === "feed") openFeed();
      else if (b.dataset.action === "feed-close") closeFeed();
      else if (b.dataset.action === "recipe-close") closeRecipe();
      else if (b.dataset.action === "recipe-copy") copyRecipe(b);
      else actionHandler && actionHandler(b.dataset.action);
    });
    const toast = (text) => {
      window.clearTimeout(toastTimer);
      window.clearTimeout(toastHideTimer);
      el.toast.textContent = text;
      el.toast.hidden = false;
      el.messageStack.append(el.toast);
      el.toast.classList.add("show");
      toastTimer = window.setTimeout(() => {
        el.toast.classList.remove("show");
        toastHideTimer = window.setTimeout(() => {
          if (!el.toast.classList.contains("show")) el.toast.hidden = true;
        }, MESSAGE_FADE_MS);
      }, 2800);
    };
    let tipText = "", tipState = "", tipW = 0, tipH = 0, tipCave = null, tipName = false, tipLeft = NaN, tipTop = NaN;
    let tipVisibility = null, tipSpeechTop = Infinity;
    const tipScreen = { x: 0, y: 0, depth: 0 };
    const placeTooltip = (left, top) => {
      left = Math.round(left); top = Math.round(top);
      if (left === tipLeft && top === tipTop) return;
      tipLeft = left; tipTop = top;
      el.tooltip.style.transform = `translate(${left}px, ${top}px)`;
    };
    const tooltip = {
      show: (text, x, y, cave = null) => {
        if (cave !== tipCave) tipSpeechTop = Infinity;
        tipCave = cave;
        const name = !!cave, changed = text !== tipText || name !== tipName;
        if (name !== tipName) {
          tipName = name;
          el.tooltip.classList.toggle("tooltip--name", name);
          if (!name) {
            tipState = "";
            delete el.tooltip.dataset.state;
            el.tooltip.removeAttribute("aria-label");
          }
        }
        el.tooltip.hidden = false;
        if (changed) {
          tipText = text;
          tipState = "";
          el.tooltip.textContent = text;
          tipW = el.tooltip.offsetWidth;
          tipH = el.tooltip.offsetHeight;
        }
        if (cave) {
          tooltip.update();
          return;
        }
        const w = tipW, h = tipH;
        const left = Math.min(window.innerWidth - w - 8, x + 14);
        const top = y + 18 + h > window.innerHeight ? y - h - 10 : y + 18;
        placeTooltip(left, top);
      },
      setVisibility: (visibility) => {
        tipVisibility = visibility;
        if (!visibility) tooltip.hide();
      },
      beginFrame: () => {
        tipSpeechTop = Infinity;
        tooltip.update(false);
      },
      update: (place = true) => {
        if (!tipCave) return;
        const state = statusFor(tipCave);
        if (state !== tipState) {
          tipState = state;
          el.tooltip.dataset.state = state;
          el.tooltip.setAttribute("aria-label", `${tipText}, ${STATE_LABELS[state]}`);
        }
        el.tooltip.hidden = !tipVisibility.anchor(tipCave, tipScreen);
        if (el.tooltip.hidden || !place) return;
        const top = Math.min(tipScreen.y - 8, tipSpeechTop - 6) - tipH;
        placeTooltip(Math.max(8, Math.min(window.innerWidth - tipW - 8, tipScreen.x - tipW / 2)), Math.max(8, top));
      },
      // The name sits above speech; reserve room for both near the top edge.
      speechSpace: (cave) => cave && cave === tipCave && !el.tooltip.hidden ? tipH + 6 : 0,
      aboveSpeech: (cave, top) => {
        if (cave && cave === tipCave) tipSpeechTop = Math.min(tipSpeechTop, top);
      },
      hide: () => {
        tipCave = null;
        tipSpeechTop = Infinity;
        el.tooltip.hidden = true;
        el.tooltip.classList.remove("tooltip--name");
        delete el.tooltip.dataset.state;
        el.tooltip.removeAttribute("aria-label");
        tipName = false;
        tipText = tipState = "";
      }
    };
    const hint = (text, ms = 4200) => {
      window.clearTimeout(hintTimer);
      window.clearTimeout(hintHideTimer);
      el.hint.textContent = text;
      el.hint.hidden = false;
      el.messageStack.append(el.hint);
      el.hint.classList.add("show");
      hintTimer = window.setTimeout(() => {
        el.hint.classList.remove("show");
        hintHideTimer = window.setTimeout(() => {
          if (!el.hint.classList.contains("show")) el.hint.hidden = true;
        }, MESSAGE_FADE_MS);
      }, ms);
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
    // A pull tab opens its own panel, and folds the sheet when that panel is already showing.
    const pull = (name) => {
      window.clearTimeout(introTimer);
      const showing = el.sheet.dataset.open === "true" && el.tabs.some((t) => t.dataset.tab === name && t.getAttribute("aria-selected") === "true");
      if (showing) el.sheet.dataset.open = "false";
      else selectTab(name);
    };
    on(el.sheetToggle, "click", () => pull("roster"));
    on(el.sheetBananas, "click", () => pull("bananas"));
    on(el.worldBananas, "click", () => {
      window.clearTimeout(introTimer);
      const showing = el.sheet.dataset.open === "true" && el.tabs.some((t) => t.dataset.tab === "bananas" && t.getAttribute("aria-selected") === "true");
      if (!showing) selectTab("bananas");
      el.worldBananas.blur();
    });
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
    const setFlyby = (active) => {
      const pressed = active ? "true" : "false";
      if (el.flyby.getAttribute("aria-pressed") !== pressed) el.flyby.setAttribute("aria-pressed", pressed);
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
    // dispose removes only the rows and timers this instance added.
    const dispose = () => {
      window.clearTimeout(toastTimer);
      window.clearTimeout(toastHideTimer);
      window.clearTimeout(hintTimer);
      window.clearTimeout(hintHideTimer);
      window.clearTimeout(copyTimer);
      for (const off of listeners) off();
      el.roster.replaceChildren();
      el.inventory.replaceChildren();
      el.toast.classList.remove("show");
      el.toast.hidden = true;
      el.hint.classList.remove("show");
      el.hint.hidden = true;
      tooltip.hide();
      setWeapon(false, false, 0);
      setMagazine(0, 0, 0, false);
      setJetpack(false, false, 0);
      closeFeed();
      closeRecipe();
    };
    return { el, openFeed, closeFeed, openRecipe, closeRecipe, setRosterRow, setMeter, setStats, setAct, setWeapon, setMagazine, setJetpack, setSubtitle, setFlyby, onAction, toast, tooltip, hint, selectTab, onPreset, onIdentityChange, setIdentity, setDonationUrl, onAssign, onUnassign, renderInventory, dispose };
  };
  BL.hud = { create, renderIcon, signLettering, STATE_LABELS, statusFor };
})();
