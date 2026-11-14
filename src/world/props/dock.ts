// 05 The Dock: a wooden dock reaching 0.24 units into the lake, one canoe per product, a lamp at the end.
// The canoes ride the water gently all the time. Reaction: each canoe bobs in turn as its product's row appears.
import { C, S, STOPS, type RGB } from "../config";
import { add, box, lift, limb, mul, scaleRGB, sub, type V3 } from "../core";
import { offset, tangentYaw, type PropContext, type Reaction } from "./index";

// (along the dock 0..1, side, colour). The first three are the script's; the last two are a guess for 4 and 5 products.
const CANOES: [number, number, RGB][] = [[0.45, 1, C.coral], [0.85, 1, C.coral], [0.6, -1, C.gold], [0.2, -1, C.cream], [0.65, 2, C.gold]];
const WHITE: RGB = [1, 1, 1];

export function dock(ctx: PropContext, count: number): Reaction {
  const { terrain, part, solid, light, moving, reduced } = ctx, deg = STOPS.dock;
  const [out, tan] = terrain.frame(deg), yaw = tangentYaw(tan);
  const a = terrain.at(deg, 1.0), b = sub(a, mul(out, 0.24));
  const along = (f: number) => add(a, mul(sub(b, a), f));
  part(limb(add(lift(a, 0.012), mul(out, 0.03)), lift(b, 0.012), 0.04, 0.006, tan), C.wood);
  part(limb(sub(lift(b, 0.012), mul(tan, 0.05)), add(lift(b, 0.012), mul(tan, 0.05)), 0.04, 0.006, out), C.wood);
  for (const f of [0.25, 0.6, 1.0]) for (const s of [-1, 1]) {
    const q = add(along(f), mul(tan, s * 0.022));
    part(limb(lift(q, -0.01), lift(q, 0.026), 0.007, 0.007, tan), C.woodD);
  }
  const post = add(b, mul(tan, 0.03));
  part(limb(post, lift(post, 0.05), 0.006, 0.006, tan), C.woodD);
  solid(box(lift(post, 0.054), [0.01, 0.01, 0.01]), C.win, { emis: 3 });
  light(lift(b, 0.05), C.win, 0.5, 0.25, "stop");
  if (!count) return { start() {}, end() {}, update() {} };

  // The canoes share one mesh, tinted per canoe; each one is drawn along +x round its middle.
  const canoes = moving(canoe, CANOES.slice(0, count).map(([f, s, color], k) => ({
    p: add(along(f), mul(tan, s * 0.062)), yaw: yaw + 1.57 + 0.25 * Math.sign(s) * (k - 1), color,
  })));
  let clock = 0;
  const bob = new Float32Array(count).fill(-1);
  return {
    start() {},
    end() {},
    row(i) { if (i < count && !reduced) bob[i] = 0; },
    update(dt) {
      clock += dt;
      for (let i = 0; i < count; i++) {
        // Always: a slow rise and fall with a little roll, each canoe out of step with the others.
        let dy = reduced ? 0 : 0.0012 * S * Math.sin(clock * 1.3 + i * 2.1), roll = reduced ? 0 : 0.03 * Math.sin(clock * 1.1 + i * 1.3 + 1);
        if (bob[i] >= 0) {
          // A bob: pushed down, then rocking back up and settling over 1.5 s.
          const t = (bob[i] += dt), d = Math.exp(-t * 3);
          dy += -0.006 * S * Math.sin(t * 8) * d; roll += 0.14 * Math.sin(t * 8 - 0.6) * d;
          if (t > 1.5) bob[i] = -1;
        }
        canoes.pose(i, offset(dy, [roll, 0, 0]));
      }
    },
  };
}

/** A canoe round the origin, along +x: a pointed hull and a darker inside, white for tinting. */
function canoe({ solid }: { solid: (s: { V: V3[]; F: number[][] }, c: RGB, o?: { orient?: "up" }) => void }) {
  const L = 0.062, Wd = 0.014;
  const V: V3[] = [[L, 0.018, 0], [-L, 0.018, 0], [0, 0.012, Wd], [0, 0.012, -Wd], [0, -0.004, 0]];
  solid({ V, F: [[0, 2, 4], [0, 4, 3], [1, 4, 2], [1, 3, 4]] }, WHITE);
  solid({ V: V.map((p) => lift(p, 0.0005)), F: [[0, 3, 2], [1, 2, 3]] }, scaleRGB(WHITE, 0.55), { orient: "up" });
}
