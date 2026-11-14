// Ooga Chat's account lifecycle (#652, docs/ooga-chat-app.md): one controller over the adapter's session. `auth` is
// checking, signed-out, listener (an X account, or a GitHub account the server does not report eligible), unknown
// (contributions could not be checked, or the server's stale window passed), eligible, signing-out or error (the
// session could not be checked). Every sign-in lands as a listener: nothing here opens a microphone, and Join Voice is
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
    signout: { kind: "signout", text: "Signed out here, but the server didn't confirm. Your session ends on its own when it expires.", action: "Try again" }
  };
  // Why Join Voice is off, said on the button itself rather than in another row.
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
  // What the account may do now. `contributor` shows Online Oogas and The Commons; `joinVoice` offers Join Voice;
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
    let state = { auth: "checking", session: null, notice: null, busy: false }, open = false;
    // Every change passes here: capture is released before anyone hears of the new state. `open` is whether Join Voice
    // was allowed when last said, so a window that passed between two changes still counts as a loss.
    const set = (patch, why = "change") => {
      if (disposed) return;
      const was = state.session;
      state = { ...state, ...patch };
      const is = state.session, opened = gates(state, now()).joinVoice;
      if (was && (!is || is.identity.principal !== was.identity.principal)) media.release(is ? "identity" : why);
      else if (open && !opened) media.release(why);
      open = opened;
      onChange(state);
    };
    const stop = () => {
      if (timer !== null) timers.clear(timer);
      timer = null;
    };
    // One timer, at the session's nearest deadline: its expiry, or the end of an eligible answer's stale window.
    const schedule = () => {
      stop();
      const session = state.session;
      if (!session || disposed) return;
      const { state: standing, checkedAt, staleAfter } = session.eligibility;
      // A window that has already passed wakes nothing: the answer stays unknown until a return to the page or the
      // network asks again, rather than asking every TIMER_MIN_MS.
      const at = now(), stale = standing === "eligible" && staleAfter !== null && checkedAt + staleAfter * 1000 > at ? checkedAt + staleAfter * 1000 : Infinity;
      const due = Math.min(session.expiresAt ?? Infinity, stale);
      if (due === Infinity) return;
      timer = timers.set(() => { timer = null; check("timer"); }, Math.min(TIMER_MAX_MS, Math.max(TIMER_MIN_MS, due - at)));
    };
    const adopt = (next, why) => {
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
    // Checks the session again. A timer or a retry always asks; a return to the page or the network at most every
    // RECHECK_MIN_MS. A passing stale window downgrades before the answer comes, and a lost session reads as expired.
    const check = async (why = "check") => {
      if (disposed || !boot || state.busy || state.auth === "checking") return;
      const at = now();
      if (why !== "timer" && why !== "retry" && at - lastCheck < RECHECK_MIN_MS) return;
      lastCheck = at;
      const mine = ++ticket;
      if (state.session) set({ auth: status(state.session, at) }, "stale");
      try {
        const next = await adapter.session(boot);
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
    const logout = async () => {
      try {
        await adapter.signOut(boot);
        set({ auth: "signed-out", busy: false, notice: null });
      } catch {
        set({ auth: "signed-out", busy: false, notice: NOTICE.signout });
      }
    };
    // Capture stops and the account leaves this page first; only then is the server told. A failed request leaves
    // the page signed out with a retry, never a microphone running.
    const signOut = () => {
      if (disposed || !boot || state.busy || !state.session) return Promise.resolve();
      ticket++;
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
    };
    return { start, check, signIn, signOut, retry, resume, dispose, get state() { return state; }, get timed() { return timer !== null; } };
  };
  BL.oogaChatAuth = { create, status, gates, eligibilityAt, RECHECK_MIN_MS, TIMER_MIN_MS, TIMER_MAX_MS, NOTICE, WHY };
})();
