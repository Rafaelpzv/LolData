"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MotionConfig } from "motion/react";
import { TIME_ZONE_COOKIE } from "@/i18n/config";
import { setTimeZone } from "@/i18n/actions";

/** Stores the browser time zone in a cookie so server-rendered dates match the viewer's clock. */
function TimeZoneSync() {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const current = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${TIME_ZONE_COOKIE}=`))
      ?.split("=")[1];
    if (tz && decodeURIComponent(current ?? "") !== tz) {
      setTimeZone(tz).then(() => router.refresh());
    }
  }, [router]);
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
