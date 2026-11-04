// View assist for scenes without the hub's visibility stack: when scenery hides the visitor's own character from the
// camera, its outline is drawn over the view in the hub's own rim (camera-cover.js), fading in and out. A scene says
// only what is solid (`solidAt(x, y, z)`); the line from the eye to the body's middle and to its head is sampled every
// STEP, and the body counts as hidden while both are blocked. First person (closeMix 1) never outlines.
// `update(camera, root, x, feet, z, height, dt, closeMix)`: `root` is the node outlined (its world matrices), the
// body stands at (x, feet, z) and is `height` tall; a null root shows nothing. It allocates nothing; call it after the
// scene's fx.drawOverlay, which clears the overlay. `dispose` in leave.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const STEP = 0.2, MAX_STEPS = 160, SKIP_EYE = 0.1, SKIP_BODY = 0.45, FADE = 6, OPACITY = 0.22;
  const create = ({ overlay, solidAt }) => {
    const cover = BL.cameraCover.create(overlay);
    const state = { hidden: false, opacity: 0, outlined: false };
    const blocked = (eye, x, y, z) => {
      const dx = x - eye.x, dy = y - eye.y, dz = z - eye.z, length = Math.hypot(dx, dy, dz);
      const end = length - SKIP_BODY;
      if (end <= SKIP_EYE) return false;
      const steps = Math.min(MAX_STEPS, Math.ceil((end - SKIP_EYE) / STEP));
      for (let i = 0; i <= steps; i++) {
        const t = (SKIP_EYE + (end - SKIP_EYE) * i / steps) / length;
        if (solidAt(eye.x + dx * t, eye.y + dy * t, eye.z + dz * t)) return true;
      }
      return false;
    };
    const update = (camera, root, x, feet, z, height, dt, closeMix = 0) => {
      let hidden = false;
      if (root && root.visible && closeMix < 1) {
        hidden = blocked(camera.position, x, feet + height * 0.5, z) && blocked(camera.position, x, feet + height * 0.92, z);
      }
      state.hidden = hidden;
      const target = hidden ? OPACITY * (1 - closeMix) : 0;
      state.opacity += (target - state.opacity) * Math.min(1, dt * FADE);
      if (state.opacity < 0.005 || !root) { state.opacity = 0; state.outlined = false; return; }
      cover.state.opacity = state.opacity;
      cover.draw(camera, root, false, true, null, null, null, dt, 0, null, null, true);
      state.outlined = cover.state.outlined;
    };
    return { update, state, dispose: () => cover.dispose() };
  };
  BL.viewAssist = { create };
})();
