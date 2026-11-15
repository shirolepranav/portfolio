// Checks the Person structured data in the built pages (run npm run build first): node scripts/check-person.mjs
// Finds each <script type="application/ld+json">, parses it and checks every field against schema.org's Person,
// then prints it. Exits with an error if something is wrong, so it can sit in a launch checklist.
import { readFileSync } from "node:fs";

const PAGES = { "/": "dist/index.html", "/highlights": "dist/highlights/index.html" };
const KNOWN = ["@context", "@type", "name", "jobTitle", "url", "email", "address", "sameAs"]; // all real Person properties
const placeholder = /\[[^\]]+\]/;
const isUrl = (v) => { try { return new URL(v).protocol === "https:"; } catch { return false; } };
let problems = 0, shown = false;

for (const [page, file] of Object.entries(PAGES)) {
  const html = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  const fail = (msg) => { console.error(`  error    ${page}: ${msg}`); problems++; };
  if (blocks.length !== 1) { fail(`expected one JSON-LD block, found ${blocks.length}`); continue; }
  let d;
  try { d = JSON.parse(blocks[0][1]); } catch (e) { fail(`not valid JSON (${e.message})`); continue; }

  if (d["@context"] !== "https://schema.org") fail(`@context should be "https://schema.org"`);
  if (d["@type"] !== "Person") fail(`@type should be "Person"`);
  for (const k of Object.keys(d)) if (!KNOWN.includes(k)) fail(`unexpected property "${k}"`);
  for (const k of ["name", "jobTitle"]) if (typeof d[k] !== "string" || !d[k].trim()) fail(`${k} is empty`);
  if (!isUrl(d.url) || !d.url.endsWith("/")) fail(`url "${d.url}" should be the site's https address`);
  if (!/^mailto:[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(d.email ?? "")) fail(`email "${d.email}" is not an address`);
  if (d.address?.["@type"] !== "PostalAddress" || !d.address.addressLocality) fail("address needs a PostalAddress with addressLocality");
  if (!Array.isArray(d.sameAs) || !d.sameAs.length) fail("sameAs should list at least one profile link");
  else for (const l of d.sameAs) if (!isUrl(l)) fail(`sameAs link "${l}" is not an https address`);
  if (placeholder.test(JSON.stringify(d))) fail("still holds [placeholder] text");

  if (!shown) { console.log(JSON.stringify(d, null, 2)); shown = true; }
}
if (problems) { console.error(`\nPerson data has ${problems} problem(s).`); process.exit(1); }
console.log(`\nPerson data is valid on ${Object.keys(PAGES).join(" and ")}.`);
