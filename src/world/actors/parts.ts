// Shared building blocks for the characters: smooth rounded parts (capsules, balls, rounded boxes), each tied
// rigidly to one bone, merged into one skinned mesh so a character costs one draw call.
import {
  Bone, CapsuleGeometry, Float32BufferAttribute, Matrix4, Quaternion, Skeleton, SkinnedMesh, SphereGeometry,
  Uint16BufferAttribute, Vector3, type BufferGeometry, type Material,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { RGB } from "../config";

export type P = [number, number, number];
const Y = new Vector3(0, 1, 0), m4 = new Matrix4(), q = new Quaternion();

/**
 * Part makers in a character's own units: every size and place is a multiple of `unit` metres.
 * Local axes: x right, y up, z forward.
 */
export function makeParts(unit: number) {
  /** One part in rest position: placed, turned to `dir`, scaled, coloured and tied to a bone. */
  function part(g: BufferGeometry, color: RGB, bone: number, at: P, dir: P = [0, 1, 0], scale: P = [1, 1, 1]) {
    q.setFromUnitVectors(Y, new Vector3(...dir).normalize());
    g.deleteAttribute("uv");
    const geo = (g.index ? g.toNonIndexed() : g).applyMatrix4(m4.compose(new Vector3(...at).multiplyScalar(unit), q, new Vector3(...scale).multiplyScalar(unit)));
    const n = geo.attributes.position.count, col = new Float32Array(n * 3), idx = new Uint16Array(n * 4), wt = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { col.set(color, i * 3); idx[i * 4] = bone; wt[i * 4] = 1; }
    geo.setAttribute("color", new Float32BufferAttribute(col, 3));
    geo.setAttribute("fx", new Float32BufferAttribute(new Float32Array(n * 2), 2)); // no glow, no snow wrap
    geo.setAttribute("skinIndex", new Uint16BufferAttribute(idx, 4));
    geo.setAttribute("skinWeight", new Float32BufferAttribute(wt, 4));
    return geo;
  }
  return {
    part,
    /** Capsule between two cap centres, radius r. squash scales its width (x) and depth. */
    capsule(a: P, b: P, r: number, color: RGB, bone: number, squash: [number, number] = [1, 1], segs = 10) {
      const d: P = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...d);
      return part(new CapsuleGeometry(r, Math.max(1e-4, len), 3, segs), color, bone, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], d, [squash[0], 1, squash[1]]);
    },
    /** Rounded box of the given size, centred at `at`. */
    rbox: (size: P, at: P, color: RGB, bone: number) =>
      part(new RoundedBoxGeometry(size[0], size[1], size[2], 2, Math.min(...size) * 0.3), color, bone, at),
    /** Ball of radius r, squashed per axis. */
    ball: (r: number, at: P, color: RGB, bone: number, squash: P = [1, 1, 1], segs: [number, number] = [14, 10]) =>
      part(new SphereGeometry(r, segs[0], segs[1]), color, bone, at, [0, 1, 0], squash),
  };
}

/**
 * Bones from [parent, rest position in units], and one skinned mesh from the parts.
 * The mesh is never frustum-culled: it is small, and the skinned bounds would lag the pose.
 */
export function rig(parts: BufferGeometry[], bones: [number, P][], unit: number, material: Material) {
  const list = bones.map(() => new Bone());
  bones.forEach(([parent, p], i) => {
    const base = parent < 0 ? [0, 0, 0] : bones[parent][1];
    list[i].position.set(p[0] - base[0], p[1] - base[1], p[2] - base[2]).multiplyScalar(unit);
    if (parent >= 0) list[parent].add(list[i]);
  });
  const mesh = new SkinnedMesh(mergeGeometries(parts), material);
  bones.forEach(([parent], i) => { if (parent < 0) mesh.add(list[i]); }); // every root bone hangs off the mesh
  mesh.updateMatrixWorld(true);
  mesh.bind(new Skeleton(list));
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  return { mesh, bones: list };
}
