-- Extend the existing server-only usage ledger; existing RLS/grants stay intact.
begin;
alter table public.mosaic_generations drop constraint if exists mosaic_generations_operation_check;
alter table public.mosaic_generations add constraint mosaic_generations_operation_check
  check(operation in ('master','edit','harmonize','sam3','chat','object-intent','scene-intent','option-name','classify','edit-context','reveal-context','object-map'));
alter table public.mosaic_generations add column if not exists usage_details jsonb;
commit;
