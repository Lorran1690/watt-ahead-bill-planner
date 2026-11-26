-- Dedicated credentials generated and stored in Vault. Never return secrets to clients.
begin;
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'voltara_connect_worker_v1','Voltara Connect scheduler authentication')
where not exists(select 1 from vault.secrets where name='voltara_connect_worker_v1');

create function public.voltara_push_vapid(p_public text,p_private text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare existing jsonb;
begin
 perform pg_advisory_xact_lock(724982531);
 select decrypted_secret::jsonb into existing from vault.decrypted_secrets where name='voltara_connect_vapid_v1';
 if existing is null then
  if p_public is null or p_private is null or p_public !~ '^[A-Za-z0-9_-]{87}$' or p_private !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'Invalid VAPID candidate';end if;
  existing:=jsonb_build_object('publicKey',p_public,'privateKey',p_private);
  perform vault.create_secret(existing::text,'voltara_connect_vapid_v1','Voltara Connect VAPID');
 end if;
 return existing;
end $$;
revoke all on function public.voltara_push_vapid(text,text) from public,anon,authenticated;
grant execute on function public.voltara_push_vapid(text,text) to service_role;

create function public.voltara_push_worker_authorized(p_token text)
returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce(length(p_token)=64 and exists(select 1 from vault.decrypted_secrets where name='voltara_connect_worker_v1' and decrypted_secret=p_token),false)
$$;
revoke all on function public.voltara_push_worker_authorized(text) from public,anon,authenticated;
grant execute on function public.voltara_push_worker_authorized(text) to service_role;
commit;
