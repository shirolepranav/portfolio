// A soft blob shadow under a character, for the tiers without a shadow map (PLAN.md, Rendering approach).
import { Mesh, PlaneGeometry, ShaderMaterial } from "three";

/** An ellipse of soft dark on the ground: w across, d along, in metres. */
export function createBlobShadow(w: number, d: number) {
  const mesh = new Mesh(new PlaneGeometry(w * 2, d * 2).rotateX(-Math.PI / 2), new ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }",
    fragmentShader: "varying vec2 vUv; void main() { gl_FragColor = vec4( 0.0, 0.0, 0.0, 0.34 * ( 1.0 - smoothstep( 0.15, 1.0, length( vUv * 2.0 - 1.0 ) ) ) ); }",
  }));
  mesh.position.y = 0.03;
  return mesh;
}
