// Site staging: the page's favicons as files at the addresses browsers and crawlers ask for, so none answers 404. The
// portable page keeps its embedded 32px and 64px PNGs; a staged page links them as /favicon-32.png and /favicon-64.png
// (their exact bytes), /favicon.ico holds both unchanged in an ICO directory, and /apple-touch-icon.png (with its
// -precomposed twin, which older iOS and many link previews ask for unlinked) is the 64px mark at exactly twice its
// size, centred on the page's theme colour, since iOS lays a transparent icon on black and rounds its corners.
// Keep an already staged touch icon unchanged, including the web app manifest's shared icon.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";

const ICONS = /<link rel="icon" type="image\/png" sizes="(32|64)x\1" href="data:image\/png;base64,([^"]+)">/g;
const TOUCH = 180, TOUCH_SCALE = 2;
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (kind, data) => {
  const head = Buffer.alloc(8), tail = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  head.write(kind, 4, "latin1");
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
};

// An 8-bit RGBA, non-interlaced PNG (the only kind the favicons are) as its pixels.
const decode = (png) => {
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error("favicon: not a PNG");
  let w = 0, h = 0;
  const idat = [];
  for (let o = 8; o < png.length;) {
    const len = png.readUInt32BE(o), kind = png.toString("latin1", o + 4, o + 8), data = png.subarray(o + 8, o + 8 + len);
    if (kind === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error("favicon: expected an 8-bit RGBA, non-interlaced PNG");
    }
    if (kind === "IDAT") idat.push(data);
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * 4, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)], line = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? px[y * stride + x - 4] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= 4 && y ? px[(y - 1) * stride + x - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const guess = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      if (guess === undefined) throw new Error("favicon: unknown PNG filter");
      px[y * stride + x] = (raw[line + x] + guess) & 255;
    }
  }
  return { w, h, px };
};
const encode = (w, h, px) => {
  const raw = Buffer.alloc(h * (w * 4 + 1)), ihdr = Buffer.alloc(13);
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
};

// The touch icon: the mark scaled up by whole pixels, no smoothing, laid over `background` and centred.
const touchIcon = (png, background) => {
  const { w, h, px } = decode(png), out = Buffer.alloc(TOUCH * TOUCH * 4);
  const bg = [1, 3, 5].map((k) => parseInt(background.slice(k, k + 2), 16)), x0 = (TOUCH - w * TOUCH_SCALE) / 2, y0 = (TOUCH - h * TOUCH_SCALE) / 2;
  if (x0 < 0 || y0 < 0 || x0 % 1 || y0 % 1) throw new Error("favicon: the touch icon's mark does not fit");
  for (let y = 0; y < TOUCH; y++) for (let x = 0; x < TOUCH; x++) {
    const sx = Math.floor((x - x0) / TOUCH_SCALE), sy = Math.floor((y - y0) / TOUCH_SCALE), o = (y * TOUCH + x) * 4;
    const i = sx >= 0 && sx < w && sy >= 0 && sy < h ? (sy * w + sx) * 4 : -1, a = i < 0 ? 0 : px[i + 3] / 255;
    for (let k = 0; k < 3; k++) out[o + k] = Math.round((i < 0 ? 0 : px[i + k]) * a + bg[k] * (1 - a));
    out[o + 3] = 255;
  }
  return encode(TOUCH, TOUCH, out);
};

// An ICO directory of PNG images, each kept byte for byte.
const ico = (pngs) => {
  const head = Buffer.alloc(6 + pngs.length * 16);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, bytes }, k) => {
    const e = 6 + k * 16;
    head[e] = head[e + 1] = size % 256;
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(bytes.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += bytes.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.bytes)]);
};

export function stageIcons(html, out) {
  const found = [...html.matchAll(ICONS)].map(([, size, data]) => ({ size: Number(size), bytes: Buffer.from(data, "base64") }));
  if (found.length !== 2) throw new Error("oogaboogaland.html: expected 32px and 64px PNG favicons");
  const theme = html.match(/<meta name="theme-color" content="(#[0-9a-f]{6})">/i);
  if (!theme) throw new Error("oogaboogaland.html: expected a #rrggbb theme-color");
  for (const { size, bytes } of found) {
    const { w, h } = decode(bytes);
    if (w !== size || h !== size) throw new Error(`favicon: the ${size}px icon is ${w}x${h}`);
    writeFileSync(join(out, `favicon-${size}.png`), bytes);
  }
  writeFileSync(join(out, "favicon.ico"), ico(found));
  const touchPath = join(out, "apple-touch-icon.png");
  const touch = existsSync(touchPath) ? readFileSync(touchPath) : touchIcon(found.find((p) => p.size === 64).bytes, theme[1]);
  for (const file of ["apple-touch-icon.png", "apple-touch-icon-precomposed.png"]) writeFileSync(join(out, file), touch);
  // The portable page embeds its touch icon (scripts/build.mjs); a staged page links the file written above instead.
  html = html.replace(/(<link rel="apple-touch-icon" sizes="\d+x\d+" href=")data:image\/png;base64,[^"]+(">)/, "$1/apple-touch-icon.png$2");
  let touchLinked = /<link\b[^>]*\brel="apple-touch-icon"/.test(html);
  return html.replace(ICONS, (_, size) => {
    const link = `<link rel="icon" type="image/png" sizes="${size}x${size}" href="/favicon-${size}.png">`;
    if (touchLinked) return link;
    touchLinked = true;
    return `${link}\n  <link rel="apple-touch-icon" sizes="${TOUCH}x${TOUCH}" href="/apple-touch-icon.png">`;
  });
}
