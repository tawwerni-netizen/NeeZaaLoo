import type { MetadataRoute } from "next";
import { EDITORIAL_ARTICLES_MAP } from "@/lib/editorial/articles-map";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://nizalo.com";
const LOCALES = ["en", "zh", "hi", "es", "ar", "fr"] as const;

const STATIC_ROUTES = [
  { path: "", changeFreq: "daily", priority: 1.0 },
  { path: "/games", changeFreq: "daily", priority: 0.95 },
  { path: "/tournaments", changeFreq: "daily", priority: 0.9 },
  { path: "/rank", changeFreq: "daily", priority: 0.85 },
  { path: "/learn", changeFreq: "weekly", priority: 0.9 },
  { path: "/help", changeFreq: "monthly", priority: 0.8 },
  { path: "/fair-play", changeFreq: "monthly", priority: 0.8 },
] as const;

const GAME_SLUGS = [
  "chess",
  "checkers",
  "dominoes",
  "backgammon",
  "seega",
  "connect-four",
  "xo",
  "speed-math",
  "reversi",
  "gomoku",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  // 1. Static Routes across all locales
  for (const route of STATIC_ROUTES) {
    for (const locale of LOCALES) {
      const alternates: Record<string, string> = {
        "x-default": `${BASE_URL}/en${route.path}`,
      };
      for (const l of LOCALES) {
        alternates[l] = `${BASE_URL}/${l}${route.path}`;
      }

      entries.push({
        url: `${BASE_URL}/${locale}${route.path}`,
        lastModified: now,
        changeFrequency: route.changeFreq as any,
        priority: route.priority,
        alternates: {
          languages: alternates,
        },
      });
    }
  }

  // 2. Game Hub Pages across all locales
  for (const gameSlug of GAME_SLUGS) {
    for (const locale of LOCALES) {
      const alternates: Record<string, string> = {
        "x-default": `${BASE_URL}/en/games/${gameSlug}`,
      };
      for (const l of LOCALES) {
        alternates[l] = `${BASE_URL}/${l}/games/${gameSlug}`;
      }

      entries.push({
        url: `${BASE_URL}/${locale}/games/${gameSlug}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.9,
        alternates: {
          languages: alternates,
        },
      });
    }
  }

  // 3. 100 Editorial Articles across all locales
  for (const article of EDITORIAL_ARTICLES_MAP) {
    for (const locale of LOCALES) {
      const alternates: Record<string, string> = {
        "x-default": `${BASE_URL}/en/learn/${article.slug}`,
      };
      for (const l of LOCALES) {
        alternates[l] = `${BASE_URL}/${l}/learn/${article.slug}`;
      }

      entries.push({
        url: `${BASE_URL}/${locale}/learn/${article.slug}`,
        lastModified: now,
        changeFrequency: article.type === "PILLAR" ? "weekly" : "monthly",
        priority: article.type === "PILLAR" ? 0.85 : 0.75,
        alternates: {
          languages: alternates,
        },
      });
    }
  }

  return entries;
}
