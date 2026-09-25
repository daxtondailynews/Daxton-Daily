-- Daily Newspaper — Supabase schema (Phase 3: paid membership + locked content)
--
-- Run this once in the Supabase SQL editor, after schema.sql (Database ->
-- SQL Editor -> New query -> paste -> Run).
--
-- What it adds:
--   memberships  one row per account that has touched checkout; written only
--                by the Stripe webhook (service role), readable by its owner.
--   editions     the daily papers, moved out of the public repo. Full
--                editions are readable only by members; everyone else can
--                read just the top story through get_edition_previews().
--   publish_edition()  how the daily content job adds a new edition, guarded
--                by a publish secret kept in a schema the API can't reach.
--
-- A member is anyone whose membership status is 'active' or 'trialing'
-- (set by Stripe, including $0 subscriptions from a 100%-off coupon) or
-- 'comped' (set by hand in the Table Editor to give someone free access
-- without going through Stripe at all).

-- ---------- Memberships ----------

create table public.memberships (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  status text not null default 'none',
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.memberships enable row level security;

-- Read-only for the owner. There are deliberately no insert/update
-- policies: membership status only ever changes through the Stripe
-- webhook (service role), so nobody can grant themselves access from the
-- browser.
create policy "members can view own membership"
  on public.memberships for select
  using (auth.uid() = user_id);

create or replace function public.is_member(uid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where user_id = uid and status in ('active', 'trialing', 'comped')
  );
$$;

revoke execute on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;

-- ---------- Editions ----------

create table public.editions (
  date date primary key,
  edition jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.editions enable row level security;

create policy "members can read full editions"
  on public.editions for select
  to authenticated
  using (public.is_member(auth.uid()));

-- The free preview: every edition's date + top story, for anyone.
create or replace function public.get_edition_previews()
returns table (date date, top_story jsonb)
language sql
stable
security definer set search_path = public
as $$
  select date, edition -> 'topStory'
  from public.editions
  order by date desc
  limit 30;
$$;

grant execute on function public.get_edition_previews() to anon, authenticated;

-- Full editions for a magic-link visit from the daily email (no login),
-- but only if that token belongs to a current member. Non-members and
-- unknown tokens get nothing back and fall through to the preview.
create or replace function public.get_editions_by_magic_token(token uuid)
returns setof jsonb
language sql
stable
security definer set search_path = public
as $$
  select e.edition
  from public.editions e
  where exists (
    select 1 from public.subscribers s
    where s.magic_token = token and public.is_member(s.id)
  )
  order by e.date desc
  limit 30;
$$;

grant execute on function public.get_editions_by_magic_token(uuid) to anon, authenticated;

-- ---------- Publishing ----------

-- The "private" schema isn't exposed through the Supabase API, so nothing
-- in it is reachable with the public key — only from SQL and from
-- SECURITY DEFINER functions like publish_edition below.
create schema if not exists private;

create table if not exists private.settings (
  key text primary key,
  value text not null
);

-- Adds (or replaces, by date) one edition object — or an array of them —
-- in the shape documented at the top of the old content/editions.js.
-- Called by scripts/publish-edition.ps1 with the secret from .publish-secret.
create or replace function public.publish_edition(secret text, edition jsonb)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  expected text;
  item jsonb;
  items jsonb;
  n integer := 0;
begin
  select value into expected from private.settings where key = 'publish_secret';
  if expected is null or secret is null or secret <> expected then
    raise exception 'invalid publish secret';
  end if;

  items := case when jsonb_typeof(edition) = 'array' then edition else jsonb_build_array(edition) end;

  for item in select * from jsonb_array_elements(items) loop
    if (item ->> 'date') is null or item -> 'topStory' is null then
      raise exception 'each edition needs a date and a topStory';
    end if;
    insert into public.editions (date, edition)
    values ((item ->> 'date')::date, item)
    on conflict (date) do update set edition = excluded.edition;
    n := n + 1;
  end loop;

  return n;
end;
$$;

grant execute on function public.publish_edition(text, jsonb) to anon, authenticated;
