import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  DEFAULT_TIME_ZONE,
  LOCALE_COOKIE,
  NAMESPACES,
  TIME_ZONE_COOKIE,
  isLocale,
  negotiateLocale,
} from "./config";

function validTimeZone(value: string | undefined): string | null {
  if (!value) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

// Locale lives in a cookie (no URL prefix): cookie > Accept-Language > default.
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale)
    ? cookieLocale
    : negotiateLocale((await headers()).get("accept-language"));

  const timeZone = validTimeZone(cookieStore.get(TIME_ZONE_COOKIE)?.value) ?? DEFAULT_TIME_ZONE;

  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => [ns, (await import(`../../messages/${locale}/${ns}.json`)).default] as const),
  );

  return {
    locale,
    timeZone,
    messages: Object.fromEntries(entries),
  };
});
