-- Voltara: backend exclusivo para sincronização familiar.
-- Execute APENAS em um NOVO projeto Supabase do Voltara (NÃO no Hangar One).
-- SQL de instalação preparado para revisão e aplicação após escolher o projeto.
-- Segurança: login Supabase Auth + RLS + convite aleatório de uso único + máximo 2 membros.

begin;

create schema if not exists voltara_private;
revoke all on schema voltara_private from public, anon, authenticated;

create table if not exists public.voltara_households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Nossa casa' check (char_length(name) between 1 and 80),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.voltara_members (
  household_id uuid not null references public.voltara_households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (household_id,user_id),
  unique (user_id)
);
create table if not exists public.voltara_records (
  household_id uuid not null references public.voltara_households(id) on delete cascade,
  kind text not null check (kind in ('meta','appliance','bill','expense')),
  record_key text not null check (length(record_key) between 1 and 80),
  document jsonb not null check (
    jsonb_typeof(document) = 'object' and octet_length(document::text) < 65536
  ),
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (household_id,kind,record_key)
);
create index if not exists voltara_records_household_idx
  on public.voltara_records(household_id,kind,updated_at desc);
create table if not exists voltara_private.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.voltara_households(id) on delete cascade,
  code_hash text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  used_by uuid references auth.users(id)
);

alter table public.voltara_households enable row level security;
alter table public.voltara_members enable row level security;
alter table public.voltara_records enable row level security;

revoke all on public.voltara_households, public.voltara_members, public.voltara_records
  from anon, authenticated;
grant select on public.voltara_households to authenticated;
grant select on public.voltara_members to authenticated;
grant select,insert,update,delete on public.voltara_records to authenticated;

create policy voltara_household_read on public.voltara_households
for select to authenticated using (
  exists (select 1 from public.voltara_members as m
    where m.household_id=id and m.user_id=(select auth.uid()))
);
create policy voltara_member_read_own on public.voltara_members
for select to authenticated using (user_id=(select auth.uid()));
create policy voltara_record_read on public.voltara_records
for select to authenticated using (
  exists (select 1 from public.voltara_members as m
    where m.household_id=voltara_records.household_id and m.user_id=(select auth.uid()))
);
create policy voltara_record_insert on public.voltara_records
for insert to authenticated with check (
  updated_by=(select auth.uid()) and
  exists (select 1 from public.voltara_members as m
    where m.household_id=voltara_records.household_id and m.user_id=(select auth.uid()))
);
create policy voltara_record_update on public.voltara_records
for update to authenticated
using (
  exists (select 1 from public.voltara_members as m
    where m.household_id=voltara_records.household_id and m.user_id=(select auth.uid()))
)
with check (
  updated_by=(select auth.uid()) and
  exists (select 1 from public.voltara_members as m
    where m.household_id=voltara_records.household_id and m.user_id=(select auth.uid()))
);
create policy voltara_record_delete on public.voltara_records
for delete to authenticated using (
  exists (select 1 from public.voltara_members as m
    where m.household_id=voltara_records.household_id and m.user_id=(select auth.uid()))
);

-- Não dar INSERT direto para households/members; a criação passa por funções auditáveis.
create or replace function public.voltara_create_household(p_name text default 'Nossa casa')
returns uuid
language plpgsql security definer
set search_path=''
as $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then
    raise exception 'Faça login com um e-mail confirmado.' using errcode='42501';
  end if;
  if p_name is null or length(trim(p_name))<1 or length(p_name)>80 then
    raise exception 'Nome da casa inválido.';
  end if;
  if exists(select 1 from public.voltara_members where user_id=v_user) then
    raise exception 'Este usuário já participa de uma casa.';
  end if;
  insert into public.voltara_households(name,owner_id) values(trim(p_name),v_user)
    returning id into v_id;
  insert into public.voltara_members(household_id,user_id,role)
    values(v_id,v_user,'owner');
  return v_id;
end;
$$;

create or replace function public.voltara_issue_invite(p_household uuid)
returns text
language plpgsql security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_code text; v_total int;
begin
  if v_user is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then
    raise exception 'Login necessário.' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.voltara_members
    where household_id=p_household and user_id=v_user and role='owner'
  ) then
    raise exception 'Somente o titular pode gerar o convite.' using errcode='42501';
  end if;
  select count(*) into v_total from public.voltara_members where household_id=p_household;
  if v_total>=2 then raise exception 'Esta casa já possui duas pessoas.'; end if;
  delete from voltara_private.invites
    where household_id=p_household and used_at is null;
  -- 2 UUIDs aleatórios = token de 64 caracteres (alto espaço de busca).
  v_code:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into voltara_private.invites(household_id,code_hash,created_by)
    values(p_household,encode(sha256(convert_to(v_code,'UTF8')),'hex'),v_user);
  return v_code;
end;
$$;

create or replace function public.voltara_join_household(p_code text)
returns uuid
language plpgsql security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_invite record; v_members int;
begin
  if v_user is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then
    raise exception 'Login necessário.' using errcode='42501';
  end if;
  if p_code is null or p_code !~ '^[a-f0-9]{64}$' then
    raise exception 'Convite inválido.';
  end if;
  if exists(select 1 from public.voltara_members where user_id=v_user) then
    raise exception 'Você já participa de uma casa.';
  end if;
  select * into v_invite from voltara_private.invites
    where code_hash=encode(sha256(convert_to(p_code,'UTF8')),'hex')
    and used_at is null and expires_at>now()
    for update;
  if not found then raise exception 'Convite inválido ou expirado.'; end if;
  select count(*) into v_members from public.voltara_members
    where household_id=v_invite.household_id;
  if v_members>=2 then raise exception 'Esta casa já possui duas pessoas.'; end if;
  insert into public.voltara_members(household_id,user_id,role)
    values(v_invite.household_id,v_user,'member');
  update voltara_private.invites set used_at=now(),used_by=v_user
    where id=v_invite.id;
  return v_invite.household_id;
end;
$$;

create or replace function public.voltara_remove_member(p_household uuid, p_member uuid)
returns void
language plpgsql security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.voltara_members
    where household_id=p_household and user_id=auth.uid() and role='owner'
  ) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_member=auth.uid() then raise exception 'O titular não pode remover a si próprio.'; end if;
  delete from public.voltara_members
    where household_id=p_household and user_id=p_member and role='member';
end;
$$;

revoke all on function public.voltara_create_household(text) from public, anon;
revoke all on function public.voltara_issue_invite(uuid) from public, anon;
revoke all on function public.voltara_join_household(text) from public, anon;
revoke all on function public.voltara_remove_member(uuid,uuid) from public, anon;
grant execute on function public.voltara_create_household(text) to authenticated;
grant execute on function public.voltara_issue_invite(uuid) to authenticated;
grant execute on function public.voltara_join_household(text) to authenticated;
grant execute on function public.voltara_remove_member(uuid,uuid) to authenticated;

create or replace function public.voltara_touch_record()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger voltara_touch_record_before_update
before update on public.voltara_records
for each row execute function public.voltara_touch_record();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='voltara_records'
  ) then alter publication supabase_realtime add table public.voltara_records; end if;
end $$;

commit;

-- VERIFICAR APÓS INSTALAÇÃO:
-- 1. RLS ligado nas 3 tabelas public.voltara_*.
-- 2. anon NÃO consegue ler registros nem chamar funções RPC.
-- 3. Usuário autenticado sem membership NÃO vê nem altera registros.
-- 4. Duas contas da MESMA casa leem e escrevem registros.
-- 5. Convites expiram em 7 dias, são de uso único e no máximo 2 usuários entram.
-- 6. Adicionar a URL /compartilhar em Auth > URL Configuration > Redirect URLs.
-- 7. Habilitar E-mail/Magic Link; configurar SMTP próprio se volume exigir.
