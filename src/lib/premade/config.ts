// Every threshold the competitive analysis uses, in one place (prompt §7.2: "centralize os
// critérios técnicos em uma camada de configuração"). Nothing else in the analysis layer may
// hard-code a cut-off: a number that decides whether something is a problem has to be auditable.
//
// Two families of values live here:
//  - STATISTICAL: the confidence machinery (sample floors, interval levels, the yardstick of a
//    change). These are conventions, not opinions, and are documented as such.
//  - DOMAIN: cut-offs that identify a behaviour worth looking at (a gold lead, a radius, a window).
//    Each one carries the reason it is what it is, and any claim built on it is an observation,
//    never a verdict.

/** Two-sided 95%: the level of every interval in the app. */
export const CONFIDENCE_LEVEL = 0.95;
/** z of the normal approximation at `CONFIDENCE_LEVEL` (Wilson intervals). */
export const Z_95 = 1.959963984540054;

/**
 * Sample floors by how a number is used. The names describe the claim being made, so a caller
 * cannot pick a floor by convenience.
 */
export const SAMPLE_FLOORS = {
  /** Below this many games nothing is said at all: the metric is shown with its n and nothing else. */
  verdict: 10,
  /** A single-metric observation (one per-game value compared across windows). */
  observation: 8,
  /** A conditioned comparison: games WITH the condition and games WITHOUT it, each side. */
  condition: 5,
  /** Events behind a per-event rate (objectives taken, deaths). One game holds many: 20 is the floor. */
  events: 20,
  /** Timelines behind a position-based reading (presence, grouping): sampled once a minute. */
  timelines: 10,
  /** A person's own games before their trend is read. */
  personal: 6,
  /** Games with one champion before a champion-specific claim. */
  champion: 3,
} as const;

/**
 * How many standard errors a change has to reach before it is called a change, at
 * `CONFIDENCE_LEVEL`. With no distribution assumption beyond approximate normality for a MEAN,
 * 1.96 is the two-sided 95% z. For small windows the Student t is used instead (see `tCritical`),
 * which is wider: a 5v5 comparison needs about 2.31 errors, not 1.96.
 */
export const CHANGE_Z = Z_95;

/**
 * Above this many degrees of freedom the t distribution is indistinguishable from the normal one
 * for our purposes (t(30) differs from z by 4e-4 at 95%).
 */
export const T_MAX_DF = 30;

/** Gold difference that counts as "ahead" (or behind) at a checkpoint. */
export const LEAD_GOLD = 1_000;
/** Map distance (game units, the Rift is about 15k wide) inside which two champions count as together. */
export const NEARBY_DISTANCE = 4_000;
/** Distance two players must stay inside to count as a pair playing together. */
export const PAIR_RADIUS = 5_000;
/** Radius every player of the group needs at least one ally inside for the group to count as grouped. */
export const GROUPED_RADIUS = 6_000;
/** Group players around an objective for it to count as "with presence". */
export const OBJECTIVE_PRESENCE_PLAYERS = 3;
/** Seconds before an objective that the preparation is read from. */
export const PREPARATION_WINDOW = 60;
/** Seconds after a group kill in which an objective still counts as its conversion. */
export const CONVERSION_WINDOW = 45;
/** Seconds after a death in which an enemy objective counts as its cost. */
export const COSTLY_DEATH_WINDOW = 60;
/** Seconds grouping the kills of one side into one fight. */
export const GROUP_FIGHT_WINDOW = 12;
/** Deaths per objective event (or per game) that makes a "deaths before objectives" pattern. */
export const DEATHS_BEFORE_OBJECTIVE = 0.6;

/**
 * Commitments of the objective timing: the standard spawn times (seconds) and how late is "late".
 * The values are Riot's announced spawns for the current season; they are a reference, not a rule
 * the app enforces, and every timing claim says which reference it used.
 */
export const OBJECTIVE_TIMING = {
  /** First dragon spawns at 5:00; the next one 5 minutes after a dragon is killed. */
  dragonFirstSpawn: 300,
  dragonInterval: 300,
  /** Herald-relative window is not modelled: the herald spawns and respawns on the patch schedule. */
  baronFirstSpawn: 1_200,
  baronInterval: 360,
  /** A first dragon taken this many seconds after the spawn is "late" (walk there, wards, reset). */
  lateGrace: 90,
} as const;

/** Window sizes of the temporal comparisons, in games. */
export const WINDOWS = {
  /** Recent against previous, the default of the evolution page. */
  evolution: 20,
  /** A player's own trend. */
  personal: 10,
  /** How many games back the baseline of a training goal is read from. */
  baseline: 10,
} as const;

/** Rounding used when numbers leave this layer and reach the messages. */
export const DISPLAY_DIGITS = {
  proportion: 1,
  ratio: 2,
  minutes: 1,
  gold: 0,
} as const;
