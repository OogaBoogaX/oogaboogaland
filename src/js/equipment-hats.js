// The portable hat contract. Item revisions keep ownership and fit; full geometry blobs can be shared.
// Legacy item-bound archives remain valid forever. The Worker imports no model builders.
(() => {
  "use strict";
  const BL = globalThis.BL = globalThis.BL || {};
  const HASH = /^[a-f0-9]{64}$/, ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const MAX_BYTES = 512 * 1024, MAX_NODES = 12, MAX_VERTICES = 30000, MAX_FACES = 20000, MAX_VERSIONS = 256;
  const PROFILES = Object.freeze(["standard", "closed-cap", "open-cap", "straw", "ruby-crown", "top-hat", "space-helmet"]);
  const LEGACY = Object.freeze({ "bitcoin-bill-straw": "straw", "global-dsb-spiked-helmet": "closed-cap",
    "bc1gui-green-beanie": "closed-cap", "hotpixelgroup-flame-crown": "open-cap", "itsliran-taproot-cap": "closed-cap",
    "johnstackton21m-helmet": "space-helmet", "midy-machete-crown": "ruby-crown", "rules-without-rulers-top-hat": "top-hat",
    "timechainb-gold-crown": "closed-cap" });
  const own = (v, keys) => !!v && Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
  const hash = (value) => typeof value === "string" && HASH.test(value);
  const validId = (value) => typeof value === "string" && value !== "none" && value.length <= 64 && ID.test(value);
  const parentValid = (value) => value === null || own(value, ["item", "version"]) && validId(value.item) && hash(value.version);
  const sameParent = (a, b) => a === null ? b === null : b !== null && a.item === b.item && a.version === b.version;
  const parentCopy = (value) => value === null ? null : Object.freeze({ item: value.item, version: value.version });
  const finite = (v, bound) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= bound;
  const vector = (v, bound) => Array.isArray(v) && v.length === 3 && v.every((n) => finite(n, bound));
  const fail = () => { throw new Error("Invalid immutable hat archive"); };
  const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  const encode = (archive) => JSON.stringify(canonical(archive)) + "\n";
  const validateNodes = (archive) => {
    if (archive.fit !== "ooga-head-v1" || !Array.isArray(archive.nodes) || !archive.nodes.length || archive.nodes.length > MAX_NODES) fail();
    let vertices = 0, faces = 0;
    for (const node of archive.nodes) {
      if (!own(node, ["position", "rotation", "scale", "geometry"]) || !vector(node.position, 4)
        || !vector(node.rotation, Math.PI * 2) || !vector(node.scale, 4) || node.scale.some((n) => n <= 0)) fail();
      const geo = node.geometry;
      if (!own(geo, ["verts", "faces", "lines"]) || !Array.isArray(geo.verts) || !geo.verts.length || geo.verts.length % 3
        || !geo.verts.every((v) => finite(v, 8)) || !Array.isArray(geo.faces) || !geo.faces.length
        || !Array.isArray(geo.lines) || geo.lines.length) fail();
      vertices += geo.verts.length / 3; faces += geo.faces.length;
      if (vertices > MAX_VERTICES || faces > MAX_FACES) fail();
      for (const face of geo.faces) {
        if (!own(face, ["i", "color", "emissive"]) || !Array.isArray(face.i) || face.i.length < 3 || face.i.length > 32
          || !face.i.every((i) => Number.isSafeInteger(i) && i >= 0 && i < geo.verts.length / 3)
          || !vector(face.color, 255) || face.color.some((c) => c < 0) || !finite(face.emissive, 4) || face.emissive < 0) fail();
      }
    }
    return archive;
  };
  const validateContent = (archive) => {
    if (!own(archive, ["format", "fit", "nodes"]) || archive.format !== 2) fail();
    return validateNodes(archive);
  };
  const validate = (archive, item) => {
    if (!validId(item) || archive?.item !== item) fail();
    if (archive.format === 1) {
      if (!own(archive, ["format", "item", "fit", "nodes"])) fail();
      return validateNodes(archive);
    }
    if (!own(archive, ["format", "item", "content", "profile", "parent"]) || archive.format !== 2
      || !hash(archive.content) || !PROFILES.includes(archive.profile) || !parentValid(archive.parent)
      || archive.parent?.item === item) fail();
    return archive;
  };
  const contentOf = (archive) => {
    if (archive?.format !== 1) fail();
    validate(archive, archive.item);
    return { format: 2, fit: archive.fit, nodes: archive.nodes };
  };
  const legacyProfile = (item) => Object.hasOwn(LEGACY, item) ? LEGACY[item] : "standard";
  let records = new Map(), versions = new Map(), items = Object.freeze([]), grouped = null, choices = null;
  const descriptor = (row, version, value) => {
    if (!own(value, ["item", "content", "profile", "parent"]) || value.item !== row.id || !hash(value.content)
      || !PROFILES.includes(value.profile) || !parentValid(value.parent) || !sameParent(row.parent, value.parent)) fail();
    return Object.freeze({ id: row.id, version, label: row.label, creator: row.creator, fit: "ooga-head-v1",
      content: value.content, profile: value.profile, parent: parentCopy(value.parent) });
  };
  const register = (rows, revisions) => {
    if (items.length || !Array.isArray(rows) || rows.length > 32 || revisions !== undefined
      && (!revisions || Object.getPrototypeOf(revisions) !== Object.prototype)) throw new Error("Hat registry already initialized or invalid");
    const next = new Map(), pinned = new Map(); let total = 0;
    for (const row of rows) {
      const legacy = own(row, ["id", "label", "creator", "current", "versions"]);
      if (!legacy && !own(row, ["id", "label", "creator", "current", "versions", "parent"]) || !validId(row.id)
        || next.has(row.id) || typeof row.label !== "string" || !row.label || row.label.length > 80
        || typeof row.creator !== "string" || !/^[A-Za-z0-9-]{1,39}$/.test(row.creator) || !hash(row.current)
        || !Array.isArray(row.versions) || !row.versions.includes(row.current) || new Set(row.versions).size !== row.versions.length
        || !row.versions.every((v) => hash(v)) || (total += row.versions.length) > MAX_VERSIONS
        || !legacy && !parentValid(row.parent)) throw new Error("Invalid hat registry");
      const entry = Object.freeze({ ...row, parent: parentCopy(legacy ? null : row.parent), versions: Object.freeze([...row.versions]) });
      next.set(row.id, entry);
      for (const version of row.versions) {
        if (pinned.has(version)) throw new Error("Hat revision belongs to another item");
        const value = revisions === undefined ? Object.freeze({ id: row.id, version, label: row.label, creator: row.creator, fit: "ooga-head-v1",
          content: null, profile: legacyProfile(row.id), parent: null }) : descriptor(entry, version, revisions[version]);
        if (revisions === undefined && entry.parent !== null) throw new Error("Fork revisions require metadata");
        pinned.set(version, value);
      }
    }
    if (revisions !== undefined && Object.keys(revisions).length !== total) throw new Error("Unexpected hat revision metadata");
    for (const row of next.values()) {
      let current = row, depth = 0; const seen = new Set([row.id]);
      while (current.parent) {
        const parent = next.get(current.parent.item);
        if (!parent || !parent.versions.includes(current.parent.version) || seen.has(parent.id) || ++depth > 8) throw new Error("Invalid hat lineage");
        seen.add(parent.id); current = parent;
      }
    }
    // Commit only after every item, revision and parent edge validates.
    records = next; versions = pinned; items = Object.freeze([...records.values()]); grouped = choices = null;
  };
  const none = Object.freeze({ id: "none", version: null, label: "No hat", creator: null, fit: "ooga-head-v1", content: null, profile: "standard", parent: null });
  const current = (id) => records.get(id)?.current || null;
  const get = (id, version = current(id)) => id === "none" && version === null ? none : versions.get(version)?.id === id ? versions.get(version) : null;
  const has = (id, version) => (id === "none" ? version === null : typeof version === "string" && hash(version)) && !!get(id, version);
  const minimumSize = (character, item, version = current(item)) => get(item, version)?.profile === "space-helmet"
    && typeof character === "string" && character.toLowerCase() === "w-s-bitcoin" ? 100 : 80;
  // Downloaded manifests add a verified revision to this page, never advance its item's current pointer.
  const accept = (id, version, value) => {
    const row = records.get(id), old = get(id, version);
    if (!row || !hash(version) || versions.has(version) && !old || versions.size >= MAX_VERSIONS && !old) throw new Error("Hat version is not supported");
    if (value === undefined) {
      if (old) return old;
      // Legacy loaders seed only item-bound full archives; keep that call shape for source fixtures.
      if (row.parent !== null) fail();
      value = { id, version, label: row.label, creator: row.creator, fit: "ooga-head-v1", content: null, profile: legacyProfile(id), parent: null };
    } else {
      if (value.format === 2) { validate(value, id); value = { item: id, content: value.content, profile: value.profile, parent: value.parent }; }
      value = descriptor(row, version, value);
      if (old?.content && (old.content !== value.content || old.profile !== value.profile || !sameParent(old.parent, value.parent))) throw new Error("Immutable hat metadata changed");
    }
    if (!old || old.content === null && value.content !== null) { versions.set(version, Object.freeze(value)); grouped = choices = null; }
    return get(id, version);
  };
  const visualKey = (value) => value.profile + ":" + (value.content || value.version);
  const groups = () => {
    if (grouped) return grouped;
    const byVisual = new Map(), byItem = new Map(), representatives = new Map();
    const depth = (row) => { let n = 0; while (row.parent) { row = records.get(row.parent.item); n++; } return n; };
    for (const row of items) {
      const value = get(row.id), key = visualKey(value); let choice = byVisual.get(key);
      if (!choice) {
        choice = { key, selection: { item: row.id, version: row.current }, label: row.label, creators: [], aliases: [], children: [] };
        byVisual.set(key, choice); representatives.set(choice, row);
      } else if (depth(row) < depth(representatives.get(choice))) {
        choice.selection = { item: row.id, version: row.current }; choice.label = row.label; representatives.set(choice, row);
      }
      if (!choice.creators.includes(row.creator)) choice.creators.push(row.creator);
      choice.aliases.push(Object.freeze({ item: row.id, version: row.current })); byItem.set(row.id, choice);
    }
    const roots = [];
    for (const choice of byVisual.values()) {
      let row = representatives.get(choice), parent = null;
      while (row.parent) {
        row = records.get(row.parent.item);
        if (byItem.get(row.id) !== choice) { parent = byItem.get(row.id); break; }
      }
      // An exact duplicate may bridge families. Prefer its shallowest original; never create a visual cycle.
      if (parent && depth(representatives.get(parent)) < depth(representatives.get(choice))) parent.children.push(choice);
      else roots.push(choice);
    }
    for (const choice of byVisual.values()) {
      Object.freeze(choice.selection); Object.freeze(choice.creators); Object.freeze(choice.aliases); Object.freeze(choice.children); Object.freeze(choice);
    }
    choices = byVisual; grouped = Object.freeze(roots); return grouped;
  };
  const choiceFor = (selection) => {
    if (!selection || selection.item === "none") return null;
    const value = get(selection.item, selection.version); if (!value) return null;
    groups(); const choice = choices.get(visualKey(value));
    return choice?.aliases.some((alias) => alias.item === selection.item) ? choice : null;
  };
  const selectionFor = (choice, saved) => choiceFor(saved)?.key === choice.key ? { item: saved.item, version: saved.version } : { ...choice.selection };
  BL.equipmentHats = { register, current, get, has, accept, minimumSize, validate, validateContent, contentOf, legacyProfile,
    encode, groups, choiceFor, selectionFor, PROFILES, MAX_BYTES, MAX_VERSIONS, get items() { return items; } };
})();
