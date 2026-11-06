-- Stage 6: roster larger than five, and per-game champion/lane for each roster player.
--   1. Members added later are archived instead of deleted, so past games stay attributable.
--   2. premade_matches.roster_puuids lists which roster players played each game.
--   3. premade_participants holds the per-player, per-game champion/lane row (queryable,
--      instead of digging inside the JSONB sample).
--
-- Existing rows keep working: roster_puuids is null until the game is re-collected, and the
-- collection repairs games whose participants still lack championId/teamPosition.

alter table premade_team_members
  add column if not exists archived_at timestamptz;

alter table premade_matches
  add column if not exists roster_puuids text[];

create table if not exists premade_participants (
  team_id uuid not null references premade_teams(id) on delete cascade,
  match_id text not null,
  puuid text not null,
  champion_id int not null,
  champion_name text,
  team_position text,
  kills int not null default 0,
  deaths int not null default 0,
  assists int not null default 0,
  win boolean not null,
  game_creation bigint not null,
  primary key (team_id, match_id, puuid)
);

create index if not exists premade_participants_player_idx
  on premade_participants (team_id, puuid, game_creation desc);

create index if not exists premade_participants_champion_idx
  on premade_participants (team_id, puuid, champion_id);
