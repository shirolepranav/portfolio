// 03 The Lookout: a fire lookout tower on braced stilts, with a lit cab.
// Reaction: a light sweeps once round from the tower cab.
import { C, S, STOPS } from "../config";
import { add, box, cone, lift, limb, mul, toWorld, type V3 } from "../core";
import { createBeam } from "./fx";
import { pulse, type PropContext, type Reaction } from "./index";

const SWEEP = 2.2; // seconds for the beam to go once round

export function lookout({ terrain, solid, part, light, block, moving, add: addObject, reduced }: PropContext): Reaction {
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
  // The cab windows are their own mesh, so they can light up for the sweep by day.
  const windows = moving((b) => {
    for (let a = 0; a < 4; a++) {
      const d: V3 = [Math.cos(a * Math.PI / 2), 0, Math.sin(a * Math.PI / 2)], s: V3 = [-d[2], 0, d[0]];
      const w = mul(d, 0.0345);
      b.solid(limb(lift(w, -0.013), lift(w, 0.013), 0.042, 0.003, s), C.win, { emis: 5 });
    }
  }, [{ p: lift(c, top + 0.039) }]);
  solid(cone(lift(c, top + 0.064), 0.062, 0.04, 4, 0.785, 0, true), C.snow);
  light(lift(c, top + 0.03), C.win, 0.7, 0.3, "stop");

  // The beam: a soft cone from the middle of the cab, tilted a little down, turning once round.
  const beam = createBeam(0.42 * S, 0.06 * S, [1.0, 0.86, 0.6]);
  beam.mesh.position.set(...toWorld(lift(c, top + 0.04)));
  beam.mesh.rotation.order = "YZX";
  beam.mesh.rotation.z = -0.12;
  addObject(beam.mesh);

  let t = -1, open = false, lit = 0;
  return {
    start() { t = 0; open = true; },
    end() { open = false; },
    update(dt) {
      if (t >= 0) t += dt;
      lit += ((open ? 1 : 0) - lit) * (1 - Math.exp(-dt / 0.25));
      windows.glow.set(lit, 1.4);
      if (reduced || t < 0 || t > SWEEP) { beam.set(0); return; }
      // Once round, starting from the lake side; bright in the middle of the turn, faded at both ends.
      beam.mesh.rotation.y = Math.PI * 0.75 + (t / SWEEP) * Math.PI * 2;
      beam.set(1.6 * pulse(t, SWEEP * 0.25, SWEEP));
    },
  };
}
