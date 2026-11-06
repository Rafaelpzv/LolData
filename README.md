# LolData

Estatísticas de jogador (perfil, histórico de partidas, gráfico de winrate e rankings) para **League of Legends** e
**Teamfight Tactics**, com uma camada de **análise competitiva de premade Flex 5x5** por cima.

Stack: [Next.js](https://nextjs.org) (App Router, Turbopack) + TypeScript, Tailwind, [next-intl](https://next-intl.dev)
(pt-BR/en), [Supabase](https://supabase.com) (cache de partidas, sem chamar a Riot a cada request) e a API oficial da
Riot (Account-V1, Summoner-V4, League-V4, Match-V5 e Match-V5 Timeline). Testes com [Vitest](https://vitest.dev).

---

## Como rodar

```bash
npm install
npm run dev     # http://localhost:3000 (e http://127.0.0.1:3000)
npm run build   # build de produção
npm test        # Vitest (uma vez)
npm run lint    # ESLint
```

Variáveis de ambiente ficam em `.env.local` (não versionado): chave da Riot, credenciais do Supabase
(`NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`/`SERVICE_ROLE_KEY`) e, para as migrações, `POSTGRES_URL_NON_POOLING`.

Rotas principais: `/` (busca), `/lol/<região>/<invocador>` e `/tft/<região>/<invocador>` (perfil), `/rankings` e
`/tft/rankings` (leaderboards) e `/premade` (análise de premade).

---

## O que entrou desde a última atualização

Tudo abaixo está no commit atual — a base é o merge `d433a81` (perfil com seções independentes).

### Análise coletiva de premade Flex 5x5 (a maior parte do trabalho)

Uma equipe de **pessoas** (não de contas): 3 a 5 jogadores, cada um com uma ou mais contas na mesma região. Rotas:

- **`/premade`** — cadastro do time (nome + contas) e lista de times.
- **`/premade/<slug>`** — o painel: lineup, abas de análise, coleta e administração.
- **`/premade/lineup/<shareId>`** — lineup público somente-leitura, para compartilhar com os jogadores.

**Coleta de partidas.** Só Flex 5x5 (queue `440`). Cada conta é lida por cursor (a coleta retoma de onde parou), as
partidas em que as contas aparecem são interseccionadas e só os candidatos viram chamada de detalhe, em lotes com
orçamento de tempo — assim a rota nunca estoura o limite do servidor. Há também um filtro de "mínimo de jogadores por
partida" (partidas com 3, 4 ou 5 do elenco). Os jogos já salvos podem ser **recoletados** de forma idempotente, e a
**Match-V5 Timeline** é coletada em lotes e só o dado derivado é guardado (o payload bruto nunca entra no banco).

**Leitura do time.** Métricas com intervalo de confiança e amostra explícita (KDA, Winrate, mortes, torres,
conversão de objetivos), **dimensões independentes** em vez de uma nota única inventada, curva de ouro minuto a minuto
(time vs. vantagem vs. derrota), sinergia observada dos pares e uma **integridade** que classifica cada partida antes
de ela entrar em qualquer número (full lineups, partidas misturadas, dados parciais).

**Recomendações.** Regras estatísticas viram recomendações com evidência, amostra e confiança — o texto vive em
`messages/*/premade.json`, o código só escolhe a chave. Há também **inferência de amostra pequena**: uma mudança só
é reportada como melhora/piora quando fica fora do ruído ("within noise" caso contrário).

**Por partida e por jogador.** Análise pós-partida (por que a partida aconteceu daquele jeito, momento crítico,
evidências), padrões recorrentes de hábitos, diagnóstico individual com pontos fortes, exercício sugerido e
acompanhamento de **treinamento** (objetivo → exercício → avaliação por janela de partidas).

**Interface.** Sete abas — resumo, individual, coletivo, treinamento, evolução, partidas e padrões (as dimensões ficam
no resumo); barra do lobby com ícone/nível/elo de cada pessoa (Flex primeiro, Solo/Duo como fallback); gráficos com
eixos, tooltips e caveats; revalidação do elo por conta em lotes; link público com id opaco que pode ser regenerado ou
desligado; e **senha de edição por time** (scrypt com salt por equipe, sessão em cookie e bloqueio temporário após
erros).

### Supabase

22 migrações novas em [`supabase/migrations`](supabase/migrations) (de `0001_premade.sql` a
`0022_premade_share_disabled_by_default.sql`): times, elenco/contas, totais por lado, cursores e sessões de coleta,
timelines, profundidade individual, pings, rank por fila, senha de edição, metas de treinamento e share.

### Infra e testes

- **Vitest** configurado (`vitest.config.ts`, `npm test`), com 33 arquivos de teste cobrindo a camada pura de
  análise (coleta, métricas, recomendações, score, timeline, treinamento, i18n, etc.).
- `next.config.js`: `turbopack.root` fixado (o build deixa de subir para um lockfile do diretório pai) e
  `allowedDevOrigins` para o app funcionar em `127.0.0.1` (sem isso a página não hidratava).
- `tsconfig.json` ignora `scripts/`; `next` subiu para `^16.4.5` e `@types/node` para `^24`.
- `messages/*/premade.json` + namespace `premade` no i18n (pt-BR e en) e entradas de entrada no header/home
  ("Nova premade").
- `scripts/` com utilitários de manutenção: `apply-migrations.mjs` (aplica as migrações uma vez cada),
  `seed-team.ts` (equipe inicial de 13 pessoas / 14 contas), `reset-teams.mjs --confirm`,
  `recompute-people.mjs` e vários verificadores read-only (`premade-audit`, `premade-validate`, etc.).
- `.gitignore` passou a ignorar caches locais de diagnóstico (que guardam PUUIDs reais), logs do dev server e os
  documentos de trabalho do fork.

### Correções no que já existia

- **Histórico de partidas (LoL e TFT):** paginação reescrita — o cursor agora é a própria lista renderizada em vez de
  um `ref`, o que elimina os refs que voltavam a ser escritos durante o render e o "load more" que podia repetir
  páginas; o retry manual força a busca mesmo com `hasMore` falso.
- **Rankings:** a página em cache é lida durante o render (nada de `setState` síncrono no efeito) e o loading é
  derivado da chave da requisição, o que remove renders duplicados e mantém o cache válido até o backfill terminar.
- **Card de partida:** o warm-up do cache das contas agora é chaveado pelos PUUIDs, então não reinicia a cada render.
- `app-header`/`home` reconhecem a seção `/premade`; `public/riot.txt` atualizado com a nova verificação da Riot;
  removidos `console.log` e parâmetros mortos em `actions/summoner.ts` e no backfill.

---

## Desenvolvimento da análise de premade

1. Aplique as migrações: `node scripts/apply-migrations.mjs` (aplica `supabase/migrations/*.sql` em ordem, uma vez
   cada, registrando em `supabase_migrations_log`).
2. Abra `/premade` e informe o nome do time + 3 a 5 contas da mesma região; depois adicione mais contas por jogador.
3. Equipe inicial (13 pessoas / 14 contas): `npx tsx scripts/seed-team.ts`. Limpar equipes de teste:
   `node scripts/reset-teams.mjs --confirm`.
4. Em `/premade/<slug>`, use "Atualizar dados" (`POST /api/premade/<slug>/collect`) escolhendo o mínimo de jogadores
   por partida. Timelines: `POST /api/premade/<slug>/timelines`.
5. A análise fica em `GET /api/premade/<slug>?window=all|10|20`.
6. Rode os testes com `npm test`.

O código de análise vive em [`src/lib/premade`](src/lib/premade) — funções puras, sem Riot/Next/Supabase — com os
limiares centralizados em `config.ts`, e o acesso a banco em `repository.ts` (server-only, service-role).

A interface segue o sistema de design em [`DESIGN.md`](DESIGN.md); todo texto novo deve entrar em `messages/` nos dois
idiomas.

---

## Deploy

Hospedado na [Vercel](https://vercel.com). O build lê as variáveis do projeto; as migrações do Supabase são aplicadas
manualmente com `node scripts/apply-migrations.mjs`.
