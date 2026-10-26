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
  const all = () => list;
  // The one in-game name for a handle or login; unknown names pass through.
  const displayOf = (name) => { const c = get(name); return (c && (c.display || c.handle)) || String(name); };
  BL.characters = { add, get, all, displayOf };
})();
