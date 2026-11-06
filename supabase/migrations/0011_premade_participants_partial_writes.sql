-- Partial writes on premade_participants.
--
-- The re-collection writes only what it has: the depth fields of migration 0010 (items, runes,
-- spells, challenges) or the timeline derived data. A PostgREST upsert that names a subset of the
-- columns inserts the missing ones as null, so a row that already exists would be rewritten to
-- nulls by a lighter write. With these policies the partial writes are split into an update of the
-- columns they name and an insert of the whole row, each allowed on its own terms.
--
-- A policy alone is not enough: a table created by an earlier migration is owned by the role that
-- created it (postgres), and the API reaches it as service_role. Without the grants below the
-- policy check is never reached and the write fails on the row shape instead.
--
-- Idempotente: pode rodar de novo sem erro.

alter table public.premade_participants enable row level security;

drop policy if exists premade_participants_insert on public.premade_participants;
create policy premade_participants_insert on public.premade_participants
  for insert to service_role
  with check (true);

drop policy if exists premade_participants_update on public.premade_participants;
create policy premade_participants_update on public.premade_participants
  for update to service_role
  using (true)
  with check (true);

grant select, insert, update, delete on public.premade_participants to service_role;
