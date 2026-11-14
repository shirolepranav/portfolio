// createWorld(): the only entry point to the 3D lake. It knows nothing about copy;
// the page passes in what it needs (prop counts, day or night, quality tier).
import {
  CustomToneMapping, LinearSRGBColorSpace, Mesh, PCFShadowMap, PerspectiveCamera, Scene, Vector2, Vector3, WebGLRenderer,
} from "three";
import type { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import type { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ANIMALS, D2R, NEAR_STOP, S, START, STOPS, TIERS, TV, T_TRAIL, progressDeg, type Mode, type Tier } from "./config";
import { MeshBuilder, angdiff, smooth, toWorld } from "./core";
import { createTerrain, radius } from "./terrain";
import { createLanterns, createRocks, createTrees, type Rock } from "./flora";
import { buildProps, createPropContext, type Block, type PropCounts, type PropLight } from "./props/index";
import { createLights, makeEnv, worldMaterial } from "./lighting";
import { createSky } from "./sky";
import { createWater } from "./water";
import { stepSlide, referenceShot, walkShot, type Shot, type ShotName } from "./camera";
import { createState } from "./state";
import { VMAX, createInput } from "./input";
import { createHiker } from "./actors/hiker";

export type { Mode, Tier } from "./config";
export type { ShotName } from "./camera";
export interface WorldOptions extends PropCounts { mode: Mode; tier?: Tier; progress?: number }
export type World = ReturnType<typeof createWorld>;

/** Starting tier from device hints. Phase 8 adds stepping down when the frame rate drops. */
export function pickTier(): Tier {
  const phone = matchMedia("(pointer: coarse)").matches || (navigator.hardwareConcurrency ?? 8) <= 4;
  return phone ? "medium" : "high";
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

  // Walking: input adds velocity, velocity moves progress, progress places the hiker and the camera.
  const wrap = (p: number) => ((p % 1) + 1) % 1;
  const state = createState({ progress: wrap(opts.progress ?? START) });
  const input = createInput(canvas);
  // Metres of trail per degree. Steps are scaled by it so the pace stays even where the shore bulges out.
  const mPerDeg = (deg: number) => radius(T_TRAIL, deg * D2R) * S * D2R;
  let meanM = 0;
  for (let d = 0; d < 360; d++) meanM += mPerDeg(d) / 360;
  const stopsAt = Object.values(STOPS).map((d) => wrap((d - STOPS.trailhead) / 360));
  const feet = new Vector3(), lastEye = new Vector3();
  let facing = 1, slide = 0;

  function walk(dt: number) {
    const p = state.get("progress");
    const near = Math.min(...stopsAt.map((s) => Math.abs(wrap(p - s + 0.5) - 0.5)));
    const { v, look } = input.step(dt, VMAX * (0.4 + 0.6 * smooth(0, NEAR_STOP, near))); // slows gently near a stop
    const deg = progressDeg(wrap(p + (v * dt * meanM) / mPerDeg(progressDeg(p))));    // the loop wraps
    state.set("progress", wrap((deg - STOPS.trailhead) / 360));
    if (v) facing = Math.sign(v);
    const pos = terrain.at(deg, T_TRAIL), tan = toWorld(terrain.frame(deg)[1], 1);
    if (Math.abs(angdiff(deg * D2R, TV)) < 2.8 * D2R) pos[1] = Math.max(pos[1], 0.0195); // on the footbridge deck
    hiker.update(dt, { position: feet.set(...toWorld(pos)), yaw: Math.atan2(tan[0] * facing, tan[2] * facing), speed: Math.abs(v) * 360 * meanM });
    if (shotName) return;
    const portrait = canvas.clientWidth < canvas.clientHeight;
    slide = stepSlide(terrain, deg, facing, portrait, look, blocks, slide, dt); // step past any prop in the way
    const f = walkShot(terrain, deg, portrait, look, slide);
    camera.position.copy(f.eye);
    camera.lookAt(f.target);
    if (!f.eye.equals(lastEye)) { trees.clearAround(f.clear); lastEye.copy(f.eye); }
  }

  let mode = opts.mode, tier: Tier = opts.tier ?? pickTier();
  let shot: Shot, shotName: ShotName | null = null; // null: follow the screen (walk or walkp)
  let composer: EffectComposer | null = null, bloom: UnrealBloomPass | null = null;
  const frameHooks: ((now: number) => void)[] = [];

  function applyMode() {
    const env = makeEnv(mode, ...shot.sun[mode]);
    shot.tweak?.(env);
    renderer.toneMappingExposure = env.exposure;
    lights.apply(env); sky.apply(env, shot.orbit); water.apply(env);
    // The scripts' bloom is three small blurs; UnrealBloom spreads much wider, so it runs weaker and tighter.
    if (bloom) { bloom.strength = env.night ? 0.3 : 0.05; bloom.threshold = env.night ? 1.15 : 1.6; bloom.radius = 0.1; }
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!shotName) setShot(w < h ? "walkp" : "walk", false);
    renderer.setPixelRatio(Math.min(devicePixelRatio, TIERS[tier].pixelRatio));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (shot.shift[0] || shot.shift[1]) camera.setViewOffset(w, h, -shot.shift[0] * w, -shot.shift[1] * h, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    const buf = renderer.getDrawingBufferSize(new Vector2());
    sky.setSize(buf.x, buf.y);
    water.setSize(buf.x, buf.y, camera.fov);
    composer?.setPixelRatio(renderer.getPixelRatio());
    composer?.setSize(w, h);
  }

  function setShot(name: ShotName, pinned = true) {
    if (pinned) { shotName = name; input.enabled = false; }
    lastEye.set(NaN, NaN, NaN);
    shot = referenceShot(name, terrain);
    camera.position.copy(shot.eye);
    camera.fov = shot.fov;
    camera.lookAt(shot.target);
    trees.clearAround(shot.clear);
    skirt.visible = shot.orbit; // the underside only shows from the orbit views
    applyMode();
    if (pinned) resize();
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
    applyMode(); resize();
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

  shot = referenceShot("walk", terrain);
  setTier(tier);
  setShot(canvas.clientWidth < canvas.clientHeight ? "walkp" : "walk", false);
  resize();
  addEventListener("resize", resize);

  let resolveReady: () => void;
  const ready = new Promise<void>((r) => (resolveReady = r));
  let first = true, last = 0;
  renderer.setAnimationLoop((now) => {
    walk(Math.min(0.1, (now - last) / 1000 || 0)); // a long pause (a hidden tab) never becomes one huge step
    last = now;
    for (const f of frameHooks) f(now);
    camera.near = Math.max(0.1, camera.position.length() * 0.004); // tighter depth range for close shots
    camera.updateProjectionMatrix();
    renderer.info.reset();
    if (composer) composer.render(); else renderer.render(scene, camera);
    if (first) { first = false; resolveReady(); }
  });

  return {
    renderer, scene, camera, ready, state, terrain, trees, input, blocks,
    get tier() { return tier; },
    get mode() { return mode; },
    get shot() { return shot; },
    setMode(m: Mode) { mode = m; applyMode(); },
    setTier,
    /** Jumps the camera to a reference frame's set-up (debug mode). Walking input pauses until follow(). */
    setShot,
    /** Back to the walking camera behind the hiker. */
    follow() { shotName = null; input.enabled = true; resize(); },
    get following() { return !shotName; },
    /** Puts the hiker at a point on the loop and stops (debug screenshots). */
    setProgress(p: number) { state.set("progress", wrap(p)); input.stop(); },
    /** Drops the lens shift, for free looking around. */
    clearShift() { shot = { ...shot, shift: [0, 0] }; resize(); },
    onFrame(f: (now: number) => void) { frameHooks.push(f); },
  };
}
