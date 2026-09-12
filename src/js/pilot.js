// The visitor's camera, flight and possession
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp, damp } = BL.math;
  const { create: createControls } = BL.controls;
  const BASE_FOV = 48 * Math.PI / 180;
  const MAX_FOV = 64 * Math.PI / 180;
  const MIN_HFOV = 58 * Math.PI / 180;
  const YAW_RATE = 1.7, PITCH_RATE = 1.1;
  const CLOSE_RATE = 12, CLOSE_SNAP = 0.001, CLOSE_PINCH_EXIT = 1.08, CLOSE_LOOK_DIST = 4, CLOSE_HEAD_MIX = 0.1;
  const CLOSE_GROUND_RATE = 9, CLOSE_TELEPORT = 0.8;
  // The camera swings behind while walking forward
  const FOLLOW_TURN = 1.8, DRAG_HOLD = 1.5;
  // Act button labels, action or jetpack throttle
  const ACT_DO = "Ooga!", ACT_FLY = "Blast off!";
  const create = (ctx) => {
    const { renderer, canvas, camera, hud, presets, pitch: [PITCH_MIN, PITCH_MAX], dist: [DIST_MIN, DIST_MAX], follow, fly, clampTarget, clampCamera, coarse, close = null } = ctx;
    let crew = null, fx = null;
    const freeTarget = { x: 0, y: 0, z: 0 };
    const followTarget = { x: 0, y: 0, z: 0 };
    const view = presets[ctx.landing];
    const orbit = { ...view, tYaw: view.yaw, tPitch: view.pitch, tDist: view.dist, tx: view.target.x, ty: view.target.y, tz: view.target.z };
    let closeWanted = false, closeMix = 0, closeExitScale = 1, closeCave = null, hiddenHead = null, hiddenHeadCameraHidden = false, viewPitch = orbit.pitch;
    let groundView = 0, groundTarget = 0, groundX = 0, groundZ = 0, groundZone = 0, groundValid = false, groundLift = 0, groundEasing = false;
    const bind = (systems) => {
      crew = systems.crew;
      fx = systems.fx;
    };
    const player = () => crew ? crew.player : null;
    const resetGroundView = () => {
      const cave = player();
      if (cave) crew.elevate(0);
      groundView = groundTarget = groundLift = 0;
      groundEasing = false;
      groundValid = false;
    };
    const restoreHead = () => {
      if (!hiddenHead) return;
      hiddenHead.parts.head.cameraHidden = hiddenHeadCameraHidden;
      hiddenHead = null;
    };
    const hideHead = (cave) => {
      if (hiddenHead === cave) return;
      restoreHead();
      hiddenHead = cave;
      hiddenHeadCameraHidden = cave.parts.head.cameraHidden;
      cave.parts.head.cameraHidden = true;
    };
    const setFreeEye = () => {
      const eyeHeight = close.eyeHeight;
      freeTarget.x = camera.position.x;
      freeTarget.z = camera.position.z;
      freeTarget.y = close.groundAt(freeTarget.x, freeTarget.z, camera.position.y - eyeHeight) + eyeHeight;
      clampTarget(freeTarget);
      orbit.target = freeTarget;
    };
    const faceWith = (cave) => {
      closeCave = cave;
      const desired = cave.root.rotation.y + Math.PI;
      orbit.tYaw = orbit.yaw + Math.atan2(Math.sin(desired - orbit.yaw), Math.cos(desired - orbit.yaw));
      orbit.tPitch = 0;
    };
    const enterClose = () => {
      if (!close || closeWanted) return;
      closeWanted = true;
      closeExitScale = 1;
      const cave = player();
      if (cave) faceWith(cave);
      else setFreeEye();
    };
    const exitClose = () => {
      if (!closeWanted) return;
      closeWanted = false;
      closeExitScale = 1;
      closeCave = null;
      const cave = player();
      orbit.tDist = clamp(cave ? close.trailingDist : close.orbitDist, DIST_MIN, DIST_MAX);
      orbit.tPitch = clamp(orbit.tPitch, cave ? follow.pitch[0] : PITCH_MIN, cave ? follow.pitch[1] : PITCH_MAX);
    };
    // ---------- possession ----------
    // Relabel the act button for what the press does
    const showAct = () => {
      const cave = player();
      if (cave) hud.setAct(cave.jet ? ACT_FLY : ACT_DO);
    };
    const possess = (cave) => {
      if (!crew.control(cave)) return;
      resetGroundView();
      orbit.tDist = clamp(orbit.tDist, follow.min, follow.max);
      orbit.tPitch = clamp(orbit.tPitch, follow.pitch[0], follow.pitch[1]);
      if (closeWanted) {
        closeMix = 0;
        faceWith(cave);
      }
      hud.el.act.hidden = false;
      showAct();
      hud.tooltip.hide();
      fx.say(cave, "Ooga? Me?", 1.6);
      if (cave.jet) hud.hint(coarse ? "Left stick flies · pinch in for first person · hold Blast off to climb" : "WASD flies · scroll in for first person · hold Space to climb · Escape to let go");
      else hud.hint(coarse ? "Left stick walks · pinch in for first person · Ooga! acts" : "WASD or both mouse buttons to walk · scroll in for first person · Space to act");
    };
    const release = (quiet = false) => {
      const cave = player();
      if (!cave) return;
      if (closeWanted) setFreeEye();
      resetGroundView();
      restoreHead();
      closeCave = null;
      crew.release();
      hud.el.act.hidden = true;
      if (!quiet) hud.toast(`${cave.traits.name} wanders off`);
    };
    // A jetpack wearer's Space stays unclaimed as throttle
    const action = () => {
      const cave = player();
      if (!cave || cave.jet) return false;
      crew.playerAction();
      return true;
    };
    // Held it climbs, clicked it acts; both mouse buttons on the canvas walk
    const controls = createControls({ move: document.getElementById("joy-move"), look: document.getElementById("joy-look"), boost: hud.el.act, chord: canvas, onAction: action });
    let dragHold = 0, trailingViewInput = false, trailingZoomInput = false;
    const hooks = {
      onOrbit: (dx, dy) => {
        dragHold = DRAG_HOLD;
        orbit.tYaw -= dx * 4e-3;
        const pitch = close && (closeWanted || closeMix > 0.5) ? close.pitch : null;
        orbit.tPitch = clamp(orbit.tPitch + dy * 3.5e-3, pitch ? pitch[0] : PITCH_MIN, pitch ? pitch[1] : PITCH_MAX);
        if (player() && !closeWanted) trailingViewInput = true;
      },
      onZoom: (factor) => {
        if (!close) {
          orbit.tDist = clamp(orbit.tDist * factor, DIST_MIN, DIST_MAX);
          return;
        }
        if (closeWanted) {
          if (factor > 1) {
            closeExitScale *= factor;
            if (closeExitScale >= CLOSE_PINCH_EXIT) {
              exitClose();
              if (player()) trailingZoomInput = true;
            }
          } else closeExitScale = 1;
          return;
        }
        orbit.tDist = clamp(orbit.tDist * factor, DIST_MIN, DIST_MAX);
        if (player()) {
          // A deliberate third-person zoom owns its distance immediately. The
          // terrain smoother must not turn it into a second lateral dolly.
          orbit.dist = orbit.tDist;
          trailingZoomInput = true;
        }
        if (factor < 1 && orbit.tDist <= DIST_MIN + 0.001) enterClose();
      },
      onDoubleTap: (hit) => {
        if (hit && hit.owner.kind === "caveman") {
          const cave = hit.owner.cave;
          if (cave === player()) release();
          else if (cave.state === "sleeping") fx.say(cave, "zzz... not now", 1.8);
          else possess(cave);
        } else if (player()) release();
      }
    };
    // ---------- camera ----------
    const goPreset = (name) => {
      const p = presets[name];
      if (!p) return;
      release(true);
      closeWanted = false;
      closeMix = 0;
      closeExitScale = 1;
      closeCave = null;
      restoreHead();
      orbit.target = p.target;
      orbit.tYaw = p.yaw;
      orbit.tPitch = p.pitch;
      orbit.tDist = p.dist;
    };
    // Read keys and sticks before the crew moves
    const readInput = (dt) => {
      const a = controls.read();
      const cave = player();
      const fx0 = -Math.sin(orbit.yaw), fz0 = -Math.cos(orbit.yaw);
      const rx = Math.cos(orbit.yaw), rz = -Math.sin(orbit.yaw);
      if (cave) {
        const p = cave.root.position;
        followTarget.x = p.x;
        followTarget.y = p.y - cave.baseY + follow.y;
        followTarget.z = p.z;
        orbit.target = followTarget;
        if (cave.jet) crew.thrust(a.up > 0);
        crew.steer(fx0 * a.y + rx * a.x, fz0 * a.y + rz * a.x, close ? closeMix : 0, a.y, a.x);
        if (dragHold > 0) dragHold -= dt;
        else if (!closeWanted && a.y > 0.05 && !a.yaw) {
          const behind = cave.root.rotation.y + Math.PI;
          orbit.tYaw += Math.atan2(Math.sin(behind - orbit.tYaw), Math.cos(behind - orbit.tYaw)) * Math.min(1, FOLLOW_TURN * dt);
        }
      } else if (a.x || a.y || a.up) {
        if (orbit.target !== freeTarget) {
          freeTarget.x = orbit.target.x;
          freeTarget.y = orbit.target.y;
          freeTarget.z = orbit.target.z;
          orbit.target = freeTarget;
        }
        const speed = (fly.speed + orbit.tDist * fly.perDist) * dt;
        freeTarget.x += (fx0 * a.y + rx * a.x) * speed;
        freeTarget.z += (fz0 * a.y + rz * a.x) * speed;
        freeTarget.y = clamp(freeTarget.y + a.up * fly.climb * dt, 0, fly.yMax);
        clampTarget(freeTarget);
      }
      if (a.yaw) {
        orbit.tYaw += a.yaw * YAW_RATE * dt;
        if (cave && !closeWanted) trailingViewInput = true;
      }
      if (a.pitch) {
        const pitch = close && (closeWanted || closeMix > 0.5) ? close.pitch : null;
        orbit.tPitch = clamp(orbit.tPitch + a.pitch * PITCH_RATE * dt, pitch ? pitch[0] : PITCH_MIN, pitch ? pitch[1] : PITCH_MAX);
        if (cave && !closeWanted) trailingViewInput = true;
      }
    };
    // The camera moves only on input, no drift
    const update = (dt) => {
      const cave = player();
      const directTrailingView = trailingViewInput && !!cave && !closeWanted;
      const directCameraPosition = directTrailingView || trailingZoomInput && !!cave;
      trailingViewInput = false;
      trailingZoomInput = false;
      let groundReset = false;
      if (closeWanted && cave !== closeCave) {
        if (cave) {
          resetGroundView();
          closeMix = 0;
          faceWith(cave);
        } else {
          if (closeCave) setFreeEye();
          resetGroundView();
          closeCave = null;
          restoreHead();
        }
      }
      closeMix = close ? damp(closeMix, closeWanted ? 1 : 0, CLOSE_RATE, dt) : 0;
      if (Math.abs(closeMix - (closeWanted ? 1 : 0)) < CLOSE_SNAP) closeMix = closeWanted ? 1 : 0;
      if (cave && closeMix > CLOSE_HEAD_MIX) hideHead(cave);
      else restoreHead();
      orbit.yaw = directTrailingView ? orbit.tYaw : damp(orbit.yaw, orbit.tYaw, 14, dt);
      orbit.pitch = directTrailingView ? orbit.tPitch : damp(orbit.pitch, orbit.tPitch, 14, dt);
      if (cave && close) crew.look(orbit.yaw + Math.PI, orbit.pitch, closeMix);
      if (cave && close) {
        const p = cave.root.position;
        const ground = p.y - cave.baseY - cave.hop;
        const zone = close.zone ? close.zone() : 0;
        const moved = Math.hypot(p.x - groundX, p.z - groundZ);
        const airborne = cave.hop > 0.001 || Math.abs(cave.hopV) > 0.001 || !!cave.jet && cave.jet.thrust;
        groundReset = !groundValid || airborne || zone !== groundZone || moved > CLOSE_TELEPORT || Math.abs(ground - groundTarget) > close.maxStep + 1e-6;
        if (groundReset) groundView = ground;
        else groundView = close.visualGroundAt ? close.visualGroundAt(p.x, p.z, ground) : damp(groundView, ground, CLOSE_GROUND_RATE, dt);
        groundLift = clamp(groundView - ground, -cave.baseY * 0.5, cave.baseY * 0.75);
        groundView = ground + groundLift;
        groundTarget = ground;
        groundX = p.x;
        groundZ = p.z;
        groundZone = zone;
        groundValid = true;
        groundEasing = !airborne;
        crew.elevate(groundLift);
        followTarget.y = p.y - cave.baseY + follow.y + cave.viewLift;
      } else {
        if (cave && close) crew.elevate(0);
        groundLift = 0;
        groundEasing = false;
        groundValid = false;
      }
      orbit.dist = damp(orbit.dist, orbit.tDist, 8, dt);
      orbit.tx = damp(orbit.tx, orbit.target.x, 5, dt);
      orbit.ty = damp(orbit.ty, orbit.target.y, 5, dt);
      orbit.tz = damp(orbit.tz, orbit.target.z, 5, dt);
      const { width, height } = renderer.size;
      const aspect = width / Math.max(1, height);
      camera.fov = clamp(2 * Math.atan(Math.tan(MIN_HFOV / 2) / aspect), BASE_FOV, MAX_FOV);
      const portrait = clamp(1 - aspect, 0, 0.6);
      let flatten = 0;
      if (cave && close) {
        const span = close.trailingDist - DIST_MIN;
        flatten = span > 0 ? clamp((close.trailingDist - orbit.dist) / span, 0, 1) : 1;
        flatten = flatten * flatten * (3 - 2 * flatten);
      }
      viewPitch = orbit.pitch * (1 - flatten);
      const cp = Math.cos(viewPitch), sp = Math.sin(viewPitch);
      const targetX = orbit.tx, targetY = orbit.ty - portrait * 0.6, targetZ = orbit.tz;
      const orbitX = orbit.tx + Math.sin(orbit.yaw) * cp * orbit.dist;
      const orbitY = orbit.ty + sp * orbit.dist;
      const orbitZ = orbit.tz + Math.cos(orbit.yaw) * cp * orbit.dist;
      let eyeX = freeTarget.x, eyeZ = freeTarget.z, eyeY = freeTarget.y, eyeClearance = close ? close.eyeHeight : 0;
      if (closeMix > 0) {
        if (cave) {
          const heading = cave.root.rotation.y, forward = close.eyeForward;
          eyeX = cave.root.position.x + Math.sin(heading) * forward;
          eyeY = cave.root.position.y - cave.baseY + cave.headOffset * close.eyeRatio + cave.viewLift;
          eyeZ = cave.root.position.z + Math.cos(heading) * forward;
          eyeClearance = eyeY - close.groundAt(eyeX, eyeZ, cave.root.position.y - cave.baseY - cave.hop);
        } else eyeY = close.groundAt(eyeX, eyeZ, camera.position.y - close.eyeHeight) + close.eyeHeight;
      }
      camera.position.x = orbitX + (eyeX - orbitX) * closeMix;
      camera.position.y = orbitY + (eyeY - orbitY) * closeMix;
      camera.position.z = orbitZ + (eyeZ - orbitZ) * closeMix;
      clampCamera(camera.position, closeMix, eyeClearance, groundEasing, dt, groundReset, directCameraPosition);
      const lookCp = Math.cos(orbit.pitch), lookSp = Math.sin(orbit.pitch);
      const lookX = camera.position.x - Math.sin(orbit.yaw) * lookCp * CLOSE_LOOK_DIST;
      const lookY = camera.position.y - lookSp * CLOSE_LOOK_DIST;
      const lookZ = camera.position.z - Math.cos(orbit.yaw) * lookCp * CLOSE_LOOK_DIST;
      camera.target.x = targetX + (lookX - targetX) * closeMix;
      camera.target.y = targetY + (lookY - targetY) * closeMix;
      camera.target.z = targetZ + (lookZ - targetZ) * closeMix;
    };
    const dispose = () => {
      resetGroundView();
      restoreHead();
      hud.el.act.hidden = true;
      hud.setAct(ACT_DO);
      controls.dispose();
      crew = fx = null;
    };
    return { orbit, hooks, controls, bind, readInput, update, goPreset, possess, release, action, showAct, dispose, get player() {
      return player();
    }, get mode() {
      return closeWanted ? (player() ? "first-person" : "eye-level") : (player() ? "trailing" : "orbit");
    }, get closeMix() {
      return closeMix;
    }, get closeWanted() {
      return closeWanted;
    }, get groundLift() {
      return groundLift;
    }, get groundView() {
      return groundView;
    }, get groundTarget() {
      return groundTarget;
    }, get viewPitch() {
      return viewPitch;
    } };
  };
  BL.pilot = { create };
})();
