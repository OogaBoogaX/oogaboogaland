// One visit's shared hockey seat. All transport stays on the page's existing authenticated room socket.
(() => {
  "use strict";
  const BL = window.BL, W = BL.hockeyWire;
  const create = ({ slot, play, aim, lobby, start, end, closed, sideChanged, preferredEnd = 0 }) => {
    const net = BL.net;
    let table = null, side = -1, flip = preferredEnd, lastQ = -1, q = 0, peerAt = 0, beat = 0, sent = 0, active = false, finished = false, dead = false, joined = false, joinWait = 0, joinElapsed = 0;
    const pose = { x: 0, y: 0, z: 0, yaw: 0 }, path = [];
    let discontinuity = 0, lastInputQ = -1, peerStale = false;
    // Fixed-size buffer: on overload drop the unrepresentable path, and tell the host to
    // resynchronize without inventing a collision along the missing movement.
    const point = (x, depth) => {
      if (!active || dead) return;
      if (side === 0) { if (play.localPoint) play.localPoint(x, depth); return; }
      if (side !== 1) return;
      x = Math.round(x * 1000); depth = Math.round(depth * 1000);
      if (path.length && path[path.length - 2] === x && path[path.length - 1] === depth) return;
      // Coalesce exactly collinear, same-direction samples only. This keeps high-polling straight
      // strokes compact without inventing a new segment or dropping a reversal.
      if (path.length >= 4) {
        const i = path.length - 4, du = path[i + 2] - path[i], dv = path[i + 3] - path[i + 1];
        const eu = x - path[i + 2], ev = depth - path[i + 3];
        if (du * ev === dv * eu && du * eu + dv * ev >= 0) { path[i + 2] = x; path[i + 3] = depth; return; }
      }
      if (path.length === 12) { path.length = 0; discontinuity = 1; }
      path.push(x, depth);
    };
    const command = k => net.sendHockey({ k, i: slot, s: table?.s });
    const receive = m => {
      if (dead) return;
      if (m.k === "lost") { dead = true; closed("Connection lost — return to the Arcade to join again."); return; }
      if (m.i !== slot) return;
      if (m.k === "busy") { dead = true; closed("This table is playing. Return to the Arcade to watch."); return; }
      if (m.k === "table") {
        if (m.phase === "closed") {
          if (table && (!m.s || m.s === table.s)) { dead = true; active = false; if (!finished) closed("A player left. The match ended for both players. Return to the Arcade to join again."); }
          return;
        }
        const nextSide = m.ids.indexOf(net.state.selfId);
        if (nextSide < 0) return;
        if (table && m.s !== table.s) return;
        table = m;
        const nextFlip = m.e === 1 ? 1 : 0;
        if (side !== nextSide || flip !== nextFlip) { side = nextSide; flip = nextFlip; play.orientation?.(flip); sideChanged(side, flip); }
        if (m.phase === "lobby") lobby(m.ids[1] ? (m.ready[side] ? "Ready — waiting for the other player." : "Two players seated. Both press Face off to begin.") : "Waiting for another Ooga. Face off starts solo against a Clanker.");
        if (m.phase === "play" && !active) { active = true; play.shared(true); play.multiplayer(!!m.ids[1], side); start(); }
        if (m.a && side === 1 && m.q > lastQ) { lastQ = m.q; play.receive(m.a, side); }
        if (m.phase === "done" && side === 1 && active) { active = false; finished = true; end(m.a[15]); }
      } else if (m.s === table?.s && m.k === "frame" && side === 1 && m.q > lastQ && W.validFrame(m.a)) {
        lastQ = m.q; play.receive(m.a, side);
        if (!m.a[16] && active) { active = false; finished = true; end(m.a[15]); }
      } else if (m.s === table?.s && m.k === "input" && side === 0 && m.q > lastInputQ) {
        const input = W.parse(m);
        if (!input) return;
        const now = performance.now(), gap = input.q > lastInputQ + 1;
        const stalled = peerAt > 0 && now - peerAt > 500;
        lastInputQ = input.q; peerAt = now;
        if (play.peerPath) play.peerPath(input.p || [input.x, input.y], input.d === 1 || gap || peerStale || stalled);
        else play.peerInput(input.x / 1000, input.y / 1000);
        peerStale = false;
      }
    };
    const off = net.subscribeHockey(receive);
    const reportPose = () => {
      W.seat(slot, side < 0 ? preferredEnd : side ^ flip, 0, pose);
      net.sendPose(pose.x, pose.y, pose.z, pose.yaw);
    };
    reportPose();
    return {
      get side() { return side; }, get table() { return table; }, get dead() { return dead; },
      get follower() { return side === 1; }, get human() { return !!table?.ids[1]; },
      point,
      ready: () => { if (table && !dead) command("ready"); },
      act: () => { if (!active || dead) return false; if (table?.ids[1]) return false; play.act(); return true; },
      tick(dt, playing) {
        if (dead) return;
        reportPose();
        if (!table && net.state.room === "live") {
          joinElapsed += dt; joinWait -= dt;
          if (joinElapsed >= 10) { net.sendHockey({ k: "cancel", i: slot }); dead = true; closed("Could not reserve this table — return to the Arcade and try again."); return; }
          if (joinWait <= 0) { joined = net.sendHockey({ k: "join", i: slot, e: preferredEnd }) || joined; joinWait = 1; }
        }
        beat += dt; sent += dt;
        if (table && beat >= 2) { beat = 0; command("beat"); }
        if (side === 0 && peerAt && performance.now() - peerAt > 500) { play.peerIdle(); peerAt = 0; peerStale = true; }
        if (table && active && playing && sent >= (side === 1 ? 1 / W.INPUT_HZ : 1 / W.HZ)) {
          sent = 0;
          if (side === 1) {
            const x = Math.round(aim.x * 1000), y = Math.round(aim.depth * 1000);
            // The path endpoint and current target must agree, including if another input source changed aim.
            if (path.length && (path[path.length - 2] !== x || path[path.length - 1] !== y)) point(aim.x, aim.depth);
            const input = { k: "input", i: slot, s: table.s, q, x, y };
            if (path.length) { input.p = path; input.d = discontinuity; }
            if (net.sendHockey(input)) { q++; path.length = 0; discontinuity = 0; }
          } else net.sendHockey({ k: "frame", i: slot, s: table.s, q: q++, a: play.capture() });
        }
      },
      finish() { if (side === 0 && table && active) { net.sendHockey({ k: "frame", i: slot, s: table.s, q: q++, a: play.capture() }); active = false; finished = true; } },
      dispose() { if (!dead) { if (table) command("leave"); else if (joined) net.sendHockey({ k: "cancel", i: slot }); } dead = true; off(); }
    };
  };
  // Hall observers subscribe once per scene visit and use the very same game nodes and table transform.
  const watch = games => {
    const net = BL.net, seq = [-1, -1, -1], sessions = [null, null, null], checked = [false, false, false];
    let elapsed = 0, wait = 0, next = 0, expired = false;
    const receive = m => {
      if (m.k === "lost") { for (const g of games) g.stop(); sessions.fill(null); seq.fill(-1); checked.fill(false); elapsed = wait = next = 0; expired = false; return; }
      if (!games[m.i]) return;
      const g = games[m.i];
      if (m.k === "table") {
        if (m.phase === "closed") { if (!m.s || m.s === sessions[m.i]) { checked[m.i] = true; g.stop(); sessions[m.i] = null; seq[m.i] = -1; } return; }
        checked[m.i] = true;
        if (sessions[m.i] !== m.s) { sessions[m.i] = m.s; seq[m.i] = -1; g.stop(); }
        g.orientation?.(m.e === 1 ? 1 : 0);
      }
      if (m.s === sessions[m.i] && m.q > seq[m.i] && W.validFrame(m.a)) { checked[m.i] = true; seq[m.i] = m.q; g.receive(m.a); }
    };
    const off = net.subscribeHockey(receive);
    for (const m of net.hockeyTables) if (m) receive(m);
    checked.fill(false);
    return { dispose: off, update(dt) {
      // Bounded retries recover late snapshots denied by admission/replay budgets, using the scene clock.
      if (net.state.room !== "live") return;
      elapsed += dt; wait -= dt;
      if (elapsed > 12) {
        if (!expired) for (let i = 0; i < 3; i++) if (!checked[i] && games[i]) { games[i].stop(); sessions[i] = null; seq[i] = -1; }
        expired = true; return;
      }
      if (wait > 0) return;
      for (let n = 0; n < 3; n++) { const i = next++ % 3; if (!checked[i]) { net.sendHockey({ k: "watch", i }); wait = 1.1; break; } }
    } };
  };
  BL.hockeySession = { create, watch };
})();
