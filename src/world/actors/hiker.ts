// The hiker: teal jacket, coral pack with a cream bedroll, gold toque with a pom-pom, two trekking poles.
// Proportions and colours from hiker() in reference/scene/scene.py, rebuilt from capsules, spheres and
// rounded boxes with smooth shading. One skinned mesh (one draw call); each part rides one bone rigidly.
import { CylinderGeometry, Group, Vector3, type Bone, type BufferGeometry, type Material, type Object3D } from "three";
import { C, S, type RGB } from "../config";
import { angdiff, scaleRGB, smooth } from "../core";
import { createBlobShadow } from "./shadow";
import { makeParts, rig, type P } from "./parts";

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
  /** Calls cb each time a foot lands, with how firmly (0 to 1): footstep sounds follow the walk cycle. */
  onStep(cb: (loud: number) => void): void;
}

const H = 0.05 * S; // 1.75 m; every size below is a fraction of it
const PANTS: RGB = [0.17, 0.19, 0.25], BOOTS: RGB = [0.24, 0.16, 0.12], JACKET: RGB = [0.1, 0.3, 0.36];
const SKIN: RGB = [0.6, 0.42, 0.31], POLE: RGB = [0.78, 0.78, 0.82];

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
const { part, capsule, rbox, ball } = makeParts(H);

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

  const { mesh, bones } = rig(parts, BONES, H, material);

  const blob = createBlobShadow(0.55, 0.7);
  const object = new Group();
  object.add(mesh, blob);

  const [pelvis, thighL, shinL, thighR, shinR, spine, pack, head, pom, armL, armR] = bones;
  const rest = (b: Bone) => b.position.y;
  const pelvisY = rest(pelvis), packY = rest(pack);
  let yaw = NaN, phase = 0, walkW = 0, t = 0, stepCb: (loud: number) => void = () => {};

  return {
    object,
    setShadow(map) { mesh.castShadow = map; blob.visible = !map; },
    onStep(cb) { stepCb = cb; },
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
      // A foot lands at each end of the stride: where the phase passes a quarter turn plus a half turn.
      const before = Math.floor((phase - Math.PI / 2) / Math.PI);
      phase += (2 * Math.PI * v * dt) / Math.min(3.2, 1.4 + 0.33 * v);
      if (Math.floor((phase - Math.PI / 2) / Math.PI) !== before && walkW > 0.3) stepCb(Math.min(1, walkW * (0.6 + 0.1 * v)));
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
