// Person structured data (JSON-LD) built from profile in site.ts. Search engines read it to show who the site is about.
// Used on / and /highlights; scripts/check-person.mjs validates the built pages.
import type { Profile } from "./types.ts";

export function personData(p: Profile) {
  // "Toronto, Canada": the part before the last comma is the city, the rest the country.
  const at = p.city.lastIndexOf(",");
  const locality = at > 0 ? p.city.slice(0, at).trim() : p.city.trim();
  const country = at > 0 ? p.city.slice(at + 1).trim() : "";
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: p.name,
    jobTitle: p.role,
    url: `${p.site}/`,
    email: `mailto:${p.email}`,
    address: { "@type": "PostalAddress", addressLocality: locality, ...(country && { addressCountry: country }) },
    sameAs: Object.values(p.links).filter((l) => l.trim() !== ""), // "" hides a link, here too
  };
}

/** The data as text for a <script type="application/ld+json">, with "<" escaped so no value can close the tag. */
export const personJson = (p: Profile) => JSON.stringify(personData(p)).replace(/</g, "\\u003c");
