// The lake's sound, with plain Web Audio. Off until the visitor turns it on; nothing is downloaded before then.
// Ambient beds: wind and lapping water by day, crickets and quieter water by night, crossfaded with the sweep.
// Footsteps follow the hiker's walk cycle (softer on sand than on the dock), the fire crackles louder as the hiker
// nears the Campfire, and one soft chime plays as a panel opens. Every file is made by scripts/make-audio.mjs.
// A hidden tab suspends the whole audio graph.

const FILES = ["ambient-day", "ambient-night", "fire", "step-sand", "step-wood", "chime"] as const;
type Name = (typeof FILES)[number];
const LOOP_START = 0.15;                                  // seconds: loops start past any MP3 decoder padding
const LOOPS: Partial<Record<Name, number>> = { "ambient-day": 12, "ambient-night": 12, fire: 6 }; // loop lengths
const STEP_GAP = 0.3, STEP_LEN = 0.24;                    // four footstep variants per file, 0.3 s apart
const LEVEL = { day: 0.32, night: 0.3, fire: 0.75, sand: 0.22, wood: 0.5, chime: 0.3, master: 0.9 };

export function createAudio(base = "/audio/") {
  let ctx: AudioContext | null = null, master: GainNode, on = false, loading: Promise<void> | null = null;
  const buf: Partial<Record<Name, AudioBuffer>> = {};
  const gains: Partial<Record<"day" | "night" | "fire", GainNode>> = {};
  let night = 0, fire = 0, variant = 0;
  const played: string[] = []; // the last few sounds played, for checks

  /** Builds the graph and fetches the files, once. Must start inside a click or key press (browser autoplay rules). */
  function start() {
    if (ctx) return loading!;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const c = ctx;
    loading = Promise.all(FILES.map(async (f) => {
      const res = await fetch(`${base}${f}.mp3`);
      buf[f] = await c.decodeAudioData(await res.arrayBuffer());
    })).then(() => {
      // The three loops run all the time while sound is on; their gains do the mixing.
      for (const [name, key] of [["ambient-day", "day"], ["ambient-night", "night"], ["fire", "fire"]] as const) {
        const g = c.createGain(), s = c.createBufferSource();
        g.gain.value = 0;
        s.buffer = buf[name]!; s.loop = true;
        s.loopStart = LOOP_START; s.loopEnd = LOOP_START + LOOPS[name]!;
        s.connect(g).connect(master);
        s.start(0, LOOP_START + Math.random() * LOOPS[name]!); // a random place, so it never starts the same
        gains[key] = g;
      }
      mixBeds();
    }).catch(() => { /* no sound if the files cannot load; the lake works the same */ });
    return loading;
  }

  /** Sets the bed levels from night and fire (smoothly, so nothing clicks). */
  function mixBeds() {
    if (!ctx || !gains.day) return;
    const t = ctx.currentTime;
    gains.day.gain.setTargetAtTime(LEVEL.day * (1 - night), t, 0.15);
    gains.night!.gain.setTargetAtTime(LEVEL.night * night, t, 0.15);
    gains.fire!.gain.setTargetAtTime(LEVEL.fire * fire, t, 0.1);
  }

  /** Plays part of a buffer once. */
  function once(name: Name, level: number, offset = 0, dur?: number, rate = 1) {
    if (!ctx || !on || ctx.state !== "running" || !buf[name]) return;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf[name]!; s.playbackRate.value = rate;
    g.gain.value = level;
    s.connect(g).connect(master);
    s.start(0, offset, dur);
    played.push(name);
    if (played.length > 30) played.shift();
  }

  // A hidden tab: the whole graph stops. It picks up again when the tab comes back, if sound is on.
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend(); else if (on) void ctx.resume();
  });

  return {
    get on() { return on; },
    /** Turns sound on or off, fading over a third of a second. Call it from a click or key press. */
    set(value: boolean) {
      on = value;
      if (on) { void start(); if (!document.hidden) void ctx!.resume(); }
      if (!ctx) return;
      master.gain.setTargetAtTime(on ? LEVEL.master : 0, ctx.currentTime, 0.12);
      if (!on) setTimeout(() => { if (!on) void ctx?.suspend(); }, 600);
    },
    /** Resumes after the first click or key press when sound was left on last visit (autoplay rules). */
    unlock() { if (on && ctx && ctx.state === "suspended" && !document.hidden) void ctx.resume(); },
    /** How far toward night (0 to 1), and how close the fire is (0 silent to 1 beside it). Call every frame. */
    update(nightAmount: number, fireAmount: number) {
      if (Math.abs(nightAmount - night) < 0.01 && Math.abs(fireAmount - fire) < 0.01) return;
      night = nightAmount; fire = fireAmount;
      mixBeds();
    },
    /** One footstep: wood on the dock and the footbridge, sand everywhere else. loud is 0 to 1. */
    step(surface: "sand" | "wood", loud: number) {
      variant = (variant + 1 + Math.floor(Math.random() * 2)) % 4; // never the same one twice
      once(surface === "wood" ? "step-wood" : "step-sand", (surface === "wood" ? LEVEL.wood : LEVEL.sand) * loud,
        variant * STEP_GAP, STEP_LEN, 0.94 + Math.random() * 0.12);
    },
    /** One soft note as a panel opens. */
    chime() { once("chime", LEVEL.chime); },
    /** For checks: whether the audio graph is running, the last sounds played, and the bed levels now. */
    get state() { return ctx?.state ?? "off"; },
    played,
    levels: () => ({ master: master?.gain.value ?? 0, day: gains.day?.gain.value ?? 0, night: gains.night?.gain.value ?? 0, fire: gains.fire?.gain.value ?? 0 }),
  };
}
export type Audio = ReturnType<typeof createAudio>;
