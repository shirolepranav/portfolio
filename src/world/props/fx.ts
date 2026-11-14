// Small light effects for the prop reactions: a soft glow (camera flash), a light beam (the lookout) and rising
// sparks (the campfire). All additive and drawn in shaders, with no image textures. Each is hidden while idle.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, ConeGeometry, DoubleSide, Mesh, PlaneGeometry, Points, ShaderMaterial, type Camera,
} from "three";
import { makeRng } from "../core";

// Additive colour goes through the same tone curve as the world, so it sits in the scene's light.
const tone = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

/** A round soft glow that always faces the camera. amount 0 hides it. Size in metres. */
export function createGlow(color: [number, number, number], size: number) {
  const u = { uCol: { value: new Color(...color) }, uAmt: { value: 0 } };
  const mesh = new Mesh(new PlaneGeometry(size, size), new ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: true,
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }",
    fragmentShader: /* glsl */ `
      #include <common>
      uniform vec3 uCol; uniform float uAmt; varying vec2 vUv;
      void main() {
        float r = length( vUv * 2.0 - 1.0 );
        gl_FragColor = vec4( uCol * uAmt * ( exp( -r * r * 9.0 ) * 2.5 + exp( -r * 3.0 ) * 0.4 ) * ( 1.0 - smoothstep( 0.8, 1.0, r ) ), 1.0 );
        ${tone}
      }`,
  }));
  mesh.visible = false;
  mesh.renderOrder = 2;
  mesh.onBeforeRender = (_r, _s, cam: Camera) => { mesh.quaternion.copy(cam.quaternion); mesh.updateMatrixWorld(); };
  return {
    mesh,
    set(amount: number) { u.uAmt.value = amount; mesh.visible = amount > 0.002; },
  };
}

/** A soft cone of light pointing along +x from its tip, `length` metres long. Turn the mesh to aim it. */
export function createBeam(length: number, radius: number, color: [number, number, number]) {
  const g = new ConeGeometry(radius, length, 18, 1, true).translate(0, -length / 2, 0).rotateZ(Math.PI / 2); // tip at the origin
  const u = { uCol: { value: new Color(...color) }, uAmt: { value: 0 }, uLen: { value: length } };
  const mesh = new Mesh(g, new ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
    vertexShader: /* glsl */ `
      varying float vAlong; varying vec3 vN, vV;
      uniform float uLen;
      void main() {
        vAlong = position.x / uLen;
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        vN = normalize( normalMatrix * normal ); vV = normalize( -mv.xyz );
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      uniform vec3 uCol; uniform float uAmt; varying float vAlong; varying vec3 vN, vV;
      void main() {
        float edge = pow( abs( dot( vN, vV ) ), 1.5 );   // brighter through the middle of the cone
        float fade = pow( 1.0 - clamp( vAlong, 0.0, 1.0 ), 1.6 );
        gl_FragColor = vec4( uCol * uAmt * edge * fade * 0.9, 1.0 );
        ${tone}
      }`,
  }));
  mesh.visible = false;
  mesh.renderOrder = 2;
  return {
    mesh,
    set(amount: number) { u.uAmt.value = amount; mesh.visible = amount > 0.002; },
  };
}

/** Sparks rising from a point: `count` embers, each living about a second. Call update with the spawn strength. */
export function createSparks(count: number, height: number, spread: number) {
  const rng = makeRng(11);
  const seed = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) seed[i] = rng.next();
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute("seed", new BufferAttribute(seed, 3));
  const u = { uT: { value: 0 }, uAmt: { value: 0 }, uH: { value: height }, uSpread: { value: spread }, uPx: { value: 1 } };
  const mat = new ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec3 seed;
      uniform float uT, uAmt, uH, uSpread, uPx;
      varying float vA;
      void main() {
        float life = 0.8 + 0.6 * seed.z, age = mod( uT + seed.x * life, life ) / life;   // 0 to 1 over each ember's life
        float a = seed.y * 6.2832;
        vec3 p = vec3( cos( a ) * uSpread * ( 0.3 + age ), uH * age * ( 0.6 + 0.4 * seed.z ), sin( a ) * uSpread * ( 0.3 + age ) );
        p.x += sin( uT * 3.0 + seed.y * 20.0 ) * uSpread * 0.5 * age;   // wavering in the heat
        vA = uAmt * ( 1.0 - age ) * smoothstep( 0.0, 0.1, age );
        vec4 mv = modelViewMatrix * vec4( p, 1.0 );
        gl_PointSize = uPx * ( 2.0 + 3.0 * seed.z ) * 120.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      varying float vA;
      void main() {
        float r = length( gl_PointCoord - 0.5 ) * 2.0;
        gl_FragColor = vec4( vec3( 3.0, 1.4, 0.45 ) * vA * exp( -r * r * 4.0 ), 1.0 );
        ${tone}
      }`,
  });
  const points = new Points(g, mat);
  points.frustumCulled = false; // positions are made in the shader
  points.visible = false;
  points.renderOrder = 2;
  return {
    points,
    /** t in seconds; amount 0 to 1 (0 hides them). px scales the ember size with the drawing buffer. */
    update(t: number, amount: number, px = 1) { u.uT.value = t; u.uAmt.value = amount; u.uPx.value = px; points.visible = amount > 0.002; },
  };
}
