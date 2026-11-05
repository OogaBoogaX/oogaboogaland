// Exact position/equipment only. Identity and world come from the retained grant.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window, BL = scope.BL = scope.BL || {};
  const TYPE = "body-motion-ooga-1", FEATURE = "host-ooga-motion-v1";
  const fail = () => { throw Error("invalid compact Ooga motion"); };
  const envelope = m => !!m && Object.keys(m).sort().join(",") === "data,request,sequence,t"
    && m.t === TYPE && typeof m.request === "string" && /^[0-9a-f]{32}$/.test(m.request)
    && Number.isSafeInteger(m.sequence) && m.sequence > 0
    && typeof m.data === "string" && /^[A-Za-z0-9+/]{45}[AQgw]==$/.test(m.data);
  const pack = checkpoint => {
    const { position: p, equipment: e } = BL.oogaBody.codec(checkpoint).read(checkpoint);
    const bytes = new Uint8Array(34), view = new DataView(bytes.buffer);
    [p.x, p.y, p.z, p.yaw].forEach((n, i) => view.setFloat64(i * 8, n, true));
    bytes[32] = [null, "primary", "gun"].indexOf(e.weapon);
    bytes[33] = +e.primaryOwned | +e.secondaryOwned << 1 | +e.unlimited << 2 | +e.jetpack << 3
      | +e.jetpackOwned << 4 | (e.selectedSlot - 1) << 5 | +(e.mode === "combat") << 6;
    return btoa(String.fromCharCode(...bytes));
  };
  const unpack = (data, retained) => {
    if (!envelope({ t: TYPE, request: "0".repeat(32), sequence: 1, data })) fail();
    const codec = BL.oogaBody.codec(retained); codec.read(retained);
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0)), view = new DataView(bytes.buffer), f = bytes[33];
    if (bytes[32] > 2 || f & 128) fail();
    return codec.encode({ x: view.getFloat64(0, true), y: view.getFloat64(8, true),
      z: view.getFloat64(16, true), yaw: view.getFloat64(24, true) },
    { weapon: [null, "primary", "gun"][bytes[32]], mode: f & 64 ? "combat" : "carry",
      primaryOwned: !!(f & 1), secondaryOwned: !!(f & 2), selectedSlot: (f >> 5 & 1) + 1,
      unlimited: !!(f & 4), jetpack: !!(f & 8), jetpackOwned: !!(f & 16) });
  };
  BL.oogaMotion = { TYPE, FEATURE, envelope, pack, unpack };
})();
