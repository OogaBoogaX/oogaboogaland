// The stand's screen, before the Timechain Sphere's stairs: a list of items, each bought with one Lightning payment,
// drawn in the Factory kiosk's letters, glass and QR (factory-kiosk.js `kit`) inside the donation popup's dialog. Today
// the items are the fireworks; the stand may later sell more, so nothing here knows what an item does once it is paid.
// A purchase is not a donation: no amount is typed, no bananas are quoted, and there is no on-chain.
//
// The menu lists `hooks.items()`, `[{ id, name, price }]` (the price the API's, in sats; null while that item can't be
// bought). Choosing one asks for its invoice at once (`hooks.buy(id)`, which resolves to `{ invoice: { id, bolt11,
// expires } }` or `{ error }`), and the invoice offers, in order, the browser's own wallet in one click where it has one
// (`hooks.wallet()`, then `hooks.walletPay(bolt11)` inside the click, which resolves to true when the wallet paid; a
// refusal leaves the QR), OPEN WALLET (`hooks.openWallet(bolt11)`, its `lightning:` link) and the QR, with COPY.
// Nothing settles but the API's word, which the scene hands back through `receive(id)`; the screen then says so and asks
// to go and look (`hooks.watch()`). PREVIEW shows the highlighted item to this visitor alone, free (`hooks.preview(id)`).
// `hooks.mayBuy()` is "yes", "sign-in" while only signed-in visitors may buy and this one isn't (the prices give way to
// SIGN IN TO BUY, `hooks.signIn()`; Preview still works) or "closed". `hooks.note()` is a line under the menu (the
// visitor's own purchases, say), or "". Simulated (`hooks.real` false), the invoice is paid with a tap on PAY, through
// `hooks.simulate(id)`, which then arrives like the API's word. `hooks.pick`, an item's id, opens the screen at that
// item. Where the stand can show an item (`hooks.showcase(id, w, h)`, `{ canvas, paint(t) }` or null), its row in the
// menu plays it in a small tile, and choosing it, there or with `hooks.pick`, opens it on its showcase first: the item playing large, with BUY and its price (or what stands in the way), BACK and SEE IT IN
// THE SKY (the free preview); BUY goes on to its invoice, and Back from there comes back to the showcase. Without
// one, the item opens at its invoice when it can be bought now (or what stands in the way), else the menu with it
// highlighted.
//
// `create(hooks)` returns the popup's flow: `start`, `stop`, `key(e)`, `tap(u, v)` in the canvas's pixels, `receive(id)`
// (true when it was this invoice), `update(dt)`, `paint()` (repaints only after a change), `animate(ctx, time)`, and
// `state`, `item` and `invoice` for the scene and checks.
(() => {
  "use strict";
  const BL = window.BL;
  const K = BL.factoryKiosk.kit, { W, H, INK, write, writeFit, width, face, panel, qrBox, clock, sats } = K;
  const GH = BL.jumbotron.text.GLYPH_H;
  const ROW_Y = 52, ROW_H = 46, ROW_GAP = 8, ROWS = 4;
  // What the screen says when the API says no: [title, line, note] by its error.
  const PROBLEMS = {
    "sign-in": ["SIGN IN TO BUY", "ONLY SIGNED-IN PLAYERS", "CAN BUY HERE FOR NOW."],
    closed: ["THE STAND IS CLOSED", "THE NODE IS RESTING.", "TRY AGAIN A LITTLE LATER."],
    busy: ["TOO MANY TRIES", "TRY AGAIN IN A MINUTE.", "THE NODE TAKES A FEW A MINUTE."],
    network: ["NO CONNECTION", "CAN'T REACH THE NODE.", "CHECK YOUR CONNECTION AND TRY AGAIN."],
    invalid: ["SOMETHING WENT WRONG", "THAT DIDN'T WORK.", "TRY AGAIN."]
  };

  const create = (hooks) => {
    const canvas = document.createElement("canvas"), g = canvas.getContext("2d"), real = !!hooks.real;
    canvas.width = W;
    canvas.height = H;
    let dirty = true, shown = -1, buttons = [], ticket = 0, shownMay = "", shownNote = "", shownNet = "", walletNote = "";
    const flow = { canvas, W, H, open: false, state: "menu", pick: 0, item: null, invoice: null, error: "", left: 0, showcase: null, from: "menu" };
    // The showcase's picture and the menu's tiles: where they sit on the screen, and the item's own painters, made once
    // per item and size.
    const SHOW = { x: 30, y: 46, w: 340, h: 200 }, TILE = { x: 30, w: 60 }, showcases = new Map();
    let shownAt = -1, tilesAt = -1;
    const showcaseOf = (item, w = SHOW.w, h = SHOW.h) => {
      if (!hooks.showcase || !item) return null;
      const key = `${item.id}:${w}x${h}`;
      if (!showcases.has(key)) showcases.set(key, hooks.showcase(item.id, w, h));
      return showcases.get(key);
    };
    const show = (item) => {
      flow.item = item;
      flow.showcase = showcaseOf(item);
      flow.invoice = null;
      shownAt = -1;
      set("show");
    };
    const set = (state) => {
      flow.state = state;
      dirty = true;
    };
    const items = () => hooks.items() || [];
    const button = (x, y, w, h, label, kind, act, scale = 2) => {
      const on = kind !== "off";
      g.fillStyle = kind === "primary" ? INK.gold : kind === "off" ? INK.off : INK.panel;
      g.fillRect(x, y, w, h);
      if (kind === "primary") {
        g.fillStyle = "#fff0a8";
        g.fillRect(x + 3, y + 3, w - 6, 2);
      } else {
        g.strokeStyle = kind === "picked" ? INK.gold : on && act !== "back" ? INK.amber : INK.line;
        g.lineWidth = kind === "picked" ? 3 : 2;
        g.strokeRect(x + 1, y + 1, w - 2, h - 2);
      }
      writeFit(g, label, x + w / 2, y + Math.round((h - GH * scale) / 2), scale, kind === "primary" ? INK.dark : on ? INK.white : INK.dim, w - 16, "center");
      if (on) buttons.push({ x, y, w, h, act });
    };

    // Asking for the item's invoice; a reply to an earlier ask, or after the visitor went back, is dropped.
    const buy = async (item) => {
      const may = hooks.mayBuy();
      if (may !== "yes") {
        flow.error = may;
        return set("problem");
      }
      flow.from = flow.state === "show" ? "show" : "menu";
      flow.item = item;
      flow.invoice = null;
      walletNote = "";
      set("asking");
      const mine = ++ticket, r = await hooks.buy(item.id);
      if (mine !== ticket || flow.state !== "asking") return;
      if (r.error) {
        flow.error = PROBLEMS[r.error] ? r.error : "invalid";
        return set("problem");
      }
      const bolt = r.invoice.bolt11;
      flow.invoice = { id: r.invoice.id, bolt, code: BL.qr.encode(`lightning:${bolt.toUpperCase()}`), expires: r.invoice.expires };
      flow.left = r.invoice.expires - Date.now() / 1000;
      set("invoice");
    };
    // The browser's wallet, inside the click that asked: a payment it refuses or fails leaves the QR to scan.
    const walletPay = async () => {
      const v = flow.invoice, mine = ticket;
      walletNote = "ASKING YOUR WALLET...";
      dirty = true;
      const paid = await hooks.walletPay(v.bolt).catch(() => false);
      if (mine !== ticket || flow.invoice !== v) return;
      walletNote = paid ? "PAID · WAITING FOR THE NODE" : "YOUR WALLET DIDN'T PAY · SCAN THE QR";
      dirty = true;
    };
    const act = (a) => {
      const s = flow.state, list = items();
      if (s === "menu") {
        if (a.startsWith("item:")) {
          const i = Number(a.slice(5));
          flow.pick = i;
          return showcaseOf(list[i]) ? show(list[i]) : buy(list[i]);
        }
        if (a === "preview" && list[flow.pick]) return hooks.preview(list[flow.pick].id);
        if (a === "sign-in") return hooks.signIn();
        if (a === "close") return hooks.close();
      }
      if (s === "show") {
        if (a === "buy") return buy(flow.item);
        if (a === "preview") return hooks.preview(flow.item.id);
        if (a === "sign-in") return hooks.signIn();
      }
      if (s === "invoice") {
        if (a === "wallet") return walletPay();
        if (a === "open") return hooks.openWallet(flow.invoice.bolt);
        if (a === "copy") return hooks.copy(flow.invoice.bolt, "Invoice");
        if (a === "pay" && !real) return hooks.simulate(flow.item.id, flow.invoice.id);
      }
      if (s === "paid" && (a === "watch" || a === "back")) return hooks.watch();
      if (s === "problem" && a === "sign-in") return hooks.signIn();
      if (a === "back") {
        ticket++;
        flow.invoice = null;
        // Back from the invoice, or from making it, goes back to the showcase it was bought from.
        if (s !== "show" && s !== "menu" && flow.from === "show" && flow.showcase) return show(flow.item);
        return set("menu");
      }
    };
    // Keys, as the screen's buttons: Up and Down move through the menu, Enter or Space buys the highlighted item, 1 to 4
    // buy that one, P previews, Escape goes back (or out, from the menu); on the invoice W pays with the wallet, C copies.
    flow.key = (e) => {
      const k = e.key, s = flow.state, list = items();
      if (k === "Escape" || k === "Backspace") return s === "menu" ? hooks.close() : act("back");
      if (s === "show") {
        if ((k === "Enter" || k === " ") && flow.item.price !== null && hooks.mayBuy() === "yes") return act("buy");
        if (k === "p" || k === "P") return act("preview");
        return;
      }
      if (s === "menu") {
        if (k === "ArrowDown" || k === "ArrowUp") {
          flow.pick = (flow.pick + (k === "ArrowDown" ? 1 : list.length - 1)) % Math.max(1, list.length);
          dirty = true;
          return;
        }
        if ((k === "Enter" || k === " ") && list[flow.pick]) return act(`item:${flow.pick}`);
        if (k >= "1" && k <= String(Math.min(9, list.length))) return act(`item:${Number(k) - 1}`);
        if (k === "p" || k === "P") return act("preview");
      }
      if (s === "invoice") {
        if ((k === "w" || k === "W") && hooks.wallet()) return act("wallet");
        if (k === "c" || k === "C") return act("copy");
        if ((k === "Enter" || k === " ") && !real) return act("pay");
      }
      if (s === "paid" && (k === "Enter" || k === " ")) return act("watch");
      if (s === "problem" && (k === "Enter" || k === " ")) return act("back");
    };
    flow.tap = (u, v) => {
      for (const b of buttons) if (u >= b.x && u <= b.x + b.w && v >= b.y && v <= b.y + b.h) return act(b.act);
    };
    flow.start = () => {
      ticket++;
      flow.open = true;
      flow.item = flow.invoice = null;
      flow.error = walletNote = "";
      set("menu");
      const list = items(), at = hooks.pick ? list.findIndex((it) => it.id === hooks.pick) : -1;
      if (at < 0) return;
      flow.pick = at;
      if (showcaseOf(list[at])) show(list[at]);
      else if (list[at].price !== null) buy(list[at]);
    };
    flow.stop = () => {
      ticket++;
      flow.open = false;
      flow.item = flow.invoice = null;
      set("menu");
    };
    flow.receive = (id) => {
      if (!flow.invoice || id !== flow.invoice.id || flow.state !== "invoice" && flow.state !== "expired") return false;
      set("paid");
      return true;
    };
    flow.update = () => {
      const may = hooks.mayBuy(), note = hooks.note(), net = real ? hooks.testNetwork() : "";
      if (may !== shownMay || note !== shownNote || net !== shownNet) {
        shownMay = may; shownNote = note; shownNet = net;
        dirty = true;
      }
      if (flow.state === "invoice") {
        flow.left = flow.invoice.expires - Date.now() / 1000;
        if (flow.left <= 0) return set("expired");
        const tick = Math.ceil(flow.left);
        if (tick !== shown) { shown = tick; dirty = true; }
      }
    };
    const spin = (g2, x, y, r, w, time) => {
      const a = time * 5;
      g2.lineCap = "round";
      g2.lineWidth = w;
      g2.strokeStyle = INK.line;
      g2.beginPath();
      g2.arc(x, y, r, 0, Math.PI * 2);
      g2.stroke();
      g2.strokeStyle = INK.gold;
      g2.beginPath();
      g2.arc(x, y, r, a, a + Math.PI * 0.6);
      g2.stroke();
      g2.lineCap = "butt";
    };
    flow.animate = (g2, time) => {
      if (flow.state === "asking") spin(g2, W / 2, 226, 30, 8, time);
      // The menu's tiles play at about 15 frames a second, a little out of step.
      if (flow.state === "menu") {
        const list = items(), fresh = tilesAt < 0 || time - tilesAt >= 1 / 15;
        if (fresh) tilesAt = time;
        for (let i = 0; i < ROWS && i < list.length; i++) {
          const tile = showcaseOf(list[i], TILE.w, ROW_H);
          if (!tile) continue;
          if (fresh) tile.paint(time + i * 1.7);
          g2.drawImage(tile.canvas, TILE.x, ROW_Y + i * (ROW_H + ROW_GAP), TILE.w, ROW_H);
        }
      }
      // The showcase plays at about 30 frames a second, its picture laid in its frame.
      if (flow.state === "show" && flow.showcase) {
        if (shownAt < 0 || time - shownAt >= 1 / 30) { flow.showcase.paint(time); shownAt = time; }
        g2.drawImage(flow.showcase.canvas, SHOW.x, SHOW.y, SHOW.w, SHOW.h);
      }
    };

    const paintMenu = () => {
      face(g, hooks.title || "FIREWORKS");
      const list = items(), may = shownMay;
      for (let i = 0; i < ROWS && i < list.length; i++) {
        const it = list[i], y = ROW_Y + i * (ROW_H + ROW_GAP), price = it.price, tile = showcaseOf(it, TILE.w, ROW_H);
        const label = may === "sign-in" ? `${it.name} · SIGN IN` : may === "closed" || price === null ? `${it.name} · CLOSED` : `${it.name} · ${sats(price)} SATS`;
        const x = tile ? TILE.x + TILE.w + 6 : 30, kind = may === "closed" || price === null ? "off" : i === flow.pick ? "picked" : "secondary";
        // Beside a tile the row is narrower: its name at the left and its price at the right, each at full size.
        button(x, y, 370 - x, ROW_H, tile ? "" : label, kind, `item:${i}`);
        if (tile) {
          const ty = y + Math.round((ROW_H - GH * 2) / 2), on = kind !== "off";
          const right = may === "sign-in" ? "SIGN IN" : may === "closed" || price === null ? "CLOSED" : `${sats(price)} SATS`;
          writeFit(g, it.name, x + 8, ty, 2, on ? INK.white : INK.dim, 362 - width(right, 2) - 8 - (x + 8));
          write(g, right, 362, ty, 2, on ? (may === "sign-in" ? INK.amber : INK.gold) : INK.dim, "right");
        }
        // Its tile (`animate` plays it): a frame round it, and a tap on it chooses the row too, even while it can't be
        // bought, so its showcase can still be seen.
        if (tile) {
          g.strokeStyle = kind === "picked" ? INK.gold : INK.line;
          g.lineWidth = 2;
          g.strokeRect(TILE.x - 1, y - 1, TILE.w + 2, ROW_H + 2);
          buttons.push({ x: TILE.x, y, w: TILE.w, h: ROW_H, act: `item:${i}` });
        }
      }
      const y = ROW_Y + ROWS * (ROW_H + ROW_GAP) + 2;
      button(30, y, may === "sign-in" ? 160 : 340, 40, "PREVIEW", "secondary", "preview");
      if (may === "sign-in") button(210, y, 160, 40, "SIGN IN", "primary", "sign-in");
      const hint = may === "sign-in" ? "SIGN IN TO BUY · PREVIEW IS FREE AND ONLY YOU SEE IT" : "PREVIEW IS FREE AND ONLY YOU SEE IT";
      writeFit(g, shownNote || hint, W / 2, y + 50, 1, shownNote ? INK.gold : INK.dim, 340, "center");
      if (shownNet) write(g, `${shownNet.toUpperCase()} TEST · NOT REAL BITCOIN`, W / 2, y + 64, 1, INK.amber, "center");
    };
    const paintInvoice = () => {
      const v = flow.invoice, it = flow.item;
      face(g, it.name);
      write(g, `${sats(it.price)} SATS`, W / 2, 40, 3, INK.white, "center");
      qrBox(g, 112, 70, 176, v.code, false);
      const wallet = hooks.wallet();
      if (!real) button(30, 254, 340, 40, "PAY (SIMULATED)", "primary", "pay", 3);
      else if (wallet) button(30, 254, 340, 40, "PAY WITH YOUR WALLET", "primary", "wallet", 2);
      else button(30, 254, 340, 40, "OPEN WALLET", "primary", "open", 3);
      button(30, 302, wallet && real ? 106 : 160, 36, "BACK", "secondary", "back");
      if (wallet && real) button(147, 302, 106, 36, "OPEN", "secondary", "open");
      button(wallet && real ? 264 : 210, 302, wallet && real ? 106 : 160, 36, "COPY", "secondary", "copy");
      writeFit(g, walletNote || `SCAN OR TAP TO PAY · EXPIRES IN ${clock(flow.left)}`, W / 2, 350, 1, walletNote ? INK.gold : INK.dim, 340, "center");
      write(g, real ? "LAUNCHES FOR EVERYONE A FEW SECONDS AFTER IT'S PAID" : "A LOCAL SIMULATION · NO BITCOIN IS SENT", W / 2, 366, 1, INK.dim, "center");
      if (shownNet) write(g, `${shownNet.toUpperCase()} TEST · NOT REAL BITCOIN`, W / 2, 382, 1, INK.amber, "center");
    };
    // The item large, as it plays (`animate` lays it in the frame), its price under it, and how to go on.
    const paintShow = () => {
      const it = flow.item, may = shownMay, open = may === "yes" && it.price !== null;
      face(g, it.name);
      g.fillStyle = INK.panel;
      g.fillRect(SHOW.x - 4, SHOW.y - 4, SHOW.w + 8, SHOW.h + 8);
      g.strokeStyle = INK.gold;
      g.lineWidth = 2;
      g.strokeRect(SHOW.x - 3, SHOW.y - 3, SHOW.w + 6, SHOW.h + 6);
      writeFit(g, hooks.showLine || "WHAT EVERYONE ON THE ISLAND WILL SEE", W / 2, SHOW.y + SHOW.h + 12, 1, INK.dim, 340, "center");
      if (may === "sign-in") button(30, 280, 340, 46, "SIGN IN TO BUY", "primary", "sign-in", 3);
      else if (open) button(30, 280, 340, 46, `BUY · ${sats(it.price)} SATS`, "primary", "buy", 3);
      else button(30, 280, 340, 46, `${it.name} · CLOSED`, "off", "buy", 2);
      button(30, 336, 160, 40, "BACK", "secondary", "back");
      button(210, 336, 160, 40, "SEE IT IN THE SKY", "secondary", "preview");
      writeFit(g, "SEEING IT IN THE SKY IS FREE AND ONLY YOU SEE IT", W / 2, 384, 1, INK.dim, 340, "center");
    };
    const paintProblem = () => {
      const [title, line, note] = PROBLEMS[flow.error] || PROBLEMS.invalid;
      face(g, "");
      writeFit(g, title, W / 2, 110, 3, INK.red, 340, "center");
      write(g, line, W / 2, 170, 2, INK.white, "center");
      write(g, note, W / 2, 196, 1, INK.dim, "center");
      if (flow.error === "sign-in") button(30, 300, 160, 48, "SIGN IN", "primary", "sign-in");
      button(flow.error === "sign-in" ? 210 : 100, 300, flow.error === "sign-in" ? 160 : 200, 48, "BACK", "secondary", "back");
    };
    flow.paint = () => {
      if (!dirty) return;
      dirty = false;
      buttons = [];
      const s = flow.state;
      if (s === "menu") paintMenu();
      else if (s === "show") paintShow();
      else if (s === "asking") {
        face(g, flow.item.name);
        write(g, "MAKING YOUR INVOICE", W / 2, 150, 2, INK.white, "center");
        button(100, 300, 200, 44, "BACK", "secondary", "back");
      } else if (s === "invoice") paintInvoice();
      else if (s === "paid") {
        face(g, "", INK.gold, INK.paid);
        write(g, "PAID!", W / 2, 70, 5, INK.gold, "center");
        writeFit(g, flow.item.name, W / 2, 150, 3, INK.white, 340, "center");
        write(g, hooks.paidLine || "GOING UP FOR EVERYONE", W / 2, 200, 2, INK.green, "center");
        button(100, 300, 200, 52, hooks.watchLabel || "WATCH", "primary", "watch", 4);
      } else if (s === "expired") {
        face(g, flow.item.name);
        write(g, "THIS INVOICE EXPIRED", W / 2, 150, 2, INK.white, "center");
        write(g, "NOTHING WAS CHARGED", W / 2, 180, 1, INK.dim, "center");
        button(100, 300, 200, 48, "BACK", "primary", "back");
      } else if (s === "problem") paintProblem();
    };
    return flow;
  };
  // The stand's plaque: its title and the top ten buyers, `[{ login, quantity, sats }]`, each with how many they bought and
  // what they spent, or BE THE FIRST before anyone has; painted in the kiosk's letters on `canvas`, PLAQUE_W by PLAQUE_H.
  const PLAQUE_W = 384, PLAQUE_H = 288;
  // `text` at scale `s`, cut to `room` pixels with an ellipsis when it would run over, as the kiosk cuts a name.
  const clip = (text, s, room) => width(text, s) <= room ? text : text.slice(0, Math.max(1, Math.floor(room / (width("M", s) + s)) - 3)) + "...";
  const plaque = (canvas, entries, title = "TOP LAUNCHERS") => {
    if (canvas.width !== PLAQUE_W || canvas.height !== PLAQUE_H) { canvas.width = PLAQUE_W; canvas.height = PLAQUE_H; }
    const p = canvas.getContext("2d");
    p.fillStyle = INK.bg;
    p.fillRect(0, 0, PLAQUE_W, PLAQUE_H);
    p.strokeStyle = INK.line;
    p.lineWidth = 2;
    p.strokeRect(3, 3, PLAQUE_W - 6, PLAQUE_H - 6);
    writeFit(p, title, PLAQUE_W / 2, 14, 3, INK.gold, PLAQUE_W - 40, "center");
    if (!entries || !entries.length) {
      write(p, "BE THE FIRST", PLAQUE_W / 2, 130, 3, INK.white, "center");
      return;
    }
    // Three columns under their heads: who, how many they launched, and the sats they spent.
    write(p, "PLAYER", 52, 42, 1, INK.dim);
    write(p, "LAUNCHED", 272, 42, 1, INK.dim, "right");
    write(p, "SATS", PLAQUE_W - 16, 42, 1, INK.dim, "right");
    for (let i = 0; i < entries.length && i < 10; i++) {
      const e = entries[i], y = 56 + i * 22, color = i === 0 ? INK.gold : INK.white;
      write(p, String(i + 1).padStart(2, " "), 16, y, 2, INK.dim);
      write(p, clip(`@${e.login}`, 2, 180), 52, y, 2, color);
      write(p, String(e.quantity), 272, y, 2, INK.dim, "right");
      write(p, sats(e.sats), PLAQUE_W - 16, y, 2, color, "right");
    }
  };
  // The plaque's picture on a face `w` by `h` metres about the origin, facing +z, for a node in the world. A fresh one
  // each repaint: the renderer uploads a picture once per geometry, so the old one is released and this one put in.
  const plaqueFace = (canvas, w, h) => {
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const face = { verts: [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0.85 }], lines: [], castShadow: false };
    face.imageSurface = { asset: { width: canvas.width, height: canvas.height, load: () => image }, rect: [-w / 2, -h / 2, w, h] };
    return face;
  };
  BL.standKiosk = { create, ROWS, plaque, plaqueFace, PLAQUE_W, PLAQUE_H };
})();
