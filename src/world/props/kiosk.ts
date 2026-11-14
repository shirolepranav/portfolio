// 01 Trailhead: an information kiosk with a small gable roof and a lamp.
import { C, STOPS } from "../config";
import { add, box, gable, lift, limb, mul, sub } from "../core";
import { tangentYaw, type PropContext } from "./index";

export function kiosk({ terrain, solid, part, light, block }: PropContext) {
  const [out, tan] = terrain.frame(STOPS.trailhead), c = terrain.at(STOPS.trailhead, 1.15);
  block({ c, half: [0.06, 0.02], y: [0, 0.075, 0.095], along: tan });
  for (const s of [-1, 1]) {
    const foot = add(c, mul(tan, s * 0.045));
    part(limb(foot, lift(foot, 0.075), 0.008, 0.008, tan), C.woodD);
  }
  part(limb(sub(lift(c, 0.035), mul(tan, 0.045)), add(lift(c, 0.035), mul(tan, 0.045)), 0.045, 0.006, [0, 1, 0]), C.cream);
  solid(gable(lift(c, 0.075), 0.115, 0.04, 0.02, tangentYaw(tan)), C.snow);
  solid(box(sub(lift(c, 0.062), mul(out, 0.012)), [0.012, 0.012, 0.012]), C.win, { emis: 6 });
  light(sub(lift(c, 0.05), mul(out, 0.02)), C.win, 0.5, 0.25, "stop");
}
