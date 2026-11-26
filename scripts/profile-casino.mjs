// Run against a separately staged before or after build. Each trial gets a fresh Chrome profile.
// Optionally supply a second origin for alternating, paired comparisons.
import { launch } from "../test/browser.mjs";

const origins = process.argv.slice(2);
if (!origins.length) origins.push("http://127.0.0.1:4187");
const trials = Number(process.env.TRIALS || 3);
const init = `
  window.longRecordingBytes = 0;
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    const audio = this.buffer;
    if (audio?.duration > 30) window.longRecordingBytes = Math.max(window.longRecordingBytes, audio.length * audio.numberOfChannels * 4);
    return start.apply(this, args);
  };
  function ready() {
    if (window.BL?.scenes?.poker?.debug?.poker?.room && document.querySelector("#poker .game-intro-go")) {
      window.casinoReady = performance.now();
      window.casinoTransfer = [...performance.getEntriesByType("navigation"),...performance.getEntriesByType("resource")].reduce((sum,r)=>sum+r.transferSize,0);
    }
    else requestAnimationFrame(ready);
  }
  requestAnimationFrame(ready);`;
const sample = `(async () => {
  const P = BL.scenes.poker.debug.poker, renderer = __ooga.renderer;
  // Compare identical artwork and rendering cost. Normal gameplay retains automatic tier selection.
  const setQuality = renderer.setQuality;
  setQuality("high"); renderer.setQuality = () => {};
  try {
    await new Promise(resolve => setTimeout(resolve, 700));
    const observer = new MutationObserver(() => {});
    observer.observe(document.querySelector('[data-poker="tables"]'), {subtree:true, attributes:true, childList:true, characterData:true});
    const start = performance.now();
    for (let i = 0; i < 30; i++) P.action("pause");
    const hudMs = performance.now() - start, hiddenRowMutations = observer.takeRecords().length;
    observer.disconnect();
    const frames = []; let previous = performance.now();
    for (let i = 0; i < 130; i++) {
      await new Promise(requestAnimationFrame);
      const now = performance.now(); if (i >= 10) frames.push(now - previous); previous = now;
    }
    frames.sort((a,b) => a-b);
    return {renderer:renderer.kind, quality:renderer.quality, frameP50Ms:frames[59], frameP95Ms:frames[113],
      hudMs, hiddenRowMutations, recording:P.audio.stats.playlist.playing, recordingBufferBytes:longRecordingBytes};
  } finally { renderer.setQuality = setQuality; }
})()`;
async function run(origin, trial) {
  const b = await launch({w:390, h:844, mobile:true, perf:true, startupMs:60000});
  try {
    await b.send("Page.addScriptToEvaluateOnNewDocument", {source:init});
    const url = new URL("/?scene=poker&debug=1&nosim=1&net=0&glstats=1&welcome=0&pos=0",origin).href;
    async function visit() {
      await b.open(url);
      for (let i = 0; i < 500; i++) {
        if (await b.evaluate("!!window.casinoReady").catch(()=>false)) return await b.evaluate("({readyMs:casinoReady,transferBytes:casinoTransfer})");
        await b.sleep(80);
      }
      throw Error("Casino did not open");
    }
    const cold = await visit();
    const center = await b.evaluate('(()=>{const r=document.querySelector("#poker .game-intro-go").getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()');
    await b.click(...center);
    await b.evaluate('BL.scenes.poker.debug.poker.action("quick")');
    for (let i = 0; i < 150 && !await b.evaluate("!!BL.scenes.poker.debug.poker.audio.stats.playlist.playing"); i++) await b.sleep(100);
    const result = await b.evaluate(sample);
    if (!result.recording || result.quality !== "high") throw Error("Expected a recording and High quality");
    const htmlBytes = await b.evaluate('performance.getEntriesByType("navigation")[0].decodedBodySize');
    await b.open("about:blank");
    const warm = await visit();
    return {trial,origin,htmlBytes,cold,warm,...result};
  } finally { await b.close(); }
}
const results = [];
for (let trial = 1; trial <= trials; trial++) {
  for (const origin of trial % 2 ? origins : [...origins].reverse()) {
    results.push(await run(origin,trial));
    console.error("Measured trial",trial,origin);
  }
}
console.log(JSON.stringify(results,null,2));
