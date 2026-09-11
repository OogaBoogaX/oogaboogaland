// Ooga Drop HUD: the launch board, the flight strip, centre calls and the results board
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const $ = (id) => document.getElementById(id);
  const MEDALS = { gold: 1400, silver: 1000, bronze: 600 };
  const formatTime = (ms) => {
    const total = Math.max(0, Math.floor(ms));
    const m = Math.floor(total / 60000), s = Math.floor(total / 1000) % 60, h = Math.floor(total / 10) % 100;
    return `${m}:${String(s).padStart(2, "0")}.${String(h).padStart(2, "0")}`;
  };
  const medalFor = (score) => score >= MEDALS.gold ? "gold" : score >= MEDALS.silver ? "silver" : score >= MEDALS.bronze ? "bronze" : null;
  const create = ({ roster, best, onPick }) => {
    const el = {
      drop: $("drop"), board: $("drop-board"), oogas: $("drop-oogas"), bestList: $("drop-best"), medal: $("drop-medal"), help: $("drop-help"),
      strip: $("drop-strip"), alt: $("drop-alt"), rings: $("drop-rings"), ringTotal: $("drop-ring-total"), time: $("drop-time"), speed: $("drop-speed"), chute: $("drop-chute"), chuteName: $("drop-chute-name"),
      center: $("drop-center"), notice: $("drop-notice"), results: $("drop-results"), score: $("drop-score"), summary: $("drop-summary"), boardBtn: $("drop-board-btn"), mute: $("drop-mute"), joyLook: $("joy-look")
    };
    const listeners = [];
    const on = (target, type, fn) => {
      target.addEventListener(type, fn);
      listeners.push(() => target.removeEventListener(type, fn));
    };
    for (const node of [el.alt, el.rings, el.time, el.speed, el.center, el.notice, el.chuteName]) if (!node.firstChild) node.append("");
    const selection = { racer: roster[0].name };
    const buttons = new Map();
    const mark = () => {
      for (const [key, b] of buttons) b.setAttribute("aria-pressed", String(key === selection.racer));
    };
    const buildBoard = (stateOf) => {
      el.oogas.replaceChildren(...roster.map((c) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.racer = c.name;
        const name = document.createElement("span");
        name.className = "garage-name";
        name.textContent = c.name;
        const state = document.createElement("span");
        state.className = "roster-state";
        state.dataset.state = stateOf(c.name);
        state.textContent = { working: "EATING", sleeping: "ZZZ", away: "AWAY" }[state.dataset.state];
        b.append(name, state);
        on(b, "click", () => {
          b.blur();
          selection.racer = c.name;
          mark();
          if (onPick) onPick(c.name);
        });
        li.append(b);
        buttons.set(c.name, b);
        return li;
      }));
      mark();
      refreshBest();
    };
    const row = (label, value) => {
      const li = document.createElement("li");
      const a = document.createElement("span");
      a.textContent = label;
      const b = document.createElement("span");
      b.textContent = value;
      li.append(a, b);
      return li;
    };
    const refreshBest = () => {
      const b = best();
      const medal = b ? medalFor(b.score) : null;
      el.medal.hidden = !medal;
      if (medal) {
        el.medal.dataset.medal = medal;
        el.medal.textContent = `${medal.toUpperCase()} · ${b.score}`;
      }
      el.bestList.replaceChildren(...(b
        ? [row("Score", String(b.score)), row("Rings", `${b.rings} of ${b.ringTotal}`), row("Landing", b.landing), row("Medal", medal ? medal.toUpperCase() : "none")]
        : [row("Score", "–"), row("Gold", `${MEDALS.gold}+`), row("Silver", `${MEDALS.silver}+`), row("Bronze", `${MEDALS.bronze}+`)]));
    };
    const show = (section) => {
      el.board.hidden = section !== "board";
      el.strip.hidden = section !== "flight";
      el.results.hidden = section !== "results";
      el.boardBtn.hidden = section === "board";
      if (section !== "flight") {
        el.center.hidden = true;
        el.notice.hidden = true;
      }
    };
    let lastAlt = -1, lastRings = -1, lastTime = -1, lastSpeed = -1, lastChute = "";
    const setAlt = (v) => {
      const n = Math.max(0, Math.round(v));
      if (n === lastAlt) return;
      lastAlt = n;
      el.alt.firstChild.data = String(n);
    };
    const setRings = (hit, total) => {
      if (hit === lastRings) return;
      lastRings = hit;
      el.rings.firstChild.data = String(hit);
      el.ringTotal.textContent = `/${total}`;
    };
    const setTime = (ms) => {
      const tenth = Math.floor(ms / 10);
      if (tenth === lastTime) return;
      lastTime = tenth;
      el.time.firstChild.data = formatTime(ms);
    };
    const setSpeed = (v) => {
      const n = Math.round(v);
      if (n === lastSpeed) return;
      lastSpeed = n;
      el.speed.firstChild.data = String(n);
    };
    // The chute slot reads pack, then the open canopy, then flaring
    const setChute = (state) => {
      if (state === lastChute) return;
      lastChute = state;
      el.chute.dataset.item = state === "pack" ? "" : "turbo";
      el.chuteName.firstChild.data = state;
    };
    let centerTimer = 0, noticeTimer = 0;
    const center = (text, ms = 900) => {
      el.center.firstChild.data = text;
      el.center.hidden = !text;
      window.clearTimeout(centerTimer);
      if (text && ms > 0) centerTimer = window.setTimeout(() => {
        el.center.hidden = true;
      }, ms);
    };
    const notice = (text, ms = 1600) => {
      el.notice.firstChild.data = text;
      el.notice.hidden = !text;
      window.clearTimeout(noticeTimer);
      if (text && ms > 0) noticeTimer = window.setTimeout(() => {
        el.notice.hidden = true;
      }, ms);
    };
    const results = (rows, summary) => {
      el.score.replaceChildren(...rows.map(([label, value]) => row(label, value)));
      el.summary.textContent = summary;
      refreshBest();
      show("results");
    };
    const dispose = () => {
      window.clearTimeout(centerTimer);
      window.clearTimeout(noticeTimer);
      for (const off of listeners) off();
      el.oogas.replaceChildren();
      el.bestList.replaceChildren();
      el.score.replaceChildren();
      show(null);
      el.boardBtn.hidden = true;
      buttons.clear();
    };
    return { el, selection, buildBoard, refreshBest, show, setAlt, setRings, setTime, setSpeed, setChute, center, notice, results, formatTime, medalFor, dispose };
  };
  BL.dropHud = { create, formatTime, medalFor, MEDALS };
})();
