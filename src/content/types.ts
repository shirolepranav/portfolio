// The shape of src/content/site.ts. TypeScript uses this to catch wrong edits at build time.

/** The seven fixed places on the lake trail, in walking order. */
export const STOP_IDS = ["trailhead", "cabin", "lookout", "camp", "dock", "point", "campfire"] as const;
export type StopId = (typeof STOP_IDS)[number];

export type Status = "live" | "beta" | "in progress";

export interface Profile {
  name: string;
  role: string;          // short line, e.g. "Data engineer, heading for AI"
  city: string;          // "City, Country"
  tagline: string;       // the one-liner on the landing screen
  pitch: string;         // two sentences for the Highlights hero
  resume: string;        // path to the PDF in /public, e.g. "/resume.pdf"
  email: string;
  links: { linkedin: string; github: string; x: string; instagram: string }; // "" hides a link
  facts: { label: string; value: string | string[] }[]; // Highlights hero column; an array = one line each
}

/** Fields every section has. */
interface SectionBase {
  id: string;            // unique, lowercase, used in addresses
  enabled: boolean;      // false hides it everywhere
  stop: StopId | null;   // lake stop that shows it; null = Highlights only
  label: string;         // small label, e.g. "Work"
  short?: string;        // shorter label for the map and landing pins; defaults to label
  title: string;         // big heading on Highlights
  intro?: string;        // one line under the stop name in the lake panel
}

export interface PathStep { label: string; note: string; marker?: "now" | "next" }

export interface TextSection extends SectionBase {
  kind: "text";
  body: string[];        // one string per paragraph
  path?: PathStep[];     // optional "The path so far" steps
}

export interface Role {
  title: string;
  employer: string;
  city: string;
  start: string;         // e.g. "2022"
  end: string;           // e.g. "2024" or "Now"
  results: string[];     // one or two results, with numbers
  enabled?: boolean;     // false hides just this role
}

export interface RolesSection extends SectionBase {
  kind: "roles";
  items: Role[];
}

export interface TagGroup { name: string; tags: string[]; focus?: boolean }

export interface TagsSection extends SectionBase {
  kind: "tags";
  groups: TagGroup[];    // mark one group focus: true
}

export interface Project {
  name: string;
  line: string;          // one line: who it is for, what it does
  url: string;           // "" = not linked
  icon: string;          // path in /public/media, or "" for a placeholder tile
  status: Status;
  enabled: boolean;      // false hides just this item
}

export interface ProjectsSection extends SectionBase {
  kind: "projects";
  itemType: string;      // what one item is called, e.g. "iOS app"
  items: Project[];
}

export interface Photo { src: string; alt: string }

export interface GallerySection extends SectionBase {
  kind: "gallery";
  line: string;          // the "Off the clock" sentence on Highlights
  photos: Photo[];       // every photo needs alt text
}

export interface ContactSection extends SectionBase {
  kind: "contact";
  headline: string;      // email and links come from profile
}

export type Section =
  | TextSection | RolesSection | TagsSection | ProjectsSection | GallerySection | ContactSection;

export interface SiteContent {
  profile: Profile;
  stops: Record<StopId, string>; // display name of each stop, e.g. "The Cabin"
  stopsShort: Record<StopId, string>; // short name for the desktop rail, e.g. "Cabin"
  sections: Section[];           // order here = order on Highlights
  ui: Record<string, string>;    // small interface words (buttons, labels)
}
