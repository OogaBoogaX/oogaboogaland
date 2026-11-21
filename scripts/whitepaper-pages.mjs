// Pulls bitcoin.org/bitcoin.pdf and bakes its pages into src/js/whitepaper-pages.js for the Genesis room (Room 8 of the
// Timechain Sphere): pdftoppm (poppler), each page's white margins cut back by 60% so the text reads bigger, the box
// padded with the page's own paper to one aspect, greyscale, the pages stacked into one tall strip with a dark gap
// between them, WebP at quality 75 through cwebp, base64 into the module. One strip is one picture the large reader
// scrolls, and the pop-up cuts its pages from it. Committed, so the page needs no PDF reader and no third-party script:
// bitcoin.org sends no CORS header, and rasterising a PDF in the browser would take an external library. Adapted from
// stacktoshi's whitepaper monolith (#354, removed in #539). Run `node scripts/whitepaper-pages.mjs` (cwebp required);
// on any failure it keeps the committed file.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "src", "js", "whitepaper-pages.js");
const source = "https://bitcoin.org/bitcoin.pdf";
const width = 1280, quality = 75, measureDpi = 50;
// What is left of each margin: 0.4 takes 60% of it off, which is what makes the text read bigger on the stone.
const margin = 0.4;
// The gap between the pages in the strip: a dark band, so a page boundary reads while the document slides.
const gapInk = 22;
// The aspect the cropped page is padded to with its own paper (the monolith's face in #354, kept so the strip reads the
// same; a page's own aspect is 0.707).
const face = 1.62 / 2.145;

// A PGM from pdftoppm -gray: P5, the comment-free header pdftoppm writes, then one byte a pixel.
const readPgm = (path) => {
  const data = readFileSync(path);
  let at = 0;
  const fields = [];
  while (fields.length < 4) {
    while (at < data.length && data[at] === 0x23) { while (data[at] !== 0x0a) at++; at++; }
    while (at < data.length && data[at] <= 0x20) at++;
    const start = at;
    while (at < data.length && data[at] > 0x20) at++;
    fields.push(Number(data.subarray(start, at).toString("latin1")));
  }
  while (at < data.length && data[at] <= 0x20) at++;
  return { width: fields[1], height: fields[2], pixels: data.subarray(at) };
};

const has = (command) => {
  try {
    execFileSync("sh", ["-c", `command -v ${command}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const dir = mkdtempSync(join(tmpdir(), "ooga-whitepaper-"));
try {
  const pdf = join(dir, "bitcoin.pdf");
  const response = await fetch(source);
  if (!response.ok) throw new Error(`${source} answered ${response.status}`);
  writeFileSync(pdf, Buffer.from(await response.arrayBuffer()));

  // Where the ink sits on the page, taken over every page so each is cut and scaled the same.
  execFileSync("pdftoppm", ["-gray", "-r", String(measureDpi), pdf, join(dir, "measure")], { stdio: "ignore" });
  let ink = null;
  for (const name of readdirSync(dir).filter((file) => file.startsWith("measure-") && file.endsWith(".pgm"))) {
    const page = readPgm(join(dir, name));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let y = 0; y < page.height; y++) for (let x = 0; x < page.width; x++) {
      if (page.pixels[y * page.width + x] < 200) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < x0) continue;
    const box = { x0: x0 / page.width, y0: y0 / page.height, x1: (x1 + 1) / page.width, y1: (y1 + 1) / page.height, aspect: page.width / page.height };
    ink = ink ? { x0: Math.min(ink.x0, box.x0), y0: Math.min(ink.y0, box.y0), x1: Math.max(ink.x1, box.x1), y1: Math.max(ink.y1, box.y1), aspect: box.aspect } : box;
  }
  if (!ink) throw new Error("no ink found on the pages");

  // What is left of the margins, then enough of the page's paper round it to match the stone's face.
  let left = ink.x0 * margin, right = (1 - ink.x1) * margin, top = ink.y0 * margin, bottom = (1 - ink.y1) * margin;
  let boxW = 1 - left - right, boxH = 1 - top - bottom;
  if (boxW / boxH < face * ink.aspect) {
    const widen = boxH * face / ink.aspect;
    left -= (widen - boxW) / 2;
    right -= (widen - boxW) / 2;
    boxW = widen;
  } else {
    const height = boxW * ink.aspect / face;
    top -= (height - boxH) / 2;
    bottom -= (height - boxH) / 2;
    boxH = height;
  }

  // The page at the output's scale, cropped to that box: -x/-y/-W/-H are pixels at -scale-to-x.
  const scale = Math.round(width / boxW), pageW = scale, pageH = scale / ink.aspect;
  const crop = { x: Math.round(left * pageW), y: Math.round(top * pageH), w: width, h: Math.round(boxH * pageH) };
  execFileSync("pdftoppm", ["-gray", "-scale-to-x", String(pageW), "-scale-to-y", String(Math.round(pageH)),
    "-x", String(crop.x), "-y", String(crop.y), "-W", String(crop.w), "-H", String(crop.h), pdf, join(dir, "page")], { stdio: "ignore" });
  const pages = readdirSync(dir).filter((name) => name.startsWith("page-") && name.endsWith(".pgm"))
    .sort((a, b) => Number(a.slice(5, -4)) - Number(b.slice(5, -4)));
  if (!pages.length) throw new Error("pdftoppm wrote no pages");

  // The cropped page's own size: the width is the output's, the height what the box left of the page.
  const pageHeight = crop.h;

  // The pages stacked into one strip, a dark gap of the monolith's own stone between them, so the reader slides the
  // document up and down inside the stone's face as a viewer scrolls one: one picture, one texture, one draw.
  const gap = Math.round(pageHeight * 0.022), count = pages.length, height = count * pageHeight + (count - 1) * gap;
  if (height > 16384) throw new Error(`the strip is ${height} px tall, past what a texture holds`);
  const strip = Buffer.alloc(width * height, gapInk);
  for (let i = 0; i < count; i++) {
    const page = readPgm(join(dir, pages[i]));
    if (page.width !== width || page.height !== pageHeight) throw new Error(`${pages[i]} is ${page.width}x${page.height}`);
    const top = i * (pageHeight + gap);
    for (let y = 0; y < pageHeight; y++) page.pixels.copy(strip, (top + y) * width, y * width, (y + 1) * width);
  }
  if (!has("cwebp")) throw new Error("cwebp is needed to encode the strip");
  const pgm = join(dir, "strip.pgm"), webp = join(dir, "strip.webp");
  writeFileSync(pgm, Buffer.concat([Buffer.from(`P5\n${width} ${height}\n255\n`, "latin1"), strip]));
  execFileSync("cwebp", ["-quiet", "-q", String(quality), pgm, "-o", webp], { stdio: "ignore" });
  const data = readFileSync(webp);

  const module = `// Bitcoin: A Peer-to-Peer Electronic Cash System, the ${count} pages bitcoin.org/bitcoin.pdf serves, as one tall greyscale
// strip: each page's white margins cut back by 60% so the text reads bigger, the pages stacked with a dark gap between
// them, WebP q${quality}, base64, baked by scripts/whitepaper-pages.mjs (pdftoppm and cwebp). The strip and its script are
// stacktoshi's, from the whitepaper monolith (PR #354, removed from the mainland in #539); the Genesis room's large
// reader scrolls the same strip in a full-screen window, and its pop-up cuts its pages from it (\`load\`). bitcoin.org
// publishes the paper under the MIT licence (its footer: "Released under the MIT license"); the text and figures are
// reproduced unchanged. Regenerate with \`node scripts/whitepaper-pages.mjs\`.
//
// bitcoin.org's licence (github.com/bitcoin-dot-org/Bitcoin.org, LICENSE):
//
// Copyright (c) 2009-2026 Bitcoin.org
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of
// the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
// WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
// COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const D = BL.whitepaperPages = {
    licence: "MIT (bitcoin.org)", source: "https://bitcoin.org/bitcoin.pdf",
    width: ${width}, height: ${height}, page: ${pageHeight}, gap: ${gap}, count: ${count},
    strip: "data:image/webp;base64,${data.toString("base64")}",
    pages: [], ready: null,
    // The strip decoded once; each page cut from it as its own JPEG data URL (one a frame) for the pop-up's page mode.
    load() {
      if (D.ready) return D.ready;
      D.ready = new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas"); c.width = D.width; c.height = D.page;
          const ctx = c.getContext("2d");
          let i = 0;
          const cut = () => {
            // The decoded strip (some 80 MB of pixels) is let go with the canvas once the last page is cut.
            if (i >= D.count) { c.width = c.height = 0; img.src = ""; resolve(D); return; }
            ctx.drawImage(img, 0, i * (D.page + D.gap), D.width, D.page, 0, 0, D.width, D.page);
            D.pages[i++] = c.toDataURL("image/jpeg", 0.88);
            requestAnimationFrame(cut);
          };
          cut();
        };
        img.onerror = () => resolve(D);
        img.src = D.strip;
      });
      return D.ready;
    }
  };
})();
`;
  writeFileSync(out, module);
  console.log(`wrote ${out}: ${count} pages at ${width}x${pageHeight}, a ${width}x${height} strip, ${(Buffer.byteLength(module) / 1024 / 1024).toFixed(2)} MB`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
