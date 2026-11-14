// The Cloud Archive lounge TV and its channel guide. What each channel reads, and the guide's selection and rotation,
// are cloud-archive-channels.js's; this paints the tuned channel onto the TV's canvas, keeps the guide (a dialog in
// the page, `#archive-guide`: the channels by category with each one's status, a tap tunes one and opens its detail,
// and "change channel by itself") and the board the dialog reads.
// Painting: the tuned channel's `stampOf` (its stamp with its status) is checked once a LIVE_SECONDS; its rows are formatted and the canvas
// repainted only when the stamp moved, or on tuning. Nothing is formatted or built per frame.
// A GitHub page draws the hanging Oogatron's own paused reader (`reader`, paged here); a place draws its picture.
// Holds: the guide open, the TV's board open; under reduced motion rotation starts off and there is no snow.
// `dispose` releases the selector's subscriptions and record watches, the reader and the guide's rows.
(() => {
  "use strict";
  const BL = window.BL;
  const W = 480, H = 360, BAR = 44, STATIC_SECONDS = 0.25, LIVE_SECONDS = 1;
  const INK = "#f3efe4", DIM = "#a6a6a2", ACCENT = "#e8b04a", GOOD = "#46ff70", BG = "#0a0c0a", RED = "#e5533d", BLUE = "#6f9fca";
  const TONES = { "": INK, accent: ACCENT, good: GOOD, up: GOOD, down: RED, dim: DIM, blue: BLUE };
  const STATUS_INK = { live: GOOD, stale: ACCENT, held: BLUE, demo: ACCENT, waiting: DIM, off: DIM };
  const create = ({ views, world, font, reduced, boardOpen, reader, guide, signal, onDetail }) => {
    const C = BL.cloudArchiveChannels, env = { BL, world, now: () => Date.now(), reader, views };
    const list = C.channels(env);
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext("2d"), snow = g.createImageData(W / 4, H / 4);
    const stamps = new Float64Array(list.length).fill(NaN), readings = new Array(list.length).fill(null);
    const counters = list.map((_, i) => `${i + 1}/${list.length}`);
    const tv = { snow: 0, live: 0, version: 0, open: false };
    let seed = 1, clock = 0, guideShown = false;
    const readingOf = (i) => {
      const s = C.stampOf(list[i], env);
      if (s !== stamps[i] || !readings[i]) { stamps[i] = s; readings[i] = list[i].read(env); readings[i].status = list[i].status(env); }
      return readings[i];
    };
    // The frame every live channel shares: its title, its status in words and colour, rows, its source and age.
    const header = (c, r) => {
      g.fillStyle = BG; g.fillRect(0, 0, W, H);
      g.fillStyle = "#1b1f1b"; g.fillRect(0, 0, W, 46);
      g.font = `700 21px ${font}`; g.textBaseline = "middle"; g.textAlign = "left"; g.fillStyle = ACCENT;
      g.fillText(c.title.toUpperCase(), 16, 24, W - 140);
      g.textAlign = "right"; g.font = `700 14px ${font}`; g.fillStyle = STATUS_INK[r.status];
      g.fillText(`● ${C.WORDS[r.status]}`, W - 16, 24);
    };
    const rows = (lines) => {
      const step = lines.length > 6 ? 31 : 36, top = 72;
      for (let i = 0; i < lines.length; i++) {
        const [label, value, tone] = lines[i], y = top + i * step;
        g.textAlign = "left"; g.font = `600 16px ${font}`; g.fillStyle = DIM; g.fillText(label, 18, y, 230);
        g.textAlign = "right"; g.font = `700 20px ${font}`; g.fillStyle = TONES[tone] || INK; g.fillText(value, W - 18, y, W - 250);
      }
    };
    const footer = (c, r) => {
      g.textAlign = "left"; g.font = `500 13px ${font}`; g.fillStyle = DIM; g.textBaseline = "middle";
      g.fillText(r.at > 0 ? `${c.source} · ${C.ago(r.at, env.now())}` : c.source, 16, H - BAR - 14, W - 32);
    };
    const paintLive = (i) => {
      const c = list[i], r = readingOf(i);
      header(c, r);
      if (r.reader !== undefined) {
        g.imageSmoothingEnabled = false;
        g.drawImage(reader.canvas, 0, 56, W, Math.round(W * reader.canvas.height / reader.canvas.width));
      } else if (r.big) {
        g.textAlign = "center"; g.font = `700 42px ${font}`; g.fillStyle = r.status === "live" ? INK : DIM;
        g.fillText(r.big, W / 2, 104);
        for (let m = 0; m < r.meters.length; m++) {
          const [label, value, tone] = r.meters[m], y = 172 + m * 42;
          g.textAlign = "left"; g.font = `600 16px ${font}`; g.fillStyle = DIM; g.fillText(label, 18, y);
          g.fillStyle = "#1b1f1b"; g.fillRect(170, y - 9, W - 188, 18);
          g.fillStyle = TONES[tone]; g.fillRect(170, y - 9, Math.round((W - 188) * Math.max(0, Math.min(1, value))), 18);
        }
      } else rows(r.rows);
      if (r.empty) { g.textAlign = "center"; g.font = `500 15px ${font}`; g.fillStyle = DIM; g.fillText(r.empty, W / 2, r.rows.length ? H - BAR - 40 : 170, W - 40); }
      footer(c, r);
    };
    const paintCam = (c) => {
      g.imageSmoothingEnabled = true;
      g.drawImage(c.cam.canvas, 0, 0, W, H);
      g.fillStyle = "rgba(0,0,0,0.12)";
      for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    };
    const bar = (i) => {
      g.fillStyle = "rgba(0,0,0,0.6)"; g.fillRect(0, H - BAR, W, BAR);
      g.fillStyle = "#ffffff"; g.font = `700 17px ${font}`; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText(selector.state.newBlock > 0 && list[i].id === "mempool" ? "NEW BLOCK FOUND!" : `${list[i].category === "cams" ? "ISLAND CAM · " : ""}${list[i].title.toUpperCase()}`, 14, H - BAR / 2, W - 90);
      g.fillStyle = ACCENT; g.textAlign = "right"; g.fillText(counters[i], W - 14, H - BAR / 2);
    };
    // A GitHub page: the reader turned to it and brought up to date before it is read.
    const prime = (i) => {
      const c = list[i];
      if (c.page === undefined) return;
      if (reader.index !== c.page % reader.count) reader.go(c.page % reader.count);
      reader.update(clock);
    };
    let selector = null;
    const paint = () => {
      const i = selector.index;
      if (tv.snow > 0) {
        const d = snow.data;
        for (let k = 0; k < d.length; k += 4) { seed = (Math.imul(seed, 1103515245) + 12345) | 0; d[k] = d[k + 1] = d[k + 2] = (seed >>> 24); d[k + 3] = 255; }
        g.imageSmoothingEnabled = false;
        g.putImageData(snow, 0, 0);
        g.drawImage(canvas, 0, 0, W / 4, H / 4, 0, 0, W, H);
      } else {
        if (list[i].cam) paintCam(list[i]); else paintLive(i);
        bar(i);
      }
      tv.version++;
      if (guideShown) markGuide();
    };
    selector = C.createSelector(list, env, { reduced: reduced(), onTune: (i, byHand) => {
      tv.live = LIVE_SECONDS;
      tv.snow = reduced() || byHand ? 0 : STATIC_SECONDS;
      stamps[i] = NaN;
      prime(i);
      paint();
    } });
    // The guide: built once a visit; a row's status word is rewritten only when its status changes.
    const buttons = new Array(list.length).fill(null), shown = new Array(list.length).fill("");
    const auto = guide ? guide.querySelector("#archive-guide-auto") : null, holder = guide ? guide.querySelector("#archive-guide-list") : null;
    const markGuide = () => {
      for (let i = 0; i < list.length; i++) {
        const b = buttons[i];
        if (!b) continue;
        const s = list[i].status(env);
        if (shown[i] !== s) { shown[i] = s; b.dataset.status = s; b.lastElementChild.textContent = C.WORDS[s]; }
        const current = i === selector.index ? "true" : "false";
        if (b.getAttribute("aria-current") !== current) b.setAttribute("aria-current", current);
      }
    };
    if (holder) {
      const groups = [];
      for (const group of selector.categories()) {
        const section = document.createElement("section"), heading = document.createElement("h3"), items = document.createElement("ul");
        heading.textContent = group.name;
        for (const c of group.channels) {
          const item = document.createElement("li"), button = document.createElement("button"), name = document.createElement("span"), status = document.createElement("span");
          button.type = "button"; button.dataset.channel = String(c.index);
          name.className = "archive-guide-name"; name.textContent = c.title;
          status.className = "archive-guide-status";
          button.append(name, status); item.append(button); items.append(item);
          buttons[c.index] = button;
        }
        section.append(heading, items); groups.push(section);
      }
      holder.replaceChildren(...groups);
      holder.addEventListener("click", (e) => {
        const button = e.target.closest("[data-channel]");
        if (!button) return;
        const i = +button.dataset.channel;
        selector.select(i);
        // Off the closed guide first: a board opened next would hand focus back to this row when it closes, and keys
        // pressed in a dialog are the page's, not the game's (T, W A S D would stop reaching the archive).
        button.blur();
        guide.close();
        onDetail(list[i]);
      }, { signal });
      auto.addEventListener("change", () => selector.setAuto(auto.checked), { signal });
      guide.addEventListener("close", () => { guideShown = false; selector.hold("guide", false); }, { signal });
    }
    const openGuide = () => {
      if (!guide || guide.open) return false;
      guideShown = true;
      markGuide();
      auto.checked = selector.auto;
      selector.hold("guide", true);
      guide.showModal();
      buttons[selector.index].focus();
      return true;
    };
    prime(selector.index);
    paint();
    const update = (dt, elapsed) => {
      clock = elapsed;
      if (tv.open && !boardOpen()) { tv.open = false; selector.hold("board", false); }
      const before = selector.index;
      selector.update(dt);
      if (selector.index !== before) return;
      if (tv.snow > 0 && (tv.snow -= dt) <= 0) { tv.snow = 0; paint(); return; }
      if ((tv.live -= dt) > 0) return;
      tv.live = LIVE_SECONDS;
      const i = selector.index;
      if (!list[i].cam) { prime(i); if (C.stampOf(list[i], env) !== stamps[i]) { paint(); return; } }
      if (guideShown) markGuide();
    };
    // The board the shared dialog reads: every channel a page, live as the screen; its play button is rotation.
    const board = {
      title: "Island TV", wide: true, carousel: true,
      help: "Ooga Booga Land's live systems by channel. Arrow keys change channel; play turns rotation on and off.",
      get canvas() { const c = list[selector.index]; return c.cam && tv.snow <= 0 ? c.cam.canvas : canvas; },
      get count() { return list.length; }, get index() { return selector.index; },
      get caption() { return list[selector.index].title; },
      get note() {
        const c = list[selector.index];
        if (c.cam) return "A picture the island drew of this place as you climbed the beanstalk.";
        const r = readingOf(selector.index);
        return `${r.note ? `${r.note} ` : ""}Source: ${c.source}. ${C.WORDS[r.status]}${r.at > 0 ? `, updated ${C.ago(r.at, env.now())}` : ""}.`;
      },
      get links() { const c = list[selector.index]; return c.cam ? null : readingOf(selector.index).links || null; },
      get paused() { return !selector.auto; }, setPaused: (paused) => selector.setAuto(!paused),
      get version() { return tv.version; },
      go: (i) => selector.select(i)
    };
    const openBoard = () => { tv.open = true; selector.hold("board", true); tv.version++; };
    const dispose = () => {
      selector.dispose();
      reader.dispose();
      if (guide && guide.open) guide.close();
      if (holder) holder.replaceChildren();
      canvas.width = canvas.height = 0;
    };
    // A turn of the set's knobs: the next channel up (`dir` 1) or down (-1) that is not off, tuned by hand.
    const turn = (dir) => {
      for (let step = 1; step < list.length; step++) {
        const i = ((selector.index + dir * step) % list.length + list.length) % list.length;
        if (list[i].status(env) !== "off") return selector.select(i);
      }
    };
    return { canvas, list, selector, tv, board, update, openGuide, openBoard, turn, get title() { return list[selector.index].title; }, get guideOpen() { return guideShown; }, dispose };
  };
  BL.cloudArchiveTv = { create, W, H };
})();
