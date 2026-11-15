// Debug mode at /lake?debug: frame counter, draw calls and triangles, a quality tier switch, a progress
// slider, the walking camera, and jumps to each reference shot (with a free camera) for screenshots.
// URL extras: &progress=0..1 puts the hiker there, &shot=<name> starts on a shot, &tier=low|medium|high,
// &stop=<id> opens a stop at once (no glide), &map=1 opens the map, &panel=0 hides the panel,
// &sweep=0..1 holds the day-to-night sweep at that point, &animals=0 hides the wildlife.
// Tiers: &govern=0 turns the step-down off (fixed-tier screenshots); &slow=<ms> burns that many ms of main thread per
// frame, to force a low frame rate and watch the step-down (also the "slow" buttons). "lose context" tests the fallback.
// Buttons: each prop's reaction on demand, the sweep (the page's day or night toggle), and wildlife on or off.
// After the dive or the flight back up, the panel shows its frame count, worst frame and frames over 20 ms.
// From the console: clearance() checks the walking camera all round the loop, every stop shot, the flights and the
// dive, against trees, props and the wildlife; wildlifeTrail() checks no animal ever steps onto the trail.
// The landing (/?debug) takes the same tools; world.turn sets the island's turn for frame-exact screenshots.
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Raycaster, SkinnedMesh, Vector3 } from "three";
import { radius } from "./terrain";
import { TIERS, T_TRAIL, progressDeg, type Tier } from "./config";
import { VMAX } from "./input";
import { SHOTS, blocked, corridor, diveEase, divePath, landingShot, mapShot, stepSlide, walkShot, type Shot, type ShotName } from "./camera";
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
  if (params.get("govern") === "0") world.governor.enabled = false;
  // Forced slowness: a busy loop on every frame, so the real frame rate drops as on a weak phone.
  let slow = +(params.get("slow") ?? 0) || 0;
  world.onFrame(() => { const end = performance.now() + slow; while (performance.now() < end); });
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
    row(["slow 0", "slow 15", "slow 25", "slow 40", "govern on/off", "lose context"], (s) => {
      if (s.startsWith("slow")) slow = +s.slice(5);
      else if (s === "lose context") renderer.getContext().getExtension("WEBGL_lose_context")?.loseContext();
      else world.governor.enabled = !world.governor.enabled;
    }),
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

  // The dive (or the flight back up): every frame's interval, summed up in the panel once it lands, for checking on a phone.
  const diveLine = document.createElement("div");
  let gaps: number[] | null = null, lastNow = 0;
  world.state.on("view", (v) => {
    if (v === "dive") { gaps = []; return; }
    if (!gaps?.length) return;
    const worst = Math.max(...gaps), slow = gaps.filter((g) => g > 20).length;
    diveLine.textContent = `last flight: ${gaps.length} frames · worst ${worst.toFixed(1)} ms · ${slow} over 20 ms`;
    console.info(diveLine.textContent, gaps);
    gaps = null;
  });
  panel.append(diveLine);
  // The step-down: every step so far, with the time since load and the window's average.
  const tierLine = document.createElement("div");
  document.addEventListener("lake:tier", () => {
    tierLine.textContent = "steps: " + world.governor.log.map((e) => `${e.at.toFixed(1)} s ${e.from}→${e.to} (${e.fps.toFixed(0)} fps)`).join(", ");
  });
  panel.append(tierLine);

  // Frames per second over one-second windows. "All" counts every pass of the last frame: shadow, mirror, camera, glow.
  let frames = 0, since = performance.now();
  world.onFrame((now) => {
    if (gaps && lastNow) gaps.push(now - lastNow);
    lastNow = now;
    if (controls.enabled) controls.update();
    frames++;
    const p = world.state.get("progress");
    if (document.activeElement !== slider) slider.value = String(p);
    if (now - since < 1000) return;
    const all = { ...renderer.info.render }, main = mainPass();
    const g = world.governor, gfps = Number.isNaN(g.fps) ? "–" : g.fps.toFixed(0);
    stats.textContent = `${((frames * 1000) / (now - since)).toFixed(0)} fps · ${world.tier} (step-down ${g.enabled ? `on, 3 s avg ${gfps}` : "off"}) · ` +
      `cpu ${world.cpuMs.toFixed(1)} ms/frame${slow ? ` (slow +${slow})` : ""} · progress ${p.toFixed(3)} (${progressDeg(p).toFixed(0)}°) · ` +
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
    // Wildlife: every place each animal can reach, as spheres. Counts the eye inside one, a sphere across the line
    // from the eye to the hiker's chest, and a view-corridor point inside one; tracks the eye's closest approach.
    const spheres = world.actors.flatMap((a, i) => a.bounds.map((b) => ({ c: toV(b.p), r: b.r / S, i })));
    const wild = { eye: Infinity, sight: 0, corridor: 0 }, byAnimal: Record<number, number> = {};
    // The exact check while walking: the animals live (elk turn to watch the hiker go by), and their posed meshes
    // are raycast along the line from the eye to the hiker's chest and along the view corridor's middle.
    // Only animals whose reach spheres touch those lines are raycast.
    const meshes: SkinnedMesh[][] = world.actors.map((a) => { const m: SkinnedMesh[] = []; a.object.traverse((o) => { if (o instanceof SkinnedMesh) m.push(o); }); return m; });
    const ray = new Raycaster(), from = new Vector3(), to = new Vector3(), hikerW = new Vector3(), eyeW = new Vector3();
    let sightMesh = 0, corridorMesh = 0, worstMesh = Infinity, clock = 0, label = "";
    const hitBetween = (a: V3, b: V3, list: SkinnedMesh[]) => {
      from.set(a[0] * S, a[1] * S, -a[2] * S); to.set(b[0] * S, b[1] * S, -b[2] * S);
      const len = from.distanceTo(to);
      ray.set(from, to.sub(from).normalize()); ray.far = len;
      return ray.intersectObjects(list, false);
    };
    const meshCheck = (eye: V3, chest: V3, clear: V3[], hp: V3, step: number) => {
      clock += step;
      hikerW.set(hp[0] * S, hp[1] * S, -hp[2] * S);
      world.actors.forEach((a, i) => {
        if (a.bounds.every((b) => b.p.distanceTo(hikerW) > 40)) return; // far away: nothing to check or animate
        a.update({ dt: step, t: clock, hiker: hikerW, eye: eyeW.set(eye[0] * S, eye[1] * S, -eye[2] * S), night: 0, ripple: () => {} });
        const own = spheres.filter((q) => q.i === i);
        const near = (p: V3, q: V3) => own.some(({ c, r }) => {
          const ab: V3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
          const k = Math.max(0, Math.min(1, ((c[0] - p[0]) * ab[0] + (c[1] - p[1]) * ab[1] + (c[2] - p[2]) * ab[2]) / l2));
          return Math.hypot(p[0] + ab[0] * k - c[0], p[1] + ab[1] * k - c[1], p[2] + ab[2] * k - c[2]) < r;
        });
        const mid = clear.filter((_, j) => j % 3 === 1);           // the corridor's centre line
        const far = mid[mid.length - 1];
        if (!near(eye, chest) && !near(eye, far)) return;
        a.object.updateMatrixWorld(true);
        for (const m of meshes[i]) { m.skeleton.update(); m.computeBoundingSphere(); }
        const hit = hitBetween(eye, chest, meshes[i]);
        if (hit.length) {
          sightMesh++;
          const base = a.object.getWorldPosition(new Vector3()), h = hit[0].point.y - base.y;
          console.warn("animal hides the hiker:", i, label, `hit ${h.toFixed(2)} m up, ${hit[0].point.distanceTo(hikerW).toFixed(1)} m from hiker, eye ${(eye[1] * S - base.y).toFixed(1)} m up`);
        }
        if (hitBetween(eye, far, meshes[i]).length) corridorMesh++;
        // The eye's true closest approach to the animal: its nearest vertex, measured when the bounds come close.
        from.set(eye[0] * S, eye[1] * S, -eye[2] * S);
        for (const m of meshes[i]) {
          const bs = m.boundingSphere!.clone().applyMatrix4(m.matrixWorld);
          if (bs.center.distanceTo(from) - bs.radius > worstMesh) continue;
          for (let k = 0, n = m.geometry.attributes.position.count; k < n; k += 2) {
            m.getVertexPosition(k, to); m.localToWorld(to);
            worstMesh = Math.min(worstMesh, to.distanceTo(from));
          }
        }
      });
    };
    const animalCheck = (eye: V3, chest: V3 | null, clear: V3[]) => {
      for (const { c, r, i } of spheres) {
        const d = Math.hypot(eye[0] - c[0], eye[1] - c[1], eye[2] - c[2]) - r;
        wild.eye = Math.min(wild.eye, d * S);
        if (chest) {
          const ab: V3 = [chest[0] - eye[0], chest[1] - eye[1], chest[2] - eye[2]], l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
          const k = Math.max(0, Math.min(1, ((c[0] - eye[0]) * ab[0] + (c[1] - eye[1]) * ab[1] + (c[2] - eye[2]) * ab[2]) / l2));
          if (Math.hypot(eye[0] + ab[0] * k - c[0], eye[1] + ab[1] * k - c[1], eye[2] + ab[2] * k - c[2]) < r) { wild.sight++; byAnimal[i] = (byAnimal[i] ?? 0) + 1; }
        }
        if (clear.some((q) => Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]) < r)) wild.corridor++;
      }
    };
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
            animalCheck(eye, chest, shot.clear);
            label = `${portrait ? "portrait" : "landscape"} look ${look} dir ${dir} deg ${deg.toFixed(1)}`;
            meshCheck(eye, chest, shot.clear, hp, dt);
          }
        }
    const walkWild = { ...wild, sightMesh, corridorMesh, worstMesh: +worstMesh.toFixed(2) };
    Object.assign(wild, { eye: Infinity, sight: 0, corridor: 0 });

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
        const hp = hiker(k), before = sight, wildBefore = wild.sight + wild.corridor;
        treeCheck(eye, hp && lift(hp, 0.035));
        animalCheck(eye, hp && lift(hp, 0.035), i === 40 ? b.clear : corridor(eye, vd, cross([0, 1, 0], vd), 0.3));
        if (wild.sight + wild.corridor > wildBefore) console.warn("animal in view:", what, (i / 40).toFixed(2));
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
    // The dive (and the flight back up, which retraces it): the hiker anywhere on the loop (every 15 degrees), the
    // landing island turned four ways, both orientations, every frame at 60 fps, with trees cleared as in play.
    // The eye's height is measured on the raw curve, before the one-metre floor. Trees, props and animals in the
    // sight line to the hiker count over the last second, as the camera settles behind the hiker.
    // Animals on the dive, exactly: any animal whose reach comes within 10 m of the eye, or (over the last second)
    // crosses the sight line, is posed at that moment; its mesh's nearest vertex to the eye is measured, and the
    // sight line is raycast against it.
    const segDist = (p: V3, q: V3, c: V3) => {
      const ab: V3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
      const k = Math.max(0, Math.min(1, ((c[0] - p[0]) * ab[0] + (c[1] - p[1]) * ab[1] + (c[2] - p[2]) * ab[2]) / l2));
      return Math.hypot(p[0] + ab[0] * k - c[0], p[1] + ab[1] * k - c[1], p[2] + ab[2] * k - c[2]);
    };
    const dm = { gap: Infinity, sight: 0, who: "" };
    const diveAnimals = (eye: V3, chest: V3 | null, hp: V3, dt: number) => {
      clock += dt;
      hikerW.set(hp[0] * S, hp[1] * S, -hp[2] * S);
      eyeW.set(eye[0] * S, eye[1] * S, -eye[2] * S);
      world.actors.forEach((a, i) => {
        const own = spheres.filter((q) => q.i === i);
        const close = own.some(({ c, r }) => Math.hypot(eye[0] - c[0], eye[1] - c[1], eye[2] - c[2]) < r + 10 / S);
        const line = !!chest && own.some(({ c, r }) => segDist(eye, chest, c) < r);
        if (!close && !line) return;
        a.update({ dt, t: clock, hiker: hikerW, eye: eyeW, night: 0, ripple: () => {} });
        a.object.updateMatrixWorld(true);
        for (const m of meshes[i]) { m.skeleton.update(); m.computeBoundingSphere(); }
        if (line && hitBetween(eye, chest!, meshes[i]).length) { dm.sight++; console.warn("animal hides the hiker on the dive:", i, label); }
        for (const m of meshes[i])
          for (let k = 0, n = m.geometry.attributes.position.count; k < n; k += 2) {
            m.getVertexPosition(k, to); m.localToWorld(to);
            const d = to.distanceTo(eyeW);
            if (d < dm.gap) { dm.gap = d; dm.who = `animal ${i}, ${label}`; }
          }
      });
    };
    const flight = { ground, tree, sight, props }, flightWild = { ...wild };
    ground = tree = Infinity; sight = props = 0;
    Object.assign(wild, { eye: Infinity, sight: 0, corridor: 0 });
    let dives = 0, floor = 0, speed = 0, diveWorst = "";
    const FRAMES = 150; // 2.5 s at 60 fps
    for (const portrait of [false, true])
      for (const spin of [0, 90, 180, 270])
        for (let deg = -90; deg < 270; deg += 15) {
          const w = walkShot(terrain, deg, portrait, 0, stepSlide(terrain, deg, 1, portrait, 0, blocks, 0, 10));
          const path = divePath(terrain, landingShot(terrain, portrait, portrait ? 390 / 844 : 1.6, spin), w, deg);
          const hp = terrain.at(deg, T_TRAIL), chest = lift(hp, 0.035);
          let prev: V3 | null = null;
          for (let i = 0; i <= FRAMES; i++) {
            const u = diveEase(i / FRAMES), shot = path.at(u), raw = toV(path.curve.getPointAt(u)), eye = toV(shot.eye), late = i >= FRAMES - 60;
            label = `${portrait ? "portrait" : "landscape"} spin ${spin} hiker at ${deg} deg, ${(i / 60).toFixed(2)} s in`;
            trees.clearAround(shot.clear);
            const g = (raw[1] - terrain.ground(raw[0], raw[2])) * S;
            if (g < ground) { ground = g; diveWorst = label; }
            if (g < 0.03 * S) floor++;
            if (prev) speed = Math.max(speed, Math.hypot(eye[0] - prev[0], eye[1] - prev[1], eye[2] - prev[2]) * S * 60);
            prev = eye;
            treeCheck(eye, late ? chest : null);
            animalCheck(eye, late ? chest : null, shot.clear);
            diveAnimals(eye, late ? chest : null, hp, 1 / 60);
            if (late && blocked(eye, hp, blocks)) { props++; console.warn("prop hides the hiker on the dive:", label); }
          }
          dives++;
        }
    follow();
    const out = {
      minGroundGapM: +walk.ground.toFixed(2), minTreeGapM: +walk.tree.toFixed(2), treeSightHits: walk.sight, propHits: walk.props, maxEyeStepM: +jump.toFixed(2),
      stopsAndFlights: flights, flightMinGroundGapM: +flight.ground.toFixed(2), flightMinTreeGapM: +flight.tree.toFixed(2), flightTreeSightHits: flight.sight, flightPropHits: flight.props, lowest: worst,
      walkAnimalSightHits: walkWild.sightMesh, walkAnimalCorridorHits: walkWild.corridorMesh, walkMinAnimalGapM: walkWild.worstMesh,
      walkReachSphereSightHits: walkWild.sight, walkReachSphereCorridorHits: walkWild.corridor, walkMinReachSphereGapM: +walkWild.eye.toFixed(2),
      flightAnimalSightHits: flightWild.sight, flightAnimalCorridorHits: flightWild.corridor, flightMinAnimalGapM: +flightWild.eye.toFixed(2),
      dives, diveMinGroundGapM: +ground.toFixed(2), diveLowest: diveWorst, diveFramesUnderOneMetre: floor, diveMinTreeGapM: +tree.toFixed(2),
      diveTreeSightHits: sight, divePropHits: props, diveAnimalSightHits: dm.sight, diveMinAnimalGapM: +dm.gap.toFixed(2), diveClosestAnimal: dm.who,
      diveReachSphereSightHits: wild.sight, diveReachSphereCorridorHits: wild.corridor, diveMinReachSphereGapM: +wild.eye.toFixed(2),
      diveTopSpeedMps: +speed.toFixed(0),
    };
    console.table(out);
    if (Object.keys(byAnimal).length) console.warn("animal sight hits by animal:", JSON.stringify(byAnimal));
    return out;
  }

  /**
   * Runs every animal through 48 s of its behaviour (with the hiker near and far) and measures how close any part
   * of any animal comes to the trail's edge, in metres. Negative would mean a hoof on the trail.
   */
  function wildlifeTrail() {
    const S = 35, v = new Vector3(), near = new Vector3(), far = new Vector3(0, -999, 0);
    let gap = Infinity, who = "";
    const each: Record<string, number> = {};
    const names = ["elk 5°", "elk 49°", "elk 53.5°", "elk -52°", "bears", "moose", "birds"];
    for (let t = 0; t < 48; t += 0.25) {
      world.actors.forEach((a, i) => {
        // The hiker stands on the trail beside each animal half the time, so the elk turn to look.
        const p = a.bounds[0].p;
        near.copy(p).multiplyScalar(0.92).setY(p.y);
        a.update({ dt: 0.25, t, hiker: t % 8 < 4 ? near : far, eye: far, night: 0, ripple: () => {} });
        a.object.updateMatrixWorld(true);
        a.object.traverse((o) => {
          if (!(o instanceof SkinnedMesh)) return;
          o.skeleton.update();
          const n = o.geometry.attributes.position.count;
          for (let k = 0; k < n; k += 5) {
            o.getVertexPosition(k, v); o.localToWorld(v);
            const x = v.x / S, z = -v.z / S, th = Math.atan2(z, x), r = Math.hypot(x, z);
            const edge = r < radius(1.085, th) ? r - radius(1.065, th) : radius(1.105, th) - r; // inside the band: positive
            const g = -edge * S;
            if (g < gap) { gap = g; who = names[i]; }
            each[names[i]] = Math.min(each[names[i]] ?? Infinity, +g.toFixed(2));
          }
        });
      });
    }
    const out = { minGapToTrailEdgeM: +gap.toFixed(2), closest: who, each };
    console.table(out);
    return out;
  }
  Object.assign(window, { world, clearance, wildlifeTrail }); // for measurements from the console
}
