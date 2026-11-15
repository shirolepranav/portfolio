// Small math, noise, random and mesh helpers. Ported from reference/scene/core.py.
// Layout code works in the scripts' own coordinates; toWorld() converts once, when vertices are written.
import { BufferAttribute, BufferGeometry } from "three";
import { S, type RGB } from "./config";

export type V3 = [number, number, number];
/** A point kept free of trees, with its own clearing radius as an optional fourth number. */
export type ClearPoint = V3 | [number, number, number, number];

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => mul(a, 1 / (len(a) + 1e-12));
export const lift = (a: V3, y: number): V3 => [a[0], a[1] + y, a[2]]; // the scripts' "p + [0, y, 0]"
export const scaleRGB = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

// The scripts' renderer is mirrored next to three.js, so z flips here. Scale turns units into metres.
export const toWorld = (p: V3, s = S): V3 => [p[0] * s, p[1] * s, -p[2] * s];

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
/** Signed angle difference wrapped to [-pi, pi). */
export const angdiff = (a: number, b: number) => {
  const d = (a - b + Math.PI) % (2 * Math.PI);
  return (d < 0 ? d + 2 * Math.PI : d) - Math.PI;
};

/** Seeded random numbers (mulberry32), so the island is the same on every visit. */
export function makeRng(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, uniform: (a: number, b: number) => a + (b - a) * next(), int: (n: number) => Math.floor(next() * n) };
}
export type Rng = ReturnType<typeof makeRng>;

// Smooth value noise in [0, 1]. A 32-bit version of the script's hash: same look, not the same numbers.
function hash(ix: number, iz: number, seed: number) {
  let n = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 982451653)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n & 0xffffff) / 0xffffff;
}
export function vnoise(x: number, z: number, seed = 0) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
}
export function fbm(x: number, z: number, octaves = 4, seed = 0) {
  let s = 0, amp = 0.5, f = 1, tot = 0;
  for (let o = 0; o < octaves; o++) {
    s += amp * vnoise(x * f, z * f, seed + o * 17); tot += amp;
    amp *= 0.5; f *= 2.03;
  }
  return s / tot;
}

// ---------- shapes: vertices plus triangles, in script coordinates ----------
export interface Shape { V: V3[]; F: number[][] }

const BOX_F = [[0, 1, 2], [0, 2, 3], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
const BOX_QUADS = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];

/** Box running from A to B: w along `side`, d across. The far end is scaled by taper. */
export function limb(A: V3, B: V3, w: number, d: number, side: V3 = [1, 0, 0], taper = 1): Shape {
  const ax = norm(sub(B, A));
  const sp = sub(side, mul(ax, dot(side, ax)));
  const s = len(sp) < 1e-6 ? norm(cross(ax, [0, 0, 1])) : norm(sp);
  const t = cross(ax, s);
  const V: V3[] = [];
  for (const [P, k] of [[A, 1], [B, taper]] as const)
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]])
      V.push(add(add(P, mul(s, sx * w * 0.5 * k)), mul(t, sz * d * 0.5 * k)));
  return { V, F: BOX_F };
}

/** Upright box centred at c, size (sx, sy, sz), turned about y. */
export function box(c: V3, size: V3, yaw = 0, taper = 1): Shape {
  const side: V3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
  return limb(lift(c, -size[1] / 2), lift(c, size[1] / 2), size[0], size[2], side, taper);
}

/** Cone, open at the base unless cap. tip > 0 blunts the point: a small ring at (1 - tip) of the height. */
export function cone(base: V3, r: number, h: number, sides = 6, rot = 0, tip = 0, cap = false): Shape {
  const ring = (y: number, rr: number) =>
    Array.from({ length: sides }, (_, i) => {
      const a = rot + (i * 2 * Math.PI) / sides;
      return add(base, [Math.cos(a) * rr, y, Math.sin(a) * rr]) as V3;
    });
  const V = ring(0, r), F: number[][] = [];
  if (tip > 0) {
    V.push(...ring(h * (1 - tip), r * tip * 1.1));
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      F.push([i, j, sides + j], [i, sides + j, sides + i]);
    }
  }
  const top = tip > 0 ? sides : 0, apex = V.length;
  V.push(lift(base, h * (tip > 0 ? 1 - tip * 0.25 : 1)));
  for (let i = 0; i < sides; i++) F.push([top + i, top + ((i + 1) % sides), apex]);
  if (cap) {
    V.push(base);
    for (let i = 0; i < sides; i++) F.push([i, (i + 1) % sides, apex + 1]);
  }
  return { V, F };
}

/** Triangular prism (roof). c = centre of the base; the ridge runs along `length`. */
export function gable(c: V3, length: number, width: number, height: number, yaw = 0): Shape {
  const L: V3 = [Math.cos(yaw) * length / 2, 0, Math.sin(yaw) * length / 2];
  const W: V3 = [-Math.sin(yaw) * width / 2, 0, Math.cos(yaw) * width / 2];
  const top = lift(c, height);
  return {
    V: [sub(sub(c, L), W), sub(add(c, L), W), add(add(c, L), W), add(sub(c, L), W), sub(top, L), add(top, L)],
    F: [[0, 1, 5], [0, 5, 4], [3, 2, 5], [3, 5, 4], [0, 3, 4], [1, 2, 5], [0, 1, 2], [0, 2, 3]],
  };
}

/** Low-poly jittered sphere (boulders). */
export function blob(c: V3, r: number, rng: Rng, rings = 3, seg = 6, squash: V3 = [1, 1, 1], jit = 0.22): Shape {
  const V: V3[] = [lift(c, r * squash[1])];
  for (let i = 1; i < rings; i++) {
    const phi = (Math.PI * i) / rings;
    for (let j = 0; j < seg; j++) {
      const th = (2 * Math.PI * (j + 0.5 * (i % 2))) / seg;
      const p: V3 = [Math.sin(phi) * Math.cos(th) * squash[0], Math.cos(phi) * squash[1], Math.sin(phi) * Math.sin(th) * squash[2]];
      V.push(add(c, mul(p, r * (1 + rng.uniform(-jit, jit)))));
    }
  }
  V.push(lift(c, -r * squash[1]));
  const F: number[][] = [];
  for (let j = 0; j < seg; j++) F.push([0, 1 + j, 1 + ((j + 1) % seg)]);
  for (let i = 0; i < rings - 2; i++) {
    const a0 = 1 + i * seg, b0 = a0 + seg;
    for (let j = 0; j < seg; j++) {
      const jn = (j + 1) % seg;
      F.push([a0 + j, a0 + jn, b0 + j], [a0 + jn, b0 + jn, b0 + j]);
    }
  }
  const last = 1 + (rings - 2) * seg, bot = V.length - 1;
  for (let j = 0; j < seg; j++) F.push([last + j, last + ((j + 1) % seg), bot]);
  return { V, F };
}

/** Chamfers the edges of a limb() or box() by about `b`, for the props' lightly bevelled look. */
export function bevel(shape: Shape, b: number): Shape {
  const P = shape.V;
  let minEdge = Infinity;
  for (const q of BOX_QUADS) for (let j = 0; j < 4; j++) minEdge = Math.min(minEdge, len(sub(P[q[j]], P[q[(j + 1) % 4]])));
  b = Math.min(b, minEdge * 0.2);
  const V: V3[] = [], at = new Map<string, number>(); // "quad:corner" -> inset vertex
  BOX_QUADS.forEach((q, qi) => q.forEach((c, j) => {
    const prev = P[q[(j + 3) % 4]], next = P[q[(j + 1) % 4]];
    at.set(`${qi}:${c}`, V.push(add(add(P[c], mul(norm(sub(prev, P[c])), b)), mul(norm(sub(next, P[c])), b))) - 1);
  }));
  const F: number[][] = [];
  const quad = (a: number, b2: number, c: number, d: number) => F.push([a, b2, c], [a, c, d]);
  BOX_QUADS.forEach((q, qi) => quad(...(q.map((c) => at.get(`${qi}:${c}`)!) as [number, number, number, number])));
  const edges = new Map<string, number[]>();
  BOX_QUADS.forEach((q, qi) => q.forEach((c, j) => {
    const k = [c, q[(j + 1) % 4]].sort().join("-");
    edges.set(k, [...(edges.get(k) ?? []), qi]);
  }));
  for (const [k, [qa, qb]] of edges) {
    const [c1, c2] = k.split("-");
    quad(at.get(`${qa}:${c1}`)!, at.get(`${qa}:${c2}`)!, at.get(`${qb}:${c2}`)!, at.get(`${qb}:${c1}`)!);
  }
  for (let c = 0; c < 8; c++) F.push(BOX_QUADS.flatMap((q, qi) => (q.includes(c) ? [at.get(`${qi}:${c}`)!] : [])));
  return { V, F };
}

// ---------- mesh builder ----------
type Orient = "out" | "up" | "radial";
type PerFace<T> = T | T[];
const pick = <T,>(v: PerFace<T>, i: number, isList: boolean) => (isList ? (v as T[])[i] : (v as T));

/**
 * Collects flat-coloured triangles into one geometry. Faces are turned to face outward
 * (from the part's centre), up, or away from the island's axis, as in core.py's Mesh.add.
 * Extra attribute "fx": x = emissive strength, y = wrap lighting (snow).
 */
export class MeshBuilder {
  private pos: number[] = [];
  private col: number[] = [];
  private fx: number[] = [];
  constructor(private scale = S) {}

  add(shape: Shape, color: PerFace<RGB>, opts: { emis?: PerFace<number>; wrap?: PerFace<number>; orient?: Orient } = {}) {
    const { emis = 0, wrap = 0, orient = "out" } = opts;
    const W = shape.V.map((p) => toWorld(p, this.scale));
    const mean = mul(W.reduce(add, [0, 0, 0]), 1 / W.length);
    const colList = typeof color[0] !== "number", emisList = Array.isArray(emis), wrapList = Array.isArray(wrap);
    shape.F.forEach((f, i) => {
      let [a, b, c] = [W[f[0]], W[f[1]], W[f[2]]];
      const n = cross(sub(b, a), sub(c, a));
      const cen = mul(add(add(a, b), c), 1 / 3);
      const ref: V3 = orient === "up" ? [0, 1, 0] : orient === "out" ? sub(cen, mean) : [cen[0], -0.3 * this.scale, cen[2]];
      if (dot(n, ref) < 0) [b, c] = [c, b];
      const rgb = pick(color as PerFace<RGB>, i, colList);
      const e = pick(emis, i, emisList), w = pick(wrap, i, wrapList);
      for (const p of [a, b, c]) {
        this.pos.push(...p); this.col.push(...rgb); this.fx.push(e, w);
      }
    });
  }

  build() {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute("color", new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute("fx", new BufferAttribute(new Float32Array(this.fx), 2));
    g.computeVertexNormals(); // non-indexed, so these are flat face normals
    return g;
  }
}
