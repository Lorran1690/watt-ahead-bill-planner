-- Aplicar uma única vez no projeto Voltara existente, após verificar faturas duplicadas.
begin;
-- Preserve existing records; abort if duplicate monthly bills already exist.
create unique index if not exists voltara_one_monthly_bill on public.voltara_records(household_id,kind,(document->>'month')) where kind in ('bill','water_bill');
create index if not exists voltara_households_owner_idx on public.voltara_households(owner_id);
create index if not exists voltara_records_updated_by_idx on public.voltara_records(updated_by);
create index if not exists voltara_invites_created_by_idx on voltara_private.invites(created_by);
create index if not exists voltara_invites_household_idx on voltara_private.invites(household_id);
create index if not exists voltara_invites_used_by_idx on voltara_private.invites(used_by);

-- Preserve public RPC signatures, move elevated functions outside the exposed API schema.
create schema if not exists voltara_rpc_private;
revoke all on schema voltara_rpc_private from public, anon, authenticated;
grant usage on schema voltara_rpc_private to authenticated;
alter function public.voltara_create_household(text) set schema voltara_rpc_private;
alter function public.voltara_issue_invite(uuid) set schema voltara_rpc_private;
alter function public.voltara_join_household(text) set schema voltara_rpc_private;
alter function public.voltara_remove_member(uuid,uuid) set schema voltara_rpc_private;

create or replace function voltara_rpc_private.voltara_issue_invite(p_household uuid)
returns text language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_code text;
begin
 if v_user is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Login necessário.' using errcode='42501'; end if;
 -- Serialize invitation creation and acceptance using the household row.
 perform 1 from public.voltara_households where id=p_household and owner_id=v_user for update;
 if not found or not exists(select 1 from public.voltara_members where household_id=p_household and user_id=v_user and role='owner') then raise exception 'Somente o titular pode gerar o convite.' using errcode='42501'; end if;
 if (select count(*) from public.voltara_members where household_id=p_household)>=2 then raise exception 'Esta casa já possui duas pessoas.'; end if;
 delete from voltara_private.invites where household_id=p_household and used_at is null;
 v_code:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into voltara_private.invites(household_id,code_hash,created_by) values(p_household,encode(sha256(convert_to(v_code,'UTF8')),'hex'),v_user);
 return v_code;
end; $$;

create or replace function voltara_rpc_private.voltara_join_household(p_code text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_house uuid; v_invite record; v_hash text;
begin
 if v_user is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Login necessário.' using errcode='42501'; end if;
 if p_code is null or p_code !~ '^[a-f0-9]{64}$' then raise exception 'Convite inválido.'; end if;
 if exists(select 1 from public.voltara_members where user_id=v_user) then raise exception 'Você já participa de uma casa.'; end if;
 v_hash:=encode(sha256(convert_to(p_code,'UTF8')),'hex');
 select household_id into v_house from voltara_private.invites where code_hash=v_hash and used_at is null and expires_at>now();
 if not found then raise exception 'Convite inválido ou expirado.'; end if;
 perform 1 from public.voltara_households where id=v_house for update;
 if not found then raise exception 'Casa indisponível.'; end if;
 -- Recheck token after acquiring household lock, in the same order as issuing.
 select * into v_invite from voltara_private.invites where code_hash=v_hash and household_id=v_house and used_at is null and expires_at>now() for update;
 if not found then raise exception 'Convite inválido ou expirado.'; end if;
 if (select count(*) from public.voltara_members where household_id=v_house)>=2 then raise exception 'Esta casa já possui duas pessoas.'; end if;
 insert into public.voltara_members(household_id,user_id,role) values(v_house,v_user,'member');
 update voltara_private.invites set used_at=now(),used_by=v_user where id=v_invite.id;
 return v_house;
end; $$;

create function public.voltara_create_household(p_name text default 'Nossa casa') returns uuid language sql security invoker set search_path='' as $$ select voltara_rpc_private.voltara_create_household(p_name); $$;
create function public.voltara_issue_invite(p_household uuid) returns text language sql security invoker set search_path='' as $$ select voltara_rpc_private.voltara_issue_invite(p_household); $$;
create function public.voltara_join_household(p_code text) returns uuid language sql security invoker set search_path='' as $$ select voltara_rpc_private.voltara_join_household(p_code); $$;
create function public.voltara_remove_member(p_household uuid,p_member uuid) returns void language sql security invoker set search_path='' as $$ select voltara_rpc_private.voltara_remove_member(p_household,p_member); $$;
revoke all on all functions in schema voltara_rpc_private from public, anon, authenticated;
grant execute on all functions in schema voltara_rpc_private to authenticated;
revoke all on function public.voltara_create_household(text),public.voltara_issue_invite(uuid),public.voltara_join_household(text),public.voltara_remove_member(uuid,uuid) from public,anon,authenticated;
grant execute on function public.voltara_create_household(text),public.voltara_issue_invite(uuid),public.voltara_join_household(text),public.voltara_remove_member(uuid,uuid) to authenticated;
commit;
