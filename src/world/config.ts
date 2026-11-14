// World layout and tuning. Numbers come from reference/scene/scene.py unless noted.

export const D2R = Math.PI / 180;
export const S = 35;                 // world scale: the 0.05-unit hiker becomes 1.75 m

// Ring values: t = 1 is the shoreline, larger is further out.
export const NA = 240;               // angular segments of the shore grid
export const TS = [0.0, 0.34, 0.6, 0.8, 0.93, 1.0, 1.03, 1.065, 1.105, 1.14, 1.2, 1.28, 1.37, 1.47, 1.58,
  1.7, 1.83, 1.96, 2.09, 2.22, 2.36, 2.5, 2.64, 2.76, 2.86];
export const T_TRAIL = 1.085;
export const RIM = 2.45;             // outer edge of the island
export const TV = -68 * D2R;         // creek outlet: a gap in the mountain ring

// The seven stops in walking order, as angles around the lake (degrees).
export const STOPS = { trailhead: -90, cabin: -30, lookout: 25, camp: 80, dock: 135, point: 190, campfire: 240 } as const;
export type StopId = keyof typeof STOPS;

// Peaks as (angle deg, height, width deg): tall to the north, low hills to the south.
export const PEAKS: [number, number, number][] = [[84, 1.18, 16], [57, 0.95, 13], [33, 0.8, 12], [112, 1.04, 14], [137, 0.8, 12],
  [160, 0.88, 13], [10, 0.72, 13], [188, 0.74, 14], [-14, 0.5, 13], [212, 0.52, 13], [236, 0.22, 14], [-38, 0.3, 12]];

// Where the animals will stand (angle deg, ring t). Kept clear of trees now so Phase 6 can add them.
export const ANIMALS: [number, number][] = [[5, 1.132], [49, 1.165], [53.5, 1.2], [214, 1.17], [218, 1.2], [-52, 1.17]];

// Palette: linear albedo.
export type RGB = readonly [number, number, number];
export const C = {
  snow: [0.95, 0.95, 0.97], sand: [0.84, 0.78, 0.66], trail: [0.78, 0.64, 0.48],
  wood: [0.5, 0.33, 0.24], woodD: [0.34, 0.22, 0.17], coral: [0.9, 0.33, 0.24],
  gold: [0.95, 0.68, 0.22], cream: [0.93, 0.87, 0.74], rock: [0.47, 0.42, 0.47],
  win: [1.0, 0.78, 0.42],
} as const satisfies Record<string, RGB>;

// Quality tiers, from PLAN.md. Lights: which night point lights are on.
export const TIERS = {
  low: { pixelRatio: 1, trees: 600, reflection: false, shadows: false, lights: ["fire"], glow: false },
  medium: { pixelRatio: 1.5, trees: 1150, reflection: true, shadows: false, lights: ["fire", "stop"], glow: false },
  high: { pixelRatio: 2, trees: 1150, reflection: true, shadows: true, lights: ["fire", "stop", "lantern"], glow: true },
} as const;
export type Tier = keyof typeof TIERS;
export type LightGroup = "fire" | "stop" | "lantern";
export type Mode = "day" | "night";
