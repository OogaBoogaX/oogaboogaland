// One explicitly invoked publication, no timer/binding/alarm or automatic start.
// Both sides commit independently: reconcile uncertain replies using the exact
// committed frame/ticket, never by starting a second run or falling back to AI.
import { ROLLING_CADENCE, BURST_CADENCE } from "./host-cadence.js";
const fail = message => { throw new Error(message); };
const same = (a, t) => a?.mode === "server" && a.world === t.world && a.epoch === t.fence;
const compatible = (a, format) => a?.v === (format ? 2 : 1) && a.format === format;

export async function publishHostPoses(host, room, ticket, { acquire = false, format, cadence, roomState } = {}) {
  if (cadence !== undefined && ![ROLLING_CADENCE, BURST_CADENCE].includes(cadence)) fail("unsupported publication cadence");
  if (format !== undefined && format !== "mixed-1") fail("unsupported host pose format");
  if (typeof host.confirmPoses !== "function") fail("host revision confirmation required");
  ticket = { ...ticket };
  const snapshot = await host.poses(ticket, { format, skipPending: true });
  // A newer body recovery batch can interleave with the publication runner.
  // Keep the last committed Room frame; the next complete sweep will offer again.
  if (snapshot === null) return { status: "superseded" };
  if (snapshot.format !== format) fail("host pose format mismatch");
  // Optional private runner receipt from a previous successful publication.
  // This removes read-only RPCs, never the fresh host check or Room transaction.
  // Room revision fences release, takeover and every format/cadence change.
  const retained = roomState !== undefined;
  if (retained && (!roomState || Object.keys(roomState).sort().join(",") !== "authority,cadence,owner,runUntil"
    || roomState.owner !== ticket.owner || roomState.runUntil !== snapshot.runUntil
    || roomState.cadence !== (cadence ?? null) || !same(roomState.authority, ticket)
    || !compatible(roomState.authority, format) || !Number.isSafeInteger(roomState.authority.revision)
    || roomState.authority.revision < 1)) fail("invalid retained Room publication state");
  let authority = retained ? { ...roomState.authority } : (await room.npcAuthorityStatus())?.authority;
  const claim = { mode: "server", world: ticket.world, epoch: ticket.fence,
    owner: ticket.owner, runUntil: snapshot.runUntil, ...(format ? { format } : {}), ...(cadence ? { cadence } : {}) };
  if (retained) {
    // A stale receipt fails at publication; it cannot implicitly reacquire.
  } else if (same(authority, ticket)) {
    if (!compatible(authority, format)) fail("Room host pose format mismatch");
    const status = await room.npcAuthorityStatus({ ...authority, owner: ticket.owner });
    if (!status?.owns || status.runUntil !== snapshot.runUntil) fail("Room host ownership mismatch");
    if (status.cadence !== cadence) fail("Room publication cadence mismatch");
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
      if (!same(after?.authority, ticket) || !compatible(after.authority, format)) throw error;
      const checked = await room.npcAuthorityStatus({ ...after.authority, owner: ticket.owner });
      if (!checked?.owns || checked.runUntil !== snapshot.runUntil || checked.cadence !== cadence) throw error;
      authority = after.authority;
    }
    // Older Rooms may ignore an unknown claim field. Require an explicit
    // persisted negotiation before sending any frame with the new cadence.
    if (cadence !== undefined) {
      const selected = await room.npcAuthorityStatus({ ...authority, owner: ticket.owner });
      if (!selected?.owns || selected.runUntil !== snapshot.runUntil || selected.cadence !== cadence)
        fail("Room publication cadence mismatch");
    }
  }
  if (!compatible(authority, format)) fail("Room host pose format mismatch");
  const roomTicket = { ...authority, owner: ticket.owner };
  const verifiedState = { authority: { ...authority }, owner: ticket.owner,
    runUntil: snapshot.runUntil, cadence: cadence ?? null };
  // Recheck host fencing after the RPCs. If a new owner took over while Room
  // was being configured, leave followers frozen for the new owner to recover.
  if (!await host.confirmPoses(ticket, { sequence: snapshot.sequence, at: snapshot.at, runUntil: snapshot.runUntil }, { skipPending: true })) {
    return { status: "superseded", revision: authority.revision };
  }
  try {
    return { status: "published", ...await room.publishNpcSnapshot(roomTicket, snapshot.sequence, snapshot.frame), roomState: verifiedState };
  } catch (error) {
    const after = await room.npcAuthorityStatus(roomTicket);
    if (!after?.owns || after.sequence !== snapshot.sequence) throw error;
    // Same sequence alone is not proof of equal bytes. Room compares the exact
    // payload before accepting this duplicate, even after its lease expires.
    return { status: "reconciled", ...await room.publishNpcSnapshot(roomTicket, snapshot.sequence, snapshot.frame), roomState: verifiedState };
  }
}
