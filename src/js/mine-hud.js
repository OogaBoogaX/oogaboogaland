// Ooga Mine's panels: the gear palette with its drag and drop, the operation panel (the goal, the
// profit bar and three tabs), the jobs list, the card for whatever was tapped in the cave, the intro,
// the milestone call and the results.
//
// A run is an hour long, so every readout writes a text node only when its value moves, the palette
// rewrites a tile only when its price or state does, and the jobs list and card rebuild only when the
// sim's version counters say something changed. Nothing here rebuilds per frame.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const R = BL.mineRigs;
  const { createNode } = BL.scene;
  const $ = (id) => document.getElementById(id);
  const { formatLarge } = BL.game;

  const EVENT_WORDS = {
    cheap: "Cheap power tonight · half price on the grid",
    surplus: "Found a charged crystal · battery full",
    windfall: "Struck a pocket of bananas",
    gift: "Someone left a machine at the door",
    poolboost: "The pool is paying double",
    boom: "The coin is booming · a good time to sell",
    curtail: "The grid will pay you to switch off",
    feestorm: "Fee storm · every block pays more",
    surge: "POWER SURGE · every breaker tripped",
    spike: "Power price spike · four times the rate",
    outage: "GRID DOWN · running on the battery",
    shortage: "Gear shortage · prices up by half",
    rug: "The pool ran off with the money",
    coolingfail: "A cooling fan stopped",
    crash: "The coin crashed · hold if you can",
    burn: "A machine burned out",
    fire: "FIRE in the rack · grab a Fire Stopper",
    meltdown: "MELTDOWN COMING · pull the glowing box"
  };
  const REASON_WORDS = {
    goal: "You mined the lot. The cave is yours.",
    time: "The hour ran out. What you mined is what you keep.",
    broke: "Nothing left to sell and nothing left to crack.",
    wrecked: "Three meltdowns. The operation is finished.",
    seized: "The loan came due one time too many. They took the cave.",
    left: "You walked out on it."
  };
  const MILESTONE_WORDS = {
    asic10: "TEN MACHINES",
    asic25: "A REAL OPERATION",
    asic50: "FIFTY MACHINES HUMMING",
    asic100: "A HUNDRED MACHINES",
    hall: "THE RACK HALL IS OPEN",
    bigcave: "THE BIG CAVE",
    block: "YOU FOUND A BLOCK",
    empire: "OOGA EMPIRE",
    halving: "THE HALVING"
  };
  const TABS = [["miners", "Miners"], ["cave", "Cave"], ["power", "Power"], ["trophies", "Trophies"]];

  // The first ten minutes, as a list: each step is done when its test passes, and the panel shows the
  // first one that is not. The tests only read state. A third entry is the wording on a touch screen.
  const asics = (s) => {
    let n = 0;
    for (let m = R.FIRST_ASIC; m < R.MODELS.length; m++) n += s.owned[m];
    return n;
  };
  const GOALS = [
    ["Crack the banana rock (C)", (s) => s.crackUsed >= 10 || s.spent > 0, "Crack the banana rock (Crack rocks)"],
    ["Take a loan · miners borrow", (s) => s.loan > 0 || s.loansRepaid > 0 || s.spent >= 8000],
    ["Put up a Rack (Cave tab)", (s) => s.holders[0] + s.holders[1] > 0],
    ["Put a Thunder Box in the rack", (s) => asics(s) > 0],
    ["Cool the Den with a Box Fan", (s) => s.cooler.some((t) => t > 0)],
    ["Sell your coin (Shift+S)", (s) => s.sold > 0, "Sell your coin (Sell)"],
    ["Get sixteen machines running", (s) => asics(s) >= 16],
    ["Dig into the Rack Hall", (s) => s.dug >= 1],
    ["Buy a newer ASIC model", (s) => s.owned[3] + s.owned[4] + s.owned[5] + s.owned[6] > 0],
    ["Ready for the halving at 30:00", (s) => s.halved],
    ["Stay green after the halving", (s) => s.halved && s.time > R.HALVING_AT + 180 && s.incomeRate > s.costRate],
    ["Mine 21 coin", (s) => s.minedSats >= R.GOAL_SATS]
  ];

  // Every thing the palette sells, keyed so a drag can say what it carries: m<model>, h<holder>,
  // p<power>, t<trophy>, f<fan> (see R.COOLERS), u0 a breaker's busbar, x<safety gear> (see R.SAFETY), and the two that have no spot, the crystals and the dig.
  const ITEMS = [
    ...R.MODELS.map((m, i) => ({ key: `m${i}`, tab: "miners", name: m.name, real: m.real })),
    ...R.HOLDERS.map((h, i) => ({ key: `h${i}`, tab: "cave", name: h.name, real: h.real })),
    { key: "dig", tab: "cave", name: "Dig deeper", real: "more room" },
    ...R.COOLERS.map((f, i) => ({ key: `f${i}`, tab: "cave", name: f.name, real: f.real })),
    { key: "u0", tab: "cave", name: "Busbar", real: "breaker upgrade" },
    ...R.SAFETY.map((g, i) => ({ key: `x${i}`, tab: "cave", name: g.name, real: g.real })),
    ...R.POWER.map((p, i) => ({ key: `p${i}`, tab: "power", name: p.name, real: p.real })),
    { key: "pack", tab: "power", name: "Charge Crystals", real: "battery top-up" },
    ...R.TROPHIES.map((t, i) => ({ key: `t${i}`, tab: "trophies", name: t.name, real: "trophy" }))
  ];
  const DRAG_START = 6, LONG_PRESS = 380;
  const CHAMBER_KEYS = ["chamber0", "chamber1", "chamber2"];
  const coin = (sats) => (sats / 1e8).toFixed(2);
  // Under a whole coin the headline shows four places, so the first payouts are seen to land.
  const coinFine = (sats) => (sats / 1e8).toFixed(sats < 1e8 ? 4 : 2);
  const payback = (minutes) => !Number.isFinite(minutes) ? "never pays" : minutes < 1 ? "back in under a min" : `back in ${Math.ceil(minutes)} min`;
  const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  const hash = (th) => th >= 1e6 ? `${(th / 1e6).toFixed(2)} EH` : th >= 1e3 ? `${(th / 1e3).toFixed(2)} PH` : `${th < 10 ? th.toFixed(2) : Math.round(th)} TH`;

  const create = ({ best, coarse = false, geometryFor, onTile, onDrag, onDrop, onCard, onJob }) => {
    const el = {
      root: $("mine"), shop: $("mine-shop"), tabs: $("mine-tabs"), tiles: $("mine-tiles"), tip: $("mine-tip"), best: $("mine-best"),
      ops: $("mine-ops"), mined: $("mine-mined"), clock: $("mine-clock"), goal: $("mine-goal-fill"), liveScore: $("mine-live-score"), ticker: $("mine-ticker"),
      heatStrip: [...document.querySelectorAll("#mine-heat-strip span")], mini: $("mine-mini"), miniMined: $("mine-mini-mined"), miniProfit: $("mine-mini-profit"), miniClock: $("mine-mini-clock"), miniJobs: $("mine-mini-jobs"),
      stepCount: $("mine-step-count"), stepText: $("mine-step-text"), hashprice: $("mine-hashprice"),
      earn: $("mine-earn"), burn: $("mine-burn"), profit: $("mine-profit"), offer: $("mine-offer"), offerText: $("mine-offer-text"),
      bananas: $("mine-bananas"), debt: $("mine-debt"), sats: $("mine-sats"), sell: $("mine-sell"), price: $("mine-price"), trend: $("mine-trend"),
      hash: $("mine-hash"), share: $("mine-share"), diff: $("mine-diff"), retarget: $("mine-retarget"), reward: $("mine-reward"), halving: $("mine-halving"),
      mode: $("mine-mode"), next: $("mine-next"),
      grid: $("mine-grid"), gridNote: $("mine-grid-note"), contract: $("mine-contract"), contractNote: $("mine-contract-note"),
      kw: $("mine-kw"), own: $("mine-own"), battery: $("mine-battery"), batteryText: $("mine-battery-text"), pack: $("mine-pack"),
      crack: $("mine-crack"), crackNote: $("mine-crack-note"), loan: $("mine-loan"), loanLabel: $("mine-loan-label"), loanNote: $("mine-loan-note"), on: $("mine-on"),
      alert: $("mine-bankrupt"), alertText: $("mine-alert-text"), alertLeft: $("mine-bankrupt-left"),
      faults: $("mine-faults"), clear: $("mine-clear"), event: $("mine-event"), eventText: $("mine-event-text"), center: $("mine-center"),
      card: $("mine-card"), cardTitle: $("mine-card-title"), cardNote: $("mine-card-note"), cardFacts: $("mine-card-facts"), cardActions: $("mine-card-actions"),
      intro: $("mine-intro"), who: $("mine-intro-who"), results: $("mine-results"), score: $("mine-score"), summary: $("mine-summary"), keep: $("mine-keep"),
      final: $("mine-final"), finalScore: $("mine-final-score"), finalMedal: $("mine-final-medal"), finalBest: $("mine-final-best"),
      pause: $("mine-pause-btn"), mute: $("mine-mute")
    };
    const opsViews = [...el.ops.querySelectorAll("[data-ops]")], opsTabs = [...el.ops.querySelectorAll("[data-ops-tab]")];
    const chambers = [...el.ops.querySelectorAll("[data-chamber]")].map((row) => ({
      row, load: row.querySelector('[data-fill="load"]'), heat: row.querySelector('[data-fill="heat"]'), note: row.querySelector("[data-note]")
    }));
    const listeners = [];
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      listeners.push(() => target.removeEventListener(type, fn, opts));
    };
    // On a touch screen the intro's key hints read as buttons.
    if (coarse) for (const n of el.intro.querySelectorAll("[data-coarse]")) n.textContent = n.dataset.coarse;
    for (const node of [el.mined, el.clock, el.liveScore, el.stepCount, el.stepText, el.hashprice, el.earn, el.burn, el.profit, el.offerText, el.bananas, el.debt, el.sats, el.price, el.trend, el.miniMined, el.miniProfit, el.miniClock, el.miniJobs,
      el.hash, el.share, el.diff, el.retarget, el.reward, el.halving, el.next, el.grid, el.gridNote, el.contractNote, el.kw, el.own,
      el.crackNote, el.loanNote, el.alertText, el.alertLeft, el.eventText, el.center, el.batteryText, ...chambers.map((c) => c.note)]) {
      if (!node.firstChild) node.append("");
    }
    // Last-written values, so a node is only touched when what it shows moves.
    const shown = new Map();
    // Every banana figure goes out at the run's rate (see the sim's `rate`).
    let rate = 1;
    const money = (n) => formatLarge(Math.round(n * rate));
    const signed = (n) => `${n < 0 ? "-" : "+"}${money(Math.abs(n))}`;
    const setText = (node, value) => {
      if (shown.get(node) === value) return;
      shown.set(node, value);
      node.firstChild.data = value;
    };
    const setWidth = (node, pct, state) => {
      const key = pct * 10 + (state === "bad" ? 1 : state === "warn" ? 2 : 3);
      if (shown.get(node) === key) return;
      shown.set(node, key);
      node.style.width = `${pct}%`;
      node.dataset.state = state;
    };
    const setFlag = (node, attr, value) => {
      const key = `${attr}:${value}`;
      if (shown.get(node) === key) return;
      shown.set(node, key);
      if (attr === "hidden") node.hidden = value;
      else if (attr === "disabled") node.disabled = value;
      else node.setAttribute(attr, String(value));
    };
    const setState = (node, state) => setFlag(node, "data-state", state);

    // Each item's icon is drawn once per visit from its real geometry; tiles and the drag ghost show
    // copies, so the cache never holds a tile. Emptied in dispose.
    const ICONS = new Map();
    const iconFor = (key) => {
      let icon = ICONS.get(key);
      if (!icon) ICONS.set(key, icon = BL.hud.renderIcon({ buildNode: () => createNode({ geometry: geometryFor(key) }) }));
      return icon;
    };
    const iconCopy = (key, className = "") => {
      const src = iconFor(key), c = document.createElement("canvas");
      c.width = src.width;
      c.height = src.height;
      c.className = className;
      c.getContext("2d").drawImage(src, 0, 0);
      return c;
    };
    const span = (text, className) => {
      const s = document.createElement("span");
      s.className = className;
      s.textContent = text;
      return s;
    };

    // ---- the palette ----

    const tiles = new Map(), groups = new Map(), tabs = new Map();
    let activeTab = "miners";
    const showTab = (tab) => {
      activeTab = tab;
      for (const [k, g] of groups) g.hidden = k !== tab;
      for (const [k, t] of tabs) t.setAttribute("aria-pressed", String(k === tab));
    };
    const buildPalette = () => {
      el.tabs.replaceChildren(...TABS.map(([id, label]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "orbit-tab";
        b.textContent = label;
        on(b, "click", () => {
          b.blur();
          showTab(id);
        });
        tabs.set(id, b);
        return b;
      }));
      el.tiles.replaceChildren(...TABS.map(([id]) => {
        const grid = document.createElement("div");
        grid.className = "orbit-tiles";
        for (const item of ITEMS) {
          if (item.tab !== id) continue;
          const b = document.createElement("button");
          b.type = "button";
          b.className = "orbit-tile mine-tile";
          b.dataset.key = item.key;
          const price = span("", "orbit-price"), stat = span("", "orbit-tile-stat"), profit = span("", "mine-tile-profit");
          for (const n of [price, stat, profit]) n.append("");
          b.append(iconCopy(item.key), span(item.name, "orbit-tile-name"), span(item.real, "mine-tile-real"), stat, profit, price);
          tiles.set(item.key, { b, price: price.firstChild, stat: stat.firstChild, profit, profitText: profit.firstChild, last: "" });
          grid.append(b);
        }
        groups.set(id, grid);
        return grid;
      }));
      showTab(activeTab);
    };

    // A tile's line: its price, its state, and for a machine what one earns a minute after its power
    // and how long until it has paid for itself. `info(key)` is the scene's answer, so the palette
    // knows nothing about the sim.
    let bestKey = "";
    const refreshPalette = (info) => {
      // The machine that pays itself back soonest and has a spot to stand in is the one the palette points at.
      let best = "", bestBack = Infinity;
      for (const [key, tile] of tiles) {
        const t = info(key);
        if (key[0] === "m" && !t.locked && Number.isFinite(t.profit)) {
          const back = R.paybackMinutes(t.cost, t.profit);
          if (back < bestBack) {
            bestBack = back;
            best = key;
          }
        }
        const profit = Number.isFinite(t.profit) ? Math.round(t.profit) : NaN;
        const sig = `${t.cost}|${rate}|${t.can}|${t.owned}|${t.locked}|${t.stat}|${profit}`;
        if (sig === tile.last) continue;
        tile.last = sig;
        tile.price.data = t.cost > 0 ? money(t.cost) : "";
        tile.stat.data = t.stat;
        tile.profitText.data = Number.isFinite(profit) ? `${signed(profit)} a min\n${payback(R.paybackMinutes(t.cost, t.profit))}` : "";
        tile.profit.dataset.state = profit >= 0 ? "good" : "bad";
        tile.b.dataset.afford = t.can ? "yes" : "no";
        tile.b.dataset.owned = String(t.owned);
        tile.b.dataset.locked = String(t.locked);
        tile.b.title = t.note;
      }
      if (best !== bestKey) {
        if (bestKey && tiles.get(bestKey)) tiles.get(bestKey).b.dataset.best = "no";
        bestKey = best;
        if (best) tiles.get(best).b.dataset.best = "yes";
      }
    };

    // ---- drag and drop ----
    // Pointer events only: a mouse drag starts after DRAG_START px, a touch after a still LONG_PRESS.
    // The scene answers where a drop would land (`onDrag`) and does the placing (`onDrop`).
    const ghost = document.createElement("div");
    ghost.className = "orbit-ghost";
    const drag = { armed: false, active: false, key: "", x0: 0, y0: 0, timer: 0, pointer: -1, touch: false };
    let swallowClick = false, clickTimer = 0;
    const place = (node, x, y) => {
      node.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    };
    const begin = () => {
      drag.active = true;
      const item = ITEMS.find((i) => i.key === drag.key);
      ghost.replaceChildren(iconCopy(drag.key, "orbit-mini"), span(item.name, ""));
      el.root.append(ghost);
      document.body.classList.add("mine-dragging");
    };
    // A drop over either panel is no drop: the spot the marker points at is behind the panel.
    const inside = (node, x, y) => {
      const r = node.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    const overPanel = (x, y) => (!el.shop.hidden && inside(el.shop, x, y)) || (!el.ops.hidden && inside(el.ops, x, y));
    const finish = (drop, x, y) => {
      window.clearTimeout(drag.timer);
      if (drag.active) {
        ghost.remove();
        document.body.classList.remove("mine-dragging");
        swallowClick = true;
        window.clearTimeout(clickTimer);
        clickTimer = window.setTimeout(() => {
          swallowClick = false;
        }, 0);
        onDrop(drop && !overPanel(x, y) ? drag.key : "", x, y);
      }
      drag.armed = drag.active = false;
      drag.pointer = -1;
    };
    on(el.tiles, "pointerdown", (e) => {
      const tile = e.target.closest(".mine-tile");
      if (!tile || e.button > 0 || drag.armed) return;
      const key = tile.dataset.key;
      // The crystals, the dig and the trophies have no spot; they are taps only.
      if (key === "pack" || key === "dig" || key[0] === "t") return;
      drag.armed = true;
      drag.active = false;
      drag.key = key;
      drag.x0 = e.clientX;
      drag.y0 = e.clientY;
      drag.pointer = e.pointerId;
      drag.touch = e.pointerType === "touch";
      // The pointer is captured by the tile so a release anywhere, even off the window, ends the drag.
      try {
        tile.setPointerCapture(e.pointerId);
      } catch {
      }
      window.clearTimeout(drag.timer);
      if (drag.touch) drag.timer = window.setTimeout(() => {
        if (!drag.armed) return;
        begin();
        place(ghost, drag.x0 + 12, drag.y0 - 40);
        onDrag(drag.key, drag.x0, drag.y0);
      }, LONG_PRESS);
    });
    // A capture lost without a release (a tab switch, a browser gesture) is a cancelled drag.
    on(el.tiles, "lostpointercapture", (e) => {
      if (e.pointerId === drag.pointer) finish(false, 0, 0);
    });
    on(window, "pointermove", (e) => {
      if (!drag.armed || e.pointerId !== drag.pointer) return;
      if (!drag.active) {
        if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_START) return;
        // A touch that moves before the long press is a scroll, not a drag.
        if (drag.touch) {
          finish(false, 0, 0);
          return;
        }
        begin();
      }
      place(ghost, e.clientX + 12, e.clientY - 40);
      ghost.dataset.remove = String(overPanel(e.clientX, e.clientY) || !onDrag(drag.key, e.clientX, e.clientY));
    });
    on(window, "pointerup", (e) => {
      if (e.pointerId === drag.pointer) finish(true, e.clientX, e.clientY);
    });
    on(window, "pointercancel", (e) => {
      if (e.pointerId === drag.pointer) finish(false, 0, 0);
    });
    on(window, "touchmove", (e) => {
      if (drag.active) e.preventDefault();
    }, { passive: false });
    on(el.root, "click", (e) => {
      if (swallowClick) {
        swallowClick = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const tile = e.target.closest(".mine-tile");
      if (tile) {
        tile.blur();
        onTile(tile.dataset.key);
        return;
      }
      // Static [data-action] buttons go through the page HUD's own dispatch; only the card's
      // buttons and the jobs rows, built here, are answered here.
      const card = e.target.closest("[data-card]");
      if (card) {
        card.blur();
        onCard(card.dataset.card);
        return;
      }
      const job = e.target.closest("[data-job]");
      if (job && onJob) {
        const [kind, id] = job.dataset.job.split(":");
        onJob(kind, Number(id));
      }
    }, true);

    // ---- the operation panel ----

    const showOps = (view) => {
      for (const v of opsViews) v.hidden = v.dataset.ops !== view;
      for (const t of opsTabs) t.setAttribute("aria-pressed", String(t.dataset.opsTab === view));
    };

    // Readouts are formatted only when the whole number behind them moves, so an idle strip builds no
    // strings at all. Keys are integers: a quantized value, not the float the sim holds.
    const last = new Map();
    const changed = (key, n) => {
      if (last.get(key) === n) return false;
      last.set(key, n);
      return true;
    };
    // A value that jumped up flashes once; the attribute alternates so the animation restarts.
    let flashA = false, lastBananas = 0, lastSats = 0;
    const flash = (node) => {
      flashA = !flashA;
      node.dataset.flash = flashA ? "a" : "b";
    };
    const setStrip = (s, sim) => {
      if (rate !== s.rate) {
        rate = s.rate;
        shown.clear();
      }
      if (changed("mined", Math.floor(s.minedSats / 1e4))) {
        setText(el.mined, coinFine(s.minedSats));
        setWidth(el.goal, Math.min(100, Math.floor(s.minedSats / R.GOAL_SATS * 100)), "ok");
        flash(el.mined);
      }
      // The score as it stands: hundredths of a coin mined, the speed bonus only once the run is won.
      const live = R.scoreOf(s.minedSats, s.won ? s.goalAt : s.time, s.won && !s.continued);
      if (changed("score", live)) setText(el.liveScore, `${live} pts${s.won ? " · won" : ""}`);
      const left = Math.max(0, Math.floor(R.RUN_SECONDS - s.time));
      if (changed("clock", left)) {
        setText(el.clock, clock(left));
        setState(el.clock, left < 300 ? "warn" : "ok");
      }
      let step = GOALS.length;
      for (let i = 0; i < GOALS.length; i++) if (!GOALS[i][1](s)) {
        step = i;
        break;
      }
      if (changed("step", step)) {
        setText(el.stepCount, `${Math.min(step + 1, GOALS.length)}/${GOALS.length}`);
        setText(el.stepText, step < GOALS.length ? (coarse && GOALS[step][2]) || GOALS[step][0] : "Every goal done. Keep mining.");
        // The first step's button glows until it is done, and so does the sell button on its step.
        el.crack.dataset.hint = step === 0 ? "yes" : "no";
        el.loan.dataset.hint = step === 1 ? "yes" : "no";
        el.sell.dataset.hint = step === 5 ? "yes" : "no";
      }
      // The profit bar: what the running fleet is expected to earn a minute, what its power costs, and
      // the difference. This is the number the whole game turns on.
      const earn = Math.round(s.incomeRate * 60), burn = Math.round(s.costRate * 60), profit = earn - burn;
      if (changed("earn", earn)) setText(el.earn, signed(earn));
      if (changed("burn", burn)) setText(el.burn, signed(-burn));
      if (changed("profit", profit)) {
        setText(el.profit, signed(profit));
        setState(el.profit, profit >= 0 ? "good" : "bad");
        setState(el.profit.parentNode, profit >= 0 || earn + burn < 1 ? "good" : "bad");
      }
      const offer = s.curtailOffer > s.time;
      setFlag(el.offer, "hidden", !offer);
      if (offer && changed("offer", Math.ceil(s.curtailOffer - s.time))) {
        const seconds = BL.mineSim.CURTAIL.seconds;
        setText(el.offerText, `Switch everything off for ${seconds}s and the grid pays you ${money(sim.curtailPay())} · you would mine about ${money((s.incomeRate - s.costRate) * seconds)} in that time · ${Math.ceil(s.curtailOffer - s.time)}s`);
      }

      const bananas = Math.floor(s.bananas);
      if (changed("bananas", bananas)) {
        setText(el.bananas, bananas < 0 ? `-${money(-bananas)}` : money(bananas));
        setState(el.bananas, bananas < 0 ? "bad" : "ok");
        setText(el.debt, bananas < 0 ? "owed to the grid" : "bananas");
        setState(el.debt, bananas < 0 ? "bad" : "ok");
        if (bananas > lastBananas + Math.max(50, lastBananas * 0.01)) flash(el.bananas);
        lastBananas = bananas;
      }
      const sats = Math.floor(s.sats / 1e4);
      if (changed("sats", sats)) {
        setText(el.sats, coin(s.sats));
        setFlag(el.sell, "disabled", s.sats <= 0);
        if (sats > lastSats) flash(el.sats);
        lastSats = sats;
      }
      if (changed("price", s.price)) setText(el.price, money(s.price));
      if (changed("trend", s.regime * 8 + (s.boom ? 1 : s.crash ? 2 : 0) + (s.livePrice > 0 ? 4 : 0))) {
        // Live is the real coin; offline it is the island's own market, and says so.
        setText(el.trend, `${s.livePrice > 0 ? "live" : "island"} · ${s.regime > 0 ? "rising" : "falling"}${s.boom ? " · boom" : s.crash ? " · crash" : ""}`);
        setState(el.trend, s.regime > 0 ? "good" : "bad");
      }
      if (changed("hash", Math.round(s.hash * 10))) setText(el.hash, hash(s.hash));
      // Hashprice: what a TH earns a day at today's difficulty, reward and price, the number every
      // buy comes down to.
      if (changed("hashprice", Math.round(s.hashprice * R.BLOCK_SECONDS * 10))) setText(el.hashprice, money(s.hashprice * R.BLOCK_SECONDS));
      if (changed("share", Math.round(s.share * 10000))) setText(el.share, `${(s.share * 100).toFixed(s.share < 0.01 ? 2 : 1)}% of net`);
      if (changed("diff", Math.round(s.difficulty))) setText(el.diff, hash(s.difficulty));
      if (changed("retarget", s.epochBlocks * 100000 + s.lastRetarget)) {
        // Just after a retarget a purchase gets the whole epoch at the old difficulty: the time to buy.
        const fresh = s.epochBlocks <= 2;
        setText(el.retarget, `retargets in ${R.EPOCH_BLOCKS - s.epochBlocks}${s.epochs ? ` · ${s.lastRetarget >= 0 ? "+" : ""}${(s.lastRetarget / 10).toFixed(1)}%` : ""}${fresh ? "\nbuy now" : ""}`);
        setState(el.retarget, fresh ? "good" : "ok");
      }
      const halving = s.halved ? -1 : Math.max(0, Math.floor(R.HALVING_AT - s.time));
      const feeMult = s.feeStorm ? 4 : s.liveFees > 1 ? s.liveFees : 1;
      if (changed("halving", halving * 8 + Math.round(feeMult * 2))) {
        // Subsidy plus fees; an arrow on the fees when the live mempool is paying over the odds.
        setText(el.reward, `${(R.subsidyAt(s.time) / 1e8).toFixed(4).replace(/0+$/, "")} + ${(BL.mineSim.FEE_BASE * feeMult / 1e8).toFixed(2)}${s.liveFees > 1 ? "↑" : ""}`);
        setText(el.halving, s.halved ? "halved" : `halving ${clock(halving)}`);
        setState(el.halving, !s.halved && halving < 180 ? "bad" : "ok");
      }
      if (changed("mode", s.pool ? 1 : 0)) {
        setText(el.mode, s.pool ? "Pool" : "Solo");
        setFlag(el.mode, "aria-pressed", s.pool);
      }
      const next = Math.ceil((R.BLOCK_SECONDS - s.blockT) / Math.max(0.05, s.blockRate));
      if (changed("next", next * 1000 + (s.pool ? 1 : 0) + (s.rug ? 2 : 0) + Math.round(s.share * s.luck * 1000) * 10 + s.poolHeld * 7)) {
        const stone = s.trophy[BL.mineSim.T_STONE] ? `block ${s.poolHeld + 1} of ${BL.mineSim.STONE_EVERY} · ` : "";
        setText(el.next, s.pool ? (s.rug ? "the pool took it all" : `${stone}pays in ${next}s`) : `${Math.min(R.SOLO_MAX * 100, s.share * 100 * s.luck).toFixed(1)}% chance · ${next}s`);
      }

      const price = sim.gridPrice();
      if (changed("grid", price * 8 + (s.gridDown ? 1 : 0) + (s.spike ? 2 : 0) + (s.cheap ? 4 : 0))) {
        setText(el.grid, `${money(price)} a kWh`);
        setText(el.gridNote, s.gridDown ? "DOWN" : s.spike ? "spike" : s.cheap ? "cheap" : s.contractUntil > s.time ? "locked" : price > R.POWER_PRICE * 1.15 ? "dear" : price < R.POWER_PRICE * 0.85 ? "cheap" : "normal");
        setState(el.gridNote, s.gridDown || s.spike || price > R.POWER_PRICE * 1.15 ? "bad" : "good");
      }
      const locked = s.contractUntil > s.time, deal = s.trophy[BL.mineSim.T_DEAL] === 1;
      setFlag(el.contract, "disabled", locked || deal || s.spike);
      if (changed("contract", deal ? -2 : s.spike ? -3 : locked ? Math.ceil(s.contractUntil - s.time) : -1)) {
        setText(el.contractNote, deal ? "no contracts on the Power Deal" : s.spike ? "no contracts in a spike · ride it out" : locked ? `${money(s.contractPrice)} for ${clock(s.contractUntil - s.time)}` : `fee ${money(sim.contractFee())} · 10 min`);
      }
      if (changed("kw", Math.round(s.kw) * 100000 + Math.round(s.genKw))) {
        setText(el.kw, `${Math.round(s.kw)} kW`);
        setText(el.own, s.genKw > 0 ? `${Math.round(Math.min(s.kw, s.genKw))} kW your own` : "all grid");
      }
      const battery = Math.round(Math.min(100, s.battery / s.batteryMax * 100));
      setWidth(el.battery, battery, battery < 20 ? "bad" : battery < 50 ? "warn" : "ok");
      if (changed("batteryText", battery * 1000 + Math.round(s.batteryMax / 1000))) setText(el.batteryText, `${battery}% of ${formatLarge(s.batteryMax)}`);

      for (let c = 0; c < chambers.length; c++) {
        const ch = chambers[c];
        setFlag(ch.row, "hidden", c > s.dug);
        // The strip under the profit bar: every dug chamber's heat, always in view.
        const strip = el.heatStrip[c];
        if (strip) {
          setFlag(strip, "hidden", c > s.dug);
          if (c <= s.dug) setWidth(strip.firstElementChild, Math.round(Math.min(100, s.heat[c] * 100)), s.heat[c] > R.HEAT_THROTTLE ? "bad" : s.heat[c] > 0.55 ? "warn" : "ok");
        }
        if (c > s.dug) continue;
        const load = Math.round(Math.min(100, s.chamberKw[c] / sim.circuitOf(c) * 100)), heat = Math.round(Math.min(100, s.heat[c] * 100));
        setWidth(ch.load, load, load > 95 ? "bad" : load > 75 ? "warn" : "ok");
        setWidth(ch.heat, heat, heat > R.HEAT_THROTTLE * 100 ? "bad" : heat > 55 ? "warn" : "ok");
        const bad = s.tripped[c] || s.fanDown[c] || s.heat[c] > R.HEAT_THROTTLE;
        setState(ch.row, bad ? "bad" : "ok");
        if (changed(CHAMBER_KEYS[c], Math.round(s.chamberKw[c]) * 1000 + Math.round(sim.circuitOf(c) / 10) * 10 + (s.tripped[c] ? 1 : 0) + (s.fanDown[c] ? 2 : 0) + (s.heat[c] > R.HEAT_THROTTLE ? 4 : 0))) {
          setText(ch.note, s.tripped[c] ? "BREAKER TRIPPED" : s.fanDown[c] ? "fan down" : `${Math.round(s.chamberKw[c])} of ${Math.round(sim.circuitOf(c))} kW · ${s.heat[c] > R.HEAT_THROTTLE ? "too hot, slowing" : "cool enough"}`);
        }
      }

      const crackLeft = R.CRACK.cap - s.crackUsed;
      setFlag(el.crack, "disabled", crackLeft <= 0);
      if (changed("crack", crackLeft > 0 ? crackLeft : -Math.ceil(Math.max(0, s.crackReset - s.time)))) {
        setText(el.crackNote, crackLeft > 0 ? `+${money(R.CRACK.bananas)} · ${crackLeft} left` : `rock rests ${clock(Math.max(0, s.crackReset - s.time))}`);
      }
      if (s.loan > 0) {
        const due = Math.max(0, Math.ceil(s.loanDue - s.time));
        setText(el.loanLabel, "Repay the loan");
        if (changed("loan", due * 10 + s.loanStage)) setText(el.loanNote, `${money(s.loan)} · ${clock(due)}${s.loanStage ? ` · extension ${s.loanStage}` : ""}`);
        setState(el.loan, due < 60 ? "due" : "open");
      } else {
        setText(el.loanLabel, "Take a loan");
        if (changed("loan", -Math.floor(sim.loanOffer() / 1000))) setText(el.loanNote, `+${money(sim.loanOffer())}, 1.25x in 4m`);
        setState(el.loan, "none");
      }
      // "Everything back on" is for after a blackout, when every model is off, not for a model the
      // player switched off on purpose because it was losing money.
      let owned = 0, off = 0;
      for (let m = 0; m < R.MODELS.length; m++) if (s.owned[m] > 0) {
        owned++;
        if (s.off[m]) off++;
      }
      setFlag(el.on, "hidden", !owned || off < owned || s.cutOff);
      // The strip that stays when both panels are folded: the four numbers a glance needs.
      if (changed("miniMined", Math.floor(s.minedSats / 1e4))) setText(el.miniMined, `${coinFine(s.minedSats)} coin`);
      if (changed("miniProfit", profit)) {
        setText(el.miniProfit, `${signed(profit)}/min`);
        setState(el.miniProfit, profit >= 0 ? "good" : "bad");
      }
      if (changed("miniClock", left)) setText(el.miniClock, clock(left));
      if (changed("miniJobs", s.faultCount)) setText(el.miniJobs, s.faultCount ? `${s.faultCount} job${s.faultCount > 1 ? "s" : ""}` : "");
      const alert = s.cutOff || s.gridDown || s.distress > 0;
      setFlag(el.alert, "hidden", !alert);
      if (alert && changed("alert", (s.cutOff ? 1 : s.gridDown ? 2 : 3) * 100000 + (s.distress > 0 ? Math.ceil(R.BANKRUPT_SECONDS - s.distress) : Math.round(s.battery / Math.max(1, s.kw - s.genKw))))) {
        setText(el.alertText, s.cutOff ? "CUT OFF · the grid wants paying. Sell coin or a machine." : s.gridDown ? "Grid down · on the battery" : "Going broke");
        setText(el.alertLeft, s.distress > 0 ? String(Math.ceil(R.BANKRUPT_SECONDS - s.distress)) : s.gridDown ? `${Math.round(s.battery / Math.max(1, s.kw - s.genKw))}s left` : "");
      }
    };

    // The jobs list rebuilds only when the sim's fault or layout versions move, or the power price
    // crosses a model's break-even. Every row is a place: tapping it looks there and opens its card.
    let jobsVersion = "";
    const setJobs = (s, sim) => {
      let losing = 0;
      for (let m = 0; m < R.MODELS.length; m++) if (s.owned[m] && sim.profitOf(m) < 0) losing |= 1 << m;
      const version = `${s.faultVersion}|${s.layoutVersion}|${losing}|${s.spike || s.gridDown ? 1 : 0}`;
      if (version === jobsVersion) return;
      jobsVersion = version;
      const rows = [];
      const row = (kind, text, where, job) => {
        const li = document.createElement("li"), b = document.createElement("b");
        li.dataset.kind = kind;
        li.dataset.job = job;
        li.setAttribute("role", "button");
        b.textContent = where;
        li.append(span(text, ""), b);
        rows.push(li);
      };
      for (const f of s.faults) {
        if (!f.active) continue;
        if (f.kind === "breaker") row("breaker", "Breaker tripped", R.DIGS[f.unit].name, `breaker:${f.unit}`);
        else if (f.kind === "cooling") row("cooling", "Cooling fan down", R.DIGS[f.unit].name, `cooling:${f.unit}`);
        else if (f.kind === "melt") row("fire", `MELTING · ${R.MODELS[s.unit[f.unit] - 1].name} · pull it`, R.DIGS[R.chamberOfUnit(f.unit)].name, `fire:${f.unit}`);
        else row("fire", `FIRE · ${R.MODELS[s.unit[f.unit] - 1].name}`, R.DIGS[R.chamberOfUnit(f.unit)].name, `fire:${f.unit}`);
      }
      for (let m = 0; m < R.MODELS.length; m++) if (s.broken[m] > 0) row("dead", `${s.broken[m]} ${R.MODELS[m].name} dead`, "tap to repair", `dead:${m}`);
      for (let m = 0; m < R.MODELS.length; m++) {
        if (!s.owned[m]) continue;
        if (s.off[m]) row("off", `${R.MODELS[m].name} switched off`, s.cutOff ? "cut off" : "switch on", `model:${m}`);
        // A thirty-second price spike or an outage is ridden out, not sold into: no advice then.
        else if (losing & (1 << m) && !s.spike && !s.gridDown) row("off", `${R.MODELS[m].name} losing money`, "switch off or sell", `model:${m}`);
      }
      el.faults.replaceChildren(...rows);
      el.clear.hidden = rows.length > 0;
    };

    // One event at a time, as a pill with its name and a ring that runs down with its seconds.
    let eventShown = "", ringShown = -1;
    const setEvent = (id, good, seconds, total) => {
      const text = id ? EVENT_WORDS[id] || id : "";
      if (text !== eventShown) {
        eventShown = text;
        el.event.hidden = !text;
        if (text) {
          el.eventText.firstChild.data = text;
          el.event.dataset.good = good ? "yes" : "no";
        }
      }
      if (!text) return;
      const ring = total > 0 ? Math.max(0, Math.round(seconds / total * 40)) : 40;
      if (ring === ringShown) return;
      ringShown = ring;
      el.event.style.setProperty("--p", String(ring / 40));
    };

    // The ticker: the last few things the log said, newest at the bottom, each line fading on its own. Four
    // fixed lines are recycled; the count is capped by the markup, never by a list.
    const tickerLines = el.ticker ? [...el.ticker.children] : [];
    let tickerAt = 0;
    const ticker = (text, kind = "") => {
      if (!tickerLines.length) return;
      const line = tickerLines[tickerAt];
      tickerAt = (tickerAt + 1) % tickerLines.length;
      line.textContent = text;
      line.dataset.kind = kind;
      // Restart the fade by taking the line out of flow for one frame.
      line.dataset.live = "no";
      void line.offsetWidth;
      line.dataset.live = "yes";
      if (el.ticker.lastElementChild !== line) el.ticker.append(line);
    };
    let centerTimer = 0;
    const center = (text, ms = 2600) => {
      el.center.firstChild.data = text;
      el.center.hidden = !text;
      window.clearTimeout(centerTimer);
      if (text && ms > 0) centerTimer = window.setTimeout(() => {
        el.center.hidden = true;
      }, ms);
    };
    const milestone = (id) => center(MILESTONE_WORDS[id] || "");

    // ---- the card ----
    // `content` is { title, note, facts: [[label, value, warn]], actions: [{ op, label, sub, disabled, pressed }] }.
    // Rebuilt only when the scene says its selection or the layout changed.
    const showCard = (content) => {
      if (!content) {
        el.card.hidden = true;
        return;
      }
      el.card.hidden = false;
      el.cardTitle.textContent = content.title;
      el.cardNote.textContent = content.note;
      el.cardFacts.replaceChildren(...content.facts.map(([label, value, warn]) => {
        const li = document.createElement("li");
        if (warn) li.dataset.warn = warn;
        li.append(span(label, ""), span(value, ""));
        return li;
      }));
      el.cardActions.replaceChildren(...content.actions.map((a) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "mine-act";
        b.dataset.card = a.op;
        b.disabled = !!a.disabled;
        if (a.pressed !== undefined) b.setAttribute("aria-pressed", String(a.pressed));
        b.append(a.label);
        if (a.sub) {
          const small = document.createElement("small");
          small.textContent = a.sub;
          b.append(small);
        }
        return b;
      }));
    };

    // ---- sections ----

    const setSection = (section) => {
      el.intro.hidden = section !== "intro";
      el.results.hidden = section !== "results";
      el.shop.hidden = el.ops.hidden = section !== "run";
      if (el.mini) el.mini.hidden = section !== "run";
      if (el.ticker) el.ticker.hidden = section !== "run";
      // On a phone both panels start folded, so the sticks and the cave are clear; the edge tabs bring them back.
      if (section === "run" && coarse) el.shop.dataset.folded = el.ops.dataset.folded = "true";
      if (section !== "run") {
        el.event.hidden = true;
        el.card.hidden = true;
        eventShown = "";
      }
    };

    const showBest = (b) => {
      const medal = b && !b.continued ? R.medalFor(b.score) : null;
      el.best.hidden = !b;
      if (!b) return;
      el.best.dataset.medal = medal || "";
      el.best.textContent = `BEST ${b.score}${medal ? ` · ${medal.toUpperCase()}` : ""}`;
    };

    const results = (s, improved, bestNow, canContinue) => {
      const medal = s.continued ? null : R.medalFor(s.score);
      el.finalScore.textContent = String(s.score);
      el.finalMedal.hidden = !medal;
      if (medal) {
        el.finalMedal.dataset.medal = medal;
        el.finalMedal.textContent = medal.toUpperCase();
      }
      el.finalBest.textContent = improved ? "NEW BEST" : bestNow ? `best ${bestNow.score}` : "";
      el.final.classList.toggle("is-best", improved);
      const rows = [
        ["Mined", `${coin(s.minedSats)} coin`],
        ["Time", clock(s.time)],
        ["Spent on power", money(s.billed)],
        ["Blocks found solo", String(s.blocks)],
        ["Real blocks caught", String(s.realBlocks)],
        ["Machines", String(asics(s))],
        ["21 coin at", s.won ? clock(s.goalAt) : "not reached"],
        ["Dug out to", R.DIGS[s.dug].name],
        ["Peak hash", hash(s.peakHash)]
      ];
      if (s.continued) rows.push(["Came back from a loss", `${s.continued}× · no medal`]);
      el.score.replaceChildren(...rows.map(([label, value]) => {
        const li = document.createElement("li");
        li.append(span(label, ""), span(value, ""));
        return li;
      }));
      el.summary.textContent = REASON_WORDS[s.reason] || "";
      el.keep.hidden = !canContinue;
      showBest(bestNow);
      setSection("results");
      el.final.classList.remove("is-shown");
      void el.final.offsetWidth;
      el.final.classList.add("is-shown");
    };

    buildPalette();
    showBest(best);
    showOps("money");

    return {
      // The Ooga the visitor walked in as, named on the title card.
      setPlayer: (name) => {
        el.who.textContent = `You are @${name}`;
      },
      el, setSection, setStrip, setJobs, setEvent, refreshPalette, showCard, center, milestone, ticker, results, showBest, showTab, showOps,
      setPaused: (paused) => el.pause.setAttribute("aria-pressed", String(paused)),
      setMuted: (muted) => el.mute.setAttribute("aria-pressed", String(muted)),
      get dragging() {
        return drag.active;
      },
      dispose() {
        finish(false, 0, 0);
        window.clearTimeout(clickTimer);
        window.clearTimeout(centerTimer);
        for (const off of listeners) off();
        listeners.length = 0;
        el.tiles.replaceChildren();
        el.tabs.replaceChildren();
        el.faults.replaceChildren();
        el.cardFacts.replaceChildren();
        el.cardActions.replaceChildren();
        el.score.replaceChildren();
        tiles.clear();
        groups.clear();
        tabs.clear();
        ICONS.clear();
        shown.clear();
        last.clear();
        el.card.hidden = el.event.hidden = el.center.hidden = true;
        if (el.ticker) el.ticker.hidden = true;
        if (el.mini) el.mini.hidden = true;
      }
    };
  };

  BL.mineHud = { create, ITEMS, GOALS, EVENT_WORDS, REASON_WORDS, MILESTONE_WORDS, hash, payback };
})();
