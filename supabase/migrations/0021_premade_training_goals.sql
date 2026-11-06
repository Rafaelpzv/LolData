-- Objetivos de treinamento (§6): a tabela que liga um diagnóstico da análise a um ciclo de treino.
--
-- O fluxo do §6.1 termina em "atualizar o estado", e o estado NÃO é escolhido pela equipe depois que
-- existem partidas posteriores: ele é lido dos dados (`training.ts`). Esta tabela guarda, então:
--   * o objetivo em si (problema, pessoa, métrica, linha de base, meta, exercício, início);
--   * o estado ESCOLHIDO pela equipe antes de haver dados (`planned`/`running`);
--   * o histórico de avaliações, cada uma uma leitura independente com o número de partidas de cada
--     janela — para uma leitura antiga poder ser conferida depois contra a nova.
--
-- Nada aqui é apagado em cascata a partir das partidas: a avaliação referencia o PERÍODO, não a
-- partida, e o histórico de treino continua válido quando uma partida antiga é recoletada.
--
-- Idempotente: pode rodar de novo sem erro.

create table if not exists public.premade_training_goals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.premade_teams(id) on delete cascade,
  -- A pessoa do elenco, ou null quando o objetivo é do time inteiro (mortes do grupo).
  person_id text,
  -- Nome congelado no momento da criação: o histórico não muda de dono se a conta for renomeada.
  person_name text,
  title text not null,
  problem text not null default '',
  metric text not null,
  baseline double precision,
  target double precision,
  starts_at timestamptz not null default now(),
  exercise text not null default '',
  -- planned | running: o que a equipe escolheu. Os demais estados são lidos dos dados.
  state text not null default 'planned',
  -- Diagnóstico do §5 que originou o objetivo: aspecto e se era problema ou força.
  origin_aspect text,
  origin_kind text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A métrica é um vocabulário fechado (TRAINING_METRICS em training.ts): o banco recusa o resto.
alter table public.premade_training_goals
  drop constraint if exists premade_training_goals_metric_check;
alter table public.premade_training_goals
  add constraint premade_training_goals_metric_check check (
    metric in (
      'csDiffAt10',
      'visionPerMin',
      'aloneDeathShare',
      'killParticipation',
      'damagePerDeath',
      'deathsPerGame',
      'teamDeathsPerGame'
    )
  );

alter table public.premade_training_goals
  drop constraint if exists premade_training_goals_state_check;
alter table public.premade_training_goals
  add constraint premade_training_goals_state_check
  check (state in ('planned', 'running'));

alter table public.premade_training_goals
  drop constraint if exists premade_training_goals_origin_kind_check;
alter table public.premade_training_goals
  add constraint premade_training_goals_origin_kind_check
  check (origin_kind is null or origin_kind in ('problem', 'strength'));

create index if not exists premade_training_goals_team_idx
  on public.premade_training_goals (team_id, starts_at desc);

create index if not exists premade_training_goals_person_idx
  on public.premade_training_goals (team_id, person_id)
  where archived_at is null;

-- Uma leitura por leitura: guarda o instante exato e também o dia, porque "uma leitura por dia por
-- objetivo" é a regra de gravação (avaliar o painel duas vezes no mesmo dia não duplica histórico).
create table if not exists public.premade_training_evaluations (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.premade_training_goals(id) on delete cascade,
  team_id uuid not null references public.premade_teams(id) on delete cascade,
  evaluated_at timestamptz not null default now(),
  -- O dia UTC da leitura: a chave do upsert, para a mesma leitura do mesmo dia ser sobrescrita.
  evaluated_day date not null default (now() at time zone 'utc')::date,
  baseline_games int not null default 0,
  window_games int not null default 0,
  baseline_value double precision,
  current_value double precision,
  delta double precision,
  relative double precision,
  low double precision,
  high double precision,
  verdict text not null,
  confidence text not null,
  state text not null,
  target_reached boolean
);

-- Idempotente em bancos onde a tabela já existe com a coluna de dia: garante a coluna.
alter table public.premade_training_evaluations
  add column if not exists evaluated_day date not null default (now() at time zone 'utc')::date;

-- Uma leitura por dia por objetivo: ir ao painel duas vezes no mesmo dia não grava duas leituras.
create unique index if not exists premade_training_evaluations_day_idx
  on public.premade_training_evaluations (goal_id, evaluated_day);

create index if not exists premade_training_evaluations_goal_idx
  on public.premade_training_evaluations (goal_id, evaluated_at desc);

-- Políticas explícitas: o app escreve como service_role (as rotas passam por `requireEdit`).
alter table public.premade_training_goals enable row level security;
alter table public.premade_training_evaluations enable row level security;

drop policy if exists premade_training_goals_all on public.premade_training_goals;
create policy premade_training_goals_all on public.premade_training_goals
  for all to service_role using (true) with check (true);

drop policy if exists premade_training_evaluations_all on public.premade_training_evaluations;
create policy premade_training_evaluations_all on public.premade_training_evaluations
  for all to service_role using (true) with check (true);

grant select, insert, update, delete on public.premade_training_goals to service_role;
grant select, insert, update, delete on public.premade_training_evaluations to service_role;
