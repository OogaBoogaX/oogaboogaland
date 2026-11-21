// Short, damped reflections for the Observatory. This is a parallel receive-only
// path: callers retain their dry connection and put their mute/volume after it.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {}, listeners = new Set();
  const TAPS = [[0.037, 0.12, -0.45], [0.067, 0.075, 0.4], [0.113, 0.04, -0.1]];
  let active = false;
  const setActive = on => {
    on = !!on;
    if (active === on) return;
    active = on;
    for (const refresh of listeners) refresh();
  };
  const create = (context, source, output, amount = 1) => {
    const nodes = [];
    let send = null, wet = null;
    const keep = node => { nodes.push(node); return node; };
    const build = () => {
      send = keep(context.createGain()); send.gain.value = 0;
      wet = keep(context.createGain()); wet.gain.value = 0; wet.connect(output);
      const low = keep(context.createBiquadFilter()), high = keep(context.createBiquadFilter());
      high.type = "highpass"; high.frequency.value = 180; high.Q.value = 0.5;
      low.type = "lowpass"; low.frequency.value = 2600; low.Q.value = 0.5;
      source.connect(send); send.connect(high); high.connect(low);
      // No feedback loop: the last reflection ends after 113 ms plus the filter's short decay.
      for (const [seconds, level, side] of TAPS) {
        const delay = keep(context.createDelay(0.15)), gain = keep(context.createGain()), pan = keep(context.createStereoPanner());
        delay.delayTime.value = seconds; gain.gain.value = level * amount; pan.pan.value = side;
        low.connect(delay); delay.connect(gain); gain.connect(pan); pan.connect(wet);
      }
    };
    const refresh = () => {
      if (active && !send) build();
      if (!send) return;
      const now = context.currentTime;
      send.gain.cancelScheduledValues(now); send.gain.setValueAtTime(active ? 1 : 0, now);
      wet.gain.cancelScheduledValues(now);
      if (active) wet.gain.setTargetAtTime(1, now, 0.025);
      else wet.gain.setValueAtTime(0, now); // No room tail follows the listener through the mirror.
    };
    listeners.add(refresh); refresh();
    return { dispose() {
      listeners.delete(refresh);
      if (send) source.disconnect(send);
      for (const node of nodes) node.disconnect();
      nodes.length = 0; send = wet = null;
    } };
  };
  BL.roomAcoustics = { create, setActive, get active() { return active; } };
})();
