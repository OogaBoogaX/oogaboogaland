// One explicitly invoked publication, no timer/binding/alarm or automatic start.
// Both sides commit independently: reconcile uncertain replies using the exact
// committed frame/ticket, never by starting a second run or falling back to AI.
import { ROLLING_CADENCE, BURST_CADENCE } from "./host-cadence.js";
import { validateRoomClaim, validateRoomClaimReceipt, validateRoomReleaseReceipt } from "./host-room-claim.js";
const fail = message => { throw new Error(message); };
const same = (a, t) => a?.mode === "server" && a.world === t.world && a.epoch === t.fence;
const compatible = (a, format) => a?.v === (format ? 2 : 1) && a.format === format;

export async function publishHostPoses(host, room, ticket, { acquire = false, format, cadence, roomState } = {}) {
  if (cadence !== undefined && ![ROLLING_CADENCE, BURST_CADENCE].includes(cadence)) fail("unsupported publication cadence");
  if (format !== undefined && format !== "mixed-1") fail("unsupported host pose format");
  if (typeof host.confirmPoses !== "function") fail("host revision confirmation required");
  ticket = { ...ticket };
  let snapshot = await host.poses(ticket, { format, skipPending: true });
  // A newer body recovery batch can interleave with the publication runner.
  // Keep the last committed Room frame; the next complete sweep will offer again.
  if (snapshot === null) return { status: "superseded" };
  if (![0, 1].includes(snapshot.publicationProtocol)
    || snapshot.publicationProtocol === 0 && typeof host.bindRoomPublication !== "function") fail("coordinated host publication protocol required");
  if (snapshot.format !== format) fail("host pose format mismatch");
  // Optional private runner receipt from a previous successful publication.
  // This removes read-only RPCs, never the fresh host check or Room transaction.
  // Room revision fences release, takeover and every format/cadence change.
  const retained = roomState !== undefined;
  if (retained && snapshot.publicationProtocol === 0) fail("fresh Room evidence required before binding");
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
  if (snapshot.publicationProtocol === 0) {
    const bound = await host.bindRoomPublication(ticket, snapshot);
    if (!bound) return { status: "superseded", revision: authority.revision };
    if (bound.publicationProtocol !== 1 || bound.at !== snapshot.at || bound.runUntil !== snapshot.runUntil
      || !Number.isSafeInteger(bound.sequence) || bound.sequence < snapshot.sequence) fail("invalid Room binding receipt");
    snapshot = { ...snapshot, ...bound };
  }
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

// A single trusted router must always pair this host/world with the same Room.
// Owner IDs identify recovery operations and must not be reused by live runners.
// Persisted intent makes every crash point recoverable without granting a host
// ticket before the old Room publisher has been fenced. No timer is installed.
export async function claimHostRoom(host, room, owner, { intent: resume } = {}) {
  if (typeof host.prepareRoomClaim !== "function" || typeof host.completeRoomClaim !== "function"
    || typeof room.fenceNpcAuthority !== "function") fail("coordinated Room takeover unavailable");
  if (resume !== undefined && typeof host.resumeRoomClaim !== "function") fail("Room takeover recovery unavailable");
  const intent = structuredClone(validateRoomClaim(await (resume === undefined ? host.prepareRoomClaim(owner) : host.resumeRoomClaim(resume))));
  if (intent.v !== 1 || intent.owner !== owner) fail("Room takeover owner mismatch");
  let authority;
  try { authority = await room.fenceNpcAuthority(intent); }
  catch (error) {
    // A fence reply can be lost. Reconcile exactly; never release the host
    // intent merely because the request failed or Room is unavailable.
    const after = await room.npcAuthorityStatus();
    if (after?.authority?.mode !== "server" || after.authority.world !== intent.world
      || after.authority.epoch !== intent.epoch) throw error;
    authority = after.authority;
  }
  const receipt = await room.npcAuthorityStatus({ ...authority, owner: intent.owner });
  const confirmed = validateRoomClaimReceipt(intent, { ...receipt, owner: intent.owner }, authority);
  return host.completeRoomClaim(intent, confirmed);
}

// Separate explicit operator recovery, never an automatic publish retry or
// browser fallback. Retain bodies, pending departures and the original run end.
// The caller must choose a supported format and serialize this lifecycle action.
export async function recoverReleasedHostRoom(host, room, owner, { format, intent: resume } = {}) {
  if (!["legacy-1", "mixed-1"].includes(format) || typeof host.prepareRoomClaim !== "function"
    || typeof host.completeRoomClaim !== "function" || typeof room.reacquireNpcAuthority !== "function"
    || typeof room.npcAuthorityStatus !== "function" || resume !== undefined && typeof host.resumeRoomClaim !== "function")
    fail("explicit released Room recovery required");
  const intent = structuredClone(validateRoomClaim(await (resume === undefined
    ? host.prepareRoomClaim(owner) : host.resumeRoomClaim(resume))));
  if (intent.v !== 1 || intent.owner !== owner) fail("Room recovery owner mismatch");
  let authority = (await room.npcAuthorityStatus())?.authority;
  if (authority?.mode === "browser") {
    try { authority = await room.reacquireNpcAuthority(authority.revision, intent, format); }
    catch (error) {
      const after = await room.npcAuthorityStatus();
      if (after?.authority?.mode !== "server" || after.authority.world !== intent.world
        || after.authority.epoch !== intent.epoch) throw error;
      authority = after.authority;
    }
  }
  if (!compatible(authority, format === "mixed-1" ? format : undefined)) fail("Room recovery format mismatch");
  const receipt = await room.npcAuthorityStatus({ ...authority, owner });
  const confirmed = validateRoomClaimReceipt(intent, { ...receipt, owner }, authority);
  return host.completeRoomClaim(intent, confirmed);
}

// Explicit drained-run close, not automatic fallback or paid-run renewal.
// A trusted router serializes lifecycle actions for the same host/Room pair.
// No new ticket is granted until a separately requested finite begin().
export async function closeHostRoomRun(host, room, owner, { intent: resume, connected = false } = {}) {
  if (typeof host.prepareRoomRelease !== "function" || typeof host.completeRoomRelease !== "function"
    || typeof room.configureNpcAuthority !== "function" || typeof room.npcAuthorityStatus !== "function"
    || resume !== undefined && typeof host.resumeRoomRelease !== "function") fail("coordinated Room release unavailable");
  if (typeof connected !== "boolean" || connected && (typeof room.releaseConnectedNpcAuthority !== "function"
    || typeof room.deliverBodyRelease !== "function")) fail("connected Room migration unavailable");
  const intent = structuredClone(validateRoomClaim(await (resume === undefined
    ? host.prepareRoomRelease(owner) : host.resumeRoomRelease(resume))));
  if (intent.v !== 2 || intent.owner !== owner) fail("Room release owner mismatch");
  let receipt = await room.npcAuthorityStatus();
  // At most one old takeover can be in flight: prior epoch -> intent epoch.
  // CAS plus a bounded retry handles that race and lost release replies.
  for (let attempt = 0; receipt?.authority?.mode !== "browser" && attempt < 2; attempt++) {
    const a = receipt?.authority;
    if (a?.mode !== "server" || a.world !== intent.world
      || !(a.epoch === intent.previousEpoch || a.epoch === intent.epoch)) fail("Room release fenced");
    const serverOwner = a.epoch === intent.previousEpoch ? intent.previousOwner : intent.owner;
    try {
      if (connected) await room.releaseConnectedNpcAuthority(a.revision, intent);
      else if (typeof room.releaseDrainedNpcAuthority === "function") await room.releaseDrainedNpcAuthority(a.revision, intent);
      else await room.configureNpcAuthority(a.revision, { mode: "browser", world: intent.world, epoch: a.epoch, owner: serverOwner });
    }
    catch (error) {
      receipt = await room.npcAuthorityStatus();
      if (receipt?.authority?.mode !== "browser" && (attempt || receipt?.authority?.revision === a.revision)) throw error;
      continue;
    }
    receipt = await room.npcAuthorityStatus();
  }
  validateRoomReleaseReceipt(receipt);
  if (connected) await room.deliverBodyRelease(receipt.authority.revision);
  return host.completeRoomRelease(intent, receipt);
}
