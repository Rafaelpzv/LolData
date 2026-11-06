-- Aba Individual completa: mais campos por participante (itens, feitiços, runas, combate, visão,
-- objetivos, challenges), agregados do lado do time e os derivados da timeline (build, skills, lane).
--
-- O que sai do payload cru nunca é guardado: só esses campos, já normalizados.
--   premade_participants.fields     campos novos do participante, um jsonb por linha
--   premade_participants.derived    derivados da timeline por participante (build, skills, lane)
--   premade_match_fields            agregados do lado (torres/dragões/barão do time, dano do lado)
--   premade_collect_failures        partidas que o Riot não devolveu na recoleta (não travam o lote)
--
-- Idempotente: pode rodar de novo sem erro.

alter table public.premade_participants
  add column if not exists fields jsonb,
  add column if not exists derived jsonb,
  add column if not exists game_version text;

create table if not exists public.premade_match_fields (
  team_id uuid not null references public.premade_teams(id) on delete cascade,
  match_id text not null,
  side_objectives jsonb,
  side_damage int,
  side_damage_taken int,
  enriched_at timestamptz not null default now(),
  primary key (team_id, match_id)
);

create index if not exists premade_match_fields_team_idx
  on public.premade_match_fields (team_id, match_id);

create table if not exists public.premade_collect_failures (
  team_id uuid not null references public.premade_teams(id) on delete cascade,
  match_id text not null,
  reason text not null,
  status int,
  attempts int not null default 1,
  last_attempt_at timestamptz not null default now(),
  primary key (team_id, match_id)
);

-- Games whose participants still lack the fields above: the re-collection cursor walks these.
create index if not exists premade_participants_fields_idx
  on public.premade_participants (team_id, match_id)
  where fields is null;

-- Toda morte do mapa (quem morreu, companhia, custo): a aba Individual lê fase, região e mortes
-- caras por jogador. O `kills` de antes guarda só as do grupo.
alter table public.premade_timelines
  add column if not exists deaths jsonb not null default '[]'::jsonb;
