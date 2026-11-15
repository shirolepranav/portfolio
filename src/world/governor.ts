// The tier step-down (PLAN.md, Quality tiers): start on the tier picked from device hints, then step down one tier
// when the frame rate stays low for three seconds. The rule, agreed with the owner:
// - Measure only frames the world draws: not on a hidden tab, not in the first 2 s, not during the dive.
// - Keep the last 3 s of frames. Once the window holds a full 3 s and its average is under 45 fps, step down one tier.
// - After a step, ignore 3 s (new shaders compile and settle), then fill a fresh 3 s window before judging again.
// - One gap of a second or more between fast frames is a pause (an alert, a debugger), not slowness: the window starts
//   again after it. Two long gaps in a row are slowness (a device under 1 fps), and count.
// - Never step up. Low is the floor. On low, an average under 30 fps reports "still" once (the landing shows its still).
// Because it only ever moves one way, it cannot flicker between tiers.
import type { Tier } from "./config";

export const WINDOW = 3;     // seconds of frames judged at once
export const SETTLE = 2;     // seconds ignored after the first frame
export const COOLDOWN = 3;   // seconds ignored after a step
export const MIN_FPS = 45;   // below this on average over the window: step down
export const FLOOR_FPS = 30; // below this on low: the landing falls back to its still
export const PAUSE = 1;      // seconds: a single gap this long between fast frames is a pause, not slowness

const DOWN: Record<Tier, Tier | null> = { high: "medium", medium: "low", low: null };

export interface GovernorEvent { at: number; from: Tier; to: Tier | "still"; fps: number }

export function createGovernor(start: Tier, onStep: (e: GovernorEvent) => void) {
  let tier = start, stillSent = false;
  let since = NaN;      // seconds: frames before this are ignored (settle or cooldown)
  let times: number[] = []; // timestamps (seconds) of the frames in the window
  let fps = NaN;        // the window's last average, for the debug panel
  let longGap = false;  // the last gap was a second or more
  const log: GovernorEvent[] = [];

  const reset = (now: number, wait: number) => { since = now + wait; times = []; };

  return {
    get tier() { return tier; },
    get fps() { return fps; },
    log,
    /** Turns the governor off and on (off: debug screenshots at a fixed tier). */
    enabled: true,
    /** The world's tier changed by hand (debug switch): carry on from there, with a fresh window. */
    setTier(t: Tier, now: number) { tier = t; stillSent = false; reset(now, COOLDOWN); },
    /** Frames not drawn or not to be judged (hidden tab, the dive): the next window starts afresh. */
    skip(now: number) { if (since <= now) reset(now, 0); }, // NaN (not started) and settle or cooldown time are kept
    /** One drawn frame at `now` seconds. */
    frame(now: number) {
      if (!this.enabled) return;
      if (Number.isNaN(since)) since = now + SETTLE; // the first frame starts the settle time
      if (now < since) return;
      const gap = times.length ? now - times[times.length - 1] : 0;
      if (gap >= PAUSE && !longGap) { longGap = true; reset(now, 0); times.push(now); return; } // a lone pause: start again
      longGap = gap >= PAUSE;
      times.push(now);
      while (times.length && times[0] < now - WINDOW) times.shift();
      const span = now - since;
      if (span < WINDOW || times.length < 2) return;      // the window is not full yet
      fps = (times.length - 1) / (times[times.length - 1] - times[0]);
      if (fps >= (tier === "low" ? FLOOR_FPS : MIN_FPS)) return;
      const to = DOWN[tier];
      if (to) {
        const e = { at: now, from: tier, to, fps };
        tier = to; log.push(e); reset(now, COOLDOWN); onStep(e);
      } else if (!stillSent) {
        stillSent = true;
        const e = { at: now, from: tier, to: "still" as const, fps };
        log.push(e); onStep(e);
      }
    },
  };
}
export type Governor = ReturnType<typeof createGovernor>;
