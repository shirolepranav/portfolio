// The landing comes alive: the live island fades in over the still, turns slowly, bobs and spins on drag, and the
// desktop stop pins follow their props. "Walk the lake" dives into the lake on the same canvas, with no reload:
// the address becomes /lake. Back flies up to the landing again; forward dives back in.
import { startLake } from "./lake";
import { onLake } from "./hud";
import type { StopId } from "../world/index";

export async function startLanding() {
  const landing = document.querySelector<HTMLElement>(".landing")!, lake = document.querySelector<HTMLElement>(".lake")!;
  const walk = landing.querySelector<HTMLAnchorElement>("a.walk")!;
  const titles = { landing: document.title, lake: lake.dataset.title! };
  const world = await startLake(true);
  landing.querySelector("[data-sound]")?.setAttribute("data-live", ""); // the HUD drives the sound button from here on
  const { state } = world;

  /** landing: the text is up. dive: the camera is flying down or up. lake: walking, with the HUD. */
  const setPage = (p: "landing" | "dive" | "lake") => {
    lake.dataset.page = landing.dataset.page = p;
    landing.inert = p !== "landing";
    document.title = p === "landing" ? titles.landing : titles.lake;
  };
  // The landing text lifts away as the camera drops, and the HUD fades in once the dive lands.
  async function down() {
    setPage("dive");
    await world.dive(true);
    if (onLake()) setPage("lake");
  }
  // Back: the camera flies up, and the text drops back in as it arrives (CSS delays it).
  async function up() {
    setPage("landing");
    await world.dive(false);
  }

  walk.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button || state.get("view") !== "landing") return; // a new tab: a plain link
    e.preventDefault();
    history.pushState(null, "", walk.pathname + location.search);
    void down();
  });
  addEventListener("popstate", () => {
    const view = state.get("view");
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
