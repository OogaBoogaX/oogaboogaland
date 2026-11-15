// A server-hosted game's recent past, one table of rows a moment, shared unchanged by the page and the Worker
// (worker/src/games/*.js import it). The server keeps one to rewind a shot to the moment its shooter saw
// (lag compensation); a page keeps one to draw what the server sent a little behind its newest, smoothly between frames
// (interpolation). A table is `slots` rows of `width` numbers: each row's first number the id of what stands in the
// slot, its last that thing's flags (0 for an empty slot), and the numbers listed in `lerp` (positions) eased between
// two moments when the same id stands in the slot at both; every other number is the nearer moment's. `depth` moments
// are kept, oldest overwritten first. Nothing here allocates after `create`.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};

  const create = ({ slots, width, depth, lerp }) => {
    const size = slots * width, frames = Array.from({ length: depth }, () => new Float64Array(size)), times = new Float64Array(depth);
    const eased = new Uint8Array(width), flags = width - 1;
    for (const i of lerp) eased[i] = 1;
    let head = -1, count = 0;
    /** Keeps `rows` (a whole table) as it stood at time `t`; times must not go backward. */
    const push = (t, rows) => {
      head = (head + 1) % depth;
      times[head] = t;
      frames[head].set(rows.length === size ? rows : rows.subarray(0, size));
      if (count < depth) count++;
    };
    const at = (k) => (head - k + depth) % depth;
    /**
     * The table as it stood at `t`, written into `out`: clamped to the moments kept, a row between the two moments
     * either side of `t` where both hold the same id, else the nearer moment's. Returns the time it stands for
     * (NaN with nothing kept).
     */
    const sample = (t, out) => {
      if (!count) return NaN;
      const newest = times[head], oldest = times[at(count - 1)];
      if (!(t < newest)) { out.set(frames[head]); return newest; }
      if (!(t > oldest)) { out.set(frames[at(count - 1)]); return oldest; }
      let k = 0;
      while (k < count - 1 && times[at(k)] > t) k++;
      const a = frames[at(k)], b = frames[at(k - 1)], ta = times[at(k)], tb = times[at(k - 1)];
      const u = tb > ta ? (t - ta) / (tb - ta) : 1, near = u < 0.5 ? a : b;
      for (let o = 0; o < size; o += width) {
        if (a[o + flags] && b[o + flags] && a[o] === b[o]) {
          for (let i = 0; i < width; i++) out[o + i] = eased[i] ? a[o + i] + (b[o + i] - a[o + i]) * u : near[o + i];
        } else for (let i = 0; i < width; i++) out[o + i] = near[o + i];
      }
      return t;
    };
    const clear = () => { head = -1; count = 0; };
    return {
      push, sample, clear,
      get count() { return count; },
      get newest() { return count ? times[head] : NaN; },
      get oldest() { return count ? times[at(count - 1)] : NaN; }
    };
  };

  BL.gameTimeline = { create };
})();
