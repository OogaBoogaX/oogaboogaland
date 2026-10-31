// A retained clock and title/results card for Cloud Hopper, with its level cards; the controller owns all game state.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const COPY = {
    intro: ["Race from the clouds to the banana pile", "Find your route. Race for the top of the leaderboard."],
    lifting: ["Going up", "Your starting cloud is on its way."],
    briefing: ["Before you jump", "Meet the clouds and gear along the way."],
    ready: ["Race to the banana pile", "Leave this cloud to start · J toggles a collected jetpack. Extra packs refill fuel."],
    running: ["Reach the banana pile", "Space jumps / holds jetpack lift · release to fall · J toggles your jetpack"],
    won: ["Banana pile reached!", "A clean landing and a time to beat."],
    dq: ["Disqualified", "Splash! No cloud was within reach."]
  };
  const GUIDE = [
    ["normal", "Drifting clouds", "WASD or arrows move, Shift runs and Space jumps. Leave the starting cloud to start the clock. A cloud shimmers and whistles before it fades, so jump for one that isn't shimmering; some clouds never fade at all."],
    ["boost", "Boost clouds", "Touch any part of a pink cloud, even its sides or underside, to launch toward the island. The white arrows point the way."],
    ["bounce", "Bounce clouds", "Touch any part of a purple cloud to bounce high into the air. Steer toward your next landing while airborne."],
    ["jetpack", "Jetpacks", "Collect a pack, then use J to equip or stow it. Hold Space for lift. Extra packs refill fuel; it never regenerates, and an empty pack disappears."],
    ["finish", "Banana pile", "Land on the banana pile to stop the clock. Your fastest finish becomes a ghost you can race next time."]
  ];
  const formatTime = (value) => `${String(Math.floor(value / 6000)).padStart(2, "0")}:${String(Math.floor(value / 100) % 60).padStart(2, "0")}.${String(value % 100).padStart(2, "0")}`;
  const create = ({ onStart, onReplay, onExit, onGuideDone, onSelect, onNext, letterSign } = {}) => {
    const node = (tag, className, text = "") => {
      const el = document.createElement(tag);
      el.className = className;
      el.textContent = text;
      return el;
    };
    const hud = node("section", "cloud-hopper-hud"), name = node("div", "cloud-hopper-name", "CLOUD HOPPER");
    const timer = node("output", "cloud-hopper-time", "00:00.00"), title = node("div", "cloud-hopper-status");
    const ghost = node("p", "cloud-hopper-help", "Finish a run to set your ghost");
    const help = node("p", "cloud-hopper-help"), panel = node("dialog", "race-results game-intro cloud-hopper-panel");
    const glow = node("div", "game-intro-glow"), rays = node("div", "game-intro-rays");
    const kicker = node("p", "game-intro-kicker", "Ooga Arcade"), panelTitle = node("h2", "game-intro-title", "CLOUD HOPPER");
    const goal = node("p", "game-intro-goal"), panelHelp = node("p", "game-intro-who");
    const introArt = node("img", "cloud-hopper-intro-art"), guideArt = node("div", "cloud-hopper-guide-art");
    const resultArt = node("img", "cloud-hopper-result-art");
    const resultTime = node("p", "cloud-hopper-time"), scoresPanel = node("section", "cloud-hopper-scores");
    const scoresTitle = node("h3", "cloud-hopper-scores-title", "Your best times · this session");
    const scoresList = node("ol", "race-podium"), scoresEmpty = node("p", "cloud-hopper-scores-empty", "Finish a run to put your time on the board.");
    const actions = node("div", "actions"), back = node("button", "", "Back"), play = node("button", "game-intro-go"), exit = node("button", "");
    const next = node("button", "game-intro-go", "Next level"), select = node("button", "", "Level select"), leaders = node("button", "", "Leaderboard");
    // One picture card a level: its number in the picture's corner, its name alone on a row, then its route and
    // the player's best or what unlocks it. Pictures load the first time the cards show, and the player's own Ooga
    // stands on each one's cloud (`setRunner`), painted once per Ooga.
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
      BL.hud.renderBodyIcon(scratch, cave, OOGA_W, OOGA_H);
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
    back.type = play.type = exit.type = next.type = select.type = leaders.type = "button";
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
    hud.append(name, timer, title, ghost, help);
    scoresPanel.append(scoresTitle, scoresList, scoresEmpty);
    actions.append(back, next, play, leaders, select, exit);
    panel.append(glow, kicker, panelTitle, goal, levels, introArt, guideArt, resultArt, panelHelp, resultTime, scoresPanel, actions);
    hud.hidden = panel.hidden = levels.hidden = next.hidden = select.hidden = leaders.hidden = true;
    document.body.append(hud, panel);
    let phase = "", hundredths = -1, previousFocus = null, disposed = false, frameY = 0.4;
    let guideIndex = 0, guidePictures = null, spaceTarget = null;
    // The level choice: the one selected, the highest unlocked, the player's best per level (ms, 0 for none), and
    // whether the result card is showing the cards instead of the result (Level select).
    let selected = 1, unlocked = 1, bests = [], picking = false;
    // The intro's Leaderboard shows the selected level's board under the cards: the shared one when the page has it,
    // else the bests every player has set on this browser (`browser`, fastest first).
    let boarding = false, browser = [];
    const locked = () => selected > unlocked;
    const nextOpen = () => phase === "won" && !picking && selected < LEVELS.length && selected + 1 <= unlocked;
    const paintLevels = () => {
      for (const { card, picture, note, level } of cards) {
        const closed = level.id > unlocked, best = bests[level.id - 1] || 0;
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
      ({ selected, unlocked, bests, browser } = state);
      paintLevels();
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
    const setGhost = (time) => {
      if (disposed) return;
      ghost.textContent = Number.isFinite(time)
        ? `Best ghost · ${formatTime(Math.max(0, Math.floor(time * 100)))} · original route` : "Finish a run to set your ghost";
    };
    const showGuide = () => {
      const [kind, name, text] = GUIDE[guideIndex];
      kicker.textContent = `Cloud guide · ${guideIndex + 1} of ${GUIDE.length}`;
      if (letterSign) letterSign(panelTitle, name);
      else panelTitle.textContent = name;
      panelHelp.textContent = text;
      guideArt.setAttribute("aria-label", name);
      if (!guidePictures) guidePictures = BL.cloudHopperModels.createGuidePictures();
      const picture = guidePictures.picture(kind);
      picture.setAttribute("aria-hidden", "true");
      guideArt.replaceChildren(picture);
      back.disabled = guideIndex === 0;
      play.textContent = guideIndex === GUIDE.length - 1 ? "Let's go" : "Next";
      panel.scrollTop = 0;
    };
    const previous = () => {
      if (phase === "briefing" && guideIndex > 0) { guideIndex--; showGuide(); }
    };
    const start = () => {
      if (phase === "intro") { if (!locked()) onStart?.(); }
      else if (phase === "won" || phase === "dq") { if (!picking || !locked()) onReplay?.(); }
      else if (phase === "briefing") {
        if (guideIndex < GUIDE.length - 1) { guideIndex++; showGuide(); }
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
    const cancel = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (phase === "briefing") onExit?.();
    };
    const clearActivation = () => { spaceTarget = null; };
    const panelKey = (e) => {
      // M remains available to the director's voice shortcut; other keys stay in the game-state card.
      if (e.key.toLowerCase() === "m") return;
      e.stopPropagation();
      if (e.key === "Shift") { clearActivation(); e.preventDefault(); return; }
      if (e.key === "Enter" || e.key === " ") {
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
        if (e.type === "keydown" && phase === "briefing") onExit?.();
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
    let sharedScores = null, localScores = [], localLatest = null;
    const showScores = (scores, latest) => {
      localScores = scores; localLatest = latest;
      const onBrowser = !sharedScores && boarding && phase === "intro";
      if (sharedScores) scores = sharedScores;
      else if (onBrowser) scores = browser;
      scoresTitle.textContent = sharedScores ? `Level ${selected} · fastest times · all players`
        : onBrowser ? `Level ${selected} · best times on this browser` : `Level ${selected} · your best times this session`;
      scoresEmpty.textContent = sharedScores ? "No shared times yet. Sign in with GitHub to set one."
        : onBrowser ? "No finishes on this browser yet." : "Finish a run to put your time on the board.";
      const count = Math.min(scoreRows.length, scores.length);
      scoresList.hidden = !count;
      scoresEmpty.hidden = !!count;
      for (let i = 0; i < scoreRows.length; i++) {
        const { row, run, time } = scoreRows[i];
        row.hidden = i >= count;
        if (row.hidden) continue;
        const record = scores[i], current = sharedScores ? record.username.toLowerCase() === BL.net.state.me?.login.toLowerCase()
          : onBrowser ? record.you : latest?.run === record.run;
        row.classList.toggle("you", current);
        run.textContent = record.username || "Guest";
        time.textContent = formatTime(Math.max(0, Math.floor(record.time * 100)));
      }
    };
    const setHighscores = (board) => {
      if (disposed) return;
      sharedScores = board ? Object.entries(board.highscores).map(([username, score]) => ({ username, time: score / 1000, achieved: board.achieved?.[username] || 0 }))
        .sort((a, b) => a.time - b.time || a.achieved - b.achieved || a.username.localeCompare(b.username)).slice(0, scoreRows.length) : null;
      showScores(localScores, localLatest);
    };
    const toggleBoard = () => {
      if (phase !== "intro") return;
      boarding = !boarding;
      scoresPanel.hidden = !boarding;
      leaders.setAttribute("aria-pressed", boarding ? "true" : "false");
      showScores(localScores, localLatest);
    };
    leaders.addEventListener("click", toggleBoard);
    // Level select on the result card: the level cards in place of the result, or the result back again.
    const pick = (on) => {
      picking = on;
      clearActivation();
      panel.classList.toggle("cloud-hopper-picking", on);
      const ended = phase === "won" || phase === "dq";
      levels.hidden = !on && phase !== "intro";
      resultArt.hidden = on || !ended;
      resultTime.hidden = on || phase !== "won";
      scoresPanel.hidden = on || !ended;
      select.hidden = on || !ended;
      next.hidden = !nextOpen();
      play.classList.toggle("game-intro-go", on || !nextOpen());
      play.disabled = false;
      exit.textContent = on ? "Back" : "Return to dock";
      if (on) paintLevels();
      else {
        play.textContent = phase === "won" ? "Replay" : "Play again";
        resultHelp();
      }
      (on ? play : nextOpen() ? next : play).focus({ preventScroll: true });
    };
    let helpText = "";
    const resultHelp = () => { panelHelp.textContent = helpText; };
    const show = (to, time = 0, scores = [], latest = null) => {
      if (disposed || !COPY[to]) return;
      update(time);
      const ended = to === "won" || to === "dq";
      if (ended || to === "intro") showScores(scores, latest);
      if (phase === to) return;
      phase = to; picking = false;
      clearActivation();
      panel.classList.remove("cloud-hopper-picking");
      const copy = COPY[to], intro = to === "intro", briefing = to === "briefing";
      panel.classList.toggle("cloud-hopper-dq", to === "dq");
      panel.classList.toggle("cloud-hopper-intro", intro);
      panel.classList.toggle("cloud-hopper-guide", briefing);
      title.textContent = copy[0];
      help.textContent = copy[1];
      hud.hidden = intro || briefing || ended;
      timer.hidden = to === "lifting";
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
          resultArt.src = BL.cloudHopperArt[to === "dq" ? "rekt" : best ? "best" : "complete"];
          resultArt.alt = to === "dq" ? "Ooga rekt underwater after the fall."
            : best ? "Ooga celebrating a new session best time." : "Ooga celebrating a completed run at the banana pile.";
        }
        panel.setAttribute("aria-describedby", ended ? `${resultArt.id} ${panelHelp.id}` : intro ? `${goal.id} ${panelHelp.id}` : panelHelp.id);
        // A clean finish says what it earned: a session best, a personal best, the next level.
        helpText = [best && "New session best!", latest?.personalBest && !best && "New personal best!",
          latest?.unlocked && `Level ${selected + 1} unlocked!`].filter(Boolean).join(" ") || copy[1];
        panelHelp.textContent = helpText;
        // The intro's board waits for its Leaderboard button.
        boarding = false;
        leaders.hidden = !intro; leaders.setAttribute("aria-pressed", "false");
        scoresPanel.hidden = !ended;
        resultTime.hidden = to !== "won";
        play.disabled = false;
        play.textContent = intro ? "Play" : to === "won" ? "Replay" : "Play again";
        exit.textContent = briefing ? "Skip tips" : intro ? "Not now" : "Return to dock";
        next.hidden = !nextOpen();
        select.hidden = !ended;
        play.classList.toggle("game-intro-go", !nextOpen());
        if (intro) paintLevels();
        if (briefing) { guideIndex = 0; showGuide(); }
        if (!panel.open) {
          previousFocus = document.activeElement;
          panel.hidden = false;
          panel.showModal();
          panel.scrollTop = 0;
        }
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
      leaders.removeEventListener("click", toggleBoard);
      select.removeEventListener("click", choose);
      play.removeEventListener("click", start);
      exit.removeEventListener("click", leave);
      panel.removeEventListener("cancel", cancel);
      panel.removeEventListener("keydown", panelKey);
      panel.removeEventListener("keyup", panelKey);
      panel.removeEventListener("focusout", clearActivation);
      window.removeEventListener("blur", clearActivation);
      window.removeEventListener("resize", measureFraming);
      guidePictures?.dispose(); guidePictures = null;
      hud.remove(); panel.remove();
    };
    return { show, update, setGhost, setHighscores, setLevels, setRunner, hide, dispose, get frameY() { return frameY; } };
  };
  BL.cloudHopperHud = { create };
})();
