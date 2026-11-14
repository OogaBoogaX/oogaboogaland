// Named destinations reuse each scene's own look or guarded travel action. The page owns the dialog;
// a visit lends it a provider, which is forgotten before the visit leaves.
(() => {
  "use strict";
  const BL = window.BL;
  const PLACES = {
    arcade: ["Play", "Games and prizes · enter through the cave, then choose a cabinet."],
    pile: ["Explore", "The heart of the island · meet the Oogas."],
    underground: ["Explore", "Headquarters and its sleeping crew."],
    basement: ["Explore", "The rooms beneath headquarters."],
    mirror: ["Explore", "The mirror cave."],
    gate: ["Explore", "The north pass and its arch."],
    bifrost: ["Explore", "Walk through the gateway to other worlds."],
    mempool: ["Learn", "The chamber beneath the rainforest lake · Bitcoin's waiting transactions."],
    factory: ["Learn", "A Lightning node at work · enter through its shield."],
    lab: ["Learn", "EntropyLab's contributors at work."],
    bca: ["Learn", "Banana Certified Accounting."],
    repos: ["Learn", "Explore open-source Bitcoin projects · cross the stone bridge past the Oogatron."],
    timechain: ["Learn", "Live Bitcoin charts · choose a room at the keypad."]
  };
  const create = ({ current, ready }) => {
    const $ = id => document.getElementById(id);
    const dialog = $("destination-map"), list = $("destination-map-list"), status = $("destination-map-status");
    const button = $("destination-hud"), closeButton = $("destination-map-close"), title = $("destination-map-title");
    const coach = $("explore-coach"), coachText = $("explore-coach-text"), start = $("explore-coach-start"), skip = $("explore-coach-skip");
    const learn = $("controls-learn"), controls = $("controls-help-button");
    const coarse = window.matchMedia("(pointer: coarse)");
    const mode = $("destination-map-mode"), go = $("destination-map-go"), selection = $("destination-map-selection"), detail = $("destination-map-detail");
    const guide = $("destination-map-guide"), returnButton = $("destination-return"), waypoint = $("destination-waypoint"), waypointText = $("destination-waypoint-text"), waypointArrow = $("destination-waypoint-arrow"), waypointStop = $("destination-waypoint-stop");
    const mapTab = $("destination-show-map"), listTab = $("destination-show-list"), layers = $("destination-map-layers");
    let layer = "all", waypointName = "", waypointOwner = null, waypointAt = 0;
    const waypointPoint = { x: 0, y: 0, z: 0, note: "" };
    const stopGuidance = () => { waypointName = ""; waypointOwner = null; waypoint.hidden = true; };
    const returnToActor = () => { current()?.navigationReturn?.(); hideReceipt(); returnButton.hidden = true; $("scene").focus({ preventScroll: true }); };
    const setDisplay = view => { dialog.dataset.display = view; mapTab.setAttribute("aria-pressed", String(view === "map")); listTab.setAttribute("aria-pressed", String(view === "list")); };
    const showMap = () => setDisplay("map"), showList = () => setDisplay("list");
    const setLayer = value => {
      layer = value; atlas?.filter(layer);
      for (const row of rows) { const p = mapData?.points.find(p => p.name === row.dataset.destination); row.hidden = layer !== "all" && (p?.layer || "surface") !== layer; }
      for (const section of list.children) section.hidden = !Array.from(section.querySelectorAll("button")).some(row => !row.hidden);
      for (const button of layers.children) button.setAttribute("aria-pressed", String(button.dataset.mapLayer === layer));
    };
    const changeLayer = e => {
      if (!e.target.dataset.mapLayer) return;
      setLayer(e.target.dataset.mapLayer); selectedName = ""; go.disabled = guide.disabled = true;
      for (const row of rows) row.setAttribute("aria-pressed", "false");
      selection.textContent = "Where next?"; phase.textContent = "SELECT A ZONE"; go.textContent = "Choose a zone";
      detail.textContent = "Choose a landmark on this floor."; status.textContent = "";
      atlas?.select("", provider?.position?.());
    };
    const startGuidance = () => {
      const scene = current(), name = selectedName;
      if (!canOpen() || !name || !scene.navigationWaypoint?.(name, waypointPoint)) return;
      waypointName = name; waypointOwner = scene; waypointAt = 0;
      scene.navigationReturn?.(); close(true); hideReceipt();
    };
    const phase = $("destination-map-phase"), receipt = $("destination-map-receipt"), effect = $("destination-map-effect"), survey = $("destination-atlas");
    const atlas = BL.destinationAtlas?.create($("destination-atlas-ground"), $("destination-atlas-overlay"), $("destination-atlas-pins"));
    let mapData = null, selectedName = "", selectedTravels = false, acting = false, receiptTimer = 0;
    const hideReceipt = () => { if (receiptTimer) window.clearTimeout(receiptTimer); receiptTimer = 0; receipt.hidden = true; effect.hidden = true; receipt.textContent = ""; };
    const KEY = "ooga-explore-coach-v1", down = new Set(), swallowed = new Set();
    let provider = null, owner = null, rows = [], seen = false, coaching = -1, anchor = null, x = 0, z = 0;
    try { seen = localStorage.getItem(KEY) === "1"; } catch { /* Optional coaching also works without storage. */ }
    const remember = () => { seen = true; try { localStorage.setItem(KEY, "1"); } catch { /* No persistence. */ } };
    const canOpen = () => !!provider && ready() && current()?.navigationReady !== false && provider.available();
    // A successful choice hands the keys back to the world, so Space acts there; closing returns to Map.
    const finish = (chosen = false) => {
      if (!owner) return;
      const previous = owner; owner = null;
      previous.controlsHelpHold?.(false);
      // The pad was in the Menus context while the dialog was modal (pad-focus.js); a stick still deflected waits for neutral.
      BL.controls.resetAll(); BL.gamepad.requireNeutral();
      button.setAttribute("aria-expanded", "false");
      if (chosen) $("scene").focus({ preventScroll: true });
      else if (!button.hidden) button.focus({ preventScroll: true });
      rows = []; list.replaceChildren(); status.textContent = "";
      atlas?.clear(); mapData = null; selectedName = ""; acting = false; go.disabled = guide.disabled = true; guide.hidden = true;
      dialog.setAttribute("aria-busy", "false");
    };
    const close = (chosen = false) => { if (dialog.open) dialog.close(); finish(chosen); };
    const closeFromButton = () => close();
    const onClose = () => { if (!dialog.open) finish(); };
    const complete = () => {
      if (coaching !== 2) return;
      remember(); coaching = 3; coachText.textContent = "You're ready to explore. Controls and Map are always here.";
      start.textContent = "Done"; skip.hidden = true;
    };
    const select = name => {
      if (acting || !provider || !provider.names().includes(name)) return;
      selectedName = name; selectedTravels = provider.travels();
      const outside = current().id === "dsb" && name === "outside", point = mapData?.points.find(p => p.name === name);
      selection.textContent = provider.label(name);
      phase.textContent = outside ? "RETURN TO TOWN" : selectedTravels ? "WARP PREVIEW" : "VIEW PREVIEW";
      const place = current().id === "hub" ? PLACES[name] : null;
      detail.textContent = [point?.level, outside ? "Leave this room before choosing another town view." : place ? place[1] : "Look around this part of DSB Land.",
        outside ? "" : selectedTravels ? "Heading and equipment stay. Landing must be clear." : "Camera only. Move, Escape or Return to my Ooga to resume."].filter(Boolean).join(" · ");
      go.textContent = outside ? "Return outside" : `${selectedTravels ? "Warp to" : "View"} ${provider.label(name)}`;
      const refusal = current().navigationStatus?.(name) || "";
      go.disabled = !!refusal;
      guide.hidden = !current().navigationWaypoint;
      guide.disabled = !current().navigationWaypoint?.(name, waypointPoint);
      if (refusal) detail.textContent += ` · ${refusal}`;
      if (layer !== "all" && point && (point.layer || "surface") !== layer) setLayer(point.layer || "surface");
      go.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      for (const row of rows) row.setAttribute("aria-pressed", String(row.dataset.destination === name));
      const position = provider.position?.() || mapData?.origin;
      atlas?.select(name, position ? { x: position.x, z: position.z } : null);
      status.textContent = `${provider.label(name)} selected. ${outside ? "Confirm to return outside." : selectedTravels ? "Confirm to warp your gorilla." : "Confirm to change the view; your Ooga stays in place."}`;
    };
    const choose = () => {
      if (acting || !selectedName) return;
      if (!provider || !ready() || current() !== owner) { close(); return; }
      if (!canOpen()) { status.textContent = "That destination is unavailable right now. Close the map to continue."; return; }
      // A change of controlled body while browsing needs a fresh preview, never an accidental warp.
      if (provider.travels() !== selectedTravels) { select(selectedName); status.textContent = "Your controls changed. Review the action and confirm again."; return; }
      const name = selectedName, label = provider.label(name), travels = selectedTravels, outside = current().id === "dsb" && name === "outside";
      acting = true; go.disabled = true; dialog.setAttribute("aria-busy", "true");
      // Travel is synchronous and guarded by the scene. No countdown, fake loading percentage or deferred move.
      const result = provider.travel(name);
      if (result !== true) {
        acting = false; go.disabled = false; dialog.setAttribute("aria-busy", "false");
        status.textContent = typeof result === "string" ? result : "That destination is unavailable right now. Choose another zone or close the map.";
        phase.textContent = "NOT MOVED";
        return;
      }
      complete(); close(true);
      hideReceipt(); receipt.dataset.kind = travels ? "warp" : "view";
      receipt.textContent = outside ? "Return outside to CHORA started." : travels ? `Warp complete · ${label}. Heading and equipment kept.` : `View selected · ${label}. Your Ooga stays in place. Move or Escape to return.`;
      receipt.hidden = false; effect.hidden = !travels; coach.hidden = true;
      receiptTimer = window.setTimeout(hideReceipt, 5500);
    };
    const open = () => {
      if (!canOpen() || dialog.open || document.querySelector("dialog:modal, dialog[open]:not(.board-floating)")) return false;
      hideReceipt(); waypoint.hidden = true; owner = current();
      for (const key of down) swallowed.add(key);
      BL.controls.resetAll(); owner.controlsHelpHold?.(true);
      if (document.pointerLockElement) document.exitPointerLock();
      const travels = provider.travels(), selected = provider.selected();
      setDisplay("map"); layer = "all"; atlas?.filter(layer);
      mapData = owner.navigationMap?.() || null;
      title.textContent = mapData?.title || "Explore the world";
      mode.textContent = owner.id === "dsb" && provider.names().length === 1 && provider.names()[0] === "outside" ? "RETURN TO TOWN · Leave this room to explore CHORA." : travels ? "GORILLA WARP · Choose a zone, preview, then warp." : "CAMERA VIEW · Your Ooga stays where it is.";
      selectedName = ""; acting = false; go.disabled = guide.disabled = true; guide.hidden = !owner.navigationWaypoint; go.textContent = "Choose a zone";
      selection.textContent = "Where next?"; phase.textContent = "SELECT A ZONE";
      detail.textContent = "Choose a landmark on the map or in the list.";
      dialog.setAttribute("aria-busy", "false");
      list.replaceChildren(); rows = [];
      const groups = new Map();
      const names = provider.names();
      for (const [index, name] of names.entries()) {
        const place = current().id === "hub" ? PLACES[name] : null, group = place ? place[0] : "Explore";
        let section = groups.get(group);
        if (!section) {
          section = document.createElement("section"); section.dataset.group = group; const heading = document.createElement("h3");
          heading.textContent = group; section.append(heading); groups.set(group, section);
        }
        const entry = document.createElement("button"), label = document.createElement("strong"), description = document.createElement("span");
        entry.type = "button"; entry.dataset.destination = name;
        const outside = current().id === "dsb" && name === "outside";
        label.textContent = `${index + 1}. ${provider.label(name)}`;
        entry.setAttribute("aria-label", `Preview ${provider.label(name)}`);
        entry.setAttribute("aria-pressed", "false");
        description.textContent = outside ? "Leave this room" : mapData?.points.find(p => p.name === name)?.level || (place ? place[0] : "Viewpoint");
        if (name === selected) { entry.setAttribute("aria-current", "true"); description.textContent += " · Last chosen"; }
        entry.append(label, description); entry.addEventListener("click", () => select(name));
        section.append(entry);
      }
      for (const group of ["Play", "Explore", "Learn"]) if (groups.has(group)) list.append(groups.get(group));
      rows = Array.from(list.querySelectorAll("button"));
      survey.hidden = !mapData; mapTab.disabled = !mapData; if (!mapData) setDisplay("list");
      layers.hidden = !mapData?.points.some(p => p.layer);
      setLayer("all");
      $("destination-map-mapnote").textContent = mapData ? "Select a landmark. The dotted line is a preview, not a walking route." : "The world map is available outside. Return to town to choose a viewpoint.";
      if (mapData) {
        atlas?.show(mapData, names, name => provider.label(name), select);
        const actorPosition = provider.position?.(), position = actorPosition || mapData.origin;
        $("destination-map-origin").textContent = actorPosition ? "◉ Your position" : "◉ Camera target";
        atlas?.select("", position ? { x: position.x, z: position.z } : null);
      }
      status.textContent = "Preview a zone before confirming. The world keeps moving while Map is open.";
      dialog.showModal(); closeButton.focus({ preventScroll: true });
      button.setAttribute("aria-expanded", "true");
      // A sole exit still gets an explicit preview, with no imaginary map of the indoor room.
      if (names.length === 1) select(names[0]);
      return true;
    };
    const onDown = e => {
      if (e.pad) {
        // A pad's key (gamepad.js, marked `pad`) is not a held keyboard key: on foot its Menu press arrives as the fixed
        // row's Escape and opens Map where it is available; inside the dialog pad-focus.js sends Escape for B or Menu.
        // Over any other menu layer (a dialog or card) that Escape is the layer's own, so it passes through untouched.
        if (dialog.open) { e.preventDefault(); e.stopImmediatePropagation(); if (e.key === "Escape") close(); }
        else if (e.key === "Escape" && !BL.padFocus?.open() && open()) { e.preventDefault(); e.stopImmediatePropagation(); }
        return;
      }
      const key = e.code || e.key;
      if (down.size < 64) down.add(key);
      if (!dialog.open) {
        if (["Escape", "KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) hideReceipt();
        if (swallowed.has(key)) { e.preventDefault(); e.stopImmediatePropagation(); }
        return;
      }
      if (swallowed.size < 64) swallowed.add(key);
      e.stopImmediatePropagation();
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (!["Tab", "Enter", " "].includes(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) e.preventDefault();
    };
    const onUp = e => {
      if (e.pad) return;
      const key = e.code || e.key; down.delete(key);
      if (swallowed.delete(key) || dialog.open) { e.stopImmediatePropagation(); if (!dialog.open) e.preventDefault(); }
    };
    const onBlur = () => { down.clear(); swallowed.clear(); BL.controls.resetAll(); hideReceipt(); };
    const onCancel = e => { e.preventDefault(); close(); };
    const onBackdrop = e => {
      if (e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
    };
    const dismissCoach = () => { remember(); coaching = -1; coach.hidden = true; anchor = null; skip.hidden = false; skip.textContent = "Not now"; };
    const begin = () => {
      if (!canOpen() || current()?.id !== "hub") return;
      current().beginCoaching?.();
      coaching = 0; seen = false; anchor = null;
      coachText.textContent = "Move your character to explore, then use Map to choose a place.";
      start.textContent = "Start moving"; coach.hidden = false; skip.hidden = false; skip.textContent = "Skip guide";
    };
    const coachStart = () => {
      if (coaching < 0) { begin(); return; }
      if (coaching === 0) { coaching = 1; anchor = null; start.textContent = "Controls"; }
      else if (coaching === 1) controls.click();
      else if (coaching === 2) open();
      else dismissCoach();
    };
    const replay = () => { $("controls-help-close").click(); begin(); };
    mapTab.addEventListener("click", showMap); listTab.addEventListener("click", showList); layers.addEventListener("click", changeLayer);
    guide.addEventListener("click", startGuidance); returnButton.addEventListener("click", returnToActor); waypointStop.addEventListener("click", stopGuidance);
    go.addEventListener("click", choose);
    closeButton.addEventListener("click", closeFromButton); dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onClose); dialog.addEventListener("click", onBackdrop);
    window.addEventListener("keydown", onDown, true); window.addEventListener("keyup", onUp, true); window.addEventListener("blur", onBlur);
    start.addEventListener("click", coachStart); skip.addEventListener("click", dismissCoach); learn.addEventListener("click", replay);
    return {
      open, close,
      get coaching() { return coaching >= 0; },
      connect(next) { close(); hideReceipt(); stopGuidance(); provider = next; anchor = null; },
      disconnect(previous) { if (provider === previous) { close(); hideReceipt(); stopGuidance(); returnButton.hidden = true; provider = null; coach.hidden = true; anchor = null; } },
      update() {
        returnButton.hidden = dialog.open || !current()?.navigationLooking?.();
        if (waypointName) {
          const scene = current(), at = performance.now();
          if (scene !== waypointOwner || !provider?.position?.()) stopGuidance();
          else if (at >= waypointAt) {
            waypointAt = at + 100;
            if (!scene.navigationWaypoint(waypointName, waypointPoint)) stopGuidance();
            else {
              const p = provider.position(), camera = scene.camera, dx = waypointPoint.x - p.x, dz = waypointPoint.z - p.z, distance = Math.hypot(dx, dz);
              const arrived = distance < 2.5 && Math.abs(p.y - waypointPoint.y) < 3;
              const facing = camera ? Math.atan2(camera.target.x - camera.position.x, camera.target.z - camera.position.z) : 0;
              waypointArrow.style.transform = `rotate(${(facing - Math.atan2(dx, dz)) * 180 / Math.PI}deg)`;
              waypointArrow.hidden = arrived;
              const text = `${provider.label(waypointName)} · ${arrived ? waypointPoint.note || "Entrance reached · use the on-screen action" : Math.round(distance) + " m to next entrance · follow paths"}`;
              if (waypointText.textContent !== text) waypointText.textContent = text;
              waypoint.hidden = dialog.open;
            }
          }
        }
        if (dialog.open && (!ready() || current() !== owner)) close();
        const hub = current()?.id === "hub";
        if (learn.hidden === hub) learn.hidden = !hub;
        const learnDisabled = !canOpen();
        if (learn.disabled !== learnDisabled) { learn.disabled = learnDisabled; learn.title = learnDisabled ? "Finish the current interaction before learning the controls" : "Replay the movement and Map guide"; }
        if (seen && coaching < 0) { if (!coach.hidden) coach.hidden = true; return; }
        const available = receipt.hidden && hub && canOpen() && current().coachingReady !== false && !document.querySelector("dialog:modal, dialog[open]:not(.board-floating)");
        const show = available && (!seen || coaching >= 0);
        if (coach.hidden === show) coach.hidden = !show;
        if (!show) return;
        if (coaching < 0 && start.textContent !== "Learn the controls") { coachText.textContent = "New to the island? Learn to move and find your way."; start.textContent = "Learn the controls"; }
        else if (coaching === 0 && provider.controlled()) { coaching = 1; anchor = null; start.textContent = "Controls"; }
        if (coaching === 1) {
          const point = provider.position();
          if (!point) return;
          if (point !== anchor) { anchor = point; x = point.x; z = point.z; }
          const touch = coarse.matches;
          const words = BL.gamepad.state.connected ? "Use the left stick to move and the right stick to look. Menu opens Map." : touch ? "Use the left stick to move and the right stick to look." : "Use W A S D or the arrows to move. Drag to look around.";
          if (coachText.textContent !== words) coachText.textContent = words;
          if ((point.x - x) ** 2 + (point.z - z) ** 2 >= 1) {
            coaching = 2; coachText.textContent = provider.travels()
              ? "Choose a destination on the Map. At its entrance, use the action shown on screen."
              : "Choose a view on the Map. Move or press Escape to return to your Ooga."; start.textContent = "Open Map";
          }
        }
      },
      dispose() {
        close(); hideReceipt(); stopGuidance(); returnButton.hidden = true; atlas?.dispose();
        mapTab.removeEventListener("click", showMap); listTab.removeEventListener("click", showList); layers.removeEventListener("click", changeLayer);
        guide.removeEventListener("click", startGuidance); returnButton.removeEventListener("click", returnToActor); waypointStop.removeEventListener("click", stopGuidance); provider = anchor = null; coach.hidden = true;
        go.removeEventListener("click", choose);
        closeButton.removeEventListener("click", closeFromButton); dialog.removeEventListener("cancel", onCancel);
        dialog.removeEventListener("close", onClose); dialog.removeEventListener("click", onBackdrop);
        window.removeEventListener("keydown", onDown, true); window.removeEventListener("keyup", onUp, true); window.removeEventListener("blur", onBlur);
        start.removeEventListener("click", coachStart); skip.removeEventListener("click", dismissCoach); learn.removeEventListener("click", replay);
      }
    };
  };
  BL.destinationMap = { create };
})();
