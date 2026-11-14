// 05 The Dock: a wooden dock reaching 0.24 units into the lake, one canoe per product, a lamp at the end.
import { C, STOPS, type RGB } from "../config";
import { add, box, lift, limb, mul, scaleRGB, sub, type V3 } from "../core";
import { tangentYaw, type PropContext } from "./index";

// (along the dock 0..1, side, colour). The first three are the script's; the last two are a guess for 4 and 5 products.
const CANOES: [number, number, RGB][] = [[0.45, 1, C.coral], [0.85, 1, C.coral], [0.6, -1, C.gold], [0.2, -1, C.cream], [0.65, 2, C.gold]];

export function dock(ctx: PropContext, count: number) {
  const { terrain, part, solid, light } = ctx, deg = STOPS.dock;
  const [out, tan] = terrain.frame(deg), yaw = tangentYaw(tan);
  const a = terrain.at(deg, 1.0), b = sub(a, mul(out, 0.24));
  const along = (f: number) => add(a, mul(sub(b, a), f));
  part(limb(add(lift(a, 0.012), mul(out, 0.03)), lift(b, 0.012), 0.04, 0.006, tan), C.wood);
  part(limb(sub(lift(b, 0.012), mul(tan, 0.05)), add(lift(b, 0.012), mul(tan, 0.05)), 0.04, 0.006, out), C.wood);
  for (const f of [0.25, 0.6, 1.0]) for (const s of [-1, 1]) {
    const q = add(along(f), mul(tan, s * 0.022));
    part(limb(lift(q, -0.01), lift(q, 0.026), 0.007, 0.007, tan), C.woodD);
  }
  CANOES.slice(0, count).forEach(([f, s, col], k) => canoe(ctx, add(along(f), mul(tan, s * 0.062)), yaw + 1.57 + 0.25 * Math.sign(s) * (k - 1), col));
  const post = add(b, mul(tan, 0.03));
  part(limb(post, lift(post, 0.05), 0.006, 0.006, tan), C.woodD);
  solid(box(lift(post, 0.054), [0.01, 0.01, 0.01]), C.win, { emis: 3 });
  light(lift(b, 0.05), C.win, 0.5, 0.25, "stop");
}

function canoe({ solid }: { solid: (s: { V: V3[]; F: number[][] }, c: RGB, o?: { orient?: "up" }) => void }, c: V3, yaw: number, col: RGB) {
  const f: V3 = [Math.cos(yaw), 0, Math.sin(yaw)], s: V3 = [-f[2], 0, f[0]], L = 0.062, Wd = 0.014;
  const V = [lift(add(c, mul(f, L)), 0.018), lift(sub(c, mul(f, L)), 0.018), lift(add(c, mul(s, Wd)), 0.012), lift(sub(c, mul(s, Wd)), 0.012), lift(c, -0.004)];
  solid({ V, F: [[0, 2, 4], [0, 4, 3], [1, 4, 2], [1, 3, 4]] }, col);
  solid({ V: V.map((p) => lift(p, 0.0005)), F: [[0, 3, 2], [1, 2, 3]] }, scaleRGB(col, 0.55), { orient: "up" });
}
