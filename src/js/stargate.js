// Scene-owned gate; no destination scene, networking or character ownership lives here.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {}, S = BL.scene;
  const ACTIVATION_MS = 2000, ACTIVE_MS = 10000, SHUTDOWN_MS = 450;
  const create = ({ radius, outerRadius, position, rotation = { x: 0, y: 0, z: 0 }, destinations = [], receiving = false,
    onMenu = () => {}, onTraverse = null, now = () => performance.now(), reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches }) => {
    const model = BL.stargateModels.build(radius, outerRadius);
    Object.assign(model.root.position, position); Object.assign(model.root.rotation, rotation);
    const inverse = BL.math.mat4.create();
    let state = receiving ? "ACTIVE" : "OFF", started = 0, destination = null, disposed = false, crossed = false, opened = false, focus = null, focusFrame = 0;
    const dialog = document.getElementById("stargate-menu"), list = dialog.querySelector("ol"), closeButton = dialog.querySelector(".modal-close"), status = dialog.querySelector("[role=status]");
    const viewport = window.visualViewport;
    const buttons = destinations.map((entry, index) => {
      const li = document.createElement("li"), button = document.createElement("button");
      button.type = "button"; button.textContent = `${index + 1}. ${entry.label}`; button.disabled = !entry.enabled;
      button.dataset.destination = String(index); li.appendChild(button); return { li, button };
    });
    const fit = () => { if (opened) dialog.style.setProperty("--gate-height", (viewport ? viewport.height : innerHeight) + "px"); };
    const finishClose = () => {
      if (!opened) return;
      opened = false; cancelAnimationFrame(focusFrame); focusFrame = 0; onMenu(false);
      if (focus && focus.isConnected) focus.focus({ preventScroll: true });
      focus = null;
    };
    const close = () => { if (opened && dialog.open) dialog.close(); finishClose(); };
    const update = () => {
      if (disposed) return;
      const elapsed = Math.max(0, now() - started);
      if (!receiving && state !== "OFF") {
        state = elapsed < ACTIVATION_MS ? "ACTIVATING" : elapsed < ACTIVATION_MS + ACTIVE_MS ? "ACTIVE" : elapsed < ACTIVATION_MS + ACTIVE_MS + SHUTDOWN_MS ? "SHUTDOWN" : "OFF";
      }
      const k = state === "ACTIVATING" ? elapsed / ACTIVATION_MS : state === "SHUTDOWN" ? 1 - (elapsed - ACTIVATION_MS - ACTIVE_MS) / SHUTDOWN_MS : state === "ACTIVE" ? 1 : 0;
      model.horizon.visible = k > 0;
      model.horizon.scale.x = model.horizon.scale.z = radius * Math.max(0.001, k);
      model.horizon.glow = 0.3 + 0.7 * k;
      const burst = state === "ACTIVATING" && !reducedMotion ? Math.sin(Math.PI * k) : 0;
      model.kawoosh.visible = burst > 0.01;
      model.kawoosh.scale.x = model.kawoosh.scale.z = radius * 0.65 * burst;
      model.kawoosh.scale.y = Math.min(radius * 0.6, 2.4) * burst;
      for (let i = 0; i < model.ripples.length; i++) {
        const node = model.ripples[i], size = radius * k * (reducedMotion ? (i + 1) / 4 : ((elapsed / 1800 + i / 3) % 1));
        node.visible = k > 0 && size > 0.02; node.scale.x = node.scale.z = Math.max(0.001, size); node.position.y = 0.025 + i * 0.006;
      }
    };
    const activate = index => {
      update();
      const entry = destinations[index];
      if (receiving || disposed || state !== "OFF" || !entry || !entry.enabled) return false;
      destination = entry.id; started = now(); crossed = false; state = "ACTIVATING"; update(); return true;
    };
    const choose = event => {
      const button = event.target.closest("button[data-destination]");
      if (!button || button.disabled || !opened) return;
      if (activate(Number(button.dataset.destination))) close();
      else status.textContent = "The Stargate is already cycling. Wait for it to close.";
    };
    const cancel = event => { event.preventDefault(); close(); };
    const key = event => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); close(); } };
    const focusDialog = event => {
      // A touch that opened the modal may end over its backdrop/container.
      if (opened && event.target === dialog) (buttons.find(row => !row.button.disabled)?.button || closeButton).focus({ preventScroll: true });
    };
    const closed = () => { if (!dialog.open) finishClose(); };
    const open = () => {
      if (receiving || disposed || opened || dialog.open) return false;
      focus = document.activeElement; opened = true;
      list.replaceChildren(...buttons.map(row => row.li)); status.textContent = "Enter the active Pit horizon to travel. An inactive Pit is still an abyss.";
      onMenu(true); dialog.showModal(); fit();
      const first = buttons.find(row => !row.button.disabled)?.button || closeButton;
      first.focus({ preventScroll: true });
      // Touch action opens on pointerdown, before the browser's default focus step.
      focusFrame = requestAnimationFrame(() => { focusFrame = 0; if (opened) first.focus({ preventScroll: true }); });
      return true;
    };
    // Signed local +Y -> -Y is front entry; receiving scenes explicitly choose the back.
    const traverse = (from, to, bodyRadius = 0, direction = 1) => {
      update();
      if (!onTraverse || state !== "ACTIVE" || crossed || disposed || !Number.isFinite(bodyRadius) || bodyRadius < 0 || bodyRadius >= radius || (direction !== 1 && direction !== -1)) return false;
      S.updateWorld(model.root, model.root.parent ? model.root.parent.world : undefined); BL.math.mat4.invert(inverse, model.root.world);
      const ay = inverse[1] * from.x + inverse[5] * from.y + inverse[9] * from.z + inverse[13];
      const by = inverse[1] * to.x + inverse[5] * to.y + inverse[9] * to.z + inverse[13];
      if (!(ay * direction > 0 && by * direction <= 0)) return false;
      const t = ay / (ay - by), x = from.x + (to.x - from.x) * t, y = from.y + (to.y - from.y) * t, z = from.z + (to.z - from.z) * t;
      const lx = inverse[0] * x + inverse[4] * y + inverse[8] * z + inverse[12], lz = inverse[2] * x + inverse[6] * y + inverse[10] * z + inverse[14];
      if (!Number.isFinite(lx + lz) || Math.hypot(lx, lz) > radius - bodyRadius) return false;
      crossed = true; onTraverse(destination); return true;
    };
    if (!receiving) {
      dialog.addEventListener("click", choose); closeButton.addEventListener("click", close); dialog.addEventListener("cancel", cancel); dialog.addEventListener("close", closed); dialog.addEventListener("keydown", key); dialog.addEventListener("focusin", focusDialog);
      window.addEventListener("resize", fit); if (viewport) viewport.addEventListener("resize", fit);
    }
    // Receiving gates stay lit for the passage, independently of the outgoing dial window.
    const finishReceiving = () => { if (receiving) { state = "OFF"; update(); } };
    const dispose = () => {
      if (disposed) return;
      close(); disposed = true; state = "OFF";
      dialog.removeEventListener("click", choose); closeButton.removeEventListener("click", close); dialog.removeEventListener("cancel", cancel); dialog.removeEventListener("close", closed); dialog.removeEventListener("keydown", key); dialog.removeEventListener("focusin", focusDialog);
      window.removeEventListener("resize", fit); if (viewport) viewport.removeEventListener("resize", fit);
      if (!receiving) list.replaceChildren(); model.horizon.visible = model.kawoosh.visible = false;
      for (const node of model.ripples) node.visible = false;
      for (const node of [model.root, model.dialer]) if (node.parent) S.removeChild(node.parent, node);
    };
    return { ...model, radius, outerRadius, open, close, activate, update, traverse, finishReceiving, dispose, reducedMotion,
      get state() { return state; }, get isOpen() { return opened; }, get disposed() { return disposed; } };
  };
  BL.stargate = { create, ACTIVATION_MS, ACTIVE_MS, SHUTDOWN_MS };
})();
