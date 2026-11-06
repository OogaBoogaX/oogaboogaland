// Compact Clanker motion only. Account, world and profile are retained by the
// authenticated handoff; this payload cannot select or replace any of them.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {}, TYPE = "body-motion-1", FEATURE = "host-body-motion-v1";
  const fail = () => { throw Error("invalid compact body motion"); };
  const valid = values => {
    if (!Array.isArray(values) || values.length !== 10 || typeof values[0] !== "string"
      || !/^[A-Za-z0-9_.:-]{1,80}$/.test(values[0])) fail();
    for (let i = 1; i < 8; i++) if (!Number.isFinite(values[i])) fail();
    if (!Number.isInteger(values[8]) || values[8] < 0 || values[8] > 2
      || !Number.isInteger(values[9]) || values[9] < 0 || values[9] > 31
      || values[9] & 1 && values[8] !== 0) fail();
  };
  const envelope = m => !!m && Object.keys(m).sort().join(",") === "data,request,sequence,t"
    && m.t === TYPE && typeof m.request === "string" && /^[0-9a-f]{32}$/.test(m.request)
    && Number.isSafeInteger(m.sequence) && m.sequence > 0
    && typeof m.data === "string" && /^[A-Za-z0-9+/]{77}[AQgw]==$/.test(m.data);
  const pack = input => {
    const values = input.map((v, i) => i > 0 && v === "-0" ? -0 : v);
    valid(values);
    const bytes = new Uint8Array(58), view = new DataView(bytes.buffer);
    for (let i = 1; i < 8; i++) view.setFloat64((i - 1) * 8, values[i], true);
    bytes[56] = values[8]; bytes[57] = values[9];
    return btoa(String.fromCharCode(...bytes));
  };
  const unpack = (data, owner) => {
    if (!envelope({ t: TYPE, request: "0".repeat(32), sequence: 1, data })) fail();
    const raw = atob(data), bytes = Uint8Array.from(raw, c => c.charCodeAt(0)), view = new DataView(bytes.buffer);
    const values = [owner];
    for (let i = 0; i < 7; i++) values.push(view.getFloat64(i * 8, true));
    values.push(bytes[56], bytes[57]); valid(values);
    // Keep signed zero through the durable JSON checkpoint representation.
    return values.map((v, i) => i > 0 && Object.is(v, -0) ? "-0" : v);
  };
  BL.bodyMotion = { TYPE, FEATURE, envelope, pack, unpack };
})();
