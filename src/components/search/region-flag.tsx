import { AE, AR, AU, BR, EU, JP, KR, MX, RU, SE, SG, TR, TW, US, VN } from "country-flag-icons/react/3x2";
import { cn } from "@/lib/utils";
import { getRegion } from "@/lib/regions";

const FLAGS: Record<string, typeof BR> = { AE, AR, AU, BR, EU, JP, KR, MX, RU, SE, SG, TR, TW, US, VN };

/** SVG flag for a platform region (emoji flags don't render on Windows). Decorative. */
export function RegionFlag({ region, className }: { region: string; className?: string }) {
  const Flag = FLAGS[getRegion(region).countryCode];
  if (!Flag) return null;
  return <Flag aria-hidden className={cn("h-3.5 w-5 shrink-0 rounded-[2px]", className)} />;
}
