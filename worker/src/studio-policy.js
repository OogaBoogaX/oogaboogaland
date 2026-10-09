// Studio permissions are independent of the NPC simulation host. Only approved account IDs host.
export const STUDIO_ZONE = "dsb-studio";
export const STUDIO_DURATION = 12;
export const studioState = (now = Date.now()) => ({ hostId: 0, mode: "suspended", revision: 0, epoch: 0, source: "sample", playing: false, position: 0, at: now, volume: .65 });
export const studioHostAllowed = (env, id) => String(env && env.STUDIO_HOST_IDS || "321615163").split(",").some(value => Number(value.trim()) === id);
export const studioPosition = (s, now) => Math.min(STUDIO_DURATION, Math.max(0, s.position + (s.playing ? (now - s.at) / 1000 : 0)));
export const studioCanSpeak = (s, p) => !!s && p.zone === STUDIO_ZONE && !p.studioRevoked && !(s.restrictedIds || []).includes(p.id) && (p.id === s.hostId || (s.mode === "discussion" && !!p.body && Number.isInteger(p.studioSeat)));
// Keep these anchors in the same order as dsb-studio.js: audience, galleries, host, guests.
export const studioSeats = (() => {
  const out = [];
  for (let row = 0; row < 4; row++) for (const side of [-1, 1]) for (let col = 0; col < 4; col++) out.push({ x: side * (2.4 + col * 1.6), y: (row + 1) * .75, z: -2.1 + row * 3 });
  for (const side of [-1, 1]) for (const z of [-1, 3.5]) out.push({ x: side * 14, y: 3, z: z + 1.1 });
  out.push({ x: 4.2, y: .6, z: -15.2 }, { x: -5, y: .6, z: -13.4 }, { x: -2, y: .6, z: -13.4 });
  return out;
})();
export const studioSeatAllowed = (p, seat, players) => {
  const a = studioSeats[seat];
  return !!a && p.zone === STUDIO_ZONE && !!p.body && Math.hypot(p.x - a.x, p.z - a.z) <= 3 && Math.abs(p.y - a.y) <= 2 && ![...players].some(q => q !== p && q.zone === STUDIO_ZONE && q.studioSeat === seat);
};
export const parseStudioCommand = (m) => {
  const actions = ["claim", "release", "seat", "stand", "mode", "source", "play", "pause", "seek", "volume", "transfer", "revoke"];
  if (!actions.includes(m.action)) return null;
  if (m.revision !== undefined && (!Number.isSafeInteger(m.revision) || m.revision < 0)) return null;
  if (m.commandId !== undefined && (typeof m.commandId !== "string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(m.commandId))) return null;
  const out = { t: "studio", action: m.action };
  if (m.revision !== undefined) out.revision = m.revision;
  if (m.commandId !== undefined) out.commandId = m.commandId;
  if (m.action === "seat") { if (!Number.isInteger(m.seat) || m.seat < 0 || m.seat >= 39) return null; out.seat = m.seat; }
  if (m.action === "mode") { if (!["discussion", "presentation"].includes(m.mode)) return null; out.mode = m.mode; }
  if (m.action === "source") { if (m.source !== "sample") return null; out.source = m.source; }
  if (m.action === "seek") { if (!Number.isFinite(m.position) || m.position < 0 || m.position > STUDIO_DURATION) return null; out.position = m.position; }
  if (m.action === "volume") { if (!Number.isFinite(m.volume) || m.volume < 0 || m.volume > 1) return null; out.volume = m.volume; }
  if (m.action === "transfer" || m.action === "revoke") { if (!Number.isSafeInteger(m.id) || m.id <= 0) return null; out.id = m.id; }
  return out;
};
