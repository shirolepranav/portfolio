// The landing and the lake share one page shell, one canvas and one world. / starts on the landing: the live island
// fades in over the still, turns slowly, bobs and spins on drag, and the desktop stop pins follow their props.
// "Walk the lake" dives into the lake with no reload (the address becomes /lake); back flies up again, forward dives
// back in. /lake starts in the lake, and its logo pill flies up to the landing the same way.
// It also keeps the landmarks and focus right as the two swap, and handles the landing's fallbacks.
import { startLake } from "./lake";
import { onLake } from "./hud";
import type { GovernorEvent } from "../world/governor";
import type { StopId } from "../world/index";

export async function startLanding() {
  const root = document.documentElement;
  const landing = document.querySelector<HTMLElement>(".landing")!, lake = document.querySelector<HTMLElement>(".lake")!;
  const walk = landing.querySelector<HTMLAnchorElement>("a.walk")!;
  const titles = { landing: lake.dataset.landingTitle!, lake: lake.dataset.title! };

  /** landing: the text is up. dive: the camera is flying down or up. lake: walking, with the HUD. */
  const setPage = (p: "landing" | "dive" | "lake") => {
    lake.dataset.page = landing.dataset.page = p;
    landing.inert = p !== "landing";
    // One main landmark at a time: the landing's text while it is up, the lake shell otherwise.
    // The island behind the landing text is decoration, so the lake shell is hidden from screen readers then.
    if (p === "landing") { landing.setAttribute("role", "main"); lake.removeAttribute("role"); lake.setAttribute("aria-hidden", "true"); }
    else { lake.setAttribute("role", "main"); landing.removeAttribute("role"); lake.removeAttribute("aria-hidden"); }
    document.title = p === "landing" ? titles.landing : titles.lake;
  };
  // Focus goes where the visitor now is, unless they already moved it somewhere still on screen.
  const focusIfLost = (el: HTMLElement, from: HTMLElement) => {
    const a = document.activeElement;
    if (!a || a === document.body || from.contains(a)) el.focus({ preventScroll: true });
  };

  // If the 3D can't start, the landing's message has already replaced the walk button (src/ui/lake.ts).
  const started = await startLake(lake.dataset.page === "landing");
  if (!started) return;
  const world = started;
  landing.querySelector("[data-sound]")?.setAttribute("data-live", ""); // the HUD drives the sound button from here on
  const { state } = world;

  // Low power (governor.ts): still under 30 fps on the low tier, so the landing shows its still and stops drawing
  // while it is up. The dive wakes the world again.
  let lowPower = false;
  const still = (on: boolean) => {
    if (on) root.dataset.still = ""; else delete root.dataset.still;
    world.pause(on);
  };
  document.addEventListener("lake:tier", (e) => {
    if ((e as CustomEvent<GovernorEvent>).detail.to !== "still") return;
    lowPower = true;
    if (state.get("view") === "landing") still(true);
  });

  // A lost context mid-flight: the flight never lands, so settle on the page the address says.
  document.addEventListener("lake:failed", () => setPage(onLake() ? "lake" : "landing"));

  // The landing text lifts away as the camera drops, and the HUD fades in once the dive lands.
  async function down() {
    if (lowPower) still(false);
    setPage("dive");
    await world.dive(true);
    if (!onLake()) return;
    setPage("lake");
    focusIfLost(lake.querySelector<HTMLElement>(".lake-title")!, landing);
  }
  // Back: the camera flies up, and the text drops back in as it arrives (CSS delays it).
  async function up() {
    setPage("landing");
    await world.dive(false);
    if (onLake()) return;
    focusIfLost(walk, lake);
    if (lowPower) still(true);
  }

  walk.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button || state.get("view") !== "landing" || world.lost) return; // a new tab: a plain link
    e.preventDefault();
    history.pushState(null, "", walk.pathname + location.search);
    void down();
  });
  // The lake's logo pill: up to the landing on the same canvas, as a new history entry (back dives in again).
  lake.querySelector<HTMLAnchorElement>("[data-home]")?.addEventListener("click", (e) => {
    const view = state.get("view");
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button || view === "landing" || view === "dive" || world.lost) return;
    e.preventDefault();
    history.pushState(null, "", "/" + location.search);
    void up();
  });
  addEventListener("popstate", () => {
    const view = state.get("view");
    if (world.lost) { setPage(onLake() ? "lake" : "landing"); return; }
    if (onLake() && view === "landing") void down();
    else if (!onLake() && view !== "landing" && view !== "dive") void up();
  });

  // Desktop pins: each one keeps its drawn place beside its prop, and moves with the prop as the island turns.
  // Positions are kept in the 1440 x 900 design's pixels, so a resize keeps them.
  const box = landing.querySelector<HTMLElement>("[data-landing-pins]")!, pins = [...box.querySelectorAll<HTMLElement>("[data-landing-pin]")];
  let rest: [number, number][] | null = null, drawn = false; // where each prop was on the first drawn frame, as on the still
  void world.ready.then(() => (drawn = true)); // the camera's matrices are set by the first draw
  world.onFrame(() => {
    if (!drawn || !box.offsetWidth || state.get("view") !== "landing") return; // hidden below 1200 px, or the dive is on
    const r = box.getBoundingClientRect(), k = r.width / 1440;
    const at = pins.map((p): [number, number] => {
      const s = world.stopOnScreen(p.dataset.landingPin as StopId);
      return [(s.x - r.left) / k, (s.y - r.top) / k];
    });
    rest ??= at;
    pins.forEach((p, i) => (p.style.translate = `${((at[i][0] - rest![i][0]) * k).toFixed(1)}px ${((at[i][1] - rest![i][1]) * k).toFixed(1)}px`));
  });
}
