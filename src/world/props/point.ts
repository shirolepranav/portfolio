// 06 The Point: a rocky point with a camera on a tripod. No night light; it is moonlit.
import { C, STOPS } from "../config";
import { add, box, lift, limb, mul, scaleRGB, sub } from "../core";
import { tangentYaw, type PropContext } from "./index";

export function point({ terrain, part, rock, block }: PropContext) {
  const deg = STOPS.point, [out, tan] = terrain.frame(deg), { rng } = terrain;
  const base = terrain.at(deg, 1.035);
  for (let k = 0; k < 7; k++) {
    const q = add(add(base, mul(tan, rng.uniform(-0.05, 0.05))), mul(out, rng.uniform(-0.07, 0.01))), r = rng.uniform(0.018, 0.04);
    rock({ c: lift(q, r * 0.2), r, squash: [1.2, 0.6, 1.1], col: scaleRGB(C.rock, rng.uniform(0.85, 1.1)) });
  }
  const tp = lift(sub(base, mul(out, 0.02)), 0.03), top = lift(tp, 0.05);
  block({ c: tp, half: [0.02, 0.02], y: [0, 0.07, 0.07], see: true });
  for (let k = 0; k < 3; k++) {
    const aa = k * 2.094 + 0.4;
    part(limb(add(tp, [0.016 * Math.cos(aa), 0, 0.016 * Math.sin(aa)]), top, 0.004, 0.004, tan), [0.15, 0.15, 0.17]);
  }
  part(box(lift(top, 0.008), [0.022, 0.015, 0.014], tangentYaw(tan)), [0.12, 0.12, 0.14]);
  part(limb(lift(top, 0.008), sub(lift(top, 0.008), mul(out, 0.016)), 0.009, 0.009, tan), [0.2, 0.2, 0.23]);
}
