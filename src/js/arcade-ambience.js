// The hall's incidental sounds at their physical sources, also heard from an air-hockey seat.
(() => {
  "use strict";
  const BL = window.BL, A = BL.arcadeModels, L = A.LAYOUT;
  const sources = [
    ...L.changers.map(p => [p.x, p.z, "coin", 0.6]), ...L.hockeys.map(p => [p.x, p.z, "clack", 0.7]), ...L.pools.map(p => [p.x, p.z, "clack", 0.5]),
    ...L.pinball.map(([x,z]) => [x,z,"flip",0.7]), ...A.CABINETS.filter(c => c.game >= 0).map(c => [c.x,c.z,"ding",0.5]),
    [L.tables[0][0],L.tables[0][1],"cheer",0.35], [L.claws[0][0],L.claws[0][1],"whirr",0.6],
    [L.tables[1][0],L.tables[1][1],"laugh",0.5], [L.tables[0][0],L.tables[0][1],"grunt",0.5],
    [L.snack.x,L.snack.z,"grunt",0.45], [L.shy.x,L.shy.z,"laugh",0.4]
  ];
  const create = (audio, listener, camera) => {
    let wait = 0;
    return { update(dt) {
      wait -= dt; if (wait > 0) return;
      wait = 0.45 + Math.random() * 1.1;
      const [x,z,name,loud] = sources[Math.floor(Math.random() * sources.length)], dx = x-listener.x, dz = z-listener.z, d = Math.hypot(dx,dz);
      const k = Math.max(0,1-d/16);
      let fx = camera.target.x-camera.position.x, fz = camera.target.z-camera.position.z;
      if (Math.hypot(fx,fz) < 0.001) { fx = camera.up?.x || 0; fz = camera.up?.z || -1; }
      const fl = Math.hypot(fx,fz)||1;
      audio.cue(name,loud*k*k,d > 0.2 ? Math.max(-1,Math.min(1,(dx*-fz+dz*fx)/(fl*d)))*0.8 : 0);
    } };
  };
  BL.arcadeAmbience = { sources, create };
})();
