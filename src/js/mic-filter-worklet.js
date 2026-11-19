// The keyboard noise filter's processor (voice.js `setKeyFilter`), an AudioWorklet module: never a script tag, so the
// page's build leaves it out, and `npm run site` stages it as js/mic-filter-<hash>.js (scripts/distribution-mic.mjs).
// A gate that opens on a voice and on nothing else. Key and mouse clicks are short and have no pitch; a voice has one.
// The microphone, mixed to one channel, runs through a DELAY_S delay line, and meanwhile a copy cut to the voice's low
// band at about 8 kHz is read every HOP_S over FRAME_S: a frame is voiced when it stands well over the room's tracked
// floor, sounds from its first hop to its last (each at least SPAN of the frame's mean, so a click, which fills only a
// corner of a frame, never counts) and repeats itself at some period between 75 and 400 Hz (normalized autocorrelation
// over PITCH). OPEN_FRAMES voiced frames, about 50 ms of pitched sound, open the gate, on sound the delay has not let out yet, so a word's start is kept; each voiced frame
// holds it open HOLD_S more, which carries the consonants and short gaps between; then it fades shut. Clicks under
// speech still pass; clicks between words do not; a long pitched ring (a struck desk) may. A heuristic. Nothing here allocates after construction.
"use strict";
const DELAY_S = 0.09, FRAME_S = 0.032, HOP_S = 0.01, HOLD_S = 0.34, ATTACK_S = 0.005, RELEASE_S = 0.06;
const PITCH = 0.55, OPEN_FRAMES = 3, OVER_FLOOR = 6, SPAN = 0.2, QUIET = 1e-6, FLOOR_RISE = 1.0014, SILENT = 1e-9, FLOOR_FRAMES = 8;

class MicFilter extends AudioWorkletProcessor {
  constructor() {
    super();
    const rate = sampleRate;
    this.every = Math.max(1, Math.round(rate / 8000));
    const low = rate / this.every;
    this.delay = new Float32Array(Math.round(DELAY_S * rate));
    this.at = 0;
    this.frame = new Float32Array(Math.round(FRAME_S * low));
    this.hop = Math.round(HOP_S * low);
    this.filled = this.frame.length - this.hop;
    this.lagMin = Math.max(2, Math.floor(low / 400));
    this.lagMax = Math.min(this.frame.length >> 1, Math.ceil(low / 75));
    // Two one-pole low-passes at 1.5 kHz ahead of the decimation, and a high-pass at 80 Hz after it.
    this.lp = 1 - Math.exp(-2 * Math.PI * 1500 / rate);
    this.hp = Math.exp(-2 * Math.PI * 80 / low);
    this.l1 = this.l2 = this.hx = this.hy = 0;
    this.skip = 0;
    // From the quietest a voice may be, never from the first frame: a filter that starts mid-sentence must still open.
    this.floor = QUIET;
    this.low = 0;
    this.lowRun = 0;
    this.run = 0;
    this.hold = 0;
    this.holdFor = Math.round(HOLD_S * rate);
    this.gain = 0;
    this.up = 1 / (ATTACK_S * rate);
    this.down = 1 / (RELEASE_S * rate);
    this.alive = true;
    this.port.onmessage = () => { this.alive = false; };
  }

  // The newest frame: voiced or not.
  voiced() {
    const x = this.frame, n = x.length;
    let energy = 0;
    for (let i = 0; i < n; i++) energy += x[i] * x[i];
    energy /= n;
    // The floor is a room's, never a closed microphone's: a muted or held track feeds zeros, which are no reading, and
    // it comes down only to the loudest of FLOOR_FRAMES quiet frames on end, which the tail into those zeros never is.
    if (energy < SILENT) { this.lowRun = 0; return false; }
    if (energy < this.floor) {
      if (!this.lowRun++ || energy > this.low) this.low = energy;
      if (this.lowRun === FLOOR_FRAMES) { this.floor = this.low; this.lowRun = 0; }
    } else { this.lowRun = 0; this.floor *= FLOOR_RISE; }
    if (energy < QUIET || energy < this.floor * OVER_FLOOR) return false;
    let first = 0, last = 0;
    for (let i = 0, h = this.hop; i < h; i++) { first += x[i] * x[i]; last += x[n - 1 - i] * x[n - 1 - i]; }
    if (Math.min(first, last) < SPAN * energy * this.hop) return false;
    for (let lag = this.lagMin; lag <= this.lagMax; lag++) {
      let cross = 0, a = 0, b = 0;
      for (let i = 0, m = n - lag; i < m; i++) {
        const p = x[i], q = x[i + lag];
        cross += p * q; a += p * p; b += q * q;
      }
      if (cross > 0 && cross * cross > PITCH * PITCH * a * b) return true;
    }
    return false;
  }

  process(inputs, outputs) {
    const input = inputs[0][0], output = outputs[0][0];
    if (!output) return this.alive;
    const delay = this.delay, size = delay.length, frame = this.frame;
    for (let i = 0; i < output.length; i++) {
      const sample = input ? input[i] : 0;
      this.l1 += this.lp * (sample - this.l1);
      this.l2 += this.lp * (this.l1 - this.l2);
      if (++this.skip >= this.every) {
        this.skip = 0;
        const y = this.l2 - this.hx + this.hp * this.hy;
        this.hx = this.l2; this.hy = y;
        frame[this.filled++] = y;
        if (this.filled === frame.length) {
          this.run = this.voiced() ? this.run + 1 : Math.max(0, this.run - 1);
          if (this.run >= OPEN_FRAMES) { this.run = OPEN_FRAMES; this.hold = this.holdFor; }
          frame.copyWithin(0, this.hop);
          this.filled = frame.length - this.hop;
        }
      }
      if (this.hold > 0) { this.hold--; if (this.gain < 1) this.gain = Math.min(1, this.gain + this.up); }
      else if (this.gain > 0) this.gain = Math.max(0, this.gain - this.down);
      output[i] = delay[this.at] * this.gain;
      delay[this.at] = sample;
      if (++this.at === size) this.at = 0;
    }
    return this.alive;
  }
}
registerProcessor("mic-filter", MicFilter);
