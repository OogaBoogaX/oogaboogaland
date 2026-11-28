# Lifecycle and Network Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound network waits and avoid unseen rendering, audio, and feed work without changing visible-play behavior.

**Architecture:** Apply visibility before feed startup, use the existing project timeout pattern, make scene activity predicates honest, and gate optional audio/stream work on mute, data saver, and visibility. Preserve the signed-in room's explicit hidden grace.

**Tech Stack:** Classic JavaScript, Node fixtures in `test/run.mjs`, targeted browser lifecycle checks.

## Global Constraints

- Baseline `4387b8914473425ef0a2b6c881865d12be4f25d4`; author Harry Beckwith `<harry@hotpixelgroup.com>`.
- No dependencies, new test files, weakened assertions, extra polling, or changes to the signed-in room's five-minute hidden grace.
- Hidden tabs already cancel RAF; this PR addresses unfocused windows and startup/media/network lifecycle only.
- Evidence uses request counts, timer counts, payload bytes, and state transitions; no unsupported FPS claims.

---

### Task 1: Bound pollers and prevent hidden startup work

**Files:**
- Modify: `src/js/oogatron-live.js`, `src/js/repo-feed.js`, `src/js/director.js`, `src/js/chain.js` only if initial hidden startup still requires it
- Modify: `test/run.mjs` existing feed fixtures

**Interfaces:**
- Consumes: existing `start`, `poll`, `setHidden`, `document.hidden`, and visibility events.
- Produces: 15-second bounded Oogatron/Repo requests; no initial public-feed burst when the page starts hidden; exactly one due poll per feed when shown.

- [ ] **Step 1: Add failing regressions**

Use never-settling fetch fixtures to require timeout rejection, `inFlight === false`, preserved last good data, and a later successful poll. Initialize a hidden document and require zero public-feed fetches/sockets at startup, then flip visible and require one per feed without duplicate timers.

- [ ] **Step 2: Verify red**

Run `npm run test:unit`; expect stalled requests to remain pending and hidden startup requests to occur.

- [ ] **Step 3: Implement minimally**

Use `fetch(url, { signal: AbortSignal.timeout(15000) })` for Oogatron and Repo, preserving existing catch/finally behavior. Apply `mempool.setHidden(document.hidden)` and `chain.setHidden(document.hidden)` before feed start in the director. Guard Oogatron/Repo first polls with visibility. Change chain only where its initial transport still bypasses existing hidden guards.

- [ ] **Step 4: Verify green and commit**

Run `npm run test:unit`, syntax-check changed files, and commit `Bound feed requests and hidden startup work`. Push and open a draft PR.

---

### Task 2: Suspend optional media and use real unfocused activity

**Files:**
- Modify: `src/js/dsb-audio.js`, `src/js/timechain-party-radio.js`, `src/js/scene-timechain.js` if needed for disposal
- Modify: `src/js/scene-factory.js`, `src/js/scene-hangar.js`, `src/js/scene-bifrost.js`, `src/js/scene-poker.js`
- Modify: `test/run.mjs` lifecycle/audio fixtures

**Interfaces:**
- Consumes: `BL.sound` mute state, `navigator.connection?.saveData`, visibility, existing disposers, and `director.frameInterval`.
- Produces: no DSB audio fetch/decode while muted or data-saver until explicit activation; radio hidden suspend/resume only if previously playing; approximately 30 FPS for idle unfocused scenes with genuine activity preserved.

- [ ] **Step 1: Add failing regressions**

Require zero DSB recording requests with mute/data saver and one lazy request set after explicit sound activation. Require hidden radio silence/no metadata, then one resumed stream/timer set only if previously playing. Require constant-idle scene predicates to permit the director's 30 FPS unfocused interval while active crossings/games retain full rate.

- [ ] **Step 2: Verify red**

Run `npm run test:unit`; expect eager DSB fetches, active hidden radio, and constant `inMotion` failures.

- [ ] **Step 3: Implement minimally**

Gate DSB `ensure` and hosted voice warm-up on `!muted && !navigator.connection?.saveData`; invoke the same lazy path from unmute/sound control. Abort radio metadata and stop/suspend stream/audio on hide; on show, resume only previously playing state with no duplicate timers. Replace constant `inMotion` getters with existing scene activity state or `false` for purely ambient idle scenes, leaving focused behavior unchanged.

- [ ] **Step 4: Verify green and measure evidence**

Run `npm run test:unit`, build and syntax checks, then targeted timechain/DSB browser lifecycle checks if the environment permits. Record exact requests avoided: voices 457,844 B and music 2,621,016 B, total 3,078,860 B. Do not claim untested browser results.

- [ ] **Step 5: Commit, review, and publish evidence**

Commit `Respect visibility and data preferences for optional media`. PR description includes baseline/head revisions, request/timer counts, byte calculation, commands, and limitations; ready only after review and evidence pass.
