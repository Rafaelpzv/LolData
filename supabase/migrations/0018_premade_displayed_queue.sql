-- Fila exibida por conta: a coluna `queue_type` passa a acompanhar o elo guardado (Flex quando
-- existe, senao Solo/Duo), em vez de ficar na fila antiga.
--
-- As equipes criadas antes de 0017 guardaram o elo em Solo/Duo: a proxima sincronizacao (botao
-- "Update data") reescreve as duas filas e esta coluna, sem precisar recriar a equipe.
--
-- Idempotente: pode rodar de novo sem erro.

alter table public.premade_account_ranks
  add column if not exists flex_queue_type text,
  add column if not exists solo_queue_type text;

-- Linhas antigas com as duas filas ja preenchidas: a exibida e a Flex, quando ela existe.
update public.premade_account_ranks
   set queue_type = case when flex_tier is not null then 'RANKED_FLEX_SR' else 'RANKED_SOLO_5x5' end
 where flex_queue_type is null
   and solo_queue_type is null
   and (flex_tier is not null or solo_tier is not null);
