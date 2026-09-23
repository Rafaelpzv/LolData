/**
 * Pure number helpers. Locale-aware formatting (numbers, dates) goes through next-intl's
 * `useFormatter` / `getFormatter` in components; these helpers only compute values.
 */

/** Win rate in percent (0-100), or null when no games were played. */
export function winRate(wins: number | null | undefined, losses: number | null | undefined): number | null {
  const w = wins ?? 0;
  const l = losses ?? 0;
  const total = w + l;
  return total > 0 ? (w / total) * 100 : null;
}

/** KDA ratio; "Perfect" games (0 deaths) return null so the UI can label them. */
export function kdaRatio(kills: number, deaths: number, assists: number): number | null {
  if (deaths === 0) return null;
  return (kills + assists) / deaths;
}

/** Seconds -> { minutes, seconds } for "32m 05s" style labels. */
export function splitDuration(totalSeconds: number): { minutes: number; seconds: number } {
  const s = Math.max(0, Math.round(totalSeconds));
  return { minutes: Math.floor(s / 60), seconds: s % 60 };
}

/** CS per minute given creep score and game length in seconds. */
export function csPerMinute(cs: number, durationSeconds: number): number | null {
  if (!durationSeconds) return null;
  return cs / (durationSeconds / 60);
}
