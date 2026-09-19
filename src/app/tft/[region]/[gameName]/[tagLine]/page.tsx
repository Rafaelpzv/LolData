import { Suspense } from "react";
import { TftSearch } from "@/app/components/tft/TftSearch";
import { TftProfile } from "@/app/components/tft/TftProfile";
import { TftMatchList } from "@/app/components/tft/TftMatchList";
import {
  getTftSummonerByRiotId,
  getTftLeagueByPuuid,
  getTftMatchIds,
  getTftMatchById,
} from "@/app/actions/tft";

// Decodifica um segmento de path. O Next 16 (Turbopack) entrega o param já
// percent-encoded (ex.: "%CE%B5..." como texto literal); em outras versões
// entrega decodificado. Aqui normalizamos uma vez para ambos os casos.
function decodeParamOnce(value: string): string {
  if (/%[0-9A-Fa-f]{2}/.test(value)) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return value;
}

function getRegionDisplay(region: string) {
  return region
    .replace(/^br1$/i, "BR")
    .replace(/^la1$/i, "LAN")
    .replace(/^la2$/i, "LAS")
    .replace(/^na1$/i, "NA")
    .replace(/^euw1$/i, "EUW")
    .replace(/^eun1$/i, "EUNE")
    .replace(/^kr$/i, "KR")
    .replace(/^jp1$/i, "JP")
    .replace(/^ru$/i, "RU")
    .replace(/^tr1$/i, "TR")
    .replace(/^oc1$/i, "OCE")
    .replace(/^tw2$/i, "TW")
    .replace(/^vn2$/i, "VN")
    .replace(/^sg2$/i, "SG")
    .replace(/^me1$/i, "ME");
}

const MATCH_BATCH_SIZE = 5;

type TftPageData =
  | { status: "notFound" }
  | { status: "error"; message: string }
  | {
      status: "ok";
      summoner: {
        name: string;
        summonerLevel: number;
        profileIconId: number;
        puuid: string;
      };
      leagueEntries: any[];
      matches: any[];
    };

async function loadTftPageData(
  region: string,
  gameName: string,
  tagLine: string,
): Promise<TftPageData> {
  try {
    const summoner = await getTftSummonerByRiotId(region, gameName, tagLine);

    if (!summoner) {
      return { status: "notFound" };
    }

    const [leagueEntries, matchIds] = await Promise.all([
      getTftLeagueByPuuid(region, summoner.puuid),
      getTftMatchIds(region, summoner.puuid, 20),
    ]);

    const matches = await fetchMatchesInBatches(region, matchIds);

    return {
      status: "ok",
      summoner,
      leagueEntries,
      matches,
    };
  } catch (error) {
    console.error("Erro ao carregar dados TFT:", error);
    return {
      status: "error",
      message: "Não foi possível carregar os dados do invocador TFT.",
    };
  }
}

async function fetchMatchesInBatches(
  region: string,
  matchIds: string[],
): Promise<any[]> {
  const matches: any[] = [];

  for (let i = 0; i < matchIds.length; i += MATCH_BATCH_SIZE) {
    const batch = matchIds.slice(i, i + MATCH_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((id) => getTftMatchById(region, id)),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        matches.push(result.value);
      }
    }

    if (i + MATCH_BATCH_SIZE < matchIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  return matches;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ region: string; gameName: string; tagLine: string }>;
}) {
  const { region, gameName, tagLine } = await params;
  return {
    title: `${decodeParamOnce(gameName)}#${decodeParamOnce(tagLine)} (${getRegionDisplay(region)}) - LolData TFT`,
  };
}

export default async function TftSummonerPage({
  params,
}: {
  params: Promise<{ region: string; gameName: string; tagLine: string }>;
}) {
  const raw = await params;
  const region = raw.region;
  const gameName = decodeParamOnce(raw.gameName);
  const tagLine = decodeParamOnce(raw.tagLine);

  const data = await loadTftPageData(region, gameName, tagLine);

  return (
    <div className="flex flex-col min-h-screen">
      <header role="banner" className="w-full">
        <nav role="navigation" aria-label="Pesquisa de invocador TFT">
          <TftSearch defaultRegion={region} />
        </nav>
      </header>

      <TftPageBody
        data={data}
        region={region}
        gameName={gameName}
        tagLine={tagLine}
        regionTranslated={getRegionDisplay(region)}
      />

      <footer role="contentinfo" className="w-full py-4 mt-auto">
        <div className="container mx-auto">
          <div className="p-6 text-sm text-center text-muted-foreground">
            <p>© {new Date().getFullYear()} LolData - Data provided by the Riot Games API</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function TftPageBody({
  data,
  region,
  gameName,
  tagLine,
  regionTranslated,
}: {
  data: TftPageData;
  region: string;
  gameName: string;
  tagLine: string;
  regionTranslated: string;
}) {
  if (data.status === "notFound") {
    return (
      <main className="container flex-grow py-8 mx-auto">
        <div className="p-6 border rounded-lg border-destructive bg-destructive/10 text-destructive">
          <h2 className="text-lg font-semibold">Invocador não encontrado</h2>
          <p>
            O invocador <strong>&quot;{gameName}#{tagLine}&quot;</strong> não
            foi encontrado na região <strong>{region.toUpperCase()}</strong>.
          </p>
          <p className="mt-2 text-sm">
            Verifique se o nome e a região estão corretos e tente novamente.
          </p>
        </div>
      </main>
    );
  }

  if (data.status === "error") {
    return (
      <main className="container flex-grow py-8 mx-auto">
        <div className="p-6 border rounded-lg border-destructive bg-destructive/10 text-destructive">
          <h2 className="text-lg font-semibold">Erro ao carregar dados</h2>
          <p>{data.message}</p>
        </div>
      </main>
    );
  }

  const ranked = data.leagueEntries.find(
    (entry: any) => entry.queueType === "RANKED_TFT",
  );

  return (
    <main className="container flex-grow py-8 mx-auto space-y-8" role="main">
      <TftProfile
        name={data.summoner.name}
        gameName={gameName}
        tagLine={tagLine}
        level={data.summoner.summonerLevel}
        profileIconId={data.summoner.profileIconId}
        region={regionTranslated}
        rank={{ ...(ranked || {}) }}
      />

      <div className="p-6 border rounded-lg bg-card">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold">TFT Match History</h2>
          <p className="text-sm text-muted-foreground">
            Últimas {data.matches.length} partidas
          </p>
        </div>
        <Suspense
          fallback={
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-32 rounded-lg animate-pulse bg-muted/50"
                />
              ))}
            </div>
          }
        >
          <TftMatchList
            matches={data.matches}
            puuid={data.summoner.puuid}
            region={region}
          />
        </Suspense>
      </div>
    </main>
  );
}
