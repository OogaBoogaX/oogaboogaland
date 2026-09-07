// Free-flight input from keys and two joysticks
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp } = BL.math;
  const KEYS = {
    w: "forward", s: "back", a: "left", d: "right", q: "yawLeft", e: "yawRight", r: "pitchDown", f: "pitchUp",
    z: "up", " ": "up", x: "down", arrowup: "forward", arrowdown: "back", arrowleft: "left", arrowright: "right"
  };
  const KNOB = 18;
  // One joystick, knob tracking the pointer in -1..1
  const joystick = (el) => {
    const knob = el.firstElementChild;
    const s = { x: 0, y: 0, id: null };
    const onMove = (e) => {
      if (e.pointerId !== s.id) return;
      const r = el.getBoundingClientRect();
      const max = Math.max(1, r.width / 2 - KNOB);
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      if (d > max) {
        dx *= max / d;
        dy *= max / d;
      }
      knob.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
      s.x = dx / max;
      s.y = -dy / max;
    };
    const onDown = (e) => {
      if (s.id !== null) return;
      e.preventDefault();
      s.id = e.pointerId;
      el.setPointerCapture(e.pointerId);
      el.classList.add("live");
      onMove(e);
    };
    const onUp = (e) => {
      if (e.pointerId !== s.id) return;
      s.id = null;
      s.x = s.y = 0;
      knob.style.transform = "";
      el.classList.remove("live");
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    s.dispose = () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      onUp({ pointerId: s.id });
    };
    return s;
  };
  // Joystick bases, a hold-to-climb button, and a Space handler
  const create = ({ move = null, look = null, boost = null, onAction = null } = {}) => {
    const held = { forward: 0, back: 0, left: 0, right: 0, yawLeft: 0, yawRight: 0, pitchDown: 0, pitchUp: 0, up: 0, down: 0, boost: 0 };
    const axes = { x: 0, y: 0, up: 0, yaw: 0, pitch: 0 };
    const typing = (e) => e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || (e.target.closest && e.target.closest("dialog")));
    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      const name = KEYS[e.key.toLowerCase()];
      if (!name) return;
      if (e.key === " " || e.key.startsWith("Arrow")) e.preventDefault();
      if (e.key === " " && !e.repeat && onAction && onAction()) return;
      held[name] = 1;
    };
    const onKeyUp = (e) => {
      const name = KEYS[e.key.toLowerCase()];
      if (name) held[name] = 0;
    };
    const onBlur = () => {
      for (const name in held) held[name] = 0;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    const moveStick = move ? joystick(move) : null;
    const lookStick = look ? joystick(look) : null;
    // The button still fires its own click
    const onBoostDown = () => {
      held.boost = 1;
    };
    const onBoostUp = () => {
      held.boost = 0;
    };
    if (boost) {
      boost.addEventListener("pointerdown", onBoostDown);
      boost.addEventListener("pointerup", onBoostUp);
      boost.addEventListener("pointercancel", onBoostUp);
      boost.addEventListener("pointerleave", onBoostUp);
    }
    // Yaw positive left, pitch positive down
    const read = () => {
      axes.x = clamp(held.right - held.left + (moveStick ? moveStick.x : 0), -1, 1);
      axes.y = clamp(held.forward - held.back + (moveStick ? moveStick.y : 0), -1, 1);
      axes.up = clamp(held.up + held.boost - held.down, -1, 1);
      axes.yaw = clamp(held.yawLeft - held.yawRight - (lookStick ? lookStick.x : 0), -1, 1);
      axes.pitch = clamp(held.pitchDown - held.pitchUp - (lookStick ? lookStick.y : 0), -1, 1);
      return axes;
    };
    const dispose = () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      if (boost) {
        boost.removeEventListener("pointerdown", onBoostDown);
        boost.removeEventListener("pointerup", onBoostUp);
        boost.removeEventListener("pointercancel", onBoostUp);
        boost.removeEventListener("pointerleave", onBoostUp);
      }
      if (moveStick) moveStick.dispose();
      if (lookStick) lookStick.dispose();
      onBlur();
    };
    return { read, axes, dispose };
  };
  BL.controls = { create };
})();
