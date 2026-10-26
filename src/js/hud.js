(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { iconRenderer: iconRendererMod } = BL;
  const { formatLarge } = BL.game;
  const { createNode, addChild, createCamera, boundsOf } = BL.scene;
  const STATE_LABELS = { working: "clank", chilling: "chill", sleeping: "sleep", away: "away", online: "online" };
  const ROSTER_ORDER = { working: 0, chilling: 1, sleeping: 2, away: 3 };
  // Signed-in players online lead the roster, ahead of every activity.
  const ONLINE_RANK = -1;
  const stampOf = (contributor) => contributor.lastContributionAt || contributor.lastCommitAt;
  // Local control is online only while signed in; remote presence remains independent.
  const statusFor = (cave) => {
    const actor = cave.tooltipOwner || cave;
    const online = cave.remoteControlled || actor.remoteControlled
      || !!BL.net.state.me && (cave.controlled || actor.humanControlled);
    return online ? "online" : actor.state === "away" ? "chilling" : actor.state;
  };
  const $ = (id) => document.getElementById(id);
  const TIER_RANK = { legendary: 0, epic: 1, rare: 2, common: 3 };
  const BANANA_COUNT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const DONATED_COUNT = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const DONOR_BANANAS = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let donorUnit = "bananas";
  let donationStats = null, liveDonors = null;
  const setDonationStats = (stats) => {
    donationStats = stats;
    if (liveDonors) liveDonors(true);
  };
  const currentDonationRate = () => {
    const live = BL.donationRate.current, saved = BL.donations.state.tally?.rate;
    return live && (!saved || live.at >= saved.at) ? live : saved;
  };
  let valuedSats, valuedPrice, donatedValueText = "";
  // The panel and pile label share today's value, including precision and
  // missing-price handling. Cache formatting for the pile's overlay loop.
  const donationValueText = () => {
    const tally = BL.donations.real ? BL.donations.state.tally : donationStats;
    const sats = tally ? BL.donations.real ? tally.sats : tally.totalSats : null;
    const price = currentDonationRate()?.usdPerBtc;
    if (!donatedValueText || sats !== valuedSats || price !== valuedPrice) {
      valuedSats = sats; valuedPrice = price;
      donatedValueText = sats === 0 ? DONATED_COUNT.format(0) : sats !== null && price
        ? DONATED_COUNT.format(sats / 1e8 * price) : "—";
    }
    return donatedValueText;
  };
  const MESSAGE_FADE_MS = 300;
  // The page's one toast, which every scene's HUD and the director share: a new one replaces the last.
  let toastTimer = 0, toastHideTimer = 0;
  const toast = (text) => {
    const box = $("toast");
    window.clearTimeout(toastTimer);
    window.clearTimeout(toastHideTimer);
    box.textContent = text;
    box.hidden = false;
    $("message-stack").append(box);
    box.classList.add("show");
    toastTimer = window.setTimeout(() => {
      box.classList.remove("show");
      toastHideTimer = window.setTimeout(() => {
        if (!box.classList.contains("show")) box.hidden = true;
      }, MESSAGE_FADE_MS);
    }, 2800);
  };
  // Page-owned recovery stays through scene visits, beside ordinary toasts such as payment notices.
  let reloadOffered = false;
  const offerReload = (message = "Ooga Booga Land was updated") => {
    if (reloadOffered) return;
    reloadOffered = true;
    const box = $("reload-notice"), reload = document.createElement("button");
    reload.type = "button"; reload.className = "link"; reload.textContent = "Reload";
    reload.addEventListener("click", () => location.reload(), { once: true });
    box.replaceChildren(`${message} · `, reload);
    box.hidden = false;
    $("message-stack").append(box);
    box.classList.add("show");
  };
  const BOARD_STATE_KEY = "oogaboogaland.oogatron.windows.v1";
  const MAX_FLOATING_BOARDS = 12;
  const readBoardState = () => {
    try {
      const state = JSON.parse(localStorage.getItem(BOARD_STATE_KEY));
      if (!state || state.version !== 1 || !Array.isArray(state.windows)) return null;
      const windows = [];
      for (const entry of state.windows.slice(0, MAX_FLOATING_BOARDS)) {
        if (!entry || !Number.isFinite(entry.x) || entry.x < 0 || !Number.isFinite(entry.y) || entry.y < 0
          || !Number.isFinite(entry.width) || entry.width <= 0 || typeof entry.paused !== "boolean") continue;
        const screen = entry.screen;
        if (!screen || !["recent", "totals", "repo", "leaderboard"].includes(screen.name)) continue;
        const params = {};
        let valid = true;
        for (const key of ["name", "repo", "type"]) {
          const value = screen.params?.[key];
          if (value === undefined) continue;
          if (typeof value !== "string" || value.length > 256) { valid = false; break; }
          params[key] = value;
        }
        if (!valid || screen.name === "repo" && !params.name
          || screen.name === "leaderboard" && !["commits", "prs", "reviews", "issues", "comments"].includes(params.type)) continue;
        const filters = {};
        for (const kind of ["repos", "users", "types"]) {
          const values = entry.filters?.[kind];
          filters[kind] = Array.isArray(values) ? [...new Set(values.slice(0, kind === "types" ? 6 : 512)
            .filter((value) => typeof value === "string" && value.length <= 256
              && (kind !== "types" || ["commit", "pr", "review", "merge", "issue", "comment"].includes(value))))] : null;
        }
        windows.push({ x: entry.x, y: entry.y, width: entry.width, paused: entry.paused, screen: { name: screen.name, params }, filters, rollup: entry.rollup === true,
          controlsHidden: entry.controlsHidden === true });
      }
      return { windows, lastUsed: Number.isInteger(state.lastUsed) ? state.lastUsed : -1,
        lastWidth: Number.isFinite(state.lastWidth) && state.lastWidth > 0 ? state.lastWidth : 440 };
    } catch { return null; }
  };
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
  // Letters a sign; a scene calls it again when a sign's words change (a drop that was lost, not landed).
  const letterSign = (el, words = el.textContent) => {
    const text = signText(words);
    el.setAttribute("aria-label", text);
    el.replaceChildren(signLettering(text));
  };
  for (const el of document.querySelectorAll("[data-sign]")) letterSign(el);
  // The roster's voice mark, a 9x9 pixel speaker; the stylesheet shows the parts each state needs.
  const VOICE_PARTS = [
    ["voice-speaker", "M0 3h2v3H0zM2 2h1v5H2zM3 1h1v7H3z"],
    ["voice-near", "M5 3h1v3H5z"],
    ["voice-far", "M7 2h1v5H7z"],
    ["voice-cross", "M5 3h1v1H5zM7 3h1v1H7zM6 4h1v1H6zM5 5h1v1H5zM7 5h1v1H7z"],
    ["voice-slash", "M0 0h1v1H0zM1 1h1v1H1zM2 2h1v1H2zM3 3h1v1H3zM4 4h1v1H4zM5 5h1v1H5zM6 6h1v1H6zM7 7h1v1H7zM8 8h1v1H8z"],
  ];
  const voiceIcon = document.createElementNS(SIGN_NS, "svg");
  voiceIcon.setAttribute("viewBox", "0 0 9 9");
  voiceIcon.setAttribute("aria-hidden", "true");
  for (const [part, d] of VOICE_PARTS) {
    const path = document.createElementNS(SIGN_NS, "path");
    path.setAttribute("class", part);
    path.setAttribute("d", d);
    path.setAttribute("fill", "currentColor");
    voiceIcon.append(path);
  }
  // Icons are rasterized once into an offscreen canvas.
  const ICON_PX = 48;
  const renderIcon = (item) => {
    const canvas = document.createElement("canvas");
    const iconRenderer = iconRendererMod.createRenderer(canvas, { width: ICON_PX, height: ICON_PX, transparent: true });
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
  // Draw the carried item's actual geometry, including likenesses and skins.
  // This owns only temporary icon nodes; the character's item is never reparented.
  const renderPrimaryIcon = (canvas, geometry, tall = false) => {
    const renderer = iconRendererMod.createRenderer(canvas, { width: ICON_PX, height: ICON_PX, transparent: true });
    const root = createNode(), pivot = createNode(), item = createNode({ geometry });
    const bounds = boundsOf(geometry), fit = (tall ? 0.52 : 0.67) / Math.max(bounds.radius, 0.05);
    item.scale.x = item.scale.y = item.scale.z = fit;
    item.position.x = -bounds.center[0] * fit;
    item.position.y = -bounds.center[1] * fit;
    item.position.z = -bounds.center[2] * fit;
    pivot.rotation.z = 0.55;
    addChild(root, pivot); addChild(pivot, item);
    const camera = createCamera({ fov: 32, near: 0.1, far: 20 });
    camera.position.x = 0.8; camera.position.y = 0.45; camera.position.z = 2.7;
    camera.target.x = camera.target.y = camera.target.z = 0;
    renderer.render(root, camera);
    renderer.dispose();
  };
  const copyPortraitNode = (source, portraitRoot, portraitGeometry) => {
    if (source.portraitHidden) return null;
    const copy = createNode({ geometry: source === portraitRoot ? portraitGeometry : source.geometry });
    Object.assign(copy.position, source.position);
    Object.assign(copy.rotation, source.rotation);
    Object.assign(copy.scale, source.scale);
    copy.visible = source.visible;
    for (const child of source.children) if (child.visible && !child.portraitHidden) addChild(copy, copyPortraitNode(child, portraitRoot, portraitGeometry));
    return copy;
  };
  const renderFaceIcon = (canvas, cave, gorilla = null, px = ICON_PX) => {
    const renderer = iconRendererMod.createRenderer(canvas, { width: px, height: px, transparent: true });
    const source = gorilla ? gorilla.parts.head : cave.parts.head, geometry = gorilla ? source.geometry : cave.portraitHead;
    const root = createNode(), head = copyPortraitNode(source, source, geometry);
    const bounds = boundsOf(geometry), fit = (!gorilla && cave.traits.gasMask ? 0.68 : 0.78) / Math.max(bounds.radius, 0.05);
    head.position.x = head.position.y = head.position.z = 0;
    head.rotation.x = head.rotation.y = head.rotation.z = 0;
    head.scale.x = head.scale.y = head.scale.z = fit;
    head.position.x = -bounds.center[0] * fit;
    head.position.y = -bounds.center[1] * fit;
    head.position.z = -bounds.center[2] * fit;
    addChild(root, head);
    const camera = createCamera({ fov: 28, near: 0.1, far: 20 });
    // Caveman faces are built on +Z. Keep the portrait square to that plane so
    // the mode button reads as a face instead of another angled item icon.
    camera.position.x = camera.position.y = 0;
    camera.position.z = 2.7;
    camera.target.x = camera.target.y = camera.target.z = 0;
    renderer.render(root, camera);
    renderer.dispose();
  };
  // An Ooga standing square to the view, whole, as it stands posed now: its built parts copied (hidden ones left out)
  // and turned to face the camera, `w` by `h` pixels. A podium's portraits (HALLOWEEN: the ghost hunt's winners).
  const renderBodyIcon = (canvas, cave, w, h) => {
    const renderer = iconRendererMod.createRenderer(canvas, { width: w, height: h, transparent: true });
    const root = createNode(), body = copyPortraitNode(cave.root, null, null), tall = cave.bodyHeight;
    body.visible = true;
    body.position.x = body.position.z = 0;
    body.position.y = cave.baseY;
    body.rotation.x = body.rotation.y = body.rotation.z = 0;
    addChild(root, body);
    // Back far enough that the view's 28 degrees take in 1.2 of its height, for room over its head and under its feet.
    const camera = createCamera({ fov: 28, near: 0.1, far: 40 }), fit = tall * 0.6 / Math.tan(14 * Math.PI / 180);
    camera.position.x = 0; camera.position.y = tall * 0.55; camera.position.z = fit;
    camera.target.x = 0; camera.target.y = tall * 0.5; camera.target.z = 0;
    renderer.render(root, camera);
    renderer.dispose();
  };
  // The sheet belongs to the page. Reuse attached rows across visits; only current roster names stay in this map.
  const rosterNodes = new Map();
  let rosterAway = null, donorRows = null, donationRows = null;
  const create = ({ roster, catalog, tierColors, renderIcon, lootEnabled = false, healthEnabled = false, signal = null }) => {
    const lifetime = signal ? null : new AbortController();
    signal = signal || lifetime.signal;
    const el = {
      roster: $("roster"), rosterCount: $("roster-count"),
      statDonations: $("stat-donations"),
      statSats: $("stat-sats"),
      bananaTotal: $("banana-total"), bananaSource: $("banana-source"),
      bananaLeaders: $("banana-leaders"), bananaEmpty: $("banana-empty"),
      bananaRecent: $("banana-recent-list"), bananaRecentEmpty: $("banana-recent-empty"),
      bananaRecentBar: $("banana-recent-bar"), bananaRecentBarLabel: $("banana-recent-bar-label"),
      donationMessageLabel: $("donation-message-label"),
      bananaBoardUnit: $("banana-board-unit"), bananaBoardNote: $("banana-board-note"),
      bananaPanel: $("bananas-panel"), bananaRateLabel: $("banana-rate-label"),
      bananaBtcPrice: $("banana-btc-price"), bananaExchange: $("banana-exchange"),
      donorUnits: [...document.querySelectorAll("[data-donor-unit]")],
      lootTab: $("loot-tab"),
      worldLootHint: $("world-loot-hint"),
      subtitle: $("subtitle"),
      topbar: document.querySelector(".topbar"), brand: document.querySelector(".brand"),
      clock: $("world-clock"), block: $("world-block"),
      equipment: $("equipment-hud"), equipmentRow: document.querySelector(".weapon-equipment-row"),
      micNote: $("mic-note"),
      actions: [...document.querySelectorAll("[data-action]")],
      board: $("board-modal"), boardTitle: $("board-title"), boardScreen: $("board-screen"), boardCaption: $("board-caption"), boardNote: $("board-note"),
      boardDots: $("board-dots"), boardPrev: $("board-prev"), boardNext: $("board-next"), boardHelp: $("board-help"),
      boardHead: $("board-head"), boardPause: $("board-pause"), boardResize: $("board-resize"),
      act: $("act"),
      mode: $("mode-hud"),
      modeDestination: $("destination-hud"),
      modeFree: $("freeroam-icon"),
      modeFace: $("mode-face-icon"),
      modeHealth: $("mode-health"),
      modeHealthFill: $("mode-health-fill"),
      ownOoga: $("own-ooga-hud"),
      ownOogaFace: $("own-ooga-face-icon"),
      ownOogaHealth: $("own-ooga-health"),
      ownOogaHealthFill: $("own-ooga-health-fill"),
      modeDestinationName: $("detached-destination-name"),
      primary: $("primary-hud"),
      primaryIcon: $("primary-icon"),
      primaryStrength: $("primary-strength"),
      primaryStrengthFill: $("primary-strength-fill"),
      gorillaSmash: $("gorilla-smash-hud"),
      gorillaStrength: $("gorilla-strength"),
      gorillaStrengthFill: $("gorilla-strength-fill"),
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
      jetpackCompactFuel: $("jetpack-fuel-compact"),
      jetpackCompactFill: $("jetpack-fuel-compact-fill"),
      messageStack: $("message-stack"),
      toast: $("toast"),
      tooltip: $("tooltip"),
      tooltipText: $("tooltip-text"),
      tooltipHealth: $("tooltip-health"),
      tooltipHealthFill: $("tooltip-health-fill"),
      hint: $("hint"),
      sheet: $("sheet"),
      presets: [...document.querySelectorAll("[data-preset]")],
      inventory: $("inventory"),
      inventoryEmpty: $("inventory-empty"),
      recipe: $("recipe"),
      recipeText: $("recipe-text")
    };
    const favicon = new Image();
    favicon.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = favicon.width;
      canvas.height = favicon.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(favicon, 0, 0);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < image.data.length; i += 4) {
        const brightness = Math.max(image.data[i], image.data[i + 1], image.data[i + 2]);
        const alpha = Math.max(0, Math.min(1, (brightness - 24) / 56));
        image.data[i + 3] = Math.round(alpha * 255);
        if (alpha > 0 && alpha < 1) for (let color = 0; color < 3; color++) image.data[i + color] = Math.min(255, image.data[i + color] / alpha);
      }
      ctx.putImageData(image, 0, 0);
      el.modeFree.src = canvas.toDataURL("image/png");
    };
    favicon.src = document.querySelector('link[rel="icon"][sizes="64x64"]').href;
    el.lootTab.hidden = !lootEnabled;
    el.worldLootHint.hidden = !lootEnabled;
    const sheet = BL.sheet.create({ lootEnabled, signal });
    el.primary.hidden = true;
    el.gorillaSmash.hidden = true;
    el.mode.hidden = true;
    el.ownOoga.hidden = true;
    el.mode.dataset.health = el.ownOoga.dataset.health = String(healthEnabled);
    el.modeHealth.hidden = true;
    el.ownOogaHealth.hidden = !healthEnabled;
    el.weapon.hidden = true;
    el.magazine.hidden = true;
    el.jetpack.hidden = true;
    const listeners = [];
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, typeof opts === "boolean" ? { capture: opts, signal } : { ...opts, signal });
      listeners.push(() => target.removeEventListener(type, fn, opts));
    };
    // Fit the HUB controls between the title and clock when their actual visible widths allow it.
    // Observers only schedule a pass after layout or equipment changes; ammo and animation never poll it.
    if (document.body.dataset.activeScene === "hub") {
      let bannerFrame = 0;
      const bannerStyle = (node, property, value) => {
        if (node.style.getPropertyValue(property) !== value) node.style.setProperty(property, value);
      };
      const fitBanner = () => {
        bannerFrame = 0;
        if (document.body.dataset.activeScene !== "hub") return;
        const brand = el.brand.getBoundingClientRect(), clock = el.clock.getBoundingClientRect(), block = el.block.getBoundingClientRect();
        const topbar = getComputedStyle(el.topbar), row = getComputedStyle(el.equipmentRow);
        const fontSize = parseFloat(getComputedStyle(el.clock).fontSize) || 22;
        const scale = Math.max(0.7, Math.min(0.85, 0.7 + (fontSize - 13) / 60));
        const leftEdge = brand.right + 12, available = Math.min(clock.left, block.left) - 12 - leftEdge;
        let compactWidth = 0, count = 0, expanded = false;
        for (const button of el.equipmentRow.children) {
          if (button.hidden || getComputedStyle(button).display === "none") continue;
          compactWidth += button === el.weapon ? 78 : button.offsetWidth;
          if (button === el.weapon) expanded = button.dataset.equipped === "true";
          count++;
        }
        compactWidth += Math.max(0, count - 1) * (parseFloat(row.columnGap) || 0);
        const banner = (compactWidth + (expanded ? 140 : 0)) * scale <= available ? "full"
          : compactWidth * scale <= available ? "compact" : "below";
        const paddingLeft = parseFloat(topbar.paddingLeft) || 0, paddingRight = parseFloat(topbar.paddingRight) || 0;
        const topEdge = Math.min(brand.top, clock.top, block.top), bottomEdge = Math.max(brand.bottom, clock.bottom, block.bottom);
        const top = banner === "below" ? bottomEdge + 12 : (topEdge + bottomEdge - 52 * scale) / 2;
        if (el.equipment.dataset.banner !== banner) el.equipment.dataset.banner = banner;
        bannerStyle(el.equipment, "--hub-equipment-scale", String(scale));
        bannerStyle(el.equipment, "--hub-equipment-left", `${banner === "below" ? paddingLeft : leftEdge}px`);
        bannerStyle(el.equipment, "--hub-equipment-top", `${top}px`);
        bannerStyle(el.equipment, "--hub-equipment-width", `${Math.max(0, window.innerWidth - paddingLeft - paddingRight) / scale}px`);
        const bottom = `${top + el.equipmentRow.offsetHeight * scale + 8}px`;
        bannerStyle(el.messageStack, "--hub-equipment-bottom", bottom);
        bannerStyle(el.micNote, "--hub-equipment-bottom", bottom);
      };
      const scheduleBanner = () => {
        if (!bannerFrame) bannerFrame = window.requestAnimationFrame(fitBanner);
      };
      const bannerResize = new ResizeObserver(scheduleBanner), bannerEquipment = new MutationObserver(scheduleBanner);
      for (const node of [el.brand, el.clock, el.block, el.equipmentRow]) bannerResize.observe(node);
      for (const button of el.equipmentRow.children) bannerEquipment.observe(button, {
        attributes: true, attributeFilter: button === el.weapon ? ["hidden", "data-equipped"] : ["hidden"]
      });
      on(window, "resize", scheduleBanner);
      listeners.push(() => {
        bannerResize.disconnect();
        bannerEquipment.disconnect();
        window.cancelAnimationFrame(bannerFrame);
        delete el.equipment.dataset.banner;
        for (const property of ["--hub-equipment-scale", "--hub-equipment-left", "--hub-equipment-top", "--hub-equipment-width"]) el.equipment.style.removeProperty(property);
        el.messageStack.style.removeProperty("--hub-equipment-bottom");
        el.micNote.style.removeProperty("--hub-equipment-bottom");
      });
      scheduleBanner();
    }
    let hintTimer = 0, hintHideTimer = 0, copyTimer = 0;
    const rosterRows = new Map();
    let showAway = false, awayCount = 0, awayShownCount = -1, awayShownShow = null, onlineCount = 0, onlineShown = -1;
    if (!rosterAway) {
      const li = document.createElement("li"), button = document.createElement("button");
      li.className = "roster-away"; button.type = "button"; li.append(button);
      rosterAway = { li, button };
    }
    const awayRow = rosterAway.li, awayButton = rosterAway.button;
    awayButton.setAttribute("aria-expanded", "false");
    awayRow.remove();
    const names = new Set(roster.map(contributor => contributor.name));
    for (const [name, row] of rosterNodes) if (!names.has(name)) { row.li.remove(); rosterNodes.delete(name); }
    // countAway rescans on every roster state flip and online toggle; skip the writes until they change.
    // The title's chip counts the players online, or the cast while nobody is.
    const updateAwayButton = () => {
      if (onlineCount !== onlineShown) {
        onlineShown = onlineCount;
        el.rosterCount.textContent = onlineCount ? `${onlineCount} online` : `${roster.length} Oogas`;
        el.rosterCount.dataset.tone = onlineCount ? "live" : "idle";
      }
      if (awayCount === awayShownCount && showAway === awayShownShow) return;
      awayShownCount = awayCount;
      awayShownShow = showAway;
      awayRow.hidden = awayCount === 0;
      awayButton.textContent = `${showAway ? "Hide" : "Show"} away (${awayCount})`;
    };
    const orderedRoster = [...roster].sort((a, b) =>
      ROSTER_ORDER[BL.contributors.contributionStateFor(a)] - ROSTER_ORDER[BL.contributors.contributionStateFor(b)] ||
      (b.lastContributionAt || b.lastCommitAt) - (a.lastContributionAt || a.lastCommitAt));
    for (let rosterIndex = 0; rosterIndex < orderedRoster.length; rosterIndex++) {
      const contributor = orderedRoster[rosterIndex];
      let nodes = rosterNodes.get(contributor.name);
      if (!nodes) {
        const li = document.createElement("li"), presence = document.createElement("span"), name = document.createElement("span");
        li.dataset.name = contributor.name;
        presence.className = "roster-presence"; presence.setAttribute("role", "img");
        name.className = "roster-name";
        const marks = document.createElement("span"), host = document.createElement("span"), voice = document.createElement("button");
        marks.className = "roster-marks"; host.className = "roster-host";
        host.setAttribute("role", "img"); host.setAttribute("aria-label", "Host: runs the Oogas for everyone");
        host.title = "Host: runs the Oogas for everyone";
        voice.className = "roster-voice"; voice.type = "button"; voice.append(voiceIcon.cloneNode(true));
        marks.append(host, voice);
        const age = document.createElement("span"), state = document.createElement("span");
        age.className = "roster-age"; age.append(""); state.className = "roster-state"; state.append("");
        li.append(presence, name, marks, age, state);
        nodes = { li, presence, name, host, voice, age, state };
        rosterNodes.set(contributor.name, nodes);
      }
      const { li, presence, name, host, voice, age, state } = nodes;
      if (name.textContent !== contributor.display) name.textContent = contributor.display;
      presence.dataset.online = "false"; presence.setAttribute("aria-label", "Offline"); presence.title = "Offline";
      host.hidden = voice.hidden = true; voice.disabled = false;
      voice.dataset.voice = voice.dataset.login = ""; voice.dataset.self = "false";
      const activity = BL.contributors.contributionStateFor(contributor), ageText = BL.contributors.contributionAgeLabel(contributor);
      if (age.firstChild.data !== ageText) age.firstChild.data = ageText;
      state.dataset.state = activity;
      if (state.firstChild.data !== STATE_LABELS[activity]) state.firstChild.data = STATE_LABELS[activity];
      li.hidden = activity === "away";
      if (activity === "away") { if (!awayRow.parentElement) el.roster.append(awayRow); awayCount++; }
      el.roster.append(li);
      rosterRows.set(contributor.name, { li, presence, state, age, contributor, rosterIndex, online: false, sceneOnline: false, remoteOnline: false, netOnline: false, nextOnline: false, placedStamp: stampOf(contributor), host, voice, look: "", login: "", hostOn: false, blocked: false, self: false, nextLook: "", nextLogin: "", nextHost: false, nextSelf: false });
    }
    if (!awayRow.parentElement) el.roster.append(awayRow);
    updateAwayButton();
    on(el.roster, "click", (e) => {
      const button = e.target.closest(".roster-voice");
      if (!button || button.disabled) return;
      button.blur();
      // The visitor's own mark mutes and unmutes their microphone; anyone else's mutes them for this visitor.
      if (button.dataset.self === "true") BL.voice.toggle();
      else BL.voice.muteLocal(button.dataset.login, button.getAttribute("aria-pressed") !== "true");
    });
    on(awayButton, "click", () => {
      showAway = !showAway;
      awayButton.setAttribute("aria-expanded", String(showAway));
      for (const row of rosterRows.values()) if (row.state.dataset.state === "away") row.li.hidden = !showAway && !row.online;
      updateAwayButton();
    });
    // Online players lead the roster, by their activity's stamp; an away player who is online is never folded away.
    const rankOf = (row) => row.online ? ONLINE_RANK : ROSTER_ORDER[row.state.dataset.state];
    const countAway = () => {
      awayCount = onlineCount = 0;
      for (const row of rosterRows.values()) {
        if (row.online) onlineCount++;
        else if (row.state.dataset.state === "away") awayCount++;
      }
      updateAwayButton();
    };
    const placeRosterRow = (row) => {
      const rank = rankOf(row), stamp = stampOf(row.contributor);
      let before = rank === ROSTER_ORDER.away ? null : awayRow;
      for (const sibling of el.roster.children) {
        if (sibling === row.li || sibling === awayRow) continue;
        const other = rosterRows.get(sibling.dataset.name);
        const otherRank = rankOf(other), otherStamp = stampOf(other.contributor);
        if (otherRank > rank) { before = otherRank === ROSTER_ORDER.away ? awayRow : sibling; break; }
        if (otherRank === rank && (otherStamp < stamp || otherStamp === stamp && other.rosterIndex > row.rosterIndex)) { before = sibling; break; }
      }
      if (before) {
        if (row.li.nextElementSibling !== before) el.roster.insertBefore(row.li, before);
      } else if (el.roster.lastElementChild !== row.li) el.roster.append(row.li);
    };
    // A scene's local driver needs a signed-in account; remote drivers and the room's
    // signed-in identities remain online independently. A change repaints the dot and moves the row.
    const showOnline = (row) => {
      const online = row.sceneOnline && !!BL.net.state.me || row.remoteOnline || row.netOnline;
      if (row.online === online) return false;
      row.online = online;
      row.presence.dataset.online = online ? "true" : "false";
      row.presence.title = online ? "Online" : "Offline";
      row.presence.setAttribute("aria-label", row.presence.title);
      row.li.hidden = row.state.dataset.state === "away" && !showAway && !online;
      countAway();
      return true;
    };
    const setRosterRow = (name, _stateKey, _ageText, online = false, remoteOnline = false) => {
      const row = rosterRows.get(name);
      if (!row) return;
      // Gameplay can put an Ooga to work or sleep; this board follows the
      // contributor's latest recorded activity instead.
      const activity = BL.contributors.contributionStateFor(row.contributor);
      const ageText = BL.contributors.contributionAgeLabel(row.contributor);
      let moved = false;
      if (row.state.dataset.state !== activity) {
        row.state.dataset.state = activity;
        row.state.firstChild.data = STATE_LABELS[activity] || activity;
        row.li.hidden = activity === "away" && !showAway && !row.online;
        countAway();
        moved = true;
      }
      if (row.age.firstChild.data !== ageText) row.age.firstChild.data = ageText;
      row.sceneOnline = online;
      row.remoteOnline = remoteOnline;
      if (showOnline(row)) moved = true;
      const stamp = stampOf(row.contributor);
      if (row.placedStamp !== stamp) {
        row.placedStamp = stamp;
        moved = true;
      }
      if (moved) placeRosterRow(row);
    };
    // The page-level pass marks rows online from the room and moves only those that changed.
    liveRows = rosterRows;
    liveOnline = (row) => {
      if (showOnline(row)) placeRosterRow(row);
    };
    showVoices();
    // Value the donated sats at the current price; donor rankings retain their receipt prices.
    const showBananaRate = () => {
      if (document.hidden || !BL.sheet.visible(el.bananaPanel)) return;
      const rate = currentDonationRate(), total = donationValueText();
      const tone = !rate ? "wait" : rate.stale ? "stale" : rate.live ? "live" : "idle";
      const label = tone === "live" ? "LIVE BTCUSD" : tone === "stale" ? "STALE BTCUSD" : "BTCUSD";
      const price = rate ? `$${DONOR_BANANAS.format(rate.usdPerBtc)}` : "—";
      const exchange = rate ? `≈ ${DONOR_BANANAS.format(1e8 / rate.usdPerBtc)} sats` : "— sats";
      if (el.bananaRateLabel.dataset.tone !== tone) el.bananaRateLabel.dataset.tone = tone;
      if (el.bananaRateLabel.textContent !== label) el.bananaRateLabel.textContent = label;
      if (el.bananaBtcPrice.textContent !== price) el.bananaBtcPrice.textContent = price;
      if (el.bananaExchange.textContent !== exchange) el.bananaExchange.textContent = exchange;
      if (el.bananaTotal.textContent !== total) el.bananaTotal.textContent = total;
    };
    let stopBananaRate = null, pileValueVisible = false;
    const watchBananaRate = () => {
      const visible = !document.hidden && (pileValueVisible || BL.sheet.visible(el.bananaPanel));
      if (visible && !stopBananaRate) stopBananaRate = BL.donationRate.watch(showBananaRate);
      else if (!visible && stopBananaRate) { stopBananaRate(); stopBananaRate = null; }
      if (visible) showBananaRate();
    };
    const setPileValueVisible = (visible) => {
      if (pileValueVisible === visible) return;
      pileValueVisible = visible;
      watchBananaRate();
    };
    const bananaRateObserver = new MutationObserver(watchBananaRate);
    bananaRateObserver.observe(el.bananaPanel, { attributes: true, attributeFilter: ["hidden"] });
    bananaRateObserver.observe(el.sheet, { attributes: true, attributeFilter: ["data-open", "hidden"] });
    on(document, "visibilitychange", watchBananaRate);
    on(document, "sheetchange", watchBananaRate);
    listeners.push(() => {
      bananaRateObserver.disconnect();
      if (stopBananaRate) stopBananaRate();
    });
    watchBananaRate();
    // A fixed pool, so the DOM never grows with donations.
    const recentRows = donationRows || (donationRows = Array.from({ length: BL.donations.RECENT_MAX }, () => {
      const li = document.createElement("li"), name = document.createElement("span"), label = document.createTextNode("");
      const badge = document.createElement("span"), amount = document.createElement("strong"), message = document.createElement("p");
      // Every text node exists from the start, so filling a row later adds nothing to the DOM.
      const amountText = document.createTextNode(""), messageText = document.createTextNode("");
      name.className = "banana-recent-name";
      badge.className = "banana-verified";
      badge.textContent = "✓";
      badge.title = "Signed in with GitHub using this donor name";
      badge.setAttribute("role", "img");
      badge.setAttribute("aria-label", "GitHub name confirmed");
      badge.hidden = true;
      amount.className = "banana-amount";
      message.className = "banana-recent-message";
      message.hidden = true;
      name.append(label, badge);
      amount.append(amountText);
      message.append(messageText);
      li.append(name, amount, message);
      li.hidden = true;
      el.bananaRecent.append(li);
      return { li, name, label, badge, amountText, message, messageText };
    }));
    const leaderRows = donorRows || (donorRows = Array.from({ length: 10 }, (_, i) => {
      const li = document.createElement("li"), rank = document.createElement("span"), name = document.createElement("span"), amount = document.createElement("strong");
      const nameText = document.createTextNode(""), amountText = document.createTextNode("");
      rank.className = "banana-rank"; rank.textContent = String(i + 1).padStart(2, "0");
      name.className = "banana-donor"; name.append(nameText);
      amount.className = "banana-amount"; amount.append(amountText);
      li.append(rank, name, amount); li.hidden = true; el.bananaLeaders.append(li);
      return { li, name, nameText, amountText };
    }));
    // The recent list's checkbox keeps it to tips at or above the message bar, remembered in this browser.
    const RECENT_BAR_KEY = "ooga-recent-bar";
    let recentBarOnly = false;
    try { recentBarOnly = localStorage.getItem(RECENT_BAR_KEY) === "1"; } catch { /* no storage: shown unfiltered */ }
    el.bananaRecentBar.checked = recentBarOnly;
    on(el.bananaRecentBar, "change", () => {
      recentBarOnly = el.bananaRecentBar.checked;
      try { localStorage.setItem(RECENT_BAR_KEY, recentBarOnly ? "1" : "0"); } catch { /* kept for this visit alone */ }
      refreshDonors(true);
      el.bananaRecentBar.blur();
    });
    let shownTally, shownBoard, shownRecent, shownReal, shownNetwork, shownOpen, shownBar;
    const refreshDonors = (force = false) => {
      const { real, state, testNetwork, messageMinSats: bar } = BL.donations;
      showBananaRate();
      if (!force && shownTally === state.tally && shownBoard === state.board && shownRecent === state.recent && shownReal === real && shownNetwork === testNetwork && shownOpen === state.open && shownBar === bar) return;
      shownTally = state.tally; shownBoard = state.board; shownRecent = state.recent; shownReal = real; shownNetwork = testNetwork; shownOpen = state.open; shownBar = bar;
      const tally = real ? state.tally : donationStats;
      // The chip says whose figures these are: this browser's demo, a test network's, the feed still loading,
      // donations closed, or the island's live feed.
      const tone = !real ? "idle" : testNetwork ? "test" : !tally ? "wait" : state.open === false ? "closed" : "live";
      el.bananaSource.dataset.tone = tone;
      el.bananaSource.textContent = tone === "idle" ? "Demo" : tone === "test" ? `Test · ${testNetwork}` : tone === "wait" ? "Loading" : tone === "closed" ? "Closed" : "Live";
      el.bananaSource.title = tone === "idle" ? "Demo donations saved in this browser" : tone === "test" ? `Test donations on ${testNetwork}, not real bitcoin`
        : tone === "wait" ? "Waiting for the island’s donation feed" : tone === "closed" ? "Donations are closed for now" : "The island’s donation feed";
      el.statDonations.textContent = tally ? BANANA_COUNT.format(real ? tally.count : tally.donations) : "—";
      el.statSats.textContent = tally ? BANANA_COUNT.format(real ? tally.sats : tally.totalSats) : "—";
      const entries = real ? donorUnit === "sats" ? state.boardSats : state.board : donationStats?.donors;
      const missingSats = donorUnit === "sats" && (real && state.board !== null && entries === null || entries?.some((entry) => entry.sats === null));
      // The API ranks before rounding bananas, with stable account-id ties. Keep that order.
      const ranked = missingSats ? [] : real ? entries || [] : (entries || []).slice().sort((a, b) =>
        b[donorUnit] - a[donorUnit] || b[donorUnit === "bananas" ? "sats" : "bananas"] - a[donorUnit === "bananas" ? "sats" : "bananas"]
        || a.handle.localeCompare(b.handle));
      for (let i = 0; i < leaderRows.length; i++) {
        const entry = ranked[i], row = leaderRows[i];
        row.li.hidden = !entry;
        if (!entry) continue;
        const name = entry.handle ? `@${entry.handle}` : "Anonymous";
        const amount = (donorUnit === "sats" ? BANANA_COUNT : DONOR_BANANAS).format(entry[donorUnit]);
        if (row.nameText.data !== name) row.nameText.data = name;
        if (row.amountText.data !== amount) row.amountText.data = amount;
        row.name.dataset.anon = String(!entry.handle);
      }
      el.bananaEmpty.hidden = ranked.length > 0;
      el.bananaEmpty.textContent = missingSats ? "Sat totals are not available from the donation feed yet."
        : real && !entries ? "Loading the donor leaderboard…"
        : real ? "No donations yet. Feed the first Ooga!" : "New demo donations will appear here.";
      // The recent list: the newest first, its orange check only on the API's word that the donor's GitHub login
      // matched the name, into the fixed rows.
      const all = real ? state.recent || [] : donationStats?.recentDonations || [];
      const recent = recentBarOnly ? all.filter((entry) => entry.sats >= bar) : all;
      el.bananaRecentBarLabel.textContent = `${BANANA_COUNT.format(bar)} sats and up only`;
      el.donationMessageLabel.textContent = `Banana message (up to 280 characters, with a tip of ${BANANA_COUNT.format(bar)} sats or more)`;
      for (let i = 0; i < recentRows.length; i++) {
        const row = recentRows[i], entry = recent[i];
        row.li.hidden = !entry;
        if (!entry) continue;
        row.label.data = entry.handle ? `@${entry.handle}` : "Anonymous";
        row.name.dataset.anon = String(!entry.handle);
        row.badge.hidden = !(real && entry.verified);
        row.amountText.data = (donorUnit === "sats" ? BANANA_COUNT : DONOR_BANANAS).format(entry[donorUnit]);
        const message = BL.donations.carried(entry.sats, entry.message);
        row.message.hidden = !message;
        row.messageText.data = message;
      }
      el.bananaRecentEmpty.hidden = recent.length > 0;
      el.bananaRecentEmpty.textContent = recentBarOnly && all.length ? `None of the latest tips reached ${BANANA_COUNT.format(bar)} sats.`
        : real ? "Recent donations will appear here as they arrive." : "New demo donations will appear here.";
      el.bananaBoardNote.textContent = !real ? "Demo donations in this browser only. Earlier tips have no donor history."
        : testNetwork ? `Test donations on ${testNetwork}. Leaderboard values are recorded when paid.`
        : "Leaderboard totals use each donation's recorded value.";
      el.bananaBoardUnit.textContent = donorUnit === "sats" ? "Sats" : "Bananas";
      el.bananaLeaders.setAttribute("aria-label", `Top donors by ${donorUnit}`);
      for (const button of el.donorUnits) button.setAttribute("aria-pressed", String(button.dataset.donorUnit === donorUnit));
    };
    for (const button of el.donorUnits) on(button, "click", () => {
      donorUnit = button.dataset.donorUnit;
      refreshDonors(true);
    });
    listeners.push(BL.donations.subscribeState(refreshDonors));
    liveDonors = refreshDonors;
    refreshDonors(true);
    const setStats = (stats) => {
      setDonationStats(stats);
    };
    let actLabel = el.act.textContent;
    const setAct = (label) => {
      if (label === actLabel) return;
      actLabel = label;
      el.act.textContent = label;
    };
    let actionHandler = null;
    const DETACHED_NAMES = { pile: "Pile", lab: "Lab", mirror: "Mirror", underground: "HQ", basement: "Basement", mempool: "Mempool", factory: "LN Factory", arcade: "Ooga Arcade", bca: "B.C.A.", gate: "North gate", bifrost: "₿IFRÖST", timechain: "TC Sphere" };
    let destinationNames = [];
    let destinationIndex = -1;
    let detachedPreset = "pile", detachedNameShown = false, detachedSelectionShown = false, areaLabel = "";
    const setDestinations = (names) => {
      destinationNames = names.filter(name => DETACHED_NAMES[name]);
      destinationIndex = destinationNames.indexOf(detachedPreset);
      el.modeDestination.hidden = !modeVisible || !destinationNames.length;
    };
    const cycleDestinations = () => {
      if (!destinationNames.length || !actionHandler) return;
      // A refused arrival must not trap the next press at the same place.
      // Only a successful navigation updates the displayed destination.
      destinationIndex = (destinationIndex + 1) % destinationNames.length;
      actionHandler("mode-preset", destinationNames[destinationIndex]);
    };
    let destinationAnchored = false, destinationX = 0, destinationY = 0, destinationZ = 0;
    const showAreaLabel = () => {
      if (el.modeDestinationName.textContent !== areaLabel) el.modeDestinationName.textContent = areaLabel;
      el.modeDestinationName.classList.toggle("show", !!areaLabel);
    };
    const fadeDetachedName = (force = false) => {
      // Looking or zooming at an arrival does not leave that place.
      // Scenes with an anchor expire it from actual travel instead.
      if (destinationAnchored && !force) return;
      if (!detachedNameShown && !detachedSelectionShown) return;
      destinationAnchored = false;
      detachedNameShown = false;
      detachedSelectionShown = false;
      showAreaLabel();
    };
    const setAreaLabel = (name, position = null) => {
      areaLabel = name;
      if (destinationAnchored && position
        && (position.x - destinationX) ** 2 + (position.y - destinationY) ** 2 + (position.z - destinationZ) ** 2 > 2.25) fadeDetachedName(true);
      if (!detachedNameShown) showAreaLabel();
    };
    const setDetachedView = (name, announce = false, position = null) => {
      if (!DETACHED_NAMES[name]) return;
      detachedPreset = name;
      destinationIndex = destinationNames.indexOf(name);
      destinationAnchored = !!position;
      if (position) { destinationX = position.x; destinationY = position.y; destinationZ = position.z; }
      detachedSelectionShown = true;
      if (!announce) return;
      el.modeDestinationName.textContent = DETACHED_NAMES[name];
      detachedNameShown = true;
      el.modeDestinationName.classList.add("show");
    };
    let gorillaEntry = null, gorillaView = "orbit", gorillaCombat = false, gorillaCombatEnabled = true;
    let modeName = "", modeGeometry = null, modeSelected = false, modeCombat = false, modeView = "detached", modeHealth = -1, modeHealthMax = 0, modeGorilla = false;
    let modeCave = null, modeVisible = true, retakePortraitActor = null, retakeGeometry = null, retakePortraitGeometry = null, retakeHealth = -1, retakeHealthMax = 0;
    const retake = { actor: null, gorilla: false };
    const syncRetakeActor = () => {
      const actor = retake.actor;
      const shown = modeVisible && !!actor && !modeCave && !gorillaEntry;
      if (el.ownOoga.hidden === shown) el.ownOoga.hidden = !shown;
      if (!shown) return;
      const cave = retake.gorilla ? actor.owner : actor, gorilla = retake.gorilla ? actor.gorilla : null;
      const geometry = gorilla ? gorilla.parts.head.geometry : cave.parts.head.geometry;
      const portraitGeometry = gorilla ? geometry : cave.portraitHead;
      if (actor !== retakePortraitActor || geometry !== retakeGeometry || portraitGeometry !== retakePortraitGeometry) {
        renderFaceIcon(el.ownOogaFace, cave, gorilla);
        el.ownOoga.dataset.portrait = "face-crop";
        if (actor !== retakePortraitActor) {
          const name = cave.traits.display;
          const label = gorilla ? `Return to ${name}'s gorilla` : `Return to ${name}, Ooga`;
          el.ownOoga.setAttribute("aria-label", label);
          el.ownOoga.title = label;
          el.ownOoga.dataset.gorilla = String(!!gorilla);
          if (healthEnabled) el.ownOogaHealth.setAttribute("aria-label", `${gorilla ? "Gorilla" : "Ooga"} health: ${name}`);
        }
        retakePortraitActor = actor;
        retakeGeometry = geometry;
        retakePortraitGeometry = portraitGeometry;
      }
      if (!healthEnabled) return;
      const source = actor.health, max = source ? source.max : BL.crew.HEALTH_MAX;
      const health = source ? Math.max(0, Math.min(max, source.value)) : max;
      if (health !== retakeHealth || max !== retakeHealthMax) {
        retakeHealth = health; retakeHealthMax = max;
        el.ownOogaHealthFill.style.transform = `scaleY(${health / max})`;
        el.ownOogaHealth.setAttribute("aria-valuemax", String(max));
        el.ownOogaHealth.setAttribute("aria-valuenow", String(Math.ceil(health)));
      }
    };
    // Legacy account updates never replace the last actor successfully controlled.
    const setOwnOoga = () => syncRetakeActor();
    let modeCombatEnabled = true;
    const setMode = (cave, combat = false, view = cave ? "orbit" : "detached", visible = true, combatEnabled = true) => {
      const gorilla = gorillaEntry ? gorillaEntry.gorilla : null;
      modeCave = gorilla ? null : cave;
      modeVisible = visible;
      if (gorillaEntry || cave) { retake.actor = gorillaEntry || cave; retake.gorilla = !!gorillaEntry; }
      syncRetakeActor();
      if (gorilla) { cave = gorillaEntry.owner; combat = gorillaCombat; view = gorillaView; visible = true; combatEnabled = gorillaCombatEnabled; }
      const selected = !!cave, name = selected ? cave.traits.name : "", shown = selected ? cave.traits.display : "";
      if (!visible) fadeDetachedName(true);
      const identityChanged = selected !== modeSelected || selected && name !== modeName || !!gorilla !== modeGorilla;
      const stateChanged = combat !== modeCombat || view !== modeView || combatEnabled !== modeCombatEnabled;
      const showMode = visible && selected;
      if (el.mode.hidden === showMode) el.mode.hidden = !showMode;
      const showDestinations = visible && destinationNames.length > 0;
      if (el.modeDestination.hidden === showDestinations) el.modeDestination.hidden = !showDestinations;
      const geometry = selected ? (gorilla ? gorilla.parts.head.geometry : cave.parts.head.geometry) : null;
      if (selected && (identityChanged || geometry !== modeGeometry)) {
        renderFaceIcon(el.modeFace, cave, gorilla);
        el.mode.dataset.portrait = "face-crop";
        modeName = name;
        modeGeometry = geometry;
      }
      if (!!gorilla !== modeGorilla) { modeGorilla = !!gorilla; el.mode.dataset.gorilla = String(modeGorilla); }
      if (selected !== modeSelected) {
        modeSelected = selected;
        el.mode.dataset.selected = String(selected);
      }
      if (el.modeFace.hidden === selected) el.modeFace.hidden = !selected;
      const showHealth = healthEnabled && selected;
      if (el.modeHealth.hidden === showHealth) el.modeHealth.hidden = !showHealth;
      if (showHealth) {
        const sourceHealth = gorilla ? gorillaEntry.health : cave && cave.health;
        const healthMax = sourceHealth ? sourceHealth.max : BL.crew.HEALTH_MAX;
        const health = sourceHealth ? Math.max(0, Math.min(healthMax, sourceHealth.value)) : healthMax;
        if (health !== modeHealth || healthMax !== modeHealthMax) {
          modeHealth = health;
          modeHealthMax = healthMax;
          el.modeHealthFill.style.transform = `scaleY(${health / healthMax})`;
          el.modeHealth.setAttribute("aria-valuemax", String(healthMax));
          el.modeHealth.setAttribute("aria-valuenow", String(Math.ceil(health)));
        }
      }
      if (stateChanged) { modeCombat = combat; modeView = view; modeCombatEnabled = combatEnabled; }
      if (identityChanged || stateChanged) {
        el.mode.dataset.shooter = String(selected && combat && combatEnabled);
        el.mode.dataset.combat = String(selected && combat);
        el.mode.dataset.view = selected ? view : "detached";
        el.mode.setAttribute("aria-pressed", String(selected && combat));
        const look = combatEnabled || gorilla ? combat ? "combat" : "carry" : combat ? "cursor look" : "drag to look";
        const change = combatEnabled || gorilla ? "combat or carry mode" : "cursor look or click-and-drag look";
        el.mode.setAttribute("aria-label", gorilla
          ? `${shown}'s gorilla; ${view} view; ${look}. Press to switch ${change}; hold to detach`
          : selected
          ? `${shown}; ${view} view; ${look}. Press to switch ${change}; hold to detach`
          : `${DETACHED_NAMES[detachedPreset]} detached view. Press to cycle destinations`);
        el.mode.title = gorilla ? `${shown}'s gorilla · ${view} · ${look} · hold to detach` : selected ? `${shown} · ${view} · ${look} · hold to detach` : `${DETACHED_NAMES[detachedPreset]} · detached`;
      }
    };
    setDetachedView(detachedPreset);
    let primaryShown = false, primarySelected = false, primaryAiming = false, primaryHeld = false, primaryPower = 100;
    let primaryGeometry = null, primaryPointer = -1, primaryKey = "";
    const finishPrimary = (cancel) => {
      if (primaryPointer < 0 && !primaryKey) return;
      const pointer = primaryPointer;
      primaryPointer = -1; primaryKey = "";
      if (pointer >= 0 && el.primary.hasPointerCapture(pointer)) el.primary.releasePointerCapture(pointer);
      if (actionHandler) actionHandler(cancel ? "weapon-primary-cancel" : "weapon-primary-up");
    };
    const setPrimary = (available, selected, geometry, charge = 0, held = false, power = 1, aiming = false, ownerName = "") => {
      if (!available || !selected && primarySelected || geometry !== primaryGeometry) finishPrimary(true);
      if (available !== primaryShown) {
        primaryShown = available;
      }
      if (el.primary.hidden !== (!available || !!gorillaEntry)) el.primary.hidden = !available || !!gorillaEntry;
      if (available && geometry !== primaryGeometry) {
        renderPrimaryIcon(el.primaryIcon, geometry, ownerName === "timechainb");
        primaryGeometry = geometry;
      }
      if (selected !== primarySelected || aiming !== primaryAiming) {
        primarySelected = selected; primaryAiming = aiming;
        el.primary.dataset.equipped = String(selected);
        el.primary.setAttribute("aria-pressed", String(selected));
        el.primary.title = !selected ? "Equip primary melee weapon (1)" : "Melee weapon · 0.2s between swings for full power · hold for double damage (1)";
        el.primary.setAttribute("aria-label", !selected ? "Equip primary melee weapon" : "Melee weapon · allow 0.2 seconds between swings for full power, then hold for double damage");
      }
      if (held !== primaryHeld) {
        primaryHeld = held;
        el.primary.dataset.charging = String(held);
      }
      const strength = Math.round(Math.max(0.25, Math.min(2, power)) * 100);
      if (strength !== primaryPower) {
        primaryPower = strength;
        el.primaryStrengthFill.style.transform = `scaleY(${strength / 200})`;
        el.primaryStrength.setAttribute("aria-valuenow", String(strength));
        el.primaryStrength.setAttribute("aria-valuetext", `${strength}% of normal swing damage`);
      }
    };
    let weaponShown = false, weaponEquipped = false, weaponAmmo = -1, weaponDisplayAmmo = -1, weaponReloading = false, weaponCanReload = false, weaponUnlimited = false;
    let magazineCount = 0, magazineHigh = -1, magazineLow = -1, magazineCanSwap = false;
    let magazineHighReloading = false, magazineLowReloading = false;
    let weaponTotal = -1, weaponLabelAmmo = -1, weaponLabelEquipped = false;
    const refreshWeaponSummary = () => {
      const total = weaponUnlimited ? Infinity : Math.max(0, weaponAmmo) + (magazineCount ? Math.max(0, magazineHigh) : 0) + (magazineCount > 1 ? Math.max(0, magazineLow) : 0);
      const shown = !gorillaEntry && weaponShown && weaponEquipped && magazineCount > 0;
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
        el.weaponToggle.setAttribute("aria-label", weaponUnlimited ? `${weaponEquipped ? "Fire" : "Equip"} AK-47; unlimited ammunition` : weaponEquipped ? `Fire AK-47; ammo ${labelAmmo} of 30 rounds` : `Equip AK-47; ${total} rounds total`);
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
      }
      if (el.weapon.hidden !== (!available || !!gorillaEntry)) el.weapon.hidden = !available || !!gorillaEntry;
      if (equipped !== weaponEquipped) {
        weaponEquipped = equipped;
        el.weapon.dataset.equipped = String(equipped);
        el.weaponToggle.setAttribute("aria-pressed", String(equipped));
        el.weaponToggle.setAttribute("aria-expanded", String(equipped));
        el.weaponToggle.title = equipped ? "Fire AK-47" : "Equip AK-47 (2)";
        el.weaponReadout.setAttribute("aria-hidden", String(!equipped));
      }
      if (modeChanged || reloading !== weaponReloading || canReload !== weaponCanReload) {
        weaponReloading = reloading;
        weaponCanReload = canReload;
        el.weapon.dataset.reloading = String(reloading);
        el.weapon.dataset.canReload = String(canReload);
        el.weaponLabel.firstChild.data = reloading ? "Reloading" : "Ammo";
        el.weaponMagazine.title = unlimited ? "Unlimited ammunition; firing does not consume rounds" : reloading ? "Stay near the pile to keep reloading; leave its range to stop" : canReload ? "Press Space to reload beside the pile; its level stays the same" : "Each slot is 1 round. Press Space beside the pile to reload.";
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
        const filled = Math.round(high / 6), previous = Math.round(magazineHigh / 6);
        for (let i = 0; i < el.magazineBananas.length; i++) if (magazineHigh < 0 || (i < filled) !== (i < previous)) el.magazineBananas[i].dataset.filled = String(i < filled);
        magazineHigh = high;
        el.magazineAmmo.firstChild.data = String(high);
        button.dataset.level = high === 0 ? "empty" : high <= 5 ? "low" : "ok";
      }
      if (low !== magazineLow) {
        const filled = Math.round(low / 6), previous = Math.round(magazineLow / 6);
        for (let i = 0; i < el.magazineRearBananas.length; i++) if (magazineLow < 0 || (i < filled) !== (i < previous)) el.magazineRearBananas[i].dataset.filled = String(i < filled);
        magazineLow = low;
        el.magazineLowAmmo.firstChild.data = String(low);
        el.magazineLowAmmo.dataset.level = low === 0 ? "empty" : low <= 5 ? "low" : "ok";
      }
      refreshWeaponSummary();
    };
    let jetpackShown = false, jetpackEquipped = false, jetpackBlocked = false, jetpackPercent = -1, jetpackLevel = "";
    const setJetpack = (owned, equipped, fuel, blocked = false) => {
      if (owned !== jetpackShown) {
        jetpackShown = owned;
      }
      if (el.jetpack.hidden !== (!owned || !!gorillaEntry)) el.jetpack.hidden = !owned || !!gorillaEntry;
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
      const level = fuel < 0.2 ? "low" : "ok";
      if (level !== jetpackLevel) {
        jetpackLevel = level;
        el.jetpackCompactFuel.dataset.level = level;
      }
      if (percent === jetpackPercent) return;
      jetpackPercent = percent;
      el.jetpackCompactFill.style.transform = `scaleY(${percent / 100})`;
      el.jetpackCompactFuel.setAttribute("aria-valuenow", String(percent));
    };
    const setGorilla = (entry, view = "orbit", combat = false, combatEnabled = true) => {
      if (entry === gorillaEntry && view === gorillaView && combat === gorillaCombat && combatEnabled === gorillaCombatEnabled) { syncRetakeActor(); return; }
      if (entry !== gorillaEntry) finishPrimary(true);
      gorillaEntry = entry;
      gorillaView = view;
      gorillaCombat = combat;
      gorillaCombatEnabled = combatEnabled;
      el.gorillaSmash.hidden = !entry || !combatEnabled;
      el.primary.hidden = !primaryShown || !!entry;
      el.weapon.hidden = !weaponShown || !!entry;
      el.jetpack.hidden = !jetpackShown || !!entry;
      refreshWeaponSummary();
      setMode(null);
    };
    const setGorillaSmashPower = (power, returning = false, throwing = false) => {
      const percent = Math.round(Math.max(0, Math.min(throwing ? 1 : 5, power)) * (throwing ? 100 : 40));
      el.gorillaSmash.dataset.returning = String(returning);
      el.gorillaStrengthFill.style.transform = `scaleY(${percent / (throwing ? 100 : 200)})`;
      el.gorillaStrength.setAttribute("aria-label", throwing ? "Ooga throw power" : "Ground smash power");
      el.gorillaStrength.setAttribute("aria-valuemax", throwing ? "100" : "200");
      el.gorillaStrength.setAttribute("aria-valuenow", String(percent));
      el.gorillaStrength.setAttribute("aria-valuetext", throwing ? `${percent}% throw power` : `${percent}% of normal smash damage`);
      el.gorillaSmash.setAttribute("aria-label", throwing ? "Throw Ooga; hold click to charge, release to throw" : "Ground smash; hold for double damage");
      el.gorillaSmash.title = throwing ? "Throw Ooga · hold click to charge, release to throw" : "Ground smash · hold for double damage (1)";
    };
    const setSubtitle = (text) => {
      el.subtitle.textContent = text;
    };
    const onAction = (fn) => {
      actionHandler = fn;
    };
    // The Worker build marks its pages so a failed account lookup cannot turn a real tip into a demo.
    const workerPage = document.documentElement.dataset.workerPage === "1";
    const openFeed = () => {
      if (!BL.donations.real && (workerPage || BL.net.state.backend)) {
        toast("Donations are unavailable right now. Try again shortly.");
        return;
      }
      BL.donationPopup.open(!BL.donations.real);
    };
    const floatingBoards = [];
    let panelsHidden = false;
    const stackBoards = () => {
      for (let i = 0; i < floatingBoards.length; i++) floatingBoards[i].setLayer(20 + i);
    };
    let boardWindowId = 0;
    let lastBoard = null, lastBoardWidth = 550, boardSaveTimer = 0, boardSavingEnabled = false, boardSavingSuspended = false;
    const saveBoardState = () => {
      window.clearTimeout(boardSaveTimer);
      boardSaveTimer = 0;
      if (!boardSavingEnabled || boardSavingSuspended) return;
      if (lastBoard) lastBoardWidth = lastBoard.width;
      try {
        localStorage.setItem(BOARD_STATE_KEY, JSON.stringify({ version: 1, lastWidth: lastBoardWidth,
          lastUsed: floatingBoards.indexOf(lastBoard), windows: floatingBoards.map((popup) => popup.snapshot()) }));
      } catch { /* Storage may be unavailable or full. */ }
    };
    const scheduleBoardSave = () => {
      if (boardSavingEnabled && !boardSavingSuspended && !boardSaveTimer) boardSaveTimer = window.setTimeout(saveBoardState, 100);
    };
    on(window, "pagehide", saveBoardState);
    const createBoardWindow = (node, floatingId = 0, saved = null) => {
      const el = { board: node };
      const ids = {
        boardTitle: "board-title", boardScreen: "board-screen", boardCaption: "board-caption", boardNote: "board-note", boardLinks: "board-links",
        boardDots: "board-dots", boardPrev: "board-prev", boardNext: "board-next", boardHelp: "board-help",
        boardHead: "board-head", boardPause: "board-pause", boardResize: "board-resize",
        boardFilter: "board-filter", boardFilterMenu: "board-filter-menu", boardFilterList: "board-filter-list", boardRollup: "board-rollup",
        boardFilterRepos: "board-filter-repos", boardFilterUsers: "board-filter-users", boardFilterTypes: "board-filter-types"
      };
      for (const key in ids) el[key] = node.querySelector(`[id="${ids[key]}"]`);
      const boardNav = node.querySelector(".board-nav"), boardCenter = node.querySelector(".board-center");
      if (floatingId) {
        node.id += `-${floatingId}`;
        for (const child of node.querySelectorAll("[id]")) child.id += `-${floatingId}`;
        node.setAttribute("aria-labelledby", el.boardTitle.id);
        el.boardScreen.tabIndex = 0;
        el.boardScreen.setAttribute("role", "button");
        el.boardScreen.setAttribute("aria-label", "Toggle Oogatron header and footer");
      }
      el.boardFilter.setAttribute("aria-controls", el.boardFilterMenu.id);
      el.boardFilterRepos.setAttribute("aria-controls", el.boardFilterList.id);
      el.boardFilterUsers.setAttribute("aria-controls", el.boardFilterList.id);
      el.boardFilterTypes.setAttribute("aria-controls", el.boardFilterList.id);
      const boardListeners = [];
      const on = (target, type, fn, options) => {
        target.addEventListener(type, fn, typeof options === "boolean" ? { capture: options, signal } : { ...options, signal });
        boardListeners.push(() => target.removeEventListener(type, fn, options));
      };
      // Each window copies a readable board's canvas and owns its controls.
      // A board is any object with `title`, `help`, `canvas`, `count`, `index`, `caption`, `note`, `version` and
      // `go(index)`, plus optional `wide` and `captionAbove` layouts and a `link` out ({ href, label }, opened in a new tab). The dialog copies the canvas, captions the page, lays one dot per page and pages with the
      // chevrons, the dots and the arrow keys; it never learns what a board shows, so a board can change freely.
      // `updateBoard` repaints whenever the open board's version moves.
      // A `floating` board also supplies `paused` and `setPaused`, and keeps island input available.
      let board = null, boardShown = -1, boardDots = -1;
      let controlsHidden = saved?.controlsHidden === true;
      let filterTab = "repos", filterShown = -1;
      const filterTabs = [el.boardFilterRepos, el.boardFilterUsers, el.boardFilterTypes];
      const typeLabels = { commit: "Commits", pr: "Pull requests", review: "Reviews", merge: "Merges", issue: "Issues", comment: "Comments" };
      const filterOptions = () => filterTab === "repos" ? board.repos : filterTab === "users" ? board.users : board.types;
      const filterKey = (entry) => filterTab === "repos" ? entry.name : filterTab === "users" ? entry.login : entry;
      const paintFilters = () => {
        filterShown = board.filterVersion;
        const selected = board.filters[filterTab];
        const active = document.activeElement;
        const focusedChoice = el.boardFilterList.contains(active) ? active.dataset.filterChoice : null;
        const focusedValue = focusedChoice ? active.value : null;
        const rows = [];
        const row = (value, text, checked, all = false) => {
          const label = document.createElement("label"), input = document.createElement("input"), caption = document.createElement("span");
          input.type = "checkbox"; input.checked = checked; input.value = value;
          input.dataset.filterChoice = all ? "all" : "one";
          caption.textContent = text;
          label.append(input, caption); rows.push(label);
        };
        row("", filterTab === "repos" ? "All repos" : filterTab === "users" ? "All contributors" : "All types", selected === null, true);
        for (const entry of filterOptions()) {
          const key = filterKey(entry);
          const label = filterTab === "repos" ? key
            : filterTab === "users" ? BL.characters.displayOf(key) : typeLabels[key];
          row(key, label, selected === null || selected.includes(key));
        }
        const scroll = el.boardFilterList.scrollTop;
        el.boardFilterList.replaceChildren(...rows);
        el.boardFilterList.scrollTop = scroll;
        if (focusedChoice) for (const input of el.boardFilterList.querySelectorAll("input")) {
          if (input.dataset.filterChoice === focusedChoice && input.value === focusedValue) { input.focus({ preventScroll: true }); break; }
        }
        el.boardFilterList.setAttribute("aria-labelledby", filterTabs.find((tab) => tab.dataset.filterTab === filterTab).id);
        for (const tab of filterTabs) {
          const active = tab.dataset.filterTab === filterTab;
          tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1;
        }
      };
      const positionFilters = () => {
        const screen = el.boardScreen, play = el.boardPause, menu = el.boardFilterMenu;
        // Match the screen's edges and stop at the play button's bottom.
        menu.style.left = `${screen.offsetLeft}px`;
        menu.style.top = `${screen.offsetTop}px`;
        menu.style.width = `${screen.offsetWidth}px`;
        menu.style.height = `${play.offsetTop + play.offsetHeight - screen.offsetTop}px`;
      };
      const showFilters = (open) => {
        el.boardFilterMenu.hidden = !open;
        el.boardFilter.setAttribute("aria-expanded", String(open));
        if (open) { paintFilters(); positionFilters(); }
      };
      // Geometry and pointer state belong to this window for this visit.
      const boardRatio = 550 / 368;
      const width = saved?.width ?? lastBoard?.width ?? lastBoardWidth;
      const boardWindow = { x: saved?.x ?? 0, y: saved?.y ?? 0, width, height: width / boardRatio, placed: !!saved };
      const boardBounds = { left: 0, top: 0, right: 0, bottom: 0 };
      const overlapsBoard = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const readBoardBounds = () => {
        const r = el.boardScreen.getBoundingClientRect();
        boardBounds.left = r.left; boardBounds.top = r.top;
        boardBounds.right = r.right; boardBounds.bottom = r.bottom;
      };
      const interactBoard = () => {
        if (!floatingId) return;
        lastBoard = controller;
        lastBoardWidth = boardWindow.width;
        const index = floatingBoards.indexOf(controller);
        if (index >= 0 && index !== floatingBoards.length - 1) {
          floatingBoards.splice(index, 1);
          floatingBoards.push(controller);
        }
        // Keep pressed controls and pointer capture attached while raising the window.
        stackBoards();
        scheduleBoardSave();
      };
      const paintBoardControls = () => {
        el.board.classList.toggle("board-controls-hidden", controlsHidden);
        el.boardScreen.setAttribute("aria-expanded", String(!controlsHidden));
        el.boardScreen.title = controlsHidden ? "Show header and footer" : "Hide header and footer";
      };
      const toggleBoardControls = () => {
        if (!board?.floating) return;
        interactBoard();
        controlsHidden = !controlsHidden;
        showFilters(false);
        paintBoardControls();
        scheduleBoardSave();
      };
      on(el.boardScreen, "click", () => {
        if (!board?.floating) return;
        toggleBoardControls();
        el.boardScreen.blur();
      });
      on(el.boardScreen, "keydown", (e) => {
        if (!board?.floating || e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault(); e.stopPropagation();
        if (!e.repeat) toggleBoardControls();
      });
      let boardPointer = -1, boardHandle = null, boardResizing = false;
      let boardStartX = 0, boardStartY = 0, boardStartLeft = 0, boardStartTop = 0, boardStartWidth = 0;
      const layoutBoard = () => {
        const w = window.innerWidth, h = window.innerHeight, b = boardWindow;
        const maxWidth = Math.min(w, h * boardRatio);
        b.width = Math.min(maxWidth, Math.max(Math.min(260, maxWidth), b.width));
        b.height = b.width / boardRatio;
        b.x = Math.max(0, Math.min(w - b.width, b.x));
        el.board.style.width = `${b.width}px`;
        el.board.style.height = `${b.height}px`;
        el.board.style.left = `${b.x}px`;
        el.board.style.setProperty("--board-scale", String(Math.min(b.width, 550) / 440));
        // The footer may sit below the viewport; keep the black display itself in view.
        const screenBottom = el.boardScreen.getBoundingClientRect().bottom - el.board.getBoundingClientRect().top;
        b.y = Math.max(0, Math.min(h - screenBottom, b.y));
        el.board.style.top = `${b.y}px`;
        readBoardBounds();
        if (!el.boardFilterMenu.hidden) positionFilters();
      };
      const moveBoard = (x, y) => {
        const b = boardWindow, left = b.x, top = b.y;
        const r = { ...boardBounds };
        b.x = x; b.y = y;
        layoutBoard();
        let dx = b.x - left, dy = b.y - top, movedX = 0, movedY = 0;
        // Sweep the black display, then slide along contact. A fast pointer must
        // not jump through a neighbour, and transparent controls are not walls.
        for (let pass = 0; pass < 3 && (dx || dy); pass++) {
          let time = 1, stopX = false, stopY = false;
          for (const popup of floatingBoards) {
            if (popup === controller) continue;
            const other = popup.bounds;
            // Old or overcrowded layouts must still allow an overlap to separate.
            if (overlapsBoard(r, other)) continue;
            const l = r.left + movedX, t = r.top + movedY, right = r.right + movedX, bottom = r.bottom + movedY;
            if (!dx && (right <= other.left || l >= other.right) || !dy && (bottom <= other.top || t >= other.bottom)) continue;
            const enterX = dx > 0 ? (other.left - right) / dx : dx < 0 ? (other.right - l) / dx : -Infinity;
            const leaveX = dx > 0 ? (other.right - l) / dx : dx < 0 ? (other.left - right) / dx : Infinity;
            const enterY = dy > 0 ? (other.top - bottom) / dy : dy < 0 ? (other.bottom - t) / dy : -Infinity;
            const leaveY = dy > 0 ? (other.bottom - t) / dy : dy < 0 ? (other.top - bottom) / dy : Infinity;
            const enter = Math.max(enterX, enterY), leave = Math.min(leaveX, leaveY);
            if (enter < 0 || enter > time || enter >= leave) continue;
            if (enter < time) { stopX = false; stopY = false; }
            time = enter;
            stopX ||= enterX >= enterY;
            stopY ||= enterY >= enterX;
          }
          // Leave a subpixel clearance so layout rounding cannot turn contact
          // into an existing overlap on the next pointer event.
          const travelX = dx * time, travelY = dy * time;
          movedX += travelX - (stopX ? Math.sign(travelX) * Math.min(0.02, Math.abs(travelX)) : 0);
          movedY += travelY - (stopY ? Math.sign(travelY) * Math.min(0.02, Math.abs(travelY)) : 0);
          dx = stopX ? 0 : dx * (1 - time);
          dy = stopY ? 0 : dy * (1 - time);
        }
        b.x = left + movedX; b.y = top + movedY;
        el.board.style.left = `${b.x}px`; el.board.style.top = `${b.y}px`;
        readBoardBounds();
      };
      const resizeBoard = (width) => {
        const before = { ...boardWindow }, bounds = { ...boardBounds };
        const maxWidth = window.innerWidth - boardWindow.x;
        boardWindow.width = Math.min(maxWidth, Math.max(Math.min(260, maxWidth), width));
        layoutBoard();
        for (const popup of floatingBoards) {
          if (popup === controller || overlapsBoard(bounds, popup.bounds) || !overlapsBoard(boardBounds, popup.bounds)) continue;
          boardWindow.x = before.x; boardWindow.y = before.y; boardWindow.width = before.width;
          layoutBoard();
          break;
        }
      };
      const placeBoard = () => {
        if (!floatingBoards.some(popup => popup !== controller && overlapsBoard(boardBounds, popup.bounds))) return;
        const b = boardWindow, width = boardBounds.right - boardBounds.left, height = boardBounds.bottom - boardBounds.top;
        const offsetX = boardBounds.left - b.x, offsetY = boardBounds.top - b.y;
        const maxX = window.innerWidth - b.width, maxY = window.innerHeight - offsetY - height;
        const xs = [b.x, 0, maxX], ys = [b.y, 0, maxY];
        for (const popup of floatingBoards) {
          if (popup === controller) continue;
          xs.push(popup.bounds.left - width - offsetX - 0.02, popup.bounds.right - offsetX + 0.02);
          ys.push(popup.bounds.top - height - offsetY - 0.02, popup.bounds.bottom - offsetY + 0.02);
        }
        const candidate = { left: 0, top: 0, right: 0, bottom: 0 };
        let best = Infinity, bestX = b.x, bestY = b.y;
        for (const x of xs) for (const y of ys) {
          if (x < 0 || x > maxX || y < 0 || y > maxY) continue;
          const distance = (x - b.x) ** 2 + (y - b.y) ** 2;
          if (distance >= best) continue;
          candidate.left = x + offsetX; candidate.top = y + offsetY;
          candidate.right = candidate.left + width; candidate.bottom = candidate.top + height;
          if (floatingBoards.some(popup => popup !== controller && overlapsBoard(candidate, popup.bounds))) continue;
          best = distance; bestX = x; bestY = y;
        }
        b.x = bestX; b.y = bestY;
        layoutBoard();
      };
      const finishBoardPointer = () => {
        const id = boardPointer, handle = boardHandle;
        boardPointer = -1;
        boardHandle = null;
        if (handle && handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
        if (id >= 0) scheduleBoardSave();
      };
      const startBoardPointer = (e, resizing) => {
        if (!board?.floating || boardPointer >= 0 || e.button !== 0 || !e.isPrimary) return;
        if (!resizing && e.target.closest("button")) return;
        interactBoard();
        e.preventDefault();
        e.stopPropagation();
        document.activeElement?.blur();
        boardPointer = e.pointerId;
        boardHandle = resizing ? el.boardResize : el.boardHead;
        boardResizing = resizing;
        boardStartX = e.clientX; boardStartY = e.clientY;
        boardStartLeft = boardWindow.x; boardStartTop = boardWindow.y;
        boardStartWidth = boardWindow.width;
        // The locked virtual cursor already captures its synthetic pointer itself.
        if (e.isTrusted) boardHandle.setPointerCapture(e.pointerId);
      };
      on(el.boardHead, "pointerdown", (e) => startBoardPointer(e, false));
      on(el.boardResize, "pointerdown", (e) => startBoardPointer(e, true));
      on(el.board, "pointerdown", (e) => {
        if (board?.floating) {
          interactBoard();
          if (!e.target.closest("button, input, label")) e.preventDefault();
        }
      });
      on(el.board, "pointermove", (e) => {
        if (e.pointerId !== boardPointer) return;
        e.preventDefault(); e.stopPropagation();
        if (boardResizing) {
          // Project the pointer's motion onto the fixed-ratio corner diagonal.
          const dx = e.clientX - boardStartX, dy = e.clientY - boardStartY;
          resizeBoard(boardStartWidth + (dx + dy / boardRatio) / (1 + 1 / (boardRatio * boardRatio)));
        } else {
          moveBoard(boardStartLeft + e.clientX - boardStartX, boardStartTop + e.clientY - boardStartY);
        }
      });
      const endBoardPointer = (e) => {
        if (e.pointerId !== boardPointer) return;
        e.preventDefault(); e.stopPropagation();
        finishBoardPointer();
      };
      on(el.board, "pointerup", endBoardPointer);
      on(el.board, "pointercancel", endBoardPointer);
      on(el.board, "lostpointercapture", endBoardPointer);
      on(window, "blur", finishBoardPointer);
      on(window, "resize", () => {
        if (board?.floating && !panelsHidden) { layoutBoard(); placeBoard(); scheduleBoardSave(); }
      });
      on(el.boardResize, "keydown", (e) => {
        let step;
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") step = -20;
        else if (e.key === "ArrowRight" || e.key === "ArrowDown") step = 20;
        else return;
        e.preventDefault(); e.stopPropagation();
        interactBoard();
        resizeBoard(boardWindow.width + step);
        scheduleBoardSave();
      });
      const paintBoardPause = () => {
        el.boardPause.setAttribute("aria-label", board.paused ? "Resume screen cycling" : "Pause screen cycling");
        el.boardPause.setAttribute("aria-pressed", String(board.paused));
      };
      const paintBoard = () => {
        boardShown = board.version;
        const src = board.canvas, screen = el.boardScreen;
        if (screen.width !== src.width || screen.height !== src.height) {
          screen.width = src.width;
          screen.height = src.height;
          screen.style.setProperty("--board-ratio", String(src.width / src.height));
        }
        screen.getContext("2d").drawImage(src, 0, 0);
        el.boardCaption.textContent = board.caption;
        el.boardNote.textContent = board.note || "";
        el.boardNote.hidden = !!board.floating || !board.note;
        // A board's links out, one anchor each under its note, made the first time a board needs that many.
        const links = board.links || [];
        el.boardLinks.hidden = !links.length;
        for (let i = el.boardLinks.children.length; i < links.length; i++) {
          const a = document.createElement("a");
          a.className = "board-link";
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.referrerPolicy = "no-referrer";
          el.boardLinks.append(a);
        }
        for (let i = 0; i < el.boardLinks.children.length; i++) {
          const a = el.boardLinks.children[i];
          a.hidden = i >= links.length;
          if (i < links.length) { a.href = links[i].href; a.textContent = links[i].label; }
        }
        if (board.floating || board.carousel) paintBoardPause();
        if (board.floating) {
          el.boardRollup.checked = board.rollup;
          el.boardFilter.dataset.active = String(board.rollup || board.filters.repos !== null || board.filters.users !== null || board.filters.types !== null);
          if (!el.boardFilterMenu.hidden && filterShown !== board.filterVersion) paintFilters();
        }
        if (boardDots !== board.count) {
          boardDots = board.count;
          const dots = [];
          for (let i = 0; i < board.count; i++) {
            const dot = document.createElement("button");
            dot.type = "button";
            dot.className = "board-dot";
            dot.dataset.page = String(i);
            dot.setAttribute("aria-label", `Page ${i + 1}`);
            dots.push(dot);
          }
          el.boardDots.replaceChildren(...dots);
          el.boardDots.hidden = el.boardPrev.hidden = el.boardNext.hidden = !board.floating && board.count < 2;
          el.boardPrev.disabled = el.boardNext.disabled = board.count < 2;
        }
        for (const dot of el.boardDots.children) dot.setAttribute("aria-current", String(+dot.dataset.page === board.index));
        if (!el.boardFilterMenu.hidden) positionFilters();
        if (floatingId) scheduleBoardSave();
      };
      const openBoard = (next) => {
        finishBoardPointer();
        if (el.board.open && !!board?.floating !== !!next.floating) el.board.close();
        board = next;
        boardDots = -1;
        letterSign(el.boardTitle, board.title);
        el.board.classList.toggle("board-wide", !!board.wide);
        el.board.classList.toggle("board-floating", !!board.floating);
        el.board.classList.toggle("board-caption-above", !!board.captionAbove);
        el.board.classList.toggle("board-carousel", !!board.carousel);
        if (board.floating) {
          paintBoardControls();
          boardCenter.prepend(el.boardCaption);
          el.boardHead.insertBefore(el.boardDots, el.boardHead.lastElementChild);
        } else if (board.carousel) {
          el.boardScreen.before(el.boardCaption);
          boardCenter.prepend(el.boardPause);
          el.boardHead.insertBefore(el.boardDots, el.boardHead.lastElementChild);
        } else if (board.captionAbove) {
          el.boardScreen.before(el.boardCaption);
          boardCenter.prepend(el.boardDots);
        } else {
          boardCenter.prepend(el.boardCaption);
          boardNav.after(el.boardDots);
        }
        el.boardCaption.hidden = !!board.floating || !!board.hideCaption;
        el.boardPause.hidden = !board.floating && !board.carousel;
        el.boardResize.hidden = !board.floating;
        el.boardFilter.hidden = !board.floating;
        showFilters(false);
        el.boardHelp.hidden = !!board.floating || !board.help;
        el.boardHelp.textContent = board.help;
        if (board.floating) {
          if (!boardWindow.placed) {
            const offset = ((floatingId - 1) % 6) * 24;
            boardWindow.x = (window.innerWidth - boardWindow.width) / 2 + offset;
            boardWindow.y = (window.innerHeight - boardWindow.height) / 2 + offset;
            boardWindow.placed = true;
          }
        } else {
          el.board.removeAttribute("style");
        }
        if (board.update) board.update();
        paintBoard();
        if (!el.board.open) {
          if (board.floating) {
            el.board.show();
            document.activeElement?.blur();
          } else el.board.showModal();
        }
        if (board.floating) { layoutBoard(); placeBoard(); }
      };
      const closeBoard = () => {
        finishBoardPointer();
        const closing = board;
        board = null;
        if (el.board.open) el.board.close();
        if (floatingId) {
          if (lastBoard === controller) { lastBoardWidth = boardWindow.width; lastBoard = null; }
          for (const off of boardListeners) off();
          boardListeners.length = 0;
          closing?.dispose();
          el.board.remove();
          el.boardScreen.width = el.boardScreen.height = 0;
          const index = floatingBoards.indexOf(controller);
          if (index >= 0) floatingBoards.splice(index, 1);
          stackBoards();
          scheduleBoardSave();
        }
      };
      const updateBoard = (elapsed) => {
        if (board?.update) board.update(elapsed);
        if (board && board.version !== boardShown) paintBoard();
      };
      const pageBoard = (step) => {
        if (!board) return;
        board.go((board.index + step + board.count) % board.count);
        updateBoard();
      };
      on(el.board, "keydown", (e) => {
        interactBoard();
        if (e.target.closest(".board-filter-menu")) {
          if (e.key === "Escape") { showFilters(false); el.boardFilter.focus(); }
          else return;
        }
        else if (e.key === "Escape") {
          if (!el.boardFilterMenu.hidden) showFilters(false);
          else closeBoard();
        }
        else if (e.key === "ArrowLeft") pageBoard(-1);
        else if (e.key === "ArrowRight") pageBoard(1);
        else return;
        e.preventDefault();
        e.stopPropagation();
      });
      on(el.boardFilterMenu, "click", (e) => {
        const tab = e.target.closest("[data-filter-tab]");
        if (!tab) return;
        interactBoard(); filterTab = tab.dataset.filterTab;
        el.boardFilterList.scrollTop = 0;
        paintFilters();
      });
      on(el.boardFilterMenu, "keydown", (e) => {
        if (!e.target.closest("[data-filter-tab]") || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        e.preventDefault(); e.stopPropagation();
        const current = filterTabs.findIndex((tab) => tab.dataset.filterTab === filterTab);
        const next = e.key === "Home" ? 0 : e.key === "End" ? filterTabs.length - 1
          : (current + (e.key === "ArrowRight" ? 1 : filterTabs.length - 1)) % filterTabs.length;
        filterTab = filterTabs[next].dataset.filterTab;
        paintFilters();
        filterTabs[next].focus();
      });
      on(el.boardFilterList, "change", (e) => {
        const input = e.target.closest("[data-filter-choice]");
        if (!input) return;
        interactBoard();
        const choices = filterOptions().map(filterKey);
        let values;
        if (input.dataset.filterChoice === "all") values = input.checked ? null : [];
        else {
          const selected = new Set(board.filters[filterTab] ?? choices);
          if (input.checked) selected.add(input.value); else selected.delete(input.value);
          values = choices.every((key) => selected.has(key)) ? null : [...selected];
        }
        board.setFilter(filterTab, values);
        updateBoard();
        scheduleBoardSave();
      });
      on(el.boardRollup, "change", () => {
        if (!board?.floating) return;
        interactBoard();
        board.setRollup(el.boardRollup.checked);
        updateBoard();
        scheduleBoardSave();
      });
      on(el.boardDots, "click", (e) => {
        const dot = e.target.closest(".board-dot");
        if (!dot || !board) return;
        interactBoard();
        dot.blur();
        board.go(+dot.dataset.page);
        updateBoard();
      });
      on(el.board, "click", (e) => {
        const button = e.target.closest("[data-action]");
        if (!button) return;
        interactBoard();
        button.blur();
        if (button.dataset.action === "board-close") closeBoard();
        else if (button.dataset.action === "board-prev") pageBoard(-1);
        else if (button.dataset.action === "board-next") pageBoard(1);
        else if (button.dataset.action === "board-filter") showFilters(el.boardFilterMenu.hidden);
        else if (button.dataset.action === "board-filter-done") showFilters(false);
        else if (button.dataset.action === "board-pause" && (board?.floating || board?.carousel)) {
          board.setPaused(!board.paused);
          paintBoardPause();
          scheduleBoardSave();
        }
      });
      const controller = {
        open: openBoard, close: closeBoard, update: updateBoard,
        setHidden(on) {
          if (el.board.hidden === on) return;
          finishBoardPointer();
          if (on && el.board.contains(document.activeElement)) document.activeElement.blur();
          el.board.hidden = on;
          if (!on && board) {
            // Resume this screen's rotation from now, without changing its pause setting.
            board.go(board.index);
            updateBoard();
            layoutBoard();
            placeBoard();
          }
        },
        escape() { if (!el.boardFilterMenu.hidden) showFilters(false); else closeBoard(); },
        bounds: boardBounds,
        setLayer(layer) { el.board.style.zIndex = String(layer); },
        get width() { return boardWindow.width; },
        snapshot() { return { x: boardWindow.x, y: boardWindow.y, width: boardWindow.width, screen: board.view, paused: board.paused, filters: board.filters, rollup: board.rollup, controlsHidden }; },
        dispose() {
          closeBoard();
          for (const off of boardListeners) off();
          boardListeners.length = 0;
        }
      };
      return controller;
    };
    const mainBoard = createBoardWindow(el.board);
    const openFloatingBoard = (next, saved = null) => {
      // Bound bitmap/DOM memory while still opening a fresh window on every click.
      if (floatingBoards.length === MAX_FLOATING_BOARDS) floatingBoards[0].close();
      const node = el.board.cloneNode(true);
      node.removeAttribute("open");
      const popup = createBoardWindow(node, ++boardWindowId, saved);
      el.board.parentElement.append(node);
      floatingBoards.push(popup);
      popup.open(next.createReader(saved));
      if (panelsHidden) popup.setHidden(true);
      stackBoards();
      return popup;
    };
    const restoreBoards = (next) => {
      if (boardSavingEnabled) return;
      const saved = readBoardState();
      boardSavingEnabled = true;
      boardSavingSuspended = true;
      if (saved) {
        lastBoardWidth = saved.lastWidth;
        for (const entry of saved.windows) openFloatingBoard(next, entry);
        lastBoard = floatingBoards[saved.lastUsed] || null;
      }
      boardSavingSuspended = false;
    };
    const openBoard = (next) => {
      if (!next.floating) { mainBoard.open(next); return; }
      if (panelsHidden) return;
      restoreBoards(next);
      lastBoard = openFloatingBoard(next);
      scheduleBoardSave();
    };
    const closeBoard = (preserve = false) => {
      if (preserve && !boardSavingSuspended) {
        saveBoardState();
        boardSavingSuspended = true;
      }
      mainBoard.close();
      while (floatingBoards.length) floatingBoards[floatingBoards.length - 1].close();
    };
    const updateBoard = (elapsed) => {
      mainBoard.update(elapsed);
      if (!panelsHidden) for (let i = 0; i < floatingBoards.length; i++) floatingBoards[i].update(elapsed);
    };
    // A hunt or kiosk borrows the play area without changing the visitor's saved panel choices.
    const setPanelsHidden = (on) => {
      on = !!on;
      if (on === panelsHidden) return;
      panelsHidden = on;
      sheet.setHidden(on);
      for (const popup of floatingBoards) popup.setHidden(on);
    };
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
    // Every popup closes when the visitor presses outside it, in every scene: a modal dialog on its
    // backdrop (the press lands on the dialog itself, outside its box), a card or a pause box anywhere
    // else on the page. The island's dialogs are registered here; a scene adds its own.
    const outside = [];
    const dismissOutside = (node, close) => {
      if (node) outside.push({ node, close });
    };
    on(document, "pointerdown", (e) => {
      for (const entry of outside) {
        const node = entry.node;
        if (node.tagName === "DIALOG" ? !node.open : node.hidden) continue;
        const r = node.getBoundingClientRect();
        if (node.contains(e.target) && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) continue;
        entry.close();
      }
    }, true);
    dismissOutside(el.recipe, closeRecipe);
    dismissOutside(el.board, () => mainBoard.close());
    dismissOutside($("donation-popup"), () => BL.donationPopup.closeOutside());
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
    const primaryPointerEvent = (e) => {
      if (e.button !== 0) return;
      // Pressing or releasing one mouse button while another stays held is a
      // pointermove, both natively and through the virtual carry cursor.
      const down = e.type === "pointerdown" || e.type === "pointermove" && (e.buttons & 1);
      if (down) {
        if (primaryPointer >= 0 || primaryKey || el.primary.hidden) return;
        e.preventDefault(); e.stopPropagation();
        primaryPointer = e.pointerId;
        // The locked carry cursor already captures its synthetic pointer target.
        if (e.isTrusted && !document.pointerLockElement) el.primary.setPointerCapture(e.pointerId);
        if (actionHandler) actionHandler("weapon-primary-down");
      } else if (e.pointerId === primaryPointer) {
        e.preventDefault(); e.stopPropagation();
        finishPrimary(false);
        el.primary.blur();
      }
    };
    on(el.primary, "pointerdown", primaryPointerEvent);
    on(el.primary, "pointerup", primaryPointerEvent);
    on(el.primary, "pointermove", primaryPointerEvent);
    on(el.primary, "pointercancel", (e) => { if (e.pointerId === primaryPointer) finishPrimary(true); });
    on(el.primary, "lostpointercapture", (e) => { if (e.pointerId === primaryPointer) finishPrimary(true); });
    on(el.primary, "keydown", (e) => {
      if (e.code !== "Space" && e.code !== "Enter") return;
      e.preventDefault(); e.stopPropagation();
      if (e.repeat || primaryKey || primaryPointer >= 0 || el.primary.hidden) return;
      primaryKey = e.code;
      if (actionHandler) actionHandler("weapon-primary-down");
    });
    on(el.primary, "keyup", (e) => {
      if (e.code !== primaryKey) return;
      e.preventDefault(); e.stopPropagation();
      finishPrimary(false);
    });
    on(el.primary, "blur", () => finishPrimary(true));
    on(window, "blur", () => finishPrimary(true));
    on(document, "visibilitychange", () => { if (document.hidden) finishPrimary(true); });
    on(el.primary, "contextmenu", (e) => e.preventDefault());
    const MODE_HOLD_MS = 650;
    let modePointer = -1, modeHoldTimer = 0, modeLong = false;
    const clearModeHold = () => {
      window.clearTimeout(modeHoldTimer);
      modeHoldTimer = 0;
      el.mode.dataset.holding = "false";
    };
    on(el.mode, "pointerdown", (e) => {
      if (e.button !== 0 || modePointer >= 0) return;
      e.preventDefault(); e.stopPropagation();
      modePointer = e.pointerId;
      modeLong = false;
      el.mode.dataset.holding = String(modeSelected);
      if (e.isTrusted) el.mode.setPointerCapture(e.pointerId);
      if (modeSelected) {
        modeHoldTimer = window.setTimeout(() => {
          modeHoldTimer = 0;
          modeLong = true;
          el.mode.dataset.holding = "false";
          if (actionHandler) actionHandler("mode-release");
        }, MODE_HOLD_MS);
      }
    });
    const finishModePress = (e, cancel = false) => {
      if (e.pointerId !== modePointer) return;
      e.preventDefault(); e.stopPropagation();
      modePointer = -1;
      if (el.mode.hasPointerCapture(e.pointerId)) el.mode.releasePointerCapture(e.pointerId);
      clearModeHold();
      if (!cancel && !modeLong && modeSelected && actionHandler) actionHandler("mode-toggle");
      modeLong = false;
      el.mode.blur();
    };
    on(el.mode, "pointerup", (e) => finishModePress(e));
    on(el.mode, "pointercancel", (e) => finishModePress(e, true));
    on(el.mode, "lostpointercapture", (e) => { if (e.pointerId === modePointer) finishModePress(e, true); });
    on(el.mode, "contextmenu", (e) => e.preventDefault());
    for (const b of el.actions.filter((button) => !button.dataset.action.startsWith("board-"))) on(b, "click", (e) => {
      // Native and virtual pointer clicks already completed their press/release.
      // A detail-zero click is an assistive or programmatic tap without a hold.
      if (b === el.primary && (e.detail !== 0 || primaryPointer >= 0 || primaryKey)) return;
      if (b === el.mode && e.detail !== 0) return;
      b.blur();
      if (b.dataset.action === "feed") openFeed();
      else if (b.dataset.action === "recipe-close") closeRecipe();
      else if (b.dataset.action === "recipe-copy") copyRecipe(b);
      else if (b.dataset.action === "intro-go") b.closest("[data-intro]").hidden = true;
      else if (b === el.modeDestination) cycleDestinations();
      else if (b.dataset.action === "account-login") BL.net.login();
      else if (b.dataset.action === "account-logout") BL.net.logout();
      else if (b.dataset.action === "account-rejoin") BL.net.rejoin();
      else if (b.dataset.action === "account-voice") BL.voice.toggle();
      else if (b.dataset.action === "account-voice-leave") BL.voice.stop();
      else actionHandler && actionHandler(b.dataset.action);
    });
    // A game's side panels fold away and come back from a tab on the screen's edge: a `data-fold`
    // button toggles the panel it names, and the stylesheet shows the tab while the panel is folded.
    for (const b of document.querySelectorAll("[data-fold]")) on(b, "click", () => {
      b.blur();
      const panel = document.getElementById(b.dataset.fold);
      panel.dataset.folded = String(panel.dataset.folded !== "true");
    });
    // Hover owns one bounded nameplate.
    const createTooltip = (element, textElement, healthElement, healthFillElement, showHealth = healthEnabled) => {
      let tipText = "", tipState = "", tipHealth = -1, tipHealthMax = -1, tipW = 0, tipH = 0, tipCave = null, tipName = false, tipLeft = NaN, tipTop = NaN;
      let tipVisibility = null, tipSpeechBottom = -Infinity, tipNoStatusDot = false, tipViewport = 0;
      const tipScreen = { x: 0, y: 0, depth: 0 };
      // A tooltip's box depends only on its text, its name/no-status-dot classes (the health bar rides
      // on the name class) and the viewport width (the name class's max-width), so a tooltip measured
      // before never needs the offset reads' forced layout again. A 0x0 read is a drag-hid tooltip
      // (body.orbit-dragging / mine-dragging): never cached, so the first real hover measures again.
      const tipSizeCache = new Map();
      const measureTooltip = () => {
        tipViewport = window.innerWidth;
        const key = `${tipName}\0${tipNoStatusDot}\0${tipViewport}\0${tipText}`, size = tipSizeCache.get(key);
        if (size) {
          tipW = size.w; tipH = size.h;
        } else {
          tipW = element.offsetWidth; tipH = element.offsetHeight;
          if (tipW || tipH) {
            if (tipSizeCache.size >= 64) tipSizeCache.clear();
            tipSizeCache.set(key, { w: tipW, h: tipH });
          }
        }
      };
      const placeTooltip = (left, top) => {
        left = Math.round(left); top = Math.round(top);
        if (left === tipLeft && top === tipTop) return;
        tipLeft = left; tipTop = top;
        element.style.transform = `translate(${left}px, ${top}px)`;
      };
      const tooltip = {
        show: (text, x, y, cave = null, noStatusDot = false, above = false) => {
          if (cave !== tipCave) tipSpeechBottom = -Infinity;
          tipCave = cave;
          const name = !!cave;
          const changed = text !== tipText || name !== tipName || element.classList.contains("tooltip--no-status-dot") !== noStatusDot;
          element.classList.toggle("tooltip--no-status-dot", noStatusDot);
          if (name !== tipName) {
            tipName = name;
            element.classList.toggle("tooltip--name", name);
            healthElement.hidden = !showHealth || !name;
            if (!name) {
              tipState = "";
              tipHealth = tipHealthMax = -1;
              delete element.dataset.state;
              element.removeAttribute("aria-label");
            }
          }
          element.hidden = false;
          if (changed) {
            tipText = text;
            tipState = "";
            textElement.textContent = text;
            tipNoStatusDot = noStatusDot;
            measureTooltip();
          }
          if (cave) {
            tooltip.update();
            return;
          }
          const w = tipW, h = tipH;
          const left = above ? Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2)) : Math.min(window.innerWidth - w - 8, x + 14);
          const top = above ? Math.max(8, y - h - 10) : y + 18 + h > window.innerHeight ? y - h - 10 : y + 18;
          placeTooltip(left, top);
        },
        setVisibility: (visibility) => {
          tipVisibility = visibility;
          if (!visibility) tooltip.hide();
        },
        get visibility() { return tipVisibility; },
        beginFrame: () => {
          tipSpeechBottom = -Infinity;
          tooltip.update(false);
        },
        update: (place = true) => {
          if (!tipCave) return;
          const state = statusFor(tipCave);
          let healthChanged = false;
          if (showHealth) {
            const healthMax = tipCave.health && tipCave.health.max || BL.crew.HEALTH_MAX;
            const health = tipCave.health ? Math.max(0, Math.min(healthMax, tipCave.health.value)) : healthMax;
            healthChanged = health !== tipHealth || healthMax !== tipHealthMax;
            if (healthChanged) {
              tipHealth = health; tipHealthMax = healthMax;
              healthFillElement.style.transform = `scaleX(${health / healthMax})`;
              healthElement.setAttribute("aria-valuemax", String(healthMax));
              healthElement.setAttribute("aria-valuenow", String(Math.ceil(health)));
            }
          }
          if (state !== tipState || healthChanged) {
            tipState = state;
            element.dataset.state = state;
            element.setAttribute("aria-label", showHealth
              ? `${tipText}, ${STATE_LABELS[state]}, ${Math.ceil(tipHealth)} of ${tipHealthMax} health`
              : `${tipText}, ${STATE_LABELS[state]}`);
          }
          element.hidden = !tipVisibility || !tipVisibility.anchor(tipCave, tipScreen);
          if (element.hidden) return;
          if (tipViewport !== window.innerWidth) measureTooltip();
          if (!place) return;
          // Speech can push the name down at the top edge, where the bubble has no room to rise.
          const top = Math.max(8, tipScreen.y - 2 - tipH, tipSpeechBottom + 6);
          placeTooltip(Math.max(8, Math.min(window.innerWidth - tipW - 8, tipScreen.x - tipW / 2)), top);
        },
        // Speech sits above the name, which stays anchored to the head.
        speechSpace: (cave) => cave && cave === tipCave && !element.hidden ? tipH + 6 : 0,
        belowSpeech: (cave, bottom) => {
          if (cave && cave === tipCave && bottom > tipSpeechBottom) tipSpeechBottom = bottom;
        },
        hide: () => {
          tipCave = null;
          tipSpeechBottom = -Infinity;
          element.hidden = true;
          element.classList.remove("tooltip--name");
          healthElement.hidden = true;
          delete element.dataset.state;
          element.removeAttribute("aria-label");
          tipName = false;
          tipText = tipState = "";
          tipHealth = tipHealthMax = -1;
        }
      };
      return tooltip;
    };
    const tooltip = createTooltip(el.tooltip, el.tooltipText, el.tooltipHealth, el.tooltipHealthFill);
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
    // Takes the hint down now: a scene whose state moved on (a race starting) does not leave garage advice up.
    const hideHint = () => {
      window.clearTimeout(hintTimer);
      window.clearTimeout(hintHideTimer);
      el.hint.classList.remove("show");
      hintHideTimer = window.setTimeout(() => {
        if (!el.hint.classList.contains("show")) el.hint.hidden = true;
      }, MESSAGE_FADE_MS);
    };
    const selectTab = (name) => sheet.selectTab(name);
    const foldPanels = () => sheet.fold();
    // Registered before actor controls: a popup or the sheet takes one Escape
    // before cursor capture or possession can change. Dialogs keep their own
    // nested Escape actions (for example a board's filter menu).
    on(window, "keydown", (e) => {
      if (e.key !== "Escape" || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if (e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      // Chat owns IME state and first returns focus from its editor to its tab.
      if (e.target.id === "chat-input" || e.target.id === "chat-display") return;
      if (document.querySelector("dialog:modal") || e.target.closest && e.target.closest('dialog[open], [role="dialog"][aria-modal="true"]')) return;
      let closed = false;
      if (!panelsHidden && floatingBoards.length) {
        floatingBoards[floatingBoards.length - 1].escape();
        closed = true;
      } else {
        for (let i = outside.length - 1; i >= 0; i--) {
          const entry = outside[i], node = entry.node;
          if (node.tagName === "DIALOG" ? !node.open : node.hidden || !node.getClientRects().length) continue;
          entry.close();
          closed = true;
          break;
        }
      }
      if (!closed) closed = sheet.escape();
      if (closed) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    let presetHandler = null;
    for (const b of el.presets) if (!b.closest(".hub-presets")) b.title = "Camera viewpoint · releases character control";
    for (const b of el.presets) on(b, "click", () => {
      b.blur();
      presetHandler && presetHandler(b.dataset.preset);
    });
    const onPreset = (fn) => {
      presetHandler = fn;
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
      sheet.setLootCount(entries.length);
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
            chip.title = `Take ${item.name} off ${BL.characters.displayOf(w.name)}`;
            chip.textContent = BL.characters.displayOf(w.name);
            chip.addEventListener("click", () => unassignHandler && unassignHandler(w.name), { signal });
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
          opt.textContent = wearing ? `${contributor.display} · ${wearing}` : `${contributor.display} · no swag`;
          select.append(opt);
        }
        select.addEventListener("change", () => {
          const target = select.value;
          select.value = "";
          select.blur();
          if (target && free.length) assignHandler && assignHandler(free[0].id, target);
        }, { signal });
        li.append(select);
        el.inventory.append(li);
      }
    };
    // End this visit; the attached sheet rows belong to the page.
    const dispose = () => {
      sheet.dispose();
      finishPrimary(true);
      window.clearTimeout(toastTimer);
      window.clearTimeout(toastHideTimer);
      window.clearTimeout(hintTimer);
      window.clearTimeout(hintHideTimer);
      window.clearTimeout(copyTimer);
      for (const off of listeners) off();
      listeners.length = 0;
      if (lifetime) lifetime.abort();
      if (liveRows === rosterRows) liveRows = liveOnline = null;
      if (liveDonors === refreshDonors) liveDonors = null;
      // Page-owned roster and donation rows remain attached; the next visit reconciles their contents.
      el.inventory.replaceChildren();
      el.toast.classList.remove("show");
      el.toast.hidden = true;
      el.hint.classList.remove("show");
      el.hint.hidden = true;
      tooltip.hide();
      clearModeHold();
      modePointer = -1;
      retake.actor = null; retake.gorilla = false;
      retakePortraitActor = retakeGeometry = retakePortraitGeometry = null;
      retakeHealth = -1; retakeHealthMax = 0;
      el.ownOogaFace.width = ICON_PX;
      setGorilla(null);
      setMode(null, false, "detached", false);
      setPrimary(false, false, null);
      primaryGeometry = null;
      el.primaryIcon.width = ICON_PX;
      setWeapon(false, false, 0);
      setMagazine(0, 0, 0, false);
      setJetpack(false, false, 0);
      closeRecipe();
      closeBoard(true);
      destinationNames = [];
      destinationIndex = -1;
      mainBoard.dispose();
      el.board.classList.remove("board-floating");
      el.board.removeAttribute("style");
    };
    return {
      // Engines keep this facade while a retained scene takes a fresh visit signal and sheet state.
      renew(signal) {
        const next = create({ roster, catalog, tierColors, renderIcon, lootEnabled, healthEnabled, signal });
        next.tooltip.setVisibility(this.tooltip.visibility);
        next.onAction(actionHandler); next.onPreset(presetHandler); next.onAssign(assignHandler); next.onUnassign(unassignHandler);
        Object.defineProperties(this, Object.getOwnPropertyDescriptors(next));
        return this;
      },
      el, openFeed, openRecipe, closeRecipe, dismissOutside, openBoard, closeBoard, updateBoard, restoreBoards, setPanelsHidden, foldPanels, setRosterRow, setStats, setAct, setMode, setDestinations, setOwnOoga, get retakeActor() { return retake.actor ? retake : null; }, setGorilla, setGorillaSmashPower, setDetachedView, fadeDetachedName, setAreaLabel, setPrimary, setWeapon, setMagazine, setJetpack, setSubtitle, onAction, toast, tooltip, hint, hideHint, letterSign, selectTab, onPreset, setPileValueVisible, onAssign, onUnassign, renderInventory, dispose };
  };
  // The account line in the sheet's foot is page-level: shown only when a backend answered, and
  // the director hands every change of `BL.net.state` here, whichever scene is active.
  const ROOM_WORDS = { replaced: "open in another tab", full: "island full" };
  // Net and voice emits re-run this several times a second with the same outcome; last-written
  // records keep an unchanged textContent from re-invalidating the line.
  let accountBackend = null, accountMe = null, accountName = null, accountWords = null, accountWordsHidden = null;
  let accountLive = null, accountRejoinHidden = null, accountVoiceHidden = null, accountVoiceWords = null, accountVoicePressed = null, accountLeaveHidden = null;
  const showAccount = ({ backend, me, room, online }) => {
    const hasMe = !!me;
    if (!!backend !== accountBackend) { accountBackend = !!backend; $("account").hidden = !backend; }
    const name = me ? me.display : "";
    if (name !== accountName) { accountName = name; $("account-name").textContent = name; }
    if (hasMe !== accountMe) {
      accountMe = hasMe;
      $("account-name").hidden = !me;
      $("account-login").hidden = !!me;
      $("account-logout").hidden = !me;
    }
    // The foot's green dot shows only while the room is live.
    const live = String(!!me && room === "live");
    if (live !== accountLive) { accountLive = live; $("account").dataset.live = live; }
    const words = room === "live" ? `${online} online` : ROOM_WORDS[room] || "";
    if (words !== accountWords) { accountWords = words; $("account-room").textContent = words; }
    const wordsHidden = !me || !words;
    if (wordsHidden !== accountWordsHidden) { accountWordsHidden = wordsHidden; $("account-room").hidden = wordsHidden; }
    const rejoinHidden = !me || !ROOM_WORDS[room];
    if (rejoinHidden !== accountRejoinHidden) { accountRejoinHidden = rejoinHidden; $("account-rejoin").hidden = rejoinHidden; }
    // Voice: join, then mute and unmute beside Leave voice, which hangs up and releases the microphone without
    // signing out; a failure says why on the button until the next try. Leave waits out a join in progress.
    const voice = BL.voice.stats, voiceButton = $("account-voice");
    const voiceHidden = room !== "live";
    if (voiceHidden !== accountVoiceHidden) { accountVoiceHidden = voiceHidden; voiceButton.hidden = voiceHidden; }
    const voiceWords = voice.joining ? "Joining voice" : voice.error && !voice.enabled ? `Voice: ${voice.error}` : !voice.enabled ? "Join voice" : voice.muted ? "Unmute" : "Mute";
    if (voiceWords !== accountVoiceWords) { accountVoiceWords = voiceWords; voiceButton.textContent = voiceWords; }
    const pressed = String(voice.enabled && !voice.muted);
    if (pressed !== accountVoicePressed) { accountVoicePressed = pressed; voiceButton.setAttribute("aria-pressed", pressed); }
    const leaveHidden = voiceHidden || !voice.enabled;
    if (leaveHidden !== accountLeaveHidden) { accountLeaveHidden = leaveHidden; $("account-voice-leave").hidden = leaveHidden; }
  };
  // The microphone's note (#181), page-level as the account line is: muted in voice, it stays until unmuted;
  // alone in voice (nobody here to hear, so the microphone is held off), it says so until someone comes;
  // unmuting, or someone coming, says "Mic on" for MIC_ON_MS, then it goes. A mute outranks alone.
  // `keyed` is whether M unmutes in the active scene.
  const MIC_ON_MS = 1500, MIC_COARSE = window.matchMedia("(pointer: coarse)").matches;
  let micShown = "", micTimer = 0;
  const showMic = (voice, keyed) => {
    const muted = voice.muted && (voice.enabled || voice.joining), alone = !muted && voice.enabled && voice.alone;
    const shown = muted ? keyed && !MIC_COARSE ? "Mic muted \u00b7 M to unmute" : "Mic muted \u00b7 Unmute in the panel" : alone ? "Alone \u00b7 mic off" : voice.enabled ? "Mic on" : "";
    if (shown === micShown) return;
    const note = $("mic-note"), was = micShown;
    micShown = shown;
    window.clearTimeout(micTimer);
    micTimer = 0;
    note.textContent = shown;
    note.dataset.muted = String(muted);
    if (muted || alone) note.hidden = false;
    else if (shown && was && !note.hidden) micTimer = window.setTimeout(() => { note.hidden = true; }, MIC_ON_MS);
    else note.hidden = true;
  };
  // The roster's marks are page-level too: whichever scene's roster is up, each signed-in player's row
  // (their own Ooga, else the one they drive) shows the host dot and their voice. The director hands every
  // room and voice change here; only marks that changed are touched, and rows never move for them.
  let liveRows = null, liveOnline = null, liveSignedIn = false;
  const VOICE_WORDS = { on: "In voice", speaking: "Speaking", muted: "Muted their microphone" };
  const voiceRowOf = (login, body) => {
    const character = BL.net.characterOf(login);
    return character && liveRows.get(character.handle) || body && liveRows.get(BL.net.bodyName(body)) || null;
  };
  const paintMarks = (row) => {
    const blocked = !!row.nextLogin && BL.voice.mutedLocally(row.nextLogin);
    if (row.look !== row.nextLook || row.login !== row.nextLogin || row.blocked !== blocked || row.self !== row.nextSelf) {
      row.look = row.nextLook;
      row.login = row.nextLogin;
      row.blocked = blocked;
      row.self = row.nextSelf;
      const button = row.voice;
      button.hidden = !row.look;
      button.dataset.voice = row.look;
      button.dataset.login = row.login;
      button.dataset.self = String(row.self);
      button.disabled = !row.login && !row.self;
      button.setAttribute("aria-pressed", String(blocked));
      const words = !row.look ? "" : row.self ? row.look === "muted" ? "Your microphone is muted: click to unmute" : "Your microphone: click to mute"
        : `${VOICE_WORDS[row.look]}${blocked ? ". Muted for you: click to unmute" : row.login ? ". Click to mute for you" : ""}`;
      button.title = words;
      button.setAttribute("aria-label", words);
    }
    if (row.hostOn !== row.nextHost) {
      row.hostOn = row.nextHost;
      row.host.hidden = !row.hostOn;
    }
  };
  // A signed-in player is online on their own Ooga's row and on the row of the actor's Ooga.
  const markOnline = (login, body) => {
    const character = BL.net.characterOf(login), own = character && liveRows.get(character.handle), driven = body && liveRows.get(BL.net.bodyName(body));
    if (own) own.nextOnline = true;
    if (driven) driven.nextOnline = true;
  };
  const showVoices = () => {
    if (!liveRows) return;
    for (const row of liveRows.values()) {
      row.nextLook = row.nextLogin = "";
      row.nextHost = row.nextOnline = row.nextSelf = false;
    }
    const net = BL.net.state, voice = BL.voice.stats;
    const signedIn = !!net.me, accountChanged = signedIn !== liveSignedIn;
    liveSignedIn = signedIn;
    if (net.room === "live" && net.me) {
      markOnline(net.me.login, net.body);
      for (const rec of BL.net.remotes.values()) markOnline(rec.login, rec.body);
      const self = voiceRowOf(net.me.login, net.body);
      if (self) {
        if (voice.enabled) {
          self.nextLook = voice.muted ? "muted" : voice.speaking ? "speaking" : "on";
          self.nextSelf = true;
        }
        if (net.hostId === net.selfId) self.nextHost = true;
      }
      for (const rec of BL.net.remotes.values()) {
        const row = voiceRowOf(rec.login, rec.body);
        if (!row) continue;
        if (rec.voice) {
          row.nextLook = rec.muted ? "muted" : BL.voice.speaking(rec.id) ? "speaking" : "on";
          row.nextLogin = rec.login;
        }
        if (rec.id === net.hostId) row.nextHost = true;
      }
    }
    for (const row of liveRows.values()) {
      paintMarks(row);
      if (row.netOnline === row.nextOnline && !accountChanged) continue;
      row.netOnline = row.nextOnline;
      liveOnline(row);
    }
  };
  // A game's Ooga list (`rows`, name to button, each button in its own <li>) held to one Ooga, a signed-in
  // visitor's own: its row stands alone, moved last so it keeps no divider. `null` brings every row back in order.
  const holdRow = (list, rows, name) => {
    for (const [key, b] of rows) {
      b.parentElement.hidden = !!name && key !== name;
      list.append(b.parentElement);
    }
    if (name) list.append(rows.get(name).parentElement);
  };
  // A game's exits say where they go: back to the arcade when one of its cabinets started it, else the island. A
  // header button names the place in its span (a phone shows only "Back"); a card's button says it all.
  const leaveTo = (scene, home) => {
    const place = home === "arcade" ? "arcade" : "the island";
    for (const b of document.querySelectorAll(`[data-scene="${scene}"] [data-action="leave"]`)) {
      const span = b.querySelector("span");
      if (span) span.textContent = ` to ${place}`;
      else b.textContent = `Back to ${place}`;
    }
  };
  BL.hud = { create, renderIcon, renderFaceIcon, renderBodyIcon, signLettering, showAccount, showMic, showVoices, setDonationStats, donationValueText, toast, offerReload, holdRow, leaveTo, STATE_LABELS, statusFor };
})();
