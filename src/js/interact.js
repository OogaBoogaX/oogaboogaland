(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { boundsOf } = BL.scene;
  const TAP_PX = 7;
  const TAP_MS = 420;
  const LONG_PRESS_MS = 320;
  // Double-tap window on one target
  const DOUBLE_MS = 380;
  const DOUBLE_PX = 24;
  const create = ({ canvas, renderer, camera, hooks = {} }) => {
    const targets = [];
    const pointers = new Map();
    const ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
    const C = new Float32Array(3);
    let hoverX = -1, hoverY = -1, hoverDirty = false, hovered = null;
    let gesture = null;
    let pinchDist = 0;
    let longPressTimer = 0;
    const lastTap = { at: -Infinity, node: null, owner: null, x: 0, y: 0 };
    // Every body part of one caveman is the same target, so a poke hop cannot break a double tap
    const sameTarget = (hit) => hit ? hit.node === lastTap.node || (!!hit.owner.cave && !!lastTap.owner && hit.owner.cave === lastTap.owner.cave) : lastTap.node === null;
    const call = (name, ...args) => hooks[name] ? hooks[name](...args) : undefined;
    const add = (node, owner, { radius = 0 } = {}) => {
      targets.push({ node, owner, radius });
    };
    const remove = (node) => {
      const i = targets.findIndex((t) => t.node === node);
      if (i >= 0) targets.splice(i, 1);
      if (hovered === node) {
        hovered = null;
        call("onHover", null, { x: hoverX, y: hoverY });
        canvas.style.cursor = "grab";
      }
    };
    const nodeShown = (node) => {
      for (let n = node; n; n = n.parent) if (!n.visible) return false;
      return true;
    };
    const worldScale = (m) => Math.max(Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10]));
    const pick = (px, py) => {
      renderer.ray(px, py, camera, ray);
      let best = null, bestT = Infinity, bestPriority = -Infinity;
      for (const t of targets) {
        const { node } = t;
        if (!node.geometry || !nodeShown(node)) continue;
        const b = boundsOf(node.geometry);
        const m = node.world;
        BL.math.mat4.transformPoint(C, m, b.center[0], b.center[1], b.center[2]);
        const r = (t.radius || b.radius) * worldScale(m);
        const lx = C[0] - ray.ox, ly = C[1] - ray.oy, lz = C[2] - ray.oz;
        const tca = lx * ray.dx + ly * ray.dy + lz * ray.dz;
        if (tca < 0) continue;
        const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
        if (d2 > r * r) continue;
        const thc = Math.sqrt(r * r - d2);
        const hitT = tca - thc;
        const priority = t.owner.priority || 0;
        if (priority > bestPriority || (priority === bestPriority && hitT < bestT)) {
          bestT = hitT;
          bestPriority = priority;
          best = t;
        }
      }
      return best ? { node: best.node, owner: best.owner, t: bestT } : null;
    };
    const groundPoint = (px, py, planeY, out) => {
      renderer.ray(px, py, camera, ray);
      if (Math.abs(ray.dy) < 1e-5) return null;
      const t = (planeY - ray.oy) / ray.dy;
      if (t < 0) return null;
      out.x = ray.ox + ray.dx * t;
      out.y = planeY;
      out.z = ray.oz + ray.dz * t;
      return out;
    };
    const local = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const clearLongPress = () => {
      if (longPressTimer) {
        window.clearTimeout(longPressTimer);
        longPressTimer = 0;
      }
    };
    const startGrab = (hit, p) => {
      if (call("onGrabStart", hit, p) === false) return false;
      gesture.mode = "grab";
      gesture.hit = hit;
      canvas.style.cursor = "grabbing";
      return true;
    };
    const onPointerDown = (e) => {
      const p = local(e);
      pointers.set(e.pointerId, p);
      canvas.setPointerCapture(e.pointerId);
      if (pointers.size === 2) {
        clearLongPress();
        if (gesture && gesture.mode === "grab") {
          call("onGrabEnd", gesture.hit, p, null, true);
          canvas.style.cursor = "grab";
        }
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        gesture = { mode: "pinch" };
        return;
      }
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const hit = pick(p.x, p.y);
      gesture = { mode: "pending", start: p, last: p, at: performance.now(), hit, pointerId: e.pointerId, moved: false };
      if (hit && hit.owner.grab) {
        if (e.pointerType === "mouse") startGrab(hit, p);
        else {
          longPressTimer = window.setTimeout(() => {
            longPressTimer = 0;
            if (gesture && gesture.mode === "pending" && !gesture.moved) startGrab(hit, gesture.last);
          }, LONG_PRESS_MS);
        }
      }
    };
    const onPointerMove = (e) => {
      const p = local(e);
      if (e.pointerType === "mouse") {
        hoverX = p.x;
        hoverY = p.y;
        hoverDirty = true;
      }
      // Both mouse buttons make a walk that drags to turn: no tap on release, no grab in hand. Pressed
      // together they arrive as one move with no pointerdown at all, so the chord registers its own pointer
      if (e.pointerType === "mouse" && (e.buttons & 3) === 3 && (!gesture || (gesture.pointerId === e.pointerId && gesture.mode !== "chord"))) {
        clearLongPress();
        if (gesture && gesture.mode === "grab") call("onGrabEnd", gesture.hit, p, null, true);
        pointers.set(e.pointerId, p);
        canvas.setPointerCapture(e.pointerId);
        gesture = { mode: "chord", start: p, last: p, at: performance.now(), hit: null, pointerId: e.pointerId, moved: true };
        canvas.style.cursor = "grabbing";
        return;
      }
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, p);
      if (!gesture) return;
      if (gesture.mode === "pinch" && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        call("onZoom", pinchDist / d);
        pinchDist = d;
        return;
      }
      if (gesture.pointerId !== e.pointerId) return;
      const dx = p.x - gesture.last.x, dy = p.y - gesture.last.y;
      gesture.last = p;
      if (gesture.mode === "pending") {
        const far = Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > TAP_PX;
        if (far) {
          gesture.moved = true;
          clearLongPress();
          gesture.mode = "orbit";
        }
      }
      if (gesture.mode === "orbit" || gesture.mode === "chord") {
        call("onOrbit", dx, dy);
        canvas.style.cursor = "grabbing";
      } else if (gesture.mode === "grab") {
        call("onGrabMove", gesture.hit, p);
      }
    };
    const endGesture = (e, cancelled) => {
      const p = local(e);
      pointers.delete(e.pointerId);
      clearLongPress();
      if (!gesture) return;
      if (gesture.mode === "pinch") {
        if (pointers.size < 2) gesture = null;
        return;
      }
      if (gesture.pointerId !== e.pointerId) return;
      const g = gesture;
      gesture = null;
      canvas.style.cursor = "grab";
      hoverDirty = true;
      if (g.mode === "grab") {
        const dropHit = cancelled ? null : pick(p.x, p.y);
        call("onGrabEnd", g.hit, p, dropHit && dropHit.node !== g.hit.node ? dropHit : null, cancelled);
      } else if (g.mode === "pending" && !cancelled && performance.now() - g.at < TAP_MS) {
        const node = g.hit ? g.hit.node : null;
        const now = performance.now();
        if (now - lastTap.at < DOUBLE_MS && sameTarget(g.hit) && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < DOUBLE_PX) {
          lastTap.at = -Infinity;
          lastTap.node = null;
          lastTap.owner = null;
          call("onDoubleTap", g.hit, p);
        } else {
          lastTap.at = now;
          lastTap.node = node;
          lastTap.owner = g.hit ? g.hit.owner : null;
          lastTap.x = p.x;
          lastTap.y = p.y;
          call("onTap", g.hit, p);
        }
      }
    };
    const onPointerUp = (e) => endGesture(e, false);
    const onPointerCancel = (e) => endGesture(e, true);
    const onPointerLeave = () => {
      hoverX = -1;
      hoverY = -1;
      hoverDirty = true;
    };
    const onWheel = (e) => {
      e.preventDefault();
      call("onZoom", 1 + Math.max(-60, Math.min(60, e.deltaY)) * 2.5e-3);
    };
    const onContextMenu = (e) => e.preventDefault();
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);
    const update = () => {
      if (!hoverDirty) return;
      hoverDirty = false;
      const busy = gesture && gesture.mode !== "pending";
      const hit = !busy && hoverX >= 0 ? pick(hoverX, hoverY) : null;
      const node = hit ? hit.node : null;
      if (node !== hovered) {
        hovered = node;
        call("onHover", hit, { x: hoverX, y: hoverY });
        if (!busy) canvas.style.cursor = hit ? "pointer" : "grab";
      } else if (hit) {
        call("onHoverMove", hit, { x: hoverX, y: hoverY });
      }
    };
    const dispose = () => {
      clearLongPress();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      targets.length = 0;
      pointers.clear();
      lastTap.node = null;
    };
    return {
      add, remove, pick, groundPoint, update, dispose, get targetCount() {
        return targets.length;
      },
      // A drag is still held, even if it has paused
      get orbiting() {
        return !!gesture && (gesture.mode === "orbit" || gesture.mode === "chord");
      }
    };
  };
  BL.interact = { create };
})();
