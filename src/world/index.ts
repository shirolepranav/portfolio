// createWorld(): the only entry point to the 3D lake. It knows nothing about copy;
// the page passes in what it needs (the visible stops, prop counts, day or night, quality tier),
// and listens to world.state for progress, the stop nearby, the open stop and the camera's view.
import {
  CustomToneMapping, LinearSRGBColorSpace, Mesh, PCFShadowMap, PerspectiveCamera, Ray, Scene, Sphere, Vector2, Vector3, WebGLRenderer,
} from "three";
import type { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import type { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ANIMALS, D2R, NEAR_STOP, S, START, STOPS, TIERS, TV, T_TRAIL, progressDeg, type Mode, type StopId, type Tier } from "./config";
import { MeshBuilder, angdiff, cross, lerp, norm, smooth, toWorld, type V3 } from "./core";
import { createTerrain, radius } from "./terrain";
import { createLanterns, createRocks, createTrees, type Rock } from "./flora";
import { buildProps, createPropContext, type Block, type PropCounts, type PropLight } from "./props/index";
import { createLights, makeEnv, worldMaterial, type Env } from "./lighting";
import { createSky } from "./sky";
import { createWater } from "./water";
import { corridor, mapShot, referenceShot, stepSlide, walkShot, type Shot, type ShotName } from "./camera";
import { propAnchor, stopShot, stopSpot } from "./stops";
import { createState } from "./state";
import { VMAX, createInput, type Command } from "./input";
import { createHiker } from "./actors/hiker";

export type { Mode, StopId, Tier } from "./config";
export type { ShotName } from "./camera";
export type { Command } from "./input";
export interface WorldOptions extends PropCounts {
  mode: Mode;
  tier?: Tier;
  progress?: number;
  stops?: StopId[];                     // the stops with something to read, in walking order; the rest are scenery
  open?: StopId | null;                 // start at this stop with its shot in place (a /lake#<stop> address)
  reducedMotion?: boolean;              // camera cuts instead of flights
  onCommand?: (c: Command) => void;     // one-shot keys, for the HUD
}
export type World = ReturnType<typeof createWorld>;

/** Starting tier from device hints. Phase 8 adds stepping down when the frame rate drops. */
export function pickTier(): Tier {
  const phone = matchMedia("(pointer: coarse)").matches || (navigator.hardwareConcurrency ?? 8) <= 4;
  return phone ? "medium" : "high";
}

const wrap = (p: number) => ((p % 1) + 1) % 1;
/** A stop's place on the loop, 0 to 1. */
export const stopProgress = (id: StopId) => wrap((STOPS[id] - STOPS.trailhead) / 360);
/** Shortest signed step from progress a to b, round the loop. */
const step = (a: number, b: number) => wrap(b - a + 0.5) - 0.5;
const toScript = (v: Vector3): V3 => [v.x / S, v.y / S, -v.z / S];

/** Blends two light sets: numbers and colours linearly, the sun direction along the arc. */
function mixEnv(a: Env, b: Env, k: number): Env {
  const out = { ...b } as Record<string, unknown>;
  for (const key of Object.keys(a) as (keyof Env)[]) {
    const x = a[key], y = b[key];
    if (typeof x === "number") out[key] = lerp(x, y as number, k);
    else if (Array.isArray(x)) out[key] = x.map((v, i) => lerp(v, (y as number[])[i], k));
  }
  out.sun = a.sun.clone().lerp(b.sun, k).normalize();
  return out as unknown as Env;
}

export function createWorld(canvas: HTMLCanvasElement, opts: WorldOptions) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = LinearSRGBColorSpace; // the tone curve already gamma-encodes
  renderer.toneMapping = CustomToneMapping;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.info.autoReset = false;                  // the mirror pass renders mid-frame; reset once per frame instead
  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 0.1, 5000);

  // Build: terrain, props and bridge merged into one mesh; trees, rocks and lanterns instanced.
  const material = worldMaterial();
  const terrain = createTerrain();
  const mesh = new MeshBuilder(), lightList: PropLight[] = [], rockList: Rock[] = [], blocks: Block[] = [];
  buildProps(createPropContext(mesh, terrain, lightList, rockList, blocks), opts);
  terrain.addBridge(mesh);
  const lanterns = createLanterns(terrain, material);
  for (const p of lanterns.lights) lightList.push({ p, color: [1.0, 0.7, 0.38], strength: 0.28, radius: 0.16, group: "lantern" });
  const rocks = createRocks(terrain, material, rockList);
  const clearings = [...Object.values(STOPS).map((d) => terrain.at(d, 1.2)), ...ANIMALS.map(([d, t]) => terrain.at(d, t))];
  const trees = createTrees(terrain, material, clearings);
  terrain.addLand(mesh, trees.shade);
  const land = new Mesh(mesh.build(), material);
  const skirt = new Mesh(terrain.skirt(), material);
  const water = createWater(terrain.water());
  const sky = createSky();
  land.castShadow = land.receiveShadow = trees.crowns.castShadow = trees.crowns.receiveShadow = true;
  trees.trunks.castShadow = rocks.castShadow = rocks.receiveShadow = lanterns.mesh.castShadow = true;
  scene.add(sky.dome, sky.stars, land, skirt, water.mesh, trees.crowns, trees.trunks, rocks, lanterns.mesh);
  const lights = createLights(scene, lightList);
  const hikerMaterial = worldMaterial(true);
  const hiker = createHiker(hikerMaterial);
  scene.add(hiker.object);

  // Stops: only the visible ones slow the walk, show a chip or open. A hidden stop's prop is scenery.
  const stops = opts.stops ?? (Object.keys(STOPS) as StopId[]);
  const reduced = opts.reducedMotion ?? false;
  const spots = Object.fromEntries(stops.map((id) => [id, stopSpot(terrain, id)])) as Record<StopId, ReturnType<typeof stopSpot>>;
  const anchors = Object.fromEntries(stops.map((id) => {
    const a = propAnchor(terrain, id);
    return [id, { p: new Vector3(...toWorld(a.p)), r: a.r * S }];
  })) as Record<StopId, { p: Vector3; r: number }>;

  // Walking: input adds velocity, velocity moves progress, progress places the hiker and the camera.
  const open0 = opts.open && stops.includes(opts.open) ? opts.open : null;
  const state = createState({
    progress: open0 ? stopProgress(open0) : wrap(opts.progress ?? START),
    near: null as StopId | null, stop: open0, view: (open0 ? "stop" : "walk") as "walk" | "stop" | "map",
  });
  const input = createInput(canvas, opts.onCommand);
  // Metres of trail per degree. Steps are scaled by it so the pace stays even where the shore bulges out.
  const mPerDeg = (deg: number) => radius(T_TRAIL, deg * D2R) * S * D2R;
  let meanM = 0;
  for (let d = 0; d < 360; d++) meanM += mPerDeg(d) / 360;
  const feet = new Vector3(), prevFeet = new Vector3(), lastEye = new Vector3();
  let facing = 1, slide = 0, look = 0, away = open0 ? 1 : 0, spotId: StopId | null = open0;
  // A glide moves progress to a stop over one to three seconds, the shorter way round ("Keep walking", map jumps).
  let glide: { from: number; dp: number; t: number; dur: number; then: StopId | null } | null = null;

  /** The visible stop within 3% of the loop, if any. */
  function nearStop(p: number) {
    let best: StopId | null = null, bd = NEAR_STOP;
    for (const id of stops) {
      const d = Math.abs(step(p, stopProgress(id)));
      if (d < bd) { bd = d; best = id; }
    }
    return { id: best, d: bd };
  }

  function walk(dt: number) {
    let p = state.get("progress"), v = 0;
    if (glide) {
      glide.t = glide.dur ? Math.min(1, glide.t + dt / glide.dur) : 1;
      const prev = p;
      p = wrap(glide.from + glide.dp * smooth(0, 1, glide.t));
      v = dt ? step(prev, p) / dt : 0;
      if (glide.t >= 1) { const then = glide.then; glide = null; if (then) openStop(then); }
    } else {
      const { d } = nearStop(p);
      ({ v, look } = input.step(dt, VMAX * (0.4 + 0.6 * smooth(0, NEAR_STOP, d)))); // slows gently near a visible stop
      p = wrap(p + (v * dt * meanM) / mPerDeg(progressDeg(p))); // the loop wraps
    }
    state.set("progress", p);
    state.set("near", nearStop(p).id);
    if (v) facing = Math.sign(v);

    // The hiker: on the trail, or walking out to (and back from) the open stop's spot.
    const deg = progressDeg(p);
    const trail = terrain.at(deg, T_TRAIL), tan = toWorld(terrain.frame(deg)[1], 1);
    if (Math.abs(angdiff(deg * D2R, TV)) < 2.8 * D2R) trail[1] = Math.max(trail[1], 0.0195); // on the footbridge deck
    const want = state.get("view") === "stop" ? 1 : 0;
    if (want) spotId = state.get("stop");
    const spot = spotId ? spots[spotId] : null;
    if (spot) {
      const dist = Math.hypot(spot.p[0] - trail[0], spot.p[2] - trail[2]) * S;
      away = reduced ? want : want ? Math.min(1, away + (dt * 3) / Math.max(dist, 1)) : Math.max(0, away - (dt * 3) / Math.max(dist, 1));
      if (!away && !want) spotId = null;
    }
    const k = smooth(0, 1, away), pos: V3 = spot ? [lerp(trail[0], spot.p[0], k), lerp(trail[1], spot.p[1], k), lerp(trail[2], spot.p[2], k)] : trail;
    if (spot && k > 0 && k < 1) pos[1] = Math.max(pos[1], terrain.ground(pos[0], pos[2]));
    prevFeet.copy(feet);
    feet.set(...toWorld(pos));
    const moved = dt ? prevFeet.distanceTo(feet) / dt : 0;
    let yaw = Math.atan2(tan[0] * facing, tan[2] * facing);
    if (spot && k > 0 && k < 1 && moved > 0.05) yaw = Math.atan2(feet.x - prevFeet.x, feet.z - prevFeet.z);
    else if (spot && k === 1) { const f = toWorld(spot.face, 1); yaw = Math.atan2(f[0], f[2]); }
    hiker.update(dt, { position: feet, yaw, speed: Math.min(moved, 12) });
    return deg;
  }

  let mode = opts.mode, tier: Tier = opts.tier ?? pickTier();
  let shot: Shot, shotName: ShotName | null = null; // shotName: a debug reference shot pinned in place
  let composer: EffectComposer | null = null, bloom: UnrealBloomPass | null = null;
  const frameHooks: ((now: number) => void)[] = [];
  // Camera moves blend from a frozen shot to the live one: walk, stop or map.
  let blend: { from: Shot; t: number; dur: number } | null = null, envDirty = true, lastFov = 0;
  const stopShots = new Map<string, Shot>();
  const portrait = () => canvas.clientWidth < canvas.clientHeight;
  const envOf = (s: Shot) => { const e = makeEnv(mode, ...s.sun[mode]); s.tweak?.(e); return e; };

  function applyEnv(env: Env, backdrop: number) {
    renderer.toneMappingExposure = env.exposure;
    lights.apply(env); sky.apply(env, backdrop); water.apply(env);
    skirt.visible = backdrop > 0; // the underside only shows from the orbit views
    // The scripts' bloom is three small blurs; UnrealBloom spreads much wider, so it runs weaker and tighter.
    if (bloom) { bloom.strength = env.night ? 0.3 : 0.05; bloom.threshold = env.night ? 1.15 : 1.6; bloom.radius = 0.1; }
  }
  const applyMode = () => applyEnv(envOf(shot), shot.orbit ? 1 : 0);

  /** The live shot for the current view. */
  function liveShot(deg: number, dt: number): Shot {
    const view = state.get("view"), port = portrait(), id = state.get("stop");
    if (view === "map") return mapShot(terrain, port, input.stepSpin(dt));
    if (view === "stop" && id) {
      const key = id + port;
      if (!stopShots.has(key)) stopShots.set(key, stopShot(terrain, id, port));
      return stopShots.get(key)!;
    }
    slide = stepSlide(terrain, deg, facing, port, look, blocks, slide, dt); // step past any prop in the way
    return walkShot(terrain, deg, port, look, slide);
  }

  function placeCamera(s: Shot) {
    camera.position.copy(s.eye);
    camera.lookAt(s.target);
    camera.fov = s.fov;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (s.shift[0] || s.shift[1]) camera.setViewOffset(w, h, -s.shift[0] * w, -s.shift[1] * h, w, h);
    else camera.clearViewOffset();
    if (s.fov !== lastFov) { const b = renderer.getDrawingBufferSize(new Vector2()); water.setSize(b.x, b.y, s.fov); lastFov = s.fov; }
  }

  function moveCamera(deg: number, dt: number) {
    const live = liveShot(deg, dt);
    if (!blend) {
      shot = live;
      if (envDirty) { applyMode(); envDirty = false; }
    } else {
      blend.t = Math.min(1, blend.t + dt / blend.dur);
      const k = smooth(0, 1, blend.t), a = blend.from;
      const eye = a.eye.clone().lerp(live.eye, k), target = a.target.clone().lerp(live.target, k);
      // Stay above the ground on the way, and keep trees out of the moving eye's view.
      const e = toScript(eye);
      eye.y = Math.max(eye.y, (terrain.ground(e[0], e[2]) + 0.03) * S);
      const vd = norm([target.x - eye.x, 0, -(target.z - eye.z)]);
      shot = {
        ...live, eye, target, fov: lerp(a.fov, live.fov, k),
        shift: [lerp(a.shift[0], live.shift[0], k), lerp(a.shift[1], live.shift[1], k)],
        clear: corridor(toScript(eye), vd, cross([0, 1, 0], vd), 0.3),
      };
      applyEnv(mixEnv(envOf(a), envOf(live), k), lerp(a.orbit ? 1 : 0, live.orbit ? 1 : 0, k));
      if (blend.t >= 1) { blend = null; envDirty = true; }
    }
    placeCamera(shot);
    if (!shot.eye.equals(lastEye)) { trees.clearAround(shot.clear); lastEye.copy(shot.eye); }
  }

  /** Switches what the camera shows, flying there over `dur` seconds (a cut with reduced motion). */
  function setView(view: "walk" | "stop" | "map", stop: StopId | null, dur = 1.2) {
    if (state.get("view") === view && state.get("stop") === stop) return;
    blend = reduced || shotName ? null : { from: shot, t: 0, dur };
    envDirty = true;
    input.enabled = view === "walk";
    input.spinning = view === "map";
    state.set("stop", stop);
    state.set("view", view);
  }

  function openStop(id: StopId) {
    if (!stops.includes(id)) return;
    glide = null;
    setView("stop", id);
  }

  /** Walks to a stop over one to three seconds, the shorter way, then opens it if asked. */
  function goTo(id: StopId, open = true) {
    if (!stops.includes(id)) return;
    const from = state.get("progress"), dp = step(from, stopProgress(id));
    if (Math.abs(dp) < 1e-4) { if (open) openStop(id); else setView("walk", null); return; }
    setView("walk", null, state.get("view") === "map" ? 1.6 : 1.2);
    glide = { from, dp, t: 0, dur: reduced ? 0 : Math.min(3, Math.max(1, 1 + 4 * Math.abs(dp))), then: open ? id : null };
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, TIERS[tier].pixelRatio));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const buf = renderer.getDrawingBufferSize(new Vector2());
    sky.setSize(buf.x, buf.y);
    water.setSize(buf.x, buf.y, camera.fov);
    composer?.setPixelRatio(renderer.getPixelRatio());
    composer?.setSize(w, h);
    envDirty = true;
    if (shotName) placeCamera(shot);
  }

  /** Debug: pins the camera on a reference frame's set-up. Walking input pauses until follow(). */
  function setShot(name: ShotName) {
    shotName = name; input.enabled = false; blend = null;
    shot = referenceShot(name, terrain);
    trees.clearAround(shot.clear);
    applyMode(); resize();
  }

  async function setGlow(on: boolean) {
    composer?.dispose();
    composer = bloom = null;
    if (!on) return;
    // Loaded only on the high tier, so phones never download it.
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
      import("three/addons/postprocessing/EffectComposer.js"), import("three/addons/postprocessing/RenderPass.js"),
      import("three/addons/postprocessing/UnrealBloomPass.js"), import("three/addons/postprocessing/OutputPass.js"),
    ]);
    if (!TIERS[tier].glow) return; // tier changed while loading
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass((bloom = new UnrealBloomPass(new Vector2(256, 256), 0.3, 0.4, 1.6)));
    composer.addPass(new OutputPass());
    resize();
  }

  function setTier(t: Tier) {
    tier = t;
    const q = TIERS[t];
    lights.setTier(t);
    trees.setCount(q.trees);
    water.setReflection(q.reflection);
    renderer.shadowMap.enabled = q.shadows;
    hiker.setShadow(q.shadows);
    material.needsUpdate = hikerMaterial.needsUpdate = true; // shadows on or off change the shader
    resize();
    void setGlow(q.glow);
  }

  input.enabled = !open0;
  shot = referenceShot("walk", terrain);
  setTier(tier);
  addEventListener("resize", resize);

  let resolveReady: () => void;
  const ready = new Promise<void>((r) => (resolveReady = r));
  let first = true, last = 0;
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.1, (now - last) / 1000 || 0); // a long pause (a hidden tab) never becomes one huge step
    last = now;
    const deg = walk(dt);
    if (!shotName) moveCamera(deg, dt);
    for (const f of frameHooks) f(now);
    camera.near = Math.max(0.1, camera.position.length() * 0.004); // tighter depth range for close shots
    camera.updateProjectionMatrix();
    renderer.info.reset();
    if (composer) composer.render(); else renderer.render(scene, camera);
    if (first) { first = false; resolveReady(); }
  });

  const v = new Vector3(), ray = new Ray(), sphere = new Sphere();
  /** CSS pixel position of a world point on the canvas; front is false when it is behind the camera. */
  function toScreen(p: Vector3) {
    v.copy(p).project(camera);
    return { x: (v.x + 1) / 2 * canvas.clientWidth, y: (1 - v.y) / 2 * canvas.clientHeight, front: v.z < 1 };
  }

  return {
    renderer, scene, camera, ready, state, terrain, trees, input, blocks, stops,
    get tier() { return tier; },
    get mode() { return mode; },
    get shot() { return shot; },
    /** True while the camera is flying between views. */
    get moving() { return !!blend || !!glide; },
    setMode(m: Mode) { mode = m; envDirty = true; if (shotName) applyMode(); },
    setTier,
    openStop,
    goTo,
    /** Closes the open stop: the hiker walks back to the trail and the camera returns behind it. */
    close() { if (state.get("view") !== "walk") setView("walk", null); },
    /** Shows or hides the island map: the camera flies up to the orbit and back. */
    showMap(on: boolean) { if (on) { glide = null; setView("map", null, 1.6); } else if (state.get("view") === "map") setView("walk", null, 1.6); },
    /** Where a stop's prop is on screen, for the chip and the map pins. */
    stopOnScreen(id: StopId) { return toScreen(anchors[id].p); },
    /** Where the hiker is on screen. */
    hikerOnScreen() { return toScreen(feet); },
    /** The visible stop whose prop is under a canvas point, if any. */
    pick(x: number, y: number): StopId | null {
      const ndc = new Vector2((x / canvas.clientWidth) * 2 - 1, 1 - (y / canvas.clientHeight) * 2);
      ray.origin.setFromMatrixPosition(camera.matrixWorld);
      ray.direction.set(ndc.x, ndc.y, 0.5).unproject(camera).sub(ray.origin).normalize();
      let best: StopId | null = null, bd = Infinity;
      for (const id of stops) {
        const hit = ray.intersectSphere(sphere.set(anchors[id].p.clone().setY(anchors[id].p.y - anchors[id].r * 0.4), anchors[id].r), v);
        if (hit && hit.distanceTo(ray.origin) < bd) { bd = hit.distanceTo(ray.origin); best = id; }
      }
      return best;
    },
    /** Debug: jumps the camera to a reference frame's set-up. */
    setShot,
    /** Back to the live camera after a debug shot. */
    follow() { shotName = null; input.enabled = state.get("view") === "walk"; envDirty = true; resize(); },
    get following() { return !shotName; },
    /** Puts the hiker at a point on the loop and stops (debug screenshots). */
    setProgress(p: number) { glide = null; state.set("progress", wrap(p)); input.stop(); },
    /** Drops the lens shift, for free looking around. */
    clearShift() { shot = { ...shot, shift: [0, 0] }; placeCamera(shot); camera.updateProjectionMatrix(); },
    onFrame(f: (now: number) => void) { frameHooks.push(f); },
  };
}
