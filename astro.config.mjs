// Astro config: static output, fonts downloaded at build time and served from this site.
import { defineConfig, fontProviders } from "astro/config";

export default defineConfig({
  output: "static",
  fonts: [
    {
      name: "Big Shoulders",
      cssVariable: "--font-display",
      provider: fontProviders.google(),
      weights: [800],
      styles: ["normal"],
      fallbacks: ["Impact", "sans-serif"],
    },
    {
      name: "DM Mono",
      cssVariable: "--font-mono",
      provider: fontProviders.google(),
      weights: [400, 500],
      styles: ["normal"],
      fallbacks: ["monospace"],
    },
    {
      name: "Radio Canada",
      cssVariable: "--font-body",
      provider: fontProviders.google(),
      weights: [400, 500, 600],
      styles: ["normal"],
      fallbacks: ["sans-serif"],
    },
  ],
});
