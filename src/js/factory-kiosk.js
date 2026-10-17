// The donation kiosk's screen, as the concepts draw it: the simulated sequence a visitor runs at the kiosk in the
// factory's right wall. The attract screen, with this visit's donation link as its QR and START; an amount typed on a
// keypad; its quote in bananas (and in dollars, when the price feed has one); a Lightning invoice for it, with a fresh
// donation request as its QR, a five-minute expiry, copy and Back to the quote; the wait while it is paid; and the payment
// received, which sends the visitor to watch the cooker. Everything is set in the jumbotron's 5x7 letters on one
// square canvas, `W` by `H`, which the scene lays over the kiosk's glass while the visitor is at it; `still` paints
// the glass's own pictures for when nobody is (the attract screen, and the thanks while the cooker works).
//
// Simulated, SETTLE after the visitor presses to pay, the flow asks the scene to emit the donation event the API
// pushes, `{ id, sats, handle, message, at }` under the invoice's id. In real mode (`hooks.real`, the page's API in
// use) the amount, once confirmed, asks the API for its invoice at once (`hooks.invoice`): the quote shows the API's
// bananas and rate, the invoice its bolt11 as a `lightning:` QR and its own expiry, and nothing settles but the
// socket. Both kiosks offer an editable display handle and message, initially the signed-in login or anon. Changing
// the details updates that invoice in place, keeping its payment code. Receipt-priced invoices
// follow the live rate until full payment is detected; legacy invoices retain their quoted rate. Either
// way the scene hands every donation back through `receive(id, bananas, handle)`, which takes the one this invoice is
// waiting for and thanks the donor it names. The scene holds that tip's bananas until the visitor asks to watch, or
// HOLD runs out.
//
// A real quote offers the invoice by Lightning or on-chain, whatever the amount: ON-CHAIN asks the API for an address on
// the same invoice (`hooks.onchain`), shown as a `bitcoin:` QR for its amount (more than the invoice when the store adds
// a network fee) and the invoice's expiry, while the Lightning invoice stays good behind the quote. Once the visitor
// says it is sent, the screen says the bananas cook when it confirms and lets them go; the donation arrives under the
// invoice's id like any other, whenever it confirms, and is thanked if the visitor is still there. When the API sees
// the payment before its block (`seen`), the wait says so, or a short payment goes back to the address for the rest.
// An invoice the API made without its Lightning half (no bolt11, when the node couldn't make one in time) offers
// on-chain alone.
//
// `create(hooks)` returns the flow: `start`, `stop`, `key(e)`, `tap(u, v)` in the canvas's pixels,
// `receive(id, bananas, handle, paidSats)`, `seen(id, sats, due, left)`, `update(dt)`, `paint()`, which repaints only after a
// change, and `animate(ctx, time)`,
// which draws what moves (the wait's spinner) in the canvas's pixels over the painted screen. `state`, `sats`,
// `bananas` (exact in real mode), `invoice` and `left` are for the scene and checks.
(() => {
  "use strict";
  const BL = window.BL;
  const T = BL.jumbotron.text, GW = T.GLYPH_W, GH = T.GLYPH_H, TR = T.TRACKING;
  const W = 400, H = 400;
  const BANANAS = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const RATE = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // An amount's bounds, an invoice's life, a simulated payment's settling, and how long the paid screen holds the
  // visitor's bananas back from the cooker before it cooks them anyway.
  const MIN = 400, MAX = 1000000, EXPIRY = 300, SETTLE = 2.4, HOLD = 12;
  const INK = {
    bg: "#090c10", panel: "#121a22", line: "#2b3440", gold: "#ffd24a", amber: "#ffb81c", white: "#f3efe4", dim: "#8d96a3",
    green: "#7fe83a", paid: "#07160c", red: "#ff6a4a", dark: "#1b1206", off: "#262c34", coin: "#f7931a", coinDk: "#b8650c"
  };
  // What the screen says when the API says no: [title, line, note] by its error.
  const PROBLEMS = {
    closed: ["DONATIONS ARE CLOSED", "THE NODE IS RESTING.", "TRY AGAIN A LITTLE LATER."],
    busy: ["TOO MANY TRIES", "TRY AGAIN IN A MINUTE.", "THE NODE TAKES A FEW A MINUTE."],
    network: ["NO CONNECTION", "CAN'T REACH THE NODE.", "CHECK YOUR CONNECTION AND TRY AGAIN."],
    details: ["DETAILS NOT AVAILABLE YET", "THE DONATION SERVER NEEDS AN UPDATE.", "TRY YOUR DEFAULT NAME AND A SHORT MESSAGE."],
    invalid: ["SOMETHING WENT WRONG", "THAT DIDN'T WORK.", "TRY AGAIN."]
  };
  // The few letters the jumbotron's alphabet lacks, and a comma with a tail, so 4,000 never reads as four.
  const EXTRA = {
    "!": [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
    ",": [0, 0, 0, 0, 0b01100, 0b00100, 0b01000],
    "=": [0, 0, 0b11111, 0, 0b11111, 0, 0],
    ">": [0b01000, 0b00100, 0b00010, 0b00001, 0b00010, 0b00100, 0b01000],
    "<": [0b00010, 0b00100, 0b01000, 0b10000, 0b01000, 0b00100, 0b00010],
    "≈": [0, 0b01000, 0b10101, 0b00010, 0b01000, 0b10101, 0b00010],
    "@": [0b01110, 0b10001, 0b10111, 0b10101, 0b10111, 0b10000, 0b01111]
  };
  const glyph = (ch) => EXTRA[ch] || T.glyphOf(ch);
  const width = (text, s) => text.length ? (text.length * (GW + TR) - TR) * s : 0;
  const write = (g, text, x, y, s, color, align = "left") => {
    g.fillStyle = color;
    let cx = align === "center" ? Math.round(x - width(text, s) / 2) : align === "right" ? x - width(text, s) : x;
    for (let i = 0; i < text.length; i++) {
      const rows = glyph(text[i]);
      for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) if (rows[r] & (1 << (GW - 1 - c))) g.fillRect(cx + c * s, y + r * s, s, s);
      cx += (GW + TR) * s;
    }
  };
  const sats = (n) => n.toLocaleString("en-US");
  // Sats as bitcoin, without trailing zeros, for a payment URI and its label.
  const btc = (n) => (n / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
  const clock = (t) => {
    const s = Math.max(0, Math.ceil(t));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  // ---- pictures -------------------------------------------------------------------------------------------------
  const bolt = (g, x, y, size, color) => {
    g.fillStyle = color;
    g.beginPath();
    for (const [px, py] of [[0.62, 0], [0.04, 0.58], [0.4, 0.58], [0.2, 1], [0.96, 0.36], [0.6, 0.36]]) g.lineTo(x + px * size * 0.6, y + py * size);
    g.closePath();
    g.fill();
  };
  const chain = (g, x, y, size, color) => {
    g.save();
    g.translate(x, y);
    g.scale(size / 24, size / 24);
    g.strokeStyle = color;
    g.lineWidth = 2.2;
    g.lineCap = g.lineJoin = "round";
    // Two open, rounded links weave through one another at the centre.
    g.beginPath();
    g.moveTo(10, 13);
    g.bezierCurveTo(12, 15, 15, 15, 17, 13);
    g.lineTo(20, 10);
    g.bezierCurveTo(22, 8, 22, 5, 20, 3);
    g.bezierCurveTo(18, 1, 15, 1, 13, 3);
    g.lineTo(11, 5);
    g.stroke();
    g.beginPath();
    g.moveTo(14, 11);
    g.bezierCurveTo(12, 9, 9, 9, 7, 11);
    g.lineTo(4, 14);
    g.bezierCurveTo(2, 16, 2, 19, 4, 21);
    g.bezierCurveTo(6, 23, 9, 23, 11, 21);
    g.lineTo(13, 19);
    g.stroke();
    g.restore();
  };
  const banana = (g, x, y, r) => BL.bananaIcon.paint(g, x - r, y - r * 1.4, r * 2);
  const writeFit = (g, text, x, y, s, color, maxWidth, align = "left") =>
    write(g, text, x, y, Math.max(1, Math.min(s, Math.floor(maxWidth / width(text, 1)))), color, align);
  // Centre the shared square icon on the actual fitted text row.
  const bananaRow = (g, text, x, y, size, scale, room) => {
    const fitted = Math.max(1, Math.min(scale, Math.floor(room / width(text, 1))));
    BL.bananaIcon.paint(g, x, y + (GH * fitted - size) / 2, size);
    write(g, text, x + size + 12, y, fitted, INK.gold);
  };
  // The ₿ coin: an orange disc in a darker rim with the B and its two bars.
  const coin = (g, x, y, r) => {
    g.fillStyle = INK.coinDk;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = INK.coin;
    g.beginPath();
    g.arc(x, y, r * 0.84, 0, Math.PI * 2);
    g.fill();
    const s = Math.max(2, Math.round(r / 7));
    write(g, "B", x, Math.round(y - GH * s / 2), s, INK.white, "center");
    for (const dx of [-s, s]) {
      g.fillRect(Math.round(x + dx - s / 2), Math.round(y - GH * s / 2 - 2 * s), s, 2 * s);
      g.fillRect(Math.round(x + dx - s / 2), Math.round(y + GH * s / 2), s, 2 * s);
    }
  };
  const arrow = (g, x, y, size, color) => {
    g.fillStyle = color;
    g.fillRect(x - size, y - size * 0.18, size * 1.1, size * 0.36);
    g.beginPath();
    g.moveTo(x + size * 0.1, y - size * 0.55);
    g.lineTo(x + size, y);
    g.lineTo(x + size * 0.1, y + size * 0.55);
    g.closePath();
    g.fill();
  };
  const info = (g, x, y, color) => {
    g.strokeStyle = color;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(x, y, 6, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = color;
    g.fillRect(x - 1, y - 4, 2, 2);
    g.fillRect(x - 1, y - 1, 2, 5);
  };
  const sparkles = (g, points) => {
    g.fillStyle = INK.green;
    for (const [x, y, s] of points) g.fillRect(x - s / 2, y - s / 2, s, s);
  };
  // The screen's own face: the dark glass, a hairline frame and the title between two bolts.
  const face = (g, title, color = INK.gold, bg = INK.bg, onchain = false) => {
    g.fillStyle = INK.bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = bg;
    g.fillRect(4, 4, W - 8, H - 8);
    g.strokeStyle = INK.line;
    g.lineWidth = 2;
    g.strokeRect(3, 3, W - 6, H - 6);
    if (!title) return;
    const tw = width(title, 2);
    write(g, title, W / 2, 14, 2, color, "center");
    if (onchain) {
      chain(g, W / 2 - tw / 2 - 32, 11, 20, INK.gold);
      chain(g, W / 2 + tw / 2 + 12, 11, 20, INK.gold);
    } else {
      bolt(g, W / 2 - tw / 2 - 18, 9, 22, INK.gold);
      bolt(g, W / 2 + tw / 2 + 6, 9, 22, INK.gold);
    }
  };
  const panel = (g, x, y, w, h, edge = INK.line) => {
    g.fillStyle = INK.panel;
    g.fillRect(x, y, w, h);
    g.strokeStyle = edge;
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  };
  const qrBox = (g, x, y, size, code, dim) => {
    g.fillStyle = "#fbf6e8";
    g.fillRect(x, y, size, size);
    // Fill the box with only the four-module quiet zone; round cell edges, not the pitch,
    // so integer scaling cannot turn the unused space into an oversized white border.
    const n = code.size, quiet = 4, m = size / (n + quiet * 2);
    g.fillStyle = "#0b0d10";
    for (let r = 0; r < n; r++) {
      const top = Math.round((r + quiet) * m), bottom = Math.round((r + quiet + 1) * m);
      for (let c = 0; c < n; c++) if (code.modules[r * n + c]) {
        const left = Math.round((c + quiet) * m), right = Math.round((c + quiet + 1) * m);
        g.fillRect(x + left, y + top, right - left, bottom - top);
      }
    }
    if (dim) {
      g.fillStyle = "rgba(9,12,16,0.72)";
      g.fillRect(x, y, size, size);
    }
  };

  // The still pictures for the kiosk's glass when nobody is at it: the attract screen with the donation link `url` as
  // its QR (and a line saying so when real donations are on the test network `net`), and the thanks while the cooker
  // works on any tip. Each a fresh canvas, `scale` times the screen's pixels.
  const still = (kind, url, scale = 1, net = "") => {
    const canvas = document.createElement("canvas"), g = canvas.getContext("2d");
    canvas.width = W * scale;
    canvas.height = H * scale;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    if (kind === "thanks") paintThanks(g);
    else paintIdle(g, BL.qr.encode(url), null, false, net);
    return canvas;
  };
  const paintIdle = (g, code, button, closed, net) => {
    face(g, "");
    const tw = width("DONATE SATS", 4);
    write(g, "DONATE SATS", W / 2, 18, 4, INK.gold, "center");
    bolt(g, W / 2 - tw / 2 - 30, 12, 40, INK.gold);
    bolt(g, W / 2 + tw / 2 + 8, 12, 40, INK.gold);
    qrBox(g, 102, 60, 196, code, false);
    write(g, "TURN SATS", W / 2, 268, 3, INK.white, "center");
    write(g, "INTO BANANAS", W / 2, 294, 3, INK.white, "center");
    if (net) write(g, `${net.toUpperCase()} TEST · NOT REAL BITCOIN`, W / 2, 318, 1, INK.amber, "center");
    if (button) button(96, 328, 208, 56, closed ? "CLOSED" : "START", closed ? "off" : "primary", "start", 4);
    else {
      g.fillStyle = INK.gold;
      g.fillRect(96, 328, 208, 56);
      g.fillStyle = "#fff0a8";
      g.fillRect(99, 331, 202, 2);
      write(g, "START", W / 2, 342, 4, INK.dark, "center");
    }
  };
  const paintThanks = (g) => {
    face(g, "", INK.gold, INK.paid);
    write(g, "TIP RECEIVED!", W / 2, 40, 4, INK.gold, "center");
    banana(g, W / 2, 190, 56);
    sparkles(g, [[110, 110, 9], [292, 104, 9], [92, 180, 7], [310, 186, 7], [140, 214, 6], [262, 216, 6]]);
    write(g, "BANANAS COOKING", W / 2, 252, 3, INK.white, "center");
    write(g, "WATCH THE COOKER", W / 2, 304, 2, INK.green, "center");
  };

  // ---- the flow -------------------------------------------------------------------------------------------------
  // `hooks`: link() for what the attract screen's QR holds, bananasFor(sats), price() in dollars or 0, copy(text, what),
  // release() when HOLD runs out, watch() and close(); simulated, request() for a new donation request ({ id, url })
  // and pay(id, sats) when a payment settles; in real mode, `real`, invoice(sats), which resolves to the API's
  // reply or `{ error }`, open(), the API's word on whether donations are open (null before it has said),
  // testNetwork(), the test network payments are on or "" for mainnet, details() for the editable handle/message,
  // startDetails() and editDetails() for the shared form, outerClose when the popup supplies its own X,
  // onchain(request), which resolves to the API's `{ address, sats }` or `{ error }`, and
  // waitFor(id) for an invoice left with its on-chain address shown and nothing received.
  const create = (hooks) => {
    const canvas = document.createElement("canvas"), g = canvas.getContext("2d"), idleCode = BL.qr.encode(hooks.link()), real = !!hooks.real;
    canvas.width = W;
    canvas.height = H;
    let dirty = true, shown = -1, buttons = [], ticket = 0, shownOpen = null, shownNet = "", saving = null, saveQueued = false, unwatchRate = null, rateAt = 0, rateStale = false;
    const flow = { canvas, W, H, open: false, state: "idle", digits: "", sats: 0, bananas: 0, invoice: null, reply: null, error: "", left: 0, settle: 0, hold: 0, who: "", chain: null, chainNote: null, got: 0, due: 0, rest: 0, savedDetails: null, detailsDirty: false, detailsSaving: false, detailsError: "", limits: null };
    const bananaAmount = () => real ? BANANAS.format(flow.bananas) : sats(flow.bananas);
    flow.rate = flow.frozenPricing = null;
    const estimate = () => {
      if (!real || flow.state === "paid") return;
      const floating = !flow.reply || flow.reply.pricing === "receipt" || flow.state === "amount" || flow.state === "quoting";
      const liveRate = floating && hooks.rate ? hooks.rate() : null, quotedRate = flow.reply?.rate;
      const rate = (flow.frozenPricing ? flow.frozenPricing.rate
        : liveRate && (!quotedRate || liveRate.at >= quotedRate.at) ? liveRate : quotedRate) || null;
      const bananas = flow.frozenPricing ? flow.frozenPricing.bananas?.exact || 0
        : floating && rate ? Math.round(flow.sats * rate.usdPerBtc / 1e5) / 1000 : flow.bananas;
      if (rate !== flow.rate || rateAt !== rate?.at || rateStale !== !!rate?.stale || bananas !== flow.bananas) dirty = true;
      flow.rate = rate || null; flow.bananas = bananas;
      rateAt = rate?.at; rateStale = !!rate?.stale;
    };
    const priceLabel = () => {
      const r = flow.rate;
      if (!r) return "PRICE UNAVAILABLE";
      const label = flow.frozenPricing ? "RECORDED BTC" : r.stale ? "STALE BTC" : r.live ? "LIVE BTCUSD" : "BTC";
      return `${label} $${RATE.format(r.usdPerBtc)}`;
    };
    const rateLine = (x, y, width = 340, align = "center") => {
      const r = flow.rate;
      const color = r?.stale ? INK.red : INK.dim;
      if (width < 200) {
        writeFit(g, priceLabel(), x, y, 1, color, width);
        if (r) writeFit(g, `1 BANANA ≈ ${RATE.format(1e8 / r.usdPerBtc)} SATS`, x, y + 10, 1, INK.dim, width);
        return;
      }
      writeFit(g, r ? `${priceLabel()} · 1 BANANA ≈ ${RATE.format(1e8 / r.usdPerBtc)} SATS` : priceLabel(), x, y, 1, color, width, align);
    };
    const set = (state) => {
      flow.state = state;
      dirty = true;
    };
    const sameDetails = (a, b) => a.handle === b.handle && a.message === b.message;
    const detailsState = () => {
      dirty = true;
      if (hooks.detailsState) hooks.detailsState(flow);
    };
    flow.detailsChanged = () => {
      flow.detailsDirty = !!flow.savedDetails && !sameDetails(hooks.details(), flow.savedDetails);
      flow.detailsError = "";
      detailsState();
    };
    flow.saveDetails = () => {
      if (!flow.open || !flow.invoice || !flow.savedDetails || flow.state === "paid") return Promise.resolve({});
      if (saving) { saveQueued = true; return saving; }
      const value = hooks.details(), previous = flow.savedDetails, invoice = flow.invoice;
      if (sameDetails(value, previous)) { flow.detailsChanged(); return Promise.resolve({}); }
      if (!real) { flow.savedDetails = value; flow.detailsChanged(); return Promise.resolve({}); }
      flow.detailsSaving = true; flow.detailsError = "";
      detailsState();
      const pending = hooks.note(flow.reply.request, value, value.handle !== previous.handle).then((reply) => {
        if (saving !== pending || !flow.open || flow.invoice !== invoice || flow.state === "paid") return reply;
        saving = null; flow.detailsSaving = false;
        if (reply.error) {
          flow.detailsError = reply.error === "invalid" ? "These details need a donation server update."
            : reply.error === "unknown" ? "This donation is already settled or no longer available."
            : reply.error === "busy" ? "Please wait a moment, then press Enter to retry."
            : "Couldn't save changes. Press Enter to retry.";
          flow.detailsDirty = true;
          saveQueued = false;
        } else {
          flow.savedDetails = value;
          flow.detailsDirty = !sameDetails(hooks.details(), value);
        }
        detailsState();
        if (saveQueued && flow.detailsDirty && !reply.error) {
          saveQueued = false;
          return flow.saveDetails();
        }
        saveQueued = false;
        return reply;
      });
      saving = pending;
      return pending;
    };
    const button = (x, y, w, h, label, kind, act, scale = 2) => {
      const on = kind !== "off";
      g.fillStyle = kind === "primary" ? INK.gold : kind === "off" ? INK.off : INK.panel;
      g.fillRect(x, y, w, h);
      if (kind === "primary") {
        g.fillStyle = "#fff0a8";
        g.fillRect(x + 3, y + 3, w - 6, 2);
      } else {
        g.strokeStyle = on && act !== "back" ? INK.amber : INK.line;
        g.lineWidth = 2;
        g.strokeRect(x + 1, y + 1, w - 2, h - 2);
      }
      write(g, label, x + w / 2, y + Math.round((h - GH * scale) / 2), scale, kind === "primary" ? INK.dark : on ? INK.white : INK.dim, "center");
      if (on) buttons.push({ x, y, w, h, act });
    };
    const closeButton = () => {
      if (hooks.outerClose) return;
      g.strokeStyle = INK.dim;
      g.lineWidth = 2;
      g.strokeRect(373, 9, 18, 18);
      write(g, "X", 382, 15, 1, INK.dim, "center");
      buttons.push({ x: 366, y: 4, w: 30, h: 30, act: "close" });
    };
    const quote = () => {
      flow.sats = Number(flow.digits) || 0;
      flow.bananas = hooks.bananasFor(Math.max(1, flow.sats));
    };
    // The API advertises a Lightning threshold and the valid Bitcoin amount range.
    const limits = () => real && hooks.limits ? hooks.limits() : null;
    const overLightning = () => real && limits() && flow.sats > limits().lightningMaxSats;
    const canLightning = () => !!flow.invoice?.bolt && !overLightning();
    const valid = () => real ? Number.isSafeInteger(flow.sats) && flow.sats >= (limits()?.minSats || 1)
      && flow.sats <= (limits()?.maxSats || Number.MAX_SAFE_INTEGER) : flow.sats >= MIN && flow.sats <= MAX;
    const closed = () => real && hooks.open() === false;
    const invoice = () => {
      const r = hooks.request(), id = r.id.replace(/[^0-9a-z]/gi, "");
      if (hooks.details) flow.savedDetails = hooks.details();
      flow.invoice = { id: r.id, url: r.url, code: BL.qr.encode(r.url), bolt: `lnbc${flow.sats * 10}n1p${id}` };
      flow.left = EXPIRY;
      shown = -1;
      set("invoice");
      if (hooks.details) flow.detailsChanged();
    };
    // Moving on from an invoice whose on-chain address was shown, with nothing received for it: the page waits on it, so
    // its donation can tell the visitor it was theirs whenever it confirms.
    const letGo = () => {
      if (flow.chain && flow.state !== "paid") hooks.waitFor(flow.invoice.id);
    };
    // Real mode: the API's invoice for this amount, then `next`. A reply that finds the visitor gone on is dropped.
    const ask = (next) => {
      const t = ++ticket, value = hooks.details ? hooks.details() : { handle: "", message: "" };
      saving = null; saveQueued = false;
      flow.detailsSaving = false;
      flow.error = "";
      set("quoting");
      hooks.invoice(flow.sats, value).then((r) => {
        if (t !== ticket || flow.state !== "quoting") return;
        if (r.error) {
          flow.error = r.error;
          return set(r.error === "amount" ? "amount" : "problem");
        }
        letGo();
        flow.reply = r;
        flow.frozenPricing = null;
        flow.savedDetails = value;
        flow.bananas = r.bananas ? r.bananas.exact : 0;
        // No bolt11 when the API couldn't make the Lightning half in time: the quote then offers on-chain alone.
        const bolt = r.invoice.bolt11;
        flow.invoice = { id: r.invoice.id, code: bolt ? BL.qr.encode(`lightning:${bolt.toUpperCase()}`) : null, bolt, expires: r.invoice.expires };
        flow.chain = flow.chainNote = null;
        flow.got = flow.due = flow.rest = 0;
        flow.left = r.invoice.expires - Date.now() / 1000;
        shown = -1;
        set(next === "invoice" && !bolt ? "quote" : next);
        estimate();
        if (hooks.details) {
          flow.detailsChanged();
          if (flow.detailsDirty) flow.saveDetails();
        }
      });
    };
    // Real mode: the address to pay this invoice on-chain, asked for once an invoice. A refusal goes back to the quote
    // with a note saying why, where Lightning still pays, and an invoice already expired shows so.
    const CHAIN_NOTES = { closed: "ON-CHAIN IS UNAVAILABLE NOW: PAY BY LIGHTNING", busy: "TOO MANY TRIES: WAIT A MINUTE OR PAY BY LIGHTNING" };
    const askChain = () => {
      const t = ++ticket;
      flow.chainNote = null;
      set("chaining");
      hooks.onchain(flow.reply.request).then((r) => {
        if (t !== ticket || flow.state !== "chaining") return;
        if (r.error === "expired") return set("expired");
        if (r.error) {
          // With no Lightning invoice to fall back on, the tip can't be paid now.
          if (!flow.invoice.bolt) {
            flow.error = r.error === "busy" ? "busy" : "closed";
            return set("problem");
          }
          flow.chainNote = CHAIN_NOTES[r.error] || "COULDN'T GET AN ADDRESS: PAY BY LIGHTNING";
          return set("quote");
        }
        flow.chain = { address: r.address, sats: r.sats, send: r.sats, code: BL.qr.encode(`bitcoin:${r.address}?amount=${btc(r.sats)}`) };
        shown = -1;
        set("chain");
      });
    };
    const act = (a) => {
      if (a === "close") return hooks.close();
      const s = flow.state;
      if (a === "details" && s !== "paid" && hooks.editDetails) return hooks.editDetails();
      if (s === "idle" && a === "start" && !closed()) return set("amount");
      if (s === "amount") {
        if (a.length === 1 && a >= "0" && a <= "9") {
          if (flow.digits.length < (real ? 16 : 7) && !(flow.digits === "" && a === "0")) flow.digits += a;
        } else if (a === "clear") flow.digits = "";
        else if (a === "rub") flow.digits = flow.digits.slice(0, -1);
        else if (a === "go" && valid()) return real ? ask("quote") : set("quote");
        else if (a === "back") return set("idle");
        else return;
        flow.error = "";
        quote();
        return set("amount");
      }
      if (s === "quoting" && a === "back") {
        ticket++;
        return set("amount");
      }
      if (s === "problem" && a === "back") return set("amount");
      if (s === "quote") {
        // Without a Lightning invoice the main button pays on-chain.
        if (a === "create" && real && !canLightning()) a = "chain";
        if (a === "create") return real ? set("invoice") : invoice();
        if (a === "chain" && real) return flow.chain ? set("chain") : askChain();
        if (a === "back") return set("amount");
      }
      if (s === "invoice") {
        if (a === "pay" && !real) {
          flow.settle = SETTLE;
          return set("waiting");
        }
        if (a === "copy") return hooks.copy(flow.invoice.bolt);
        if (a === "back") return set("quote");
      }
      if (s === "chaining" && a === "back") {
        ticket++;
        return set("quote");
      }
      if (s === "chain") {
        if (a === "copy") return hooks.copy(flow.chain.address, "Address");
        if (a === "sent") return set("confirming");
        if (a === "back") return set("quote");
      }
      if (s === "confirming") {
        if (a === "done") return hooks.close();
        // A whole payment is already in the mempool: never ask for the same amount again.
        if (a === "back" && !(flow.got > 0 && !flow.rest)) return set("chain");
      }
      if (s === "waiting" && (a === "cancel" || a === "back")) return set("invoice");
      if (s === "paid" && (a === "watch" || a === "back")) return hooks.watch();
      if (s === "expired") {
        if (a === "regen") return real ? ask("invoice") : invoice();
        if (a === "back") return set(real ? "amount" : "quote");
      }
    };
    // Keys, as the screen's buttons: Enter or Space the main one, Escape back (or out, from the attract screen), the
    // digits, Backspace and Delete on the keypad, A to edit the donation details and O to pay on-chain on a real
    // quote, C to copy the invoice or on-chain address, and R to replace an expired invoice.
    flow.key = (e) => {
      const k = e.key, s = flow.state;
      if (k === "Escape") return s === "idle" ? hooks.close() : act("back");
      if (k === "Enter" || k === " ") return act({ idle: "start", amount: "go", quote: "create", invoice: real ? "" : "pay", chain: "sent", confirming: "done", paid: "watch", expired: "regen", problem: "back" }[s] || "");
      if (s === "amount") {
        if (k.length === 1 && k >= "0" && k <= "9") return act(k);
        if (k === "Backspace") return act("rub");
        if (k === "Delete") return act("clear");
      }
      if (k === "Backspace") return act("back");
      if (s !== "paid" && (k === "a" || k === "A")) return act("details");
      if (s === "quote" && (k === "o" || k === "O")) return act("chain");
      if ((s === "invoice" || s === "chain") && (k === "c" || k === "C")) return act("copy");
      if (s === "expired" && (k === "r" || k === "R")) return act("regen");
    };
    // A tap at (u, v) on the canvas: the button under it, or on the attract screen anywhere.
    flow.tap = (u, v) => {
      for (const b of buttons) if (u >= b.x && u <= b.x + b.w && v >= b.y && v <= b.y + b.h) return act(b.act);
      if (flow.state === "idle") act("start");
    };
    flow.start = () => {
      if (unwatchRate) unwatchRate();
      unwatchRate = null;
      if (hooks.closeDetails) hooks.closeDetails();
      ticket++;
      flow.open = true;
      flow.digits = flow.error = flow.who = "";
      flow.invoice = flow.reply = flow.chain = flow.chainNote = flow.savedDetails = null;
      flow.rate = flow.frozenPricing = null;
      saving = null; saveQueued = flow.detailsDirty = flow.detailsSaving = false; flow.detailsError = "";
      flow.got = flow.due = flow.rest = 0;
      if (hooks.startDetails) hooks.startDetails();
      if (real && hooks.watchRate) unwatchRate = hooks.watchRate();
      quote();
      set("idle");
    };
    flow.stop = () => {
      if (unwatchRate) unwatchRate();
      unwatchRate = null;
      if (hooks.closeDetails) hooks.closeDetails();
      ticket++;
      letGo();
      flow.open = false;
      saving = null; saveQueued = flow.detailsSaving = false;
      flow.invoice = flow.reply = flow.chain = flow.chainNote = null;
      flow.got = flow.due = flow.rest = 0;
      set("idle");
    };
    // A donation event: true when it is this invoice's payment, which the screen then thanks, naming the donor the
    // donation names (none for an anonymous tip), with the API's count when it sent one. An on-chain payment can arrive
    // after the invoice has expired.
    const RECEIVING = ["quote", "invoice", "waiting", "chaining", "chain", "confirming", "expired"];
    flow.receive = (id, bananas = null, handle = "", paidSats = null) => {
      const s = flow.state;
      if (!flow.invoice || id !== flow.invoice.id || !RECEIVING.includes(s)) return false;
      set("paid");
      if (hooks.closeDetails) hooks.closeDetails();
      if (bananas) flow.bananas = real ? bananas.exact : bananas.rounded;
      if (real && Number.isInteger(paidSats) && paidSats > 0) flow.sats = paidSats;
      flow.who = handle;
      flow.hold = HOLD;
      return true;
    };
    // An on-chain payment for this invoice seen before its block (`sats` all received so far, `due` the invoice's amount,
    // `left` what BTCPay still wants, fee included), taken on the address or sent screen, and true then: all of it moves
    // on to the wait for a block, part of it back to the address, which then asks for the rest. The API may send one twice.
    flow.seen = (id, sats, due, left, pricing = null) => {
      const s = flow.state;
      if (!flow.invoice || id !== flow.invoice.id || !flow.chain || !RECEIVING.includes(s)) return false;
      if (pricing && left === 0 && !flow.frozenPricing) { flow.frozenPricing = pricing; estimate(); }
      flow.got = sats;
      flow.due = due;
      flow.rest = left;
      if (left) {
        const c = flow.chain;
        c.send = left;
        c.code = BL.qr.encode(`bitcoin:${c.address}?amount=${btc(left)}`);
        shown = -1;
      }
      set(left ? "chain" : "confirming");
      return true;
    };
    // The invoice's clock, the payment settling, and the paid screen's hold on the bananas.
    flow.update = (dt) => {
      const s = flow.state;
      estimate();
      if (flow.limits !== limits()) { flow.limits = limits(); dirty = true; }
      if (real && hooks.open() !== shownOpen) {
        shownOpen = hooks.open();
        if (s === "idle") dirty = true;
      }
      if (real && hooks.testNetwork() !== shownNet) {
        shownNet = hooks.testNetwork();
        dirty = true;
      }
      if (s === "invoice" || s === "waiting" || s === "chain" || real && s === "quote") {
        flow.left = real ? flow.invoice.expires - Date.now() / 1000 : flow.left - dt;
        if (flow.left <= 0) return set("expired");
        const tick = Math.ceil(flow.left);
        if (tick !== shown) {
          shown = tick;
          dirty = true;
        }
      }
      if (s === "waiting" && (flow.settle -= dt) <= 0) {
        flow.settle = Infinity;
        hooks.pay(flow.invoice.id, flow.sats);
      }
      if (s === "paid" && flow.hold > 0 && (flow.hold -= dt) <= 0) hooks.release();
    };
    // The wait's spinner over the dimmed QR, turning with `time`; allocation-free.
    // The spinners: over the dimmed QR while a simulated payment settles, in the middle while the API quotes, and
    // in the waiting pill under a real invoice; turning with `time`, allocation-free.
    const spin = (g, x, y, r, width, time) => {
      const a = time * 5;
      g.lineCap = "round";
      g.lineWidth = width;
      g.strokeStyle = INK.line;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = INK.gold;
      g.beginPath();
      g.arc(x, y, r, a, a + Math.PI * 0.6);
      g.stroke();
      g.lineCap = "butt";
    };
    flow.animate = (g, time) => {
      const s = flow.state;
      if (s === "waiting") spin(g, 120, 142, 34, 9, time);
      else if (s === "quoting" || s === "chaining") spin(g, W / 2, 226, 30, 8, time);
      else if (s === "confirming") spin(g, W / 2, 166, 30, 8, time);
      else if (s === "invoice" && real) spin(g, 200, 335, 9, 4, time);
    };
    // A quote's last row: who the tip is from, and the way to change that, as one wide button. A login too long for
    // the row at the big size drops to the small one, and then loses its FROM.
    const fromRow = (name, change, a) => {
      const y = 288, h = 30, room = 324 - width(change, 1) - 10;
      panel(g, 30, y, 340, h, INK.amber);
      buttons.push({ x: 30, y, w: 340, h, act: a });
      const s = width(name, 2) <= room ? 2 : 1;
      const text = width(name, s) <= room ? name : name.slice(0, Math.max(1, Math.floor(room / (GW + TR)) - 3)) + "...";
      write(g, text, 38, y + Math.round((h - GH * s) / 2), s, INK.gold);
      write(g, change, 362, y + Math.round((h - GH) / 2), 1, INK.amber, "right");
    };
    // Repaints after a change only.
    flow.paint = () => {
      if (!dirty) return;
      dirty = false;
      buttons = [];
      const s = flow.state, v = flow.invoice;
      if (s === "idle") {
        paintIdle(g, idleCode, button, closed(), shownNet);
        if (real) rateLine(W / 2, 389);
      }
      else if (s === "quoting") {
        face(g, "CONFIRM DONATION");
        write(g, `${sats(flow.sats)} SATS`, W / 2, 110, 4, INK.gold, "center");
        write(g, "GETTING YOUR QUOTE...", W / 2, 162, 2, INK.white, "center");
        if (real) rateLine(W / 2, 274);
        button(130, 320, 140, 48, "< BACK", "", "back");
      } else if (s === "problem") {
        const [title, line, note] = PROBLEMS[flow.error] || PROBLEMS.invalid;
        face(g, title, INK.red);
        write(g, line, W / 2, 140, 2, INK.white, "center");
        write(g, note, W / 2, 176, 1, INK.dim, "center");
        button(130, 320, 140, 52, "< BACK", "", "back");
        closeButton();
      }
      else if (s === "amount") {
        face(g, "ENTER SATS TO DONATE");
        panel(g, 40, 44, 320, 56, INK.amber);
        if (flow.digits) writeFit(g, sats(flow.sats), 54, 58, 4, INK.white, 236);
        else write(g, "0", 54, 58, 4, INK.dim);
        write(g, "SATS", 346, 66, 2, INK.dim, "right");
        // Keep the rate under the amount and reserve a separate status row above Continue.
        if (real) rateLine(W / 2, 106, 320);
        if (flow.error === "amount") write(g, "THAT AMOUNT ISN'T ACCEPTED. TRY ANOTHER.", W / 2, 332, 1, INK.red, "center");
        else if (flow.digits && !valid()) {
          const min = real ? limits()?.minSats || 1 : MIN, max = real ? limits()?.maxSats || Number.MAX_SAFE_INTEGER : MAX;
          writeFit(g, flow.sats < min ? `MIN ${sats(min)} SATS` : `MAX ${sats(max)} SATS`, W / 2, 332, 1, INK.red, 320, "center");
        }
        else if (overLightning()) write(g, "OVER LIGHTNING LIMIT · ON-CHAIN ONLY", W / 2, 332, 1, INK.amber, "center");
        const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "rub"];
        keys.forEach((k, i) => {
          const x = 44 + (i % 3) * 106, y = 120 + Math.floor(i / 3) * 54;
          button(x, y, 100, 46, k === "clear" ? "CLEAR" : k === "rub" ? "" : k, "", k, k.length === 1 ? 3 : 2);
          if (k === "rub") {
            g.fillStyle = INK.white;
            g.beginPath();
            g.moveTo(x + 30, y + 23);
            g.lineTo(x + 40, y + 13);
            g.lineTo(x + 70, y + 13);
            g.lineTo(x + 70, y + 33);
            g.lineTo(x + 40, y + 33);
            g.closePath();
            g.fill();
            write(g, "X", x + 56, y + 20, 1, INK.panel, "center");
          }
        });
        button(100, 348, 200, 40, "CONTINUE >", valid() ? "primary" : "off", "go");
        closeButton();
      } else if (s === "quote" && real) {
        const rate = flow.rate, floating = flow.reply.pricing === "receipt";
        face(g, "CONFIRM DONATION");
        panel(g, 30, 44, 340, 92);
        write(g, "YOU DONATE", 42, 54, 1, INK.dim);
        writeFit(g, `${sats(flow.sats)} SATS`, 42, 70, 4, INK.gold, 316);
        if (rate) write(g, `≈ $${(flow.sats / 1e8 * rate.usdPerBtc).toFixed(2)} USD`, 42, 110, 2, INK.white);
        write(g, "1 BANANA = $1", 42, 144, 1, INK.dim);
        rateLine(42, 156, 316, "left");
        panel(g, 30, 176, 340, 84);
        write(g, floating ? "ESTIMATED BANANAS" : "YOU WILL MAKE", 42, 186, 1, INK.dim);
        if (rate) {
          write(g, floating ? "PRICED WHEN RECEIVED" : "AT THE INVOICE RATE", 358, 186, 1, INK.dim, "right");
          bananaRow(g, `${bananaAmount()} BANANA${flow.bananas === 1 ? "" : "S"}`, 48, 212, 34, 4, 262);
        } else write(g, "COUNTED WHEN PAID", 42, 214, 2, INK.gold);
        if (flow.chainNote) write(g, flow.chainNote, W / 2, 276, 1, INK.red, "center");
        else if (flow.reply.lightning === "limit" || overLightning()) write(g, "OVER LIGHTNING LIMIT · PAY ON-CHAIN", W / 2, 276, 1, INK.amber, "center");
        else if (!v.bolt) write(g, "LIGHTNING IS UNAVAILABLE NOW: PAY ON-CHAIN", W / 2, 276, 1, INK.red, "center");
        else if (!rate) write(g, "NO PRICE YET: THE BANANAS ARE COUNTED LATER", W / 2, 276, 1, INK.red, "center");
        else if (rate.stale) {
          const at = new Date(rate.at);
          write(g, `OLD PRICE: THE LAST ONE, FROM ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`, W / 2, 276, 1, INK.red, "center");
        }
        if (hooks.details) fromRow(`FROM @${hooks.details().handle || "anon"}`, "EDIT DETAILS", "details");
        // How to pay: the Lightning invoice already made, or an address for it on-chain.
        button(30, 326, 84, 52, "< BACK", "", "back");
        button(122, 326, 120, 52, "LIGHTNING", canLightning() ? "primary" : "off", "create");
        button(250, 326, 120, 52, "ON-CHAIN", canLightning() ? "" : "primary", "chain");
        closeButton();
      } else if (s === "quote") {
        face(g, "CONFIRM DONATION");
        panel(g, 30, 44, 340, 92);
        write(g, "YOU DONATE", 42, 54, 1, INK.dim);
        write(g, `${sats(flow.sats)} SATS`, 42, 70, 4, INK.gold);
        const usd = hooks.price();
        if (usd > 0) write(g, `≈ $${(flow.sats / 1e8 * usd).toFixed(2)} USD`, 42, 110, 2, INK.white);
        write(g, "RATE", 42, 152, 1, INK.dim);
        write(g, "1 BANANA = 400 SATS", 358, 148, 2, INK.white, "right");
        panel(g, 30, 176, 340, 84);
        write(g, "YOU WILL MAKE", 42, 186, 1, INK.dim);
        if (hooks.bananasFor(flow.sats + 400) === flow.bananas) write(g, `MAX ${flow.bananas} PER TIP`, 358, 186, 1, INK.dim, "right");
        bananaRow(g, `${flow.bananas} BANANA${flow.bananas > 1 ? "S" : ""}`, 48, 212, 34, 4, 262);
        if (hooks.details) fromRow(`FROM @${hooks.details().handle || "anon"}`, "EDIT DETAILS", "details");
        button(30, 326, 120, 52, "< BACK", "", "back");
        button(160, 326, 210, 52, "CREATE INVOICE", "primary", "create");
        closeButton();
      } else if (s === "invoice" || s === "waiting") {
        const waiting = s === "waiting";
        face(g, waiting ? "WAITING FOR PAYMENT..." : "PAY LIGHTNING INVOICE");
        qrBox(g, 20, 42, 200, v.code, waiting);
        write(g, "AMOUNT", 232, 48, 1, INK.dim);
        write(g, sats(flow.sats), 232, 60, 2, INK.white);
        write(g, "SATS", 232, 78, 1, INK.dim);
        write(g, real ? "EST. BANANAS" : "BANANAS", 232, 98, 1, INK.dim);
        bananaRow(g, real && !flow.rate ? "LATER" : bananaAmount(), 234, 112, 16, 2, 118);
        write(g, "EXPIRES IN", 232, 144, 1, INK.dim);
        write(g, clock(flow.left), 232, 156, 4, flow.left <= 60 ? INK.red : INK.gold);
        if (real) {
          rateLine(232, 198, 148, "left");
          if (flow.rate) writeFit(g, `≈ $${(flow.sats / 1e8 * flow.rate.usdPerBtc).toFixed(2)} USD`, 232, 228, 1, INK.white, 148);
        }
        if (waiting) {
          write(g, "SCAN WITH YOUR WALLET TO COMPLETE PAYMENT.", 20, 252, 1, INK.white);
          panel(g, 20, 266, 360, 40, INK.amber);
          info(g, 36, 286, INK.gold);
          write(g, "YOUR DONATION WILL TRIGGER THE BANANA COOKER WHEN PAID.", 48, 283, 1, INK.white);
          button(130, 320, 140, 48, "X CANCEL", "", "cancel");
        } else {
          write(g, "SCAN WITH YOUR WALLET", 120, 250, 1, INK.white, "center");
          panel(g, 20, 266, 316, 32);
          write(g, `${v.bolt.slice(0, 18)}...${v.bolt.slice(-5)}`.toUpperCase(), 30, 279, 1, INK.white);
          button(344, 266, 36, 32, "", "", "copy");
          g.strokeStyle = INK.white;
          g.lineWidth = 1.5;
          g.strokeRect(355.5, 273.5, 9, 11);
          g.strokeRect(359.5, 276.5, 9, 11);
          button(20, 312, 150, 46, "< BACK", "", "back");
          if (real) {
            panel(g, 178, 312, 202, 46, INK.amber);
            write(g, "WAITING FOR PAYMENT", 296, 332, 1, INK.white, "center");
          } else button(178, 312, 202, 46, "SIMULATE PAYMENT", "primary", "pay");
          closeButton();
        }
        const net = shownNet.toUpperCase();
        write(g, !real ? "PAYMENTS ARE SIMULATED IN THIS BUILD" : net ? `TEST INVOICE ON ${net} · PAY WITH A ${net} WALLET` : "PAY WITH ANY LIGHTNING WALLET", W / 2, 378, 1, net ? INK.amber : INK.dim, "center");
      } else if (s === "chaining") {
        face(g, "PAY ON-CHAIN", INK.gold, INK.bg, true);
        write(g, `${sats(flow.sats)} SATS`, W / 2, 110, 4, INK.gold, "center");
        write(g, "GETTING AN ADDRESS...", W / 2, 162, 2, INK.white, "center");
        if (real) rateLine(W / 2, 274);
        button(130, 320, 140, 48, "< BACK", "", "back");
      } else if (s === "chain") {
        // The address for this invoice, its amount (with the store's network fee, when it adds one), or what is left once
        // part of it has come, and the invoice's clock: the payment has to be sent before it runs out, though it may
        // confirm later.
        const c = flow.chain;
        face(g, "SEND BITCOIN ON-CHAIN", INK.gold, INK.bg, true);
        qrBox(g, 20, 42, 200, c.code, false);
        write(g, "SEND EXACTLY", 232, 48, 1, INK.dim);
        writeFit(g, `${sats(c.send)} SATS`, 232, 60, 2, INK.white, 148);
        write(g, `${btc(c.send)} BTC`, 232, 92, 1, INK.white);
        if (c.send > (flow.rest ? flow.due - flow.got : flow.sats)) write(g, "WITH THE NETWORK FEE", 232, 104, 1, INK.dim);
        write(g, "SEND BEFORE", 232, 122, 1, INK.dim);
        write(g, clock(flow.left), 232, 134, 4, flow.left <= 60 ? INK.red : INK.gold);
        write(g, "EST. BANANAS", 232, 176, 1, INK.dim);
        bananaRow(g, flow.rate ? bananaAmount() : "LATER", 234, 190, 16, 2, 118);
        rateLine(232, 214, 148, "left");
        if (flow.rate) writeFit(g, `≈ $${(flow.sats / 1e8 * flow.rate.usdPerBtc).toFixed(2)} USD`, 232, 238, 1, INK.white, 148);
        // Part of it seen: what came, and what is left to send to the same address.
        if (flow.rest) write(g, `RECEIVED ${sats(flow.got)} OF ${sats(flow.due)} SATS: SEND ${sats(flow.rest)} MORE`, W / 2, 250, 1, INK.amber, "center");
        else write(g, "SCAN WITH YOUR BITCOIN WALLET", 120, 250, 1, INK.white, "center");
        panel(g, 20, 266, 316, 32);
        write(g, `${c.address.slice(0, 16)}...${c.address.slice(-8)}`.toUpperCase(), 30, 279, 1, INK.white);
        button(344, 266, 36, 32, "", "", "copy");
        g.strokeStyle = INK.white;
        g.lineWidth = 1.5;
        g.strokeRect(355.5, 273.5, 9, 11);
        g.strokeRect(359.5, 276.5, 9, 11);
        button(20, 312, 150, 46, "< BACK", "", "back");
        button(178, 312, 202, 46, "I'VE SENT IT", "primary", "sent");
        closeButton();
        const net = shownNet.toUpperCase();
        write(g, net ? `TEST ADDRESS ON ${net} · USE A ${net} WALLET` : "THE BANANAS COOK ONCE IT CONFIRMS", W / 2, 378, 1, net ? INK.amber : INK.dim, "center");
      } else if (s === "confirming") {
        // Sent: nothing to do but wait for a block, which needn't keep the visitor here.
        // Once the API has seen all of it, before its block, the screen says so.
        const seen = flow.got > 0 && !flow.rest, paid = seen ? flow.got : flow.chain.sats;
        face(g, seen ? "SEEN ON-CHAIN" : "SENT ON-CHAIN", INK.gold, INK.bg, true);
        write(g, seen ? "WAITING FOR" : "YOUR BANANAS COOK", W / 2, 64, 3, INK.white, "center");
        write(g, seen ? "A BLOCK" : "ONCE IT CONFIRMS", W / 2, 92, 3, INK.white, "center");
        writeFit(g, flow.rate ? `${sats(paid)} SATS · ${bananaAmount()} BANANA${flow.bananas === 1 ? "" : "S"}` : `${sats(paid)} SATS`, W / 2, 202, 2, INK.gold, 340, "center");
        write(g, flow.frozenPricing ? "PRICE RECORDED AT FULL RECEIPT" : "ESTIMATED · PRICED WHEN RECEIVED", W / 2, 222, 1, INK.dim, "center");
        rateLine(W / 2, 236);
        write(g, seen ? "YOUR PAYMENT IS IN THE MEMPOOL. YOU CAN LEAVE:" : "THAT TAKES A BLOCK OR MORE. YOU CAN LEAVE:", W / 2, 250, 1, INK.dim, "center");
        write(g, "THE COOKER STARTS WHEN IT CONFIRMS.", W / 2, 264, 1, INK.dim, "center");
        button(30, 326, 120, 52, "< ADDRESS", seen ? "off" : "", "back");
        button(160, 326, 210, 52, "DONE", "primary", "done");
        closeButton();
      } else if (s === "paid") {
        face(g, "PAYMENT RECEIVED!", INK.gold, INK.paid);
        banana(g, W / 2, 118, 44);
        sparkles(g, [[124, 70, 8], [276, 66, 8], [110, 118, 6], [290, 122, 6]]);
        write(g, `${sats(flow.sats)} SATS RECEIVED`, W / 2, 150, 2, INK.white, "center");
        writeFit(g, `${bananaAmount()} BANANA${flow.bananas === 1 ? "" : "S"}`, W / 2, 176, 4, INK.gold, 340, "center");
        write(g, flow.who ? `THANK YOU @${flow.who}!` : "THANK YOU!", W / 2, 220, 1, INK.white, "center");
        panel(g, 30, 246, 340, 44, INK.green);
        write(g, "THE COOKER IS BEHIND YOU. WATCH IT COOK!", W / 2, 265, 1, INK.green, "center");
        button(80, 312, 240, 56, "WATCH IT COOK >", "primary", "watch");
      } else {
        face(g, "INVOICE EXPIRED", INK.red);
        write(g, "THIS INVOICE TIMED OUT.", W / 2, 150, 2, INK.white, "center");
        write(g, "MAKE A NEW ONE TO DONATE.", W / 2, 186, 1, INK.dim, "center");
        if (flow.chain) write(g, "SENT ON-CHAIN? IT STILL COUNTS ONCE IT CONFIRMS.", W / 2, 222, 1, INK.gold, "center");
        button(30, 326, 120, 52, "< BACK", "", "back");
        button(160, 326, 210, 52, "NEW INVOICE", "primary", "regen");
        closeButton();
      }
    };
    return flow;
  };

  BL.factoryKiosk = { W, H, MIN, MAX, EXPIRY, SETTLE, HOLD, create, still };
})();
