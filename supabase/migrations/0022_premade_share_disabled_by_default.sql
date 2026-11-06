-- Link publico lineup: nasce DESLIGADO.
--
-- A 0019 criou `share_enabled boolean not null default true`: toda equipe nova ficava publica no
-- instante em que era criada, e o primeiro "desligar" a transformava em 404 sem que ninguem tivesse
-- escolhido publicar. Publicar passa a ser um ato explicito ("Religar link" no painel Compartilhar).
--
-- Nenhuma equipe existente muda: o update so toca linhas nulas, e nenhuma e nula hoje (a coluna e
-- NOT NULL desde a 0019). Equipe sem a coluna em algum ambiente tambem passa a nascer desligada.
--
-- Idempotente: pode rodar de novo sem erro.

alter table public.premade_teams
  alter column share_enabled set default false;

update public.premade_teams
   set share_enabled = false
 where share_enabled is null;
