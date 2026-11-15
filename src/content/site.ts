// src/content/site.ts
// Everything a visitor can read lives in this file.
// Edit text here. Never put copy inside page or 3D code.
// Text in [square brackets] is a placeholder: `npm run check` lists them all.

import type { SiteContent } from "./types.ts";

export const site = {
  profile: {
    name: "[Your Name]",
    role: "Data engineer, heading for AI",
    city: "Toronto, Canada",
    tagline: "I never climbed a ladder. I walked the whole shoreline.",
    pitch:
      "I build the pipelines that feed models, then ship the product on top. Data engineer by day, solo founder of iOS apps and SaaS products by night, now looking for an AI engineering role.",
    resume: "/resume.pdf", // file lives in /public
    email: "[you@email.com]",
    site: "https://[your-domain]", // the site's address, no slash at the end
    links: {
      linkedin: "https://www.linkedin.com/in/[your-handle]",
      github: "https://github.com/shirolepranav",
      x: "https://x.com/[your-handle]",
      instagram: "https://www.instagram.com/[your-handle]",
    },
    facts: [
      { label: "Now", value: "Data Engineer, [Company]" },
      { label: "Looking for", value: "AI engineering roles" },
      { label: "Based in", value: "Toronto, Canada" },
      { label: "Education", value: ["Master's, Industrial Engineering", "Bachelor's, Mechanical Engineering"] },
    ],
  },

  // Names of the seven lake stops, in walking order.
  stops: {
    trailhead: "Trailhead",
    cabin: "The Cabin",
    lookout: "The Lookout",
    camp: "The Camp",
    dock: "The Dock",
    point: "The Point",
    campfire: "The Campfire",
  },
  // Short names for the desktop rail, where seven names share one bar.
  stopsShort: {
    trailhead: "Trailhead",
    cabin: "Cabin",
    lookout: "Lookout",
    camp: "Camp",
    dock: "Dock",
    point: "Point",
    campfire: "Campfire",
  },

  // One entry per section.
  // The order here is the order on the Highlights page.
  sections: [
    {
      id: "about",
      enabled: true,
      stop: "trailhead",
      kind: "text",
      label: "About",
      title: "The short version",
      intro: "Where the trail starts, and how I got here.",
      body: [
        "I trained as a mechanical engineer, took a master's in industrial engineering, and taught myself to code along the way. Since then I have worked across web development, software engineering, UI/UX design and data analytics, and I now build data platforms as a data engineer.",
        "On my own time I design, build and launch iOS apps and SaaS products solo, most of them with AI in the loop. That mix is why I am aiming at AI engineering: I know how data gets to a model, and how a model gets to a user.",
      ],
      path: [
        { label: "Mechanical engineering", note: "Bachelor's" },
        { label: "Industrial engineering", note: "Master's" },
        { label: "Web and software development", note: "Self-taught" },
        { label: "UI/UX design", note: "[Where]" },
        { label: "Data analytics", note: "[Where]" },
        { label: "Data engineering", note: "Plus apps and SaaS, solo", marker: "now" },
        { label: "AI engineering", note: "Could be with you", marker: "next" },
      ],
    },
    {
      id: "skills",
      enabled: true,
      stop: "lookout",
      kind: "tags",
      label: "Skills",
      title: "What I work with",
      intro: "The view from up here: what I reach for, and where I am heading.",
      groups: [
        { name: "AI", focus: true, tags: ["LLM apps", "RAG", "Agents", "Evals", "Vector search", "Fine-tuning"] },
        { name: "Data engineering", tags: ["Python", "SQL", "Spark", "Airflow", "dbt", "[Warehouse]", "[Cloud]"] },
        { name: "Software and web", tags: ["TypeScript", "React", "Swift", "APIs", "Three.js", "[Backend]"] },
        { name: "Design", tags: ["UI/UX", "Prototyping", "Design systems", "[Tool]"] },
        { name: "Hardware", tags: ["CAD", "3D printing", "Microcontrollers"] },
      ],
    },
    {
      id: "work",
      enabled: true,
      stop: "cabin",
      kind: "roles",
      label: "Work",
      title: "Where I have worked",
      intro: "The day jobs, newest first.",
      items: [
        {
          title: "Data Engineer",
          employer: "[Company]",
          city: "[City]",
          start: "[20XX]",
          end: "Now",
          results: [
            "Design and run the pipelines behind [PRODUCT OR TEAM], moving [VOLUME] a day.",
            "Cut [COST OR LATENCY] by [METRIC] by [what you changed].",
          ],
        },
        {
          title: "Data Analyst",
          employer: "[Company]",
          city: "[City]",
          start: "[20XX]",
          end: "[20XX]",
          results: [
            "Turned [DATA SOURCE] into the dashboards [TEAM] used to decide [WHAT].",
            "[One result with a number in it.]",
          ],
        },
        {
          title: "Web Developer and UI/UX Designer",
          employer: "[Company]",
          city: "[City]",
          start: "[20XX]",
          end: "[20XX]",
          results: [
            "Designed and shipped [PRODUCT] end to end, from first sketch to production.",
            "[One result with a number in it.]",
          ],
        },
      ],
    },
    {
      id: "apps",
      enabled: true,
      stop: "camp",
      kind: "projects",
      label: "iOS apps",
      short: "Apps",
      title: "Apps I have shipped",
      intro: "One tent per app. Each one designed, built and launched solo.",
      itemType: "iOS app",
      items: [
        { name: "App One", line: "[One line: who it is for, what it does]", url: "", icon: "", status: "live", enabled: true },
        { name: "App Two", line: "[One line: who it is for, what it does]", url: "", icon: "", status: "live", enabled: true },
      ],
    },
    {
      id: "saas",
      enabled: true,
      stop: "dock",
      kind: "projects",
      label: "SaaS products",
      short: "SaaS",
      title: "Products I run",
      intro: "One canoe per product. Each one designed, built and launched solo.",
      itemType: "SaaS",
      items: [
        { name: "Product One", line: "[One line: who it is for, what it does]", url: "", icon: "", status: "live", enabled: true },
        { name: "Product Two", line: "[One line: who it is for, what it does]", url: "", icon: "", status: "live", enabled: true },
        { name: "Product Three", line: "[One line: who it is for, what it does]", url: "", icon: "", status: "beta", enabled: true },
      ],
    },
    {
      id: "ai",
      enabled: true,
      stop: "lookout",
      kind: "projects",
      label: "AI builds",
      short: "AI",
      title: "Things I am building with AI",
      intro: "Experiments with models in the loop.",
      itemType: "AI build",
      items: [
        { name: "Experiment One", line: "[One line: what the model does, and for whom]", url: "", icon: "", status: "in progress", enabled: true },
      ],
    },
    {
      id: "photography",
      enabled: true,
      stop: "point",
      kind: "gallery",
      label: "Photography",
      short: "Photos",
      title: "Off the clock",
      intro: "Trails, cities and food, seen through a lens.",
      line: "On a trail with a camera, in a new city working through the menu, or at the workbench with a soldering iron.",
      photos: [],
    },
    {
      id: "contact",
      enabled: true,
      stop: "campfire",
      kind: "contact",
      label: "Contact",
      title: "Contact",
      intro: "Pull up a log. The fire is warm.",
      headline: "Hiring for AI engineering? Let's talk.",
    },
  ],

  // Small interface words. Change wording here, not in components.
  ui: {
    // Landing
    portfolioMark: "Portfolio · 2026",
    landingWalk: "Walk the lake",
    landingWalkSub: "3D world · {stops} stops · scroll to hike", // {stops} = number of stops shown
    landingHighlights: "Just the highlights",
    landingHighlightsSub: "One page · made for recruiters",
    landingNote: "Best with sound. On a slow connection, Highlights loads instantly.",
    dayOrNight: "Day or night",
    dayMode: "Day mode",
    nightMode: "Night mode",
    landingStillAlt: "A low-poly floating island: a turquoise lake ringed by snowy peaks, with a waterfall spilling off the edge",
    landingStillNightAlt:
      "The same floating island at night under a starry sky, with lanterns and tents glowing around the lake",

    // Lake
    lakeCanvas: "A 3D mountain lake: a loop trail runs around a turquoise lake ringed by snowy peaks",
    lakeStillAlt: "A low-poly hiker walks the sandy shore of a turquoise lake toward a fire lookout tower, under snowy peaks",
    skipToHighlights: "Skip to Highlights",
    // When the 3D can't run: no WebGL, or the browser took the 3D context away (lost).
    fallbackTitle: "The lake needs 3D",
    fallbackLostTitle: "The lake stopped drawing",
    fallbackLine: "This browser can't draw the 3D lake right now. Everything in it is on one page.",
    tryAgain: "Try again",
    highlights: "Highlights",
    switchToDay: "Switch to day",
    switchToNight: "Switch to night",
    openMap: "Open the lake map",
    closeMap: "Close the map",
    railBetween: "Progress around the lake: between stop {a} and stop {b} of {count}", // {a}, {b}, {count} are numbers
    railAt: "Progress around the lake: at stop {a} of {count}",
    stopOf: "Stop {a} of {count}",
    nextStop: "Next stop",
    scroll: "Scroll",
    hintPhone: "Swipe up to hike",
    hintDesktop: "Scroll or hold W to hike",
    keyHike: "Hike",
    keyLook: "Look",
    keyOpen: "Open a stop",
    keyScroll: "Or just scroll",
    keyClose: "Close",
    keyChange: "Previous / next stop",
    keyEsc: "Esc",
    keyMap: "Map",
    sound: "Sound", // the desktop sound button; its pressed state says whether sound is on
    closeAndWalk: "Close and keep walking",
    keepWalking: "Keep walking",
    backTo: "Back to stop {a}, {name}", // {a} = number, {name} = stop name
    sectionsAt: "Sections at this stop",
    map: "Map",
    mapTitle: "The Lake Loop",
    mapHint: "Tap a stop to jump there",
    mapCount: "{count} stops",
    mapAt: "You are at {a}",
    mapNear: "Last stop {a}",
    mapStops: "Stops around the lake",
    here: "Here",
    onePage: "One page",
    email: "Email",
    noPhotos: "Photos are on the way.",

    // Highlights
    tour: "3D tour",
    resume: "Résumé",
    downloadResume: "Download résumé",
    getInTouch: "Get in touch",
    walkThisLake: "Walk this lake in 3D",
    walkTheLake: "Walk the lake in 3D",
    walkFooter: "Got five minutes? Walk the lake",
    backToStart: "Back to the start",
    pathSoFar: "The path so far",
    now: "Now",
    next: "Next",
    sideProjects: "Side projects",
    sideProjectsTitle: "Built and launched solo",
    offTheClock: "Off the clock",
    photosOnInstagram: "Photos on Instagram",
    focus: "The focus",
    noIcon: "Icon",
    linkedin: "LinkedIn",
    github: "GitHub",
    x: "X",
    instagram: "Instagram",
    shareImageAlt: "{name}, {role}, over a low-poly mountain lake ringed by snowy peaks", // the link preview picture; {name} and {role} come from profile
    heroStillAlt:
      "A low-poly hiker stands on the shore of a turquoise lake ringed by snowy peaks, a fire lookout tower on the far bank",
  },
} satisfies SiteContent;
