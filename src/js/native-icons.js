// The sheet's tab icons as pixel paths, shared by the island's panel tabs and the Ooga Chat app (src/ooga-chat/), so
// neither redraws them. `svg(name)` returns a fresh element; an element carrying `data-native-icon="<name>"` gets one
// prepended by `fill(root)` (hud.js fills the island's tabs at load). `cloud` is Ooga Chat's mark, which its build also
// draws as the app's favicons and icons (scripts/ooga-chat.mjs), and `dsb` DSB Land's destination mark; `voice()` is the roster's voice mark (the microphone, `mic`, and `drawMic` on a canvas), which hud.js and Ooga Chat both draw, and `link()` with `LINK_WORDS` the voice link's.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const NS = "http://www.w3.org/2000/svg";
  // name: [class, viewBox, crisp, [[fill, d, class?], ...]] or a circle list for the round online mark.
  const ICONS = {
    bananas: ["banana-icon", "-0.5 0 9 10", true, [
      ["#2b1b10", "M0 0h3v1H0zM0 1h1v1H0zM2 1h1v1H2zM0 2h1v1H0zM2 2h2v1H2zM0 3h1v1H0zM3 3h1v1H3zM0 4h1v1H0zM3 4h2v1H3zM0 5h1v1H0zM4 5h2v1H4zM0 6h2v1H0zM5 6h2v1H5zM1 7h1v1H1zM6 7h2v1H6zM1 8h3v1H1zM7 8h1v1H7zM3 9h5v1H3z"],
      ["#ffd84a", "M1 3h2v2H1zM1 5h3v1H1zM2 6h3v1H2zM2 7h4v1H2zM4 8h3v1H4z"],
      ["#789a3b", "M1 1h1v2H1z"]]],
    roster: ["caveman-icon", "0 0 9 10", true, [
      ["#2b1b10", "M0 0h9v1H0zM0 1h1v6H0zM8 1h1v6H8zM0 7h2v1H0zM7 7h2v1H7zM1 8h1v1H1zM7 8h1v1H7zM1 9h7v1H1z"],
      ["#d9a06b", "M1 1h7v1H1z"],
      ["#151312", "M1 2h7v1H1zM1 5h7v1H1zM1 6h1v1H1zM3 6h3v1H3zM7 6h1v1H7zM2 7h5v2H2z"],
      ["#ffbd7e", "M3 3h3v2H3z"],
      ["#f2efe4", "M1 3h2v1H1zM6 3h2v1H6zM1 4h1v1H1zM7 4h1v1H7zM2 6h1v1H2zM6 6h1v1H6z"],
      ["#141414", "M2 4h1v1H2zM6 4h1v1H6z"]]],
    players: [null, "0 0 9 9", false, [["#2b1b10", 3.5], ["#22c55e", 2.5]]],
    chat: [null, "0 0 9 9", true, [
      ["#2b1b10", "M0 0h9v7H5v1H4v1H1V7H0z"],
      ["#f3efe4", "M1 1h7v5H4v1H3v1H2V6H1z"],
      ["#5c4425", "M2 3h1v1H2zM4 3h1v1H4zM6 3h1v1H6z"]]],
    // Ooga Chat's mark: the outlined cloud under three dots in the purple of its speakers, the middle one a pixel higher.
    // A part's third entry is its class: on a side-docked panel's tab the outer two dots stand a pixel nearer the middle
    // (`cloud-near`, shown there by native.css in place of `cloud-wide`); the app's favicons draw the wide ones alone.
    cloud: ["cloud-icon", "0 0 11 11", true, [
      ["#2b1b10", "M5 1h1v1H5zM4 2h1v1H4zM6 2h1v1H6zM5 3h1v1H5zM4 5h3v1H4zM2 6h2v1H2zM7 6h2v1H7zM1 7h1v2H1zM9 7h1v2H9zM2 9h7v1H2z"],
      ["#2b1b10", "M1 2h1v1H1zM0 3h1v1H0zM2 3h1v1H2zM1 4h1v1H1zM9 2h1v1H9zM8 3h1v1H8zM10 3h1v1H10zM9 4h1v1H9z", "cloud-wide"],
      ["#2b1b10", "M2 2h1v1H2zM1 3h1v1H1zM3 3h1v1H3zM2 4h1v1H2zM8 2h1v1H8zM7 3h1v1H7zM9 3h1v1H9zM8 4h1v1H8z", "cloud-near"],
      ["#f3efe4", "M4 6h3v1H4zM2 7h7v2H2z"],
      ["#b18aff", "M5 2h1v1H5z"],
      ["#b18aff", "M1 3h1v1H1zM9 3h1v1H9z", "cloud-wide"],
      ["#b18aff", "M2 3h1v1H2zM8 3h1v1H8z", "cloud-near"]]],
    // DSB Land's destination mark, the same paths as the island's `dsb-island-icon` (the suite holds them equal).
    dsb: ["dsb-island-icon", "0 0 64 48", false, [
      ["#195c78", "m3 30 9-8 30-6 18 12-5 11-23 7-24-6z"],
      ["#d8bd7b", "m7 28 12-10 7-12 13 4 7 11 11 7-6 8-21 7-20-7z"],
      ["#7c8b54", "m11 27 11-8 6-11 10 4 6 11 9 5-5 6-18 6-17-6z"],
      ["#b1b38b", "m18 22 10-14 10 4 3 8-11-3z"],
      ["#f4eed6", "M20 8h13v3H20zM21 11h3v10h-3zM29 11h3v10h-3zM35 23h8v8h-8zM44 27h7v7h-7zM29 29h7v7h-7z"],
      ["#4388b7", "M35 21h8v3h-8zM44 25h7v3h-7zM29 27h7v3h-7zM38 27h2v4h-2zM46 30h2v4h-2zM31 32h2v4h-2z"],
      ["#526b3c", "m15 23-3 8h6zm6 4-3 8h6z"],
      ["#69b6c5", "m8 39 22 6 22-7v2l-22 7-22-6z"]]]
  };
  // The roster's voice mark, the microphone (`mic`, below) in currentColor; a stylesheet shows the parts each state needs:
  // hollow in voice, filling with the voice's level while speaking, crossed out when muted or silenced here.
  const voice = () => mic();
  // The same microphone on a canvas (the nameplates over Oogas, remote-players.js and island-view.js): `size` pixels square
  // at `x`, `y` in `color`, its capsule filled from the bottom by `level` (0 to 1), and crossed out when `muted`, its slash
  // edged in `edge` as the names are. Its paths are made once; nothing is allocated a draw.
  let micPaths = null;
  const drawMic = (ctx, x, y, size, color, muted, level, edge) => {
    if (!micPaths) micPaths = { head: new Path2D("M9 5.5a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0z"), stand: new Path2D("M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3M8.5 21.2h7"), slash: new Path2D("M4 3l16 18") };
    const k = size / 24;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.fillStyle = ctx.strokeStyle = color;
    if (level > 0 && !muted) {
      ctx.save();
      ctx.clip(micPaths.head);
      ctx.fillRect(9, 2.5 + 11 * (1 - level), 6, 11 * level);
      ctx.restore();
    }
    ctx.stroke(micPaths.head);
    ctx.stroke(micPaths.stand);
    if (muted) {
      ctx.strokeStyle = edge;
      ctx.lineWidth = 5;
      ctx.stroke(micPaths.slash);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke(micPaths.slash);
    }
    ctx.restore();
  };
  const svg = (name) => {
    const icon = ICONS[name];
    if (!icon) throw new Error(`No native icon "${name}"`);
    const [cls, viewBox, crisp, parts] = icon, el = document.createElementNS(NS, "svg");
    if (cls) el.setAttribute("class", cls);
    el.setAttribute("viewBox", viewBox);
    if (crisp) el.setAttribute("shape-rendering", "crispEdges");
    el.setAttribute("aria-hidden", "true");
    for (const [fill, shape, partClass] of parts) {
      const part = document.createElementNS(NS, typeof shape === "number" ? "circle" : "path");
      if (partClass) part.setAttribute("class", partClass);
      if (typeof shape === "number") {
        part.setAttribute("cx", "4.5"); part.setAttribute("cy", "4.5"); part.setAttribute("r", String(shape));
      } else part.setAttribute("d", shape);
      part.setAttribute("fill", fill);
      el.append(part);
    }
    return el;
  };
  const fill = (root) => {
    for (const el of root.querySelectorAll("[data-native-icon]")) if (!el.querySelector(":scope > svg")) el.prepend(svg(el.dataset.nativeIcon));
  };
  // A voice link's mark, an 11x11 pixel chain of two links in currentColor, and what it says in each state; the
  // island's Online Oogas and Ooga Chat's both draw it.
  const LINK_PATH = "M7 0h3v1H7zM6 1h1v1H6zM9 1h2v1H9zM5 2h1v1H5zM10 2h1v1h-1zM4 3h1v1H4zM10 3h1v1h-1zM4 4h1v1H4zM9 4h1v1H9zM2 5h1v1H2zM4 5h1v1H4zM8 5h1v1H8zM1 6h1v1H1zM4 6h4v1H4zM0 7h1v1H0zM0 8h1v1H0zM5 8h1v1H5zM0 9h2v1H0zM4 9h1v1H4zM1 10h3v1H1z";
  const link = () => {
    const el = document.createElementNS(NS, "svg");
    el.setAttribute("viewBox", "0 0 11 11");
    el.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(NS, "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", LINK_PATH);
    el.append(path);
    return el;
  };
  const LINK_WORDS = Object.freeze({
    none: (name) => `Link voices with ${name}: once they link back, you hear each other in any zone`,
    asked: (name) => `Waiting for ${name} to link back: click to cancel`,
    linked: (name) => `Voices linked with ${name}: click to unlink`,
  });
  // The microphone, drawn smooth in currentColor on a 24-unit grid: a capsule, its yoke and stand. `mic-level` fills the
  // capsule from the bottom by the CSS variable `--lv` (0 to 1, a voice's level); `mic-gap` (a cut in the microphone,
  // through a mask of its own, so it is clean on any background) and `mic-slash` cross it out. A stylesheet shows the
  // parts each state needs. Every icon names its own mask and clip, so any number stand on a page.
  let micIds = 0;
  const part = (tag, attrs) => { const el = document.createElementNS(NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); return el; };
  const MIC_HEAD = { x: "9", y: "2.5", width: "6", height: "11", rx: "3" };
  const mic = () => {
    const n = ++micIds, el = part("svg", { class: "mic-icon", viewBox: "0 0 24 24", "aria-hidden": "true" });
    const cut = part("mask", { id: `mic-cut-${n}`, maskUnits: "userSpaceOnUse", x: "0", y: "0", width: "24", height: "24" });
    cut.append(part("rect", { width: "24", height: "24", fill: "#fff" }), part("path", { class: "mic-gap", d: "M4 3l16 18", stroke: "#000", "stroke-width": "5", "stroke-linecap": "round" }));
    const head = part("clipPath", { id: `mic-head-${n}` });
    head.append(part("rect", MIC_HEAD));
    const body = part("g", { class: "mic-body", mask: `url(#mic-cut-${n})` });
    body.append(part("rect", { class: "mic-level", ...MIC_HEAD, rx: "0", height: "11", fill: "currentColor", "clip-path": `url(#mic-head-${n})` }),
      part("rect", { class: "mic-capsule", ...MIC_HEAD, fill: "none", stroke: "currentColor", "stroke-width": "2" }),
      part("path", { class: "mic-stand", d: "M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3M8.5 21.2h7", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" }));
    const defs = part("defs", {});
    defs.append(cut, head);
    el.append(defs, body, part("path", { class: "mic-slash", d: "M4 3l16 18", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" }));
    return el;
  };
  // A microphone button's words beside its microphone (style.css `.foot-button > .mic-icon`, shown by `data-mic`): the
  // first call puts the icon in, then only the words change, so the panels set a label as they set text.
  const label = (button, text) => {
    let words = button.querySelector(":scope > .mic-label");
    if (!words) {
      words = document.createElement("span");
      words.className = "mic-label";
      button.replaceChildren(mic(), words);
    }
    if (words.textContent !== text) words.textContent = text;
  };
  // Only speaking to idle fades: new speech and either mute change take their colour at once.
  const setVoiceLook = (el, look) => {
    if (el.dataset.voice === look) return;
    el.dataset.voiceFade = String(el.dataset.voice === "speaking" && look === "on");
    el.dataset.voice = look;
  };
  // A voice's shown level from one meter reading (its RMS): the raw level against a loud voice's (LEVEL_FULL), so a soft
  // microphone shows soft, rising at once and falling LEVEL_FALL of the way down each reading, so words never step.
  const LEVEL_FULL = 0.2, LEVEL_FALL = 0.7;
  const shapeLevel = (shown, rms) => {
    const raw = Math.min(1, rms / LEVEL_FULL), next = raw >= shown ? raw : shown + (raw - shown) * LEVEL_FALL;
    return next < 0.01 ? 0 : next;
  };
  BL.nativeIcons = { svg, fill, voice, link, mic, label, drawMic, setVoiceLook, shapeLevel, LINK_WORDS, names: Object.keys(ICONS), ICONS };
})();
