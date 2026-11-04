// Shared-table presentation only: real human rigs, a solo Clanker and scores anchored to their heads.
// No NPC account, voice peer, simulation authority or extra per-frame room traffic is created here.
(() => {
  "use strict";
  const BL = window.BL, W = BL.hockeyWire;
  const { addChild, removeChild, createNode, boundsOf } = BL.scene;
  const APPROACH_MS = 2400, SCALE = 0.72, DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7"];
  const create = ({ root, games, body, showSelf = false, localSlot = -1 }) => {
    const net = BL.net, bots = [null, null, null], seat = { x: 0, y: 0, z: 0, yaw: 0 };
    let own = null, ownName = null, ownBase = 0;
    const dropOwn = () => { if (own) removeChild(root, own.root); own = ownName = null; };
    const human = id => id === net.state.selfId && own ? own : body(id);
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
    return { update, draw,
      liveGeometry(set) { if (own) set.add(own.headOpen).add(own.headClosed); for (const b of bots) if (b) b.rig.liveGeometry(set); },
      dispose() { dropOwn(); for (const b of bots) if (b) b.rig.dispose(); bots.fill(null); }
    };
  };
  BL.hockeyPlayers = { create };
})();
