/**
 * Queue definitions shared by URLs, filters and API calls.
 * `slug` is what appears in URLs (/lol/.../soloDuo/..., /rankings/soloDuo/...).
 * `labelKey` is the i18n key under the "queues" namespace.
 */

export interface MatchQueue {
  slug: string;
  id: string;
  labelKey: string;
}

/** Match history filters (LoL profile). "all" means no queue filter. */
export const MATCH_QUEUES: readonly MatchQueue[] = [
  { slug: "all", id: "all", labelKey: "all" },
  { slug: "soloDuo", id: "420", labelKey: "soloDuo" },
  { slug: "flex", id: "440", labelKey: "flex" },
  { slug: "aram", id: "450", labelKey: "aram" },
  { slug: "normal", id: "400", labelKey: "normal" },
  { slug: "quickplay", id: "490", labelKey: "quickplay" },
  { slug: "arena", id: "1700", labelKey: "arena" },
] as const;

/** Case-insensitive slug -> queue id ("soloduo" and "soloDuo" both work). Unknown -> "all". */
export function queueIdFromSlug(slug: string | null | undefined): string {
  const s = (slug ?? "").toLowerCase();
  return MATCH_QUEUES.find((q) => q.slug.toLowerCase() === s)?.id ?? "all";
}

export function queueSlugFromId(id: string | null | undefined): string {
  return MATCH_QUEUES.find((q) => q.id === id)?.slug ?? "all";
}

/** Ranked leaderboards (rankings page). */
export interface RankedQueue {
  slug: "soloDuo" | "flex";
  apiValue: "RANKED_SOLO_5x5" | "RANKED_FLEX_SR";
  labelKey: string;
}

export const RANKED_QUEUES: readonly RankedQueue[] = [
  { slug: "soloDuo", apiValue: "RANKED_SOLO_5x5", labelKey: "soloDuo" },
  { slug: "flex", apiValue: "RANKED_FLEX_SR", labelKey: "flex" },
] as const;

/** Case-insensitive; unknown slugs fall back to Solo/Duo. */
export function rankedQueueFromSlug(slug: string | null | undefined): RankedQueue {
  const s = (slug ?? "").toLowerCase();
  return RANKED_QUEUES.find((q) => q.slug.toLowerCase() === s) ?? RANKED_QUEUES[0];
}
