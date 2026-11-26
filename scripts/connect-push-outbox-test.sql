\set ON_ERROR_STOP on
begin;
insert into public.voltara_chat_push_devices(endpoint,user_id,household_id,peer_id,p256dh,auth_secret)
values('https://fcm.googleapis.com/fcm/send/fixture','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',repeat('A',87),repeat('B',22));
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
insert into public.voltara_chat_messages(id,household_id,sender_id,recipient_id,ciphertext)
values('30000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',repeat('A',80));
do $$begin
 if public.voltara_chat_unread('20000000-0000-4000-8000-000000000001')<>0 then raise exception 'Sender unread incorrect';end if;
 begin perform count(*) from public.voltara_chat_push_outbox;raise exception 'Outbox exposed';exception when insufficient_privilege then null;end;
 begin perform public.voltara_push_claim(null);raise exception 'Claim exposed';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$begin if public.voltara_chat_unread('20000000-0000-4000-8000-000000000001')<>1 then raise exception 'Recipient unread incorrect';end if;end$$;
reset role;
set local role service_role;
do $$declare j record;begin
 if (select count(*) from public.voltara_chat_push_outbox)<>1 then raise exception 'Atomic enqueue missing';end if;
 select * into j from public.voltara_push_claim(null);
 if j.message_id is null or j.attempts<>1 then raise exception 'Claim failed';end if;
 if exists(select 1 from public.voltara_push_claim(null)) then raise exception 'Duplicate lease';end if;
 perform public.voltara_push_finish(j.message_id,j.endpoint,j.lease_id,false,false);
 if exists(select 1 from public.voltara_push_claim(null)) then raise exception 'Backoff failed';end if;
 update public.voltara_chat_push_outbox set next_attempt=now()-interval '1 second';
 select * into j from public.voltara_push_claim(null);
 if j.attempts<>2 then raise exception 'Retry failed';end if;
 perform public.voltara_push_finish(j.message_id,j.endpoint,j.lease_id,true,false);
 if exists(select 1 from public.voltara_push_claim(null)) then raise exception 'Completed job repeated';end if;
end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
insert into public.voltara_chat_receipts(message_id,household_id,reader_id)
values('30000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
do $$begin if public.voltara_chat_unread('20000000-0000-4000-8000-000000000001')<>0 then raise exception 'Receipt unread incorrect';end if;end$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$begin if public.voltara_chat_unread('20000000-0000-4000-8000-000000000001')<>0 then raise exception 'Unread leak';end if;end$$;
rollback;
\echo PASS: atomic outbox, leases, retry, completion, private unread count
