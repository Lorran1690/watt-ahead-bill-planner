-- Apply after VOLTARA_CONNECT_PUSH_STAGED.sql. No financial data or plaintext.
begin;
create table public.voltara_chat_push_outbox (
 message_id uuid not null references public.voltara_chat_messages(id) on delete cascade,
 endpoint text not null references public.voltara_chat_push_devices(endpoint) on delete cascade,
 attempts integer not null default 0 check(attempts between 0 and 8),
 next_attempt timestamptz not null default now(),
 lease_id uuid,
 lease_until timestamptz,
 completed_at timestamptz,
 primary key(message_id,endpoint)
);
alter table public.voltara_chat_push_outbox enable row level security;
revoke all on public.voltara_chat_push_outbox from public,anon,authenticated;
grant select,insert,update,delete on public.voltara_chat_push_outbox to service_role;
create index voltara_push_outbox_pending on public.voltara_chat_push_outbox(next_attempt) where completed_at is null;
create index voltara_push_outbox_endpoint on public.voltara_chat_push_outbox(endpoint);

-- Enqueue atomically in the same transaction as message creation.
create function voltara_chat_private.enqueue_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.voltara_chat_push_outbox(message_id,endpoint)
 select new.id,d.endpoint from public.voltara_chat_push_devices d
 where d.household_id=new.household_id and d.user_id=new.recipient_id and d.peer_id=new.sender_id
 order by d.created_at desc limit 10
 on conflict do nothing;
 return new;
end $$;
revoke all on function voltara_chat_private.enqueue_push() from public,anon,authenticated;
create trigger voltara_chat_push_enqueue after insert on public.voltara_chat_messages for each row execute function voltara_chat_private.enqueue_push();

-- Only the trusted worker claims jobs. Lease prevents parallel duplicate dispatch.
create function public.voltara_push_claim(p_message uuid default null)
returns table(message_id uuid,endpoint text,p256dh text,auth_secret text,lease_id uuid,attempts integer)
language sql security invoker set search_path='' as $$
 with candidates as (
  select q.message_id,q.endpoint from public.voltara_chat_push_outbox q
  join public.voltara_chat_messages m on m.id=q.message_id
  join public.voltara_chat_push_devices d on d.endpoint=q.endpoint
   and d.household_id=m.household_id and d.user_id=m.recipient_id and d.peer_id=m.sender_id
  where q.completed_at is null and q.attempts<8 and q.next_attempt<=now()
   and (q.lease_until is null or q.lease_until<now())
   and (p_message is null or m.id=p_message)
   and m.created_at>now()-interval '24 hours'
   and exists(select 1 from public.voltara_members where household_id=m.household_id and user_id=m.sender_id)
   and exists(select 1 from public.voltara_members where household_id=m.household_id and user_id=m.recipient_id)
   and not exists(select 1 from public.voltara_chat_receipts r where r.message_id=m.id)
  order by q.next_attempt limit 10 for update of q skip locked
 ), claimed as (
  update public.voltara_chat_push_outbox q set attempts=q.attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '90 seconds'
  from candidates c where q.message_id=c.message_id and q.endpoint=c.endpoint
  returning q.message_id,q.endpoint,q.lease_id,q.attempts
 )
 select c.message_id,c.endpoint,d.p256dh,d.auth_secret,c.lease_id,c.attempts
 from claimed c join public.voltara_chat_push_devices d on d.endpoint=c.endpoint
$$;
revoke all on function public.voltara_push_claim(uuid) from public,anon,authenticated;
grant execute on function public.voltara_push_claim(uuid) to service_role;
grant select on public.voltara_chat_messages,public.voltara_chat_receipts,public.voltara_members to service_role;
create function public.voltara_push_finish(p_message uuid,p_endpoint text,p_lease uuid,p_success boolean,p_permanent boolean)
returns void language sql security invoker set search_path='' as $$
 update public.voltara_chat_push_outbox q
 set completed_at=case when p_success or p_permanent or q.attempts>=8 then now() else null end,
 next_attempt=now()+make_interval(secs=>least(3600,30*power(2,q.attempts-1))::integer),
 lease_until=null,lease_id=null
 where q.message_id=p_message and q.endpoint=p_endpoint and q.lease_id=p_lease
$$;
revoke all on function public.voltara_push_finish(uuid,text,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.voltara_push_finish(uuid,text,uuid,boolean,boolean) to service_role;
commit;
