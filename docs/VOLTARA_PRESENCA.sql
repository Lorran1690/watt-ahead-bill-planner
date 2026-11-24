-- Script aplicado ao Supabase Voltara. Não altera gastos, convites ou RLS existente.
begin;
alter table public.voltara_members add column if not exists last_seen_at timestamptz;
create schema if not exists voltara_presence_private;
revoke all on schema voltara_presence_private from public, anon, authenticated;
grant usage on schema voltara_presence_private to authenticated;

-- No client-supplied timestamp, member ID, household ID or email.
create or replace function voltara_presence_private.touch()
returns void language sql security definer set search_path = ''
as $$
  update public.voltara_members
  set last_seen_at = now()
  where user_id = (select auth.uid())
    and coalesce(auth.jwt()->>'is_anonymous','false') <> 'true'
    and (last_seen_at is null or last_seen_at < now() - interval '10 seconds');
$$;
create or replace function voltara_presence_private.members()
returns table (role text, is_self boolean, joined_at timestamptz, last_seen_at timestamptz, server_now timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.role, m.user_id = auth.uid(), m.joined_at, m.last_seen_at, now()
  from public.voltara_members m
  where auth.uid() is not null
    and coalesce(auth.jwt()->>'is_anonymous','false') <> 'true'
    and exists (select 1 from public.voltara_members me
      where me.user_id = auth.uid() and me.household_id = m.household_id)
  order by (m.user_id = auth.uid()) desc, m.joined_at;
$$;

revoke all on function voltara_presence_private.touch() from public, anon, authenticated;
revoke all on function voltara_presence_private.members() from public, anon, authenticated;
grant execute on function voltara_presence_private.touch() to authenticated;
grant execute on function voltara_presence_private.members() to authenticated;

create or replace function public.voltara_presence_touch()
returns void language sql security invoker set search_path = ''
as $$ select voltara_presence_private.touch(); $$;
create or replace function public.voltara_presence_members()
returns table (role text, is_self boolean, joined_at timestamptz, last_seen_at timestamptz, server_now timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from voltara_presence_private.members(); $$;
revoke all on function public.voltara_presence_touch() from public, anon, authenticated;
revoke all on function public.voltara_presence_members() from public, anon, authenticated;
grant execute on function public.voltara_presence_touch() to authenticated;
grant execute on function public.voltara_presence_members() to authenticated;
commit;
