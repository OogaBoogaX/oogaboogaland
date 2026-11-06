// Donations, simulated or real. Real mode talks to the page's API (bananapayserver, its contract in that repository's
// docs/protocol.md): `invoice` asks it for a Lightning invoice, `note` sets the message, `onchain` adds an address to
// pay that invoice on-chain, and `subscribe` opens its socket, which pushes each donation in OBL's event shape
// `{ id, sats, handle, message, at }`, the pile, the leaderboard, the tally of every donation it holds with its current
// rate, whether donations are open, and each on-chain payment seen before its block. Without an API the simulator plays
// tips now and then, as it always has, for demos and for the suite.
//
// The page only ever calls its own address: its Worker passes /donations/* on to bananapayserver over a service binding
// and names the donor from its own GitHub sign-in, while the page supplies the editable display handle. Real mode starts once that Worker says
// it has the binding (`useOrigin`, which the director calls when the account's look at /api/me reports `donations`), so
// staging and production each find their own with nothing stamped into the build. The socket's status says which
// network the payments are on: anything but mainnet is a test (`testNetwork`), and the page labels it so.
//
// Receipt accounting v1 (docs/receipt-accounting.md, bananapayserver's docs/receipt-accounting-v1.md) runs beside the
// legacy stream whenever the API advertises it (`state.accounting`). An invoice keeps the mode it was made in: legacy
// invoices publish `donation` events keyed by the invoice id, receipt-mode ones publish `receipt` revisions keyed by a
// receipt id, plus `invoiceStatus` frames for totals that move without a receipt, on one sequenced stream with its own
// cursor. Revisions are authoritative and replace what is held; only a live first credit animates. An invoice this page
// made, or reopened through the account's private history, is tracked as a `view` the kiosks read; private reads go
// through the page's own Worker, which names the account from its session, and are fenced by `generation`, which a
// sign-out or another account bumps, dropping every private thing held. Request tokens stay in memory.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const NETWORKS = ["mainnet", "testnet", "signet", "regtest"];
  let real = false, invoiceMessageMax = 80;
  const OWN_MAX = 64, ownInvoices = new Map(), ownRequestSats = new Map();
  const config = {
    serverUrl: "https://btcpay.example.org",
    storeId: "REPLACE_WITH_STORE_ID",
    currency: "BTC",
    simulate: true
  };
  // GitHub usernames run to 39 characters; the API's copy of the contract holds the same.
  const HANDLE_MAX = 39;
  const MESSAGE_MAX = 280;
  // The fewest sats a tip needs to carry a message, so a run of tiny tips cannot speak: the page's bar, which the API's
  // status may replace (`messageMinSats`). The recent list shows every amount, with a checkbox to keep to the bar.
  const MESSAGE_MIN_SATS = 1000;
  const sanitize = (text, max) => String(text || "").replace(/[^\w .,!?'@#:-]/g, "").trim().slice(0, max);
  const messageMinSats = () => state.limits?.messageMinSats ?? MESSAGE_MIN_SATS;
  const carried = (sats, message, bar = messageMinSats()) => sats >= bar ? sanitize(message, MESSAGE_MAX) : "";
  const randomId = () => {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  };
  const createRequest = ({ handle = "", message = "" } = {}) => {
    const id = `banana-${randomId()}`;
    const url = new URL(`${config.serverUrl}/api/v1/invoices`);
    url.searchParams.set("storeId", config.storeId);
    url.searchParams.set("currency", config.currency);
    url.searchParams.set("orderId", id);
    const cleanHandle = sanitize(handle, HANDLE_MAX);
    const cleanMessage = sanitize(message, MESSAGE_MAX);
    if (cleanHandle) url.searchParams.set("handle", cleanHandle);
    if (cleanMessage) url.searchParams.set("message", cleanMessage);
    return { id, url: url.toString(), handle: cleanHandle, message: cleanMessage };
  };

  // ---- real mode: the API ------------------------------------------------------------------------------------
  const isNumber = (v) => typeof v === "number" && Number.isFinite(v);
  // A price as the API sends one: dollars a bitcoin, sats a banana, when it was fetched and whether that was the last
  // price because a newer one could not be had.
  const rateOf = (rate) => rate && isNumber(rate.usdPerBtc) && isNumber(rate.satsPerBanana)
    ? { usdPerBtc: rate.usdPerBtc, satsPerBanana: rate.satsPerBanana, at: isNumber(rate.at) ? rate.at : 0, stale: !!rate.stale } : null;
  // One call to the page's own Worker: JSON in and out with the sign-in cookie. Resolves to the reply (`{}` for a
  // 204), or to `{ error }` as the API names it, `network` when it cannot be reached.
  const call = async (path, body) => {
    let res;
    try {
      res = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } catch {
      return { error: "network" };
    }
    if (res.status === 204) return {};
    let data = null;
    try {
      data = await res.json();
    } catch {
      // Not JSON: checked below.
    }
    if (!res.ok) return { error: data && typeof data.error === "string" ? data.error : "invalid" };
    return data && typeof data === "object" && !Array.isArray(data) ? data : { error: "invalid" };
  };
  // An invoice for `sats`, with the message if there is one: `{ request, invoice: { id, bolt11, expires }, bananas,
  // rate }` checked field by field (`bananas` and `rate` null when there has never been a price, `bolt11` null when the
  // API couldn't make the Lightning half in time, and the invoice can still be paid on-chain), or `{ error }`.
  // `request` stays in memory, never in an address.
  const invoice = async ({ sats, handle, message = "", anon = false }) => {
    const body = { sats }, text = carried(sats, message), gen = generation;
    // Receipt mode only where the API issues it; it never downgrades, so neither does the page.
    if (state.accounting?.issuance === true) body.accounting = 1;
    if (handle !== undefined) body.handle = sanitize(handle, HANDLE_MAX).replace(/^@+/, "").trim() || "anon";
    if (text) body.message = text;
    if (anon) body.anon = true;
    let r = await call("/donations/invoice", body);
    // Keep default-name payments working during the coordinated backend rollout. An older
    // server rejects the new handle key; never silently discard a custom name or long message.
    if (r.error === "invalid" && body.handle !== undefined) {
      const defaultHandle = BL.net?.state.me?.login || "anon";
      if (body.handle !== defaultHandle || text.length > 80) return { error: "details" };
      delete body.handle;
      r = await call("/donations/invoice", body);
    }
    if (r.error) return r;
    const inv = r.invoice, b = r.bananas, rate = r.rate;
    if (typeof r.request !== "string" || !inv || typeof inv.id !== "string" || typeof inv.bolt11 !== "string" && inv.bolt11 != null || !isNumber(inv.expires)) return { error: "invalid" };
    const accounting = inv.accounting === undefined ? "legacy" : inv.accounting;
    if (accounting !== "legacy" && accounting !== "receipt-v1" || body.accounting === 1 && accounting !== "receipt-v1"
      || accounting === "receipt-v1" && (!ID.test(inv.id) || !isExpiry(inv.expires))) return { error: "invalid" };
    // An account change while the invoice was being made: its token belongs to the account that asked.
    if (gen !== generation) return { error: "closed" };
    if (accounting === "receipt-v1") viewFor(inv.id, r.request);
    invoiceMessageMax = body.handle === undefined ? 80 : MESSAGE_MAX;
    if (ownInvoices.has(inv.id)) ownRequestSats.delete(ownInvoices.get(inv.id));
    ownInvoices.set(inv.id, r.request);
    ownRequestSats.set(r.request, sats);
    if (ownInvoices.size > OWN_MAX) {
      const oldest = ownInvoices.keys().next().value;
      ownRequestSats.delete(ownInvoices.get(oldest));
      ownInvoices.delete(oldest);
    }
    if (ownRequestSats.size > OWN_MAX) ownRequestSats.delete(ownRequestSats.keys().next().value);
    return {
      request: r.request,
      invoice: { id: inv.id, bolt11: inv.bolt11 || null, expires: inv.expires, accounting },
      bananas: b && isNumber(b.exact) && isNumber(b.rounded) ? { exact: b.exact, rounded: b.rounded } : null,
      rate: rateOf(rate),
      pricing: r.pricing === "receipt" ? "receipt" : "invoice",
      lightning: ["available", "limit", "unavailable"].includes(r.lightning) ? r.lightning : inv.bolt11 ? "available" : "unavailable"
    };
  };
  // Replaces the message on a request not yet paid.
  const note = (request, message, handle) => {
    const body = { request, message: carried(ownRequestSats.get(request), message) };
    // Older servers accept notes but silently cap them at 80 characters. Never claim a long edit saved there.
    if (body.message.length > invoiceMessageMax) return Promise.resolve({ error: "invalid" });
    if (handle !== undefined) body.handle = sanitize(handle, HANDLE_MAX).replace(/^@+/, "").trim() || "anon";
    return call("/donations/note", body);
  };
  // Switches a request's invoice to on-chain as well: `{ address, sats }`, the address and what to send there (more than
  // the invoice when the store adds a network fee), checked, or `{ error }` (`expired` once the invoice has).
  // A receipt-mode invoice then reads its private status, the only source of its payable address and current amount:
  // the reply's `sats` is the provider's amount at issuance, never reused for one.
  const onchain = async (request) => {
    const r = await call("/donations/onchain", { request });
    if (r.error) return r;
    if (typeof r.address !== "string" || !ADDRESS.test(r.address) || !Number.isInteger(r.sats) || r.sats <= 0) return { error: "invalid" };
    for (const v of views.values()) if (v.request === request) { v.issued = r.address; readStatus(v); }
    return { address: r.address, sats: r.sats };
  };
  // The invoices the kiosk let the visitor go from with an on-chain address shown and nothing received, kept for the
  // page life so the payment, when it is seen and when it confirms, can say it was theirs: `waitFor(id)`,
  // `waitingOn(id)`, and `waited(id)`, true once when that invoice's donation comes. Past WAIT_MAX the oldest is dropped.
  const WAIT_MAX = 16, waiting = new Set();
  // Only an invoice this page asked for under the current account: an account change clears `ownInvoices`, so a stop
  // caused by it can't put the last account's invoice back.
  const waitFor = (id) => {
    if (!ownInvoices.has(id)) return;
    waiting.add(id);
    if (waiting.size > WAIT_MAX) waiting.delete(waiting.values().next().value);
  };
  const waitingOn = (id) => waiting.has(id);
  const waited = (id) => waiting.delete(id);
  // Only this page's own paid invoices enter its remembered-name suggestions, even after leaving a kiosk.
  const receivedOwnInvoice = (id) => {
    if (!ownInvoices.has(id)) return false;
    ownRequestSats.delete(ownInvoices.get(id));
    ownInvoices.delete(id);
    return true;
  };
  // A receipt-mode invoice keeps its token for its status reads: its first credited receipt says, once, that it was
  // this page's own, without letting the token go.
  const remembered = new Set();
  const ownReceipt = (invoiceId) => {
    if (!ownInvoices.has(invoiceId) || remembered.has(invoiceId)) return false;
    remembered.add(invoiceId);
    if (remembered.size > OWN_MAX) remembered.delete(remembered.values().next().value);
    return true;
  };

  // The socket. It sends nothing (a page that does is closed), comes back with backoff, and on a reconnect asks for
  // what it missed after the last donation it played; a donation already played is skipped. `state.open` is the
  // API's last word on whether donations are open, and `state.network` the network it takes payments on, each null
  // before it has said. `state.tally` is its latest tally, null before the first.
  const SOCKET_MIN = 1000, SOCKET_MAX = 60000, PLAYED = 64, RECENT_MAX = 10;
  const state = { open: null, network: null, connected: false, attempts: 0, donations: 0, tally: null, board: null, boardSats: null, recent: null, limits: null,
    accounting: null, pile: null, pileLive: false, recentReceipts: null, receiptCursor: null, caughtUp: false, resyncs: 0, account: null, history: null, receipts: 0 };
  const limitsOf = (v) => v && Number.isSafeInteger(v.minSats) && v.minSats > 0
    && Number.isSafeInteger(v.maxSats) && v.maxSats >= v.minSats
    && Number.isSafeInteger(v.lightningMaxSats) && v.lightningMaxSats > 0 && v.lightningMaxSats <= v.maxSats
    && (v.messageMinSats === undefined || Number.isSafeInteger(v.messageMinSats) && v.messageMinSats >= 0)
    ? { minSats: v.minSats, maxSats: v.maxSats, lightningMaxSats: v.lightningMaxSats, messageMinSats: v.messageMinSats ?? MESSAGE_MIN_SATS } : null;
  const readers = new Set();
  const notify = () => { for (const reader of readers) reader(); };
  const subscribeState = (reader) => {
    readers.add(reader);
    return () => readers.delete(reader);
  };
  const played = new Array(PLAYED).fill(""), handlers = { donation: null, status: null, pile: null, board: null, seen: null };
  // `after` is the legacy cursor, the last legacy donation played; the receipt cursor is `state.receiptCursor`.
  let socket = null, timer = 0, backoff = SOCKET_MIN, after = "", playedAt = 0, live = false, pileRevision = -1;
  const donationOf = (d) => {
    if (!d || typeof d.id !== "string" || !d.id || d.id.length > 64 || !Number.isInteger(d.sats) || d.sats <= 0 || !isNumber(d.at)) return null;
    return { id: d.id, sats: d.sats, handle: sanitize(d.handle, HANDLE_MAX), message: carried(d.sats, d.message), at: d.at };
  };
  const recentOf = (d) => {
    const donation = donationOf(d);
    if (!donation || !isNumber(d.bananas) || d.bananas < 0) return null;
    return { ...donation, bananas: d.bananas, verified: d.verified === true,
      seq: Number.isSafeInteger(d.seq) && d.seq > 0 ? d.seq : 0 };
  };
  const insertRecent = (list, entry) => {
    const old = list.findIndex((item) => item.id === entry.id);
    if (old >= 0) list.splice(old, 1);
    let at = 0;
    while (at < list.length && (entry.seq && list[at].seq ? list[at].seq > entry.seq : list[at].at > entry.at)) at++;
    list.splice(at, 0, entry);
    if (list.length > RECENT_MAX) list.length = RECENT_MAX;
  };
  const boardOf = (entries) => entries.slice(0, 256)
    .filter((e) => e && typeof e.handle === "string" && isNumber(e.bananas) && e.bananas >= 0)
    .map((e) => ({ handle: sanitize(e.handle, HANDLE_MAX), bananas: e.bananas, sats: Number.isSafeInteger(e.sats) && e.sats >= 0 ? e.sats : null }));
  // The tally: every donation the API holds, all time (`count`, `sats`, `bananas`), the latest one's sats, the last
  // seven days in UTC hours (`[start in ms, sats, bananas]`, only hours with donations) and its current rate. A new
  // object each time, so a reader sees a change by its identity.
  const TALLY_HOURS = 7 * 24 + 1;
  const tallyOf = (t) => {
    if (!isNumber(t.count) || !isNumber(t.sats) || !isNumber(t.bananas) || t.last !== null && !isNumber(t.last) || !Array.isArray(t.hours)) return null;
    const hours = [];
    for (const h of t.hours) if (hours.length < TALLY_HOURS && Array.isArray(h) && isNumber(h[0]) && isNumber(h[1]) && isNumber(h[2])) hours.push([h[0], Math.max(0, h[1]), Math.max(0, h[2])]);
    return { count: Math.max(0, t.count), sats: Math.max(0, t.sats), bananas: Math.max(0, t.bananas), last: Math.max(0, t.last), hours, rate: rateOf(t.rate) };
  };
  // ---- receipt accounting v1 ----------------------------------------------------------------------------------
  // Bounds: tracked invoices, the rows one server page may bring (larger is refused, never cut, so a cursor never
  // skips rows the page did not keep), the receipt revisions and animations remembered, how long an opaque cursor may
  // be (the API's bodies are at most 1 KiB), and how many replies in a row may come back older than what is held.
  const VIEW_MAX = 32, PAGE_MAX = 100, REVISIONS = 512, ANIMATED = 256, CURSOR_MAX = 256, STALE_READS = 2;
  const ID = /^[\w-]{1,96}$/, ADDRESS = /^[0-9A-Za-z]{14,100}$/;
  const RECEIPT_STATES = ["confirming", "credited", "invalid", "reversed", "review"];
  const INVOICE_STATES = ["review", "paid", "confirming", "partial", "unpaid"];
  const RECONCILIATION = ["off", "current", "behind", "review"], LIGHTNING = ["available", "limit", "unavailable", "expired"];
  const isCount = (v) => Number.isSafeInteger(v) && v >= 0;
  // A receipt-mode invoice's original expiry, in Unix seconds: a positive safe integer, never null, zero or a guess. The
  // API answers 503 `closed` for a status or history page it can't state one for, rather than leave it out.
  const isExpiry = (v) => Number.isSafeInteger(v) && v > 0;
  const cursorOk = (c) => c === null || typeof c === "string" && c.length > 0 && c.length <= CURSOR_MAX;
  // Keeps `key` last in insertion order, dropping the oldest past `max`.
  const keep = (map, key, value, max) => {
    map.delete(key);
    map.set(key, value);
    if (map.size > max) map.delete(map.keys().next().value);
  };
  const accountingOf = (a) => a && a.version === 1 && typeof a.issuance === "boolean" && typeof a.receipts === "boolean" && typeof a.history === "boolean"
    && a.coverage === "invoice" && a.spends === false && RECONCILIATION.includes(a.reconciliation)
    ? { version: 1, issuance: a.issuance, receipts: a.receipts, history: a.history, coverage: "invoice", spends: false, reconciliation: a.reconciliation } : null;
  const bananasOf = (b) => b && isNumber(b.exact) && b.exact >= 0 && isNumber(b.rounded) && b.rounded >= 0 ? { exact: b.exact, rounded: b.rounded } : null;
  // A receipt's price: null while its first detection's pricing is unresolved, then frozen for good. A frozen price with
  // no rate and no bananas is permanently unpriced (zero bananas), never pending. Undefined when malformed.
  const pricingOf = (p) => {
    if (p === null) return null;
    if (!p || !isNumber(p.receivedAt)) return undefined;
    const rate = p.rate === null ? null : rateOf(p.rate), bananas = p.bananas === null ? null : bananasOf(p.bananas);
    if (rate === null && p.rate !== null || bananas === null && p.bananas !== null) return undefined;
    return { receivedAt: p.receivedAt, rate, bananas };
  };
  // A receipt revision. Credit waits for a frozen price, so a receipt still pricing carries no credit and no first
  // credit; one that claims either is refused rather than shown with a value nobody recorded. Its message was weighed
  // against the invoice's own saved bar when it was captured, so it is only sanitized here, never held to today's bar.
  const receiptOf = (r) => {
    if (!r || typeof r.id !== "string" || !ID.test(r.id) || typeof r.invoice !== "string" || !ID.test(r.invoice)
      || r.method !== "onchain" && r.method !== "lightning" || !Number.isSafeInteger(r.sats) || r.sats <= 0
      || r.credit !== 0 && r.credit !== r.sats || !RECEIPT_STATES.includes(r.state) || !Number.isSafeInteger(r.revision) || r.revision < 1
      || !isNumber(r.at) || r.firstCreditedSeq !== null && !(Number.isSafeInteger(r.firstCreditedSeq) && r.firstCreditedSeq > 0)) return null;
    const pricing = pricingOf(r.pricing);
    if (pricing === undefined || pricing === null && (r.credit !== 0 || r.firstCreditedSeq !== null)) return null;
    return { id: r.id, invoice: r.invoice, method: r.method, sats: r.sats, credit: r.credit, state: r.state, revision: r.revision, at: r.at,
      firstCreditedSeq: r.firstCreditedSeq, handle: sanitize(r.handle, HANDLE_MAX), message: sanitize(r.message, MESSAGE_MAX), verified: r.verified === true, pricing };
  };
  // An invoice's authoritative cumulative totals. `left` is the provider's fee-aware remainder, null when unknown.
  const totalsOf = (t) => t && typeof t.id === "string" && ID.test(t.id) && Number.isSafeInteger(t.due) && t.due > 0
    && isCount(t.received) && isCount(t.credited) && isCount(t.review) && t.credited <= t.received && t.review <= t.received
    && (t.left === null || isCount(t.left)) && INVOICE_STATES.includes(t.state) && isCount(t.revision)
    ? { id: t.id, due: t.due, received: t.received, credited: t.credited, review: t.review, left: t.left, state: t.state, revision: t.revision } : null;
  // The pile: the legacy message (a number, its `eatPerHour` ignored: nothing decays) or v1's revisioned projection,
  // whose `bananas` is null whenever it has no safe count: before the cutover anchor exists, or after it when a
  // negative correction or unrepresentable totals leave none. `basis: "credits"` counts credits, not a wallet.
  const pileOf = (p) => {
    if (p.bananas !== null && !(isNumber(p.bananas) && p.bananas >= 0)) return null;
    const uncertain = p.uncertain && isCount(p.uncertain.sats) && isNumber(p.uncertain.bananas) && p.uncertain.bananas >= 0
      ? { sats: p.uncertain.sats, bananas: p.uncertain.bananas } : null;
    return { bananas: p.bananas, at: isNumber(p.at) ? p.at : null, revision: isCount(p.revision) ? p.revision : null,
      basis: typeof p.basis === "string" ? p.basis : null, cutover: p.cutover === "pending" || p.cutover === "done" ? p.cutover : null,
      reconciliation: RECONCILIATION.includes(p.reconciliation) ? p.reconciliation : null, uncertain };
  };
  // A recent row for a receipt the feed calls credited or in review, with its own frozen bananas: zero when permanently
  // unpriced, null while its price is still freezing (a review receipt may be listed before it has one). Its `at` is when
  // the receipt was received (its frozen price's `receivedAt`, which never moves; until then the time it was first held),
  // never `receipt.at`, the latest revision's time, so a correction never moves an old donation to the top.
  const receiptRow = (r, held) => ({ id: r.id, sats: r.sats, handle: r.handle, message: r.message, verified: r.verified, revision: r.revision,
    at: r.pricing ? r.pricing.receivedAt : held ? held.at : r.at, seq: r.firstCreditedSeq || 0,
    bananas: r.pricing === null ? null : r.pricing.bananas ? r.pricing.bananas.exact : 0, review: r.state === "review", receipt: true });
  const listed = (r) => r.state === "credited" || r.state === "review";
  // Newest first by when received, then by first credit.
  const byReceived = (a, b) => b.at - a.at || b.seq - a.seq;

  // What is held: each receipt's newest revision heard on the stream and the receipts that have animated, both bounded,
  // the invoices this page tracks, and the account generation every private read is fenced by.
  const revisions = new Map(), animated = new Set(), views = new Map();
  // `epoch` moves at every catch-up: a private read begun before it is from before the reconnect, and counts for nothing.
  let generation = 0, historyTicket = 0, epoch = 0;
  const touch = (v) => { v.version++; notify(); };
  // A tracked invoice. `receipts` and `addresses` are one server page each (`receiptsFrom`/`addressesFrom` the cursor
  // that page was read with, null for the newest); `payableRevision` is the totals revision its payable address was
  // read at, so an amount is offered only while the two agree. `navReceipts`/`navAddresses` count each list's navigation,
  // and `newestReceipts`/`newestAddresses` ask the next first-page read to bring that list back to its newest page.
  const viewFor = (id, request) => {
    let v = views.get(id);
    if (!v) {
      v = { id, request: null, issued: null, due: 0, received: 0, credited: 0, review: 0, left: null, state: "unpaid", revision: -1,
        expires: 0, lightning: null, bolt11: null, payableAddress: null, payableRevision: -1,
        receipts: [], receiptsFrom: null, next: null, addresses: [], addressesFrom: null, nextAddress: null, observed: false,
        fresh: false, awaiting: false, loading: false, again: null, navReceipts: 0, navAddresses: 0, newestReceipts: false, newestAddresses: false,
        staleReads: 0, pending: null, read: false, retired: false, retries: 0, retryTimer: 0, error: "", version: 0 };
      views.set(id, v);
      // Past the cap the oldest goes untracked, but a screen may still hold it: it keeps its records as history and loses,
      // for good, every claim to being current.
      if (views.size > VIEW_MAX) {
        const oldest = views.keys().next().value;
        retire(views.get(oldest));
        views.delete(oldest);
      }
    }
    if (request) v.request = request;
    return v;
  };
  // A view no longer tracked (dropped past the cap, or the account changed): nothing hears for it again, so nothing it holds
  // is current from now on, and it never names a payable address or amount. Its records stay for whoever shows them.
  const retire = (v) => {
    v.retired = true;
    v.fresh = false;
    v.awaiting = true;
    v.payableRevision = -1;
    v.version++;
    shown.delete(v);
    cancelRetry(v);
  };
  // The invoices a screen shows (the Factory booth's or the popup's kiosk, `showing`), only ever tracked ones, each with
  // how many screens show it: the booth and the popup can both hold one (a history row reopened beside the booth), and
  // it stays shown until both let go. They are the ones read again after a catch-up and when their totals move; any
  // other tracked view is only marked behind, and read once a screen shows it, so a reconnect never sends a read for
  // every invoice the visitor ever tried. Keyed by the view itself, so a screen letting go of a view since dropped never
  // counts against a newer view of the same invoice.
  const shown = new Map();
  // A shown invoice's read the API answered `busy` is tried again by itself after these delays, then left to CHECK AGAIN:
  // one timer a shown view at most, cancelled when no screen shows it, when it is dropped and on an account change.
  const RETRY_MS = [2000, 4000, 8000, 16000];
  const cancelRetry = (v) => {
    if (v.retryTimer) window.clearTimeout(v.retryTimer);
    v.retryTimer = 0;
  };
  const retryBusy = (v) => {
    if (v.retryTimer || v.retries >= RETRY_MS.length || !shown.has(v)) return;
    const gen = generation;
    v.retryTimer = window.setTimeout(() => {
      v.retryTimer = 0;
      if (gen === generation && views.get(v.id) === v && shown.has(v)) readStatus(v);
    }, RETRY_MS[v.retries++]);
  };
  // The stream is up and caught up (exported as `streamCurrent`: the address issued on a visit carries a QR before its
  // invoice's first read only while this holds).
  const freshNow = () => state.connected && state.caughtUp;
  // Some receipt has been seen for the invoice: from now on, for the view's life, its original full-target Lightning
  // code is never offered, even if every receipt is later reversed or found invalid and the totals fall back to zero.
  const observe = (v) => {
    v.observed = true;
    v.bolt11 = null;
  };
  const applyTotals = (v, t, read = false) => {
    if (t.revision < v.revision || t.revision === v.revision && !read) return false;
    v.due = t.due; v.received = t.received; v.credited = t.credited; v.review = t.review; v.left = t.left; v.state = t.state; v.revision = t.revision;
    if (v.received || v.credited || v.review) observe(v);
    return true;
  };
  // A receipt heard on the stream into the receipts shown: updated in place by a newer revision when it is there; a new
  // one only from a frame past the cursor, on the newest page and within PAGE_MAX (the status read its totals prompt
  // brings the page up to date anyway).
  const placeReceipt = (v, r, beyond) => {
    const at = v.receipts.findIndex((item) => item.id === r.id);
    if (at >= 0) {
      if (v.receipts[at].revision >= r.revision) return false;
      v.receipts[at] = r;
      return true;
    }
    if (!beyond || v.receiptsFrom !== null || v.receipts.length >= PAGE_MAX) return false;
    v.receipts.unshift(r);
    return true;
  };
  // The address the invoice is taking payment at now: its payable address, only from a tracked, fresh view read at the
  // same totals revision, of an unpaid invoice whose known expiry is still ahead. Otherwise null: a failed, refused or
  // behind read, a disconnect, an expiry or an untracked view leaves every address history, never "paying".
  const payingAddress = (v, now = Date.now()) => v && !v.retired && v.fresh && v.payableAddress && v.payableRevision === v.revision
    && v.state !== "paid" && isExpiry(v.expires) && v.expires * 1000 > now ? v.payableAddress : null;
  // A receipt-mode invoice's Lightning code, only as a fresh status read at the current totals revision gives it: the
  // provider says `available` with its code, the invoice is unpaid, unexpired and has never had a receipt, and the view is
  // tracked and caught up. Otherwise null. The code the issuance reply carried is never offered on its own: nothing from
  // issuance says it is still usable.
  const lightningCode = (v, now = Date.now()) => v && !v.retired && v.fresh && v.read && v.lightning === "available" && typeof v.bolt11 === "string" && v.bolt11
    && !v.observed && v.payableRevision === v.revision && v.state !== "paid" && isExpiry(v.expires) && v.expires * 1000 > now ? v.bolt11 : null;
  // The amount an amount-bearing QR may ask for at `address`: the fresh remainder, only at the paying address. Otherwise
  // 0, and the page shows the address alone.
  const payableSats = (v, address, now = Date.now()) => address && payingAddress(v, now) === address && Number.isSafeInteger(v.left) && v.left > 0 ? v.left : 0;
  // A private read that failed or fell behind: nothing about the invoice counts as current, its payable address included,
  // until a later read succeeds.
  const unread = (v, error) => {
    v.error = error;
    v.fresh = false;
    v.awaiting = true;
    v.payableRevision = -1;
    touch(v);
  };
  const statusOf = (r) => {
    const inv = r && r.invoice, t = totalsOf(inv);
    if (!t || inv.accounting !== "receipt-v1" || !isExpiry(inv.expires) ||!LIGHTNING.includes(inv.lightning) || inv.bolt11 !== null && typeof inv.bolt11 !== "string"
      || !Array.isArray(r.addresses) || r.addresses.length > PAGE_MAX || !Array.isArray(r.receipts) || r.receipts.length > PAGE_MAX
      || r.payableAddress !== null && !(typeof r.payableAddress === "string" && ADDRESS.test(r.payableAddress))
      || !cursorOk(r.next) || !cursorOk(r.nextAddress)) return null;
    const addresses = [], receipts = [];
    for (const a of r.addresses) {
      if (!a || typeof a.address !== "string" || !ADDRESS.test(a.address) || !isNumber(a.issuedAt)) return null;
      addresses.push({ address: a.address, issuedAt: a.issuedAt });
    }
    for (const raw of r.receipts) {
      const receipt = receiptOf(raw);
      if (!receipt || receipt.invoice !== t.id) return null;
      receipts.push(receipt);
    }
    return { totals: t, expires: inv.expires, lightning: inv.lightning, bolt11: inv.bolt11, addresses, receipts, payableAddress: r.payableAddress, next: r.next, nextAddress: r.nextAddress };
  };
  // One private status read of `v` at a time: `first` (totals and payable address, with the newest receipts and
  // addresses for whichever list shows its newest page), `receipts` (the next older receipts) or `addresses` (the next
  // older addresses), one cursor a call. Every reply carries the totals and payable address, so a read asked for while
  // one is out waits for it (a page asked for wins over a plain refresh), and a page reply applies its list only if that
  // list was not navigated since (`navReceipts`, `navAddresses`). A stale or refused cursor sends both lists back to their newest page and reads again,
  // once. A reply older than the totals held is dropped whole, address evidence and all, and read again, at most
  // STALE_READS times in a row. Replies from before an account change, or for a view since dropped, are ignored.
  const readStatus = (v, page = "first", restarted = false) => {
    if (v.loading) {
      v.again = v.again && page === "first" ? v.again : page;
      return v.pending;
    }
    if (!v.request && state.account === null) {
      unread(v, "signin");
      return Promise.resolve({ error: "signin" });
    }
    if (page === "receipts" && !v.next || page === "addresses" && !v.nextAddress) page = "first";
    const gen = generation, began = epoch, navReceipts = v.navReceipts, navAddresses = v.navAddresses, cursor = page === "receipts" ? v.next : page === "addresses" ? v.nextAddress : null;
    const body = v.request ? { request: v.request } : { invoice: v.id };
    if (page === "receipts") body.cursor = cursor;
    else if (page === "addresses") body.addressCursor = cursor;
    v.loading = true;
    v.pending = call("/donations/status", body).then((r) => {
      if (gen !== generation || views.get(v.id) !== v) return { error: "stale" };
      v.loading = false;
      // Begun before the latest catch-up: freshness counts from when a read began, so the whole reply is dropped. It
      // is read again when a screen shows it (the catch-up's own read for it waits as `again`), when a read was asked
      // for meanwhile, or when it was a page the visitor turned to; any other stays behind, as the catch-up left it,
      // until a screen shows it, so a read begun for a view nobody shows now never runs beside the catch-up's.
      if (began !== epoch) {
        const next = v.again;
        v.again = null;
        if (!next && page === "first" && !shown.has(v)) return { error: "awaiting" };
        return readStatus(v, next || "first");
      }
      if ((r.error === "resync" || r.error === "cursor") && !restarted) {
        v.receiptsFrom = v.addressesFrom = null;
        return readStatus(v, "first", true);
      }
      const s = r.error ? null : statusOf(r);
      if (!s || s.totals.id !== v.id) {
        unread(v, r.error || "invalid");
        // A busy API: a shown view tries again by itself on the bounded schedule (`retryBusy`); any other failure waits
        // for CHECK AGAIN or the next catch-up. A read someone asked for meanwhile still runs.
        if (r.error === "busy") retryBusy(v);
        const next = v.again;
        v.again = null;
        return next ? readStatus(v, next) : { error: v.error };
      }
      if (s.totals.revision < v.revision) {
        const next = v.again || page;
        v.again = null;
        if (++v.staleReads > STALE_READS) {
          v.staleReads = 0;
          unread(v, "behind");
          return { error: "behind" };
        }
        return readStatus(v, next, restarted);
      }
      v.staleReads = 0;
      v.retries = 0;
      cancelRetry(v);
      v.error = "";
      applyTotals(v, s.totals, true);
      v.expires = s.expires; v.lightning = s.lightning;
      // Once anything has been seen, the full-amount Lightning code is never offered again, whatever the reply holds.
      if (s.receipts.length) observe(v);
      v.bolt11 = v.observed ? null : s.bolt11;
      v.payableAddress = s.payableAddress; v.payableRevision = s.totals.revision;
      if (page === "receipts" ? navReceipts === v.navReceipts : page === "first" && (v.receiptsFrom === null || v.newestReceipts)) {
        v.receipts = s.receipts; v.receiptsFrom = page === "receipts" ? cursor : null; v.next = s.next;
        if (page === "first") v.newestReceipts = false;
      }
      if (page === "addresses" ? navAddresses === v.navAddresses : page === "first" && (v.addressesFrom === null || v.newestAddresses)) {
        v.addresses = s.addresses; v.addressesFrom = page === "addresses" ? cursor : null; v.nextAddress = s.nextAddress;
        if (page === "first") v.newestAddresses = false;
      }
      v.read = true;
      v.awaiting = false;
      v.fresh = freshNow();
      touch(v);
      // A list asked back to its newest page while an older page was on its way still gets its first-page read.
      if (!v.again && (v.newestReceipts || v.newestAddresses)) v.again = "first";
      if (v.again) {
        const next = v.again;
        v.again = null;
        return readStatus(v, next);
      }
      return {};
    });
    return v.pending;
  };
  // The account's history, one server page at a time, newest first: `newest`, or `older` from the page shown. A
  // history that moved under its cursor (409 `resync`, a refused cursor, or another revision) is read again from the
  // newest, and says so (`restarted`). Signed in only. No address or token is in it.
  const historyRowOf = (h) => {
    const t = totalsOf(h);
    return t && h.accounting === "receipt-v1" && isNumber(h.createdAt) && isExpiry(h.expires)
      ? { ...t, accounting: "receipt-v1", createdAt: h.createdAt, expires: h.expires, handle: sanitize(h.handle, HANDLE_MAX) } : null;
  };
  const historyOf = (r) => {
    if (!r || !isCount(r.revision) || !Array.isArray(r.invoices) || r.invoices.length > PAGE_MAX || !cursorOk(r.next)) return null;
    const invoices = [];
    for (const raw of r.invoices) {
      const row = historyRowOf(raw);
      if (!row) return null;
      invoices.push(row);
    }
    return { revision: r.revision, invoices, next: r.next };
  };
  const historyPage = async (page = "newest") => {
    const ticket = ++historyTicket, gen = generation;
    if (!state.accounting?.history || state.account === null) {
      if (state.history) { state.history = null; notify(); }
      return;
    }
    const held = state.history || { revision: null, invoices: [], from: null, next: null, error: "", restarted: false };
    const cursor = page === "older" && held.next ? held.next : null;
    state.history = { ...held, loading: true };
    notify();
    let r = await call("/donations/history", cursor ? { cursor } : {}), restarted = false;
    if (ticket !== historyTicket || gen !== generation) return;
    if (cursor && (r.error === "resync" || r.error === "cursor" || !r.error && r.revision !== held.revision)) {
      restarted = true;
      r = await call("/donations/history", {});
      if (ticket !== historyTicket || gen !== generation) return;
    }
    const h = r.error ? null : historyOf(r);
    // A page read before the stream moved one of its invoices on keeps the newer totals, never the older ones.
    if (h) for (let i = 0; i < h.invoices.length; i++) {
      const newer = latest.get(h.invoices[i].id);
      if (newer && newer.revision > h.invoices[i].revision) h.invoices[i] = { ...h.invoices[i], ...newer };
    }
    state.history = h ? { revision: h.revision, invoices: h.invoices, from: restarted ? null : cursor, next: h.next, loading: false, error: "", restarted }
      : { ...(state.history || held), loading: false, error: r.error || "invalid" };
    notify();
  };
  // Every invoice's newest totals heard on the stream (public, bounded), so a history page that was on its way meanwhile
  // can't put older ones back; and the row of one on the page shown moves (a new list, so readers see the change).
  const latest = new Map();
  const historyTotals = (t) => {
    const held = latest.get(t.id);
    if (!held || held.revision < t.revision) keep(latest, t.id, t, REVISIONS);
    const h = state.history, at = h ? h.invoices.findIndex((row) => row.id === t.id) : -1;
    if (at < 0 || h.invoices[at].revision >= t.revision) return;
    const invoices = h.invoices.slice();
    invoices[at] = { ...invoices[at], ...t };
    state.history = { ...h, invoices };
  };
  // A signed-in donor's own invoice, reopened from its history: tracked and read by its id, which the page's Worker
  // pairs with the session. Nothing about the invoice is assumed before the reply.
  const reopen = (id) => {
    if (typeof id !== "string" || !ID.test(id) || state.account === null) return null;
    const v = viewFor(id, null);
    readStatus(v);
    return v;
  };
  // Another account, or none: everything private goes, request tokens included, and replies on their way are ignored.
  const setAccount = (id) => {
    const next = Number.isSafeInteger(id) ? id : null;
    if (next === state.account) return;
    generation++;
    state.account = next;
    for (const v of views.values()) retire(v);
    views.clear(); shown.clear(); ownInvoices.clear(); ownRequestSats.clear(); waiting.clear(); remembered.clear();
    state.history = null;
    notify();
    historyPage();
  };
  // A connection caught up: no tracked invoice counts as fresh until it is read again (what was held may be from before
  // the socket went). The ones a screen shows are read now, their retries starting over; the rest when one is shown.
  // After a gap in the stream the history is read again too.
  const resync = (gap) => {
    epoch++;
    if (gap) state.resyncs++;
    for (const v of views.values()) {
      v.awaiting = true;
      v.fresh = false;
      v.version++;
      if (shown.has(v)) {
        v.retries = 0;
        cancelRetry(v);
        readStatus(v);
      }
    }
    if (gap) historyPage();
  };
  // The socket went: nothing tracked is current until the next connection has caught up. Every view moves on, read or
  // not, so a screen showing one not yet read hears the connection go too.
  const stale = () => {
    for (const v of views.values()) { v.fresh = false; v.version++; }
    notify();
  };
  const seqOk = (data) => isCount(data.seq) && typeof data.replay === "boolean";
  // Totals that moved on the stream: a tracked invoice's payable address no longer matches them, so one a screen shows
  // reads again; any other is marked behind and reads when a screen shows it.
  const moved = (v, t) => {
    if (!v || !applyTotals(v, t)) return;
    if (!shown.has(v)) v.awaiting = true;
    v.fresh = freshNow() && !v.awaiting;
    touch(v);
    if (shown.has(v)) readStatus(v);
  };
  const onReceipt = (data) => {
    const r = receiptOf(data.receipt), t = totalsOf(data.invoice);
    if (!r || !t || t.id !== r.invoice || !seqOk(data)) return;
    // Past every frame this page has processed, and a revision of the receipt it has not heard: only then can a frame
    // have an effect beyond replacing state, whatever the bounded rings have forgotten.
    const beyond = state.receiptCursor === null || data.seq > state.receiptCursor, newer = (revisions.get(r.id) || 0) < r.revision;
    if (beyond) state.receiptCursor = data.seq;
    state.receipts++;
    const v = views.get(r.invoice);
    if (v) observe(v);
    moved(v, t);
    historyTotals(t);
    if (newer) {
      keep(revisions, r.id, r.revision, REVISIONS);
      if (v && placeReceipt(v, r, beyond)) touch(v);
      // A held row moves only to a newer revision; a row is added only by a frame past the cursor.
      const held = state.recentReceipts && state.recentReceipts.find((row) => row.id === r.id);
      if (state.recentReceipts && (held ? held.revision < r.revision : beyond && listed(r))) {
        const rows = state.recentReceipts.filter((row) => row.id !== r.id);
        if (listed(r)) {
          // First, so the stable sort keeps the newest ahead of rows from the same moment.
          rows.unshift(receiptRow(r, held));
          rows.sort(byReceived);
          if (rows.length > RECENT_MAX) rows.length = RECENT_MAX;
        }
        state.recentReceipts = rows;
      }
    }
    // The one moment a receipt animates: its live first credit, once on this page. Its bananas are its own frozen
    // ones (zero when permanently unpriced), never a conversion.
    if (beyond && newer && !data.replay && r.state === "credited" && data.seq === r.firstCreditedSeq && !animated.has(r.id)) {
      animated.add(r.id);
      if (animated.size > ANIMATED) animated.delete(animated.values().next().value);
      const b = r.pricing.bananas;
      handlers.donation({ id: r.id, sats: r.sats, handle: r.handle, message: r.message, at: r.pricing.receivedAt },
        b ? { exact: b.exact, rounded: b.rounded } : { exact: 0, rounded: 0 }, { receipt: r, invoice: r.invoice });
    }
    notify();
  };

  const onMessage = (text) => {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return;
    }
    if (!data || typeof data !== "object") return;
    backoff = SOCKET_MIN;
    if (data.type === "status" && typeof data.open === "boolean") {
      state.open = data.open;
      if (!state.recent) state.recent = [];
      if (NETWORKS.includes(data.network)) state.network = data.network;
      const limits = limitsOf(data.limits);
      if (data.limits === null || limits) state.limits = limits;
      if (state.recent?.some((entry) => entry.message && entry.sats < messageMinSats())) {
        state.recent = state.recent.map((entry) => entry.message && entry.sats < messageMinSats() ? { ...entry, message: "" } : entry);
      }
      // Each status carries the whole capability, or none from an older API: a missing one means legacy.
      const hadHistory = !!state.accounting?.history;
      state.accounting = accountingOf(data.accounting);
      if (!!state.accounting?.history !== hadHistory) historyPage();
      if (handlers.status) handlers.status(data.open);
      notify();
    } else if (data.type === "donation") {
      const donation = donationOf(data.donation), b = data.bananas;
      if (!donation || played.includes(donation.id)) return;
      played[playedAt] = after = donation.id;
      playedAt = (playedAt + 1) % PLAYED;
      state.donations++;
      const counted = b && isNumber(b.exact) && isNumber(b.rounded) ? { exact: Math.max(0, b.exact), rounded: Math.max(0, b.rounded) } : { exact: 0, rounded: 0 };
      const recent = (state.recent || []).slice();
      insertRecent(recent, { ...donation, bananas: counted.exact, verified: data.verified === true,
        seq: Number.isSafeInteger(data.seq) && data.seq > 0 ? data.seq : 0 });
      state.recent = recent;
      // A paid invoice with no price counts no bananas; it must never use the simulator's conversion.
      handlers.donation(donation, counted);
      notify();
    } else if (data.type === "recent" && Array.isArray(data.entries)) {
      const recent = [];
      for (const raw of data.entries.slice(0, RECENT_MAX)) {
        const entry = recentOf(raw);
        if (entry) insertRecent(recent, entry);
      }
      // A snapshot wins over held rows, including a correction to the same id. Only a live row newer than
      // its newest sequence can have arrived while the server was preparing the snapshot.
      let newestSeq = 0;
      for (const entry of recent) if (entry.seq > newestSeq) newestSeq = entry.seq;
      if (recent.length && newestSeq) for (const entry of state.recent || []) {
        if (entry.seq > newestSeq && !recent.some((item) => item.id === entry.id)) insertRecent(recent, entry);
      }
      state.recent = recent;
      notify();
    } else if (data.type === "pile") {
      // A receipt-era pile moves only forward by its revision, across reconnects too: an equal one confirms the pile
      // held is current, a lower one is refused. A legacy pile (no revision) is taken only from an API that says it is
      // legacy, so it can't stand in for a receipt-era one.
      const pile = pileOf(data);
      if (!pile || (pile.revision === null ? state.accounting !== null : pile.revision < pileRevision)) return;
      state.pileLive = true;
      if (pile.revision !== null && pile.revision === pileRevision && state.pile && state.pile.revision === pileRevision) { notify(); return; }
      if (pile.revision !== null) pileRevision = pile.revision;
      state.pile = pile;
      if (handlers.pile) handlers.pile(pile);
      notify();
    } else if (data.type === "receipt") {
      onReceipt(data);
    } else if (data.type === "invoiceStatus") {
      // Totals that moved without a receipt (a fee, `left`, a review): strictly newer ones replace what is held, and an
      // invoice this page tracks reads its private status again for the payable address. Never animated or counted.
      const t = totalsOf(data.invoice);
      if (!t || !seqOk(data)) return;
      if (state.receiptCursor === null || data.seq > state.receiptCursor) state.receiptCursor = data.seq;
      moved(views.get(t.id), t);
      historyTotals(t);
      notify();
    } else if (data.type === "recentReceipts" && Array.isArray(data.entries)) {
      // A snapshot: never animated, now or when a duplicate of one of its receipts arrives later. A row the stream has
      // already moved past (a correction heard before the snapshot) keeps that newer revision, or stays out if it left.
      // Only a receipt the snapshot shows already credited once is marked animated: one listed before any credit (none
      // is today; bananapayserver lists only receipts with a first credit) can still animate its live first credit.
      const rows = [], held = state.recentReceipts || [];
      for (const raw of data.entries.slice(0, RECENT_MAX)) {
        const r = receiptOf(raw);
        if (!r) continue;
        if (r.firstCreditedSeq !== null) {
          animated.add(r.id);
          if (animated.size > ANIMATED) animated.delete(animated.values().next().value);
        }
        if ((revisions.get(r.id) || 0) > r.revision) {
          const newer = held.find((row) => row.id === r.id);
          if (newer) rows.push(newer);
          continue;
        }
        keep(revisions, r.id, r.revision, REVISIONS);
        if (listed(r)) rows.push(receiptRow(r, held.find((row) => row.id === r.id)));
      }
      rows.sort(byReceived);
      state.recentReceipts = rows;
      notify();
    } else if (data.type === "replay" && typeof data.complete === "boolean" && (data.through === null || isCount(data.through))
      && (data.after === null || isCount(data.after))) {
      // The end of the catch-up: the high-water mark is the cursor from now on. A gap replayed nothing, so every tracked
      // invoice and the history are read again.
      if (data.through !== null) state.receiptCursor = data.complete && state.receiptCursor !== null ? Math.max(state.receiptCursor, data.through) : data.through;
      state.caughtUp = true;
      resync(!data.complete);
      notify();
    } else if (data.type === "board" && Array.isArray(data.entries)) {
      // Independent rankings: the sat leaders may be outside the banana leaders. Older APIs
      // have no satsEntries; never estimate their historical sats from today's price.
      state.board = boardOf(data.entries);
      state.boardSats = Array.isArray(data.satsEntries) ? boardOf(data.satsEntries) : null;
      if (handlers.board) handlers.board(state.board);
      notify();
    } else if (data.type === "tally") {
      const tally = tallyOf(data);
      if (tally) { state.tally = tally; notify(); }
    } else if (data.type === "seen" && typeof data.id === "string" && data.id && !views.has(data.id) && Number.isInteger(data.sats) && data.sats > 0 && Number.isInteger(data.due) && data.due > 0 && Number.isInteger(data.left) && data.left >= 0) {
      // Legacy invoices only: a receipt-mode invoice's own ledger is authoritative.
      // An on-chain payment seen before its block: everything received on that invoice so far, its amount, and what
      // is left to send, the network fee for a second payment included (0 once it is all there).
      const p = data.pricing, b = p?.bananas;
      const pricing = data.left === 0 && p && isNumber(p.receivedAt) && p.receivedAt > 0
        ? { receivedAt: p.receivedAt, rate: rateOf(p.rate), bananas: b && isNumber(b.exact) && isNumber(b.rounded) && b.exact >= 0 && b.rounded >= 0 ? { exact: b.exact, rounded: b.rounded } : null } : null;
      if (handlers.seen) handlers.seen(data.id, data.sats, data.due, data.left, pricing);
    }
  };
  const retry = () => {
    if (!live || timer) return;
    timer = window.setTimeout(connect, backoff * (0.8 + Math.random() * 0.4));
    backoff = Math.min(SOCKET_MAX, backoff * 2);
  };
  const connect = () => {
    timer = 0;
    if (!live || socket) return;
    state.attempts++;
    let ws;
    const query = after ? `?after=${encodeURIComponent(after)}` : "", cursor = state.receiptCursor;
    try {
      ws = new WebSocket(`${location.origin.replace(/^http/, "ws")}/donations/socket${query}${cursor === null ? "" : `${query ? "&" : "?"}receipts=${cursor}`}`);
    } catch {
      retry();
      return;
    }
    socket = ws;
    // A new connection catches up before anything it holds counts as fresh, and is live for the pile once it has heard one
    // (whose revision must still be at least the last one held).
    state.caughtUp = false;
    state.pileLive = false;
    ws.onopen = () => {
      state.connected = true;
      notify();
    };
    ws.onmessage = (e) => onMessage(e.data);
    ws.onclose = () => {
      if (socket === ws) socket = null;
      state.connected = false;
      state.caughtUp = state.pileLive = false;
      stale();
      retry();
    };
    ws.onerror = () => {};
  };

  // ---- the simulator ----------------------------------------------------------------------------------------
  // Weights tuned so about half the draws cross the 1,000 sat crate threshold.
  const SIM_AMOUNTS = [300, 500, 800, 1200, 2500, 6000, 25000, 120000];
  const SIM_WEIGHTS = [3, 3, 2.5, 3, 2.5, 1.5, 0.6, 0.2];
  const pickAmount = () => {
    const total = SIM_WEIGHTS.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < SIM_AMOUNTS.length; i++) {
      r -= SIM_WEIGHTS[i];
      if (r <= 0) return SIM_AMOUNTS[i];
    }
    return SIM_AMOUNTS[0];
  };
  let simTimer = 0, identity = () => ({}), subscribed = false;
  const simulate = (delayMs) => {
    simTimer = window.setTimeout(() => {
      const who = identity(), sats = pickAmount();
      handlers.donation({
        id: `sim-${randomId()}`,
        sats,
        handle: sanitize(who.handle, HANDLE_MAX),
        message: carried(sats, who.message),
        at: Date.now()
      }, null);
      simulate(15e3 + Math.random() * 20e3);
    }, delayMs);
  };
  // Real mode opens the socket; otherwise the simulator plays, unless nosim has switched it off.
  const begin = () => {
    if (!real) {
      if (config.simulate) simulate(6e3);
      return;
    }
    if (typeof WebSocket === "undefined") return;
    live = true;
    connect();
  };
  // Each donation reaches `onDonation(donation, bananas, receipt)`, `bananas` the API's `{ exact, rounded }` in real mode
  // and null from the simulator, `receipt` set for a receipt-mode first credit (`{ receipt, invoice, pending }`, its
  // `donation.id` the receipt id) and undefined for a legacy donation. In real mode `onStatus(open)`, `onPile(pile)` (the
  // parsed pile: `bananas` may be null), `onBoard(entries)` and `onSeen(id, sats, due, left)` follow the socket too; a
  // seen payment may come twice.
  const subscribe = (onDonation, { identity: who = () => ({}), onStatus = null, onPile = null, onBoard = null, onSeen = null } = {}) => {
    Object.assign(handlers, { donation: onDonation, status: onStatus, pile: onPile, board: onBoard, seen: onSeen });
    identity = who;
    subscribed = true;
    begin();
    return () => {
      subscribed = live = false;
      window.clearTimeout(simTimer);
      window.clearTimeout(timer);
      simTimer = timer = 0;
      if (socket) {
        const ws = socket;
        socket = null;
        ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
        ws.close();
      }
      state.connected = false;
      state.caughtUp = state.pileLive = false;
      stale();
    };
  };
  // The page's own Worker reaches the API: real mode from now on. The answer can come after the simulator has started,
  // which then stops for the socket.
  const useOrigin = () => {
    if (real || location.protocol !== "https:" && location.protocol !== "http:") return;
    real = true;
    notify();
    if (!subscribed) return;
    window.clearTimeout(simTimer);
    simTimer = 0;
    begin();
  };
  // The test network real donations are paid on (signet on staging), or "" for mainnet, before the API has said, and
  // when simulated.
  const testNetwork = () => real && state.network && state.network !== "mainnet" ? state.network : "";
  // `view(id)` is a tracked receipt-mode invoice (null for others); `refresh(id)` reads its private status again, and
  // `more(id, page, list)` pages it: "receipts" or "addresses" to the next older page, "newest" back to that `list`'s
  // newest page ("receipts" or "addresses"; both when none is named), the other list left where it is.
  // `showing(view, on)` says a screen starts or stops showing a tracked invoice's view, each start matched by one stop
  // (only shown views are read again on a catch-up or a move),
  // `payingAddress(view)` is the address taking payment now, or null, `lightningCode(view)` the verified Lightning code
  // a QR may carry, or null, and `payableSats(view, address)` what an amount-bearing QR may ask for there (0: the
  // address alone), `reopen(id)`
  // tracks a signed-in donor's own invoice from its history, `historyPage("newest" | "older")` pages that history, and
  // `setAccount(id)` follows sign-in.
  const view = (id) => views.get(id) || null;
  // A screen starts or stops showing a tracked invoice's view (`view(id)`, `reopen`): each start is matched by one
  // stop. Shown, it is read now if it isn't current; once no screen shows it, any retry of its read is cancelled. A
  // view dropped or from before an account change is never shown, and letting go of one does nothing.
  const showing = (v, on) => {
    if (!v) return;
    const n = shown.get(v) || 0;
    if (!on) {
      if (n > 1) shown.set(v, n - 1);
      else if (n) { shown.delete(v); cancelRetry(v); }
      return;
    }
    if (v.retired || views.get(v.id) !== v) return;
    shown.set(v, n + 1);
    if ((!v.read || v.awaiting) && !v.loading) readStatus(v);
  };
  const refresh = (id) => views.has(id) ? readStatus(views.get(id)) : Promise.resolve({ error: "unknown" });
  const more = (id, page, list) => {
    const v = views.get(id);
    if (!v) return Promise.resolve({ error: "unknown" });
    if (page !== "newest") {
      if (page === "receipts") v.navReceipts++;
      else v.navAddresses++;
      return readStatus(v, page);
    }
    if (list !== "addresses") { v.navReceipts++; v.newestReceipts = true; }
    if (list !== "receipts") { v.navAddresses++; v.newestAddresses = true; }
    return readStatus(v);
  };
  BL.donations = { config, get real() { return real; }, get testNetwork() { return testNetwork(); }, get messageMinSats() { return messageMinSats(); }, get generation() { return generation; },
    state, useOrigin, createRequest, invoice, note, onchain, waitFor, waitingOn, waited, receivedOwnInvoice, ownReceipt, subscribe, subscribeState,
    view, refresh, more, reopen, historyPage, setAccount, showing, streamCurrent: freshNow, payingAddress, lightningCode, payableSats, sanitize, carried, HANDLE_MAX, MESSAGE_MAX, MESSAGE_MIN_SATS, RECENT_MAX };
})();
