// Page-wide environment sound. Voice chat owns its own audio and never joins this bus.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const KEY = "oogaboogaland.audio", listeners = new Set(), outputs = new WeakMap();
  let muted = false;
  try { muted = localStorage.getItem(KEY) === "off"; } catch {}
  const setMuted = (on) => {
    on = !!on;
    if (muted === on) return muted;
    muted = on;
    try { localStorage.setItem(KEY, muted ? "off" : "on"); } catch {}
    for (const listener of listeners) listener(muted);
    return muted;
  };
  const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
  // Short-lived effects use a gated output; closing their context also releases the subscription.
  const output = (context) => {
    let gain = outputs.get(context);
    if (gain) return gain;
    gain = context.createGain(); gain.gain.value = muted ? 0 : 1;
    gain.connect(context.destination); outputs.set(context, gain);
    const off = subscribe(on => gain.gain.setTargetAtTime(on ? 0 : 1, context.currentTime, 0.015));
    const closed = () => {
      if (context.state !== "closed") return;
      off(); outputs.delete(context); context.removeEventListener("statechange", closed);
    };
    context.addEventListener("statechange", closed);
    return gain;
  };
  window.addEventListener("storage", event => {
    if (event.key === KEY || event.key === null) setMuted(event.newValue === "off");
  });
  BL.sound = { setMuted, toggle: () => setMuted(!muted), subscribe, output, get muted() { return muted; } };
})();
