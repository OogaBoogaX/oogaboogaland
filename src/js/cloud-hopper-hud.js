// A retained clock and title/results card for Cloud Hopper; the controller owns all game state.
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
    dq: ["Disqualified", "No landing within reach. Give the clouds another try."]
  };
  const GUIDE = [
    ["normal", "Drifting clouds", "WASD or arrows move, Shift runs and Space jumps. Leave the starting cloud to start the clock; the clouds will drift and fade beneath your feet."],
    ["boost", "Boost clouds", "Touch any part of a pink cloud, even its sides or underside, to launch toward the island. The white arrows point the way."],
    ["bounce", "Bounce clouds", "Touch any part of a purple cloud to bounce high into the air. Steer toward your next landing while airborne."],
    ["jetpack", "Jetpacks", "Collect a pack, then use J to equip or stow it. Hold Space for lift. Extra packs refill fuel; it never regenerates, and an empty pack disappears."],
    ["finish", "Banana pile", "Land on the banana pile to stop the clock. Your fastest finish becomes a ghost you can race next time."]
  ];
  const formatTime = (value) => `${String(Math.floor(value / 6000)).padStart(2, "0")}:${String(Math.floor(value / 100) % 60).padStart(2, "0")}.${String(value % 100).padStart(2, "0")}`;
  const create = ({ onStart, onReplay, onExit, onGuideDone, letterSign } = {}) => {
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
    back.type = play.type = exit.type = "button";
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
    actions.append(back, play, exit);
    panel.append(glow, kicker, panelTitle, goal, introArt, guideArt, resultArt, panelHelp, resultTime, scoresPanel, actions);
    hud.hidden = panel.hidden = true;
    document.body.append(hud, panel);
    let phase = "", hundredths = -1, previousFocus = null, disposed = false, frameY = 0.4;
    let guideIndex = 0, guidePictures = null, spaceTarget = null;
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
      if (phase === "intro") onStart?.();
      else if (phase === "won" || phase === "dq") onReplay?.();
      else if (phase === "briefing") {
        if (guideIndex < GUIDE.length - 1) { guideIndex++; showGuide(); }
        else onGuideDone?.();
      }
    };
    const leave = () => {
      if (phase === "briefing") onGuideDone?.();
      else if (phase === "intro" || phase === "won" || phase === "dq") onExit?.();
    };
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
      }
    };
    back.addEventListener("click", previous);
    play.addEventListener("click", start);
    exit.addEventListener("click", leave);
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
    const showScores = (scores, latest) => {
      const count = Math.min(scoreRows.length, scores.length);
      scoresList.hidden = !count;
      scoresEmpty.hidden = !!count;
      for (let i = 0; i < scoreRows.length; i++) {
        const { row, run, time } = scoreRows[i];
        row.hidden = i >= count;
        if (row.hidden) continue;
        const record = scores[i], current = latest?.run === record.run;
        row.classList.toggle("you", current);
        run.textContent = record.username || "Guest";
        time.textContent = formatTime(Math.max(0, Math.floor(record.time * 100)));
      }
    };
    const show = (next, time = 0, scores = [], latest = null) => {
      if (disposed || !COPY[next]) return;
      update(time);
      const ended = next === "won" || next === "dq";
      if (ended) showScores(scores, latest);
      if (phase === next) return;
      phase = next;
      clearActivation();
      const copy = COPY[next], intro = next === "intro", briefing = next === "briefing";
      panel.classList.toggle("cloud-hopper-dq", next === "dq");
      panel.classList.toggle("cloud-hopper-intro", intro);
      panel.classList.toggle("cloud-hopper-guide", briefing);
      title.textContent = copy[0];
      help.textContent = copy[1];
      hud.hidden = intro || briefing || ended;
      timer.hidden = next === "lifting";
      if (briefing) {
        // The ascent frames for the ready HUD even while the guide covers it.
        // This synchronous measurement never paints the waiting race clock.
        title.textContent = COPY.ready[0]; help.textContent = COPY.ready[1];
        hud.hidden = false; measureFraming(); hud.hidden = true;
      }
      if (intro || briefing || ended) {
        // Equal times follow the earlier record, so only a new leader gets
        // the best-time illustration; the first clean finish sets that mark.
        const best = next === "won" && !!latest && latest.run === scores[0]?.run;
        kicker.textContent = "Ooga Arcade";
        if (letterSign) letterSign(panelTitle, "CLOUD HOPPER");
        else panelTitle.textContent = "CLOUD HOPPER";
        goal.textContent = copy[0];
        goal.hidden = !intro;
        introArt.hidden = !intro;
        if (intro) introArt.src = BL.cloudHopperArt.intro;
        guideArt.hidden = back.hidden = !briefing;
        resultArt.hidden = !ended;
        if (ended) {
          resultArt.src = BL.cloudHopperArt[next === "dq" ? "rekt" : best ? "best" : "complete"];
          resultArt.alt = next === "dq" ? "Ooga rekt underwater after the fall."
            : best ? "Ooga celebrating a new session best time." : "Ooga celebrating a completed run at the banana pile.";
        }
        panel.setAttribute("aria-describedby", ended ? `${resultArt.id} ${panelHelp.id}` : intro ? `${goal.id} ${panelHelp.id}` : panelHelp.id);
        panelHelp.textContent = best ? "New session best!" : copy[1];
        scoresPanel.hidden = !ended;
        resultTime.hidden = next !== "won";
        play.textContent = intro ? "Start ride" : "Play again";
        exit.textContent = briefing ? "Skip tips" : intro ? "Not now" : "Return to dock";
        if (briefing) { guideIndex = 0; showGuide(); }
        if (!panel.open) {
          previousFocus = document.activeElement;
          panel.hidden = false;
          panel.showModal();
          play.focus({ preventScroll: true });
          panel.scrollTop = 0;
        }
      } else closePanel();
      measureFraming();
    };
    const hide = () => { phase = ""; hud.hidden = true; closePanel(); };
    const dispose = () => {
      if (disposed) return;
      hide(); disposed = true;
      back.removeEventListener("click", previous);
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
    return { show, update, setGhost, hide, dispose, get frameY() { return frameY; } };
  };
  BL.cloudHopperHud = { create };
})();
