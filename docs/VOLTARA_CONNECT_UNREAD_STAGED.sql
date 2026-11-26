begin;
create or replace function public.voltara_chat_unread(h uuid)
returns bigint language sql stable security invoker set search_path='' as $$
 select count(*) from public.voltara_chat_messages m
 where m.household_id=h and m.recipient_id=(select auth.uid())
 and not exists(select 1 from public.voltara_chat_receipts r where r.message_id=m.id)
$$;
revoke all on function public.voltara_chat_unread(uuid) from public,anon,authenticated;
grant execute on function public.voltara_chat_unread(uuid) to authenticated;
create index if not exists voltara_chat_unread_recipient_idx on public.voltara_chat_messages(household_id,recipient_id);
commit;
