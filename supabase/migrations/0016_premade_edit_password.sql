-- Senha de edicao por equipe e link publico do lineup (texto sem acentos de proposito).
--
--   premade_teams.edit_password_hash  hash scrypt da senha de edicao (nunca a senha em si).
--   premade_teams.edit_salt           salt de 16 bytes (hex) usado pelo scrypt.
--   premade_teams.password_version    sobe a cada troca de senha e derruba as sessoes antigas.
--   premade_teams.share_id            id opaco do link somente-leitura do lineup, separado do slug.
--   premade_teams.share_enabled       desliga o link sem trocar o id (volta a responder 404).
--
--   premade_login_attempts  falhas de senha por equipe e IP, para o bloqueio temporario.
--
-- Idempotente: pode rodar de novo sem erro.

alter table public.premade_teams
  add column if not exists edit_password_hash text,
  add column if not exists edit_salt text,
  add column if not exists password_version int not null default 0,
  add column if not exists share_id text,
  add column if not exists share_enabled boolean not null default true;

-- Toda equipe passa a ter um share_id; as antigas ganham um na primeira execucao.
update public.premade_teams
   set share_id = encode(gen_random_bytes(16), 'hex')
 where share_id is null;

create unique index if not exists premade_teams_share_id_key
  on public.premade_teams (share_id);

create table if not exists public.premade_login_attempts (
  team_id uuid not null references public.premade_teams(id) on delete cascade,
  ip_hash text not null,
  failures int not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (team_id, ip_hash)
);

create index if not exists premade_login_attempts_updated_idx
  on public.premade_login_attempts (updated_at);
