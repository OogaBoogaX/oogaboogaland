// Ooga Raid's DOM: the HUD strip (lives, continues, score and best, weapon and rapid, and player 2's lives, score and
// shot when two play), the nav's Pause button, the boss bar, the centre call and notice, the stage card, the pause
// card, the touch FIRE button, the title card's best line (the best score, the furthest stage and the loop's mark) and
// its one-or-two-players choice (and the choice a pad has marked there), the stage chooser the stage select puts on it, Shaman's Secrets' tablet (each secret's
// toggle, on, off or locked "???"), the strip's mark for a run with secrets on, the boss card (a boss's carved name as it
// enters) and the weapon callout (a pickup's name, big, popping in over the play), and the results card. The director shows the scene's sections and
// its title card (`[data-scene="raid"]`, `[data-intro="raid"]`); this only fills them. Every setter writes the DOM
// only when what it shows changes, so the scene may call them every frame.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const $ = (id) => document.getElementById(id);
  const COARSE = window.matchMedia("(pointer: coarse)").matches;
  const NBSP = " ";
  // A score is exact, with thousands marked, as a score to beat is (the carnival's rule); only a best of six figures
  // is shortened in the strip's note. One formatter for the page: a call makes only the string it returns.
  const DIGITS = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const digits = (n) => DIGITS.format(n);
  // As `hud.letterSign`: the sign's letters as the island's carved glyphs, its words for the screen reader.
  const letterSign = (node, words) => {
    const text = words.replace(/\s+/g, " ").trim();
    node.setAttribute("aria-label", text);
    node.replaceChildren(BL.hud.signLettering(text));
  };
  const create = () => {
    const el = {
      raid: $("raid"), strip: $("raid-strip"), lives: $("raid-lives"), continues: $("raid-continues"), score: $("raid-score"), best: $("raid-best"),
      weapon: $("raid-weapon"), rapid: $("raid-rapid"), center: $("raid-center"), notice: $("raid-notice"), fire: $("raid-fire"),
      introBest: $("raid-intro-best"), results: $("raid-results"), sign: $("raid-results-sign"), rows: $("raid-rows"), summary: $("raid-summary"), mute: $("raid-mute"),
      livesLabel: $("raid-lives-label"), scoreLabel: $("raid-score-label"), lives2: $("raid-lives2"), score2: $("raid-score2"), weapon2: $("raid-weapon2"),
      two: [...document.querySelectorAll("#raid .raid-p2")], one: $("raid-1p"), pair: $("raid-2p"),
      card: $("raid-card"), cardKicker: $("raid-card-kicker"), cardSign: $("raid-card-sign"),
      boss: $("raid-boss"), bossFill: $("raid-boss-fill"), pause: $("raid-pause"), pauseBtn: $("raid-pause-btn"),
      secrets: $("raid-secrets"), secretButtons: [...document.querySelectorAll("#raid-secrets [data-secret]")], secretsHelp: document.querySelector("#raid-secrets .raid-secrets-help"),
      start: $("raid-start"), startName: $("raid-start-name"), startHelp: document.querySelector("#raid-start .raid-start-help"), cheatMark: $("raid-cheat-mark"),
      bossCard: $("raid-bosscard"), bossCardSign: $("raid-bosscard-sign"), call: $("raid-call")
    };
    const secretsHelpText = el.secretsHelp.textContent, startHelpText = el.startHelp.textContent;
    const pauseHelp = el.pause.querySelector("[data-coarse]");
    if (COARSE) pauseHelp.textContent = pauseHelp.dataset.coarse;
    for (const node of [el.lives, el.continues, el.score, el.best, el.weapon, el.rapid, el.center, el.notice, el.introBest, el.lives2, el.score2, el.weapon2, el.call]) if (!node.firstChild) node.append("");
    const show = (section) => {
      el.strip.hidden = section !== "play";
      el.fire.hidden = section !== "play" || !COARSE;
      el.results.hidden = section !== "results";
      el.pauseBtn.hidden = section !== "play";
      if (section !== "play") {
        el.center.hidden = true;
        el.notice.hidden = true;
        el.card.hidden = true;
        el.bossCard.hidden = true;
        el.call.hidden = true;
        setBoss(-1);
        setPaused(false);
      }
    };
    // The boss bar: a boss main's hit points left as a fraction of its start, 0 to 1; below 0 hides it. Written only
    // when the fraction moves, which a hit does.
    let lastBoss = -1;
    const setBoss = (f) => {
      if (f === lastBoss) return;
      if (f < 0 || lastBoss < 0) el.boss.hidden = f < 0;
      lastBoss = f;
      if (f < 0) return;
      el.bossFill.style.transform = `scaleX(${f})`;
      el.boss.setAttribute("aria-valuenow", String(Math.round(f * 100)));
    };
    // The pause card, and the nav's Pause button's pressed state.
    const setPaused = (on) => {
      el.pause.hidden = !on;
      el.pauseBtn.setAttribute("aria-pressed", String(on));
    };
    // One player or two: player 2's stats shown, player 1's labelled as theirs, the title card's choice pressed, and
    // `data-raid-players` on #raid for the strip's layout.
    const setPlayers = (n) => {
      const two = n === 2;
      for (const node of el.two) node.hidden = !two;
      el.livesLabel.textContent = two ? "P1 lives" : "Lives";
      el.scoreLabel.textContent = two ? "P1 score" : "Score";
      el.one.setAttribute("aria-pressed", String(!two));
      el.pair.setAttribute("aria-pressed", String(two));
      el.raid.dataset.raidPlayers = String(n);
    };
    // The players a pad has marked on the title card (1 or 2; 0 marks none, as with no pad connected): `data-pad-mark` on
    // that button. The mark only shows the choice; A or Start plays it.
    let lastMark = -1;
    const markPlayers = (n) => {
      if (n === lastMark) return;
      lastMark = n;
      el.one.toggleAttribute("data-pad-mark", n === 1);
      el.pair.toggleAttribute("data-pad-mark", n === 2);
    };
    let lastLives2 = -1, lastScore2 = -1, lastLine2 = "";
    // Player 2's lives, score and shot line (its weapon, and rapid fire).
    const setTwo = (lives, score, line) => {
      if (lives !== lastLives2) {
        lastLives2 = lives;
        el.lives2.firstChild.data = String(lives);
      }
      if (score !== lastScore2) {
        lastScore2 = score;
        el.score2.firstChild.data = digits(score);
      }
      if (line !== lastLine2) {
        lastLine2 = line;
        el.weapon2.firstChild.data = line;
      }
    };
    // The stage card between stages: a kicker over the carved name; null hides it.
    const card = (kicker, title) => {
      el.card.hidden = !title;
      if (!title) return;
      el.cardKicker.textContent = kicker;
      letterSign(el.cardSign, title);
    };
    let lastLives = -1, lastContinues = -1, lastScore = -1, lastBest = -1, lastWeapon = "", lastRapid = -1;
    const setLives = (n) => {
      if (n === lastLives) return;
      lastLives = n;
      el.lives.firstChild.data = String(n);
    };
    // The continues left; below 0, endless (Shaman's Secrets).
    const setContinues = (n) => {
      if (n === lastContinues) return;
      lastContinues = n;
      el.continues.firstChild.data = n < 0 ? "∞" : String(n);
    };
    const setScore = (n) => {
      if (n === lastScore) return;
      lastScore = n;
      el.score.firstChild.data = digits(n);
    };
    let lastStage = "", lastLooped = false;
    // The best score, in the strip's note and on the title card, where a completed loop marks it and a second line names
    // the furthest stage reached (`stage`, numbered and named; empty leaves one line).
    const setBest = (n, stage = "", looped = false) => {
      if (n === lastBest && stage === lastStage && looped === lastLooped) return;
      lastBest = n;
      lastStage = stage;
      lastLooped = looped;
      el.best.firstChild.data = n > 0 ? `Best ${n >= 1e5 ? BL.game.formatLarge(n) : digits(n)}` : "No best yet";
      el.introBest.firstChild.data = (n > 0 ? `Best score ${digits(n)}` : "No best score yet") + (looped ? " · ★ Raid complete" : "") + (stage ? `\n${stage}` : "");
    };
    const setWeapon = (name, rapid) => {
      const r = rapid ? 1 : 0;
      if (name !== lastWeapon) {
        lastWeapon = name;
        el.weapon.firstChild.data = name;
      }
      if (r !== lastRapid) {
        lastRapid = r;
        el.rapid.firstChild.data = r ? "Rapid" : NBSP;
        el.rapid.dataset.on = r ? "true" : "false";
      }
    };
    let centerTimer = 0, noticeTimer = 0, bossCardTimer = 0, callTimer = 0;
    // The boss card: `title` carved under its kicker for `ms`, its slam-in played again from the start; and the weapon
    // callout, `text` popping in big for `ms`. Each hides itself through one function made here, so a call makes no
    // closure: the scene calls them on the moment, never every frame.
    const hideBossCard = () => { el.bossCard.hidden = true; };
    const hideCall = () => { el.call.hidden = true; };
    // Hidden, then shown after a layout read, so a card or callout already up starts its animation again.
    const replay = (node) => {
      node.hidden = true;
      void node.offsetWidth;
      node.hidden = false;
    };
    const bossCard = (title, ms) => {
      letterSign(el.bossCardSign, title);
      replay(el.bossCard);
      window.clearTimeout(bossCardTimer);
      bossCardTimer = window.setTimeout(hideBossCard, ms);
    };
    const callout = (text, ms) => {
      el.call.firstChild.data = text;
      replay(el.call);
      window.clearTimeout(callTimer);
      callTimer = window.setTimeout(hideCall, ms);
    };
    // Both put away at once, their timers with them (a new run starts clear).
    const clearCalls = () => {
      window.clearTimeout(bossCardTimer);
      window.clearTimeout(callTimer);
      hideBossCard();
      hideCall();
    };
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
    const row = (label, value) => {
      const li = document.createElement("li");
      const a = document.createElement("span");
      a.textContent = label;
      const b = document.createElement("span");
      b.textContent = typeof value === "number" ? digits(value) : value;
      li.append(a, b);
      return li;
    };
    // `rows` is [label, value] pairs (a number value reads in exact digits), `sign` the carved heading.
    const results = (rows, summary, sign) => {
      el.rows.replaceChildren(...rows.map(([label, value]) => row(label, value)));
      el.summary.textContent = summary;
      if (sign) letterSign(el.sign, sign);
      show("results");
    };
    // Shaman's Secrets: the tablet shown or hidden, its help in the words for the pads, touch or keys; a secret's toggle
    // on or off, or locked, when it shows "???" and how to earn it; the toggle the keys or a pad have reached (-1 none),
    // focused; the title card's stage chooser naming the stage a run starts on (null hides it), its keys' line in the
    // words for the pads, touch or keys; and the strip's mark.
    const showSecrets = (on, pads = 0) => {
      el.secrets.hidden = !on;
      if (on) el.secretsHelp.textContent = pads > 0 ? el.secretsHelp.dataset.pad : COARSE ? el.secretsHelp.dataset.coarse : secretsHelpText;
    };
    const setSecret = (id, on, locked) => {
      const b = el.secretButtons.find((n) => n.dataset.secret === id);
      b.dataset.locked = String(locked);
      b.setAttribute("aria-pressed", String(on && !locked));
      b.setAttribute("aria-disabled", String(locked));
      b.children[0].textContent = locked ? "???" : b.dataset.name;
      b.children[1].textContent = locked ? b.dataset.lockedNote : b.dataset.note;
      b.children[2].textContent = locked ? "Locked" : on ? "On" : "Off";
    };
    const focusSecret = (i) => {
      el.secretButtons.forEach((b, k) => { b.dataset.focus = String(k === i); });
      if (i >= 0) el.secretButtons[i].focus({ preventScroll: false });
    };
    const setStart = (name, pads = 0) => {
      el.start.hidden = !name;
      if (name) el.startName.textContent = name;
      el.startHelp.textContent = pads > 0 ? el.startHelp.dataset.pad : COARSE ? el.startHelp.dataset.coarse : startHelpText;
    };
    const setCheated = (on) => {
      el.cheatMark.hidden = !on;
    };
    const dispose = () => {
      showSecrets(false);
      focusSecret(-1);
      el.secretsHelp.textContent = secretsHelpText;
      setStart(null);
      setCheated(false);
      markPlayers(0);
      window.clearTimeout(centerTimer);
      window.clearTimeout(noticeTimer);
      el.rows.replaceChildren();
      window.clearTimeout(bossCardTimer);
      window.clearTimeout(callTimer);
      el.summary.textContent = "";
      delete el.raid.dataset.raidPlayers;
      el.bossFill.style.removeProperty("transform");
      show(null);
    };
    show(null);
    return { el, show, setPlayers, markPlayers, setLives, setContinues, setScore, setWeapon, setBest, setTwo, setBoss, setPaused, card, bossCard, callout, clearCalls, center, notice, results, showSecrets, setSecret, focusSecret, setStart, setCheated, dispose };
  };
  BL.raidHud = { create };
})();
