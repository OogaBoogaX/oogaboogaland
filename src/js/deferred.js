// Code a hosted page fetches only once it is needed: the Timechain rooms; DSB Land (its terrain, town, interiors, menus
// and their art, ~0.9 MB gzipped), which ₿IFRÖST's chamber also builds a picture of; the arcade's games (their rules,
// the retro cabinets and the hall's sound), loaded by the arcade and every game in it; the poker room (all but its
// themes, which tint the island's ₿IFRÖST window), loaded by the room and ₿IFRÖST; and Ooga Drop's diver and sound (not its
// models, whose canopy Ooga Orbit's capsule lands under). `npm run site` moves each group's modules out of the page into
// js/<group>-<hash>.js and names the file here (`BL.deferredScripts`, written ahead of every module); the portable
// single-file page and the source tree carry the modules already, so `load` finds them present and answers at once
// with null, with no request. Otherwise it adds one same-origin script (the page's policy allows 'self'), bounded by
// TIMEOUT_MS; a failure or timeout rejects and is forgotten, so the next `load` tries again.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const TIMEOUT_MS = 20000;
  // How each group shows it has arrived: the module that runs last in it.
  const PRESENT = { kiosk: () => typeof BL.factoryKiosk?.create === "function", "lab-wallpaper": () => !!BL.labWallpaper?.src, canvas: () => !!BL.canvasRenderer, timechain: () => !!BL.timechainInterior, dsb: () => !!BL.dsbCollision, arcade: () => !!BL.carnivalAudio, poker: () => !!BL.pokerHud, drop: () => !!BL.dropAudio };
  // Only scene implementation groups depend on a base group; no base group depends on a scene shell.
  // The race/mine/orbit predicates arrive with their independent module extraction; otherwise those modules are inline.
  const SCENE_BASE = { "factory-scene": "kiosk", "arcade-scene": "arcade", "race-scene": "race", "drop-scene": "drop", "mine-scene": "mine", "orbit-scene": "orbit" };
  const loading = new Map();
  const load = (group) => {
    if (PRESENT[group]()) return null;
    if (loading.has(group)) return loading.get(group);
    const src = BL.deferredScripts && BL.deferredScripts[group];
    if (!src) return Promise.reject(new Error(`No ${group} code on this page`));
    const base = SCENE_BASE[group], prerequisite = base && typeof PRESENT[base] === "function" ? load(base) : null;
    const start = () => new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const finish = (error) => {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (!error && !PRESENT[group]()) error = new Error(`The ${group} code did not start`);
        if (error) {
          script.remove();
          loading.delete(group);
          reject(error);
        } else resolve(null);
      };
      const timer = setTimeout(() => finish(new Error(`The ${group} code took too long`)), TIMEOUT_MS);
      script.onload = () => finish(null);
      script.onerror = () => finish(new Error(`The ${group} code could not be fetched`));
      script.src = src;
      document.head.appendChild(script);
    });
    const promise = prerequisite ? prerequisite.then(start, (error) => { loading.delete(group); throw error; }) : start();
    loading.set(group, promise);
    return promise;
  };
  const prefetching = new Set(), retryAt = new Map(), sceneGroups = Object.create(null);
  // Hover/proximity can recur every frame. Attach just one completion handler, and back off optional failures;
  // a deliberate prepare still retries immediately through load().
  const prefetch = (group) => {
    if (typeof PRESENT[group] !== "function" || document.hidden || PRESENT[group]() || prefetching.has(group) || Date.now() < (retryAt.get(group) || 0)) return;
    prefetching.add(group);
    const loading = load(group);
    if (loading) loading.then(() => { prefetching.delete(group); retryAt.delete(group); }, () => {
      prefetching.delete(group); retryAt.set(group, Date.now() + 60000);
    });
    else prefetching.delete(group);
  };
  const prefetchScene = (id) => {
    const groups = sceneGroups[id];
    if (groups) for (let i = 0; i < groups.length; i++) prefetch(groups[i]);
    else prefetch(id);
  };
  // A hosted scene keeps its shell's identity while its implementation arrives: the director may already hold it.
  // Portable builds evaluate the same modules inline and fill these shells before boot, so they still fetch nothing.
  const scene = (id, definition = null) => {
    const scenes = BL.scenes = BL.scenes || {}, target = scenes[id] || (scenes[id] = { id });
    if (definition) Object.defineProperties(target, Object.getOwnPropertyDescriptors(definition));
    else {
      const group = `${id}-scene`;
      sceneGroups[id] = [group, id];
      PRESENT[group] = () => typeof target.enter === "function";
      const prepare = (place, ctx, scope) => {
        const loading = load(group);
        const prepared = () => target.prepare !== prepare ? BL.buildTasks.measure(() => BL.models.withScope(scope || id, () => target.prepare(place, ctx, scope))) : null;
        return loading ? loading.then(prepared) : prepared();
      };
      target.prepare = prepare;
    }
    return target;
  };
  BL.deferred = { load, scene, prefetch, prefetchScene, present: (group) => PRESENT[group](), get pending() { return loading.size; } };
})();
