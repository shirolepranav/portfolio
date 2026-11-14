// 03 The Lookout: a fire lookout tower on braced stilts, with a lit cab.
import { C, STOPS } from "../config";
import { add, box, cone, lift, limb, mul, type V3 } from "../core";
import type { PropContext } from "./index";

export function lookout({ terrain, solid, part, light, block }: PropContext) {
  const c = terrain.at(STOPS.lookout, 1.23), top = 0.17;
  block({ c, half: [0.05, 0.05], y: [0, top, top], see: true });             // the open stilts
  block({ c, half: [0.055, 0.055], y: [top - 0.005, top + 0.064, top + 0.105] }); // the cab and its roof
  const p = (x: number, y: number, z: number) => add(c, [x, y, z]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    part(limb(p(sx * 0.045, 0, sz * 0.045), p(sx * 0.028, top, sz * 0.028), 0.008, 0.008, [1, 0, 0]), C.woodD);
  const braces: [number, number, number, number][] = [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]];
  for (const [ax, az, bx, bz] of braces)
    part(limb(p(ax * 0.042, 0.03, az * 0.042), p(bx * 0.032, 0.125, bz * 0.032), 0.005, 0.005, [0, 1, 0]), C.woodD);
  part(box(lift(c, top + 0.004), [0.1, 0.008, 0.1]), C.wood);
  part(box(lift(c, top + 0.036), [0.066, 0.056, 0.066]), C.wood);
  for (let a = 0; a < 4; a++) {
    const d: V3 = [Math.cos(a * Math.PI / 2), 0, Math.sin(a * Math.PI / 2)], s: V3 = [-d[2], 0, d[0]];
    const w = add(c, mul(d, 0.0345));
    solid(limb(lift(w, top + 0.026), lift(w, top + 0.052), 0.042, 0.003, s), C.win, { emis: 5 });
  }
  solid(cone(lift(c, top + 0.064), 0.062, 0.04, 4, 0.785, 0, true), C.snow);
  light(lift(c, top + 0.03), C.win, 0.7, 0.3, "stop");
}
