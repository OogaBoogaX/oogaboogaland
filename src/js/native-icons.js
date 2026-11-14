// The sheet's tab icons as pixel paths, shared by the island's panel tabs and the Ooga Chat app (src/ooga-chat/), so
// neither redraws them. `svg(name)` returns a fresh element; an element carrying `data-native-icon="<name>"` gets one
// prepended by `fill(root)` (hud.js fills the island's tabs at load). `cloud` is Ooga Chat's outlined cloud.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const NS = "http://www.w3.org/2000/svg";
  // name: [class, viewBox, crisp, [[fill, d], ...]] or a circle list for the round online mark.
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
    cloud: ["cloud-icon", "0 0 9 9", true, [
      ["#2b1b10", "M3 2h3v1H3zM1 3h2v1H1zM6 3h2v1H6zM0 4h1v2H0zM8 4h1v2H8zM1 6h7v1H1z"],
      ["#f3efe4", "M3 3h3v1H3zM1 4h7v2H1z"]]]
  };
  const svg = (name) => {
    const icon = ICONS[name];
    if (!icon) throw new Error(`No native icon "${name}"`);
    const [cls, viewBox, crisp, parts] = icon, el = document.createElementNS(NS, "svg");
    if (cls) el.setAttribute("class", cls);
    el.setAttribute("viewBox", viewBox);
    if (crisp) el.setAttribute("shape-rendering", "crispEdges");
    el.setAttribute("aria-hidden", "true");
    for (const [fill, shape] of parts) {
      const part = document.createElementNS(NS, typeof shape === "number" ? "circle" : "path");
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
  BL.nativeIcons = { svg, fill, names: Object.keys(ICONS) };
})();
