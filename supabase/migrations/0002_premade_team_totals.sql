-- Stage 3: team totals the derived metrics need (premade rate, gold efficiency, champion turns).
alter table premade_matches
  add column if not exists team_totals jsonb not null default '{}'::jsonb;
