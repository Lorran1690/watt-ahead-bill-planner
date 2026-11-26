-- Executed against a disposable PostgreSQL fixture, not production.
\set ON_ERROR_STOP on
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$begin
 if public.voltara_chat_peer('20000000-0000-4000-8000-000000000001') is distinct from '10000000-0000-4000-8000-000000000002'::uuid then raise exception 'Peer lookup failed';end if;
 if public.voltara_chat_peer('20000000-0000-4000-8000-000000000002') is not null then raise exception 'Peer leak';end if;
end$$;
insert into public.voltara_chat_messages(id,household_id,sender_id,recipient_id,ciphertext,has_media) values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',repeat('A',80),true);
insert into storage.objects(bucket_id,name) values('voltara-connect-private','20000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000001');
do $$begin
 begin
 insert into public.voltara_chat_messages(id,household_id,sender_id,recipient_id,ciphertext) values('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',repeat('A',80));
 raise exception 'Forged sender accepted';
 exception when insufficient_privilege then null;end;
 begin
 insert into public.voltara_chat_receipts(message_id,household_id,reader_id) values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
 raise exception 'Forged receipt accepted';exception when insufficient_privilege then null;end;
 begin
 update public.voltara_chat_messages set ciphertext=repeat('B',80);
 raise exception 'Message mutation allowed';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$begin
 if (select count(*) from public.voltara_chat_messages)<>1 or (select count(*) from storage.objects)<>1 then raise exception 'Recipient cannot read';end if;
end$$;
insert into public.voltara_chat_receipts(message_id,household_id,reader_id) values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
insert into public.voltara_chat_typing(household_id,user_id,peer_id) values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001') on conflict(household_id,user_id,peer_id) do update set user_id=excluded.user_id,household_id=excluded.household_id,peer_id=excluded.peer_id;
do $$begin
 begin
 insert into storage.objects(bucket_id,name) values('voltara-connect-private','20000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000002');
 raise exception 'Forged upload accepted';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$begin
 if (select count(*) from public.voltara_chat_messages)<>0 or (select count(*) from public.voltara_chat_receipts)<>0 or (select count(*) from public.voltara_chat_typing)<>0 or (select count(*) from storage.objects)<>0 then raise exception 'Outsider access';end if;
 begin
 insert into public.voltara_chat_messages(id,household_id,sender_id,recipient_id,ciphertext) values('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',repeat('A',80));
 raise exception 'Outsider write';exception when insufficient_privilege then null;end;
end$$;
reset role;
delete from public.voltara_members where user_id='10000000-0000-4000-8000-000000000002';
insert into public.voltara_members values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
do $$begin
 if (select count(*) from public.voltara_chat_messages)<>0 or (select count(*) from storage.objects)<>0 then raise exception 'New member sees previous pair';end if;
end$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$begin
 if (select count(*) from public.voltara_chat_messages)<>0 or (select count(*) from storage.objects)<>0 then raise exception 'Former member retained access';end if;
end$$;
reset role;
set local role anon;
do $$begin
 begin perform count(*) from public.voltara_chat_messages;raise exception 'Anon read';exception when insufficient_privilege then null;end;
 begin perform public.voltara_chat_peer('20000000-0000-4000-8000-000000000001');raise exception 'Anon RPC';exception when insufficient_privilege then null;end;
end$$;
rollback;
\echo PASS: isolated PostgreSQL RLS pair, sender, recipient, receipts, typing, storage path, outsiders, replaced members and anonymous role
