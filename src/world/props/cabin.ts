// 02 The Cabin: a ranger cabin with a porch, lit windows and a chimney.
// Reaction: the door swings open and chimney smoke starts, puffing while the stop is open.
import { Vector3 } from "three";
import { C, S, STOPS } from "../config";
import { add, blob, box, gable, lift, limb, makeRng, mul, sub } from "../core";
import { offset, tangentYaw, type PropContext, type Reaction } from "./index";

const PUFFS = 7, LIFE = 3.2; // smoke puffs in the air at once, and how long each one rises

export function cabin({ terrain, solid, part, light, block, moving, reduced }: PropContext): Reaction {
  const [out, tan] = terrain.frame(STOPS.cabin), yaw = tangentYaw(tan);
  const c = lift(terrain.at(STOPS.cabin, 1.21), -0.005), L = 0.17, Wd = 0.115, Hh = 0.075;
  block({ c, half: [L * 0.56, Wd * 0.63], y: [0, Hh, Hh + 0.062], along: tan }); // the roof overhangs the walls
  part(box(lift(c, Hh / 2), [L, Hh, Wd], -yaw), C.wood);
  solid(gable(lift(c, Hh), L * 1.12, Wd * 1.25, 0.062, yaw), C.snow);
  const chimney = lift(add(add(c, mul(tan, 0.05)), mul(out, 0.01)), Hh + 0.05);
  part(box(chimney, [0.02, 0.05, 0.02]), [0.42, 0.36, 0.38]);
  const face = sub(c, mul(out, Wd / 2 + 0.002)); // the side facing the lake
  for (const s of [-1, 1]) {
    const w = add(face, mul(tan, s * 0.052));
    solid(limb(lift(w, 0.03), lift(w, 0.055), 0.03, 0.004, tan), C.win, { emis: 5 });
  }
  const porch = lift(sub(face, mul(out, 0.022)), 0.004);
  part(limb(sub(porch, mul(tan, L * 0.5)), add(porch, mul(tan, L * 0.5)), 0.04, 0.008, out), C.woodD);
  light(lift(sub(face, mul(out, 0.03)), 0.04), C.win, 0.9, 0.3, "stop");

  // The door hangs on its left edge (seen from the lake), so it is drawn from x = 0 to its width.
  // A warm glow behind it shows once it opens.
  const hinge = sub(face, mul(tan, 0.013));
  part(limb(lift(face, 0.004), lift(face, 0.044), 0.022, 0.001, tan), C.win, { emis: 2.5 });
  const door = moving((b) => b.part(limb([0.013, 0.002, 0], [0.013, 0.046, 0], 0.026, 0.004, [1, 0, 0]), C.woodD), [{ p: hinge, yaw }]);

  // Smoke: soft low-poly puffs that rise from the chimney, swell, drift with the wind and shrink away.
  const rng = makeRng(5);
  const puff = moving((b) => b.solid(blob([0, 0, 0], 0.012, rng, 3, 7, [1, 0.85, 1], 0.12), [0.86, 0.86, 0.9]),
    Array.from({ length: PUFFS }, () => ({ p: lift(chimney, 0.03) })));
  const hidden = offset(0, [0, 0, 0], [0.001, 0.001, 0.001]);
  for (let i = 0; i < PUFFS; i++) puff.pose(i, hidden);
  const wind = new Vector3(...[out[0], 0, -out[2]]).multiplyScalar(0.5).add(new Vector3(tan[0], 0, -tan[2]).multiplyScalar(0.3));

  let open = false, swing = 0, smoke = 0, clock = 0, born = -99;
  const birth = new Float32Array(PUFFS).fill(-99);
  return {
    start() { open = true; if (!reduced) born = clock; },
    end() { open = false; },
    update(dt) {
      clock += dt;
      // The door swings out over half a second, with a small overshoot; with reduced motion it simply opens.
      const want = open ? 1 : 0;
      swing = reduced ? want : swing + (want - swing) * (1 - Math.exp(-dt / 0.16));
      door.pose(0, offset(0, [0, swing * 1.75 + (open && !reduced ? 0.12 * Math.sin(Math.min(1, clock - born) * Math.PI) : 0), 0]));
      // A new puff every LIFE / PUFFS seconds while the smoke is on.
      smoke = open && !reduced ? 1 : 0;
      const slot = Math.floor(clock / (LIFE / PUFFS)) % PUFFS;
      if (smoke && clock - birth[slot] > LIFE) birth[slot] = clock;
      for (let i = 0; i < PUFFS; i++) {
        const age = (clock - birth[i]) / LIFE;
        if (age < 0 || age > 1) { puff.pose(i, hidden); continue; }
        const k = 0.35 + 1.4 * Math.sin(Math.min(1, age * 1.2) * Math.PI * 0.85); // swell, then shrink away
        const m = offset(age * 0.09 * S, [age * 2, i * 1.3, 0], [k, k, k]);
        m.elements[12] += wind.x * age * 0.06 * S; m.elements[14] += wind.z * age * 0.06 * S;
        puff.pose(i, m);
      }
    },
  };
}
