// Day and night sky: gradient, sun or crescent moon, Milky Way, and a star field.
// In the orbit views the sky is a soft screen-space backdrop instead, as in the scripts' diorama shot.
import { AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Mesh, Points, ShaderMaterial, SphereGeometry, Vector2, Color, type Camera } from "three";
import type { Env } from "./lighting";
import { U, WORLD_GLSL } from "./lighting";
import { makeRng, norm, toWorld, type V3 } from "./core";

const MW_N = norm(toWorld([0.55, 0.35, -0.75], 1)); // pole of the Milky Way band
const R = 2400;                                      // dome radius in metres, inside the camera's far plane

export function createSky() {
  const sky = {
    uBackdrop: { value: 0 }, uNight: { value: 0 }, uRes: { value: new Vector2(1, 1) },
    uDisc: { value: new Color() }, uSunR: { value: 0.03 },
    uBgTop: { value: new Color() }, uBgMid: { value: new Color() }, uBgBot: { value: new Color() },
  };
  const domeMat = new ShaderMaterial({
    uniforms: { ...U, ...sky },
    side: BackSide, depthWrite: false, depthTest: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vec4 wp = modelMatrix * vec4( position, 1.0 );
        vDir = wp.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      ${WORLD_GLSL}
      uniform float uBackdrop, uNight, uSunR;
      uniform vec2 uRes;
      uniform vec3 uDisc, uBgTop, uBgMid, uBgBot;
      varying vec3 vDir;
      float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
      float vnoise( vec2 p ) {
        vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
        return mix( mix( hash( i ), hash( i + vec2( 1, 0 ) ), f.x ), mix( hash( i + vec2( 0, 1 ) ), hash( i + vec2( 1, 1 ) ), f.x ), f.y );
      }
      void main() {
        vec3 d = normalize( vDir ), c;
        if ( uBackdrop > 0.5 ) {
          float yy = 1.0 - gl_FragCoord.y / uRes.y;   // 0 at the top of the screen
          c = mix( mix( uBgTop, uBgMid, sm( 0.0, 0.55, yy ) ), uBgBot, sm( 0.5, 1.0, yy ) );
        } else {
          c = skyColor( d );
          float ang = acos( clamp( dot( d, uSunDir ), -1.0, 1.0 ) );
          float m = sm( uSunR * 1.06, uSunR * 0.94, ang );
          if ( uNight > 0.5 ) {   // crescent moon: cut a second disc out of the first
            vec3 off = normalize( uSunDir + vec3( 0.012, 0.010, -0.004 ) );
            m *= 1.0 - sm( uSunR * 0.98, uSunR * 0.86, acos( clamp( dot( d, off ), -1.0, 1.0 ) ) );
            float band = exp( -pow( dot( d, ${vec(MW_N)} ), 2.0 ) / 0.03 );
            float n = 0.5 * vnoise( d.xz * 5.0 + d.y * 3.0 ) + 0.25 * vnoise( d.xz * 10.0 ) + 0.25 * vnoise( d.xz * 20.0 );
            c += vec3( 0.05, 0.06, 0.105 ) * band * ( 0.35 + 0.65 * n ) * sm( 0.0, 0.25, d.y );
          }
          c += uDisc * m;
        }
        gl_FragColor = vec4( c, 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dome = new Mesh(new SphereGeometry(R, 32, 16), domeMat);
  dome.renderOrder = -2;

  // Stars: the first set follows the scripts (upper sky, denser along the Milky Way).
  // A second, larger set fills the whole sphere for the orbit views, where the scripts paint stars on the backdrop.
  const rng = makeRng(3), pos: number[] = [], mag: number[] = [], tint: number[] = [], layer: number[] = [];
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng.next())) * Math.cos(2 * Math.PI * rng.next());
  for (let i = 0; i < 60000; i++) {
    const d = norm([gauss(), gauss(), gauss()] as V3), sky1 = i < 9000;
    if (sky1) {
      d[1] = Math.abs(d[1]);
      const band = Math.exp(-((d[0] * MW_N[0] + d[1] * MW_N[1] + d[2] * MW_N[2]) ** 2) / 0.02);
      if (rng.next() > 0.3 + 0.7 * band) continue;
    }
    pos.push(d[0] * R * 0.98, d[1] * R * 0.98, d[2] * R * 0.98);
    mag.push(rng.next() ** 4.5);
    tint.push(1 - 0.25 * rng.next(), 0.92 + 0.08 * rng.next(), 0.85 + 0.15 * rng.next());
    layer.push(sky1 ? 0 : 1);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("mag", new BufferAttribute(new Float32Array(mag), 1));
  g.setAttribute("tint", new BufferAttribute(new Float32Array(tint), 3));
  g.setAttribute("layer", new BufferAttribute(new Float32Array(layer), 1));
  const starMat = new ShaderMaterial({
    uniforms: { uBackdrop: sky.uBackdrop, uPx: { value: 1 } },
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float mag, layer;
      attribute vec3 tint;
      uniform float uBackdrop, uPx;
      varying vec3 vCol;
      float sm( float a, float b, float x ) { float t = clamp( ( x - a ) / ( b - a ), 0.0, 1.0 ); return t * t * ( 3.0 - 2.0 * t ); }
      void main() {
        vec3 d = normalize( position );
        float b = ( 0.25 + 2.6 * mag ) * min( 1.0, 0.25 + abs( d.y ) * 2.5 );
        float show = uBackdrop > 0.5 ? 1.0 : ( 1.0 - layer ) * sm( -0.02, 0.10, d.y );
        vCol = tint * b * show * ( uBackdrop > 0.5 ? 2.2 : 1.6 );
        gl_PointSize = ( 1.6 + 3.2 * mag ) * uPx;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4( position, 1.0 );
        if ( show == 0.0 ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );   // off screen
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      varying vec3 vCol;
      void main() {
        float r = length( gl_PointCoord - 0.5 ) * 2.0;
        gl_FragColor = vec4( vCol * exp( -r * r * 3.5 ), 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const stars = new Points(g, starMat);
  stars.renderOrder = -1;
  // Both follow whichever camera is drawing, including the lake's mirror camera.
  for (const o of [dome, stars]) {
    o.frustumCulled = false;
    o.onBeforeRender = (_r, _s, cam: Camera) => { o.position.setFromMatrixPosition(cam.matrixWorld); o.updateMatrixWorld(); };
  }

  return {
    dome, stars,
    apply(env: Env, backdrop: boolean) {
      sky.uNight.value = env.night ? 1 : 0;
      sky.uBackdrop.value = backdrop ? 1 : 0;
      sky.uDisc.value.setRGB(...env.disc);
      sky.uSunR.value = env.sunR;
      // Backdrop colours: the scripts' gradient behind the floating island.
      const [top, mid, bot] = env.night
        ? [[0.01, 0.02, 0.052], [0.03, 0.066, 0.125], [0.055, 0.105, 0.165]]
        : [[0.14, 0.42, 0.6], [0.9, 0.78, 0.66], [1.0, 0.62, 0.48]];
      sky.uBgTop.value.setRGB(...(top as [number, number, number]));
      sky.uBgMid.value.setRGB(...(mid as [number, number, number]));
      sky.uBgBot.value.setRGB(...(bot as [number, number, number]));
      stars.visible = env.night;
    },
    /** Drawing-buffer size, for the backdrop and star size. */
    setSize(w: number, h: number) {
      sky.uRes.value.set(w, h);
      starMat.uniforms.uPx.value = h / 1100;
    },
  };
}

function vec(v: V3) { return `vec3( ${v.map((x) => x.toFixed(4)).join(", ")} )`; }
