// The code a staged Ooga Chat fetches only once a tab needs it, as the island's deferred.js does for its scenes:
// `bananas` (the Bananas tab and Feed the Oogas, with donations.js), `panels` (Contributing Oogas, Online Oogas and
// The Commons) and `emoji` (the emoji bar and its picker with the whole emoji list, wanted only signed in). index.html tags their modules `data-defer="<group>"`; scripts/ooga-chat.mjs stages each group as
// js/ooga-chat-<group>-<hash>.js and names the files here (`BL.oogaChatScripts`, written at the head of the first-load
// script). From source the modules are on the page already, so `load` finds them present and answers null at once.
// Otherwise it adds one same-origin script (the policy's 'self'), bounded by TIMEOUT_MS; a failure rejects and is
// forgotten, so the next `load` tries again, under a fresh address after an error. A timeout keeps the address and the
// script: its copy may still arrive and run, and must not download twice. Whenever a group is found here, by `load`,
// `ready` or a late copy's arrival, its waiting callbacks run, once. A chunk that runs twice returns at its head
// (scripts/ooga-chat.mjs), since its group is already here. A deploy replaces the files, so a page left open
// across one (and not kept by the service worker) finds its chunk gone: an error is probed with a HEAD, and a 404 marks
// the page `stale`, which the tab's stand-in offers as a reload. `ready(group, fn)` runs fn once the group is present,
// now or when it arrives; `prefetch` loads every group once the page is idle, never under Save-Data.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const TIMEOUT_MS = 20000;
  // How each group shows it has arrived: the view its last module registers.
  const PRESENT = { bananas: () => !!BL.oogaChatViews?.bananas, panels: () => !!BL.oogaChatViews?.online, emoji: () => !!BL.reactionBar };
  const loading = new Map(), attempts = new Map(), waiting = new Map();
  let stale = false;
  const arrived = (group) => {
    const fns = waiting.get(group) || [];
    waiting.delete(group);
    for (const fn of fns) fn();
  };
  const ready = (group, fn) => {
    if (!PRESENT[group]) throw new Error(`No Ooga Chat group ${group}`);
    if (PRESENT[group]()) { arrived(group); return fn(); }
    if (!waiting.has(group)) waiting.set(group, []);
    waiting.get(group).push(fn);
  };
  // A file that answers 404 or 410 is gone for good: Ooga Chat was deployed since this page loaded.
  const probe = (file, error) => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    return fetch(file, { method: "HEAD", cache: "no-store", signal: controller.signal }).then((response) => {
      if (response.status === 404 || response.status === 410) { error.stale = stale = true; }
    }, () => {}).finally(() => clearTimeout(timer)).then(() => { throw error; });
  };
  const load = (group) => {
    if (!PRESENT[group]) return Promise.reject(new Error(`No Ooga Chat group ${group}`));
    if (PRESENT[group]()) { arrived(group); return null; }
    if (loading.has(group)) return loading.get(group);
    const file = BL.oogaChatScripts && BL.oogaChatScripts[group];
    if (!file) return Promise.reject(new Error(`No ${group} code on this page`));
    const tries = attempts.get(group) || 0, src = tries ? `${file}?r=${tries}` : file;
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const finish = (error, fetched = true) => {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (!error && !PRESENT[group]()) error = new Error(`The ${group} code did not start`);
        if (!error) { arrived(group); resolve(null); return; }
        loading.delete(group);
        if (fetched) {
          attempts.set(group, tries + 1);
          script.remove();
        } else script.onload = script.onerror = () => {
          // A timed-out copy that runs late still brings its group: whatever waits for it runs now.
          script.onload = script.onerror = null;
          script.remove();
          if (PRESENT[group]()) arrived(group);
        };
        reject(error);
      };
      const timer = setTimeout(() => finish(new Error(`The ${group} code took too long`), false), TIMEOUT_MS);
      script.onload = () => finish(null);
      script.onerror = () => {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        probe(file, new Error(`The ${group} code could not be fetched`)).catch(finish);
      };
      script.src = src;
      document.head.append(script);
    });
    loading.set(group, promise);
    return promise;
  };
  // Every group, once the first view has painted and the browser is idle, so a tab click finds its code here already.
  const prefetch = () => {
    if (navigator.connection?.saveData) return;
    const idle = window.requestIdleCallback ? (fn) => requestIdleCallback(fn, { timeout: 3000 }) : (fn) => setTimeout(fn, 1500);
    requestAnimationFrame(() => idle(() => {
      for (const group of Object.keys(PRESENT)) load(group)?.catch(() => {});
    }));
  };
  BL.oogaChatChunks = { load, ready, prefetch, present: (group) => PRESENT[group](), get stale() { return stale; } };
})();
