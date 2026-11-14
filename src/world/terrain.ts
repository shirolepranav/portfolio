// The island: lake, shore, trail, meadows and peaks, plus the rock underside and the waterfall.
// Ported from World._terrain and World._skirt in reference/scene/scene.py.
import Delaunator from "delaunator";
import { C, D2R, NA, PEAKS, RIM, T_TRAIL, TS, TV, type RGB } from "./config";
import { MeshBuilder, add, angdiff, fbm, lerp, lift, limb, makeRng, mul, scaleRGB, smooth, sub, vnoise, cross, norm, type Shape, type V3 } from "./core";

export const lakeR = (th: number) => 1 + 0.1 * Math.sin(2 * th + 0.6) + 0.06 * Math.sin(3 * th + 2.1) + 0.035 * Math.sin(5 * th + 4.0);

export function radius(t: number, th: number) {
  const w = smooth(1.25, 2.3, t);
  return t * (lakeR(th) * (1 - w) + w);
}

/** Ring value t for a world radius r at angle th (inverse of radius()). */
function invRadius(r: number, th: number) {
  let t = r / lakeR(th);
  for (let i = 0; i < 8; i++) {
    const w = smooth(1.25, 2.3, t);
    t = r / (lakeR(th) * (1 - w) + w);
  }
  return t;
}

function massif(th: number) {
  let m = 0.1;
  for (const [deg, h, w] of PEAKS) m += h * Math.exp(-((angdiff(th, deg * D2R) / (w * D2R)) ** 2));
  m *= 0.86 + 0.28 * vnoise(th * 7, 3.3, 5);
  return m * (1 - 0.93 * Math.exp(-((angdiff(th, TV) / (12 * D2R)) ** 2)));
}

function terrainY(t: number, th: number, x: number, z: number) {
  if (t <= 1) return 0;
  let y = smooth(1.0, 1.065, t) * 0.012 + smooth(1.105, 1.7, t) * 0.08;
  y += 0.06 * (fbm(x * 3.1, z * 3.1, 3, 11) - 0.5) * smooth(1.16, 1.45, t);
  const tp = 1.9 + 0.12 * (vnoise(th * 4, 1.7, 9) - 0.5);
  const up = smooth(1.3, tp, t) ** 1.2;
  const down = 1 - 0.6 * smooth(tp, 2.45, t);
  const rid = 1 - Math.abs(2 * fbm(x * 1.7 + 5.2, z * 1.7 - 3.1, 4, 23) - 1);
  return y + massif(th) * up * down * (0.74 + 0.5 * rid);
}

// Height lookup: the finished mesh rasterised into a grid, sampled bilinearly.
const HM = 512, HM_EXT = 2.5, HM_CELL = (2 * HM_EXT) / HM;

function rasterHeights(V: V3[], F: number[][]) {
  const h = new Float32Array(HM * HM);
  for (const [i0, i1, i2] of F) {
    const a = V[i0], b = V[i1], c = V[i2];
    const gx = (x: number) => (x + HM_EXT) / HM_CELL - 0.5;
    const ax = gx(a[0]), az = gx(a[2]), bx = gx(b[0]), bz = gx(b[2]), cx = gx(c[0]), cz = gx(c[2]);
    const area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    if (Math.abs(area) < 1e-12) continue;
    const x0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx))), x1 = Math.min(HM - 1, Math.floor(Math.max(ax, bx, cx)));
    const z0 = Math.max(0, Math.ceil(Math.min(az, bz, cz))), z1 = Math.min(HM - 1, Math.floor(Math.max(az, bz, cz)));
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const w0 = ((bx - x) * (cz - z) - (bz - z) * (cx - x)) / area;
        const w1 = ((cx - x) * (az - z) - (cz - z) * (ax - x)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6) h[z * HM + x] = w0 * a[1] + w1 * b[1] + w2 * c[1];
      }
  }
  return (x: number, z: number) => {
    const fx = Math.min(HM - 1.001, Math.max(0, (x + HM_EXT) / HM_CELL - 0.5));
    const fz = Math.min(HM - 1.001, Math.max(0, (z + HM_EXT) / HM_CELL - 0.5));
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, k = iz * HM + ix;
    return lerp(lerp(h[k], h[k + 1], tx), lerp(h[k + HM], h[k + HM + 1], tx), tz);
  };
}

export type Terrain = ReturnType<typeof createTerrain>;

export function createTerrain(seed = 7) {
  const rng = makeRng(seed);
  const dth = (2 * Math.PI) / NA;

  // 1) Lake, shore and trail: a tidy polar grid so the shoreline and path are clean ribbons.
  const TI = TS.slice(0, 10), nr = TI.length;
  const V: V3[] = [], creekV: boolean[] = [];
  for (let i = 0; i < nr; i++)
    for (let j = 0; j < NA; j++) {
      const t = TI[i], th = j * dth - Math.PI, r = radius(t, th);
      const x = r * Math.cos(th), z = r * Math.sin(th);
      const creek = t > 1 && Math.abs(angdiff(th, TV)) < 1.2 * dth;
      V.push([x, creek ? 0.003 : terrainY(t, th, x, z), z]);
      creekV.push(creek);
    }
  const F: number[][] = [], ring: number[] = [];
  for (let i = 0; i < nr - 1; i++)
    for (let j = 0; j < NA; j++) {
      const jn = (j + 1) % NA, a = i * NA + j, b = i * NA + jn, c = (i + 1) * NA + j, d = (i + 1) * NA + jn;
      if ((i + j) % 2 === 0) F.push([a, b, c], [b, d, c]);
      else F.push([a, b, d], [a, d, c]);
      ring.push(i, i);
    }

  // 2) Land: scattered points, sparse on the peaks for big chunky facets, joined by Delaunay.
  const tIn = TI[nr - 1];
  const lt: number[] = [], lth: number[] = [], isCreek: boolean[] = [];
  for (let j = 0; j < NA; j++) { lt.push(tIn); lth.push(j * dth - Math.PI); isCreek.push(creekV[(nr - 1) * NA + j]); }
  // Poisson-style rejection: a point needs room of half the summed spacing. A coarse grid keeps it fast.
  const cell = 0.07, cells = new Map<number, number[]>(); // cell key -> flat [x, z, spacing, ...]
  const key = (cx: number, cz: number) => (cx + 100) * 1000 + cz + 100;
  const put = (x: number, z: number, sp: number) => {
    const k = key(Math.floor(x / cell), Math.floor(z / cell));
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k)!.push(x, z, sp);
  };
  for (let j = 0; j < NA; j++) put(V[(nr - 1) * NA + j][0], V[(nr - 1) * NA + j][2], 0.03);
  for (let k = 0; k < 60000; k++) {
    const t = rng.uniform(1.16, RIM - 0.05), th = rng.uniform(-Math.PI, Math.PI);
    const r = radius(t, th), x = r * Math.cos(th), z = r * Math.sin(th);
    if (Math.abs(angdiff(th, TV)) * r <= 0.05) continue;
    const sp = lerp(0.042, 0.135, smooth(1.2, 1.85, t));
    let free = true;
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let dx = -2; dx <= 2 && free; dx++)
      for (let dz = -2; dz <= 2 && free; dz++) {
        const q = cells.get(key(cx + dx, cz + dz));
        if (q) for (let i = 0; i < q.length; i += 3)
          if ((q[i] - x) ** 2 + (q[i + 1] - z) ** 2 < (0.5 * (q[i + 2] + sp)) ** 2) { free = false; break; }
      }
    if (!free) continue;
    put(x, z, sp); lt.push(t); lth.push(th); isCreek.push(false);
  }
  // Creek banks (two rows) and the rim ring.
  for (const s of [-1, 1])
    for (let t = 1.19; t < RIM - 0.02; t += 0.05) { lt.push(t); lth.push(TV + (s * 0.026) / radius(t, TV)); isCreek.push(true); }
  const rimTh = Array.from({ length: 110 }, (_, k) => (k * 2 * Math.PI) / 110 - Math.PI)
    .filter((a) => Math.abs(angdiff(a, TV)) > 0.02)
    .concat([TV - 0.026 / RIM, TV + 0.026 / RIM])
    .sort((a, b) => a - b);
  const nRand = lt.length;
  for (const a of rimTh) { lt.push(RIM); lth.push(a); isCreek.push(Math.abs(angdiff(a, TV)) < (0.03 / RIM) * 1.2); }

  const Vl: V3[] = lt.map((t, k) => {
    const th = lth[k], r = radius(t, th), x = r * Math.cos(th), z = r * Math.sin(th);
    if (isCreek[k]) return [x, 0.003, z];
    const jit = k >= nRand ? 0 : rng.uniform(-1, 1) * 0.05 * smooth(1.45, 1.8, t) * Math.min(massif(th), 1);
    return [x, terrainY(t, th, x, z) + jit, z];
  });
  const del = new Delaunator(Vl.flatMap((p) => [p[0], p[2]]));
  const base = V.length;
  for (let k = 0; k < del.triangles.length; k += 3) {
    const [a, b, c] = [del.triangles[k], del.triangles[k + 1], del.triangles[k + 2]];
    const cx = (Vl[a][0] + Vl[b][0] + Vl[c][0]) / 3, cz = (Vl[a][2] + Vl[b][2] + Vl[c][2]) / 3;
    if (invRadius(Math.hypot(cx, cz), Math.atan2(cz, cx)) <= tIn + 0.002) continue; // inside the shore grid
    F.push([base + a, base + b, base + c]); ring.push(99);
  }
  V.push(...Vl);
  creekV.push(...isCreek);
  const ground = rasterHeights(V, F);

  // 3) Colours per face: meadow, rock, snow by height, slope and noise; then the shore ribbons.
  const g1: RGB = [0.3, 0.46, 0.33], g2: RGB = [0.55, 0.57, 0.31], g3: RGB = [0.72, 0.5, 0.38];
  const landF: number[][] = [], landCol: RGB[] = [], landWrap: number[] = [], landCen: V3[] = [];
  const waterF: number[][] = [];
  F.forEach((f, i) => {
    if (ring[i] < 5) { waterF.push(f); return; }
    const [a, b, c] = [V[f[0]], V[f[1]], V[f[2]]];
    const n = norm(cross(sub(b, a), sub(c, a)));
    const ny = Math.abs(n[1]), cen = mul(add(add(a, b), c), 1 / 3), cy = cen[1];
    const nz = fbm(cen[0] * 2.3, cen[2] * 2.3, 3, 41), nz2 = vnoise(cen[0] * 6.1, cen[2] * 6.1, 77);
    let col: RGB = nz2 > 0.62 ? g3 : nz > 0.5 ? g2 : g1, wrap = 0;
    if (ny < 0.76) col = nz2 > 0.5 ? [0.58, 0.45, 0.42] : C.rock;
    const snowline = 0.25 + 0.12 * nz;
    if (cy > snowline) {
      if (ny > 0.5 || (ny > 0.24 && nz2 < 0.76)) { col = C.snow; wrap = 1; }
      else col = nz2 > 0.5 ? [0.4, 0.34, 0.4] : [0.5, 0.4, 0.42];
    } else if (cy > snowline - 0.1 && ny > 0.83 && nz2 > 0.45) { col = C.snow; wrap = 1; }
    if (ring[i] === 8) col = scaleRGB(g1, 1.08);
    if (ring[i] === 7) col = C.trail;
    if (ring[i] === 5 || ring[i] === 6) col = C.sand;
    if (f.every((k) => creekV[k])) col = [0.3, 0.8, 0.78];
    landF.push(f); landCol.push(scaleRGB(col, 1 + rng.uniform(-0.06, 0.06))); landWrap.push(wrap); landCen.push(cen);
  });

  /** Ground position at lake angle `deg` (degrees) and ring value t. */
  const at = (deg: number, t: number): V3 => {
    const th = deg * D2R, r = radius(t, th), x = r * Math.cos(th), z = r * Math.sin(th);
    return [x, t > 1 ? ground(x, z) : 0, z];
  };
  /** Outward and counter-clockwise tangent directions at an angle. */
  const frame = (deg: number): [V3, V3] => {
    const th = deg * D2R;
    return [[Math.cos(th), 0, Math.sin(th)], [-Math.sin(th), 0, Math.cos(th)]];
  };

  return {
    rng, ground, at, frame,
    /** Land faces into `mesh`. shade(x, z) darkens faces, e.g. the forest floor under trees. */
    addLand(mesh: MeshBuilder, shade: (x: number, z: number) => number) {
      mesh.add({ V, F: landF }, landCol.map((c, i) => scaleRGB(c, shade(landCen[i][0], landCen[i][2]))), { wrap: landWrap, orient: "up" });
    },
    /** The lake surface, faces up. */
    water() {
      const m = new MeshBuilder();
      m.add({ V, F: waterF }, [1, 1, 1], { orient: "up" });
      return m.build();
    },
    /** Cut sides, tapered rock underside and the waterfall: only seen from the orbit views. */
    skirt() {
      const m = new MeshBuilder();
      const rim = Vl.slice(-rimTh.length), baseY = -0.16, rows = 3;
      const radial = (V2: V3[], F2: number[][], col: RGB[] | RGB, emis = 0) => m.add({ V: V2, F: F2 }, col, { orient: "radial", emis });
      const strip = (a: V3[], b: V3[]) => {
        const k = a.length, F2: number[][] = [];
        for (let j = 0; j < k; j++) F2.push([j, (j + 1) % k, k + j], [(j + 1) % k, k + ((j + 1) % k), k + j]);
        return { V: [...a, ...b], F: F2 };
      };
      const strata: RGB[] = [[0.55, 0.38, 0.36], [0.44, 0.31, 0.34], [0.33, 0.24, 0.29]];
      let prev = rim;
      for (let k = 1; k <= rows; k++) {
        const next = rim.map((p): V3 => [p[0], p[1] * (1 - k / rows) + baseY * (k / rows), p[2]]);
        const s = strip(prev, next);
        radial(s.V, s.F, s.F.map(() => scaleRGB(strata[k - 1], 1 + rng.uniform(-0.07, 0.07))));
        prev = next;
      }
      // Chunky underside: jittered rings tapering to a point.
      const seg = 40, lv = [[1.0, baseY], [0.97, -0.55], [0.88, -1.05], [0.72, -1.55], [0.5, -2.0], [0.24, -2.38]];
      const cols: RGB[] = [[0.4, 0.28, 0.31], [0.5, 0.34, 0.33], [0.36, 0.26, 0.3], [0.45, 0.31, 0.32], [0.3, 0.22, 0.27]];
      let last: V3[] | null = null;
      lv.forEach(([s, y], li) => {
        const ringV = Array.from({ length: seg }, (_, j): V3 => {
          const a = (j * 2 * Math.PI) / seg + 0.07 * li;
          const rr = RIM * s * (1 + (li > 0 ? rng.uniform(-0.06, 0.06) : 0));
          return [rr * Math.cos(a), y + (li > 0 ? rng.uniform(-0.09, 0.09) : 0), rr * Math.sin(a)];
        });
        if (last) {
          const st = strip(last, ringV);
          radial(st.V, st.F, st.F.map(() => scaleRGB(cols[li - 1], 1 + rng.uniform(-0.09, 0.09))));
        }
        last = ringV;
      });
      const apex: V3 = [0.05, -2.62, -0.03];
      radial([...last!, apex], Array.from({ length: seg }, (_, j) => [j, (j + 1) % seg, seg]), [0.27, 0.2, 0.25]);
      // Waterfall spilling off the rim where the creek leaves.
      const tang: V3 = [-Math.sin(TV), 0, Math.cos(TV)], out: V3 = [Math.cos(TV), 0, Math.sin(TV)];
      const p = mul(out, RIM + 0.004), ys = [0.004, -0.3, -0.75, -1.3, -1.9], wv: V3[] = [], wf: number[][] = [], wc: RGB[] = [];
      ys.forEach((y, k) => {
        const wk = 0.055 * (1 + 0.3 * k), o = mul(out, 0.025 * k);
        wv.push(lift(sub(add(p, o), mul(tang, wk / 2)), y), lift(add(add(p, o), mul(tang, wk / 2)), y));
      });
      for (let k = 0; k < ys.length - 1; k++) {
        wf.push([2 * k, 2 * k + 1, 2 * k + 2], [2 * k + 1, 2 * k + 3, 2 * k + 2]);
        const cc: RGB = [lerp(0.5, 0.97, k / 3), lerp(0.9, 0.99, k / 3), lerp(0.88, 1.0, k / 3)];
        wc.push(cc, cc);
      }
      radial(wv, wf, wc, 0.25);
      return m.build();
    },
    /** Footbridge where the trail crosses the creek. */
    addBridge(mesh: MeshBuilder) {
      const deg = TV / D2R, [out, tan] = frame(deg), c = at(deg, T_TRAIL);
      c[1] = 0.016;
      const wood = (s: Shape, col: RGB) => mesh.add(s, col);
      wood(limb(sub(c, mul(tan, 0.05)), add(c, mul(tan, 0.05)), 0.042, 0.007, out), C.wood);
      for (const s of [-1, 1]) {
        const e = add(c, mul(out, s * 0.021));
        wood(limb(lift(sub(e, mul(tan, 0.05)), 0.022), lift(add(e, mul(tan, 0.05)), 0.022), 0.004, 0.004, out), C.woodD);
        for (const k of [-1, 0, 1]) wood(limb(add(e, mul(tan, k * 0.045)), lift(add(e, mul(tan, k * 0.045)), 0.022), 0.004, 0.004, out), C.woodD);
      }
    },
  };
}
