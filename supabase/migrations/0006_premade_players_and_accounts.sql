-- Stage 9: a player (person) owns one or more accounts (Riot ID / PUUID).
-- A game counts by the number of distinct PEOPLE on the same side, not by accounts.
--
--   premade_players  the person, one per row, with the slot of the roster.
--   premade_accounts the accounts of that person (an archived account keeps its history).
--   premade_team_members is kept as the legacy (one account per slot) table, so 0001..0005 rows
--   keep working; the migration copies them into the new pair and every team created after it
--   gets its players/accounts written too.
--   premade_matches.person_puuids lists the roster accounts that played that game (same content
--   as roster_puuids, written from now on); which person owns each one lives in premade_accounts.
--   premade_participants.account_id mirrors puuid, so a row can be joined to its person.

create table if not exists premade_players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references premade_teams(id) on delete cascade,
  game_name text not null,
  slot int not null check (slot >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (team_id, slot)
);

create table if not exists premade_accounts (
  puuid text primary key,
  player_id uuid not null references premade_players(id) on delete cascade,
  team_id uuid not null references premade_teams(id) on delete cascade,
  game_name text not null,
  tag_line text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists premade_accounts_player_idx on premade_accounts (player_id);
create index if not exists premade_accounts_team_idx on premade_accounts (team_id);

alter table premade_matches
  add column if not exists person_puuids text[];

alter table premade_participants
  add column if not exists account_id text;

-- Migrate the existing members: one player per member, with that account. Idempotent: only the
-- slots that do not exist yet are copied, so re-running never duplicates a person.
insert into premade_players (team_id, game_name, slot, archived_at)
select m.team_id, m.game_name, m.slot, m.archived_at
from premade_team_members m
on conflict (team_id, slot) do nothing;

insert into premade_accounts (puuid, player_id, team_id, game_name, tag_line, archived_at)
select m.puuid, p.id, m.team_id, m.game_name, m.tag_line, m.archived_at
from premade_team_members m
join premade_players p on p.team_id = m.team_id and p.slot = m.slot
where not exists (select 1 from premade_accounts a where a.puuid = m.puuid);
