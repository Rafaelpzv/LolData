-- Premade Flex 5x5: team registry, its five members and the collected matches.
-- Apply once in the Supabase SQL editor. Safe to re-run (idempotent).

create extension if not exists pgcrypto;

create table if not exists premade_teams (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  region text not null,
  created_at timestamptz not null default now()
);

create table if not exists premade_team_members (
  team_id uuid not null references premade_teams(id) on delete cascade,
  puuid text not null,
  game_name text not null,
  tag_line text not null,
  slot int not null check (slot between 0 and 4),
  primary key (team_id, puuid),
  unique (team_id, slot)
);

create table if not exists premade_matches (
  team_id uuid not null references premade_teams(id) on delete cascade,
  match_id text not null,
  game_creation bigint not null,
  win boolean not null,
  duration int not null,
  team_side int not null,
  objectives jsonb not null,
  participants jsonb not null,
  game_version text,
  first_seen_at timestamptz not null default now(),
  primary key (team_id, match_id)
);

create index if not exists premade_matches_team_creation_idx
  on premade_matches (team_id, game_creation desc);
