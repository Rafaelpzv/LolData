-- Uma conta pode pertencer a equipes diferentes: a chave passa a ser (team_id, puuid).
-- Sem isso, cadastrar a mesma conta em dois premades movia a conta de equipe e deixava a
-- primeira sem contas (e sem jogos).
--
-- Idempotente: pode rodar de novo sem erro.

alter table public.premade_accounts
  drop constraint if exists premade_accounts_pkey;

alter table public.premade_accounts
  add constraint premade_accounts_pkey primary key (team_id, puuid);

-- Cada pessoa ainda tem no máximo uma conta por PUUID (o índice antigo garantia isso globalmente).
create unique index if not exists premade_accounts_player_puuid_idx
  on public.premade_accounts (player_id, puuid);
