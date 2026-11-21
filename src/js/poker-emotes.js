// The Ember Den's table emotes: the ten a player sends from the table view, each one emoji over the room's existing
// reaction message, and the six gestures a seated Ooga acts out for them. `byEmoji` tells a received reaction that is
// one of the ten from any other, ignoring a skin tone. `gesture(cave, kind, t)` poses a seated caveman for gesture
// `kind` at `t` (0 to 1) of its run over the sitting pose applied this frame: it writes only the arms' x and y and, for
// the gestures that move it, the head's x, and at `t <= 0` or `t >= 1` writes exactly the sitting pose's arms (x -0.9,
// y 0, as `BL.pokerModels.sitPose` and the rig have them) and a level head. The arms' z, which differs by figure, is
// never written. It allocates nothing. Loads in Node; depends on no other module.
(() => {
  "use strict";
  const BL = window.BL;
  const GESTURES = Object.freeze(["", "knock", "armsUp", "headInHands", "clap", "shrug", "salute"]);
  const KNOCK = 1, ARMS_UP = 2, HEAD_IN_HANDS = 3, CLAP = 4, SHRUG = 5, SALUTE = 6;
  const entry = (id, emoji, name, gesture) => Object.freeze({ id, emoji, name, gesture });
  const EMOTES = Object.freeze([
    entry("nice", "👍", "Nice hand", KNOCK), entry("gg", "🤝", "Good game", 0), entry("wow", "😮", "Wow", ARMS_UP),
    entry("phew", "😅", "Phew", 0), entry("laugh", "😂", "Laugh", 0), entry("groan", "😩", "Groan", HEAD_IN_HANDS),
    entry("clap", "👏", "Slow clap", CLAP), entry("think", "🤔", "Thinking", 0), entry("shrug", "🤷", "Shrug", SHRUG),
    entry("salute", "🫡", "Salute", SALUTE)
  ]);
  const SHOW_TIME = 2.6, GESTURE_TIME = 1.5;
  const BY = new Map(EMOTES.map(e => [e.emoji, e])), TONES = /[\u{1F3FB}-\u{1F3FF}]/gu;
  const byEmoji = emoji => typeof emoji === "string" && emoji ? BY.get(emoji.replace(TONES, "")) || null : null;
  // The sitting pose's arms and a level head; +x on the head bows it, -x on an arm brings it forward and up, and +y
  // turns the right arm (at -x) toward the middle, -y the left.
  const SIT_ARMS = -0.9, TAU = Math.PI * 2;
  const pose = (part, x, y) => { if (part) { part.rotation.x = x; part.rotation.y = y; } };
  const nod = (part, x) => { if (part) part.rotation.x = x; };
  const gesture = (cave, kind, t) => {
    const p = cave.parts, head = kind === ARMS_UP || kind === HEAD_IN_HANDS || kind === SHRUG;
    if (!(t > 0 && t < 1)) {
      pose(p.armL, SIT_ARMS, 0); pose(p.armR, SIT_ARMS, 0);
      if (head) nod(p.head, 0);
      return;
    }
    // In over the first fifth and out over the last, smoothstepped.
    const u = t < 0.2 ? t / 0.2 : t > 0.8 ? (1 - t) / 0.2 : 1, e = u * u * (3 - 2 * u);
    if (kind === KNOCK) {
      // The right hand lifts and raps the rail twice; the left stays put.
      const beat = 0.5 - 0.5 * Math.cos(TAU * 2 * t);
      pose(p.armR, SIT_ARMS - e * (0.15 + 0.35 * beat), 0.25 * e); pose(p.armL, SIT_ARMS, 0);
    } else if (kind === ARMS_UP) {
      const wave = 0.25 * Math.sin(TAU * 3 * t);
      pose(p.armR, SIT_ARMS + e * (-1.7 + wave), 0); pose(p.armL, SIT_ARMS + e * (-1.7 - wave), 0);
      nod(p.head, -0.15 * e);
    } else if (kind === HEAD_IN_HANDS) {
      // Both hands up over the face and the head bowed into them, rocking slowly.
      pose(p.armR, SIT_ARMS - 1.5 * e, 0.4 * e); pose(p.armL, SIT_ARMS - 1.5 * e, -0.4 * e);
      nod(p.head, e * (0.45 + 0.06 * Math.sin(TAU * 2 * t)));
    } else if (kind === CLAP) {
      // Three slow claps: arms forward, the hands swinging in to meet and apart.
      const meet = 0.5 - 0.5 * Math.cos(TAU * 3 * t), y = e * (0.12 + 0.33 * meet);
      pose(p.armR, SIT_ARMS - 0.5 * e, y); pose(p.armL, SIT_ARMS - 0.5 * e, -y);
    } else if (kind === SHRUG) {
      // Arms out and open, the chin up a little.
      pose(p.armR, SIT_ARMS - 0.3 * e, -0.55 * e); pose(p.armL, SIT_ARMS - 0.3 * e, 0.55 * e);
      nod(p.head, -0.12 * e);
    } else if (kind === SALUTE) {
      // The right hand up to the brow and held.
      pose(p.armR, SIT_ARMS - 1.65 * e, 0.6 * e); pose(p.armL, SIT_ARMS, 0);
    }
  };
  BL.pokerEmotes = Object.freeze({ EMOTES, GESTURES, SHOW_TIME, GESTURE_TIME, byEmoji, gesture });
})();
