// The seven stop props, one file each. The static parts merge into the world's land mesh; the parts that move
// (cabin door, smoke, lookout light, tents and flaps, canoes, camera flash, fire and sparks) are small meshes of
// their own, and each prop returns its reaction for when its stop opens.
import { Color, Euler, InstancedMesh, Matrix4, Object3D, Quaternion, Vector2, Vector3, type Material } from "three";
import type { LightGroup, RGB } from "../config";
import { MeshBuilder, bevel, toWorld, type Shape, type V3 } from "../core";
import type { MaterialOptions } from "../lighting";
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

/** Draws shapes into a mesh: as they are, or as box-shaped parts with lightly bevelled edges. */
export interface Builder {
  solid(shape: Shape, color: RGB, opts?: AddOpts): void;
  part(shape: Shape, color: RGB, opts?: AddOpts): void;
}

export interface PropContext extends Builder {
  terrain: Terrain;
  /** True when the visitor asks for reduced motion: reactions become a simple change of state. */
  reduced: boolean;
  /** A warm point light that comes on at night. Returns its number, for reactions that brighten it. */
  light(p: V3, color: RGB, strength: number, radius: number, group: LightGroup): number;
  /** A rock for the shared instanced rock mesh. */
  rock(r: Rock): void;
  /** A space the walking camera keeps out of. */
  block(b: Block): void;
  /**
   * A moving part: shapes drawn round the origin (the pivot), in the scripts' coordinates, placed once per entry in
   * `places`. Repeats of one part share a single mesh, so they cost one draw call.
   */
  moving(draw: (b: Builder) => void, places: Place[], opts?: MaterialOptions): Moving;
  /** Any other object, such as a light beam or sparks. */
  add(o: Object3D): void;
}

/** Where one copy of a moving part stands: its pivot, its heading (the scripts' yaw) and an optional tint. */
export interface Place { p: V3; yaw?: number; color?: RGB }

export interface Moving {
  mesh: InstancedMesh;
  /** This part's own glow: x is how much it overrides the day and night glow (0 to 1), y the glow it takes. */
  glow: Vector2;
  /** Moves copy i away from its place by a local offset (see offset()). */
  pose(i: number, m: Matrix4): void;
}

/** What a prop does when its stop opens. update runs every frame, for the always-on motion too. */
export interface Reaction {
  start(): void;
  end(): void;
  /** The panel's row i has just appeared (tents bounce, canoes bob). */
  row?(i: number): void;
  update(dt: number, t: number, lamp: LampControl): void;
}
/** Brightens a prop's lamp by its number from light(): 1 is normal. */
export type LampControl = (index: number, k: number) => void;

export interface PropCounts { tents: number; canoes: number }

/**
 * A prop's space, kept clear of the walking camera: a box on the ground at c, half length and width along
 * `along` (default x), from y[0] up to y[1] at the long edges and y[2] down the middle (a gable roof).
 * see: see-through (stilts), so only the camera itself must stay out, not its line of sight.
 */
export interface Block { c: V3; half: [number, number]; y: [number, number, number]; along?: V3; see?: boolean }

export interface PropLight { p: V3; color: RGB; strength: number; radius: number; group: LightGroup }

const m4 = new Matrix4(), q = new Quaternion(), e = new Euler(), v = new Vector3(), one = new Vector3(1, 1, 1);
const pivotM = new Matrix4(), back = new Matrix4();

/**
 * A local offset for pose(): lifted dy metres, turned by (rx, ry, rz) radians and scaled by s, about `about`
 * (a point in the part's own metres, default its pivot).
 */
export function offset(dy = 0, r: [number, number, number] = [0, 0, 0], s: [number, number, number] = [1, 1, 1], about?: Vector3) {
  const m = new Matrix4().compose(v.set(0, dy, 0), q.setFromEuler(e.set(...r)), new Vector3(...s));
  if (!about) return m;
  return pivotM.makeTranslation(about.x, about.y, about.z).multiply(m).multiply(back.makeTranslation(-about.x, -about.y, -about.z)).clone();
}

export interface PropWorld {
  terrain: Terrain; land: MeshBuilder; lights: PropLight[]; rocks: Rock[]; blocks: Block[];
  group: Object3D;                                  // moving parts are added here
  material: (o: MaterialOptions) => Material;       // a world material, registered so tier changes reach it
  reduced: boolean;
}

export function createPropContext(w: PropWorld): PropContext {
  const builder = (mesh: MeshBuilder): Builder => ({
    solid: (s, c, o) => mesh.add(s, c, o),
    part: (s, c, o) => mesh.add(bevel(s, 0.0025), c, o),
  });
  return {
    ...builder(w.land),
    terrain: w.terrain,
    reduced: w.reduced,
    light: (p, color, strength, radius, group) => w.lights.push({ p, color, strength, radius, group }) - 1,
    rock: (r) => w.rocks.push(r),
    block: (b) => w.blocks.push(b),
    add: (o) => w.group.add(o),
    moving(draw, places, opts = {}) {
      const b = new MeshBuilder();
      draw(builder(b));
      const glow = opts.piece ?? new Vector2();
      const mesh = new InstancedMesh(b.build(), w.material({ ...opts, piece: glow }), places.length);
      const base = places.map(({ p, yaw = 0 }) => new Matrix4().compose(new Vector3(...toWorld(p)), q.setFromAxisAngle(v.set(0, 1, 0), yaw).clone(), one));
      places.forEach((pl, i) => {
        mesh.setMatrixAt(i, base[i]);
        if (pl.color) mesh.setColorAt(i, new Color(...pl.color));
      });
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      mesh.boundingSphere!.radius += 0.5; // room for the small moves the reactions make
      w.group.add(mesh);
      return {
        mesh, glow,
        pose(i, m) { mesh.setMatrixAt(i, m4.multiplyMatrices(base[i], m)); mesh.instanceMatrix.needsUpdate = true; },
      };
    },
  };
}

export type StopReactions = Record<"trailhead" | "cabin" | "lookout" | "camp" | "dock" | "point" | "campfire", Reaction>;

/** Builds every prop. Tent and canoe counts follow the content: one per enabled item, up to five. */
export function buildProps(ctx: PropContext, counts: PropCounts): StopReactions {
  return {
    trailhead: kiosk(ctx), cabin: cabin(ctx), lookout: lookout(ctx),
    camp: camp(ctx, Math.min(5, counts.tents)),
    dock: dock(ctx, Math.min(5, counts.canoes)),
    point: point(ctx), campfire: campfire(ctx),
  };
}

/** Heading of the trail's tangent at an angle, as the scripts use for props. */
export const tangentYaw = (tan: V3) => Math.atan2(tan[2], tan[0]);

/** A value that rises to 1 and falls back: an easing for one-off moves. 0 at t = 0, peak at `peak`, 0 again by `len`. */
export const pulse = (t: number, peak: number, len: number) =>
  t <= 0 || t >= len ? 0 : t < peak ? Math.sin((t / peak) * Math.PI / 2) : Math.cos(((t - peak) / (len - peak)) * Math.PI / 2);
