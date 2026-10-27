-- Monitor Cirúrgico — 27/10/2026: controle das caixas, bags e sacolas
--   • etapa "Em limpeza" entre o retorno e ficar disponível
--   • quem levou e nº do lacre na saída
--   • valor de reposição por tipo (cobrança das que não voltaram)
--   • conferência de estoque (inventário) guardada
-- Rodar no SQL Editor de CADA projeto (Campo Grande e Cuiabá). Pode rodar mais de uma vez.
alter table public.caixas_bags drop constraint if exists caixas_bags_status_check;
alter table public.caixas_bags add constraint caixas_bags_status_check check (status in ('Disponível', 'Fora', 'Pendente', 'Em limpeza', 'Manutenção', 'Baixada'));
alter table public.caixas_bags add column if not exists levado_por text;
alter table public.caixas_bags add column if not exists lacre text;
alter table public.caixas_bags_mov add column if not exists levado_por text;
alter table public.caixas_bags_mov add column if not exists lacre text;

create table if not exists public.caixas_bags_valor (
  filial        text not null,
  tipo          text not null,
  valor         numeric(12,2) not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (filial, tipo)
);

create table if not exists public.caixas_bags_inventario (
  id          uuid primary key default gen_random_uuid(),
  filial      text,
  feito_em    timestamptz not null default now(),
  feito_por   text,
  esperadas   int,
  conferidas  jsonb not null default '[]'::jsonb,   -- códigos bipados
  faltando    jsonb not null default '[]'::jsonb,   -- deveriam estar no estoque e não foram bipadas
  sobrando    jsonb not null default '[]'::jsonb,   -- bipadas, mas o sistema dizia que estavam fora
  obs         text
);
create index if not exists caixas_bags_inventario_data on public.caixas_bags_inventario (feito_em desc);

do $$ declare t text; begin
  foreach t in array array['caixas_bags_valor', 'caixas_bags_inventario'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', t || '_write', t);
  end loop; end $$;
notify pgrst, 'reload schema';
select 'ok' as caixas_controle;
