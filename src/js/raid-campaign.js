// Ooga Raid's campaign: the stages played in order, one raid-sim at a time. No DOM, no scene: the scene feeds buttons in
// with `setInput`, steps it with `tick`, and draws `campaign.sim` and `campaign.state` out; the suite drives it in Node.
//
// `create({ seed, players, stages })` takes any non-empty list of stage objects (the scene passes the stages built so far)
// and starts the first. The controller owns the fixed step: `tick(dt)` banks frame time and runs at most MAX_SUBSTEPS of
// raid-sim's steps, dropping the rest, and `simulate(seconds)` runs whole steps with no frames. Each step runs one step of
// the current sim, then reads its phase:
//
// - play: the sim plays (PLAY or BOSS).
// - transition: the sim cleared a stage that is not the last. On the step it clears, the controller takes its carry and
//   pauses it, so nothing moves or scores under the stage card; the card shows for TUNE.TRANSITION, then the hand-over.
// - ending: the sim cleared the last stage. Its carry is taken and it is paused the same way, for TUNE.ENDING; then the
//   loop starts again at the first stage with `loops` one more, which the sim cuts the edge spawner by (to
//   RULES.SPAWN_LOOPS_MAX; `loops` counts on past it).
// - over: every player is out. `continueRun` spends one of the sim's continues and the sim starts the same stage again;
//   `endRun` ends.
// - end: the run is over.
//
// The hand-over passes the finished sim's `carry()`, taken as it cleared, unchanged (score, lives, next extra life, weapon, rapid fire, `out`
// and the shared continues) to the next stage's sim, where every carried Ooga drops in fresh and one out stays out,
// whatever it was doing when the stage cleared: dead with a life in reserve (`carry` spends that life), dropping in or
// invincible. The next sim is
// seeded with the finished one's dice, so a seed replays a whole campaign, and it takes the buttons held and each
// player's idle timer (raid-sim.js's `pIdle`). Making the
// next sim and its carry is the only allocation, once a stage; a step allocates nothing else.
//
// `pause(true)` stops the controller and its sim alike: `tick` runs nothing, banks nothing and returns 0. `pause(false)`
// leaves a cleared sim paused under its card.
//
// Shaman's Secrets: `cheats` (raid-sim's CHEAT bits, 0 for none) goes to every sim the campaign makes, and `start` (an
// index into `stages`, 0 by default) is the stage the run begins on, the tablet's stage select; the loop still starts
// again at the first stage.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { FIXED, MAX_SUBSTEPS, PHASE: SIM, create: createSim } = BL.raidSim;

  const PHASE = Object.freeze({ PLAY: "play", TRANSITION: "transition", ENDING: "ending", OVER: "over", END: "end" });
  // Seconds the stage card shows over the cleared stage, and the ending after the last stage.
  const TUNE = Object.freeze({ TRANSITION: 2, ENDING: 6 });
  const TRANSITION_STEPS = Math.round(TUNE.TRANSITION / FIXED), ENDING_STEPS = Math.round(TUNE.ENDING / FIXED);
  const EPS = 1e-4;

  const create = ({ seed = 1, players = 1, stages, cheats = 0, start = 0 } = {}) => {
    if (!Array.isArray(stages) || stages.length === 0) throw new Error("raid campaign: stages must be a non-empty list");
    if (!Number.isInteger(start) || start < 0 || start >= stages.length) throw new Error(`raid campaign: no stage ${start} to start on`);
    // `stageIndex` into `stages`, `loops` completed, `wait` the steps left in a transition or the ending, `acc` the frame
    // time banked, `paused` 1 while paused; `cheats` the run's CHEAT bits.
    const state = { phase: PHASE.PLAY, stageIndex: start, loops: 0, wait: 0, acc: 0, paused: 0, players, stageCount: stages.length, cheats };
    let sim = createSim({ seed, stage: stages[start], loops: 0, players, cheats }), carry = null;   // carry: the cleared sim's, for the hand-over

    // The controller's phase from the sim's, while it plays or is over.
    const follow = () => {
      const phase = sim.state.phase;
      if (phase === SIM.CLEAR) {
        const last = state.stageIndex === stages.length - 1;
        carry = sim.carry();
        sim.pause(true);
        state.phase = last ? PHASE.ENDING : PHASE.TRANSITION;
        state.wait = last ? ENDING_STEPS : TRANSITION_STEPS;
      } else if (phase === SIM.OVER) state.phase = PHASE.OVER;
      else if (phase === SIM.END) state.phase = PHASE.END;
      else state.phase = PHASE.PLAY;
    };
    const handOver = (index, loops) => {
      const held = sim.state.input, idle = sim.state.pIdle;
      sim = createSim({ seed: sim.state.randState, stage: stages[index], loops, players, carry, cheats });
      sim.state.pIdle.set(idle);   // a player idle, or not, stays so across the hand-over (raid-sim.js's two players)
      carry = null;
      for (let p = 0; p < players; p++) sim.setInput(held >>> 6 * p & 63, p);
      state.stageIndex = index; state.loops = loops; state.wait = 0; state.phase = PHASE.PLAY;
    };
    const step = () => {
      sim.simulate(FIXED);
      const phase = state.phase;
      if (phase === PHASE.TRANSITION || phase === PHASE.ENDING) {
        if (--state.wait > 0) return;
        if (phase === PHASE.TRANSITION) handOver(state.stageIndex + 1, state.loops);
        else handOver(0, state.loops + 1);
      } else if (phase !== PHASE.END) follow();
    };

    return {
      state,
      get sim() { return sim; },
      // Player p's held buttons, on the current sim.
      setInput(bits, p = 0) { sim.setInput(bits, p); },
      pause(on) { state.paused = on ? 1 : 0; sim.pause(on || state.phase === PHASE.TRANSITION || state.phase === PHASE.ENDING); },
      tick(dt) {
        if (state.paused) return 0;
        state.acc = Math.min(state.acc + dt, FIXED * MAX_SUBSTEPS);
        let steps = 0;
        while (state.acc >= FIXED - EPS * FIXED && steps < MAX_SUBSTEPS) {
          state.acc = Math.max(0, state.acc - FIXED);
          step();
          steps++;
        }
        return steps;
      },
      simulate(seconds) {
        if (state.paused) return;
        for (let n = Math.round(seconds / FIXED); n > 0; n--) step();
      },
      // From game over: the sim spends a shared continue and starts the stage again, or, with none left, stays over.
      continueRun() {
        if (state.phase !== PHASE.OVER) return;
        sim.continueRun();
        follow();
      },
      endRun() {
        if (state.phase !== PHASE.OVER) return;
        sim.endRun();
        follow();
      }
    };
  };

  BL.raidCampaign = { PHASE, TUNE, create };
})();
