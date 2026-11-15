// The jumbotron's 5x7 alphabet, the page's other shared alphabet: the Oogatron board, the Mempool cave's wall panels,
// the arcade's screens and the donation kiosk all set from it, and an unknown character draws as a box. Nothing here
// reads anything at load but window.BL, so Ooga Chat's Feed the Oogas kiosk shares it (scripts/ooga-chat.mjs SHARED);
// jumbotron.js re-exports it as `BL.jumbotron.text`.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const FONT = {
    A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
    B: [0b11110, 0b10001, 0b11110, 0b10001, 0b10001, 0b10001, 0b11110],
    C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
    D: [0b11100, 0b10010, 0b10001, 0b10001, 0b10001, 0b10010, 0b11100],
    E: [0b11111, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000, 0b11111],
    F: [0b11111, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000, 0b10000],
    G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
    H: [0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001, 0b10001],
    I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
    J: [0b00111, 0b00010, 0b00010, 0b00010, 0b10010, 0b10010, 0b01100],
    K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
    L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
    M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
    N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
    O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
    P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
    Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
    R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
    S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
    T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
    U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
    V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
    W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
    X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
    Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
    Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
    0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
    1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
    2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
    3: [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
    4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
    5: [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
    6: [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
    7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
    8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
    9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
    " ": [0, 0, 0, 0, 0, 0, 0],
    "-": [0, 0, 0, 0b01110, 0, 0, 0],
    "_": [0, 0, 0, 0, 0, 0, 0b11111],
    ".": [0, 0, 0, 0, 0, 0b00110, 0b00110],
    "·": [0, 0, 0, 0b00100, 0, 0, 0],
    ",": [0, 0, 0, 0, 0, 0b00100, 0b01000],
    ":": [0, 0b00110, 0b00110, 0, 0b00110, 0b00110, 0],
    "/": [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
    "%": [0b11001, 0b11010, 0b00010, 0b00100, 0b01000, 0b01011, 0b10011],
    "(": [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
    ")": [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
    "+": [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
    "*": [0, 0b10101, 0b01110, 0b11111, 0b01110, 0b10101, 0],
    "'": [0b00100, 0b00100, 0, 0, 0, 0, 0],
    "!": [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
    "?": [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0, 0b00100],
    $: [0b00100, 0b01111, 0b10100, 0b01110, 0b00101, 0b11110, 0b00100]
  };
  const FALLBACK_GLYPH = [0b11111, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11111];
  const GLYPH_W = 5, GLYPH_H = 7, TRACKING = 1;

  const glyphOf = (ch) => FONT[ch.toUpperCase()] || FALLBACK_GLYPH;
  const measureText = (text, scale = 1) =>
    text.length === 0 ? 0 : (text.length * (GLYPH_W + TRACKING) - TRACKING) * scale;
  const drawText = (ctx, text, x, y, color, scale = 1) => {
    ctx.fillStyle = color;
    let cx = x;
    for (const ch of text) {
      const rows = glyphOf(ch);
      for (let r = 0; r < GLYPH_H; r++) {
        const bits = rows[r];
        for (let c = 0; c < GLYPH_W; c++) {
          if (bits & (1 << (GLYPH_W - 1 - c))) ctx.fillRect(cx + c * scale, y + r * scale, scale, scale);
        }
      }
      cx += (GLYPH_W + TRACKING) * scale;
    }
  };
  const fitText = (text, maxWidth, scale = 1) => {
    const perChar = (GLYPH_W + TRACKING) * scale;
    const maxChars = Math.max(0, Math.floor((maxWidth + TRACKING * scale) / perChar));
    return text.length <= maxChars ? text : text.slice(0, maxChars);
  };

  BL.jumbotronFont = { FONT, GLYPH_W, GLYPH_H, TRACKING, glyphOf, measureText, drawText, fitText };
})();
