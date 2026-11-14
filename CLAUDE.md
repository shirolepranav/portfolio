# Rules for AI editors

Read PLAN.md before any code change. Build phase by phase, in the order of its "Build phases" section.

- To change text, add a project or hide a section, edit only `src/content/site.ts` and `public/media/`.
- Do not touch `src/world/` or `src/styles/tokens.css` for a content change.
- Run `npm run check` and `npm run build` before finishing. `npm run check:launch` also fails on [placeholder] text.
- Keep the comment style: short, plain, one line where possible.
- `reference/` is the design source of truth and never ships. Do not edit it.
