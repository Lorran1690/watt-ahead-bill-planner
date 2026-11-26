-- STAGED: do not apply until the financial branch passes tests and release is approved.
-- Extends existing record type without touching previous data or changing RLS.
begin;
alter table public.voltara_records drop constraint voltara_records_kind_check;
alter table public.voltara_records add constraint voltara_records_kind_check check (kind in ('meta','appliance','bill','expense','water_bill','finance'));
alter table public.voltara_records add constraint voltara_finance_document_check check (kind <> 'finance' or (
  document->>'id' is not null and document->>'id'=record_key and
  coalesce(document->>'type','') in ('income','budget','payable','card','purchase','settlement','expense-category','shopping','maintenance','meter')
));
commit;
