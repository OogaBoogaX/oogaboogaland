// Duels on the island: the rules the page and the room share (the Worker imports this file unchanged, as hockey-wire.js).
// One player challenges another, the other accepts, a flag goes up halfway between them and, after a countdown, they
// fight with their own weapons until one is out of health. The room keeps the health and decides who won; a page only
// says what kind of hit it landed (`kind`), never a number, and the room takes it from DAMAGE.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const FEATURE = "duel-v1";
  const HP = 100;
  // Metres from the flag a duelist may stand; past it for OUT_MS, they forfeit.
  const RADIUS = 30, OUT_MS = 10000;
  // A challenge stands INVITE_MS; from the accept, COUNTDOWN_MS before the first blow counts; MAX_MS in all is a draw.
  const INVITE_MS = 30000, COUNTDOWN_MS = 3000, MAX_MS = 180000;
  // Two players must stand within CHALLENGE_RANGE of each other to start one.
  const CHALLENGE_RANGE = 40;
  const DAMAGE = { shot: 4, head: 10, swing: 10, charged: 20, bash: 6 };
  // How far apart, by the room's own last poses, a hit of each kind may land (with slack for a pose in flight).
  const RANGE = { shot: 125, head: 125, swing: 5, charged: 5, bash: 4.5 };
  const HIT_HZ = 12, HIT_BURST = 8, CONTROL_HZ = 1, CONTROL_BURST = 4;
  const OPS = ["challenge", "accept", "decline", "cancel", "hit", "forfeit"];
  const id = (v) => Number.isSafeInteger(v) && v > 0;
  // A client's duel frame as the room takes it, or null to ignore.
  const parse = (msg) => {
    if (!OPS.includes(msg.op)) return null;
    if (msg.op === "hit") return Object.prototype.hasOwnProperty.call(DAMAGE, msg.kind) ? { t: "duel", op: "hit", kind: msg.kind } : null;
    if (msg.op === "cancel" || msg.op === "forfeit") return { t: "duel", op: msg.op };
    return id(msg.to) ? { t: "duel", op: msg.op, to: msg.to } : null;
  };
  // Whether a zone may hold a duel: the island's surface world (voice-blend.js WORLD), never a room under it.
  const zoneOk = (zone) => typeof zone === "string" && !!BL.voiceBlend && BL.voiceBlend.world(zone) && !zone.startsWith("hq");
  BL.duelRules = Object.freeze({ FEATURE, HP, RADIUS, OUT_MS, INVITE_MS, COUNTDOWN_MS, MAX_MS, CHALLENGE_RANGE, DAMAGE, RANGE, HIT_HZ, HIT_BURST, CONTROL_HZ, CONTROL_BURST, parse, zoneOk });
})();
