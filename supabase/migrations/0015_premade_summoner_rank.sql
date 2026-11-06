-- Ícone de perfil, nível e elo de cada conta do elenco (faixa de jogadores estilo lobby).
--
--   premade_account_ranks  uma linha por (time, PUUID): o último retrato do invocador.
--                          profile_icon_id / summoner_level vêm de Summoner-V4;
--                          queue_type / tier / division / league_points vêm de League-V4
--                          (entries by-puuid, fila Solo/Duo e, na falta dela, Flex).
--
-- Nunca é lida do Riot no render da página: a atualização de dados grava aqui e no máximo a cada
-- `next_sync_at` (6 h por padrão) busca de novo.
--
-- Idempotente: pode rodar de novo sem erro.

create table if not exists public.premade_account_ranks (
  team_id uuid not null references public.premade_teams(id) on delete cascade,
  puuid text not null,
  profile_icon_id int,
  summoner_level int,
  -- Tipo da fila exibida ("RANKED_SOLO_5x5" ou "RANKED_FLEX_SR"); nulo quando a conta não tem elo.
  queue_type text,
  tier text,
  division text,
  league_points int,
  wins int,
  losses int,
  -- Quando o Riot respondeu por esta conta; nulo quando a última tentativa falhou.
  fetched_at timestamptz,
  -- A partir de quando vale a pena buscar de novo.
  next_sync_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, puuid)
);

create index if not exists premade_account_ranks_team_idx
  on public.premade_account_ranks (team_id);
