(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 285;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const gmul = (a, b) => a && b ? EXP[LOG[a] + LOG[b]] : 0;
  const rsGenerator = (degree) => {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gmul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  };
  const rsRemainder = (data, degree) => {
    const gen = rsGenerator(degree);
    const rem = new Uint8Array(degree);
    for (const byte of data) {
      const factor = byte ^ rem[0];
      rem.copyWithin(0, 1);
      rem[degree - 1] = 0;
      if (factor) for (let i = 0; i < degree; i++) rem[i] ^= gmul(gen[i + 1], factor);
    }
    return rem;
  };
  const BLOCKS = {
    1: [10, [1, 16]],
    2: [16, [1, 28]],
    3: [26, [1, 44]],
    4: [18, [2, 32]],
    5: [24, [2, 43]],
    6: [16, [4, 27]],
    7: [18, [4, 31]],
    8: [22, [2, 38], [2, 39]],
    9: [22, [3, 36], [2, 37]],
    10: [26, [4, 43], [1, 44]]
  };
  const ALIGN = {
    1: [],
    2: [6, 18],
    3: [6, 22],
    4: [6, 26],
    5: [6, 30],
    6: [6, 34],
    7: [6, 22, 38],
    8: [6, 24, 42],
    9: [6, 26, 46],
    10: [6, 28, 50]
  };
  const dataCodewords = (version) => BLOCKS[version].slice(1).reduce((sum, [count, len]) => sum + count * len, 0);
  const chooseVersion = (byteLength) => {
    for (let v = 1; v <= 10; v++) {
      const capacityBits = dataCodewords(v) * 8 - 4 - (v <= 9 ? 8 : 16);
      if (byteLength * 8 <= capacityBits) return v;
    }
    throw new RangeError("QR payload too long (max 213 bytes at ECC M)");
  };
  const buildCodewords = (bytes, version) => {
    const bits = [];
    const pushBits = (value, count) => {
      for (let i = count - 1; i >= 0; i--) bits.push(value >>> i & 1);
    };
    pushBits(4, 4);
    pushBits(bytes.length, version <= 9 ? 8 : 16);
    for (const b of bytes) pushBits(b, 8);
    const total = dataCodewords(version);
    pushBits(0, Math.min(4, total * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = byte << 1 | bits[i + j];
      data.push(byte);
    }
    for (let pad = 236; data.length < total; pad ^= 253) data.push(pad);
    const [ecLen, ...groups] = BLOCKS[version];
    const blocks = [];
    let offset = 0;
    for (const [count, len] of groups) {
      for (let i = 0; i < count; i++) {
        const d = data.slice(offset, offset + len);
        offset += len;
        blocks.push({ d, e: rsRemainder(d, ecLen) });
      }
    }
    const out = [];
    const maxLen = Math.max(...blocks.map((b) => b.d.length));
    for (let i = 0; i < maxLen; i++) {
      for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
    }
    for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.e[i]);
    return out;
  };
  const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
    (x, y) => x * y % 2 + x * y % 3 === 0,
    (x, y) => (x * y % 2 + x * y % 3) % 2 === 0,
    (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0
  ];
  const bch = (value, degree, poly) => {
    let rem = value;
    for (let i = 0; i < degree; i++) rem = rem << 1 ^ (rem >>> degree - 1) * poly;
    return rem;
  };
  const buildMatrix = (version, codewords) => {
    const size = 17 + 4 * version;
    const modules = new Uint8Array(size * size);
    const isFunc = new Uint8Array(size * size);
    const set = (x, y, dark) => {
      modules[y * size + x] = dark ? 1 : 0;
      isFunc[y * size + x] = 1;
    };
    const drawFinder = (cx, cy) => {
      for (let dy = -1; dy <= 7; dy++) {
        for (let dx = -1; dx <= 7; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          const inside = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
          const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
          set(x, y, inside && ring !== 2);
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(size - 7, 0);
    drawFinder(0, size - 7);
    for (let i = 8; i < size - 8; i++) {
      set(i, 6, i % 2 === 0);
      set(6, i, i % 2 === 0);
    }
    const centers = ALIGN[version];
    const last = centers[centers.length - 1];
    for (const cy of centers) {
      for (const cx of centers) {
        const onFinder = cx === 6 && cy === 6 || cx === 6 && cy === last || cx === last && cy === 6;
        if (onFinder) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
          }
        }
      }
    }
    set(8, size - 8, true);
    for (let i = 0; i <= 8; i++) {
      if (i !== 6) {
        set(8, i, false);
        set(i, 8, false);
      }
    }
    for (let i = 0; i < 8; i++) {
      set(size - 1 - i, 8, false);
      if (i < 7) set(8, size - 1 - i, false);
    }
    set(8, size - 8, true);
    if (version >= 7) {
      const vbits = version << 12 | bch(version, 12, 7973);
      for (let i = 0; i < 18; i++) {
        const bit = vbits >>> i & 1;
        const a = Math.floor(i / 3);
        const b = size - 11 + i % 3;
        set(a, b, bit);
        set(b, a, bit);
      }
    }
    const totalBits = codewords.length * 8;
    let bitIndex = 0;
    let upward = true;
    for (let col = size - 1; col >= 1; col -= 2) {
      if (col === 6) col = 5;
      for (let i = 0; i < size; i++) {
        const y = upward ? size - 1 - i : i;
        for (const x of [col, col - 1]) {
          if (isFunc[y * size + x]) continue;
          let bit = 0;
          if (bitIndex < totalBits) {
            bit = codewords[bitIndex >> 3] >>> 7 - (bitIndex & 7) & 1;
          }
          bitIndex++;
          modules[y * size + x] = bit;
        }
      }
      upward = !upward;
    }
    return { size, modules, isFunc };
  };
  const drawFormat = (matrix, mask) => {
    const { size, modules } = matrix;
    const data = 0 << 3 | mask;
    const fmt = (data << 10 | bch(data, 10, 1335)) ^ 21522;
    const bit = (i) => fmt >>> i & 1;
    const put = (x, y, v) => {
      modules[y * size + x] = v;
    };
    for (let i = 0; i <= 5; i++) put(8, i, bit(i));
    put(8, 7, bit(6));
    put(8, 8, bit(7));
    put(7, 8, bit(8));
    for (let i = 9; i < 15; i++) put(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) put(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) put(8, size - 15 + i, bit(i));
    put(8, size - 8, 1);
  };
  const penalty = (matrix) => {
    const { size, modules } = matrix;
    const at = (x, y) => modules[y * size + x];
    let score = 0;
    for (let axis = 0; axis < 2; axis++) {
      for (let a = 0; a < size; a++) {
        let run = 1;
        let history = "";
        let prev = -1;
        for (let b = 0; b < size; b++) {
          const cell = axis ? at(a, b) : at(b, a);
          if (cell === prev) {
            run++;
            if (run === 5) score += 3;
            else if (run > 5) score += 1;
          } else {
            run = 1;
            prev = cell;
          }
          history += cell;
        }
        for (let i = 0; i + 11 <= size; i++) {
          const window2 = history.slice(i, i + 11);
          if (window2 === "00001011101" || window2 === "10111010000") score += 40;
        }
      }
    }
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = at(x, y);
        if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) score += 3;
      }
    }
    let dark = 0;
    for (const cell of modules) dark += cell;
    score += Math.floor(Math.abs(dark * 100 / (size * size) - 50) / 5) * 10;
    return score;
  };
  const encode = (text, options = {}) => {
    const bytes = new TextEncoder().encode(text);
    const version = chooseVersion(bytes.length);
    const codewords = buildCodewords(bytes, version);
    const base = buildMatrix(version, codewords);
    const { size, isFunc } = base;
    let best = null;
    const candidates = options.forceMask == null ? [0, 1, 2, 3, 4, 5, 6, 7] : [options.forceMask];
    for (const mask of candidates) {
      const matrix = { size, modules: base.modules.slice() };
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (!isFunc[y * size + x] && MASKS[mask](x, y)) matrix.modules[y * size + x] ^= 1;
        }
      }
      drawFormat(matrix, mask);
      const score = penalty(matrix);
      if (!best || score < best.score) best = { matrix, score, mask };
    }
    return { size, version, mask: best.mask, modules: best.matrix.modules };
  };
  const drawTo = (canvas, text, options = {}) => {
    const { quiet = 4, dark = "#0a0c0a", light = "#e8ffe1", scale = 4 } = options;
    const { size, modules } = encode(text, options);
    const span = size + quiet * 2;
    canvas.width = span * scale;
    canvas.height = span * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = dark;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (modules[y * size + x]) {
          ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
        }
      }
    }
  };
  BL.qr = { encode, drawTo };
})();
