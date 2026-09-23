(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp, damp } = BL.math;
  const SHOULDER_DISTANCE = 3.8, POUND_CHARGE_TIME = 1;
  const CONTROL_ENABLED = false;
  const create = ({ canvas, camera, pilot, hud, clankers, input = null, constrainCamera = null }) => {
    const orbit = pilot.orbit, target = { x: 0, y: 0, z: 0 };
    const command = { x: 0, z: 0, climbAxis: 0, heading: NaN, jumpHeld: false, jumpPressed: false, run: false };
    const listeners = [];
    let player = null, view = "orbit", battle = false, disposed = false, jumpKey = false, jumpTap = false, run = false;
    let actPointer = -1, smashPointer = -1, smashCharge = 0, shownCharge = -1, mouseButtons = 0, blockedButtons = 0, shoulder = 0;
    let focused = false, lockPending = false, wasLocked = false, unlockedAt = -Infinity, focusVersion = 0;
    let actMode = -1, actPower = -1, climbPress = false;
    const on = (node, type, callback, options) => {
      node.addEventListener(type, callback, options);
      listeners.push(() => node.removeEventListener(type, callback, options));
    };
    const consume = (event) => { event.preventDefault(); event.stopImmediatePropagation(); };
    const typing = (event) => event.target && (event.target.isContentEditable
      || event.target.closest && event.target.closest("input, textarea, select, dialog"));
    // The pilot owns private first-person transitions. Reset those through its
    // public preset API, then restore the displayed camera's exact orbit.
    const rebasePilot = () => {
      target.x = camera.target.x; target.y = camera.target.y; target.z = camera.target.z;
      const dx = camera.position.x - target.x, dy = camera.position.y - target.y, dz = camera.position.z - target.z;
      const distance = Math.max(0.1, Math.hypot(dx, dy, dz));
      const yaw = Math.atan2(dx, dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
      pilot.goPreset("pile");
      pilot.cursor.stop();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      pilot.controls.clearPointer();
      orbit.target = target;
      orbit.tx = target.x; orbit.ty = target.y; orbit.tz = target.z;
      orbit.yaw = orbit.tYaw = yaw; orbit.pitch = orbit.tPitch = pitch; orbit.dist = orbit.tDist = distance;
      camera.up = null;
    };
    const cancelInput = () => {
      jumpKey = jumpTap = run = climbPress = false;
      mouseButtons = 0;
      blockedButtons = 0;
      const pointer = actPointer;
      actPointer = -1;
      if (pointer >= 0 && hud.el.act.hasPointerCapture(pointer)) hud.el.act.releasePointerCapture(pointer);
      const smash = smashPointer;
      smashPointer = -1; smashCharge = 0;
      if (player) player.motion.poundCharge = 0;
      if (smash >= 0 && hud.el.gorillaSmash.hasPointerCapture(smash)) hud.el.gorillaSmash.releasePointerCapture(smash);
      hud.el.gorillaSmash.style.setProperty("--pound-charge", "0");
      shownCharge = -1;
      if (input) input.reset();
      pilot.controls.clearPointer();
      clankers.cancelInput();
    };
    const blurCombat = () => {
      focused = false; lockPending = false; focusVersion++;
      unlockedAt = performance.now();
      document.body.classList.remove("aim-cursor-focused");
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      cancelInput();
    };
    const focusCombat = () => {
      if (!player || !battle || disposed) return;
      focused = true;
      document.body.classList.add("aim-cursor-focused");
      canvas.focus({ preventScroll: true });
      if (document.pointerLockElement === canvas || lockPending || !canvas.requestPointerLock) return;
      const version = ++focusVersion;
      lockPending = true;
      const failed = () => { if (version === focusVersion) lockPending = false; };
      try {
        const request = canvas.requestPointerLock();
        if (request && request.then) request.then(() => {
          if (version === focusVersion) lockPending = false;
          if (player && (!battle || !focused) && document.pointerLockElement === canvas) document.exitPointerLock();
        }, failed);
      } catch (_) { failed(); }
    };
    const lockChanged = () => {
      if (!player) return;
      const locked = document.pointerLockElement === canvas, lost = wasLocked && !locked;
      wasLocked = locked;
      if (locked) {
        lockPending = false;
        if (!battle || !focused) document.exitPointerLock();
      } else if (lost) blurCombat();
    };
    on(document, "pointerlockchange", lockChanged);
    on(document, "pointerlockerror", () => { if (player) lockPending = false; });
    const showAct = () => {
      if (!player) return;
      if (hud.el.act.hidden) hud.el.act.hidden = false;
      const climb = clankers.climbAction(player);
      const mode = player.climb.active ? 4 : player.fire.rolling ? 3 : player.fire.burning ? 2
        : climb > 0 ? 5 : climb < 0 ? 6 : !climbPress && (jumpKey || actPointer >= 0 || jumpTap) ? 1 : 0;
      const power = mode === 1 ? Math.round(player.motion.charge * 100) : -1;
      if (mode === actMode && power === actPower) return;
      actMode = mode; actPower = power;
      hud.setAct(mode === 6 ? "CLIMB DOWN" : mode === 5 ? "CLIMB UP" : mode === 4 ? "W ↑ · S ↓" : mode === 3 ? "ROLLING!" : mode === 2 ? "DROP & ROLL" : mode === 1 ? `RELEASE ${power}%` : "HOLD TO JUMP");
    };
    const beginJump = () => {
      if (player.fire.burning) {
        jumpTap = false;
        clankers.cancelInput();
        clankers.dropRoll();
      } else if (player.climb.active || clankers.startClimb(player)) {
        // This whole press belongs to the climb, even if the mantle finishes
        // before Space/the touch button is released. Never charge a jump then.
        jumpTap = false; climbPress = true;
      } else {
        // Preserve a down/up pair that both arrive before the next simulation
        // frame: it becomes one held frame followed by a release.
        jumpTap = true;
      }
      showAct();
    };
    const release = () => {
      if (!player) return false;
      blurCombat();
      clankers.release();
      player = null; battle = false; wasLocked = false;
      pilot.setExternalControl(false);
      rebasePilot();
      hud.setGorilla(null);
      hud.el.act.hidden = true;
      return true;
    };
    const possess = (entry) => {
      if (!CONTROL_ENABLED || disposed || !entry || !entry.active || !entry.root.visible) return false;
      if (entry === player) return true;
      if (player) blurCombat();
      if (!clankers.possess(entry)) return false;
      pilot.release(true);
      rebasePilot();
      player = entry;
      pilot.setExternalControl(true);
      battle = true; focused = wasLocked = false;
      view = "shoulder"; shoulder = 0; actMode = actPower = -1;
      cancelInput();
      const p = player.root.position;
      target.x = orbit.tx = p.x; target.y = orbit.ty = p.y + 1.25; target.z = orbit.tz = p.z;
      orbit.tPitch = clamp(orbit.pitch, -0.25, 1.15);
      orbit.tDist = SHOULDER_DISTANCE;
      hud.setGorilla(player, view, battle);
      hud.tooltip.hide();
      showAct();
      focusCombat();
      return true;
    };
    const action = (name) => {
      if (!player) return false;
      if (name === "gorilla-smash") clankers.smash();
      else if (name === "gorilla-drag") clankers.grab();
      else if (name === "gorilla-beat") clankers.chestBeat();
      else if (name === "mode-release") release();
      else if (name === "mode-toggle") {
        battle = !battle;
        if (battle) { cancelInput(); focusCombat(); }
        else blurCombat();
        hud.setGorilla(player, view, battle);
      } else if (name === "act") beginJump();
      else return false;
      return true;
    };
    const onKeyDown = (event) => {
      if (!player || event.metaKey || event.ctrlKey || event.altKey || typing(event)) return;
      const key = event.key.toLowerCase();
      if (key === " ") {
        consume(event);
        if (!jumpKey && !event.repeat) { jumpKey = true; beginJump(); }
      } else if (key === "escape" || key === "tab") {
        consume(event);
        if (focused || document.pointerLockElement === canvas || performance.now() - unlockedAt < 100) blurCombat();
        else if (key === "escape") release();
      }
      else if (key === "shift") { run = true; consume(event); }
      else if (key === "1" || key === "2") {
        consume(event);
        if (!event.repeat) action(key === "1" ? "gorilla-smash" : "gorilla-drag");
      } else if (key === "x") {
        consume(event);
        if (!event.repeat) action("mode-toggle");
      } else if (key === "g" || key === "v" || key === "j" || key === "n" || key === "c" || key.length === 1 && key >= "3" && key <= "9") consume(event);
    };
    const onKeyUp = (event) => {
      if (!player) return;
      // Shared controls may have seen the press before possession. Let their
      // keyup listener clear it as well; releasing a key triggers no action.
      if (event.key === " ") { jumpKey = false; event.preventDefault(); }
      else if (event.key === "Shift") { run = false; event.preventDefault(); }
    };
    on(window, "keydown", onKeyDown, true);
    on(window, "keyup", onKeyUp, true);
    const onDown = (event) => {
      if (!player) return;
      if (event.target === hud.el.act) {
        if (event.button !== 0 || actPointer >= 0) return;
        consume(event);
        actPointer = event.pointerId;
        if (event.isTrusted) hud.el.act.setPointerCapture(event.pointerId);
        beginJump();
      } else if (event.target === hud.el.gorillaSmash || hud.el.gorillaSmash.contains(event.target)) {
        if (event.button !== 0 || smashPointer >= 0) return;
        consume(event);
        smashPointer = event.pointerId;
        smashCharge = 0;
        if (event.isTrusted) hud.el.gorillaSmash.setPointerCapture(event.pointerId);
      } else if (event.target === canvas && battle && event.pointerType !== "touch") {
        consume(event);
        mouseButtons = event.buttons;
        if (!focused) { blockedButtons |= event.buttons; focusCombat(); return; }
        if (event.button === 0 && !(blockedButtons & 1)) clankers.smash();
        else if (event.button === 2 && !(blockedButtons & 2)) clankers.chestBeat();
      }
    };
    const moveView = (dx, dy) => {
      if (!player) return false;
      orbit.tYaw -= dx * 0.004;
      orbit.tPitch = clamp(orbit.tPitch + dy * 0.0035, -0.35, 1.3);
      return true;
    };
    const zoom = (factor) => {
      if (!player) return false;
      orbit.tDist = clamp(orbit.tDist * factor, 3.8, 32);
      const next = orbit.tDist <= 5 ? "shoulder" : "orbit";
      if (view !== next) { view = next; hud.setGorilla(player, view, battle); }
      return true;
    };
    const onMove = (event) => {
      if (!player || !battle || !focused || event.target !== canvas || event.pointerType === "touch") return;
      consume(event);
      const pressed = event.buttons & ~mouseButtons & ~blockedButtons;
      if (pressed & 1) clankers.smash();
      if (pressed & 2) clankers.chestBeat();
      mouseButtons = event.buttons;
      blockedButtons &= event.buttons;
    };
    const onUp = (event) => {
      if (!player) return;
      if (event.pointerId === actPointer) {
        consume(event);
        actPointer = -1;
        if (hud.el.act.hasPointerCapture(event.pointerId)) hud.el.act.releasePointerCapture(event.pointerId);
        hud.el.act.blur();
      } else if (event.pointerId === smashPointer) {
        consume(event);
        const charge = smashCharge;
        smashPointer = -1; smashCharge = 0; player.motion.poundCharge = 0;
        hud.el.gorillaSmash.style.setProperty("--pound-charge", "0"); shownCharge = -1;
        if (hud.el.gorillaSmash.hasPointerCapture(event.pointerId)) hud.el.gorillaSmash.releasePointerCapture(event.pointerId);
        hud.el.gorillaSmash.blur();
        clankers.smash(charge);
      } else if (event.target === canvas && battle && event.pointerType !== "touch") {
        consume(event);
        mouseButtons = event.buttons;
        blockedButtons &= event.buttons;
      }
    };
    on(window, "pointerdown", onDown, true);
    on(window, "pointermove", onMove, true);
    on(window, "pointerup", onUp, true);
    on(window, "mousemove", (event) => {
      if (player && battle && focused && (event.target === canvas || document.pointerLockElement === canvas)) {
        consume(event);
        moveView(event.movementX || 0, event.movementY || 0);
      }
    }, true);
    const cancelPointer = (event) => {
      if (player && (event.pointerId === actPointer || event.pointerId === smashPointer || battle && event.target === canvas)) {
        consume(event);
        const blocked = blockedButtons | mouseButtons;
        cancelInput();
        blockedButtons = blocked;
      }
    };
    on(window, "pointercancel", cancelPointer, true);
    on(canvas, "lostpointercapture", cancelPointer);
    on(hud.el.act, "lostpointercapture", cancelPointer);
    on(hud.el.gorillaSmash, "lostpointercapture", cancelPointer);
    on(window, "click", (event) => {
      if (player && (battle && event.target === canvas || event.target === hud.el.act && event.detail > 0
        || (event.target === hud.el.gorillaSmash || hud.el.gorillaSmash.contains(event.target)) && event.detail > 0)) consume(event);
    }, true);
    on(canvas, "contextmenu", (event) => { if (player) consume(event); }, true);
    on(window, "wheel", (event) => {
      if (!player || event.target !== canvas) return;
      consume(event);
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
      zoom(Math.exp(clamp(delta * 0.0015, -0.5, 0.5)));
    }, { capture: true, passive: false });
    on(window, "blur", () => { if (player) blurCombat(); });
    on(document, "visibilitychange", () => { if (player && document.hidden) blurCombat(); });
    const readInput = (dt) => {
      if (!player) return;
      if (smashPointer >= 0) {
        smashCharge = Math.min(1, smashCharge + dt / POUND_CHARGE_TIME);
        player.motion.poundCharge = smashCharge;
        const charge = Math.round(smashCharge * 100);
        if (charge !== shownCharge) { shownCharge = charge; hud.el.gorillaSmash.style.setProperty("--pound-charge", String(charge / 100)); }
      }
      const axes = pilot.controls.read();
      orbit.tYaw += axes.yaw * 1.7 * dt;
      orbit.tPitch = clamp(orbit.tPitch + axes.pitch * 1.1 * dt, -0.35, 1.3);
      const sy = Math.sin(orbit.yaw), cy = Math.cos(orbit.yaw);
      command.x = axes.x * cy - axes.y * sy;
      command.z = -axes.x * sy - axes.y * cy;
      command.heading = battle ? orbit.yaw + Math.PI : Math.hypot(command.x, command.z) > 0.01 ? Math.atan2(command.x, command.z) : NaN;
      command.climbAxis = axes.y;
      if (!jumpKey && actPointer < 0) climbPress = false;
      command.jumpHeld = !climbPress && (jumpKey || actPointer >= 0 || jumpTap);
      command.jumpPressed = !climbPress && jumpTap;
      command.run = run;
      clankers.control(command);
      jumpTap = false;
    };
    const update = (dt) => {
      if (!player) return;
      if (clankers.player !== player || !player.active || !player.root.visible) { release(); return; }
      const p = player.root.position;
      target.x = p.x; target.y = p.y + (player.fire.rolling ? 0.7 : 1.25); target.z = p.z;
      orbit.yaw = damp(orbit.yaw, orbit.tYaw, 14, dt);
      orbit.pitch = damp(orbit.pitch, orbit.tPitch, 14, dt);
      orbit.dist = damp(orbit.dist, orbit.tDist, 9, dt);
      orbit.tx = damp(orbit.tx, target.x, 10, dt);
      orbit.ty = damp(orbit.ty, target.y, 10, dt);
      orbit.tz = damp(orbit.tz, target.z, 10, dt);
      shoulder = damp(shoulder, view === "shoulder" ? 0.75 : 0, 10, dt);
      const sy = Math.sin(orbit.yaw), cy = Math.cos(orbit.yaw), cp = Math.cos(orbit.pitch);
      camera.target.x = orbit.tx + cy * shoulder;
      camera.target.y = orbit.ty;
      camera.target.z = orbit.tz - sy * shoulder;
      camera.position.x = camera.target.x + sy * cp * orbit.dist;
      camera.position.y = camera.target.y + Math.sin(orbit.pitch) * orbit.dist;
      camera.position.z = camera.target.z + cy * cp * orbit.dist;
      camera.up = null;
      if (constrainCamera) constrainCamera(player, camera);
      hud.setGorilla(player, view, battle);
      showAct();
    };
    const dispose = () => {
      if (disposed) return;
      release(); disposed = true;
      for (const off of listeners) off();
    };
    return { possess, release, readInput, update, action, orbit: moveView, zoom, cancelInput, dispose,
      get active() { return !!player; }, get player() { return player; }, get view() { return view; },
      get battle() { return battle; }, get focused() { return focused; } };
  };
  BL.clankerPlay = { create };
})();
