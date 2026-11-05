import { test } from "node:test";
import assert from "node:assert/strict";
import { createCheckpointPack, PACK } from "../src/checkpoint-pack.js";
import { scalarBytes } from "../src/checkpoint-binary.js";
import { compactSimulation } from "../src/simulation-checkpoint.js";
import { initial, prepare, capture, restore } from "./fixtures/clanker-flight-fixture.mjs";

test("checkpoint packing preserves JSON values, hostile field names and negative zero across storage", () => {
  const codec = createCheckpointPack(4096), state = JSON.parse('{"__proto__":{"safe":true},"constructor":null,"array":[{},[],false,"🌍",1.2345678901234567]}');
  state.array.push(-0, Number.MIN_VALUE, Number.MAX_VALUE);
  const packed = codec.pack(state), decoded = codec.unpack(JSON.parse(JSON.stringify(packed)));
  assert.deepEqual(decoded, state); assert.equal(Object.getPrototypeOf(decoded), Object.prototype);
  assert.equal({}.safe, undefined); assert.ok(Object.is(decoded.array[5], -0));
  decoded.array[0].changed = true; assert.deepEqual(codec.unpack(packed), state);
});

test("scalar byte metering matches actual UTF-8 JSON across Unicode and numeric boundaries",()=>{
  const encoder=new TextEncoder(),check=v=>assert.equal(scalarBytes(v),encoder.encode(JSON.stringify(v)).byteLength);
  for(const value of [null,true,false,0,-0,Number.MIN_VALUE,Number.MAX_VALUE,1e-8,-1e25,'','🌍','\ud800','\udfff','\u2028\n"\\'])check(value);
  for(let i=0;i<65536;i+=17)check(String.fromCharCode(i,(i*31)%65536,(i*149)%65536));
});

test("packing rejects ambiguous and oversized state; decoding rejects corrupt tags and expansion bombs", () => {
  const codec = createCheckpointPack(96 * 1024), shared = {}, cyclic = {}; cyclic.self = cyclic;
  const sparse = Array(1); sparse.extra = 1;
  let invoked = false;
  const accessor = { get value() { invoked = true; return 1; } }, hidden = Object.defineProperty({}, "hidden", { value: 1 });
  for (const value of [undefined, NaN, Infinity, new Float32Array(1), new Date(), cyclic, [shared, shared], sparse,
    accessor, hidden, { [Symbol("missing")]: 1 }, Symbol("value"),
    "x".repeat(PACK.stringChars + 1), Object.fromEntries(Array.from({ length: 65 }, (_, i) => [i, 1]))]) {
    assert.throws(() => codec.pack(value));
  }
  assert.equal(invoked, false);
  const p = codec.pack({ x: 1 });
  for (const data of [[-2, 0], [-3], [1, 0], [0], [0, 1, 2], {}]) assert.throws(() => codec.unpack({ ...p, data }));
  assert.throws(() => codec.unpack({ ...p, shapes: [["x", "x"]], data: [0, 1, 2] }));
  assert.throws(() => codec.unpack({ ...p, extra: true }));
  assert.throws(() => createCheckpointPack(256).pack("x".repeat(256)));
  // Small wire tree expands beyond 256 KiB through repeated long field names.
  const bomb = { v: 1, shapes: [["x".repeat(128)]], data: [-1, ...Array.from({ length: 2100 }, () => [0, 0])] };
  assert.ok(JSON.stringify(bomb).length < 16 * 1024); assert.throws(() => codec.unpack(bomb));
  let deep = 0; for (let i = 0; i < PACK.depth + 1; i++) deep = [deep];
  assert.throws(() => codec.pack(deep));
  assert.throws(() => codec.pack(Array(PACK.nodes).fill(0)));
});

test("opt-in scalar interning preserves exact values and enforces the original expansion and node budgets", () => {
  const codec=createCheckpointPack(65536,{intern:true}),legacy=createCheckpointPack(65536);
  const state={rows:Array.from({length:200},(_,i)=>({x:1.23456789012345,y:i/7,label:'shared-controller-identity',literal:'~0',prefix:'~~7',negative:-0})),
    tiny:Number.MIN_VALUE,large:Number.MAX_VALUE,unicode:'🌍\ud800\udfff',hostile:JSON.parse('{"__proto__":"safe"}')};
  const saved=JSON.parse(JSON.stringify(codec.pack(state)));
  assert.equal(saved.v,2);assert.deepEqual(codec.unpack(saved),state);
  assert.ok(JSON.stringify(saved).length<JSON.stringify(legacy.pack(state)).length);
  assert.deepEqual(codec.unpack(legacy.pack(state)),state,'new decoder still reads version one');
  assert.throws(()=>legacy.unpack(saved),'old decoder refuses new encoding');
  for(const edit of [s=>s.v=3,s=>s.scalars.push(s.scalars[0]),s=>s.scalars[0]={x:1},s=>s.scalars[0]=Infinity,
    s=>s.scalars[0]='x'.repeat(PACK.stringChars+1),s=>s.data='~999',s=>s.data='~00',s=>s.data='~-1',s=>s.data='~1x',s=>s.extra=0]){
    const bad=structuredClone(saved);edit(bad);assert.throws(()=>codec.unpack(bad));
  }
  const bomb=codec.pack(Array(65).fill('x'));bomb.scalars[0]='x'.repeat(4096);
  assert.ok(JSON.stringify(bomb).length<8192);assert.throws(()=>codec.unpack(bomb),/capacity/);
  const tooMany=codec.pack(Array(PACK.nodes-1).fill(0)),stream=Buffer.concat(tooMany.data.map(s=>Buffer.from(s,'base64')));
  stream.writeUInt16LE(PACK.nodes,1);const overflow=Buffer.concat([stream,Buffer.from([3])]);
  tooMany.data=[];for(let at=0;at<overflow.length;at+=3072)tooMany.data.push(overflow.subarray(at,at+3072).toString('base64'));
  assert.throws(()=>codec.unpack(tooMany),/capacity/);
  assert.throws(()=>codec.pack(Array(PACK.nodes).fill('long-repeated-string')),/capacity/);
  let deep=0;for(let i=0;i<PACK.depth+1;i++)deep=[deep];assert.throws(()=>codec.pack(deep),/capacity/);
  const input={v:'~0'},p=codec.pack(input);assert.deepEqual(codec.unpack(p),input);
});

test("scalar storage opt-in has a new world version and refreshes its dictionary across mutations and query phases",()=>{
  const source={version:'scalar-fixture',initial:()=>({rows:Array.from({length:40},()=>({value:1.234567890123456}))}),
    validate:()=>true,step(s){for(const row of s.rows)row.value=9.87654321098765;},project:s=>s.rows[0].value,
    npcFor:s=>s.rows[0].value,handoff(s){for(const row of s.rows)row.value=2.34567890123456;return true;}};
  const packed=compactSimulation(source,8192,{intern:true}),legacy=compactSimulation(source,8192),state=packed.initial();
  assert.notEqual(packed.version,legacy.version);assert.match(packed.version,/^pack2-/);
  const before=packed.readQueries(state);assert.equal(before.npcFor('body'),1.234567890123456);
  packed.step(state,50);assert.equal(packed.project(state),9.87654321098765);
  assert.equal(before.npcFor('body'),1.234567890123456);assert.equal(packed.readQueries(state).npcFor('body'),9.87654321098765);
  packed.handoff(state,{});assert.equal(packed.project(JSON.parse(JSON.stringify(state))),2.34567890123456);
  assert.equal(state.v,2);assert.equal(packed.validate(state),true);
});

test("binary checkpoint rejects malformed lengths, scalar tags and truncated data and preserves diverse exact JSON values",()=>{
  const codec=createCheckpointPack(65536,{intern:true}),wire=bytes=>({v:2,shapes:[],scalars:[],data:[Buffer.from(bytes).toString('base64')]});
  for(const bytes of [[255],[10,0],[12,0],[11,255,255],[9,1,16],[9,1,0],[13,0,0],[14,1,0],[0,0],
    [7,0,0,128,127],[8,0,0,0,0,0,0,240,127],[7,0,0,0,128],[8,0,0,0,0,0,0,240,63]]){
    assert.throws(()=>codec.unpack(wire(bytes)),/checkpoint/);
  }
  for(const chunks of [[],['AB=='],['AA==AAAA'],['!'],['AA==','AA=='],['A'.repeat(4100)]]){
    const bad=wire([0]);bad.data=chunks;assert.throws(()=>codec.unpack(bad),/checkpoint/);
  }
  let word=0x173c92ab;const random=()=>{word=(Math.imul(word,1664525)+1013904223)>>>0;return word;};
  const leaves=[null,false,true,0,-0,1,-1,65535,-65535,65536,.1,Math.fround(.1),Number.MIN_VALUE,Number.MAX_VALUE,'','~0','🌍','\ud800','\udfff'];
  const make=depth=>{
    const n=random();if(depth>=5||n%3===0)return leaves[n%leaves.length];
    if(n%3===1)return Array.from({length:random()%6},()=>make(depth+1));
    const result={};for(let i=0,count=random()%5;i<count;i++)Object.defineProperty(result,i===0?'__proto__':`f${i}`,{value:make(depth+1),enumerable:true});return result;
  };
  for(let i=0;i<200;i++){
    const state=make(0),packed=JSON.parse(JSON.stringify(codec.pack(state)));assert.deepEqual(codec.unpack(packed),state);
  }
  const source={text:'🌍'.repeat(32),x:1.2345678901234567},packed=codec.pack(source),bytes=Buffer.concat(packed.data.map(s=>Buffer.from(s,'base64')));
  for(let i=0;i<bytes.length;i++)assert.throws(()=>codec.unpack({...packed,data:[bytes.subarray(0,i).toString('base64')]}),/checkpoint/);
});

test("compact simulation follows the original Clanker flight exactly after every durable round trip", async () => {
  const f = await prepare();
  const source = { version: "packed-flight-fixture", initial() { const e = initial(); f.controller.prepareJump(e, 0, 0, -4, 1.5); return capture(e); },
    validate: s => { restore(s); return true; }, step(s, ms) { const e = restore(s); if (e.jump.active) f.controller.updateJump(e, ms / 1000); Object.assign(s, capture(e)); },
    project: s => structuredClone(s.root.position), npcFor: () => null, handoff: () => false };
  const packed = compactSimulation(source, 4096), codec = createCheckpointPack(4096), reference = source.initial();
  let state = packed.initial();
  for (let i = 0; i < 120; i++) {
    source.step(reference, 50); packed.step(state, 50); state = JSON.parse(JSON.stringify(state));
    assert.deepEqual(codec.unpack(state), reference); assert.deepEqual(packed.project(state), source.project(reference));
  }
  const before = structuredClone(state); assert.equal(packed.handoff(state, {}), false); assert.deepEqual(state, before);
  const broken = compactSimulation({ ...source, step(s) { s.root.position.x = 99; throw Error("failed frame"); } }, 4096);
  assert.throws(() => broken.step(state, 50), /failed frame/); assert.deepEqual(state, before);
  assert.throws(() => compactSimulation({ ...source, step: () => Promise.resolve() }, 4096).step(state, 50), /synchronous/);
});

test("ownership queries share an immutable phase snapshot and a new phase observes handoff changes", () => {
  const snapshots = new Set();
  const source = { version: "query-fixture", initial: () => ({ owners: { body: "npc" } }), validate: () => true,
    step() {}, project: () => ({}), npcFor(s, id) {
      snapshots.add(s);
      assert.ok(Object.isFrozen(s) && Object.isFrozen(s.owners));
      if (id === "mutate") s.owners.body = "poisoned";
      return s.owners[id] || null;
    }, handoff(s) { s.owners.body = "replacement"; return true; } };
  const adapter = compactSimulation(source, 4096), state = adapter.initial(), first = adapter.readQueries(state);
  for (let i = 0; i < 64; i++) assert.equal(first.npcFor("body"), "npc");
  assert.equal(snapshots.size, 1, "one decode per read phase, not one per departing body");
  assert.throws(() => first.npcFor("mutate"), TypeError); assert.equal(first.npcFor("body"), "npc");
  adapter.handoff(state, {});
  assert.equal(adapter.readQueries(state).npcFor("body"), "replacement"); assert.equal(snapshots.size, 2);
  assert.equal(createCheckpointPack(4096).unpack(state).owners.body, "replacement");
});

test('world spawn queries survive packing and transaction scopes without mutating the NPC checkpoint', () => {
  const source = { version: 'spawn-fixture', initial: () => ({ x: 1 }), validate: () => true,
    step: state => { state.x++; }, project: state => state.x, npcFor: () => 'npc:a', handoff: () => false };
  assert.equal(compactSimulation(source, 4096).playerSpawn, undefined);
  for (const intern of [false, true]) {
    const adapter = compactSimulation({ ...source, playerSpawn(state, who) {
      if (who.mutate) state.x = 99;
      return { x: state.x, accountId: who.accountId };
    } }, 4096, { intern });
    const state = adapter.initial(), before = structuredClone(state);
    assert.deepEqual(adapter.playerSpawn(state, { accountId: 1 }), { x: 1, accountId: 1 });
    adapter.playerSpawn(state, { mutate: true }); assert.deepEqual(state, before, 'unscoped queries use a private decoded copy');
    const scope = adapter.forTransaction();
    assert.throws(() => scope.playerSpawn(state, { mutate: true }), TypeError);
    scope.step(state, 50);
    assert.deepEqual(scope.playerSpawn(state, { accountId: 1 }), { x: 2, accountId: 1 });
    scope.dispose(); assert.throws(() => scope.playerSpawn(state, {}), /closed/);
    const asyncAdapter = compactSimulation({ ...source, playerSpawn: () => Promise.resolve({}) }, 4096, { intern });
    assert.throws(() => asyncAdapter.playerSpawn(asyncAdapter.initial(), {}), /synchronous/);
    const asyncScope = asyncAdapter.forTransaction();
    assert.throws(() => asyncScope.playerSpawn(asyncScope.initial(), {}), /synchronous/); asyncScope.dispose();
  }
});

test("transaction scopes reuse only frozen checkpoints, preserve query phases and discard rejected mutations",()=>{
  let validations=0,mutateProject=false,stepState;
  const source={version:'scope-fixture',initial:()=>({value:1,owner:'first'}),
    validate:s=>{validations++;assert.ok(Object.isFrozen(s));return Number.isFinite(s.value);},
    step(s){stepState=s;s.value++;},project(s){if(mutateProject)s.value=999;return s.value;},
    npcFor:s=>s.owner,handoff(s,intent){s.owner=intent.owner;return intent.accept;}};
  for(const intern of [false,true]){
    const adapter=compactSimulation(source,4096,{intern}),scope=adapter.forTransaction(),state=scope.initial();
    const baseline=validations;assert.equal(scope.validate(state),true);assert.equal(scope.validate(state),true);assert.equal(validations,baseline+1);
    const query=scope.readQueries(state);assert.equal(query.npcFor('body'),'first');
    assert.throws(()=>{state.data[0]='poison';},TypeError);scope.step(state,50);
    assert.ok(Object.isFrozen(stepState));assert.throws(()=>{stepState.value=999;},TypeError);
    assert.equal(scope.project(state),2);assert.equal(scope.validate(state),true);assert.equal(validations,baseline+2);
    const before=JSON.stringify(state);assert.equal(scope.handoff(state,{owner:'wrong',accept:false}),false);assert.equal(JSON.stringify(state),before);
    assert.equal(scope.handoff(state,{owner:'second',accept:true}),true);assert.equal(scope.npcFor(state,'body'),'second');assert.equal(query.npcFor('body'),'first');
    mutateProject=true;assert.throws(()=>scope.project(state),TypeError);mutateProject=false;assert.equal(scope.project(state),2);
    const replacement=adapter.initial();state.data=replacement.data;state.shapes=replacement.shapes;if(intern)state.scalars=replacement.scalars;
    assert.equal(scope.project(state),1,'new wire children must not reuse the previous decoded state');
    state.extra=true;assert.throws(()=>scope.validate(state));delete state.extra;assert.equal(scope.validate(state),true);
    scope.dispose();assert.throws(()=>scope.project(state),/closed/);assert.throws(()=>query.npcFor('body'),/closed/);
    const next=adapter.forTransaction();assert.equal(next.project(state),1);next.dispose();
  }
});
