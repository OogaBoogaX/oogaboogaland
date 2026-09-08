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
  // The camera swings behind while walking forward
  const FOLLOW_TURN = 1.8, DRAG_HOLD = 1.5;
  // Act button labels, action or jetpack throttle
  const ACT_DO = "Ooga!", ACT_FLY = "Blast off!";
  const create = (ctx) => {
    const { renderer, canvas, camera, hud, presets, pitch: [PITCH_MIN, PITCH_MAX], dist: [DIST_MIN, DIST_MAX], follow, fly, clampTarget, clampCamera, coarse } = ctx;
    let crew = null, fx = null;
    const freeTarget = { x: 0, y: 0, z: 0 };
    const followTarget = { x: 0, y: 0, z: 0 };
    const view = presets[ctx.landing];
    const orbit = { ...view, tYaw: view.yaw, tPitch: view.pitch, tDist: view.dist, tx: view.target.x, ty: view.target.y, tz: view.target.z };
    const bind = (systems) => {
      crew = systems.crew;
      fx = systems.fx;
    };
    const player = () => crew ? crew.player : null;
    // ---------- possession ----------
    // Relabel the act button for what the press does
    const showAct = () => {
      const cave = player();
      if (cave) hud.setAct(cave.jet ? ACT_FLY : ACT_DO);
    };
    const possess = (cave) => {
      if (!crew.control(cave)) return;
      orbit.tDist = clamp(orbit.tDist, follow.min, follow.max);
      orbit.tPitch = clamp(orbit.tPitch, follow.pitch[0], follow.pitch[1]);
      hud.el.act.hidden = false;
      showAct();
      hud.tooltip.hide();
      fx.say(cave, "Ooga? Me?", 1.6);
      if (cave.jet) hud.hint(coarse ? "Left stick flies · hold Blast off to climb · double-tap to let go" : "WASD flies · hold Space to climb · Escape to let go");
      else hud.hint(coarse ? "Left stick walks · Ooga! acts · double-tap to let go" : "WASD or both mouse buttons to walk · Space to act · Escape to let go");
    };
    const release = (quiet = false) => {
      const cave = player();
      if (!cave) return;
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
    let dragHold = 0;
    const hooks = {
      onOrbit: (dx, dy) => {
        dragHold = DRAG_HOLD;
        orbit.tYaw -= dx * 4e-3;
        orbit.tPitch = clamp(orbit.tPitch + dy * 3.5e-3, PITCH_MIN, PITCH_MAX);
      },
      onZoom: (factor) => {
        orbit.tDist = clamp(orbit.tDist * factor, DIST_MIN, DIST_MAX);
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
        crew.steer(fx0 * a.y + rx * a.x, fz0 * a.y + rz * a.x);
        if (dragHold > 0) dragHold -= dt;
        else if (a.y > 0.05 && !a.yaw) {
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
      if (a.yaw) orbit.tYaw += a.yaw * YAW_RATE * dt;
      if (a.pitch) orbit.tPitch = clamp(orbit.tPitch + a.pitch * PITCH_RATE * dt, PITCH_MIN, PITCH_MAX);
    };
    // The camera moves only on input, no drift
    const update = (dt) => {
      orbit.yaw = damp(orbit.yaw, orbit.tYaw, 14, dt);
      orbit.pitch = damp(orbit.pitch, orbit.tPitch, 14, dt);
      orbit.dist = damp(orbit.dist, orbit.tDist, 8, dt);
      orbit.tx = damp(orbit.tx, orbit.target.x, 5, dt);
      orbit.ty = damp(orbit.ty, orbit.target.y, 5, dt);
      orbit.tz = damp(orbit.tz, orbit.target.z, 5, dt);
      const { width, height } = renderer.size;
      const aspect = width / Math.max(1, height);
      camera.fov = clamp(2 * Math.atan(Math.tan(MIN_HFOV / 2) / aspect), BASE_FOV, MAX_FOV);
      const portrait = clamp(1 - aspect, 0, 0.6);
      const cp = Math.cos(orbit.pitch), sp = Math.sin(orbit.pitch);
      camera.target.x = orbit.tx;
      camera.target.y = orbit.ty - portrait * 0.6;
      camera.target.z = orbit.tz;
      camera.position.x = orbit.tx + Math.sin(orbit.yaw) * cp * orbit.dist;
      camera.position.y = orbit.ty + sp * orbit.dist;
      camera.position.z = orbit.tz + Math.cos(orbit.yaw) * cp * orbit.dist;
      clampCamera(camera.position);
    };
    const dispose = () => {
      hud.el.act.hidden = true;
      hud.setAct(ACT_DO);
      controls.dispose();
      crew = fx = null;
    };
    return { orbit, hooks, controls, bind, readInput, update, goPreset, possess, release, action, showAct, dispose, get player() {
      return player();
    } };
  };
  BL.pilot = { create };
})();
