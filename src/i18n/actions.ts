"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, TIME_ZONE_COOKIE, isLocale } from "./config";

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });
}

export async function setTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    return;
  }
  (await cookies()).set(TIME_ZONE_COOKIE, timeZone, { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });
}
