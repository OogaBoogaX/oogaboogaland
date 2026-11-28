// The Ember Den's tells and fidgets: the body language every seated figure shows without anyone choosing it, worked
// out on each page from public table state alone. `view(snapshot, out)` is the one door: it copies a table's public
// fields into a preallocated view (`makeView`), and nothing else here is handed a snapshot, so no tell can follow what a
// seat holds. `create(tables, seats)` keeps one tell state a chair (`table * seats + seat`) in typed arrays, `step`
// advances one table's chairs from its view, firing each event tell once on its trigger's edge, and `pose(cave, state,
// chair, lookYaw)` acts out the chair's running tell or fidget over the sitting pose applied this frame, as
// `pokerEmotes.gesture` does: it writes only the arms' x and y and the head's x and y, and at `t <= 0` or `t >= 1` writes
// exactly the sitting pose's arms (x -0.9, y 0) and a level head; the first pose after a tell or fidget stops, cut short
// or run out, settles to that pose, and with nothing running it writes nothing. `botHold(view)` is the extra wait a
// practice bot takes facing a big bet, from the bet's public size alone. Allocates nothing past `create` and `makeView`.
// Loads in Node; depends on no other module.
(() => {
  "use strict";
  const BL = window.BL;
  const TELL = Object.freeze({ NONE: 0, GULP: 1, TOSS: 2, PUSH: 3, CHEER: 4, SLUMP: 5 });
  const FIDGET = Object.freeze({ NONE: 0, RIFFLE: 1, DRUM: 2, LOOK: 3 });
  const SWEAT_AT = 5, SWEAT_MORE = 10, BIG_BET = 0.5, BOT_HOLD = 1.0;
  const GULP_TIME = 0.9, TOSS_TIME = 0.7, PUSH_TIME = 1.0, CHEER_TIME = 1.6, SLUMP_TIME = 2.4, FIDGET_TIME = 1.2;
  const FIDGET_GAP_MIN = 4, FIDGET_GAP_MAX = 11;
  const TIME = [0, GULP_TIME, TOSS_TIME, PUSH_TIME, CHEER_TIME, SLUMP_TIME];
  // `lastAction` as a small code, so a chair remembers what it last saw without holding a string; any other text is 9.
  const ACTION = new Map([["", 0], ["Fold", 1], ["All in", 2], ["Call", 3], ["Check", 4], ["Bet", 5], ["Raise", 6], ["Small blind", 7], ["Big blind", 8]]);
  const FOLD = 1, ALL_IN = 2, BET = 5, RAISE = 6;
  const codeOf = text => { const c = ACTION.get(text); return c === undefined ? 9 : c; };
  const count = n => typeof n === "number" ? n : n.length;

  // The public view: phase, hand number, whose turn, pot, current bet, whether the hand has a result, and a seat's
  // public fields. `won` is true for a seat index named in a pot's `winners` that is not a refund of an uncalled bet.
  const makeView = seats => ({
    phase: "", hand: 0, turn: -1, pot: 0, currentBet: 0, ended: false,
    seats: Array.from({ length: count(seats) }, () => ({ seated: false, roundBet: 0, stack: 0, lastAction: "", inHand: false, folded: false, bot: false, won: false }))
  });
  const view = (snapshot, out) => {
    out.phase = snapshot.phase; out.hand = snapshot.hand; out.turn = snapshot.turn; out.pot = snapshot.pot; out.currentBet = snapshot.currentBet;
    const result = snapshot.result, seats = snapshot.seats;
    out.ended = !!result;
    for (let i = 0; i < out.seats.length; i++) {
      const s = seats[i], o = out.seats[i];
      o.won = false;
      if (!s) { o.seated = false; o.roundBet = 0; o.stack = 0; o.lastAction = ""; o.inHand = false; o.folded = false; o.bot = false; continue; }
      o.seated = true; o.roundBet = s.roundBet; o.stack = s.stack; o.lastAction = s.lastAction; o.inHand = s.inHand; o.folded = s.folded; o.bot = s.bot;
    }
    if (result) for (let p = 0; p < result.pots.length; p++) {
      const pot = result.pots[p];
      if (pot.refund) continue;
      for (let w = 0; w < pot.winners.length; w++) { const o = out.seats[pot.winners[w]]; if (o) o.won = true; }
    }
    return out;
  };

  // `tables` and `seats` are counts, or the room's arrays of them.
  const create = (tables, seats) => {
    const nt = count(tables), n = count(seats), chairs = nt * n;
    return {
      tables: nt, seats: n,
      kind: new Uint8Array(chairs), t: new Float32Array(chairs), sweat: new Uint8Array(chairs),
      fidget: new Uint8Array(chairs), fidgetT: new Float32Array(chairs), turnFor: new Float32Array(chairs),
      // The event tell waiting out a running toss or push; seconds to the next fidget (-1 until drawn); the last action
      // seen; and whether the last pose wrote a tell or fidget, so the next idle one settles.
      next: new Uint8Array(chairs), gap: new Float32Array(chairs).fill(-1), action: new Uint8Array(chairs), posed: new Uint8Array(chairs),
      // A table: the hand, turn and result last seen (hand -1 until the first step, which only takes the table in), and
      // whether anything still runs at it.
      hand: new Float64Array(nt).fill(-1), turn: new Int16Array(nt).fill(-1), ended: new Uint8Array(nt), busy: new Uint8Array(nt)
    };
  };
  const reset = (state, chair) => {
    state.kind[chair] = 0; state.t[chair] = 0; state.next[chair] = 0; state.sweat[chair] = 0; state.turnFor[chair] = 0;
    state.fidget[chair] = 0; state.fidgetT[chair] = 0; state.gap[chair] = -1; state.posed[chair] = 0;
  };
  // A table this page stops stepping and may come back to: its next step takes it in afresh and fires nothing. Its
  // chairs are cleared; settling their figures is the caller's.
  const forget = (state, table) => {
    state.hand[table] = -1; state.turn[table] = -1; state.ended[table] = 0; state.busy[table] = 0;
    for (let s = 0, base = table * state.seats; s < state.seats; s++) { reset(state, base + s); state.action[base + s] = 0; }
  };
  // An event tell replaces a gulp, a fidget, or a cheer or slump (the last hand's); a running toss or push plays out and
  // the newest event tell waits behind it.
  const event = (state, k, kind) => {
    const running = state.kind[k];
    if (running === TELL.TOSS || running === TELL.PUSH) { state.next[k] = kind; return; }
    state.kind[k] = kind; state.t[k] = 0; state.fidget[k] = 0; state.fidgetT[k] = 0;
  };
  // A gulp never cuts a toss or push short; it replaces anything else.
  const gulp = (state, k) => {
    const running = state.kind[k];
    if (running === TELL.TOSS || running === TELL.PUSH) return;
    state.kind[k] = TELL.GULP; state.t[k] = 0; state.fidget[k] = 0; state.fidgetT[k] = 0;
  };
  // A big bet: the seat on turn has half the pot or more to call, and a seat has bet, raised, or gone all in for at
  // least the current bet. A blind is not a bet, nor is a short stack's all in for less than the bet (the rules call
  // that call "All in" too), so the first to act before the flop, facing only the big blind, is not facing one.
  const facesBigBet = v => {
    if (v.turn < 0 || !(v.pot > 0) || v.currentBet - v.seats[v.turn].roundBet < BIG_BET * v.pot) return false;
    for (let i = 0; i < v.seats.length; i++) {
      const s = v.seats[i];
      if (!s.seated) continue;
      const c = codeOf(s.lastAction);
      if (c === BET || c === RAISE || c === ALL_IN && s.roundBet >= v.currentBet) return true;
    }
    return false;
  };
  const botHold = v => v.turn >= 0 && v.seats[v.turn].bot && facesBigBet(v) ? BOT_HOLD : 0;

  const step = (state, table, v, dt, rand, calm) => {
    const n = state.seats, base = table * n, turn = v.turn, ended = v.ended ? 1 : 0;
    // The first sight of a table only takes it in: what has already happened fires nothing.
    if (state.hand[table] === -1) {
      state.hand[table] = v.hand; state.turn[table] = turn; state.ended[table] = ended;
      for (let s = 0; s < n; s++) state.action[base + s] = v.seats[s].seated ? codeOf(v.seats[s].lastAction) : 0;
      return;
    }
    const newHand = v.hand !== state.hand[table], moved = turn !== state.turn[table];
    // Nobody acting, nothing new and nothing running: no work.
    if (turn < 0 && !newHand && !moved && ended === state.ended[table] && !state.busy[table]) return;
    if (newHand) {
      // The last hand's actions and waiting tells are dropped; its cheers and slumps run on until a new tell needs them.
      state.hand[table] = v.hand; state.ended[table] = 0;
      for (let s = 0; s < n; s++) { state.action[base + s] = 0; state.next[base + s] = 0; }
    }
    // The turn starts again when it moves, a hand begins, or the seat on turn acts and keeps it.
    const restart = moved || newHand || turn >= 0 && codeOf(v.seats[turn].lastAction) !== state.action[base + turn];
    if (restart) for (let s = 0; s < n; s++) { state.turnFor[base + s] = 0; state.sweat[base + s] = 0; }
    const gulpAt = restart && facesBigBet(v) ? turn : -1;
    const result = ended && !state.ended[table];
    let busy = 0;
    for (let s = 0; s < n; s++) {
      const k = base + s, seat = v.seats[s];
      if (state.kind[k]) {
        state.t[k] += dt / TIME[state.kind[k]];
        if (state.t[k] >= 1) { state.kind[k] = state.next[k]; state.t[k] = 0; state.next[k] = 0; }
      }
      if (state.fidget[k] && (state.fidgetT[k] += dt / FIDGET_TIME) >= 1) { state.fidget[k] = 0; state.fidgetT[k] = 0; }
      if (!seat.seated) {
        state.kind[k] = 0; state.t[k] = 0; state.next[k] = 0; state.fidget[k] = 0; state.fidgetT[k] = 0;
        state.sweat[k] = 0; state.turnFor[k] = 0; state.gap[k] = -1; state.action[k] = 0;
        continue;
      }
      // After the running tells advance, so a tell started this step stands at t 0; before the actions, so an event
      // tell seen in the same step replaces the gulp.
      if (s === gulpAt) gulp(state, k);
      const code = codeOf(seat.lastAction);
      if (code !== state.action[k]) {
        state.action[k] = code;
        if (code === FOLD) event(state, k, TELL.TOSS);
        else if (code === ALL_IN) event(state, k, TELL.PUSH);
      }
      if (result) {
        if (seat.won) event(state, k, TELL.CHEER);
        else if (seat.inHand && seat.stack === 0) event(state, k, TELL.SLUMP);
      }
      if (s === turn) {
        const on = state.turnFor[k] += dt;
        // Bots never sweat.
        state.sweat[k] = seat.bot ? 0 : on >= SWEAT_MORE ? 2 : on >= SWEAT_AT ? 1 : 0;
      }
      // Fidgets: only while someone else is acting, the seat is in the hand and no tell runs at it.
      if (calm || s === turn || state.kind[k]) { state.fidget[k] = 0; state.fidgetT[k] = 0; }
      else if (turn >= 0 && seat.inHand) {
        if (state.gap[k] < 0) state.gap[k] = FIDGET_GAP_MIN + rand() * (FIDGET_GAP_MAX - FIDGET_GAP_MIN);
        else if ((state.gap[k] -= dt) <= 0) {
          state.fidget[k] = seat.folded ? FIDGET.LOOK : 1 + Math.min(2, Math.floor(rand() * 3));
          state.fidgetT[k] = 0;
          state.gap[k] = FIDGET_GAP_MIN + rand() * (FIDGET_GAP_MAX - FIDGET_GAP_MIN);
        }
      }
      if (state.kind[k] || state.fidget[k] || state.next[k]) busy = 1;
    }
    state.turn[table] = turn; state.ended[table] = ended; state.busy[table] = busy;
  };

  // The sitting pose's arms and a level head; +x on the head bows it, -x on an arm brings it forward and up, +y turns
  // the right arm (at -x) toward the middle and -y the left, and +y on the head turns it to the figure's left.
  const SIT_ARMS = -0.9, TAU = Math.PI * 2, LOOK_MAX = 1.0;
  const turnPart = (part, x, y) => { if (part) { part.rotation.x = x; part.rotation.y = y; } };
  const settle = cave => { const p = cave.parts; turnPart(p.armL, SIT_ARMS, 0); turnPart(p.armR, SIT_ARMS, 0); turnPart(p.head, 0, 0); };
  // A running tell wins over a fidget; the scene leaves a chair to its chosen emote's gesture instead of calling this.
  // One function that hands no fraction to another, and writes the parts itself: a helper taking the angles boxes them
  // whenever the caller's inlining budget leaves it out of line.
  const pose = (cave, state, chair, lookYaw) => {
    const kind = state.kind[chair], fidget = state.fidget[chair];
    if (!kind && !fidget) { if (state.posed[chair]) { state.posed[chair] = 0; settle(cave); } return; }
    state.posed[chair] = 1;
    const t = kind ? state.t[chair] : state.fidgetT[chair];
    if (!(t > 0 && t < 1)) { settle(cave); return; }
    // In over the first fifth and out over the last, smoothstepped.
    const u = t < 0.2 ? t / 0.2 : t > 0.8 ? (1 - t) / 0.2 : 1, e = u * u * (3 - 2 * u);
    let lx = SIT_ARMS, ly = 0, rx = SIT_ARMS, ry = 0, hx = 0, hy = 0;
    if (kind === TELL.GULP) {
      // The head dips once and the shoulders hunch, both hands drawn in.
      rx = lx = SIT_ARMS + 0.12 * e; ry = 0.22 * e; ly = -ry;
      hx = 0.32 * e * Math.sin(Math.PI * t);
    } else if (kind === TELL.TOSS) {
      // The right hand flicks forward once, over the tossed pair's slide; the left stays put.
      const flick = Math.sin(Math.PI * (t < 0.6 ? t / 0.6 : 1));
      rx = SIT_ARMS - e * 0.65 * flick; ry = 0.3 * e * flick; hx = 0.08 * e;
    } else if (kind === TELL.PUSH) {
      // Both arms reach out wide and sweep in together, pushing the stack to the middle.
      rx = lx = SIT_ARMS - 0.7 * e; ry = e * (0.45 * (1 - t) - 0.1); ly = -ry; hx = 0.1 * e;
    } else if (kind === TELL.CHEER) {
      rx = lx = SIT_ARMS - e * (1.75 + 0.3 * Math.abs(Math.sin(TAU * 2 * t))); hx = -0.2 * e;
    } else if (kind === TELL.SLUMP) {
      // Head down and arms dropped to the sides, a slow sag.
      rx = lx = SIT_ARMS + 0.75 * e; ry = -0.1 * e; ly = -ry; hx = e * (0.5 + 0.05 * Math.sin(TAU * t));
    } else if (fidget === FIDGET.RIFFLE) {
      // The right hand over its chips, riffling.
      rx = SIT_ARMS - e * (0.1 + 0.05 * Math.sin(TAU * 6 * t)); ry = 0.15 * e; hx = 0.12 * e;
    } else if (fidget === FIDGET.DRUM) {
      // The left hand's fingers drumming the rail.
      lx = SIT_ARMS - e * 0.12 * (0.5 - 0.5 * Math.cos(TAU * 5 * t)); ly = -0.1 * e;
    } else if (fidget === FIDGET.LOOK) {
      hy = e * (lookYaw > LOOK_MAX ? LOOK_MAX : lookYaw < -LOOK_MAX ? -LOOK_MAX : lookYaw);
    }
    const p = cave.parts;
    if (p.armL) { p.armL.rotation.x = lx; p.armL.rotation.y = ly; }
    if (p.armR) { p.armR.rotation.x = rx; p.armR.rotation.y = ry; }
    if (p.head) { p.head.rotation.x = hx; p.head.rotation.y = hy; }
  };
  BL.pokerTells = Object.freeze({
    TELL, FIDGET, SWEAT_AT, SWEAT_MORE, BIG_BET, GULP_TIME, TOSS_TIME, PUSH_TIME, CHEER_TIME, SLUMP_TIME, FIDGET_TIME,
    FIDGET_GAP_MIN, FIDGET_GAP_MAX, BOT_HOLD, makeView, view, create, step, pose, settle, botHold, reset, forget
  });
})();
