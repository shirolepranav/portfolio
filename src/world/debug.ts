// Debug mode at /lake?debug: free camera, frame counter, draw calls and triangles, a quality tier switch,
// and jumps to each reference shot so screenshots can sit beside reference/frames.
// URL extras: &shot=<name> starts on a shot, &tier=low|medium|high, &panel=0 hides the panel.
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TIERS, type Tier } from "./config";
import { SHOTS, type ShotName } from "./camera";
import type { World } from "./index";

export function startDebug(world: World, params: URLSearchParams) {
  const { camera, renderer } = world;
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.addEventListener("start", () => world.clearShift());

  const tier = params.get("tier");
  if (tier && tier in TIERS) world.setTier(tier as Tier);
  const jump = (name: ShotName) => { world.setShot(name); controls.target.copy(world.shot.target); controls.update(); };
  const start = params.get("shot");
  jump(SHOTS.includes(start as ShotName) ? (start as ShotName) : innerWidth < innerHeight ? "walkp" : "walk");

  const panel = document.createElement("div");
  panel.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:50;padding:8px 10px;border-radius:10px;background:rgb(11 22 32/.8);" +
    "color:#f3efe8;font:12px/1.5 ui-monospace,monospace;max-width:calc(100vw - 16px)";
  if (params.get("panel") === "0") panel.style.display = "none";
  const stats = document.createElement("div");
  const row = (items: string[], on: (v: string) => void) => {
    const r = document.createElement("div");
    for (const v of items) {
      const b = document.createElement("button");
      b.textContent = v;
      b.style.cssText = "margin:4px 4px 0 0;padding:2px 6px;font:inherit;cursor:pointer";
      b.onclick = () => on(v);
      r.append(b);
    }
    return r;
  };
  panel.append(stats, row(Object.keys(TIERS), (t) => world.setTier(t as Tier)), row([...SHOTS], (s) => jump(s as ShotName)));
  document.body.append(panel);

  // The camera's own pass alone: one extra render without the shadow map and the lake mirror.
  const { scene } = world;
  const mainPass = () => {
    const water = scene.children.find((o) => (o as { isReflector?: boolean }).isReflector)!;
    const reflect = water.onBeforeRender, auto = renderer.shadowMap.autoUpdate;
    water.onBeforeRender = () => {}; renderer.shadowMap.autoUpdate = false;
    renderer.info.reset(); renderer.render(scene, camera);
    const { calls, triangles } = renderer.info.render;
    water.onBeforeRender = reflect; renderer.shadowMap.autoUpdate = auto;
    return { calls, triangles };
  };
  const k = (n: number) => `${(n / 1000).toFixed(0)}k`;

  // Frames per second over one-second windows. "All" counts every pass of the last frame: shadow, mirror, camera, glow.
  let frames = 0, since = performance.now();
  world.onFrame((now) => {
    controls.update();
    frames++;
    if (now - since < 1000) return;
    const all = { ...renderer.info.render }, main = mainPass();
    stats.textContent = `${((frames * 1000) / (now - since)).toFixed(0)} fps · ${world.tier} · in view ${main.calls} calls ${k(main.triangles)} tris · all passes ${all.calls} calls ${k(all.triangles)} tris`;
    frames = 0; since = performance.now();
  });
  Object.assign(window, { world }); // for measurements from the console
}
