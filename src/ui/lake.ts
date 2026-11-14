// Starts the lake on its canvas: builds the world, then the HUD over it. /lake calls it on load. The landing calls it
// once the page has loaded, with the world starting on the island orbit, ready to dive in.
import { createWorld, type StopId } from "../world/index";
import { startHud } from "./hud";

export async function startLake(landing = false) {
  const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
  const root = document.documentElement;
  const params = new URLSearchParams(location.search);
  const modeNow = () => (root.dataset.mode === "night" ? "night" : "day");
  root.dataset.lake = "building";
  // The visitor's place on the loop is remembered for the browser session (storage can be blocked).
  // Day or night is remembered by the toggle itself.
  const KEY = "lake:progress";
  const saved = (() => { try { return sessionStorage.getItem(KEY); } catch { return null; } })();
  const opts = JSON.parse(canvas.dataset.world!) as { tents: number; canoes: number; stops: StopId[] };
  // A /lake#<stop> address starts at that stop with its panel open.
  const hash = location.hash.slice(1) as StopId;

  // Let the progress line paint before the build starts.
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r)));
  let hud: ReturnType<typeof startHud> | undefined;
  const world = await createWorld(canvas, {
    ...opts, mode: modeNow(), landing,
    // A new session's first dive lands at the Trailhead; /lake on its own starts where the walking still stands.
    progress: saved && isFinite(+saved) ? +saved : landing ? 0 : undefined,
    open: !landing && opts.stops.includes(hash) ? hash : null,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    onCommand: (c) => hud?.command(c),
  });
  hud = startHud(world);
  addEventListener("pagehide", () => { try { sessionStorage.setItem(KEY, String(world.state.get("progress"))); } catch {} });
  // Follow the day and night toggle; the world has no toggle of its own.
  new MutationObserver(() => world.setMode(modeNow())).observe(root, { attributes: true, attributeFilter: ["data-mode"] });
  if (params.has("debug")) import("../world/debug").then((m) => m.startDebug(world, params));
  world.ready.then(() => (root.dataset.lake = "ready"));
  return world;
}
