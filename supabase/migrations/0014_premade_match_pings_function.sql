-- Escrita dos pings por participante, uma chamada por partida.
--
-- O caminho REST do PostgREST não faz merge de jsonb: um update de `fields` regravaria o objeto
-- inteiro. Esta função recebe as linhas da partida (`[{"puuid", "pings"}]`) e grava só a chave
-- `pings` de `premade_participants.fields`, sem tocar no resto da linha.
--
-- Idempotente: pode rodar de novo sem erro.

create or replace function public.premade_set_match_pings(
  p_team uuid,
  p_match text,
  p_rows jsonb
) returns void
language sql
security definer
set search_path = public
as $$
  update public.premade_participants p
     set fields = jsonb_set(coalesce(p.fields, '{}'::jsonb), '{pings}', r.value->'pings', true)
    from jsonb_array_elements(p_rows) as r
   where p.team_id = p_team
     and p.match_id = p_match
     and p.puuid = r.value->>'puuid'
     and r.value->'pings' is not null;
$$;

grant execute on function public.premade_set_match_pings(uuid, text, jsonb) to service_role;
