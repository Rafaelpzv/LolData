/**
 * Asset URL builders for Riot CDNs (CommunityDragon + Data Dragon).
 * Every image URL in the UI must come from here.
 */

const CDRAGON_GAME_DATA =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1";
const CDRAGON_STATIC =
  "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images";
const DDRAGON = "https://ddragon.leagueoflegends.com";

export function profileIconUrl(profileIconId: number | string | null | undefined): string | null {
  if (profileIconId === null || profileIconId === undefined || profileIconId === "") return null;
  return `${CDRAGON_GAME_DATA}/profile-icons/${profileIconId}.jpg`;
}

export function championIconUrl(championId: number | string | null | undefined): string | null {
  if (championId === null || championId === undefined || championId === "") return null;
  return `${CDRAGON_GAME_DATA}/champion-icons/${championId}.png`;
}

/**
 * Ranked mini crest. Accepts a tier ("GOLD", "Challenger") or a full elo string ("Diamond II").
 * Returns null for unranked / empty input.
 */
export function rankedCrestUrl(tierOrElo: string | null | undefined): string | null {
  const tier = (tierOrElo ?? "").trim().split(/\s+/)[0]?.toLowerCase();
  if (!tier || tier === "unranked") return null;
  return `${CDRAGON_STATIC}/ranked-mini-crests/${tier}.svg`;
}

export function itemIconUrl(version: string | null, itemId: number | null | undefined): string | null {
  if (!version || !itemId) return null;
  return `${DDRAGON}/cdn/${version}/img/item/${itemId}.png`;
}

export function spellIconUrl(version: string | null, imageFull: string | null | undefined): string | null {
  if (!version || !imageFull) return null;
  return `${DDRAGON}/cdn/${version}/img/spell/${imageFull}`;
}

/** Rune / rune-style icon path from runesReforged.json (`icon` field). */
export function runeIconUrl(iconPath: string | null | undefined): string | null {
  if (!iconPath) return null;
  return `${DDRAGON}/cdn/img/${iconPath}`;
}

export function tftUnitIconUrl(version: string | null, characterId: string | null | undefined): string | null {
  if (!version || !characterId) return null;
  return `${DDRAGON}/cdn/${version}/img/tft-champion/${characterId}.png`;
}

export function ddragonDataUrl(version: string, file: string, locale = "en_US"): string {
  return `${DDRAGON}/cdn/${version}/data/${locale}/${file}`;
}

let versionPromise: Promise<string | null> | null = null;

/** Latest Data Dragon version, fetched once per page session. */
export function getDdragonVersion(): Promise<string | null> {
  if (!versionPromise) {
    versionPromise = fetch(`${DDRAGON}/api/versions.json`)
      .then((res) => (res.ok ? res.json() : []))
      .then((versions: string[]) => versions[0] ?? null)
      .catch(() => {
        versionPromise = null;
        return null;
      });
  }
  return versionPromise;
}
