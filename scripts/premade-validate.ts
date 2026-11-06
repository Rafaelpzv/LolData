// Read-only validation of the analysis layer against the real stored games of one team.
// Run with: npx tsx scripts/premade-validate.ts flexteste2-1093
//
// It loads the team's matches and timelines exactly the way the pages do (same repository
// functions), then runs the pure analysis over them without any JSX and prints what the layers
// report: the integrity sets, the collective KDA, the window comparison and the timelines.
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

const pct = (value: number | null) =>
  value === null ? "—" : `${(value * 100).toFixed(1)}%`;
const num = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined ? "—" : Number(value).toFixed(digits);

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  // The app reads these two names; make sure they are set before the modules load.
  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = key;

  const slug = process.argv[2] ?? "flexteste2-1093";

  const repository = await import("../src/lib/premade/repository.ts");
  const { computeMetrics, splitPeriods } = await import(
    "../src/lib/premade/metrics.ts"
  );
  const { classifyMatches } = await import("../src/lib/premade/integrity.ts");
  const { accountOwners } = await import("../src/lib/premade/members.ts");
  const { compareWindows } = await import("../src/lib/premade/inference.ts");
  const { computeTimelineMetrics } = await import(
    "../src/lib/premade/timeline-metrics.ts"
  );

  const team = await repository.getTeamBySlug(slug);
  if (!team) {
    console.error(`no team with slug ${slug}`);
    process.exit(1);
  }
  const players = await repository.getPlayers(team.id);
  const matches = await repository.getTeamMatches(team.id);
  const timelines = await repository.getTimelines(team.id);
  const owners = accountOwners(players);

  console.log(
    `# ${team.name} — ${matches.length} partidas, ${timelines.length} timelines, ${players.length} jogadores\n`,
  );

  // ---- 1. Integrity --------------------------------------------------------------------------
  const timelineIds = new Set(timelines.map((entry) => entry.matchId));
  const sets = classifyMatches(matches, { owners, timelineIds, sideSize: 5 });
  console.log("## Integridade das partidas");
  console.log(`  completa .................. ${sets.full.length}/${sets.total}`);
  console.log(`  parcial ................... ${sets.partial.length}/${sets.total}`);
  console.log(`  com substituto ............ ${sets.withSubstitutes.length}/${sets.total}`);
  console.log(`  conta não atribuída ....... ${sets.unattributed.length}/${sets.total}`);
  console.log(`  com timeline .............. ${sets.withTimeline.length}/${sets.total}`);
  console.log(`  sem timeline .............. ${sets.withoutTimeline.length}/${sets.total}`);
  console.log(`  completa + timeline ....... ${sets.fullWithTimeline.length}/${sets.total}`);
  const counts = new Map<number, number>();
  for (const entry of [...sets.full, ...sets.partial])
    counts.set(entry.people, (counts.get(entry.people) ?? 0) + 1);
  console.log(
    `  pessoas por jogo .......... ${[...counts.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([people, games]) => `${people}p=${games}`)
      .join(" ")}`,
  );

  // ---- 2. Collective KDA ---------------------------------------------------------------------
  const metrics = computeMetrics(matches, owners);
  console.log("\n## KDA coletivo (§2.3)");
  console.log(
    `  roster: (${metrics.kills.kills}K + ${metrics.kills.assists}A) / ${metrics.kills.deaths}D = ${num(metrics.kda)}`,
  );
  console.log(
    `  lado:   (${metrics.sideKills?.kills}K + ${metrics.sideKills?.assists}A) / ${metrics.sideKills?.deaths}D = ${num(metrics.sideKda)}`,
  );
  console.log(
    `  lados completos: ${metrics.sideCompleteGames}/${metrics.games} · apresentável como "KDA do time": ${metrics.sideComplete ? "SIM" : "NÃO (estimativa)"}`,
  );

  // ---- 3. Windows ----------------------------------------------------------------------------
  const periods = splitPeriods(matches, 20);
  const recent = computeMetrics(periods.recent.games, owners);
  const previous = computeMetrics(periods.previous.games, owners);
  console.log("\n## Janelas (20 recentes vs 20 anteriores)");
  const sideDeaths = (match: (typeof matches)[number]) =>
    match.teamDeaths ??
    match.participants.reduce((sum, participant) => sum + participant.deaths, 0);
  const show = (
    label: string,
    change: Awaited<ReturnType<typeof compareWindows>>,
    digits = 2,
  ) => {
    console.log(
      `  ${label.padEnd(24)} antes=${num(change.before, digits)} depois=${num(change.after, digits)} ` +
        `delta=${num(change.delta, digits)} se=${num(change.standardError, 3)} ` +
        `IC95=[${num(change.low, digits)}, ${num(change.high, digits)}] ` +
        `veredito=${change.verdict} n=${change.gamesBefore}/${change.gamesAfter}`,
    );
  };
  show(
    "mortes do lado/jogo",
    compareWindows(
      periods.previous.games.map(sideDeaths),
      periods.recent.games.map(sideDeaths),
      { direction: -1 },
    ),
  );
  show(
    "abates do lado/jogo",
    compareWindows(
      periods.previous.games.map((match) => match.teamKills),
      periods.recent.games.map((match) => match.teamKills),
      { direction: 1 },
    ),
  );
  console.log(
    `  taxa de vitória: ${previous.winRate === null ? "—" : `${previous.winRate.toFixed(1)}%`} → ${recent.winRate === null ? "—" : `${recent.winRate.toFixed(1)}%`}`,
  );

  // ---- 4. Timelines --------------------------------------------------------------------------
  const winByMatch = new Map(matches.map((match) => [match.matchId, match.win]));
  const read = timelines.filter((entry) => winByMatch.has(entry.matchId));
  const timelineMetrics = computeTimelineMetrics(
    read.map((entry) => ({
      timeline: entry,
      win: winByMatch.get(entry.matchId) ?? false,
      duration: entry.duration,
    })),
    matches.length,
  );
  console.log("\n## Timelines");
  console.log(
    `  lidas: ${timelineMetrics.games} · sem timeline no período: ${timelineMetrics.missingTimelines}`,
  );
  console.log(
    `  mortes: ${timelineMetrics.deaths.total} (isoladas ${timelineMetrics.deaths.isolated}, caras ${timelineMetrics.deaths.costly})`,
  );
  console.log(
    `  presença em dragão: ${num(timelineMetrics.preparation.dragon.averageNear)} jogadores, ${pct(timelineMetrics.preparation.dragon.nearShare)} com 3+`,
  );
  console.log(
    `  dragões: ${timelineMetrics.objectives.dragon.total} em ${timelineMetrics.objectives.dragon.games} jogos · primeiro em ${num(timelineMetrics.objectives.dragon.first, 0)}s (mediana)`,
  );
}

main().catch((error) => {
  console.error("validation failed:", error);
  process.exitCode = 1;
});
