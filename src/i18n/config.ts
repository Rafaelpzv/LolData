export const LOCALES = ["en", "pt-BR"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const TIME_ZONE_COOKIE = "NEXT_TZ";
export const DEFAULT_TIME_ZONE = "UTC";

/**
 * Message namespaces. Each lives in messages/<locale>/<namespace>.json so features can be
 * translated independently. Add the file for every locale when adding a namespace here.
 */
export const NAMESPACES = [
  "common",
  "nav",
  "search",
  "regions",
  "queues",
  "tiers",
  "home",
  "rankings",
  "profile",
  "matches",
  "tft",
  "errors",
  "footer",
] as const;

export function isLocale(value: string | null | undefined): value is Locale {
  return LOCALES.includes(value as Locale);
}

/** Picks the best supported locale from an Accept-Language header. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    if (tag.startsWith("pt")) return "pt-BR";
    if (tag.startsWith("en")) return "en";
  }
  return DEFAULT_LOCALE;
}
