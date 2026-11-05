// Inactive browser handoff contract; no Room capability or scene adapter enables
// it. Preflight and final apply keep controls OFF. Only the host's committed live
// receipt may activate. The one-second starting interval is a snapshot hold, not
// permission for this browser to drive. Voice and ordinary live movement separate.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const FEATURE = "host-body-reclaim-v2", MAX_BYTES = 32768, PREPARE_MS = 10000, START_MS = 1000;
  const encoder = new TextEncoder();
  const positive = n => Number.isSafeInteger(n) && n > 0;
  const name = s => typeof s === "string" && /^[A-Za-z0-9._:/-]{1,64}$/.test(s);
  const nonce = s => typeof s === "string" && /^[0-9a-f]{32}$/.test(s);
  const prepareValid = m => m && Object.keys(m).sort().join(',') === 'accountId,bodyId,epoch,expiresAt,kind,request,t,v,world'
    && m.t === "body-prepare" && m.v === 2 && nonce(m.request)
    && positive(m.accountId) && name(m.bodyId) && name(m.world) && positive(m.epoch)
    && ["ooga", "clanker"].includes(m.kind) && positive(m.expiresAt);
  const blockedMessages = new Set(["body", "pose", "zone", "blend", "hp", "shot", "swing", "cabinet", "hockey", "wallet"]);

  function create({ send, monotonic, wall, later, cancel }) {
    if (![send, monotonic, wall, later, cancel].every(f => typeof f === "function")) throw Error("body reclaim clocks required");
    let required = false, enabled = false, account = 0, connection = "", serial = 0;
    let phase = "legacy", adapter = null, current = null, resource = null, pending = false, timer = null;
    let grant = null, grantText = "", final = null, finalText = "", highestEpoch = 0, world = "";
    let origin = null, requestAt = null, last = null, lifetime = PREPARE_MS;
    let movement = null, movementSequence = 0, sampling = false;
    const stamp = () => ({ mono: monotonic(), wall: wall() });
    const validStamp = s => Number.isFinite(s.mono) && Number.isFinite(s.wall);
    const dispose = (owner, value) => {
      if (value !== null && value !== undefined) try { owner.release(value); } catch { /* Stay blocked. */ }
    };
    const clear = next => {
      serial++;
      if (timer !== null) cancel(timer);
      timer = null; current = grant = final = null; grantText = finalText = "";
      origin = requestAt = last = null; lifetime = PREPARE_MS;
      movement = null; movementSequence = 0; sampling = false;
      const previous = resource; resource = null; phase = next;
      if (adapter) dispose(adapter, previous);
    };
    const failure = () => {
      const request = current?.request;
      // Stop and dispose locally before notifying Room. This releases only the
      // body; transport and voice stay connected. Room owns time and identity.
      clear("blocked");
      if (request && enabled) try { send({ t: "body-decline", request }); } catch { /* Transport close reconciles a failed send. */ }
    };
    // Never compare the browser's epoch with the server's. Count from the FIRST
    // local request, before the host could issue its reply. Network/queue delay
    // consumes the budget; duplicate replies cannot reset it. Wall elapsed also
    // catches platforms whose monotonic clock pauses through system sleep. Clock
    // reversal refuses, and every message checks expiry even if timers were late.
    // These clocks bound inactive waiting only; they never authorize control.
    const remaining = () => {
      const now = stamp();
      if (!current || !origin || !validStamp(now) || now.mono < last.mono || now.wall < last.wall) return -1;
      last = now;
      const age = s => Math.max(now.mono - s.mono, now.wall - s.wall);
      return Math.min(PREPARE_MS - age(origin), requestAt ? lifetime - age(requestAt) : PREPARE_MS);
    };
    const armTimer = () => {
      if (timer !== null) cancel(timer);
      const attempt = serial, left = remaining();
      if (!(left > 0)) { failure(); return false; }
      timer = later(() => { if (serial === attempt) failure(); }, left); return true;
    };
    const reply = (t, extra = {}) => send({ t, request: current.request, ...extra });
    const receipt = value => ({ epoch: value.epoch, generation: value.view.generation, revision: value.revision });
    const matches = (m, value) => m.epoch === value.epoch && m.generation === value.view.generation && m.revision === value.revision;
    const transferText = (value, state) => {
      const view = value?.view;
      if (!value || value.v !== 1 || value.protocol !== "host-session-v4" || value.world !== current.world
        || value.epoch !== current.epoch || !positive(value.revision) || !positive(value.at)
        || !positive(value.expiresAt) || value.expiresAt <= value.at || value.expiresAt - value.at > PREPARE_MS
        || value.resetResources !== "defaults" || view?.accountId !== account || view.bodyId !== current.bodyId
        || view.kind !== current.kind || !positive(view.generation) || view.state !== state || Object.hasOwn(view, "token")
        || !positive(view.deadline) || value.expiresAt > view.deadline
        || !value.checkpoint || typeof value.checkpoint !== "object") return null;
      const text = JSON.stringify(value);
      return text.length <= MAX_BYTES && encoder.encode(text).byteLength <= MAX_BYTES ? text : null;
    };
    const offer = m => {
      if (enabled && m?.accountId === account && name(m.world) && positive(m.epoch)
        && (world !== m.world || m.epoch >= highestEpoch) && !prepareValid(m)) {
        clear("blocked"); world = m.world; highestEpoch = m.epoch; return false;
      }
      if (!enabled || !prepareValid(m) || m.accountId !== account || world === m.world && m.epoch < highestEpoch) return false;
      if (current?.request === m.request) return JSON.stringify(current) === JSON.stringify(m);
      clear("blocked");
      if (pending || !adapter) return false;
      current = JSON.parse(JSON.stringify(m)); world = m.world; highestEpoch = m.epoch;
      origin = last = stamp();
      if (!validStamp(origin)) { failure(); return false; }
      const attempt = serial, owner = adapter, socket = connection;
      phase = "preparing"; pending = true;
      if (!armTimer()) { pending = false; return false; }
      Promise.resolve().then(() => {
        if (attempt !== serial || !(remaining() > 0)) return null;
        return owner.prepare(JSON.parse(JSON.stringify(current)));
      }).then(value => {
        pending = false;
        if (attempt !== serial || socket !== connection || !(remaining() > 0)) {
          dispose(owner, value); if (attempt === serial) failure(); return;
        }
        if (value === null || value === undefined) { failure(); return; }
        resource = value; phase = "ready"; reply("body-ready");
      }).catch(() => { pending = false; if (attempt === serial) failure(); });
      return true;
    };
    const message = m => {
      if (m?.t === "body-prepare") return offer(m);
      if (!enabled || !current || m?.request !== current.request) return false;
      if (phase !== "active" && !(remaining() > 0)) { failure(); return false; }
      if (m.t === 'body-motion-ack') {
        if (phase !== 'active' || Object.keys(m).sort().join(',') !== 'generation,request,sequence,t'
          || m.generation !== final?.view.generation || !positive(m.sequence) || m.sequence !== movementSequence) return false;
        movement = null; return true;
      }
      if (m.t === "body-grant") {
        const text = transferText(m.transfer, "offered"); if (!text) return false;
        if (grant) {
          if (text !== grantText) { failure(); return false; }
          if (phase === "applied") reply("body-applied", receipt(grant));
          return true;
        }
        if (phase !== "ready") return false;
        const attempt = serial, owner = adapter, body = resource;
        phase = "preflighting";
        try {
          // Preflight may validate in a separate prepared controller. It must
          // not consume the fresh controller reserved for the final snapshot.
          const accepted = owner.preflight(body, JSON.parse(text));
          if (attempt !== serial || owner !== adapter || body !== resource) return false;
          if (accepted !== true || !(remaining() > 0)) { failure(); return false; }
          grant = JSON.parse(text); grantText = text; phase = "applied";
          requestAt = stamp(); lifetime = START_MS;
          if (!armTimer()) return false;
          reply("body-applied", receipt(grant)); return true;
        } catch { if (attempt === serial) failure(); return false; }
      }
      if (m.t === "body-active" && grant) {
        const text = transferText(m.transfer, "starting"), value = m.transfer;
        if (!text || value.view.generation !== grant.view.generation || value.revision <= grant.revision
          || value.expiresAt - value.at > START_MS) return false;
        if (final) {
          if (text !== finalText) { failure(); return false; }
          if (phase === "starting" || phase === "active") reply("body-started", receipt(final));
          return true;
        }
        if (phase !== "applied") return false;
        lifetime = Math.min(lifetime, value.expiresAt - value.at);
        if (!(remaining() > 0)) { failure(); return false; }
        const attempt = serial, owner = adapter, body = resource;
        phase = "applying";
        try {
          const accepted = owner.apply(body, JSON.parse(text));
          if (attempt !== serial || owner !== adapter || body !== resource) return false;
          if (accepted !== true || !(remaining() > 0)) { failure(); return false; }
          final = JSON.parse(text); finalText = text; phase = "starting";
          if (!armTimer()) return false;
          reply("body-started", receipt(final)); return true;
        } catch { if (attempt === serial) failure(); return false; }
      }
      if (m.t === "body-live" && final && (phase === "starting" || phase === "active") && matches(m, final)) {
        if (phase === "active") return true;
        const attempt = serial, owner = adapter, body = resource;
        phase = "activating";
        try {
          // Scene focus/attachment can synchronously close or replace this
          // handoff. Neither its return nor a late exception may revive it or
          // clear the replacement. Recursive receipts cannot reenter activation.
          const accepted = owner.activate(body);
          if (attempt !== serial || owner !== adapter || body !== resource) return false;
          if (accepted !== true || !(remaining() > 0)) { failure(); return false; }
          phase = "active";
          if (timer !== null) cancel(timer); timer = null;
          return true;
        } catch { if (attempt === serial) failure(); return false; }
      }
      return false;
    };
    return {
      open(id, token, negotiated, requiredByServer = negotiated) {
        clear(required ? "blocked" : "legacy"); account = id; connection = token;
        enabled = negotiated === true && positive(id) && typeof token === "string" && token.length > 0;
        required ||= requiredByServer === true; phase = required ? "blocked" : "legacy";
      },
      close() { enabled = false; connection = ""; clear(required ? "blocked" : "legacy"); },
      suspend() { if (required) failure(); },
      setAdapter(value) {
        if (value !== null && !["prepare", "preflight", "apply", "activate", "release"].every(k => typeof value?.[k] === "function"))
          throw Error("complete body reclaim adapter required");
        // Scene teardown/replacement also relinquishes its body without
        // disconnecting the shared voice transport.
        if (required && current) failure();
        else clear(required ? "blocked" : "legacy");
        adapter = value;
      },
      message,
      // Explicit data capture only; no timer or transmission. One unacknowledged
      // sample survives retries unchanged, then the next call samples fresh state.
      captureMovement() {
        if (!enabled || phase !== 'active' || sampling || typeof adapter?.capture !== 'function') return null;
        if (movement) return JSON.parse(JSON.stringify(movement));
        if (movementSequence >= Number.MAX_SAFE_INTEGER) { failure(); return null; }
        const attempt = serial, owner = adapter, body = resource;
        sampling = true;
        try {
          const checkpoint = owner.capture(body);
          if (attempt !== serial || owner !== adapter || body !== resource || phase !== 'active') return null;
          if (!checkpoint || typeof checkpoint !== 'object' || checkpoint.then) throw Error('invalid body capture');
          const next = { t: 'body-motion', request: current.request, sequence: movementSequence + 1, checkpoint };
          const text = JSON.stringify(next);
          if (attempt !== serial || owner !== adapter || body !== resource || phase !== 'active') return null;
          if (text.length > 4096 || encoder.encode(text).byteLength > 4096) throw Error('body capture size');
          movement = JSON.parse(text); movementSequence++;
          return JSON.parse(text);
        } catch { if (attempt === serial) failure(); return null; }
        finally { if (attempt === serial) sampling = false; }
      },
      allows(type, bodyId) {
        if (!required || !blockedMessages.has(type)) return true;
        if (type === "body") return false;
        if (phase !== "active" && current && !(remaining() > 0)) failure();
        return phase === "active" && current.bodyId === bodyId;
      },
      get required() { return required; },
      get active() { return phase === "active"; },
      get state() { return { required, phase, bodyId: current?.bodyId ?? null }; },
    };
  }
  BL.bodyReclaim = { FEATURE, MAX_BYTES, create };
})();
