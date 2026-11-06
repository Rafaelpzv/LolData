-- Match-V5 Timeline: só o derivado das partidas do time, nunca o payload cru (é grande).
--
--   premade_timelines  uma linha por partida: curva de ouro/XP, eventos do time, posições por
--                      frame (compactas) e o placar final, para a UI de uma partida.
--   premade_timeline_series  juntada de ouro por partida (time e inimigo), por segundo, para a
--                      curva agregada do time.
--   premade_timeline_failures  partidas que o Riot não devolve (404, erro): não travam o lote.
--
-- Idempotente: pode rodar de novo sem erro.

create table if not exists public.premade_timelines (
  team_id uuid not null references public.premade_teams(id) on delete cascade,
  match_id text not null,
  duration int not null default 0,
  end_of_game_result text,
  frame_interval int not null default 60000,
  gold_series jsonb not null default '[]'::jsonb,
  gold_diff jsonb not null default '[]'::jsonb,
  xp_diff jsonb not null default '[]'::jsonb,
  kills jsonb not null default '[]'::jsonb,
  objectives jsonb not null default '[]'::jsonb,
  positions jsonb not null default '[]'::jsonb,
  final_stats jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  primary key (team_id, match_id)
);

create index if not exists premade_timelines_team_idx
  on public.premade_timelines (team_id, match_id);

create table if not exists public.premade_timeline_series (
  team_id uuid not null references public.premade_teams(id) on delete cascade,
  match_id text not null,
  gold_diff jsonb not null default '[]'::jsonb,
  xp_diff jsonb not null default '[]'::jsonb,
  win boolean not null default false,
  seconds int not null default 0,
  primary key (team_id, match_id)
);

create table if not exists public.premade_timeline_failures (
  team_id uuid not null references public.premade_teams(id) on delete cascade,
  match_id text not null,
  reason text not null,
  status int,
  attempts int not null default 1,
  last_attempt_at timestamptz not null default now(),
  primary key (team_id, match_id)
);
