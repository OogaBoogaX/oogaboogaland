// Duels on the island (duel-rules.js, worker/src/duel.js): pick another player (a click on their Ooga, or Duel under
// their name in Online Oogas) and challenge them, or land a blow on them, which challenges them too; once they accept
// (or hit back) a flag goes up halfway between you and both rifles are filled; after a countdown shown large, each blow
// you land with your own weapons is told to the room, which keeps both bars and names the winner. Both bars stand over
// the duelists' heads on every page. A blow taken flashes the screen's edge red and points an arrow at where it came
// from. The loser stands stunned STUN_MS under circling birds (the crew's own stun for the visitor's Ooga; over another
// page's, and across the visitor's own first-person view, birds drawn on the overlay), and both read how it ended in
// large letters.
// Stray more than RADIUS from the flag for OUT_MS and you forfeit; Yield gives up.
// `create` once a hub visit: `update(dt)` each frame after the crew, `draw(ctx, project)` in the overlay after the
// nameplates, `shot(cave, from, to)` and `swing(cave, charge)` from the crew's hooks, `tap(ray)` for a click in the
// world, `dispose` when the visit ends or is kept.
(() => {
  "use strict";
  const BL = window.BL;
  const R = BL.duelRules, { createNode, addChild, removeChild } = BL.scene;
  const M = BL.models;
  const FLAG_MAX = 16, FLAG_LINGER = 4, MELEE_REACH = 2.6, MELEE_RISE = 1.8, HEAD_SHARE = 0.78;
  // A blow landed outside a duel challenges at most once every PROVOKE_MS.
  const PROVOKE_MS = 2500;
  // The bar over a duelist's head, in CSS pixels: its size, how far over the nameplate (or the bare head) it stands,
  // and how fast the bar shown follows the health it stands for (points a second). A bar is green, amber under half
  // and orange under a quarter (`level`, the HUD's bars too), with what a blow just took left red behind it: the chip
  // holds CHIP_HOLD seconds, then follows over CHIP_EASE, the same times as the HUD's chip in style.css (.duel-chip).
  const BAR_W = 84, BAR_H = 9, BAR_GAP = 7, BAR_EASE = 270, BAR_ROOM = BAR_H + BAR_GAP + 4, CHIP_HOLD = 0.35, CHIP_EASE = 0.7;
  const BAR_EDGE = "rgba(20, 14, 8, 0.9)", BAR_TRACK = "rgba(0, 0, 0, 0.6)", BAR_HIGH = "#4ade80", BAR_MID = "#f2c94c", BAR_LOW = "#ff9a3d", BAR_CHIP = "#e0261b";
  // The arrow toward a blow's source: how many at once, how long each shows, and its ring's share of the view.
  const ARROW_MAX = 4, ARROW_LIFE = 1.4, ARROW_RING = 0.24;
  const level = (hp) => hp > R.HP / 2 ? "high" : hp > R.HP / 4 ? "mid" : "low";
  // The overlay's birds over a stunned loser's bar: how much room they take over it, in CSS pixels.
  const BIRD_ROOM = 30;
  const STUN_MAX = 8, COUNT_TEXT = ["FIGHT!", "1", "2", "3"];
  const CALM = window.matchMedia("(prefers-reduced-motion: reduce)");
  const CENTRE = "translate(-50%, -50%)";
  // Keyframes of the page's own three animations (the count, the blow's flash, the result), calm and not.
  const POP = [{ opacity: 0, transform: `${CENTRE} scale(1.7)` }, { opacity: 1, transform: `${CENTRE} scale(1)`, offset: 0.22 },
    { opacity: 1, transform: `${CENTRE} scale(1)`, offset: 0.75 }, { opacity: 0, transform: `${CENTRE} scale(0.92)` }];
  const FADE = [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }];
  const RESULT_IN = [{ opacity: 0, transform: `${CENTRE} scale(0.6)` }, { opacity: 1, transform: `${CENTRE} scale(1.08)`, offset: 0.07 },
    { opacity: 1, transform: `${CENTRE} scale(1)`, offset: 0.12 }, { opacity: 1, transform: `${CENTRE} scale(1)`, offset: 0.88 }, { opacity: 0, transform: `${CENTRE} scale(1)` }];
  const FLASH = [{ opacity: 1 }, { opacity: 0 }], FLASH_SOFT = [{ opacity: 0.55 }, { opacity: 0 }];
  const COUNT_MS = 950, RESULT_MS = 4200, FLASH_MS = 520;
  const RESULT_TITLE = { won: "VICTORY", lost: "DEFEATED", draw: "DRAW", over: "DUEL OVER" };
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

  // A blow of each kind, as hard as its flash and rumble are (0 to 1).
  const WEIGHT = { shot: 0.5, bash: 0.6, swing: 0.75, head: 1, charged: 1 };

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

  const create = ({ root, remotes, pilot, crew, camera, fx, clear, refusal }) => {
    const net = BL.net, $ = (id) => document.getElementById(id);
    const hudBox = $("duel-hud"), targetBox = $("duel-target"), inviteBox = $("duel-invite");
    const countBox = $("duel-count"), flashBox = $("duel-flash"), resultBox = $("duel-result");
    const resultTitle = resultBox.querySelector(".duel-result-title"), resultLine = resultBox.querySelector(".duel-result-line");
    const names = hudBox.querySelectorAll(".duel-name"), fills = hudBox.querySelectorAll(".duel-fill"), chips = hudBox.querySelectorAll(".duel-chip"), hps = hudBox.querySelectorAll(".duel-hp"), fars = hudBox.querySelectorAll(".duel-far");
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
    let mine = null, target = 0, invite = 0, inviteHit = false, inviteTimer = 0, challenging = 0, unsub = null, clockKey = -2, noteKey = -2, t = 0;
    // A challenge made by a blow: when the next may go, and the player whose refusal of it is kept quiet.
    let provokeAt = 0, quiet = 0;
    let countAnim = null, flashAnim = null, resultAnim = null, rightSign = 0;
    // The rounds in the rifle and the spare magazines the visitor's Ooga carried before the duel filled them, and that Ooga.
    let lentTo = null, loadedBefore = 0, sparesBefore = null;
    // What the panel last showed: each side's health and metres from the flag, and the seconds on its clock.
    const hpShown = [-1, -1], farShown = [-2, -2];
    let timeKey = Infinity;
    const HIT = { node: null, owner: null, type: "none", distance: Infinity, x: 0, y: 0, z: 0 };
    const AT = { x: 0, y: 0 };
    // Arrows toward the blows the visitor took, and the losers driven from other pages who stand stunned.
    const arrows = Array.from({ length: ARROW_MAX }, () => ({ life: 0, x: 0, z: 0, weight: 1 }));
    const stuns = Array.from({ length: STUN_MAX }, () => ({ id: 0, left: 0 }));

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
      if (!inviteBox.hidden) inviteText.textContent = inviteHit ? `${nameOf(invite)} attacked you! Hit back or accept to duel`
        : `${nameOf(invite)} challenges you to a duel!`;
    };
    const closeInvite = () => {
      window.clearTimeout(inviteTimer); inviteTimer = 0;
      invite = 0; inviteHit = false;
      showInvite();
    };

    // One of the page's three animations on `box`, the one before it dropped; the box hides again when it is through.
    const play = (box, before, frames, ms) => {
      if (before) before.cancel();
      box.hidden = false;
      const anim = box.animate(frames, { duration: ms, easing: "ease-out", fill: "forwards" });
      anim.onfinish = () => { box.hidden = true; anim.cancel(); };
      return anim;
    };
    const stopShows = () => {
      for (const anim of [countAnim, flashAnim, resultAnim]) if (anim) anim.cancel();
      countAnim = flashAnim = resultAnim = null;
      countBox.hidden = flashBox.hidden = resultBox.hidden = true;
    };
    // The visitor took a blow from player `by`: the screen's edge flashes, an arrow points at where it came from and
    // a pad shakes, all as hard as the blow (`weight`, 0 to 1).
    const struck = (by, weight) => {
      flashAnim = play(flashBox, flashAnim, CALM.matches || weight < 0.7 ? FLASH_SOFT : FLASH, FLASH_MS);
      if (BL.gamepad) BL.gamepad.rumble(0.4 + 0.4 * weight, 0.3 + 0.3 * weight, 120);
      const from = feet(by);
      if (!from || !Number.isFinite(from.x + from.z)) return;
      let slot = arrows[0];
      for (let i = 1; i < arrows.length; i++) if (arrows[i].life < slot.life) slot = arrows[i];
      slot.life = ARROW_LIFE; slot.x = from.x; slot.z = from.z; slot.weight = weight;
    };
    // The duel over, its ammunition goes: the Ooga carries the rounds and spare magazines it came with.
    const takeBack = () => {
      if (lentTo) crew.setAmmo(lentTo, loadedBefore, sparesBefore);
      lentTo = sparesBefore = null;
    };
    // The loser stands stunned: the visitor's own Ooga by the crew's stun, another page's with a wobbling head under
    // birds drawn on the overlay (`draw`), where a nameplate cannot hide them.
    const stun = (id) => {
      const seconds = R.STUN_MS / 1000;
      if (id === selfId()) { if (pilot.player) crew.stun(pilot.player, seconds); return; }
      let slot = null;
      for (const s of stuns) {
        if (s.left && s.id === id) { slot = s; break; }
        if (!slot && !s.left) slot = s;
      }
      if (!slot) return;
      slot.id = id; slot.left = seconds;
    };
    const endStun = (s) => {
      const body = remotes.body(s.id);
      if (body && body.parts && body.parts.head) { const r = body.parts.head.rotation; r.x = r.y = r.z = 0; }
      s.id = 0; s.left = 0;
    };
    const showResult = (kind, line) => {
      resultBox.dataset.result = kind;
      resultTitle.textContent = RESULT_TITLE[kind];
      resultLine.textContent = line;
      resultAnim = play(resultBox, resultAnim, CALM.matches ? FADE : RESULT_IN, RESULT_MS);
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
      const d = { id: msg.id, a: msg.a, b: msg.b, x: msg.x, z: msg.z, hp, shown: hp.slice(), chip: hp.slice(), chipFrom: hp.slice(), chipT: [0, 0], fightAt: performance.now() + ahead, endT: 0, flag: null, outAt: 0 };
      duels.set(d.id, d);
      placeFlag(d);
      const me = selfId();
      if (d.a === me || d.b === me) {
        mine = d; target = 0; challenging = 0; quiet = 0; closeInvite(); showTarget();
        // Both start with the rifle and two spare magazines full (each page fills its own), lent for the duel, unless
        // this page joined one under way.
        if (ahead > 0 && pilot.player) {
          const loaded = pilot.player.weapon.ammo, before = pilot.player.weapon.spareAmmo.slice();
          if (crew.fillAmmo(pilot.player)) { lentTo = pilot.player; loadedBefore = loaded; sparesBefore = before; }
        }
        hpShown[0] = hpShown[1] = -1; farShown[0] = farShown[1] = -2; timeKey = Infinity; clockKey = noteKey = -2; note.hidden = true;
        hudBox.hidden = false;
        const [first, second] = d.a === me ? [d.a, d.b] : [d.b, d.a];
        names[0].textContent = names[0].title = nameOf(first); names[1].textContent = names[1].title = nameOf(second);
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
      // Whoever lost and is still here stands stunned a while.
      if (loser && l && reason !== "left") stun(loser);
      const me = selfId(), mineNow = d === mine;
      if (mineNow) {
        mine = null; hudBox.hidden = true;
        takeBack();
        if (countAnim) countAnim.finish();
        const them = nameOf(winner === me ? loser : winner);
        if (!winner) showResult(reason === "lost" ? "over" : "draw", reason === "lost" ? "The duel was interrupted" : "Time is up · nobody wins");
        else if (winner === me) showResult("won", (YOU_WON[reason] || YOU_WON.defeat)(them));
        else showResult("lost", (YOU_LOST[reason] || YOU_LOST.defeat)(them));
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
      takeBack();
      challenging = 0; quiet = 0; closeInvite(); showTarget();
      for (const a of arrows) a.life = 0;
      for (const s of stuns) if (s.left) endStun(s);
      stopShows();
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
          if (dealt > 0 && (side ? d.b : d.a) === selfId()) struck(side ? d.a : d.b, WEIGHT[msg.kind] || 0.5);
        }
        // A side whose health moved starts its chip again from where the chip stands.
        for (let side = 0; side < 2; side++) if (d.hp[side] !== msg.hp[side]) { d.chipFrom[side] = d.chip[side]; d.chipT[side] = 0; }
        d.hp[0] = msg.hp[0]; d.hp[1] = msg.hp[1];
        return;
      }
      if (op === "end") {
        if (msg.id === 0) { if (mine) { const d = mine; finish(d, 0, "lost"); } return; }
        return finish(duels.get(msg.id), Number.isSafeInteger(msg.winner) ? msg.winner : 0, msg.reason);
      }
      if (op === "challenged" && Number.isSafeInteger(msg.from)) {
        if (mine) return net.sendDuel("decline", msg.from);
        invite = msg.from; inviteHit = msg.hit === true;
        // The blow that made the challenge is felt, lightly.
        if (inviteHit) struck(msg.from, 0.4);
        window.clearTimeout(inviteTimer);
        inviteTimer = window.setTimeout(closeInvite, R.INVITE_MS);
        showInvite();
        return;
      }
      if (op === "challenging" && Number.isSafeInteger(msg.to)) {
        challenging = msg.to; if (quiet === msg.to) quiet = 0;
        showTarget();
        BL.hud.toast(`You challenged ${nameOf(msg.to)} to a duel`);
        return;
      }
      if (op === "refused") {
        if (msg.to === challenging) challenging = 0;
        showTarget();
        // A blow that could not become a challenge (too far, someone busy) passes without a word.
        if (msg.to === quiet) { quiet = 0; if (target === msg.to) select(0); return; }
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
    // A blow landed on player `id` with no duel under way: a challenge to them, or the answer to theirs. Silent when
    // it cannot be one, since a stray round is no request.
    const mayProvoke = () => !mine && !!net.state.duel && performance.now() >= provokeAt;
    const provoke = (id) => {
      if (!mayProvoke() || !Number.isSafeInteger(id) || id <= 0 || id === selfId() || !net.remotes.has(id) || refusal && refusal()) return;
      provokeAt = performance.now() + PROVOKE_MS;
      if (invite === id) { accept(); return; }
      if (challenging === id) return;
      quiet = id; target = id;
      net.sendDuel("challenge", id, "hit");
    };
    // The driven Ooga's banana from `from` to `to`: through the opponent's body, a hit (on the head, a harder one);
    // through another player's with no duel under way, a challenge.
    const shot = (cave, from, to) => {
      if (cave !== pilot.player || (mine ? !fighting() : !mayProvoke())) return;
      const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, len = Math.hypot(dx, dy, dz);
      if (len < 1e-3 || !remotes.pick(HIT, from.x, from.y, from.z, dx / len, dy / len, dz / len, len + 0.3, clear)) return;
      const id = HIT.owner && HIT.owner.id, body = HIT.owner && HIT.owner.cave, y = HIT.y;
      HIT.node = HIT.owner = null;
      if (!mine) return provoke(id);
      if (id !== opponent() || !body) return;
      const base = body.root.position.y - (body.baseY || 0);
      net.sendDuel("hit", 0, y > base + (body.bodyHeight || 1.4) * HEAD_SHARE ? "head" : "shot");
    };
    // Whether `body` stands within the driven Ooga's melee reach, and how far off across the ground (Infinity when not).
    const within = (cave, body) => {
      if (!body || !body.root.visible) return Infinity;
      const p = cave.root.position, q = body.root.position, far = Math.hypot(p.x - q.x, p.z - q.z);
      const reach = MELEE_REACH + (cave.bodyRadius || 0.3) + (body.bodyRadius || 0.3);
      return far > reach || Math.abs((p.y - (cave.baseY || 0)) - (q.y - (body.baseY || 0))) > MELEE_RISE ? Infinity : far;
    };
    // The driven Ooga's strike (charge 0 to 1) or gun bash (-1): the opponent within reach takes it. With no duel
    // under way, the nearest player within reach in front of the Ooga is challenged.
    const swing = (cave, charge) => {
      if (cave !== pilot.player) return;
      if (!mine) {
        if (!mayProvoke()) return;
        const p = cave.root.position, yaw = cave.root.rotation.y, hx = Math.sin(yaw), hz = Math.cos(yaw);
        let best = 0, near = Infinity;
        for (const id of net.remotes.keys()) {
          const body = remotes.body(id), far = within(cave, body);
          if (far < near && (body.root.position.x - p.x) * hx + (body.root.position.z - p.z) * hz > 0) { best = id; near = far; }
        }
        if (best) provoke(best);
        return;
      }
      if (!fighting() || within(cave, remotes.body(opponent())) === Infinity) return;
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
        // The bar shown follows the health; the red chip behind it holds a beat, then follows, so a blow reads.
        for (let side = 0; side < 2; side++) {
          const hp = d.hp[side];
          if (d.shown[side] !== hp) d.shown[side] = d.shown[side] > hp ? Math.max(hp, d.shown[side] - BAR_EASE * dt) : hp;
          if (d.chip[side] === hp) continue;
          const k = Math.min(1, Math.max(0, ((d.chipT[side] += dt) - CHIP_HOLD) / CHIP_EASE));
          d.chip[side] = d.chipFrom[side] > hp ? hp + (d.chipFrom[side] - hp) * (1 - k) * (1 - k) : hp;
        }
        if (d.endT && (d.endT -= dt) <= 0) { freeFlag(d); duels.delete(d.id); }
      }
      for (let i = 0; i < arrows.length; i++) if (arrows[i].life > 0) arrows[i].life = Math.max(0, arrows[i].life - dt);
      for (let i = 0; i < stuns.length; i++) {
        const s = stuns[i];
        if (!s.left) continue;
        const body = remotes.body(s.id);
        if ((s.left -= dt) <= 0 || !body) { s.left = 0; endStun(s); continue; }
        if (!body.root.visible || !body.parts || !body.parts.head) continue;
        // As the crew's own stun: the head wobbles.
        const r = body.parts.head.rotation;
        r.x = Math.sin(t * 3.1) * 0.08; r.y = Math.sin(t * 4.8) * 0.72; r.z = Math.sin(t * 2.4) * 0.1;
      }
      if (!mine) return;
      const me = mine.a === selfId() ? 0 : 1;
      for (let i = 0; i < 2; i++) {
        const hp = mine.hp[i ? 1 - me : me];
        if (hp !== hpShown[i]) {
          hpShown[i] = hp;
          // The red chip takes the same width; its own slower transition leaves the blow showing behind the bar.
          fills[i].style.width = chips[i].style.width = `${Math.max(0, Math.min(100, hp / R.HP * 100))}%`;
          fills[i].dataset.level = level(hp);
          hps[i].textContent = String(Math.round(hp));
        }
        // Each duelist's metres from the flag, in red past its radius.
        const at = feet(i ? opponent() : selfId()), far = at && Number.isFinite(at.x + at.z) ? Math.round(Math.hypot(at.x - mine.x, at.z - mine.z)) : -1;
        if (far !== farShown[i]) {
          farShown[i] = far;
          fars[i].textContent = far < 0 ? "" : `${far} m`;
          fars[i].dataset.out = far > R.RADIUS ? "true" : "false";
        }
      }
      // Strings are made only when the whole second they show changes.
      const toGo = mine.fightAt - now, sec = toGo > 0 ? Math.ceil(toGo / 1000) : toGo > -900 ? 0 : -1;
      if (sec !== clockKey) {
        clockKey = sec;
        // The count, large in the middle of the view.
        if (sec >= 0 && sec < COUNT_TEXT.length) {
          setText(countBox, COUNT_TEXT[sec]);
          countBox.dataset.go = sec ? "false" : "true";
          countAnim = play(countBox, countAnim, CALM.matches ? FADE : POP, COUNT_MS);
        }
      }
      // The panel's clock: the seconds to the first blow, then the time left before a draw.
      const remain = toGo > 0 ? -Math.ceil(toGo / 1000) : Math.max(0, Math.ceil((R.MAX_MS + toGo) / 1000));
      if (remain !== timeKey) {
        timeKey = remain;
        setText(clock, remain < 0 ? `Starts in ${-remain}` : `${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, "0")}`);
        clock.dataset.low = remain >= 0 && remain <= 30 ? "true" : "false";
      }
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

    // The bar for `hp` (and the pale `chip` of what a blow just took) centred on (x, y bottom).
    const drawBar = (ctx, x, bottom, hp, chip) => {
      const left = Math.round(x - BAR_W / 2), top = Math.round(bottom - BAR_H), k = Math.max(0, Math.min(1, hp / R.HP));
      ctx.fillStyle = BAR_EDGE;
      ctx.fillRect(left - 2, top - 2, BAR_W + 4, BAR_H + 4);
      ctx.fillStyle = BAR_TRACK;
      ctx.fillRect(left, top, BAR_W, BAR_H);
      if (chip > hp) { ctx.fillStyle = BAR_CHIP; ctx.fillRect(left, top, Math.round(BAR_W * Math.min(1, chip / R.HP)), BAR_H); }
      const lv = level(hp);
      ctx.fillStyle = lv === "high" ? BAR_HIGH : lv === "mid" ? BAR_MID : BAR_LOW;
      ctx.fillRect(left, top, Math.round(BAR_W * k), BAR_H);
    };
    // The crew's three stun birds in pixels, circling the ellipse (rx, ry) about (cx, cy), each `size` pixels a unit and
    // larger and plainer as it comes round the near side.
    const drawBirds = (ctx, cx, cy, rx, ry, size) => {
      for (let i = 0; i < 3; i++) {
        const turn = t * 5.5 + i * Math.PI * 2 / 3, near = Math.cos(turn) * 0.5 + 0.5, u = Math.round(size * (0.6 + 0.4 * near));
        const x = Math.round(cx + Math.sin(turn) * rx), y = Math.round(cy + Math.cos(turn) * ry + Math.sin(t * 7 + i * 2.1) * size * 0.5);
        ctx.globalAlpha = 0.6 + 0.4 * near;
        // A body between two raised wings, each edged dark.
        ctx.fillStyle = BAR_EDGE;
        ctx.fillRect(x - 5 * u - 2, y - 2 * u - 2, 3 * u + 4, u + 4);
        ctx.fillRect(x + 2 * u - 2, y - 2 * u - 2, 3 * u + 4, u + 4);
        ctx.fillRect(x - 2 * u - 2, y - u - 2, 4 * u + 4, 2 * u + 4);
        ctx.fillStyle = "#f2b83b";
        ctx.fillRect(x - 5 * u, y - 2 * u, 3 * u, u);
        ctx.fillRect(x + 2 * u, y - 2 * u, 3 * u, u);
        ctx.fillStyle = "#ffd84a";
        ctx.fillRect(x - 2 * u, y - u, 4 * u, 2 * u);
      }
      ctx.globalAlpha = 1;
    };
    // Which way the view's right lies across the ground for a forward (fx, fz): measured once through the projection
    // itself (two points ahead of the eye, one a step to the side), never worked out on paper.
    const sideOf = (ux, uz, measurable) => {
      if (rightSign || !measurable) return rightSign || 1;
      const c = camera(), p = c.position, q = c.target, len = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) || 1;
      const ax = p.x + (q.x - p.x) / len * 8, ay = p.y + (q.y - p.y) / len * 8, az = p.z + (q.z - p.z) / len * 8;
      const a = fx.projectRaw(ax, ay, az), x0 = a ? a.x : NaN;
      const b = fx.projectRaw(ax - uz, ay, az + ux), x1 = b ? b.x : NaN;
      if (Number.isFinite(x0) && Number.isFinite(x1) && Math.abs(x1 - x0) > 1) rightSign = x1 > x0 ? 1 : -1;
      return rightSign || 1;
    };
    // The overlay, after the nameplates: every duel's two bars over its duelists' heads, the count over a flag for
    // those watching, and the arrows toward the blows the visitor took.
    const draw = (ctx, project) => {
      const now = performance.now(), me = selfId();
      let open = false;
      for (let i = 0; i < flags.length; i++) {
        const d = flags[i].duel;
        if (!d) continue;
        if (!open) { ctx.save(); open = true; }
        for (let side = 0; side < 2; side++) {
          const id = side ? d.b : d.a, body = bodyOf(id);
          if (!body || !body.root.visible) continue;
          if (id === me) {
            // The visitor's own Ooga has no nameplate; in its own eyes it has no head to stand a bar on (the HUD's is theirs).
            if (pilot.view === "first-person") continue;
            const p = body.root.position, pos = fx.projectRaw(p.x, p.y - (body.baseY || 0) + (body.bodyHeight || 1.4) + 0.12, p.z);
            if (pos) drawBar(ctx, pos.x, pos.y - BAR_GAP, d.shown[side], d.chip[side]);
          } else if (remotes.plateTop(id, AT)) {
            drawBar(ctx, AT.x, AT.y - BAR_GAP, d.shown[side], d.chip[side]);
            body.speechLift = (body.speechLift || 0) + BAR_ROOM;
          }
        }
        const toGo = d.fightAt - now, sec = toGo > 0 ? Math.ceil(toGo / 1000) : toGo > -900 ? 0 : -1;
        if (d !== mine && !d.endT && sec >= 0 && sec < COUNT_TEXT.length) {
          const pos = project(d.x, flags[i].node.position.y + 3.9, d.z);
          if (pos) {
            ctx.font = "900 34px ui-monospace, monospace";
            ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
            ctx.lineWidth = 6; ctx.lineJoin = "round";
            ctx.strokeStyle = BAR_EDGE; ctx.fillStyle = sec ? "#ffe27a" : "#ff6a4d";
            ctx.strokeText(COUNT_TEXT[sec], pos.x, pos.y);
            ctx.fillText(COUNT_TEXT[sec], pos.x, pos.y);
          }
        }
      }
      if (open) ctx.restore();
      // Birds over each stunned loser driven from another page, clear of their nameplate and bar.
      for (let i = 0; i < stuns.length; i++) {
        const s = stuns[i], body = s.left ? remotes.body(s.id) : null;
        if (!body || !remotes.plateTop(s.id, AT)) continue;
        drawBirds(ctx, AT.x, AT.y - BAR_ROOM - BIRD_ROOM / 2, 48, 8, 4);
        body.speechLift = (body.speechLift || 0) + BIRD_ROOM;
      }
      const own = pilot.player;
      if (!own) return;
      const c = camera(), fwdX = c.target.x - c.position.x, fwdZ = c.target.z - c.position.z, flat = Math.hypot(fwdX, fwdZ);
      // Looking straight down there is no forward across the ground: the Ooga's own heading stands in.
      const fX = flat > 1e-3 ? fwdX / flat : Math.sin(own.root.rotation.y), fZ = flat > 1e-3 ? fwdZ / flat : Math.cos(own.root.rotation.y);
      const w = window.innerWidth, h = window.innerHeight, ring = Math.min(w, h) * ARROW_RING;
      for (let i = 0; i < arrows.length; i++) {
        const a = arrows[i];
        if (a.life <= 0) continue;
        const dx = a.x - own.root.position.x, dz = a.z - own.root.position.z;
        if (Math.hypot(dx, dz) < 1e-3) continue;
        const side = sideOf(fX, fZ, flat > 1e-3), angle = Math.atan2((dx * -fZ + dz * fX) * side, dx * fX + dz * fZ);
        const scale = 0.85 + 0.35 * a.weight;
        ctx.save();
        ctx.translate(w / 2 + Math.sin(angle) * ring, h / 2 - Math.cos(angle) * ring);
        ctx.rotate(angle);
        ctx.scale(scale, scale);
        ctx.globalAlpha = Math.min(1, a.life / 0.5);
        ctx.beginPath();
        ctx.moveTo(0, -26); ctx.lineTo(30, 12); ctx.lineTo(13, 12); ctx.lineTo(0, -4); ctx.lineTo(-13, 12); ctx.lineTo(-30, 12);
        ctx.closePath();
        ctx.lineWidth = 5; ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(40, 6, 4, 0.85)"; ctx.fillStyle = "#ff3b30";
        ctx.stroke(); ctx.fill();
        ctx.restore();
      }
      // Stunned in its own eyes, the visitor's Ooga cannot see the birds over its head: they circle across the view.
      if (own.health.daze > 0 && pilot.view === "first-person") {
        const rx = Math.min(w * 0.2, 200);
        drawBirds(ctx, w / 2, h * 0.46, rx, rx * 0.2, 9);
      }
    };

    const dispose = () => {
      if (unsub) { unsub(); unsub = null; }
      if (challenging) net.sendDuel("cancel");
      lostAll();
      target = 0; showTarget();
      hudBox.hidden = targetBox.hidden = inviteBox.hidden = true;
      clockKey = noteKey = -2; timeKey = Infinity;
      if (active === api) active = null;
    };
    const destroy = () => {
      dispose();
      document.removeEventListener("click", onClick);
      for (const f of flags) if (f.added) { removeChild(root, f.node); f.added = false; }
    };
    const api = { update, draw, tap, shot, swing, challenge, select, dispose, destroy,
      // For a check: a room's duel frame as if heard, and what shows.
      debug: { heard, get arrows() { let n = 0; for (const a of arrows) if (a.life > 0) n++; return n; }, get stunned() { let n = 0; for (const s of stuns) if (s.left) n++; return n; } },
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
