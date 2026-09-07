(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { mat4 } = BL.math;
  const { updateWorld, traverseVisible } = BL.scene;
  const QUALITY = {
    high: { dpr: 1.5, msaa: 4, shadow: 2048, bloom: true },
    medium: { dpr: 1.25, msaa: 2, shadow: 1024, bloom: true },
    low: { dpr: 1, msaa: 0, shadow: 512, bloom: false }
  };
  const INSTANCE_FLOATS = 20;
  // Caps the pixel ratio to bound buffer memory
  const MAX_PIXELS = 2.6e6;
  const DEFAULT_LIGHT = { x: 0.45, y: 0.85, z: 0.3 };
  const DEFAULT_SKY = [0.50, 0.52, 0.58];
  const DEFAULT_GROUND = [0.22, 0.20, 0.19];
  const DEFAULT_SUN = [0.80, 0.74, 0.66];
  const DEFAULT_CLEAR = [0.035, 0.035, 0.04];
  const DEFAULT_SHADOW_CENTER = { x: 0, y: 1.5, z: 0 };
  const UP = { x: 0, y: 1, z: 0 };
  const ZERO4 = new Float32Array([0, 0, 0, 1]);
  const LIGHT_EYE = { x: 0, y: 0, z: 0 };
  const MESH_STRIDE = 10;
  const LINE_STRIDE = 12;
  const MESH_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec4 aColor;
layout(location=3) in vec4 aM0;
layout(location=4) in vec4 aM1;
layout(location=5) in vec4 aM2;
layout(location=6) in vec4 aM3;
layout(location=7) in vec4 aParams;
uniform mat4 uViewProj;
uniform mat4 uLightViewProj;
out vec3 vNormal;
out vec4 vColor;
out vec4 vParams;
out vec4 vShadow;
void main() {
  mat4 m = mat4(aM0, aM1, aM2, aM3);
  vec4 w = m * vec4(aPos, 1.0);
  vNormal = normalize(mat3(m) * aNormal);
  vColor = aColor;
  vParams = aParams;
  vShadow = uLightViewProj * w;
  gl_Position = uViewProj * w;
}`;
  const MESH_FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vNormal;
in vec4 vColor;
in vec4 vParams;
in vec4 vShadow;
uniform vec3 uLightDir;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uSun;
uniform sampler2DShadow uShadow;
uniform float uShadowTexel;
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oBright;
float shadowAt(vec3 p, float bias) {
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float s = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      s += texture(uShadow, vec3(p.xy + vec2(float(x), float(y)) * uShadowTexel, p.z - bias));
    }
  }
  return s / 9.0;
}
void main() {
  vec3 n = normalize(vNormal);
  vec3 base = vColor.rgb;
  float emissive = clamp(vColor.a * vParams.x, 0.0, 1.0);
  float ndl = max(dot(n, uLightDir), 0.0);
  vec3 sp = vShadow.xyz / vShadow.w * 0.5 + 0.5;
  float bias = max(0.0035 * (1.0 - ndl), 0.0012);
  float sh = shadowAt(sp, bias);
  vec3 ambient = mix(uGround, uSky, n.y * 0.5 + 0.5);
  vec3 lit = base * (ambient + uSun * ndl * sh);
  vec3 col = mix(lit, base * 1.15, emissive);
  col = mix(col, vec3(1.0, 0.86, 0.45), vParams.y * 0.4);
  oColor = vec4(col, 1.0);
  oBright = vec4(col * (emissive * 0.9 + vParams.y * 0.5), 1.0);
}`;
  const SHADOW_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=3) in vec4 aM0;
layout(location=4) in vec4 aM1;
layout(location=5) in vec4 aM2;
layout(location=6) in vec4 aM3;
uniform mat4 uLightViewProj;
void main() {
  gl_Position = uLightViewProj * mat4(aM0, aM1, aM2, aM3) * vec4(aPos, 1.0);
}`;
  const SHADOW_FS = `#version 300 es
precision highp float;
void main() {}`;
  const LINE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aA;
layout(location=1) in vec3 aB;
layout(location=2) in vec2 aSide;
layout(location=3) in vec4 aM0;
layout(location=4) in vec4 aM1;
layout(location=5) in vec4 aM2;
layout(location=6) in vec4 aM3;
layout(location=7) in vec4 aParams;
layout(location=8) in vec4 aColor;
uniform mat4 uViewProj;
uniform vec2 uViewport;
uniform float uWidth;
out vec4 vColor;
out vec4 vParams;
void main() {
  mat4 m = uViewProj * mat4(aM0, aM1, aM2, aM3);
  vec4 ca = m * vec4(aA, 1.0);
  vec4 cb = m * vec4(aB, 1.0);
  vColor = aColor;
  vParams = aParams;
  if (ca.w < 0.05 && cb.w < 0.05) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  if (ca.w < 0.05) ca = mix(ca, cb, (0.05 - ca.w) / (cb.w - ca.w));
  if (cb.w < 0.05) cb = mix(cb, ca, (0.05 - cb.w) / (ca.w - cb.w));
  vec2 hv = uViewport * 0.5;
  vec2 sa = ca.xy / ca.w * hv;
  vec2 sb = cb.xy / cb.w * hv;
  vec2 dir = sb - sa;
  float len = length(dir);
  dir = len > 0.0001 ? dir / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec4 c = aSide.x < 0.5 ? ca : cb;
  vec2 off = nrm * aSide.y * uWidth * 0.5 / hv * c.w;
  gl_Position = vec4(c.xy + off, c.z, c.w);
}`;
  const LINE_FS = `#version 300 es
precision highp float;
in vec4 vColor;
in vec4 vParams;
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oBright;
void main() {
  float glow = clamp(vColor.a * vParams.x, 0.0, 1.0);
  vec3 col = mix(vColor.rgb, vec3(1.0), glow * 0.35);
  oColor = vec4(col, 1.0);
  oBright = vec4(vColor.rgb * glow, 1.0);
}`;
  const QUAD_VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
  const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 oColor;
void main() {
  float w[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  vec3 sum = texture(uTex, vUv).rgb * w[0];
  for (int i = 1; i < 5; i++) {
    vec2 o = uDir * float(i);
    sum += texture(uTex, vUv + o).rgb * w[i];
    sum += texture(uTex, vUv - o).rgb * w[i];
  }
  oColor = vec4(sum, 1.0);
}`;
  const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
out vec4 oColor;
void main() {
  vec3 col = texture(uScene, vUv).rgb + texture(uBloom, vUv).rgb * uBloomStrength;
  oColor = vec4(col, 1.0);
}`;
  const isSupported = () => {
    try {
      const probe = document.createElement("canvas");
      return !!probe.getContext("webgl2");
    } catch {
      return false;
    }
  };
  const createRenderer = (canvas, { quality = "high" } = {}) => {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL2 unavailable");
    let settings = QUALITY[quality] || QUALITY.high;
    let width = 0, height = 0, dpr = 1, pw = 0, ph = 0;
    let lost = false;
    const size = { width: 0, height: 0 };
    const view = mat4.create();
    const proj = mat4.create();
    const viewProj = mat4.create();
    const lightView = mat4.create();
    const lightProj = mat4.create();
    const lightViewProj = mat4.create();
    const P4 = new Float32Array(4);
    const records = new Map();
    const activeRecords = [];
    const res = { programs: {}, fbo: null, shadow: null, bloom: null, quadVao: null };
    // Compile without blocking, ready flips once linked
    const parallel = gl.getExtension("KHR_parallel_shader_compile");
    let ready = false;
    let failure = null;
    const compile = (vs, fs, uniforms) => {
      const make = (type, src) => {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        return sh;
      };
      const prog = gl.createProgram();
      const v = make(gl.VERTEX_SHADER, vs), f = make(gl.FRAGMENT_SHADER, fs);
      gl.attachShader(prog, v);
      gl.attachShader(prog, f);
      gl.linkProgram(prog);
      return { prog, shaders: [v, f], uniforms, u: {} };
    };
    const finishProgram = (p) => {
      if (!gl.getProgramParameter(p.prog, gl.LINK_STATUS)) {
        const logs = p.shaders.map((sh) => gl.getShaderInfoLog(sh)).filter(Boolean).join("\n");
        throw new Error(`Program link failed: ${gl.getProgramInfoLog(p.prog)} ${logs}`);
      }
      for (const sh of p.shaders) gl.deleteShader(sh);
      p.shaders = [];
      for (const name of p.uniforms) p.u[name] = gl.getUniformLocation(p.prog, name);
    };
    const buildPrograms = () => {
      ready = false;
      failure = null;
      res.programs = {
        mesh: compile(MESH_VS, MESH_FS, ["uViewProj", "uLightViewProj", "uLightDir", "uSky", "uGround", "uSun", "uShadow", "uShadowTexel"]),
        shadow: compile(SHADOW_VS, SHADOW_FS, ["uLightViewProj"]),
        line: compile(LINE_VS, LINE_FS, ["uViewProj", "uViewport", "uWidth"]),
        blur: compile(QUAD_VS, BLUR_FS, ["uTex", "uDir"]),
        composite: compile(QUAD_VS, COMPOSITE_FS, ["uScene", "uBloom", "uBloomStrength"])
      };
      res.quadVao = gl.createVertexArray();
    };
    const pollPrograms = () => {
      if (ready || failure) return ready;
      const list = Object.values(res.programs);
      if (parallel && !list.every((p) => gl.getProgramParameter(p.prog, parallel.COMPLETION_STATUS_KHR))) return false;
      try {
        for (const p of list) finishProgram(p);
        ready = true;
      } catch (err) {
        failure = err;
      }
      return ready;
    };
    const createTexture = (w, h, internal, filter) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, internal, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    };
    const createRenderbuffer = (w, h, internal, samples) => {
      const rb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      if (samples > 0) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, internal, w, h);
      else gl.renderbufferStorage(gl.RENDERBUFFER, internal, w, h);
      return rb;
    };
    const destroyFbo = () => {
      const f = res.fbo;
      if (!f) return;
      for (const t of f.textures) gl.deleteTexture(t);
      for (const r of f.renderbuffers) gl.deleteRenderbuffer(r);
      for (const b of f.framebuffers) gl.deleteFramebuffer(b);
      res.fbo = null;
    };
    const buildFbo = () => {
      destroyFbo();
      const samples = Math.min(settings.msaa, gl.getParameter(gl.MAX_SAMPLES));
      const f = { textures: [], renderbuffers: [], framebuffers: [], samples };
      f.color = createTexture(pw, ph, gl.RGBA8, gl.LINEAR);
      f.bright = createTexture(pw, ph, gl.RGBA8, gl.LINEAR);
      f.textures.push(f.color, f.bright);
      f.resolve = gl.createFramebuffer();
      f.framebuffers.push(f.resolve);
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.resolve);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.color, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, f.bright, 0);
      if (samples > 0) {
        f.scene = gl.createFramebuffer();
        f.framebuffers.push(f.scene);
        gl.bindFramebuffer(gl.FRAMEBUFFER, f.scene);
        const c0 = createRenderbuffer(pw, ph, gl.RGBA8, samples);
        const c1 = createRenderbuffer(pw, ph, gl.RGBA8, samples);
        const d = createRenderbuffer(pw, ph, gl.DEPTH_COMPONENT24, samples);
        f.renderbuffers.push(c0, c1, d);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, c0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.RENDERBUFFER, c1);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, d);
      } else {
        f.scene = f.resolve;
        const d = createRenderbuffer(pw, ph, gl.DEPTH_COMPONENT24, 0);
        f.renderbuffers.push(d);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, d);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.scene);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      const bw = Math.max(1, pw >> 2), bh = Math.max(1, ph >> 2);
      f.bloomSize = [bw, bh];
      f.ping = [];
      for (let i = 0; i < 2; i++) {
        const tex = createTexture(bw, bh, gl.RGBA8, gl.LINEAR);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        f.textures.push(tex);
        f.framebuffers.push(fb);
        f.ping.push({ tex, fb });
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      res.fbo = f;
    };
    const destroyShadow = () => {
      const s = res.shadow;
      if (!s) return;
      gl.deleteTexture(s.tex);
      gl.deleteFramebuffer(s.fb);
      res.shadow = null;
    };
    const buildShadow = () => {
      destroyShadow();
      const size = settings.shadow;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      res.shadow = { tex, fb, size };
    };
    const deleteRecord = (rec) => {
      if (rec.mesh) {
        gl.deleteVertexArray(rec.mesh.vao);
        gl.deleteBuffer(rec.mesh.vbo);
      }
      if (rec.line) {
        gl.deleteVertexArray(rec.line.vao);
        gl.deleteBuffer(rec.line.vbo);
      }
      gl.deleteBuffer(rec.ibo);
      rec.nodes.length = 0;
    };
    const destroyRecords = () => {
      for (const rec of records.values()) deleteRecord(rec);
      records.clear();
      activeRecords.length = 0;
    };
    const bindInstanceAttribs = (ibo) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, ibo);
      for (let i = 0; i < 5; i++) {
        const loc = 3 + i;
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, INSTANCE_FLOATS * 4, i * 16);
        gl.vertexAttribDivisor(loc, 1);
      }
    };
    const makePart = (data, floatsPerVertex, layout, ibo) => {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      let offset = 0;
      for (const [loc, size] of layout) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, floatsPerVertex * 4, offset * 4);
        offset += size;
      }
      bindInstanceAttribs(ibo);
      gl.bindVertexArray(null);
      return { vao, vbo, count: data.length / floatsPerVertex };
    };
    const buildMeshPart = (geometry, ibo) => {
      const { verts, faces } = geometry;
      let triCount = 0;
      for (const f of faces) triCount += f.i.length - 2;
      if (!triCount) return null;
      const out = new Float32Array(triCount * 3 * MESH_STRIDE);
      let o = 0;
      const put = (idx, nx, ny, nz, c, e) => {
        const b = idx * 3;
        out[o++] = verts[b];
        out[o++] = verts[b + 1];
        out[o++] = verts[b + 2];
        out[o++] = nx;
        out[o++] = ny;
        out[o++] = nz;
        out[o++] = c[0] / 255;
        out[o++] = c[1] / 255;
        out[o++] = c[2] / 255;
        out[o++] = e;
      };
      for (const f of faces) {
        // Newell's method, stable when leading vertices coincide
        let nx = 0, ny = 0, nz = 0;
        for (let k = 0, m = f.i.length; k < m; k++) {
          const a = f.i[k] * 3, b = f.i[(k + 1) % m] * 3;
          nx += (verts[a + 1] - verts[b + 1]) * (verts[a + 2] + verts[b + 2]);
          ny += (verts[a + 2] - verts[b + 2]) * (verts[a] + verts[b]);
          nz += (verts[a] - verts[b]) * (verts[a + 1] + verts[b + 1]);
        }
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len;
        ny /= len;
        nz /= len;
        const e = f.emissive || 0;
        for (let k = 1; k < f.i.length - 1; k++) {
          put(f.i[0], nx, ny, nz, f.color, e);
          put(f.i[k], nx, ny, nz, f.color, e);
          put(f.i[k + 1], nx, ny, nz, f.color, e);
        }
      }
      return makePart(out, MESH_STRIDE, [[0, 3], [1, 3], [2, 4]], ibo);
    };
    const LINE_CORNERS = [[0, -1], [1, -1], [1, 1], [0, -1], [1, 1], [0, 1]];
    const buildLinePart = (geometry, ibo) => {
      const { verts, lines } = geometry;
      if (!lines || !lines.length) return null;
      const out = new Float32Array(lines.length * 6 * LINE_STRIDE);
      let o = 0;
      for (const l of lines) {
        const a = l.i[0] * 3, b = l.i[1] * 3;
        for (const [end, side] of LINE_CORNERS) {
          out[o++] = verts[a];
          out[o++] = verts[a + 1];
          out[o++] = verts[a + 2];
          out[o++] = verts[b];
          out[o++] = verts[b + 1];
          out[o++] = verts[b + 2];
          out[o++] = end;
          out[o++] = side;
          out[o++] = l.color[0] / 255;
          out[o++] = l.color[1] / 255;
          out[o++] = l.color[2] / 255;
          out[o++] = l.emissive || 0;
        }
      }
      const part = makePart(out, LINE_STRIDE, [[0, 3], [1, 3], [2, 2], [8, 4]], ibo);
      part.width = geometry.lineWidth || 1.5;
      return part;
    };
    const recordFor = (geometry) => {
      let rec = records.get(geometry);
      if (!rec) {
        const ibo = gl.createBuffer();
        rec = { ibo, capacity: 0, mesh: buildMeshPart(geometry, ibo), line: buildLinePart(geometry, ibo), nodes: [], count: 0, active: false, data: null };
        records.set(geometry, rec);
      }
      return rec;
    };
    const collect = (node) => {
      if (!node.geometry) return;
      const rec = recordFor(node.geometry);
      if (!rec.active) {
        rec.active = true;
        rec.count = 0;
        activeRecords.push(rec);
      }
      rec.nodes[rec.count++] = node;
    };
    const uploadInstances = (rec) => {
      const need = rec.count * INSTANCE_FLOATS;
      if (!rec.data || rec.data.length < need) {
        rec.data = new Float32Array(Math.max(need, (rec.data ? rec.data.length : 0) * 2, INSTANCE_FLOATS));
      }
      const d = rec.data;
      for (let i = 0; i < rec.count; i++) {
        const n = rec.nodes[i];
        const o = i * INSTANCE_FLOATS;
        d.set(n.world, o);
        d[o + 16] = n.glow;
        d[o + 17] = n.highlight;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, rec.ibo);
      if (rec.capacity < d.length) {
        gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
        rec.capacity = d.length;
      } else {
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, d, 0, need);
      }
    };
    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      const budget = Math.sqrt(MAX_PIXELS / Math.max(1, width * height));
      dpr = Math.max(0.75, Math.min(window.devicePixelRatio || 1, settings.dpr, budget));
      size.width = width;
      size.height = height;
      pw = Math.max(1, Math.round(width * dpr));
      ph = Math.max(1, Math.round(height * dpr));
      canvas.width = pw;
      canvas.height = ph;
      buildFbo();
    };
    const init = () => {
      buildPrograms();
      buildShadow();
      resize();
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.frontFace(gl.CCW);
    };
    const onLost = (e) => {
      e.preventDefault();
      lost = true;
    };
    const onRestored = () => {
      records.clear();
      activeRecords.length = 0;
      res.fbo = null;
      res.shadow = null;
      init();
      lost = false;
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    const drawParts = (kind, useProgram) => {
      for (const rec of activeRecords) {
        const part = rec[kind];
        if (!part) continue;
        if (kind === "mesh" && useProgram === "shadow" && rec.nodes[0].geometry.castShadow === false) continue;
        if (kind === "line") gl.uniform1f(res.programs.line.u.uWidth, part.width * dpr);
        gl.bindVertexArray(part.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, part.count, rec.count);
      }
    };
    const blit = (f) => {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, f.scene);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, f.resolve);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
      gl.blitFramebuffer(0, 0, pw, ph, 0, 0, pw, ph, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.readBuffer(gl.COLOR_ATTACHMENT1);
      gl.drawBuffers([gl.NONE, gl.COLOR_ATTACHMENT1]);
      gl.blitFramebuffer(0, 0, pw, ph, 0, 0, pw, ph, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    };
    const fullscreen = (program, fb, w, h) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.viewport(0, 0, w, h);
      gl.useProgram(program.prog);
      gl.bindVertexArray(res.quadVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const render = (root, camera, opts = {}) => {
      if (lost || !pollPrograms()) return false;
      const {
        light = DEFAULT_LIGHT,
        sky = DEFAULT_SKY,
        ground = DEFAULT_GROUND,
        sun = DEFAULT_SUN,
        clear = DEFAULT_CLEAR,
        bloomStrength = 0.9,
        shadowCenter = DEFAULT_SHADOW_CENTER,
        shadowExtent = 13
      } = opts;
      if (canvas.clientWidth !== width || canvas.clientHeight !== height) resize();
      const f = res.fbo, sh = res.shadow, pg = res.programs;
      mat4.lookAt(view, camera.position, camera.target, UP);
      mat4.perspective(proj, camera.fov, width / height, camera.near, camera.far);
      mat4.multiply(viewProj, proj, view);
      const llen = Math.hypot(light.x, light.y, light.z) || 1;
      const lx = light.x / llen, ly = light.y / llen, lz = light.z / llen;
      // Set the light back to bracket the shadowed volume
      const lightDist = shadowExtent * 1.8, lightDepth = shadowExtent * 1.5;
      LIGHT_EYE.x = shadowCenter.x + lx * lightDist;
      LIGHT_EYE.y = shadowCenter.y + ly * lightDist;
      LIGHT_EYE.z = shadowCenter.z + lz * lightDist;
      mat4.lookAt(lightView, LIGHT_EYE, shadowCenter, UP);
      mat4.ortho(lightProj, -shadowExtent, shadowExtent, -shadowExtent, shadowExtent, Math.max(0.5, lightDist - lightDepth), lightDist + lightDepth);
      mat4.multiply(lightViewProj, lightProj, lightView);
      for (const rec of activeRecords) {
        rec.active = false;
        rec.nodes.length = 0;
      }
      activeRecords.length = 0;
      updateWorld(root, null);
      traverseVisible(root, collect);
      for (const rec of activeRecords) {
        rec.nodes.length = rec.count;
        uploadInstances(rec);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, sh.fb);
      gl.viewport(0, 0, sh.size, sh.size);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(pg.shadow.prog);
      gl.uniformMatrix4fv(pg.shadow.u.uLightViewProj, false, lightViewProj);
      gl.cullFace(gl.FRONT);
      drawParts("mesh", "shadow");
      gl.cullFace(gl.BACK);
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.scene);
      gl.viewport(0, 0, pw, ph);
      gl.clearColor(clear[0], clear[1], clear[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.clearBufferfv(gl.COLOR, 1, ZERO4);
      gl.useProgram(pg.mesh.prog);
      gl.uniformMatrix4fv(pg.mesh.u.uViewProj, false, viewProj);
      gl.uniformMatrix4fv(pg.mesh.u.uLightViewProj, false, lightViewProj);
      gl.uniform3f(pg.mesh.u.uLightDir, lx, ly, lz);
      gl.uniform3fv(pg.mesh.u.uSky, sky);
      gl.uniform3fv(pg.mesh.u.uGround, ground);
      gl.uniform3fv(pg.mesh.u.uSun, sun);
      gl.uniform1f(pg.mesh.u.uShadowTexel, 1 / sh.size);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sh.tex);
      gl.uniform1i(pg.mesh.u.uShadow, 0);
      drawParts("mesh", "mesh");
      gl.useProgram(pg.line.prog);
      gl.uniformMatrix4fv(pg.line.u.uViewProj, false, viewProj);
      gl.uniform2f(pg.line.u.uViewport, pw, ph);
      gl.disable(gl.CULL_FACE);
      drawParts("line", "line");
      gl.enable(gl.CULL_FACE);
      if (f.samples > 0) blit(f);
      gl.disable(gl.DEPTH_TEST);
      const [bw, bh] = f.bloomSize;
      if (settings.bloom) {
        gl.useProgram(pg.blur.prog);
        gl.uniform1i(pg.blur.u.uTex, 0);
        gl.bindTexture(gl.TEXTURE_2D, f.bright);
        gl.uniform2f(pg.blur.u.uDir, 1.4 / bw, 0);
        fullscreen(pg.blur, f.ping[0].fb, bw, bh);
        gl.bindTexture(gl.TEXTURE_2D, f.ping[0].tex);
        gl.uniform2f(pg.blur.u.uDir, 0, 1.4 / bh);
        fullscreen(pg.blur, f.ping[1].fb, bw, bh);
        gl.bindTexture(gl.TEXTURE_2D, f.ping[1].tex);
        gl.uniform2f(pg.blur.u.uDir, 2.2 / bw, 0);
        fullscreen(pg.blur, f.ping[0].fb, bw, bh);
        gl.bindTexture(gl.TEXTURE_2D, f.ping[0].tex);
        gl.uniform2f(pg.blur.u.uDir, 0, 2.2 / bh);
        fullscreen(pg.blur, f.ping[1].fb, bw, bh);
      }
      gl.useProgram(pg.composite.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, f.color);
      gl.uniform1i(pg.composite.u.uScene, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, settings.bloom ? f.ping[1].tex : f.bright);
      gl.uniform1i(pg.composite.u.uBloom, 1);
      gl.uniform1f(pg.composite.u.uBloomStrength, settings.bloom ? bloomStrength : 0);
      fullscreen(pg.composite, null, pw, ph);
      gl.activeTexture(gl.TEXTURE0);
      gl.enable(gl.DEPTH_TEST);
      return true;
    };
    // Screen position of a world point, written into out
    const project = (x, y, z, out = {}) => {
      mat4.transformPoint4(P4, viewProj, x, y, z);
      if (P4[3] <= 0.01) return null;
      out.x = (P4[0] / P4[3] * 0.5 + 0.5) * width;
      out.y = (0.5 - P4[1] / P4[3] * 0.5) * height;
      out.depth = -P4[3];
      return out;
    };
    const ray = (px, py, camera, out) => mat4.rayFromView(out, view, width, height, camera.fov, camera.position, px, py);
    const setQuality = (name) => {
      if (!QUALITY[name] || QUALITY[name] === settings) return;
      settings = QUALITY[name];
      buildShadow();
      resize();
    };
    const dispose = () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      destroyRecords();
      destroyFbo();
      destroyShadow();
      for (const p of Object.values(res.programs)) gl.deleteProgram(p.prog);
      if (res.quadVao) gl.deleteVertexArray(res.quadVao);
      res.programs = {};
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    };
    // Drop unreferenced buffers, rebuilt on demand
    const releaseUnused = (live) => {
      let released = 0;
      for (const geometry of [...records.keys()]) {
        if (live.has(geometry)) continue;
        releaseGeometry(geometry);
        released++;
      }
      return released;
    };
    const releaseGeometry = (geometry) => {
      const rec = records.get(geometry);
      if (!rec) return;
      deleteRecord(rec);
      records.delete(geometry);
    };
    init();
    return {
      kind: "webgl2",
      render,
      resize,
      project,
      ray,
      setQuality,
      releaseGeometry,
      releaseUnused,
      dispose,
      get quality() {
        return Object.keys(QUALITY).find((k) => QUALITY[k] === settings);
      },
      get stats() {
        return { records: records.size, active: activeRecords.length };
      },
      get ready() {
        return ready;
      },
      get failure() {
        return failure;
      },
      get size() {
        return size;
      }
    };
  };
  BL.glRenderer = { createRenderer, isSupported, QUALITY };
})();
