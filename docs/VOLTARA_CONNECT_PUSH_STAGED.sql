-- Optional push layer. Do not deploy until the Edge Function, VAPID keys and security tests are ready.
begin;
create table public.voltara_chat_push_devices(
 endpoint text primary key check(length(endpoint) between 20 and 2048),
 user_id uuid not null references auth.users(id) on delete cascade,
 household_id uuid not null references public.voltara_households(id) on delete cascade,
 peer_id uuid not null references auth.users(id) on delete cascade,
 p256dh text not null check(length(p256dh) between 80 and 100),
 auth_secret text not null check(length(auth_secret) between 20 and 30),
 created_at timestamptz not null default now()
);
alter table public.voltara_chat_push_devices enable row level security;
revoke all on public.voltara_chat_push_devices from public,anon,authenticated;
grant select,insert,update,delete on public.voltara_chat_push_devices to service_role;
create index voltara_chat_push_user on public.voltara_chat_push_devices(user_id,household_id,peer_id);
create table public.voltara_chat_push_deliveries(
 message_id uuid primary key references public.voltara_chat_messages(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.voltara_chat_push_deliveries enable row level security;
revoke all on public.voltara_chat_push_deliveries from public,anon,authenticated;
grant insert on public.voltara_chat_push_deliveries to service_role;
commit;
