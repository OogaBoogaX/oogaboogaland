// The clouds Ooga Chat speakers sit on in the world (#668): a bounded, versioned catalog of seats a zone, agreed with the
// world's renderer (#659), which draws each seat's cloud, place and facing from this id, the scene and its clock. The
// server hands out only these ids, one an active speaker, and never takes a position, model, skin or name from a client.
// A Main Island speaker sits on a `main-cloud-*` seat over the island; a DSB Land speaker on a `dsb-cloud-*` seat in DSB
// Land's sky, seen only there: no identity heard in one zone is drawn in the other. Pure; loaded in Node.

export const SEAT_REVISION = "cloud-seats-v1";
// A hosted chat's copy of Main Island (docs/ooga-chat-hosts.md) seats every speaker not walking it, up to the speaker cap:
// `main-cloud-1` … `main-cloud-32`, the same names as the island's first eight, drawn by the copy's own renderer.
export const COPY_REVISION = "cloud-seats-v2";
export const COPY_SEATS = 32;
export const COPY = Object.freeze(Array.from({ length: COPY_SEATS }, (_, i) => `main-cloud-${i + 1}`));
/** The first copy seat nobody in `taken` holds, or null. */
export const freeCopySeat = (taken) => COPY.find((seat) => !taken.has(seat)) || null;
export const SEATS_PER_ZONE = 8;
export const SEATS = Object.freeze({
  main: Object.freeze(Array.from({ length: SEATS_PER_ZONE }, (_, i) => `main-cloud-${i + 1}`)),
  dsb: Object.freeze(Array.from({ length: SEATS_PER_ZONE }, (_, i) => `dsb-cloud-${i + 1}`)),
});

/** The first seat of `zone` nobody in `taken` holds, or null when the catalog is full. */
export const freeSeat = (zone, taken) => (SEATS[zone] || []).find((seat) => !taken.has(seat)) || null;
