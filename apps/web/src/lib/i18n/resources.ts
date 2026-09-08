/**
 * The six locale resource files, statically imported.
 *
 * This is deliberately a plain bundler-native JSON import, not
 * `@nizalo/i18n`'s own `loadResources()` (packages/i18n/src/resources.mjs) --
 * that helper reads files with Node's `fs`, which does not exist in the
 * Edge middleware runtime or in a browser bundle. A static JSON import
 * works in a Server Component, a Client Component and `middleware.ts`
 * alike, so it is the one safe way for this app to reach the same
 * translation content.
 */
import en from "../../../../../packages/i18n/locales/en.json";
import zh from "../../../../../packages/i18n/locales/zh.json";
import hi from "../../../../../packages/i18n/locales/hi.json";
import es from "../../../../../packages/i18n/locales/es.json";
import ar from "../../../../../packages/i18n/locales/ar.json";
import fr from "../../../../../packages/i18n/locales/fr.json";
import type { SupportedLocale } from "./locale";

export const RESOURCES: Record<SupportedLocale, unknown> = { en, zh, hi, es, ar, fr };
