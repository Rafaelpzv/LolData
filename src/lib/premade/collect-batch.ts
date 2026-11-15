// Batch collection: read every account's list from the cursor the last batch left, accumulate who
// listed each game, then download the details of the candidates only.
//
// The loop of the button depends on one rule: each batch that runs advances the cursor it stored
// (premade_collect_sessions.account_start) or says why it could not (step.error). An incremental
// update looks only at games newer than the epoch each account already listed (startTime).
import { fetchInBatches, getRegionalUrl, safeFetch } from "@/lib/riot/match-v5";

import { batchConfig, defaultBudgetMs } from "./batch-config";
import {
  DEFAULT_MIN_PEOPLE,
  FRESH_PROBE_DELAY,
  PREMADE_QUEUE_ID,
  PREMADE_QUEUES,
  collectMatchSamples,
  normalizeMinPeople,
  premadeQueueId,
  rejectionReason,
  tierCounts,
  type MinPeopleTiers,
  type PremadeQueueKey,
} from "./collect";
import {
  finishCollectionSession,
  getAccountOwners,
  getCollectedMatchIds,
  getCollectionCursors,
  getMatchIdsNeedingChampionData,
  getMatchPresence,
  getPlayers,
  getTeamById,
  openCollectionSession,
  saveCollectionSession,
  saveCollectionCursor,
  saveMatchPresence,
  saveMatchSamples,
  type CollectionSession,
} from "./repository";
import {
  PAGE_SIZE,
  addListed,
  applyPage,
  caughtUp,
  mergePresence,
  newestGameOf,
  pickCandidates,
  planStep,
  presenceBuckets,
  type PageState,
  type StopReason,
} from "./scan";

/** Identifies a lineup (sorted PUUIDs) so a session never mixes two different rosters. */
function rosterKey(puuids: string[]): string {
  return [...puuids].sort().join(",");
}

/**
 * Where an account with no epoch starts. Riot serves no Flex history without a startTime, so an
 * update asks for everything since this point: 2022-01-01, before the oldest game the analysis
 * looks at, and once. The epoch stored from that answer is what the next update uses.
 */
export const DEFAULT_EPOCH = 1_640_995_200_000;

export type CollectOutcome = "collected" | "notFound" | "noKey";

/** Why the batch could not move the cursor: the client must stop instead of calling again. */
export type CollectError = "noProgress";

export interface CollectStep {
  outcome: CollectOutcome;
  /** Premade games written by this batch. */
  saved: number;
  /** Games of this batch that did not qualify, with the reason. */
  discarded: Record<string, number>;
  /** Games this batch could not read from Riot. */
  skipped: number;
  /** Premade games stored for the team so far. */
  collected: number;
  /** Games listed by at least one roster player. */
  listed: number;
  /** Games already declared candidates (seen in >= minRoster of the roster lists). */
  candidates: number;
  /** Candidates that still need their details downloaded. */
  remaining: number;
  /** Games scanned in this batch (ids returned by Riot). */
  scanned: number;
  /** Accounts whose list was already read up to where it ends. */
  caughtUp?: number;
  done: boolean;
  /** Ran out of time or of the per-batch allowance. */
  budgetHit: boolean;
  /** People needed on the same side for a game to count. */
  minRoster: number;
  /** Games of this batch that qualify for each minimum from 2 to 5 people. */
  tiers: MinPeopleTiers;
  /** How many games each account listed: zero means wrong region or no Flex game. */
  perAccount: { puuid: string; games: number }[];
  /** Games of this batch grouped by how many distinct people listed them (highest first). */
  presence: { people: number; games: number }[];
  /** List reads that found something new, against the ceiling of a full scan: the button's bar. */
  scansDone: number;
  scansTotal: number;
  /**
   * List requests made in this batch. `scansDone` only grows on reads that listed something new,
   * so THIS is how the client sees a batch moving (an update also reads games it already has).
   */
  reads: number;
  /** Why the batch stopped without advancing: when set, the batch is not worth repeating. */
  error?: CollectError;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Token bucket: keeps the whole batch under the configured requests per second. */
function paced(requestsPerSecond: number) {
  const gap = 1000 / Math.max(1, requestsPerSecond);
  let next = 0;
  return async () => {
    const now = Date.now();
    const wait = Math.max(0, next - now);
    next = Math.max(now, next) + gap;
    if (wait > 0) await sleep(wait);
  };
}

/**
 * One collection step. The ids are the only thing that costs a Riot request per game, so they
 * are always kept: a game only becomes a candidate once `minRoster` distinct people of the roster
 * list it, and only candidates pay for a detail request.
 */
export async function collectBatch(
  teamId: string,
  options: {
    budgetMs?: number;
    maxDetails?: number;
    minRoster?: number;
    rescan?: boolean;
    restart?: boolean;
    /**
     * "fresh" (the data button): asks only for games newer than the epoch each account already
     * listed (startTime), so a click reads a handful of games. "incremental" (the advanced
     * action): walks the list from page 0 and stops at the first page with nothing new. "full":
     * every page is walked, to find games older than the cache.
     */
    mode?: "incremental" | "fresh" | "full";
    /**
     * A(s) fila(s) da coleta, pelas filas de `PREMADE_QUEUES`.
     *
     * Cada fila tem a própria lista no Riot, então a leitura pede uma lista por fila e cada uma
     * guarda o próprio cursor (página e epoch) e o próprio estado de sessão: um lote sempre avança
     * pela mesma fila, e retomar uma não mexe na outra. Sem fila, a coleta lê TODAS (Flex e
     * CLASSIC), que é o comportamento do botão.
     */
    queues?: readonly string[] | null;
  } = {},
): Promise<CollectStep> {
  const mode = options.mode ?? "fresh";
  /** As filas desta coleta, na ordem; sem escolha, todas as que a premade coleta. */
  const queueKeys = (options.queues?.length
    ? options.queues
    : PREMADE_QUEUES.map((queue) => queue.key)) as readonly PremadeQueueKey[];
  const config = batchConfig(undefined, {
    budgetMs: options.budgetMs ?? defaultBudgetMs(),
    detailCap: options.maxDetails,
  });
  const team = await getTeamById(teamId, { includeArchived: true });
  if (!team) return emptyStep("notFound");

  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) return emptyStep("noKey");

  const base = getRegionalUrl(team.region);
  const headers = { "X-Riot-Token": apiKey };
  const deadline = Date.now() + config.budgetMs;
  const wait = paced(config.requestsPerSecond);
  const { detailCap, scanCap, maxPages } = config;
  // Toda leitura pede páginas cheias. `fresh` pedia um jogo por requisição: uma partida por conta
  // por clique, que nunca trazia o histórico de quem entrou depois.
  const pageSize = PAGE_SIZE;
  const envMinRoster = Number(process.env.PREMADE_MIN_ROSTER);
  const minRoster = normalizeMinPeople(
    options.minRoster ??
      (Number.isFinite(envMinRoster) && envMinRoster > 0
        ? envMinRoster
        : DEFAULT_MIN_PEOPLE),
  );

  const roster = await getPlayers(team.id);
  // Only the active lineup forms a team: an archived person could never play with it again.
  // A person is scanned through every account they own, so one account shared by two people is
  // requested once but counts for both.
  const puuids = [
    ...new Set(
      roster
        .filter((player) => !player.archived)
        .flatMap((player) =>
          player.accounts
            .filter((account) => !account.archived)
            .map((account) => account.puuid),
        ),
    ),
  ];
  const key = rosterKey(puuids);
  // Every account of the team is collected, archived ones included: their games are history.
  const teamPuuids = [
    ...new Set(
      roster.flatMap((player) =>
        player.accounts.map((account) => account.puuid),
      ),
    ),
  ];
  // Pages the click is worth: the product with the account count, so the progress of the session
  // adds up instead of being refreshed from a different number on every batch.
  const totalScans = (count: number) => count * maxPages;

  const owners = await getAccountOwners(team.id);
  const person = (puuid: string) => owners[puuid] ?? puuid;
  // What every account listed, this run included. The stored presence is the other half: a game
  // only becomes a candidate against BOTH, never against the accounts of one batch. The presence
  // is per TEAM, so a game listed by two accounts of different queues counts once here.
  const [stored, repair, presence] = await Promise.all([
    getCollectedMatchIds(team.id),
    getMatchIdsNeedingChampionData(team.id),
    getMatchPresence(team.id),
  ]);
  const listedBy = new Map<string, Set<string>>();
  for (const [id, people] of presence) listedBy.set(id, new Set(people));
  // Games each account listed, per PUUID, already added up across the queues of this run.
  const accountGames = new Map<string, number>();
  const accountSeen = new Set<string>();
  const errors = new Map<string, StopReason>();

  /** O trabalho de UMA fila: a lista de cada conta, o cursor dela e a sessão dela. */
  interface QueueWalk {
    queueKey: PremadeQueueKey;
    queueId: number;
    session: CollectionSession;
    /** Account -> where its list stood when this run started: what this batch resumes. */
    resumeFrom: Map<string, number>;
    /** Account -> where its list stands now: what the next batch resumes from. */
    saveFor: Map<string, number>;
    emits: Map<string, number>;
    listIds: Record<string, string[]>;
    pages: PageState[];
    /** Games this queue's lists returned in this batch: the progress of the session counts them. */
    scansDone: number;
  }

  const walks: QueueWalk[] = [];
  for (const queueKey of queueKeys) {
    const queueId = premadeQueueId(queueKey) ?? PREMADE_QUEUE_ID;
    // The session a click works on: the open one (it carries the account cursors), or a new one.
    // Each queue has its own state, so a paused Flex walk never rebases the CLASSIC cursors.
    const session = await openCollectionSession(team.id, {
      minRoster,
      scansTotal: totalScans(puuids.length),
      rosterKey: key,
      restart: options.restart || options.rescan,
      queueKey,
    });
    const cursors = await getCollectionCursors(team.id, queueKey);
    for (const [puuid, games] of Object.entries(session.games))
      accountGames.set(puuid, (accountGames.get(puuid) ?? 0) + games);
    const emit = new Map<string, number>();
    const pages = puuids.map((puuid) => {
      const cursor = cursors.get(puuid);
      // Resume from the stored cursor: the page where this session stopped; the session is the most
      // recent word, the per-account cursor is the fallback. A "fresh" run asks by epoch instead, but
      // keeps the offset so the games the probe hides are read one by one, never from zero.
      const fromSession = session.accountStart[puuid] ?? session.nextStart[puuid];
      const nextStart =
        fromSession ?? (cursor && !cursor.finished ? cursor.nextStart : 0);
      emit.set(puuid, cursor?.emitted ?? 0);
      return {
        puuid,
        nextStart,
        // An account that never listed a game has no epoch: it starts at the window the collection
        // looks at, so it is read once and does not come back as fresh on every update.
        epoch: cursor && cursor.epoch > 0 ? cursor.epoch : DEFAULT_EPOCH,
        listedAt: cursor?.lastListedAt ?? 0,
        mode,
        finished: false,
        pageSize,
        reads: 0,
      };
    });
    const walk: QueueWalk = {
      queueKey,
      queueId,
      session,
      resumeFrom: new Map(pages.map((page) => [page.puuid, page.nextStart])),
      saveFor: new Map(pages.map((page) => [page.puuid, page.nextStart])),
      emits: emit,
      listIds: {},
      pages,
      scansDone: 0,
    };
    // Pages read in an earlier batch of the same session were listed then: their ids come back
    // from the session instead of another Riot request.
    if (session.rosterKey === key) {
      for (const page of pages) {
        const chunks = session.ids[page.puuid] ?? [];
        for (let index = 0; index * PAGE_SIZE < page.nextStart; index += 1) {
          const ids = (chunks[index] ?? "").split(",").filter(Boolean);
          addListed(listedBy, ids, person(page.puuid));
        }
      }
    }
    walks.push(walk);
  }

  const step: CollectStep = {
    outcome: "collected",
    saved: 0,
    discarded: {},
    skipped: 0,
    collected: stored.size,
    listed: 0,
    candidates: 0,
    remaining: 0,
    scanned: 0,
    done: false,
    budgetHit: false,
    minRoster,
    tiers: { 2: 0, 3: 0, 4: 0, 5: 0 },
    perAccount: [],
    presence: [],
    scansDone: 0,
    scansTotal: Math.max(
      ...walks.map((walk) => walk.session.scansTotal),
      totalScans(puuids.length),
    ),
    reads: 0,
  };

  // 1. Ids. The accounts are read one after the other, each one resuming from its own cursor, and
  // the batch ends when the budget runs out: the next call continues from exactly there.
  const readPage = async (
    page: PageState,
    walk: QueueWalk,
    attempt: number,
  ): Promise<void> => {
    const plan = planStep(page, maxPages);
    if (!plan) return;
    const url = new URL(
      `${base}/lol/match/v5/matches/by-puuid/${encodeURIComponent(page.puuid)}/ids`,
    );
    // A fila desta lista: cada fila tem a própria listagem, e a página do cursor é a daquela fila.
    url.searchParams.set("queue", String(walk.queueId));
    url.searchParams.set("start", String("start" in plan ? plan.start : 0));
    url.searchParams.set("count", String(plan.count));
    // O "fresh" da segunda passada pede o que veio depois do que a primeira já leu, e não a mesma
    // página outra vez: `plan.startTime` já vem em segundos.
    if (plan.kind === "fresh") {
      const floor =
        attempt === 1 ? plan.startTime : plan.startTime + FRESH_PROBE_DELAY;
      url.searchParams.set("startTime", String(floor));
      // A segunda passada também não pode voltar ao offset da primeira: o cursor já andou por ele.
      if (attempt > 1 && page.nextStart > plan.count)
        url.searchParams.set("start", String(page.nextStart - plan.count));
    }

    await wait();
    let body: unknown;
    try {
      const res = await safeFetch(url.toString(), {
        headers,
        cache: "no-store",
      });
      if (!res.ok) {
        // Backoff: the account stays where it was and is retried on the next batch.
        if (res.status === 429) await sleep(1000);
        errors.set(page.puuid, "network");
        page.error = "network";
        return;
      }
      body = await res.json().catch(() => null);
    } catch {
      errors.set(page.puuid, "network");
      page.error = "network";
      return;
    }
    if (!Array.isArray(body)) {
      errors.set(page.puuid, "network");
      page.error = "network";
      return;
    }

    const ids = (body as unknown[])
      .map((id) => String(id))
      .filter((id) => id.length > 0);
    const result = applyPage(page, plan, ids, maxPages);
    if (result.ids.length > 0) {
      addListed(listedBy, result.ids, person(page.puuid));
      accountSeen.add(page.puuid);
      // Only an account that answered novelties moves its "last listed" mark: an account that
      // always answers 0 must not look like one that just delivered a game.
      page.listedAt = Date.now();
      accountGames.set(
        page.puuid,
        (accountGames.get(page.puuid) ?? 0) + result.ids.length,
      );
      step.scanned += result.ids.length;
    }
    // Ids per page read, for the next batch of the same session: it resumes after them.
    if (plan.kind !== "fresh") {
      const chunks =
        walk.listIds[page.puuid] ?? (walk.listIds[page.puuid] = []);
      chunks[plan.start / PAGE_SIZE] = result.ids.join(",");
    }
    // The cursor moves with the read, before anything can fail: this is what "advanced" means.
    if (page.nextStart > (walk.resumeFrom.get(page.puuid) ?? 0))
      walk.emits.set(page.puuid, page.nextStart);
    walk.saveFor.set(page.puuid, page.nextStart);
    step.reads += 1;
    if (result.ids.length > 0) walk.scansDone += 1;
  };

  // As listas são lidas fila a fila: primeiro Flex, depois CLASSIC. Uma partida listada na primeira
  // já entra no conjunto, então o cursor de cada fila só avança pela lista dela.
  for (const walk of walks) {
    for (const page of walk.pages) {
      // Duas tentativas por conta: o "fresh" por epoch pode não trazer nada, e a passada atrasada
      // pega o jogo que o probe escondeu. O cursor continua sendo quem manda no resto.
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        while (Date.now() < deadline && step.scanned < scanCap) {
          const plan = planStep(page, maxPages);
          if (!plan) break;
          const before = page.reads;
          await readPage(page, walk, attempt);
          // Nothing advanced: the request failed, retry on the next batch.
          if (page.reads === before) break;
        }
        if (page.reads > 0) break;
        if (Date.now() >= deadline || step.scanned >= scanCap) break;
      }
    }
  }
  if (Date.now() >= deadline || step.scanned >= scanCap) step.budgetHit = true;

  // 2. Candidates over EVERY account: the stored presence plus what this run read.
  const candidates = pickCandidates(listedBy, minRoster);
  const pending = candidates
    .filter((id) => !stored.has(id) || repair.has(id))
    .sort((a, b) => b.localeCompare(a));
  step.candidates = candidates.length;
  step.listed = listedBy.size;
  step.perAccount = puuids.map((puuid) => ({
    puuid,
    games: accountGames.get(puuid) ?? 0,
  }));
  // Accounts whose list is already read up to where it ends (caught up with what the team has).
  // An account is caught up when every queue it was read in is, since each queue has its own list.
  const caughtUpByQueue = (puuid: string) =>
    walks.filter((walk) => walk.pages.some((page) => page.puuid === puuid));
  step.caughtUp = puuids.filter((puuid) =>
    caughtUpByQueue(puuid).every((walk) =>
      caughtUp(walk.pages.find((page) => page.puuid === puuid) as PageState),
    ),
  ).length;
  step.presence = presenceBuckets(listedBy).slice(0, 6);
  step.remaining = pending.length;
  step.scansDone = walks.reduce(
    (sum, walk) => sum + walk.session.scansDone + walk.scansDone,
    0,
  );
  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[premade] coleta modo=${mode} filas=${queueKeys.join("+")} lidas=${step.reads} jogos=${step.scanned} listadas=${step.listed} min=${minRoster} ` +
        `candidatas=${candidates.length} porConta=${JSON.stringify(step.perAccount.map((a) => `${a.puuid.slice(0, 6)}=${a.games}`))}`,
    );
  }

  // 3. Details of the candidates only.
  const raw: unknown[] = [];
  await fetchInBatches(
    pending.slice(0, detailCap).map((id) => async () => {
      if (Date.now() >= deadline) return;
      await wait();
      const res = await safeFetch(
        `${base}/lol/match/v5/matches/${encodeURIComponent(id)}`,
        {
          headers,
          cache: "no-store",
        },
      );
      if (!res.ok) step.skipped += 1;
      else raw.push(await res.json().catch(() => null));
    }),
    config.concurrency,
  );

  for (const payload of raw) {
    const reason = rejectionReason(payload, teamPuuids, minRoster, owners);
    if (reason) {
      step.discarded[reason] = (step.discarded[reason] ?? 0) + 1;
      if (process.env.NODE_ENV !== "production") {
        console.info(
          `[premade] descartada ${(payload as { metadata?: { matchId?: string } })?.metadata?.matchId}: ${reason}`,
        );
      }
    }
  }

  const valid = collectMatchSamples(raw, teamPuuids, minRoster, owners);
  step.tiers = tierCounts(raw, teamPuuids, owners);
  await saveMatchSamples(team.id, valid);
  step.saved = valid.length;
  step.collected = stored.size + valid.length;
  step.remaining = Math.max(0, pending.length - raw.length);

  // Did this batch move anything? A batch that neither ended an account's list nor found a game
  // cannot be repeated: the client stops and shows the error instead of looping. O cursor conta
  // como avanço quando qualquer fila se moveu, e o fim exige que TODAS tenham chegado ao fim.
  const movedAnyCursor = walks.some((walk) =>
    walk.pages.some(
      (page) =>
        (walk.saveFor.get(page.puuid) ?? page.nextStart) !==
        walk.resumeFrom.get(page.puuid),
    ),
  );
  const allCaughtUp = walks.every((walk) =>
    walk.pages.every((page) => caughtUp(page)),
  );
  const advanced =
    walks.some((walk) => walk.pages.some((page) => caughtUp(page))) ||
    accountSeen.size > 0 ||
    movedAnyCursor;
  // A batch that stopped only because the budget ran out keeps the cursor: the next call continues.
  const stoppedByBudget = step.budgetHit && errors.size === 0;
  const failure: CollectError | undefined =
    !advanced && !stoppedByBudget ? "noProgress" : undefined;
  step.error = failure;
  step.done = allCaughtUp && step.remaining === 0;

  // 4. Persist where every account stopped plus who listed what, so the next batch resumes from
  // here. Both writes happen even when the budget ran out: they are what makes the cursor move.
  await saveMatchPresence(team.id, mergePresence(presence, listedBy));
  await Promise.all(
    walks.map(async (walk) => {
      const accountStart: Record<string, number> = {};
      const sessionIds: Record<string, string[]> = {};
      await Promise.all(
        walk.pages.map(async (page) => {
          const state = walk.saveFor.get(page.puuid) ?? page.nextStart;
          accountStart[page.puuid] = state;
          // The ids of every page read so far, so a resumed walk does not pay for them again.
          if (walk.listIds[page.puuid]) {
            const chunks = (walk.session.ids[page.puuid] ?? []).slice();
            for (const [index, joined] of Object.entries(
              walk.listIds[page.puuid],
            ))
              chunks[Number(index)] = joined;
            sessionIds[page.puuid] = chunks;
          }
          // How many games an update has walked already: the next one continues after them.
          const emitted =
            page.mode === "fresh"
              ? Math.max(walk.emits.get(page.puuid) ?? 0, state)
              : 0;
          // O epoch tem de ser a data REAL do jogo mais novo desta conta, não o rabo numérico do id.
          // O id não carrega data (`BR1_3300862966` lido como ms cai em 1970): guardado assim, o
          // `startTime` da próxima atualização pedia "jogos depois de 1970", e o Riot devolvia o
          // histórico inteiro de novo a cada clique — 62 leituras onde bastavam 7.
          const newest = newestGameOf(valid, page.puuid);
          const epoch = newest > 0 ? newest : page.epoch;
          // A walked account read to its end starts the next walk over; an update keeps its offset.
          const finished = caughtUp(page);
          await saveCollectionCursor(
            team.id,
            page.puuid,
            {
              // Com um epoch de verdade, a próxima atualização pergunta pelo topo da lista em vez
              // de refazer a varredura: é o que mantém o clique barato depois da primeira coleta.
              nextStart:
                finished && (mode === "full" || epoch > 0) ? 0 : state,
              finished,
              pagesFetched: page.reads,
              // Epoch: the newest game the account ever answered, so the next update asks for
              // newer ones.
              epoch,
              listedAt: page.listedAt || undefined,
              emitted,
            },
            walk.queueKey,
          );
        }),
      );
      await saveCollectionSession(
        walk.session.id,
        {
          nextStart: accountStart,
          accountStart,
          ids: sessionIds,
          games: Object.fromEntries(accountGames),
          scansDone: step.scansDone,
          scansTotal: step.scansTotal,
          // A sessão da fila só termina quando ELA chegou ao fim: a outra pode ter parado antes.
          error: failure ?? null,
        },
        walk.queueKey,
      );
      if (walk.pages.every((page) => caughtUp(page)) && step.remaining === 0)
        await finishCollectionSession(walk.session.id);
    }),
  );

  return step;
}

function emptyStep(outcome: CollectOutcome): CollectStep {
  return {
    outcome,
    saved: 0,
    discarded: {},
    skipped: 0,
    collected: 0,
    listed: 0,
    candidates: 0,
    remaining: 0,
    scanned: 0,
    done: false,
    budgetHit: false,
    minRoster: DEFAULT_MIN_PEOPLE,
    tiers: { 2: 0, 3: 0, 4: 0, 5: 0 },
    perAccount: [],
    presence: [],
    scansDone: 0,
    scansTotal: 0,
    reads: 0,
  };
}
