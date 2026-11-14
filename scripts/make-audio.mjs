// Makes every sound in public/audio/ from scratch: no recordings, nothing downloaded, so the owner owns them all.
// Run: node scripts/make-audio.mjs   (needs ffmpeg with the LAME MP3 encoder on the PATH)
// Each sound is synthesised from seeded noise and tones, so running it again gives the same files.
//
// Loops are periodic: the last moments crossfade into the start, and the file carries a short extra tail that
// repeats its first 0.3 s. The player loops a window that starts 0.15 s in (past any MP3 decoder padding),
// so it repeats with no gap or click. See LOOP_START in src/world/audio.ts.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RATE = 22050;               // samples per second: plenty for wind, water, crickets and a soft bell
const TAIL = 0.3;                 // seconds of wrapped tail after each loop
const OUT = new URL("../public/audio/", import.meta.url).pathname;

// ---------- small tools ----------
/** Seeded random numbers (mulberry32), 0 to 1. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const N = (sec) => Math.round(sec * RATE);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** A biquad band-pass, low-pass or high-pass filter (RBJ cookbook). Returns a function: sample in, sample out. */
function biquad(type, freq, q = 0.707) {
  const k = {};
  // Works out the coefficients for a centre or cutoff frequency.
  const set = (fr) => {
    const w = (2 * Math.PI * fr) / RATE, c = Math.cos(w), a = Math.sin(w) / (2 * q);
    if (type === "lp") Object.assign(k, { b0: (1 - c) / 2, b1: 1 - c, b2: (1 - c) / 2 });
    else if (type === "hp") Object.assign(k, { b0: (1 + c) / 2, b1: -(1 + c), b2: (1 + c) / 2 });
    else Object.assign(k, { b0: a, b1: 0, b2: -a }); // band-pass, peak gain 1
    Object.assign(k, { a0: 1 + a, a1: -2 * c, a2: 1 - a });
  };
  set(freq);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const f = (x) => {
    const y = (k.b0 * x + k.b1 * x1 + k.b2 * x2 - k.a1 * y1 - k.a2 * y2) / k.a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
  f.tune = set; // a new centre or cutoff, keeping the filter's memory (for wind gusts)
  return f;
}
/** Low-pass one-pole: cheap smoothing for slow control signals. */
const onePole = (k) => { let y = 0; return (x) => (y += (x - y) * k); };

/** Makes a loop seamless: the extra `fade` seconds at the end crossfade into the start. Returns `len` seconds. */
function seamless(sig, len, fade) {
  const L = N(len), F = N(fade), out = new Float32Array(L);
  for (let i = 0; i < L; i++) out[i] = sig[i];
  for (let i = 0; i < F; i++) {
    const k = i / F;                                            // equal power: noise stays as loud through the seam
    out[i] = sig[i] * Math.sqrt(k) + sig[L + i] * Math.sqrt(1 - k);
  }
  return out;
}
/** The loop plus its wrapped tail, ready to write. */
const withTail = (loop) => { const t = N(TAIL), o = new Float32Array(loop.length + t); o.set(loop); o.set(loop.subarray(0, t), loop.length); return o; };

/** Scales so the loudest sample sits at `peak`. */
function normalise(x, peak) {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  for (let i = 0; i < x.length; i++) x[i] *= peak / (m || 1);
  return x;
}

// ---------- the sounds ----------
/** Water lapping at a shore: soft swells of band-passed noise with a gentle slap at each crest. */
function lapping(len, seed, level) {
  const r = rng(seed), n = N(len), out = new Float32Array(n);
  const bp = biquad("bp", 520, 0.9), bp2 = biquad("bp", 1500, 1.2), lp = biquad("lp", 260);
  let next = 0;
  const waves = [];
  for (let t = 0; t < len; t += 0.7 + r() * 1.1) waves.push({ at: t, dur: 0.7 + r() * 0.8, amp: 0.5 + r() * 0.5 });
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let env = 0;
    for (let w = Math.max(0, next - 3); w < waves.length; w++) {
      const d = t - waves[w].at;
      if (d < 0) break;
      if (d > waves[w].dur) { if (w === next) next++; continue; }
      const x = d / waves[w].dur;
      env += waves[w].amp * Math.sin(Math.PI * Math.sqrt(x)) ** 2 * (1 - x * 0.4);
    }
    const noise = r() * 2 - 1;
    out[i] = level * (bp(noise) * env * 1.6 + bp2(noise) * env * env * 0.5 + lp(noise) * 0.35);
  }
  return out;
}

/** Wind: low rumbling noise whose loudness and brightness drift in slow gusts. */
function wind(len, seed, level) {
  const r = rng(seed), n = N(len), out = new Float32Array(n);
  const lp = biquad("lp", 600, 0.6), hp = biquad("hp", 70);
  const gust = onePole(1 / (RATE * 1.2));
  let target = 0.5;
  for (let i = 0; i < n; i++) {
    if (i % N(0.9) === 0) target = 0.25 + r() * 0.75;
    const g = gust(target);
    if (i % 64 === 0) lp.tune(300 + 900 * g);
    out[i] = level * hp(lp(r() * 2 - 1)) * (0.4 + g);
  }
  return out;
}

/** Crickets: several insects, each chirping three quick pulses of a high tone, at their own pace and pitch. */
function crickets(len, seed, level) {
  const r = rng(seed), n = N(len), out = new Float32Array(n);
  const bugs = Array.from({ length: 5 }, (_, k) => ({ f: 4000 + r() * 900, every: 0.55 + r() * 0.5, off: r(), amp: (0.35 + r() * 0.65) * (k < 2 ? 1 : 0.45) }));
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let s = 0;
    for (const b of bugs) {
      const c = ((t / b.every + b.off) % 1) * b.every;           // seconds into this chirp
      if (c > 0.11) continue;
      const pulse = Math.sin(Math.PI * ((c % 0.035) / 0.035)) ** 2; // three 35 ms pulses
      s += b.amp * pulse * Math.sin(2 * Math.PI * b.f * t) * (0.85 + 0.15 * Math.sin(2 * Math.PI * 23 * t));
    }
    out[i] = level * s;
  }
  return out;
}

/** A campfire: a soft low roar, a bed of tiny crackles, and now and then a louder pop. */
function fire(len, seed) {
  const r = rng(seed), n = N(len), out = new Float32Array(n);
  const roar = biquad("lp", 220, 0.7), hiss = biquad("bp", 3000, 0.6), crack = biquad("bp", 2200, 1.4), pop = biquad("bp", 900, 2);
  const swell = onePole(1 / (RATE * 0.4));
  let c = 0, p = 0, target = 0.6;
  for (let i = 0; i < n; i++) {
    if (i % N(0.5) === 0) target = 0.4 + r() * 0.6;
    const s = swell(target), noise = r() * 2 - 1;
    if (r() < 18 / RATE) c = 0.3 + r() * 0.7;                    // a crackle, about 18 a second
    if (r() < 1.2 / RATE) p = 0.8 + r() * 0.4;                    // a pop, about one a second
    out[i] = roar(noise) * 0.9 * s + hiss(noise) * 0.06 * s + crack(noise * c) * 2.2 + pop(noise * p) * 2.8;
    c *= 0.93; p *= 0.985;
  }
  return out;
}

/** One footstep. Sand: a soft, grainy scuff. Wood: a hollow knock with a low thump. */
function step(kind, seed) {
  const r = rng(seed), n = N(0.24), out = new Float32Array(n);
  if (kind === "sand") {
    const bp = biquad("bp", 900 + r() * 400, 0.8), lp = biquad("lp", 2600);
    for (let i = 0; i < n; i++) {
      const t = i / RATE, env = smooth(0, 0.012, t) * Math.exp(-t / 0.055);
      const grain = r() < 0.35 ? r() * 2 - 1 : 0;                 // sparse grains make the crunch
      out[i] = (bp(r() * 2 - 1) * 0.6 + lp(grain) * 0.9) * env;
    }
  } else {
    const f = 95 + r() * 25, body = biquad("bp", 420 + r() * 120, 3), knock = biquad("bp", 1700, 1.5);
    for (let i = 0; i < n; i++) {
      const t = i / RATE, env = smooth(0, 0.003, t);
      const noise = r() * 2 - 1;
      out[i] = env * (Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.05) * 0.8 + body(noise) * Math.exp(-t / 0.07) * 3.5 + knock(noise) * Math.exp(-t / 0.012) * 1.5);
    }
  }
  return out;
}
/** Four variants of a footstep, 0.3 s apart in one file (STEP_GAP in audio.ts). */
function steps(kind, seed) {
  const gap = N(0.3), out = new Float32Array(gap * 4);
  for (let k = 0; k < 4; k++) out.set(step(kind, seed + k * 7), k * gap);
  return out;
}

/** One soft chime: a bell-like note (E5) with a few inharmonic partials, gentle attack, long fade. */
function chime() {
  const n = N(2.2), out = new Float32Array(n), f = 659.25;
  const partials = [[1, 1, 1.4], [2.0, 0.35, 0.8], [2.76, 0.18, 0.5], [5.4, 0.06, 0.2]];
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let s = 0;
    for (const [k, a, d] of partials) s += a * Math.sin(2 * Math.PI * f * k * t) * Math.exp(-t / d);
    out[i] = s * smooth(0, 0.006, t) * (1 - smooth(1.9, 2.2, t));
  }
  return out;
}

// ---------- write ----------
function wav(path, x) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(x.length * 2, 40);
  x.forEach((v, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2));
  writeFileSync(path, b);
}
const tmp = mkdtempSync(join(tmpdir(), "lake-audio-"));
function save(name, x, kbps) {
  const w = join(tmp, `${name}.wav`), out = join(OUT, `${name}.mp3`);
  wav(w, x);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", w, "-ac", "1", "-ar", String(RATE), "-codec:a", "libmp3lame", "-b:a", `${kbps}k`, out]);
  return statSync(out).size;
}
const mix = (...xs) => { const o = new Float32Array(Math.max(...xs.map((x) => x.length))); for (const x of xs) x.forEach((v, i) => (o[i] += v)); return o; };

const LOOP = 12, FADE = 1.5;
const day = seamless(mix(wind(LOOP + FADE, 1, 0.5), lapping(LOOP + FADE, 2, 0.8)), LOOP, FADE);
const night = seamless(mix(crickets(LOOP + FADE, 3, 0.12), lapping(LOOP + FADE, 4, 0.45), wind(LOOP + FADE, 5, 0.15)), LOOP, FADE);
const crackle = seamless(fire(6 + 1, 6), 6, 1);
const sizes = {
  "ambient-day": save("ambient-day", withTail(normalise(day, 0.8)), 40),
  "ambient-night": save("ambient-night", withTail(normalise(night, 0.8)), 40),
  fire: save("fire", withTail(normalise(crackle, 0.85)), 40),
  "step-sand": save("step-sand", normalise(steps("sand", 10), 0.8), 48),
  "step-wood": save("step-wood", normalise(steps("wood", 20), 0.85), 48),
  chime: save("chime", normalise(chime(), 0.7), 48),
};
rmSync(tmp, { recursive: true });
const total = Object.values(sizes).reduce((a, b) => a + b, 0);
for (const [k, v] of Object.entries(sizes)) console.log(`${k}.mp3`.padEnd(20), `${(v / 1024).toFixed(1)} KB`);
console.log("total".padEnd(20), `${(total / 1024).toFixed(1)} KB`, total > 400 * 1024 ? "(over the 400 KB budget!)" : "(budget 400 KB)");
