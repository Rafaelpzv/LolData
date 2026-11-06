-- Stage 8: background collection with a persistent cursor.
-- One row per team/player: how far the Flex history pagination got (`start`) and whether the
-- history is exhausted. A player added later has no row yet and is scanned from scratch, while
-- the already scanned players keep their cursors and their games are never fetched again.

create table if not exists premade_collection_cursors (
  team_id uuid not null references premade_teams(id) on delete cascade,
  puuid text not null,
  -- Next `start` to request on by-puuid/ids.
  next_start int not null default 0,
  -- True when the last page came back short: Riot has nothing older for this player.
  finished boolean not null default false,
  -- Riot ids seen for this player, so later batches do not pay for them again.
  seen_ids text[] not null default '{}',
  pages_fetched int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (team_id, puuid)
);
