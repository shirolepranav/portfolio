// Each stop's hiker spot and composed camera shots, in the scripts' coordinates like the props.
// Rule from the dock and dockp shots: the hiker and prop sit clear of the panel, in the upper half
// on phones (a sheet covers the lower 53%) and the left two thirds on desktop (a panel covers the right).
import { STOPS, type StopId } from "./config";
import { add, cross, lift, mul, norm, sub, type V3 } from "./core";
import { corridor, referenceShot, v3, type Shot } from "./camera";
import type { Terrain } from "./terrain";

/** Where the hiker stands at a stop and which way it faces. */
export interface Spot { p: V3; face: V3 }

/**
 * A composed shot, relative to the stop's frame: eye and aim as [out, along, up] offsets from the hiker's spot
 * (out points away from the lake, along runs in walking order).
 */
interface Frame { eye: V3; aim: V3; fov: number; shift: [number, number] }
interface Compose { spot: (t: Terrain) => Spot; land: Frame; port: Frame }

const at = (t: Terrain, id: StopId, ring: number, along = 0) => {
  const [, tan] = t.frame(STOPS[id]);
  const p = add(t.at(STOPS[id], ring), mul(tan, along));
  return lift(p, t.ground(p[0], p[2]) - p[1]); // on the ground, wherever the offset lands
};
const out = (t: Terrain, id: StopId) => t.frame(STOPS[id])[0];
const toLake = (t: Terrain, id: StopId) => mul(out(t, id), -1);

const STOP: Record<Exclude<StopId, "dock">, Compose> = {
  // Reading the kiosk board, seen from the lake side.
  trailhead: {
    spot: (t) => ({ p: at(t, "trailhead", 1.115), face: out(t, "trailhead") }),
    land: { eye: [-0.34, 0.1, 0.06], aim: [0.04, 0.01, 0.045], fov: 40, shift: [-0.14, 0.05] },
    port: { eye: [-0.4, 0.04, 0.07], aim: [0.04, 0, 0.02], fov: 58, shift: [0, -0.2] },
  },
  // On the cabin's porch, beside the door.
  cabin: {
    spot: (t) => ({ p: at(t, "cabin", 1.135, 0.03), face: out(t, "cabin") }),
    land: { eye: [-0.4, 0.12, 0.07], aim: [0.06, 0.0, 0.06], fov: 40, shift: [-0.14, 0.05] },
    port: { eye: [-0.48, 0.03, 0.08], aim: [0.06, -0.02, 0.03], fov: 58, shift: [0, -0.2] },
  },
  // At the foot of the tower, looking up at the cab.
  lookout: {
    spot: (t) => ({ p: at(t, "lookout", 1.165, -0.02), face: out(t, "lookout") }),
    land: { eye: [-0.55, 0.14, 0.07], aim: [0.06, 0.0, 0.12], fov: 40, shift: [-0.14, 0.03] },
    port: { eye: [-0.6, 0.04, 0.06], aim: [0.06, 0.02, 0.1], fov: 58, shift: [0, -0.18] },
  },
  // In front of the tents.
  camp: {
    spot: (t) => ({ p: at(t, "camp", 1.13), face: out(t, "camp") }),
    land: { eye: [-0.4, 0.12, 0.07], aim: [0.06, 0.0, 0.05], fov: 40, shift: [-0.14, 0.05] },
    port: { eye: [-0.46, 0.03, 0.08], aim: [0.06, 0, 0.02], fov: 58, shift: [0, -0.2] },
  },
  // Beside the tripod, looking out over the lake like the camera.
  point: {
    spot: (t) => ({ p: at(t, "point", 1.02, 0.035), face: toLake(t, "point") }),
    land: { eye: [0.26, -0.12, 0.08], aim: [-1, 0.25, 0.0], fov: 40, shift: [-0.14, 0.07] },
    port: { eye: [0.28, -0.03, 0.09], aim: [-1, 0.1, -0.02], fov: 60, shift: [0, -0.2] },
  },
  // At the fire, between the benches.
  campfire: {
    spot: (t) => ({ p: at(t, "campfire", 1.125, -0.035), face: out(t, "campfire") }),
    land: { eye: [-0.36, 0.1, 0.07], aim: [0.06, 0.0, 0.03], fov: 40, shift: [-0.14, 0.05] },
    port: { eye: [-0.42, 0.03, 0.08], aim: [0.06, 0, 0.0], fov: 58, shift: [0, -0.2] },
  },
};

/** Each prop's anchor for the HUD (ring, height above the ground) and its size for clicks, from prop_pos in scene.py. */
const PROP: Record<StopId, [number, number, number]> = {
  trailhead: [1.15, 0.1, 0.07], cabin: [1.21, 0.16, 0.1], lookout: [1.23, 0.27, 0.12], camp: [1.19, 0.085, 0.1],
  dock: [0.9, 0.07, 0.12], point: [1.03, 0.11, 0.06], campfire: [1.17, 0.07, 0.07],
};

/** The point the HUD pins a stop's chip or number to, and the radius a click on the prop may land within. */
export function propAnchor(t: Terrain, id: StopId): { p: V3; r: number } {
  const [ring, h, r] = PROP[id];
  return { p: lift(t.at(STOPS[id], ring), h), r };
}

/** The hiker's spot at a stop. The Dock's is the reference pose: at the end of the dock, facing the lake. */
export function stopSpot(t: Terrain, id: StopId): Spot {
  if (id === "dock") {
    const [o, tan] = t.frame(STOPS.dock), a = t.at(STOPS.dock, 1.0);
    const h = (STOPS.dock + 180 + 6) * (Math.PI / 180);
    return { p: lift(add(add(a, mul(o, -0.185)), mul(tan, 0.004)), 0.015), face: [Math.cos(h), 0, Math.sin(h)] };
  }
  return STOP[id].spot(t);
}

/** The composed shot at a stop. The Dock's is the reference dock or dockp shot. */
export function stopShot(t: Terrain, id: StopId, portrait: boolean): Shot {
  if (id === "dock") return referenceShot(portrait ? "dockp" : "dock", t);
  const c = STOP[id], f = portrait ? c.port : c.land, s = stopSpot(t, id), [o, tan] = t.frame(STOPS[id]);
  const rel = ([a, b, h]: V3) => lift(add(add(s.p, mul(o, a)), mul(tan, b)), h);
  const eye = rel(f.eye), tgt = rel(f.aim);
  eye[1] = Math.max(eye[1], t.ground(eye[0], eye[2]) + 0.03);
  const vd = norm([tgt[0] - eye[0], 0, tgt[2] - eye[2]]), right = cross([0, 1, 0], vd);
  const view = (Math.atan2(vd[2], vd[0]) * 180) / Math.PI;
  return {
    eye: v3(eye), target: v3(tgt), fov: f.fov, shift: f.shift, orbit: false,
    // Light from the side and behind, as in the walk shot; front light flattens the props. Eased in on arrival.
    sun: { day: [view + 115, 22], night: [view + 40, 34] },
    clear: corridor(eye, vd, right, Math.min(0.5, Math.hypot(...sub(tgt, eye)) * 0.6)),
    size: portrait ? [780, 1688] : [2160, 1350],
  };
}
