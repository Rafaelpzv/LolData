-- Link publico lineup: as equipes criadas antes da coluna `share_id` usavam o id derivado do slug
-- (sha256(slug), 32 hex). A coluna e preenchida aqui com esse mesmo valor, para nenhum link mudar, e
-- o gatilho abaixo mantem a regra para equipes novas.
--
-- DEFAULT nao pode ler outra coluna (`cannot use column reference in DEFAULT expression`): o valor
-- derivado vem de um gatilho BEFORE INSERT.
--
-- Idempotente: pode rodar de novo sem erro.

create extension if not exists pgcrypto;

alter table public.premade_teams
  add column if not exists share_id text,
  add column if not exists share_enabled boolean not null default true;

update public.premade_teams
   set share_id = encode(substring(digest(slug, 'sha256') from 1 for 16), 'hex')
 where share_id is null;

create or replace function public.premade_teams_default_share_id()
returns trigger
language plpgsql
as $$
begin
  if new.share_id is null or new.share_id = '' then
    new.share_id := encode(substring(digest(new.slug, 'sha256') from 1 for 16), 'hex');
  end if;
  return new;
end;
$$;

drop trigger if exists premade_teams_default_share_id on public.premade_teams;
create trigger premade_teams_default_share_id
  before insert on public.premade_teams
  for each row execute function public.premade_teams_default_share_id();

create unique index if not exists premade_teams_share_id_key on public.premade_teams (share_id);
