/**
 * Display helpers for tft-match-v1 identifiers. The match payload only carries API ids
 * ("TFT15_BattleAcademia", "TFT_Augment_BranchingOut"), so names are derived from them.
 */

/** "TFT15_Augment_BattleAcademiaCrest" -> "Battle Academia Crest", "TFT15_JarvanIV" -> "Jarvan IV", "PatienceIsAVirtue" -> "Patience Is A Virtue". */
export function tftDisplayName(apiName: string | null | undefined): string {
  if (!apiName) return "";
  return apiName
    .replace(/^(TFT|Set)\d*_/i, "")
    .replace(/^Augment_/i, "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .trim();
}

export type TftQueueKey = "ranked" | "normal" | "hyperRoll" | "doubleUp" | "other";

const QUEUE_BY_ID: Record<number, TftQueueKey> = {
  1090: "normal",
  1100: "ranked",
  1130: "hyperRoll",
  1150: "doubleUp",
  1160: "doubleUp",
};

export function tftQueueKey(queueId: number | undefined, gameType: string | undefined): TftQueueKey {
  if (queueId != null && QUEUE_BY_ID[queueId]) return QUEUE_BY_ID[queueId];
  if (gameType === "pairs") return "doubleUp";
  if (gameType === "turbo") return "hyperRoll";
  return "other";
}

export type PlacementVariant = "first" | "top4" | "bottom";

export function placementVariant(placement: number): PlacementVariant {
  if (placement === 1) return "first";
  return placement <= 4 ? "top4" : "bottom";
}
