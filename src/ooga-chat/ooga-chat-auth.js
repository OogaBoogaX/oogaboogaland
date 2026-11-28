// Ooga Chat's account lifecycle (#652, docs/ooga-chat-app.md): one controller over the adapter's session. `auth` is
// checking, signed-out, listener (an X account, or a GitHub account the server does not report eligible), unknown
// (contributions could not be checked, or the server's stale window passed), eligible, signing-out or error (the
// session could not be checked). Every sign-in lands as a listener: nothing here opens a microphone, and Join voice is
// only ever offered where `gates` says the server allowed it. The server decides again at every privileged step.
// The voice seam is `media`: `{ available, release(reason) }`. The controller calls `release` before anything else
// whenever the account stops being the one that may speak: signing out (before the logout request), another principal,
// an expired session, a lost or stale capability, or a check that failed. #654's voice client takes the seam's place.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // A return to the page or the network checks the session again, at most this often.
  const RECHECK_MIN_MS = 30000;
  // The session's own deadlines (expiry, the eligibility's stale window) wake a check, clamped to this range.
  const TIMER_MIN_MS = 5000, TIMER_MAX_MS = 3600000;
  // An eligible answer is asked again this long before its stale window ends, so the server refreshes it (it does once
  // the row is five minutes old) and the window never lapses under a speaker; still old, it is asked once more at the end.
  const STALE_LEAD_MS = 120000;
  const NAMES = { github: "GitHub", x: "X" };
  const RETURN_TEXT = {
    ok: () => "Sign-in didn't finish.",
    denied: (name) => `${name} sign-in was cancelled.`,
    failed: (name) => `${name} sign-in didn't work.`,
    unavailable: (name) => `${name} sign-in isn't available right now.`,
    "rate-limited": (name) => `${name} is busy. Try again in a minute.`
  };
  const NOTICE = {
    check: { kind: "check", text: "Ooga Chat can't check your sign-in right now.", action: "Try again" },
    expired: { kind: "expired", text: "Your sign-in expired. Sign in again to keep listening." },
    signout: { kind: "signout", text: "Signed out here, but the server didn't confirm. Your session ends on its own when it expires.", action: "Try again" },
    held: { kind: "signout", text: "Signed out here, but the server still has you signed in.", action: "Sign out again" }
  };
  // Why Join voice is off, said on the button itself rather than in another row.
  const WHY = {
    x: "X accounts listen. Speaking is for Team Ooga Booga contributors signed in with GitHub.",
    listener: "Speaking is for Team Ooga Booga contributors. This GitHub account isn't one.",
    revoked: "Speaking is off for this account.",
    unknown: "Contributions can't be checked right now, so you're listening for now.",
    error: "Ooga Chat can't confirm your sign-in right now.",
    closed: "Speaking isn't open to this account right now."
  };
  // Eligibility as of `now`: an eligible answer past the server's stale window is unknown until checked again.
  const eligibilityAt = (session, now) => {
    const { state, checkedAt, staleAfter } = session.eligibility;
    return state === "eligible" && staleAfter !== null && now >= checkedAt + staleAfter * 1000 ? "unknown" : state;
  };
  const status = (session, now) => {
    if (!session) return "signed-out";
    if (session.identity.provider !== "github") return "listener";
    const state = eligibilityAt(session, now);
    return state === "eligible" || state === "unknown" ? state : "listener";
  };
  // What the account may do now. `contributor` shows Online Oogas and The Commons; `joinVoice` offers Join voice;
  // `why` says why not. Both come only from the parsed server session, never from saved or displayed values.
  const gates = (state, now) => {
    const { session, auth } = state;
    const eligible = !!session && auth !== "signing-out" && eligibilityAt(session, now) === "eligible";
    const joinVoice = eligible && auth === "eligible" && session.capabilities.speak;
    let why = null;
    if (session && !joinVoice) {
      const standing = eligibilityAt(session, now);
      why = auth === "error" ? WHY.error : session.identity.provider !== "github" ? WHY.x
        : standing === "revoked" ? WHY.revoked : standing === "unknown" ? WHY.unknown : standing === "eligible" ? WHY.closed : WHY.listener;
    }
    return { contributor: eligible && session.capabilities.contributor, joinVoice, why };
  };
  const create = ({ adapter, media, now = () => Date.now(), timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) }, onChange = () => {} }) => {
    let boot = null, timer = null, lastCheck = -Infinity, ticket = 0, disposed = false;
    // A name heard live, its account and its retries (`renamed`, below).
    let heard = null, heardTries = 0, heardTimer = null;
    let state = { auth: "checking", session: null, notice: null, busy: false }, open = false;
    // Every change passes here: capture is released before anyone hears of the new state. `open` is whether Join voice
    // was allowed when last said, so a window that passed between two changes still counts as a loss. A loss that is
    // only this page not knowing for a moment (a stale window, a check that failed or is under way, the server not yet
    // sure) closes Join voice but leaves a lease already held: the server ends it when the standing really is lost
    // (eligibility, revocation, sign-out, the session's end), and the speaker is not dropped every quarter hour.
    // The server not sure either (its own answer `unknown`, which also reads `speak` false) is the same not knowing.
    const lost = (is, why) => {
      if (why === "signout" || why === "expired" || !is || is.identity.provider !== "github") return true;
      const standing = eligibilityAt(is, now());
      return standing !== "unknown" && (standing !== "eligible" || !is.capabilities.speak);
    };
    const set = (patch, why = "change") => {
      if (disposed) return;
      const was = state.session;
      state = { ...state, ...patch };
      // A name heard for one account is never another's (signing out does not pass `adopt`).
      if (heard && (!state.session || state.session.identity.principal !== heard.principal)) forgetHeard();
      const is = state.session, opened = gates(state, now()).joinVoice;
      if (was && (!is || is.identity.principal !== was.identity.principal)) media.release(is ? "identity" : why);
      else if (open && !opened && lost(is, why)) media.release(why);
      open = opened;
      onChange(state);
    };
    const stop = () => {
      if (timer !== null) timers.clear(timer);
      timer = null;
    };
    // One timer, at the session's nearest deadline: its expiry, or STALE_LEAD_MS before the end of an eligible answer's
    // stale window (its end, when that is nearer).
    const schedule = () => {
      stop();
      const session = state.session;
      if (!session || disposed) return;
      const { state: standing, checkedAt, staleAfter } = session.eligibility;
      // A window that has already passed wakes nothing: the answer stays unknown until a return to the page or the
      // network asks again, rather than asking every TIMER_MIN_MS.
      const at = now(), lapse = checkedAt + staleAfter * 1000;
      const stale = standing === "eligible" && staleAfter !== null && lapse > at ? lapse - STALE_LEAD_MS > at ? lapse - STALE_LEAD_MS : lapse : Infinity;
      const due = Math.min(session.expiresAt ?? Infinity, stale);
      if (due === Infinity) return;
      timer = timers.set(() => { timer = null; check("timer"); }, Math.min(TIMER_MAX_MS, Math.max(TIMER_MIN_MS, due - at)));
    };
    // While a sign-out the server didn't confirm stands, the page stays signed out: a session still found is never
    // taken back (only said, with the sign-out to send again), and none found is the confirmation.
    // A name heard live (`renamed(display)`: the island's worker/src/renames.js, through the Commons) is this account's
    // name at once, here as in the footer, so a check under way never shows the old one, and the server is asked for it
    // (`refresh`). An answer still carrying another name (the server's island answer was under its REFRESH_SOON_MS) keeps
    // the heard one and asks again once that window has passed, RENAME_TRIES at most; one that agrees ends it. The name is
    // the account's it was heard for (`heard.principal`): signed out, expired or another account forgets it.
    const RENAME_AGAIN_MS = 11 * 1000, RENAME_BUSY_MS = 1500, RENAME_TRIES = 3;
    const forgetHeard = () => {
      heard = null;
      if (heardTimer !== null) { timers.clear(heardTimer); heardTimer = null; }
    };
    const named = (is, display) => is && is.identity.display !== display ? { ...is, identity: { ...is.identity, display } } : is;
    const askRenamed = (wait) => {
      if (heardTimer !== null) timers.clear(heardTimer);
      heardTimer = timers.set(() => {
        heardTimer = null;
        if (!heard || disposed) return;
        if (state.auth === "checking") askRenamed(RENAME_BUSY_MS); else check("renamed");
      }, wait);
    };
    const renamed = (display) => {
      if (disposed || !state.session || typeof display !== "string" || !display || state.session.identity.display === display) return;
      heard = { display, principal: state.session.identity.principal };
      heardTries = 0;
      set({ session: named(state.session, display) }, "renamed");
      askRenamed(0);
    };
    const adopt = (next, why) => {
      if (state.notice?.kind === "signout") {
        set({ notice: next ? NOTICE.held : null });
        return;
      }
      if (heard && (!next || next.identity.principal !== heard.principal)) forgetHeard();
      if (heard) {
        if (next.identity.display === heard.display) forgetHeard();
        else {
          next = named(next, heard.display);
          if (why === "renamed" && ++heardTries < RENAME_TRIES) askRenamed(RENAME_AGAIN_MS);
          else if (why === "renamed") forgetHeard();
        }
      }
      const expired = !!state.session && !next;
      const notice = expired ? NOTICE.expired : state.notice?.kind === "check" ? null : state.notice;
      set({ session: next, auth: status(next, now()), notice }, expired ? "expired" : why);
      schedule();
    };
    const start = async (bootstrap, back = null) => {
      boot = bootstrap;
      lastCheck = now();
      const mine = ++ticket;
      set({ auth: "checking" });
      let next;
      try {
        next = await adapter.session(boot);
      } catch {
        if (mine === ticket) set({ auth: "error", notice: NOTICE.check }, "error");
        return;
      }
      if (mine !== ticket || disposed) return;
      let notice = null;
      if (back && (back.result !== "ok" || !next)) {
        notice = { kind: "signin", provider: back.provider, text: RETURN_TEXT[back.result](NAMES[back.provider] || "Sign-in"), action: back.provider ? "Try again" : null };
      }
      set({ session: next, auth: status(next, now()), notice }, "start");
      schedule();
    };
    // Checks the session again. A timer, a retry, a saved name (`rename`, whose footer shows it at once) or one renamed live
    // elsewhere (`renamed`, which also has the server read the island's name again) always asks; a
    // return to the page or the network at most every RECHECK_MIN_MS. A passing stale window downgrades before the answer comes, and a lost session reads as expired.
    const check = async (why = "check") => {
      if (disposed || !boot || state.busy || state.auth === "checking") return;
      const at = now();
      if (why !== "timer" && why !== "retry" && why !== "rename" && why !== "renamed" && at - lastCheck < RECHECK_MIN_MS) return;
      lastCheck = at;
      const mine = ++ticket;
      if (state.session) set({ auth: status(state.session, at) }, "stale");
      try {
        // Renamed live elsewhere: the server reads the island's name again (`refresh`).
        const next = await adapter.session(boot, why === "renamed" ? { refresh: true } : undefined);
        if (mine === ticket && !disposed) adopt(next, why);
      } catch {
        if (mine === ticket && !disposed) set({ auth: state.session ? "error" : "signed-out", notice: state.session ? NOTICE.check : state.notice }, "error");
      }
    };
    // Production navigates to the server's sign-in and the page is gone; `busy` names the provider meanwhile. The
    // fixture adapter answers at once.
    const signIn = (provider) => {
      if (disposed || !boot || state.busy || state.session || !boot.paths.login[provider]) return;
      ticket++;
      set({ busy: provider, notice: null });
      const next = adapter.signIn(boot, provider);
      if (next !== undefined) {
        set({ session: next, auth: status(next, now()), busy: false }, "identity");
        schedule();
      }
    };
    // Bumps the ticket so no check already asking can bring a session back, and clears the session either way.
    const logout = async () => {
      ticket++;
      try {
        await adapter.signOut(boot);
        set({ session: null, auth: "signed-out", busy: false, notice: null });
      } catch {
        set({ session: null, auth: "signed-out", busy: false, notice: NOTICE.signout });
      }
    };
    // Capture stops and the account leaves this page first; only then is the server told. A failed request leaves
    // the page signed out with a retry, never a microphone running.
    const signOut = () => {
      if (disposed || !boot || state.busy || !state.session) return Promise.resolve();
      stop();
      set({ session: null, auth: "signing-out", busy: "signout", notice: null }, "signout");
      return logout();
    };
    const retry = () => {
      const notice = state.notice;
      if (disposed || !notice || state.busy) return Promise.resolve();
      if (notice.kind === "signout") {
        set({ busy: "signout", notice: null });
        return logout();
      }
      if (notice.kind === "signin" && notice.provider) return Promise.resolve(signIn(notice.provider));
      return notice.kind === "check" ? recheck() : Promise.resolve();
    };
    // A failed first check has no session to compare with: ask again as at the start.
    const recheck = () => state.session ? check("retry") : start(boot);
    // Back from the browser's page cache after leaving for a sign-in that never finished: free the buttons, ask again.
    const resume = () => {
      if (disposed || !boot) return;
      if (typeof state.busy === "string" && state.busy !== "signout") set({ busy: false });
      check("retry");
    };
    const dispose = () => {
      disposed = true;
      stop();
      forgetHeard();
    };
    return { start, check, renamed, signIn, signOut, retry, resume, dispose, get state() { return state; }, get timed() { return timer !== null; } };
  };
  BL.oogaChatAuth = { create, status, gates, eligibilityAt, RECHECK_MIN_MS, TIMER_MIN_MS, TIMER_MAX_MS, STALE_LEAD_MS, NOTICE, WHY };
})();
