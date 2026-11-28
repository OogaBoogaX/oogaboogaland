// Shared-table presentation only: real human rigs, a solo Clanker and scores anchored to their heads.
// No NPC account, voice peer, simulation authority or extra per-frame room traffic is created here.
(() => {
  "use strict";
  const BL = window.BL, W = BL.hockeyWire;
  const { addChild, removeChild, createNode, boundsOf } = BL.scene;
  const APPROACH_MS = 2400, SCALE = 0.72, DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7"];
  const create = ({ root, games, body, showSelf = false, localSlot = -1 }) => {
    const net = BL.net, bots = [null, null, null], seat = { x: 0, y: 0, z: 0, yaw: 0 };
    const poses = new Array(6).fill(null), target = { x: 0, y: 0, z: 0 };
    // Restore before the crew/remote animator runs, so a departure, body switch or scene exit cannot keep
    // a hockey lean or overwrite the first ordinary walking pose. Six reusable records cover all seats.
    const restore = () => {
      for (const rec of poses) if (rec?.applied) {
        for (const saved of rec.parts) {
          const n = saved.node, a = saved.values;
          n.position.x = a[0]; n.position.y = a[1]; n.position.z = a[2];
          n.rotation.x = a[3]; n.rotation.y = a[4]; n.rotation.z = a[5];
          n.quaternion = saved.quaternion; n.poseYaw = a[6]; n.poseLean = a[7];
        }
        for (const saved of rec.gear) saved.node.visible = saved.visible;
        rec.applied = false;
      }
    };
    const reach = (slot, cave, game, side, end, dt) => {
      if (!cave?.root.visible || !cave.parts.fingersR || !cave.parts.torso || !game?.mallet) return;
      let rec = poses[slot];
      if (!rec || rec.cave !== cave) {
        rec = poses[slot] = { cave, leg: cave.baseY === undefined ? cave.root.position.y : cave.baseY, applied: false, footX: NaN, footZ: NaN, step: 0,
          parts: [cave.root, ...["torso", "head", "legL", "legR", "armL", "armR", "forearmR"].map(key => cave.parts[key]).filter(Boolean)].map(node => ({ node, values: new Float64Array(8), quaternion: null })),
          gear: ["gun", "club", "snack"].filter(key => cave.parts[key]).map(key => ({ node: cave.parts[key], visible: false })), aim: BL.math.quat.create() };
      }
      for (const saved of rec.parts) {
        const n = saved.node, a = saved.values;
        a[0] = n.position.x; a[1] = n.position.y; a[2] = n.position.z;
        a[3] = n.rotation.x; a[4] = n.rotation.y; a[5] = n.rotation.z;
        a[6] = n.poseYaw; a[7] = n.poseLean; saved.quaternion = n.quaternion;
        n.quaternion = null; n.poseYaw = n.poseLean = 0;
      }
      game.mallet(side, target);
      const center = W.TABLES[slot >> 1], sign = end ? -1 : 1;
      const halfW = BL.arcadeModels.HOCKEY.d * W.SCALE / 2, halfL = BL.arcadeModels.HOCKEY.w * W.SCALE / 2;
      const arm = cave.parts.armR, leg = rec.leg, shoulder = leg + arm.position.y;
      const hand = cave.modelled ? (Math.hypot(cave.elbow.y, cave.elbow.z) + cave.elbow.length) * cave.armScale * 0.9994
        : -cave.parts.fingersR.position.y, across = arm.position.x, height = target.y;
      const shoulderRadius = Math.hypot(shoulder, arm.position.z);
      // Move along the outside of this half. Offset the feet along a rail at short reach, so the
      // authored arm can keep its palm on the handle without shrinking or stretching.
      const stand = Math.sqrt(across * across + Math.max(0, hand * hand - (height - shoulder) ** 2)) + 0.04;
      const tx = target.x - center[0], tz = sign * (target.z - center[1]), rimX = halfW + 0.14, rimZ = halfL + 0.14;
      const gap = rimZ - tz, offset = Math.sqrt(Math.max(0, stand * stand - gap * gap));
      const continuous = rec.end === end && rec.session === net.hockeyTables[slot >> 1]?.s && Number.isFinite(rec.footX);
      const previousX = rec.footX - center[0], previousZ = sign * (rec.footZ - center[1]);
      const maximum = (shoulderRadius + hand) ** 2 - height * height + across * across;
      // Both ends of the comfortable reach circle are valid. Keep the nearby one when the
      // mallet crosses the centre instead of flipping the Ooga across the rail each frame.
      let fx = tx + (continuous ? previousX < tx ? -1 : 1 : tx > 0 ? -1 : 1) * offset, fz = rimZ;
      let distance = (fx - tx) ** 2 + (fz - tz) ** 2;
      let cost = distance > maximum ? Infinity : continuous ? (fx - previousX) ** 2 + (fz - previousZ) ** 2 : distance;
      for (let rail = -1; rail <= 1; rail += 2) {
        const x = rail * rimX, dx = x - tx;
        const z = Math.max(Math.abs(across) + 0.05, Math.min(rimZ, tz + Math.sqrt(Math.max(0, stand * stand - dx * dx))));
        const d = dx * dx + (z - tz) ** 2;
        const nextCost = continuous ? (x - previousX) ** 2 + (z - previousZ) ** 2 : d;
        if (d >= stand * stand - 1e-8 && d <= maximum && nextCost < cost) { fx = x; fz = z; distance = d; cost = nextCost; }
      }
      // Small reversals need no step while the previous feet remain in the rigid arm's reach.
      // An unreachable cursor jump still moves the body immediately; the mallet is never delayed.
      const previousDistance = (previousX - tx) ** 2 + (previousZ - tz) ** 2;
      if (continuous && previousDistance >= stand * stand && previousDistance <= maximum - 1e-6) {
        fx = previousX; fz = previousZ; distance = previousDistance;
      }
      rec.end = end; rec.session = net.hockeyTables[slot >> 1]?.s;
      fx += center[0]; fz = center[1] + sign * fz;
      const dx = target.x - fx, dz = target.z - fz;
      const forward = Math.sqrt(Math.max(0, distance - across * across));
      const yaw = Math.atan2(dx, dz) - Math.atan2(across, forward);
      // Two rigid links: ankle-to-shoulder, then shoulder-to-palm. Lean the connected body at
      // the ankle and solve the arm angle; measuring the actual palm below catches detached hands.
      const radius = Math.hypot(forward, height);
      const cosine = (radius * radius + shoulderRadius * shoulderRadius - hand * hand) / (2 * radius * shoulderRadius);
      const lean = Math.atan2(forward, height) - Math.acos(Math.max(-1, Math.min(1, cosine))) - Math.atan2(arm.position.z, shoulder);
      const c = Math.cos(yaw), sn = Math.sin(yaw), cl = Math.cos(lean), sl = Math.sin(lean), p = cave.root.position;
      p.x = fx + sn * leg * sl; p.y = leg * cl; p.z = fz + c * leg * sl;
      cave.root.rotation.x = lean; cave.root.rotation.y = yaw; cave.root.rotation.z = 0;
      const rx = target.x - p.x, ry = target.y - p.y, rz = target.z - p.z, z = sn * rx + c * rz;
      const ax = c * rx - sn * rz - arm.position.x, ay = cl * ry + sl * z - arm.position.y, az = -sl * ry + cl * z - arm.position.z;
      const length = Math.hypot(ax, ay, az) || 1, q = rec.aim;
      if (cave.modelled) {
        // The shared rig solver places the hand through its elbow, including authored arm scale.
        if (!BL.crew.reachArm(cave, arm, cave.parts.forearmR, q, ax + arm.position.x, ay + arm.position.y, az + arm.position.z, -1, -0.4, 0))
          BL.crew.reachArm(cave, arm, cave.parts.forearmR, q, ax + arm.position.x, ay + arm.position.y, az + arm.position.z, 0, 0, 1);
      } else {
        q[0] = -az / length; q[1] = 0; q[2] = ax / length; q[3] = 1 - ay / length;
        if (Math.hypot(q[0], q[2], q[3]) < 1e-6) { q[0] = 1; q[3] = 0; }
        BL.math.quat.normalize(q); arm.quaternion = q;
      }
      cave.parts.torso.rotation.x = cave.parts.torso.rotation.y = cave.parts.torso.rotation.z = 0;
      cave.parts.head.rotation.x = -lean * 0.7;
      cave.parts.armL.rotation.x = -0.6; cave.parts.armL.rotation.y = cave.parts.armL.rotation.z = 0;
      // A bounded sidestep on moving frames; no clock, timer or network pose is added.
      const moved = Number.isFinite(rec.footX) ? Math.hypot(fx - rec.footX, fz - rec.footZ) : 0;
      rec.step += Math.min(moved, dt * 3) * 9; rec.footX = fx; rec.footZ = fz;
      const stride = Math.sin(rec.step) * Math.min(0.12, moved * 2);
      cave.parts.legL.rotation.x = stride; cave.parts.legR.rotation.x = -stride;
      for (const saved of rec.gear) { saved.visible = saved.node.visible; saved.node.visible = false; }
      rec.applied = true;
    };
    let own = null, ownName = null, ownBase = 0;
    const dropOwn = () => { if (own) removeChild(root, own.root); own = ownName = null; };
    // Only the game scene owns a local hockey rig. A cached table can still name a visitor who has
    // already returned to the hall; never pose their walking body while the leave reply is pending.
    const human = id => id === net.state.selfId ? own : body(id);
    const update = dt => {
      const name = showSelf && net.state.me ? net.state.body : null;
      if (name !== ownName) {
        dropOwn();
        if (name && !name.startsWith("gorilla:")) {
          ownName = name; own = BL.models.caveman(BL.contributors.traitsFor(name)); ownBase = own.root.position.y;
          for (const key of ["snack", "gun", "club", "jetpack", "jetFlame", "lion", "board"]) if (own.parts[key]) own.parts[key].visible = false;
          own.root.sightHidden = true; addChild(root, own.root);
        }
      }
      if (own) own.root.visible = false;
      const now = net.serverNow();
      for (let i = 0; i < 3; i++) {
        const t = net.hockeyTables[i], active = t && (t.phase === "play" || t.phase === "done");
        if (t && own) {
          const side = t.ids.indexOf(net.state.selfId);
          if (side >= 0) { W.seat(i, side ^ (t.e === 1 ? 1 : 0), 0, seat); own.root.visible = true; own.root.position.x = seat.x; own.root.position.y = ownBase; own.root.position.z = seat.z; own.root.rotation.y = seat.yaw; }
        }
        if (active) for (let side = 0; side < 2; side++) if (t.ids[side]) reach(i * 2 + side, human(t.ids[side]), games[i], side, side ^ (t.e === 1 ? 1 : 0), dt);
        if (!active || t.ids[1]) { if (bots[i]) { bots[i].rig.dispose(); bots[i] = null; } }
        else {
          let b = bots[i];
          if (!b || b.session !== t.s) {
            if (b) b.rig.dispose();
            const rig = BL.agent.create({ managed: true, groundAt: () => 0, scale: SCALE });
            rig.root.sightHidden = true;
            addChild(rig.parts.head, createNode({ geometry: BL.arcadeModels.staffHat(0) }));
            addChild(root, rig.root);
            b = bots[i] = { rig, session: t.s, start: t.start || now };
          }
          // A short clear route behind the far rail, in from the central aisle. All viewers use server start time.
          const center = W.TABLES[i], sign = center[0] < 0 ? 1 : -1;
          const k = Math.max(0, Math.min(1, (now - b.start) / APPROACH_MS)), walk = Math.min(1, k / 0.8);
          const across = (games[i]?.rivalU || 0) * (t.e === 1 ? -1 : 1), x = center[0] + sign * 1.5 * (1 - walk) + across * W.SCALE * 0.65 * walk;
          const z = center[1] + (t.e === 1 ? W.SEAT : -W.SEAT), facing = (t.e === 1 ? Math.PI : 0) - sign * Math.PI / 2 * (1 - Math.max(0, (k - 0.8) / 0.2));
          b.rig.poseManaged(dt, x, 0, z, facing, walk < 1 ? 0.8 : 0, false, true);
          if (k === 1) {
            b.rig.parts.armR.rotation.x = -0.85;
            b.rig.parts.armR.rotation.z = Math.max(-0.5, Math.min(0.5, across));
          }
        }
      }
    };
    // Like the existing nameplates, use the projected head silhouette, not a fixed character-height guess.
    let left = 0, right = 0, top = 0;
    const head = (node, project) => {
      if (!node.visible) return;
      if (node.geometry) {
        const b = boundsOf(node.geometry), m = node.world;
        for (let j = 0; j < 8; j++) {
          const x = b[j & 1 ? "max" : "min"][0], y = b[j & 2 ? "max" : "min"][1], z = b[j & 4 ? "max" : "min"][2];
          const p = project(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
          if (p) { left = Math.min(left, p.x); right = Math.max(right, p.x); top = Math.min(top, p.y); }
        }
      }
      for (const child of node.children) head(child, project);
    };
    const draw = (ctx, project) => {
      ctx.save(); ctx.font = showSelf ? "bold 22px monospace" : "bold 26px monospace"; ctx.textAlign = "center"; ctx.textBaseline = showSelf ? "middle" : "bottom"; ctx.lineJoin = "round"; ctx.lineWidth = showSelf ? 4 : 5; ctx.strokeStyle = "#17120d";
      for (let i = 0; i < 3; i++) {
        const t = net.hockeyTables[i];
        if (!t || t.phase === "lobby" || showSelf && i !== localSlot) continue;
        const a = t.ids[0] === net.state.selfId && games[i]?.playing ? games[i].capture() : t.a;
        for (let side = 0; side < 2; side++) {
          const score = DIGITS[a ? a[8 + side] : 0];
          ctx.fillStyle = side ? "#ffcf78" : "#fff5dc";
          if (showSelf) {
            // Center small digits inside the goal half-circle, behind the resting mallet.
            const H = BL.arcadeModels.HOCKEY, center = W.TABLES[i];
            const sign = (side ^ (t.e === 1 ? 1 : 0)) ? -1 : 1;
            const p = project(center[0], H.y + 0.01, center[1] + sign * (H.w / 2 - 0.075) * W.SCALE);
            if (p) { ctx.strokeText(score, Math.round(p.x), Math.round(p.y)); ctx.fillText(score, Math.round(p.x), Math.round(p.y)); }
            continue;
          }
          const cave = t.ids[side] ? human(t.ids[side]) : bots[i]?.rig;
          if (!cave || !cave.root.visible) continue;
          left = top = Infinity; right = -Infinity; head(cave.parts.head, project);
          if (!Number.isFinite(top)) continue;
          const x = Math.round((left + right) / 2), y = Math.round(top) - 34;
          ctx.strokeText(score, x, y); ctx.fillText(score, x, y);
        }
      }
      ctx.restore();
    };
    return { update, draw, restore,
      liveGeometry(set) { if (own) set.add(own.headOpen).add(own.headClosed); for (const b of bots) if (b) b.rig.liveGeometry(set); },
      dispose() { restore(); dropOwn(); for (const b of bots) if (b) b.rig.dispose(); bots.fill(null); poses.fill(null); }
    };
  };
  BL.hockeyPlayers = { create };
})();
