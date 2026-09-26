import { useTranslations } from "next-intl";
import { ProfileHeader } from "@/components/profile/profile-header";
import { RankedSummary } from "@/components/profile/ranked-summary";
import { Reveal } from "@/components/motion/reveal";

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
  /** Ranked area, rendered on the right (streams in on its own; see TftRankedCard). */
  children?: React.ReactNode;
}

/** Identity + Ranked TFT standing. */
export function TftProfile({ gameName, tagLine, level, profileIconId, region, children }: TftProfileProps) {
  return (
    <Reveal className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
      <ProfileHeader
        gameName={gameName}
        tagLine={tagLine}
        level={level}
        profileIconId={profileIconId}
        region={region}
      />
      <div className="md:w-80 md:shrink-0">{children}</div>
    </Reveal>
  );
}

/** Ranked TFT standing; `ranked` is the RANKED_TFT entry or null when unranked. */
export function TftRankedCard({ ranked }: { ranked: TftRankEntry | null }) {
  const t = useTranslations("tft");
  return (
    <RankedSummary
      queueLabel={t("rankedTft")}
      tier={ranked?.tier}
      division={ranked?.rank}
      leaguePoints={ranked?.leaguePoints}
      wins={ranked?.wins}
      losses={ranked?.losses}
      hotStreak={ranked?.hotStreak}
    />
  );
}
