// Reactions' contract, shared unchanged by the classic page (reactions.js) and the Worker (worker/src/protocol.js), as
// chat-policy.js is: an emoji a signed-in player shows over their Ooga for a moment, and the raised hand they keep up
// until they lower it. A reaction is one emoji from emoji-data.js, plain or in one of its five skin tones, never text.
// DEFAULTS are the reaction bar's ten until a visitor changes one; HAND is pinned beside them, and HANDS holds it in each
// tone, ready to draw. `toned(emoji, tone)` is an emoji in tone 0 (none, the yellow) to 5 (dark), itself where it takes
// none; `tone(value)` says whether a value is one of those; `valid` is the room's test for a reaction.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const DATA = BL.emojiData;
  const DEFAULTS = Object.freeze(["😂", "😲", "😢", "❤️", "💯", "👏", "✊", "👍", "👎", "👋"]);
  const HAND = "✋", LIGHT = "\u{1F3FB}", TONE = ["", LIGHT, "\u{1F3FC}", "\u{1F3FD}", "\u{1F3FE}", "\u{1F3FF}"];
  const HANDS = Object.freeze(TONE.map((t) => HAND + t));
  // The longest emoji in the data is well under this many UTF-16 units; anything longer is refused unread.
  const MAX = 32;
  let lights = null, accepted = null;
  // Built once, on the first question: every emoji's light-skin form by the emoji, and every form the room accepts.
  const index = () => {
    lights = new Map();
    accepted = new Set();
    for (const group of DATA.groups) for (const [emoji, , light] of group.emoji) {
      accepted.add(emoji);
      if (!light) continue;
      lights.set(emoji, light);
      for (let t = 1; t < TONE.length; t++) accepted.add(light.replaceAll(LIGHT, TONE[t]));
    }
  };
  const toned = (emoji, tone) => {
    if (!lights) index();
    const light = tone > 0 && lights.get(emoji);
    return light ? light.replaceAll(LIGHT, TONE[tone]) : emoji;
  };
  const takesTone = (emoji) => {
    if (!lights) index();
    return lights.has(emoji);
  };
  const known = (emoji) => {
    if (!accepted) index();
    return accepted.has(emoji);
  };
  const tone = (value) => Number.isInteger(value) && value >= 0 && value < TONE.length;
  const valid = (value) => typeof value === "string" && value.length > 0 && value.length <= MAX && known(value);
  BL.reactionPolicy = Object.freeze({ DEFAULTS, HAND, HANDS, MAX, TONES: TONE.length, toned, takesTone, known, tone, valid });
})();
