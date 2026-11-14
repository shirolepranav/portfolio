// The lake HUD's behaviour: rail, chip, pins, mini-map, panels, map, keys and addresses.
// The markup and every word come from Hud.astro and site.ts; this file only moves and fills them.
import { progressDeg } from "../world/config";
import { stopProgress, type Command, type StopId, type World } from "../world/index";

interface Stop { id: StopId; num: string; name: string; tag: string }
interface Data { stops: Stop[]; ui: Record<string, string> }

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const FOCUSABLE = "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** True for the desktop layout (it matches the CSS breakpoint). */
const desktop = matchMedia("(min-width: 900px) and (orientation: landscape)");

export function startHud(world: World) {
  const hud = $("[data-hud]");
  const { stops, ui } = JSON.parse($("#hud-data").textContent!) as Data;
  const n = stops.length, at = stops.map((s) => stopProgress(s.id));
  const index = (id: StopId | null) => stops.findIndex((s) => s.id === id);
  const isStop = (id: string): id is StopId => stops.some((s) => s.id === id);
  const { state } = world;
  const label = (s: Stop) => `${s.num} ${s.name}`;

  // ---- Where the hiker is, in rail terms: the last stop passed (i) and how far on to the next (f). ----
  function place(p: number) {
    let i = -1;
    for (let k = 0; k < n; k++) if (at[k] <= p + 1e-6) i = k;
    const a = i < 0 ? at[n - 1] - 1 : at[i], b = i + 1 < n ? at[i + 1] : at[0] + 1;
    return { i, f: Math.min(1, Math.max(0, (p - a) / (b - a))) };
  }

  const map = $("[data-map]"), pins = $$("[data-pin]");

  // ---- Rail (phone and desktop), mini-map and the map's "you are at" line ----
  const dots = $$("[data-dot]"), segs = $$("[data-seg]"), cols = $$("[data-dcol]"), mmDots = $$("[data-mm-dot]");
  const rail = $("[data-rail]"), drail = $("[data-drail]"), railA = $("[data-rail-a]"), railB = $("[data-rail-b]");
  const dfill = $("[data-dfill]"), dmarker = $("[data-dmarker]"), mmArc = $("[data-mm-arc]"), mmMe = $("[data-mm-me]");
  const where = $("[data-map-where]"), items = $$("[data-item]");
  let railKey = "";
  function updateRail() {
    const p = state.get("progress"), open = state.get("stop"), near = state.get("near");
    const h = index(open), { i, f } = place(p);
    const key = `${h}|${i}|${f.toFixed(3)}|${near}`;
    if (key === railKey) return;
    railKey = key;
    const next = (i + 1) % n;
    dots.forEach((d, k) => {
      d.className = "dot" + (h >= 0 ? (k === h ? " here" : k < h ? " passed" : "") : k <= i && !(i === n - 1 && k === next) ? " passed" : k === next ? " next" : "");
      cols[k].className = "col" + d.className.slice(3);
      mmDots[k].setAttribute("class", "mm-dot" + (k <= i ? " passed" : k === next ? " next" : ""));
    });
    segs.forEach((s, k) => s.style.setProperty("--f", String(h >= 0 ? +(k < h) : k < i ? 1 : k === i ? f : 0)));
    const x = h >= 0 ? h / Math.max(1, n - 1) : i < 0 ? 0 : i === n - 1 ? 1 : (i + f) / Math.max(1, n - 1);
    dfill.style.setProperty("--x", String(x));
    dmarker.style.setProperty("--x", String(x));
    dmarker.hidden = h >= 0;
    if (h >= 0) {
      railA.textContent = label(stops[h]);
      railB.textContent = fill(ui.stopOf, { a: h + 1, count: n });
      railB.className = "sub";
      rail.ariaLabel = drail.ariaLabel = fill(ui.railAt, { a: h + 1, count: n });
    } else {
      const prev = i < 0 ? n - 1 : i;
      railA.textContent = label(stops[prev]);
      railB.textContent = label(stops[next]);
      railB.className = "";
      rail.ariaLabel = drail.ariaLabel = fill(ui.railBetween, { a: prev + 1, b: next + 1, count: n });
    }
    // Mini-map: the arc from the Trailhead to the hiker, at true angles (Trailhead at the bottom).
    const deg = progressDeg(p), pt = (d: number) => [66 + 44 * Math.cos((-d * Math.PI) / 180), 66 + 44 * Math.sin((-d * Math.PI) / 180)];
    const [ex, ey] = pt(deg);
    mmArc.setAttribute("d", p < 0.002 ? "" : `M66 110 A44 44 0 ${p > 0.5 ? 1 : 0} 0 ${ex.toFixed(1)} ${ey.toFixed(1)}`);
    mmMe.setAttribute("cx", ex.toFixed(1));
    mmMe.setAttribute("cy", ey.toFixed(1));
    // Map: the current stop is the one open or nearby, else the last one passed.
    const cur = h >= 0 ? h : near ? index(near) : i < 0 ? n - 1 : i;
    where.textContent = `${fill(ui.mapCount, { count: n })} · ${fill(h >= 0 || near ? ui.mapAt : ui.mapNear, { a: stops[cur].num })}`;
    items.forEach((el, k) => {
      el.classList.toggle("here", k === cur);
      el.toggleAttribute("aria-current", k === cur);
      if (k === cur) el.setAttribute("aria-current", "location");
      $("[data-item-tag]", el).textContent = k === cur ? `${stops[k].tag} · ${ui.here}` : stops[k].tag;
    });
    pins.forEach((pin, k) => pin.classList.toggle("here", k === cur && state.get("view") === "map"));
  }

  // ---- The chip and pins follow the props on screen, every frame. ----
  const chip = $<HTMLAnchorElement>("[data-chip]");
  const chipNum = $("[data-chip-num]"), chipTag = $("[data-chip-tag]"), chipName = $("[data-chip-name]");
  let dir = 1, lastP = state.get("progress"), chipFor: StopId | null = null, cx = NaN, cy = NaN;
  state.on("progress", (p) => { const d = ((p - lastP + 1.5) % 1) - 0.5; if (Math.abs(d) > 1e-6) dir = Math.sign(d); lastP = p; });

  function target(): StopId {
    const near = state.get("near");
    if (near) return near;
    const { i } = place(state.get("progress"));
    return stops[dir > 0 ? (i + 1) % n : (i + n) % n].id;
  }

  function track() {
    const view = state.get("view"), W = innerWidth, H = innerHeight;
    if (view === "walk") {
      const id = target(), k = index(id);
      if (id !== chipFor) {
        chipFor = id;
        chipNum.textContent = stops[k].num;
        chipTag.textContent = `${ui.nextStop} · ${stops[k].tag}`;
        chipName.textContent = stops[k].name;
        chip.href = `#${id}`;
        chip.dataset.go = id;
      }
      chip.classList.toggle("near", state.get("near") === id);
      chip.hidden = false;
      // Beside the prop, kept on screen and clear of the bars. Behind the camera: parked at the right edge.
      const s = world.stopOnScreen(id), cw = chip.offsetWidth, ch = chip.offsetHeight, top = desktop.matches ? 110 : 80;
      const inView = s.front && s.x > -40 && s.x < W + 40 && s.y > 0 && s.y < H;
      let x = inView ? s.x + 22 : W - cw - 12, y = inView ? s.y - ch / 2 : H * 0.48;
      x = Math.min(Math.max(x, 12), W - cw - 12);
      y = Math.min(Math.max(y, top), H - ch - (desktop.matches ? 120 : 80));
      if (Number.isNaN(cx)) { cx = x; cy = y; } else { cx += (x - cx) * 0.25; cy += (y - cy) * 0.25; } // eased, so it never jumps
      chip.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
    } else chip.hidden = true;
    // Pins: the other stops in view while walking; every stop on the map.
    const map = view === "map";
    pins.forEach((pin, k) => {
      const id = stops[k].id, s = world.stopOnScreen(id);
      const show = view !== "stop" && s.front && s.x > 16 && s.x < W - 16 && s.y > (map ? 150 : 90) && s.y < H - 90 && (map || id !== chipFor);
      pin.classList.toggle("show", show);
      pin.classList.toggle("map-pin", map);
      if (show) pin.style.transform = `translate(${s.x.toFixed(1)}px, ${(s.y - (map ? 10 : 34)).toFixed(1)}px)`;
    });
    updateRail();
  }
  world.onFrame(track);

  // ---- Addresses: opening a stop sets /lake#<stop>; the back button closes it. ----
  let pushed = false;
  function visit(id: StopId) {
    if (location.hash !== `#${id}`) {
      if (!location.hash) { history.pushState(null, "", `#${id}`); pushed = true; }
      else history.replaceState(null, "", `#${id}`);
    }
    world.goTo(id, true);
  }
  function closeStop() {
    if (pushed) { history.back(); return; } // popstate closes it
    history.replaceState(null, "", location.pathname + location.search);
    world.close();
  }
  addEventListener("popstate", () => {
    const id = location.hash.slice(1);
    pushed = !!id;
    if (isStop(id)) world.goTo(id, true); else world.close();
  });

  // ---- Panels: open on arrival, trap focus, return it on close. ----
  const panels = $$("[data-panel]");
  let returnTo: HTMLElement | null = null;
  const remember = () => {
    const a = document.activeElement as HTMLElement | null;
    if (a && a !== document.body && !a.closest("[data-panel], [data-map]")) returnTo = a;
  };
  const giveBack = () => {
    const el = returnTo;
    returnTo = null;
    if (el?.isConnected && el.checkVisibility?.({ visibilityProperty: true })) el.focus({ preventScroll: true });
  };
  // A stop's panel waits for the camera and the prop's reaction (state "arrived"), then springs up and its rows
  // appear one by one, all within PLAN.md's 1.2 s. Each project row cues its tent or canoe as it lands.
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let cues: number[] = [];
  const ROWS = ".intro, .text > p, .text > .sub, .rows > li, .groups > .group, .photos, .gallery > .line, .headline";
  function showRows(panel: HTMLElement, id: StopId) {
    cues.forEach(clearTimeout);
    cues = [];
    const rows = $$(ROWS, panel).filter((el) => !el.closest("[hidden]"));
    // The panel is up at 0.85 s; rows start 0.04 s later, the last by 1.01 s, and each fades in over 0.18 s.
    const step = Math.min(0.03, 0.12 / Math.max(1, rows.length - 1));
    let project = 0;
    rows.forEach((el, i) => {
      el.style.setProperty("--d", `${(0.04 + i * step).toFixed(3)}s`);
      if (el.querySelector(".project")) {
        const k = project++;
        cues.push(window.setTimeout(() => world.row(id, k), reduce.matches ? 0 : (0.04 + i * step) * 1000));
      }
    });
    panel.classList.add("rows-in");
  }
  const onStop = (id: StopId | null) => {
    // Leaving or changing stops hides the panel at once; the next one waits for its arrival.
    for (const p of panels) { p.hidden = true; p.classList.remove("rows-in"); }
    if (!id && state.get("view") !== "map") giveBack();
    railKey = "";
  };
  const onArrive = (id: StopId | null) => {
    const open = panels.find((p) => p.dataset.panel === id);
    if (!open || !id) return;
    open.hidden = false;
    remember();
    requestAnimationFrame(() => { showRows(open, id); $("h2", open).focus({ preventScroll: true }); });
  };
  const onView = (v: "walk" | "stop" | "map") => {
    hud.dataset.view = v;
    map.hidden = v !== "map";
    if (v === "map") { remember(); requestAnimationFrame(() => $("h2", map).focus({ preventScroll: true })); }
    else if (v === "walk" && !state.get("stop")) giveBack();
    railKey = "";
  };
  state.on("stop", onStop);
  state.on("arrived", onArrive);
  state.on("view", onView);
  onView(state.get("view")); // a /lake#<stop> address starts open
  onArrive(state.get("arrived"));

  // Two sections at one stop: a tab switch (arrow keys move between the tabs).
  for (const list of $$("[role=tablist]")) {
    const tabs = $$<HTMLButtonElement>("[role=tab]", list), panel = list.closest<HTMLElement>("[data-panel]")!;
    const select = (t: HTMLButtonElement) => {
      for (const o of tabs) {
        const on = o === t;
        o.setAttribute("aria-selected", String(on));
        o.tabIndex = on ? 0 : -1;
        document.getElementById(o.getAttribute("aria-controls")!)!.hidden = !on;
      }
      $("[data-kicker]", panel).textContent = t.dataset.label!;
    };
    tabs.forEach((t, k) => {
      t.addEventListener("click", () => select(t));
      t.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const o = tabs[(k + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
        select(o); o.focus();
      });
    });
  }

  // Phones: swipe the sheet down by its handle to close it.
  for (const grab of $$("[data-grab]")) {
    const panel = grab.closest<HTMLElement>("[data-panel]")!;
    let y0: number | null = null, dy = 0;
    grab.addEventListener("pointerdown", (e) => { if (desktop.matches || (e.target as Element).closest("button")) return; y0 = e.clientY; dy = 0; grab.setPointerCapture(e.pointerId); });
    grab.addEventListener("pointermove", (e) => {
      if (y0 === null) return;
      dy = Math.max(0, e.clientY - y0);
      panel.style.transition = "none";
      panel.style.transform = `translateY(${dy}px)`;
    });
    const end = () => {
      if (y0 === null) return;
      y0 = null;
      panel.style.transition = panel.style.transform = "";
      if (dy > 70) closeStop();
    };
    grab.addEventListener("pointerup", end);
    grab.addEventListener("pointercancel", end);
  }

  // Keep the focus inside an open panel or the map.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const box = state.get("view") === "map" ? map : panels.find((p) => !p.hidden);
    if (!box) return;
    const els = $$(FOCUSABLE, box).filter((el) => el.checkVisibility?.({ visibilityProperty: true }) ?? true);
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1], a = document.activeElement;
    if (!box.contains(a)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (a === first || a === $("h2", box))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  });

  // ---- Map ----
  const toggleMap = (on = state.get("view") !== "map") => world.showMap(on);

  // ---- Clicks: stop links, close buttons, the map, the props themselves. ----
  hud.addEventListener("click", (e) => {
    const t = e.target as Element;
    const go = t.closest<HTMLElement>("[data-go]");
    if (go && isStop(go.dataset.go!)) { e.preventDefault(); visit(go.dataset.go); return; }
    if (t.closest("[data-close]")) closeStop();
    else if (t.closest("[data-map-open]")) toggleMap(true);
    else if (t.closest("[data-map-close]")) toggleMap(false);
  });
  const canvas = world.renderer.domElement;
  let down: { x: number; y: number } | null = null;
  canvas.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener("click", (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || state.get("view") !== "walk") return;
    const r = canvas.getBoundingClientRect(), id = world.pick(e.clientX - r.left, e.clientY - r.top);
    if (id) visit(id);
  });

  // ---- Day or night: the round toggle shows the current mode and switches to the other. ----
  const cycles = $$("[data-mode-cycle]");
  const syncMode = () => {
    const night = document.documentElement.dataset.mode === "night";
    for (const b of cycles) { b.dataset.setMode = night ? "day" : "night"; b.ariaLabel = night ? ui.switchToDay : ui.switchToNight; }
  };
  syncMode();
  new MutationObserver(syncMode).observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });

  // ---- Sound: off until the visitor turns it on; the choice is remembered (localStorage, which can be blocked). ----
  const soundBtn = $<HTMLButtonElement>("[data-sound]");
  const setSound = (on: boolean, save = true) => {
    world.setSound(on);
    soundBtn.setAttribute("aria-pressed", String(on));
    if (save) try { localStorage.setItem("lake:sound", on ? "on" : "off"); } catch {}
  };
  soundBtn.addEventListener("click", () => setSound(!world.sound));
  try { if (localStorage.getItem("lake:sound") === "on") setSound(true, false); } catch {}
  // Browsers start audio only after a click or key press, so sound left on last time starts on the first one.
  const unlock = () => world.unlockSound();
  addEventListener("pointerdown", unlock);
  addEventListener("keydown", unlock);

  // ---- Keys from the world's input: E or Enter, Esc, M, N, and left and right with a panel open. ----
  function command(c: Command) {
    const view = state.get("view"), open = state.get("stop");
    if (c === "open" && view === "walk" && state.get("near")) visit(state.get("near")!);
    else if (c === "close") { if (view === "map") toggleMap(false); else if (open) closeStop(); }
    else if (c === "map") toggleMap();
    else if (c === "mode") cycles[0].click();
    else if ((c === "prev" || c === "next") && open) visit(stops[(index(open) + (c === "next" ? 1 : n - 1)) % n].id);
  }

  // ---- First visit: one hint for three seconds. ----
  const hint = $("[data-hint]");
  try {
    if (!localStorage.getItem("lake:hinted") && state.get("view") === "walk") {
      localStorage.setItem("lake:hinted", "1");
      world.ready.then(() => { hint.hidden = false; setTimeout(() => (hint.hidden = true), 3000); });
    }
  } catch {}

  return { command };
}
