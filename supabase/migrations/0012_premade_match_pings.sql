-- Pings por participante.
--
-- O `pings` de cada participante vive no sample da partida (premade_matches.participants), que
-- partidas antigas salvaram sem ele: a recoleta de 0010 passou a gravá-lo, mas as que já estavam no
-- banco continuam sem. Com esta coluna só a contagem de pings é reescrita em `fields`, sem tocar no
-- resto da linha, e a flag em premade_matches marca as partidas que já a têm.
--
-- Idempotente: pode rodar de novo sem erro.

alter table public.premade_matches
  add column if not exists pings_saved boolean not null default false;

-- As partidas que a recoleta de 0010 já reescreveu já têm os pings no sample.
update public.premade_matches
   set pings_saved = true
 where pings_saved = false
   and participants is not null
   and participants::text like '%"pings":%'
   and participants::text not like '%"pings": null%';
