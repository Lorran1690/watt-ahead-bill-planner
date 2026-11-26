-- STAGED: activity history; requires approval before applying to production.
begin;
create table public.voltara_activity (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.voltara_households(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check(action in ('INSERT','UPDATE','DELETE')),
  kind text not null,
  record_key text not null,
  record_type text,
  created_at timestamptz not null default now()
);
alter table public.voltara_activity enable row level security;
revoke all on public.voltara_activity from public, anon, authenticated;
grant select on public.voltara_activity to authenticated;
create policy voltara_activity_read on public.voltara_activity for select to authenticated
using (exists (select 1 from public.voltara_members m where m.household_id=voltara_activity.household_id and m.user_id=(select auth.uid())));
create index voltara_activity_house_time on public.voltara_activity(household_id,created_at desc,id desc);
create index voltara_activity_actor on public.voltara_activity(actor_id);

create or replace function voltara_rpc_private.log_record_activity()
returns trigger language plpgsql security definer set search_path='' as $$
declare r public.voltara_records%rowtype;
begin
 if tg_op='UPDATE' and old.document is not distinct from new.document then return new; end if;
 if tg_op='DELETE' then r:=old; else r:=new; end if;
 -- Skip system changes and cascade deletion of the entire household.
 if auth.uid() is null or r.kind='meta' or not exists(select 1 from public.voltara_households h where h.id=r.household_id) then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 if not exists(select 1 from public.voltara_members m where m.household_id=r.household_id and m.user_id=auth.uid()) then
  raise exception 'Atividade não autorizada' using errcode='42501';
 end if;
 insert into public.voltara_activity(household_id,actor_id,action,kind,record_key,record_type)
 values(r.household_id,auth.uid(),tg_op,r.kind,r.record_key,r.document->>'type');
 if tg_op='DELETE' then return old; else return new; end if;
end; $$;
revoke all on function voltara_rpc_private.log_record_activity() from public,anon,authenticated;
create trigger voltara_activity_trigger after insert or update or delete on public.voltara_records
for each row execute function voltara_rpc_private.log_record_activity();
commit;
