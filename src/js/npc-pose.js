// The existing Ooga display encoder, shared by browser hosting and the headless host.
// This projects an already posed rig; it does not advance AI, replay effects or restore physics.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const FORMAT = 2, HEADER = 4, RECORD = 112;
  const F_VISIBLE = 1, F_CLOSED = 2, F_ROOT_Q = 4, F_ARM_L_Q = 8, F_ARM_R_Q = 16, F_HEAD_Q = 32;
  const F_CLUB = 64, F_CLUB_Q = 128, F_GUN = 256, F_GUN_Q = 512, F_FLASH = 1024, F_SNACK = 2048;
  const F_STUNNED = 4096, F_FLAME = 8192, F_BED_GEAR = 16384, F_OUTDOOR_SLEEP = 32768;
  const BODY = ["torso", "head", "legL", "legR", "armL", "armR"];
  const STATES = ["working", "chilling", "sleeping", "away"];
  const PHASES = ["", "outbound", "station", "shoot", "return", "reload"];
  const create = ({ out, holderCode }) => {
    const writeQuat = (o, q) => {
      if (!q) return false;
      out[o] = q[0]; out[o + 1] = q[1]; out[o + 2] = q[2]; out[o + 3] = q[3];
      return true;
    };
    const writeXYZ = (o, v) => {
      out[o] = v.x; out[o + 1] = v.y; out[o + 2] = v.z;
    };
    const encodeCave = (o, i, cave) => {
      const r = cave.root, p = cave.parts;
      let flags = 0;
      if (r.visible) flags |= F_VISIBLE;
      if (p.head.geometry === cave.headClosed) flags |= F_CLOSED;
      out[o] = i;
      writeXYZ(o + 2, r.position); writeXYZ(o + 5, r.rotation);
      if (writeQuat(o + 8, r.quaternion)) flags |= F_ROOT_Q;
      writeXYZ(o + 12, r.scale);
      out[o + 15] = p.legL.rotation.x; out[o + 16] = p.legL.rotation.z;
      out[o + 17] = p.legR.rotation.x; out[o + 18] = p.legR.rotation.z;
      writeXYZ(o + 19, p.armL.rotation);
      if (writeQuat(o + 22, p.armL.quaternion)) flags |= F_ARM_L_Q;
      writeXYZ(o + 26, p.armR.rotation);
      if (writeQuat(o + 29, p.armR.quaternion)) flags |= F_ARM_R_Q;
      writeXYZ(o + 33, p.head.rotation); writeXYZ(o + 36, p.head.position);
      if (writeQuat(o + 39, p.head.quaternion)) flags |= F_HEAD_Q;
      out[o + 43] = p.torso.scale.y; out[o + 44] = p.torso.rotation.x; out[o + 45] = p.torso.rotation.z;
      writeXYZ(o + 46, p.armL.position); writeXYZ(o + 49, p.armR.position);
      out[o + 52] = holderCode(i, p.club); writeXYZ(o + 53, p.club.position); writeXYZ(o + 56, p.club.rotation);
      if (p.club.visible) flags |= F_CLUB;
      if (writeQuat(o + 59, p.club.quaternion)) flags |= F_CLUB_Q;
      out[o + 63] = holderCode(i, p.gun); writeXYZ(o + 64, p.gun.position); writeXYZ(o + 67, p.gun.rotation);
      if (p.gun.visible) flags |= F_GUN;
      if (writeQuat(o + 70, p.gun.quaternion)) flags |= F_GUN_Q;
      let mask = 0;
      for (let b = 0; b < p.gunBananas.length; b++) if (p.gunBananas[b].visible) mask |= 1 << b;
      out[o + 74] = mask;
      if (p.gunFlash.visible) flags |= F_FLASH;
      if (p.snack.visible) flags |= F_SNACK;
      out[o + 75] = p.snack.scale.x;
      writeXYZ(o + 76, cave.sleepWeapons.position); writeXYZ(o + 79, cave.sleepWeapons.rotation);
      if (cave.sleepWeapons.visible) flags |= F_BED_GEAR;
      if (cave.state === "sleeping" && cave.bedroll?.outdoor) flags |= F_OUTDOOR_SLEEP;
      for (let b = 0; b < BODY.length; b++) {
        const node = p[BODY[b]];
        out[o + 82 + b] = node.ember || 0;
        out[o + 88 + b] = node.scorch || 0;
      }
      out[o + 94] = p.chuk ? p.chuk.rotation.x : 0;
      out[o + 95] = p.jetFlame ? p.jetFlame.scale.y : 0;
      if (p.jetFlame && p.jetFlame.visible) flags |= F_FLAME;
      if (cave.stunBirds.visible) flags |= F_STUNNED;
      out[o + 96] = STATES.indexOf(cave.state);
      out[o + 97] = PHASES.indexOf(cave.work.phase);
      out[o + 98] = cave.work.site;
      out[o + 99] = cave.work.plannedSite;
      out[o + 100] = cave.tintState || 0;
      out[o + 1] = flags;
    };
    return encodeCave;
  };
  BL.npcPose = { create, FORMAT, HEADER, RECORD, BODY, STATES, PHASES, F_VISIBLE, F_CLOSED, F_ROOT_Q, F_ARM_L_Q, F_ARM_R_Q, F_HEAD_Q, F_CLUB, F_CLUB_Q, F_GUN, F_GUN_Q, F_FLASH, F_SNACK, F_STUNNED, F_FLAME, F_BED_GEAR, F_OUTDOOR_SLEEP };
})();
