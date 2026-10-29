-- Daxton Daily is free: let everyone (logged in or not) read full editions.
-- Run once in Supabase -> SQL Editor. Safe to re-run.
-- Publishing is unchanged: only publish_edition() (with the secret) can write.

drop policy if exists "anyone can read editions" on public.editions;

create policy "anyone can read editions"
  on public.editions for select
  to anon, authenticated
  using (true);
