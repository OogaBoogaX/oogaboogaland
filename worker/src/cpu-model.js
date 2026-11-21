// The CPU estimate the World Map (/api/world, world.js) and the inspector's page (inspect-page.js) show. A Worker
// cannot time its own CPU (its clocks stand still while its code runs), so this is a model, not a measurement:
// Cloudflare's published throughput for one Durable Object, about 600 messages a second parsed and validated and about
// 1,000 simple ones passed through (developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/),
// read as each message in taking 1/600 s of the object's one thread and each send out 1/1000 s. `budgetMs` is that
// thread: 1,000 ms of it each second. What the Cloudflare dashboard's Durable Objects metrics show is the measure.
export const CPU_MODEL = Object.freeze({ inMs: 1000 / 600, outMs: 1, budgetMs: 1000 });

/** Estimated CPU, in milliseconds a second, for messages in and sends out a second. */
export const cpuMs = (rates) => Math.round(((rates && rates.in || 0) * CPU_MODEL.inMs + (rates && rates.out || 0) * CPU_MODEL.outMs) * 100) / 100;
