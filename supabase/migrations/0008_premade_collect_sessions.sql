-- Coleta por sessão: cada clique em "Coletar" abre uma sessão nova que percorre as listas de
-- novo e guarda os ids já lidos. Sem isso, o cursor "finished" ficava permanente e a coleta virava
-- um no-op: nenhum batch voltava a pedir nada ao Riot.
--
-- Idempotente: pode rodar de novo sem erro.

create table if not exists public.premade_collect_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.premade_teams(id) on delete cascade,
  /** Pessoas necessárias do time para a partida valer (2 a 5). */
  min_roster integer not null default 5,
  /** Página (start) já lida de cada conta, por PUUID. */
  next_start jsonb not null default '{}'::jsonb,
  /** Campos (matchId) já listados por cada conta, por PUUID: ids que pagam a coleta. */
  ids jsonb not null default '{}'::jsonb,
  /** Quantos jogos cada conta listou até agora, por PUUID. */
  games jsonb not null default '{}'::jsonb,
  scans_done integer not null default 0,
  scans_total integer not null default 0,
  /** Elenco (PUUIDs ordenados) com que a sessão foi aberta: se o time mudar, ela recomeça. */
  roster_key text not null default '',
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists premade_collect_sessions_team_idx
  on public.premade_collect_sessions (team_id, created_at desc);
