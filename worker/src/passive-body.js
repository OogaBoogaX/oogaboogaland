// Disconnect-only physics. No live controls, AI, weapon, fuel, refill or thrust.
// World adapters supply the actual support/ceiling/swept-solid kernels for the
// body's zone and shape. Moving rigs, water/abyss policy and Clanker poses still
// require production world adapters; this is not a replacement for crew.update.
export const PASSIVE = Object.freeze({ stepMs: 50, position: 10000, speed: 100, probes: 12, skin: .0001 });
const finite = (n, bound) => Number.isFinite(n) && Math.abs(n) <= bound;
const bad = () => { throw new Error("invalid passive body adapter or motion"); };
export function createPassiveBody({ world, gravity }) {
  if (typeof world !== "function" || !Number.isFinite(gravity) || gravity <= 0 || gravity > 100) bad();
  return (input, dtMs) => {
    if (!input || !["ooga", "clanker"].includes(input.kind) || typeof input.bodyId !== "string" || typeof input.zone !== "string"
      || ![input.x,input.y,input.z].every(n => finite(n,PASSIVE.position)) || ![input.vx,input.vy,input.vz].every(n => finite(n,PASSIVE.speed))
      || !finite(input.yaw,2*Math.PI) || typeof input.grounded !== "boolean" || !Number.isFinite(dtMs) || dtMs <= 0 || dtMs > PASSIVE.stepMs) bad();
    const w = world({ bodyId: input.bodyId, zone: input.zone, kind: input.kind });
    if (!w || !["supportAt","ceilingAt","segmentClear"].every(k => typeof w[k] === "function")
      || !finite(w.radius,2) || w.radius <= 0 || !finite(w.height,10) || w.height <= .3) bad();
    const support = (x,z,y) => { const v=w.supportAt(x,z,y,0,w.radius); if (v!==-Infinity && !finite(v,PASSIVE.position)) bad(); return v; };
    const ceiling = (x,z,y) => { const v=w.ceilingAt(x,z,y,w.radius); if (v!==Infinity && !finite(v,PASSIVE.position)) bad(); return v; };
    const clear = (x,y,z,tx,ty,tz) => { const v=w.segmentClear(x,y,z,tx,ty,tz,w.radius,w.height); if(typeof v!=="boolean") bad(); return v; };
    const m = { x:input.x,y:input.y,z:input.z,yaw:input.yaw,vx:input.vx,vy:input.vy,vz:input.vz,grounded:false }, dt=dtMs/1000;
    // Sweep horizontally before support: walking off a removed/moving platform
    // must retain world height, and no ceiling may be crossed by a large step.
    const tx=m.x+m.vx*dt,tz=m.z+m.vz*dt;
    if (!finite(tx,PASSIVE.position)||!finite(tz,PASSIVE.position)) bad();
    if (clear(m.x,m.y,m.z,tx,m.y,tz)) { m.x=tx;m.z=tz; } else { m.vx=0;m.vz=0; }
    const floor=support(m.x,m.z,m.y+PASSIVE.skin), roof=ceiling(m.x,m.z,m.y+PASSIVE.skin);
    if (floor>m.y+PASSIVE.skin || roof<m.y+w.height-PASSIVE.skin) bad(); // require an explicit depenetration policy
    if (floor!==-Infinity && Math.abs(m.y-floor)<=PASSIVE.skin && m.vy<=0) { m.y=floor;m.vx=m.vy=m.vz=0;m.grounded=true;return m; }
    m.vy=Math.max(-PASSIVE.speed,m.vy-gravity*dt);
    let y=m.y+m.vy*dt;
    if (m.vy<=0 && floor!==-Infinity && y<=floor) { y=floor;m.vx=m.vy=m.vz=0;m.grounded=true; }
    if (m.vy>0 && roof!==Infinity && y+w.height>=roof) { y=roof-w.height;m.vy=0; }
    if (!finite(y,PASSIVE.position)) bad();
    // The surface query supplies exact support/ceiling; sweep the open portion
    // with a tiny skin so a touching endpoint isn't mistaken for penetration.
    const end=y===m.y?y:y+(y<m.y?PASSIVE.skin:-PASSIVE.skin);
    if (Math.abs(y-m.y)>PASSIVE.skin && !clear(m.x,m.y+PASSIVE.skin,m.z,m.x,end,m.z)) {
      // Concave/overhang contact not described by support/ceiling: stop at the
      // last clear fraction, bounded to 12 probes; never tunnel or invent ground.
      let lo=0,hi=1;
      for(let i=0;i<PASSIVE.probes;i++){const mid=(lo+hi)/2;if(clear(m.x,m.y+PASSIVE.skin,m.z,m.x,m.y+(y-m.y)*mid,m.z))lo=mid;else hi=mid;}
      y=m.y+(y-m.y)*lo;m.vy=0;m.grounded=false;
    }
    m.y=y;return m;
  };
}
