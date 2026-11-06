"use client";

import { useId, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

import { Collapse } from "@/components/motion/collapse";
import { Card } from "@/components/ui/card";
import { IconFrame } from "@/components/ui/icon-frame";
import { Stat } from "@/components/ui/stat";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  itemIcon,
  useDdragon,
  type DdragonData,
} from "@/components/lol/use-ddragon";
import { championIconUrl } from "@/lib/cdn";
import { championName } from "@/lib/champions";
import { cn } from "@/lib/utils";
import { fromFraction, fromPercent } from "./format";
import {
  PING_KINDS,
  SMALL_DERIVED_SAMPLE,
  type ChampionDetail,
  type DeathPhase,
  type DeathRegion,
  type PingKind,
  type PlayerDepth,
} from "@/lib/premade/individual-metrics";

// Percentages come from `./format`: the module names the unit, so a value already in 0..100 is
// never multiplied by 100 again (`fromPercent`), and a 0..1 ratio always is (`fromFraction`).
const num = (value: number | null, digits = 1) =>
  value === null ? "\u2014" : value.toFixed(digits);
// Thousands are grouped by hand: `toLocaleString()` reads the environment, and the server and the
// browser would print different separators for the same number.
const int = (value: number | null) =>
  value === null
    ? "\u2014"
    : String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const signed = (value: number | null, digits = 0) =>
  value === null ? "\u2014" : `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
const mmss = (seconds: number | null) =>
  seconds === null
    ? "\u2014"
    : `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
const rate = (wins: number, games: number) =>
  games === 0 ? "\u2014" : fromPercent((wins / games) * 100, 1);
/** A value that already comes in percent (0..100) from `individual-metrics`. */
const share = (value: number | null) => fromPercent(value, 1);
/** A 0..1 ratio: `summary.killParticipation` is the only one left in this shape. */
const fraction = (value: number | null) => fromFraction(value, 1);

/** Separators, written as escapes so no editor mangles them. */
const DOT = "\u00b7";
const DASH = "\u2013";

const PHASES: DeathPhase[] = ["early", "mid", "late"];
const REGIONS: DeathRegion[] = ["top", "mid", "bot", "jungle", "river", "base"];
const SKILL_NAMES = ["Q", "W", "E", "R"];

/** One collapsible section: a real button, keyboard reachable, animated with the shared Collapse. */
function Section({
  title,
  hint,
  children,
  defaultOpen = false,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <Card padding="lg">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center justify-between gap-3 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {hint && (
            <span className="truncate text-xs text-muted-foreground">
              {hint}
            </span>
          )}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-fast",
            open && "rotate-180",
          )}
        />
      </button>
      <Collapse open={open} id={id}>
        <div className="pt-4">{children}</div>
      </Collapse>
    </Card>
  );
}

function NoData({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

/** Small label/value list, the shape the collective panel already uses. */
function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <ul className="num space-y-1.5 text-sm">
      {rows.map(([label, value]) => (
        <li key={label} className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{label}</span>
          <span className="text-foreground">{value}</span>
        </li>
      ))}
    </ul>
  );
}

/** One rune or spell: its icon and its name, the id only when Data Dragon has not answered yet. */
function NamedIconItem({
  name,
  icon,
  fallbackId,
}: {
  name?: string;
  icon: string | null;
  fallbackId?: number;
}) {
  return (
    <span className="flex items-center gap-2">
      <IconFrame src={icon} alt="" size="xs" shape="rounded" />
      <span className="text-foreground">
        {name ?? (fallbackId === undefined ? "\u2014" : String(fallbackId))}
      </span>
    </span>
  );
}

/** Name of an item from Data Dragon; the id itself only until the catalogue arrives. */
function itemName(data: DdragonData, itemId: number): string {
  return data.items.get(itemId) ?? String(itemId);
}

/** One build entry: the item icon and its name, never the bare id. */
function ItemName({ data, itemId }: { data: DdragonData; itemId: number }) {
  return (
    <span className="flex items-center gap-1">
      <IconFrame
        src={itemIcon(data, itemId)}
        alt=""
        size="xs"
        shape="rounded"
      />
      <span className="text-foreground">{itemName(data, itemId)}</span>
    </span>
  );
}

/** Every pick of the person, with games, record and the per-minute numbers. */
function ChampionTable({ champions }: { champions: ChampionDetail[] }) {
  const t = useTranslations("premade.individual");
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("champion")}</TableHead>
          <TableHead numeric>{t("games")}</TableHead>
          <TableHead numeric>{t("winRate")}</TableHead>
          <TableHead numeric>{t("kda")}</TableHead>
          <TableHead numeric className="hidden sm:table-cell">
            {t("csPerMin")}
          </TableHead>
          <TableHead numeric className="hidden sm:table-cell">
            {t("damagePerMin")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {champions.map((champion) => (
          <TableRow key={champion.championId}>
            <TableCell>
              <span className="flex items-center gap-2">
                <IconFrame
                  src={championIconUrl(champion.championId)}
                  alt={
                    championName(champion.championId) ?? champion.championName
                  }
                  size="xs"
                  shape="rounded"
                />
                <span className="font-medium text-foreground">
                  {championName(champion.championId) ?? champion.championName}
                </span>
                {champion.lowConfidence && (
                  <span className="text-2xs text-warning">
                    {t("lowConfidence")}
                  </span>
                )}
              </span>
            </TableCell>
            <TableCell numeric>{champion.games}</TableCell>
            <TableCell numeric>{rate(champion.wins, champion.games)}</TableCell>
            <TableCell numeric>{num(champion.kda, 2)}</TableCell>
            <TableCell numeric className="hidden sm:table-cell">
              {num(champion.csPerMin)}
            </TableCell>
            <TableCell numeric className="hidden sm:table-cell">
              {int(champion.damagePerMin)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** The seven depth sections of one person, every one with its sample. */
export function PlayerSections({
  depth,
  names,
}: {
  depth: PlayerDepth;
  names: Map<string, string>;
}) {
  const t = useTranslations("premade.individual");
  const tPings = useTranslations("premade.pings");
  const tPhases = useTranslations("premade.individual.phases");
  const tRegions = useTranslations("premade.individual.regions");
  const summary = depth.summary;
  const caveat = t("lowConfidence");
  const pairs =
    depth.synergy.best.length > 0 ? depth.synergy.best : depth.synergy.worst;

  return (
    <div className="space-y-3">
      <Section
        title={t("summaryTitle")}
        hint={t("gamesCount", { games: summary.games })}
        defaultOpen
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat
            label={t("winRate")}
            value={share(summary.winRate)}
            hint={t("winsOfGames", {
              wins: summary.wins,
              games: summary.games,
            })}
          />
          <Stat label={t("kda")} value={num(summary.kda, 2)} />
          <Stat
            label={t("killParticipation")}
            value={fraction(summary.killParticipation)}
          />
          <Stat label={t("damagePerMin")} value={int(summary.damagePerMin)} />
          <Stat label={t("goldPerMin")} value={int(summary.goldPerMin)} />
          <Stat label={t("csPerMin")} value={num(summary.csPerMin, 1)} />
          <Stat
            label={t("visionPerMin")}
            value={num(summary.visionPerMin, 2)}
          />
          <Stat label={t("deathsPerGame")} value={num(summary.deathsPerGame)} />
          <Stat label={t("deadTime")} value={share(summary.deadTimeShare)} />
        </div>
      </Section>

      <Section
        title={t("championsTitle")}
        hint={t("gamesCount", {
          games: depth.champions.reduce(
            (sum, champion) => sum + champion.games,
            0,
          ),
        })}
      >
        {depth.champions.length === 0 ? (
          <NoData text={t("noData")} />
        ) : (
          <ChampionTable champions={depth.champions} />
        )}
      </Section>

      <Section
        title={t("pingsTitle")}
        hint={`${t("totalPings")} ${num(depth.pings.total)} ${DOT} ${tPings("caveat")}`}
      >
        {depth.pings.games === 0 ? (
          <NoData text={t("noData")} />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat
                label={t("totalPings")}
                value={num(depth.pings.total)}
                hint={t("sample", { games: depth.pings.games })}
              />
              <Stat
                label={t("aboveTeam")}
                value={`${depth.pings.aboveTeam}/${depth.pings.games}`}
              />
              {depth.pings.replySplitGames > 0 && (
                <Stat
                  label={t("replyDifference")}
                  value={`${num(depth.pings.deathsWithReplies)} ${DASH} ${num(depth.pings.deathsWithoutReplies)}`}
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PING_KINDS.map((kind: PingKind) => (
                <div
                  key={kind}
                  className="flex items-baseline justify-between gap-2 rounded-md border border-border/60 px-2 py-1"
                >
                  <span className="truncate text-xs text-muted-foreground">
                    {tPings(`kinds.${kind}` as `kinds.${PingKind}`)}
                  </span>
                  <span className="num text-xs text-foreground">
                    {num(depth.pings.perGame[kind])}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section
        title={t("earlyTitle")}
        hint={t("sampleTimeline", {
          games: depth.early.laneGames,
          total: depth.games,
        })}
      >
        {depth.early.games === 0 ? (
          <NoData text={t("noData")} />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat
                label={t("csAt", { minute: 10 })}
                value={num(depth.early.at10.cs)}
                hint={t("compare", { value: signed(depth.early.at10.csDiff) })}
              />
              <Stat
                label={t("csAt", { minute: 15 })}
                value={num(depth.early.at15.cs)}
                hint={t("compare", { value: signed(depth.early.at15.csDiff) })}
              />
              <Stat
                label={t("xpAt", { minute: 10 })}
                value={signed(depth.early.at10.xpDiff)}
              />
              <Stat
                label={t("goldAt", { minute: 10 })}
                value={signed(depth.early.at10.goldDiff)}
              />
            </div>
            {depth.early.laneGames <= SMALL_DERIVED_SAMPLE && (
              <p className="text-xs text-muted-foreground">{caveat}</p>
            )}
            <Rows
              rows={[
                [
                  t("firstBlood"),
                  `${depth.early.firstBlood.kills} / ${depth.early.firstBlood.assists}`,
                ],
                [t("deathsBefore10"), num(depth.early.deathsBefore10)],
              ]}
            />
          </div>
        )}
      </Section>

      <Section
        title={t("visionTitle")}
        hint={t("sample", { games: depth.vision.games })}
      >
        {depth.vision.games === 0 ? (
          <NoData text={t("noData")} />
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat
                label={t("visionPerMin")}
                value={num(depth.vision.visionPerMin, 2)}
                hint={t("compare", { value: num(depth.vision.teamPerMin, 2) })}
              />
              <Stat
                label={t("wardsPlaced")}
                value={num(depth.vision.wardsPlaced)}
              />
              <Stat
                label={t("wardsKilled")}
                value={num(depth.vision.wardsKilled)}
              />
            </div>
            <Rows
              rows={[[t("controlWards"), num(depth.vision.controlWards)]]}
            />
          </div>
        )}
      </Section>

      <Section
        title={t("combatTitle")}
        hint={t("sample", { games: depth.combat.games })}
      >
        {depth.combat.games === 0 ? (
          <NoData text={t("noData")} />
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat
                label={t("damagePerDeath")}
                value={int(depth.combat.damagePerDeath)}
              />
              <Stat
                label={t("damageTaken")}
                value={int(depth.combat.damageTakenPerGame)}
              />
              <Stat
                label={t("mitigated")}
                value={int(depth.combat.mitigatedPerGame)}
              />
              <Stat label={t("cc")} value={num(depth.combat.ccPerGame)} />
              <Stat
                label={t("healing")}
                value={int(depth.combat.healingPerGame)}
              />
              <Stat
                label={t("shielding")}
                value={int(depth.combat.shieldingPerGame)}
              />
            </div>
            <Rows
              rows={[
                [t("multikills"), String(depth.combat.multikills)],
                [t("largestSpree"), num(depth.combat.largestSpree, 0)],
                [t("soloKills"), num(depth.combat.soloKills, 0)],
                [t("deadTime"), share(depth.combat.deadTimeShare)],
                [t("survivedLongest"), mmss(depth.combat.survivedLongest)],
              ]}
            />
          </div>
        )}
      </Section>

      <Section
        title={t("deathsTitle")}
        hint={
          depth.deaths.games > 0
            ? t("sampleTimeline", {
                games: depth.deaths.games,
                total: depth.games,
              })
            : caveat
        }
      >
        {depth.deaths.total === 0 ? (
          <NoData text={t("noData")} />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat
                label={t("deathsTotal")}
                value={String(depth.deaths.total)}
                hint={t("sample", { games: depth.deaths.games })}
              />
              <Stat
                label={t("alone")}
                value={`${depth.deaths.alone} (${share(depth.deaths.aloneShare)})`}
              />
              <Stat
                label={t("costly")}
                value={`${depth.deaths.costly} (${share(depth.deaths.costlyShare)})`}
              />
            </div>
            <Rows
              rows={PHASES.map(
                (phase) =>
                  [tPhases(phase), String(depth.deaths.byPhase[phase])] as [
                    string,
                    string,
                  ],
              )}
            />
            <Rows
              rows={REGIONS.map(
                (region) =>
                  [tRegions(region), String(depth.deaths.byRegion[region])] as [
                    string,
                    string,
                  ],
              )}
            />
          </div>
        )}
      </Section>

      <Section
        title={t("objectivesTitle")}
        hint={t("sample", { games: depth.objectives.games })}
      >
        {depth.objectives.games === 0 ? (
          <NoData text={t("noData")} />
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat
                label={t("dragonParticipation")}
                value={share(depth.objectives.dragonParticipation)}
              />
              <Stat
                label={t("baronParticipation")}
                value={share(depth.objectives.baronParticipation)}
              />
              <Stat
                label={t("towerParticipation")}
                value={share(depth.objectives.towerParticipation)}
              />
              <Stat
                label={t("turretKillsPerGame")}
                value={num(depth.objectives.turretKillsPerGame, 2)}
              />
            </div>
            <Rows
              rows={[
                [
                  t("damageToObjectives"),
                  int(depth.objectives.damageToObjectivesPerGame),
                ],
                [
                  t("damageToTurrets"),
                  int(depth.objectives.damageToTurretsPerGame),
                ],
                [t("stolen"), String(depth.objectives.stolen)],
              ]}
            />
          </div>
        )}
      </Section>

      <Section
        title={t("trendTitle")}
        hint={t("trendRecent", {
          games: depth.trend.recentGames,
          previous: depth.trend.previousGames,
        })}
      >
        <Rows
          rows={[
            [t("winRate"), signed(depth.trend.deltas.winRate)],
            [t("kda"), signed(depth.trend.deltas.kda, 2)],
            [t("csPerMin"), signed(depth.trend.deltas.csPerMin, 1)],
            [t("visionPerMin"), signed(depth.trend.deltas.visionPerMin, 2)],
            [t("deathsPerGame"), signed(depth.trend.deltas.deathsPerGame)],
            [t("damagePerMin"), signed(depth.trend.deltas.damagePerMin)],
          ]}
        />
      </Section>

      <Section title={t("synergyTitle")}>
        {pairs.length === 0 ? (
          <NoData text={t("noPairs", { minimum: SMALL_DERIVED_SAMPLE })} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("teammate")}</TableHead>
                <TableHead numeric>{t("games")}</TableHead>
                <TableHead numeric>{t("winRate")}</TableHead>
                <TableHead numeric>{t("kda")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pairs.map((pair) => (
                <TableRow key={pair.person}>
                  <TableCell className="font-medium text-foreground">
                    {names.get(pair.person) ?? pair.person.slice(0, 6)}
                  </TableCell>
                  <TableCell numeric>{pair.games}</TableCell>
                  <TableCell numeric>{share(pair.winRate)}</TableCell>
                  <TableCell numeric>{num(pair.kda, 2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}

/** One champion: the items, the build, the runes, the spells and the skill order. */
export function ChampionSections({
  depth,
  championId,
}: {
  depth: PlayerDepth;
  championId: number | null;
}) {
  const t = useTranslations("premade.individual");
  const data = useDdragon();
  const champion: ChampionDetail | undefined = depth.champions.find(
    (entry) => entry.championId === championId,
  );

  if (!champion) {
    return (
      <Card padding="lg">
        <NoData text={t("noGames")} />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Section
        title={t("itemsTitle")}
        hint={t("sample", { games: champion.games })}
        defaultOpen
      >
        {champion.items.length === 0 ? (
          <NoData text={t("noData")} />
        ) : (
          <ul className="flex flex-wrap gap-3">
            {champion.items.map((item) => (
              <li
                key={item.itemId}
                className="flex w-20 flex-col items-center gap-1 text-center"
              >
                <IconFrame
                  src={itemIcon(data, item.itemId)}
                  alt=""
                  size="sm"
                  shape="rounded"
                />
                <span className="text-2xs leading-tight text-foreground">
                  {itemName(data, item.itemId)}
                </span>
                <span className="num text-2xs text-muted-foreground">
                  {item.games} {DOT} {rate(item.wins, item.games)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={t("buildTitle")}
        hint={t("sample", { games: champion.games })}
      >
        <div className="space-y-2">
          <Rows
            rows={[
              [
                t("firstItem"),
                champion.build.firstItem ? (
                  <span className="flex items-center justify-end gap-2">
                    <span className="num text-muted-foreground">
                      {champion.build.firstItem.at
                        ? mmss(champion.build.firstItem.at)
                        : ""}
                    </span>
                    <ItemName
                      data={data}
                      itemId={champion.build.firstItem.itemId}
                    />
                  </span>
                ) : (
                  num(null)
                ),
              ],
              [
                t("buildOrder"),
                champion.build.order ? (
                  <span className="flex flex-wrap justify-end gap-1">
                    {champion.build.order.items.map((itemId, index) => (
                      <span
                        key={`${itemId}-${index}`}
                        className="flex items-center gap-1"
                      >
                        {index > 0 && (
                          <span className="text-muted-foreground">{DASH}</span>
                        )}
                        <ItemName data={data} itemId={itemId} />
                      </span>
                    ))}
                  </span>
                ) : (
                  num(null)
                ),
              ],
              [
                t("buildWinRate"),
                `${share(champion.buildWinRate.withBuild)} ${DOT} ${share(champion.buildWinRate.other)}`,
              ],
            ]}
          />
          <p className="text-xs text-muted-foreground">
            {t("derived", { games: depth.derivedGames, total: depth.games })}
          </p>
        </div>
      </Section>

      <Section
        title={t("runesTitle")}
        hint={
          champion.runes
            ? t("sample", { games: champion.runes.games })
            : undefined
        }
      >
        {champion.runes ? (
          <ul className="space-y-1.5 text-sm">
            {(
              [
                [t("keystone"), champion.runes.keystone],
                [t("primaryTree"), champion.runes.primary],
                [t("secondaryTree"), champion.runes.secondary],
              ] as [string, number][]
            ).map(([label, id]) => {
              const rune = data.runes.get(id);
              return (
                <li
                  key={label}
                  className="flex items-center justify-between gap-4"
                >
                  <span className="text-muted-foreground">{label}</span>
                  <NamedIconItem
                    name={rune?.name}
                    icon={rune?.icon ?? null}
                    fallbackId={id || undefined}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <NoData text={t("noData")} />
        )}
      </Section>

      <Section
        title={t("spellsTitle")}
        hint={
          champion.spells
            ? t("sample", { games: champion.spells.games })
            : undefined
        }
      >
        {champion.spells ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {champion.spells.spells.map((spell) => {
              const entry = data.spells.get(String(spell));
              return (
                <li key={spell}>
                  <NamedIconItem
                    name={entry?.name}
                    icon={entry?.icon ?? null}
                    fallbackId={spell}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <NoData text={t("noData")} />
        )}
      </Section>

      <Section
        title={t("skillsTitle")}
        hint={
          champion.skills
            ? t("sample", { games: champion.skills.games })
            : undefined
        }
      >
        {champion.skills ? (
          <p className="num flex flex-wrap gap-1 text-sm">
            {champion.skills.order.map((slot, index) => (
              <span
                key={`${slot}-${index}`}
                className="rounded-sm border border-border px-1.5 py-0.5 text-foreground"
              >
                {SKILL_NAMES[slot - 1] ?? "?"}
              </span>
            ))}
          </p>
        ) : (
          <NoData text={t("noData")} />
        )}
      </Section>
    </div>
  );
}
