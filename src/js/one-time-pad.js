// Private conversations over one-time pads (#188), shared unchanged by the classic page and the unit tier: the pad
// file two people swap outside Ooga, how a message is sealed and opened with it, and this device's record of how much
// of it is used. private-chat.js shows a conversation; the room only relays sealed frames (docs/auth-and-presence.md).
// The pad file: "OOGAPAD1", a 16-byte pad id, the two GitHub logins it was made for (lower case, the first is sender
// 0), then the material in two equal halves, one for each sender, so the two directions never share a byte. Each half
// is a key region of KEY-byte slots (KEY_SHARE of it) and a stream region, so no byte is ever both a tag's key and
// pad for text: knowing a line's text tells nobody a key. Nothing here certifies that a file's bytes are random; `make`
// fills them from crypto.getRandomValues. The fingerprint and the digest the two sides compare are SHA-256 of the
// whole file, so a copy cut short or changed anywhere shows.
// A frame: version, type, pad id, direction (the sender's half), key slot (u32), stream offset (u32) and body length
// (u16), then the body and an HMAC-SHA256 tag over all of it keyed by that slot's KEY bytes, each slot used once. A
// text's body is a LINE_ID-byte line number (the stream offset it was first sealed at) and its UTF-8, XORed with the
// stream bytes at the offset, each used once; a hello's or an ack's body is plain and uses no stream at all. The tag stops anyone without the pad from altering a frame or making one up; the
// pad hides the text. Lengths and timing still show.
// The record (`ledger`): per pad and sender, the next slot and stream offset this device sends from, how far it has
// read the other half, and a stop, kept in localStorage and changed under a Web Lock so two tabs never take the same
// bytes. Slot and bytes are written as used before anything is sealed with them, so a crash, a refused send or a retry
// never seals new text on them: a retry resends the same frame while nothing was sealed after it, and otherwise seals
// the same text on fresh bytes. A record that cannot be read or written stops the pad; one that is missing is a new pad
// only when the visitor says so (`start({ fresh })`), because a browser that lost its storage would otherwise use the
// pad again from the start. The pad itself is never stored.
// A conversation (`session`): each side sends a hello with a fresh random nonce and the file's digest, and answers the
// other's hello with an ack carrying that nonce and how far it has read the sender's half, by its record; each nonce
// once, and ANSWERS at most a session, so a hello the room plays again spends nothing. A side is ready only on an ack
// to its own latest nonce, and only before the line opened, so no recorded or late ack counts, and only if the other
// side has read no text this device had not sent before its hello: otherwise this device's record is behind (the pad
// was used before, on another device or a restored profile), the stop is recorded and the pad never starts here
// again. Text is the check because its bytes are what must never be used twice; key slots only key a tag, so the other
// side may have read any slot this device sealed, in whatever order the room delivered them. A hello the room dropped
// is said again (`hello`), HELLO_TRIES times at most. A different file stops at the digest. A line is shown once: one
// whose bytes were read already, or a copy sealed again of a line already shown, is dropped. Stream bytes skipped
// over are a gap; once a later line shows, the reader is told a line hasn't arrived, and a line that fills it later
// shows marked late (GAPS kept at most). `close`
// ends a session before its pad is zeroed; nothing in flight seals or reads after it. Exports PAD (sizes), TYPE,
// make, parse, roleOf, digest, fingerprint, seal, open, ledger, session.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const MAGIC = [79, 79, 71, 65, 80, 65, 68, 49];
  const ID = 16, KEY = 32, TAG = 32, HEAD = 29, VERSION = 1, NONCE = 16, DIGEST = 16;
  // The whole material: enough for a few dozen lines each way, and no more than a phone reads into memory with ease.
  const MIN = 4096, MAX = 64 * 1024 * 1024;
  // A key slot per frame and the text's own bytes: about two in five of a half for keys suits lines of 50 bytes or so.
  const KEY_SHARE = 0.4;
  const TYPE = { hello: 1, ack: 2, text: 3 };
  // A line is chat-policy's 160 UTF-16 units at most: 480 bytes of UTF-8 (a pair of units is 4 bytes, one unit 3 at most).
  const TEXT_BYTES = 480, LINE_ID = 4, HELLO_BODY = NONCE + DIGEST, ACK_BODY = NONCE + DIGEST + 8;
  const SIZES = [256 * 1024, 1024 * 1024, 16 * 1024 * 1024];
  const LOGIN = /^[a-z0-9][a-z0-9-]{0,38}$/;
  const STORE = "oogaboogaland.pad.";
  const OUTBOX = 32, HELLO_TRIES = 3, ANSWERS = 8, GAPS = 32;
  const fail = (code) => Object.assign(new Error(code), { code });
  const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const encoder = new TextEncoder(), decoder = new TextDecoder("utf-8", { fatal: true });
  const same = (a, b) => {
    if (a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
    return d === 0;
  };

  /** A new pad file for `a` and `b` (GitHub logins), `size` bytes of material from `random` (getRandomValues). */
  const make = (a, b, size, random) => {
    const one = String(a).toLowerCase(), two = String(b).toLowerCase();
    if (!LOGIN.test(one) || !LOGIN.test(two)) throw fail("login");
    if (one === two) throw fail("same");
    if (!Number.isInteger(size) || size < MIN || size > MAX) throw fail("size");
    const names = [encoder.encode(one), encoder.encode(two)];
    const head = MAGIC.length + ID + 2 + names[0].length + names[1].length;
    const out = new Uint8Array(head + size);
    out.set(MAGIC, 0);
    random(out.subarray(MAGIC.length, MAGIC.length + ID));
    let at = MAGIC.length + ID;
    for (const name of names) { out[at++] = name.length; out.set(name, at); at += name.length; }
    // getRandomValues fills 65536 bytes a call at most.
    for (let i = head; i < out.length; i += 65536) random(out.subarray(i, Math.min(out.length, i + 65536)));
    return out;
  };

  /** A pad file's parts, read in place (no copies), or an error with `code`: magic, short, login, same or size. */
  const parse = (bytes) => {
    if (!(bytes instanceof Uint8Array)) throw fail("magic");
    for (let i = 0; i < MAGIC.length; i++) if (bytes[i] !== MAGIC[i]) throw fail("magic");
    let at = MAGIC.length + ID;
    const logins = [];
    for (let k = 0; k < 2; k++) {
      const n = bytes[at];
      if (n === undefined || at + 1 + n > bytes.length) throw fail("short");
      let name;
      try { name = decoder.decode(bytes.subarray(at + 1, at + 1 + n)); } catch { throw fail("login"); }
      if (!LOGIN.test(name)) throw fail("login");
      logins.push(name);
      at += 1 + n;
    }
    if (logins[0] === logins[1]) throw fail("same");
    const size = bytes.length - at;
    if (size < MIN) throw fail("short");
    if (size > MAX) throw fail("size");
    const half = size >> 1, keys = Math.floor(half * KEY_SHARE / KEY) * KEY;
    const halves = [0, 1].map((k) => {
      const start = at + k * half;
      return { keys: bytes.subarray(start, start + keys), stream: bytes.subarray(start + keys, start + half), slots: keys / KEY };
    });
    const id = bytes.subarray(MAGIC.length, MAGIC.length + ID);
    return { bytes, id, idHex: hex(id), logins, halves };
  };

  /** Which half `me` sends from, talking to `peer`: 0 or 1; `not-you` or `not-peer` when the pad was made for others. */
  const roleOf = (pad, me, peer) => {
    const a = String(me).toLowerCase(), b = String(peer).toLowerCase();
    if (!pad.logins.includes(a)) throw fail("not-you");
    if (a === b || !pad.logins.includes(b)) throw fail("not-peer");
    return pad.logins[0] === a ? 0 : 1;
  };

  /** SHA-256 of the whole file: its first DIGEST bytes go in each hello and ack, and `fingerprint` shows it. */
  const digest = async (subtle, pad) => new Uint8Array(await subtle.digest("SHA-256", pad.bytes));
  /** What two people compare outside Ooga to know they hold the same file: 20 hex digits in groups of four. */
  const fingerprint = (sum) => hex(sum.subarray(0, 10)).match(/.{4}/g).join(" ");

  const tagOf = async (subtle, key, data) => {
    const k = await subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return new Uint8Array(await subtle.sign("HMAC", k, data));
  };

  /** A sealed frame of `type` from half `role`, keyed by `slot` and, for text, padded from `offset`: slot and bytes the
   * caller has recorded as used. A text's body is XORed before the first await, a control body is copied as is. */
  const seal = async (subtle, pad, role, slot, offset, type, body) => {
    const half = pad.halves[role], len = body.length, text = type === TYPE.text;
    if (len > TEXT_BYTES) throw fail("long");
    if (!Number.isInteger(slot) || slot < 0 || slot >= half.slots) throw fail("exhausted");
    if (!Number.isInteger(offset) || offset < 0 || text && offset + len > half.stream.length) throw fail("exhausted");
    const frame = new Uint8Array(HEAD + len + TAG), view = new DataView(frame.buffer);
    frame[0] = VERSION; frame[1] = type; frame.set(pad.id, 2); frame[18] = role;
    view.setUint32(19, slot); view.setUint32(23, offset); view.setUint16(27, len);
    if (text) for (let i = 0; i < len; i++) frame[HEAD + i] = body[i] ^ half.stream[offset + i];
    else frame.set(body, HEAD);
    frame.set(await tagOf(subtle, half.keys.subarray(slot * KEY, slot * KEY + KEY), frame.subarray(0, HEAD + len)), HEAD + len);
    return frame;
  };

  /** A frame from the other side opened, `{ ok: true, type, slot, offset, end, body }`, or `{ ok: false, error }`:
   * malformed, version, pad (another pad), direction (not the other side's half), range or auth (the tag fails).
   * Nothing is read from the stream before the tag checks out. */
  const open = async (subtle, pad, role, frame) => {
    if (!(frame instanceof Uint8Array) || frame.length < HEAD + TAG) return { ok: false, error: "malformed" };
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const type = frame[1], dir = frame[18], slot = view.getUint32(19), offset = view.getUint32(23), len = view.getUint16(27);
    const text = type === TYPE.text;
    if (frame.length !== HEAD + len + TAG || len > TEXT_BYTES || !text && type !== TYPE.hello && type !== TYPE.ack
      || type === TYPE.hello && len !== HELLO_BODY || type === TYPE.ack && len !== ACK_BODY) return { ok: false, error: "malformed" };
    if (frame[0] !== VERSION) return { ok: false, error: "version" };
    if (!same(frame.subarray(2, 18), pad.id)) return { ok: false, error: "pad" };
    if (dir !== 1 - role) return { ok: false, error: "direction" };
    const half = pad.halves[dir];
    if (slot >= half.slots || text && offset + len > half.stream.length) return { ok: false, error: "range" };
    const key = half.keys.subarray(slot * KEY, slot * KEY + KEY);
    if (!same(await tagOf(subtle, key, frame.subarray(0, HEAD + len)), frame.subarray(HEAD + len))) return { ok: false, error: "auth" };
    const body = frame.slice(HEAD, HEAD + len);
    if (text) for (let i = 0; i < len; i++) body[i] ^= half.stream[offset + i];
    return { ok: true, type, slot, offset, end: text ? offset + len : 0, body };
  };

  /** This device's record for one pad and sender. `store` is { get(key), set(key, value) } over localStorage, which may
   * throw; `lock(name, fn)` runs fn alone across tabs (navigator.locks). Every method is async and throws an error with
   * `code`: storage (unwritable), record (unreadable), unrecorded (no record and not said to be new), exhausted, or the
   * stop recorded earlier. */
  const ledger = (store, lock, pad, role) => {
    const key = STORE + pad.idHex + "." + role, mine = pad.halves[role], theirs = pad.halves[1 - role];
    const int = (v, max) => Number.isSafeInteger(v) && v >= 0 && v <= max;
    const valid = (r) => r && r.v === 1 && int(r.sk, mine.slots) && int(r.send, mine.stream.length) && int(r.rk, theirs.slots)
      && int(r.recv, theirs.stream.length) && typeof r.stop === "string";
    const read = () => {
      let text;
      try { text = store.get(key); } catch { throw fail("storage"); }
      if (text === null || text === undefined) return null;
      let r;
      try { r = JSON.parse(text); } catch { throw fail("record"); }
      if (!valid(r)) throw fail("record");
      return r;
    };
    const write = (r) => {
      const text = JSON.stringify({ v: 1, sk: r.sk, send: r.send, rk: r.rk, recv: r.recv, stop: r.stop });
      try { store.set(key, text); } catch { throw fail("storage"); }
      // Read it back: a storage that drops writes must stop the pad, not let it reuse bytes after a reload.
      let back;
      try { back = store.get(key); } catch { throw fail("storage"); }
      if (back !== text) throw fail("storage");
    };
    const current = () => {
      const r = read();
      if (!r) throw fail("record");
      if (r.stop) throw fail(r.stop);
      return r;
    };
    const copy = (r) => ({ sk: r.sk, send: r.send, rk: r.rk, recv: r.recv });
    return {
      slots: mine.slots, size: mine.stream.length,
      // The record, made on the first use of this pad as this sender only when `fresh` says the file was never used.
      start: (fresh) => lock(key, () => {
        let r = read();
        if (!r) {
          if (!fresh) throw fail("unrecorded");
          r = { v: 1, sk: 0, send: 0, rk: 0, recv: 0, stop: "" };
        }
        if (r.stop) throw fail(r.stop);
        write(r);
        return copy(r);
      }),
      // A key slot, and for text `len` stream bytes, written as used before anyone seals with them.
      reserve: (text, len) => lock(key, () => {
        const r = current();
        if (r.sk >= mine.slots || text && r.send + len > mine.stream.length) throw fail("exhausted");
        const slot = r.sk, offset = r.send;
        r.sk += 1;
        if (text) r.send += len;
        write(r);
        return { slot, offset, sk: r.sk, send: r.send };
      }),
      // How far the other side's half has been read, which only grows.
      received: (slot, end) => lock(key, () => {
        const r = current();
        if (slot + 1 > r.rk || end > r.recv) { r.rk = Math.max(r.rk, slot + 1); r.recv = Math.max(r.recv, end); write(r); }
        return copy(r);
      }),
      // A stop kept with the record, so this pad never starts on this device again.
      stop: (code) => lock(key, () => { const r = read() || { v: 1, sk: 0, send: 0, rk: 0, recv: 0, stop: "" }; r.stop = code; write(r); }),
      peek: () => lock(key, () => { const r = read(); return r ? { ...copy(r), stop: r.stop } : null; }),
    };
  };

  /** One conversation on one pad: `send(frame, n)` hands a sealed frame to the room with a number to match its answer;
   * `sum` is the file's `digest`; `random(view)` fills a nonce. `start({ fresh })` checks the record and says hello;
   * `say(text)` seals a line once ready; `heard(frame)` opens one from the other side, one at a time in arrival order,
   * and answers what it was: { kind: "hello" | "ready" | "text" | "duplicate" | "dropped" | "closed" | "stopped",
   * text?, error? }; a text also says whether it is `late` (a line sealed after it showed first), the `gaps` it is the
   * first line past (lines that haven't arrived), and the gaps it or an earlier late line `filled`, by number. `hello()`
   * says hello again while the line is not open. A stop (`stopped`: behind-here, mismatch, or a record code) ends the
   * pad here. */
  const session = ({ subtle, pad, role, ledger: book, sum, random, send }) => {
    const s = { ready: false, stopped: "", closed: false, sent: 0, size: book.size, remaining: book.size, slotsLeft: book.slots,
      outbox: new Map(), helloN: 0 };
    const mark = sum.subarray(0, DIGEST), nonce = new Uint8Array(NONCE);
    // `sealed`: slots this device has used, as its record last said. `shown`: the furthest line shown, by line number.
    let queue = Promise.resolve(), serial = 0, rk = 0, recv = 0, before = null, sealed = 0, hellos = 0, shown = -1, gapId = 0;
    // The other side's hello nonces answered, and its stream ranges not read below `recv`: { id, to, parts, noted }.
    const answered = new Set(), gaps = [];
    const gapOpen = (from, to) => { gaps.push({ id: ++gapId, to, parts: [[from, to]], noted: false }); if (gaps.length > GAPS) gaps.shift(); };
    // Takes [a, b) out of a gap if it lies wholly inside one, answering whether it did; an emptied gap goes to `filled`.
    const fill = (a, b, filled) => {
      for (let g = 0; g < gaps.length; g++) {
        const gap = gaps[g];
        for (let i = 0; i < gap.parts.length; i++) {
          const [x, y] = gap.parts[i];
          if (a < x || b > y) continue;
          gap.parts.splice(i, 1, ...[[x, a], [b, y]].filter(([p, q]) => q > p));
          if (!gap.parts.length) { gaps.splice(g, 1); if (gap.noted) filled.push(gap.id); }
          return true;
        }
      }
      return false;
    };
    const stop = async (code, keep) => {
      if (!s.stopped) s.stopped = code;
      if (keep) try { await book.stop(code); } catch { /* The stop holds for this session either way. */ }
      return { kind: "stopped", error: s.stopped };
    };
    const guarded = async (fn) => {
      try { return await fn(); } catch (e) { return e && e.code === "closed" ? { kind: "closed" } : stop(e && e.code || "error"); }
    };
    const open_ = () => { if (s.closed) throw fail("closed"); };
    // `stamp` writes a new line's number, where its bytes start; a line sealed again keeps the one it had.
    const transmit = async (type, body, stamp) => {
      open_();
      const r = await book.reserve(type === TYPE.text, body.length);
      open_();
      sealed = r.sk;
      if (stamp) new DataView(body.buffer, body.byteOffset, body.byteLength).setUint32(0, r.offset);
      s.remaining = book.size - r.send; s.slotsLeft = book.slots - r.sk;
      // `seal` XORs before its first await, and `close` comes before the pad is zeroed: no frame is sealed on zeros.
      const frame = await seal(subtle, pad, role, r.slot, r.offset, type, body);
      open_();
      const n = ++serial;
      // Kept until the room answers ok, for a retry; the oldest unanswered go past OUTBOX.
      s.outbox.set(n, { frame, type, body });
      if (s.outbox.size > OUTBOX) s.outbox.delete(s.outbox.keys().next().value);
      send(frame, n);
      return n;
    };
    const run = (fn) => (queue = queue.then(fn, fn));
    const sayHello = async () => {
      random(nonce);
      const hello = new Uint8Array(HELLO_BODY);
      hello.set(nonce, 0); hello.set(mark, NONCE);
      hellos++;
      s.helloN = await transmit(TYPE.hello, hello);
      return { kind: "sent", n: s.helloN };
    };
    return Object.assign(s, {
      // `{ kind: "started" }`, `{ kind: "unrecorded" }` when this device has no record of the pad and was not told it is
      // new (nothing is spent; start again with fresh), or stopped.
      start: ({ fresh = false } = {}) => run(() => guarded(async () => {
        let r;
        try { r = await book.start(fresh); } catch (e) { if (e && e.code === "unrecorded") return { kind: "unrecorded" }; throw e; }
        open_();
        before = { sk: r.sk, send: r.send };
        rk = r.rk; recv = r.recv;
        s.remaining = book.size - r.send; s.slotsLeft = book.slots - r.sk; sealed = r.sk;
        await sayHello();
        return { kind: "started" };
      })),
      // Hello again with a fresh nonce, for one the room dropped: `{ kind: "sent", n }`, or `{ kind: "none" }` once the
      // line is open, after HELLO_TRIES, or before the pad started.
      hello: () => run(() => guarded(async () => {
        if (!before || s.ready || s.stopped || s.closed || hellos > HELLO_TRIES) return { kind: "none" };
        return sayHello();
      })),
      // `{ kind: "sent", n }`, or `{ kind: "refused", error: "long" | "empty" | "not-ready" }` for a line that cannot go.
      say: (text) => run(() => guarded(async () => {
        if (s.stopped) return { kind: "stopped", error: s.stopped };
        if (!s.ready) return { kind: "refused", error: "not-ready" };
        const bytes = encoder.encode(text);
        if (!bytes.length) return { kind: "refused", error: "empty" };
        if (LINE_ID + bytes.length > TEXT_BYTES) return { kind: "refused", error: "long" };
        const body = new Uint8Array(LINE_ID + bytes.length);
        body.set(bytes, LINE_ID);
        return { kind: "sent", n: await transmit(TYPE.text, body, true) };
      })),
      // A send the room refused or never answered, again: `{ kind: "sent", n }` with the number it now goes under, or
      // `{ kind: "gone" }`. While it is the newest frame sealed it goes again unchanged, so a copy that did arrive is a
      // repeat. Once a later frame has been sealed, that one may already have taken the other side past it, so the same
      // body is sealed again on a fresh slot and fresh bytes. Nothing new is ever sealed on a slot or bytes already
      // used, and the same text on two sets of bytes tells the room nothing.
      retry: (n) => run(() => guarded(async () => {
        const entry = s.outbox.get(n);
        if (!entry || s.stopped || s.closed) return { kind: "gone" };
        if (n === serial) { send(entry.frame, n); return { kind: "sent", n }; }
        s.outbox.delete(n);
        return { kind: "sent", n: await transmit(entry.type, entry.body) };
      })),
      delivered: (n) => { if (s.outbox.delete(n)) s.sent++; },
      heard: (frame) => run(() => guarded(async () => {
        if (s.stopped) return { kind: "stopped", error: s.stopped };
        open_();
        if (!before) return { kind: "dropped", error: "not-started" };
        const got = await open(subtle, pad, role, frame);
        open_();
        if (!got.ok) return { kind: "dropped", error: got.error };
        const body = got.body, view = new DataView(body.buffer, body.byteOffset, body.byteLength);
        if (got.type === TYPE.hello) {
          if (!same(body.subarray(NONCE, NONCE + DIGEST), mark)) return stop("mismatch");
          // Answered even from a slot already read: a side whose record is behind learns it from this ack, and says
          // hello with a nonce never answered. A nonce answered already, a hello the room plays again, spends nothing.
          const said = hex(body.subarray(0, NONCE));
          if (answered.has(said) || answered.size >= ANSWERS) return { kind: "duplicate" };
          answered.add(said);
          if (got.slot >= rk) { const r = await book.received(got.slot, recv); rk = r.rk; recv = r.recv; open_(); }
          const ack = new Uint8Array(ACK_BODY), out = new DataView(ack.buffer);
          ack.set(body.subarray(0, NONCE), 0); ack.set(mark, NONCE);
          out.setUint32(NONCE + DIGEST, rk); out.setUint32(NONCE + DIGEST + 4, recv);
          await transmit(TYPE.ack, ack);
          return { kind: "hello" };
        }
        if (got.type === TYPE.ack) {
          // Only an answer to this session's latest hello, before the line opened, counts; any other was recorded
          // earlier, or came after, and proves nothing now.
          if (s.ready || got.slot < rk || !same(body.subarray(0, NONCE), nonce)) return { kind: "duplicate" };
          if (!same(body.subarray(NONCE, NONCE + DIGEST), mark)) return stop("mismatch");
          const r = await book.received(got.slot, recv); rk = r.rk; recv = r.recv;
          open_();
          // The other side may have read any slot this device sealed, but no text it had not sent before its hello.
          if (view.getUint32(NONCE + DIGEST) > sealed || view.getUint32(NONCE + DIGEST + 4) > before.send) return stop("behind-here", true);
          s.ready = true;
          return { kind: "ready" };
        }
        if (body.length <= LINE_ID || view.getUint32(0) > got.offset) return { kind: "dropped", error: "malformed" };
        const line = view.getUint32(0), filled = [];
        if (got.offset >= recv) {
          if (got.offset > recv) gapOpen(recv, got.offset);
          const r = await book.received(got.slot, got.end); rk = r.rk; recv = r.recv;
          open_();
        } else if (!fill(got.offset, got.end, filled)) return { kind: "duplicate" };
        // A line sealed again on fresh bytes shows only if it never arrived where it was first sealed.
        if (line !== got.offset && !fill(line, line + body.length, filled)) return { kind: "duplicate" };
        let text;
        try { text = decoder.decode(body.subarray(LINE_ID)); } catch { return { kind: "dropped", error: "malformed" }; }
        const late = line < shown, passed = [];
        if (line > shown) shown = line;
        for (const gap of gaps) if (!gap.noted && line >= gap.to) { gap.noted = true; passed.push(gap.id); }
        return { kind: "text", text, late, gaps: passed, filled };
      })),
      // Ends the session: nothing waiting or in flight seals, sends or reads after this, so the pad may be zeroed.
      close: () => { s.closed = true; s.ready = false; },
    });
  };

  const PAD = Object.freeze({ MIN, MAX, KEY, TAG, HEAD, TEXT_BYTES, LINE_ID, SIZES, STORE, KEY_SHARE });
  BL.oneTimePad = Object.freeze({ PAD, TYPE, make, parse, roleOf, digest, fingerprint, seal, open, ledger, session });
})();
