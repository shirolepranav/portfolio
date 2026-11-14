// 04 The Camp: one ridge tent per app, glowing from inside at night.
// Reaction: the tent flaps flutter, and each tent bounces as its app's row appears in the panel.
import { Matrix4, Vector3 } from "three";
import { C, S, STOPS, type RGB } from "../config";
import { lift, scaleRGB, toWorld, type V3 } from "../core";
import { offset, tangentYaw, type PropContext, type Reaction } from "./index";

const COLOURS: RGB[] = [C.coral, C.gold, C.cream];
const L = 0.092, Wd = 0.078, H = 0.06; // tent length, width and height
// The tent drawn round the origin along +x: corners 0 to 3 on the ground, ridge ends 4 and 5.
const V: V3[] = [[-L / 2, 0, -Wd / 2], [L / 2, 0, -Wd / 2], [L / 2, 0, Wd / 2], [-L / 2, 0, Wd / 2], [-L * 0.2, H, 0], [L * 0.2, H, 0]];
const WHITE: RGB = [1, 1, 1];

export function camp(ctx: PropContext, count: number): Reaction {
  const { terrain, light, moving, reduced } = ctx, deg = STOPS.camp, yaw = tangentYaw(terrain.frame(deg)[1]);
  const places = Array.from({ length: count }, (_, k) => {
    // The script places three tents 5.2 degrees apart; more or fewer stay centred on the stop.
    const off = k - (count - 1) / 2, tc = terrain.at(deg + off * 5.2, 1.19 + 0.03 * (k % 2)), ty = yaw + 1.57 + off * 0.35;
    ctx.block({ c: tc, half: [0.046, 0.04], y: [0, 0.03, 0.06], along: [Math.cos(ty), 0, Math.sin(ty)] });
    light(lift(tc, 0.03), [1.0, 0.62, 0.36], 0.55, 0.22, "stop");
    return { p: lift(tc, -0.004), yaw: ty, color: COLOURS[k % 3] };
  });
  if (!count) return { start() {}, end() {}, update() {} };

  // Tents: white and shaded vertex colours, tinted per tent, so all of them share one mesh.
  const tents = moving((b) => {
    b.solid({ V, F: [[0, 1, 5], [0, 5, 4], [3, 2, 5], [3, 5, 4]] }, WHITE, { emis: 0.7 });
    b.solid({ V, F: [[0, 3, 4], [1, 2, 5]] }, scaleRGB(WHITE, 0.78), { emis: 0.9 });
  }, places);
  // Flaps: half of each front door, hinged on the edge from its bottom corner up to the ridge.
  const flaps = moving((b) => b.solid({ V: [V[1], V[5], [L / 2 + 0.0005, 0, 0]], F: [[0, 1, 2]] }, scaleRGB(WHITE, 0.66), { emis: 0.9 }), places);
  const hinge = new Vector3(...toWorld(V[1]));
  const axis = new Vector3(...toWorld(V[5])).sub(hinge).normalize();
  const turn = new Matrix4(), toHinge = new Matrix4().makeTranslation(hinge.x, hinge.y, hinge.z), fromHinge = toHinge.clone().invert();

  let t = -1;
  const bounce = new Float32Array(count).fill(-1);
  return {
    start() { t = 0; },
    end() { t = -1; },
    row(i) { if (i < count && !reduced) bounce[i] = 0; },
    update(dt) {
      if (t >= 0) t += dt;
      for (let i = 0; i < count; i++) {
        // A bounce: a quick squash, a hop and a settle over 0.9 s.
        let sy = 1, sx = 1, dy = 0;
        if (bounce[i] >= 0) {
          const b = (bounce[i] += dt), d = Math.exp(-b * 6);
          sy = 1 + 0.16 * Math.sin(b * 22) * d; sx = 1 - 0.07 * Math.sin(b * 22) * d; dy = Math.max(0, Math.sin(b * 11)) * d * 0.006 * S;
          if (b > 0.9) bounce[i] = -1;
        }
        const body = offset(dy, [0, 0, 0], [sx, sy, sx]);
        tents.pose(i, body);
        // The flap flutters for about two seconds after the stop opens, then hangs a little open until it closes.
        const f = reduced || t < 0 ? 0 : Math.exp(-t * 1.6) * Math.abs(0.55 * Math.sin(t * 17 + i * 1.7) + 0.35 * Math.sin(t * 29 + i));
        turn.makeRotationAxis(axis, -(f + (t >= 0 && !reduced ? 0.22 : 0)));
        flaps.pose(i, body.multiply(toHinge).multiply(turn).multiply(fromHinge));
      }
    },
  };
}
