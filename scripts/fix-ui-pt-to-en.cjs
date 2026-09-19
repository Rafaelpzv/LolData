// npx zscore --fix-ui
// Translations PT -> EN for UI strings / corrupted bullets.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const files = {
  "src/app/components/match/MatchHistoryItem.tsx": {
    "{gameMode} " + "\u00e2\u20ac\u00a2" + " {gameType}": "{gameMode} \u2022 {gameType}",
  },
  "src/app/components/winrate/WinrateCard.tsx": {
    "\u2026 dias": "\u2026 days",
    "{globalTotal} jogos": "{globalTotal} games",
    "{globalWins} V": "{globalWins} W",
    "{globalLosses} D": "{globalLosses} L",
    "Vit\u00f3rias": "Wins",
    "Derrotas": "Losses",
    "Taxa de vit\u00f3ria": "Winrate",
    "Vit\u00f3ria": "Win",
    "Derrota": "Loss",
    "Divis\u00f5es por dia": "Matches per day",
    "jogos": "games",
    "dias": "days",
    "V" + "\u00b7" + " D": "W \u00b7 L",
    "Nenhum dado de vit\u00f3ria": "No winrate data",
    "Sem jogos carregados": "No games loaded",
    "jogos \u00b7": "games \u00b7",
    "dias": "days",
    "Divis\u00f5es": "Divisions",
    "Preenchimento da \u00e1rea": "Area fill",
    "Linha do gr\u00e1fico": "Chart line",
    "Hit areas invis\u00edveis (maiores) para melhor intera\u00e7\u00e3o": "Invisible hit areas (larger) for better interaction",
    "Pontos de dados vis\u00edveis": "Visible data points",
    "Mostrar labels apenas dos dias mais relevantes": "Show labels only for the most relevant days",
    "Divisores verticais entre dias": "Vertical dividers between days",
    "Gr\u00e1fico de winrate por dia": "Winrate chart per day",
  },
};

function run() {
  for (const [rel, map] of Object.entries(files)) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) {
      console.log("MISS " + rel);
      continue;
    }
    let src = fs.readFileSync(full, "utf8");
    let changed = 0;
    for (const [from, to] of Object.entries(map)) {
      if (src.includes(from)) {
        src = src.split(from).join(to);
        changed++;
      }
    }
    if (changed) {
      fs.writeFileSync(full, src);
      console.log("OK " + rel + " (" + changed + " replacements)");
    }
  }
}

run();
