// The seven stop props, one file each, merged into the world's static mesh.
import type { LightGroup, RGB } from "../config";
import { bevel, type MeshBuilder, type Shape, type V3 } from "../core";
import type { Rock } from "../flora";
import type { Terrain } from "../terrain";
import { kiosk } from "./kiosk";
import { cabin } from "./cabin";
import { lookout } from "./lookout";
import { camp } from "./camp";
import { dock } from "./dock";
import { point } from "./point";
import { campfire } from "./campfire";

type AddOpts = Parameters<MeshBuilder["add"]>[2];

export interface PropContext {
  terrain: Terrain;
  /** Adds a shape as it is. */
  solid(shape: Shape, color: RGB, opts?: AddOpts): void;
  /** Adds a box-shaped part with lightly bevelled edges. */
  part(shape: Shape, color: RGB, opts?: AddOpts): void;
  /** A warm point light that comes on at night. */
  light(p: V3, color: RGB, strength: number, radius: number, group: LightGroup): void;
  /** A rock for the shared instanced rock mesh. */
  rock(r: Rock): void;
}

export interface PropCounts { tents: number; canoes: number }

export function createPropContext(mesh: MeshBuilder, terrain: Terrain, lights: PropLight[], rocks: Rock[]): PropContext {
  return {
    terrain,
    solid: (s, c, o) => mesh.add(s, c, o),
    part: (s, c, o) => mesh.add(bevel(s, 0.0025), c, o),
    light: (p, color, strength, radius, group) => lights.push({ p, color, strength, radius, group }),
    rock: (r) => rocks.push(r),
  };
}

export interface PropLight { p: V3; color: RGB; strength: number; radius: number; group: LightGroup }

/** Tent and canoe counts follow the content: one per enabled item, up to five. */
export function buildProps(ctx: PropContext, counts: PropCounts) {
  kiosk(ctx); cabin(ctx); lookout(ctx);
  camp(ctx, Math.min(5, counts.tents));
  dock(ctx, Math.min(5, counts.canoes));
  point(ctx); campfire(ctx);
}

/** Heading of the trail's tangent at an angle, as the scripts use for props. */
export const tangentYaw = (tan: V3) => Math.atan2(tan[2], tan[0]);
