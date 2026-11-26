\set ON_ERROR_STOP on
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$begin
 begin perform count(*) from public.voltara_chat_push_devices;raise exception 'Subscription leak';exception when insufficient_privilege then null;end;
 begin perform count(*) from public.voltara_chat_push_deliveries;raise exception 'Delivery leak';exception when insufficient_privilege then null;end;
 begin insert into public.voltara_chat_push_devices(endpoint,user_id,household_id,peer_id,p256dh,auth_secret) values('https://fcm.googleapis.com/fcm/send/test','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',repeat('A',87),repeat('B',22));raise exception 'Direct device write';exception when insufficient_privilege then null;end;
end$$;
reset role;
set local role anon;
do $$begin
 begin perform count(*) from public.voltara_chat_push_devices;raise exception 'Anon subscription leak';exception when insufficient_privilege then null;end;
end$$;
reset role;
set local role service_role;
insert into public.voltara_chat_push_devices(endpoint,user_id,household_id,peer_id,p256dh,auth_secret) values('https://fcm.googleapis.com/fcm/send/test','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',repeat('A',87),repeat('B',22));
do $$begin if (select count(*) from public.voltara_chat_push_devices)<>1 then raise exception 'Service role denied';end if;end$$;
rollback;
\echo PASS: push subscription and delivery metadata restricted to server role
