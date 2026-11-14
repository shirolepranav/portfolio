// Debug mode at /lake?debug: frame counter, draw calls and triangles, a quality tier switch, a progress
// slider, the walking camera, and jumps to each reference shot (with a free camera) for screenshots.
// URL extras: &progress=0..1 puts the hiker there, &shot=<name> starts on a shot, &tier=low|medium|high,
// &stop=<id> opens a stop at once (no glide), &map=1 opens the map, &panel=0 hides the panel,
// &sweep=0..1 holds the day-to-night sweep at that point, &animals=0 hides the wildlife.
// Buttons: each prop's reaction on demand, the sweep (the page's day or night toggle), and wildlife on or off.
// From the console: clearance() checks the walking camera all round the loop, every stop shot, and the flights.
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TIERS, T_TRAIL, progressDeg, type Tier } from "./config";
import { VMAX } from "./input";
import { SHOTS, blocked, corridor, mapShot, stepSlide, walkShot, type Shot, type ShotName } from "./camera";
import { cross, lift, norm, smooth, type V3 } from "./core";
import { stopShot, stopSpot } from "./stops";
import { stopProgress, type StopId, type World } from "./index";

export function startDebug(world: World, params: URLSearchParams) {
  const { camera, renderer } = world;
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.addEventListener("start", () => world.clearShift());

  const tier = params.get("tier");
  if (tier && tier in TIERS) world.setTier(tier as Tier);
  const progress = params.get("progress");
  if (progress) world.setProgress(+progress);
  // A shot pins the camera and frees it for orbiting; follow hands it back to the walk.
  const jump = (name: ShotName) => { world.setShot(name); controls.enabled = true; controls.target.copy(world.shot.target); controls.update(); };
  const follow = () => { world.follow(); controls.enabled = false; };
  const start = params.get("shot");
  if (SHOTS.includes(start as ShotName)) jump(start as ShotName); else follow();
  // Open a stop or the map straight away, for screenshots.
  const openNow = (id: StopId) => { follow(); world.setProgress(stopProgress(id)); world.openStop(id); };
  const stop = params.get("stop") as StopId | null;
  if (stop && world.stops.includes(stop)) openNow(stop);
  if (params.get("map")) world.showMap(true);
  const sweep = params.get("sweep");
  if (sweep !== null) world.pinSweep(+sweep);

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
  const slider = Object.assign(document.createElement("input"), { type: "range", min: "0", max: "1", step: "0.001" });
  slider.style.cssText = "width:100%;margin-top:6px";
  slider.oninput = () => world.setProgress(+slider.value);
  panel.append(stats, slider, row(Object.keys(TIERS), (t) => world.setTier(t as Tier)), row(["follow", ...SHOTS], (s) => (s === "follow" ? follow() : jump(s as ShotName))),
    row([...world.stops, "map", "close"], (s) => (s === "map" ? world.showMap(true) : s === "close" ? world.close() : openNow(s as StopId))),
    row(world.stops.map((s) => `react ${s}`), (s) => world.react(s.slice(6) as StopId)),
    row(["sweep", "hold 0", "hold .25", "hold .5", "hold .75", "hold 1", "release", "animals"], (s) => {
      if (s === "sweep") document.querySelector<HTMLElement>("[data-mode-cycle]")?.click(); // the page's own toggle, so the HUD follows
      else if (s === "release") world.pinSweep(null);
      else if (s === "animals") world.setAnimals(!world.animals);
      else world.pinSweep(+s.slice(5));
    }));
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
    if (controls.enabled) controls.update();
    frames++;
    const p = world.state.get("progress");
    if (document.activeElement !== slider) slider.value = String(p);
    if (now - since < 1000) return;
    const all = { ...renderer.info.render }, main = mainPass();
    stats.textContent = `${((frames * 1000) / (now - since)).toFixed(0)} fps · ${world.tier} · progress ${p.toFixed(3)} (${progressDeg(p).toFixed(0)}°) · ` +
      `in view ${main.calls} calls ${k(main.triangles)} tris · all passes ${all.calls} calls ${k(all.triangles)} tris`;
    frames = 0; since = performance.now();
  });

  /**
   * Walks the camera round the whole loop at top speed, both ways (every 0.25°, looking ahead and 35° either side,
   * both orientations, with the slide past props eased as in play). Reports the closest the eye gets to the ground and
   * to any tree still standing, in metres, counts frames where a tree or prop is at the eye or in the sight line,
   * and gives the largest eye move between frames (walking alone moves it about 0.17 m).
   */
  function clearance() {
    const { terrain, trees, blocks } = world, S = 35, step = 0.25, dt = step / 360 / VMAX;
    let ground = Infinity, tree = Infinity, sight = 0, props = 0, jump = 0, worst = "";
    // Trees at the eye (gap in metres) and in the line from the eye to the hiker's chest (hits).
    const treeCheck = (eye: V3, chest: V3 | null) => {
      trees.spots.forEach((s, j) => {
        const k = trees.scale[j];
        if (!k) return;
        for (let n = 0; n <= (chest ? 8 : 0); n++) {
          const q = n / 8, p: V3 = chest ? [eye[0] + (chest[0] - eye[0]) * q, eye[1] + (chest[1] - eye[1]) * q, eye[2] + (chest[2] - eye[2]) * q] : eye;
          const up = (p[1] - s.p[1]) / (s.h * k); // 0 at the trunk foot, 1 at the tip
          if (up < 0 || up > 1) continue;
          const d = Math.hypot(p[0] - s.p[0], p[2] - s.p[2]) - s.r * k * (1 - up);
          if (n === 0) tree = Math.min(tree, d * S);
          if (d < 0) sight++;
        }
      });
    };
    const toV = (e: { x: number; y: number; z: number }): V3 => [e.x / S, e.y / S, -e.z / S];
    for (const portrait of [false, true])
      for (const look of [-35, 0, 35])
        for (const dir of [1, -1]) {
          let slide = 0, prev: V3 | null = null;
          for (let i = 0; i < 360 / step; i++) {
            const deg = dir > 0 ? -90 + i * step : 270 - i * step;
            slide = stepSlide(terrain, deg, dir, portrait, look, blocks, slide, dt);
            const shot = walkShot(terrain, deg, portrait, look, slide);
            trees.clearAround(shot.clear);
            const e = shot.eye, eye: V3 = [e.x / S, e.y / S, -e.z / S], hp = terrain.at(deg, T_TRAIL), chest = lift(hp, 0.035);
            const g = (eye[1] - terrain.ground(eye[0], eye[2])) * S;
            if (g < ground) ground = g;
            if (blocked(eye, hp, blocks)) props++;
            if (prev) jump = Math.max(jump, Math.hypot(eye[0] - prev[0], eye[1] - prev[1], eye[2] - prev[2]) * S);
            prev = eye;
            treeCheck(eye, chest);
          }
        }

    // Stop shots, and the flights into and out of them and up to the map, as the world blends them:
    // eye and aim eased between the two shots, held above the ground, trees cleared round the moving eye.
    const walk = { ground, tree, sight, props };
    ground = tree = Infinity; sight = props = 0;
    let flights = 0;
    const fly = (a: Shot, b: Shot, hiker: (k: number) => V3 | null, what: string) => {
      for (let i = 0; i <= 40; i++) {
        const k = smooth(0, 1, i / 40), e = a.eye.clone().lerp(b.eye, k), t = a.target.clone().lerp(b.target, k), eye = toV(e);
        eye[1] = Math.max(eye[1], terrain.ground(eye[0], eye[2]) + 0.03);
        const vd = norm([t.x - e.x, 0, -(t.z - e.z)]);
        trees.clearAround(i === 40 ? b.clear : corridor(eye, vd, cross([0, 1, 0], vd), 0.3));
        const g = (eye[1] - terrain.ground(eye[0], eye[2])) * S;
        if (g < ground) { ground = g; worst = `${what} at ${(i / 40).toFixed(2)}`; }
        const hp = hiker(k), before = sight;
        treeCheck(eye, hp && lift(hp, 0.035));
        if (sight > before) console.warn("tree in view:", what, (i / 40).toFixed(2));
        if (hp && blocked(eye, hp, blocks)) { props++; console.warn("prop in view:", what, (i / 40).toFixed(2)); }
      }
      flights++;
    };
    const mix = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    for (const portrait of [false, true]) {
      const map = mapShot(terrain, portrait);
      for (const id of world.stops) {
        const deg = progressDeg(stopProgress(id)), trail = terrain.at(deg, T_TRAIL), spot = stopSpot(terrain, id).p;
        let slide = 0;
        for (let i = 0; i < 30; i++) slide = stepSlide(terrain, deg, 1, portrait, 0, blocks, slide, 0.05);
        const w = walkShot(terrain, deg, portrait, 0, slide), s = stopShot(terrain, id, portrait);
        const out = (k: number) => mix(trail, spot, smooth(0, 1, k * 1.2)); // the hiker walks out a little behind the camera
        fly(w, s, out, `${id} open${portrait ? " portrait" : ""}`);
        fly(s, w, (k) => out(1 - k), `${id} close${portrait ? " portrait" : ""}`);
        fly(w, map, () => null, `${id} map${portrait ? " portrait" : ""}`);
        fly(map, w, () => null, `${id} map back${portrait ? " portrait" : ""}`);
        fly(s, map, () => null, `${id} stop to map${portrait ? " portrait" : ""}`);
      }
    }
    follow();
    const out = {
      minGroundGapM: +walk.ground.toFixed(2), minTreeGapM: +walk.tree.toFixed(2), treeSightHits: walk.sight, propHits: walk.props, maxEyeStepM: +jump.toFixed(2),
      stopsAndFlights: flights, flightMinGroundGapM: +ground.toFixed(2), flightMinTreeGapM: +tree.toFixed(2), flightTreeSightHits: sight, flightPropHits: props, lowest: worst,
    };
    console.table(out);
    return out;
  }
  Object.assign(window, { world, clearance }); // for measurements from the console
}
