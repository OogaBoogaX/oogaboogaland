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
    mempool: ["Learn", "A rainforest shaped by Bitcoin's waiting transactions."],
    factory: ["Learn", "A Lightning node at work · enter through its shield."],
    lab: ["Learn", "EntropyLab's contributors at work."],
    bca: ["Learn", "Banana Certified Accounting."],
    timechain: ["Learn", "Live Bitcoin charts · choose a room at the keypad."]
  };
  const create = ({ current, ready }) => {
    const $ = id => document.getElementById(id);
    const dialog = $("destination-map"), list = $("destination-map-list"), status = $("destination-map-status");
    const button = $("destination-hud"), closeButton = $("destination-map-close"), title = $("destination-map-title");
    const coach = $("explore-coach"), coachText = $("explore-coach-text"), start = $("explore-coach-start"), skip = $("explore-coach-skip");
    const learn = $("controls-learn"), controls = $("controls-help-button");
    const coarse = window.matchMedia("(pointer: coarse)");
    const KEY = "ooga-explore-coach-v1", down = new Set(), swallowed = new Set();
    let provider = null, owner = null, rows = [], seen = false, coaching = -1, anchor = null, x = 0, z = 0, padAt = 0, padDirection = 0;
    try { seen = localStorage.getItem(KEY) === "1"; } catch { /* Optional coaching also works without storage. */ }
    const remember = () => { seen = true; try { localStorage.setItem(KEY, "1"); } catch { /* No persistence. */ } };
    const canOpen = () => !!provider && ready() && current()?.navigationReady !== false && provider.available();
    // A successful choice hands the keys back to the world, so Space acts there; closing returns to Map.
    const finish = (chosen = false) => {
      if (!owner) return;
      const previous = owner; owner = null;
      previous.controlsHelpHold?.(false);
      BL.controls.resetAll(); BL.gamepad.hold(false);
      button.setAttribute("aria-expanded", "false");
      if (chosen) $("scene").focus({ preventScroll: true });
      else if (!button.hidden) button.focus({ preventScroll: true });
      rows = []; list.replaceChildren(); status.textContent = "";
    };
    const close = (chosen = false) => { if (dialog.open) dialog.close(); finish(chosen); };
    const closeFromButton = () => close();
    const onClose = () => { if (!dialog.open) finish(); };
    const complete = () => {
      if (coaching !== 2) return;
      remember(); coaching = 3; coachText.textContent = "You're ready to explore. Controls and Map are always here.";
      start.textContent = "Done"; skip.hidden = true;
    };
    const choose = name => {
      if (!provider || !ready() || current() !== owner) { close(); return; }
      if (!canOpen()) { status.textContent = "That destination is unavailable right now. Close the map to continue."; return; }
      const result = provider.travel(name);
      if (result === false || typeof result === "string") {
        status.textContent = typeof result === "string" ? result : "That destination is unavailable right now. Close the map to continue.";
        return;
      }
      complete(); close(true);
    };
    const open = () => {
      if (!canOpen() || dialog.open || document.querySelector("dialog[open]")) return false;
      owner = current();
      for (const key of down) swallowed.add(key);
      BL.controls.resetAll(); owner.controlsHelpHold?.(true); BL.gamepad.hold(true, true);
      if (document.pointerLockElement) document.exitPointerLock();
      const travels = provider.travels(), selected = provider.selected();
      title.textContent = travels ? "Where shall we go?" : "Choose a viewpoint";
      list.replaceChildren(); rows = [];
      const groups = new Map();
      for (const name of provider.names()) {
        const place = current().id === "hub" ? PLACES[name] : null, group = place ? place[0] : "Explore";
        let section = groups.get(group);
        if (!section) {
          section = document.createElement("section"); section.dataset.group = group; const heading = document.createElement("h3");
          heading.textContent = group; section.append(heading); groups.set(group, section);
        }
        const entry = document.createElement("button"), label = document.createElement("strong"), description = document.createElement("span");
        entry.type = "button"; entry.dataset.destination = name;
        const outside = current().id === "dsb" && name === "outside";
        label.textContent = outside ? provider.label(name) : `${travels ? "Go to" : "View"} ${provider.label(name)}`;
        description.textContent = outside ? "Leave this room to choose another town viewpoint." : place ? place[1] : "Look around here. Move or press Escape to return to your Ooga.";
        if (name === selected) { entry.setAttribute("aria-current", "location"); description.textContent += travels ? " · Current destination" : " · Selected view"; }
        entry.append(label, description); entry.addEventListener("click", () => choose(name));
        section.append(entry);
      }
      for (const group of ["Play", "Explore", "Learn"]) if (groups.has(group)) list.append(groups.get(group));
      rows = Array.from(list.querySelectorAll("button"));
      status.textContent = "The world keeps moving while the map is open.";
      dialog.showModal(); closeButton.focus({ preventScroll: true });
      button.setAttribute("aria-expanded", "true"); padAt = 0; padDirection = 0;
      return true;
    };
    const onDown = e => {
      const key = e.code || e.key;
      if (down.size < 64) down.add(key);
      if (!dialog.open) {
        if (swallowed.has(key)) { e.preventDefault(); e.stopImmediatePropagation(); }
        return;
      }
      if (swallowed.size < 64) swallowed.add(key);
      e.stopImmediatePropagation();
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (!["Tab", "Enter", " "].includes(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) e.preventDefault();
    };
    const onUp = e => {
      const key = e.code || e.key; down.delete(key);
      if (swallowed.delete(key) || dialog.open) { e.stopImmediatePropagation(); if (!dialog.open) e.preventDefault(); }
    };
    const onBlur = () => { down.clear(); swallowed.clear(); BL.controls.resetAll(); };
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
    closeButton.addEventListener("click", closeFromButton); dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onClose); dialog.addEventListener("click", onBackdrop);
    window.addEventListener("keydown", onDown, true); window.addEventListener("keyup", onUp, true); window.addEventListener("blur", onBlur);
    start.addEventListener("click", coachStart); skip.addEventListener("click", dismissCoach); learn.addEventListener("click", replay);
    return {
      open, close,
      get coaching() { return coaching >= 0; },
      connect(next) { close(); provider = next; anchor = null; },
      disconnect(previous) { if (provider === previous) { close(); provider = null; coach.hidden = true; anchor = null; } },
      update(now) {
        const pad = BL.gamepad.ui, B = BL.gamepad.BUTTON;
        if (dialog.open && (!ready() || current() !== owner)) close();
        if (pad.pressed & B.menu && (dialog.open || canOpen())) { if (dialog.open) close(); else open(); }
        else if (dialog.open) {
          if (pad.pressed & B.b) close();
          else if (pad.pressed & B.a) document.activeElement?.click();
          else {
            const direction = pad.held & B.down || pad.ly < -0.5 ? 1 : pad.held & B.up || pad.ly > 0.5 ? -1 : 0;
            if (direction && (direction !== padDirection || now >= padAt)) {
              const at = rows.indexOf(document.activeElement), next = at < 0 ? (direction > 0 ? 0 : rows.length - 1) : (at + direction + rows.length) % rows.length;
              rows[next]?.focus(); padAt = now + (direction === padDirection ? 150 : 350);
            }
            padDirection = direction;
          }
        }
        const hub = current()?.id === "hub";
        if (learn.hidden === hub) learn.hidden = !hub;
        const learnDisabled = !canOpen();
        if (learn.disabled !== learnDisabled) { learn.disabled = learnDisabled; learn.title = learnDisabled ? "Finish the current interaction before learning the controls" : "Replay the movement and Map guide"; }
        if (seen && coaching < 0) { if (!coach.hidden) coach.hidden = true; return; }
        const available = hub && canOpen() && current().coachingReady !== false && !document.querySelector("dialog[open]");
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
        close(); provider = anchor = null; coach.hidden = true;
        closeButton.removeEventListener("click", closeFromButton); dialog.removeEventListener("cancel", onCancel);
        dialog.removeEventListener("close", onClose); dialog.removeEventListener("click", onBackdrop);
        window.removeEventListener("keydown", onDown, true); window.removeEventListener("keyup", onUp, true); window.removeEventListener("blur", onBlur);
        start.removeEventListener("click", coachStart); skip.removeEventListener("click", dismissCoach); learn.removeEventListener("click", replay);
      }
    };
  };
  BL.destinationMap = { create };
})();
