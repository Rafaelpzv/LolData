-- Guarda as duas filas por conta: Flex (a que a pagina mostra) e Solo/Duo.
--
-- A pagina sempre exibe a Flex quando existe; o Solo/Duo fica ao lado para a conta nao precisar de
-- uma nova chamada ao Riot quando alguem quiser ve-lo. As colunas antigas (queue_type, tier, ...)
-- continuam sendo a fila exibida, entao nada que ja le a tabela muda.
--
-- Idempotente: pode rodar de novo sem erro.

alter table public.premade_account_ranks
  add column if not exists flex_queue_type text,
  add column if not exists flex_tier text,
  add column if not exists flex_division text,
  add column if not exists flex_league_points int,
  add column if not exists flex_wins int,
  add column if not exists flex_losses int,
  add column if not exists solo_queue_type text,
  add column if not exists solo_tier text,
  add column if not exists solo_division text,
  add column if not exists solo_league_points int,
  add column if not exists solo_wins int,
  add column if not exists solo_losses int;

-- As linhas antigas guardavam a antiga preferencia (Solo antes de Flex): valem como Solo ate a
-- proxima sincronizacao preencher as duas colunas.
update public.premade_account_ranks
   set solo_queue_type = queue_type,
       solo_tier = tier,
       solo_division = division,
       solo_league_points = league_points,
       solo_wins = wins,
       solo_losses = losses
 where solo_queue_type is null
   and queue_type is not null;
