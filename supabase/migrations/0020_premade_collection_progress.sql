-- Coleta por lote com cursor que RETOMA de onde parou.
--
-- O botao "Update data" virava laco infinito: cada sessao recomecava as listas do zero, a presenca
-- era recalculada so com o lote atual (4 de 7 contas por chamada nunca chegava a 5 pessoas) e o
-- cursor nunca avancava. Agora:
--   * premade_collect_sessions.account_start: ate onde a lista de CADA conta ja foi lida;
--   * premade_match_presence: quem ja listou cada partida (match_id + pessoas), acumulado entre
--     lotes, para as candidatas serem decididas sobre todas as contas e nao sobre um lote;
--   * premade_collection_cursors.epoch / emitted / last_listed_at: ponto varrido por conta. O epoch
--     e o `startTime` da proxima atualizacao (so partidas novas); `emitted` conta quantos jogos a
--     atualizacao ja percorreu, para a proxima continuar depois deles; o ultimo impede que partida
--     nova de uma conta que ja respondeu 0 seja confundida com "nada mudou".
--
-- Idempotente: pode rodar de novo sem erro.

alter table public.premade_collect_sessions
  add column if not exists account_start jsonb not null default '{}'::jsonb,
  add column if not exists error text;

alter table public.premade_collection_cursors
  add column if not exists epoch bigint not null default 0,
  add column if not exists emitted integer not null default 0,
  add column if not exists last_listed_at timestamptz;

create table if not exists public.premade_match_presence (
  team_id uuid not null references public.premade_teams(id) on delete cascade,
  match_id text not null,
  -- Pessoas do elenco que listaram a partida (nao as contas): a mesma pessoa com duas contas conta 1.
  people text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (team_id, match_id)
);

create index if not exists premade_match_presence_updated_idx
  on public.premade_match_presence (team_id, updated_at);
