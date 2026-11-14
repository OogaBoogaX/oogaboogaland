// The cave-sign alphabet and its lettering, shared by the island and the Ooga Chat app (src/ooga-chat/), so neither
// needs the 3D models to letter a heading. `SIGN_GLYPHS` is the blocky five-row alphabet every carved sign in the world
// is cut from, the Mempool cave's headlines included (hub-models.js re-exports it). It must stay complete: a missing
// key is silently skipped by the world's carvers and the reading loses a letter. Rows are three to five cells wide;
// fixed-width labels fit each glyph into their existing slot. `lettering(text)` draws text as one pixel path in an
// SVG scaled by its element's CSS height; `letter(el, words)` swaps an element's words for that lettering and labels it.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const SIGN_GLYPHS = {
    E: ["111", "100", "110", "100", "111"],
    n: ["000", "110", "101", "101", "101"],
    t: ["010", "111", "010", "010", "011"],
    r: ["000", "110", "101", "100", "100"],
    O: ["111", "101", "101", "101", "111"],
    o: ["000", "111", "101", "101", "111"],
    p: ["000", "110", "101", "110", "100", "100"],
    y: ["000", "101", "101", "011", "001", "110"],
    g: ["000", "111", "101", "111", "001", "110"],
    q: ["000", "111", "101", "111", "001", "001"],
    j: ["001", "000", "001", "001", "101", "010"],
    B: ["110", "101", "110", "101", "110"],
    L: ["100", "100", "100", "100", "111"],
    a: ["000", "010", "101", "111", "101"],
    b: ["100", "100", "110", "101", "110"],
    d: ["001", "001", "011", "101", "011"],
    c: ["000", "011", "100", "100", "011"],
    e: ["000", "010", "111", "100", "011"],
    f: ["011", "010", "111", "010", "010"],
    h: ["100", "100", "110", "101", "101"],
    i: ["010", "000", "010", "010", "010"],
    k: ["100", "101", "110", "101", "101"],
    l: ["110", "010", "010", "010", "011"],
    m: ["00000", "11010", "10101", "10101", "10101"],
    s: ["000", "011", "110", "001", "110"],
    u: ["000", "101", "101", "101", "011"],
    v: ["000", "101", "101", "101", "010"],
    w: ["00000", "10001", "10101", "10101", "01010"],
    x: ["000", "101", "010", "010", "101"],
    z: ["000", "111", "001", "010", "111"],
    A: ["010", "101", "111", "101", "101"],
    C: ["011", "100", "100", "100", "011"],
    D: ["110", "101", "101", "101", "110"],
    F: ["111", "100", "110", "100", "100"],
    H: ["101", "101", "111", "101", "101"],
    M: ["10001", "11011", "10101", "10001", "10001"],
    P: ["110", "101", "110", "100", "100"],
    R: ["1110", "1001", "1110", "1010", "1001"],
    S: ["011", "100", "010", "001", "110"],
    T: ["111", "010", "010", "010", "010"],
    W: ["10001", "10001", "10101", "10101", "01010"],
    X: ["101", "101", "010", "101", "101"],
    G: ["01110", "10000", "10111", "10001", "01110"],
    I: ["111", "010", "010", "010", "111"],
    J: ["001", "001", "001", "101", "010"],
    K: ["1001", "1010", "1100", "1010", "1001"],
    N: ["10001", "11001", "10101", "10011", "10001"],
    Q: ["01110", "10001", "10101", "10010", "01101"],
    U: ["101", "101", "101", "101", "111"],
    V: ["101", "101", "101", "101", "010"],
    Y: ["101", "101", "010", "010", "010"],
    Z: ["111", "001", "010", "100", "111"],
    "/": ["001", "001", "010", "100", "100"],
    0: ["111", "101", "101", "101", "111"],
    1: ["010", "110", "010", "010", "111"],
    2: ["111", "001", "111", "100", "111"],
    3: ["111", "001", "111", "001", "111"],
    4: ["101", "101", "111", "001", "001"],
    5: ["111", "100", "111", "001", "111"],
    6: ["111", "100", "111", "101", "111"],
    7: ["111", "001", "001", "001", "001"],
    8: ["111", "101", "111", "101", "111"],
    9: ["111", "101", "111", "001", "111"],
    ":": ["000", "010", "000", "010", "000"],
    "!": ["010", "010", "010", "000", "010"],
    "?": ["111", "001", "011", "000", "010"],
    "+": ["000", "010", "111", "010", "000"],
    "-": ["000", "000", "111", "000", "000"],
    ".": ["000", "000", "000", "000", "010"],
    "'": ["010", "010", "000", "000", "000"],
    "&": ["010", "101", "010", "101", "011"]
  };
  const SIGN_NS = "http://www.w3.org/2000/svg";
  // Collapse whitespace: markup may wrap a sign across lines but the lettering needs one run of words.
  const signText = (raw) => raw.replace(/\s+/g, " ").trim();
  const lettering = (raw) => {
    const text = signText(raw);
    let cells = -1;
    for (const ch of text) cells += ch === " " ? 2 : 4;
    const svg = document.createElementNS(SIGN_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${cells} 6`);
    svg.setAttribute("class", "sign");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(SIGN_NS, "path");
    let d = "", cursor = 0;
    for (const ch of text) {
      if (ch === " ") {
        cursor += 2;
        continue;
      }
      const glyph = SIGN_GLYPHS[ch];
      if (!glyph) throw new Error(`No cave-sign glyph for "${ch}"`);
      const sx = 3 / glyph[0].length, pixel = 0.82 * sx;
      for (let row = 0; row < glyph.length; row++) {
        for (let col = 0; col < glyph[row].length; col++) {
          if (glyph[row][col] === "1") d += `M${cursor + col * sx} ${row}h${pixel}v.82h-${pixel}z`;
        }
      }
      cursor += 4;
    }
    path.setAttribute("d", d);
    path.setAttribute("fill", "currentColor");
    svg.append(path);
    return svg;
  };
  // Letters a sign; called again when a sign's words change (a drop that was lost, not landed).
  const letter = (el, words = el.textContent) => {
    const text = signText(words);
    el.setAttribute("aria-label", text);
    el.replaceChildren(lettering(text));
  };
  BL.signGlyphs = { SIGN_GLYPHS, lettering, letter };
})();
