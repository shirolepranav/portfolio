// Three birds circling slowly high over the north peaks, by day only. In the sweep to night they climb away
// over the ridge and are gone; at dawn they come back. One skinned mesh for all three (one draw call).
import { Vector3, type Material } from "three";
import { S, type RGB } from "../config";
import { lerp, smooth, toWorld } from "../core";
import type { Terrain } from "../terrain";
import { makeParts, rig, type P } from "./parts";
import type { Actor } from "./animals";

const N = 3, INK: RGB = [0.16, 0.15, 0.15], WING: RGB = [0.21, 0.19, 0.18];

export function createBirds(terrain: Terrain, material: Material): Actor {
  // Built in metres: a 2.2 m wingspan, about an eagle's.
  const { capsule, ball, rbox } = makeParts(1);
  const bones: [number, P][] = [], parts = [];
  for (let i = 0; i < N; i++) {
    const b = bones.length;
    bones.push([-1, [0, 0, 0]], [b, [0.07, 0, 0.02]], [b, [-0.07, 0, 0.02]]); // body, left wing, right wing
    parts.push(
      capsule([0, 0, -0.25], [0, 0, 0.22], 0.085, INK, b),
      ball(0.075, [0, 0.03, 0.3], INK, b),
      ball(0.12, [0, 0, -0.36], INK, b, [1, 0.25, 1.1]),          // tail fan
      rbox([1.05, 0.035, 0.36], [0.58, 0, 0.02], WING, b + 1),
      rbox([1.05, 0.035, 0.36], [-0.58, 0, 0.02], WING, b + 2),
    );
  }
  const { mesh, bones: list } = rig(parts, bones, 1, material);
  mesh.receiveShadow = false;

  // The circle: over the highest peak (84 degrees), well above it. The way out: further out and up, over the ridge.
  const centre = new Vector3(...toWorld(terrain.at(84, 1.85))).setY(1.62 * S);
  const away = new Vector3(...toWorld(terrain.frame(84)[0], 1)).setY(0).normalize();
  const birds = Array.from({ length: N }, (_, i) => ({ phase: i * 2.1, r: (0.2 + 0.05 * i) * S, h: i * 1.6, w: 0.14 + 0.02 * i }));
  const fwd = new Vector3(), pos = new Vector3();
  let flap = 0;

  return {
    object: mesh,
    setShadow() {},
    bounds: [{ p: centre.clone(), r: 0.6 * S }],
    update({ dt, t, night }) {
      // 0 while it is day; rising to 1 over the first half of the sweep as they leave.
      const leave = smooth(0.05, 0.55, night);
      mesh.visible = leave < 0.999;
      if (!mesh.visible) return;
      flap += dt * (1 + 1.5 * leave);
      birds.forEach((b, i) => {
        const a = t * b.w + b.phase;
        pos.set(Math.cos(a) * b.r, b.h + Math.sin(t * 0.5 + i) * 1.2, Math.sin(a) * b.r).add(centre);
        pos.addScaledVector(away, leave * leave * 1.6 * S).setY(pos.y + leave * leave * 0.5 * S);
        fwd.set(-Math.sin(a), 0, Math.cos(a)).lerp(away, leave).normalize();
        const body = list[i * 3];
        body.position.copy(pos);
        body.rotation.set(0, Math.atan2(fwd.x, fwd.z), lerp(0.35, 0, leave)); // banked into the circle
        // Mostly gliding, wings a little raised; a few beats every four seconds (and steady beats when leaving).
        const cyc = (flap + i * 1.3) % 4, beat = Math.max(cyc < 1.2 ? Math.sin((Math.PI * cyc) / 1.2) : 0, leave);
        const wing = 0.12 + beat * 0.55 * Math.sin((flap + i) * 11);
        list[i * 3 + 1].rotation.z = wing; list[i * 3 + 2].rotation.z = -wing;
      });
    },
  };
}
