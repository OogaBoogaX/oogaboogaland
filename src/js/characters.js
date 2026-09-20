(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // One file per contributor in src/characters/ calls add(); the build (and the
  // suite) concatenates them into js/characters.gen.js, loaded right after this.
  // Adding a character therefore touches no shared file.
  const byHandle = new Map(), list = [];
  const add = (character) => {
    const { handle, joined, lastCommit } = character;
    if (typeof handle !== "string" || !/^[A-Za-z0-9-]{1,39}$/.test(handle)) throw new Error(`characters: bad handle ${handle}`);
    if (byHandle.has(handle.toLowerCase())) throw new Error(`characters: ${handle} is defined twice`);
    if (!Number.isFinite(joined) || !Number.isFinite(lastCommit)) throw new Error(`characters: ${handle} needs joined and lastCommit (Unix seconds)`);
    byHandle.set(handle.toLowerCase(), character);
    list.push(character);
    // Join order is the roster order: digit keys, grid slots and the default pick.
    list.sort((a, b) => a.joined - b.joined || (a.handle < b.handle ? -1 : 1));
  };
  const get = (handle) => byHandle.get(String(handle).toLowerCase()) || null;
  const all = () => list;
  BL.characters = { add, get, all };
})();
