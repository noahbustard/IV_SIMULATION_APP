alter table public.simulation_results
  add column if not exists administration_time_source text;

update public.simulation_results
set administration_time_source = case
  when medication ilike 'ondansetron%'
    or medication ilike 'furosemide%'
    or medication ilike 'pantoprazole%'
    or medication ilike 'bumetanide%'
    or medication ilike 'phenytoin%'
    then 'Administration Instructions'
  else 'Additional Drug Information'
end
where administration_time_source is null;

alter table public.simulation_results
  alter column administration_time_source set not null;

alter table public.simulation_results
  drop constraint if exists simulation_results_administration_time_source_check;

alter table public.simulation_results
  add constraint simulation_results_administration_time_source_check
  check (administration_time_source in ('Administration Instructions', 'Additional Drug Information'));
