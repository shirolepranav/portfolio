// 01 Trailhead: an information kiosk with a small gable roof and a lamp. Reaction: the lamp blinks on.
import { C, STOPS } from "../config";
import { add, box, gable, lift, limb, mul, sub } from "../core";
import { tangentYaw, type PropContext, type Reaction } from "./index";

export function kiosk({ terrain, solid, part, light, block, moving, reduced }: PropContext): Reaction {
  const [out, tan] = terrain.frame(STOPS.trailhead), c = terrain.at(STOPS.trailhead, 1.15);
  block({ c, half: [0.06, 0.02], y: [0, 0.075, 0.095], along: tan });
  for (const s of [-1, 1]) {
    const foot = add(c, mul(tan, s * 0.045));
    part(limb(foot, lift(foot, 0.075), 0.008, 0.008, tan), C.woodD);
  }
  part(limb(sub(lift(c, 0.035), mul(tan, 0.045)), add(lift(c, 0.035), mul(tan, 0.045)), 0.045, 0.006, [0, 1, 0]), C.cream);
  solid(gable(lift(c, 0.075), 0.115, 0.04, 0.02, tangentYaw(tan)), C.snow);
  // The lamp is its own small mesh, so it can blink.
  const lamp = moving((b) => b.solid(box([0, 0, 0], [0.012, 0.012, 0.012]), C.win, { emis: 6 }), [{ p: sub(lift(c, 0.062), mul(out, 0.012)) }]);
  light(sub(lift(c, 0.05), mul(out, 0.02)), C.win, 0.5, 0.25, "stop");

  // Blink, blink, on: a level for each moment of the first 0.7 s, then it stays on while the stop is open.
  let t = -1, open = false, hold = 0;
  return {
    start() { t = 0; open = true; },
    end() { open = false; },
    update(dt) {
      if (t >= 0) t += dt;
      hold += ((open ? 1 : 0) - hold) * (1 - Math.exp(-dt / (open ? 0.05 : 0.4)));
      const blink = reduced || t < 0 || t > 0.7 ? 1 : t < 0.12 ? 1 : t < 0.22 ? 0.05 : t < 0.34 ? 1 : t < 0.44 ? 0.1 : 1;
      lamp.glow.set(hold, 1.6 * blink);
    },
  };
}
