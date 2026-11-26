-- One-use, short-lived scheduler tickets. No reusable secret crosses pg_net.
begin;
create table voltara_chat_private.push_worker_tickets (
 token_hash bytea primary key,
 expires_at timestamptz not null
);
alter table voltara_chat_private.push_worker_tickets enable row level security;
revoke all on voltara_chat_private.push_worker_tickets from public,anon,authenticated;
grant usage on schema voltara_chat_private to service_role;
grant select,delete on voltara_chat_private.push_worker_tickets to service_role;

create or replace function public.voltara_push_worker_authorized(p_token text)
returns boolean language sql volatile security invoker set search_path='' as $$
 with consumed as (
  delete from voltara_chat_private.push_worker_tickets
  where length(p_token)=64 and p_token ~ '^[0-9a-f]{64}$'
    and token_hash=extensions.digest(p_token,'sha256') and expires_at>now()
  returning 1
 )
 select exists(select 1 from consumed)
$$;
revoke all on function public.voltara_push_worker_authorized(text) from public,anon,authenticated;
grant execute on function public.voltara_push_worker_authorized(text) to service_role;

create function voltara_chat_private.kick_push(p_force boolean default false)
returns bigint language plpgsql security invoker set search_path='' as $$
declare ticket text;
declare request_id bigint;
begin
 delete from voltara_chat_private.push_worker_tickets where expires_at<=now();
 -- Only prune old notification jobs; never delete messages or attachments.
 delete from public.voltara_chat_push_outbox q using public.voltara_chat_messages m
 where q.message_id=m.id and m.created_at<now()-interval '7 days';
 if not p_force and not exists(
  select 1 from public.voltara_chat_push_outbox q
  join public.voltara_chat_messages m on m.id=q.message_id
  join public.voltara_chat_push_devices d on d.endpoint=q.endpoint and d.household_id=m.household_id and d.user_id=m.recipient_id and d.peer_id=m.sender_id
  where q.completed_at is null and q.attempts<8 and q.next_attempt<=now()
  and (q.lease_until is null or q.lease_until<now()) and m.created_at>now()-interval '24 hours'
  and exists(select 1 from public.voltara_members where household_id=m.household_id and user_id=m.sender_id)
  and exists(select 1 from public.voltara_members where household_id=m.household_id and user_id=m.recipient_id)
  and not exists(select 1 from public.voltara_chat_receipts r where r.message_id=m.id)
 ) then return null;end if;
 ticket:=encode(extensions.gen_random_bytes(32),'hex');
 insert into voltara_chat_private.push_worker_tickets values(extensions.digest(ticket,'sha256'),now()+interval '60 seconds');
 select net.http_post(url:='https://okbqictunqsiqmoygbjs.supabase.co/functions/v1/voltara-connect-push',
 body:='{"action":"drain"}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-voltara-worker-token',ticket),timeout_milliseconds:=20000) into request_id;
 return request_id;
end $$;
revoke all on function voltara_chat_private.kick_push(boolean) from public,anon,authenticated;
-- Remove the previous reusable worker credential now that it is no longer accepted.
delete from vault.secrets where name='voltara_connect_worker_v1';
select cron.schedule('voltara-connect-push-retry','* * * * *','select voltara_chat_private.kick_push(false)');
commit;
