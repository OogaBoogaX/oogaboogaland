(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { iconRenderer: iconRendererMod } = BL;
  const { formatLarge } = BL.game;
  const { createNode, addChild, createCamera, boundsOf } = BL.scene;
  const STATE_LABELS = { working: "clank", chilling: "chill", sleeping: "sleep", away: "away", online: "online" };
  const ROSTER_ORDER = { working: 0, chilling: 1, sleeping: 2, away: 3 };
  const stampOf = (contributor) => contributor.lastContributionAt || contributor.lastCommitAt;
  // How Contributing Oogas are ordered: "recent", by activity and then the latest contribution, or "most", by the
  // contributions in the newest oogatron reading with the away Oogas still behind their button. This browser's choice.
  const ROSTER_SORT_KEY = "ooga-roster-sort";
  let rosterSort = "recent";
  try { if (localStorage.getItem(ROSTER_SORT_KEY) === "most") rosterSort = "most"; } catch { /* Storage may be unavailable. */ }
  const rosterRank = (state) => rosterSort === "recent" || state === "away" ? ROSTER_ORDER[state] : 0;
  const rosterKey = (contributor) => rosterSort === "most" ? contributionsOf(contributor) : stampOf(contributor);
  // Local control is online only while signed in; remote presence remains independent. An NPC ghost track
  // (npc-ghosts.js) shows its own activity (a gorilla its Ooga's), never online: the player driving that character
  // is a separate body, which carries the online dot itself.
  const statusFor = (cave) => {
    const actor = cave.tooltipOwner || cave;
    const online = !cave.ghostTrack && (cave.remoteControlled || actor.remoteControlled
      || !!BL.net.state.me && (cave.controlled || actor.humanControlled));
    return online ? "online" : actor.state === "away" ? "chilling" : actor.state;
  };
  const $ = (id) => document.getElementById(id);
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
      const sx = 3 / glyph[0].length, pixel = 0.82 * sx;
      for (let row = 0; row < glyph.length; row++) {
        for (let col = 0; col < glyph[row].length; col++) {
          if (glyph[row][col] === "1") d += `M${cursor + col * sx} ${row}h${pixel}v.82h-${pixel}z`;
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
  // The Bananas panel's banana (its glyph is in the panel's markup) before each amount its two lists show: every row
  // clones it, and the stylesheet hides it while the lists count sats.
  const amountBanana = document.createElementNS(SIGN_NS, "svg");
  amountBanana.setAttribute("viewBox", "0 0 9 9");
  amountBanana.setAttribute("shape-rendering", "crispEdges");
  amountBanana.setAttribute("aria-hidden", "true");
  amountBanana.setAttribute("class", "banana-amount-icon");
  {
    const use = document.createElementNS(SIGN_NS, "use");
    use.setAttribute("href", "#banana-panel-glyph");
    amountBanana.append(use);
  }
  // The recent list's orange check: a seal whose rim rises and falls in eight rounded ridges, a ridge at the top,
  // with the tick over it. Every row clones it.
  const verifiedSeal = document.createElementNS(SIGN_NS, "svg");
  verifiedSeal.setAttribute("viewBox", "0 0 24 24");
  verifiedSeal.setAttribute("aria-hidden", "true");
  {
    const RIDGES = 8, STEPS = RIDGES * 8;
    let d = "";
    for (let i = 0; i < STEPS; i++) {
      const a = i / STEPS * Math.PI * 2, r = 11 + 0.9 * Math.cos(RIDGES * a);
      d += `${i ? "L" : "M"}${(12 + r * Math.sin(a)).toFixed(2)} ${(12 - r * Math.cos(a)).toFixed(2)}`;
    }
    const seal = document.createElementNS(SIGN_NS, "path"), tick = document.createElementNS(SIGN_NS, "path");
    seal.setAttribute("class", "banana-verified-seal");
    seal.setAttribute("d", `${d}Z`);
    tick.setAttribute("class", "banana-verified-tick");
    tick.setAttribute("d", "M7.6 12.4L10.9 17.1L16.9 8.3");
    verifiedSeal.append(seal, tick);
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
  const copyPortraitNode = (source, portraitRoot, portraitGeometry, excluded = null) => {
    if (source.portraitHidden) return null;
    const copy = createNode({ geometry: source === portraitRoot ? portraitGeometry : source.geometry });
    Object.assign(copy.position, source.position);
    Object.assign(copy.rotation, source.rotation);
    Object.assign(copy.scale, source.scale);
    copy.visible = source.visible;
    for (const child of source.children) if (child.visible && !child.portraitHidden && !excluded?.has(child)) addChild(copy, copyPortraitNode(child, portraitRoot, portraitGeometry, excluded));
    return copy;
  };
  const renderFaceIcon = (canvas, cave, gorilla = null, px = ICON_PX, unlit = false) => {
    const renderer = iconRendererMod.createRenderer(canvas, { width: px, height: px, transparent: true, unlit });
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
  // and turned to face the camera, `w` by `h` pixels. A podium's portraits (HALLOWEEN: the arcade's ghost hunt's winners).
  const renderBodyIcon = (canvas, cave, w, h, weapons = true) => {
    const renderer = iconRendererMod.createRenderer(canvas, { width: w, height: h, transparent: true });
    const excluded = weapons ? null : new Set([cave.parts.club, cave.parts.gun]);
    const root = createNode(), body = copyPortraitNode(cave.root, null, null, excluded), tall = cave.bodyHeight;
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
  const create = ({ roster, healthEnabled = false, signal = null, escapeHeld = null }) => {
    const lifetime = signal ? null : new AbortController();
    signal = signal || lifetime.signal;
    const el = {
      roster: $("roster"), rosterCount: $("roster-count"), rosterSort: $("roster-sort"),
      statDonations: $("stat-donations"),
      statSats: $("stat-sats"),
      bananaTotal: $("banana-total"), bananaSource: $("banana-source"),
      bananaLeaders: $("banana-leaders"), bananaEmpty: $("banana-empty"),
      bananaRecent: $("banana-recent-list"), bananaRecentEmpty: $("banana-recent-empty"),
      bananaRecentBar: $("banana-recent-bar"), bananaRecentBarLabel: $("banana-recent-bar-label"),
      donationMessageLabel: $("donation-message-label"),
      bananaBoardUnit: $("banana-board-unit"), bananaBoardNote: $("banana-board-note"),
      bananaPanel: $("bananas-panel"), bananaBtcRate: $("banana-btc-rate"),
      bananaBtcSats: $("banana-btc-sats"), bananaBtcPrice: $("banana-btc-price"), bananaExchange: $("banana-exchange"),
      donorUnits: [...document.querySelectorAll("[data-donor-unit]")],
      subtitle: $("subtitle"),
      topbar: document.querySelector(".topbar"), brand: document.querySelector(".brand"),
      clock: $("world-clock"), block: $("world-block"),
      equipment: $("equipment-hud"), equipmentRow: document.querySelector(".weapon-equipment-row"), leave: $("leave-hud"),
      micNote: $("mic-note"),
      actions: [...document.querySelectorAll("[data-action]")],
      board: $("board-modal"), boardTitle: $("board-title"), boardScreen: $("board-screen"), boardCaption: $("board-caption"), boardNote: $("board-note"),
      boardDots: $("board-dots"), boardPrev: $("board-prev"), boardNext: $("board-next"), boardHelp: $("board-help"),
      boardHead: $("board-head"), boardPause: $("board-pause"), boardResize: $("board-resize"),
      act: $("act"),
      mode: $("mode-hud"),
      modeDestination: $("destination-hud"),
      modeDestinationLabel: $("destination-hud-label"),
      modeFree: $("freeroam-icon"),
      modeFace: $("mode-face-icon"),
      modeHealth: $("mode-health"),
      modeHealthFill: $("mode-health-fill"),
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
    const sheet = BL.sheet.create({ signal });
    sheet.setPlaying(document.body.classList.contains("arcade-game"));
    el.primary.hidden = true;
    el.gorillaSmash.hidden = true;
    el.mode.hidden = true;
    el.mode.dataset.health = String(healthEnabled);
    el.modeHealth.hidden = true;
    el.weapon.hidden = true;
    el.magazine.hidden = true;
    el.jetpack.hidden = true;
    const listeners = [];
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, typeof opts === "boolean" ? { capture: opts, signal } : { ...opts, signal });
      listeners.push(() => target.removeEventListener(type, fn, opts));
    };
    // Fit each environment's controls between the title and clock when their actual visible widths allow it.
    // Observers only schedule a pass after layout or equipment changes; ammo and animation never poll it.
    const bannerScene = document.body.dataset.activeScene;
    // The way out, left of the Ooga's face: where this place's banner has a Leave button, the wordless one stands in for
    // it, named by it (`leaveTo` renames both), and the banner's own is kept out of sight (style.css).
    {
      const text = el.topbar.querySelector(`[data-scene="${bannerScene}"] [data-action="leave"], [data-scene="${bannerScene}"][data-action="leave"]`);
      el.leave.hidden = !text;
      if (text) { nameLeave(text.textContent); document.body.dataset.leaveHud = "true"; }
      listeners.push(() => { el.leave.hidden = true; delete document.body.dataset.leaveHud; });
    }
    {
      const presets = el.topbar.querySelector(`.presets[data-scene="${bannerScene}"]`);
      let bannerFrame = 0;
      const bannerStyle = (node, property, value) => {
        if (node.style.getPropertyValue(property) !== value) node.style.setProperty(property, value);
      };
      const fitBanner = () => {
        bannerFrame = 0;
        if (document.body.dataset.activeScene !== bannerScene) return;
        const brand = el.brand.getBoundingClientRect(), clock = el.clock.getBoundingClientRect(), block = el.block.getBoundingClientRect();
        const topbar = getComputedStyle(el.topbar), row = getComputedStyle(el.equipmentRow);
        const fontSize = parseFloat(getComputedStyle(el.clock).fontSize) || 22;
        const scale = Math.max(0.7, Math.min(0.85, 0.7 + (fontSize - 13) / 60));
        const leftEdge = brand.right + 12, available = Math.min(clock.left, block.width ? block.left : clock.left) - 12 - leftEdge;
        let presetWidth = 0, presetCount = 0;
        if (presets && !presets.hidden && getComputedStyle(presets).display !== "none") {
          for (const button of presets.children) {
            if (button.hidden || getComputedStyle(button).display === "none") continue;
            presetWidth += button.offsetWidth; presetCount++;
          }
          presetWidth += Math.max(0, presetCount - 1) * (parseFloat(getComputedStyle(presets).columnGap) || 0);
        }
        let compactWidth = 0, count = 0, expanded = false;
        for (const button of el.equipmentRow.children) {
          if (button.hidden || getComputedStyle(button).display === "none") continue;
          compactWidth += button === el.weapon ? 78 : button.offsetWidth;
          if (button === el.weapon) expanded = button.dataset.equipped === "true" && button.dataset.skin !== "ghost";
          count++;
        }
        compactWidth += Math.max(0, count - 1) * (parseFloat(row.columnGap) || 0);
        const presetSpace = presetWidth + (presetCount && count ? 12 : 0);
        const banner = (compactWidth + (expanded ? 140 : 0)) * scale + presetSpace <= available ? "full"
          : compactWidth * scale + presetSpace <= available ? "compact" : "below";
        const paddingLeft = parseFloat(topbar.paddingLeft) || 0, paddingRight = parseFloat(topbar.paddingRight) || 0;
        const topEdge = Math.min(brand.top, clock.top, block.top), bottomEdge = Math.max(brand.bottom, clock.bottom, block.bottom);
        // Below the title (a phone), the row sits close under the banner's text and near the screen's left edge, still
        // inside a notch's safe area.
        const belowLeft = Math.max(4, paddingLeft - 4);
        const top = banner === "below" ? bottomEdge + 4 : (topEdge + bottomEdge - 52 * scale) / 2;
        // The controls and sound buttons at the top right. With the row below the title (a phone) they take its buttons'
        // size and margins: as tall as they are, 4px from the top and right edges and from each other, inside any safe
        // area. Otherwise they stand in line with the row: as tall as the banner's text (28 to 36px), their tops level with
        // the row's buttons' tops, 8px from the right edge (past any safe area) and from each other.
        const below = banner === "below", paddingTop = parseFloat(topbar.paddingTop) || 0;
        const side = below ? Math.round(52 * scale) : Math.round(Math.max(28, Math.min(36, bottomEdge - topEdge)));
        bannerStyle(el.topbar, "--hub-banner-button", `${side}px`);
        bannerStyle(el.topbar, "--hub-banner-button-top", `${below ? Math.max(4, paddingTop - 6) : Math.round(top * 10) / 10}px`);
        bannerStyle(el.topbar, "--hub-banner-button-right", below ? `${Math.max(4, paddingRight - 4)}px` : "calc(var(--safe-right) + 8px)");
        bannerStyle(el.topbar, "--hub-banner-button-gap", `${below ? 4 : 8}px`);
        if (el.equipment.dataset.banner !== banner) el.equipment.dataset.banner = banner;
        bannerStyle(el.equipment, "--hub-equipment-scale", String(scale));
        bannerStyle(el.equipment, "--hub-equipment-left", `${banner === "below" ? belowLeft : leftEdge}px`);
        bannerStyle(el.equipment, "--hub-equipment-top", `${top}px`);
        bannerStyle(el.equipment, "--hub-equipment-width", `${Math.max(0, window.innerWidth - paddingLeft - paddingRight) / scale}px`);
        const equipmentHeight = count ? el.equipmentRow.offsetHeight * scale : 0;
        let controlsBottom = top + equipmentHeight;
        if (presets && presetCount) {
          const presetTop = banner === "below" ? top + equipmentHeight + (count ? 8 : 0) : (topEdge + bottomEdge - 28) / 2;
          const equipmentWidth = (compactWidth + (banner === "full" && expanded ? 140 : 0)) * scale;
          const presetLeft = banner === "below" ? belowLeft : leftEdge + equipmentWidth + (count ? 12 : 0);
          bannerStyle(presets, "--banner-presets-top", `${presetTop}px`);
          bannerStyle(presets, "--banner-presets-left", `${presetLeft}px`);
          bannerStyle(presets, "--banner-presets-width", `${Math.max(0, window.innerWidth - presetLeft - paddingRight)}px`);
          controlsBottom = Math.max(controlsBottom, presetTop + presets.offsetHeight);
        }
        const bottom = `${Math.max(bottomEdge, controlsBottom) + 8}px`;
        bannerStyle(el.messageStack, "--hub-equipment-bottom", bottom);
        bannerStyle(el.micNote, "--hub-equipment-bottom", bottom);
        // Where the banner's controls end, for a scene's own strip under them (Ooga Mine's).
        bannerStyle(document.body, "--banner-controls-bottom", bottom);
      };
      const scheduleBanner = () => {
        if (!bannerFrame) bannerFrame = window.requestAnimationFrame(fitBanner);
      };
      const bannerResize = new ResizeObserver(scheduleBanner), bannerEquipment = new MutationObserver(scheduleBanner);
      // Cabinet zooms resize the stage without changing the viewport or the title's own size.
      for (const node of [el.topbar, el.brand, el.clock, el.block, el.equipmentRow]) bannerResize.observe(node);
      if (presets) {
        bannerResize.observe(presets);
        bannerEquipment.observe(presets, { attributes: true, subtree: true, childList: true, characterData: true, attributeFilter: ["hidden", "disabled"] });
      }
      for (const button of el.equipmentRow.children) bannerEquipment.observe(button, {
        attributes: true, attributeFilter: button === el.weapon ? ["hidden", "data-equipped", "data-skin"] : ["hidden"]
      });
      on(window, "resize", scheduleBanner);
      listeners.push(() => {
        bannerResize.disconnect();
        bannerEquipment.disconnect();
        window.cancelAnimationFrame(bannerFrame);
        if (presets) for (const property of ["--banner-presets-top", "--banner-presets-left", "--banner-presets-width"]) presets.style.removeProperty(property);
        delete el.equipment.dataset.banner;
        for (const property of ["--hub-equipment-scale", "--hub-equipment-left", "--hub-equipment-top", "--hub-equipment-width"]) el.equipment.style.removeProperty(property);
        el.messageStack.style.removeProperty("--hub-equipment-bottom");
        el.micNote.style.removeProperty("--hub-equipment-bottom");
        document.body.style.removeProperty("--banner-controls-bottom");
        for (const property of ["--hub-banner-button", "--hub-banner-button-top", "--hub-banner-button-right", "--hub-banner-button-gap"]) el.topbar.style.removeProperty(property);
      });
      scheduleBanner();
    }
    let hintTimer = 0, hintHideTimer = 0, copyTimer = 0;
    const rosterRows = new Map();
    let showAway = false, awayCount = 0, awayShownCount = -1, awayShownShow = null;
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
    el.rosterCount.textContent = `${roster.length} Oogas`;
    const updateAwayButton = () => {
      if (awayCount === awayShownCount && showAway === awayShownShow) return;
      awayShownCount = awayCount;
      awayShownShow = showAway;
      awayRow.hidden = awayCount === 0;
      awayButton.textContent = `${showAway ? "Hide" : "Show"} away (${awayCount})`;
    };
    const orderedRoster = [...roster].sort((a, b) =>
      rosterRank(BL.contributors.contributionStateFor(a)) - rosterRank(BL.contributors.contributionStateFor(b)) ||
      rosterKey(b) - rosterKey(a) || stampOf(b) - stampOf(a));
    for (let rosterIndex = 0; rosterIndex < orderedRoster.length; rosterIndex++) {
      const contributor = orderedRoster[rosterIndex];
      let nodes = rosterNodes.get(contributor.name);
      if (!nodes) {
        const li = document.createElement("li"), dots = document.createElement("span"), presence = document.createElement("span"), name = document.createElement("button");
        li.dataset.name = contributor.name;
        // The online dot, with the host's outlined dot centred behind it.
        dots.className = "roster-dots";
        presence.className = "roster-presence"; presence.setAttribute("role", "img");
        const label = document.createElement("span"), host = document.createElement("span");
        host.className = "roster-host";
        host.setAttribute("role", "img"); host.setAttribute("aria-label", "Host: runs the Oogas for everyone");
        host.title = "Host: runs the Oogas for everyone";
        dots.append(presence, host);
        // The name, on one line and cut short with an ellipsis, opens the row onto the contributor's stats.
        name.className = "roster-name"; name.type = "button"; label.className = "roster-label";
        name.append(label);
        const marks = document.createElement("span"), voice = document.createElement("button");
        marks.className = "roster-marks";
        voice.className = "roster-voice"; voice.type = "button"; voice.append(voiceIcon.cloneNode(true));
        marks.append(voice);
        const age = document.createElement("span"), state = document.createElement("span");
        age.className = "roster-age"; age.append(""); state.className = "roster-state"; state.append("");
        li.append(dots, name, marks, age, state);
        nodes = { li, presence, name, label, host, voice, age, state, stats: null };
        rosterNodes.set(contributor.name, nodes);
      }
      const { li, presence, name, label, host, voice, age, state } = nodes;
      if (label.textContent !== contributor.display) { label.textContent = contributor.display; label.title = contributor.display; }
      presence.dataset.online = "false"; presence.setAttribute("aria-label", "Offline"); presence.title = "Offline";
      host.hidden = voice.hidden = true; voice.disabled = false;
      if (nodes.stats) nodes.stats.box.hidden = true;
      name.setAttribute("aria-expanded", "false");
      voice.dataset.voice = voice.dataset.login = ""; voice.dataset.self = "false";
      const activity = BL.contributors.contributionStateFor(contributor), ageText = BL.contributors.contributionAgeLabel(contributor);
      if (age.firstChild.data !== ageText) age.firstChild.data = ageText;
      state.dataset.state = activity;
      if (state.firstChild.data !== STATE_LABELS[activity]) state.firstChild.data = STATE_LABELS[activity];
      li.hidden = activity === "away";
      if (activity === "away") { if (!awayRow.parentElement) el.roster.append(awayRow); awayCount++; }
      el.roster.append(li);
      rosterRows.set(contributor.name, { li, presence, state, age, contributor, rosterIndex, online: false, sceneOnline: false, remoteOnline: false, netOnline: false, nextOnline: false, placedStamp: stampOf(contributor), host, voice, look: "", login: "", hostOn: false, blocked: false, self: false, nextLook: "", nextLogin: "", nextHost: false, nextSelf: false, name, nodes, open: false });
    }
    if (!awayRow.parentElement) el.roster.append(awayRow);
    updateAwayButton();
    on(el.roster, "click", (e) => {
      const who = e.target.closest(".roster-name");
      if (who) {
        who.blur();
        const row = rosterRows.get(who.parentElement.dataset.name);
        if (row) openStats(row, !row.open);
        return;
      }
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
    // The Sorted by choice orders the roster; online presence never changes a row's rank.
    const rankOf = (row) => rosterRank(row.state.dataset.state);
    const countAway = () => {
      awayCount = 0;
      for (const row of rosterRows.values()) if (!row.online && row.state.dataset.state === "away") awayCount++;
      updateAwayButton();
    };
    const placeRosterRow = (row) => {
      const rank = rankOf(row), stamp = rosterKey(row.contributor);
      let before = rank === ROSTER_ORDER.away ? null : awayRow;
      for (const sibling of el.roster.children) {
        if (sibling === row.li || sibling === awayRow) continue;
        const other = rosterRows.get(sibling.dataset.name);
        const otherRank = rankOf(other), otherStamp = rosterKey(other.contributor);
        if (otherRank > rank) { before = otherRank === ROSTER_ORDER.away ? awayRow : sibling; break; }
        if (otherRank === rank && (otherStamp < stamp || otherStamp === stamp && other.rosterIndex > row.rosterIndex)) { before = sibling; break; }
      }
      if (before) {
        if (row.li.nextElementSibling !== before) el.roster.insertBefore(row.li, before);
      } else if (el.roster.lastElementChild !== row.li) el.roster.append(row.li);
    };
    // Every row in the chosen order, the away rows behind their button, moving only what is out of place.
    const sortRoster = () => {
      const rows = [...rosterRows.values()].sort((a, b) => rankOf(a) - rankOf(b) || rosterKey(b.contributor) - rosterKey(a.contributor) || stampOf(b.contributor) - stampOf(a.contributor));
      let at = el.roster.firstElementChild, awayPlaced = false;
      const place = (li) => { if (li === at) at = at.nextElementSibling; else el.roster.insertBefore(li, at); };
      rows.forEach((row, index) => {
        row.rosterIndex = index;
        if (!awayPlaced && rankOf(row) === ROSTER_ORDER.away) { place(awayRow); awayPlaced = true; }
        place(row.li);
      });
      if (!awayPlaced) place(awayRow);
    };
    el.rosterSort.value = rosterSort;
    on(el.rosterSort, "change", () => {
      rosterSort = el.rosterSort.value === "most" ? "most" : "recent";
      try { localStorage.setItem(ROSTER_SORT_KEY, rosterSort); } catch { /* Storage may be unavailable. */ }
      el.rosterSort.blur();
      sortRoster();
    });
    // A scene's local driver needs a signed-in account; remote drivers and the room's
    // signed-in identities remain online independently. A change repaints the dot without moving the row.
    const showOnline = (row) => {
      const online = row.sceneOnline && !!BL.net.state.me || row.remoteOnline || row.netOnline;
      if (row.online === online) return;
      row.online = online;
      row.presence.dataset.online = online ? "true" : "false";
      row.presence.title = online ? "Online" : "Offline";
      row.presence.setAttribute("aria-label", row.presence.title);
      row.li.hidden = row.state.dataset.state === "away" && !showAway && !online;
      countAway();
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
      showOnline(row);
      const stamp = stampOf(row.contributor);
      if (row.placedStamp !== stamp) {
        row.placedStamp = stamp;
        moved = true;
      }
      if (moved) placeRosterRow(row);
    };
    // Contribution data and its age stay live even in rooms with only one local Ooga.
    // Preserve the scene's presence flags when refreshing activity across the whole panel.
    const refreshRosterActivity = () => {
      if (document.hidden) return;
      for (const row of rosterRows.values()) setRosterRow(row.contributor.name, null, null, row.sceneOnline, row.remoteOnline);
    };
    listeners.push(BL.contributors.subscribe(refreshRosterActivity));
    const rosterTimer = window.setInterval(refreshRosterActivity, 60000);
    listeners.push(() => window.clearInterval(rosterTimer));
    on(document, "visibilitychange", refreshRosterActivity);
    // The page-level pass updates presence without changing contribution order.
    liveRows = rosterRows;
    // A fresh oogatron reading refills every open stats strip.
    listeners.push(BL.oogatronLive.subscribe((event) => {
      if (event.type !== "stats") return;
      liveStats = BL.activityRepos.normalizeStats(event.stats);
      for (const row of rosterRows.values()) if (row.open) fillStats(row);
      fitSince();
      if (rosterSort === "most") sortRoster();
    }));
    liveOnline = showOnline;
    showVoices();
    // Value the donated sats at the current price; donor rankings retain their receipt prices. A bitcoin's price is
    // in bananas, since a banana is a dollar; whether that price is live or stale is said on hover alone.
    const showBananaRate = () => {
      if (document.hidden || !BL.sheet.visible(el.bananaPanel)) return;
      const rate = currentDonationRate(), total = donationValueText();
      const tone = !rate ? "wait" : rate.stale ? "stale" : rate.live ? "live" : "idle";
      const label = tone === "live" ? "Live BTCUSD price" : tone === "stale" ? "Stale BTCUSD price, the last one kept" : tone === "wait" ? "Waiting for the BTCUSD price" : "BTCUSD price";
      const price = rate ? DONOR_BANANAS.format(rate.usdPerBtc) : "—";
      const exchange = rate ? `≈ ${DONOR_BANANAS.format(1e8 / rate.usdPerBtc)} sats` : "— sats";
      if (el.bananaBtcRate.dataset.tone !== tone) el.bananaBtcRate.dataset.tone = tone;
      if (el.bananaBtcRate.title !== label) el.bananaBtcRate.title = label;
      if (el.bananaBtcPrice.textContent !== price) el.bananaBtcPrice.textContent = price;
      if (el.bananaExchange.textContent !== exchange) el.bananaExchange.textContent = exchange;
      if (el.bananaTotal.textContent !== total) el.bananaTotal.textContent = total;
      if (price.length !== fitPriceLength) fitBtcRate();
    };
    // The bitcoin line keeps to one line: "100,000,000 sats" while it fits, "100M sats" once a narrow panel or a long
    // price would wrap it, and only past that does it wrap. Fitted again when the price's length or the line's width
    // changes; digits are tabular, so the same length takes the same room.
    let fitPriceLength = -1, fitWidth = 0;
    const fitBtcRate = () => {
      const line = el.bananaBtcRate;
      fitPriceLength = el.bananaBtcPrice.textContent.length;
      if (!fitWidth) return;
      line.dataset.fit = "line";
      el.bananaBtcSats.textContent = "100,000,000";
      if (line.scrollWidth <= line.clientWidth) return;
      el.bananaBtcSats.textContent = "100M";
      if (line.scrollWidth > line.clientWidth) line.dataset.fit = "wrap";
    };
    const btcRateObserver = new ResizeObserver((entries) => {
      const width = Math.round(entries[entries.length - 1].contentRect.width);
      if (width === fitWidth) return;
      fitWidth = width;
      fitBtcRate();
    });
    btcRateObserver.observe(el.bananaBtcRate);
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
      btcRateObserver.disconnect();
      if (stopBananaRate) stopBananaRate();
    });
    watchBananaRate();
    // A fixed pool, so the DOM never grows with donations.
    const recentRows = donationRows || (donationRows = Array.from({ length: BL.donations.RECENT_MAX }, () => {
      const li = document.createElement("li"), name = document.createElement("span"), labelBox = document.createElement("span"), label = document.createTextNode("");
      const badge = document.createElement("span"), amount = document.createElement("strong"), message = document.createElement("p");
      // Every text node exists from the start, so filling a row later adds nothing to the DOM.
      const amountText = document.createTextNode(""), messageText = document.createTextNode("");
      name.className = "banana-recent-name";
      labelBox.className = "banana-recent-label";
      labelBox.append(label);
      badge.className = "banana-verified";
      badge.append(verifiedSeal.cloneNode(true));
      badge.title = "Signed in with GitHub using this donor name";
      badge.setAttribute("role", "img");
      badge.setAttribute("aria-label", "GitHub name confirmed");
      badge.hidden = true;
      amount.className = "banana-amount";
      message.className = "banana-recent-message";
      message.hidden = true;
      name.append(labelBox, badge);
      amount.append(amountBanana.cloneNode(true), amountText);
      message.append(messageText);
      li.append(name, amount, message);
      li.hidden = true;
      el.bananaRecent.append(li);
      return { li, name, labelBox, label, badge, amountText, message, messageText };
    }));
    // One row a ranked donor, made as the board first grows to it and kept for the page life: the board scrolls inside
    // its five-row window, and both boards it shows hold at most 256 (the API's and the game's demo donors).
    const leaderRows = donorRows || (donorRows = []);
    const leaderRow = (i) => {
      const li = document.createElement("li"), rank = document.createElement("span"), name = document.createElement("span"), amount = document.createElement("strong");
      const nameText = document.createTextNode(""), amountText = document.createTextNode("");
      rank.className = "banana-rank"; rank.textContent = String(i + 1).padStart(2, "0");
      name.className = "banana-donor"; name.append(nameText);
      amount.className = "banana-amount"; amount.append(amountBanana.cloneNode(true), amountText);
      li.append(rank, name, amount); li.hidden = true; el.bananaLeaders.append(li);
      return { li, name, nameText, amountText };
    };
    // The recent list's checkbox keeps it to tips at or above the message bar: on until the visitor turns it off,
    // and their choice either way remembered in this browser.
    const RECENT_BAR_KEY = "ooga-recent-bar";
    let recentBarOnly = true;
    try { recentBarOnly = localStorage.getItem(RECENT_BAR_KEY) !== "0"; } catch { /* no storage: on, as for a first visit */ }
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
      while (leaderRows.length < ranked.length) leaderRows.push(leaderRow(leaderRows.length));
      for (let i = 0; i < leaderRows.length; i++) {
        const entry = ranked[i], row = leaderRows[i];
        row.li.hidden = !entry;
        if (!entry) continue;
        const name = entry.handle ? `@${entry.handle}` : "Anonymous";
        const amount = (donorUnit === "sats" ? BANANA_COUNT : DONOR_BANANAS).format(entry[donorUnit]);
        if (row.nameText.data !== name) { row.nameText.data = name; row.name.title = name; }
        if (row.amountText.data !== amount) row.amountText.data = amount;
        row.name.dataset.anon = String(!entry.handle);
      }
      el.bananaEmpty.hidden = ranked.length > 0;
      el.bananaEmpty.textContent = missingSats ? "Sat totals are not available from the donation feed yet."
        : real && !entries ? "Loading the donor leaderboard…"
        : real ? "No donations yet. Feed the first Ooga!" : "New demo donations will appear here.";
      // The recent list: the newest first, its orange check only on the API's word that the donor's GitHub login
      // matched the name, into the fixed rows (the first `RECENT_MAX` the checkbox leaves).
      const all = real ? state.recent || [] : donationStats?.recentDonations || [];
      const recent = recentBarOnly ? all.filter((entry) => entry.sats >= bar) : all;
      el.bananaRecentBarLabel.textContent = `${BANANA_COUNT.format(bar)} sats and up only`;
      el.donationMessageLabel.textContent = `Banana message (up to 280 characters, with a tip of ${BANANA_COUNT.format(bar)} sats or more)`;
      for (let i = 0; i < recentRows.length; i++) {
        const row = recentRows[i], entry = recent[i];
        row.li.hidden = !entry;
        if (!entry) continue;
        row.label.data = entry.handle ? `@${entry.handle}` : "Anonymous";
        if (row.labelBox.title !== row.label.data) row.labelBox.title = row.label.data;
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
      el.bananaPanel.dataset.unit = donorUnit;
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
    const DETACHED_NAMES = { pile: "Pile", lab: "Lab", mirror: "Mirror", underground: "HQ", basement: "Basement", mempool: "Mempool", factory: "LN Factory", arcade: "Ooga Arcade", bca: "B.C.A.", gate: "North gate", bifrost: "₿IFRÖST", timechain: "TC Sphere", repos: "Repo Island" };
    let destinationLabels = DETACHED_NAMES;
    let destinationNames = [];
    let detachedPreset = "pile", detachedNameShown = false, detachedSelectionShown = false, areaLabel = "";
    el.modeDestination.disabled = false;
    el.modeDestination.title = "Map · choose a destination";
    el.modeDestinationLabel.textContent = "Map. Choose a destination";
    const setDestinations = (names, labels = DETACHED_NAMES) => {
      destinationLabels = labels;
      destinationNames = names.filter(name => destinationLabels[name]);
      if (!destinationLabels[detachedPreset] && destinationNames.length) detachedPreset = destinationNames[0];
      el.modeDestination.hidden = !modeVisible || !destinationNames.length;
    };
    const mapProvider = {
      names: () => destinationNames, label: name => destinationLabels[name], selected: () => detachedPreset,
      controlled: () => document.body.dataset.activeScene === "hub" && !!(modeActor || gorillaEntry),
      travels: () => document.body.dataset.activeScene === "hub" && !!gorillaEntry,
      available: () => modeVisible && destinationNames.length > 0 && !el.modeDestination.hidden,
      position: () => (gorillaEntry || modeActor)?.root.position || null,
      travel: name => actionHandler ? actionHandler("mode-preset", name) : false
    };
    BL.destinationMap.connect(mapProvider);
    let destinationAnchored = false, destinationX = 0, destinationY = 0, destinationZ = 0;
    let destinationLabelTimer = 0;
    const showDestinationLabel = text => {
      if (el.modeDestinationName.textContent !== text) el.modeDestinationName.textContent = text;
      window.clearTimeout(destinationLabelTimer);
      el.modeDestinationName.classList.toggle("show", !!text);
      destinationLabelTimer = text ? window.setTimeout(() => {
        destinationLabelTimer = 0;
        el.modeDestinationName.classList.remove("show");
      }, 3000) : 0;
    };
    const showAreaLabel = () => showDestinationLabel(areaLabel);
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
      const changed = areaLabel !== name;
      areaLabel = name;
      if (destinationAnchored && position
        && (position.x - destinationX) ** 2 + (position.y - destinationY) ** 2 + (position.z - destinationZ) ** 2 > 2.25) fadeDetachedName(true);
      if (!detachedNameShown && changed) showAreaLabel();
    };
    const setDetachedView = (name, announce = false, position = null) => {
      if (!destinationLabels[name]) return;
      detachedPreset = name;
      destinationAnchored = !!position;
      if (position) { destinationX = position.x; destinationY = position.y; destinationZ = position.z; }
      detachedSelectionShown = true;
      if (!announce) return;
      detachedNameShown = true;
      showDestinationLabel(destinationLabels[name]);
    };
    let gorillaEntry = null, gorillaView = "orbit", gorillaCombat = false, gorillaCombatEnabled = true;
    let modeName = "", modeGeometry = null, modeSelected = false, modeCombat = false, modeView = "", modeHealth = -1, modeHealthMax = 0, modeGorilla = false;
    let modeActor = null, modeCombatEnabled = true, modeVisible = true;
    const setMode = (cave, combat = false, view = cave ? "orbit" : "detached", visible = true, combatEnabled = true) => {
      const gorilla = gorillaEntry ? gorillaEntry.gorilla : null;
      modeActor = gorilla ? null : cave;
      modeVisible = visible;
      if (gorilla) { cave = gorillaEntry.owner; combat = gorillaCombat; view = gorillaView; visible = true; combatEnabled = gorillaCombatEnabled; }
      const selected = !!cave, name = selected ? cave.traits.name : "", shown = selected ? cave.traits.display : "";
      if (!visible) fadeDetachedName(true);
      const identityChanged = selected !== modeSelected || selected && name !== modeName || !!gorilla !== modeGorilla;
      const stateChanged = combat !== modeCombat || view !== modeView || combatEnabled !== modeCombatEnabled;
      const showMode = visible;
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
          ? `${shown}'s gorilla; ${view} view; ${look}. Press to switch ${change}`
          : selected
          ? `${shown}; ${view} view; ${look}. Press to switch ${change}`
          : "Choose an Ooga. Open the Oogas panel");
        el.mode.title = gorilla ? `${shown}'s gorilla · ${view} · ${look}` : selected ? `${shown} · ${view} · ${look}` : "Choose an Ooga";
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
    // The AK button's press, held from its pointer's down to its up (its handlers are with the primary's).
    let weaponPointer = -1;
    const finishWeapon = (cancel) => {
      if (weaponPointer < 0) return;
      const pointer = weaponPointer;
      weaponPointer = -1;
      if (el.weapon.hasPointerCapture(pointer)) el.weapon.releasePointerCapture(pointer);
      if (actionHandler) actionHandler(cancel ? "weapon-secondary-cancel" : "weapon-secondary-up");
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
    let weaponTotal = -1, weaponLabelAmmo = -1, weaponLabelEquipped = false, weaponName = "AK-47";
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
        el.weaponToggle.setAttribute("aria-label", weaponUnlimited ? `${weaponEquipped ? "Fire" : "Equip"} ${weaponName}; unlimited ammunition` : weaponEquipped ? `Fire ${weaponName}; ammo ${labelAmmo} of 30 rounds` : `Equip ${weaponName}; ${total} rounds total`);
      }
    };
    // HALLOWEEN: the ghost hunt's gun shows its own icon and name on the one weapon button ("" is the AK's).
    const setWeaponSkin = (skin) => {
      const name = skin === "ghost" ? "ghost blaster" : "AK-47";
      if (name === weaponName) return;
      weaponName = name;
      el.weapon.dataset.skin = skin;
      el.weaponToggle.title = weaponEquipped ? `Fire ${name}` : `Equip ${name} (2)`;
      weaponLabelAmmo = -1;
      refreshWeaponSummary();
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
      if (el.weapon.hidden) finishWeapon(true);
      if (equipped !== weaponEquipped) {
        weaponEquipped = equipped;
        el.weapon.dataset.equipped = String(equipped);
        el.weaponToggle.setAttribute("aria-pressed", String(equipped));
        el.weaponToggle.setAttribute("aria-expanded", String(equipped));
        el.weaponToggle.title = equipped ? `Fire ${weaponName}` : `Equip ${weaponName} (2)`;
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
      if (el.jetpack.hidden !== (!owned || blocked || !!gorillaEntry)) el.jetpack.hidden = !owned || blocked || !!gorillaEntry;
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
      if (entry === gorillaEntry && view === gorillaView && combat === gorillaCombat && combatEnabled === gorillaCombatEnabled) return;
      if (entry !== gorillaEntry) { finishPrimary(true); finishWeapon(true); }
      gorillaEntry = entry;
      gorillaView = view;
      gorillaCombat = combat;
      gorillaCombatEnabled = combatEnabled;
      el.gorillaSmash.hidden = !entry || !combatEnabled;
      el.primary.hidden = !primaryShown || !!entry;
      el.weapon.hidden = !weaponShown || !!entry;
      el.jetpack.hidden = !jetpackShown || jetpackBlocked || !!entry;
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
      on(el.boardScreen, "click", (e) => {
        // A board that takes picks (the Sphere's room directory) hears where on its picture the press landed, and
        // answers "close" when that is done with it.
        if (board?.pick) {
          if (board.pick(e.offsetX * board.canvas.width / el.boardScreen.clientWidth, e.offsetY * board.canvas.height / el.boardScreen.clientHeight) === "close") closeBoard();
          else updateBoard();
          return;
        }
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
        el.boardScreen.classList.toggle("board-pickable", !!board.pick && board.pickable);
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
      // A key a board takes for itself (the directory's numbers): true when it did, "close" when done with it too.
      const boardKey = (key) => {
        const took = board.key(key);
        if (took === "close") closeBoard();
        else if (took) updateBoard();
        return !!took;
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
        else if (!(board?.key && !e.repeat && boardKey(e.key))) return;
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
    // Active gameplay borrows the play area without changing the visitor's saved panel choices.
    const setPanelsHidden = (on) => {
      const arcadeGame = document.body.classList.contains("arcade-game");
      sheet.setPlaying(arcadeGame);
      on = !!on;
      sheet.setHidden(on && !arcadeGame);
      if (on === panelsHidden) return;
      panelsHidden = on;
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
    // The AK button fires while it is held: a press pulls the trigger (or, with the AK put away, takes it out) and
    // letting go releases it, so a held press is full auto. A keyboard press is still one burst, through the click.
    const weaponPointerEvent = (e) => {
      if (e.button !== 0) return;
      // As the primary's: a press or release under another held button arrives as a pointermove.
      const down = e.type === "pointerdown" || e.type === "pointermove" && (e.buttons & 1);
      if (down) {
        if (weaponPointer >= 0 || el.weapon.hidden) return;
        e.preventDefault(); e.stopPropagation();
        weaponPointer = e.pointerId;
        if (e.isTrusted && !document.pointerLockElement) el.weapon.setPointerCapture(e.pointerId);
        if (actionHandler) actionHandler("weapon-secondary-down");
      } else if (e.pointerId === weaponPointer) {
        e.preventDefault(); e.stopPropagation();
        finishWeapon(false);
        el.weapon.blur();
      }
    };
    on(el.weapon, "pointerdown", weaponPointerEvent);
    on(el.weapon, "pointerup", weaponPointerEvent);
    on(el.weapon, "pointermove", weaponPointerEvent);
    on(el.weapon, "pointercancel", (e) => { if (e.pointerId === weaponPointer) finishWeapon(true); });
    on(el.weapon, "lostpointercapture", (e) => { if (e.pointerId === weaponPointer) finishWeapon(true); });
    on(window, "blur", () => finishWeapon(true));
    on(document, "visibilitychange", () => { if (document.hidden) finishWeapon(true); });
    on(el.weapon, "contextmenu", (e) => e.preventDefault());
    const pressMode = () => {
      if (modeSelected) { if (actionHandler) actionHandler("mode-toggle"); }
      else {
        document.body.dataset.bannerOogas = "true";
        sheet.selectTab("roster");
      }
    };
    let modePointer = -1;
    on(el.mode, "pointerdown", (e) => {
      if (e.button !== 0 || modePointer >= 0) return;
      e.preventDefault(); e.stopPropagation();
      modePointer = e.pointerId;
      if (e.isTrusted) el.mode.setPointerCapture(e.pointerId);
    });
    const finishModePress = (e, cancel = false) => {
      if (e.pointerId !== modePointer) return;
      e.preventDefault(); e.stopPropagation();
      modePointer = -1;
      if (el.mode.hasPointerCapture(e.pointerId)) el.mode.releasePointerCapture(e.pointerId);
      if (!cancel) pressMode();
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
      if (b === el.weapon && (e.detail !== 0 || weaponPointer >= 0)) return;
      if (b === el.mode && e.detail !== 0) return;
      b.blur();
      if (b.dataset.action === "feed") openFeed();
      else if (b.dataset.action === "recipe-close") closeRecipe();
      else if (b.dataset.action === "recipe-copy") copyRecipe(b);
      else if (b.dataset.action === "intro-go") b.closest("[data-intro]").hidden = true;
      else if (b === el.modeDestination) BL.destinationMap.open();
      else if (b === el.mode) pressMode();
      else if (b.dataset.action === "account-login") BL.net.login();
      else if (b.dataset.action === "account-logout") BL.net.logout();
      else if (b.dataset.action === "account-rejoin") BL.net.rejoin();
      else if (b.dataset.action === "account-voice") BL.voice.toggle();
      else if (b.dataset.action === "account-voice-leave") BL.voice.leave();
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
      let tipBaseText = "";
      const shownName = () => !tipNoStatusDot && tipCave?.humanControlled ? BL.net.state.me?.display || tipBaseText : tipBaseText;
      const tooltip = {
        show: (text, x, y, cave = null, noStatusDot = false, above = false) => {
          if (cave !== tipCave) tipSpeechBottom = -Infinity;
          tipCave = cave;
          const name = !!cave;
          tipBaseText = text;
          const changedDot = tipNoStatusDot !== noStatusDot;
          tipNoStatusDot = noStatusDot;
          text = shownName();
          const changed = text !== tipText || name !== tipName || changedDot;
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
          const text = shownName();
          if (text !== tipText) {
            textElement.textContent = tipText = text;
            tipState = "";
            measureTooltip();
          }
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
      el.hint.textContent = BL.controls.words(text);
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
      // A scene-owned screen (the Factory kiosk) keeps Escape while its controls
      // have focus. Focusing a panel still lets the visitor close that panel.
      if (!closed && !(escapeHeld?.() && !e.target.closest?.(".sheet"))) closed = sheet.escape();
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
    // End this visit; the attached sheet rows belong to the page.
    const dispose = () => {
      BL.destinationMap.disconnect(mapProvider);
      delete document.body.dataset.bannerOogas;
      sheet.dispose();
      finishPrimary(true);
      finishWeapon(true);
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
      el.toast.classList.remove("show");
      el.toast.hidden = true;
      el.hint.classList.remove("show");
      el.hint.hidden = true;
      tooltip.hide();
      modePointer = -1;
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
      mainBoard.dispose();
      el.board.classList.remove("board-floating");
      el.board.removeAttribute("style");
      window.clearTimeout(destinationLabelTimer);
      el.modeDestinationName.classList.remove("show");
    };
    setMode(null);
    return {
      // Engines keep this facade while a retained scene takes a fresh visit signal and sheet state.
      renew(signal) {
        const next = create({ roster, healthEnabled, signal, escapeHeld });
        next.tooltip.setVisibility(this.tooltip.visibility);
        next.onAction(actionHandler); next.onPreset(presetHandler);
        Object.defineProperties(this, Object.getOwnPropertyDescriptors(next));
        return this;
      },
      el, openFeed, openRecipe, closeRecipe, dismissOutside, openBoard, closeBoard, updateBoard, restoreBoards, setPanelsHidden, foldPanels, setRosterRow, setStats, setAct, setMode, setWeaponSkin, setDestinations, setGorilla, setGorillaSmashPower, setDetachedView, fadeDetachedName, setAreaLabel, setPrimary, setWeapon, setMagazine, setJetpack, setSubtitle, onAction, toast, tooltip, hint, hideHint, letterSign, selectTab, onPreset, setPileValueVisible, dispose };
  };
  // Detached panels can be visible together. Each has a view of the same account and voice state.
  const ROOM_WORDS = { replaced: "open in another tab", full: "island full" };
  // What voice needs cannot change in a page's life: worked out once, so the button can name what this browser lacks
  // before the visitor is asked to join.
  let voiceSupportReason = null;
  const voiceReason = () => {
    if (voiceSupportReason === null) {
      const support = BL.voice && BL.voice.support ? BL.voice.support() : { secure: true, webrtc: true, mic: true };
      voiceSupportReason = !support.secure ? "Voice needs a secure page" : !support.webrtc ? "This browser has no WebRTC" : !support.mic ? "This browser has no microphone" : "";
    }
    return voiceSupportReason;
  };
  const accountPrefixes = [""];
  for (const slot of document.querySelectorAll("[data-account-copy]")) {
    const prefix = slot.dataset.accountCopy + "-";
    const copy = $("account").cloneNode(true);
    copy.id = prefix + copy.id;
    for (const child of copy.querySelectorAll("[id]")) child.id = prefix + child.id;
    slot.replaceWith(copy);
    accountPrefixes.push(prefix);
  }
  const accountFields = new Map();
  const fieldsFor = (id) => {
    if (!accountFields.has(id)) accountFields.set(id, accountPrefixes.map((prefix) => $(prefix + id)));
    return accountFields.get(id);
  };
  const writeAccount = (id, key, value) => {
    for (const el of fieldsFor(id)) {
      if (el[key] !== value) el[key] = value;
    }
  };
  const showAccount = ({ backend, me, room, online }) => {
    const live = !!me && room === "live", words = live ? `${online} online` : ROOM_WORDS[room] || "";
    writeAccount("account", "hidden", !backend);
    writeAccount("account-name", "textContent", me ? me.display : "");
    writeAccount("account-name", "hidden", !me);
    writeAccount("account-login", "hidden", !!me);
    writeAccount("account-logout", "hidden", !me);
    writeAccount("account-room", "textContent", words);
    writeAccount("account-room", "hidden", !me || !words);
    writeAccount("account-rejoin", "hidden", !me || !ROOM_WORDS[room]);
    const voice = BL.voice.stats;
    const iceBlocked = voice.error === BL.voice.ICE_BLOCKED;
    const voiceFailure = iceBlocked ? voice.error : voice.returning ? voice.micError : voice.enabled ? "" : voice.error || voice.micError;
    const reason = voiceReason();
    const voiceWords = reason ? reason : voice.joining ? "Joining voice" : voiceFailure ? `Voice: ${voiceFailure}` : !voice.enabled && !voice.returning ? "Join voice" : voice.muted ? "Unmute" : "Mute";
    writeAccount("account-voice", "hidden", !live);
    writeAccount("account-voice", "textContent", voiceWords);
    writeAccount("account-voice", "disabled", !!reason);
    // A blocked WebRTC explains itself in a tooltip, and only while it is the reason: a VPN's leak protection is what
    // usually does it, by turning off non-proxied UDP (Brave's "WebRTC IP handling policy").
    const voiceTip = iceBlocked
      ? "A VPN's leak protection can block WebRTC by setting the browser's IP handling policy to disable non-proxied UDP (Brave specific). Allow WebRTC for this site, or turn that protection off."
      : "";
    writeAccount("account-voice", "title", voiceTip);
    writeAccount("account-voice-leave", "hidden", !live || !voice.enabled && !voice.returning);
    const pressed = String(voice.enabled && !voice.muted), onlineDot = String(live);
    for (const row of fieldsFor("account")) if (row.dataset.live !== onlineDot) row.dataset.live = onlineDot;
    for (const button of fieldsFor("account-voice")) if (button.getAttribute("aria-pressed") !== pressed) button.setAttribute("aria-pressed", pressed);
  };
  // The microphone's note (#181), page-level as the account line is: muted in voice, it stays until unmuted;
  // alone in voice (nobody here to hear, so the microphone is held off), it says so until someone comes;
  // unmuting, or someone coming, says "Mic on" for MIC_ON_MS, then it goes. A mute outranks alone.
  // `keyed` is whether the page reserves M for voice mute outside editable fields.
  const MIC_ON_MS = 1500, MIC_COARSE = window.matchMedia("(pointer: coarse)").matches;
  let micShown = "", micTimer = 0;
  const showMic = (voice, keyed) => {
    // Listen-only visitors (never opted in to speak, unlike one back from an earlier session) see no microphone status at all.
    const speaker = !!voice.micWanted || !!voice.returning;
    const muted = speaker && voice.muted && (voice.publishing || voice.joining || voice.returning), alone = !muted && speaker && voice.alone;
    const shown = muted ? keyed && !MIC_COARSE ? "Mic muted \u00b7 M to unmute" : "Mic muted \u00b7 Unmute in the panel" : alone ? "Alone \u00b7 mic off" : speaker && voice.publishing ? "Mic on" : "";
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
  const VOICE_WORDS = { off: "Not in voice", on: "In voice", speaking: "Speaking", muted: "Muted their microphone" };
  // A voice mark's tooltip and label, shared with the live players tab: the visitor's own mark works their microphone,
  // anyone else's mutes them for this visitor (`login` empty when there is nobody to mute).
  const voiceWords = (look, self, blocked, login) => !look ? "" : self ? look === "muted" ? "Your microphone is muted: click to unmute" : "Your microphone: click to mute"
    : `${VOICE_WORDS[look]}${blocked ? ". Muted for you: click to unmute" : login ? ". Click to mute for you" : ""}`;
  const voiceRowOf = (login, body) => {
    const character = BL.net.characterOf(login);
    return character && liveRows.get(character.handle) || body && liveRows.get(BL.net.bodyName(body)) || null;
  };
  // A contributor's stats, a darker strip under their row that their name opens: their Ooga's face, the day of their
  // first contribution (the character's `joined`), their contributions across the org, all five kinds, and every
  // repository they have contributed to with their count there, from the newest oogatron reading (oogatron-live.js,
  // kept on `liveStats`) or the baked one. Built on its first opening and filled on each, and again while open when a
  // reading arrives; the face is drawn once a page a contributor.
  const STAT_KINDS = [["commits", "commit", "commits"], ["prs", "PR", "PRs"], ["reviews", "review", "reviews"], ["issues", "issue", "issues"], ["comments", "comment", "comments"]];
  // The org's .github repository holds its profile and templates, not a project, so it gets no chip.
  const STAT_FACE_PX = 40, REPO_URL = "https://github.com/OogaBoogaX/", UNLISTED_REPOS = new Set([".github"]);
  const SINCE = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });
  const shortYear = (t) => SINCE.formatToParts(t).map((p) => p.type === "year" ? `\u2019${p.value.slice(-2)}` : p.value).join("");
  const faces = new Map();
  // The total and the first contribution stand side by side next to the face: the day with its whole year while they
  // fit, "’26" once a narrow panel would wrap them, and only past that do they wrap. One answer for the whole roster,
  // measured with its longest total beside its longest date, so no two strips differ and opening another never changes
  // one. Fitted again when a total or the strip's width changes, on the bitcoin line's pattern; a hidden strip (width 0)
  // takes the last answer until it shows.
  const sinceFits = new Map();
  let sinceResize = null, sinceShort = false, liveStats = null;
  // Every login's contributions across the five kinds in the newest reading, worked out once a reading.
  const tally = { data: null, totals: new Map() };
  const totals = () => {
    const data = liveStats || BL.jumbotronData;
    if (tally.data === data) return tally.totals;
    tally.data = data;
    tally.totals.clear();
    const boards = data && data.leaderboards;
    if (boards) for (const [kind] of STAT_KINDS) {
      if (!Array.isArray(boards[kind])) continue;
      for (const entry of boards[kind]) {
        const login = entry.login.toLowerCase();
        tally.totals.set(login, (tally.totals.get(login) || 0) + entry.count);
      }
    }
    return tally.totals;
  };
  const loginOf = (contributor, character = BL.characters.get(contributor.name)) => ((character && character.github) || contributor.name).toLowerCase();
  const contributionsOf = (contributor) => totals().get(loginOf(contributor)) || 0;
  const joinedAt = (contributor, character) => character ? character.joined * 1e3 : contributor.lastCommitAt;
  const fitSince = () => {
    let probe = null;
    for (const fit of sinceFits.values()) if (fit.fitWidth) { probe = fit; break; }
    if (probe) {
      let total = "", since = "";
      for (const row of liveRows.values()) {
        const character = BL.characters.get(row.contributor.name), joined = joinedAt(row.contributor, character);
        const count = statCount(totals().get(loginOf(row.contributor, character)) || 0), day = joined > 0 ? SINCE.format(joined) : "";
        if (count.length > total.length) total = count;
        if (day.length > since.length) since = day;
      }
      const shown = probe.total.textContent;
      probe.facts.dataset.fit = "line";
      probe.total.textContent = total; probe.since.textContent = since;
      sinceShort = probe.facts.scrollWidth > probe.facts.clientWidth;
      probe.total.textContent = shown;
    }
    for (const fit of sinceFits.values()) {
      fit.since.textContent = sinceShort ? fit.short : fit.long;
      if (!fit.fitWidth) continue;
      fit.facts.dataset.fit = "line";
      if (fit.facts.scrollWidth > fit.facts.clientWidth) fit.facts.dataset.fit = "wrap";
    }
  };
  const statCount = (n) => n >= 1e4 ? BL.game.formatLarge(n) : n.toLocaleString();
  const countIn = (board, login) => {
    if (Array.isArray(board)) for (const entry of board) if (entry.login.toLowerCase() === login) return entry.count;
    return 0;
  };
  const countFor = (boards, login) => {
    let n = 0;
    if (boards) for (const [kind] of STAT_KINDS) n += countIn(boards[kind], login);
    return n;
  };
  const buildStats = (row) => {
    const box = document.createElement("div"), face = document.createElement("canvas"), facts = document.createElement("dl");
    const total = document.createElement("dd"), since = document.createElement("dd"), kinds = document.createElement("p"), repos = document.createElement("div");
    box.className = "roster-stats"; box.id = `roster-stats-${row.rosterIndex}-${row.contributor.name}`;
    face.className = "roster-stats-face"; face.setAttribute("role", "img"); face.setAttribute("aria-label", `${row.contributor.display}'s Ooga`);
    facts.className = "roster-stats-facts";
    for (const [term, value] of [["Contributions", total], ["Since", since]]) {
      const pair = document.createElement("div"), dt = document.createElement("dt");
      dt.textContent = term;
      pair.append(dt, value);
      facts.append(pair);
    }
    kinds.className = "roster-stats-kinds";
    // Links in a group, not list items: the roster's own rows are its <li>s.
    repos.className = "roster-stats-repos"; repos.setAttribute("role", "group"); repos.setAttribute("aria-label", "Repositories");
    box.append(face, facts, kinds, repos);
    const stats = row.nodes.stats = { box, face, facts, total, since, kinds, repos, long: "", short: "", fitWidth: 0 };
    row.li.append(box);
    sinceFits.set(facts, stats);
    if (!sinceResize) sinceResize = new ResizeObserver((entries) => {
      let moved = false;
      for (const entry of entries) {
        const fit = sinceFits.get(entry.target), width = Math.round(entry.contentRect.width);
        if (width === fit.fitWidth) continue;
        fit.fitWidth = width;
        moved = true;
      }
      if (moved) fitSince();
    });
    sinceResize.observe(facts);
    row.name.setAttribute("aria-controls", box.id);
  };
  const fillStats = (row) => {
    const stats = row.nodes.stats, contributor = row.contributor, character = BL.characters.get(contributor.name);
    const login = loginOf(contributor, character);
    if (!faces.has(contributor.name)) {
      const canvas = document.createElement("canvas");
      renderFaceIcon(canvas, BL.models.caveman(BL.contributors.traitsFor(contributor.name)), null, STAT_FACE_PX * 2);
      faces.set(contributor.name, canvas);
    }
    const art = faces.get(contributor.name), ctx = stats.face.getContext("2d");
    stats.face.width = stats.face.height = art.width;
    ctx.drawImage(art, 0, 0);
    const joined = joinedAt(contributor, character);
    stats.long = joined > 0 ? SINCE.format(joined) : "—";
    stats.short = joined > 0 ? shortYear(joined) : "—";
    const data = liveStats || BL.jumbotronData;
    const kinds = [];
    let sum = 0;
    for (const [kind, one, many] of STAT_KINDS) {
      const n = countIn(data && data.leaderboards && data.leaderboards[kind], login);
      sum += n;
      if (n) kinds.push(`${statCount(n)} ${n === 1 ? one : many}`);
    }
    stats.total.textContent = statCount(sum);
    fitSince();
    // Each count stays on one line with its label (and the dot after it), so the line wraps only between them.
    stats.kinds.replaceChildren();
    kinds.forEach((text, i) => {
      const item = document.createElement("span");
      item.textContent = i < kinds.length - 1 ? `${text}\u00a0·` : text;
      stats.kinds.append(item, i < kinds.length - 1 ? " " : "");
    });
    stats.kinds.hidden = !kinds.length;
    const list = [];
    for (const repo of data && Array.isArray(data.repos) ? data.repos : []) {
      if (UNLISTED_REPOS.has(repo.name)) continue;
      const listed = Array.isArray(repo.contributors) && repo.contributors.some((c) => c.login.toLowerCase() === login);
      const n = countFor(repo.leaderboards, login);
      if (listed || n) list.push({ name: repo.name, n });
    }
    list.sort((a, b) => b.n - a.n || (a.name < b.name ? -1 : 1));
    stats.repos.replaceChildren();
    for (const { name, n } of list) {
      const a = document.createElement("a"), count = document.createElement("b");
      a.href = REPO_URL + name; a.target = "_blank"; a.rel = "noopener";
      a.title = `${name}: ${n.toLocaleString()} contribution${n === 1 ? "" : "s"}`;
      count.textContent = statCount(n);
      a.append(name, count);
      stats.repos.append(a);
    }
    if (!list.length) {
      const none = document.createElement("span");
      none.className = "roster-stats-none"; none.textContent = "No repositories in the latest reading";
      stats.repos.append(none);
    }
  };
  const openStats = (row, open) => {
    row.open = open;
    if (open && !row.nodes.stats) buildStats(row);
    if (open) fillStats(row);
    if (row.nodes.stats) row.nodes.stats.box.hidden = !open;
    row.name.setAttribute("aria-expanded", String(open));
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
      const words = voiceWords(row.look, row.self, blocked, row.login);
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
        if (voice.enabled || voice.returning) {
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
  // The wordless way out's name, from the banner's Leave button it stands in for: its words, or for a place's name alone
  // ("Arcade", "Factory"), back to it.
  const nameLeave = (words) => {
    const button = document.getElementById("leave-hud"), text = words.trim(), name = /^(leave|back|exit)\b/i.test(text) ? text : `Back to the ${text}`;
    button.setAttribute("aria-label", name);
    button.title = name;
  };
  // A game's exits say where they go: back to the arcade when one of its cabinets started it, else the island. A
  // header button names the place in its span (a phone shows only "Back"); a card's button says it all; the wordless
  // way out by the face takes the header's name.
  const leaveTo = (scene, home) => {
    const place = home === "arcade" ? "arcade" : "the island";
    for (const b of document.querySelectorAll(`[data-scene="${scene}"] [data-action="leave"]`)) {
      const span = b.querySelector("span");
      if (span) span.textContent = ` to ${place}`;
      else b.textContent = `Back to ${place}`;
    }
    if (document.body.dataset.activeScene === scene) nameLeave(`Back to ${place}`);
  };
  BL.hud = { create, renderIcon, renderFaceIcon, renderBodyIcon, signLettering, showAccount, showMic, showVoices, setDonationStats, donationValueText, toast, offerReload, holdRow, leaveTo, STATE_LABELS, statusFor, voiceIcon, voiceWords };
})();
