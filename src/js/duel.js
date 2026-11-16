// Duels on the island (duel-rules.js, worker/src/duel.js): pick another player (a click on their Ooga, or Duel under
// their name in Online Oogas), challenge them, and once they accept a flag goes up halfway between you; after a
// countdown, each blow you land with your own weapons is told to the room, which keeps both bars and names the winner.
// Stray more than RADIUS from the flag for OUT_MS and you forfeit; Yield gives up.
// `create` once a hub visit: `update(dt)` each frame after the crew, `shot(cave, from, to)` and `swing(cave, charge)` from
// the crew's hooks, `tap(ray)` for a click in the world, `dispose` when the visit ends or is kept.
(() => {
  "use strict";
  const BL = window.BL;
  const R = BL.duelRules, { createNode, addChild, removeChild } = BL.scene;
  const M = BL.models;
  const FLAG_MAX = 16, FLAG_LINGER = 4, MELEE_REACH = 2.6, MELEE_RISE = 1.8, HEAD_SHARE = 0.78;
  const REASONS = {
    defeat: (w, l) => `${w} has defeated ${l} in a duel!`,
    forfeit: (w, l) => `${l} yielded to ${w}`,
    fled: (w, l) => `${l} fled the duel · ${w} wins`,
    left: (w, l) => `${l} left the duel · ${w} wins`,
  };
  // The visitor's own duel, by how it ended: one they won, against `them`, and one they lost.
  const YOU_WON = {
    defeat: (them) => `You defeated ${them} in a duel!`, forfeit: (them) => `${them} yielded · you win the duel`,
    fled: (them) => `${them} fled the duel · you win`, left: (them) => `${them} left · you win the duel`,
  };
  const YOU_LOST = {
    defeat: (them) => `${them} defeated you in a duel`, forfeit: (them) => `You yielded to ${them}`,
    fled: (them) => `You strayed from the flag · ${them} wins the duel`, left: (them) => `You left the duel · ${them} wins`,
  };
  const REFUSED = {
    offline: "They are not on the island", busy: "One of you is already busy", body: "Both of you need to be driving an Ooga",
    zone: "Duels are fought on the island's surface", arriving: "Still arriving · try again in a moment", far: "Get closer to challenge them", rate: "Slow down", withdrawn: "That challenge is gone",
  };

  let flagGeometry = null;
  const flagParts = () => flagGeometry || (flagGeometry = {
    pole: M.merge(
      M.box({ w: 0.5, h: 0.16, d: 0.5, color: "#6b4a2b", offset: { y: 0.08 } }),
      M.box({ w: 0.09, h: 3.2, d: 0.09, color: "#8a6338", offset: { y: 1.6 } }),
      M.box({ w: 0.18, h: 0.18, d: 0.18, color: "#f2c94c", emissive: 0.6, offset: { y: 3.25 } })),
    cloth: M.merge(
      M.box({ w: 1.3, h: 0.85, d: 0.04, color: "#b3261e", offset: { x: 0.65 } }),
      M.box({ w: 0.36, h: 0.36, d: 0.06, color: "#f2c94c", emissive: 0.35, offset: { x: 0.68 } })),
  });

  let active = null;
  const nameOf = (id) => {
    if (BL.net.state.me && id === BL.net.state.selfId) return "You";
    const rec = BL.net.remotes.get(id);
    return rec ? rec.display || rec.login || "Someone" : "Someone";
  };

  const create = ({ root, remotes, pilot, fx, clear, refusal }) => {
    const net = BL.net, $ = (id) => document.getElementById(id);
    const hudBox = $("duel-hud"), targetBox = $("duel-target"), inviteBox = $("duel-invite");
    const names = hudBox.querySelectorAll(".duel-name"), fills = hudBox.querySelectorAll(".duel-fill"), hps = hudBox.querySelectorAll(".duel-hp");
    const clock = hudBox.querySelector(".duel-clock"), note = hudBox.querySelector(".duel-note");
    const targetName = targetBox.querySelector(".duel-target-name"), inviteText = inviteBox.querySelector(".duel-invite-text");
    const challengeButton = targetBox.querySelector('[data-duel="challenge"]');
    // Flags, one a duel under way anywhere on the island, from a fixed pool sharing two geometries.
    const flags = Array.from({ length: FLAG_MAX }, () => {
      const node = createNode({ visible: false, sightHidden: true, geometry: flagParts().pole });
      const cloth = createNode({ position: { x: 0.05, y: 2.65, z: 0 }, geometry: flagParts().cloth, sightHidden: true });
      addChild(node, cloth);
      return { node, cloth, duel: null, added: false };
    });
    const duels = new Map();
    let mine = null, target = 0, invite = 0, inviteTimer = 0, challenging = 0, unsub = null, clockKey = -2, noteKey = -2, t = 0;
    const hpShown = [-1, -1];
    const HIT = { node: null, owner: null, type: "none", distance: Infinity, x: 0, y: 0, z: 0 };

    const selfId = () => net.state.selfId;
    const feet = (id) => {
      if (id === selfId()) return net.state.self;
      const rec = net.remotes.get(id);
      return rec && rec.poseZone === rec.zone ? rec : null;
    };
    const bodyOf = (id) => id === selfId() ? pilot.player : remotes.body(id);
    const opponent = () => mine ? (mine.a === selfId() ? mine.b : mine.a) : 0;

    const showTarget = () => {
      const on = !!target && !mine && !!net.state.duel;
      targetBox.hidden = !on;
      if (!on) return;
      targetName.textContent = nameOf(target);
      challengeButton.textContent = challenging === target ? "Challenge sent…" : "Duel";
      challengeButton.disabled = challenging === target;
    };
    const showInvite = () => {
      inviteBox.hidden = !invite || !!mine;
      if (!inviteBox.hidden) inviteText.textContent = `${nameOf(invite)} challenges you to a duel!`;
    };
    const closeInvite = () => {
      window.clearTimeout(inviteTimer); inviteTimer = 0;
      invite = 0;
      showInvite();
    };

    const placeFlag = (d) => {
      const f = flags.find((x) => !x.duel);
      if (!f) return;
      const a = feet(d.a), b = feet(d.b);
      const ay = a && Number.isFinite(a.y) ? a.y : NaN, by = b && Number.isFinite(b.y) ? b.y : NaN;
      const y = Number.isFinite(ay) && Number.isFinite(by) ? (ay + by) / 2 : Number.isFinite(ay) ? ay : Number.isFinite(by) ? by : 0;
      f.duel = d; d.flag = f;
      f.node.position.x = d.x; f.node.position.y = y; f.node.position.z = d.z;
      const across = a && b && Number.isFinite(a.x + b.x + a.z + b.z);
      f.node.rotation.y = across ? Math.atan2(b.x - a.x, b.z - a.z) : 0;
      f.node.visible = true;
      if (!f.added) { addChild(root, f.node); f.added = true; }
    };
    const freeFlag = (d) => {
      const f = d.flag;
      if (!f) return;
      f.duel = null; d.flag = null; f.node.visible = false;
      if (f.added) { removeChild(root, f.node); f.added = false; }
    };

    const begin = (msg) => {
      if (!Number.isSafeInteger(msg.id) || duels.has(msg.id) || !Number.isFinite(msg.x) || !Number.isFinite(msg.z) || !Number.isFinite(msg.at)) return;
      const hp = Array.isArray(msg.hp) && msg.hp.length === 2 && msg.hp.every(Number.isFinite) ? msg.hp.slice() : [R.HP, R.HP];
      // The fight's start on this page's clock from the message's own two stamps, so a clock estimate that a slow
      // boot threw off cannot move the countdown.
      const ahead = Number.isFinite(msg.now) ? msg.at - msg.now : msg.at - net.serverNow();
      const d = { id: msg.id, a: msg.a, b: msg.b, x: msg.x, z: msg.z, hp, fightAt: performance.now() + ahead, endT: 0, flag: null, outAt: 0 };
      duels.set(d.id, d);
      placeFlag(d);
      const me = selfId();
      if (d.a === me || d.b === me) {
        mine = d; target = 0; challenging = 0; closeInvite(); showTarget();
        hpShown[0] = hpShown[1] = -1; clockKey = noteKey = -2; note.hidden = true;
        hudBox.hidden = false;
        const [left, right] = d.a === me ? [d.a, d.b] : [d.b, d.a];
        names[0].textContent = nameOf(left); names[1].textContent = nameOf(right);
        BL.hud.toast(`Duel with ${nameOf(opponent())} · stay within ${R.RADIUS} m of the flag`);
      }
    };
    const finish = (d, winner, reason) => {
      if (!d || d.endT) return;
      d.endT = FLAG_LINGER;
      if (!d.flag) duels.delete(d.id);
      const loser = winner ? (winner === d.a ? d.b : d.a) : 0;
      const w = winner && bodyOf(winner), l = loser && bodyOf(loser);
      if (w) fx.say(w, "Victory!", 2.4);
      if (l) fx.say(l, reason === "defeat" ? "I yield!" : "...", 2.4);
      const me = selfId(), mineNow = d === mine;
      if (mineNow) {
        mine = null; hudBox.hidden = true;
        const them = nameOf(winner === me ? loser : winner);
        BL.hud.toast(!winner ? "The duel ends in a draw" : winner === me ? (YOU_WON[reason] || YOU_WON.defeat)(them) : (YOU_LOST[reason] || YOU_LOST.defeat)(them));
      } else if (winner && REASONS[reason]) {
        // Anyone near the flag hears how it went.
        const s = net.state.self;
        if (Number.isFinite(s.x) && Math.hypot(s.x - d.x, s.z - d.z) < 60) BL.hud.toast(REASONS[reason](nameOf(winner), nameOf(loser)));
      }
    };
    const lostAll = () => {
      for (const d of duels.values()) freeFlag(d);
      duels.clear();
      mine = null; hudBox.hidden = true;
      challenging = 0; closeInvite(); showTarget();
    };

    const heard = (msg) => {
      const op = msg.op;
      if (op === "lost") return lostAll();
      if (op === "start") return begin(msg);
      if (op === "list") { if (Array.isArray(msg.duels)) for (const d of msg.duels) if (d && typeof d === "object") begin(d); return; }
      if (op === "hp") {
        const d = duels.get(msg.id);
        if (!d || !Array.isArray(msg.hp) || msg.hp.length !== 2 || !msg.hp.every(Number.isFinite)) return;
        for (let side = 0; side < 2; side++) {
          const dealt = d.hp[side] - msg.hp[side], body = dealt > 0 && bodyOf(side ? d.b : d.a);
          if (body && body.root.visible) {
            const p = body.root.position;
            fx.damageNumber(p.x, p.y - (body.baseY || 0) + (body.bodyHeight || 1.4) + 0.15, p.z, dealt);
          }
          if (dealt > 0 && (side ? d.b : d.a) === selfId() && BL.gamepad) BL.gamepad.rumble(0.6, 0.4, 120);
        }
        d.hp[0] = msg.hp[0]; d.hp[1] = msg.hp[1];
        return;
      }
      if (op === "end") {
        if (msg.id === 0) { if (mine) { const d = mine; finish(d, 0, "lost"); } return; }
        return finish(duels.get(msg.id), Number.isSafeInteger(msg.winner) ? msg.winner : 0, msg.reason);
      }
      if (op === "challenged" && Number.isSafeInteger(msg.from)) {
        if (mine) return net.sendDuel("decline", msg.from);
        invite = msg.from;
        window.clearTimeout(inviteTimer);
        inviteTimer = window.setTimeout(closeInvite, R.INVITE_MS);
        showInvite();
        return;
      }
      if (op === "challenging" && Number.isSafeInteger(msg.to)) {
        challenging = msg.to; showTarget();
        BL.hud.toast(`You challenged ${nameOf(msg.to)} to a duel`);
        return;
      }
      if (op === "refused") {
        if (msg.to === challenging) challenging = 0;
        showTarget();
        BL.hud.toast(REFUSED[msg.reason] || "The duel was refused");
        return;
      }
      if (op === "declined" && msg.from === challenging) {
        challenging = 0; showTarget();
        BL.hud.toast(msg.reason === "left" ? `${nameOf(msg.from)} left` : `${nameOf(msg.from)} declined your duel`);
        return;
      }
      if (op === "withdrawn" && msg.from === invite) closeInvite();
    };

    // Challenge player `id`, or accept their challenge if they sent one.
    const challenge = (id) => {
      if (!net.state.duel) { BL.hud.toast("Sign in to duel other players"); return false; }
      const why = refusal && refusal();
      if (why) { BL.hud.toast(why); return false; }
      if (mine) { BL.hud.toast("Finish this duel first"); return false; }
      if (!Number.isSafeInteger(id) || id <= 0 || id === selfId() || !net.remotes.has(id)) return false;
      if (invite === id) return accept();
      return net.sendDuel("challenge", id);
    };
    const accept = () => {
      const why = refusal && refusal();
      if (why) { BL.hud.toast(why); return false; }
      const from = invite;
      closeInvite();
      return !!from && net.sendDuel("accept", from);
    };
    const decline = () => {
      if (invite) net.sendDuel("decline", invite);
      closeInvite();
    };
    const select = (id) => {
      target = id === selfId() ? 0 : id;
      showTarget();
    };

    const onClick = (e) => {
      const button = e.target.closest("[data-duel]");
      if (!button) return;
      if (e.detail) button.blur();
      const what = button.dataset.duel;
      if (what === "challenge") challenge(target);
      else if (what === "clear") { if (challenging) { net.sendDuel("cancel"); challenging = 0; } select(0); }
      else if (what === "accept") accept();
      else if (what === "decline") decline();
      else if (what === "yield" && mine) net.sendDuel("forfeit");
    };
    document.addEventListener("click", onClick);

    // A click in the world: another player's Ooga under the pointer, nearer than `within`, becomes the target.
    const tap = (ray, within = Infinity) => {
      if (!net.state.duel || !remotes.pick(HIT, ray.ox, ray.oy, ray.oz, ray.dx, ray.dy, ray.dz, within, clear)) return false;
      const id = HIT.owner && HIT.owner.id;
      HIT.node = HIT.owner = null;
      if (!Number.isSafeInteger(id)) return false;
      select(id);
      return true;
    };

    const fighting = () => !!mine && performance.now() >= mine.fightAt;
    // The driven Ooga's banana from `from` to `to`: through the opponent's body, a hit (on the head, a harder one).
    const shot = (cave, from, to) => {
      if (!fighting() || cave !== pilot.player) return;
      const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, len = Math.hypot(dx, dy, dz);
      if (len < 1e-3 || !remotes.pick(HIT, from.x, from.y, from.z, dx / len, dy / len, dz / len, len + 0.3, clear)) return;
      const id = HIT.owner && HIT.owner.id, body = HIT.owner && HIT.owner.cave, y = HIT.y;
      HIT.node = HIT.owner = null;
      if (id !== opponent() || !body) return;
      const base = body.root.position.y - (body.baseY || 0);
      net.sendDuel("hit", 0, y > base + (body.bodyHeight || 1.4) * HEAD_SHARE ? "head" : "shot");
    };
    // The driven Ooga's strike (charge 0 to 1) or gun bash (-1): the opponent within reach takes it.
    const swing = (cave, charge) => {
      if (!fighting() || cave !== pilot.player) return;
      const body = remotes.body(opponent());
      if (!body || !body.root.visible) return;
      const p = cave.root.position, q = body.root.position;
      const reach = MELEE_REACH + (cave.bodyRadius || 0.3) + (body.bodyRadius || 0.3);
      if (Math.hypot(p.x - q.x, p.z - q.z) > reach || Math.abs((p.y - (cave.baseY || 0)) - (q.y - (body.baseY || 0))) > MELEE_RISE) return;
      net.sendDuel("hit", 0, charge < 0 ? "bash" : charge >= 0.5 ? "charged" : "swing");
    };

    const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
    const update = (dt) => {
      if (!unsub) { unsub = net.subscribeDuel(heard); active = api; }
      t += dt;
      const now = performance.now();
      // The flag pool by index: no iterator a frame. A duel with no flag is dropped as it ends (`finish`).
      for (let i = 0; i < flags.length; i++) {
        const d = flags[i].duel;
        if (!d) continue;
        flags[i].cloth.rotation.y = Math.sin(t * 2.3 + d.id) * 0.35;
        if (d.endT && (d.endT -= dt) <= 0) { freeFlag(d); duels.delete(d.id); }
      }
      if (!mine) return;
      const me = mine.a === selfId() ? 0 : 1;
      for (let i = 0; i < 2; i++) {
        const hp = mine.hp[i ? 1 - me : me];
        if (hp !== hpShown[i]) {
          hpShown[i] = hp;
          fills[i].style.width = `${Math.max(0, Math.min(100, hp / R.HP * 100))}%`;
          hps[i].textContent = String(Math.round(hp));
        }
      }
      // Strings are made only when the whole second they show changes.
      const toGo = mine.fightAt - now, sec = toGo > 0 ? Math.ceil(toGo / 1000) : toGo > -900 ? 0 : -1;
      if (sec !== clockKey) { clockKey = sec; setText(clock, sec > 0 ? String(sec) : sec === 0 ? "FIGHT!" : ""); }
      // Past the flag's radius the page counts down for its own player; the room decides.
      const s = net.state.self, out = Number.isFinite(s.x) && Math.hypot(s.x - mine.x, s.z - mine.z) > R.RADIUS;
      if (out && !mine.outAt) mine.outAt = now;
      else if (!out) mine.outAt = 0;
      const left = out ? Math.max(0, Math.ceil((R.OUT_MS - (now - mine.outAt)) / 1000)) : -1;
      if (left !== noteKey) { noteKey = left; note.hidden = left < 0; if (left >= 0) setText(note, `Return to the flag! ${left}`); }
      if (out && now - mine.outAt >= R.OUT_MS) { mine.outAt = now; net.sendDuel("forfeit"); }
      // A duel the room forgot (it slept) ends here too.
      if (now - mine.fightAt > R.MAX_MS + 5000) finish(mine, 0, "draw");
    };

    const dispose = () => {
      if (unsub) { unsub(); unsub = null; }
      if (challenging) net.sendDuel("cancel");
      lostAll();
      target = 0; showTarget();
      hudBox.hidden = targetBox.hidden = inviteBox.hidden = true;
      clockKey = noteKey = -2;
      if (active === api) active = null;
    };
    const destroy = () => {
      dispose();
      document.removeEventListener("click", onClick);
      for (const f of flags) if (f.added) { removeChild(root, f.node); f.added = false; }
    };
    const api = { update, tap, shot, swing, challenge, select, dispose, destroy,
      get target() { return target; }, get duel() { return mine; }, get flags() { return duels.size; } };
    active = api;
    return api;
  };

  BL.duel = {
    create,
    // For Online Oogas: whether a player can be challenged from here, and the challenge.
    offered: (id) => !!active && !!BL.net.state.duel && id !== BL.net.state.selfId,
    challenge: (id) => active ? active.challenge(id) : false,
    get active() { return active; },
  };
})();
