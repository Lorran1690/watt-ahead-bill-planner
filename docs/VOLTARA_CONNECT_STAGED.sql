-- STAGED ONLY. Apply to isolated Supabase staging before production.
begin;
create schema if not exists voltara_chat_private;
revoke all on schema voltara_chat_private from public,anon,authenticated;
grant usage on schema voltara_chat_private to authenticated;

-- Exact current pair; old/new members cannot read a previous pair's conversation.
create function voltara_chat_private.pair_allowed(h uuid,a uuid,b uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and coalesce(auth.jwt()->>'is_anonymous','false')<>'true'
 and a<>b and auth.uid() in (a,b)
 and exists(select 1 from public.voltara_members where household_id=h and user_id=a)
 and exists(select 1 from public.voltara_members where household_id=h and user_id=b)
$$;
revoke all on function voltara_chat_private.pair_allowed(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function voltara_chat_private.pair_allowed(uuid,uuid,uuid) to authenticated;
create function voltara_chat_private.peer(h uuid)
returns uuid language sql stable security definer set search_path='' as $$
 select m.user_id from public.voltara_members m
 where m.household_id=h and m.user_id<>auth.uid()
 and voltara_chat_private.pair_allowed(h,auth.uid(),m.user_id)
 limit 1
$$;
revoke all on function voltara_chat_private.peer(uuid) from public,anon,authenticated;
grant execute on function voltara_chat_private.peer(uuid) to authenticated;
create function public.voltara_chat_peer(h uuid) returns uuid language sql stable security invoker set search_path='' as $$
 select voltara_chat_private.peer(h)
$$;
revoke all on function public.voltara_chat_peer(uuid) from public,anon,authenticated;
grant execute on function public.voltara_chat_peer(uuid) to authenticated;

create table public.voltara_chat_messages (
 id uuid primary key,
 household_id uuid not null references public.voltara_households(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 ciphertext text not null check(length(ciphertext) between 40 and 24000 and ciphertext ~ '^[A-Za-z0-9+/=]+$'),
 has_media boolean not null default false,
 check(sender_id<>recipient_id)
);
create index voltara_chat_messages_pair_time on public.voltara_chat_messages(household_id,created_at desc,id desc);
alter table public.voltara_chat_messages enable row level security;
revoke all on public.voltara_chat_messages from public,anon,authenticated;
grant select on public.voltara_chat_messages to authenticated;
grant insert(id,household_id,sender_id,recipient_id,ciphertext,has_media) on public.voltara_chat_messages to authenticated;
create policy voltara_chat_read on public.voltara_chat_messages for select to authenticated
 using(voltara_chat_private.pair_allowed(household_id,sender_id,recipient_id));
create policy voltara_chat_send on public.voltara_chat_messages for insert to authenticated
 with check(sender_id=auth.uid() and voltara_chat_private.pair_allowed(household_id,sender_id,recipient_id));

create table public.voltara_chat_receipts (
 message_id uuid primary key references public.voltara_chat_messages(id) on delete cascade,
 household_id uuid not null references public.voltara_households(id) on delete cascade,
 reader_id uuid not null references auth.users(id) on delete cascade,
 read_at timestamptz not null default now()
);
alter table public.voltara_chat_receipts enable row level security;
revoke all on public.voltara_chat_receipts from public,anon,authenticated;
grant select on public.voltara_chat_receipts to authenticated;
grant insert(message_id,household_id,reader_id) on public.voltara_chat_receipts to authenticated;
create policy voltara_chat_receipt_read on public.voltara_chat_receipts for select to authenticated
 using(exists(select 1 from public.voltara_chat_messages m where m.id=message_id and m.household_id=voltara_chat_receipts.household_id and m.recipient_id=reader_id));
create policy voltara_chat_receipt_write on public.voltara_chat_receipts for insert to authenticated
 with check(reader_id=auth.uid() and exists(select 1 from public.voltara_chat_messages m where m.id=message_id and m.household_id=voltara_chat_receipts.household_id and m.recipient_id=reader_id));
create index voltara_chat_receipt_house on public.voltara_chat_receipts(household_id);

-- Typing is voluntary and transient; no plaintext or keystrokes.
create table public.voltara_chat_typing (
 household_id uuid not null references public.voltara_households(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 peer_id uuid not null references auth.users(id) on delete cascade,
 touched_at timestamptz not null default now(),
 primary key(household_id,user_id,peer_id)
);
alter table public.voltara_chat_typing enable row level security;
revoke all on public.voltara_chat_typing from public,anon,authenticated;
grant select on public.voltara_chat_typing to authenticated;
grant insert(household_id,user_id,peer_id),update(user_id) on public.voltara_chat_typing to authenticated;
create policy voltara_chat_typing_read on public.voltara_chat_typing for select to authenticated using(voltara_chat_private.pair_allowed(household_id,user_id,peer_id));
create policy voltara_chat_typing_insert on public.voltara_chat_typing for insert to authenticated with check(user_id=auth.uid() and voltara_chat_private.pair_allowed(household_id,user_id,peer_id));
create policy voltara_chat_typing_update on public.voltara_chat_typing for update to authenticated using(user_id=auth.uid() and voltara_chat_private.pair_allowed(household_id,user_id,peer_id)) with check(user_id=auth.uid() and voltara_chat_private.pair_allowed(household_id,user_id,peer_id));
create function voltara_chat_private.typing_clock() returns trigger language plpgsql set search_path='' as $$ begin new.touched_at=now(); return new; end; $$;
revoke all on function voltara_chat_private.typing_clock() from public,anon,authenticated;
create trigger voltara_chat_typing_clock before insert or update on public.voltara_chat_typing for each row execute function voltara_chat_private.typing_clock();

-- Private, encrypted blobs. Path: household/sender/recipient/message-id.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('voltara-connect-private','voltara-connect-private',false,2097180,array['application/octet-stream']);
create function voltara_chat_private.path_allowed(n text,write_access boolean)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare p text[]:=string_to_array(n,'/');
begin
 if array_length(p,1)<>4 or n !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$' then return false; end if;
 return voltara_chat_private.pair_allowed(p[1]::uuid,p[2]::uuid,p[3]::uuid)
 and (not write_access or p[2]::uuid=auth.uid());
exception when invalid_text_representation then return false;
end; $$;
revoke all on function voltara_chat_private.path_allowed(text,boolean) from public,anon,authenticated;
grant execute on function voltara_chat_private.path_allowed(text,boolean) to authenticated;
create policy voltara_connect_media_read on storage.objects for select to authenticated
 using(bucket_id='voltara-connect-private' and voltara_chat_private.path_allowed(name,false));
create policy voltara_connect_media_send on storage.objects for insert to authenticated
 with check(bucket_id='voltara-connect-private' and voltara_chat_private.path_allowed(name,true));
-- No update, public URL, or overwrite permitted.
alter publication supabase_realtime add table public.voltara_chat_messages,public.voltara_chat_receipts,public.voltara_chat_typing;
commit;
