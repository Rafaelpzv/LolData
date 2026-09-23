/**
 * Single source of truth for Riot platform regions.
 * `code` is the platform routing value used by the Riot API and our URLs (uppercase in rankings,
 * lowercase in profile routes: always normalize with `normalizeRegion`).
 */

export type RegionGroup = "americas" | "europe" | "asia" | "sea";

export interface Region {
  code: string;
  /** Short display tag (BR, EUW, LAN...). */
  short: string;
  /** ISO country code for the flag icon (country-flag-icons). EU uses the EU flag. */
  countryCode: string;
  group: RegionGroup;
}

export const REGIONS: readonly Region[] = [
  { code: "BR1", short: "BR", countryCode: "BR", group: "americas" },
  { code: "NA1", short: "NA", countryCode: "US", group: "americas" },
  { code: "LA1", short: "LAN", countryCode: "MX", group: "americas" },
  { code: "LA2", short: "LAS", countryCode: "AR", group: "americas" },
  { code: "EUW1", short: "EUW", countryCode: "EU", group: "europe" },
  { code: "EUN1", short: "EUNE", countryCode: "SE", group: "europe" },
  { code: "TR1", short: "TR", countryCode: "TR", group: "europe" },
  { code: "RU", short: "RU", countryCode: "RU", group: "europe" },
  { code: "ME1", short: "ME", countryCode: "AE", group: "europe" },
  { code: "KR", short: "KR", countryCode: "KR", group: "asia" },
  { code: "JP1", short: "JP", countryCode: "JP", group: "asia" },
  { code: "OC1", short: "OCE", countryCode: "AU", group: "sea" },
  { code: "SG2", short: "SG", countryCode: "SG", group: "sea" },
  { code: "TW2", short: "TW", countryCode: "TW", group: "sea" },
  { code: "VN2", short: "VN", countryCode: "VN", group: "sea" },
] as const;

export const REGION_GROUPS: readonly RegionGroup[] = ["americas", "europe", "asia", "sea"];

export const DEFAULT_REGION = "BR1";

/** Uppercase platform code, falling back to the default region for unknown input. */
export function normalizeRegion(input: string | null | undefined): string {
  const code = (input ?? "").trim().toUpperCase();
  return REGIONS.some((r) => r.code === code) ? code : DEFAULT_REGION;
}

export function getRegion(input: string | null | undefined): Region {
  const code = normalizeRegion(input);
  return REGIONS.find((r) => r.code === code)!;
}

/** "BR1" -> "BR", "EUW1" -> "EUW". */
export function regionShort(input: string | null | undefined): string {
  return getRegion(input).short;
}
