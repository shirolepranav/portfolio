// 02 The Cabin: a ranger cabin with a porch, lit windows and a chimney.
import { C, STOPS } from "../config";
import { add, box, gable, lift, limb, mul, sub } from "../core";
import { tangentYaw, type PropContext } from "./index";

export function cabin({ terrain, solid, part, light, block }: PropContext) {
  const [out, tan] = terrain.frame(STOPS.cabin), yaw = tangentYaw(tan);
  const c = lift(terrain.at(STOPS.cabin, 1.21), -0.005), L = 0.17, Wd = 0.115, Hh = 0.075;
  block({ c, half: [L * 0.56, Wd * 0.63], y: [0, Hh, Hh + 0.062], along: tan }); // the roof overhangs the walls
  part(box(lift(c, Hh / 2), [L, Hh, Wd], -yaw), C.wood);
  solid(gable(lift(c, Hh), L * 1.12, Wd * 1.25, 0.062, yaw), C.snow);
  part(box(lift(add(add(c, mul(tan, 0.05)), mul(out, 0.01)), Hh + 0.05), [0.02, 0.05, 0.02]), [0.42, 0.36, 0.38]);
  const face = sub(c, mul(out, Wd / 2 + 0.002)); // the side facing the lake
  part(limb(lift(face, 0.002), lift(face, 0.046), 0.026, 0.004, tan), C.woodD);
  for (const s of [-1, 1]) {
    const w = add(face, mul(tan, s * 0.052));
    solid(limb(lift(w, 0.03), lift(w, 0.055), 0.03, 0.004, tan), C.win, { emis: 5 });
  }
  const porch = lift(sub(face, mul(out, 0.022)), 0.004);
  part(limb(sub(porch, mul(tan, L * 0.5)), add(porch, mul(tan, L * 0.5)), 0.04, 0.008, out), C.woodD);
  light(lift(sub(face, mul(out, 0.03)), 0.04), C.win, 0.9, 0.3, "stop");
}
