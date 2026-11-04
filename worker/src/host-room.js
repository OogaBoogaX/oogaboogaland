// One explicitly invoked publication, no timer/binding/alarm or automatic start.
// Both sides commit independently: reconcile uncertain replies using the exact
// committed frame/ticket, never by starting a second run or falling back to AI.
const fail = message => { throw new Error(message); };
const same = (a, t) => a?.mode === "server" && a.world === t.world && a.epoch === t.fence;

export async function publishHostPoses(host, room, ticket, { acquire = false } = {}) {
  ticket = { ...ticket };
  const snapshot = await host.poses(ticket);
  const current = await room.npcAuthorityStatus();
  let authority = current?.authority;
  const claim = { mode: "server", world: ticket.world, epoch: ticket.fence,
    owner: ticket.owner, runUntil: snapshot.runUntil };
  if (same(authority, ticket)) {
    const status = await room.npcAuthorityStatus({ ...authority, owner: ticket.owner });
    if (!status?.owns || status.runUntil !== snapshot.runUntil) fail("Room host ownership mismatch");
  } else {
    // Acquisition is a separate explicit operator/runner decision. A scheduled
    // publication must not silently undo an intentional release to browser AI.
    if (acquire !== true) fail("explicit Room authority acquisition required");
    // A newer owner wins. An older still-live Room lease is refused by its CAS.
    if (authority?.mode === "server" && authority.world === ticket.world && authority.epoch > ticket.fence) fail("Room host fenced");
    try {
      authority = await room.configureNpcAuthority(authority?.revision || 0, claim);
    } catch (error) {
      // A reply can be lost after Room has committed. Read, do not blindly retry.
      const after = await room.npcAuthorityStatus();
      if (!same(after?.authority, ticket)) throw error;
      const checked = await room.npcAuthorityStatus({ ...after.authority, owner: ticket.owner });
      if (!checked?.owns || checked.runUntil !== snapshot.runUntil) throw error;
      authority = after.authority;
    }
  }
  const roomTicket = { ...authority, owner: ticket.owner };
  // Recheck host fencing after the RPCs. If a new owner took over while Room
  // was being configured, leave followers frozen for the new owner to recover.
  const fresh = await host.poses(ticket);
  if (fresh.sequence !== snapshot.sequence) return { status: "superseded", revision: authority.revision };
  try {
    return { status: "published", ...await room.publishNpcSnapshot(roomTicket, snapshot.sequence, snapshot.frame) };
  } catch (error) {
    const after = await room.npcAuthorityStatus(roomTicket);
    if (!after?.owns || after.sequence !== snapshot.sequence) throw error;
    // Same sequence alone is not proof of equal bytes. Room compares the exact
    // payload before accepting this duplicate, even after its lease expires.
    return { status: "reconciled", ...await room.publishNpcSnapshot(roomTicket, snapshot.sequence, snapshot.frame) };
  }
}
