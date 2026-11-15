// robots.txt: every page may be crawled; points crawlers at the sitemap.
import type { APIRoute } from "astro";
import { site } from "../content/site.ts";

export const GET: APIRoute = () =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${site.profile.site}/sitemap.xml\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
