// HALLOWEEN: the ghost hunt as a page following the server's (worker/src/games/ghost-hunt.js) says it, over the arena's
// channel (ghost-entry.js `channel`, a socket to the hunt while this page stands in the arena or its hallway). The
// server runs the hunt and sends its whole state a few times a second (`onSnapshot`) and where everything stands every
// tick (`onMotion`, game-wire.js's frames); this page tells it what its player does: `start` when they wake the herald,
// `ready` in its lobby, `leave` to quit a hunt under way, `pause` (a debug page; the server takes it only from a debug
// account), where they stand (`pose`, at most ten times a second and once a second while still), and every rifle round
// and bash (`shot`, `bash`), with the hunt time the page saw (so the server can rewind to it) and the target the page
// saw it meet (a hint the server checks). The server decides every hit and its damage; nothing here reports one.
// Signed out, or with no backend, a page is "solo" and runs its own hunt.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};

  const POSE_MS = 100, POSE_STILL_MS = 1000;
  const round3 = (v) => Math.round(v * 1000) / 1000;
  const create = ({ npcSync: channel, onSnapshot, onMotion }) => {
    channel.extra = { read: onSnapshot };
    channel.onMotion = onMotion;
    const START = { t: "start", r: 0 }, PAUSE = { t: "pause" }, READY = { t: "ready" }, LEAVE = { t: "leave" };
    const POSE = { t: "pose", p: [0, 0, 0, 0, 0] }, SHOT = { t: "shot", q: 0, at: 0, o: [0, 0, 0], d: [0, 0, 0], l: 0, h: [-1, -1, -1] };
    const BASH = { t: "bash", q: 0, at: 0, h: -1 };
    let q = 0, poseAt = -Infinity, px = NaN, py = NaN, pz = NaN, pyaw = NaN;
    /** Wakes the herald (`round` past 1 starts there, a debug account only). */
    const start = (round = 0) => { START.r = round > 1 ? round : 0; return channel.send(START); };
    const ready = () => channel.send(READY);
    const pause = () => channel.send(PAUSE);
    const leave = () => channel.send(LEAVE);
    /** Where this page's player stands in the arena (its own ground), facing `yaw`, `h` tall, at page time `now` (ms). */
    const pose = (x, y, z, yaw, h, now) => {
      if (now - poseAt < POSE_MS) return;
      const moved = Math.abs(x - px) > 0.01 || Math.abs(y - py) > 0.01 || Math.abs(z - pz) > 0.01 || Math.abs(yaw - pyaw) > 0.01;
      if (!moved && now - poseAt < POSE_STILL_MS) return;
      const p = POSE.p;
      p[0] = round3(x); p[1] = round3(y); p[2] = round3(z); p[3] = round3(yaw); p[4] = round3(h);
      if (channel.send(POSE)) { poseAt = now; px = x; py = y; pz = z; pyaw = yaw; }
    };
    /**
     * A rifle round from (ox, oy, oz) along the unit (dx, dy, dz), `l` m to where it ends, seen at hunt time `at`, and the
     * ids the page saw it and the two monkeys' rounds meet (-1 for none); returns its number (the server's
     * confirmations name it).
     */
    const shot = (at, ox, oy, oz, dx, dy, dz, l, rifle, left, right) => {
      SHOT.q = q = (q + 1) & 0xffff; SHOT.at = round3(at);
      SHOT.o[0] = round3(ox); SHOT.o[1] = round3(oy); SHOT.o[2] = round3(oz);
      SHOT.d[0] = round3(dx); SHOT.d[1] = round3(dy); SHOT.d[2] = round3(dz);
      SHOT.l = round3(l); SHOT.h[0] = rifle; SHOT.h[1] = left; SHOT.h[2] = right;
      channel.send(SHOT);
      return q;
    };
    /** A bash with the gun's butt at hunt time `at`, and the id the page saw it meet (-1 for none); returns its number. */
    const bash = (at, hint) => {
      BASH.q = q = (q + 1) & 0xffff; BASH.at = round3(at); BASH.h = hint;
      channel.send(BASH);
      return q;
    };
    const dispose = () => {
      if (channel.extra && channel.extra.read === onSnapshot) channel.extra = null;
      if (channel.onMotion === onMotion) channel.onMotion = null;
    };
    return { start, ready, pause, leave, pose, shot, bash, dispose, get role() { return channel.role; } };
  };

  BL.ghostSync = { create };
})();
