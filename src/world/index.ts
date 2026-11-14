// createWorld(): the only entry point to the 3D lake. It knows nothing about copy;
// the page passes in what it needs (prop counts, day or night, quality tier).
import {
  CustomToneMapping, LinearSRGBColorSpace, Mesh, PCFShadowMap, PerspectiveCamera, Scene, Vector2, WebGLRenderer,
} from "three";
import type { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import type { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ANIMALS, STOPS, TIERS, type Mode, type Tier } from "./config";
import { MeshBuilder } from "./core";
import { createTerrain } from "./terrain";
import { createLanterns, createRocks, createTrees, type Rock } from "./flora";
import { buildProps, createPropContext, type PropCounts, type PropLight } from "./props/index";
import { createLights, makeEnv, worldMaterial } from "./lighting";
import { createSky } from "./sky";
import { createWater } from "./water";
import { referenceShot, type Shot, type ShotName } from "./camera";

export type { Mode, Tier } from "./config";
export type { ShotName } from "./camera";
export interface WorldOptions extends PropCounts { mode: Mode; tier?: Tier }
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
  const mesh = new MeshBuilder(), lightList: PropLight[] = [], rockList: Rock[] = [];
  buildProps(createPropContext(mesh, terrain, lightList, rockList), opts);
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
    if (pinned) shotName = name;
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
    material.needsUpdate = true; // shadows on or off change the shader
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
  let first = true;
  renderer.setAnimationLoop((now) => {
    for (const f of frameHooks) f(now);
    camera.near = Math.max(0.1, camera.position.length() * 0.004); // tighter depth range for close shots
    camera.updateProjectionMatrix();
    renderer.info.reset();
    if (composer) composer.render(); else renderer.render(scene, camera);
    if (first) { first = false; resolveReady(); }
  });

  return {
    renderer, scene, camera, ready,
    get tier() { return tier; },
    get mode() { return mode; },
    get shot() { return shot; },
    setMode(m: Mode) { mode = m; applyMode(); },
    setTier,
    /** Jumps the camera to a reference frame's set-up (debug mode). */
    setShot,
    /** Drops the lens shift, for free looking around. */
    clearShift() { shot = { ...shot, shift: [0, 0] }; resize(); },
    onFrame(f: (now: number) => void) { frameHooks.push(f); },
  };
}
