// Explicit finite runner state. No timers, bindings, alarms or automatic start.
// One publication in flight and one latest revision awaiting an explicit flush.
// The caller advances simulation independently and wakes this runner when due.
import { HOST } from "./virtual-host.js";
import { ROLLING_CADENCE, BURST_CADENCE, emptyCadence, advanceCadence, nextCadenceAt } from "./host-cadence.js";
const time = n => Number.isSafeInteger(n) && n >= 0;
export class LatestHostPublication {
  constructor({ publish, until, clock = Date.now, cadence }) {
    const now = clock();
    if (typeof publish !== "function" || !time(now) || !time(until)
      || until <= now || until - now > HOST.maxRunMs || cadence !== undefined && ![ROLLING_CADENCE, BURST_CADENCE].includes(cadence)) throw Error("bounded publication run required");
    this.publish = publish; this.clock = clock; this.until = until;
    this.cadence = cadence; this.attempts = cadence ? emptyCadence(cadence) : null;
    this.lastNow = now; this.nextAt = now; this.commitAt = now; this.highest = 0; this.pending = null;
    this.active = null; this.closed = false;
    this.stats = { offered: 0, coalesced: 0, attempts: 0, published: 0, superseded: 0 };
  }
  now() {
    const now = this.clock();
    if (!time(now) || now < this.lastNow) { this.close(); throw Error("publication clock moved backwards"); }
    this.lastNow = now;
    if (now >= this.until) this.close();
    return now;
  }
  offer(sequence) {
    this.now();
    if (!time(sequence) || !sequence) throw Error("invalid publication revision");
    if (this.closed || sequence <= this.highest) return false;
    if (this.pending) this.stats.coalesced++;
    this.highest = sequence; this.pending = sequence; this.stats.offered++; return true;
  }
  state() {
    this.now();
    return { closed: this.closed, busy: !!this.active, pending: this.pending,
      nextAt: this.nextAt, commitAt: this.commitAt, until: this.until, stats: { ...this.stats } };
  }
  flush() {
    const now = this.now();
    if (this.active) return this.active;
    if (this.closed || !this.pending || now < this.nextAt)
      return Promise.resolve({ status: this.closed ? "closed" : !this.pending ? "idle" : "paced", nextAt: this.nextAt });
    const offered = this.pending, notBefore = this.commitAt; this.pending = null; this.stats.attempts++;
    // Do not spin on superseded states; attempts are bounded too. Publication
    // failures stop the runner. The one-shot coordinator reconciles uncertain
    // Room replies; this runner must never blindly retry a failed operation.
    if (this.attempts) { this.attempts = advanceCadence(this.attempts, now); this.nextAt = nextCadenceAt(this.attempts); }
    else this.nextAt = now + HOST.deliveryMs;
    this.active = Promise.resolve().then(() => {
      this.now();
      if (this.closed) return { status: "closed" };
      // Preparation may overlap the remaining delivery interval. The callback
      // waits until notBefore before its final ownership check and Room commit.
      return this.publish({ notBefore });
    }).then(result => {
      const finished = this.now();
      if (result?.status === "closed" && this.closed) return result;
      if (result?.status === "superseded") this.stats.superseded++;
      else {
        if (!["published", "reconciled"].includes(result?.status) || !time(result.sequence) || result.sequence < offered
          || !time(result.publishedAt) || result.publishedAt > finished
          || result.publishedAt < notBefore && result.duplicate !== true) throw Error("invalid committed publication result");
        if (result.cadence !== this.cadence || this.cadence && (!time(result.nextPublishAt)
          || result.nextPublishAt < result.publishedAt + 125 || result.nextPublishAt > result.publishedAt + 1000))
          throw Error("invalid committed publication cadence");
        this.commitAt = Math.max(this.commitAt, this.cadence ? result.nextPublishAt : result.publishedAt + HOST.deliveryMs);
        this.stats.published++;
        this.highest = Math.max(this.highest, result.sequence);
        // A newer committed read may already cover the one pending signal.
        if (this.pending && this.pending <= result.sequence) this.pending = null;
      }
      return result;
    }).catch(error => { this.close(); throw error; }).finally(() => { this.active = null; });
    return this.active;
  }
  close() { this.closed = true; this.pending = null; }
}
