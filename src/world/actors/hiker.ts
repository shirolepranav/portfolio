// The hiker: teal jacket, coral pack with a cream bedroll, gold toque with a pom-pom, two trekking poles.
// Proportions and colours from hiker() in reference/scene/scene.py, rebuilt from capsules, spheres and
// rounded boxes with smooth shading. One skinned mesh (one draw call); each part rides one bone rigidly.
import {
  Bone, CapsuleGeometry, CylinderGeometry, Float32BufferAttribute, Group, Matrix4, Quaternion, Skeleton, SkinnedMesh,
  SphereGeometry, Uint16BufferAttribute, Vector3, type BufferGeometry, type Material, type Object3D,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { C, S, type RGB } from "../config";
import { angdiff, scaleRGB, smooth } from "../core";
import { createBlobShadow } from "./shadow";

/** Where the hiker is and how it moves. Any replacement character only needs this interface. */
export interface HikerPose {
  position: Vector3;  // feet, in world metres
  yaw: number;        // direction of travel; the hiker turns toward it on its own
  speed: number;      // metres per second, never negative
}
export interface Hiker {
  object: Object3D;
  update(dt: number, pose: HikerPose): void;
  /** true: cast a real shadow (shadow map tier). false: a soft blob on the ground. */
  setShadow(map: boolean): void;
}

const H = 0.05 * S; // 1.75 m; every size below is a fraction of it
const PANTS: RGB = [0.17, 0.19, 0.25], BOOTS: RGB = [0.24, 0.16, 0.12], JACKET: RGB = [0.1, 0.3, 0.36];
const SKIN: RGB = [0.6, 0.42, 0.31], POLE: RGB = [0.78, 0.78, 0.82];

type P = [number, number, number];
// Bones as [parent, rest position]. Local axes: y up, z forward.
const BONES: [number, P][] = [
  [-1, [0, 0.5, 0]],          // 0 pelvis
  [0, [0.07, 0.5, 0]],        // 1 left thigh
  [1, [0.07, 0.28, 0.01]],    // 2 left shin
  [0, [-0.07, 0.5, 0]],       // 3 right thigh
  [3, [-0.07, 0.28, 0.01]],   // 4 right shin
  [0, [0, 0.5, 0]],           // 5 spine
  [5, [0, 0.65, -0.135]],     // 6 pack
  [5, [0, 0.84, 0]],          // 7 head
  [7, [0, 1.0, 0]],           // 8 pom-pom
  [5, [0.165, 0.79, 0]],      // 9 left arm
  [5, [-0.165, 0.79, 0]],     // 10 right arm
];

const Y = new Vector3(0, 1, 0), m4 = new Matrix4(), q = new Quaternion();

/** One part in rest position: the geometry is in units of H, then placed, coloured and tied to a bone. */
function part(g: BufferGeometry, color: RGB, bone: number, at: P, dir: P = [0, 1, 0], scale: P = [1, 1, 1]) {
  q.setFromUnitVectors(Y, new Vector3(...dir).normalize());
  g.deleteAttribute("uv");
  const geo = (g.index ? g.toNonIndexed() : g).applyMatrix4(m4.compose(new Vector3(...at).multiplyScalar(H), q, new Vector3(...scale).multiplyScalar(H)));
  const n = geo.attributes.position.count, col = new Float32Array(n * 3), idx = new Uint16Array(n * 4), wt = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { col.set(color, i * 3); idx[i * 4] = bone; wt[i * 4] = 1; }
  geo.setAttribute("color", new Float32BufferAttribute(col, 3));
  geo.setAttribute("fx", new Float32BufferAttribute(new Float32Array(n * 2), 2)); // no glow, no snow wrap
  geo.setAttribute("skinIndex", new Uint16BufferAttribute(idx, 4));
  geo.setAttribute("skinWeight", new Float32BufferAttribute(wt, 4));
  return geo;
}
/** Capsule between two cap centres. */
function capsule(a: P, b: P, r: number, color: RGB, bone: number) {
  const d: P = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...d);
  return part(new CapsuleGeometry(r, len, 3, 10), color, bone, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], d);
}
const rbox = (size: P, at: P, color: RGB, bone: number) =>
  part(new RoundedBoxGeometry(size[0], size[1], size[2], 2, Math.min(...size) * 0.3), color, bone, at);
const ball = (r: number, at: P, color: RGB, bone: number, squash: P = [1, 1, 1]) =>
  part(new SphereGeometry(r, 14, 10), color, bone, at, [0, 1, 0], squash);

export function createHiker(material: Material): Hiker {
  const parts: BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const thigh = s > 0 ? 1 : 3, arm = s > 0 ? 9 : 10;
    parts.push(
      capsule([0.07 * s, 0.5, 0], [0.07 * s, 0.29, 0.01], 0.058, PANTS, thigh),
      capsule([0.07 * s, 0.27, 0.01], [0.07 * s, 0.1, 0], 0.05, PANTS, thigh + 1),
      rbox([0.11, 0.08, 0.2], [0.07 * s, 0.045, 0.035], BOOTS, thigh + 1),
      capsule([0.165 * s, 0.79, 0], [0.19 * s, 0.53, 0], 0.042, JACKET, arm),
      ball(0.034, [0.19 * s, 0.5, 0.005], SKIN, arm),
      // The pole runs from just above the grip to the ground, a little ahead and outside the foot.
      part(new CylinderGeometry(0.008, 0.006, 1, 6), POLE, arm, [0.215 * s, 0.28, 0.04], [0.06 * s, -0.56, 0.08], [1, 0.57, 1]),
    );
  }
  parts.push(
    capsule([-0.07, 0.5, 0], [0.07, 0.5, 0], 0.065, PANTS, 0),
    rbox([0.27, 0.37, 0.16], [0, 0.64, 0], JACKET, 5),
    rbox([0.25, 0.36, 0.14], [0, 0.65, -0.135], C.coral, 6),
    rbox([0.16, 0.15, 0.045], [0, 0.57, -0.215], scaleRGB(C.coral, 0.8), 6),
    capsule([-0.13, 0.87, -0.12], [0.13, 0.87, -0.12], 0.045, C.cream, 6),
    ball(0.082, [0, 0.905, 0.012], SKIN, 7),
    ball(0.088, [0, 0.945, 0.004], C.gold, 7, [1, 0.75, 1]),
    ball(0.032, [0, 1.035, 0], C.cream, 8),
  );

  const bones = BONES.map(() => new Bone());
  BONES.forEach(([parent, p], i) => {
    const base = parent < 0 ? [0, 0, 0] : BONES[parent][1];
    bones[i].position.set(p[0] - base[0], p[1] - base[1], p[2] - base[2]).multiplyScalar(H);
    (parent < 0 ? undefined : bones[parent])?.add(bones[i]);
  });
  const mesh = new SkinnedMesh(mergeGeometries(parts), material);
  mesh.add(bones[0]);
  mesh.updateMatrixWorld(true);
  mesh.bind(new Skeleton(bones));
  mesh.frustumCulled = false; // always in view while walking; the skinned bounds would lag the pose anyway
  mesh.receiveShadow = true;

  const blob = createBlobShadow(0.55, 0.7);
  const object = new Group();
  object.add(mesh, blob);

  const [pelvis, thighL, shinL, thighR, shinR, spine, pack, head, pom, armL, armR] = bones;
  const rest = (b: Bone) => b.position.y;
  const pelvisY = rest(pelvis), packY = rest(pack);
  let yaw = NaN, phase = 0, walkW = 0, t = 0;

  return {
    object,
    setShadow(map) { mesh.castShadow = map; blob.visible = !map; },
    update(dt, pose) {
      t += dt;
      if (Number.isNaN(yaw)) yaw = pose.yaw;
      const turn = angdiff(pose.yaw, yaw);
      yaw += turn * (1 - Math.exp(-dt / 0.18)); // turns round in about half a second
      object.position.copy(pose.position);
      object.rotation.y = yaw;

      // Walk cycle tied to speed: longer, quicker strides as speed rises; phase advances with distance.
      const v = pose.speed;
      walkW += (smooth(0.05, 1.2, v) - walkW) * (1 - Math.exp(-dt / 0.15));
      phase += (2 * Math.PI * v * dt) / Math.min(3.2, 1.4 + 0.33 * v);
      const w = walkW, s = Math.sin(phase), c = Math.cos(phase), A = w * (0.3 + 0.05 * Math.min(v, 5.3));
      thighL.rotation.x = -A * s; thighR.rotation.x = A * s;               // negative swings a leg forward
      shinL.rotation.x = 1.3 * A * Math.max(0, c); shinR.rotation.x = 1.3 * A * Math.max(0, -c); // knee bends on the forward swing
      armL.rotation.x = 0.8 * A * s; armR.rotation.x = -0.8 * A * s;       // arms and poles swing against the legs
      pelvis.position.y = pelvisY + H * w * 0.025 * (Math.abs(c) - 0.7);   // highest as the legs pass
      spine.rotation.set(0.1 * w, 0.12 * A * s, 0);                        // lean in, twist with the stride
      pack.position.y = packY + H * 0.02 * w * Math.sin(2 * phase - 0.8);  // pack bounces a beat behind
      pom.rotation.set(-0.35 * w + 0.2 * w * Math.sin(2 * phase - 1.4), 0, Math.max(-0.5, Math.min(0.5, turn * 0.6)));

      // Idle: a slow breath and now and then a look around.
      const still = 1 - w, b = Math.sin(t * 1.5) * still;
      spine.scale.set(1 + 0.012 * b, 1 + 0.008 * b, 1 + 0.02 * b);
      head.rotation.set(0.06 * still * Math.sin(t * 0.23), 0.75 * still * Math.sin(t * 0.31) * Math.max(0, Math.sin(t * 0.13 + 1)), 0);
    },
  };
}
