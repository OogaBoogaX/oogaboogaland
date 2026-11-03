// One visit's shared hockey seat. All transport stays on the page's existing authenticated room socket.
(() => {
  "use strict";
  const BL = window.BL, W = BL.hockeyWire;
  const create = ({ slot, play, aim, lobby, start, end, closed, sideChanged }) => {
    const net = BL.net;
    let table = null, side = -1, lastQ = -1, q = 0, peerAt = 0, beat = 0, sent = 0, active = false, finished = false, dead = false, joined = false, joinWait = 0, joinElapsed = 0;
    const pose = { x: 0, y: 0, z: 0, yaw: 0 };
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
        if (side !== nextSide) { side = nextSide; sideChanged(side); }
        if (m.phase === "lobby") lobby(m.ids[1] ? (m.ready[side] ? "Ready — waiting for the other player." : "Two players seated. Both press Face off to begin.") : "Waiting for another Ooga. Face off starts solo against a Clanker.");
        if (m.phase === "play" && !active) { active = true; play.shared(true); play.multiplayer(!!m.ids[1]); start(); }
        if (m.a && side === 1 && m.q > lastQ) { lastQ = m.q; play.receive(m.a, side); }
        if (m.phase === "done" && side === 1 && active) { active = false; finished = true; end(m.a[15]); }
      } else if (m.s === table?.s && m.k === "frame" && side === 1 && m.q > lastQ && W.validFrame(m.a)) {
        lastQ = m.q; play.receive(m.a, side);
        if (!m.a[16] && active) { active = false; finished = true; end(m.a[15]); }
      } else if (m.s === table?.s && m.k === "input" && side === 0) {
        peerAt = performance.now();
        play.peerInput(m.x / 1000, m.y / 1000);
      }
    };
    const off = net.subscribeHockey(receive);
    const reportPose = () => {
      W.seat(slot, Math.max(0, side), 0, pose);
      net.sendPose(pose.x, pose.y, pose.z, pose.yaw);
    };
    reportPose();
    return {
      get side() { return side; }, get table() { return table; }, get dead() { return dead; },
      get follower() { return side === 1; }, get human() { return !!table?.ids[1]; },
      ready: () => { if (table && !dead) command("ready"); },
      act: () => { if (!active || dead) return false; if (table?.ids[1]) return false; play.act(); return true; },
      tick(dt, playing) {
        if (dead) return;
        reportPose();
        if (!table && net.state.room === "live") {
          joinElapsed += dt; joinWait -= dt;
          if (joinElapsed >= 10) { net.sendHockey({ k: "cancel", i: slot }); dead = true; closed("Could not reserve this table — return to the Arcade and try again."); return; }
          if (joinWait <= 0) { joined = net.sendHockey({ k: "join", i: slot }) || joined; joinWait = 1; }
        }
        beat += dt; sent += dt;
        if (table && beat >= 2) { beat = 0; command("beat"); }
        if (side === 0 && peerAt && performance.now() - peerAt > 500) { play.peerIdle(); peerAt = 0; }
        if (table && active && playing && sent >= (side === 1 ? 1 / W.INPUT_HZ : 1 / W.HZ)) {
          sent = 0;
          net.sendHockey(side === 1 ? { k: "input", i: slot, s: table.s, q: q++, x: Math.round(aim.x * 1000), y: Math.round(aim.depth * 1000) } : { k: "frame", i: slot, s: table.s, q: q++, a: play.capture() });
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
