// A retained clock and title/results card for Cloud Hopper, with its level cards; the controller owns all game state.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // The ride up already shows the race's start as it will stand at the top: the waiting clock and the ready lines,
  // which stay as they are while the run's start folds them away.
  const READY = ["Race to the banana pile", "Leave this cloud to start · J toggles a collected jetpack. Extra packs refill fuel."];
  const COPY = {
    intro: ["Race from the clouds to the banana pile", "Find your route. Race for the top of the leaderboard."],
    lifting: READY,
    briefing: ["Before you jump", "Meet the clouds and gear along the way."],
    ready: READY,
    running: READY,
    won: ["Banana pile reached!", "A clean landing and a time to beat."],
    dq: ["Disqualified", "Splash! No cloud was within reach."],
    // A run lost to a tornado says so, under its own picture.
    swept: ["Disqualified", "Swept up into the tornado and caught spinning inside it!"]
  };
  const GUIDE = [
    ["normal", "Drifting clouds", "WASD moves, Shift runs and Space jumps. The clock starts when you leave this cloud. A shimmering cloud is about to fade."],
    ["boost", "Boost clouds", "Touch a pink cloud anywhere to launch toward the island."],
    ["jetpack", "Jetpacks", "Press J to wear a jetpack, then hold Space to fly up. Fuel never refills, so grab another pack for more."],
    ["finish", "Banana pile", "Land on the banana pile to stop the clock. Toggle the global record ghost in the timer to compare runs. Clouds change each run; the ghost shows its original route."]
  ];
  // Bounce clouds (from Level 2), Aurora Heights' gusts, Thunderhead's tornadoes and the power-ups, each introduced the
  // first time a session plays a level that carries it.
  const ITEMS = {
    bounce: ["bounce", "Bounce clouds", "Touch a purple cloud anywhere to bounce high. Steer to your next cloud on the way down."],
    gust: ["gust", "Gusts of wind", "Twice a run the wind blows across the course. Arrows at the screen's edge warn where it comes from. It pushes you sideways, so lean into it."],
    tornado: ["tornado", "Tornadoes", "A tornado comes down where a glowing cap gathers, and it grows stronger as it goes. Dash through it fast or it sweeps you away."],
    xray: ["xray", "X-ray goggles", "For 30 seconds, see how long each cloud has before it fades. A gold ∞ never fades."],
    updraft: ["updraft", "Sky feather", "Out of jumps? Press Space and the feather throws you high into the air."],
    hook: ["hook", "Grappling hook", "Aim at a cloud and hold click (RT on a pad) to reel yourself in. Let go to fly on. Miss, and it's gone."]
  };
  const formatTime = (value) => `${String(Math.floor(value / 6000)).padStart(2, "0")}:${String(Math.floor(value / 100) % 60).padStart(2, "0")}.${String(value % 100).padStart(2, "0")}`;
  const create = ({ onStart, onReplay, onExit, onGuideDone, onSelect, onNext, onHook, onGhost, letterSign } = {}) => {
    const node = (tag, className, text = "") => {
      const el = document.createElement(tag);
      el.className = className;
      el.textContent = text;
      return el;
    };
    const hud = node("section", "cloud-hopper-hud"), name = node("div", "cloud-hopper-name", "CLOUD HOPPER");
    const timer = node("output", "cloud-hopper-time", "00:00.00"), title = node("div", "cloud-hopper-status");
    // The power-ups that apply now, as buttons in the banner's equipment row beside the jetpack's, each its pixel icon
    // and a readout: X-ray's goggles with its seconds, the feather held, the hook held or thrown. On a touch screen the
    // hook's button is held to throw at the middle of the view and reel in.
    const powerButton = (kind, label, icon) => {
      const button = node("button", "jetpack-hud cloud-hopper-power " + kind), readout = node("span", "equipment-compact cloud-hopper-power-readout");
      button.type = "button"; button.tabIndex = -1; button.dataset.equipped = "true"; button.hidden = true;
      button.setAttribute("aria-label", label); button.title = label;
      button.innerHTML = '<svg class="jetpack-icon" viewBox="0 0 12 14" shape-rendering="crispEdges" aria-hidden="true">' + icon + "</svg>";
      button.append(readout);
      return button;
    };
    const xrayChip = powerButton("xray", "X-ray goggles", '<path fill="#5a4a3a" d="M0 6h1v2H0zM11 6h1v2h-1z"/>'
      + '<path fill="#8f8a82" d="M1 4h4v1H1zM7 4h4v1H7zM1 9h4v1H1zM7 9h4v1H7zM1 5h1v4H1zM4 5h1v4H4zM7 5h1v4H7zM10 5h1v4h-1zM5 5h2v1H5z"/>'
      + '<path fill="#1d5f6a" d="M2 5h2v4H2zM8 5h2v4H8z"/><path fill="#7ffcff" d="M2 6h1v1H2zM8 6h1v1H8zM3 7h1v1H3zM9 7h1v1H9z"/>');
    const featherChip = powerButton("updraft", "Sky feather", '<path fill="#e9e2cf" d="M2 12h1v1H2zM3 11h1v1H3zM4 10h1v1H4z"/>'
      + '<path fill="#f6f4ee" d="M5 9h2v1H5zM5 8h3v1H5zM6 7h3v1H6zM6 6h4v1H6zM7 5h3v1H7zM7 4h4v1H7zM8 3h3v1H8z"/><path fill="#3fd0c6" d="M9 1h2v2H9zM10 3h1v1h-1z"/>');
    const hookChip = powerButton("hook", "Grappling hook", '<path fill="#8a7040" d="M5 0h2v5H5z"/><path fill="#efe6cf" d="M5 5h2v5H5z"/>'
      + '<path fill="#9a8f80" d="M1 7h1v4H1zM10 7h1v4h-1zM2 11h2v1H2zM8 11h2v1H8zM4 10h4v2H4z"/>');
    const xrayReadout = xrayChip.lastChild, featherReadout = featherChip.lastChild, hookReadout = hookChip.lastChild;
    featherReadout.textContent = "1";
    const hookDown = (e) => { e.preventDefault(); hookChip.setPointerCapture?.(e.pointerId); onHook?.(true); };
    const hookUp = (e) => { e.preventDefault(); onHook?.(false); };
    hookChip.addEventListener("pointerdown", hookDown);
    hookChip.addEventListener("pointerup", hookUp);
    hookChip.addEventListener("pointercancel", hookUp);
    const record = node("p", "cloud-hopper-help cloud-hopper-record"), recordText = node("span", "cloud-hopper-record-text");
    const recordGhost = node("button", "cloud-hopper-record-ghost");
    recordGhost.type = "button"; recordGhost.disabled = true; recordGhost.hidden = true;
    recordGhost.setAttribute("aria-pressed", "false");
    recordGhost.setAttribute("aria-label", "Show global record ghost · winning replay unavailable");
    recordGhost.title = "Winning replay unavailable";
    recordGhost.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 22V10C3 4 6.5 1 12 1s9 3 9 9v12l-3-2.5-3 2.5-3-2.5-3 2.5-3-2.5Z"/>'
      + '<ellipse cx="9" cy="10" rx="1.2" ry="1.9" fill="#17232e"/><ellipse cx="15" cy="10" rx="1.2" ry="1.9" fill="#17232e"/></svg>';
    const recordTime = node("span", "cloud-hopper-record-time"), recordTail = node("span", "cloud-hopper-record-tail");
    recordTail.append(recordGhost, recordTime);
    record.setAttribute("role", "status"); record.append(recordText, recordTail);
    const toggleGhost = event => { event.stopPropagation(); onGhost?.(); };
    recordGhost.addEventListener("click", toggleGhost);
    const setReplayState = state => {
      recordGhost.disabled = state === "unavailable";
      recordGhost.setAttribute("aria-pressed", String(state === "on" || state === "loading"));
      recordGhost.setAttribute("aria-busy", String(state === "loading"));
      recordGhost.title = state === "unavailable" ? "No winning replay yet" : state === "error" ? "Replay unavailable · retry"
        : state === "loading" ? "Loading winning replay · click to cancel" : state === "on" ? "Hide global record ghost" : "Show global record ghost · historical route";
      recordGhost.setAttribute("aria-label", recordGhost.title);
    };
    const help = node("p", "cloud-hopper-help"), panel = node("dialog", "race-results game-intro cloud-hopper-panel");
    const glow = node("div", "game-intro-glow"), rays = node("div", "game-intro-rays");
    const kicker = node("p", "game-intro-kicker", "Ooga Arcade"), panelTitle = node("h2", "game-intro-title", "CLOUD HOPPER");
    const goal = node("p", "game-intro-goal"), panelHelp = node("p", "game-intro-who");
    const introArt = node("img", "cloud-hopper-intro-art"), guideArt = node("div", "cloud-hopper-guide-art");
    const resultArt = node("img", "cloud-hopper-result-art");
    const resultTime = node("p", "cloud-hopper-time"), scoresPanel = node("section", "cloud-hopper-scores");
    const cabinetScores = node("button", "cabinet-scores-toggle", "Leaderboard");
    cabinetScores.type = "button"; cabinetScores.dataset.role = "choose";
    cabinetScores.setAttribute("aria-expanded", "false");
    cabinetScores.setAttribute("aria-controls", "cloud-hopper-scores");
    scoresPanel.id = "cloud-hopper-scores";
    cabinetScores.addEventListener("click", () => {
      const open = panel.classList.toggle("cabinet-scores-open");
      cabinetScores.dataset.role = open ? "back" : "choose";
      cabinetScores.textContent = open ? "Levels" : "Leaderboard";
      cabinetScores.setAttribute("aria-expanded", String(open));
    });
    const scoresTitle = node("h3", "cloud-hopper-scores-title", "Shared top 10");
    const scoresList = node("ol", "race-podium"), uploads = node("p", "cloud-hopper-uploads");
    uploads.setAttribute("role", "status"); uploads.hidden = true;
    const scoresStatus = node("p", "cloud-hopper-scores-status", "Loading shared times…");
    const personalBest = node("p", "cloud-hopper-personal-best");
    scoresStatus.setAttribute("role", "status");
    const actions = node("div", "actions"), back = node("button", "", "Back"), play = node("button", "game-intro-go"), exit = node("button", "");
    const next = node("button", "game-intro-go", "Next level"), select = node("button", "", "Level select");
    // Each button is coloured by what it does (the stylesheet's `data-role`): go on, choose, step back, or leave; the
    // exit button becomes Back while a result card picks a level.
    play.dataset.role = next.dataset.role = "go"; select.dataset.role = "choose"; back.dataset.role = "back"; exit.dataset.role = "leave";
    // One picture card a level: its number in the picture's corner, its name alone on a row, then its route and
    // the player's best or what unlocks it. Pictures load the first time the cards show, and the player's own Ooga
    // stands on the cloud of each level they have finished (`setRunner`), painted once per Ooga.
    const LEVELS = BL.cloudHopperLevels.LEVELS, levels = node("div", "cloud-hopper-levels"), cards = [], OOGA_W = 96, OOGA_H = 128;
    for (const level of LEVELS) {
      const card = node("button", "cloud-hopper-level"), frame = node("span", "cloud-hopper-level-frame");
      const picture = node("img", "cloud-hopper-level-art"), ooga = node("canvas", "cloud-hopper-level-ooga"), note = node("small", "cloud-hopper-level-note");
      card.type = "button"; picture.alt = ""; picture.draggable = false;
      picture.onerror = (event) => { event.currentTarget.hidden = true; };
      ooga.width = OOGA_W; ooga.height = OOGA_H; ooga.setAttribute("aria-hidden", "true");
      frame.append(picture, ooga);
      card.append(frame, node("span", "cloud-hopper-level-number", String(level.id)), node("b", "cloud-hopper-level-name", level.name), note);
      card.addEventListener("click", () => onSelect?.(level.id));
      levels.append(card); cards.push({ card, picture, ooga, note, level });
    }
    let runner = "";
    const setRunner = (cave) => {
      if (disposed || runner === cave.traits.name) return;
      runner = cave.traits.name;
      const scratch = document.createElement("canvas");
      BL.hud.renderBodyIcon(scratch, cave, OOGA_W, OOGA_H, false);
      for (const { ooga } of cards) {
        const paint = ooga.getContext("2d");
        paint.clearRect(0, 0, OOGA_W, OOGA_H); paint.drawImage(scratch, 0, 0, OOGA_W, OOGA_H);
      }
      scratch.width = scratch.height = 1;
    };
    levels.setAttribute("role", "group"); levels.setAttribute("aria-label", "Levels");
    timer.setAttribute("aria-label", "Elapsed time");
    timer.setAttribute("aria-live", "off");
    title.setAttribute("role", "status");
    panelTitle.id = "cloud-hopper-title";
    goal.id = "cloud-hopper-goal";
    resultArt.id = "cloud-hopper-result-art";
    resultArt.hidden = true;
    panelHelp.id = "cloud-hopper-panel-help";
    panelHelp.setAttribute("aria-live", "polite");
    scoresTitle.id = "cloud-hopper-scores-title";
    panel.setAttribute("aria-labelledby", panelTitle.id);
    panel.setAttribute("aria-describedby", goal.id);
    scoresPanel.setAttribute("aria-labelledby", scoresTitle.id);
    guideArt.setAttribute("role", "img");
    introArt.alt = "An Ooga racing between clouds toward the island below.";
    introArt.draggable = resultArt.draggable = false;
    // A hosted page serves the art as files under art/, fetched when a card first shows one; a picture that cannot be
    // fetched leaves its card without it rather than a broken image, and the next card asks again.
    introArt.onerror = resultArt.onerror = (event) => { event.currentTarget.hidden = true; };
    introArt.hidden = guideArt.hidden = back.hidden = true;
    glow.setAttribute("aria-hidden", "true");
    resultTime.setAttribute("aria-label", "Finish time");
    back.type = play.type = exit.type = next.type = select.type = "button";
    if (letterSign) letterSign(panelTitle, "CLOUD HOPPER");
    glow.append(rays);
    const scoreRows = [];
    for (let i = 0; i < 10; i++) {
      const row = node("li", ""), rank = node("span", "cloud-hopper-score-rank", String(i + 1));
      const run = node("span", ""), time = node("strong", "");
      row.append(rank, run, time);
      scoresList.append(row);
      scoreRows.push({ row, run, time });
    }
    document.getElementById("jetpack-hud")?.after(xrayChip, featherChip, hookChip);
    // A gust's cue at the edge of the screen it comes from, its arrows pointing the way it blows.
    const gustCue = node("div", "cloud-hopper-gust"), gustArrows = node("div", "cloud-hopper-gust-arrows");
    for (let i = 0; i < 3; i++) gustArrows.append(node("i", ""));
    gustCue.append(node("span", "cloud-hopper-gust-word", "GUST"), gustArrows);
    gustCue.setAttribute("aria-hidden", "true"); gustCue.hidden = true;
    // The lines under the clock (what to do, the ghost, the keys), folded up into the clock once the run starts.
    const brief = node("div", "cloud-hopper-brief"), briefLines = node("div");
    const instructions = node("div", "cloud-hopper-brief"), instructionLines = node("div");
    briefLines.append(title); brief.append(briefLines);
    instructionLines.append(help); instructions.append(instructionLines);
    hud.append(name, timer, brief, record, instructions);
    scoresPanel.append(scoresTitle, scoresStatus, scoresList, uploads, personalBest);
    actions.append(back, next, play, cabinetScores, select, exit);
    panel.append(glow, kicker, panelTitle, goal, levels, introArt, guideArt, resultArt, panelHelp, resultTime, scoresPanel, actions);
    hud.hidden = panel.hidden = levels.hidden = next.hidden = select.hidden = true;
    document.body.append(hud, panel, gustCue);
    let phase = "", hundredths = -1, previousFocus = null, disposed = false, frameY = 0.4;
    // The guide's cards this time (`setGuide`): the cloud guide, then the items new to this session's level.
    let guideIndex = 0, guidePictures = null, spaceTarget = null, guide = GUIDE;
    let shownXray = -2, shownFeather = false, shownHook = -2, shownGust = "calm", shownFrom = false;
    // The level choice: the one selected, the highest unlocked, the player's best per level (ms, 0 for none), and
    // whether the result card is showing the cards instead of the result (Level select).
    // `pickedFrom`: the level a result card's Level select opened on, which Back goes back to.
    let selected = 1, unlocked = 1, bests = [], picking = false, pickedFrom = 1;
    const locked = () => selected > unlocked;
    const nextOpen = () => phase === "won" && !picking && selected < LEVELS.length && selected + 1 <= unlocked;
    const paintLevels = () => {
      for (const { card, picture, ooga, note, level } of cards) {
        const closed = level.id > unlocked, best = bests[level.id - 1] || 0;
        ooga.hidden = !best;
        card.classList.toggle("selected", level.id === selected);
        card.classList.toggle("locked", closed);
        card.setAttribute("aria-pressed", level.id === selected ? "true" : "false");
        note.textContent = closed ? `Complete Level ${level.id - 1} to unlock`
          : `${Math.round(level.route)} m · ${best ? `Best ${formatTime(Math.floor(best / 10))}` : "New"}`;
        if (!levels.hidden && !picture.src) picture.src = BL.cloudHopperArt.levels[level.id - 1];
      }
      name.textContent = `CLOUD HOPPER · LEVEL ${selected}`;
      showScores(localScores, localLatest);
      if (phase === "intro" || picking) {
        play.disabled = locked();
        play.textContent = phase === "intro" ? "Play" : `Play level ${selected}`;
        if (locked()) panelHelp.textContent = `Complete Level ${selected - 1} to unlock ${LEVELS[selected - 1].name}.`;
        else panelHelp.textContent = phase === "intro" ? COPY.intro[1] : `${LEVELS[selected - 1].name} · ${Math.round(LEVELS[selected - 1].route)} m`;
      }
    };
    const setLevels = (state) => {
      if (disposed) return;
      if (selected !== state.selected) { sharedScores = null; submissions = []; sharedStatus = "loading"; }
      ({ selected, unlocked, bests } = state);
      paintLevels();
      // The board under the cards follows the level chosen.
      if (phase === "intro" || picking) showScores(localScores, localLatest);
    };
    // Measure on layout changes only. Leave room below the card for the
    // island's skyline, with the same horizontal centre as the timer.
    const measureFraming = () => {
      if (hud.hidden) return;
      frameY = Math.min(0.85, Math.max(0.4, (hud.getBoundingClientRect().bottom + 24) / Math.max(1, window.innerHeight) + 0.07));
    };
    window.addEventListener("resize", measureFraming);
    const update = (time) => {
      const value = Math.max(0, Math.floor(time * 100));
      if (value === hundredths) return;
      hundredths = value;
      const text = formatTime(value);
      timer.textContent = text;
      resultTime.textContent = text;
    };
    const showGuide = () => {
      const [kind, name, text] = guide[guideIndex];
      kicker.textContent = `Cloud guide · ${guideIndex + 1} of ${guide.length}`;
      if (letterSign) letterSign(panelTitle, name);
      else panelTitle.textContent = name;
      panelHelp.textContent = text;
      guideArt.setAttribute("aria-label", name);
      if (!guidePictures) guidePictures = BL.cloudHopperModels.createGuidePictures();
      const picture = guidePictures.picture(kind);
      picture.setAttribute("aria-hidden", "true");
      guideArt.replaceChildren(picture);
      back.disabled = guideIndex === 0;
      play.textContent = guideIndex === guide.length - 1 ? "Let's go" : "Next";
      panel.scrollTop = 0;
    };
    // Every card of the guide stands at its tallest one's size, so its buttons stay put from card to card; measured
    // as the guide opens and when the window changes.
    const fitGuide = () => {
      if (phase !== "briefing" || !panel.open) return;
      panelTitle.style.minHeight = panelHelp.style.minHeight = "";
      let title = 0, help = 0;
      for (const [, name, text] of guide) {
        if (letterSign) letterSign(panelTitle, name);
        else panelTitle.textContent = name;
        panelHelp.textContent = text;
        title = Math.max(title, panelTitle.offsetHeight); help = Math.max(help, panelHelp.offsetHeight);
      }
      panelTitle.style.minHeight = title + "px"; panelHelp.style.minHeight = help + "px";
      showGuide();
    };
    window.addEventListener("resize", fitGuide);
    const previous = () => {
      if (phase === "briefing" && guideIndex > 0) { guideIndex--; showGuide(); }
    };
    const start = () => {
      if (phase === "intro") { if (!locked()) onStart?.(); }
      else if (phase === "won" || phase === "dq") { if (!picking || !locked()) onReplay?.(); }
      else if (phase === "briefing") {
        if (guideIndex < guide.length - 1) { guideIndex++; showGuide(); }
        else onGuideDone?.();
      }
    };
    const leave = () => {
      if (phase === "briefing") onGuideDone?.();
      else if (picking) pick(false);
      else if (phase === "intro" || phase === "won" || phase === "dq") onExit?.();
    };
    const advance = () => { if (nextOpen()) onNext?.(); };
    const choose = () => pick(true);
    // Escape backs out of the opening menu (as Not now does) and the briefing; the other cards stay up for their buttons.
    const cancel = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (phase === "briefing" || phase === "intro") onExit?.();
    };
    const clearActivation = () => { spaceTarget = null; };
    const panelKey = (e) => {
      // M remains available to the director's voice shortcut; other keys stay in the game-state card.
      if (e.key.toLowerCase() === "m") return;
      e.stopPropagation();
      if (e.key === "Shift") { clearActivation(); e.preventDefault(); return; }
      if (e.key === "Enter" || e.key === " ") {
        // A fresh Enter or Space on a level card plays that level, as Play would (a locked one stays put).
        const card = e.target.closest?.(".cloud-hopper-level"), modifiedCard = e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing;
        if (card && !modifiedCard && (e.key === "Enter" ? e.type === "keydown" && !e.repeat : e.type === "keyup" && spaceTarget === e.target)) {
          e.preventDefault(); clearActivation();
          onSelect?.(cards.find(each => each.card === card).level.id);
          start();
          return;
        }
        if (card && e.key === "Enter") { e.preventDefault(); return; }
        // Focus moves here while sprint/jump may still be held. Only a fresh,
        // unmodified press may activate a button; an orphan Space release
        // must not become a click on the newly focused Play Again button.
        const modified = e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing;
        if (modified) clearActivation();
        if (e.type === "keydown") {
          if (e.repeat || modified) e.preventDefault();
          else if (e.key === " ") spaceTarget = e.target;
        } else if (e.key === " ") {
          if (modified || spaceTarget !== e.target) e.preventDefault();
          clearActivation();
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (e.type === "keydown" && (phase === "briefing" || phase === "intro")) onExit?.();
        else if (e.type === "keydown" && picking) pick(false);
        return;
      }
      // Arrows move between the level cards wherever they show.
      const step = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : 0;
      if (step && !levels.hidden) {
        e.preventDefault();
        if (e.type === "keydown") onSelect?.(Math.max(1, Math.min(LEVELS.length, selected + step)));
      }
    };
    back.addEventListener("click", previous);
    play.addEventListener("click", start);
    exit.addEventListener("click", leave);
    next.addEventListener("click", advance);
    select.addEventListener("click", choose);
    panel.addEventListener("cancel", cancel);
    panel.addEventListener("keydown", panelKey);
    panel.addEventListener("keyup", panelKey);
    panel.addEventListener("focusout", clearActivation);
    window.addEventListener("blur", clearActivation);
    const closePanel = () => {
      clearActivation();
      if (!panel.open) return;
      panel.close();
      panel.hidden = true;
      if (previousFocus?.isConnected && typeof previousFocus.focus === "function") previousFocus.focus({ preventScroll: true });
      previousFocus = null;
    };
    let sharedScores = null, submissions = [], sharedStatus = "loading", localScores = [], localLatest = null;
    const showScores = (scores, latest) => {
      localScores = scores; localLatest = latest;
      scoresTitle.textContent = `Level ${selected} · ${LEVELS[selected - 1].name} · shared top 10`;
      scoresStatus.textContent = sharedStatus === "loading" ? "Loading shared times…"
        : sharedStatus === "refreshing" ? "Updating · showing last shared times"
        : sharedStatus === "stale" ? "Shared times may be out of date · refresh unavailable"
        : sharedStatus === "unavailable" ? "Shared leaderboard unavailable"
        : "All players · fastest times";
      const leader = sharedScores?.[0];
      recordText.textContent = leader ? `Global best · ${leader.username}`
        : sharedStatus === "ready" ? "No times yet" : sharedStatus === "unavailable" ? "Global best unavailable" : "Loading global best…";
      recordTime.textContent = leader ? formatTime(Math.floor(leader.milliseconds / 10))
        + (sharedStatus === "stale" ? " · may be out of date" : sharedStatus === "refreshing" ? " · updating" : "") : "";
      recordText.title = recordText.textContent;
      // Only the shared replay controller can enable this control; personal bests supply no ghost.
      recordGhost.hidden = !leader;
      const best = bests[selected - 1] || 0;
      personalBest.textContent = `Your best on this browser · ${best ? formatTime(Math.floor(best / 10)) : "no finish yet"}`;
      // Pending uploads join the ranking provisionally; the global record and ghost above stay confirmed.
      scores = [...(sharedScores || [])];
      for (const pending of submissions) if (pending.status === "saving" && !scores.some(run => run.id && run.id === pending.id)) {
        let at = 0;
        while (at < scores.length && scores[at].milliseconds <= pending.score) at++;
        scores.splice(at, 0, { ...pending, milliseconds: pending.score, time: pending.score / 1000 });
      }
      uploads.hidden = !submissions.length;
      uploads.textContent = submissions.map(run => `${formatTime(Math.floor(run.score / 10))} · ${run.status === "saving"
        ? "saving... · provisional position" : "couldn’t be uploaded · kept on this browser"}`).join(" · ");
      const count = Math.min(scoreRows.length, scores.length);
      for (let i = 0; i < scoreRows.length; i++) {
        const { row, run, time } = scoreRows[i];
        row.classList.toggle("empty", i >= count);
        if (i >= count) { row.classList.remove("you"); run.textContent = time.textContent = "—"; continue; }
        const record = scores[i];
        row.classList.toggle("you", record.username.toLowerCase() === BL.net.state.me?.login.toLowerCase());
        run.textContent = record.username + (record.status === "saving" ? " · saving..." : "");
        run.title = record.username;
        time.textContent = formatTime(Math.max(0, Math.floor(record.time * 100)));
      }
    };
    const setSubmissions = (value) => {
      if (disposed) return;
      submissions = value; showScores(localScores, localLatest);
    };
    const setHighscoreStatus = (status) => {
      if (disposed) return;
      sharedStatus = status;
      showScores(localScores, localLatest);
    };
    const setHighscores = (board) => {
      if (disposed) return;
      sharedStatus = board ? "ready" : "loading";
      const runs = board && (board.runs || Object.entries(board.highscores)
        .map(([username, score]) => ({ username, score, achieved: board.achieved?.[username] || 0 }))
        .sort((a, b) => a.score - b.score || a.achieved - b.achieved || a.username.localeCompare(b.username)));
      sharedScores = runs ? runs.slice(0, scoreRows.length)
        .map(run => ({ ...run, milliseconds: run.score, time: run.score / 1000 })) : null;
      showScores(localScores, localLatest);
    };
    // Level select on the result card: the level cards in place of the result, or the result back again.
    const pick = (on) => {
      picking = on;
      clearActivation();
      // Back from choosing puts the played level back, its board and its song with it.
      if (on) pickedFrom = selected;
      else if (selected !== pickedFrom) onSelect?.(pickedFrom);
      panel.classList.toggle("cloud-hopper-picking", on);
      const ended = phase === "won" || phase === "dq";
      // The level just played names the result; choosing another, the line says what the race is, as the intro's does.
      goal.textContent = on ? COPY.intro[0] : `Level ${pickedFrom} · ${LEVELS[pickedFrom - 1].name}`;
      goal.hidden = !ended;
      levels.hidden = !on && phase !== "intro";
      resultArt.hidden = on || !ended;
      resultTime.hidden = on || phase !== "won";
      scoresPanel.hidden = !ended;
      select.hidden = on || !ended;
      next.hidden = !nextOpen();
      play.classList.toggle("game-intro-go", on || !nextOpen());
      play.disabled = false;
      exit.textContent = on ? "Back" : "Return to arcade"; exit.dataset.role = on ? "back" : "leave";
      showScores(localScores, localLatest);
      if (on) paintLevels();
      else {
        play.textContent = phase === "won" ? "Replay" : "Play again";
        resultHelp();
      }
      (on ? play : nextOpen() ? next : play).focus({ preventScroll: true });
    };
    let helpText = "";
    // How the next lost run was lost: "water" or "tornado" (`setDq`).
    let dqKind = "water";
    const setDq = (kind) => { dqKind = kind; };
    const resultHelp = () => { panelHelp.textContent = helpText; };
    const show = (to, time = 0, scores = [], latest = null) => {
      if (disposed || !COPY[to]) return;
      update(time);
      const ended = to === "won" || to === "dq";
      if (ended || to === "intro") showScores(scores, latest);
      if (phase === to) return;
      phase = to; picking = false;
      showScores(localScores, localLatest);
      clearActivation();
      panel.classList.remove("cloud-hopper-picking", "cabinet-scores-open");
      cabinetScores.dataset.role = "choose"; cabinetScores.textContent = "Leaderboard"; cabinetScores.setAttribute("aria-expanded", "false");
      const copy = to === "dq" && dqKind === "tornado" ? COPY.swept : COPY[to], intro = to === "intro", briefing = to === "briefing";
      panel.classList.toggle("cloud-hopper-dq", to === "dq");
      panel.classList.toggle("cloud-hopper-intro", intro);
      panel.classList.toggle("cloud-hopper-guide", briefing);
      title.textContent = copy[0];
      help.textContent = copy[1];
      hud.hidden = intro || to === "lifting" || briefing || ended;
      hud.classList.toggle("cloud-hopper-running", to === "running");
      if (briefing) {
        // The ascent frames for the ready HUD even while the guide covers it.
        // This synchronous measurement never paints the waiting race clock.
        title.textContent = COPY.ready[0]; help.textContent = COPY.ready[1];
        hud.hidden = false; measureFraming(); hud.hidden = true;
      }
      if (intro || briefing || ended) {
        // Equal times follow the earlier record, so only a new leader gets
        // the best-time illustration; the first clean finish sets that mark.
        const best = to === "won" && !!latest && latest.run === scores[0]?.run;
        kicker.textContent = "Ooga Arcade";
        if (letterSign) letterSign(panelTitle, "CLOUD HOPPER");
        else panelTitle.textContent = "CLOUD HOPPER";
        goal.textContent = ended ? `Level ${selected} · ${LEVELS[selected - 1].name}` : copy[0];
        goal.hidden = !intro && !ended;
        // The intro's level cards take the opening picture's place.
        introArt.hidden = true;
        levels.hidden = !intro;
        guideArt.hidden = back.hidden = !briefing;
        resultArt.hidden = !ended;
        if (ended) {
          const swept = to === "dq" && dqKind === "tornado", art = BL.cloudHopperArt[swept ? "swept" : to === "dq" ? "rekt" : best ? "best" : "complete"];
          // The tornado's picture is still to come; until it does its card shows none.
          resultArt.hidden = !art;
          if (art) resultArt.src = art;
          resultArt.alt = swept ? "Ooga flung spinning out of the top of the tornado." : to === "dq" ? "Ooga rekt underwater after the fall."
            : best ? "Ooga celebrating a new session best time." : "Ooga celebrating a completed run at the banana pile.";
        }
        panel.setAttribute("aria-describedby", ended ? `${resultArt.id} ${panelHelp.id}` : intro ? `${goal.id} ${panelHelp.id}` : panelHelp.id);
        // A clean finish says what it earned: a session best, a personal best, the next level.
        helpText = [best && "New session best!", latest?.personalBest && !best && "New personal best!",
          latest?.unlocked && `Level ${selected + 1} unlocked!`].filter(Boolean).join(" ") || copy[1];
        panelHelp.textContent = helpText;
        scoresPanel.hidden = !ended && !intro;
        resultTime.hidden = to !== "won";
        play.disabled = false;
        play.textContent = intro ? "Play" : to === "won" ? "Replay" : "Play again";
        exit.textContent = briefing ? "Skip tips" : intro ? "Not now" : "Return to arcade"; exit.dataset.role = "leave";
        next.hidden = !nextOpen();
        select.hidden = !ended;
        play.classList.toggle("game-intro-go", !nextOpen());
        if (intro) paintLevels();
        if (briefing) { guideIndex = 0; showGuide(); }
        if (!panel.open) {
          previousFocus = document.activeElement;
          panel.hidden = false;
          // Arcade voice/player tabs remain usable beside the game card.
          if (document.body.classList.contains("arcade-game")) panel.show();
          else panel.showModal();
          panel.scrollTop = 0;
        }
        if (briefing) fitGuide();
        else panelTitle.style.minHeight = panelHelp.style.minHeight = "";
        (nextOpen() ? next : play).focus({ preventScroll: true });
      } else closePanel();
      measureFraming();
    };
    const hide = () => { phase = ""; hud.hidden = true; closePanel(); };
    const dispose = () => {
      if (disposed) return;
      hide(); disposed = true;
      back.removeEventListener("click", previous);
      next.removeEventListener("click", advance);
      select.removeEventListener("click", choose);
      play.removeEventListener("click", start);
      exit.removeEventListener("click", leave);
      recordGhost.removeEventListener("click", toggleGhost);
      panel.removeEventListener("cancel", cancel);
      panel.removeEventListener("keydown", panelKey);
      panel.removeEventListener("keyup", panelKey);
      panel.removeEventListener("focusout", clearActivation);
      window.removeEventListener("blur", clearActivation);
      window.removeEventListener("resize", measureFraming);
      window.removeEventListener("resize", fitGuide);
      guidePictures?.dispose(); guidePictures = null;
      hud.remove(); panel.remove(); xrayChip.remove(); featherChip.remove(); hookChip.remove(); gustCue.remove();
    };
    // The guide's next cards: the cloud guide unless `cloud` is false, then each new thing named in `items`.
    const setGuide = (cloud, items) => {
      guide = cloud ? GUIDE.concat(items.map(kind => ITEMS[kind])) : items.map(kind => ITEMS[kind]);
    };
    // X-ray's whole seconds left (-1 off), whether a feather is held, and the hook (-1 none, 0 held, 1 thrown). Text
    // changes only when a figure does; X-ray blinks its last two seconds.
    const setPowers = (xray, feather, hook) => {
      if (disposed || xray === shownXray && feather === shownFeather && hook === shownHook) return;
      if (xray !== shownXray) {
        xrayChip.hidden = xray < 0;
        if (xray >= 0) { xrayReadout.textContent = String(xray); xrayChip.setAttribute("aria-label", `X-ray goggles · ${xray} s left`); }
        xrayChip.classList.toggle("ending", xray >= 0 && xray < 2);
      }
      featherChip.hidden = !feather;
      hookChip.hidden = hook < 0;
      hookChip.classList.toggle("thrown", hook > 0);
      hookReadout.textContent = hook > 0 ? "OUT" : "1";
      shownXray = xray; shownFeather = feather; shownHook = hook;
    };
    // A gust's state ("calm", "warning" or "blowing") and whether it comes from the screen's left; the cue changes only
    // when either does.
    const setGust = (state, fromLeft) => {
      if (disposed || state === shownGust && fromLeft === shownFrom) return;
      gustCue.hidden = state === "calm";
      gustCue.dataset.state = state; gustCue.dataset.from = fromLeft ? "left" : "right";
      shownGust = state; shownFrom = fromLeft;
    };
    return { show, update, setHighscores, setHighscoreStatus, setSubmissions, setReplayState, setLevels, setRunner, setGuide, setPowers, setGust, setDq, hide, dispose, get frameY() { return frameY; } };
  };
  BL.cloudHopperHud = { create };
})();
