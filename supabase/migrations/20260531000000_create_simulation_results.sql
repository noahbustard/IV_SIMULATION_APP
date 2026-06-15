create extension if not exists pgcrypto;

create table if not exists public.simulation_results (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
  run_type text not null check (run_type in ('training', 'official')),
  run_type_label text not null,
  saved_at timestamptz not null,
  consent_accepted_at text,
  participant_id text not null,
  age text,
  gender text,
  level_of_nursing text,
  area_of_nursing text,
  years_of_nursing_experience text,
  medication text not null,
  administration_time_source text not null
    check (administration_time_source in ('Administration Instructions', 'Additional Drug Information')),
  administration_time_seconds numeric not null,
  required_minimum_administration_time_seconds integer not null,
  compliance_status text not null,
  viewed_additional_drug_information text not null check (viewed_additional_drug_information in ('Yes', 'No')),
  completed_at text not null,
  created_at timestamptz not null default now(),
  constraint simulation_results_run_medication_unique unique (run_id, medication)
);

alter table public.simulation_results enable row level security;

grant usage on schema public to service_role;
grant select, insert, update on public.simulation_results to service_role;

create index if not exists simulation_results_run_type_saved_at_idx
  on public.simulation_results (run_type, saved_at);

create index if not exists simulation_results_participant_id_idx
  on public.simulation_results (participant_id);
