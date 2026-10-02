// The donation kiosk's screen, as the concept's screen flow draws it: the simulated sequence a visitor runs at the
// kiosk in the factory's right wall. The attract screen; an amount typed on a keypad; its quote in bananas (and in
// dollars, when the price feed has one); a Lightning invoice for it, with this page's donation request as its QR, a
// five-minute expiry, copy and regenerate; the wait while it is paid; and the payment received, which sends the
// visitor to watch the cooker. Everything is set in the jumbotron's 5x7 letters on one canvas, `W` by `H`, which the
// scene lays over the kiosk's glass while the visitor is at it; `still` paints the glass's own pictures for when
// nobody is (the attract screen, and the thanks while the cooker works).
//
// Payments are simulated: SETTLE after the visitor pays, the flow asks the scene to emit the donation event the
// backend will one day push, `{ id, sats, handle, message, at }` under the invoice's request id, and the scene hands
// every event back through `receive(id)`, which takes the one this invoice is waiting for. So a real payment will end
// the wait the same way. The scene holds that tip's bananas until the visitor asks to watch, or HOLD runs out.
//
// `create(hooks)` returns the flow: `start`, `stop`, `key(e)`, `tap(u, v)` in the canvas's pixels, `receive(id)`,
// `update(dt)`, `paint()`, which repaints only after a change, and `animate(ctx, time)`, which draws what moves (the
// wait's spinner) in the canvas's pixels over the painted screen. `state`, `sats`, `bananas`, `invoice` and `left` are
// for the scene and checks.
(() => {
  "use strict";
  const BL = window.BL;
  const T = BL.jumbotron.text, GW = T.GLYPH_W, GH = T.GLYPH_H, TR = T.TRACKING;
  const W = 400, H = 284;
  // An amount's bounds, an invoice's life, a simulated payment's settling, and how long the paid screen holds the
  // visitor's bananas back from the cooker before it cooks them anyway.
  const MIN = 400, MAX = 1000000, EXPIRY = 300, SETTLE = 2.4, HOLD = 12;
  const INK = {
    bg: "#090c10", panel: "#121a22", line: "#2b3440", gold: "#ffd24a", amber: "#ffb81c", white: "#f3efe4", dim: "#8d96a3",
    green: "#7fe83a", paid: "#07160c", red: "#ff6a4a", dark: "#1b1206", off: "#262c34", coin: "#f7931a", coinDk: "#b8650c"
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
  // A banana as a fat crescent with a stalk, tips up, `r` the curve's radius.
  const banana = (g, x, y, r, color) => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y - r * 0.55, r, Math.PI * 0.16, Math.PI * 0.84);
    g.arc(x, y - r * 1.05, r * 1.15, Math.PI * 0.76, Math.PI * 0.24, true);
    g.closePath();
    g.fill();
    g.fillStyle = "#6b4a1a";
    g.fillRect(Math.round(x + r * 0.78), Math.round(y - r * 0.32), Math.max(2, Math.round(r * 0.16)), Math.max(2, Math.round(r * 0.22)));
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
  const face = (g, title, color = INK.gold, bg = INK.bg) => {
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
    bolt(g, W / 2 - tw / 2 - 18, 9, 22, INK.gold);
    bolt(g, W / 2 + tw / 2 + 6, 9, 22, INK.gold);
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
    const n = code.size, m = Math.floor((size - 8) / n), o = Math.floor((size - m * n) / 2);
    g.fillStyle = "#0b0d10";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (code.modules[r * n + c]) g.fillRect(x + o + c * m, y + o + r * m, m, m);
    if (dim) {
      g.fillStyle = "rgba(9,12,16,0.72)";
      g.fillRect(x, y, size, size);
    }
  };

  // The still pictures for the kiosk's glass when nobody is at it: the attract screen, and the thanks while the cooker
  // works on any tip. Each a fresh canvas, `scale` times the screen's pixels.
  const still = (kind, scale = 1) => {
    const canvas = document.createElement("canvas"), g = canvas.getContext("2d");
    canvas.width = W * scale;
    canvas.height = H * scale;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    if (kind === "thanks") paintThanks(g);
    else paintIdle(g, null);
    return canvas;
  };
  const paintIdle = (g, button) => {
    face(g, "");
    const tw = width("DONATE SATS", 4);
    write(g, "DONATE SATS", W / 2, 16, 4, INK.gold, "center");
    bolt(g, W / 2 - tw / 2 - 24, 12, 34, INK.gold);
    bolt(g, W / 2 + tw / 2 + 8, 12, 34, INK.gold);
    write(g, "TURN SATS INTO BANANAS", W / 2, 60, 2, INK.white, "center");
    coin(g, 128, 124, 34);
    arrow(g, 202, 124, 22, INK.white);
    banana(g, 284, 132, 40, INK.gold);
    write(g, "TAP THE SCREEN TO START", W / 2, 180, 2, INK.dim, "center");
    if (button) button(92, 214, 216, 46, "ENTER AMOUNT >", "primary", "start");
    else {
      g.fillStyle = INK.gold;
      g.fillRect(92, 214, 216, 46);
      write(g, "ENTER AMOUNT >", W / 2, 230, 2, INK.dark, "center");
    }
  };
  const paintThanks = (g) => {
    face(g, "", INK.gold, INK.paid);
    write(g, "TIP RECEIVED!", W / 2, 22, 3, INK.gold, "center");
    banana(g, W / 2, 112, 46, INK.gold);
    sparkles(g, [[120, 74, 8], [282, 70, 8], [104, 132, 6], [300, 136, 6], [150, 156, 5], [252, 158, 5]]);
    write(g, "BANANAS COOKING", W / 2, 182, 3, INK.white, "center");
    write(g, "WATCH THE COOKER", W / 2, 228, 2, INK.green, "center");
  };

  // ---- the flow -------------------------------------------------------------------------------------------------
  // `hooks`: request() for a new donation request ({ id, url }), bananasFor(sats), price() in dollars or 0, handle(),
  // copy(text), pay(id, sats) when a simulated payment settles, release() when HOLD runs out, watch() and close().
  const create = (hooks) => {
    const canvas = document.createElement("canvas"), g = canvas.getContext("2d");
    canvas.width = W;
    canvas.height = H;
    let dirty = true, shown = -1, buttons = [];
    const flow = { canvas, W, H, open: false, state: "idle", digits: "", sats: 0, bananas: 0, invoice: null, left: 0, settle: 0, hold: 0 };
    const set = (state) => {
      flow.state = state;
      dirty = true;
    };
    const button = (x, y, w, h, label, kind, act) => {
      const on = kind !== "off";
      g.fillStyle = kind === "primary" ? INK.gold : kind === "off" ? INK.off : INK.panel;
      g.fillRect(x, y, w, h);
      if (kind === "primary") {
        g.fillStyle = "#fff0a8";
        g.fillRect(x + 3, y + 3, w - 6, 2);
      } else {
        g.strokeStyle = on ? INK.amber : INK.line;
        g.lineWidth = 2;
        g.strokeRect(x + 1, y + 1, w - 2, h - 2);
      }
      write(g, label, x + w / 2, y + Math.round((h - GH * 2) / 2), 2, kind === "primary" ? INK.dark : on ? INK.white : INK.dim, "center");
      if (on) buttons.push({ x, y, w, h, act });
    };
    const closeButton = () => {
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
    const valid = () => flow.sats >= MIN && flow.sats <= MAX;
    const invoice = () => {
      const r = hooks.request(), id = r.id.replace(/[^0-9a-z]/gi, "");
      flow.invoice = { id: r.id, url: r.url, code: BL.qr.encode(r.url), bolt: `lnbc${flow.sats * 10}n1p${id}` };
      flow.left = EXPIRY;
      shown = -1;
      set("invoice");
    };
    const act = (a) => {
      if (a === "close") return hooks.close();
      const s = flow.state;
      if (s === "idle" && a === "start") return set("amount");
      if (s === "amount") {
        if (a.length === 1 && a >= "0" && a <= "9") {
          if (flow.digits.length < 7 && !(flow.digits === "" && a === "0")) flow.digits += a;
        } else if (a === "clear") flow.digits = "";
        else if (a === "rub") flow.digits = flow.digits.slice(0, -1);
        else if (a === "go" && valid()) return set("quote");
        else if (a === "back") return set("idle");
        else return;
        quote();
        return set("amount");
      }
      if (s === "quote") {
        if (a === "create") return invoice();
        if (a === "back") return set("amount");
      }
      if (s === "invoice") {
        if (a === "pay") {
          flow.settle = SETTLE;
          return set("waiting");
        }
        if (a === "regen") return invoice();
        if (a === "copy") return hooks.copy(flow.invoice.bolt);
        if (a === "back") return set("quote");
      }
      if (s === "waiting" && (a === "cancel" || a === "back")) return set("invoice");
      if (s === "paid" && (a === "watch" || a === "back")) return hooks.watch();
      if (s === "expired") {
        if (a === "regen") return invoice();
        if (a === "back") return set("quote");
      }
    };
    // Keys, as the screen's buttons: Enter or Space the main one, Escape back (or out, from the attract screen), the
    // digits, Backspace and Delete on the keypad, C to copy and R to regenerate an invoice.
    flow.key = (e) => {
      const k = e.key, s = flow.state;
      if (k === "Escape") return s === "idle" ? hooks.close() : act("back");
      if (k === "Enter" || k === " ") return act({ idle: "start", amount: "go", quote: "create", invoice: "pay", paid: "watch", expired: "regen" }[s] || "");
      if (s === "amount") {
        if (k.length === 1 && k >= "0" && k <= "9") return act(k);
        if (k === "Backspace") return act("rub");
        if (k === "Delete") return act("clear");
      }
      if (k === "Backspace") return act("back");
      if (s === "invoice" && (k === "c" || k === "C")) return act("copy");
      if ((s === "invoice" || s === "expired") && (k === "r" || k === "R")) return act("regen");
    };
    // A tap at (u, v) on the canvas: the button under it, or on the attract screen anywhere.
    flow.tap = (u, v) => {
      for (const b of buttons) if (u >= b.x && u <= b.x + b.w && v >= b.y && v <= b.y + b.h) return act(b.act);
      if (flow.state === "idle") act("start");
    };
    flow.start = () => {
      flow.open = true;
      flow.digits = "";
      flow.invoice = null;
      quote();
      set("idle");
    };
    flow.stop = () => {
      flow.open = false;
      flow.invoice = null;
      set("idle");
    };
    // A donation event: true when it is this invoice's payment, which the screen then thanks.
    flow.receive = (id) => {
      const s = flow.state;
      if (!flow.invoice || id !== flow.invoice.id || s !== "invoice" && s !== "waiting") return false;
      flow.hold = HOLD;
      set("paid");
      return true;
    };
    // The invoice's clock, the payment settling, and the paid screen's hold on the bananas.
    flow.update = (dt) => {
      const s = flow.state;
      if (s === "invoice" || s === "waiting") {
        flow.left -= dt;
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
    flow.animate = (g, time) => {
      if (flow.state !== "waiting") return;
      const a = time * 5;
      g.lineCap = "round";
      g.lineWidth = 8;
      g.strokeStyle = INK.line;
      g.beginPath();
      g.arc(92, 116, 30, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = INK.gold;
      g.beginPath();
      g.arc(92, 116, 30, a, a + Math.PI * 0.6);
      g.stroke();
      g.lineCap = "butt";
    };
    // Repaints after a change only.
    flow.paint = () => {
      if (!dirty) return;
      dirty = false;
      buttons = [];
      const s = flow.state, v = flow.invoice;
      if (s === "idle") paintIdle(g, button);
      else if (s === "amount") {
        face(g, "ENTER SATS TO DONATE");
        panel(g, 70, 40, 260, 40, INK.amber);
        if (flow.digits) write(g, sats(flow.sats), 84, 50, 3, INK.white);
        else write(g, "0", 84, 50, 3, INK.dim);
        write(g, "SATS", 318, 54, 2, INK.dim, "right");
        if (flow.digits && !valid()) write(g, flow.sats < MIN ? `MIN ${sats(MIN)} SATS` : `MAX ${sats(MAX)} SATS`, W / 2, 86, 1, INK.red, "center");
        const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "rub"];
        keys.forEach((k, i) => {
          const x = 72 + (i % 3) * 88, y = 96 + Math.floor(i / 3) * 34;
          button(x, y, 80, 28, k === "clear" ? "CLEAR" : k === "rub" ? "" : k, "", k);
          if (k === "rub") {
            g.fillStyle = INK.white;
            g.beginPath();
            g.moveTo(x + 26, y + 14);
            g.lineTo(x + 34, y + 7);
            g.lineTo(x + 54, y + 7);
            g.lineTo(x + 54, y + 21);
            g.lineTo(x + 34, y + 21);
            g.closePath();
            g.fill();
            write(g, "X", x + 45, y + 11, 1, INK.panel, "center");
          }
        });
        button(110, 236, 180, 40, "CONTINUE >", valid() ? "primary" : "off", "go");
        closeButton();
      } else if (s === "quote") {
        face(g, "CONFIRM DONATION");
        panel(g, 50, 40, 300, 68);
        write(g, "YOU DONATE", 62, 48, 1, INK.dim);
        write(g, `${sats(flow.sats)} SATS`, 62, 60, 3, INK.gold);
        const usd = hooks.price();
        if (usd > 0) write(g, `≈ $${(flow.sats / 1e8 * usd).toFixed(2)} USD`, 62, 92, 1, INK.white);
        write(g, "RATE", 62, 118, 1, INK.dim);
        write(g, "1 BANANA = 400 SATS", 338, 118, 1, INK.white, "right");
        panel(g, 50, 132, 300, 56);
        write(g, "YOU WILL MAKE", 62, 140, 1, INK.dim);
        banana(g, 78, 176, 13, INK.gold);
        write(g, `${flow.bananas} BANANA${flow.bananas > 1 ? "S" : ""}`, 100, 156, 3, INK.gold);
        if (hooks.bananasFor(flow.sats + 400) === flow.bananas) write(g, `MAX ${flow.bananas} PER TIP`, 338, 140, 1, INK.dim, "right");
        info(g, 66, 202, INK.dim);
        write(g, "QUOTE LOCKED WHEN INVOICE IS CREATED", 78, 199, 1, INK.dim);
        button(50, 226, 100, 40, "< BACK", "", "back");
        button(158, 226, 192, 40, "CREATE INVOICE", "primary", "create");
        closeButton();
      } else if (s === "invoice" || s === "waiting") {
        const waiting = s === "waiting";
        face(g, waiting ? "WAITING FOR PAYMENT..." : "PAY LIGHTNING INVOICE");
        qrBox(g, 16, 40, 152, v.code, waiting);
        write(g, "AMOUNT", 184, 44, 1, INK.dim);
        write(g, `${sats(flow.sats)} SATS`, 184, 56, 2, INK.white);
        write(g, "BANANAS", 184, 82, 1, INK.dim);
        banana(g, 196, 104, 9, INK.gold);
        write(g, String(flow.bananas), 214, 94, 2, INK.gold);
        write(g, "EXPIRES IN", 184, 120, 1, INK.dim);
        write(g, clock(flow.left), 184, 132, 4, flow.left <= 60 ? INK.red : INK.gold);
        write(g, "PAYMENTS ARE SIMULATED", 184, 172, 1, INK.dim);
        if (waiting) {
          write(g, "SCAN WITH YOUR WALLET TO COMPLETE PAYMENT.", 16, 200, 1, INK.white);
          panel(g, 16, 212, 368, 26, INK.amber);
          info(g, 30, 225, INK.gold);
          write(g, "YOUR DONATION WILL TRIGGER THE BANANA COOKER WHEN PAID.", 42, 222, 1, INK.white);
          button(140, 246, 120, 32, "X CANCEL", "", "cancel");
        } else {
          write(g, "SCAN WITH YOUR WALLET", 92, 198, 1, INK.white, "center");
          panel(g, 16, 210, 330, 24);
          write(g, `${v.bolt.slice(0, 16)}...${v.bolt.slice(-4)}`.toUpperCase(), 26, 219, 1, INK.white);
          button(352, 210, 32, 24, "", "", "copy");
          g.strokeStyle = INK.white;
          g.lineWidth = 1.5;
          g.strokeRect(362.5, 215.5, 9, 11);
          g.strokeRect(366.5, 218.5, 9, 11);
          button(16, 242, 156, 34, "REGENERATE", "", "regen");
          button(180, 242, 204, 34, "SIMULATE PAYMENT", "primary", "pay");
          closeButton();
        }
      } else if (s === "paid") {
        face(g, "PAYMENT RECEIVED!", INK.gold, INK.paid);
        banana(g, W / 2, 92, 40, INK.gold);
        sparkles(g, [[132, 62, 7], [270, 58, 7], [118, 106, 5], [284, 110, 5]]);
        write(g, `${sats(flow.sats)} SATS RECEIVED`, W / 2, 124, 2, INK.white, "center");
        write(g, `${flow.bananas} BANANA${flow.bananas > 1 ? "S" : ""}`, W / 2, 146, 3, INK.gold, "center");
        const who = hooks.handle();
        write(g, who ? `THANK YOU @${who}!` : "THANK YOU!", W / 2, 178, 1, INK.white, "center");
        panel(g, 40, 194, 320, 30, INK.green);
        write(g, "THE COOKER IS BEHIND YOU. WATCH IT COOK!", W / 2, 205, 1, INK.green, "center");
        button(100, 234, 200, 40, "WATCH IT COOK >", "primary", "watch");
      } else {
        face(g, "INVOICE EXPIRED", INK.red);
        write(g, "THIS INVOICE TIMED OUT.", W / 2, 96, 2, INK.white, "center");
        write(g, "MAKE A NEW ONE TO DONATE.", W / 2, 126, 1, INK.dim, "center");
        button(50, 226, 100, 40, "< BACK", "", "back");
        button(158, 226, 192, 40, "NEW INVOICE", "primary", "regen");
        closeButton();
      }
    };
    return flow;
  };

  BL.factoryKiosk = { W, H, MIN, MAX, EXPIRY, SETTLE, HOLD, create, still };
})();
