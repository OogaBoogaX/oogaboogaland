// Authored rig DTO for encoder parity, not a simulated NPC or generated geometry.
export function rig(name = "fixture") {
  const node = () => ({ position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }, quaternion: null, visible: true });
  const root = node(), sleepWeapons = node(), headClosed = {};
  const parts = Object.fromEntries(["torso", "head", "legL", "legR", "armL", "armR", "club", "gun", "gunFlash", "snack", "chuk", "jetFlame"].map(k => [k, node()]));
  parts.gunBananas = Array.from({ length: 30 }, () => ({ visible: true }));
  parts.club.parent = parts.armL; parts.gun.parent = parts.armR;
  return { root, parts, sleepWeapons, headClosed, stunBirds: { visible: false },
    state: "working", work: { phase: "outbound", site: 0, plannedSite: 0 }, traits: { name }, contributor: {} };
}
