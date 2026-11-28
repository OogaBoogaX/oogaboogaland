// The Bananas panel, the island's (hud.js) and Ooga Chat's (#656) alike: `build(section, { ids })` writes its markup into
// a panel section, and `create(section, options)` fills it from donations.js's state. Nothing here reads the document or
// the page's other modules at load, so Ooga Chat shares the file (scripts/ooga-chat.mjs SHARED). Only the island's
// copy carries ids (`ids: true`, which its tests and labels name); any other copy has none, so a page may hold more
// than one. A section's rows are made once and kept: building again over it, or creating its controller again, reuses
// them, so the DOM never grows with donations or visits. `create`'s options are what differs between the pages:
// `demo()` the simulated tally (the island's demo donations, null elsewhere), `rate()` the current price,
// `visible()` whether the panel shows, and `storageKey`, where the recent list's checkbox is remembered.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const SVG = "http://www.w3.org/2000/svg";
  const BANANA_COUNT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const DONATED_COUNT = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const DONOR_BANANAS = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // The panel's nine-pixel banana, drawn inline wherever it shows, so no copy needs another's id.
  const GLYPH = [["#211b14", "M0 0h1v5H0zM2 0h1v2H2zM3 2h1v2H3zM4 4h1v1H4zM1 5h1v2H1zM5 5h1v1H5zM6 6h1v1H6zM2 7h2v1H2zM7 7h1v1H7zM4 8h4v1H4z"],
    ["#ffd84a", "M1 2h2v2H1zM1 4h3v1H1zM2 5h3v1H2zM2 6h4v1H2zM4 7h3v1H4z"], ["#789a3b", "M1 0h1v2H1z"]];
  const glyph = (doc, className, label = "") => {
    const svg = doc.createElementNS(SVG, "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("viewBox", "0 0 9 9");
    svg.setAttribute("shape-rendering", "crispEdges");
    if (label) {
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", label);
    } else svg.setAttribute("aria-hidden", "true");
    for (const [fill, d] of GLYPH) {
      const path = doc.createElementNS(SVG, "path");
      path.setAttribute("fill", fill);
      path.setAttribute("d", d);
      svg.append(path);
    }
    return svg;
  };
  // The recent list's orange check: a seal whose rim rises and falls in eight rounded ridges, a ridge at the top,
  // with the tick over it.
  const SEAL = (() => {
    const RIDGES = 8, STEPS = RIDGES * 8;
    let d = "";
    for (let i = 0; i < STEPS; i++) {
      const a = i / STEPS * Math.PI * 2, r = 11 + 0.9 * Math.cos(RIDGES * a);
      d += `${i ? "L" : "M"}${(12 + r * Math.sin(a)).toFixed(2)} ${(12 - r * Math.cos(a)).toFixed(2)}`;
    }
    return `${d}Z`;
  })();
  const seal = (doc) => {
    const svg = doc.createElementNS(SVG, "svg"), rim = doc.createElementNS(SVG, "path"), tick = doc.createElementNS(SVG, "path");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    rim.setAttribute("class", "banana-verified-seal");
    rim.setAttribute("d", SEAL);
    tick.setAttribute("class", "banana-verified-tick");
    tick.setAttribute("d", "M7.6 12.4L10.9 17.1L16.9 8.3");
    svg.append(rim, tick);
    return svg;
  };
  // Today's value of every sat donated, in bananas (a banana is a dollar), or "—" with no price yet.
  const valueText = (sats, price) => sats === 0 ? DONATED_COUNT.format(0) : sats !== null && price ? DONATED_COUNT.format(sats / 1e8 * price) : "—";

  // ---- the markup ----------------------------------------------------------------------------------------------
  // A small builder: tag, class, then text or child nodes. `role` names a part the controller finds again, and its
  // id on the island's copy.
  const ID = { source: "banana-source", total: "banana-total", donations: "stat-donations", sats: "stat-sats", exchange: "banana-exchange",
    btcRate: "banana-btc-rate", btcSats: "banana-btc-sats", btcPrice: "banana-btc-price", boardTitle: "banana-board-title",
    boardUnit: "banana-board-unit", leaders: "banana-leaders", empty: "banana-empty", recentTitle: "banana-recent-title",
    bar: "banana-recent-bar", barLabel: "banana-recent-bar-label", recent: "banana-recent-list", recentEmpty: "banana-recent-empty",
    note: "banana-board-note" };
  const build = (section, { ids = false } = {}) => {
    const doc = section.ownerDocument;
    if (section.querySelector("[data-banana]")) return section;
    const make = (tag, className, ...children) => {
      const el = doc.createElement(tag);
      if (className) el.className = className;
      for (const child of children) el.append(child);
      return el;
    };
    const part = (role, el) => {
      el.dataset.banana = role;
      if (ids) el.id = ID[role];
      return el;
    };
    const sign = (text) => {
      const span = make("span", "", text);
      span.dataset.sign = "";
      return span;
    };
    // A heading a section is named by: by its id on the island, by a label where there are no ids.
    const named = (el, role, label) => {
      if (ids) el.setAttribute("aria-labelledby", ID[role]);
      else el.setAttribute("aria-label", label);
      return el;
    };
    const total = make("section", "banana-total");
    total.setAttribute("aria-label", "Current banana value of all sats donated");
    const totalValue = part("total", make("strong", "", "—"));
    totalValue.title = "All donated sats valued at the current BTCUSD price; 1 banana = $1";
    const totals = make("dl", "banana-totals",
      make("div", "", make("dt", "", "Donations"), part("donations", make("dd", "", "0"))),
      make("div", "", make("dt", "", "Sats donated"), part("sats", make("dd", "", "0"))));
    const rates = make("div", "banana-rates",
      make("p", "banana-rate", glyph(doc, "banana-rate-icon", "Banana"), "1 = $1 ", part("exchange", make("span", "", "— sats"))),
      part("btcRate", make("p", "banana-rate", part("btcSats", make("span", "", "100,000,000")), " sats = ", glyph(doc, "banana-rate-icon", "bananas"),
        part("btcPrice", make("span", "", "—")))));
    rates.setAttribute("role", "group");
    rates.setAttribute("aria-label", "Current Bitcoin and banana exchange rates");
    rates.lastChild.dataset.tone = "wait";
    total.append(make("div", "banana-hero", make("span", "banana-hero-label", "Bananas current value"),
      make("p", "banana-hero-value", glyph(doc, "banana-hero-icon"), totalValue)), totals, rates);
    const units = make("div", "banana-units");
    units.setAttribute("role", "group");
    units.setAttribute("aria-label", "Rank donors by");
    for (const [unit, label] of [["bananas", "Bananas"], ["sats", "Sats"]]) {
      const button = make("button", "", label);
      button.type = "button";
      button.dataset.donorUnit = unit;
      button.setAttribute("aria-pressed", String(unit === "bananas"));
      units.append(button);
    }
    const labels = make("div", "banana-board-labels", make("span", "", "#"), make("span", "", "Donor"), part("boardUnit", make("span", "", "Bananas")));
    labels.setAttribute("aria-hidden", "true");
    const leaders = part("leaders", make("ol", "banana-leaders"));
    leaders.setAttribute("aria-label", "Top donors by bananas");
    const board = named(make("section", "banana-board",
      make("div", "banana-board-head", part("boardTitle", make("h3", "slab-head", sign("Top donors"))), units),
      labels, leaders, part("empty", make("p", "banana-empty", "No donations yet. Feed the first Ooga!"))), "boardTitle", "Top donors");
    const bar = part("bar", make("input", ""));
    bar.type = "checkbox";
    const recentList = part("recent", make("ol", "banana-recent-list"));
    recentList.setAttribute("aria-label", "Most recent donations");
    const recent = named(make("section", "banana-recent",
      part("recentTitle", make("h3", "slab-head", sign("Most recent donations"))),
      make("label", "banana-recent-filter", bar, " ", part("barLabel", make("span", "", "1,000 sats and up only"))),
      recentList, part("recentEmpty", make("p", "banana-empty", "New donations will appear here."))), "recentTitle", "Most recent donations");
    const header = make("header", "panel-title", make("h2", "", sign("Bananas donated")), part("source", make("span", "panel-chip", "Demo")));
    header.lastChild.dataset.tone = "idle";
    const feed = make("button", "panel-primary feed-open", sign("Feed the Oogas"));
    feed.type = "button";
    feed.dataset.action = "feed";
    section.append(header, make("div", "slab banana-slab", total, board, recent, part("note", make("p", "banana-board-note", "Demo donations saved in this browser."))), feed);
    return section;
  };

  // ---- the controller ----------------------------------------------------------------------------------------
  // A section's rows and the visitor's choices, kept with the section for the page life.
  const kept = new WeakMap();
  const create = (section, { donations = BL.donations, demo = () => null, rate = () => donations.state.tally?.rate || null,
    visible = () => !section.hidden, storageKey = "ooga-recent-bar" } = {}) => {
    const doc = section.ownerDocument;
    const find = (role) => section.querySelector(`[data-banana="${role}"]`);
    const el = Object.fromEntries(Object.keys(ID).map((role) => [role, find(role)]));
    const units = [...section.querySelectorAll("[data-donor-unit]")];
    let own = kept.get(section);
    if (!own) {
      own = { unit: "bananas", leaders: [], recent: null, barOnly: true };
      try { own.barOnly = localStorage.getItem(storageKey) !== "0"; } catch { /* no storage: on, as for a first visit */ }
      kept.set(section, own);
    }
    const listeners = new AbortController(), { signal } = listeners;
    // Value the donated sats at the current price; donor rankings retain their receipt prices. A bitcoin's price is
    // in bananas, since a banana is a dollar; whether that price is live or stale is said on hover alone.
    let fitPriceLength = -1, fitWidth = 0;
    const totalText = () => {
      const tally = donations.real ? donations.state.tally : demo();
      return valueText(tally ? donations.real ? tally.sats : tally.totalSats : null, rate()?.usdPerBtc);
    };
    const showRate = () => {
      if (doc.hidden || !visible()) return;
      const now = rate(), total = totalText();
      const tone = !now ? "wait" : now.stale ? "stale" : now.live ? "live" : "idle";
      const label = tone === "live" ? "Live BTCUSD price" : tone === "stale" ? "Stale BTCUSD price, the last one kept" : tone === "wait" ? "Waiting for the BTCUSD price" : "BTCUSD price";
      const price = now ? DONOR_BANANAS.format(now.usdPerBtc) : "—";
      const exchange = now ? `≈ ${DONOR_BANANAS.format(1e8 / now.usdPerBtc)} sats` : "— sats";
      if (el.btcRate.dataset.tone !== tone) el.btcRate.dataset.tone = tone;
      if (el.btcRate.title !== label) el.btcRate.title = label;
      if (el.btcPrice.textContent !== price) el.btcPrice.textContent = price;
      if (el.exchange.textContent !== exchange) el.exchange.textContent = exchange;
      if (el.total.textContent !== total) el.total.textContent = total;
      if (price.length !== fitPriceLength) fitBtcRate();
    };
    // The bitcoin line keeps to one line: "100,000,000 sats" while it fits, "100M sats" once a narrow panel or a long
    // price would wrap it, and only past that does it wrap. Fitted again when the price's length or the line's width
    // changes; digits are tabular, so the same length takes the same room.
    const fitBtcRate = () => {
      const line = el.btcRate;
      fitPriceLength = el.btcPrice.textContent.length;
      if (!fitWidth) return;
      line.dataset.fit = "line";
      el.btcSats.textContent = "100,000,000";
      if (line.scrollWidth <= line.clientWidth) return;
      el.btcSats.textContent = "100M";
      if (line.scrollWidth > line.clientWidth) line.dataset.fit = "wrap";
    };
    const btcRateObserver = new ResizeObserver((entries) => {
      const width = Math.round(entries[entries.length - 1].contentRect.width);
      if (width === fitWidth) return;
      fitWidth = width;
      fitBtcRate();
    });
    btcRateObserver.observe(el.btcRate);
    const amountBanana = glyph(doc, "banana-amount-icon"), verifiedSeal = seal(doc);
    // A fixed pool, so the DOM never grows with donations.
    const recentRows = own.recent || (own.recent = Array.from({ length: donations.RECENT_MAX }, () => {
      const li = doc.createElement("li"), name = doc.createElement("span"), labelBox = doc.createElement("span"), label = doc.createTextNode("");
      const badge = doc.createElement("span"), amount = doc.createElement("strong"), message = doc.createElement("p");
      // Every text node exists from the start, so filling a row later adds nothing to the DOM.
      const amountText = doc.createTextNode(""), messageText = doc.createTextNode("");
      name.className = "banana-recent-name";
      labelBox.className = "banana-recent-label";
      labelBox.append(label);
      badge.className = "banana-verified";
      badge.append(verifiedSeal.cloneNode(true));
      badge.title = "Signed in with GitHub using this donor name";
      badge.setAttribute("role", "img");
      badge.setAttribute("aria-label", "GitHub name confirmed");
      badge.hidden = true;
      amount.className = "banana-amount";
      message.className = "banana-recent-message";
      message.hidden = true;
      name.append(labelBox, badge);
      amount.append(amountBanana.cloneNode(true), amountText);
      message.append(messageText);
      li.append(name, amount, message);
      li.hidden = true;
      el.recent.append(li);
      return { li, name, labelBox, label, badge, amountText, message, messageText };
    }));
    // One row a ranked donor, made as the board first grows to it and kept for the page life: the board scrolls inside
    // its five-row window, and both boards it shows hold at most 256 (the API's and the game's demo donors).
    const leaderRows = own.leaders;
    const leaderRow = (i) => {
      const li = doc.createElement("li"), rank = doc.createElement("span"), name = doc.createElement("span"), amount = doc.createElement("strong");
      const nameText = doc.createTextNode(""), amountText = doc.createTextNode("");
      rank.className = "banana-rank"; rank.textContent = String(i + 1).padStart(2, "0");
      name.className = "banana-donor"; name.append(nameText);
      amount.className = "banana-amount"; amount.append(amountBanana.cloneNode(true), amountText);
      li.append(rank, name, amount); li.hidden = true; el.leaders.append(li);
      return { li, name, nameText, amountText };
    };
    // The recent list's checkbox keeps it to tips at or above the message bar: on until the visitor turns it off,
    // and their choice either way remembered in this browser.
    el.bar.checked = own.barOnly;
    el.bar.addEventListener("change", () => {
      own.barOnly = el.bar.checked;
      try { localStorage.setItem(storageKey, own.barOnly ? "1" : "0"); } catch { /* kept for this visit alone */ }
      refresh(true);
      el.bar.blur();
    }, { signal });
    let shownTally, shownBoard, shownRecent, shownReal, shownNetwork, shownOpen, shownBar;
    const refresh = (force = false) => {
      const { real, state, testNetwork, messageMinSats: bar } = donations;
      showRate();
      if (!force && shownTally === state.tally && shownBoard === state.board && shownRecent === state.recent && shownReal === real && shownNetwork === testNetwork && shownOpen === state.open && shownBar === bar) return;
      shownTally = state.tally; shownBoard = state.board; shownRecent = state.recent; shownReal = real; shownNetwork = testNetwork; shownOpen = state.open; shownBar = bar;
      const unit = own.unit, stats = demo();
      const tally = real ? state.tally : stats;
      // The chip says whose figures these are: this browser's demo, a test network's, the feed still loading,
      // donations closed, or the island's live feed.
      const tone = !real ? "idle" : testNetwork ? "test" : !tally ? "wait" : state.open === false ? "closed" : "live";
      el.source.dataset.tone = tone;
      el.source.textContent = tone === "idle" ? "Demo" : tone === "test" ? `Test · ${testNetwork}` : tone === "wait" ? "Loading" : tone === "closed" ? "Closed" : "Live";
      el.source.title = tone === "idle" ? "Demo donations saved in this browser" : tone === "test" ? `Test donations on ${testNetwork}, not real bitcoin`
        : tone === "wait" ? "Waiting for the island’s donation feed" : tone === "closed" ? "Donations are closed for now" : "The island’s donation feed";
      el.donations.textContent = tally ? BANANA_COUNT.format(real ? tally.count : tally.donations) : "—";
      el.sats.textContent = tally ? BANANA_COUNT.format(real ? tally.sats : tally.totalSats) : "—";
      const entries = real ? unit === "sats" ? state.boardSats : state.board : stats?.donors;
      const missingSats = unit === "sats" && (real && state.board !== null && entries === null || entries?.some((entry) => entry.sats === null));
      // The API ranks before rounding bananas, with stable account-id ties. Keep that order.
      const ranked = missingSats ? [] : real ? entries || [] : (entries || []).slice().sort((a, b) =>
        b[unit] - a[unit] || b[unit === "bananas" ? "sats" : "bananas"] - a[unit === "bananas" ? "sats" : "bananas"]
        || a.handle.localeCompare(b.handle));
      while (leaderRows.length < ranked.length) leaderRows.push(leaderRow(leaderRows.length));
      for (let i = 0; i < leaderRows.length; i++) {
        const entry = ranked[i], row = leaderRows[i];
        row.li.hidden = !entry;
        if (!entry) continue;
        const name = entry.handle ? `@${entry.handle}` : "Anonymous";
        const amount = (unit === "sats" ? BANANA_COUNT : DONOR_BANANAS).format(entry[unit]);
        if (row.nameText.data !== name) { row.nameText.data = name; row.name.title = name; }
        if (row.amountText.data !== amount) row.amountText.data = amount;
        row.name.dataset.anon = String(!entry.handle);
      }
      el.empty.hidden = ranked.length > 0;
      el.empty.textContent = missingSats ? "Sat totals are not available from the donation feed yet."
        : real && !entries ? "Loading the donor leaderboard…"
        : real ? "No donations yet. Feed the first Ooga!" : "New demo donations will appear here.";
      // The recent list: the newest first, its orange check only on the API's word that the donor's GitHub login
      // matched the name, into the fixed rows (the first `RECENT_MAX` the checkbox leaves).
      const all = real ? state.recent || [] : stats?.recentDonations || [];
      const recent = own.barOnly ? all.filter((entry) => entry.sats >= bar) : all;
      el.barLabel.textContent = `${BANANA_COUNT.format(bar)} sats and up only`;
      for (let i = 0; i < recentRows.length; i++) {
        const row = recentRows[i], entry = recent[i];
        row.li.hidden = !entry;
        if (!entry) continue;
        row.label.data = entry.handle ? `@${entry.handle}` : "Anonymous";
        if (row.labelBox.title !== row.label.data) row.labelBox.title = row.label.data;
        row.name.dataset.anon = String(!entry.handle);
        row.badge.hidden = !(real && entry.verified);
        row.amountText.data = (unit === "sats" ? BANANA_COUNT : DONOR_BANANAS).format(entry[unit]);
        const message = donations.carried(entry.sats, entry.message);
        row.message.hidden = !message;
        row.messageText.data = message;
      }
      el.recentEmpty.hidden = recent.length > 0;
      el.recentEmpty.textContent = own.barOnly && all.length ? `None of the latest tips reached ${BANANA_COUNT.format(bar)} sats.`
        : real ? "Recent donations will appear here as they arrive." : "New demo donations will appear here.";
      el.note.textContent = !real ? "Demo donations in this browser only. Earlier tips have no donor history."
        : testNetwork ? `Test donations on ${testNetwork}. Leaderboard values are recorded when paid.`
        : "Leaderboard totals use each donation's recorded value.";
      el.boardUnit.textContent = unit === "sats" ? "Sats" : "Bananas";
      section.dataset.unit = unit;
      el.leaders.setAttribute("aria-label", `Top donors by ${unit}`);
      for (const button of units) button.setAttribute("aria-pressed", String(button.dataset.donorUnit === unit));
    };
    for (const button of units) button.addEventListener("click", () => {
      own.unit = button.dataset.donorUnit;
      refresh(true);
    }, { signal });
    const stop = donations.subscribeState(() => refresh());
    refresh(true);
    const dispose = () => {
      listeners.abort();
      btcRateObserver.disconnect();
      stop();
    };
    return { refresh, showRate, totalText, dispose };
  };
  BL.bananaPanel = { build, create, glyph, valueText, BANANA_COUNT };
})();
