// Cosmetic headwear changes only this body's head and its removable hat nodes. Geometry is shared; poses,
// controls, health, weapons, hair and companions keep their identities. Unknown custom rigs keep their own look.
(() => {
  "use strict";
  const BL = window.BL, hats = BL.equipmentHats, { createNode, addChild, removeChild } = BL.scene;
  const recipes = new Map(), contents = new Map(), pending = new Map(), downloads = new Map(), geometry = BL.models.scopedMap(), worn = new WeakMap();
  const CACHE_MAX = 64, DOWNLOAD_MAX = 8, TIMEOUT = 5000, HASH = /^[a-f0-9]{64}$/;
  // These three authored pieces sit on taller donor hair or a pumpkin. Seat their archived geometry on the
  // regular seven-cell crown; recipient fittings below then account for the actual head underneath them.
  const SEAT = Object.freeze({ straw: -2, "ruby-crown": -1, "top-hat": -0.5 });
  const APPLE_CAPS = new Set(["closed-cap", "open-cap"]);
  const OPEN_CROWNS = new Set(["open-cap", "ruby-crown"]);
  // A new hat creator does not implicitly approve their replacement head for every other hat.
  const REVIEWED_HEADS = new Set(["bitcoin-bill", "global-dsb", "bc1gui", "hotpixelgroup", "itsliran",
    "johnstackton21m", "midy-machete", "rules-without-rulers", "timechainb", "w-s-bitcoin"]);
  const freeze = (value) => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  };
  const install = (version, archive, content, contentHash) => {
    hats.validate(archive, archive.item); hats.validateContent(content);
    const descriptor = archive.format === 2 ? archive : { item: archive.item, content: contentHash,
      profile: hats.legacyProfile(archive.item), parent: null };
    if (!HASH.test(version) || !HASH.test(descriptor.content) || recipes.size >= CACHE_MAX && !recipes.has(version)
      || contents.size >= CACHE_MAX && !contents.has(descriptor.content)) throw new Error("Hat cache capacity reached");
    const old = contents.get(descriptor.content);
    if (old && hats.encode(old) !== hats.encode(content)) throw new Error("Immutable hat content changed");
    const record = hats.accept(archive.item, version, { item: descriptor.item, content: descriptor.content,
      profile: descriptor.profile, parent: descriptor.parent });
    if (!old) contents.set(descriptor.content, freeze(content));
    recipes.set(version, record);
    return record;
  };
  // Compiled seeds are already hash-checked by the build. Network reads verify both immutable objects below.
  let seeded = false;
  const seed = (archives, blobs = {}) => {
    for (const [version, archive] of Object.entries(archives)) {
      const hash = archive.format === 2 ? archive.content : hats.get(archive.item, version)?.content || version;
      install(version, archive, archive.format === 2 ? blobs[hash] : hats.contentOf(archive), hash);
    }
    seeded = true;
  };
  const read = async (response) => {
    if (!response.ok || !(response.headers.get("content-type") || "").startsWith("application/json")
      || Number(response.headers.get("content-length")) > hats.MAX_BYTES || !response.body) throw new Error("Hat archive unavailable");
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.byteLength;
        if (size > hats.MAX_BYTES) throw new Error("Hat archive too large");
        chunks.push(part.value);
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
    return bytes;
  };
  const digest = async (bytes) => {
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, "0")).join("");
  };
  const download = (hash) => {
    if (downloads.has(hash)) return downloads.get(hash);
    if (downloads.size >= DOWNLOAD_MAX) return Promise.reject(new Error("Hat download capacity reached"));
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), TIMEOUT);
    const task = (async () => {
      const response = await fetch(`/api/equipment/hats/${hash}.json`, { credentials: "omit", redirect: "error", signal: controller.signal,
        headers: { accept: "application/json" } });
      const bytes = await read(response);
      if (await digest(bytes) !== hash) throw new Error("Hat archive integrity mismatch");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes), archive = JSON.parse(text);
      if (hats.encode(archive) !== text) throw new Error("Hat archive is not canonical");
      return archive;
    })().finally(() => { clearTimeout(timer); downloads.delete(hash); });
    downloads.set(hash, task);
    return task;
  };
  const loaded = (item, version) => item === "none" && version === null
    || recipes.get(version)?.id === item && contents.has(recipes.get(version).content);
  const load = (item, version) => {
    if (item === "none" && version === null) return Promise.resolve(hats.get(item, version));
    if (!hats.current(item) || !HASH.test(version || "")) return Promise.reject(new Error("Unsupported hat version"));
    if (recipes.has(version)) return loaded(item, version) ? Promise.resolve(hats.get(item, version)) : Promise.reject(new Error("Hat identity mismatch"));
    if (!seeded && BL.deferredScripts?.["hat-archives"] && hats.has(item, version)) {
      return BL.deferred.load("hat-archives").then(() => load(item, version));
    }
    if (pending.has(version)) return pending.get(version).then((record) => { if (record.id !== item) throw new Error("Hat identity mismatch"); return record; });
    if (pending.size >= DOWNLOAD_MAX || recipes.size >= CACHE_MAX) return Promise.reject(new Error("Hat cache capacity reached"));
    const task = (async () => {
      const archive = await download(version);
      hats.validate(archive, item);
      const content = archive.format === 2 ? contents.get(archive.content) || await download(archive.content) : hats.contentOf(archive);
      hats.validateContent(content);
      const hash = archive.format === 2 ? archive.content : await digest(new TextEncoder().encode(hats.encode(content)));
      return install(version, archive, content, hash);
    })().finally(() => { pending.delete(version); });
    pending.set(version, task);
    return task;
  };
  hats.load = load;
  hats.loaded = loaded;
  const supported = (cave) => {
    if (!cave?.parts?.head || !cave.traits || !cave.headOpen || !cave.headClosed || typeof cave.bareHead !== "function") return false;
    const dress = cave.traits.dress || {}, look = cave.traits;
    // Nine authored hat owners have reviewed head fittings. Unreviewed replacement skulls, masks and models stay put.
    if (REVIEWED_HEADS.has(look.name.toLowerCase())) return true;
    return !(dress.model || dress.skull || dress.crown || dress.headgear || dress.refine || look.gasMask || look.snout || look.pumpkin);
  };
  const meshes = (content) => {
    let found = geometry.get(content);
    if (!found) {
      found = contents.get(content).nodes.map((node) => ({
        verts: [...node.geometry.verts], faces: node.geometry.faces.map((face) => ({ i: [...face.i], color: [...face.color], emissive: face.emissive })),
        // Win depth ties with head/hair without inflating the fitted mesh or changing its shadow.
        // This is a renderer policy for every catalog version, never part of the immutable archive.
        lines: [], characterPart: true, depthOffset: true
      }));
      geometry.set(content, found);
    }
    return found;
  };
  const selection = (cave) => worn.get(cave)?.selection || null;
  const size = (cave) => worn.get(cave)?.size || 100;
  const minimumSize = (cave, selected) => hats.minimumSize(cave?.traits?.name, selected?.item, selected?.version);
  const resize = (node, fit, percent) => {
    const q = percent / 100, p = fit.position, s = fit.scale, a = fit.anchor;
    // Always start from the reviewed fit. Returning to 100 is exact, even after many slider changes.
    node.position.x = percent === 100 ? p.x : a.x + (p.x - a.x) * q;
    node.position.y = percent === 100 ? p.y : a.y + (p.y - a.y) * q;
    node.position.z = percent === 100 ? p.z : a.z + (p.z - a.z) * q;
    node.scale.x = s.x * q; node.scale.y = s.y * q; node.scale.z = s.z * q;
  };
  const apply = (cave, selected, percent = 100) => {
    if (!Number.isInteger(percent) || percent < 80 || percent > 120) return false;
    if (!supported(cave)) return selected === null;
    if (selected !== null && (!selected || !hats.has(selected.item, selected.version)
      || selected.item !== "none" && !loaded(selected.item, selected.version))) return false;
    if (!selected || selected.item === "none") percent = 100;
    else percent = Math.max(percent, minimumSize(cave, selected));
    const old = worn.get(cave);
    if (old && old.selection?.item === selected?.item && old.selection?.version === selected?.version) {
      if (old.size !== percent) {
        if (old.node) resize(old.node, old.fit, percent);
        old.size = percent;
        BL.crew?.refreshHatRide(cave);
      }
      return true;
    }
    if (!old && selected === null) return true;
    const head = cave.parts.head, native = cave.parts.nativeHat || [];
    const own = old || { open: cave.headOpen, closed: cave.headClosed, portrait: cave.portraitHead, visible: native.map((node) => node.visible), selection: null, node: null };
    const closed = head.geometry === cave.headClosed;
    // Prepare the complete replacement before changing any live node.
    const apple = cave.traits.name.toLowerCase() === "w-s-bitcoin" && BL.models.STYLE === "R";
    const profile = selected && selected.item !== "none" ? hats.get(selected.item, selected.version).profile : null;
    const covered = apple && selected && selected.item !== "none" && !OPEN_CROWNS.has(profile);
    const bare = selected && (cave.traits.dress?.hat || covered) ? cave.bareHead() : own;
    let node = null, fit = null;
    if (selected && selected.item !== "none") {
      const content = recipes.get(selected.version).content, archive = contents.get(content), shared = meshes(content), h = cave.traits.height;
      node = createNode({ scale: { x: h, y: h, z: h } });
      // The crown author's own model has a reviewed 0.85-width head and a raised neck.
      if (cave.traits.name.toLowerCase() === "midy-machete" && BL.models.STYLE === "R") {
        node.scale.x *= 0.85; node.scale.y *= 0.85; node.scale.z *= 0.85; node.position.y = -(0.85 - 0.7) * h / 16;
      }
      if (apple) {
        // These caps already span the apple's 9 x 8 shell; leave only a little clearance around its sides.
        // The straw crown, hollow ruby crown and top-hat brim fit at their authored width and depth.
        if (APPLE_CAPS.has(profile)) { node.scale.x *= 1.05; node.scale.z *= 1.05; }
        node.position.y = h / 16; node.position.z = -0.5 * h / 16;
        if (profile === "ruby-crown") { node.position.y = 0.5 * h / 16; node.position.z = -0.25 * h / 16; }
        if (profile === "space-helmet") {
          // Undo the donor's backward tilt and center the dome around the apple, rather than behind it.
          node.rotation.x = 0.55; node.position.y = -0.7 * h / 16; node.position.z = 0.45 * h / 16;
        }
      }
      if (cave.traits.name.toLowerCase() === "bitcoin-bill" && BL.models.STYLE === "R") node.position.y = 2 * h / 16;
      node.position.y += (SEAT[profile] || 0) * node.scale.y / 16;
      for (let i = 0; i < archive.nodes.length; i++) {
        const source = archive.nodes[i], vector = (v) => ({ x: v[0], y: v[1], z: v[2] });
        // The space helmet's third piece closes its donor's muzzle gap; on the upright apple it crosses the face.
        const visible = !(apple && profile === "space-helmet" && i === 2);
        addChild(node, createNode({ position: vector(source.position), rotation: vector(source.rotation), scale: vector(source.scale), geometry: shared[i], visible }));
      }
      const name = cave.traits.name.toLowerCase(), u = h / 16;
      const crown = apple ? 8 : BL.models.STYLE !== "R" ? 7 : name === "bitcoin-bill" ? 9 : name === "midy-machete" ? 5.8 : 7;
      const anchor = { x: 0, y: crown * u, z: apple ? -0.5 * u : 0 };
      if (profile === "space-helmet") {
        // This helmet encloses the head. Scale around its fitted dome center, including the donor's tilt.
        BL.scene.updateWorld(node, null);
        const center = [];
        BL.math.mat4.transformPoint(center, node.children[0].world, 0, 0.2, 0);
        anchor.x = center[0]; anchor.y = center[1]; anchor.z = center[2];
      }
      fit = { position: { ...node.position }, scale: { ...node.scale }, anchor };
      resize(node, fit, percent);
    }
    if (own.node) removeChild(head, own.node);
    for (let i = 0; i < native.length; i++) native[i].visible = selected ? false : own.visible[i];
    cave.headOpen = bare.headOpen || bare.open; cave.headClosed = bare.headClosed || bare.closed;
    cave.portraitHead = bare.portraitHead || bare.portrait;
    head.geometry = closed ? cave.headClosed : cave.headOpen;
    if (node) addChild(head, node);
    own.node = cave.equipmentHatNode = node;
    own.selection = selected ? Object.freeze({ item: selected.item, version: selected.version }) : null;
    own.fit = fit; own.size = percent;
    worn.set(cave, own);
    BL.crew?.refreshHatRide(cave);
    return true;
  };
  // Lifts the hat off while something else changes the head under it (character-wardrobe.js), forgetting the head it
  // was fitted to; `apply` with what this returns puts it back on the new head.
  const detach = (cave) => {
    const old = worn.get(cave);
    if (!old) return null;
    const kept = old.selection ? { selection: old.selection, size: old.size } : null;
    apply(cave, null);
    worn.delete(cave);
    return kept;
  };
  BL.characterEquipment = { apply, clear: (cave) => apply(cave, null), detach, supports: supported, selection, size, minimumSize, seed,
    get seeded() { return seeded; }, get loaded() { return recipes.size; } };
})();
