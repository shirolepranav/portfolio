// Makes the share image (public/share.jpg, 1200 x 630): the wide lake still with the name and role on it,
// in the site's typefaces and colours. Links shared on social sites and chat apps show this picture.
// Run after changing profile.name or profile.role in src/content/site.ts: node scripts/make-share-image.mjs
// Needs a network connection: it downloads just the letters it needs from Google Fonts (as the build does).
// Uses sharp and fontkitten, which Astro already installs.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { create } from "fontkitten";
import { site } from "../src/content/site.ts";

// Testing a layout: --name="A Long Name" --role="..." --out=path/to/test.jpg (default: the profile, public/share.jpg).
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const W = 1200, H = 630, PAD = 72;
const INK = "#0F1B24", PAPER = "#F3EFE8", CORAL = "#F08A6E", SLATE = "#3B4750"; // from src/styles/tokens.css
const name = arg("name") ?? site.profile.name, role = arg("role") ?? site.profile.role, address = site.profile.site;
const nameText = name.toUpperCase(), roleText = role.toUpperCase(), hostText = address.replace(/^https:\/\//, "").toUpperCase();

/** Downloads one weight of a Google font, cut down to the given letters, as a static WOFF that fontkitten reads. */
async function googleFont(family, weight, text) {
  const q = `family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`;
  // An older browser name makes Google send WOFF at a fixed weight, not WOFF2 with a weight axis.
  const ua = "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.30 (KHTML, like Gecko) Safari/534.30";
  const css = await (await fetch(`https://fonts.googleapis.com/css2?${q}`, { headers: { "User-Agent": ua } })).text();
  const url = css.match(/url\((https:[^)]+)\)/)?.[1];
  if (!url) throw new Error(`Google Fonts sent no file for ${family} ${weight}:\n${css.slice(0, 300)}`);
  return create(Buffer.from(await (await fetch(url)).arrayBuffer()));
}

/** One line of text as an SVG path: size in px, extra space between letters in em, left edge x, baseline y. */
function textPath(font, text, size, tracking, x, y) {
  const k = size / font.unitsPerEm;
  let d = "", pen = x;
  for (const g of font.glyphsForString(text)) {
    // Font outlines point y up; SVG points y down, so flip while moving each letter into place.
    const p = g.path;
    if (p.commands.length) d += p.transform(k, 0, 0, -k, pen, y).toSVG();
    // The width comes from the font's metrics table: fontkitten fails on blank letters such as the space.
    // Fonts may list fewer widths than letters; the rest share the last one.
    const m = font.hmtx.metrics, adv = (m.get(Math.min(g.id, m.length - 1)) ?? m.get(m.length - 1)).advance;
    pen += adv * k + tracking * size;
  }
  return { d, width: pen - x - tracking * size };
}
const widthOf = (font, text, size, tracking) => textPath(font, text, size, tracking, 0, 0).width;

const display = await googleFont("Big Shoulders", 800, nameText);
const mono = await googleFont("DM Mono", 500, `${roleText}${hostText}`);

// The name: as large as fits the left two thirds, on one line or split into two at a space.
const maxW = 760;
let lines = [nameText], size = 150;
const fits = (ls, s) => ls.every((l) => widthOf(display, l, s, 0) <= maxW);
while (size > 64 && !fits(lines, size)) {
  const words = nameText.split(" ");
  if (lines.length === 1 && words.length > 1 && size < 128) {
    // Split where the two lines come out closest in width.
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const ls = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
      const worst = Math.max(...ls.map((l) => widthOf(display, l, 1, 0)));
      if (!best || worst < best.worst) best = { ls, worst };
    }
    lines = best.ls; size = 150; continue;
  }
  size -= 2;
}
const lineH = size * 0.88;

// Top to bottom: the role label, then the name.
const roleSize = 22, roleY = PAD + 16;
const roleLine = textPath(mono, roleText, roleSize, 0.14, PAD + 30, roleY + roleSize * 0.36);
const nameTop = roleY + 36;
const nameLines = lines.map((l, i) => textPath(display, l, size, 0, PAD - size * 0.03, nameTop + size * 0.74 + i * lineH));
const hostSize = 16, host = textPath(mono, hostText, hostSize, 0.14, 0, 0);
const hostPath = textPath(mono, hostText, hostSize, 0.14, W - PAD - host.width, H - PAD + 6);
const pillW = host.width + 44;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <!-- A soft Paper wash behind the text, gone before the lake and the hiker. -->
    <radialGradient id="fade" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${PAD} ${PAD}) scale(${W * 0.78} ${H * 0.82})">
      <stop offset="0" stop-color="${PAPER}" stop-opacity="0.9"/>
      <stop offset="0.55" stop-color="${PAPER}" stop-opacity="0.7"/>
      <stop offset="1" stop-color="${PAPER}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#fade)"/>
  <circle cx="${PAD + 8}" cy="${roleY}" r="8" fill="${CORAL}"/>
  <path d="${roleLine.d}" fill="${SLATE}"/>
  ${nameLines.map((l) => `<path d="${l.d}" fill="${INK}"/>`).join("\n  ")}
  <rect x="${W - PAD - host.width - 22}" y="${H - PAD - 24}" width="${pillW}" height="44" rx="22" fill="${PAPER}" fill-opacity="0.86"/>
  <path d="${hostPath.d}" fill="${INK}"/>
</svg>`;

// The still is 2:1; the share image is a little taller, so trim its sides evenly.
const still = fileURLToPath(new URL("../src/assets/vista-day-wide.jpg", import.meta.url));
const out = arg("out") ?? fileURLToPath(new URL("../public/share.jpg", import.meta.url));
const buf = await sharp(still).resize(W, H, { fit: "cover" }).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
writeFileSync(out, buf);
console.log(`${out}: ${W} x ${H}, ${(buf.length / 1024).toFixed(0)} KB, name at ${size} px on ${lines.length} line(s)`);
