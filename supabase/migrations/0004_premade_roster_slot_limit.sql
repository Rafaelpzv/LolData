-- Stage 7: rosters larger than five.
-- 0001 limited premade_team_members.slot to 0..4 with an inline check
-- (premade_team_members_slot_check). The unique (team_id, slot) stays: it is what keeps
-- slots distinct, and the app already picks the next free slot on insert.
--
-- Nothing else caps the roster at five: premade_matches and premade_participants are keyed by
-- (team_id, match_id[, puuid]), with no team-size check, and there are no triggers on the tables.

alter table premade_team_members
  drop constraint if exists premade_team_members_slot_check;

-- Keep slots non-negative, now without an upper bound.
alter table premade_team_members
  drop constraint if exists premade_team_members_slot_non_negative;

alter table premade_team_members
  add constraint premade_team_members_slot_non_negative check (slot >= 0);
