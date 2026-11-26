-- STAGED: enable private realtime presence only after staging authorization tests.
-- In Supabase Realtime settings disable public access before setting VITE_VOLTARA_PRIVATE_PRESENCE=true.
begin;
create policy voltara_presence_read on realtime.messages for select to authenticated
using (extension='presence' and coalesce(auth.jwt()->>'is_anonymous','false')<>'true' and exists(
  select 1 from public.voltara_members m where m.user_id=(select auth.uid())
  and (select realtime.topic())='voltara:presence:'||m.household_id::text
));
create policy voltara_presence_track on realtime.messages for insert to authenticated
with check (extension='presence' and coalesce(auth.jwt()->>'is_anonymous','false')<>'true' and exists(
  select 1 from public.voltara_members m where m.user_id=(select auth.uid())
  and (select realtime.topic())='voltara:presence:'||m.household_id::text
));
commit;
