/** Ranked tiers, lowest to highest. */
export const TIERS = [
  "iron",
  "bronze",
  "silver",
  "gold",
  "platinum",
  "emerald",
  "diamond",
  "master",
  "grandmaster",
  "challenger",
] as const;

export type Tier = (typeof TIERS)[number];

/** "CHALLENGER", "Challenger", "Diamond II" -> "challenger" / "diamond". Null when unranked. */
export function toTier(input: string | null | undefined): Tier | null {
  const key = (input ?? "").trim().split(/\s+/)[0]?.toLowerCase() as Tier;
  return TIERS.includes(key) ? key : null;
}

/** Apex tiers have no divisions (no "I"). */
export function isApexTier(tier: Tier | null): boolean {
  return tier === "master" || tier === "grandmaster" || tier === "challenger";
}

// Full class strings so Tailwind can see them.
const TIER_TEXT: Record<Tier, string> = {
  iron: "text-tier-iron",
  bronze: "text-tier-bronze",
  silver: "text-tier-silver",
  gold: "text-tier-gold",
  platinum: "text-tier-platinum",
  emerald: "text-tier-emerald",
  diamond: "text-tier-diamond",
  master: "text-tier-master",
  grandmaster: "text-tier-grandmaster",
  challenger: "text-tier-challenger",
};

export function tierTextClass(input: string | null | undefined): string {
  const tier = toTier(input);
  return tier ? TIER_TEXT[tier] : "text-muted-foreground";
}

export interface ApexCutoffs {
  challenger?: { cutoffLP: number } | null;
  grandmaster?: { cutoffLP: number } | null;
}

/**
 * Apex tier of a leaderboard entry. Uses LP cutoffs when the API provides them,
 * otherwise falls back to the leaderboard position (Riot's default seat counts).
 */
export function apexTierFor(
  leaguePoints: number,
  position: number,
  cutoffs?: ApexCutoffs | null,
  challengerSeats = 200,
): Tier {
  if (cutoffs?.challenger && cutoffs?.grandmaster) {
    if (leaguePoints >= cutoffs.challenger.cutoffLP) return "challenger";
    if (leaguePoints >= cutoffs.grandmaster.cutoffLP) return "grandmaster";
    return "master";
  }
  if (position <= challengerSeats) return "challenger";
  if (position <= challengerSeats + 700) return "grandmaster";
  return "master";
}
