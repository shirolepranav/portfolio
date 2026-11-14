// Validates src/content/site.ts and explains problems in plain English.
// Run with `npm run check`. Add `--launch` to also fail on [placeholder] text and a missing résumé.

import { existsSync } from "node:fs";
import { site } from "./site.ts";
import { STOP_IDS } from "./types.ts";
import type { Section } from "./types.ts";

const launch = process.argv.includes("--launch");
const errors: string[] = [];
const warnings: string[] = [];

// A file referenced as "/media/x.png" must exist in /public.
const inPublic = (path: string) => existsSync(new URL(`../../public${path}`, import.meta.url));

function required(value: unknown, where: string) {
  const empty = Array.isArray(value) ? value.length === 0 : typeof value !== "string" || value.trim() === "";
  if (empty) errors.push(`${where} is empty. Fill it in.`);
}

// Profile
const p = site.profile;
for (const key of ["name", "role", "city", "tagline", "pitch", "resume", "email"] as const) {
  required(p[key], `profile.${key}`);
}
if (p.resume && !inPublic(p.resume)) {
  (launch ? errors : warnings).push(`The résumé "${p.resume}" is not in /public yet.`);
}

// Stop names
for (const id of STOP_IDS) required(site.stops[id], `stops.${id}`);

// Sections
const sections: readonly Section[] = site.sections;
const ids = new Set<string>();
const perStop = new Map<string, string[]>();

sections.forEach((s, i) => {
  const where = `Section ${i + 1} ("${s.id || "no id"}")`;
  required(s.id, `${where} id`);
  if (ids.has(s.id)) errors.push(`${where}: the id "${s.id}" is used twice. Ids must be unique.`);
  ids.add(s.id);
  required(s.label, `${where} label`);
  required(s.title, `${where} title`);

  if (s.stop !== null && !(STOP_IDS as readonly string[]).includes(s.stop)) {
    errors.push(`${where}: stop "${s.stop}" does not exist. Use one of: ${STOP_IDS.join(", ")}, or null.`);
  }
  if (s.enabled && s.stop) perStop.set(s.stop, [...(perStop.get(s.stop) ?? []), s.id]);

  switch (s.kind) {
    case "text":
      required(s.body, `${where} body`);
      break;
    case "roles":
      required(s.items, `${where} items`);
      s.items.forEach((r, j) => {
        for (const key of ["title", "employer", "start", "end"] as const) required(r[key], `${where} role ${j + 1} ${key}`);
      });
      break;
    case "tags":
      required(s.groups, `${where} groups`);
      break;
    case "projects":
      required(s.itemType, `${where} itemType`);
      s.items.forEach((item, j) => {
        required(item.name, `${where} item ${j + 1} name`);
        required(item.line, `${where} item ${j + 1} line`);
        if (item.icon && !inPublic(item.icon)) errors.push(`${where} item "${item.name}": image "${item.icon}" is missing from /public.`);
      });
      break;
    case "gallery":
      s.photos.forEach((photo, j) => {
        if (!inPublic(photo.src)) errors.push(`${where} photo ${j + 1}: image "${photo.src}" is missing from /public.`);
        required(photo.alt, `${where} photo ${j + 1} alt text`);
      });
      break;
    case "contact":
      required(s.headline, `${where} headline`);
      break;
    default:
      errors.push(`${where}: unknown kind "${(s as { kind: string }).kind}".`);
  }
});

for (const [stop, list] of perStop) {
  if (list.length > 2) errors.push(`Stop "${stop}" has ${list.length} sections (${list.join(", ")}). The most is two.`);
}

// Placeholders: any text in [square brackets].
const placeholders: string[] = [];
(function walk(value: unknown, path: string) {
  if (typeof value === "string") {
    if (/\[[^\]]+\]/.test(value)) placeholders.push(`${path}: ${value.length > 70 ? value.slice(0, 67) + "..." : value}`);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k);
  }
})(site, "");
if (placeholders.length) {
  const msg = `${placeholders.length} placeholder(s) still in site.ts:\n    ${placeholders.join("\n    ")}`;
  (launch ? errors : warnings).push(msg);
}

// Report
for (const w of warnings) console.warn(`  warning  ${w}`);
for (const e of errors) console.error(`  error    ${e}`);
if (errors.length) {
  console.error(`\nsite.ts has ${errors.length} problem(s). Fix them and run npm run check again.`);
  process.exit(1);
}
console.log(`site.ts looks good${warnings.length ? ` (${warnings.length} warning(s))` : ""}.`);
