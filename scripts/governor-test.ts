// Feeds the tier step-down (src/world/governor.ts) synthetic frame streams and prints each step, to show the rule
// steps down after 3 s of low frame rate and never flickers back. Run: node scripts/governor-test.ts
import { createGovernor } from "../src/world/governor.ts";

type Case = { name: string; start: "high" | "medium" | "low"; ms: (t: number) => number; secs: number };
const cases: Case[] = [
  { name: "steady 60 fps", start: "high", ms: () => 16.7, secs: 60 },
  { name: "steady 46 fps (just above the line)", start: "high", ms: () => 1000 / 46, secs: 60 },
  { name: "steady 40 fps", start: "high", ms: () => 25, secs: 60 },
  { name: "40 fps, then 60 fps after the first step", start: "high", ms: (t) => (t < 6 ? 25 : 16.7), secs: 60 },
  { name: "swings 30/60 fps every second", start: "high", ms: (t) => (Math.floor(t) % 2 ? 33.3 : 16.7), secs: 60 },
  { name: "swings 40/50 fps every 2.5 s", start: "high", ms: (t) => (Math.floor(t / 2.5) % 2 ? 25 : 20), secs: 60 },
  { name: "one 1.2 s frozen frame, otherwise 60", start: "high", ms: (t) => (t > 10 && t < 10.02 ? 1200 : 16.7), secs: 60 },
  { name: "one 2 s stall at 5 fps, otherwise 60", start: "high", ms: (t) => (t > 10 && t < 12 ? 200 : 16.7), secs: 60 },
  { name: "steady 0.8 fps (every gap over 1 s)", start: "high", ms: () => 1250, secs: 60 },
  { name: "1.2 s frozen frames every 10 s, else 60", start: "high", ms: (t) => (t % 10 < 0.02 ? 1200 : 16.7), secs: 60 },
  { name: "steady 20 fps (landing)", start: "high", ms: () => 50, secs: 60 },
];
for (const c of cases) {
  const g = createGovernor(c.start, () => {});
  let t = 0;
  while (t < c.secs) { t += c.ms(t) / 1000; g.frame(t); }
  const steps = g.log.map((e) => `${e.at.toFixed(2)} s ${e.from}->${e.to} (${e.fps.toFixed(1)} fps)`).join(", ") || "no change";
  console.log(`${c.name.padEnd(42)} ends ${g.tier.padEnd(6)} ${steps}`);
}
