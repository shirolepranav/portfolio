// Starts the lake on its canvas: builds the world, then the HUD over it. Both / and /lake call it (through
// src/ui/landing.ts); the landing starts the world on the island orbit, ready to dive in.
// If WebGL can't start, or the context is lost later, it shows the fallback instead (PLAN.md, Loading and fallbacks).
import { createWorld, pickTier, type StopId, type World } from "../world/index";
import { TIERS, type Tier } from "../world/config";
import type { GovernorEvent } from "../world/governor";
import { startHud } from "./hud";

const root = document.documentElement;
const TIER_KEY = "lake:tier"; // a stepped-down tier is kept for the browser session, so a reload doesn't start high

/** Shows the fallback: "needs 3D" (no WebGL) or "stopped drawing" (lost). The page hears of it as "lake:failed". */
function fail(kind: "nogl" | "lost") {
  if (root.dataset.lake === "failed") return;
  root.dataset.lake = "failed";
  root.dataset.fail = kind;
  const words = JSON.parse(document.querySelector<HTMLElement>("[data-fallback-words]")!.dataset.fallbackWords!);
  for (const el of document.querySelectorAll("[data-off-title]")) el.textContent = kind === "lost" ? words.lost : words.nogl;
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-retry]")) b.onclick = () => location.reload();
  const card = document.querySelector<HTMLElement>("[data-fallback]")!;
  card.hidden = false;
  // On the lake, focus moves to the card so a screen reader hears it; the landing's message is a live region.
  const page = document.querySelector<HTMLElement>(".lake")!.dataset.page;
  if (page !== "landing") requestAnimationFrame(() => card.querySelector<HTMLElement>("h2")!.focus({ preventScroll: true }));
  document.dispatchEvent(new CustomEvent("lake:failed", { detail: kind }));
}

export async function startLake(landing = false): Promise<World | null> {
  const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
  const params = new URLSearchParams(location.search);
  const modeNow = () => (root.dataset.mode === "night" ? "night" : "day");
  performance.mark("world:start"); // the 3D code has arrived and starts building
  root.dataset.lake = "building";
  // The visitor's place on the loop is remembered for the browser session (storage can be blocked).
  // Day or night is remembered by the toggle itself.
  const KEY = "lake:progress";
  const read = (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } };
  const saved = read(KEY), savedTier = read(TIER_KEY);
  const opts = JSON.parse(canvas.dataset.world!) as { tents: number; canoes: number; stops: StopId[] };
  // A /lake#<stop> address starts at that stop with its panel open.
  const hash = location.hash.slice(1) as StopId;

  // Let the progress line paint before the build starts.
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r)));
  let hud: ReturnType<typeof startHud> | undefined;
  let world: World;
  try {
    world = await createWorld(canvas, {
      ...opts, mode: modeNow(), landing,
      tier: savedTier && savedTier in TIERS ? (savedTier as Tier) : pickTier(),
      // A new session's first dive lands at the Trailhead; /lake on its own starts where the walking still stands.
      progress: saved && isFinite(+saved) ? +saved : landing ? 0 : undefined,
      open: !landing && opts.stops.includes(hash) ? hash : null,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      onCommand: (c) => hud?.command(c),
      onTier: (e: GovernorEvent) => {
        if (e.to !== "still") try { sessionStorage.setItem(TIER_KEY, e.to); } catch {}
        console.info(`[tier] ${e.from} -> ${e.to} at ${e.at.toFixed(1)} s (${e.fps.toFixed(1)} fps over 3 s)`);
        document.dispatchEvent(new CustomEvent("lake:tier", { detail: e }));
      },
      onLost: () => fail("lost"),
    });
  } catch (err) {
    // No WebGL 2 (blocked, switched off or unsupported), or the first shader compile failed.
    console.warn("The 3D lake could not start:", err);
    fail("nogl");
    return null;
  }
  hud = startHud(world);
  addEventListener("pagehide", () => { try { sessionStorage.setItem(KEY, String(world.state.get("progress"))); } catch {} });
  // Follow the day and night toggle; the world has no toggle of its own.
  new MutationObserver(() => world.setMode(modeNow())).observe(root, { attributes: true, attributeFilter: ["data-mode"] });
  if (params.has("debug")) import("../world/debug").then((m) => m.startDebug(world, params));
  world.ready.then(() => { if (!world.lost) root.dataset.lake = "ready"; });
  return world;
}
