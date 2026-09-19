"use client";

import { useParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";

const champions = [
  { id: "all", name: "Todos" },
  { id: "266", name: "Aatrox" },
  { id: "103", name: "Ahri" },
  { id: "84", name: "Akali" },
  { id: "166", name: "Akshan" },
  { id: "12", name: "Alistar" },
  { id: "799", name: "Ambessa" },
  { id: "32", name: "Amumu" },
  { id: "34", name: "Anivia" },
  { id: "1", name: "Annie" },
  { id: "523", name: "Aphelios" },
  { id: "22", name: "Ashe" },
  { id: "136", name: "Aurelion Sol" },
  { id: "893", name: "Aurora" },
  { id: "268", name: "Azir" },
  { id: "432", name: "Bard" },
  { id: "200", name: "Bel'Veth" },
  { id: "53", name: "Blitzcrank" },
  { id: "63", name: "Brand" },
  { id: "201", name: "Braum" },
  { id: "233", name: "Briar" },
  { id: "51", name: "Caitlyn" },
  { id: "164", name: "Camille" },
  { id: "69", name: "Cassiopeia" },
  { id: "31", name: "Cho'Gath" },
  { id: "42", name: "Corki" },
  { id: "122", name: "Darius" },
  { id: "131", name: "Diana" },
  { id: "119", name: "Draven" },
  { id: "36", name: "Dr. Mundo" },
  { id: "245", name: "Ekko" },
  { id: "60", name: "Elise" },
  { id: "28", name: "Evelynn" },
  { id: "81", name: "Ezreal" },
  { id: "9", name: "Fiddlesticks" },
  { id: "114", name: "Fiora" },
  { id: "105", name: "Fizz" },
  { id: "3", name: "Galio" },
  { id: "41", name: "Gangplank" },
  { id: "86", name: "Garen" },
  { id: "150", name: "Gnar" },
  { id: "79", name: "Gragas" },
  { id: "104", name: "Graves" },
  { id: "887", name: "Gwen" },
  { id: "120", name: "Hecarim" },
  { id: "74", name: "Heimerdinger" },
  { id: "910", name: "Hwei" },
  { id: "420", name: "Illaoi" },
  { id: "39", name: "Irelia" },
  { id: "427", name: "Ivern" },
  { id: "40", name: "Janna" },
  { id: "59", name: "Jarvan IV" },
  { id: "24", name: "Jax" },
  { id: "126", name: "Jayce" },
  { id: "202", name: "Jhin" },
  { id: "222", name: "Jinx" },
  { id: "145", name: "Kai'Sa" },
  { id: "429", name: "Kalista" },
  { id: "43", name: "Karma" },
  { id: "30", name: "Karthus" },
  { id: "38", name: "Kassadin" },
  { id: "55", name: "Katarina" },
  { id: "10", name: "Kayle" },
  { id: "141", name: "Kayn" },
  { id: "85", name: "Kennen" },
  { id: "121", name: "Kha'Zix" },
  { id: "203", name: "Kindred" },
  { id: "240", name: "Kled" },
  { id: "96", name: "Kog'Maw" },
  { id: "897", name: "K'Sante" },
  { id: "7", name: "LeBlanc" },
  { id: "64", name: "Lee Sin" },
  { id: "89", name: "Leona" },
  { id: "876", name: "Lillia" },
  { id: "127", name: "Lissandra" },
  { id: "236", name: "Lucian" },
  { id: "117", name: "Lulu" },
  { id: "99", name: "Lux" },
  { id: "54", name: "Malphite" },
  { id: "90", name: "Malzahar" },
  { id: "57", name: "Maokai" },
  { id: "11", name: "Master Yi" },
  { id: "800", name: "Mel" },
  { id: "902", name: "Milio" },
  { id: "21", name: "Miss Fortune" },
  { id: "62", name: "Wukong" },
  { id: "82", name: "Mordekaiser" },
  { id: "25", name: "Morgana" },
  { id: "950", name: "Naafiri" },
  { id: "267", name: "Nami" },
  { id: "75", name: "Nasus" },
  { id: "111", name: "Nautilus" },
  { id: "518", name: "Neeko" },
  { id: "76", name: "Nidalee" },
  { id: "895", name: "Nilah" },
  { id: "56", name: "Nocturne" },
  { id: "20", name: "Nunu & Willump" },
  { id: "2", name: "Olaf" },
  { id: "61", name: "Orianna" },
  { id: "516", name: "Ornn" },
  { id: "80", name: "Pantheon" },
  { id: "78", name: "Poppy" },
  { id: "555", name: "Pyke" },
  { id: "246", name: "Qiyana" },
  { id: "133", name: "Quinn" },
  { id: "497", name: "Rakan" },
  { id: "33", name: "Rammus" },
  { id: "421", name: "Rek'Sai" },
  { id: "526", name: "Rell" },
  { id: "888", name: "Renata Glasc" },
  { id: "58", name: "Renekton" },
  { id: "107", name: "Rengar" },
  { id: "92", name: "Riven" },
  { id: "68", name: "Rumble" },
  { id: "13", name: "Ryze" },
  { id: "360", name: "Samira" },
  { id: "113", name: "Sejuani" },
  { id: "235", name: "Senna" },
  { id: "147", name: "Seraphine" },
  { id: "875", name: "Sett" },
  { id: "35", name: "Shaco" },
  { id: "98", name: "Shen" },
  { id: "102", name: "Shyvana" },
  { id: "27", name: "Singed" },
  { id: "14", name: "Sion" },
  { id: "15", name: "Sivir" },
  { id: "72", name: "Skarner" },
  { id: "901", name: "Smolder" },
  { id: "37", name: "Sona" },
  { id: "16", name: "Soraka" },
  { id: "50", name: "Swain" },
  { id: "517", name: "Sylas" },
  { id: "134", name: "Syndra" },
  { id: "223", name: "Tahm Kench" },
  { id: "163", name: "Taliyah" },
  { id: "91", name: "Talon" },
  { id: "44", name: "Taric" },
  { id: "17", name: "Teemo" },
  { id: "412", name: "Thresh" },
  { id: "18", name: "Tristana" },
  { id: "48", name: "Trundle" },
  { id: "23", name: "Tryndamere" },
  { id: "4", name: "Twisted Fate" },
  { id: "29", name: "Twitch" },
  { id: "77", name: "Udyr" },
  { id: "6", name: "Urgot" },
  { id: "110", name: "Varus" },
  { id: "67", name: "Vayne" },
  { id: "45", name: "Veigar" },
  { id: "161", name: "Vel'Koz" },
  { id: "711", name: "Vex" },
  { id: "254", name: "Vi" },
  { id: "234", name: "Viego" },
  { id: "112", name: "Viktor" },
  { id: "8", name: "Vladimir" },
  { id: "106", name: "Volibear" },
  { id: "19", name: "Warwick" },
  { id: "498", name: "Xayah" },
  { id: "101", name: "Xerath" },
  { id: "5", name: "Xin Zhao" },
  { id: "157", name: "Yasuo" },
  { id: "777", name: "Yone" },
  { id: "83", name: "Yorick" },
  { id: "350", name: "Yuumi" },
  { id: "154", name: "Zac" },
  { id: "238", name: "Zed" },
  { id: "221", name: "Zeri" },
  { id: "115", name: "Ziggs" },
  { id: "26", name: "Zilean" },
  { id: "142", name: "Zoe" },
  { id: "143", name: "Zyra" },
];

export default function getChampionNameById(id: number): string {
  const champ = champions.find((c) => c.id === String(id));
  return champ ? champ.name : "Desconhecido";
}

const queues = [
  { id: "all", name: "Todos" },
  { id: "420", name: "Solo/Duo" },
  { id: "440", name: "Flex" },
  { id: "450", name: "ARAM" },
  { id: "400", name: "Normal" },
  { id: "490", name: "Quickplay" },
  { id: "1700", name: "Arena" },
];

// Converte o parâmetro da URL de volta para id de campeão.
// Suporta o novo formato numérico ("103") e os antigos slugs ("kaisa").
function getChampionIdFromParam(param: string | undefined): string {
  if (!param || param.toLowerCase() === "all") return "all";
  if (champions.some((c) => c.id === param)) return param;
  const champ = champions.find(
    (c) =>
      c.name.replace(/\s+/g, "").replace(/['.]/g, "").toLowerCase() ===
      param.toLowerCase(),
  );
  return champ ? champ.id : "all";
}

export function MatchFilter() {
  const params = useParams();

  const region = params.region as string;
  const gameName = params.gameName as string;
  const tagLine = params.tagLine as string;
  const queueType = params.queueType as string | undefined;
  const championName = params.championName as string | undefined;

  const queueIdFromUrl =
    !queueType || queueType.toLowerCase() === "all"
      ? "all"
      : queueType
          .replace("soloDuo", "420")
          .replace("flex", "440")
          .replace("aram", "450")
          .replace("normal", "400")
          .replace("quickplay", "490")
          .replace("arena", "1700");

  const [queueId, setQueueId] = useState<string>(queueIdFromUrl);
  const [championId, setChampionId] = useState<string>(() =>
    getChampionIdFromParam(championName),
  );
  const [championMenuOpen, setChampionMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const championMenuRef = useRef<HTMLDivElement>(null);

  // Ajusta o estado quando os parâmetros da URL mudam (sem useEffect).
  const [prevUrlState, setPrevUrlState] = useState({
    queueIdFromUrl,
    championName,
  });
  if (
    prevUrlState.queueIdFromUrl !== queueIdFromUrl ||
    prevUrlState.championName !== championName
  ) {
    setPrevUrlState({ queueIdFromUrl, championName });
    setQueueId(queueIdFromUrl);
    setChampionId(getChampionIdFromParam(championName));
  }

  // Limpa a busca assim que o menu fecha.
  if (!championMenuOpen && search !== "") {
    setSearch("");
  }

  function getFilterUrl(
    newQueueId: string | null,
    newChampionId: string | null,
  ) {
    const queue = newQueueId !== null ? newQueueId : queueId;
    const champ = newChampionId !== null ? newChampionId : championId;

    // Usa o championId numérico na URL (estável, sem ambiguidade de nome)
    let championParam = "/all";
    if (champ && champ !== "all") {
      championParam = `/${champ}`;
    }

    let queueParam = "all";
    if (queue && queue !== "all" && queue !== "") {
      queueParam = queue
        .replace("420", "soloDuo")
        .replace("440", "flex")
        .replace("450", "aram")
        .replace("400", "normal")
        .replace("490", "quickplay")
        .replace("1700", "arena");
    }

    return `/lol/${region}/${gameName}/${tagLine}/${queueParam}${championParam}`;
  }

  const filtered = champions.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase().trim()),
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        championMenuRef.current &&
        !championMenuRef.current.contains(event.target as Node)
      ) {
        setChampionMenuOpen(false);
      }
    }
    if (championMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [championMenuOpen]);

  return (
    <div className="mt-4 flex flex-col gap-3">
      {/* Queue Filter — pill buttons */}
      <div className="flex flex-wrap gap-2">
        {queues.map((queue) => (
          <a
            key={queue.id}
            href={getFilterUrl(queue.id, null)}
            onClick={() => setQueueId(queue.id)}
            className={`px-4 py-1.5 rounded-full border text-sm font-medium transition-all duration-150
              ${
                queueId === queue.id
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-foreground border-border hover:border-foreground"
              }
            `}
          >
            {queue.name}
          </a>
        ))}
      </div>

      {/* Champion Filter — dropdown with search */}
      <div className="relative w-48 min-w-[180px]" ref={championMenuRef}>
        <button
          type="button"
          className="flex items-center justify-between w-full p-2 border rounded-md cursor-pointer border-input bg-background text-sm"
          onClick={() => setChampionMenuOpen((open) => !open)}
        >
          {champions.find((c) => c.id === championId)?.name ??
            "Champion Filter"}
          <span className="ml-2">&#9662;</span>
        </button>
        {championMenuOpen && (
          <div className="absolute z-10 mt-1 w-56 border rounded shadow-lg p-2 bg-background">
            <input
              autoFocus
              placeholder="Search champion..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2 py-1 mb-2 border rounded bg-background text-sm outline-none"
            />
            <div className="overflow-y-auto max-h-64">
              <ul className="flex flex-col gap-1">
                {filtered.length > 0 ? (
                  filtered.map((champ) => (
                    <li
                      key={champ.id}
                      className={`cursor-pointer px-2 py-1 rounded transition-colors text-sm
                        ${championId === champ.id ? "bg-accent font-bold" : ""}
                        hover:bg-muted hover:text-accent-foreground
                      `}
                      onClick={() => setChampionMenuOpen(false)}
                    >
                      <a
                        href={getFilterUrl(null, champ.id)}
                        className="block w-full h-full"
                      >
                        {champ.name}
                      </a>
                    </li>
                  ))
                ) : (
                  <li className="px-2 py-1 text-sm text-muted-foreground">
                    No champions found
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
