// The EntropyLab chalkboard's contract, shared unchanged by the classic page and the Worker (as chat-policy.js is):
// what a board holds and its limits, the original message, where the board stands, and the edits both sides apply
// the same way. A board is `{ marks, points }`: marks in drawing order, each a chalk or eraser line (`t` "c" or
// "e", width `s` 2 or 4, points `p` as x, y pairs from 0 to 1) or a typed character (`t` "t", `ch`, `p` its
// baseline's start), and `points` their point count. An edit travels as small integers (thousandths of the board)
// so a frame stays under the room's message limit:
//   { k: "line", m, p }   a new line, chalk or eraser (`m` "c" or "e"), from its first points (2 to CHUNK of them)
//   { k: "more", p }      more points (1 to CHUNK) on the line the session last started
//   { k: "type", c }      typed characters, up to TYPE_CHUNK [ch, x, y] triples
//   { k: "back" }         takes back the session's last typed character, if it is still the last mark
//   { k: "wipe", to }     "clean" leaves the board bare, "original" puts the original message back
// A session is `{ open, from }`: the line the editor is drawing (-1 for none) and the mark count when it began, so
// backspace never reaches anyone else's writing. Text is drawn on a canvas, never parsed as markup.
// The board's layout is VERSION 2: half as wide and half as tall again as the first, with the first board's marks
// in its middle (`widen`, which the room and the page apply once to what they stored before). Every chalk message a
// page sends carries `v`, so the room never takes an older page's thousandths of the smaller board.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const FEATURE = "chalk-v2", VERSION = 2;
  const MAX_MARKS = 550, MAX_POINTS = 10000, LINE_POINTS = 1000, CHUNK = 20, TYPE_CHUNK = 12;
  // Where the board stands on the island, its foot's middle and the way its face looks, and how near an Ooga's
  // feet must be to write: within REACH in front, within RISE of its foot. The hub places the board from the lab's
  // mouth and checks it matches this; the room checks the last pose a writer sent against it.
  const AT = Object.freeze({ x: -4.279, y: 0, z: -20.231, frontX: 0.207, frontZ: 0.978 });
  const REACH = 2.4, RISE = 1.2;
  const near = (x, feet, z) => {
    const dx = x - AT.x, dz = z - AT.z;
    return dx * dx + dz * dz < REACH * REACH && dx * AT.frontX + dz * AT.frontZ > 0 && Math.abs(feet - AT.y) < RISE;
  };
  // A first-layout board's marks on this one: the old face is two thirds of the new one each way, in its middle, so
  // what was drawn keeps its size and place on the board with a new margin all round.
  const edge = (v) => (v * 4 + 1) / 6;
  const widen = (marks) => marks.map((mark) => ({ ...mark, p: mark.p.map(edge) }));
  // The original message: two rows of hand-drawn binary, drawn on the first board and widened like any other.
  const initial = () => widen(first());
  const first = () => {
    const marks = [];
    for (const [row, text] of ["01101010110", "11111101101"].entries()) {
      for (let i = 0; i < text.length; i++) {
        const x = 0.5 + (i - (text.length - 1) / 2) * 0.075, y = 0.39 + row * 0.22, size = 1.75;
        const wobble = Math.sin(i * 8.1 + row * 3.2) * 0.003 * size;
        if (text[i] === "0") marks.push({ t: "c", p: [x - 0.011 * size, y - 0.041 * size, x + wobble, y - 0.047 * size,
          x + 0.014 * size, y - 0.027 * size, x + 0.016 * size, y + 0.021 * size, x + 0.008 * size, y + 0.046 * size,
          x - 0.011 * size, y + 0.04 * size, x - 0.016 * size, y + 0.009 * size, x - 0.011 * size, y - 0.041 * size] });
        else marks.push({ t: "c", p: [x - 0.014 * size, y - 0.022 * size, x, y - 0.045 * size,
          x + 0.004 * size + wobble, y + 0.043 * size, x - 0.013 * size, y + 0.045 * size, x + 0.018 * size, y + 0.042 * size] });
      }
    }
    return marks;
  };
  // Recognize the two built-in boards only when saving or wiping, never per point. Keep this reference private.
  const original = initial();
  const preset = (b) => {
    const marks = b.marks;
    if (!marks.length) return "clean";
    if (marks.length !== original.length) return null;
    for (let i = 0; i < marks.length; i++) {
      const a = marks[i], o = original[i];
      if (a.t !== o.t || a.s !== o.s || a.p.length !== o.p.length) return null;
      for (let j = 0; j < a.p.length; j++) if (a.p[j] !== o.p[j]) return null;
    }
    return "original";
  };
  const count = (marks) => marks.reduce((n, mark) => n + mark.p.length / 2, 0);
  const board = (marks = initial()) => ({ marks, points: count(marks) });
  const character = (ch) => typeof ch === "string" && Array.from(ch).length === 1 && !/[\x00-\x1f\x7f]/.test(ch);
  // Marks read back from storage (the page's own, or the room's): null unless every one is well formed and the
  // whole fits the limits.
  const restore = (saved) => {
    if (!Array.isArray(saved) || saved.length > MAX_MARKS) return null;
    let points = 0;
    for (const mark of saved) {
      if (!mark || !Array.isArray(mark.p)) return null;
      if (mark.t === "t") {
        if (!character(mark.ch) || mark.p.length !== 2) return null;
      } else if ((mark.t !== "c" && mark.t !== "e") || (mark.s !== undefined && mark.s !== 2 && mark.s !== 4)
        || mark.p.length < 2 || mark.p.length % 2 || mark.p.length > LINE_POINTS * 2) return null;
      points += mark.p.length / 2;
      if (points > MAX_POINTS || !mark.p.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1)) return null;
    }
    return saved;
  };
  const unit = (v) => Number.isInteger(v) && v >= 0 && v <= 1000;
  const pairs = (p, most) => Array.isArray(p) && p.length >= 2 && p.length <= most * 2 && p.length % 2 === 0 && p.every(unit);
  // An edit as it arrives from the network: a fresh, well-formed copy, or null.
  const parse = (op) => {
    if (!op || typeof op !== "object") return null;
    if (op.k === "line") return (op.m === "c" || op.m === "e") && pairs(op.p, CHUNK) && op.p.length >= 4 ? { k: "line", m: op.m, p: op.p.slice() } : null;
    if (op.k === "more") return pairs(op.p, CHUNK) ? { k: "more", p: op.p.slice() } : null;
    if (op.k === "type") {
      if (!Array.isArray(op.c) || !op.c.length || op.c.length > TYPE_CHUNK) return null;
      for (const c of op.c) if (!Array.isArray(c) || c.length !== 3 || !character(c[0]) || !unit(c[1]) || !unit(c[2])) return null;
      return { k: "type", c: op.c.map((c) => c.slice()) };
    }
    if (op.k === "back") return { k: "back" };
    if (op.k === "wipe") return op.to === "clean" || op.to === "original" ? { k: "wipe", to: op.to } : null;
    return null;
  };
  const session = (b) => ({ open: -1, from: b.marks.length });
  // Applies a parsed edit to the board in place; null when it applied, else why not. Text frames that would pass
  // either capacity limit are refused before changing the board or session; drawing stops at its point limits.
  const apply = (b, op, s) => {
    const marks = b.marks;
    if (op.k === "line") {
      if (marks.length >= MAX_MARKS || b.points + 2 > MAX_POINTS) return "full";
      marks.push({ t: op.m, s: op.m === "c" ? 2 : 4, p: [] });
      s.open = marks.length - 1;
      return more(b, op.p, s);
    }
    if (op.k === "more") return s.open >= 0 && s.open === marks.length - 1 ? more(b, op.p, s) : "closed";
    if (op.k === "type") {
      if (marks.length + op.c.length > MAX_MARKS || b.points + op.c.length > MAX_POINTS) return "full";
      s.open = -1;
      for (const [ch, x, y] of op.c) {
        marks.push({ t: "t", ch, p: [x / 1000, y / 1000] });
        b.points++;
      }
      return null;
    }
    if (op.k === "back") {
      s.open = -1;
      const last = marks[marks.length - 1];
      if (!last || last.t !== "t" || marks.length <= s.from) return "nothing";
      marks.pop();
      b.points--;
      return null;
    }
    if (op.k === "wipe") {
      marks.length = 0;
      if (op.to === "original") marks.push(...initial());
      b.points = count(marks);
      s.open = -1; s.from = 0;
      return null;
    }
    return "unknown";
  };
  const more = (b, p, s) => {
    const line = b.marks[s.open].p;
    for (let i = 0; i < p.length; i += 2) {
      if (b.points >= MAX_POINTS || line.length >= LINE_POINTS * 2) return null;
      line.push(p[i] / 1000, p[i + 1] / 1000);
      b.points++;
    }
    return null;
  };
  BL.chalkBoard = Object.freeze({ FEATURE, VERSION, MAX_MARKS, MAX_POINTS, LINE_POINTS, CHUNK, TYPE_CHUNK, AT, REACH, RISE, near, widen, initial, preset, board, restore, parse, session, apply });
})();
