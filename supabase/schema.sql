-- Daily Newspaper — Supabase schema (Phase 2: accounts + daily email)
--
-- Run this once in the Supabase SQL editor for a fresh project (Database ->
-- SQL Editor -> New query -> paste -> Run). It assumes Supabase Auth is
-- already enabled (it is, by default, on every Supabase project) and uses
-- Supabase's own auth.users table for email/password + hashing — no
-- password handling happens in this schema or anywhere in this app.

create extension if not exists pgcrypto;

-- One row per subscriber, keyed 1:1 to their Supabase Auth user.
create table public.subscribers (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null default '',
  topics text[] not null default '{}',
  city text,
  allow_daily_reminders boolean not null default true,
  magic_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now()
);

alter table public.subscribers enable row level security;

-- Signed-in users can read and update only their own row. There is no
-- policy allowing anon/authenticated SELECT across all rows, so the anon
-- key can never be used to dump the subscribers table or enumerate emails —
-- the only cross-row reads happen through the SECURITY DEFINER functions
-- below, which require already knowing a subscriber's unguessable token.
create policy "subscribers can view own row"
  on public.subscribers for select
  using (auth.uid() = id);

create policy "subscribers can update own row"
  on public.subscribers for update
  using (auth.uid() = id);

-- Auto-create a subscribers row the moment someone signs up, so the app
-- never has to special-case "account exists but no subscribers row yet."
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.subscribers (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Magic-link lookup used by read.html (?magic=<token>) so a subscriber can
-- open their personalized paper straight from the daily email with no
-- login prompt. Returns only what rendering needs — never the token, id,
-- or email back out — and, because it's a plain equality lookup, it can't
-- be used to enumerate subscribers without already possessing a valid
-- (128-bit random, effectively unguessable) token.
create or replace function public.get_subscriber_by_magic_token(token uuid)
returns table (name text, topics text[], city text)
language sql
security definer set search_path = public
as $$
  select name, topics, city
  from public.subscribers
  where magic_token = token;
$$;

grant execute on function public.get_subscriber_by_magic_token(uuid) to anon, authenticated;

-- One-click unsubscribe used by unsubscribe.html (?token=<token>), also
-- with no login required. Returns whether a row actually matched, so the
-- page can show a clear confirmation vs. an "already used / invalid link"
-- state instead of always claiming success.
create or replace function public.unsubscribe_by_magic_token(token uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  affected int;
begin
  update public.subscribers
  set allow_daily_reminders = false
  where magic_token = token;
  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

grant execute on function public.unsubscribe_by_magic_token(uuid) to anon, authenticated;
