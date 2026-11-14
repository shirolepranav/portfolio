// The wildlife: four elk, a bear and her cub, a moose in the shallows. Shapes, proportions and colours from
// quadruped() in reference/scene/scene.py, rebuilt "low-poly, but softer" like the hiker: capsules and balls,
// smooth shading, one skinned mesh each. Behaviour from PLAN.md's Hiker and wildlife table.
// None of them collide with anything; they stay off the trail and out of the camera's way (see bounds()).
import { Group, SphereGeometry, Vector3, type Material, type Object3D } from "three";
import { C, S, type RGB } from "../config";
import { angdiff, lerp, makeRng, smooth, toWorld } from "../core";
import type { Terrain } from "../terrain";
import { makeParts, rig, type P } from "./parts";
import { createBlobShadow } from "./shadow";

/** What every animal needs to know each frame. */
export interface ActorContext {
  dt: number; t: number;
  hiker: Vector3;                        // the hiker's feet, world metres
  eye: Vector3;                          // the camera, world metres: animals keep their heads out of its line to the hiker
  night: number;                         // 0 day to 1 night
  ripple(x: number, z: number): void;    // a ring on the water at a world point
}
/** One animal. A modelled one could replace any of these by meeting the same interface. */
export interface Actor {
  object: Object3D;
  update(ctx: ActorContext): void;
  /** true: cast a real shadow (shadow map tier). false: a soft blob on the ground. */
  setShadow(map: boolean): void;
  /** Spheres (world metres) covering every place the animal can reach, for the camera clearance audit. */
  bounds: { p: Vector3; r: number }[];
}

type Kind = "elk" | "moose" | "bear";
// The script's body plan per kind, in units of 0.05 * scale: length, width, height, body height, leg thickness.
const PLAN: Record<Kind, { body: RGB; dark: RGB; bl: number; bw: number; bh: number; by: number; leg: number }> = {
  elk: { body: [0.6, 0.45, 0.31], dark: [0.33, 0.23, 0.18], bl: 1.05, bw: 0.3, bh: 0.4, by: 0.92, leg: 0.07 },
  moose: { body: [0.24, 0.18, 0.15], dark: [0.17, 0.13, 0.12], bl: 1.25, bw: 0.36, bh: 0.52, by: 1.18, leg: 0.085 },
  bear: { body: [0.4, 0.28, 0.19], dark: [0.3, 0.21, 0.15], bl: 1.0, bw: 0.44, bh: 0.5, by: 0.62, leg: 0.13 },
};

/** A rigged four-legged animal. Bones: 0 body, 1 neck, 2 head, 3-6 legs (front left, front right, back left, back right), 7 tail. */
function quadruped(kind: Kind, scale: number, material: Material) {
  const u = 0.05 * scale * S, { body, dark, bl, bw, bh, by, leg } = PLAN[kind];
  const { capsule, ball, part } = makeParts(u);
  const bear = kind === "bear";
  const hipY = by - bh * 0.3, legX = bw * 0.33, front = bl * 0.36, back = -bl * 0.38;
  const nb: P = bear ? [0, by + 0.02, bl * 0.42] : [0, by + bh * 0.25, bl * 0.42];
  const nt: P = bear ? [0, by + 0.02, bl * 0.5] : [0, by + bh * (kind === "elk" ? 1.05 : 0.55), bl * 0.5 + 0.22];
  const BONES: [number, P][] = [
    [-1, [0, by, 0]], [0, nb], [1, nt],
    [0, [legX, hipY, front]], [0, [-legX, hipY, front]], [0, [legX, hipY, back]], [0, [-legX, hipY, back]],
    [0, [0, by + bh * 0.2, -bl * 0.5]],
  ];
  const parts = [
    // Body: a capsule as long as the script's box, a little wider at the chest (bears: at the rump).
    capsule([0, by, -bl / 2 + bh / 2], [0, by + 0.03, bl / 2 - bh / 2], bh / 2, body, 0, [bw / bh, 1]),
    ball(bh * 0.42, [0, by + 0.02, bl * (bear ? -0.22 : 0.22)], body, 0, [bw / bh * 1.1, 1.05, 1.1]),
  ];
  // Legs: from the hip to the ground, slightly splayed as in the script, with darker hooves or paws.
  ([[legX, front, 3], [-legX, front, 4], [legX, back, 5], [-legX, back, 6]] as const).forEach(([x, z, b]) => {
    const r = leg * (bear ? 0.62 : 0.6);
    parts.push(capsule([x, hipY + 0.05, z], [x, r, z + (z > 0 ? 0.03 : -0.02)], r, bear ? body : dark, b));
    parts.push(ball(r * 1.15, [x, r * 0.9, z + (z > 0 ? 0.04 : -0.01)], dark, b, [1, 0.7, 1.25]));
  });
  if (bear) {
    parts.push(
      ball(bh * 0.36, [0, by + bh * 0.36, bl * 0.22], body, 0, [1.05, 0.8, 1.25]),                // shoulder hump
      capsule([0, by + 0.01, bl * 0.5], [0, by - 0.08, bl * 0.5 + 0.26], 0.14, body, 2),           // head
      capsule([0, by - 0.1, bl * 0.5 + 0.3], [0, by - 0.14, bl * 0.5 + 0.42], 0.06, dark, 2),      // snout
      ball(0.045, [0.11, by + 0.15, bl * 0.5 + 0.08], dark, 2), ball(0.045, [-0.11, by + 0.15, bl * 0.5 + 0.08], dark, 2),
      ball(0.06, [0, by + 0.05, -bl * 0.5 - 0.02], body, 7),
    );
  } else {
    const moose = kind === "moose";
    const hl = moose ? 0.48 : 0.34, drop = moose ? -0.2 : -0.12;
    const tip: P = [nt[0], nt[1] + drop, nt[2] + hl];
    parts.push(
      capsule(nb, nt, bw * 0.31, dark, 1, [1, 1.15]),                                              // neck
      capsule([nt[0], nt[1] + 0.02, nt[2]], [tip[0], tip[1] + 0.02, tip[2] - 0.04], 0.08, moose ? dark : body, 2),  // head
      ball(moose ? 0.075 : 0.06, [tip[0], tip[1], tip[2]], dark, 2, [1, 0.9, 1.2]),                 // muzzle
      ball(0.045, [0.12, nt[1] + 0.1, nt[2] - 0.02], dark, 2, [0.7, 1.3, 0.5]), ball(0.045, [-0.12, nt[1] + 0.1, nt[2] - 0.02], dark, 2, [0.7, 1.3, 0.5]),
      ball(0.04, [0, by + bh * 0.25, -bl * 0.5 - 0.02], dark, 7),                                  // tail
    );
    if (!moose) {
      parts.push(ball(bh * 0.3, [0, by + 0.04, -bl * 0.47], C.cream, 0, [bw / bh * 2.2, 1.4, 0.7])); // pale rump patch
      // Antlers: two beams sweeping up and back, each with three tines, as in the script.
      const ant: RGB = [0.86, 0.8, 0.68];
      for (const sx of [-1, 1]) {
        const a0: P = [sx * 0.05, nt[1] + 0.09, nt[2]];
        const a1: P = [a0[0] + sx * 0.2, a0[1] + 0.36, a0[2] - 0.22], a2: P = [a1[0] + sx * 0.05, a1[1] + 0.26, a1[2] - 0.1];
        parts.push(capsule(a0, a1, 0.016, ant, 2, [1, 1], 6), capsule(a1, a2, 0.013, ant, 2, [1, 1], 6));
        for (const [f, up] of [[0.35, 0.2], [0.75, 0.22]]) {
          const b0: P = [a0[0] + (a1[0] - a0[0]) * f, a0[1] + (a1[1] - a0[1]) * f, a0[2] + (a1[2] - a0[2]) * f];
          parts.push(capsule(b0, [b0[0] + sx * 0.03, b0[1] + up, b0[2] + 0.16], 0.011, ant, 2, [1, 1], 6));
        }
        parts.push(capsule(a1, [a1[0], a1[1] + 0.2, a1[2] + 0.1], 0.011, ant, 2, [1, 1], 6));
      }
    } else {
      // Palmate antlers: a short beam, then a broad flat palm; and the bell under the chin.
      const ant: RGB = [0.7, 0.62, 0.5];
      for (const sx of [-1, 1]) {
        const a0: P = [sx * 0.06, nt[1] + 0.08, nt[2]], a1: P = [a0[0] + sx * 0.2, a0[1] + 0.07, a0[2]];
        parts.push(capsule(a0, a1, 0.025, ant, 2, [1, 1], 6));
        parts.push(part(new SphereGeometry(0.19, 10, 6), ant, 2, [a1[0] + sx * 0.15, a1[1] + 0.1, a1[2]], [sx * 0.3, 0.2, 0], [0.12, 1, 0.8]));
      }
      parts.push(capsule([0, nt[1] - 0.12, nt[2] + 0.1], [0, nt[1] - 0.26, nt[2] + 0.1], 0.03, dark, 2));
    }
  }
  const { mesh, bones } = rig(parts, BONES, u, material);
  // The muzzle, in the head bone's space: where a drinking moose touches the water.
  const muzzle = bear ? new Vector3(0, -0.12, 0.42).multiplyScalar(u) : new Vector3(0, (kind === "moose" ? -0.2 : -0.12), kind === "moose" ? 0.48 : 0.34).multiplyScalar(u);
  // Spheres (local metres) round everything the animal can reach: its body, and every pose of its neck, head and antlers.
  const reach = [
    { c: new Vector3(0, by * u, 0), r: bl * (bear ? 0.62 : 0.55) * u },
    ...(bear ? [] : [{ c: new Vector3(...nb).multiplyScalar(u), r: (kind === "elk" ? 1.1 : 0.95) * u }]),
  ];
  return { mesh, bones, u, length: bl * u, height: (by + bh) * u, muzzle, reach };
}

/** Where an animal stands: the script's animal(deg, t, turn) placement, in world metres and a world yaw. */
function placeAt(terrain: Terrain, deg: number, t: number, turn: number, sink = 0) {
  const [, tan] = terrain.frame(deg), p = terrain.at(deg, t);
  const h = Math.atan2(tan[2], tan[0]) + turn;                     // the script's heading
  const f = toWorld([Math.cos(h), 0, Math.sin(h)], 1);             // as a world direction
  return { pos: new Vector3(...toWorld([p[0], p[1] - sink, p[2]])), yaw: Math.atan2(f[0], f[2]) };
}

/** Keeps an angle within +-max. */
const clampA = (a: number, max: number) => Math.max(-max, Math.min(max, a));

/** An animal's reach spheres where it stands (world metres). */
const reachAt = (q: ReturnType<typeof quadruped>, o: Object3D) => {
  o.updateMatrixWorld(true);
  return q.reach.map(({ c, r }) => ({ p: o.localToWorld(c.clone()), r }));
};

/** The common wrapper: placed, turned, with a blob shadow for the tiers without a shadow map. */
function wrap(q: ReturnType<typeof quadruped>, blob: boolean) {
  const object = new Group(), shadow = createBlobShadow(q.length * 0.3, q.length * 0.62);
  shadow.visible = blob;
  object.add(q.mesh, shadow);
  return { object, setShadow(map: boolean) { q.mesh.castShadow = map; shadow.visible = blob && !map; } };
}

/**
 * Elk: graze with the head down, now and then lift it to look around. When the hiker comes within about 7 m,
 * each lifts its head and turns it to watch, then goes back to grazing once the hiker has passed.
 */
/** Distance (metres) from point p to the segment a-b. */
function toSegment(p: Vector3, a: Vector3, b: Vector3) {
  const ab = tmp1.subVectors(b, a), k = Math.max(0, Math.min(1, tmp2.subVectors(p, a).dot(ab) / Math.max(1e-6, ab.lengthSq())));
  return tmp2.copy(a).addScaledVector(ab, k).distanceTo(p);
}
const tmp1 = new Vector3(), tmp2 = new Vector3(), chest = new Vector3();

export function createElk(terrain: Terrain, material: Material, deg: number, t: number, turn: number, scale: number, seed: number): Actor {
  const q = quadruped("elk", scale, material), [body, neck, head, fl, fr, bl, br, tail] = q.bones;
  const { object, setShadow } = wrap(q, true);
  const at = placeAt(terrain, deg, t, turn);
  object.position.copy(at.pos);
  object.rotation.y = at.yaw;
  const rng = makeRng(seed), local = new Vector3(), restY = body.position.y;
  const headAt = q.reach[1].c.clone();                       // the neck's base, in the elk's own space
  object.updateMatrixWorld(true);
  const headW = object.localToWorld(headAt.clone()), headR = q.reach[1].r;
  let graze = 1, alert = 0, timer = rng.uniform(1, 6), grazing = rng.next() < 0.7;
  return {
    object, setShadow,
    bounds: reachAt(q, object),
    update({ dt, t: time, hiker, eye }) {
      // Graze for 5 to 10 s, look up for 2 to 4 s, and so on.
      timer -= dt;
      if (timer < 0) { grazing = !grazing; timer = grazing ? rng.uniform(5, 10) : rng.uniform(2, 4); }
      // A raised head must never come between the camera and the hiker: where it would, the elk grazes.
      chest.copy(hiker).setY(hiker.y + 1.2);
      const inView = toSegment(headW, eye, chest) < headR + 1.6;
      if (inView) grazing = true;
      const near = !inView && hiker.distanceTo(object.position) < 7 ? 1 : 0;
      alert += (near - alert) * (1 - Math.exp(-dt / (near ? 0.35 : 1.2)));
      graze += ((grazing ? 1 : 0) * (1 - near) - graze) * (1 - Math.exp(-dt / (inView ? 0.2 : 0.6)));
      const g = smooth(0, 1, graze);
      // Head down to the grass: the body tips forward a little, the neck and head bend down.
      body.rotation.x = 0.1 * g;
      for (const l of [fl, fr, bl, br]) l.rotation.x = -0.1 * g;
      neck.rotation.x = 1.3 * g - 0.08 * (1 - g);
      head.rotation.x = 0.5 * g + 0.04 * g * Math.sin(time * 7 + seed); // chewing
      // Looking: toward the hiker when alert, otherwise a slow look around.
      local.copy(hiker); object.worldToLocal(local);
      const toHiker = clampA(Math.atan2(local.x, local.z), 1.4);
      const idle = (1 - g) * 0.6 * Math.sin(time * 0.37 + seed * 3);
      const look = lerp(idle, toHiker, smooth(0, 1, alert));
      neck.rotation.y = look * 0.6; head.rotation.y = look * 0.4;
      neck.rotation.z = -look * 0.15;
      tail.rotation.x = 0.5 * Math.max(0, Math.sin(time * 2.3 + seed)) ** 12; // a flick now and then
      body.position.y = restY + Math.sin(time * 1.4 + seed) * 0.004 * q.u; // breathing
    },
  };
}

/** The moose, wading: dips its head to drink every few seconds, and rings spread on the water where it drinks. */
export function createMoose(terrain: Terrain, material: Material): Actor {
  const q = quadruped("moose", 1.15, material), [, neck, head, , , , , tail] = q.bones;
  const { object, setShadow } = wrap(q, false); // no blob: it stands in the water
  const at = placeAt(terrain, 108, 0.955, 0.3, 0.012);
  object.position.copy(at.pos);
  object.rotation.y = at.yaw;
  const tip = new Vector3();
  let cycle = 2, sipped = false, nextSip = 0;
  return {
    object, setShadow,
    bounds: reachAt(q, object),
    update({ dt, t: time, ripple }) {
      // A 7.5 s cycle: head up and looking about, down over a second, three sips, up again.
      cycle = (cycle + dt) % 7.5;
      const d = smooth(3, 4.1, cycle) * (1 - smooth(6.4, 7.4, cycle));
      neck.rotation.x = 1.15 * d;
      head.rotation.x = 0.75 * d + 0.05 * d * Math.sin(time * 9);
      neck.rotation.y = (1 - d) * 0.35 * Math.sin(time * 0.3);
      tail.rotation.x = 0.4 * Math.max(0, Math.sin(time * 1.7)) ** 12;
      // Rings: one as the muzzle meets the water, then one each sip.
      if (d > 0.97) {
        if (!sipped || cycle > nextSip) {
          head.updateWorldMatrix(true, false);
          tip.copy(q.muzzle); head.localToWorld(tip);
          ripple(tip.x, tip.z);
          sipped = true; nextSip = cycle + 0.8;
        }
      } else if (d < 0.5) sipped = false;
    },
  };
}

/**
 * The bear and her cub amble a short path along the slope above the trail, about 5 m, parallel to it:
 * walk, stop to sniff the ground, turn round (through the uphill side), walk back. The cub follows a second
 * behind on a line a little further uphill, with a quicker step.
 */
export function createBears(terrain: Terrain, material: Material): Actor {
  const A = 210.5, B = 216.5, T_MOM = 1.175, T_CUB = 1.205, WALK = 7, PAUSE = 3, TURN = 1.8, LAG = 1.1;
  const CYCLE = 2 * (WALK + PAUSE + TURN);
  const object = new Group();
  const mom = quadruped("bear", 1.1, material), cub = quadruped("bear", 0.62, material);
  const a = wrap(mom, true), b = wrap(cub, true);
  object.add(a.object, b.object);
  // Metres along the path, for the walking speed.
  const len = Math.hypot(...(([0, 2] as const).map((i) => terrain.at(A, T_MOM)[i] - terrain.at(B, T_MOM)[i]) as [number, number])) * S;

  /** Where the mother is at time T (the cub uses T - LAG): place on the path, facing, and walking speed. */
  function at(T: number) {
    let p = ((T % CYCLE) + CYCLE) % CYCLE, dir = 1;
    if (p >= CYCLE / 2) { p -= CYCLE / 2; dir = -1; }                 // the return leg
    const walk = smooth(0, 1, Math.min(1, p / WALK)), moving = p < WALK ? 1 : 0;
    const u = dir > 0 ? walk : 1 - walk;
    const turn = smooth(WALK + PAUSE, WALK + PAUSE + TURN, p);          // 0 to 1 while turning round
    return { u, dir, turn, sniff: p >= WALK && p < WALK + PAUSE ? 1 : 0, speed: moving * (len / WALK) * 1.5 * Math.sin(Math.PI * Math.min(1, p / WALK)) };
  }
  const place = (q: ReturnType<typeof quadruped>, o: Object3D, s: ReturnType<typeof at>, ring: number) => {
    const deg = lerp(A, B, s.u), p = terrain.at(deg, ring);
    o.position.set(...toWorld([p[0], terrain.ground(p[0], p[2]), p[2]]));
    // Facing along the path; turning round through the uphill (outward) side.
    const [out, tan] = terrain.frame(deg), fw = toWorld(tan, 1), ow = toWorld(out, 1);
    const y0 = Math.atan2(fw[0] * s.dir, fw[2] * s.dir), yo = Math.atan2(ow[0], ow[2]);
    const side = Math.sign(angdiff(yo, y0)) || 1;
    o.rotation.y = y0 + side * Math.PI * s.turn;
    return q;
  };
  const gait = [0, 0];
  const restY = [mom.bones[0].position.y, cub.bones[0].position.y];
  /** The amble: legs in diagonal pairs, a roll and a bob; sniffing lowers the head. which: 0 mother, 1 cub. */
  const pose = (q: ReturnType<typeof quadruped>, s: ReturnType<typeof at>, dt: number, time: number, which: number) => {
    const [body, neck, head, fl, fr, bl, br] = q.bones;
    gait[which] += (s.speed * dt) / (q.length * 0.9) * Math.PI * 2 * (which ? 1.35 : 1);
    const w = smooth(0.05, 0.4, s.speed), sw = Math.sin(gait[which]) * 0.42 * w;
    fl.rotation.x = br.rotation.x = sw; fr.rotation.x = bl.rotation.x = -sw;  // diagonal pairs step together
    body.rotation.z = Math.sin(gait[which]) * 0.04 * w;                       // the amble's roll
    body.position.y = restY[which] + Math.abs(Math.cos(gait[which])) * 0.02 * q.u * w * (which ? 2 : 1);
    neck.rotation.x = 0.35 * s.sniff + 0.05 * Math.sin(time * 1.3 + which);
    head.rotation.y = 0.25 * Math.sin(time * 0.8 + which * 2) * (1 - w);
    head.rotation.x = 0.1 * s.sniff * Math.sin(time * 5);
  };
  // Bounds: both bears anywhere along their two lines.
  const bounds: { p: Vector3; r: number }[] = [];
  for (let i = 0; i <= 12; i++) for (const [ring, q] of [[T_MOM, mom], [T_CUB, cub]] as const) {
    const p = terrain.at(lerp(A, B, i / 12), ring);
    bounds.push({ p: new Vector3(...toWorld([p[0], terrain.ground(p[0], p[2]) + q.reach[0].c.y, p[2]])), r: q.length * 0.75 });
  }
  return {
    object, bounds,
    setShadow(map) { a.setShadow(map); b.setShadow(map); },
    update({ dt, t: time }) {
      const s1 = at(time), s2 = at(time - LAG);
      pose(place(mom, a.object, s1, T_MOM), s1, dt, time, 0);
      pose(place(cub, b.object, s2, T_CUB), s2, dt, time, 1);
    },
  };
}

/** Every animal in PLAN.md's table except the birds (birds.ts): four elk, the bears, the moose. */
export function createWildlife(terrain: Terrain, material: Material): Actor[] {
  // The script's animal(deg, t, turn, kind, scale) calls.
  // Each elk stands 0.03 to 0.09 further out from the lake than in the script (still inside the tree clearing kept
  // for it), so no hoof or antler reaches the trail and none comes between the walking camera and the hiker.
  const elk: [number, number, number, number][] = [[5, 1.22, 2.4, 1.05], [49, 1.24, 2.6, 1.05], [53.5, 1.23, 1.2, 0.9], [-52, 1.25, -0.6, 1.0]];
  return [
    ...elk.map(([d, t, turn, sc], i) => createElk(terrain, material, d, t, turn, sc, 21 + i)),
    createBears(terrain, material),
    createMoose(terrain, material),
  ];
}
