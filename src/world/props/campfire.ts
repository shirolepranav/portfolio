// 07 The Campfire: a stone ring, crossed logs, flames and two log benches. The strongest light on the island.
import { C, STOPS } from "../config";
import { add, cone, lift, limb, mul, scaleRGB, sub } from "../core";
import type { PropContext } from "./index";

export function campfire({ terrain, solid, part, light, rock }: PropContext) {
  const deg = STOPS.campfire, [out, tan] = terrain.frame(deg), c = terrain.at(deg, 1.17);
  for (let k = 0; k < 7; k++)
    rock({ c: add(c, [0.022 * Math.cos(k * 0.9), 0.004, 0.022 * Math.sin(k * 0.9)]), r: 0.007, squash: [1, 1, 1], col: scaleRGB(C.rock, 0.9) });
  part(limb(add(c, [-0.014, 0.006, -0.006]), add(c, [0.014, 0.012, 0.006]), 0.007, 0.007, [0, 1, 0]), C.woodD);
  part(limb(add(c, [-0.006, 0.006, 0.014]), add(c, [0.006, 0.012, -0.014]), 0.007, 0.007, [0, 1, 0]), C.woodD);
  solid(cone(lift(c, 0.008), 0.012, 0.04, 5, 0.3), [1.0, 0.45, 0.12], { emis: 9 });
  solid(cone(add(c, [0.003, 0.008, 0.002]), 0.007, 0.028, 4, 1.0), [1.0, 0.85, 0.35], { emis: 14 });
  for (const s of [-1, 1]) {
    const bc = add(add(c, mul(tan, s * 0.055)), mul(out, 0.01));
    part(limb(lift(sub(bc, mul(out, 0.03)), 0.008), lift(add(bc, mul(out, 0.03)), 0.008), 0.016, 0.014, [0, 1, 0]), C.wood);
  }
  light(lift(c, 0.03), [1.0, 0.55, 0.22], 1.6, 0.45, "fire");
}
