// Instanced trees, rocks and lanterns: one draw call each. Ported from trees(), boulders() and lanterns() in scene.py.
import { Color, InstancedMesh, Matrix4, Quaternion, Vector3, type Material } from "three";
import { C, D2R, S, TV, type RGB } from "./config";
import { MeshBuilder, angdiff, blob, box, cone, fbm, lift, limb, scaleRGB, smooth, toWorld, type ClearPoint, type V3 } from "./core";
import { radius, type Terrain } from "./terrain";

const m4 = new Matrix4(), q = new Quaternion(), up = new Vector3(0, 1, 0), col = new Color();
const place = (mesh: InstancedMesh, i: number, p: V3, scale: V3, yaw: number) =>
  mesh.setMatrixAt(i, m4.compose(new Vector3(...toWorld(p)), q.setFromAxisAngle(up, yaw), new Vector3(...scale)));

/** Up to `count` trees below the tree line, clear of the creek, cliffs and the given points. */
export function createTrees(terrain: Terrain, material: Material, clear: V3[], count = 1150) {
  const { rng, ground } = terrain;
  const spots: { p: V3; h: number; r: number; rot: number; col: RGB }[] = [];
  const greens: RGB[] = [[0.1, 0.27, 0.25], [0.13, 0.32, 0.26], [0.09, 0.23, 0.24]];
  for (let i = 0; i < count * 30 && spots.length < count; i++) {
    const t = rng.uniform(1.15, 1.9), th = rng.uniform(-Math.PI, Math.PI), line = 0.36 + 0.1 * rng.next();
    const r = radius(t, th), x = r * Math.cos(th), z = r * Math.sin(th), y = ground(x, z);
    if (Math.abs(angdiff(th, TV)) <= 4.2 * D2R || y >= line) continue;               // creek, tree line
    if (fbm(x * 2.4, z * 2.4, 3, 91) <= 0.4 + 0.25 * smooth(1.45, 1.85, t)) continue;  // clumps, thinning uphill
    const g = [ground(x + 0.03, z), ground(x - 0.03, z), ground(x, z + 0.03), ground(x, z - 0.03)];
    if (Math.max(...g) - Math.min(...g) >= 0.075) continue;                          // no trees on cliffs
    if (clear.some((c) => Math.hypot(x - c[0], z - c[2]) <= 0.13)) continue;          // clearings
    const h = rng.uniform(0.085, 0.16) * (t > 1.3 ? 1.15 : 0.95);
    const larch = rng.next() < 0.13; // about one in eight is a gold larch
    spots.push({
      p: [x, y - 0.006, z], h, r: h * rng.uniform(0.22, 0.29), rot: rng.uniform(0, 6.28),
      col: larch ? scaleRGB(C.gold, rng.uniform(0.85, 1.05)) : scaleRGB(greens[rng.int(3)], rng.uniform(0.85, 1.15)),
    });
  }

  // Unit tree: three stacked cones with slightly blunted tips; the trunk is its own mesh so it keeps its colour.
  const crownB = new MeshBuilder(1);
  [[0.12, 1.0, 0.56], [0.36, 0.76, 0.8], [0.6, 0.52, 1.0]].forEach(([y0, rr, y1], k) =>
    crownB.add(cone([0, y0, 0], rr, y1 - y0, 6, k * 0.5, 0.14), [1 + 0.1 * k, 1 + 0.1 * k, 1 + 0.1 * k]));
  const trunkB = new MeshBuilder(1);
  trunkB.add(limb([0, 0, 0], [0, 0.2, 0], 0.05, 0.05), C.woodD);
  const crowns = new InstancedMesh(crownB.build(), material, spots.length);
  const trunks = new InstancedMesh(trunkB.build(), material, spots.length);
  const set = (i: number, k = 1) => {
    const s = spots[i], m = k * S;
    place(crowns, i, s.p, [s.r * m, s.h * m, s.r * m], s.rot);
    place(trunks, i, s.p, [s.h * m, s.h * m, s.h * m], s.rot);
  };
  spots.forEach((s, i) => { set(i); crowns.setColorAt(i, col.setRGB(...s.col)); });
  crowns.computeBoundingSphere(); trunks.computeBoundingSphere();

  const scale = new Float32Array(spots.length).fill(1);
  return {
    crowns, trunks, spots, scale,
    /** Shows the first n trees (quality tiers). */
    setCount(n: number) { crowns.count = trunks.count = Math.min(n, spots.length); },
    /**
     * Clears trees near the given points, as the scripts clear a camera's view for each shot. Trees within r (or a
     * point's own radius) are gone; just beyond it they shrink into the ground, so the walking camera never makes them pop.
     */
    clearAround(points: ClearPoint[], r = 0.13) {
      let changed = false;
      spots.forEach((s, i) => {
        let k = 1;
        for (const c of points) {
          const cr = c[3] ?? r, dx = s.p[0] - c[0], dz = s.p[2] - c[2];
          if (dx * dx + dz * dz < (cr + 0.04) ** 2) k = Math.min(k, smooth(cr, cr + 0.04, Math.hypot(dx, dz)));
        }
        if (k !== scale[i]) { scale[i] = k; set(i, k); changed = true; }
      });
      if (changed) crowns.instanceMatrix.needsUpdate = trunks.instanceMatrix.needsUpdate = true;
    },
    /** Forest floor shading: 1 in the open, darker under trees. */
    shade(x: number, z: number) {
      let n = 0;
      for (const s of spots) if (Math.abs(s.p[0] - x) < 0.06 && Math.abs(s.p[2] - z) < 0.06) n++;
      return Math.max(0.8, 1 - 0.05 * n);
    },
  };
}

export interface Rock { c: V3; r: number; squash: V3; col: RGB }

/** Boulders along the shore and slopes, plus any extra rocks (the Point, the fire ring), in one mesh. */
export function createRocks(terrain: Terrain, material: Material, extra: Rock[]) {
  const { rng, at } = terrain;
  const rocks: Rock[] = [];
  for (let k = 0; k < 70; k++) {
    const deg = rng.uniform(-180, 180);
    const near = rng.uniform(0.985, 1.06), far = rng.uniform(1.12, 1.5), t = rng.next() < 0.5 ? near : far;
    if (Math.abs(angdiff(deg * D2R, TV)) < 3 * D2R) continue;
    const r = rng.uniform(0.008, 0.028);
    rocks.push({ c: lift(at(deg, t), r * 0.3), r, squash: [1, 0.7, 1], col: scaleRGB(C.rock, rng.uniform(0.8, 1.15)) });
  }
  rocks.push(...extra);
  const b = new MeshBuilder(1);
  b.add(blob([0, 0, 0], 1, rng), [1, 1, 1]);
  const mesh = new InstancedMesh(b.build(), material, rocks.length);
  rocks.forEach((k, i) => {
    place(mesh, i, k.c, [k.r * k.squash[0] * S, k.r * k.squash[1] * S, k.r * k.squash[2] * S], rng.uniform(0, 6.28));
    mesh.setColorAt(i, col.setRGB(...k.col));
  });
  mesh.computeBoundingSphere();
  return mesh;
}

/** Trail lanterns every 15 degrees. Returns the mesh and where each one's light sits. */
export function createLanterns(terrain: Terrain, material: Material) {
  const spots: V3[] = [];
  for (let deg = -172.5; deg < 180; deg += 15) if (Math.abs(angdiff(deg * D2R, TV)) >= 4 * D2R) spots.push(terrain.at(deg, 1.118));
  const b = new MeshBuilder();
  b.add(limb([0, 0, 0], [0, 0.022, 0], 0.004, 0.004), C.woodD);
  b.add(box([0, 0.026, 0], [0.009, 0.009, 0.009]), [1.0, 0.76, 0.4], { emis: 3.4 });
  const mesh = new InstancedMesh(b.build(), material, spots.length);
  spots.forEach((p, i) => mesh.setMatrixAt(i, m4.makeTranslation(...toWorld(p))));
  mesh.computeBoundingSphere();
  return { mesh, lights: spots.map((p) => lift(p, 0.03)) };
}
