"use client";

import { useEffect } from "react";
import { MotionConfig } from "motion/react";
import { TIME_ZONE_COOKIE } from "@/i18n/config";
import { setTimeZone } from "@/i18n/actions";

/**
 * Stores the browser time zone in a cookie so server-rendered dates match the viewer's clock.
 * Applies from the next navigation on; no refresh, so a first visit doesn't refetch the page's Riot data.
 */
function TimeZoneSync() {
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const current = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${TIME_ZONE_COOKIE}=`))
      ?.split("=")[1];
    if (tz && decodeURIComponent(current ?? "") !== tz) setTimeZone(tz);
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <TimeZoneSync />
      {children}
    </MotionConfig>
  );
}
