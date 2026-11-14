// 07 The Campfire: a stone ring, crossed logs, flames and two log benches. The strongest light on the island.
// The flames always flicker. Reaction: the fire flares and sparks rise.
import { C, S, STOPS } from "../config";
import { add, cone, lift, limb, mul, scaleRGB, sub, toWorld } from "../core";
import { createSparks } from "./fx";
import { offset, type PropContext, type Reaction } from "./index";

export function campfire({ terrain, part, light, rock, moving, add: addObject, reduced }: PropContext): Reaction {
  const deg = STOPS.campfire, [out, tan] = terrain.frame(deg), c = terrain.at(deg, 1.17);
  for (let k = 0; k < 7; k++)
    rock({ c: add(c, [0.022 * Math.cos(k * 0.9), 0.004, 0.022 * Math.sin(k * 0.9)]), r: 0.007, squash: [1, 1, 1], col: scaleRGB(C.rock, 0.9) });
  part(limb(add(c, [-0.014, 0.006, -0.006]), add(c, [0.014, 0.012, 0.006]), 0.007, 0.007, [0, 1, 0]), C.woodD);
  part(limb(add(c, [-0.006, 0.006, 0.014]), add(c, [0.006, 0.012, -0.014]), 0.007, 0.007, [0, 1, 0]), C.woodD);
  // The flames: their own mesh, so they can flicker and flare. Drawn round the fire's centre.
  const flames = moving((b) => {
    b.solid(cone([0, 0, 0], 0.012, 0.04, 5, 0.3), [1.0, 0.45, 0.12], { emis: 9 });
    b.solid(cone([0.003, 0, 0.002], 0.007, 0.028, 4, 1.0), [1.0, 0.85, 0.35], { emis: 14 });
  }, [{ p: lift(c, 0.008) }], { flicker: true });
  for (const s of [-1, 1]) {
    const bc = add(add(c, mul(tan, s * 0.055)), mul(out, 0.01));
    part(limb(lift(sub(bc, mul(out, 0.03)), 0.008), lift(add(bc, mul(out, 0.03)), 0.008), 0.016, 0.014, [0, 1, 0]), C.wood);
  }
  const lamp = light(lift(c, 0.03), [1.0, 0.55, 0.22], 1.6, 0.45, "fire");
  const sparks = createSparks(28, 0.16 * S, 0.012 * S);
  sparks.points.position.set(...toWorld(lift(c, 0.02)));
  addObject(sparks.points);

  let t = -1, clock = 0;
  return {
    start() { t = 0; },
    end() {},
    update(dt, _t, boostLamp) {
      clock += dt;
      if (t >= 0) t += dt;
      // Flare: up fast, back down over two seconds. With reduced motion the fire just burns brighter for a while.
      const flare = t < 0 ? 0 : reduced ? (t < 2.5 ? 0.6 : 0) : t < 0.25 ? t / 0.25 : Math.exp(-(t - 0.25) * 1.4);
      if (t > 4) t = -1;
      // Always-on flicker: the flames stretch and lean a little, out of step.
      const w = reduced ? 0 : 1;
      const sy = 1 + w * (0.12 * Math.sin(clock * 11) + 0.07 * Math.sin(clock * 27 + 1)) + 0.75 * flare;
      const sx = 1 + w * 0.06 * Math.sin(clock * 15 + 2) + 0.3 * flare;
      flames.pose(0, offset(0, [w * 0.08 * Math.sin(clock * 7), clock * 0.6 * w, w * 0.08 * Math.sin(clock * 9 + 1)], [sx, sy, sx]));
      boostLamp(lamp, 1 + 1.3 * flare);
      sparks.update(clock, reduced ? 0 : Math.min(1, flare * 1.4));
    },
  };
}
