-- Dois modos de coleta na premade: Flex 5x5 (fila 440) e CLASSIC (fila 710).
--
-- A partida guarda a propria fila, para a analise poder ser de um modo so (e para a pagina dizer
-- de onde vem cada numero). As linhas antigas nao tem a coluna preenchida e continuam valendo como
-- Flex, que era o unico modo coletado ate aqui.
--
-- A coleta tambem passa a ter estado POR MODO: o cursor de pagina e de epoch de cada conta era de
-- Flex e levaria a CLASSIC a comecar no meio da lista. As colunas `classic_*` guardam o cursor do
-- modo novo, com o mesmo significado das originais, para que um modo nao mexa no outro.
--
-- Idempotente: pode rodar de novo sem erro.

alter table public.premade_matches
  add column if not exists queue_id integer;

-- As partidas que ja estavam salvas sao todas de Flex: grava o modo em vez de deixar null.
update public.premade_matches
   set queue_id = 440
 where queue_id is null;

create index if not exists premade_matches_team_queue_idx
  on public.premade_matches (team_id, queue_id, game_creation desc);

-- Cursor da coleta por modo.
--   * premade_collection_cursors.classic_*: pagina, epoch e marcador da proxima atualizacao CLASSIC;
--   * premade_collect_sessions.classic_*: onde a sessao CLASSIC parou (pausa e retomada do clique).
alter table public.premade_collection_cursors
  add column if not exists classic_next_start integer not null default 0,
  add column if not exists classic_finished boolean not null default false,
  add column if not exists classic_pages_fetched integer not null default 0,
  add column if not exists classic_epoch bigint not null default 0,
  add column if not exists classic_emitted integer not null default 0,
  add column if not exists classic_last_listed_at timestamptz;

alter table public.premade_collect_sessions
  add column if not exists classic_next_start jsonb not null default '{}'::jsonb,
  add column if not exists classic_account_start jsonb not null default '{}'::jsonb,
  add column if not exists classic_ids jsonb not null default '{}'::jsonb,
  add column if not exists classic_games jsonb not null default '{}'::jsonb;
