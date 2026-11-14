// Day and night light sets, the shared sky and fog shader code, and the material most of the world uses.
// Values from env_day and env_night in reference/scene/shots.py.
import { Color, DirectionalLight, HemisphereLight, MeshLambertMaterial, PointLight, ShaderChunk, Vector2, Vector3, type Scene } from "three";
import { D2R, S, TIERS, type LightGroup, type Mode, type RGB, type Tier } from "./config";
import { toWorld } from "./core";
import type { PropLight } from "./props/index";

export interface Env {
  night: boolean; sun: Vector3; sunLight: RGB; ambSky: RGB; ambGround: RGB;
  skyHz: RGB; skyMid: RGB; skyZen: RGB; below: RGB; glow: [number, number]; sunCol: RGB; disc: RGB; sunR: number;
  fogD: number; fogH: number; fogMax: number; fogTint: number;
  waterShallow: RGB; waterDeep: RGB; waterLight: number; reflMax: number; reflTint: RGB; specP: number; specS: number;
  emis: number; exposure: number;
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
    specP: 260, specS: 7, emis: 0.1, exposure: 0.95,
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
    specP: 300, specS: 3, emis: 1.0, exposure: 1.35,
  };
}

export const makeEnv = (mode: Mode, az: number, el: number) => (mode === "night" ? envNight(az, el) : envDay(az, el));

// Uniforms shared by every world shader. Same objects everywhere, so one update reaches all materials.
export const U = {
  uSkyHz: { value: new Color() }, uSkyMid: { value: new Color() }, uSkyZen: { value: new Color() }, uSkyBelow: { value: new Color() },
  uSunDir: { value: new Vector3() }, uSunCol: { value: new Color() }, uGlow: { value: new Vector2() },
  uFogD: { value: 0 }, uFogH: { value: 0 }, uFogMax: { value: 0 }, uFogTint: { value: 0 }, uEmis: { value: 0 },
};

/** Sky colour by direction, and distance-plus-height fog tinted by the sky toward that direction. */
export const WORLD_GLSL = /* glsl */ `
#define WORLD_S ${S.toFixed(1)}
uniform vec3 uSkyHz, uSkyMid, uSkyZen, uSkyBelow, uSunDir, uSunCol;
uniform vec2 uGlow;
uniform float uFogD, uFogH, uFogMax, uFogTint;
float sm( float a, float b, float x ) { float t = clamp( ( x - a ) / ( b - a ), 0.0, 1.0 ); return t * t * ( 3.0 - 2.0 * t ); }
vec3 skyColor( vec3 d ) {
  float t = clamp( asin( clamp( d.y, -1.0, 1.0 ) ) / ( PI * 0.5 ), -0.4, 1.0 );
  vec3 c = mix( uSkyHz, uSkyMid, sm( 0.0, 0.17, t ) );
  c = mix( c, uSkyZen, sm( 0.10, 0.62, t ) );
  c = mix( c, uSkyBelow, sm( 0.0, -0.22, t ) );
  float ang = acos( clamp( dot( d, uSunDir ), -1.0, 1.0 ) );
  return c + uSunCol * ( uGlow.x * exp( -ang / 0.085 ) + uGlow.y * exp( -ang / 0.38 ) );
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

/**
 * Flat-shaded Lambert with vertex colours (smooth-shaded for the hiker and animals), plus: per-vertex emissive and snow wrap lighting (the "fx"
 * attribute), and the scripts' HDR fog applied before tone mapping instead of three's fog after it.
 */
export function worldMaterial(smooth = false) {
  const m = new MeshLambertMaterial({ vertexColors: true, flatShading: !smooth });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = swap(sh.vertexShader, "#include <common>", "#include <common>\nattribute vec2 fx;\nvarying vec2 vFx;\nvarying vec3 vWorldPos;");
    sh.vertexShader = swap(sh.vertexShader, "#include <fog_vertex>", /* glsl */ `
      vFx = fx;
      vec4 wp = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        wp = instanceMatrix * wp;
      #endif
      vWorldPos = ( modelMatrix * wp ).xyz;`);
    let f = swap(sh.fragmentShader, "#include <common>", "#include <common>\nvarying vec2 vFx;\nvarying vec3 vWorldPos;\nuniform float uEmis;\n" + WORLD_GLSL);
    f = swap(f, "#include <lights_lambert_pars_fragment>", swap(ShaderChunk.lights_lambert_pars_fragment,
      "float dotNL = saturate( dot( geometryNormal, directLight.direction ) );",
      "float nl = dot( geometryNormal, directLight.direction );\n\tfloat dotNL = mix( saturate( nl ), pow2( saturate( nl * 0.5 + 0.5 ) ), 0.4 * vFx.y );"));
    f = swap(f, "#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vFx.x * uEmis;");
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
  const lamps = points.map(({ p, color, strength, radius, group }) => {
    const a = radius * 0.28 * S;
    const l = new PointLight(new Color(...color), 1.1 * Math.PI * strength * a, radius * 1.8 * S, 1);
    l.position.set(...toWorld(p));
    scene.add(l);
    return { l, group };
  });
  let night = false, groups: readonly LightGroup[] = [];
  const show = () => lamps.forEach(({ l, group }) => (l.visible = night && groups.includes(group)));
  return {
    sun,
    apply(env: Env) {
      sun.color.setRGB(...env.sunLight);
      sun.position.copy(env.sun).multiplyScalar(4 * S);
      hemi.color.setRGB(...env.ambSky);
      hemi.groundColor.setRGB(...env.ambGround);
      U.uSkyHz.value.setRGB(...env.skyHz); U.uSkyMid.value.setRGB(...env.skyMid); U.uSkyZen.value.setRGB(...env.skyZen);
      U.uSkyBelow.value.setRGB(...env.below); U.uSunDir.value.copy(env.sun); U.uSunCol.value.setRGB(...env.sunCol);
      U.uGlow.value.set(...env.glow);
      U.uFogD.value = env.fogD; U.uFogH.value = env.fogH; U.uFogMax.value = env.fogMax; U.uFogTint.value = env.fogTint;
      U.uEmis.value = env.emis;
      night = env.night; show();
    },
    setTier(tier: Tier) { groups = TIERS[tier].lights; sun.castShadow = TIERS[tier].shadows; show(); },
  };
}
