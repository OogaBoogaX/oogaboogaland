(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { mat4 } = BL.math;
  const { updateWorld, traverseVisible, boundsOf } = BL.scene;
  const POINT_LIGHT_CAPACITY = 7;
  const QUALITY = {
    high: { dpr: 1.5, msaa: 4, shadow: 2048, bloom: true, mirror: 512, lights: POINT_LIGHT_CAPACITY },
    medium: { dpr: 1.25, msaa: 2, shadow: 1024, bloom: true, mirror: 384, lights: POINT_LIGHT_CAPACITY },
    low: { dpr: 1, msaa: 0, shadow: 512, bloom: false, mirror: 256, lights: POINT_LIGHT_CAPACITY }
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
  const DEFAULT_MOON = { x: 0, y: -1, z: 0 };
  const DEFAULT_STAR_MATRIX = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const CULL_MARGIN = 0.5;
  const UP = { x: 0, y: 1, z: 0 };
  const NORTH_UP = { x: 0, y: 0, z: -1 };
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
out vec3 vWorld;
void main() {
  mat4 m = mat4(aM0, aM1, aM2, aM3);
  vec4 w = m * vec4(aPos, 1.0);
  vNormal = normalize(mat3(m) * aNormal);
  vColor = aColor;
  vParams = aParams;
  vShadow = uLightViewProj * w;
  vWorld = w.xyz;
  gl_Position = uViewProj * w;
}`;
  const MESH_FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vNormal;
in vec4 vColor;
in vec4 vParams;
in vec4 vShadow;
in vec3 vWorld;
uniform vec3 uLightDir;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uSun;
uniform float uDirectStrength;
uniform float uAmbientFloor;
uniform float uDiffuseFloor;
uniform float uShadowStrength;
uniform float uShadowFloor;
uniform float uShadowBias;
uniform sampler2DShadow uShadow;
uniform float uShadowTexel;
uniform vec4 uLights[16];
uniform int uLightCount;
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
  float ndl = max(max(dot(n, uLightDir), 0.0), uDiffuseFloor);
  vec3 sp = vShadow.xyz / vShadow.w * 0.5 + 0.5;
  float bias = max(uShadowBias * (1.0 - ndl), uShadowBias * 0.32);
  float sh = shadowAt(sp, bias);
  vec3 ambient = max(mix(uGround, uSky, n.y * 0.5 + 0.5), vec3(uAmbientFloor));
  float shadow = mix(1.0, max(sh, uShadowFloor), uShadowStrength);
  vec3 lit = base * (ambient + uSun * ndl * uDirectStrength * shadow);
  for (int i = 0; i < 7; i++) {
    if (i >= uLightCount) break;
    vec4 lp = uLights[i * 2];
    vec3 ld = lp.xyz - vWorld;
    float dist = length(ld);
    float a = clamp(1.0 - dist / lp.w, 0.0, 1.0);
    a *= a;
    lit += base * uLights[i * 2 + 1].rgb * a * max(dot(n, ld), 0.0) / max(dist, 0.0001);
  }
  vec3 col = mix(lit, base * 1.15, emissive);
  col = mix(col, vec3(1.0, 0.86, 0.45), vParams.y * 0.4);
  float tip = clamp(vParams.z, 0.0, 1.0);
  col = mix(col, vec3(0.84, 1.0, 0.89), tip * 0.88);
  oColor = vec4(col, 1.0);
  oBright = vec4(col * (emissive * 0.9 + vParams.y * 0.5 + tip * 0.85), 1.0);
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
  const MIRROR_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=3) in vec4 aM0;
layout(location=4) in vec4 aM1;
layout(location=5) in vec4 aM2;
layout(location=6) in vec4 aM3;
uniform mat4 uViewProj;
uniform mat4 uReflectionViewProj;
out vec4 vReflection;
out vec3 vWorld;
out vec2 vPortalUv;
void main() {
  vec4 world = mat4(aM0, aM1, aM2, aM3) * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vReflection = uReflectionViewProj * world;
  vPortalUv = vec2(aPos.x / 5.0 + 0.5, 1.0 - (aPos.y + 1.75) / 3.25);
  gl_Position = uViewProj * world;
}`;
  const MIRROR_FS = `#version 300 es
precision highp float;
in vec4 vReflection;
in vec3 vWorld;
in vec2 vPortalUv;
uniform sampler2D uReflection;
uniform vec3 uTint;
uniform float uPortal;
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oBright;
void main() {
  vec2 projectedUv = vReflection.xy / vReflection.w * 0.5 + 0.5;
  vec2 uv = mix(projectedUv, vPortalUv, uPortal);
  vec3 reflected = texture(uReflection, uv).rgb;
  float sheen = pow(max(0.0, 1.0 - abs(fract((vWorld.x + vWorld.y) * 0.22) - 0.5) * 7.0), 5.0) * 0.08;
  vec3 color = mix(reflected, uTint, 0.1) + sheen;
  oColor = vec4(color, 1.0);
  oBright = vec4(0.0);
}`;
  const QUAD_VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 1.0, 1.0);
}`;
  const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform mat4 uInvViewProj;
uniform vec3 uEye;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform mat3 uStarMatrix;
uniform float uStars;
uniform float uTime;
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oBright;
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
void main() {
  vec4 far = uInvViewProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 d = normalize(far.xyz / far.w - uEye);
  vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.5, d.y));
  col = mix(col, uHorizon * 0.55, smoothstep(0.0, 0.5, -d.y));
  float sd = max(dot(d, uSunDir), 0.0);
  float sunDisc = pow(sd, 600.0) * (1.0 - uStars);
  vec3 sun = uSun * (sunDisc + pow(sd, 6.0) * 0.18 * (1.0 - uStars));
  float moonDisc = smoothstep(0.9985, 0.999, dot(d, uMoonDir)) * uStars;
  vec3 moon = vec3(0.82, 0.88, 1.0) * moonDisc;
  vec3 stars = vec3(0.0);
  if (uStars > 0.002) {
    vec3 starD = normalize(uStarMatrix * d);
    vec3 a = abs(starD);
    vec2 f;
    float face;
    if (a.x >= a.y && a.x >= a.z) { f = starD.yz / a.x; face = starD.x > 0.0 ? 0.0 : 1.0; }
    else if (a.y >= a.z) { f = starD.xz / a.y; face = starD.y > 0.0 ? 2.0 : 3.0; }
    else { f = starD.xy / a.z; face = starD.z > 0.0 ? 4.0 : 5.0; }
    f = (f * 0.5 + 0.5) * 48.0;
    vec2 cell = floor(f) + face * 97.0;
    float h = hash(cell);
    if (h < 0.14) {
      float h2 = hash(cell + 17.3);
      float h3 = hash(cell + 41.7);
      float r = 0.12 + h2 * 0.18;
      float pt = 1.0 - smoothstep(0.0, r, length(fract(f) - 0.5));
      float twinkle = 0.75 + 0.25 * sin(uTime * (2.0 + h3 * 3.0) + h3 * 6.28);
      float s = pt * (0.5 + 0.5 * h2) * twinkle * uStars * smoothstep(-0.05, 0.15, d.y);
      stars = mix(vec3(1.0), vec3(0.75, 0.85, 1.0), h3) * s;
    }
  }
  oColor = vec4(col + sun + moon + stars, 1.0);
  oBright = vec4(uSun * sunDisc * 0.6 + moon * 0.5 + stars * 0.35, 1.0);
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
    let qualityName = QUALITY[quality] ? quality : "high";
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
    const MIRROR_POINT = new Float32Array(3);
    const MIRROR_CLIP = new Float32Array(4);
    const MIRROR_RECT = new Float32Array(4);
    const mirrorView = mat4.create();
    const mirrorProj = mat4.create();
    const mirrorViewProj = mat4.create();
    const mirrorCapturedViewProj = mat4.create();
    const invViewProj = mat4.create();
    const mirrorInvViewProj = mat4.create();
    const FRUSTUM = new Float32Array(24);
    const CENTER = new Float32Array(3);
    let culled = 0, drawn = 0, shadowPassCount = 0;
    const mirrorEye = { x: 0, y: 0, z: 0 };
    const mirrorTarget = { x: 0, y: 0, z: 0 };
    const mirrorUp = { x: 0, y: 1, z: 0 };
    const records = new Map();
    const activeRecords = [];
    const res = { programs: {}, fbo: null, shadow: null, bloom: null, quadVao: null };
    const mirror = { node: null, record: null, geometry: null, program: null, programReady: false, fb: null, tex: null, depth: null, color: null, msFb: null, msaa: -1, width: 0, height: 0, frame: 0, portal: false, walkThrough: false, captureValid: false };
    const mirrorDebug = {
      active: false, faux: false, portal: false, surfaceDrawn: false, captureValid: false, width: 0, height: 0, samples: 0, allocationCount: 0, reflectionPassCount: 0, skippedPassCount: 0, resources: 0, captureExcluded: false,
      cameraPosition: new Float32Array(3), cameraTarget: new Float32Array(3), planeCenter: new Float32Array(3), planeNormal: new Float32Array(3), capturedViewProj: mirrorCapturedViewProj, skipReason: "none"
    };
    // Compile without blocking, ready flips once linked
    let parallel = null;
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
    const destroyMirrorProgram = () => {
      const p = mirror.program;
      if (!p) return;
      for (const sh of p.shaders) gl.deleteShader(sh);
      gl.deleteProgram(p.prog);
      mirror.program = null;
      mirror.programReady = false;
      mirrorDebug.resources--;
    };
    const ensureMirrorProgram = () => {
      if (!mirror.program) {
        mirror.program = compile(MIRROR_VS, MIRROR_FS, ["uViewProj", "uReflectionViewProj", "uReflection", "uTint", "uPortal"]);
        mirrorDebug.resources++;
      }
      if (mirror.programReady) return true;
      if (parallel && !gl.getProgramParameter(mirror.program.prog, parallel.COMPLETION_STATUS_KHR)) return false;
      finishProgram(mirror.program);
      mirror.programReady = true;
      return true;
    };
    const buildPrograms = () => {
      ready = false;
      failure = null;
      res.programs = {
        mesh: compile(MESH_VS, MESH_FS, ["uViewProj", "uLightViewProj", "uLightDir", "uSky", "uGround", "uSun", "uDirectStrength", "uAmbientFloor", "uDiffuseFloor", "uShadowStrength", "uShadowFloor", "uShadowBias", "uShadow", "uShadowTexel", "uLights", "uLightCount"]),
        shadow: compile(SHADOW_VS, SHADOW_FS, ["uLightViewProj"]),
        line: compile(LINE_VS, LINE_FS, ["uViewProj", "uViewport", "uWidth"]),
        sky: compile(QUAD_VS, SKY_FS, ["uInvViewProj", "uEye", "uHorizon", "uZenith", "uSun", "uSunDir", "uMoonDir", "uStarMatrix", "uStars", "uTime"]),
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
    const destroyMirrorTarget = () => {
      if (!mirror.fb) return;
      gl.deleteTexture(mirror.tex);
      gl.deleteRenderbuffer(mirror.depth);
      gl.deleteFramebuffer(mirror.fb);
      mirror.captureValid = mirrorDebug.captureValid = false;
      mirrorDebug.resources -= 3;
      if (mirror.msFb) {
        gl.deleteRenderbuffer(mirror.color);
        gl.deleteFramebuffer(mirror.msFb);
        mirrorDebug.resources -= 2;
      }
      mirror.fb = mirror.tex = mirror.depth = mirror.color = mirror.msFb = null;
      mirror.msaa = -1;
      mirror.width = mirror.height = mirrorDebug.width = mirrorDebug.height = mirrorDebug.samples = 0;
    };
    // The tier's multisampling draws into renderbuffers, resolved by blit into the sampled texture
    const ensureMirrorTarget = () => {
      const cap = settings.mirror;
      const scale = cap / Math.max(width, height, 1);
      const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
      if (mirror.fb && mirror.width === w && mirror.height === h && mirror.msaa === settings.msaa) return;
      destroyMirrorTarget();
      const samples = Math.min(settings.msaa, gl.getParameter(gl.MAX_SAMPLES));
      mirror.tex = createTexture(w, h, gl.RGBA8, gl.LINEAR);
      mirror.depth = createRenderbuffer(w, h, gl.DEPTH_COMPONENT16, samples);
      mirror.fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, mirror.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, mirror.tex, 0);
      mirrorDebug.resources += 3;
      if (samples > 0) {
        mirror.color = createRenderbuffer(w, h, gl.RGBA8, samples);
        mirror.msFb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, mirror.msFb);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, mirror.color);
        mirrorDebug.resources += 2;
      }
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, mirror.depth);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      mirror.msaa = settings.msaa;
      mirror.width = mirrorDebug.width = w;
      mirror.height = mirrorDebug.height = h;
      mirrorDebug.samples = samples;
      mirrorDebug.allocationCount++;
    };
    const destroyMirror = () => {
      destroyMirrorTarget();
      destroyMirrorProgram();
      mirror.node = mirror.record = mirror.geometry = null;
      mirror.portal = mirror.walkThrough = false;
      mirrorDebug.active = false;
      mirrorDebug.portal = false;
      mirrorDebug.surfaceDrawn = false;
      mirrorDebug.captureExcluded = false;
    };
    const forgetMirror = () => {
      mirror.node = mirror.record = mirror.geometry = mirror.program = mirror.fb = mirror.tex = mirror.depth = mirror.color = mirror.msFb = null;
      mirror.programReady = false;
      mirror.msaa = -1;
      mirror.width = mirror.height = mirrorDebug.width = mirrorDebug.height = mirrorDebug.samples = 0;
      mirror.portal = mirror.walkThrough = mirror.captureValid = false;
      mirrorDebug.active = false;
      mirrorDebug.portal = mirrorDebug.captureValid = false;
      mirrorDebug.surfaceDrawn = false;
      mirrorDebug.captureExcluded = false;
      mirrorDebug.resources = 0;
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
      if (rec.active) {
        const index = activeRecords.indexOf(rec);
        if (index >= 0) activeRecords.splice(index, 1);
        rec.active = false;
      }
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
      rec.batch = null;
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
        rec = { geometry, ibo, capacity: 0, mesh: buildMeshPart(geometry, ibo), line: buildLinePart(geometry, ibo), nodes: [], count: 0, drawCount: 0, active: false, data: null, batch: null, batchVersion: -1 };
        records.set(geometry, rec);
      }
      return rec;
    };
    // Gribb-Hartmann planes of a column-major view-projection: left, right, bottom, top, near, far
    const extractFrustum = (m) => {
      for (let i = 0; i < 6; i++) {
        const row = i >> 1, sign = i & 1 ? -1 : 1, o = i * 4;
        const a = m[3] + sign * m[row], b = m[7] + sign * m[4 + row], c = m[11] + sign * m[8 + row], d = m[15] + sign * m[12 + row];
        const len = Math.hypot(a, b, c) || 1;
        FRUSTUM[o] = a / len;
        FRUSTUM[o + 1] = b / len;
        FRUSTUM[o + 2] = c / len;
        FRUSTUM[o + 3] = d / len;
      }
    };
    const inFrustum = (node) => {
      const b = boundsOf(node.geometry), w = node.world;
      mat4.transformPoint(CENTER, w, b.center[0], b.center[1], b.center[2]);
      const scale = Math.max(w[0] * w[0] + w[1] * w[1] + w[2] * w[2], w[4] * w[4] + w[5] * w[5] + w[6] * w[6], w[8] * w[8] + w[9] * w[9] + w[10] * w[10]);
      const r = b.radius * Math.sqrt(scale) + CULL_MARGIN;
      for (let i = 0; i < 24; i += 4) {
        if (FRUSTUM[i] * CENTER[0] + FRUSTUM[i + 1] * CENTER[1] + FRUSTUM[i + 2] * CENTER[2] + FRUSTUM[i + 3] < -r) return false;
      }
      return true;
    };
    const collect = (node) => {
      if (!node.geometry) return;
      if (node.mirror || node.mirrorPortal) {
        if (mirror.node) throw new Error("A scene may contain at most one mirror node");
        mirror.node = node;
        mirror.geometry = node.geometry;
        mirror.portal = !!node.mirrorPortal;
        mirror.walkThrough = !!node.mirrorWalkThrough;
        mirrorDebug.active = true;
        mirrorDebug.portal = mirror.portal;
      }
      const rec = recordFor(node.geometry);
      if (node.mirror || node.mirrorPortal) mirror.record = rec;
      if (!rec.active) {
        rec.active = true;
        rec.count = 0;
        rec.drawCount = 0;
        activeRecords.push(rec);
      }
      if (node.instanceData) {
        rec.batch = node;
        rec.count = rec.drawCount = node.instanceCount;
        return;
      }
      // In-frustum nodes stay in front of the culled ones by swapping into the draw region
      const idx = rec.count++;
      rec.nodes[idx] = node;
      if (inFrustum(node)) {
        rec.nodes[idx] = rec.nodes[rec.drawCount];
        rec.nodes[rec.drawCount++] = node;
      } else culled++;
    };
    const uploadInstances = (rec) => {
      const need = rec.count * INSTANCE_FLOATS;
      if (rec.batch) {
        gl.bindBuffer(gl.ARRAY_BUFFER, rec.ibo);
        // Grow geometrically within the batch's own array, so a fading population reallocates a few times, not per instance
        const cap = Math.min(rec.batch.instanceData.length, Math.max(need, rec.capacity * 2));
        if (rec.capacity < cap) {
          gl.bufferData(gl.ARRAY_BUFFER, cap * 4, gl.DYNAMIC_DRAW);
          rec.capacity = cap;
          rec.batchVersion = -1;
        }
        if (rec.batchVersion !== rec.batch.instanceVersion) {
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, rec.batch.instanceData, 0, need);
          rec.batchVersion = rec.batch.instanceVersion;
        }
        return;
      }
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
    const skipMirrorPass = (reason) => {
      mirrorDebug.skippedPassCount++;
      mirrorDebug.skipReason = reason;
      return false;
    };
    const reflectMirrorPoint = (out, point, center, normal) => {
      const d = (point.x - center[0]) * normal[0] + (point.y - center[1]) * normal[1] + (point.z - center[2]) * normal[2];
      out.x = point.x - 2 * d * normal[0];
      out.y = point.y - 2 * d * normal[1];
      out.z = point.z - 2 * d * normal[2];
    };
    // NDC bounds of the mirror's vertices under a view-projection, false when none lie in front
    const mirrorRect = (node, vp) => {
      const verts = node.geometry.verts, world = node.world;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < verts.length; i += 3) {
        mat4.transformPoint(MIRROR_POINT, world, verts[i], verts[i + 1], verts[i + 2]);
        mat4.transformPoint4(MIRROR_CLIP, vp, MIRROR_POINT[0], MIRROR_POINT[1], MIRROR_POINT[2]);
        if (MIRROR_CLIP[3] <= 0.01) continue;
        const x = MIRROR_CLIP[0] / MIRROR_CLIP[3], y = MIRROR_CLIP[1] / MIRROR_CLIP[3];
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      if (minX === Infinity) return false;
      MIRROR_RECT[0] = minX;
      MIRROR_RECT[1] = minY;
      MIRROR_RECT[2] = maxX;
      MIRROR_RECT[3] = maxY;
      return true;
    };
    const updateMirrorSide = (camera) => {
      if (!mirror.walkThrough) return;
      const world = mirror.node.world, center = mirrorDebug.planeCenter, normal = mirrorDebug.planeNormal;
      center[0] = world[12];
      center[1] = world[13];
      center[2] = world[14];
      const nlen = Math.hypot(world[8], world[9], world[10]) || 1;
      normal[0] = world[8] / nlen;
      normal[1] = world[9] / nlen;
      normal[2] = world[10] / nlen;
      mirror.portal = !!mirror.node.mirrorPortal;
      mirrorDebug.portal = mirror.portal;
    };
    const prepareMirrorCamera = (camera) => {
      const node = mirror.node, world = node.world, center = mirrorDebug.planeCenter, normal = mirrorDebug.planeNormal;
      center[0] = world[12];
      center[1] = world[13];
      center[2] = world[14];
      const nlen = Math.hypot(world[8], world[9], world[10]) || 1;
      normal[0] = world[8] / nlen;
      normal[1] = world[9] / nlen;
      normal[2] = world[10] / nlen;
      const cameraSide = (camera.position.x - center[0]) * normal[0] + (camera.position.y - center[1]) * normal[1] + (camera.position.z - center[2]) * normal[2];
      if (cameraSide <= 0.001) return skipMirrorPass("back-facing");
      mat4.transformPoint4(MIRROR_CLIP, viewProj, center[0], center[1], center[2]);
      if (MIRROR_CLIP[3] <= 0.01) return skipMirrorPass("behind-camera");
      if (!mirrorRect(node, viewProj) || MIRROR_RECT[2] < -1 || MIRROR_RECT[0] > 1 || MIRROR_RECT[3] < -1 || MIRROR_RECT[1] > 1) return skipMirrorPass("offscreen");
      const area = (Math.min(1, MIRROR_RECT[2]) - Math.max(-1, MIRROR_RECT[0])) * width * 0.5 * (Math.min(1, MIRROR_RECT[3]) - Math.max(-1, MIRROR_RECT[1])) * height * 0.5;
      if (area < 16) return skipMirrorPass("negligible");
      reflectMirrorPoint(mirrorEye, camera.position, center, normal);
      reflectMirrorPoint(mirrorTarget, camera.target, center, normal);
      const upDot = UP.x * normal[0] + UP.y * normal[1] + UP.z * normal[2];
      mirrorUp.x = UP.x - 2 * upDot * normal[0];
      mirrorUp.y = UP.y - 2 * upDot * normal[1];
      mirrorUp.z = UP.z - 2 * upDot * normal[2];
      mat4.lookAt(mirrorView, mirrorEye, mirrorTarget, mirrorUp);
      mat4.perspective(mirrorProj, camera.fov, width / height, camera.near, camera.far);
      // Crop the reflected frustum to the glass so every texel lands on it, but never denser than the screen
      mat4.multiply(mirrorViewProj, mirrorProj, mirrorView);
      mirrorRect(node, mirrorViewProj);
      const minHalf = settings.mirror / (Math.max(width, height, 1) * dpr);
      const cropX = (MIRROR_RECT[0] + MIRROR_RECT[2]) * 0.5, cropY = (MIRROR_RECT[1] + MIRROR_RECT[3]) * 0.5;
      const halfX = Math.max(MIRROR_RECT[2] - cropX, minHalf), halfY = Math.max(MIRROR_RECT[3] - cropY, minHalf);
      mirrorProj[0] /= halfX;
      mirrorProj[8] = (mirrorProj[8] + cropX) / halfX;
      mirrorProj[5] /= halfY;
      mirrorProj[9] = (mirrorProj[9] + cropY) / halfY;
      // Sky rays unproject through the cropped projection, before the oblique clip bends z
      mat4.multiply(mirrorViewProj, mirrorProj, mirrorView);
      mat4.invert(mirrorInvViewProj, mirrorViewProj);
      mat4.transformPoint(MIRROR_POINT, mirrorView, center[0], center[1], center[2]);
      let cx = mirrorView[0] * normal[0] + mirrorView[4] * normal[1] + mirrorView[8] * normal[2];
      let cy = mirrorView[1] * normal[0] + mirrorView[5] * normal[1] + mirrorView[9] * normal[2];
      let cz = mirrorView[2] * normal[0] + mirrorView[6] * normal[1] + mirrorView[10] * normal[2];
      const clen = Math.hypot(cx, cy, cz) || 1;
      cx /= clen;
      cy /= clen;
      cz /= clen;
      let cw = -(cx * MIRROR_POINT[0] + cy * MIRROR_POINT[1] + cz * MIRROR_POINT[2]);
      const qx = ((cx >= 0 ? 1 : -1) + mirrorProj[8]) / mirrorProj[0];
      const qy = ((cy >= 0 ? 1 : -1) + mirrorProj[9]) / mirrorProj[5];
      const qz = -1;
      const qw = (1 + mirrorProj[10]) / mirrorProj[14];
      const clipScale = 2 / (cx * qx + cy * qy + cz * qz + cw * qw);
      cx *= clipScale;
      cy *= clipScale;
      cz *= clipScale;
      cw *= clipScale;
      mirrorProj[2] = cx;
      mirrorProj[6] = cy;
      mirrorProj[10] = cz + 0.998;
      mirrorProj[14] = cw;
      mat4.multiply(mirrorViewProj, mirrorProj, mirrorView);
      mirrorDebug.cameraPosition[0] = mirrorEye.x;
      mirrorDebug.cameraPosition[1] = mirrorEye.y;
      mirrorDebug.cameraPosition[2] = mirrorEye.z;
      mirrorDebug.cameraTarget[0] = mirrorTarget.x;
      mirrorDebug.cameraTarget[1] = mirrorTarget.y;
      mirrorDebug.cameraTarget[2] = mirrorTarget.z;
      mirrorDebug.skipReason = "none";
      return true;
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
      parallel = gl.getExtension("KHR_parallel_shader_compile");
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
      forgetMirror();
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
    // The camera pass draws only the in-frustum front of each record; shadow and mirror draw all
    const drawParts = (kind, useProgram, excludeMirror = false, cull = false) => {
      for (const rec of activeRecords) {
        if (excludeMirror && rec === mirror.record) continue;
        const part = rec[kind], n = cull ? rec.drawCount : rec.count;
        if (!part || !n) continue;
        if (kind === "mesh" && useProgram === "shadow" && rec.geometry.castShadow === false) continue;
        if (kind === "line") gl.uniform1f(res.programs.line.u.uWidth, part.width * dpr);
        gl.bindVertexArray(part.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, part.count, n);
      }
    };
    const drawSky = (inv, eye) => {
      const p = res.programs.sky;
      gl.useProgram(p.prog);
      gl.uniformMatrix4fv(p.u.uInvViewProj, false, inv);
      gl.uniform3f(p.u.uEye, eye.x, eye.y, eye.z);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(false);
      gl.bindVertexArray(res.quadVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.depthMask(true);
      gl.depthFunc(gl.LESS);
    };
    const renderMirrorCapture = (clear, sky, ground, direct, directStrength, ambientFloor, diffuseFloor, shadowStrength, shadowFloor, shadowBias, lx, ly, lz, sh, lights, lightCount, skyOn) => {
      ensureMirrorTarget();
      const pg = res.programs;
      gl.bindFramebuffer(gl.FRAMEBUFFER, mirror.msFb || mirror.fb);
      gl.viewport(0, 0, mirror.width, mirror.height);
      gl.clearColor(clear[0], clear[1], clear[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(pg.mesh.prog);
      gl.uniformMatrix4fv(pg.mesh.u.uViewProj, false, mirrorViewProj);
      gl.uniformMatrix4fv(pg.mesh.u.uLightViewProj, false, lightViewProj);
      gl.uniform3f(pg.mesh.u.uLightDir, lx, ly, lz);
      gl.uniform3fv(pg.mesh.u.uSky, sky);
      gl.uniform3fv(pg.mesh.u.uGround, ground);
      gl.uniform3fv(pg.mesh.u.uSun, direct);
      gl.uniform1f(pg.mesh.u.uDirectStrength, directStrength);
      gl.uniform1f(pg.mesh.u.uAmbientFloor, ambientFloor);
      gl.uniform1f(pg.mesh.u.uDiffuseFloor, diffuseFloor);
      gl.uniform1f(pg.mesh.u.uShadowStrength, shadowStrength);
      gl.uniform1f(pg.mesh.u.uShadowFloor, shadowFloor);
      gl.uniform1f(pg.mesh.u.uShadowBias, shadowBias);
      gl.uniform1f(pg.mesh.u.uShadowTexel, 1 / sh.size);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sh.tex);
      gl.uniform1i(pg.mesh.u.uShadow, 0);
      if (lights) gl.uniform4fv(pg.mesh.u.uLights, lights);
      gl.uniform1i(pg.mesh.u.uLightCount, lightCount);
      drawParts("mesh", "mesh", true);
      if (skyOn) drawSky(mirrorInvViewProj, mirrorEye);
      gl.useProgram(pg.line.prog);
      gl.uniformMatrix4fv(pg.line.u.uViewProj, false, mirrorViewProj);
      gl.uniform2f(pg.line.u.uViewport, mirror.width, mirror.height);
      gl.disable(gl.CULL_FACE);
      drawParts("line", "line", true);
      gl.enable(gl.CULL_FACE);
      if (mirror.msFb) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, mirror.msFb);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, mirror.fb);
        gl.blitFramebuffer(0, 0, mirror.width, mirror.height, 0, 0, mirror.width, mirror.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      }
      mirrorCapturedViewProj.set(mirrorViewProj);
      mirror.captureValid = mirrorDebug.captureValid = true;
      mirrorDebug.reflectionPassCount++;
      mirrorDebug.captureExcluded = true;
    };
    const drawMirrorSurface = () => {
      const rec = mirror.record, part = rec && rec.mesh, pg = mirror.program;
      if (mirror.portal || !part || !mirror.tex || !mirror.programReady || !mirror.captureValid) return;
      gl.useProgram(pg.prog);
      gl.uniformMatrix4fv(pg.u.uViewProj, false, viewProj);
      gl.uniformMatrix4fv(pg.u.uReflectionViewProj, false, mirrorCapturedViewProj);
      gl.uniform3f(pg.u.uTint, 0.56, 0.62, 0.67);
      gl.uniform1f(pg.u.uPortal, mirror.portal ? 1 : 0);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, mirror.tex);
      gl.uniform1i(pg.u.uReflection, 2);
      gl.bindVertexArray(part.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, part.count, rec.count);
      mirrorDebug.surfaceDrawn = true;
      gl.activeTexture(gl.TEXTURE0);
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
        sunDirection = light,
        direct = sun,
        directStrength = 1,
        ambientFloor = 0,
        diffuseFloor = 0,
        shadowStrength = 1,
        shadowFloor = 0,
        shadowBias = 0.0035,
        clear = DEFAULT_CLEAR,
        bloomStrength = 0.9,
        shadowCenter = DEFAULT_SHADOW_CENTER,
        shadowExtent = 13,
        horizon,
        zenith,
        moon = DEFAULT_MOON,
        stars = 0,
        starMatrix = DEFAULT_STAR_MATRIX,
        time = 0,
        lights,
        lightCount = 0
      } = opts;
      if (canvas.clientWidth !== width || canvas.clientHeight !== height) resize();
      const f = res.fbo, sh = res.shadow, pg = res.programs;
      const skyOn = !!(horizon && zenith);
      const nLights = lights ? Math.min(lightCount, settings.lights) : 0;
      mat4.lookAt(view, camera.position, camera.target, UP);
      mat4.perspective(proj, camera.fov, width / height, camera.near, camera.far);
      mat4.multiply(viewProj, proj, view);
      extractFrustum(viewProj);
      const llen = Math.hypot(light.x, light.y, light.z) || 1;
      const lx = light.x / llen, ly = light.y / llen, lz = light.z / llen;
      const slen = Math.hypot(sunDirection.x, sunDirection.y, sunDirection.z) || 1;
      const sx = sunDirection.x / slen, sy = sunDirection.y / slen, sz = sunDirection.z / slen;
      if (skyOn) {
        mat4.invert(invViewProj, viewProj);
        gl.useProgram(pg.sky.prog);
        gl.uniform3fv(pg.sky.u.uHorizon, horizon);
        gl.uniform3fv(pg.sky.u.uZenith, zenith);
        gl.uniform3fv(pg.sky.u.uSun, sun);
        gl.uniform3f(pg.sky.u.uSunDir, sx, sy, sz);
        gl.uniform3f(pg.sky.u.uMoonDir, moon.x, moon.y, moon.z);
        gl.uniformMatrix3fv(pg.sky.u.uStarMatrix, false, starMatrix);
        gl.uniform1f(pg.sky.u.uStars, stars);
        gl.uniform1f(pg.sky.u.uTime, time);
      }
      // Set the light back to bracket the shadowed volume
      const lightDist = shadowExtent * 1.8, lightDepth = shadowExtent * 1.5;
      LIGHT_EYE.x = shadowCenter.x + lx * lightDist;
      LIGHT_EYE.y = shadowCenter.y + ly * lightDist;
      LIGHT_EYE.z = shadowCenter.z + lz * lightDist;
      mat4.lookAt(lightView, LIGHT_EYE, shadowCenter, Math.abs(ly) > 0.96 ? NORTH_UP : UP);
      mat4.ortho(lightProj, -shadowExtent, shadowExtent, -shadowExtent, shadowExtent, Math.max(0.5, lightDist - lightDepth), lightDist + lightDepth);
      mat4.multiply(lightViewProj, lightProj, lightView);
      mat4.transformPoint4(P4, lightViewProj, 0, 0, 0);
      const shadowSnap = sh.size * 0.5;
      lightProj[12] += (Math.round(P4[0] * shadowSnap) - P4[0] * shadowSnap) / shadowSnap;
      lightProj[13] += (Math.round(P4[1] * shadowSnap) - P4[1] * shadowSnap) / shadowSnap;
      mat4.multiply(lightViewProj, lightProj, lightView);
      for (const rec of activeRecords) {
        rec.active = false;
        rec.nodes.length = 0;
        rec.batch = null;
      }
      activeRecords.length = 0;
      mirror.node = mirror.record = null;
      mirror.portal = mirror.walkThrough = false;
      mirrorDebug.active = false;
      mirrorDebug.portal = false;
      mirrorDebug.surfaceDrawn = false;
      culled = drawn = 0;
      updateWorld(root, null);
      traverseVisible(root, collect);
      for (const rec of activeRecords) {
        if (!rec.batch) rec.nodes.length = rec.count;
        drawn += rec.drawCount;
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
      shadowPassCount++;
      if (mirror.node) {
        mirror.frame++;
        updateMirrorSide(camera);
        if (mirror.portal) {
          skipMirrorPass("portal-open");
        } else if (prepareMirrorCamera(camera)) {
          if (settings !== QUALITY.high && mirror.frame % 2 === 0) skipMirrorPass("cadence");
          else if (!ensureMirrorProgram()) skipMirrorPass("shader-pending");
          else renderMirrorCapture(clear, sky, ground, direct, directStrength, ambientFloor, diffuseFloor, shadowStrength, shadowFloor, shadowBias, lx, ly, lz, sh, lights, nLights, skyOn);
        }
      }
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
      gl.uniform3fv(pg.mesh.u.uSun, direct);
      gl.uniform1f(pg.mesh.u.uDirectStrength, directStrength);
      gl.uniform1f(pg.mesh.u.uAmbientFloor, ambientFloor);
      gl.uniform1f(pg.mesh.u.uDiffuseFloor, diffuseFloor);
      gl.uniform1f(pg.mesh.u.uShadowStrength, shadowStrength);
      gl.uniform1f(pg.mesh.u.uShadowFloor, shadowFloor);
      gl.uniform1f(pg.mesh.u.uShadowBias, shadowBias);
      gl.uniform1f(pg.mesh.u.uShadowTexel, 1 / sh.size);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sh.tex);
      gl.uniform1i(pg.mesh.u.uShadow, 0);
      if (lights) gl.uniform4fv(pg.mesh.u.uLights, lights);
      gl.uniform1i(pg.mesh.u.uLightCount, nLights);
      drawParts("mesh", "mesh", true, true);
      drawMirrorSurface();
      if (skyOn) drawSky(invViewProj, camera.position);
      gl.useProgram(pg.line.prog);
      gl.uniformMatrix4fv(pg.line.u.uViewProj, false, viewProj);
      gl.uniform2f(pg.line.u.uViewport, pw, ph);
      gl.disable(gl.CULL_FACE);
      drawParts("line", "line", false, true);
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
      qualityName = name;
      buildShadow();
      resize();
    };
    const dispose = () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      destroyRecords();
      destroyMirror();
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
      if (mirror.geometry && !live.has(mirror.geometry)) destroyMirror();
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
        return qualityName;
      },
      get stats() {
        let shadowFinite = true;
        for (let i = 0; i < 16; i++) if (!Number.isFinite(lightViewProj[i])) shadowFinite = false;
        return { records: records.size, active: activeRecords.length, mirrorResources: mirrorDebug.resources, shadowResources: res.shadow ? 2 : 0, shadowSize: res.shadow ? res.shadow.size : 0, shadowPassCount, shadowFinite, culled, drawn };
      },
      get mirror() {
        return mirrorDebug;
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
