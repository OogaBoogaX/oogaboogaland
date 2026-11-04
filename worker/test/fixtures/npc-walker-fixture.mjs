// Real work/walker/route/mesh code over an authored floor and blocker. Crowd,
// rig poses, weapon/reload and airborne integration are explicitly still fixtures.
import { initial as workInitial, runtime as workRuntime, encode as workEncode, decode as workDecode } from "./npc-work-fixture.mjs";
import { createNpcWork } from "../../src/npc-work.js";
import { createNpcWalker, createWalkerState, createWalkerCheckpoint } from "../../src/npc-walker.js";
import { createNpcNavigation } from "../../src/npc-navigation.js";
import { createNpcClearance } from "../../src/npc-clearance.js";
import { prepareMeshCollision } from "../../src/mesh-collision.js";

export const world = "walker-fixture-1", codec = createWalkerCheckpoint(world);
export async function prepare() {
  const geometry = { id: "box", verts: [-.5,-.5,-.5, .5,-.5,-.5, .5,.5,-.5, -.5,.5,-.5,
    -.5,-.5,.5, .5,-.5,.5, .5,.5,.5, -.5,.5,.5],
    faces: [[0,3,2,1], [4,5,6,7], [0,4,7,3], [1,2,6,5], [0,1,5,4], [3,7,6,2]]
      .map(i => ({ i, gorillaStep: false, supportOnly: false, ragePass: false })) };
  const node = (id, y, x, z, visible) => ({ id, geometry: "box", position: { x: 0, y, z: 0 },
    rotation: { x: 0, y: 0, z: 0 }, scale: { x, y: id === "floor" ? 1 : 3, z }, visible,
    shoulderOnly: false, climbMasonry: false, gorillaStepAll: false, ragePass: false });
  const catalog = await prepareMeshCollision({ v: 1, world, geometries: [geometry],
    nodes: [node("floor", -.5, 20, 20, true), node("blocker", 1.5, 1.2, 1.2, false)] });
  const routeWorld = { path: { version: 1, debug: { active: false, ringCenterRadius: 0 },
    centerlines: [[{ x: -5, z: 0 }, { x: 5, z: 0 }]] }, surfaceAt: () => 0, isPath: () => true };
  const paths = createNpcNavigation({ island: routeWorld, walkable: () => true });
  function initial(blocked = false) {
    const state = workInitial(), a = state.actor;
    Object.assign(a, { baseY: 0, bodyHeight: 1.8, bodyRadius: .2, state: "working", camp: { seat: null },
      hop: 0, hopV: 0, leap: { vx: 0, vz: 0, land: 0 }, bedTravel: { mode: "" },
      traffic: { waiting: false, yielding: false }, shoulder: { prop: false },
      progress: { backoff: 0, backX: 0, backZ: 0 }, avoidance: createWalkerState(0), pathing: paths.createState() });
    a.root.visible = true; a.root.quaternion = null;
    state.meshes = catalog.create().capture(); state.meshes.poses[1].visible = blocked;
    return state;
  }
  function encode(state) {
    const saved = workEncode(state);
    saved.actor.avoidance = codec.capture(state.actor.avoidance);
    saved.actor.pathing = state.actor.pathing ? paths.capture(state.actor.pathing) : null;
    return saved;
  }
  function decode(saved) {
    const state = workDecode(saved);
    state.actor.avoidance = codec.restore(saved.actor.avoidance);
    state.actor.pathing = saved.actor.pathing ? paths.restore(saved.actor.pathing) : null;
    catalog.validate(saved.meshes);
    return state;
  }
  function runtime(state, create = createNpcWalker) {
    const a = state.actor, mesh = catalog.create(state.meshes);
    const support = (x, z, y) => mesh.supportAt(x, z, y, .5, a.bodyRadius);
    const clearance = createNpcClearance({ PLAYER_RADIUS: .2, walkable: () => true,
      playerSupportAt: support, npcRampRoofAt: () => false, npcClosedCaveClear: () => true,
      npcWorkZoneClear: () => true, npcFireClear: () => true, npcPileAt: () => false,
      island: { clearAt: mesh.clearAt, voxelSegmentClearAt: mesh.segmentClear } });
    const hooks = {
      ctx: { npcPaths: paths, outsideActors: () => [], outsideActorHeight: 1.8,
        npcRecoveryDrop: () => false, npcLandingAllowed: () => true, npcHazardClear: () => true },
      crewList: [a], playerBody: () => false, gapClear: () => true,
      npcWalkable: clearance, groundAt: support, inBananas: () => false,
      shoulderNeighbor: () => false, shoulderClear: () => true,
      flyable: (x, z, tx, tz, y, height) => mesh.segmentClear(x, y, z, tx, y, tz, a.bodyRadius, height),
      walkerClear: (c, x, z) => clearance(c.root.position.x, c.root.position.z, x, z, c.root.position.y, c.bodyHeight, c),
      groundY: c => support(c.root.position.x, c.root.position.z, c.root.position.y),
      shoulderStep: () => -1, standPose() {}, walkPose() {},
      SHOULDER_GAP: .68, OUTSIDE_GAP: .86, STEP: .5, SHOULDER_REACH: 1.3,
      JUMP_SPEED: 4.8, WALK: { gravity: 12 }, PLAYER_STEP: .125, NPC_PASS_REACH: 1.9, RUSH_SPEED: 2.8,
    };
    const controller = create(hooks);
    const work = workRuntime(state, workHooks => {
      workHooks.walkWorkTo = controller.walkWorkTo;
      workHooks.planPath = (cave, point) => paths.target(cave, point.x, point.z);
      workHooks.resetWalkerRoute = cave => { cave.avoidance = createWalkerState(cave.index); };
      return createNpcWork(workHooks);
    });
    return { controller, hooks, mesh, step: work.step };
  }
  return { initial, encode, decode, runtime, catalog, paths };
}
