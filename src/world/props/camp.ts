// 04 The Camp: one ridge tent per app, glowing from inside at night.
import { C, STOPS, type RGB } from "../config";
import { add, lift, mul, scaleRGB, sub, type V3 } from "../core";
import { tangentYaw, type PropContext } from "./index";

const COLOURS: RGB[] = [C.coral, C.gold, C.cream];

export function camp(ctx: PropContext, count: number) {
  const { terrain, light } = ctx, deg = STOPS.camp, yaw = tangentYaw(terrain.frame(deg)[1]);
  for (let k = 0; k < count; k++) {
    // The script places three tents 5.2 degrees apart; more or fewer stay centred on the stop.
    const off = k - (count - 1) / 2, tc = terrain.at(deg + off * 5.2, 1.19 + 0.03 * (k % 2));
    tent(ctx, lift(tc, -0.004), 0.092, 0.078, 0.06, yaw + 1.57 + off * 0.35, COLOURS[k % 3]);
    light(lift(tc, 0.03), [1.0, 0.62, 0.36], 0.55, 0.22, "stop");
  }
}

/** Ridge tent with sloped ends: two trapezoid sides, two triangular doors. */
function tent({ solid }: PropContext, c: V3, L: number, Wd: number, h: number, yaw: number, col: RGB) {
  const f: V3 = [Math.cos(yaw), 0, Math.sin(yaw)], s: V3 = [-f[2], 0, f[0]];
  const V = [sub(sub(c, mul(f, L / 2)), mul(s, Wd / 2)), sub(add(c, mul(f, L / 2)), mul(s, Wd / 2)),
    add(add(c, mul(f, L / 2)), mul(s, Wd / 2)), add(sub(c, mul(f, L / 2)), mul(s, Wd / 2)),
    lift(sub(c, mul(f, L * 0.2)), h), lift(add(c, mul(f, L * 0.2)), h)];
  solid({ V, F: [[0, 1, 5], [0, 5, 4], [3, 2, 5], [3, 5, 4]] }, col, { emis: 0.7 });
  solid({ V, F: [[0, 3, 4], [1, 2, 5]] }, scaleRGB(col, 0.78), { emis: 0.9 });
}
