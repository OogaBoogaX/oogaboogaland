// Page-wide environment sound. Voice chat owns its own audio and never joins this bus.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const KEY = "oogaboogaland.audio", LEVELS_KEY = "oogaboogaland.audio-levels";
  // `gates`: each context's way out and its context, kept until that context is seen closed.
  // `uses`: how many channels play straight into a context's way out, so the last to let go takes it down.
  const listeners = new Set(), watchers = new Set(), outputs = new WeakMap(), gates = new Map(), uses = new WeakMap();
  // Every sound a visitor can turn up or down by itself (the speaker button's panel, sound-panel.js), in the
  // panel's order. A module holds its channel while it lives, so the panel lists only what this place can sound.
  // `music` is every place's and game's music at once (a radio, a game's score, a room's tune): its row stands with the
  // level of everything, so it is never on the place's list.
  const NAMES = [
    ["footsteps", "Footsteps"], ["rain", "Rain"], ["wind", "Wind"], ["thunder", "Thunder"], ["surf", "Waves"],
    ["pets", "Pets"], ["horn", "Heimdall's horn"], ["pile", "Banana pile"], ["bifrost", "₿IFRÖST chamber"],
    ["factory", "Lightning Factory"], ["hangar", "Jet Hangar"], ["arcade", "Arcade"],
    ["music", "Music"], ["hunt", "Ghost hunt"], ["hopper", "Cloud Hopper"],
    ["block", "Block Frenzy"], ["drop", "Ooga Drop"], ["mine", "Ooga Mine"], ["race", "Ooga Rally"], ["orbit", "Ooga Orbit"],
    ["poker", "Poker table"], ["room", "Room hum"], ["temple", "Temple bells"],
    ["lecture", "Lecture"], ["dsb", "DSB Land"],
    ["workshop", "Workshop hum"], ["wallets", "Wallet alarms"]
  ];
  const channelsById = new Map();
  for (const [id, label] of NAMES) channelsById.set(id, { id, label, level: 1, refs: 0, nodes: new Map(), listeners: new Set() });
  const musicRecord = channelsById.get("music");
  let muted = false, master = 1;
  const level01 = (value) => typeof value === "number" && value >= 0 && value <= 1;
  // The saved levels, checked a field at a time: anything that is not a level from 0 to 1 for a known sound is full.
  const read = (text) => {
    let saved = null;
    try { saved = JSON.parse(text); } catch {}
    const levels = saved && typeof saved === "object" && saved.levels && typeof saved.levels === "object" ? saved.levels : {};
    master = saved && level01(saved.master) ? saved.master : 1;
    for (const record of channelsById.values()) record.level = level01(levels[record.id]) ? levels[record.id] : 1;
  };
  try { muted = localStorage.getItem(KEY) === "off"; read(localStorage.getItem(LEVELS_KEY)); } catch {}
  const save = () => {
    const levels = {};
    for (const record of channelsById.values()) if (record.level !== 1) levels[record.id] = record.level;
    try { localStorage.setItem(LEVELS_KEY, JSON.stringify({ master, levels })); } catch {}
  };
  const ease = (node, context, value) => node.gain.setTargetAtTime(value, context.currentTime, 0.015);
  const prune = () => { for (const [node, context] of gates) if (context.state === "closed") gates.delete(node); };
  const gate = () => {
    prune();
    for (const [node, context] of gates) ease(node, context, muted ? 0 : master);
  };
  const tell = (record) => {
    for (const [node, context] of record.nodes) ease(node, context, record.level);
    for (const listener of record.listeners) listener(record.level * master);
  };
  const changed = () => { for (const watcher of watchers) watcher(); };
  const setMuted = (on) => {
    on = !!on;
    if (muted === on) return muted;
    muted = on;
    try { localStorage.setItem(KEY, muted ? "off" : "on"); } catch {}
    gate();
    for (const listener of listeners) listener(muted);
    return muted;
  };
  const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
  // A context's way out: silent while muted, else at the level of everything. A closed context's is let go the next
  // time one is made or the level moves.
  const output = (context) => {
    let gain = outputs.get(context);
    if (gain) return gain;
    prune();
    gain = context.createGain(); gain.gain.value = muted ? 0 : master;
    gain.connect(context.destination); outputs.set(context, gain); gates.set(gain, context);
    return gain;
  };
  // One sound's level, held from a module's `create` to its `dispose`. `node(context)` is where that sound plays into
  // (its own level, then `output`); with `to`, a level in the middle of a module's own graph. A sound played by an
  // element reads `gain` (its level times everything's) and hears it change through `subscribe`. `release`
  // disconnects what it made, so nothing is left wired when a module goes.
  const channel = (id) => {
    const record = channelsById.get(id);
    if (!record) throw new Error(`sound: no channel "${id}"`);
    const nodes = [], heard = [], contexts = [], direct = new WeakMap();
    let held = true, shown = true;
    if (++record.refs === 1) changed();
    return {
      id,
      get level() { return record.level; },
      get gain() { return record.level * master; },
      node(context, to) {
        let node = to ? null : direct.get(context);
        if (node) return node;
        node = context.createGain(); node.gain.value = record.level; node.connect(to || output(context));
        record.nodes.set(node, context); nodes.push(node);
        if (!to) { direct.set(context, node); contexts.push(context); uses.set(context, (uses.get(context) || 0) + 1); }
        return node;
      },
      subscribe(listener) { record.listeners.add(listener); heard.push(listener); return () => record.listeners.delete(listener); },
      // Off the panel's list while this place cannot sound it, without letting its nodes go.
      show(on) {
        on = !!on;
        if (!held || shown === on) return;
        shown = on;
        if (on ? ++record.refs === 1 : --record.refs === 0) changed();
      },
      release() {
        if (!held) return;
        held = false;
        for (const node of nodes) { record.nodes.delete(node); node.disconnect(); }
        for (const listener of heard) record.listeners.delete(listener);
        for (const context of contexts) {
          const left = uses.get(context) - 1, gain = outputs.get(context);
          uses.set(context, left);
          if (!left && gain) { gain.disconnect(); gates.delete(gain); outputs.delete(context); }
        }
        nodes.length = heard.length = contexts.length = 0;
        if (shown && --record.refs === 0) changed();
      }
    };
  };
  const setLevel = (id, value) => {
    const record = channelsById.get(id);
    if (!record) throw new Error(`sound: no channel "${id}"`);
    value = Math.min(1, Math.max(0, Number(value) || 0));
    if (record.level === value) return value;
    record.level = value; tell(record); save(); changed();
    return value;
  };
  const setMaster = (value) => {
    value = Math.min(1, Math.max(0, Number(value) || 0));
    if (master === value) return value;
    master = value; gate();
    for (const record of channelsById.values()) for (const listener of record.listeners) listener(record.level * master);
    save(); changed();
    return value;
  };
  const resetLevels = () => {
    master = 1; gate();
    for (const record of channelsById.values()) { record.level = 1; tell(record); }
    save(); changed();
  };
  // The sounds this place holds now, in the panel's order.
  const channels = () => {
    const list = [];
    for (const record of channelsById.values()) if (record.refs > 0 && record !== musicRecord) list.push({ id: record.id, label: record.label, level: record.level });
    return list;
  };
  const watch = (watcher) => { watchers.add(watcher); return () => watchers.delete(watcher); };
  window.addEventListener("storage", event => {
    if (event.key === KEY || event.key === null) setMuted(event.newValue === "off");
    if (event.key === LEVELS_KEY || event.key === null) {
      read(event.newValue); gate();
      for (const record of channelsById.values()) tell(record);
      changed();
    }
  });
  BL.sound = { setMuted, toggle: () => setMuted(!muted), subscribe, output, channel, channels, setLevel, setMaster, resetLevels, watch,
    setMusic: (value) => setLevel("music", value),
    get muted() { return muted; }, get master() { return master; }, get music() { return musicRecord.level; } };
})();
