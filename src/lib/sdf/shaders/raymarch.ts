// GLSL raymarch shaders — instant liquid SDF preview (Womp-style).

export const sdfVertexShader = /* glsl */ `
void main() {
  // Fullscreen clip-space quad.
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const sdfFragmentShader = /* glsl */ `
precision highp float;

uniform vec3 uCamPos;
uniform vec2 uResolution;
uniform float uExtent;
uniform float uSceneDepth;

uniform mat4 uInvProjection;
uniform mat4 uInvView;

uniform vec3 uHalfLWH;
uniform float uCornerR;
uniform float uDraftTan;
uniform float uFloorT;
uniform float uEdgeSize;
uniform float uEdgeType;
uniform float uInnerEdgeSize;
uniform float uInnerHalfL;
uniform float uInnerHalfW;
uniform float uInnerR;
uniform float uCavityCenterZ;
uniform float uCavityHalfH;
uniform float uFlangeW;
uniform float uFlangeT;
uniform float uTopHalfL;
uniform float uTopHalfW;
uniform float uTopR;
uniform float uAmp;
uniform float uPitch;
uniform float uSharpness;
uniform float uTaperBand;
uniform float uSurfType;
uniform float uRibVert;
uniform float uSPitch;
uniform float uZPitch;
uniform float uIncludeLid;
uniform float uPlateT;
uniform float uLidGap;
uniform float uLidLipH;
uniform float uLipOL;
uniform float uLipOW;
uniform float uLipOR;
uniform float uLipIL;
uniform float uLipIW;
uniform float uLipIR;

const float PI = 3.14159265;

vec3 toSdf(vec3 p) {
  return vec3(p.x, p.z, p.y);
}

float sdRoundRect2(vec2 p, float hl, float hw, float cr) {
  vec2 q = abs(p) - vec2(hl - cr, hw - cr);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - cr;
}

float sdExtrudedRR(vec3 p, float hl, float hw, float cr, float zc, float hh) {
  vec2 q = abs(p.xy) - vec2(hl - cr, hw - cr);
  float d2 = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - cr;
  float dz = abs(p.z - zc) - hh;
  return length(max(vec2(d2, dz), 0.0)) + min(max(d2, dz), 0.0);
}

float edgeInset(float zg, float F, float edgeType) {
  if (F < 0.05 || edgeType < 0.5 || zg < 0.0) return 0.0;
  if (zg >= F) return 0.0;
  if (edgeType < 1.5) {
    float dz = F - zg;
    return F - sqrt(F * F - dz * dz);
  }
  return F - zg;
}

float draftRadial(float zg, float draftTan, float F) {
  if (abs(draftTan) < 1e-6) return 0.0;
  if (F < 0.05 || zg >= F) return zg * draftTan;
  return F * draftTan * sin((zg / F) * 1.5707963);
}

float profileRadial(float zg, float F, float edgeType, float draftTan) {
  return draftRadial(zg, draftTan, F) - edgeInset(zg, F, edgeType);
}

// Open-topped outer shell (sides + bottom cap only — no lid plate across the opening).
float outerBox(vec3 p) {
  float H = uHalfLWH.z;
  float z = clamp(p.z, 0.0, H);
  float dr = profileRadial(z, uEdgeSize, uEdgeType, uDraftTan);
  float hl = uHalfLWH.x + dr;
  float hw = uHalfLWH.y + dr;
  float cr = max(0.1, uCornerR + dr);
  float d2 = sdRoundRect2(p.xy, hl, hw, cr);
  if (p.z > H) return max(d2, p.z - H);
  return max(d2, -p.z);
}

float cavity(vec3 p) {
  float dr = profileRadial(p.z, uInnerEdgeSize, uEdgeType, uDraftTan);
  return sdExtrudedRR(
    p,
    uInnerHalfL + dr, uInnerHalfW + dr, max(0.1, uInnerR + dr),
    uCavityCenterZ, uCavityHalfH + 0.5
  );
}

float bodyShell(vec3 p) {
  return max(outerBox(p), -cavity(p));
}

float flange(vec3 p) {
  if (uFlangeW < 0.05) return 1e6;
  float H = uHalfLWH.z;
  float dF = sdExtrudedRR(p, uTopHalfL, uTopHalfW, uTopR, H + uFlangeT * 0.5, uFlangeT * 0.5);
  return max(dF, -cavity(p));
}

float lid(vec3 p) {
  if (uIncludeLid < 0.5) return 1e6;
  float H = uHalfLWH.z;
  float plateZ = H + uLidGap;
  float dPlate = sdExtrudedRR(p, uTopHalfL, uTopHalfW, uTopR, plateZ + uPlateT * 0.5, uPlateT * 0.5);
  if (uLidLipH < 1.5) return dPlate;
  float lipZ = plateZ - uLidLipH * 0.5;
  float dO = sdExtrudedRR(p, uLipOL, uLipOW, uLipOR, lipZ, uLidLipH * 0.5);
  float dI = sdExtrudedRR(p, uLipIL, uLipIW, uLipIR, lipZ, uLidLipH * 0.5 + 1.0);
  return min(dPlate, max(dO, -dI));
}

float sceneDist(vec3 q) {
  return min(min(bodyShell(q), flange(q)), lid(q));
}

vec2 rayBox(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (bmin - ro) * inv;
  vec3 t1 = (bmax - ro) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  float tn = max(max(tmin.x, tmin.y), tmin.z);
  float tf = min(min(tmax.x, tmax.y), tmax.z);
  return vec2(tn, tf);
}

vec3 worldRayDir(vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * uResolution) / uResolution.y;
  vec4 nearClip = vec4(uv, -1.0, 1.0);
  vec4 farClip = vec4(uv, 1.0, 1.0);
  vec4 nearView = uInvProjection * nearClip;
  vec4 farView = uInvProjection * farClip;
  nearView /= nearView.w;
  farView /= farView.w;
  vec3 dir = farView.xyz - nearView.xyz;
  return normalize((uInvView * vec4(dir, 0.0)).xyz);
}

float hash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

float surfField(vec3 p, float s) {
  float u = s / uSPitch;
  float v = p.z / max(uZPitch, 0.1);
  if (uSurfType < 1.5) {
    return uRibVert < 0.5
      ? 0.5 - 0.5 * cos(2.0 * PI * u)
      : 0.5 - 0.5 * cos(2.0 * PI * v);
  }
  if (uSurfType < 3.5) return 0.5 + 0.5 * hash(p / uPitch);
  return 0.0;
}

float ribShade(vec3 q, vec3 n) {
  if (uAmp < 0.001 || uSurfType < 0.5) return 0.0;
  float H = uHalfLWH.z;
  float band = smoothstep(0.0, uTaperBand, q.z) * (1.0 - smoothstep(H - uTaperBand, H, q.z));
  if (band <= 0.0) return 0.0;
  float s = atan(q.y, q.x);
  float raw = surfField(q, s * uHalfLWH.x * 2.0);
  float w = 0.46 * (1.0 - uSharpness) + 0.03;
  float c = smoothstep(0.5 - w, 0.5 + w, raw);
  return uAmp * c * band * max(dot(n, normalize(vec3(q.xy, 0.0))), 0.0);
}

vec3 calcNormal(vec3 q) {
  const float e = 0.2;
  const vec2 h = vec2(1.0, -1.0) * e;
  return normalize(
    h.xyy * sceneDist(q + h.xyy) +
    h.yyx * sceneDist(q + h.yyx) +
    h.yxy * sceneDist(q + h.yxy) +
    h.xxx * sceneDist(q + h.xxx)
  );
}

bool marchSurface(vec3 roW, vec3 rdW, float tStart, float tEnd, inout float tHit) {
  float t = tStart;
  for (int i = 0; i < 384; i++) {
    if (t > tEnd) return false;
    vec3 q = toSdf(roW + rdW * t);
    float d = sceneDist(q);
    if (d < 0.006) {
      for (int j = 0; j < 6; j++) {
        t += d;
        q = toSdf(roW + rdW * t);
        d = sceneDist(q);
      }
      tHit = t;
      return true;
    }
    t += max(d * 0.42, 0.003);
  }
  return false;
}

bool crossedCavity(vec3 roW, vec3 rdW, float tStart, float tEnd) {
  float t = tStart;
  for (int i = 0; i < 96; i++) {
    if (t >= tEnd) break;
    if (cavity(toSdf(roW + rdW * t)) < 0.0) return true;
    t += 2.5;
  }
  return false;
}

void main() {
  vec3 roW = uCamPos;
  vec3 rdW = worldRayDir(gl_FragCoord.xy);

  vec3 bmin = vec3(-uExtent, 0.0, -uExtent);
  vec3 bmax = vec3(uExtent, uSceneDepth, uExtent);
  vec2 tb = rayBox(roW, rdW, bmin, bmax);
  if (tb.x > tb.y || tb.y < 0.0) discard;

  float tHit = 0.0;
  float tMarch = max(tb.x, 0.0) + 0.01;
  if (!marchSurface(roW, rdW, tMarch, tb.y, tHit)) discard;

  vec3 hitQ = toSdf(roW + rdW * tHit);

  // Looking through the top opening: skip the floor so the void reads as empty space.
  bool lookDown = rdW.y < -0.15;
  if (lookDown && hitQ.z < uFloorT + 1.5 && cavity(hitQ) < 0.5) {
    float t2 = tHit + 0.06;
    if (!marchSurface(roW, rdW, t2, tb.y, tHit)) discard;
    hitQ = toSdf(roW + rdW * tHit);
  }

  bool sawVoid = crossedCavity(roW, rdW, tMarch, tHit);
  vec3 n = calcNormal(hitQ);
  vec3 viewDir = normalize(toSdf(roW) - hitQ);
  vec3 lightDir = normalize(vec3(0.4, 0.5, 0.85));

  float diff = max(dot(n, lightDir), 0.0);
  float spec = pow(max(dot(n, normalize(lightDir + viewDir)), 0.0), 64.0);
  float ribs = ribShade(hitQ, n);
  vec3 base = vec3(0.72, 0.74, 0.78) + vec3(0.08) * ribs;
  vec3 col = base * (0.18 + 0.82 * diff) + vec3(0.3) * spec;
  float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
  col += vec3(0.12, 0.16, 0.22) * rim;

  if (cavity(hitQ) < 0.0) col *= 0.48;
  if (sawVoid) col = mix(vec3(0.06, 0.07, 0.09), col, cavity(hitQ) < 0.0 ? 0.35 : 0.82);

  gl_FragColor = vec4(pow(col, vec3(0.92)), 1.0);
}
`;

export const SURFACING_TO_FLOAT: Record<string, number> = {
  smooth: 0,
  ribbing: 1,
  knurling: 2,
  noise: 3,
  hex: 4,
  cells: 5,
  waves: 6,
  weave: 7,
};

export const EDGE_TYPE_TO_FLOAT = { none: 0, fillet: 1, chamfer: 2 } as const;
