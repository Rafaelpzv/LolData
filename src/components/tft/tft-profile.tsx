import { useTranslations } from "next-intl";
import { ProfileHeader } from "@/components/profile/profile-header";
import { RankedSummary } from "@/components/profile/ranked-summary";

export interface TftRankEntry {
  queueType?: string;
  tier?: string;
  rank?: string;
  leaguePoints?: number;
  wins?: number;
  losses?: number;
  hotStreak?: boolean;
}

interface TftProfileProps {
  gameName: string;
  tagLine: string;
  level: number | null | undefined;
  profileIconId: number | null | undefined;
  region: string;
  /** RANKED_TFT entry, or null when the player has no ranked games. */
  ranked: TftRankEntry | null;
}

/** Identity + Ranked TFT standing. */
export function TftProfile({ gameName, tagLine, level, profileIconId, region, ranked }: TftProfileProps) {
  const t = useTranslations("tft");

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
      <ProfileHeader
        gameName={gameName}
        tagLine={tagLine}
        level={level}
        profileIconId={profileIconId}
        region={region}
      />
      <RankedSummary
        queueLabel={t("rankedTft")}
        tier={ranked?.tier}
        division={ranked?.rank}
        leaguePoints={ranked?.leaguePoints}
        wins={ranked?.wins}
        losses={ranked?.losses}
        hotStreak={ranked?.hotStreak}
        className="md:w-80 md:shrink-0"
      />
    </div>
  );
}
