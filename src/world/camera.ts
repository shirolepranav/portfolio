// Camera set-ups for the reference frames, ported from shot() in reference/scene/shots.py,
// and the trail-follow camera, which is the walk shot moved to wherever the hiker stands.
import { CatmullRomCurve3, Vector3 } from "three";
import { D2R, S, T_TRAIL } from "./config";
import { add, cross, lerp, lift, mul, norm, smooth, sub, toWorld, type V3 } from "./core";
import type { Env } from "./lighting";
import type { Terrain } from "./terrain";
import type { Block } from "./props/index";

/** The walking camera's sun and moon (azimuth, elevation in degrees). Stop shots turn theirs at most 40 degrees from it. */
export const WALK_SUN: Shot["sun"] = { day: [172, 22], night: [150, 40] };

export const SHOTS = ["diorama", "dioramap", "walk", "walkp", "dock", "dockp", "vista"] as const;
export type ShotName = (typeof SHOTS)[number];

export interface Shot {
  eye: Vector3; target: Vector3;
  fov: number;                       // vertical, degrees
  shift: [number, number];           // lens shift as a fraction of the frame (right, down)
  sun: { day: [number, number]; night: [number, number] };  // azimuth, elevation in degrees
  tweak?: (env: Env) => void;        // per-shot light changes from the script
  orbit: boolean;                    // floating-island view: backdrop sky, underside drawn
  clear: V3[];                       // points kept free of trees, as the script does per shot
  size: [number, number];            // the reference frame's pixel size
}

/** Points along the view axis that must stay free of trees (corridor() in shots.py). */
export function corridor(eye: V3, vd: V3, right: V3, length = 0.5, half = 0.09) {
  const pts: V3[] = [];
  for (let d = 0; d <= length + 0.01; d += 0.08)
    for (const s of [-1, 0, 1]) pts.push(add(add(eye, mul(vd, d)), mul(right, s * half * (0.5 + d))));
  return pts;
}

const flat = (v: V3): V3 => [v[0], 0, v[2]];
export const v3 = (p: V3) => new Vector3(...toWorld(p));

export function referenceShot(name: ShotName, terrain: Terrain): Shot {
  const portrait = name.endsWith("p");
  const size: [number, number] = portrait ? [780, 1688] : [2160, 1350];
  if (name.startsWith("diorama")) {
    const eye: V3 = portrait ? [0, 5.9, -11.8] : [0, 3.5, -7.2];
    return {
      eye: v3(eye), target: v3([0, -0.1, 0.25]), fov: portrait ? 44 : 36, shift: portrait ? [0, -0.085] : [0.15, -0.01],
      sun: { day: [186, 27], night: [215, 46] }, orbit: true, clear: [], size,
      tweak: (e) => {
        e.fogD = 0.006; e.fogMax = 0.2; e.reflMax = 0.2;
        if (!e.night) { e.sunLight = [e.sunLight[0] * 0.82, e.sunLight[1] * 0.82, e.sunLight[2] * 0.82]; e.exposure = 0.86; }
      },
    };
  }
  if (name.startsWith("walk")) return walkShot(terrain, -13, portrait);
  if (name.startsWith("dock")) {
    const dg = 135, [out, tan] = terrain.frame(dg), a = terrain.at(dg, 1.0), b = sub(a, mul(out, 0.24));
    const eye = portrait ? lift(add(add(a, mul(out, 0.075)), mul(tan, 0.014)), 0.034) : lift(sub(add(a, mul(out, 0.1)), mul(tan, 0.03)), 0.04);
    const tgt = sub(b, mul(out, 1.0));
    tgt[1] = eye[1];
    const vd = norm(flat(sub(tgt, eye))), right = cross([0, 1, 0], vd);
    return {
      eye: v3(eye), target: v3(tgt), fov: portrait ? 62 : 40, shift: portrait ? [0, -0.16] : [-0.14, 0.07],
      sun: { day: [dg + 180 + 12, 14], night: [dg + 180 + (portrait ? 9 : 15), 12.5] }, orbit: false,
      clear: corridor(eye, vd, right, 0.2), size,
      tweak: (e) => {
        if (!e.night) return;
        e.sunLight = [e.sunLight[0] * 0.9, e.sunLight[1] * 0.9, e.sunLight[2] * 0.9]; e.specS = 2.2; e.specP = 420;
      },
    };
  }
  // vista: the wide lake view used for the Highlights hero still
  const hp = terrain.at(-112, 1.045), vd = norm(flat(sub(terrain.at(96, 1.0), hp))), right = cross([0, 1, 0], vd);
  const eye = add(sub(hp, mul(vd, 0.5)), mul(right, 0.1));
  eye[1] = Math.max(hp[1] + 0.115, terrain.ground(eye[0], eye[2]) + 0.05);
  return {
    eye: v3(eye), target: v3(lift(add(eye, vd), 0.065)), fov: 48, shift: [0, 0],
    sun: { day: [101, 24], night: [118, 34] }, orbit: false, clear: corridor(eye, vd, right, 0.65, 0.12), size: [2400, 1200],
  };
}

/**
 * The map: the diorama orbit, turned `spin` degrees round the island. On desktop the island sits centred and high,
 * above the stop list; on phones it is the dioramap frame.
 */
export function mapShot(terrain: Terrain, portrait: boolean, spin = 0): Shot {
  const s = referenceShot(portrait ? "dioramap" : "diorama", terrain), a = spin * D2R;
  const turn = (v: Vector3) => v.applyAxisAngle(UP, a);
  return { ...s, eye: turn(s.eye.clone()), target: turn(s.target.clone()), ...(portrait ? {} : { fov: 50, shift: [0, -0.02] as [number, number] }) };
}
const UP = new Vector3(0, 1, 0);

/**
 * The landing: the diorama frame (dioramap on phones), fitted to the screen as the still is (object-fit: cover),
 * so the live island lands on the still. A wider screen crops the frame's top and bottom, a narrower one its sides.
 * Turned `spin` degrees round the island; `bob` (units) lowers the camera, so the island rises.
 */
export function landingShot(terrain: Terrain, portrait: boolean, aspect: number, spin = 0, bob = 0): Shot {
  const s = referenceShot(portrait ? "dioramap" : "diorama", terrain), a = spin * D2R, k = aspect / (s.size[0] / s.size[1]);
  const place = (v: Vector3) => v.applyAxisAngle(UP, a).setY(v.y - bob * S);
  return {
    ...s, eye: place(s.eye), target: place(s.target),
    fov: k > 1 ? (2 * Math.atan(Math.tan((s.fov * D2R) / 2) / k)) / D2R : s.fov,
    shift: k > 1 ? [s.shift[0], s.shift[1] * k] : [s.shift[0] / k, s.shift[1]],
  };
}

/** The dive's timing: fast off the orbit, slowing all the way down to the hiker. 0 to 1 along the path. */
export const diveEase = (t: number) => 1 - (1 - smooth(0, 1, t)) ** 2.2;

const SKIM = 0.18; // units over the water at the dive's lowest point: about 6 m

/**
 * The dive from the landing orbit `a` to the walking camera `b`, for a hiker at `deg`. One curve that keeps turning
 * the same way: it swings out to the hiker's back over the low hills, skims the water about 6 m up, then runs in
 * along the shore to settle behind the hiker. at(u) is the shot u of the way along it (0 at a, 1 at b).
 * From the map (an orbit view) it is a plain glide between the two.
 */
export function divePath(terrain: Terrain, a: Shot, b: Shot, deg: number) {
  const over = (p: V3, h: number) => v3([p[0], Math.max(0, terrain.ground(p[0], p[2])) + h, p[2]]);
  // Through a point high over the hills 52 degrees behind the hiker, then low over the water 28 degrees behind.
  // Tuned with clearance() in debug.ts: no trees, props or animals in the way, wherever the hiker stands.
  const pts = b.orbit ? [a.eye, b.eye] : [a.eye, over(terrain.at(deg - 52, 1.75), 0.42), over(terrain.at(deg - 28, 0.72), SKIM), b.eye];
  const curve = new CatmullRomCurve3(pts, false, "centripetal");
  return {
    a, b, curve,
    at(u: number): Shot {
      const eye = curve.getPointAt(u), target = a.target.clone().lerp(b.target, u), e = toScript(eye);
      const gap = e[1] - terrain.ground(e[0], e[2]);
      eye.y = Math.max(eye.y, (terrain.ground(e[0], e[2]) + 0.03) * S); // never below a metre off the ground
      const vd = norm([target.x - eye.x, 0, -(target.z - eye.z)]);
      return {
        ...b, eye, target, fov: lerp(a.fov, b.fov, u), shift: [lerp(a.shift[0], b.shift[0], u), lerp(a.shift[1], b.shift[1], u)],
        orbit: u < 0.5 ? a.orbit : b.orbit,
        // Low down, trees clear out of the way as for the other flights; up high, the forest stays whole.
        clear: u === 1 ? b.clear : gap < 0.3 ? corridor(e, vd, cross([0, 1, 0], vd), 0.5) : [],
      };
    },
  };
}
export type DivePath = ReturnType<typeof divePath>;
const toScript = (v: Vector3): V3 => [v.x / S, v.y / S, -v.z / S];

/**
 * The walking camera for a hiker at `deg`: behind and above, looking between the trail ahead and the far shore
 * (40% toward the shore in landscape, 50% in portrait). At -13 degrees it is exactly the walk and walkp shots.
 * look turns the whole rig round the hiker, in degrees (positive looks right). slide moves the eye toward the
 * lake without changing where it aims, to step past props on the trail's outer side.
 * The camera always faces the walking direction, even when the hiker walks back toward it.
 */
export function walkShot(terrain: Terrain, deg: number, portrait: boolean, look = 0, slide = 0): Shot {
  const hp = terrain.at(deg, T_TRAIL), [out, tan] = terrain.frame(deg);
  const toFar = norm(flat(sub(terrain.at(deg + 125, 1.0), hp))); // the reference's far point (112) is 125 degrees ahead
  const k = portrait ? 0.5 : 0.4;
  const a = -look * D2R, f = norm(add(mul(tan, 1 - k), mul(toFar, k)));
  const vd: V3 = [f[0] * Math.cos(a) - f[2] * Math.sin(a), 0, f[0] * Math.sin(a) + f[2] * Math.cos(a)];
  const right = cross([0, 1, 0], vd);
  const eye0 = portrait
    ? lift(add(sub(hp, mul(vd, 0.225)), mul(right, 0.004)), 0.112)
    : lift(sub(sub(hp, mul(vd, 0.27)), mul(right, 0.03)), 0.125);
  const eye = sub(eye0, mul(out, slide));
  let tgt = portrait ? lift(add(hp, vd), 0.2) : lift(sub(add(hp, vd), mul(right, 0.1)), 0.085);
  if (slide) {
    // Turn the aim so the hiker keeps the same place on screen as before the slide.
    const yaw = (a: V3, b: V3) => Math.atan2(b[2] - a[2], b[0] - a[0]);
    const y = yaw(eye, hp) - (yaw(eye0, hp) - yaw(eye0, tgt)), d = Math.hypot(tgt[0] - eye0[0], tgt[2] - eye0[2]);
    tgt = [eye[0] + Math.cos(y) * d, tgt[1], eye[2] + Math.sin(y) * d];
  }
  // Keep the eye a metre above the ground, and lift it until it can see the hiker's chest over any rise.
  eye[1] = Math.max(eye[1], terrain.ground(eye[0], eye[2]) + 0.03);
  const chest = lift(hp, 0.035);
  for (let i = 1; i < 8; i++) {
    const s = i / 8, p = add(mul(eye, 1 - s), mul(chest, s)), gap = terrain.ground(p[0], p[2]) + 0.008 - p[1];
    if (gap > 0) eye[1] += gap / (1 - s);
  }
  return {
    eye: v3(eye), target: v3(tgt), fov: portrait ? 64 : 50, shift: [0, 0],
    sun: WALK_SUN, orbit: false, clear: slide ? corridor(eye, norm(flat(sub(tgt, eye))), right) : corridor(eye, vd, right), size: portrait ? [780, 1688] : [2160, 1350],
  };
}

/** True if a point is inside a prop's space, plus a margin. Script coordinates. */
function inBlock(p: V3, b: Block, m = 0.012) {
  const [ax, , az] = b.along ?? [1, 0, 0], dx = p[0] - b.c[0], dz = p[2] - b.c[2];
  const u = Math.abs(dx * ax + dz * az), w = Math.abs(dz * ax - dx * az), h = p[1] - b.c[1];
  const [lo, eave, ridge] = b.y, roof = eave + (ridge - eave) * Math.max(0, 1 - w / b.half[1]);
  return u < b.half[0] + m && w < b.half[1] + m && h > lo - m && h < roof + m;
}

/** True if a prop stands in the camera's way: at the eye, or on the line from the eye to the hiker. */
export function blocked(eye: V3, hiker: V3, blocks: Block[]) {
  const chest = lift(hiker, 0.035);
  for (const b of blocks) {
    if (Math.hypot(hiker[0] - b.c[0], hiker[2] - b.c[2]) > 0.6) continue;
    // The camera's end of the line only: the hiker may brush past a prop it walks beside.
    for (let i = 0; i <= (b.see ? 1 : 8); i++) if (inBlock(add(mul(eye, 1 - i / 10), mul(chest, i / 10)), b)) return true;
  }
  return false;
}

/**
 * How far to slide the walking camera toward the lake (units) so no prop stands at the eye or between it and
 * the hiker. Every prop taller than the camera stands on the outer side of the trail.
 */
export function clearSlide(terrain: Terrain, deg: number, portrait: boolean, look: number, blocks: Block[]) {
  const hp = terrain.at(deg, T_TRAIL);
  if (!blocks.some((b) => Math.hypot(hp[0] - b.c[0], hp[2] - b.c[2]) < 0.6)) return 0;
  for (let s = 0; s < 0.25; s += 0.01) {
    const e = walkShot(terrain, deg, portrait, look, s).eye;
    if (!blocked([e.x / S, e.y / S, -e.z / S], hp, blocks)) return s;
  }
  return 0.25;
}

/**
 * One frame of the camera's slide toward the lake. It eases toward the least clear slide a little ahead
 * (out quickly, back slowly), and if that lands on a blocked spot it takes the nearest clear one instead.
 */
export function stepSlide(terrain: Terrain, deg: number, dir: number, portrait: boolean, look: number, blocks: Block[], cur: number, dt: number) {
  const target = Math.max(...[0, 2, 4, 6].map((k) => clearSlide(terrain, deg + k * dir, portrait, look, blocks)));
  const s = cur + (target - cur) * (1 - Math.exp(-dt / (target > cur ? 0.2 : 0.5)));
  const hp = terrain.at(deg, T_TRAIL);
  const clear = (v: number) => {
    const e = walkShot(terrain, deg, portrait, look, v).eye;
    return !blocked([e.x / S, e.y / S, -e.z / S], hp, blocks);
  };
  if (clear(s)) return s;
  for (let d = 0.005; d < 0.25; d += 0.005) {
    if (clear(s + d)) return s + d;
    if (s - d >= 0 && clear(s - d)) return s - d;
  }
  return s;
}
