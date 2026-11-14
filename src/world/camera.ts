// Camera set-ups for the reference frames, ported from shot() in reference/scene/shots.py.
// Phase 4 adds the trail-follow camera; for now /lake opens on the walking shot.
import { Vector3 } from "three";
import { T_TRAIL } from "./config";
import { add, cross, lift, mul, norm, sub, toWorld, type V3 } from "./core";
import type { Env } from "./lighting";
import type { Terrain } from "./terrain";

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
function corridor(eye: V3, vd: V3, right: V3, length = 0.5, half = 0.09) {
  const pts: V3[] = [];
  for (let d = 0; d <= length + 0.01; d += 0.08)
    for (const s of [-1, 0, 1]) pts.push(add(add(eye, mul(vd, d)), mul(right, s * half * (0.5 + d))));
  return pts;
}

const flat = (v: V3): V3 => [v[0], 0, v[2]];
const v3 = (p: V3) => new Vector3(...toWorld(p));

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
  if (name.startsWith("walk")) {
    const hd = -13, hp = terrain.at(hd, T_TRAIL), [, tan] = terrain.frame(hd);
    const toFar = norm(flat(sub(terrain.at(112, 1.0), hp)));
    const k = portrait ? 0.5 : 0.4;
    const vd = norm(add(mul(tan, 1 - k), mul(toFar, k))), right = cross([0, 1, 0], vd);
    const eye = portrait
      ? lift(add(sub(hp, mul(vd, 0.225)), mul(right, 0.004)), 0.112)
      : lift(sub(sub(hp, mul(vd, 0.27)), mul(right, 0.03)), 0.125);
    const tgt = portrait ? lift(add(hp, vd), 0.2) : lift(sub(add(hp, vd), mul(right, 0.1)), 0.085);
    return {
      eye: v3(eye), target: v3(tgt), fov: portrait ? 64 : 50, shift: [0, 0],
      sun: { day: [172, 22], night: [150, 40] }, orbit: false, clear: corridor(eye, vd, right), size,
    };
  }
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
