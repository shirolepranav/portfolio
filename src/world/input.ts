// Wheel, touch, mouse drag and keys, reduced to two numbers: walking velocity (progress per second)
// and a look offset (degrees). Input only adds velocity; it never sets progress.

export const VMAX = 1 / 45;   // top speed: one lap in about 45 s
const WHEEL = (0.35 * VMAX) / 100;  // one mouse-wheel notch (100 px) gives about a third of top speed
const SWIPE = 2.5 * VMAX;     // a swipe of the full screen height, per screen height
const EASE_OUT = 0.5;         // seconds: velocity decays this fast once input stops
const KEY_EASE = 0.25;        // seconds: a held key reaches top speed this fast
const LOOK_MAX = 35;          // degrees either side
const LOOK_DRAG = 0.15;       // degrees per pixel dragged
const LOOK_KEY = 70;          // degrees per second with A or D held
const LOOK_HOLD = 2;          // seconds after release before the view eases back

const WALK_KEYS: Record<string, number> = { KeyW: 1, ArrowUp: 1, KeyS: -1, ArrowDown: -1 };
const LOOK_KEYS: Record<string, number> = { KeyA: -1, ArrowLeft: -1, KeyD: 1, ArrowRight: 1 };

const clamp = (x: number, m: number) => Math.max(-m, Math.min(m, x));

export function createInput(el: HTMLElement) {
  let v = 0, look = 0, idle = LOOK_HOLD, enabled = true;
  const held = new Set<string>();
  let drag: { id: number; x: number; y: number; sx: number; sy: number; mouse: boolean; axis: "walk" | "look" | null } | null = null;
  const sum = (map: Record<string, number>) => [...held].reduce((n, k) => n + (map[k] ?? 0), 0);

  const onWheel = (e: WheelEvent) => {
    if (!enabled || e.ctrlKey) return; // ctrl + wheel is pinch zoom
    e.preventDefault();
    const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
    v += px * WHEEL;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || !(e.code in WALK_KEYS || e.code in LOOK_KEYS)) return;
    if ((e.target as HTMLElement).closest?.("input, textarea, select, [contenteditable]")) return;
    e.preventDefault();
    if (e.type === "keydown" && enabled) held.add(e.code); else held.delete(e.code);
  };
  const onDown = (e: PointerEvent) => {
    if (!enabled || drag || e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, mouse: e.pointerType === "mouse", axis: null };
    el.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.axis) {
      // Lock to one axis after a few pixels. A mouse drag always looks; a finger swipes up or down to walk.
      const tx = e.clientX - drag.sx, ty = e.clientY - drag.sy;
      if (Math.hypot(tx, ty) < 8) return;
      drag.axis = drag.mouse || Math.abs(tx) > Math.abs(ty) ? "look" : "walk";
    }
    if (drag.axis === "walk") v -= (dy / innerHeight) * SWIPE; // swipe up walks forward
    else { look = clamp(look - dx * LOOK_DRAG, LOOK_MAX); idle = 0; } // the scene follows the finger
  };
  const onUp = (e: PointerEvent) => { if (drag?.id === e.pointerId) drag = null; };
  const reset = () => { held.clear(); drag = null; };

  addEventListener("wheel", onWheel, { passive: false });
  addEventListener("keydown", onKey);
  addEventListener("keyup", onKey);
  addEventListener("blur", reset);
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);

  return {
    get enabled() { return enabled; },
    set enabled(on: boolean) { enabled = on; if (!on) { reset(); v = 0; } },
    /** Stops walking at once (debug jumps). */
    stop() { v = 0; },
    /**
     * Advances one frame. cap is the top speed here (lower near a stop).
     * Returns the velocity in progress per second and the look offset in degrees (positive looks right).
     */
    step(dt: number, cap = VMAX) {
      const walk = Math.sign(sum(WALK_KEYS)), turn = Math.sign(sum(LOOK_KEYS));
      if (walk) v += (walk * VMAX - v) * (1 - Math.exp(-dt / KEY_EASE));
      else v *= Math.exp(-dt / EASE_OUT);
      v = clamp(v, cap); // a hard flick can never outrun the cap, so it cannot skip a stop
      if (!walk && Math.abs(v) < VMAX * 0.002) v = 0;

      if (turn) { look = clamp(look + turn * LOOK_KEY * dt, LOOK_MAX); idle = 0; }
      else if (drag?.axis === "look") idle = 0;
      else idle += dt;
      if (idle > LOOK_HOLD) look *= Math.exp(-dt / 0.45);
      return { v, look };
    },
  };
}
export type Input = ReturnType<typeof createInput>;
