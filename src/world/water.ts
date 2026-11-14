// The lake: turquoise that deepens toward the centre, a soft mirrored reflection, sun or moon glitter,
// and a pale foam line at the shore. Shading from shade() in reference/scene/shots.py.
import { Color, type BufferGeometry, type ShaderMaterial } from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { U, WORLD_GLSL, type Env } from "./lighting";

const water = {
  uDeep: { value: new Color() }, uShallow: { value: new Color() }, uReflTint: { value: new Color() }, uFoam: { value: new Color() },
  uWaterLight: { value: 1 }, uReflMax: { value: 0.5 }, uSpecP: { value: 260 }, uSpecS: { value: 7 }, uRefl: { value: 1 }, uFovK: { value: 1 },
};

const shader = {
  name: "LakeShader",
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null } },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorldPos;
    void main() {
      vUv = textureMatrix * vec4( position, 1.0 );
      vWorldPos = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`,
  fragmentShader: /* glsl */ `
    #include <common>
    ${WORLD_GLSL}
    uniform sampler2D tDiffuse;
    uniform vec3 uDeep, uShallow, uReflTint, uFoam;
    uniform float uWaterLight, uReflMax, uSpecP, uSpecS, uRefl, uFovK;
    varying vec4 vUv;
    varying vec3 vWorldPos;
    float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
    float vnoise( vec2 p ) {
      vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
      return mix( mix( hash( i ), hash( i + vec2( 1, 0 ) ), f.x ), mix( hash( i + vec2( 0, 1 ) ), hash( i + vec2( 1, 1 ) ), f.x ), f.y );
    }
    float fbm2( vec2 p ) { return ( vnoise( p ) * 0.5 + vnoise( p * 2.03 + 17.0 ) * 0.25 ) / 0.75; }
    float lakeR( float th ) { return 1.0 + 0.10 * sin( 2.0 * th + 0.6 ) + 0.06 * sin( 3.0 * th + 2.1 ) + 0.035 * sin( 5.0 * th + 4.0 ); }
    void main() {
      vec3 P = vWorldPos / WORLD_S;
      float t = length( P.xz ) / lakeR( atan( -P.z, P.x ) );   // ring value; the scripts' z is mirrored
      vec3 wc = mix( uDeep, uShallow, pow( sm( 0.5, 1.0, t ), 1.6 ) ) * uWaterLight;
      vec3 v = vWorldPos - cameraPosition;
      float dist = length( v );
      vec3 dir = v / dist;
      float k = clamp( 0.03 + 0.97 * pow( 1.0 - clamp( -dir.y, 0.0, 1.0 ), 3.2 ), 0.0, uReflMax );
      float n1 = fbm2( P.xz * 30.0 ) - 0.5, n2 = fbm2( P.xz * 11.0 + vec2( 9.0, 0.0 ) ) - 0.5;
      // Reflection, wobbled by the same noise; the shift shrinks with distance as in the scripts.
      float amp = min( 0.003 * uFovK / max( dist / WORLD_S, 0.05 ), 1.0 / 260.0 );
      vec3 rf = uRefl > 0.5
        ? texture2D( tDiffuse, vUv.xy / vUv.w + vec2( n1 * 1.6, n2 * 2.4 ) * amp ).rgb
        : skyColor( reflect( dir, vec3( 0.0, 1.0, 0.0 ) ) );
      vec3 cw = mix( wc, rf * uReflTint, k );
      vec3 nw = normalize( vec3( n1 * 0.22 + n2 * 0.10, 1.0, n2 * 0.22 - n1 * 0.08 ) );
      cw += uSunCol * pow( clamp( dot( reflect( dir, nw ), uSunDir ), 0.0, 1.0 ), uSpecP ) * uSpecS;
      cw = mix( cw, uFoam, sm( 0.972, 0.997, t ) * 0.38 );
      gl_FragColor = vec4( worldFog( cw, vWorldPos ), 1.0 );
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

/** Water mesh from faces-up geometry. Reflection renders the scene mirrored at reduced size. */
export function createWater(geometry: BufferGeometry) {
  geometry.rotateX(Math.PI / 2); // Reflector wants its plane in local XY, facing +z
  const mesh = new Reflector(geometry, { shader, multisample: 0, clipBias: 0.002 });
  mesh.rotation.x = -Math.PI / 2;
  Object.assign((mesh.material as ShaderMaterial).uniforms, U, water);
  const reflect = mesh.onBeforeRender;
  return {
    mesh,
    apply(env: Env) {
      water.uDeep.value.setRGB(...env.waterDeep); water.uShallow.value.setRGB(...env.waterShallow);
      water.uReflTint.value.setRGB(...env.reflTint);
      const f = (i: 0 | 1 | 2) => (env.ambSky[i] + env.sunLight[i] * 0.25) * 0.95;
      water.uFoam.value.setRGB(f(0), f(1), f(2));
      water.uWaterLight.value = env.waterLight; water.uReflMax.value = env.reflMax;
      water.uSpecP.value = env.specP; water.uSpecS.value = env.specS;
    },
    /** Low tier: sky colour only, and no mirror pass. */
    setReflection(on: boolean) {
      water.uRefl.value = on ? 1 : 0;
      mesh.onBeforeRender = on ? reflect : () => {};
    },
    /** Mirror texture at half the drawing-buffer size. fovDeg sets how far the wobble reaches. */
    setSize(w: number, h: number, fovDeg: number) {
      mesh.getRenderTarget().setSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
      water.uFovK.value = 1 / Math.tan((fovDeg * Math.PI) / 360);
    },
  };
}
