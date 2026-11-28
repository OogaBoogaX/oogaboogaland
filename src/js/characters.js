(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // One file per contributor in src/characters/ calls add(); the build (and the
  // suite) concatenates them into js/characters.gen.js, loaded right after this.
  // Adding a character therefore touches no shared file.
  const byHandle = new Map(), list = [];
  const add = (character) => {
    const { handle, joined, lastCommit, github, display } = character;
    if (typeof handle !== "string" || !/^[A-Za-z0-9-]{1,39}$/.test(handle)) throw new Error(`characters: bad handle ${handle}`);
    if (byHandle.has(handle.toLowerCase())) throw new Error(`characters: ${handle} is defined twice`);
    if (!Number.isFinite(joined) || !Number.isFinite(lastCommit)) throw new Error(`characters: ${handle} needs joined and lastCommit (Unix seconds)`);
    if (github !== undefined && (typeof github !== "string" || !/^[A-Za-z0-9-]{1,39}$/.test(github))) throw new Error(`characters: ${handle} bad github login ${github}`);
    if (display !== undefined && (typeof display !== "string" || !display.trim() || display.length > 39)) throw new Error(`characters: ${handle} bad display name ${display}`);
    byHandle.set(handle.toLowerCase(), character);
    // The login behind the handle resolves to the same character, so stats rows
    // keyed by login find their Ooga (activity join, jumbotron labels).
    if (github && github.toLowerCase() !== handle.toLowerCase()) {
      if (byHandle.has(github.toLowerCase())) throw new Error(`characters: ${handle} github login ${github} already taken`);
      byHandle.set(github.toLowerCase(), character);
    }
    list.push(character);
    // Join order is the roster order: digit keys, grid slots and the default pick.
    list.sort((a, b) => a.joined - b.joined || (a.handle < b.handle ? -1 : 1));
  };
  const get = (handle) => byHandle.get(String(handle).toLowerCase()) || null;
  // External activity is keyed by current GitHub login, never by a permanent art handle.
  const ownedBy = (login) => { const c = get(login); return c && (c.github || c.handle).toLowerCase() === String(login).toLowerCase() ? c : null; };
  const displayOfLogin = (login) => { const c = ownedBy(login); return (c && (c.display || c.handle)) || String(login); };
  const all = () => list;
  // Called once before contributors/models are constructed. Validate the whole replacement before changing either
  // index; compiled custom characters keep their exact object and hooks from this page's approved baseline.
  let catalogApplied = false;
  const applyCatalog = (catalog, baseline) => {
    if (catalogApplied || !Array.isArray(baseline) || baseline.length !== list.length || !Array.isArray(catalog.entries)
      || catalog.entries.length > 128) throw new Error("Character catalog cannot replace this cast");
    const compiled = new Map(), used = new Set(), next = [], names = new Map();
    for (const entry of baseline) {
      const character = get(entry.identity.handle);
      if (compiled.has(entry.path) || !character || character.handle !== entry.identity.handle
        || (character.github || character.handle) !== entry.identity.github) throw new Error("Character catalog baseline differs from this page");
      compiled.set(entry.path, { entry, character });
    }
    for (const entry of catalog.entries) {
      const old = compiled.get(entry.path);
      if (old && (old.entry.identity.handle !== entry.identity.handle || old.entry.identity.github !== entry.identity.github))
        throw new Error("Character catalog changes a compiled identity");
      if (old) used.add(entry.path);
      let character = entry.row;
      if (entry.kind === "custom") {
        if (!old || old.entry.kind !== "custom" || old.entry.hash !== entry.hash || old.entry.blob !== entry.blob)
          throw new Error("Character catalog needs different custom code");
        character = old.character;
      } else if (old && old.entry.kind !== "data") throw new Error("Character catalog replaces custom code");
      if (!character || character.handle !== entry.identity.handle || (character.github || character.handle) !== entry.identity.github)
        throw new Error("Character catalog has an invalid identity");
      for (const name of new Set([character.handle, character.github || character.handle].map((value) => value.toLowerCase()))) {
        if (names.has(name)) throw new Error("Character catalog has a duplicate owner");
        names.set(name, character);
      }
      next.push(character);
    }
    if (used.size !== compiled.size) throw new Error("Character catalog omits a compiled character");
    next.sort((a, b) => a.joined - b.joined || (a.handle < b.handle ? -1 : 1));
    byHandle.clear();
    for (const [name, character] of names) byHandle.set(name, character);
    list.splice(0, list.length, ...next);
    catalogApplied = true;
  };
  // The one in-game name for a handle or login; unknown names pass through.
  const displayOf = (name) => { const c = get(name); return (c && (c.display || c.handle)) || String(name); };
  // An Ooga's traits, hashed from its name over the look its character file gives: the island's roster (contributors.js)
  // and Ooga Chat's 3D view build every Ooga from these. `display` is the name to show where its file gives none.
  const SKINS = ["#c98a5b", "#a9744c", "#8a5a3a", "#d9a06b", "#b58057"];
  const HAIRS = ["#2b1b10", "#4a2c14", "#151312", "#5c4425", "#7a2e12"];
  const FURS = ["#d98a2e", "#cc7f28", "#c98936", "#e09a40", "#c27a24", "#d4913a"];
  // A character's look overrides the hashed skin, hair and fur and carries its
  // flags into the traits; its dress hooks go to models.buildCaveman.
  const traitsFor = (name, display = "") => {
    const { fnv1a, mulberry32 } = BL.math, character = get(name);
    const look = character?.look || {};
    const slim = look.build === "slim";
    const rand = mulberry32(fnv1a(name));
    const skin = SKINS[Math.floor(rand() * SKINS.length)];
    // Either build's hashed hair is one of the same browns.
    const hashedHair = HAIRS[Math.floor(rand() * HAIRS.length)];
    const traits = {
      ...look,
      name,
      display: character?.display || display || name,
      slim,
      skin: look.skin || skin,
      hair: look.hair || hashedHair,
      fur: look.fur || FURS[Math.floor(rand() * FURS.length)],
      height: 0.92 + rand() * 0.24,
      belly: (0.9 + rand() * 0.35) * (slim ? 0.8 : 1),
      rand: mulberry32(fnv1a(name + "/body")),
      dress: character?.dress
    };
    // An explicit stature replaces the hashed one after every draw, so the
    // other hashed traits keep their sequence.
    if (look.height) traits.height = look.height;
    return traits;
  };
  BL.characters = { add, get, ownedBy, all, displayOf, displayOfLogin, applyCatalog, traitsFor };
})();
