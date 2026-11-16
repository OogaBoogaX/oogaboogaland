// Reactions on the island (docs/auth-and-presence.md, Reactions): the shared emoji bar (reaction-bar.js) over the room
// (net.js `sendReaction` and `setHand`), under Contributing Oogas' and Online Oogas' lists and under The Commons' input,
// the bars sharing one state; `mount` adds Ooga Chat's panel's (cloud-panel.js), whose hand only an active speaker may raise. A tap shows that
// emoji over the visitor's Ooga for everyone in their zone for a moment (drawn by remote-players.js); the raised hand
// stays over it until lowered. net.js spends one bucket, mirroring the room's, for reactions and the hand alike, so a tap
// the room would drop shows nothing here either. `toggleHand` is the H key's (director.js).
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const reactions = BL.reactionBar.create(BL.net);
  for (const id of ["roster-reactions", "players-reactions", "chat-reactions"]) reactions.mount(document.getElementById(id));
  BL.reactions = reactions;
})();
