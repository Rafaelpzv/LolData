import { useTranslations } from "next-intl";
import { profileIconUrl } from "@/lib/cdn";
import { getRegion } from "@/lib/regions";
import { IconFrame } from "@/components/ui/icon-frame";
import { RegionFlag } from "@/components/search/region-flag";

interface ProfileHeaderProps {
  gameName: string;
  tagLine: string;
  level: number | null | undefined;
  profileIconId: number | null | undefined;
  region: string;
  /** Extra content under the name (badges, last update). */
  children?: React.ReactNode;
}

/** Identity block shared by the LoL and TFT profiles: icon, level, Riot ID, region. */
export function ProfileHeader({ gameName, tagLine, level, profileIconId, region, children }: ProfileHeaderProps) {
  const t = useTranslations("profile");
  const tRegions = useTranslations("regions");
  const r = getRegion(region);

  return (
    <div className="flex items-center gap-4 sm:gap-6">
      <IconFrame
        src={profileIconUrl(profileIconId)}
        alt={t("profileIconAlt", { name: gameName })}
        size="xl"
        shape="circle"
        priority
        className="border-2 border-border-strong"
        badge={
          level != null && (
            <span className="num rounded-full border border-border-strong bg-background px-2 py-0.5 text-2xs font-medium text-foreground">
              {level}
            </span>
          )
        }
      />
      <div className="min-w-0 space-y-2">
        <h1 className="break-words text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {gameName}
          <span className="font-normal text-muted-foreground">#{tagLine}</span>
        </h1>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <RegionFlag region={r.code} />
          {tRegions(r.code as "BR1")}
        </p>
        {children}
      </div>
    </div>
  );
}
