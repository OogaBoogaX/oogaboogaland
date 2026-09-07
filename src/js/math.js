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
    }
  };
  BL.math = { clamp, lerp, damp, angleDelta, ease, fnv1a, mulberry32, randomInt, hexToRgb, mat4 };
})();
