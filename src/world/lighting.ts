// Day and night light sets, the shared sky and fog shader code, and the material most of the world uses.
// Values from env_day and env_night in reference/scene/shots.py.
import { Color, DirectionalLight, HemisphereLight, MeshLambertMaterial, PointLight, ShaderChunk, Vector2, Vector3, type Scene } from "three";
import { D2R, S, TIERS, type LightGroup, type Mode, type RGB, type Tier } from "./config";
import { lerp, smooth, toWorld } from "./core";
import type { PropLight } from "./props/index";

export interface Env {
  night: boolean; sun: Vector3; sunLight: RGB; ambSky: RGB; ambGround: RGB;
  skyHz: RGB; skyMid: RGB; skyZen: RGB; below: RGB; glow: [number, number]; sunCol: RGB; disc: RGB; sunR: number;
  fogD: number; fogH: number; fogMax: number; fogTint: number;
  waterShallow: RGB; waterDeep: RGB; waterLight: number; reflMax: number; reflTint: RGB; specP: number; specS: number;
  emis: number; exposure: number;
  n: number;      // how far toward night: 0 day, 1 night. Drives the lights coming on round the loop
  stars: number;  // star and Milky Way strength, 0 to 1
  lightDir?: Vector3; // where the key light comes from, when not the disc itself (a sun just below the ridge)
}

const k3 = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/** Unit direction toward the sun or moon from azimuth and elevation in degrees (the scripts' dirv, mirrored). */
const sunDir = (az: number, el: number) =>
  new Vector3(...toWorld([Math.cos(el * D2R) * Math.cos(az * D2R), Math.sin(el * D2R), Math.cos(el * D2R) * Math.sin(az * D2R)], 1));

export function envDay(az: number, el = 15): Env {
  return {
    night: false, sun: sunDir(az, el), sunLight: k3([1.0, 0.78, 0.55], 3.6),
    ambSky: k3([0.34, 0.47, 0.7], 0.72), ambGround: k3([0.6, 0.42, 0.4], 0.42),
    skyHz: k3([1.0, 0.68, 0.48], 1.15), skyMid: [0.34, 0.62, 0.72], skyZen: [0.09, 0.31, 0.55], below: [0.84, 0.62, 0.56],
    glow: [1.4, 0.16], sunCol: [1.0, 0.74, 0.46], disc: k3([1.0, 0.95, 0.82], 40), sunR: 0.03,
    fogD: 0.11, fogH: 1.2, fogMax: 0.72, fogTint: 0.82,
    waterShallow: [0.2, 0.82, 0.78], waterDeep: [0.015, 0.4, 0.52], waterLight: 1.2, reflMax: 0.5, reflTint: [0.62, 0.96, 0.94],
    specP: 260, specS: 7, emis: 1.0, exposure: 0.95, n: 0, stars: 0,
  };
}

export function envNight(az: number, el = 38): Env {
  return {
    night: true, sun: sunDir(az, el), sunLight: k3([0.42, 0.56, 0.95], 0.62),
    ambSky: k3([0.1, 0.17, 0.32], 0.6), ambGround: k3([0.05, 0.07, 0.12], 0.4),
    skyHz: [0.06, 0.135, 0.22], skyMid: [0.03, 0.065, 0.14], skyZen: [0.01, 0.02, 0.055], below: [0.03, 0.06, 0.1],
    glow: [0.2, 0.05], sunCol: [0.6, 0.72, 1.0], disc: k3([1.0, 0.97, 0.9], 9), sunR: 0.026,
    fogD: 0.15, fogH: 0.9, fogMax: 0.85, fogTint: 0.78,
    waterShallow: [0.1, 0.44, 0.47], waterDeep: [0.008, 0.1, 0.16], waterLight: 0.55, reflMax: 0.86, reflTint: [0.85, 1.0, 1.0],
    specP: 300, specS: 3, emis: 1.0, exposure: 1.35, n: 1, stars: 1,
  };
}

/** How strongly glowing parts glow by day, before the lamps come on. */
const EMIS_DAY = 0.1;

export const makeEnv = (mode: Mode, az: number, el: number) => (mode === "night" ? envNight(az, el) : envDay(az, el));

const mix3 = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const Y = new Vector3(0, 1, 0);

/**
 * The day-to-night sweep: the light set n of the way from day (0) to night (1). Played backwards, night to day.
 * First half: the sun sinks along a short arc (drifting 15 degrees sideways) until it drops below the ridge,
 * warming and dimming. Second half: the crescent moon fades in at its own spot. The sky sweeps to navy from the
 * top down, stars fade in, and the lamps come on later (see LIT_GLSL). Reduced motion: a plain cross-fade.
 */
export function sweepEnv(day: Env, night: Env, n: number, reduced = false): Env {
  if (n <= 0) return day;
  if (n >= 1) return night;
  const k = reduced ? n : smooth(0.1, 0.85, n); // ambient, fog, water and exposure
  const out: Env = { ...night, n, night: n >= 0.5, stars: reduced ? n : smooth(0.4, 0.9, n) };
  for (const key of ["fogD", "fogH", "fogMax", "fogTint", "waterLight", "reflMax", "specP", "specS", "exposure", "sunR"] as const) out[key] = lerp(day[key], night[key], k);
  for (const key of ["ambSky", "ambGround", "below", "waterShallow", "waterDeep", "reflTint"] as const) out[key] = mix3(day[key], night[key], k);
  // The sky goes navy from the top down; the horizon glows warmer for a moment as the sun goes.
  const glowK = reduced ? 0 : Math.sin(Math.PI * smooth(0.1, 0.6, n)) * 0.35;
  out.skyZen = mix3(day.skyZen, night.skyZen, reduced ? n : smooth(0.05, 0.6, n));
  out.skyMid = mix3(day.skyMid, night.skyMid, reduced ? n : smooth(0.15, 0.75, n));
  out.skyHz = mix3(mix3(day.skyHz, [day.skyHz[0] * 1.15, day.skyHz[1] * 0.8, day.skyHz[2] * 0.6], glowK), night.skyHz, reduced ? n : smooth(0.25, 0.85, n));

  if (reduced) {
    // Cross-fade: no motion, the sun fades out and the moon fades in where they stand.
    out.sun = day.sun.clone().lerp(night.sun, n).normalize();
    const sunK = Math.max(0, 1 - 2 * n), moonK = Math.max(0, 2 * n - 1);
    out.disc = n < 0.5 ? mix3([0, 0, 0], day.disc, sunK) : mix3([0, 0, 0], night.disc, moonK);
    out.sunCol = n < 0.5 ? day.sunCol : night.sunCol;
    out.glow = n < 0.5 ? [day.glow[0] * sunK, day.glow[1] * sunK] : [night.glow[0] * moonK, night.glow[1] * moonK];
    out.sunLight = mix3(day.sunLight, night.sunLight, n);
    return out;
  }
  if (n < 0.5) {
    // The sun sinks to 6 degrees below the horizon, faster at the end, and slides 15 degrees sideways.
    const s = smooth(0, 0.5, n), el0 = Math.asin(day.sun.y), el = lerp(el0, -6 * D2R, s * s * (2 - s));
    const h = new Vector3(day.sun.x, 0, day.sun.z).normalize().applyAxisAngle(Y, -15 * D2R * s);
    const up = smooth(-2 * D2R, 3 * D2R, el); // 0 once it is below the ridge line
    out.sun = h.clone().multiplyScalar(Math.cos(el)).setY(Math.sin(el));
    out.disc = mix3([0, 0, 0], day.disc, up);
    out.sunCol = mix3(day.sunCol, [1.0, 0.55, 0.3], s);
    out.glow = [day.glow[0] * (0.3 + 0.7 * up), day.glow[1] * (0.4 + 0.6 * up)];
    // The light keeps a low angle (never from below) and fades out as the sun goes, warming as it does.
    const dim = smooth(-3 * D2R, 12 * D2R, el);
    out.sunLight = [day.sunLight[0] * dim, day.sunLight[1] * dim * (1 - 0.15 * s), day.sunLight[2] * dim * (1 - 0.3 * s)];
    out.lightDir = h.clone().multiplyScalar(Math.cos(Math.max(el, 2 * D2R))).setY(Math.sin(Math.max(el, 2 * D2R)));
  } else {
    // The moon fades in at its own spot.
    const m = smooth(0.55, 0.9, n);
    out.disc = mix3([0, 0, 0], night.disc, m);
    out.glow = [night.glow[0] * m, night.glow[1] * m];
    out.sunLight = mix3([0, 0, 0], night.sunLight, smooth(0.5, 0.85, n));
  }
  return out;
}

// Uniforms shared by every world shader. Same objects everywhere, so one update reaches all materials.
export const U = {
  uSkyHz: { value: new Color() }, uSkyMid: { value: new Color() }, uSkyZen: { value: new Color() }, uSkyBelow: { value: new Color() },
  uSunDir: { value: new Vector3() }, uSunCol: { value: new Color() }, uGlow: { value: new Vector2() },
  uFogD: { value: 0 }, uFogH: { value: 0 }, uFogMax: { value: 0 }, uFogTint: { value: 0 }, uEmis: { value: 0 },
  uTime: { value: 0 },                         // seconds, for everything that moves on its own
  uLit: { value: new Vector3(0, 0, 0.4) },     // (n, angle the light-up starts from in degrees, spread round the loop)
};

/**
 * Lamps come on one after another round the loop in walking order, from where the hiker stands, late in the sweep.
 * o is a place on the loop, 0 to 1 from the start; spread 0 lights them all at once (reduced motion).
 */
export const lampOn = (n: number, o: number, spread: number) => {
  const a = spread ? 0.45 + spread * o : 0, w = spread ? 0.12 : 1;
  return smooth(a, a + w, n);
};
/** A world point's place on the loop (0 to 1, walking order) counted from `fromDeg`. */
export const loopOrder = (x: number, z: number, fromDeg: number) => {
  const deg = (Math.atan2(-z, x) * 180) / Math.PI; // the scripts' angle; world z is mirrored
  return ((((deg - fromDeg) / 360) % 1) + 1) % 1;
};

/** Sky colour by direction, and distance-plus-height fog tinted by the sky toward that direction. */
export const WORLD_GLSL = /* glsl */ `
#define WORLD_S ${S.toFixed(1)}
uniform vec3 uSkyHz, uSkyMid, uSkyZen, uSkyBelow, uSunDir, uSunCol;
uniform vec2 uGlow;
uniform float uFogD, uFogH, uFogMax, uFogTint, uTime;
uniform vec3 uLit;
float sm( float a, float b, float x ) { float t = clamp( ( x - a ) / ( b - a ), 0.0, 1.0 ); return t * t * ( 3.0 - 2.0 * t ); }
vec3 skyColor( vec3 d ) {
  float t = clamp( asin( clamp( d.y, -1.0, 1.0 ) ) / ( PI * 0.5 ), -0.4, 1.0 );
  vec3 c = mix( uSkyHz, uSkyMid, sm( 0.0, 0.17, t ) );
  c = mix( c, uSkyZen, sm( 0.10, 0.62, t ) );
  c = mix( c, uSkyBelow, sm( 0.0, -0.22, t ) );
  float ang = acos( clamp( dot( d, uSunDir ), -1.0, 1.0 ) );
  return c + uSunCol * ( uGlow.x * exp( -ang / 0.085 ) + uGlow.y * exp( -ang / 0.38 ) );
}
// lampOn() and loopOrder() above, for the emissive parts.
float lampOn( vec3 wp ) {
  float o = fract( ( degrees( atan( -wp.z, wp.x ) ) - uLit.y ) / 360.0 );
  float a = uLit.z > 0.0 ? 0.45 + uLit.z * o : 0.0, w = uLit.z > 0.0 ? 0.12 : 1.0;
  return sm( a, a + w, uLit.x );
}
vec3 worldFog( vec3 col, vec3 wp ) {
  vec3 v = wp - cameraPosition;
  float dist = length( v ) / WORLD_S;
  vec3 fd = normalize( vec3( v.x, 0.035 * length( v ), v.z ) );
  float f = 1.0 - exp( -( dist * uFogD ) * exp( -max( wp.y / WORLD_S, 0.0 ) * uFogH ) );
  return mix( col, skyColor( fd ) * uFogTint, min( f, uFogMax ) );
}
`;

/** Replaces `a` with `b` in a shader, and fails loudly if a three.js update moved `a`. */
export function swap(src: string, a: string, b: string) {
  if (!src.includes(a)) throw new Error(`world shader patch: "${a}" not found`);
  return src.replace(a, b);
}

// The scripts' tone curve (Narkowicz ACES, gamma 2.2) and their colour grade from finish():
// lifted teal shadows, warm highlights, a little more saturation and contrast. Output is already gamma-encoded.
ShaderChunk.tonemapping_pars_fragment = swap(ShaderChunk.tonemapping_pars_fragment,
  "vec3 CustomToneMapping( vec3 color ) { return color; }", /* glsl */ `
vec3 CustomToneMapping( vec3 color ) {
  vec3 x = max( color * toneMappingExposure, 0.0 );
  vec3 g = pow( clamp( ( x * ( 2.51 * x + 0.03 ) ) / ( x * ( 2.43 * x + 0.59 ) + 0.14 ), 0.0, 1.0 ), vec3( 1.0 / 2.2 ) );
  float l = ( g.r + g.g + g.b ) / 3.0;
  g += pow( 1.0 - l, 3.0 ) * vec3( -0.004, 0.006, 0.014 ) + pow( l, 3.0 ) * vec3( 0.012, 0.004, -0.010 );
  l = ( g.r + g.g + g.b ) / 3.0;
  g = l + ( g - l ) * 1.14;
  return clamp( ( g - 0.5 ) * 1.08 + 0.5, 0.0, 1.0 );
}`);

export interface MaterialOptions {
  smooth?: boolean;  // smooth shading: the hiker and animals
  flicker?: boolean; // the glow wavers: lanterns and flames
  piece?: Vector2;   // a moving part's own glow: (how much it overrides the day and night glow, the glow it takes)
}

/**
 * Flat-shaded Lambert with vertex colours (smooth-shaded for the hiker and animals), plus: per-vertex emissive and snow wrap lighting (the "fx"
 * attribute), and the scripts' HDR fog applied before tone mapping instead of three's fog after it.
 * Glowing parts are dim by day and come on round the loop as night falls (lampOn).
 */
export function worldMaterial({ smooth = false, flicker = false, piece }: MaterialOptions = {}) {
  const m = new MeshLambertMaterial({ vertexColors: true, flatShading: !smooth });
  if (flicker) m.defines = { FLICKER: "" };
  const own = { uPiece: { value: piece ?? new Vector2() } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, own);
    sh.vertexShader = swap(sh.vertexShader, "#include <common>", "#include <common>\nattribute vec2 fx;\nvarying vec2 vFx;\nvarying vec3 vWorldPos;");
    sh.vertexShader = swap(sh.vertexShader, "#include <fog_vertex>", /* glsl */ `
      vFx = fx;
      vec4 wp = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        wp = instanceMatrix * wp;
      #endif
      vWorldPos = ( modelMatrix * wp ).xyz;`);
    let f = swap(sh.fragmentShader, "#include <common>", "#include <common>\nvarying vec2 vFx;\nvarying vec3 vWorldPos;\nuniform float uEmis;\nuniform vec2 uPiece;\n" + WORLD_GLSL);
    f = swap(f, "#include <lights_lambert_pars_fragment>", swap(ShaderChunk.lights_lambert_pars_fragment,
      "float dotNL = saturate( dot( geometryNormal, directLight.direction ) );",
      "float nl = dot( geometryNormal, directLight.direction );\n\tfloat dotNL = mix( saturate( nl ), pow2( saturate( nl * 0.5 + 0.5 ) ), 0.4 * vFx.y );"));
    f = swap(f, "#include <emissivemap_fragment>", /* glsl */ `#include <emissivemap_fragment>
      float glow = mix( ${EMIS_DAY.toFixed(2)}, uEmis, lampOn( vWorldPos ) );
      #ifdef FLICKER
        float ph = dot( floor( vWorldPos.xz * 2.0 ), vec2( 1.7, 9.2 ) );
        glow *= 0.84 + 0.1 * sin( uTime * 9.0 + ph ) + 0.06 * sin( uTime * 23.0 + ph * 2.3 );
      #endif
      glow = mix( glow, uPiece.y, uPiece.x );
      totalEmissiveRadiance += diffuseColor.rgb * vFx.x * glow;`);
    f = swap(f, "#include <opaque_fragment>", "outgoingLight = worldFog( outgoingLight, vWorldPos );\n#include <opaque_fragment>");
    sh.fragmentShader = f;
  };
  return m;
}

/** Sun or moon, sky and ground ambient, and the warm night point lights. */
export function createLights(scene: Scene, points: PropLight[]) {
  // three's Lambert divides by pi; the scripts do not. So every intensity carries a pi.
  const sun = new DirectionalLight(0xffffff, Math.PI);
  const hemi = new HemisphereLight(0xffffff, 0xffffff, Math.PI);
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera, half = 2.6 * S;
  sc.left = sc.bottom = -half; sc.right = sc.top = half; sc.near = 1; sc.far = 8 * S;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02 * S;
  scene.add(sun, sun.target, hemi);
  // The scripts' falloff is 1 / (1 + (d / a)^2), which never blows up near the lamp. A 1 / d falloff
  // matched at d = a stays close to it; the cutoff is shorter than the script's window
  // because three's window stays near full strength until its edge.
  const lamps = points.map(({ p, color, strength, radius, group }, i) => {
    const a = radius * 0.28 * S;
    const l = new PointLight(new Color(...color), 1.1 * Math.PI * strength * a, radius * 1.8 * S, 1);
    l.position.set(...toWorld(p));
    scene.add(l);
    return { l, group, full: l.intensity, phase: i * 2.399, flicker: group !== "stop" };
  });
  let n = 0, groups: readonly LightGroup[] = [];
  const boost = new Map<PointLight, number>();
  // Lamps are switched on (which changes the shader) only while it is not full day; their strength does the fading.
  const show = () => lamps.forEach(({ l, group }) => (l.visible = n > 0.001 && groups.includes(group)));
  return {
    sun,
    /** Every lamp, for prop reactions that brighten one (the fire's flare). */
    lamps: lamps.map((x) => x.l),
    /** Extra strength on a lamp for a moment: 1 is normal. */
    boost(l: PointLight, k: number) { boost.set(l, k); },
    /** Each frame: lamps come on round the loop as night falls; lanterns and the fire flicker. */
    tick(t: number) {
      const lit = U.uLit.value;
      for (const { l, full, phase, flicker } of lamps) {
        if (!l.visible) continue;
        const w = flicker ? 0.86 + 0.09 * Math.sin(t * 9 + phase) + 0.05 * Math.sin(t * 23 + phase * 2.3) : 1;
        l.intensity = full * w * (boost.get(l) ?? 1) * lampOn(lit.x, loopOrder(l.position.x, l.position.z, lit.y), lit.z);
      }
    },
    /** Starts the light-up from this angle (the hiker's place); spread 0 lights everything at once. */
    litFrom(deg: number, spread: number) { U.uLit.value.y = deg; U.uLit.value.z = spread; },
    /** Debug and shader warm-up: every lamp this tier has, switched on. Returns a function that switches back. */
    allOn() { const was = n; n = 1; show(); return () => { n = was; show(); }; },
    apply(env: Env) {
      sun.color.setRGB(...env.sunLight);
      sun.position.copy(env.lightDir ?? env.sun).multiplyScalar(4 * S);
      hemi.color.setRGB(...env.ambSky);
      hemi.groundColor.setRGB(...env.ambGround);
      U.uSkyHz.value.setRGB(...env.skyHz); U.uSkyMid.value.setRGB(...env.skyMid); U.uSkyZen.value.setRGB(...env.skyZen);
      U.uSkyBelow.value.setRGB(...env.below); U.uSunDir.value.copy(env.sun); U.uSunCol.value.setRGB(...env.sunCol);
      U.uGlow.value.set(...env.glow);
      U.uFogD.value = env.fogD; U.uFogH.value = env.fogH; U.uFogMax.value = env.fogMax; U.uFogTint.value = env.fogTint;
      U.uEmis.value = env.emis;
      U.uLit.value.x = env.n;
      if ((n > 0.001) !== (env.n > 0.001)) { n = env.n; show(); } else n = env.n;
    },
    setTier(tier: Tier) { groups = TIERS[tier].lights; sun.castShadow = TIERS[tier].shadows; show(); },
  };
}
