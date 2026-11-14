// Small read-only helpers over the content file, shared by Highlights and (later) the lake.
import type { GallerySection, ProjectsSection, Section } from "./types.ts";

/** Enabled sections, with hidden roles and projects removed. */
export function visibleSections(sections: readonly Section[]): Section[] {
  return sections
    .filter((s) => s.enabled)
    .map((s) => {
      if (s.kind === "projects") return { ...s, items: s.items.filter((i) => i.enabled) };
      if (s.kind === "roles") return { ...s, items: s.items.filter((r) => r.enabled !== false) };
      return s;
    });
}

/** One block on the Highlights page. All projects sections merge into one block. */
export type HighlightsBlock =
  | { kind: "section"; section: Exclude<Section, ProjectsSection | GallerySection> }
  | { kind: "projects"; sections: ProjectsSection[] }
  | { kind: "gallery"; section: GallerySection };

/** Highlights follows file order; the merged projects block sits where the first projects section is. */
export function highlightsBlocks(sections: readonly Section[]): HighlightsBlock[] {
  const visible = visibleSections(sections);
  const projects = visible.filter((s): s is ProjectsSection => s.kind === "projects" && s.items.length > 0);
  const blocks: HighlightsBlock[] = [];
  for (const s of visible) {
    if (s.kind === "projects") {
      if (projects.length && s === projects[0]) blocks.push({ kind: "projects", sections: projects });
    } else if (s.kind === "gallery") {
      blocks.push({ kind: "gallery", section: s });
    } else {
      blocks.push({ kind: "section", section: s });
    }
  }
  return blocks;
}

/** "07" style two-digit numbers for labels and stop badges. */
export const pad2 = (n: number) => String(n).padStart(2, "0");
