// Shared ghost geometry for island NPC tracks and deferred Cloud Hopper replays.
// Kept eager so island ghosts do not depend on downloading the optional game.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const style = (source) => {
    const geometry = BL.models.merge(source);
    for (const face of geometry.faces) {
      const light = (face.color[0] + face.color[1] + face.color[2]) / 765;
      face.color = [105 + light * 50, 190 + light * 45, 225 + light * 30];
      face.emissive = 0.35;
    }
    for (const line of geometry.lines) line.color = [150, 225, 255];
    geometry.smooth = source.smooth;
    if (source.normals) geometry.normals = source.normals;
    geometry.glass = 0.3;
    geometry.castShadow = false;
    geometry.characterPart = true;
    return geometry;
  };
  BL.ghostStyle = style;
})();
