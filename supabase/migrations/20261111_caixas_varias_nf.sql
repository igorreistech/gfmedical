-- a mesma caixa/bag/sacola pode levar várias cirurgias/NFs (além da principal em proc_id_atual/nf_atual)
alter table public.caixas_bags add column if not exists procs_extra jsonb not null default '[]'::jsonb;
notify pgrst, 'reload schema';
