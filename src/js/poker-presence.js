// The Ember Den's seating rule: which chair a remote player's sent position is, and which remote each chair is
// honoured for. It reads a seat's occupancy, `bot`, `name` and `id` and a remote's `id`, `display`, `zone`, `body` and
// position, nothing else, and it allocates nothing, so the scene can run it every frame.
(() => {
  "use strict";
  const BL = window.BL;
  // Remote poses send the hip height less the standing leg length. On the current chairs the longest
  // shins put the soles at 0.030 m. Allow for pose rounding, keeping feet on the floor outside the range.
  const MIN_CHAIR_Y = 0.02, CHAIR_Y = 0.18, RADIUS = 0.5, BAND = 0.1, R2 = RADIUS * RADIUS;
  // For one release, a page from before the Ooga-scale chairs still reads as seated: it sends soles at OLD_CHAIR_Y on
  // its own chair ring, 6 by 4.2 m round the same tables at the old even angles, and chair s there is chair s here.
  // This page sends only the new height. Remove both with the next release.
  const OLD_CHAIR_Y = 0.45;
  const OLD_SEATS = Object.freeze(Array.from({ length: 9 }, (_, i) => {
    const a = -Math.PI / 2 + 0.55 + i * (Math.PI * 2 - 1.1) / 8;
    return Object.freeze({ x: Math.cos(a) * 6, z: Math.sin(a) * 4.2 });
  }));
  // `table * seats.length + seat` for a position on a chair's spot at chair height, or -1.
  const seatAt = (tables, seats, x, y, z) => {
    if (!(y >= MIN_CHAIR_Y && y <= CHAIR_Y + BAND)) {
      if (!(Math.abs(y - OLD_CHAIR_Y) <= BAND)) return -1;
      seats = OLD_SEATS;
    }
    for (let t = 0; t < tables.length; t++) {
      const tx = x - tables[t].x, tz = z - tables[t].z;
      for (let s = 0; s < seats.length; s++) {
        const dx = tx - seats[s].x, dz = tz - seats[s].z;
        if (dx * dx + dz * dz <= R2) return t * seats.length + s;
      }
    }
    return -1;
  };
  // `input.remotes` is walked with `forEach` (the room's Map, or an array), never an iterator, through the one
  // `consider` made here, which reads the call's input and owner from these two while `resolve` runs.
  let cur = null, into = null;
  const consider = (rec) => {
    if (rec.zone !== cur.zone || !rec.body) return;
    const k = seatAt(cur.tables, cur.seats, rec.x, rec.y, rec.z);
    if (k < 0) return;
    const n = cur.seats.length, seat = cur.seatOf((k / n) | 0, k % n);
    // Live, only a human seat that is not the visitor's and carries the remote's name (a name that is empty or missing
    // never matches); practising, only a chair this page has empty.
    if (cur.live ? !seat || seat.bot || seat.id === cur.heroId || !rec.display || seat.name !== rec.display : seat) return;
    if (!into[k] || rec.id < into[k].id) into[k] = rec;
  };
  const resolve = (input, owner) => {
    for (let i = 0; i < owner.length; i++) owner[i] = null;
    cur = input; into = owner;
    input.remotes.forEach(consider);
    cur = into = null;
    return owner;
  };
  // 0 standing (at no chair), 1 seated (the chair's owner), 2 hidden (at a chair someone else owns).
  const stateOf = (tables, seats, owner, remote) => {
    const k = seatAt(tables, seats, remote.x, remote.y, remote.z);
    return k < 0 ? 0 : owner[k] === remote ? 1 : 2;
  };
  BL.pokerPresence = Object.freeze({ CHAIR_Y, OLD_CHAIR_Y, OLD_SEATS, RADIUS, BAND, seatAt, resolve, stateOf });
})();
