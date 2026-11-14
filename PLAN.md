# Portfolio site build plan: The Lake Loop

Nov 13, 2026 · @Pranav Shirole

## Start here

This plan is the complete brief for building the site in a fresh Claude Code session. Nothing from the design chat is needed beyond the three items below.

| Item | What it is | Where it goes |
| --- | --- | --- |
| This plan | Every decision, spec and build step | Export as Markdown, save as `PLAN.md` in the repo root |
| Design canvas | Nine screens: landing, lake loop and Highlights, for phone and desktop | [Portfolio: The Lake Loop](https://claude.ai/artifact/1q6zFe8aM9io2oK32L96uY), private to the owner |
| Reference pack | Nine rendered scene frames, the Python scripts that generated the world, and the HTML source of the nine designed screens | Unzip into `reference/` in the repo |

The frames are the visual target. The scripts are the source of truth for the world layout: stop positions, terrain shape, props and light settings.

### Kickoff prompt

Paste this as the first message of the new session, with the repo open.

```text
You are building my portfolio site in this repository.

1. Read PLAN.md fully before writing any code.
2. Look at every image in reference/frames and read reference/scene/*.py.
   The images are the visual target. The scripts define the world layout.
3. Build phase by phase, in the order of the "Build phases" section.
   After each phase, tell me how to preview it and wait for my OK.
4. Keep all text and section switches in src/content/site.ts.
   Never hard-code copy inside components or 3D code.
5. Install the latest stable Astro and Three.js, and check their current
   docs before using an API. Do not rely on memory for version details.
6. Comment the code clearly and briefly, so a beginner can follow it.
7. If something is not covered in PLAN.md, ask me before guessing.

Start with Phase 0.
```

## The product in brief

One portfolio site with two ways in, built to land the owner an AI engineering role.

The owner is a data engineer in Toronto. Background: mechanical engineering, a master's in industrial engineering, self-taught programming, then web development, software engineering, UI/UX design and data analytics. The owner also ships iOS apps and SaaS products solo.

The landing screen offers two choices, and both show the same content from one file.

| Path | For whom | What they get |
| --- | --- | --- |
| Walk the lake | Engineers, designers, award jurors, anyone with five minutes | A 3D mountain lake. A hiker walks a loop trail past seven stops, one per section of the owner's life |
| Just the highlights | Recruiters and hiring managers with two minutes | One fast page: role, résumé, skills, work, side projects, contact |

The site succeeds when all four of these hold:

- A recruiter on a phone reaches the résumé button within 10 seconds of landing.
- The lake runs smoothly on a three-year-old mid-range phone.
- Every fact lives in one content file and appears correctly in both paths.
- The lake loop is polished enough to submit to web design awards.

## Decisions and open inputs

Nine decisions are settled; four more are recommendations for the owner to confirm before Phase 0.

### Settled with the owner

| Topic | Decision |
| --- | --- |
| Entry | A landing screen with two buttons: "Walk the lake" and "Just the highlights" |
| Setting | A floating low-poly island: a turquoise lake ringed by snowy peaks, inspired by Banff |
| Movement | Follow the trail. Scroll, swipe or hold a key to walk the loop. No free roam |
| 3D style | Low-poly, but softer: rounded shapes and smooth shading on the hiker and animals |
| Stops | Seven fixed stops around the lake, one per content section |
| Day and night | A toggle on every 3D screen; both looks are designed |
| Mobile | Mobile-first. Touch on phones; keyboard, mouse and scroll on desktop |
| Editing | All text in one content file, with a switch to hide or show each section |
| Code home | A GitHub repository |

### Recommended, please confirm

| Topic | Recommendation | Reason |
| --- | --- | --- |
| Framework | Astro for pages, plain Three.js in TypeScript for the 3D | Highlights ships as static HTML with almost no JavaScript; the 3D code loads only when needed |
| 3D assets | Build the world, hiker and animals in code, with no downloaded models | Tiny download, one consistent style, nothing to license |
| Hosting | Any static host that deploys from GitHub | The site has no server or database |
| Sound | Included, off until the visitor turns it on | Browsers block autoplay, and many visitors browse muted |

### Needed from the owner

The build can start with placeholders. These replace them before launch.

- [ ] Full name as it should appear
- [ ] Résumé as a PDF
- [ ] Email, LinkedIn, GitHub, X and Instagram links
- [ ] Employers, job titles, dates, and one or two results per role with numbers
- [ ] Each iOS app: name, one-line description, App Store link, icon
- [ ] Each SaaS product: name, one-line description, link, logo, live or beta
- [ ] The real skills list, grouped as on the Highlights page
- [ ] Six to twelve photographs for the photography stop
- [ ] GitHub repository name, and a domain if there is one
- [ ] Yes or no on privacy-friendly analytics

## Visual system

The interface uses ten colours, three typefaces and one button shape, all taken from the design canvas. Put them in `src/styles/tokens.css` as CSS variables and use nothing else.

### Interface colours

| Token | Hex | Use |
| --- | --- | --- |
| `--ink` | `#0F1B24` | Text on light grounds, primary buttons by day |
| `--paper` | `#F3EFE8` | Light ground, text on dark grounds |
| `--night` | `#0B1620` | Dark ground, panels and HUD by night, the Contact block |
| `--coral` | `#F08A6E` | The one accent: current stop, primary arrow badge, "next" marker |
| `--teal` | `#2FC4BD` | Main action on dark grounds ("Keep walking"), "live" status |
| `--amber` | `#F2B84B` | "Beta" status, lantern glow |
| `--slate` | `#3B4750` | Secondary text on light grounds |
| `--mist` | `#A9B8BF` | Secondary text on dark grounds |
| `--fog` | `#D5DDE0` | Body text on dark grounds |
| `--sand` | `#E2DACC` | Placeholder tiles for icons and logos |

Coral, teal and amber are fills or text on dark only. As text on Paper they fail contrast.

### Type

| Role | Typeface | Settings |
| --- | --- | --- |
| Display | Big Shoulders, weight 800 | Uppercase, line height 0.86 to 0.92. Names, stop titles, button labels |
| Labels | DM Mono, weights 400 and 500 | Uppercase, 9 to 13 px, letter spacing 0.08 to 0.16 em |
| Body | Radio Canada, weights 400, 500, 600 | 15 to 26 px, line height 1.3 to 1.5 |

All three are Google Fonts. Self-host them in the build so no request leaves the site.

### Interface parts

- **Pills.** Buttons, chips and HUD bars are fully rounded. Panels use a 28 to 30 px corner radius.
- **HUD glass.** Bars over the 3D scene are Paper at 86% opacity by day and Night at 74% by night. No blur.
- **Primary button.** A pill with a display-type label and a 44 px circular arrow badge at the right end.
- **Stop badge.** A circle holding the two-digit stop number in DM Mono. Coral means "you are here".
- **Logo mark.** A ring with a solid dot on its upper right: the lake loop and the hiker.
- **Touch targets.** At least 44 by 44 px everywhere.

### 3D style: low-poly, but softer

The reference frames are fully faceted and the hiker is made of boxes. The owner wants the same world with softer forms.

| Element | Keep from the frames | Change |
| --- | --- | --- |
| Mountains and ground | Large flat facets, pastel lavender and cream shading | Nothing |
| Trees | Stacked cones in teal greens, about one in eight a gold larch | Slightly rounded tips |
| Hiker | Teal jacket, coral backpack with a cream bedroll, gold toque with a pom-pom, two trekking poles | Build from capsules and rounded boxes with smooth shading. No sharp box edges |
| Elk, moose, bears | Proportions and colours | Rounded bodies and smooth shading, same as the hiker |
| Props | Cabin, tower, tents, dock, canoes, tripod, campfire | Bevel the edges lightly |
| Water | Turquoise, lighter at the shore, soft mirror reflection, sun glitter | Nothing |

Use vertex colours only, with no image textures. Sample world colours from the frames, and read the palette constants at the top of `reference/scene/scene.py`.

### Day and night

|  | Day | Night |
| --- | --- | --- |
| Sky | Warm peach at the horizon rising to teal blue | Deep navy with stars and a faint Milky Way band |
| Key light | Low warm sun, long soft shadows | Cool moonlight from a crescent moon |
| Local light | None | Cabin and kiosk windows, tents glowing from inside, a lamp on the dock, the campfire, trail lanterns every 15 degrees |
| Fog | Light, sky-tinted, thicker low down | Heavier and bluer |
| HUD | Paper glass, Ink text | Night glass, Paper text |

Exact light colours and strengths are in `env_day` and `env_night` in `reference/scene/shots.py`.

## Screen by screen

The site has three routes and five screen states. Each state below names its design source in `reference/screens/`, which holds the exact markup, sizes and copy.

| Route | State | Design source |
| --- | --- | --- |
| `/` | Landing | `Main` (phone), `Landing-Desktop` |
| `/lake` | Walking | `Lake-Walk-Phone`, `Lake-Walk-Desktop` |
| `/lake#<stop>` | At a stop | `Lake-Stop-Phone`, `Lake-Stop-Desktop` |
| `/lake` | Map open | `Lake-Map-Phone` (desktop is not drawn; see below) |
| `/highlights` | One page | `Highlights` (fluid, also the phone design) |

### Landing

- The whole island floats on a peach-to-teal backdrop and turns slowly. Dragging spins it.
- Over it: a small label ("Data engineer, heading for AI"), the owner's name in display type, and the line "I never climbed a ladder. I walked the whole shoreline."
- Two stacked buttons. "Walk the lake" is Ink with a coral arrow. "Just the highlights" is outlined.
- A note under the buttons: "Best with sound. On a slow connection, Highlights loads instantly."
- Top right: day and night toggle, plus a sound button on desktop.
- Desktop only: the seven stop pins sit on the island, and the text block sits in the left third.

### Lake, walking

- The 3D scene fills the screen. The hiker sits low and slightly off centre, seen from behind.
- Top bar on phone: map button, progress rail with seven dots and the previous and next stop names, day and night toggle.
- Top on desktop: logo pill left, a rail naming all seven stops in the centre, Highlights link, sound and toggle right.
- A "Next stop" chip floats beside the next stop's prop, with its number, section and name. Tapping it walks there and opens it.
- Bottom on phone: a "Scroll" hint left, a Highlights link right.
- Bottom on desktop: a key-hint bar (W A S D hike, mouse look, E open a stop, "or just scroll") and a round mini-map.

### Lake, at a stop

- The camera settles on a composed view of the stop. The hiker stands in frame.
- Phone: a bottom sheet covers the lower 53% of the screen. Desktop: a 464 px panel sits on the right, inset 40 px.
- Panel content, top to bottom: section label, stop name in display type, one intro line, the section's items, then "Keep walking" with the next stop's name.
- The rail shows the current stop as a larger coral dot.
- Desktop adds a back button beside "Keep walking" and a key-hint bar: Esc closes, arrows change stop.

### Lake, map

- Phone: the whole island seen from above and in front, with numbered pins. Below it, a two-column list of the seven stops plus a Highlights link.
- The current stop is coral in both the pins and the list. Tapping a stop walks the hiker there.
- Desktop: clicking the mini-map or pressing M opens the same island view as a centred overlay with the same list. Reuse the phone layout at a wider size.

### Highlights

A single fluid page, light by default, ending in a dark Contact block. Sections in order:

1. Header: name, a "3D tour" link, a Résumé button.
2. Hero: label, name, a two-sentence pitch, "Download résumé" and "Get in touch", and a facts column (Now, Looking for, Based in, Education).
3. A wide still of the lake with a "Walk this lake in 3D" chip.
4. About: two short paragraphs and "The path so far", seven steps ending in "AI engineering, next".
5. Skills: five groups of tags, with the AI group marked as the focus.
6. Work: one row per role with dates, title, employer and two results.
7. Side projects: one row per app or product with icon, type, status and one line.
8. Off the clock: one sentence on hiking, photography, travel and hardware, with an Instagram link.
9. Contact: a large headline, email, résumé button and social links.

## The 3D world

The world is one small floating island: a lake in the middle, a loop trail on its shore, seven stops on the trail, and a ring of peaks around it. Port its layout from `reference/scene/scene.py`; the numbers below are from that file.

### Layout

Positions use an angle around the lake centre and a ring value `t`. At `t = 1` a point is on the shoreline; larger is further out.

| Feature | Value |
| --- | --- |
| Shoreline radius at angle θ | `1 + 0.10 sin(2θ + 0.6) + 0.06 sin(3θ + 2.1) + 0.035 sin(5θ + 4.0)` world units |
| Trail | `t = 1.085`, a closed loop |
| Island rim | `t = 2.45`, with a chunky rock underside |
| Tall peaks | North side, 33° to 160°, the highest at 84° |
| Low hills | South side, so the landing camera sees over them into the lake |
| Creek outlet | −68°, with a footbridge on the trail and a waterfall off the rim |
| Hiker height | 0.05 units. Scale the world by 35 so the hiker is about 1.75 m |
| Trees | About 1,150 below the tree line, one in eight a gold larch, none within 0.13 units of a stop |
| Trail lanterns | Every 15° at `t = 1.118`, lit at night |

Match the frames rather than the script's axis handedness. Seen from the landing camera, the trailhead is nearest, the cabin is to the right, and the walk runs counter-clockwise viewed from above.

### The seven stops

| # | Name | Angle | Prop | Section it shows | Night light |
| --- | --- | --- | --- | --- | --- |
| 01 | Trailhead | −90° | Information kiosk with a small gable roof | About | Kiosk lamp |
| 02 | The Cabin | −30° | Ranger cabin with a porch | Work | Lit windows |
| 03 | The Lookout | 25° | Fire lookout tower on stilts | Skills, and AI builds as a second tab | Cab window |
| 04 | The Camp | 80° | Three tents: coral, gold, cream. One tent per app | iOS apps | Tents glow from inside |
| 05 | The Dock | 135° | Wooden dock reaching 0.24 units into the lake, with canoes. One canoe per product | SaaS products | Lamp at the dock end |
| 06 | The Point | 190° | Rocky point with a camera on a tripod | Photography | None; moonlit |
| 07 | The Campfire | 240° | Stone fire ring with two log benches | Contact | The fire, the strongest light on the island |

Tent and canoe counts follow the content file: one per enabled item, up to five. Extra items appear in the panel only.

### Hiker and wildlife

| Character | Where | Behaviour |
| --- | --- | --- |
| Hiker | On the trail, at the visitor's progress | Walk cycle tied to speed, poles swing, pack bounces. Turns around when walking backwards. Idles with a slow breath and a look around |
| Elk, four | Near 5°, 49°, 53.5° and −52°, just outside the trail | Graze. Lift and turn the head when the hiker comes close |
| Bear and cub | Near 214° and 218°, uphill from the trail | Amble a short path. The cub follows |
| Moose, one | 108°, wading in the shallows | Dips its head to drink, with ripples |
| Birds, three | High over the north peaks | Slow circling, day only |

Animals never block the trail and have no collision.

### Water, light and atmosphere

- **Water.** A flat surface with a custom shader: turquoise that deepens toward the centre, a soft mirrored reflection of the scene, moving glitter under the sun or moon, and a pale foam line at the shore.
- **Light.** One directional light for the sun or moon, plus a sky and ground ambient pair. At night, add the warm point lights listed in the stops table.
- **Fog.** Distance and height fog tinted by the sky colour in that direction.
- **Underside and waterfall.** Visible only from the landing and map views. Skip drawing them while walking.

## Movement, camera and input

One number drives the whole lake: `progress`, from 0 to 1 around the loop. Every input only pushes that number forward or back, so nobody can get lost or miss a stop.

### Controls

| Action | Phone | Desktop |
| --- | --- | --- |
| Walk forward or back | Swipe up or down, with momentum | Scroll wheel or trackpad; hold W or S, or the up and down arrows |
| Look around | Drag sideways | Drag with the mouse; A and D or the left and right arrows |
| Open a stop | Tap the "Next stop" chip or the prop | Click it, or press E or Enter when near |
| Close a stop | Swipe the sheet down, or tap the close button | Esc, or the close button |
| Previous or next stop | "Keep walking" in the sheet | Left and right arrows while a panel is open |
| Map | Map button in the top bar | M, or click the mini-map |
| Day or night | Toggle in the top bar | Toggle, or N |

### Walking rules

- The `/lake` page never scrolls. The canvas is fixed and captures wheel and touch input itself.
- Input adds velocity to `progress`. Velocity eases out when input stops, and is capped so a hard flick cannot skip a stop.
- The loop wraps: walking past stop 07 arrives back at stop 01.
- Walking backwards works. The hiker turns to face the direction of travel.
- Within 3% of a stop, walking slows gently and the stop's chip pulses. Stops never open on their own.
- "Keep walking" and map jumps move `progress` to the target stop over one to three seconds, along the shorter way round.
- On a first visit, show one hint for three seconds: "Swipe up to hike" on phones, "Scroll or hold W to hike" on desktop.

### Camera

| State | Camera |
| --- | --- |
| Walking | Behind and above the hiker. It looks between the trail ahead and the far shore, about 40% toward the shore on desktop and 50% on phones, so the lake and peaks stay in frame |
| Looking around | Yaw offset of up to 35° either side, easing back to centre two seconds after release |
| At a stop | Eases over 1.2 seconds to a composed shot stored per stop. The hiker and prop sit clear of the panel: upper half on phones, left two thirds on desktop |
| Map and landing | High orbit showing the whole island. Dragging spins it |
| Field of view | About 64° in portrait and 50° in landscape |

The walking and dock shots in `reference/scene/shots.py` give working camera offsets for both orientations. Keep the camera above the terrain and clear of trees along the whole loop.

### Links and history

- Each stop has an address: `/lake#trailhead`, `#cabin`, `#lookout`, `#camp`, `#dock`, `#point`, `#campfire`.
- Opening a stop updates the address. The browser's back button closes the panel.
- Opening a stop address directly loads the lake with the hiker already there and the panel open.
- The visitor's last position and day or night choice are remembered for the browser session.

## Content model

Every word a visitor reads lives in one typed file, `src/content/site.ts`. The Highlights page, the lake panels, the rail and the map all read from it, so an edit there updates everything.

### Shape of the file

```ts
// src/content/site.ts
// Everything a visitor can read lives in this file.
// Edit text here. Never put copy inside page or 3D code.

export const site: SiteContent = {
  profile: {
    name: "[Your Name]",
    role: "Data engineer, heading for AI",
    city: "Toronto, Canada",
    tagline: "I never climbed a ladder. I walked the whole shoreline.",
    pitch: "I build the pipelines that feed models, then ship the product on top.",
    resume: "/resume.pdf",            // file lives in /public
    email: "[you@email.com]",
    links: { linkedin: "", github: "", x: "", instagram: "" },
  },

  // One entry per section.
  // The order here is the order on the Highlights page.
  sections: [
    {
      id: "about",
      enabled: true,                 // false hides it everywhere
      stop: "trailhead",             // lake stop that shows it; null = Highlights only
      kind: "text",                  // which layout to use (see table below)
      label: "About",
      title: "The short version",
      body: ["First paragraph.", "Second paragraph."],
      path: [{ label: "Mechanical engineering", note: "Bachelor's" }],
    },
    {
      id: "saas",
      enabled: true,
      stop: "dock",
      kind: "projects",
      label: "SaaS products",
      title: "The Dock",
      intro: "One canoe per product. Each one designed, built and launched solo.",
      items: [
        {
          name: "Product One",
          line: "[One line: who it is for, what it does]",
          url: "",
          icon: "/media/product-one.png",
          status: "live",            // "live" | "beta" | "in progress"
          enabled: true,             // false hides just this item
        },
      ],
    },
  ],
};
```

### Section kinds

| `kind` | Holds | Starting sections |
| --- | --- | --- |
| `text` | Paragraphs, plus an optional list of path steps | About, at the Trailhead |
| `roles` | Jobs: title, employer, city, dates, results | Work, at the Cabin |
| `tags` | Named groups of short tags, one group flagged as the focus | Skills, at the Lookout |
| `projects` | Items with name, one line, link, icon and status | iOS apps at the Camp, SaaS at the Dock, AI builds at the Lookout |
| `gallery` | Photos with alt text, plus an Instagram link | Photography, at the Point |
| `contact` | Headline; email and links come from `profile` | Contact, at the Campfire |

### Rules the code must follow

- **Hide a section:** `enabled: false` removes it from Highlights, its panel, the rail and the map.
- **Empty stops:** a stop with no enabled section keeps its prop as scenery, but the rail and map skip it and the remaining stops renumber.
- **Two sections on one stop:** allowed, at most two. The panel then shows a two-tab switch. Skills and AI builds share the Lookout this way.
- **New section:** adding an entry with an existing `kind` needs no other code. It appears on Highlights at once, and in the lake when `stop` is set.
- **Highlights grouping:** all `projects` sections merge into one "Side projects" list. A `gallery` shows as the "Off the clock" line with its Instagram link.
- **Media:** images go in `public/media/`. Every image needs alt text.
- **Checks:** `npm run check` validates the file and fails with a plain-English message. It catches an unknown stop, three sections on one stop, a missing required field, a missing image, and `[placeholder]` text in a production build.

### Rules for AI editors

Put these in `CLAUDE.md` at the repo root so Opus or Sonnet sessions follow them.

- To change text, add a project or hide a section, edit only `src/content/site.ts` and `public/media/`.
- Do not touch `src/world/` or `src/styles/tokens.css` for a content change.
- Run `npm run check` and `npm run build` before finishing.
- Keep the comment style: short, plain, one line where possible.

## Technical architecture

A static site: Astro builds three pages from the content file, and a self-contained Three.js module draws the world on two of them. There is no server, database or UI framework.

### Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Pages | Astro, static output | Highlights ships as plain HTML and CSS, readable with JavaScript off |
| Language | TypeScript, strict | The content file is type-checked, so a wrong edit fails the build with a clear message |
| 3D | Three.js with its WebGL renderer | Widest phone support. No React layer between the code and the scene |
| Styling | Plain CSS with variables from `tokens.css` | Nothing extra to learn for future edits |
| Tweens | One small animation library such as GSAP, or hand-written easing | Camera moves and panel springs. Loaded only on pages that animate |
| Fonts | Self-hosted Big Shoulders, DM Mono, Radio Canada | No third-party requests |
| Deploy | Static host connected to the GitHub repo | Every push to `main` publishes; every pull request gets a preview link |

### Repository layout

```text
/
├─ PLAN.md                  this document
├─ CLAUDE.md                rules for AI editors
├─ reference/               frames, screens and Python scene scripts (not shipped)
├─ public/
│  ├─ resume.pdf
│  ├─ media/                icons, logos, photos
│  └─ audio/                ambient loop, footsteps, chime
└─ src/
   ├─ content/
   │  ├─ site.ts            ALL copy and section switches
   │  ├─ types.ts           the SiteContent type
   │  └─ check.ts           validation run by `npm run check`
   ├─ pages/
   │  ├─ index.astro        landing
   │  ├─ lake.astro         3D world + HUD
   │  └─ highlights.astro   one-page version
   ├─ components/           Astro parts: buttons, rail, panel, section layouts
   ├─ styles/
   │  ├─ tokens.css         colours, type, radii
   │  └─ global.css
   ├─ ui/                   small TypeScript for HUD, panels, map, input hints
   └─ world/                everything Three.js
      ├─ index.ts           createWorld(canvas, options): the only entry point
      ├─ config.ts          stop angles, camera shots, quality tiers
      ├─ terrain.ts         island, peaks, shore, trail
      ├─ water.ts           lake shader
      ├─ flora.ts           instanced trees, rocks, lanterns
      ├─ props/             one file per stop prop
      ├─ actors/            hiker, elk, moose, bear, birds
      ├─ sky.ts             day and night sky, sun, moon, stars
      ├─ lighting.ts        day and night light sets and the blend between them
      ├─ camera.ts          trail follow, look offset, stop shots, orbit
      ├─ input.ts           wheel, touch and keys, all reduced to progress velocity
      ├─ audio.ts
      └─ state.ts           progress, active stop, day or night, sound, quality
```

### How the pieces talk

- `src/world/` knows nothing about copy. It receives the list of enabled stops and reports events: progress changed, near a stop, stop opened.
- The HUD, rail, map list and panels are HTML laid over the canvas, built by Astro from the content file. This keeps text selectable and readable by screen readers.
- `state.ts` is a small event store shared by the world and the HUD. The landing page and the lake page both call `createWorld` with different camera modes.

The landing and the lake share one canvas and one world. `index.astro` and `lake.astro` render the same shell with a different starting mode. Moving between them changes the address with the History API instead of loading a new page, which is what makes the dive possible.

### Rendering approach

- **Geometry is generated in code** at load, from seeded functions ported from the Python reference. Use a fixed seed so the island is identical on every visit.
- **Few draw calls.** Merge static geometry into a handful of meshes by material. Use instancing for trees, rocks and lanterns.
- **Vertex colours, no textures.** Flat shading on terrain, trees and props; smooth shading on the hiker and animals.
- **Characters are built from rounded primitives** and animated with simple math-driven poses. No rigs and no downloaded models. Keep each actor behind one interface so a modelled character could replace it later.
- **Shadows.** One shadow map on desktop. On phones, a soft blob shadow under each character and darkened vertex colours under trees.
- **Post-processing.** None on phones. An optional soft glow on desktop at the high quality tier.

### Quality tiers

Pick a tier at start from device hints, then step down if the frame rate drops for three seconds.

| Setting | Low | Medium | High |
| --- | --- | --- | --- |
| Pixel ratio cap | 1 | 1.5 | 2 |
| Trees | 600 | 1,150 | 1,150 |
| Water reflection | Sky colour only | Mirrored scene at half size | Mirrored scene at half size |
| Shadows | Blob | Blob | Shadow map |
| Night point lights | Campfire only | Stops | Stops and lanterns |
| Glow | Off | Off | On |

### Loading and fallbacks

- **Landing** shows its HTML and a still of the island at once. The 3D module loads afterwards and fades in over the still.
- **Lake** shows a still of the walking view with a slim progress line until the world is ready.
- **No WebGL, or the context is lost:** show a short message with a button to Highlights.
- **Reduced-motion preference:** the landing puts "Just the highlights" first, and the lake replaces camera flights with cuts.
- **Hidden tab:** pause the render loop and audio.

## Motion and sound

Spend the animation budget on three signature moments, keep the world gently alive, and keep Highlights quick. The signature moments are the dive from the landing into the lake, the day-to-night sweep, and arriving at a stop.

### Signature moments

| Moment | What happens | Length |
| --- | --- | --- |
| The dive | On "Walk the lake", the landing text lifts away. The camera drops from the island orbit, sweeps over the water and settles behind the hiker at the Trailhead. One continuous shot, with no page reload | 2.5 s |
| Day to night | The sun arcs down behind the peaks, the sky gradient sweeps to navy, stars fade in, then windows, tents, lanterns and the fire light up one after another around the loop | 1.8 s |
| Arriving at a stop | The camera eases to the stop's shot. The prop reacts, then the panel springs up and its rows appear one by one | 1.2 s |

### Prop reactions

| Stop | Reaction when opened |
| --- | --- |
| Trailhead | The kiosk lamp blinks on |
| The Cabin | The door swings open and chimney smoke starts |
| The Lookout | A light sweeps once from the tower cab |
| The Camp | Tent flaps flutter; each tent bounces as its app row appears |
| The Dock | Canoes bob in turn as their product rows appear |
| The Point | The camera flashes once |
| The Campfire | The fire flares and sparks rise |

### Always-on life

- The landing island turns slowly and bobs a little. Dragging spins it with momentum.
- Water glitter drifts. Reflections wobble slightly.
- The hiker's walk cycle matches walking speed. Poles plant, the pack bounces, the pom-pom lags behind.
- Animals graze, drink and turn their heads. Birds circle by day.
- Night lanterns and the fire flicker. Stars twinkle faintly.
- The "Next stop" chip tracks its prop on screen and pulses when the hiker is near.

### Highlights page

- On load, the name rises in letter by letter, then the pitch and buttons fade up. Total under 0.9 s.
- Section headings and rows fade up 12 px as they enter the view, once.
- "The path so far" draws its seven steps left to right; the coral "next" step lands last.
- Button arrows nudge on hover and press.
- Nothing delays reading, nothing hijacks scrolling, and no effect runs longer than 0.6 s after load.

### Sound

| Sound | When |
| --- | --- |
| Ambient bed | Wind and lapping water by day; crickets and quieter water by night |
| Footsteps | Timed to the walk cycle, softer on sand than on the dock |
| Stop chime | One soft note as a panel opens |
| Fire crackle | Near the Campfire, louder as the hiker approaches |

Sound is off until the visitor turns it on, and the choice is remembered. Keep all audio under 400 KB in total. Use only CC0 or owned recordings and list them in `CREDITS.md`.

### Reduced motion

When the visitor's system asks for reduced motion: no letter animation, no scroll reveals, camera cuts instead of flights, a still island on the landing, and the day and night change becomes a one-second cross-fade.

## Performance, accessibility and SEO targets

Each target below is a pass or fail check for Phase 8. Test on real phones, not only desktop emulation.

### Performance

| Page | Target | Check with |
| --- | --- | --- |
| Highlights | Lighthouse mobile performance 95 or higher | Lighthouse on the deployed preview |
| Highlights | Largest content visible within 1.5 s on 4G | Lighthouse, throttled |
| Highlights | 30 KB of JavaScript or less, compressed; fully readable with JavaScript off | Build report; browser with scripts disabled |
| Landing | Text, buttons and island still visible within 1.5 s on 4G | Throttled load, filmstrip |
| Landing | 3D island interactive within 4 s on a mid-range phone on 4G | Stopwatch on a real device |
| Lake | All 3D code and data 350 KB or less, compressed | Build report |
| Lake | 50 frames a second or better on a three-year-old mid-range Android; never below 30 | On-screen frame counter in a debug mode |
| Lake | 80 draw calls or fewer; 200,000 triangles or fewer in view | Three.js renderer info in debug mode |

### Accessibility

- All HTML interface meets WCAG 2.2 AA: contrast, visible focus, labels on icon buttons.
- Everything works by keyboard. Panels trap focus while open and return it on close.
- The canvas has a text label and is followed by a "Skip to Highlights" link.
- Every fact in the lake is also on Highlights, so no one needs the 3D to read the content.
- Reduced-motion and no-WebGL fallbacks behave as described under Loading and fallbacks.
- Every image has alt text from the content file.

### SEO and sharing

- Each page has a title, description and canonical address built from `profile`.
- A 1200 by 630 share image made from the wide lake still, with the name and role.
- `Person` structured data with name, role, city and profile links.
- `sitemap.xml` and `robots.txt`.
- The résumé is a real file at `/resume.pdf`.

### Browser support

The current and previous major versions of Safari on iOS, Chrome on Android, and desktop Chrome, Safari, Firefox and Edge.

## Build phases

Ten phases, built in order, each on its own branch with a preview link and the owner's OK before the next. Highlights ships first, so a usable portfolio exists by the end of Phase 1.

| # | Phase | Build | Done when |
| --- | --- | --- | --- |
| 0 | Scaffold | Astro and TypeScript project, repo layout, `tokens.css`, self-hosted fonts, `CLAUDE.md`, `reference/` committed, deploy previews connected | `npm run dev`, `build` and `check` all pass. The preview shows a test page using all three typefaces and the ten colours |
| 1 | Content and Highlights | `types.ts`, `site.ts` filled with the demo copy from the canvas, `check.ts`, the full Highlights page | The page matches the `Highlights` design at 390 px and 1440 px. Setting `enabled: false` removes a section. It reads correctly with JavaScript off. Lighthouse mobile is 95 or higher |
| 2 | Landing, still | Landing page with the island frame as a still image, both buttons, day and night toggle swapping stills | It matches `Main` and `Landing-Desktop`. Both buttons lead to working routes |
| 3 | World, static | Terrain, water, sky, trees, the seven props, lanterns, day and night light sets. A free debug camera at `/lake?debug` | Screenshots from the reference camera positions sit beside the reference frames and match in layout, colour and mood, by day and night. Medium tier holds 50 frames a second on a phone |
| 4 | Hiker and walking | Hiker with walk cycle, trail path, `progress` input from wheel, touch and keys, follow camera, look offset, loop wrap | The full loop can be walked both ways on a phone and a laptop. The camera never passes through terrain or trees. Framing matches the `Lake-Walk` designs |
| 5 | Stops and HUD | Rail, "Next stop" chip, panels for every section kind, tabs, "Keep walking", map, stop addresses, first-visit hint | Every enabled section can be read in the lake. Hiding a section skips its stop and renumbers the rest. A keyboard-only run-through works. The back button closes a panel |
| 6 | Life | Day-to-night sweep, wildlife, prop reactions, always-on motion, sound | Each item in Motion and sound is present. Frame rate targets still hold |
| 7 | The dive | Live 3D island on the landing over the still, drag to spin, the continuous camera dive into the lake | Landing text and buttons appear within 1.5 s on 4G before any 3D loads. The dive plays without a reload or a dropped frame on desktop |
| 8 | Hardening | Quality tiers, no-WebGL and reduced-motion fallbacks, accessibility pass, Highlights motion, every target in the section above | Every row under Performance, accessibility and SEO targets passes on two real phones and three desktop browsers |
| 9 | Launch | Real content in place of placeholders, share image, structured data, domain, optional analytics | `npm run check` finds no `[placeholder]` text. The owner signs off on phone and desktop |

### Working agreements for the build session

- One phase per pull request. Do not start a phase before the previous one is approved.
- Commit the debug tools from Phase 3 (free camera, frame counter, tier switch) behind `?debug`; they are needed again in Phase 8.
- When a design detail is missing, copy the nearest pattern from `reference/screens/` and flag it in the pull request.
- When a target cannot be met, say so with the measured number. Do not quietly lower the quality tier defaults.

## Maintenance recipes

After launch, every routine change is an edit to `src/content/site.ts`, followed by `npm run check` and a push. Each recipe below can be handed to an AI session as written.

| Task | Change | Effect |
| --- | --- | --- |
| Add an app or product | Add an item to the `items` list of the `apps` or `saas` section, and put its icon in `public/media/` | A new row on Highlights and in the panel; a new tent or canoe, up to five |
| Hide an app or product | Set that item's `enabled` to `false` | It disappears everywhere; its tent or canoe is removed |
| Hide a whole section | Set the section's `enabled` to `false` | Gone from Highlights, panel, rail and map. Its stop becomes scenery and the rest renumber |
| Add a section in a new field | Add a section entry with an existing `kind`, for example `roles` for teaching or `projects` for hardware builds | It appears on Highlights at once |
| Show that new section in the lake | Set its `stop` to a stop with one section, or swap it with a section there | The stop's panel gains a second tab, or shows the new section |
| Reorder Highlights | Reorder the entries in `sections` | Highlights follows the file order. The lake order is fixed by the stops |
| Update the résumé | Replace `public/resume.pdf` | Every résumé button serves the new file |
| Add photographs | Add files to `public/media/photos/` and list them, with alt text, in the `gallery` section | They appear in the Point's panel |
| Change the pitch or tagline | Edit `profile.pitch` or `profile.tagline` | Landing, Highlights hero and share text all update |

### Changes that need a developer session

These touch code outside the content file. Ask for them in a design-capable session, with this plan attached.

- A new section `kind` with its own layout.
- An eighth stop, or a different prop at a stop.
- A new colour, typeface or button style.
- A different setting, such as a Toronto waterfront loop. The stops, content file and HUD would carry over; only `src/world/` terrain, props and sky would be rebuilt.

### Example request for an AI editor

```text
Add a new SaaS product to my portfolio.
Name: [Product name]. One line: "[Who it is for, what it does]."
Link: https://example.com. Status: beta. Icon: I added public/media/[file].png.
Follow CLAUDE.md. Only edit src/content/site.ts, then run npm run check.
```
