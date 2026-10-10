-- Controle de Fretes: histórico da calculadora de frete.
-- Rodar no SQL Editor de CADA projeto Supabase de filial (Cuiabá e Campo Grande).

create table if not exists public.frete_calculos (
  id                uuid primary key default gen_random_uuid(),
  valor_mercadoria  numeric(14,2) not null,
  opcoes            jsonb not null default '[]',  -- [{transportadora, frete, prazo, pct}]
  melhor_transportadora text,
  melhor_frete      numeric(12,2),
  melhor_pct        numeric(8,6),
  observacao        text,
  filial            text not null,
  criado_por        text,
  criado_em         timestamptz not null default now()
);
create index if not exists frete_calculos_filial_data on public.frete_calculos (filial, criado_em desc);

-- Mesmo modelo das outras tabelas: logado lê; papel "visualizacao" não escreve.
alter table public.frete_calculos enable row level security;
drop policy if exists frete_calculos_select on public.frete_calculos;
drop policy if exists frete_calculos_write on public.frete_calculos;
create policy frete_calculos_select on public.frete_calculos for select to authenticated using (true);
create policy frete_calculos_write on public.frete_calculos for all to authenticated
  using (not exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role = 'visualizacao'))
  with check (not exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role = 'visualizacao'));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'frete_calculos') then
    alter publication supabase_realtime add table public.frete_calculos;
  end if;
end $$;

notify pgrst, 'reload schema';
