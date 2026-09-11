(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (current, target, rate, dt) => lerp(current, target, 1 - Math.exp(-rate * dt));
  const angleDelta = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inOutQuad: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
    outBack: (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2),
    outBounce: (t) => {
      if (t < 0.75) {
        const k = t / 0.75;
        return k * k;
      }
      return 1 - Math.sin((t - 0.75) / 0.25 * Math.PI) * 0.05;
    }
  };
  const fnv1a = (text) => {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };
  const mulberry32 = (seed) => () => {
    seed = seed + 1831565813 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const RANDOM_BUF = new Uint32Array(1);
  const randomInt = (n) => {
    crypto.getRandomValues(RANDOM_BUF);
    return RANDOM_BUF[0] % n;
  };
  const hexToRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  };
  const MUL_TEMP = new Float32Array(16);
  const mat4 = {
    create: () => {
      const m = new Float32Array(16);
      m[0] = m[5] = m[10] = m[15] = 1;
      return m;
    },
    identity: (out) => {
      out.fill(0);
      out[0] = out[5] = out[10] = out[15] = 1;
      return out;
    },
    multiply: (out, a, b) => {
      const t = MUL_TEMP;
      for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
          t[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
        }
      }
      out.set(t);
      return out;
    },
    fromTRS: (out, p, r, s) => {
      const cx = Math.cos(r.x), sx = Math.sin(r.x);
      const cy = Math.cos(r.y), sy = Math.sin(r.y);
      const cz = Math.cos(r.z), sz = Math.sin(r.z);
      const ce = cy * cz, cf = cy * sz, de = sy * cz, df = sy * sz;
      out[0] = (ce + df * sx) * s.x;
      out[1] = cx * sz * s.x;
      out[2] = (cf * sx - de) * s.x;
      out[3] = 0;
      out[4] = (de * sx - cf) * s.y;
      out[5] = cx * cz * s.y;
      out[6] = (df + ce * sx) * s.y;
      out[7] = 0;
      out[8] = cx * sy * s.z;
      out[9] = -sx * s.z;
      out[10] = cx * cy * s.z;
      out[11] = 0;
      out[12] = p.x;
      out[13] = p.y;
      out[14] = p.z;
      out[15] = 1;
      return out;
    },
    lookAt: (out, eye, target, up) => {
      let zx = eye.x - target.x, zy = eye.y - target.y, zz = eye.z - target.z;
      let len = Math.hypot(zx, zy, zz) || 1;
      zx /= len;
      zy /= len;
      zz /= len;
      let xx = up.y * zz - up.z * zy, xy = up.z * zx - up.x * zz, xz = up.x * zy - up.y * zx;
      len = Math.hypot(xx, xy, xz) || 1;
      xx /= len;
      xy /= len;
      xz /= len;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      out[0] = xx;
      out[1] = yx;
      out[2] = zx;
      out[3] = 0;
      out[4] = xy;
      out[5] = yy;
      out[6] = zy;
      out[7] = 0;
      out[8] = xz;
      out[9] = yz;
      out[10] = zz;
      out[11] = 0;
      out[12] = -(xx * eye.x + xy * eye.y + xz * eye.z);
      out[13] = -(yx * eye.x + yy * eye.y + yz * eye.z);
      out[14] = -(zx * eye.x + zy * eye.y + zz * eye.z);
      out[15] = 1;
      return out;
    },
    perspective: (out, fov, aspect, near, far) => {
      const f = 1 / Math.tan(fov / 2);
      out.fill(0);
      out[0] = f / aspect;
      out[5] = f;
      out[10] = (far + near) / (near - far);
      out[11] = -1;
      out[14] = 2 * far * near / (near - far);
      return out;
    },
    ortho: (out, l, r, b, t, n, f) => {
      out.fill(0);
      out[0] = 2 / (r - l);
      out[5] = 2 / (t - b);
      out[10] = -2 / (f - n);
      out[12] = -(r + l) / (r - l);
      out[13] = -(t + b) / (t - b);
      out[14] = -(f + n) / (f - n);
      out[15] = 1;
      return out;
    },
    transformPoint: (out, m, x, y, z) => {
      out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
      out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      return out;
    },
    invert: (out, m) => {
      const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
      const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
      const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
      const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
      const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
      const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
      const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
      const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
      const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
      if (!det) throw new Error("mat4.invert: singular matrix");
      const d = 1 / det;
      out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d;
      out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d;
      out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d;
      out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
      out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d;
      out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d;
      out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d;
      out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
      out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d;
      out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d;
      out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d;
      out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
      out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d;
      out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d;
      out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d;
      out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
      return out;
    },
    // Camera ray through a screen pixel
    rayFromView: (out, view, width, height, fov, eye, px, py) => {
      const tanHalf = Math.tan(fov / 2);
      const nx = (px / width * 2 - 1) * tanHalf * (width / height);
      const ny = (1 - py / height * 2) * tanHalf;
      const dx = view[0] * nx + view[1] * ny - view[2];
      const dy = view[4] * nx + view[5] * ny - view[6];
      const dz = view[8] * nx + view[9] * ny - view[10];
      const len = Math.hypot(dx, dy, dz) || 1;
      out.ox = eye.x;
      out.oy = eye.y;
      out.oz = eye.z;
      out.dx = dx / len;
      out.dy = dy / len;
      out.dz = dz / len;
      return out;
    },
    transformPoint4: (out, m, x, y, z) => {
      out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
      out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      out[3] = m[3] * x + m[7] * y + m[11] * z + m[15];
      return out;
    },
    // Translation, unit quaternion and scale, the quaternion twin of fromTRS
    fromTQS: (out, p, q, s) => {
      const x = q[0], y = q[1], z = q[2], w = q[3];
      const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
      out[0] = (1 - 2 * (yy + zz)) * s.x;
      out[1] = 2 * (xy + wz) * s.x;
      out[2] = 2 * (xz - wy) * s.x;
      out[3] = 0;
      out[4] = 2 * (xy - wz) * s.y;
      out[5] = (1 - 2 * (xx + zz)) * s.y;
      out[6] = 2 * (yz + wx) * s.y;
      out[7] = 0;
      out[8] = 2 * (xz + wy) * s.z;
      out[9] = 2 * (yz - wx) * s.z;
      out[10] = (1 - 2 * (xx + yy)) * s.z;
      out[11] = 0;
      out[12] = p.x;
      out[13] = p.y;
      out[14] = p.z;
      out[15] = 1;
      return out;
    }
  };
  // Unit quaternions as Float32Array(4) [x, y, z, w], every operation in place
  const QUAT_TEMP = new Float32Array(4);
  const quat = {
    create: () => {
      const q = new Float32Array(4);
      q[3] = 1;
      return q;
    },
    identity: (out) => {
      out[0] = out[1] = out[2] = 0;
      out[3] = 1;
      return out;
    },
    copy: (out, q) => {
      out[0] = q[0];
      out[1] = q[1];
      out[2] = q[2];
      out[3] = q[3];
      return out;
    },
    fromAxisAngle: (out, x, y, z, angle) => {
      const s = Math.sin(angle / 2);
      out[0] = x * s;
      out[1] = y * s;
      out[2] = z * s;
      out[3] = Math.cos(angle / 2);
      return out;
    },
    // Yaw about y, then pitch about x, then roll about z, matching fromTRS's YXZ order
    fromEuler: (out, x, y, z) => {
      const cx = Math.cos(x / 2), sx = Math.sin(x / 2), cy = Math.cos(y / 2), sy = Math.sin(y / 2), cz = Math.cos(z / 2), sz = Math.sin(z / 2);
      out[0] = sx * cy * cz + cx * sy * sz;
      out[1] = cx * sy * cz - sx * cy * sz;
      out[2] = cx * cy * sz - sx * sy * cz;
      out[3] = cx * cy * cz + sx * sy * sz;
      return out;
    },
    // out = a ⊗ b: rotating a vector by out applies b first, then a
    multiply: (out, a, b) => {
      const t = QUAT_TEMP;
      t[0] = a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1];
      t[1] = a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0];
      t[2] = a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3];
      t[3] = a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2];
      out.set(t);
      return out;
    },
    normalize: (out) => {
      const len = Math.hypot(out[0], out[1], out[2], out[3]) || 1;
      out[0] /= len;
      out[1] /= len;
      out[2] /= len;
      out[3] /= len;
      return out;
    },
    // Advance by a world-frame angular velocity over dt
    integrate: (out, q, wx, wy, wz, dt) => {
      const hx = wx * dt / 2, hy = wy * dt / 2, hz = wz * dt / 2;
      const x = q[0], y = q[1], z = q[2], w = q[3];
      out[0] = x + hy * z - hz * y + hx * w;
      out[1] = y + hz * x - hx * z + hy * w;
      out[2] = z + hx * y - hy * x + hz * w;
      out[3] = w - hx * x - hy * y - hz * z;
      return quat.normalize(out);
    },
    // Rotate a vector, written into out as x, y, z
    rotateVec: (out, q, x, y, z) => {
      const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
      const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
      out[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
      out[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
      out[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
      return out;
    },
    // Ease toward another rotation by a fraction, renormalised
    slerpTo: (out, target, t) => {
      let d = out[0] * target[0] + out[1] * target[1] + out[2] * target[2] + out[3] * target[3];
      const sign = d < 0 ? -1 : 1;
      d = Math.abs(d);
      // Nearly parallel rotations lerp; the rest slerp
      let ka = 1 - t, kb = t;
      if (d < 0.9995) {
        const theta = Math.acos(Math.min(1, d)), s = Math.sin(theta);
        ka = Math.sin((1 - t) * theta) / s;
        kb = Math.sin(t * theta) / s;
      }
      out[0] = out[0] * ka + target[0] * sign * kb;
      out[1] = out[1] * ka + target[1] * sign * kb;
      out[2] = out[2] * ka + target[2] * sign * kb;
      out[3] = out[3] * ka + target[3] * sign * kb;
      return quat.normalize(out);
    }
  };
  BL.math = { clamp, lerp, damp, angleDelta, ease, fnv1a, mulberry32, randomInt, hexToRgb, mat4, quat };
})();
