// A hosted chat's roles (docs/ooga-chat-hosts.md): who hosts it, its co-hosts, the queue of requests to speak, the
// invites a host has sent, and who is held off. Pure and allocation-light; the Audience object (audience.js) owns one a
// chat, stores it whole (`save`, `restore`) and asks it before every lease and every host action. Identities, never
// connections: `gh:<id>` or `x:<id>`, so every tab of an account holds the same role.
// Ranks: the host (2), a co-host (1), everyone else (0). A host or co-host manages; an action on someone needs a higher
// rank than theirs, so a co-host never touches the host or another co-host. Speaking needs a rank, a live invite, or a
// place on the stage, which an accepted invite gives for the life of the speaker's lease and STAGE_HOLD_MS after one that
// ended without their word (a dropped socket, a failed microphone), so a speaker who comes straight back needs no
// second invite. Going back to listening on their own word, or a host's, gives the place up. Anyone once let on the
// stage is remembered (`cleared`) and takes it again with no new approval, until a host or co-host moves them to
// listening or removes them. Someone removed stays out
// until a host or co-host allows them back (`allowBack`), which lets them in again as a listener and nothing more.
// An open stage (`setOpen`, the host's alone) approves every request the moment it is made: an ask is an invite.
// Co-hosting is offered, not given: the host's `setCohost` makes an offer (`offers`), which the person accepts or turns
// down (`answerCohost`); accepting makes them a co-host on the stage. Offers and co-hosts share COHOSTS_MAX slots. A
// co-host who leaves the stage on their own word (or whose place lapses while they are still here) is a listener with
// the offer back, so their slot stays theirs; the host may withdraw an offer, or make a co-host a plain speaker.
// Times are the caller's clock (`now`), so the checks run without one; nothing here sets a timer. `nextAt` is the
// earliest moment something changes by itself (an invite lapsing, a held place lapsing, the held host's minute),
// for the object's alarm.

export const COHOSTS_MAX = 3;
export const QUEUE_MAX = 50;
export const INVITE_MS = 60 * 1000;
export const DECLINE_MS = 60 * 1000;
export const ASK_GAP_MS = 10 * 1000;
export const HOST_HOLD_MS = 60 * 1000;
export const STAGE_HOLD_MS = 60 * 1000;
export const ID = /^(gh|x):[1-9][0-9]{0,19}$/;

const refuse = (code, extra = {}) => ({ ok: false, code, ...extra });
const OK = Object.freeze({ ok: true, changed: true });
const SAME = Object.freeze({ ok: true, changed: false });
const INVITED = Object.freeze({ ok: true, changed: true, invited: true });

export const createRoles = ({ host, now = 0, saved = null } = {}) => {
  let state;
  if (saved) {
    state = {
      host: saved.host, ended: saved.ended === true, hostAway: Number(saved.hostAway) || 0, open: saved.open === true,
      cohosts: new Map(saved.cohosts || []), queue: new Map(saved.queue || []), invites: new Map(saved.invites || []),
      cooldown: new Map(saved.cooldown || []), lastAsk: new Map(saved.lastAsk || []), stage: new Map(saved.stage || []),
      // A removal keeps when it happened and the name to list it by; an older save's bare ids read as unnamed.
      offers: new Map(saved.offers || []), cleared: new Map(saved.cleared || []),
      removed: new Map((saved.removed || []).map((r) => typeof r === "string" ? [r, { at: 0, login: "", display: "" }] : r)),
    };
  } else {
    if (!ID.test(host)) throw new Error("a chat needs a host");
    // The host must connect within the hold, as if they had just dropped.
    state = { host, ended: false, open: false, hostAway: now + HOST_HOLD_MS, cohosts: new Map(), queue: new Map(), invites: new Map(),
      cooldown: new Map(), lastAsk: new Map(), stage: new Map(), offers: new Map(), cleared: new Map(), removed: new Map() };
  }

  const rankOf = (id) => id === state.host ? "host" : state.cohosts.has(id) ? "cohost" : "";
  const level = (id) => id === state.host ? 2 : state.cohosts.has(id) ? 1 : 0;
  const manages = (id) => level(id) > 0;
  const outranks = (actor, target) => level(actor) > 0 && level(actor) > level(target);
  const invited = (id, now) => (state.invites.get(id) || 0) > now;
  const staged = (id, now) => state.stage.has(id) && (state.stage.get(id) === null || state.stage.get(id) > now);

  /**
   * Whether an identity may walk the chat's copy of its zone (docs/ooga-chat-hosts.md): speakers alone, so a lease it
   * holds now (`leased`) or its place on the stage, held through a dropped socket; never once removed or ended.
   */
  const mayWalk = (id, now, leased = false) => !state.ended && !state.removed.has(id) && (leased || staged(id, now));

  /** Whether an identity may hold a speaker lease now: a rank, a live invite, its place on the stage, or once let on it. */
  const mayLease = (id, now) => !state.ended && !state.removed.has(id) && (level(id) > 0 || invited(id, now) || staged(id, now) || state.cleared.has(id));

  /** `asked`, `invited` or "": what the roster shows of someone's request. */
  const requestOf = (id, now) => state.offers.has(id) ? "cohost" : invited(id, now) ? "invited" : state.queue.has(id) ? "asked" : "";

  const guard = (actor, target) => {
    if (state.ended) return refuse("ended");
    if (!manages(actor)) return refuse("not_host");
    if (!ID.test(target)) return refuse("malformed");
    if (target === actor || !outranks(actor, target)) return refuse("not_allowed");
    return null;
  };
  // Everything an identity holds but a rank goes with it, the stage it was let on included.
  const clear = (id) => { state.queue.delete(id); state.invites.delete(id); state.stage.delete(id); state.cleared.delete(id); };

  /** A listener asks to speak. `speaking`: they already hold a lease. */
  const ask = (id, now, speaking = false) => {
    if (state.ended) return refuse("ended");
    if (state.removed.has(id)) return refuse("removed");
    if (speaking || level(id) > 0 || invited(id, now) || staged(id, now) || state.cleared.has(id)) return refuse("already_allowed");
    if (state.queue.has(id)) return SAME;
    const until = state.cooldown.get(id) || 0;
    if (until > now) return refuse("cooldown", { retryable: true, retryAfter: Math.ceil((until - now) / 1000) });
    const last = state.lastAsk.get(id) || 0;
    if (last && now - last < ASK_GAP_MS) return refuse("rate_limited", { retryable: true, retryAfter: Math.ceil((last + ASK_GAP_MS - now) / 1000) });
    // An open stage approves at once.
    if (state.open) { state.lastAsk.set(id, now); state.invites.set(id, now + INVITE_MS); return INVITED; }
    if (state.queue.size >= QUEUE_MAX) return refuse("queue_full", { retryable: true });
    state.lastAsk.set(id, now);
    state.queue.set(id, now);
    return OK;
  };

  /** The host opens or closes the stage. Opening it approves everyone waiting: `invited` names them. */
  const setOpen = (actor, on, now) => {
    if (state.ended) return refuse("ended");
    if (actor !== state.host) return refuse("not_host");
    if (state.open === on) return { ok: true, changed: false, invited: [] };
    state.open = on;
    const invited = [];
    if (on) for (const id of [...state.queue.keys()]) { state.queue.delete(id); state.invites.set(id, now + INVITE_MS); invited.push(id); }
    return { ok: true, changed: true, invited };
  };

  const cancel = (id) => state.queue.delete(id) ? OK : SAME;

  /** A host or co-host invites someone, from the queue or not. Someone who may already speak needs no invite. */
  const invite = (actor, target, now) => {
    const bad = guard(actor, target);
    if (bad) return bad;
    if (state.removed.has(target)) return refuse("removed");
    if (staged(target, now) || state.cleared.has(target)) return refuse("already_allowed");
    state.queue.delete(target);
    state.cooldown.delete(target);
    state.invites.set(target, now + INVITE_MS);
    return OK;
  };

  /** A host or co-host answers a request: approving it is an invite; declining holds the next request off a while. */
  const answer = (actor, target, approve, now) => {
    const bad = guard(actor, target);
    if (bad) return bad;
    if (!state.queue.has(target)) return refuse("not_asked");
    if (approve) return invite(actor, target, now);
    state.queue.delete(target);
    state.cooldown.set(target, now + DECLINE_MS);
    return OK;
  };

  /** The invited person says Not now. */
  const decline = (id) => state.invites.delete(id) ? OK : SAME;

  /** A lease was granted: an invite becomes a place on the stage, held while the lease lives, and remembered. */
  const granted = (id, now) => {
    if (!mayLease(id, now)) return refuse("not_allowed");
    if (!state.cleared.has(id)) state.cleared.set(id, now);
    // A host or co-host takes a place on the stage too, so a dropped one is held (and a copy of the zone keeps them), and a
    // co-host's lapse is seen (`tick`).
    if (level(id) > 0) { const had = state.stage.get(id) === null; state.stage.set(id, null); return had ? SAME : OK; }
    state.invites.delete(id);
    state.queue.delete(id);
    state.stage.set(id, null);
    return OK;
  };

  /** A lease ended. On the speaker's own word their place goes; otherwise it is held a while for their return. */
  const leaseEnded = (id, voluntary, now) => {
    // A co-host leaving the stage on their own word is a listener with the offer back, their slot kept.
    if (voluntary && state.cohosts.has(id)) {
      state.cohosts.delete(id); state.stage.delete(id); state.offers.set(id, now);
      return { ok: true, changed: true, reinstated: true };
    }
    if (!state.stage.has(id)) return SAME;
    if (voluntary) state.stage.delete(id);
    else state.stage.set(id, now + STAGE_HOLD_MS);
    return OK;
  };

  /** Move to listener: the target's place on the stage, any invite and their clearance go. The caller ends the lease. */
  const demote = (actor, target) => {
    const bad = guard(actor, target);
    if (bad) return bad;
    clear(target);
    return OK;
  };

  /** A host or co-host mutes a speaker. The rule is the rank's; the microphone is the caller's. */
  const mute = (actor, target) => guard(actor, target) || OK;

  /**
   * Only the host offers co-hosting (`on`), at most COHOSTS_MAX co-hosts and open offers together. Off withdraws an offer
   * (`retracted`) or makes a co-host a plain speaker who keeps the stage (`demoted`).
   */
  const setCohost = (actor, target, on, now) => {
    if (state.ended) return refuse("ended");
    if (actor !== state.host) return refuse("not_host");
    if (!ID.test(target) || target === state.host) return refuse("not_allowed");
    if (!on) {
      if (state.offers.delete(target)) return { ok: true, changed: true, retracted: true };
      if (!state.cohosts.delete(target)) return SAME;
      if (state.stage.has(target)) state.stage.set(target, null);
      return { ok: true, changed: true, demoted: true };
    }
    if (state.removed.has(target)) return refuse("removed");
    if (state.cohosts.has(target) || state.offers.has(target)) return SAME;
    if (state.cohosts.size + state.offers.size >= COHOSTS_MAX) return refuse("cohosts_full");
    state.offers.set(target, now);
    return { ok: true, changed: true, offered: true };
  };

  /** The person offered co-hosting answers: accepting makes them a co-host, free to take the stage; Not now frees the slot. */
  const answerCohost = (id, accept, now) => {
    if (state.ended) return refuse("ended");
    if (!state.offers.delete(id)) return refuse("not_offered");
    if (!accept) return OK;
    state.cohosts.set(id, now);
    state.queue.delete(id); state.invites.delete(id);
    return OK;
  };

  /** Gone from the chat altogether: an open offer frees its slot. */
  const dropOffer = (id) => state.offers.delete(id) ? OK : SAME;

  /** The host hands the chat to a co-host and takes that co-host's place. */
  const handover = (actor, target, now) => {
    if (state.ended) return refuse("ended");
    if (actor !== state.host) return refuse("not_host");
    if (!state.cohosts.has(target)) return refuse("not_allowed");
    state.cohosts.delete(target);
    state.host = target;
    state.cohosts.set(actor, now);
    state.hostAway = 0;
    return OK;
  };

  /**
   * Removed from the chat: every role and request goes, and they stay out until a host or co-host allows them back or
   * the chat ends. `info` is the name to list them by (`{ login, display }`). The caller closes them.
   */
  const remove = (actor, target, now = 0, info = null) => {
    const bad = guard(actor, target);
    if (bad) return bad;
    clear(target);
    state.cohosts.delete(target);
    state.offers.delete(target);
    state.cooldown.delete(target);
    state.lastAsk.delete(target);
    state.removed.set(target, { at: now, login: info && typeof info.login === "string" ? info.login : "", display: info && typeof info.display === "string" ? info.display : "" });
    return OK;
  };

  /** A host or co-host lets someone removed back in: they may join again, as a listener, with nothing else restored. */
  const allowBack = (actor, target) => {
    if (state.ended) return refuse("ended");
    if (!manages(actor)) return refuse("not_host");
    if (!ID.test(target)) return refuse("malformed");
    return state.removed.delete(target) ? OK : refuse("not_removed");
  };

  /** Everyone removed, the earliest first, for hosts and co-hosts. */
  const removedList = () => [...state.removed].sort((a, b) => a[1].at - b[1].at).map(([id, r]) => ({ id, at: r.at, login: r.login, display: r.display }));

  const end = (actor) => {
    if (state.ended) return SAME;
    if (actor !== state.host) return refuse("not_host");
    state.ended = true;
    return OK;
  };

  /** Whether the host is connected: their absence starts the hold, their return ends it. */
  const presence = (id, present, now) => {
    if (id !== state.host || state.ended) return SAME;
    if (present) { if (!state.hostAway) return SAME; state.hostAway = 0; return OK; }
    if (state.hostAway) return SAME;
    state.hostAway = now + HOST_HOLD_MS;
    return OK;
  };

  /**
   * What the clock changed: invites that lapsed (`expired`), and the host's hold run out, which passes the chat to the
   * longest-serving co-host, connected ones first (`host`, the new host), or ends it (`ended`). `present(id)` says
   * whether an identity is connected. Old cooldowns, gaps and held places are forgotten.
   */
  const tick = (now, present = () => false) => {
    const out = { expired: [], host: null, ended: false, reinstated: [] };
    if (state.ended) return out;
    for (const [id, until] of state.invites) if (until <= now) { state.invites.delete(id); out.expired.push(id); }
    for (const [id, until] of state.cooldown) if (until <= now) state.cooldown.delete(id);
    for (const [id, at] of state.lastAsk) if (now - at >= ASK_GAP_MS) state.lastAsk.delete(id);
    for (const [id, until] of state.stage) {
      if (until === null || until > now) continue;
      state.stage.delete(id);
      // A co-host whose place lapsed: still here, a listener with the offer back; gone, the slot is free.
      if (state.cohosts.delete(id)) { if (present(id)) state.offers.set(id, now); out.reinstated.push(id); }
    }
    if (state.hostAway && state.hostAway <= now) {
      let next = null;
      for (const [id, since] of state.cohosts) {
        if (!next || present(id) && !present(next.id) || present(id) === present(next.id) && since < next.since) next = { id, since };
      }
      if (!next) { state.ended = true; out.ended = true; return out; }
      state.cohosts.delete(next.id);
      state.host = next.id;
      state.hostAway = present(next.id) ? 0 : now + HOST_HOLD_MS;
      out.host = next.id;
    }
    return out;
  };

  /** The earliest moment the clock changes something: an invite lapsing, a held place lapsing, or the held host's hold. */
  const nextAt = () => {
    if (state.ended) return Infinity;
    let next = state.hostAway || Infinity;
    for (const until of state.invites.values()) next = Math.min(next, until);
    for (const until of state.stage.values()) if (until !== null) next = Math.min(next, until);
    return next;
  };

  /** Who holds a place on the stage with no lease now (a drop being waited out): the speaker cap keeps it for them. */
  const held = (now) => { const out = []; for (const [id, until] of state.stage) if (until !== null && until > now) out.push(id); return out; };

  /** The queue, oldest first, for hosts and co-hosts. */
  const queue = () => [...state.queue].sort((a, b) => a[1] - b[1]).map(([id, at]) => ({ id, at }));

  const save = () => ({
    host: state.host, ended: state.ended, open: state.open, hostAway: state.hostAway, cohosts: [...state.cohosts], offers: [...state.offers], queue: [...state.queue],
    invites: [...state.invites], cooldown: [...state.cooldown], lastAsk: [...state.lastAsk], stage: [...state.stage], cleared: [...state.cleared], removed: [...state.removed],
  });

  return {
    get host() { return state.host; }, get ended() { return state.ended; }, get open() { return state.open; }, setOpen, get hostAway() { return state.hostAway; },
    get cohosts() { return [...state.cohosts.keys()]; }, get offers() { return [...state.offers.keys()]; },
    answerCohost, dropOffer,
    rankOf, manages, mayWalk, onStage: (id, now) => staged(id, now), rankSince: (id) => state.cohosts.get(id) || 0, allowBack, removedList, outranks, mayLease, requestOf, inviteUntil: (id, now) => invited(id, now) ? state.invites.get(id) : 0,
    isRemoved: (id) => state.removed.has(id), isCleared: (id) => state.cleared.has(id), askedAt: (id) => state.queue.get(id) || 0, held,
    ask, cancel, invite, answer, decline, granted, leaseEnded, demote, mute, setCohost, handover, remove, end, presence, tick, nextAt, queue, save,
  };
};
