// Code a hosted page fetches only once it is needed: the wardrobe's pieces (equipment-wardrobe-data.gen.js), the first
// time a body on the page wears one (in the studio, the first one previewed); the Timechain rooms; DSB Land (its terrain, town, interiors, menus
// and their art, ~0.9 MB gzipped), which ₿IFRÖST's chamber also builds a picture of; the arcade's games (their rules,
// the retro cabinets and the hall's sound), loaded by the arcade and every game in it, and the scenes of every game in
// the hall but a stage cabinet (`carnival-scene`, on that base); Ooga Raid, behind the hall's back door (`raid-scene`,
// on the same base, whose chip its music plays on); Block Frenzy's scene, trivia and sound (not its rules,
// models or live wire, which the arcade's hall reads); the poker room (all but its
// one preset, poker-themes.js, which tints the island's ₿IFRÖST window), loaded by the room and ₿IFRÖST, and each track of its lounge playlist, a group
// of its own fetched only as it comes up; and Ooga Drop's diver and sound (not its
// models, whose canopy Ooga Orbit's capsule lands under). Rally's tracks, racers, items, HUD and sound, Mine's HUD, sound
// and crew, and Orbit's models, HUD and sound load as bases before their scene implementations; their shared model,
// flight and save modules stay inline. `npm run site` moves each group's modules out of the page into
// js/<group>-<hash>.js and names the file here (`BL.deferredScripts`, written ahead of every module); the portable
// single-file page and the source tree carry the modules already, so `load` finds them present and answers at once
// with null, with no request. Otherwise it adds one same-origin script (the page's policy allows 'self'), bounded by
// TIMEOUT_MS; a failure or timeout rejects and is forgotten, so the next `load` tries again. A chunk that runs twice (a
// late copy after a timeout) returns at its head, since its group is already present. Every deploy replaces the chunk
// files, so a tab left open across one finds its chunk gone: an error is probed with a HEAD, and a 404 marks the page
// `stale` and calls `onStale` once, which offers a reload instead of another try that can never work. The page's own
// script and stylesheet (js/main-<hash>.js, css/style-<hash>.css on the Worker's pages) go the same way with any
// deploy that changes the page's code or look, so `check()` asks for them with a HEAD and a 404 is `stale` too. The
// director calls it on events alone (the room's socket back after a drop, which every deploy causes; the tab shown
// again; the network back), at most once every CHECK_MS, never on a timer; a page without those files (the portable
// page, the source tree, `npm run serve`) asks nothing.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const TIMEOUT_MS = 20000, CHECK_MS = 60000;
  // How each group shows it has arrived: the module that runs last in it.
  const PRESENT = { "hat-archives": () => !!BL.characterEquipment?.seeded, wardrobe: () => !!BL.equipmentWardrobe?.seeded, "cloud-hopper": () => !!BL.cloudHopper, "terrain-cache": () => !!BL.terrainCache, "lab-wallpaper": () => !!BL.labWallpaper?.src, canvas: () => !!BL.canvasRenderer, timechain: () => !!BL.timechainInterior, "timechain-genesis": () => !!BL.timechainGenesis, "party-radio": () => !!BL.timechainPartyRadio, dsb: () => !!BL.dsbCollision, arcade: () => !!BL.carnivalAudio, poker: () => !!BL.pokerHud, drop: () => !!BL.dropAudio,
    "block-viewer": () => !!BL.blockViewer, race: () => !!BL.raceAudio, mine: () => !!BL.mineCrew, orbit: () => !!BL.rocketAudio,
    // Each lecture of the Lecture Hall's course, a group of its own (lecture-btc.js names them a to n).
    ...Object.fromEntries([..."abcdefghijklmn"].map((k, i) => [`lecture-btc-${k}`, () => !!(BL.lectures && BL.lectures.get(`btc-${String(i + 1).padStart(2, "0")}`))])),
    // HALLOWEEN: the arcade's ghost hunt, and each track of its playlist.
    halloween: () => !!BL.halloween, "chats-fixture": () => !!BL.oogaChatFixtures, ...Object.fromEntries(["boss", "colt", "martial", "nightmare", "synthed", "nr"].map((k) => [`halloween-track-${k}`, () => !!(BL.ghostMusic && BL.ghostMusic[k])])),
    // The Ember Den's lounge playlist, a group a track (poker-audio.js fetches each as it comes up).
    ...Object.fromEntries(["lobby", "cool", "venus", "bossa"].map((k) => [`lounge-track-${k}`, () => !!(BL.loungeMusic && BL.loungeMusic[k])])) };
  // Only scene implementation groups depend on a base group, and the Timechain rooms on the Block Party's radio, which
  // the keypad outside loads alone to start it early; no base group depends on a scene shell. The Lightning Jet
  // Hangar, walked into from the Factory and left back into it, builds on the Factory's scene group.
  const SCENE_BASE = { "poker-scene": "poker", "arcade-scene": "arcade", "carnival-scene": "arcade", "raid-scene": "arcade", "drop-scene": "drop", "race-scene": "race", "mine-scene": "mine", "orbit-scene": "orbit", "hangar-scene": "factory-scene", timechain: "party-radio", "timechain-genesis": "timechain" };
  const loading = new Map(), attempts = new Map();
  let stale = false, staleHandler = null, checkedAt = -Infinity, checking = false;
  const gone = () => { if (!stale) { stale = true; if (staleHandler) staleHandler(); } };
  // A file that answers 404 is gone for good: the site was deployed since this page loaded.
  const probe = (file, error) => {
    if (typeof fetch !== "function") return Promise.reject(error);
    const controller = new AbortController();
    let timer;
    // A stalled HEAD must release the failed load too; only an answer from the probe can mark the page stale.
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(error), TIMEOUT_MS); });
    return Promise.race([fetch(file, { method: "HEAD", cache: "no-store", signal: controller.signal }), timeout]).then((response) => {
      if (response.status === 404 || response.status === 410) {
        error.stale = true;
        gone();
      }
      throw error;
    }, () => { throw error; }).finally(() => { clearTimeout(timer); controller.abort(); });
  };
  const check = () => {
    if (stale || checking || typeof fetch !== "function" || performance.now() - checkedAt < CHECK_MS) return;
    const files = [...document.querySelectorAll('script[src^="/js/main-"], link[rel="stylesheet"][href^="/css/style-"]')];
    if (!files.length) return;
    checkedAt = performance.now();
    checking = true;
    Promise.all(files.map((el) => fetch(el.getAttribute("src") || el.getAttribute("href"), { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) })
      .then((response) => { if (response.status === 404 || response.status === 410) gone(); }, () => { /* No answer says nothing. */ })))
      .finally(() => { checking = false; });
  };
  const load = (group) => {
    if (PRESENT[group]()) return null;
    if (loading.has(group)) return loading.get(group);
    const file = BL.deferredScripts && BL.deferredScripts[group];
    if (!file) return Promise.reject(new Error(`No ${group} code on this page`));
    // A retry after an error asks under its own address, so a failed response the page still holds (a refused preload)
    // is never reused. A timeout keeps the address: its copy may still arrive and run, and must not download twice.
    const tries = attempts.get(group) || 0, src = tries ? `${file}${file.includes("?") ? "&" : "?"}r=${tries}` : file;
    const base = SCENE_BASE[group], prerequisite = base && typeof PRESENT[base] === "function" ? load(base) : null;
    // The scene's chunk downloads beside its base's and still runs after it.
    let preload = null;
    if (prerequisite) {
      preload = document.createElement("link");
      preload.rel = "preload"; preload.as = "script"; preload.href = src;
      document.head.appendChild(preload);
    }
    const start = () => new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const finish = (error, fetched = true) => {
        if (error) error.timeout = !fetched;
        clearTimeout(timer);
        preload?.remove();
        script.onload = script.onerror = null;
        if (!error && !PRESENT[group]()) error = new Error(`The ${group} code did not start`);
        if (error) {
          loading.delete(group);
          // A timed-out script stays until it settles, then goes; if it runs late its group is simply present.
          if (fetched) script.remove();
          else script.onload = script.onerror = () => { script.onload = script.onerror = null; script.remove(); };
          if (fetched) attempts.set(group, tries + 1);
          reject(error);
        } else resolve(null);
      };
      const timer = setTimeout(() => finish(new Error(`The ${group} code took too long`), false), TIMEOUT_MS);
      script.onload = () => finish(null);
      script.onerror = () => {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        probe(file, new Error(`The ${group} code could not be fetched`)).catch((error) => finish(error));
      };
      script.src = src;
      document.head.appendChild(script);
    });
    const promise = prerequisite ? prerequisite.then(start, (error) => {
      preload.remove(); loading.delete(group);
      if (!error.timeout) attempts.set(group, tries + 1);
      throw error;
    }) : start();
    loading.set(group, promise);
    return promise;
  };
  const prefetching = new Set(), retryAt = new Map(), sceneGroups = Object.create(null);
  // Hover/proximity can recur every frame. Attach just one completion handler, and back off optional failures;
  // a deliberate prepare still retries immediately through load().
  const prefetch = (group) => {
    if (typeof PRESENT[group] !== "function" || globalThis.navigator?.connection?.saveData || document.hidden || PRESENT[group]() || prefetching.has(group) || Date.now() < (retryAt.get(group) || 0)) return;
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
  // A shell's `wip` is declared with it (scene-deferred.js), since the director drops a wip scene at boot, before any
  // definition can arrive; a definition must agree with it, and one for a dropped shell fills it without restoring it.
  // A shell's chunk is `<id>-scene` unless it names one it shares: the hall's games are all one chunk, `carnival-scene`.
  const shells = Object.create(null);
  const scene = (id, definition = null, wip = false, group = `${id}-scene`) => {
    const scenes = BL.scenes = BL.scenes || {}, target = shells[id] || scenes[id] || (scenes[id] = { id });
    // A chunk that arrives after its load timed out and was retried must not redefine a scene already defined.
    if (definition) {
      if (shells[id] && !!definition.wip !== !!target.wip) throw new Error(`Declare ${id}'s wip on its shell in scene-deferred.js`);
      if (typeof target.enter !== "function") Object.defineProperties(target, Object.getOwnPropertyDescriptors(definition));
    } else {
      shells[id] = target;
      if (wip) target.wip = true;
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
  BL.deferred = { load, scene, prefetch, prefetchScene, check, present: (group) => PRESENT[group](),
    get stale() { return stale; }, onStale: (handler) => { staleHandler = handler; if (stale) handler(); }, get pending() { return loading.size; } };
})();
