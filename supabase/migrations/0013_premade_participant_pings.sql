-- Escrita dos pings por participante.
--
-- O caminho REST do PostgREST não faz merge de jsonb: um update de `fields` regravaria o objeto
-- inteiro. Esta função grava só a chave `pings` de `premade_participants.fields` sem tocar no resto,
-- pela chave (team, match, puuid). Cresce com a recoleta: só é chamada para partidas recém-lidas.
--
-- Idempotente: pode rodar de novo sem erro.

create or replace function public.premade_set_participant_pings(
  p_team uuid,
  p_match text,
  p_puuid text,
  p_pings jsonb
) returns void
language sql
security definer
set search_path = public
as $$
  update public.premade_participants
     set fields = jsonb_set(coalesce(fields, '{}'::jsonb), '{pings}', p_pings, true)
   where team_id = p_team
     and match_id = p_match
     and puuid = p_puuid;
$$;

grant execute on function public.premade_set_participant_pings(uuid, text, text, jsonb) to service_role;
